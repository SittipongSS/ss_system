// ── โหมดตั้งวันงวดในตาราง (แบบ C · มติเจ้าของ 28/09) — ร่างวัน · สรุปการเปลี่ยน · เหตุที่ล็อก · คำเตือนลำดับ ──
//
// ⭐ แทนโมดัลรายงวดทั้งสองแบบ + ปุ่ม "เติมตามรอบ" / "จัดวันใหม่ตามรอบปัจจุบัน" ของแผงงวดบนใบ SO
//   ม็อก `mockups/billing-cycle/installment-v2/c.html` + ของที่ยืมจาก `recommended.html` (ดู index.html)
//   · คนแตะวันลง **ร่าง** ในตารางได้หลายงวด แล้วกดบันทึกครั้งเดียว (`schedule-many`) — ไม่มีอะไรลงฐานระหว่างแตะ
//   · ตัวเติมหลายงวด ("เติมวันงวดที่ว่าง…") เขียนร่างอย่างเดียว คนดูในตารางก่อนบันทึกเสมอ
//
// ⚠️ ไฟล์นี้ไม่คิดวันเอง — รอบ/เครดิต/เดือนในชื่องวดมาจาก `billingRule.js` ที่เดียว (planMonthlyFill · planRedate ·
//    planCreditCadence · planNoCreditDates · billingRounds · dueDateForBilling · creditCadenceSuggestion)
//    ที่นี่แค่ต่อสายกับร่าง + เลขคณิตเดือนเล็ก ๆ ของชิปทางลัด (สตริง YYYY-MM-DD ล้วน ไม่มีโซนเวลา)
// ⚠️ ไม่อ่านนาฬิกา — `todayIso` มาจาก `businessDate()` ของผู้เรียก (นาฬิกาไทย · check:thaitime)
// ⚠️ สองช่องแยกกันเสมอ: `billingDate` = วันวางบิล · `dueDate` = กำหนดชำระ (ป้ายแดง "เลยกำหนด" + ด่านนัดช่างอ่านช่องนี้)
//    · `billingEvent` = รอเหตุการณ์ (ไม่มีวันวางบิลคู่กันได้ — CHECK ของ mig 0389)

import { addDays, daysBetween } from './paymentCoverage.js';
import { installmentDateLock } from './installmentScheduleMany.js';
import {
  BILLING_EVENT_MAX, PAY_ON_BILLING_TEXT, billingRounds, creditCadenceSuggestion, dueDateForBilling, effectiveBillingRule,
  installmentBillingFillable, installmentBillingRedatable, installmentLabelMonth, planCreditCadence, planMonthlyFill,
  planNoCreditDates, planRedate,
} from './billingRule.js';

const dateOf = (value) => {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const [y, m, d] = text.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return m >= 1 && m <= 12 && d >= 1 && d <= last ? text : '';
};
const pad = (n) => String(n).padStart(2, '0');
const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/* วันที่ `day` ของ (ปี, เดือน + เลื่อน) — เดือนที่ไม่มีวันนั้นใช้วันสุดท้าย (กติกาเดียวกับ billingRule.js) */
function dayOfMonth(year, month, day) {
  const y = year + Math.floor((month - 1) / 12);
  const m = ((month - 1) % 12 + 12) % 12 + 1;
  return `${y}-${pad(m)}-${pad(Math.min(day, lastDayOf(y, m)))}`;
}
const partsOf = (iso) => iso.split('-').map(Number);
/* 'YYYY-MM' ถัดไป n เดือน */
export function shiftMonth(month, n) {
  const [y, m] = String(month).split('-').map(Number);
  return dayOfMonth(y, m + n, 1).slice(0, 7);
}

/* ── ค่าของหนึ่งงวด ────────────────────────────────────────────────────────────────────────────
   `{ billingDate, billingEvent, dueDate }` — สตริงว่าง = ไม่มี (ช่อง DateInput/Input อ่านสตริง) · ส่งเข้า API ผ่าน
   `scheduleManyRows` เท่านั้น (แปลงว่างเป็น null) */
export const EMPTY_DATES = Object.freeze({ billingDate: '', billingEvent: '', dueDate: '' });

export function datesOf(row) {
  const billingDate = dateOf(row?.billingDate);
  /* วันวางบิลกับเหตุการณ์ไม่มาคู่กัน (CHECK) — แถวเก่าที่มีทั้งคู่ถือวันเป็นหลัก */
  const billingEvent = billingDate ? '' : String(row?.billingEvent ?? '').trim().slice(0, BILLING_EVENT_MAX);
  return { billingDate, billingEvent, dueDate: dateOf(row?.dueDate) };
}

export const sameDates = (a, b) => {
  const x = datesOf(a);
  const y = datesOf(b);
  return x.billingDate === y.billingDate && x.billingEvent === y.billingEvent && x.dueDate === y.dueDate;
};
export const datesEmpty = (value) => {
  const v = datesOf(value);
  return !v.billingDate && !v.billingEvent && !v.dueDate;
};

/* ── ร่าง ─────────────────────────────────────────────────────────────────────────────────────
   `drafts` = `{ [rowId]: { billingDate, billingEvent, dueDate, baseUpdatedAt } }` — **เฉพาะงวดที่ต่างจากฐาน**
   · ร่างที่กลับมาเท่าค่าในฐานถูกถอดออกเอง ⇒ "เปลี่ยน N งวด" นับจากความต่างจริง ไม่ใช่จากการเคยแตะ
   · `baseUpdatedAt` = updatedAt ของแถวที่ตาเห็นตอนเริ่มร่าง — หน้าโหลดงวดสด (409) แล้วต่างกัน = "ถูกแก้จากอีกหน้าต่าง" */
