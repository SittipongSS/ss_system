// ── วันของงวดจากหน้าสร้างใบสั่งขาย — กำหนดชำระ + วันวางบิล/รอเหตุการณ์ + ติ๊กไม่ต้องวางบิล (mig 0389 · 0393) ──
//
// สองฝั่งของเส้นเดียว: หน้า `/sa/sales-orders/new` ประกอบแถว → POST `/api/sales-planning/sales-orders`
// ตรวจแถวก่อนออกเลขใบ → `applyCreateFormPayments` (salesOrderCreatePayments.js) เขียนลงงวดร่างตาม `seq`
// + กติกาของลูกค้าที่หน้าใช้เปิดตัวแก้ มากับ GET ใบเสนอราคา (`loadCreateFormBillingTerms` · ท้ายไฟล์)
//
// ⭐ รุ่นสี่ (มติเจ้าของ 29/09 แบบ A · "ต้องวางบิลไหม") — หน้าสร้าง **ถอด BillingRoundPicker** แล้วใช้ตัวแก้วันงวดตัวเดียวกับใบ SO
//   (`InstallmentDateEditor variant="inline"` + `useInstallmentDateMode({ create: true })` · AGENTS.md: สร้าง/แก้ใช้ตัวเดียว)
//   ⇒ ค่าต่องวดคือรูปของร่าง `{ billingDate, billingEvent, dueDate, billingSkip }` (installmentDateDrafts.js) — ไม่มีสถานะ
//     "เลือกครึ่งทาง" อีกแล้ว (ตัวแก้ลงร่างเฉพาะค่าที่ครบ) ⇒ ไม่มีด่าน "ยังไม่ได้ใส่วันวางบิล" แบบตัวเลือกเดิม
//   · **ไม่บังคับ** (มติ 26/09) — งวดที่ไม่ตั้งไม่ถูกส่ง = งวดร่างว่างแบบเดิม
//   · ด่านเขียนตัวเดียวกับ API (`validateInstallmentDates` ด้วยงวดใหม่ `{}` + กติกาของลูกค้า) — ลูกค้าไม่ต้องวางบิลส่งวันวางบิลไม่ได้ ·
//     รอเหตุการณ์ไม่มีกำหนดชำระ · ติ๊กคู่วันวางบิลไม่ได้ · ปีพิมพ์พลาด (ด่านบนจอเท่ากับ POST)
//   · กติกาไม่รู้ (`createFormTermsKind` 'error' / 'off' — โหลดไม่ขึ้น · ใบไม่ผูกลูกค้า · ฐานยังไม่รัน 0389) = กำหนดชำระอย่างเดียวแบบเดิม
//     ไม่มีคำ "ลูกค้ายังไม่ระบุ…" (review 28/09)
// ⚠️ ตัวคิดวันอยู่ที่ billingRule.js — ไฟล์นี้แค่ต่อสาย · วันวางบิลกับรอเหตุการณ์ไม่มาคู่กัน (CHECK ของ mig 0389)
import {
  NO_BILLING_WRITE_ERROR, NO_TIMING_TEXT, UNKNOWN_TEXT, billingNeed, describeRule, hasTiming, normalizeInstallmentBilling, ruleOf,
  slotCount, validateInstallmentDates,
} from './billingRule.js';
import { datesOf } from './installmentDateDrafts.js';
import { probeBillingSkip } from './billingPolicySchema.js';
import { canEditCustomerBillingRule } from '../permissions.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MIN = '2000-01-01';
const YEAR_MAX = '2100-12-31';

/* ตรวจวันที่ 1 ช่อง — `{ iso: '' }` = ไม่ได้ส่ง · `{ iso }` = ใช้ได้ · `{ problem: 'invalid' | 'year', year }` = ผิด
   ⚠️ regex อย่างเดียวไม่พอ: '2026-02-31' ผ่าน regex แต่ฐานตอบ 22008 ⇒ ใบออกแล้วแต่งวดไม่ได้วัน
      (กลายเป็นคำเตือนหลัง 201) · ตรวจด้วยเลขคณิต UTC ไม่ใช่ toISOString (ด่าน check:thaitime)
   ⚠️ ปีนอกช่วงที่ CHECK `dates_sane` (0245) / `billing` (0389) รับ แยกเป็น 'year' — พิมพ์ปีพลาด (2202 · ปี พ.ศ. 2569
      ในช่อง ค.ศ.) เป็นเหตุที่เจอบ่อยที่สุด ข้อความต้องชี้ที่ปี ไม่ใช่ "ไม่ใช่วันที่" กว้าง ๆ (review S4 26/09) */
