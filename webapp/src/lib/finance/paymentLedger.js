// ── ทะเบียนการชำระรวมทุกใบสั่งขาย (โมดูลบัญชีและการเงิน) ────────────────────
//
// คำสั่งตั้งต้น (2026-08-13): *"เอาตารางการชำระของทุก SO ออกมารวมอยู่ในที่เดียว
// ซึ่งราคาต้องมีการอ้างอิง QT SO และสามารถดาวน์โหลด"*
//
// ⭐ **คอลัมน์ประกาศไว้ที่เดียว** (`LEDGER_COLUMNS`) แล้วทั้งตารางบนเว็บและไฟล์
// Excel อ่านจากชุดเดียวกัน — ของที่ควรเป็นตารางเดียวกันแต่เขียนสองที่จะเพี้ยนหากัน
// เสมอ (บทเรียนเดียวกับกฎ "ฟอร์มเดียวสองทางเรียก" ใน AGENTS.md) · ที่นี่เจ็บกว่า
// เพราะไฟล์ที่บัญชีดาวน์โหลดไปคือของที่เอาไปกระทบยอดจริง ถ้าคอลัมน์ไม่ตรงกับที่เห็น
// บนจอ คนจะเถียงกันว่าตัวเลขไหนถูกโดยไม่มีใครรู้ว่าต่างกันตรงไหน
// ⚠️ (ตรวจ 26/09) ย่อหน้าบนเป็นของยุคตารางรายงวด — ตั้งแต่ยุบเป็นหนึ่งใบหนึ่งแถว (มติ 2026-08-15)
// `LEDGER_COLUMNS` ป้อนไฟล์ Excel อย่างเดียว ดูคำอธิบายที่ตัวมันเอง
//
// ⚠️ **`reported` ไม่นับว่าเก็บเงินได้** — นับเฉพาะ `confirmed` (กติกาจาก mig 0245:
// SA แจ้งเองนับเอง = ไม่มีด่าน) · ยอด "เก็บได้" ทุกตัวในไฟล์นี้จึงนับจาก confirmed เท่านั้น

import { fmtMonthYear, fmtName } from '@/lib/format';
import { bucketList } from '@/lib/listGrouping';
import { paidThrough } from '@/lib/sales/paymentCoverage';
import {
  installmentConfirmOutlook, installmentRefunded, installmentVoid, pipelineInstallmentLock, strandedInstallment,
} from '@/lib/sales/salesOrderPayments';
import { installmentsReplanned } from '@/lib/sales/installmentReplan';
import { taxInvoicePending } from '@/lib/sales/taxInvoice';
import {
  OPENING_INSTALLMENT_LABEL, ORIGIN_PIPELINE, historicalRefsOf, isHistoricalOrder, isOpeningInstallment,
} from '@/lib/sales/historicalOrders';
import {
  BILLING_REMIND_DAYS, billingRequestLive, billingState, billingStateLabel, describeBillingRule,
} from '@/lib/sales/billingRule';

/** สถานะงวด → ป้ายไทย + โทนสี (ชุดเดียวกับที่การ์ดในใบ SO ใช้) */
export const LEDGER_STATUS = {
  pending: { label: 'รอชำระ', tone: 'neutral' },
  reported: { label: 'รอบัญชีตรวจ', tone: 'info' },
  confirmed: { label: 'เก็บเงินแล้ว', tone: 'success' },
  rejected: { label: 'ถูกตีกลับ', tone: 'danger' },
};

export const LEDGER_STATUS_KEYS = Object.keys(LEDGER_STATUS);

/* ป้ายของใบสั่งขายย้อนหลังบนแถวคิว/ทะเบียน (มติ 22/09) — จอกับชุดค้นใช้ค่าเดียวกัน (ตาเห็น = ต้องค้นเจอ) */
export const LEDGER_HISTORICAL_TAG = 'ใบย้อนหลัง';
/* ป้ายของแถวคิวรับรองที่มาจากใบที่ยกเลิก (review UI-1) — บัญชีต้องรู้ก่อนกดว่ารับรองแล้วเงินเป็น "เงินค้าง" ไม่ใช่เงินของใบที่เดินอยู่
   ⚠️ อยู่ในชุดค้นด้วย (ตาเห็น = ต้องค้นเจอ) */
export const LEDGER_CANCELLED_TAG = 'ใบยกเลิกแล้ว';

/* ── เงินค้างจากใบที่ยกเลิก (PR3 · mig 0378 · มติเจ้าของ 23/09 D4) ──────────────────────────────────────────
   ยกเลิกใบที่มีเงินรับแล้วได้ — งวด confirmed/reported ที่ยังไม่คืนเงินของใบนั้น = "เงินค้าง" (strandedInstallment)
   ⭐ ทางออก: ยกเข้าใบใหม่ของดีลเดียวกัน (แถวย้ายออกจากใบนี้ — หายจากคิวเอง) หรือบัญชีบันทึกคืนเงิน (refunded)
   ⭐ เก็บได้ (collected) = confirmed ที่ยังไม่คืนเงิน — เงินค้างที่รับรองแล้วยังนับว่าเก็บได้จนกว่าจะคืน (เงินอยู่กับบริษัท)
   ⚠️ ค้างรับ/เลยกำหนดคงกติกาเดิมของ PR0 (ตัดสินจากสถานะงวด) — เทสต์ของ PR0 ตรึงไว้ */
export const LEDGER_STRANDED_TITLE = 'เงินค้างจากใบที่ยกเลิก';
const collectedRow = (r) => r.status === 'confirmed' && !r.refunded;
/* ใบกำกับค้าง — งวดที่คืนเงินแล้วไม่ใช่ของค้างเอกสาร (เลขใบลดหนี้คู่ใบกำกับอยู่ที่แถวแล้ว) */
const ledgerInvoicePending = (r) => !r.refunded && taxInvoicePending(r);

/* ── ใบที่ตายแล้ว (PR0 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09) ────────────────────────────
   ยกเลิก = ไม่มีงานให้เก็บเงินต่อ · ถูกออก Rev. ทับ = งวดเป็นของใบ Rev. แล้ว
   🐞 ทะเบียนเคยไม่ดูสถานะใบเลย ⇒ วันที่ตรวจ (23/09) นับ "ค้างรับ" เทียม ฿577,667.32 บนใบที่ยกเลิกแล้ว
   ⭐ **งวดที่ยังไม่มีเงิน (pending/rejected) ของใบที่ตายแล้ว = โมฆะ** — ไม่ใช่ยอดค้างรับ ไม่ใช่เลยกำหนด
   ⚠️ reported ยังอยู่ (บัญชีรับรอง/ตีกลับได้ — `pipelineInstallmentLock`) · confirmed ยังนับเป็นเงินที่เก็บได้
     ⏭ PR3 แยกกลุ่ม "เงินค้างจากใบที่ยกเลิก" (stranded) + คืนเงิน/ยกเงินเข้าใบใหม่
   ⚠️ ตัดที่ผู้เรียก (route) ก่อน `ledgerRow` — `ledgerRow` เป็นตัวจัดรูปแถว ไม่ใช่ตัวตัดสินว่าแถวไหนเข้าทะเบียน */
const LEDGER_DEAD_ORDER_STATUSES = Object.freeze(['cancelled', 'revised']);
const isLedgerDeadOrder = (order) => LEDGER_DEAD_ORDER_STATUSES.includes(order?.status);

/* ⭐ ตัวตัดสินอยู่ที่ `installmentVoid` (salesOrderPayments) — แผงงวดบนใบ · ตารางรายการ SO · ทะเบียนนี้ ถามตัวเดียวกัน (review UI-3) */
export function ledgerVoidInstallment(installment, order) {
  return installmentVoid(installment, order);
}

/* ── รอบวางบิล (mig 0389 · มติเจ้าของ 25–26/09 · ม็อก D ของ mockups/billing-cycle) ─────────────────────
   FN เห็นวันวางบิลรายงวด + กรอง "ถึงรอบใน 3 วัน · ยังไม่ขอใบ / ถึงรอบใน 7 วัน / ถึงรอบเดือนนี้ / เลยรอบ ยังไม่ขอใบวางบิล"
   ได้ที่ทะเบียนนี้
   ⭐ `soon` (รอบสอง 26/09 · มติเจ้าของ ข้อ 4) = **ชุดของกระดิ่ง "ถึงรอบวางบิล" เป๊ะ** — กระดิ่งฝั่ง FN ลิงก์มาที่ `?billing=soon`
     แล้วหัวข้อ "N งวด" ต้องเท่ากับที่เปิดมาเจอ · ธงของแถว (`billingSoon`) **ไม่คิดที่นี่** — route ถามตัวคัด
     `billingDueCandidates` (lib/sales/billingDueNotify.js) ตัวเดียวกับ cron แล้วส่งผลเข้า `ledgerRow` (`billingRemind`)
     เพราะตัวคัดตัดมากกว่าสถานะงวด (ร่างที่ QT ถูกถอด Won · ใบย้อนหลังที่ยังไม่อนุมัติ · ลูกค้าสหมิตร) ⇒ คิดซ้ำที่นี่ = สองชุดเพี้ยนกัน
   ⚠️ **วันวางบิล ≠ กำหนดชำระ** — "เลยกำหนด" (แดง) ยังอ่าน `dueDate` ช่องเดียว · วันวางบิลที่ผ่านไปแล้ว = "เลยรอบวางบิล"
     โทนเตือน ไม่มีทางแดงจากช่องนี้ (ตัวคิดสถานะอยู่ที่ billingRule.js ตัวเดียว — ห้ามคิดซ้ำที่นี่)
   ⚠️ นับเฉพาะงวดที่ "ยังมีงานวางบิล" (ยังไม่แจ้งชำระ/ยังไม่รับเงิน · ไม่ใช่งวดยกมา) — กติกาเดียวกับกระดิ่ง */
export const LEDGER_BILLING_WINDOW_DAYS = 7;
export const LEDGER_BILLING_FILTERS = Object.freeze([
  { value: 'soon', label: `ถึงรอบใน ${BILLING_REMIND_DAYS} วัน · ยังไม่ขอใบ`, empty: `ไม่มีงวดที่ถึงรอบวางบิลใน ${BILLING_REMIND_DAYS} วันโดยยังไม่ขอใบ`, hint: `ชุดเดียวกับกระดิ่ง "ถึงรอบวางบิล" — งวดรอชำระที่มียอด วันวางบิลอยู่ในวันนี้ถึงอีก ${BILLING_REMIND_DAYS} วัน และยังไม่มีคำร้องขอใบวางบิลที่ส่งแล้ว` },
  { value: '7d', label: 'ถึงรอบใน 7 วัน', empty: 'ไม่มีงวดที่ถึงรอบวางบิลใน 7 วันนี้', hint: 'นับเฉพาะงวดที่มีวันวางบิลและยังไม่แจ้งชำระ ทั้งที่ขอใบแล้วและยังไม่ขอ' },
  { value: 'month', label: 'ถึงรอบเดือนนี้', empty: 'ไม่มีงวดที่ถึงรอบวางบิลเดือนนี้', hint: 'นับเฉพาะงวดที่มีวันวางบิลในเดือนนี้ (รวมวันที่ผ่านไปแล้ว) และยังไม่แจ้งชำระ' },
  { value: 'late', label: 'เลยรอบ ยังไม่ขอใบวางบิล', empty: 'ไม่มีงวดที่เลยรอบวางบิลโดยยังไม่ขอใบ', hint: 'งวดที่ขอใบวางบิลแล้ว หรือฝ่ายขายแจ้งชำระแล้ว ไม่นับเป็นเลยรอบ' },
]);
/* ค่าที่ไม่รู้จัก = '' (ไม่กรอง) — ลิงก์พิมพ์ผิดต้องไม่ทำให้ทะเบียนว่างโดยไม่มีคำอธิบาย (กติกาเดียวกับ taxInvoice) */
export const ledgerBillingFilter = (value) => (LEDGER_BILLING_FILTERS.some((f) => f.value === value) ? value : '');
/* คำบนแถวของลูกค้าที่ยังไม่ตั้งรอบ — ค่าว่างของรอบคือสถานะปกติ (ลูกค้าส่วนใหญ่จ่ายก่อน/พร้อมสั่ง · บางที่ไม่มีรอบวาง) */
export const LEDGER_BILLING_RULE_UNSET = 'ยังไม่ตั้งรอบวางบิล';
/* ป้ายในเซลล์ "วางบิลถัดไป" — จอกับชุดค้นใช้ค่าเดียวกัน (ตาเห็นบนแถว = ต้องค้นเจอ) */
export const LEDGER_BILLING_REQUESTED_TAG = 'ขอใบแล้ว';
export const LEDGER_BILLING_UNREQUESTED_TAG = 'ยังไม่ขอ';
export const LEDGER_BILLING_WAITING_TAG = 'รอเหตุการณ์';

