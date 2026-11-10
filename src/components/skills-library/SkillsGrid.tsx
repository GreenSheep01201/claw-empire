import type { MutableRefObject } from "react";
import type { SkillDetail, SkillHistoryProvider } from "../../api";
import type { Agent } from "../../types";
import { Check, Copy, GraduationCap, LoaderCircle, SearchX } from "lucide-react";
import AgentAvatar from "../AgentAvatar";
import {
  CATEGORY_ICONS,
  categoryLabel,
  cliProviderIcon,
  formatFirstSeen,
  getRankBadge,
  learnedProviderLabel,
  localizeAuditStatus,
  type CategorizedSkill,
  type TFunction,
} from "./model";

interface SkillsGridProps {
  t: TFunction;
  localeTag: string;
  agents: Agent[];
  filtered: CategorizedSkill[];
  learnedProvidersBySkill: Map<string, SkillHistoryProvider[]>;
  learnedRepresentatives: Map<SkillHistoryProvider, Agent | null>;
  hoveredSkill: string | null;
  setHoveredSkill: (key: string | null) => void;
  detailCache: Record<string, SkillDetail | "loading" | "error">;
  tooltipRef: MutableRefObject<HTMLDivElement | null>;
  hoverTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  copiedSkill: string | null;
  onHoverEnter: (skill: CategorizedSkill) => void;
  onHoverLeave: () => void;
  onOpenLearningModal: (skill: CategorizedSkill) => void;
  onCopy: (skill: CategorizedSkill) => void;
}

