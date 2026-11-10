import { KeyRound, MessagesSquare, Plug, SlidersHorizontal, TerminalSquare, type LucideIcon } from "lucide-react";
import type { SettingsTab, TFunction } from "./types";

interface SettingsTabNavProps {
  tab: SettingsTab;
  setTab: (tab: SettingsTab) => void;
  t: TFunction;
}

const TAB_ITEMS: Array<{ key: SettingsTab; icon: LucideIcon; label: (t: TFunction) => string }> = [
  {
    key: "general",
    icon: SlidersHorizontal,
    label: (t) => t({ ko: "일반 설정", en: "General", ja: "一般設定", zh: "常规设置", fr: "Général" }),
  },
  {
    key: "cli",
    icon: TerminalSquare,
    label: (t) => t({ ko: "CLI 도구", en: "CLI Tools", ja: "CLI ツール", zh: "CLI 工具", fr: "Outils CLI" }),
  },
  {
    key: "oauth",
    icon: KeyRound,
    label: (t) => t({ ko: "OAuth 인증", en: "OAuth", ja: "OAuth 認証", zh: "OAuth 认证", fr: "Comptes OAuth" }),
  },
  {
    key: "api",
    icon: Plug,
    label: (t) => t({ ko: "API 연동", en: "API", ja: "API 連携", zh: "API 集成", fr: "Clés API" }),
  },
  {
    key: "gateway",
    icon: MessagesSquare,
    label: (t) => t({ ko: "채널 메시지", en: "Channel", ja: "チャネル", zh: "频道", fr: "Messageries" }),
  },
];

export default function SettingsTabNav({ tab, setTab, t }: SettingsTabNavProps) {
  return (
    <nav
      aria-label={t({ ko: "설정 섹션", en: "Settings sections", fr: "Sections des réglages" })}
      className="flex flex-wrap gap-2"
    >
      {TAB_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={tab === item.key}
            onClick={() => setTab(item.key)}
            className="qg-choice"
            style={{ width: "auto" }}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{item.label(t)}</span>
          </button>
        );
      })}
    </nav>
  );
}
