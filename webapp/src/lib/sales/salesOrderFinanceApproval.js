// ── ขั้นบัญชีตรวจใบสั่งขาย (mig 0250) — logic ล้วน ─────────────────────
//
// ⭐ **คนละแกนกับ `status`** (มติผู้ใช้ 2026-08-13) — Actual เข้าตอน AE Supervisor
// อนุมัติเหมือนเดิม บัญชีไม่แตะ · กลิ่น/ผลิต/ภาษี/งวดชำระ เดินต่อได้ทันทีไม่ต้องรอบัญชี
//
// ⭐ **มติผู้ใช้ 2026-08-30 — สลับลำดับ: บัญชีอยู่ท้ายวง ไม่ใช่กลางวง**
//
//   (ใบยังไม่อนุมัติ) = null
//     │ [AE Sup อนุมัติ]
//     ▼
//   pending ──[เก็บเงินครบทุกงวด]──> (บัญชีกดปิดใบได้) ──> approved ■ = ปิดใบ
//
// ของเดิมบัญชีตรวจใบ *ก่อน* เก็บเงิน และสองแกนนี้เดินขนานกันโดยไม่มีอะไรเชื่อม
// (ไม่มีโค้ดจุดไหนให้สองแกนคุยกันเลย — ลำดับบนรางเป็นแค่การแสดงผล ไม่ใช่ด่าน)
// ⇒ ของจริงบนฐานจึงมีใบที่บัญชีอนุมัติแล้วทั้งที่ยังไม่เก็บเงินสักบาท 13 ใบ
//
// ตอนนี้ **การกดของบัญชีคือการปิดใบ** ⇒ ต้องเก็บครบก่อนถึงกดได้
//
// ⚠️ **ไม่มี "บัญชีตีกลับทั้งใบ" อีกแล้ว** (มติเดียวกัน) — การตีกลับที่ของจริงต้องใช้คือ
//    *ตีกลับรายงวด* (แนบสลิปผิด/ยอดไม่ตรง) ซึ่งมีอยู่แล้วที่ `installmentActionError`
//    ⇒ ถอด `finance_reject` และ `finance_resubmit` ออก
//    🪤 `finance_resubmit` เคยมีหน้าที่ที่สองคือปุ่ม **"ส่งให้บัญชีตรวจ"** ของใบเก่าที่
//      `financeStatus` เป็น NULL (ใบที่อนุมัติก่อน mig 0250) — **วัดก่อนถอด 2026-08-30**:
//      ใบ approved ที่ยังเป็น NULL มี 19 ใบ และ **ทั้ง 19 ใบยอด 0** ซึ่งกติกาใหม่ถือว่า
//      ปิดตั้งแต่ AE Sup อนุมัติอยู่แล้ว ⇒ ไม่มีใบไหนต้องใช้ปุ่มนั้นอีกสักใบ
//    ⇒ และปัญหาที่ตามมาไม่ได้เกิด: ใบที่เก็บครบแล้วถูก `paymentLockReason` ล็อกจากการ
//      ยกเลิก/ย้อนอนุมัติไปแล้ว ปุ่มตีกลับตอนท้ายจึงจะเป็นปุ่มที่กดไม่ได้ตลอดกาลอยู่ดี
//
// ⚠️ **บัญชีไม่แตะ Actual เหมือนเดิม** — ยอดอยู่บนแกน `status` ที่เข้าตอน AE Sup อนุมัติ
// ⚠️ ต่างจาก "คอนเฟิร์มงวดชำระ" (0245): อันนั้นตอบว่า *เงินงวดนี้เข้าจริงไหม*
//    อันนี้ตรวจ **ตัวเอกสาร** ครั้งเดียว (ข้อมูลลูกค้า · เงื่อนไขชำระ · ยอด/VAT · เครดิต)
import { canConfirmPayment, canUser } from '@/lib/permissions';
import { paymentNotRequired } from '@/lib/sales/salesOrderPayments';