export function currentDates(row, drafts) {
  const draft = row?.id ? drafts?.[row.id] : null;
  return draft ? datesOf(draft) : datesOf(row);
}

/* ⚠️ ชื่อเหตุการณ์เก็บ **ตามที่พิมพ์** (ตัดแค่ความยาว) — ตัดช่องว่างเฉพาะตอนเทียบ (`sameDates` ผ่าน datesOf) และตอนส่ง
   (`scheduleManyRows`) · 🐞 review R-UI: เดิมเก็บ `datesOf(value)` ที่ trim ทุกครั้ง ⇒ พิมพ์ "รอ " แล้วช่องว่างหาย กลายเป็น "รอPO"
   (ช่องพิมพ์เองของตัวแก้ถือข้อความของมันเอง แต่ร่างต้องไม่กินช่องว่างกลางคำระหว่างพิมพ์) */
export function withDraft(drafts, row, value) {
  const next = { ...(drafts || {}) };
  if (!row?.id) return next;
  const clean = datesOf(value);
  if (sameDates(clean, row)) {
    delete next[row.id];
    return next;
  }
  const baseUpdatedAt = drafts?.[row.id]?.baseUpdatedAt ?? (row.updatedAt || '');
  const billingEvent = clean.billingDate ? '' : String(value?.billingEvent ?? '').slice(0, BILLING_EVENT_MAX);
  next[row.id] = { ...clean, billingEvent, baseUpdatedAt };
  return next;
}

/**
 * งวดที่เปลี่ยนจริงตอนนี้ (เรียงตามงวด) — ร่างของงวดที่หายไป/ล็อกแล้ว (หลังหน้าโหลดงวดสด) ถูกแยกออกไปที่ `dropped`
 * @param lockOf (row) => { reason } | null — ตัวเดียวกับที่วาดเซลล์ล็อก
 * @returns `{ changes: [{ row, from, to, stale }], dropped: [{ row|null, id, reason }] }`
 *   `stale` = แถวในฐานเปลี่ยนหลังเริ่มร่าง (บอกคนก่อนบันทึก — ร่างยังอยู่ ส่งตัวล็อกใหม่ตอนกดอีกครั้ง)
 */
export function draftChanges(rows = [], drafts = {}, lockOf = () => null) {
  const byId = new Map((rows || []).map((row) => [row.id, row]));
  const changes = [];
  const dropped = [];
  for (const [id, draft] of Object.entries(drafts || {})) {
    const row = byId.get(id);
    if (!row) { dropped.push({ row: null, id, reason: 'งวดนี้ไม่อยู่ในใบแล้ว' }); continue; }
    const lock = lockOf(row);
    if (lock) { dropped.push({ row, id, reason: lock.reason }); continue; }
    if (sameDates(draft, row)) continue;
    const base = String(draft.baseUpdatedAt || '');
    const stale = Boolean(base && row.updatedAt && base !== String(row.updatedAt));
    changes.push({ row, from: datesOf(row), to: datesOf(draft), stale });
  }
  const bySeq = (a, b) => Number(a.row?.seq ?? 0) - Number(b.row?.seq ?? 0);
  return { changes: changes.sort(bySeq), dropped: dropped.sort(bySeq) };
}

/* งวดที่กำหนดชำระในฐานถูกแทน/ล้าง — ป้ายเลยกำหนดและด่านนัดช่างนับจากวันใหม่ทันที (ต้องบอกก่อนบันทึก) */
export const replacesSavedDue = (change) => Boolean(change?.from?.dueDate) && change.from.dueDate !== change.to.dueDate;

/**
 * body ของ `PATCH …/installments { action: 'schedule-many', rows }` (สัญญากับ R-API)
 * `updatedAt` = ของแถวที่ตาเห็น **ตอนนี้** — หลัง 409 หน้าโหลดงวดสดแล้วแผงบอกงวดที่เปลี่ยนใต้มือ (`stale`) ก่อน
 * คนกดบันทึกอีกครั้ง = รับรู้แล้ว ⇒ ส่งตัวล็อกของแถวใหม่ (ไม่งั้น 409 วนไม่จบ — บทเรียนเดียวกับ `live()` ของแผง)
 */
export function scheduleManyRows(changes = []) {
  return changes.map(({ row, to }) => ({
    id: row.id,
    billingDate: to.billingDate || null,
    billingEvent: to.billingDate ? null : (to.billingEvent.trim() || null),
    dueDate: to.dueDate || null,
    updatedAt: row.updatedAt || null,
  }));
}

/* ── รูปของรอบลูกค้า → ตัวแก้แบบไหน (อ่านผ่าน `effectiveBillingRule` ตัวเดียว · มติ 28/09 ข้อ 17) ──────────────────
   'monthly' = วางบิลเป็นรอบรายเดือน (1–4 รอบ) · 'anyday' = วางบิลได้ทุกวัน (เครดิต N วัน · เงินเข้าตามวันที่ ·
               **ไม่มีเครดิต** = ชำระวันวางบิล — ทางเดียวกับเครดิต ไม่มีสาขาแยก)
   'none'    = ยังไม่ตั้ง / รูปผิด — กรอกได้ทั้งวันวางบิล (ไม่บังคับ) และกำหนดชำระ แต่ไม่มีอะไรคิดให้ */
