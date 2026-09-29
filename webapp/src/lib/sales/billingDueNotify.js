// ── กระดิ่ง "ถึงรอบวางบิล" ก่อนวันวางบิลของงวด (กำหนดวางบิล · mig 0389) ──────────────
//
// มติเจ้าของ 25–26/09/2026 (ม็อก mockups/billing-cycle/e-bell.html):
//   · กระดิ่งเตือนก่อนถึงวันวางบิล ส่ง **ทั้งเจ้าของดีลและ FN** (มติข้อ 5)
//   · ฝ่ายขาย = หนึ่งแถวต่องวด (เจ้าของดีลวันนี้ + เจ้าของใบ) — กดแล้วไปแท็บการชำระของใบ
//   · FN = แถวสรุปวันละแถว รวมทุกงวดที่ถึงรอบ — กดแล้วไปทะเบียนการชำระที่กรอง "ถึงรอบใน 3 วัน · ยังไม่ขอใบ" ไว้แล้ว
//     (`?billing=soon` = ชุดของกระดิ่งเป๊ะ · รอบสอง 26/09 — เดิม `?billing=7d` กว้างกว่าหัวข้อจนตัวเลขไม่ตรงกัน)
//   · แถวฝั่งขายมีปุ่ม "ขอใบวางบิลงวดนี้" ในแถว (รอบสอง 26/09) — ลิงก์เดียวกับปุ่มในแผงงวด (lib/sales/billingRequestHref.js)
//     ฝังใน `href` ของแถว (ตารางไม่มีช่องเก็บ · ห้ามออก mig) แล้ว API แกะออก · ตัดสินปุ่ม + **ประกอบลิงก์ใหม่จากงวด/ใบสด**
//     ตอนเปิดกล่อง (`attachNotificationActions` ใน lib/notifications.js · ตัวตัดสินล้วน `billingDueAction` อยู่ท้ายไฟล์นี้)
//
// ⚠️ ฟังก์ชันบริสุทธิ์ทั้งไฟล์ — ไม่อ่านนาฬิกา ไม่แตะฐานข้อมูล · ผู้เรียก (cron daily-digest) ดึงข้อมูล
//    แล้วส่ง `todayIso` จาก `businessDate()` (นาฬิกาไทย) เข้ามา · ตัวตัดสิน "งวดนี้ถึงรอบไหม" คือ
//    `needsBillingReminder` ของ billingRule.js ตัวเดียวกับป้ายบนแผงงวด/ทะเบียน FN — ไม่คิดหน้าต่างซ้ำที่นี่
//
// ── รุ่นสี่ (มติเจ้าของ 28–29/09 · "ต้องวางบิลไหม" · system-design §6 ช่วง 4a) ──────────────────────────────────────
//   · กระดิ่งวางบิล (kind เดิม) ยิงเฉพาะงวดที่ **มีวันวางบิล** — ไม่มีวันวางบิล = ไม่มีกระดิ่งวางบิล ไม่มีปุ่มชวนขอใบ
//   · ⭐ ใหม่: กระดิ่ง "ครบกำหนดชำระ" (`sales_order_due_soon`) **ทุกงวดที่มีกำหนดชำระ** 0..3 วัน — เจ้าของ: "เราตั้งกำหนดชำระ
//     เพื่อไว้ติดตาม" · ไม่หยุดเมื่อขอใบแล้ว (ขอใบ ≠ ได้เงิน) · รอเหตุการณ์ = เงียบ · กุญแจ `due_soon:{id}:{dueDate}`
//   · รวมเป็นกระดิ่งเดียวเมื่อกระดิ่งวางบิลยิงอยู่และวันวางบิล = กำหนดชำระ (ลูกค้าชำระวันวางบิลไม่ได้สองกระดิ่งวันเดียว)
//   · ตัวตัดสิน "งวดนี้ได้กระดิ่งอะไร" คือ `bellsFor` ของ billingRule.js ตัวเดียว (ตัวเดียวกับม็อกและเทสต์ §9 ของตัวคิด)
//     ⇒ ไฟล์นี้เหลือด่านระดับใบ (ใบยังเก็บเงิน · สหมิตร · งวดตรึงแล้ว) + ผู้รับ + ข้อความ
//   · แถวสรุป FN แยกตามเรื่อง วันละไม่เกินเรื่องละแถว — หัวข้อ "N งวด" ต้องเท่าแถวที่ลิงก์เปิดมาเจอ (มติ 26/09 ข้อ 4)
//     ⇒ รวมสองเรื่องไว้แถวเดียวไม่ได้ (ลิงก์เดียวชี้ได้ตัวกรองเดียว) · วางบิล → `?billing=soon` · ครบกำหนด → `?due=soon`
//
// ⚠️ **kind ต้องเป็นค่าคงที่ประกาศตรง ๆ ในไฟล์นี้** — ยามกันดริฟต์ใน `notifications.test.mjs` กวาดทั้ง
//    `src/` หา `_KIND = 'sales_order_…'` แล้วเทียบกับ `SALES_ORDER_BELL_KINDS` · ประกอบจาก template
//    string เมื่อไร ยามมองไม่เห็นแล้วแถวหายจากกระดิ่งเงียบ ๆ (ไปโผล่แค่หน้าเต็ม /notifications)
//
// ── v5 ปฏิทินรายปีของลูกค้า (มติเจ้าของ 29/09 · spec v5) — สองกระดิ่งใหม่ในรอบเช้าเดียวกัน ───────────────────────────
//   · "วันตัดรอบ" (`sales_order_billing_cutoff` · เจ้าของ: "เตือนดีกว่า") — ตัวตัดสินรายงวดคือ `bellsFor` → `cutoffDigest`
//     ของตัวคิดตัวเดียว ⇒ ลูกค้าไม่ต้องวางบิล/ไม่มีรอบจ่าย/วันวางบิลตกปีที่ยังไม่มีปฏิทิน = ไม่มีกระดิ่งเอง (ไม่คิดซ้ำที่นี่)
//   · "ขอปฏิทินปีหน้า" (`customer_billing_calendar_missing`) — `calendarReminder` ของตัวคิด · ผู้รับ = ฝ่ายขายทีมที่ดูแล + FN
//   ⚠️ kind ทั้งสองประกาศเป็น literal ด้านล่าง (ยามดริฟต์ของ notifications.test.mjs อ่านได้แต่ literal)
import { fmtMoney } from '@/lib/format';
import { customerNameIn } from '@/lib/master/customerName';
import { canEditCustomerBillingRule, caretakerTeamsOf, departmentOf, hasTeam } from '@/lib/permissions';
import { historicalInstallmentLock, isOpeningInstallment } from '@/lib/sales/historicalOrders';
import { installmentVoid, paymentNotRequired, pipelineInstallmentLock } from '@/lib/sales/salesOrderPayments';
import {
  BELL, BILLING_REMIND_DAYS, CALENDAR_MANUAL_HINT, DUE_REMIND_DAYS, LEDGER_HREF, bellsFor, billingRequestLive, billingState,
  calendarReminder, calendarStatus, canRequestBilling, cutoffDigest, formatBillingDate, ledgerFlags,
} from '@/lib/sales/billingRule';
import { billingRequestHref } from '@/lib/sales/billingRequestHref';
import { hrefWithAction } from '@/lib/notificationAction';

export const BILLING_DUE_KIND = 'sales_order_billing_due';
export const BILLING_DUE_FN_KIND = 'sales_order_billing_due_fn';
/* ⭐ รุ่นสี่ (§6 ช่วง 4a) — ครบกำหนดชำระ 0..3 วัน · ฝ่ายขายหนึ่งแถวต่องวด + FN แถวสรุปวันละแถว (ลิงก์ `?due=soon`)
   ⚠️ ค่าต้องตรงกับ `BELL.DUE_SOON` ของตัวคิด (เทสต์ตรึง) — ประกาศตรง ๆ เพราะยามดริฟต์อ่านได้แต่ literal */
export const DUE_SOON_KIND = 'sales_order_due_soon';
export const DUE_SOON_FN_KIND = 'sales_order_due_soon_fn';
/* ใบสั่งขายไม่มีเธรด (มติ) ⇒ เข้ากระดิ่งทาง `kinds` · entityId = id ของ **ใบ** ไม่ใช่งวด —
   ลบใบแล้ว `purgeUpdates('sales_order', id)` กวาดแถวกระดิ่งตามไปด้วย (id อื่นเหลือแถวที่กดแล้วไปไม่ถึงไหน) */
export const BILLING_DUE_ENTITY_TYPE = 'sales_order';
/* ตัวกรอง `billing=soon` ของทะเบียนการชำระ = **ชุดเดียวกับที่หัวข้อแถว FN นับ** ("ถึงรอบใน 3 วัน · ยังไม่ขอใบ")
   ⭐ รอบสอง 26/09 (มติเจ้าของ ข้อ 4): เดิมลิงก์ไป `?billing=7d` ซึ่งกว้างกว่าโดยตั้งใจ (รวมงวดที่ขอใบแล้ว + 4–7 วัน)
     ⇒ หัวข้อบอก "2 งวด" แต่เปิดมาเจอ 6 งวด แล้วไม่มีใครบอกได้ว่าสองงวดไหน · ตอนนี้ทะเบียนถามตัวคัด
     `billingDueCandidates` ตัวเดียวกับ cron (api/finance/payments) ⇒ ตัวเลขบนกระดิ่ง = จำนวนแถวที่เปิดมาเจอ **ในเช้าวันที่ยิง**
     ⚠️ หัวข้อเป็นภาพนิ่งของเช้าวันที่ยิง ส่วนทะเบียนนับข้อมูลสดของ **วันนี้** — แถวค้างในกล่องหลายวัน ⇒ เปิดวันหลัง
       หรือหลังมีคนขอใบ/แจ้งชำระ/แก้วันวางบิล ตัวเลขสองฝั่งต่างกันได้ (ไม่ใช่บั๊ก · ทะเบียนคือความจริงของตอนนี้) */