/* ── "ขอใบวางบิลแล้ว" = งวดผูกคำร้อง (billingRequestId · 0260) **และคำร้องส่งถึงบัญชีแล้ว ยังไม่ถูกยกเลิก** ──
   กติกาอยู่ที่ `billingRequestLive` (billingRule.js) ตัวเดียว — ร่างที่ยังไม่ส่ง = ยังไม่ขอ · ยกเลิก/ถูกลบ = ยังไม่ขอ
   ชื่อ `billingRequestAlive` คงไว้ให้ผู้เรียกเดิม (ตัวผูกคำร้องอัตโนมัติ) */
export const billingRequestAlive = billingRequestLive;

/* งวดที่ยังมีงานวางบิล — ตัดงวดที่แจ้งชำระ/รับเงิน/คืนเงินแล้ว (settled) และงวดยกมา (opening) */
const billingOpenKey = (key) => key !== 'settled' && key !== 'carried';

/* คำในเซลล์ "วางบิลถัดไป" ที่มาจากงวดนี้ — ชื่อเหตุการณ์ ("ก่อนส่งสินค้า") · ป้ายขอใบแล้ว/ยังไม่ขอ ของงวดที่มีวันวางบิล
   ⚠️ วันที่/ระยะ ("อีก 3 วัน") ไม่อยู่ในชุดค้นโดยตั้งใจ — เปลี่ยนทุกวัน และตัวกรอง "รอบวางบิล" ตอบคำถามนั้นอยู่แล้ว */
function billingSearchWords(r) {
  const event = String(r.billingEvent || '').trim();
  const open = billingOpenKey(r.billingStateKey);
  return [
    event ? `${LEDGER_BILLING_WAITING_TAG} ${event}` : '',
    open && r.billingDate ? (r.billingRequested ? LEDGER_BILLING_REQUESTED_TAG : LEDGER_BILLING_UNREQUESTED_TAG) : '',
  ];
}

/* คำบอกระยะของวันวางบิลถัดไปบนแถวใบ (ม็อก D) — สั้นกว่า `billingStateLabel` เพราะป้าย "ขอใบแล้ว/ยังไม่ขอ"
   อยู่ข้าง ๆ แล้ว (ใช้ label ยาวจะพูด "ยังไม่ขอใบวางบิล" สองครั้งในเซลล์เดียว) */
export function ledgerBillingWhen(state) {
  const days = state?.days;
  if (days === null || days === undefined) return '';
  if (days < 0) return state.key === 'late' ? `เลยรอบวางบิล ${-days} วัน` : `ผ่านมา ${-days} วัน`;
  if (days === 0) return 'ถึงรอบวันนี้';
  return state.key === 'soon' ? `ถึงรอบใน ${days} วัน` : `อีก ${days} วัน`;
}

/**
 * แถวเดียวของทะเบียน — แบนราบพอที่ทั้งตารางและ Excel ใช้ได้โดยไม่ต้องไล่ join ต่อ
 *
 * ⚠️ ทุกอย่างที่มาจาก QT เป็น **snapshot ตอนอนุมัติใบ** (`label` `percent` `amount`)
 * ห้ามคำนวณใหม่จาก QT ปัจจุบัน — ใบที่เซ็นไปแล้วต้องอ่านได้เท่าเดิมตลอดไป
 */
