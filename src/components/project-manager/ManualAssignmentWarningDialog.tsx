import Dialog from "../ui/Dialog";
import type { ManualAssignmentWarning, ProjectI18nTranslate, ProjectManualSelectionStats } from "./types";

const TITLE = {
  ko: "수동 배정 확인",
  en: "Manual Assignment Check",
  ja: "手動割り当て確認",
  zh: "手动分配确认",
  fr: "Vérification de l’affectation manuelle",
};
const CLOSE_LABEL = { ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" };

interface ManualAssignmentWarningDialogProps {
  warning: ManualAssignmentWarning | null;
  stats: ProjectManualSelectionStats;
  t: ProjectI18nTranslate;
  onCancel: () => void;
  onConfirm: (warning: ManualAssignmentWarning) => void;
}

export default function ManualAssignmentWarningDialog({
  warning,
  stats,
  t,
  onCancel,
  onConfirm,
}: ManualAssignmentWarningDialogProps) {
  if (!warning) return null;

  return (
    <Dialog
      open
      size="sm"
      onClose={onCancel}
      closeLabel={t(CLOSE_LABEL)}
      title={t(TITLE)}
      footer={
        <>
          <button type="button" onClick={onCancel} className="qg-btn qg-btn--ghost">
            {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消", fr: "Annuler" })}
          </button>
          <button type="button" onClick={() => onConfirm(warning)} className="qg-btn qg-btn--primary">
            {t({
              ko: "계속 저장",
              en: "Save Anyway",
              ja: "そのまま保存",
              zh: "仍然保存",
              fr: "Enregistrer quand même",
            })}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-sm">
          {warning.reason === "no_agents"
            ? t({
                ko: "직원이 선택되지 않았습니다. 이 상태로 저장하면 수동 모드 안전장치에 따라 팀장이 직접(단독) 실행할 수 있습니다. 계속 저장할까요?",
                en: "No agents are selected. If you save now, the manual-mode safeguard may let team leaders execute tasks directly. Continue?",
                ja: "エージェントが選択されていません。このまま保存すると実行時にチームリーダーが直接対応する可能性があります。続行しますか？",
                zh: "当前未选择员工。若继续保存，运行时可能由组长直接执行。是否继续？",
                fr: "Aucun agent sélectionné. Si vous enregistrez maintenant, les responsables risquent d’exécuter les tâches eux-mêmes. Continuer ?",
              })
            : t({
                ko: "팀장만 선택되어 있습니다. 하위 직원이 없으므로 수동 모드 안전장치에 따라 팀장이 직접(단독) 실행할 수 있습니다. 계속 저장할까요?",
                en: "Only team leaders are selected. Without subordinates, the manual-mode safeguard may let team leaders execute tasks directly. Continue?",
                ja: "チームリーダーのみ選択されています。サブ担当がいない場合、実行時にチームリーダーが直接対応する可能性があります。続行しますか？",
                zh: "当前仅选择了组长。若无下属成员，运行时可能由组长直接执行。是否继续？",
                fr: "Seuls des responsables sont sélectionnés. Sans membres, ils risquent d’exécuter les tâches eux-mêmes. Continuer ?",
              })}
        </p>
        <div className="qg-card qg-text-secondary text-[13px]">
          <p>
            {t({
              ko: "선택 요약",
              en: "Selection Summary",
              ja: "選択サマリー",
              zh: "选择摘要",
              fr: "Récapitulatif de la sélection",
            })}
            : {stats.total}
          </p>
          <p>
            {t({ ko: "팀장", en: "Leaders", ja: "リーダー", zh: "组长", fr: "Responsables" })}: {stats.leaders} ·{" "}
            {t({ ko: "하위 직원", en: "Subordinates", ja: "サブ担当", zh: "下属成员", fr: "Membres" })}:{" "}
            {stats.subordinates}
          </p>
        </div>
      </div>
    </Dialog>
  );
}
