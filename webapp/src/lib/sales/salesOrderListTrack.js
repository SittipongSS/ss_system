import { paymentNotRequired } from '@/lib/sales/salesOrderPayments';

// ── รางสามขั้นบนตารางรายการใบสั่งขาย (มติผู้ใช้ 2026-08-13 · แบบ ข) ─────────
//
// > *"อยากรื้อดีไซน์การแสดงข้อมูลตารางรายการในหน้าใบสั่งขาย"* → เลือกแบบ ข
//
// ⭐ **หน้านี้คนเปิดมาถามว่า "ใบไหนค้างที่ใคร"** ซึ่งเป็นคำถามเรื่อง **ลำดับขั้น**
// ไม่ใช่เรื่องตัวเลข · ป้ายสถานะเดียวตอบได้แค่จุดปัจจุบัน แต่ไม่บอกว่าผ่านอะไรมาแล้ว
// และเหลืออะไรอีก · รางสามขั้นตอบทั้งสามอย่างในสายตาเดียว
//
// ⚠️ **สามขั้นนี้คือสายงานจริงของใบ ไม่ใช่การตกแต่ง** — แต่ละขั้นเป็นคนละแกนที่
// เดินต่อกัน: AE Supervisor อนุมัติเอกสาร (`status`) → บัญชีตรวจใบ (`financeStatus`
// · mig 0250) → เก็บเงินครบ (งวดชำระ · mig 0245) · สามอย่างนี้อยู่คนละคอลัมน์ใน DB
// และเดินไม่พร้อมกัน จึงต้องเห็นแยกกัน ไม่ใช่ยุบเป็นสถานะเดียว
//
// ⚠️ ใช้ภาษาเดียวกับ **เส้นเดินงานในหน้ารายละเอียด SO** — คนคนเดียวกันเปิดสองหน้านี้
// ห่างกันคลิกเดียว ถ้าคำหรือลำดับไม่ตรงกันจะอ่านเหมือนคนละเรื่อง

/** สถานะของหมุดแต่ละขั้น — เรียงจากยังไม่ถึง ไปถึงแล้ว */
// `skip` = ขั้นที่ใบนี้ไม่มี (ไม่ใช่ยังไม่ถึง และไม่ใช่ผ่านแล้ว)
export const TRACK_STATES = ['todo', 'now', 'done', 'bad', 'skip'];

const step = (key, label, state, note = null) => ({ key, label, state, note });

/**
 * รางสามขั้นของใบหนึ่งใบ
 *
 * @param order  แถวจาก `/api/sales-planning/sales-orders` — ใช้ `status` ·
 *               `financeStatus` · `payment` (ผลของ `salesOrderPaymentCell`)
 * @returns {{cancelled: boolean, steps: Array<{key,label,state,note}>}}
 *          `cancelled: true` = ใบถูกยกเลิก **ไม่มีรางให้เดิน** — หน้าเว็บโชว์ป้ายแทน
 *          (ลากรางที่ตายแล้วมาแสดงทำให้อ่านเหมือนใบยังเดินอยู่)
 */
