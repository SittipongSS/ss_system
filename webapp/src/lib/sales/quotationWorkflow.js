const EDITABLE_QUOTATION_STATUSES = new Set(['draft', 'sent', 'rejected']);

// ใบ grandfather (mig 0114 ตั้งใจไม่ backfill) นับเป็น "อนุมัติแล้ว" ทุกด่านในระบบอยู่แล้ว
// — ส่งลูกค้า/Won ผ่านได้ (documentWorkflow.js + accept RPC ตั้งแต่ mig 0098) — จึงต้องแก้
// ด้วย Revision เหมือนใบ approved ตามแผนแม่บท "หลังอนุมัติห้ามแก้ทับฉบับเดิม" (มติ 2026-07-26).
// เกิดใหม่ไม่ได้แล้ว (default = not_submitted ตั้งแต่ mig 0156) — รับไว้เพื่อใบเก่าเท่านั้น
const REVISABLE_APPROVAL_STATUSES = new Set(['approved', 'not_required']);

export function isRevisableQuotationApprovalStatus(approvalStatus) {
  return REVISABLE_APPROVAL_STATUSES.has(approvalStatus);
}

/**
 * แก้ทับฉบับเดิมได้ไหม — **ด่านเดียวกับ `PATCH /api/sales-planning/quotations/[id]`**
 * (สถานะที่แก้ได้ **และ** ยังไม่เคยยื่นอนุมัติ) · ใบที่ผ่านด่านนี้ไม่ได้ต้องใช้ "ออก Rev."
 *
 * 🐞 **บั๊กจริงที่ผู้ใช้แจ้ง (IS-26080011 · 2026-08-11)**: กติกานี้เคยถูกเขียนแยกกันสองที่ —
 * หน้ารายละเอียดตรวจครบสองชั้น ส่วนหน้ารายการตรวจแค่ `status` แล้วโชว์ปุ่มดินสอที่พาไป
 * `?edit=1` · ตั้งแต่ mig 0165 การอนุมัติตั้ง `status='sent'` ให้เอง ⇒ **ใบที่อนุมัติแล้ว
 * ทุกใบเข้าเงื่อนไขของหน้ารายการ** (23 จาก 36 ใบบน prod ตอนพบ) ⇒ ผู้ใช้กดดินสอแล้วตกไป
 * อยู่ในโหมดแก้ไขของใบที่แก้ไม่ได้ ซึ่งซ่อนปุ่มทั้งการ์ดจนเหลือ "Won" ปุ่มเดียว
 * และไม่มีทางออกนอกจากลบ `?edit=1` ทิ้งเองในแถบ URL
 *
 * ⚠️ **ห้ามแตกกติกานี้ไปเขียนซ้ำที่หน้าจอ** — ทั้งดินสอในรายการ ปุ่ม "แก้ไขข้อมูล"
 * และโหมดแก้ไขของหน้ารายละเอียด ต้องถามฟังก์ชันนี้ตัวเดียวกัน
 * ⚠️ ด่านฝั่ง server มีเพิ่มอีกสองชั้นที่ตัดสินด้วยผู้ใช้/ดีล (`inSalesEditScope` ·
 * ดีล Lost) ซึ่งหน้าจอไม่รู้ — ที่นี่ตอบเฉพาะ "ตัวเอกสารเปิดให้แก้ไหม"
 */
export function isEditableQuotation(quotation) {
  return Boolean(quotation)
    && EDITABLE_QUOTATION_STATUSES.has(quotation.status)
    && quotation.approvalStatus === 'not_submitted';
}

/**
 * ออก Rev. ได้ไหม — ใบที่อนุมัติแล้ว (หรือใบ grandfather) และยังอยู่ในสถานะที่เดินต่อได้
 *
 * ⚠️ ย้ายมาจากหน้ารายละเอียดซึ่งเก็บชุดสถานะไว้เป็น `const EDITABLE` ของตัวเอง —
 * ชุดสถานะเดียวกันที่ถูกก๊อปไปไว้หลายที่คือรูปแบบที่ทำให้เกิด IS-26080011 มาแล้ว
 */
