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

/**
 * เปลี่ยน **ภาษาเอกสาร** ได้ไหม — คนละด่านกับ `isEditableQuotation` โดยตั้งใจ
 *
 * ⭐ มติผู้ใช้ 2026-08-27: ภาษาไม่ใช่ "เนื้อหาที่ต้องอนุมัติใหม่" — ราคา เงื่อนไข และ
 * รายการเหมือนกันทุกตัวอักษร เปลี่ยนแค่กระดาษที่พิมพ์ออกไป ⇒ ใบที่อนุมัติแล้วก็เปลี่ยนได้
 * โดยไม่ต้องออก Rev. และไม่ล้างการอนุมัติ (ของเดิมล็อกไว้ ต้องออก Rev. เพื่อเปลี่ยนแค่ภาษา
 * ซึ่งแพงเกินเหตุ) · ระบบตรึงไฟล์เอกสารของภาษาใหม่ให้เอง ฉบับเก่ายังอยู่ในประวัติ
 *
 * ⚠️ ยังต้องมีด่าน — ใบที่ **ยื่นอนุมัติค้างอยู่** ห้ามเปลี่ยน เพราะผู้อนุมัติกำลังเปิดใบนั้น
 * อยู่ · ส่วนใบที่ยกเลิกไปแล้วตกด่านที่ `EDITABLE_QUOTATION_STATUSES` อยู่แล้ว
 * (ตาราง `quotations` ไม่มีตัวชี้ไปข้างหน้าแบบ `supersededById` ของใบสั่งขาย — ฉบับที่ถูก
 * Rev. ทับยังนับเป็นใบปกติ จึงเปลี่ยนภาษาได้ ซึ่งถูกแล้ว: ฉบับเก่าก็ยังพิมพ์ซ้ำได้อยู่)
 */
