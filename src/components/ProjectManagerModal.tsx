import { ArrowLeft } from "lucide-react";
import Dialog from "./ui/Dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Agent, AssignmentMode, Department, Project } from "../types";
import {
  deleteProject,
  getProjectDetail,
  getProjects,
  getTaskReportDetail,
  type ProjectDecisionEventItem,
  type ProjectDetailResponse,
  type ProjectReportHistoryItem,
  type ProjectTaskHistoryItem,
  type TaskReportDetail,
} from "../api";
import { useI18n } from "../i18n";
import { useSpriteMap } from "./AgentAvatar";
import GitHubImportPanel from "./GitHubImportPanel";
import TaskReportPopup from "./TaskReportPopup";
import ManualAssignmentWarningDialog from "./project-manager/ManualAssignmentWarningDialog";
import ManualPathPickerDialog from "./project-manager/ManualPathPickerDialog";
import MissingPathPromptDialog from "./project-manager/MissingPathPromptDialog";
import ProjectEditorPanel from "./project-manager/ProjectEditorPanel";
import ProjectInsightsPanel from "./project-manager/ProjectInsightsPanel";
import ProjectSidebar from "./project-manager/ProjectSidebar";
import type {
  GroupedProjectTaskCard,
  ManualAssignmentWarning,
  ProjectI18nTranslate,
  ProjectManagerModalProps,
  ProjectManualSelectionStats,
} from "./project-manager/types";
import { getDecisionEventLabel as mapDecisionEventLabel } from "./project-manager/utils";
import { useProjectManagerPathTools } from "./project-manager/useProjectManagerPathTools";
import { useProjectSaveHandler } from "./project-manager/useProjectSaveHandler";

const PAGE_SIZE = 5;

