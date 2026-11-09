import { createPortal } from "react-dom";
import type { SkillLearnProvider } from "../../api";
import type { Agent } from "../../types";
import AgentAvatar from "../AgentAvatar";
import { pickRepresentativeForProvider, providerLabel, type TFunction } from "./model";

interface ClassroomOverlayProps {
  t: TFunction;
  show: boolean;
  skillName: string;
  providers: SkillLearnProvider[];
  agents: Agent[];
}

export default function ClassroomOverlay({ t, show, skillName, providers, agents }: ClassroomOverlayProps) {
  if (!show) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 animate-in fade-in duration-300"
      style={{ background: "var(--th-modal-overlay)" }}
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-2xl">
        <div className="classroom-scene">
          <div className="classroom-blackboard">
            <div className="classroom-chalk-text">skills!! ✨</div>
          </div>

          <div className="classroom-claw-teacher">
            <img src="/claw-empire.png" alt="" />
            <span className="classroom-chalk-pointer">✏️</span>
          </div>

          <div className="classroom-sparkle-group">
            <span className="classroom-sparkle">✨</span>
            <span className="classroom-sparkle">⭐</span>
            <span className="classroom-sparkle">💫</span>
          </div>

          <div className="absolute top-[125px] left-1/2 -translate-x-1/2 z-20">
            <div className="qg-badge qg-badge--accent animate-in slide-in-from-top-2 duration-500">
              <span aria-hidden="true">📝</span> {skillName}
            </div>
          </div>

          <div className="classroom-desk-row">
            {providers.map((provider) => {
              const agent = pickRepresentativeForProvider(agents, provider);
              return (
                <div key={`classroom-${provider}`} className="classroom-desk-slot">
                  <div className="classroom-student-avatar">
                    <AgentAvatar
                      agent={agent ?? undefined}
                      agents={agents}
                      size={40}
                      rounded="xl"
                      imagePosition="center top"
                    />
                    <span className="classroom-student-notebook">📓</span>
                    <span className="classroom-student-pencil">✏️</span>
                    <span
                      className="classroom-stars"
                      style={{
                        top: "-16px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        animationDelay: `${Math.random() * 2}s`,
                      }}
                    >
                      ⭐
                    </span>
                  </div>
                  <div className="classroom-desk-surface" />
                  <div className="classroom-desk-legs" />
                  <div className="classroom-provider-label">{providerLabel(provider)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 text-center">
          <div className="text-sm font-semibold motion-safe:animate-pulse" style={{ color: "var(--th-text-heading)" }}>
            {t({
              ko: `"${skillName}" 스킬 교육 진행중...`,
              en: `Training "${skillName}" skill...`,
              ja: `「${skillName}」スキル教育中...`,
              zh: `"${skillName}" 技能培训中...`,
              fr: `Apprentissage de « ${skillName} » en cours…`,
            })}
          </div>
          <div className="mt-1 text-[13px] qg-text-secondary">
            {t({
              ko: "CLI 대표자들이 열심히 학습하고 있습니다 📖",
              en: "CLI representatives are studying hard 📖",
              ja: "CLI代表が一生懸命学習しています 📖",
              zh: "CLI代表们正在努力学习 📖",
              fr: "Vos agents sont en train d'apprendre 📖",
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
