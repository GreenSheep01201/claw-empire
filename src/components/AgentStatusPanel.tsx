import { useEffect, useState, useCallback, useMemo } from "react";
import type { Agent, Department } from "../types";
import type { ActiveAgentInfo, CliProcessInfo } from "../api";
import type { UiLanguage } from "../i18n";
import { pickLang, localeName } from "../i18n";
import { getActiveAgents, getCliProcesses, killCliProcess, stopTask, createTask } from "../api";
import AgentAvatar from "./AgentAvatar";

const MONITORING_SCHEDULE_KEY = "claw_monitoring_schedule";
const MONITORING_AUTO_KEY = "claw_monitoring_auto_enabled";
const MONITORING_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

interface AgentStatusPanelProps {
  agents: Agent[];
  departments?: Department[];
  uiLanguage: UiLanguage;
  onClose: () => void;
}

function fmtElapsed(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "-";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtTime(ts: number | null | undefined): string {
  if (!ts) return "-";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function displayCliProvider(provider: CliProcessInfo["provider"]): string {
  if (provider === "claude") return "Claude";
  if (provider === "codex") return "Codex";
  if (provider === "gemini") return "Gemini";
  if (provider === "node") return "Node";
  if (provider === "python") return "Python";
  return "OpenCode";
}

export default function AgentStatusPanel({ agents, departments = [], uiLanguage, onClose }: AgentStatusPanelProps) {
  const t = (text: { ko: string; en: string; ja?: string; zh?: string }) => pickLang(uiLanguage, text);
  const [activeView, setActiveView] = useState<"agents" | "monitoring">("agents");
  const [activeAgents, setActiveAgents] = useState<ActiveAgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [killing, setKilling] = useState<Set<string>>(new Set());
  const [inspectorMode, setInspectorMode] = useState<"idle_cli" | "script" | null>(null);
  const [cliProcesses, setCliProcesses] = useState<CliProcessInfo[]>([]);
  const [cliLoading, setCliLoading] = useState(false);
  const [killingCliPids, setKillingCliPids] = useState<Set<number>>(new Set());
  const [autoSchedule, setAutoSchedule] = useState<boolean>(() => {
    try { return localStorage.getItem(MONITORING_AUTO_KEY) === "true"; } catch { return false; }
  });
  const [monitoringSchedule, setMonitoringSchedule] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(MONITORING_SCHEDULE_KEY) ?? "{}") as Record<string, number>; } catch { return {}; }
  });
  const [dispatchingAgentId, setDispatchingAgentId] = useState<string | null>(null);
  const [dispatchLog, setDispatchLog] = useState<{ agentId: string; name: string; ts: number }[]>([]);

  // Identify monitoring agents (Operations + DevSecOps)
  const monitoringDeptIds = useMemo(() => {
    const slugs = new Set(["operations", "devsecops", "ops", "infra", "devops"]);
    return new Set(
      departments
        .filter((d) => slugs.has((d.name ?? "").toLowerCase()) || slugs.has((d.id ?? "").toLowerCase()))
        .map((d) => d.id)
    );
  }, [departments]);

  const monitoringAgents = useMemo(
    () => agents.filter((a) => a.department_id && monitoringDeptIds.has(a.department_id)),
    [agents, monitoringDeptIds]
  );

  const saveSchedule = useCallback((next: Record<string, number>) => {
    setMonitoringSchedule(next);
    try { localStorage.setItem(MONITORING_SCHEDULE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const dispatchMonitoringTask = useCallback(async (agent: Agent) => {
    if (dispatchingAgentId) return;
    setDispatchingAgentId(agent.id);
    try {
      const agentName = uiLanguage === "ja" ? (agent.name_ja ?? agent.name) : uiLanguage === "ko" ? agent.name_ko : agent.name;
      await createTask({
        title: `🔍 システム監視チェック — ${agentName}`,
        description:
          "サービス稼働確認、エラーログ分析、パフォーマンス計測を実施し、異常があれば即座にCEOへ報告してください。正常な場合も簡潔なヘルスレポートを作成してください。",
        assigned_agent_id: agent.id,
        department_id: agent.department_id ?? undefined,
        task_type: "analysis",
        priority: 8,
      });
      const now = Date.now();
      saveSchedule({ ...monitoringSchedule, [agent.id]: now });
      setDispatchLog((prev) => [{ agentId: agent.id, name: agent.name, ts: now }, ...prev.slice(0, 9)]);
    } catch (e) {
      console.error("Failed to dispatch monitoring task:", e);
    } finally {
      setDispatchingAgentId(null);
    }
  }, [dispatchingAgentId, uiLanguage, monitoringSchedule, saveSchedule]);

  // Auto-scheduler: runs every 5 min, dispatches tasks if overdue
  useEffect(() => {
    if (!autoSchedule || monitoringAgents.length === 0) return;
    const tick = async () => {
      const now = Date.now();
      for (const agent of monitoringAgents) {
        const last = monitoringSchedule[agent.id] ?? 0;
        if (now - last >= MONITORING_INTERVAL_MS && agent.status !== "working") {
          await dispatchMonitoringTask(agent);
          await new Promise((r) => setTimeout(r, 2000)); // stagger
        }
      }
    };
    void tick();
    const id = setInterval(tick, 5 * 60 * 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSchedule, monitoringAgents.length]);

  const toggleAutoSchedule = () => {
    const next = !autoSchedule;
    setAutoSchedule(next);
    try { localStorage.setItem(MONITORING_AUTO_KEY, String(next)); } catch { /* ignore */ }
  };

  const refresh = useCallback(() => {
    getActiveAgents()
      .then(setActiveAgents)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const refreshCli = useCallback(() => {
    setCliLoading(true);
    getCliProcesses()
      .then(setCliProcesses)
      .catch(console.error)
      .finally(() => setCliLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    let interval: ReturnType<typeof setInterval>;
    function start() {
      interval = setInterval(refresh, 5000);
    }
    function onVis() {
      clearInterval(interval);
      if (!document.hidden) {
        refresh();
        start();
      }
    }
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  useEffect(() => {
    if (!inspectorMode) return;
    refreshCli();
    let interval: ReturnType<typeof setInterval>;
    function start() {
      interval = setInterval(refreshCli, 5000);
    }
    function onVis() {
      clearInterval(interval);
      if (!document.hidden) {
        refreshCli();
        start();
      }
    }
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [inspectorMode, refreshCli]);

  const handleKill = async (taskId: string) => {
    if (!taskId || killing.has(taskId)) return;
    setKilling((prev) => new Set(prev).add(taskId));
    try {
      await stopTask(taskId);
      // 잠시 후 새로고침
      setTimeout(refresh, 1000);
    } catch (e) {
      console.error("Failed to stop task:", e);
    } finally {
      setKilling((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleKillCliProcess = async (pid: number) => {
    if (!Number.isFinite(pid) || pid <= 0 || killingCliPids.has(pid)) return;
    setKillingCliPids((prev) => new Set(prev).add(pid));
    try {
      await killCliProcess(pid);
      setTimeout(refreshCli, 600);
      setTimeout(refresh, 800);
    } catch (e) {
      console.error("Failed to kill CLI process:", e);
    } finally {
      setKillingCliPids((prev) => {
        const next = new Set(prev);
        next.delete(pid);
        return next;
      });
    }
  };

  const visibleCliProcesses =
    inspectorMode === "script"
      ? cliProcesses.filter((proc) => proc.provider === "node" || proc.provider === "python")
      : cliProcesses.filter((proc) => proc.provider !== "node" && proc.provider !== "python");

  const fmtSchedule = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60_000) return "今";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
    return `${Math.floor(diff / 86_400_000)}日前`;
  };

  const renderMonitoringCenter = () => {
    const now = Date.now();
    const overdueAgents = monitoringAgents.filter((a) => {
      const last = monitoringSchedule[a.id] ?? 0;
      return now - last >= MONITORING_INTERVAL_MS;
    });
    const statusColor = (status: string) =>
      status === "working" ? "text-green-400" : status === "idle" ? "text-slate-400" : "text-yellow-400";
    const statusIcon = (status: string) =>
      status === "working" ? "🟢" : status === "idle" ? "⚪" : "🟡";

    return (
      <div className="p-4 space-y-4">
        {/* Health Strip */}
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              label: "稼働中エージェント",
              value: activeAgents.length,
              color: activeAgents.length > 0 ? "text-green-400" : "text-slate-400",
              bg: "bg-green-500/10",
            },
            {
              label: "監視エージェント数",
              value: monitoringAgents.length,
              color: "text-blue-400",
              bg: "bg-blue-500/10",
            },
            {
              label: "要チェック",
              value: overdueAgents.length,
              color: overdueAgents.length > 0 ? "text-amber-400" : "text-green-400",
              bg: overdueAgents.length > 0 ? "bg-amber-500/10" : "bg-green-500/10",
            },
          ].map((tile) => (
            <div key={tile.label} className={`rounded-xl ${tile.bg} p-3 text-center border border-slate-700/50`}>
              <div className={`text-xl font-bold ${tile.color}`}>{tile.value}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{tile.label}</div>
            </div>
          ))}
        </div>

        {/* Auto-Schedule Toggle */}
        <div className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-800/50 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white">🤖 自動スケジューリング</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {autoSchedule ? `30分ごとに監視タスクを自動投入 — 有効` : "手動モード（オフ）"}
            </div>
          </div>
          <button
            onClick={toggleAutoSchedule}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoSchedule ? "bg-blue-600" : "bg-slate-600"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autoSchedule ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Monitoring Agents Table */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
            📡 監視エージェント一覧
          </div>
          {monitoringAgents.length === 0 ? (
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 text-center text-sm text-slate-500">
              監視部署（Operations / DevSecOps）のエージェントが見つかりません
            </div>
          ) : (
            <div className="space-y-2">
              {monitoringAgents.map((agent) => {
                const lastRun = monitoringSchedule[agent.id] ?? 0;
                const isOverdue = now - lastRun >= MONITORING_INTERVAL_MS;
                const isWorking = agent.status === "working";
                const isDispatching = dispatchingAgentId === agent.id;
                const dept = departments.find((d) => d.id === agent.department_id);
                return (
                  <div
                    key={agent.id}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                      isOverdue ? "border-amber-500/30 bg-amber-500/5" : "border-slate-700/50 bg-slate-800/30"
                    }`}
                  >
                    <AgentAvatar agent={agent} agents={agents} size={36} rounded="xl" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white">
                          {uiLanguage === "ja" ? (agent.name_ja ?? agent.name) : uiLanguage === "ko" ? agent.name_ko : agent.name}
                        </span>
                        <span className={`text-xs ${statusColor(agent.status)}`}>{statusIcon(agent.status)}</span>
                        {isOverdue && !isWorking && (
                          <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold text-amber-400">要チェック</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {dept ? dept.name : agent.department_id ?? ""} ·{" "}
                        {lastRun ? `最終監視: ${fmtSchedule(lastRun)}` : "未実施"}
                      </div>
                    </div>
                    <button
                      onClick={() => void dispatchMonitoringTask(agent)}
                      disabled={isDispatching || isWorking}
                      className={`flex-shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                        isWorking
                          ? "cursor-not-allowed bg-slate-700/50 text-slate-500"
                          : isDispatching
                          ? "cursor-wait bg-blue-500/30 text-blue-300"
                          : "bg-blue-600 text-white hover:bg-blue-500"
                      }`}
                    >
                      {isDispatching ? "投入中…" : isWorking ? "稼働中" : "監視実行"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dispatch Log */}
        {dispatchLog.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">📋 実行ログ</div>
            <div className="space-y-1 rounded-xl border border-slate-700/50 bg-slate-950/40 p-2">
              {dispatchLog.map((log, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="text-green-400">✓</span>
                  <span className="text-slate-300">{log.name}</span>
                  <span className="ml-auto text-slate-500">{fmtSchedule(log.ts)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`relative mx-4 w-full rounded-2xl border border-blue-500/30 bg-slate-900 shadow-2xl shadow-blue-500/10 ${
          inspectorMode ? "max-w-3xl" : "max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{activeView === "monitoring" ? "📡" : "🛠️"}</span>
            <h2 className="text-lg font-bold text-white">
              {activeView === "monitoring"
                ? "運用監視センター"
                : t({ ko: "활성 에이전트", en: "Active Agents", ja: "アクティブエージェント", zh: "活跃代理" })}
            </h2>
            {activeView === "agents" && (
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-400">
                {activeAgents.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border border-slate-700 overflow-hidden text-[11px]">
              <button
                onClick={(e) => { e.stopPropagation(); setActiveView("agents"); }}
                className={`px-2.5 py-1.5 font-medium transition ${activeView === "agents" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
              >
                🛠️ {t({ ko: "에이전트", en: "Agents", ja: "エージェント", zh: "代理" })}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveView("monitoring"); }}
                className={`px-2.5 py-1.5 font-medium transition relative ${activeView === "monitoring" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
              >
                📡 監視
                {monitoringAgents.filter((a) => (Date.now() - (monitoringSchedule[a.id] ?? 0)) >= MONITORING_INTERVAL_MS && a.status !== "working").length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
                    !
                  </span>
                )}
              </button>
            </div>
            {activeView === "agents" && (
              <><button
              onClick={(e) => {
                e.stopPropagation();
                const nextMode = inspectorMode === "script" ? null : "script";
                setInspectorMode(nextMode);
                if (nextMode) refreshCli();
              }}
              className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium whitespace-nowrap transition ${
                inspectorMode === "script"
                  ? "border-violet-500/40 bg-violet-500/20 text-violet-300"
                  : "border-slate-700 text-slate-400 hover:border-slate-500 hover:bg-slate-800 hover:text-white"
              }`}
              title={t({ ko: "Script 조회", en: "Script Inspector", ja: "Script確認", zh: "Script查看" })}
            >
              <span>{t({ ko: "Script조회", en: "Script", ja: "Script", zh: "Script" })}</span>
              <span aria-hidden>&#x2699;</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const nextMode = inspectorMode === "idle_cli" ? null : "idle_cli";
                setInspectorMode(nextMode);
                if (nextMode) refreshCli();
              }}
              className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium whitespace-nowrap transition ${
                inspectorMode === "idle_cli"
                  ? "border-blue-500/40 bg-blue-500/20 text-blue-300"
                  : "border-slate-700 text-slate-400 hover:border-slate-500 hover:bg-slate-800 hover:text-white"
              }`}
              title={t({ ko: "유휴 CLI 조회", en: "Idle CLI Inspector", ja: "アイドルCLI確認", zh: "闲置CLI查看" })}
            >
              <span>{t({ ko: "유휴CLI조회", en: "Idle CLI", ja: "アイドルCLI", zh: "闲置CLI" })}</span>
              <span aria-hidden>&#x1F5A5;</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                refresh();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
              title={t({ ko: "새로고침", en: "Refresh", ja: "リフレッシュ", zh: "刷新" })}
            >
              &#x21BB;
            </button></>
            )}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              &#x2715;
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[70vh] overflow-y-auto">
          {activeView === "monitoring" ? (
            renderMonitoringCenter()
          ) : (
          <>
          {inspectorMode && (
            <div className="border-b border-slate-700/50 bg-slate-950/40 px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  {inspectorMode === "script"
                    ? t({
                        ko: "실행 중인 Script",
                        en: "Running Script Processes",
                        ja: "実行中Script",
                        zh: "运行中的Script",
                      })
                    : t({
                        ko: "실행 중인 유휴CLI",
                        en: "Running Idle CLI Processes",
                        ja: "実行中アイドルCLI",
                        zh: "运行中的闲置CLI",
                      })}
                </span>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {visibleCliProcesses.length}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      refreshCli();
                    }}
                    className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 transition hover:border-slate-500 hover:text-white"
                  >
                    {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新" })}
                  </button>
                </div>
              </div>
              {cliLoading && visibleCliProcesses.length === 0 ? (
                <div className="py-2 text-xs text-slate-500">
                  {inspectorMode === "script"
                    ? t({
                        ko: "Script 목록 불러오는 중...",
                        en: "Loading script list...",
                        ja: "Script一覧を読み込み中...",
                        zh: "正在加载Script列表...",
                      })
                    : t({
                        ko: "유휴 CLI 목록 불러오는 중...",
                        en: "Loading idle CLI list...",
                        ja: "アイドルCLI一覧を読み込み中...",
                        zh: "正在加载闲置CLI列表...",
                      })}
                </div>
              ) : visibleCliProcesses.length === 0 ? (
                <div className="py-2 text-xs text-slate-500">
                  {inspectorMode === "script"
                    ? t({
                        ko: "실행 중인 Script가 없습니다",
                        en: "No running script process",
                        ja: "実行中Scriptなし",
                        zh: "没有运行中的Script进程",
                      })
                    : t({
                        ko: "실행 중인 유휴 CLI가 없습니다",
                        en: "No running idle CLI",
                        ja: "実行中アイドルCLIなし",
                        zh: "没有运行中的闲置CLI",
                      })}
                </div>
              ) : (
                <div className="max-h-56 divide-y divide-slate-800 overflow-y-auto rounded-lg border border-slate-800/80 bg-slate-900/50">
                  {visibleCliProcesses.map((proc) => {
                    const isKilling = killingCliPids.has(proc.pid);
                    const agentName =
                      uiLanguage === "ko" ? proc.agent_name_ko || proc.agent_name || "-" : proc.agent_name || "-";
                    const commandText = proc.command || proc.executable;
                    const displayTitle = proc.task_title && proc.task_title !== commandText ? proc.task_title : null;
                    return (
                      <div key={proc.pid} className="px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="rounded bg-slate-700/80 px-1.5 py-0.5 text-slate-200">
                                {displayCliProvider(proc.provider)}
                              </span>
                              <span className="text-slate-400">PID {proc.pid}</span>
                              {proc.is_idle ? (
                                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">
                                  {t({ ko: "유휴", en: "Idle", ja: "アイドル", zh: "空闲" })}
                                </span>
                              ) : (
                                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">
                                  {t({ ko: "활성", en: "Active", ja: "稼働中", zh: "活跃" })}
                                </span>
                              )}
                            </div>
                            {displayTitle ? (
                              <p className="mt-1 text-[11px] text-slate-300 break-all">{displayTitle}</p>
                            ) : null}
                            <p
                              className="mt-1 overflow-x-auto font-mono text-[10px] leading-relaxed text-slate-400 whitespace-pre-wrap break-all"
                              title={commandText}
                            >
                              {commandText}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                              <span>
                                {t({ ko: "담당", en: "Agent", ja: "担当", zh: "代理" })}: {agentName}
                              </span>
                              <span>
                                {t({ ko: "작업", en: "Task", ja: "タスク", zh: "任务" })}: {proc.task_status || "-"}
                              </span>
                              <span>Idle: {fmtElapsed(proc.idle_seconds)}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleKillCliProcess(proc.pid)}
                            disabled={isKilling}
                            className={`flex-shrink-0 rounded border px-2 py-1 text-[11px] font-medium transition ${
                              isKilling
                                ? "cursor-not-allowed border-slate-700 bg-slate-800 text-slate-500"
                                : "border-red-500/40 bg-red-600/15 text-red-300 hover:bg-red-600/25"
                            }`}
                          >
                            {isKilling
                              ? t({ ko: "중지 중...", en: "Killing...", ja: "停止中...", zh: "停止中..." })
                              : t({ ko: "Kill", en: "Kill", ja: "Kill", zh: "Kill" })}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-slate-500">
                {t({ ko: "불러오는 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中..." })}
              </div>
            </div>
          ) : activeAgents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="mb-2 text-3xl opacity-40">&#x1F634;</span>
              <p className="text-sm text-slate-500">
                {t({
                  ko: "현재 작업 중인 에이전트가 없습니다",
                  en: "No agents currently working",
                  ja: "現在作業中のエージェントなし",
                  zh: "当前没有工作中的代理",
                })}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/30">
              {activeAgents.map((ag) => {
                const fullAgent = agents.find((a) => a.id === ag.id);
                const agentName = localeName(uiLanguage, ag);
                const deptName = localeName(uiLanguage, { name: ag.dept_name, name_ko: ag.dept_name_ko });
                const isKilling = ag.task_id ? killing.has(ag.task_id) : false;
                const idleText = ag.idle_seconds !== null ? fmtElapsed(ag.idle_seconds) : "-";
                const isIdle = ag.idle_seconds !== null && ag.idle_seconds > 300; // 5분 이상 idle

                return (
                  <div key={ag.id} className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <AgentAvatar agent={fullAgent} agents={agents} size={40} rounded="xl" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{agentName}</span>
                          <span className="rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] text-slate-400">
                            {deptName}
                          </span>
                          <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-500">
                            {ag.cli_provider}
                          </span>
                        </div>
                        {ag.task_title && <p className="mt-0.5 truncate text-xs text-slate-400">{ag.task_title}</p>}
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                          {ag.has_active_process ? (
                            <span className="flex items-center gap-1">
                              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                              {t({ ko: "프로세스 활성", en: "Process active", ja: "プロセス実行中", zh: "进程活跃" })}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                              {t({ ko: "프로세스 없음", en: "No process", ja: "プロセスなし", zh: "无进程" })}
                            </span>
                          )}
                          <span>
                            {t({ ko: "마지막 응답", en: "Last activity", ja: "最終応答", zh: "最后响应" })}:{" "}
                            {fmtTime(ag.last_activity_at)}
                          </span>
                          <span className={isIdle ? "text-amber-400" : ""}>Idle: {idleText}</span>
                        </div>
                      </div>
                      {ag.task_id && (
                        <button
                          onClick={() => handleKill(ag.task_id!)}
                          disabled={isKilling}
                          className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                            isKilling
                              ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                              : "bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30"
                          }`}
                        >
                          {isKilling
                            ? t({ ko: "중지 중...", en: "Stopping...", ja: "停止中...", zh: "停止中..." })
                            : t({ ko: "강제 중지", en: "Kill", ja: "強制停止", zh: "强制停止" })}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700/50 px-6 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {t({
                ko: "5초마다 자동 갱신",
                en: "Auto-refresh every 5s",
                ja: "5秒ごとに自動更新",
                zh: "每5秒自动刷新",
              })}
            </span>
            <button
              onClick={onClose}
              className="rounded-lg bg-slate-700 px-4 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-600"
            >
              {t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭" })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
