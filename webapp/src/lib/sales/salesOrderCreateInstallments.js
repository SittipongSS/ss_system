// ── วันของงวดจากหน้าสร้างใบสั่งขาย — กำหนดชำระ + วันวางบิล/รอเหตุการณ์ (mig 0389 · ม็อก billing-cycle จอ B) ──
//
// สองฝั่งของเส้นเดียว: หน้า `/sa/sales-orders/new` ประกอบแถว → POST `/api/sales-planning/sales-orders`
// ตรวจแถวก่อนออกเลขใบ → `applyCreateFormPayments` (salesOrderCreatePayments.js) เขียนลงงวดร่างตาม `seq`
// + รอบวางบิลของลูกค้าที่หน้าใช้เปิดตัวเลือก มากับ GET ใบเสนอราคา (`loadCreateFormBillingTerms` · ท้ายไฟล์)
//
// มติเจ้าของ 25–26/09/2026:
//   · ลูกค้าที่ตั้งรอบวางบิลแล้ว = แต่ละงวดแตะเลือกรอบ (BillingRoundPicker) ได้ทั้งวันวางบิลและกำหนดชำระ
//   · **ไม่บังคับเลือก** (รอบสาม ข้อ 2 "บางที่ไม่มีรอบวาง") — งวดที่ไม่เลือกไม่ถูกส่ง = งวดร่างว่างแบบเดิม
//   · ลูกค้าที่ยังไม่ตั้งรอบ = ช่องกำหนดชำระแบบเดิม (ค่าอยู่ในรูปเดียวกัน: mode null + dueDate)
// ⚠️ ตัวคิดวัน/ตัวตัดสินว่า "เลือกครบไหม" อยู่ที่ billingPicker.js + billingRule.js — ไฟล์นี้แค่ต่อสาย
// ⚠️ วันวางบิลกับรอเหตุการณ์ไม่มาคู่กัน (CHECK ของ mig 0389) — ตรวจด้วย `normalizeInstallmentBilling` ตัวเดียวกับทุกเส้น
import { billingRuleOf, normalizeInstallmentBilling } from './billingRule.js';
import { EMPTY_PICKER_VALUE, normalizePickerValue, pickerMissing, pickerPayload } from './billingPicker.js';

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

const rowName = (row) => `งวด ${row.seq}${row.label ? ` ${row.label}` : ''}`;

/**
 * ค่าของงวดตาม **สิ่งที่ตาเห็นบนจอ** — ลูกค้าไม่มีรอบ (หรือรอบถูกล้างจากอีกแท็บ) ตารางเหลือแค่ช่องกำหนดชำระ
 * ⇒ วันวางบิล/เหตุการณ์ที่ค้างใน state จากตอนยังมีรอบ **ต้องไม่ถูกส่ง และต้องไม่ถูกด่านกัน**
 * 🐞 ไม่งั้น: เลือก "วันอื่น…" ไว้แล้วรอบถูกล้าง ⇒ ปุ่มสร้างติด "ยังไม่ได้ใส่วันวางบิล" โดยไม่มีตัวเลือกให้แก้ (ทางตัน)
 *    หรือวันวางบิลที่มองไม่เห็นหลุดไปกับใบ · state เดิมไม่ถูกแตะ — รอบกลับมา ค่าที่เลือกไว้ก็กลับมาครบ
 * @param valuesBySeq `{ [seq]: pickerValue }` · @param withRule ตารางกำลังโชว์ตัวเลือกรอบอยู่ไหม
 */
export function createFormVisibleValues(valuesBySeq = {}, { withRule = false } = {}) {
  if (withRule) return valuesBySeq || {};
  const out = {};
  for (const [seq, value] of Object.entries(valuesBySeq || {})) {
    out[seq] = { ...EMPTY_PICKER_VALUE, dueDate: normalizePickerValue(value).dueDate };
  }
  return out;
}

/**
 * แถวที่หน้าสร้างส่งขึ้น POST — `[{ seq, dueDate, billingDate, billingEvent }]`
 * · เฉพาะงวดที่มีค่าอย่างน้อยหนึ่งช่อง (ไม่เลือกอะไร = ไม่ส่ง · พฤติกรรมเดิมของฟอร์มที่ส่งแค่งวดที่มีวัน)
 * · ค่าต่องวดผ่าน `pickerPayload` เท่านั้น — ชื่อเหตุการณ์ที่ค้างจากตอนสลับไปแตะรอบต้องไม่หลุดไปด้วย
 * @param planned     งวดตามแผนของ QT (`previewInstallments`) — ใช้แค่ `seq`
 * @param valuesBySeq `{ [seq]: pickerValue }` (ดู billingPicker.js)
 */
