import { useState, useRef, useEffect, useMemo } from "react";
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
  team_leader: { ko: "팀장", en: "Team Leader", ja: "チームリーダー", zh: "组长" },
  senior: { ko: "시니어", en: "Senior", ja: "シニア", zh: "高级" },
  junior: { ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级" },
  intern: { ko: "인턴", en: "Intern", ja: "インターン", zh: "实习" },
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

  const getAgentName = (agent: Agent) => localeName(locale, agent);

  const sortedAgents = useMemo(() => {
    const roleOrder: Record<string, number> = {
      team_leader: 0,
      senior: 1,
      junior: 2,
      intern: 3,
    };

    return [...agents].sort((a, b) => {
      const roleDiff = (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99);
      if (roleDiff !== 0) return roleDiff;
      return getAgentName(a).localeCompare(getAgentName(b));
    });
  }, [agents, locale]);

  const textSize = size === "md" ? "text-sm" : "text-xs";
  const padY = size === "md" ? "py-2" : "py-1";
  const avatarSize = size === "md" ? 22 : 18;

  const tr = (ko: string, en: string, ja = en, zh = en) => t({ ko, en, ja, zh });

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
    placeholder ?? tr("-- 미배정 --", "-- Unassigned --", "-- 未割り当て --", "-- 未分配 --");

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-2 ${padY} rounded-lg border border-slate-600 bg-slate-700 ${textSize} text-slate-300 outline-none transition hover:border-slate-500 focus:border-blue-500`}
      >
        {selected ? (
          <>
            <AgentAvatar agent={selected} spriteMap={spriteMap} size={avatarSize} />
            <span className="truncate">{getAgentName(selected)}</span>
            <span className="text-slate-500 text-[10px]">({getRoleLabel(selected.role)})</span>
            {getDepartmentLabel(selected) && (
              <span className="text-slate-500 text-[10px]">· {getDepartmentLabel(selected)}</span>
            )}
          </>
        ) : (
          <span className="text-slate-500">{effectivePlaceholder}</span>
        )}
        <svg
          className="ml-auto w-3 h-3 text-slate-500 flex-shrink-0"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-slate-600 bg-slate-800 shadow-xl">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={`w-full flex items-center gap-2 px-2 ${padY} ${textSize} text-slate-500 hover:bg-slate-700 transition-colors`}
          >
            {effectivePlaceholder}
          </button>

          {sortedAgents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                onChange(a.id);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2 ${padY} ${textSize} transition-colors ${
                a.id === value ? "bg-blue-600/20 text-blue-300" : "text-slate-300 hover:bg-slate-700"
              }`}
            >
              <AgentAvatar agent={a} spriteMap={spriteMap} size={avatarSize} />
              <span className="truncate">{getAgentName(a)}</span>
              <span className="text-slate-500 text-[10px]">({getRoleLabel(a.role)})</span>
              {getDepartmentLabel(a) && <span className="text-slate-500 text-[10px]">· {getDepartmentLabel(a)}</span>}
              {a.status === "working" && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