export function dateRuleKind(value) {
  const rule = effectiveBillingRule(value);
  if (!rule) return 'none';
  return rule.billing.mode === 'monthly' ? 'monthly' : 'anyday';
}
/* เครดิต N วัน (null = ไม่ใช่เครดิตเป็นวัน) · ไม่มีเครดิต = 0 (ชำระวันวางบิล — คำบนจอถาม `dueSourceOf`/`noCredit` ห้ามพูด "เครดิต 0 วัน") */
export function creditDaysOf(value) {
  const rule = effectiveBillingRule(value);
  return rule?.payment?.mode === 'credit' ? rule.payment.days : null;
}

/* ชนิดของแผงเติม — 'monthly' (รอบรายเดือน) · 'credit' (ทุกวัน + เครดิต N วัน **รวมไม่มีเครดิต**: ยึดกำหนดชำระ) ·
   'anyday' (ทุกวัน + เงินเข้าตามวันที่: ยึดวันวางบิล) · 'none' (ยังไม่ตั้ง: กำหนดชำระอย่างเดียว) */
export function fillKindOf(ruleValue) {
  const kind = dateRuleKind(ruleValue);
  if (kind !== 'anyday') return kind;
  return creditDaysOf(ruleValue) === null ? 'anyday' : 'credit';
}

/* ลายเซ็นของกติกาที่ใช้คิดวัน (ไม่รวมหมายเหตุ) — โหมดตั้งวันเทียบค่านี้ทุก render: เปลี่ยน = วิธีที่จำไว้รายงวดและตัวเลือกของแผงเติม
   คิดจากกติกาเก่า ต้องตั้งต้นใหม่ (ชนิดเปลี่ยน · เครดิต 30 → 45 · รอบ 21 → 10/25 · ไม่มีเครดิต ↔ ยังไม่ตั้ง) · 'none' = ยังไม่ตั้ง/รูปผิด */
export function dateRuleShape(ruleValue) {
  const rule = effectiveBillingRule(ruleValue);
  return rule ? JSON.stringify({ billing: rule.billing, payment: rule.payment }) : 'none';
}

/* ── วิธีตั้งวันของตัวแก้ (Segmented) ตามชนิดของรอบ — ลำดับเดียวกับปุ่มบนจอ ─────────────────────────────
   ยังไม่ตั้งเรียง **วันวางบิล → กำหนดชำระ** เสมอ (เจ้าของทัก 28/09 — ลำดับเดียวกับคอลัมน์ในตาราง) */
export const DATE_VIEWS = Object.freeze({
  monthly: Object.freeze(['round', 'other', 'event']),
  anyday: Object.freeze(['follow', 'other', 'event']),
  none: Object.freeze(['bill', 'due', 'event']),
});

/**
 * วิธีที่ตัวแก้วาดจริง — ตัวแรกใน `candidates` ที่อยู่ในชุดของชนิดนี้ (ที่คนเลือก/จำไว้ > ที่ตัดสินตอนเปิด > ค่าตั้งต้น)
 * ไม่มีตัวไหนใช้ได้ = "วันอื่น" (ตั้งแล้ว — เปิดได้เสมอ) / "กำหนดชำระ" (ยังไม่ตั้ง)
 * 🐞 review 28/09: กติกาของลูกค้าเปลี่ยนระหว่างอยู่ในโหมด (ตั้งในแท็บทะเบียนแล้วกลับมา · ล้างแล้วหน้าโหลดใหม่) — วิธีที่จำไว้
 *    ('bill'/'due' ของลูกค้าที่ยังไม่ตั้ง) ไม่มีในชุดใหม่ ⇒ ตัวแก้วาดสาขาของกติกาเก่าต่อ: เลือกวันวางบิลแล้วกำหนดชำระไม่ตาม
 *    (ไม่มีเครดิตบันทึกได้ทั้งที่สองวันไม่ตรง/ไม่มีกำหนดชำระ) · ขากลับ `pickBillingDate(null, …)` ล้างกำหนดชำระที่บันทึกไว้
 */
export function dateViewOf(kind, ...candidates) {
  const allowed = DATE_VIEWS[kind] || DATE_VIEWS.none;
  return candidates.find((view) => allowed.includes(view)) || (allowed === DATE_VIEWS.none ? 'due' : 'other');
}

/* วิธีที่ตัวแก้ของลูกค้าที่ยังไม่ตั้งเปิดขึ้นมา — ช่องที่แตะชนะเสมอ (แตะเซลล์วันวางบิล = ปฏิทินวันวางบิล) ·
   ไม่ได้มาจากเซลล์ = รอเหตุการณ์ถ้างวดรออยู่ ไม่งั้นกำหนดชำระ (ช่องหลักของลูกค้ากลุ่มนี้) */
export function noneOpenView(field, value) {
  if (field === 'bill' || field === 'due') return field;
  return datesOf(value).billingEvent ? 'event' : 'due';
}

/* แตะเซลล์วันของงวดที่ตัวแก้เปิดอยู่ = ปิด หรือ สลับช่อง
   · ตั้งแล้ว: ตัวแก้ตัวเดียวแก้ทั้งสองช่อง ⇒ แตะช่องไหนของงวดนั้นก็ปิด
   · ยังไม่ตั้ง: ตัวแก้เปิดทีละช่อง ⇒ ปิดเฉพาะเมื่อแตะช่องที่เปิดอยู่ · แตะอีกช่อง = สลับไปช่องนั้น
   🐞 review 28/09: เดิมเซลล์ถามแค่ "งวดนี้เปิดอยู่ไหม" ⇒ แตะช่องกำหนดชำระของงวดที่เปิดปฏิทินวันวางบิลอยู่ = ตัวแก้ปิดไปเฉย ๆ */
