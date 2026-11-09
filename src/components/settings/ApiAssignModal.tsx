import type { LangText } from "../../i18n";
import { getOfficePackMeta } from "../../app/office-workflow-pack";
import AgentAvatar, { buildSpriteMap } from "../AgentAvatar";
import type { Agent, WorkflowPackKey } from "../../types";
import type { ApiStateBundle, TFunction } from "./types";
import Dialog from "../ui/Dialog";

interface ApiAssignModalProps {
  t: TFunction;
  localeTag: string;
  apiState: ApiStateBundle;
}

export default function ApiAssignModal({ t, localeTag, apiState }: ApiAssignModalProps) {
  const { apiAssignTarget, apiAssigning, apiAssignAgents, apiAssignDepts, setApiAssignTarget, handleApiAssignToAgent } =
    apiState;

  if (!apiAssignTarget) return null;

  const spriteMap = buildSpriteMap(apiAssignAgents);
  const localName = (nameEn: string, nameKo: string) => (localeTag === "ko" ? nameKo || nameEn : nameEn || nameKo);
  const normalizeWorkflowPackKey = (value: unknown): WorkflowPackKey =>
    typeof value === "string" &&
    ["development", "novel", "report", "video_preprod", "web_research_report", "roleplay"].includes(value)
      ? (value as WorkflowPackKey)
      : "development";
  const ROLE_LABELS: Record<string, Record<string, string>> = {
    team_leader: { ko: "팀장", en: "Team Leader", ja: "チームリーダー", zh: "组长" },
    senior: { ko: "시니어", en: "Senior", ja: "シニア", zh: "高级" },
    junior: { ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级" },
    intern: { ko: "인턴", en: "Intern", ja: "インターン", zh: "实习生" },
  };

  const roleBadge = (role: string) => {
    const label = ROLE_LABELS[role];
    const text = label ? t(label as LangText) : role;
    const color =
      role === "team_leader"
        ? "text-amber-400 bg-amber-500/15"
        : role === "senior"
          ? "text-blue-400 bg-blue-500/15"
          : role === "junior"
            ? "text-emerald-400 bg-emerald-500/15"
            : "text-slate-400 bg-slate-500/15";
    return <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${color}`}>{text}</span>;
  };

  const packKeys = [
    ...new Set([
      "development",
      ...apiAssignDepts.map((dept) => dept.workflow_pack_key),
      ...apiAssignAgents.map((agent) => normalizeWorkflowPackKey(agent.workflow_pack_key)),
    ]),
  ] as WorkflowPackKey[];

  const packSections = packKeys
    .map((packKey) => {
      const depts = apiAssignDepts.filter((dept) => dept.workflow_pack_key === packKey);
      const deptIds = new Set(depts.map((dept) => dept.id));
      const departments = depts
        .map((dept) => ({
          dept,
          agents: apiAssignAgents.filter(
            (agent) => agent.department_id === dept.id && normalizeWorkflowPackKey(agent.workflow_pack_key) === packKey,
          ),
        }))
        .filter((group) => group.agents.length > 0);
      const unassigned = apiAssignAgents.filter(
        (agent) =>
          normalizeWorkflowPackKey(agent.workflow_pack_key) === packKey &&
          (!agent.department_id || !deptIds.has(agent.department_id)),
      );
      return {
        packKey,
        departments,
        unassigned,
      };
    })
    .filter((section) => section.departments.length > 0 || section.unassigned.length > 0);

  const renderAgentRow = (agent: Agent) => {
    const isAssigned =
      agent.cli_provider === "api" &&
      agent.api_provider_id === apiAssignTarget.providerId &&
      agent.api_model === apiAssignTarget.model;

    return (
      <button
        key={agent.id}
        disabled={apiAssigning || isAssigned}
        onClick={() => void handleApiAssignToAgent(agent.id)}
        className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2.5 ${
          isAssigned ? "bg-green-500/10 text-green-400 cursor-default" : "hover:bg-slate-700/60 text-slate-300"
        } disabled:opacity-60`}
      >
        <AgentAvatar agent={agent} spriteMap={spriteMap} size={28} rounded="xl" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium truncate">{localName(agent.name, agent.name_ko)}</span>
            {roleBadge(agent.role)}
          </div>
          <div className="text-[10px] text-slate-500 truncate mt-0.5">
            {agent.cli_provider === "api" && agent.api_model ? `API: ${agent.api_model}` : agent.cli_provider}
          </div>
        </div>
        {isAssigned && <span className="text-green-400 flex-shrink-0">✓</span>}
      </button>
    );
  };

  return (
    <Dialog
      open
      size="sm"
      onClose={() => setApiAssignTarget(null)}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
      title={t({
        ko: "에이전트에 모델 배정",
        en: "Assign Model to Agent",
        ja: "エージェントにモデル割当",
        zh: "分配模型给代理",
        fr: "Attribuer le modèle à un agent",
      })}
      footer={
        <button
          onClick={() => setApiAssignTarget(null)}
          className="text-xs px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded-lg transition-colors"
        >
          {t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
        </button>
      }
    >
      <p className="text-[11px] text-slate-400 mb-2 font-mono truncate">{apiAssignTarget.model}</p>
      <div className="space-y-3">
        {apiAssignAgents.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">
            {t({
              ko: "에이전트를 불러오는 중...",
              en: "Loading agents...",
              ja: "エージェント読み込み中...",
              zh: "正在加载代理...",
            })}
          </p>
        ) : (
          <>
            {packSections.map(({ packKey, departments, unassigned }) => (
              <div key={packKey} className="space-y-2">
                <div className="px-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t(getOfficePackMeta(packKey).label)}
                  </span>
                </div>
                {departments.map(({ dept, agents }) => (
                  <div key={`${packKey}:${dept.id}`}>
                    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-700/40">
                      <span className="text-sm">{dept.icon}</span>
                      <span className="text-[11px] font-semibold text-slate-300 tracking-wide">
                        {localName(dept.name, dept.name_ko)}
                      </span>
                      <span className="text-[10px] text-slate-600">({agents.length})</span>
                    </div>
                    {agents.map(renderAgentRow)}
                  </div>
                ))}
                {unassigned.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-700/40">
                      <span className="text-sm">📁</span>
                      <span className="text-[11px] font-semibold text-slate-500 tracking-wide">
                        {t({ ko: "미배정", en: "Unassigned", ja: "未配属", zh: "未分配" })}
                      </span>
                    </div>
                    {unassigned.map(renderAgentRow)}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </Dialog>
  );
}
