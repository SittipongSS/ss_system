// ── ตัวเลือกรอบวางบิลของงวด — ค่าที่คุม `BillingRoundPicker` (หน้าสร้าง SO · แผงงวดของใบ) ──
//
// มติเจ้าของ 25–26/09/2026 (ม็อก mockups/billing-cycle จอ B + C):
//   · SA **แตะชิปรอบ** (3 รอบถัดไปของลูกค้า) → ระบบเติมทั้งวันวางบิลและกำหนดชำระ · "วันอื่น…" = กรอกวันวางบิลเอง
//     แล้วคิดกำหนดชำระให้ · "รอเหตุการณ์" = งวดที่ผูกเหตุการณ์ **ไม่เดาวัน** (ล้างทั้งสองวัน)
//   · กำหนดชำระที่คิดให้แก้ทับได้รายงวด ("แก้ทับรอบของลูกค้า") และคืนค่าตามรอบได้
//   · **ไม่มีค่าตั้งต้น** — งวดใหม่เริ่มที่ยังไม่เลือก (mode null) · ไม่บังคับเลือก (บางที่ไม่มีรอบวาง)
//
// รูปค่า (ผู้เรียกถือไว้ใน state ของตัวเอง — คอมโพเนนต์เป็น controlled):
//   `{ mode: 'round'|'other'|'event'|null, billingDate, billingEvent, dueDate, dueOverridden }`
//   วันที่เป็น ISO `YYYY-MM-DD` หรือ '' (ไม่ใช่ null — ช่อง DateInput/Input อ่านสตริง)
//   ⚠️ `billingEvent` ค้างอยู่ได้ตอนสลับไปแตะรอบ (ร่างที่พิมพ์ไว้ไม่หายเมื่อกลับมา "รอเหตุการณ์" — ม็อก B)
//      ⇒ **ส่งเข้า API ผ่าน `pickerPayload` เท่านั้น** อย่าอ่านช่องในค่าตรง ๆ
//
// ⚠️ ตัวคิดวันทั้งหมดอยู่ที่ `billingRule.js` (dueDateForBilling · billingRounds) — ไฟล์นี้แค่ต่อสาย ห้ามคิดวันเอง
// ⚠️ ไม่อ่านนาฬิกา — `todayIso` มาจาก `businessDate()` ของผู้เรียก (นาฬิกาไทย)
// ⚠️ รอบรุ่นสอง (mig 0390 · มติ 26/09): สวิตช์เครดิต + วางบิลได้ถึง 4 รอบต่อเดือน — **ห้ามอ่าน `rule.billing.day` /
//    `rule.payment.day` / `.monthOffset` ตรง ๆ** อีก (รูปรุ่นแรกแปลงตอนอ่าน ช่องพวกนั้นไม่มีแล้ว) ถามผ่านตัวช่วยของ billingRule.js
import {
  BILLING_EVENT_MAX, billingRoundCount, billingRoundLabels, billingRounds, billingRuleOf, dueDateForBilling, formatRoundChip,
} from './billingRule.js';

const dateOf = (value) => {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};
const MODES = new Set(['round', 'other', 'event']);

/**
 * รอบที่ "ใช้เลือกวันงวดได้" — ตัวเลือกรอบ · แผงงวด · หน้าสร้าง SO ถามตัวนี้ตัวเดียว
 * ⭐ **ไม่มีเครดิต = null** (มติเจ้าของ 26/09 ข้อ 2): จอ SO ทำเหมือนลูกค้ายังไม่ตั้งรอบทุกอย่าง — ช่องกำหนดชำระแบบเดิม ·
 *   ไม่มีวันวางบิล · ไม่มีปุ่มเติม/จัดวันใหม่ · ไม่มีชิปรอบ — แต่ **แสดง** ว่า "ไม่มีเครดิต" (ผู้เรียกถาม `billingRuleNoCredit` เอง)
 * 🐞 ถ้าส่ง `{ credit: false }` เข้าตัวเลือกตรง ๆ ตัวเลือกจะหาชิปรอบจาก `billing` ที่ไม่มีอยู่ (จอล้มทั้งแผง)
 * @returns รอบรูปมาตรฐาน (มีเครดิต) หรือ null (ไม่ตั้ง · ไม่มีเครดิต · รูปผิด)
 */
export function pickerRuleOf(value) {
  const rule = billingRuleOf(value);
  return rule && rule.credit !== false ? rule : null;
}

