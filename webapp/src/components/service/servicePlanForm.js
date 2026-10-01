// ── สถานะฟอร์มของโมดัลรอบบริการ (mig 0397 · ความถี่ตามปฏิทิน) — logic ล้วน ไม่มี JSX ────────────────
//
// โมดัล (`ServicePlanModal.js`) เป็น JSX ที่ node รันตรงไม่ได้ ⇒ ทุกอย่างที่ "ตัดสิน" อยู่ที่นี่และมีเทสต์ของตัวเอง
// (`servicePlanForm.test.mjs`): ค่าเริ่ม · โหลดรอบเดิม · หกช่องความถี่ที่ส่ง API · แตะตารางวัน · ปุ่ม "ใช้" ของชิป ·
// บรรทัดสรุป/นัดถัดไป/ปีที่ยังไม่มีวันหยุด · ข้อความหลังบันทึก · อ่านคำตอบ 409 ของการเปลี่ยนรอบ
//
// ⭐ คำตอบเจ้าของข้อ 3 (29/09): รอบใหม่เริ่มที่ **"ทุกเดือน" วันที่ของวันเริ่มรอบ** — `monthDay: null` ในฟอร์มแปลว่า
//    "ตามวันเริ่มรอบ" (TS เปลี่ยนวันเริ่ม วันที่ของรอบขยับตาม) จนกว่าจะแตะวันในตารางเอง · รายสัปดาห์ก็เหมือนกัน
//    (`weekday: null` = วันในสัปดาห์ของวันเริ่ม · เริ่มเสาร์–อาทิตย์/ยังไม่มีวันเริ่ม = วันจันทร์)
//    ⚠️ ข้อยกเว้นของ docs/form-design-rules.md §2 "ไม่มีค่าตั้งต้นให้การตัดสินใจ" ที่เจ้าของสั่งเอง — บันทึกไว้ในเอกสารแล้ว
// ⭐ "ทุก N วัน" **ไม่มีค่าเริ่ม** (ช่องว่างจนกว่าจะพิมพ์) — 30 เงียบ ๆ ของเดิมคือที่มาของ 13 นัดต่อปี
//
// 🔴 ไฟล์นี้ import ได้แค่ `lib/service/cadence` · `lib/datePeriods` · `lib/businessDate` · `lib/format`
//    (ห้ามดึง rounds.js / intakePlanFacts.js / intake.js / planGen.js — ยามอยู่ในเทสต์ของไฟล์นี้)
import { addDays, dayOfWeek } from '@/lib/datePeriods';
import { businessDate } from '@/lib/businessDate';
import { fmtDayMonth, fmtDayMonthYear, fmtNumber } from '@/lib/format';
import {
  CADENCE_EVERY_MONTHS, CADENCE_EVERY_WEEKS, CADENCE_KINDS, CADENCE_TEXT, MONTH_END_DAY, WEEKDAY_NAMES,
  cadenceOf, cadenceShiftText, cadenceText, countSlots, dayOfMonth, holidayGapText, horizonDaysFor, horizonEndFor, isIsoDay,
  normalizeCadence, plannedVisits, yearsWithoutHolidays,
} from '@/lib/service/cadence';

/** รหัสของคำตอบ 409 ที่ PATCH รอบตอบเมื่อมีนัดตามรอบเดิมรอคำยืนยัน (ตรงกับ plans/[id]/route.js) */
export const PLAN_SCHEDULE_CONFIRM = 'plan_schedule_confirm';
const MONDAY = 1;
const NEXT_VISITS_SHOWN = 3;

