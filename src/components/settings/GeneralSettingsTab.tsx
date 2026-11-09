import { useId } from "react";
import { Check } from "lucide-react";
import type { CliProvider } from "../../types";
import type { LocalSettings, SetLocalSettings, TFunction } from "./types";

interface GeneralSettingsTabProps {
  t: TFunction;
  form: LocalSettings;
  setForm: SetLocalSettings;
  saved: boolean;
  onSave: () => void;
}

interface ToggleSettingCardProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
  title?: string;
}

export function ToggleSwitch({
  checked,
  onToggle,
  label,
  labelledBy,
  describedBy,
  title,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={onToggle}
      disabled={disabled}
      title={title}
      className="relative h-6 w-11 flex-shrink-0 rounded-full transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        background: checked ? "var(--qg-accent)" : "var(--th-border-strong)",
      }}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full shadow-sm transition-all motion-reduce:transition-none ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
        style={{ background: "var(--th-bg-surface)" }}
      />
    </button>
  );
}

function ToggleSettingCard({ label, checked, onToggle, title }: ToggleSettingCardProps) {
  const id = useId();
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[var(--qg-radius)] px-3 py-2.5 sm:px-4"
      style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}
    >
      <div className="min-w-0">
        <span id={`${id}-label`} className="text-sm font-semibold" style={{ color: "var(--th-text-primary)" }}>
          {label}
        </span>
        {title && (
          <p id={`${id}-hint`} className="qg-field__hint mt-0.5">
            {title}
          </p>
        )}
      </div>
      <ToggleSwitch
        checked={checked}
        onToggle={onToggle}
        label={label}
        labelledBy={`${id}-label`}
        describedBy={title ? `${id}-hint` : undefined}
      />
    </div>
  );
}

