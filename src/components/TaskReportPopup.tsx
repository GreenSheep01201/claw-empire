import { useMemo, useState, useEffect } from "react";
import type { Agent, Department } from "../types";
import type { TaskReportDetail, TaskReportDocument, TaskReportTeamSection } from "../api";
import { archiveTaskReport, getTaskReportDetail } from "../api";
import { pickLang, type LangText, type UiLanguage } from "../i18n";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, RefreshCw } from "lucide-react";
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
  if (status === "done") return "qg-badge qg-badge--accent";
  return "qg-badge";
}

const STATUS_LABELS: Record<string, LangText> = {
  done: { ko: "완료", en: "Done", ja: "完了", zh: "完成", fr: "Terminée" },
  review: { ko: "검토", en: "Review", ja: "レビュー", zh: "审核", fr: "En relecture" },
  in_progress: { ko: "진행 중", en: "In progress", ja: "進行中", zh: "进行中", fr: "En cours" },
  pending: { ko: "대기", en: "Pending", ja: "保留", zh: "待处理", fr: "En attente" },
  inbox: { ko: "수신함", en: "Inbox", ja: "受信箱", zh: "收件箱", fr: "À trier" },
  planned: { ko: "계획됨", en: "Planned", ja: "計画済み", zh: "已计划", fr: "Planifiée" },
  cancelled: { ko: "취소됨", en: "Cancelled", ja: "キャンセル", zh: "已取消", fr: "Annulée" },
};

