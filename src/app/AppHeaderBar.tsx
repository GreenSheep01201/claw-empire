import type { WorkflowPackKey } from "../types";
import type { View } from "./types";

type OfficePackOption = {
  key: WorkflowPackKey;
  label: string;
  summary: string;
  slug: string;
  accent: number;
};

interface AppHeaderBarProps {
  currentView: View;
  connected: boolean;
  viewTitle: string;
  tasksPrimaryLabel: string;
  decisionLabel: string;
  decisionInboxLoading: boolean;
  decisionInboxCount: number;
  agentStatusLabel: string;
  reportLabel: string;
  announcementLabel: string;
  roomManagerLabel: string;
  officePackControl?: {
    label: string;
    value: WorkflowPackKey;
    options: OfficePackOption[];
    onChange: (packKey: WorkflowPackKey) => void;
  } | null;
  theme: "light" | "dark";
  mobileHeaderMenuOpen: boolean;
  onOpenMobileNav: () => void;
  onOpenTasks: () => void;
  onOpenDecisionInbox: () => void;
  onOpenAgentStatus: () => void;
  onOpenReportHistory: () => void;
  onOpenAnnouncement: () => void;
  onOpenRoomManager: () => void;
  onToggleTheme: () => void;
  onToggleMobileHeaderMenu: () => void;
  onCloseMobileHeaderMenu: () => void;
}

