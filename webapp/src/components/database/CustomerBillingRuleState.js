// ── สถานะฟอร์มของโมดัล "เครดิตและรอบวางบิล" (รุ่นสอง · mig 0390 · มติเจ้าของ 26/09) ─────────────
//
// ตรรกะล้วน ไม่มี React — โมดัลเรียกทีละการกด · เทสต์ด้วย node --test (CustomerBillingRuleState.test.mjs)
// ⭐ ตัวตัดสินว่าบันทึกได้ไหม = `normalizeBillingRule` **ตัวเดียวกับ API** (ไม่ตรวจกติกาซ้ำที่นี่)
//    ไฟล์นี้ทำแค่: (1) รูปที่บันทึก ↔ ฟอร์ม (2) ผลของการกดแต่ละแบบ (3) ข้อความ "ขาดอะไร" ทุกช่องในครั้งเดียว
//    (4) วันที่ต้องปิดไม่ให้แตะ (กติกาข้ามช่อง "เงินเข้าก่อนวันวางบิลในเดือนเดียวกัน" — กันตั้งแต่ตอนเลือก)
// ⚠️ **ไม่มีค่าตั้งต้นให้การตัดสินใจ** (form-design-rules §2) — ฟอร์มว่าง = สวิตช์เครดิตไม่ติดทั้งสองฝั่ง ·
//    ชิปทางลัด "เครดิต 30/14 วัน" คือการกดของคน ไม่ใช่ค่าตั้งต้น · แตะข้อ ①② = ตอบ "มีเครดิต" ไปในตัว
//    (ทาง 3 แตะของ AR-267 ในม็อก: 5 → เดือนเดียวกัน → 25 ต้องไม่กลายเป็น 4 แตะเพราะสวิตช์)
//
// รูปฟอร์ม
//   credit     null | 'none' | 'yes'           สวิตช์ "เครดิต" บนสุด · none = { credit:false } ซ่อนที่เหลือ
//   billMode   null | 'anyday' | 'monthly'     ① วางบิล
//   billDays   [วันที่ เรียงน้อยไปมาก ≤4]       ① แตะวันที่ = เพิ่ม/ถอดรอบ (มติ 26/09 ข้อ 3: บางบริษัทมี 2 รอบ)
//   payMode    null | 'credit' | 'monthly'     ② เงินเข้า
//   creditDays สตริงที่แตะ/พิมพ์                ② เครดิต n วัน (ใช้กับทุกรอบ)
//   payRounds  [{ day, monthOffset }]           ② เงินเข้ารายรอบ — **คู่กับ billDays ทีละตัว** · ยาว max(1, billDays)
//              (วางบิลได้ทุกวัน = ใช้ตัวแรกตัวเดียว)
//   note       หมายเหตุการวางบิล (ไม่บังคับ · ใช้ได้ทั้งมี/ไม่มีเครดิต)
// ⚠️ ไม่อ่าน `rule.billing.day` / `rule.payment.day` รุ่นแรก — `billingRuleOf` แปลงเป็นรุ่นสองให้แล้ว
import {
  BILLING_ROUNDS_MAX, MONTH_END_DAY, billingRuleOf, normalizeBillingRule,
} from "@/lib/sales/billingRule";

const blankRound = () => ({ day: null, monthOffset: null });

export function blankForm() {
  return {
    credit: null,
    billMode: null,
    billDays: [],
    payMode: null,
    creditDays: "",
    payRounds: [blankRound()],
    note: "",
  };
}

/* รอบที่บันทึกไว้ → ฟอร์ม (รูปผิด/ยังไม่ตั้ง = ฟอร์มว่าง) */
export function formOf(value) {
  const rule = billingRuleOf(value);
  if (!rule) return blankForm();
  if (rule.credit === false) return { ...blankForm(), credit: "none", note: rule.note || "" };
  const billDays = rule.billing.mode === "monthly" ? [...rule.billing.days] : [];
  const count = Math.max(1, billDays.length);
  const payRounds = rule.payment.mode === "monthly"
    ? rule.payment.rounds.map((round) => ({ day: round.day, monthOffset: round.monthOffset }))
    : Array.from({ length: count }, blankRound);
  return {
    credit: "yes",
    billMode: rule.billing.mode,
    billDays,
    payMode: rule.payment.mode,
    creditDays: rule.payment.mode === "credit" ? String(rule.payment.days) : "",
    payRounds,
    note: rule.note || "",
  };
}

