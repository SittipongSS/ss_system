// ── ตั้งวันงวดทีละหลายงวด (action `schedule-many` · แผงงวดแบบ C "โหมดตั้งวัน" · มติเจ้าของ 28/09) ──────────
//
// คนร่างวันในตารางงวด (แตะเซลล์วันวางบิล/กำหนดชำระ · "เติมวันงวดที่ว่าง…") แล้วกด "บันทึก N งวด" ครั้งเดียว
// ⇒ คำขอเดียวพาทุกงวดที่เปลี่ยน: `{ action: 'schedule-many', rows: [{ id, billingDate, billingEvent, dueDate, updatedAt }] }`
//
// ⭐ ต่างจาก `fill-billing` / `redate-billing`: server **ไม่คิดวันเอง** — วันมาจากคนเลือกทีละงวด (หรือตัวช่วยเติมบนจอ
//   ที่คนเห็นผลในตารางก่อนกดบันทึก) ⇒ ด่านคือ "งวดที่คนเห็นยังเป็นรุ่นเดิมไหม" (`updatedAt` ทีละงวด)
//   ไม่ใช่ "แผนตรงกับที่ server คิดไหม"
// ⭐ ตรวจ **ทุกงวดก่อนเขียนงวดแรก** — งวดเดียวพัง = ไม่มีอะไรลงฐาน (ยกเว้นแข่งกับอีกหน้าต่างระหว่างเขียน ดู writeScheduleMany)
// ⭐ งวดที่ค่าที่ส่งมา **ตรงค่าในฐานแล้ว** ถูกข้ามก่อนด่านทุกตัว (ไม่เขียน · ไม่ล็อก · ไม่ 409) — จอส่งทั้งตารางก็ได้
//   (งวดที่ชำระแล้วไม่ได้ถูกแก้ ไม่ใช่เหตุให้ทั้งคำขอตก) · กดซ้ำหลังหยุดกลางทางด้วยตัวล็อกรุ่นเก่า = งวดที่ลงแล้วถูกข้าม ไม่ 409 วน
// ⚠️ ล็อกของโหมดตั้งวันมีตัวเดียว: `installmentDateLock` ข้างล่าง — route ถามตัวนี้ตัดสิน 409 · จอถามตัวเดียวกันผ่าน
//   `dateLockView` (installmentDateDrafts.js) ที่แค่แยกประโยคเป็น `{ reason, hint }` แล้วเพิ่มสองข้อที่ server ไม่รู้จากฝั่งจอ:
//   `requestUnknown` (จออ่านคำร้องไม่ขึ้น = ล็อกไว้ก่อน · server อ่านพลาด = โยน 500 ไม่เดา) กับ `gateError` (ด่าน schedule ของแผง)
//   ⇒ เพิ่ม/ถอดเหตุล็อกที่นี่ที่เดียว ห้ามเขียนรายการซ้ำที่จอ (เทสต์ของไฟล์นี้ยืนยันว่าสองทางล็อกงวดชุดเดียวกัน)
// ⚠️ logic ล้วน ใช้ได้ทั้ง client และ server — ไม่แตะฐาน (ตัวเขียนรับฟังก์ชันเขียนงวดเดียวจาก route) · ไม่อ่านนาฬิกา
//
// ── รุ่นสี่ "ต้องวางบิลไหม" (มติเจ้าของ 28–29/09 · mig 0393 · system-design §7.3) ─────────────────────────────────
// ⭐ ด่านค่าวันของทุกทางเขียนวันงวด = `validateInstallmentDates` (billingRule.js) ตัวเดียว — schedule · schedule-many ·
//   จัดวันใหม่ตามกติกาลูกค้า (`/api/customers/[id]/billing-rule/redate`) · หน้าสร้าง SO
//   · ลูกค้าไม่ต้องวางบิล: วันวางบิล **ใหม่** ต้องมากับ `billingException: true` (โมดัล "งวดนี้ต้องวางบิล…") ไม่งั้น 400
//   · ติ๊ก "งวดนี้ไม่ต้องวางบิล" (`billingSkip`) คู่กับวันวางบิลไม่ได้ · รอเหตุการณ์ ⇒ ไม่มีกำหนดชำระ
//   · อ่านกติกาลูกค้าพลาด (`ruleUnavailable`) = ตีกลับเฉพาะงวดที่เปลี่ยนวันวางบิล/ติ๊ก — กำหนดชำระยังบันทึกได้
// ⭐ `billingSkip` เก็บเป็น `true` หรือ `null` เท่านั้น (null = ตามลูกค้า · ไม่เก็บ false) และอยู่ใน patch เฉพาะเมื่อเปลี่ยน
//   ⇒ ก่อนรัน 0393 (ไม่มีคอลัมน์) คำขอที่ไม่แตะติ๊กไม่เอ่ยชื่อคอลัมน์เลย · คำขอที่แตะ = 503 "รอรัน migration 0393"
// ⭐ `billingException` เป็นของชั่วคราว — ไม่เก็บลงฐาน · ลงประวัติ (audit) ผ่าน `scheduleExceptionsOf`
// ⚠️ server **ยังเก็บกำหนดชำระตามที่ส่ง** — ไม่คิดใหม่จากกติกาลูกค้า (มติ 28/09 ข้อ 17 · ด่านไม่ตรวจกำหนดชำระกับกติกา)
import { installmentRefunded, installmentStale, installmentVoid, installmentVoidNote } from '@/lib/sales/salesOrderPayments';
import { OPENING_INSTALLMENT_LABEL, isOpeningInstallment } from '@/lib/sales/historicalOrders';
import {
  NEED_NONE, SKIP_TEXT, billingNeed, normalizeInstallmentBilling, validateInstallmentDates,
} from '@/lib/sales/billingRule';
import { BILLING_V4_SCHEMA_MISSING } from '@/lib/sales/billingPolicySchema';

