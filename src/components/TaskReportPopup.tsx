import { useMemo, useState, useEffect } from "react";
import type { Agent, Department } from "../types";
import type { TaskReportDetail, TaskReportDocument, TaskReportTeamSection } from "../api";
import { archiveTaskReport, getTaskReportDetail } from "../api";
import type { UiLanguage } from "../i18n";
import { pickLang } from "../i18n";
import AgentAvatar from "./AgentAvatar";

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
  const t = (text: { ko: string; en: string; ja?: string; zh?: string }) => pickLang(uiLanguage, text);

  const [currentReport, setCurrentReport] = useState<TaskReportDetail>(report);
  const [refreshingArchive, setRefreshingArchive] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("staff");
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
    setActiveTab("staff");
    setExpandedDocs({});
    setDocumentPages({});
  }, [currentReport.task.id, currentReport.requested_task_id, teamReports.length]);

  const taskAgent = agents.find((a) => a.id === currentReport.task.assigned_agent_id);
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
    if (activeTab === "planning" || activeTab === "staff" || activeTab === "timeline") return null;
    return teamReports.find((team) => team.id === activeTab || team.task_id === activeTab) ?? null;
  }, [activeTab, teamReports]);

  const planningDocs = planningSummary?.documents ?? [];

  // ── Staff contribution data ────────────────────────────────────────────────
  const allSubtasks = currentReport.subtasks ?? [];
  const staffContributions = useMemo(() => {
    // Gather agent entries from team reports + subtasks
    type StaffEntry = {
      agent_id: string | null;
      agent_name: string;
      agent_role: string | null;
      dept_name: string;
      dept_id: string | null;
      subtasks: typeof allSubtasks;
      completed_at: number | null;
    };
    const map = new Map<string, StaffEntry>();

    // From team reports
    for (const team of teamReports) {
      const key = team.agent_id || team.agent_name;
      if (!map.has(key)) {
        map.set(key, {
          agent_id: team.agent_id,
          agent_name: team.agent_name,
          agent_role: team.agent_role,
          dept_name: team.department_name,
          dept_id: team.department_id,
          subtasks: [],
          completed_at: team.completed_at,
        });
      }
      // Add linked subtasks to this agent
      const entry = map.get(key)!;
      for (const st of team.linked_subtasks) {
        if (!entry.subtasks.find((s) => s.id === st.id)) {
          entry.subtasks.push({
            id: st.id,
            title: st.title,
            status: st.status,
            assigned_agent_id: st.assigned_agent_id,
            target_department_id: st.target_department_id,
            delegated_task_id: st.delegated_task_id,
            completed_at: st.completed_at,
            agent_name: st.agent_name,
            agent_name_ko: st.agent_name_ko,
            target_dept_name: st.target_dept_name,
            target_dept_name_ko: st.target_dept_name_ko,
          });
        }
      }
    }

    // From root-level subtasks
    for (const st of allSubtasks) {
      const key = st.assigned_agent_id || st.agent_name || "unknown";
      if (!map.has(key)) {
        const dept = departments.find((d) => d.id === st.target_department_id);
        map.set(key, {
          agent_id: st.assigned_agent_id,
          agent_name: st.agent_name,
          agent_role: null,
          dept_name: dept?.name || st.target_dept_name || "",
          dept_id: st.target_department_id || null,
          subtasks: [],
          completed_at: null,
        });
      }
      const entry = map.get(key)!;
      if (!entry.subtasks.find((s) => s.id === st.id)) {
        entry.subtasks.push(st);
      }
    }

    return Array.from(map.values()).filter((e) => e.agent_name);
  }, [allSubtasks, teamReports, departments]);

  // ── Timeline events ────────────────────────────────────────────────────────
  const timelineEvents = useMemo(() => {
    type TimelineEvent = { ts: number; icon: string; label: string; sub?: string };
    const events: TimelineEvent[] = [];

    for (const st of allSubtasks) {
      if (st.completed_at) {
        events.push({ ts: st.completed_at, icon: "✅", label: st.title, sub: st.agent_name || undefined });
      }
    }
    for (const team of teamReports) {
      if (team.started_at) {
        events.push({ ts: team.started_at, icon: "🚀", label: `${team.department_name} 開始`, sub: team.agent_name });
      }
      if (team.completed_at) {
        events.push({ ts: team.completed_at, icon: "🏁", label: `${team.department_name} 完了`, sub: team.agent_name });
      }
      for (const lg of team.logs.filter((l) => l.kind === "system").slice(-10)) {
        events.push({ ts: lg.created_at, icon: "📝", label: lg.message, sub: team.agent_name });
      }
    }
    for (const lg of (currentReport.logs ?? []).filter((l) => l.kind === "system").slice(-20)) {
      events.push({ ts: lg.created_at, icon: "🔧", label: lg.message });
    }

    return events.sort((a, b) => a.ts - b.ts);
  }, [allSubtasks, teamReports, currentReport.logs]);

  // ── Digest strip counts ────────────────────────────────────────────────────
  const digestStats = useMemo(() => {
    const agentCount = staffContributions.length;
    const subDone = allSubtasks.filter((s) => s.status === "done").length;
    const subTotal = allSubtasks.length;
    const depts = new Set(teamReports.map((t) => t.department_id).filter(Boolean)).size;
    return { agentCount, subDone, subTotal, depts };
  }, [staffContributions, allSubtasks, teamReports]);

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

  // ── Staff Contributions Tab ────────────────────────────────────────────────
  const renderStaffContributions = () => {
    if (!staffContributions.length) {
      return (
        <p className="py-8 text-center text-sm text-slate-500">
          {t({ ko: "스태프 정보가 없습니다", en: "No staff data available", ja: "スタッフ情報がありません", zh: "无员工数据" })}
        </p>
      );
    }
    return (
      <div className="space-y-3">
        {staffContributions.map((staff, idx) => {
          const agentObj = agents.find((a) => a.id === staff.agent_id);
          const deptObj = departments.find((d) => d.id === staff.dept_id);
          const doneCount = staff.subtasks.filter((s) => s.status === "done").length;
          return (
            <div key={idx} className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-3">
              <div className="mb-2 flex items-center gap-3">
                <AgentAvatar agent={agentObj} agents={agents} size={36} rounded="xl" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{staff.agent_name || "-"}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                    {staff.agent_role && <span className="rounded bg-slate-700 px-1.5 py-0.5">{staff.agent_role}</span>}
                    {(deptObj || staff.dept_name) && (
                      <span
                        className="rounded px-1.5 py-0.5"
                        style={deptObj ? { backgroundColor: deptObj.color + "25", color: deptObj.color } : undefined}
                      >
                        {deptObj?.icon} {deptObj?.name || staff.dept_name}
                      </span>
                    )}
                    {staff.subtasks.length > 0 && (
                      <span className="text-emerald-400">✅ {doneCount}/{staff.subtasks.length} subtasks</span>
                    )}
                  </div>
                </div>
                {staff.completed_at && (
                  <span className="shrink-0 text-[11px] text-slate-500">{fmtTime(staff.completed_at)}</span>
                )}
              </div>
              {staff.subtasks.length > 0 && (
                <div className="space-y-1 pl-1">
                  {staff.subtasks.map((st) => (
                    <div key={st.id} className="flex items-center gap-1.5 text-[11px]">
                      <span>{st.status === "done" ? "✅" : st.status === "in_progress" ? "🔨" : st.status === "blocked" ? "🚫" : "⏳"}</span>
                      <span className={`flex-1 truncate ${st.status === "done" ? "text-slate-500 line-through" : "text-slate-300"}`}>
                        {st.title}
                      </span>
                      {st.completed_at && (
                        <span className="shrink-0 text-slate-600">{fmtTime(st.completed_at)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Timeline Tab ───────────────────────────────────────────────────────────
  const renderTimeline = () => {
    if (!timelineEvents.length) {
      return (
        <p className="py-8 text-center text-sm text-slate-500">
          {t({ ko: "타임라인 데이터가 없습니다", en: "No timeline data", ja: "タイムラインデータなし", zh: "无时间线数据" })}
        </p>
      );
    }
    return (
      <div className="relative space-y-0 pl-5">
        <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-700/60" />
        {timelineEvents.map((ev, idx) => (
          <div key={idx} className="relative flex items-start gap-3 pb-3">
            <span className="absolute -left-3 mt-0.5 text-sm">{ev.icon}</span>
            <div className="min-w-0 flex-1 pl-2">
              <p className="text-xs text-slate-300 leading-snug">{ev.label}</p>
              {ev.sub && <p className="text-[11px] text-slate-500">{ev.sub}</p>}
            </div>
            <span className="shrink-0 text-[11px] text-slate-600 whitespace-nowrap">{fmtTime(ev.ts)}</span>
          </div>
        ))}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 w-full max-w-4xl rounded-2xl border border-emerald-500/30 bg-slate-900 shadow-2xl shadow-emerald-500/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700/50 px-6 py-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xl">&#x1F4CB;</span>
              <h2 className="truncate text-lg font-bold text-white">
                {t({
                  ko: "작업 완료 보고서",
                  en: "Task Completion Report",
                  ja: "タスク完了レポート",
                  zh: "任务完成报告",
                })}
              </h2>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">{projectName}</span>
            </div>
            <p className="truncate text-xs text-slate-400">{projectPath || "-"}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            &#x2715;
          </button>
        </div>

        {/* Task header with agent info */}
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
                  {t({ ko: "완료", en: "Completed", ja: "完了", zh: "完成" })}:{" "}
                  {fmtTime(currentReport.task.completed_at)}
                </span>
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400">
                  {elapsed(currentReport.task.created_at, currentReport.task.completed_at)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Digest strip */}
        <div className="grid grid-cols-4 divide-x divide-slate-700/50 border-b border-slate-700/40 bg-slate-800/30">
          <div className="px-4 py-2 text-center">
            <p className="text-lg font-bold text-white">{digestStats.agentCount}</p>
            <p className="text-[10px] text-slate-500">{t({ ko: "참여 스태프", en: "Staff", ja: "参加スタッフ", zh: "参与员工" })}</p>
          </div>
          <div className="px-4 py-2 text-center">
            <p className="text-lg font-bold text-emerald-400">{digestStats.subDone}</p>
            <p className="text-[10px] text-slate-500">{t({ ko: "완료 서브태스크", en: "Done tasks", ja: "完了サブタスク", zh: "完成子任务" })}</p>
          </div>
          <div className="px-4 py-2 text-center">
            <p className="text-lg font-bold text-blue-400">{digestStats.depts}</p>
            <p className="text-[10px] text-slate-500">{t({ ko: "협업 부서", en: "Depts", ja: "協業部門", zh: "协作部门" })}</p>
          </div>
          <div className="px-4 py-2 text-center">
            <p className="text-lg font-bold text-amber-400">{elapsed(currentReport.task.created_at, currentReport.task.completed_at)}</p>
            <p className="text-[10px] text-slate-500">{t({ ko: "소요 시간", en: "Duration", ja: "所要時間", zh: "耗时" })}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-700/40 px-6 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab("staff")}
              className={`rounded-lg px-3 py-1.5 text-xs ${
                activeTab === "staff" ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              👥 {t({ ko: "스태프 기여", en: "Staff", ja: "スタッフ貢献", zh: "员工贡献" })}
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={`rounded-lg px-3 py-1.5 text-xs ${
                activeTab === "timeline" ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              🕐 {t({ ko: "타임라인", en: "Timeline", ja: "タイムライン", zh: "时间线" })}
            </button>
            <button
              onClick={() => setActiveTab("planning")}
              className={`rounded-lg px-3 py-1.5 text-xs ${
                activeTab === "planning" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {t({ ko: "기획 취합본", en: "Planning", ja: "企画サマリー", zh: "规划汇总" })}
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

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {activeTab === "staff" ? (
            renderStaffContributions()
          ) : activeTab === "timeline" ? (
            renderTimeline()
          ) : activeTab === "planning" ? (
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

        <div className="border-t border-slate-700/50 px-6 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {t({
                ko: `스태프 ${digestStats.agentCount}명 · 팀 보고서 ${teamReports.length}개`,
                en: `${digestStats.agentCount} staff · ${teamReports.length} team reports`,
                ja: `スタッフ ${digestStats.agentCount}名 · チームレポート ${teamReports.length}件`,
                zh: `${digestStats.agentCount} 名员工 · ${teamReports.length} 个团队报告`,
              })}
            </span>
            <button
              onClick={onClose}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500"
            >
              {t({ ko: "확인", en: "OK", ja: "OK", zh: "确认" })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