/* ช่องของรอบ (ตรงคอลัมน์) + ร่างความถี่ของฟอร์ม (ชื่อช่องของจอ — ไม่ใช่คอลัมน์ · `planFormCadence` แปลงเป็นหกช่องตอนส่ง)
   ร่างเก็บแยกรายชนิด ⇒ สลับแผ่นไปมาแล้วค่าที่เลือกไว้ของชนิดก่อนหน้าไม่หาย
   `rangeAnchored` = ในโหมดช่วงวัน คน **แตะวันแรกของช่วงเองแล้ว** หรือยัง (false = วันที่ค้างมาจากโหมดวันเดียว/วันเริ่มรอบ
   ยังไม่ใช่วันแรกของช่วง — การแตะครั้งแรกต้องเป็นวันแรกเสมอ ตามที่คำบอกใต้ตารางบอกไว้) */
export const EMPTY_PLAN_FORM = Object.freeze({
  kind: 'refill', startDate: '', endDate: '',
  assigneeId: '', assigneeName: '', isActive: true, note: '',
  salesOrderId: '',
  cadenceKind: 'monthly',
  monthEvery: 1, dayMode: 'single', monthDay: null, monthDayTo: null, rangeAnchored: false,
  weekEvery: 1, weekday: null,
  everyDays: '',
});

const blank = (value) => value === null || value === undefined || value === '';
const dayText = (value) => (blank(value) ? '' : String(value).slice(0, 10));

/** ร่างความถี่จากของที่ "หน้าตาเหมือนรอบ" (แถว service_plans · ข้อเสนอของชิป) · อ่านไม่ออก = null */
function draftOfCadence(source) {
  const cadence = cadenceOf(source);
  if (!cadence) return null;
  if (cadence.kind === 'monthly') {
    return {
      cadenceKind: 'monthly', monthEvery: cadence.every, monthDay: cadence.monthDay, monthDayTo: cadence.monthDayTo,
      dayMode: cadence.monthDayTo != null ? 'range' : 'single',
      rangeAnchored: cadence.monthDayTo != null,     // ช่วงที่บันทึกไว้แล้ว = วันแรกเป็นของจริง
    };
  }
  if (cadence.kind === 'weekly') return { cadenceKind: 'weekly', weekEvery: cadence.every, weekday: cadence.weekday };
  return { cadenceKind: 'days', everyDays: cadence.everyDays };
}

/** โหมดแก้: ฟอร์มจากรอบเดิม — แถวก่อน mig 0397 (ไม่มี `cadenceKind` แต่มี `everyDays`) = ชนิด days
 *  ⚠️ ความถี่ที่อ่านไม่ออก (ไม่ควรมี — CHECK ในฐานกันไว้) เปิดเป็นชนิดเดิมของแถวด้วยค่าว่าง ให้คนเลือกใหม่ ไม่เดาให้ */
export function planFormFromPlan(plan) {
  const source = plan || {};
  return {
    ...EMPTY_PLAN_FORM,
    kind: source.kind || EMPTY_PLAN_FORM.kind,
    startDate: source.startDate || '',
    endDate: source.endDate || '',
    assigneeId: source.assigneeId || '',
    assigneeName: source.assigneeName || '',
    isActive: source.isActive !== false,
    note: source.note || '',
    salesOrderId: source.salesOrderId || '',
    ...(draftOfCadence(source) || {
      cadenceKind: CADENCE_KINDS.includes(source.cadenceKind) ? source.cadenceKind : 'days',
      everyDays: source.everyDays ?? '',
    }),
  };
}

/** ช่องของรอบที่ไม่ใช่ความถี่ — payload ไม่พกช่องร่างของจอ (`dayMode` · `monthEvery` …) ไปด้วย */
export function planFormFields(form) {
  return {
    kind: form.kind,
    startDate: form.startDate,
    endDate: form.endDate,
    assigneeId: form.assigneeId,
    assigneeName: form.assigneeName,
    isActive: form.isActive,
    note: form.note,
  };
}

/** เสาร์–อาทิตย์ — รอบรายสัปดาห์ตั้งไม่ได้ (ตัวตรวจของ API ตีกลับด้วยข้อความเดียวกัน) */
export const isWeekendDay = (weekday) => weekday === 0 || weekday === 6;