/* งวดต่อคำขอ — ใบจริงมีไม่เกินสิบกว่างวด · เพดานกันคำขอผิดรูปที่ลากเขียนทีละแถวเป็นร้อยครั้ง (ไม่มี RPC ⇒ ไม่มีทรานแซกชัน) */
export const SCHEDULE_MANY_MAX = 60;

/* ช่องที่คำสั่งนี้เขียนได้ — ไม่มีอย่างอื่น (สถานะ/ยอด/ช่วงครอบ มีทางของมันเอง) · `billingSkip` = ติ๊ก "งวดนี้ไม่ต้องวางบิล" (0393) */
const DATE_FIELDS = Object.freeze(['billingDate', 'billingEvent', 'dueDate']);
const WRITE_FIELDS = Object.freeze([...DATE_FIELDS, 'billingSkip']);

/* ค่าที่ลงฐานของติ๊ก — `true` หรือ `null` (ตามลูกค้า) · ไม่มีวันเก็บ false */
const skipValue = (on) => (on ? true : null);
/* ติ๊กในแถวที่อ่านจากฐาน — ก่อน 0393 ไม่มีคีย์ (undefined) = ไม่ติ๊ก */
export const rowSkipped = (row) => row?.billingSkip === true;

const text = (v) => String(v ?? '').trim();

/* สตริง YYYY-MM-DD ที่มีจริงบนปฏิทิน — "2026-02-31" ผ่านรูปแต่ไม่มีวันนั้น (ฐานตอบ 22008 เป็น 500 ดิบ)
   ⚠️ กติกาเดียวกับ `dateOf` ของ billingRule.js (ตัวที่ normalizeInstallmentBilling ใช้ตรวจวันวางบิล) */
function realDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/**
 * งวดนี้ตั้งวันในโหมดตั้งวันไม่ได้เพราะอะไร — คืนข้อความไทย หรือ null (ตั้งได้)
 * ⭐ รายการล็อกตามมติ 28/09: โมฆะตามใบ · งวดยกมา · บันทึกคืนเงินแล้ว · ชำระแล้ว · แจ้งชำระแล้ว · ขอใบวางบิลแล้ว
 *   · แจ้งชำระแล้ว/ชำระแล้ว = เงินเดินไปแล้ว วันงวดไม่มีความหมายให้ย้าย (ด่าน `schedule` เองล็อกแค่ confirmed — โหมดนี้เข้มกว่า
 *     เพราะทั้งตารางถูกร่างพร้อมกัน ตัวช่วยเติมต้องไม่ลากงวดที่รอบัญชีตรวจไปด้วย)
 *   · ขอใบวางบิลแล้ว = บัญชีออกใบตามวันเดิมไปแล้ว ย้ายเงียบ ๆ = ใบวางบิลกับงวดบอกคนละวัน (กติกาเดียวกับ planRedate)
 * ⚠️ ล็อกทั้งใบ (ใบยกเลิก/ถูกออก Rev. ทับ/ใบย้อนหลังที่ยังไม่อนุมัติ) ไม่ใช่เรื่องของตัวนี้ — route ถาม orderLock ก่อน · จอไม่เปิดโหมด
 * @param order      ใบของงวด (ตัดสินโมฆะ — `installmentVoid`) · ไม่ส่ง = ไม่ตัดสินข้อนี้
 * @param requested  งวดนี้ "ขอใบวางบิลแล้ว" ไหม — ผู้เรียกตัดสินด้วย `billingRequestLive` (installmentBillingRequested/billingRequestedIds)
 * @param requestNo  เลขคำร้อง (ถ้ามี) ต่อท้ายเหตุ — จอมีเลข server ไม่มี (อ่านแค่ id + สถานะ)
 */
