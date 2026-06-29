"use client";
import { Hammer } from "lucide-react";

// Temporary empty-state for SAHAMIT sub-pages whose UI lands in a later phase.
// Phase 0 scaffolds the routes + module shell; this keeps navigation working
// end-to-end without 404s until each page is built.
export default function SahamitPlaceholder({ phase, note }) {
  return (
    <div
      className="empty-state dashed"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "48px 24px", textAlign: "center" }}
    >
      <Hammer size={28} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
      <div style={{ fontSize: "15px", fontWeight: 600 }}>อยู่ระหว่างพัฒนา · {phase}</div>
      {note && <div style={{ color: "var(--text-3)", fontSize: "13px", maxWidth: "520px", lineHeight: 1.6 }}>{note}</div>}
    </div>
  );
}
