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
// ⚠️ **kind ต้องเป็นค่าคงที่ประกาศตรง ๆ ในไฟล์นี้** — ยามกันดริฟต์ใน `notifications.test.mjs` กวาดทั้ง
//    `src/` หา `_KIND = 'sales_order_…'` แล้วเทียบกับ `SALES_ORDER_BELL_KINDS` · ประกอบจาก template
//    string เมื่อไร ยามมองไม่เห็นแล้วแถวหายจากกระดิ่งเงียบ ๆ (ไปโผล่แค่หน้าเต็ม /notifications)
import { fmtMoney } from '@/lib/format';
import { customerNameIn } from '@/lib/master/customerName';
import { departmentOf } from '@/lib/permissions';
import { historicalInstallmentLock, isOpeningInstallment } from '@/lib/sales/historicalOrders';
import { installmentVoid, paymentNotRequired, pipelineInstallmentLock } from '@/lib/sales/salesOrderPayments';
import {
  BILLING_REMIND_DAYS, billingRequestLive, billingState, formatBillingDate, needsBillingReminder,
} from '@/lib/sales/billingRule';
import { billingRequestHref } from '@/lib/sales/billingRequestHref';
import { hrefWithAction } from '@/lib/notificationAction';

export const BILLING_DUE_KIND = 'sales_order_billing_due';
export const BILLING_DUE_FN_KIND = 'sales_order_billing_due_fn';
/* ใบสั่งขายไม่มีเธรด (มติ) ⇒ เข้ากระดิ่งทาง `kinds` · entityId = id ของ **ใบ** ไม่ใช่งวด —
   ลบใบแล้ว `purgeUpdates('sales_order', id)` กวาดแถวกระดิ่งตามไปด้วย (id อื่นเหลือแถวที่กดแล้วไปไม่ถึงไหน) */
export const BILLING_DUE_ENTITY_TYPE = 'sales_order';
/* ตัวกรอง `billing=soon` ของทะเบียนการชำระ = **ชุดเดียวกับที่หัวข้อแถว FN นับ** ("ถึงรอบใน 3 วัน · ยังไม่ขอใบ")
   ⭐ รอบสอง 26/09 (มติเจ้าของ ข้อ 4): เดิมลิงก์ไป `?billing=7d` ซึ่งกว้างกว่าโดยตั้งใจ (รวมงวดที่ขอใบแล้ว + 4–7 วัน)
     ⇒ หัวข้อบอก "2 งวด" แต่เปิดมาเจอ 6 งวด แล้วไม่มีใครบอกได้ว่าสองงวดไหน · ตอนนี้ทะเบียนถามตัวคัด
     `billingDueCandidates` ตัวเดียวกับ cron (api/finance/payments) ⇒ ตัวเลขบนกระดิ่ง = จำนวนแถวที่เปิดมาเจอ **ในเช้าวันที่ยิง**
     ⚠️ หัวข้อเป็นภาพนิ่งของเช้าวันที่ยิง ส่วนทะเบียนนับข้อมูลสดของ **วันนี้** — แถวค้างในกล่องหลายวัน ⇒ เปิดวันหลัง
       หรือหลังมีคนขอใบ/แจ้งชำระ/แก้วันวางบิล ตัวเลขสองฝั่งต่างกันได้ (ไม่ใช่บั๊ก · ทะเบียนคือความจริงของตอนนี้) */
export const BILLING_DUE_FN_HREF = '/finance/payments?billing=soon';
/* ป้ายปุ่มในแถวฝั่งขาย — คำเดียวกับปุ่มในแผงงวด (SalesOrderPaymentPanel) */
export const BILLING_DUE_ACTION_LABEL = 'ขอใบวางบิลงวดนี้';

/* กุญแจกันยิงซ้ำ — หนึ่งงวด หนึ่งวันวางบิล หนึ่งครั้ง (มติ "ครั้งเดียวต่องวดต่อวันวางบิล")
   ⚠️ ต้องมีวันวางบิลในกุญแจ — แก้วันวางบิลของงวดแล้วต้องเตือนได้อีกครั้ง · กุญแจที่มีแต่ id จะกลืนรอบใหม่ทิ้ง
   ⚠️ หน้าต่างเตือน 0..N วัน ⇒ cron เจองวดเดียวกันหลายเช้าติดกัน กุญแจนี้คือสิ่งที่ทำให้เด้งแค่เช้าแรก */
export const billingDueDedupeKey = (installmentId, billingDate) => `billing_due:${installmentId}:${billingDate}`;
/* FN ได้แถวสรุปวันละแถว (กติกาผู้รับ "หนึ่งคนหนึ่งเด้งต่อวัน") — unique (userId, updateId) ⇒ ต่อคนต่อวัน */
export const billingDueFnDedupeKey = (todayIso) => `billing_due_fn:${todayIso}`;

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

