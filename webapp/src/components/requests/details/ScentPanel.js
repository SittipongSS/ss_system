"use client";
// ── การ์ด panel รายหัวข้อ · พัฒนากลิ่น (ม-94 งวด 1 — แผน scent-dev-panel-plan) ──
//
// ⭐ ย้าย ไม่ก๊อป: แถบตัวเลข (briefSummary) กับป้ายกระทบยอด SO เดิมอยู่กลางหน้า
// (ScentDevDetail) — มาอยู่การ์ดขวาที่เดียว · ตัวเลขนับที่ lib ก้อนเดิมทั้งหมด
// (briefBoardTotals · soReconcile) ที่นี่แค่เปลี่ยนที่วาง
//
// ⚠️ กระทบยอด SO **เตือน ไม่บล็อก** (มติเดิม) — โทนมากับ reconcileTone จากเปลือก
import { DocumentReadinessList } from "@/components/ui/DocumentControlPanel";
import { toneColor } from "@/lib/ui/tone";
import RequestSummaryPanel from "./RequestSummaryPanel";

/* ⭐ **ทรงเดียวกับทุกหัวข้อแล้ว** (มติผู้ใช้ 2026-08-25) — ตัวเลขนำ + แกนสามแถว
   มาจาก `RequestSummaryPanel` · ที่นี่เหลือแต่ **ของเฉพาะพัฒนากลิ่น** ในก้อนล่าง:
   กระทบยอด SO และเช็คลิสต์บรีฟ
   ⚠️ ตัวเลข "บรีฟ / direction ส่งแล้ว / บรีฟยังไม่ลงมือ / รอลูกค้าตอบ / รอใส่ราคา"
   ถูกถอด **ไม่ใช่ย่อ** — สี่ในห้าตัวเป็นการนับสิ่งที่ตารางข้างล่างแสดงเป็นแถวอยู่แล้ว
   (บรีฟเป็นหัวกลุ่ม · direction เป็นแถว · ขั้นอยู่บนราง) · ที่เหลือเป็นของจริงคือ
   "บรีฟยังไม่ลงมือ" ซึ่งย้ายไปเป็นเช็คลิสต์ที่บอกด้วยว่าเหลือกี่ก้อน */
export default function ScentPanel({
  request, briefSummary, reconcile, reconcileTone, reconcileText,
}) {
  if (!briefSummary) return null;
  // เช็คลิสต์ความพร้อมก่อนส่ง — คำตอบของ "ทำไมยังส่งไม่ได้ / เหลืออะไร"
  //
  // ⚠️ แถว "หัวหน้าสายงานขายยืนยัน" เคยอยู่บนสุด — ถอดพร้อมขั้นทั้งขั้น (มติผู้ใช้
  // 2026-08-16) · ทิ้งไว้จะเป็นแถวที่ไม่มีวันติ๊กเขียวเพราะไม่มีใครเขียน `approvedAt`
  // อีกแล้ว ⇒ เช็คลิสต์จะบอกว่า "ยังไม่พร้อม" ตลอดกาล
  // ⚠️ คอลัมน์นั้นถูกถอดออกจากตารางแล้ว (mig 0268) — ห้ามอ้างกลับมาโดยไม่คืนขั้นทั้งขั้น
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
      <RequestSummaryPanel
        request={request}
        lineShape="scent_dev"
        // ป้ายกระทบยอด — ประโยคเดียวกับที่เคยเป็น StatusNotice กลางหน้า
        // ⚠️ สีมาจาก `toneColor` ที่เดียวของระบบ (lib/ui/tone.js) — **ห้ามเทียบสตริง
        // โทนเองที่นี่**
        // 🐞 เดิมเขียน `reconcileTone === "danger" ? … : reconcileTone === "warn" ? …`
        // แต่ `SO_RECONCILE_TONE` ปล่อยแค่ neutral · success · warning ⇒ ไม่ตรงสักตัว
        // และทุกสถานะตกไปที่กิ่ง else = เขียว · "ขาด 2 กลิ่น" จึงทาเขียวว่าเรียบร้อย
        status={reconcile && reconcileText ? reconcileText : undefined}
        statusColor={toneColor(reconcileTone)}
        statusLabel="กระทบยอดใบสั่งขาย"
      >
        <DocumentReadinessList items={readiness} label="ความพร้อมของใบนี้" />
      </RequestSummaryPanel>
    </>
  );
}