/** วันที่ของเดือนที่ฟอร์มใช้อยู่ — ที่แตะเลือกไว้ หรือวันที่ของวันเริ่มรอบ · ยังไม่มีทั้งคู่ = null */
export function planFormMonthDay(form) {
  return form?.monthDay ?? dayOfMonth(dayText(form?.startDate));
}

/** วันในสัปดาห์ที่ฟอร์มใช้อยู่ (0 = อาทิตย์) — ที่เลือกไว้ หรือวันของวันเริ่มรอบ · เริ่มเสาร์–อาทิตย์/ไม่มีวันเริ่ม = จันทร์ */
export function planFormWeekday(form) {
  if (!blank(form?.weekday)) return form.weekday;
  const start = dayText(form?.startDate);
  const weekday = isIsoDay(start) ? dayOfWeek(start) : null;
  return weekday === null || isWeekendDay(weekday) ? MONDAY : weekday;
}

/** หกช่องความถี่ที่ส่ง API (ครบหกคีย์เสมอ ช่องที่ชนิดนั้นไม่ใช้ = null) — "ตามวันเริ่มรอบ" ถูกแปลงเป็นค่าจริงที่นี่
 *  ⚠️ ไม่ตรวจค่า — ตัวตรวจคือ `normalizePlanInput` → `normalizeCadence` ตัวเดียวกับ API */
export function planFormCadence(form) {
  const none = {
    cadenceKind: form?.cadenceKind || null, everyDays: null, cadenceEvery: null, cadenceWeekday: null,
    cadenceMonthDay: null, cadenceMonthDayTo: null,
  };
  if (form?.cadenceKind === 'monthly') {
    return {
      ...none,
      cadenceEvery: form.monthEvery,
      cadenceMonthDay: planFormMonthDay(form),
      cadenceMonthDayTo: form.dayMode === 'range' ? (form.monthDayTo ?? null) : null,
    };
  }
  if (form?.cadenceKind === 'weekly') {
    return { ...none, cadenceEvery: form.weekEvery, cadenceWeekday: planFormWeekday(form) };
  }
  if (form?.cadenceKind === 'days') {
    return { ...none, everyDays: blank(form.everyDays) ? null : Number(form.everyDays) };
  }
  return none;
}

/** สิ่งที่ตัวตรวจของ API มองไม่เห็นเพราะเป็นสถานะของจอ — โหมด "ช่วงวัน" ที่ยังไม่ได้แตะวันสุดท้าย
 *  (ส่งไปทั้งอย่างนั้น = บันทึกเป็นวันเดียวเงียบ ๆ) · ยังไม่ได้แตะวันแรกด้วย = บอกให้เลือกทั้งสองวัน · ไม่ติด = null */
export function planFormBlocker(form) {
  if (form?.cadenceKind !== 'monthly' || form.dayMode !== 'range' || !blank(form.monthDayTo)) return null;
  return form.rangeAnchored ? CADENCE_TEXT.rangePending : CADENCE_TEXT.rangeUnset;
}

/** สลับ "วันเดียว / ช่วงวัน" — วันที่เลือกไว้คงเดิม (ยังตามวันเริ่มรอบถ้ายังไม่เคยแตะ) · ช่วงเริ่มใหม่ (ยังไม่มีวันแรก–วันสุดท้าย)
 *  ⚠️ แตะชิปของโหมดที่เลือกอยู่แล้ว = ไม่เกิดอะไร (ChoiceChips ส่ง onChange ให้ชิปที่ติดอยู่ด้วย — เดิมล้างวันสุดท้ายของ
 *     ช่วงที่บันทึกไว้ทิ้ง แล้วบันทึกไม่ได้จนกว่าจะแตะใหม่) */
