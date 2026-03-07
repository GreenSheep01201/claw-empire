import { useState, useEffect, useCallback } from "react";
import { request, post } from "../api/core";

interface AppProject {
  id: string;
  name: string;
  project_path: string;
  core_goal: string | null;
  default_pack_key: string | null;
  github_repo: string | null;
  last_used_at: number | null;
  created_at: number;
  servers: AppServer[];
  taskCounts: Record<string, number>;
}

interface AppServer {
  id: string;
  name: string;
  command: string;
  cwd: string;
  port: number | null;
  status: "running" | "stopped" | "error";
  pid: number | null;
}

interface AppsResponse {
  ok: boolean;
  projects: AppProject[];
}

interface RegisterServerForm {
  name: string;
  command: string;
  port: string;
}

interface Props {
  onClose: () => void;
  onOpenLocalServer?: () => void;
}

function timeSince(ms: number | null): string {
  if (!ms) return "–";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "今すぐ";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  return `${Math.floor(diff / 86_400_000)}日前`;
}

function StatusDot({ status }: { status: "running" | "stopped" | "error" }) {
  const cls =
    status === "running"
      ? "bg-emerald-400"
      : status === "error"
        ? "bg-orange-400"
        : "bg-slate-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${cls} mr-1`} />;
}

export default function AppListPanel({ onClose, onOpenLocalServer }: Props) {
  const [projects, setProjects] = useState<AppProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState<string | null>(null); // project_path
  const [form, setForm] = useState<RegisterServerForm>({ name: "", command: "", port: "" });
  const [toasting, setToasting] = useState<string | null>(null);

  const loadApps = useCallback(async () => {
    try {
      const data = (await request("/api/apps")) as AppsResponse;
      if (data.ok) setProjects(data.projects);
    } catch {
      setError("アプリ一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  const toast = (msg: string) => {
    setToasting(msg);
    setTimeout(() => setToasting(null), 2500);
  };

  const handleRegisterServer = async (project: AppProject) => {
    if (!form.name || !form.command) return;
    try {
      await post("/api/local-servers", {
        name: form.name,
        command: form.command,
        cwd: project.project_path,
        port: form.port ? parseInt(form.port, 10) : null,
        env: {},
      });
      toast(`✅ "${form.name}" をサーバーとして登録しました`);
      setRegistering(null);
      setForm({ name: "", command: "", port: "" });
      void loadApps();
    } catch {
      toast("❌ 登録に失敗しました");
    }
  };

  const handleStartServer = async (serverId: string) => {
    try {
      await post(`/api/local-servers/${serverId}/start`, {});
      toast("▶ 起動しました");
      void loadApps();
    } catch {
      toast("❌ 起動に失敗しました");
    }
  };

  const handleStopServer = async (serverId: string) => {
    try {
      await post(`/api/local-servers/${serverId}/stop`, {});
      toast("■ 停止しました");
      setTimeout(() => void loadApps(), 1000);
    } catch {
      toast("❌ 停止に失敗しました");
    }
  };

  const totalTasks = (counts: Record<string, number>) =>
    Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10
                       shadow-2xl"
        style={{ background: "var(--ce-panel-bg, #1e1e2e)" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/10"
             style={{ background: "var(--ce-panel-bg, #1e1e2e)" }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">📦</span>
            <div>
              <h2 className="text-lg font-bold text-white">アプリ一覧</h2>
              <p className="text-xs text-white/50">ClawEmpireで管理しているプロジェクト</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenLocalServer && (
              <button
                onClick={onOpenLocalServer}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/80 hover:bg-indigo-600 text-white transition-colors"
              >
                🖥️ サーバー管理
              </button>
            )}
            <button
              onClick={() => void loadApps()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              🔄 更新
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              aria-label="閉じる"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center py-20 text-white/40">
              <span className="animate-pulse">読み込み中…</span>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
              {error}
            </div>
          )}

          {!loading && projects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-white/30 gap-3">
              <span className="text-4xl">📭</span>
              <p>プロジェクトが見つかりません</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {projects.map((proj) => {
              const runningServers = proj.servers.filter((s) => s.status === "running");
              const total = totalTasks(proj.taskCounts);
              const done = proj.taskCounts["done"] ?? 0;

              return (
                <div
                  key={proj.id}
                  className="rounded-xl border border-white/10 overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  {/* Project header */}
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-semibold text-white truncate">{proj.name}</span>
                          {proj.default_pack_key && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              {proj.default_pack_key}
                            </span>
                          )}
                          {runningServers.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              🟢 {runningServers.length}サーバー起動中
                            </span>
                          )}
                        </div>
                        {proj.core_goal && (
                          <p className="text-sm text-white/50 mt-1 line-clamp-2">{proj.core_goal}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-white/30">
                          <span title={proj.project_path} className="font-mono truncate max-w-xs">
                            📁 {proj.project_path}
                          </span>
                          <span>🕐 {timeSince(proj.last_used_at)}</span>
                          {total > 0 && (
                            <span>📋 {done}/{total} タスク完了</span>
                          )}
                          {proj.github_repo && (
                            <span>🔗 {proj.github_repo}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Servers section */}
                  {proj.servers.length > 0 && (
                    <div className="border-t border-white/5 px-5 py-3 space-y-2">
                      {proj.servers.map((srv) => (
                        <div key={srv.id} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm">
                            <StatusDot status={srv.status} />
                            <span className="text-white/70">{srv.name}</span>
                            {srv.port && (
                              <span className="text-white/30 font-mono text-xs">:{srv.port}</span>
                            )}
                            <span className="text-white/20 font-mono text-xs truncate max-w-[180px]">
                              {srv.command}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {srv.status !== "running" ? (
                              <button
                                onClick={() => void handleStartServer(srv.id)}
                                className="px-2 py-1 rounded text-xs bg-emerald-600/60 hover:bg-emerald-600 text-white transition-colors"
                              >
                                ▶ 起動
                              </button>
                            ) : (
                              <button
                                onClick={() => void handleStopServer(srv.id)}
                                className="px-2 py-1 rounded text-xs bg-red-600/60 hover:bg-red-600 text-white transition-colors"
                              >
                                ■ 停止
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Register server form */}
                  {registering === proj.project_path ? (
                    <div className="border-t border-white/5 px-5 py-3 space-y-3">
                      <p className="text-xs text-white/40 font-medium">サーバーを登録</p>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="名前"
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          className="col-span-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs placeholder-white/20 focus:outline-none focus:border-indigo-500"
                        />
                        <input
                          type="text"
                          placeholder="コマンド (例: npm start)"
                          value={form.command}
                          onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
                          className="col-span-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs placeholder-white/20 focus:outline-none focus:border-indigo-500"
                        />
                        <input
                          type="number"
                          placeholder="ポート"
                          value={form.port}
                          onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                          className="col-span-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs placeholder-white/20 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void handleRegisterServer(proj)}
                          disabled={!form.name || !form.command}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40"
                        >
                          登録
                        </button>
                        <button
                          onClick={() => setRegistering(null)}
                          className="px-3 py-1.5 rounded-lg text-xs bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-white/5 px-5 py-2">
                      <button
                        onClick={() => {
                          setRegistering(proj.project_path);
                          setForm({ name: proj.name + " Server", command: "npm start", port: "" });
                        }}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        + サーバーを追加登録
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toasting && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-slate-800 border border-white/10 text-white text-sm shadow-xl z-[60]">
          {toasting}
        </div>
      )}
    </div>
  );
}
