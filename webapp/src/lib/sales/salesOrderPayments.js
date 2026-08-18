// ── งวดชำระของใบสั่งขาย (mig 0245) — logic ล้วน ใช้ทั้ง client และ server ────
//
// ⭐ **สายงานยกมาจากมติ 2026-08-01** (`docs/service-business-system-plan.md` §5)
// *"SA ต้องกดว่าลูกค้าจ่ายแล้ว บัญชีต้องคอนเฟิร์ม"* — ไม่ได้คิดใหม่ เพราะสัญญาบริการ
// จะใช้รูปเดียวกันนี้ต่อ ถ้าคิดแยกจะได้สองชุดที่เพี้ยนหากัน
//
//   pending ──[SA/AC แจ้ง + หลักฐาน]──> reported ──[บัญชีคอนเฟิร์ม]──> confirmed
//                  ↑                        │
//                  └──[บัญชีตีกลับ+เหตุผล]──┘  (กลับไปให้ SA แจ้งใหม่)
//
// ⚠️ **`reported` ไม่นับว่าชำระแล้ว — นับเมื่อ `confirmed` เท่านั้น**
// ไม่งั้น SA แจ้งเองนับเอง = เท่ากับไม่มีด่าน
//
// 🔴 **งวดชำระไม่แตะยอด Actual เด็ดขาด** (ยืนยันกับผู้ใช้ 2026-08-13)
// SA ได้ยอด **เต็ม 100%** ตั้งแต่ใบอนุมัติ ต่อให้แบ่งจ่ายกี่งวดก็ตาม —
// `actualAmount` มาจาก `totalAmount - vatAmount` ตอนสร้างใบ (mig 0107) และ trigger
// ที่รวมเข้าดีลฟังเฉพาะ `status/actualAmount/orderDate/dealId` ของ `sales_orders`
// ⇒ ตารางงวดอยู่คนละแกน **ห้ามมีโค้ดไหนเอายอดที่เก็บได้ไปหัก Actual**
// ไฟล์นี้จึงไม่ export อะไรที่ชื่อ `actual*` เลย และมีเทสต์ล็อกไว้
import { canConfirmPayment, canUser } from '@/lib/permissions';
import { computeInstallments, paymentScheduleRows } from '@/lib/sales/paymentPlan';

export const INSTALLMENT_STATUSES = ['pending', 'reported', 'confirmed', 'rejected'];

/* สถานะที่ **แสดงบนจอ** = สถานะใน DB + `prepaid` ที่คำนวณเอา (มติผู้ใช้ 2026-08-19)
   ⚠️ อย่าเติม `prepaid` เข้า `INSTALLMENT_STATUSES` — ตัวนั้นต้องตรงกับ CHECK ของ 0245
   เป๊ะ ๆ (แถวที่เขียนค่านี้ลง DB จะถูกปฏิเสธ) */
export const INSTALLMENT_DISPLAY_STATUSES = [...INSTALLMENT_STATUSES, 'prepaid'];

/* ⭐ `prepaid` **ไม่ใช่ค่าใน DB** — เป็นสถานะที่คำนวณจากงวดร่างที่มีวันจ่าย+หลักฐานแล้ว
   (มติผู้ใช้ 2026-08-19) เงินเข้าทะเบียนของบัญชี **ต่อเมื่อ AE Supervisor อนุมัติใบแล้ว
   เท่านั้น** งวดร่างจึงยังส่งให้บัญชีตรวจไม่ได้ แต่ต้องต่างจาก "รอชำระ" ให้เห็นด้วยตา
   ไม่งั้นคนดูจะไม่รู้ว่าเงินเข้าแล้ว · ดู `installmentDisplayStatus` */
export const INSTALLMENT_STATUS_LABELS = {
  pending: 'รอชำระ',
  prepaid: 'จ่ายแล้ว รอใบอนุมัติ',
  reported: 'รอบัญชีตรวจ',
  confirmed: 'ชำระแล้ว',
  rejected: 'บัญชีตีกลับ',
};

// ชื่อโทนของ <StatusBadge> ไม่ใช่ค่าสี (มาตรฐานเดียวกับ REQUEST_STATUS_TONES)
export const INSTALLMENT_STATUS_TONES = {
  pending: 'neutral',
  prepaid: 'info',
  reported: 'info',
  confirmed: 'success',
  rejected: 'danger',
};

export const MIN_REJECT_REASON = 10;

const money = (v) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * แปลง `quotations.paymentPlan` เป็นแถวงวดพร้อม insert
 *
 * ⚠️ `type: 'full'` = **หนึ่งงวด 100%** ไม่ใช่ศูนย์งวด — ใบที่จ่ายครั้งเดียวก็ต้องมี
 * อะไรให้ติดตามว่าเก็บเงินได้หรือยัง (`paymentScheduleRows` คืนแถวเต็มจำนวนให้อยู่แล้ว)
 * ⚠️ ยอดคำนวณด้วย `computeInstallments` ตัวเดิม **ห้ามคำนวณเอง** — ตัวนั้นโยนเศษปัด
 * ไปงวดสุดท้ายให้ยอดรวมเท่ากับใบพอดี
 */