function dateCheck(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { iso: '' };
  if (!ISO_DATE.test(raw)) return { problem: 'invalid' };
  const [year, month, day] = raw.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return { problem: 'invalid' };
  }
  if (raw < YEAR_MIN || raw > YEAR_MAX) return { problem: 'year', year };
  return { iso: raw };
}

/* ข้อความของวันที่ผิด 1 ช่อง — `field` = ชื่อช่องที่คนเห็นบนจอ */
function dateProblemText(check, field, seq) {
  if (check.problem === 'year') return `ปีของ${field}งวด ${seq} ผิด (${check.year}) — ตรวจปี ค.ศ. อีกครั้ง`;
  return `${field}ของงวด ${seq} ไม่ใช่วันที่ที่ถูกต้อง`;
}

/**
 * สถานะกติกาของลูกค้าบนหน้าสร้าง — **ตัวตัดสินเดียว** ของคำใต้ตาราง และว่าตัวแก้มีช่องวันวางบิลไหม
 *   'rule'  = ตอบแล้ว (ไม่ต้องวางบิล · ต้องวางบิล · รูปเดิม · รุ่นสอง) → ตัวแก้ตาม `dateModeOf`
 *   'unset' = โหลดขึ้น · ฐานรองรับ · ลูกค้ายังไม่ระบุจริง → ตัวแก้แบบ free (กำหนดชำระนำ · วันวางบิลไม่บังคับ)
 *   'error' = โหลดไม่ขึ้น → กำหนดชำระอย่างเดียวแบบเดิม (แถบเหนือตารางบอกเหตุ + ลองใหม่อยู่แล้ว)
 *   'off'   = ใบไม่ผูกลูกค้า · ฐานยังไม่รัน 0389 · ไม่เจอแถวลูกค้า → กำหนดชำระอย่างเดียวแบบเดิม
 * 🐞 review 28/09: เดิมถามแค่ "มีรอบไหม" ⇒ โหลดไม่ขึ้น/ใบไม่ผูกลูกค้า ก็ขึ้น "ลูกค้ายังไม่ตั้งกำหนดวางบิล" (ไม่จริง — ไม่รู้ต่างหาก)
 * @param terms สถานะจาก `createFormTermsState` (null = ใบไม่ผูกลูกค้า)
 */
export function createFormTermsKind(terms) {
  if (terms?.status === 'error') return 'error';
  if (terms?.status !== 'ready' || terms.supported !== true) return 'off';
  return ruleOf(terms.rule) ? 'rule' : 'unset';
}

/**
 * บรรทัดใต้ตารางงวดของหน้าสร้าง — บอกว่าตัวแก้ทำงานอย่างไร **ตามคำตอบของลูกค้า** (ตัวเดียวทุกแบบ · ห้ามพูด "เครดิต 0 วัน")
 * · ไม่รู้กติกา (`termsKind` 'error' / 'off') = ห้ามพูด "ลูกค้ายังไม่ระบุ…" — 'error' = '' (แถบเหนือตารางบอกเหตุแล้ว) · 'off' = ประโยคกลาง
 * @param value กติกาของลูกค้า (ดิบได้) · @param termsKind 'unset' (ค่าตั้งต้น) | 'rule' | 'error' | 'off'
 * @returns ข้อความ หรือ '' (ผู้เรียกไม่วาดบรรทัด)
 */