export function dateCellTapCloses(kind, field, activeView) {
  return kind !== 'none' || activeView === field;
}

/**
 * ที่มาของกำหนดชำระ (ป้ายข้างช่อง) — 'ตามรอบ' · 'ตามเครดิต N วัน' · 'ชำระวันวางบิล' (ไม่มีเครดิต/เครดิต 0) · 'แก้ทับ' ·
 * 'ใส่เอง' · '' (ไม่มีกำหนดชำระ) — ⚠️ ห้ามออก "ตามเครดิต 0 วัน" (มติ 28/09)
 * `key` ใช้ตัดสินปุ่มแตะเดียว "ใช้วันตามรอบ"/"ใช้วันวางบิล" (`computed`) — 'override' (แก้ทับ) และ 'missing'
 * ⭐ 'missing' = มีวันวางบิลแต่ **ไม่มีกำหนดชำระ** ทั้งที่กติกาคิดให้ได้ (ป้ายว่าง — เซลล์บอก "ยังไม่มีกำหนดชำระ" เอง)
 *   🐞 review 28/09: เดิมคืน '' ⇒ เซลล์บอก "ได้เองเมื่อเลือกวันวางบิล" (ไม่จริง — วันวางบิลมีแล้ว) และตัวแก้ไม่มีทางเติมแตะเดียว
 *      (ใบที่บันทึกวันวางบิลไว้ตอนลูกค้ายังไม่ตั้ง แล้วค่อยตั้งกติกา · ล้างกำหนดชำระในช่องเอง) — ป้ายเลยกำหนดไม่มีวันให้นับ
 */
export function dueSourceOf(ruleValue, value) {
  const v = datesOf(value);
  if (!v.dueDate) {
    const computed = v.billingDate ? dueDateForBilling(ruleValue, v.billingDate) : '';
    return computed ? { key: 'missing', label: '', computed } : { key: '', label: '' };
  }
  const kind = dateRuleKind(ruleValue);
  if (kind === 'none' || !v.billingDate) return { key: 'manual', label: 'ใส่เอง' };
  const computed = dueDateForBilling(ruleValue, v.billingDate);
  if (computed && computed !== v.dueDate) return { key: 'override', label: 'แก้ทับ', computed };
  const days = creditDaysOf(ruleValue);
  const label = days === null ? 'ตามรอบ' : days === 0 ? PAY_ON_BILLING_TEXT : `ตามเครดิต ${days} วัน`;
  return { key: 'rule', label, computed };
}

/* ค่าหลังเลือกวันวางบิล — กำหนดชำระคิดตามรอบเสมอ (แตะใหม่ = ตัดสินใจใหม่ ⇒ ทิ้งค่าที่แก้ทับ · กติกาเดียวกับ applyPick) */
export function pickBillingDate(ruleValue, billingDate) {
  const bill = dateOf(billingDate);
  if (!bill) return { ...EMPTY_DATES };
  return { billingDate: bill, billingEvent: '', dueDate: dueDateForBilling(ruleValue, bill) || '' };
}

/* ── เหตุที่งวดแก้วันไม่ได้ในโหมดตั้งวัน (ตัวที่จอวาด) ─────────────────────────────────────────────
   อ่านอย่างเดียว + เหตุบนแถว (ไม่ใช่ tooltip — มือถือแตะไม่เห็น) · แตะ = toast พร้อมทางออก
   ⭐ ประโยคล็อกมาจาก `installmentDateLock` ของ installmentScheduleMany.js **ตัวเดียวกับที่ route ตีกลับ 409**
     (โมฆะ · ยกมา · คืนเงิน · ชำระแล้ว · แจ้งชำระแล้ว · ขอใบวางบิลแล้ว) — ห้ามเขียนรายการล็อกซ้ำที่จอ
     ที่นี่เพิ่มแค่สองข้อที่ server ไม่มีทางรู้จากฝั่งจอ + แยกประโยคเป็น "เหตุสั้นบนแถว" กับ "ทางออก" (hint):
     · `requestUnknown` — จออ่านคำร้องของงวดไม่ขึ้น = ไม่รู้ว่าขอแล้วหรือยัง ⇒ ล็อกไว้ก่อน (ไม่เดาว่า "ยังไม่ขอ")
     · `gateError` — `installmentActionError(row, 'schedule', …)` ตัวเดียวกับ route (สิทธิ์ · ล็อกของใบ · ยกมาของใบย้อนหลัง)
   ⚠️ เหตุของคำร้องยาว ("ขอใบวางบิลแล้ว · RQ-… — บัญชีออกใบตามวันเดิม …") ⇒ ท่อนหลัง " — " ย้ายไป hint
     ให้แถวเหลือ "ขอใบวางบิลแล้ว · RQ-…" (มติ 28/09 ข้อ Locked rows)
   @returns `{ reason, hint }` หรือ null (แก้ได้) */
export function dateLockView(row, {
  order = null, requested = false, requestNo = '', requestUnknown = false, gateError = '',
} = {}) {
  if (!row) return { reason: 'ไม่พบงวด', hint: '' };
  const sentence = installmentDateLock(row, { order });
  if (sentence) {
    return { reason: sentence, hint: String(row.status || '') === 'reported' ? 'ดึงกลับการแจ้งชำระก่อนจึงแก้วันได้' : '' };
  }
  if (requestUnknown) {
    return { reason: 'อ่านคำร้องขอเอกสารไม่สำเร็จ', hint: 'ยังบอกไม่ได้ว่าขอใบวางบิลแล้วหรือยัง — โหลดหน้าใหม่ก่อนแก้วัน' };
  }
  if (requested) {
    const [reason, ...rest] = String(installmentDateLock(row, { order, requested: true, requestNo }) || '').split(' — ');
    return { reason, hint: rest.join(' — ') };
  }
  if (gateError) return { reason: gateError, hint: '' };
  return null;
}

