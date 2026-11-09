import { LibraryBig, Plus, Search, X } from "lucide-react";
import type { TFunction } from "./model";

interface SkillsHeaderProps {
  t: TFunction;
  skillsCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: "rank" | "name" | "installs";
  onSortByChange: (value: "rank" | "name" | "installs") => void;
  onOpenCustomSkillModal: () => void;
}

export default function SkillsHeader({
  t,
  skillsCount,
  search,
  onSearchChange,
  sortBy,
  onSortByChange,
  onOpenCustomSkillModal,
}: SkillsHeaderProps) {
  return (
    <div className="qg-card" style={{ padding: 20 }}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--th-text-heading)" }}>
            <LibraryBig size={20} aria-hidden="true" style={{ color: "var(--qg-accent)" }} />
            {t({
              ko: "Agent Skills 문서고",
              en: "Agent Skills Library",
              ja: "Agent Skills ライブラリ",
              zh: "Agent Skills 资料库",
              fr: "Bibliothèque de compétences",
            })}
          </h2>
          <p className="mt-1 text-sm qg-text-secondary">
            {t({
              ko: "AI 에이전트 스킬 디렉토리 · skills.sh 실시간 데이터",
              en: "AI agent skill directory · live skills.sh data",
              ja: "AI エージェントスキルディレクトリ · skills.sh リアルタイムデータ",
              zh: "AI 代理技能目录 · skills.sh 实时数据",
              fr: "Des savoir-faire prêts à apprendre pour vos agents · catalogue skills.sh",
            })}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onOpenCustomSkillModal}
            className="qg-btn"
            title={t({
              ko: "커스텀 스킬 직접 추가",
              en: "Add custom skill",
              ja: "カスタムスキルを追加",
              zh: "添加自定义技能",
              fr: "Ajouter votre propre compétence",
            })}
          >
            <Plus size={16} aria-hidden="true" />
            {t({
              ko: "커스텀 스킬 추가",
              en: "Add Custom Skill",
              ja: "カスタムスキル追加",
              zh: "添加自定义技能",
              fr: "Ajouter une compétence",
            })}
          </button>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--th-text-heading)" }}>
              {skillsCount}
            </div>
            <div className="text-[13px] qg-text-muted">
              {t({
                ko: "등록된 스킬",
                en: "Registered skills",
                ja: "登録済みスキル",
                zh: "已收录技能",
                fr: "compétences au catalogue",
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 qg-text-muted"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label={t({
              ko: "스킬 검색",
              en: "Search skills",
              ja: "スキル検索",
              zh: "搜索技能",
              fr: "Rechercher une compétence",
            })}
            placeholder={t({
              ko: "스킬 검색... (이름, 저장소, 카테고리)",
              en: "Search skills... (name, repo, category)",
              ja: "スキル検索...（名前・リポジトリ・カテゴリ）",
              zh: "搜索技能...（名称、仓库、分类）",
              fr: "Rechercher… (nom, source, catégorie)",
            })}
            className="qg-input"
            style={{ paddingLeft: 34, paddingRight: search ? 40 : undefined }}
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="qg-icon-btn qg-btn--ghost"
              style={{ position: "absolute", right: 4, top: 4, width: 32, height: 32 }}
              aria-label={t({
                ko: "검색어 지우기",
                en: "Clear search",
                ja: "検索をクリア",
                zh: "清除搜索",
                fr: "Effacer la recherche",
              })}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value as "rank" | "name" | "installs")}
          className="qg-select"
          aria-label={t({ ko: "정렬", en: "Sort", ja: "並び替え", zh: "排序", fr: "Trier" })}
        >
          <option value="rank">
            {t({ ko: "순위순", en: "By Rank", ja: "順位順", zh: "按排名", fr: "Par classement" })}
          </option>
          <option value="installs">
            {t({ ko: "설치순", en: "By Installs", ja: "インストール順", zh: "按安装量", fr: "Par popularité" })}
          </option>
          <option value="name">{t({ ko: "이름순", en: "By Name", ja: "名前順", zh: "按名称", fr: "Par nom" })}</option>
        </select>
      </div>
    </div>
  );
}
