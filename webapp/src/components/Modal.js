"use client";
import { useEffect } from "react";
import { X } from "lucide-react";

// Reusable centered modal built on the design system's .overlay/.drawer classes.
// `dismissible` (default true): when false the modal can't be closed via the
// overlay, Escape, or the X button — used for forced flows (e.g. mandatory
// password change on first login).
export default function Modal({ open, onClose, title, children, size = "md", dismissible = true }) {
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
  return (
    <div className="overlay" onClick={dismissible ? onClose : undefined}>
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
