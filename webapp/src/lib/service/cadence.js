// ── ความถี่ของรอบบริการ (mig 0397) — logic ล้วน ─────────────────────────────────────────────────
//
// ⭐ มติเจ้าของ 29/09: รอบบริการต้องเดิน **ตามปฏิทิน** ได้ ("ทุกเดือน วันที่ 22" · "ทุกสัปดาห์ วันพุธ")
//    ไม่ใช่แค่ "ทุก N วัน" — ของเดิม "ทุกเดือน" คือ 30 วัน ⇒ สัญญา 12 เดือนได้ 13 นัด บางเดือนสองนัด
//    และวันที่ของเดือนไหลไปเรื่อย ๆ ทั้งที่ตารางช่างจริงนัด "วันที่ 17 ของเดือน"
//
// รอบมีชนิด (`cadenceKind`) + ช่องของชนิดนั้น:
//   monthly  ทุก `cadenceEvery` เดือน วันที่ `cadenceMonthDay` (31 = สิ้นเดือน) · มีช่วงวันได้ (`cadenceMonthDayTo`)
//   weekly   ทุก `cadenceEvery` สัปดาห์ วัน `cadenceWeekday` (0 = อาทิตย์ … 6 = เสาร์ เลขเดียวกับ accessDays ของไซต์)
//   days     ทุก `everyDays` วัน (ของเดิม — พฤติกรรมตรึงไว้ทุกตัวอักษร)
//
// กติกาที่ทั้งไฟล์ถือ:
//   · **ช่องของรอบ (slot)** = วันตามรอบ *ก่อน* เลื่อนหนีวันหยุด คิดจากวันเริ่มรอบเสมอ ไม่ใช่จากนัดก่อนหน้า ⇒ ไม่ไหล
//   · **วันนัด** = ช่องที่เลื่อนหนีวันหยุดแล้ว (คำตอบเจ้าของข้อ 2): ไปข้างหน้าหาวันทำการโดยไม่ข้ามเดือน/สัปดาห์/ช่วงวัน
//     ไปไม่ได้จึงถอยหลัง ⇒ หนึ่งงวดได้หนึ่งนัดเสมอ · ชนิด days เลื่อนไปข้างหน้าอย่างเดียวเหมือนเดิม
//   · ทุกฟังก์ชันรับ "ของหน้าตาเหมือนรอบ" (แถว service_plans · payload ของฟอร์ม · ข้อเสนอ) และอ่านวันด้วย
//     `String(v).slice(0, 10)` — เป็นสตริง 'YYYY-MM-DD' ล้วน เลขคณิตปฏิทินผ่าน Date.UTC เท่านั้น ไม่มีโซนเวลา
//   · แถว/ของที่ **ไม่มี `cadenceKind` แต่มี `everyDays`** = รอบชนิด days (แถวก่อน mig 0397 · fixture · แท็บรุ่นเก่า)
//
// 🔴 import ได้บรรทัดเดียว: `@/lib/datePeriods` (ไฟล์นั้นไม่ import ใคร ⇒ ไม่มีทางเกิดวงวน)
//    วันในสัปดาห์กับต้นสัปดาห์ถามที่นั่นที่เดียว (มติ 26/09 สัปดาห์เริ่มวันอาทิตย์) — **ห้ามเขียนตัวหาวันในสัปดาห์
//    หรือต้นสัปดาห์ซ้ำที่นี่** และไฟล์นี้ไม่ส่งออกเลขคณิตวันของตัวเอง (ผู้เรียกใช้ addDays · dayOfWeek · weekStartOf
//    จาก datePeriods ตรง ๆ) · ห้าม import rounds.js หรืออะไรใต้ lib/sales (rounds.js เป็นฝ่าย import ไฟล์นี้)
import { addDays, dayOfWeek, weekStartOf } from '@/lib/datePeriods';

export const CADENCE_KINDS = ['monthly', 'weekly', 'days'];
/** 31 = สิ้นเดือน — เลขเดียวกับ billingRuleV4.MONTH_END_DAY (เทสต์ทาบให้ตรงกัน) */
export const MONTH_END_DAY = 31;
export const DEFAULT_HORIZON_DAYS = 90;
/** ตัวเลือก "ทุกกี่เดือน" — ชุดเดียวทั้งชิปในโมดัลและตัวเสนอความถี่ (ข้อเสนอที่กดแล้วต้องมีชิปให้ติด) */
export const CADENCE_EVERY_MONTHS = [1, 2, 3, 4, 6, 12];
export const CADENCE_EVERY_WEEKS = [1, 2];
export const CADENCE_FIELDS = ['cadenceKind', 'everyDays', 'cadenceEvery', 'cadenceWeekday', 'cadenceMonthDay', 'cadenceMonthDayTo'];
/** ดัชนี = dayOfWeek() ของ datePeriods (0 = อาทิตย์) — ลำดับเดียวกับ sites.WEEKDAY_LABELS */
export const WEEKDAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

const MAX_EVERY_DAYS = 365;
const MAX_EVERY_WEEKS = 52;
const MAX_EVERY_MONTHS = 12;
const MAX_SLOTS = 2000;
const SHIFT_GUARD = 14;
const DAY_MS = 86400000;

/* ── ข้อความผิดของตัวตรวจ — ตัวเดียวทั้งโมดัลและ API (normalizePlanInput → normalizeCadence) ─────────
   `days` คือข้อความเดิมของ rounds.js (เทสต์เดิมตรึงไว้) · `staleClient` ไม่ได้ออกจาก normalizeCadence
   — rounds.mergePlanPatch เป็นคนตอบ เมื่อแท็บรุ่นเก่าส่งแค่ everyDays มาแก้รอบที่ตั้งตามปฏิทินแล้ว */
