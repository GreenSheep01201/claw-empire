import { useState, useCallback, useEffect, useId } from "react";
import { RotateCcw } from "lucide-react";
import Dialog from "./ui/Dialog";
import { pickLang, type LangText, type UiLanguage } from "../i18n";

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

type DeptTheme = { floor1: number; floor2: number; wall: number; accent: number };

export interface OfficeRoomManagerProps {
  departments: Array<{ id: string; name: string }>;
  customThemes: Record<string, DeptTheme>;
  onThemeChange: (themes: Record<string, DeptTheme>) => void;
  onActiveDeptChange?: (deptId: string | null) => void;
  onClose: () => void;
  language: UiLanguage;
}

/* ================================================================== */
/*  Constants                                                           */
/* ================================================================== */

const DEFAULT_THEMES: Record<string, DeptTheme> = {
  dev: { floor1: 0xd8e8f5, floor2: 0xcce1f2, wall: 0x6c96b7, accent: 0x5a9fd4 },
  design: { floor1: 0xe8def2, floor2: 0xe1d4ee, wall: 0x9378ad, accent: 0x9a6fc4 },
  planning: { floor1: 0xf0e1c5, floor2: 0xeddaba, wall: 0xae9871, accent: 0xd4a85a },
  operations: { floor1: 0xd0eede, floor2: 0xc4ead5, wall: 0x6eaa89, accent: 0x5ac48a },
  qa: { floor1: 0xf0cbcb, floor2: 0xedc0c0, wall: 0xae7979, accent: 0xd46a6a },
  devsecops: { floor1: 0xf0d5c5, floor2: 0xedcdba, wall: 0xae8871, accent: 0xd4885a },
  ceoOffice: { floor1: 0xe5d9b9, floor2: 0xdfd0a8, wall: 0x998243, accent: 0xa77d0c },
  breakRoom: { floor1: 0xf7e2b7, floor2: 0xf6dead, wall: 0xa99c83, accent: 0xf0c878 },
};

const DEFAULT_TONE = 50;