/* ── คำเตือนรายงวด (เตือน ไม่กั้น — ระบบไม่เลื่อนวันให้) ─────────────────────────────────────────
   @param currentOf (row) => ค่าปัจจุบัน (ร่างหรือฐาน) · @param isLocked (row) => boolean
   @returns `{ [rowId]: [{ tone: 'warn'|'muted', field: 'bill'|'due', text }] }` — เฉพาะงวดที่แก้ได้
   · วันที่ผ่านแล้วเตือนเฉพาะงวดที่เปลี่ยน (ของเดิมที่เลยไปแล้วมีป้าย "เลยกำหนด" ของมันอยู่แล้ว)
   · ลำดับเทียบกับงวดก่อนและงวดถัดไปที่มีกำหนดชำระ (ยืมจากแบบ B — ไม่ใช่แค่งวดก่อน) */
export function dateWarnings(rows = [], currentOf = datesOf, { todayIso = '', changedIds = new Set(), isLocked = () => false } = {}) {
  const sorted = [...(rows || [])].sort((a, b) => Number(a.seq) - Number(b.seq));
  const values = sorted.map((row) => ({ row, v: datesOf(currentOf(row)) }));
  const out = {};
  const billSeen = new Map();
  values.forEach(({ row, v }, index) => {
    const list = [];
    const editable = !isLocked(row);
    if (v.billingDate) {
      const first = billSeen.get(v.billingDate);
      if (first && editable) list.push({ tone: 'muted', field: 'bill', text: `วางบิลวันเดียวกับงวด ${first}` });
      if (!first) billSeen.set(v.billingDate, row.seq);
    }
    if (!editable) return;
    const changed = changedIds.has(row.id);
    const today = dateOf(todayIso);
    if (changed && today && v.billingDate && v.billingDate < today) {
      list.push({ tone: 'warn', field: 'bill', text: 'วันวางบิลผ่านมาแล้ว' });
    }
    if (changed && today && v.dueDate && v.dueDate < today) {
      list.push({ tone: 'warn', field: 'due', text: 'กำหนดชำระผ่านมาแล้ว — ขึ้นเลยกำหนดทันทีที่บันทึก' });
    }
    if (v.billingDate && v.dueDate && v.dueDate < v.billingDate) {
      list.push({ tone: 'warn', field: 'due', text: 'กำหนดชำระอยู่ก่อนวันวางบิล' });
    }
    if (v.dueDate) {
      const prev = values.slice(0, index).reverse().find((x) => x.v.dueDate);
      const next = values.slice(index + 1).find((x) => x.v.dueDate);
      if (prev && v.dueDate < prev.v.dueDate) list.push({ tone: 'warn', field: 'due', text: `กำหนดชำระก่อนงวด ${prev.row.seq}` });
      else if (prev && v.dueDate === prev.v.dueDate) list.push({ tone: 'muted', field: 'due', text: `กำหนดชำระวันเดียวกับงวด ${prev.row.seq}` });
      if (next && v.dueDate > next.v.dueDate) list.push({ tone: 'warn', field: 'due', text: `กำหนดชำระหลังงวด ${next.row.seq}` });
    }
    if (list.length) out[row.id] = list;
  });
  return out;
}

/* งวดถัดไป (หลัง `afterSeq`) ที่ยังว่างและแก้ได้ — "เลือกแล้วไปงวดถัดไปที่ว่างเอง" · ไม่มี = null (ไม่วนกลับต้นใบ) */
export function nextEmptyRow(rows = [], currentOf = datesOf, afterSeq = 0, isLocked = () => false) {
  return [...(rows || [])]
    .sort((a, b) => Number(a.seq) - Number(b.seq))
    .find((row) => Number(row.seq) > Number(afterSeq) && !isLocked(row) && datesEmpty(currentOf(row))) || null;
}

/* ── ตัวเลือกในตัวแก้รายงวด ───────────────────────────────────────────────────────────────────── */

const before = (rows, row) => (rows || []).filter((x) => x.id !== row.id && Number(x.seq) < Number(row.seq));

/**
 * รอบรายเดือนที่เสนอให้งวดนี้ — เริ่มต่อจากวันวางบิลของงวดก่อน (ไม่ย้อนก่อนวันนี้) · เป็นแค่ลำดับที่เสนอ ไม่ใช่ค่าที่เลือกให้
 * @returns `{ followSeq, list: [{ billingDate, dueDate, roundIndex, gap, usedBySeq }] }`
 *   `followSeq` = งวดที่รอบแรกต่อจาก (ป้าย "ต่อจากงวด N") · `usedBySeq` = งวดอื่นที่ใช้รอบนั้นอยู่ (ป้าย "งวด N")
 */