export function setDayMode(form, mode) {
  const next = mode === 'range' ? 'range' : 'single';
  if (next === form?.dayMode) return form;
  return { ...form, dayMode: next, monthDayTo: null, rangeAnchored: false };
}

/** แตะวันในโหมดวันเดียว */
export function pickSingleDay(form, day) {
  return { ...form, monthDay: day, monthDayTo: null, rangeAnchored: false };
}

/** แตะวันในโหมดช่วงวัน — "แตะวันแรกของช่วง แล้วแตะวันสุดท้าย" ตามคำบอกใต้ตาราง
 *   · ยังไม่ได้แตะวันแรกเอง (`rangeAnchored` false) → วันนั้นเป็น **วันแรก** เสมอ — วันที่ค้างมาจากโหมดวันเดียว/วันเริ่มรอบ
 *     ไม่ใช่วันแรกของช่วง (เดิมถือว่าใช่: วันเริ่ม 1 พ.ย. อยากได้ 3–7 แตะ 3 แล้วได้ "1–3" ที่บันทึกได้ทั้งที่ผิด)
 *   · มีวันแรกแล้ว แตะวันหลังวันแรก → เป็นวันสุดท้าย
 *   · ช่วงครบแล้ว / แตะวันที่ไม่เกินวันแรก → เริ่มช่วงใหม่ที่วันนั้น */
export function pickRangeDay(form, day) {
  const start = form.rangeAnchored ? form.monthDay : null;
  if (start == null || !blank(form.monthDayTo) || day <= start) {
    return { ...form, monthDay: day, monthDayTo: null, rangeAnchored: true };
  }
  return { ...form, monthDayTo: day };
}

/** วันที่ติดสีในตารางของโหมดช่วงวัน — วันแรกถึงวันสุดท้าย (ยังไม่มีวันสุดท้าย = วันแรกวันเดียว · ยังไม่ได้แตะวันแรก = ว่าง) */
export function rangeDays(form) {
  const start = form?.rangeAnchored ? form.monthDay : null;
  if (start == null) return [];
  const end = blank(form.monthDayTo) ? start : Math.min(form.monthDayTo, MONTH_END_DAY);
  const days = [];
  for (let day = start; day <= end; day += 1) days.push(day);
  return days;
}

/** ปุ่ม "ใช้" ของชิปจำนวนรอบบริการ — เขียนความถี่ทั้งก้อน (ชนิด + ทุกกี่ + วัน) ไม่ใช่แค่ตัวเลข · ข้อเสนออ่านไม่ออก = ไม่แตะ */
export function applySuggestion(form, suggestion) {
  const draft = draftOfCadence(suggestion);
  return draft ? { ...form, ...draft } : form;
}

const withOwn = (list, own) => (Number.isInteger(own) && own >= 1 && !list.includes(own) ? [...list, own].sort((a, b) => a - b) : list);

/** ชิป "ทุก n เดือน" — ชุดกลาง + ค่าของรอบเองเมื่ออยู่นอกชุด (รอบที่ตั้งผ่าน API ด้วยค่าอื่นต้องยังมีชิปให้ติด) */
export function everyMonthOptions(form) {
  return withOwn(CADENCE_EVERY_MONTHS, form?.monthEvery).map((n) => ({ value: n, label: CADENCE_TEXT.monthsUnit(n) }));
}

/** ชิป "ทุก n สัปดาห์" */
export function everyWeekOptions(form) {
  return withOwn(CADENCE_EVERY_WEEKS, form?.weekEvery).map((n) => ({ value: n, label: CADENCE_TEXT.weeksUnit(n) }));
}

/** วันที่เลือกอยู่นอกวันที่ไซต์เปิดให้เข้าไหม — เตือน ไม่บล็อก (ลูกค้าอนุโลมเป็นครั้ง ๆ ได้ · กติกาเดียวกับ accessConflict)
 *  ไซต์ที่ไม่ได้จำกัดวัน (ลิสต์ว่าง) = ไม่มีอะไรให้เตือน · ลิสต์ครบเจ็ดวัน = วันไหนก็อยู่ในลิสต์อยู่แล้ว */