const labels = {
  title: {
    ko: "사무실 관리",
    en: "Arrange the office",
    ja: "オフィス管理",
    zh: "办公室管理",
    fr: "Aménager le bureau",
  },
  accent: { ko: "메인 색상", en: "Main color", ja: "メインカラー", zh: "主色调", fr: "Couleur principale" },
  tone: {
    ko: "톤 (밝기)",
    en: "Tone (brightness)",
    ja: "トーン（明るさ）",
    zh: "色调（亮度）",
    fr: "Teinte (luminosité)",
  },
  reset: { ko: "초기화", en: "Reset", ja: "リセット", zh: "重置", fr: "Réinitialiser" },
  resetAll: { ko: "전체 초기화", en: "Reset all", ja: "全てリセット", zh: "全部重置", fr: "Tout réinitialiser" },
  close: { ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" },
  presets: { ko: "프리셋", en: "Presets", ja: "プリセット", zh: "预设", fr: "Teintes proposées" },
  light: { ko: "밝게", en: "Light", ja: "明るい", zh: "浅", fr: "Clair" },
  dark: { ko: "어둡게", en: "Dark", ja: "暗い", zh: "深", fr: "Foncé" },
  presetTone: { ko: "톤", en: "Tone", ja: "トーン", zh: "色调", fr: "Teinte" },
} satisfies Record<string, LangText>;

/* ================================================================== */
/*  Color helpers                                                       */
/* ================================================================== */

function numToHex(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}

function hexToNum(h: string): number {
  return parseInt(h.replace("#", ""), 16);
}

function blendColor(from: number, to: number, t: number): number {
  const c = Math.max(0, Math.min(1, t));
  const fr = (from >> 16) & 0xff,
    fg = (from >> 8) & 0xff,
    fb = from & 0xff;
  const tr = (to >> 16) & 0xff,
    tg = (to >> 8) & 0xff,
    tb = to & 0xff;
  return (
    (Math.round(fr + (tr - fr) * c) << 16) | (Math.round(fg + (tg - fg) * c) << 8) | Math.round(fb + (tb - fb) * c)
  );
}

const TONE_PRESET_STEPS = [15, 25, 35, 45, 55, 65, 75, 85] as const;

function generateTonePresets(accent: number): Array<{ tone: number; swatch: number }> {
  return TONE_PRESET_STEPS.map((tone) => ({
    tone,
    swatch: deriveTheme(accent, tone).wall,
  }));
}

function deriveTheme(accent: number, tone: number): DeptTheme {
  const t = tone / 100;
  return {
    accent,
    floor1: blendColor(accent, 0xffffff, 0.85 - t * 0.004 * 100),
    floor2: blendColor(accent, 0xffffff, 0.78 - t * 0.004 * 100),
    wall: blendColor(accent, 0x888888, 0.3 + t * 0.004 * 100),
  };
}

/* Reverse-infer a tone value from an existing theme (best-effort, default 50) */
function inferTone(theme: DeptTheme): number {
  // We try to infer from floor1 blend ratio: floor1 = blend(accent, white, 0.85 - tone*0.4)
  // ratio r = (0.85 - tone*0.4) => tone = (0.85 - r) / 0.4
  const ar = (theme.accent >> 16) & 0xff;
  const af = (theme.floor1 >> 16) & 0xff;
  if (ar === 0xff) return DEFAULT_TONE; // avoid degenerate
  const r = (af - ar) / (0xff - ar);
  const tone = Math.round(((0.85 - r) / 0.4) * 100);
  return Math.max(0, Math.min(100, isNaN(tone) ? DEFAULT_TONE : tone));
}

/* ================================================================== */
/*  Per-department state                                                */
/* ================================================================== */

interface DeptState {
  accent: number;
  tone: number;
}

function initDeptState(deptId: string, customThemes: Record<string, DeptTheme>): DeptState {
  const theme = customThemes[deptId] ?? DEFAULT_THEMES[deptId];
  if (!theme) return { accent: 0x5a9fd4, tone: DEFAULT_TONE };
  return { accent: theme.accent, tone: inferTone(theme) };
}

/* ================================================================== */
/*  Sub-component: DeptCard                                             */
/* ================================================================== */

interface DeptCardProps {
  deptId: string;
  deptName: string;
  state: DeptState;
  language: UiLanguage;
  onActivate: () => void;
  onAccentChange: (accent: number) => void;
  onToneChange: (tone: number) => void;
  onReset: () => void;
}

function DeptCard({
  deptId,
  deptName,
  state,
  language,
  onActivate,
  onAccentChange,
  onToneChange,
  onReset,
}: DeptCardProps) {
  const theme = deriveTheme(state.accent, state.tone);
  const presets = generateTonePresets(state.accent);
  const accentId = useId();
  const toneId = useId();
  const tr = (text: LangText) => pickLang(language, text);

  return (
    <section className="qg-card space-y-3" aria-label={deptName}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-[var(--th-text-heading)]">{deptName}</h3>
        <button
          type="button"
          onClick={() => {
            onActivate();
            onReset();
          }}
          className="qg-btn qg-btn--sm qg-btn--ghost"
        >
          <RotateCcw size={14} aria-hidden />
          {tr(labels.reset)}
        </button>
      </div>

      <div className="flex h-6 gap-1 overflow-hidden rounded border border-[var(--th-border)]" aria-hidden>
        <div className="flex-1" style={{ backgroundColor: numToHex(theme.floor1) }} />
        <div className="flex-1" style={{ backgroundColor: numToHex(theme.floor2) }} />
        <div className="flex-1" style={{ backgroundColor: numToHex(theme.wall) }} />
        <div className="w-6 flex-none" style={{ backgroundColor: numToHex(theme.accent) }} />
      </div>

      <div className="qg-field">
        <span className="qg-field__label">{tr(labels.presets)}</span>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const selected = Math.abs(state.tone - preset.tone) <= 2;
            return (
              <button
                key={preset.tone}
                type="button"
                onClick={() => {
                  onActivate();
                  onToneChange(preset.tone);
                }}
                aria-label={`${tr(labels.presetTone)} ${preset.tone}`}
                aria-pressed={selected}
                className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: numToHex(preset.swatch),
                  borderColor: selected ? "var(--th-text-heading)" : "transparent",
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor={accentId} className="qg-field__label w-36 shrink-0">
          {tr(labels.accent)}
        </label>
        <input
          id={accentId}
          type="color"
          value={numToHex(state.accent)}
          onChange={(e) => {
            onActivate();
            onAccentChange(hexToNum(e.target.value));
          }}
          onInput={(e) => {
            onActivate();
            onAccentChange(hexToNum((e.target as HTMLInputElement).value));
          }}
          className="h-9 w-9 cursor-pointer rounded border border-[var(--th-border-strong)] bg-transparent p-0"
        />
        <span className="qg-text-muted font-mono text-[13px]">{numToHex(state.accent)}</span>
      </div>

      <div className="qg-field">
        <div className="flex items-center justify-between">
          <label htmlFor={toneId} className="qg-field__label">
            {tr(labels.tone)}
          </label>
          <span className="qg-text-muted text-[13px]">{state.tone}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="qg-text-muted text-[13px]">{tr(labels.light)}</span>
          <input
            id={toneId}
            type="range"
            min={0}
            max={100}
            value={state.tone}
            onChange={(e) => {
              onActivate();
              onToneChange(Number(e.target.value));
            }}
            onInput={(e) => {
              onActivate();
              onToneChange(Number((e.target as HTMLInputElement).value));
            }}
            className="h-1.5 flex-1 cursor-pointer"
          />
          <span className="qg-text-muted text-[13px]">{tr(labels.dark)}</span>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  Main component                                                      */
/* ================================================================== */

export default function OfficeRoomManager({
  departments,
  customThemes,
  onThemeChange,
  onActiveDeptChange,
  onClose,
  language,
}: OfficeRoomManagerProps) {
  const [deptStates, setDeptStates] = useState<Record<string, DeptState>>(() => {
    const result: Record<string, DeptState> = {};
    for (const dept of departments) {
      result[dept.id] = initDeptState(dept.id, customThemes);
    }
    return result;
  });

  const buildAndEmit = useCallback(
    (next: Record<string, DeptState>) => {
      const themes: Record<string, DeptTheme> = {};
      for (const [id, s] of Object.entries(next)) {
        themes[id] = deriveTheme(s.accent, s.tone);
      }
      onThemeChange(themes);
    },
    [onThemeChange],
  );

  const updateDept = useCallback(
    (deptId: string, patch: Partial<DeptState>) => {
      setDeptStates((prev) => {
        const next = { ...prev, [deptId]: { ...prev[deptId], ...patch } };
        buildAndEmit(next);
        return next;
      });
    },
    [buildAndEmit],
  );

  const resetDept = useCallback(
    (deptId: string) => {
      const def = DEFAULT_THEMES[deptId];
      if (!def) return;
      const next: DeptState = { accent: def.accent, tone: inferTone(def) };
      setDeptStates((prev) => {
        const updated = { ...prev, [deptId]: next };
        buildAndEmit(updated);
        return updated;
      });
    },
    [buildAndEmit],
  );

  const resetAll = useCallback(() => {
    const next: Record<string, DeptState> = {};
    for (const dept of departments) {
      const def = DEFAULT_THEMES[dept.id];
      next[dept.id] = def ? { accent: def.accent, tone: inferTone(def) } : { accent: 0x5a9fd4, tone: DEFAULT_TONE };
    }
    setDeptStates(next);
    buildAndEmit(next);
  }, [departments, buildAndEmit]);

  const activateDept = useCallback(
    (deptId: string) => {
      onActiveDeptChange?.(deptId);
    },
    [onActiveDeptChange],
  );

  useEffect(() => () => onActiveDeptChange?.(null), [onActiveDeptChange]);

  return (
    <Dialog
      open
      placement="side"
      onClose={onClose}
      title={pickLang(language, labels.title)}
      closeLabel={pickLang(language, labels.close)}
      footer={
        <button type="button" onClick={resetAll} className="qg-btn">
          <RotateCcw size={16} aria-hidden />
          {pickLang(language, labels.resetAll)}
        </button>
      }
    >
      <div className="space-y-3">
        {departments.map((dept) => {
          const state = deptStates[dept.id] ?? { accent: 0x5a9fd4, tone: DEFAULT_TONE };
          return (
            <DeptCard
              key={dept.id}
              deptId={dept.id}
              deptName={dept.name}
              state={state}
              language={language}
              onActivate={() => activateDept(dept.id)}
              onAccentChange={(accent) => updateDept(dept.id, { accent })}
              onToneChange={(tone) => updateDept(dept.id, { tone })}
              onReset={() => resetDept(dept.id)}
            />
          );
        })}
      </div>
    </Dialog>
  );
}
