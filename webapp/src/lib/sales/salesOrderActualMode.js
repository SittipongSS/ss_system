// ── นับ Actual ทั้งใบ / Actual รายงวด ของใบสั่งขาย (mig 0412 · มติเจ้าของ 26/10/2026) — logic ล้วน ใช้ทั้งจอและ API ──
//
// ⭐ ที่เดียวของกติกา (docs/so-installment-actual.md "ชั้น JS"): สิทธิ์เลือกแบบ · สถานะแสดงของงวด · ส่วนแบ่งก่อน VAT
//   (คู่กับ SQL) · เหตุการณ์ Actual ของใบ · ยอดที่นับแล้วของแถวใบ · ด่านยื่น/ดึงกลับ/อนุมัติ/ตีกลับงวด · เลนรอฉันลงมือ
// ⭐ ใบ "ทั้งใบ" (`actualMode = 'order'` — ค่าตั้งต้นของทุกใบ) ทำงานเหมือนเดิมทุกตัวอักษร: Actual = `actualAmount` เต็มก้อน
//   ลงเดือนที่อนุมัติใบ · ใบ "รายงวด" นับเฉพาะงวดที่ AE Sup อนุมัติแล้ว ลงเดือนที่อนุมัติงวด (เวลาไทย)
// 🔴 ตัวเลขในไฟล์นี้ต้อง **ตรงกับ SQL ทุกสตางค์** — sync_sales_order_actual / sales_order_installment_actual_action ของ 0412
//   คิดส่วนแบ่งชุดเดียวกัน (ปัดครึ่งขึ้นที่สตางค์ · งวดท้ายรับเศษ) · แก้ฝั่งเดียว = จอกับแดชบอร์ดพูดคนละเลข
// ⚠️ ไฟล์นี้ห้าม import salesOrderWorkflow / salesOrderPayments / dashboardMetrics — สามไฟล์นั้น import ไฟล์นี้ (วง)
import { isSalesManager } from '@/lib/permissions';
import { businessMonthKey, currentMonth } from '@/lib/datePeriods';
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { workflowErrorMessage } from '@/lib/sales/documentWorkflowErrors';

export const ACTUAL_MODE_ORDER = 'order';
export const ACTUAL_MODE_INSTALLMENT = 'installment';
export const ACTUAL_MODES = Object.freeze([ACTUAL_MODE_ORDER, ACTUAL_MODE_INSTALLMENT]);
export const ACTUAL_MODE_LABELS = Object.freeze({
  [ACTUAL_MODE_ORDER]: 'Actual ทั้งใบ',
  [ACTUAL_MODE_INSTALLMENT]: 'Actual รายงวด',
});
/* ใบรายงวดต้องแบ่งอย่างน้อยสองงวด — งวดเดียว = ผลเท่ากับทั้งใบ (ค่าตั้งต้นที่ Claude เลือก · docs) */
export const MIN_INSTALLMENT_ACTUAL_ROWS = 2;
export const INSTALLMENT_ACTUAL_REASON_MIN = 10;
export const INSTALLMENT_ACTUAL_REASON_MAX = 500;

/* สถานะที่ **แสดง** ของงวดในใบรายงวด — คำนวณจาก `actualStatus` + ลำดับงวด (ไม่ใช่ค่าในฐาน)
   · `auto` (มติข้อ 10) = งวดที่ยังไม่นับบนใบที่กด "นับที่เหลือทั้งหมด" แล้ว — ไม่ต้องยื่น ฐานนับให้เอง (ค้างได้แค่ตอนขั้นนับของ Rev. ยังไม่จบ) */
export const ACTUAL_STATE_LABELS = Object.freeze({
  counted: 'นับ Actual แล้ว',
  submitted: 'รอ AE Sup อนุมัติ',
  rejected: 'ตีกลับ — ยื่นใหม่ได้',
  ready: 'ยื่นขอนับได้',
  waiting: 'รองวดก่อนรับรองเงิน',
  auto: 'รอนับอัตโนมัติ',
  /* ใบที่มีงวดยังไม่ตรึง (ตัวหยุดยอดล้มตอนอนุมัติ) — ยื่นไม่ได้จน AE Sup กดปุ่มกู้ (ตรึงแล้วนับ) · review รอบห้า 27/10 */
  unfrozen: 'รอ AE Sup ตรึงงวด',
});
// ชื่อโทนของ <StatusBadge> (มาตรฐานเดียวกับ INSTALLMENT_STATUS_TONES)
export const ACTUAL_STATE_TONES = Object.freeze({
  counted: 'success',
  submitted: 'info',
  rejected: 'danger',
  ready: 'warning',
  waiting: 'neutral',
  auto: 'warning',
  unfrozen: 'neutral',
});

/* ป้ายปุ่ม "อนุมัติงวด" ในแถวงวด (ผู้อนุมัติ) — สั้นโดยตั้งใจ (UAT 27/10 ข้อ 3: "อนุมัติงวดและนับ Actual" ในช่องปุ่มดันตารางเกินกรอบที่ 1440
   จนเมนู ⋯ ของแถวตกขอบ) · ความหมายเต็มอยู่ที่หัว/ปุ่มยืนยันของโมดัล (installmentActualApprovePrompt) และ title ของปุ่ม
   · คิวบนทะเบียน SO ใช้คำ "งวดรออนุมัติ" (INSTALLMENT_REVIEW_LABEL) ชี้มาที่ปุ่มนี้ */
export const INSTALLMENT_ACTUAL_APPROVE_ROW_LABEL = 'อนุมัติงวด';

/* คำสั่งรายงวดบน PATCH `/sales-orders/[id]/installments` → `p_action` ของ RPC sales_order_installment_actual_action */
export const INSTALLMENT_ACTUAL_ACTIONS = Object.freeze({
  actual_submit: 'submit',
  actual_withdraw: 'withdraw',
  actual_approve: 'approve',
  actual_reject: 'reject',
});

/* แจ้งสลิปงวดของใบรายงวดก่อน AE Sup อนุมัติงวด — ฐานไม่กันข้อนี้ (กันแค่บัญชีรับรอง) แต่ลำดับตามมติข้อ 4 คือ
   ยื่น → อนุมัติ → แจ้งสลิป → รับรอง ⇒ ด่านอยู่ที่ installmentActionError ของ salesOrderPayments (ปุ่มกับ API ถามตัวเดียวกัน) */
export const INSTALLMENT_ACTUAL_REPORT_BLOCKED = 'ใบนี้นับ Actual รายงวด — แจ้งสลิปงวดนี้ได้หลัง AE Sup อนุมัตินับ Actual งวดนี้แล้ว'
  + ' (กด “ยื่นขอนับงวดนี้” ก่อน)';
/* บัญชีรับรอง/บันทึกรับชำระขั้นเดียว ก่อนงวดอนุมัติ — ข้อความเดียวกับ trigger ของ 0412 (installment_actual_not_approved) */
export const INSTALLMENT_ACTUAL_CONFIRM_BLOCKED = workflowErrorMessage('installment_actual_not_approved');

/* ด่านเงินของใบรายงวดติดไหม — ผู้เรียก (installmentActionError · ledgerRow) ส่ง `order` หรือ `actualMode` มา
   ⭐ ตรงกับ trigger ของ 0412: `actualMode` ของใบ + `actualStatus` ของงวด · ใบที่ย้อนอนุมัติยังเป็นรายงวด — งวดที่ยังไม่อนุมัติ
     รับรองเงินไม่ได้จนย้ายไปใบ Rev. ซึ่งเริ่มเป็นทั้งใบ (ความเสี่ยงที่รู้แล้วใน docs)
   ⛔ **ยกเว้นใบที่ยกเลิก** (review 26/10 · ทางตันคืนเงิน 23/09 D4): ใบยกเลิกไม่นับ Actual อยู่แล้ว และไม่มีใครอนุมัตินับงวดของใบนั้นได้
     (RPC ต้องใบ approved) ⇒ ถ้ายังกัน งวดที่ลูกค้าจ่ายมาแล้ว (reported) รับรอง → คืนเงินไม่ได้เลย เหลือแค่ตีกลับ (= บันทึกว่าเงินไม่เคยเข้า)
     · ไม่ส่งใบมา (ส่งแค่ `actualMode`) = ไม่รู้สถานะ ⇒ ตัดสินตามแบบอย่างเดียวเหมือนเดิม */
export function installmentActualPaymentGated(row, { order = null, actualMode } = {}) {
  if (order?.status === 'cancelled') return false;
  const mode = order ? order : { actualMode };
  return Boolean(row) && isInstallmentActualOrder(mode) && row.actualStatus !== 'approved';
}

/* เหตุที่บัญชีรับรองงวดของใบรายงวดยังไม่ได้ — บอก **คนที่ต้องทำต่อ** ตามสถานะการนับของงวด (review 26/10)
   · ยื่นแล้ว = รอ AE Sup (ข้อความเดียวกับ trigger ของ 0412) · ยังไม่ยื่น / ถูกตีกลับ = รอฝ่ายขายยื่น (AE Sup ยังไม่มีอะไรในคิว)
   ⚠️ ผู้เรียกตัดสินว่า "ติดด่าน" เองก่อน (installmentActualPaymentGated / gate) — ตัวนี้เลือกแค่คำ
   🪤 ใบที่ **ย้อนอนุมัติแล้ว** (review รอบสอง 26/10): ด่านยังติด (งวดรอย้ายไปใบ Rev.) แต่ยื่น/อนุมัติงวดบนใบนี้ไม่ได้แล้ว
      (RPC ต้องใบ approved) ⇒ "รอฝ่ายขายยื่น/AE Sup อนุมัติ" คือทางที่ไม่มีจริง · ทางเดียวคือเจ้าของดีลออก Rev.
   @param order ใบของงวด (หรือ `{ status }`) — ไม่ส่ง = อ่าน `row.orderStatus` (แถวทะเบียนการชำระพกมาเอง) */