/**
 * งวดที่ต้องเตือน "ถึงรอบวางบิล" วันนี้ — ตัวคัดเดียวของทั้งฝั่งขายและฝั่ง FN
 *
 * ผ่านเมื่อครบทุกข้อ:
 *   · งวดหยุดยอดแล้ว (`frozenAt`) — งวดร่างยอดยังเดินตามแผนของ QT (ทะเบียน FN ก็ไม่แสดง)
 *   · ไม่ใช่งวดยกมาของใบย้อนหลัง (มติ 10: งวดยกมาไม่มีวันวางบิลเลย)
 *   · ใบยังต้องตามเก็บเงิน (`orderCollecting` — ด่านงวดของแผง/API · ไม่ใช่ใบยอด 0 · งวดไม่โมฆะ)
 *   · ไม่ใช่ลูกค้าที่เก็บเงินนอกระบบ (`skipArCodes` — สหมิตร AR-109 · มติ 24/09 เงินสหมิตรอยู่นอกระบบ)
 *   · `needsBillingReminder` — รอชำระ (`pending` เท่านั้น: แจ้งชำระแล้ว = ลูกค้าจ่ายแล้ว) · ยอด > 0 ·
 *     วันวางบิลอยู่ในหน้าต่าง 0..BILLING_REMIND_DAYS วัน · ยังไม่มีคำร้องขอใบวางบิลที่ส่งแล้วผูกอยู่
 *
 * @param installments แถว `sales_order_installments`
 * @param ordersById   Map id → ใบ (`status` `origin` `totalAmount` `customerId` …) — ใบต้องมี `deal` ติดมาถ้าจะรู้เจ้าของดีล
 *                     และ `quotation` ({ status, quoteNumber }) ถ้าจะตัดร่างที่ QT ถูกถอด Won แล้ว
 * @param customersById Map id → ลูกค้า (`arCode` `name` `nameEn`)
 * @param requestsById Map id → คำร้อง (`status`)
 * @param skipArCodes  รหัสลูกค้าที่ไม่เตือน — ผู้เรียกส่ง `SAHAMIT_AR_CODE` (ค่าคงที่บ้านเดียวอยู่ที่ lib/sahamit/server.js
 *                     ซึ่งลาก auth ของ server มาด้วย ⇒ ไฟล์บริสุทธิ์นี้ไม่ import เอง)
 * @returns `[{ installment, order, customer }]` เรียงตามวันวางบิล
 */
export function billingDueCandidates(installments = [], {
  todayIso, ordersById = new Map(), customersById = new Map(), requestsById = new Map(), skipArCodes = [],
} = {}) {
  const skip = new Set((skipArCodes || []).map(text).filter(Boolean));
  const out = [];
  for (const installment of installments || []) {
    if (!installment?.id || !installment.frozenAt) continue;
    if (isOpeningInstallment(installment)) continue;
    const order = ordersById.get(installment.salesOrderId);
    /* `installmentVoid` = ตัวตัดสินงวดโมฆะตัวเดียวของทั้งระบบ — วันนี้ด่านใบข้างบนตัดใบยกเลิก/ถูกออก Rev. ทับไปก่อนแล้ว
       แต่คงไว้เป็นเข็มขัด: ด่านใบเปลี่ยนเมื่อไร (เช่นปล่อยบางคำสั่งบนใบยกเลิก) งวดโมฆะต้องยังไม่ถูกเตือน */
    if (!orderCollecting(order) || installmentVoid(installment, order)) continue;
    const customer = order.customerId ? customersById.get(order.customerId) || null : null;
    if (customer && skip.has(text(customer.arCode))) continue;
    const requested = installmentBillingRequested(installment, requestsById);
    if (!needsBillingReminder(installment, { todayIso, requested })) continue;
    out.push({ installment, order, customer });
  }
  return out.sort(byBillingDate);
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
    title: `ถึงรอบวางบิล ${when} · ${text(order.orderNumber)} ${installmentName(installment)} ${fmtMoney(installment.amount)}`,
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
export function billingDueActionOpen(installment) {
  if (!text(installment?.id) || text(installment.billingRequestId)) return false;
  const { key } = billingState(installment);
  return key !== 'settled' && key !== 'carried';
}

/**
 * ปุ่มของแถว — `{ href, label }` หรือ null (ชั้นงวด + ชั้นใบ · ดูหัวข้อด้านบน)
 * @param installment งวดสด (`id` `salesOrderId` `amount` `status` `kind` `refundedAt` `billingDate` `billingRequestId`)
 * @param order       ใบสดของ **`installment.salesOrderId`** (`id` `status` `origin` `quotationId`) · ต้องแนบ
 *                    `quotation: { status, quoteNumber }` ถ้าจะตัดร่างที่ QT ถูกถอด Won (ไม่มีค่า = ด่านนั้นไม่ตัดสิน
 *                    เหมือน `pipelineInstallmentLock` ทุกที่) · ไม่มีใบ = ไม่มีปุ่ม
 */
export function billingDueAction(installment, order) {
  if (!billingDueActionOpen(installment)) return null;
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