export function ledgerRow({
  installment, order, quotation, customer, deal = null, todayIso = null,
  serviceRounds = false, billingRequest = null, billingRemind = false,
}) {
  if (!installment || !order) return null;
  const status = installment.status || 'pending';
  const due = installment.dueDate || null;
  /* ── รอบวางบิล (mig 0389) — สถานะคิดที่ server ด้วย "วันนี้" ของนาฬิกาไทยตัวเดียวกับ `overdue` ──
     `billingRequest` = แถวคำร้องที่งวดผูกอยู่ (ผู้เรียกโหลดมา) · ไม่ส่ง/หาไม่เจอ = ยังไม่ขอ */
  const billingDate = installment.billingDate || null;
  const billingRequested = Boolean(installment.billingRequestId)
    && billingRequestAlive(billingRequest) && billingRequest.id === installment.billingRequestId;
  const billing = billingState(installment, { todayIso, requested: billingRequested });
  const billingOpen = billingOpenKey(billing.key) && Boolean(billingDate);
  return {
    id: installment.id,
    // ── อ้างอิงเอกสาร: ทั้งเลขที่ (สำหรับคนอ่าน) และ id (สำหรับลิงก์) ──
    orderId: order.id,
    orderNumber: order.orderNumber || '',
    quotationId: order.quotationId || quotation?.id || null,
    /* ใบสั่งขายย้อนหลัง (mig 0360) ไม่มีใบเสนอราคาในระบบ — ช่อง "อ้างอิง QT" ถอยไปเลขใบเสนอราคาเดิมที่คีย์ไว้ */
    quoteNumber: quotation?.quoteNumber || order.historicalQuoteRef || '',
    /* ที่มาของใบ + เลขเอกสารเดิมทุกระบบ (ใบเสนอราคาเดิม · Express · ใบกำกับ) — บัญชีถูกถามด้วยเลขพวกนี้
       ("IV6801041 เก็บถึงไหนแล้ว") ⇒ ต้องค้นเจอ · ⚠️ ledgerRow เป็น whitelist ลืมเติมที่นี่ = หายเงียบ */
    origin: order.origin || ORIGIN_PIPELINE,
    historicalRefs: historicalRefsOf(order).join(' '),
    /* ⭐ เอกสารอ้างอิงของใบ (PO ลูกค้า) — บัญชีถูกถามด้วยเลขนี้เป็นหลัก ("PO ใบนี้
       เก็บถึงไหนแล้ว") · ตารางรายการ SO ค้นด้วยเลขนี้ได้ตั้งแต่ IS-26080017
       แล้ว ทะเบียนนี้เพิ่งมี ⇒ ฝ่ายบัญชีเคยเป็นฝ่ายเดียวที่ค้นด้วยเลข PO ไม่ได้ */
    referenceDoc: order.referenceDoc || '',
    /* ⭐ ข้อมูลระดับใบที่โมดัลรับรองของใบย้อนหลังต้องโชว์ (mock FnConfirm · REVISION 2) —
       "ยอดที่เก็บแล้ว X จาก <ยอดใบ>" · "อนุมัติใบ: <AE Sup> · <วัน> · ไม่นับ Actual" · เลขใบกำกับเดิม (Express)
       ⚠️ ยอดใบ **ไม่รู้ = null** ไม่ใช่ 0 (ตัวตัดสินใบ ฿0 แยกสองกรณีนี้ — paymentNotRequired) */
    orderTotal: order.totalAmount === null || order.totalAmount === undefined ? null : Number(order.totalAmount),
    orderApprovedByName: order.approvedByName || '',
    orderApprovedAt: order.approvedAt || null,
    historicalInvoiceRef: order.historicalInvoiceRef || '',
    customerName: customer?.name || order.customerName || '',
    customerCode: customer?.arCode || '',
    /* id ลูกค้า = ลิงก์ "ตั้งรอบ" ไปหน้าทะเบียนลูกค้า · รอบวางบิลแบบย่อบรรทัดใต้ชื่อ ("วางบิลทุกวันที่ 5 · เงินเข้า 25")
       ⚠️ ค่าระดับลูกค้า — ทุกงวดของใบพกค่าเดียวกัน · '' = ยังไม่ตั้ง (หรือยังไม่รัน 0389 — route ถอยไปอ่านชุดเดิม)
       ⚠️ อยู่ในชุดค้นด้วย (ตาเห็นบนแถว = ต้องค้นเจอ) */
    customerId: order.customerId || customer?.id || null,
    billingRuleText: describeBillingRule(customer?.billingRule, { short: true }),
    /* สองขั้นแรกของราง — พกมากับแถวเพื่อให้ก้อน (`groupLedgerByOrder`) ประกอบราง
       ได้โดยไม่ต้องยิง API ซ้ำ · ขั้นที่สามคำนวณจากงวดในก้อนเอง */
    orderStatus: order.status || null,
    /* สถานะ QT — ร่างที่ QT ถูกถอด Won แล้ว (ร่างที่กู้คืน · SO-26080039-0) รับรอง/บันทึกใบกำกับไม่ได้ (`ledgerRowLock`) */
    quotationStatus: quotation?.status || null,
    financeStatus: order.financeStatus || null,
    /* ใบยกเลิก/ถูกออก Rev. ทับ (PR0) — แถวที่เหลือของใบแบบนี้คือเงินที่เข้าแล้วหรือรอบัญชีตรวจเท่านั้น */
    orderDead: isLedgerDeadOrder(order),
    /* ⚠️ **ผู้ดูแล (AE) กับทีม อยู่ที่ "ดีล" ไม่ใช่ที่ใบ** — `sales_orders` ไม่มี
       สองคอลัมน์นี้ (เคยใส่ใน select แล้วได้ 500 ทั้งหน้า) ⇒ ต้อง join ดีลมาส่งเป็น
       `deal` · รับจากใบไว้ด้วยเผื่อผู้เรียกที่ประกอบ order มาเองแล้ว */
    team: deal?.team || order.team || null,
    ownerId: deal?.ownerId || order.ownerId || null,
    ownerName: deal?.ownerName || order.ownerName || '',

    // ── ตัวงวด (snapshot จาก QT) ──
    seq: installment.seq,
    label: installment.label || '',
    percent: Number(installment.percent) || 0,
    amount: Number(installment.amount) || 0,
    /* ── งวดยกมาของใบสั่งขายย้อนหลัง (mig 0374 · มติ 22/09) ─────────────────────────────
       ⚠️ ต้องอยู่ในรายชื่อนี้ — `taxInvoicePending` ตัดงวดยกมาด้วย `kind` ⇒ ลืมเติม = งวดยกมาโผล่ในคิว
       "ยังไม่ออกใบกำกับ" ของบัญชีตลอดกาล (ใบกำกับของเงินก้อนนั้นออกในระบบเดิมแล้ว) · ค่าว่างของฐาน = งวดปกติ
       `note` = หมายเหตุที่ฝ่ายขายคีย์มากับงวด — โมดัลรับรองของบัญชีโชว์ "หมายเหตุจาก SA" */
    kind: installment.kind || 'regular',
    note: installment.note || '',

    dueDate: due,
    /* ── วันวางบิลของงวด (mig 0389) ────────────────────────────────────────────
       ⚠️ whitelist: ค่ามาจาก `select('*')` ถึง server เอง แล้วตายที่นี่ถ้าลืมเติม (บทเรียนเดียวกับใบกำกับข้างล่าง)
       · `billingEvent` = งวดที่ "รอเหตุการณ์" (ก่อนส่งสินค้า ฯลฯ) — ไม่มีวันโดยตั้งใจ (ระบบไม่เดาวัน)
       · `billingStateKey`/`billingDays` = ผลของ `billingState` (billingRule.js) — ก้อนของใบบนจออ่านต่อโดยไม่ต้องรู้ "วันนี้"
       · `billingStatusLabel` = ข้อความเดียวกับทุกจอ สำหรับไฟล์ Excel (boolean ลง Excel เป็น TRUE/FALSE — ต้องเป็นคำ)
       · สามธงของตัวกรอง "รอบวางบิล" คิดที่นี่ครั้งเดียว (ตัวกรอง · ตัวนับบนการ์ด · ตัวนับในแผงตัวกรอง ใช้ธงชุดเดียวกัน) */
    billingDate,
    billingEvent: installment.billingEvent || '',
    billingRequestId: installment.billingRequestId || null,
    billingRequested,
    billingStateKey: billing.key,
    billingDays: billing.days,
    billingStatusLabel: billingStateLabel(billing, { billingEvent: installment.billingEvent || '' }),
    // ถึงรอบใน 0..7 วันนับจากวันนี้ — นับทั้งงวดที่ขอใบแล้วและยังไม่ขอ (ม็อก D)
    billingIn7Days: billingOpen && billing.days !== null && billing.days >= 0 && billing.days <= LEDGER_BILLING_WINDOW_DAYS,
    // เดือนนี้ = เดือนปฏิทินของวันนี้ (นาฬิกาไทย) ทั้งเดือน รวมวันที่ผ่านไปแล้ว
    billingThisMonth: billingOpen && Boolean(todayIso) && String(billingDate).slice(0, 7) === String(todayIso).slice(0, 7),
    // เลยรอบวางบิล = ผ่านวันวางบิลแล้ว + ยังไม่ขอใบวางบิล + ยังไม่แจ้งชำระ (billingState 'late' · ไม่ใช่ "เลยกำหนด")
    billingLate: billing.key === 'late',
    /* งวดนี้อยู่ในชุดของกระดิ่ง "ถึงรอบวางบิล" วันนี้ (ตัวกรอง `soon`) — ผู้เรียกถามตัวคัดของกระดิ่งแล้วส่งมา
       (`billingRemind` · ดูหัวข้อรอบวางบิลข้างบน) · ไม่ส่ง = ไม่อยู่ในชุด (ตัวกรองว่าง ไม่เดาเอง) */
    billingSoon: Boolean(billingRemind),
    /* ── ช่วงบริการที่งวดนี้ครอบ (mig 0320 · มติผู้ใช้ 2026-08-30) ────────────
       ⚠️ **ต้องอยู่ในรายชื่อนี้ถึงจะถึงจอ** — ตัวนี้เป็น whitelist ไม่ได้ spread แถวดิบมา
       ค่าที่ลืมเติมจะหายเงียบ ๆ โดยไม่มี error ให้เห็น
       `serviceRounds` = ใบนี้เข้าเกณฑ์ "มีรอบบริการ" ไหม (สาย SERVICE + บรรทัดหมวด
       02-001 ≥1) — ผู้เรียกคำนวณมาให้ เพราะที่นี่ไม่มีบรรทัดของใบให้ดู */
    coversFrom: installment.coversFrom || null,
    coversTo: installment.coversTo || null,
    serviceRounds: Boolean(serviceRounds),
    paidOn: installment.paidOn || null,
    status,
    /* คืนเงินแล้ว (0378) — ค่าใน DB ยังเป็น confirmed แต่ในไฟล์/จอต้องไม่อ่านว่า "เก็บเงินแล้ว" */
    statusLabel: installmentRefunded(installment) ? 'คืนเงินแล้ว' : (LEDGER_STATUS[status]?.label || status),
    /* ⭐ เงินค้างจากใบที่ยกเลิก / คืนเงินแล้ว (PR3 · 0378) — whitelist: ลืมเติม = คิว "เงินค้าง" ว่างเงียบ ๆ
       ⚠️ อ่านจาก select('*') — ก่อนรัน 0378 คอลัมน์ไม่มี (undefined) ⇒ ยังไม่คืน · ช่องว่าง (ไม่พัง) */
    stranded: strandedInstallment(installment, order),
    refunded: installmentRefunded(installment),
    refundedAt: installment.refundedAt || null,
    refundedOn: installment.refundedOn || null,
    refundedByName: installment.refundedByName || '',
    refundReason: installment.refundReason || '',
    refundCreditNoteNo: installment.refundCreditNoteNo || '',
    /* เลยกำหนด = มีวันกำหนด ยังไม่ confirmed และวันนั้นผ่านไปแล้ว
       ⚠️ งวดที่ "รอบัญชีตรวจ" ก็เลยกำหนดได้ — เงินอาจเข้าแล้วแต่ยังไม่มีใครรับรอง
       ซึ่งเป็นภาระของบัญชี ไม่ใช่ของลูกค้า จึงต้องยังขึ้นธง */
    overdue: Boolean(due && status !== 'confirmed' && todayIso && String(due) < String(todayIso)),
    reportedByName: installment.reportedByName || '',
    confirmedByName: installment.confirmedByName || '',
    rejectedReason: installment.rejectedReason || '',
    evidenceCount: Array.isArray(installment.evidence) ? installment.evidence.length : 0,
    /* ⭐ ชื่อไฟล์หลักฐาน — คิวรับรองบนหน้าทะเบียนต้อง **โชว์หลักฐานก่อนให้กด**
       (มติผู้ใช้ 2026-08-13) ไม่งั้นคนกดคอนเฟิร์มโดยไม่เห็นสิ่งที่กำลังรับรอง
       ⚠️ เอาแค่ชื่อไฟล์ ไม่ส่ง path/URL — ทางเปิดไฟล์คือ route ที่ตรวจสิทธิ์เอง
       (`/api/sales-planning/sales-orders/[id]/payment-file?installment=&i=`) */
    evidence: (Array.isArray(installment.evidence) ? installment.evidence : [])
      .map((file, index) => ({ index, fileName: file?.fileName || `ไฟล์ ${index + 1}` })),
    /* ── ใบกำกับภาษีของงวด (mig 0348 · มติผู้ใช้ 2026-09-07) ────────────────
       ⚠️ **ตัวนี้เป็น whitelist ไม่ได้ spread แถวดิบมา** — ลืมเติมที่นี่แล้วค่าหาย
       เงียบ ๆ ทั้งจอ ทั้ง Excel ทั้งช่องค้น โดยไม่มี error ให้เห็น (คำเตือนของไฟล์เอง
       ข้างบน) · ค่างวดมาจาก `.select('*')` ⇒ คอลัมน์ใหม่ **มาถึง server เอง**
       ซึ่งทำให้หลงคิดว่าทำแค่ migration ก็พอ
       ⚠️ ส่งแค่ "มีไฟล์ไหม" ไม่ส่ง path — ทางเปิดไฟล์คือ route ที่ตรวจสิทธิ์เอง
       (`payment-file?installment=<id>&doc=tax_invoice`) */
    taxInvoiceNo: installment.taxInvoiceNo || '',
    taxInvoiceDate: installment.taxInvoiceDate || null,
    taxInvoiceFileName: installment.taxInvoiceFile?.fileName || '',
    hasTaxInvoiceFile: Boolean(installment.taxInvoiceFile?.storagePath),
    /* ⭐ ตัวล็อกของ PATCH งวด (optimistic lock · PR0) — คิวบนทะเบียนส่งค่านี้ของแถวที่ตาเห็นกลับไปทุกคำสั่ง
       ⚠️ whitelist: ลืมเติม = คำสั่งจากทะเบียนไม่มีตัวล็อก (เขียนทับงานของอีกหน้าต่างได้เงียบ ๆ) */
    updatedAt: installment.updatedAt || null,
  };
}

/**
 * งวดที่ **รอบัญชีรับรอง** — คิวงานที่ฝ่ายบัญชีเปิดหน้ามาเพื่อทำ (มติผู้ใช้ 2026-08-13)
 *
 * ⭐ *"คิวงาน ข อยู่บน ทะเบียน ก อยู่ล่าง"* — หน้านี้ถูกใช้เป็นคิวมาตลอดทั้งที่ชื่อ
 * "ทะเบียน" · แยกของที่ **ต้องทำวันนี้** ออกมาไว้บนสุด ส่วนทะเบียนเต็มไว้ค้นและดาวน์โหลด
 *
 * ⚠️ เรียง **เลยกำหนดก่อน แล้วยอดมากก่อน** — ต่างจากทะเบียนข้างล่างที่เรียงตามใบ
 * เพราะคิวตอบคำถาม "ทำอันไหนก่อน" ไม่ใช่ "ใบไหนเป็นยังไง"
 * ⚠️ นับจาก **แถวที่กรองแล้ว** เสมอ — ตัวกรองบนหน้าคุมทั้งคิวและทะเบียน ไม่งั้น
 * คนกรองดูลูกค้ารายเดียวแล้วคิวยังโชว์ของคนอื่นอยู่ = สองส่วนบนหน้าเดียวพูดคนละเรื่อง
 */
export function pendingConfirmations(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.status === 'reported')
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (Number(b.amount) || 0) - (Number(a.amount) || 0);
    });
}

/**
 * งวดที่ **เงินเข้าแล้วแต่ยังไม่มีใบกำกับ** — คิวที่สองของฝ่ายบัญชี (มติผู้ใช้ 2026-09-07)
 *
 * ⭐ แยกจาก `pendingConfirmations` โดยตั้งใจ: คนละงาน คนละจังหวะ และป้ายตัวเลขบนเมนู
 * นับคิวแรกอยู่ ⇒ เอามารวมกันเมื่อไร เลขบนเมนูจะไม่ตรงกับของที่เห็นตอนกดเข้าไป
 * ⚠️ เรียงงวดเก่าก่อน (วันที่จ่ายจริง แล้วค่อยกำหนดชำระ) — ของค้างที่นานที่สุดต้องขึ้นก่อน
 */
export function pendingTaxInvoices(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && ledgerInvoicePending(row))
    .sort((a, b) => String(a.paidOn || a.dueDate || '9999').localeCompare(String(b.paidOn || b.dueDate || '9999')));
}

/**
 * คิว **"เงินค้างจากใบที่ยกเลิก"** — คิวที่สามของฝ่ายบัญชี (PR3 · mig 0378 · มติ D4)
 *
 * ⭐ ของที่ต้องตัดสิน: ยกเข้าใบใหม่ของดีลเดียวกัน (ที่ใบใหม่ — AE Sup/บัญชี) หรือบันทึกคืนเงินลูกค้า (ที่นี่/ที่ใบเดิม)
 * ⚠️ แยกจากคิวรับรองโดยตั้งใจ — งวด reported ของใบยกเลิกอยู่ทั้งสองคิว (บัญชีรับรอง/ตีกลับได้ตามเดิม) ป้ายตัวเลขบนเมนู
 *   นับคิวรับรองอยู่ ⇒ รวมกันเมื่อไรเลขบนเมนูไม่ตรงกับของที่เห็น
 * ⚠️ เรียงตามใบแล้วเลขงวด — คนตามเงินค้างไล่ทีละใบ (ไม่ใช่ตามความด่วน · ไม่มีวันครบกำหนดให้ตาม)
 */
export function pendingStranded(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.stranded)
    .sort((a, b) => String(a.orderNumber || '').localeCompare(String(b.orderNumber || ''))
      || (Number(a.seq) || 0) - (Number(b.seq) || 0));
}

