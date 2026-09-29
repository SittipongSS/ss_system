// ── สถานะฟอร์มของโมดัล "วางบิลและกำหนดชำระ" ของลูกค้า (รุ่นสี่ · mig 0393 · แบบ A "ประโยคนโยบาย" · มติเจ้าของ 29/09) ──
//
// ตรรกะล้วน ไม่มี React — โมดัล/การ์ดเรียกทีละการกด · เทสต์ด้วย node --test (CustomerBillingRuleState.test.mjs)
// ⭐ ตัวตัดสินว่าบันทึกได้ไหม = `normalizeRule(…, { allowLegacy:false })` **ตัวเดียวกับ API** (PATCH /billing-rule)
//    ฟอร์ม → รูปที่เก็บ ผ่าน `ruleFromForm` ของ lib (ไม่ประกอบรูปเองที่นี่) · ไฟล์นี้ทำแค่:
//    (1) รูปที่บันทึก ↔ ฟอร์มของจอ (2) ผลของการกดแต่ละแบบ (3) เหตุ "ยังบันทึกไม่ได้" (4) คำของประโยคนโยบาย/กระดิ่ง/จอจัดวันใหม่
// ⚠️ **ไม่มีค่าตั้งต้นให้การตัดสินใจ** (form-design-rules §2) — ข้อ ① ไม่เลือกให้ · รูปเดิม { credit:false } เปิดมา = ยังไม่ตอบ
//    (ลูกค้าที่ยังไม่ระบุ = แผ่น "ยังไม่ระบุ" ติดไว้ เพราะนั่นคือค่าที่เก็บอยู่จริง ไม่ใช่ค่าที่ระบบเดาให้)
// ⚠️ ข้อ ③ ของ "ทุกวัน/ทุกวันที่…" มีสามทาง (มติ 29/09): ชำระวันวางบิล · เครดิต N วัน · ตามรอบจ่ายรายเดือน —
//    วันจ่ายรายสัปดาห์ (AR-035) · เครดิต + รอบจ่าย · เวลาตัดรอบของรอบรายเดือน **ไม่มีจอ** ⇒ กติกาแบบนั้นที่เก็บอยู่ = `unsupported`
//    (เปิดมาไม่ตอบข้อ ① ให้ — บันทึกทับต้องตั้งใจเลือกใหม่ ไม่ใช่กดบันทึกแล้วกติกาเดิมหายเงียบ)
// ⭐ รุ่นห้า (มติเจ้าของ 29/09 "แล้ววางบิลที่มีตามปฏิทินมีมั้ย"): ข้อ ② มีทางที่สาม "ตามปฏิทินลูกค้า" — ตารางรอบจ่ายรายปี
//    (ตัวแก้ = lib/sales/billingCalendarEdit ของ CORE · จอ = billingCalendar/CalendarEditor) + เวลาตัดรอบ (ไม่บังคับ)
//    ข้อ ③ ของปฏิทิน = "วันจ่ายตามปฏิทิน" + เครดิต N วัน (ไม่บังคับ) — **ไม่มีค่าตั้งต้น** (Q1 มีเมตตา เครดิต 0 หรือ 30 ยังเปิด)
//    ⚠️ ปีที่ยังไม่มีปฏิทิน = ระบบหยุด ไม่ประมาณการ (Q3) — จอพูด "ยังไม่มีปฏิทิน YYYY · ใส่วันเองได้" ไม่มีคำ "ประมาณการ"
//
// รูปฟอร์ม
//   need        null | 'unknown' | 'none' | 'required'   ① ต้องวางบิลไหม ('unknown' = ยังไม่ระบุ → บันทึก null)
//   bill        null | 'anyday' | 'monthly' | 'calendar' ② วางบิลได้เมื่อไร (null = ยังไม่ตั้งรอบ — ข้ามได้)
//   days        [วันที่ 1–31 เรียง ≤4]                    ② ทุกวันที่… (31 = สิ้นเดือน)
//   calendar    สถานะตัวแก้ปฏิทิน (calendarEditorOf)       ② ตามปฏิทินลูกค้า — ตาราง เดือน × รอบ · ร่าง · ยังไม่เทียบ · รูปต่อปี
//   cutoffTime  สตริงที่แตะ/พิมพ์ ('' = ไม่มี)              ② เวลาตัดรอบของปฏิทิน (ไม่บังคับ)
//   pay         null | 'same' | 'credit' | 'runs'        ③ กำหนดชำระเมื่อไร (ทุกวัน/ทุกวันที่…)
//   calPay      null | 'same' | 'credit'                 ③ ของปฏิทิน: วันจ่ายของรอบเดียวกัน | ครบเครดิตแล้วเข้ารอบจ่าย
//   creditDays  สตริงที่แตะ/พิมพ์                          ③ เครดิต N วัน (ใช้ร่วมทั้งสองแบบ)
//   rounds      [{ day, off }] คู่กับ days ทีละตัว          ③ ตามรอบจ่าย (วางบิลทุกวันที่… → วันจ่าย + เดือน)
//   payDays     [วันที่ ≤4]                                ③ วันจ่ายประจำ (วางบิลได้ทุกวัน)
//   note        หมายเหตุ (ไม่บังคับ)
//   legacyNoCredit · legacyShape · unsupported             ธงของค่าที่เก็บอยู่ (บอกบนจอ ไม่ใช่คำตอบ)
import {
  BELL, BILLING_REMIND_DAYS, CALENDAR_MANUAL_HINT, CREDIT_MAX, DUE_REMIND_DAYS, MONTH_END_DAY, NEED_NONE, NEED_REQUIRED, NEED_UNKNOWN,
  ROUNDS_MAX, calendarStatus, cutoffBell, cutoffInfo, describeRule, fmtDate, formOf, lastWorkdayOnOrBefore, normalizeRule, reminderKinds,
  roundChoices, ruleFromForm, ruleOf,
} from "@/lib/sales/billingRule";
import { addDays } from "@/lib/sales/billingRuleV4";
import { calendarEditorIssues, calendarEditorOf, calendarFormYears } from "@/lib/sales/billingCalendarEdit";
import { BILLING_V4_SCHEMA_MISSING } from "@/lib/sales/billingPolicySchema";
import { businessDate } from "@/lib/businessDate";
import { NA, fmtTime } from "@/lib/format";