export function isRevisableQuotation(quotation) {
  return Boolean(quotation)
    && isRevisableQuotationApprovalStatus(quotation.approvalStatus)
    && EDITABLE_QUOTATION_STATUSES.has(quotation.status);
}

export function isQuotationSubmitter(quotation, userId) {
  return Boolean(userId)
    && quotation?.approvalStatus === 'pending'
    && quotation?.approvalRequestedBy === userId;
}

// ดึงกลับ = **ของผู้ยื่นเท่านั้น** (มติ 2026-07-26) — ผู้อนุมัติที่อยากส่งเอกสารกลับใช้
// "ตีกลับ" ซึ่งเก็บเหตุผลลงคอลัมน์จริง แสดงบนใบ และแจ้งเตือน ส่วนการดึงกลับไม่ทิ้งร่องรอย
// บนหน้าจอเลย จึงกลายเป็นช่องส่งเอกสารกลับแบบเงียบเมื่อผู้อนุมัติใช้
// ไม่เกิดทางตัน: ผู้อนุมัติยังตีกลับได้เสมอ แม้ผู้ยื่นไม่อยู่แล้ว
export function canWithdrawQuotationSubmission(quotation, { userId = '' } = {}) {
  return Boolean(quotation)
    && quotation.approvalStatus === 'pending'
    && EDITABLE_QUOTATION_STATUSES.has(quotation.status)
    && isQuotationSubmitter(quotation, userId);
}

/* ตีกลับ = ผู้อนุมัติส่งใบกลับให้ผู้จัดทำแก้ (mig 0164) — คู่ตรงข้ามของดึงกลับที่เป็น
   การกระทำของผู้ยื่นเอง

   ⚠️ ผู้ยื่นตีกลับใบตัวเองไม่ได้ ต้องใช้ดึงกลับ — เดิมเขียนกติกานี้ไว้แค่ในคอมเมนต์
   แต่โค้ดไม่ได้บังคับ ผลคือเจ้าของดีลที่ยื่นใบของตัวเอง (ซึ่งเป็นทางปกติ เพราะ
   canApproveQuotation ให้เจ้าของอนุมัติใบตัวเองได้) เห็นทั้ง "ดึงกลับมาแก้ไข" และ
   "ตีกลับให้แก้ไข" อยู่ติดกันในแผงจัดการเอกสาร ทั้งที่จบที่เดิมคือกลับไปเป็นร่าง
   ต่างกันแค่ตีกลับบังคับกรอกเหตุผลแล้วโชว์บนใบ — ส่งเหตุผลให้ตัวเองอ่านไม่มีความหมาย */
export function canRejectQuotationSubmission(quotation, { approver = false, userId = '' } = {}) {
  return Boolean(quotation)
    && approver
    && !isQuotationSubmitter(quotation, userId)
    && quotation.approvalStatus === 'pending'
    && EDITABLE_QUOTATION_STATUSES.has(quotation.status);
}

/* ใบที่ยื่นแล้วรออนุมัติถูก "ล็อก" — แก้ไม่ได้และลบไม่ได้จนกว่าจะดึงกลับหรือถูกตีกลับ

   ⚠️ ใบเสนอราคาแยกสองแกน: `status` (draft/sent/accepted…) กับ `approvalStatus`
   (not_submitted/pending/approved) ใบที่รออนุมัติยังเป็น `status='draft'` อยู่ ด่านลบที่
   ดูแค่ `status === 'draft'` จึงปล่อยให้ลบใบที่รอเจ้าของดีลอนุมัติอยู่ได้ — คนอนุมัติเปิด
   เข้ามาแล้วเอกสารหายไปเฉย ๆ พร้อมคำขอที่ค้างอยู่ (ใบสั่งขายไม่มีปัญหานี้เพราะ
   "รออนุมัติ" เป็น status ของมันเอง) */
