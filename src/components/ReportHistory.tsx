import { Check, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import Dialog from "./ui/Dialog";
import type { LangText, UiLanguage } from "../i18n";
import { useEffect, useMemo, useState } from "react";
import type { Agent, Department } from "../types";
import type { TaskReportSummary, TaskReportDetail } from "../api";
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

  const prevLabel = t({ ko: "이전", en: "Prev", ja: "前へ", zh: "上一页", fr: "Précédent" });
  const nextLabel = t({ ko: "다음", en: "Next", ja: "次へ", zh: "下一页", fr: "Suivant" });

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
      title={t({ ko: "작업 보고서 이력", en: "Report History", ja: "レポート履歴", zh: "报告历史", fr: "Rapports" })}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="qg-text-muted text-[13px]">
            {t({
              ko: `총 ${reports.length}건`,
              en: `${reports.length} reports`,
              ja: `全${reports.length}件`,
              zh: `共${reports.length}条`,
              fr: `${reports.length} rapport(s)`,
            })}
          </span>
          <div className="flex items-center gap-3">
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 0}
                  className="qg-btn qg-btn--sm"
                >
                  <ChevronLeft size={16} aria-hidden />
                  {prevLabel}
                </button>
                <span className="qg-text-secondary text-[13px]">
                  {currentPage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= totalPages - 1}
                  className="qg-btn qg-btn--sm"
                >
                  {nextLabel}
                  <ChevronRight size={16} aria-hidden />
                </button>
              </div>
            )}
            <button type="button" onClick={onClose} className="qg-btn">
              {t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
            </button>
          </div>
        </div>
      }
    >
      <div>
        {loading ? (
          <div className="qg-empty">
            {t({ ko: "불러오는 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中...", fr: "Chargement…" })}
          </div>
        ) : reports.length === 0 ? (
          <div className="qg-empty flex flex-col items-center gap-2">
            <Inbox size={16} aria-hidden />
            <p>
              {t({
                ko: "완료된 보고서가 없습니다",
                en: "No completed reports",
                ja: "完了レポートなし",
                zh: "没有已完成的报告",
                fr: "Aucun rapport terminé",
              })}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedPageReports.map(([projectName, rows]) => {
              const groupTotal = Math.max(1, Math.ceil(rows.length / GROUP_ITEMS_PER_PAGE));
              const groupCurrent = Math.min(Math.max(groupPages[projectName] ?? 0, 0), groupTotal - 1);
              const gStart = groupCurrent * GROUP_ITEMS_PER_PAGE;
              const gEnd = Math.min(gStart + GROUP_ITEMS_PER_PAGE, rows.length);
              const visibleRows = rows.slice(gStart, gEnd);

              return (
                <div key={projectName} className="qg-card overflow-hidden !p-0">
                  <div className="flex items-center justify-between border-b border-[var(--th-border)] px-4 py-2">
                    <p className="truncate text-[13px] font-semibold">{projectName}</p>
                    <span className="qg-badge">{rows.length}</span>
                  </div>
                  <div className="divide-y divide-[var(--th-border)]">
                    {visibleRows.map((r) => {
                      const agent = resolveReportAgent(agents, r);
                      const agentName = uiLanguage === "ko" ? r.agent_name_ko || r.agent_name : r.agent_name;
                      const deptName = uiLanguage === "ko" ? r.dept_name_ko || r.dept_name : r.dept_name;
                      return (
                        <button
                          type="button"
                          key={r.id}
                          onClick={() => handleOpenDetail(r.id)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--th-bg-surface-hover)]"
                        >
                          <AgentAvatar agent={agent} agents={agents} size={34} rounded="xl" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{r.title}</p>
                            <div className="qg-text-muted mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <span className="qg-badge">{deptName}</span>
                              <span>{agentName}</span>
                              <span aria-hidden>&middot;</span>
                              <span>{fmtDate(r.completed_at)}</span>
                            </div>
                          </div>
                          <Check size={16} aria-hidden className="qg-text-muted flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                  {groupTotal > 1 && (
                    <div className="flex items-center justify-between border-t border-[var(--th-border)] px-3 py-2">
                      <span className="qg-text-muted text-xs">
                        {gStart + 1}-{gEnd} / {rows.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleGroupPageChange(projectName, groupCurrent - 1, groupTotal)}
                          disabled={groupCurrent <= 0}
                          className="qg-btn qg-btn--sm qg-btn--ghost"
                        >
                          {prevLabel}
                        </button>
                        <span className="qg-text-secondary text-xs">
                          {groupCurrent + 1} / {groupTotal}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleGroupPageChange(projectName, groupCurrent + 1, groupTotal)}
                          disabled={groupCurrent >= groupTotal - 1}
                          className="qg-btn qg-btn--sm qg-btn--ghost"
                        >
                          {nextLabel}
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
    </Dialog>
  );
}
