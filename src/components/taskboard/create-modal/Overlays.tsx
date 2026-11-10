import { ArrowUp, Folder, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import Dialog from "../../ui/Dialog";
import { timeAgo } from "../constants";
import type { CreateTaskModalOverlaysProps } from "./overlay-types";

export default function CreateTaskModalOverlays({
  t,
  localeTag,
  restorePromptOpen,
  selectedRestoreDraft,
  restoreCandidates,
  selectedRestoreDraftId,
  formatDraftTimestamp,
  submitWithoutProjectPromptOpen,
  missingPathPrompt,
  submitBusy,
  manualPathPickerOpen,
  manualPathLoading,
  manualPathCurrent,
  manualPathParent,
  manualPathEntries,
  manualPathTruncated,
  manualPathError,
  draftModalOpen,
  drafts,
  onSelectRestoreDraft,
  onCloseRestorePrompt,
  onLoadSelectedRestoreDraft,
  onCloseSubmitWithoutProjectPrompt,
  onConfirmSubmitWithoutProject,
  onCloseMissingPathPrompt,
  onConfirmCreateMissingPath,
  onCloseManualPathPicker,
  onManualPathGoUp,
  onManualPathRefresh,
  onOpenManualPathEntry,
  onSelectManualCurrentPath,
  onCloseDraftModal,
  onLoadDraft,
  onDeleteDraft,
  onClearDrafts,
}: CreateTaskModalOverlaysProps) {
  const closeLabel = t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" });

  return (
    <>
      <Dialog
        open={restorePromptOpen && selectedRestoreDraft !== null}
        size="sm"
        onClose={onCloseRestorePrompt}
        closeLabel={closeLabel}
        title={t({
          ko: "임시 데이터 복구",
          en: "Restore Draft",
          ja: "下書き復元",
          zh: "恢复草稿",
          fr: "Restaurer un brouillon",
        })}
        footer={
          <>
            <button type="button" onClick={onCloseRestorePrompt} className="qg-btn qg-btn--ghost">
              {t({ ko: "새로 작성", en: "Start Fresh", ja: "新規作成", zh: "重新填写", fr: "Repartir de zéro" })}
            </button>
            <button type="button" onClick={onLoadSelectedRestoreDraft} className="qg-btn qg-btn--primary">
              {t({ ko: "불러오기", en: "Load", ja: "読み込み", zh: "加载", fr: "Reprendre" })}
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-sm">
            {t({
              ko: "기존에 입력하던 데이터가 있습니다. 불러오시겠습니까?",
              en: "There is previously entered data. Would you like to load it?",
              ja: "以前入力していたデータがあります。読み込みますか？",
              zh: "检测到之前输入的数据，是否加载？",
              fr: "Une saisie précédente a été conservée. Voulez-vous la reprendre ?",
            })}
          </p>
          <p className="qg-field__hint">
            {t({
              ko: "최근 임시 항목 (최대 3개)",
              en: "Recent drafts (up to 3)",
              ja: "最近の下書き（最大3件）",
              zh: "最近草稿（最多3个）",
              fr: "Brouillons récents (3 au maximum)",
            })}
          </p>
          <div className="space-y-2">
            {restoreCandidates.map((draft) => {
              const isSelected = selectedRestoreDraftId === draft.id;
              return (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => onSelectRestoreDraft(draft.id)}
                  aria-pressed={isSelected}
                  className="qg-choice flex-col gap-0.5"
                >
                  <p className="w-full min-w-0 truncate text-sm font-semibold">
                    {draft.title ||
                      t({
                        ko: "(제목 없음)",
                        en: "(Untitled)",
                        ja: "(無題)",
                        zh: "（无标题）",
                        fr: "(Sans titre)",
                      })}
                  </p>
                  <p className="qg-text-muted w-full text-[13px] font-normal">
                    {formatDraftTimestamp(draft.updatedAt)} · {timeAgo(draft.updatedAt, localeTag)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={submitWithoutProjectPromptOpen}
        size="sm"
        onClose={onCloseSubmitWithoutProjectPrompt}
        closeLabel={closeLabel}
        title={t({
          ko: "프로젝트 연결 없이 생성",
          en: "Create Without Project",
          ja: "プロジェクト未連携で作成",
          zh: "不关联项目创建",
          fr: "Créer sans projet",
        })}
        footer={
          <>
            <button type="button" onClick={onCloseSubmitWithoutProjectPrompt} className="qg-btn qg-btn--ghost">
              {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消", fr: "Annuler" })}
            </button>
            <button type="button" onClick={onConfirmSubmitWithoutProject} className="qg-btn qg-btn--primary">
              {t({ ko: "계속", en: "Continue", ja: "続行", zh: "继续", fr: "Continuer" })}
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-sm">
            {t({
              ko: "프로젝트 연결 없이 업무를 생성하시겠습니까?",
              en: "Create this task without a project link?",
              ja: "プロジェクト未連携でタスクを作成しますか？",
              zh: "要在不关联项目的情况下创建任务吗？",
              fr: "Créer cette tâche sans la rattacher à un projet ?",
            })}
          </p>
          <p className="qg-field__hint">
            {t({
              ko: "이 경우 프로젝트 이력에는 집계되지 않습니다.",
              en: "It will not appear in project history.",
              ja: "この場合、プロジェクト履歴には集計されません。",
              zh: "该任务不会出现在项目历史中。",
              fr: "Elle n’apparaîtra pas dans l’historique du projet.",
            })}
          </p>
        </div>
      </Dialog>

      <Dialog
        open={missingPathPrompt !== null}
        size="sm"
        onClose={onCloseMissingPathPrompt}
        closeLabel={closeLabel}
        title={t({
          ko: "프로젝트 경로 확인",
          en: "Confirm Project Path",
          ja: "プロジェクトパス確認",
          zh: "确认项目路径",
          fr: "Confirmer le chemin",
        })}
        footer={
          <>
            <button type="button" onClick={onCloseMissingPathPrompt} className="qg-btn qg-btn--ghost">
              {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消", fr: "Annuler" })}
            </button>
            <button
              type="button"
              disabled={!missingPathPrompt?.canCreate || submitBusy}
              onClick={onConfirmCreateMissingPath}
              className="qg-btn qg-btn--primary"
            >
              {t({ ko: "예", en: "Yes", ja: "はい", zh: "是", fr: "Oui" })}
            </button>
          </>
        }
      >
        {missingPathPrompt && (
          <div className="space-y-2">
            <p className="text-sm">
              {t({
                ko: "해당 경로가 없습니다. 추가하시겠습니까?",
                en: "This path does not exist. Create it now?",
                ja: "このパスは存在しません。作成しますか？",
                zh: "该路径不存在。现在创建吗？",
                fr: "Ce chemin n’existe pas. Le créer maintenant ?",
              })}
            </p>
            <p className="qg-card break-all font-mono text-[13px]">{missingPathPrompt.normalizedPath}</p>
            {missingPathPrompt.nearestExistingParent && (
              <p className="qg-field__hint">
                {t({
                  ko: `기준 폴더: ${missingPathPrompt.nearestExistingParent}`,
                  en: `Base folder: ${missingPathPrompt.nearestExistingParent}`,
                  ja: `基準フォルダ: ${missingPathPrompt.nearestExistingParent}`,
                  zh: `基准目录：${missingPathPrompt.nearestExistingParent}`,
                  fr: `Dossier de base : ${missingPathPrompt.nearestExistingParent}`,
                })}
              </p>
            )}
            {!missingPathPrompt.canCreate && (
              <p className="qg-field__hint flex items-start gap-1.5">
                <TriangleAlert size={16} aria-hidden className="mt-px shrink-0" />
                {t({
                  ko: "현재 권한으로 해당 경로를 생성할 수 없습니다. 다른 경로를 선택해주세요.",
                  en: "This path is not creatable with current permissions. Choose another path.",
                  ja: "現在の権限ではこのパスを作成できません。別のパスを指定してください。",
                  zh: "当前权限无法创建此路径，请选择其他路径。",
                  fr: "Vos droits actuels ne permettent pas de créer ce chemin. Choisissez-en un autre.",
                })}
              </p>
            )}
          </div>
        )}
      </Dialog>

      <Dialog
        open={manualPathPickerOpen}
        size="md"
        onClose={onCloseManualPathPicker}
        closeLabel={closeLabel}
        title={t({
          ko: "앱 내 폴더 탐색",
          en: "In-App Folder Browser",
          ja: "アプリ内フォルダ閲覧",
          zh: "应用内文件夹浏览",
          fr: "Parcourir les dossiers",
        })}
        footer={
          <>
            <button type="button" onClick={onCloseManualPathPicker} className="qg-btn qg-btn--ghost">
              {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消", fr: "Annuler" })}
            </button>
            <button
              type="button"
              disabled={!manualPathCurrent}
              onClick={onSelectManualCurrentPath}
              className="qg-btn qg-btn--primary"
            >
              {t({
                ko: "현재 폴더 선택",
                en: "Select Current Folder",
                ja: "現在フォルダを選択",
                zh: "选择当前文件夹",
                fr: "Choisir ce dossier",
              })}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="qg-card">
            <p className="qg-field__label">
              {t({ ko: "현재 위치", en: "Current Location", ja: "現在位置", zh: "当前位置", fr: "Emplacement actuel" })}
            </p>
            <p className="mt-1 break-all font-mono text-[13px]">{manualPathCurrent || "-"}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!manualPathParent || manualPathLoading}
              onClick={onManualPathGoUp}
              className="qg-btn qg-btn--sm"
            >
              <ArrowUp size={16} aria-hidden />
              {t({ ko: "상위 폴더", en: "Up", ja: "上位フォルダ", zh: "上级目录", fr: "Dossier parent" })}
            </button>
            <button
              type="button"
              disabled={manualPathLoading}
              onClick={onManualPathRefresh}
              className="qg-btn qg-btn--sm"
            >
              <RefreshCw size={16} aria-hidden />
              {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新", fr: "Actualiser" })}
            </button>
          </div>
          <div className="max-h-[45dvh] space-y-1 overflow-y-auto rounded-[var(--qg-radius)] border border-[var(--th-border)] bg-[var(--th-bg-primary)] p-1">
            {manualPathLoading ? (
              <p className="qg-text-muted px-3 py-2 text-[13px]">
                {t({
                  ko: "폴더 목록을 불러오는 중...",
                  en: "Loading directories...",
                  ja: "フォルダ一覧を読み込み中...",
                  zh: "正在加载目录...",
                  fr: "Chargement des dossiers…",
                })}
              </p>
            ) : manualPathError ? (
              <p className="qg-field__error px-3 py-2" role="alert">
                {manualPathError}
              </p>
            ) : manualPathEntries.length === 0 ? (
              <p className="qg-text-muted px-3 py-2 text-[13px]">
                {t({
                  ko: "선택 가능한 하위 폴더가 없습니다.",
                  en: "No selectable subdirectories.",
                  ja: "選択可能なサブディレクトリがありません。",
                  zh: "没有可选的子目录。",
                  fr: "Aucun sous-dossier disponible.",
                })}
              </p>
            ) : (
              manualPathEntries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => onOpenManualPathEntry(entry.path)}
                  className="qg-choice flex-col gap-0.5"
                >
                  <span className="flex w-full min-w-0 items-center gap-2 text-sm">
                    <Folder size={16} aria-hidden className="shrink-0" />
                    <span className="truncate">{entry.name}</span>
                  </span>
                  <span className="qg-text-muted w-full min-w-0 truncate text-[13px] font-normal">{entry.path}</span>
                </button>
              ))
            )}
          </div>
          {manualPathTruncated && (
            <p className="qg-field__hint">
              {t({
                ko: "항목이 많아 상위 300개 폴더만 표시했습니다.",
                en: "Only the first 300 directories are shown.",
                ja: "項目数が多いため先頭300件のみ表示しています。",
                zh: "目录过多，仅显示前300个。",
                fr: "Seuls les 300 premiers dossiers sont affichés.",
              })}
            </p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={draftModalOpen}
        size="md"
        onClose={onCloseDraftModal}
        closeLabel={closeLabel}
        title={t({
          ko: "임시 저장 목록",
          en: "Temporary Drafts",
          ja: "一時保存一覧",
          zh: "临时草稿列表",
          fr: "Brouillons",
        })}
        titleAdornment={<span className="qg-count">{drafts.length}</span>}
        footer={
          <button
            type="button"
            onClick={onClearDrafts}
            disabled={drafts.length === 0}
            className="qg-btn qg-btn--danger"
          >
            <Trash2 size={16} aria-hidden />
            {t({ ko: "전체 삭제", en: "Delete All", ja: "すべて削除", zh: "全部删除", fr: "Tout supprimer" })}
          </button>
        }
      >
        <div className="space-y-2">
          {drafts.length === 0 ? (
            <div className="qg-empty">
              {t({
                ko: "저장된 임시 항목이 없습니다.",
                en: "No temporary drafts saved.",
                ja: "保存された一時項目はありません。",
                zh: "没有已保存的临时草稿。",
                fr: "Aucun brouillon enregistré.",
              })}
            </div>
          ) : (
            drafts.map((draft) => (
              <div key={draft.id} className="qg-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="w-full min-w-0 truncate text-sm font-semibold">
                      {draft.title ||
                        t({
                          ko: "(제목 없음)",
                          en: "(Untitled)",
                          ja: "(無題)",
                          zh: "（无标题）",
                          fr: "(Sans titre)",
                        })}
                    </p>
                    <p className="qg-text-muted w-full text-[13px] font-normal">
                      {formatDraftTimestamp(draft.updatedAt)} · {timeAgo(draft.updatedAt, localeTag)}
                    </p>
                    {draft.description.trim() && (
                      <p className="qg-text-secondary mt-1 line-clamp-2 text-[13px]">{draft.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onLoadDraft(draft)}
                      className="qg-btn qg-btn--primary qg-btn--sm"
                    >
                      {t({ ko: "불러오기", en: "Load", ja: "読み込み", zh: "加载", fr: "Reprendre" })}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteDraft(draft.id)}
                      className="qg-btn qg-btn--danger qg-btn--sm"
                    >
                      {t({ ko: "삭제", en: "Delete", ja: "削除", zh: "删除", fr: "Supprimer" })}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Dialog>
    </>
  );
}