export function salesOrderListTrack(order = {}) {
  const status = order?.status || 'draft';
  if (status === 'cancelled') return { cancelled: true, steps: [] };

  const payment = order?.payment || null;
  const approved = status === 'approved';

  /* ── ขั้น 1 · AE Supervisor ตรวจเอกสาร ──────────────────────────────────
     ⚠️ `rejected` = ถูกตีกลับให้แก้ ⇒ เป็น **ธงแดงที่ขั้นนี้** ไม่ใช่ขั้นที่ถอยกลับไป
     ก่อนหน้า — คนที่ต้องลงมือคือผู้ยื่น ซึ่งอยู่ตรงจุดนี้พอดี */
  const docStep = approved
    ? step('doc', 'AE Sup', 'done')
    : status === 'rejected'
      ? step('doc', 'AE Sup', 'bad', 'ถูกตีกลับ')
      : status === 'pending_approval'
        ? step('doc', 'AE Sup', 'now')
        : step('doc', 'AE Sup', 'todo');

  /* ── ขั้น 2 · บัญชีตรวจใบ (mig 0250) ────────────────────────────────────
     ⚠️ `financeStatus = null` มีสองความหมายที่ต้องแยก:
       · ใบยังไม่อนุมัติ  → ขั้นนี้ยังไม่ถึงคิว (`todo`)
       · ใบอนุมัติแล้ว    → **ออกก่อนมีขั้นนี้** ไม่ใช่ "รอตรวจ" (มติ "ไม่ backfill")
         ⇒ ยังเป็น `todo` เหมือนกัน แต่ต้องมีโน้ตบอก ไม่งั้นอ่านเหมือนบัญชีดองงาน */
  const finance = order?.financeStatus || null;
  const financeStep = !approved
    ? step('finance', 'บัญชีตรวจ', 'todo')
    : finance === 'approved'
      ? step('finance', 'บัญชีตรวจ', 'done')
      : finance === 'rejected'
        ? step('finance', 'บัญชีตรวจ', 'bad', 'บัญชีตีกลับ')
        : finance === 'pending'
          ? step('finance', 'บัญชีตรวจ', 'now')
          : step('finance', 'บัญชีตรวจ', 'todo', 'ยังไม่ส่งให้บัญชี');

  /* ── ขั้น 3 · เก็บเงิน ──────────────────────────────────────────────────
     ⚠️ **นับเฉพาะงวดที่บัญชีคอนเฟิร์ม** (`payment.paid`) — `reported` ไม่นับ
     กติกาเดียวกับทั้งระบบ (mig 0245) · ป้ายจึงบอกจำนวนงวดที่ **เก็บได้จริง**
     ⚠️ เลยกำหนด/ถูกตีกลับ = ธงแดงที่ขั้นนี้ แม้จะเก็บได้บางงวดแล้วก็ตาม */
  const paid = payment?.paid ?? 0;
  const count = payment?.count ?? 0;
  const money = count ? `เก็บเงิน ${paid}/${count}` : 'เก็บเงิน';
  /* ⭐ **ใบยอด 0 จบที่ขั้นบัญชีตรวจ** (มติผู้ใช้ 2026-08-18) — ไม่มีเงินให้เก็บ
     ⇒ ขั้นนี้ต้องเป็น `done` ไม่ใช่ `todo` ค้างตลอดกาล
     🐞 ถ้าปล่อยเป็น todo: ใบยอด 0 จะไม่มีวันขึ้น "เสร็จสมบูรณ์" ใน
     `salesOrderTrackSummary` และค้างเป็น "รอเก็บเงิน" ทั้งที่ไม่มีอะไรให้รอ */
  const moneyStep = approved && paymentNotRequired(order?.totalAmount)
    ? step('money', 'ไม่เก็บเงิน', 'skip', 'ยอด 0 — ไม่มีขั้นนี้')
    : !approved || !payment
    ? step('money', money, 'todo')
    : payment.overdue
      ? step('money', money, 'bad', `เลยกำหนด ${payment.overdue} งวด`)
      : payment.rejected
        ? step('money', money, 'bad', `บัญชีตีกลับ ${payment.rejected} งวด`)
        : payment.complete
          ? step('money', 'เก็บครบ', 'done')
          : !payment.tracked
            ? step('money', money, 'todo', 'ยังไม่เริ่มติดตาม')
            : step('money', money, 'now');

  return { cancelled: false, steps: [docStep, financeStep, moneyStep] };
}

/**
 * ป้ายสรุปรางทั้งเส้นเป็นคำเดียว — ใช้บน **จอแคบ** ที่รางสามขั้นไม่พอที่
 *
 * ⭐ บอก **ขั้นที่ต้องลงมือ** ไม่ใช่ขั้นที่ผ่านแล้ว — ธงแดงมาก่อนเสมอ เพราะเป็น
 * สิ่งเดียวที่ต้องการคนไปทำอะไรสักอย่าง
 */
export function salesOrderTrackSummary(order = {}) {
  const { cancelled, steps } = salesOrderListTrack(order);
  if (cancelled) return { label: 'ยกเลิกแล้ว', tone: 'neutral' };
  const bad = steps.find((s) => s.state === 'bad');
  if (bad) return { label: bad.note || `ติดที่ ${bad.label}`, tone: 'danger' };
  const now = steps.find((s) => s.state === 'now');
  if (now) return { label: `รอ ${now.label}`, tone: 'warning' };
  // ขั้นที่ข้าม (`skip`) ไม่บล็อกความจบ — ใบยอด 0 ที่บัญชีตรวจผ่านแล้วคือใบที่จบจริง
  if (steps.every((s) => ['done', 'skip'].includes(s.state))) {
    return { label: 'เสร็จสมบูรณ์', tone: 'success' };
  }
  // ไม่มีขั้นไหนกำลังเดินและยังไม่จบ = ค้างอยู่ที่ขั้นแรกที่ยังไม่ถึง
  const next = steps.find((s) => s.state === 'todo');
  return { label: next?.note || `ยังไม่ถึง ${next?.label || 'ขั้นถัดไป'}`, tone: 'neutral' };
}