export function installmentsFromPaymentPlan(plan, total) {
  const rows = computeInstallments(total, paymentScheduleRows(plan));
  return rows.map((row, index) => ({
    seq: index + 1,
    label: String(row.label || '').trim() || `งวดที่ ${index + 1}`,
    percent: Math.round((Number(row.percent) || 0) * 100) / 100,
    amount: money(row.amount),
    note: String(row.note || '').trim() || null,
  }));
}

/**
 * งวดที่ **ยังไม่ถูกสร้างจริง** — คำนวณสดจากแผนของ QT ทุกครั้งที่เรนเดอร์ เพื่อโชว์ให้ดู
 * ตั้งแต่ใบยังเป็นร่าง (มติผู้ใช้ 2026-08-13: *"แค่สร้างก็โชว์งวดให้ดูได้แล้ว"*)
 *
 * ⚠️ **ห้ามนับ preview เป็นงวดจริง** — ไม่มี id ไม่มีสถานะ กดอะไรไม่ได้ทั้งสิ้น
 * ⭐ ตั้งแต่ B-4 นี่เป็นแค่จอเปล่าก่อนกด "เริ่มติดตามการชำระ" — กดแล้วได้ **แถวจริง**
 * ที่กรอกกำหนดชำระได้ทันทีตั้งแต่ใบยังเป็นร่าง (ดู `withLiveAmounts`)
 */
export function previewInstallments(plan, total) {
  if (paymentNotRequired(total)) return [];
  const rows = installmentsFromPaymentPlan(plan, total);
  return rows.map((row) => ({ ...row, preview: true, status: 'pending', id: null }));
}

/* ── ใบยอด 0 ไม่ต้องยืนยันการชำระ (มติผู้ใช้ 2026-08-18) ────────────────────
   ใบยอด 0 เดินได้ตลอดเส้นอยู่แล้ว (มติ 2026-08-03 · mig 0196/0197) แต่ยังสร้างงวด
   ยอด 0 ทิ้งไว้ให้ค้าง `pending` ตลอดกาล ⇒ ใบขึ้นว่า "ยังเก็บเงินไม่ครบ" ทั้งที่ไม่มี
   เงินให้เก็บ และคิวบัญชีมีของที่ไม่มีวันมีหลักฐานมาแนบ
   ⇒ **ยอด 0 = จบที่อนุมัติใบ** ไม่มีงวด ไม่มีการแจ้ง/ยืนยัน
   ⚠️ ตัดสินจาก "ยอดของใบ" ไม่ใช่ยอดรายงวด — งวดยอด 0 ในใบที่มียอดจริง (เช่นแถม)
   ยังต้องเดินตามปกติ เพราะมันเป็นส่วนหนึ่งของข้อตกลงที่เซ็นไปแล้ว */
// ⚠️ **ไม่รู้ยอด ≠ ยอด 0** — `undefined/null/''` ต้องคืน false
// 🐞 เขียนเป็น `money(total) <= 0` ตรง ๆ รอบแรกแล้วเทสต์เดิมแดงทันที: ผู้เรียกที่ไม่ได้
// ส่งยอดมา (fixture เก่า · แถวที่ยังโหลดไม่เสร็จ) จะถูกตัดสินว่าเป็นใบยอด 0 ทั้งหมด
// ⇒ ราง "เก็บเงิน" ของใบปกติกลายเป็น "ไม่ต้องเก็บเงิน" เงียบ ๆ
export function paymentNotRequired(total) {
  if (total === null || total === undefined || total === '') return false;
  const n = Number(total);
  return Number.isFinite(n) && money(n) <= 0;
}

// ── งวดร่าง vs งวดที่หยุดยอดแล้ว (B-4 · mig 0259) ────────────────────────
//
// ⭐ **ย้ายจุดที่หยุดยอด ไม่ใช่จุดที่สร้างแถว** — เหตุผลเดิมของ 0245 ("ยอดยังเปลี่ยน
// ได้จนกว่าจะอนุมัติ") ถูก แต่ปัญหาจริงคือ *snapshot ครั้งเดียวแล้วไม่มีใครมาทับ*
// ⇒ งวดเกิดได้ตั้งแต่ร่าง (SA กรอก `dueDate` ได้ตอนที่กำลังคุยเงื่อนไขกับลูกค้าพอดี)
// แล้วยอดถูกเขียนทับครั้งสุดท้าย + `frozenAt` ตอนอนุมัติ
export const isInstallmentFrozen = (row) => !!row?.frozenAt;

