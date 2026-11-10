import { LOCALE_TEXT, pickLocale, type SupportedLocale } from "./themes-locale";

function formatReset(iso: string, locale: SupportedLocale): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return pickLocale(locale, LOCALE_TEXT.soon);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) {
    if (locale === "ko") return `${h}시간 ${m}분`;
    if (locale === "ja") return `${h}時間 ${m}分`;
    if (locale === "zh") return `${h}小时 ${m}分`;
    return `${h}h ${m}m`;
  }
  if (locale === "ko") return `${m}분`;
  if (locale === "ja") return `${m}分`;
  if (locale === "zh") return `${m}分`;
  return `${m}m`;
}

export { formatReset };