/**
 * นิยามคอลัมน์ของไฟล์ Excel (รายงวด)
 *
 * ⚠️ **ตารางบนเว็บไม่ได้อ่านตัวนี้** (ตรวจ 26/09) — บนจอเป็นหนึ่งใบหนึ่งแถว คอลัมน์เขียนมือใน
 * `app/finance/payments/page.js` ⇒ เพิ่มคีย์ที่นี่ = ได้แค่ในไฟล์ · จะเห็นบนจอต้องมีค่าระดับใบใน
 * `groupLedgerByOrder` + `<th>`/`<td>` ของหน้าเอง (หัวไฟล์ข้างบนเขียนไว้ตั้งแต่ยุคที่ยังเป็นตารางรายงวด)
 *
 * `money` / `num` / `date` บอก Excel ว่าจะจัดรูปเซลล์ยังไง (ดู lib/tax/exportExcel.js
 * ซึ่งเป็นตัวเขียน .xlsx กลาง — อยู่ใต้โฟลเดอร์ tax เพราะเขียนที่นั่นก่อน แต่ไม่ผูกกับภาษี)
 */
export const LEDGER_COLUMNS = [
  { key: 'orderNumber', label: 'เลขที่ SO' },
  { key: 'quoteNumber', label: 'อ้างอิง QT' },
  /* เอกสารอ้างอิง (PO ลูกค้า) — อยู่ในไฟล์ด้วยเพราะบัญชีกระทบยอดกับ PO ของลูกค้า
     ไม่ใช่กับเลข SO ของเรา · ใบที่ลูกค้าไม่ได้ออก PO ได้ช่องว่าง ซึ่งถูกแล้ว */
  { key: 'referenceDoc', label: 'เอกสารอ้างอิง' },
  { key: 'customerName', label: 'ลูกค้า' },
  { key: 'seq', label: 'งวดที่', num: true },
  { key: 'label', label: 'รายละเอียดงวด' },
  { key: 'percent', label: 'สัดส่วน (%)', num: true },
  { key: 'amount', label: 'ยอดงวด', money: true },
  /* วันวางบิลรายงวด (mig 0389 · ม็อก D: "วางต่อจากยอดงวด ก่อนกำหนดชำระ") — บนจอเห็นแค่ "วางบิลถัดไป" ของทั้งใบ
     ⇒ รายงวดครบอยู่ในไฟล์นี้ · สถานะเป็นคำ (`billingStatusLabel`) ไม่ใช่ธง boolean (ลง Excel เป็น TRUE/FALSE)
     ⚠️ สถานะแบบ "อีก n วัน" นับจากวันที่ดาวน์โหลด (ชื่อไฟล์ประทับวันไว้แล้ว) */
  { key: 'billingDate', label: 'วันวางบิล', date: true },
  { key: 'billingStatusLabel', label: 'สถานะวางบิล' },
  { key: 'dueDate', label: 'กำหนดชำระ', date: true },
  /* ช่วงบริการที่งวดครอบ (mig 0320) — ต้องอยู่ในไฟล์ด้วย ไม่ใช่เห็นแต่บนจอ:
     บัญชีกรอง "สายของงาน = ใบมีรอบบริการ" แล้วโหลดไฟล์ ข้อมูลชุดที่เป็นเหตุผลของ
     การกรองนั้นต้องติดไปด้วย (หัวไฟล์นี้เขียนกฎไว้เองว่าจอกับไฟล์ห้ามพูดคนละเรื่อง)
     ⚠️ ใบสายสินค้าได้ช่องว่าง ซึ่งถูกแล้ว — ไม่ใช่ทุกใบที่มีช่วงครอบ */
  { key: 'coversFrom', label: 'ครอบบริการตั้งแต่', date: true },
  { key: 'coversTo', label: 'ครอบบริการถึง', date: true },
  { key: 'paidOn', label: 'วันที่จ่ายจริง', date: true },
  { key: 'statusLabel', label: 'สถานะ' },
  { key: 'reportedByName', label: 'ผู้แจ้งชำระ' },
  { key: 'confirmedByName', label: 'ผู้รับรอง (บัญชี)' },
  /* ใบกำกับภาษี (mig 0348) — ต้องอยู่ในไฟล์ด้วย ไม่ใช่เห็นแต่บนจอ: บัญชีกระทบยอด
     VAT จากไฟล์นี้ และ "งวดไหนยังไม่ออกใบ" คือของค้างที่ต้องเคลียร์ทุกงวด
     ⚠️ เลขที่ **ห้ามใส่ flag** — ใส่ `date:true` จะยัด numFmt วันที่ทับข้อความ */
  { key: 'taxInvoiceNo', label: 'เลขที่ใบกำกับภาษี' },
  { key: 'taxInvoiceDate', label: 'วันที่ใบกำกับภาษี', date: true },
  /* คืนเงินของงวดใบที่ยกเลิก (0378) — บัญชีกระทบยอดคืนเงิน/ใบลดหนี้จากไฟล์นี้ด้วย · ⚠️ เลขที่ห้ามใส่ `date` */
  { key: 'refundedOn', label: 'วันที่คืนเงิน', date: true },
  { key: 'refundCreditNoteNo', label: 'เลขที่ใบลดหนี้' },
];

/**
 * ยอดรวมของชุดแถวที่กรองแล้ว
 *
 * ⚠️ `collected` นับเฉพาะ confirmed · `awaiting` คือเงินที่ SA บอกว่าเข้าแล้วแต่บัญชี
 * ยังไม่รับรอง ซึ่งเป็น **คิวงานของบัญชี** ไม่ใช่ยอดที่เก็บได้ ⇒ แยกช่องกันคนละช่อง
 */
export function ledgerSummary(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const sum = (pick) => list.filter(pick).reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  return {
    count: list.length,
    totalAmount: sum(() => true),
    // เก็บได้ = confirmed ที่ยังไม่คืนเงิน (PR3) — เงินที่คืนลูกค้าไปแล้วไม่ใช่เงินที่เก็บได้
    collectedAmount: sum(collectedRow),
    awaitingAmount: sum((r) => r.status === 'reported'),
    outstandingAmount: sum((r) => r.status !== 'confirmed'),
    overdueCount: list.filter((r) => r.overdue).length,
    overdueAmount: sum((r) => r.overdue),
    awaitingCount: list.filter((r) => r.status === 'reported').length,
    /* ⭐ ของค้าง "เงินเข้าแล้วแต่ยังไม่มีใบกำกับ" (มติผู้ใช้ 2026-09-07 — บริษัทเก็บ VAT
       ⇒ ทุกงวดที่ลูกค้าจ่ายต้องมีใบ) · เป็น **คิวที่สอง** ของฝ่ายบัญชี คนละแกนกับคิว
       "รอรับรอง" ⇒ ต้องเป็นตัวเลขของตัวเอง ไม่ใช่เอาไปบวกรวมกัน */
    missingInvoiceCount: list.filter(ledgerInvoicePending).length,
    missingInvoiceAmount: sum(ledgerInvoicePending),
    /* ⭐ เงินค้างจากใบที่ยกเลิก / คืนเงินแล้ว (PR3 · 0378) — ตัวเลขของตัวเอง (คนละแกนกับค้างรับ) */
    strandedCount: list.filter((r) => r.stranded).length,
    strandedAmount: sum((r) => r.stranded),
    refundedCount: list.filter((r) => r.refunded).length,
    refundedAmount: sum((r) => r.refunded),
    /* ⭐ รอบวางบิล (mig 0389) — การ์ด "ถึงรอบวางบิล 7 วัน" อ่านคู่แรก · สามตัวนับเป็นตัวเลขของตัวเอง
       คนละแกนกับ "เลยกำหนด" (อันนั้นอ่านกำหนดชำระ) ⇒ ห้ามบวกรวมกัน */
    billingIn7DaysCount: list.filter((r) => r.billingIn7Days).length,
    billingIn7DaysAmount: sum((r) => r.billingIn7Days),
    billingThisMonthCount: list.filter((r) => r.billingThisMonth).length,
    billingLateCount: list.filter((r) => r.billingLate).length,
    billingLateAmount: sum((r) => r.billingLate),
  };
}

/* ── สถานะการเก็บเงินระดับ "ใบ" ───────────────────────────────────────────
   คำถามแรกของบัญชีคือ *"ใบไหนยังเก็บไม่ครบ"* ซึ่งเป็นคุณสมบัติของ **ใบ** ไม่ใช่ของงวด
   ⇒ กรองด้วยสถานะงวดตอบไม่ได้ (ใบที่เก็บครบแล้วยังมีงวดสถานะ confirmed อยู่ดี)

   ⭐ **กรองที่ API ไม่ใช่ที่หน้าเว็บ** — ทะเบียนนี้สัญญาไว้ว่าไฟล์ Excel ที่ดาวน์โหลด
   คือของที่เห็นบนจอ · กรองระดับใบไว้ฝั่งหน้าเว็บอย่างเดียวเมื่อไร ไฟล์กับจอจะคนละชุด
   ทันที และตัวเลขสรุปด้านบนก็จะนับของที่ตาไม่เห็น */
export const ORDER_STATE_OPEN = 'open';
export const ORDER_STATE_DONE = 'done';
/* ใบที่ยกเลิก/ถูกออก Rev. ทับ (review F2) — ไม่มีงานเก็บเงินต่อ · แถวที่เหลือคือเงินค้าง/คืนเงินแล้ว/รอบัญชีตรวจ
   🐞 เดิมงวดโมฆะถูกตัดก่อนทำดัชนี (PR0) แล้วที่เหลือเป็น confirmed ล้วน ⇒ ใบยกเลิกถูกจัดเป็น "เก็บครบแล้ว"
     (ขัดกับป้ายของก้อนที่บอก "เงินค้าง"/"คืนเงินแล้ว") · ถอดออกจากดัชนีเฉย ๆ ก็ถอยไป "ยังเก็บไม่ครบ" = ผิดอีกทาง */
export const ORDER_STATE_DEAD = 'dead';

export const LEDGER_ORDER_STATES = {
  [ORDER_STATE_OPEN]: 'ยังเก็บไม่ครบ',
  [ORDER_STATE_DONE]: 'เก็บครบแล้ว',
  [ORDER_STATE_DEAD]: 'ใบยกเลิก/ถูกแทนแล้ว',
};

/**
 * ดัชนี id ใบ → สถานะการเก็บเงินของทั้งใบ
 *
 * ⚠️ ต้องคิดจากงวด **ทั้งหมดก่อนกรอง** เสมอ · เก็บครบ = ทุกงวดของใบ `confirmed`
 * (กติกา mig 0245 — `reported` ยังไม่นับว่าเก็บได้)
 */
/**
 * "จ่ายถึง" รายใบ — คิดจาก **งวดทั้งหมดของใบก่อนกรอง** แล้วประทับลงทุกแถวของใบนั้น
 *
 * ⭐ เหตุผลเดียวกับ `orderStateIndex` เป๊ะ: เป็นค่าระดับ **ใบ** ที่ตารางเอาไปแสดง
 * บนแถวที่ยุบแล้ว ⇒ คิดจากแถวที่เหลือหลังกรองเมื่อไร ค่าจะเพี้ยนตามตัวกรองที่ไม่เกี่ยวกัน
 * (กรอง "สถานะงวด = รอชำระ" แล้วงวด confirmed หลุดหมด ⇒ "ยังไม่ครอบ" ทั้งที่เงินครอบอยู่)
 *
 * ⚠️ ประทับลงแถว (`orderPaidThrough`) แทนการส่ง Map ไปถึง `groupLedgerByOrder` เพราะ
 * การจัดกลุ่มเกิด **ฝั่งจอ** หลังข้อมูลเดินทางข้าม API มาแล้ว — ส่ง Map ข้าม JSON ไม่ได้
 * และค่านี้เป็นของใบ ทุกแถวของใบเดียวกันจึงถือค่าเดียวกันโดยนิยาม
 */