/**
 * ชิปรอบถัดไปของตัวเลือก — `[{ value: billingDate, date: '5 ต.ค.', due: 'เงินเข้า 25 ต.ค.' | '' }]`
 * ⭐ ลูกค้าหลายรอบต่อเดือน (มติ 26/09 ข้อ 3) ชิปเรียงสลับรอบตามวัน (`billingRounds`) · สองรอบในเดือนเดียวกันต่างกันที่
 *   **เงินเข้า** (แต่ละรอบมีวันเงินเข้าของตัวเอง) ⇒ ชิปของลูกค้าหลายรอบบอกวันเงินเข้าด้วย ให้แยกออกก่อนแตะ
 *   ไม่ใช่รู้หลังแตะแล้วค่อยเห็นบรรทัดผล · ลูกค้ารอบเดียว = วันเดียวพอ (เงินเข้าทุกชิปแบบเดียวกัน · ชิปแคบในเซลล์ตาราง)
 * ไม่มีรอบรายเดือน (วางบิลได้ทุกวัน · ไม่มีเครดิต · ไม่ตั้ง) = []
 */
export function pickerRoundOptions(value, todayIso, count = 3) {
  const rule = pickerRuleOf(value);
  if (!rule) return [];
  const multi = billingRoundCount(rule) > 1;
  return billingRounds(rule, todayIso, count).map((round) => ({
    value: round.billingDate,
    date: formatRoundChip(round.billingDate),
    due: multi && round.dueDate ? `เงินเข้า ${formatRoundChip(round.dueDate)}` : '',
  }));
}

/**
 * ตัวเลือก "ใช้รอบไหน" ของปุ่มเดือนละงวด (เติมตามรอบ · จัดวันใหม่) — ลูกค้าหลายรอบต่อเดือนต้องเลือกก่อนเสมอ
 * (`planMonthlyFill`/`planRedate` ตีกลับเมื่อไม่ส่ง `roundIndex`) · **ไม่มีค่าตั้งต้น** (กฎบ้าน: ไม่เลือกให้)
 * ⭐ ค่าของชิป = **วันวางบิลของรอบ** ไม่ใช่ลำดับ (review R-B2 26/09) — โมดัลเปิดค้างแล้ว 409 ดึงรอบลูกค้าใหม่
 *   ([10,25] → [5,10,25]) ลำดับที่ 1 เลื่อนจาก "รอบวันที่ 25" ไปเป็น "รอบวันที่ 10" เงียบ ๆ (ชิปที่เลือกกระโดดเอง)
 *   · จำวันไว้แล้วถาม `pickedRoundIndex` ทุกครั้งที่วาด = รอบเดิมตามไปถูกที่ หรือหลุดเป็น "ยังไม่เลือก" ถ้ารอบนั้นหายไป
 * @returns `[{ value: billingDay, label: 'รอบวันที่ 10' | 'รอบสิ้นเดือน' }]` — รอบเดียว/ไม่มีรอบ = [] (ไม่ต้องถาม)
 */
export function billingRoundChoices(value) {
  const rule = pickerRuleOf(value);
  const labels = billingRoundLabels(rule);
  return labels.length > 1 ? labels.map((label, index) => ({ value: rule.billing.days[index], label: `รอบ${label}` })) : [];
}

/**
 * วันวางบิลของรอบที่ผู้ใช้เลือกไว้ (ค่าของชิปจาก `billingRoundChoices`) → `roundIndex` ที่ส่งเข้า `planMonthlyFill`/`planRedate`/API
 * · ลูกค้ารอบเดียว = null (ตัวคิดใช้รอบนั้นเอง — ค่าที่ค้างใน state จากตอนลูกค้ามีหลายรอบต้องไม่ถูกส่ง)
 * · หลายรอบ = ลำดับของวันนั้นใน **รอบปัจจุบัน** ของลูกค้า · ยังไม่เลือก / รอบที่เลือกไม่มีแล้ว = null
 *   (ผู้เรียกยังไม่คิดแผน — ห้ามเดารอบแรก และห้ามเลื่อนไปรอบข้างเคียงให้เอง)
 */
export function pickedRoundIndex(value, pickedDay) {
  const rule = pickerRuleOf(value);
  if (billingRoundCount(rule) <= 1 || !Number.isInteger(pickedDay)) return null;
  const index = rule.billing.days.indexOf(pickedDay);
  return index >= 0 ? index : null;
}

/* ค่าว่าง = ยังไม่เลือก (ไม่ใช่ "ทุกวัน" หรือรอบแรก — ไม่มีค่าตั้งต้นให้การตัดสินใจ) */
export const EMPTY_PICKER_VALUE = Object.freeze({
  mode: null, billingDate: '', billingEvent: '', dueDate: '', dueOverridden: false,
});

/* ทำค่าที่ผู้เรียกส่งมาให้ครบรูป — ค่าหาย/รูปเพี้ยน = ช่องว่าง ไม่ throw บนจอ (คอมโพเนนต์อ่านผ่านตัวนี้) */
export function normalizePickerValue(value) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    mode: MODES.has(v.mode) ? v.mode : null,
    billingDate: dateOf(v.billingDate),
    billingEvent: typeof v.billingEvent === 'string' ? v.billingEvent : '',
    dueDate: dateOf(v.dueDate),
    dueOverridden: Boolean(v.dueOverridden),
  };
}

