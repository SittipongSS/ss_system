"use client";

import { Trophy } from "lucide-react";
import { STAGE_LABELS } from "@/lib/salesPlanning";
import { fmtMoneyCompact } from "@/lib/format";

// Shared presentational helpers for the Sales Planning pages (overview / deals /
// targets). Kept in one place so the split pages render identical badges/cards.

export const initialDealForm = {
  id: null,
  title: "",
  customerId: "",
  customerName: "",
  stage: "lead",
  projectValue: "",
  probability: "10",
  forecastMonth: "",
  expectedCloseDate: "",
  depositPaid: false,
  notes: "",
};

// Roles that can own a per-person sales target (the SA line). ae_supervisor sets
// team-level targets, not per-person, so it is excluded from the owner picker.
export const TARGET_OWNER_ROLES = ["senior_ae", "ac", "ae"];
export const SALES_TEAMS = ["ODM", "KA", "SV"];

// เงินในแดชบอร์ด/ตารางสรุปแผนขาย — ใช้รูปแบบย่อกลาง (฿x.xxM / ฿x.xxK).
export const money = (value) => fmtMoneyCompact(value);

export const thisMonth = () => new Date().toISOString().slice(0, 7);

// Short Thai month labels — shared so every Sales Planning page renders the same
// month names in the period picker and year grids.
export const MONTH_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function monthsForYear(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

// Unified period picker for the Sales Planning toolbar: a year <select> + a Thai
// month <select> so the "ระยะเวลา" control looks and behaves identically on every
// page (instead of each page hand-rolling a native <input type="month">).
// Pass `onAllMonths` to show the "ทุกเดือน" toggle (list/filter pages); omit it on
// focus-month pages where a single month must always be selected (overview).
export function MonthPicker({ value, onChange, allMonths = false, onAllMonths }) {
  const currentYear = Number(thisMonth().slice(0, 4));
  const year = value.slice(0, 4);
  const yearOptions = Array.from({ length: 7 }, (_, i) => String(currentYear - 3 + i));
  const disabled = !!(onAllMonths && allMonths);
  const dim = { opacity: disabled ? 0.5 : 1 };
  return (
    <>
      <select
        className="premium-select"
        value={year}
        disabled={disabled}
        onChange={(e) => onChange(`${e.target.value}-${value.slice(5, 7)}`)}
        aria-label="ปี"
        style={{ width: 104, ...dim }}
      >
        {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <select
        className="premium-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label="เดือน"
        style={{ width: 150, ...dim }}
      >
        {monthsForYear(year).map((m, i) => <option key={m} value={m}>{MONTH_LABELS[i]} {year}</option>)}
      </select>
      {onAllMonths && (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-2)" }}>
          <input type="checkbox" checked={allMonths} onChange={(e) => onAllMonths(e.target.checked)} /> ทุกเดือน
        </label>
      )}
    </>
  );
}

export function coveragePct(won, target) {
  if (!target || target <= 0) return null;
  return Math.round((Number(won || 0) / Number(target)) * 100);
}

export function stageBadge(stage) {
  const color = {
    lead: "var(--text-3)",
    qualified: "var(--blue)",
    quotation: "var(--amber)",
    timeline_proposed: "var(--blue)",
    awaiting_confirm: "var(--teal)",
    deposit_pending: "var(--violet)",
    won: "var(--green)",
    in_project: "var(--green)",
    lost: "var(--red)",
  }[stage] || "var(--text-3)";
  return (
    <span className="ui-badge" style={{ color, borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}>
      {stage === "won" && <Trophy size={12} style={{ marginRight: 4, verticalAlign: "-1px" }} />}
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

export function KpiCard({ icon, label, value, hint }) {
  return (
    <div className="glass-panel" style={{ padding: "16px", minHeight: 108 }}>
      <div className="flex items-center gap-2" style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 600 }}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-mono tabular-nums" style={{ marginTop: 10, fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
        {value}
      </div>
      {hint && <div style={{ marginTop: 4, color: "var(--text-3)", fontSize: 12 }}>{hint}</div>}
    </div>
  );
}