export const CREDIT_CHIPS = Object.freeze([7, 14, 15, 30, 45, 60]);
/* เวลาตัดรอบที่เจอบ่อย (ม็อก rework-v4 · ปฏิทินมีเมตตา "ส่งเอกสารก่อน 16:00 น.") — แตะครั้งเดียว · อื่น ๆ พิมพ์เอง */
export const CUTOFF_TIME_CHIPS = Object.freeze(["12:00", "13:00", "16:00"]);

const sortNums = (list) => [...new Set(list)].sort((a, b) => a - b);
const blankRound = () => ({ day: null, off: null });

export function blankForm() {
  return {
    need: null, bill: null, days: [], pay: null, creditDays: "", rounds: [], payDays: [], note: "",
    calPay: null, calendar: null, cutoffTime: "",
    legacyNoCredit: false, legacyShape: false, unsupported: "",
  };
}

/* รอบจ่ายแบบวันจ่ายอย่างเดียว (P) + วันรับวางบิล (D) → คู่ "วางบิลวันที่ D → จ่ายวันที่ P" ของจอ
   (รูปรุ่นสองของ "วางบิล 5 → เงินเข้า 25 เดือนเดียวกัน" อ่านออกมาเป็นแบบนี้) — วันจ่ายแรกที่ถึงก่อนสิ้นเดือน ไม่งั้นเดือนถัดไป */
function roundsFromPayDays(days, payDays) {
  const pays = sortNums(payDays);
  return days.map((d) => {
    const same = pays.find((p) => p >= d);
    return same !== undefined ? { day: same, off: 0 } : { day: pays[0], off: 1 };
  });
}

/**
 * ค่าที่เก็บ (รุ่นไหนก็ได้) → ฟอร์มของจอ · อ่านผ่าน `formOf` ของ lib ตัวเดียว (ไม่อ่านช่องข้างในเอง)
 * @param todayIso วันไทยของวันนี้ — ตัวแก้ปฏิทินเปิดปีนี้ + ปีหน้าเสมอ (แท็บ "2027 ยังไม่มี") · ไม่ส่ง = businessDate()
 */
export function formFromStored(value, { todayIso } = {}) {
  const base = blankForm();
  if (!ruleOf(value)) return { ...base, need: NEED_UNKNOWN };
  const cf = formOf(value);
  const withNote = { ...base, note: cf.note || "" };
  if (cf.legacyNoCredit) return { ...withNote, legacyNoCredit: true };
  if (cf.need === NEED_NONE) return { ...withNote, need: NEED_NONE };
  if (!cf.bill) return { ...withNote, need: NEED_REQUIRED };
  const unsupported = { ...withNote, unsupported: describeRule(value) };
  const days = sortNums(cf.days || []);
  const credit = Number(cf.creditDays) || 0;
  /* ⭐ ปฏิทินรายปี (รุ่นห้า) — ค่าที่เก็บเปิดมาตามจริงทั้งหมด: ตาราง · รูปต่อปี · เวลาตัดรอบ · คำตอบข้อ ③ ที่เคยบันทึก
     (calPay มาจากค่าที่เก็บ ไม่ใช่ค่าตั้งต้น — Q1 "ไม่มีค่าตั้งต้น" ใช้กับการตั้งครั้งแรก) */
  if (cf.bill === "calendar") {
    return {
      ...withNote, need: NEED_REQUIRED, bill: "calendar", calPay: cf.calPay, creditDays: credit > 0 ? String(credit) : "",
      calendar: calendarEditorOf(value, { todayIso: todayIso || businessDate() }), cutoffTime: cf.calendar?.cutoffTime || "",
    };
  }
  /* เวลาตัดรอบของรอบรายเดือน (`runs.cutoffTime`) ไม่มีช่องบนฟอร์มนี้ (ช่องเวลามีเฉพาะปฏิทิน) — เปิดแบบ "ยังตอบไม่ได้" ไม่งั้นกดบันทึก
     โดยไม่แก้อะไรก็ทิ้งเวลาตัดรอบเงียบ ๆ (review 29/09 · ท่าเดียวกับวันจ่ายประจำ) · ⚠️ อ่านช่องในตรง ๆ ที่เดียว — `formOf` ไม่พกค่านี้ของรอบรายเดือน */
  if (cf.payDays?.kind === "weekday" || ruleOf(value)?.runs?.cutoffTime) return unsupported;
  if (cf.payDays?.kind === "monthly") {
    if (credit > 0) return unsupported;
    if (cf.bill === "anyday") return { ...withNote, need: NEED_REQUIRED, bill: "anyday", pay: "runs", payDays: sortNums(cf.payDays.days) };
    return { ...withNote, need: NEED_REQUIRED, bill: "monthly", days, pay: "runs", rounds: roundsFromPayDays(days, cf.payDays.days), legacyShape: true };
  }
  if (cf.rounds?.length) {
    if (credit > 0) return unsupported;
    return {
      ...withNote, need: NEED_REQUIRED, bill: "monthly", days: cf.days, pay: "runs",
      rounds: cf.rounds.map((r) => ({ day: r.day, off: r.off })), legacyShape: Boolean(cf.legacy),
    };
  }
  return {
    ...withNote, need: NEED_REQUIRED, bill: cf.bill, days: cf.bill === "monthly" ? days : [],
    pay: credit > 0 ? "credit" : "same", creditDays: credit > 0 ? String(credit) : "",
  };
}