/* `rejected` ยังอยู่ในรายการ **เพื่ออ่านของเก่า** — ค่านี้เขียนใหม่ไม่ได้แล้ว (ถอด action ออก)
   แต่ CHECK ของฐาน (mig 0250) ยังรับได้ และถ้าวันหนึ่งมีแถวเก่าโผล่มา จอต้องอ่านออก
   ⚠️ วัดบนฐานจริง 2026-08-30: ไม่มีใบไหนเป็น rejected สักใบ */
export const FINANCE_STATUSES = ['pending', 'approved', 'rejected'];

export const FINANCE_STATUS_LABELS = {
  pending: 'รอปิดใบ',
  approved: 'ปิดใบแล้ว',
  rejected: 'บัญชีตีกลับใบ (เลิกใช้แล้ว)',
};

// ชื่อโทนของ <StatusBadge> ไม่ใช่ค่าสี (มาตรฐานเดียวกับสถานะอื่นในระบบ)
export const FINANCE_STATUS_TONES = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

export const MIN_FINANCE_REJECT_REASON = 10;

/** สิ่งที่บัญชีต้องตรวจ (มติผู้ใช้ 2026-08-13) — โชว์เป็นเช็กลิสต์บนหน้า ไม่ได้บังคับติ๊ก */
export const FINANCE_REVIEW_POINTS = [
  'ข้อมูลลูกค้า · ที่อยู่ออกบิล · เลขผู้เสียภาษี',
  'เงื่อนไขการชำระ · งวด · กำหนดชำระ',
  'ยอดเงิน · ส่วนลด · VAT',
  'เครดิตและวงเงินของลูกค้า',
];

/**
 * สถานะบนแกนบัญชีของใบนี้ — คืน `null` เมื่อยังไม่ถึงคิว
 *
 * ⚠️ ใบที่อนุมัติไปแล้ว **ก่อน** mig 0250 มี `financeStatus` เป็น NULL ซึ่งแปลว่า
 * "ออกก่อนมีขั้นนี้" ไม่ใช่ "รอบัญชี" — ตั้งเป็น pending ย้อนหลังเมื่อไร บัญชีจะเปิดมา
 * เจอคิวค้างทั้งกองที่ไม่มีใครตั้งใจสร้าง (เหตุผลเดียวกับที่ไม่ backfill ใน migration)
 */
export function financeStatusOf(order) {
  const raw = order?.financeStatus;
  return FINANCE_STATUSES.includes(raw) ? raw : null;
}

/** ใบนี้อยู่ในขั้นที่บัญชีต้องตรวจไหม (อนุมัติแล้ว · ยังไม่ผ่านบัญชี · มีเงินให้ตรวจ)
 *
 * ⭐ **ใบยอด 0 ไม่เข้าคิวบัญชี** (มติผู้ใช้ 2026-08-18 ขยายมาที่แกนนี้ 2026-08-26) —
 * สิ่งที่บัญชีตรวจคือเงื่อนไขชำระ ยอด/VAT และเครดิต ซึ่งใบยอด 0 ไม่มีสักข้อ ·
 * กติกาเดียวกับงวดชำระที่ตัดใบยอด 0 ออกไปแล้ว (`paymentNotRequired`)
 * 🪤 ผู้ใช้เจอบน production 26/08: `SO-26080073-0 · ฿0.00` นั่งอยู่ในคิว "ใบที่รอ
 * บัญชีตรวจ" ทั้งที่ไม่มีอะไรให้ตรวจ — ใบแบบนี้ถูกประทับ pending ตั้งแต่ตอนอนุมัติ
 */
export function awaitsFinanceReview(order, installments) {
  return order?.status === 'approved'
    && financeStatusOf(order) === 'pending'
    && !paymentNotRequired(order?.totalAmount)
    /* ⭐ เข้าคิวบัญชีต่อเมื่อ **เก็บครบแล้ว** (มติ 2026-08-30) — ใบที่ยังเก็บไม่ครบ
       ไม่ใช่งานของบัญชีวันนี้ ถ้าปล่อยเข้าคิว บัญชีจะเปิดมาเจอกองที่กดไม่ได้สักใบ
       ⚠️ ไม่ส่ง `installments` มา = ตอบ false (ผู้เรียกที่ยังไม่ได้โหลดงวด) ไม่ใช่เดาว่าใช่ */
    && salesOrderFullyPaid(order, installments);
}