export const INSTALLMENT_ACTUAL_REVOKED_LOCK = 'ใบนี้ถูกย้อนการอนุมัติแล้ว — ยื่น/อนุมัตินับงวดบนใบนี้ไม่ได้'
  + ' · งวดนี้แจ้งสลิป/รับรองเงินได้เมื่อเจ้าของดีลออก Rev. (งวดย้ายไปร่าง Rev. ซึ่งเริ่มนับ Actual ทั้งใบ)';

/* ── มติเจ้าของข้อ 10 (26/10 "นับให้เอง ไม่ต้องยื่น"): ใบที่กด "นับที่เหลือทั้งหมด" แล้ว = นับทั้งก้อนจากนี้ไปถาวร ────────────────
   ⭐ สัญญาณ = มีงวด via count_rest (ตัวเดียวกับ SQL ของ 0412: constraint trigger §5f · v_rest ของ start §6② — ไม่มีคอลัมน์ใหม่)
   ⭐ งวดที่โผล่ทีหลัง (ปรับแผนแบ่ง/เพิ่มงวด · ยกเงินเข้า) ฐานนับให้ตอน COMMIT (via count_rest · ส่วนแบ่งตามกติกาเดิม — ปกติ 0) ·
     Rev. ที่อนุมัติแบบรายงวด ขั้นนับตอนอนุมัติ (start) นับทุกงวดที่ค้าง ⇒ ใบนี้ไม่มีการยื่นทีละงวดอีก · บัญชีรับรองเงินได้ทันที
   ⭐ งวดที่ยังไม่นับบนใบแบบนี้ที่จอเห็นได้ = ขั้นนับตอนอนุมัติ Rev. ยังค้าง (ล้ม/ยังไม่รัน) เท่านั้น ⇒ ทางคือ AE Sup กด "นับงวดที่ค้าง"
     (installmentActualStartPending ครอบทุกงวดที่ค้าง) — ไม่ใช่ "รอฝ่ายขายยื่น" · review รอบสามเคยบอกให้กด "นับที่เหลือทั้งหมด" ซ้ำ
     (ก่อนมติข้อ 10 งวดพวกนี้ยังเดินรายงวด) */
export function installmentActualCountRestDone(rows = []) {
  return (Array.isArray(rows) ? rows : []).some((r) => r?.actualStatus === 'approved' && r?.actualApprovedVia === 'count_rest');
}
/* "actualNote" ของงวดที่ฐานนับให้เอง — **ตรงกับ SQL ทุกตัวอักษร** (§5f + §6② ของ 0412 · ยาม soInstallmentActualMigration.test) */
export const INSTALLMENT_ACTUAL_AUTO_NOTE = 'นับอัตโนมัติ — ใบนี้กด “นับที่เหลือทั้งหมด” แล้ว (มติข้อ 10)';
/** งวดที่ฐานนับให้เอง (มติข้อ 10) — ป้ายบนแผงงวดแยกจาก "นับที่เหลือทั้งหมด" ที่ AE Sup กดเอง */
export function installmentActualAutoCounted(row) {
  return row?.actualStatus === 'approved' && row?.actualApprovedVia === 'count_rest'
    && String(row?.actualNote ?? '').trim() === INSTALLMENT_ACTUAL_AUTO_NOTE;
}
/**
 * งวดนับผ่านทาง `so_approval` แต่ลงเวลา **หลัง** เวลาอนุมัติใบ = ปุ่มกู้ "นับงวด 1"/"นับงวดที่ค้าง" (review รอบหก 27/10)
 * ⭐ คลิกอนุมัติใบ: route ส่งเวลาอนุมัติให้ RPC (p_counted_at) ⇒ `actualApprovedAt` = `approvedAt` ของใบพอดี · Rev. ที่รับงวดนับแล้วมา =
 *   เวลาเก่ากว่า · ยกเงิน C2b ลอกเวลาของงวดที่ถูกแทน ⇒ "หลัง" เกิดได้ทางเดียวคือปุ่มกู้ (RPC ลงเวลาที่กด — มติข้อ 1)
 * ⚠️ ไม่รู้เวลาใดเวลาหนึ่ง = false (โมดัลรับรองคงคำ "ตอนอนุมัติใบ" เดิม)
 */
export function installmentActualCountedLate(row, orderApprovedAt) {
  if (row?.actualStatus !== 'approved' || row?.actualApprovedVia !== 'so_approval') return false;
  const counted = Date.parse(row?.actualApprovedAt || '');
  const approved = Date.parse(orderApprovedAt || '');
  return Number.isFinite(counted) && Number.isFinite(approved) && counted > approved;
}
export const INSTALLMENT_ACTUAL_AFTER_COUNT_REST = 'ใบนี้กด “นับที่เหลือทั้งหมด” แล้ว — งวดที่ยังไม่นับระบบนับ Actual ให้เอง ไม่ต้องยื่น (มติข้อ 10)'
  + ' แต่งวดนี้ยังค้าง: ให้ AE Sup กด ‘นับงวดที่ค้าง’ ที่การ์ดการชำระ';

/**
 * งวดก่อนหน้าตัวแรก (เลขน้อยสุด) ที่ **ยังไม่รับรองเงิน** — `{ seq, status, counted, actualStatus }` หรือ null (ก่อนหน้ารับรองครบ = ยื่น/อนุมัติงวดนี้ได้)
 * ⭐ ด่านเดียวกับ installmentPreviousConfirmed (มติข้อ 2 · RPC ตีกลับ previous_unconfirmed) แต่บอก **งวดไหน** และค้างที่ใคร
 *   · `status` = สถานะเงินของงวดนั้น (reported = รอบัญชีรับรอง · pending/rejected = รอฝ่ายขายแจ้งสลิป)
 *   · `counted` = งวดนั้นนับ Actual แล้วหรือยัง (ยัง + reported = บัญชีรับรองงวดนั้นก็ยังไม่ได้ — ต้องนับก่อน ·
 *     ยัง + pending/rejected = ฝ่ายขายแจ้งสลิปงวดนั้นก็ยังไม่ได้ — ด่าน REPORT_BLOCKED: ต้องยื่นขอนับและ AE Sup อนุมัติก่อน)
 *   · `actualStatus` = สถานะการนับของงวดนั้น (submitted = ยื่นแล้ว รอ AE Sup) — แยกคำของ `prev_submit` (review รอบหก 27/10)
 * 🐞 UAT FN 27/10 ข้อ 3: งวด n-1 นับแล้วแต่บัญชี "ถอนคำรับรอง" (กลับเป็นรอตรวจ) แล้วงวด n ยื่นค้าง — บัญชีเห็นงวด n "รอ AE Sup อนุมัติ"
 *   ขณะที่ด่านอนุมัติของ AE Sup ตอบ previous_unconfirmed ⇒ สองฝ่ายชี้กันไปมา · ก้าวถัดไปจริงคือบัญชีรับรองงวด n-1 เอง
 */
export function installmentActualPreviousOpen(row, rows = []) {
  const seq = Number(row?.seq) || 0;
  const prev = sortedRows(rows).find((r) => r !== row && (row?.id == null || r.id !== row.id)
    && (Number(r.seq) || 0) < seq && r.status !== 'confirmed');
  return prev ? {
    seq: Number(prev.seq) || 0, status: prev.status || 'pending', counted: isCounted(prev), actualStatus: prev.actualStatus || null,
  } : null;
}

/**
 * ใครต้องทำอะไรต่อ ก่อนบัญชีรับรองเงินงวดที่ติดด่านนับ Actual รายงวด — `{ kind, seq }` (ผู้เรียกตัดสินว่า "ติดด่าน" เองก่อน)
 * ⭐ ตัวเดียวของทั้งคำยาว (installmentActualLockReason — แผงงวด · โมดัลรับรอง · ทะเบียน) คำสั้น (installmentActualLockShort —
 *   ช่องสถานะ · รายการใบในแถบทะเบียน) และการแยกกลุ่มของแถบ "ยังรับรองไม่ได้" บนทะเบียน ⇒ สามที่พูดเรื่องเดียวกันเสมอ
 *   · `revoked`      ใบย้อนอนุมัติ — ทางเดียวคือเจ้าของดีลออก Rev.
 *   · `count_rest`   ใบกด "นับที่เหลือทั้งหมด" แล้วแต่งวดนี้ค้าง — AE Sup กด "นับงวดที่ค้าง" (มติข้อ 10)
 *   · `prev_confirm` งวดก่อนหน้า (seq) แจ้งชำระและนับแล้ว รอบัญชีรับรอง — **งานของบัญชีเอง** ก่อน AE Sup อนุมัติ/ฝ่ายขายยื่นงวดนี้ได้
 *   · `prev_count`   งวดก่อนหน้า (seq) แจ้งชำระแล้วแต่ยังไม่นับ Actual — งวดนั้นต้องนับและรับรองก่อน
 *   · `prev_payment` งวดก่อนหน้า (seq) **นับแล้ว** แต่ยังไม่แจ้งชำระ/ถูกตีกลับ — ฝ่ายขายแจ้งสลิปงวดนั้นแล้วบัญชีรับรองก่อน
 *   · `prev_submit`  งวดก่อนหน้า (seq) **ยังไม่นับ** และยังไม่แจ้งชำระ/ถูกตีกลับ — แจ้งสลิปงวดนั้นติดด่าน (REPORT_BLOCKED) ⇒ ก้าวแรกคือ
 *                    ฝ่ายขายยื่นขอนับงวดนั้น (ยื่นแล้ว = AE Sup อนุมัติ · `prevSubmitted`) แล้วจึงแจ้งสลิปและบัญชีรับรอง
 *                    🐞 review รอบหก 27/10: เดิมตกเป็น prev_payment "ฝ่ายขายแจ้งสลิปงวด k" — ทางที่กดไม่ได้ (งวดที่รับเงินก่อนอนุมัติ
 *                       ข้ามงวดก่อน = งวดถัดไป 'reported' ยังไม่นับ ขณะที่งวดก่อน pending/rejected ยังไม่นับ)
 *   · `submitted`    ยื่นแล้ว งวดก่อนหน้ารับรองครบ — AE Sup อนุมัติ
 *   · `rejected`     AE Sup ตีกลับคำขอนับ — ฝ่ายขายยื่นใหม่
 *   · `unsubmitted`  ยังไม่ยื่น — ฝ่ายขายยื่น
 * ⚠️ ลำดับ: ย้อนอนุมัติ → (ยื่นแล้วไม่ดู count_rest — คำเดิม) นับที่เหลือทั้งหมดแล้ว (start นับทุกงวดที่ค้างไม่ดูงวดก่อนหน้า) →
 *   งวดก่อนหน้ายังไม่รับรอง (ยื่น/อนุมัติงวดนี้ติด previous_unconfirmed ทั้งคู่) → สถานะการนับของงวดเอง
 * @param options `rows` = งวดทั้งใบ (แผงงวด) หรือ `previous` = ผลของ installmentActualPreviousOpen ที่คิดมาแล้ว
 *   (แถวทะเบียนพก `actualPreviousOpen` · `actualCountRestDone` ที่ประทับจากชุดก่อนกรอง — `stampActualHold`) · ไม่ส่งทั้งคู่ = อ่านจากแถว
 */