export const BILLING_DUE_FN_HREF = LEDGER_HREF.billingSoon;
/* แถว FN "ครบกำหนดชำระ" → ทะเบียนที่กรอง `?due=soon` = ชุดเดียวกับที่หัวข้อนับ (`dueSoonCandidates` ตัวเดียวกับ route ของทะเบียน) */
export const DUE_SOON_FN_HREF = LEDGER_HREF.dueSoon;
/* ต่อท้ายหัวข้อของงวดที่ลูกค้าต้องวางบิลแต่งวดยังไม่มีวันวางบิล (`bellsFor().missingBilling` — ไม่ต่อท้ายงวดที่ติ๊ก/รูปเดิม) */
export const DUE_SOON_MISSING_BILLING_TEXT = 'ยังไม่มีวันวางบิล';
/* ต่อท้ายหัวข้อกระดิ่งวางบิลที่รวมกระดิ่งครบกำหนดไว้แล้ว (วันวางบิล = กำหนดชำระ · `sameDayDue`) */
export const BILLING_DUE_SAME_DAY_TEXT = 'ครบกำหนดชำระวันเดียวกัน';
/* ป้ายปุ่มในแถวฝั่งขาย — คำเดียวกับปุ่มในแผงงวด (SalesOrderPaymentPanel) */
export const BILLING_DUE_ACTION_LABEL = 'ขอใบวางบิลงวดนี้';

/* กุญแจกันยิงซ้ำ — หนึ่งงวด หนึ่งวันวางบิล หนึ่งครั้ง (มติ "ครั้งเดียวต่องวดต่อวันวางบิล")
   ⚠️ ต้องมีวันวางบิลในกุญแจ — แก้วันวางบิลของงวดแล้วต้องเตือนได้อีกครั้ง · กุญแจที่มีแต่ id จะกลืนรอบใหม่ทิ้ง
   ⚠️ หน้าต่างเตือน 0..N วัน ⇒ cron เจองวดเดียวกันหลายเช้าติดกัน กุญแจนี้คือสิ่งที่ทำให้เด้งแค่เช้าแรก */
export const billingDueDedupeKey = (installmentId, billingDate) => `billing_due:${installmentId}:${billingDate}`;
/* FN ได้แถวสรุปวันละแถว (กติกาผู้รับ "หนึ่งคนหนึ่งเด้งต่อวัน") — unique (userId, updateId) ⇒ ต่อคนต่อวัน */
export const billingDueFnDedupeKey = (todayIso) => `billing_due_fn:${todayIso}`;
/* กุญแจของกระดิ่งครบกำหนด — หนึ่งงวด หนึ่งกำหนดชำระ หนึ่งครั้ง (แก้กำหนดชำระแล้วเตือนได้อีก · แบบเดียวกับวันวางบิล) */
export const dueSoonDedupeKey = (installmentId, dueDate) => `due_soon:${installmentId}:${dueDate}`;
export const dueSoonFnDedupeKey = (todayIso) => `due_soon_fn:${todayIso}`;

/* แถว FN โชว์กี่งวดก่อนต่อ "และอีก n งวด" — กระดิ่งตัดบรรทัดรองที่ 2 บรรทัด (NotificationBell.module.css `.body`)
   ⇒ งวดที่สามไม่เคยโผล่ในกระดิ่งอยู่ดี · จำนวนงวดทั้งหมดอยู่บนหัวข้อแล้ว ("· N งวด ฿X") · หน้าเต็มไม่ตัด */
const FN_LINES = 2;
/* ชื่องวดที่พิมพ์ยาวมาก ๆ ต้องไม่ดันยอดเงินตกท้ายหัวข้อ (หัวข้อถูกตัดที่ 200 ตัวอักษร) */
const LABEL_MAX = 40;

const text = (value) => String(value ?? '').trim();

/**
 * ใบนี้ยังต้องตามเก็บเงินไหม — **ถามด่านงวดตัวเดียวกับแผงงวดและ API** ไม่ใช่ลิสต์สถานะของตัวเอง
 *   · `pipelineInstallmentLock` (ไม่ส่ง action = ถามระดับใบ) ล็อก: ใบยกเลิก · ใบถูกออก Rev. ทับ · ร่างที่ QT ถูกถอด Won แล้ว
 *     และปล่อย: อนุมัติแล้ว · ย้อนอนุมัติรอออก Rev. · **ร่าง Rev.** (มติ D3 23/09: ไม่หยุดรับเงินเพราะกำลังแก้เอกสาร —
 *     0376 ย้ายงวดที่ตรึงแล้วทั้งแถวไปใบ Rev. ซึ่งเกิดเป็นร่าง ⇒ รอบวางบิลของลูกค้าก็ไม่หยุดตาม)
 *     🐞 เดิมใช้ลิสต์ `approved/approval_revoked` ⇒ ตั้งแต่ออก Rev. จนอนุมัติ Rev. ทุกงวดของใบนั้นหลุดจากกระดิ่งเงียบ ๆ
 *        ทั้งที่ทะเบียน FN ยังแสดง (ทะเบียนเก็บทุกงวดที่ตรึงแล้วและไม่โมฆะ)
 *   · `historicalInstallmentLock` — ใบย้อนหลังขยับงวดได้เฉพาะเมื่ออนุมัติแล้ว
 * ⚠️ ร่างที่ QT ตายตัดสินจาก `order.quotation.status` — ผู้เรียกต้องแนบมา (ไม่มีค่า = ด่านไม่ตัดสิน · ไม่เดาว่า QT ตาย)
 * ⚠️ งวดร่างของใบที่ยังไม่เคยอนุมัติไม่ถึงตรงนี้ — ตัวคัดตัด `frozenAt` ว่างไปก่อนแล้ว
 * ไม่รู้จักใบ (หาไม่เจอ) = ไม่เตือน
 */
function orderCollecting(order) {
  if (!order) return false;
  if (historicalInstallmentLock(order) || pipelineInstallmentLock(order)) return false;
  // ใบยอด 0 จบที่อนุมัติ ไม่มีเงินให้เก็บ (มติ 2026-08-18)
  return !paymentNotRequired(order.totalAmount);
}

/**
 * งวดนี้ "ขอใบวางบิลแล้ว" ไหม — มีคำร้องที่ **ส่งแล้วและยังไม่ถูกยกเลิก** ผูกอยู่
 * ⭐ ตัดสินที่ `billingRequestLive` (billingRule.js) ตัวเดียว — ร่างที่ยังไม่ส่ง/ยกเลิก = ยังไม่ขอ ·
 *   คำร้องที่หาไม่เจอใน Map (ถูกลบไปพร้อมดีล) = ลิงก์ตาย = ยังไม่ขอ
 *   (ปุ่ม "ขอใบวางบิลงวดนี้" ผูกงวดตั้งแต่บันทึกร่าง — ถ้านับร่าง กระดิ่งเงียบทั้งที่ FN ยังไม่ได้รับอะไร)
 * @param requestsById Map id → แถว `dept_requests` ({ id, status }) ของทุก `billingRequestId` ที่เจอ
 * ⚠️ ชื่อไม่ซ้ำ `billingRequestAlive(request)` ของ lib/finance/paymentLedger.js โดยตั้งใจ — อาร์กิวเมนต์ต่างกัน
 *    (ตัวนี้รับงวด + Map) · auto-import ผิดตัวแล้วได้ false ("ยังไม่ขอ") เงียบ ๆ
 */
export function installmentBillingRequested(installment, requestsById) {
  const id = text(installment?.billingRequestId);
  if (!id) return false;
  return billingRequestLive(requestsById?.get?.(id));
}

/* "งวด 1 มัดจำ" — คำนำหน้าที่แค่ซ้ำเลขงวดตัดทิ้ง ("งวดที่ 2" บนงวด 2 → "งวด 2" · กติกาจากม็อก E)
   ⚠️ ตัดเฉพาะ **คำนำหน้า** ที่เลขตรงงวด — "งวดที่ 1 มัดจำ 50%" บนงวด 1 → "งวด 1 มัดจำ 50%" (ไม่ใช่ "งวด 1 งวดที่ 1 …")
      · "งวดที่ 10" บนงวด 1 ไม่ใช่ของซ้ำ (`(?!\d)`) · เลขไม่ตรงงวดคงไว้ทั้งคำ */
export function installmentName(installment) {
  const seq = Number(installment?.seq);
  const numbered = Number.isInteger(seq) && seq > 0;
  const head = numbered ? `งวด ${seq}` : 'งวดชำระ';
  let label = text(installment?.label);
  if (numbered) label = label.replace(new RegExp(`^งวด(?:ที่)?\\s*${seq}(?!\\d)[\\s:·\\-–—]*`), '').trim();
  if (label.length > LABEL_MAX) label = `${label.slice(0, LABEL_MAX - 1)}…`;
  return label ? `${head} ${label}` : head;
}

/* "AR-xxx · ชื่อลูกค้า" — ชื่อตามที่พิมพ์บนใบ (snapshot) ก่อนชื่อในทะเบียน
   ⚠️ ชื่อในทะเบียนผ่าน `customerNameIn` (ไทยก่อน ไม่มีค่อยอังกฤษ) — ลูกค้าที่มีแต่ชื่ออังกฤษเคยได้แถวไร้ชื่อในทะเบียน FN
      · ผู้เรียกต้องเลือก `name, "nameEn"` มาด้วย (cron เลือกแล้ว) */
function customerLine(order, customer) {
  return [text(customer?.arCode), text(order?.customerName) || customerNameIn(customer)].filter(Boolean).join(' · ');
}