/* วางบิลรายเดือนมากกว่าหนึ่งรอบ — ข้อ ② แตกเป็นแถวรายรอบ */
export const isMultiRound = (form) => form.billMode === "monthly" && form.billDays.length > 1;

/**
 * เงินเข้ารายรอบที่ใช้จริงตามโหมดวางบิลตอนนี้ — `[{ billDay, day, monthOffset }]`
 * รายเดือนที่แตะวันแล้ว = หนึ่งตัวต่อวันวางบิล · ได้ทุกวัน/ยังไม่แตะวัน = ตัวแรกตัวเดียว (billDay null)
 */
export function roundsOf(form) {
  if (form.billMode === "monthly" && form.billDays.length) {
    return form.billDays.map((billDay, index) => ({ billDay, ...(form.payRounds[index] || blankRound()) }));
  }
  return [{ billDay: null, ...(form.payRounds[0] || blankRound()) }];
}

/* ฟอร์ม → ก้อนที่ส่งเข้า normalizeBillingRule (ตัวตรวจตัวเดียวกับ API) — ไม่ตรวจเองที่นี่ */
export function ruleInputOf(form) {
  if (form.credit === "none") return { credit: false, note: form.note };
  const billing = form.billMode === "anyday"
    ? { mode: "anyday" }
    : form.billMode === "monthly" ? { mode: "monthly", days: form.billDays } : null;
  const payment = form.payMode === "credit"
    ? { mode: "credit", days: form.creditDays }
    : form.payMode === "monthly"
      ? { mode: "monthly", rounds: roundsOf(form).map(({ day, monthOffset }) => ({ day, monthOffset })) }
      : null;
  return { billing, payment, note: form.note };
}

/* "รอบวันที่ 10" / "รอบสิ้นเดือน" — ชื่อรอบที่ตาเห็นบนแถวข้อ ② (ข้อความ error เรียกตามนี้) */
export const roundName = (billDay) => (billDay === MONTH_END_DAY ? "รอบสิ้นเดือน" : `รอบวันที่ ${billDay}`);
export const dayWord = (day) => (day === MONTH_END_DAY ? "สิ้นเดือน" : `วันที่ ${day}`);

/**
 * เงินเข้าเดือนเดียวกันแต่วันก่อนวันวางบิล (กติกาข้ามช่องของ normalizeBillingRule) — รอบแรกที่ผิด หรือ null
 * เกิดได้ทางเดียว: เลือกเงินเข้าไว้แล้วค่อยเปลี่ยนวันวางบิลทีหลัง (วันก่อนวันวางบิลถูกปิดไม่ให้แตะตั้งแต่ต้น)
 */
export function crossErrorOf(form) {
  if (form.credit !== "yes" || form.billMode !== "monthly" || form.payMode !== "monthly") return null;
  const rounds = roundsOf(form);
  const index = rounds.findIndex((r) => r.billDay != null && r.day != null && r.monthOffset === 0 && r.day < r.billDay);
  return index < 0 ? null : { index, billDay: rounds[index].billDay, payDay: rounds[index].day };
}

/* ช่องที่ยังไม่ได้ตอบ **ทั้งหมด** — ใช้เขียนข้อความของด่านเท่านั้น ไม่ใช่ตัวตัดสิน
   ⚠️ ด่านจริงคือ `normalizeBillingRule` (คืน error แรกตัวเดียว) · ตัวนี้มีเพราะกฎ "ด่านตรวจรวมข้อความเดียว
      บอกทุกช่องที่ขาดในครั้งเดียว" (form-design-rules §ช่องบังคับ) · ทุกช่องที่ลิสต์ ตัวตรวจตัวนั้นก็ปฏิเสธเสมอ
   ชื่อช่องเรียกตามที่ตาเห็นบนจอ ("1. วางบิล" · "2. เงินเข้า" · ชื่อรอบบนแถว) */
