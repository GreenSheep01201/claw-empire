import { useState } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  CircleCheck,
  Clock,
  EyeOff,
  FileDiff,
  Hammer,
  Link2,
  Minus,
  NotebookText,
  Pause,
  Play,
  RotateCcw,
  Square,
  SquareTerminal,
  Trash2,
  Eye,
  type LucideIcon,
} from "lucide-react";
import type { Agent, Department, SubTask, Task, TaskStatus } from "../../types";
import { localeName, useI18n } from "../../i18n";
import AgentAvatar from "../AgentAvatar";
import AgentSelect from "../AgentSelect";
import DiffModal from "./DiffModal";
import {
  getTaskTypeBadge,
  isHideableStatus,
  priorityLabel,
  STATUS_OPTIONS,
  taskStatusLabel,
  timeAgo,
} from "./constants";

interface TaskCardProps {
  task: Task;
  agents: Agent[];
  departments: Department[];
  taskSubtasks: SubTask[];
  isHiddenTask?: boolean;
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
  onHideTask?: (id: string) => void;
  onUnhideTask?: (id: string) => void;
}

const SUBTASK_STATUS_ICON: Record<string, LucideIcon> = {
  pending: Clock,
  in_progress: Hammer,
  done: CircleCheck,
  blocked: Ban,
};

function priorityGlyph(priority: number): LucideIcon {
  if (priority >= 4) return ChevronsUp;
  if (priority >= 2) return Minus;
  return ChevronDown;
}