export function installmentActualHold(row, order = null, {
  countRestDone = Boolean(row?.actualCountRestDone), rows = null, previous,
} = {}) {
  if ((order?.status ?? row?.orderStatus) === 'approval_revoked') return { kind: 'revoked', seq: null };
  const status = row?.actualStatus || null;
  if (countRestDone && status !== 'submitted') return { kind: 'count_rest', seq: null };
  const prev = previous !== undefined ? previous
    : Array.isArray(rows) ? installmentActualPreviousOpen(row, rows) : (row?.actualPreviousOpen ?? null);
  if (prev && prev.seq) {
    const kind = prev.status === 'reported'
      ? (prev.counted ? 'prev_confirm' : 'prev_count')
      : (prev.counted ? 'prev_payment' : 'prev_submit');
    return kind === 'prev_submit'
      ? { kind, seq: prev.seq, submitted: status === 'submitted', prevSubmitted: prev.actualStatus === 'submitted' }
      : { kind, seq: prev.seq, submitted: status === 'submitted' };
  }
  if (status === 'submitted') return { kind: 'submitted', seq: null };
  if (status === 'rejected') return { kind: 'rejected', seq: null };
  return { kind: 'unsubmitted', seq: null };
}

/* ท่อนท้ายของเหตุ "งวดก่อนหน้า" — งวดนี้ยื่นแล้วรอแค่ AE Sup อนุมัติ · ยังไม่ยื่น = ฝ่ายขายยื่นแล้ว AE Sup อนุมัติ */
const afterPrevious = (hold) => (hold.submitted ? 'AE Sup จึงอนุมัติงวดนี้ได้' : 'ฝ่ายขายจึงยื่นขอนับงวดนี้ได้ แล้ว AE Sup อนุมัติ');
/* ก้าวแรกของเหตุ "งวดก่อนหน้า" — ใครต้องทำอะไรกับงวดนั้น (ใช้ทั้งคำของบัญชีและคำของ AE Sup) */
const previousStep = (hold) => (hold.kind === 'prev_confirm' ? `บัญชีรับรองเงินงวด ${hold.seq} ก่อน`
  : hold.kind === 'prev_count' ? `งวด ${hold.seq} ต้องนับ Actual และบัญชีรับรองเงินก่อน`
    /* งวดก่อนหน้ายังไม่นับ = แจ้งสลิปงวดนั้นติดด่าน ⇒ ก้าวแรกคือยื่น/อนุมัตินับงวดนั้น (review รอบหก 27/10) */
    : hold.kind === 'prev_submit'
      ? (hold.prevSubmitted
        ? `AE Sup อนุมัตินับงวด ${hold.seq} แล้วฝ่ายขายแจ้งสลิปและบัญชีรับรองก่อน`
        : `ฝ่ายขายยื่นขอนับงวด ${hold.seq} → AE Sup อนุมัติ → ฝ่ายขายแจ้งสลิป และบัญชีรับรองก่อน`)
      : `ฝ่ายขายแจ้งสลิปงวด ${hold.seq} และบัญชีรับรองก่อน`);

/* เหตุยาว (บัญชีอ่าน · ลงท้าย "บัญชีจึงรับรองเงิน…ได้") จากผลของ installmentActualHold */
export function installmentActualHoldText(hold) {
  switch (hold?.kind) {
    case 'revoked': return INSTALLMENT_ACTUAL_REVOKED_LOCK;
    case 'count_rest': return `${INSTALLMENT_ACTUAL_AFTER_COUNT_REST} บัญชีจึงรับรองเงินได้`;
    case 'prev_confirm':
    case 'prev_count':
    case 'prev_payment':
    case 'prev_submit':
      return `งวด ${hold.seq} ยังไม่ได้รับรองเงิน — ${previousStep(hold)} ${afterPrevious(hold)} บัญชีจึงรับรองเงินงวดนี้ได้`;
    case 'submitted': return INSTALLMENT_ACTUAL_CONFIRM_BLOCKED;
    case 'rejected': return 'AE Sup ตีกลับคำขอนับงวดนี้ — รอฝ่ายขายยื่นขอนับใหม่และ AE Sup อนุมัติก่อน บัญชีจึงรับรองเงินได้';
    default: return 'งวดนี้ยังไม่ได้ยื่นขอนับ Actual — รอฝ่ายขายยื่นขอนับงวดนี้ แล้ว AE Sup อนุมัติก่อน บัญชีจึงรับรองเงินได้';
  }
}

/* เหตุสั้น (ช่องสถานะที่ตรึงขวาของตารางงวด · รายการใบในแถบทะเบียน) — ประโยคเต็มอยู่ที่ title/ปุ่ม (UAT FN 27/10 ข้อ 6:
   เหตุยาวในช่องกว้าง ~133px ตัดเป็นแถวสูงหกบรรทัด) · บอกคนที่ต้องทำต่อเสมอ */
export function installmentActualHoldShort(hold) {
  switch (hold?.kind) {
    case 'revoked': return 'รอเจ้าของดีลออก Rev.';
    case 'count_rest': return `รอ AE Sup กด “${INSTALLMENT_ACTUAL_START_LEFT_LABEL}”`;
    case 'prev_confirm': return `รอบัญชีรับรองงวด ${hold.seq} ก่อน`;
    case 'prev_count': return `รองวด ${hold.seq} นับและรับรองก่อน`;
    case 'prev_payment': return `รองวด ${hold.seq} ชำระและรับรองก่อน`;
    case 'prev_submit': return hold.prevSubmitted ? `รอ AE Sup อนุมัติงวด ${hold.seq} ก่อน` : `รองวด ${hold.seq} ยื่นขอนับก่อน`;
    case 'submitted': return 'รอ AE Sup อนุมัตินับงวดนี้';
    case 'rejected': return 'รอฝ่ายขายยื่นขอนับใหม่';
    default: return 'รอฝ่ายขายยื่นขอนับงวดนี้';
  }
}

export function installmentActualLockReason(row, order = null, options = {}) {
  return installmentActualHoldText(installmentActualHold(row, order, options));
}
export function installmentActualLockShort(row, order = null, options = {}) {
  return installmentActualHoldShort(installmentActualHold(row, order, options));
}

/* เหตุที่ **ผู้อนุมัติ** อนุมัติงวดที่ยื่นแล้วไม่ได้เพราะงวดก่อนหน้ายังไม่รับรองเงิน (RPC previous_unconfirmed) — บอกงวดและคนที่ต้องทำต่อ
   (ปกติคือบัญชีรับรองงวดก่อนเอง — ถอนคำรับรองหลังยื่น) · `{ text, short }` · หางวดไม่เจอ = ข้อความของรหัสฐาน */
export function installmentActualApproveWait(row, rows = []) {
  const hold = installmentActualHold({ ...row, actualStatus: 'submitted' }, null, { countRestDone: false, rows });
  if (!hold.seq) return { text: INSTALLMENT_ACTUAL_PREVIOUS_UNCONFIRMED, short: 'รองวดก่อนรับรองเงิน' };
  return {
    text: `งวด ${hold.seq} ยังไม่ได้รับรองเงิน — ${previousStep(hold)} จึงอนุมัติงวดนี้ได้`,
    short: installmentActualHoldShort(hold),
  };
}