export function missingAnswersOf(form) {
  if (form.credit !== "none" && form.credit !== "yes") return ["เครดิต"];
  if (form.credit === "none") return [];
  const missing = [];
  if (!form.billMode) missing.push("1. วางบิล");
  else if (form.billMode === "monthly" && !form.billDays.length) missing.push("วันที่วางบิล");
  if (!form.payMode) missing.push("2. เงินเข้า");
  else if (form.payMode === "credit") {
    if (String(form.creditDays ?? "") === "") missing.push("จำนวนวันเครดิต");
  } else {
    const rounds = roundsOf(form);
    const multi = rounds.length > 1;
    for (const round of rounds) {
      const who = multi ? ` ${roundName(round.billDay)}` : "";
      if (round.day == null) missing.push(`วันที่เงินเข้า${who}`);
      if (round.monthOffset == null) missing.push(`เดือนที่เงินเข้า${who}`);
    }
  }
  return missing;
}

/**
 * ผลของฟอร์มตอนนี้ — `{ rule, error, missing, cross }`
 * `rule` = รูปที่จะบันทึก (null = ยังบันทึกไม่ได้) · ยังไม่แตะสวิตช์เครดิตเลย = บันทึกไม่ได้
 * (⚠️ ห้ามส่ง null เข้า normalize: null แปลว่า "ล้าง" ซึ่งผ่านเสมอ — ปุ่มล้างมีทางของมันเอง)
 */
export function evaluateForm(form) {
  if (form.credit !== "none" && form.credit !== "yes") {
    return { rule: null, error: "ยังไม่ได้เลือกว่าลูกค้ามีเครดิตไหม", missing: ["เครดิต"], cross: null };
  }
  const { rule, error } = normalizeBillingRule(ruleInputOf(form));
  return { rule, error, missing: error ? missingAnswersOf(form) : [], cross: crossErrorOf(form) };
}

/* ข้อความของด่าน (ขึ้นหลังกดบันทึกเท่านั้น — มติม็อก: ไม่เตือนก่อนผู้ใช้เริ่ม) */
export function gateMessageOf(result) {
  if (!result || result.rule) return "";
  if (result.cross) return "ยังบันทึกไม่ได้ — แก้ข้อ 2 ก่อน: เงินเข้าก่อนวันวางบิล";
  if (result.missing.length) return `ยังบันทึกไม่ได้ — ขาด ${result.missing.join(" · ")}`;
  return `ยังบันทึกไม่ได้ — ${result.error}`;
}

/* ── การกด ─────────────────────────────────────────────────────────────── */

export const chooseCredit = (form, credit) => ({ ...form, credit });

/* โหมดวางบิลจากแผ่นบน — เก็บวันที่แตะไว้เดิม (สลับกลับมารายเดือนแล้ววันเดิมยังอยู่) */
export const chooseBillMode = (form, billMode) => ({ ...form, credit: "yes", billMode });

/**
 * แตะวันที่ในตารางวางบิล = เพิ่ม/ถอดรอบ (เรียงเอง · สูงสุด 4)
 * · ตอนเป็น "ได้ทุกวัน" อยู่ แตะวัน = เปลี่ยนเป็นรายเดือนรอบเดียววันนั้น (วันเดิมที่จางอยู่ไม่ได้ถูกเลือกในสายตา)
 * · ⭐ รอบเดียวถอดแล้วแตะวันใหม่ = **คู่เงินเข้าเดิมตามไปด้วย** — ลูกค้าย้ายวันวางบิล 5 → 28 แต่เงินเข้า 25
 *   เดือนเดียวกันเหมือนเดิม ⇒ เห็นเหตุข้ามช่องพร้อมปุ่ม "เปลี่ยนเป็นเดือนถัดไป" ไม่ใช่เงินเข้าหายเงียบ
 * · รอบที่เพิ่มใหม่ยังไม่มีวันเงินเข้า · เดือนตามที่ทุกรอบเลือกไว้ตรงกัน (ข้อ ② "เดือนเดียวกัน/ถัดไป" ใช้กับทุกรอบ)
 * @returns `{ form, limited }` — limited = แตะรอบที่ 5 (ไม่เปลี่ยนอะไร · จอบอกเพดาน)
 */