export function installmentDateLock(row, { order = null, requested = false, requestNo = '' } = {}) {
  if (!row) return 'ไม่พบงวดที่ระบุ';
  if (order && installmentVoid(row, order)) return installmentVoidNote(row, order);
  if (isOpeningInstallment(row)) return `${OPENING_INSTALLMENT_LABEL} — เงินเก็บไปแล้วก่อนเข้าระบบ ไม่มีวันวางบิล/กำหนดชำระ`;
  /* หัวคำตรงกับเหตุบนแถวล็อกของจอ ("คืนเงินแล้ว" · "รับเงินแล้ว") — คนเห็นคำเดียวกันทั้งบนตารางและใน 409 */
  if (installmentRefunded(row) || String(row.status || '') === 'refunded') return 'คืนเงินแล้ว — วันงวดไม่ขยับ';
  const status = String(row.status || 'pending');
  if (status === 'confirmed') return 'รับเงินแล้ว — บัญชีรับรองแล้ว';
  if (status === 'reported') return 'แจ้งชำระแล้ว — รอบัญชีตรวจ';
  if (requested) {
    const no = text(requestNo);
    return `ขอใบวางบิลแล้ว${no ? ` · ${no}` : ''} — บัญชีออกใบตามวันเดิม ถอดคำร้องก่อนถ้าจะย้ายวัน`;
  }
  return null;
}

/* ไม่ได้ส่งรุ่นของงวด (`updatedAt`) มา = ตรวจ "ข้อมูลเก่า" ไม่ได้ ⇒ ไม่รับ — คำเดียวของคำสั่งทั้งใบที่เกิดพร้อมจอที่ส่งค่านี้เสมอ
   (schedule-many · fill-coverage ของงานบริการ `coveragePlanStale`) */
export const INSTALLMENT_VERSION_MISSING = 'ไม่ได้ส่งรุ่นของงวดที่เห็นอยู่มา — โหลดหน้าใหม่แล้วลองอีกครั้ง';

/**
 * รูปของคำขอ — ตรวจก่อนแตะฐาน (400)
 * · อาเรย์ 1..SCHEDULE_MANY_MAX · ทุกแถวมี `id` + `updatedAt` (รุ่นของงวดที่ตาเห็น — ไม่มี = ตรวจ "ข้อมูลเก่า" ไม่ได้ ⇒ ไม่รับ)
 * · id ไม่ซ้ำ · ค่าวันเป็นสตริงหรือ null เท่านั้น (ออบเจกต์ถูก String() เป็น "[object Object]" แล้วกลายเป็นชื่อเหตุการณ์)
 * ⚠️ `updatedAt` บังคับที่นี่ ต่างจาก `schedule` งวดเดียว (ที่ปล่อยแท็บเก่าก่อน deploy) — คำสั่งนี้เกิดพร้อมจอที่ส่งค่านี้เสมอ
 * · รุ่นสี่: `billingSkip` เป็น boolean/null · `billingException` เป็น boolean — อย่างอื่น ("true" สตริง) ไม่รับ
 *   (สตริงไม่ว่างเป็น truthy ⇒ ถ้าปล่อยผ่าน ติ๊กจะถูกตีความตามใจตัวแปลง)
 */
export function scheduleManyShapeError(sent) {
  if (!Array.isArray(sent) || !sent.length) return 'ไม่ได้ส่งงวดที่จะบันทึกมา — ตั้งวันงวดใหม่แล้วลองอีกครั้ง';
  if (sent.length > SCHEDULE_MANY_MAX) return `บันทึกได้ครั้งละไม่เกิน ${SCHEDULE_MANY_MAX} งวด`;
  const seen = new Set();
  for (const item of sent) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return 'รูปแบบงวดที่ส่งมาไม่ถูกต้อง';
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) return 'ไม่ได้ระบุงวดที่ต้องการ';
    if (seen.has(id)) return 'งวดเดียวกันถูกส่งมาซ้ำ — โหลดหน้าใหม่แล้วลองอีกครั้ง';
    seen.add(id);
    if (typeof item.updatedAt !== 'string' || !item.updatedAt.trim()) return INSTALLMENT_VERSION_MISSING;
    for (const field of DATE_FIELDS) {
      const value = item[field];
      if (value !== undefined && value !== null && typeof value !== 'string') return 'รูปแบบวันงวดที่ส่งมาไม่ถูกต้อง';
    }
    const flagError = billingFlagShapeError(item);
    if (flagError) return flagError;
  }
  return null;
}