export function stampOrderPaidThrough(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const byOrder = new Map();
  for (const row of list) {
    if (!row?.orderId) continue;
    const group = byOrder.get(row.orderId) || [];
    group.push(row);
    byOrder.set(row.orderId, group);
  }
  for (const [, group] of byOrder) {
    const through = paidThrough(group);
    for (const row of group) row.orderPaidThrough = through;
  }
  return list;
}

/**
 * จำนวนงวดของทั้งใบ — ประทับ `orderInstallmentCount` จาก **ชุดก่อนกรอง** (กติกาเดียวกับ `stampOrderPaidThrough`)
 *
 * 🐞 (review S5 · 26/09) คำรองใต้ช่อง "งวด" เคยนับจากงวดที่เหลือหลังกรอง ⇒ ทางเข้าหลักของรอบวางบิล (กระดิ่ง FN +
 *   การ์ด "ถึงรอบวางบิล 7 วัน" เปิด `?billing=7d`) มักเหลือใบละงวดเดียว แล้วแทบทุกแถว — รวมใบ 12 งวด —
 *   ขึ้น "0/1 · ชำระครั้งเดียว" · ม็อก D: กรองอยู่แล้วเห็นไม่ครบ = "แสดง n จาก m งวด" (`groupInstallmentNote`)
 * ⚠️ นับหลังตัดงวดโมฆะ (route ตัดก่อนเรียก) — งวดโมฆะไม่ใช่งวดของใบอีกต่อไป (เหตุผลเดียวกับ orderStateIndex)
 */
export function stampOrderInstallmentCount(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const counts = new Map();
  for (const row of list) {
    if (!row?.orderId) continue;
    counts.set(row.orderId, (counts.get(row.orderId) || 0) + 1);
  }
  for (const row of list) {
    if (row?.orderId) row.orderInstallmentCount = counts.get(row.orderId);
  }
  return list;
}

/**
 * ภาพหลังรับรอง (`installmentConfirmOutlook`) ของงวดที่ **รอบัญชีรับรอง** — ประทับจากงวดทั้งใบก่อนกรอง
 *
 * ⭐ เหตุผลเดียวกับ `stampOrderPaidThrough`: โมดัลรับรองเปิดจากคิวบนหน้านี้ ซึ่งเห็นแค่แถวที่ผ่านตัวกรอง ⇒
 *   กดการ์ด "รอบัญชีรับรอง" (กรองสถานะ = reported) เมื่อไร งวดถัดไป (ยังไม่จ่าย) กับงวดที่รับรองแล้วหลุดทั้งหมด
 *   แล้วโมดัลจะบอก "จ่ายถึง" / "เก็บแล้ว" / "งวดถัดไป" ผิดตามตัวกรองที่ไม่เกี่ยวกัน
 * ⚠️ ประทับเฉพาะงวด `reported` (งวดเดียวที่กดรับรองได้) — แถวอื่นไม่ต้องพกก้อนนี้ข้าม API
 */
export function stampConfirmOutlook(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const byOrder = new Map();
  for (const row of list) {
    if (!row?.orderId) continue;
    const group = byOrder.get(row.orderId) || [];
    group.push(row);
    byOrder.set(row.orderId, group);
  }
  for (const [, group] of byOrder) {
    for (const row of group) {
      if (row.status === 'reported') row.confirmOutlook = installmentConfirmOutlook(row, group);
    }
  }
  return list;
}

/**
 * ป้าย "ปรับแผนหลังอนุมัติ" ของใบ (PR2 · mig 0377 · มติ D5) — ประทับ `orderReplanned` ลงทุกแถวของใบ
 *
 * ⭐ ไม่เก็บข้อมูลเพิ่ม: เทียบงวดของใบกับแผนของ QT ด้วย `installmentsReplanned` ตัวเดียวกับแผงงวดบนใบ
 * ⚠️ ค่าระดับใบ ⇒ ต้องประทับจาก **ชุดก่อนกรอง** (กติกาเดียวกับ `stampOrderPaidThrough`) — กรองแล้วงวดหลุด
 *   จำนวนงวดไม่ตรงแผนทันที = ป้ายขึ้นผิดทุกใบที่ถูกตัวกรองหั่น
 * ⚠️ ไม่ประทับ: ใบย้อนหลัง (ไม่มี QT — แผนว่างอ่านเป็น "ชำระเต็มจำนวน") · ใบยกเลิก/ถูกออก Rev. ทับ
 *   (แถวโมฆะถูกตัดตั้งแต่ PR0 ⇒ ชุดไม่ครบ) · ใบที่ไม่รู้แผน (QT ไม่อยู่ในชุดที่โหลด)
 * @param planByQuotation Map|object ของ quotationId → paymentPlan
 */
export function stampOrderReplanned(rows = [], planByQuotation = new Map()) {
  const list = Array.isArray(rows) ? rows : [];
  const planOf = (id) => (planByQuotation instanceof Map ? planByQuotation.get(id) : planByQuotation?.[id]);
  const byOrder = new Map();
  for (const row of list) {
    if (!row?.orderId) continue;
    const group = byOrder.get(row.orderId) || [];
    group.push(row);
    byOrder.set(row.orderId, group);
  }
  for (const [, group] of byOrder) {
    const head = group[0];
    const plan = head.quotationId ? planOf(head.quotationId) : undefined;
    const replanned = !isHistoricalOrder({ origin: head.origin }) && !head.orderDead && plan !== undefined
      && installmentsReplanned(group, plan, head.orderTotal);
    for (const row of group) row.orderReplanned = Boolean(replanned);
  }
  return list;
}

export function orderStateIndex(rows = []) {
  const tally = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.orderId) continue;
    const current = tally.get(row.orderId) || { total: 0, confirmed: 0, dead: false };
    current.total += 1;
    // เก็บได้ = confirmed ที่ยังไม่คืนเงิน (กติกาเดียวกับ collectedRow) · ใบที่ตายแล้ว = สถานะของตัวเอง (review F2)
    if (collectedRow(row)) current.confirmed += 1;
    if (row.orderDead) current.dead = true;
    tally.set(row.orderId, current);
  }
  const states = new Map();
  for (const [orderId, { total, confirmed, dead }] of tally) {
    states.set(orderId, dead ? ORDER_STATE_DEAD
      : total > 0 && confirmed === total ? ORDER_STATE_DONE : ORDER_STATE_OPEN);
  }
  return states;
}

/**
 * กรองทะเบียน — ทุกตัวกรองว่าง = ไม่กรอง
 *
 * ⚠️ ช่วงวันที่กรองที่ **กำหนดชำระ** ไม่ใช่วันที่จ่ายจริง เพราะคำถามหลักของบัญชีคือ
 * "เดือนนี้ต้องเก็บอะไรบ้าง" · งวดที่ยังไม่มีกำหนดจะหลุดช่วงเสมอ ซึ่งถูกแล้ว —
 * มันยังไม่ถูกนัดว่าจะเก็บเมื่อไร (ต้องไปตามที่ใบ ไม่ใช่ในรายงานรอบเดือน)
 */