/* งวดก่อนหน้ายังไม่รับรองเงิน — ข้อความเดียวกับรหัสของฐาน (ใช้ทั้งยื่นและอนุมัติงวด) · แผงงวดเทียบกับค่านี้เพื่อโชว์ปุ่มอนุมัติที่ดับ */
export const INSTALLMENT_ACTUAL_PREVIOUS_UNCONFIRMED = workflowErrorMessage('installment_actual_previous_unconfirmed');
/* ผู้อนุมัติเปิดงวดที่ตัวเองยื่น (RPC self_approval) — แผงโชว์ปุ่มอนุมัติที่ดับ + เหตุนี้ (review รอบสาม 26/10 · เดิมไม่มีปุ่มและไม่มีเหตุ) */
export const INSTALLMENT_ACTUAL_SELF_APPROVAL = workflowErrorMessage('installment_actual_self_approval');
/* งวดของใบยังไม่ตรึงครบ (ตัวหยุดยอดล้มตอนอนุมัติ) — ยื่น/อนุมัตินับงวดไม่ได้จน AE Sup กดปุ่มกู้ (route ตรึงงวดแล้วนับ) · ข้อความเดียวกับรหัสของฐาน */
export const INSTALLMENT_ACTUAL_UNFROZEN = workflowErrorMessage('installment_actual_unfrozen');
/* คำสั้นของสองเหตุข้างบนในช่องสถานะที่ตรึงขวา (ประโยคเต็มอยู่ที่ปุ่ม · UAT FN 27/10 ข้อ 6) */
export const INSTALLMENT_ACTUAL_UNFROZEN_SHORT = ACTUAL_STATE_LABELS.unfrozen;
export const INSTALLMENT_ACTUAL_SELF_APPROVAL_SHORT = 'ให้ผู้อนุมัติคนอื่นกด';

/**
 * ใบนี้มีงวดที่ยังไม่ตรึง (`frozenAt` ว่าง) ไหม — review รอบสี่ 26/10
 * 🐞 รอบสามกันแค่ทางกู้ "นับงวด 1" (route ตรึงก่อนนับ) — ยื่น/อนุมัติงวด/นับที่เหลือทั้งหมดยังนับงวดที่ไม่ตรึงได้ ⇒ งวดนับแล้วแต่แจ้งสลิปได้แค่
 *   'pending' · บัญชีรับรองไม่ได้ (CHECK draft_pending) · งวดถัดไปยื่นไม่ได้ตลอดไป · ปุ่มกู้หายเพราะไม่มีงวดค้างให้นับ
 *   ⇒ ด่านยื่น/อนุมัติ (installmentActualActionError + RPC) ตอบ installment_actual_unfrozen · ปุ่มกู้โชว์ตราบที่มีงวดไม่ตรึง
 * ⚠️ แถวที่ **ไม่พกคอลัมน์** `frozenAt` (คิวรีที่เลือกคอลัมน์เอง) = ถือว่าตรึงแล้ว — ไม่เดาว่าติด · ฐานกันอีกชั้น (RPC ตอบรหัสเดียวกัน)
 */
export function installmentActualUnfrozen(rows = []) {
  return (Array.isArray(rows) ? rows : []).some((r) => r && Object.prototype.hasOwnProperty.call(r, 'frozenAt') && !r.frozenAt);
}

/* เหตุที่ **ฝ่ายขายที่ไม่ใช่คนยื่น** (AC · AE อื่น · Senior AE · AC Sup — มี salesplan:edit แต่ยื่นขอนับไม่ได้) แจ้งสลิปงวดนี้ยังไม่ได้
   (review รอบสาม 26/10 · กติกาการโชว์ UI: ติดด่าน = โชว์แล้วบอกเหตุ) — เดิมปุ่ม "แจ้งลูกค้าจ่ายแล้ว" หายเฉย ๆ ทั้งที่ใบทั้งใบแจ้งได้
   ⭐ บอกคนที่ต้องทำต่อ: ยื่นแล้ว = รอ AE Sup · ยังไม่ยื่น/ตีกลับ = รอเจ้าของดีลยื่น แล้ว AE Sup อนุมัติ
   ⚠️ คำของบัญชี (installmentActualLockReason) ลงท้าย "บัญชีจึงรับรองเงินได้" — คนละคนอ่าน จึงแยกตัว */
export function installmentActualReportWaitReason(row, ownerName = '', { countRestDone = false } = {}) {
  if (row?.actualStatus === 'submitted') return 'รอ AE Sup อนุมัตินับ Actual งวดนี้ก่อน จึงแจ้งสลิปได้';
  if (countRestDone) return `${INSTALLMENT_ACTUAL_AFTER_COUNT_REST} จึงแจ้งสลิปได้`;
  /* ชื่อในวงเล็บต้องมีวรรคก่อนคำไทยที่ตามมา (UAT 27/10 ข้อ 2 — เดิม "เจ้าของดีล (ชื่อ)ยื่นขอนับ") */
  const who = text(ownerName) ? `เจ้าของดีล (${text(ownerName)}) ` : 'เจ้าของดีล';
  return `ใบนี้นับ Actual รายงวด — รอ${who}ยื่นขอนับงวดนี้ และ AE Sup อนุมัติก่อน จึงแจ้งสลิปได้`;
}
/* คำสั้นของ installmentActualReportWaitReason (ช่องสถานะที่ตรึงขวา — ประโยคเต็มอยู่ที่ปุ่ม · UAT FN 27/10 ข้อ 6) */
export function installmentActualReportWaitShort(row, { countRestDone = false } = {}) {
  if (row?.actualStatus === 'submitted') return 'รอ AE Sup อนุมัตินับงวดนี้';
  if (countRestDone) return `รอ AE Sup กด “${INSTALLMENT_ACTUAL_START_LEFT_LABEL}”`;
  return 'รอเจ้าของดีลยื่นขอนับงวดนี้';
}

const msg = (code) => workflowErrorMessage(code);
const text = (v) => String(v ?? '').trim();
/* ยอดในฐานเป็น numeric ทศนิยมไม่เกิน 2 ตำแหน่ง ⇒ ×100 แล้วปัดได้จำนวนเต็มสตางค์พอดี (ไม่มีเศษ float หลงเหลือ) */
const toCents = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const fromCents = (c) => c / 100;
const nonNegative = (v) => Math.max(0, Number(v) || 0);
const bySeq = (a, b) => (Number(a?.seq) || 0) - (Number(b?.seq) || 0);
const sortedRows = (rows) => (Array.isArray(rows) ? rows : []).filter(Boolean).sort(bySeq);
const isCounted = (row) => row?.actualStatus === 'approved';

export const isActualMode = (value) => ACTUAL_MODES.includes(value);

/* ใบนี้นับ Actual รายงวดไหม — อ่านจาก `actualMode` ล้วน **ไม่ดูสถานะใบ** · ใบย้อนหลังไม่มีวันเป็นรายงวด (RPC ห่ออนุมัติบังคับ
   pipeline) ⇒ ตัดไว้อีกชั้น · ด่านรับรองเงิน (trigger ของ 0412 · installmentActualPaymentGated) ยกเว้นใบที่ยกเลิกเพิ่มอีกข้อ
   ⚠️ ฐานคืนค่าเป็น 'order' เองเมื่อใบกลับเป็นร่าง/รออนุมัติ/ตีกลับ — ค่าที่ค้างบนใบที่ย้อนอนุมัติ/ยกเลิกยังเป็นรายงวด */
export function isInstallmentActualOrder(order) {
  return order?.actualMode === ACTUAL_MODE_INSTALLMENT && !isHistoricalOrder(order);
}

export function actualModeOf(order) {
  return isInstallmentActualOrder(order) ? ACTUAL_MODE_INSTALLMENT : ACTUAL_MODE_ORDER;
}

/* ใบรายงวดที่ยังเดินอยู่ — ที่เดียวที่ยื่น/อนุมัติ/ตีกลับงวดได้ (ร่วมของ RPC: pipeline + approved + installment + ไม่ถูกแทน) */
function liveInstallmentOrder(order) {
  return isInstallmentActualOrder(order) && order?.status === 'approved' && !order?.supersededById;
}

/**
 * เลือก "Actual รายงวด" ได้ไหม (ตัวเลือกในโมดัลอนุมัติ) — `{ eligible, reason }`
 * ⭐ ใบ pipeline เท่านั้น (ใบย้อนหลังไม่นับ Actual) · ยอดใบ > 0 (ใบยอด 0 ไม่มีงวด — นับรายงวดไม่มีวันจบ) · อย่างน้อย 2 งวด
 * ⚠️ RPC ห่ออนุมัติเช็คซ้ำแค่ pipeline + ยอด > 0 (งวดเกิดหลังอนุมัติ — freezeInstallments) ⇒ จำนวนงวดตัดสินที่นี่
 *   ผู้เรียกนับจากงวดที่มีอยู่ (แถวที่ยกมากับใบ Rev.) หรือจากแผนของ QT (`installmentsFromPaymentPlan`)
 * @param installmentCount จำนวนงวด — ส่งอาร์เรย์ของงวดมาก็ได้ (นับความยาว)
 */
export function actualModeEligibility(order, installmentCount) {
  if (!order) return { eligible: false, reason: 'ไม่พบใบสั่งขาย' };
  if (isHistoricalOrder(order)) {
    return { eligible: false, reason: 'ใบสั่งขายย้อนหลังไม่นับ Actual — ไม่มีตัวเลือกรายงวด' };
  }
  if (!(toCents(order.totalAmount) > 0)) {
    return { eligible: false, reason: 'ใบนี้ยอดรวม 0 บาท ไม่มีงวดชำระ — นับ Actual ได้ทั้งใบเท่านั้น' };
  }
  const count = Array.isArray(installmentCount)
    ? installmentCount.filter(Boolean).length
    : Math.trunc(Number(installmentCount) || 0);
  if (count < MIN_INSTALLMENT_ACTUAL_ROWS) {
    return { eligible: false, reason: 'ใบนี้มีงวดชำระงวดเดียว — นับ Actual ได้ทั้งใบเท่านั้น (นับรายงวดได้ผลเท่ากัน)' };
  }
  return { eligible: true, reason: null };
}

/* ── ยอด Actual ที่นับแล้วของแถวใบ (ตัวเดียวกับ cache บนดีล — sync_sales_order_actual ของ 0412) ─────────────────
   ⭐ ใบทั้งใบ = `actualAmount` เต็ม · ใบรายงวด = `actualCountedAmount` (cache ที่ trigger ของงวดดูแล)
   ⛔ ใบย้อนหลัง/ใบที่ไม่ใช่ approved = 0 (origin = 'pipeline' + status = 'approved' ของ SQL) */
