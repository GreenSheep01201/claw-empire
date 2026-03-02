import { useState, useEffect, useMemo, useCallback } from "react";
import { useI18n } from "../i18n";
import type { CronJob, CronJobsResponse } from "../api/cron-monitor";
import { getCronJobs } from "../api/cron-monitor";

type SourceFilter = "all" | "crontab" | "launchd";

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <div className="text-sm" style={{ color: "var(--th-text-muted)" }}>
            {t({
              ko: "스케줄 데이터 로딩중...",
              en: "Loading schedule data...",
              ja: "スケジュールデータを読み込み中...",
              zh: "正在加载计划任务数据...",
            })}
          </div>
        </div>
      </div>
    );
  }

  if (error && jobs.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <div className="text-sm" style={{ color: "var(--th-text-muted)" }}>
            {t({
              ko: "스케줄 데이터를 불러올 수 없습니다",
              en: "Unable to load schedule data",
              ja: "スケジュールデータを読み込めません",
              zh: "无法加载计划任务数据",
            })}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--th-text-muted)" }}>
            {error}
          </div>
          <button
            onClick={() => {
              setLoading(true);
              void fetchJobs();
            }}
            className="mt-4 px-4 py-2 text-sm bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition-all"
          >
            {t({ ko: "다시 시도", en: "Retry", ja: "再試行", zh: "重试" })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4" style={{ color: "var(--th-text-primary)" }}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--th-text-heading)" }}>
            🕐{" "}
            {t({
              ko: "스케줄 모니터",
              en: "Schedule Monitor",
              ja: "スケジュールモニター",
              zh: "计划任务监控",
            })}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--th-text-muted)" }}>
            {t({
              ko: `crontab + launchd 작업 ${jobs.length}건`,
              en: `${jobs.length} jobs from crontab + launchd`,
              ja: `crontab + launchd ジョブ ${jobs.length}件`,
              zh: `crontab + launchd 共 ${jobs.length} 个任务`,
            })}
            {platform !== "unknown" && ` · ${platform}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshedAt && (
            <span className="text-[11px]" style={{ color: "var(--th-text-muted)" }}>
              {t({ ko: "마지막 갱신", en: "Last refresh", ja: "最終取得", zh: "最后刷新" })}:{" "}
              {new Date(refreshedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => void fetchJobs()}
            className="px-3 py-1.5 text-xs rounded-md border transition-colors hover:bg-[var(--th-bg-surface-hover)]"
            style={{ borderColor: "var(--th-border)", color: "var(--th-text-secondary)" }}
          >
            ↻ {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新" })}
          </button>
        </div>
      </div>

      {/* Source filter */}
      <div className="flex gap-1">
        {(["all", "crontab", "launchd"] as const).map((filter) => {
          const label =
            filter === "all"
              ? t({ ko: "전체", en: "All", ja: "すべて", zh: "全部" }) + ` (${jobs.length})`
              : filter === "crontab"
                ? `crontab (${crontabCount})`
                : `launchd (${launchdCount})`;
          const active = sourceFilter === filter;
          return (
            <button
              key={filter}
              onClick={() => setSourceFilter(filter)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                active ? "bg-blue-600/20 text-blue-400 border-blue-500/30" : "hover:bg-[var(--th-bg-surface-hover)]"
              }`}
              style={active ? undefined : { borderColor: "var(--th-border)", color: "var(--th-text-secondary)" }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Jobs table */}
      {filteredJobs.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="text-3xl mb-2">📭</div>
            <div className="text-sm" style={{ color: "var(--th-text-muted)" }}>
              {t({
                ko: "등록된 스케줄 작업이 없습니다",
                en: "No scheduled jobs found",
                ja: "スケジュールジョブが見つかりません",
                zh: "未找到计划任务",
              })}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--th-border)", background: "var(--th-bg-sidebar)" }}>
                  <th className="text-left px-3 py-2 text-xs font-semibold" style={{ color: "var(--th-text-muted)" }}>
                    {t({ ko: "소스", en: "Source", ja: "ソース", zh: "来源" })}
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold" style={{ color: "var(--th-text-muted)" }}>
                    {t({ ko: "스케줄", en: "Schedule", ja: "スケジュール", zh: "计划" })}
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold" style={{ color: "var(--th-text-muted)" }}>
                    {t({ ko: "명령어", en: "Command", ja: "コマンド", zh: "命令" })}
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-semibold" style={{ color: "var(--th-text-muted)" }}>
                    {t({ ko: "상태", en: "Status", ja: "状態", zh: "状态" })}
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold" style={{ color: "var(--th-text-muted)" }}>
                    {t({ ko: "다음 실행", en: "Next Run", ja: "次回実行", zh: "下次运行" })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr
                    key={job.id}
                    className="hover:bg-[var(--th-bg-surface-hover)] transition-colors"
                    style={{ borderBottom: "1px solid var(--th-border)" }}
                  >
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded-full ${
                          job.source === "crontab"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-purple-500/15 text-purple-400"
                        }`}
                      >
                        {job.source}
                      </span>
                      {job.label && (
                        <div
                          className="text-[11px] mt-0.5 truncate max-w-[180px]"
                          style={{ color: "var(--th-text-muted)" }}
                          title={job.label}
                        >
                          {job.label}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-xs font-medium" style={{ color: "var(--th-text-primary)" }}>
                        {job.scheduleHuman}
                      </div>
                      <div
                        className="text-[11px] font-mono mt-0.5"
                        style={{ color: "var(--th-text-muted)" }}
                        title={job.schedule}
                      >
                        {job.schedule}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div
                        className="text-xs font-mono truncate max-w-[320px]"
                        style={{ color: "var(--th-text-secondary)" }}
                        title={job.command}
                      >
                        {job.command}
                      </div>
                      {job.plistPath && (
                        <div
                          className="text-[10px] mt-0.5 truncate max-w-[320px]"
                          style={{ color: "var(--th-text-muted)" }}
                          title={job.plistPath}
                        >
                          {job.plistPath}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full ${
                          job.enabled ? "bg-green-500" : "bg-slate-500"
                        }`}
                        title={
                          job.enabled
                            ? t({ ko: "활성", en: "Enabled", ja: "有効", zh: "启用" })
                            : t({ ko: "비활성", en: "Disabled", ja: "無効", zh: "禁用" })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      {job.nextRun ? (
                        <span className="text-xs" style={{ color: "var(--th-text-secondary)" }}>
                          {new Date(job.nextRun).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      ) : (
                        <span className="text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