export function filterLedger(rows = [], {
  status = [], from = null, to = null, q = '', overdueOnly = false,
  orderState = [], orderStates = null, line = [], taxInvoice = '', billing = '',
} = {}) {
  const wanted = Array.isArray(status) ? status.filter(Boolean) : [];
  /* รอบวางบิล (mig 0389) — soon | 7d | month | late · ค่าที่ไม่รู้จัก = ไม่กรอง
     ⚠️ ตัวกรองนี้ตัดงวดที่ยังไม่มีวันวางบิลออกตามความหมาย ⇒ ผู้เรียกต้องบอกส่วนที่ซ่อน (`ledgerBillingTally`) */
  const billingFilter = ledgerBillingFilter(billing);
  const wantedOrders = Array.isArray(orderState) ? orderState.filter(Boolean) : [];
  /* สายของงาน — ค่าที่รับคือ 'service' (ใบที่เข้าเกณฑ์มีรอบบริการ) กับ 'other' (ที่เหลือ)
     ⚠️ **ไม่ใช่ตัวกรองสายธุรกิจดิบ** — เกณฑ์เต็มคือ สาย SERVICE **และ** มีบรรทัดหมวด
     02-001 (มติผู้ใช้ 2026-08-30) ⇒ ใบสาย SERVICE ที่ไม่มีแพ็คเกจบริการจะอยู่ถัง 'other'
     เหมือนใบสายสินค้า เพราะมันไม่มีรอบบริการให้เงินไปครอบ */
  const wantedLines = Array.isArray(line) ? line.filter(Boolean) : [];
  const needle = String(q || '').trim().toLowerCase();
  return (Array.isArray(rows) ? rows : []).filter((r) => {
    if (wanted.length && !wanted.includes(r.status)) return false;
    if (wantedLines.length && !wantedLines.includes(r.serviceRounds ? 'service' : 'other')) return false;
    /* ⚠️ สถานะระดับ **ใบ** ต้องมาจากดัชนีที่คิดจากงวดทั้งหมดของใบ (`orderStateIndex`)
       ไม่ใช่จากงวดที่เหลือหลังกรอง — กรองสถานะงวดเป็น "รอชำระ" เมื่อไร ทุกใบจะดู
       เหมือนยังเก็บไม่ครบทันที ทั้งที่บางใบเก็บครบไปแล้ว */
    if (wantedOrders.length && !wantedOrders.includes(orderStates?.get(r.orderId) || ORDER_STATE_OPEN)) return false;
    if (overdueOnly && !r.overdue) return false;
    /* ใบกำกับภาษี: 'missing' = เงินเข้า/แจ้งแล้วแต่ยังไม่มีเลข · 'issued' = มีแล้ว
       ⚠️ ว่าง = ไม่กรอง (ค่าที่ไม่รู้จักก็ไม่กรอง — ตัวกรองที่พิมพ์ผิดใน URL ต้องไม่
       ทำให้ทะเบียนว่างเปล่าโดยไม่มีคำอธิบาย) */
    // ⚠️ เกณฑ์เดียวกับตัวนับ (ledgerSummary · คิว) — งวดที่คืนเงินแล้วไม่ใช่ของค้างเอกสาร (review F1)
    if (taxInvoice === 'missing' && !ledgerInvoicePending(r)) return false;
    if (taxInvoice === 'issued' && !String(r.taxInvoiceNo || '').trim()) return false;
    // ธงคิดมาจาก `ledgerRow` ครั้งเดียว (วันนี้ของนาฬิกาไทย) — ตัวนับบนการ์ด/แผงตัวกรองอ่านธงชุดเดียวกัน
    // `soon` = ชุดของกระดิ่งเป๊ะ (ธงมาจากตัวคัดของกระดิ่ง ที่ route)
    if (billingFilter === 'soon' && !r.billingSoon) return false;
    if (billingFilter === '7d' && !r.billingIn7Days) return false;
    if (billingFilter === 'month' && !r.billingThisMonth) return false;
    if (billingFilter === 'late' && !r.billingLate) return false;
    /* ⚠️ **งวดที่ยังไม่มีกำหนดชำระถูกตัดออกเมื่อกรองช่วงวัน** — และนั่นถูกต้องตาม
       ความหมายของตัวกรอง ("ครบกำหนดในช่วงนี้") แต่มัน **เงียบ** ไม่ได้: `ledgerSummary`
       คิดจากแถวที่เหลือ ⇒ ยอดค้างบนหัวจอลดลงตามโดยไม่มีอะไรบอก และงวดไม่มีวันกำหนด
       คือสถานะปกติ ไม่ใช่ข้อมูลเสีย (QT ไม่มีวันมาให้ SA กรอกเองทีละงวด)
       ⇒ ผู้เรียกต้องรายงานส่วนที่ถูกซ่อนด้วย `undatedHiddenBy()` (ดูข้างล่าง)
       🐞 คลาสเดียวกับตัวกรองปีของ /mgmt ที่เคยกลืนแถวไม่มีวันที่ (#1257) */
    if (from && (!r.dueDate || String(r.dueDate) < String(from))) return false;
    if (to && (!r.dueDate || String(r.dueDate) > String(to))) return false;
    if (needle) {
      /* ⚠️ `referenceDoc` อยู่ในชุดค้นด้วย — เหตุผลเดียวกับตารางรายการ SO
         (IS-26080017): คำถามที่เข้ามาจริงคือ "PO เลขนี้ใบไหน เก็บถึงไหนแล้ว" */
      /* ⚠️ `taxInvoiceNo` อยู่ในชุดค้นด้วย — กฎ "ตาเห็นบนแถว = ต้องค้นเจอ" และคำถาม
         จริงของบัญชีคือ "ใบกำกับเลขนี้เป็นของงวดไหน" (เหมือนที่ถามด้วยเลข PO) */
      /* ⚠️ ป้าย "ใบย้อนหลัง" / "งวดยกมา" ที่คิวโชว์บนแถวต้องค้นเจอด้วย (มติ 22/09 · ตาเห็น = ต้องค้นเจอ) */
      /* ⚠️ รอบวางบิลแบบย่อใต้ชื่อลูกค้า (0389) ค้นเจอด้วย — "วางบิลทุกวันที่ 5" หา "ลูกค้าที่วางบิลวันที่ 5 ทั้งหมด" ได้
         · ยังไม่ตั้ง = คำเดียวกับที่แถวโชว์ ⇒ FN ค้น "ยังไม่ตั้งรอบ" หาลูกค้าที่ต้องตามให้ตั้งได้
         ⚠️ ข้อความรอบค้นแบบ substring ⇒ เลขเปล่า "25" ติดทุกลูกค้าที่ "เงินเข้า 25" ด้วย — รับได้ (คำค้นกว้างก็ได้ผลกว้าง)
         · คำในเซลล์ "วางบิลถัดไป" (ชื่อเหตุการณ์ · ขอใบแล้ว/ยังไม่ขอ) ค้นเจอด้วย — `billingSearchWords` */
      const hay = [r.orderNumber, r.quoteNumber, r.referenceDoc, r.customerName, r.customerCode,
        r.label, r.taxInvoiceNo, r.historicalRefs, r.billingRuleText || LEDGER_BILLING_RULE_UNSET, ...billingSearchWords(r),
        isHistoricalOrder(r) ? LEDGER_HISTORICAL_TAG : '', isOpeningInstallment(r) ? OPENING_INSTALLMENT_LABEL : '',
        r.orderStatus === 'cancelled' ? LEDGER_CANCELLED_TAG : '']
        .join(' ').toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * งวดที่ **หายไปเพราะตัวกรองช่วงวัน** ทั้งที่ผ่านตัวกรองอื่นครบ — คือกลุ่มที่ยังไม่มี
 * กำหนดชำระ (`dueDate` ว่าง)
 *
 * ⭐ มีไว้ให้หน้าจอบอกผู้ใช้ว่า "ยังมีอีก N งวด ยอด X ที่ไม่ได้นับเพราะยังไม่กำหนดวัน"
 * — ตัวเลขที่หายต้องมีที่อยู่ ไม่งั้นบัญชีกรองดูเดือนหนึ่งแล้วเชื่อว่ายอดค้างมีเท่านั้น
 *
 * ⚠️ คิดจาก **ตัวกรองชุดเดียวกันแต่ถอดช่วงวันออก** ไม่ใช่จากทั้งทะเบียน — ไม่งั้น
 * ตอนกรองลูกค้ารายเดียวจะไปนับงวดของลูกค้ารายอื่นมารวมด้วย
 *
 * @returns {{count: number, amount: number}} 0/0 = ไม่ได้กรองช่วงวัน หรือไม่มีอะไรถูกซ่อน
 */
export function undatedHiddenBy(rows = [], filters = {}) {
  if (!filters.from && !filters.to) return { count: 0, amount: 0 };
  const withoutRange = filterLedger(rows, { ...filters, from: null, to: null })
    .filter((r) => !r.dueDate);
  return {
    count: withoutRange.length,
    amount: Math.round(withoutRange.reduce((sum, r) => sum + (Number(r.amount) || 0), 0) * 100) / 100,
  };
}

/**
 * ตัวนับของกลุ่มตัวกรอง "รอบวางบิล" + งวดที่ตัวกรองนั้นซ่อน (mig 0389 · ม็อก D)
 *
 * ⭐ คิดจาก **ตัวกรองชุดเดียวกันแต่ถอดรอบวางบิลออก** — เหตุผลเดียวกับ `undatedHiddenBy`:
 *   · ตัวนับบนตัวเลือก ("ถึงรอบเดือนนี้ (4)") ต้องไม่ศูนย์เพราะกำลังกรอง "7 วัน" อยู่ และต้องไม่นับลูกค้ารายอื่น
 *     ตอนกรองลูกค้ารายเดียว
 *   · `hidden` = งวดที่ยังมีงานวางบิลแต่ **ยังไม่มีวันวางบิล** ซึ่งตัวกรองตัดทิ้งตามความหมาย แต่ยอดสรุปคิดจากแถว
 *     ที่เหลือ ⇒ ต้องบอกว่าซ่อนไปเท่าไร (🐞 คลาสเดียวกับ #1257)
 *   ⚠️ นับเฉพาะงวดที่ "ควรมีวันแต่ไม่มี": รอเหตุการณ์ (มีงานวางบิลแน่ แค่ยังไม่รู้วัน) หรือ **ลูกค้ามีรอบแล้ว** แต่งวดยังไม่ได้เลือกวัน
 *     ⇒ ไม่นับงวดของลูกค้าที่ไม่มีรอบและไม่มีใครเลือกอะไร — นั่นคือสถานะปกติ ("บางที่ไม่มีรอบวาง" · คำตอบเจ้าของข้อ 2 ·
 *     ใบเก่าไม่ถูกเติมย้อนหลัง มติข้อ 10) นับเมื่อไร FN เปิดจากกระดิ่งทุกครั้งเจอ "ซ่อน 300+ งวด" ถาวร อ่านเหมือนเงินหาย
 * @returns {{counts: {soon: number, '7d': number, month: number, late: number}, hidden: {count: number, amount: number}}}
 */
export function ledgerBillingTally(rows = [], filters = {}) {
  const base = filterLedger(rows, { ...filters, billing: '' });
  const undated = ledgerBillingFilter(filters.billing)
    ? base.filter((r) => billingOpenKey(r.billingStateKey) && !r.billingDate
      && (String(r.billingEvent || '').trim() || String(r.billingRuleText || '').trim()))
    : [];
  return {
    counts: {
      soon: base.filter((r) => r.billingSoon).length,
      '7d': base.filter((r) => r.billingIn7Days).length,
      month: base.filter((r) => r.billingThisMonth).length,
      late: base.filter((r) => r.billingLate).length,
    },
    hidden: {
      count: undated.length,
      amount: Math.round(undated.reduce((sum, r) => sum + (Number(r.amount) || 0), 0) * 100) / 100,
    },
  };
}

/**
 * เรียงลำดับตั้งต้น — **ของที่ต้องทำก่อนอยู่บนสุด**
 *
 * เลยกำหนด → รอบัญชีตรวจ → ที่เหลือเรียงตามกำหนดชำระ · งวดที่ยังไม่มีกำหนดไปท้ายสุด
 * (ไม่ใช่บนสุดแบบที่ค่าว่างมักจะเป็น) เพราะมันยังไม่ถูกนัด จึงยังไม่ใช่งานของสัปดาห์นี้
 */
export function sortLedger(rows = []) {
  const rank = (r) => (r.overdue ? 0 : r.status === 'reported' ? 1 : 2);
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank) return byRank;
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return String(a.dueDate) < String(b.dueDate) ? -1 : 1;
    }
    if (a.orderNumber !== b.orderNumber) return a.orderNumber < b.orderNumber ? -1 : 1;
    return (a.seq || 0) - (b.seq || 0);
  });
}

/** ชุดข้อมูลสำหรับตัวเขียน .xlsx กลาง — รูปเดียวกับที่รายงานภาษีใช้ */
export function ledgerReport(rows = [], { title = 'ทะเบียนการชำระ (ทุกใบสั่งขาย)' } = {}) {
  const summary = ledgerSummary(rows);
  return {
    title,
    columns: LEDGER_COLUMNS,
    rows,
    summary: {
      _label: `รวม ${summary.count} งวด`,
      amount: summary.totalAmount,
    },
  };
}

/**
 * จับงวดของ **ใบเดียวกัน** มารวมเป็นก้อนเดียว (มติผู้ใช้ 2026-08-13)
 *
 * > *"อยากกรุป SO เลขเดียวกัน แล้วเปิดขยาย"*
 *
 * ⭐ ทะเบียนนี้เรียงตาม **ความด่วนของงวด** ⇒ งวดของใบเดียวกันกระจายอยู่คนละที่ของ
 * ตารางได้ (งวด 1 เลยกำหนดอยู่บนสุด งวด 2 รอชำระอยู่ล่างสุด) · บัญชีที่กำลังโทรตาม
 * ลูกค้ารายหนึ่งต้องกวาดตาทั้งหน้าเพื่อประกอบภาพของใบเดียว
 *
 * ⚠️ **ความด่วนของก้อน = ความด่วนของงวดที่ด่วนที่สุดในก้อน** ไม่ใช่ค่าเฉลี่ย —
 * ใบที่มีงวดเลยกำหนดหนึ่งงวดต้องอยู่บนสุด ไม่ว่างวดอื่นจะเรียบร้อยแค่ไหน
 * ⚠️ จัดกลุ่มด้วย `orderId` ไม่ใช่ `orderNumber` — เลขที่ซ้ำกันได้ข้ามฉบับแก้ (Rev.)
 * และแถวที่ใบถูกลบไปแล้วจะไม่มีเลขที่เลย
 */
/* วางบิลถัดไปของก้อน — ดูเหตุผลที่ช่อง `nextBilling` ใน `groupLedgerByOrder` · เสมอกันที่วัน = งวดที่น้อยกว่าก่อน */
function nextBillingOf(rows) {
  const pending = rows
    .filter((r) => r.billingDate && billingOpenKey(r.billingStateKey) && !(r.billingRequested && (r.billingDays ?? 0) < 0))
    .sort((a, b) => String(a.billingDate).localeCompare(String(b.billingDate)) || (a.seq || 0) - (b.seq || 0));
  const row = pending[0];
  if (!row) return null;
  return {
    id: row.id,
    seq: row.seq,
    label: row.label || '',
    billingDate: row.billingDate,
    state: { key: row.billingStateKey || 'none', days: row.billingDays ?? null },
    requested: Boolean(row.billingRequested),
  };
}

