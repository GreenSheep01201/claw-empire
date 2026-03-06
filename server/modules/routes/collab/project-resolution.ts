import type { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import type { MessengerChannel } from "../../../messenger/channels.ts";

export type DelegationOptions = {
  skipPlannedMeeting?: boolean;
  skipPlanSubtasks?: boolean;
  projectId?: string | null;
  projectPath?: string | null;
  projectContext?: string | null;
  messengerChannel?: MessengerChannel;
  messengerTargetId?: string | null;
  messengerSessionKey?: string | null;
};

type ProjectLookupRow = {
  id: string;
  name: string;
  project_path: string;
  core_goal: string;
};

interface InitializeProjectResolutionArgs {
  db: DatabaseSync;
}

export function initializeProjectResolution({ db }: InitializeProjectResolutionArgs): {
  normalizeTextField(value: unknown): string | null;
  resolveProjectFromOptions(options?: DelegationOptions): {
    id: string | null;
    name: string | null;
    projectPath: string | null;
    coreGoal: string | null;
  };
  buildRoundGoal(coreGoal: string | null, ceoMessage: string): string;
} {
  function normalizeTextField(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function toResolvedProject(row: ProjectLookupRow | undefined): {
    id: string | null;
    name: string | null;
    projectPath: string | null;
    coreGoal: string | null;
  } {
    if (!row) return { id: null, name: null, projectPath: null, coreGoal: null };
    return {
      id: row.id,
      name: normalizeTextField(row.name),
      projectPath: normalizeTextField(row.project_path),
      coreGoal: normalizeTextField(row.core_goal),
    };
  }

  function normalizeProjectPathForMatch(value: string): string {
    const trimmed = value.trim().replace(/\\/g, "/");
    if (!trimmed) return "";
    const withoutTrailing = trimmed.replace(/\/+$/g, "");
    return withoutTrailing || "/";
  }

  function buildProjectPathCandidates(projectPath: string): string[] {
    const normalized = normalizeProjectPathForMatch(projectPath);
    if (!normalized) return [];

    const home = normalizeProjectPathForMatch(os.homedir());
    const candidates = new Set<string>([normalized]);
    if (normalized.startsWith("~/")) {
      candidates.add(normalizeProjectPathForMatch(path.join(os.homedir(), normalized.slice(2))));
    }
    if (home && normalized.startsWith(`${home}/`)) {
      candidates.add(normalized.slice(home.length));
    }
    if (normalized.startsWith("/Projects/")) {
      candidates.add(normalizeProjectPathForMatch(path.join(home, normalized.slice(1))));
    }
    if (normalized.startsWith("Projects/")) {
      candidates.add(normalizeProjectPathForMatch(path.join(home, normalized)));
    }
    return [...candidates].filter(Boolean);
  }

  function resolveProjectFromOptions(options: DelegationOptions = {}): {
    id: string | null;
    name: string | null;
    projectPath: string | null;
    coreGoal: string | null;
  } {
    const explicitProjectId = normalizeTextField(options.projectId);
    if (explicitProjectId) {
      const row = db
        .prepare(
          `
      SELECT id, name, project_path, core_goal
      FROM projects
      WHERE id = ?
      LIMIT 1
    `,
        )
        .get(explicitProjectId) as ProjectLookupRow | undefined;
      if (row) return toResolvedProject(row);
    }

    const explicitProjectPath = normalizeTextField(options.projectPath);
    if (explicitProjectPath) {
      const pathCandidates = buildProjectPathCandidates(explicitProjectPath);
      if (pathCandidates.length > 0) {
        const placeholders = pathCandidates.map(() => "?").join(", ");
        const rowByPath = db
          .prepare(
            `
        SELECT id, name, project_path, core_goal
        FROM projects
        WHERE project_path IN (${placeholders})
        ORDER BY last_used_at DESC, updated_at DESC
        LIMIT 1
      `,
          )
          .get(...pathCandidates) as ProjectLookupRow | undefined;
        if (rowByPath) return toResolvedProject(rowByPath);
      }

      const normalizedPath = normalizeProjectPathForMatch(explicitProjectPath);
      const pathLeaf = path.posix.basename(normalizedPath);
      if (pathLeaf && pathLeaf !== "/" && pathLeaf !== ".") {
        const rowBySuffix = db
          .prepare(
            `
        SELECT id, name, project_path, core_goal
        FROM projects
        WHERE project_path LIKE ?
        ORDER BY last_used_at DESC, updated_at DESC
        LIMIT 1
      `,
          )
          .get(`%/${pathLeaf}`) as ProjectLookupRow | undefined;
        if (rowBySuffix) return toResolvedProject(rowBySuffix);
      }
    }

    const contextHint = normalizeTextField(options.projectContext);
    if (contextHint) {
      const rowByName = db
        .prepare(
          `
      SELECT id, name, project_path, core_goal
      FROM projects
      WHERE LOWER(name) = LOWER(?)
      ORDER BY last_used_at DESC, updated_at DESC
      LIMIT 1
      `,
        )
        .get(contextHint) as ProjectLookupRow | undefined;
      if (rowByName) return toResolvedProject(rowByName);
    }

    return { id: null, name: null, projectPath: null, coreGoal: null };
  }

  function buildRoundGoal(coreGoal: string | null, ceoMessage: string): string {
    if (coreGoal) {
      return `プロジェクトのコアゴール（"${coreGoal}"）を維持しながら、今回のリクエスト（"${ceoMessage}"）を今ラウンドで実行可能な成果物として完遂する`;
    }
    return `今回のリクエスト（"${ceoMessage}"）を今ラウンドの目標として定義し、実行可能な成果物まで完遂する`;
  }

  return {
    normalizeTextField,
    resolveProjectFromOptions,
    buildRoundGoal,
  };
}