/* จำนวนวันเครดิตที่พิมพ์/แตะ → เลข หรือ null (ว่าง/เกินช่วง) */
export function creditNumber(text) {
  if (String(text ?? "") === "") return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 && n <= CREDIT_MAX ? n : null;
}

/**
 * เวลาตัดรอบที่พิมพ์/แตะ → "HH:MM" ของกติกา · ว่าง = ไม่มีเวลา (ไม่บังคับ)
 * รับ "16:00" · "16.00" · "1600" · "9:30" (เติมศูนย์ให้) — รูปอื่นบอกเหตุ ไม่เดา
 * @returns `{ value: 'HH:MM'|null, error }`
 */
export function cutoffTimeOf(text) {
  const t = String(text ?? "").trim();
  if (!t) return { value: null, error: "" };
  const m = t.match(/^(\d{1,2})[:.](\d{2})$/) || t.match(/^(\d{2})(\d{2})$/);
  if (!m) return { value: null, error: "เวลาตัดรอบพิมพ์แบบ 16:00 (หรือเว้นว่างถ้าลูกค้าไม่กำหนดเวลา)" };
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return { value: null, error: "เวลาตัดรอบต้องอยู่ระหว่าง 00:00–23:59" };
  return { value: `${String(h).padStart(2, "0")}:${m[2]}`, error: "" };
}

/* จำนวนรอบที่อ่านได้ของตัวแก้ปฏิทิน (ทุกปี) + ปีที่มีรอบ — ประโยคระหว่างกรอก · ข้อ ② "ตอบแล้ว" */
export function calendarCountOf(calendar) {
  const { years } = calendarFormYears(calendar);
  const list = Object.keys(years).sort();
  return { count: list.reduce((n, y) => n + years[y].length, 0), years: list };
}

/**
 * ผลของฟอร์มตอนนี้ — `{ rule, clear, why, step }`
 *   rule undefined = ยังบันทึกไม่ได้ (why = เหตุ · step = ข้อที่ต้องไปตอบ) · clear = "ยังไม่ระบุ" (ส่ง billingRule:null)
 *   ⚠️ why คือเหตุ "ตัวแรก" ตามลำดับข้อ ①→②→③ — ข้อที่ยังไม่ตอบข้อหลังขึ้นกับข้อก่อนเสมอ (ตอบ ② แล้ว ③ ถึงมีตัวเลือก)
 *   ⭐ ปฏิทิน: ด่านของตาราง = `calendarEditorIssues` ของ CORE (ช่องอ่านไม่ได้ · คู่ครึ่งเดียว · **ร่างที่ยังไม่แตะ "ตรงกับรูป"** ·
 *      validateCalendarYear) แล้วค่อยถึง normalizeRule ตัวเดียวกับ API — ปุ่มบันทึกกับ API พูดเรื่องเดียวกัน
 */
export function evaluateForm(form) {
  const fail = (why, step) => ({ rule: undefined, clear: false, why, step });
  if (!form?.need) return fail("ตอบข้อ 1 ก่อน — ต้องวางบิลไหม", 1);
  if (form.need === NEED_UNKNOWN) return { rule: null, clear: true, why: "", step: null };
  const note = form.note ? { note: form.note } : {};
  let input;
  if (form.need === NEED_NONE) input = ruleFromForm({ need: NEED_NONE, ...note });
  else if (!form.bill) input = ruleFromForm({ need: NEED_REQUIRED, ...note });
  else if (form.bill === "calendar") {
    const issues = calendarEditorIssues(form.calendar);
    if (!issues.ok) return fail(issues.messages.join(" · "), 2);
    const time = cutoffTimeOf(form.cutoffTime);
    if (time.error) return fail(time.error, 2);
    if (!form.calPay) return fail("เลือกข้อ 3 — วันจ่ายของรอบเดียวกัน หรือครบเครดิตแล้วเข้ารอบจ่าย (ไม่มีค่าตั้งต้น)", 3);
    let credit = 0;
    if (form.calPay === "credit") {
      credit = creditNumber(form.creditDays);
      if (!credit) return fail(`ใส่จำนวนวันเครดิต 1–${CREDIT_MAX} วัน (ไม่มีเครดิต = เลือก "วันจ่ายของรอบเดียวกัน")`, 3);
    }
    input = ruleFromForm({
      need: NEED_REQUIRED, bill: "calendar", calPay: form.calPay, creditDays: credit,
      calendar: { ...calendarFormYears(form.calendar), cutoffTime: time.value }, ...note,
    });
    const { rule, error } = normalizeRule(input, { allowLegacy: false });
    if (error) return fail(error, 2);
    return { rule, clear: false, why: "", step: null };
  } else {
    const days = form.bill === "monthly" ? sortNums(form.days) : [];
    if (form.bill === "monthly" && !days.length) return fail("แตะวันวางบิลในข้อ 2 (1–4 วัน)", 2);
    if (!form.pay) return fail("เลือกข้อ 3 — กำหนดชำระเมื่อไร", 3);
    const cf = { need: NEED_REQUIRED, bill: form.bill, days, ...note };
    if (form.pay === "same") cf.creditDays = 0;
    else if (form.pay === "credit") {
      const n = creditNumber(form.creditDays);
      if (n === null) return fail(`เลือกจำนวนวันเครดิต (0–${CREDIT_MAX} วัน)`, 3);
      cf.creditDays = n;
    } else if (form.bill === "monthly") {
      const rounds = days.map((_, i) => form.rounds[i] || blankRound());
      if (rounds.some((r) => r.day == null || r.off == null)) return fail("ใส่วันจ่ายและเดือนของทุกรอบในข้อ 3", 3);
      Object.assign(cf, { rounds, creditDays: 0 });
    } else {
      const payDays = sortNums(form.payDays || []);
      if (!payDays.length) return fail("แตะวันจ่ายของลูกค้าในข้อ 3", 3);
      Object.assign(cf, { payDays: { kind: "monthly", days: payDays }, creditDays: 0 });
    }
    input = ruleFromForm(cf);
  }
  const { rule, error } = normalizeRule(input, { allowLegacy: false });
  if (error) return fail(error, form.need === NEED_REQUIRED && form.bill ? 3 : 1);
  return { rule, clear: false, why: "", step: null };
}