/**
 * ใบนี้ "เก็บเงินครบแล้ว" ไหม — เงื่อนไขเดียวที่ปลดให้บัญชีปิดใบได้ (มติ 2026-08-30)
 *
 * ⭐ ครบ = **ทุกงวด `confirmed`** · งวดที่บัญชีตีกลับหรือแค่ "แจ้งแล้ว" ยังไม่นับ
 *   (กติกาเดียวกับ `paidThrough` — ลายเซ็นบัญชีคือเส้นแบ่งเสมอ)
 * ⭐ **ใบยอด 0 = ครบโดยปริยาย** — ไม่มีเงินให้เก็บ · ใบพวกนี้ไม่เคยเข้าคิวบัญชีอยู่แล้ว
 *   (`awaitsFinanceReview` ตัดทิ้งด้วย `paymentNotRequired`) จึงปิดเองตั้งแต่ AE Sup อนุมัติ
 * ⚠️ **ไม่มีงวดเลยแต่ยอดไม่เป็นศูนย์ = ยังไม่ครบ** — ใบเก่าที่ยังไม่มีใครกด "เริ่มติดตาม
 *   การชำระ" ไม่ใช่ใบที่จ่ายครบ (fail-closed แบบเดียวกับ `coversDate`)
 */
export function salesOrderFullyPaid(order, installments) {
  if (paymentNotRequired(order?.totalAmount)) return true;
  const rows = Array.isArray(installments) ? installments : [];
  return rows.length > 0 && rows.every((r) => r?.status === 'confirmed');
}

/** เหลืออีกกี่งวดถึงจะปิดใบได้ — ใช้บอกเหตุบนปุ่มที่กดไม่ได้ */
export function salesOrderPaymentProgress(installments) {
  const rows = Array.isArray(installments) ? installments : [];
  return { done: rows.filter((r) => r?.status === 'confirmed').length, total: rows.length };
}

/**
 * ด่านเดียวที่ทั้งปุ่มบนหน้าเว็บและ API ใช้ร่วมกัน — คืนข้อความไทยเมื่อทำไม่ได้ หรือ null เมื่อผ่าน
 * (แพตเทิร์นเดียวกับ `installmentActionError`) ⇒ ปุ่มกับ API ขัดกันไม่ได้
 */
export function financeStepOwnerError(order, user) {
  if (!order) return 'ไม่พบใบสั่งขาย';
  const current = financeStatusOf(order);
  if (!canConfirmPayment(user)) return 'ปิดใบสั่งขายได้เฉพาะฝ่ายบัญชี';
  if (order.status !== 'approved') return 'ใบนี้ยังไม่ผ่าน AE Supervisor';
  if (current === 'approved') return 'ใบนี้ปิดไปแล้ว';
  if (current !== 'pending') return 'ใบนี้ยังไม่เข้าคิวปิดใบของบัญชี';
  return null;
}

/** เก็บเงินครบหรือยัง — เหตุผลไทยเมื่อยังไม่ครบ · null เมื่อครบ (แยกจากด่านบนเพื่อให้
 *  ปุ่มบนจอ **โชว์แต่กดไม่ได้พร้อมเหตุ** ตามกติกา GatedAction ไม่ใช่หายไปเฉย ๆ) */
export function financePaymentError(order, installments) {
  if (salesOrderFullyPaid(order, installments)) return null;
  const { done, total } = salesOrderPaymentProgress(installments);
  return total
    ? `ยังเก็บเงินไม่ครบ (${done}/${total} งวด) — ปิดใบได้เมื่อบัญชีรับรองครบทุกงวด`
    : 'ใบนี้ยังไม่มีงวดชำระให้เก็บ — ปิดใบไม่ได้จนกว่าจะเริ่มติดตามการชำระ';
}

