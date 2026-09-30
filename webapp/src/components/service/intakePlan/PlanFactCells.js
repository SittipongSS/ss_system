"use client";
// ── เซลล์ข้อเท็จจริงของแถว "รอตั้งรอบ" (PR-C · C7) — ช่วงบริการ · รอบที่แนะนำ · สัญญา ─────────────────
//
// ⭐ ค่าทุกช่องมาจากตัวคำนวณ `planRowFacts` (lib/service/intakePlanFacts.js) ผ่าน route — ที่นี่ **วาดอย่างเดียว**
//   ตารางกับการ์ดใช้ตัวเดียวกัน ⇒ สองมุมมองพูดคำเดียวกันเสมอ
// ⚠️ ขาดข้อมูล = ขีด (`naText`) ไม่ใช่ 0 หรือค่าที่เดาเอง (ใบเดิม/ย้อนหลังไม่มีรอบที่แนะนำโดยตั้งใจ · C-D3)
// ⚠️ inline ล้วน (`span`) — การ์ดวางไว้ใน `<dd>` ตารางวางใน `<td>` · `cell-sub` = บรรทัดรอง (globals)
import StatusBadge from "@/components/ui/StatusBadge";
import { naText } from "@/lib/format";

/** ช่วงบริการ "22/10/2026 – 21/10/2027" + บรรทัดรอง "12 เดือน" */
export function PeriodCell({ row }) {
  if (!row?.periodText) return naText(null);
  return (
    <>
      <span className="mono">{row.periodText}</span>
      {row.periodSpanText ? <span className="cell-sub">{row.periodSpanText}</span> : null}
    </>
  );
}

/** รอบที่แนะนำ "ทุก 33 วัน" + บรรทัดรอง "≈ 12 นัด" (ชนเพดาน 365 วัน = "· สูงสุดที่ตั้งได้") — ข้อเสนอ ไม่ใช่ค่าที่ตั้งให้ */
export function CadenceCell({ row }) {
  if (!row?.cadenceText) return naText(null);
  return (
    <>
      <span>{row.cadenceText}</span>
      {row.cadenceSub ? <span className="cell-sub">{row.cadenceSub}</span> : null}
    </>
  );
}

/** ชิปสัญญา — เลขสัญญาที่ signed (เขียว) หรือ "ยังไม่ผูก — นัดติดด่านสัญญา (SA)" (เหลือง) ตามด่านสัญญาของนัด */
export function ContractChip({ row }) {
  const chip = row?.contractChip;
  if (!chip?.label) return naText(null);
  return <StatusBadge tone={chip.tone} size="sm" label={chip.label} title={chip.label} />;
}
