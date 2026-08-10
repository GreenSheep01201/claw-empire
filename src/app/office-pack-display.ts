import type { Agent, Department, WorkflowPackKey } from "../types";

function parseSeedPackKey(agentId: string): string | null {
  const normalized = String(agentId ?? "").trim();
  if (!normalized) return null;
  const matched = normalized.match(/^([a-z0-9_]+)-seed-\d+$/i);
  return matched?.[1] ? matched[1] : null;
}

const HERMES_MEMBER_MARKER = /^hermes-member:[a-f0-9]{64}(?:\n|$)/u;

const NOTION_MANAGED_DEVELOPMENT_DEPARTMENT_IDS = [
  "representative",
  "secretariat",
  "marketing",
  "social",
  "sales",
  "dev",
  "backoffice",
] as const;

function isDevelopmentPackAgent(agent: Agent): boolean {
  return (agent.workflow_pack_key ?? "development") === "development";
}

function isNotionManagedDevelopmentAgent(agent: Agent): boolean {
  return isDevelopmentPackAgent(agent)
    && typeof agent.personality === "string"
    && HERMES_MEMBER_MARKER.test(agent.personality);
}

function mergePackAgent(globalAgent: Agent | undefined, packAgent: Agent): Agent {
  // DB row is the source of truth after hydration.
  if (globalAgent) return globalAgent;
  // Fallback for edge cases before hydration settles.
  return packAgent;
}

function mergePackDepartment(
  globalDepartment: Department | undefined,
  packDepartment: Department,
  preferPackProfile: boolean,
): Department {
  if (!globalDepartment) return packDepartment;
  // During first-pack bootstrap before DB hydration settles, prefer pack profile values.
  if (preferPackProfile) return { ...globalDepartment, ...packDepartment };
  // After hydration, DB row is the source of truth.
  return globalDepartment;
}

export function resolvePackDepartmentsForDisplay(params: {
  packKey: WorkflowPackKey;
  globalDepartments: Department[];
  packDepartments?: Department[] | null;
  preferPackProfile?: boolean;
  visibleAgents?: Agent[] | null;
}): Department[] {
  const { packKey, globalDepartments, packDepartments, preferPackProfile = true, visibleAgents } = params;
  if (packKey === "development") {
    const notionManagedAgents = (visibleAgents ?? []).filter(isNotionManagedDevelopmentAgent);
    if (notionManagedAgents.length > 0) {
      const departmentsById = new Map(globalDepartments.map((department) => [department.id, department]));
      return NOTION_MANAGED_DEVELOPMENT_DEPARTMENT_IDS
        .map((departmentId) => departmentsById.get(departmentId))
        .filter((department): department is Department => Boolean(department));
    }
    return globalDepartments;
  }
  if (!packDepartments || packDepartments.length === 0) return globalDepartments;

  const globalById = new Map<string, Department>();
  for (const department of globalDepartments) {
    globalById.set(department.id, department);
  }

  const scopedDepartments = packDepartments.map((packDepartment) =>
    mergePackDepartment(globalById.get(packDepartment.id), packDepartment, preferPackProfile),
  );
  const scopedDeptIds = new Set(scopedDepartments.map((department) => department.id));
  return [...scopedDepartments, ...globalDepartments.filter((department) => !scopedDeptIds.has(department.id))];
}

export function resolvePackAgentViews(params: {
  packKey: WorkflowPackKey;
  globalAgents: Agent[];
  packAgents?: Agent[] | null;
}): { scopedAgents: Agent[]; mergedAgents: Agent[] } {
  const { packKey, globalAgents, packAgents } = params;
  if (packKey === "development") {
    const developmentAgents = globalAgents.filter(isDevelopmentPackAgent);
    const notionManagedAgents = developmentAgents.filter(isNotionManagedDevelopmentAgent);
    const visibleDevelopmentAgents = notionManagedAgents.length > 0 ? notionManagedAgents : developmentAgents;
    return { scopedAgents: visibleDevelopmentAgents, mergedAgents: visibleDevelopmentAgents };
  }
  if (!packAgents || packAgents.length === 0) {
    return { scopedAgents: globalAgents, mergedAgents: globalAgents };
  }

  const globalById = new Map<string, Agent>();
  for (const agent of globalAgents) {
    globalById.set(agent.id, agent);
  }

  const scopedAgents = packAgents.map((packAgent) => mergePackAgent(globalById.get(packAgent.id), packAgent));
  const scopedAgentIds = new Set(scopedAgents.map((agent) => agent.id));
  const mergedAgents = [
    ...scopedAgents,
    ...globalAgents.filter((agent) => {
      if (scopedAgentIds.has(agent.id)) return false;
      const seedPack = parseSeedPackKey(agent.id);
      // Hide foreign office-pack seed agents from merged lists.
      if (seedPack && seedPack !== packKey) return false;
      return true;
    }),
  ];
  return { scopedAgents, mergedAgents };
}
