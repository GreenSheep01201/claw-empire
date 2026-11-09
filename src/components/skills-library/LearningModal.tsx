import { LoaderCircle } from "lucide-react";
import type { SkillHistoryProvider, SkillLearnProvider } from "../../api";
import type { Agent } from "../../types";
import AgentAvatar from "../AgentAvatar";
import Dialog from "../ui/Dialog";
import {
  learningStatusLabel,
  providerLabel,
  roleLabel,
  type CategorizedSkill,
  type TFunction,
  type UnlearnEffect,
} from "./model";

interface LearningModalProps {
  t: TFunction;
  localeTag: string;
  agents: Agent[];
  learningSkill: CategorizedSkill | null;
  learnInProgress: boolean;
  selectedProviders: SkillLearnProvider[];
  representatives: Array<{ provider: SkillLearnProvider; agent: Agent | null }>;
  preferKoreanName: boolean;
  modalLearnedProviders: Set<SkillHistoryProvider>;
  unlearningProviders: SkillLearnProvider[];
  unlearnEffects: Partial<Record<SkillLearnProvider, UnlearnEffect>>;
  learnJob: {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed";
    command: string;
    logTail: string[];
    completedAt: number | null;
    error?: string | null;
  } | null;
  learnError: string | null;
  unlearnError: string | null;
  learnSubmitting: boolean;
  defaultSelectedProviders: SkillLearnProvider[];
  onClose: () => void;
  onToggleProvider: (provider: SkillLearnProvider) => void;
  onUnlearnProvider: (provider: SkillLearnProvider) => void;
  onStartLearning: () => void;
}

