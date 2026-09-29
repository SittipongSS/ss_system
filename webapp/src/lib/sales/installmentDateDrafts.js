// ── โหมดตั้งวันงวดในตาราง (แบบ C · มติเจ้าของ 28/09) — ร่างวัน · สรุปการเปลี่ยน · เหตุที่ล็อก · คำเตือนลำดับ ──
//
// ⭐ แทนโมดัลรายงวดทั้งสองแบบ + ปุ่ม "เติมตามรอบ" / "จัดวันใหม่ตามรอบปัจจุบัน" ของแผงงวดบนใบ SO
//   ม็อก `mockups/billing-cycle/installment-v2/c.html` + ของที่ยืมจาก `recommended.html` (ดู index.html)
//   · คนแตะวันลง **ร่าง** ในตารางได้หลายงวด แล้วกดบันทึกครั้งเดียว (`schedule-many`) — ไม่มีอะไรลงฐานระหว่างแตะ
//   · ตัวเติมหลายงวด ("เติมวันงวดที่ว่าง…") เขียนร่างอย่างเดียว คนดูในตารางก่อนบันทึกเสมอ
//
// ⚠️ ไฟล์นี้ไม่คิดวันเอง — รอบ/เครดิต/เดือนในชื่องวดมาจาก `billingRule.js` ที่เดียว (planMonthlyFill · planRedate ·
//    planDueCadence · roundChoices · dueDateForBilling · creditCadenceSuggestion · dateModeOf)
// ⭐ รุ่นสี่ (มติเจ้าของ 29/09 · "ต้องวางบิลไหม" · แบบ A) — ตัวแก้เปิดแบบไหน = `dateModeOf` ของ billingRule.js ตัวเดียว
//   (หน้าสร้าง SO ใช้ตัวเดียวกัน): 'rounds' · 'cadence' · 'free' (ยังไม่ระบุ · ยังไม่ตั้งรอบ · **รูปเดิม { credit:false }**) ·
//   'dueOnly' (ไม่ต้องวางบิล) + รายงวด 'exception' ("งวดนี้ต้องวางบิล…") / dueOnly+skip ("งวดนี้ไม่ต้องวางบิล" · billingSkip)
//   ลำดับวิธีบนจอคงวันวางบิล → กำหนดชำระเสมอ (เจ้าของ 28/09) — ช่องนำบอกด้วย `start` ไม่ใช่ด้วยตำแหน่ง
//    ที่นี่แค่ต่อสายกับร่าง + เลขคณิตเดือนเล็ก ๆ ของชิปทางลัด (สตริง YYYY-MM-DD ล้วน ไม่มีโซนเวลา)
// ⚠️ ไม่อ่านนาฬิกา — `todayIso` มาจาก `businessDate()` ของผู้เรียก (นาฬิกาไทย · check:thaitime)
// ⚠️ สองช่องแยกกันเสมอ: `billingDate` = วันวางบิล · `dueDate` = กำหนดชำระ (ป้ายแดง "เลยกำหนด" + ด่านนัดช่างอ่านช่องนี้)
//    · `billingEvent` = รอเหตุการณ์ (ไม่มีวันวางบิลคู่กันได้ — CHECK ของ mig 0389 · รุ่นสี่: รอเหตุการณ์ = **ไม่มีกำหนดชำระ**
//      ด่าน validateInstallmentDates ตีกลับคู่นี้) · `billingSkip` = ติ๊ก "งวดนี้ไม่ต้องวางบิล" (mig 0393 · ไม่มีวันวางบิลคู่กันได้)
// ⭐ รอบห้า (มติเจ้าของ 29/09 · ปฏิทินรายปีของลูกค้า · Q3 "หยุดรอปฏิทินใหม่") — ลูกค้าตามปฏิทินเดินทาง 'rounds' ตัวเดิม:
//   · ชิปรอบ = `roundChoices` (รอบจริงของปฏิทิน + เหตุที่ชิปหมด `missing`) · ไทล์บอกที่มา "ตามปฏิทินลูกค้า" + "ส่งก่อน 16:00 น."
//   · ปีที่ยังไม่มีปฏิทิน = **ไม่มีวันที่คิดให้** — "ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้" (ตัวเติมข้ามงวดพร้อมเหตุ · ช่องกำหนดชำระพิมพ์เองได้)
//   · ไม่มีประมาณการ ไม่มีป้าย "ประมาณการ" ที่ไหนเลย (มติ Q3)

