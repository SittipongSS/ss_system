"use client";

import { Trophy } from "lucide-react";
import { DEAL_TYPE_LABELS, normalizeDealType, STAGE_LABELS } from "@/lib/salesPlanning";
import { FORECAST_LEVELS, snapForecastLevel } from "@/lib/sales/forecastLevels";
import { fmtMoneyCompact } from "@/lib/format";
import UiKpiCard from "@/components/ui/KpiCard";

export { default as MonthPicker } from "@/components/ui/MonthPicker";
export { MONTH_LABELS, monthsForYear, thisMonth, yearOfMonth } from "@/lib/datePeriods";

// Shared presentational helpers for the Sales Planning pages (overview / deals /
// targets). Kept in one place so the split pages render identical badges/cards.

export const initialDealForm = {
  id: null,
  title: "",
  customerId: "",
  customerName: "",
  projectId: "",
  stage: "lead",
  dealType: "",  // SCENT | NPD | RE-ORDER — บังคับเลือกตอนสร้าง (ห้าม default NPD เงียบ ๆ:
                 // เดิม default NPD ทำให้คนกดสร้างโดยไม่เลือก → ได้ template ผิดประเภท มติ 2026-07-21)
  formulaName: "",  // ชื่อสูตรกลิ่น (SCENT — จุดปลั๊กอิน RD ในอนาคต)
  categoryCode: "", // หมวดสินค้า MM-TTT (DL1) — เลือก timeline template ตามหมวด
  categoryMainCode: "", // draft หมวดหลักระหว่างรอเลือกหมวดรองในฟอร์มกลาง
  brand: "",        // ชื่อแบรนด์ (เลือกจากแบรนด์ของลูกค้า) — เก็บใน metadata.brand
  projectValue: "",
  probability: "50",
  // ไม่มี forecastMonth แล้ว (มติผู้ใช้ 2026-07-16) — เดือน FC อนุมานจาก expectedCloseDate ฝั่ง server
  expectedCloseDate: "",
  startDate: "",   // วันที่เริ่มดีล (mig 0095) — ใช้เป็น anchor gen ไทม์ไลน์
  endDate: "",
  notes: "",
};

// ป้ายประเภทดีล 3 ค่า — สีคงที่ทั้งระบบ: SCENT=amber (งานกลิ่น) · NPD=blue (พัฒนาสินค้า)
// · RE-ORDER=teal (ผลิตซ้ำ). ใช้ทุกหน้า sales ให้อ่านประเภทได้ด้วยตาเดียว.
export const DEAL_TYPE_COLORS = { SCENT: "var(--amber)", NPD: "var(--blue)", "RE-ORDER": "var(--teal)" };
/* ป้ายทั้งสามตัวรับ `className` เพิ่มได้ — ตารางส่งคลาสของตัวเองมาคุม **ความกว้าง**
   ให้ป้ายในคอลัมน์เดียวกันเท่ากันหมด (มติผู้ใช้ 2026-08-05: อ่านเป็นคอลัมน์ ไม่ใช่
   ก้อนที่กว้างตามความยาวข้อความของแต่ละแถว)
   ⚠️ ความกว้างต้องมาจากฝั่งผู้เรียก ไม่ใช่ฝังในนี้ — helper เดียวกันนี้ยังถูกใช้บน
   การ์ด/หน้ารายละเอียดที่ป้ายควรพอดีข้อความ ไม่ใช่ยืดเต็มคอลัมน์
   ⚠️ CSS module เอื้อมไปแก้ `.ui-badge` เองไม่ได้ (audit ห้าม cross-layer override)
   การเปิดช่อง className จึงเป็นทางเดียวที่ตารางจะคุมได้ */
const badgeClass = (extra) => ["ui-badge", extra].filter(Boolean).join(" ");

export function dealTypeBadge(type, className = "") {
  const t = normalizeDealType(type);
  return (
    <span className={badgeClass(className)} style={{ color: DEAL_TYPE_COLORS[t] }}>
      {t}
    </span>
  );
}

// โอกาสที่จะปิดได้ (FC%) — นิยามย้ายไป lib/sales/forecastLevels.js (แหล่งเดียวที่ route
// ฝั่ง server ใช้ร่วมได้ เพราะไม่มี JSX). re-export ไว้ให้หน้าเดิมที่ import จากที่นี่
export { FORECAST_LEVELS, snapForecastLevel };

export function forecastBadge(probability, className = "") {
  const p = snapForecastLevel(probability);
  const color = { 20: "var(--text-3)", 50: "var(--amber)", 80: "var(--teal)" }[p] || "var(--text-3)";
  return (
    <span className={badgeClass(className)} style={{ color }}>
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

/* ป้ายของตัวสลับขอบเขต — หน้าคิวลีดกับหน้าไปป์ไลน์ดีลใช้ชุดเดียวกัน
   (ตัวเลือกที่แต่ละ role ได้มาจาก leadScopes/salesDealScopes ใน permissions.js) */
export const SCOPE_LABELS = { mine: "ของฉัน", team: "ทีม", all: "ทั้งหมด" };

// เงินในแดชบอร์ด/ตารางสรุปแผนขาย — ใช้รูปแบบย่อกลาง (฿x.xxM / ฿x.xxK).
export const money = (value) => fmtMoneyCompact(value);

export function coveragePct(won, target) {
  if (!target || target <= 0) return null;
  return Math.round((Number(won || 0) / Number(target)) * 100);
}

export function stageBadge(stage, className = "") {
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
    <span className={badgeClass(className)} style={{ color }}>
      {stage === "won" && <Trophy size={12} style={{ marginRight: 4, verticalAlign: "-1px" }} />}
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

// สถานะใบเสนอราคา (คนละชุดกับ stage ของดีล) — closed = ถูกปิดเพราะดีลจบด้วยใบอื่น (mig 0102)
export const QUOTE_STATUS_LABELS = {
  draft: "ฉบับร่าง", sent: "ส่งลูกค้าแล้ว", accepted: "Won", rejected: "ถูกปฏิเสธ",
  cancelled: "ยกเลิก", revised: "ถูกแก้ไข (มีฉบับใหม่)", closed: "ปิด (ดีลจบด้วยใบอื่น)",
};
export const QUOTE_STATUS_COLORS = {
  draft: "var(--text-3)", sent: "var(--blue)", accepted: "var(--green)",
  rejected: "var(--red)", cancelled: "var(--red)", revised: "var(--amber)", closed: "var(--text-3)",
};
export function quoteStatusBadge(status) {
  return (
    <span className="ui-badge" style={{ color: QUOTE_STATUS_COLORS[status] || "var(--text-3)", borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}>
      {status === "accepted" && <Trophy size={12} style={{ marginRight: 4, verticalAlign: "-1px" }} />}
      {QUOTE_STATUS_LABELS[status] || status}
    </span>
  );
}

export function KpiCard({ icon, label, badge, value, hint, color, interactive = true }) {
  return <UiKpiCard icon={icon} label={label} badge={badge} value={value} hint={hint} color={color} interactive={interactive} />;
}