/* ── เงินที่เข้ามาก่อนใบอนุมัติ (มติผู้ใช้ 2026-08-19 — ทางเลือก ก.) ─────────
   ของจริง: ลูกค้าโอนมัดจำเพื่อ *ให้เริ่มงาน* ⇒ เงินเข้าก่อนการอนุมัติภายในเป็นเรื่องปกติ
   ก่อนหน้านี้ไม่มีที่ให้ลง SA ต้องถือสลิปไว้รอใบผ่านอนุมัติ — หลักฐานที่ค้างในมือคนคือ
   หลักฐานที่หายได้ (เหตุผลเดียวกับที่ด่าน "ไล่ลำดับงวด" เลือกแบบหลวม)

   ⭐ **บันทึกได้ แต่ยังไม่ใช่การแจ้ง** — งวดร่างเก็บ `paidOn` + หลักฐานได้เลย โดย
   `status` ยังถูกบังคับเป็น `pending` ตาม CHECK `sales_order_installments_draft_pending`
   ของ 0259 (ไม่ต้องมี migration ใหม่ — CHECK นั้นคุมแค่ `status` ไม่ได้คุมหลักฐาน)
   แล้ว `freezeInstallments` เลื่อนให้เป็น `reported` ตอนอนุมัติ ด้วยกลไกเดียวกับที่
   ยืมหลักฐานตอนปิด Won อยู่แล้ว

   🛑 **กติกาที่คุมเรื่องนี้จริง ๆ คือ "เงินเข้าบัญชีต่อเมื่อ AE Supervisor อนุมัติใบ"**
   (มติผู้ใช้ 2026-08-19) ไม่ใช่ "ยอดยังลอย" อย่างที่ 0259 เขียนไว้ — ของจริงยอดนิ่ง
   ตั้งแต่ออกใบ: QT ที่ออก SO แล้วเป็น `accepted` ⇒ แก้ไม่ได้ (`EDITABLE_STATUSES`)
   · `unaccept` ติด `sales_order_exists` ที่ระดับ DB (0138) · และ SO ร่างแก้ได้แค่
   `referenceDoc`/`notes` ⇒ **ยอดต่องวดเปลี่ยนไม่ได้ผ่านหน้าจอเลย**
   ⇒ อย่าย้อนกลับไปอธิบายด่านนี้ด้วยเหตุผลเรื่องยอดอีก ถ้าจะปลดต้องถามว่า
   "ให้บัญชีเห็นเงินก่อน AE Sup อนุมัติได้ไหม" ซึ่งคำตอบวันนี้คือไม่ */
export function installmentPrepaid(row) {
  return !isInstallmentFrozen(row)
    && !!row?.paidOn
    && Array.isArray(row?.evidence) && row.evidence.length > 0;
}

/** สถานะที่ **แสดงบนจอ** — ต่างจาก `status` ใน DB เฉพาะงวดร่างที่บันทึกเงินไว้แล้ว */
export function installmentDisplayStatus(row) {
  return installmentPrepaid(row) ? 'prepaid' : (row?.status || 'pending');
}

/**
 * ยอดที่ควรแสดง — งวดร่างเดินตามแผนของ QT สด ๆ · งวดที่ freeze แล้วใช้ค่าที่เก็บไว้
 *
 * ⚠️ **จอต้องไม่โกหกแม้แผนเปลี่ยนระหว่างร่าง** — QT แก้ได้ ⇒ ยอดที่เขียนไว้ตอนกด
 * "เริ่มติดตาม" อาจไม่ตรงกับแผนวันนี้ · ที่นี่ทับให้ตอน *อ่าน* ส่วนการเขียนจริง
 * เกิดครั้งเดียวตอนอนุมัติ (`freezeInstallments`) ⇒ ไม่มี write-on-read
 *
 * ⚠️ จับคู่ด้วย `seq` — `dueDate`/`note`/สถานะเป็นของ SA ต้องรอดจากการทับเสมอ
 */
export function withLiveAmounts(rows = [], plan = null, total = 0) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;
  const live = new Map(installmentsFromPaymentPlan(plan, total).map((r) => [r.seq, r]));
  return list.map((row) => {
    if (isInstallmentFrozen(row)) return row;
    const fresh = live.get(row.seq);
    if (!fresh) return row;
    return { ...row, percent: fresh.percent, amount: fresh.amount, label: fresh.label };
  });
}

/**
 * แผนใน QT ต่างจากงวดที่ตั้งไว้ไหม — คืน `{ planned, tracked }` หรือ null เมื่อตรงกัน
 *
 * ⭐ เกิดจริงเมื่อ QT ถูกแก้หลังกด "เริ่มติดตาม" · `withLiveAmounts` แก้ยอดให้ได้
 * แต่ **จำนวนงวดที่ต่างกันแก้ด้วยการทับยอดไม่ได้** ⇒ ต้องบอกผู้ใช้ตรง ๆ
 * ⚠️ ตอนอนุมัติ `freezeInstallments` จะตั้งงวดใหม่ทั้งชุดให้เอง — ข้อความบนจอต้อง
 * บอกแบบนั้น ไม่ใช่ปล่อยให้คนเดาว่าจะเกิดอะไรขึ้น
 */
export function installmentPlanDrift(rows = [], plan = null, total = 0) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;
  if (list.some(isInstallmentFrozen)) return null; // freeze แล้วไม่ตามแผนอีก
  const planned = installmentsFromPaymentPlan(plan, total).length;
  if (!planned || planned === list.length) return null;
  return { planned, tracked: list.length };
}

