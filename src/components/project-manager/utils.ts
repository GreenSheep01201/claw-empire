import type { ProjectDecisionEventItem } from "../../api";
import type { ProjectI18nTranslate } from "./types";

export function fmtTime(ts: number | null | undefined): string {
  if (!ts) return "-";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function getDecisionEventLabel(
  eventType: ProjectDecisionEventItem["event_type"],
  t: ProjectI18nTranslate,
): string {
  switch (eventType) {
    case "planning_summary":
      return t({
        ko: "기획 요약",
        en: "Planning Summary",
        ja: "企画要約",
        zh: "规划摘要",
        fr: "Synthèse Planification",
      });
    case "representative_pick":
      return t({ ko: "대표 선택", en: "Representative Pick", ja: "代表選択", zh: "代表选择", fr: "Choix validé" });
    case "followup_request":
      return t({
        ko: "추가 요청",
        en: "Follow-up Request",
        ja: "追加依頼",
        zh: "追加请求",
        fr: "Demande complémentaire",
      });
    case "start_review_meeting":
      return t({
        ko: "검토 회의 시작",
        en: "Review Meeting Started",
        ja: "レビュー会議開始",
        zh: "评审会议开始",
        fr: "Réunion de relecture lancée",
      });
    default:
      return eventType;
  }
}
