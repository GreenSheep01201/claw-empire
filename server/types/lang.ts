export type Lang = "ko" | "en" | "ja" | "zh";

export const SUPPORTED_LANGS: readonly Lang[] = ["ko", "en", "ja", "zh"] as const;

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && SUPPORTED_LANGS.includes(value as Lang);
}