export default function GeneralSettingsTab({ t, form, setForm, saved, onSave }: GeneralSettingsTabProps) {
  const id = useId();
  return (
    <>
      <section className="qg-card space-y-5">
        <h3 className="text-base font-semibold" style={{ color: "var(--th-text-heading)" }}>
          {t({ ko: "회사 정보", en: "Company", ja: "会社情報", zh: "公司信息", fr: "Entreprise" })}
        </h3>

        <div className="qg-field">
          <label className="qg-field__label" htmlFor={`${id}-company`}>
            {t({ ko: "회사명", en: "Company Name", ja: "会社名", zh: "公司名称", fr: "Nom de l'entreprise" })}
          </label>
          <input
            id={`${id}-company`}
            type="text"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            className="qg-input"
          />
        </div>

        <div className="qg-field">
          <label className="qg-field__label" htmlFor={`${id}-ceo`}>
            {t({ ko: "CEO 이름", en: "CEO Name", ja: "CEO 名", zh: "CEO 名称", fr: "Nom du CEO" })}
          </label>
          <input
            id={`${id}-ceo`}
            type="text"
            value={form.ceoName}
            onChange={(e) => setForm({ ...form, ceoName: e.target.value })}
            className="qg-input"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ToggleSettingCard
            label={t({
              ko: "자동 배정",
              en: "Auto Assign",
              ja: "自動割り当て",
              zh: "自动分配",
              fr: "Attribution automatique",
            })}
            checked={form.autoAssign}
            onToggle={() => setForm({ ...form, autoAssign: !form.autoAssign })}
          />

          <ToggleSettingCard
            label={t({
              ko: "YOLO 모드",
              en: "YOLO Mode",
              ja: "YOLO モード",
              zh: "YOLO 模式",
              fr: "Mode autonome (YOLO)",
            })}
            checked={form.yoloMode === true}
            onToggle={() => setForm({ ...form, yoloMode: !(form.yoloMode === true) })}
            title={t({
              ko: "켜면 기획팀장이 의사결정 단계를 자동으로 분석하고 다음 단계를 진행합니다.",
              en: "When enabled, the planning lead auto-analyzes decision steps and proceeds automatically.",
              ja: "有効にすると、企画リードが意思決定段階を自動分析して次段階へ進めます。",
              zh: "启用后，规划负责人会自动分析决策步骤并推进到下一阶段。",
              fr: "Activé, le responsable Planification analyse seul les décisions et passe à l'étape suivante.",
            })}
          />

          <ToggleSettingCard
            label={t({
              ko: "자동 업데이트 (전역)",
              en: "Auto Update (Global)",
              ja: "Auto Update（全体）",
              zh: "自动更新（全局）",
              fr: "Mises à jour automatiques",
            })}
            checked={form.autoUpdateEnabled}
            onToggle={() => setForm({ ...form, autoUpdateEnabled: !form.autoUpdateEnabled })}
            title={t({
              ko: "서버 전체 자동 업데이트 루프를 켜거나 끕니다.",
              en: "Enable or disable auto-update loop for the whole server.",
              ja: "サーバー全体の自動更新ループを有効/無効にします。",
              zh: "启用或禁用整个服务器的自动更新循环。",
              fr: "Active ou coupe la mise à jour automatique de tout le serveur.",
            })}
          />

          <ToggleSettingCard
            label={t({
              ko: "OAuth 자동 스왑",
              en: "OAuth Auto Swap",
              ja: "OAuth 自動スワップ",
              zh: "OAuth 自动切换",
              fr: "Bascule OAuth automatique",
            })}
            checked={form.oauthAutoSwap !== false}
            onToggle={() => setForm({ ...form, oauthAutoSwap: !(form.oauthAutoSwap !== false) })}
            title={t({
              ko: "실패/한도 시 다음 OAuth 계정으로 자동 전환",
              en: "Auto-switch to next OAuth account on failures/limits",
              ja: "失敗/上限時に次の OAuth アカウントへ自動切替",
              zh: "失败/额度限制时自动切换到下一个 OAuth 账号",
              fr: "Passe au compte OAuth suivant en cas d'échec ou de limite atteinte",
            })}
          />
        </div>

        <div className="qg-field">
          <label className="qg-field__label" htmlFor={`${id}-provider`}>
            {t({
              ko: "기본 CLI 프로바이더",
              en: "Default CLI Provider",
              ja: "デフォルト CLI プロバイダ",
              zh: "默认 CLI 提供方",
              fr: "Fournisseur CLI par défaut",
            })}
          </label>
          <select
            id={`${id}-provider`}
            value={form.defaultProvider}
            onChange={(e) => setForm({ ...form, defaultProvider: e.target.value as CliProvider })}
            className="qg-select w-full"
          >
            <option value="claude">Claude Code</option>
            <option value="codex">Codex CLI</option>
            <option value="gemini">Gemini CLI</option>
            <option value="opencode">OpenCode</option>
          </select>
        </div>

        <div className="qg-field">
          <label className="qg-field__label" htmlFor={`${id}-language`}>
            {t({ ko: "언어", en: "Language", ja: "言語", zh: "语言", fr: "Langue" })}
          </label>
          <select
            id={`${id}-language`}
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value as LocalSettings["language"] })}
            className="qg-select w-full"
          >
            <option value="fr">Français</option>
            <option value="ko">{t({ ko: "한국어", en: "Korean", ja: "韓国語", zh: "韩语", fr: "Coréen" })}</option>
            <option value="en">{t({ ko: "영어", en: "English", ja: "英語", zh: "英语", fr: "Anglais" })}</option>
            <option value="ja">{t({ ko: "일본어", en: "Japanese", ja: "日本語", zh: "日语", fr: "Japonais" })}</option>
            <option value="zh">{t({ ko: "중국어", en: "Chinese", ja: "中国語", zh: "中文", fr: "Chinois" })}</option>
          </select>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <span role="status" className="flex items-center gap-1.5 text-sm" style={{ color: "var(--qg-accent)" }}>
          {saved && (
            <>
              <Check size={16} aria-hidden="true" />
              {t({ ko: "저장 완료", en: "Saved", ja: "保存完了", zh: "已保存", fr: "Enregistré" })}
            </>
          )}
        </span>
        <button type="button" onClick={onSave} className="qg-btn qg-btn--primary">
          {t({ ko: "저장", en: "Save", ja: "保存", zh: "保存", fr: "Enregistrer" })}
        </button>
      </div>
    </>
  );
}