/**
 * งวดพร้อม insert — เท่ากับ `installmentsFromPaymentPlan` แต่ **ยืมหลักฐานจากตอนปิด Won**
 * มาตั้งงวดแรกให้เมื่อใบนั้นปิดด้วยสลิปโอนเงิน (มติผู้ใช้ 2026-08-13)
 *
 * ⭐ เหตุผล: `payment_slip` เป็นหนึ่งใน `WON_DOC_TYPES` ⇒ ใบที่ปิด Won ด้วยสลิป
 * แปลว่า **จ่ายมาแล้วตั้งแต่ก่อนออกใบสั่งขาย** · ปล่อยให้ทุกงวดเป็น `pending`
 * แล้วบังคับให้ SA ไปแนบสลิปใบเดิมซ้ำ = ให้คนกรอกของที่ระบบถืออยู่แล้ว
 *
 * ⚠️ **ยังต้องผ่านบัญชีเหมือนเดิม** — ตั้งให้แค่ `reported` ไม่ใช่ `confirmed`
 * ข้ามด่านบัญชีเมื่อไรก็เท่ากับไม่มีด่าน (กติกาเดิมของสายนี้)
 * ⚠️ ตั้งเฉพาะ **งวดแรก** — สลิปใบเดียวรู้แค่ว่ามีเงินเข้า ไม่รู้ว่าครอบคลุมกี่งวด
 *    ยอดจริงเป็นเรื่องที่บัญชีตรวจตอนคอนเฟิร์ม
 */
export function buildInstallmentsForOrder(plan, total, { wonEvidence = null, actor = null, now = null } = {}) {
  // ใบยอด 0 ไม่มีงวดเลย (มติผู้ใช้ 2026-08-18) — ดู paymentNotRequired
  if (paymentNotRequired(total)) return [];
  const rows = installmentsFromPaymentPlan(plan, total);
  const paidOn = wonEvidence?.docDate || null;
  const seeded = wonEvidence?.docType === 'payment_slip'
    && !!paidOn
    && Array.isArray(wonEvidence?.attachments)
    && wonEvidence.attachments.length > 0;

  if (!seeded || !rows.length) return rows;

  return rows.map((row, index) => (index === 0
    ? {
      ...row,
      status: 'reported',
      paidOn,
      reportedAt: now || new Date().toISOString(),
      reportedById: actor?.id || null,
      reportedByName: actor?.name || null,
      evidence: wonEvidence.attachments,
      note: row.note || 'หลักฐานจากตอนปิด Won (สลิปโอนเงิน) — ระบบยกมาให้ รอบัญชีตรวจ',
    }
    : row));
}

/** สรุปว่า "ชำระครบยัง" — ตัวเลขทุกตัวที่หน้า SO และรางขวาต้องใช้ */
export function paymentRollup(rows = [], todayIso = null) {
  const list = Array.isArray(rows) ? rows : [];
  const count = list.length;
  const confirmed = list.filter((r) => r.status === 'confirmed');
  const reported = list.filter((r) => r.status === 'reported');
  const rejected = list.filter((r) => r.status === 'rejected');
  const open = list.filter((r) => r.status !== 'confirmed');

  const totalAmount = money(list.reduce((sum, r) => sum + (Number(r.amount) || 0), 0));
  const confirmedAmount = money(confirmed.reduce((sum, r) => sum + (Number(r.amount) || 0), 0));

  // เลยกำหนด = ยังไม่ confirmed และวันครบกำหนดผ่านไปแล้ว
  // ⚠️ `reported` ก็นับว่าเลยกำหนดได้ — แจ้งแล้วแต่บัญชียังไม่รับรอง เงินยังไม่เข้าจริง
  const overdue = todayIso
    ? open.filter((r) => r.dueDate && String(r.dueDate) < String(todayIso))
    : [];

  const upcoming = open
    .map((r) => r.dueDate)
    .filter(Boolean)
    .sort();

  const complete = count > 0 && confirmed.length === count;

  return {
    count,
    confirmedCount: confirmed.length,
    reportedCount: reported.length,
    rejectedCount: rejected.length,
    openCount: open.length,
    totalAmount,
    confirmedAmount,
    outstandingAmount: money(totalAmount - confirmedAmount),
    overdueCount: overdue.length,
    nextDue: upcoming[0] || null,
    complete,
  };
}

/** สถานะรวมหนึ่งบรรทัด — คืน { state, tone } ให้หน้าเว็บเลือกป้าย/ข้อความเอง */
export function paymentState(rollup, { notRequired = false } = {}) {
  // ใบยอด 0 — จบที่อนุมัติใบ ไม่ใช่ "ยังไม่เก็บเงิน" (มติผู้ใช้ 2026-08-18)
  if (notRequired) return { state: 'not_required', tone: 'neutral' };
  if (!rollup.count) return { state: 'none', tone: 'neutral' };
  if (rollup.complete) return { state: 'complete', tone: 'success' };
  if (rollup.overdueCount) return { state: 'overdue', tone: 'danger' };
  if (rollup.rejectedCount) return { state: 'rejected', tone: 'danger' };
  if (rollup.reportedCount) return { state: 'reviewing', tone: 'info' };
  return { state: 'open', tone: 'warning' };
}