/**
 * ค่าเริ่มของตัวเลือกจากแถวงวดที่มีอยู่ (แผงงวด) — แถวว่าง/ไม่มีแถว (หน้าสร้าง SO) = ยังไม่เลือก
 * · มีเหตุการณ์ = 'event' · วันวางบิลตรงหนึ่งใน 3 รอบถัดไป = 'round' · วันอื่น (รวมรอบที่ผ่านไปแล้ว) = 'other'
 * · กำหนดชำระ **อ่านตามแถวเสมอ** (เปิดแล้วกดบันทึกเลยต้องไม่ทำวันที่มีอยู่หาย) ·
 *   `dueOverridden` = กำหนดชำระที่บันทึกไม่ตรงกับที่คิดจากรอบของวันวางบิลนั้น
 */
export function pickerValueFromRow(row, value, todayIso) {
  if (!row) return { ...EMPTY_PICKER_VALUE };
  const rule = pickerRuleOf(value);
  const billingDate = dateOf(row.billingDate);
  const billingEvent = String(row.billingEvent ?? '').trim();
  const dueDate = dateOf(row.dueDate);
  if (billingEvent && !billingDate) {
    return { mode: 'event', billingDate: '', billingEvent, dueDate, dueOverridden: false };
  }
  if (!billingDate) return { ...EMPTY_PICKER_VALUE, dueDate };
  const rounds = billingRounds(rule, todayIso, 3).map((round) => round.billingDate);
  return {
    mode: rounds.includes(billingDate) ? 'round' : 'other',
    billingDate,
    billingEvent: '',
    dueDate,
    dueOverridden: Boolean(dueDate) && dueDate !== dueDateForBilling(rule, billingDate),
  };
}

/**
 * ค่าถัดไปหลังผู้ใช้เลือก — `pick`:
 *   `{ mode: 'round', billingDate }`   แตะชิปรอบ
 *   `{ mode: 'other', billingDate }`   แตะ "วันอื่น…" (billingDate '' ได้) หรือกรอกวันในช่องวันวางบิล
 *   `{ mode: 'event', billingEvent? }` แตะ "รอเหตุการณ์" (ไม่ส่งชื่อ = คงชื่อเดิม) หรือพิมพ์/แตะชื่อเหตุการณ์
 *   `{ mode: 'overrideDue', dueDate }` แก้กำหนดชำระทับรอบ
 *   `{ mode: 'resetDue' }`            คืนกำหนดชำระตามรอบ
 *   `{ mode: 'clear', dueDate? }`     ล้างที่เลือกกลับเป็นยังไม่เลือก — `dueDate` = กำหนดชำระที่บันทึกอยู่ในฐาน
 *                                      (ผู้เรียกส่ง `savedDueDate` มา) ⇒ ได้รูปเดียวกับที่ `pickerValueFromRow` ให้แถวเดิม
 * กติกาการแก้ทับ (ม็อก B + C ตรงกัน): **แตะชิปใหม่ = ตัดสินใจใหม่ ⇒ ทิ้งค่าที่แก้ทับ** · แก้วันในช่อง
 * "วันอื่น…" ต่อ = ยังเป็นการตัดสินใจเดิม ⇒ คงค่าที่แก้ทับไว้ (ม็อก C "เว้นแต่ SA แก้ทับไว้แล้ว")
 * ⚠️ **สลับเข้า** รอเหตุการณ์ = ล้างทั้งวันวางบิลและกำหนดชำระ (ไม่เดาวัน) — ผู้เรียกที่มีวันเดิมในฐานบอกผลผ่าน `savedDueDate`
 *    แต่พิมพ์/แตะชื่อเหตุการณ์ของแถวที่รอเหตุการณ์อยู่แล้ว = ไม่แตะกำหนดชำระ (แถวเก่าที่มีวันค้าง — เปิดแล้วแก้ชื่อต้องไม่ลบวัน)
 * ⚠️ "ล้างที่เลือก" ต้อง **ไม่ลบ** กำหนดชำระที่บันทึกอยู่ — ช่องนี้คุมป้ายแดง "เลยกำหนด" และด่านนัดช่าง (visitGate)
 *    ปุ่มล้างหน้าตาเหมือน "ยกเลิกสิ่งที่แตะ" ⇒ ต้องพากลับไปค่าเดิมของแถว ไม่ใช่ว่างเปล่า (review S0 26/09)
 */
