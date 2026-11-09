import { useState, useRef, useEffect, useMemo } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Agent, Department } from "../types";
import AgentAvatar, { useSpriteMap } from "./AgentAvatar";
import { useI18n, localeName } from "../i18n";
import type { LangText } from "../i18n";

interface AgentSelectProps {
  agents: Agent[];
  departments?: Department[];
  value: string;
  onChange: (agentId: string) => void;
  placeholder?: string;
  size?: "sm" | "md";
  className?: string;
}

const ROLE_LABELS: Record<string, LangText> = {
  team_leader: { ko: "팀장", en: "Team Leader", ja: "チームリーダー", zh: "组长", fr: "Chef d'équipe" },
  senior: { ko: "시니어", en: "Senior", ja: "シニア", zh: "高级", fr: "Senior" },
  junior: { ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级", fr: "Junior" },
  intern: { ko: "인턴", en: "Intern", ja: "インターン", zh: "实习生", fr: "Stagiaire" },
};

export default function AgentSelect({
  agents,
  departments,
  value,
  onChange,
  placeholder,
  size = "sm",
  className = "",
}: AgentSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const spriteMap = useSpriteMap(agents);
  const { t, locale } = useI18n();
  const selected = agents.find((a) => a.id === value);
  const departmentById = useMemo(() => {
    const map = new Map<string, Department>();
    for (const dept of departments ?? []) {
      map.set(dept.id, dept);
    }
    return map;
  }, [departments]);

  const textSize = size === "md" ? "text-sm" : "text-[13px]";
  const minHeight = size === "md" ? "min-h-10" : "min-h-9";
  const avatarSize = size === "md" ? 22 : 18;

  const getAgentName = (agent: Agent) => localeName(locale, agent);

  const getRoleLabel = (role: string) => {
    const label = ROLE_LABELS[role];
    return label ? t(label) : role;
  };

  const getDepartmentLabel = (agent: Agent) => {
    const dept = agent.department ?? (agent.department_id ? departmentById.get(agent.department_id) : undefined);
    if (!dept) return "";
    return localeName(locale, dept);
  };

  const effectivePlaceholder =
    placeholder ??
    t({
      ko: "-- 담당자 없음 --",
      en: "-- Unassigned --",
      ja: "-- 担当者なし --",
      zh: "-- 无负责人 --",
      fr: "Aucun responsable",
    });
  const workingLabel = t({ ko: "작업 중", en: "Working", ja: "作業中", zh: "工作中", fr: "En activité" });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const optionClass = `flex w-full items-center gap-2 px-3 ${minHeight} ${textSize} text-left text-[var(--th-text-primary)] transition-colors hover:bg-[var(--qg-accent-soft)] focus-visible:bg-[var(--qg-accent-soft)] focus-visible:outline-none`;

  return (
    <div
      ref={ref}
      className={`relative ${className}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded-[4px] border border-[var(--th-input-border)] bg-[var(--th-input-bg)] px-2.5 ${minHeight} ${textSize} text-left text-[var(--th-text-primary)] transition-colors focus-visible:border-[var(--th-focus-ring)] focus-visible:outline-2 focus-visible:outline-[var(--th-focus-ring-shadow)]`}
      >
        {selected ? (
          <>
            <AgentAvatar agent={selected} spriteMap={spriteMap} size={avatarSize} />
            <span className="truncate">{getAgentName(selected)}</span>
            <span className="qg-text-muted shrink-0 text-[13px]">({getRoleLabel(selected.role)})</span>
            {getDepartmentLabel(selected) && (
              <span className="qg-text-muted truncate text-[13px]">· {getDepartmentLabel(selected)}</span>
            )}
          </>
        ) : (
          <span className="qg-text-muted truncate">{effectivePlaceholder}</span>
        )}
        <ChevronDown size={16} aria-hidden className="qg-text-muted ml-auto flex-shrink-0" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-[var(--qg-radius)] border border-[var(--th-border-strong)] bg-[var(--th-bg-surface)] py-1 shadow-[var(--qg-lift-high)]">
          {/* None option */}
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            aria-pressed={value === ""}
            className={optionClass}
          >
            <span className="qg-text-muted truncate">{effectivePlaceholder}</span>
          </button>

          {agents.map((a) => {
            const isSelected = a.id === value;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onChange(a.id);
                  setOpen(false);
                }}
                aria-pressed={isSelected}
                className={`${optionClass} ${isSelected ? "bg-[var(--qg-accent-soft)] font-semibold" : ""}`}
              >
                <AgentAvatar agent={a} spriteMap={spriteMap} size={avatarSize} />
                <span className="truncate">{getAgentName(a)}</span>
                <span className="qg-text-muted shrink-0 text-[13px] font-normal">({getRoleLabel(a.role)})</span>
                {getDepartmentLabel(a) && (
                  <span className="qg-text-muted truncate text-[13px] font-normal">· {getDepartmentLabel(a)}</span>
                )}
                <span className="ml-auto flex flex-shrink-0 items-center gap-1.5">
                  {a.status === "working" && (
                    <span
                      className="h-2 w-2 rounded-full bg-[var(--qg-accent)]"
                      role="img"
                      aria-label={workingLabel}
                      title={workingLabel}
                    />
                  )}
                  {isSelected && <Check size={16} aria-hidden className="text-[var(--qg-accent)]" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