/* ด่านลำดับ deploy — ฐานยังไม่รัน 0393 (customer GET บอก `billingSkipReady:false`) ⇒ CHECK ของฐานยังเป็นรุ่นสอง
   กติการุ่นสี่ทุกตัวตก 23514 · ล้างเป็น null ยังบันทึกได้ · ไม่รู้ (undefined) = ไม่ปิด ให้ API ตอบเหตุเอง */
export function saveBlockOf(result, schemaReady) {
  return schemaReady === false && result?.rule ? BILLING_V4_SCHEMA_MISSING : "";
}

/* ก้อนที่ส่ง PATCH — `baseUpdatedAt` ส่งเสมอ (ไม่มีคีย์ = API ตอบ 400 "โหลดหน้าใหม่") · สตริงดิบจาก GET ไม่แปลงผ่าน Date */
export const savePayloadOf = (result, baseUpdatedAt) => ({
  billingRule: result?.clear ? null : result?.rule ?? null,
  baseUpdatedAt: baseUpdatedAt ?? null,
});

/* ── การกด ─────────────────────────────────────────────────────────────── */

/* ① — สลับไปมาแล้วคำตอบข้อ ②③ ที่เคยแตะยังอยู่ (สลับกลับมาไม่ต้องแตะใหม่) */
export const chooseNeed = (form, need) => ({ ...form, need });

/* ② โหมด — เก็บวันที่แตะไว้ (สลับกลับมารายเดือนแล้ววันเดิมยังอยู่) · ปฏิทินครั้งแรก = ตัวแก้ว่างที่มีปีนี้ + ปีหน้า
   (สลับไปทางอื่นแล้วกลับมา = ตารางที่กรอกไว้ยังอยู่) */
export function chooseBill(form, bill, { todayIso } = {}) {
  const next = { ...form, need: NEED_REQUIRED, bill };
  if (bill === "calendar" && !form.calendar) next.calendar = calendarEditorOf(null, { todayIso: todayIso || businessDate() });
  return next;
}

/* ② ปฏิทิน — ตัวแก้ (billingCalendarEdit) คืนสถานะใหม่ทุกครั้ง · ผู้เรียกส่งตัวปรับ (prev → next) กันการกดซ้อนกันทับกันเอง */
export const updateCalendar = (form, fn) => ({ ...form, need: NEED_REQUIRED, bill: "calendar", calendar: fn(form.calendar) });
export const setCutoffTime = (form, text) => ({ ...form, cutoffTime: String(text ?? "").trim().slice(0, 5) });

/* ③ ของปฏิทิน — สองทาง ไม่มีค่าตั้งต้น (Q1) · เครดิตพิมพ์ได้ 1–365 (0 = ทางแรก) */
export const chooseCalPay = (form, calPay) => ({ ...form, calPay });
export const setCalCreditDays = (form, text) => ({
  ...form, calPay: "credit", creditDays: String(text ?? "").replace(/\D/g, "").slice(0, 3),
});

/* "ยังไม่รู้รอบ" = ข้ามข้อ ② ③ → บันทึกเป็น "ต้องวางบิล · ยังไม่ตั้งรอบ" */
export const clearTiming = (form) => ({ ...form, need: NEED_REQUIRED, bill: null, pay: null });

/**
 * ② แตะวันที่ = เพิ่ม/ถอดรอบ (เรียงเอง · ≤4) — คู่ ③ "ตามรอบจ่าย" ตามวันไปด้วย (ถอดวัน = ถอดคู่ของวันนั้น)
 * @returns `{ form, limited }` — limited = แตะรอบที่ 5 (ไม่เปลี่ยนอะไร · จอบอกเพดาน)
 */
export function toggleBillDay(form, day) {
  const days = form.bill === "monthly" ? form.days : [];
  const rounds = form.bill === "monthly" ? form.rounds : [];
  const at = days.indexOf(day);
  if (at >= 0) {
    return {
      form: { ...form, need: NEED_REQUIRED, bill: "monthly", days: days.filter((d) => d !== day), rounds: rounds.filter((_, i) => i !== at) },
      limited: false,
    };
  }
  if (days.length >= ROUNDS_MAX) return { form, limited: true };
  const nextDays = sortNums([...days, day]);
  const insertAt = nextDays.indexOf(day);
  const nextRounds = nextDays.map((_, i) => (i < insertAt ? rounds[i] : i === insertAt ? blankRound() : rounds[i - 1]) || blankRound());
  return { form: { ...form, need: NEED_REQUIRED, bill: "monthly", days: nextDays, rounds: nextRounds }, limited: false };
}

export const choosePay = (form, pay) => ({ ...form, pay });

export const setCreditDays = (form, text) => ({
  ...form, pay: "credit", creditDays: String(text ?? "").replace(/\D/g, "").slice(0, 3),
});

/* ③ วันจ่ายประจำ (วางบิลได้ทุกวัน) — แตะ = เพิ่ม/ถอด (≤4) */
export function togglePayDay(form, day) {
  const list = form.payDays || [];
  if (list.includes(day)) return { form: { ...form, pay: "runs", payDays: list.filter((d) => d !== day) }, limited: false };
  if (list.length >= ROUNDS_MAX) return { form, limited: true };
  return { form: { ...form, pay: "runs", payDays: sortNums([...list, day]) }, limited: false };
}