export default function TaskReportPopup({ report, agents, departments, uiLanguage, onClose }: TaskReportPopupProps) {
  const t = (text: LangText) => pickLang(uiLanguage, text);
  const statusLabel = (status: string) => (STATUS_LABELS[status] ? t(STATUS_LABELS[status]) : status);
  const prevLabel = t({ ko: "이전", en: "Prev", ja: "前へ", zh: "上一页", fr: "Précédent" });
  const nextLabel = t({ ko: "다음", en: "Next", ja: "次へ", zh: "下一页", fr: "Suivant" });
  const completedLabel = t({ ko: "완료", en: "Completed", ja: "完了", zh: "完成", fr: "Terminée le" });

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
        <p className="qg-text-muted text-[13px]">
          {t({
            ko: "문서가 없습니다",
            en: "No documents",
            ja: "ドキュメントなし",
            zh: "暂无文档",
            fr: "Aucun document",
          })}
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
            <div key={doc.id} className="qg-card">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{doc.title}</p>
                  <p className="qg-text-muted truncate text-xs">
                    {doc.source}
                    {doc.path ? ` · ${doc.path}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleDoc(doc.id)}
                  aria-expanded={isExpanded}
                  className="qg-btn qg-btn--sm qg-btn--ghost"
                >
                  {isExpanded ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
                  {isExpanded
                    ? t({ ko: "접기", en: "Collapse", ja: "折りたたむ", zh: "收起", fr: "Réduire" })
                    : t({ ko: "확장", en: "Expand", ja: "展開", zh: "展开", fr: "Développer" })}
                </button>
              </div>
              <pre className="qg-text-secondary max-h-72 overflow-auto whitespace-pre-wrap text-[13px] leading-relaxed">
                {isExpanded ? doc.content : doc.text_preview}
              </pre>
            </div>
          );
        })}
        {totalPages > 1 && (
          <div className="mt-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setDocumentPages((prev) => ({ ...prev, [scopeKey]: Math.max(1, currentPage - 1) }))}
              disabled={currentPage <= 1}
              className="qg-btn qg-btn--sm"
            >
              <ChevronLeft size={16} aria-hidden />
              {prevLabel}
            </button>
            <span className="qg-text-secondary text-[13px]">
              {t({
                ko: `페이지 ${currentPage}/${totalPages}`,
                en: `Page ${currentPage}/${totalPages}`,
                ja: `ページ ${currentPage}/${totalPages}`,
                zh: `第 ${currentPage}/${totalPages} 页`,
                fr: `Page ${currentPage}/${totalPages}`,
              })}
            </span>
            <button
              type="button"
              onClick={() =>
                setDocumentPages((prev) => ({ ...prev, [scopeKey]: Math.min(totalPages, currentPage + 1) }))
              }
              disabled={currentPage >= totalPages}
              className="qg-btn qg-btn--sm"
            >
              {nextLabel}
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        )}
      </div>
    );
  };

  const sectionLabel = "qg-field__label mb-2 block";

  const renderPlanningSummary = () => (
    <div className="space-y-3">
      <div className="qg-card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            {t({
              ko: "기획팀장 최종 취합본",
              en: "Planning Lead Consolidated Summary",
              ja: "企画リード統合サマリー",
              zh: "规划负责人汇总摘要",
              fr: "Synthèse du responsable Planification",
            })}
          </p>
          <div className="flex items-center gap-2">
            <span className="qg-text-muted text-xs">{fmtTime(planningSummary?.generated_at)}</span>
            <button type="button" onClick={refreshArchive} disabled={refreshingArchive} className="qg-btn qg-btn--sm">
              <RefreshCw size={16} aria-hidden />
              {refreshingArchive
                ? t({ ko: "갱신 중...", en: "Refreshing...", ja: "更新中...", zh: "刷新中...", fr: "Actualisation…" })
                : t({
                    ko: "취합 갱신",
                    en: "Refresh Consolidation",
                    ja: "統合更新",
                    zh: "刷新汇总",
                    fr: "Actualiser la synthèse",
                  })}
            </button>
          </div>
        </div>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-sm leading-relaxed">
          {planningSummary?.content ||
            t({
              ko: "요약 내용이 없습니다",
              en: "No summary text",
              ja: "サマリーなし",
              zh: "暂无摘要内容",
              fr: "Aucune synthèse",
            })}
        </pre>
      </div>
      {branchVerificationLogs.length > 0 && (
        <div className="qg-card">
          <p className={sectionLabel}>
            {t({
              ko: "최종 브랜치 검증",
              en: "Final Branch Verification",
              ja: "最終ブランチ検証",
              zh: "最终分支校验",
              fr: "Vérification finale de la branche",
            })}
          </p>
          <div className="space-y-1.5">
            {branchVerificationLogs.map((log, index) => (
              <div key={`${log.created_at}-${index}`} className="qg-text-secondary text-[13px]">
                <span className="qg-text-muted mr-2">{fmtTime(log.created_at)}</span>
                {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className={sectionLabel}>
          {t({ ko: "문서 원문", en: "Source Documents", ja: "原本文書", zh: "原始文档", fr: "Documents sources" })}
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
        <div className="qg-card">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{team.title}</p>
            <span className={statusClass(team.status)}>{statusLabel(team.status)}</span>
          </div>
          <p className="qg-text-secondary text-[13px]">
            {teamName} · {teamAgent || "-"}
          </p>
          <p className="qg-text-muted mt-1 text-xs">
            {completedLabel} : {fmtTime(team.completed_at)}
          </p>
          <p className="qg-text-secondary mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">
            {team.summary || "-"}
          </p>
        </div>

        {team.linked_subtasks.length > 0 && (
          <div className="qg-card">
            <p className={sectionLabel}>
              {t({
                ko: "연결된 서브태스크",
                en: "Linked Subtasks",
                ja: "関連サブタスク",
                zh: "关联子任务",
                fr: "Sous-tâches liées",
              })}
            </p>
            <div className="space-y-1.5">
              {team.linked_subtasks.map((st) => (
                <div key={st.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="qg-text-secondary min-w-0 flex-1 truncate">{st.title}</span>
                  <span className={statusClass(st.status)}>{statusLabel(st.status)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className={sectionLabel}>
            {t({ ko: "팀 문서", en: "Team Documents", ja: "チーム文書", zh: "团队文档", fr: "Documents du pôle" })}
          </p>
          {renderDocuments(team.documents ?? [], `team:${team.id}`)}
        </div>

        {keyLogs.length > 0 && (
          <div className="qg-card">
            <p className={sectionLabel}>
              {t({ ko: "진행 로그", en: "Progress Logs", ja: "進行ログ", zh: "进度日志", fr: "Journal d’avancement" })}
            </p>
            <div className="space-y-1">
              {keyLogs.map((lg, idx) => (
                <div key={`${lg.created_at}-${idx}`} className="qg-text-secondary text-[13px]">
                  <span className="qg-text-muted mr-2">{fmtTime(lg.created_at)}</span>
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
      titleAdornment={<span className="qg-badge qg-badge--accent">{projectName}</span>}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="qg-text-muted text-[13px]">
            {t({
              ko: `팀 보고서 ${teamReports.length}개`,
              en: `${teamReports.length} team reports`,
              ja: `チームレポート ${teamReports.length}件`,
              zh: `${teamReports.length} 个团队报告`,
              fr: `${teamReports.length} rapport(s) de pôle`,
            })}
          </span>
          <button type="button" onClick={onClose} className="qg-btn qg-btn--primary">
            {t({ ko: "확인", en: "OK", ja: "OK", zh: "确认", fr: "OK" })}
          </button>
        </div>
      }
    >
      <p className="qg-text-muted truncate pb-3 text-[13px]">{projectPath || "-"}</p>

      <div className="border-b border-[var(--th-border)] pb-3">
        <div className="flex items-start gap-3">
          <AgentAvatar agent={taskAgent} agents={agents} size={40} rounded="xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{currentReport.task.title}</p>
            <div className="qg-text-secondary mt-1 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="qg-badge">{taskDeptName}</span>
              <span>
                {taskAgentName} ({currentReport.task.agent_role})
              </span>
              <span>
                {completedLabel} : {fmtTime(currentReport.task.completed_at)}
              </span>
              <span className="qg-badge">
                <Clock size={16} aria-hidden />
                {elapsed(currentReport.task.created_at, currentReport.task.completed_at)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-[var(--th-border)] py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("planning")}
            aria-pressed={activeTab === "planning"}
            className={`qg-btn qg-btn--sm${activeTab === "planning" ? " qg-btn--primary" : ""}`}
          >
            {t({
              ko: "기획팀장 취합본",
              en: "Planning Summary",
              ja: "企画サマリー",
              zh: "规划汇总",
              fr: "Synthèse Planification",
            })}
          </button>
          {teamReports.map((team) => {
            const label =
              uiLanguage === "ko"
                ? team.department_name_ko || team.department_name || team.department_id || "팀"
                : team.department_name ||
                  team.department_id ||
                  t({ ko: "팀", en: "Team", ja: "チーム", zh: "团队", fr: "Pôle" });
            return (
              <button
                type="button"
                key={team.id}
                onClick={() => setActiveTab(team.id)}
                aria-pressed={activeTab === team.id}
                className={`qg-btn qg-btn--sm${activeTab === team.id ? " qg-btn--primary" : ""}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-4">
        {activeTab === "planning" ? (
          renderPlanningSummary()
        ) : selectedTeam ? (
          renderTeamReport(selectedTeam)
        ) : (
          <p className="qg-empty">
            {t({
              ko: "표시할 보고서가 없습니다",
              en: "No report to display",
              ja: "表示するレポートがありません",
              zh: "没有可显示的报告",
              fr: "Aucun rapport à afficher",
            })}
          </p>
        )}
      </div>
    </Dialog>
  );
}