export const CADENCE_ERRORS = Object.freeze({
  kind: 'ต้องเลือกความถี่ของรอบ',
  days: 'รอบต้องเป็นจำนวนวันระหว่าง 1–365',
  weekEvery: 'รอบรายสัปดาห์ต้องเป็นทุก 1–52 สัปดาห์',
  weekday: 'ต้องเลือกวันของสัปดาห์',
  weekend: 'ช่างไม่เข้าไซต์เสาร์–อาทิตย์ — เลือกวันจันทร์–ศุกร์',
  monthEvery: 'รอบรายเดือนต้องเป็นทุก 1–12 เดือน',
  monthDay: 'ต้องเลือกวันที่ของเดือน (1–31)',
  monthDayTo: 'วันสุดท้ายของช่วงต้องอยู่หลังวันแรก และไม่เกินวันที่ 31',
  staleClient: 'หน้านี้เป็นรุ่นเก่า — รอบนี้ตั้งตามปฏิทินแล้ว รีเฟรชหน้าแล้วแก้รอบอีกครั้ง',
});

/* ── คำบนจอของความถี่ทั้งชุด — โมดัลรอบบริการ · โมดัลยืนยันเปลี่ยนรอบ · เส้น API อ่านจากที่นี่ที่เดียว ─────
   คำเรียกจำนวนรอบ = "จำนวนรอบบริการ" (มติ 29/09) · รอบของ TS = "รอบบริการ" / "รอบ" */
export const CADENCE_TEXT = Object.freeze({
  fieldLabel: 'ความถี่',
  tiles: Object.freeze([
    Object.freeze({ value: 'monthly', label: 'ทุกเดือน (ตามวันที่)', description: 'นัดวันที่เดิมของทุกเดือน' }),
    Object.freeze({ value: 'weekly', label: 'ทุกสัปดาห์ (ตามวัน)', description: 'นัดวันเดิมของสัปดาห์' }),
    Object.freeze({ value: 'days', label: 'ทุก N วัน', description: 'นับวันต่อกัน (แบบเดิม)' }),
  ]),
  everyLabel: 'ทุก',
  monthsUnit: (n) => `${n} เดือน`,
  weeksUnit: (n) => `${n} สัปดาห์`,
  monthDayLabel: 'วันที่',
  dayModes: Object.freeze([
    Object.freeze({ value: 'single', label: 'วันเดียว' }),
    Object.freeze({ value: 'range', label: 'ช่วงวัน' }),
  ]),
  monthEndHint: 'เดือนที่ไม่มีวันที่นี้ใช้วันสุดท้ายของเดือน',
  rangeHint: 'แตะวันแรกของช่วง แล้วแตะวันสุดท้าย — ระบบนัดวันทำการแรกของช่วง ผู้จัดคิวเลื่อนได้ภายในช่วงนี้',
  rangePending: 'เลือกวันสุดท้ายของช่วง หรือเปลี่ยนเป็น “วันเดียว”',
  rangeUnset: 'เลือกวันแรกและวันสุดท้ายของช่วง หรือเปลี่ยนเป็น “วันเดียว”',
  weekdayLabel: 'วัน',
  weekendBlocked: 'ช่างไม่เข้าไซต์เสาร์–อาทิตย์',
  /* (ป้ายวันที่ไซต์ให้เข้า เช่น "จ. อ. พ.", ชื่อวันที่เลือก เช่น "พฤหัสบดี") — ท่อนแรกคือประโยคเดียวกับ sites.accessConflict
     ⚠️ ต้องเรียกชื่อวัน: คำว่า "วันนี้" อ่านเป็น "today" ทั้งที่กำลังพูดถึงวันของรอบ */
  accessWarning: (allowed, picked) => `ไซต์นี้ให้เข้าเฉพาะ ${allowed} — วัน${picked}อยู่นอกวันที่ไซต์เปิดให้เข้า`,
  everyDaysLabel: 'รอบ (วัน)',
  everyDaysHint: 'นับต่อกันทุก N วันจากวันเริ่มรอบ — วันที่ของเดือนจะไม่คงที่',
  visits: (n) => `ได้ ${n} นัด`,
  matchesSold: 'ตรงกับจำนวนรอบบริการ',
  needEndDate: 'ใส่วันสิ้นสุดรอบด้วย จึงจะประมาณจำนวนนัดให้ได้',
  nextLabel: 'นัดถัดไป:',
  shiftReason: Object.freeze({ sun: 'ตรงวันอาทิตย์', sat: 'ตรงวันเสาร์', holiday: 'ตรงวันหยุด' }),
  useSuggestion: 'ใช้',
  useSuggestionAria: (text) => `ใช้ความถี่${text}`,
  confirm: Object.freeze({
    title: 'เปลี่ยนรอบบริการ',
    message: (n) => `ยกเลิกนัดตามรอบเดิม ${n} นัด?`,
    detail: (from, to) => (from === to
      ? `วันเริ่มหรือวันสิ้นสุดของรอบเปลี่ยน — นัดในรายการนี้ยังไม่ได้เข้าและไม่มีใครย้ายวัน จะถูกยกเลิกและถอดออกจากรอบนี้ (ยังเห็นในประวัติของไซต์) แล้วระบบสร้างนัดตามรอบใหม่ให้`
      : `รอบเปลี่ยนจาก “${from}” เป็น “${to}” — นัดในรายการนี้ยังไม่ได้เข้าและไม่มีใครย้ายวัน จะถูกยกเลิกและถอดออกจากรอบนี้ (ยังเห็นในประวัติของไซต์) แล้วระบบสร้างนัดตามรอบใหม่ให้`),
    /* `manual` = นัดของรอบที่ยังไม่ได้เข้าและ **ไม่ได้ถือช่องของรอบ** (คนตั้งเอง · ยืนยันจากแถบ "ตั้งนัดรอบถัดไป" ของรอบทุก N วัน)
       — ระบบไม่ยกเลิกและไม่ย้ายให้ จึงต้องบอกจำนวนให้คนไปดูเอง */
    kept: ({ moved = 0, started = 0, past = 0, manual = 0 } = {}) => {
      const parts = [
        moved ? `ย้ายวันเอง ${moved} นัด` : null, started ? `กำลังทำ ${started} นัด` : null,
        past ? `เลยวันนัดแล้ว ${past} นัด` : null, manual ? `ตั้งนัดเอง ${manual} นัด` : null,
      ].filter(Boolean);
      return parts.length ? `นัดตามรอบเดิมที่ไม่ถูกแตะ: ${parts.join(' · ')} — จัดการเองได้ที่หน้าจัดคิว` : null;
    },
    /* นัดที่ยังไม่ได้เข้าซึ่ง **อยู่ต่อเป็นนัดของรอบใหม่** (วันนัดตรงกับรอบใหม่ · หรือช่องของงวดนี้เลยวันไปแล้ว) — กล่องยืนยันบอกก่อนกด
       และ toast หลังบันทึกใช้คำเดียวกัน · 0 = null */
    stays: (n) => (n ? `คงนัดเดิม ${n} นัดไว้ตามรอบใหม่` : null),
    confirmLabel: (n) => `ยกเลิกนัดตามรอบเดิม ${n} นัด แล้วบันทึก`,
    cancelLabel: 'กลับไปแก้รอบ',
    needConfirm: (n) => `รอบนี้มีนัดตามรอบเดิมที่ยังไม่ได้เข้า ${n} นัด — ยืนยันการยกเลิกนัดก่อนบันทึก`,
    stale: 'รายการนัดตามรอบเดิมเปลี่ยนไปจากที่ยืนยัน — ตรวจรายการอีกครั้ง',
    threadBody: (from, to) => (from === to
      ? `ยกเลิกนัดตามรอบเดิม — ช่วงของรอบบริการเปลี่ยน (${to})`
      : `ยกเลิกนัดตามรอบเดิม — รอบบริการเปลี่ยนจาก “${from}” เป็น “${to}”`),
    cancelFailed: 'ยกเลิกนัดตามรอบเดิมไม่ครบ — ยังไม่ได้บันทึกรอบ กดบันทึกอีกครั้ง',
    saveFailed: (n) => `ยกเลิกนัดตามรอบเดิมแล้ว ${n} นัด แต่บันทึกรอบไม่สำเร็จ — กดบันทึกอีกครั้ง`,
    afterSaveFailed: 'บันทึกรอบแล้ว แต่จัดนัดตามรอบใหม่ไม่ครบ — กดบันทึกอีกครั้ง',
  }),
  holidayReadFailed: 'อ่านวันหยุดของระบบไม่สำเร็จ — ยังไม่ได้บันทึกอะไร ลองอีกครั้ง',
});