export function isQuotationAwaitingApproval(quotation) {
  return quotation?.approvalStatus === 'pending';
}

// ใบที่เพิ่งถูกตีกลับ = ยังไม่ยื่น + มีเหตุผลค้างอยู่ (trigger ล้างให้เมื่อยื่นใหม่)
export function quotationRejectionNotice(quotation) {
  if (!quotation || quotation.approvalStatus !== 'not_submitted') return null;
  const reason = String(quotation.rejectionReason || '').trim();
  if (!reason) return null;
  return {
    reason,
    byName: String(quotation.rejectedByName || '').trim() || 'ผู้อนุมัติ',
    at: quotation.rejectedAt || null,
  };
}

/* ── "รอฉันลงมือ" ของใบเสนอราคา — กติกาเดียวที่ป้ายเมนูและหน้าทะเบียนใช้ร่วมกัน ──
   สองสายเท่านั้น ไม่ใช่ "ใบที่ยังไม่จบ":
     1. ใบที่ยื่นมาแล้วรอ **ฉัน** อนุมัติ — ผู้อนุมัติคือเจ้าของดีล (เส้นเดียวกับ
        รายงานความพร้อมลายเซ็น `pendingCounts`) · ดีลที่ปิดแล้วไม่นับ ใบมันตายไปกับดีล
     2. ใบของฉันที่ถูก **ตีกลับ** — กลับเป็น not_submitted พร้อมเหตุผลค้างอยู่
        (ตัวชี้เดียวกับ `quotationRejectionNotice` ที่หน้ารายละเอียดใช้โชว์แถบเหตุผล)
   ⚠️ ร่างที่ยังไม่เคยยื่นไม่นับ — ตาฉันก็จริง แต่ไม่มีใครรออยู่ปลายทางและไม่มีอะไรทวง
   (กติกาเดียวกับใบร่างคำร้อง ม-112) */
export const QUOTATION_ACTIONABLE_STATUSES = [...EDITABLE_QUOTATION_STATUSES];

export function isQuotationAwaitingMyApproval(quotation, { userId = '', dealOwnerId = null, dealClosed = false } = {}) {
  return Boolean(quotation) && Boolean(userId)
    && quotation.approvalStatus === 'pending'
    && EDITABLE_QUOTATION_STATUSES.has(quotation.status)
    && !dealClosed
    && dealOwnerId === userId;
}

export function isQuotationRejectedToMe(quotation, { userId = '' } = {}) {
  return Boolean(userId)
    && quotation?.createdBy === userId
    && Boolean(quotationRejectionNotice(quotation));
}

export function isQuotationWaitingOnMe(quotation, ctx = {}) {
  return isQuotationAwaitingMyApproval(quotation, ctx) || isQuotationRejectedToMe(quotation, ctx);
}

// ── ด่านเต็ม = ตัวเอกสาร + สิทธิ์ของผู้ใช้ + ขอบเขตทีม ─────────────────────
//
// ⚠️ **ชุดสถานะอยู่ใน `isEditableQuotation` / `isRevisableQuotation` ที่เดียว** —
// สองฟังก์ชันนี้เติมเฉพาะเงื่อนไขที่ขึ้นกับ *ผู้ใช้* · หน้าจอฝั่ง client เรียกตัว
// document-only ได้ตรง ๆ เพราะไม่รู้ `inScope` (ขอบเขตทีมตัดที่ server เท่านั้น)
export function canEditQuotationContent(
  quotation,
  { canEdit = false, inScope = false } = {},
) {
  return Boolean(canEdit) && Boolean(inScope) && isEditableQuotation(quotation);
}

export function canReviseQuotation(
  quotation,
  { canEdit = false, inScope = false } = {},
) {
  return Boolean(canEdit) && Boolean(inScope) && isRevisableQuotation(quotation);
}
