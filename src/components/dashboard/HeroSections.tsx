import { ArrowRight, Bell, Clock, Medal, Plus, Trophy, Users, type LucideIcon } from "lucide-react";
import AgentAvatar from "../AgentAvatar";
import type { Agent } from "../../types";
import { RankBadge, XpBar, type TFunction } from "./model";

export interface HudStat {
  id: string;
  label: string;
  value: number | string;
  sub: string;
  icon: LucideIcon;
}

export interface RankedAgent {
  id: string;
  name: string;
  department: string;
  tasksDone: number;
  xp: number;
}

interface DashboardHeroHeaderProps {
  companyName: string;
  time: string;
  date: string;
  briefing: string;
  reviewQueue: number;
  numberFormatter: Intl.NumberFormat;
  primaryCtaEyebrow: string;
  primaryCtaDescription: string;
  primaryCtaLabel: string;
  onPrimaryCtaClick: () => void;
  t: TFunction;
}

const headingStyle = { color: "var(--th-text-heading)" } as const;

export function DashboardHeroHeader({
  companyName,
  time,
  date,
  briefing,
  reviewQueue,
  numberFormatter,
  primaryCtaEyebrow,
  primaryCtaDescription,
  primaryCtaLabel,
  onPrimaryCtaClick,
  t,
}: DashboardHeroHeaderProps) {
  return (
    <div className="qg-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" style={headingStyle}>
              {companyName}
            </h1>
            <span className="qg-badge qg-badge--accent">
              {t({ ko: "실시간", en: "Live", ja: "ライブ", zh: "实时", fr: "En direct" })}
            </span>
          </div>
          <p className="text-sm qg-text-muted">
            {t({
              ko: "에이전트들이 실시간으로 미션을 수행 중입니다",
              en: "Agents are executing missions in real time",
              ja: "エージェントがリアルタイムでミッションを実行中です",
              zh: "代理正在实时执行任务",
              fr: "Vos agents traitent les tâches en temps réel",
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Clock size={16} aria-hidden="true" className="qg-text-muted" />
            <span className="font-mono text-xl font-semibold tabular-nums" style={headingStyle}>
              {time}
            </span>
          </div>
          <div className="hidden flex-col text-[13px] sm:flex">
            <span className="qg-text-secondary">{date}</span>
            <span className="qg-text-muted">{briefing}</span>
          </div>
          {reviewQueue > 0 && (
            <span className="qg-badge qg-badge--pin">
              <Bell size={14} aria-hidden="true" />
              {t({ ko: "대기", en: "Queued", ja: "待機", zh: "待处理", fr: "En attente :" })}{" "}
              {numberFormatter.format(reviewQueue)}
              {t({ ko: "건", en: "", ja: "件", zh: "项", fr: "" })}
            </span>
          )}
        </div>
      </div>

      <div
        className="flex flex-col gap-3 rounded-[var(--qg-radius)] p-4 sm:flex-row sm:items-center sm:justify-between"
        style={{ background: "var(--qg-accent-soft)" }}
      >
        <div className="min-w-0">
          <p className="text-[13px] font-semibold qg-text-secondary">{primaryCtaEyebrow}</p>
          <p className="mt-1 text-sm" style={{ color: "var(--th-text-primary)" }}>
            {primaryCtaDescription}
          </p>
        </div>
        <button
          type="button"
          onClick={onPrimaryCtaClick}
          className="qg-btn qg-btn--primary w-full sm:w-auto sm:min-w-[200px]"
        >
          <Plus size={16} aria-hidden="true" />
          <span>{primaryCtaLabel}</span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

interface DashboardHudStatsProps {
  hudStats: HudStat[];
  numberFormatter: Intl.NumberFormat;
}

export function DashboardHudStats({ hudStats, numberFormatter }: DashboardHudStatsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {hudStats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.id} className="qg-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold qg-text-secondary">{stat.label}</p>
                <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums" style={headingStyle}>
                  {typeof stat.value === "number" ? numberFormatter.format(stat.value) : stat.value}
                </p>
                <p className="mt-0.5 text-[13px] qg-text-muted">{stat.sub}</p>
              </div>
              <Icon size={16} aria-hidden="true" className="mt-0.5 qg-text-muted" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface DashboardRankingBoardProps {
  topAgents: RankedAgent[];
  podiumOrder: RankedAgent[];
  agentMap: Map<string, Agent>;
  agents: Agent[];
  maxXp: number;
  numberFormatter: Intl.NumberFormat;
  t: TFunction;
}

export function DashboardRankingBoard({
  topAgents,
  podiumOrder,
  agentMap,
  agents,
  maxXp,
  numberFormatter,
  t,
}: DashboardRankingBoardProps) {
  const unassigned = t({ ko: "미지정", en: "Unassigned", ja: "未指定", zh: "未指定", fr: "Sans pôle" });

  return (
    <div className="qg-card">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Trophy size={16} aria-hidden="true" className="qg-text-secondary" />
          <div>
            <h2 className="text-base font-semibold" style={headingStyle}>
              {t({ ko: "랭킹 보드", en: "Ranking board", ja: "ランキングボード", zh: "排行榜", fr: "Classement" })}
            </h2>
            <p className="text-[13px] qg-text-muted">
              {t({
                ko: "XP 기준 에이전트 순위",
                en: "Agent ranking by XP",
                ja: "XP 基準のエージェント順位",
                zh: "按 XP 排名",
                fr: "Agents classés selon leur expérience (XP)",
              })}
            </p>
          </div>
        </div>
        <span className="qg-badge">Top {topAgents.length}</span>
      </div>

      {topAgents.length === 0 ? (
        <div className="qg-empty flex flex-col items-center gap-2">
          <Users size={16} aria-hidden="true" />
          <p>
            {t({
              ko: "등록된 에이전트가 없습니다",
              en: "No agents registered",
              ja: "登録されたエージェントがいません",
              zh: "暂无已注册代理",
              fr: "Aucun agent pour l'instant",
            })}
          </p>
          <p className="text-[13px]">
            {t({
              ko: "에이전트를 추가하고 미션을 시작하세요",
              en: "Add agents and start missions",
              ja: "エージェントを追加してミッションを開始しましょう",
              zh: "添加代理并开始任务",
              fr: "Ajoutez des agents puis lancez une tâche",
            })}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {topAgents.length >= 2 && (
            <ol className="flex items-end justify-center gap-4 pb-1 pt-2 sm:gap-6">
              {podiumOrder.map((agent, visualIdx) => {
                const ranks = topAgents.length >= 3 ? [2, 1, 3] : [2, 1];
                const rank = ranks[visualIdx];
                const isFirst = rank === 1;
                const avatarSize = isFirst ? 64 : 48;
                const podiumHeight = isFirst ? "h-20" : rank === 2 ? "h-14" : "h-10";

                return (
                  <li key={agent.id} className="flex flex-col items-center gap-2">
                    {isFirst && <Medal size={16} aria-hidden="true" style={{ color: "var(--qg-accent)" }} />}
                    <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--th-border)" }}>
                      <AgentAvatar agent={agentMap.get(agent.id)} agents={agents} size={avatarSize} rounded="2xl" />
                    </div>
                    <span
                      className={`max-w-[96px] truncate text-center font-semibold ${isFirst ? "text-sm" : "text-[13px]"}`}
                      style={headingStyle}
                    >
                      {agent.name}
                    </span>
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-mono text-[13px] font-semibold qg-text-secondary">
                        {numberFormatter.format(agent.xp)} XP
                      </span>
                      <RankBadge xp={agent.xp} />
                    </div>
                    <div
                      className={`${podiumHeight} flex w-20 items-center justify-center rounded-t-[var(--qg-radius)] sm:w-24`}
                      style={{
                        background: isFirst ? "var(--qg-accent-soft)" : "var(--th-bg-surface)",
                        border: "1px solid var(--th-border)",
                        borderBottom: "none",
                      }}
                    >
                      <span className="text-xl font-bold qg-text-secondary">
                        <span className="sr-only">{t({ ko: "순위", en: "Rank", fr: "Rang" })} </span>#{rank}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {topAgents.length > 3 && (
            <ol className="space-y-2 pt-4" style={{ borderTop: "1px solid var(--th-border)" }} start={4}>
              {topAgents.slice(3).map((agent, idx) => {
                const rank = idx + 4;
                return (
                  <li
                    key={agent.id}
                    className="flex items-center gap-3 rounded-[var(--qg-radius)] p-3"
                    style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}
                  >
                    <span className="w-8 text-center font-mono text-sm font-semibold qg-text-muted">#{rank}</span>
                    <div className="flex-shrink-0 overflow-hidden rounded-xl">
                      <AgentAvatar agent={agentMap.get(agent.id)} agents={agents} size={36} rounded="xl" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" style={headingStyle}>
                        {agent.name}
                      </p>
                      <p className="text-[13px] qg-text-muted">{agent.department || unassigned}</p>
                    </div>
                    <div className="hidden w-28 sm:block">
                      <XpBar xp={agent.xp} maxXp={maxXp} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold qg-text-secondary">
                        {numberFormatter.format(agent.xp)}
                      </span>
                      <RankBadge xp={agent.xp} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {topAgents.length === 1 &&
            (() => {
              const agent = topAgents[0];
              return (
                <div
                  className="flex items-center gap-4 rounded-[var(--qg-radius)] p-4"
                  style={{ background: "var(--qg-accent-soft)", border: "1px solid var(--th-border)" }}
                >
                  <Medal size={16} aria-hidden="true" style={{ color: "var(--qg-accent)" }} />
                  <div className="overflow-hidden rounded-2xl">
                    <AgentAvatar agent={agentMap.get(agent.id)} agents={agents} size={52} rounded="2xl" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold" style={headingStyle}>
                      {agent.name}
                    </p>
                    <p className="text-[13px] qg-text-muted">{agent.department || unassigned}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="font-mono text-lg font-semibold" style={headingStyle}>
                      {numberFormatter.format(agent.xp)} XP
                    </p>
                    <RankBadge xp={agent.xp} />
                  </div>
                </div>
              );
            })()}
        </div>
      )}
    </div>
  );
}
