import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createWorktreeLifecycleTools } from "../../workflow/core/worktree/lifecycle.ts";
import { releaseTaskWorktree, workspaceReleaseProofHash } from "../../workflow/core/worktree/release.ts";
import { registerWorktreeAndUsageRoutes } from "./worktrees-and-usage.ts";

type RouteHandler = (req: any, res: any) => any;

const HERMES_EXECUTION_ID = "17d3c7d4-55dd-44b8-82e1-80d88ef2748a";
const HERMES_REQUEST_FINGERPRINT = "a".repeat(64);

function releaseRequest(
  taskId: string,
  proof: Record<string, unknown>,
  authenticated = true,
  identity = { executionId: HERMES_EXECUTION_ID, requestFingerprint: HERMES_REQUEST_FINGERPRINT },
) {
  return {
    method: "POST",
    params: { id: taskId },
    body: {
      ...proof,
      executionId: identity.executionId,
      requestFingerprint: identity.requestFingerprint,
    },
    header: (name: string) =>
      authenticated && name.toLowerCase() === "authorization" ? "Bearer fixture-token" : undefined,
  };
}

type FakeResponse = {
  statusCode: number;
  payload: unknown;
  status: (code: number) => FakeResponse;
  json: (body: unknown) => FakeResponse;
};

function createFakeResponse(): FakeResponse {
  return {
    statusCode: 200,
    payload: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    },
  };
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, stdio: "pipe", timeout: 15000 }).toString().trim();
}

function initRepo(basePrefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), basePrefix));
  try {
    runGit(dir, ["init", "-b", "main"]);
  } catch {
    runGit(dir, ["init"]);
    runGit(dir, ["checkout", "-B", "main"]);
  }
  runGit(dir, ["config", "user.name", "Claw-Empire Test"]);
  runGit(dir, ["config", "user.email", "claw-empire-test@example.local"]);
  fs.writeFileSync(path.join(dir, "README.md"), "seed\n", "utf8");
  runGit(dir, ["add", "."]);
  runGit(dir, ["commit", "-m", "seed"]);
  return dir;
}