export function roundChoicesFor(ruleValue, rows, currentOf, row, todayIso, count = 3) {
  const today = dateOf(todayIso);
  let prev = null;
  for (const x of before(rows, row)) {
    const bill = datesOf(currentOf(x)).billingDate;
    if (bill && (!prev || bill > prev.bill)) prev = { bill, seq: x.seq };
  }
  const after = prev ? addDays(prev.bill, 1) : '';
  const follow = Boolean(after && today && after > today);
  const from = follow ? after : today;
  const used = new Map();
  for (const x of rows || []) {
    if (x.id === row.id) continue;
    const bill = datesOf(currentOf(x)).billingDate;
    if (bill && !used.has(bill)) used.set(bill, x.seq);
  }
  const list = billingRounds(ruleValue, from, count).map((round) => ({
    ...round,
    gap: daysBetween(round.billingDate, round.dueDate),
    usedBySeq: used.get(round.billingDate) ?? null,
  }));
  return { followSeq: follow ? prev.seq : null, list };
}

/**
 * "ต่อจากงวดก่อน" ของลูกค้าวางบิลได้ทุกวัน
 * · เครดิต N วัน = **ยึดวันที่ของกำหนดชำระ** งวดก่อนล่าสุด เดือนถัดไป แล้วถอยวันวางบิล N วัน (`creditCadenceSuggestion` +
 *   `planCreditCadence` — AR-015: งวด 2 กำหนดชำระ 25 ธ.ค. → งวด 3 กำหนดชำระ 25 ม.ค. ไม่ไหลเป็น 24/27)
 *   ไม่มีเครดิต = ทางเดียวกัน (เครดิต 0) ⇒ วันวางบิล = กำหนดชำระ
 * · เงินเข้าตามวันที่ = วันวางบิลของงวดก่อน เดือนถัดไป แล้วคิดกำหนดชำระตามรอบ
 * @returns `{ fromSeq, billingDate, dueDate, dueDay }` หรือ null (ไม่มีงวดก่อนที่มีวัน)
 */
export function continueChoiceFor(ruleValue, rows, currentOf, row) {
  if (dateRuleKind(ruleValue) !== 'anyday') return null;
  const prevRows = before(rows, row).map((x) => ({ ...x, ...datesOf(currentOf(x)) }));
  if (creditDaysOf(ruleValue) !== null) {
    const suggestion = creditCadenceSuggestion(prevRows);
    if (!suggestion) return null;
    const plan = planCreditCadence(ruleValue, [{ id: row.id, seq: row.seq, status: 'pending' }], {
      dueDay: suggestion.dueDay, startMonth: suggestion.startMonth, includeDated: true,
    });
    const [pick] = plan.rows;
    return pick ? { fromSeq: suggestion.fromSeq, billingDate: pick.billingDate, dueDate: pick.dueDate, dueDay: suggestion.dueDay } : null;
  }
  const last = prevRows.filter((x) => x.billingDate).sort((a, b) => (a.billingDate < b.billingDate ? -1 : 1)).pop();
  if (!last) return null;
  const [y, m, d] = partsOf(last.billingDate);
  const billingDate = dayOfMonth(y, m + 1, d);
  return { fromSeq: last.seq, billingDate, dueDate: dueDateForBilling(ruleValue, billingDate) || '', dueDay: null };
}

/* กำหนดชำระเดิมของงวด (ก่อนมีรอบ) → วันวางบิลย้อนตามเครดิต — ทางลัด "ตามกำหนดชำระเดิม" ของลูกค้าเครดิต N วัน
   · ไม่มีเครดิต = วันวางบิลวันเดียวกับกำหนดชำระเดิม (ใบสินค้าเก่าที่มีแต่กำหนดชำระ แตะครั้งเดียวได้วันวางบิล) */
export function keepDueChoiceFor(ruleValue, row) {
  const days = creditDaysOf(ruleValue);
  const saved = datesOf(row);
  if (days === null || !saved.dueDate || saved.billingDate) return null;
  return { billingDate: addDays(saved.dueDate, -days), dueDate: saved.dueDate };
}

/**
 * ชิปทางลัดกำหนดชำระของลูกค้าที่ยังไม่ตั้งกำหนดวางบิล — ต้นเดือน/กลางเดือน/สิ้นเดือนของเดือนในชื่องวด · "วันที่ X แบบงวดก่อน" ·
 * +7/+15/+30 วันจากงวดก่อน · ชิปที่คนแตะเองไม่ใช่ค่าตั้งต้น (ระบบห้ามเดาวันเองจากชื่องวด — เป็นแค่เบาะแส)
 * @returns `[{ key, label, dueDate }]` (ไม่ซ้ำวัน)
 */
export function quickDueChoices(rows, currentOf, row) {
  const out = [];
  const add = (key, label, dueDate) => {
    if (dueDate && !out.some((x) => x.dueDate === dueDate)) out.push({ key, label, dueDate });
  };
  const month = installmentLabelMonth(row?.label);
  const prev = before(rows, row)
    .map((x) => ({ seq: x.seq, due: datesOf(currentOf(x)).dueDate }))
    .filter((x) => x.due)
    .sort((a, b) => Number(a.seq) - Number(b.seq))
    .pop();
  if (month) {
    const [y, m] = month.split('-').map(Number);
    add('start', 'ต้นเดือน', dayOfMonth(y, m, 1));
    add('mid', 'กลางเดือน', dayOfMonth(y, m, 15));
    add('end', 'สิ้นเดือน', dayOfMonth(y, m, 31));
  }
  if (prev) {
    const [py, pm, pd] = partsOf(prev.due);
    const [y, m] = month ? month.split('-').map(Number) : [py, pm + 1];
    add('same-day', `วันที่ ${pd} แบบงวดก่อน`, dayOfMonth(y, m, pd));
    for (const n of [7, 15, 30]) add(`plus-${n}`, `+${n} วันจากงวดก่อน`, addDays(prev.due, n));
  }
  return out;
}

