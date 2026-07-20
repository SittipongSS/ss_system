"use client";
import { Check } from "lucide-react";
import { fmtDateTime } from "@/lib/format";

// Vertical workflow timeline for the record drawer. `steps` is an ordered list
// of { label, at?, by?, state } where state ∈ "done" | "current" | "todo" |
// "rejected". Renders a dotted spine with coloured nodes.
const COLOR = {
  done: "var(--green)",
  current: "var(--accent)",
  rejected: "var(--red)",
  todo: "var(--text-3)",
};

export default function Timeline({ steps = [] }) {
  return (
    <ol className="flex flex-col" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {steps.map((s, i) => {
        const color = COLOR[s.state] || COLOR.todo;
        const last = i === steps.length - 1;
        return (
          <li key={i} className="flex gap-3" style={{ minHeight: last ? "auto" : 44 }}>
            <div className="flex flex-col items-center">
              <span
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: s.state === "todo" ? "transparent" : color,
                  border: `2px solid ${color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {s.state === "done" && <Check size={11} color="var(--accent-fg)" />}
              </span>
              {!last && (
                <span style={{ flex: 1, width: 2, background: "var(--border-strong)", margin: "2px 0" }} />
              )}
            </div>
            <div style={{ paddingBottom: last ? 0 : 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: s.state === "todo" ? "var(--text-3)" : "var(--text)" }}>
                {s.label}
              </div>
              {(s.at || s.by) && (
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {s.by ? `${s.by}` : ""}{s.by && s.at ? " · " : ""}{s.at ? fmtDateTime(s.at) : ""}
                </div>
              )}
              {s.note && (
                <div style={{ fontSize: 12.5, color: "var(--red)", marginTop: 2 }}>{s.note}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
