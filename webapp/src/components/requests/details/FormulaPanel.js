"use client";
// ── การ์ด panel รายหัวข้อ · พัฒนาสูตร (ม-94 → รื้อ ม-165) ─────────────────────────────────────────────
//
// ⭐ **ม-165 (มติเจ้าของ 18/11/2026)** — ทรงเดียวกับพัฒนากลิ่น **ไม่มีก้อน SO** (prod 18/11: 0 จาก 56 ใบผูก SO):
//   ยืนยัน n สูตร · ขอแก้ · ไม่เอา · รอลูกค้าตอบ — หนึ่งรายการต่อบรรทัด (`DevSummaryCard`)
// ⚠️ ทับมติ 2026-08-25 ("ได้สูตรแล้ว N/M" + แกนสามแถว) เฉพาะสายนี้กับพัฒนากลิ่น — หัวข้ออื่นยังใช้ `RequestSummaryPanel`
import DevSummaryCard from "./DevSummaryCard";

export default function FormulaPanel({ request, today = null }) {
  return <DevSummaryCard request={request} kind="formula_dev" today={today} />;
}