/* "เดือนเดียวกัน" ใช้ไม่ได้เมื่อวันจ่ายไม่อยู่หลังวันวางบิล (วันเดียวกัน = ชำระวันวางบิล ซึ่งเป็นอีกทางในข้อ ③) */
export const sameMonthBlocked = (billDay, payDay) => payDay != null && billDay != null && payDay <= billDay;

function patchRound(form, index, patch) {
  const rounds = form.days.map((_, i) => ({ ...(form.rounds[i] || blankRound()), ...(i === index ? patch : {}) }));
  return { ...form, pay: "runs", rounds };
}
/* ③ วันจ่ายของรอบ — วันจ่าย ≤ วันวางบิล มีทางเดียวคือ "เดือนถัดไป" ⇒ flow ตัดสินให้ (ไม่ใช่ค่าตั้งต้น) */
export function setRoundDay(form, index, day) {
  const forced = sameMonthBlocked(form.days[index], day);
  return patchRound(form, index, forced ? { day, off: 1 } : { day });
}
/* ③ เดือนของวันจ่าย — "เดือนเดียวกัน" ที่ใช้ไม่ได้ = ไม่เปลี่ยน (จอบอกเหตุ) · @returns `{ form, blocked }` */
export function setRoundOff(form, index, off) {
  const round = form.rounds[index] || blankRound();
  if (off === 0 && sameMonthBlocked(form.days[index], round.day)) return { form, blocked: true };
  return { form: patchRound(form, index, { off }), blocked: false };
}
/* ตารางวันจ่ายของรอบ — "เดือนเดียวกัน" ปิดวันที่ไม่อยู่หลังวันวางบิล (ขีดใต้ = วันวางบิล) */
export function payDayStateOf(form, index, day) {
  const billDay = form.days[index];
  const round = form.rounds[index] || blankRound();
  const gated = round.off === 0 && billDay != null;
  return { blocked: gated && day <= billDay && round.day !== day, invalid: gated && day <= billDay && round.day === day, isBill: billDay === day };
}
/* รอบถัดไปที่ยังไม่มีวันจ่าย (ตารางย้ายไปรอบนั้นเองหลังแตะ) · ครบ = -1 */
export function nextRoundNeedingDay(form, after = -1) {
  const count = form.days.length;
  for (let step = 1; step <= count; step += 1) {
    const index = (after + step) % count;
    if (form.rounds[index]?.day == null) return index;
  }
  return -1;
}

/* ── คำ ─────────────────────────────────────────────────────────────── */
export const dayWord = (day) => (day === MONTH_END_DAY ? "สิ้นเดือน" : `วันที่ ${day}`);
export const roundName = (day) => `รอบ${dayWord(day)}`;
/* "ทุกวันที่ 5" · "ทุกวันที่ 5 และ 20" · "ทุกสิ้นเดือน" · "ทุกวันที่ 10 และสิ้นเดือน" */
export function everyDays(days) {
  const list = sortNums(days);
  if (!list.length) return "";
  if (list.length === 1) return list[0] === MONTH_END_DAY ? "ทุกสิ้นเดือน" : `ทุกวันที่ ${list[0]}`;
  return `ทุก${dayWord(list[0])} ${list.slice(1).map((d) => (d === MONTH_END_DAY ? "และสิ้นเดือน" : `และ ${d}`)).join(" ")}`;
}
const WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const nthWord = (n) => (n === 5 ? "สุดท้าย" : String(n));
const payOnly = (rounds) => rounds.every((r) => r.cutoffDay === r.payDay && r.payMonthOffset === 0);

/**
 * คำของประโยคนโยบาย ① ต้องวางบิลไหม → ② วางบิลได้เมื่อไร → ③ กำหนดชำระเมื่อไร (การ์ด · แถบบนโมดัล)
 * @returns `{ need: 'unknown'|'legacy'|'none'|'required', noTiming, when, pay, cutoff, note }` — อ่านจากรูปมาตรฐานของ lib เท่านั้น
 *   cutoff = "ส่งเอกสารก่อน 16:00 น." (มีเวลาตัดรอบ + ไม่มีเครดิต) · เครดิต N ไม่พูดเวลา (system-design §6)
 * ⚠️ ห้ามพูด "เครดิต 0 วัน" — เครดิต 0 = "วันเดียวกับวางบิล"
 */
export function policyWordsOf(value) {
  const rule = ruleOf(value);
  if (!rule) return { need: "unknown", noTiming: false, when: "", pay: "", cutoff: "", note: "" };
  const note = rule.note || "";
  if (rule.legacyNoCredit) return { need: "legacy", noTiming: false, when: "", pay: "", cutoff: "", note };
  if (rule.need === NEED_NONE) return { need: "none", noTiming: false, when: "", pay: "", cutoff: "", note };
  if (!rule.billing) return { need: "required", noTiming: true, when: "", pay: "", cutoff: "", note };
  const n = rule.creditDays;
  const credit = n > 0 ? `เครดิต ${n} วัน` : "";
  const { runs } = rule;
  const onlyPay = runs?.kind === "monthly" && payOnly(runs.rounds);
  const cutoff = runs?.cutoffTime && n === 0 ? `ส่งเอกสารก่อน ${runs.cutoffTime} น.` : "";
  let when;
  if (rule.billing.mode === "monthly") when = everyDays(rule.billing.days);
  else if (runs?.kind === "monthly" && !onlyPay) when = everyDays(runs.rounds.map((r) => r.cutoffDay));
  else if (runs?.kind === "calendar") when = calendarWhen(Object.keys(runs.years).sort(), Object.values(runs.years).reduce((sum, y) => sum + y.runs.length, 0));
  else when = "ทุกวัน";
  let pay;
  if (!runs) pay = credit || "วันเดียวกับวางบิล";
  else if (runs.kind === "calendar") pay = calendarPayWord(n);
  else if (runs.kind === "weekday") pay = `${credit ? `${credit} แล้ว` : ""}จ่ายวัน${WEEKDAYS[runs.weekday]}ที่ ${runs.nths.map(nthWord).join(" และ ")} ของเดือน`;
  else if (onlyPay) pay = `${credit ? `${credit} แล้ว` : ""}จ่ายทุก${runs.rounds.map((r) => dayWord(r.payDay)).join(" และ ")}`;
  else {
    const rs = runs.rounds;
    pay = rs.length === 1
      ? `${dayWord(rs[0].payDay)} ${rs[0].payMonthOffset ? "เดือนถัดไป" : "เดือนเดียวกัน"}`
      : rs.map((r) => `${r.cutoffDay === MONTH_END_DAY ? "สิ้นเดือน" : r.cutoffDay} → ${r.payDay === MONTH_END_DAY ? "สิ้นเดือน" : r.payDay}${r.payMonthOffset ? " เดือนถัดไป" : ""}`).join(" · ");
    if (credit) pay = `${credit} + ${pay}`;
  }
  return { need: "required", noTiming: false, when, pay, cutoff, note };
}

