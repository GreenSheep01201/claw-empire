import { useEffect, useState, useMemo } from "react";
import type { Agent, Department } from "../types";
import type { UiLanguage } from "../i18n";
import { pickLang } from "../i18n";
import { getMessages, createTask } from "../api";
import AgentAvatar from "./AgentAvatar";

const STANDUP_KEY = "claw_weekly_standup_last";

interface StaffRosterPanelProps {
  agents: Agent[];
  departments: Department[];
  unreadAgentIds: Set<string>;
  uiLanguage: UiLanguage;
  onOpenChat: (agent: Agent) => void;
  onClose: () => void;
}

const STATUS_ICON: Record<string, string> = {
  working: "🟢",
  idle: "⚪",
  meeting: "🔵",
  offline: "⚫",
  paused: "🟡",
};

const ROLE_ORDER: Record<string, number> = {
  team_leader: 0,
  senior: 1,
  junior: 2,
  intern: 3,
};

function fmtAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "今";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  return `${Math.floor(diff / 86_400_000)}日前`;
}

export default function StaffRosterPanel({
  agents,
  departments,
  unreadAgentIds,
  uiLanguage,
  onOpenChat,
  onClose,
}: StaffRosterPanelProps) {
  const t = (text: { ko: string; en: string; ja?: string; zh?: string }) => pickLang(uiLanguage, text);
  const [filterDept, setFilterDept] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [lastMessages, setLastMessages] = useState<Record<string, { content: string; ts: number }>>({});
  const [activeTab, setActiveTab] = useState<"roster" | "org">("roster");
  const [standupCreating, setStandupCreating] = useState(false);
  const [lastStandup, setLastStandup] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(STANDUP_KEY) ?? "0", 10) || 0; } catch { return 0; }
  });

  // Load last message per agent (batch: fetch recent messages once)
  useEffect(() => {
    getMessages({ limit: 200 })
      .then((msgs) => {
        const map: Record<string, { content: string; ts: number }> = {};
        for (const m of msgs) {
          if (m.receiver_type === "agent" && m.receiver_id) {
            const existing = map[m.receiver_id];
            if (!existing || m.created_at > existing.ts) {
              map[m.receiver_id] = { content: m.content, ts: m.created_at };
            }
          }
          if (m.sender_type === "agent" && m.sender_id) {
            const existing = map[m.sender_id];
            if (!existing || m.created_at > existing.ts) {
              map[m.sender_id] = { content: m.content, ts: m.created_at };
            }
          }
        }
        setLastMessages(map);
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    return agents
      .filter((a) => filterDept === "all" || a.department_id === filterDept)
      .filter((a) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return a.name.toLowerCase().includes(q) || (a.name_ja || "").toLowerCase().includes(q);
      })
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
  }, [agents, filterDept, search]);

  // Group by department
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const a of filtered) {
      const key = a.department_id || "other";
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    // Sort depts by order
    return [...map.entries()].sort((a, b) => {
      const dA = departments.findIndex((d) => d.id === a[0]);
      const dB = departments.findIndex((d) => d.id === b[0]);
      return (dA === -1 ? 99 : dA) - (dB === -1 ? 99 : dB);
    });
  }, [filtered, departments]);

  const totalUnread = unreadAgentIds.size;

  // Org dashboard calculations
  const orgStats = useMemo(() => {
    const working = agents.filter((a) => a.status === "working").length;
    const idle = agents.filter((a) => a.status === "idle").length;
    const meeting = agents.filter((a) => (a.status as string) === "meeting").length;
    const offline = agents.filter((a) => a.status === "offline" || a.status === "break").length;
    return { working, idle, meeting, offline, total: agents.length };
  }, [agents]);

  const deptWorkload = useMemo(() => {
    return departments.map((dept) => {
      const members = agents.filter((a) => a.department_id === dept.id);
      const working = members.filter((a) => a.status === "working").length;
      return { dept, total: members.length, working, idle: members.length - working };
    }).filter((d) => d.total > 0);
  }, [departments, agents]);

  const idleAgents = useMemo(
    () => agents.filter((a) => a.status === "idle" || a.status === "break").slice(0, 6),
    [agents]
  );

  const createWeeklyStandup = async () => {
    if (standupCreating) return;
    setStandupCreating(true);
    try {
      // Find planning leader or any team leader
      const leader = agents.find((a) => a.role === "team_leader" && a.status !== "working")
        ?? agents.find((a) => a.role === "team_leader");
      const today = new Date().toLocaleDateString("ja-JP");
      await createTask({
        title: `📋 週次スタンドアップ — ${today}`,
        description:
          "各部署の進捗状況を集約し、今週の成果・課題・来週の計画をまとめた週次スタンドアップレポートを作成してください。全エージェントの稼働状況・完了タスク数・課題点を整理し、CEOへ報告できる形式でまとめてください。",
        assigned_agent_id: leader?.id,
        department_id: leader?.department_id ?? undefined,
        task_type: "documentation",
        priority: 7,
      });
      const now = Date.now();
      setLastStandup(now);
      try { localStorage.setItem(STANDUP_KEY, String(now)); } catch { /* ignore */ }
    } catch (e) {
      console.error("Failed to create standup task:", e);
    } finally {
      setStandupCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 w-full max-w-xl rounded-2xl border border-slate-600/50 bg-slate-900 shadow-2xl flex flex-col"
        style={{ maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/50 px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">{activeTab === "org" ? "🏢" : "👥"}</span>
            <div>
              <h2 className="text-base font-bold text-white">
                {activeTab === "org"
                  ? "組織ダッシュボード"
                  : t({ ko: "스태프 로스터", en: "Staff Roster", ja: "スタッフ一覧", zh: "员工名册" })}
              </h2>
              <p className="text-[11px] text-slate-500">
                {agents.length}{t({ ko: "명 재직 중", en: " staff members", ja: "名在籍", zh: "名员工" })}
                {totalUnread > 0 && (
                  <span className="ml-2 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-400">
                    {totalUnread} unread
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-700 overflow-hidden text-[11px]">
              <button
                onClick={() => setActiveTab("roster")}
                className={`px-2.5 py-1.5 font-medium transition ${activeTab === "roster" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
              >
                👥 スタッフ
              </button>
              <button
                onClick={() => setActiveTab("org")}
                className={`px-2.5 py-1.5 font-medium transition ${activeTab === "org" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
              >
                🏢 組織
              </button>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Filter bar */}
        {activeTab === "org" ? (
          /* Org Dashboard */
          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            {/* Status strip */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "稼働中", value: orgStats.working, color: "text-green-400", bg: "bg-green-500/10" },
                { label: "アイドル", value: orgStats.idle, color: "text-slate-400", bg: "bg-slate-500/10" },
                { label: "会議中", value: orgStats.meeting, color: "text-blue-400", bg: "bg-blue-500/10" },
                { label: "オフライン", value: orgStats.offline, color: "text-slate-600", bg: "bg-slate-800/50" },
              ].map((tile) => (
                <div key={tile.label} className={`rounded-xl ${tile.bg} border border-slate-700/50 p-2.5 text-center`}>
                  <div className={`text-lg font-bold ${tile.color}`}>{tile.value}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{tile.label}</div>
                </div>
              ))}
            </div>

            {/* Department Workload */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">📊 部門別ワークロード</div>
              <div className="space-y-2">
                {deptWorkload.map(({ dept, total, working }) => {
                  const pct = total > 0 ? Math.round((working / total) * 100) : 0;
                  const barColor = pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-amber-500" : pct > 0 ? "bg-green-500" : "bg-slate-600";
                  return (
                    <div key={dept.id} className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-3 py-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{dept.icon}</span>
                          <span className="text-xs font-medium text-white">{dept.name}</span>
                        </div>
                        <span className="text-[11px] text-slate-400">{working}/{total} 稼働</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-700">
                        <div
                          className={`h-1.5 rounded-full transition-all ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Weekly Standup */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">📋 週次スタンドアップ</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {lastStandup > 0
                      ? `最終実施: ${new Date(lastStandup).toLocaleDateString("ja-JP")} (${fmtAgo(lastStandup)})`
                      : "未実施"}
                  </div>
                </div>
                <button
                  onClick={() => void createWeeklyStandup()}
                  disabled={standupCreating}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition ${
                    standupCreating
                      ? "cursor-wait bg-blue-500/30 text-blue-300"
                      : "bg-blue-600 text-white hover:bg-blue-500"
                  }`}
                >
                  {standupCreating ? "作成中…" : "今すぐ実行"}
                </button>
              </div>
            </div>

            {/* Idle agents quick-assign */}
            {idleAgents.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                  ⚡ アイドルエージェント（チャットで指示）
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {idleAgents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => { onOpenChat(agent); onClose(); }}
                      className="flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800/30 px-3 py-2 text-left hover:bg-slate-700/50 transition"
                    >
                      <AgentAvatar agent={agent} agents={agents} size={28} rounded="xl" />
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-white truncate">
                          {uiLanguage === "ja" ? (agent.name_ja || agent.name) : agent.name}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">{agent.role}</div>
                      </div>
                      <span className="ml-auto text-slate-600 text-xs">💬</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
        <>
        {/* Filter bar */}
        <div className="flex items-center gap-2 border-b border-slate-700/40 px-4 py-2 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t({ ko: "이름 검색...", en: "Search staff...", ja: "名前で検索...", zh: "搜索员工..." })}
            className="flex-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 border border-slate-700 focus:border-slate-500 outline-none"
          />
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="rounded-lg bg-slate-800 px-2 py-1.5 text-xs text-slate-300 border border-slate-700"
          >
            <option value="all">{t({ ko: "전체", en: "All", ja: "全部門", zh: "全部" })}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.icon} {d.name}</option>
            ))}
          </select>
        </div>

        {/* Staff list */}
        <div className="overflow-y-auto flex-1 px-3 py-2">
          {grouped.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              {t({ ko: "스태프가 없습니다", en: "No staff found", ja: "スタッフなし", zh: "无员工" })}
            </p>
          ) : (
            <div className="space-y-3">
              {grouped.map(([deptId, members]) => {
                const dept = departments.find((d) => d.id === deptId);
                return (
                  <div key={deptId}>
                    {/* Dept header — only show when no dept filter */}
                    {filterDept === "all" && dept && (
                      <div className="mb-1 flex items-center gap-1.5 px-1">
                        <span className="text-sm">{dept.icon}</span>
                        <span
                          className="text-[11px] font-semibold uppercase tracking-wider"
                          style={{ color: dept.color }}
                        >
                          {dept.name}
                        </span>
                        <div className="h-px flex-1" style={{ backgroundColor: dept.color + "40" }} />
                        <span className="text-[10px] text-slate-600">{members.length}</span>
                      </div>
                    )}
                    <div className="space-y-1">
                      {members.map((agent) => {
                        const hasUnread = unreadAgentIds.has(agent.id);
                        const lastMsg = lastMessages[agent.id];
                        const statusIcon = STATUS_ICON[agent.status] ?? "⚪";
                        return (
                          <button
                            key={agent.id}
                            onClick={() => { onOpenChat(agent); onClose(); }}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                              hasUnread
                                ? "bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/15"
                                : "hover:bg-slate-800/70"
                            }`}
                          >
                            <div className="relative shrink-0">
                              <AgentAvatar agent={agent} agents={agents} size={38} rounded="xl" />
                              <span className="absolute -bottom-0.5 -right-0.5 text-[10px]">{statusIcon}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-white truncate">
                                  {uiLanguage === "ja" ? (agent.name_ja || agent.name) : agent.name}
                                </span>
                                <span className="shrink-0 rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] text-slate-400">
                                  {agent.role}
                                </span>
                                {hasUnread && (
                                  <span className="shrink-0 h-2 w-2 rounded-full bg-blue-400" />
                                )}
                              </div>
                              {lastMsg ? (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <p className="text-[11px] text-slate-500 truncate">{lastMsg.content}</p>
                                  <span className="shrink-0 text-[10px] text-slate-600">{fmtAgo(lastMsg.ts)}</span>
                                </div>
                              ) : (
                                <p className="text-[11px] text-slate-600">
                                  {t({ ko: "대화 없음", en: "No messages yet", ja: "まだメッセージなし", zh: "暂无消息" })}
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 text-slate-600 group-hover:text-slate-400">💬</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </>
        )}

        {/* Footer */}
        <div className="border-t border-slate-700/50 px-5 py-3 shrink-0">
          <p className="text-[11px] text-slate-600 text-center">
            {activeTab === "org"
              ? "組織全体の状況をリアルタイムで確認 · スタンドアップ・ワークロード管理"
              : t({ ko: "스태프를 클릭하면 1:1 채팅이 시작됩니다", en: "Click a staff member to start a direct chat", ja: "スタッフをクリックして1対1チャット開始", zh: "点击员工开始一对一聊天" })}
          </p>
        </div>
      </div>
    </div>
  );
}
