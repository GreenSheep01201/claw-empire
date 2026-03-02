import { useState, useEffect, useMemo, useCallback } from "react";
import { useI18n } from "../i18n";
import type { CronJob, CronJobsResponse } from "../api/cron-monitor";
import { getCronJobs } from "../api/cron-monitor";

type SourceFilter = "all" | "crontab" | "launchd";

/* ── HUD stat card ── */
function HudCard({
  label,
  value,
  icon,
  color,
  sub,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
  sub: string;
}) {
  return (
    <div
      className="game-panel group relative overflow-hidden p-4 transition-all duration-300 hover:-translate-y-0.5"
      style={{ borderColor: `${color}25` }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />
      <div className="relative flex items-center justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--th-text-muted)" }}>
            {label}
          </p>
          <p className="mt-1 text-3xl font-black tracking-tight" style={{ color, textShadow: `0 0 20px ${color}40` }}>
            {value}
          </p>
          <p className="mt-0.5 text-[10px]" style={{ color: "var(--th-text-muted)" }}>
            {sub}
          </p>
        </div>
        <span
          className="text-3xl opacity-20 transition-all duration-300 group-hover:opacity-40 group-hover:scale-110"
          style={{ filter: `drop-shadow(0 0 8px ${color}40)` }}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

/* ── Source badge ── */
function SourceBadge({ source }: { source: "crontab" | "launchd" }) {
  const isCron = source === "crontab";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md border ${
        isCron
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-400/25"
          : "bg-purple-500/10 text-purple-400 border-purple-400/25"
      }`}
      style={{ boxShadow: isCron ? "0 0 6px rgba(16,185,129,0.15)" : "0 0 6px rgba(139,92,246,0.15)" }}
    >
      {isCron ? "🐧" : "🍎"} {source}
    </span>
  );
}

/* ── Single job card ── */
function JobCard({ job, t }: { job: CronJob; t: ReturnType<typeof useI18n>["t"] }) {
  const borderColor = job.enabled
    ? job.source === "crontab"
      ? "border-l-emerald-400"
      : "border-l-purple-400"
    : "border-l-slate-600";

  return (
    <article
      className={`group grid grid-cols-[1fr_auto] items-start gap-3 rounded-xl border border-white/[0.06] border-l-[3px] ${borderColor} bg-white/[0.02] p-3.5 transition-all duration-200 hover:bg-white/[0.04] hover:translate-x-1`}
    >
      <div className="min-w-0 space-y-1.5">
        {/* Top row: source + schedule */}
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge source={job.source} />
          <span className="text-xs font-bold" style={{ color: "var(--th-text-primary)" }}>
            {job.scheduleHuman}
          </span>
          <span className="font-mono text-[10px]" style={{ color: "var(--th-text-muted)" }}>
            {job.schedule}
          </span>
        </div>

        {/* Command */}
        <div
          className="font-mono text-[11px] truncate"
          style={{ color: "var(--th-text-secondary)" }}
          title={job.command}
        >
          <span style={{ color: "var(--th-text-muted)" }}>$</span> {job.command}
        </div>

        {/* Label / plist path */}
        {(job.label || job.plistPath) && (
          <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--th-text-muted)" }}>
            {job.label && (
              <span className="truncate max-w-[260px]" title={job.label}>
                🏷️ {job.label}
              </span>
            )}
            {job.plistPath && (
              <span className="truncate max-w-[260px]" title={job.plistPath}>
                📂 {job.plistPath.replace(/.*\/Library\/LaunchAgents\//, "~/LaunchAgents/")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right side: status + next run */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {job.enabled ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {t({ ko: "가동 중", en: "Active", ja: "稼働中", zh: "运行中" })}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold"
            style={{ borderColor: "var(--th-border)", color: "var(--th-text-muted)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            {t({ ko: "정지", en: "Paused", ja: "休止中", zh: "已暂停" })}
          </span>
        )}
        {job.nextRun ? (
          <span className="text-[10px] font-medium" style={{ color: "var(--th-text-secondary)" }}>
            ⏰{" "}
            {new Date(job.nextRun).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : (
          <span className="text-[10px]" style={{ color: "var(--th-text-muted)" }}>
            —
          </span>
        )}
      </div>
    </article>
  );
}

/* ── Main component ── */
export default function CronMonitor() {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [platform, setPlatform] = useState<CronJobsResponse["platform"]>("unknown");
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const fetchJobs = useCallback(async () => {
    try {
      setError(null);
      const data = await getCronJobs();
      setJobs(data.jobs);
      setPlatform(data.platform);
      setRefreshedAt(data.refreshedAt);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchJobs();
    const interval = setInterval(() => void fetchJobs(), 60_000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const filteredJobs = useMemo(() => {
    if (sourceFilter === "all") return jobs;
    return jobs.filter((j) => j.source === sourceFilter);
  }, [jobs, sourceFilter]);

  const crontabCount = useMemo(() => jobs.filter((j) => j.source === "crontab").length, [jobs]);
  const launchdCount = useMemo(() => jobs.filter((j) => j.source === "launchd").length, [jobs]);
  const enabledCount = useMemo(() => jobs.filter((j) => j.enabled).length, [jobs]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto mb-4" />
          <div className="text-sm" style={{ color: "var(--th-text-muted)" }}>
            {t({
              ko: "순찰 데이터 로딩중...",
              en: "Loading patrol data...",
              ja: "巡回任務データを読み込み中...",
              zh: "正在加载巡逻数据...",
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error && jobs.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <div className="text-sm" style={{ color: "var(--th-text-muted)" }}>
            {t({
              ko: "순찰 데이터를 불러올 수 없습니다",
              en: "Unable to load patrol data",
              ja: "巡回任務データを取得できません",
              zh: "无法加载巡逻数据",
            })}
          </div>
          <div className="text-xs mt-1 font-mono" style={{ color: "var(--th-text-muted)" }}>
            {error}
          </div>
          <button
            onClick={() => {
              setLoading(true);
              void fetchJobs();
            }}
            className="mt-4 px-4 py-2 text-sm bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-600/30 transition-all"
          >
            {t({ ko: "다시 시도", en: "Retry", ja: "再取得", zh: "重试" })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="relative isolate space-y-4" style={{ color: "var(--th-text-primary)" }}>
      {/* Ambient background blurs */}
      <div className="pointer-events-none absolute -top-20 left-1/4 h-60 w-60 rounded-full bg-cyan-500/10 blur-[100px] animate-drift-slow" />
      <div className="pointer-events-none absolute top-40 right-1/6 h-48 w-48 rounded-full bg-purple-500/8 blur-[100px] animate-drift-slow-rev" />

      {/* ── Hero header ── */}
      <div className="game-panel relative overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.03)_2px,rgba(0,0,0,0.03)_4px)]" />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-lg"
                style={{ boxShadow: "0 0 10px rgba(34,211,238,0.25)" }}
              >
                🛡️
              </span>
              <h2 className="dashboard-title-gradient text-xl font-black tracking-tight sm:text-2xl">
                {t({
                  ko: "자동 순찰 보드",
                  en: "Patrol Board",
                  ja: "自動巡回ボード",
                  zh: "自动巡逻面板",
                })}
              </h2>
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                {t({ ko: "실시간", en: "LIVE", ja: "ライブ", zh: "实时" })}
              </span>
            </div>
            <p className="text-xs" style={{ color: "var(--th-text-muted)" }}>
              {t({
                ko: "crontab & launchd 기반 자동 반복 임무를 모니터링합니다",
                en: "Monitoring automated recurring missions via crontab & launchd",
                ja: "crontab と launchd の定期実行ジョブを一覧監視します",
                zh: "监控基于 crontab 和 launchd 的自动循环任务",
              })}
              {platform !== "unknown" && (
                <span
                  className="ml-2 inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10px]"
                  style={{ color: "var(--th-text-muted)" }}
                >
                  {platform === "darwin" ? "🍎" : "🐧"} {platform}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {refreshedAt && (
              <span
                className="hidden sm:inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[10px] font-mono"
                style={{ color: "var(--th-text-muted)" }}
              >
                {t({ ko: "마지막 스캔", en: "Last scan", ja: "最終スキャン", zh: "上次扫描" })}{" "}
                {new Date(refreshedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => void fetchJobs()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-300 transition-all hover:bg-cyan-500/20 hover:shadow-[0_0_12px_rgba(34,211,238,0.2)]"
            >
              🔄 {t({ ko: "재스캔", en: "Re-scan", ja: "再スキャン", zh: "重新扫描" })}
            </button>
          </div>
        </div>
      </div>

      {/* ── HUD stats ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HudCard
          label={t({ ko: "총 임무", en: "TOTAL MISSIONS", ja: "登録数", zh: "总任务" })}
          value={jobs.length}
          icon="📋"
          color="#3b82f6"
          sub={t({ ko: "등록된 전체 임무", en: "registered missions", ja: "登録済みジョブ", zh: "已注册任务" })}
        />
        <HudCard
          label={t({ ko: "가동 중", en: "ACTIVE", ja: "稼働中", zh: "运行中" })}
          value={enabledCount}
          icon="⚡"
          color="#10b981"
          sub={t({ ko: "현재 활성 상태", en: "currently active", ja: "有効なジョブ", zh: "当前活跃" })}
        />
        <HudCard
          label="CRONTAB"
          value={crontabCount}
          icon="🐧"
          color="#06b6d4"
          sub={t({ ko: "cron 기반 임무", en: "cron-based jobs", ja: "cron ベース", zh: "基于 cron" })}
        />
        <HudCard
          label="LAUNCHD"
          value={launchdCount}
          icon="🍎"
          color="#8b5cf6"
          sub={t({ ko: "macOS 에이전트", en: "macOS agents", ja: "macOS エージェント", zh: "macOS 代理" })}
        />
      </div>

      {/* ── Filter tabs ── */}
      <div className="game-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-sm"
              style={{ boxShadow: "0 0 8px rgba(245,158,11,0.2)" }}
            >
              📡
            </span>
            <h3 className="text-sm font-black uppercase tracking-wider" style={{ color: "var(--th-text-primary)" }}>
              {t({ ko: "임무 목록", en: "MISSION LIST", ja: "ジョブ一覧", zh: "任务列表" })}
            </h3>
            <span
              className="ml-1 text-[9px] font-medium normal-case tracking-normal"
              style={{ color: "var(--th-text-muted)" }}
            >
              {t({
                ko: `${filteredJobs.length}건 표시`,
                en: `${filteredJobs.length} shown`,
                ja: `${filteredJobs.length}件 表示中`,
                zh: `显示 ${filteredJobs.length} 项`,
              })}
            </span>
          </div>

          <div className="flex gap-1.5">
            {(
              [
                {
                  key: "all" as const,
                  label: t({ ko: "전체", en: "All", ja: "すべて", zh: "全部" }),
                  count: jobs.length,
                  accent: "rgba(34,211,238,",
                },
                { key: "crontab" as const, label: "crontab", count: crontabCount, accent: "rgba(16,185,129," },
                { key: "launchd" as const, label: "launchd", count: launchdCount, accent: "rgba(139,92,246," },
              ] as const
            ).map(({ key, label, count, accent }) => {
              const active = sourceFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setSourceFilter(key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-all ${
                    active ? "" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"
                  }`}
                  style={
                    active
                      ? {
                          background: `${accent}0.12)`,
                          color: `${accent}1)`,
                          borderColor: `${accent}0.3)`,
                          boxShadow: `0 0 8px ${accent}0.15)`,
                        }
                      : { color: "var(--th-text-muted)" }
                  }
                >
                  {label}
                  <span
                    className="rounded-full px-1.5 py-0 text-[9px]"
                    style={active ? { background: `${accent}0.18)` } : { background: "rgba(255,255,255,0.04)" }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Job cards ── */}
        <div className="mt-4 space-y-2">
          {filteredJobs.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-2 py-12 text-sm"
              style={{ color: "var(--th-text-muted)" }}
            >
              <span className="text-3xl opacity-30">📡</span>
              {t({
                ko: "해당 조건의 임무가 없습니다",
                en: "No missions found",
                ja: "該当するジョブがありません",
                zh: "未找到匹配的任务",
              })}
            </div>
          ) : (
            filteredJobs.map((job) => <JobCard key={job.id} job={job} t={t} />)
          )}
        </div>
      </div>
    </section>
  );
}