import { addDays, daysBetween } from './paymentCoverage.js';
import { installmentDateLock } from './installmentScheduleMany.js';
import {
  BILLING_EVENT_MAX, CALENDAR_MANUAL_HINT, calendarGapFor, calendarGapText, calendarStatus, creditCadenceSuggestion,
  cutoffInfo, dateModeOf, dueDateForBilling, dueSourceOf as dueSourceOfRule, formatBillingDate,
  installmentBillingFillable, installmentBillingRedatable, installmentLabelMonth, planCreditCadence, planDueCadence,
  needOverrideOf, planMonthlyFill, planRedate, roundChoices, ruleOf, sourceLabel,
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
   `{ billingDate, billingEvent, dueDate, billingSkip }` — สตริงว่าง = ไม่มี (ช่อง DateInput/Input อ่านสตริง) · ส่งเข้า API ผ่าน
   `scheduleManyRows` เท่านั้น (แปลงว่างเป็น null) · `billingSkip` = ติ๊ก "งวดนี้ไม่ต้องวางบิล" (true/false — null ในฐาน = ไม่ติ๊ก)
   ⚠️ ติ๊กไม่ใช่ "วัน" — `datesEmpty` ไม่นับ · "ล้างวัน"/เลือกรอเหตุการณ์ คงติ๊กไว้ (`clearedDates`) */
export const EMPTY_DATES = Object.freeze({ billingDate: '', billingEvent: '', dueDate: '', billingSkip: false });

export function datesOf(row) {
  const billingDate = dateOf(row?.billingDate);
  /* วันวางบิลกับเหตุการณ์ไม่มาคู่กัน (CHECK) — แถวเก่าที่มีทั้งคู่ถือวันเป็นหลัก */
  const billingEvent = billingDate ? '' : String(row?.billingEvent ?? '').trim().slice(0, BILLING_EVENT_MAX);
  return { billingDate, billingEvent, dueDate: dateOf(row?.dueDate), billingSkip: row?.billingSkip === true };
}
/* ล้างวันของงวด — ติ๊ก "งวดนี้ไม่ต้องวางบิล" อยู่ต่อ (ติ๊กมีช่องของมันเอง ไม่ใช่วัน) */
export const clearedDates = (value) => ({ ...EMPTY_DATES, billingSkip: datesOf(value).billingSkip });

export const sameDates = (a, b) => {
  const x = datesOf(a);
  const y = datesOf(b);
  return x.billingDate === y.billingDate && x.billingEvent === y.billingEvent && x.dueDate === y.dueDate
    && x.billingSkip === y.billingSkip;
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
 * body ของ `PATCH …/installments { action: 'schedule-many', rows }` (สัญญากับ R-API · contracts §10 7.3)
 * `updatedAt` = ของแถวที่ตาเห็น **ตอนนี้** — หลัง 409 หน้าโหลดงวดสดแล้วแผงบอกงวดที่เปลี่ยนใต้มือ (`stale`) ก่อน
 * คนกดบันทึกอีกครั้ง = รับรู้แล้ว ⇒ ส่งตัวล็อกของแถวใหม่ (ไม่งั้น 409 วนไม่จบ — บทเรียนเดียวกับ `live()` ของแผง)
 * ⭐ รุ่นสี่ (mig 0393):
 *   · `billingSkip` ส่ง **เฉพาะงวดที่ติ๊กเปลี่ยน** (ไม่ส่ง = คงค่าในฐาน) — ฐานที่ยังไม่รัน 0393 ไม่เจอคีย์นี้เลยถ้าไม่มีใครติ๊ก
 *     (จอซ่อนช่องติ๊กจนกว่า `billingSkipReady`)
 *   · `billingException: true` เฉพาะงวดที่ยืนยัน "งวดนี้ต้องวางบิล…" (`exceptionIds`) **และวันวางบิลใหม่/เปลี่ยน** —
 *     ด่าน API ตีกลับวันวางบิลใหม่ของลูกค้าไม่ต้องวางบิลที่ไม่มีธงนี้ (NO_BILLING_WRITE_ERROR) · ไม่เก็บลงฐาน (ลงประวัติ)
 *     ⭐ งวดที่ **ในฐาน** มีวันวางบิลอยู่แล้วทั้งที่ลูกค้าไม่ต้องวางบิล (`needOverrideOf` = 'billing' — ข้อยกเว้นที่ยืนยันไว้รอบก่อน
 *       หรือวันค้างจากก่อนลูกค้าเปลี่ยนเป็นไม่ต้องวางบิล) = ยืนยันแล้ว ⇒ เลื่อนวันก็ส่งธงด้วย (`rule` = กติกาของลูกค้า)
 *       🐞 review 29/09: เดิมส่งเฉพาะ `exceptionIds` ของรอบนี้ ⇒ เลื่อนวันของงวดยกเว้นเดิม = 400 ทุกครั้ง แล้วข้อความชี้ไปเมนู
 *          "งวดนี้ต้องวางบิล…" ที่งวดนั้นไม่มี (มีวันวางบิลแล้ว) — ปุ่มกับ API ตอบคนละอย่าง
 */
export function scheduleManyRows(changes = [], { exceptionIds = new Set(), rule } = {}) {
  return changes.map(({ row, from, to }) => {
    const before = from || datesOf(row);
    const skipChanged = Boolean(to.billingSkip) !== Boolean(before.billingSkip);
    const confirmed = exceptionIds.has(row.id) || (rule !== undefined && needOverrideOf(row, rule) === 'billing');
    const exception = confirmed && Boolean(to.billingDate) && to.billingDate !== before.billingDate;
    return {
      id: row.id,
      billingDate: to.billingDate || null,
      billingEvent: to.billingDate ? null : (to.billingEvent.trim() || null),
      dueDate: to.dueDate || null,
      ...(skipChanged ? { billingSkip: to.billingSkip === true } : {}),
      ...(exception ? { billingException: true } : {}),
      updatedAt: row.updatedAt || null,
    };
  });
}

/* ── กติกาของลูกค้า → ตัวแก้แบบไหน (`dateModeOf` ของ billingRule.js ตัวเดียว · มติเจ้าของ 29/09 แบบ A) ─────────────
   'rounds'  = มีรอบ (วางบิลรายเดือน · รอบจ่าย · วันจ่ายประจำ) — แตะรอบได้ทั้งสองวัน
   'cadence' = วางบิลได้ทุกวัน ไม่มีรอบ (เครดิต N วัน · ชำระวันวางบิล) — วันวางบิลนำ กำหนดชำระคิดให้
   'free'    = ยังไม่ระบุ · ต้องวางบิลแต่ยังไม่ตั้งรอบ · **รูปเดิม { credit:false }** (รอบกรรมการ 29/09 — ไม่ต้องใส่วันวางบิลปลอม
               ระหว่างรอมติข้อ 4) — กำหนดชำระนำ วันวางบิลไม่บังคับ
   'dueOnly' = ไม่ต้องวางบิล — มีแต่กำหนดชำระ (หรือรอเหตุการณ์)
   ⭐ รายงวด: `rowDateMode` (ข้อยกเว้น "งวดนี้ต้องวางบิล…" = 'exception' · ติ๊ก "งวดนี้ไม่ต้องวางบิล" = 'dueOnly' + override 'skip')
   ⚠️ ห้ามอ่านช่องในของกติกาตรง ๆ ที่จอ — ถามตัวช่วยของ billingRule.js */
export const dateModeKind = (value) => dateModeOf(value).kind;
/* ตัวแก้ของ **งวดนั้น** — `row` = ค่าปัจจุบันบนจอ (ฐาน + ร่าง ⇒ ติ๊ก/ล้างวันวางบิลในร่างเปลี่ยนวิธีทันที) ·
   `exception` = งวดที่ยืนยัน "งวดนี้ต้องวางบิล…" แล้วแต่ยังไม่มีวันวางบิล (ธงของโหมด — ไม่มีคอลัมน์) */
export function rowDateMode(value, row, { exception = false } = {}) {
  return dateModeOf(value, row || null, { exception });
}
/* เครดิต N วันของลูกค้าที่วางบิลได้ทุกวัน/รายเดือนแต่ **ไม่มีรอบจ่าย** (null = ไม่ใช่) · ชำระวันวางบิล/รูปเดิม = 0
   (คำบนจอถาม `dueSourceOf`/`sourceLabel` — ห้ามพูด "เครดิต 0 วัน") */
export function creditDaysOf(value) {
  const rule = ruleOf(value);
  return rule?.need === 'required' && rule.billing && !rule.runs ? rule.creditDays : null;
}

/* ชนิดของแผงเติม — 'rounds' (มีรอบ: planMonthlyFill/planRedate) · 'cadence' (ทุกแบบที่เหลือ: planDueCadence ยึดกำหนดชำระ —
   เครดิต N เขียนวันวางบิล = กำหนดชำระ − N · ไม่ต้องวางบิล/ยังไม่ระบุ/ยังไม่ตั้งรอบ/รูปเดิม เขียนกำหนดชำระอย่างเดียว) */
export const fillKindOf = (ruleValue) => (dateModeKind(ruleValue) === 'rounds' ? 'rounds' : 'cadence');

/* ลายเซ็นของกติกาที่ใช้คิดวัน (ไม่รวมหมายเหตุ) — โหมดตั้งวันเทียบค่านี้ทุก render: เปลี่ยน = วิธีที่จำไว้รายงวดและตัวเลือกของแผงเติม
   คิดจากกติกาเก่า ต้องตั้งต้นใหม่ (ต้อง ↔ ไม่ต้องวางบิล · เครดิต 30 → 45 · รอบ 21 → 10/25 · รูปเดิม → ตอบแล้ว)
   ⭐ อ่านผ่าน `ruleOf` — รุ่นสองกับรุ่นสี่ที่ความหมายเท่ากันได้ลายเซ็นเดียว · รูปเดิม { credit:false } ≠ "ชำระวันวางบิล" รุ่นสี่
     (ตัวแก้คนละแบบ: free vs cadence) · 'unknown' = ยังไม่ระบุ/รูปผิด */
export function dateRuleShape(ruleValue) {
  const rule = ruleOf(ruleValue);
  if (!rule) return 'unknown';
  const { note: _note, ...shape } = rule;
  return JSON.stringify(shape);
}

/* ── วิธีตั้งวันของตัวแก้ (Segmented) — ชุดมาจาก `dateModeOf().views` (ลำดับเดียวกับปุ่มบนจอ · วันวางบิล → กำหนดชำระ เสมอ) ── */
export const VIEW_LABELS = Object.freeze({
  round: 'ตามรอบ', other: 'วันอื่น', follow: 'ต่อจากงวดก่อน', bill: 'วันวางบิล', due: 'กำหนดชำระ', event: 'รอเหตุการณ์',
});
/* ตัวแก้ที่เปิดทีละช่อง (มีมุมมอง "กำหนดชำระ" ของตัวเอง — free · dueOnly · exception) — แตะเซลล์ไหนเปิดช่องนั้น */
export const splitsFields = (rowMode) => Boolean(rowMode?.views?.includes('due'));

/**
 * วิธีที่ตัวแก้วาดจริง — ตัวแรกใน `candidates` ที่อยู่ในชุดของงวดนี้ (ที่คนเลือก/จำไว้ > ที่ตัดสินตอนเปิด > ค่าตั้งต้น)
 * ไม่มีตัวไหนใช้ได้ = "วันอื่น" (มีรอบ/ทุกวัน — เปิดได้เสมอ) / "กำหนดชำระ" (ช่องนำของแบบที่เหลือ)
 * 🐞 review 28/09: กติกาของลูกค้าเปลี่ยนระหว่างอยู่ในโหมด (ตั้งในแท็บทะเบียนแล้วกลับมา · ล้างแล้วหน้าโหลดใหม่) — วิธีที่จำไว้
 *    ของชนิดเก่าไม่มีในชุดใหม่ ⇒ ตัวแก้วาดสาขาของกติกาเก่าต่อ: เลือกวันวางบิลแล้วกำหนดชำระไม่ตาม · ขากลับล้างกำหนดชำระเงียบ ๆ
 *    (รุ่นสี่: ติ๊ก "งวดนี้ไม่ต้องวางบิล" ระหว่างตัวแก้เปิด = ชุดของงวดเปลี่ยนเหมือนกัน — ทางเดียวกัน)
 */
export function dateViewOf(views = [], ...candidates) {
  const allowed = Array.isArray(views) ? views : [];
  return candidates.find((view) => allowed.includes(view))
    || (allowed.includes('other') ? 'other' : allowed.includes('due') ? 'due' : allowed[0] || 'due');
}

/* วิธีที่ตัวแก้แบบเปิดทีละช่อง (free · dueOnly · exception) เปิดขึ้นมา — ช่องที่แตะชนะเสมอ (แตะเซลล์วันวางบิล = ปฏิทินวันวางบิล) ·
   ไม่ได้มาจากเซลล์ = รอเหตุการณ์ถ้างวดรออยู่ ไม่งั้นช่องนำของงวด (`start` — กำหนดชำระ · งวดยกเว้นที่ยังไม่มีวันวางบิล = วันวางบิล) */
export function openViewOf(field, value, rowMode) {
  const views = rowMode?.views || [];
  if (field && views.includes(field)) return field;
  if (datesOf(value).billingEvent && views.includes('event')) return 'event';
  return rowMode?.start && views.includes(rowMode.start) ? rowMode.start : (views.includes('due') ? 'due' : views[0] || 'due');
}

/* แตะเซลล์วันของงวดที่ตัวแก้เปิดอยู่ = ปิด หรือ สลับช่อง
   · ตัวแก้ตัวเดียวแก้ทั้งสองช่อง (rounds · cadence) ⇒ แตะช่องไหนของงวดนั้นก็ปิด
   · เปิดทีละช่อง (free · dueOnly · exception) ⇒ ปิดเฉพาะเมื่อแตะช่องที่เปิดอยู่ · แตะอีกช่อง = สลับไปช่องนั้น
   🐞 review 28/09: เดิมเซลล์ถามแค่ "งวดนี้เปิดอยู่ไหม" ⇒ แตะช่องกำหนดชำระของงวดที่เปิดปฏิทินวันวางบิลอยู่ = ตัวแก้ปิดไปเฉย ๆ */
export function dateCellTapCloses(rowMode, field, activeView) {
  return !splitsFields(rowMode) || activeView === field;
}

/**
 * ที่มาของกำหนดชำระ (ป้ายข้างช่อง) — ตัวเดียวทุกจอ (`dueSourceOf` ของ billingRule.js · §3.2)
 *   'rule' ตามรอบ/ตามเครดิต N วัน/ชำระวันวางบิล · 'override' แก้ทับ (+ computed) · 'manual' ใส่เอง · 'direct' ไม่ต้องวางบิล (ไม่มีป้าย) ·
 *   'missing' มีวันวางบิล กติกาคิดได้ แต่ยังไม่มีกำหนดชำระ (+ computed) · 'waiting' รอเหตุการณ์ · '' ไม่มีกำหนดชำระ
 * ⚠️ ห้ามออก "ตามเครดิต 0 วัน" (มติ 28/09)
 * ⭐ 'missing' 🐞 review 28/09: เดิมคืน '' ⇒ เซลล์บอก "ได้เองเมื่อเลือกวันวางบิล" (ไม่จริง — วันวางบิลมีแล้ว) และตัวแก้ไม่มีทางเติมแตะเดียว
 */
export const dueSourceOf = (ruleValue, value) => dueSourceOfRule(ruleOf(ruleValue), value);

/* ค่าหลังเลือกวันวางบิล
   · มีรอบ / ทุกวัน (rounds · cadence) = กำหนดชำระคิดตามกติกาเสมอ (แตะใหม่ = ตัดสินใจใหม่ ⇒ ทิ้งค่าที่แก้ทับ)
   · เปิดทีละช่อง (free · exception) = **กำหนดชำระคงเดิม** — ว่างอยู่ถึงเติมจากกติกาเมื่อคิดได้ (รูปเดิม { credit:false } = วันเดียวกัน ·
     ยังไม่ระบุ/ยังไม่ตั้งรอบ/งวดยกเว้นของลูกค้าไม่ต้องวางบิล = ไม่คิดให้) · §2.4 "ใส่วันวางบิลเมื่อไร กำหนดชำระ = วันเดียวกันถ้ายังว่าง"
   · เลือกวันวางบิล = เอาติ๊ก "งวดนี้ไม่ต้องวางบิล" ออก (ด่านเขียนตีกลับคู่นี้) */
export function pickBillingDate(ruleValue, billingDate, current = null) {
  const bill = dateOf(billingDate);
  if (!bill) return clearedDates(current);
  const rule = ruleOf(ruleValue);
  const computed = dueDateForBilling(rule, bill) || '';
  const kind = dateModeKind(ruleValue);
  /* ⭐ ปีที่ปฏิทินยังไม่มี (มติ 29/09 หยุด) = ไม่มีวันให้คิด ⇒ กำหนดชำระที่คนพิมพ์เองไว้ (ไม่ก่อนวันวางบิลใหม่) อยู่ต่อ
     ไม่ถูกล้างเป็นว่าง — "ใส่วันเองได้" ต้องไม่หายเพราะแตะวันวางบิลทีหลัง */
  const typed = datesOf(current).dueDate;
  const keepTyped = !computed && typed && typed >= bill && calendarGapFor(rule, bill) ? typed : '';
  const dueDate = kind === 'rounds' || kind === 'cadence' ? (computed || keepTyped) : (typed || computed);
  return { billingDate: bill, billingEvent: '', dueDate, billingSkip: false };
}

/* ── ปฏิทินของลูกค้า (รอบห้า · มติ 29/09) — คำเล็กของวันวางบิล · ช่องว่างของปฏิทิน ──────────────────────────────── */

/* ลูกค้ารายนี้วางบิลตามปฏิทินรายปีไหม (คำของแผงเติม/แถบนโยบาย) — จอไม่อ่านช่องในของกติกาเอง */
export const isCalendarRule = (ruleValue) => ruleOf(ruleValue)?.runs?.kind === 'calendar';

/* "ส่งก่อน 16:00 น." ข้างวันวางบิล — เฉพาะเมื่อรอบของวันนั้นมีเวลาตัดรอบ **และวันวางบิลคือวันตัดรอบ** (ชำระรอบเดียวกัน ·
   `cutoffInfo` ให้เวลาเฉพาะเครดิต 0) · วางบิลก่อนวันตัดรอบ/เครดิต N = '' (เวลาเป็นของวันตัดรอบ ไม่ใช่ของวันที่เลือก · system-design §6) */
export function billingCutoffNote(ruleValue, billingDate) {
  const info = cutoffInfo(ruleOf(ruleValue), dateOf(billingDate));
  return info?.cutoffTime && info.onLastDay ? `ส่งก่อน ${info.cutoffTime} น.` : '';
}

/* คำบนไทล์รอบของปฏิทิน — "ตามปฏิทินลูกค้า · ส่งก่อน 16:00 น." · เครดิต N = "ตามปฏิทินลูกค้า · ทันรอบตัด อ. 20 ต.ค."
   (วันวางบิลของชิปเครดิต N คือวันทำงานสุดท้ายที่ยังทันรอบ ไม่ใช่วันตัดรอบ — บอกว่าทันรอบไหน · ไม่พูดเวลา)
   รอบรายเดือน/วันจ่ายประจำ = แค่เวลาตัดรอบถ้ามี (ไม่ซ้อนป้ายที่มา — กรรมการ 28/09 "วันละหนึ่งป้าย")
   `round` = ชิปของ `roundChoices` ({ billingDate, source, run }) หรือแค่ `{ billingDate }` (ไทล์ "ที่ตั้งไว้" — คิดรอบจากวันนั้น) */
export function roundTileNote(ruleValue, round) {
  const bill = dateOf(round?.billingDate);
  if (!bill) return '';
  const info = round.source && round.run ? null : cutoffInfo(ruleOf(ruleValue), bill);
  const source = round.source || info?.source || '';
  const run = round.run || info?.run || null;
  const bits = [];
  const calendar = source === 'calendar';
  if (calendar) bits.push(sourceLabel('calendar'));
  const cut = billingCutoffNote(ruleValue, bill);
  if (cut) bits.push(cut);
  else if (calendar && run?.cutoff && run.cutoff !== bill) bits.push(`ทันรอบตัด ${formatBillingDate(run.cutoff, { withYear: false })}`);
  return bits.join(' · ');
}

/* หัวของคำช่องว่าง ("ยังไม่มีปฏิทิน 2027") — ป้ายของงวดที่คนใส่เองแล้ว ไม่ต้องชวน "ใส่วันเองได้" ซ้ำ */
export function calendarGapHead(gap) {
  const text = gap?.text || calendarGapText(gap);
  const tail = ` · ${CALENDAR_MANUAL_HINT}`;
  return text.endsWith(tail) ? text.slice(0, -tail.length) : text;
}

/* "งวด 4–6, 8" — เลขงวดเรียง แล้วยุบช่วงที่ติดกัน (คำของแผงเติม/แถบนโยบาย) */
export function seqRangeText(seqs = []) {
  const list = [...new Set((seqs || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!list.length) return '';
  const parts = [];
  let start = list[0];
  let prev = list[0];
  for (const seq of [...list.slice(1), null]) {
    if (seq !== null && seq === prev + 1) { prev = seq; continue; }
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
    if (seq !== null) { start = seq; prev = seq; }
  }
  return `งวด ${parts.join(', ')}`;
}

/* งวดที่ข้ามรวมตามเหตุ — `[{ seqs, label: 'งวด 4–12', text: 'ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้' }]` (ลำดับตามงวดแรกของกลุ่ม)
   `skipped` = `[{ seq, text?, reason }]` ของตัวคิด (planFill · planRedate) · ไม่มีคำ (ไม่มีรอบถัดไป) = คำกลาง */
export function skipNotesOf(skipped = []) {
  const groups = new Map();
  for (const item of skipped || []) {
    const text = item?.text || `ไม่มีรอบถัดไปของลูกค้า · ${CALENDAR_MANUAL_HINT}`;
    if (!groups.has(text)) groups.set(text, []);
    groups.get(text).push(item.seq);
  }
  return [...groups.entries()]
    .map(([text, seqs]) => ({ seqs: [...seqs].sort((a, b) => Number(a) - Number(b)), label: seqRangeText(seqs), text }))
    .sort((a, b) => Number(a.seqs[0]) - Number(b.seqs[0]));
}

/**
 * งวดนี้ตกปีที่ปฏิทินของลูกค้ายังไม่มีไหม (ลูกค้าตามปฏิทินเท่านั้น · มติ 29/09 หยุด) — ตัวเดียวของเซลล์/แถบนโยบาย
 * · มีวันวางบิล = `calendarGapFor` ของวันนั้น · ไม่มีวันวางบิลแต่มีกำหนดชำระ = กำหนดชำระอยู่หลังเดือนที่ปฏิทินครอบ
 * · ยังไม่มีวันเลย = **ไม่มีรอบให้เลือกต่อจากงวดก่อน** (ชิปของตัวแก้ `roundChoicesFor` หมดที่ปีที่ยังไม่มี — คำเดียวกับตัวแก้)
 * · รอเหตุการณ์ = null (ไม่มีวันให้คิดอยู่แล้ว)
 * @returns null | `{ year, month, yearKnown, text }`
 */
export function rowCalendarGap(ruleValue, rows = [], currentOf = datesOf, row = null, todayIso = '', { holidays = null } = {}) {
  if (!row || !isCalendarRule(ruleValue)) return null;
  const rule = ruleOf(ruleValue);
  const v = datesOf(currentOf(row));
  /* ติ๊ก "งวดนี้ไม่ต้องวางบิล" = ปฏิทินวางบิลไม่เกี่ยวกับงวดนี้ (กำหนดชำระตั้งเองอยู่แล้ว) */
  if (v.billingSkip) return null;
  if (v.billingDate) return calendarGapFor(rule, v.billingDate);
  if (v.billingEvent) return null;
  if (v.dueDate) {
    const st = calendarStatus(rule, todayIso || v.dueDate);
    return st && v.dueDate.slice(0, 7) > st.coveredThrough
      ? { year: st.missingYear, month: st.missingFrom, yearKnown: st.partial, text: calendarGapText({ year: st.missingYear, month: st.missingFrom, yearKnown: st.partial }) }
      : null;
  }
  if (!dateOf(todayIso)) return null;
  const { list, missing } = roundChoicesFor(ruleValue, rows, currentOf, row, todayIso, 1, { holidays });
  return !list.length && missing ? missing : null;
}

/**
 * บรรทัดปฏิทินบนแถบนโยบายของใบ (ลูกค้าตามปฏิทิน · มติ 29/09) — ปฏิทินมีถึงเมื่อไร + งวดของใบนี้ที่ตกปีที่ยังไม่มี
 * @param rows งวดของใบ · `currentOf` = ค่าปัจจุบันบนจอ (ฐาน + ร่าง) · `isLocked` = งวดที่แก้ไม่ได้ (ไม่นับ — ไม่มีอะไรให้ทำ)
 * @returns null (ไม่ใช่ปฏิทิน / ไม่รู้วันนี้) | `{ coverage, gapText, requestText, remind, affected: [{ seqs, label, text }] }`
 *   · affected = งวดที่ยังเปิดที่ `rowCalendarGap` บอกว่าตกปีที่ยังไม่มี (วันวางบิล/กำหนดชำระในปีนั้น · หรือยังไม่มีวันและไม่มีรอบ
 *     ให้เลือกต่อจากงวดก่อนแล้ว)
 */
export function calendarPolicyOf(ruleValue, rows = [], currentOf = datesOf, todayIso = '', { isLocked = () => false, holidays = null } = {}) {
  const rule = ruleOf(ruleValue);
  const st = calendarStatus(rule, todayIso);
  if (!st) return null;
  const gapText = calendarGapText({ year: st.missingYear, month: st.missingFrom, yearKnown: st.partial });
  const skipped = [];
  for (const row of rows || []) {
    if (isLocked(row)) continue;
    /* ใส่ครบทั้งสองวันแล้ว (พิมพ์เองตอนยังไม่มีปฏิทิน) = ไม่มีอะไรให้ทำ — แถบไม่ชวน "ใส่วันเองได้" ซ้ำ ·
       เซลล์ของงวดยังบอก "ใส่เอง · ยังไม่มีปฏิทิน 2027" อยู่ */
    const v = datesOf(currentOf(row));
    if (v.billingDate && v.dueDate) continue;
    const gap = rowCalendarGap(ruleValue, rows, currentOf, row, todayIso, { holidays });
    if (gap) skipped.push({ seq: row.seq, text: gap.text });
  }
  return {
    coverage: `ปฏิทินของลูกค้ามีถึง ${st.coveredThroughText} — งวดที่วางบิลหลัง ${formatBillingDate(st.lastCoveredBilling)} ระบบไม่คิดกำหนดชำระให้`,
    gapText, requestText: st.requestText, remind: st.remind, affected: skipNotesOf(skipped),
  };
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
 * @returns `{ followSeq, list: [{ billingDate, dueDate, roundIndex, gap, usedBySeq, source, run, note }], missing }`
 *   `followSeq` = งวดที่รอบแรกต่อจาก (ป้าย "ต่อจากงวด N") · `usedBySeq` = งวดอื่นที่ใช้รอบนั้นอยู่ (ป้าย "งวด N")
 *   ⭐ รอบห้า: ชิปมาจาก `roundChoices` ตัวเดียวของ billingRule.js (ปฏิทินของลูกค้า = รอบจริงของปี) · `note` = คำบนไทล์
 *     (`roundTileNote` — "ตามปฏิทินลูกค้า · ส่งก่อน 16:00 น.") · `missing` = ชิปหมดเพราะปีถัดไปยังไม่มีปฏิทิน
 *     (`{ year, month, yearKnown, text: 'ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้' }` · มติ 29/09 หยุด — ไม่มีชิปประมาณการ)
 */
export function roundChoicesFor(ruleValue, rows, currentOf, row, todayIso, count = 3, { holidays = null } = {}) {
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
  /* วันหยุดในระบบ (useHolidayMap) — ชิปเครดิต N = วันทำงานสุดท้ายที่ยังทันรอบ ต้องตรงกับการ์ด/กระดิ่ง/ทะเบียน FN */
  const { chips, missing } = roundChoices(ruleOf(ruleValue), from, count, { holidays });
  const list = chips.map((chip) => ({
    billingDate: chip.billingDate,
    dueDate: chip.dueDate,
    roundIndex: chip.slot,
    source: chip.source,
    run: chip.run || null,
    gap: daysBetween(chip.billingDate, chip.dueDate),
    usedBySeq: used.get(chip.billingDate) ?? null,
    note: roundTileNote(ruleValue, chip),
  }));
  return { followSeq: follow ? prev.seq : null, list, missing: missing || null };
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
  if (dateModeKind(ruleValue) !== 'cadence') return null;
  const prevRows = before(rows, row).map((x) => ({ ...x, ...datesOf(currentOf(x)) }));
  if (creditDaysOf(ruleValue) !== null) {
    const suggestion = creditCadenceSuggestion(prevRows);
    if (!suggestion) return null;
    const plan = planCreditCadence(ruleOf(ruleValue), [{ id: row.id, seq: row.seq, status: 'pending' }], {
      dueDay: suggestion.dueDay, startMonth: suggestion.startMonth, includeDated: true,
    });
    const [pick] = plan.rows;
    return pick ? { fromSeq: suggestion.fromSeq, billingDate: pick.billingDate, dueDate: pick.dueDate, dueDay: suggestion.dueDay } : null;
  }
  const last = prevRows.filter((x) => x.billingDate).sort((a, b) => (a.billingDate < b.billingDate ? -1 : 1)).pop();
  if (!last) return null;
  const [y, m, d] = partsOf(last.billingDate);
  const billingDate = dayOfMonth(y, m + 1, d);
  return { fromSeq: last.seq, billingDate, dueDate: dueDateForBilling(ruleOf(ruleValue), billingDate) || '', dueDay: null };
}

/* กำหนดชำระเดิมของงวด (ก่อนมีรอบ) → วันวางบิลย้อนตามเครดิต — ทางลัด "ตามกำหนดชำระเดิม" ของลูกค้าเครดิต N วัน
   · ไม่มีเครดิต = วันวางบิลวันเดียวกับกำหนดชำระเดิม (ใบสินค้าเก่าที่มีแต่กำหนดชำระ แตะครั้งเดียวได้วันวางบิล) */
export function keepDueChoiceFor(ruleValue, row) {
  if (dateModeKind(ruleValue) !== 'cadence') return null;
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
   'locked' (ไม่อยู่ใน pending/rejected ⇒ ตัวคิดไม่แตะ แต่ยังนับวันวางบิลของมันเป็นเพดาน "ไม่ย้อนแซงงวดก่อน")
   · ติ๊ก "งวดนี้ไม่ต้องวางบิล" ไปด้วย (`billingSkip`) — ตัวคิดรุ่นสี่ไม่ร่างวันวางบิลให้งวดที่ติ๊ก */
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
        billingSkip: v.billingSkip,
      };
    });
}

/* งวดที่ตัวเติมแตะ — ว่าง (ไม่มีวันเลย) หรือรวมงวดที่มีวันแล้ว (`includeDated` · ไม่รวมรอเหตุการณ์) · มีรอบเติมงวดที่ยังไม่มี
   วันวางบิลด้วย (คงกำหนดชำระเดิม — planMonthlyFill) **ยกเว้นงวดที่ติ๊ก "งวดนี้ไม่ต้องวางบิล"** (ตัวเติมตามรอบให้แต่วันวางบิล) */
export function fillTargetsOf(kind, inputRows = [], { includeDated = false } = {}) {
  const roundsSkip = (row) => kind === 'rounds' && row.billingSkip === true;
  if (includeDated) return inputRows.filter((row) => installmentBillingRedatable(row) && !roundsSkip(row));
  if (kind === 'rounds') return inputRows.filter((row) => installmentBillingFillable(row) && !roundsSkip(row));
  return inputRows.filter((row) => installmentBillingFillable(row) && !row.dueDate);
}
/* จำนวนงวดที่ "จัดใหม่งวดที่มีวันแล้วด้วย" จะเพิ่มเข้ามา (สวิตช์บอกจำนวนก่อนเปิด) */
export function datedFillCount(kind, inputRows = []) {
  const all = fillTargetsOf(kind, inputRows, { includeDated: true }).map((row) => row.id);
  const empty = new Set(fillTargetsOf(kind, inputRows).map((row) => row.id));
  return all.filter((id) => !empty.has(id)).length;
}

/**
 * แผนของตัวเลือกหนึ่งในแผงเติม — ตัวคิดของ billingRule.js ตามชนิดของแผง (`fillKindOf`)
 * @param option
 *   `{ kind: 'rounds', roundIndex, includeDated }`                   planMonthlyFill / planRedate
 *   `{ kind: 'cadence', dueDay, startMonth | null, includeDated }`   planDueCadence (ยึดกำหนดชำระ · null = เดือนในชื่องวด)
 *     เครดิต N / ชำระวันวางบิล = วันวางบิล = กำหนดชำระ − N · ไม่ต้องวางบิล · ยังไม่ระบุ · ยังไม่ตั้งรอบ · **รูปเดิม { credit:false }**
 *     = กำหนดชำระอย่างเดียว (วันวางบิลคงเดิม — ไม่มีวันวางบิลปลอม · รอบกรรมการ 29/09)
 * @returns `{ rows: [{ id, seq, billingDate, dueDate }], skipped: [seq], error }`
 *   ⭐ รอบห้า (มีรอบ): + `skipNotes: [{ seqs, label, text }]` · `missing` — งวดที่ปีของปฏิทินยังไม่มี **ถูกข้ามพร้อมเหตุ**
 *     ("งวด 4–12: ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้" · มติ 29/09 หยุด) งวดก่อนหน้ายังเติมได้ · จัดใหม่ = งวดที่ข้ามคงวันเดิม
 */
export function planDateFill(ruleValue, inputRows = [], option = {}, todayIso = '', { holidays = null } = {}) {
  /* ผลการอ่านรุ่นสี่ตัวเดียว (`ruleOf`) — ตัวเติมเดินตัวคิดเดียวกับที่ `dateModeOf` ตัดสินชนิด (รุ่นสองที่มีรอบจ่ายได้รอบของรุ่นสี่) */
  const rule = ruleOf(ruleValue);
  const includeDated = Boolean(option.includeDated);
  const shape = (rows) => rows.map((r) => ({ id: r.id, seq: r.seq, billingDate: r.billingDate || '', dueDate: r.dueDate || '' }));
  if (option.kind === 'rounds') {
    /* งวดที่ติ๊กไม่ต้องวางบิลส่งเป็นงวดล็อก — ตัวคิดรุ่นสองของลูกค้าที่ตั้งรอบไว้ก่อน 0393 ไม่รู้จักติ๊ก (ร่างวันวางบิลที่บันทึกไม่ได้) */
    const rows = inputRows.map((row) => (row.billingSkip === true ? { ...row, status: 'locked' } : row));
    const plan = includeDated
      ? planRedate(rule, rows, todayIso, { roundIndex: option.roundIndex ?? null, holidays })
      : planMonthlyFill(rule, rows, todayIso, { roundIndex: option.roundIndex ?? null, holidays });
    /* 🐞 contracts §10 ข้อ 1: เดิมคืน `skipped: []` เสมอ ⇒ งวดที่ปีปฏิทินยังไม่มีหายไปจากแผงเงียบ ๆ (ไทล์บอก "งวด 1–3" ทั้งที่ใบมี 12) */
    const skipped = Array.isArray(plan.skipped) ? plan.skipped : [];
    return {
      rows: shape(plan.rows), skipped: skipped.map((s) => s.seq), skipNotes: skipNotesOf(skipped), missing: plan.missing || null,
      error: plan.error,
    };
  }
  /* `startMonth: null` = "ตามเดือนในชื่องวด" (ข้อ 6 ของมติ 28/09 · AR-622) — ไม่ส่งมา = ยังไม่เลือก (undefined ⇒ error) */
  const plan = planDueCadence(rule, inputRows, { dueDay: option.dueDay, startMonth: option.startMonth, includeDated });
  return { rows: shape(plan.rows), skipped: plan.skipped || [], error: plan.error };
}

/* ร่างหลังเติม — ทับเฉพาะงวดในแผนบนร่างฐานของแผงเติม (เลือกตัวเลือกใหม่ = เริ่มจากฐานเดิม ไม่ซ้อนผลรอบก่อน) ·
   ติ๊ก "งวดนี้ไม่ต้องวางบิล" ของฐานอยู่ต่อ (ตัวเติมเขียนแค่วัน) */
export function applyFillPlan(baseDrafts = {}, rows = [], plan = []) {
  const byId = new Map((rows || []).map((row) => [row.id, row]));
  let next = { ...(baseDrafts || {}) };
  for (const planned of plan || []) {
    const row = byId.get(planned.id);
    if (!row) continue;
    const base = currentDates(row, baseDrafts);
    next = withDraft(next, row, {
      billingDate: planned.billingDate || '', billingEvent: '', dueDate: planned.dueDate || '', billingSkip: base.billingSkip,
    });
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
 * ข้อเสนอแรกของแผงเติมแบบยึดกำหนดชำระ (ทุกแบบที่ไม่มีรอบ) — "ต่อจากงวด X · กำหนดชำระทุกวันที่ D" (ยึดงวดก่อนงวดแรกที่เติม)
 * · เปิด "จัดใหม่งวดที่มีวันแล้วด้วย" แล้วไม่มีงวดนอกแผนให้ยึด = "ยึดกำหนดชำระเดิมงวด X" (วันของงวดแรกในแผน · เดือนเดิม)
 * @returns `{ fromSeq, dueDay, startMonth, keep }` หรือ null
 */
export function creditFillSuggestion(inputRows = [], { includeDated = false } = {}) {
  const targets = new Set(fillTargetsOf('cadence', inputRows, { includeDated }).map((row) => row.id));
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
