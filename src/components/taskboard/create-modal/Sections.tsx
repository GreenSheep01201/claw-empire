import { useId, type KeyboardEvent, type RefObject } from "react";
import { ChevronDown, ChevronUp, FolderOpen, FolderSearch, Sparkles, Star, TriangleAlert } from "lucide-react";
import type { Agent, Department, Project } from "../../../types";
import AgentSelect from "../../AgentSelect";
import { TASK_TYPE_OPTIONS, priorityLabel, taskTypeLabel, type MissingPathPrompt, type TFunction } from "../constants";

interface PrioritySectionProps {
  priority: number;
  t: TFunction;
  onPriorityChange: (priority: number) => void;
}

export function PrioritySection({ priority, t, onPriorityChange }: PrioritySectionProps) {
  const labelId = useId();
  const level = priorityLabel(priority, t);
  return (
    <div className="qg-field" role="group" aria-labelledby={labelId}>
      <p id={labelId} className="qg-field__label">
        {t({
          ko: `우선순위: ${level} (${priority}/5)`,
          en: `Priority: ${level} (${priority}/5)`,
          ja: `優先度: ${level} (${priority}/5)`,
          zh: `优先级: ${level} (${priority}/5)`,
          fr: `Priorité : ${level.toLocaleLowerCase("fr")} (${priority}/5)`,
        })}
      </p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onPriorityChange(star)}
            aria-pressed={star <= priority}
            aria-label={t({
              ko: `우선순위 ${star}/5`,
              en: `Priority ${star}/5`,
              ja: `優先度 ${star}/5`,
              zh: `优先级 ${star}/5`,
              fr: `Priorité ${star}/5`,
            })}
            className="qg-choice flex-1 justify-center"
          >
            <Star size={16} aria-hidden fill={star <= priority ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
    </div>
  );
}

interface AssigneeSectionProps {
  agents: Agent[];
  departments: Department[];
  departmentId: string;
  assignAgentId: string;
  t: TFunction;
  onAssignAgentChange: (agentId: string) => void;
}

export function AssigneeSection({
  agents,
  departments,
  departmentId,
  assignAgentId,
  t,
  onAssignAgentChange,
}: AssigneeSectionProps) {
  return (
    <div className="qg-field">
      <p className="qg-field__label">
        {t({ ko: "담당 에이전트", en: "Assignee", ja: "担当エージェント", zh: "负责人", fr: "Responsable" })}
      </p>
      <AgentSelect
        agents={agents}
        departments={departments}
        value={assignAgentId}
        onChange={(value) => onAssignAgentChange(value)}
        placeholder={t({
          ko: "-- 미배정 --",
          en: "-- Unassigned --",
          ja: "-- 未割り当て --",
          zh: "-- 未分配 --",
          fr: "Non assignée",
        })}
        size="md"
      />
      {departmentId && agents.length === 0 && (
        <p className="qg-field__hint">
          {t({
            ko: "해당 부서에 에이전트가 없습니다.",
            en: "No agents are available in this department.",
            ja: "この部署にはエージェントがいません。",
            zh: "该部门暂无可用代理。",
            fr: "Aucun agent disponible dans ce pôle.",
          })}
        </p>
      )}
    </div>
  );
}

interface ProjectSectionProps {
  t: TFunction;
  projectPickerRef: RefObject<HTMLDivElement | null>;
  projectQuery: string;
  projectDropdownOpen: boolean;
  projectActiveIndex: number;
  projectsLoading: boolean;
  filteredProjects: Project[];
  selectedProject: Project | null;
  projects: Project[];
  createNewProjectMode: boolean;
  newProjectPath: string;
  pathApiUnsupported: boolean;
  pathSuggestionsOpen: boolean;
  pathSuggestionsLoading: boolean;
  pathSuggestions: string[];
  missingPathPrompt: MissingPathPrompt | null;
  nativePathPicking: boolean;
  nativePickerUnsupported: boolean;
  onProjectQueryChange: (value: string) => void;
  onProjectInputFocus: () => void;
  onProjectInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onToggleProjectDropdown: () => void;
  onSelectProject: (project: Project | null) => void;
  onProjectHover: (projectId: string) => void;
  onEnableCreateNewProject: () => void;
  onNewProjectPathChange: (value: string) => void;
  onOpenManualPathBrowser: () => void;
  onTogglePathSuggestions: () => void;
  onPickNativePath: () => void;
  onSelectPathSuggestion: (path: string) => void;
}