export function createFormInstallmentItems(planned = [], valuesBySeq = {}) {
  return (planned || [])
    .map((row) => ({ seq: row.seq, ...pickerPayload(valuesBySeq?.[row.seq]) }))
    .filter((item) => item.dueDate || item.billingDate || item.billingEvent);
}

/**
 * เหตุที่ปุ่ม "สร้างใบสั่งขาย" ยังกดไม่ได้ ฝั่งวันของงวด — '' = ไม่มี
 * ⭐ **ไม่ใช่ด่านบังคับเลือกรอบ** (มติ 26/09 ข้อ 2) — งวดที่ยังไม่เลือกผ่านเสมอ
 *    กันเฉพาะงวดที่ **เริ่มเลือกแล้วแต่ยังไม่ครบ** ("วันอื่น…" ที่ยังไม่ใส่วัน · รอเหตุการณ์ที่ยังไม่มีชื่อ)
 *    ซึ่งถ้าปล่อยไป `pickerPayload` ส่งค่าว่าง ⇒ งวดกลับเป็น "ยังไม่กำหนด" เงียบ ๆ ทั้งที่คนเห็นว่าเลือกแล้ว
 * ⭐ ข้อความเดียวบอกทุกงวดที่ขาด (กฎฟอร์ม "ด่านตรวจรวมข้อความเดียว") + ทางออกถ้ายังไม่ตัดสินใจ
 */
export function createFormBillingBlocker(planned = [], valuesBySeq = {}) {
  const noDate = [];
  const noEvent = [];
  for (const row of planned || []) {
    const value = valuesBySeq?.[row.seq];
    if (!pickerMissing(value)) continue;
    (normalizePickerValue(value).mode === 'other' ? noDate : noEvent).push(rowName(row));
  }
  const parts = [];
  if (noDate.length) parts.push(`ยังไม่ได้ใส่วันวางบิล ${noDate.join(', ')}`);
  if (noEvent.length) parts.push(`ยังไม่ได้ใส่เหตุการณ์ที่รอ ${noEvent.join(', ')}`);
  if (!parts.length) return '';
  return `${parts.join(' · ')} — กรอกให้ครบ หรือกด "ล้างที่เลือก" ถ้ายังไม่เลือกรอบ`;
}

/* ตรวจค่าของงวดเดียว (ไม่รวม seq) — `{ patch, error }` · ตัวเดียวกันทั้ง POST และด่านก่อนกดบนจอ */
function checkItemDates(item, seq) {
  const due = dateCheck(item?.dueDate);
  if (due.problem) return { patch: null, error: dateProblemText(due, 'กำหนดชำระ', seq) };
  const bill = dateCheck(item?.billingDate);
  if (bill.problem) return { patch: null, error: dateProblemText(bill, 'วันวางบิล', seq) };
  const billing = normalizeInstallmentBilling({ billingDate: bill.iso || null, billingEvent: item?.billingEvent });
  if (billing.error) return { patch: null, error: `งวด ${seq}: ${billing.error}` };

  const patch = {};
  if (due.iso) patch.dueDate = due.iso;
  if (billing.value.billingDate) patch.billingDate = billing.value.billingDate;
  if (billing.value.billingEvent) patch.billingEvent = billing.value.billingEvent;
  return { patch, error: null };
}

/**
 * ตรวจแถวที่ POST รับมา **ก่อนออกเลขใบ** — คืน `{ rows: [{ seq, patch }], error }`
 * ⭐ ตรวจก่อน RPC เพราะเลขใบใช้ซ้ำไม่ได้ (0241): ค่าผิดต้องตอบ 400 ตั้งแต่ยังไม่มีใบ
 *    ไม่ใช่ออกใบแล้วค่อยกลายเป็นคำเตือนหลัง 201 (เดิมค่าผิดถูกข้ามเงียบ ๆ)
 * · `patch` มีเฉพาะช่องที่มีค่า — แถวร่างเพิ่งเกิด ช่องที่ไม่ส่งเป็น null อยู่แล้ว
 *   และฐานที่ยังไม่รัน 0389 ไม่เจอคีย์วันวางบิลเลยถ้าหน้าไม่ได้ส่งมา (ลูกค้าไม่มีรอบ = ไม่มีวันวางบิล)
 * · ไม่ส่งมา/อาร์เรย์ว่าง = ไม่มีอะไรต้องเขียน (ไม่บังคับ)
 */
