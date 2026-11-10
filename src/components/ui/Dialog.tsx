import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

type DialogSize = "sm" | "md" | "lg" | "full";
type DialogPlacement = "center" | "side";

interface DialogProps {
  open: boolean;
  title: ReactNode;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  /** Shown right after the title, e.g. a count. */
  titleAdornment?: ReactNode;
  /** Extra header controls placed before the close button. */
  headerActions?: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  /** Set false when an accidental outside click must not close the dialog (e.g. long forms). */
  dismissOnBackdrop?: boolean;
  /** "side" docks the dialog to the right edge, full height (settings-like panels). */
  placement?: DialogPlacement;
  /** Scope class for content-specific styling. */
  className?: string;
}

/**
 * The one modal of QG: a native <dialog> in the top layer, so focus stays
 * inside, the page behind is inert, Escape and a backdrop click close it,
 * and focus returns to whatever opened it.
 */
export default function Dialog({
  open,
  title,
  closeLabel,
  onClose,
  children,
  titleAdornment,
  headerActions,
  footer,
  size = "md",
  dismissOnBackdrop = true,
  placement = "center",
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      opener?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className={`qg-dialog qg-dialog--${size}${placement === "side" ? " qg-dialog--side" : ""}${className ? ` ${className}` : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        // A nested dialog handles its own Escape; React would otherwise bubble it here too.
        if ((event.target as Element).closest("dialog") !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (dismissOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="qg-dialog__sheet">
        <header className="qg-dialog__header">
          <h2 id={titleId} className="qg-dialog__title">
            {title}
          </h2>
          {titleAdornment}
          <div className="qg-dialog__actions">
            {headerActions}
            <button type="button" className="qg-icon-btn" onClick={onClose} aria-label={closeLabel}>
              <X size={18} aria-hidden />
            </button>
          </div>
        </header>
        <div className="qg-dialog__body">{children}</div>
        {footer && <footer className="qg-dialog__footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
