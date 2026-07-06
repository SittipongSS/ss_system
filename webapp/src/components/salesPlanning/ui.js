"use client";

import { STAGE_LABELS } from "@/lib/salesPlanning";

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

export const initialTargetForm = {
  id: null,
  targetMonth: "",
  team: "",
  ownerId: "",
  ownerName: "",
  targetAmount: "",
  notes: "",
};

// Roles that can own a per-person sales target (the SA line). ae_supervisor sets
// team-level targets, not per-person, so it is excluded from the owner picker.
export const TARGET_OWNER_ROLES = ["senior_ae", "ac", "ae"];
export const SALES_TEAMS = ["ODM", "KA", "SV"];

export const money = (value) =>
  Number(value || 0).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  });

export const thisMonth = () => new Date().toISOString().slice(0, 7);

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

export function PerfTable({ rows, teamMode }) {
  if (!rows?.length) {
    return <div style={{ padding: 14, color: "var(--text-3)", fontSize: 13 }}>ยังไม่มีข้อมูล</div>;
  }
  return (
    <div className="premium-glass-table table-responsive">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>{teamMode ? "ทีม" : "รายคน"}</th>
            <th className="num">เป้า</th>
            <th className="num">ปิดได้</th>
            <th className="num">คาดการณ์</th>
            <th className="num">ส่วนต่าง</th>
            <th className="num">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const cov = coveragePct(r.won, r.target);
            const label = teamMode ? (r.team || "ไม่ระบุ") : r.ownerName;
            return (
              <tr key={r.ownerId || r.team || i} className="premium-row">
                <td>
                  <strong>{label}</strong>
                  {!teamMode && r.team && <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{r.team}</span>}
                </td>
                <td className="num mono">{money(r.target)}</td>
                <td className="num mono" style={{ color: "var(--green)" }}>{money(r.won)}</td>
                <td className="num mono" style={{ color: "var(--text-3)" }}>{money(r.weighted)}</td>
                <td className="num mono" style={{ color: r.gap > 0 ? "var(--amber)" : "var(--green)" }}>{money(r.gap)}</td>
                <td className="num mono">{cov == null ? "-" : `${cov}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