const byBillingDate = (a, b) => (
  text(a.installment.billingDate).localeCompare(text(b.installment.billingDate))
  || text(a.order.orderNumber).localeCompare(text(b.order.orderNumber))
  || (Number(a.installment.seq) || 0) - (Number(b.installment.seq) || 0)
);
const byDueDate = (a, b) => (
  text(a.installment.dueDate).localeCompare(text(b.installment.dueDate))
  || text(a.order.orderNumber).localeCompare(text(b.order.orderNumber))
  || (Number(a.installment.seq) || 0) - (Number(b.installment.seq) || 0)
);

/**
 * ด่านระดับใบของกระดิ่งงวดทุกชนิด (วางบิล · ครบกำหนด) — ผ่านเมื่อครบทุกข้อ แล้วคืน `{ order, customer }` · ไม่ผ่าน = null
 *   · งวดหยุดยอดแล้ว (`frozenAt`) — งวดร่างยอดยังเดินตามแผนของ QT (ทะเบียน FN ก็ไม่แสดง)
 *   · ไม่ใช่งวดยกมาของใบย้อนหลัง (มติ 10: งวดยกมาไม่มีวันวางบิล/กำหนดชำระ)
 *   · ใบยังต้องตามเก็บเงิน (`orderCollecting` — ด่านงวดของแผง/API · ไม่ใช่ใบยอด 0 · งวดไม่โมฆะ)
 *   · ไม่ใช่ลูกค้าที่เก็บเงินนอกระบบ (`skipArCodes` — สหมิตร AR-109 · มติ 24/09 เงินสหมิตรอยู่นอกระบบ)
 * ⚠️ ด่านระดับงวด (รอชำระ · ยอด > 0 · หน้าต่างวัน · ขอใบแล้ว · รอเหตุการณ์) อยู่ที่ `bellsFor` ตัวเดียว — ไม่คิดซ้ำที่นี่
 */
function collectibleOf(installment, { ordersById, customersById, skip }) {
  if (!installment?.id || !installment.frozenAt) return null;
  if (isOpeningInstallment(installment)) return null;
  const order = ordersById.get(installment.salesOrderId);
  /* `installmentVoid` = ตัวตัดสินงวดโมฆะตัวเดียวของทั้งระบบ — วันนี้ด่านใบข้างบนตัดใบยกเลิก/ถูกออก Rev. ทับไปก่อนแล้ว
     แต่คงไว้เป็นเข็มขัด: ด่านใบเปลี่ยนเมื่อไร (เช่นปล่อยบางคำสั่งบนใบยกเลิก) งวดโมฆะต้องยังไม่ถูกเตือน */
  if (!orderCollecting(order) || installmentVoid(installment, order)) return null;
  const customer = order.customerId ? customersById.get(order.customerId) || null : null;
  if (customer && skip.has(text(customer.arCode))) return null;
  return { order, customer };
}

/* กระดิ่งของงวดเช้านี้จากตัวคิดตัวเดียว (`bellsFor`) — กติกาของลูกค้าอ่านจาก `customer.billingRule` (ไม่มี = ยังไม่ระบุ)
   ⚠️ กระดิ่งวางบิลไม่ขึ้นกับกติกา (ตัดสินจากวันวางบิลของงวดล้วน · มติ 28/09 ข้อ 17) — กติกามีผลแค่คำต่อท้าย
     "ยังไม่มีวันวางบิล" ของกระดิ่งครบกำหนด (ต้องวางบิลจริง · ไม่ติ๊ก · ไม่ใช่รูปเดิม) */
function bellsOf(installment, customer, { todayIso, requestsById }) {
  const requested = installmentBillingRequested(installment, requestsById);
  return bellsFor(installment, customer?.billingRule ?? null, { todayIso, requested });
}

/**
 * งวดที่ต้องเตือน "ถึงรอบวางบิล" วันนี้ — ตัวคัดเดียวของทั้งฝั่งขาย ฝั่ง FN และตัวกรอง `?billing=soon` ของทะเบียน
 *
 * ผ่านเมื่อ: ด่านระดับใบ (`collectibleOf`) + `bellsFor` มีกระดิ่งวางบิล — รอชำระ (`pending` เท่านั้น: แจ้งชำระแล้ว = ลูกค้า
 *   จ่ายแล้ว) · ยอด > 0 · **มีวันวางบิล** อยู่ในหน้าต่าง 0..BILLING_REMIND_DAYS วัน · ยังไม่มีคำร้องขอใบวางบิลที่ส่งแล้วผูกอยู่
 *
 * @param installments แถว `sales_order_installments`
 * @param ordersById   Map id → ใบ (`status` `origin` `totalAmount` `customerId` …) — ใบต้องมี `deal` ติดมาถ้าจะรู้เจ้าของดีล
 *                     และ `quotation` ({ status, quoteNumber }) ถ้าจะตัดร่างที่ QT ถูกถอด Won แล้ว
 * @param customersById Map id → ลูกค้า (`arCode` `name` `nameEn` · `billingRule` ถ้ามี)
 * @param requestsById Map id → คำร้อง (`status`)
 * @param skipArCodes  รหัสลูกค้าที่ไม่เตือน — ผู้เรียกส่ง `SAHAMIT_AR_CODE` (ค่าคงที่บ้านเดียวอยู่ที่ lib/sahamit/server.js
 *                     ซึ่งลาก auth ของ server มาด้วย ⇒ ไฟล์บริสุทธิ์นี้ไม่ import เอง)
 * @returns `[{ installment, order, customer, sameDayDue }]` เรียงตามวันวางบิล · `sameDayDue` = กระดิ่งนี้รวมครบกำหนดไว้แล้ว
 */
export function billingDueCandidates(installments = [], {
  todayIso, ordersById = new Map(), customersById = new Map(), requestsById = new Map(), skipArCodes = [],
} = {}) {
  const skip = new Set((skipArCodes || []).map(text).filter(Boolean));
  const out = [];
  for (const installment of installments || []) {
    const hit = collectibleOf(installment, { ordersById, customersById, skip });
    if (!hit) continue;
    const bell = bellsOf(installment, hit.customer, { todayIso, requestsById }).find((b) => b.kind === BELL.BILLING_DUE);
    if (!bell) continue;
    out.push({ installment, order: hit.order, customer: hit.customer, sameDayDue: Boolean(bell.sameDayDue) });
  }
  return out.sort(byBillingDate);
}

/**
 * งวดที่ "ครบกำหนดชำระใน 0..3 วัน" วันนี้ (รุ่นสี่ · §6) — ตัวคัดเดียวของกระดิ่งครบกำหนด (ขาย + FN) และตัวกรอง `?due=soon`
 *
 * ผ่านเมื่อ: ด่านระดับใบ (`collectibleOf`) + งวดรอชำระที่มียอด มีกำหนดชำระในหน้าต่าง 0..DUE_REMIND_DAYS วัน ไม่รอเหตุการณ์
 *   ⭐ **ทุกงวดที่มีกำหนดชำระ** — มี/ไม่มีวันวางบิล · ขอใบแล้วก็ยังเตือน (ขอใบ ≠ ได้เงิน) · ลูกค้าไม่ต้องวางบิลก็ได้
 * ⭐ `merged` = งวดที่กระดิ่งวางบิลยิงอยู่และวันวางบิล = กำหนดชำระ ⇒ **ฝั่งขายไม่ได้แถวครบกำหนดแยก** (กระดิ่งวางบิลบอกแล้ว ·
 *   `bellsFor` ไม่คืนกระดิ่งครบกำหนดของงวดนี้) แต่ **ยังอยู่ในชุดนี้** — แถวสรุป FN กับ `?due=soon` นับทุกงวดที่ครบกำหนด
 *   (`ledgerFlags().dueSoon` "รวมงวดที่กระดิ่งถูกรวมเข้ากระดิ่งวางบิล") ⇒ หัวข้อแถว FN = จำนวนแถวที่ลิงก์เปิดมาเจอ
 * @returns `[{ installment, order, customer, merged, missingBilling }]` เรียงตามกำหนดชำระ
 */
export function dueSoonCandidates(installments = [], {
  todayIso, ordersById = new Map(), customersById = new Map(), requestsById = new Map(), skipArCodes = [],
} = {}) {
  const skip = new Set((skipArCodes || []).map(text).filter(Boolean));
  const out = [];
  for (const installment of installments || []) {
    const hit = collectibleOf(installment, { ordersById, customersById, skip });
    if (!hit) continue;
    const bells = bellsOf(installment, hit.customer, { todayIso, requestsById });
    const due = bells.find((b) => b.kind === BELL.DUE_SOON) || null;
    const merged = !due && bells.some((b) => b.kind === BELL.BILLING_DUE && b.sameDayDue);
    if (!due && !merged) continue;
    out.push({ installment, order: hit.order, customer: hit.customer, merged, missingBilling: Boolean(due?.missingBilling) });
  }
  return out.sort(byDueDate);
}

/**
 * ผู้รับฝั่งขายของงวด — เจ้าของดีลวันนี้ (คนที่ลงมือต่อได้จริง) + เจ้าของใบ (ตรึงไว้ตอนอนุมัติ · mig 0294)
 * ปกติคนเดียวกัน ต่างกันเมื่อดีลย้ายมือหลังอนุมัติ ⇒ ส่งทั้งคู่แล้วตัดซ้ำ (แพตเทิร์นเดียวกับ taxInvoiceNotify)
 * ⚠️ ตัดเฉพาะคนที่ทะเบียนผู้ใช้บอกว่า **ปิดบัญชีแล้ว** — ไม่รู้จัก ≠ ปิดบัญชี (อ่านทะเบียนพังต้องไม่ทำให้เงียบ)
 */