export function ProjectSection({
  t,
  projectPickerRef,
  projectQuery,
  projectDropdownOpen,
  projectActiveIndex,
  projectsLoading,
  filteredProjects,
  selectedProject,
  projects,
  createNewProjectMode,
  newProjectPath,
  pathApiUnsupported,
  pathSuggestionsOpen,
  pathSuggestionsLoading,
  pathSuggestions,
  missingPathPrompt,
  nativePathPicking,
  nativePickerUnsupported,
  onProjectQueryChange,
  onProjectInputFocus,
  onProjectInputKeyDown,
  onToggleProjectDropdown,
  onSelectProject,
  onProjectHover,
  onEnableCreateNewProject,
  onNewProjectPathChange,
  onOpenManualPathBrowser,
  onTogglePathSuggestions,
  onPickNativePath,
  onSelectPathSuggestion,
}: ProjectSectionProps) {
  const fieldId = useId();
  const projectInputId = `${fieldId}-project`;
  const newPathInputId = `${fieldId}-new-path`;
  const toggleLabel = t({
    ko: "프로젝트 목록 토글",
    en: "Toggle project list",
    ja: "プロジェクト一覧の切替",
    zh: "切换项目列表",
    fr: "Afficher ou masquer la liste des projets",
  });
  return (
    <div className="qg-field">
      <label htmlFor={projectInputId} className="qg-field__label">
        {t({ ko: "프로젝트명", en: "Project Name", ja: "プロジェクト名", zh: "项目名", fr: "Nom du projet" })}
      </label>
      <div className="relative" ref={projectPickerRef}>
        <div className="flex items-center gap-2">
          <input
            id={projectInputId}
            type="text"
            value={projectQuery}
            onChange={(event) => onProjectQueryChange(event.target.value)}
            onFocus={onProjectInputFocus}
            onKeyDown={onProjectInputKeyDown}
            placeholder={t({
              ko: "프로젝트 이름 또는 경로 입력",
              en: "Type project name or path",
              ja: "プロジェクト名またはパスを入力",
              zh: "输入项目名称或路径",
              fr: "Saisir le nom ou le chemin du projet",
            })}
            className="qg-input"
          />
          <button
            type="button"
            onClick={onToggleProjectDropdown}
            className="qg-icon-btn shrink-0"
            aria-expanded={projectDropdownOpen}
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            {projectDropdownOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
          </button>
        </div>

        {projectDropdownOpen && (
          <div className="absolute z-20 mt-1 max-h-52 w-full space-y-1 overflow-y-auto rounded-[var(--qg-radius)] border border-[var(--th-border-strong)] bg-[var(--th-bg-surface)] p-1 shadow-[var(--qg-lift-high)]">
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelectProject(null);
              }}
              aria-pressed={selectedProject === null}
              className="qg-choice qg-text-secondary"
            >
              {t({
                ko: "-- 프로젝트 미지정 --",
                en: "-- No project --",
                ja: "-- プロジェクトなし --",
                zh: "-- 无项目 --",
                fr: "Aucun projet",
              })}
            </button>
            {projectsLoading ? (
              <div className="qg-text-muted px-3 py-2 text-sm">
                {t({
                  ko: "프로젝트 불러오는 중...",
                  en: "Loading projects...",
                  ja: "プロジェクトを読み込み中...",
                  zh: "正在加载项目...",
                  fr: "Chargement des projets…",
                })}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="qg-text-secondary flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <p className="pr-2">
                  {t({
                    ko: "신규 프로젝트로 생성할까요?",
                    en: "Create as a new project?",
                    ja: "新規プロジェクトとして作成しますか？",
                    zh: "要创建为新项目吗？",
                    fr: "Créer un nouveau projet ?",
                  })}
                </p>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onEnableCreateNewProject();
                  }}
                  className="qg-btn qg-btn--primary qg-btn--sm ml-auto shrink-0"
                >
                  {t({ ko: "예", en: "Yes", ja: "はい", zh: "是", fr: "Oui" })}
                </button>
              </div>
            ) : (
              filteredProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelectProject(project);
                  }}
                  onMouseEnter={() => onProjectHover(project.id)}
                  aria-pressed={selectedProject?.id === project.id}
                  className={`qg-choice flex-col gap-0.5 ${
                    projectActiveIndex >= 0 && filteredProjects[projectActiveIndex]?.id === project.id
                      ? "ring-2 ring-[var(--th-focus-ring)]"
                      : ""
                  }`}
                >
                  <div className="w-full min-w-0 truncate text-sm">{project.name}</div>
                  <div className="qg-text-muted w-full min-w-0 truncate text-[13px] font-normal">
                    {project.project_path}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selectedProject && <p className="qg-field__hint break-all">{selectedProject.project_path}</p>}

      {createNewProjectMode && !selectedProject && (
        <div className="mt-2 space-y-2">
          <label htmlFor={newPathInputId} className="qg-field__label">
            {t({
              ko: "신규 프로젝트 경로",
              en: "New project path",
              ja: "新規プロジェクトパス",
              zh: "新项目路径",
              fr: "Chemin du nouveau projet",
            })}
          </label>
          <input
            type="text"
            id={newPathInputId}
            value={newProjectPath}
            onChange={(event) => onNewProjectPathChange(event.target.value)}
            placeholder={t({
              ko: "/절대/경로/프로젝트",
              en: "/absolute/path/to/project",
              fr: "/chemin/absolu/du/projet",
            })}
            className="qg-input"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={pathApiUnsupported}
              onClick={onOpenManualPathBrowser}
              className="qg-btn qg-btn--sm"
            >
              <FolderOpen size={16} aria-hidden />
              {t({
                ko: "앱 내 폴더 탐색",
                en: "In-App Folder Browser",
                ja: "アプリ内フォルダ閲覧",
                zh: "应用内文件夹浏览",
                fr: "Parcourir les dossiers",
              })}
            </button>
            <button
              type="button"
              disabled={pathApiUnsupported}
              onClick={onTogglePathSuggestions}
              className="qg-btn qg-btn--sm"
            >
              <Sparkles size={16} aria-hidden />
              {pathSuggestionsOpen
                ? t({
                    ko: "자동 경로찾기 닫기",
                    en: "Close Auto Finder",
                    ja: "自動候補を閉じる",
                    zh: "关闭自动查找",
                    fr: "Masquer les suggestions",
                  })
                : t({
                    ko: "자동 경로찾기",
                    en: "Auto Path Finder",
                    ja: "自動パス検索",
                    zh: "自动路径查找",
                    fr: "Suggestions de chemin",
                  })}
            </button>
            <button type="button" disabled={nativePathPicking} onClick={onPickNativePath} className="qg-btn qg-btn--sm">
              <FolderSearch size={16} aria-hidden />
              {nativePathPicking
                ? t({
                    ko: "수동 경로찾기 여는 중...",
                    en: "Opening Manual Picker...",
                    ja: "手動パス選択を開いています...",
                    zh: "正在打开手动路径选择...",
                    fr: "Ouverture du sélecteur…",
                  })
                : nativePickerUnsupported
                  ? t({
                      ko: "수동 경로찾기(사용불가)",
                      en: "Manual Path Finder (Unavailable)",
                      ja: "手動パス選択（利用不可）",
                      zh: "手动路径选择（不可用）",
                      fr: "Sélecteur du système (indisponible)",
                    })
                  : t({
                      ko: "수동 경로찾기",
                      en: "Manual Path Finder",
                      ja: "手動パス選択",
                      zh: "手动路径选择",
                      fr: "Sélecteur du système",
                    })}
            </button>
          </div>
          {pathSuggestionsOpen && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-[var(--qg-radius)] border border-[var(--th-border)] bg-[var(--th-bg-primary)] p-1">
              {pathSuggestionsLoading ? (
                <p className="qg-text-muted px-3 py-2 text-[13px]">
                  {t({
                    ko: "경로 후보를 불러오는 중...",
                    en: "Loading path suggestions...",
                    ja: "パス候補を読み込み中...",
                    zh: "正在加载路径候选...",
                    fr: "Chargement des suggestions…",
                  })}
                </p>
              ) : pathSuggestions.length === 0 ? (
                <p className="qg-text-muted px-3 py-2 text-[13px]">
                  {t({
                    ko: "추천 경로가 없습니다. 직접 입력해주세요.",
                    en: "No suggested path. Enter one manually.",
                    ja: "候補パスがありません。手入力してください。",
                    zh: "没有推荐路径，请手动输入。",
                    fr: "Aucune suggestion. Saisissez le chemin à la main.",
                  })}
                </p>
              ) : (
                pathSuggestions.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => onSelectPathSuggestion(candidate)}
                    className="qg-choice break-all font-mono text-[13px]"
                  >
                    {candidate}
                  </button>
                ))
              )}
            </div>
          )}
          {missingPathPrompt && (
            <p className="qg-field__hint flex items-start gap-1.5">
              <TriangleAlert size={16} aria-hidden className="mt-px shrink-0" />
              {t({
                ko: "해당 경로가 아직 존재하지 않습니다. 생성 확인 후 진행됩니다.",
                en: "This path does not exist yet. Creation confirmation will be requested.",
                ja: "このパスはまだ存在しません。作成確認後に続行されます。",
                zh: "该路径当前不存在，提交时会先请求创建确认。",
                fr: "Ce chemin n’existe pas encore. Sa création vous sera demandée.",
              })}
            </p>
          )}
          <p className="qg-field__hint">
            {t({
              ko: "설명 항목 내용이 신규 프로젝트의 핵심 목표(core_goal)로 저장됩니다.",
              en: "Description will be saved as the new project core goal.",
              ja: "説明欄の内容が新規プロジェクトのコア目標として保存されます。",
              zh: "说明内容会保存为新项目的核心目标。",
              fr: "La description deviendra l’objectif principal du nouveau projet.",
            })}
          </p>
        </div>
      )}

      {!projectsLoading && projects.length === 0 && (
        <p className="qg-field__hint">
          {t({
            ko: "등록된 프로젝트가 없습니다. 프로젝트 관리에서 먼저 생성해주세요.",
            en: "No registered project. Create one first in Project Manager.",
            ja: "登録済みプロジェクトがありません。先にプロジェクト管理で作成してください。",
            zh: "暂无已注册项目。请先在项目管理中创建。",
            fr: "Aucun projet enregistré. Créez-en un d’abord dans la gestion des projets.",
          })}
        </p>
      )}
    </div>
  );
}
