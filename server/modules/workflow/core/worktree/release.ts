import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { WorktreeInfo } from "./lifecycle.ts";

export type WorkspaceReleaseMode = "no_local_changes" | "git_saved";

export type WorkspaceReleaseProof = {
  executionId: string;
  requestFingerprint: string;
  mode: WorkspaceReleaseMode;
  projectPath: string;
  worktreePath: string;
  branchName: string;
  worktreeHead: string;
  savedRef: string;
  savedHead: string;
};

export type WorkspaceReleaseReceipt = WorkspaceReleaseProof & {
  taskId: string;
  proofHash: string;
  worktreeReleased: true;
  branchReleased: boolean;
};

export class WorkspaceReleaseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkspaceReleaseError";
    this.code = code;
  }
}

type ReleaseInput = {
  taskId: string;
  taskProjectPath: string;
  mappedWorktree?: WorktreeInfo;
  proof: WorkspaceReleaseProof;
  taskWorktrees: Map<string, WorktreeInfo>;
  beforeMutation?: () => void;
};

type GitResult = { ok: boolean; stdout: string };

function runGit(cwd: string, args: string[], input?: string): GitResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    timeout: 15_000,
  });
  return {
    ok: !result.error && result.status === 0,
    stdout: typeof result.stdout === "string" ? result.stdout.trim() : "",
  };
}

function requireGit(cwd: string, args: string[], code = "git_inspection_failed"): string {
  const result = runGit(cwd, args);
  if (!result.ok) throw new WorkspaceReleaseError(code, "Git state could not be verified");
  return result.stdout;
}

function canonicalExisting(value: string): string {
  try {
    return fs.realpathSync(value);
  } catch {
    throw new WorkspaceReleaseError("workspace_identity_mismatch", "Workspace path does not exist");
  }
}

