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

export const INSTALLMENT_STATUS_LABELS = {
  pending: 'รอชำระ',
  reported: 'รอบัญชีตรวจ',
  confirmed: 'ชำระแล้ว',
  rejected: 'บัญชีตีกลับ',
};

// ชื่อโทนของ <StatusBadge> ไม่ใช่ค่าสี (มาตรฐานเดียวกับ REQUEST_STATUS_TONES)
export const INSTALLMENT_STATUS_TONES = {
  pending: 'neutral',
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
  const rows = installmentsFromPaymentPlan(plan, total);
  return rows.map((row) => ({ ...row, preview: true, status: 'pending', id: null }));
}

// ── งวดร่าง vs งวดที่หยุดยอดแล้ว (B-4 · mig 0259) ────────────────────────
//
// ⭐ **ย้ายจุดที่หยุดยอด ไม่ใช่จุดที่สร้างแถว** — เหตุผลเดิมของ 0245 ("ยอดยังเปลี่ยน
// ได้จนกว่าจะอนุมัติ") ถูก แต่ปัญหาจริงคือ *snapshot ครั้งเดียวแล้วไม่มีใครมาทับ*
// ⇒ งวดเกิดได้ตั้งแต่ร่าง (SA กรอก `dueDate` ได้ตอนที่กำลังคุยเงื่อนไขกับลูกค้าพอดี)
// แล้วยอดถูกเขียนทับครั้งสุดท้าย + `frozenAt` ตอนอนุมัติ
export const isInstallmentFrozen = (row) => !!row?.frozenAt;

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
export function paymentState(rollup) {
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
export function installmentActionError(row, action, user, options = {}) {
  if (!row) return 'ไม่พบงวดที่ระบุ';
  const status = row.status || 'pending';

  // ตั้ง/แก้วันครบกำหนดรายงวด — QT ไม่มีวันมาให้ (มติผู้ใช้: SA กรอกเองทีละงวด)
  // แก้ได้เสมอแม้ใบอนุมัติแล้ว เพราะของจริงลูกค้าเลื่อนจ่ายบ่อย · แต่ยอด/% แก้ไม่ได้
  // (เป็น snapshot ของ QT ที่เซ็นไปแล้ว)
  if (action === 'schedule') {
    if (!canUser(user, 'salesplan:edit')) return 'ไม่มีสิทธิ์แก้กำหนดชำระ';
    if (status === 'confirmed') return 'งวดนี้บัญชีคอนเฟิร์มแล้ว แก้กำหนดชำระไม่ได้';
    return null;
  }

  if (action === 'report') {
    if (!canUser(user, 'salesplan:edit')) return 'ไม่มีสิทธิ์แจ้งการชำระ';
    /* ⭐ **แจ้งชำระบนงวดร่างไม่ได้** (B-4) — ยอดของงวดร่างยังเดินตามใบ ⇒ หลักฐาน
       ที่แนบไว้จะผูกกับตัวเลขที่กำลังจะถูกเขียนทับตอนอนุมัติ
       ⚠️ ด่านนี้ซ้ำกับ CHECK ของ 0259 โดยตั้งใจ — DB กันของที่หลุดมาทางอื่น
       ส่วนที่นี่ให้ **ข้อความที่อ่านรู้เรื่อง** แทน error ดิบของ constraint */
    if (!isInstallmentFrozen(row)) {
      return 'ใบสั่งขายยังไม่อนุมัติ — แจ้งการชำระได้เมื่อยอดต่องวดถูกยืนยันแล้ว';
    }
    if (status === 'confirmed') return 'งวดนี้บัญชีคอนเฟิร์มแล้ว แจ้งซ้ำไม่ได้';
    if (status === 'reported') return 'งวดนี้แจ้งไปแล้ว รอบัญชีตรวจ';
    if (!options.paidOn) return 'ต้องระบุวันที่ลูกค้าชำระ';
    return null;
  }

  // ดึงกลับ — ของผู้แจ้งเองเท่านั้น และต้องยังไม่มีใครตัดสิน (รูปเดียวกับ "ดึงกลับ" ของ SO)
  if (action === 'withdraw') {
    if (status !== 'reported') return 'ดึงกลับได้เฉพาะงวดที่แจ้งแล้วและบัญชียังไม่ตรวจ';
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
        และมันปลดล็อกใบให้ยกเลิกอนุมัติ/ออก Rev. ได้ด้วย (ดู `paymentLockReason`)
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
 * ยกเลิกอนุมัติ / ออก Rev. ได้ไหมเมื่อใบนี้มีงวดที่บัญชีรับรองแล้ว
 * ⚠️ เงินที่บัญชีคอนเฟิร์มแล้วคือเงินที่รับมาจริง — ถอยใบทับมันเงียบ ๆ ไม่ได้
 * (กติกาเดียวกับที่ใบยื่นสรรพสามิตบล็อกปุ่มยกเลิกอนุมัติอยู่แล้ว)
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
export function salesOrderPaymentCell(rows = [], plan = null, todayIso = null) {
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