export function canSwitchQuotationDocLanguage(quotation) {
  return Boolean(quotation)
    && quotation.approvalStatus !== 'pending'
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
/* 🐞 ต้องเป็นใบที่ยังเดินอยู่ด้วย (มติ 24/09 เปิดปุ่มยกเลิกใบ) — ใบที่ถูกตีกลับแล้วถูกยกเลิกยังถือ
   `rejectionReason` ค้าง (trigger 0164 ล้างเฉพาะตอน approvalStatus ≠ not_submitted) ⇒ ของเดิมโชว์แถบ
   "ตีกลับโดย…" บนใบที่ตายแล้ว และหน้าทะเบียนนับเป็น "รอฉัน" ขณะที่ป้ายบนเมนูกรองด้วยสถานะ
   (QUOTATION_ACTIONABLE_STATUSES) ไม่นับ = รายการกับป้ายไม่ตรงกัน แบบเดียวกับที่ ม-102/112 ไล่ปิด */
export function quotationRejectionNotice(quotation) {
  if (!quotation || quotation.approvalStatus !== 'not_submitted') return null;
  if (!EDITABLE_QUOTATION_STATUSES.has(quotation.status)) return null;
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

// ── ยกเลิกใบ = สิทธิ์ของผู้อนุมัติ (มติเจ้าของ 24/09 "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ") ──
//
// ⭐ **ช่องใหม่ ไม่ได้ย้ายสิทธิ์ของใคร** — ก่อนมีปุ่มนี้ ใบที่เคยยื่น/อนุมัติแล้ว (มีหลักฐานลายเซ็น 0125
//   ซึ่ง FK RESTRICT) ทิ้งไม่ได้เลยนอกจากแอดมินบังคับลบ · ลบร่าง · ดึงกลับ · ตีกลับ · ออก Rev. อยู่ครบ
// ⭐ ผู้ยกเลิก = ผู้อนุมัติ (`canApproveQuotation` = เจ้าของดีลปัจจุบัน + CD/CM/AE Sup/admin) ×
//   `canEditSalesPlanning` × ขอบเขตแก้ของทีม — ตัวสุดท้ายตรวจที่ server เท่านั้น (loadScoped 'edit')
// ⭐ **ถาวร** (มติ 24/09) — ไม่มีกู้คืน ไม่มีออก Rev. จากใบยกเลิก ถ้าจะเสนอใหม่ให้สร้างใบใหม่
//   (ด่านทุกตัวปลายน้ำตัด 'cancelled' อยู่แล้ว: PATCH · ยื่น · อนุมัติ · Rev. · รับใบ · FC · สัญญา · คำร้องการเงิน)
//
// ใบที่ยกเลิกได้ = ยังเดินอยู่ (draft/sent/rejected) **และ** เคยผ่านสายตาผู้อนุมัติ:
//   · ยื่นแล้วรออนุมัติ (pending) — ผู้อนุมัติคือคนที่ใบรออยู่ ยกเลิกตรงได้ไม่ต้องตีกลับก่อน
//   · อนุมัติแล้ว / ใบ grandfather (approved · not_required)
//   · ร่างที่ถูกดึงกลับ/ตีกลับหลังยื่น — ยังมีหลักฐานลายเซ็นผู้เสนอค้างอยู่ ⇒ DELETE ตอบ 409 เสมอ
// ⚠️ ร่างที่ไม่เคยยื่น = "ลบ" ตามเดิม (ไม่มีหลักฐานอะไรให้เก็บ) · Won ต้อง "ย้อนการรับ" ก่อน
const CANCELLABLE_APPROVAL_STATUSES = new Set(['pending', 'approved', 'not_required']);

export function isCancellableQuotation(quotation, { hasSignatureEvidence = false } = {}) {
  if (!quotation || !EDITABLE_QUOTATION_STATUSES.has(quotation.status)) return false;
  return CANCELLABLE_APPROVAL_STATUSES.has(quotation.approvalStatus) || Boolean(hasSignatureEvidence);
}

/* ⚠️ ตัวเดียวที่ทั้ง GET (ธง `canCancel` ของจอ) และ POST /cancel ถาม — จอไม่คิดเอง
   (บทเรียน IS-26080011: กติกาเดียวกันเขียนสองที่ = ปุ่มโชว์บนใบที่ API ตีกลับ) */
export function canCancelQuotation(
  quotation,
  { approver = false, canEdit = false, inScope = false, hasSignatureEvidence = false } = {},
) {
  return Boolean(approver) && Boolean(canEdit) && Boolean(inScope)
    && isCancellableQuotation(quotation, { hasSignatureEvidence });
}

/* บันทึกการยกเลิกบนใบ — route ยกเลิกเขียน `metadata.cancel` (แพตเทิร์นเดียวกับ metadata.unaccept)
   ⚠️ ใบที่ยกเลิกผ่าน "ยกเลิกใบสั่งขายพร้อมย้อนสถานะ" (0116/0170) ตั้ง status ตรง ๆ ไม่มี metadata
   ⇒ คืนโครงเปล่า ให้จอบอกแค่ว่ายกเลิกแล้ว ไม่เดาว่าใคร/ทำไม */
export function quotationCancelRecord(quotation) {
  if (quotation?.status !== 'cancelled') return null;
  const cancel = quotation.metadata?.cancel || {};
  return {
    reason: String(cancel.reason || '').trim(),
    byName: String(cancel.byName || '').trim(),
    at: cancel.at || null,
    fromApprovalStatus: cancel.fromApprovalStatus || null,
  };
}

/* ฉบับตรึง "ล่าสุด" เสิร์ฟได้ไหม — ด่านเดียวของ `issued` (HTML) และ `issued/pdf`
   คืนข้อความ 409 หรือ null · ตอบไม่ OK แล้วปุ่มพิมพ์ถอยไปเรนเดอร์สดเอง (quotePrint.js)
   ⭐ ใบยกเลิกมาก่อน (มติ 24/09) — ฉบับตรึงถูกตรึงตอนอนุมัติจึงไม่มีลายน้ำ พิมพ์ออกไปเหมือนใบที่ยังใช้ได้
     🐞 ใบที่ SO ย้อน Won แล้วยกเลิก (0116) เป็นแบบนี้มาตลอด · เรนเดอร์สดใส่ลายน้ำ "ยกเลิก" ให้
   ⚠️ ฉบับระบุ seq (`?render=<n>`) ยังเปิดได้เสมอ — ประวัติต้องอ่านย้อนได้ */
export function issuedLatestRenderBlock(quotation) {
  if (quotation?.status === 'cancelled') {
    return 'ใบนี้ถูกยกเลิกแล้ว — ฉบับตรึงล่าสุดใช้แทนเอกสารที่ยังมีผลไม่ได้ พิมพ์ซ้ำได้พร้อมลายน้ำ “ยกเลิก”';
  }
  if (quotation?.approvalStatus !== 'approved') {
    return 'ใบถูกแก้ไขหลังอนุมัติ — ฉบับตรึงล่าสุดไม่ตรงเนื้อหาปัจจุบัน ต้องอนุมัติใหม่ก่อน';
  }
  return null;
}