export function groupLedgerByOrder(rows = []) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const key = row.orderId || row.orderNumber || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        quotationId: row.quotationId,
        quoteNumber: row.quoteNumber,
        // เอกสารอ้างอิง (PO ลูกค้า) — ค่าระดับ **ใบ** ทุกงวดพกค่าเดียวกันมา
        referenceDoc: row.referenceDoc || '',
        customerName: row.customerName,
        customerCode: row.customerCode,
        // รอบวางบิลของลูกค้า (0389) — ค่าระดับลูกค้า ทุกงวดพกค่าเดียวกันมา · id ไว้ทำลิงก์ "ตั้งรอบ"
        customerId: row.customerId || null,
        billingRuleText: row.billingRuleText || '',
        orderStatus: row.orderStatus,
        financeStatus: row.financeStatus,
        // ผู้ดูแลมาจากดีลของใบ (ดู `ledgerRow`) — ใช้จัดกลุ่ม "ผู้ดูแล (AE)"
        ownerId: row.ownerId || null,
        ownerName: row.ownerName || '',
        team: row.team || null,
        // ใบนี้เข้าเกณฑ์ "มีรอบบริการ" ไหม — ค่าของทั้งใบ ทุกงวดพกค่าเดียวกันมา
        serviceRounds: Boolean(row.serviceRounds),
        // เลขใบกำกับเดิม (Express) ของใบย้อนหลัง — คอลัมน์ใบกำกับบอกว่างวดยกมาออกใบที่ไหน
        historicalInvoiceRef: row.historicalInvoiceRef || '',
        // ป้าย "ปรับแผนหลังอนุมัติ" (0377 · D5) — ค่าระดับใบที่ `stampOrderReplanned` ประทับจากชุดก่อนกรอง
        replanned: Boolean(row.orderReplanned),
        /* จำนวนงวดของทั้งใบ — ค่าระดับใบที่ `stampOrderInstallmentCount` ประทับจากชุดก่อนกรอง (ต่างจาก `count`
           ซึ่งนับแถวที่ตาเห็น) · ไม่ได้ประทับ (ผู้เรียกประกอบแถวเอง) = ถอยไปนับในก้อนข้างล่าง */
        planCount: Number(row.orderInstallmentCount) || 0,
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  }

  return [...groups.values()]
    .map((group) => {
      const rowsInOrder = sortLedger(group.rows);
      const summary = ledgerSummary(rowsInOrder);
      return {
        ...group,
        // ในก้อนเรียงตาม **งวดที่** เพราะคนอ่านคาดว่างวด 1 มาก่อนงวด 2 เสมอ
        // (ต่างจากลำดับของก้อนซึ่งเรียงตามความด่วน)
        rows: [...rowsInOrder].sort((a, b) => (a.seq || 0) - (b.seq || 0)),
        summary,
        // งวดที่คืนเงินแล้ว (0378) ไม่ใช่ "เก็บแล้ว" — ค่าในฐานยังเป็น confirmed (review UI-2 · collectedRow)
        paidCount: rowsInOrder.filter(collectedRow).length,
        count: rowsInOrder.length,
        // ⚠️ ไม่ต่ำกว่าแถวที่เห็นเสมอ — "แสดง 3 จาก 2 งวด" คือค่าประทับค้าง ไม่ใช่ความจริง
        planCount: Math.max(group.planCount, rowsInOrder.length),
        overdue: rowsInOrder.some((r) => r.overdue),
        awaiting: rowsInOrder.filter((r) => r.status === 'reported').length,
        /* ใบกำกับที่ออกแล้ว / ที่ยังค้าง — คิดจากงวดใน **ก้อนที่ผ่านตัวกรองแล้ว** ต่างจาก
           `orderPaidThrough` เพราะนี่เป็นตัวเลขของ *แถวที่ตาเห็นอยู่* ไม่ใช่ค่าระดับใบ
           ที่ต้องนิ่งไม่ว่ากรองอะไร (กรอง "ยังไม่มีใบกำกับ" แล้วเห็น 0/2 คือคำตอบที่ถูก) */
        /* ⭐ งวดยกมาของใบย้อนหลัง **ไม่อยู่ในตัวนับใบกำกับทั้งตัวตั้งและตัวหาร** (มติ 22/09 · กติกาเดียวกับ
           `taxInvoicePending`) — ใบกำกับของเงินก้อนนั้นออกในระบบเดิมแล้ว ⇒ นับเมื่อไรใบนั้นขึ้น "0/2" ตลอดกาล
           ทั้งที่ออกใบในระบบนี้ครบแล้ว · จอบอกแยกด้วย `openingCount` */
        openingCount: rowsInOrder.filter(isOpeningInstallment).length,
        invoiced: rowsInOrder.filter((r) => !isOpeningInstallment(r) && String(r.taxInvoiceNo || '').trim()).length,
        invoicePending: rowsInOrder.filter(ledgerInvoicePending).length,
        // เงินค้าง/คืนแล้วของใบที่ยกเลิก (PR3) — ป้ายสรุปของก้อนพูดเรื่องนี้ก่อน
        stranded: rowsInOrder.filter((r) => r.stranded).length,
        strandedAmount: summary.strandedAmount,
        refunded: rowsInOrder.filter((r) => r.refunded).length,
        rejected: rowsInOrder.filter((r) => r.status === 'rejected').length,
        complete: rowsInOrder.length > 0 && rowsInOrder.every(collectedRow),
        // งวดที่ด่วนที่สุด — ใช้ทั้งจัดลำดับก้อนและโชว์บนแถวที่ยุบอยู่
        lead: rowsInOrder[0] || null,
        /* กำหนดชำระที่ต้องตามต่อไป = งวดที่ **ยังเก็บไม่ได้** และมีวันใกล้ที่สุด
           ⚠️ ข้ามงวดที่ confirmed แล้ว — วันของงวดที่จบไปแล้วไม่ใช่สิ่งที่ต้องตาม
           ⚠️ ทั้งใบเก็บครบ หรือทุกงวดที่เหลือยังไม่มีกำหนด ⇒ null (หน้าเว็บโชว์ขีด)
           มีไว้เพราะแถวที่ยุบอยู่เคยปล่อยคอลัมน์กำหนดชำระว่างทั้งคอลัมน์ */
        nextDue: rowsInOrder
          .filter((r) => r.status !== 'confirmed' && r.dueDate)
          .map((r) => r.dueDate)
          .sort()[0] || null,
        /* ⭐ วางบิลถัดไป (0389 · คอลัมน์ "วางบิลถัดไป" ของม็อก D) = งวดที่ยังมีงานวางบิลและมีวันวางบิล ใกล้ที่สุด
           ⚠️ ข้ามงวดที่ **ขอใบแล้วและวันวางบิลผ่านไปแล้ว** — วางบิลไปแล้ว รอเงินเข้า ไม่ใช่ "ถัดไป"
             (ไม่ข้าม = ใบหลายงวดค้างโชว์รอบที่วางไปแล้วตลอดจนเงินเข้า แล้วรอบที่ต้องไปวางจริงไม่ขึ้น)
           ⚠️ คิดจากแถวที่ผ่านตัวกรองแล้ว (กติกาเดียวกับ nextDue) — กรอง "เลยรอบ" แล้วเห็นงวดที่เลยรอบ คือคำตอบที่ถูก */
        nextBilling: nextBillingOf(rowsInOrder),
        /* สถานะรองของเซลล์ตอนไม่มี "วางบิลถัดไป" — นับจากงวดที่ยังมีงานวางบิลเท่านั้น
           · billingUnset = ไม่มีทั้งวันวางบิลและเหตุการณ์ (SA ยังไม่เลือกรอบ) · billingWaiting = งวดแรกที่รอเหตุการณ์
           · billingBilled = ขอใบแล้วและผ่านวันวางบิลแล้ว (รอเงินเข้า) */
        billingUnset: rowsInOrder.filter((r) => billingOpenKey(r.billingStateKey) && !r.billingDate
          && !String(r.billingEvent || '').trim()).length,
        billingWaiting: (() => {
          const row = [...rowsInOrder].sort((a, b) => (a.seq || 0) - (b.seq || 0))
            .find((r) => billingOpenKey(r.billingStateKey) && !r.billingDate && String(r.billingEvent || '').trim());
          return row ? { seq: row.seq, event: String(row.billingEvent).trim() } : null;
        })(),
        billingBilled: rowsInOrder.filter((r) => r.billingRequested && r.billingDate
          && billingOpenKey(r.billingStateKey) && (r.billingDays ?? 0) < 0).length,
        billingLate: rowsInOrder.filter((r) => r.billingLate).length,
        billingIn7Days: rowsInOrder.filter((r) => r.billingIn7Days).length,
        /* ⭐ "จ่ายถึง" ของใบ (mig 0320) — เงินที่บัญชีรับรองแล้วครอบบริการถึงวันไหน
           🔴 **อ่านจากค่าที่ผู้เรียกคิดมาก่อนกรอง (`row.orderPaidThrough`) ห้ามคิดจาก
           `rowsInOrder`** — นี่เป็นค่าระดับ **ใบ** แบบเดียวกับ orderState: แถวที่ถึงมือ
           ฟังก์ชันนี้คือแถวที่ผ่าน `filterLedger` มาแล้ว ⇒ กรอง "สถานะงวด = รอชำระ"
           หรือกรองช่วงวันเมื่อไร งวด confirmed หลุดหมด แล้วค่าจะกลายเป็น null
           (หรือถอยไปวันเก่ากว่าความจริงแล้วติดสีแดงว่าบริการขาดช่วง) ทั้งที่เงินครอบอยู่
           ⇒ ดูกติกาเดียวกันที่ `orderStateIndex` และ `paidThroughIndex` */
        paidThrough: rowsInOrder.find((r) => r.orderPaidThrough)?.orderPaidThrough || null,
      };
    })
    .sort((a, b) => {
      const rank = (g) => (g.overdue ? 0 : g.awaiting ? 1 : g.complete ? 3 : 2);
      const byRank = rank(a) - rank(b);
      if (byRank) return byRank;
      // ในระดับเดียวกัน ใบที่มีกำหนดใกล้ที่สุดมาก่อน · ไม่มีกำหนดไปท้าย
      const aDue = a.lead?.dueDate || null;
      const bDue = b.lead?.dueDate || null;
      if (aDue !== bDue) {
        if (!aDue) return 1;
        if (!bDue) return -1;
        return String(aDue) < String(bDue) ? -1 : 1;
      }
      return String(a.orderNumber || '') < String(b.orderNumber || '') ? -1 : 1;
    });
}

/**
 * แปลงก้อนหนึ่งใบให้อยู่ในรูปที่ `salesOrderListTrack` กิน (มติผู้ใช้ 2026-08-13)
 *
 * ⭐ *"ให้พูดภาษาเดียวกับตาราง SO ที่เพิ่งรื้อ"* — ทะเบียนนี้กับตารางรายการ SO ตอบ
 * คำถามเดียวกัน ("ใบนี้ค้างที่ใคร") ⇒ ต้องใช้ **ฟังก์ชันเดียวกัน** ไม่ใช่วาดรางอีกชุด
 * ที่หน้าตาเหมือนแต่ตรรกะแยก ซึ่งจะเพี้ยนหากันในสามเดือน
 *
 * ⚠️ ขั้นที่สาม (เก็บเงิน) ประกอบจากงวด **ในก้อนนี้เอง** ไม่ใช่จาก `salesOrderPaymentCell`
 * ของฝั่ง API ⇒ ตัวเลขตรงกับที่ตาเห็นบนแถวเสมอ แม้ตัวกรองจะตัดบางงวดออกไป
 */
export function groupAsOrder(group) {
  if (!group) return null;
  return {
    status: group.orderStatus,
    financeStatus: group.financeStatus,
    payment: {
      tracked: true,
      paid: group.paidCount,
      count: group.count,
      complete: group.complete,
      overdue: group.rows.filter((r) => r.overdue).length,
      reviewing: group.awaiting,
      rejected: group.rejected,
    },
  };
}

/** ป้ายสรุปของใบที่ยุบอยู่ — เรื่องเดียวที่ด่วนที่สุด (กติกาเดียวกับตารางรายการ SO) */
export function groupNote(group) {
  if (!group) return null;
  /* ใบที่ยกเลิก (PR3): เรื่องเดียวที่ต้องตามคือเงินค้าง — "เลยกำหนด"/"เก็บครบ" ของใบที่ตายแล้วไม่มีความหมาย */
  if (group.stranded) return { label: `เงินค้าง ${group.stranded} งวด`, tone: 'warning' };
  if (group.refunded && group.refunded === group.count) return { label: 'คืนเงินแล้ว', tone: 'neutral' };
  if (group.overdue) return { label: 'เลยกำหนด', tone: 'danger' };
  if (group.rejected) return { label: `ตีกลับ ${group.rejected} งวด`, tone: 'danger' };
  if (group.awaiting) return { label: `รอรับรอง ${group.awaiting} งวด`, tone: 'warning' };
  if (group.complete) return { label: 'เก็บครบแล้ว', tone: 'success' };
  return { label: 'รอลูกค้าชำระ', tone: 'neutral' };
}

