// ── ขั้นบัญชีตรวจใบสั่งขาย (mig 0250) — logic ล้วน ─────────────────────
//
// ⭐ **คนละแกนกับ `status`** (มติผู้ใช้ 2026-08-13) — Actual เข้าตอน AE Supervisor
// อนุมัติเหมือนเดิม บัญชีไม่แตะ · กลิ่น/ผลิต/ภาษี/งวดชำระ เดินต่อได้ทันทีไม่ต้องรอบัญชี
//
//   (ใบยังไม่อนุมัติ) = null
//     │ [AE Sup อนุมัติ]
//     ▼
//   pending ──[บัญชีอนุมัติ]──> approved ■
//     ▲            │
//     └────────────┴──[บัญชีตีกลับ + เหตุผล]──> rejected ──[AE Sup ส่งตรวจใหม่]──┘
//
// ⚠️ **ตีกลับไม่ถอน Actual** — ยอดอยู่บนแกน `status` ที่บัญชีไม่แตะ
// ⚠️ ต่างจาก "คอนเฟิร์มงวดชำระ" (0245): อันนั้นตอบว่า *เงินงวดนี้เข้าจริงไหม*
//    อันนี้ตรวจ **ตัวเอกสาร** ครั้งเดียว (ข้อมูลลูกค้า · เงื่อนไขชำระ · ยอด/VAT · เครดิต)
import { canConfirmPayment, canUser } from '@/lib/permissions';
import { paymentNotRequired } from '@/lib/sales/salesOrderPayments';

export const FINANCE_STATUSES = ['pending', 'approved', 'rejected'];

export const FINANCE_STATUS_LABELS = {
  pending: 'รอบัญชีตรวจใบ',
  approved: 'บัญชีอนุมัติแล้ว',
  rejected: 'บัญชีตีกลับใบ',
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
export function awaitsFinanceReview(order) {
  return order?.status === 'approved'
    && financeStatusOf(order) === 'pending'
    && !paymentNotRequired(order?.totalAmount);
}

/**
 * ด่านเดียวที่ทั้งปุ่มบนหน้าเว็บและ API ใช้ร่วมกัน — คืนข้อความไทยเมื่อทำไม่ได้ หรือ null เมื่อผ่าน
 * (แพตเทิร์นเดียวกับ `installmentActionError`) ⇒ ปุ่มกับ API ขัดกันไม่ได้
 */
export function financeActionError(order, action, user, options = {}) {
  if (!order) return 'ไม่พบใบสั่งขาย';
  const current = financeStatusOf(order);

  if (action === 'finance_approve' || action === 'finance_reject') {
    if (!canConfirmPayment(user)) return 'ตรวจใบสั่งขายได้เฉพาะฝ่ายบัญชี';
    if (order.status !== 'approved') return 'ใบนี้ยังไม่ผ่าน AE Supervisor';
    if (current === 'approved') return 'บัญชีอนุมัติใบนี้ไปแล้ว';
    if (current !== 'pending') return 'ใบนี้ยังไม่เข้าคิวตรวจของบัญชี';
    if (action === 'finance_reject') {
      const reason = String(options.reason || '').trim();
      if (reason.length < MIN_FINANCE_REJECT_REASON) {
        return `ต้องระบุเหตุผลที่ตีกลับอย่างน้อย ${MIN_FINANCE_REJECT_REASON} ตัวอักษร`;
      }
    }
    return null;
  }

  /* ส่งใบเข้าคิวบัญชี — เป็นของ **ผู้ตรวจฝั่งขาย** ไม่ใช่ของบัญชี
     ใช้สองกรณี:
       · `null`     = ใบที่อนุมัติไปแล้วก่อนมีขั้นนี้ (หรือรอบตั้งธงตอนอนุมัติล้ม) → ส่งเข้าคิว
       · `rejected` = บัญชีตีกลับ แก้แล้วส่งตรวจใหม่
     🐞 ของเดิมรับแค่ `rejected` ⇒ ใบที่อนุมัติไปแล้วทั้งหมดค้าง `null` **ตลอดกาล**
     ไม่มีทางเข้าคิวบัญชีได้เลย · เจอตอนทดสอบจริง: ทั้ง 7 ใบในระบบอนุมัติหมดแล้ว
     ⇒ ฟีเจอร์ใช้กับใบที่มีอยู่ไม่ได้สักใบ ต้องรอ SO ใบใหม่เท่านั้น ซึ่งไม่ใช่สิ่งที่ควรเป็น
     (งวดชำระมีปุ่ม "เริ่มติดตามการชำระ" ให้ใบเก่าอยู่แล้ว — ขั้นบัญชีต้องมีคู่กัน)
     ⚠️ ยังไม่ backfill ทั้งระบบเหมือนเดิม — ส่งทีละใบโดยคนตัดสินใจ ไม่ใช่เทเข้าคิวทั้งกอง
     ⚠️ ห้ามให้บัญชีกดเอง ไม่งั้นตีกลับแล้วส่งเข้าคิวตัวเองได้ครบวง = ด่านไม่มีความหมาย */
  if (action === 'finance_resubmit') {
    if (!canUser(user, 'salesplan:review') && user?.role !== 'admin') {
      return 'ส่งให้บัญชีตรวจได้เฉพาะ AE Supervisor หรือ Admin';
    }
    if (order.status !== 'approved') return 'ใบนี้ยังไม่ผ่าน AE Supervisor';
    if (current === 'pending') return 'ใบนี้อยู่ในคิวของบัญชีอยู่แล้ว';
    if (current === 'approved') return 'บัญชีอนุมัติใบนี้ไปแล้ว';
    return null;
  }

  return 'คำสั่งไม่ถูกต้อง';
}

/** ป้ายปุ่มส่งเข้าคิวบัญชี — ครั้งแรกกับหลังถูกตีกลับพูดคนละคำ */
export function financeSendLabel(order) {
  return financeStatusOf(order) === 'rejected' ? 'ส่งให้บัญชีตรวจใหม่' : 'ส่งให้บัญชีตรวจ';
}

/** ขั้นที่ 5 ของรางก้าวบนหน้า SO — คืน null เมื่อใบนี้ยังไม่เข้าแกนบัญชีเลย */
export function financeWorkflowStep(order) {
  const current = financeStatusOf(order);
  if (!current) return null;
  return {
    label: 'บัญชีตรวจใบ',
    hint: current === 'approved'
      ? `${order.financeApprovedByName || 'ฝ่ายบัญชี'}`
      : current === 'rejected'
        ? 'ตีกลับให้ AE Supervisor ดูใหม่'
        : 'รอฝ่ายบัญชีตรวจ',
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
