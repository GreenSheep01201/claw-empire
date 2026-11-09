import type { LangText } from "../../i18n";
import type { UiLanguage } from "../../i18n";
import { LOCALE_TEXT } from "./themes-locale";
import type { MobileMoveDirection } from "./model";

type TFunction = (messages: LangText) => string;

interface VirtualPadOverlayProps {
  showVirtualPad: boolean;
  t: TFunction;
  onInteract: () => void;
  onSetMoveDirectionPressed: (direction: MobileMoveDirection, pressed: boolean) => void;
}

const mobilePadButtonClass =
  "pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300/70 bg-transparent text-sm font-bold text-slate-100 shadow-none active:scale-95 active:bg-slate-500/20";

export default function VirtualPadOverlay({
  showVirtualPad,
  t,
  onInteract,
  onSetMoveDirectionPressed,
}: VirtualPadOverlayProps) {
  if (!showVirtualPad) return null;

  return (
    <>
      <div className="pointer-events-none fixed bottom-3 left-1/2 z-50 -translate-x-1/2">
        <button
          type="button"
          aria-label="Interact"
          className="pointer-events-auto flex h-10 min-w-12 items-center justify-center rounded-xl border border-amber-300/80 bg-amber-500/85 px-2 text-[11px] font-bold tracking-wide text-slate-950 shadow-none active:scale-95 active:bg-amber-400"
          style={{ touchAction: "none" }}
          onPointerDown={(event) => event.preventDefault()}
          onClick={onInteract}
        >
          {t(LOCALE_TEXT.mobileEnter)}
        </button>
      </div>

      <div className="pointer-events-none fixed bottom-3 right-3 z-50">
        <div className="grid grid-cols-3 gap-1">
          <div />
          <button
            type="button"
            aria-label="Move up"
            className={mobilePadButtonClass}
            style={{ touchAction: "none" }}
            onPointerDown={() => onSetMoveDirectionPressed("up", true)}
            onPointerUp={() => onSetMoveDirectionPressed("up", false)}
            onPointerCancel={() => onSetMoveDirectionPressed("up", false)}
            onPointerLeave={() => onSetMoveDirectionPressed("up", false)}
          >
            ▲
          </button>
          <div />
          <button
            type="button"
            aria-label="Move left"
            className={mobilePadButtonClass}
            style={{ touchAction: "none" }}
            onPointerDown={() => onSetMoveDirectionPressed("left", true)}
            onPointerUp={() => onSetMoveDirectionPressed("left", false)}
            onPointerCancel={() => onSetMoveDirectionPressed("left", false)}
            onPointerLeave={() => onSetMoveDirectionPressed("left", false)}
          >
            ◀
          </button>
          <div className="h-9 w-9" />
          <button
            type="button"
            aria-label="Move right"
            className={mobilePadButtonClass}
            style={{ touchAction: "none" }}
            onPointerDown={() => onSetMoveDirectionPressed("right", true)}
            onPointerUp={() => onSetMoveDirectionPressed("right", false)}
            onPointerCancel={() => onSetMoveDirectionPressed("right", false)}
            onPointerLeave={() => onSetMoveDirectionPressed("right", false)}
          >
            ▶
          </button>
          <div />
          <button
            type="button"
            aria-label="Move down"
            className={mobilePadButtonClass}
            style={{ touchAction: "none" }}
            onPointerDown={() => onSetMoveDirectionPressed("down", true)}
            onPointerUp={() => onSetMoveDirectionPressed("down", false)}
            onPointerCancel={() => onSetMoveDirectionPressed("down", false)}
            onPointerLeave={() => onSetMoveDirectionPressed("down", false)}
          >
            ▼
          </button>
          <div />
        </div>
      </div>
    </>
  );
}
