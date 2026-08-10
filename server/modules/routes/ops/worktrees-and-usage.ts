import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { RuntimeContext } from "../../../types/runtime-context.ts";
import { hasValidCsrfToken, shouldRequireCsrf } from "../../../security/auth.ts";
import type { CliUsageEntry } from "../shared/types.ts";
import {
  WorkspaceReleaseError,
  reconcileReleasedTaskWorktree,
  releaseTaskWorktree,
  workspaceReleaseProofHash,
  workspaceReleaseReceiptMatches,
  type WorkspaceReleaseProof,
  type WorkspaceReleaseReceipt,
} from "../../workflow/core/worktree/release.ts";

const WORKSPACE_RELEASE_RECEIPT_PREFIX = "Workspace release receipt: ";
const WORKSPACE_RELEASE_PREPARED_PREFIX = "Workspace release prepared: ";
const WORKTREE_RECOVERY_BUDGET_MS = 8000;
const WORKTREE_RECOVERY_MAX_TASKS = 256;

function readHermesTaskIdentity(value: unknown): { executionId: string; requestFingerprint: string } | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const root = JSON.parse(value) as {
      hermes_execution?: { contract?: unknown; execution_id?: unknown; request_fingerprint?: unknown };
    };
    const marker = root.hermes_execution;
    if (
      (marker?.contract !== "hermes-claw-execution/v1" && marker?.contract !== "hermes-claw-execution/v2") ||
      typeof marker.execution_id !== "string" ||
      !marker.execution_id ||
      marker.execution_id.trim() !== marker.execution_id ||
      typeof marker.request_fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/u.test(marker.request_fingerprint)
    ) {
      return null;
    }
    return { executionId: marker.execution_id, requestFingerprint: marker.request_fingerprint };
  } catch {
    return null;
  }
}

function readGitLines(cwd: string, args: string[], timeout = 8000): string[] {
  const output = execFileSync("git", args, { cwd, stdio: "pipe", timeout }).toString().trim();
  return output
    ? output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}

function tryReadGitLines(cwd: string, args: string[], timeout = 8000): string[] {
  try {
    return readGitLines(cwd, args, timeout);
  } catch {
    return [];
  }
}