export function billingDueRecipients(order, { directory = null } = {}) {
  const ids = [...new Set([order?.deal?.ownerId, order?.ownerId].map(text).filter(Boolean))];
  if (!directory?.size) return ids;
  return ids.filter((id) => !directory.get(id)?.disabled);
}

/**
 * ผู้รับฝั่ง FN — **ทุกคนในฝ่าย FN ที่บัญชียังเปิดอยู่**
 *
 * 🔴 **ข้อยกเว้นกติกาผู้รับของ mig 0185 (มติ 14 "ห้ามแจ้งทุกคนในฝ่าย")** — เจ้าของสั่งเอง 26/09/2026
 *    (มติรอบสาม ข้อ 5: "แจ้งทั้งฝ่าย FN ไปก่อน") · ม็อกเสนอ "ผู้ดูแลการวางบิลรายลูกค้า" แต่ช่องนั้นถูกตัดออก
 *    ⇒ วันนี้ไม่มีข้อมูลว่าใครใน FN ดูแลลูกค้ารายไหน · ฝ่ายมีสองคน และได้วันละแถวเดียวต่อคน
 *    ⏭ ถ้าวันหนึ่งฝ่ายโตหรือกระดิ่งรก ให้กลับไปทำช่อง "ผู้ดูแลการวางบิล (FN)" บนรอบวางบิลของลูกค้าแทน
 * ⚠️ ฝ่ายอ่านจาก `departmentOf` ตัวเดียวกับด่านรับรองงวด (`canConfirmPayment`)
 * ⚠️ **ไม่รวม admin แม้ตั้งฝ่ายเป็น FN** — `departmentOf` อ่าน `app_metadata.department` ก่อน role ⇒ admin ที่ตั้งฝ่ายไว้
 *    จะหลุดเข้ามา · admin คือบัญชีดูแลระบบ (กดได้ทุกด่าน) ไม่ใช่คนออกใบวางบิล — ตัดด้วย role ตรง ๆ
 */
export function financeRecipientIds(directory) {
  if (!directory?.values) return [];
  return [...directory.values()]
    .filter((user) => user?.id && !user.disabled && user.role !== 'admin' && departmentOf(user) === 'FN')
    .map((user) => String(user.id));
}

/**
 * กระดิ่งฝั่งขาย หนึ่งแถวต่องวด — ฟังก์ชันบริสุทธิ์ เทสต์ได้โดยไม่ต้องมี DB
 * @returns payload ของ `notifyUsers` หรือ null เมื่อไม่มีใครต้องรู้
 */
export function billingDueNotice({ installment, order, customer = null, directory = null } = {}) {
  const billingDate = text(installment?.billingDate);
  const when = formatBillingDate(billingDate, { withYear: false });
  // ⚠️ หัวข้อประกอบจาก `orderNumber` ซึ่งมีค่าเสมอ — หัวข้อว่างตก CHECK ของ 0185 แล้ว insert ล้มทั้ง batch เงียบ ๆ
  if (!installment?.id || !order?.id || !text(order.orderNumber) || !when) return null;
  const userIds = billingDueRecipients(order, { directory });
  if (!userIds.length) return null;
  // `?tab=` ไม่ใช่ `#payment` — หน้าใบอ่าน query ตอนโหลด ส่วน hash ไม่เสถียร (sales-orders/[id]/page.js)
  const rowHref = `/sa/sales-orders/${order.id}?tab=payment`;
  return {
    userIds,
    entityType: BILLING_DUE_ENTITY_TYPE,
    entityId: order.id,
    kind: BILLING_DUE_KIND,
    dedupeKey: billingDueDedupeKey(installment.id, billingDate),
    /* ⭐ รุ่นสี่: วันวางบิล = กำหนดชำระ (ชำระวันวางบิล) ⇒ กระดิ่งครบกำหนดของงวดนี้ถูกรวมไว้ที่นี่ (`bellsFor` ไม่คืนแยก)
         ⇒ หัวข้อต้องบอกว่าเงินครบกำหนดวันเดียวกันด้วย ไม่งั้นเรื่องครบกำหนดหายไปจากกระดิ่งเงียบ ๆ */
    title: `ถึงรอบวางบิล ${when} · ${text(order.orderNumber)} ${installmentName(installment)} ${fmtMoney(installment.amount)}${
      text(installment.dueDate) === billingDate ? ` · ${BILLING_DUE_SAME_DAY_TEXT}` : ''}`,
    body: customerLine(order, customer) || null,
    /* ⭐ ปุ่ม "ขอใบวางบิลงวดนี้" ในแถว (รอบสอง 26/09) — ลิงก์ของปุ่มฝังท้าย `href` (lib/notificationAction.js)
       แถวยังพาไปแท็บการชำระเหมือนเดิม · ⚠️ ใบที่ไม่อ้างใบเสนอราคา (ใบย้อนหลัง) ไม่มีปุ่ม — คำร้องขอเอกสารการเงิน
       ต้องอ้าง QT (ฟอร์ม + ตัวผูกงวดตีกลับ) ⇒ ปุ่มที่กดแล้วได้แต่ error ไม่ควรวาด
       ⚠️ ลิงก์ที่ฝังตรงนี้เป็นแค่ **ธง "แถวนี้มีปุ่ม" + id งวด** — ตอนเปิดกล่อง API ประกอบลิงก์ใหม่จากงวด/ใบสด
         (`billingDueAction`) · ค่าอื่นในลิงก์นี้ (ใบ · ยอด · วันวางบิล) เป็นภาพตอนเช้าที่ยิง ห้ามมีใครอ่านไปใช้ */
    href: text(order.quotationId) ? hrefWithAction(rowHref, billingRequestHref(order, installment)) : rowHref,
  };
}

/**
 * กระดิ่งฝั่ง FN แถวสรุปวันละแถว — "ถึงรอบวางบิลใน 3 วัน · 2 งวด ฿63,690.68"
 * บรรทัดรองไล่ FN_LINES งวดแรกตามวันวางบิล **พร้อมยอดรายงวด** (ม็อก E) แล้วต่อ "และอีก n งวด"
 * ⚠️ ผูก entityId กับใบของงวดที่วางบิลเร็วสุด (แพตเทิร์นเดียวกับการทวงลีด/สัญญาที่รวมหลายใบในเด้งเดียว)
 * ⭐ หัวข้อนับงวดชุดเดียวกับที่ลิงก์ `?billing=soon` เปิด (ดูที่ BILLING_DUE_FN_HREF · รอบสอง 26/09)
 */
export function billingDueFnNotice(candidates = [], { todayIso, directory = null } = {}) {
  if (!candidates?.length || !text(todayIso)) return null;
  const userIds = financeRecipientIds(directory);
  if (!userIds.length) return null;
  const sorted = [...candidates].sort(byBillingDate);
  const total = sorted.reduce((sum, { installment }) => sum + (Number(installment.amount) || 0), 0);
  const lines = sorted.slice(0, FN_LINES).map(({ installment, order, customer }) => {
    const who = text(customer?.arCode) || text(order.customerName) || customerNameIn(customer);
    const when = formatBillingDate(installment.billingDate, { withYear: false });
    return [
      `${text(order.orderNumber)} ${installmentName(installment)} ${fmtMoney(installment.amount)}`, who, `วางบิล ${when}`,
    ].filter(Boolean).join(' · ');
  });
  const more = sorted.length > FN_LINES ? ` และอีก ${sorted.length - FN_LINES} งวด` : '';
  return {
    userIds,
    entityType: BILLING_DUE_ENTITY_TYPE,
    entityId: sorted[0].order.id,
    kind: BILLING_DUE_FN_KIND,
    dedupeKey: billingDueFnDedupeKey(text(todayIso)),
    title: `ถึงรอบวางบิลใน ${BILLING_REMIND_DAYS} วัน · ${sorted.length} งวด ${fmtMoney(total)}`,
    body: `${lines.join(' / ')}${more}`,
    href: BILLING_DUE_FN_HREF,
  };
}

/**
 * ทั้งรอบเช้าในคำสั่งเดียว — cron เรียกตัวนี้ตัวเดียว
 * @returns `{ candidates, sales: [payload], fn: payload | null }`
 *   `fn === null` ทั้งที่มี candidates = หาผู้ใช้ฝ่าย FN ที่เปิดอยู่ไม่เจอ (ผู้เรียกรายงานเป็น error)
 */
export function billingDueNotices(installments = [], {
  todayIso, ordersById, customersById, requestsById, skipArCodes = [], directory = null,
} = {}) {
  const candidates = billingDueCandidates(installments, {
    todayIso, ordersById, customersById, requestsById, skipArCodes,
  });
  const sales = candidates
    .map(({ installment, order, customer }) => billingDueNotice({ installment, order, customer, directory }))
    .filter(Boolean);
  const fn = billingDueFnNotice(candidates, { todayIso, directory });
  return { candidates, sales, fn };
}

/* ── กระดิ่ง "ครบกำหนดชำระ" (รุ่นสี่ · §6 ช่วง 4a) ─────────────────────────────────────────────────────────── */

/**
 * กระดิ่งครบกำหนดฝั่งขาย หนึ่งแถวต่องวด — ผู้รับชุดเดียวกับกระดิ่งวางบิล (เจ้าของดีลวันนี้ + เจ้าของใบ)
 * ⭐ แถวพาไปแท็บการชำระของใบ (ฝ่ายขายเข้าทะเบียน FN ไม่ได้ · `canAccessFinance`) · **ไม่มีปุ่ม "ขอใบวางบิลงวดนี้"** —
 *   เรื่องของกระดิ่งนี้คือเงินใกล้ครบกำหนด ไม่ใช่การวางบิล (งวดที่ไม่มีวันวางบิลไม่ชวนขอใบ · มติเจ้าของ 28/09)
 * @param missingBilling ต่อท้าย "ยังไม่มีวันวางบิล" (จาก `bellsFor` — ต้องวางบิลจริง ไม่ใช่งวดที่ติ๊ก/รูปเดิม)
 * @returns payload ของ `notifyUsers` หรือ null เมื่อไม่มีใครต้องรู้
 */