export default function AppHeaderBar({
  currentView,
  connected,
  viewTitle,
  tasksPrimaryLabel,
  decisionLabel,
  decisionInboxLoading,
  decisionInboxCount,
  agentStatusLabel,
  reportLabel,
  announcementLabel,
  roomManagerLabel,
  officePackControl,
  theme,
  mobileHeaderMenuOpen,
  onOpenMobileNav,
  onOpenTasks,
  onOpenDecisionInbox,
  onOpenAgentStatus,
  onOpenReportHistory,
  onOpenAnnouncement,
  onOpenRoomManager,
  onToggleTheme,
  onToggleMobileHeaderMenu,
  onCloseMobileHeaderMenu,
}: AppHeaderBarProps) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-3 py-2 backdrop-blur-sm sm:px-4 sm:py-3 lg:px-6"
      style={{ borderBottom: "1px solid var(--th-border)", background: "var(--th-bg-header)" }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onOpenMobileNav}
          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition lg:hidden"
          style={{
            border: "1px solid var(--th-border)",
            background: "var(--th-bg-surface)",
            color: "var(--th-text-secondary)",
          }}
          aria-label="Open navigation"
        >
          ☰
        </button>
        <h1
          className="truncate text-base font-bold sm:text-lg flex items-center gap-2"
          style={{ color: "var(--th-text-heading)" }}
        >
          {currentView === "agents" && (
            <span className="relative inline-flex items-center" style={{ width: 30, height: 22 }}>
              <img
                src="/sprites/8-D-1.png"
                alt=""
                className="absolute left-0 top-0 w-5 h-5 rounded-full object-cover"
                style={{ imageRendering: "pixelated", opacity: 0.85 }}
              />
              <img
                src="/sprites/3-D-1.png"
                alt=""
                className="absolute left-2.5 top-0.5 w-5 h-5 rounded-full object-cover"
                style={{ imageRendering: "pixelated", zIndex: 1 }}
              />
            </span>
          )}
          <span className="truncate">{viewTitle}</span>
        </h1>
        {officePackControl && (
          <label
            className="hidden xl:flex items-center gap-2 rounded-lg px-2 py-1"
            style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}
          >
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--th-text-muted)" }}>
              {officePackControl.label}
            </span>
            <select
              value={officePackControl.value}
              onChange={(e) => officePackControl.onChange(e.target.value as WorkflowPackKey)}
              className="min-w-[170px] bg-transparent text-xs font-medium focus:outline-none"
              style={{ color: "var(--th-text-primary)" }}
            >
              {officePackControl.options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.slug} · {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onOpenTasks}
          className="header-action-btn header-action-btn-primary"
          aria-label={tasksPrimaryLabel}
        >
          <span className="sm:hidden">📋</span>
          <span className="hidden sm:inline">📋 {tasksPrimaryLabel}</span>
        </button>
        <button
          onClick={onOpenDecisionInbox}
          disabled={decisionInboxLoading}
          className={`header-action-btn header-action-btn-secondary disabled:cursor-wait disabled:opacity-60${
            decisionInboxCount > 0 ? " decision-has-pending" : ""
          }`}
          aria-label={decisionLabel}
        >
          <span className="sm:hidden">{decisionInboxLoading ? "⏳" : "🧭"}</span>
          <span className="hidden sm:inline">
            {decisionInboxLoading ? "⏳" : "🧭"} {decisionLabel}
          </span>
          {decisionInboxCount > 0 && <span className="header-decision-badge">{decisionInboxCount}</span>}
        </button>
        <button onClick={onOpenAgentStatus} className="header-action-btn header-action-btn-secondary mobile-hidden">
          &#x1F6E0; {agentStatusLabel}
        </button>
        <button onClick={onOpenReportHistory} className="header-action-btn header-action-btn-secondary mobile-hidden">
          {reportLabel}
        </button>
        <button onClick={onOpenAnnouncement} className="header-action-btn header-action-btn-secondary">
          <span className="sm:hidden">📢</span>
          <span className="hidden sm:inline">{announcementLabel}</span>
        </button>
        <button onClick={onOpenRoomManager} className="header-action-btn header-action-btn-secondary mobile-hidden">
          {roomManagerLabel}
        </button>
        <button
          onClick={onToggleTheme}
          className="theme-toggle-btn"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "ライトモード" : "ダークモード"}
        >
          <span className="theme-toggle-icon">
            {theme === "dark" ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </span>
        </button>
        <div className="relative sm:hidden">
          <button
            onClick={onToggleMobileHeaderMenu}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition"
            style={{
              border: "1px solid var(--th-border)",
              background: "var(--th-bg-surface)",
              color: "var(--th-text-secondary)",
            }}
            aria-label="その他メニュー"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>
          {mobileHeaderMenuOpen && (
            <>
              <button className="fixed inset-0 z-40" onClick={onCloseMobileHeaderMenu} aria-label="Close menu" />
              <div
                className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg py-1 shadow-lg"
                style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}
              >
                {officePackControl && (
                  <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--th-border)" }}>
                    <label
                      htmlFor="mobile-office-pack-selector"
                      className="mb-1 block text-[10px] uppercase tracking-wider"
                      style={{ color: "var(--th-text-muted)" }}
                    >
                      {officePackControl.label}
                    </label>
                    <select
                      id="mobile-office-pack-selector"
                      value={officePackControl.value}
                      onChange={(e) => {
                        officePackControl.onChange(e.target.value as WorkflowPackKey);
                        onCloseMobileHeaderMenu();
                      }}
                      className="w-full rounded-md px-2 py-1.5 text-xs focus:outline-none"
                      style={{
                        border: "1px solid var(--th-border)",
                        background: "var(--th-bg-elevated)",
                        color: "var(--th-text-primary)",
                      }}
                    >
                      {officePackControl.options.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.slug} · {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  onClick={() => {
                    onOpenAgentStatus();
                    onCloseMobileHeaderMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:opacity-80"
                  style={{ color: "var(--th-text-primary)" }}
                >
                  &#x1F6E0; {agentStatusLabel}
                </button>
                <button
                  onClick={() => {
                    onOpenReportHistory();
                    onCloseMobileHeaderMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:opacity-80"
                  style={{ color: "var(--th-text-primary)" }}
                >
                  {reportLabel}
                </button>
                <button
                  onClick={() => {
                    onOpenRoomManager();
                    onCloseMobileHeaderMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:opacity-80"
                  style={{ color: "var(--th-text-primary)" }}
                >
                  {roomManagerLabel}
                </button>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--th-text-muted)" }}>
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="hidden sm:inline">{connected ? "Live" : "Offline"}</span>
        </div>
      </div>
    </header>
  );
}
