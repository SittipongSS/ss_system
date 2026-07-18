"use client";
import { useEffect, useId } from "react";
import { X } from "lucide-react";

// Right-side slide-over for a single record: header (title + status badge),
// scrollable body, sticky footer for actions. Built on the shared `.overlay`
// backdrop; the panel itself is theme-token styled inline (no globals change).
//
//   open / onClose, title, subtitle, badge (ReactNode), footer (ReactNode), children
export default function RecordDrawer({ open, onClose, title, subtitle, badge, footer, closeOnOverlay = true, children }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" onClick={closeOnOverlay ? onClose : undefined} style={{ justifyContent: "flex-end", alignItems: "stretch", padding: 0 }}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, 100%)", height: "100%", background: "var(--panel-2)",
          boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column",
          borderLeft: "1px solid var(--border)",
        }}
      >
        <header
          className="flex items-start justify-between gap-3"
          style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)" }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 id={titleId} style={{ fontSize: 16, fontWeight: 700 }}>{title}</h3>
              {badge}
            </div>
            {subtitle && <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 3 }}>{subtitle}</p>}
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="ปิด"><X size={16} /></button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>{children}</div>

        {footer && (
          <footer
            className="flex items-center justify-end gap-2 flex-wrap"
            style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", background: "var(--panel)" }}
          >
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}

// Label/value row helper for drawer bodies.
export function Field({ label, children, full = false }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: "var(--text)" }}>{children ?? "-"}</div>
    </div>
  );
}