export function weekdayOffAccess(form, accessDays) {
  if (form?.cadenceKind !== 'weekly' || !Array.isArray(accessDays)) return false;
  const days = accessDays.map(Number);
  return days.length > 0 && !days.includes(planFormWeekday(form));
}

/** คำเตือนใต้ชิปวันของรอบรายสัปดาห์ — บอก **วันที่ไซต์ให้เข้า** และ **วันที่เลือก** ด้วยชื่อ (ไม่ใช่ "วันนี้" ที่อ่านเป็น today)
 *  `labels` = ป้ายย่อของวันตามดัชนี 0 = อาทิตย์ (ผู้เรียกส่ง `WEEKDAY_LABELS` ของ lib/service/sites — ไฟล์นี้ import ไม่ได้)
 *  เรียงอาทิตย์ → เสาร์ · ไม่มีอะไรให้เตือน = null */
export function accessWarningText(form, accessDays, labels = []) {
  if (!weekdayOffAccess(form, accessDays)) return null;
  const allowed = [...new Set(accessDays.map(Number))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)
    .map((day) => labels[day] ?? WEEKDAY_NAMES[day])
    .join(' ');
  return CADENCE_TEXT.accessWarning(allowed, WEEKDAY_NAMES[planFormWeekday(form)]);
}

/* "23 พ.ย. (22 ตรงวันอาทิตย์)" — วงเล็บมีเฉพาะนัดที่เลื่อนจากช่องของรอบ: รายเดือนบอกเลขวันที่ของช่อง ·
   รายสัปดาห์/ทุก N วัน บอกวันที่ย่อของช่อง
   นัดที่ไม่ได้อยู่ในปีนี้มีเลขปีต่อท้าย ("22 ม.ค. 27") — รอบทุก 12 เดือนที่พิมพ์ "2 พ.ย. · 29 ต.ค." อ่านแล้วเหมือนถอยหลัง */
function nextVisitLabel(visit, monthly, todayIso) {
  const sameYear = dayText(visit.date).slice(0, 4) === dayText(todayIso).slice(0, 4);
  const date = sameYear ? fmtDayMonth(visit.date) : fmtDayMonthYear(visit.date, { locale: 'th' });
  if (!visit.reason) return date;
  const slot = monthly ? String(dayOfMonth(visit.slot)) : fmtDayMonth(visit.slot);
  return `${date} (${slot} ${CADENCE_TEXT.shiftReason[visit.reason]})`;
}

/** ปีในช่วงที่รอบยังสร้างนัดได้ซึ่งยังไม่มีวันหยุดในระบบ — กติกาเดียวกับ `planHolidayGapYears` ของ server (planGen.js):
 *  ช่วง = [max(วันนี้, วันเริ่มรอบ), วันสิ้นสุดรอบ] · รอบปลายเปิด = ถึงวันนัดสุดท้ายที่ตัวเติมนัดสร้างให้วันนี้ · ชุดวันหยุดว่าง = [] */
export function planGapYears(plan, holidays, todayIso = businessDate()) {
  const today = dayText(todayIso);
  const start = dayText(plan?.startDate) || today;
  const from = start > today ? start : today;
  const to = dayText(plan?.endDate) || horizonEndFor(plan, today);
  return yearsWithoutHolidays(holidays, from, to);
}

