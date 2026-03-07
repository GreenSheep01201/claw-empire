import { useState, useEffect, useCallback, useRef } from "react";
import { request, post, del } from "../api/core";

interface ServerConfig {
  id: string;
  name: string;
  command: string;
  cwd: string;
  port: number | null;
  status: "running" | "stopped" | "error";
  pid: number | null;
  startedAt: number | null;
  memMB: number | null;
}

interface ServerListResponse {
  ok: boolean;
  servers: ServerConfig[];
  memAvailMB: number;
  maxConcurrent: number;
}

interface LogResponse {
  ok: boolean;
  logs: string[];
  status: string;
}

interface Props {
  onClose: () => void;
}

function statusBadge(status: string) {
  if (status === "running") return <span className="badge-running text-xs px-2 py-0.5 rounded-full font-medium">🟢 起動中</span>;
  if (status === "error")   return <span className="badge-error text-xs px-2 py-0.5 rounded-full font-medium">🟠 エラー</span>;
  return <span className="badge-stopped text-xs px-2 py-0.5 rounded-full font-medium">⚫ 停止中</span>;
}

export default function LocalServerPanel({ onClose }: Props) {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [memAvailMB, setMemAvailMB] = useState<number>(9999);
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Log viewer
  const [viewingLogs, setViewingLogs] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<HTMLDivElement>(null);

  // Register form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", command: "", cwd: "/home/naosuke/claw-empire", port: "" });

  const fetchServers = useCallback(async () => {
    try {
      const data = await request<ServerListResponse>("/api/local-servers");
      if (data.ok) {
        setServers(data.servers);
        setMemAvailMB(data.memAvailMB);
        setMaxConcurrent(data.maxConcurrent);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
    const t = setInterval(fetchServers, 5000);
    return () => clearInterval(t);
  }, [fetchServers]);

  const fetchLogs = useCallback(async (id: string) => {
    try {
      const data = await request<LogResponse>(`/api/local-servers/${id}/logs`);
      if (data.ok) {
        setLogs(data.logs);
        setTimeout(() => logsRef.current?.scrollTo({ top: 99999 }), 50);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!viewingLogs) return;
    fetchLogs(viewingLogs);
    const t = setInterval(() => fetchLogs(viewingLogs), 2000);
    return () => clearInterval(t);
  }, [viewingLogs, fetchLogs]);

  async function handleStart(id: string) {
    setActionBusy(id + ":start");
    setError(null);
    try {
      const data = await post<{ ok: boolean; memWarning?: string; error?: string }>(`/api/local-servers/${id}/start`);
      if (!data.ok) setError(data.error ?? "起動失敗");
      else if (data.memWarning) setError(data.memWarning); // show warning non-blocking
      await fetchServers();
    } catch (e) { setError(String(e)); }
    setActionBusy(null);
  }

  async function handleStop(id: string) {
    setActionBusy(id + ":stop");
    try {
      await post(`/api/local-servers/${id}/stop`);
      await fetchServers();
    } catch (e) { setError(String(e)); }
    setActionBusy(null);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    setActionBusy(id + ":delete");
    try {
      await del(`/api/local-servers/${id}`);
      await fetchServers();
      if (viewingLogs === id) setViewingLogs(null);
    } catch (e) { setError(String(e)); }
    setActionBusy(null);
  }

  async function handleRegister() {
    if (!form.name || !form.command || !form.cwd) { setError("名前・コマンド・作業ディレクトリは必須です"); return; }
    setActionBusy("register");
    setError(null);
    try {
      const data = await post<{ ok: boolean; error?: string }>("/api/local-servers", {
        name: form.name,
        command: form.command,
        cwd: form.cwd,
        port: form.port ? parseInt(form.port) : null,
      });
      if (!data.ok) setError(data.error ?? "登録失敗");
      else {
        setForm({ name: "", command: "", cwd: "/home/naosuke/claw-empire", port: "" });
        setShowForm(false);
        await fetchServers();
      }
    } catch (e) { setError(String(e)); }
    setActionBusy(null);
  }

  const runningCount = servers.filter((s) => s.status === "running").length;
  const memLow = memAvailMB < 500;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-center sm:justify-center"
      style={{ background: "var(--th-modal-overlay)" }}
    >
      <div
        className="panel-overlay flex flex-col w-full max-w-2xl overflow-hidden"
        style={{
          maxHeight: "min(92vh, 700px)",
          border: "1px solid var(--th-border)",
          background: "var(--th-panel-bg)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--th-border)" }}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-lg">🖥️</span>
            <div>
              <h2 className="text-sm font-bold" style={{ color: "var(--th-text-heading)" }}>
                ローカルサーバー管理
              </h2>
              <p className="text-xs" style={{ color: "var(--th-text-muted)" }}>
                起動中: {runningCount}/{maxConcurrent} &nbsp;|&nbsp; 空きRAM: {" "}
                <span style={{ color: memLow ? "#f59e0b" : "var(--th-text-muted)" }}>
                  {memAvailMB}MB{memLow ? " ⚠️" : ""}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm((v) => !v)}
              className="header-action-btn header-action-btn-primary text-xs px-3 py-1.5"
            >
              ＋ 登録
            </button>
            <button
              onClick={onClose}
              className="text-xl leading-none opacity-60 hover:opacity-100 transition px-1"
              style={{ color: "var(--th-text-secondary)" }}
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="px-5 py-2 text-xs" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b", borderBottom: "1px solid rgba(245,158,11,0.2)" }}>
            {error}
            <button className="ml-2 underline" onClick={() => setError(null)}>閉じる</button>
          </div>
        )}

        {/* Register form */}
        {showForm && (
          <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--th-border)", background: "var(--th-glass-bg)" }}>
            <h3 className="text-xs font-semibold mb-3" style={{ color: "var(--th-text-muted)" }}>新規サーバー登録</h3>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[10px] mb-0.5 block" style={{ color: "var(--th-text-muted)" }}>名前 *</label>
                <input
                  className="w-full rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                  style={{ border: "1px solid var(--th-border)", background: "var(--th-input-bg)", color: "var(--th-text-primary)" }}
                  placeholder="My App"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[10px] mb-0.5 block" style={{ color: "var(--th-text-muted)" }}>ポート（任意）</label>
                <input
                  className="w-full rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                  style={{ border: "1px solid var(--th-border)", background: "var(--th-input-bg)", color: "var(--th-text-primary)" }}
                  placeholder="3000"
                  value={form.port}
                  onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                />
              </div>
            </div>
            <div className="mb-2">
              <label className="text-[10px] mb-0.5 block" style={{ color: "var(--th-text-muted)" }}>起動コマンド *</label>
              <input
                className="w-full rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none"
                style={{ border: "1px solid var(--th-border)", background: "var(--th-input-bg)", color: "var(--th-text-primary)" }}
                placeholder="npm run dev"
                value={form.command}
                onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
              />
            </div>
            <div className="mb-3">
              <label className="text-[10px] mb-0.5 block" style={{ color: "var(--th-text-muted)" }}>作業ディレクトリ *</label>
              <input
                className="w-full rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none"
                style={{ border: "1px solid var(--th-border)", background: "var(--th-input-bg)", color: "var(--th-text-primary)" }}
                value={form.cwd}
                onChange={(e) => setForm((f) => ({ ...f, cwd: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRegister}
                disabled={actionBusy === "register"}
                className="header-action-btn header-action-btn-primary text-xs px-4 py-1.5 disabled:opacity-50"
              >
                {actionBusy === "register" ? "登録中…" : "登録する"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="header-action-btn header-action-btn-secondary text-xs px-3 py-1.5"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex flex-1 min-h-0">
          {/* Server list */}
          <div
            className="flex flex-col gap-2 overflow-y-auto p-4"
            style={{ width: viewingLogs ? "50%" : "100%", borderRight: viewingLogs ? "1px solid var(--th-border)" : "none" }}
          >
            {loading ? (
              <p className="text-xs text-center py-6" style={{ color: "var(--th-text-muted)" }}>読み込み中…</p>
            ) : servers.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-3xl mb-2">🖥️</div>
                <p className="text-sm" style={{ color: "var(--th-text-muted)" }}>登録済みサーバーはありません</p>
                <p className="text-xs mt-1" style={{ color: "var(--th-text-muted)" }}>「＋ 登録」ボタンで追加してください</p>
              </div>
            ) : (
              servers.map((s) => (
                <div
                  key={s.id}
                  className="ce-card-interactive p-3.5"
                  style={{ border: "1px solid var(--th-card-border)", background: "var(--th-card-bg)" }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold truncate" style={{ color: "var(--th-text-heading)" }}>{s.name}</span>
                        {statusBadge(s.status)}
                      </div>
                      <code className="text-[10px] block truncate" style={{ color: "var(--th-text-muted)" }}>{s.command}</code>
                      <code className="text-[10px] block truncate" style={{ color: "var(--th-text-muted)" }}>{s.cwd}</code>
                      {s.memMB !== null && (
                        <span className="text-[10px]" style={{ color: "var(--th-text-muted)" }}>RAM: {s.memMB}MB</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {s.status !== "running" ? (
                      <button
                        onClick={() => handleStart(s.id)}
                        disabled={!!actionBusy}
                        className="header-action-btn header-action-btn-primary text-xs px-2.5 py-1 disabled:opacity-50"
                      >
                        {actionBusy === s.id + ":start" ? "起動中…" : "▶ 起動"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStop(s.id)}
                        disabled={!!actionBusy}
                        className="header-action-btn header-action-btn-secondary text-xs px-2.5 py-1 disabled:opacity-50"
                        style={{ borderColor: "rgba(239,68,68,0.4)", color: "#ef4444" }}
                      >
                        {actionBusy === s.id + ":stop" ? "停止中…" : "■ 停止"}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setViewingLogs(viewingLogs === s.id ? null : s.id);
                        setLogs([]);
                      }}
                      className={`header-action-btn header-action-btn-secondary text-xs px-2.5 py-1${viewingLogs === s.id ? " opacity-80" : ""}`}
                    >
                      📋 ログ
                    </button>
                    {s.port && (
                      <a
                        href={`http://localhost:${s.port}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="header-action-btn header-action-btn-secondary text-xs px-2.5 py-1"
                      >
                        🔗 {s.port}
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(s.id, s.name)}
                      disabled={!!actionBusy}
                      className="header-action-btn header-action-btn-secondary text-xs px-2.5 py-1 ml-auto disabled:opacity-50"
                      style={{ color: "var(--th-text-muted)" }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Log viewer */}
          {viewingLogs && (
            <div className="flex flex-col flex-1 min-h-0 min-w-0">
              <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderBottom: "1px solid var(--th-border)" }}>
                <span className="text-xs font-semibold" style={{ color: "var(--th-text-muted)" }}>
                  📋 ログ — {servers.find((s) => s.id === viewingLogs)?.name}
                </span>
                <button onClick={() => setViewingLogs(null)} className="text-xs opacity-60 hover:opacity-100" style={{ color: "var(--th-text-secondary)" }}>✕</button>
              </div>
              <div
                ref={logsRef}
                className="flex-1 overflow-y-auto p-3 font-mono text-[10px] leading-relaxed"
                style={{ background: "rgba(0,0,0,0.3)", color: "#a3e635" }}
              >
                {logs.length === 0 ? (
                  <span style={{ color: "var(--th-text-muted)" }}>ログなし（サーバー起動後に表示されます）</span>
                ) : (
                  logs.map((line, i) => (
                    <div key={i} className="break-all">{line}</div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
