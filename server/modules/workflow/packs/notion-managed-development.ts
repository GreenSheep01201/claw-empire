type QueryRows = { all(...params: unknown[]): unknown[] };

type ReadDatabase = {
  prepare(sql: string): QueryRows;
};

const MARKER_PREDICATE = `
  substr(personality, 1, 14) = 'hermes-member:'
  AND length(substr(personality, 15, 64)) = 64
  AND substr(personality, 15, 64) NOT GLOB '*[^0-9a-f]*'
  AND substr(personality, 79, 1) IN ('', char(10))
`;

export type NotionManagedDevelopmentScope = {
  agentIds: string[];
  departmentIds: string[];
};

export function readNotionManagedDevelopmentScope(db: ReadDatabase): NotionManagedDevelopmentScope | null {
  let hasWorkflowPackColumn = false;
  try {
    const columns = db.prepare("PRAGMA table_info(agents)").all() as Array<{ name?: unknown }>;
    hasWorkflowPackColumn = columns.some(({ name }) => String(name ?? "").trim() === "workflow_pack_key");
  } catch {
    return null;
  }
  const workflowPackPredicate = hasWorkflowPackColumn
    ? "COALESCE(workflow_pack_key, 'development') = 'development'"
    : "1 = 1";
  try {
    const rows = db.prepare(`
      SELECT id, department_id
      FROM agents
      WHERE ${workflowPackPredicate}
        AND department_id IS NOT NULL
        AND trim(department_id) <> ''
        AND ${MARKER_PREDICATE}
      ORDER BY id ASC
    `).all() as Array<{ id?: unknown; department_id?: unknown }>;
    const agentIds = rows
      .map(({ id }) => String(id ?? "").trim())
      .filter(Boolean);
    const departmentIds = [...new Set(rows
      .map(({ department_id }) => String(department_id ?? "").trim())
      .filter(Boolean))].sort();
    return agentIds.length > 0 && departmentIds.length > 0 ? { agentIds, departmentIds } : null;
  } catch {
    return null;
  }
}

export function readNotionManagedDevelopmentDepartmentIds(db: ReadDatabase): string[] | null {
  return readNotionManagedDevelopmentScope(db)?.departmentIds ?? null;
}