export function createFormPlanNote(value, { termsKind = 'unset' } = {}) {
  const later = 'ไม่ตั้งก็สร้างใบได้ — ตั้งภายหลังได้ที่การ์ด “การชำระ” บนใบ';
  if (termsKind === 'error') return '';
  if (termsKind === 'off') return `กรอกกำหนดชำระเองได้ · ${later}`;
  const rule = ruleOf(value);
  if (!rule) return `${UNKNOWN_TEXT} — แตะช่องกำหนดชำระเพื่อตั้งได้เลย วันวางบิลไม่บังคับ (ระบบไม่คิดให้) · ${later}`;
  if (billingNeed(rule) === 'none') return `ลูกค้าไม่ต้องวางบิล — ตั้งกำหนดชำระรายงวด (หรือรอเหตุการณ์) · ${later}`;
  if (rule.legacyNoCredit) {
    return `ลูกค้ายังเป็นรูปเดิม “ไม่มีเครดิต” (ยังไม่ระบุว่าต้องวางบิลไหม) — ตั้งกำหนดชำระได้เลย วันวางบิลไม่บังคับ · ${later}`;
  }
  if (!hasTiming(rule)) return `${NO_TIMING_TEXT} — ใส่วันวางบิลเองรายงวด กำหนดชำระไม่คิดให้ · ${later}`;
  if (slotCount(rule) > 0) {
    return `ตัวแก้เสนอรอบถัดไปของลูกค้า · แตะรอบเดียวได้ทั้งวันวางบิลและกำหนดชำระ · แก้กำหนดชำระทับรายงวดได้ · ${later}`;
  }
  if (rule.creditDays === 0) return `ลูกค้าชำระวันวางบิล — ใส่วันวางบิล กำหนดชำระเป็นวันเดียวกัน · ${later}`;
  return `ลูกค้าวางบิลได้ทุกวัน · เครดิต ${rule.creditDays} วัน — ใส่วันวางบิล ระบบคิดกำหนดชำระ (+${rule.creditDays} วัน) ให้ · ${later}`;
}

/* ประโยคกติกาของลูกค้าบนแถบเหนือตาราง — '' = ยังไม่ระบุ (ผู้เรียกพูดเอง) */
export const createFormRuleText = (value) => describeRule(value);

/**
 * แถวที่หน้าสร้างส่งขึ้น POST — `[{ seq, dueDate, billingDate, billingEvent, billingSkip? }]`
 * · ค่าต่องวด = ร่างของตัวแก้ (`datesOf` · รูปเดียวกับโหมดตั้งวันของใบ) · เฉพาะงวดที่มีค่าอย่างน้อยหนึ่งช่อง (ไม่ตั้ง = ไม่ส่ง)
 * · `billingSkip` ส่งเฉพาะที่ติ๊ก **และฐานรัน 0393 แล้ว** (`skipReady`) — ก่อนนั้นคีย์นี้ลงฐานไม่ได้
 * · `billingOn` เท็จ (ไม่รู้กติกา / ฐานยังไม่รัน 0389) = กำหนดชำระอย่างเดียว — ค่าที่มองไม่เห็นในตารางต้องไม่หลุดไปกับใบ
 * @param planned     งวดตามแผนของ QT (`previewInstallments`) — ใช้แค่ `seq`
 * @param valuesBySeq `{ [seq]: { billingDate, billingEvent, dueDate, billingSkip } }`
 */
export function createFormInstallmentItems(planned = [], valuesBySeq = {}, { skipReady = false, billingOn = true } = {}) {
  return (planned || [])
    .map((row) => {
      const v = datesOf(valuesBySeq?.[row.seq]);
      const item = {
        seq: row.seq,
        dueDate: v.dueDate || null,
        billingDate: billingOn ? v.billingDate || null : null,
        billingEvent: billingOn && !v.billingDate ? v.billingEvent || null : null,
      };
      if (billingOn && skipReady && v.billingSkip && !v.billingDate) item.billingSkip = true;
      return item;
    })
    .filter((item) => item.dueDate || item.billingDate || item.billingEvent || item.billingSkip);
}

/* ตรวจค่าของงวดเดียว (ไม่รวม seq) — `{ patch, error }` · ตัวเดียวกันทั้ง POST และด่านก่อนกดบนจอ
   `gate` = `{ rule, ruleUnavailable }` → ด่านเขียนรุ่นสี่ `validateInstallmentDates({}, …)` (งวดใหม่) · ไม่ส่ง = ตรวจรูปอย่างเดียว */
/* ข้อความของหน้าสร้าง — หน้าสร้าง (จอ + POST ตัวเดียวกัน) ไม่มี "งวดนี้ต้องวางบิล…" (ยืนยันรายงวดทำที่แท็บการชำระหลังออกใบ) ⇒ ประโยคของ API ที่ชี้ไปเมนูนั้น
   = ทางตันบนหน้านี้ · บอกทางที่ทำได้จริงแทน (review 29/09) */