function branchForTask(taskId: string, branchName: string): boolean {
  const shortId = taskId.slice(0, 8).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^climpire/${shortId}(?:-[0-9]+)?$`, "u").test(branchName);
}

function worktreeForTask(taskId: string, projectPath: string, worktreePath: string): boolean {
  const relative = path.relative(path.join(projectPath, ".climpire-worktrees"), worktreePath);
  const shortId = taskId.slice(0, 8).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return Boolean(relative) && !path.isAbsolute(relative) && new RegExp(`^${shortId}(?:-[0-9]+)?$`, "u").test(relative);
}

function persistentSavedRef(proof: WorkspaceReleaseProof): boolean {
  return (
    /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(proof.savedRef) &&
    !proof.savedRef.includes("..") &&
    proof.savedRef !== `refs/heads/${proof.branchName}`
  );
}

function registeredWorktrees(projectPath: string): Array<{ worktreePath: string; branch?: string }> {
  return requireGit(projectPath, ["worktree", "list", "--porcelain"])
    .split(/\n\s*\n/gu)
    .map((block) => {
      const values = new Map<string, string>();
      for (const line of block.split("\n")) {
        const separator = line.indexOf(" ");
        if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1));
      }
      const rawPath = values.get("worktree");
      if (!rawPath) return undefined;
      const branchRef = values.get("branch");
      return {
        worktreePath: rawPath,
        ...(branchRef?.startsWith("refs/heads/") ? { branch: branchRef.slice("refs/heads/".length) } : {}),
      };
    })
    .filter((entry): entry is { worktreePath: string; branch?: string } => Boolean(entry));
}

function meaningfulStatus(worktreePath: string): string[] {
  const output = requireGit(worktreePath, ["status", "--porcelain"]);
  if (!output) return [];
  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => {
      const candidate = line.slice(3).trim().split(" -> ").pop() ?? "";
      return candidate !== ".claude/skills" && !candidate.startsWith(".claude/skills/");
    });
}

export function workspaceReleaseProofHash(taskId: string, proof: WorkspaceReleaseProof): string {
  return createHash("sha256")
    .update(JSON.stringify({ taskId, ...proof }), "utf8")
    .digest("hex");
}

export function workspaceReleaseReceiptMatches(
  taskId: string,
  proof: WorkspaceReleaseProof,
  receipt: WorkspaceReleaseReceipt,
): boolean {
  return (
    receipt.taskId === taskId &&
    receipt.proofHash === workspaceReleaseProofHash(taskId, proof) &&
    receipt.mode === proof.mode &&
    receipt.projectPath === proof.projectPath &&
    receipt.worktreePath === proof.worktreePath &&
    receipt.branchName === proof.branchName &&
    receipt.worktreeHead === proof.worktreeHead &&
    receipt.savedRef === proof.savedRef &&
    receipt.savedHead === proof.savedHead &&
    receipt.worktreeReleased === true &&
    typeof receipt.branchReleased === "boolean"
  );
}

export function releaseTaskWorktree(input: ReleaseInput): WorkspaceReleaseReceipt {
  const { taskId, proof, taskWorktrees } = input;
  if (
    !taskId ||
    !proof.executionId ||
    !/^[a-f0-9]{64}$/u.test(proof.requestFingerprint) ||
    !/^[a-f0-9]{40}$/u.test(proof.worktreeHead) ||
    !/^[a-f0-9]{40}$/u.test(proof.savedHead) ||
    !persistentSavedRef(proof)
  ) {
    throw new WorkspaceReleaseError("workspace_release_request_invalid", "Workspace release proof is invalid");
  }

  const projectPath = canonicalExisting(proof.projectPath);
  const worktreePath = canonicalExisting(proof.worktreePath);
  const taskProjectPath = canonicalExisting(input.taskProjectPath);
  if (
    projectPath !== taskProjectPath ||
    !branchForTask(taskId, proof.branchName) ||
    !worktreeForTask(taskId, projectPath, worktreePath)
  ) {
    throw new WorkspaceReleaseError("workspace_identity_mismatch", "Workspace identity does not match the task");
  }

  if (input.mappedWorktree) {
    const mappedProject = canonicalExisting(input.mappedWorktree.projectPath);
    const mappedWorktree = canonicalExisting(input.mappedWorktree.worktreePath);
    if (
      mappedProject !== projectPath ||
      mappedWorktree !== worktreePath ||
      input.mappedWorktree.branchName !== proof.branchName
    ) {
      throw new WorkspaceReleaseError("workspace_identity_mismatch", "Runtime workspace mapping changed");
    }
  }

  if (canonicalExisting(requireGit(projectPath, ["rev-parse", "--show-toplevel"])) !== projectPath) {
    throw new WorkspaceReleaseError("workspace_identity_mismatch", "Project path is not the Git root");
  }
  if (canonicalExisting(requireGit(worktreePath, ["rev-parse", "--show-toplevel"])) !== worktreePath) {
    throw new WorkspaceReleaseError("workspace_identity_mismatch", "Worktree path is not the Git root");
  }

  const actualBranch = requireGit(worktreePath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const actualHead = requireGit(worktreePath, ["rev-parse", "HEAD"]);
  const savedHead = requireGit(projectPath, ["rev-parse", "--verify", proof.savedRef], "saved_ref_missing");
  if (actualBranch !== proof.branchName || actualHead !== proof.worktreeHead) {
    throw new WorkspaceReleaseError("workspace_state_changed", "Worktree branch or HEAD changed");
  }
  if (savedHead !== proof.savedHead) {
    throw new WorkspaceReleaseError("saved_ref_changed", "Saved Git ref changed");
  }
  if (meaningfulStatus(worktreePath).length > 0) {
    throw new WorkspaceReleaseError("workspace_dirty", "Worktree contains uncommitted or untracked changes");
  }

  const reachable = runGit(projectPath, ["merge-base", "--is-ancestor", proof.worktreeHead, proof.savedRef]).ok;
  if (!reachable) {
    throw new WorkspaceReleaseError("artifact_not_saved", "Worktree commit is not reachable from the saved Git ref");
  }
  if (proof.mode === "no_local_changes" && proof.worktreeHead !== proof.savedHead) {
    throw new WorkspaceReleaseError("artifact_not_saved", "No-change worktree diverged from the saved Git ref");
  }

  const registered = registeredWorktrees(projectPath);
  const matches = registered.filter((entry) => {
    let registeredPath: string;
    try {
      registeredPath = fs.realpathSync(entry.worktreePath);
    } catch {
      return false;
    }
    return registeredPath === worktreePath && entry.branch === proof.branchName;
  });
  if (matches.length !== 1) {
    throw new WorkspaceReleaseError("workspace_identity_mismatch", "Git worktree registration changed");
  }

  input.beforeMutation?.();
  const finalBranch = requireGit(worktreePath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const finalHead = requireGit(worktreePath, ["rev-parse", "HEAD"]);
  const finalSavedHead = requireGit(projectPath, ["rev-parse", "--verify", proof.savedRef], "saved_ref_missing");
  const finalRegistered = registeredWorktrees(projectPath).filter((entry) => {
    let registeredPath: string;
    try {
      registeredPath = fs.realpathSync(entry.worktreePath);
    } catch {
      return false;
    }
    return registeredPath === worktreePath && entry.branch === proof.branchName;
  });
  if (
    finalBranch !== proof.branchName ||
    finalHead !== proof.worktreeHead ||
    finalSavedHead !== proof.savedHead ||
    meaningfulStatus(worktreePath).length > 0 ||
    finalRegistered.length !== 1
  ) {
    throw new WorkspaceReleaseError("workspace_state_changed", "Workspace state changed before release");
  }

  const removed = runGit(projectPath, ["worktree", "remove", worktreePath]);
  if (!removed.ok) {
    throw new WorkspaceReleaseError("workspace_release_failed", "Git refused the non-force worktree release");
  }

  const after = registeredWorktrees(projectPath);
  if (
    fs.existsSync(worktreePath) ||
    after.some((entry) => entry.worktreePath === worktreePath || entry.branch === proof.branchName)
  ) {
    throw new WorkspaceReleaseError("workspace_release_readback_failed", "Worktree release read-back did not match");
  }

  const releasedBranchHead = requireGit(projectPath, ["rev-parse", "--verify", `refs/heads/${proof.branchName}`]);
  if (releasedBranchHead !== proof.worktreeHead) {
    throw new WorkspaceReleaseError("workspace_state_changed", "Worktree branch changed during release");
  }

  const branchReleased = runGit(
    projectPath,
    ["update-ref", "--stdin"],
    [
      "start",
      `verify ${proof.savedRef} ${proof.savedHead}`,
      `delete refs/heads/${proof.branchName} ${proof.worktreeHead}`,
      "prepare",
      "commit",
      "",
    ].join("\n"),
  ).ok;
  const branchStillExists = runGit(projectPath, ["rev-parse", "--verify", `refs/heads/${proof.branchName}`]).ok;
  if (!branchReleased || branchStillExists) {
    throw new WorkspaceReleaseError("workspace_release_readback_failed", "Branch release read-back did not match");
  }
  if (requireGit(projectPath, ["rev-parse", "--verify", proof.savedRef], "saved_ref_missing") !== proof.savedHead) {
    throw new WorkspaceReleaseError("workspace_release_readback_failed", "Saved Git ref did not survive release");
  }

  taskWorktrees.delete(taskId);
  return {
    taskId,
    ...proof,
    proofHash: workspaceReleaseProofHash(taskId, proof),
    worktreeReleased: true,
    branchReleased,
  };
}

export function reconcileReleasedTaskWorktree(input: ReleaseInput): WorkspaceReleaseReceipt {
  const { taskId, proof, taskWorktrees } = input;
  if (
    !taskId ||
    !proof.executionId ||
    !/^[a-f0-9]{64}$/u.test(proof.requestFingerprint) ||
    !/^[a-f0-9]{40}$/u.test(proof.worktreeHead) ||
    !/^[a-f0-9]{40}$/u.test(proof.savedHead) ||
    !persistentSavedRef(proof)
  ) {
    throw new WorkspaceReleaseError("workspace_release_request_invalid", "Workspace release proof is invalid");
  }

  const projectPath = canonicalExisting(proof.projectPath);
  const taskProjectPath = canonicalExisting(input.taskProjectPath);
  if (
    projectPath !== taskProjectPath ||
    !branchForTask(taskId, proof.branchName) ||
    !worktreeForTask(taskId, path.resolve(proof.projectPath), path.resolve(proof.worktreePath))
  ) {
    throw new WorkspaceReleaseError("workspace_identity_mismatch", "Workspace identity does not match the task");
  }
  if (fs.existsSync(proof.worktreePath)) {
    throw new WorkspaceReleaseError("workspace_reconciliation_incomplete", "Worktree still exists");
  }

  const savedHead = requireGit(projectPath, ["rev-parse", "--verify", proof.savedRef], "saved_ref_missing");
  if (savedHead !== proof.savedHead) {
    throw new WorkspaceReleaseError("saved_ref_changed", "Saved Git ref changed");
  }
  if (!runGit(projectPath, ["merge-base", "--is-ancestor", proof.worktreeHead, proof.savedRef]).ok) {
    throw new WorkspaceReleaseError("artifact_not_saved", "Worktree commit is not reachable from the saved Git ref");
  }
  if (proof.mode === "no_local_changes" && proof.worktreeHead !== proof.savedHead) {
    throw new WorkspaceReleaseError("artifact_not_saved", "No-change worktree diverged from the saved Git ref");
  }

  const expectedPath = path.resolve(proof.worktreePath);
  if (
    registeredWorktrees(projectPath).some(
      (entry) => path.resolve(entry.worktreePath) === expectedPath || entry.branch === proof.branchName,
    )
  ) {
    throw new WorkspaceReleaseError("workspace_reconciliation_incomplete", "Git still registers the worktree");
  }

  const branchRef = `refs/heads/${proof.branchName}`;
  const branch = runGit(projectPath, ["rev-parse", "--verify", branchRef]);
  if (branch.ok && branch.stdout !== proof.worktreeHead) {
    throw new WorkspaceReleaseError(
      "workspace_state_changed",
      "Retained branch no longer matches the released worktree",
    );
  }
  const branchReleased = branch.ok
    ? runGit(
        projectPath,
        ["update-ref", "--stdin"],
        [
          "start",
          `verify ${proof.savedRef} ${proof.savedHead}`,
          `delete ${branchRef} ${proof.worktreeHead}`,
          "prepare",
          "commit",
          "",
        ].join("\n"),
      ).ok
    : true;
  const branchStillExists = runGit(projectPath, ["rev-parse", "--verify", branchRef]).ok;
  if (!branchReleased || branchStillExists) {
    throw new WorkspaceReleaseError("workspace_release_readback_failed", "Branch release read-back did not match");
  }
  if (requireGit(projectPath, ["rev-parse", "--verify", proof.savedRef], "saved_ref_missing") !== proof.savedHead) {
    throw new WorkspaceReleaseError("workspace_release_readback_failed", "Saved Git ref did not survive release");
  }

  taskWorktrees.delete(taskId);
  return {
    taskId,
    ...proof,
    proofHash: workspaceReleaseProofHash(taskId, proof),
    worktreeReleased: true,
    branchReleased,
  };
}