export function financeActionError(order, action, user, options = {}) {
  if (!order) return 'ไม่พบใบสั่งขาย';

  if (action === 'finance_approve') {
    const owner = financeStepOwnerError(order, user);
    if (owner) return owner;
    /* ⭐ ด่านใหม่ของมติ 2026-08-30 — ปิดใบได้ต่อเมื่อเก็บครบทุกงวด
       ⚠️ ต้องส่ง `installments` มาถึงจะตัดสินได้ · ไม่ส่ง = ปฏิเสธ ไม่ใช่ปล่อยผ่าน
       (ผู้เรียกที่ไม่มีบริบทงวด ไม่ควรเป็นคนตัดสินใจปิดใบ) */
    return financePaymentError(order, options.installments);
  }

  /* ⚠️ `finance_reject` และ `finance_resubmit` **ถอดออกแล้ว** (มติผู้ใช้ 2026-08-30)
     — ไม่มีการตีกลับทั้งใบตอนท้ายอีก · ของที่ต้องตีกลับจริงคือ *รายงวด* (แนบสลิปผิด)
     ซึ่งอยู่ที่ `installmentActionError` และบัญชีทำได้อยู่แล้วจากคิวงวด
     ⇒ คำสั่งเก่าที่ยังยิงเข้ามาจะตกที่บรรทัดสุดท้ายเป็น 'คำสั่งไม่ถูกต้อง' ซึ่งถูกแล้ว */
  return 'คำสั่งไม่ถูกต้อง';
}


/** ขั้นที่ 5 ของรางก้าวบนหน้า SO — คืน null เมื่อใบนี้ยังไม่เข้าแกนบัญชีเลย */
export function financeWorkflowStep(order) {
  const current = financeStatusOf(order);
  if (!current) return null;
  return {
    label: 'บัญชีปิดใบ',
    hint: current === 'approved'
      ? `${order.financeApprovedByName || 'ฝ่ายบัญชี'}`
      : current === 'rejected'
        ? 'ตีกลับให้ AE Supervisor ดูใหม่ (คำสั่งเก่า เลิกใช้แล้ว)'
        : 'รอเก็บเงินครบแล้วบัญชีปิดใบ',
    status: current,
  };
}

/**
 * ขั้นที่รางก้าวควรชี้ว่า "กำลังอยู่ตรงนี้"
 *
 * 🔴 **ความหมายของหมุด** (feedback ผู้ใช้ 2026-08-13): **✓ = ขั้นนั้นเรียบร้อยแล้ว ·
 * ตัวเลข = กำลังอยู่ขั้นนั้น รอดำเนินการ** ⇒ ใบที่จบครบต้องเป็น ✓ ทั้งราง ไม่มีเลขค้าง
 *
 * `workflowStepsFromIndex` ให้ `index < current` = done · `=== current` = current
 * ⇒ อยากให้ขั้นสุดท้ายเป็น ✓ ต้องชี้ **พ้นท้ายราง**
 *
 * 🐞 ของเดิมชี้ที่ "นับ Actual" (index 3) ทั้งที่ยอดนับไปแล้ว ⇒ ใบที่จบครบยังขึ้นเลข
 * ค้างหนึ่งขั้นมาตลอด · พอเพิ่มขั้นบัญชีเข้ามาอาการยิ่งชัด (บัญชีอนุมัติแล้วแต่หมุดเป็นเลข 5)
 *
 * @param baseIndex  ขั้นปัจจุบันของสายเอกสาร ใช้เมื่อใบยังไม่อนุมัติ
 * @param stepCount  จำนวนขั้นทั้งหมดบนราง (รวมขั้นบัญชีถ้ามี)
 */
export function salesOrderWorkflowIndex(order, { baseIndex = 0, stepCount = 4 } = {}) {
  if (order?.status !== 'approved') return baseIndex;
  const current = financeStatusOf(order);
  // ไม่มีขั้นบัญชี (ใบเก่า) หรือบัญชีผ่านแล้ว = จบทั้งราง
  if (!current || current === 'approved') return stepCount;
  // รอบัญชี / บัญชีตีกลับ = ยังค้างอยู่ที่ขั้นบัญชีซึ่งเป็นขั้นสุดท้าย
  return stepCount - 1;
}
