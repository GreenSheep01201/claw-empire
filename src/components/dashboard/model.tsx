import { useEffect, useState } from "react";
import type { UiLanguage } from "../../i18n";

export type Locale = UiLanguage;
export type TFunction = (messages: Record<Locale, string>) => string;

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
      ? t({ ko: "오전 브리핑", en: "Morning Briefing", ja: "午前ブリーフィング", zh: "上午简报" })
      : hour < 18
        ? t({ ko: "오후 운영 점검", en: "Afternoon Ops Check", ja: "午後運用点検", zh: "下午运行检查" })
        : t({ ko: "저녁 마감 점검", en: "Evening Wrap-up", ja: "夜間締め点検", zh: "晚间收尾检查" });

  return { date, time, briefing };
}

export function timeAgo(timestamp: number, localeTag: string): string {
  if (!timestamp || !isFinite(timestamp)) return "—";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (!isFinite(seconds)) return "—";
  const relativeTimeFormat = new Intl.RelativeTimeFormat(localeTag, { numeric: "auto" });
  if (seconds < 60) return relativeTimeFormat.format(-seconds, "second");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return relativeTimeFormat.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relativeTimeFormat.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  return relativeTimeFormat.format(-days, "day");
}

export const RANK_TIERS = [
  { name: "BRONZE", nameKo: "브론즈", minXp: 0, color: "#CD7F32", glow: "rgba(205,127,50,0.35)", icon: "⚔️" },
  { name: "SILVER", nameKo: "실버", minXp: 100, color: "#C0C0C0", glow: "rgba(192,192,192,0.35)", icon: "🛡️" },
  { name: "GOLD", nameKo: "골드", minXp: 500, color: "#FFD700", glow: "rgba(255,215,0,0.35)", icon: "⭐" },
  {
    name: "PLATINUM",
    nameKo: "플래티넘",
    minXp: 2000,
    color: "#00c8b4",
    glow: "rgba(0,200,180,0.35)",
    icon: "💎",
  },
  { name: "DIAMOND", nameKo: "다이아", minXp: 5000, color: "#7df9ff", glow: "rgba(125,249,255,0.35)", icon: "💠" },
  { name: "MASTER", nameKo: "마스터", minXp: 15000, color: "#c45ff6", glow: "rgba(196,95,246,0.35)", icon: "👑" },
];

export function getRankTier(xp: number) {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (xp >= RANK_TIERS[i].minXp) return { ...RANK_TIERS[i], level: i };
  }
  return { ...RANK_TIERS[0], level: 0 };
}

export const STATUS_LABELS: Record<string, { color: string; dot: string }> = {
  inbox: { color: "bg-slate-500/20 text-slate-200 border-slate-400/30", dot: "bg-slate-400" },
  planned: { color: "bg-blue-500/20 text-blue-100 border-blue-400/30", dot: "bg-blue-400" },
  in_progress: { color: "bg-amber-500/20 text-amber-100 border-amber-400/30", dot: "bg-amber-400" },
  review: { color: "bg-violet-500/20 text-violet-100 border-violet-400/30", dot: "bg-violet-400" },
  done: { color: "bg-emerald-500/20 text-emerald-100 border-emerald-400/30", dot: "bg-emerald-400" },
  pending: { color: "bg-orange-500/20 text-orange-100 border-orange-400/30", dot: "bg-orange-400" },
  cancelled: { color: "bg-rose-500/20 text-rose-100 border-rose-400/30", dot: "bg-rose-400" },
};

export const STATUS_LEFT_BORDER: Record<string, string> = {
  inbox: "border-l-slate-400",
  planned: "border-l-blue-400",
  in_progress: "border-l-amber-400",
  review: "border-l-violet-400",
  done: "border-l-emerald-400",
  pending: "border-l-orange-400",
  cancelled: "border-l-rose-400",
};

export function taskStatusLabel(status: string, t: TFunction) {
  switch (status) {
    case "inbox":
      return t({ ko: "수신함", en: "Inbox", ja: "受信箱", zh: "收件箱" });
    case "planned":
      return t({ ko: "계획됨", en: "Planned", ja: "計画済み", zh: "已计划" });
    case "in_progress":
      return t({ ko: "진행 중", en: "In Progress", ja: "進行中", zh: "进行中" });
    case "review":
      return t({ ko: "검토 중", en: "Review", ja: "レビュー", zh: "审核" });
    case "done":
      return t({ ko: "완료", en: "Done", ja: "完了", zh: "完成" });
    case "pending":
      return t({ ko: "보류", en: "Pending", ja: "保留", zh: "待处理" });
    case "cancelled":
      return t({ ko: "취소됨", en: "Cancelled", ja: "キャンセル", zh: "已取消" });
    default:
      return status;
  }
}

export const DEPT_COLORS = [
  { bar: "from-blue-500 to-cyan-400", badge: "bg-blue-500/20 text-blue-200 border-blue-400/30" },
  { bar: "from-violet-500 to-fuchsia-400", badge: "bg-violet-500/20 text-violet-200 border-violet-400/30" },
  { bar: "from-emerald-500 to-teal-400", badge: "bg-emerald-500/20 text-emerald-200 border-emerald-400/30" },
  { bar: "from-amber-500 to-orange-400", badge: "bg-amber-500/20 text-amber-100 border-amber-400/30" },
  { bar: "from-rose-500 to-pink-400", badge: "bg-rose-500/20 text-rose-100 border-rose-400/30" },
  { bar: "from-cyan-500 to-sky-400", badge: "bg-cyan-500/20 text-cyan-100 border-cyan-400/30" },
  { bar: "from-orange-500 to-red-400", badge: "bg-orange-500/20 text-orange-100 border-orange-400/30" },
  { bar: "from-teal-500 to-lime-400", badge: "bg-teal-500/20 text-teal-100 border-teal-400/30" },
];

export function XpBar({ xp, maxXp, color }: { xp: number; maxXp: number; color: string }) {
  const pct = maxXp > 0 ? Math.min(100, Math.round((xp / maxXp) * 100)) : 0;
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.04]">
      <div
        className="xp-bar-fill h-full rounded-full transition-all duration-1000 ease-out"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          boxShadow: `0 0 8px ${color}60`,
        }}
      />
    </div>
  );
}

export function RankBadge({ xp, size = "md" }: { xp: number; size?: "sm" | "md" | "lg" }) {
  const tier = getRankTier(xp);
  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[8px] gap-0.5",
    md: "px-2 py-0.5 text-[10px] gap-1",
    lg: "px-3 py-1 text-xs gap-1",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md font-black uppercase tracking-wider ${sizeClasses[size]}`}
      style={{
        background: tier.glow,
        color: tier.color,
        border: `1px solid ${tier.color}50`,
        boxShadow: `0 0 8px ${tier.glow}`,
        textShadow: `0 0 6px ${tier.glow}`,
      }}
    >
      {tier.icon} {tier.name}
    </span>
  );
}
