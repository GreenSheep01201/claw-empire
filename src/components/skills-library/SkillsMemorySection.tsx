import type { Agent } from "../../types";
import SkillHistoryPanel from "../SkillHistoryPanel";
import type { TFunction } from "./model";

interface SkillsMemorySectionProps {
  t: TFunction;
  agents: Agent[];
  historyRefreshToken: number;
  onRefreshHistory: () => void;
}

export default function SkillsMemorySection({
  t,
  agents,
  historyRefreshToken,
  onRefreshHistory,
}: SkillsMemorySectionProps) {
  return (
    <section className="qg-card" style={{ padding: 12 }}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
          {t({
            ko: "학습 메모리",
            en: "Learning Memory",
            ja: "学習メモリ",
            zh: "学习记忆",
            fr: "Mémoire des apprentissages",
          })}
        </h3>
        <div className="text-[13px] qg-text-muted">
          {t({
            ko: "CLI별 스킬 이력",
            en: "Per-CLI skill history",
            ja: "CLI別スキル履歴",
            zh: "按 CLI 的技能记录",
            fr: "Compétences apprises par outil",
          })}
        </div>
      </div>
      <SkillHistoryPanel
        agents={agents}
        refreshToken={historyRefreshToken}
        onLearningDataChanged={onRefreshHistory}
        className="h-[380px]"
      />
    </section>
  );
}