export function applyPick(value, pick, rule) {
  const base = normalizePickerValue(value);
  switch (pick?.mode) {
    case 'round': {
      const billingDate = dateOf(pick.billingDate);
      if (!billingDate) return base;
      return { mode: 'round', billingDate, billingEvent: base.billingEvent, dueDate: dueDateForBilling(rule, billingDate), dueOverridden: false };
    }
    case 'other': {
      const billingDate = dateOf(pick.billingDate);
      const keep = base.mode === 'other' && base.dueOverridden;
      return {
        mode: 'other',
        billingDate,
        billingEvent: base.billingEvent,
        dueDate: keep ? base.dueDate : (billingDate ? dueDateForBilling(rule, billingDate) : ''),
        dueOverridden: keep,
      };
    }
    case 'event': {
      const billingEvent = typeof pick.billingEvent === 'string' ? pick.billingEvent.slice(0, BILLING_EVENT_MAX) : base.billingEvent;
      /* ล้างกำหนดชำระเฉพาะตอนสลับเข้ามา — อยู่ในรอเหตุการณ์แล้ว (พิมพ์ชื่อ · แตะชื่อที่ใช้บ่อย) คงวันที่อ่านมาจากแถว */
      const dueDate = base.mode === 'event' ? base.dueDate : '';
      return { mode: 'event', billingDate: '', billingEvent, dueDate, dueOverridden: false };
    }
    case 'overrideDue': {
      /* แก้ทับได้เฉพาะงวดที่มีวันวางบิลแล้ว — ไม่มีวันวางบิล = ไม่มี "วันที่คิดจากรอบ" ให้ทับ */
      if ((base.mode !== 'round' && base.mode !== 'other') || !base.billingDate) return base;
      const dueDate = dateOf(pick.dueDate);
      return { ...base, dueDate, dueOverridden: dueDate !== dueDateForBilling(rule, base.billingDate) };
    }
    case 'resetDue': {
      if (!base.billingDate) return { ...base, dueOverridden: false };
      return { ...base, dueDate: dueDateForBilling(rule, base.billingDate), dueOverridden: false };
    }
    case 'clear':
      return { ...EMPTY_PICKER_VALUE, dueDate: dateOf(pick.dueDate) };
    default:
      return base;
  }
}

/**
 * ค่าที่ส่งเข้า API — รูปเดียวกับที่ `normalizeInstallmentBilling` รับ (+ dueDate)
 * · วันวางบิลกับเหตุการณ์ไม่มาคู่กันเด็ดขาด (CHECK ของ mig 0389)
 * · "วันอื่น…" ที่ยังไม่กรอกวัน / รอเหตุการณ์ที่ยังไม่มีชื่อ = ส่งว่าง (ดู `pickerMissing` ก่อนบันทึก)
 * · ยังไม่เลือก = คงกำหนดชำระเดิมของแถว (ไม่ล้างวันที่ SA กรอกไว้ก่อนมีรอบ)
 */
export function pickerPayload(value) {
  const v = normalizePickerValue(value);
  const billingDate = v.mode === 'round' || v.mode === 'other' ? v.billingDate || null : null;
  const billingEvent = v.mode === 'event' ? v.billingEvent.trim().slice(0, BILLING_EVENT_MAX) || null : null;
  return { billingDate, billingEvent, dueDate: v.dueDate || null };
}

/**
 * เลือกแล้วแต่ยังตอบไม่ครบ — '' = ครบ/ยังไม่เลือก (การไม่เลือกไม่ใช่ข้อผิดพลาด · มติ 26/09 ข้อ 2)
 * ⚠️ รอเหตุการณ์ต้องมีชื่อ — ฐานเก็บ "รอเหตุการณ์" เป็นชื่อเหตุการณ์ (1..120 ตัว) ไม่มีชื่อ = ไม่มีอะไรให้เก็บ
 *    งวดจะกลับไปเป็น "ยังไม่กำหนด" เงียบ ๆ
 */
export function pickerMissing(value) {
  const v = normalizePickerValue(value);
  if (v.mode === 'other' && !v.billingDate) return 'กรอกวันวางบิล — ระบบคิดกำหนดชำระตามรอบของลูกค้าให้';
  if (v.mode === 'event' && !v.billingEvent.trim()) return 'เลือกหรือพิมพ์เหตุการณ์ที่รอ (เช่น ก่อนส่งสินค้า)';
  return '';
}

/* กำหนดชำระที่แก้ทับไปก่อนวันวางบิล — เตือนอย่างเดียว ไม่บล็อก (เงินเข้าก่อนวางบิลเกิดได้จริง แต่มักพิมพ์ผิด) */
export function pickerDueBeforeBilling(value) {
  const v = normalizePickerValue(value);
  return Boolean(v.billingDate && v.dueDate && v.dueDate < v.billingDate);
}