export function dueSoonNotice({ installment, order, customer = null, directory = null, missingBilling = false } = {}) {
  const dueDate = text(installment?.dueDate);
  const when = formatBillingDate(dueDate, { withYear: false });
  // ⚠️ หัวข้อประกอบจาก `orderNumber` ซึ่งมีค่าเสมอ — หัวข้อว่างตก CHECK ของ 0185 (เหตุผลเดียวกับกระดิ่งวางบิล)
  if (!installment?.id || !order?.id || !text(order.orderNumber) || !when) return null;
  const userIds = billingDueRecipients(order, { directory });
  if (!userIds.length) return null;
  return {
    userIds,
    entityType: BILLING_DUE_ENTITY_TYPE,
    entityId: order.id,
    kind: DUE_SOON_KIND,
    dedupeKey: dueSoonDedupeKey(installment.id, dueDate),
    title: `ครบกำหนดชำระ ${when} · ${text(order.orderNumber)} ${installmentName(installment)} ${fmtMoney(installment.amount)}${
      missingBilling ? ` · ${DUE_SOON_MISSING_BILLING_TEXT}` : ''}`,
    body: customerLine(order, customer) || null,
    href: `/sa/sales-orders/${order.id}?tab=payment`,
  };
}

/**
 * กระดิ่งครบกำหนดฝั่ง FN แถวสรุปวันละแถว — "ครบกำหนดชำระใน 3 วัน · 3 งวด ฿X" → `/finance/payments?due=soon`
 * ⭐ นับชุดเดียวกับที่ลิงก์เปิด (`dueSoonCandidates` รวมงวดที่ฝั่งขายรวมเข้ากระดิ่งวางบิลแล้ว) · บรรทัดรองไล่ FN_LINES งวดแรก
 *   ตามกำหนดชำระ แล้วต่อ "และอีก n งวด" · มีงวดที่ยังไม่มีวันวางบิล = ต่อท้ายจำนวน (ตัวกรอง `?billing=missing` ของทะเบียน)
 * ⚠️ แยกแถวจากแถวสรุปวางบิลโดยตั้งใจ — ดูหัวไฟล์ (หัวข้อหนึ่งแถว = ตัวกรองเดียวที่ลิงก์เปิด)
 */
export function dueSoonFnNotice(candidates = [], { todayIso, directory = null } = {}) {
  if (!candidates?.length || !text(todayIso)) return null;
  const userIds = financeRecipientIds(directory);
  if (!userIds.length) return null;
  const sorted = [...candidates].sort(byDueDate);
  const total = sorted.reduce((sum, { installment }) => sum + (Number(installment.amount) || 0), 0);
  const lines = sorted.slice(0, FN_LINES).map(({ installment, order, customer }) => {
    const who = text(customer?.arCode) || text(order.customerName) || customerNameIn(customer);
    const when = formatBillingDate(installment.dueDate, { withYear: false });
    return [
      `${text(order.orderNumber)} ${installmentName(installment)} ${fmtMoney(installment.amount)}`, who, `ครบกำหนด ${when}`,
    ].filter(Boolean).join(' · ');
  });
  const more = sorted.length > FN_LINES ? ` และอีก ${sorted.length - FN_LINES} งวด` : '';
  const missing = sorted.filter((c) => c.missingBilling).length;
  return {
    userIds,
    entityType: BILLING_DUE_ENTITY_TYPE,
    entityId: sorted[0].order.id,
    kind: DUE_SOON_FN_KIND,
    dedupeKey: dueSoonFnDedupeKey(text(todayIso)),
    title: `ครบกำหนดชำระใน ${DUE_REMIND_DAYS} วัน · ${sorted.length} งวด ${fmtMoney(total)}`,
    body: `${lines.join(' / ')}${more}${missing ? ` · ${DUE_SOON_MISSING_BILLING_TEXT} ${missing} งวด` : ''}`,
    href: DUE_SOON_FN_HREF,
  };
}

/**
 * รอบเช้าของกระดิ่งครบกำหนดในคำสั่งเดียว — cron เรียกตัวนี้
 * @returns `{ candidates, sales: [payload], fn: payload | null }` · ฝั่งขายข้ามงวดที่รวมเข้ากระดิ่งวางบิลแล้ว (`merged`)
 *   `fn === null` ทั้งที่มี candidates = หาผู้ใช้ฝ่าย FN ที่เปิดอยู่ไม่เจอ (ผู้เรียกรายงานเป็น error)
 */
export function dueSoonNotices(installments = [], {
  todayIso, ordersById, customersById, requestsById, skipArCodes = [], directory = null,
} = {}) {
  const candidates = dueSoonCandidates(installments, {
    todayIso, ordersById, customersById, requestsById, skipArCodes,
  });
  const sales = candidates
    .filter((c) => !c.merged)
    .map(({ installment, order, customer, missingBilling }) => dueSoonNotice({
      installment, order, customer, directory, missingBilling,
    }))
    .filter(Boolean);
  const fn = dueSoonFnNotice(candidates, { todayIso, directory });
  return { candidates, sales, fn };
}

/* ══ v5 · กระดิ่งเช้าวันตัดรอบ (`sales_order_billing_cutoff`) ═══════════════════════════════════════════════════
   มติเจ้าของ 29/09 (spec v5 "เวลาตัดรอบ: ช่อง + เตือน"): เช้าวันทำงานก่อนเส้นตาย (`next`) + เช้าวันทำงานสุดท้าย ≤ เส้นตาย (`today`)
   บอกงวดที่ **ยังรอวางบิลในรอบนั้น** · เส้นตาย = วันตัดรอบ − เครดิต (เครดิต 0 = วันตัดรอบของลูกค้า · เครดิต N = วันสุดท้ายที่วางบิล
   แล้วทันรอบจ่าย — ข้อความไม่พูดเวลา · system-design §6)
   ⭐ ตัวตัดสินรายงวด + ข้อความ = `cutoffDigest` ของตัวคิด (→ `bellsFor`) ตัวเดียว · ที่นี่เหลือด่านระดับใบ (`collectibleOf` ชุดเดียวกับ
     กระดิ่งวางบิล) + ผู้รับ + รูปแถว
   ⭐ ฝ่ายขาย = หนึ่งแถวต่อ **ใบ** ต่อรอบ (เจ้าของดีล + เจ้าของใบ — ชุดเดียวกับกระดิ่งวางบิล) → แท็บการชำระของใบ
     (ฝ่ายขายเข้าทะเบียน FN ไม่ได้ · `canAccessFinance`) · ใบที่รอแค่งวดเดียวมีปุ่ม "ขอใบวางบิลงวดนี้" (ตัวแกะเดียวกับกระดิ่งวางบิล)
   ⭐ FN = หนึ่งแถวต่อ **เส้นตาย** (รวมทุกลูกค้า) → `/finance/payments?billing=cutoff&on=<เส้นตาย>`
     ⚠️ รวมข้ามลูกค้าโดยตั้งใจ — ลิงก์กรองด้วยวันอย่างเดียว ⇒ แยกแถวต่อลูกค้าเมื่อไร หัวข้อ "N งวด" ไม่เท่ากับแถวที่ลิงก์เปิดมาเจอ
       ทันทีที่สองลูกค้ามีเส้นตายวันเดียวกัน (กติกาเดียวกับ `?billing=soon` · มติ 26/09 ข้อ 4)
     ⚠️ ทะเบียนนับจาก `billingCutoffOnIndex` (ด่านใบชุดเดียวกัน + `ledgerFlags().cutoffOn` ของตัวคิด) ⇒ เช้าที่ยิง เลขตรงกันเสมอ ·
       เปิดวันหลัง/หลังมีคนขอใบ ตัวเลขสองฝั่งต่างกันได้ (หัวข้อเป็นภาพนิ่ง ทะเบียนเป็นของสด — เหตุผลเดียวกับ BILLING_DUE_FN_HREF) */
export const BILLING_CUTOFF_KIND = 'sales_order_billing_cutoff';
export const BILLING_CUTOFF_FN_KIND = 'sales_order_billing_cutoff_fn';
/* ต่อท้ายบรรทัดรอง — ทุกงวดในแถวยังไม่มีคำร้องขอใบวางบิลที่ส่งแล้ว (ขอแล้ว = หลุดจากรอบของกระดิ่งเอง) */
export const BILLING_CUTOFF_UNREQUESTED_TEXT = 'ยังไม่ขอใบวางบิล';
/* หน้าต่างวันวางบิลของ query ใน cron — **ขอบเขตของการดึง ไม่ใช่ตัวตัดสิน** (ตัวตัดสินคือตัวคิด)
   · เส้นตายไม่เคยมาก่อนวันวางบิล (รอบแรกที่ตัดรอบ ≥ วันวางบิล + เครดิต ⇒ ตัดรอบ − เครดิต ≥ วันวางบิล) และกระดิ่งยิงไม่เกิน
     สองสามวันทำการก่อนเส้นตาย (วันหยุดยาวสงกรานต์ ≈ 6 วัน) ⇒ วันวางบิล ≤ วันนี้ + 21 ครอบแน่
   · งวดที่วันวางบิลผ่านไปแล้วแต่ยังไม่ขอใบ ยังรอรอบถัดไปของมันได้ — รอบติดกันของปฏิทิน/รายเดือน/รายสัปดาห์ห่างกันไม่เกิน ~62 วัน
     (เดือนที่ปฏิทินไม่ครอบ = ไม่มีรอบเลย) ⇒ ย้อน 70 วันครอบแน่ · เก่ากว่านั้นรอบของมันผ่านไปแล้ว ไม่มีทางยิง */