export default function ProjectManagerModal({ agents, departments = [], onClose }: ProjectManagerModalProps) {
  const { t, language } = useI18n();

  const [projects, setProjects] = useState<Project[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [githubImportMode, setGithubImportMode] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [coreGoal, setCoreGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [reportDetail, setReportDetail] = useState<TaskReportDetail | null>(null);

  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>("auto");
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [agentFilterDept, setAgentFilterDept] = useState<string>("all");
  const [manualAssignmentWarning, setManualAssignmentWarning] = useState<ManualAssignmentWarning | null>(null);

  const spriteMap = useSpriteMap(agents);

  const viewedProject = detail?.project ?? null;
  const selectedProject = isCreating ? null : viewedProject;
  const canSave = !!name.trim() && !!projectPath.trim() && !!coreGoal.trim();
  const pathToolsVisible = isCreating || !!editingProjectId;

  const pathTools = useProjectManagerPathTools({
    t: t as ProjectI18nTranslate,
    projectPath,
    pathToolsVisible,
  });

  const loadProjects = useCallback(
    async (targetPage: number, keyword: string) => {
      setLoadingList(true);
      try {
        const res = await getProjects({
          page: targetPage,
          page_size: PAGE_SIZE,
          search: keyword.trim() || undefined,
        });
        setProjects(res.projects);
        setPage(res.page);
        setTotalPages(Math.max(1, res.total_pages || 1));
        if (res.projects.length === 0) {
          setIsCreating(true);
        }
        if (!selectedProjectId && res.projects[0]) {
          setSelectedProjectId(res.projects[0].id);
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        setLoadingList(false);
      }
    },
    [selectedProjectId],
  );

  useEffect(() => {
    void loadProjects(1, search);
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    getProjectDetail(selectedProjectId)
      .then((res) => {
        setDetail(res);
        if (!editingProjectId && !isCreating) {
          setName(res.project.name);
          setProjectPath(res.project.project_path);
          setCoreGoal(res.project.core_goal);
          setAssignmentMode(res.project.assignment_mode || "auto");
          setSelectedAgentIds(new Set(res.project.assigned_agent_ids || []));
        }
      })
      .catch((err) => {
        console.error("Failed to load project detail:", err);
      })
      .finally(() => setLoadingDetail(false));
  }, [selectedProjectId, editingProjectId, isCreating]);

  const getManualAssignmentWarning = useCallback((): ManualAssignmentWarning["reason"] | null => {
    const selectedAgents = agents.filter((agent) => selectedAgentIds.has(agent.id));
    if (selectedAgents.length === 0) return "no_agents";
    const hasSubordinate = selectedAgents.some((agent) => agent.role !== "team_leader");
    return hasSubordinate ? null : "leaders_only";
  }, [agents, selectedAgentIds]);

  const manualSelectionStats = useMemo<ProjectManualSelectionStats>(() => {
    const selected = agents.filter((agent) => selectedAgentIds.has(agent.id));
    const leaders = selected.filter((agent) => agent.role === "team_leader").length;
    const subordinates = selected.length - leaders;
    return {
      total: selected.length,
      leaders,
      subordinates,
    };
  }, [agents, selectedAgentIds]);

  const groupedTaskCards = useMemo<GroupedProjectTaskCard[]>(() => {
    if (!detail) return [];
    const rows = [...detail.tasks].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    const byId = new Map<string, ProjectTaskHistoryItem>(rows.map((row) => [row.id, row]));
    const groups = new Map<string, GroupedProjectTaskCard>();

    for (const row of rows) {
      const parentId =
        typeof row.source_task_id === "string" && row.source_task_id.trim() ? row.source_task_id.trim() : null;
      const root = parentId ? (byId.get(parentId) ?? row) : row;
      const rootId = root.id;
      const existing = groups.get(rootId);
      const group = existing ?? {
        root,
        children: [],
        latestAt: root.created_at || 0,
      };

      if (row.id === rootId) {
        group.root = row;
      } else {
        group.children.push(row);
      }
      group.latestAt = Math.max(group.latestAt, row.created_at || 0);
      groups.set(rootId, group);
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        children: [...group.children].sort((a, b) => (b.created_at || 0) - (a.created_at || 0)),
      }))
      .sort((a, b) => b.latestAt - a.latestAt);
  }, [detail]);

  const sortedReports = useMemo<ProjectReportHistoryItem[]>(() => {
    if (!detail) return [];
    return [...detail.reports].sort(
      (a, b) => (b.completed_at || b.created_at || 0) - (a.completed_at || a.created_at || 0),
    );
  }, [detail]);

  const sortedDecisionEvents = useMemo<ProjectDecisionEventItem[]>(() => {
    if (!detail) return [];
    return [...detail.decision_events].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  }, [detail]);

  const getDecisionEventLabel = useCallback(
    (eventType: ProjectDecisionEventItem["event_type"]) => mapDecisionEventLabel(eventType, t as ProjectI18nTranslate),
    [t],
  );

  const startCreate = useCallback(() => {
    setIsCreating(true);
    setEditingProjectId(null);
    setName("");
    setProjectPath("");
    setCoreGoal("");
    setAssignmentMode("auto");
    setSelectedAgentIds(new Set());
    setManualAssignmentWarning(null);
    pathTools.resetPathHelperState();
  }, [pathTools]);

  const startEditSelected = useCallback(() => {
    if (!viewedProject) return;
    setIsCreating(false);
    setEditingProjectId(viewedProject.id);
    setName(viewedProject.name);
    setProjectPath(viewedProject.project_path);
    setCoreGoal(viewedProject.core_goal);
    setAssignmentMode(viewedProject.assignment_mode || "auto");
    setSelectedAgentIds(new Set(viewedProject.assigned_agent_ids || []));
    setManualAssignmentWarning(null);
    pathTools.resetPathHelperState();
  }, [pathTools, viewedProject]);

  const handleSave = useProjectSaveHandler({
    canSave,
    saving,
    setSaving,
    assignmentMode,
    getManualAssignmentWarning,
    setManualAssignmentWarning,
    projectPath,
    setProjectPath,
    pathTools,
    editingProjectId,
    name,
    coreGoal,
    selectedAgentIds,
    loadProjects,
    search,
    setSelectedProjectId,
    setEditingProjectId,
    setIsCreating,
    t: t as ProjectI18nTranslate,
  });

  const handleDelete = useCallback(async () => {
    if (!selectedProject) return;
    const confirmed = window.confirm(
      t({
        ko: `프로젝트 '${selectedProject.name}' 을(를) 삭제할까요?`,
        en: `Delete project '${selectedProject.name}'?`,
        ja: `プロジェクト '${selectedProject.name}' を削除しますか？`,
        zh: `要删除项目 '${selectedProject.name}' 吗？`,
        fr: `Supprimer le projet « ${selectedProject.name} » ?`,
      }),
    );
    if (!confirmed) return;

    try {
      await deleteProject(selectedProject.id);
      setSelectedProjectId(null);
      setDetail(null);
      await loadProjects(1, search);
      startCreate();
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  }, [loadProjects, search, selectedProject, startCreate, t]);

  const handleOpenTaskDetail = useCallback(async (taskId: string) => {
    try {
      const d = await getTaskReportDetail(taskId);
      setReportDetail(d);
    } catch (err) {
      console.error("Failed to open task detail:", err);
    }
  }, []);

  const headerTitle = t({
    ko: "프로젝트 관리",
    en: "Project Management",
    ja: "プロジェクト管理",
    zh: "项目管理",
    fr: "Projets",
  });
  const formTitle = editingProjectId
    ? t({ ko: "프로젝트 수정", en: "Edit Project", ja: "プロジェクト編集", zh: "编辑项目", fr: "Modifier le projet" })
    : isCreating
      ? t({
          ko: "신규 프로젝트 등록",
          en: "Register New Project",
          ja: "新規プロジェクト登録",
          zh: "新建项目",
          fr: "Nouveau projet",
        })
      : t({
          ko: "프로젝트 정보",
          en: "Project Info",
          ja: "プロジェクト情報",
          zh: "项目信息",
          fr: "Informations du projet",
        });

  if (reportDetail) {
    return (
      <TaskReportPopup
        report={reportDetail}
        agents={agents}
        departments={departments}
        uiLanguage={language}
        onClose={() => setReportDetail(null)}
      />
    );
  }

  return (
    <Dialog
      open
      size="full"
      onClose={onClose}
      title={headerTitle}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
    >
      <div className="flex h-full min-h-0 flex-col md:flex-row">
        <div
          className={`w-full md:w-[330px] ${selectedProjectId || isCreating || githubImportMode ? "hidden md:block" : "block"}`}
        >
          <ProjectSidebar
            t={t as ProjectI18nTranslate}
            search={search}
            setSearch={setSearch}
            loadProjects={loadProjects}
            startCreate={startCreate}
            onOpenGitHubImport={() => {
              setGithubImportMode(true);
              setIsCreating(false);
              setEditingProjectId(null);
            }}
            loadingList={loadingList}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={(projectId) => {
              setSelectedProjectId(projectId);
              setIsCreating(false);
              setEditingProjectId(null);
            }}
            page={page}
            totalPages={totalPages}
          />
        </div>

        <section
          className={`flex min-w-0 flex-1 flex-col overflow-hidden ${!selectedProjectId && !isCreating && !githubImportMode ? "hidden md:flex" : "flex"}`}
        >
          <div className="flex items-center gap-2 border-b border-[var(--th-border)] px-3 py-2 md:hidden">
            <button
              type="button"
              onClick={() => {
                setSelectedProjectId(null);
                setIsCreating(false);
                setEditingProjectId(null);
                setGithubImportMode(false);
              }}
              className="qg-btn qg-btn--sm qg-btn--ghost"
            >
              <ArrowLeft size={16} aria-hidden />
              {t({ ko: "목록", en: "List", ja: "一覧", zh: "列表", fr: "Liste" })}
            </button>
          </div>

          {githubImportMode ? (
            <GitHubImportPanel
              onComplete={(result) => {
                setGithubImportMode(false);
                void loadProjects(1, "");
                setSelectedProjectId(result.projectId);
                setIsCreating(false);
                setEditingProjectId(null);
              }}
              onCancel={() => setGithubImportMode(false)}
            />
          ) : (
            <>
              <div className="border-b border-[var(--th-border)] px-5 py-3">
                <h3 className="text-sm font-semibold">{formTitle}</h3>
              </div>

              <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 overflow-y-auto overflow-x-hidden p-5 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                <ProjectEditorPanel
                  t={t as ProjectI18nTranslate}
                  language={language}
                  isCreating={isCreating}
                  editingProjectId={editingProjectId}
                  selectedProject={selectedProject}
                  detail={detail}
                  name={name}
                  setName={setName}
                  projectPath={projectPath}
                  setProjectPath={setProjectPath}
                  coreGoal={coreGoal}
                  setCoreGoal={setCoreGoal}
                  saving={saving}
                  canSave={canSave}
                  pathToolsVisible={pathToolsVisible}
                  pathSuggestionsOpen={pathTools.pathSuggestionsOpen}
                  setPathSuggestionsOpen={pathTools.setPathSuggestionsOpen}
                  pathSuggestionsLoading={pathTools.pathSuggestionsLoading}
                  pathSuggestions={pathTools.pathSuggestions}
                  missingPathPrompt={pathTools.missingPathPrompt}
                  setMissingPathPrompt={pathTools.setMissingPathPrompt}
                  pathApiUnsupported={pathTools.pathApiUnsupported}
                  setPathApiUnsupported={pathTools.setPathApiUnsupported}
                  nativePathPicking={pathTools.nativePathPicking}
                  setNativePathPicking={pathTools.setNativePathPicking}
                  nativePickerUnsupported={pathTools.nativePickerUnsupported}
                  setNativePickerUnsupported={pathTools.setNativePickerUnsupported}
                  setManualPathPickerOpen={pathTools.setManualPathPickerOpen}
                  loadManualPathEntries={pathTools.loadManualPathEntries}
                  unsupportedPathApiMessage={pathTools.unsupportedPathApiMessage}
                  resolvePathHelperErrorMessage={pathTools.resolvePathHelperErrorMessage}
                  formFeedback={pathTools.formFeedback}
                  setFormFeedback={pathTools.setFormFeedback}
                  assignmentMode={assignmentMode}
                  setAssignmentMode={setAssignmentMode}
                  setManualAssignmentWarning={setManualAssignmentWarning}
                  manualSelectionStats={manualSelectionStats}
                  selectedAgentIds={selectedAgentIds}
                  setSelectedAgentIds={setSelectedAgentIds}
                  agentFilterDept={agentFilterDept}
                  setAgentFilterDept={setAgentFilterDept}
                  agents={agents}
                  departments={departments}
                  spriteMap={spriteMap}
                  onSave={() => {
                    void handleSave();
                  }}
                  onCancelEdit={() => {
                    setIsCreating(false);
                    setEditingProjectId(null);
                    pathTools.resetPathHelperState();
                    if (viewedProject) {
                      setName(viewedProject.name);
                      setProjectPath(viewedProject.project_path);
                      setCoreGoal(viewedProject.core_goal);
                    }
                  }}
                  onStartEditSelected={startEditSelected}
                  onDelete={() => {
                    void handleDelete();
                  }}
                />

                <ProjectInsightsPanel
                  t={t as ProjectI18nTranslate}
                  selectedProject={selectedProject}
                  loadingDetail={loadingDetail}
                  isCreating={isCreating}
                  groupedTaskCards={groupedTaskCards}
                  sortedReports={sortedReports}
                  sortedDecisionEvents={sortedDecisionEvents}
                  getDecisionEventLabel={getDecisionEventLabel}
                  handleOpenTaskDetail={handleOpenTaskDetail}
                />
              </div>
            </>
          )}
        </section>
      </div>

      <ManualAssignmentWarningDialog
        warning={manualAssignmentWarning}
        stats={manualSelectionStats}
        t={t as ProjectI18nTranslate}
        onCancel={() => setManualAssignmentWarning(null)}
        onConfirm={(warning) => {
          setManualAssignmentWarning(null);
          void handleSave(warning.allowCreateMissingPath, true);
        }}
      />

      <MissingPathPromptDialog
        prompt={pathTools.missingPathPrompt}
        t={t as ProjectI18nTranslate}
        saving={saving}
        onCancel={() => pathTools.setMissingPathPrompt(null)}
        onConfirmCreate={() => {
          pathTools.setMissingPathPrompt(null);
          void handleSave(true);
        }}
      />

      <ManualPathPickerDialog
        open={pathTools.manualPathPickerOpen}
        t={t as ProjectI18nTranslate}
        manualPathCurrent={pathTools.manualPathCurrent}
        manualPathParent={pathTools.manualPathParent}
        manualPathEntries={pathTools.manualPathEntries}
        manualPathLoading={pathTools.manualPathLoading}
        manualPathError={pathTools.manualPathError}
        manualPathTruncated={pathTools.manualPathTruncated}
        onClose={() => pathTools.setManualPathPickerOpen(false)}
        onLoadEntries={pathTools.loadManualPathEntries}
        onSelectCurrent={() => {
          if (!pathTools.manualPathCurrent) return;
          setProjectPath(pathTools.manualPathCurrent);
          pathTools.setMissingPathPrompt(null);
          pathTools.setPathSuggestionsOpen(false);
          pathTools.setFormFeedback(null);
          pathTools.setManualPathPickerOpen(false);
        }}
      />
    </Dialog>
  );
}
