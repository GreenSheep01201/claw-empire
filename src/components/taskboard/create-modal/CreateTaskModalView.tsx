import { useId, type ComponentProps, type FormEventHandler } from "react";
import type { Agent, Department, TaskType } from "../../../types";
import { TASK_TYPE_OPTIONS, taskTypeLabel, type FormFeedback, type TFunction } from "../constants";
import { FileClock } from "lucide-react";
import Dialog from "../../ui/Dialog";
import CreateTaskModalOverlays from "./Overlays";
import type { CreateTaskModalOverlaysProps } from "./overlay-types";
import { AssigneeSection, PrioritySection, ProjectSection } from "./Sections";

interface CreateTaskModalViewProps {
  t: TFunction;
  locale: string;
  createNewProjectMode: boolean;
  draftsCount: number;
  title: string;
  description: string;
  departmentId: string;
  taskType: TaskType;
  priority: number;
  assignAgentId: string;
  submitBusy: boolean;
  formFeedback: FormFeedback | null;
  departments: Department[];
  filteredAgents: Agent[];
  projectSectionProps: ComponentProps<typeof ProjectSection>;
  overlaysProps: CreateTaskModalOverlaysProps;
  onOpenDraftModal: () => void;
  onRequestClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDepartmentChange: (value: string) => void;
  onTaskTypeChange: (value: TaskType) => void;
  onPriorityChange: (value: number) => void;
  onAssignAgentChange: (value: string) => void;
}