export function parseCreateFormInstallments(input) {
  if (input === undefined || input === null) return { rows: [], error: null };
  if (!Array.isArray(input)) return { rows: [], error: 'รูปแบบวันของงวดชำระไม่ถูกต้อง' };
  const seen = new Set();
  const rows = [];
  for (const item of input) {
    const seq = Number(item?.seq);
    if (!Number.isInteger(seq) || seq < 1) return { rows: [], error: 'ลำดับงวดชำระไม่ถูกต้อง' };
    if (seen.has(seq)) return { rows: [], error: `งวด ${seq} ถูกส่งมาซ้ำ` };
    seen.add(seq);
    const { patch, error } = checkItemDates(item, seq);
    if (error) return { rows: [], error };
    if (Object.keys(patch).length) rows.push({ seq, patch });
  }
  return { rows, error: null };
}

/**
 * ด่านก่อนกด "สร้างใบสั่งขาย" ฝั่งวันที่ — ตัวตรวจเดียวกับ POST บนแถวชุดเดียวกับที่จะส่ง
 * 🐞 เดิมปีพิมพ์พลาด (2202) ผ่านจอไปถึง POST หลังอัปไฟล์เสร็จ ⇒ 400 แล้วไฟล์ที่อัปถูกลบทิ้ง · ข้อความก็ไม่บอกว่าผิดที่ปี
 * คืน `{ error, invalidSeqs }` — `error` ข้อความแรกที่เจอ ('' = ผ่าน) · `invalidSeqs` งวดที่ช่องวันต้องขึ้นขอบแดง
 */
export function createFormDateCheck(planned = [], valuesBySeq = {}) {
  const items = createFormInstallmentItems(planned, valuesBySeq);
  const invalidSeqs = new Set();
  let error = '';
  for (const item of items) {
    const result = checkItemDates(item, item.seq);
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
export async function loadCreateFormBillingTerms(supabase, customerId) {
  if (!customerId) return null;
  let supported = true;
  let { data, error } = await supabase
    .from('customers')
    .select('id, "arCode", "creditTerms", "billingRule"')
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
  return {
    // ไม่เจอแถว (ลูกค้าถูกลบ/รวมการ์ด) = ไม่มีอะไรให้ชวนตั้ง — เหมือนฐานที่ยังไม่รองรับ
    supported: supported && Boolean(data),
    billingRule: supported ? billingRuleOf(data?.billingRule) : null,
    creditTerms: String(data?.creditTerms ?? '').trim(),
    arCode: String(data?.arCode ?? '').trim(),
  };
}

/* ก้อน `billingTerms` จาก API → สถานะของหน้า (`null` = ใบไม่ผูกลูกค้า/ไม่ได้ขอ = ไม่มีแถบ)
   `{ status: 'ready', supported, rule, creditTerms, arCode }` · `{ status: 'error', detail }`
   ⭐ `rule` = รูปมาตรฐานรุ่นสอง (mig 0390) **รวม `{ credit: false }`** (ไม่มีเครดิต) — ผู้เรียกที่จะเปิดตัวเลือกรอบถาม
     `pickerRuleOf(rule)` (ไม่มีเครดิต = null · ทำเหมือนไม่มีรอบ) ส่วนแถบ/ประโยคอ่าน `rule` ตรงเพื่อบอกว่า "ไม่มีเครดิต"
   ⚠️ รูปรุ่นแรก (0389: billing.day / payment.day+monthOffset) ถูกแปลงเป็นรุ่นสองที่ `billingRuleOf` แล้ว ⇒ อย่าอ่านช่องรุ่นแรก
   · `creditTerms` = ข้อความเครดิตเดิม (ช่องอิสระที่ถอดจากฟอร์มลูกค้าแล้ว · อ่านอย่างเดียว) */
export function createFormTermsState(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.error) return { status: 'error', detail: String(payload.error) };
  return {
    status: 'ready',
    supported: Boolean(payload.supported),
    rule: billingRuleOf(payload.billingRule),
    creditTerms: String(payload.creditTerms ?? '').trim(),
    arCode: String(payload.arCode ?? '').trim(),
  };
}