export const BILLING_CUTOFF_LOOKBACK_DAYS = 70;
export const BILLING_CUTOFF_LOOKAHEAD_DAYS = 21;
/* กุญแจกันยิงซ้ำ — หนึ่งใบ หนึ่งเส้นตาย หนึ่งจังหวะ (`next` เช้าก่อน · `today` เช้าวันสุดท้าย = สองแถวคนละวันโดยตั้งใจ)
   ⚠️ มีเส้นตายในกุญแจ — จัดวันใหม่/แก้ปฏิทินจนเส้นตายเปลี่ยน ต้องเตือนรอบใหม่ได้ */
export const billingCutoffDedupeKey = (salesOrderId, deadline, when) => `billing_cutoff:${salesOrderId}:${deadline}:${when}`;
/* FN — หนึ่งเส้นตาย หนึ่งจังหวะ ต่อคน (unique (userId, updateId)) */
export const billingCutoffFnDedupeKey = (deadline, when) => `billing_cutoff_fn:${deadline}:${when}`;

const bySeq = (a, b) => (Number(a.installment.seq) || 0) - (Number(b.installment.seq) || 0);
/* ชื่อลูกค้าในประโยคกระดิ่ง — ชื่อในทะเบียน (ไทยก่อน) ถอยไปสำเนาบนใบ · ไม่มีเลย = คำกลาง (ตัวคิดก็ถอยไปคำนี้) */
const cutoffCustomerName = (customer, order) => customerNameIn(customer) || text(order?.customerName) || 'ลูกค้า';

/**
 * กลุ่มของกระดิ่งวันตัดรอบเช้านี้ — ลูกค้า × (เส้นตาย, today|next) จาก `cutoffDigest` ของตัวคิด
 * ผ่านเมื่อ: ด่านระดับใบ (`collectibleOf` — ใบยังเก็บเงิน · งวดตรึงแล้ว · ไม่ใช่งวดยกมา · ไม่ใช่สหมิตร) + ลูกค้ารู้ตัว (มีกติกาให้อ่าน)
 *   แล้วตัวคิดตัดสินรายงวด (รอชำระ · ยอด > 0 · มีวันวางบิล · ยังไม่ขอใบ · มีรอบจ่าย · ไม่ตกปีที่ยังไม่มีปฏิทิน)
 * @param customersById ลูกค้าต้องพก `billingRule` (ไม่มี = ยังไม่ระบุ = ไม่มีรอบ = ไม่มีกระดิ่ง)
 * @param holidays      Set/Map วันหยุดของเรา — วันยิง (วันทำงานสุดท้าย ≤ เส้นตาย) · ไม่ส่ง = นับแค่เสาร์/อาทิตย์
 * @returns `[{ deadline, when, fireOn, cutoffKind, run, cutoffTime, text, ledgerHref, customer, customerName,
 *             items: [{ installment, order }] }]` เรียงเส้นตาย แล้วรหัสลูกค้า
 */
export function billingCutoffGroups(installments = [], {
  todayIso, ordersById = new Map(), customersById = new Map(), requestsById = new Map(), skipArCodes = [], holidays = null,
} = {}) {
  const skip = new Set((skipArCodes || []).map(text).filter(Boolean));
  const byCustomer = new Map();
  for (const installment of installments || []) {
    const hit = collectibleOf(installment, { ordersById, customersById, skip });
    if (!hit?.customer?.id) continue;
    const key = String(hit.customer.id);
    if (!byCustomer.has(key)) byCustomer.set(key, { customer: hit.customer, items: new Map() });
    byCustomer.get(key).items.set(String(installment.id), { installment, order: hit.order });
  }
  const out = [];
  for (const { customer, items } of byCustomer.values()) {
    const list = [...items.values()];
    const rows = list.map((item) => item.installment);
    // "ขอใบแล้ว" = คำร้องที่ส่งแล้วและยังไม่ถูกยกเลิก (ตัวเดียวกับกระดิ่งวางบิล) — ร่าง/ลิงก์ตาย = ยังรอวางบิลในรอบ
    const requestedIds = new Set(rows.filter((row) => installmentBillingRequested(row, requestsById)).map((row) => row.id));
    const customerName = cutoffCustomerName(customer, list[0]?.order);
    const groups = cutoffDigest(rows, customer.billingRule ?? null, todayIso, { holidays, customer: customerName, requestedIds });
    for (const group of groups) {
      out.push({
        ...group,
        customer,
        customerName,
        items: group.rows.map((row) => items.get(String(row.id))).filter(Boolean),
      });
    }
  }
  return out
    .filter((group) => group.items.length)
    .sort((a, b) => a.deadline.localeCompare(b.deadline)
      || text(a.customer?.arCode).localeCompare(text(b.customer?.arCode))
      || a.customerName.localeCompare(b.customerName, 'th'));
}

/**
 * แถวฝั่งขาย หนึ่งใบต่อรอบ — หัวข้อ = ประโยคของตัวคิด ("พรุ่งนี้ (พ. 21 ต.ค.) เป็นวันตัดรอบของ … — ส่งเอกสารก่อน 16:00 น.")
 * บรรทัดรอง = ใบ + งวดที่ยังรอวางบิลของรอบ (FN_LINES งวดแรกตามลำดับงวด) + "ยังไม่ขอใบวางบิล"
 * ⭐ ใบที่รอแค่งวดเดียว = ปุ่ม "ขอใบวางบิลงวดนี้" (ธงฝังท้าย href · ตัวแกะประกอบลิงก์ใหม่จากงวด/ใบสดตอนเปิดกล่อง — ดูหัวข้อ
 *   ปุ่มท้ายไฟล์) · หลายงวด = ไม่มีปุ่ม (ปุ่มเดียวผูกได้งวดเดียว) แถวพาไปแผงงวดซึ่งมีปุ่มรายงวด
 * @returns payload ของ `notifyUsers` หรือ null
 */
export function billingCutoffNotice({ group, order, items = [], directory = null } = {}) {
  const list = [...(items || [])].filter((item) => item?.installment?.id).sort(bySeq);
  if (!group?.deadline || !group.when || !text(group.text) || !order?.id || !text(order.orderNumber) || !list.length) return null;
  const userIds = billingDueRecipients(order, { directory });
  if (!userIds.length) return null;
  const rowHref = `/sa/sales-orders/${order.id}?tab=payment`;
  const lines = list.slice(0, FN_LINES).map(({ installment }) => `${installmentName(installment)} ${fmtMoney(installment.amount)}`);
  const more = list.length > FN_LINES ? ` และอีก ${list.length - FN_LINES} งวด` : '';
  return {
    userIds,
    entityType: BILLING_DUE_ENTITY_TYPE,
    entityId: order.id,
    kind: BILLING_CUTOFF_KIND,
    dedupeKey: billingCutoffDedupeKey(order.id, group.deadline, group.when),
    title: text(group.text),
    body: `${text(order.orderNumber)} ${lines.join(' / ')}${more} · ${BILLING_CUTOFF_UNREQUESTED_TEXT}`,
    href: list.length === 1 && text(order.quotationId)
      ? hrefWithAction(rowHref, billingRequestHref(order, list[0].installment))
      : rowHref,
  };
}

/**
 * แถวสรุป FN หนึ่งแถวต่อเส้นตาย — "วางบิลให้ทันรอบภายใน พ. 21 ต.ค. · N งวด ฿X · ยังไม่ขอใบวางบิล" → `?billing=cutoff&on=`
 * บรรทัดรอง: ลูกค้ารายเดียว = ประโยคของตัวคิด (มีเวลาตัดรอบ/รอบจ่าย) · หลายราย = รหัสลูกค้า + จำนวนงวด (FN_LINES รายแรก)
 * @param groups กลุ่มของ `billingCutoffGroups` ที่ **เส้นตายและจังหวะเดียวกัน** (ผู้เรียกจัดกลุ่ม — `billingCutoffNotices`)
 */
export function billingCutoffFnNotice(groups = [], { directory = null } = {}) {
  const list = (groups || []).filter((group) => group?.items?.length);
  if (!list.length) return null;
  const { deadline, when } = list[0];
  if (!deadline || !when || list.some((group) => group.deadline !== deadline || group.when !== when)) return null;
  const userIds = financeRecipientIds(directory);
  if (!userIds.length) return null;
  const items = list.flatMap((group) => group.items);
  const total = items.reduce((sum, { installment }) => sum + (Number(installment.amount) || 0), 0);
  const who = list.map((group) => `${text(group.customer?.arCode) || group.customerName} ${group.items.length} งวด`);
  const body = list.length === 1
    ? text(list[0].text)
    : `${who.slice(0, FN_LINES).join(' / ')}${list.length > FN_LINES ? ` และอีก ${list.length - FN_LINES} ราย` : ''}`;
  return {
    userIds,
    entityType: BILLING_DUE_ENTITY_TYPE,
    entityId: items[0].order.id,
    kind: BILLING_CUTOFF_FN_KIND,
    dedupeKey: billingCutoffFnDedupeKey(deadline, when),
    title: `วางบิลให้ทันรอบภายใน ${formatBillingDate(deadline, { withYear: false })} · ${items.length} งวด ${fmtMoney(total)} · ${BILLING_CUTOFF_UNREQUESTED_TEXT}`,
    body,
    href: LEDGER_HREF.cutoff(deadline),
  };
}

