import { useMemo } from "react";
import { CircleCheck, ClipboardList, Users, Zap } from "lucide-react";
import type { Agent, CompanyStats, Task } from "../types";
import { localeName, useI18n } from "../i18n";
import {
  DashboardHeroHeader,
  DashboardHudStats,
  DashboardRankingBoard,
  type HudStat,
  type RankedAgent,
} from "./dashboard/HeroSections";
import { DashboardDeptAndSquad, DashboardMissionLog, type DepartmentPerformance } from "./dashboard/OpsSections";
import { useNow } from "./dashboard/model";

interface DashboardProps {
  stats: CompanyStats | null;
  agents: Agent[];
  tasks: Task[];
  companyName: string;
  onPrimaryCtaClick: () => void;
}

export default function Dashboard({ stats, agents, tasks, companyName, onPrimaryCtaClick }: DashboardProps) {
  const { t, language, locale: localeTag } = useI18n();
  const { date, time, briefing } = useNow(localeTag, t);
  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(localeTag), [localeTag]);

  const totalTasks = stats?.tasks?.total ?? tasks.length;
  const completedTasks = stats?.tasks?.done ?? tasks.filter((task) => task.status === "done").length;
  const inProgressTasks = stats?.tasks?.in_progress ?? tasks.filter((task) => task.status === "in_progress").length;
  const plannedTasks = stats?.tasks?.planned ?? tasks.filter((task) => task.status === "planned").length;
  const reviewTasks = stats?.tasks?.review ?? tasks.filter((task) => task.status === "review").length;
  const pendingTasks = tasks.filter((task) => task.status === "pending").length;
  const activeAgents = stats?.agents?.working ?? agents.filter((agent) => agent.status === "working").length;
  const idleAgents = stats?.agents?.idle ?? agents.filter((agent) => agent.status === "idle").length;
  const totalAgents = stats?.agents?.total ?? agents.length;
  const completionRate =
    stats?.tasks?.completion_rate ?? (totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0);
  const activeRate = totalAgents > 0 ? Math.round((activeAgents / totalAgents) * 100) : 0;
  const reviewQueue = reviewTasks + pendingTasks;

  const primaryCtaLabel = t({
    ko: "미션 시작",
    en: "Start Mission",
    ja: "ミッション開始",
    zh: "开始任务",
    fr: "Lancer une tâche",
  });
  const primaryCtaEyebrow = t({
    ko: "빠른 실행",
    en: "Quick Start",
    ja: "クイック開始",
    zh: "快速开始",
    fr: "Démarrage rapide",
  });
  const primaryCtaDescription = t({
    ko: "핵심 업무를 바로 생성하고 실행으로 전환하세요",
    en: "Create a priority task and move execution immediately.",
    ja: "最優先タスクをすぐ作成して実行へ移行します。",
    zh: "立即创建优先任务并进入执行。",
    fr: "Créez une tâche prioritaire et confiez-la tout de suite à vos agents.",
  });

  const deptData = useMemo<DepartmentPerformance[]>(() => {
    if (stats?.tasks_by_department && stats.tasks_by_department.length > 0) {
      return stats.tasks_by_department
        .map((department) => ({
          id: department.id,
          name: department.name,
          icon: department.icon ?? "🏢",
          done: department.done_tasks,
          total: department.total_tasks,
          ratio: department.total_tasks > 0 ? Math.round((department.done_tasks / department.total_tasks) * 100) : 0,
        }))
        .sort((a, b) => b.ratio - a.ratio || b.total - a.total);
    }

    const deptMap = new Map<string, { name: string; icon: string; done: number; total: number }>();
    for (const agent of agents) {
      if (!agent.department_id) continue;
      if (!deptMap.has(agent.department_id)) {
        deptMap.set(agent.department_id, {
          name: agent.department ? localeName(language, agent.department) : agent.department_id,
          icon: agent.department?.icon ?? "🏢",
          done: 0,
          total: 0,
        });
      }
    }
    for (const task of tasks) {
      if (!task.department_id) continue;
      const entry = deptMap.get(task.department_id);
      if (!entry) continue;
      entry.total += 1;
      if (task.status === "done") entry.done += 1;
    }
    return Array.from(deptMap.entries())
      .map(([id, value]) => ({
        id,
        ...value,
        ratio: value.total > 0 ? Math.round((value.done / value.total) * 100) : 0,
      }))
      .sort((a, b) => b.ratio - a.ratio || b.total - a.total);
  }, [stats, agents, tasks, language]);

  const topAgents = useMemo<RankedAgent[]>(() => {
    if (stats?.top_agents && stats.top_agents.length > 0) {
      return stats.top_agents.slice(0, 5).map((topAgent) => {
        const agent = agentMap.get(topAgent.id);
        return {
          id: topAgent.id,
          name: agent ? localeName(language, agent) : topAgent.name,
          department: agent?.department ? localeName(language, agent.department) : "",
          tasksDone: topAgent.stats_tasks_done,
          xp: topAgent.stats_xp,
        };
      });
    }
    return [...agents]
      .sort((a, b) => b.stats_xp - a.stats_xp)
      .slice(0, 5)
      .map((agent) => ({
        id: agent.id,
        name: localeName(language, agent),
        department: agent.department ? localeName(language, agent.department) : "",
        tasksDone: agent.stats_tasks_done,
        xp: agent.stats_xp,
      }));
  }, [stats, agents, agentMap, language]);

  const maxXp = topAgents.length > 0 ? Math.max(...topAgents.map((agent) => agent.xp), 1) : 1;
  const recentTasks = useMemo(() => [...tasks].sort((a, b) => b.updated_at - a.updated_at).slice(0, 6), [tasks]);
  const workingAgents = agents.filter((agent) => agent.status === "working");
  const idleAgentsList = agents.filter((agent) => agent.status === "idle");

  const podiumOrder =
    topAgents.length >= 3
      ? [topAgents[1], topAgents[0], topAgents[2]]
      : topAgents.length === 2
        ? [topAgents[1], topAgents[0]]
        : topAgents;

  const hudStats: HudStat[] = [
    {
      id: "total",
      label: t({ ko: "미션", en: "Tasks", ja: "ミッション", zh: "任务", fr: "Tâches" }),
      value: totalTasks,
      sub: t({ ko: "누적 태스크", en: "Total tasks", ja: "累積タスク", zh: "累计任务", fr: "au total" }),
      icon: ClipboardList,
    },
    {
      id: "clear",
      label: t({ ko: "완료율", en: "Completion rate", ja: "クリア率", zh: "完成率", fr: "Taux de réussite" }),
      value: `${completionRate}%`,
      sub: `${numberFormatter.format(completedTasks)} ${t({ ko: "클리어", en: "done", ja: "クリア", zh: "完成", fr: "terminées" })}`,
      icon: CircleCheck,
    },
    {
      id: "squad",
      label: t({ ko: "스쿼드", en: "Team", ja: "スクワッド", zh: "小队", fr: "Agents au travail" }),
      value: `${activeAgents}/${totalAgents}`,
      sub: `${t({ ko: "가동률", en: "uptime", ja: "稼働率", zh: "运行率", fr: "activité" })} ${activeRate}%`,
      icon: Users,
    },
    {
      id: "active",
      label: t({ ko: "진행중", en: "In progress", ja: "進行中", zh: "进行中", fr: "En cours" }),
      value: inProgressTasks,
      sub: `${t({ ko: "계획", en: "planned", ja: "計画", zh: "计划", fr: "planifiées :" })} ${numberFormatter.format(plannedTasks)}${t(
        {
          ko: "건",
          en: "",
          ja: "件",
          zh: "项",
          fr: "",
        },
      )}`,
      icon: Zap,
    },
  ];

  return (
    <section className="space-y-4" style={{ color: "var(--th-text-primary)" }}>
      <DashboardHeroHeader
        companyName={companyName}
        time={time}
        date={date}
        briefing={briefing}
        reviewQueue={reviewQueue}
        numberFormatter={numberFormatter}
        primaryCtaEyebrow={primaryCtaEyebrow}
        primaryCtaDescription={primaryCtaDescription}
        primaryCtaLabel={primaryCtaLabel}
        onPrimaryCtaClick={onPrimaryCtaClick}
        t={t}
      />

      <DashboardHudStats hudStats={hudStats} numberFormatter={numberFormatter} />

      <DashboardRankingBoard
        topAgents={topAgents}
        podiumOrder={podiumOrder}
        agentMap={agentMap}
        agents={agents}
        maxXp={maxXp}
        numberFormatter={numberFormatter}
        t={t}
      />

      <DashboardDeptAndSquad
        deptData={deptData}
        workingAgents={workingAgents}
        idleAgentsList={idleAgentsList}
        agents={agents}
        language={language}
        numberFormatter={numberFormatter}
        t={t}
      />

      <DashboardMissionLog
        recentTasks={recentTasks}
        agentMap={agentMap}
        agents={agents}
        language={language}
        localeTag={localeTag}
        idleAgents={idleAgents}
        numberFormatter={numberFormatter}
        t={t}
      />
    </section>
  );
}
