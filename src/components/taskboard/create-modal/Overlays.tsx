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
            <button
              type="button"
              onClick={onCloseRestorePrompt}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              {t({ ko: "새로 작성", en: "Start Fresh", ja: "新規作成", zh: "重新填写" })}
            </button>
            <button
              type="button"
              onClick={onLoadSelectedRestoreDraft}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
            >
              {t({ ko: "불러오기", en: "Load", ja: "読み込み", zh: "加载" })}
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-sm text-slate-200">
            {t({
              ko: "기존에 입력하던 데이터가 있습니다. 불러오시겠습니까?",
              en: "There is previously entered data. Would you like to load it?",
              ja: "以前入力していたデータがあります。読み込みますか？",
              zh: "检测到之前输入的数据，是否加载？",
            })}
          </p>
          <p className="text-xs text-slate-400">
            {t({
              ko: "최근 임시 항목 (최대 3개)",
              en: "Recent drafts (up to 3)",
              ja: "最近の下書き（最大3件）",
              zh: "最近草稿（最多3个）",
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
                  className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                    isSelected
                      ? "border-blue-500 bg-blue-500/15"
                      : "border-slate-700 bg-slate-800/70 hover:bg-slate-800"
                  }`}
                >
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {draft.title ||
                      t({
                        ko: "(제목 없음)",
                        en: "(Untitled)",
                        ja: "(無題)",
                        zh: "（无标题）",
                      })}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
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
            <button
              type="button"
              onClick={onCloseSubmitWithoutProjectPrompt}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
            </button>
            <button
              type="button"
              onClick={onConfirmSubmitWithoutProject}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
            >
              {t({ ko: "계속", en: "Continue", ja: "続行", zh: "继续" })}
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-sm text-slate-200">
            {t({
              ko: "프로젝트 연결 없이 업무를 생성하시겠습니까?",
              en: "Create this task without a project link?",
              ja: "プロジェクト未連携でタスクを作成しますか？",
              zh: "要在不关联项目的情况下创建任务吗？",
            })}
          </p>
          <p className="text-xs text-slate-400">
            {t({
              ko: "이 경우 프로젝트 이력에는 집계되지 않습니다.",
              en: "It will not appear in project history.",
              ja: "この場合、プロジェクト履歴には集計されません。",
              zh: "该任务不会出现在项目历史中。",
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
            <button
              type="button"
              onClick={onCloseMissingPathPrompt}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
            </button>
            <button
              type="button"
              disabled={!missingPathPrompt?.canCreate || submitBusy}
              onClick={onConfirmCreateMissingPath}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t({ ko: "예", en: "Yes", ja: "はい", zh: "是" })}
            </button>
          </>
        }
      >
        {missingPathPrompt && (
          <div className="space-y-2">
            <p className="text-sm text-slate-200">
              {t({
                ko: "해당 경로가 없습니다. 추가하시겠습니까?",
                en: "This path does not exist. Create it now?",
                ja: "このパスは存在しません。作成しますか？",
                zh: "该路径不存在。现在创建吗？",
              })}
            </p>
            <p className="break-all rounded-md border border-slate-700 bg-slate-800/70 px-2.5 py-2 text-xs text-slate-200">
              {missingPathPrompt.normalizedPath}
            </p>
            {missingPathPrompt.nearestExistingParent && (
              <p className="text-xs text-slate-400">
                {t({
                  ko: `기준 폴더: ${missingPathPrompt.nearestExistingParent}`,
                  en: `Base folder: ${missingPathPrompt.nearestExistingParent}`,
                  ja: `基準フォルダ: ${missingPathPrompt.nearestExistingParent}`,
                  zh: `基准目录：${missingPathPrompt.nearestExistingParent}`,
                })}
              </p>
            )}
            {!missingPathPrompt.canCreate && (
              <p className="text-xs text-amber-300">
                {t({
                  ko: "현재 권한으로 해당 경로를 생성할 수 없습니다. 다른 경로를 선택해주세요.",
                  en: "This path is not creatable with current permissions. Choose another path.",
                  ja: "現在の権限ではこのパスを作成できません。別のパスを指定してください。",
                  zh: "当前权限无法创建此路径，请选择其他路径。",
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
            <button
              type="button"
              onClick={onCloseManualPathPicker}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
            </button>
            <button
              type="button"
              disabled={!manualPathCurrent}
              onClick={onSelectManualCurrentPath}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t({
                ko: "현재 폴더 선택",
                en: "Select Current Folder",
                ja: "現在フォルダを選択",
                zh: "选择当前文件夹",
              })}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2">
            <p className="text-[11px] text-slate-400">
              {t({ ko: "현재 위치", en: "Current Location", ja: "現在位置", zh: "当前位置" })}
            </p>
            <p className="break-all text-xs text-slate-200">{manualPathCurrent || "-"}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!manualPathParent || manualPathLoading}
              onClick={onManualPathGoUp}
              className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t({ ko: "상위 폴더", en: "Up", ja: "上位フォルダ", zh: "上级目录" })}
            </button>
            <button
              type="button"
              disabled={manualPathLoading}
              onClick={onManualPathRefresh}
              className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新" })}
            </button>
          </div>
          <div className="max-h-[45dvh] overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/50">
            {manualPathLoading ? (
              <p className="px-3 py-2 text-xs text-slate-400">
                {t({
                  ko: "폴더 목록을 불러오는 중...",
                  en: "Loading directories...",
                  ja: "フォルダ一覧を読み込み中...",
                  zh: "正在加载目录...",
                })}
              </p>
            ) : manualPathError ? (
              <p className="px-3 py-2 text-xs text-rose-300">{manualPathError}</p>
            ) : manualPathEntries.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">
                {t({
                  ko: "선택 가능한 하위 폴더가 없습니다.",
                  en: "No selectable subdirectories.",
                  ja: "選択可能なサブディレクトリがありません。",
                  zh: "没有可选的子目录。",
                })}
              </p>
            ) : (
              manualPathEntries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => onOpenManualPathEntry(entry.path)}
                  className="w-full border-b border-slate-700/70 px-3 py-2 text-left transition hover:bg-slate-700/60"
                >
                  <p className="text-xs font-semibold text-slate-100">{entry.name}</p>
                  <p className="truncate text-[11px] text-slate-400">{entry.path}</p>
                </button>
              ))
            )}
          </div>
          {manualPathTruncated && (
            <p className="text-[11px] text-slate-400">
              {t({
                ko: "항목이 많아 상위 300개 폴더만 표시했습니다.",
                en: "Only the first 300 directories are shown.",
                ja: "項目数が多いため先頭300件のみ表示しています。",
                zh: "目录过多，仅显示前300个。",
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
            className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t({ ko: "전체 삭제", en: "Delete All", ja: "すべて削除", zh: "全部删除" })}
          </button>
        }
      >
        <div className="space-y-2">
          {drafts.length === 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-4 text-center text-sm text-slate-400">
              {t({
                ko: "저장된 임시 항목이 없습니다.",
                en: "No temporary drafts saved.",
                ja: "保存された一時項目はありません。",
                zh: "没有已保存的临时草稿。",
              })}
            </div>
          ) : (
            drafts.map((draft) => (
              <div key={draft.id} className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {draft.title ||
                        t({
                          ko: "(제목 없음)",
                          en: "(Untitled)",
                          ja: "(無題)",
                          zh: "（无标题）",
                        })}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {formatDraftTimestamp(draft.updatedAt)} · {timeAgo(draft.updatedAt, localeTag)}
                    </p>
                    {draft.description.trim() && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-300">{draft.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onLoadDraft(draft)}
                      className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-blue-500"
                    >
                      {t({ ko: "불러오기", en: "Load", ja: "読み込み", zh: "加载" })}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteDraft(draft.id)}
                      className="rounded-md border border-red-500/70 px-2.5 py-1 text-xs font-semibold text-red-300 transition hover:bg-red-500/10"
                    >
                      {t({ ko: "삭제", en: "Delete", ja: "削除", zh: "删除" })}
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