/* ② ของปฏิทิน: "ตามปฏิทินลูกค้า 2026 (24 รอบ)" · ยังไม่มีรอบ = "ตามปฏิทินลูกค้า" */
function calendarWhen(years, count) {
  return count ? `ตามปฏิทินลูกค้า ${years.join(", ")} (${count} รอบ)` : "ตามปฏิทินลูกค้า";
}
/* ③ ของปฏิทิน — เครดิต 0 = วันจ่ายของรอบที่วางบิล · เครดิต N = ครบเครดิตแล้วเข้ารอบจ่ายแรกที่ตัดรอบไม่ก่อนวันครบ */
function calendarPayWord(n) {
  return n > 0 ? `ครบเครดิต ${n} วันแล้วเข้ารอบจ่าย` : "วันจ่ายของรอบเดียวกัน";   // = describeRule (หนึ่งสิ่งหนึ่งชื่อ)
}

/* คำของประโยคระหว่างกรอก (ยังบันทึกไม่ได้) — ช่องที่ยังไม่ตอบ = '' (จอขึ้นคำถาม "เมื่อไร?") */
export function formWordsOf(form) {
  const empty = { noTiming: false, when: "", pay: "", cutoff: "", note: "" };
  if (form.need === NEED_NONE) return { ...empty, need: "none" };
  if (form.need === NEED_UNKNOWN) return { ...empty, need: "unknown" };
  if (form.need !== NEED_REQUIRED) return { ...empty, need: form.legacyNoCredit ? "legacy" : "ask" };
  if (!form.bill) return { ...empty, need: "required", noTiming: true };
  if (form.bill === "calendar") {
    const { count, years } = calendarCountOf(form.calendar);
    const n = creditNumber(form.creditDays);
    let pay = "";
    if (form.calPay === "same") pay = calendarPayWord(0);
    else if (form.calPay === "credit" && n > 0) pay = calendarPayWord(n);
    const time = cutoffTimeOf(form.cutoffTime).value;
    return { ...empty, need: "required", when: calendarWhen(years, count), pay, cutoff: time && form.calPay === "same" ? `ส่งเอกสารก่อน ${time} น.` : "" };
  }
  const when = form.bill === "anyday" ? "ทุกวัน" : everyDays(form.days);
  let pay = "";
  if (form.pay === "same") pay = "วันเดียวกับวางบิล";
  else if (form.pay === "credit" && creditNumber(form.creditDays) !== null) pay = creditNumber(form.creditDays) === 0 ? "วันเดียวกับวางบิล" : `เครดิต ${creditNumber(form.creditDays)} วัน`;
  return { ...empty, need: "required", when, pay };
}

/**
 * การเตือนที่ลูกค้านี้ได้ — ชิปบนการ์ด/กล่องผลของโมดัล · `[{ key, text, on }]`
 * ⭐ จาก `reminderKinds` ของ lib ตัวเดียวกับ cron (ชนิดไหนไม่อยู่ในลิสต์ = ไม่พูด)
 *   · วันตัดรอบ (มติ 29/09 · ลูกค้าที่มีรอบจ่าย) — เช้า 08:30 วันทำการก่อน + วันสุดท้าย · เครดิต 0 พูดเวลาตัดรอบ ·
 *     เครดิต N = "วันสุดท้ายที่วางบิลแล้วทันรอบ" ไม่พูดเวลา (system-design §6)
 *   · ขอปฏิทินปีหน้า (ลูกค้าปฏิทิน) — ทุกสัปดาห์ตั้งแต่ `firstDigest` จนกว่าจะใส่ปีถัดไป (ส่ง todayIso มาถึงบอกวันได้)
 * ⚠️ ไม่ต้องวางบิล = ไม่มีกระดิ่งวางบิล (เดิมการ์ดพูด "กระดิ่งเตือนก่อนถึงวันวางบิลเหมือนลูกค้าทุกราย" — ไม่จริงแล้ว)
 */
