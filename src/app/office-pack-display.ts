import type { Agent, Department, WorkflowPackKey } from "../types";

function parseSeedPackKey(agentId: string): string | null {
  const normalized = String(agentId ?? "").trim();
  if (!normalized) return null;
  const matched = normalized.match(/^([a-z0-9_]+)-seed-\d+$/i);
  return matched?.[1] ? matched[1] : null;
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
}): Department[] {
  const { packKey, globalDepartments, packDepartments, preferPackProfile = true } = params;
  if (packKey === "development" || !packDepartments || packDepartments.length === 0) {
    return globalDepartments;
  }

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
  if (packKey === "development" || !packAgents || packAgents.length === 0) {
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