/* เดือนที่ปฏิทินของงวดเปิดขึ้นมา — วันที่มีอยู่ > เดือนในชื่องวด > เดือนหลังงวดก่อน > เดือนนี้ */
export function calendarMonthFor(row, rows, currentOf, field, todayIso) {
  const v = datesOf(currentOf(row));
  if (v[field]) return v[field].slice(0, 7);
  const month = installmentLabelMonth(row?.label);
  if (month && field === 'dueDate') return month;
  const prev = before(rows, row).map((x) => datesOf(currentOf(x))[field]).filter(Boolean).sort().pop();
  if (prev) return shiftMonth(prev.slice(0, 7), 1);
  return String(todayIso || '').slice(0, 7);
}

/* ช่องปฏิทินหนึ่งเดือน เริ่มวันอาทิตย์ (มติ 26/09 — ทุกปฏิทิน อา–ส) · null = ช่องเว้น · เติมท้ายให้ครบสัปดาห์ */
export function sundayFirstCells(month) {
  const [y, m] = String(month).split('-').map(Number);
  if (!y || !m) return [];
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const cells = [...Array.from({ length: lead }, () => null)];
  for (let d = 1; d <= lastDayOf(y, m); d += 1) cells.push(`${y}-${pad(m)}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/* ── เติมวันงวดที่ว่าง… (ร่างอย่างเดียว) ─────────────────────────────────────────────────────────
   แถวที่ส่งเข้าตัวคิดของ billingRule.js = **ค่าปัจจุบันบนจอ** (ฐาน + ร่าง ณ ตอนเปิดแผงเติม) · งวดที่ล็อกส่งเป็นสถานะ
   'locked' (ไม่อยู่ใน pending/rejected ⇒ ตัวคิดไม่แตะ แต่ยังนับวันวางบิลของมันเป็นเพดาน "ไม่ย้อนแซงงวดก่อน") */
export function fillInputRows(rows = [], currentOf = datesOf, isLocked = () => false) {
  return [...(rows || [])]
    .sort((a, b) => Number(a.seq) - Number(b.seq))
    .map((row) => {
      const v = datesOf(currentOf(row));
      return {
        ...row,
        status: isLocked(row) ? 'locked' : (row.status || 'pending'),
        billingDate: v.billingDate || null,
        billingEvent: v.billingEvent || null,
        dueDate: v.dueDate || null,
      };
    });
}

/* งวดที่ตัวเติมแตะ — ว่าง (ไม่มีวันเลย) หรือรวมงวดที่มีวันแล้ว (`includeDated` · ไม่รวมรอเหตุการณ์) · รอบรายเดือนเติมงวดที่ยังไม่มี
   วันวางบิลด้วย (คงกำหนดชำระเดิม — planMonthlyFill) */
export function fillTargetsOf(kind, inputRows = [], { includeDated = false } = {}) {
  if (includeDated) return inputRows.filter((row) => installmentBillingRedatable(row));
  if (kind === 'monthly') return inputRows.filter((row) => installmentBillingFillable(row));
  return inputRows.filter((row) => installmentBillingFillable(row) && !row.dueDate);
}
/* จำนวนงวดที่ "จัดใหม่งวดที่มีวันแล้วด้วย" จะเพิ่มเข้ามา (สวิตช์บอกจำนวนก่อนเปิด) */
export function datedFillCount(kind, inputRows = []) {
  const all = fillTargetsOf(kind, inputRows, { includeDated: true }).map((row) => row.id);
  const empty = new Set(fillTargetsOf(kind, inputRows).map((row) => row.id));
  return all.filter((id) => !empty.has(id)).length;
}

/**
 * แผนของตัวเลือกหนึ่งในแผงเติม — ตัวคิดของ billingRule.js ตามรูปของรอบ
 * @param option
 *   `{ kind: 'monthly', roundIndex, includeDated }`                 planMonthlyFill / planRedate
 *   `{ kind: 'credit', dueDay, startMonth | null, includeDated }`   planCreditCadence (เครดิต N วัน + ไม่มีเครดิต · null = เดือนในชื่องวด)
 *   `{ kind: 'anyday', day, startMonth, includeDated }`             วันวางบิลที่ `day` เดือนละงวด + กำหนดชำระตามรอบ
 *   `{ kind: 'none', day, startMonth | null, includeDated }`        planNoCreditDates (ยังไม่ตั้ง · กำหนดชำระอย่างเดียว · null = เดือนในชื่องวด)
 * @returns `{ rows: [{ id, seq, billingDate, dueDate }], skipped: [seq], error }`
 */
export function planDateFill(ruleValue, inputRows = [], option = {}, todayIso = '') {
  const includeDated = Boolean(option.includeDated);
  const shape = (rows) => rows.map((r) => ({ id: r.id, seq: r.seq, billingDate: r.billingDate || '', dueDate: r.dueDate || '' }));
  if (option.kind === 'monthly') {
    const plan = includeDated
      ? planRedate(ruleValue, inputRows, todayIso, { roundIndex: option.roundIndex ?? null })
      : planMonthlyFill(ruleValue, inputRows, todayIso, { roundIndex: option.roundIndex ?? null });
    return { rows: shape(plan.rows), skipped: [], error: plan.error };
  }
  if (option.kind === 'credit') {
    /* `startMonth: null` = "ตามเดือนในชื่องวด" (ข้อ 6 ของมติ 28/09 · AR-622) — ไม่ส่งมา = ยังไม่เลือก (undefined ⇒ error) */
    const plan = planCreditCadence(ruleValue, inputRows, { dueDay: option.dueDay, startMonth: option.startMonth, includeDated });
    return { rows: shape(plan.rows), skipped: plan.skipped || [], error: plan.error };
  }
  if (option.kind === 'anyday') {
    const day = Number(option.day);
    if (!Number.isInteger(day) || day < 1 || day > 31) return { rows: [], skipped: [], error: 'เลือกวันที่ของวันวางบิล' };
    if (!/^\d{4}-\d{2}$/.test(String(option.startMonth || ''))) return { rows: [], skipped: [], error: 'เลือกเดือนเริ่ม' };
    const targets = fillTargetsOf('anyday', inputRows, { includeDated });
    if (!targets.length) return { rows: [], skipped: [], error: includeDated ? 'ไม่มีงวดที่จัดวันใหม่ได้' : 'ไม่มีงวดที่ว่าง' };
    const [sy, sm] = option.startMonth.split('-').map(Number);
    return {
      rows: targets.map((row, k) => {
        const billingDate = dayOfMonth(sy, sm + k, day);
        return { id: row.id, seq: row.seq, billingDate, dueDate: dueDateForBilling(ruleValue, billingDate) || '' };
      }),
      skipped: [],
      error: null,
    };
  }
  const plan = planNoCreditDates(inputRows, { day: option.day, startMonth: option.startMonth ?? null, includeDated });
  return { rows: shape(plan.rows), skipped: plan.skipped || [], error: plan.error };
}

/* ร่างหลังเติม — ทับเฉพาะงวดในแผนบนร่างฐานของแผงเติม (เลือกตัวเลือกใหม่ = เริ่มจากฐานเดิม ไม่ซ้อนผลรอบก่อน) */
export function applyFillPlan(baseDrafts = {}, rows = [], plan = []) {
  const byId = new Map((rows || []).map((row) => [row.id, row]));
  let next = { ...(baseDrafts || {}) };
  for (const planned of plan || []) {
    const row = byId.get(planned.id);
    if (!row) continue;
    next = withDraft(next, row, { billingDate: planned.billingDate || '', billingEvent: '', dueDate: planned.dueDate || '' });
  }
  return next;
}

/* งวดที่ใช้เป็นหลักยึดของแผงเติม = ไม่ถูกเติม **และอยู่ก่อนงวดแรกที่เติม** (เลขงวดน้อยกว่า)
   🐞 review R-UI: เดิมยึดงวดที่วันล่าสุดในใบ แม้อยู่หลังงวดที่จะเติม — งวด 1 (25 ต.ค.) · 2 ว่าง · 3 (25 ธ.ค.) ได้ "ต่อจากงวด 3"
   แล้วงวด 2 กำหนดชำระ 25 ม.ค. 2027 หลังงวด 3 · ตัวคิดของ billingRule (`creditCadenceSuggestion`) ยึดวันล่าสุดของแถวที่ส่งให้
   ⇒ คัดแถวที่นี่ก่อนส่งเสมอ */
function anchorRowsOf(inputRows = [], targetIds = new Set()) {
  const firstSeq = Math.min(...(inputRows || []).filter((row) => targetIds.has(row.id)).map((row) => Number(row.seq)));
  return (inputRows || []).filter((row) => !targetIds.has(row.id) && Number(row.seq) < firstSeq);
}

/**
 * ข้อเสนอแรกของแผงเติมสำหรับลูกค้าเครดิต N วัน — "ต่อจากงวด X · กำหนดชำระทุกวันที่ D" (ยึดงวดก่อนงวดแรกที่เติม)
 * · เปิด "จัดใหม่งวดที่มีวันแล้วด้วย" แล้วไม่มีงวดนอกแผนให้ยึด = "ยึดกำหนดชำระเดิมงวด X" (วันของงวดแรกในแผน · เดือนเดิม)
 * @returns `{ fromSeq, dueDay, startMonth, keep }` หรือ null
 */
export function creditFillSuggestion(inputRows = [], { includeDated = false } = {}) {
  const targets = new Set(fillTargetsOf('credit', inputRows, { includeDated }).map((row) => row.id));
  const anchor = creditCadenceSuggestion(anchorRowsOf(inputRows, targets));
  if (anchor) return { ...anchor, keep: false };
  if (!includeDated) return null;
  const first = inputRows.find((row) => targets.has(row.id) && dateOf(row.dueDate));
  if (!first) return null;
  const [y, m, d] = partsOf(first.dueDate);
  return { fromSeq: first.seq, dueDay: d === lastDayOf(y, m) && d < 31 ? 31 : d, startMonth: first.dueDate.slice(0, 7), keep: true };
}

/* เดือนเริ่มที่เสนอในแผงเติม (สามเดือน) — ต่อจากงวดล่าสุด **ก่อนงวดแรกที่เติม** หรือเดือนนี้ */
export function fillStartMonths(inputRows = [], targetIds = new Set(), todayIso = '') {
  const anchor = anchorRowsOf(inputRows, targetIds)
    .map((row) => dateOf(row.dueDate) || dateOf(row.billingDate))
    .filter(Boolean)
    .sort()
    .pop();
  const base = anchor && anchor.slice(0, 7) >= String(todayIso).slice(0, 7)
    ? shiftMonth(anchor.slice(0, 7), 1)
    : String(todayIso || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(base) ? [0, 1, 2].map((n) => shiftMonth(base, n)) : [];
}
