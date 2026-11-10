import type { Dispatch, SetStateAction } from "react";
import type { ProjectDetailResponse } from "../../api";
import type { Agent, Department, Project, AssignmentMode } from "../../types";
import AgentAvatar from "../AgentAvatar";
import type { ManualAssignmentWarning, ProjectI18nTranslate, ProjectManualSelectionStats } from "./types";

interface ManualAssignmentSelectorProps {
  t: ProjectI18nTranslate;
  language: string;
  isCreating: boolean;
  editingProjectId: string | null;
  assignmentMode: AssignmentMode;
  setAssignmentMode: Dispatch<SetStateAction<AssignmentMode>>;
  setManualAssignmentWarning: Dispatch<SetStateAction<ManualAssignmentWarning | null>>;
  manualSelectionStats: ProjectManualSelectionStats;
  selectedAgentIds: Set<string>;
  setSelectedAgentIds: Dispatch<SetStateAction<Set<string>>>;
  agentFilterDept: string;
  setAgentFilterDept: Dispatch<SetStateAction<string>>;
  departments: Department[];
  agents: Agent[];
  spriteMap: Map<string, number>;
  detail: ProjectDetailResponse | null;
  selectedProject: Project | null;
}

export default function ManualAssignmentSelector({
  t,
  language,
  isCreating,
  editingProjectId,
  assignmentMode,
  setAssignmentMode,
  setManualAssignmentWarning,
  manualSelectionStats,
  selectedAgentIds,
  setSelectedAgentIds,
  agentFilterDept,
  setAgentFilterDept,
  departments,
  agents,
  spriteMap,
  detail,
  selectedProject,
}: ManualAssignmentSelectorProps) {
  const roleLabel = (role: Agent["role"]) => {
    if (role === "team_leader") return t({ ko: "팀장", en: "Leader", ja: "リーダー", zh: "组长", fr: "Responsable" });
    if (role === "senior") return t({ ko: "시니어", en: "Senior", ja: "シニア", zh: "资深", fr: "Confirmé" });
    if (role === "junior") return t({ ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级", fr: "Junior" });
    if (role === "intern") return t({ ko: "인턴", en: "Intern", ja: "インターン", zh: "实习生", fr: "Stagiaire" });
    return "";
  };

  return (
    <>
      {(isCreating || !!editingProjectId) && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="qg-field__label">
              {t({
                ko: "직원 할당 방식",
                en: "Assignment Mode",
                ja: "割り当てモード",
                zh: "分配模式",
                fr: "Mode d’affectation",
              })}
            </span>
            <div className="flex gap-2" role="group">
              <button
                type="button"
                onClick={() => {
                  setAssignmentMode("auto");
                  setManualAssignmentWarning(null);
                }}
                aria-pressed={assignmentMode === "auto"}
                className={`qg-btn qg-btn--sm${assignmentMode === "auto" ? " qg-btn--primary" : ""}`}
              >
                {t({ ko: "자동 할당", en: "Auto", ja: "自動", zh: "自动", fr: "Automatique" })}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAssignmentMode("manual");
                  setManualAssignmentWarning(null);
                }}
                aria-pressed={assignmentMode === "manual"}
                className={`qg-btn qg-btn--sm${assignmentMode === "manual" ? " qg-btn--primary" : ""}`}
              >
                {t({ ko: "직접 선택", en: "Manual", ja: "手動", zh: "手动", fr: "Manuel" })}
              </button>
            </div>
          </div>

          {assignmentMode === "manual" && (
            <div className="qg-card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="qg-field__label">
                  {t({
                    ko: "참여 직원 선택",
                    en: "Select Agents",
                    ja: "エージェント選択",
                    zh: "选择员工",
                    fr: "Choisir les agents",
                  })}
                  <span className="qg-badge qg-badge--accent ml-2">
                    {selectedAgentIds.size}
                    {t({ ko: "명", en: " selected", ja: "人", zh: "人", fr: " sélectionné(s)" })}
                  </span>
                </span>
                {departments.length > 0 && (
                  <select
                    value={agentFilterDept}
                    onChange={(e) => setAgentFilterDept(e.target.value)}
                    aria-label={t({
                      ko: "부서 필터",
                      en: "Filter by department",
                      ja: "部署で絞り込み",
                      zh: "按部门筛选",
                      fr: "Filtrer par pôle",
                    })}
                    className="qg-select"
                  >
                    <option value="all">
                      {t({ ko: "전체 부서", en: "All Depts", ja: "全部署", zh: "所有部门", fr: "Tous les pôles" })}
                    </option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.icon} {language === "ko" ? dept.name_ko || dept.name : dept.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="qg-badge">
                  {t({ ko: "총", en: "Total", ja: "合計", zh: "总计", fr: "Total" })}: {manualSelectionStats.total}
                </span>
                <span className="qg-badge">
                  {t({ ko: "팀장", en: "Leaders", ja: "リーダー", zh: "组长", fr: "Responsables" })}:{" "}
                  {manualSelectionStats.leaders}
                </span>
                <span className="qg-badge">
                  {t({ ko: "하위 직원", en: "Subordinates", ja: "サブ担当", zh: "下属成员", fr: "Membres" })}:{" "}
                  {manualSelectionStats.subordinates}
                </span>
              </div>
              {manualSelectionStats.subordinates === 0 && (
                <p className="qg-field__hint">
                  {t({
                    ko: "하위 직원이 없으면 실행 시 팀장이 직접(단독) 수행할 수 있습니다.",
                    en: "Without subordinates, team leaders may execute tasks directly.",
                    ja: "サブ担当がいない場合、実行時にチームリーダーが直接対応する可能性があります。",
                    zh: "若无下属成员，运行时可能由组长直接执行。",
                    fr: "Sans membres, les responsables risquent d’exécuter les tâches eux-mêmes.",
                  })}
                </p>
              )}
              <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                {agents
                  .filter((agent) => agentFilterDept === "all" || agent.department_id === agentFilterDept)
                  .sort((a, b) => {
                    const roleOrder: Record<string, number> = {
                      team_leader: 0,
                      senior: 1,
                      junior: 2,
                      intern: 3,
                    };
                    return (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9) || a.name.localeCompare(b.name);
                  })
                  .map((agent) => {
                    const checked = selectedAgentIds.has(agent.id);
                    const dept = departments.find((row) => row.id === agent.department_id);
                    return (
                      <label
                        key={agent.id}
                        className={`qg-choice cursor-pointer${checked ? " !border-[var(--qg-accent)] !bg-[var(--qg-accent-soft)]" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = new Set(selectedAgentIds);
                            if (checked) next.delete(agent.id);
                            else next.add(agent.id);
                            setSelectedAgentIds(next);
                            setManualAssignmentWarning(null);
                          }}
                          className="h-4 w-4 shrink-0 accent-[var(--qg-accent)]"
                        />
                        <AgentAvatar agent={agent} spriteMap={spriteMap} size={24} />
                        <span className="text-[13px] font-medium">
                          {language === "ko" ? agent.name_ko || agent.name : agent.name}
                        </span>
                        {dept && (
                          <span className="qg-badge">{language === "ko" ? dept.name_ko || dept.name : dept.name}</span>
                        )}
                        <span className="qg-text-muted ml-auto text-xs">{roleLabel(agent.role)}</span>
                      </label>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {!isCreating && !editingProjectId && selectedProject && selectedProject.assignment_mode === "manual" && (
        <div className="qg-card">
          <div className="flex items-center gap-2">
            <span className="qg-field__label">
              {t({
                ko: "직접 선택 모드",
                en: "Manual Assignment",
                ja: "手動割り当て",
                zh: "手动分配",
                fr: "Affectation manuelle",
              })}
            </span>
            <span className="qg-badge">
              {detail?.assigned_agents?.length ?? 0}
              {t({ ko: "명 지정", en: " agents", ja: "人", zh: "人", fr: " agents" })}
            </span>
          </div>
          {detail?.assigned_agents && detail.assigned_agents.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {detail.assigned_agents.map((agent: Agent) => (
                <span key={agent.id} className="qg-badge">
                  <AgentAvatar agent={agent} spriteMap={spriteMap} size={16} />
                  {language === "ko" ? agent.name_ko || agent.name : agent.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