export const CREATE_NO_BILLING_ERROR = 'ลูกค้ารายนี้ไม่ต้องวางบิล — กด "ล้างวันวางบิล" ของงวดนี้ก่อนสร้างใบ (ถ้าลูกค้าขอใบวางบิลงวดนี้ ตั้ง "งวดนี้ต้องวางบิล…" ที่แท็บการชำระหลังสร้างใบ)';

function checkItemDates(item, seq, gate = null) {
  const due = dateCheck(item?.dueDate);
  if (due.problem) return { patch: null, error: dateProblemText(due, 'กำหนดชำระ', seq) };
  const bill = dateCheck(item?.billingDate);
  if (bill.problem) return { patch: null, error: dateProblemText(bill, 'วันวางบิล', seq) };
  const billing = normalizeInstallmentBilling({ billingDate: bill.iso || null, billingEvent: item?.billingEvent });
  if (billing.error) return { patch: null, error: `งวด ${seq}: ${billing.error}` };
  const billingSkip = item?.billingSkip === true;
  if (gate) {
    const next = {
      billingDate: billing.value.billingDate, billingEvent: billing.value.billingEvent, dueDate: due.iso || null,
      billingSkip, billingException: item?.billingException === true,
    };
    const problem = validateInstallmentDates({}, next, gate.rule ?? null, { ruleUnavailable: Boolean(gate.ruleUnavailable) });
    if (problem) return { patch: null, error: `งวด ${seq}: ${problem === NO_BILLING_WRITE_ERROR ? CREATE_NO_BILLING_ERROR : problem}` };
  }

  const patch = {};
  if (due.iso) patch.dueDate = due.iso;
  if (billing.value.billingDate) patch.billingDate = billing.value.billingDate;
  if (billing.value.billingEvent) patch.billingEvent = billing.value.billingEvent;
  /* ติ๊ก "งวดนี้ไม่ต้องวางบิล" (0393) — เก็บ true เท่านั้น (null = ตามลูกค้า) · ไม่ติ๊ก = ไม่มีคีย์ (ฐานก่อน 0393 ไม่เจอคีย์นี้) */
  if (billingSkip) patch.billingSkip = true;
  return { patch, error: null };
}

/**
 * ตรวจแถวที่ POST รับมา **ก่อนออกเลขใบ** — คืน `{ rows: [{ seq, patch, billingException? }], error }`
 * ⭐ ตรวจก่อน RPC เพราะเลขใบใช้ซ้ำไม่ได้ (0241): ค่าผิดต้องตอบ 400 ตั้งแต่ยังไม่มีใบ
 *    ไม่ใช่ออกใบแล้วค่อยกลายเป็นคำเตือนหลัง 201 (เดิมค่าผิดถูกข้ามเงียบ ๆ)
 * ⭐ รุ่นสี่: ส่ง `{ rule, ruleUnavailable }` (กติกาที่ server อ่านเอง) = ด่านเขียนตัวเดียวกับ schedule-many (`validateInstallmentDates`
 *    ด้วยงวดใหม่ `{}`) · อ่านกติกาพลาด = `ruleUnavailable` (ตีกลับเฉพาะวันวางบิล/ติ๊ก · กำหนดชำระผ่าน — ไม่ใช่ 500)
 *    · `billingException` (โมดัล "งวดนี้ต้องวางบิล…" — หน้าสร้างไม่มีทางนี้วันนี้) ไม่เก็บลงฐาน · คืนแยกให้ route ลงประวัติ
 * · `patch` มีเฉพาะช่องที่มีค่า — แถวร่างเพิ่งเกิด ช่องที่ไม่ส่งเป็น null อยู่แล้ว
 *   และฐานที่ยังไม่รัน 0389 ไม่เจอคีย์วันวางบิลเลยถ้าหน้าไม่ได้ส่งมา (ลูกค้าไม่มีรอบ = ไม่มีวันวางบิล)
 * · ไม่ส่งมา/อาร์เรย์ว่าง = ไม่มีอะไรต้องเขียน (ไม่บังคับ)
 */
