import { useId } from "react";
import { FolderOpen, FolderPlus } from "lucide-react";
import type { Project } from "../../types";
import Dialog from "../ui/Dialog";

type ProjectFlowStep = "choose" | "existing" | "new" | "confirm";

type Tr = (ko: string, en: string, ja?: string, zh?: string, fr?: string) => string;

interface ProjectFlowDialogProps {
  open: boolean;
  step: ProjectFlowStep;
  isDirectivePending: boolean;
  pendingContent: string;
  projectLoading: boolean;
  projectItems: Project[];
  selectedProject: Project | null;
  existingProjectInput: string;
  existingProjectError: string;
  newProjectName: string;
  newProjectPath: string;
  newProjectGoal: string;
  projectSaving: boolean;
  canCreateProject: boolean;
  tr: Tr;
  onClose: () => void;
  onChooseExisting: () => void;
  onChooseNew: () => void;
  onBackToChoose: () => void;
  onSelectExistingProject: (project: Project, index: number) => void;
  onExistingProjectInputChange: (value: string) => void;
  onApplyExistingProjectSelection: () => void;
  onNewProjectNameChange: (value: string) => void;
  onNewProjectPathChange: (value: string) => void;
  onNewProjectGoalChange: (value: string) => void;
  onCreateProject: () => void;
  onConfirm: () => void;
}