/**
 * ด่านเดียวที่ทั้งปุ่มบนหน้าเว็บและ API ใช้ร่วมกัน — คืนข้อความไทยเมื่อทำไม่ได้ หรือ null เมื่อผ่าน
 *
 * ⭐ เขียนที่เดียวเพราะปุ่มกับ API ขัดกันไม่ได้ (แพตเทิร์นเดียวกับ `scentDesignOrderError`)
 * ⚠️ ตัวนี้ตอบเฉพาะ "สถานะ + สิทธิ์" · ส่วน "ใบนี้อนุมัติแล้วหรือยัง" เป็นของผู้เรียก
 */
/* ── งวดต้องไล่ลำดับ ห้ามข้าม (มติผู้ใช้ 2026-08-18) ────────────────────────
   **แบบหลวม**: งวดก่อนหน้าต้อง "แจ้งแล้วขึ้นไป" (reported / confirmed) พอ —
   ไม่ต้องรอบัญชีคอนเฟิร์มครบ

   ⭐ เลือกหลวมเพราะแบบเข้ม (ต้อง confirmed ครบ) จะเอางานฝ่ายขายไปผูกกับคิวบัญชี:
   ลูกค้าโอนงวด 2 มาแล้วแต่บัญชียังไม่ว่างตรวจงวด 1 ⇒ แนบหลักฐานงวด 2 ไม่ได้ทั้งที่
   ของอยู่ในมือ · หลักฐานที่ค้างในมือคนคือหลักฐานที่หายได้

   ⚠️ `rejected` ของงวดก่อนหน้า **ไม่ผ่าน** — บัญชีตีกลับแปลว่างวดนั้นยังไม่จบ
   ⚠️ ไม่ส่ง `rows` มา = ข้ามด่านนี้ (ผู้เรียกที่ไม่มีบริบทงวดอื่น เช่นเช็คสิทธิ์ล้วน)
   ⚠️ **งวดร่างที่บันทึกเงินไว้แล้วผ่านด่านนี้ด้วย** (2026-08-19) — สถานะมันยังเป็น
   `pending` ตาม CHECK ของ 0259 ถ้านับเป็น "ยังไม่แจ้ง" งวดถัดไปจะกรอกไม่ได้ทั้งที่
   งวดก่อนหน้ามีสลิปอยู่แล้ว ⇒ ผู้ใช้เจอทางตันตั้งแต่งวด 2 ของทุกใบที่ยังไม่อนุมัติ */
export function installmentSequenceError(row, rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const seq = Number(row?.seq) || 0;
  const blocking = rows
    .filter((r) => (Number(r?.seq) || 0) < seq)
    .filter((r) => !['reported', 'confirmed'].includes(r?.status || 'pending'))
    .filter((r) => !installmentPrepaid(r))
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
  if (!blocking.length) return null;
  const names = blocking.map((r) => `งวดที่ ${r.seq}`).join(', ');
  return `ต้องแจ้งงวดก่อนหน้าให้ครบก่อน (${names}) — งวดชำระไล่ตามลำดับ ข้ามไม่ได้`;
}

/* ปลายทางของการ "แจ้งชำระ" ขึ้นกับว่าใครกด (มติผู้ใช้ 2026-08-18 — ทางเลือก ก.)
   - ฝ่ายขายแจ้ง  → `reported` เข้าคิวให้บัญชีตรวจ
   - **บัญชีแจ้งเอง → `confirmed` เลย** เพราะบัญชีคือคนตัดสินอยู่แล้ว ให้แจ้งแล้วรอ
     ตัวเองมายืนยันคือพิธีกรรม

   ⭐ ผลพลอยได้ที่ตั้งใจ: คิว `reported` เหลือ **เฉพาะของที่ฝ่ายขายแจ้ง** ⇒ บัญชี
   แยกออกทันทีว่าอันไหนต้องมาตรวจ โดยไม่ต้องเพิ่มสถานะหรือฟิลด์ใหม่เลย
   (นี่คือคำตอบของคำถาม "จะให้บัญชีรู้ได้ยังไงว่าอันไหน SA แจ้งไว้")

   ⭐ **งวดร่างจอดที่ `pending` เสมอ ไม่ว่าใครกด** (มติผู้ใช้ 2026-08-19) — งานจะถึงมือ
   บัญชีต่อเมื่อ **AE Supervisor อนุมัติใบแล้ว** เท่านั้น (ดู `installmentPrepaid`)
   แม้แต่บัญชีกดเองก็ยังไม่ `confirmed`: ใบที่ยังไม่ผ่านด่านอนุมัติไม่ควรมีเงินรับรอง
   แขวนอยู่ ไม่งั้นคำรับรองจะล็อกใบไม่ให้ย้อน/ออก Rev. ตั้งแต่ยังไม่มีใครอนุมัติสักคน
   ⇒ `freezeInstallments` เลื่อนให้เป็น `reported` ตอนอนุมัติ แล้วบัญชีค่อยกดรับรอง
   ⚠️ ไม่ส่ง `row` มา = ตัดสินแบบเดิม (ผู้เรียกที่ถามแค่ "คนนี้กดแล้วได้อะไร") */
