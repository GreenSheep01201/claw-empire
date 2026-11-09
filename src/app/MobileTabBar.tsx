import type { LucideIcon } from "lucide-react";
import { Building2, ListChecks, MapPin, Megaphone, Menu } from "lucide-react";
import type { View } from "./types";

export interface MobileTabBarLabels {
  tabs: string;
  office: string;
  tasks: string;
  announce: string;
  decisions: string;
  menu: string;
}

interface MobileTabBarProps {
  currentView: View;
  labels: MobileTabBarLabels;
  decisionCount: number;
  onChangeView: (view: View) => void;
  onOpenAnnouncement: () => void;
  onOpenDecisionInbox: () => void;
  onOpenMenu: () => void;
}

interface TabProps {
  icon: LucideIcon;
  label: string;
  accessibleName?: string;
  current?: boolean;
  variant?: "primary" | "pin";
  badge?: number;
  onClick: () => void;
}

function Tab({ icon: Icon, label, accessibleName, current, variant, badge, onClick }: TabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`qg-tab${variant ? ` qg-tab--${variant}` : ""}`}
      aria-current={current ? "page" : undefined}
      aria-label={accessibleName}
    >
      <span className="qg-tab__icon">
        <Icon size={20} aria-hidden />
        {badge ? (
          <span className="qg-tab__badge" aria-hidden>
            {badge}
          </span>
        ) : null}
      </span>
      <span className="qg-tab__label" aria-hidden={accessibleName ? true : undefined}>
        {label}
      </span>
    </button>
  );
}

/** Phone navigation: the two daily views, the announce action, approvals, and the full menu. */
export default function MobileTabBar({
  currentView,
  labels,
  decisionCount,
  onChangeView,
  onOpenAnnouncement,
  onOpenDecisionInbox,
  onOpenMenu,
}: MobileTabBarProps) {
  return (
    <nav className="qg-tabbar" aria-label={labels.tabs}>
      <Tab
        icon={Building2}
        label={labels.office}
        current={currentView === "office"}
        onClick={() => onChangeView("office")}
      />
      <Tab
        icon={ListChecks}
        label={labels.tasks}
        current={currentView === "tasks"}
        onClick={() => onChangeView("tasks")}
      />
      <Tab icon={Megaphone} label={labels.announce} variant="primary" onClick={onOpenAnnouncement} />
      <Tab
        icon={MapPin}
        label={labels.decisions}
        accessibleName={decisionCount > 0 ? `${labels.decisions} (${decisionCount})` : undefined}
        variant="pin"
        badge={decisionCount}
        onClick={onOpenDecisionInbox}
      />
      <Tab icon={Menu} label={labels.menu} onClick={onOpenMenu} />
    </nav>
  );
}