export function reminderChipsOf(value, { todayIso = null, holidays = null } = {}) {
  const words = policyWordsOf(value);
  const rule = ruleOf(value);
  const perInstallment = words.need === "unknown" || words.need === "legacy" || words.noTiming;
  const chips = [];
  for (const kind of reminderKinds(value)) {
    if (kind === BELL.BILLING_DUE) {
      chips.push({ key: kind, on: true, text: perInstallment ? "ถึงวันวางบิล (งวดที่ใส่วันไว้)" : `ถึงวันวางบิล 0–${BILLING_REMIND_DAYS} วัน` });
    } else if (kind === BELL.DUE_SOON) {
      chips.push({ key: kind, on: true, text: `ครบกำหนดชำระ 0–${DUE_REMIND_DAYS} วัน` });
    } else if (kind === BELL.BILLING_CUTOFF) {
      const time = rule?.creditDays === 0 ? rule?.runs?.cutoffTime : null;
      chips.push({
        key: kind, on: true,
        text: rule?.creditDays === 0
          ? `วันตัดรอบ (เช้าวันก่อน + วันนั้น 08:30)${time ? ` · ส่งก่อน ${time} น.` : ""}`
          : "วันสุดท้ายที่วางบิลแล้วทันรอบ (เช้าวันก่อน + วันนั้น 08:30)",
      });
    } else if (kind === BELL.CALENDAR_MISSING) {
      const st = todayIso ? calendarStatus(value, todayIso, { holidays }) : null;
      chips.push({ key: kind, on: true, text: st ? `${st.requestText} · ทุกสัปดาห์ตั้งแต่ ${fmtDate(st.firstDigest)}` : "ขอปฏิทินปีถัดไป · ทุกสัปดาห์" });
    }
  }
  if (words.need === "none") {
    chips.push({ key: "no-billing-bell", on: false, text: "ไม่มีเตือนวางบิล" }, { key: "no-billing-ask", on: false, text: "ไม่ชวนขอใบวางบิล" });
  }
  return chips;
}

/* ── ปฏิทินรายปี: การ์ด · ผลก่อนบันทึก (รุ่นห้า · มติ 29/09) ─────────────────────────── */

/**
 * ส่วนปฏิทินของการ์ดลูกค้า — ครอบปีไหนกี่รอบ · แถบ "ขอปฏิทิน YYYY" · เวลาตัดรอบ · รูปที่แนบต่อปี
 * ⭐ ตัวตัดสินว่าถึงเวลาขอปฏิทินหรือยัง = `calendarStatus().remind` ตัวเดียวกับกระดิ่งรายสัปดาห์ (ตั้งแต่ 1 ธ.ค. หรือ 30 วัน
 *    ก่อนวันตัดรอบสุดท้าย อันไหนก่อน) — การ์ดกับกระดิ่งจึงขึ้นพร้อมกันและหายพร้อมกันเมื่อใส่ปีถัดไป
 * @returns null (ไม่ใช่ปฏิทิน) | `{ years: [{ year, count, fileId }], coverage, status, banner, upcoming, cutoffLine }`
 */
export function calendarCardOf(value, todayIso, { holidays = null } = {}) {
  const rule = ruleOf(value);
  if (rule?.runs?.kind !== "calendar") return null;
  const years = Object.keys(rule.runs.years).sort().map((y) => ({
    year: Number(y), count: rule.runs.years[y].runs.length, fileId: rule.runs.years[y].fileId || "",
  }));
  const status = calendarStatus(value, todayIso, { holidays });
  const time = rule.runs.cutoffTime || "";
  let cutoffLine = "";
  if (time) {
    cutoffLine = rule.creditDays === 0
      ? `ส่งเอกสารก่อน ${time} น. ของวันตัดรอบ — กระดิ่งเช้า 08:30 เตือนวันก่อนและวันตัดรอบ`
      : `ลูกค้าตัดรอบ ${time} น. (เก็บเป็นข้อมูล) — มีเครดิต กระดิ่งเตือน "วันสุดท้ายที่วางบิลแล้วทันรอบ" ไม่พูดเวลา`;
  }
  const banner = status?.remind ? {
    year: status.missingYear,
    title: status.requestText,
    text: `ปฏิทินที่มีใช้ได้ถึงวันตัดรอบ ${fmtDate(status.lastCutoff)} · งวดที่วางบิลหลัง ${fmtDate(status.lastCoveredBilling)} ยังไม่มีกำหนดชำระ — ระบบไม่เดาวัน (${CALENDAR_MANUAL_HINT}) · กระดิ่งเตือนฝ่ายขายทีมที่ดูแลและฝ่ายบัญชีทุกสัปดาห์จนกว่าจะใส่`,
  } : null;
  const upcoming = status && !status.remind
    ? `ปฏิทินใช้ได้ถึง ${status.coveredThroughText} · เตือนขอปฏิทิน ${status.missingYear} ทุกสัปดาห์ตั้งแต่ ${fmtDate(status.firstDigest)}`
    : "";
  return {
    years, status, banner, upcoming, cutoffLine,
    coverage: years.map((y) => `ปฏิทิน ${y.year} · ${y.count} รอบ`).join(" · "),
  };
}

/**
 * ตัวอย่างกระดิ่งเช้าวันตัดรอบของรอบถัดไป (ผลก่อนบันทึก) — ข้อความจาก `cutoffBell` ตัวเดียวกับ cron
 * ยิง "วันทำการก่อนเส้นตาย" (ถ้ายังไม่เลยวันนี้) ไม่งั้นเช้าวันเส้นตาย · ปฏิทินหมด/ไม่มีรอบ = null
 * @returns null | `{ fireOn, text }`
 */
export function cutoffBellPreviewOf(value, todayIso, { holidays = null, customer = "ลูกค้า" } = {}) {
  const rule = ruleOf(value);
  if (!rule?.runs || !todayIso) return null;
  const { chips: [next] } = roundChoices(rule, todayIso, 1, { holidays });
  const info = next ? cutoffInfo(rule, next.billingDate) : null;
  if (!info) return null;
  const fireToday = lastWorkdayOnOrBefore(info.lastBillingDate, holidays);
  const fireNext = lastWorkdayOnOrBefore(addDays(fireToday, -1), holidays);
  const fireOn = fireNext >= todayIso ? fireNext : fireToday;
  const bell = cutoffBell(rule, next.billingDate, fireOn, { holidays, customer });
  return bell ? { fireOn, text: bell.text } : null;
}

/**
 * รอบถัดไปในตารางปฏิทิน (ตัดรอบ → วันจ่าย) ตอนข้อ ③ ยังไม่ตอบ — ข้อมูลกลาง ๆ จากตารางล้วน ไม่สมมติเครดิต
 * (Q1 ยังเปิด: ห้ามโชว์ "กำหนดชำระ" ของทางใดทางหนึ่งเหมือนเป็นคำตอบ) · @returns `[{ cutoff, pay }]`
 */