export function installmentReportOutcome(user, row = null) {
  if (row && !isInstallmentFrozen(row)) return 'pending';
  return canConfirmPayment(user) ? 'confirmed' : 'reported';
}

export function installmentActionError(row, action, user, options = {}) {
  if (!row) return 'ไม่พบงวดที่ระบุ';
  const status = row.status || 'pending';

  /* ใบยอด 0 ไม่มีขั้นยืนยันการชำระ (มติผู้ใช้ 2026-08-18) — อนุมัติใบแล้วจบ
     ⚠️ **ไม่ลบงวดเก่าทิ้ง** ใบที่ออกก่อนมตินี้ยังมีแถวอยู่ (prod 13 ใบ) พร้อมร่องรอย
     ของคนที่เคยกดไปแล้ว — ที่ทำคือ *ปิดปุ่ม* ไม่ใช่ลบประวัติ · แถวยังอ่านได้ตามเดิม
     ⚠️ ต้องส่ง `orderTotal` มาถึงจะรู้ ไม่ส่ง = ไม่ตัดสิน (ผู้เรียกที่ไม่มีบริบทใบ) */
  const orderTotal = options.orderTotal;
  if (orderTotal !== undefined && paymentNotRequired(orderTotal)
    && ['report', 'confirm', 'reject', 'withdraw', 'unconfirm'].includes(action)) {
    return 'ใบนี้ยอดรวม 0 บาท — ไม่มีขั้นยืนยันการชำระ จบที่การอนุมัติใบสั่งขาย';
  }

  // ตั้ง/แก้วันครบกำหนดรายงวด — QT ไม่มีวันมาให้ (มติผู้ใช้: SA กรอกเองทีละงวด)
  // แก้ได้เสมอแม้ใบอนุมัติแล้ว เพราะของจริงลูกค้าเลื่อนจ่ายบ่อย · แต่ยอด/% แก้ไม่ได้
  // (เป็น snapshot ของ QT ที่เซ็นไปแล้ว)
  if (action === 'schedule') {
    if (!canUser(user, 'salesplan:edit')) return 'ไม่มีสิทธิ์แก้กำหนดชำระ';
    if (status === 'confirmed') return 'งวดนี้บัญชีคอนเฟิร์มแล้ว แก้กำหนดชำระไม่ได้';
    return null;
  }

  if (action === 'report') {
    // ฝ่ายขายแจ้งเพื่อให้บัญชีตรวจ · **บัญชีแจ้งเองก็ได้** แล้วจบในก้าวเดียว
    // (มติผู้ใช้ 2026-08-18 — ดู installmentReportOutcome)
    if (!canUser(user, 'salesplan:edit') && !canConfirmPayment(user)) {
      return 'ไม่มีสิทธิ์แจ้งการชำระ';
    }
    /* ⭐ **งวดร่างบันทึกเงินได้แล้ว แต่ยังไม่ส่งให้บัญชี** (มติผู้ใช้ 2026-08-19)
       เดิมบล็อกทั้งก้าว โดยอ้างว่ายอดของงวดร่างยังเดินตามใบ · ข้ออ้างนั้นไม่ตรงกับของจริง
       (ยอดนิ่งตั้งแต่ออกใบ — ดู `installmentPrepaid`) และมันห้ามผิดอย่างด้วย: สิ่งที่ต้อง
       รอการอนุมัติคือ **การส่งให้บัญชีตรวจ** ไม่ใช่การบันทึกว่าเงินเข้า
       ⇒ ปลายทางไปจอดที่ `pending` แทน (ดู `installmentReportOutcome`) แล้วเลื่อนให้เอง
       ตอนอนุมัติ · กติกา "เงินถึงบัญชีหลัง AE Sup อนุมัติ" ไม่ถูกแตะสักนิด
       ⚠️ CHECK `sales_order_installments_draft_pending` ของ 0259 ยังอยู่ครบและยัง
       เป็นด่านสุดท้าย — มันคุมแค่ `status` จึงไม่ขวางการเก็บ `paidOn`/หลักฐาน */
    if (installmentPrepaid(row)) {
      return 'งวดนี้บันทึกการจ่ายไว้แล้ว — จะส่งให้บัญชีตรวจเองเมื่อใบสั่งขายอนุมัติ';
    }
    if (status === 'confirmed') return 'งวดนี้บัญชีคอนเฟิร์มแล้ว แจ้งซ้ำไม่ได้';
    if (status === 'reported') return 'งวดนี้แจ้งไปแล้ว รอบัญชีตรวจ';
    if (!options.paidOn) return 'ต้องระบุวันที่ลูกค้าชำระ';
    const sequence = installmentSequenceError(row, options.rows);
    if (sequence) return sequence;
    return null;
  }

  // ดึงกลับ — ของผู้แจ้งเองเท่านั้น และต้องยังไม่มีใครตัดสิน (รูปเดียวกับ "ดึงกลับ" ของ SO)
  // ⚠️ **งวดร่างที่บันทึกเงินไว้ก็ดึงกลับได้** (2026-08-19) — สถานะมันยัง `pending`
  // ถ้ายึดตาม status อย่างเดียว คนที่แนบสลิปผิดใบจะลบทิ้งไม่ได้จนกว่าใบจะอนุมัติ
  if (action === 'withdraw') {
    if (status !== 'reported' && !installmentPrepaid(row)) {
      return 'ดึงกลับได้เฉพาะงวดที่แจ้งแล้วและบัญชียังไม่ตรวจ';
    }
    if (!canUser(user, 'salesplan:edit')) return 'ไม่มีสิทธิ์ดึงกลับ';
    if (row.reportedById && row.reportedById !== user?.id && user?.role !== 'admin') {
      return 'ดึงกลับได้เฉพาะผู้ที่แจ้งงวดนี้';
    }
    return null;
  }

  /* ── ถอนคำรับรองของบัญชี (มติผู้ใช้ 2026-08-13) ────────────────────────
     ปิดข้อค้างเดิมที่ยังไม่ตัดสิน: *"งวดที่คอนเฟิร์มแล้ว ให้บัญชีถอนได้"*

     ⭐ **ถอยไป `reported` ไม่ใช่ `pending`** — คำแจ้งของฝ่ายขายและหลักฐานยังอยู่ครบ
     สิ่งที่ถูกถอนคือ **คำรับรองของบัญชี** ไม่ใช่การแจ้งของ SA · ถอยไป pending เมื่อไร
     เท่ากับลบงานของฝ่ายขายทิ้งด้วย แล้วเขาต้องแนบหลักฐานใหม่ทั้งที่ไม่ได้ทำอะไรผิด

     ⚠️ **ของบัญชีเท่านั้น** — คนที่รับรองว่าเงินเข้าคือคนเดียวที่ถอนคำนั้นได้
     ⚠️ **ต้องมีเหตุผล** เท่ากับตอนตีกลับ: นี่คือการกลับคำเรื่องเงินที่เคยบอกว่ารับแล้ว
        และมันปลดล็อกใบให้ย้อนการอนุมัติ/ออก Rev. ได้ด้วย (ดู `paymentLockReason`)
        ⇒ ต้องมีร่องรอยว่าทำไม ไม่ใช่กดแล้วหายไปเฉย ๆ */
  if (action === 'unconfirm') {
    if (!canConfirmPayment(user)) return 'ถอนคำรับรองได้เฉพาะฝ่ายบัญชี';
    if (status !== 'confirmed') return 'ถอนได้เฉพาะงวดที่บัญชีคอนเฟิร์มไปแล้ว';
    const reason = String(options.reason || '').trim();
    if (reason.length < MIN_REJECT_REASON) {
      return `ต้องระบุเหตุผลที่ถอนอย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`;
    }
    return null;
  }

  /* ── ผูก/ถอดคำร้องขอเอกสารการเงิน (B-5 · mig 0260) ────────────────────
     ⭐ **ของฝ่ายขาย ไม่ใช่ของบัญชี** — คนที่รู้ว่าใบวางบิลใบไหนครอบงวดไหนคือคนที่
     เปิดคำร้องนั้น · บัญชีเห็นความเชื่อมโยงได้แต่ไม่ต้องมากดให้
     ⚠️ **แนบได้แม้งวดคอนเฟิร์มแล้ว** ต่างจาก `schedule` — ของจริงขอใบเสร็จ *หลัง*
     เงินเข้าเป็นเรื่องปกติ ปิดตรงนี้เมื่อไรใบเสร็จจะไม่มีที่ให้แขวน */
  if (action === 'link' || action === 'unlink') {
    if (!canUser(user, 'salesplan:edit')) return 'ไม่มีสิทธิ์แก้การผูกคำร้อง';
    if (action === 'link' && !String(options.billingRequestId || '').trim()) {
      return 'ต้องเลือกคำร้องที่จะผูก';
    }
    if (action === 'unlink' && !row.billingRequestId) return 'งวดนี้ยังไม่ได้ผูกคำร้อง';
    return null;
  }

  if (action === 'confirm' || action === 'reject') {
    if (!canConfirmPayment(user)) return 'คอนเฟิร์มได้เฉพาะฝ่ายบัญชี';
    if (status !== 'reported') {
      return status === 'confirmed'
        ? 'งวดนี้คอนเฟิร์มไปแล้ว'
        : 'ยังไม่มีการแจ้งชำระให้ตรวจ';
    }
    if (action === 'reject') {
      const reason = String(options.reason || '').trim();
      if (reason.length < MIN_REJECT_REASON) {
        return `ต้องระบุเหตุผลที่ตีกลับอย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`;
      }
    }
    return null;
  }

  return 'คำสั่งไม่ถูกต้อง';
}