function createHarness(
  taskWorktrees: Map<string, { worktreePath: string; branchName: string; projectPath: string }>,
  restartTasks: Array<{ taskId: string; projectPath: string; hermes?: boolean; fingerprint?: string }> = [],
) {
  const appendLogCalls: Array<{ taskId: string | null; kind: string; message: string }> = [];
  const getRoutes = new Map<string, RouteHandler>();
  const postRoutes = new Map<string, RouteHandler>();
  const app = {
    get(path: string, handler: RouteHandler) {
      getRoutes.set(path, handler);
      return this;
    },
    post(path: string, handler: RouteHandler) {
      postRoutes.set(path, handler);
      return this;
    },
  };

  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      project_path TEXT,
      status TEXT,
      workflow_meta_json TEXT
    );
    CREATE TABLE task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT,
      kind TEXT,
      message TEXT,
      created_at INTEGER
    );
  `);
  for (const [taskId, info] of taskWorktrees) {
    db.prepare("INSERT INTO tasks (id, project_path, status, workflow_meta_json) VALUES (?, ?, 'review', ?)").run(
      taskId,
      info.projectPath,
      JSON.stringify({
        hermes_execution: {
          contract: "hermes-claw-execution/v2",
          execution_id: HERMES_EXECUTION_ID,
          request_fingerprint: HERMES_REQUEST_FINGERPRINT,
        },
      }),
    );
  }
  for (const task of restartTasks) {
    db.prepare("INSERT INTO tasks (id, project_path, status, workflow_meta_json) VALUES (?, ?, 'review', ?)").run(
      task.taskId,
      task.projectPath,
      task.hermes === false
        ? null
        : JSON.stringify({
            hermes_execution: {
              contract: "hermes-claw-execution/v2",
              execution_id: HERMES_EXECUTION_ID,
              request_fingerprint: task.fingerprint ?? HERMES_REQUEST_FINGERPRINT,
            },
          }),
    );
  }
  registerWorktreeAndUsageRoutes({
    app: app as any,
    taskWorktrees,
    mergeWorktree: () => ({ success: true, message: "merged", conflicts: [] }),
    cleanupWorktree: () => {},
    appendTaskLog: (taskId: string | null, kind: string, message: string) => {
      appendLogCalls.push({ taskId, kind, message });
      db.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, ?, ?, ?)").run(
        taskId,
        kind,
        message,
        Date.now(),
      );
    },
    resolveLang: () => "en",
    pickL: (value: string) => value,
    l: (_ko: string[], en: string[]) => en.join(""),
    notifyCeo: () => {},
    db: db as any,
    nowMs: () => Date.now(),
    CLI_TOOLS: [],
    fetchClaudeUsage: async () => ({ windows: [], error: "not_implemented" }),
    fetchCodexUsage: async () => ({ windows: [], error: "not_implemented" }),
    fetchGeminiUsage: async () => ({ windows: [], error: "not_implemented" }),
    broadcast: () => {},
  } as any);

  return { db, getRoutes, postRoutes, appendLogCalls };
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("worktree verify-commit route", () => {
  it("서버 재시작 후 디스크의 정확한 Hermes review worktree를 복구한다", () => {
    const repo = initRepo("climpire-restart-recovery-");
    tempDirs.push(repo);
    const taskId = "d5cfce68-0be7-46f9-ad7c-76c0b6f6a8da";
    const beforeRestart = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees: beforeRestart });
    const worktreePath = tools.createWorktree(repo, taskId, "Athena");
    expect(worktreePath).toBeTruthy();

    const afterRestart = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const { db, getRoutes } = createHarness(afterRestart, [{ taskId, projectPath: repo }]);
    try {
      expect(afterRestart.get(taskId)).toEqual({
        projectPath: repo,
        worktreePath,
        branchName: `climpire/${taskId.slice(0, 8)}`,
      });

      const listResponse = createFakeResponse();
      getRoutes.get("/api/worktrees")?.({}, listResponse);
      expect(listResponse.payload).toMatchObject({
        ok: true,
        worktrees: [{ taskId, projectPath: repo, worktreePath }],
      });

      const verifyResponse = createFakeResponse();
      getRoutes.get("/api/tasks/:id/verify-commit")?.({ params: { id: taskId } }, verifyResponse);
      expect(verifyResponse.payload).toMatchObject({
        ok: true,
        hasWorktree: true,
        verdict: "no_commit",
      });
    } finally {
      db.close();
    }
  }, 15_000);

  it("Hermes 실행 표식이 없는 review worktree는 재시작 후 복구하지 않는다", () => {
    const repo = initRepo("climpire-restart-non-hermes-");
    tempDirs.push(repo);
    const taskId = "a5cfce68-0be7-46f9-ad7c-76c0b6f6a8da";
    const beforeRestart = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees: beforeRestart });
    expect(tools.createWorktree(repo, taskId, "Athena")).toBeTruthy();

    const afterRestart = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const { db } = createHarness(afterRestart, [{ taskId, projectPath: repo, hermes: false }]);
    try {
      expect(afterRestart.has(taskId)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("같은 project와 short task id를 공유하는 Hermes review task들은 복구하지 않는다", () => {
    const repo = initRepo("climpire-restart-collision-");
    tempDirs.push(repo);
    const firstTaskId = "b5cfce68-0be7-46f9-ad7c-76c0b6f6a8da";
    const secondTaskId = "b5cfce68-1111-4222-8333-444444444444";
    const beforeRestart = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees: beforeRestart });
    expect(tools.createWorktree(repo, firstTaskId, "Athena")).toBeTruthy();

    const afterRestart = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const { db } = createHarness(afterRestart, [
      { taskId: firstTaskId, projectPath: repo },
      { taskId: secondTaskId, projectPath: repo },
    ]);
    try {
      expect(afterRestart.size).toBe(0);
    } finally {
      db.close();
    }
  });

  it("유효하지 않은 Hermes request fingerprint가 있는 review worktree는 복구하지 않는다", () => {
    const repo = initRepo("climpire-restart-invalid-identity-");
    tempDirs.push(repo);
    const taskId = "c5cfce68-0be7-46f9-ad7c-76c0b6f6a8da";
    const beforeRestart = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees: beforeRestart });
    expect(tools.createWorktree(repo, taskId, "Athena")).toBeTruthy();

    const afterRestart = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const { db } = createHarness(afterRestart, [{ taskId, projectPath: repo, fingerprint: "not-a-fingerprint" }]);
    try {
      expect(afterRestart.has(taskId)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("worktree가 없으면 no_worktree 판정을 돌려준다", () => {
    const { db, getRoutes } = createHarness(new Map());
    try {
      const handler = getRoutes.get("/api/tasks/:id/verify-commit");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.({ params: { id: "task-1" } }, res);

      expect(res.statusCode).toBe(200);
      expect(res.payload).toMatchObject({
        ok: true,
        hasWorktree: false,
        hasCommit: false,
        verdict: "no_worktree",
      });
    } finally {
      db.close();
    }
  });

  it("커밋 없이 변경만 있으면 dirty_without_commit 판정을 돌려준다", () => {
    const repo = initRepo("climpire-verify-dirty-");
    tempDirs.push(repo);
    const taskId = "verify-dirty-0000-0000-0000-000000000000";
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees });
    const worktreePath = tools.createWorktree(repo, taskId, "Tester");
    expect(worktreePath).toBeTruthy();

    fs.writeFileSync(path.join(String(worktreePath), "src-dirty.ts"), "export const dirty = true;\n", "utf8");

    const { db, getRoutes } = createHarness(taskWorktrees);
    try {
      const handler = getRoutes.get("/api/tasks/:id/verify-commit");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.({ params: { id: taskId } }, res);

      expect(res.statusCode).toBe(200);
      expect(res.payload).toMatchObject({
        ok: true,
        hasWorktree: true,
        hasCommit: false,
        hasUncommittedChanges: true,
        verdict: "dirty_without_commit",
      });
    } finally {
      db.close();
      tools.cleanupWorktree(repo, taskId);
    }
  });

  it("커밋된 코드 변경이 있으면 ok 판정을 돌려준다", () => {
    const repo = initRepo("climpire-verify-ok-");
    tempDirs.push(repo);
    const taskId = "verify-okay-0000-0000-0000-000000000000";
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees });
    const worktreePath = tools.createWorktree(repo, taskId, "Tester");
    expect(worktreePath).toBeTruthy();

    const worktreeDir = String(worktreePath);
    fs.mkdirSync(path.join(worktreeDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(worktreeDir, "src", "verify.ts"), "export const verified = true;\n", "utf8");
    runGit(worktreeDir, ["add", "."]);
    runGit(worktreeDir, ["commit", "-m", "feat: add verify file"]);

    const { db, getRoutes } = createHarness(taskWorktrees);
    try {
      const handler = getRoutes.get("/api/tasks/:id/verify-commit");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.({ params: { id: taskId } }, res);

      expect(res.statusCode).toBe(200);
      expect(res.payload).toMatchObject({
        ok: true,
        hasWorktree: true,
        hasCommit: true,
        verdict: "ok",
        worktreeHead: expect.stringMatching(/^[a-f0-9]{40}$/u),
        savedHead: expect.stringMatching(/^[a-f0-9]{40}$/u),
      });
      expect(res.payload).toMatchObject({
        files: ["src/verify.ts"],
      });
    } finally {
      db.close();
      tools.cleanupWorktree(repo, taskId);
    }
  });

  it("수동 merge 전에 최종 브랜치 검증 통과 로그를 남긴다", () => {
    const repo = initRepo("climpire-verify-merge-");
    tempDirs.push(repo);
    const taskId = "verify-merge-0000-0000-0000-000000000000";
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees });
    const worktreePath = tools.createWorktree(repo, taskId, "Tester");
    expect(worktreePath).toBeTruthy();

    const worktreeDir = String(worktreePath);
    fs.mkdirSync(path.join(worktreeDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(worktreeDir, "src", "verify.ts"), "export const verified = true;\n", "utf8");
    runGit(worktreeDir, ["add", "."]);
    runGit(worktreeDir, ["commit", "-m", "feat: ready for merge"]);

    const { db, postRoutes, appendLogCalls } = createHarness(taskWorktrees);
    try {
      const handler = postRoutes.get("/api/tasks/:id/merge");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.({ params: { id: taskId } }, res);

      expect(res.statusCode).toBe(200);
      expect(appendLogCalls.some((entry) => entry.message.includes("Final branch verification: passed"))).toBe(true);
    } finally {
      db.close();
      tools.cleanupWorktree(repo, taskId);
    }
  });

  it("조건부 release를 기록하고 동일 요청 재시도에 같은 receipt를 돌려준다", () => {
    const repo = initRepo("climpire-release-route-");
    tempDirs.push(repo);
    const taskId = "route001-0000-0000-0000-000000000000";
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees });
    const worktreePath = tools.createWorktree(repo, taskId, "Tester");
    expect(worktreePath).toBeTruthy();

    const { db, getRoutes, postRoutes, appendLogCalls } = createHarness(taskWorktrees);
    try {
      const verify = createFakeResponse();
      getRoutes.get("/api/tasks/:id/verify-commit")?.({ params: { id: taskId } }, verify);
      const verification = verify.payload as Record<string, unknown>;
      const body = {
        mode: "no_local_changes",
        projectPath: repo,
        worktreePath,
        branchName: verification.branchName,
        worktreeHead: verification.worktreeHead,
        savedRef: verification.compareRef,
        savedHead: verification.savedHead,
      };
      const handler = postRoutes.get("/api/tasks/:id/release-worktree");
      expect(handler).toBeTypeOf("function");

      const first = createFakeResponse();
      handler?.(releaseRequest(taskId, body), first);
      expect(first.statusCode).toBe(200);
      expect(first.payload).toMatchObject({
        ok: true,
        replayed: false,
        receipt: {
          taskId,
          mode: "no_local_changes",
          worktreeReleased: true,
          proofHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        },
      });
      expect(fs.existsSync(String(worktreePath))).toBe(false);
      expect(taskWorktrees.has(taskId)).toBe(false);
      expect(appendLogCalls.filter((entry) => entry.message.startsWith("Workspace release receipt: "))).toHaveLength(1);

      const second = createFakeResponse();
      handler?.(releaseRequest(taskId, body), second);
      expect(second.statusCode).toBe(200);
      expect(second.payload).toMatchObject({ ok: true, replayed: true, receipt: (first.payload as any).receipt });
      expect(appendLogCalls.filter((entry) => entry.message.startsWith("Workspace release receipt: "))).toHaveLength(1);

      const nextIdentity = {
        executionId: "27d3c7d4-55dd-44b8-82e1-80d88ef2748a",
        requestFingerprint: "b".repeat(64),
      };
      db.prepare("UPDATE tasks SET workflow_meta_json = ? WHERE id = ?").run(
        JSON.stringify({
          hermes_execution: {
            contract: "hermes-claw-execution/v2",
            execution_id: nextIdentity.executionId,
            request_fingerprint: nextIdentity.requestFingerprint,
          },
        }),
        taskId,
      );
      const nextWorktreePath = String(tools.createWorktree(repo, taskId, "Tester"));
      const nextVerify = createFakeResponse();
      getRoutes.get("/api/tasks/:id/verify-commit")?.({ params: { id: taskId } }, nextVerify);
      const nextVerification = nextVerify.payload as Record<string, unknown>;
      const next = createFakeResponse();
      handler?.(
        releaseRequest(
          taskId,
          {
            mode: "no_local_changes",
            projectPath: repo,
            worktreePath: nextWorktreePath,
            branchName: nextVerification.branchName,
            worktreeHead: nextVerification.worktreeHead,
            savedRef: nextVerification.compareRef,
            savedHead: nextVerification.savedHead,
          },
          true,
          nextIdentity,
        ),
        next,
      );
      expect(next.statusCode).toBe(200);
      expect(next.payload).toMatchObject({
        ok: true,
        replayed: false,
        receipt: { executionId: nextIdentity.executionId, requestFingerprint: nextIdentity.requestFingerprint },
      });
      expect(fs.existsSync(nextWorktreePath)).toBe(false);
      expect(appendLogCalls.filter((entry) => entry.message.startsWith("Workspace release receipt: "))).toHaveLength(2);
    } finally {
      db.close();
    }
  });

  it("dirty 또는 저장 증거가 다른 release 요청은 zero-delete로 거부한다", () => {
    const repo = initRepo("climpire-release-route-reject-");
    tempDirs.push(repo);
    const taskId = "route002-0000-0000-0000-000000000000";
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees });
    const worktreePath = String(tools.createWorktree(repo, taskId, "Tester"));
    fs.writeFileSync(path.join(worktreePath, "unsaved.txt"), "unsaved\n");

    const { db, getRoutes, postRoutes } = createHarness(taskWorktrees);
    try {
      const verify = createFakeResponse();
      getRoutes.get("/api/tasks/:id/verify-commit")?.({ params: { id: taskId } }, verify);
      const verification = verify.payload as Record<string, unknown>;
      const res = createFakeResponse();
      postRoutes.get("/api/tasks/:id/release-worktree")?.(
        releaseRequest(taskId, {
          mode: "no_local_changes",
          projectPath: repo,
          worktreePath,
          branchName: verification.branchName,
          worktreeHead: verification.worktreeHead,
          savedRef: verification.compareRef,
          savedHead: verification.savedHead,
        }),
        res,
      );

      expect(res.statusCode).toBe(409);
      expect(res.payload).toMatchObject({ ok: false, error: "workspace_dirty" });
      expect(fs.existsSync(worktreePath)).toBe(true);
      expect(taskWorktrees.has(taskId)).toBe(true);
    } finally {
      db.close();
      tools.cleanupWorktree(repo, taskId);
    }
  });

  it("prepared 뒤 응답이 끊긴 release를 read-back하고 receipt로 수렴시킨다", () => {
    const repo = initRepo("climpire-release-route-reconcile-");
    tempDirs.push(repo);
    const taskId = "route003-0000-0000-0000-000000000000";
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees });
    const worktreePath = String(tools.createWorktree(repo, taskId, "Tester"));
    const mapped = taskWorktrees.get(taskId)!;
    const { db, getRoutes, postRoutes, appendLogCalls } = createHarness(taskWorktrees);
    try {
      const verify = createFakeResponse();
      getRoutes.get("/api/tasks/:id/verify-commit")?.({ params: { id: taskId } }, verify);
      const verification = verify.payload as Record<string, unknown>;
      const proof = {
        executionId: HERMES_EXECUTION_ID,
        requestFingerprint: HERMES_REQUEST_FINGERPRINT,
        mode: "no_local_changes" as const,
        projectPath: repo,
        worktreePath,
        branchName: String(verification.branchName),
        worktreeHead: String(verification.worktreeHead),
        savedRef: String(verification.compareRef),
        savedHead: String(verification.savedHead),
      };
      const hash = workspaceReleaseProofHash(taskId, proof);
      db.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, ?, ?, ?)").run(
        taskId,
        "system",
        `Workspace release prepared: ${JSON.stringify({ taskId, proofHash: hash, proof })}`,
        Date.now(),
      );
      releaseTaskWorktree({
        taskId,
        taskProjectPath: repo,
        mappedWorktree: mapped,
        proof,
        taskWorktrees,
      });

      const res = createFakeResponse();
      postRoutes.get("/api/tasks/:id/release-worktree")?.(releaseRequest(taskId, proof), res);

      expect(res.statusCode, JSON.stringify(res.payload)).toBe(200);
      expect(res.payload).toMatchObject({
        ok: true,
        replayed: true,
        reconciled: true,
        receipt: { proofHash: hash, worktreeReleased: true },
      });
      expect(appendLogCalls.filter((entry) => entry.message.startsWith("Workspace release receipt: "))).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("failed dirty proof cannot become a receipt after explicit discard", () => {
    const repo = initRepo("climpire-release-dirty-discard-");
    tempDirs.push(repo);
    const taskId = "route004-0000-0000-0000-000000000000";
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees });
    const worktreePath = String(tools.createWorktree(repo, taskId, "Tester"));
    const { db, getRoutes, postRoutes } = createHarness(taskWorktrees);
    try {
      const verify = createFakeResponse();
      getRoutes.get("/api/tasks/:id/verify-commit")?.({ params: { id: taskId } }, verify);
      const verification = verify.payload as Record<string, unknown>;
      const proof = {
        executionId: HERMES_EXECUTION_ID,
        requestFingerprint: HERMES_REQUEST_FINGERPRINT,
        mode: "no_local_changes" as const,
        projectPath: repo,
        worktreePath,
        branchName: String(verification.branchName),
        worktreeHead: String(verification.worktreeHead),
        savedRef: String(verification.compareRef),
        savedHead: String(verification.savedHead),
      };
      fs.writeFileSync(path.join(worktreePath, "dirty.txt"), "dirty\n");
      const first = createFakeResponse();
      postRoutes.get("/api/tasks/:id/release-worktree")?.(releaseRequest(taskId, proof), first);
      expect(first.statusCode).toBe(409);
      expect(
        db.prepare("SELECT COUNT(*) AS count FROM task_logs WHERE message LIKE 'Workspace release prepared:%'").get(),
      ).toMatchObject({ count: 0 });

      fs.unlinkSync(path.join(worktreePath, "dirty.txt"));
      const hash = workspaceReleaseProofHash(taskId, proof);
      db.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, 'system', ?, ?)").run(
        taskId,
        `Workspace release prepared: ${JSON.stringify({ taskId, proofHash: hash, proof })}`,
        Date.now(),
      );
      tools.cleanupWorktree(repo, taskId);
      db.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, 'system', ?, ?)").run(
        taskId,
        "Worktree discarded (changes abandoned)",
        Date.now(),
      );
      const second = createFakeResponse();
      postRoutes.get("/api/tasks/:id/release-worktree")?.(releaseRequest(taskId, proof), second);
      expect(second.statusCode).toBe(409);
      expect(second.payload).toMatchObject({ error: "workspace_release_not_reconcilable" });
      expect(
        db.prepare("SELECT COUNT(*) AS count FROM task_logs WHERE message LIKE 'Workspace release receipt:%'").get(),
      ).toMatchObject({ count: 0 });
    } finally {
      db.close();
    }
  });

  it("rejects missing CSRF, mismatched task identity, and non-review task state before release", () => {
    const repo = initRepo("climpire-release-auth-");
    tempDirs.push(repo);
    const taskId = "route005-0000-0000-0000-000000000000";
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees });
    const worktreePath = String(tools.createWorktree(repo, taskId, "Tester"));
    const { db, getRoutes, postRoutes } = createHarness(taskWorktrees);
    try {
      const verify = createFakeResponse();
      getRoutes.get("/api/tasks/:id/verify-commit")?.({ params: { id: taskId } }, verify);
      const verification = verify.payload as Record<string, unknown>;
      const proof = {
        mode: "no_local_changes",
        projectPath: repo,
        worktreePath,
        branchName: verification.branchName,
        worktreeHead: verification.worktreeHead,
        savedRef: verification.compareRef,
        savedHead: verification.savedHead,
      };
      const handler = postRoutes.get("/api/tasks/:id/release-worktree");

      const noCsrf = createFakeResponse();
      handler?.(releaseRequest(taskId, proof, false), noCsrf);
      expect(noCsrf.statusCode).toBe(403);
      expect(noCsrf.payload).toMatchObject({ error: "csrf_token_invalid" });

      const wrongIdentity = createFakeResponse();
      const request = releaseRequest(taskId, proof);
      request.body.executionId = "different-execution";
      handler?.(request, wrongIdentity);
      expect(wrongIdentity.statusCode).toBe(403);
      expect(wrongIdentity.payload).toMatchObject({ error: "task_identity_mismatch" });

      db.prepare("UPDATE tasks SET status = 'in_progress' WHERE id = ?").run(taskId);
      const wrongState = createFakeResponse();
      handler?.(releaseRequest(taskId, proof), wrongState);
      expect(wrongState.statusCode).toBe(409);
      expect(wrongState.payload).toMatchObject({ error: "task_not_releasable" });
      expect(fs.existsSync(worktreePath)).toBe(true);
    } finally {
      db.close();
      tools.cleanupWorktree(repo, taskId);
    }
  });
});