export default function SkillsGrid({
  t,
  localeTag,
  agents,
  filtered,
  learnedProvidersBySkill,
  learnedRepresentatives,
  hoveredSkill,
  setHoveredSkill,
  detailCache,
  tooltipRef,
  hoverTimerRef,
  copiedSkill,
  onHoverEnter,
  onHoverLeave,
  onOpenLearningModal,
  onCopy,
}: SkillsGridProps) {
  const sectionLabelCls = "text-[13px] font-semibold uppercase tracking-wide qg-text-muted";

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((skill) => {
          const rankBadgeCls = getRankBadge(skill.rank);
          const detailId = skill.skillId || skill.name;
          const detailKey = `${skill.repo}/${detailId}`;
          const learnedProviders = learnedProvidersBySkill.get(detailKey) ?? [];
          const learnedProvidersForCard = learnedProviders.slice(0, 4);
          const isHovered = hoveredSkill === detailKey;
          const detail = detailCache[detailKey];
          const isCopied = copiedSkill === skill.name;

          return (
            <div
              key={`${skill.rank}-${detailId}`}
              className="qg-card group relative flex flex-col gap-3 transition-colors hover:border-[var(--qg-accent)]"
              onMouseEnter={() => onHoverEnter(skill)}
              onMouseLeave={onHoverLeave}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`${rankBadgeCls} shrink-0 tabular-nums`}>#{skill.rank}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
                      {skill.name}
                    </div>
                    <div className="mt-0.5 truncate text-[13px] qg-text-muted">{skill.repo}</div>
                  </div>
                </div>

                {learnedProvidersForCard.length > 0 && (
                  <div
                    className="grid w-[68px] shrink-0 grid-cols-2 gap-1 rounded-md p-1"
                    style={{ background: "var(--qg-accent-soft)" }}
                    aria-label={t({
                      ko: "학습한 CLI",
                      en: "Learned by",
                      ja: "学習済みCLI",
                      zh: "已学习的 CLI",
                      fr: "Déjà apprise par",
                    })}
                  >
                    {learnedProvidersForCard.map((provider) => {
                      const agent = learnedRepresentatives.get(provider) ?? null;
                      return (
                        <span
                          key={`${detailKey}-${provider}`}
                          className="inline-flex h-6 w-7 items-center justify-center gap-0.5 rounded"
                          style={{ background: "var(--th-bg-surface)" }}
                          title={`${learnedProviderLabel(provider)}${agent ? ` · ${agent.name}` : ""}`}
                        >
                          <span className="flex h-3 w-3 items-center justify-center">{cliProviderIcon(provider)}</span>
                          <span className="h-3 w-3 overflow-hidden rounded-[3px]">
                            <AgentAvatar agent={agent ?? undefined} agents={agents} size={12} rounded="xl" />
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="qg-badge">
                  <span aria-hidden="true">{CATEGORY_ICONS[skill.category]}</span>
                  {categoryLabel(skill.category, t)}
                </span>
                <span className="text-[13px] qg-text-muted">
                  <span className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                    {skill.installsDisplay}
                  </span>{" "}
                  {t({ ko: "설치", en: "installs", ja: "インストール", zh: "安装", fr: "installations" })}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenLearningModal(skill)}
                  className="qg-btn qg-btn--sm qg-btn--primary flex-1"
                  title={t({
                    ko: "CLI 대표자에게 스킬 학습시키기",
                    en: "Teach this skill to selected CLI leaders",
                    ja: "選択したCLI代表にこのスキルを学習させる",
                    zh: "让所选 CLI 代表学习此技能",
                    fr: "Faire apprendre cette compétence à vos agents",
                  })}
                >
                  <GraduationCap size={16} aria-hidden="true" />
                  {t({ ko: "학습", en: "Learn", ja: "学習", zh: "学习", fr: "Apprendre" })}
                </button>
                <button
                  type="button"
                  onClick={() => onCopy(skill)}
                  className="qg-btn qg-btn--sm"
                  title={`npx skills add ${skill.repo}`}
                >
                  {isCopied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  {isCopied
                    ? t({ ko: "복사됨", en: "Copied", ja: "コピー済み", zh: "已复制", fr: "Copiée" })
                    : t({ ko: "복사", en: "Copy", ja: "コピー", zh: "复制", fr: "Copier" })}
                </button>
              </div>

              {isHovered && (
                <div
                  ref={tooltipRef}
                  className="absolute left-0 right-0 top-full z-50 mt-2 rounded-md p-4"
                  style={{
                    background: "var(--th-bg-primary)",
                    border: "1px solid var(--th-border-strong)",
                    boxShadow: "var(--qg-lift-high)",
                  }}
                  onMouseEnter={() => {
                    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                    setHoveredSkill(detailKey);
                  }}
                  onMouseLeave={onHoverLeave}
                >
                  {detail === "loading" && (
                    <div className="flex items-center gap-2 text-[13px] qg-text-muted" role="status">
                      <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                      {t({
                        ko: "상세정보 로딩중...",
                        en: "Loading details...",
                        ja: "詳細を読み込み中...",
                        zh: "加载详情...",
                        fr: "Chargement du détail…",
                      })}
                    </div>
                  )}

                  {detail === "error" && (
                    <div className="text-[13px] qg-text-muted">
                      {t({
                        ko: "상세정보를 불러올 수 없습니다",
                        en: "Could not load details",
                        ja: "詳細を読み込めません",
                        zh: "无法加载详情",
                        fr: "Impossible de charger le détail",
                      })}
                    </div>
                  )}

                  {detail && typeof detail === "object" && (
                    <div className="space-y-3">
                      {detail.title && (
                        <div className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
                          {detail.title}
                        </div>
                      )}

                      {detail.description && (
                        <p className="text-[13px] leading-relaxed qg-text-secondary">{detail.description}</p>
                      )}

                      {detail.whenToUse.length > 0 && (
                        <div className="space-y-1.5">
                          <div className={sectionLabelCls}>
                            {t({
                              ko: "사용 시점",
                              en: "When to Use",
                              ja: "使うタイミング",
                              zh: "适用场景",
                              fr: "Quand l'utiliser",
                            })}
                          </div>
                          <ul className="list-disc space-y-1 pl-4 text-[13px] qg-text-secondary">
                            {detail.whenToUse.slice(0, 6).map((item, idx) => (
                              <li key={`${detailKey}-when-${idx}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-3 text-[13px]">
                        {detail.weeklyInstalls && (
                          <span className="qg-text-secondary">
                            <span className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                              {detail.weeklyInstalls}
                            </span>{" "}
                            {t({ ko: "주간 설치", en: "weekly", ja: "週間", zh: "周安装", fr: "cette semaine" })}
                          </span>
                        )}
                        {detail.firstSeen && (
                          <span className="qg-text-muted">
                            {t({ ko: "최초 등록", en: "First seen", ja: "初登録", zh: "首次发现", fr: "Ajoutée le" })}
                            {" : "}
                            {formatFirstSeen(detail.firstSeen, localeTag)}
                          </span>
                        )}
                      </div>

                      {detail.platforms.length > 0 && (
                        <div>
                          <div className={`${sectionLabelCls} mb-1.5`}>
                            {t({
                              ko: "플랫폼별 설치",
                              en: "Platform Installs",
                              ja: "プラットフォーム別",
                              zh: "平台安装量",
                              fr: "Installations par outil",
                            })}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {detail.platforms.slice(0, 6).map((platform) => (
                              <span key={platform.name} className="qg-badge">
                                {platform.name}{" "}
                                <span style={{ color: "var(--th-text-primary)" }}>{platform.installs}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {detail.audits.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {detail.audits.map((audit) => {
                            const status = audit.status.toLowerCase();
                            const cls = status === "pass" ? "qg-badge qg-badge--accent" : "qg-badge";
                            const dashed = status === "warn" || status === "pending";
                            return (
                              <span
                                key={audit.name}
                                className={cls}
                                style={dashed ? { borderStyle: "dashed" } : undefined}
                              >
                                {audit.name} : {localizeAuditStatus(audit.status, t)}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <div
                        className="truncate rounded px-2 py-1.5 font-mono text-[13px] qg-text-muted"
                        style={{ background: "var(--th-bg-surface)" }}
                      >
                        $ {detail.installCommand}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="qg-empty flex flex-col items-center gap-2">
          <SearchX size={28} aria-hidden="true" />
          <div className="qg-text-secondary">
            {t({
              ko: "검색 결과가 없습니다",
              en: "No search results",
              ja: "検索結果はありません",
              zh: "没有搜索结果",
              fr: "Aucune compétence trouvée",
            })}
          </div>
          <div className="text-[13px]">
            {t({
              ko: "다른 키워드로 검색해보세요",
              en: "Try a different keyword",
              ja: "別のキーワードで検索してください",
              zh: "请尝试其他关键词",
              fr: "Essayez un autre mot-clé",
            })}
          </div>
        </div>
      )}
    </>
  );
}