export default function ProjectFlowDialog({
  open,
  step,
  isDirectivePending,
  pendingContent,
  projectLoading,
  projectItems,
  selectedProject,
  existingProjectInput,
  existingProjectError,
  newProjectName,
  newProjectPath,
  newProjectGoal,
  projectSaving,
  canCreateProject,
  tr,
  onClose,
  onChooseExisting,
  onChooseNew,
  onBackToChoose,
  onSelectExistingProject,
  onExistingProjectInputChange,
  onApplyExistingProjectSelection,
  onNewProjectNameChange,
  onNewProjectPathChange,
  onNewProjectGoalChange,
  onCreateProject,
  onConfirm,
}: ProjectFlowDialogProps) {
  const fieldId = useId();
  const backLabel = tr("뒤로", "Back", "戻る", "返回", "Retour");

  return (
    <Dialog
      open={open}
      size="sm"
      onClose={onClose}
      dismissOnBackdrop={step !== "new"}
      closeLabel={tr("닫기", "Close", "閉じる", "关闭", "Fermer")}
      title={tr("프로젝트 분기", "Project Branch", "プロジェクト分岐", "项目分支", "Choisir le projet")}
    >
      <div className="space-y-4 text-sm">
        {step === "choose" && (
          <>
            <p className="text-[var(--th-text-primary)]">
              {tr(
                "기존 프로젝트인가요? 신규 프로젝트인가요?",
                "Is this an existing project or a new project?",
                "既存プロジェクトですか？新規プロジェクトですか？",
                "这是已有项目还是新项目？",
                "S'agit-il d'un projet existant ou d'un nouveau projet ?",
              )}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={onChooseExisting} className="qg-choice">
                <FolderOpen size={16} aria-hidden />
                {tr("기존 프로젝트", "Existing Project", "既存プロジェクト", "已有项目", "Projet existant")}
              </button>
              <button type="button" onClick={onChooseNew} className="qg-choice">
                <FolderPlus size={16} aria-hidden />
                {tr("신규 프로젝트", "New Project", "新規プロジェクト", "新项目", "Nouveau projet")}
              </button>
            </div>
          </>
        )}

        {step === "existing" && (
          <>
            <p className="qg-text-muted">
              {tr(
                "최근 프로젝트 10개를 보여드립니다. 번호(1-10) 또는 프로젝트명을 입력하세요.",
                "Showing 10 recent projects. Enter a number (1-10) or project name.",
                "最新プロジェクト10件を表示します。番号(1-10)またはプロジェクト名を入力してください。",
                "显示最近 10 个项目。请输入编号(1-10)或项目名称。",
                "Voici les 10 projets les plus récents. Choisissez-en un ou indiquez son numéro ou son nom.",
              )}
            </p>
            {projectLoading ? (
              <p className="qg-text-muted">
                {tr("불러오는 중...", "Loading...", "読み込み中...", "加载中...", "Chargement…")}
              </p>
            ) : projectItems.length === 0 ? (
              <p className="qg-text-muted">
                {tr(
                  "프로젝트가 없습니다",
                  "No projects",
                  "プロジェクトなし",
                  "暂无项目",
                  "Aucun projet pour l'instant",
                )}
              </p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {projectItems.map((project, idx) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onSelectExistingProject(project, idx)}
                    className="qg-choice !items-start"
                  >
                    <span className="qg-count shrink-0">{idx + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate">{project.name}</span>
                      <span className="qg-text-muted block truncate text-[13px] font-normal">
                        {project.project_path}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="qg-field">
              <label htmlFor={`${fieldId}-pick`} className="qg-field__label">
                {tr(
                  "번호 또는 프로젝트명",
                  "Number or project name",
                  "番号またはプロジェクト名",
                  "编号或项目名",
                  "Numéro ou nom du projet",
                )}
              </label>
              <input
                id={`${fieldId}-pick`}
                type="text"
                value={existingProjectInput}
                onChange={(e) => onExistingProjectInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onApplyExistingProjectSelection();
                  }
                }}
                placeholder={tr(
                  "예: 1 또는 프로젝트명",
                  "e.g. 1 or project name",
                  "例: 1 またはプロジェクト名",
                  "例如：1 或项目名",
                  "Ex. : 1 ou nom du projet",
                )}
                aria-invalid={existingProjectError ? true : undefined}
                aria-describedby={existingProjectError ? `${fieldId}-pick-error` : undefined}
                className="qg-input"
              />
              {existingProjectError && (
                <p id={`${fieldId}-pick-error`} className="qg-field__error">
                  {existingProjectError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onBackToChoose} className="qg-btn">
                {backLabel}
              </button>
              <button type="button" onClick={onApplyExistingProjectSelection} className="qg-btn qg-btn--primary">
                {tr("입력값으로 선택", "Select from input", "入力値で選択", "按输入选择", "Choisir ce projet")}
              </button>
            </div>
          </>
        )}

        {step === "new" && (
          <>
            <div className="qg-field">
              <label htmlFor={`${fieldId}-name`} className="qg-field__label">
                {tr("프로젝트 이름", "Project name", "プロジェクト名", "项目名称", "Nom du projet")}
              </label>
              <input
                id={`${fieldId}-name`}
                type="text"
                value={newProjectName}
                onChange={(e) => onNewProjectNameChange(e.target.value)}
                className="qg-input"
              />
            </div>
            <div className="qg-field">
              <label htmlFor={`${fieldId}-path`} className="qg-field__label">
                {tr("프로젝트 경로", "Project path", "プロジェクトパス", "项目路径", "Dossier du projet")}
              </label>
              <input
                id={`${fieldId}-path`}
                type="text"
                value={newProjectPath}
                onChange={(e) => onNewProjectPathChange(e.target.value)}
                className="qg-input"
              />
            </div>
            <div className="qg-field">
              <label htmlFor={`${fieldId}-goal`} className="qg-field__label">
                {tr("핵심 목표", "Core goal", "コア目標", "核心目标", "Objectif principal")}
              </label>
              <textarea
                id={`${fieldId}-goal`}
                rows={3}
                value={newProjectGoal}
                onChange={(e) => onNewProjectGoalChange(e.target.value)}
                readOnly={isDirectivePending}
                className="qg-textarea resize-none"
              />
              {isDirectivePending && (
                <p className="qg-field__hint">
                  {tr(
                    "$ 업무지시 내용이 신규 프로젝트의 핵심 목표로 자동 반영됩니다.",
                    "The $ directive text is automatically used as the new project core goal.",
                    "$業務指示の内容が新規プロジェクトのコア目標として自動反映されます。",
                    "$ 指令内容会自动作为新项目核心目标。",
                    "Le texte de la directive devient automatiquement l'objectif du nouveau projet.",
                  )}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onBackToChoose} className="qg-btn">
                {backLabel}
              </button>
              <button
                type="button"
                onClick={onCreateProject}
                disabled={!canCreateProject || projectSaving}
                className="qg-btn qg-btn--primary"
              >
                {projectSaving
                  ? tr("등록 중...", "Creating...", "作成中...", "创建中...", "Création…")
                  : tr("등록 후 선택", "Create & Select", "作成して選択", "创建并选择", "Créer et choisir")}
              </button>
            </div>
          </>
        )}

        {step === "confirm" && selectedProject && (
          <>
            <div className="qg-card">
              <p className="font-semibold text-[var(--th-text-heading)]">{selectedProject.name}</p>
              <p className="qg-text-muted mt-1 break-all text-[13px]">{selectedProject.project_path}</p>
              <p className="qg-text-secondary mt-1">{selectedProject.core_goal}</p>
              {selectedProject.assignment_mode === "manual" && (
                <p className="qg-badge mt-2 !h-auto !whitespace-normal py-1">
                  {tr(
                    `직접 선택 모드 — 지정된 ${selectedProject.assigned_agent_ids?.length ?? 0}명의 직원이 작업합니다`,
                    `Manual mode — ${selectedProject.assigned_agent_ids?.length ?? 0} assigned agents will work on this`,
                    `手動モード — ${selectedProject.assigned_agent_ids?.length ?? 0}名の指定エージェントが作業します`,
                    `手动模式 — ${selectedProject.assigned_agent_ids?.length ?? 0}名指定员工将执行此任务`,
                    `Équipe choisie à la main — ${selectedProject.assigned_agent_ids?.length ?? 0} membre(s) désigné(s) s'en chargent`,
                  )}
                </p>
              )}
            </div>
            <div className="qg-card">
              <p className="font-semibold text-[var(--th-text-heading)]">
                {tr("라운드 목표", "Round Goal", "ラウンド目標", "回合目标", "Objectif de cette demande")}
              </p>
              <p className="qg-text-secondary mt-1 leading-relaxed">
                {tr(
                  `프로젝트 핵심목표(${selectedProject.core_goal})를 기준으로 이번 요청(${pendingContent})을 실행 가능한 산출물로 완수`,
                  `Execute this round with project core goal (${selectedProject.core_goal}) and current request (${pendingContent}).`,
                  `プロジェクト目標(${selectedProject.core_goal})と今回依頼(${pendingContent})を基準に実行可能な成果物を完了します。`,
                  `以项目核心目标（${selectedProject.core_goal}）和本次请求（${pendingContent}）为基础完成本轮可执行产出。`,
                  `Livrer un résultat concret pour cette demande (${pendingContent}), dans le cadre de l'objectif du projet (${selectedProject.core_goal}).`,
                )}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onBackToChoose} className="qg-btn">
                {tr("다시 선택", "Re-select", "再選択", "重新选择", "Changer de projet")}
              </button>
              <button type="button" onClick={onConfirm} className="qg-btn qg-btn--primary">
                {tr("선택 후 전송", "Select & Send", "選択して送信", "选择并发送", "Envoyer")}
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