function refExists(cwd: string, ref: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", ref], { cwd, stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

type RecoverableTaskRow = {
  id: string;
  project_path: string | null;
  workflow_meta_json: string | null;
};

type PorcelainWorktree = {
  worktreePath: string;
  head: string | null;
  branchRef: string | null;
};

type RecoveryCandidate = {
  taskId: string;
  projectPath: string;
  canonicalProjectPath: string;
  shortId: string;
};

function parseWorktreeListPorcelain(value: string): PorcelainWorktree[] {
  return value
    .split(/\n\s*\n/u)
    .map((block) => {
      const lines = block.split("\n");
      const worktreeLine = lines.find((line) => line.startsWith("worktree "));
      if (!worktreeLine) return null;
      const headLine = lines.find((line) => line.startsWith("HEAD "));
      const branchLine = lines.find((line) => line.startsWith("branch "));
      return {
        worktreePath: worktreeLine.slice("worktree ".length),
        head: headLine ? headLine.slice("HEAD ".length) : null,
        branchRef: branchLine ? branchLine.slice("branch ".length) : null,
      };
    })
    .filter((entry): entry is PorcelainWorktree => Boolean(entry));
}

function recoverHermesReviewWorktrees(
  db: RuntimeContext["db"],
  taskWorktrees: RuntimeContext["taskWorktrees"],
): void {
  let tasks: RecoverableTaskRow[];
  try {
    tasks = db
      .prepare(
        "SELECT id, project_path, workflow_meta_json FROM tasks WHERE status = 'review' AND workflow_meta_json LIKE '%\"hermes_execution\"%' LIMIT ?",
      )
      .all(WORKTREE_RECOVERY_MAX_TASKS + 1) as RecoverableTaskRow[];
  } catch {
    return;
  }
  if (tasks.length > WORKTREE_RECOVERY_MAX_TASKS) return;

  const candidates: RecoveryCandidate[] = [];
  for (const task of tasks) {
    if (!task.project_path || !readHermesTaskIdentity(task.workflow_meta_json)) continue;
    const shortId = task.id.slice(0, 8);
    if (!/^[a-f0-9]{8}$/u.test(shortId) || !path.isAbsolute(task.project_path)) continue;
    try {
      const projectPath = path.resolve(task.project_path);
      candidates.push({
        taskId: task.id,
        projectPath,
        canonicalProjectPath: fs.realpathSync(projectPath),
        shortId,
      });
    } catch {
      // Invalid project paths are not recoverable.
    }
  }

  const ownershipGroups = new Map<string, RecoveryCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.canonicalProjectPath}\0${candidate.shortId}`;
    const group = ownershipGroups.get(key) ?? [];
    group.push(candidate);
    ownershipGroups.set(key, group);
  }

  const claimedPaths = new Set<string>();
  const claimedBranches = new Set<string>();
  for (const info of taskWorktrees.values()) {
    let canonicalProjectPath: string;
    try {
      canonicalProjectPath = fs.realpathSync(path.resolve(info.projectPath));
      claimedBranches.add(`${canonicalProjectPath}\0${info.branchName}`);
    } catch {
      continue;
    }
    try {
      claimedPaths.add(fs.realpathSync(path.resolve(info.worktreePath)));
    } catch {
      // A missing mapped path still owns its project-scoped branch name.
    }
  }

  const deadline = Date.now() + WORKTREE_RECOVERY_BUDGET_MS;
  const projectCache = new Map<string, PorcelainWorktree[] | null>();
  const inspectProject = (canonicalProjectPath: string): PorcelainWorktree[] | null => {
    if (projectCache.has(canonicalProjectPath)) return projectCache.get(canonicalProjectPath) ?? null;
    const runBounded = (args: string[], capMs: number): string | null => {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) return null;
      try {
        return execFileSync("git", args, {
          cwd: canonicalProjectPath,
          stdio: "pipe",
          timeout: Math.max(1, Math.min(capMs, remainingMs)),
        }).toString();
      } catch {
        return null;
      }
    };

    const topLevelOutput = runBounded(["rev-parse", "--show-toplevel"], 2500);
    if (!topLevelOutput) {
      projectCache.set(canonicalProjectPath, null);
      return null;
    }
    try {
      if (fs.realpathSync(topLevelOutput.trim()) !== canonicalProjectPath) {
        projectCache.set(canonicalProjectPath, null);
        return null;
      }
    } catch {
      projectCache.set(canonicalProjectPath, null);
      return null;
    }

    const worktreeOutput = runBounded(["worktree", "list", "--porcelain"], 4000);
    const worktrees = worktreeOutput ? parseWorktreeListPorcelain(worktreeOutput) : null;
    projectCache.set(canonicalProjectPath, worktrees);
    return worktrees;
  };

  for (const group of ownershipGroups.values()) {
    if (group.length !== 1 || Date.now() >= deadline) continue;
    const candidate = group[0]!;
    if (taskWorktrees.has(candidate.taskId)) continue;

    try {
      const worktrees = inspectProject(candidate.canonicalProjectPath);
      if (!worktrees) continue;
      const matches = worktrees.filter((entry) => {
        for (let suffix = 0; suffix <= 3; suffix += 1) {
          const suffixText = suffix === 0 ? "" : `-${suffix}`;
          const expectedPath = path.join(
            candidate.canonicalProjectPath,
            ".climpire-worktrees",
            `${candidate.shortId}${suffixText}`,
          );
          const expectedBranchRef = `refs/heads/climpire/${candidate.shortId}${suffixText}`;
          if (path.resolve(entry.worktreePath) !== expectedPath || entry.branchRef !== expectedBranchRef) continue;
          if (!fs.existsSync(expectedPath) || fs.realpathSync(expectedPath) !== expectedPath) return false;
          return /^[a-f0-9]{40}$/u.test(entry.head ?? "");
        }
        return false;
      });
      if (matches.length !== 1) continue;

      const match = matches[0]!;
      const canonicalWorktreePath = fs.realpathSync(match.worktreePath);
      const branchName = match.branchRef!.slice("refs/heads/".length);
      const branchKey = `${candidate.canonicalProjectPath}\0${branchName}`;
      if (claimedPaths.has(canonicalWorktreePath) || claimedBranches.has(branchKey)) continue;

      taskWorktrees.set(candidate.taskId, {
        projectPath: candidate.projectPath,
        worktreePath: path.join(candidate.projectPath, ".climpire-worktrees", path.basename(match.worktreePath)),
        branchName: match.branchRef!.slice("refs/heads/".length),
      });
      claimedPaths.add(canonicalWorktreePath);
      claimedBranches.add(branchKey);
    } catch {
      // Recovery is fail-closed: malformed or ambiguous disk state remains unmapped.
    }
  }
}

function resolveCompareRef(projectPath: string, worktreePath: string): string | null {
  const preferredCandidates: string[] = [];

  try {
    const currentBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectPath,
      stdio: "pipe",
      timeout: 5000,
    })
      .toString()
      .trim();
    if (currentBranch && currentBranch !== "HEAD") {
      preferredCandidates.push(`refs/heads/${currentBranch}`, `refs/remotes/origin/${currentBranch}`);
    }
  } catch {
    // ignore and fall back to generic candidates
  }

  preferredCandidates.push(
    "refs/heads/main",
    "refs/remotes/origin/main",
    "refs/heads/master",
    "refs/remotes/origin/master",
  );

  for (const candidate of preferredCandidates) {
    if (refExists(worktreePath, candidate)) return candidate;
  }
  return null;
}

function parsePorcelainPath(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const pathPart = trimmed.slice(3).trim();
  if (!pathPart) return null;
  const renamed = pathPart.split(" -> ").pop()?.trim();
  return renamed || pathPart;
}

function isCodeLikePath(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|json|html|css|scss|py|md|yml|yaml|sh|ps1|sql)$/i.test(filePath);
}

function isIgnoredWorktreeArtifact(filePath: string): boolean {
  return filePath === ".claude/skills" || filePath.startsWith(".claude/skills/");
}

type VerifyCommitState = {
  ok: true;
  hasWorktree: boolean;
  worktreePath: string | null;
  branchName?: string;
  compareRef: string | null;
  worktreeHead: string | null;
  savedHead: string | null;
  hasCommit: boolean;
  commitCount: number;
  commits: string[];
  files: string[];
  uncommittedFiles: string[];
  hasUncommittedChanges: boolean;
  hasRealCode: boolean;
  verdict: "no_worktree" | "no_commit" | "dirty_without_commit" | "commit_but_no_code" | "ok";
};

function inspectWorktreeVerification(wtInfo?: {
  worktreePath: string;
  branchName: string;
  projectPath: string;
}): VerifyCommitState {
  const worktreePath = wtInfo?.worktreePath ?? null;
  if (!wtInfo || !worktreePath) {
    return {
      ok: true,
      hasWorktree: false,
      worktreePath: null,
      compareRef: null,
      worktreeHead: null,
      savedHead: null,
      hasCommit: false,
      commitCount: 0,
      commits: [],
      files: [],
      uncommittedFiles: [],
      hasUncommittedChanges: false,
      hasRealCode: false,
      verdict: "no_worktree",
    };
  }

  const compareRef = resolveCompareRef(wtInfo.projectPath, worktreePath);
  const worktreeHead = tryReadGitLines(worktreePath, ["rev-parse", "HEAD"])[0] ?? null;
  const savedHead = compareRef
    ? (tryReadGitLines(wtInfo.projectPath, ["rev-parse", "--verify", compareRef])[0] ?? null)
    : null;
  const commits = compareRef ? readGitLines(worktreePath, ["log", `${compareRef}..HEAD`, "--oneline"]) : [];
  const changedFiles = (
    compareRef ? tryReadGitLines(worktreePath, ["diff", `${compareRef}..HEAD`, "--name-only"]) : []
  ).filter((filePath) => !isIgnoredWorktreeArtifact(filePath));
  const uncommittedFiles = tryReadGitLines(worktreePath, ["status", "--porcelain"])
    .map(parsePorcelainPath)
    .filter((value): value is string => Boolean(value))
    .filter((filePath) => !isIgnoredWorktreeArtifact(filePath));
  const hasRealCode = changedFiles.some(isCodeLikePath);
  const hasUncommittedChanges = uncommittedFiles.length > 0;

  const verdict =
    commits.length === 0
      ? hasUncommittedChanges
        ? "dirty_without_commit"
        : "no_commit"
      : hasRealCode
        ? "ok"
        : "commit_but_no_code";

  return {
    ok: true,
    hasWorktree: true,
    worktreePath,
    branchName: wtInfo.branchName,
    compareRef,
    worktreeHead,
    savedHead,
    hasCommit: commits.length > 0,
    commitCount: commits.length,
    commits,
    files: changedFiles,
    uncommittedFiles,
    hasUncommittedChanges,
    hasRealCode,
    verdict,
  };
}

export function registerWorktreeAndUsageRoutes(ctx: RuntimeContext): {
  refreshCliUsageData: () => Promise<Record<string, CliUsageEntry>>;
} {
  const {
    app,
    taskWorktrees,
    mergeWorktree,
    cleanupWorktree,
    appendTaskLog,
    resolveLang,
    pickL,
    l,
    notifyCeo,
    db,
    nowMs,
    CLI_TOOLS,
    fetchClaudeUsage,
    fetchCodexUsage,
    fetchGeminiUsage,
    broadcast,
  } = ctx;
  const workspaceReleaseInFlight = new Set<string>();
  recoverHermesReviewWorktrees(db, taskWorktrees);

  app.get("/api/tasks/:id/diff", (req, res) => {
    const id = String(req.params.id);
    const wtInfo = taskWorktrees.get(id);
    if (!wtInfo) {
      return res.json({ ok: true, hasWorktree: false, diff: "", stat: "" });
    }

    try {
      const currentBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: wtInfo.projectPath,
        stdio: "pipe",
        timeout: 5000,
      })
        .toString()
        .trim();

      const stat = execFileSync("git", ["diff", `${currentBranch}...${wtInfo.branchName}`, "--stat"], {
        cwd: wtInfo.projectPath,
        stdio: "pipe",
        timeout: 10000,
      })
        .toString()
        .trim();

      const diff = execFileSync("git", ["diff", `${currentBranch}...${wtInfo.branchName}`], {
        cwd: wtInfo.projectPath,
        stdio: "pipe",
        timeout: 15000,
      }).toString();

      res.json({
        ok: true,
        hasWorktree: true,
        branchName: wtInfo.branchName,
        stat,
        diff: diff.length > 50000 ? diff.slice(0, 50000) + "\n... (truncated)" : diff,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.json({ ok: false, error: msg });
    }
  });

  app.post("/api/tasks/:id/merge", (req, res) => {
    const id = String(req.params.id);
    const wtInfo = taskWorktrees.get(id);
    if (!wtInfo) {
      return res.status(404).json({ error: "no_worktree", message: "No worktree found for this task" });
    }

    let verificationState: VerifyCommitState | null = null;
    try {
      verificationState = inspectWorktreeVerification(wtInfo);
    } catch (err: unknown) {
      appendTaskLog(
        id,
        "system",
        `Final branch verification: skipped (${err instanceof Error ? err.message : String(err)})`,
      );
    }

    if (verificationState?.verdict === "ok") {
      appendTaskLog(
        id,
        "system",
        `Final branch verification: passed (ref=${verificationState.compareRef ?? "unknown"}, commits=${verificationState.commitCount}, files=${verificationState.files.length})`,
      );
    } else if (verificationState && verificationState.verdict !== "no_worktree") {
      appendTaskLog(
        id,
        "system",
        `Final branch verification: warning (verdict=${verificationState.verdict}, commits=${verificationState.commitCount}, uncommitted=${verificationState.uncommittedFiles.length})`,
      );
    }

    const result = mergeWorktree(wtInfo.projectPath, id);
    const lang = resolveLang();

    if (result.success) {
      cleanupWorktree(wtInfo.projectPath, id);
      appendTaskLog(id, "system", `Manual merge completed: ${result.message}`);
      notifyCeo(
        pickL(
          l(
            [`수동 병합 완료: ${result.message}`],
            [`Manual merge completed: ${result.message}`],
            [`手動マージ完了: ${result.message}`],
            [`手动合并完成: ${result.message}`],
          ),
          lang,
        ),
        id,
      );
    } else {
      appendTaskLog(id, "system", `Manual merge failed: ${result.message}`);
    }

    res.json({ ok: result.success, message: result.message, conflicts: result.conflicts });
  });

  app.post("/api/tasks/:id/discard", (req, res) => {
    const id = String(req.params.id);
    const wtInfo = taskWorktrees.get(id);
    if (!wtInfo) {
      return res.status(404).json({ error: "no_worktree", message: "No worktree found for this task" });
    }

    cleanupWorktree(wtInfo.projectPath, id);
    appendTaskLog(id, "system", "Worktree discarded (changes abandoned)");
    const lang = resolveLang();
    notifyCeo(
      pickL(
        l(
          [`작업 브랜치가 폐기되었습니다: climpire/${id.slice(0, 8)}`],
          [`Task branch discarded: climpire/${id.slice(0, 8)}`],
          [`タスクブランチを破棄しました: climpire/${id.slice(0, 8)}`],
          [`任务分支已丢弃: climpire/${id.slice(0, 8)}`],
        ),
        lang,
      ),
      id,
    );

    res.json({ ok: true, message: "Worktree discarded" });
  });

  app.post("/api/tasks/:id/release-worktree", (req, res) => {
    const id = String(req.params.id);
    if (shouldRequireCsrf(req) && !hasValidCsrfToken(req)) {
      return res.status(403).json({ ok: false, error: "csrf_token_invalid" });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const proof: WorkspaceReleaseProof = {
      executionId: typeof body.executionId === "string" ? body.executionId : "",
      requestFingerprint: typeof body.requestFingerprint === "string" ? body.requestFingerprint : "",
      mode: body.mode as WorkspaceReleaseProof["mode"],
      projectPath: typeof body.projectPath === "string" ? body.projectPath : "",
      worktreePath: typeof body.worktreePath === "string" ? body.worktreePath : "",
      branchName: typeof body.branchName === "string" ? body.branchName : "",
      worktreeHead: typeof body.worktreeHead === "string" ? body.worktreeHead : "",
      savedRef: typeof body.savedRef === "string" ? body.savedRef : "",
      savedHead: typeof body.savedHead === "string" ? body.savedHead : "",
    };
    if (
      !["no_local_changes", "git_saved"].includes(proof.mode) ||
      !proof.executionId ||
      !/^[a-f0-9]{64}$/u.test(proof.requestFingerprint) ||
      !proof.projectPath ||
      !proof.worktreePath ||
      !proof.branchName ||
      !/^[a-f0-9]{40}$/u.test(proof.worktreeHead) ||
      !/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(proof.savedRef) ||
      proof.savedRef.includes("..") ||
      proof.savedRef === `refs/heads/${proof.branchName}` ||
      !/^[a-f0-9]{40}$/u.test(proof.savedHead)
    ) {
      return res.status(400).json({ ok: false, error: "workspace_release_request_invalid" });
    }

    const task = db.prepare("SELECT id, project_path, status, workflow_meta_json FROM tasks WHERE id = ?").get(id) as
      | { id: string; project_path: string | null; status: string; workflow_meta_json: string | null }
      | undefined;
    if (!task?.project_path) {
      return res.status(404).json({ ok: false, error: "task_or_project_not_found" });
    }
    const identity = readHermesTaskIdentity(task.workflow_meta_json);
    if (!identity || task.status !== "review") {
      return res.status(409).json({ ok: false, error: "task_not_releasable" });
    }
    if (identity.executionId !== proof.executionId || identity.requestFingerprint !== proof.requestFingerprint) {
      return res.status(403).json({ ok: false, error: "task_identity_mismatch" });
    }
    if (workspaceReleaseInFlight.has(id)) {
      return res.status(409).json({ ok: false, error: "workspace_release_in_progress" });
    }
    workspaceReleaseInFlight.add(id);

    try {
      const hash = workspaceReleaseProofHash(id, proof);
      const rows = db
        .prepare("SELECT message FROM task_logs WHERE task_id = ? AND message LIKE ? ORDER BY rowid DESC LIMIT 20")
        .all(id, `${WORKSPACE_RELEASE_RECEIPT_PREFIX}%`) as Array<{ message: string }>;
      for (const row of rows) {
        try {
          const receipt = JSON.parse(
            row.message.slice(WORKSPACE_RELEASE_RECEIPT_PREFIX.length),
          ) as WorkspaceReleaseReceipt;
          if (workspaceReleaseReceiptMatches(id, proof, receipt)) {
            return res.json({ ok: true, replayed: true, receipt });
          }
        } catch {
          // Ignore unrelated legacy log text.
        }
      }

      const preparedRows = db
        .prepare(
          "SELECT rowid AS log_rowid, message FROM task_logs WHERE task_id = ? AND message LIKE ? ORDER BY rowid DESC LIMIT 20",
        )
        .all(id, `${WORKSPACE_RELEASE_PREPARED_PREFIX}%`) as Array<{ log_rowid: number; message: string }>;
      const prepared = preparedRows.find((row) => {
        try {
          const value = JSON.parse(row.message.slice(WORKSPACE_RELEASE_PREPARED_PREFIX.length)) as {
            proofHash?: unknown;
          };
          return value.proofHash === hash;
        } catch {
          return false;
        }
      });
      if (prepared && !fs.existsSync(proof.worktreePath)) {
        const explicitDiscard = db
          .prepare(
            "SELECT 1 FROM task_logs WHERE task_id = ? AND rowid > ? AND message LIKE 'Worktree discarded%' LIMIT 1",
          )
          .get(id, prepared.log_rowid);
        if (explicitDiscard) {
          return res.status(409).json({ ok: false, error: "workspace_release_not_reconcilable" });
        }
      }

      let reconciled = false;
      let receipt: WorkspaceReleaseReceipt;
      if (prepared && !fs.existsSync(proof.worktreePath)) {
        receipt = reconcileReleasedTaskWorktree({
          taskId: id,
          taskProjectPath: task.project_path,
          mappedWorktree: taskWorktrees.get(id),
          proof,
          taskWorktrees,
        });
        reconciled = true;
      } else {
        const preparedMessage = `${WORKSPACE_RELEASE_PREPARED_PREFIX}${JSON.stringify({
          taskId: id,
          executionId: proof.executionId,
          requestFingerprint: proof.requestFingerprint,
          proofHash: hash,
          proof,
        })}`;
        receipt = releaseTaskWorktree({
          taskId: id,
          taskProjectPath: task.project_path,
          mappedWorktree: taskWorktrees.get(id),
          proof,
          taskWorktrees,
          beforeMutation: prepared
            ? undefined
            : () => {
                appendTaskLog(id, "system", preparedMessage);
                const stored = db
                  .prepare("SELECT 1 FROM task_logs WHERE task_id = ? AND message = ? ORDER BY rowid DESC LIMIT 1")
                  .get(id, preparedMessage);
                if (!stored) {
                  throw new WorkspaceReleaseError(
                    "workspace_release_prepare_not_persisted",
                    "Workspace release mutation marker was not persisted",
                  );
                }
              },
        });
      }
      appendTaskLog(id, "system", `${WORKSPACE_RELEASE_RECEIPT_PREFIX}${JSON.stringify(receipt)}`);
      const stored = db
        .prepare("SELECT message FROM task_logs WHERE task_id = ? AND message = ? ORDER BY created_at DESC LIMIT 1")
        .get(id, `${WORKSPACE_RELEASE_RECEIPT_PREFIX}${JSON.stringify(receipt)}`) as { message: string } | undefined;
      if (!stored) {
        return res.status(500).json({ ok: false, error: "workspace_release_receipt_not_persisted" });
      }
      return res.json({ ok: true, replayed: Boolean(prepared), reconciled, receipt });
    } catch (error) {
      if (error instanceof WorkspaceReleaseError) {
        return res.status(409).json({ ok: false, error: error.code });
      }
      return res.status(500).json({ ok: false, error: "workspace_release_failed" });
    } finally {
      workspaceReleaseInFlight.delete(id);
    }
  });

  app.get("/api/tasks/:id/verify-commit", (req, res) => {
    const id = String(req.params.id);
    const wtInfo = taskWorktrees.get(id);

    try {
      return res.json(inspectWorktreeVerification(wtInfo));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.json({ ok: false, error: msg, verdict: "error" });
    }
  });

  app.get("/api/worktrees", (_req, res) => {
    const entries: Array<{ taskId: string; branchName: string; worktreePath: string; projectPath: string }> = [];
    for (const [taskId, info] of taskWorktrees) {
      entries.push({ taskId, ...info });
    }
    res.json({ ok: true, worktrees: entries });
  });

  function readCliUsageFromDb(): Record<string, CliUsageEntry> {
    const rows = db.prepare("SELECT provider, data_json FROM cli_usage_cache").all() as Array<{
      provider: string;
      data_json: string;
    }>;
    const usage: Record<string, CliUsageEntry> = {};
    for (const row of rows) {
      try {
        usage[row.provider] = JSON.parse(row.data_json);
      } catch {
        // invalid json row
      }
    }
    return usage;
  }

  async function refreshCliUsageData(): Promise<Record<string, CliUsageEntry>> {
    const providers = ["claude", "codex", "gemini", "copilot", "antigravity"];
    const usage: Record<string, CliUsageEntry> = {};

    const fetchMap: Record<string, () => Promise<CliUsageEntry>> = {
      claude: fetchClaudeUsage,
      codex: fetchCodexUsage,
      gemini: fetchGeminiUsage,
    };

    const fetches = providers.map(async (p) => {
      const tool = CLI_TOOLS.find((t) => t.name === p);
      if (!tool) {
        usage[p] = { windows: [], error: "not_implemented" };
        return;
      }
      if (!tool.checkAuth()) {
        usage[p] = { windows: [], error: "unauthenticated" };
        return;
      }
      const fetcher = fetchMap[p];
      if (fetcher) {
        usage[p] = await fetcher();
      } else {
        usage[p] = { windows: [], error: "not_implemented" };
      }
    });

    await Promise.all(fetches);

    const upsert = db.prepare(
      "INSERT INTO cli_usage_cache (provider, data_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(provider) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at",
    );
    const now = nowMs();
    for (const [p, entry] of Object.entries(usage)) {
      upsert.run(p, JSON.stringify(entry), now);
    }

    return usage;
  }

  app.get("/api/cli-usage", async (_req, res) => {
    let usage = readCliUsageFromDb();
    if (Object.keys(usage).length === 0) {
      usage = await refreshCliUsageData();
    }
    res.json({ ok: true, usage });
  });

  app.post("/api/cli-usage/refresh", async (_req, res) => {
    try {
      const usage = await refreshCliUsageData();
      broadcast("cli_usage_update", usage);
      res.json({ ok: true, usage });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  return { refreshCliUsageData };
}
