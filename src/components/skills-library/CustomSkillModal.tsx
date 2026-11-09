import type { RefObject } from "react";
import { Check, FileText, GraduationCap, LoaderCircle, Paperclip } from "lucide-react";
import type { SkillLearnProvider } from "../../api";
import type { Agent } from "../../types";
import AgentAvatar from "../AgentAvatar";
import Dialog from "../ui/Dialog";
import { providerLabel, type TFunction } from "./model";

interface CustomSkillModalProps {
  t: TFunction;
  show: boolean;
  agents: Agent[];
  representatives: Array<{ provider: SkillLearnProvider; agent: Agent | null }>;
  preferKoreanName: boolean;
  customSkillName: string;
  setCustomSkillName: (value: string) => void;
  customSkillContent: string;
  customSkillFileName: string;
  customSkillProviders: SkillLearnProvider[];
  customSkillSubmitting: boolean;
  customSkillError: string | null;
  customFileInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleProvider: (provider: SkillLearnProvider) => void;
  onSubmit: () => void;
}

export default function CustomSkillModal({
  t,
  show,
  agents,
  representatives,
  preferKoreanName,
  customSkillName,
  setCustomSkillName,
  customSkillContent,
  customSkillFileName,
  customSkillProviders,
  customSkillSubmitting,
  customSkillError,
  customFileInputRef,
  onClose,
  onFileSelect,
  onToggleProvider,
  onSubmit,
}: CustomSkillModalProps) {
  if (!show) return null;

  const canSubmit = Boolean(customSkillName.trim() && customSkillContent.trim() && customSkillProviders.length > 0);

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
      title={t({
        ko: "커스텀 스킬 추가",
        en: "Add Custom Skill",
        ja: "カスタムスキル追加",
        zh: "添加自定义技能",
        fr: "Ajouter une compétence personnalisée",
      })}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={customSkillSubmitting} className="qg-btn">
            {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消", fr: "Annuler" })}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || customSkillSubmitting}
            className="qg-btn qg-btn--primary"
            style={!canSubmit ? { cursor: "not-allowed" } : undefined}
          >
            {customSkillSubmitting ? (
              <>
                <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
                {t({ ko: "등록중...", en: "Submitting...", ja: "登録中...", zh: "提交中...", fr: "Envoi…" })}
              </>
            ) : (
              <>
                <GraduationCap size={16} aria-hidden="true" />
                {t({
                  ko: "학습 시작",
                  en: "Start Training",
                  ja: "学習開始",
                  zh: "开始培训",
                  fr: "Lancer l'apprentissage",
                })}
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm qg-text-secondary">
          {t({
            ko: "skills.md 파일을 첨부하고 CLI 대표자를 선택하세요",
            en: "Attach a skills.md file and select CLI representatives",
            ja: "skills.md ファイルを添付し、CLI代表を選択してください",
            zh: "附加 skills.md 文件并选择 CLI 代表",
            fr: "Joignez un fichier skills.md et choisissez les agents à former",
          })}
        </p>
        <div className="qg-field">
          <label className="qg-field__label" htmlFor="custom-skill-name">
            {t({ ko: "스킬명", en: "Skill Name", ja: "スキル名", zh: "技能名称", fr: "Nom de la compétence" })}
          </label>
          <input
            id="custom-skill-name"
            type="text"
            value={customSkillName}
            onChange={(e) => setCustomSkillName(e.target.value)}
            aria-describedby="custom-skill-name-hint"
            placeholder={t({
              ko: "예: my-custom-skill",
              en: "e.g. my-custom-skill",
              ja: "例: my-custom-skill",
              zh: "例如: my-custom-skill",
              fr: "ex. : my-custom-skill",
            })}
            className="qg-input"
          />
          <div className="qg-field__hint" id="custom-skill-name-hint">
            {t({
              ko: "영문, 숫자, 하이픈(-), 언더스코어(_)만 사용 가능",
              en: "Only alphanumeric, dash (-), underscore (_) allowed",
              ja: "英数字、ハイフン(-)、アンダースコア(_)のみ使用可能",
              zh: "仅允许字母数字、短划线(-)或下划线(_)",
              fr: "Lettres, chiffres, tiret (-) et tiret bas (_) uniquement",
            })}
          </div>
        </div>

        <div className="qg-field">
          <span className="qg-field__label">
            {t({
              ko: "skills.md 파일",
              en: "skills.md File",
              ja: "skills.md ファイル",
              zh: "skills.md 文件",
              fr: "Fichier skills.md",
            })}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => customFileInputRef.current?.click()} className="qg-btn qg-btn--sm">
              <Paperclip size={16} aria-hidden="true" />
              {t({ ko: "파일 선택", en: "Choose File", ja: "ファイル選択", zh: "选择文件", fr: "Choisir un fichier" })}
            </button>
            <input
              ref={customFileInputRef}
              type="file"
              accept=".md,.txt,.markdown"
              onChange={onFileSelect}
              className="hidden"
            />
            {customSkillFileName && (
              <span className="inline-flex items-center gap-1 text-[13px] qg-text-secondary truncate max-w-[200px]">
                <FileText size={16} aria-hidden="true" className="shrink-0" />
                {customSkillFileName}
              </span>
            )}
          </div>
          {customSkillContent && (
            <div className="qg-card mt-1 max-h-32 overflow-y-auto" style={{ padding: 8 }}>
              <pre className="text-[13px] qg-text-secondary whitespace-pre-wrap break-all">
                {customSkillContent.slice(0, 500)}
                {customSkillContent.length > 500 && "..."}
              </pre>
            </div>
          )}
        </div>

        <div className="qg-field">
          <span className="qg-field__label" id="custom-skill-providers-label">
            {t({
              ko: "학습시킬 CLI 대표자",
              en: "CLI Representatives to Train",
              ja: "学習させるCLI代表",
              zh: "要培训的 CLI 代表",
              fr: "Agents à former",
            })}
          </span>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            role="group"
            aria-labelledby="custom-skill-providers-label"
          >
            {representatives.map((row) => {
              const isSelected = customSkillProviders.includes(row.provider);
              const hasAgent = !!row.agent;
              const displayName = row.agent
                ? preferKoreanName
                  ? row.agent.name_ko || row.agent.name
                  : row.agent.name || row.agent.name_ko
                : t({ ko: "없음", en: "None", ja: "なし", zh: "无", fr: "Aucun" });
              return (
                <button
                  key={`custom-${row.provider}`}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => hasAgent && onToggleProvider(row.provider)}
                  disabled={!hasAgent}
                  className="qg-choice"
                >
                  <AgentAvatar agent={row.agent ?? undefined} agents={agents} size={32} rounded="xl" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] qg-text-muted font-normal">{providerLabel(row.provider)}</div>
                    <div className="text-sm truncate">{displayName}</div>
                  </div>
                  <span
                    aria-hidden="true"
                    className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                    style={{
                      borderColor: isSelected ? "var(--qg-accent)" : "var(--th-border-strong)",
                      background: isSelected ? "var(--qg-accent)" : "transparent",
                      color: "var(--qg-accent-ink)",
                    }}
                  >
                    {isSelected && <Check size={12} aria-hidden="true" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {customSkillError && (
          <div className="qg-field__error" role="alert">
            {customSkillError}
          </div>
        )}
      </div>
    </Dialog>
  );
}