// ── วัน ('YYYY-MM-DD' ล้วน) ───────────────────────────────────────────────────────────────────
// ⚠️ ตรวจด้วย isIsoDay ตัวนี้ก่อนเรียก addDays / dayOfWeek / weekStartOf ของ datePeriods เสมอ —
//    `isDayValue` ที่นั่นดูแค่รูป ('2026-02-31' ผ่าน) ส่วนที่นี่ต้องเป็นวันที่มีจริงในปฏิทิน
const DAY_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad2 = (n) => String(n).padStart(2, '0');
const dayText = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
const partsOf = (value) => {
  const m = DAY_SHAPE.exec(String(value ?? ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const blank = (v) => v === null || v === undefined || v === '';
/** ค่าที่เป็นวัน (หรือ timestamp ที่ขึ้นต้นด้วยวัน) → สิบตัวแรก · ว่าง = null */
const day10 = (v) => (blank(v) ? null : String(v).slice(0, 10));
const utcOf = (day) => { const p = partsOf(day); return Date.UTC(p[0], p[1] - 1, p[2]); };
const daysBetween = (a, b) => Math.round((utcOf(b) - utcOf(a)) / DAY_MS);
const earlier = (a, b) => (a == null ? b : b == null ? a : (a < b ? a : b));
const later = (a, b) => (a == null ? b : b == null ? a : (a > b ? a : b));

/** เป็นวันจริงในปฏิทินไหม — '2026-02-30' = false · ไม่ตัดสตริงให้ (timestamp = false) */
export function isIsoDay(value) {
  const p = partsOf(value);
  return !!p && p[1] >= 1 && p[1] <= 12 && p[2] >= 1 && p[2] <= lastDayOf(p[0], p[1]);
}

/** วันที่ของเดือน 1..31 · ไม่ใช่วัน = null */
export function dayOfMonth(iso) {
  const day = day10(iso);
  return isIsoDay(day) ? partsOf(day)[2] : null;
}

/** วันในสัปดาห์ของวันที่ตรวจแล้ว (0 = อาทิตย์) — ถาม datePeriods ไม่คิดเอง */
const weekdayOn = (day) => (isIsoDay(day) ? dayOfWeek(day) : null);

// ── รูปของความถี่ ───────────────────────────────────────────────────────────────────────────
const intIn = (v, lo, hi) => {
  if (blank(v) || (typeof v !== 'number' && typeof v !== 'string')) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

/** รูปอ่านภายใน · null = อ่านไม่ออก
 *  ⚠️ ชนิด days อ่านแบบผ่อน (ตัวเลข ≥ 1 ปัดลง) เท่าโค้ดเดิม — แถวเก่ากับ fixture ต้องเดินได้เหมือนเดิม */
export function cadenceOf(p) {
  if (!p) return null;
  const kind = p.cadenceKind || (!blank(p.everyDays) ? 'days' : null);
  if (kind === 'days') {
    const n = Number(p.everyDays);
    return !blank(p.everyDays) && Number.isFinite(n) && n >= 1 ? { kind, everyDays: Math.floor(n) } : null;
  }
  if (kind === 'weekly') {
    const every = intIn(p.cadenceEvery, 1, MAX_EVERY_WEEKS);
    const weekday = intIn(p.cadenceWeekday, 0, 6);
    return every && weekday !== null ? { kind, every, weekday } : null;
  }
  if (kind === 'monthly') {
    const every = intIn(p.cadenceEvery, 1, MAX_EVERY_MONTHS);
    const monthDay = intIn(p.cadenceMonthDay, 1, MONTH_END_DAY);
    if (!every || !monthDay) return null;
    if (blank(p.cadenceMonthDayTo)) return { kind, every, monthDay, monthDayTo: null };
    const monthDayTo = intIn(p.cadenceMonthDayTo, monthDay + 1, MONTH_END_DAY);
    return monthDayTo === null ? null : { kind, every, monthDay, monthDayTo };
  }
  return null;
}

const NULL_CADENCE = Object.freeze({
  cadenceKind: null, everyDays: null, cadenceEvery: null, cadenceWeekday: null, cadenceMonthDay: null, cadenceMonthDayTo: null,
});

/** ตัวตรวจตัวเดียวของความถี่ → `{ value: หกช่อง | null, error }`
 *  ⭐ คืน **ครบหกช่องเสมอ ช่องที่ชนิดนั้นไม่ใช้เป็น null** — PATCH ที่ merge `{...before, ...body}` จะได้ไม่เหลือ
 *     everyDays ของรอบเดิมค้างอยู่ (CHECK service_plans_cadence_shape จะตีแถวนั้นกลับ)
 *  ไม่มีชนิดแต่มี everyDays = days (ผู้เรียกรุ่นเก่า) · null / undefined / '' = "ไม่ได้ส่งมา" ไม่ถูกแปลงเป็น 0
 *  ⚠️ วันเสาร์–อาทิตย์ของรอบรายสัปดาห์ถูกปฏิเสธที่นี่ (กติกางาน) ทั้งที่ CHECK ในฐานรับ 0–6 (รูปข้อมูล) โดยตั้งใจ */
export function normalizeCadence(body = {}) {
  const fail = (error) => ({ value: null, error });
  const kind = body?.cadenceKind || (!blank(body?.everyDays) ? 'days' : null);
  if (!CADENCE_KINDS.includes(kind)) return fail(CADENCE_ERRORS.kind);
  if (kind === 'days') {
    const everyDays = intIn(body.everyDays, 1, MAX_EVERY_DAYS);
    return everyDays ? { value: { ...NULL_CADENCE, cadenceKind: kind, everyDays }, error: null } : fail(CADENCE_ERRORS.days);
  }
  if (kind === 'weekly') {
    const every = intIn(body.cadenceEvery, 1, MAX_EVERY_WEEKS);
    if (!every) return fail(CADENCE_ERRORS.weekEvery);
    const weekday = intIn(body.cadenceWeekday, 0, 6);
    if (weekday === null) return fail(CADENCE_ERRORS.weekday);
    if (weekday === 0 || weekday === 6) return fail(CADENCE_ERRORS.weekend);
    return { value: { ...NULL_CADENCE, cadenceKind: kind, cadenceEvery: every, cadenceWeekday: weekday }, error: null };
  }
  const every = intIn(body.cadenceEvery, 1, MAX_EVERY_MONTHS);
  if (!every) return fail(CADENCE_ERRORS.monthEvery);
  const monthDay = intIn(body.cadenceMonthDay, 1, MONTH_END_DAY);
  if (!monthDay) return fail(CADENCE_ERRORS.monthDay);
  let monthDayTo = null;
  if (!blank(body.cadenceMonthDayTo)) {
    monthDayTo = intIn(body.cadenceMonthDayTo, monthDay + 1, MONTH_END_DAY);
    if (monthDayTo === null) return fail(CADENCE_ERRORS.monthDayTo);
  }
  return {
    value: { ...NULL_CADENCE, cadenceKind: kind, cadenceEvery: every, cadenceMonthDay: monthDay, cadenceMonthDayTo: monthDayTo },
    error: null,
  };
}

/** สองความถี่อ่านออกทั้งคู่และเท่ากัน (อ่านไม่ออกข้างใดข้างหนึ่ง = ไม่เท่า) */
export function sameCadence(a, b) {
  const x = cadenceOf(a);
  const y = cadenceOf(b);
  if (!x || !y || x.kind !== y.kind) return false;
  if (x.kind === 'days') return x.everyDays === y.everyDays;
  if (x.kind === 'weekly') return x.every === y.every && x.weekday === y.weekday;
  return x.every === y.every && x.monthDay === y.monthDay && x.monthDayTo === y.monthDayTo;
}

/** ค่าตั้งต้นของรอบใหม่ (คำตอบเจ้าของข้อ 3): "ทุกเดือน" วันที่ของวันเริ่มรอบ · ยังไม่มีวันเริ่ม = ยังไม่รู้วันที่ (null) */
export function defaultCadenceFor(startDate) {
  return { ...NULL_CADENCE, cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: dayOfMonth(startDate) };
}

// ── ตารางของรอบ ─────────────────────────────────────────────────────────────────────────────
const inHolidays = (holidays, day) => !!holidays && typeof holidays.has === 'function' && holidays.has(day);

/** วันทำการ = ไม่ใช่เสาร์–อาทิตย์ และไม่อยู่ในชุดวันหยุด · holidays = Set | Map ของ 'YYYY-MM-DD' | null (null = ดูแค่เสาร์–อาทิตย์) */
export function isWorkday(iso, holidays = null) {
  const day = day10(iso);
  const weekday = weekdayOn(day);
  return weekday !== null && weekday !== 0 && weekday !== 6 && !inHolidays(holidays, day);
}

/** ช่องของเดือนที่ index (นับเดือนต่อเนื่องจากปี y) — วันที่เกินวันสุดท้ายของเดือน = วันสุดท้ายของเดือนนั้น (ตัดรายช่อง) */
const monthSlot = (y, monthIndex, day) => {
  const year = y + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12 + 1;
  return dayText(year, month, Math.min(day, lastDayOf(year, month)));
};

/** ขอบช่วงที่ผู้เรียกส่งมา: ไม่ส่ง = null · ส่งมาแต่ไม่ใช่วัน = undefined (ผู้เรียกตอบ "ไม่มี" แทนการเดา) */
const boundOf = (value) => {
  if (blank(value)) return null;
  const day = day10(value);
  return isIsoDay(day) ? day : undefined;
};

/** ช่องของรอบ (ก่อนเลื่อนหนีวันหยุด) ที่ max(startDate, from) ≤ ช่อง ≤ min(endDate, to)
 *  ต้องมี endDate หรือ `to` อย่างน้อยหนึ่ง — รอบปลายเปิดที่ไม่บอกขอบ = [] (ไม่เดินไม่รู้จบ)
 *   days     startDate + k·everyDays
 *   weekly   วันนั้นของสัปดาห์ตัวแรกที่ ≥ startDate แล้วทุก 7·every วัน
 *   monthly  เดือนแรกที่วัน (ตัดตามเดือนแล้ว) ≥ startDate แล้วทุก every เดือน · ตัดสิ้นเดือน **รายช่อง**
 *            (ก.พ. 28 ไม่ดึง มี.ค. ลงมาเป็น 28) · ช่วงวัน ("1–5") ไม่เพิ่มช่อง — ช่องคือวันแรกของช่วง */
export function cadenceSlots(p, { from = null, to = null } = {}) {
  const cadence = cadenceOf(p);
  const startDate = day10(p?.startDate);
  const endDate = day10(p?.endDate);
  const fromDay = boundOf(from);
  const toDay = boundOf(to);
  if (!cadence || !isIsoDay(startDate) || fromDay === undefined || toDay === undefined) return [];
  if (endDate !== null && !isIsoDay(endDate)) return [];
  const lo = later(startDate, fromDay);
  const hi = earlier(endDate, toDay);
  if (!hi || hi < lo) return [];

  const out = [];
  const walk = (first, step) => {
    const skip = Math.max(0, Math.ceil(daysBetween(first, lo) / step));
    for (let k = skip; out.length < MAX_SLOTS; k += 1) {
      const slot = addDays(first, k * step);
      if (slot > hi) break;
      out.push(slot);
    }
  };
  if (cadence.kind === 'days') {
    walk(startDate, cadence.everyDays);
  } else if (cadence.kind === 'weekly') {
    walk(addDays(startDate, (cadence.weekday - weekdayOn(startDate) + 7) % 7), 7 * cadence.every);
  } else {
    const [y, m] = partsOf(startDate);
    let monthIndex = m - 1;
    if (monthSlot(y, monthIndex, cadence.monthDay) < startDate) monthIndex += 1;
    for (let k = 0; k < MAX_SLOTS; k += 1) {
      const slot = monthSlot(y, monthIndex + k * cadence.every, cadence.monthDay);
      if (slot > hi) break;
      if (slot >= lo) out.push(slot);
    }
  }
  return out;
}

/** วันนั้นเป็นช่องของรอบนี้จริงไหม (อยู่ใน startDate..endDate) — วันนัดที่เลื่อนแล้วไม่ใช่ช่อง */
export function isCadenceSlot(p, iso) {
  const day = day10(iso);
  return isIsoDay(day) && cadenceSlots(p, { from: day, to: day }).includes(day);
}

/** งวดที่นัดของช่องนั้นต้องอยู่ข้างใน
 *   weekly          สัปดาห์ อาทิตย์–เสาร์ ของช่อง (ต้นสัปดาห์จาก weekStartOf ของ datePeriods)
 *   monthly         เดือนของช่อง
 *   monthly + ช่วง  [ช่อง, min(cadenceMonthDayTo, วันสุดท้ายของเดือน)] โดยมีเดือนเป็น `fallback`
 *   days            null (ไม่มีงวด — เลื่อนไปข้างหน้าอย่างเดียว) */
export function slotPeriod(p, slot) {
  const cadence = cadenceOf(p);
  const day = day10(slot);
  if (!cadence || !isIsoDay(day)) return null;
  if (cadence.kind === 'weekly') {
    const from = weekStartOf(day);
    return { from, to: addDays(from, 6), fallback: null };
  }
  if (cadence.kind === 'monthly') {
    const [y, m] = partsOf(day);
    const last = lastDayOf(y, m);
    const month = { from: dayText(y, m, 1), to: dayText(y, m, last) };
    return cadence.monthDayTo != null
      ? { from: day, to: dayText(y, m, Math.min(cadence.monthDayTo, last)), fallback: month }
      : { ...month, fallback: null };
  }
  return null;
}

/** วันทำการแรกจาก a ถึง b (รวมหัวท้าย) ตามทิศ dir · ช่วงว่าง/ไม่มีวันทำการ = null */
const scanWorkday = (a, b, dir, holidays) => {
  if (!a || !b) return null;
  for (let day = a, guard = 0; (dir > 0 ? day <= b : day >= b) && guard < 400; day = addDays(day, dir), guard += 1) {
    if (isWorkday(day, holidays)) return day;
  }
  return null;
};
const forwardAnyway = (slot, holidays) => {
  let day = slot;
  for (let guard = 0; guard < SHIFT_GUARD && !isWorkday(day, holidays); guard += 1) day = addDays(day, 1);
  return day;
};

/** วันที่ระบบนัดให้ช่องนั้น (คำตอบเจ้าของข้อ 2)
 *   0  ช่องเป็นวันทำการ = ช่องนั้นเอง
 *   1  days: ไปข้างหน้าหาวันทำการถัดไป (ข้ามเดือนได้ — กติกาเดิม ไม่เปลี่ยน)
 *   2  ตามปฏิทิน: ไปข้างหน้าในงวด ไม่เกิน endDate
 *   3  ไม่ได้ → ถอยหลังในงวด ไม่ก่อน startDate
 *   4  ช่วงวันเท่านั้น: ที่เหลือของเดือนไปข้างหน้า (≤ endDate) แล้วค่อยถอยไปก่อนช่วง (≥ ต้นเดือน, ≥ startDate)
 *   5  ไม่มีที่ลงเลย: ไปข้างหน้าอยู่ดี (ยาม 14 วัน) — เช่นรอบที่เริ่มวันเสาร์สิ้นเดือน */
export function plannedDateOfSlot(p, slot, holidays = null) {
  const cadence = cadenceOf(p);
  const day = day10(slot);
  if (!cadence || !isIsoDay(day)) return null;
  if (isWorkday(day, holidays)) return day;
  if (cadence.kind === 'days') return forwardAnyway(day, holidays);

  const startDate = boundOf(p.startDate) || null;
  const endDate = boundOf(p.endDate) || null;
  const period = slotPeriod(p, day);
  let hit = scanWorkday(addDays(day, 1), earlier(period.to, endDate), 1, holidays)
    || scanWorkday(addDays(day, -1), later(period.from, startDate), -1, holidays);
  if (!hit && period.fallback) {
    hit = scanWorkday(addDays(period.to, 1), earlier(period.fallback.to, endDate), 1, holidays)
      || scanWorkday(addDays(day, -1), later(period.fallback.from, startDate), -1, holidays);
  }
  return hit || forwardAnyway(day, holidays);
}

/** เหตุที่ช่องนั้นไม่ใช่วันทำการ — 'sun' | 'sat' | 'holiday' | null (เป็นวันทำการ) */
export function shiftReason(slot, holidays = null) {
  const day = day10(slot);
  const weekday = weekdayOn(day);
  if (weekday === null) return null;
  if (weekday === 0) return 'sun';
  if (weekday === 6) return 'sat';
  return inHolidays(holidays, day) ? 'holiday' : null;
}

/** นัดตามรอบที่ **วันนัด** อยู่ใน [from, to] → `[{ slot, date, reason }]` เรียงตามวันนัด
 *  from ไม่ส่ง = วันเริ่มรอบ · ไม่มี to = [] · มองช่องเผื่อหน้า–หลัง 31 วัน (การเลื่อนไม่เคยไกลกว่าหนึ่งเดือน) */
export function plannedVisits(p, { from = null, to = null, holidays = null } = {}) {
  const startDate = day10(p?.startDate);
  const toDay = day10(to);
  if (!cadenceOf(p) || !isIsoDay(startDate) || !isIsoDay(toDay)) return [];
  const fromDay = day10(from);
  const lo = isIsoDay(fromDay) ? fromDay : startDate;
  return cadenceSlots(p, { from: addDays(lo, -31), to: addDays(toDay, 31) })
    .map((slot) => ({ slot, date: plannedDateOfSlot(p, slot, holidays), reason: shiftReason(slot, holidays) }))
    .filter((visit) => visit.date >= lo && visit.date <= toDay)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0)));
}

const intervalDays = (cadence) => (
  cadence.kind === 'monthly' ? cadence.every * 31 : cadence.kind === 'weekly' ? cadence.every * 7 : cadence.everyDays
);

/** นัดตามรอบตัวแรกที่วันนัด > afterIso (และช่อง > afterSlot เมื่อใบที่เพิ่งปิดจำช่องของตัวเองไว้
 *  — ไม่งั้นนัดของช่อง 22 พ.ย. ที่ถูกย้ายมาทำ 10 พ.ย. จะถูกเสนอ "รอบถัดไป 23 พ.ย." ซึ่งคือช่องของมันเอง) */
export function nextPlannedAfter(p, afterIso, holidays = null, { afterSlot = null } = {}) {
  const cadence = cadenceOf(p);
  const after = day10(afterIso);
  if (!cadence || !isIsoDay(after)) return null;
  const from = addDays(after, 1);
  const heldSlot = day10(afterSlot);
  return plannedVisits(p, { from, to: addDays(from, intervalDays(cadence) * 2 + 62), holidays })
    .find((visit) => !heldSlot || visit.slot > heldSlot) || null;
}

/** จำนวนช่องใน [startDate, endDate] · null = บอกไม่ได้ (ไม่มีวันสิ้นสุด · วันผิด · วันกลับด้าน · ความถี่อ่านไม่ออก)
 *  ⚠️ ไม่มีวันสิ้นสุด = null ไม่ใช่เดาว่าหนึ่งปี (กติกาเดิมของ estimateVisitCount)
 *  days = floor(ช่วง ÷ everyDays) + 1 เท่าเดิมเป๊ะ (เริ่ม 1 ม.ค. จบ 31 ธ.ค. ทุก 30 วัน = 13) */
export function countSlots(p) {
  const cadence = cadenceOf(p);
  const startDate = day10(p?.startDate);
  const endDate = day10(p?.endDate);
  if (!cadence || !isIsoDay(startDate) || !isIsoDay(endDate) || endDate < startDate) return null;
  if (cadence.kind === 'days') return Math.floor(daysBetween(startDate, endDate) / cadence.everyDays) + 1;
  return cadenceSlots(p).length;
}

/** ระบบสร้างนัดล่วงหน้ากี่วัน — days 90 (เท่าเดิม) · ตามปฏิทิน = อย่างน้อยหนึ่งงวดเต็ม + 7 วัน
 *  (รอบทุก 3 เดือนที่มองแค่ 90 วัน อาจไม่มีนัดข้างหน้าเลย แล้วไปขึ้น "ครบรอบยังไม่มีนัด" ทั้งที่ยังไม่ถึงกำหนด) */
export function horizonDaysFor(p) {
  const cadence = cadenceOf(p);
  if (!cadence || cadence.kind === 'days') return DEFAULT_HORIZON_DAYS;
  if (cadence.kind === 'monthly') return Math.max(DEFAULT_HORIZON_DAYS, Math.min(cadence.every * 31, 365) + 7);
  return Math.max(DEFAULT_HORIZON_DAYS, cadence.every * 7 + 7);
}

/** วันนัดสุดท้ายที่ตัวเติมนัดสร้างให้ เมื่อเติม ณ วัน `fromIso` (ปกติ = วันนี้) — ตัวเดียวทั้ง `ensureVisits` และ "นัดถัดไป" ของโมดัล
 *   days         fromIso + ระยะเติมนัด (เท่าเดิมทุกกรณี)
 *   ตามปฏิทิน    max(fromIso, วันเริ่มรอบ) + ระยะเติมนัด — รอบที่ **ยังไม่เริ่ม** ต้องได้นัดแรกตั้งแต่วันที่ตั้งรอบ
 *                (นับจากวันนี้อย่างเดียว รอบที่เริ่มอีก 4 เดือนได้นัดศูนย์ใบ แล้วไปขึ้น "ครบรอบยังไม่มีนัด" ทั้งที่ยังไม่ถึงกำหนด)
 *  `horizonDays` ไม่ส่ง = `horizonDaysFor(p)` · fromIso ไม่ใช่วัน = null */
export function horizonEndFor(p, fromIso, horizonDays = null) {
  const from = day10(fromIso);
  if (!isIsoDay(from)) return null;
  const cadence = cadenceOf(p);
  const start = day10(p?.startDate);
  const anchor = cadence && cadence.kind !== 'days' && isIsoDay(start) && start > from ? start : from;
  return addDays(anchor, horizonDays ?? horizonDaysFor(p));
}

// ── ข้อเสนอความถี่จากจำนวนรอบบริการ ──────────────────────────────────────────────────────────
/** "จำนวนรอบบริการ n รอบ ⇒ ทุกกี่วัน" (PR-C · C-D7) — ย้ายมาจาก rounds.js พฤติกรรมเท่าเดิม (rounds.js re-export)
 *  สูตร: รอบ ≥ 2 → floor(ช่วง ÷ (รอบ − 1)) · รอบเดียว → ช่วง + 1 · ตัดที่ 1–365 แล้วบอก `clamped`
 *  ไม่มีวัน · รอบไม่ใช่จำนวนเต็มบวก · วันกลับด้าน = null (ไม่เดา) */
export function suggestEveryDays({ startDate, endDate, rounds } = {}) {
  if (!Number.isInteger(rounds) || rounds < 1) return null;
  const start = day10(startDate);
  const end = day10(endDate);
  if (!isIsoDay(start) || !isIsoDay(end)) return null;
  const span = daysBetween(start, end);
  if (span < 0) return null;
  const raw = rounds === 1 ? span + 1 : Math.floor(span / (rounds - 1));
  const everyDays = Math.min(MAX_EVERY_DAYS, Math.max(1, raw));
  return { everyDays, visits: Math.floor(span / everyDays) + 1, clamped: everyDays !== raw };
}

/** ความถี่ตัวแรกที่ได้นัด **เท่าจำนวนรอบบริการพอดี** (คำตอบเจ้าของข้อ 3 — ชิปของแถว "รอตั้งรอบ")
 *   1  ทุก 1·2·3·4·6·12 เดือน วันที่ของวันเริ่มรอบ
 *   2  ทุก 1·2 สัปดาห์ วันจันทร์–ศุกร์ ไล่จากวันในสัปดาห์ของวันเริ่ม (เริ่มเสาร์–อาทิตย์ = ไล่จากจันทร์)
 *      — 26 รอบใน 52 สัปดาห์ที่เริ่มวันพฤหัสฯ: ยึดพฤหัสฯ ได้ 27 ⇒ ตัวค้นเลือกวันศุกร์ที่ได้ 26 พอดี
 *   3  ไม่มีตัวไหนพอดี → suggestEveryDays (`exact` = ได้เท่าจำนวนรอบไหม)
 *  คืนหกช่อง + `{ visits, exact, clamped }` · ข้อมูลไม่พอ = null */
export function suggestCadence({ startDate, endDate, rounds } = {}) {
  const start = day10(startDate);
  const end = day10(endDate);
  if (!Number.isInteger(rounds) || rounds < 1 || !isIsoDay(start) || !isIsoDay(end) || end < start) return null;
  const range = { startDate: start, endDate: end };
  const exactly = (cadence) => (countSlots({ ...cadence, ...range }) === rounds
    ? { ...cadence, visits: rounds, exact: true, clamped: false }
    : null);

  for (const every of CADENCE_EVERY_MONTHS) {
    const hit = exactly({ ...NULL_CADENCE, cadenceKind: 'monthly', cadenceEvery: every, cadenceMonthDay: dayOfMonth(start) });
    if (hit) return hit;
  }
  const workdays = [1, 2, 3, 4, 5];
  const first = Math.max(0, workdays.indexOf(weekdayOn(start)));
  for (const every of CADENCE_EVERY_WEEKS) {
    for (let i = 0; i < workdays.length; i += 1) {
      const weekday = workdays[(first + i) % workdays.length];
      const hit = exactly({ ...NULL_CADENCE, cadenceKind: 'weekly', cadenceEvery: every, cadenceWeekday: weekday });
      if (hit) return hit;
    }
  }
  const days = suggestEveryDays({ startDate: start, endDate: end, rounds });
  return days
    ? { ...NULL_CADENCE, cadenceKind: 'days', everyDays: days.everyDays, visits: days.visits, exact: days.visits === rounds, clamped: days.clamped }
    : null;
}

// ── คำบอกความถี่ ───────────────────────────────────────────────────────────────────────────
const dayWord = (day) => (day === MONTH_END_DAY ? 'สิ้นเดือน' : String(day));

/** "ทุก 30 วัน" · "ทุกสัปดาห์ วันพุธ" · "ทุก 2 สัปดาห์ วันศุกร์" · "ทุกเดือน วันที่ 22" · "ทุก 3 เดือน วันที่ 22"
 *  · "ทุกเดือน สิ้นเดือน" · "ทุกเดือน วันที่ 1–5" · "ทุกเดือน วันที่ 25–สิ้นเดือน" · อ่านไม่ออก = "—"
 *  ⭐ ที่เดียวของระบบที่ประกอบคำว่า "ทุก … วัน" จาก everyDays — จอ/ข้อความ audit ทุกจุดเรียกตัวนี้ */
export function cadenceText(p) {
  const cadence = cadenceOf(p);
  if (!cadence) return '—';
  if (cadence.kind === 'days') return `ทุก ${cadence.everyDays} วัน`;
  if (cadence.kind === 'weekly') {
    return `${cadence.every === 1 ? 'ทุกสัปดาห์' : `ทุก ${cadence.every} สัปดาห์`} วัน${WEEKDAY_NAMES[cadence.weekday]}`;
  }
  const head = cadence.every === 1 ? 'ทุกเดือน' : `ทุก ${cadence.every} เดือน`;
  if (cadence.monthDayTo != null) return `${head} วันที่ ${cadence.monthDay}–${dayWord(cadence.monthDayTo)}`;
  return cadence.monthDay === MONTH_END_DAY ? `${head} สิ้นเดือน` : `${head} วันที่ ${cadence.monthDay}`;
}

/** ประโยคบอกว่าตกวันหยุดแล้วนัดไปลงที่ไหน (บรรทัดสรุปของโมดัล) · อ่านไม่ออก = '' */
export function cadenceShiftText(p) {
  const cadence = cadenceOf(p);
  if (!cadence) return '';
  if (cadence.kind === 'days') return 'ตกวันหยุดเลื่อนไปวันทำการถัดไป';
  if (cadence.kind === 'weekly') return 'ตกวันหยุดเลื่อนไปวันทำการในสัปดาห์เดียวกัน';
  return cadence.monthDayTo != null ? 'นัดวันทำการแรกของช่วง' : 'ตกวันหยุดเลื่อนไปวันทำการในเดือนเดียวกัน';
}

// ── วันหยุดครอบถึงปีไหน ─────────────────────────────────────────────────────────────────────
/** ปีใน [fromIso, toIso] ที่ **ไม่มีวันหยุดสักแถว** ในชุดที่ส่งมา (Set | Map)
 *  ⚠️ ชุดว่าง = [] — ยังโหลดไม่เสร็จ/ยังไม่ได้ตั้งตาราง ไม่ใช่ "ปีนั้นไม่มีวันหยุด" · ช่วงผิด = [] */
export function yearsWithoutHolidays(holidays, fromIso, toIso) {
  const dates = holidays && typeof holidays.keys === 'function' ? [...holidays.keys()] : [];
  const from = day10(fromIso);
  const to = day10(toIso);
  if (!dates.length || !isIsoDay(from) || !isIsoDay(to) || to < from) return [];
  const have = new Set(dates.map((date) => String(date).slice(0, 4)));
  const out = [];
  for (let year = partsOf(from)[0]; year <= partsOf(to)[0]; year += 1) {
    if (!have.has(String(year))) out.push(year);
  }
  return out;
}

/** คำเตือนไม่บล็อก — ปี ค.ศ. ตามกติกาของระบบ (lib/format) หัวประโยคเดียวกับหน้า ตั้งค่า → วันหยุด · ไม่มีปีขาด = null */
export function holidayGapText(years) {
  return Array.isArray(years) && years.length
    ? `ยังไม่มีวันหยุดปี ${years.join(' · ')} ในระบบ — นัดของปีนั้นเลื่อนหนีเฉพาะเสาร์–อาทิตย์ · เพิ่มวันหยุดที่ ตั้งค่า → วันหยุด ก่อนถึงรอบสร้างนัด`
    : null;
}
