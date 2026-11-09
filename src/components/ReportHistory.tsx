import Dialog from "./ui/Dialog";
import type { LangText } from "../i18n";
import { useEffect, useMemo, useState } from "react";
import type { Agent, Department } from "../types";
import type { TaskReportSummary, TaskReportDetail } from "../api";
import type { UiLanguage } from "../i18n";
import { pickLang } from "../i18n";
import { getTaskReports, getTaskReportDetail } from "../api";
import AgentAvatar from "./AgentAvatar";
import TaskReportPopup from "./TaskReportPopup";
import { resolveReportAgent } from "./task-report-agent";

interface ReportHistoryProps {
  agents: Agent[];
  departments: Department[];
  uiLanguage: UiLanguage;
  onClose: () => void;
}

const PAGE_SIZE = 5;
const GROUP_ITEMS_PER_PAGE = 3;

function fmtDate(ts: number | null | undefined): string {
  if (!ts) return "-";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function projectNameFromSummary(report: TaskReportSummary): string {
  if (report.project_name && report.project_name.trim()) return report.project_name.trim();
  if (!report.project_path) return "General";
  const trimmed = report.project_path.replace(/[\\/]+$/, "");
  const seg = trimmed.split(/[\\/]/).pop();
  return seg || "General";
}

export default function ReportHistory({ agents, departments, uiLanguage, onClose }: ReportHistoryProps) {
  const t = (text: LangText) => pickLang(uiLanguage, text);
  const [reports, setReports] = useState<TaskReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<TaskReportDetail | null>(null);
  const [page, setPage] = useState(0);
  const [groupPages, setGroupPages] = useState<Record<string, number>>({});

  const totalPages = Math.max(1, Math.ceil(reports.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, reports.length);
  const pageReports = reports.slice(pageStart, pageEnd);

  const groupedPageReports = useMemo(() => {
    const groups = new Map<string, TaskReportSummary[]>();
    for (const report of pageReports) {
      const key = projectNameFromSummary(report);
      const bucket = groups.get(key) ?? [];
      bucket.push(report);
      groups.set(key, bucket);
    }
    return [...groups.entries()];
  }, [pageReports]);

  useEffect(() => {
    setPage(0);
    setGroupPages({});
  }, [reports]);

  // 페이지 변경 시 그룹 서브 페이지 리셋
  useEffect(() => {
    setGroupPages({});
  }, [page]);

  useEffect(() => {
    getTaskReports()
      .then((r) => setReports(r))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleGroupPageChange = (groupKey: string, nextPage: number, groupTotalPages: number) => {
    const bounded = Math.min(Math.max(nextPage, 0), Math.max(groupTotalPages - 1, 0));
    setGroupPages((prev) => ({ ...prev, [groupKey]: bounded }));
  };

  const handleOpenDetail = async (taskId: string) => {
    try {
      const d = await getTaskReportDetail(taskId);
      setDetail(d);
    } catch (e) {
      console.error("Failed to load report detail:", e);
    }
  };

  // 상세 보기가 열려 있으면 TaskReportPopup 표시
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

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
      title={t({ ko: "작업 보고서 이력", en: "Report History", ja: "レポート履歴", zh: "报告历史", fr: "Rapports" })}
    >
      {/* Content */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-sm text-slate-500">
              {t({ ko: "불러오는 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中..." })}
            </div>
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="mb-2 text-3xl opacity-40">&#x1F4ED;</span>
            <p className="text-sm text-slate-500">
              {t({
                ko: "완료된 보고서가 없습니다",
                en: "No completed reports",
                ja: "完了レポートなし",
                zh: "没有已完成的报告",
              })}
            </p>
          </div>
        ) : (
          <div className="space-y-4 px-4 py-3">
            {groupedPageReports.map(([projectName, rows]) => {
              const groupTotal = Math.max(1, Math.ceil(rows.length / GROUP_ITEMS_PER_PAGE));
              const groupCurrent = Math.min(Math.max(groupPages[projectName] ?? 0, 0), groupTotal - 1);
              const gStart = groupCurrent * GROUP_ITEMS_PER_PAGE;
              const gEnd = Math.min(gStart + GROUP_ITEMS_PER_PAGE, rows.length);
              const visibleRows = rows.slice(gStart, gEnd);

              return (
                <div key={projectName} className="overflow-hidden rounded-xl border border-slate-700/50">
                  <div className="flex items-center justify-between bg-slate-800/70 px-4 py-2">
                    <p className="truncate text-xs font-semibold uppercase tracking-wider text-emerald-300">
                      {projectName}
                    </p>
                    <span className="text-[11px] text-slate-500">{rows.length}</span>
                  </div>
                  <div className="divide-y divide-slate-700/30">
                    {visibleRows.map((r) => {
                      const agent = resolveReportAgent(agents, r);
                      const agentName = uiLanguage === "ko" ? r.agent_name_ko || r.agent_name : r.agent_name;
                      const deptName = uiLanguage === "ko" ? r.dept_name_ko || r.dept_name : r.dept_name;
                      return (
                        <button
                          key={r.id}
                          onClick={() => handleOpenDetail(r.id)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-800/50"
                        >
                          <AgentAvatar agent={agent} agents={agents} size={34} rounded="xl" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{r.title}</p>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                              <span className="rounded bg-slate-700/80 px-1.5 py-0.5">{deptName}</span>
                              <span>{agentName}</span>
                              <span className="text-slate-600">&middot;</span>
                              <span>{fmtDate(r.completed_at)}</span>
                            </div>
                          </div>
                          <span className="flex-shrink-0 text-xs text-emerald-400">&#x2713;</span>
                        </button>
                      );
                    })}
                  </div>
                  {groupTotal > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-700/40 bg-slate-900/40 px-3 py-2">
                      <span className="text-[11px] text-slate-500">
                        {gStart + 1}-{gEnd} / {rows.length}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleGroupPageChange(projectName, groupCurrent - 1, groupTotal)}
                          disabled={groupCurrent <= 0}
                          className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t({ ko: "이전", en: "Prev", ja: "前へ", zh: "上一页" })}
                        </button>
                        <span className="text-[11px] text-slate-400">
                          {groupCurrent + 1} / {groupTotal}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleGroupPageChange(projectName, groupCurrent + 1, groupTotal)}
                          disabled={groupCurrent >= groupTotal - 1}
                          className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t({ ko: "다음", en: "Next", ja: "次へ", zh: "下一页" })}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-700/50 px-6 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {t({
              ko: `총 ${reports.length}건`,
              en: `${reports.length} reports`,
              ja: `全${reports.length}件`,
              zh: `共${reports.length}条`,
            })}
          </span>
          <div className="flex items-center gap-3">
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 0}
                  className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t({ ko: "이전", en: "Prev", ja: "前へ", zh: "上一页" })}
                </button>
                <span className="text-[11px] text-slate-400">
                  {currentPage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= totalPages - 1}
                  className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t({ ko: "다음", en: "Next", ja: "次へ", zh: "下一页" })}
                </button>
              </div>
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
    </Dialog>
  );
}
