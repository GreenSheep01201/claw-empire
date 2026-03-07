import { useState, useCallback, useEffect } from "react";
import { request, post } from "../api/core";

interface DiagnosticIssue {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  taskId?: string;
  agentId?: string;
  suggestedFix: string;
  autoFixable: boolean;
}

interface DiagnoseResult {
  ok: boolean;
  issues: DiagnosticIssue[];
  checkedAt: number;
}

interface DbSummary {
  ok: boolean;
  tasksByStatus: Array<{ status: string; cnt: number }>;
  agentsByStatus: Array<{ status: string; cnt: number }>;
  recentErrors: Array<{ id: string; title: string; content: string; created_at: number }>;
  checkedAt: number;
}

interface AdminTask {
  id: string;
  title: string;
  status: string;
  project_path: string | null;
  updated_at: number;
  agent_name: string | null;
  agent_status: string | null;
}

interface SystemConsolePanelProps {
  onClose: () => void;
}

type Tab = "diagnose" | "db" | "tasks";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "text-red-400",
  warning: "text-yellow-400",
  info: "text-blue-400",
};
const SEVERITY_BG: Record<string, string> = {
  critical: "border-red-500/40 bg-red-500/10",
  warning: "border-yellow-500/40 bg-yellow-500/10",
  info: "border-blue-500/40 bg-blue-500/10",
};
const SEVERITY_ICON: Record<string, string> = {
  critical: "🔴",
  warning: "🟡",
  info: "🔵",
};

const STATUS_COLOR: Record<string, string> = {
  planned: "bg-blue-500",
  in_progress: "bg-green-500",
  review: "bg-purple-500",
  collaborating: "bg-cyan-500",
  inbox: "bg-gray-500",
  done: "bg-emerald-500",
  cancelled: "bg-red-800",
};

function formatElapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分`;
  return `${Math.floor(m / 60)}時間${m % 60}分`;
}

export default function SystemConsolePanel({ onClose }: SystemConsolePanelProps) {
  const [tab, setTab] = useState<Tab>("diagnose");

  // ---------- Diagnose tab ----------
  const [diagnoseResult, setDiagnoseResult] = useState<DiagnoseResult | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixLog, setFixLog] = useState<string[]>([]);

  const runDiagnose = useCallback(async () => {
    setDiagnosing(true);
    try {
      const result = await request<DiagnoseResult>("/api/admin/diagnose");
      setDiagnoseResult(result);
    } catch {
      setDiagnoseResult(null);
    } finally {
      setDiagnosing(false);
    }
  }, []);

  // Auto-diagnose on open
  useEffect(() => {
    void runDiagnose();
  }, [runDiagnose]);

  const runFixAll = useCallback(async () => {
    setFixing(true);
    setFixLog([]);
    try {
      const result = await post<{ ok: boolean; fixed: number; results: Array<{ issue: string; action: string; ok: boolean }> }>(
        "/api/admin/fix",
      );
      const lines = result.results.map((r) => `${r.ok ? "✅" : "❌"} ${r.action}`);
      setFixLog(lines.length ? lines : ["修正対象なし"]);
      await runDiagnose();
    } catch (err) {
      setFixLog([`❌ エラー: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setFixing(false);
    }
  }, [runDiagnose]);

  const fixSingleTask = useCallback(
    async (issue: DiagnosticIssue) => {
      if (!issue.autoFixable) return;
      setFixingId(issue.id);
      try {
        if (issue.type === "null_project_path" && issue.taskId) {
          await post(`/api/admin/tasks/${issue.taskId}/fix-path`, {});
        } else if (issue.type === "stuck_planned" && issue.taskId) {
          await post(`/api/admin/tasks/${issue.taskId}/run`, {});
        } else if (issue.type === "orphan_agent" && issue.agentId) {
          await post(`/api/admin/agents/${issue.agentId}/reset`, {});
        }
        await runDiagnose();
      } finally {
        setFixingId(null);
      }
    },
    [runDiagnose],
  );

  // ---------- DB tab ----------
  const [dbSummary, setDbSummary] = useState<DbSummary | null>(null);
  const [dbLoading, setDbLoading] = useState(false);

  const loadDbSummary = useCallback(async () => {
    setDbLoading(true);
    try {
      const result = await request<DbSummary>("/api/admin/db-summary");
      setDbSummary(result);
    } finally {
      setDbLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "db") void loadDbSummary();
  }, [tab, loadDbSummary]);

  // ---------- Tasks tab ----------
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [actioningTask, setActioningTask] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const result = await request<{ ok: boolean; tasks: AdminTask[] }>("/api/admin/tasks");
      setTasks(result.tasks);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "tasks") void loadTasks();
  }, [tab, loadTasks]);

  const taskAction = useCallback(
    async (taskId: string, action: "run" | "cancel" | "fix-path") => {
      setActioningTask(taskId);
      try {
        await post(`/api/admin/tasks/${taskId}/${action}`, {});
        await loadTasks();
      } finally {
        setActioningTask(null);
      }
    },
    [loadTasks],
  );

  // ---------- Key close ----------
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const now = Date.now();
  const critCount = diagnoseResult?.issues.filter((i) => i.severity === "critical").length ?? 0;
  const warnCount = diagnoseResult?.issues.filter((i) => i.severity === "warning").length ?? 0;
  const autoFixCount = diagnoseResult?.issues.filter((i) => i.autoFixable).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 shadow-2xl lg:relative lg:inset-auto lg:z-auto lg:w-[480px] lg:border-l lg:border-gray-700">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-700 bg-gray-800 px-4 py-3">
        <span className="text-xl">🔧</span>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">システム管理コンソール</div>
          <div className="text-xs text-gray-400">診断・修正・タスク管理</div>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0 border-b border-gray-700 bg-gray-800">
        {(
          [
            { id: "diagnose", label: "🏥 診断", badge: critCount + warnCount || undefined },
            { id: "db", label: "📊 DB状態" },
            { id: "tasks", label: "🔧 タスク管理" },
          ] as Array<{ id: Tab; label: string; badge?: number }>
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? "border-b-2 border-indigo-500 text-indigo-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* ===== DIAGNOSE TAB ===== */}
        {tab === "diagnose" && (
          <div className="space-y-3">
            {/* Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={runDiagnose}
                disabled={diagnosing}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {diagnosing ? "⏳" : "🔍"} {diagnosing ? "診断中..." : "再診断"}
              </button>
              {autoFixCount > 0 && (
                <button
                  onClick={runFixAll}
                  disabled={fixing}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {fixing ? "⏳" : "⚡"} {fixing ? "修正中..." : `一括自動修正 (${autoFixCount}件)`}
                </button>
              )}
            </div>

            {/* Fix log */}
            {fixLog.length > 0 && (
              <div className="rounded-lg border border-gray-600 bg-gray-800 p-3">
                <div className="mb-1 text-xs font-medium text-gray-400">修正ログ</div>
                {fixLog.map((l, i) => (
                  <div key={i} className="text-xs text-gray-300">
                    {l}
                  </div>
                ))}
              </div>
            )}

            {/* Summary strip */}
            {diagnoseResult && (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-center">
                  <div className="text-lg font-bold text-red-400">{critCount}</div>
                  <div className="text-[10px] text-red-300">Critical</div>
                </div>
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-2 text-center">
                  <div className="text-lg font-bold text-yellow-400">{warnCount}</div>
                  <div className="text-[10px] text-yellow-300">Warning</div>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-center">
                  <div className="text-lg font-bold text-emerald-400">
                    {diagnoseResult.issues.filter((i) => i.severity === "info").length}
                  </div>
                  <div className="text-[10px] text-emerald-300">Info</div>
                </div>
              </div>
            )}

            {/* Issues list */}
            {diagnoseResult?.issues.length === 0 && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                <div className="text-2xl">✅</div>
                <div className="mt-1 text-sm font-medium text-emerald-400">問題なし</div>
                <div className="text-xs text-emerald-300/70">
                  {new Date(diagnoseResult.checkedAt).toLocaleTimeString("ja-JP")} 時点
                </div>
              </div>
            )}

            {diagnoseResult?.issues.map((issue) => (
              <div key={issue.id} className={`rounded-lg border p-3 ${SEVERITY_BG[issue.severity] ?? ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className={`text-xs font-semibold ${SEVERITY_COLOR[issue.severity]}`}>
                      {SEVERITY_ICON[issue.severity]} {issue.title}
                    </div>
                    <div className="mt-1 text-xs text-gray-400">{issue.description}</div>
                    <div className="mt-1 text-xs text-gray-500">💡 {issue.suggestedFix}</div>
                  </div>
                  {issue.autoFixable && (
                    <button
                      onClick={() => fixSingleTask(issue)}
                      disabled={fixingId === issue.id}
                      className="flex-shrink-0 rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-600 disabled:opacity-60"
                    >
                      {fixingId === issue.id ? "⏳" : "修正"}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {diagnosing && !diagnoseResult && (
              <div className="py-6 text-center text-sm text-gray-500">⏳ 診断中...</div>
            )}
          </div>
        )}

        {/* ===== DB STATUS TAB ===== */}
        {tab === "db" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-400">
                {dbSummary ? `最終更新: ${new Date(dbSummary.checkedAt).toLocaleTimeString("ja-JP")}` : ""}
              </div>
              <button
                onClick={loadDbSummary}
                disabled={dbLoading}
                className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600 disabled:opacity-60"
              >
                {dbLoading ? "⏳" : "🔄 更新"}
              </button>
            </div>

            {dbSummary && (
              <>
                <div>
                  <div className="mb-2 text-xs font-semibold text-gray-300">タスク状態</div>
                  <div className="space-y-1.5">
                    {dbSummary.tasksByStatus.map((row) => {
                      const max = Math.max(...dbSummary.tasksByStatus.map((r) => r.cnt), 1);
                      return (
                        <div key={row.status} className="flex items-center gap-2">
                          <div className="w-20 flex-shrink-0 text-right text-xs text-gray-400">{row.status}</div>
                          <div className="flex-1 rounded bg-gray-800">
                            <div
                              className={`h-4 rounded ${STATUS_COLOR[row.status] ?? "bg-gray-600"}`}
                              style={{ width: `${Math.max(4, (row.cnt / max) * 100)}%` }}
                            />
                          </div>
                          <div className="w-8 text-xs font-medium text-gray-300">{row.cnt}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold text-gray-300">エージェント状態</div>
                  <div className="flex gap-3">
                    {dbSummary.agentsByStatus.map((row) => (
                      <div key={row.status} className="flex-1 rounded-lg border border-gray-700 bg-gray-800 p-2 text-center">
                        <div className="text-lg font-bold text-white">{row.cnt}</div>
                        <div className="text-[10px] text-gray-400">{row.status}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {dbSummary.recentErrors.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-semibold text-red-400">⚠️ 最近のエラー</div>
                    <div className="space-y-1">
                      {dbSummary.recentErrors.map((e, i) => (
                        <div key={i} className="rounded border border-red-500/20 bg-red-500/5 p-2">
                          <div className="text-[11px] font-medium text-red-300">{e.title.slice(0, 50)}</div>
                          <div className="mt-0.5 text-[10px] text-red-400/70">{e.content.slice(0, 100)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {dbLoading && !dbSummary && (
              <div className="py-6 text-center text-sm text-gray-500">⏳ 読み込み中...</div>
            )}
          </div>
        )}

        {/* ===== TASKS TAB ===== */}
        {tab === "tasks" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-400">完了・キャンセル以外のタスク</div>
              <button
                onClick={loadTasks}
                disabled={tasksLoading}
                className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600 disabled:opacity-60"
              >
                {tasksLoading ? "⏳" : "🔄 更新"}
              </button>
            </div>

            {tasks.length === 0 && !tasksLoading && (
              <div className="py-6 text-center text-sm text-gray-500">アクティブなタスクなし</div>
            )}

            {tasks.map((t) => {
              const hasNullPath = t.project_path === null;
              const isStuckPlanned = t.status === "planned" && now - t.updated_at > 5 * 60 * 1000;
              const isProblematic = hasNullPath || isStuckPlanned;
              const isActioning = actioningTask === t.id;

              return (
                <div
                  key={t.id}
                  className={`rounded-lg border p-2.5 ${
                    isProblematic ? "border-red-500/40 bg-red-500/5" : "border-gray-700 bg-gray-800"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${STATUS_COLOR[t.status] ?? "bg-gray-600"}`}
                    >
                      {t.status}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-gray-200">{t.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-500">
                        {t.agent_name && <span>👤 {t.agent_name}</span>}
                        <span>🕐 {formatElapsed(now - t.updated_at)}前</span>
                        {hasNullPath && <span className="text-red-400">⚠️ path未設定</span>}
                        {isStuckPlanned && <span className="text-yellow-400">⚠️ 停止中</span>}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex gap-1.5">
                    {(t.status === "planned" || t.status === "inbox") && (
                      <button
                        onClick={() => taskAction(t.id, "run")}
                        disabled={isActioning}
                        className="rounded bg-emerald-700 px-2 py-1 text-[11px] text-white hover:bg-emerald-600 disabled:opacity-60"
                      >
                        🚀 起動
                      </button>
                    )}
                    {hasNullPath && (
                      <button
                        onClick={() => taskAction(t.id, "fix-path")}
                        disabled={isActioning}
                        className="rounded bg-blue-700 px-2 py-1 text-[11px] text-white hover:bg-blue-600 disabled:opacity-60"
                      >
                        🔗 パス修正
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (window.confirm(`「${t.title.slice(0, 40)}」をキャンセルしますか？`))
                          void taskAction(t.id, "cancel");
                      }}
                      disabled={isActioning}
                      className="rounded bg-gray-700 px-2 py-1 text-[11px] text-red-400 hover:bg-gray-600 disabled:opacity-60"
                    >
                      ❌ キャンセル
                    </button>
                    {isActioning && <span className="self-center text-xs text-gray-500">⏳</span>}
                  </div>
                </div>
              );
            })}

            {tasksLoading && tasks.length === 0 && (
              <div className="py-6 text-center text-sm text-gray-500">⏳ 読み込み中...</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
