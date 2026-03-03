import fs from "node:fs";
import path from "node:path";

type DbLike = {
  prepare: (sql: string) => {
    get: (...params: unknown[]) => Record<string, unknown> | undefined;
  };
};

export type VideoArtifactSpec = {
  fileName: string;
  relativePath: string;
  legacyRelativePath: string;
};

const VIDEO_OUTPUT_DIR = "video_output";
/** Remotion default output directory */
const REMOTION_OUTPUT_DIR = "out";
const LEGACY_VIDEO_FILENAME = "final.mp4";

function normalizeSegment(raw: unknown, fallback: string): string {
  const base = String(raw ?? "").trim();
  if (!base) return fallback;
  const normalized = base
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

export function buildVideoArtifactFileName(projectName: string | null, departmentName: string | null): string {
  const projectPart = normalizeSegment(projectName, "project");
  const departmentPart = normalizeSegment(departmentName, "team");
  return `${projectPart}_${departmentPart}_final.mp4`;
}

export function resolveVideoArtifactSpec(input: {
  projectName?: string | null;
  departmentName?: string | null;
}): VideoArtifactSpec {
  const fileName = buildVideoArtifactFileName(input.projectName ?? null, input.departmentName ?? null);
  return {
    fileName,
    // Keep artifact metadata paths stable across OS (use POSIX separators).
    relativePath: path.posix.join(VIDEO_OUTPUT_DIR, fileName),
    legacyRelativePath: path.posix.join(VIDEO_OUTPUT_DIR, LEGACY_VIDEO_FILENAME),
  };
}

export function resolveVideoArtifactSpecForTask(
  db: DbLike,
  task: {
    project_id?: string | null;
    project_path?: string | null;
    department_id?: string | null;
    workflow_pack_key?: string | null;
  },
): VideoArtifactSpec {
  const projectId = String(task.project_id ?? "").trim();
  const departmentId = String(task.department_id ?? "").trim();
  const projectPath = String(task.project_path ?? "").trim();
  const workflowPackKey = String(task.workflow_pack_key ?? "").trim();

  let projectNameRow: { name?: string | null } | undefined;
  if (projectId) {
    try {
      projectNameRow = db.prepare("SELECT name FROM projects WHERE id = ?").get(projectId) as
        | { name?: string | null }
        | undefined;
    } catch {
      projectNameRow = undefined;
    }
  }

  let departmentNameRow: { name?: string | null; name_ko?: string | null } | undefined;
  if (departmentId) {
    try {
      if (workflowPackKey && workflowPackKey !== "development") {
        departmentNameRow = db
          .prepare(
            `
              SELECT name, name_ko
              FROM office_pack_departments
              WHERE workflow_pack_key = ? AND department_id = ?
              LIMIT 1
            `,
          )
          .get(workflowPackKey, departmentId) as { name?: string | null; name_ko?: string | null } | undefined;
      }
      if (!departmentNameRow) {
        departmentNameRow = db.prepare("SELECT name, name_ko FROM departments WHERE id = ?").get(departmentId) as
          | { name?: string | null; name_ko?: string | null }
          | undefined;
      }
    } catch {
      departmentNameRow = undefined;
    }
  }

  const projectName = projectNameRow?.name || (projectPath ? path.basename(projectPath) : null);
  const departmentName = departmentNameRow?.name_ko || departmentNameRow?.name || departmentId || null;
  return resolveVideoArtifactSpec({ projectName, departmentName });
}

export function resolveVideoArtifactRelativeCandidates(spec: VideoArtifactSpec): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of [
    spec.relativePath,
    spec.legacyRelativePath,
    // Remotion default output directory candidates
    path.posix.join(REMOTION_OUTPUT_DIR, spec.fileName),
    path.posix.join(REMOTION_OUTPUT_DIR, LEGACY_VIDEO_FILENAME),
  ]) {
    const normalized = String(candidate || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/**
 * Scan a directory for any .mp4 file (non-zero size) as a fallback
 * when named candidates are not found. Checks both `video_output/` and `out/`.
 */
export function discoverVideoArtifact(rootDir: string): string | null {
  for (const dir of [VIDEO_OUTPUT_DIR, REMOTION_OUTPUT_DIR]) {
    const absDir = path.join(rootDir, dir);
    let entries: string[];
    try {
      entries = fs.readdirSync(absDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".mp4")) continue;
      const full = path.join(absDir, entry);
      try {
        if (fs.statSync(full).size > 0) return full;
      } catch {
        // skip
      }
    }
  }
  return null;
}
