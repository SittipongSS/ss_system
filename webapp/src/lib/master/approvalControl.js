// ── ด่านอนุมัติ master data ในรูปที่ Control Panel ใช้ได้ (ลูกค้า/สินค้า) ─────
//
// ⭐ ที่มา (มติผู้ใช้ 2026-08-30): หน้ารายละเอียดลูกค้ากับสินค้าเป็นสองหน้าสุดท้าย
// ที่ยังไม่มี Control Panel · พอยกมาใช้ ทั้งคู่ต้องวาด "สถานะอนุมัติ + รางสามขั้น"
// เหมือนกันเป๊ะ เพราะมันคือด่านเดียวกันจริง ๆ (approvalStatus + rejectionReason +
// resetApprovalOnEdit ชุดเดียวกัน — ดู lib/master/approval.js)
//
// ⚠️ เขียนที่นี่ที่เดียว: สองหน้าจอที่วาดรางคนละชุดคือจุดที่คำว่า "รออนุมัติ" จะเริ่ม
// แปลว่าคนละอย่างในสองหน้า (โรคเดียวกับที่ AGENTS.md ห้ามเรื่องฟอร์มสร้าง/แก้)
//
// ⚠️ แถวเก่าก่อน mig 0027 มี approvalStatus = NULL ⇒ นับเป็น "อนุมัติแล้ว" เสมอ
// (approvalStatusOf) · ห้ามอ่าน record.approvalStatus ตรง ๆ ที่นี่
import { approvalStatusOf } from "./approvalStatus";

export const APPROVAL_CONTROL_META = {
  pending: { label: "รออนุมัติ", color: "var(--amber)" },
  approved: { label: "อนุมัติแล้ว", color: "var(--green)" },
  rejected: { label: "ถูกตีกลับ ต้องแก้ไข", color: "var(--red)" },
};

/* รางสามขั้นของ master data — ขั้นกลางเปลี่ยนคำเมื่อถูกตีกลับ เพราะ "รออนุมัติ"
   กับ "ถูกตีกลับ" อยู่ก้าวเดียวกันบนราง แต่คนละเรื่องสำหรับคนที่ต้องลงมือต่อ
   `noun` = คำเรียกของ (สินค้า/ลูกค้า) · `savedHint`/`doneHint` = ประโยคของหน้านั้น */
export function approvalControlView(record, { noun = "ข้อมูล", savedHint = "", doneHint = "" } = {}) {
  const status = approvalStatusOf(record);
  const meta = APPROVAL_CONTROL_META[status] || APPROVAL_CONTROL_META.approved;
  const rejected = status === "rejected";
  const currentIndex = status === "approved" ? 2 : 1;
  const steps = [
    { id: "created", label: `บันทึก${noun}`, hint: savedHint },
    {
      id: "review",
      label: rejected ? "ถูกตีกลับ ต้องแก้ไข" : "รออนุมัติ",
      hint: rejected
        ? "แก้ตามเหตุผลที่ผู้อนุมัติแจ้ง แล้วบันทึกเพื่อส่งตรวจใหม่"
        : `หัวหน้าฝ่ายขายตรวจก่อนเปิดให้ทุกระบบเลือก${noun}นี้`,
    },
    { id: "approved", label: "อนุมัติแล้ว", hint: doneHint },
  ];
  return { status, rejected, label: meta.label, color: meta.color, currentIndex, steps };
}