export function salesOrderCountedActual(order) {
  if (!order || isHistoricalOrder(order) || order.status !== 'approved') return 0;
  return isInstallmentActualOrder(order)
    ? nonNegative(order.actualCountedAmount)
    : nonNegative(order.actualAmount);
}

/* ยอดประมาณของงวดที่ **ยื่นแล้วรอ AE Sup** (cache `actualSubmittedAmount`) — กอง "รออนุมัติ" ของใบรายงวดที่อนุมัติแล้ว */
export function salesOrderSubmittedActual(order) {
  if (!order || isHistoricalOrder(order) || order.status !== 'approved' || !isInstallmentActualOrder(order)) return 0;
  return nonNegative(order.actualSubmittedAmount);
}

/* ยอดของงวดที่ **ยังไม่ยื่น/ถูกตีกลับ** — กองใหม่ "รอนับรายงวด" (คีย์ `instRemaining` · มติข้อ 5)
   = actualAmount − นับแล้ว − ยื่นแล้ว (ประมาณสามกองรวมกันเท่า actualAmount พอดี — ดู installmentActualShares) */
export function salesOrderRemainingActual(order) {
  if (!order || isHistoricalOrder(order) || order.status !== 'approved' || !isInstallmentActualOrder(order)) return 0;
  const left = toCents(order.actualAmount) - toCents(order.actualCountedAmount) - toCents(order.actualSubmittedAmount);
  return fromCents(Math.max(0, left));
}

/* จำนวนงวดที่ยื่นแล้วรอ AE Sup ของแถวใบ — แถวใบไม่มีคอลัมน์นับ ⇒ ใช้งวดที่ผู้เรียกแนบมา (`order.installments`)
   หรือ `order.actualSubmittedCount` ถ้า API คิดมาให้ · ไม่มีทั้งสอง = มียอดยื่นอยู่ถือเป็น 1 งวด
   (ยื่นงวดถัดไปได้หลังบัญชีรับรองงวดก่อน ซึ่งต้องอนุมัติก่อน ⇒ ปกติใบหนึ่งมีงวดรออนุมัติได้ทีละงวด) */
export function salesOrderSubmittedCount(order) {
  if (!order || isHistoricalOrder(order) || order.status !== 'approved' || !isInstallmentActualOrder(order)) return 0;
  if (Array.isArray(order.installments)) {
    return order.installments.filter((r) => r?.actualStatus === 'submitted').length;
  }
  const given = Number(order.actualSubmittedCount);
  if (Number.isFinite(given) && given >= 0) return Math.trunc(given);
  return toCents(order.actualSubmittedAmount) > 0 ? 1 : 0;
}

/* ── ส่วนแบ่งก่อน VAT (คู่กับ SQL ของ 0412 ทุกสตางค์) ──────────────────────────────────────────────────────────
   `order.actualAmount` = ก่อน VAT · `row.amount` = รวม VAT ⇒ ส่วนแบ่งของงวด = round(amount × actualAmount / totalAmount, 2)
   ⭐ ปัดครึ่งขึ้นที่สตางค์ด้วยเลขจำนวนเต็ม (BigInt) — `round(numeric, 2)` ของ Postgres ไม่มีเศษ float
     🪤 Math.round(x * 100) / 100 ปัด 1.005 เป็น 1.00 ขณะที่ฐานได้ 1.01 ⇒ จอกับแดชบอร์ดต่างกันหนึ่งสตางค์ */
function proRataCents(amountCents, actualCents, totalCents) {
  if (!(totalCents > 0) || !(amountCents > 0) || !(actualCents > 0)) return 0;
  const num = BigInt(amountCents) * BigInt(actualCents);
  const den = BigInt(totalCents);
  const quotient = num / den;
  return Number(BigInt(2) * (num % den) >= den ? quotient + BigInt(1) : quotient);
}

function countedCentsOf(rows) {
  return rows.filter(isCounted).reduce((sum, r) => sum + Math.max(0, toCents(r.actualAmount)), 0);
}

/**
 * ส่วนแบ่ง Actual ของทุกงวด — `[{ id, seq, amount, counted, actualStatus }]` เรียงตามเลขงวด
 * ⭐ งวดที่อนุมัติแล้ว (`actualStatus = 'approved'`) = `row.actualAmount` ที่ตรึงตอนอนุมัติงวด
 * ⭐ งวดที่ยังไม่นับ (ยื่นแล้ว/ยังไม่ยื่น/ตีกลับ) = ยอดประมาณ ตามลำดับงวด:
 *   คงเหลือ = actualAmount − Σ งวดที่นับแล้ว · งวดละ min(round(amount × actualAmount / totalAmount, 2), คงเหลือ) ·
 *   งวดท้ายที่ยังไม่นับรับคงเหลือทั้งหมด ⇒ นับแล้ว + ยื่นแล้ว + ยังไม่ยื่น = actualAmount พอดี (ไม่ติดลบ)
 * ⚠️ ไม่ดูแบบการนับของใบ — ผู้เรียกตัดสินเองว่าจะแสดงไหม (ใบทั้งใบไม่มีงวดที่ approved)
 */
export function installmentActualShares(order, rows = []) {
  const list = sortedRows(rows);
  const actualCents = Math.max(0, toCents(order?.actualAmount));
  const totalCents = toCents(order?.totalAmount);
  let leftCents = Math.max(0, actualCents - countedCentsOf(list));
  const open = list.filter((r) => !isCounted(r));
  const lastOpen = open[open.length - 1] || null;
  const estimates = new Map();
  for (const row of open) {
    const cents = row === lastOpen
      ? leftCents
      : Math.min(proRataCents(toCents(row.amount), actualCents, totalCents), leftCents);
    estimates.set(row, cents);
    leftCents -= cents;
  }
  return list.map((row) => ({
    id: row.id ?? null,
    seq: Number(row.seq) || 0,
    amount: fromCents(isCounted(row) ? Math.max(0, toCents(row.actualAmount)) : estimates.get(row)),
    counted: isCounted(row),
    actualStatus: row.actualStatus ?? null,
  }));
}

/**
 * ส่วนแบ่งที่ **ตรึงตอนอนุมัติงวดนี้** (RPC approve / start / count_rest) — คืนยอด หรือ null (ไม่พบ/นับไปแล้ว)
 * ⭐ งวดนี้เป็นงวดเดียวที่ยังไม่นับ = actualAmount − Σ นับแล้ว · ไม่งั้น = min(round(...), คงเหลือ)
 *   ⇒ นับครบทุกงวด Σ = actualAmount พอดี · อนุมัติเรียงตามลำดับงวด = ยอดเท่ากับยอดประมาณที่โชว์ก่อนกด
 * ⚠️ "งวดเดียวที่ยังไม่นับ" ไม่ใช่ "เลขงวดสูงสุดที่ยังไม่นับ" — นับงวดท้ายก่อน (งวด 0 บาท/รับรองเงินแล้ว ตอนเริ่ม)
 *   ต้องไม่กวาดเศษของงวดกลางที่ยังไม่นับไปด้วย
 * @param target แถวงวด หรือ id ของงวด
 */
export function installmentActualShareAtApproval(order, rows, target) {
  const list = sortedRows(rows);
  const id = typeof target === 'object' && target ? target.id : target;
  const row = list.find((r) => r === target || (id != null && r.id === id));
  if (!row || isCounted(row)) return null;
  const actualCents = Math.max(0, toCents(order?.actualAmount));
  const leftCents = Math.max(0, actualCents - countedCentsOf(list));
  const open = list.filter((r) => !isCounted(r));
  if (open.length === 1) return fromCents(leftCents);
  return fromCents(Math.min(proRataCents(toCents(row.amount), actualCents, toCents(order?.totalAmount)), leftCents));
}

/* ── งวดที่นับให้เองตอนคลิกอนุมัติใบ (RPC start_sales_order_installment_actual · มติข้อ 3) ─────────────────────
   งวดเลขน้อยสุด + งวดยอด 0 บาท + งวดที่บัญชีรับรองเงินแล้ว (Rev. จากใบทั้งใบ) ที่ยังไม่นับ · ใบน้อยกว่า 2 งวด = ทุกงวด
   ⭐ มติข้อ 10: ใบที่เคยกด "นับที่เหลือทั้งหมด" (Rev. ที่งวด via count_rest ติดมา) = **ทุกงวด** ที่ยังไม่นับ (v_rest ของ RPC)
   ⭐ รันซ้ำได้ — งวดที่นับแล้วข้าม (เป็นทางกู้ "นับงวด 1" ถ้าขั้นนี้ล้มหลังอนุมัติ) */
export function installmentActualStartRows(rows = []) {
  const list = sortedRows(rows);
  if (list.length < MIN_INSTALLMENT_ACTUAL_ROWS || installmentActualCountRestDone(list)) return list.filter((r) => !isCounted(r));
  const first = list[0];
  return list.filter((r) => !isCounted(r)
    && (r === first || toCents(r.amount) === 0 || r.status === 'confirmed'));
}

/* งวดที่ "ยกเงินจากใบที่ยกเลิก" เข้ามา (รายการล่าสุดของ movedFrom = carry) — ต้องยื่น-อนุมัติในใบนี้อีกรอบ (0412 C1)
   ⇒ ไม่ใช่งานค้างของขั้นนับตอนอนุมัติ แม้ RPC start จะนับให้ถ้ากด (งวดที่รับรองเงินแล้ว) */
function carriedIn(row) {
  const moved = Array.isArray(row?.movedFrom) ? row.movedFrom : [];
  const last = moved[moved.length - 1];
  return Boolean(last && typeof last === 'object' && last.reason === 'carry');
}