export function parseCreateFormInstallments(input, options = {}) {
  if (input === undefined || input === null) return { rows: [], error: null };
  if (!Array.isArray(input)) return { rows: [], error: 'รูปแบบวันของงวดชำระไม่ถูกต้อง' };
  const gate = options && Object.hasOwn(options, 'rule')
    ? { rule: options.rule, ruleUnavailable: options.ruleUnavailable } : null;
  const seen = new Set();
  const rows = [];
  for (const item of input) {
    const seq = Number(item?.seq);
    if (!Number.isInteger(seq) || seq < 1) return { rows: [], error: 'ลำดับงวดชำระไม่ถูกต้อง' };
    if (seen.has(seq)) return { rows: [], error: `งวด ${seq} ถูกส่งมาซ้ำ` };
    seen.add(seq);
    const { patch, error } = checkItemDates(item, seq, gate);
    if (error) return { rows: [], error };
    if (!Object.keys(patch).length) continue;
    rows.push(item?.billingException === true && patch.billingDate ? { seq, patch, billingException: true } : { seq, patch });
  }
  return { rows, error: null };
}

/**
 * ด่านก่อนกด "สร้างใบสั่งขาย" ฝั่งวันที่ — ตัวตรวจเดียวกับ POST บนแถวชุดเดียวกับที่จะส่ง
 * 🐞 เดิมปีพิมพ์พลาด (2202) ผ่านจอไปถึง POST หลังอัปไฟล์เสร็จ ⇒ 400 แล้วไฟล์ที่อัปถูกลบทิ้ง · ข้อความก็ไม่บอกว่าผิดที่ปี
 * ⭐ รู้กติกา (`rule` ไม่ใช่ undefined) = ด่านเขียนรุ่นสี่ด้วย (เท่ากับที่ POST ตรวจด้วยกติกาที่ server อ่าน)
 * คืน `{ error, invalidSeqs }` — `error` ข้อความแรกที่เจอ ('' = ผ่าน) · `invalidSeqs` งวดที่ช่องวันต้องขึ้นขอบแดง
 */
export function createFormDateCheck(planned = [], valuesBySeq = {}, { rule, skipReady = false, billingOn = true } = {}) {
  const items = createFormInstallmentItems(planned, valuesBySeq, { skipReady, billingOn });
  const gate = rule === undefined ? null : { rule };
  const invalidSeqs = new Set();
  let error = '';
  for (const item of items) {
    const result = checkItemDates(item, item.seq, gate);
    if (!result.error) continue;
    invalidSeqs.add(item.seq);
    error = error || result.error;
  }
  return { error, invalidSeqs };
}

/* ── รอบวางบิล + เงื่อนไขเครดิตของลูกค้า ให้หน้าสร้าง (GET ใบเสนอราคา `?include=billingTerms`) ──────────
   ⭐ อ่านแถวลูกค้าแถวเดียว 4 คอลัมน์ — เดิมหน้าอ่าน `GET /api/customers/[id]` ทั้งก้อน ซึ่งลากสินค้าทั้งหมด + ออเดอร์สรรพสามิต
      พร้อมทะเบียนของลูกค้ามาด้วย (หนัก + กิน egress) แถมมาทีหลังใบ ⇒ ตารางงวดโชว์ช่องกำหนดชำระแบบเดิมก่อน
      แล้วค่อยสลับเป็นตัวเลือกรอบ (review S4 26/09) · มากับใบในคำขอเดียว = ไม่มีจังหวะสลับ
   ⚠️ ฐานที่ยังไม่รัน 0389 ไม่มีคอลัมน์ `billingRule` ⇒ PostgREST ตอบ 42703 ⇒ อ่านชุดเดิม + `supported: false`
      = หน้าเหมือนเดิมทุกอย่าง ไม่ชวนไป "ตั้งรอบ" ที่ทะเบียนยังรับไม่ได้ (แพตเทิร์นเดียวกับ loadListInstallments)
   ⚠️ อ่านไม่ขึ้น = `{ error }` ไม่ใช่โยน — ใบยังเปิดได้ จอบอกเหตุ + ลองใหม่ (รอบเป็นตัวช่วย ไม่ใช่ด่าน · มติข้อ 7)
   ⚠️ select เขียนเป็นสตริงตรงสองชุดโดยเจตนา — check:columns อ่านสตริงในวงเล็บได้ ตัวแปรมันแกะไม่ออก (แดง) */