export default function CreateTaskModalView({
  t,
  locale,
  createNewProjectMode,
  draftsCount,
  title,
  description,
  departmentId,
  taskType,
  priority,
  assignAgentId,
  submitBusy,
  formFeedback,
  departments,
  filteredAgents,
  projectSectionProps,
  overlaysProps,
  onOpenDraftModal,
  onRequestClose,
  onSubmit,
  onTitleChange,
  onDescriptionChange,
  onDepartmentChange,
  onTaskTypeChange,
  onPriorityChange,
  onAssignAgentChange,
}: CreateTaskModalViewProps) {
  const fieldId = useId();
  const titleId = `${fieldId}-title`;
  const descriptionId = `${fieldId}-description`;
  const departmentFieldId = `${fieldId}-department`;
  const taskTypeId = `${fieldId}-type`;

  return (
    <>
      <Dialog
        open
        size="lg"
        dismissOnBackdrop={false}
        onClose={onRequestClose}
        closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
        title={t({
          ko: "새 업무 만들기",
          en: "Create New Task",
          ja: "新しいタスクを作成",
          zh: "创建新任务",
          fr: "Nouvelle tâche",
        })}
        headerActions={
          <button
            type="button"
            onClick={onOpenDraftModal}
            className="qg-btn"
            title={t({
              ko: "임시 저장 항목 열기",
              en: "Open temporary drafts",
              ja: "一時保存を開く",
              zh: "打开临时草稿",
              fr: "Ouvrir les brouillons",
            })}
          >
            <FileClock size={16} aria-hidden />
            {t({ ko: "임시", en: "Temp", ja: "一時", zh: "临时", fr: "Brouillons" })}
            <span className="qg-count">{draftsCount}</span>
          </button>
        }
      >
        <form onSubmit={onSubmit} className="flex flex-col">
          <div className={createNewProjectMode ? "lg:grid lg:grid-cols-2 lg:gap-5" : undefined}>
            <div className="min-w-0 space-y-4">
              <div className="qg-field">
                <label htmlFor={titleId} className="qg-field__label">
                  {t({ ko: "제목", en: "Title", ja: "タイトル", zh: "标题", fr: "Titre" })}{" "}
                  <span aria-hidden="true">*</span>
                </label>
                <input
                  id={titleId}
                  type="text"
                  value={title}
                  onChange={(event) => onTitleChange(event.target.value)}
                  placeholder={t({
                    ko: "업무 제목을 입력하세요",
                    en: "Enter a task title",
                    ja: "タスクのタイトルを入力してください",
                    zh: "请输入任务标题",
                    fr: "Saisir un titre de tâche",
                  })}
                  required
                  className="qg-input"
                />
              </div>

              <div className="qg-field">
                <label htmlFor={descriptionId} className="qg-field__label">
                  {t({ ko: "설명", en: "Description", ja: "説明", zh: "说明", fr: "Description" })}
                </label>
                <textarea
                  id={descriptionId}
                  value={description}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                  placeholder={t({
                    ko: "업무에 대한 상세 설명을 입력하세요",
                    en: "Enter a detailed description",
                    ja: "タスクの詳細説明を入力してください",
                    zh: "请输入任务详细说明",
                    fr: "Décrire la tâche en détail",
                  })}
                  rows={3}
                  className="qg-textarea"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="qg-field">
                  <label htmlFor={departmentFieldId} className="qg-field__label">
                    {t({ ko: "부서", en: "Department", ja: "部署", zh: "部门", fr: "Pôle" })}
                  </label>
                  <select
                    id={departmentFieldId}
                    value={departmentId}
                    onChange={(event) => onDepartmentChange(event.target.value)}
                    className="qg-select w-full"
                  >
                    <option value="">
                      {t({
                        ko: "-- 전체 --",
                        en: "-- All --",
                        ja: "-- 全体 --",
                        zh: "-- 全部 --",
                        fr: "Tous les pôles",
                      })}
                    </option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.icon} {locale === "ko" ? department.name_ko : department.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="qg-field">
                  <label htmlFor={taskTypeId} className="qg-field__label">
                    {t({ ko: "업무 유형", en: "Task Type", ja: "タスク種別", zh: "任务类型", fr: "Type de tâche" })}
                  </label>
                  <select
                    id={taskTypeId}
                    value={taskType}
                    onChange={(event) => onTaskTypeChange(event.target.value as TaskType)}
                    className="qg-select w-full"
                  >
                    {TASK_TYPE_OPTIONS.map((typeOption) => (
                      <option key={typeOption.value} value={typeOption.value}>
                        {taskTypeLabel(typeOption.value, t)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Escape closes an open project dropdown, not the whole dialog. */}
              <div
                onKeyDown={(event) => {
                  if (event.key === "Escape" && projectSectionProps.projectDropdownOpen) event.stopPropagation();
                }}
              >
                <ProjectSection {...projectSectionProps} />
              </div>

              <div className={createNewProjectMode ? "lg:hidden" : ""}>
                <PrioritySection priority={priority} t={t} onPriorityChange={onPriorityChange} />
              </div>
              <div className={createNewProjectMode ? "lg:hidden" : ""}>
                <AssigneeSection
                  agents={filteredAgents}
                  departments={departments}
                  departmentId={departmentId}
                  assignAgentId={assignAgentId}
                  t={t}
                  onAssignAgentChange={onAssignAgentChange}
                />
              </div>
            </div>

            {createNewProjectMode && (
              <aside className="hidden min-w-0 lg:block lg:transition-all lg:duration-300 lg:ease-out">
                <div className="qg-card space-y-4">
                  <PrioritySection priority={priority} t={t} onPriorityChange={onPriorityChange} />
                  <AssigneeSection
                    agents={filteredAgents}
                    departments={departments}
                    departmentId={departmentId}
                    assignAgentId={assignAgentId}
                    t={t}
                    onAssignAgentChange={onAssignAgentChange}
                  />
                </div>
              </aside>
            )}
          </div>

          {formFeedback && (
            <div className="pt-4">
              <div className="qg-card text-sm" role={formFeedback.tone === "error" ? "alert" : "status"}>
                <span className={formFeedback.tone === "error" ? "qg-field__error" : "qg-text-secondary"}>
                  {formFeedback.message}
                </span>
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-3 border-t border-[var(--th-border)] pt-4">
            <button type="button" onClick={onRequestClose} className="qg-btn qg-btn--ghost">
              {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消", fr: "Annuler" })}
            </button>
            <button type="submit" disabled={!title.trim() || submitBusy} className="qg-btn qg-btn--primary">
              {submitBusy
                ? t({ ko: "생성 중...", en: "Creating...", ja: "作成中...", zh: "创建中...", fr: "Création…" })
                : t({ ko: "업무 만들기", en: "Create Task", ja: "タスク作成", zh: "创建任务", fr: "Créer la tâche" })}
            </button>
          </div>
        </form>
      </Dialog>

      <CreateTaskModalOverlays {...overlaysProps} />
    </>
  );
}
