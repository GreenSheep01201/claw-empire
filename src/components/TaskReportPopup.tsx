import { useMemo, useState, useEffect } from "react";
import type { Agent, Department } from "../types";
import type { TaskReportDetail, TaskReportDocument, TaskReportTeamSection } from "../api";
import { archiveTaskReport, getTaskReportDetail } from "../api";
import { pickLang, type LangText, type UiLanguage } from "../i18n";
import AgentAvatar from "./AgentAvatar";
import Dialog from "./ui/Dialog";
import { resolveReportAgent } from "./task-report-agent";

interface TaskReportPopupProps {
  report: TaskReportDetail;
  agents: Agent[];
  departments: Department[];
  uiLanguage: UiLanguage;
  onClose: () => void;
}

const DOCUMENTS_PER_PAGE = 3;

function fmtTime(ts: number | null | undefined): string {
  if (!ts) return "-";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function elapsed(start: number | null | undefined, end: number | null | undefined): string {
  if (!start || !end) return "-";
  const ms = end - start;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function projectNameFromPath(projectPath: string | null | undefined): string {
  if (!projectPath) return "General";
  const trimmed = projectPath.replace(/[\\/]+$/, "");
  const seg = trimmed.split(/[\\/]/).pop();
  return seg || "General";
}

function statusClass(status: string): string {
  if (status === "done") return "bg-emerald-500/15 text-emerald-300";
  if (status === "review") return "bg-blue-500/15 text-blue-300";
  if (status === "in_progress") return "bg-amber-500/15 text-amber-300";
  return "bg-slate-700/70 text-slate-300";
}

export default function TaskReportPopup({ report, agents, departments, uiLanguage, onClose }: TaskReportPopupProps) {
  const t = (text: LangText) => pickLang(uiLanguage, text);

  const [currentReport, setCurrentReport] = useState<TaskReportDetail>(report);
  const [refreshingArchive, setRefreshingArchive] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("planning");
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({});
  const [documentPages, setDocumentPages] = useState<Record<string, number>>({});

  useEffect(() => {
    setCurrentReport(report);
  }, [report]);

  const rootTaskId = currentReport.project?.root_task_id || currentReport.task.id;
  const teamReports = useMemo(() => currentReport.team_reports ?? [], [currentReport.team_reports]);
  const projectName = currentReport.project?.project_name || projectNameFromPath(currentReport.task.project_path);
  const projectPath = currentReport.project?.project_path || currentReport.task.project_path;
  const planningSummary = currentReport.planning_summary;
  const branchVerificationLogs = useMemo(
    () =>
      (currentReport.logs ?? []).filter(
        (log) => log.kind === "system" && /^Final branch verification:/i.test(log.message.trim()),
      ),
    [currentReport.logs],
  );

  const refreshArchive = async () => {
    if (!rootTaskId || refreshingArchive) return;
    setRefreshingArchive(true);
    try {
      await archiveTaskReport(rootTaskId);
      const refreshed = await getTaskReportDetail(rootTaskId);
      setCurrentReport(refreshed);
    } catch (err) {
      console.error("Failed to refresh planning archive:", err);
    } finally {
      setRefreshingArchive(false);
    }
  };

  useEffect(() => {
    setActiveTab("planning");
    setExpandedDocs({});
    setDocumentPages({});
  }, [currentReport.task.id, currentReport.requested_task_id, teamReports.length]);

  const taskAgent = resolveReportAgent(agents, currentReport.task);
  const departmentById = useMemo(() => {
    const map = new Map<string, Department>();
    for (const department of departments) {
      map.set(department.id, department);
    }
    return map;
  }, [departments]);
  const taskDeptFromMap = currentReport.task.department_id
    ? departmentById.get(currentReport.task.department_id)
    : undefined;
  const taskAgentName =
    uiLanguage === "ko"
      ? currentReport.task.agent_name_ko || currentReport.task.agent_name
      : currentReport.task.agent_name;
  const taskDeptName =
    uiLanguage === "ko"
      ? taskDeptFromMap?.name_ko || currentReport.task.dept_name_ko || currentReport.task.dept_name
      : taskDeptFromMap?.name || currentReport.task.dept_name || currentReport.task.dept_name_ko;

  const selectedTeam = useMemo(() => {
    if (activeTab === "planning") return null;
    return teamReports.find((team) => team.id === activeTab || team.task_id === activeTab) ?? null;
  }, [activeTab, teamReports]);

  const planningDocs = planningSummary?.documents ?? [];

  const toggleDoc = (docId: string) => {
    setExpandedDocs((prev) => {
      const current = prev[docId] !== false;
      return { ...prev, [docId]: !current };
    });
  };

  const renderDocuments = (documents: TaskReportDocument[], scopeKey: string) => {
    if (!documents.length) {
      return (
        <p className="text-xs text-slate-500">
          {t({ ko: "문서가 없습니다", en: "No documents", ja: "ドキュメントなし", zh: "暂无文档" })}
        </p>
      );
    }

    const totalPages = Math.max(1, Math.ceil(documents.length / DOCUMENTS_PER_PAGE));
    const rawPage = documentPages[scopeKey] ?? 1;
    const currentPage = Math.min(Math.max(rawPage, 1), totalPages);
    const start = (currentPage - 1) * DOCUMENTS_PER_PAGE;
    const visibleDocs = documents.slice(start, start + DOCUMENTS_PER_PAGE);

    return (
      <div className="space-y-2">
        {visibleDocs.map((doc) => {
          const isExpanded = expandedDocs[doc.id] !== false;
          return (
            <div key={doc.id} className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-100">{doc.title}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {doc.source}
                    {doc.path ? ` · ${doc.path}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => toggleDoc(doc.id)}
                  className="rounded-md border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
                >
                  {isExpanded
                    ? t({ ko: "접기", en: "Collapse", ja: "折りたたむ", zh: "收起" })
                    : t({ ko: "확장", en: "Expand", ja: "展開", zh: "展开" })}
                </button>
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-[11px] leading-relaxed text-slate-300">
                {isExpanded ? doc.content : doc.text_preview}
              </pre>
            </div>
          );
        })}
        {totalPages > 1 && (
          <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2">
            <button
              type="button"
              onClick={() => setDocumentPages((prev) => ({ ...prev, [scopeKey]: Math.max(1, currentPage - 1) }))}
              disabled={currentPage <= 1}
              className={`rounded-md px-2 py-1 text-[11px] ${
                currentPage <= 1
                  ? "cursor-not-allowed bg-slate-800 text-slate-600"
                  : "bg-slate-700 text-slate-200 hover:bg-slate-600"
              }`}
            >
              {t({ ko: "이전", en: "Prev", ja: "前へ", zh: "上一页" })}
            </button>
            <span className="text-[11px] text-slate-400">
              {t({
                ko: `페이지 ${currentPage}/${totalPages}`,
                en: `Page ${currentPage}/${totalPages}`,
                ja: `ページ ${currentPage}/${totalPages}`,
                zh: `第 ${currentPage}/${totalPages} 页`,
              })}
            </span>
            <button
              type="button"
              onClick={() =>
                setDocumentPages((prev) => ({ ...prev, [scopeKey]: Math.min(totalPages, currentPage + 1) }))
              }
              disabled={currentPage >= totalPages}
              className={`rounded-md px-2 py-1 text-[11px] ${
                currentPage >= totalPages
                  ? "cursor-not-allowed bg-slate-800 text-slate-600"
                  : "bg-slate-700 text-slate-200 hover:bg-slate-600"
              }`}
            >
              {t({ ko: "다음", en: "Next", ja: "次へ", zh: "下一页" })}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderPlanningSummary = () => (
    <div className="space-y-3">
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-emerald-300">
            {t({
              ko: "기획팀장 최종 취합본",
              en: "Planning Lead Consolidated Summary",
              ja: "企画リード統合サマリー",
              zh: "规划负责人汇总摘要",
            })}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshArchive}
              disabled={refreshingArchive}
              className={`rounded-md border px-2 py-1 text-[11px] ${
                refreshingArchive
                  ? "cursor-not-allowed border-emerald-500/20 bg-emerald-500/10 text-emerald-300/70"
                  : "border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
              }`}
            >
              {refreshingArchive
                ? t({ ko: "갱신 중...", en: "Refreshing...", ja: "更新中...", zh: "刷新中..." })
                : t({ ko: "취합 갱신", en: "Refresh Consolidation", ja: "統合更新", zh: "刷新汇总" })}
            </button>
            <span className="text-[11px] text-emerald-400">{fmtTime(planningSummary?.generated_at)}</span>
          </div>
        </div>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-emerald-100">
          {planningSummary?.content ||
            t({ ko: "요약 내용이 없습니다", en: "No summary text", ja: "サマリーなし", zh: "暂无摘要内容" })}
        </pre>
      </div>
      {branchVerificationLogs.length > 0 && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
          <p className="mb-2 text-xs font-semibold text-blue-200">
            {t({
              ko: "최종 브랜치 검증",
              en: "Final Branch Verification",
              ja: "最終ブランチ検証",
              zh: "最终分支校验",
            })}
          </p>
          <div className="space-y-1.5">
            {branchVerificationLogs.map((log, index) => (
              <div
                key={`${log.created_at}-${index}`}
                className="rounded bg-slate-950/40 px-2 py-1.5 text-[11px] text-slate-200"
              >
                <span className="mr-2 text-slate-500">{fmtTime(log.created_at)}</span>
                {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          {t({ ko: "문서 원문", en: "Source Documents", ja: "原本文書", zh: "原始文档" })}
        </p>
        {renderDocuments(planningDocs, "planning")}
      </div>
    </div>
  );

  const renderTeamReport = (team: TaskReportTeamSection) => {
    const teamDeptFromMap = team.department_id ? departmentById.get(team.department_id) : undefined;
    const teamName =
      uiLanguage === "ko"
        ? teamDeptFromMap?.name_ko || team.department_name_ko || team.department_name
        : teamDeptFromMap?.name || team.department_name || team.department_name_ko;
    const teamAgent = uiLanguage === "ko" ? team.agent_name_ko || team.agent_name : team.agent_name;
    const logs = team.logs ?? [];
    const keyLogs = logs.filter((lg) => lg.kind === "system" || lg.message.includes("Status")).slice(-20);

    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">{team.title}</p>
            <span className={`rounded px-2 py-0.5 text-[11px] ${statusClass(team.status)}`}>{team.status}</span>
          </div>
          <p className="text-xs text-slate-400">
            {teamName} · {teamAgent || "-"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t({ ko: "완료", en: "Completed", ja: "完了", zh: "完成" })}: {fmtTime(team.completed_at)}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{team.summary || "-"}</p>
        </div>

        {team.linked_subtasks.length > 0 && (
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
              {t({ ko: "연결된 서브태스크", en: "Linked Subtasks", ja: "関連サブタスク", zh: "关联子任务" })}
            </p>
            <div className="space-y-1.5">
              {team.linked_subtasks.map((st) => (
                <div
                  key={st.id}
                  className="flex items-center justify-between gap-2 rounded bg-slate-800/70 px-2 py-1.5 text-[11px]"
                >
                  <span className="min-w-0 flex-1 truncate text-slate-300">{st.title}</span>
                  <span className={`rounded px-1.5 py-0.5 ${statusClass(st.status)}`}>{st.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            {t({ ko: "팀 문서", en: "Team Documents", ja: "チーム文書", zh: "团队文档" })}
          </p>
          {renderDocuments(team.documents ?? [], `team:${team.id}`)}
        </div>

        {keyLogs.length > 0 && (
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
              {t({ ko: "진행 로그", en: "Progress Logs", ja: "進行ログ", zh: "进度日志" })}
            </p>
            <div className="space-y-1">
              {keyLogs.map((lg, idx) => (
                <div key={`${lg.created_at}-${idx}`} className="text-[11px] text-slate-400">
                  <span className="mr-2 text-slate-500">{fmtTime(lg.created_at)}</span>
                  {lg.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
      title={t({
        ko: "작업 완료 보고서",
        en: "Task Completion Report",
        ja: "タスク完了レポート",
        zh: "任务完成报告",
        fr: "Rapport de fin de tâche",
      })}
      titleAdornment={
        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">{projectName}</span>
      }
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-slate-500">
            {t({
              ko: `팀 보고서 ${teamReports.length}개`,
              en: `${teamReports.length} team reports`,
              ja: `チームレポート ${teamReports.length}件`,
              zh: `${teamReports.length} 个团队报告`,
            })}
          </span>
          <button
            onClick={onClose}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            {t({ ko: "확인", en: "OK", ja: "OK", zh: "确认" })}
          </button>
        </div>
      }
    >
      <p className="truncate px-6 pb-2 text-xs text-slate-400">{projectPath || "-"}</p>

      <div className="border-b border-slate-700/40 px-6 py-3">
        <div className="flex items-start gap-3">
          <AgentAvatar agent={taskAgent} agents={agents} size={40} rounded="xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{currentReport.task.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="rounded bg-slate-700/70 px-1.5 py-0.5">{taskDeptName}</span>
              <span>
                {taskAgentName} ({currentReport.task.agent_role})
              </span>
              <span>
                {t({ ko: "완료", en: "Completed", ja: "完了", zh: "完成" })}: {fmtTime(currentReport.task.completed_at)}
              </span>
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400">
                {elapsed(currentReport.task.created_at, currentReport.task.completed_at)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-700/40 px-6 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab("planning")}
            className={`rounded-lg px-3 py-1.5 text-xs ${
              activeTab === "planning" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {t({ ko: "기획팀장 취합본", en: "Planning Summary", ja: "企画サマリー", zh: "规划汇总" })}
          </button>
          {teamReports.map((team) => {
            const label =
              uiLanguage === "ko"
                ? team.department_name_ko || team.department_name || team.department_id || "팀"
                : team.department_name || team.department_id || "Team";
            return (
              <button
                key={team.id}
                onClick={() => setActiveTab(team.id)}
                className={`rounded-lg px-3 py-1.5 text-xs ${
                  activeTab === team.id ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-6 py-4">
        {activeTab === "planning" ? (
          renderPlanningSummary()
        ) : selectedTeam ? (
          renderTeamReport(selectedTeam)
        ) : (
          <p className="text-sm text-slate-500">
            {t({
              ko: "표시할 보고서가 없습니다",
              en: "No report to display",
              ja: "表示するレポートがありません",
              zh: "没有可显示的报告",
            })}
          </p>
        )}
      </div>
    </Dialog>
  );
}