/**
 * รอบเช้าของกระดิ่งวันตัดรอบในคำสั่งเดียว — cron เรียกตัวนี้
 * @returns `{ groups, candidates, sales: [payload], fn: [payload] }` · `fn` ว่างทั้งที่มี candidates = ไม่มีผู้ใช้ฝ่าย FN ที่เปิดอยู่
 */
export function billingCutoffNotices(installments = [], {
  todayIso, ordersById, customersById, requestsById, skipArCodes = [], holidays = null, directory = null,
} = {}) {
  const groups = billingCutoffGroups(installments, { todayIso, ordersById, customersById, requestsById, skipArCodes, holidays });
  const sales = [];
  const byDeadline = new Map();
  for (const group of groups) {
    const byOrder = new Map();
    for (const item of group.items) {
      const key = String(item.order.id);
      if (!byOrder.has(key)) byOrder.set(key, { order: item.order, items: [] });
      byOrder.get(key).items.push(item);
    }
    for (const { order, items } of byOrder.values()) {
      const notice = billingCutoffNotice({ group, order, items, directory });
      if (notice) sales.push(notice);
    }
    const key = `${group.deadline}|${group.when}`;
    if (!byDeadline.has(key)) byDeadline.set(key, []);
    byDeadline.get(key).push(group);
  }
  const fn = [...byDeadline.values()].map((list) => billingCutoffFnNotice(list, { directory })).filter(Boolean);
  return { groups, candidates: groups.flatMap((group) => group.items), sales, fn };
}

/**
 * ธงของทะเบียน FN `?billing=cutoff&on=YYYY-MM-DD` — **ชุดเดียวกับที่หัวข้อแถว FN นับ** (เช้าที่ยิง)
 * ด่านระดับใบชุดเดียวกับกระดิ่ง (`collectibleOf`) + `ledgerFlags().cutoffOn` ของตัวคิด (เส้นตายของรอบที่งวดยังรอวางบิล —
 *   = `date` ของกระดิ่งวันตัดรอบ · ขอใบแล้ว/ไม่รอชำระ/ยอด 0/ไม่มีรอบ = ไม่มีธง)
 * ⚠️ ไม่ขึ้นกับ "วันนี้" ต่างจากตัวคัดของกระดิ่ง (ยิงแค่สองเช้า) — ลิงก์เปิดวันไหนก็ได้งวดของเส้นตายนั้นที่ยังรอวางบิลอยู่จริง
 * @returns Map installmentId → เส้นตาย
 */
export function billingCutoffOnIndex(installments = [], {
  todayIso, ordersById = new Map(), customersById = new Map(), requestsById = new Map(), skipArCodes = [],
} = {}) {
  const skip = new Set((skipArCodes || []).map(text).filter(Boolean));
  const out = new Map();
  for (const installment of installments || []) {
    const hit = collectibleOf(installment, { ordersById, customersById, skip });
    if (!hit?.customer) continue;
    const requested = installmentBillingRequested(installment, requestsById);
    const on = ledgerFlags(installment, hit.customer.billingRule ?? null, { todayIso, requested }).cutoffOn;
    if (on) out.set(installment.id, on);
  }
  return out;
}

/* ══ v5 · กระดิ่ง "ขอปฏิทินปีหน้า" (`customer_billing_calendar_missing`) ═════════════════════════════════════════
   มติเจ้าของ 29/09 (Q3 "หยุดรอปฏิทินใหม่"): ปีที่ยังไม่มีปฏิทิน ระบบไม่คิดกำหนดชำระให้ ⇒ ต้องมีคนไปขอปฏิทินจากลูกค้าก่อนถึงปีนั้น
   · เมื่อไร = `calendarReminder` ของตัวคิด (ตั้งแต่ 1 ธ.ค. หรือ 30 วันก่อนวันตัดรอบสุดท้าย อันไหนก่อน · ทุกวันทำงาน · กุญแจรายสัปดาห์
     อา–ส ⇒ ตารางกระดิ่งเก็บแถวแรกของสัปดาห์แถวเดียว = ซ้ำทุกสัปดาห์ · มีเมตตา: จ. 23 พ.ย. 2026) · หยุดเองเมื่อใส่ปีถัดไปแล้ว
   · ใคร = ฝ่ายขายทีมที่ดูแลลูกค้า (คนที่แก้กำหนดวางบิลของลูกค้าได้จริง) + ทั้งฝ่าย FN (ข้อยกเว้นมติ 14 ชุดเดียวกับแถวสรุป FN)
   · แถวผูก entity **ลูกค้า** (มีเธรด · ลบลูกค้าแล้วแถวถูกกวาดตาม) → การ์ดกำหนดวางบิล `#billing-rule` (แถบ "ขอปฏิทิน YYYY" + ปุ่มใส่ปฏิทิน) */
export const CALENDAR_MISSING_KIND = 'customer_billing_calendar_missing';
export const CALENDAR_MISSING_ENTITY_TYPE = 'customer';

/**
 * ผู้รับของกระดิ่งขอปฏิทิน — ฝ่ายขายที่ **อยู่ทีมที่ดูแลลูกค้า และแก้กำหนดวางบิลได้** (`canEditCustomerBillingRule` ตัวเดียวกับ API) + FN
 * ⚠️ ลูกค้าไม่มีทีม (ของกลาง) = ไม่มีฝ่ายขายรับ เหลือ FN — ด่านแก้ของลูกค้าไร้ทีมเปิดให้ทุกคนที่ถือ customers:edit ⇒ ถามด่านนั้นตรง ๆ
 *   = กระดิ่งถึงฝ่ายขายทั้งบริษัททุกสัปดาห์ (ต้องอยู่ในทีมจริงก่อนเสมอ)
 * ⚠️ ไม่รวม admin แม้อยู่ในทีม (บัญชีดูแลระบบ — กติกาเดียวกับ `financeRecipientIds`) · ตัดคนที่ปิดบัญชีแล้ว
 */
export function calendarMissingRecipients(customer, directory) {
  const teams = caretakerTeamsOf(customer);
  const sales = teams.length && directory?.values
    ? [...directory.values()]
      .filter((user) => user?.id && !user.disabled && user.role !== 'admin'
        && hasTeam(user, teams) && canEditCustomerBillingRule(user, customer))
      .map((user) => String(user.id))
    : [];
  return [...new Set([...sales, ...financeRecipientIds(directory)])];
}

/**
 * แถวกระดิ่งขอปฏิทินของลูกค้าหนึ่งราย — null เมื่อยังไม่ถึงช่วงเตือน · ไม่ใช่วันทำงาน · มีปีถัดไปแล้ว · ไม่มีผู้รับ
 * ⚠️ ลูกค้าต้องพก `billingRule` + `team`/`teams` (ผู้รับ) + `arCode`/`name`/`nameEn` (ข้อความ)
 */
export function calendarMissingNotice({ customer, todayIso, holidays = null, directory = null } = {}) {
  if (!customer?.id) return null;
  const rule = customer.billingRule ?? null;
  const name = customerNameIn(customer) || text(customer.arCode) || 'ลูกค้า';
  const reminder = calendarReminder(rule, todayIso, { holidays, customerId: customer.id, customer: name });
  if (!reminder) return null;
  const userIds = calendarMissingRecipients(customer, directory);
  if (!userIds.length) return null;
  // "ขอปฏิทิน 2027" · ปฏิทินครึ่งปี = "ขอปฏิทิน 2027 ตั้งแต่ ก.ค." — คำเดียวกับแถบบนการ์ดลูกค้า (`requestText` ของตัวคิด)
  const request = text(calendarStatus(rule, todayIso, { holidays })?.requestText) || `ขอปฏิทิน ${reminder.year}`;
  return {
    userIds,
    entityType: CALENDAR_MISSING_ENTITY_TYPE,
    entityId: customer.id,
    kind: CALENDAR_MISSING_KIND,
    dedupeKey: reminder.key,
    title: reminder.text,
    body: [
      text(customer.arCode),
      `${request} จากลูกค้าแล้วใส่ที่การ์ดกำหนดวางบิล — งวดที่ตกช่วงที่ยังไม่มีปฏิทิน ระบบไม่คิดกำหนดชำระให้ (${CALENDAR_MANUAL_HINT})`,
    ].filter(Boolean).join(' · '),
    href: reminder.href,
  };
}

/**
 * รอบเช้าของกระดิ่งขอปฏิทิน — cron เรียกตัวนี้กับลูกค้าที่วางบิลตามปฏิทิน (`billingRule->runs->>kind = calendar`)
 * ⚠️ ข้ามลูกค้าที่ปิดใช้งาน (`isActive === false` — ไม่มีงานให้วางบิลแล้ว) และลูกค้านอกระบบ (`skipArCodes` · สหมิตร)
 * @returns `{ notices, due, unrouted }` · `due` = ลูกค้าที่ถึงช่วงเตือนเช้านี้ · `unrouted` = ถึงช่วงแต่ไม่มีผู้รับเลย (ผู้เรียกรายงาน error)
 */
export function calendarMissingNotices(customers = [], { todayIso, holidays = null, directory = null, skipArCodes = [] } = {}) {
  const skip = new Set((skipArCodes || []).map(text).filter(Boolean));
  const notices = [];
  let due = 0;
  let unrouted = 0;
  for (const customer of customers || []) {
    if (!customer?.id || customer.isActive === false || skip.has(text(customer.arCode))) continue;
    if (!calendarReminder(customer.billingRule ?? null, todayIso, { holidays, customerId: customer.id })) continue;
    due += 1;
    const notice = calendarMissingNotice({ customer, todayIso, holidays, directory });
    if (notice) notices.push(notice); else unrouted += 1;
  }
  return { notices, due, unrouted };
}

