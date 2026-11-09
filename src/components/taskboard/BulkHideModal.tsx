import { useMemo, useState } from "react";
import type { Task } from "../../types";
import { useI18n } from "../../i18n";
import Dialog from "../ui/Dialog";
import { HIDEABLE_STATUSES, isHideableStatus, taskStatusLabel, type HideableStatus } from "./constants";

interface BulkHideModalProps {
  tasks: Task[];
  hiddenTaskIds: Set<string>;
  onClose: () => void;
  onApply: (statuses: HideableStatus[]) => void;
}

export default function BulkHideModal({ tasks, hiddenTaskIds, onClose, onApply }: BulkHideModalProps) {
  const { t } = useI18n();

  const availableCounts = useMemo(() => {
    const counts: Record<HideableStatus, number> = {
      done: 0,
      pending: 0,
      cancelled: 0,
    };
    for (const task of tasks) {
      if (!isHideableStatus(task.status) || hiddenTaskIds.has(task.id)) continue;
      counts[task.status] += 1;
    }
    return counts;
  }, [tasks, hiddenTaskIds]);

  const [selected, setSelected] = useState<Record<HideableStatus, boolean>>({
    done: availableCounts.done > 0,
    pending: availableCounts.pending > 0,
    cancelled: availableCounts.cancelled > 0,
  });

  const selectedStatuses = useMemo(
    () => HIDEABLE_STATUSES.filter((status) => selected[status] && availableCounts[status] > 0),
    [selected, availableCounts],
  );

  const hideTargetCount = useMemo(
    () => selectedStatuses.reduce((count, status) => count + availableCounts[status], 0),
    [selectedStatuses, availableCounts],
  );

  const statusRows = useMemo(
    () =>
      HIDEABLE_STATUSES.map((status) => ({
        status,
        label: taskStatusLabel(status, t),
        count: availableCounts[status],
      })),
    [availableCounts, t],
  );

  return (
    <Dialog
      open
      size="sm"
      onClose={onClose}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
      title={t({
        ko: "숨길 상태 선택",
        en: "Select statuses to hide",
        ja: "非表示にする状態を選択",
        zh: "选择要隐藏的状态",
        fr: "Statuts à masquer",
      })}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
          </button>
          <button
            onClick={() => onApply(selectedStatuses)}
            disabled={hideTargetCount <= 0}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {t({ ko: "숨김 적용", en: "Apply hide", ja: "非表示適用", zh: "应用隐藏" })} ({hideTargetCount})
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs leading-relaxed text-slate-400">
        {t({
          ko: "완료/보류/취소 중 선택한 상태의 업무를 한 번에 숨깁니다.",
          en: "Hide all tasks in the selected done/pending/cancelled statuses at once.",
          ja: "選択した完了/保留/キャンセル状態のタスクを一括で非表示にします。",
          zh: "一次性隐藏所选完成/待处理/已取消状态的任务。",
        })}
      </p>

      <div className="space-y-2">
        {statusRows.map(({ status, label, count }) => (
          <label
            key={status}
            className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 ${
              count > 0
                ? "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-600"
                : "cursor-not-allowed border-slate-800 bg-slate-900/70 text-slate-500"
            }`}
          >
            <span className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected[status]}
                disabled={count <= 0}
                onChange={() => {
                  setSelected((prev) => ({ ...prev, [status]: !prev[status] }));
                }}
                className="h-3.5 w-3.5 rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500"
              />
              {label}
            </span>
            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[11px] text-slate-300">{count}</span>
          </label>
        ))}
      </div>
    </Dialog>
  );
}