/* รูปของสองธงรุ่นสี่ในคำขอ (schedule งวดเดียว · schedule-many · หน้าสร้าง SO ถามตัวเดียวกัน) — ข้อความ หรือ null */
export function billingFlagShapeError(item) {
  const skip = item?.billingSkip;
  if (skip !== undefined && skip !== null && typeof skip !== 'boolean') return `รูปแบบติ๊ก "${SKIP_TEXT}" ไม่ถูกต้อง`;
  const exception = item?.billingException;
  if (exception !== undefined && typeof exception !== 'boolean') return 'รูปแบบการยืนยัน "งวดนี้ต้องวางบิล" ไม่ถูกต้อง';
  return null;
}

/**
 * ข้อยกเว้นรายงวดที่คำขอนี้ทำ — ลงประวัติ (audit) ของใบ · ไม่มีคอลัมน์ของตัวเอง (system-design §2.3)
 *   'billing' = ลูกค้าไม่ต้องวางบิล แต่ตั้งวันวางบิล **ใหม่** ผ่านการยืนยัน "งวดนี้ต้องวางบิล…" (`billingException`)
 *   'skip'    = ติ๊ก "งวดนี้ไม่ต้องวางบิล" · 'unskip' = เอาติ๊กออก
 * @param row  งวดในฐานตอนนี้ ({} = งวดใหม่ของหน้าสร้าง) · @param next ค่าหลังรวม `{ billingDate, billingSkip, billingException }`
 */
export function scheduleExceptionsOf(row, next, rule) {
  const out = [];
  const bill = String(next?.billingDate ?? '').trim();
  if (bill && bill !== String(row?.billingDate ?? '').trim() && next?.billingException === true && billingNeed(rule) === NEED_NONE) {
    out.push('billing');
  }
  const was = rowSkipped(row);
  const now = next?.billingSkip === true;
  if (now && !was) out.push('skip');
  if (!now && was) out.push('unskip');
  return out;
}

/* ประโยคของข้อยกเว้นในประวัติ (contracts §10 7.3) — ชื่อคนกดต่อท้ายสองแบบแรก */
export function scheduleExceptionText(kind, name = '') {
  const by = String(name || '').trim();
  if (kind === 'billing') return `ยกเว้น: งวดนี้ต้องวางบิล${by ? ` โดย ${by}` : ''}`;
  if (kind === 'skip') return `ยกเว้น: ${SKIP_TEXT}${by ? ` โดย ${by}` : ''}`;
  if (kind === 'unskip') return `เอาติ๊ก "${SKIP_TEXT}" ออก`;
  return '';
}

