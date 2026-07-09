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
  projectType: "NPD", // NPD | RE-ORDER — ส่งต่อเป็นค่าตั้งต้นตอนสร้างไทม์ไลน์ PM
  brand: "",          // ชื่อแบรนด์ (เลือกจากแบรนด์ของลูกค้า) — เก็บใน metadata.brand
  projectValue: "",
  probability: "50",
  forecastMonth: "",
  expectedCloseDate: "",
  depositPaid: false,
  notes: "",
};

// โอกาสที่จะปิดได้ (FC%) — 4 ระดับให้ผู้ใช้เลือกตอนเพิ่ม/แก้โครงการ. เป็นข้อมูลช่วย
// จัดลำดับความน่าจะปิด ไม่ได้ถ่วงยอด (FC = มูลค่าเต็มตาม M6 ในแผน merge).
export const FORECAST_LEVELS = [
  { value: 20, label: "20% · เริ่มต้น" },
  { value: 50, label: "50% · ปานกลาง" },
  { value: 80, label: "80% · น่าจะปิดได้" },
  { value: 100, label: "100% · ปิดได้แล้ว" },
];

// snap ค่า probability เดิม (10/30/55/65/75/90 ฯลฯ) ให้เข้าระดับ FC ที่ใกล้ที่สุด
export function snapForecastLevel(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return 50;
  return FORECAST_LEVELS.reduce((best, l) => (Math.abs(l.value - n) < Math.abs(best - n) ? l.value : best), FORECAST_LEVELS[0].value);
}

export function forecastBadge(probability) {
  const p = snapForecastLevel(probability);
  const color = { 20: "var(--text-3)", 50: "var(--amber)", 80: "var(--teal)", 100: "var(--green)" }[p] || "var(--text-3)";
  return (
    <span className="ui-badge" style={{ color, borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}>
      FC {p}%
    </span>
  );
}

// Roles that can own a per-person sales target. AC (Account Coordinate) is
// back-office and does not carry a sales target, so it is excluded; ae_supervisor
// sets team-level targets, not per-person, so it is excluded too.
export const TARGET_OWNER_ROLES = ["senior_ae", "ae"];
// ลำดับทีมมาตรฐาน KA → ODM → SV (ใช้ทั้งคอลัมน์/แถวหน้าวางเป้า และการจัดกลุ่มภาพรวม)
export const SALES_TEAMS = ["KA", "ODM", "SV"];

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
  // โหมด "ทุกเดือน": ปิดเฉพาะตัวเลือกเดือน (ปียังเปลี่ยนเพื่อดูทั้งปีอื่นได้)
  const disabled = !!(onAllMonths && allMonths);
  const dim = { opacity: disabled ? 0.5 : 1 };
  return (
    <>
      <select
        className="premium-select"
        value={year}
        onChange={(e) => onChange(`${e.target.value}-${value.slice(5, 7)}`)}
        aria-label="ปี"
        style={{ width: 104 }}
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
