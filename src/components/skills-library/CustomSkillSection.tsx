import { PencilLine, Trash2 } from "lucide-react";
import type { CustomSkillEntry, SkillLearnProvider } from "../../api";
import { providerLabel, type TFunction } from "./model";

interface CustomSkillSectionProps {
  t: TFunction;
  customSkills: CustomSkillEntry[];
  localeTag: string;
  onDeleteSkill: (skillName: string) => void;
}

export default function CustomSkillSection({ t, customSkills, localeTag, onDeleteSkill }: CustomSkillSectionProps) {
  if (customSkills.length === 0) return null;

  return (
    <section className="qg-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
          <PencilLine size={16} aria-hidden="true" style={{ color: "var(--qg-accent)" }} />
          {t({ ko: "커스텀 스킬", en: "Custom Skills", ja: "カスタムスキル", zh: "自定义技能", fr: "Vos compétences" })}
          <span className="qg-count">{customSkills.length}</span>
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {customSkills.map((skill) => (
          <div
            key={skill.skillName}
            className="flex items-center justify-between gap-2 rounded-md px-3 py-2"
            style={{ background: "var(--th-bg-surface)", border: "1px solid var(--th-border)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium" style={{ color: "var(--th-text-heading)" }}>
                {skill.skillName}
              </div>
              <div className="text-[13px] qg-text-muted">
                {skill.providers.map((provider) => providerLabel(provider as SkillLearnProvider)).join(", ")}
                {" · "}
                {new Date(skill.createdAt).toLocaleDateString(localeTag)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDeleteSkill(skill.skillName)}
              className="qg-btn qg-btn--sm qg-btn--danger shrink-0"
            >
              <Trash2 size={16} aria-hidden="true" />
              {t({ ko: "삭제", en: "Delete", ja: "削除", zh: "删除", fr: "Supprimer" })}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
