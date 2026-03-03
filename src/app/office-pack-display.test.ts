import { describe, expect, it } from "vitest";
import type { Agent, Department } from "../types";
import { resolvePackAgentViews, resolvePackDepartmentsForDisplay } from "./office-pack-display";

function makeAgent(input: Partial<Agent> & { id: string; name: string; name_ko: string }): Agent {
  return {
    id: input.id,
    name: input.name,
    name_ko: input.name_ko,
    name_ja: input.name_ja ?? input.name,
    name_zh: input.name_zh ?? input.name,
    department_id: input.department_id ?? "planning",
    role: input.role ?? "senior",
    cli_provider: input.cli_provider ?? "codex",
    avatar_emoji: input.avatar_emoji ?? "A",
    sprite_number: input.sprite_number ?? null,
    personality: input.personality ?? null,
    status: input.status ?? "idle",
    current_task_id: input.current_task_id ?? null,
    stats_tasks_done: input.stats_tasks_done ?? 0,
    stats_xp: input.stats_xp ?? 0,
    created_at: input.created_at ?? 1,
  };
}

function makeDepartment(input: Partial<Department> & { id: string; name: string; name_ko: string }): Department {
  return {
    id: input.id,
    name: input.name,
    name_ko: input.name_ko,
    name_ja: input.name_ja ?? input.name,
    name_zh: input.name_zh ?? input.name,
    icon: input.icon ?? "D",
    color: input.color ?? "#64748b",
    description: input.description ?? null,
    prompt: input.prompt ?? null,
    sort_order: input.sort_order ?? 1,
    created_at: input.created_at ?? 1,
  };
}

describe("office pack display helpers", () => {
  it("prefers DB agent values and uses pack agent only as fallback", () => {
    const globalAgent = makeAgent({
      id: "report-seed-1",
      name: "Global Name",
      name_ko: "Global KO",
      avatar_emoji: "G",
      sprite_number: 3,
      status: "working",
      current_task_id: "task-1",
      stats_tasks_done: 7,
      stats_xp: 80,
      created_at: 10,
    });
    const packAgent = makeAgent({
      id: "report-seed-1",
      name: "Pack Name",
      name_ko: "Pack KO",
      avatar_emoji: "P",
      sprite_number: 11,
      status: "idle",
      current_task_id: null,
      stats_tasks_done: 0,
      stats_xp: 0,
      created_at: 999,
    });

    const { scopedAgents, mergedAgents } = resolvePackAgentViews({
      packKey: "report",
      globalAgents: [globalAgent],
      packAgents: [packAgent],
    });

    expect(scopedAgents[0]?.name).toBe("Global Name");
    expect(scopedAgents[0]?.avatar_emoji).toBe("G");
    expect(scopedAgents[0]?.sprite_number).toBe(3);
    expect(scopedAgents[0]?.status).toBe("working");
    expect(scopedAgents[0]?.current_task_id).toBe("task-1");
    expect(scopedAgents[0]?.stats_tasks_done).toBe(7);
    expect(scopedAgents[0]?.stats_xp).toBe(80);
    expect(mergedAgents).toHaveLength(1);
  });

  it("before hydration prefers pack department labels/icons over DB metadata", () => {
    const globalDepartments: Department[] = [
      makeDepartment({ id: "planning", name: "Planning", name_ko: "Planning-DB", icon: "G", created_at: 77 }),
      makeDepartment({ id: "operations", name: "Operations", name_ko: "Ops", icon: "O" }),
    ];
    const packDepartments: Department[] = [
      makeDepartment({ id: "planning", name: "Editorial Planning", name_ko: "Planning-Pack", icon: "P" }),
    ];

    const output = resolvePackDepartmentsForDisplay({
      packKey: "report",
      globalDepartments,
      packDepartments,
      preferPackProfile: true,
    });

    expect(output[0]?.id).toBe("planning");
    expect(output[0]?.name_ko).toBe("Planning-Pack");
    expect(output[0]?.icon).toBe("P");
    expect(output[0]?.created_at).toBe(1);
    expect(output.some((dept) => dept.id === "operations")).toBe(true);
  });

  it("after hydration prefers DB department labels/icons over pack profile", () => {
    const globalDepartments: Department[] = [
      makeDepartment({
        id: "planning",
        name: "Planning (DB)",
        name_ko: "Planning-DB",
        icon: "DB",
        created_at: 77,
      }),
    ];
    const packDepartments: Department[] = [
      makeDepartment({
        id: "planning",
        name: "Planning (Pack)",
        name_ko: "Planning-Pack",
        icon: "PACK",
        created_at: 1,
      }),
    ];

    const output = resolvePackDepartmentsForDisplay({
      packKey: "report",
      globalDepartments,
      packDepartments,
      preferPackProfile: false,
    });

    expect(output[0]?.name_ko).toBe("Planning-DB");
    expect(output[0]?.icon).toBe("DB");
    expect(output[0]?.created_at).toBe(77);
  });

  it("hides foreign-pack seed agents from merged lists in non-development packs", () => {
    const currentPackAgent = makeAgent({
      id: "novel-seed-1",
      name: "Novel Seed",
      name_ko: "Novel Seed",
    });
    const foreignPackAgent = makeAgent({
      id: "report-seed-1",
      name: "Report Seed",
      name_ko: "Report Seed",
    });
    const nonSeedGlobal = makeAgent({
      id: "dev-leader",
      name: "Dev Leader",
      name_ko: "Dev Leader",
    });

    const { mergedAgents } = resolvePackAgentViews({
      packKey: "novel",
      globalAgents: [currentPackAgent, foreignPackAgent, nonSeedGlobal],
      packAgents: [currentPackAgent],
    });

    expect(mergedAgents.some((agent) => agent.id === "novel-seed-1")).toBe(true);
    expect(mergedAgents.some((agent) => agent.id === "report-seed-1")).toBe(false);
    expect(mergedAgents.some((agent) => agent.id === "dev-leader")).toBe(true);
  });
});
