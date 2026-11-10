import { useEffect, useRef } from "react";
import { Activity, Ellipsis, FileText, LoaderCircle, MapPin, Megaphone, Menu, Moon, Ruler, Sun } from "lucide-react";
import type { WorkflowPackKey } from "../types";

type OfficePackOption = {
  key: WorkflowPackKey;
  label: string;
  summary: string;
  slug: string;
  accent: number;
};

export interface AppHeaderLabels {
  openNavigation: string;
  decisions: string;
  announcement: string;
  more: string;
  agentStatus: string;
  reports: string;
  roomManager: string;
  themeToLight: string;
  themeToDark: string;
  live: string;
  offline: string;
}

interface AppHeaderBarProps {
  connected: boolean;
  viewTitle: string;
  labels: AppHeaderLabels;
  decisionInboxLoading: boolean;
  decisionInboxCount: number;
  officePackControl?: {
    label: string;
    value: WorkflowPackKey;
    options: OfficePackOption[];
    onChange: (packKey: WorkflowPackKey) => void;
  } | null;
  theme: "light" | "dark";
  menuOpen: boolean;
  onOpenMobileNav: () => void;
  onOpenDecisionInbox: () => void;
  onOpenAgentStatus: () => void;
  onOpenReportHistory: () => void;
  onOpenAnnouncement: () => void;
  onOpenRoomManager: () => void;
  onToggleTheme: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
}

const ICON_SIZE = 18;

export default function AppHeaderBar({
  connected,
  viewTitle,
  labels,
  decisionInboxLoading,
  decisionInboxCount,
  officePackControl,
  theme,
  menuOpen,
  onOpenMobileNav,
  onOpenDecisionInbox,
  onOpenAgentStatus,
  onOpenReportHistory,
  onOpenAnnouncement,
  onOpenRoomManager,
  onToggleTheme,
  onToggleMenu,
  onCloseMenu,
}: AppHeaderBarProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasPending = decisionInboxCount > 0;

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onCloseMenu();
      triggerRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onCloseMenu();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen, onCloseMenu]);

  const runAndClose = (action: () => void) => () => {
    action();
    onCloseMenu();
  };

  return (
    <header className="qg-header">
      <div className="qg-header__lead">
        <button
          onClick={onOpenMobileNav}
          className="qg-icon-btn qg-header__nav-toggle"
          aria-label={labels.openNavigation}
        >
          <Menu size={ICON_SIZE} aria-hidden />
        </button>
        <h1 className="qg-header__title">{viewTitle}</h1>
      </div>

      <div className="qg-header__actions">
        <button
          onClick={onOpenDecisionInbox}
          disabled={decisionInboxLoading}
          className={`qg-btn qg-btn--pin qg-header__wide-only${hasPending ? " is-pending" : ""}`}
          aria-label={hasPending ? `${labels.decisions} (${decisionInboxCount})` : labels.decisions}
        >
          {decisionInboxLoading ? (
            <LoaderCircle size={ICON_SIZE} className="animate-spin" aria-hidden />
          ) : (
            <MapPin size={ICON_SIZE} aria-hidden />
          )}
          <span className="qg-btn__label">{labels.decisions}</span>
          {hasPending && (
            <span className="qg-pin-count" aria-hidden>
              {decisionInboxCount}
            </span>
          )}
        </button>

        <button
          onClick={onOpenAnnouncement}
          className="qg-btn qg-btn--primary qg-header__wide-only"
          aria-label={labels.announcement}
        >
          <Megaphone size={ICON_SIZE} aria-hidden />
          <span className="qg-btn__label">{labels.announcement}</span>
        </button>

        <div className="qg-menu" ref={menuRef}>
          <button
            ref={triggerRef}
            onClick={onToggleMenu}
            className="qg-icon-btn"
            aria-label={labels.more}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <Ellipsis size={ICON_SIZE} aria-hidden />
          </button>
          {menuOpen && (
            <div className="qg-menu__panel" role="menu" aria-label={labels.more}>
              <button role="menuitem" className="qg-menu__item" onClick={runAndClose(onOpenAgentStatus)}>
                <Activity size={16} aria-hidden />
                {labels.agentStatus}
              </button>
              <button role="menuitem" className="qg-menu__item" onClick={runAndClose(onOpenReportHistory)}>
                <FileText size={16} aria-hidden />
                {labels.reports}
              </button>
              <button role="menuitem" className="qg-menu__item" onClick={runAndClose(onOpenRoomManager)}>
                <Ruler size={16} aria-hidden />
                {labels.roomManager}
              </button>
              <button role="menuitem" className="qg-menu__item" onClick={runAndClose(onToggleTheme)}>
                {theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
                {theme === "dark" ? labels.themeToLight : labels.themeToDark}
              </button>
              {officePackControl && (
                <div className="qg-menu__field">
                  <label htmlFor="office-pack-selector" className="qg-field__label">
                    {officePackControl.label}
                  </label>
                  <select
                    id="office-pack-selector"
                    value={officePackControl.value}
                    onChange={(e) => {
                      officePackControl.onChange(e.target.value as WorkflowPackKey);
                      onCloseMenu();
                    }}
                    className="qg-select"
                  >
                    {officePackControl.options.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.slug} · {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        <span className={`qg-status${connected ? " is-live" : ""}`} role="status">
          <span className="qg-status__mark" aria-hidden />
          <span className="qg-status__label">{connected ? labels.live : labels.offline}</span>
        </span>
      </div>
    </header>
  );
}