/**
 * งวดที่ **ขั้นนับตอนอนุมัติใบยังค้าง** — ปุ่มกู้บนการ์ดการชำระ + route ตัดสินว่าขั้นนั้นล้มจริงไหม (review รอบสอง 26/10)
 * ⭐ = installmentActualStartRows ลบงวดที่ยกเงินเข้ามา · ว่าง = ขั้นนั้นไม่เหลืออะไรให้นับ (เช่นใบ Rev. ที่งวด 1 ยกมานับไว้แล้ว)
 *   🐞 เดิมปุ่มโชว์เมื่อ "ยังไม่มีงวดไหนนับ" ⇒ ใบ Rev. ที่งวดยกมานับแล้วแต่ขั้นนี้ throw: จอทัก "กด ‘นับงวด 1’" แต่ไม่มีปุ่ม
 * ⭐ มติข้อ 10: ใบที่เคยกด "นับที่เหลือทั้งหมด" = ทุกงวดที่ยังไม่นับ **รวมงวดที่ยกเงินเข้ามา** (ไม่มีการยื่นบนใบนี้แล้ว — start นับให้หมด)
 * ⭐ ป้ายปุ่ม: งวดเลขน้อยสุดยังค้าง = "นับงวด 1" · ไม่งั้น/ใบที่กดนับที่เหลือทั้งหมดแล้ว = "นับงวดที่ค้าง" (installmentActualStartButtonLabel)
 */
export function installmentActualStartPending(rows = []) {
  const start = installmentActualStartRows(rows);
  return installmentActualCountRestDone(rows) ? start : start.filter((r) => !carriedIn(r));
}

export const INSTALLMENT_ACTUAL_START_LABEL = 'นับงวด 1';
export const INSTALLMENT_ACTUAL_START_LEFT_LABEL = 'นับงวดที่ค้าง';
export function installmentActualStartButtonLabel(rows = []) {
  const first = sortedRows(rows)[0];
  return first && !installmentActualCountRestDone(rows) && installmentActualStartPending(rows).includes(first)
    ? INSTALLMENT_ACTUAL_START_LABEL
    : INSTALLMENT_ACTUAL_START_LEFT_LABEL;
}

/**
 * ภาพก่อนกดอนุมัติใบแบบรายงวด — งวดไหนนับทันทีเท่าไร `{ rows: [{ id, seq, amount }], amount }`
 * ⭐ จำลองการนับทีละงวดตามลำดับงวดด้วยกติกาเดียวกับ RPC (installmentActualShareAtApproval) — โมดัลอนุมัติบอกยอดที่จะเข้าเดือนนี้
 */
export function installmentActualStartPreview(order, rows = []) {
  let working = sortedRows(rows).map((r) => ({ ...r }));
  const picked = new Set(installmentActualStartRows(working).map((r) => r.seq));
  const out = [];
  for (const row of working) {
    if (!picked.has(row.seq) || isCounted(row)) continue;
    const share = installmentActualShareAtApproval(order, working, row) ?? 0;
    out.push({ id: row.id ?? null, seq: Number(row.seq) || 0, amount: share });
    working = working.map((r) => (r === row ? { ...r, actualStatus: 'approved', actualAmount: share } : r));
  }
  return { rows: out, amount: fromCents(out.reduce((sum, r) => sum + toCents(r.amount), 0)) };
}

/* ── เดือนของ Actual (เวลาไทยเสมอ — check:thaitime) ────────────────────────────────────────────────────────── */
function latestInstant(...values) {
  let best = null;
  let bestMs = -Infinity;
  for (const value of values) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms) && ms > bestMs) { best = value; bestMs = ms; }
  }
  return best;
}

/* เวลาที่นับ Actual ของงวด = GREATEST(row.actualApprovedAt, order.approvedAt) (NULL ไม่นับ — GREATEST ของ Postgres ข้าม NULL)
   ⭐ มติข้อ 7: Rev. อนุมัติ = งวดที่เคยนับก่อนย้อนอนุมัติกลับมาใน **เดือนที่ Rev. อนุมัติ** (เหมือนใบทั้งใบ) */
export function installmentActualInstant(row, order) {
  return latestInstant(row?.actualApprovedAt, order?.approvedAt);
}

/** 'YYYY-MM' เวลาไทยของเวลาที่นับ Actual ของงวด หรือ null */
export function installmentActualMonth(row, order) {
  const at = installmentActualInstant(row, order);
  return at ? businessMonthKey(at) : null;
}

/* เดือนของใบที่ไม่มีเวลาอนุมัติ — COALESCE(approvedAt, orderDate) ของ sync (orderDate เป็นวันในปฏิทิน ไม่ใช่จุดเวลา) */
function orderDateMonth(value) {
  const match = /^(\d{4}-\d{2})-\d{2}$/.exec(text(value));
  return match ? match[1] : null;
}

/**
 * เหตุการณ์ Actual ของใบ — `[{ month, amount, at, installmentId, seq }]` (รายงานยอดขายแตกแถวตามเดือนที่นับ)
 * ⭐ ใบทั้งใบ = เหตุการณ์เดียวที่ `approvedAt` ยอด `actualAmount` · ใบรายงวด = งวดละเหตุการณ์ (เฉพาะงวดที่อนุมัติแล้ว)
 * ⛔ ใบที่ไม่ใช่ approved / ใบย้อนหลัง = [] (ตรงกับ sync ที่กรอง status + origin)
 * ⚠️ ใบรายงวดต้องส่งงวดมาด้วย — ไม่ส่ง (null/undefined) = ถอยเป็นเหตุการณ์เดียว `actualCountedAmount` ที่เดือนอนุมัติใบ
 *   (ยอดรวมถูก เดือนอาจผิด) · ส่งอาร์เรย์ว่าง = ใบไม่มีงวด = []
 */
export function salesOrderActualEvents(order, rows) {
  if (!order || isHistoricalOrder(order) || order.status !== 'approved') return [];
  const orderAt = order.approvedAt || null;
  const orderMonth = orderAt ? businessMonthKey(orderAt) : orderDateMonth(order.orderDate);
  if (!isInstallmentActualOrder(order)) {
    return [{ month: orderMonth, amount: nonNegative(order.actualAmount), at: orderAt, installmentId: null, seq: null }];
  }
  if (!Array.isArray(rows)) {
    return [{ month: orderMonth, amount: nonNegative(order.actualCountedAmount), at: orderAt, installmentId: null, seq: null }];
  }
  return sortedRows(rows).filter(isCounted).map((row) => {
    const at = installmentActualInstant(row, order);
    return {
      month: at ? businessMonthKey(at) : orderMonth,
      amount: nonNegative(row.actualAmount),
      at,
      installmentId: row.id ?? null,
      seq: Number(row.seq) || 0,
    };
  });
}

/**
 * ยอด "รอนับรายงวด" ของใบตามเดือนครบกำหนด — `{ 'YYYY-MM' | 'none': ยอด }` (คู่กับ metadata.soInstRemainingByDue ของดีล)
 * ⭐ งวดที่ยังไม่ยื่น/ถูกตีกลับ · ยอดประมาณจาก installmentActualShares · ไม่มีวันครบกำหนด = 'none'
 * ⭐ ใบรายงวดที่อนุมัติแล้วแต่ **ยังไม่มีงวดสักแถว** (ตัวหยุดยอดล้มหลังอนุมัติ) = ยอดทั้งใบลง 'none' — ตรงกับ SQL
 *   (_deal_so_actual_extras) และ salesOrderRemainingActual ⇒ ยอดใบไม่หายจากทุกกองระหว่างรอกด "เริ่มติดตามการชำระ"
 * ⛔ ใบที่ไม่ใช่รายงวดที่อนุมัติอยู่ = {} · ผู้อ่านพับ 'none' กับเดือนที่ผ่านมาแล้วเข้าเดือนปัจจุบันเอง
 */
export function installmentRemainingByDue(order, rows = []) {
  if (!order || isHistoricalOrder(order) || order.status !== 'approved' || !isInstallmentActualOrder(order)) return {};
  const list = sortedRows(rows);
  if (!list.length) return toCents(order.actualAmount) > 0 ? { none: fromCents(toCents(order.actualAmount)) } : {};
  const shares = installmentActualShares(order, list); // เรียงตามเลขงวดชุดเดียวกับ list
  const out = {};
  list.forEach((row, index) => {
    if (isCounted(row) || row.actualStatus === 'submitted') return;
    const due = orderDateMonth(row.dueDate) || 'none';
    out[due] = fromCents(toCents(out[due] || 0) + toCents(shares[index].amount));
  });
  return out;
}

/* ── สถานะแสดงของงวด ────────────────────────────────────────────────────────────────────────────────────── */
/* งวดก่อนหน้า (เลขน้อยกว่า) รับรองเงินครบ — ด่าน "ยื่นงวดถัดไปได้หลังบัญชีรับรองงวดก่อน" (มติข้อ 2) และด่านอนุมัติงวด
   ⚠️ status = 'confirmed' ล้วน (งวดคืนเงินแล้วยังเป็น confirmed ในฐาน) — ตรงกับ RPC */
export function installmentPreviousConfirmed(row, rows = []) {
  const seq = Number(row?.seq) || 0;
  return sortedRows(rows)
    .filter((r) => r !== row && (row?.id == null || r.id !== row.id) && (Number(r.seq) || 0) < seq)
    .every((r) => r.status === 'confirmed');
}

