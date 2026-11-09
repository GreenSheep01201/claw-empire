import { Building2, FileText, Radio, Users } from "lucide-react";
import { localeName, type UiLanguage } from "../../i18n";
import type { Agent, Task } from "../../types";
import AgentAvatar from "../AgentAvatar";
import { ProgressBar, taskStatusBadgeClass, taskStatusLabel, timeAgo, type TFunction } from "./model";

export interface DepartmentPerformance {
  id: string;
  name: string;
  icon: string;
  done: number;
  total: number;
  ratio: number;
}

interface DashboardDeptAndSquadProps {
  deptData: DepartmentPerformance[];
  workingAgents: Agent[];
  idleAgentsList: Agent[];
  agents: Agent[];
  language: UiLanguage;
  numberFormatter: Intl.NumberFormat;
  t: TFunction;
}

const headingStyle = { color: "var(--th-text-heading)" } as const;
const rowStyle = { border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" } as const;

export function DashboardDeptAndSquad({
  deptData,
  workingAgents,
  idleAgentsList,
  agents,
  language,
  numberFormatter,
  t,
}: DashboardDeptAndSquadProps) {
  const workingLabel = t({ ko: "작업 중", en: "Working", ja: "作業中", zh: "工作中", fr: "Au travail" });
  const idleLabel = t({ ko: "대기 중", en: "Idle", ja: "待機中", zh: "空闲", fr: "Disponible" });

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
      <div className="qg-card">
        <div className="mb-4 flex items-center gap-2">
          <Building2 size={16} aria-hidden="true" className="qg-text-secondary" />
          <h2 className="text-base font-semibold" style={headingStyle}>
            {t({
              ko: "부서 성과",
              en: "Department performance",
              ja: "部署パフォーマンス",
              zh: "部门绩效",
              fr: "Avancement par pôle",
            })}
          </h2>
          <span className="ml-auto text-[13px] qg-text-muted">
            {t({ ko: "부서별 성과", en: "by department", ja: "部署別", zh: "按部门", fr: "tâches terminées" })}
          </span>
        </div>

        {deptData.length === 0 ? (
          <div className="qg-empty">
            {t({
              ko: "데이터가 없습니다",
              en: "No data available",
              ja: "データがありません",
              zh: "暂无数据",
              fr: "Aucune donnée pour l'instant",
            })}
          </div>
        ) : (
          <ul className="space-y-2.5">
            {deptData.map((dept) => (
              <li key={dept.id} className="rounded-[var(--qg-radius)] p-3" style={rowStyle}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-base"
                      aria-hidden="true"
                    >
                      {dept.icon}
                    </span>
                    <span className="truncate text-sm font-semibold" style={headingStyle}>
                      {dept.name}
                    </span>
                  </div>
                  <span className={dept.ratio >= 100 ? "qg-badge qg-badge--accent" : "qg-badge"}>{dept.ratio}%</span>
                </div>

                <div className="mt-2.5">
                  <ProgressBar value={dept.done} max={dept.total} label={dept.name} />
                </div>

                <div className="mt-1.5 flex justify-between text-[13px] qg-text-muted">
                  <span>
                    {t({ ko: "클리어", en: "Done", ja: "クリア", zh: "完成", fr: "Terminées" })}{" "}
                    {numberFormatter.format(dept.done)}
                  </span>
                  <span>
                    {t({ ko: "전체", en: "Total", ja: "全体", zh: "总计", fr: "Total" })}{" "}
                    {numberFormatter.format(dept.total)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="qg-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users size={16} aria-hidden="true" className="qg-text-secondary" />
            <h2 className="text-base font-semibold" style={headingStyle}>
              {t({ ko: "스쿼드", en: "Team", ja: "スクワッド", zh: "小队", fr: "Équipe" })}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="qg-badge qg-badge--accent">
              {workingLabel} {numberFormatter.format(workingAgents.length)}
            </span>
            <span className="qg-badge">
              {idleLabel} {numberFormatter.format(idleAgentsList.length)}
            </span>
          </div>
        </div>

        <ul className="flex flex-wrap gap-3">
          {agents.map((agent) => {
            const isWorking = agent.status === "working";
            const name = localeName(language, agent);
            return (
              <li
                key={agent.id}
                title={`${name} — ${isWorking ? workingLabel : idleLabel}`}
                className="flex flex-col items-center gap-1.5"
              >
                <div className="relative">
                  <div
                    className="overflow-hidden rounded-2xl"
                    style={{
                      border: isWorking ? "2px solid var(--qg-accent)" : "1px solid var(--th-border)",
                      opacity: isWorking ? 1 : 0.75,
                    }}
                  >
                    <AgentAvatar agent={agent} agents={agents} size={40} rounded="2xl" />
                  </div>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2"
                    style={{
                      borderColor: "var(--th-bg-primary)",
                      background: isWorking ? "var(--qg-accent)" : "var(--th-text-muted)",
                    }}
                  />
                  <span className="sr-only">{isWorking ? workingLabel : idleLabel}</span>
                </div>
                <span
                  className="max-w-[64px] truncate text-center text-[13px] font-medium leading-tight"
                  style={{ color: isWorking ? "var(--th-text-primary)" : "var(--th-text-muted)" }}
                >
                  {name}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

interface DashboardMissionLogProps {
  recentTasks: Task[];
  agentMap: Map<string, Agent>;
  agents: Agent[];
  language: UiLanguage;
  localeTag: string;
  idleAgents: number;
  numberFormatter: Intl.NumberFormat;
  t: TFunction;
}

export function DashboardMissionLog({
  recentTasks,
  agentMap,
  agents,
  language,
  localeTag,
  idleAgents,
  numberFormatter,
  t,
}: DashboardMissionLogProps) {
  return (
    <div className="qg-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio size={16} aria-hidden="true" className="qg-text-secondary" />
          <h2 className="text-base font-semibold" style={headingStyle}>
            {t({ ko: "미션 로그", en: "Activity log", ja: "ミッションログ", zh: "任务日志", fr: "Activité récente" })}
          </h2>
          <span className="text-[13px] qg-text-muted">
            {t({
              ko: "최근 활동",
              en: "Recent activity",
              ja: "最近の活動",
              zh: "最近活动",
              fr: "dernières tâches mises à jour",
            })}
          </span>
        </div>
        <span className="qg-badge">
          {t({ ko: "유휴", en: "Idle", ja: "待機", zh: "空闲", fr: "Disponibles :" })}{" "}
          {numberFormatter.format(idleAgents)}
          {t({ ko: "명", en: "", ja: "人", zh: "人", fr: "" })}
        </span>
      </div>

      {recentTasks.length === 0 ? (
        <div className="qg-empty">
          {t({ ko: "로그 없음", en: "No logs", ja: "ログなし", zh: "暂无日志", fr: "Aucune activité pour l'instant" })}
        </div>
      ) : (
        <ul className="space-y-2">
          {recentTasks.map((task) => {
            const assignedAgent =
              task.assigned_agent ?? (task.assigned_agent_id ? agentMap.get(task.assigned_agent_id) : undefined);

            return (
              <li
                key={task.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[var(--qg-radius)] p-3"
                style={rowStyle}
              >
                {assignedAgent ? (
                  <AgentAvatar agent={assignedAgent} agents={agents} size={36} rounded="xl" />
                ) : (
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl qg-text-muted"
                    style={{ border: "1px solid var(--th-border)" }}
                  >
                    <FileText size={16} aria-hidden="true" />
                  </div>
                )}

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={headingStyle}>
                    {task.title}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] qg-text-muted">
                    {assignedAgent
                      ? localeName(language, assignedAgent)
                      : t({ ko: "미배정", en: "Unassigned", ja: "未割り当て", zh: "未分配", fr: "Non attribuée" })}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span className={taskStatusBadgeClass(task.status)}>{taskStatusLabel(task.status, t)}</span>
                  <span className="text-[13px] qg-text-muted">{timeAgo(task.updated_at, localeTag)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
