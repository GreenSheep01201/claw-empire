import { useI18n, type LangText, type UiLanguage } from "../../i18n";
import { useEffect, useState } from "react";

export type Locale = UiLanguage;
export type TFunction = (messages: LangText) => string;

export function useNow(localeTag: string, t: TFunction) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const date = now.toLocaleDateString(localeTag, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const time = now.toLocaleTimeString(localeTag, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const hour = now.getHours();
  const briefing =
    hour < 12
      ? t({ ko: "오전 브리핑", en: "Morning Briefing", ja: "午前ブリーフィング", zh: "上午简报", fr: "Point du matin" })
      : hour < 18
        ? t({
            ko: "오후 운영 점검",
            en: "Afternoon Ops Check",
            ja: "午後運用点検",
            zh: "下午运行检查",
            fr: "Point de l'après-midi",
          })
        : t({
            ko: "저녁 마감 점검",
            en: "Evening Wrap-up",
            ja: "夜間締め点検",
            zh: "晚间收尾检查",
            fr: "Bilan du soir",
          });

  return { date, time, briefing };
}

export function timeAgo(timestamp: number, localeTag: string): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  const relativeTimeFormat = new Intl.RelativeTimeFormat(localeTag, { numeric: "auto" });
  if (seconds < 60) return relativeTimeFormat.format(-seconds, "second");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return relativeTimeFormat.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relativeTimeFormat.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  return relativeTimeFormat.format(-days, "day");
}

export const RANK_TIERS: Array<{ name: string; label: LangText; minXp: number }> = [
  { name: "BRONZE", label: { ko: "브론즈", en: "Bronze", ja: "ブロンズ", zh: "青铜", fr: "Bronze" }, minXp: 0 },
  { name: "SILVER", label: { ko: "실버", en: "Silver", ja: "シルバー", zh: "白银", fr: "Argent" }, minXp: 100 },
  { name: "GOLD", label: { ko: "골드", en: "Gold", ja: "ゴールド", zh: "黄金", fr: "Or" }, minXp: 500 },
  {
    name: "PLATINUM",
    label: { ko: "플래티넘", en: "Platinum", ja: "プラチナ", zh: "铂金", fr: "Platine" },
    minXp: 2000,
  },
  { name: "DIAMOND", label: { ko: "다이아", en: "Diamond", ja: "ダイヤ", zh: "钻石", fr: "Diamant" }, minXp: 5000 },
  { name: "MASTER", label: { ko: "마스터", en: "Master", ja: "マスター", zh: "大师", fr: "Maître" }, minXp: 15000 },
];

export function getRankTier(xp: number) {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (xp >= RANK_TIERS[i].minXp) return { ...RANK_TIERS[i], level: i };
  }
  return { ...RANK_TIERS[0], level: 0 };
}

/** Badge variant per task status: green = finished, red = waiting for the owner's approval. */
export function taskStatusBadgeClass(status: string): string {
  if (status === "done") return "qg-badge qg-badge--accent";
  if (status === "review") return "qg-badge qg-badge--pin";
  return "qg-badge";
}

export function taskStatusLabel(status: string, t: TFunction) {
  switch (status) {
    case "inbox":
      return t({ ko: "수신함", en: "Inbox", ja: "受信箱", zh: "收件箱", fr: "Reçue" });
    case "planned":
      return t({ ko: "계획됨", en: "Planned", ja: "計画済み", zh: "已计划", fr: "Planifiée" });
    case "in_progress":
      return t({ ko: "진행 중", en: "In Progress", ja: "進行中", zh: "进行中", fr: "En cours" });
    case "review":
      return t({ ko: "검토 중", en: "Review", ja: "レビュー", zh: "审核", fr: "À valider" });
    case "done":
      return t({ ko: "완료", en: "Done", ja: "完了", zh: "完成", fr: "Terminée" });
    case "pending":
      return t({ ko: "보류", en: "Pending", ja: "保留", zh: "待处理", fr: "En attente" });
    case "cancelled":
      return t({ ko: "취소됨", en: "Cancelled", ja: "キャンセル", zh: "已取消", fr: "Annulée" });
    default:
      return status;
  }
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full"
      style={{ background: "var(--th-bg-surface-hover)" }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%`, background: "var(--qg-accent)" }}
      />
    </div>
  );
}

export function XpBar({ xp, maxXp }: { xp: number; maxXp: number }) {
  return <ProgressBar value={xp} max={maxXp} />;
}

export function RankBadge({ xp }: { xp: number }) {
  const { t } = useI18n();
  const tier = getRankTier(xp);
  return <span className={tier.level >= 3 ? "qg-badge qg-badge--accent" : "qg-badge"}>{t(tier.label)}</span>;
}