/**
 * สถานะแสดงของงวดในใบรายงวด — 'counted' | 'submitted' | 'rejected' | 'ready' | 'waiting' | 'auto' | null
 * ⭐ null = ใบทั้งใบ หรือใบที่ไม่ได้อนุมัติอยู่ (ไม่มีอะไรให้ยื่น/อนุมัติ)
 * ⭐ 'ready' = ยังไม่ยื่นและงวดก่อนหน้ารับรองเงินครบแล้ว · 'waiting' = ยังรองวดก่อนหน้า
 * ⭐ 'auto' (มติข้อ 10) = ยังไม่นับบนใบที่กด "นับที่เหลือทั้งหมด" แล้ว — ไม่ต้องยื่น (ฐานนับให้เอง · ค้าง = AE Sup กด "นับงวดที่ค้าง")
 *   ⇒ ไม่ใช่ 'ready' ⇒ nextSubmittableInstallment / เลนเจ้าของดีลไม่ชวนยื่น
 * ⭐ 'unfrozen' (review รอบห้า 27/10) = ใบมีงวดยังไม่ตรึง (ตัวหยุดยอดล้มตอนอนุมัติ) และงวดนี้ถึงคิวแล้ว — ยื่นไม่ได้จน AE Sup กดปุ่มกู้
 *   🐞 เดิมขึ้น 'ready' ("ยื่นขอนับได้") ข้างปุ่ม "ยื่นขอนับงวดนี้" ที่ดับด้วย INSTALLMENT_ACTUAL_UNFROZEN (ด่านยื่น + nextSubmittableInstallment
 *      รู้เรื่องนี้ตั้งแต่รอบสี่ — ป้ายยังไม่รู้) · ยังรองวดก่อน = 'waiting' ตามเดิม
 */
export function installmentActualState(row, order, rows = []) {
  if (!row || !liveInstallmentOrder(order)) return null;
  const status = row.actualStatus || null;
  if (status === 'approved') return 'counted';
  if (status === 'submitted') return 'submitted';
  if (installmentActualCountRestDone(rows)) return 'auto';
  if (installmentActualUnfrozen(rows)) return installmentPreviousConfirmed(row, rows) ? 'unfrozen' : 'waiting';
  if (status === 'rejected') return 'rejected';
  return installmentPreviousConfirmed(row, rows) ? 'ready' : 'waiting';
}

/* งวดที่ฝ่ายขายยื่นขอนับได้ตอนนี้ (เลขน้อยสุด) — ยังไม่ยื่น/ถูกตีกลับ + งวดก่อนหน้ารับรองเงินครบ · ไม่มี = null
   · ใบที่มีงวดยังไม่ตรึง = null (ยื่นไม่ได้จน AE Sup กดปุ่มกู้ — review รอบสี่ · เลนเจ้าของดีลไม่ชี้ไปปุ่มที่ดับ) */
export function nextSubmittableInstallment(order, rows = []) {
  if (!liveInstallmentOrder(order) || installmentActualUnfrozen(rows)) return null;
  return sortedRows(rows).find((row) => ['ready', 'rejected'].includes(installmentActualState(row, order, rows))
    && installmentPreviousConfirmed(row, rows)) || null;
}

/* รางขั้น "นับ Actual" ของใบรายงวด — x/y งวด (docs: รางโชว์ x/y) · ใบที่ไม่ใช่รายงวด = null */
export function installmentActualProgress(order, rows = []) {
  if (!isInstallmentActualOrder(order)) return null;
  const list = sortedRows(rows);
  const counted = list.filter(isCounted);
  return {
    counted: counted.length,
    total: list.length,
    countedAmount: fromCents(countedCentsOf(list)),
    complete: list.length > 0 && counted.length === list.length,
  };
}

/* ── เลน "รอฉันลงมือ" ของใบรายงวด (ข้อมูลที่ผู้เรียกต้องโหลดมา: งวดของใบ `{ id, seq, status, dueDate, actualStatus, actualSubmittedById }` —
   ขาด `dueDate` = เลนเจ้าของดีลอ่านทุกงวดเป็น "ไม่มีวันครบกำหนด" (นับเกิน)
   + `order.deal.ownerId` สำหรับเลนเจ้าของดีล) ──────────────────────────────────────────────────────────────── */

/* เลนผู้อนุมัติ: ใบมีงวดยื่นแล้วรออนุมัติที่ **ไม่ใช่ของตัวเอง** (admin นับงวดของตัวเองด้วย — อนุมัติเองได้ตาม RPC)
   และ **อนุมัติได้ตอนนี้** — งวดก่อนหน้ารับรองเงินครบ (RPC ตีกลับ previous_unconfirmed) · บัญชีถอนคำรับรองงวดก่อนหลังยื่นแล้ว
   = งวดนี้ไม่ใช่งานของผู้อนุมัติจนบัญชีรับรองใหม่ (ไม่งั้นป้าย/คิวชี้ไปปุ่มที่กดไม่ได้ · review 26/10) */
export function installmentActualAwaitingReview(order, rows = [], { userId = '', role = '', reviewer = isSalesManager(role) } = {}) {
  if (!reviewer || !liveInstallmentOrder(order)) return false;
  return sortedRows(rows).some((r) => r.actualStatus === 'submitted'
    && (role === 'admin' || (Boolean(userId) && text(r.actualSubmittedById) !== userId))
    && installmentPreviousConfirmed(r, rows));
}

/* เลนเจ้าของดีลปัจจุบัน: มีงวดที่ยื่นขอนับได้แล้ว **และถึงคิวแล้ว** — ถูกตีกลับ (รอแก้เสมอ) หรือยังไม่ยื่นที่ครบกำหนดภายในเดือนนี้
   (เวลาไทย) / เลยกำหนด / ไม่มีวันครบกำหนด · งวดก่อนหน้ารับรองเงินครบ (nextSubmittableInstallment)
   🪤 ไม่ดูวันครบกำหนด = ใบบริการรายเดือน 12 งวดค้างในป้าย "รอฉันลงมือ" ของเจ้าของดีลเกือบทั้งปี — งวดถัดไปยื่นได้ทันทีที่บัญชีรับรอง
      งวดก่อน แต่ยังไม่ใช่งานของเดือนนี้ · เกณฑ์เดียวกับกอง "รอนับรายงวด" (พับ 'none'/เดือนที่ผ่านมาเข้าเดือนปัจจุบัน)
   ⭐ ปุ่ม "ยื่นขอนับงวดนี้" ที่หน้าใบไม่ดูข้อนี้ (ยื่นก่อนกำหนดได้ ตามกติกาของ RPC) — ข้อนี้คุมแค่ป้าย/คิว */
export function installmentActualReadyForOwner(order, rows = [], { userId = '', thisMonth = currentMonth() } = {}) {
  if (!userId || order?.deal?.ownerId !== userId) return false;
  const next = nextSubmittableInstallment(order, rows);
  if (!next) return false;
  if (next.actualStatus === 'rejected') return true;
  const due = orderDateMonth(next.dueDate);
  return !due || due <= thisMonth;
}

/**
 * ด่านยื่น/ดึงกลับ/อนุมัติ/ตีกลับงวด — **กติกาเดียวกับ RPC sales_order_installment_actual_action** · คืนข้อความไทย หรือ null
 * ⭐ ร่วม: ใบ pipeline + อนุมัติแล้ว + รายงวด + ไม่ถูกแทน
 * ⭐ submit: เจ้าของดีลปัจจุบัน หรือผู้มีอำนาจตัดสินฝ่ายขาย · ยังไม่ยื่น/ถูกตีกลับ · งวดก่อนหน้ารับรองเงินครบ
 *   · ใบที่กด "นับที่เหลือทั้งหมด" แล้ว = ไม่ต้องยื่น (มติข้อ 10 — ข้อเดียวที่ RPC ไม่มี: ฐานนับให้เองตอน COMMIT)
 * ⭐ withdraw: ผู้ยื่นเอง หรือ admin · ยื่นแล้ว
 * ⭐ approve: ผู้อนุมัติ (AE Sup · CM · CD · admin) · ยื่นแล้ว · ไม่ใช่ผู้ยื่น (admin ได้) · งวดก่อนหน้ารับรองเงินครบ
 * ⭐ submit/approve: งวดของใบตรึงครบ (installmentActualUnfrozen · review รอบสี่ — RPC ตอบ installment_actual_unfrozen ลำดับเดียวกัน)
 * ⭐ reject: ผู้อนุมัติ · ยื่นแล้ว · เหตุผล 10–500 ตัวอักษร
 * ⚠️ ข้อมูลเก่า (CAS updatedAt) ผู้เรียกตรวจเองด้วย installmentStale — ตัวนี้ตอบแค่ "สถานะ + สิทธิ์"
 * @param action 'actual_submit' | 'actual_withdraw' | 'actual_approve' | 'actual_reject' (หรือชื่อของ RPC ตรง ๆ)
 * @param options `{ order (ต้องมี status · origin · actualMode · supersededById · deal.ownerId), rows, reason, dealOwnerId }`
 */
