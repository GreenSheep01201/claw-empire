import { Activity, Monitor, Moon, RefreshCw, Settings } from "lucide-react";
import Dialog from "./ui/Dialog";
import type { LangText, UiLanguage } from "../i18n";
import { useEffect, useState, useCallback } from "react";
import type { Agent } from "../types";
import type { ActiveAgentInfo, CliProcessInfo } from "../api";
import { pickLang, localeName } from "../i18n";
import { getActiveAgents, getCliProcesses, killCliProcess, stopTask } from "../api";
import AgentAvatar from "./AgentAvatar";

interface AgentStatusPanelProps {
  agents: Agent[];
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
  if (provider === "kimi") return "Kimi";
  if (provider === "node") return "Node";
  if (provider === "python") return "Python";
  return "OpenCode";
}

export default function AgentStatusPanel({ agents, uiLanguage, onClose }: AgentStatusPanelProps) {
  const t = (text: LangText) => pickLang(uiLanguage, text);
  const [activeAgents, setActiveAgents] = useState<ActiveAgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [killing, setKilling] = useState<Set<string>>(new Set());
  const [inspectorMode, setInspectorMode] = useState<"idle_cli" | "script" | null>(null);
  const [cliProcesses, setCliProcesses] = useState<CliProcessInfo[]>([]);
  const [cliLoading, setCliLoading] = useState(false);
  const [killingCliPids, setKillingCliPids] = useState<Set<number>>(new Set());

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

  const refreshLabel = t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新", fr: "Actualiser" });
  const idlePrefix = t({ ko: "유휴", en: "Idle", ja: "アイドル", zh: "空闲", fr: "Inactif" });

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
      title={t({
        ko: "활성 에이전트",
        en: "Active Agents",
        ja: "アクティブエージェント",
        zh: "活跃代理",
        fr: "État des agents",
      })}
      titleAdornment={<span className="qg-count">{activeAgents.length}</span>}
      headerActions={
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const nextMode = inspectorMode === "script" ? null : "script";
              setInspectorMode(nextMode);
              if (nextMode) refreshCli();
            }}
            aria-pressed={inspectorMode === "script"}
            className={`qg-btn qg-btn--sm${inspectorMode === "script" ? " qg-btn--primary" : ""}`}
            title={t({
              ko: "Script 조회",
              en: "Script Inspector",
              ja: "Script確認",
              zh: "Script查看",
              fr: "Voir les scripts",
            })}
          >
            <Settings size={16} aria-hidden />
            <span>{t({ ko: "Script조회", en: "Script", ja: "Script", zh: "Script", fr: "Scripts" })}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const nextMode = inspectorMode === "idle_cli" ? null : "idle_cli";
              setInspectorMode(nextMode);
              if (nextMode) refreshCli();
            }}
            aria-pressed={inspectorMode === "idle_cli"}
            className={`qg-btn qg-btn--sm${inspectorMode === "idle_cli" ? " qg-btn--primary" : ""}`}
            title={t({
              ko: "유휴 CLI 조회",
              en: "Idle CLI Inspector",
              ja: "アイドルCLI確認",
              zh: "闲置CLI查看",
              fr: "Voir les CLI inactives",
            })}
          >
            <Monitor size={16} aria-hidden />
            <span>
              {t({ ko: "유휴CLI조회", en: "Idle CLI", ja: "アイドルCLI", zh: "闲置CLI", fr: "CLI inactives" })}
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              refresh();
            }}
            className="qg-icon-btn"
            aria-label={refreshLabel}
            title={refreshLabel}
          >
            <RefreshCw size={16} aria-hidden />
          </button>
        </>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="qg-text-muted text-[13px]">
            {t({
              ko: "5초마다 자동 갱신",
              en: "Auto-refresh every 5s",
              ja: "5秒ごとに自動更新",
              zh: "每5秒自动刷新",
              fr: "Actualisation automatique toutes les 5 s",
            })}
          </span>
          <button type="button" onClick={onClose} className="qg-btn">
            {t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
          </button>
        </div>
      }
    >
      <div>
        {inspectorMode && (
          <div className="qg-card mb-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="qg-field__label">
                {inspectorMode === "script"
                  ? t({
                      ko: "실행 중인 Script",
                      en: "Running Script Processes",
                      ja: "実行中Script",
                      zh: "运行中的Script",
                      fr: "Scripts en cours",
                    })
                  : t({
                      ko: "실행 중인 유휴CLI",
                      en: "Running Idle CLI Processes",
                      ja: "実行中アイドルCLI",
                      zh: "运行中的闲置CLI",
                      fr: "CLI inactives en cours",
                    })}
              </span>
              <div className="flex items-center gap-2">
                <span className="qg-badge">{visibleCliProcesses.length}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    refreshCli();
                  }}
                  className="qg-btn qg-btn--sm qg-btn--ghost"
                >
                  <RefreshCw size={16} aria-hidden />
                  {refreshLabel}
                </button>
              </div>
            </div>
            {cliLoading && visibleCliProcesses.length === 0 ? (
              <div className="qg-text-muted py-2 text-[13px]">
                {inspectorMode === "script"
                  ? t({
                      ko: "Script 목록 불러오는 중...",
                      en: "Loading script list...",
                      ja: "Script一覧を読み込み中...",
                      zh: "正在加载Script列表...",
                      fr: "Chargement des scripts…",
                    })
                  : t({
                      ko: "유휴 CLI 목록 불러오는 중...",
                      en: "Loading idle CLI list...",
                      ja: "アイドルCLI一覧を読み込み中...",
                      zh: "正在加载闲置CLI列表...",
                      fr: "Chargement des CLI inactives…",
                    })}
              </div>
            ) : visibleCliProcesses.length === 0 ? (
              <div className="qg-text-muted py-2 text-[13px]">
                {inspectorMode === "script"
                  ? t({
                      ko: "실행 중인 Script가 없습니다",
                      en: "No running script process",
                      ja: "実行中Scriptなし",
                      zh: "没有运行中的Script进程",
                      fr: "Aucun script en cours",
                    })
                  : t({
                      ko: "실행 중인 유휴 CLI가 없습니다",
                      en: "No running idle CLI",
                      ja: "実行中アイドルCLIなし",
                      zh: "没有运行中的闲置CLI",
                      fr: "Aucune CLI inactive en cours",
                    })}
              </div>
            ) : (
              <div className="max-h-56 divide-y divide-[var(--th-border)] overflow-y-auto">
                {visibleCliProcesses.map((proc) => {
                  const isKilling = killingCliPids.has(proc.pid);
                  const agentName =
                    uiLanguage === "ko" ? proc.agent_name_ko || proc.agent_name || "-" : proc.agent_name || "-";
                  const commandText = proc.command || proc.executable;
                  const displayTitle = proc.task_title && proc.task_title !== commandText ? proc.task_title : null;
                  return (
                    <div key={proc.pid} className="py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="qg-badge">{displayCliProvider(proc.provider)}</span>
                            <span className="qg-text-muted">PID {proc.pid}</span>
                            {proc.is_idle ? (
                              <span className="qg-badge">{idlePrefix}</span>
                            ) : (
                              <span className="qg-badge qg-badge--accent">
                                {t({ ko: "활성", en: "Active", ja: "稼働中", zh: "活跃", fr: "Actif" })}
                              </span>
                            )}
                          </div>
                          {displayTitle ? (
                            <p className="qg-text-secondary mt-1 text-[13px] break-all">{displayTitle}</p>
                          ) : null}
                          <p
                            className="qg-text-muted mt-1 overflow-x-auto font-mono text-xs leading-relaxed whitespace-pre-wrap break-all"
                            title={commandText}
                          >
                            {commandText}
                          </p>
                          <div className="qg-text-muted mt-1 flex flex-wrap items-center gap-2 text-xs">
                            <span>
                              {t({ ko: "담당", en: "Agent", ja: "担当", zh: "代理", fr: "Agent" })}: {agentName}
                            </span>
                            <span>
                              {t({ ko: "작업", en: "Task", ja: "タスク", zh: "任务", fr: "Tâche" })}:{" "}
                              {proc.task_status || "-"}
                            </span>
                            <span>
                              {idlePrefix}: {fmtElapsed(proc.idle_seconds)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleKillCliProcess(proc.pid)}
                          disabled={isKilling}
                          className="qg-btn qg-btn--sm qg-btn--danger flex-shrink-0"
                        >
                          {isKilling
                            ? t({ ko: "중지 중...", en: "Killing...", ja: "停止中...", zh: "停止中...", fr: "Arrêt…" })
                            : t({ ko: "Kill", en: "Kill", ja: "Kill", zh: "Kill", fr: "Arrêter" })}
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
          <div className="qg-empty">
            {t({ ko: "불러오는 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中...", fr: "Chargement…" })}
          </div>
        ) : activeAgents.length === 0 ? (
          <div className="qg-empty flex flex-col items-center gap-2">
            <Moon size={16} aria-hidden />
            <p>
              {t({
                ko: "현재 작업 중인 에이전트가 없습니다",
                en: "No agents currently working",
                ja: "現在作業中のエージェントなし",
                zh: "当前没有工作中的代理",
                fr: "Aucun agent au travail pour le moment",
              })}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--th-border)]">
            {activeAgents.map((ag) => {
              const fullAgent = agents.find((a) => a.id === ag.id);
              const agentName = localeName(uiLanguage, ag);
              const deptName = localeName(uiLanguage, { name: ag.dept_name, name_ko: ag.dept_name_ko });
              const isKilling = ag.task_id ? killing.has(ag.task_id) : false;
              const idleText = ag.idle_seconds !== null ? fmtElapsed(ag.idle_seconds) : "-";
              const isIdle = ag.idle_seconds !== null && ag.idle_seconds > 300; // 5분 이상 idle

              return (
                <div key={ag.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <AgentAvatar agent={fullAgent} agents={agents} size={40} rounded="xl" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{agentName}</span>
                        <span className="qg-badge">{deptName}</span>
                        <span className="qg-badge">{ag.cli_provider}</span>
                      </div>
                      {ag.task_title && <p className="qg-text-secondary mt-1 truncate text-[13px]">{ag.task_title}</p>}
                      <div className="qg-text-muted mt-1 flex flex-wrap items-center gap-3 text-xs">
                        {ag.has_active_process ? (
                          <span className="qg-badge qg-badge--accent">
                            <Activity size={16} aria-hidden />
                            {t({
                              ko: "프로세스 활성",
                              en: "Process active",
                              ja: "プロセス実行中",
                              zh: "进程活跃",
                              fr: "Processus actif",
                            })}
                          </span>
                        ) : (
                          <span className="qg-badge">
                            {t({
                              ko: "프로세스 없음",
                              en: "No process",
                              ja: "プロセスなし",
                              zh: "无进程",
                              fr: "Aucun processus",
                            })}
                          </span>
                        )}
                        <span>
                          {t({
                            ko: "마지막 응답",
                            en: "Last activity",
                            ja: "最終応答",
                            zh: "最后响应",
                            fr: "Dernière activité",
                          })}
                          : {fmtTime(ag.last_activity_at)}
                        </span>
                        <span className={isIdle ? "qg-text-secondary font-semibold" : ""}>
                          {idlePrefix}: {idleText}
                        </span>
                      </div>
                    </div>
                    {ag.task_id && (
                      <button
                        type="button"
                        onClick={() => handleKill(ag.task_id!)}
                        disabled={isKilling}
                        className="qg-btn qg-btn--sm qg-btn--danger flex-shrink-0"
                      >
                        {isKilling
                          ? t({ ko: "중지 중...", en: "Stopping...", ja: "停止中...", zh: "停止中...", fr: "Arrêt…" })
                          : t({ ko: "강제 중지", en: "Kill", ja: "強制停止", zh: "强制停止", fr: "Forcer l’arrêt" })}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
}
