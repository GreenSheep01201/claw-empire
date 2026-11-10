import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAvailableLearnedSkills,
  getSkillLearningHistory,
  unlearnSkill,
  type LearnedSkillEntry,
  type SkillHistoryProvider,
  type SkillLearningHistoryEntry,
} from "../api";
import { RefreshCw } from "lucide-react";
import { useI18n } from "../i18n";
import { type Agent } from "../types";
import AgentAvatar from "./AgentAvatar";
import {
  HISTORY_PREVIEW_COUNT,
  PROVIDER_ORDER,
  learningRowKey,
  normalizeSkillLabel,
  pickRepresentativeForProvider,
  providerLabel,
  relativeTime,
  statusClass,
  statusIsPending,
  statusLabel,
} from "./skill-history/utils";

type UnlearnEffect = "pot" | "hammer";

interface SkillHistoryPanelProps {
  agents: Agent[];
  refreshToken?: number;
  className?: string;
  onLearningDataChanged?: () => void;
}

export default function SkillHistoryPanel({
  agents,
  refreshToken = 0,
  className = "",
  onLearningDataChanged,
}: SkillHistoryPanelProps) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<"history" | "available">("history");
  const [providerFilter, setProviderFilter] = useState<"all" | SkillHistoryProvider>("all");
  const [historyRows, setHistoryRows] = useState<SkillLearningHistoryEntry[]>([]);
  const [availableRows, setAvailableRows] = useState<LearnedSkillEntry[]>([]);
  const [retentionDays, setRetentionDays] = useState<number>(180);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlearnError, setUnlearnError] = useState<string | null>(null);
  const [unlearningKeys, setUnlearningKeys] = useState<string[]>([]);
  const [unlearnEffects, setUnlearnEffects] = useState<Partial<Record<string, UnlearnEffect>>>({});
  const [centerBonk, setCenterBonk] = useState<{
    provider: SkillHistoryProvider;
    agent: Agent | null;
  } | null>(null);
  const unlearnEffectTimersRef = useRef<Partial<Record<string, number>>>({});
  const centerBonkTimerRef = useRef<number | null>(null);

  const representatives = useMemo(() => {
    const out = new Map<SkillHistoryProvider, Agent | null>();
    for (const provider of PROVIDER_ORDER) {
      out.set(provider, pickRepresentativeForProvider(agents, provider));
    }
    return out;
  }, [agents]);

  const activeProviders = useMemo(() => {
    const fromRows = new Set<SkillHistoryProvider>();
    for (const row of historyRows) fromRows.add(row.provider);
    for (const row of availableRows) fromRows.add(row.provider);
    for (const provider of PROVIDER_ORDER) {
      if (representatives.get(provider)) {
        fromRows.add(provider);
      }
    }
    return PROVIDER_ORDER.filter((provider) => fromRows.has(provider));
  }, [availableRows, historyRows, representatives]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = providerFilter === "all" ? undefined : providerFilter;
      const [historyData, availableData] = await Promise.all([
        getSkillLearningHistory({ provider, limit: 80 }),
        getAvailableLearnedSkills({ provider, limit: 30 }),
      ]);
      setHistoryRows(historyData.history);
      setAvailableRows(availableData);
      if (historyData.retentionDays > 0) {
        setRetentionDays(historyData.retentionDays);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [providerFilter]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    setHistoryExpanded(false);
  }, [providerFilter, tab]);

  useEffect(() => {
    const timers = unlearnEffectTimersRef.current;
    return () => {
      for (const timerId of Object.values(timers)) {
        if (typeof timerId === "number") {
          window.clearTimeout(timerId);
        }
      }
      if (typeof centerBonkTimerRef.current === "number") {
        window.clearTimeout(centerBonkTimerRef.current);
      }
    };
  }, []);

  function triggerUnlearnEffect(rowKey: string, provider: SkillHistoryProvider) {
    const effect: UnlearnEffect = Math.random() < 0.5 ? "pot" : "hammer";
    setUnlearnEffects((prev) => ({ ...prev, [rowKey]: effect }));
    setCenterBonk({
      provider,
      agent: representatives.get(provider) ?? null,
    });
    if (typeof centerBonkTimerRef.current === "number") {
      window.clearTimeout(centerBonkTimerRef.current);
    }
    centerBonkTimerRef.current = window.setTimeout(() => {
      setCenterBonk(null);
      centerBonkTimerRef.current = null;
    }, 950);
    const existingTimer = unlearnEffectTimersRef.current[rowKey];
    if (typeof existingTimer === "number") {
      window.clearTimeout(existingTimer);
    }
    unlearnEffectTimersRef.current[rowKey] = window.setTimeout(() => {
      setUnlearnEffects((prev) => {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      });
      delete unlearnEffectTimersRef.current[rowKey];
    }, 1100);
  }

  async function handleUnlearn(row: { provider: SkillHistoryProvider; repo: string; skill_id: string }) {
    const rowKey = learningRowKey(row);
    if (unlearningKeys.includes(rowKey)) return;
    setUnlearnError(null);
    setUnlearningKeys((prev) => [...prev, rowKey]);
    try {
      const result = await unlearnSkill({
        provider: row.provider,
        repo: row.repo,
        skillId: row.skill_id,
      });
      if (result.removed > 0) {
        setAvailableRows((prev) => prev.filter((item) => learningRowKey(item) !== rowKey));
        setHistoryRows((prev) =>
          prev.filter(
            (item) =>
              !(
                item.provider === row.provider &&
                item.repo === row.repo &&
                item.skill_id === row.skill_id &&
                item.status === "succeeded"
              ),
          ),
        );
        triggerUnlearnEffect(rowKey, row.provider);
      }
      onLearningDataChanged?.();
      void load();
    } catch (e) {
      setUnlearnError(e instanceof Error ? e.message : String(e));
    } finally {
      setUnlearningKeys((prev) => prev.filter((key) => key !== rowKey));
    }
  }

  const visibleHistoryRows = useMemo(() => {
    if (historyExpanded) return historyRows;
    return historyRows.slice(0, HISTORY_PREVIEW_COUNT);
  }, [historyExpanded, historyRows]);

  const hiddenHistoryCount = Math.max(0, historyRows.length - HISTORY_PREVIEW_COUNT);

  const unlearnLabel = (busy: boolean) =>
    busy
      ? t({ ko: "학습 취소 중...", en: "Unlearning...", ja: "学習取消中...", zh: "取消学习中...", fr: "Retrait…" })
      : t({ ko: "학습 취소", en: "Unlearn", ja: "学習取消", zh: "取消学习", fr: "Oublier" });

  const renderAvatar = (agent: Agent | null, unlearnEffect: UnlearnEffect | undefined) => (
    <div
      className={`relative h-6 w-6 shrink-0 overflow-hidden rounded-md ${unlearnEffect ? "unlearn-avatar-hit" : ""}`}
      style={{ background: "var(--th-bg-surface-hover)" }}
    >
      <AgentAvatar agent={agent ?? undefined} agents={agents} size={24} rounded="xl" />
      {unlearnEffect === "pot" && (
        <span className="unlearn-pot-drop-sm" aria-hidden="true">
          🪴
        </span>
      )}
      {unlearnEffect === "hammer" && (
        <span className="unlearn-hammer-swing-sm" aria-hidden="true">
          🔨
        </span>
      )}
      {unlearnEffect && (
        <span className="unlearn-hit-text-sm" aria-hidden="true">
          Bonk!
        </span>
      )}
    </div>
  );

  const providerChip = (key: "all" | SkillHistoryProvider, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setProviderFilter(key)}
      aria-pressed={providerFilter === key}
      className="qg-choice shrink-0"
      style={{ width: "auto", minHeight: 32, padding: "4px 10px", fontSize: "0.8125rem" }}
    >
      {label}
    </button>
  );

  const emptyBox = (text: string) => <div className="qg-empty">{text}</div>;

  const errorBox = (text: string) => (
    <div
      role="alert"
      className="rounded-md px-3 py-2 text-[13px]"
      style={{
        background: "var(--th-danger-bg)",
        border: "1px solid var(--th-danger-border)",
        color: "var(--th-danger-text)",
      }}
    >
      {text}
    </div>
  );

  return (
    <div
      className={`flex h-full min-h-[360px] flex-col rounded-md ${className}`}
      style={{ background: "var(--th-bg-surface)", border: "1px solid var(--th-border)" }}
    >
      <div
        className="flex items-center justify-between gap-2 px-3 py-2.5"
        style={{ borderBottom: "1px solid var(--th-border)" }}
      >
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label={t({ ko: "보기", en: "View", ja: "表示", zh: "视图", fr: "Affichage" })}
        >
          <button
            type="button"
            onClick={() => setTab("history")}
            aria-pressed={tab === "history"}
            className="qg-choice"
            style={{ width: "auto", minHeight: 32, padding: "4px 10px", fontSize: "0.8125rem" }}
          >
            {t({
              ko: "학습 이력",
              en: "Learning History",
              ja: "学習履歴",
              zh: "学习记录",
              fr: "Historique",
            })}
          </button>
          <button
            type="button"
            onClick={() => setTab("available")}
            aria-pressed={tab === "available"}
            className="qg-choice"
            style={{ width: "auto", minHeight: 32, padding: "4px 10px", fontSize: "0.8125rem" }}
          >
            {t({
              ko: "사용 가능한 스킬",
              en: "Available Skills",
              ja: "利用可能なスキル",
              zh: "可用技能",
              fr: "Compétences acquises",
            })}
          </button>
        </div>
        <button type="button" onClick={() => void load()} className="qg-btn qg-btn--sm qg-btn--ghost">
          <RefreshCw size={16} aria-hidden="true" />
          {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新", fr: "Actualiser" })}
        </button>
      </div>

      <div
        className="flex items-center gap-1.5 overflow-x-auto px-3 py-2"
        role="group"
        aria-label={t({
          ko: "CLI 필터",
          en: "CLI filter",
          ja: "CLIフィルター",
          zh: "CLI 筛选",
          fr: "Filtrer par outil",
        })}
      >
        {providerChip("all", t({ ko: "전체", en: "All", ja: "すべて", zh: "全部", fr: "Tous" }))}
        {activeProviders.map((provider) => providerChip(provider, providerLabel(provider)))}
      </div>

      <div className="px-3 pb-2 text-[13px] qg-text-muted">
        {t({
          ko: `보관 기간: ${retentionDays}일`,
          en: `Retention: ${retentionDays} days`,
          ja: `保存期間: ${retentionDays}日`,
          zh: `保留期: ${retentionDays} 天`,
          fr: `Conservation : ${retentionDays} jours`,
        })}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {loading &&
          historyRows.length === 0 &&
          availableRows.length === 0 &&
          emptyBox(
            t({
              ko: "메모리 기록 불러오는 중...",
              en: "Loading memory records...",
              ja: "記録を読み込み中...",
              zh: "正在加载记录...",
              fr: "Chargement de l'historique…",
            }),
          )}

        {error && errorBox(error)}
        {unlearnError && errorBox(unlearnError)}

        {tab === "history" &&
          historyRows.length === 0 &&
          !loading &&
          !error &&
          emptyBox(
            t({
              ko: "아직 학습 이력이 없습니다.",
              en: "No learning history yet.",
              ja: "学習履歴はまだありません。",
              zh: "暂无学习记录。",
              fr: "Aucune compétence apprise pour le moment.",
            }),
          )}

        {tab === "history" &&
          visibleHistoryRows.map((row) => {
            const agent = representatives.get(row.provider) ?? null;
            const label = normalizeSkillLabel(row);
            const eventAt = row.run_completed_at ?? row.updated_at ?? row.created_at;
            const rowKey = learningRowKey(row);
            const isUnlearning = unlearningKeys.includes(rowKey);
            const unlearnEffect = unlearnEffects[rowKey];
            const canUnlearn = row.status === "succeeded";
            return (
              <div key={row.id} className="qg-card" style={{ padding: "10px 12px" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
                      {label}
                    </div>
                    <div className="mt-0.5 truncate text-[13px] qg-text-muted">{row.repo}</div>
                  </div>
                  <span
                    className={statusClass(row.status)}
                    style={statusIsPending(row.status) ? { borderStyle: "dashed" } : undefined}
                  >
                    {statusLabel(row.status, t)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[13px] qg-text-secondary">
                  <div className="flex min-w-0 items-center gap-2">
                    {renderAvatar(agent, unlearnEffect)}
                    <span className="truncate">
                      {providerLabel(row.provider)}
                      {agent ? ` · ${agent.name}` : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canUnlearn && (
                      <button
                        type="button"
                        onClick={() => void handleUnlearn(row)}
                        disabled={isUnlearning}
                        className="qg-btn qg-btn--sm qg-btn--danger"
                      >
                        {unlearnLabel(isUnlearning)}
                      </button>
                    )}
                    <span className="qg-text-muted">{relativeTime(eventAt, locale)}</span>
                  </div>
                </div>
                {row.error && (
                  <div className="mt-1 break-words text-[13px]" style={{ color: "var(--th-danger-text)" }}>
                    {row.error}
                  </div>
                )}
              </div>
            );
          })}

        {tab === "history" && hiddenHistoryCount > 0 && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setHistoryExpanded((prev) => !prev)}
              aria-expanded={historyExpanded}
              className="qg-btn qg-btn--sm"
            >
              {historyExpanded
                ? t({ ko: "접기", en: "Show less", ja: "折りたたむ", zh: "收起", fr: "Voir moins" })
                : t({
                    ko: `${hiddenHistoryCount}개 더 보기`,
                    en: `Show ${hiddenHistoryCount} more`,
                    ja: `さらに${hiddenHistoryCount}件表示`,
                    zh: `再显示 ${hiddenHistoryCount} 条`,
                    fr: `Voir ${hiddenHistoryCount} de plus`,
                  })}
            </button>
          </div>
        )}

        {tab === "available" &&
          availableRows.length === 0 &&
          !loading &&
          !error &&
          emptyBox(
            t({
              ko: "사용 가능한 스킬이 없습니다.",
              en: "No available skills.",
              ja: "利用可能なスキルはありません。",
              zh: "暂无可用技能。",
              fr: "Aucune compétence acquise.",
            }),
          )}

        {tab === "available" &&
          availableRows.map((row) => {
            const agent = representatives.get(row.provider) ?? null;
            const label = normalizeSkillLabel(row);
            const rowKey = learningRowKey(row);
            const isUnlearning = unlearningKeys.includes(rowKey);
            const unlearnEffect = unlearnEffects[rowKey];
            return (
              <div
                key={`${row.provider}-${row.repo}-${row.skill_id}`}
                className="qg-card"
                style={{ padding: "10px 12px" }}
              >
                <div className="truncate text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
                  {label}
                </div>
                <div className="mt-0.5 truncate text-[13px] qg-text-muted">{row.repo}</div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[13px] qg-text-secondary">
                  <div className="flex min-w-0 items-center gap-2">
                    {renderAvatar(agent, unlearnEffect)}
                    <span className="truncate">
                      {providerLabel(row.provider)}
                      {agent ? ` · ${agent.name}` : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleUnlearn(row)}
                      disabled={isUnlearning}
                      className="qg-btn qg-btn--sm qg-btn--danger"
                    >
                      {unlearnLabel(isUnlearning)}
                    </button>
                    <span className="qg-text-muted">{relativeTime(row.learned_at, locale)}</span>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
      {centerBonk && (
        <div className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center" aria-hidden="true">
          <div
            className="unlearn-center-card rounded-md px-6 py-4"
            style={{
              background: "var(--th-bg-surface)",
              border: "1px solid var(--th-border-strong)",
              boxShadow: "var(--qg-lift-high)",
            }}
          >
            <div className="relative mx-auto h-20 w-20 overflow-visible">
              <div className="unlearn-avatar-hit">
                <AgentAvatar agent={centerBonk.agent ?? undefined} agents={agents} size={80} rounded="xl" />
              </div>
              <span className="unlearn-hammer-swing-center">🔨</span>
              <span className="unlearn-hit-text-center">Bonk!</span>
            </div>
            <div className="mt-2 text-center text-[13px] font-medium" style={{ color: "var(--th-text-heading)" }}>
              {providerLabel(centerBonk.provider)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