/** ทุกอย่างที่บรรทัดสรุปของโมดัลแสดง — คิดจากฟอร์มตอนนี้ (ยังไม่บันทึก)
 *   text / shiftText   "ทุกเดือน วันที่ 22" · "ตกวันหยุดเลื่อนไปวันทำการในเดือนเดียวกัน" (อ่านไม่ออก/ช่วงยังไม่ครบ = null)
 *   estimate           จำนวนนัดในช่วงเริ่ม–สิ้นสุด (ไม่มีวันสิ้นสุด/วันผิด = null — ไม่เดาว่าหนึ่งปี)
 *   next / nextText    สามนัดแรกจาก max(วันนี้, วันเริ่ม) ภายในระยะเติมนัด (ไม่มีวันเริ่ม = ว่าง)
 *   horizonDays        ระบบสร้างนัดล่วงหน้ากี่วัน (90 · รอบหลายเดือน = หนึ่งงวด + 7)
 *   gapYears           ปีที่ยังไม่มีวันหยุดในระบบ (วันหยุดยังโหลดไม่เสร็จ = [])
 *  `holidays` = Map/Set ของ 'YYYY-MM-DD' จาก `useHolidayMap()` — ตารางเดียวกับที่ server ใช้ตอนสร้างนัด */
export function planSummary(form, { todayIso = businessDate(), holidays = null } = {}) {
  const cadence = planFormCadence(form);
  const pending = planFormBlocker(form);
  /* ⚠️ "อ่านออก" = **ผ่านตัวตรวจตัวเดียวกับตอนบันทึก** (`normalizeCadence`) ไม่ใช่ตัวอ่านแบบผ่อนของ cadenceOf —
     พิมพ์ 400 / 1.5 ลงช่อง "ทุก N วัน" แล้วบรรทัดสรุปบอก "ทุก 400 วัน · ได้ 1 นัด ตรงกับจำนวนรอบบริการ" ทั้งที่บันทึกไม่ได้ */
  const readable = !pending && !normalizeCadence(cadence).error;
  const startDate = dayText(form?.startDate);
  const endDate = dayText(form?.endDate);
  const plan = { ...cadence, startDate: startDate || null, endDate: endDate || null };
  const horizonDays = horizonDaysFor(readable ? cadence : null);
  let next = [];
  if (readable && isIsoDay(startDate)) {
    /* ช่วงเดียวกับที่ server สร้างนัดให้ตอนบันทึก (`horizonEndFor` — ตัวเดียวกับ ensureVisits): โชว์เฉพาะนัดที่จะถูกสร้างจริง
       รอบทุก N วันที่เริ่มไกลกว่าระยะเติมนัด = ยังไม่มีนัดให้โชว์ (server ก็ยังไม่สร้าง) */
    const today = dayText(todayIso);
    const from = startDate > today ? startDate : today;
    next = plannedVisits(plan, { from, to: horizonEndFor(plan, today, horizonDays), holidays }).slice(0, NEXT_VISITS_SHOWN);
  }
  const monthly = cadence.cadenceKind === 'monthly';
  return {
    cadence,
    readable,
    pending,
    text: readable ? cadenceText(cadence) : null,
    shiftText: readable ? cadenceShiftText(cadence) : null,
    estimate: readable ? countSlots(plan) : null,
    needEndDate: readable && !endDate,
    horizonDays,
    next,
    nextText: next.map((visit) => nextVisitLabel(visit, monthly, todayIso)).join(' · '),
    gapYears: readable && isIsoDay(startDate) ? planGapYears(plan, holidays, todayIso) : [],
  };
}

/** คำตอบ 409 "มีนัดตามรอบเดิมรอคำยืนยัน" ของ PATCH รอบ → `{ preview, message }` · error อื่น = null
 *  ⚠️ ต้องเป็น `ApiError` ของ apiJson (พก `status` + `data`) — จอที่ยังใช้ apiFetch ดิบจะได้แค่ข้อความ ไม่มีรายการให้ยืนยัน */
export function scheduleConfirmOf(error) {
  const data = error?.data;
  if (error?.status !== 409 || data?.code !== PLAN_SCHEDULE_CONFIRM || !Array.isArray(data?.preview?.cancel)) return null;
  return { preview: data.preview, message: data.error || error.message || null };
}

