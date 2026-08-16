"use client";
// ── การ์ด panel รายหัวข้อ · พัฒนากลิ่น (ม-94 งวด 1 — แผน scent-dev-panel-plan) ──
//
// ⭐ ย้าย ไม่ก๊อป: แถบตัวเลข (briefSummary) กับป้ายกระทบยอด SO เดิมอยู่กลางหน้า
// (ScentDevDetail) — มาอยู่การ์ดขวาที่เดียว · ตัวเลขนับที่ lib ก้อนเดิมทั้งหมด
// (briefBoardTotals · soReconcile) ที่นี่แค่เปลี่ยนที่วาง
//
// ⚠️ กระทบยอด SO **เตือน ไม่บล็อก** (มติเดิม) — โทนมากับ reconcileTone จากเปลือก
import {
  DocumentReadinessList, DocumentSummaryCard,
} from "@/components/ui/DocumentControlPanel";

export default function ScentPanel({
  briefSummary, reconcile, reconcileTone, reconcileText,
}) {
  if (!briefSummary) return null;
  // เช็คลิสต์ความพร้อมก่อนส่ง — คำตอบของ "ทำไมยังส่งไม่ได้ / เหลืออะไร"
  //
  // ⚠️ แถว "หัวหน้าสายงานขายยืนยัน" เคยอยู่บนสุด — ถอดพร้อมขั้นทั้งขั้น (มติผู้ใช้
  // 2026-08-16) · ทิ้งไว้จะเป็นแถวที่ไม่มีวันติ๊กเขียวเพราะไม่มีใครเขียน `approvedAt`
  // อีกแล้ว ⇒ เช็คลิสต์จะบอกว่า "ยังไม่พร้อม" ตลอดกาล
  const readiness = [
    {
      id: "briefs",
      label: "ทุกบรีฟมี direction",
      detail: briefSummary.untouched > 0
        ? `เหลือ ${briefSummary.untouched} ก้อนที่ยังไม่ได้ลงมือ`
        : "ครบทุกก้อน",
      ready: briefSummary.briefs > 0 && briefSummary.untouched === 0,
    },
  ];
  return (
    <>
      <DocumentSummaryCard
        title="สรุปใบนี้"
        rows={[
          { id: "briefs", label: "บรีฟ", value: String(briefSummary.briefs) },
          ...(reconcile ? [{ id: "ordered", label: "กลิ่นตาม SO", value: String(reconcile.ordered) }] : []),
          { id: "directions", label: "direction ส่งแล้ว", value: String(briefSummary.directions) },
          { id: "untouched", label: "บรีฟยังไม่ลงมือ", value: String(briefSummary.untouched) },
          { id: "customer", label: "รอลูกค้าตอบ", value: String(briefSummary.waitingCustomer) },
          { id: "price", label: "รอใส่ราคา", value: String(briefSummary.awaitingPrice) },
        ]}
        // ป้ายกระทบยอด — ประโยคเดียวกับที่เคยเป็น StatusNotice กลางหน้า
        status={reconcile && reconcileText ? reconcileText : undefined}
        statusColor={reconcileTone === "danger" ? "var(--red)"
          : reconcileTone === "warn" ? "var(--amber)" : "var(--green)"}
      >
        <DocumentReadinessList items={readiness} label="ความพร้อมของใบนี้" />
      </DocumentSummaryCard>
    </>
  );
}
