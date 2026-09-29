// ── สถานะฟอร์มของโมดัล "วางบิลและกำหนดชำระ" ของลูกค้า (รุ่นสี่ · mig 0393 · แบบ A "ประโยคนโยบาย" · มติเจ้าของ 29/09) ──
//
// ตรรกะล้วน ไม่มี React — โมดัล/การ์ดเรียกทีละการกด · เทสต์ด้วย node --test (CustomerBillingRuleState.test.mjs)
// ⭐ ตัวตัดสินว่าบันทึกได้ไหม = `normalizeRule(…, { allowLegacy:false })` **ตัวเดียวกับ API** (PATCH /billing-rule)
//    ฟอร์ม → รูปที่เก็บ ผ่าน `ruleFromForm` ของ lib (ไม่ประกอบรูปเองที่นี่) · ไฟล์นี้ทำแค่:
//    (1) รูปที่บันทึก ↔ ฟอร์มของจอ (2) ผลของการกดแต่ละแบบ (3) เหตุ "ยังบันทึกไม่ได้" (4) คำของประโยคนโยบาย/กระดิ่ง/จอจัดวันใหม่
// ⚠️ **ไม่มีค่าตั้งต้นให้การตัดสินใจ** (form-design-rules §2) — ข้อ ① ไม่เลือกให้ · รูปเดิม { credit:false } เปิดมา = ยังไม่ตอบ
//    (ลูกค้าที่ยังไม่ระบุ = แผ่น "ยังไม่ระบุ" ติดไว้ เพราะนั่นคือค่าที่เก็บอยู่จริง ไม่ใช่ค่าที่ระบบเดาให้)
// ⚠️ รอบนี้ (มติ 29/09) ข้อ ③ มีสามทาง: ชำระวันวางบิล · เครดิต N วัน · ตามรอบจ่ายรายเดือน —
//    ปฏิทินรายปี (2b) · วันจ่ายรายสัปดาห์ (AR-035) · เครดิต + รอบจ่าย **ไม่มีจอ** ⇒ กติกาแบบนั้นที่เก็บอยู่ = `unsupported`
//    (เปิดมาไม่ตอบข้อ ① ให้ — บันทึกทับต้องตั้งใจเลือกใหม่ ไม่ใช่กดบันทึกแล้วกติกาเดิมหายเงียบ)
//
// รูปฟอร์ม
//   need        null | 'unknown' | 'none' | 'required'   ① ต้องวางบิลไหม ('unknown' = ยังไม่ระบุ → บันทึก null)
//   bill        null | 'anyday' | 'monthly'              ② วางบิลได้เมื่อไร (null = ยังไม่ตั้งรอบ — ข้ามได้)
//   days        [วันที่ 1–31 เรียง ≤4]                    ② ทุกวันที่… (31 = สิ้นเดือน)
//   pay         null | 'same' | 'credit' | 'runs'        ③ กำหนดชำระเมื่อไร
//   creditDays  สตริงที่แตะ/พิมพ์                          ③ เครดิต N วัน
//   rounds      [{ day, off }] คู่กับ days ทีละตัว          ③ ตามรอบจ่าย (วางบิลทุกวันที่… → วันจ่าย + เดือน)
//   payDays     [วันที่ ≤4]                                ③ วันจ่ายประจำ (วางบิลได้ทุกวัน)
//   note        หมายเหตุ (ไม่บังคับ)
//   legacyNoCredit · legacyShape · unsupported             ธงของค่าที่เก็บอยู่ (บอกบนจอ ไม่ใช่คำตอบ)
import {
  BELL, BILLING_REMIND_DAYS, CREDIT_MAX, DUE_REMIND_DAYS, MONTH_END_DAY, NEED_NONE, NEED_REQUIRED, NEED_UNKNOWN,
  ROUNDS_MAX, describeRule, fmtDate, formOf, normalizeRule, reminderKinds, ruleFromForm, ruleOf,
} from "@/lib/sales/billingRule";
import { BILLING_V4_SCHEMA_MISSING } from "@/lib/sales/billingPolicySchema";
import { businessDate } from "@/lib/businessDate";
import { NA, fmtTime } from "@/lib/format";

export const CREDIT_CHIPS = Object.freeze([7, 14, 15, 30, 45, 60]);

const sortNums = (list) => [...new Set(list)].sort((a, b) => a - b);
const blankRound = () => ({ day: null, off: null });

