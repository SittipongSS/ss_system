"use client";
import { MapPin } from "lucide-react";

// PO delivery destinations for สหมิตร (factory/warehouse sites). Stored on
// sahamit_po_lines.destination as a key (migration 0057).
export const DESTINATIONS = [
  { key: "bangpakong", label: "บางปะกง" },
  { key: "photharam", label: "โพธาราม" },
  { key: "khonkaen", label: "ขอนแก่น" },
];

export function destinationLabel(key) {
  return DESTINATIONS.find((d) => d.key === key)?.label || null;
}

// Three mutually-exclusive toggle buttons; click a selected one again to clear.
export function DestinationToggle({ value, onChange, size = "sm" }) {
  return (
    <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {DESTINATIONS.map((d) => {
        const on = value === d.key;
        return (
          <button
            key={d.key}
            type="button"
            className={`btn ${size} ${on ? "" : "ghost"}`}
            style={on ? { borderColor: "var(--teal)", color: "var(--teal)", fontWeight: 600 } : undefined}
            onClick={() => onChange(on ? null : d.key)}
          >
            {on && <MapPin size={13} />} {d.label}
          </button>
        );
      })}
    </div>
  );
}
