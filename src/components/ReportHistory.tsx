import { useEffect, useMemo, useState } from "react";
import type { Agent, Department } from "../types";
import type { TaskReportSummary, TaskReportDetail } from "../api";
import type { UiLanguage } from "../i18n";
import { pickLang } from "../i18n";
import { getTaskReports, getTaskReportDetail } from "../api";
import AgentAvatar from "./AgentAvatar";
import TaskReportPopup from "./TaskReportPopup";

interface ReportHistoryProps {
  agents: Agent[];
  departments: Department[];
  uiLanguage: UiLanguage;
  onClose: () => void;
}

const CHECKLIST_KEY = "claw_ceo_release_checklist";

function fmtDate(ts: number | null | undefined): string {
  if (!ts) return "-";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDateShort(ts: number | null | undefined): string {
  if (!ts) return "-";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function taskTypeIcon(type: string | null | undefined): string {
  switch (type) {
    case "development": return "💻";
    case "design": return "🎨";
    case "analysis": return "📊";
    case "presentation": return "📑";
    case "documentation": return "📝";
    default: return "⚙️";
  }
}

function weekStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

function monthStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function loadChecklist(): Record<string, { tried: boolean; announced: boolean }> {
  try {
    return JSON.parse(localStorage.getItem(CHECKLIST_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveChecklist(data: Record<string, { tried: boolean; announced: boolean }>) {
  localStorage.setItem(CHECKLIST_KEY, JSON.stringify(data));
}

export default function ReportHistory({ agents, departments, uiLanguage, onClose }: ReportHistoryProps) {
  const t = (text: { ko: string; en: string; ja?: string; zh?: string }) => pickLang(uiLanguage, text);
  const [reports, setReports] = useState<TaskReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<TaskReportDetail | null>(null);
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"timeline" | "group">("timeline");
  const [checklist, setChecklist] = useState<Record<string, { tried: boolean; announced: boolean }>>(loadChecklist);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  useEffect(() => {
    getTaskReports()
      .then((r) => setReports(r))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return reports
      .filter((r) => filterDept === "all" || r.department_id === filterDept)
      .filter((r) => filterType === "all" || (r as TaskReportSummary & { task_type?: string }).task_type === filterType)
      .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0));
  }, [reports, filterDept, filterType]);

  // Summary stats
  const now = Date.now();
  const thisWeekStart = weekStart(now);
  const thisMonthStart = monthStart(now);
  const weekCount = reports.filter((r) => (r.completed_at ?? 0) >= thisWeekStart).length;
  const monthCount = reports.filter((r) => (r.completed_at ?? 0) >= thisMonthStart).length;
  const uncheckedCount = filtered.filter((r) => {
    const c = checklist[r.id];
    return !c || !c.tried;
  }).length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
  const pageReports = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  // Group by project for group view
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const r of filtered) {
      const key = r.project_name?.trim() || "General";
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  const toggleCheck = (id: string, field: "tried" | "announced") => {
    setChecklist((prev) => {
      const updated = { ...prev, [id]: { tried: prev[id]?.tried ?? false, announced: prev[id]?.announced ?? false, [field]: !prev[id]?.[field] } };
      saveChecklist(updated);
      return updated;
    });
  };

  const handleOpenDetail = async (taskId: string) => {
    try {
      const d = await getTaskReportDetail(taskId);
      setDetail(d);
    } catch (e) {
      console.error("Failed to load report detail:", e);
    }
  };

  if (detail) {
    return (
      <TaskReportPopup
        report={detail}
        agents={agents}
        departments={departments}
        uiLanguage={uiLanguage}
        onClose={() => setDetail(null)}
      />
    );
  }

  const renderReleaseCard = (r: TaskReportSummary, showTimeDot = false) => {
    const agent = agents.find((a) => a.id === r.assigned_agent_id);
    const dept = departments.find((d) => d.id === r.department_id);
    const agentName = uiLanguage === "ko" ? r.agent_name_ko || r.agent_name : r.agent_name;
    const deptName = uiLanguage === "ko" ? r.dept_name_ko || r.dept_name : (dept?.name || r.dept_name);
    const c = checklist[r.id] ?? { tried: false, announced: false };
    const typeStr = (r as TaskReportSummary & { task_type?: string }).task_type;
    const icon = taskTypeIcon(typeStr);
    const allChecked = c.tried && c.announced;

    return (
      <div key={r.id} className={`relative flex gap-3 ${showTimeDot ? "pl-6" : ""}`}>
        {showTimeDot && (
          <>
            <div className="absolute left-0 top-3 h-3 w-3 rounded-full border-2 border-emerald-500 bg-slate-900" />
          </>
        )}
        <div
          className={`flex-1 rounded-xl border p-3 transition ${
            allChecked ? "border-slate-700/40 bg-slate-800/20 opacity-60" : "border-slate-700/60 bg-slate-800/50 hover:border-slate-600"
          }`}
        >
          {/* Top row */}
          <div className="mb-2 flex items-start gap-2">
            <span className="mt-0.5 text-base">{icon}</span>
            <div className="min-w-0 flex-1">
              <button
                onClick={() => handleOpenDetail(r.id)}
                className="text-left text-sm font-semibold text-white hover:text-emerald-300 transition"
              >
                {r.title}
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                {dept && (
                  <span
                    className="rounded px-1.5 py-0.5 font-medium"
                    style={{ backgroundColor: dept.color + "25", color: dept.color }}
                  >
                    {dept.icon} {deptName}
                  </span>
                )}
                <span className="text-slate-500">{agentName}</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-500">{fmtDateShort(r.completed_at)}</span>
                {allChecked && <span className="text-emerald-500">✓ {t({ ko: "확인완료", en: "Verified", ja: "確認済み", zh: "已确认" })}</span>}
              </div>
            </div>
            <AgentAvatar agent={agent} agents={agents} size={28} rounded="xl" />
          </div>

          {/* CEO checklist */}
          <div className="flex items-center gap-4 border-t border-slate-700/40 pt-2 mt-1">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200">
              <input
                type="checkbox"
                checked={c.tried}
                onChange={() => toggleCheck(r.id, "tried")}
                className="h-3 w-3 rounded accent-emerald-500"
              />
              {t({ ko: "직접 확인했나요?", en: "Tried it?", ja: "試しましたか？", zh: "试用了吗？" })}
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200">
              <input
                type="checkbox"
                checked={c.announced}
                onChange={() => toggleCheck(r.id, "announced")}
                className="h-3 w-3 rounded accent-blue-500"
              />
              {t({ ko: "사용자에게 공지했나요?", en: "Announced?", ja: "告知しましたか？", zh: "已公告？" })}
            </label>
            <button
              onClick={() => handleOpenDetail(r.id)}
              className="ml-auto text-[11px] text-slate-500 hover:text-emerald-400 transition"
            >
              {t({ ko: "상세 보고서 →", en: "Full report →", ja: "詳細レポート →", zh: "查看详情 →" })}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 w-full max-w-2xl rounded-2xl border border-emerald-500/30 bg-slate-900 shadow-2xl shadow-emerald-500/10 flex flex-col"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/50 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚀</span>
            <div>
              <h2 className="text-lg font-bold text-white">
                {t({ ko: "CEO 기능 릴리스 이력", en: "Feature Release History", ja: "機能リリース履歴", zh: "功能发布历史" })}
              </h2>
              <p className="text-[11px] text-slate-500">
                {t({ ko: "CEO 전용 완료 기능 체크리스트", en: "CEO checklist for completed features", ja: "CEO専用完了機能チェックリスト", zh: "CEO专属功能完成清单" })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-4 divide-x divide-slate-700/50 border-b border-slate-700/40 bg-slate-800/30 shrink-0">
          <div className="px-4 py-2.5 text-center">
            <p className="text-xl font-bold text-white">{reports.length}</p>
            <p className="text-[10px] text-slate-500">{t({ ko: "전체", en: "Total", ja: "合計", zh: "总计" })}</p>
          </div>
          <div className="px-4 py-2.5 text-center">
            <p className="text-xl font-bold text-emerald-400">{monthCount}</p>
            <p className="text-[10px] text-slate-500">{t({ ko: "이번 달", en: "This Month", ja: "今月", zh: "本月" })}</p>
          </div>
          <div className="px-4 py-2.5 text-center">
            <p className="text-xl font-bold text-blue-400">{weekCount}</p>
            <p className="text-[10px] text-slate-500">{t({ ko: "이번 주", en: "This Week", ja: "今週", zh: "本周" })}</p>
          </div>
          <div className="px-4 py-2.5 text-center">
            <p className="text-xl font-bold text-amber-400">{uncheckedCount}</p>
            <p className="text-[10px] text-slate-500">{t({ ko: "미확인", en: "Unchecked", ja: "未確認", zh: "未确认" })}</p>
          </div>
        </div>

        {/* Filter & view toggle bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700/40 px-4 py-2 shrink-0">
          <select
            value={filterDept}
            onChange={(e) => { setFilterDept(e.target.value); setPage(0); }}
            className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-300 border border-slate-700"
          >
            <option value="all">{t({ ko: "전체 부서", en: "All Depts", ja: "全部門", zh: "全部门" })}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.icon} {d.name}</option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setViewMode("timeline")}
              className={`rounded-lg px-2.5 py-1 text-xs ${viewMode === "timeline" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
            >
              🕐 {t({ ko: "타임라인", en: "Timeline", ja: "タイムライン", zh: "时间线" })}
            </button>
            <button
              onClick={() => setViewMode("group")}
              className={`rounded-lg px-2.5 py-1 text-xs ${viewMode === "group" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
            >
              📁 {t({ ko: "프로젝트별", en: "By Project", ja: "PJ別", zh: "按项目" })}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-slate-500">{t({ ko: "불러오는 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中..." })}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="mb-2 text-3xl opacity-40">📭</span>
              <p className="text-sm text-slate-500">{t({ ko: "완료된 보고서가 없습니다", en: "No releases yet", ja: "リリースなし", zh: "暂无发布" })}</p>
            </div>
          ) : viewMode === "timeline" ? (
            <div className="relative space-y-3 border-l-2 border-slate-700/50 pl-4 ml-1">
              {pageReports.map((r) => renderReleaseCard(r, true))}
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(([proj, rows]) => (
                <div key={proj} className="rounded-xl border border-slate-700/50 overflow-hidden">
                  <div className="flex items-center justify-between bg-slate-800/70 px-4 py-2">
                    <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wider truncate">{proj}</p>
                    <span className="text-[11px] text-slate-500">{rows.length}</span>
                  </div>
                  <div className="divide-y divide-slate-700/30 px-3 py-2 space-y-2">
                    {rows.slice(0, 5).map((r) => renderReleaseCard(r, false))}
                    {rows.length > 5 && (
                      <p className="text-center text-[11px] text-slate-600 pt-1">
                        {t({ ko: `외 ${rows.length - 5}건`, en: `+${rows.length - 5} more`, ja: `他${rows.length - 5}件`, zh: `另${rows.length - 5}条` })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700/50 px-6 py-3 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {t({ ko: `${filtered.length}건 표시 중`, en: `${filtered.length} releases`, ja: `${filtered.length}件`, zh: `${filtered.length}条` })}
            </span>
            <div className="flex items-center gap-2">
              {totalPages > 1 && viewMode === "timeline" && (
                <>
                  <button
                    type="button"
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage <= 0}
                    className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 disabled:opacity-40"
                  >
                    {t({ ko: "이전", en: "Prev", ja: "前へ", zh: "上一页" })}
                  </button>
                  <span className="text-[11px] text-slate-400">{currentPage + 1} / {totalPages}</span>
                  <button
                    type="button"
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage >= totalPages - 1}
                    className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 disabled:opacity-40"
                  >
                    {t({ ko: "다음", en: "Next", ja: "次へ", zh: "下一页" })}
                  </button>
                </>
              )}
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
    </div>
  );
}