export async function loadCreateFormBillingTerms(supabase, customerId, { user = null } = {}) {
  if (!customerId) return null;
  let supported = true;
  /* + ตัวล็อกของกติกา (`billingRuleUpdatedAt` ดิบ) + ทีมของลูกค้า — แถบ "ต้องวางบิลไหม" บนหน้าสร้างตอบผ่านเส้นเดียวกับทะเบียนลูกค้า */
  let { data, error } = await supabase
    .from('customers')
    .select('id, "arCode", team, teams, "creditTerms", "billingRule", "billingRuleUpdatedAt"')
    .eq('id', customerId)
    .maybeSingle();
  if (error?.code === '42703') {
    supported = false;
    ({ data, error } = await supabase
      .from('customers')
      .select('id, "arCode", "creditTerms"')
      .eq('id', customerId)
      .maybeSingle());
  }
  if (error) return { error: error.message || String(error.code || 'อ่านทะเบียนลูกค้าไม่สำเร็จ') };
  /* ฐานรัน 0393 แล้วไหม (ติ๊ก "งวดนี้ไม่ต้องวางบิล" · กติการุ่นสี่) — ถามเฉพาะเมื่อเส้นนี้ใช้ได้ (ธงเดียว `billingSkipReady`) */
  const billingSkipReady = supported && Boolean(data) ? (await probeBillingSkip(supabase)).ready : false;
  return {
    // ไม่เจอแถว (ลูกค้าถูกลบ/รวมการ์ด) = ไม่มีอะไรให้ชวนตั้ง — เหมือนฐานที่ยังไม่รองรับ
    supported: supported && Boolean(data),
    /* ⭐ ค่าดิบ (รุ่นสี่) — ห้ามผ่าน `billingRuleOf` (ตัวอ่านรุ่นสอง: รุ่นสี่กลายเป็น null = "ยังไม่ระบุ" เงียบ ๆ · contracts §1) */
    billingRule: supported ? (data?.billingRule ?? null) : null,
    billingSkipReady,
    /* ตัวล็อกดิบ (ห้ามแปลงผ่าน Date) + ใครตอบ "ต้องวางบิลไหม" ได้ — ตัวตัดสินเดียวกับ API (`canEditCustomerBillingRule`) ·
       ผู้เรียกไม่ส่ง `user` = ไม่มีสิทธิ์ (แถบอ่านอย่างเดียว — ไม่เปิดปุ่มที่ API จะตีกลับ) */
    billingRuleUpdatedAt: supported ? (data?.billingRuleUpdatedAt ?? null) : null,
    canEditBillingRule: Boolean(supported && data && user && canEditCustomerBillingRule(user, data)),
    creditTerms: String(data?.creditTerms ?? '').trim(),
    arCode: String(data?.arCode ?? '').trim(),
  };
}

/* ก้อน `billingTerms` จาก API → สถานะของหน้า (`null` = ใบไม่ผูกลูกค้า/ไม่ได้ขอ = ไม่มีแถบ)
   `{ status: 'ready', supported, rule, billingSkipReady, creditTerms, arCode }` · `{ status: 'error', detail }`
   ⭐ `rule` = **ค่าดิบ** ของทะเบียน (รุ่นสี่ · รูปเดิม { credit:false } · รุ่นสอง/หนึ่ง) — ทุกตัวถามของ billingRule.js รับได้
     (`dateModeOf` · `describeRule` · ตัวอ่านรุ่นสองของวิซาร์ดใบย้อนหลังก็ยังรับรูปเดิมตรงตัว) · รูปผิด = null (ยังไม่ระบุ)
   · `billingSkipReady` = ฐานรัน 0393 แล้ว (ติ๊ก "งวดนี้ไม่ต้องวางบิล" ส่งได้)
   · `creditTerms` = ข้อความเครดิตเดิม (ช่องอิสระที่ถอดจากฟอร์มลูกค้าแล้ว · อ่านอย่างเดียว) */
export function createFormTermsState(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.error) return { status: 'error', detail: String(payload.error) };
  const raw = payload.billingRule ?? null;
  return {
    status: 'ready',
    supported: Boolean(payload.supported),
    rule: ruleOf(raw) ? raw : null,
    billingSkipReady: payload.billingSkipReady === true,
    billingRuleUpdatedAt: payload.billingRuleUpdatedAt ?? null,
    canEditBillingRule: payload.canEditBillingRule === true,
    creditTerms: String(payload.creditTerms ?? '').trim(),
    arCode: String(payload.arCode ?? '').trim(),
  };
}
