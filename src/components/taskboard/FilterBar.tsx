import type { Agent, Department } from "../../types";
import { Search } from "lucide-react";
import { localeName, useI18n } from "../../i18n";
import AgentSelect from "../AgentSelect";
import { TASK_TYPE_OPTIONS, taskTypeLabel } from "./constants";

interface FilterBarProps {
  agents: Agent[];
  departments: Department[];
  filterDept: string;
  filterAgent: string;
  filterType: string;
  search: string;
  onFilterDept: (value: string) => void;
  onFilterAgent: (value: string) => void;
  onFilterType: (value: string) => void;
  onSearch: (value: string) => void;
}

export default function FilterBar({
  agents,
  departments,
  filterDept,
  filterAgent,
  filterType,
  search,
  onFilterDept,
  onFilterAgent,
  onFilterType,
  onSearch,
}: FilterBarProps) {
  const { t, language: locale } = useI18n();

  const searchLabel = t({
    ko: "업무 검색...",
    en: "Search tasks...",
    ja: "タスク検索...",
    zh: "搜索任务...",
    fr: "Rechercher une tâche…",
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[160px] flex-1 sm:min-w-[220px]">
        <Search
          size={16}
          aria-hidden
          className="qg-text-muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={searchLabel}
          aria-label={searchLabel}
          className="qg-input"
          style={{ paddingLeft: 36 }}
        />
      </div>

      <select
        value={filterDept}
        onChange={(event) => onFilterDept(event.target.value)}
        aria-label={t({ ko: "부서", en: "Department", ja: "部署", zh: "部门", fr: "Pôle" })}
        className="qg-select"
      >
        <option value="">
          {t({ ko: "전체 부서", en: "All Departments", ja: "全部署", zh: "全部门", fr: "Tous les pôles" })}
        </option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {localeName(locale, department)}
          </option>
        ))}
      </select>

      <AgentSelect
        agents={agents}
        departments={departments}
        value={filterAgent}
        onChange={onFilterAgent}
        placeholder={t({
          ko: "전체 에이전트",
          en: "All Agents",
          ja: "全エージェント",
          zh: "全部代理",
          fr: "Tous les agents",
        })}
        size="md"
        className="min-w-[200px]"
      />

      <select
        value={filterType}
        onChange={(event) => onFilterType(event.target.value)}
        aria-label={t({ ko: "유형", en: "Type", ja: "タイプ", zh: "类型", fr: "Type" })}
        className="qg-select"
      >
        <option value="">
          {t({ ko: "전체 유형", en: "All Types", ja: "全タイプ", zh: "全部类型", fr: "Tous les types" })}
        </option>
        {TASK_TYPE_OPTIONS.map((typeOption) => (
          <option key={typeOption.value} value={typeOption.value}>
            {taskTypeLabel(typeOption.value, t)}
          </option>
        ))}
      </select>
    </div>
  );
}