export default function TaskCard({
  task,
  agents,
  departments,
  taskSubtasks,
  isHiddenTask,
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
  onHideTask,
  onUnhideTask,
}: TaskCardProps) {
  void onMergeTask;
  void onDiscardTask;
  const { t, locale: localeTag, language: locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [agentWarning, setAgentWarning] = useState(false);

  const assignedAgent = task.assigned_agent ?? agents.find((agent) => agent.id === task.assigned_agent_id);
  const fallbackAssignedName =
    (locale === "ko" ? task.agent_name_ko || task.agent_name : task.agent_name || task.agent_name_ko) ||
    task.assigned_agent_id;
  const assignedDisplayName = assignedAgent ? (locale === "ko" ? assignedAgent.name_ko : assignedAgent.name) : null;
  const assignedLabel = assignedDisplayName || fallbackAssignedName || null;
  const department = departments.find((d) => d.id === task.department_id);
  const typeBadge = getTaskTypeBadge(task.task_type, t);
  const PriorityIcon = priorityGlyph(task.priority);
  const priorityText = priorityLabel(task.priority, t);
  const priorityTitle = t({
    ko: `우선순위: ${priorityText}`,
    en: `Priority: ${priorityText}`,
    ja: `優先度: ${priorityText}`,
    zh: `优先级: ${priorityText}`,
    fr: `Priorité : ${priorityText.toLocaleLowerCase("fr")}`,
  });

  const canRun = task.status === "planned" || task.status === "inbox";
  const canStop = task.status === "in_progress";
  const canPause = task.status === "in_progress" && !!onPauseTask;
  const canResume = (task.status === "pending" || task.status === "cancelled") && !!onResumeTask;
  const canDelete = task.status !== "in_progress";
  const canHideTask = isHideableStatus(task.status);

  const terminalLabel = t({
    ko: "터미널 출력 보기",
    en: "View terminal output",
    ja: "ターミナル出力を見る",
    zh: "查看终端输出",
    fr: "Voir le journal d'exécution",
  });
  const minutesLabel = t({
    ko: "회의록 보기",
    en: "View meeting minutes",
    ja: "会議録を見る",
    zh: "查看会议纪要",
    fr: "Voir le compte rendu de réunion",
  });
  const deleteLabel = t({
    ko: "작업 삭제",
    en: "Delete task",
    ja: "タスク削除",
    zh: "删除任务",
    fr: "Supprimer la tâche",
  });
  const subtaskDone = task.subtask_done ?? 0;
  const subtaskTotal = task.subtask_total ?? 0;

  return (
    <article
      className={`group rounded-[var(--qg-radius)] border bg-[var(--th-bg-primary)] p-3.5 transition-[transform,box-shadow,border-color] duration-150 hover:border-[var(--th-border-strong)] hover:shadow-[var(--qg-lift-high)] motion-safe:hover:-translate-y-px ${
        isHiddenTask ? "border-dashed border-[var(--th-border-strong)]" : "border-[var(--th-border)]"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex-1 text-left text-sm font-semibold leading-snug text-[var(--th-text-heading)]"
        >
          {task.title}
        </button>
      </div>

      {task.description && (
        <p className={`qg-text-secondary mb-2 text-[13px] leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
          {task.description}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="qg-badge" title={priorityTitle}>
          <PriorityIcon size={14} aria-hidden />
          {priorityText}
        </span>
        <span className="qg-badge">{typeBadge.label}</span>
        {isHiddenTask && (
          <span className="qg-badge">
            <EyeOff size={14} aria-hidden />
            {t({ ko: "숨김", en: "Hidden", ja: "非表示", zh: "隐藏", fr: "Masquée" })}
          </span>
        )}
        {department && (
          <span className="qg-badge">
            {department.color && (
              <span
                aria-hidden
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: department.color }}
              />
            )}
            {localeName(locale, department)}
          </span>
        )}
      </div>

      <div className="mb-3">
        <select
          value={task.status}
          onChange={(event) => onUpdateTask(task.id, { status: event.target.value as TaskStatus })}
          aria-label={t({ ko: "상태", en: "Status", ja: "状態", zh: "状态", fr: "Statut" })}
          className="qg-select w-full"
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {taskStatusLabel(status as TaskStatus, t)}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2 text-[13px]">
        <div className="flex min-w-0 items-center gap-1.5">
          {assignedAgent && assignedLabel ? (
            <>
              <AgentAvatar agent={assignedAgent} agents={agents} size={20} />
              <span className="qg-text-secondary truncate">{assignedLabel}</span>
            </>
          ) : assignedLabel ? (
            <span className="qg-text-secondary truncate">{assignedLabel}</span>
          ) : (
            <span className="qg-text-muted">
              {t({ ko: "미배정", en: "Unassigned", ja: "未割り当て", zh: "未分配", fr: "Non assignée" })}
            </span>
          )}
        </div>
        <span className="qg-text-muted shrink-0">{timeAgo(task.created_at, localeTag)}</span>
      </div>

      <div
        className={`mb-3 rounded-[4px] transition-all ${agentWarning ? "outline-2 outline-offset-2 outline-[var(--qg-pin)] animate-[shake_0.4s_ease-in-out]" : ""}`}
      >
        <AgentSelect
          agents={agents}
          departments={departments}
          value={task.assigned_agent_id ?? ""}
          placeholder={
            assignedAgent || !assignedLabel
              ? undefined
              : t({
                  ko: `배정됨(숨김): ${assignedLabel}`,
                  en: `Assigned (hidden): ${assignedLabel}`,
                  ja: `割り当て済み(非表示): ${assignedLabel}`,
                  zh: `已分配（隐藏）: ${assignedLabel}`,
                  fr: `Responsable masqué : ${assignedLabel}`,
                })
          }
          onChange={(agentId) => {
            setAgentWarning(false);
            if (agentId) {
              onAssignTask(task.id, agentId);
            } else {
              onUpdateTask(task.id, { assigned_agent_id: null });
            }
          }}
        />
        {agentWarning && (
          <p role="alert" className="qg-field__error mt-1 font-semibold animate-[shake_0.4s_ease-in-out]">
            {t({
              ko: "담당자를 배정해주세요!",
              en: "Please assign an agent!",
              ja: "担当者を割り当ててください！",
              zh: "请分配负责人！",
              fr: "Choisissez d'abord un responsable.",
            })}
          </p>
        )}
      </div>

      {subtaskTotal > 0 && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setShowSubtasks((v) => !v)}
            aria-expanded={showSubtasks}
            aria-label={t({
              ko: `하위 작업 ${subtaskDone}/${subtaskTotal}`,
              en: `Subtasks ${subtaskDone}/${subtaskTotal}`,
              ja: `サブタスク ${subtaskDone}/${subtaskTotal}`,
              zh: `子任务 ${subtaskDone}/${subtaskTotal}`,
              fr: `Sous-tâches ${subtaskDone}/${subtaskTotal}`,
            })}
            className="mb-1.5 flex w-full items-center gap-2 text-left"
          >
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--th-bg-surface-hover)]">
              <div
                className="h-full rounded-full bg-[var(--qg-accent)] transition-all"
                style={{ width: `${Math.round((subtaskDone / (subtaskTotal || 1)) * 100)}%` }}
              />
            </div>
            <span className="qg-text-secondary whitespace-nowrap text-[13px]">
              {subtaskDone}/{subtaskTotal}
            </span>
            {showSubtasks ? (
              <ChevronUp size={16} aria-hidden className="qg-text-muted" />
            ) : (
              <ChevronDown size={16} aria-hidden className="qg-text-muted" />
            )}
          </button>
          {showSubtasks && taskSubtasks.length > 0 && (
            <ul className="space-y-1 pl-1">
              {taskSubtasks.map((subtask) => {
                const targetDepartment = subtask.target_department_id
                  ? departments.find((departmentItem) => departmentItem.id === subtask.target_department_id)
                  : null;
                const SubtaskIcon = SUBTASK_STATUS_ICON[subtask.status] ?? Clock;
                return (
                  <li key={subtask.id} className="flex items-center gap-1.5 text-[13px]">
                    <SubtaskIcon
                      size={16}
                      aria-hidden
                      className={`shrink-0 ${subtask.status === "done" ? "text-[var(--qg-accent)]" : "qg-text-muted"}`}
                    />
                    <span
                      className={`flex-1 truncate ${subtask.status === "done" ? "qg-text-muted line-through" : "qg-text-secondary"}`}
                    >
                      {subtask.title}
                    </span>
                    {targetDepartment && (
                      <span className="qg-badge shrink-0">
                        <span
                          aria-hidden
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: targetDepartment.color }}
                        />
                        {localeName(locale, targetDepartment)}
                      </span>
                    )}
                    {subtask.delegated_task_id && subtask.status !== "done" && (
                      <Link2
                        size={16}
                        className="qg-text-muted shrink-0"
                        role="img"
                        aria-label={t({ ko: "위임됨", en: "Delegated", ja: "委任済み", zh: "已委派", fr: "Déléguée" })}
                      />
                    )}
                    {subtask.status === "blocked" && subtask.blocked_reason && (
                      <span
                        className="max-w-[80px] truncate text-[13px] text-[var(--qg-pin)]"
                        title={subtask.blocked_reason}
                      >
                        {subtask.blocked_reason}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {canRun && (
          <button
            type="button"
            onClick={() => {
              if (!task.assigned_agent_id) {
                setAgentWarning(true);
                setTimeout(() => setAgentWarning(false), 3000);
                return;
              }
              onRunTask(task.id);
            }}
            title={t({ ko: "작업 실행", en: "Run task", ja: "タスク実行", zh: "运行任务", fr: "Lancer la tâche" })}
            className="qg-btn qg-btn--primary qg-btn--sm flex-1"
          >
            <Play size={16} aria-hidden />
            {t({ ko: "실행", en: "Run", ja: "実行", zh: "运行", fr: "Lancer" })}
          </button>
        )}
        {canPause && (
          <button
            type="button"
            onClick={() => onPauseTask!(task.id)}
            title={t({
              ko: "작업 일시중지",
              en: "Pause task",
              ja: "タスク一時停止",
              zh: "暂停任务",
              fr: "Mettre la tâche en pause",
            })}
            className="qg-btn qg-btn--sm flex-1"
          >
            <Pause size={16} aria-hidden />
            {t({ ko: "일시중지", en: "Pause", ja: "一時停止", zh: "暂停", fr: "Pause" })}
          </button>
        )}
        {canStop && (
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  t({
                    ko: `"${task.title}" 작업을 중지할까요?\n\n경고: Stop 처리 시 해당 프로젝트 변경분은 롤백됩니다.`,
                    en: `Stop "${task.title}"?\n\nWarning: stopping will roll back project changes.`,
                    ja: `「${task.title}」を停止しますか？\n\n警告: 停止するとプロジェクトの変更はロールバックされます。`,
                    zh: `要停止“${task.title}”吗？\n\n警告：停止后将回滚该项目的更改。`,
                    fr: `Arrêter « ${task.title} » ?\n\nAttention : les modifications apportées au projet seront annulées.`,
                  }),
                )
              ) {
                onStopTask(task.id);
              }
            }}
            title={t({ ko: "작업 중지", en: "Cancel task", ja: "タスク停止", zh: "取消任务", fr: "Arrêter la tâche" })}
            className="qg-btn qg-btn--danger qg-btn--sm"
          >
            <Square size={16} aria-hidden />
            {t({ ko: "중지", en: "Cancel", ja: "キャンセル", zh: "取消", fr: "Arrêter" })}
          </button>
        )}
        {canResume && (
          <button
            type="button"
            onClick={() => onResumeTask!(task.id)}
            title={t({
              ko: "작업 재개",
              en: "Resume task",
              ja: "タスク再開",
              zh: "恢复任务",
              fr: "Reprendre la tâche",
            })}
            className="qg-btn qg-btn--sm flex-1"
          >
            <RotateCcw size={16} aria-hidden />
            {t({ ko: "재개", en: "Resume", ja: "再開", zh: "恢复", fr: "Reprendre" })}
          </button>
        )}
        {(task.status === "in_progress" ||
          task.status === "review" ||
          task.status === "done" ||
          task.status === "pending") &&
          onOpenTerminal && (
            <button
              type="button"
              onClick={() => onOpenTerminal(task.id)}
              title={terminalLabel}
              aria-label={terminalLabel}
              className="qg-btn qg-btn--sm"
            >
              <SquareTerminal size={16} aria-hidden />
            </button>
          )}
        {(task.status === "planned" ||
          task.status === "collaborating" ||
          task.status === "in_progress" ||
          task.status === "review" ||
          task.status === "done" ||
          task.status === "pending") &&
          onOpenMeetingMinutes && (
            <button
              type="button"
              onClick={() => onOpenMeetingMinutes(task.id)}
              title={minutesLabel}
              aria-label={minutesLabel}
              className="qg-btn qg-btn--sm"
            >
              <NotebookText size={16} aria-hidden />
            </button>
          )}
        {task.status === "review" && (
          <button
            type="button"
            onClick={() => setShowDiff(true)}
            title={t({
              ko: "변경사항 보기 (Git diff)",
              en: "View changes (Git diff)",
              ja: "変更を見る (Git diff)",
              zh: "查看更改 (Git diff)",
              fr: "Voir les modifications",
            })}
            className="qg-btn qg-btn--sm"
          >
            <FileDiff size={16} aria-hidden />
            {t({ ko: "Diff", en: "Diff", ja: "差分", zh: "差异", fr: "Modifications" })}
          </button>
        )}
        {canHideTask && !isHiddenTask && onHideTask && (
          <button
            type="button"
            onClick={() => onHideTask(task.id)}
            title={t({
              ko: "완료/보류/취소 작업 숨기기",
              en: "Hide done/pending/cancelled task",
              ja: "完了/保留/キャンセルのタスクを非表示",
              zh: "隐藏已完成/待处理/已取消任务",
              fr: "Masquer cette tâche (terminée, en attente ou annulée)",
            })}
            className="qg-btn qg-btn--sm"
          >
            <EyeOff size={16} aria-hidden />
            {t({ ko: "숨김", en: "Hide", ja: "非表示", zh: "隐藏", fr: "Masquer" })}
          </button>
        )}
        {canHideTask && !!isHiddenTask && onUnhideTask && (
          <button
            type="button"
            onClick={() => onUnhideTask(task.id)}
            title={t({
              ko: "숨긴 작업 복원",
              en: "Restore hidden task",
              ja: "非表示タスクを復元",
              zh: "恢复隐藏任务",
              fr: "Réafficher la tâche masquée",
            })}
            className="qg-btn qg-btn--sm"
          >
            <Eye size={16} aria-hidden />
            {t({ ko: "복원", en: "Restore", ja: "復元", zh: "恢复", fr: "Réafficher" })}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  t({
                    ko: `"${task.title}" 업무를 삭제할까요?`,
                    en: `Delete "${task.title}"?`,
                    ja: `「${task.title}」を削除しますか？`,
                    zh: `要删除“${task.title}”吗？`,
                    fr: `Supprimer « ${task.title} » ?`,
                  }),
                )
              )
                onDeleteTask(task.id);
            }}
            title={deleteLabel}
            aria-label={deleteLabel}
            className="qg-btn qg-btn--danger qg-btn--sm ml-auto"
          >
            <Trash2 size={16} aria-hidden />
          </button>
        )}
      </div>

      {showDiff && <DiffModal taskId={task.id} onClose={() => setShowDiff(false)} />}
    </article>
  );
}
