import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n";

type ConfirmDialogProps = {
  open: boolean;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  busy?: boolean;
  ariaLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  message,
  confirmLabel,
  cancelLabel,
  variant = "default",
  busy = false,
  ariaLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!busy && event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const resolvedConfirmLabel = confirmLabel ?? t("common.confirm");
  const resolvedCancelLabel = cancelLabel ?? t("common.cancel");
  const resolvedAriaLabel = ariaLabel ?? t("common.confirm");

  return createPortal(
    <div
      className="dialog-overlay"
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className="dialog-card"
        aria-label={resolvedAriaLabel}
        aria-modal="true"
        role="dialog"
      >
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button
            className="dialog-btn dialog-btn-secondary"
            disabled={busy}
            type="button"
            onClick={onCancel}
          >
            {resolvedCancelLabel}
          </button>
          <button
            className={`dialog-btn ${variant === "danger" ? "dialog-btn-danger" : "dialog-btn-primary"}`}
            disabled={busy}
            type="button"
            onClick={onConfirm}
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