/**
 * ย้อนการอนุมัติ / ออก Rev. ได้ไหมเมื่อใบนี้มีงวดที่บัญชีรับรองแล้ว
 * ⚠️ เงินที่บัญชีคอนเฟิร์มแล้วคือเงินที่รับมาจริง — ถอยใบทับมันเงียบ ๆ ไม่ได้
 * (กติกาเดียวกับที่ใบยื่นสรรพสามิตบล็อกปุ่มย้อนการอนุมัติอยู่แล้ว)
 */
export function paymentLockReason(rows = []) {
  const confirmed = (Array.isArray(rows) ? rows : []).filter((r) => r.status === 'confirmed');
  if (!confirmed.length) return null;
  return `มีงวดที่บัญชีคอนเฟิร์มแล้ว ${confirmed.length} งวด — ต้องให้บัญชีจัดการก่อน`;
}

/**
 * สรุปงวดพอให้ **ตารางรายการ SO** วาดคอลัมน์ "เก็บแล้ว x/y" ได้ (มติผู้ใช้ 2026-08-13)
 *
 * ⭐ `y` มาจากงวดจริงถ้ามี · ถ้ายังไม่เริ่มติดตามใช้ **จำนวนงวดตามแผนของ QT** แทน
 * ไม่งั้นใบร่างจะขึ้นช่องว่างทั้งที่ใบเสนอราคาระบุไว้แล้วว่าแบ่งกี่งวด
 * ⚠️ `tracked:false` = ตัวเลขมาจากแผน ไม่ใช่ของจริง — หน้าเว็บต้องแยกให้ตาเห็น
 * ⚠️ คืนค่าเบา ๆ เท่าที่ตารางใช้ ไม่ใช่ rollup ทั้งก้อน (ลิสต์มีได้หลายร้อยแถว)
 */
