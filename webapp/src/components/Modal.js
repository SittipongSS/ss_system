"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

// Reusable centered modal built on the design system's .overlay/.drawer classes.
//
// `dismissible` (default true): when false the modal can't be closed via the
// overlay, Escape, or the X button — used for forced flows (e.g. mandatory
// password change on first login).
//
// `closeOnOverlay` (default false): clicking the dark area outside the modal
// does nothing, so a stray click never discards what the user was doing. Close
// is always deliberate — the X button, Escape, or the modal's own buttons. Pass
// `closeOnOverlay` (true) for the rare case where outside-click-to-dismiss is
// genuinely wanted.
export default function Modal({ open, onClose, title, children, size = "md", dismissible = true, closeOnOverlay = false }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  }, [onClose, dismissible]);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    const previousActiveElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const focusableElements = () => (
      dialog ? [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)] : []
    );

    const onKey = (e) => {
      if (e.key === "Escape" && dismissibleRef.current) {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;

      const focusable = focusableElements();
      if (!focusable.length) {
        e.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    (focusableElements()[0] || dialog)?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previousActiveElement instanceof HTMLElement && document.contains(previousActiveElement)) {
        previousActiveElement.focus();
      }
    };
  }, [open]);

  if (!open) return null;
  const overlayClose = dismissible && closeOnOverlay ? onClose : undefined;
  return (
    <div className="overlay" onClick={overlayClose}>
      <div
        ref={dialogRef}
        className={`drawer ${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <h3 id={titleId} style={{ fontSize: "15px", fontWeight: 600 }}>{title}</h3>
          {dismissible && (
            <button type="button" className="drawer-close" onClick={onClose} aria-label="ปิด">
              <X size={16} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
