import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Building2, LayoutDashboard, ListChecks, PanelLeft, Settings, Users } from "lucide-react";
import type { Department, Agent, CompanySettings } from "../types";
import type { View } from "../app/types";
import { useI18n, localeName, type LangText } from "../i18n";

interface SidebarProps {
  currentView: View;
  onChangeView: (v: View) => void;
  departments: Department[];
  agents: Agent[];
  settings: CompanySettings;
  connected: boolean;
}

type NavItem = { view: View; icon: LucideIcon; label: LangText };

const MAIN_NAV: NavItem[] = [
  {
    view: "office",
    icon: Building2,
    label: { ko: "오피스", en: "Office", ja: "オフィス", zh: "办公室", fr: "Bureau" },
  },
  {
    view: "tasks",
    icon: ListChecks,
    label: { ko: "업무 관리", en: "Tasks", ja: "タスク管理", zh: "任务管理", fr: "Tâches" },
  },
  { view: "agents", icon: Users, label: { ko: "직원관리", en: "Team", ja: "社員管理", zh: "员工管理", fr: "Équipe" } },
  {
    view: "dashboard",
    icon: LayoutDashboard,
    label: { ko: "대시보드", en: "Dashboard", ja: "ダッシュボード", zh: "仪表盘", fr: "Tableau de bord" },
  },
  {
    view: "skills",
    icon: BookOpen,
    label: { ko: "문서고", en: "Skills", ja: "ライブラリ", zh: "文档库", fr: "Compétences" },
  },
];

const SETTINGS_NAV: NavItem = {
  view: "settings",
  icon: Settings,
  label: { ko: "설정", en: "Settings", ja: "設定", zh: "设置", fr: "Réglages" },
};

export default function Sidebar({ currentView, onChangeView, departments, agents, settings, connected }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { t, locale } = useI18n();

  const renderNavItem = ({ view, icon: Icon, label }: NavItem) => {
    const text = t(label);
    return (
      <button
        key={view}
        onClick={() => onChangeView(view)}
        className="qg-nav__item"
        aria-current={currentView === view ? "page" : undefined}
        aria-label={collapsed ? text : undefined}
        title={collapsed ? text : undefined}
      >
        <Icon size={18} aria-hidden />
        {!collapsed && <span>{text}</span>}
      </button>
    );
  };

  const workingTotal = agents.filter((a) => a.status === "working").length;
  const polesLabel = t({ ko: "부서", en: "Poles", ja: "部門", zh: "部门", fr: "Pôles" });

  return (
    <aside className={`qg-sidebar${collapsed ? " is-collapsed" : ""}`}>
      <div className="qg-sidebar__brand">
        <span className="qg-wordmark" aria-hidden>
          QG
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <div className="qg-sidebar__company">{settings.companyName}</div>
            <div className="qg-sidebar__ceo">
              {t({ ko: "CEO", en: "CEO", fr: "CEO" })} · {settings.ceoName}
            </div>
          </div>
        )}
      </div>

      <nav
        className="qg-nav"
        aria-label={t({
          ko: "주 메뉴",
          en: "Main navigation",
          ja: "メインメニュー",
          zh: "主导航",
          fr: "Navigation principale",
        })}
      >
        {MAIN_NAV.map(renderNavItem)}
      </nav>

      {!collapsed && departments.length > 0 && (
        <section className="qg-poles">
          <h2 className="qg-poles__title">{polesLabel}</h2>
          <ul className="qg-poles__list" aria-label={polesLabel}>
            {departments.map((d) => {
              const members = agents.filter((a) => a.department_id === d.id);
              const working = members.filter((a) => a.status === "working").length;
              const activity = t({
                ko: `활성 ${working}/${members.length}`,
                en: `${working} of ${members.length} agents active`,
                fr: `${working} agent${working > 1 ? "s" : ""} actif${working > 1 ? "s" : ""} sur ${members.length}`,
              });
              return (
                <li key={d.id} className="qg-pole">
                  <span className="qg-pole__tape" style={{ background: d.color }} aria-hidden />
                  <span className="qg-pole__name">{localeName(locale, d)}</span>
                  <span className={`qg-pole__count${working > 0 ? " is-active" : ""}`} aria-label={activity}>
                    <span className="qg-mark" aria-hidden />
                    {working}/{members.length}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="qg-sidebar__footer">
        {renderNavItem(SETTINGS_NAV)}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="qg-nav__item"
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? t({ ko: "메뉴 펼치기", en: "Expand menu", fr: "Déplier le menu" })
              : t({ ko: "메뉴 접기", en: "Collapse menu", fr: "Replier le menu" })
          }
        >
          <PanelLeft size={18} aria-hidden />
          {!collapsed && <span>{t({ ko: "메뉴 접기", en: "Collapse", fr: "Replier" })}</span>}
        </button>
        <div className={`qg-status${connected ? " is-live" : ""}`} role="status">
          <span className="qg-status__mark" aria-hidden />
          {!collapsed && (
            <span className="qg-status__label">
              {connected
                ? t({ ko: "연결됨", en: "Online", fr: "En ligne" })
                : t({ ko: "연결 끊김", en: "Offline", fr: "Hors ligne" })}{" "}
              · {workingTotal}/{agents.length} {t({ ko: "근무중", en: "working", fr: "au travail" })}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
