import { CATEGORIES, CATEGORY_ICONS, categoryLabel, type TFunction } from "./model";

interface SkillsCategoryBarProps {
  t: TFunction;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categoryCounts: Record<string, number>;
  filteredLength: number;
  search: string;
}

export default function SkillsCategoryBar({
  t,
  selectedCategory,
  onSelectCategory,
  categoryCounts,
  filteredLength,
  search,
}: SkillsCategoryBarProps) {
  return (
    <>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={t({ ko: "카테고리", en: "Categories", ja: "カテゴリ", zh: "分类", fr: "Catégories" })}
      >
        {CATEGORIES.map((category) => (
          <button
            type="button"
            key={category}
            onClick={() => onSelectCategory(category)}
            aria-pressed={selectedCategory === category}
            className="qg-choice"
            style={{ width: "auto", minHeight: 36, padding: "4px 12px", fontSize: "0.8125rem" }}
          >
            <span aria-hidden="true">{CATEGORY_ICONS[category]}</span>
            {categoryLabel(category, t)}
            <span className="qg-count">{categoryCounts[category] || 0}</span>
          </button>
        ))}
      </div>

      <div className="px-1 text-[13px] qg-text-muted" aria-live="polite">
        {filteredLength}
        {t({
          ko: "개 스킬 표시중",
          en: " skills shown",
          ja: "件のスキルを表示中",
          zh: " 个技能已显示",
          fr: filteredLength > 1 ? " compétences affichées" : " compétence affichée",
        })}
        {search &&
          ` · "${search}" ${t({ ko: "검색 결과", en: "search results", ja: "検索結果", zh: "搜索结果", fr: "(résultats de recherche)" })}`}
      </div>
    </>
  );
}
