import { AlertCircle, FolderOpen, FolderSearch, Info, Pencil, Sparkles, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { LangText } from "../../i18n";
import { isApiRequestError, pickProjectPathNative, type ProjectDetailResponse } from "../../api";
import type { Agent, AssignmentMode, Department, Project } from "../../types";
import type {
  FormFeedback,
  ManualAssignmentWarning,
  MissingPathPrompt,
  ProjectI18nTranslate,
  ProjectManualSelectionStats,
} from "./types";
import ManualAssignmentSelector from "./ManualAssignmentSelector";

interface ProjectEditorPanelProps {
  t: ProjectI18nTranslate;
  language: string;
  isCreating: boolean;
  editingProjectId: string | null;
  selectedProject: Project | null;
  detail: ProjectDetailResponse | null;
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  projectPath: string;
  setProjectPath: Dispatch<SetStateAction<string>>;
  coreGoal: string;
  setCoreGoal: Dispatch<SetStateAction<string>>;
  saving: boolean;
  canSave: boolean;
  pathToolsVisible: boolean;
  pathSuggestionsOpen: boolean;
  setPathSuggestionsOpen: Dispatch<SetStateAction<boolean>>;
  pathSuggestionsLoading: boolean;
  pathSuggestions: string[];
  missingPathPrompt: MissingPathPrompt | null;
  setMissingPathPrompt: Dispatch<SetStateAction<MissingPathPrompt | null>>;
  pathApiUnsupported: boolean;
  setPathApiUnsupported: Dispatch<SetStateAction<boolean>>;
  nativePathPicking: boolean;
  setNativePathPicking: Dispatch<SetStateAction<boolean>>;
  nativePickerUnsupported: boolean;
  setNativePickerUnsupported: Dispatch<SetStateAction<boolean>>;
  setManualPathPickerOpen: Dispatch<SetStateAction<boolean>>;
  loadManualPathEntries: (targetPath?: string) => Promise<void>;
  unsupportedPathApiMessage: string;
  resolvePathHelperErrorMessage: (err: unknown, fallback: LangText) => string;
  formFeedback: FormFeedback | null;
  setFormFeedback: Dispatch<SetStateAction<FormFeedback | null>>;
  assignmentMode: AssignmentMode;
  setAssignmentMode: Dispatch<SetStateAction<AssignmentMode>>;
  setManualAssignmentWarning: Dispatch<SetStateAction<ManualAssignmentWarning | null>>;
  manualSelectionStats: ProjectManualSelectionStats;
  selectedAgentIds: Set<string>;
  setSelectedAgentIds: Dispatch<SetStateAction<Set<string>>>;
  agentFilterDept: string;
  setAgentFilterDept: Dispatch<SetStateAction<string>>;
  agents: Agent[];
  departments: Department[];
  spriteMap: Map<string, number>;
  onSave: () => void;
  onCancelEdit: () => void;
  onStartEditSelected: () => void;
  onDelete: () => void;
}

export default function ProjectEditorPanel({
  t,
  language,
  isCreating,
  editingProjectId,
  selectedProject,
  detail,
  name,
  setName,
  projectPath,
  setProjectPath,
  coreGoal,
  setCoreGoal,
  saving,
  canSave,
  pathToolsVisible,
  pathSuggestionsOpen,
  setPathSuggestionsOpen,
  pathSuggestionsLoading,
  pathSuggestions,
  missingPathPrompt,
  setMissingPathPrompt,
  pathApiUnsupported,
  setPathApiUnsupported,
  nativePathPicking,
  setNativePathPicking,
  nativePickerUnsupported,
  setNativePickerUnsupported,
  setManualPathPickerOpen,
  loadManualPathEntries,
  unsupportedPathApiMessage,
  resolvePathHelperErrorMessage,
  formFeedback,
  setFormFeedback,
  assignmentMode,
  setAssignmentMode,
  setManualAssignmentWarning,
  manualSelectionStats,
  selectedAgentIds,
  setSelectedAgentIds,
  agentFilterDept,
  setAgentFilterDept,
  agents,
  departments,
  spriteMap,
  onSave,
  onCancelEdit,
  onStartEditSelected,
  onDelete,
}: ProjectEditorPanelProps) {
  return (
    <div className="qg-card min-w-0 space-y-4">
      <label className="qg-field">
        <span className="qg-field__label">
          {t({ ko: "프로젝트 이름", en: "Project Name", ja: "プロジェクト名", zh: "项目名称", fr: "Nom du projet" })}
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setFormFeedback(null);
          }}
          disabled={!isCreating && !editingProjectId}
          className="qg-input"
        />
      </label>
      <label className="qg-field">
        <span className="qg-field__label">
          {t({
            ko: "프로젝트 경로",
            en: "Project Path",
            ja: "プロジェクトパス",
            zh: "项目路径",
            fr: "Chemin du projet",
          })}
        </span>
        <input
          type="text"
          value={projectPath}
          onChange={(e) => {
            setProjectPath(e.target.value);
            setMissingPathPrompt(null);
            setFormFeedback(null);
          }}
          disabled={!isCreating && !editingProjectId}
          className="qg-input"
        />
      </label>
      {pathToolsVisible && (
        <div className="space-y-2">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={pathApiUnsupported}
              onClick={() => {
                setFormFeedback(null);
                setManualPathPickerOpen(true);
                void loadManualPathEntries(projectPath.trim() || undefined);
              }}
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
              onClick={() => {
                setFormFeedback(null);
                setPathSuggestionsOpen((prev) => !prev);
              }}
              className="qg-btn qg-btn--sm"
            >
              <Sparkles size={16} aria-hidden />
              {pathSuggestionsOpen
                ? t({
                    ko: "자동 경로찾기 닫기",
                    en: "Close Auto Finder",
                    ja: "自動候補を閉じる",
                    zh: "关闭自动查找",
                    fr: "Fermer les suggestions",
                  })
                : t({
                    ko: "자동 경로찾기",
                    en: "Auto Path Finder",
                    ja: "自動パス検索",
                    zh: "自动路径查找",
                    fr: "Suggestions de chemin",
                  })}
            </button>
            <button
              type="button"
              disabled={nativePathPicking}
              onClick={async () => {
                setNativePickerUnsupported(false);
                setNativePathPicking(true);
                try {
                  const picked = await pickProjectPathNative();
                  if (picked.cancelled || !picked.path) return;
                  setProjectPath(picked.path);
                  setMissingPathPrompt(null);
                  setPathSuggestionsOpen(false);
                  setFormFeedback(null);
                } catch (err) {
                  console.error("Failed to open native path picker:", err);
                  if (isApiRequestError(err) && err.status === 404) {
                    setPathApiUnsupported(true);
                    setFormFeedback({ tone: "info", message: unsupportedPathApiMessage });
                  } else {
                    const message = resolvePathHelperErrorMessage(err, {
                      ko: "운영체제 폴더 선택기를 열지 못했습니다.",
                      en: "Failed to open OS folder picker.",
                      ja: "OSフォルダ選択を開けませんでした。",
                      zh: "无法打开系统文件夹选择器。",
                      fr: "Impossible d’ouvrir le sélecteur de dossiers du système.",
                    });
                    if (
                      isApiRequestError(err) &&
                      (err.code === "native_picker_unavailable" || err.code === "native_picker_failed")
                    ) {
                      setNativePickerUnsupported(true);
                      setManualPathPickerOpen(true);
                      await loadManualPathEntries(projectPath.trim() || undefined);
                      setFormFeedback({ tone: "info", message });
                    } else {
                      setFormFeedback({ tone: "error", message });
                    }
                  }
                } finally {
                  setNativePathPicking(false);
                }
              }}
              className="qg-btn qg-btn--sm"
            >
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
                      fr: "Sélecteur système (indisponible)",
                    })
                  : t({
                      ko: "수동 경로찾기",
                      en: "Manual Path Finder",
                      ja: "手動パス選択",
                      zh: "手动路径选择",
                      fr: "Sélecteur système",
                    })}
            </button>
          </div>
          {pathSuggestionsOpen && (
            <div className="qg-card max-h-40 overflow-y-auto !p-1">
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
                    fr: "Aucune suggestion. Saisir un chemin manuellement.",
                  })}
                </p>
              ) : (
                pathSuggestions.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => {
                      setProjectPath(candidate);
                      setMissingPathPrompt(null);
                      setPathSuggestionsOpen(false);
                      setFormFeedback(null);
                    }}
                    className="qg-choice !min-h-0 !border-transparent !shadow-none text-[13px]"
                  >
                    {candidate}
                  </button>
                ))
              )}
            </div>
          )}
          {missingPathPrompt && (
            <p className="qg-field__hint">
              {t({
                ko: "해당 경로가 아직 존재하지 않습니다. 저장 시 생성 여부를 확인합니다.",
                en: "This path does not exist yet. Save will ask whether to create it.",
                ja: "このパスはまだ存在しません。保存時に作成確認を行います。",
                zh: "该路径尚不存在，保存时会先确认是否创建。",
                fr: "Ce chemin n’existe pas encore. Sa création sera proposée à l’enregistrement.",
              })}
            </p>
          )}
        </div>
      )}
      {formFeedback && (
        <div
          role={formFeedback.tone === "error" ? "alert" : "status"}
          className="qg-card flex items-start gap-2 !py-2 text-[13px]"
        >
          {formFeedback.tone === "error" ? (
            <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0" />
          ) : (
            <Info size={16} aria-hidden className="qg-text-muted mt-0.5 shrink-0" />
          )}
          <span>{formFeedback.message}</span>
        </div>
      )}
      <label className="qg-field">
        <span className="qg-field__label">
          {t({ ko: "핵심 목표", en: "Core Goal", ja: "コア目標", zh: "核心目标", fr: "Objectif principal" })}
        </span>
        <textarea
          rows={5}
          value={coreGoal}
          onChange={(e) => {
            setCoreGoal(e.target.value);
            setFormFeedback(null);
          }}
          disabled={!isCreating && !editingProjectId}
          className="qg-textarea"
        />
      </label>

      <ManualAssignmentSelector
        t={t}
        language={language}
        isCreating={isCreating}
        editingProjectId={editingProjectId}
        assignmentMode={assignmentMode}
        setAssignmentMode={setAssignmentMode}
        setManualAssignmentWarning={setManualAssignmentWarning}
        manualSelectionStats={manualSelectionStats}
        selectedAgentIds={selectedAgentIds}
        setSelectedAgentIds={setSelectedAgentIds}
        agentFilterDept={agentFilterDept}
        setAgentFilterDept={setAgentFilterDept}
        departments={departments}
        agents={agents}
        spriteMap={spriteMap}
        detail={detail}
        selectedProject={selectedProject}
      />

      <div className="flex flex-wrap gap-2 pt-2">
        {(isCreating || !!editingProjectId) && (
          <button
            type="button"
            onClick={() => {
              onSave();
            }}
            disabled={!canSave || saving}
            className="qg-btn qg-btn--primary"
          >
            {editingProjectId
              ? t({ ko: "수정 저장", en: "Save", ja: "保存", zh: "保存", fr: "Enregistrer" })
              : t({ ko: "프로젝트 등록", en: "Create", ja: "作成", zh: "创建", fr: "Créer" })}
          </button>
        )}
        {(isCreating || !!editingProjectId) && (
          <button type="button" onClick={onCancelEdit} className="qg-btn qg-btn--ghost">
            {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消", fr: "Annuler" })}
          </button>
        )}
        <button
          type="button"
          onClick={onStartEditSelected}
          disabled={!selectedProject || isCreating || !!editingProjectId}
          className="qg-btn"
        >
          <Pencil size={16} aria-hidden />
          {t({ ko: "선택 프로젝트 편집", en: "Edit Selected", ja: "選択編集", zh: "编辑选中项", fr: "Modifier" })}
        </button>
        <button type="button" onClick={onDelete} disabled={!selectedProject} className="qg-btn qg-btn--danger">
          <Trash2 size={16} aria-hidden />
          {t({ ko: "삭제", en: "Delete", ja: "削除", zh: "删除", fr: "Supprimer" })}
        </button>
      </div>
    </div>
  );
}
