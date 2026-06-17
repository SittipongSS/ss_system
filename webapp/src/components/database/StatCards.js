"use client";

// A compact row of summary metric cards for master-data list pages.
// Props: items = [{ label, value, tone }] where tone ∈ undefined | "warn" |
// "success" | "danger" | "accent". Tone tints the value (and a soft bg for
// non-neutral cards) so the "needs attention" numbers stand out.
const TONE = {
  warn: { bg: "var(--amber-soft)", fg: "var(--amber)" },
  success: { bg: "var(--green-soft)", fg: "var(--green)" },
  danger: { bg: "var(--red-soft)", fg: "var(--red)" },
  accent: { bg: "var(--accent-soft)", fg: "var(--accent)" },
};

export default function StatCards({ items }) {
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => {
        const t = TONE[it.tone];
        return (
          <div
            key={it.label}
            className="rounded-xl px-4 py-3"
            style={{ background: t ? t.bg : "var(--panel-2)" }}
          >
            <div className="text-[12px]" style={{ color: t ? t.fg : "var(--text-3)" }}>{it.label}</div>
            <div className="text-[22px] font-semibold mt-0.5" style={{ color: t ? t.fg : "var(--text)" }}>
              {it.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