export function installmentActualActionError(row, action, user, { order = null, rows = null, reason = '', dealOwnerId } = {}) {
  const op = INSTALLMENT_ACTUAL_ACTIONS[action] || action;
  if (!Object.values(INSTALLMENT_ACTUAL_ACTIONS).includes(op)) return 'คำสั่งไม่ถูกต้อง';
  if (!row) return msg('installment_actual_not_found');
  /* ลำดับเดียวกับ RPC: (pipeline + อนุมัติแล้ว + ไม่ถูกแทน) → แบบการนับ — ใบที่กลับเป็นร่าง/รออนุมัติถูกฐานคืนเป็น 'order'
     แล้ว ถ้าถามแบบก่อนจะได้ "นับทั้งใบ" ทั้งที่ความจริงคือใบยังไม่อนุมัติ · ไม่ส่งใบมา = ตอบแบบใบที่ยังไม่อนุมัติ (ไม่เดาว่าผ่าน) */
  if (!order || isHistoricalOrder(order) || order.status !== 'approved' || order.supersededById) {
    return msg('installment_actual_order_not_approved');
  }
  if (!isInstallmentActualOrder(order)) return msg('installment_actual_order_not_installment');

  const role = user?.role || '';
  const userId = text(user?.id);
  const approver = isSalesManager(role);
  const status = row.actualStatus || null;
  const list = Array.isArray(rows) ? rows : [];

  if (op === 'submit') {
    const ownerId = text(dealOwnerId ?? order.deal?.ownerId);
    if (!approver && !(userId && userId === ownerId)) return msg('installment_actual_forbidden');
    if (status !== null && status !== 'rejected') return msg('installment_actual_bad_state');
    /* มติข้อ 10: ใบที่กด "นับที่เหลือทั้งหมด" แล้วไม่มีการยื่นทีละงวด — ด่าน JS อย่างเดียว (RPC ปล่อยผ่าน แต่ constraint trigger ของ 0412
       นับงวดนั้นให้ตอน COMMIT อยู่ดี = ผลเท่ากัน) · กันกระดิ่ง "ยื่นแล้ว" ถึง AE Sup ทั้งที่งวดถูกนับไปแล้ว */
    if (installmentActualCountRestDone(list)) return INSTALLMENT_ACTUAL_AFTER_COUNT_REST;
    /* review รอบสี่: งวดยังไม่ตรึง = ยื่นไม่ได้ (ลำดับเดียวกับ RPC — ก่อนด่านงวดก่อนหน้า: งวดที่ไม่ตรึงรับรองเงินไม่ได้อยู่แล้ว ⇒ บอกทางกู้ที่ใช้ได้จริง) */
    if (installmentActualUnfrozen(list)) return INSTALLMENT_ACTUAL_UNFROZEN;
    if (!installmentPreviousConfirmed(row, list)) return msg('installment_actual_previous_unconfirmed');
    return null;
  }
  if (op === 'withdraw') {
    if (status !== 'submitted') return msg('installment_actual_bad_state');
    if (role !== 'admin' && !(userId && userId === text(row.actualSubmittedById))) return msg('installment_actual_forbidden');
    return null;
  }
  if (!approver) return msg('installment_actual_forbidden');
  if (status !== 'submitted') return msg('installment_actual_bad_state');
  if (op === 'approve') {
    if (role !== 'admin' && userId && userId === text(row.actualSubmittedById)) return msg('installment_actual_self_approval');
    if (installmentActualUnfrozen(list)) return INSTALLMENT_ACTUAL_UNFROZEN;
    if (!installmentPreviousConfirmed(row, list)) return msg('installment_actual_previous_unconfirmed');
    return null;
  }
  // reject
  const why = text(reason);
  if (why.length < INSTALLMENT_ACTUAL_REASON_MIN || why.length > INSTALLMENT_ACTUAL_REASON_MAX) {
    return msg('installment_actual_reason_required');
  }
  return null;
}

/* "นับที่เหลือทั้งหมด" (RPC count_rest_sales_order_installment_actual · มติข้อ 8) — ปุ่มระดับใบ `{ visible, blocker }`
   ⭐ ผู้อนุมัติเท่านั้น (ไม่มีสิทธิ์ = ซ่อน) · ใบรายงวดที่อนุมัติอยู่ · มีงวดที่ยังไม่นับ · เหตุผล 10–500 ตัวอักษรตรวจที่โมดัล
   ⭐ งวดที่ยังไม่ตรึงไม่บล็อกปุ่มนี้ — route ตรึงงวดก่อนเรียก RPC (ตัวเดียวกับปุ่มกู้ "นับงวด 1" · review รอบสี่) · RPC กันอีกชั้น (unfrozen)
   ⚠️ ทางเดียว: ทั้งใบ → รายงวดต้องย้อนอนุมัติแล้วออก Rev. */
export function countRestBlocker(order, rows = [], user = null) {
  if (!isSalesManager(user?.role)) return { visible: false, blocker: msg('installment_actual_forbidden') };
  if (!order || isHistoricalOrder(order) || order.status !== 'approved' || order.supersededById) {
    return { visible: false, blocker: msg('installment_actual_order_not_approved') };
  }
  if (!isInstallmentActualOrder(order)) return { visible: false, blocker: msg('installment_actual_order_not_installment') };
  // RPC ตีกลับด้วย bad_state เมื่อไม่มีงวดให้นับ — ปุ่มบอกเหตุเป็นคำคนอ่านแทน
  /* 🪤 ใบยังไม่มีงวดสักแถว (ตัวหยุดยอดล้มหลังอนุมัติ · review รอบสอง 26/10) ≠ "นับครบแล้ว" — Actual ของใบยัง 0
     และยอดทั้งใบอยู่กอง "รอนับรายงวด" ⇒ บอกทางกู้ (สร้างงวดก่อน แล้ว "นับงวด 1") ไม่ใช่บอกว่าครบ */
  const list = sortedRows(rows);
  if (!list.length) return { visible: true, blocker: COUNT_REST_NO_ROWS };
  const open = list.filter((r) => !isCounted(r));
  /* นับครบแล้ว = ข่าวดี ไม่ใช่ข้อผิดพลาด (UAT 27/10 ข้อ 11) — `kind: 'info'` ให้ปุ่ม (GatedAction blockerKind) ทักโทนแจ้ง ไม่ใช่ toast แดง ·
     คำเดียวกับบรรทัดสรุปของการ์ด (installmentActualNextStep 'complete') ที่พิมพ์บนจออยู่แล้ว */
  if (!open.length) return { visible: true, blocker: 'นับ Actual ครบทุกงวดแล้ว', kind: 'info' };
  return { visible: true, blocker: null };
}

/**
 * ขั้นถัดไปของใบรายงวดที่อนุมัติอยู่ **ในสภาพพิเศษ** — `{ kind, text }` · สภาพปกติ (ยื่นทีละงวด) หรือไม่ใช่ใบรายงวดที่อนุมัติอยู่ = null
 * ⭐ คำเดียวกันสองที่: คำอธิบายสถานะบนหัวใบ (หน้า SO) และบรรทัดสรุปของการ์ดการชำระ (UAT 27/10 ข้อ 1 · 8)
 *   🐞 เดิมหัวใบบอก "งวดที่เหลือนับเมื่อ AE Sup อนุมัติแต่ละงวด" ในทุกสภาพที่ยังไม่ครบ — ผิดบนใบที่งวดไม่ตรึง (ยื่น/อนุมัติงวดติดด่าน)
 *      และบนใบที่กด "นับที่เหลือทั้งหมด" แล้ว (มติข้อ 10 — ไม่มีการอนุมัติทีละงวดอีก) · แผงงวดของใบที่งวดไม่ตรึงพูดคำของงวดร่าง
 *      ("ยอดยืนยันตอนใบอนุมัติ") ทั้งที่ใบอนุมัติแล้ว
 * ⭐ ลำดับ: `no_rows` (ตัวหยุดยอดล้มก่อนมีงวด) → `unfrozen` (งวดไม่ตรึง — ทุกด่านของงวดติดจนกดปุ่มกู้ · ป้ายปุ่มตัวเดียวกับการ์ด) →
 *   `complete` (นับครบ) → `auto` (ใบนับทั้งก้อนแต่ยังมีงวดค้าง = ขั้นนับตอนอนุมัติ Rev. ยังไม่จบ → "นับงวดที่ค้าง")
 */
export function installmentActualNextStep(order, rows = []) {
  if (!liveInstallmentOrder(order)) return null;
  const list = sortedRows(rows);
  if (!list.length) {
    return { kind: 'no_rows', text: `ใบนี้ยังไม่มีงวดชำระ — กด “เริ่มติดตามการชำระ” ที่การ์ดการชำระ แล้ว AE Sup กด “${INSTALLMENT_ACTUAL_START_LABEL}”` };
  }
  if (installmentActualUnfrozen(list)) {
    return {
      kind: 'unfrozen',
      text: `งวดชำระยังไม่ตรึง (ตรึงไม่สำเร็จตอนอนุมัติ) — ให้ AE Sup กด “${installmentActualStartButtonLabel(list)}” ที่การ์ดการชำระ`
        + ' เพื่อตรึงงวดแล้วนับ Actual งวดที่ค้าง',
    };
  }
  const countRestDone = installmentActualCountRestDone(list);
  if (list.every(isCounted)) {
    return { kind: 'complete', text: countRestDone ? 'นับ Actual ครบทุกงวดแล้ว — งวดที่เพิ่มทีหลังนับให้อัตโนมัติ' : 'นับ Actual ครบทุกงวดแล้ว' };
  }
  if (countRestDone) {
    return {
      kind: 'auto',
      text: `ใบนี้นับทั้งก้อน (กด “นับที่เหลือทั้งหมด” แล้ว) — งวดที่ค้างให้ AE Sup กด “${INSTALLMENT_ACTUAL_START_LEFT_LABEL}” ที่การ์ดการชำระ`,
    };
  }
  return null;
}

/* เหตุของ "นับที่เหลือทั้งหมด" เมื่อใบรายงวดยังไม่มีงวด — คำเดียวกับปุ่มปรับแผน/ยกเงิน ("ยังไม่มีงวดชำระ — กด ‘เริ่มติดตามการชำระ’ ก่อน") */
export const COUNT_REST_NO_ROWS = 'ใบนี้ยังไม่มีงวดชำระ — กด ‘เริ่มติดตามการชำระ’ ก่อน แล้วกด ‘นับงวด 1’';

/* เหตุผลของ "นับที่เหลือทั้งหมด" / ตีกลับงวด — ข้อความเดียวกับรหัสของฐาน */
export function installmentActualReasonError(reason) {
  const why = text(reason);
  return why.length < INSTALLMENT_ACTUAL_REASON_MIN || why.length > INSTALLMENT_ACTUAL_REASON_MAX
    ? msg('installment_actual_reason_required')
    : null;
}