export function toggleBillDay(form, day) {
  if (form.billMode !== "monthly") {
    return { form: { ...form, credit: "yes", billMode: "monthly", billDays: [day], payRounds: [form.payRounds[0] || blankRound()] }, limited: false };
  }
  const at = form.billDays.indexOf(day);
  if (at >= 0) {
    const billDays = form.billDays.filter((d) => d !== day);
    const payRounds = billDays.length
      ? form.payRounds.filter((_, index) => index !== at)
      : [form.payRounds[at] || blankRound()];
    return { form: { ...form, credit: "yes", billDays, payRounds }, limited: false };
  }
  if (form.billDays.length >= BILLING_ROUNDS_MAX) return { form, limited: true };
  if (!form.billDays.length) {
    return { form: { ...form, credit: "yes", billDays: [day], payRounds: [form.payRounds[0] || blankRound()] }, limited: false };
  }
  const billDays = [...form.billDays, day].sort((a, b) => a - b);
  const insertAt = billDays.indexOf(day);
  const offsets = new Set(form.payRounds.map((r) => r.monthOffset));
  const shared = offsets.size === 1 ? [...offsets][0] : null;
  const payRounds = [...form.payRounds];
  payRounds.splice(insertAt, 0, { day: null, monthOffset: shared });
  return { form: { ...form, credit: "yes", billDays, payRounds }, limited: false };
}

/* ข้อ ② [เครดิต | เดือนเดียวกัน | เดือนถัดไป] — ตัวที่ติดตอนนี้ (หลายรอบเดือนไม่ตรงกัน = ไม่ติดสักตัว) */
export function payChoiceOf(form) {
  if (form.payMode === "credit") return "credit";
  if (form.payMode !== "monthly") return null;
  const offsets = new Set(roundsOf(form).map((r) => r.monthOffset));
  if (offsets.size !== 1) return null;
  const [offset] = offsets;
  return offset === 0 ? "m0" : offset === 1 ? "m1" : null;
}

/* แตะ "เดือนเดียวกัน/ถัดไป" = เงินเข้ารายเดือน + ใช้เดือนนั้นกับ **ทุกรอบ** (แก้รายรอบต่อที่แถวได้) */
export function choosePay(form, choice) {
  if (choice === "credit") return { ...form, credit: "yes", payMode: "credit" };
  const monthOffset = choice === "m1" ? 1 : 0;
  return {
    ...form,
    credit: "yes",
    payMode: "monthly",
    payRounds: form.payRounds.map((round) => ({ ...round, monthOffset })),
  };
}

export const setCreditDays = (form, text) => ({
  ...form, credit: "yes", payMode: "credit", creditDays: String(text ?? "").replace(/\D/g, "").slice(0, 3),
});

/* ชิปทางลัด "เครดิต n วัน" = มีเครดิต + วางบิลได้ทุกวัน + เครดิต n วัน (แตะเดียวจบ) */
export const applyQuickCredit = (form, days) => ({
  ...form, credit: "yes", billMode: "anyday", payMode: "credit", creditDays: String(days),
});
export const quickCreditOn = (form, days) => form.credit === "yes" && form.billMode === "anyday"
  && form.payMode === "credit" && form.creditDays !== "" && Number(form.creditDays) === Number(days);

function patchRound(form, index, patch) {
  const payRounds = form.payRounds.map((round, i) => (i === index ? { ...round, ...patch } : round));
  return { ...form, credit: "yes", payMode: "monthly", payRounds };
}
export const setPayDay = (form, index, day) => patchRound(form, index, { day });
export const setRoundMonth = (form, index, monthOffset) => patchRound(form, index, { monthOffset });

/* ปุ่มแก้แตะเดียวใต้ข้อ ② — เปลี่ยนรอบที่ผิดเป็นเดือนถัดไป */
export function fixCrossError(form) {
  const cross = crossErrorOf(form);
  return cross ? setRoundMonth(form, cross.index, 1) : form;
}