export default function LearningModal({
  t,
  localeTag,
  agents,
  learningSkill,
  learnInProgress,
  selectedProviders,
  representatives,
  preferKoreanName,
  modalLearnedProviders,
  unlearningProviders,
  unlearnEffects,
  learnJob,
  learnError,
  unlearnError,
  learnSubmitting,
  defaultSelectedProviders,
  onClose,
  onToggleProvider,
  onUnlearnProvider,
  onStartLearning,
}: LearningModalProps) {
  if (!learningSkill) return null;

  return (
    <Dialog
      className="skills-learn-modal-card"
      open
      size="lg"
      onClose={onClose}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
      title={t({
        ko: "스킬 학습 스쿼드",
        en: "Skill Learning Squad",
        ja: "スキル学習スクワッド",
        zh: "技能学习小队",
        fr: "Escouade d'apprentissage",
      })}
      headerActions={
        learnInProgress ? (
          <button type="button" className="qg-btn" disabled>
            {t({ ko: "학습중", en: "Running", ja: "実行中", zh: "进行中", fr: "En cours" })}
          </button>
        ) : null
      }
      footer={
        <>
          <button type="button" onClick={onClose} disabled={learnInProgress} className="qg-btn">
            {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消", fr: "Annuler" })}
          </button>
          <button
            type="button"
            onClick={onStartLearning}
            disabled={
              selectedProviders.length === 0 ||
              learnSubmitting ||
              learnInProgress ||
              defaultSelectedProviders.length === 0
            }
            className="qg-btn qg-btn--primary"
          >
            {learnSubmitting || learnInProgress ? (
              <>
                <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
                {t({ ko: "학습중...", en: "Learning...", ja: "学習中...", zh: "学习中...", fr: "Apprentissage…" })}
              </>
            ) : (
              t({ ko: "학습 시작", en: "Start Learning", ja: "学習開始", zh: "开始学习", fr: "Lancer l'apprentissage" })
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-sm qg-text-secondary">
          {learningSkill.name} · {learningSkill.repo}
        </div>
        <div className="qg-card">
          <div className="text-[13px] font-semibold qg-text-muted">
            {t({
              ko: "실행 명령",
              en: "Install command",
              ja: "実行コマンド",
              zh: "执行命令",
              fr: "Commande d'installation",
            })}
          </div>
          <div className="mt-1 text-[13px] font-mono qg-text-secondary break-all">
            npx skills add {learningSkill.repo}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm qg-text-secondary">
            {t({
              ko: "CLI 대표자를 선택하세요 (복수 선택 가능)",
              en: "Select CLI representatives (multi-select)",
              ja: "CLI代表を選択してください（複数選択可）",
              zh: "选择 CLI 代表（可多选）",
              fr: "Choisissez les agents à former (plusieurs possibles)",
            })}
          </div>
          <div className="text-[13px] qg-text-muted">
            {selectedProviders.length}
            {t({ ko: "명 선택됨", en: " selected", ja: "名を選択", zh: " 已选择", fr: " sélectionné(s)" })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {representatives.map((row) => {
            const isSelected = selectedProviders.includes(row.provider);
            const hasAgent = !!row.agent;
            const isAnimating = learnInProgress && isSelected && hasAgent;
            const isAlreadyLearned = modalLearnedProviders.has(row.provider);
            const isUnlearning = unlearningProviders.includes(row.provider);
            const unlearnEffect = unlearnEffects[row.provider];
            const isHitAnimating = !!unlearnEffect;
            const displayName = row.agent
              ? preferKoreanName
                ? row.agent.name_ko || row.agent.name
                : row.agent.name || row.agent.name_ko
              : t({
                  ko: "배치된 인원 없음",
                  en: "No assigned member",
                  ja: "担当メンバーなし",
                  zh: "暂无成员",
                  fr: "Aucun agent affecté",
                });

            return (
              <div
                key={row.provider}
                role={hasAgent ? "button" : undefined}
                tabIndex={hasAgent ? 0 : -1}
                onClick={() => {
                  if (!hasAgent || learnInProgress) return;
                  onToggleProvider(row.provider);
                }}
                onKeyDown={(event) => {
                  if (!hasAgent || learnInProgress) return;
                  const target = event.target as HTMLElement | null;
                  if (target?.closest("button")) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onToggleProvider(row.provider);
                  }
                }}
                aria-disabled={!hasAgent || learnInProgress}
                aria-pressed={hasAgent ? isSelected : undefined}
                className="qg-choice relative overflow-hidden"
                style={
                  !hasAgent
                    ? { cursor: "not-allowed", opacity: 0.6, padding: 12 }
                    : learnInProgress
                      ? { cursor: "default", padding: 12 }
                      : { padding: 12 }
                }
              >
                {isAnimating && (
                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <span
                        key={`${row.provider}-book-${idx}`}
                        className="learn-book-drop"
                        style={{ left: `${8 + idx * 15}%`, animationDelay: `${idx * 0.15}s` }}
                      >
                        {idx % 2 === 0 ? "📘" : "📙"}
                      </span>
                    ))}
                  </div>
                )}

                <div className="relative z-10 flex w-full items-center gap-3">
                  <div
                    className={`relative ${isAnimating ? "learn-avatar-reading" : ""} ${isHitAnimating ? "unlearn-avatar-hit" : ""}`}
                  >
                    <AgentAvatar agent={row.agent ?? undefined} agents={agents} size={50} rounded="xl" />
                    {isAnimating && <span className="learn-reading-book">📖</span>}
                    {unlearnEffect === "pot" && <span className="unlearn-pot-drop">🪴</span>}
                    {unlearnEffect === "hammer" && <span className="unlearn-hammer-swing">🔨</span>}
                    {isHitAnimating && (
                      <span className="unlearn-hit-text">
                        {t({ ko: "깡~", en: "Bonk!", ja: "ゴン!", zh: "咣~", fr: "Bonk !" })}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] qg-text-muted font-normal">{providerLabel(row.provider)}</div>
                    <div className="text-sm font-medium truncate">{displayName}</div>
                    <div className="text-[13px] qg-text-muted font-normal">
                      {row.agent
                        ? roleLabel(row.agent.role, t)
                        : t({ ko: "사용 불가", en: "Unavailable", ja: "利用不可", zh: "不可用", fr: "Indisponible" })}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={`qg-badge ${isAlreadyLearned || isSelected ? "qg-badge--accent" : ""}`}>
                      {isAlreadyLearned
                        ? t({ ko: "학습됨", en: "Learned", ja: "学習済み", zh: "已学习", fr: "Acquise" })
                        : isSelected
                          ? t({ ko: "선택됨", en: "Selected", ja: "選択", zh: "已选", fr: "Sélectionné" })
                          : t({ ko: "대기", en: "Idle", ja: "待機", zh: "待命", fr: "Disponible" })}
                    </span>
                    {isAlreadyLearned && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onUnlearnProvider(row.provider);
                        }}
                        disabled={learnInProgress || isUnlearning}
                        className="qg-btn qg-btn--sm qg-btn--danger"
                      >
                        {isUnlearning
                          ? t({
                              ko: "취소중...",
                              en: "Unlearning...",
                              ja: "取消中...",
                              zh: "取消中...",
                              fr: "Retrait…",
                            })
                          : t({ ko: "학습 취소", en: "Unlearn", ja: "学習取消", zh: "取消学习", fr: "Retirer" })}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="qg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="qg-text-secondary">
              {t({ ko: "작업 상태", en: "Job status", ja: "ジョブ状態", zh: "任务状态", fr: "État" })}
              {" : "}
              <span
                className={`qg-badge ${
                  learnJob?.status === "failed"
                    ? "qg-badge--pin"
                    : learnJob?.status === "succeeded" ||
                        learnJob?.status === "running" ||
                        learnJob?.status === "queued"
                      ? "qg-badge--accent"
                      : ""
                }`}
              >
                {learningStatusLabel(learnJob?.status ?? null, t)}
              </span>
            </div>

            {learnJob?.completedAt && (
              <div className="text-[13px] qg-text-muted">
                {new Intl.DateTimeFormat(localeTag, {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(new Date(learnJob.completedAt))}
              </div>
            )}
          </div>

          {learnError && (
            <div className="qg-field__error mt-2" role="alert">
              {learnError}
            </div>
          )}
          {unlearnError && (
            <div className="qg-field__error mt-2" role="alert">
              {unlearnError}
            </div>
          )}
          {learnJob?.error && <div className="qg-field__error mt-2">{learnJob.error}</div>}

          {learnJob && (
            <div
              className="mt-2 rounded-md border p-2 font-mono text-[13px] qg-text-secondary max-h-32 overflow-y-auto space-y-1"
              style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface-hover)" }}
            >
              <div className="qg-text-muted">$ {learnJob.command}</div>
              {learnJob.logTail.length > 0 ? (
                learnJob.logTail.slice(-10).map((line, idx) => <div key={`${learnJob.id}-log-${idx}`}>{line}</div>)
              ) : (
                <div className="qg-text-muted">
                  {t({
                    ko: "로그가 아직 없습니다",
                    en: "No logs yet",
                    ja: "ログはまだありません",
                    zh: "暂无日志",
                    fr: "Aucun journal pour l'instant",
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