/* ต่อท้ายสรุป audit ของคำขอหลายงวด — `rows` = `[{ seq, exceptions }]` · ไม่มีข้อยกเว้น = '' */
export function scheduleExceptionSummary(rows = [], name = '') {
  const parts = [];
  for (const row of rows || []) {
    for (const kind of row?.exceptions || []) parts.push(`งวดที่ ${row.seq} ${scheduleExceptionText(kind, name)}`);
  }
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

/* ค่าที่งวดจะเป็นหลังบันทึก — กติกาเดียวกับ `schedule` งวดเดียว · `null`/'' = ล้างตั้งใจ ("ล้างวัน")
   · วันวางบิล/รอเหตุการณ์ = **คู่เดียวกัน**: ส่งคีย์ใดคีย์หนึ่งมา = ตั้งทั้งคู่ (อีกตัวที่ไม่ส่ง = ว่าง) — อย่างใดอย่างหนึ่งเสมอ
     (CHECK ของ 0389) ⇒ สลับ "รอเหตุการณ์ → วันวางบิล" ด้วย `billingDate` ตัวเดียวไม่ชนเหตุการณ์เดิมเป็น 400
     ไม่ส่งทั้งคู่ = คงคู่เดิม
   · กำหนดชำระ: ไม่ส่งคีย์ = คงเดิม (ต่างจาก `schedule` ที่เขียน dueDate ทุกครั้ง — คำสั่งหลายงวดไม่ควรล้างวันที่จอไม่ได้พูดถึง)
   · ติ๊ก "งวดนี้ไม่ต้องวางบิล" (รุ่นสี่): ไม่ส่งคีย์ = คงเดิม — ⚠️ ต้องรวมค่าเดิมเสมอ ไม่งั้นงวดที่ติ๊กไว้แล้วแต่จอไม่ได้พูดถึง
     ดูเหมือน "เอาติ๊กออก" ในสายตาของด่าน */
function nextDates(row, item) {
  const billingSent = Object.hasOwn(item, 'billingDate') || Object.hasOwn(item, 'billingEvent');
  return {
    billingDate: billingSent ? (item.billingDate ?? null) : row.billingDate,
    billingEvent: billingSent ? (item.billingEvent ?? null) : row.billingEvent,
    dueDate: Object.hasOwn(item, 'dueDate') ? item.dueDate : row.dueDate,
    billingSkip: Object.hasOwn(item, 'billingSkip') ? item.billingSkip === true : rowSkipped(row),
  };
}

/* ค่าใหม่ของงวดในรูปที่ลงฐาน — `{ value }` หรือ `{ error }` (ข้อความไทยไม่มีเลขงวด · ผู้เรียกเติม)
   วันวางบิล/รอเหตุการณ์ผ่าน `normalizeInstallmentBilling` ตัวเดียวกับ `schedule` (อย่างใดอย่างหนึ่ง · ปี 2000–2100 · ชื่อ ≤120)
   กำหนดชำระเป็นวันที่มีจริง ปี 2000–2100 · ติ๊กเป็น true/null */
function wantedDates(row, item) {
  const next = nextDates(row, item);
  const billing = normalizeInstallmentBilling({ billingDate: next.billingDate, billingEvent: next.billingEvent });
  if (billing.error) return { error: billing.error };
  const due = text(next.dueDate) || null;
  if (due && !realDay(due)) return { error: 'กำหนดชำระไม่ถูกต้อง' };
  if (due && (due < '2000-01-01' || due > '2100-12-31')) return { error: 'ปีของกำหนดชำระผิด' };
  return { value: { ...billing.value, dueDate: due, billingSkip: skipValue(next.billingSkip) } };
}

/* ช่องที่ค่าใหม่ต่างจากฐาน — `{}` = ตรงแล้วทุกช่อง */
function changedFields(row, wanted) {
  const saved = savedDates(row);
  const patch = {};
  for (const field of WRITE_FIELDS) if (wanted[field] !== saved[field]) patch[field] = wanted[field];
  return patch;
}

/* ค่าเดิมของแถวในรูปเดียวกับค่าใหม่ — เทียบหา "เปลี่ยนจริงไหม" */
const savedDates = (row) => ({
  billingDate: text(row.billingDate) || null,
  billingEvent: text(row.billingEvent) || null,
  dueDate: text(row.dueDate) || null,
  billingSkip: skipValue(rowSkipped(row)),
});

/**
 * ด่านค่าวันรุ่นสี่ของงวดเดียวที่ **จะเปลี่ยน** (ผ่านรูป/ล็อก/ด่าน schedule มาแล้ว) — ข้อความไทย หรือ null
 * = `validateInstallmentDates` บนสภาพหลังรวม (คีย์ที่ไม่ส่ง = ค่าเดิม · ติ๊กด้วย) + ธงยืนยันข้อยกเว้นของคำขอ
 * ⚠️ งวดที่ค่าตรงฐานถูกข้ามก่อนถึงตัวนี้ — แถวเก่าที่ผิดกติกาใหม่อยู่แล้ว (รอเหตุการณ์ + กำหนดชำระ) ไม่ทำให้ทั้งตารางตก
 */
export function scheduleValueError(row, value, { billingException = false, rule = null, ruleUnavailable = false } = {}) {
  return validateInstallmentDates(row, {
    billingDate: value.billingDate,
    billingEvent: value.billingEvent,
    dueDate: value.dueDate,
    billingSkip: value.billingSkip === true,
    billingException: billingException === true,
  }, rule, { ruleUnavailable });
}

/* เหตุของงวดที่ `updatedAt` ไม่ตรงแถวสดตอนตรวจก่อนเขียน (409 ก่อนเขียน · schedule-many และ fill-coverage) */
const SCHEDULE_MANY_ROW_CHANGED = 'เพิ่งถูกแก้จากอีกหน้าต่าง';

/* 409 ก่อนเขียน — บอกทุกงวดที่เปลี่ยนใต้มือ ไม่ใช่แค่งวดแรก (จอใช้รายการนี้บอกว่า "งวดไหนเปลี่ยน" ตอนรวมร่างกับงวดสด)
   · งวดที่ไม่อยู่ในใบแล้วไม่มีเลขงวดให้บอก ⇒ หลายงวดได้ประโยคเดียวกัน — พูดครั้งเดียว (รายการเต็มอยู่ใน `conflicts`) */
export function scheduleManyConflictMessage(conflicts = []) {
  const parts = [...new Set(conflicts.map((c) => (c.seq == null ? c.reason : `งวดที่ ${c.seq}: ${c.reason}`)))];
  return `ยังไม่ได้บันทึกงวดไหน — ${parts.join(' · ')} · โหลดงวดล่าสุดแล้วตรวจอีกครั้ง`;
}

/**
 * รุ่นของงวดที่พรีวิว "แบ่งช่วงครอบตามช่วงบริการ…" เห็น (`fill-coverage` · งานบริการ mig 0392) — ชั้นแรกของ optimistic lock
 * **ท่าเดียวกับ schedule-many** (`updatedAt` ทีละงวด · 409 บอกทุกงวดที่เปลี่ยน · ประโยคเดียวกัน) · ชั้นสอง = เขียนแบบมีเงื่อนไขที่ตัวเขียน
 * ⭐ ทำไมต้องมี ทั้งที่ route คิดชุดเองแล้วเทียบกับพรีวิว (`coveragePlanMatches`): การแบ่ง **ไม่ขึ้นกับช่วงครอบเดิม** ⇒ อีกหน้าต่างแก้
 *   ช่วงครอบ/วันงวดหลังเปิดโมดัล พรีวิวยังตรง แต่ "ครอบเดิม" ที่คนเห็นเป็นของเก่า = เขียนทับของอีกหน้าต่างเงียบ ๆ (schedule-many ได้ 409)
 * ⚠️ ผู้เรียกเทียบชุดงวด (id + วัน) มาก่อนแล้ว — ที่นี่ถามแค่รุ่น · งวดที่ไม่อยู่ในชุดสดข้าม (ด่านชุดงวดตัดสินไปแล้ว)
 * @param live  งวดสดของใบ (ตัวล็อก updatedAt จริง)
 * @param plan  `[{ id, coversFrom, coversTo, updatedAt }]` ที่โมดัลส่งมา
 * @returns null (ผ่าน) · `{ error, status: 400 }` ไม่ได้ส่งรุ่น · `{ error, status: 409, conflicts: [{ id, seq, reason }] }`
 */
export function coveragePlanStale(live = [], plan = []) {
  const sent = Array.isArray(plan) ? plan : [];
  if (sent.some((item) => typeof item?.updatedAt !== 'string' || !item.updatedAt.trim())) {
    return { error: INSTALLMENT_VERSION_MISSING, status: 400 };
  }
  const byId = new Map((live || []).map((row) => [row.id, row]));
  const conflicts = [];
  for (const item of sent) {
    const row = byId.get(String(item.id || '').trim());
    if (row && installmentStale(row, item.updatedAt)) conflicts.push({ id: row.id, seq: row.seq, reason: SCHEDULE_MANY_ROW_CHANGED });
  }
  if (!conflicts.length) return null;
  conflicts.sort((a, b) => Number(a.seq) - Number(b.seq));
  return { error: scheduleManyConflictMessage(conflicts), status: 409, conflicts };
}

/**
 * ตรวจทุกงวดที่จอส่งมา กับงวดสดของใบ — คืนชุดที่จะเขียน หรือเหตุที่ไม่เขียน
 *
 * ลำดับ (ตรวจครบทุกงวดก่อน · ไม่มีอะไรลงฐานจนกว่าจะผ่านหมด):
 *  1. รูปคำขอ (`scheduleManyShapeError`) → 400
 *  2. งวดที่ค่าใหม่ **ตรงค่าในฐานแล้วทุกช่อง ข้าม** ก่อนด่านทุกตัว (ไม่เขียน · ไม่นับ · ไม่ล็อก · ไม่ถามรุ่น)
 *     ⇒ จอส่งทั้งตาราง (รวมงวดที่ชำระแล้วแต่ไม่ได้แก้) ได้ · กดซ้ำหลังหยุดกลางทางด้วยตัวล็อกรุ่นเก่า = งวดที่ลงแล้วถูกข้าม ไม่ 409 วน
 *  3. **ของเปลี่ยนใต้มือ** (เฉพาะงวดที่จะเปลี่ยน) → 409 พร้อม `conflicts` ทุกงวด: ไม่อยู่ในใบนี้แล้ว (ถูกปรับแผน/ย้ายไปใบ Rev.) ·
 *     `updatedAt` ไม่ตรงแถวสด · ล็อกในโหมดตั้งวัน (แจ้งชำระ/ขอใบวางบิล ระหว่างที่ร่างค้างอยู่ — จอเห็นเป็นงวดเปิดตอนร่าง)
 *  4. ด่าน `schedule` ทีละงวด (`gate` — ผู้เรียกส่ง installmentActionError ชุดเดียวกับแผง) → 400 บอกเลขงวด
 *  5. ค่าวัน (`wantedDates`) → 400 บอกเลขงวด
 *  6. ด่านรุ่นสี่ (`scheduleValueError` = validateInstallmentDates กับกติกาลูกค้าที่ server อ่านเอง) → 400 บอกเลขงวด
 *  7. ติ๊กเปลี่ยนแต่ฐานยังไม่มีคอลัมน์ (`skipReady` false · ก่อนรัน 0393) → 503 "รอรัน migration 0393"
 * ⚠️ ลำดับวันระหว่างงวด / วันวางบิลหลังกำหนดชำระ **ไม่บล็อก** (มติ 28/09 "เตือน ไม่บล็อก" — จอเตือนก่อนกด)
 * @param live   งวดสดทั้งใบ (loadInstallments — อ่านแบบโยน error)
 * @param sent   `body.rows`
 * @param requestedIds Set ของ id งวดที่ขอใบวางบิลแล้ว (`billingRequestedIds` จากคำร้องที่อ่านสด)
 * @param order  ใบของงวด (โมฆะ) · `gate(row)` → ข้อความ | null
 * @param rule   กติกาวางบิลของลูกค้าของใบ (ค่าดิบ · ทุกรุ่น) · `ruleUnavailable` = อ่านไม่ขึ้น (ปิดแค่วันวางบิล/ติ๊ก)
 * @param skipReady ฐานมีคอลัมน์ `billingSkip` แล้ว (`billingSkipReadyOf(live)`)
 * @returns `{ rows: [{ id, seq, patch, before, exceptions }] }` (เรียงตามเลขงวด · patch = เฉพาะช่องที่เปลี่ยน ·
 *   exceptions = ข้อยกเว้นรายงวดสำหรับประวัติ) หรือ `{ error, status, conflicts? }` — `conflicts` = `[{ id, seq, reason }]` เฉพาะ 409
 */
export function scheduleManyCheck(live = [], sent = [], {
  requestedIds = new Set(), order = null, gate = () => null, rule = null, ruleUnavailable = false, skipReady = false,
} = {}) {
  const shape = scheduleManyShapeError(sent);
  if (shape) return { error: shape, status: 400 };
  const byId = new Map((Array.isArray(live) ? live : []).map((row) => [row.id, row]));
  const items = sent
    .map((item) => {
      const row = byId.get(item.id.trim()) || null;
      const wanted = row ? wantedDates(row, item) : null;
      const patch = wanted?.value ? changedFields(row, wanted.value) : null;
      return { item, row, wanted, patch };
    })
    /* ข้อ 2: ค่าตรงฐานแล้ว = ไม่มีอะไรต้องทำกับงวดนี้ — ล็อก/รุ่นเก่าของงวดที่ไม่ถูกแก้ไม่ใช่เหตุให้ทั้งคำขอตก */
    .filter(({ patch }) => !patch || Object.keys(patch).length > 0);

  const conflicts = [];
  for (const { item, row } of items) {
    if (!row) {
      conflicts.push({ id: item.id.trim(), seq: null, reason: 'มีงวดที่ไม่อยู่ในใบนี้แล้ว (อาจถูกปรับแผนงวด)' });
      continue;
    }
    /* ล็อกก่อนรุ่นเก่า — งวดที่ถูกแจ้งชำระระหว่างร่างก็ `updatedAt` เปลี่ยนด้วย · บอกเหตุจริง ("แจ้งชำระแล้ว") ดีกว่า "เพิ่งถูกแก้"
       ⚠️ งวดยกมาก็ตกที่นี่ (409) ทั้งที่ไม่ได้ "เปลี่ยนใต้มือ" — ตั้งใจ: จอไม่ให้ร่างงวดยกมาอยู่แล้ว ร่างแบบนี้มาได้แค่จากแท็บเพี้ยน
       และ 409 พาจอไปโหลดงวดสดแล้วตรวจร่างใหม่ (ร่างบนงวดล็อกถูกทิ้ง) · 400 จะค้างร่างที่คนลบเองไม่ได้เพราะแถวล็อก */
    const lock = installmentDateLock(row, { order, requested: requestedIds.has(row.id) });
    if (lock) conflicts.push({ id: row.id, seq: row.seq, reason: lock });
    else if (installmentStale(row, item.updatedAt)) conflicts.push({ id: row.id, seq: row.seq, reason: SCHEDULE_MANY_ROW_CHANGED });
  }
  if (conflicts.length) {
    /* งวดที่ไม่อยู่ในใบแล้ว (seq null) ขึ้นก่อน — ตัวเทียบสมมาตร: null คู่ null = 0 (ไม่ใช่ -1 ทั้งสองทาง) */
    conflicts.sort((a, b) => (a.seq == null ? -1 : Number(a.seq)) - (b.seq == null ? -1 : Number(b.seq)));
    return { error: scheduleManyConflictMessage(conflicts), status: 409, conflicts };
  }

  const rows = [];
  for (const { item, row, wanted, patch } of [...items].sort((a, b) => Number(a.row.seq) - Number(b.row.seq))) {
    const blocked = gate(row);
    if (blocked) return { error: `งวดที่ ${row.seq}: ${blocked}`, status: 400 };
    if (wanted.error) return { error: `งวดที่ ${row.seq}: ${wanted.error}`, status: 400 };
    const billingException = item.billingException === true;
    const v4 = scheduleValueError(row, wanted.value, { billingException, rule, ruleUnavailable });
    if (v4) return { error: `งวดที่ ${row.seq}: ${v4}`, status: 400 };
    /* ติ๊กเปลี่ยนก่อนรัน 0393 — บอกให้รันมิก ไม่ใช่ PGRST204 ดิบตอนเขียน (งวดอื่นในคำขอยังไม่ถูกเขียน) */
    if (Object.hasOwn(patch, 'billingSkip') && !skipReady) return { error: BILLING_V4_SCHEMA_MISSING, status: 503 };
    const exceptions = scheduleExceptionsOf(row, { ...wanted.value, billingException }, rule);
    rows.push({ id: row.id, seq: row.seq, patch, before: row, exceptions });
  }
  return { rows };
}

/**
 * เขียนทีละงวดตามลำดับเลขงวด — route เรียกหลัง `scheduleManyCheck` ผ่านครบทุกงวดแล้ว
 * ⭐ `update(id, patch, expectedUpdatedAt)` = `updateInstallment` แบบมีเงื่อนไข updatedAt ของแถวที่ด่านเพิ่งตัดสิน
 *   (คืนแถวใหม่ · `null` = แถวเปลี่ยนไปแล้ว) — ไม่มี RPC ⇒ ไม่มีทรานแซกชัน ⇒ อีกหน้าต่างเขียนแทรก = **หยุดที่งวดนั้น**
 *   งวดที่ลงไปแล้วคงอยู่ **ไม่ย้อน** (ย้อนเองก็แข่งได้อีกชั้น) · ผู้เรียกลง audit งวดที่ลงแล้วก่อนตอบ 409
 * ⚠️ พังตั้งแต่งวดแรก = ยังไม่มีอะไรลงฐาน ⇒ **โยน error เดิม** ให้ผู้เรียกแปลแบบเขียนงวดเดียว (มิก 0389 · รหัสของฐาน)
 * @returns `{ before, after, stopped }` — before/after = เฉพาะงวดที่เขียนจริง (ป้อน audit ตรง ๆ) ·
 *   `stopped` = null (ครบ) | `{ id, seq, error }` (`error` null = แถวเปลี่ยนไปแล้ว · ไม่ null = ฐานตีกลับ)
 */
export async function writeScheduleMany(planned = [], update) {
  const before = [];
  const after = [];
  for (const plan of planned) {
    let updated;
    try {
      updated = await update(plan.id, plan.patch, plan.before.updatedAt);
    } catch (error) {
      if (!after.length) throw error;
      return { before, after, stopped: { id: plan.id, seq: plan.seq, error } };
    }
    if (!updated) return { before, after, stopped: { id: plan.id, seq: plan.seq, error: null } };
    before.push(plan.before);
    after.push(updated);
  }
  return { before, after, stopped: null };
}

/* งวดทั้งใบหลังเขียนครบ เมื่ออ่านงวดสดซ้ำไม่ขึ้น — งวดก่อนเขียน (`live`) ที่แทนด้วยแถวที่เพิ่งเขียน (`after`)
   ⭐ ทุกงวดลงฐาน + audit แล้ว ⇒ อ่านพลาดตรงนั้นห้ามกลายเป็น 500 "บันทึกไม่สำเร็จ" (คนกดซ้ำแล้วได้ "ตรงกับที่บันทึกไว้แล้ว" งง ๆ)
   · `after` มาจาก updateInstallment `select('*')` — รูปเดียวกับ loadInstallments แทนทั้งแถวได้ (รวม updatedAt ใหม่ ⇒ ร่างรอบหน้าไม่ 409 หลอก)
   ⚠️ ใช้เฉพาะตอนเขียนครบ — หยุดกลางทางต้องได้งวดสดจริง (งวดที่หยุดเปลี่ยนจากอีกหน้าต่าง ชุดนี้ไม่มีรุ่นนั้น) */
export function installmentsAfterWrite(live = [], after = []) {
  const written = new Map((after || []).map((row) => [row.id, row]));
  return (Array.isArray(live) ? live : []).map((row) => written.get(row.id) || row);
}

/* เหตุของงวดที่หยุด เมื่อแถวเปลี่ยนไประหว่างเขียน (`stopped.error` เป็น null) */
export const SCHEDULE_MANY_ROW_STALE = 'งวดนี้เพิ่งถูกแก้จากอีกหน้าต่าง';

/* 409 ของการบันทึกที่หยุดกลางทาง — บอกว่าลงแล้วกี่งวด หยุดที่งวดไหนเพราะอะไร · กดซ้ำปลอดภัย (งวดที่ค่าตรงแล้วถูกข้าม)
   `stopped` = `{ seq, message }` */
export function scheduleManyStoppedMessage(saved, stopped) {
  const head = saved > 0 ? `บันทึกแล้ว ${saved} งวด หยุดที่งวด ${stopped.seq}` : `ยังไม่ได้บันทึก — หยุดที่งวด ${stopped.seq}`;
  return `${head} — ${stopped.message} · โหลดงวดล่าสุดแล้วบันทึกงวดที่เหลืออีกครั้ง`;
}
