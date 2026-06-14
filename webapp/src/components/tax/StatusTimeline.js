"use client";
import { Check, X, Clock, Dot } from "lucide-react";

// Vertical status timeline for a single registration / order detail page.
// Renders the workflow steps top-to-bottom with done / current / rejected /
// upcoming states, plus optional meta (who / when) under each step.
//
// Props.steps — [{ label, state, meta }]
//   state: "done" | "current" | "rejected" | "upcoming"
//   meta:  optional secondary line (actor, timestamp, reason)
const STATE = {
  done: { Icon: Check, ring: "var(--green)", bg: "var(--green-soft)", text: "var(--text)" },
  current: { Icon: Clock, ring: "var(--accent)", bg: "var(--accent-soft)", text: "var(--text)" },
  rejected: { Icon: X, ring: "var(--red)", bg: "var(--red-soft)", text: "var(--red)" },
  upcoming: { Icon: Dot, ring: "var(--border)", bg: "transparent", text: "var(--text-3)" },
};

export default function StatusTimeline({ steps = [] }) {
  return (
    <ol className="relative flex flex-col">
      {steps.map((s, i) => {
        const st = STATE[s.state] || STATE.upcoming;
        const Icon = st.Icon;
        const last = i === steps.length - 1;
        return (
          <li key={i} className="flex gap-3 pb-5 last:pb-0 relative">
            {!last && (
              <span className="absolute left-[13px] top-7 bottom-0 w-px bg-[var(--border)]" aria-hidden="true" />
            )}
            <span
              className="shrink-0 inline-flex items-center justify-center rounded-full"
              style={{ width: 27, height: 27, border: `2px solid ${st.ring}`, background: st.bg, color: st.ring }}
            >
              <Icon size={15} />
            </span>
            <div className="pt-0.5">
              <div className="text-[13px] font-semibold" style={{ color: st.text }}>{s.label}</div>
              {s.meta && <div className="text-[11px] text-[var(--text-3)] mt-0.5">{s.meta}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
