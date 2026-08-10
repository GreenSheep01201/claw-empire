import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  WorkspaceReleaseError,
  releaseTaskWorktree,
  workspaceReleaseReceiptMatches,
  type WorkspaceReleaseProof,
} from "./release.ts";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fixture() {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-safe-release-"));
  git(projectPath, ["init", "-b", "main"]);
  git(projectPath, ["config", "user.name", "Claw Release Test"]);
  git(projectPath, ["config", "user.email", "claw-release@example.test"]);
  fs.writeFileSync(path.join(projectPath, "README.md"), "seed\n");
  git(projectPath, ["add", "README.md"]);
  git(projectPath, ["commit", "-m", "seed"]);

  const taskId = "release1-0000-0000-0000-000000000000";
  const branchName = "climpire/release1";
  const worktreePath = path.join(projectPath, ".climpire-worktrees", "release1");
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  git(projectPath, ["worktree", "add", worktreePath, "-b", branchName, "HEAD"]);
  const mappedWorktree = { projectPath, worktreePath, branchName };

  return { projectPath, taskId, branchName, worktreePath, mappedWorktree };
}

function proofFor(
  input: ReturnType<typeof fixture>,
  overrides: Partial<WorkspaceReleaseProof> = {},
): WorkspaceReleaseProof {
  const worktreeHead = git(input.worktreePath, ["rev-parse", "HEAD"]);
  const savedHead = git(input.projectPath, ["rev-parse", "refs/heads/main"]);
  return {
    executionId: "17d3c7d4-55dd-44b8-82e1-80d88ef2748a",
    requestFingerprint: "a".repeat(64),
    mode: "no_local_changes",
    projectPath: input.projectPath,
    worktreePath: input.worktreePath,
    branchName: input.branchName,
    worktreeHead,
    savedRef: "refs/heads/main",
    savedHead,
    ...overrides,
  } as WorkspaceReleaseProof;
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("task-scoped safe worktree release", () => {
  it("accepts only a complete receipt bound to the exact task and proof", () => {
    const input = fixture();
    tempDirs.push(input.projectPath);
    const proof = proofFor(input);
    const taskWorktrees = new Map([[input.taskId, input.mappedWorktree]]);
    const receipt = releaseTaskWorktree({
      taskId: input.taskId,
      taskProjectPath: input.projectPath,
      mappedWorktree: input.mappedWorktree,
      proof,
      taskWorktrees,
    });

    expect(workspaceReleaseReceiptMatches(input.taskId, proof, receipt)).toBe(true);
    expect(workspaceReleaseReceiptMatches(input.taskId, proof, { ...receipt, worktreePath: "/tmp/other" })).toBe(false);
  });

  it("releases a clean no-change worktree without force and reads back removal", () => {
    const input = fixture();
    tempDirs.push(input.projectPath);
    const taskWorktrees = new Map([[input.taskId, input.mappedWorktree]]);

    const receipt = releaseTaskWorktree({
      taskId: input.taskId,
      taskProjectPath: input.projectPath,
      mappedWorktree: taskWorktrees.get(input.taskId),
      proof: proofFor(input),
      taskWorktrees,
    });

    expect(receipt).toMatchObject({
      taskId: input.taskId,
      mode: "no_local_changes",
      worktreeReleased: true,
      branchReleased: true,
    });
    expect(receipt.proofHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(fs.existsSync(input.worktreePath)).toBe(false);
    expect(taskWorktrees.has(input.taskId)).toBe(false);
    expect(() => git(input.projectPath, ["rev-parse", "--verify", `refs/heads/${input.branchName}`])).toThrow();
    expect(git(input.projectPath, ["rev-parse", "refs/heads/main"])).toBe(receipt.savedHead);
  });

  it("releases a clean development worktree only after its commit is reachable from the saved ref", () => {
    const input = fixture();
    tempDirs.push(input.projectPath);
    fs.writeFileSync(path.join(input.worktreePath, "feature.ts"), "export const feature = true;\n");
    git(input.worktreePath, ["add", "feature.ts"]);
    git(input.worktreePath, ["commit", "-m", "feat: persist result"]);
    const worktreeHead = git(input.worktreePath, ["rev-parse", "HEAD"]);
    git(input.projectPath, ["merge", input.branchName, "--no-ff", "-m", "merge saved result"]);
    const savedHead = git(input.projectPath, ["rev-parse", "refs/heads/main"]);
    const taskWorktrees = new Map([[input.taskId, input.mappedWorktree]]);

    const receipt = releaseTaskWorktree({
      taskId: input.taskId,
      taskProjectPath: input.projectPath,
      mappedWorktree: input.mappedWorktree,
      proof: proofFor(input, {
        mode: "git_saved",
        worktreeHead,
        savedRef: "refs/heads/main",
        savedHead,
      }),
      taskWorktrees,
    });

    expect(receipt.mode).toBe("git_saved");
    expect(receipt.worktreeHead).toBe(worktreeHead);
    expect(receipt.savedHead).toBe(savedHead);
    expect(git(input.projectPath, ["show", `${savedHead}:feature.ts`])).toBe("export const feature = true;");
  });

  it("refuses a dirty worktree without deleting its path, branch, or map entry", () => {
    const input = fixture();
    tempDirs.push(input.projectPath);
    fs.writeFileSync(path.join(input.worktreePath, "untracked.txt"), "unsaved\n");
    const taskWorktrees = new Map([[input.taskId, input.mappedWorktree]]);

    expect(() =>
      releaseTaskWorktree({
        taskId: input.taskId,
        taskProjectPath: input.projectPath,
        mappedWorktree: input.mappedWorktree,
        proof: proofFor(input),
        taskWorktrees,
      }),
    ).toThrowError(expect.objectContaining<Partial<WorkspaceReleaseError>>({ code: "workspace_dirty" }));

    expect(fs.existsSync(input.worktreePath)).toBe(true);
    expect(taskWorktrees.has(input.taskId)).toBe(true);
    expect(git(input.projectPath, ["rev-parse", `refs/heads/${input.branchName}`])).toMatch(/^[a-f0-9]{40}$/u);
  });

  it("refuses stale identity and unreachable Git evidence before mutation", () => {
    for (const mode of ["branch", "head", "saved"] as const) {
      const input = fixture();
      tempDirs.push(input.projectPath);
      const taskWorktrees = new Map([[input.taskId, input.mappedWorktree]]);
      const proof =
        mode === "branch"
          ? proofFor(input, { branchName: "climpire/other" })
          : mode === "head"
            ? proofFor(input, { worktreeHead: "0".repeat(40) })
            : proofFor(input, { mode: "git_saved", savedHead: "f".repeat(40) });

      expect(() =>
        releaseTaskWorktree({
          taskId: input.taskId,
          taskProjectPath: input.projectPath,
          mappedWorktree: input.mappedWorktree,
          proof,
          taskWorktrees,
        }),
      ).toThrowError(WorkspaceReleaseError);
      expect(fs.existsSync(input.worktreePath)).toBe(true);
      expect(taskWorktrees.has(input.taskId)).toBe(true);
    }
  });

  it("refuses a missing saved ref and a real unreachable commit without deleting the worktree", () => {
    for (const mode of ["missing", "unreachable"] as const) {
      const input = fixture();
      tempDirs.push(input.projectPath);
      fs.writeFileSync(path.join(input.worktreePath, "feature.ts"), "export const feature = true;\n");
      git(input.worktreePath, ["add", "feature.ts"]);
      git(input.worktreePath, ["commit", "-m", "feat: not saved"]);
      const taskWorktrees = new Map([[input.taskId, input.mappedWorktree]]);
      const proof = proofFor(input, {
        mode: "git_saved",
        ...(mode === "missing" ? { savedRef: "refs/heads/missing" } : {}),
      });

      expect(() =>
        releaseTaskWorktree({
          taskId: input.taskId,
          taskProjectPath: input.projectPath,
          mappedWorktree: input.mappedWorktree,
          proof,
          taskWorktrees,
        }),
      ).toThrowError(WorkspaceReleaseError);
      expect(fs.existsSync(input.worktreePath)).toBe(true);
      expect(taskWorktrees.has(input.taskId)).toBe(true);
    }
  });

  it("refuses to treat the disposable task branch as the persistent saved ref", () => {
    const input = fixture();
    tempDirs.push(input.projectPath);
    fs.writeFileSync(path.join(input.worktreePath, "feature.ts"), "export const feature = true;\n");
    git(input.worktreePath, ["add", "feature.ts"]);
    git(input.worktreePath, ["commit", "-m", "feat: only on disposable branch"]);
    const worktreeHead = git(input.worktreePath, ["rev-parse", "HEAD"]);
    const taskWorktrees = new Map([[input.taskId, input.mappedWorktree]]);

    expect(() =>
      releaseTaskWorktree({
        taskId: input.taskId,
        taskProjectPath: input.projectPath,
        mappedWorktree: input.mappedWorktree,
        proof: proofFor(input, {
          mode: "git_saved",
          savedRef: `refs/heads/${input.branchName}`,
          savedHead: worktreeHead,
        }),
        taskWorktrees,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<WorkspaceReleaseError>>({ code: "workspace_release_request_invalid" }),
    );

    expect(fs.existsSync(input.worktreePath)).toBe(true);
    expect(git(input.projectPath, ["rev-parse", `refs/heads/${input.branchName}`])).toBe(worktreeHead);
    expect(() => git(input.projectPath, ["show", "refs/heads/main:feature.ts"])).toThrow();
  });

  it("revalidates the exact branch HEAD after the durable pre-mutation callback", () => {
    const input = fixture();
    tempDirs.push(input.projectPath);
    const taskWorktrees = new Map([[input.taskId, input.mappedWorktree]]);
    const proof = proofFor(input);

    expect(() =>
      releaseTaskWorktree({
        taskId: input.taskId,
        taskProjectPath: input.projectPath,
        mappedWorktree: input.mappedWorktree,
        proof,
        taskWorktrees,
        beforeMutation: () => {
          fs.writeFileSync(path.join(input.worktreePath, "raced.txt"), "raced\n");
          git(input.worktreePath, ["add", "raced.txt"]);
          git(input.worktreePath, ["commit", "-m", "feat: raced after validation"]);
        },
      }),
    ).toThrowError(expect.objectContaining<Partial<WorkspaceReleaseError>>({ code: "workspace_state_changed" }));
    expect(fs.existsSync(input.worktreePath)).toBe(true);
    expect(taskWorktrees.has(input.taskId)).toBe(true);
  });
});
