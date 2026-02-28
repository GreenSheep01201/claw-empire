import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { EMOJI_GROUPS } from "./constants";

export function StackedSpriteIcon({ sprites }: { sprites: [number, number] }) {
  return (
    <span className="relative inline-flex items-center" style={{ width: 22, height: 16 }}>
      <img
        src={`/sprites/${sprites[0]}-D-1.png`}
        alt=""
        className="absolute left-0 top-0 w-4 h-4 rounded-full object-cover"
        style={{ imageRendering: "pixelated", opacity: 0.85 }}
      />
      <img
        src={`/sprites/${sprites[1]}-D-1.png`}
        alt=""
        className="absolute left-1.5 top-px w-4 h-4 rounded-full object-cover"
        style={{ imageRendering: "pixelated", zIndex: 1 }}
      />
    </span>
  );
}

export default function EmojiPicker({
  value,
  onChange,
  size = "md",
}: {
  value: string;
  onChange: (emoji: string) => void;
  size?: "sm" | "md";
}) {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const btnSize = size === "sm" ? "w-10 h-10 text-lg" : "w-14 h-10 text-xl";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${btnSize} rounded-lg border flex items-center justify-center transition-all hover:scale-105 hover:shadow-md`}
        style={{ background: "var(--th-input-bg)", borderColor: "var(--th-input-border)" }}
      >
        {value || "❓"}
      </button>
      {open && (
        <div
          className="absolute z-[60] top-full mt-1 left-0 rounded-xl shadow-2xl p-3 w-72 max-h-[60vh] overflow-y-auto overscroll-contain"
          style={{
            background: "var(--th-card-bg)",
            border: "1px solid var(--th-card-border)",
            backdropFilter: "blur(20px)",
          }}
        >
          {EMOJI_GROUPS.map((group) => (
            <div key={group.label} className="mb-2 last:mb-0">
              <div
                className="text-[10px] font-semibold uppercase tracking-widest mb-1"
                style={{ color: "var(--th-text-muted)" }}
              >
                {locale.startsWith("ko") ? group.label : locale.startsWith("ja") ? group.labelJa : locale.startsWith("zh") ? group.labelZh : group.labelEn}
              </div>
              <div className="grid grid-cols-8 gap-0.5">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onChange(emoji);
                      setOpen(false);
                    }}
                    className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all hover:scale-125 hover:bg-[var(--th-bg-surface-hover)] ${
                      value === emoji ? "ring-2 ring-blue-400 bg-blue-500/15" : ""
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
