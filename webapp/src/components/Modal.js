"use client";
import { useEffect } from "react";
import { X } from "lucide-react";

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && dismissible) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;
  const overlayClose = dismissible && closeOnOverlay ? onClose : undefined;
  return (
    <div className="overlay" onClick={overlayClose}>
      <div className={`drawer ${size}`} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h3 style={{ fontSize: "15px", fontWeight: 600 }}>{title}</h3>
          {dismissible && (
            <button className="drawer-close" onClick={onClose} aria-label="ปิด">
              <X size={16} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
