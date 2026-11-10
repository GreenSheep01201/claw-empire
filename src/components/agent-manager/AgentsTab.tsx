import type { Agent, Department } from "../../types";
import { Briefcase, Building2, Search, SearchX } from "lucide-react";
import { localeName } from "../../i18n";
import AgentCard from "./AgentCard";
import { StackedSpriteIcon } from "./EmojiPicker";
import type { Translator } from "./types";

interface AgentsTabProps {
  tr: Translator;
  locale: string;
  isKo: boolean;
  agents: Agent[];
  departments: Department[];
  deptTab: string;
  setDeptTab: (deptId: string) => void;
  search: string;
  setSearch: (next: string) => void;
  sortedAgents: Agent[];
  spriteMap: Map<string, number>;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  onEditAgent: (agent: Agent) => void;
  onEditDepartment: (department: Department) => void;
  onDeleteAgent: (agentId: string) => void;
  saving: boolean;
  randomIconSprites: {
    total: [number, number];
  };
}

export default function AgentsTab({
  tr,
  locale,
  isKo,
  agents,
  departments,
  deptTab,
  setDeptTab,
  search,
  setSearch,
  sortedAgents,
  spriteMap,
  confirmDeleteId,
  setConfirmDeleteId,
  onEditAgent,
  onEditDepartment,
  onDeleteAgent,
  saving,
  randomIconSprites,
}: AgentsTabProps) {
  const workingCount = agents.filter((agent) => agent.status === "working").length;
  const deptCounts = new Map<string, { total: number; working: number }>();
  for (const agent of agents) {
    const key = agent.department_id || "__none";
    const count = deptCounts.get(key) ?? { total: 0, working: 0 };
    count.total += 1;
    if (agent.status === "working") count.working += 1;
    deptCounts.set(key, count);
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            key: "total",
            label: tr("전체 인원", "Total", "Effectif"),
            value: agents.length,
            icon: <StackedSpriteIcon sprites={randomIconSprites.total} />,
          },
          {
            key: "working",
            label: tr("근무 중", "Working", "Au travail"),
            value: workingCount,
            icon: <Briefcase size={16} aria-hidden="true" />,
          },
          {
            key: "departments",
            label: tr("부서", "Departments", "Pôles"),
            value: departments.length,
            icon: <Building2 size={16} aria-hidden="true" />,
          },
        ].map((summary) => (
          <div key={summary.key} className="qg-card">
            <div className="mb-1 flex items-center gap-1.5 text-[13px] qg-text-muted">
              {summary.icon}
              <span className="truncate">{summary.label}</span>
            </div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--th-text-heading)" }}>
              {summary.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div
          className="flex flex-1 flex-wrap items-center gap-2"
          role="group"
          aria-label={tr("부서 필터", "Department filter", "Filtrer par pôle")}
        >
          <button
            type="button"
            onClick={() => setDeptTab("all")}
            aria-pressed={deptTab === "all"}
            className="qg-choice"
            style={{ width: "auto" }}
          >
            {tr("전체", "All", "Tous")}
            <span className="qg-count">{agents.length}</span>
          </button>
          {departments.map((department) => {
            const count = deptCounts.get(department.id);
            const name = localeName(locale, department);
            return (
              <button
                type="button"
                key={department.id}
                onClick={() => setDeptTab(department.id)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  onEditDepartment(department);
                }}
                aria-pressed={deptTab === department.id}
                aria-label={`${name} (${count?.total ?? 0})`}
                title={tr("더블클릭: 부서 편집", "Double-click: edit dept", "Double-clic : modifier le pôle")}
                className="qg-choice"
                style={{ width: "auto" }}
              >
                <span aria-hidden="true">{department.icon}</span>
                <span className="hidden sm:inline">{name}</span>
                <span className="qg-count">{count?.total ?? 0}</span>
              </button>
            );
          })}
        </div>
        <div className="relative sm:w-56">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 qg-text-muted"
          />
          <input
            type="search"
            placeholder={`${tr("검색", "Search", "Rechercher")}…`}
            aria-label={tr("직원 검색", "Search agents", "Rechercher un agent")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="qg-input"
            style={{ paddingLeft: 34 }}
          />
        </div>
      </div>

      {sortedAgents.length === 0 ? (
        <div className="qg-empty flex flex-col items-center gap-2">
          <SearchX size={28} aria-hidden="true" />
          {tr("검색 결과 없음", "No agents found", "Aucun agent trouvé")}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              spriteMap={spriteMap}
              isKo={isKo}
              locale={locale}
              tr={tr}
              departments={departments}
              onEdit={() => onEditAgent(agent)}
              confirmDeleteId={confirmDeleteId}
              onDeleteClick={() => setConfirmDeleteId(agent.id)}
              onDeleteConfirm={() => onDeleteAgent(agent.id)}
              onDeleteCancel={() => setConfirmDeleteId(null)}
              saving={saving}
            />
          ))}
        </div>
      )}
    </>
  );
}
