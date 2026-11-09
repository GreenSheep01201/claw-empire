import Dialog from "../ui/Dialog";
import type { ManualPathEntry, ProjectI18nTranslate } from "./types";

// Kept outside the call so the fr entry passes ProjectI18nTranslate's ko/en/ja/zh map.
const TITLE = {
  ko: "앱 내 폴더 탐색",
  en: "In-App Folder Browser",
  ja: "アプリ内フォルダ閲覧",
  zh: "应用内文件夹浏览",
  fr: "Parcourir les dossiers",
};
const CLOSE_LABEL = { ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" };

interface ManualPathPickerDialogProps {
  open: boolean;
  t: ProjectI18nTranslate;
  manualPathCurrent: string;
  manualPathParent: string | null;
  manualPathEntries: ManualPathEntry[];
  manualPathLoading: boolean;
  manualPathError: string | null;
  manualPathTruncated: boolean;
  onClose: () => void;
  onLoadEntries: (targetPath?: string) => Promise<void>;
  onSelectCurrent: () => void;
}

export default function ManualPathPickerDialog({
  open,
  t,
  manualPathCurrent,
  manualPathParent,
  manualPathEntries,
  manualPathLoading,
  manualPathError,
  manualPathTruncated,
  onClose,
  onLoadEntries,
  onSelectCurrent,
}: ManualPathPickerDialogProps) {
  if (!open) return null;

  return (
    <Dialog
      open={open}
      size="md"
      onClose={onClose}
      closeLabel={t(CLOSE_LABEL)}
      title={t(TITLE)}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
          </button>
          <button
            type="button"
            disabled={!manualPathCurrent}
            onClick={onSelectCurrent}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t({ ko: "현재 폴더 선택", en: "Select Current Folder", ja: "現在フォルダを選択", zh: "选择当前文件夹" })}
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
            onClick={() => {
              if (!manualPathParent) return;
              void onLoadEntries(manualPathParent);
            }}
            className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t({ ko: "상위 폴더", en: "Up", ja: "上位フォルダ", zh: "上级目录" })}
          </button>
          <button
            type="button"
            disabled={manualPathLoading}
            onClick={() => void onLoadEntries(manualPathCurrent || undefined)}
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
                onClick={() => void onLoadEntries(entry.path)}
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
  );
}
