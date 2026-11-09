import { useCallback, useMemo, useState } from "react";
import { Eye, EyeOff, FolderKanban, Plus, RotateCcw } from "lucide-react";
import { bulkHideTasks } from "../api";
import { useI18n } from "../i18n";
import type { Agent, Department, SubTask, Task, WorkflowPackKey } from "../types";
import ProjectManagerModal from "./ProjectManagerModal";
import BulkHideModal from "./taskboard/BulkHideModal";
import CreateTaskModal from "./taskboard/CreateTaskModal";
import FilterBar from "./taskboard/FilterBar";
import TaskCard from "./taskboard/TaskCard";
import { COLUMNS, isHideableStatus, taskStatusLabel, type HideableStatus } from "./taskboard/constants";

interface TaskBoardProps {
  tasks: Task[];
  agents: Agent[];
  departments: Department[];
  subtasks: SubTask[];
  onCreateTask: (input: {
    title: string;
    description?: string;
    department_id?: string;
    task_type?: string;
    priority?: number;
    project_id?: string;
    project_path?: string;
    assigned_agent_id?: string;
    workflow_pack_key?: WorkflowPackKey;
  }) => void;
  onUpdateTask: (id: string, data: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
  onAssignTask: (taskId: string, agentId: string) => void;
  onRunTask: (id: string) => void;
  onStopTask: (id: string) => void;
  onPauseTask?: (id: string) => void;
  onResumeTask?: (id: string) => void;
  onOpenTerminal?: (taskId: string) => void;
  onOpenMeetingMinutes?: (taskId: string) => void;
  onMergeTask?: (id: string) => void;
  onDiscardTask?: (id: string) => void;
}

export function TaskBoard({
  tasks,
  agents,
  departments,
  subtasks,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onAssignTask,
  onRunTask,
  onStopTask,
  onPauseTask,
  onResumeTask,
  onOpenTerminal,
  onOpenMeetingMinutes,
  onMergeTask,
  onDiscardTask,
}: TaskBoardProps) {
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [showBulkHideModal, setShowBulkHideModal] = useState(false);
  const [filterDept, setFilterDept] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [showAllTasks, setShowAllTasks] = useState(false);

  const hiddenTaskIds = useMemo(
    () => new Set(tasks.filter((task) => task.hidden === 1).map((task) => task.id)),
    [tasks],
  );

  const hideTask = useCallback(
    (taskId: string) => {
      onUpdateTask(taskId, { hidden: 1 });
    },
    [onUpdateTask],
  );

  const unhideTask = useCallback(
    (taskId: string) => {
      onUpdateTask(taskId, { hidden: 0 });
    },
    [onUpdateTask],
  );

  const hideByStatuses = useCallback((statuses: HideableStatus[]) => {
    if (statuses.length === 0) return;
    bulkHideTasks(statuses, 1);
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filterDept && task.department_id !== filterDept) return false;
      if (filterAgent && task.assigned_agent_id !== filterAgent) return false;
      if (filterType && task.task_type !== filterType) return false;
      if (search && !task.title.toLowerCase().includes(search.toLowerCase())) return false;
      const isHidden = hiddenTaskIds.has(task.id);
      if (!showAllTasks && isHidden) return false;
      return true;
    });
  }, [tasks, filterDept, filterAgent, filterType, search, hiddenTaskIds, showAllTasks]);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const column of COLUMNS) {
      grouped[column.status] = filteredTasks
        .filter((task) => task.status === column.status)
        .sort((a, b) => b.priority - a.priority || b.created_at - a.created_at);
    }
    return grouped;
  }, [filteredTasks]);

  const subtasksByTask = useMemo(() => {
    const grouped: Record<string, SubTask[]> = {};
    for (const subtask of subtasks) {
      if (!grouped[subtask.task_id]) grouped[subtask.task_id] = [];
      grouped[subtask.task_id].push(subtask);
    }
    return grouped;
  }, [subtasks]);

  const activeFilterCount = [filterDept, filterAgent, filterType, search].filter(Boolean).length;
  const hiddenTaskCount = useMemo(() => {
    let count = 0;
    for (const task of tasks) {
      if (isHideableStatus(task.status) && hiddenTaskIds.has(task.id)) count++;
    }
    return count;
  }, [tasks, hiddenTaskIds]);

  const taskCount = filteredTasks.length;
  const plural = (n: number) => (n > 1 ? "s" : "");

  return (
    <div className="flex h-full flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="qg-text-muted text-[13px]" role="status">
          {t({
            ko: `총 ${taskCount}개`,
            en: `Total ${taskCount}`,
            ja: `合計 ${taskCount}件`,
            zh: `总计 ${taskCount}项`,
            fr: `${taskCount} tâche${plural(taskCount)}`,
          })}
          {activeFilterCount > 0 &&
            t({
              ko: ` (필터 ${activeFilterCount}개 적용)`,
              en: ` (filters ${activeFilterCount} applied)`,
              ja: ` (フィルター ${activeFilterCount}件適用)`,
              zh: ` (筛选器 ${activeFilterCount}个已应用)`,
              fr: ` · ${activeFilterCount} filtre${plural(activeFilterCount)} actif${plural(activeFilterCount)}`,
            })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilterDept("");
                setFilterAgent("");
                setFilterType("");
                setSearch("");
              }}
              className="qg-btn qg-btn--ghost"
            >
              <RotateCcw size={16} aria-hidden />
              {t({
                ko: "필터 초기화",
                en: "Reset Filters",
                ja: "フィルターをリセット",
                zh: "重置筛选",
                fr: "Réinitialiser les filtres",
              })}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAllTasks((prev) => !prev)}
            aria-pressed={showAllTasks}
            className="qg-btn"
            title={
              showAllTasks
                ? t({
                    ko: "진행중 보기로 전환 (숨김 제외)",
                    en: "Switch to active view (exclude hidden)",
                    ja: "進行中表示へ切替（非表示を除外）",
                    zh: "切换到进行中视图（排除隐藏）",
                    fr: "Afficher seulement les tâches actives (sans les tâches masquées)",
                  })
                : t({
                    ko: "모두보기로 전환 (숨김 포함)",
                    en: "Switch to all view (include hidden)",
                    ja: "全体表示へ切替（非表示を含む）",
                    zh: "切换到全部视图（包含隐藏）",
                    fr: "Afficher toutes les tâches (y compris les tâches masquées)",
                  })
            }
          >
            <Eye size={16} aria-hidden />
            <span className={showAllTasks ? "qg-text-muted font-normal" : "underline underline-offset-4"}>
              {t({ ko: "진행중", en: "Active", ja: "進行中", zh: "进行中", fr: "Actives" })}
            </span>
            <span className="qg-text-muted" aria-hidden>
              /
            </span>
            <span className={showAllTasks ? "underline underline-offset-4" : "qg-text-muted font-normal"}>
              {t({ ko: "모두보기", en: "All", ja: "すべて", zh: "全部", fr: "Toutes" })}
            </span>
            <span
              className="qg-count"
              title={t({
                ko: "숨긴 업무",
                en: "Hidden tasks",
                ja: "非表示タスク",
                zh: "隐藏任务",
                fr: "Tâches masquées",
              })}
            >
              {hiddenTaskCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowBulkHideModal(true)}
            className="qg-btn"
            title={t({
              ko: "완료/보류/취소 상태 업무 숨기기",
              en: "Hide done/pending/cancelled tasks",
              ja: "完了/保留/キャンセル状態を非表示",
              zh: "隐藏完成/待处理/已取消任务",
              fr: "Masquer les tâches terminées, en attente ou annulées",
            })}
          >
            <EyeOff size={16} aria-hidden />
            {t({ ko: "숨김", en: "Hide", ja: "非表示", zh: "隐藏", fr: "Masquer" })}
          </button>
          <button type="button" onClick={() => setShowProjectManager(true)} className="qg-btn">
            <FolderKanban size={16} aria-hidden />
            {t({ ko: "프로젝트 관리", en: "Project Manager", ja: "プロジェクト管理", zh: "项目管理", fr: "Projets" })}
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className="qg-btn qg-btn--primary">
            <Plus size={16} aria-hidden />
            {t({ ko: "새 업무", en: "New Task", ja: "新規タスク", zh: "新建任务", fr: "Nouvelle tâche" })}
          </button>
        </div>
      </div>

      <FilterBar
        agents={agents}
        departments={departments}
        filterDept={filterDept}
        filterAgent={filterAgent}
        filterType={filterType}
        search={search}
        onFilterDept={setFilterDept}
        onFilterAgent={setFilterAgent}
        onFilterType={setFilterType}
        onSearch={setSearch}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2 sm:flex-row sm:overflow-x-auto sm:overflow-y-hidden">
        {COLUMNS.map((column) => {
          const columnTasks = tasksByStatus[column.status] ?? [];
          return (
            <section
              key={column.status}
              aria-labelledby={`taskboard-column-${column.status}`}
              className="flex w-full flex-col rounded-[var(--qg-radius)] border border-[var(--th-border)] bg-[var(--th-bg-surface)] sm:w-72 sm:flex-shrink-0"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[var(--th-border)] px-3.5 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className={`h-2 w-2 flex-shrink-0 rounded-full ${column.dotColor}`} />
                  <h2
                    id={`taskboard-column-${column.status}`}
                    className="truncate text-sm font-semibold text-[var(--th-text-heading)]"
                  >
                    {taskStatusLabel(column.status, t)}
                  </h2>
                </div>
                <span className="qg-count">{columnTasks.length}</span>
              </div>

              <div className="flex flex-col gap-2.5 p-2.5 sm:flex-1 sm:overflow-y-auto">
                {columnTasks.length === 0 ? (
                  <p className="qg-empty sm:flex-1">
                    {t({ ko: "업무 없음", en: "No tasks", ja: "タスクなし", zh: "暂无任务", fr: "Aucune tâche" })}
                  </p>
                ) : (
                  columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      agents={agents}
                      departments={departments}
                      taskSubtasks={subtasksByTask[task.id] ?? []}
                      isHiddenTask={hiddenTaskIds.has(task.id)}
                      onUpdateTask={onUpdateTask}
                      onDeleteTask={onDeleteTask}
                      onAssignTask={onAssignTask}
                      onRunTask={onRunTask}
                      onStopTask={onStopTask}
                      onPauseTask={onPauseTask}
                      onResumeTask={onResumeTask}
                      onOpenTerminal={onOpenTerminal}
                      onOpenMeetingMinutes={onOpenMeetingMinutes}
                      onMergeTask={onMergeTask}
                      onDiscardTask={onDiscardTask}
                      onHideTask={hideTask}
                      onUnhideTask={unhideTask}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {showCreate && (
        <CreateTaskModal
          agents={agents}
          departments={departments}
          onClose={() => setShowCreate(false)}
          onCreate={onCreateTask}
          onAssign={onAssignTask}
        />
      )}

      {showProjectManager && (
        <ProjectManagerModal agents={agents} departments={departments} onClose={() => setShowProjectManager(false)} />
      )}

      {showBulkHideModal && (
        <BulkHideModal
          tasks={tasks}
          hiddenTaskIds={hiddenTaskIds}
          onClose={() => setShowBulkHideModal(false)}
          onApply={(statuses) => {
            hideByStatuses(statuses);
            setShowBulkHideModal(false);
          }}
        />
      )}
    </div>
  );
}

export default TaskBoard;
