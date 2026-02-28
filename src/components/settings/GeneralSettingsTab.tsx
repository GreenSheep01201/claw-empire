import type { CliProvider } from "../../types";
import type { LocalSettings, SetLocalSettings, TFunction } from "./types";

interface GeneralSettingsTabProps {
  t: TFunction;
  form: LocalSettings;
  setForm: SetLocalSettings;
  saved: boolean;
  onSave: () => void;
}

export default function GeneralSettingsTab({ t, form, setForm, saved, onSave }: GeneralSettingsTabProps) {
  return (
    <>
      <section
        className="rounded-xl p-5 sm:p-6 space-y-5"
        style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
      >
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--th-text-primary)" }}>
          {t({ ko: "회사 정보", en: "Company", ja: "会社情報", zh: "公司信息" })}
        </h3>

        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "회사명", en: "Company Name", ja: "会社名", zh: "公司名称" })}
          </label>
          <input
            type="text"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
            style={{
              background: "var(--th-input-bg)",
              borderColor: "var(--th-input-border)",
              color: "var(--th-text-primary)",
            }}
          />
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "CEO 이름", en: "CEO Name", ja: "CEO 名", zh: "CEO 名称" })}
          </label>
          <input
            type="text"
            value={form.ceoName}
            onChange={(e) => setForm({ ...form, ceoName: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
            style={{
              background: "var(--th-input-bg)",
              borderColor: "var(--th-input-border)",
              color: "var(--th-text-primary)",
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm" style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "자동 배정", en: "Auto Assign", ja: "自動割り当て", zh: "自动分配" })}
          </label>
          <button
            onClick={() => setForm({ ...form, autoAssign: !form.autoAssign })}
            className={`w-11 h-6 rounded-full transition-colors relative ${form.autoAssign ? "bg-blue-500" : "bg-slate-600"}`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${
                form.autoAssign ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm" style={{ color: "var(--th-text-secondary)" }}>
            {t({
              ko: "자동 업데이트 (전역)",
              en: "Auto Update (Global)",
              ja: "Auto Update（全体）",
              zh: "自动更新（全局）",
            })}
          </label>
          <button
            onClick={() => setForm({ ...form, autoUpdateEnabled: !form.autoUpdateEnabled })}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              form.autoUpdateEnabled ? "bg-blue-500" : "bg-slate-600"
            }`}
            title={t({
              ko: "서버 전체 자동 업데이트 루프를 켜거나 끕니다.",
              en: "Enable or disable auto-update loop for the whole server.",
              ja: "サーバー全体の自動更新ループを有効/無効にします。",
              zh: "启用或禁用整个服务器的自动更新循环。",
            })}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${
                form.autoUpdateEnabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm" style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "OAuth 자동 스왑", en: "OAuth Auto Swap", ja: "OAuth 自動スワップ", zh: "OAuth 自动切换" })}
          </label>
          <button
            onClick={() => setForm({ ...form, oauthAutoSwap: !(form.oauthAutoSwap !== false) })}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              form.oauthAutoSwap !== false ? "bg-blue-500" : "bg-slate-600"
            }`}
            title={t({
              ko: "실패/한도 시 다음 OAuth 계정으로 자동 전환",
              en: "Auto-switch to next OAuth account on failures/limits",
              ja: "失敗/上限時に次の OAuth アカウントへ自動切替",
              zh: "失败/额度限制时自动切换到下一个 OAuth 账号",
            })}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${
                form.oauthAutoSwap !== false ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--th-text-secondary)" }}>
            {t({
              ko: "기본 CLI 프로바이더",
              en: "Default CLI Provider",
              ja: "デフォルト CLI プロバイダ",
              zh: "默认 CLI 提供方",
            })}
          </label>
          <select
            value={form.defaultProvider}
            onChange={(e) => setForm({ ...form, defaultProvider: e.target.value as CliProvider })}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
            style={{
              background: "var(--th-input-bg)",
              borderColor: "var(--th-input-border)",
              color: "var(--th-text-primary)",
            }}
          >
            <option value="claude">Claude Code</option>
            <option value="codex">Codex CLI</option>
            <option value="gemini">Gemini CLI</option>
            <option value="opencode">OpenCode</option>
            <option value="cursor">Cursor Agent</option>
          </select>
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "언어", en: "Language", ja: "言語", zh: "语言" })}
          </label>
          <select
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value as LocalSettings["language"] })}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
            style={{
              background: "var(--th-input-bg)",
              borderColor: "var(--th-input-border)",
              color: "var(--th-text-primary)",
            }}
          >
            <option value="ko">{t({ ko: "한국어", en: "Korean", ja: "韓国語", zh: "韩语" })}</option>
            <option value="en">{t({ ko: "영어", en: "English", ja: "英語", zh: "英语" })}</option>
            <option value="ja">{t({ ko: "일본어", en: "Japanese", ja: "日本語", zh: "日语" })}</option>
            <option value="zh">{t({ ko: "중국어", en: "Chinese", ja: "中国語", zh: "中文" })}</option>
          </select>
        </div>
      </section>

      <div className="flex justify-end gap-3">
        {saved && (
          <span className="text-green-400 text-sm self-center">
            ✅ {t({ ko: "저장 완료", en: "Saved", ja: "保存完了", zh: "已保存" })}
          </span>
        )}
        <button
          onClick={onSave}
          className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
        >
          {t({ ko: "저장", en: "Save", ja: "保存", zh: "保存" })}
        </button>
      </div>
    </>
  );
}
