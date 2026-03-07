/**
 * Copilot HTTP agent patch applicator.
 *
 * The copilot provider emits file changes in "*** Start Patch … *** End Patch"
 * blocks inside the task log.  This module parses those blocks and writes the
 * changes to the isolated git worktree, then commits them so the normal merge
 * flow can pick them up.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export type PatchFileOp =
  | { op: "add"; filePath: string; content: string }
  | { op: "update"; filePath: string; diffLines: string[] }
  | { op: "delete"; filePath: string };

/** Parse all patch blocks from a task log string. */
export function parsePatchBlocks(logContent: string): PatchFileOp[] {
  const ops: PatchFileOp[] = [];
  // Handle both "*** Start Patch" (copilot) and legacy "*** Begin Patch" variants
  const patchRe = /\*\*\*\s*(Start|Begin)\s+Patch\n([\s\S]*?)\*\*\*\s*End\s+Patch/g;
  let m: RegExpExecArray | null;
  while ((m = patchRe.exec(logContent)) !== null) {
    ops.push(...parseSingleBlock(m[2]));
  }
  return ops;
}

function parseSingleBlock(block: string): PatchFileOp[] {
  const ops: PatchFileOp[] = [];
  const lines = block.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const addM = line.match(/^\*\*\*\s*Add\s+File:\s*(.+)$/);
    const updM = line.match(/^\*\*\*\s*Update\s+File:\s*(.+)$/);
    const delM = line.match(/^\*\*\*\s*Delete\s+File:\s*(.+)$/);

    if (addM) {
      const filePath = addM[1].trim();
      const contentLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("***")) {
        const l = lines[i];
        // strip leading +/ prefix for additions; space prefix is context
        if (l.startsWith("+")) {
          contentLines.push(l.slice(1));
        } else if (l.startsWith(" ")) {
          contentLines.push(l.slice(1));
        } else if (!l.startsWith("-")) {
          // bare line without a diff prefix — treat as plain content
          contentLines.push(l);
        }
        i++;
      }
      ops.push({ op: "add", filePath, content: contentLines.join("\n") });
    } else if (updM) {
      const filePath = updM[1].trim();
      const diffLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("***")) {
        diffLines.push(lines[i]);
        i++;
      }
      ops.push({ op: "update", filePath, diffLines });
    } else if (delM) {
      ops.push({ op: "delete", filePath: delM[1].trim() });
      i++;
    } else {
      i++;
    }
  }
  return ops;
}

/** Apply parsed patch operations to a worktree directory. */
export function applyPatchOps(worktreePath: string, ops: PatchFileOp[]): void {
  for (const op of ops) {
    // Reject path traversal attempts
    const fullPath = path.resolve(worktreePath, op.filePath);
    if (!fullPath.startsWith(path.resolve(worktreePath) + path.sep)) continue;

    if (op.op === "add") {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, op.content, "utf8");
    } else if (op.op === "delete") {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } else if (op.op === "update") {
      applyUpdateOp(worktreePath, op.filePath, fullPath, op.diffLines);
    }
  }
}

function applyUpdateOp(
  worktreePath: string,
  relPath: string,
  fullPath: string,
  diffLines: string[],
): void {
  const hasHunks = diffLines.some((l) => l.startsWith("@@"));

  if (hasHunks) {
    // Already a proper unified diff — add git diff header and apply
    const diff = [`--- a/${relPath}`, `+++ b/${relPath}`, ...diffLines, ""].join("\n");
    try {
      execSync("git apply --whitespace=nowarn -", {
        cwd: worktreePath,
        input: diff,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return;
    } catch {
      // fall through to manual application
    }
  }

  // Manual line-by-line application (no @@ hunks)
  let existing: string[] = [];
  if (fs.existsSync(fullPath)) {
    existing = fs.readFileSync(fullPath, "utf8").split("\n");
  }

  const result: string[] = [];
  let ei = 0;
  for (const line of diffLines) {
    if (line.startsWith("+")) {
      result.push(line.slice(1));
    } else if (line.startsWith("-")) {
      // advance past the deleted line in the existing content
      while (ei < existing.length && existing[ei] !== line.slice(1)) ei++;
      ei++;
    } else if (line.startsWith(" ")) {
      result.push(line.slice(1));
      ei++;
    }
  }
  while (ei < existing.length) result.push(existing[ei++]);

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, result.join("\n"), "utf8");
}

/**
 * Stage and commit any pending changes in the worktree.
 * Returns true if a commit was made, false if there was nothing to commit.
 */
export function commitWorktreeChanges(worktreePath: string, taskTitle: string): boolean {
  try {
    const status = execSync("git status --porcelain", {
      cwd: worktreePath,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
    if (!status) return false;

    execSync("git add -A", { cwd: worktreePath, stdio: ["pipe", "pipe", "pipe"] });
    const msg = `feat: ${taskTitle.replace(/"/g, "'").slice(0, 72)}\n\nApplied via Copilot agent output.`;
    execSync(`git commit -m "${msg.replace(/\n/g, "\\n")}"`, {
      cwd: worktreePath,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "ClawEmpire Agent",
        GIT_AUTHOR_EMAIL: "agent@clawempire.local",
        GIT_COMMITTER_NAME: "ClawEmpire Agent",
        GIT_COMMITTER_EMAIL: "agent@clawempire.local",
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * High-level helper: parse patches from a log string, apply them to the
 * worktree, and commit.  Returns true if changes were committed.
 */
export function applyPatchesFromLog(
  logContent: string,
  worktreePath: string,
  taskTitle: string,
): boolean {
  const ops = parsePatchBlocks(logContent);
  if (ops.length === 0) return false;

  try {
    applyPatchOps(worktreePath, ops);
    return commitWorktreeChanges(worktreePath, taskTitle);
  } catch {
    return false;
  }
}