/** บรรทัด "คงนัดเดิม n นัดไว้ตามรอบใหม่" ของกล่องยืนยัน — นัดที่ยังไม่ได้เข้าซึ่งอยู่ต่อ (ไม่อยู่ในรายการยกเลิก) · ไม่มี = null */
export function staysLineOf(preview) {
  const count = Number(preview?.reslot) || 0;
  return CADENCE_TEXT.confirm.stays(count ? fmtNumber(count) : 0);
}

/** id ของนัดที่ผู้ใช้เห็นในรายการแล้วกดยืนยัน — ส่งกลับเป็น `cancelVisitIds` พร้อม payload เดิม */
export function cancelVisitIdsOf(preview) {
  return (Array.isArray(preview?.cancel) ? preview.cancel : []).map((visit) => visit.id);
}

/** จำนวนนัดที่ไม่ถูกแตะ ในรูปที่ `CADENCE_TEXT.confirm.kept` รับ — จากรายการของ 409 (`keptMoved` …) */
export function keptOfPreview(preview) {
  return {
    moved: preview?.keptMoved || 0, started: preview?.keptStarted || 0, past: preview?.keptPast || 0,
    manual: preview?.keptManual || 0,
  };
}

/** นัดของรอบที่วันนัดไม่ใช่วันทำการตามตารางวันหยุดตอนบันทึก (`offDayVisits` ของ PATCH ?generate=1) → ท่อนของ toast · ไม่มี = null
 *  เกิดเมื่อวันหยุดถูกคีย์ **หลัง** นัดถูกสร้าง (นัดถือช่องอยู่แล้ว ระบบไม่ย้ายให้) หรือคนย้ายนัดไปลงวันหยุดเอง — บอกรหัสให้ไปย้าย */
const OFF_DAY_CODES_SHOWN = 5;
export function offDayVisitsText(visits) {
  const list = Array.isArray(visits) ? visits : [];
  if (!list.length) return null;
  const names = list.slice(0, OFF_DAY_CODES_SHOWN).map((visit) => `${visit.code || visit.id} (${fmtDayMonth(visit.scheduledDate)})`);
  const more = list.length > names.length ? ` และอีก ${fmtNumber(list.length - names.length)} นัด` : '';
  return `มีนัดตรงวันหยุดหรือเสาร์–อาทิตย์ ${fmtNumber(list.length)} นัด: ${names.join(', ')}${more} — ย้ายวันได้ที่หน้าจัดคิว`;
}

/** ข้อความหลังบันทึกรอบที่หน้าไซต์ (POST และ PATCH ?generate=1) — แต่ละท่อนขึ้นเฉพาะเมื่อเกิดจริง
 *  "บันทึกรอบแล้ว · ยกเลิกนัดตามรอบเดิม 2 นัด · คงนัดเดิม 1 นัดไว้ตามรอบใหม่ · สร้างนัดให้ 3 ครั้ง · …" */
export function planSavedMessage(body) {
  const cancelled = Array.isArray(body?.cancelled) ? body.cancelled.length : 0;
  const reslotted = Number(body?.reslotted) || 0;
  const generated = Array.isArray(body?.generated) ? body.generated.length : 0;
  return [
    'บันทึกรอบแล้ว',
    cancelled ? `ยกเลิกนัดตามรอบเดิม ${fmtNumber(cancelled)} นัด` : null,
    CADENCE_TEXT.confirm.stays(reslotted ? fmtNumber(reslotted) : 0),
    generated ? `สร้างนัดให้ ${fmtNumber(generated)} ครั้ง` : 'ยังไม่มีนัดใหม่ที่ต้องสร้าง',
    CADENCE_TEXT.confirm.kept(body?.kept || {}),
    offDayVisitsText(body?.offDayVisits),
    holidayGapText(body?.holidayGapYears),
  ].filter(Boolean).join(' · ');
}
