import { useState } from "react";
import type { Department } from "../../types";
import { localeName, useI18n } from "../../i18n";
import * as api from "../../api";
import { ChevronDown, ChevronUp, ImageUp, LoaderCircle } from "lucide-react";
import { CLI_PROVIDERS, ROLE_LABEL, ROLES } from "./constants";
import EmojiPicker from "./EmojiPicker";
import type { FormData } from "./types";
import Dialog from "../ui/Dialog";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AgentFormModal({
  locale,
  form,
  setForm,
  departments,
  isEdit,
  saving,
  onSave,
  onClose,
}: {
  isKo: boolean;
  locale: string;
  tr: (ko: string, en: string) => string;
  form: FormData;
  setForm: (f: FormData) => void;
  departments: Department[];
  isEdit: boolean;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const tr = (ko: string, en: string, fr?: string) => t({ ko, en, ja: en, zh: en, fr });
  const [, setSpriteFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string> | null>(null);
  const [spriteNum, setSpriteNum] = useState(form.sprite_number ?? 0);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);

  const sectionCls = "text-[13px] font-semibold uppercase tracking-wide qg-text-muted";

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
      title={
        isEdit
          ? t({ ko: "직원 정보 수정", en: "Edit Agent", fr: "Modifier l'agent" })
          : t({ ko: "신규 직원 채용", en: "Hire New Agent", fr: "Recruter un agent" })
      }
    >
      {/* 2-column layout */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* ── Left column: 기본 정보 ── */}
        <div className="space-y-4">
          <div className={sectionCls}>{tr("기본 정보", "Basic Info", "Informations")}</div>
          {/* ── 스프라이트 얼굴 미리보기 + 위/아래 변경 ── */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                className="qg-icon-btn qg-btn--ghost"
                style={{ width: 32, height: 28 }}
                aria-label={tr("다음 스프라이트", "Next sprite", "Apparence suivante")}
                onClick={() => {
                  const next = Math.max(1, spriteNum || 0) + 1;
                  setSpriteNum(next);
                  setForm({ ...form, sprite_number: next });
                }}
              >
                <ChevronUp size={16} aria-hidden="true" />
              </button>
              <div
                className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
                style={{ border: "2px solid var(--th-input-border)", background: "var(--th-bg-surface-hover)" }}
              >
                {spriteNum > 0 ? (
                  <img
                    src={`/sprites/${spriteNum}-D-1.png`}
                    alt={`sprite ${spriteNum}`}
                    className="w-full h-full object-cover"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : (
                  <span className="text-2xl">{form.avatar_emoji || "🤖"}</span>
                )}
              </div>
              <button
                type="button"
                className="qg-icon-btn qg-btn--ghost"
                style={{ width: 32, height: 28 }}
                aria-label={tr("이전 스프라이트", "Previous sprite", "Apparence précédente")}
                onClick={() => {
                  const next = Math.max(1, (spriteNum || 1) - 1);
                  setSpriteNum(next);
                  setForm({ ...form, sprite_number: next });
                }}
              >
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <span className="qg-badge font-mono">#{spriteNum || "—"}</span>
              <div className="qg-field mt-2">
                <label className="qg-field__label" htmlFor="agent-form-name">
                  {tr("영문 이름", "Name", "Nom")} <span aria-hidden="true">*</span>
                </label>
                <input
                  id="agent-form-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="DORO"
                  required
                  className="qg-input"
                />
              </div>
            </div>
          </div>
          {/* 로캘 기반 현지 이름 필드 */}
          {locale.startsWith("ko") && (
            <div className="qg-field">
              <label className="qg-field__label" htmlFor="agent-form-name-ko">
                {tr("한글 이름", "Korean Name", "Nom en coréen")}
              </label>
              <input
                id="agent-form-name-ko"
                type="text"
                value={form.name_ko}
                onChange={(e) => setForm({ ...form, name_ko: e.target.value })}
                placeholder="도로롱"
                className="qg-input"
              />
            </div>
          )}
          {locale.startsWith("ja") && (
            <div className="qg-field">
              <label className="qg-field__label" htmlFor="agent-form-name-ja">
                {t({ ko: "일본어 이름", en: "Japanese Name", ja: "日本語名", zh: "日语名", fr: "Nom en japonais" })}
              </label>
              <input
                id="agent-form-name-ja"
                type="text"
                value={form.name_ja}
                onChange={(e) => setForm({ ...form, name_ja: e.target.value })}
                placeholder="ドロロン"
                className="qg-input"
              />
            </div>
          )}
          {locale.startsWith("zh") && (
            <div className="qg-field">
              <label className="qg-field__label" htmlFor="agent-form-name-zh">
                {t({ ko: "중국어 이름", en: "Chinese Name", ja: "中国語名", zh: "中文名", fr: "Nom en chinois" })}
              </label>
              <input
                id="agent-form-name-zh"
                type="text"
                value={form.name_zh}
                onChange={(e) => setForm({ ...form, name_zh: e.target.value })}
                placeholder="多罗隆"
                className="qg-input"
              />
            </div>
          )}
          <div className="grid grid-cols-[72px_1fr] gap-2">
            <div className="qg-field">
              <span className="qg-field__label">{tr("이모지", "Emoji", "Emoji")}</span>
              <EmojiPicker
                tr={tr}
                value={form.avatar_emoji}
                onChange={(emoji) => setForm({ ...form, avatar_emoji: emoji })}
              />
            </div>
            <div className="qg-field">
              <label className="qg-field__label" htmlFor="agent-form-department">
                {tr("소속 부서", "Department", "Pôle")}
              </label>
              <select
                id="agent-form-department"
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                className="qg-select w-full cursor-pointer"
              >
                <option value="">{tr("— 미배정 —", "— Unassigned —", "— Aucun pôle —")}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.icon} {localeName(locale, d)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Right column: 역할 설정 ── */}
        <div className="space-y-4">
          <div className={sectionCls}>{tr("역할 설정", "Role Config", "Rôle")}</div>
          {/* 직급 */}
          <div className="qg-field">
            <span className="qg-field__label" id="agent-form-role-label">
              {tr("직급", "Role", "Rôle")}
            </span>
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-labelledby="agent-form-role-label">
              {ROLES.map((r) => {
                const active = form.role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setForm({ ...form, role: r })}
                    className="qg-choice justify-center"
                  >
                    {t({ ko: ROLE_LABEL[r].ko, en: ROLE_LABEL[r].en, fr: ROLE_LABEL[r].fr })}
                  </button>
                );
              })}
            </div>
          </div>
          {/* CLI Provider */}
          <div className="qg-field">
            <span className="qg-field__label" id="agent-form-provider-label">
              {tr("CLI 도구", "CLI Provider", "Fournisseur IA")}
            </span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="agent-form-provider-label">
              {CLI_PROVIDERS.map((p) => {
                const active = form.cli_provider === p;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setForm({ ...form, cli_provider: p })}
                    className="qg-choice font-mono"
                    style={{ width: "auto", minHeight: 32, padding: "4px 10px", fontSize: "0.8125rem" }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          {/* 성격/프롬프트 */}
          <div className="qg-field">
            <label className="qg-field__label" htmlFor="agent-form-personality">
              {tr("성격 / 역할 프롬프트", "Personality / Prompt", "Personnalité / consignes")}
            </label>
            <textarea
              id="agent-form-personality"
              value={form.personality}
              onChange={(e) => setForm({ ...form, personality: e.target.value })}
              rows={3}
              placeholder={tr("전문 분야나 성격 설명...", "Expertise or personality...", "Expertise ou personnalité…")}
              className="qg-textarea"
            />
          </div>
        </div>
      </div>

      {/* ── Sprite Upload ── */}
      <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--th-border)" }}>
        <div className={`${sectionCls} mb-3`}>
          {tr("캐릭터 스프라이트", "Character Sprite", "Apparence du personnage")}
        </div>

        {!previews && !processing && (
          <label
            className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors hover:border-[var(--qg-accent)] qg-text-muted"
            style={{ borderColor: "var(--th-input-border)" }}
          >
            <ImageUp size={16} aria-hidden="true" />
            <span className="text-[13px]">
              {tr(
                "4방향 스프라이트 시트 업로드 (2x2 그리드)",
                "Upload 4-direction sprite sheet (2x2 grid)",
                "Importer une planche 4 directions (grille 2x2)",
              )}
            </span>
            <span className="text-[13px]">
              {tr(
                "앞 / 왼 / 뒤 / 오른 순서",
                "Front / Left / Back / Right order",
                "Ordre : face / gauche / dos / droite",
              )}
            </span>
            <span className="text-[13px]">
              {t({
                ko: "(흰색배경)",
                en: "(White background)",
                ja: "（白背景）",
                zh: "（白色背景）",
                fr: "(fond blanc)",
              })}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setSpriteFile(file);
                setProcessing(true);
                setPreviews(null);
                setRegistered(false);
                try {
                  const base64 = await fileToBase64(file);
                  const result = await api.processSprite(base64);
                  setPreviews(result.previews);
                  setSpriteNum(result.suggestedNumber);
                } catch (err) {
                  console.error("Sprite processing failed:", err);
                } finally {
                  setProcessing(false);
                }
              }}
            />
          </label>
        )}

        {processing && (
          <div className="flex items-center justify-center gap-2 py-8 qg-text-muted" role="status">
            <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            <span className="text-sm">
              {tr(
                "배경 제거 및 분할 처리 중...",
                "Removing background & splitting...",
                "Détourage et découpage en cours…",
              )}
            </span>
          </div>
        )}

        {previews && !processing && (
          <div className="space-y-3">
            {/* Preview grid */}
            <div className="grid grid-cols-3 gap-3">
              {(["D", "L", "R"] as const).map((dir) => (
                <div key={dir} className="text-center">
                  <div className="text-[13px] font-medium mb-1 qg-text-muted">
                    {dir === "D"
                      ? tr("정면", "Front", "Face")
                      : dir === "L"
                        ? tr("좌측", "Left", "Gauche")
                        : tr("우측", "Right", "Droite")}
                  </div>
                  <div className="qg-card flex items-center justify-center h-24" style={{ padding: 8 }}>
                    {previews[dir] ? (
                      <img
                        src={previews[dir]}
                        alt={dir}
                        className="max-h-20 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : (
                      <span className="text-[13px] qg-text-muted">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Sprite number + register */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="qg-field__label" htmlFor="agent-form-sprite-num">
                  {tr("스프라이트 번호", "Sprite #", "N° d'apparence")}
                </label>
                <input
                  id="agent-form-sprite-num"
                  type="number"
                  value={spriteNum}
                  onChange={(e) => setSpriteNum(Number(e.target.value))}
                  min={1}
                  className="qg-input text-center"
                  style={{ width: 72 }}
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!previews) return;
                  setRegistering(true);
                  try {
                    await api.registerSprite(previews, spriteNum);
                    setRegistered(true);
                    setForm({ ...form, sprite_number: spriteNum });
                  } catch (err) {
                    console.error("Sprite register failed:", err);
                  } finally {
                    setRegistering(false);
                  }
                }}
                disabled={registering || registered || !spriteNum}
                className={`qg-btn qg-btn--sm ${registered ? "" : "qg-btn--primary"}`}
              >
                {registering
                  ? tr("등록 중...", "Registering...", "Enregistrement…")
                  : registered
                    ? tr("등록 완료!", "Registered!", "Enregistrée")
                    : tr("스프라이트 등록", "Register Sprite", "Enregistrer l'apparence")}
              </button>
              {previews && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviews(null);
                    setSpriteFile(null);
                    setRegistered(false);
                  }}
                  className="qg-btn qg-btn--sm qg-btn--ghost"
                >
                  {tr("다시 업로드", "Re-upload", "Importer à nouveau")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions — full width */}
      <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--th-border)" }}>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !form.name.trim()}
          className="qg-btn qg-btn--primary flex-1"
        >
          {saving
            ? tr("처리 중...", "Saving...", "Enregistrement…")
            : isEdit
              ? tr("변경사항 저장", "Save Changes", "Enregistrer")
              : tr("채용 확정", "Confirm Hire", "Recruter")}
        </button>
        <button type="button" onClick={onClose} className="qg-btn">
          {tr("취소", "Cancel", "Annuler")}
        </button>
      </div>
    </Dialog>
  );
}
