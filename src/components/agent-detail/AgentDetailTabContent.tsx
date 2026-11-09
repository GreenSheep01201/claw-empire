import {
  Ban,
  CircleCheck,
  ClipboardList,
  Hammer,
  Hourglass,
  Link2,
  MessageSquare,
  SquareTerminal,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { localeName, type UiLanguage } from "../../i18n";
import type { Agent, Department, SubAgent, SubTask, Task } from "../../types";
import { getSubAgentSpriteNum, taskStatusLabel, taskTypeLabel, type TFunction } from "./constants";

const SUBTASK_ICON: Record<string, ReactNode> = {
  pending: <Hourglass size={16} aria-hidden="true" />,
  in_progress: <Hammer size={16} aria-hidden="true" />,
  done: <CircleCheck size={16} aria-hidden="true" />,
  blocked: <Ban size={16} aria-hidden="true" />,
};

interface AgentDetailTabContentProps {
  tab: "info" | "tasks" | "alba";
  t: TFunction;
  language: UiLanguage;
  agent: Agent;
  departments: Department[];
  agentTasks: Task[];
  agentSubAgents: SubAgent[];
  subtasksByTask: Record<string, SubTask[]>;
  expandedTaskId: string | null;
  setExpandedTaskId: (taskId: string | null) => void;
  onChat: (agent: Agent) => void;
  onAssignTask: (agentId: string) => void;
  onOpenTerminal?: (taskId: string) => void;
}

export default function AgentDetailTabContent({
  tab,
  t,
  language,
  agent,
  departments,
  agentTasks,
  agentSubAgents,
  subtasksByTask,
  expandedTaskId,
  setExpandedTaskId,
  onChat,
  onAssignTask,
  onOpenTerminal,
}: AgentDetailTabContentProps) {
  const xpLevel = Math.floor(agent.stats_xp / 100) + 1;

  if (tab === "info") {
    return (
      <div className="space-y-3">
        <div className="qg-card">
          <div className="text-[13px] font-semibold qg-text-muted mb-1">
            {t({ ko: "성격", en: "Personality", ja: "性格", zh: "性格", fr: "Personnalité" })}
          </div>
          <div className="text-sm qg-text-secondary">
            {agent.personality ??
              t({ ko: "설정 없음", en: "Not set", ja: "未設定", zh: "未设置", fr: "Non renseignée" })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="qg-card text-center" style={{ padding: 12 }}>
            <div className="text-lg font-bold" style={{ color: "var(--th-text-heading)" }}>
              {agent.stats_tasks_done}
            </div>
            <div className="text-[13px] qg-text-muted">
              {t({ ko: "완료 업무", en: "Completed", ja: "完了タスク", zh: "已完成任务", fr: "Terminées" })}
            </div>
          </div>
          <div className="qg-card text-center" style={{ padding: 12 }}>
            <div className="text-lg font-bold" style={{ color: "var(--th-text-heading)" }}>
              {xpLevel}
            </div>
            <div className="text-[13px] qg-text-muted">
              {t({ ko: "레벨", en: "Level", ja: "レベル", zh: "等级", fr: "Niveau" })}
            </div>
          </div>
          <div className="qg-card text-center" style={{ padding: 12 }}>
            <div className="text-lg font-bold" style={{ color: "var(--th-text-heading)" }}>
              {agentSubAgents.filter((subAgent) => subAgent.status === "working").length}
            </div>
            <div className="text-[13px] qg-text-muted">
              {t({ ko: "알바생", en: "Sub-agents", ja: "サブエージェント", zh: "子代理", fr: "Sous-agents" })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={() => onChat(agent)} className="qg-btn qg-btn--primary flex-1">
            <MessageSquare size={16} aria-hidden="true" />
            {t({ ko: "대화하기", en: "Chat", ja: "チャット", zh: "对话", fr: "Discuter" })}
          </button>
          <button type="button" onClick={() => onAssignTask(agent.id)} className="qg-btn flex-1">
            <ClipboardList size={16} aria-hidden="true" />
            {t({ ko: "업무 배정", en: "Assign Task", ja: "タスク割り当て", zh: "分配任务", fr: "Confier une tâche" })}
          </button>
        </div>
        {agent.status === "working" && agent.current_task_id && onOpenTerminal && (
          <button
            type="button"
            onClick={() => onOpenTerminal(agent.current_task_id!)}
            className="qg-btn qg-btn--ghost w-full mt-2"
          >
            <SquareTerminal size={16} aria-hidden="true" />
            {t({
              ko: "터미널 보기",
              en: "View Terminal",
              ja: "ターミナル表示",
              zh: "查看终端",
              fr: "Voir le terminal",
            })}
          </button>
        )}
      </div>
    );
  }

  if (tab === "tasks") {
    return (
      <div className="space-y-2">
        {agentTasks.length === 0 ? (
          <div className="qg-empty">
            {t({
              ko: "배정된 업무가 없습니다",
              en: "No assigned tasks",
              ja: "割り当てられたタスクはありません",
              zh: "暂无已分配任务",
              fr: "Aucune tâche confiée",
            })}
          </div>
        ) : (
          agentTasks.map((taskItem) => {
            const taskSubtasks = subtasksByTask[taskItem.id] ?? [];
            const isExpanded = expandedTaskId === taskItem.id;
            const subTotal = taskItem.subtask_total ?? taskSubtasks.length;
            const subDone = taskItem.subtask_done ?? taskSubtasks.filter((subtask) => subtask.status === "done").length;
            return (
              <div key={taskItem.id} className="qg-card" style={{ padding: 12 }}>
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedTaskId(isExpanded ? null : taskItem.id)}
                  className="flex items-start gap-3 w-full text-left"
                >
                  <div
                    aria-hidden="true"
                    className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                    style={{
                      background:
                        taskItem.status === "done"
                          ? "var(--th-text-secondary)"
                          : taskItem.status === "in_progress"
                            ? "var(--qg-accent)"
                            : "transparent",
                      boxShadow: "inset 0 0 0 1px var(--th-text-muted)",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" style={{ color: "var(--th-text-heading)" }}>
                      {taskItem.title}
                    </div>
                    <div className="text-[13px] qg-text-muted mt-0.5">
                      {taskStatusLabel(taskItem.status, t)} · {taskTypeLabel(taskItem.task_type, t)}
                    </div>
                    {subTotal > 0 && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <div
                          className="flex-1 h-1 rounded-full overflow-hidden"
                          style={{ background: "var(--th-bg-surface-hover)" }}
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.round((subDone / subTotal) * 100)}%`,
                              background: "var(--qg-accent)",
                            }}
                          />
                        </div>
                        <span className="text-[13px] qg-text-muted whitespace-nowrap">
                          {subDone}/{subTotal}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
                {isExpanded && taskSubtasks.length > 0 && (
                  <div className="mt-2 ml-5 space-y-1 border-l pl-2" style={{ borderColor: "var(--th-border)" }}>
                    {taskSubtasks.map((subtask) => {
                      const targetDepartment = subtask.target_department_id
                        ? departments.find((department) => department.id === subtask.target_department_id)
                        : null;
                      return (
                        <div key={subtask.id} className="flex items-center gap-1.5 text-[13px]">
                          <span className="qg-text-muted shrink-0" title={taskStatusLabel(subtask.status, t)}>
                            {SUBTASK_ICON[subtask.status] ?? SUBTASK_ICON.pending}
                          </span>
                          <span
                            className={`flex-1 truncate ${subtask.status === "done" ? "line-through qg-text-muted" : "qg-text-secondary"}`}
                          >
                            {subtask.title}
                          </span>
                          {targetDepartment && (
                            <span
                              className="shrink-0 rounded px-1 py-0.5 text-[13px] font-medium"
                              style={{ backgroundColor: targetDepartment.color + "30", color: targetDepartment.color }}
                            >
                              {targetDepartment.icon} {localeName(language, targetDepartment)}
                            </span>
                          )}
                          {subtask.delegated_task_id && subtask.status !== "done" && (
                            <span
                              className="qg-text-secondary shrink-0"
                              title={t({ ko: "위임됨", en: "Delegated", ja: "委任済み", zh: "已委派", fr: "Déléguée" })}
                            >
                              <Link2 size={16} aria-hidden="true" />
                              <span className="sr-only">
                                {t({ ko: "위임됨", en: "Delegated", ja: "委任済み", zh: "已委派", fr: "Déléguée" })}
                              </span>
                            </span>
                          )}
                          {subtask.status === "blocked" && subtask.blocked_reason && (
                            <span
                              className="text-[13px] truncate max-w-[120px]"
                              style={{ color: "var(--qg-pin)" }}
                              title={subtask.blocked_reason}
                            >
                              {subtask.blocked_reason}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {agentSubAgents.length === 0 ? (
        <div className="qg-empty">
          <Users size={16} aria-hidden="true" className="mx-auto mb-2" />
          {t({
            ko: "현재 알바생이 없습니다",
            en: "No sub-agents currently",
            ja: "現在サブエージェントはいません",
            zh: "当前没有子代理",
            fr: "Aucun sous-agent pour le moment",
          })}
          <div className="text-[13px] mt-1">
            {t({
              ko: "병렬 처리 시 자동으로 알바생이 소환됩니다",
              en: "Sub-agents are spawned automatically during parallel work.",
              ja: "並列処理時にサブエージェントが自動で生成されます。",
              zh: "并行处理时会自动生成子代理。",
              fr: "Des sous-agents sont créés automatiquement lors du travail en parallèle.",
            })}
          </div>
        </div>
      ) : (
        agentSubAgents.map((subAgent) => (
          <div
            key={subAgent.id}
            className={`qg-card flex items-center gap-3 ${subAgent.status === "working" ? "animate-alba-spawn" : ""}`}
            style={{ padding: 12 }}
          >
            <div
              className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center"
              style={{ background: "var(--th-bg-surface-hover)" }}
            >
              <img
                src={`/sprites/${getSubAgentSpriteNum(subAgent.id)}-D-1.png`}
                alt={t({ ko: "알바생", en: "Sub-agent", ja: "サブエージェント", zh: "子代理", fr: "Sous-agent" })}
                className="w-full h-full object-cover"
                style={{ imageRendering: "pixelated" }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate flex items-center gap-1.5" style={{ color: "var(--th-text-heading)" }}>
                <span className="qg-badge">
                  {t({ ko: "알바", en: "Sub", ja: "サブ", zh: "子任务", fr: "Sous-agent" })}
                </span>
                {subAgent.task}
              </div>
              <div className="text-[13px] qg-text-muted mt-0.5 flex items-center gap-1">
                {subAgent.status === "working" ? (
                  <>
                    <Hammer size={16} aria-hidden="true" />
                    {t({ ko: "작업중...", en: "Working...", ja: "作業中...", zh: "工作中...", fr: "Au travail…" })}
                  </>
                ) : (
                  <>
                    <CircleCheck size={16} aria-hidden="true" />
                    {t({ ko: "완료", en: "Done", ja: "完了", zh: "完成", fr: "Terminé" })}
                  </>
                )}
              </div>
            </div>
            {subAgent.status === "working" && (
              <div
                aria-hidden="true"
                className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: "var(--qg-accent)", borderTopColor: "transparent" }}
              />
            )}
          </div>
        ))
      )}
    </div>
  );
}