export function blankForm() {
  return {
    need: null, bill: null, days: [], pay: null, creditDays: "", rounds: [], payDays: [], note: "",
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
 */
export function formFromStored(value) {
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
  /* เวลาตัดรอบ (`runs.cutoffTime`) ไม่มีช่องบนฟอร์มรอบนี้ (ปฏิทิน/เวลาตัดรอบเป็นเฟส 2b) — เปิดแบบ "ยังตอบไม่ได้" ไม่งั้นกดบันทึก
     โดยไม่แก้อะไรก็ทิ้งเวลาตัดรอบเงียบ ๆ (review 29/09 · ท่าเดียวกับปฏิทิน/วันจ่ายประจำ) · ⚠️ อ่านช่องในตรง ๆ ที่เดียว — `formOf` ไม่พกค่านี้ */
  if (cf.bill === "calendar" || cf.payDays?.kind === "weekday" || ruleOf(value)?.runs?.cutoffTime) return unsupported;
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
 * ผลของฟอร์มตอนนี้ — `{ rule, clear, why, step }`
 *   rule undefined = ยังบันทึกไม่ได้ (why = เหตุ · step = ข้อที่ต้องไปตอบ) · clear = "ยังไม่ระบุ" (ส่ง billingRule:null)
 *   ⚠️ why คือเหตุ "ตัวแรก" ตามลำดับข้อ ①→②→③ — ข้อที่ยังไม่ตอบข้อหลังขึ้นกับข้อก่อนเสมอ (ตอบ ② แล้ว ③ ถึงมีตัวเลือก)
 */
export function evaluateForm(form) {
  const fail = (why, step) => ({ rule: undefined, clear: false, why, step });
  if (!form?.need) return fail("ตอบข้อ 1 ก่อน — ต้องวางบิลไหม", 1);
  if (form.need === NEED_UNKNOWN) return { rule: null, clear: true, why: "", step: null };
  const note = form.note ? { note: form.note } : {};
  let input;
  if (form.need === NEED_NONE) input = ruleFromForm({ need: NEED_NONE, ...note });
  else if (!form.bill) input = ruleFromForm({ need: NEED_REQUIRED, ...note });
  else {
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

/* ② โหมด — เก็บวันที่แตะไว้ (สลับกลับมารายเดือนแล้ววันเดิมยังอยู่) */
export const chooseBill = (form, bill) => ({ ...form, need: NEED_REQUIRED, bill });

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
 * @returns `{ need: 'unknown'|'legacy'|'none'|'required', noTiming, when, pay, note }` — อ่านจากรูปมาตรฐานของ lib เท่านั้น
 * ⚠️ ห้ามพูด "เครดิต 0 วัน" — เครดิต 0 = "วันเดียวกับวางบิล"
 */
export function policyWordsOf(value) {
  const rule = ruleOf(value);
  if (!rule) return { need: "unknown", noTiming: false, when: "", pay: "", note: "" };
  const note = rule.note || "";
  if (rule.legacyNoCredit) return { need: "legacy", noTiming: false, when: "", pay: "", note };
  if (rule.need === NEED_NONE) return { need: "none", noTiming: false, when: "", pay: "", note };
  if (!rule.billing) return { need: "required", noTiming: true, when: "", pay: "", note };
  const n = rule.creditDays;
  const credit = n > 0 ? `เครดิต ${n} วัน` : "";
  const { runs } = rule;
  const onlyPay = runs?.kind === "monthly" && payOnly(runs.rounds);
  let when;
  if (rule.billing.mode === "monthly") when = everyDays(rule.billing.days);
  else if (runs?.kind === "monthly" && !onlyPay) when = everyDays(runs.rounds.map((r) => r.cutoffDay));
  else if (runs?.kind === "calendar") {
    const years = Object.keys(runs.years).sort();
    when = `ตามปฏิทินลูกค้า ${years.join(", ")}`;
  } else when = "ทุกวัน";
  let pay;
  if (!runs) pay = credit || "วันเดียวกับวางบิล";
  else if (runs.kind === "calendar") pay = n > 0 ? `ครบเครดิต ${n} วันแล้วเข้ารอบจ่ายถัดไป` : "วันจ่ายของรอบเดียวกัน";
  else if (runs.kind === "weekday") pay = `${credit ? `${credit} แล้ว` : ""}จ่ายวัน${WEEKDAYS[runs.weekday]}ที่ ${runs.nths.map(nthWord).join(" และ ")} ของเดือน`;
  else if (onlyPay) pay = `${credit ? `${credit} แล้ว` : ""}จ่ายทุก${runs.rounds.map((r) => dayWord(r.payDay)).join(" และ ")}`;
  else {
    const rs = runs.rounds;
    pay = rs.length === 1
      ? `${dayWord(rs[0].payDay)} ${rs[0].payMonthOffset ? "เดือนถัดไป" : "เดือนเดียวกัน"}`
      : rs.map((r) => `${r.cutoffDay === MONTH_END_DAY ? "สิ้นเดือน" : r.cutoffDay} → ${r.payDay === MONTH_END_DAY ? "สิ้นเดือน" : r.payDay}${r.payMonthOffset ? " เดือนถัดไป" : ""}`).join(" · ");
    if (credit) pay = `${credit} + ${pay}`;
  }
  return { need: "required", noTiming: false, when, pay, note };
}

/* คำของประโยคระหว่างกรอก (ยังบันทึกไม่ได้) — ช่องที่ยังไม่ตอบ = '' (จอขึ้นคำถาม "เมื่อไร?") */
export function formWordsOf(form) {
  if (form.need === NEED_NONE) return { need: "none", noTiming: false, when: "", pay: "", note: "" };
  if (form.need === NEED_UNKNOWN) return { need: "unknown", noTiming: false, when: "", pay: "", note: "" };
  if (form.need !== NEED_REQUIRED) return { need: form.legacyNoCredit ? "legacy" : "ask", noTiming: false, when: "", pay: "", note: "" };
  if (!form.bill) return { need: "required", noTiming: true, when: "", pay: "", note: "" };
  const when = form.bill === "anyday" ? "ทุกวัน" : everyDays(form.days);
  let pay = "";
  if (form.pay === "same") pay = "วันเดียวกับวางบิล";
  else if (form.pay === "credit" && creditNumber(form.creditDays) !== null) pay = creditNumber(form.creditDays) === 0 ? "วันเดียวกับวางบิล" : `เครดิต ${creditNumber(form.creditDays)} วัน`;
  return { need: "required", noTiming: false, when, pay, note: "" };
}

/**
 * การเตือนที่ลูกค้านี้ได้ — ชิปบนการ์ด/กล่องผลของโมดัล · `[{ key, text, on }]`
 * ⭐ จาก `reminderKinds` ของ lib ตัวเดียวกับ cron · ⚠️ กระดิ่งวันตัดรอบ/ขอปฏิทิน (ช่วง 4b) ยังไม่มีในรอบนี้ ⇒ ไม่พูด
 * ⚠️ ไม่ต้องวางบิล = ไม่มีกระดิ่งวางบิล (เดิมการ์ดพูด "กระดิ่งเตือนก่อนถึงวันวางบิลเหมือนลูกค้าทุกราย" — ไม่จริงแล้ว)
 */
export function reminderChipsOf(value) {
  const words = policyWordsOf(value);
  const perInstallment = words.need === "unknown" || words.need === "legacy" || words.noTiming;
  const chips = reminderKinds(value)
    .filter((kind) => kind === BELL.BILLING_DUE || kind === BELL.DUE_SOON)
    .map((kind) => (kind === BELL.BILLING_DUE
      ? { key: kind, on: true, text: perInstallment ? "ถึงวันวางบิล (งวดที่ใส่วันไว้)" : `ถึงวันวางบิล 0–${BILLING_REMIND_DAYS} วัน` }
      : { key: kind, on: true, text: `ครบกำหนดชำระ 0–${DUE_REMIND_DAYS} วัน` }));
  if (words.need === "none") {
    chips.push({ key: "no-billing-bell", on: false, text: "ไม่มีเตือนวางบิล" }, { key: "no-billing-ask", on: false, text: "ไม่ชวนขอใบวางบิล" });
  }
  return chips;
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
/* บรรทัดอธิบายของงวดที่ระบบเสนอ */
export function changeTextOf(row) {
  if (row.change === "clearBilling") return `ล้างวันวางบิล ${fmtShort(row.prevBillingDate)} · คงกำหนดชำระ`;
  if (row.change === "addBilling") return `เพิ่มวันวางบิล ${fmtShort(row.billingDate)} (ถอยจากกำหนดชำระ)`;
  return `กำหนดชำระ ${fmtShort(row.prevDueDate)} → ${fmtShort(row.dueDate)}`;
}
/* เหตุที่ไม่แตะ */
export function keptTextOf(kept) {
  switch (kept.reason) {
    case "manual": return "แก้เองไว้ (ไม่ตรงกติกาเดิม) — ไม่แตะ";
    case "requested": return "ขอใบวางบิลแล้ว — แก้ผ่านคำร้อง";
    case "skip": return "ติ๊ก \"งวดนี้ไม่ต้องวางบิล\" — ไม่แตะ";
    case "locked": return kept.lock ? `ล็อกอยู่ — ${kept.lock}` : "ล็อกอยู่ — แก้วันไม่ได้";
    case "dueNotOnRound": {
      const pair = (p) => (p?.billingDate ? `${fmtShort(p.billingDate)} → ${fmtShort(p.dueDate)}` : NA);
      return `กำหนดชำระไม่ตรงวันจ่ายของลูกค้า — มีสองทาง ไม่เลือกให้ · เร็วกว่า ${pair(kept.earlier)} · ช้ากว่า ${pair(kept.later)}`;
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