export function calendarUpcomingRuns(calendar, todayIso, count = 3) {
  const { years } = calendarFormYears(calendar);
  return Object.keys(years).sort().flatMap((y) => years[y]).filter((r) => r.cutoff >= todayIso).slice(0, count);
}

/* "แก้ล่าสุด จ. 29 ก.ย. 2026 · 10:42" — วันไทย (businessDate) + เวลาไทย (fmtTime) ของจุดเวลาเดียวกัน */
export function stampTextOf(at) {
  if (!at) return "";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return `${fmtDate(businessDate(date))} · ${fmtTime(at)}`;
}

/* ── หลังบันทึก: 409 · จอ "งวดที่วันจะเปลี่ยน" ────────────────────────────── */

/* 409 ของ PATCH (มีคนบันทึกหลังเราเปิด) → `{ message, current }` หรือ null (ไม่ใช่ 409) — ฟอร์มที่กรอกไม่ถูกแตะ
   `current` null = API อ่านค่าล่าสุดซ้ำไม่ได้ ⇒ จอไม่มีฐานใหม่ให้บันทึกทับ ต้องโหลดหน้าใหม่ */
export function conflictOf(error) {
  if (error?.status !== 409) return null;
  const current = error.data?.current;
  return {
    message: error.data?.error || error.message || "มีคนแก้กำหนดวางบิลของลูกค้ารายนี้หลังคุณเปิด",
    current: current ? {
      billingRule: current.billingRule ?? null,
      billingRuleUpdatedAt: current.billingRuleUpdatedAt ?? null,
      billingRuleUpdatedByName: current.billingRuleUpdatedByName ?? null,
    } : null,
  };
}

/* มีอะไรให้คนดูบนจอ "งวดที่วันจะเปลี่ยน" ไหม (งวดที่ระบบเสนอ หรืองวดที่ไม่แตะพร้อมเหตุ) */
export const hasRuleChange = (change) => Boolean(change && ((change.rows || []).length || (change.kept || []).length));

const fmtShort = (iso) => fmtDate(iso, { withYear: false });
/* บรรทัดอธิบายของงวดที่ระบบเสนอ
   ⭐ typedInGap (มติ 29/09 Q3) = กำหนดชำระที่คนใส่เองตอนปฏิทินปีนั้นยังไม่มี — ใส่ปฏิทินแล้วระบบ **เสนอ** วันตามปฏิทิน คนยืนยัน */
export function changeTextOf(row) {
  if (row.change === "clearBilling") return `ล้างวันวางบิล ${fmtShort(row.prevBillingDate)} · คงกำหนดชำระ`;
  if (row.change === "addBilling") return `เพิ่มวันวางบิล ${fmtShort(row.billingDate)} (ถอยจากกำหนดชำระ)`;
  const base = `กำหนดชำระ ${fmtShort(row.prevDueDate)} → ${fmtShort(row.dueDate)}`;
  return row.typedInGap ? `${base} · เดิมใส่เองตอนยังไม่มีปฏิทิน — ตอนนี้ปฏิทินมีวันให้แล้ว` : base;
}
/* เหตุที่ไม่แตะ */
export function keptTextOf(kept) {
  switch (kept.reason) {
    case "manual": return "แก้เองไว้ (ไม่ตรงกติกาเดิม) — ไม่แตะ";
    case "requested": return "ขอใบวางบิลแล้ว — แก้ผ่านคำร้อง";
    case "skip": return "ติ๊ก \"งวดนี้ไม่ต้องวางบิล\" — ไม่แตะ";
    case "locked": return kept.lock ? `ล็อกอยู่ — ${kept.lock}` : "ล็อกอยู่ — แก้วันไม่ได้";
    /* ปีที่ยังไม่มีปฏิทิน (Q3 หยุดรอปฏิทินใหม่) — ไม่เดาวัน · คำจาก lib (`text` ของช่องว่าง) ตัวเดียวกับใบ SO */
    case "calendarMissing": return `${kept.text || `ยังไม่มีปฏิทินปีนั้น · ${CALENDAR_MANUAL_HINT}`} — ระบบไม่เดาวัน ไม่แตะ`;
    case "dueNotOnRound": {
      const pair = (p) => (p?.billingDate ? `${fmtShort(p.billingDate)} → ${fmtShort(p.dueDate)}` : NA);
      const later = kept.later ? pair(kept.later) : kept.laterMissing || NA;
      return `กำหนดชำระไม่ตรงวันจ่ายของลูกค้า — มีสองทาง ไม่เลือกให้ · เร็วกว่า ${pair(kept.earlier)} · ช้ากว่า ${later}`;
    }
    default: return "ไม่แตะ";
  }
}
/* ก้อนที่ส่ง POST …/billing-rule/redate — เฉพาะงวดที่เลือก · `updatedAt` ของงวดตอนที่ระบบเสนอ (ตัวล็อกของ schedule-many) */
export function redatePayloadOf(change, selected) {
  return {
    rows: (change?.rows || []).filter((row) => selected.has(row.id)).map((row) => ({
      id: row.id, billingDate: row.billingDate ?? null, dueDate: row.dueDate ?? null, updatedAt: row.updatedAt ?? null,
    })),
  };
}
/* 409 ของ redate → งวดที่ติด (เอาออกจากที่เลือก · ขึ้นเหตุที่แถว) — ที่เหลือคงที่เลือกไว้ */
export function applyRedateConflicts(selected, conflicts) {
  const blocked = new Map((conflicts || []).filter((c) => c?.id).map((c) => [c.id, c.reason || "มีคนแก้งวดนี้ระหว่างนี้"]));
  return { selected: new Set([...selected].filter((id) => !blocked.has(id))), blocked };
}