export function salesOrderPaymentCell(rows = [], plan = null, todayIso = null, orderTotal = undefined) {
  // ใบยอด 0 ไม่มีอะไรให้เก็บ — คอลัมน์ว่างดีกว่าขึ้น `0/1` ที่อ่านเหมือนค้างเก็บเงิน
  if (orderTotal !== undefined && paymentNotRequired(orderTotal)) return null;
  const list = Array.isArray(rows) ? rows : [];
  if (list.length) {
    const paid = list.filter((r) => r.status === 'confirmed').length;
    const overdue = list.filter(
      (r) => r.status !== 'confirmed' && r.dueDate && todayIso && String(r.dueDate) < String(todayIso),
    ).length;
    return {
      tracked: true,
      paid,
      count: list.length,
      complete: paid === list.length,
      overdue,
      reviewing: list.filter((r) => r.status === 'reported').length,
      rejected: list.filter((r) => r.status === 'rejected').length,
    };
  }
  const planned = paymentScheduleRows(plan).length;
  if (!planned) return null;
  return { tracked: false, paid: 0, count: planned, complete: false, overdue: 0, reviewing: 0, rejected: 0 };
}

/**
 * คำอธิบายสถานะการชำระของ **ทั้งใบ** สำหรับตารางรายการ SO (มติผู้ใช้ 2026-08-13)
 *
 * > *"อยากแก้สถานะที่แจ้งให้รายการ SO"* — เดิมคอลัมน์งวดชำระมีแต่ตัวเลข `x/y`
 * ซึ่งบอกว่าเก็บได้กี่งวด แต่ไม่บอกว่า **ตอนนี้ค้างอยู่ที่ใคร** · ใบที่ขึ้น `0/2`
 * เหมือนกันเป๊ะ อาจเป็นได้ทั้ง "ลูกค้ายังไม่จ่าย" กับ "จ่ายแล้วรอบัญชีรับรอง"
 * ซึ่งเป็นงานของคนละฝ่ายกัน
 *
 * ⭐ คืน **เรื่องเดียวที่ด่วนที่สุด** ไม่ใช่ทุกเรื่อง — ช่องในตารางมีที่บรรทัดเดียว
 * และการยัดสองเรื่องลงไปทำให้ไม่มีเรื่องไหนอ่านออก · ลำดับความด่วน:
 *   เลยกำหนด → บัญชีตีกลับ → รอบัญชีรับรอง → เก็บครบแล้ว
 *
 * @returns {{label: string, tone: 'danger'|'warning'|'success'|'idle'}|null}
 *          null = ไม่มีอะไรต้องบอกเพิ่ม (ตัวเลข x/y พอแล้ว)
 */
export function salesOrderPaymentNote(payment) {
  if (!payment) return null;
  // ยังไม่เริ่มติดตาม = ตัวเลขที่เห็นมาจาก **แผนใน QT** ไม่ใช่ของจริง ต้องบอกให้รู้
  if (!payment.tracked) return { label: 'ยังไม่เริ่มติดตาม', tone: 'idle' };
  if (payment.overdue) return { label: `เลยกำหนด ${payment.overdue} งวด`, tone: 'danger' };
  if (payment.rejected) return { label: `บัญชีตีกลับ ${payment.rejected} งวด`, tone: 'danger' };
  if (payment.reviewing) return { label: `รอบัญชีรับรอง ${payment.reviewing} งวด`, tone: 'warning' };
  if (payment.complete) return { label: 'เก็บครบแล้ว', tone: 'success' };
  return { label: 'รอลูกค้าชำระ', tone: 'idle' };
}