/**
 * คำรองใต้ช่อง "งวด" ของแถวใบ (ม็อก D) — กรองอยู่แล้วเห็นไม่ครบ = "แสดง n จาก m งวด" · นอกนั้นบอกทรงของใบจากจำนวนงวดทั้งใบ
 * ⚠️ "ชำระครั้งเดียว/แบ่ง m งวด" อ่านจาก `planCount` (ทั้งใบ ก่อนกรอง) ไม่ใช่ `count` — ใบ 12 งวดที่ตัวกรองเหลือหนึ่งงวด
 *   ห้ามอ่านว่า "ชำระครั้งเดียว" (ดู `stampOrderInstallmentCount`)
 */
export function groupInstallmentNote(group, { filtering = false } = {}) {
  if (!group) return '';
  const count = Number(group.count) || 0;
  const plan = Math.max(Number(group.planCount) || 0, count);
  if (filtering && count < plan) return `แสดง ${count} จาก ${plan} งวด`;
  return plan === 1 ? 'ชำระครั้งเดียว' : `แบ่ง ${plan} งวด`;
}

/* ══ มุมมองของทะเบียน: เรียง · จัดกลุ่ม (มติผู้ใช้ 2026-08-15) ═══════════════
   ทั้งสองอย่างทำงานที่ระดับ **ใบ** (ผลลัพธ์ของ `groupLedgerByOrder`) ไม่ใช่ระดับงวด
   — หน่วยที่บัญชีลงมือคือใบ ("โทรตามใบนี้") ⇒ เรียง/จัดกลุ่มระดับงวดจะหั่นใบเดียว
   ไปคนละที่ของตาราง ซึ่งเป็นอาการเดิมที่ `groupLedgerByOrder` ถูกสร้างมาแก้

   ⚠️ อยู่ในไฟล์นี้ ไม่ใช่ในหน้าเว็บ เพราะเป็นตรรกะของทะเบียนที่ต้องมีเทสต์คุม
   หน้าเว็บเป็นแค่คนวาด (กฎเดียวกับ `LEDGER_COLUMNS` ที่ประกาศครั้งเดียว) */

/** ตัวเลือกการเรียง + ทิศทางตั้งต้นของแต่ละแบบ (ป้ายบนปุ่ม "เรียง") */
export const LEDGER_SORT_OPTIONS = [
  { value: 'urgent', label: 'ความด่วน', dir: 'asc' },
  { value: 'due', label: 'กำหนดถัดไป', dir: 'asc' },
  { value: 'outstanding', label: 'ยอดค้างรับ', dir: 'desc' },
  { value: 'customer', label: 'ลูกค้า', dir: 'asc' },
  { value: 'order', label: 'เลขที่ใบ', dir: 'desc' },
];

export const LEDGER_SORT_DEFAULT = 'urgent';

/** ทิศทางตั้งต้นของแบบเรียงหนึ่ง ๆ — ยอดเงินเริ่มจากมากไปน้อย วันเริ่มจากใกล้ก่อน */
export const ledgerSortDir = (key) =>
  LEDGER_SORT_OPTIONS.find((option) => option.value === key)?.dir || 'asc';

/**
 * เรียงก้อนใบตามที่ผู้ใช้เลือก
 *
 * ⚠️ `urgent` = **ลำดับที่ `groupLedgerByOrder` จัดมาแล้ว** (เลยกำหนด → รอรับรอง →
 * ค้าง → เก็บครบ) ไม่คิดใหม่ที่นี่ ไม่งั้นมีกติกาความด่วนสองชุดที่เพี้ยนหากันได้
 * ⚠️ **ใบที่ยังไม่มีกำหนดอยู่ท้ายเสมอ ไม่ว่าเรียงขึ้นหรือลง** — กติกาเดียวกับ
 * `sortLedger`: ยังไม่ถูกนัดวัน = ยังไม่ใช่งานของสัปดาห์นี้ · สลับทิศแล้วมันโผล่ขึ้น
 * หัวตารางเมื่อไร คนจะอ่านว่า "ด่วนที่สุด" ซึ่งตรงข้ามกับความจริง
 */
export function sortLedgerGroups(groups = [], key = LEDGER_SORT_DEFAULT, dir = null) {
  const list = [...(Array.isArray(groups) ? groups : [])];
  const direction = dir === 'desc' ? -1 : 1;
  if (key === 'urgent') return direction === 1 ? list : list.reverse();

  const text = (value) => String(value || '');
  return list.sort((a, b) => {
    if (key === 'due') {
      const aDue = a.nextDue || null;
      const bDue = b.nextDue || null;
      if (!aDue !== !bDue) return aDue ? -1 : 1;   // ไม่มีกำหนด = ท้ายเสมอ
      if (aDue !== bDue) return (String(aDue) < String(bDue) ? -1 : 1) * direction;
    } else if (key === 'outstanding') {
      const diff = (a.summary?.outstandingAmount || 0) - (b.summary?.outstandingAmount || 0);
      if (diff) return diff * direction;
    } else if (key === 'customer') {
      const byName = text(a.customerName).localeCompare(text(b.customerName), 'th');
      if (byName) return byName * direction;
    }
    // ตัวตัดสินสุดท้ายเหมือนกันทุกแบบ: เลขที่ใบ ⇒ ลำดับนิ่ง ไม่สลับเองระหว่างโหลด
    const byOrder = text(a.orderNumber).localeCompare(text(b.orderNumber), 'th');
    return key === 'order' ? byOrder * direction : byOrder;
  });
}

/** ตัวเลือกการจัดกลุ่ม (ป้ายบนปุ่ม "จัดกลุ่ม") */
export const LEDGER_GROUP_OPTIONS = [
  { value: 'none', label: 'ไม่จัดกลุ่ม' },
  { value: 'customer', label: 'ลูกค้า' },
  { value: 'owner', label: 'ผู้ดูแล (AE)' },
  { value: 'dueMonth', label: 'เดือนที่ต้องเก็บ' },
  { value: 'state', label: 'สถานะการเก็บ' },
];

/** ป้ายของกลุ่ม "สถานะการเก็บ" — ชุดเดียวกับ `groupNote` ย่อให้เหลือ 5 หมวด */
const STATE_BUCKETS = [
  // ใบยกเลิก/ถูกแทน (review F2) — ถังของตัวเองก่อนเรื่องอื่น (กติกาเดียวกับ groupNote ที่พูดเรื่องเงินค้างก่อน)
  { key: ORDER_STATE_DEAD, label: LEDGER_ORDER_STATES[ORDER_STATE_DEAD], match: (g) => ['cancelled', 'revised'].includes(g.orderStatus) },
  { key: 'overdue', label: 'เลยกำหนด', match: (g) => g.overdue },
  { key: 'rejected', label: 'มีงวดถูกตีกลับ', match: (g) => g.rejected > 0 },
  { key: 'awaiting', label: 'รอบัญชีรับรอง', match: (g) => g.awaiting > 0 },
  { key: 'complete', label: 'เก็บครบแล้ว', match: (g) => g.complete },
  { key: 'waiting', label: 'รอลูกค้าชำระ', match: () => true },
];

/**
 * ยุบก้อนใบเป็น "ถัง" ตามหัวข้อที่เลือก — คืน `null` เมื่อไม่จัดกลุ่ม
 *
 * ลำดับถังและกติกา "ไม่ระบุไปท้ายสุด" อยู่ที่ `bucketList` (`lib/listGrouping.js`)
 * ซึ่งเป็นตัวจัดถังชุดเดียวของทั้งเว็บ
 */
export function groupLedgerBuckets(groups = [], groupBy = 'none') {
  if (!groupBy || groupBy === 'none') return null;
  /* ตัวจัดถังเป็นของกลาง (`lib/listGrouping.js`) — ไฟล์นี้บอกแค่ "หน้าตาของถัง"
     ของทะเบียนการชำระ · ยอดของถังคือ **ค้างรับ** ซึ่งเป็นเลขที่บัญชีตามจริง */
  return bucketList(groups, (group) => {
    let key; let label; let sub = null; let missing = false;
    if (groupBy === 'customer') {
      // กุญแจใช้รหัส AR ก่อน (ชื่อซ้ำกันได้) · ใบที่ยังไม่มีรหัสจับด้วยชื่อ
      key = group.customerCode || String(group.customerName || '').trim() || '__none';
      label = group.customerName || 'ไม่ระบุลูกค้า';
      sub = group.customerCode || null;
      missing = key === '__none';
    } else if (groupBy === 'owner') {
      /* ⚠️ กุญแจใช้ `ownerId` ก่อน — ชื่อซ้ำกันได้ และดีลเก่าบางใบเก็บชื่อไว้เฉย ๆ
         โดยไม่มี id · ใบที่ไม่ได้มาจากดีล (หรือดีลไม่มีเจ้าของ) ไปถัง "ไม่ระบุ" ท้ายสุด
         ⚠️ ชื่อย่อผ่าน `fmtName` ชุดเดียวกับที่ตารางดีลใช้ ⇒ หัวกลุ่มอ่านเหมือนกันทั้งระบบ */
      const name = String(group.ownerName || '').trim();
      key = group.ownerId || name || '__none';
      label = name ? fmtName(name) : 'ไม่ระบุผู้ดูแล';
      sub = group.team || null;
      missing = key === '__none';
    } else if (groupBy === 'dueMonth') {
      const month = group.nextDue ? String(group.nextDue).slice(0, 7) : null;
      key = month || '__none';
      label = month ? fmtMonthYear(`${month}-01`, { locale: 'th' }) : 'ยังไม่มีกำหนด';
      missing = !month;
    } else {
      const bucket = STATE_BUCKETS.find((candidate) => candidate.match(group));
      key = bucket.key;
      label = bucket.label;
    }

    return { key, label, sub, missing, weight: group.summary?.outstandingAmount || 0 };
  });
}

/**
 * ล็อกทั้งใบของแถวในทะเบียน — ถามตัวเดียวกับ route PATCH ของงวด (`pipelineInstallmentLock`) จากข้อมูลที่แถวพกมา
 * 🐞 review G1: ทะเบียนโชว์ "ยืนยันว่าเงินเข้า" / "บันทึกใบกำกับ" ให้งวดของร่างที่ QT ถูกถอด Won แล้ว ทั้งที่ API ปฏิเสธ
 *   (บันทึกใบกำกับอัปไฟล์ก่อนแล้วค่อยโดนปฏิเสธ = ไฟล์กำพร้าใน bucket) ⇒ ปุ่มต้องรู้ก่อนกด
 * ⚠️ ใบยกเลิก/ถูกแทน ทะเบียนมีกติกาของตัวเองอยู่แล้ว (ป้าย · คิวเงินค้าง) — ตัวนี้ส่งสถานะใบไปครบ ผลจึงตรงกับ API ทุกกรณี
 * ⚠️ แถวที่ไม่มีสถานะ QT = ไม่ตัดสิน (route ต้องโหลดมาเสมอ — ยามต้นทางใน installmentPipelineGuards)
 */
export function ledgerRowLock(row, action) {
  if (!row) return null;
  return pipelineInstallmentLock({
    origin: row.origin,
    status: row.orderStatus,
    quotation: row.quotationStatus ? { quoteNumber: row.quoteNumber, status: row.quotationStatus } : null,
  }, action);
}
