import { ArrowUp, Folder, RefreshCw } from "lucide-react";
import Dialog from "../ui/Dialog";
import type { ManualPathEntry, ProjectI18nTranslate } from "./types";

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
          <button type="button" onClick={onClose} className="qg-btn qg-btn--ghost">
            {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消", fr: "Annuler" })}
          </button>
          <button
            type="button"
            disabled={!manualPathCurrent}
            onClick={onSelectCurrent}
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
            onClick={() => {
              if (!manualPathParent) return;
              void onLoadEntries(manualPathParent);
            }}
            className="qg-btn qg-btn--sm"
          >
            <ArrowUp size={16} aria-hidden />
            {t({ ko: "상위 폴더", en: "Up", ja: "上位フォルダ", zh: "上级目录", fr: "Dossier parent" })}
          </button>
          <button
            type="button"
            disabled={manualPathLoading}
            onClick={() => void onLoadEntries(manualPathCurrent || undefined)}
            className="qg-btn qg-btn--sm"
          >
            <RefreshCw size={16} aria-hidden />
            {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新", fr: "Actualiser" })}
          </button>
        </div>
        <div className="qg-card max-h-[45dvh] overflow-y-auto !p-0">
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
            <p role="alert" className="qg-text-secondary px-3 py-2 text-[13px]">
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
                onClick={() => void onLoadEntries(entry.path)}
                className="flex w-full items-start gap-2 border-b border-[var(--th-border)] px-3 py-2 text-left transition hover:bg-[var(--th-bg-surface-hover)]"
              >
                <Folder size={16} aria-hidden className="qg-text-muted mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{entry.name}</span>
                  <span className="qg-text-muted block truncate text-xs">{entry.path}</span>
                </span>
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
  );
}