/* ── วันที่ที่ต้องปิดในตารางเงินเข้า ─────────────────────────────────────────
   เดือนเดียวกัน + วันก่อนวันวางบิลของรอบนั้น = ปิด (ตัวที่เลือกค้างไว้ = ขึ้นแดง ไม่ปิด ให้เห็นว่าผิดตรงไหน)
   `isBill` = ขีดใต้วันวางบิลของรอบนั้น (บอกว่าเส้นแบ่งอยู่ตรงไหน) */
export function payDayState(round, day) {
  const gated = round?.monthOffset === 0 && round?.billDay != null;
  const blocked = gated && day < round.billDay;
  return {
    blocked: blocked && round.day !== day,
    invalid: blocked && round.day === day,
    isBill: gated && round.billDay === day,
  };
}

/* "เดือนเดียวกัน" ของรอบนี้จะผิด (วันเงินเข้าที่เลือกไว้มาก่อนวันวางบิล) — ปิดตัวเลือกพร้อมบอกเหตุ */
export const roundSameMonthBlocked = (round) => round?.billDay != null && round?.day != null
  && round.day < round.billDay && round.monthOffset !== 0;

/* "เดือนเดียวกัน" บนแถบข้อ ② (ใช้กับทุกรอบ) จะทำให้รอบไหนผิด — ปิดเมื่อยังไม่ได้ติดอยู่ */
export function sameMonthBlocked(form) {
  if (form.billMode !== "monthly" || payChoiceOf(form) === "m0") return false;
  return roundsOf(form).some((round) => round.billDay != null && round.day != null && round.day < round.billDay);
}

/* รอบถัดไปที่ยังไม่มีวันเงินเข้า (โมดัลย้ายตารางไปรอบนั้นเองหลังแตะวัน) · ครบแล้ว = -1 */
export function nextRoundNeedingDay(form, after = -1) {
  const rounds = roundsOf(form);
  for (let step = 1; step <= rounds.length; step += 1) {
    const index = (after + step) % rounds.length;
    if (rounds[index].day == null) return index;
  }
  return -1;
}

/* รอบที่ตารางวันเงินเข้า (ใช้ร่วมกันทุกรอบ · ชี้ด้วยตำแหน่ง) ควรชี้ หลังแตะวันวางบิลในข้อ ① (เพิ่ม/ถอดรอบ)
   ⚠️ ถอดรอบที่อยู่ **ก่อน** รอบที่เลือก = ตำแหน่งของรอบที่เลือกเลื่อนลงหนึ่ง ⇒ ต้องเลื่อนตาม
      ของเดิมแค่หนีบไม่ให้เกินจำนวนรอบ ⇒ ตารางสลับไปแก้อีกรอบเงียบ ๆ (แตะ 25 ทีหลังไปลงรอบผิด)
   · ถอดรอบที่อยู่หลัง = รอบที่เลือกอยู่ที่เดิม · ถอดรอบที่เลือกเอง = ไปรอบที่ยังขาดวัน (ไม่มี = รอบที่มาแทนตำแหน่งเดิม)
   · เพิ่มรอบ = ไปรอบที่ยังขาดวัน (รอบใหม่ยังไม่มีวันเงินเข้าเสมอ) · ไม่มีรอบขาด = ตามรอบเดิมไป */
export function activeRoundAfterToggle(prev, next, day, active) {
  const count = roundsOf(next).length;
  if (count <= 1) return 0;
  const current = Math.max(0, Math.min(active, roundsOf(prev).length - 1));
  const removedAt = prev.billMode === "monthly" && !next.billDays.includes(day) ? prev.billDays.indexOf(day) : -1;
  if (removedAt >= 0) {
    if (removedAt < current) return current - 1;
    if (removedAt > current) return Math.min(current, count - 1);
    const waiting = nextRoundNeedingDay(next);
    return waiting >= 0 ? waiting : Math.min(current, count - 1);
  }
  const waiting = nextRoundNeedingDay(next);
  if (waiting >= 0) return waiting;
  const addedAt = next.billDays.indexOf(day);
  return Math.min(addedAt >= 0 && addedAt <= current ? current + 1 : current, count - 1);
}