/* ── ปุ่ม "ขอใบวางบิลงวดนี้" ในแถวกระดิ่ง (รอบสอง 26/09) — ตัวตัดสินล้วน ตัวโหลดอยู่ที่ lib/notifications.js ──────
   ปุ่มขึ้นเมื่องวดยัง "ขอใบได้" **ตอนเปิดกล่อง** ไม่ใช่ตอน cron ยิง (แถวอยู่ในกล่องหลายวัน)
   ตัดสินสองชั้น — **ไม่ใช่ "กติกาเดียวกับแผงงวด" ทั้งก้อน** (review รอบสอง 26/09: ข้อความเดิมอ้างเกินจริง):
   1. ชั้นใบ (`billingDueAction`) = **ล็อกทั้งใบตัวเดียวกับที่ `gate(row, "link")` ของแผงงวดและ PATCH `link` ส่ง**
      (`historicalInstallmentLock(order) || pipelineInstallmentLock(order, 'link')`) + ใบต้องอ้าง QT
      ⇒ ใบยกเลิก · ใบที่ถูกออก Rev. ทับ · ร่างที่ QT ถูกถอด Won · ใบย้อนหลังที่ยังไม่อนุมัติ = ไม่มีปุ่ม
      🐞 เดิมถามแค่งวด ⇒ ใบที่ถูกยกเลิกหลังกระดิ่งยิง ปุ่มยังขึ้น แล้วคำร้องวางบิลของใบยกเลิกวิ่งถึง FN
         (ร่างบันทึกได้ — ฟอร์มไม่ดูสถานะใบ · มีแต่ตัวผูกงวดที่ตีกลับด้วย PIPELINE_CANCELLED_LOCK)
   2. ชั้นงวด (`billingDueActionOpen`) **แคบกว่าเมนูแถวของแผงโดยตั้งใจ** — แผงเปิด "ขอใบวางบิลงวดนี้" ให้งวดที่รับรองแล้วด้วย
      (ใบเสร็จหลังเงินเข้า) แต่ปุ่มในกระดิ่งเป็นเรื่องวางบิล ⇒ งวดจบแล้ว (แจ้งชำระ/รับเงิน/คืนเงิน) · งวดยกมา = ไม่มีปุ่ม
   ⚠️ ด่านสิทธิ์ `salesplan:edit` ของ `link` ไม่ได้ถามที่นี่ — ตัวแกะไม่รู้ว่าใครเปิดกล่อง · ผู้รับคือเจ้าของดีล/เจ้าของใบ
      (ฝ่ายขาย) · คนที่ไม่มีสิทธิ์กดแล้วได้ร่างคำร้อง + คำเตือนจากตัวผูก (lib/requests/billingInstallmentLink.js)
   ⭐ **ลิงก์ของปุ่มประกอบใหม่จากงวด/ใบสด** (`billingRequestHref(order, installment)`) ไม่ใช่ลิงก์ที่ฝังตอนยิง:
      · ออก Rev. หลังกระดิ่งยิง — 0376 ย้ายงวดทั้งแถว (id เดิม) ไปร่าง Rev. แต่วันวางบิลไม่เปลี่ยน ⇒ dedupeKey เดิม ไม่มีแถวใหม่
        ลิงก์ที่ฝังยังชี้ใบที่ถูกทับ ⇒ คำร้องบันทึกกับใบตาย แล้วตัวผูกตีกลับ "งวดที่กดมาไม่อยู่ในใบสั่งขายที่คำร้องอ้าง"
        ⇒ ประกอบจาก `installment.salesOrderId` สด = ชี้ร่าง Rev. ซึ่งแผงก็เปิดให้ขอ/ผูก (มติ D3)
      · จัดวันใหม่ตามรอบ / แก้วันรายงวด / ปรับแผน (0377) เปลี่ยนวันวางบิลหรือยอด ⇒ เติมค่าสด ไม่ใช่วัน/ยอดของเช้าที่ยิง
*/

/**
 * ชั้นงวดของปุ่ม — งวดยังรอเงินและ **ยังไม่ผูกคำร้องใด ๆ**
 *
 * ⭐ ซ่อนเมื่องวด **ผูกคำร้องแล้ว ไม่ว่าสถานะไหน** — ตรงกับเงื่อนไข `!row.billingRequestId` ของปุ่มในแผงงวด
 *   (`billingAskInCell` · เมนูแถว) · เข้มกว่า "ขอใบแล้ว" (`billingRequestLive`) โดยตั้งใจ:
 *   · ร่างที่ผูกอยู่ = SA เริ่มขอไปแล้วแต่ยังไม่ส่ง ⇒ กดอีกได้ร่างใบที่สอง และตัวผูกอัตโนมัติถือร่างเป็นลิงก์ตาย
 *     (`billingLinkDead`) แล้ว **ย้ายลิงก์ไปใบใหม่** ⇒ ร่างแรกลอยค้างไม่มีใครเห็น
 *   · คำร้องที่ส่งแล้ว = ขอแล้ว — ตัวผูกไม่ทับ แต่ **ใบร่างใหม่ยังถูกบันทึก** (ตอบ 201 + คำเตือน "ผูกคำร้องอื่นไว้แล้ว")
 *     ⇒ ไม่ซ่อน = ได้คำร้องซ้ำจริง ไม่ใช่แค่ถูกปฏิเสธ
 *   · ลิงก์ตาย (ยกเลิก/ลบ) = แผงงวดก็ไม่มีปุ่มขอ (ต้องถอดก่อน) ⇒ แถวยังพาไปแผงให้จัดการ
 *   กระดิ่งยังเตือนตามกติกา "ขอใบแล้ว" เดิม (ร่าง = ยังเตือน) — เรื่องของปุ่มกับเรื่องของการเตือนแยกกัน
 * ⚠️ งวดที่หาไม่เจอ (ลบใบ/ปรับแผนสร้างงวดชุดใหม่ · อ่านพลาด) = ไม่มีปุ่ม — แถวยังพาไปแผงงวดตามเดิม
 * ⚠️ งวดจบแล้ว · งวดยกมา = ไม่มีปุ่ม — ถาม `billingState` ตัวเดียวกับทุกจอ ไม่เขียนกติกาเอง
 */
export function billingDueActionOpen(installment, rule = null) {
  if (!text(installment?.id) || text(installment.billingRequestId)) return false;
  /* ⭐ รุ่นสี่ (system-design §6 "สิ่งที่หายไปสำหรับลูกค้าไม่ต้องวางบิล"): ปุ่มในกระดิ่งถาม `canRequestBilling` ตัวเดียวกับเมนูแถว
       ของแผงงวด — งวดที่ไม่ต้องวางบิล (ติ๊ก `billingSkip` · ลูกค้าไม่ต้องวางบิลและงวดไม่มีวันวางบิล) = ไม่มีปุ่ม · งวดที่มีวันวางบิล
       ขอได้เสมอ (ข้อยกเว้น "งวดนี้ต้องวางบิล") · วันวางบิลถูกล้างแต่ลูกค้ายังต้องวางบิล/ยังไม่ระบุ = ยังขอได้ (เหมือนแผงงวด)
       ⚠️ `rule` = กติกาของลูกค้าของใบ (ไม่ส่ง = ยังไม่ระบุ ⇒ ตัดสินจากงวดล้วน) — ตัวโหลดใน lib/notifications.js อ่านสดส่งมาทุกครั้ง */
  if (!canRequestBilling(installment, rule)) return false;
  const { key } = billingState(installment);
  return key !== 'settled' && key !== 'carried';
}

/**
 * ปุ่มของแถว — `{ href, label }` หรือ null (ชั้นงวด + ชั้นใบ · ดูหัวข้อด้านบน)
 * @param installment งวดสด (`id` `salesOrderId` `amount` `status` `kind` `refundedAt` `billingDate` `billingRequestId`)
 * @param order       ใบสดของ **`installment.salesOrderId`** (`id` `status` `origin` `quotationId`) · ต้องแนบ
 *                    `quotation: { status, quoteNumber }` ถ้าจะตัดร่างที่ QT ถูกถอด Won (ไม่มีค่า = ด่านนั้นไม่ตัดสิน
 *                    เหมือน `pipelineInstallmentLock` ทุกที่) · ไม่มีใบ = ไม่มีปุ่ม
 * @param rule        กติกาของลูกค้าของใบ (รุ่นสี่ · `canRequestBilling`) — ไม่ส่ง = ยังไม่ระบุ · งวดที่มี `billingSkip` ตัดเองได้
 */
export function billingDueAction(installment, order, { rule = null } = {}) {
  if (!billingDueActionOpen(installment, rule)) return null;
  /* ใบต้องเป็นใบที่งวดอยู่ **ตอนนี้** — ผู้เรียกส่งใบผิด (เช่นใบเดิมก่อนออก Rev.) แล้วลิงก์พาไปผูกงวดกับใบที่ไม่ใช่บ้านของมัน
     · ใบที่ไม่อ้าง QT (ใบย้อนหลัง) ขอเอกสารการเงินไม่ได้ — ฟอร์มกับตัวผูกตีกลับ */
  if (!order || text(order.id) !== text(installment.salesOrderId) || !text(order.quotationId)) return null;
  if (historicalInstallmentLock(order) || pipelineInstallmentLock(order, 'link')) return null;
  return { href: billingRequestHref(order, installment), label: BILLING_DUE_ACTION_LABEL };
}

/* id งวดจากลิงก์ของปุ่ม (`installmentId=` ของ billingRequestHref) — ตัวโหลดใช้หางวดสด · ไม่มี/อ่านไม่ออก = '' */
export function billingDueActionInstallmentId(actionHref) {
  const value = String(actionHref ?? '');
  const queryAt = value.indexOf('?');
  if (queryAt < 0) return '';
  return text(new URLSearchParams(value.slice(queryAt + 1).split('#')[0]).get('installmentId'));
}
