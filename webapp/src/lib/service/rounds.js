// ── รอบบริการ + ตารางนัดเข้าไซต์ (mig 0188) — logic ล้วน ──────────────────
//
// ⭐ `service_visits` คือ "ตาราง" ที่ผู้ใช้ขอ · ไฟล์นี้คือกฎทั้งหมดของมัน:
// gen นัดตามรอบ · เตือนเวลาทับกัน · เตือนวิ่งข้ามเขต · เตือนนอกช่วงที่ไซต์ให้เข้า
//
// ไฟล์นี้ไม่แตะ DB — ใช้ได้ทั้ง client (ปฏิทิน/ฟอร์ม) และ server (validate + gen)
import { getHolidays } from '@/lib/pm/dateHelpers';
import { addDays } from '@/lib/datePeriods';
import { accessConflict, minutesOf, toHHMM } from './sites';
import { businessDate } from '@/lib/businessDate';
import { fmtNumber } from '@/lib/format';
import { VISIT_STATUSES, canRescheduleVisit, isClosedVisit, isLiveVisit } from './visitStatus';
import {
  CADENCE_ERRORS, cadenceOf, cadenceSlots, countSlots, horizonEndFor, isIsoDay,
  nextPlannedAfter, normalizeCadence, plannedDateOfSlot, plannedVisits, sameCadence, slotPeriod,
} from './cadence';

export const PLAN_KINDS = ['refill', 'maintenance', 'inspect'];
export const VISIT_KINDS = ['install', 'refill', 'maintenance', 'repair', 'inspect', 'remove', 'survey'];

/* ชนิดที่ **คนเลือกเองได้ในโมดัลนัด** — `survey` ไม่อยู่ในนี้โดยตั้งใจ (mig 0314)
   ⭐ นัดประเมินพื้นที่เกิดจาก **ใบคำร้อง** ตอน TS ลงคิว ไม่ใช่จากการกดสร้างนัดเปล่า
      ⇒ วันบนนัดกับวันบนใบเป็นค่าเดียวกันเสมอ · ปล่อยให้สร้างมือได้เมื่อไร จะมีนัด
      ประเมินที่ไม่มีใบต้นเรื่อง แล้วผลวัดไม่รู้จะส่งกลับไปที่ไหน
   (กติกาเดียวกับที่ไซต์เกิดจากคำร้องทางเดียว — มติ 2026-08-30) */
export const VISIT_KINDS_MANUAL = VISIT_KINDS.filter((kind) => kind !== 'survey');
/* สถานะย้ายไปอยู่ที่ lib/service/visitStatus.js ทั้งชุด (mig 0300) — ที่นั่นเป็น
   ที่เดียวที่ตอบว่า "อยู่บนตาราง" / "ปิดจบแล้ว" / "ยังรอลงมือ" หมายถึงอะไร
   re-export ไว้เพื่อไม่ให้ผู้เรียกเดิม 2 ที่ต้องแก้ import พร้อมกัน */
export {
  VISIT_STATUSES, VISIT_STATUS_LABELS, VISIT_STATUSES_MANUAL,
  isDraftVisit, isLiveVisit, isClosedVisit, isOpenVisit,
  canRescheduleVisit, canDeleteVisit,
} from './visitStatus';


// ชนิดรูปหน้างาน — ก่อน/หลัง คือสิ่งที่ลูกค้าถามย้อนหลังจริง
export const ATTACHMENT_KINDS = ['before', 'after', 'other'];
export const ATTACHMENT_KIND_LABELS = { before: 'ก่อน', after: 'หลัง', other: 'อื่น ๆ' };

export const VISIT_KIND_LABELS = {
  install: 'ติดตั้ง',
  refill: 'เติมน้ำหอม',
  maintenance: 'บำรุงรักษา',
  repair: 'ซ่อม',
  inspect: 'ตรวจเช็ค',
  /* ⭐ "ถอนเครื่อง" (มติผู้ใช้ 2026-08-31) — เดิมเขียน "ถอดเครื่อง" · เปลี่ยนแค่ป้าย
     ไม่เพิ่มชนิดใหม่ เพราะ "ถอด" กับ "ถอน" ต่างกันตัวเดียวจนคนเลือกผิดแน่
     ⚠️ ชนิดนี้ **ข้ามด่านสัญญา/เงิน** (`GATE_EXEMPT_KINDS`) — งานถอนเครื่องเกิดตอน
     สัญญาหมดหรือลูกค้าเลิก จึงไม่มีทางผ่านด่านได้เลย · ไม่ข้าม = เครื่องของบริษัท
     ค้างอยู่ที่ลูกค้าตลอดกาล */
  remove: 'ถอนเครื่อง',
  survey: 'ประเมินพื้นที่',
};

// ⭐ "เช้า/บ่าย/เต็มวัน" เป็น **ปุ่มลัดที่เติมเวลาให้** ไม่ใช่คอลัมน์ใน DB —
// เก็บทั้ง slot และเวลาจริงเมื่อไหร่ ก็เพี้ยนหากันเมื่อนั้น (บทเรียนสูตรภาษี 4 ชุด)
export const TIME_PRESETS = [
  { key: 'morning', label: 'เช้า', startTime: '09:00', endTime: '12:00' },
  { key: 'afternoon', label: 'บ่าย', startTime: '13:00', endTime: '17:00' },
  { key: 'fullday', label: 'เต็มวัน', startTime: '09:00', endTime: '17:00' },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* วันของแถว/ฟอร์ม → สิบตัวแรก ('YYYY-MM-DD' · คอลัมน์ date ของฐานคืนรูปนี้อยู่แล้ว) · ว่าง = null
   ⚠️ เลขคณิตวันของรอบทั้งหมดอยู่ที่ cadence.js + datePeriods (สตริงล้วน ไม่มีโซนเวลา) — ไฟล์นี้ไม่สร้าง Date เอง */
const dayOf = (value) => (value === null || value === undefined || value === '' ? null : String(value).slice(0, 10));
const blank = (value) => value === null || value === undefined || value === '';

/* ⚠️ ต้องเป็น **วันที่มีจริงในปฏิทิน** ไม่ใช่แค่รูป 'YYYY-MM-DD' — '2027-02-31' ผ่านรูปได้ แต่คอลัมน์ date ของฐานตีกลับ
      เส้นแก้รอบยกเลิกนัดตามรอบเดิม **ก่อน** บันทึกรอบ ⇒ วันที่ฐานไม่รับต้องตกตั้งแต่ตัวตรวจ ไม่งั้นนัดถูกยกเลิกไปแล้วรอบบันทึกไม่ได้ */
function dateError(value, label) {
  if (!value) return null;
  if (!ISO_DATE.test(String(value))) return `${label}ไม่ถูกต้อง`;
  const year = Number(String(value).slice(0, 4));
  if (year < 2000 || year > 2100) return `${label}อยู่นอกช่วงปีที่เป็นไปได้ (${year})`;
  if (!isIsoDay(String(value))) return `${label}ไม่ถูกต้อง`;
  return null;
}

// ── ตรวจข้อมูลรอบบริการ ──────────────────────────────────────────────────
/* ⭐ ความถี่ของรอบ (mig 0397) ตรวจที่ `normalizeCadence` ตัวเดียว — `value` ได้ **ครบหกช่องเสมอ**
      (`cadenceKind` · `everyDays` · `cadenceEvery` · `cadenceWeekday` · `cadenceMonthDay` · `cadenceMonthDayTo`
      ช่องที่ชนิดนั้นไม่ใช้เป็น null) ⇒ PATCH ที่ผสม `{...before, ...body}` ไม่มีทางเหลือ `everyDays` ของรอบเดิมค้าง
      (CHECK service_plans_cadence_shape จะตีแถวแบบนั้นกลับ)
   ⚠️ ลำดับตรวจ: ไซต์ → ชนิดงาน → วัน → ความถี่ → หมายเหตุ · body ที่ไม่มี `cadenceKind` แต่มี `everyDays` = รอบชนิด days
      (ผู้เรียกรุ่นก่อน 0397 · ข้อความผิดของชนิด days คือข้อความเดิมทุกตัวอักษร) */
export function normalizePlanInput(body = {}) {
  const siteId = String(body.siteId ?? '').trim();
  if (!siteId) return { value: null, error: 'ต้องระบุไซต์' };
  if (!PLAN_KINDS.includes(body.kind)) return { value: null, error: 'ชนิดรอบบริการไม่ถูกต้อง' };

  for (const [field, label] of [['startDate', 'วันเริ่มรอบ'], ['endDate', 'วันสิ้นสุดรอบ']]) {
    const err = dateError(body[field], label);
    if (err) return { value: null, error: err };
  }
  if (!body.startDate) return { value: null, error: 'ต้องระบุวันเริ่มรอบ' };
  if (body.endDate && String(body.endDate) < String(body.startDate)) {
    return { value: null, error: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มรอบ' };
  }

  const cadence = normalizeCadence(body);
  if (cadence.error) return { value: null, error: cadence.error };

  const note = String(body.note ?? '').trim();
  if (note.length > 1000) return { value: null, error: 'หมายเหตุยาวเกิน 1000 ตัวอักษร' };

  return {
    value: {
      siteId,
      salesOrderId: body.salesOrderId || null,
      kind: body.kind,
      ...cadence.value,
      startDate: body.startDate,
      endDate: body.endDate || null,
      assigneeId: body.assigneeId || null,
      assigneeName: String(body.assigneeName ?? '').trim() || null,
      isActive: body.isActive === undefined ? true : !!body.isActive,
      note: note || null,
    },
    error: null,
  };
}

/* ── ผสม body ของ PATCH เข้ากับรอบเดิม (mig 0397 · D12) → `{ merged, error }` ─────────────────────────
   `merged = {...before, ...body}` แล้วส่งต่อให้ `normalizePlanInput` (ซึ่งคืนหกช่องของความถี่ครบเสมอ)
   🔴 body ที่มี `everyDays` แต่ **ไม่บอกชนิด** มาจากหน้าจอรุ่นก่อน 0397 (ฟอร์มเดิมส่ง `everyDays` ทุกครั้ง ค่าตั้งต้น 30):
      · รอบเดิมเป็น days (หรือแถวก่อน 0397) → ยังเป็น days ตามที่ส่งมา — ฟอร์มเดิมพูดได้แค่เรื่องนี้ จึงถูกต้อง
      · รอบเดิมตั้งตามปฏิทินแล้ว → **ปฏิเสธ** (`CADENCE_ERRORS.staleClient`) — ไม่งั้นแท็บเก่าที่แก้แค่ชื่อเจ้าหน้าที่
        จะเปลี่ยน "ทุกเดือน วันที่ 22" เป็น "ทุก 30 วัน" เงียบ ๆ
   ⚠️ `cadenceKind` ที่ส่งมาเป็นค่าว่าง (null / '') นับว่า "ไม่บอกชนิด" เหมือนไม่ส่ง — กติกาเดียวกับ normalizeCadence */
export function mergePlanPatch(before = {}, body = {}) {
  const merged = { ...(before || {}), ...(body || {}) };
  if (blank(body?.cadenceKind) && !blank(body?.everyDays)) {
    const kind = cadenceOf(before)?.kind || 'days';
    if (kind !== 'days') return { merged: null, error: CADENCE_ERRORS.staleClient };
    merged.cadenceKind = 'days';
  }
  return { merged, error: null };
}

// ── การเลื่อนนัด (S-5) ───────────────────────────────────────────────────
//
// ⭐ "เลื่อน" = เปลี่ยน **วันที่นัด** ของนัดที่ยังไม่ปิด · เปลี่ยนเวลาในวันเดิมไม่นับ
// (ขยับ 30 นาทีเพราะรถติดไม่ใช่เรื่องที่ต้องอธิบายให้ลูกค้าฟัง)
/* ── "ความถี่นี้จะได้กี่นัด" (PR-D · mig 0326) ────────────────────────────
   ⭐ **ตัวประมาณ ไม่ใช่ตัวบังคับ** (มติผู้ใช้) — จำนวนรอบที่ขายเป็นข้อผูกพันอ้างอิง
   ระบบไม่บล็อกถ้าไม่ตรง · ตัวเลขนี้มีไว้ให้คนตั้งความถี่เห็นทันทีว่าที่ตั้งไว้จะได้
   นัดใกล้เคียงกับที่ขายไหม (เดิมต้องคิดเลขในหัวหรือรู้ตัวตอนสิ้นปี)

   ⚠️ ไม่มีวันสิ้นสุด = ตอบ null ไม่ใช่เดาว่าหนึ่งปี — รอบเปิดปลายเปิดคือรอบที่ยัง
   ไม่มีข้อผูกพันปลายทาง การเดาให้เลขจะกลายเป็น "ตัวเลขที่ดูเหมือนจริง" ทันที
   ⚠️ นับแบบรวมวันเริ่ม: เริ่ม 1 ม.ค. จบ 31 ธ.ค. ทุก 30 วัน = 13 นัด (ไม่ใช่ 12)
   เพราะนัดแรกเกิดวันเริ่มรอบเสมอ */
/* ⭐ ตัวนับเป็นของ cadence.js (`countSlots`) ตั้งแต่ mig 0397 — รับ "ของหน้าตาเหมือนรอบ" ทุกชนิด
      (`{ startDate, endDate, everyDays }` แบบเดิม = ชนิด days ได้เลขเดิมทุกกรณี · รอบตามปฏิทิน = จำนวนช่องของรอบ) */
export function estimateVisitCount(args = {}) {
  return countSlots(args);
}

/* ── คำเรียกจำนวนรอบที่ขาย (มติเจ้าของ 29/09: "ไปกี่รอบ" → "จำนวนรอบบริการ") ─────────────────────────
   ⭐ คำเดียวกับฝั่งใบสั่งขาย · ฝั่ง TS อ่านจากที่นี่ที่เดียว: หัวคอลัมน์/การ์ด "จำนวนรอบบริการ" ของแถวรอตั้งรอบ ·
      แถบบริบท + ชิปความถี่ + บรรทัดประมาณนัดของโมดัลรอบบริการ · สรุปไซต์
   ⚠️ เปลี่ยนแค่คำเรียกจำนวนรอบ — คำบอกความถี่ ("ทุก 33 วัน") และคำ "แต่ละครั้ง" คงเดิม */
export const ROUNDS_SOLD_LABEL = 'จำนวนรอบบริการ';

/** "จำนวนรอบบริการ 12 รอบ" */
export const roundsSoldSentence = (rounds) => `${ROUNDS_SOLD_LABEL} ${fmtNumber(rounds)} รอบ`;

/* บรรทัดประมาณนัดของโมดัลรอบบริการ — เปิดจากใบ/แถวคิว = ตัวเลขของใบนั้น · เปิดจากหน้าไซต์ = ของทั้งไซต์ (คำต้องบอกให้ตรง) */
export const PLAN_ROUNDS_SOLD_HINT = Object.freeze({
  ofOrder: `${ROUNDS_SOLD_LABEL}ของใบนี้`,
  ofSite: `${ROUNDS_SOLD_LABEL}ที่ฝ่ายขายระบุ`,
  diff: (n) => `ต่างจาก${ROUNDS_SOLD_LABEL} ${fmtNumber(n)} นัด (ตั้งต่อได้ ไม่ใช่ข้อห้าม)`,
});

/* ── "จำนวนรอบบริการ n รอบ ⇒ ทุกกี่วัน" (PR-C · C-D7) — ตัวกลับของ estimateVisitCount ─────────────────────
   ⭐ **ข้อเสนอให้คนกด ไม่ใช่ค่าตั้งต้นเงียบ ๆ** — แถว "รอตั้งรอบ" กับชิปในโมดัลรอบบริการอ่านตัวนี้ตัวเดียว
   สูตร: รอบ ≥ 2 → floor(ช่วง ÷ (รอบ − 1)) · รอบเดียว → ช่วง + 1 (นัดเดียวพอดีทั้งช่วง)
   ⇒ ช่วงพอ (ช่วง ≥ รอบ − 1) ได้นัด ≥ ที่ขายเสมอ (ปัดลง = ถี่ขึ้น ไม่ขาด) · `visits` = estimateVisitCount ตัวเดียวกับโมดัล
   ⚠️ ความถี่ตั้งได้ 1–365 วัน (normalizePlanInput) ⇒ เกินเพดาน/ต่ำกว่าพื้น = ตัดแล้วบอก `clamped`
      (2 รอบใน 2 ปี → ทุก 365 วัน ≈ 3 นัด · ได้เกินที่ขาย — จอต้องพูดตรง ๆ ไม่ใช่ทำเป็นพอดี)
   ⚠️ ไม่มีวัน · รอบไม่ใช่จำนวนเต็มบวก · วันกลับด้าน = null (ไม่เดา — กติกาเดียวกับ estimateVisitCount) */
/* ⭐ ตัวจริงย้ายไปอยู่ที่ cadence.js (mig 0397 — คู่กับ `suggestCadence` ที่เสนอได้ทั้งรายเดือน/รายสัปดาห์/ทุก N วัน)
      re-export ไว้ให้ผู้เรียกเดิมไม่ต้องแก้ import · ผลของวันแบบ 'YYYY-MM-DD' เท่าเดิมทุกกรณี */
export { suggestEveryDays } from './cadence';

export function isReschedule(before, after) {
  if (!before || !after) return false;
  /* 🐞 ของเดิมกันแค่ done/cancelled ⇒ แก้วันย้อนหลังของใบ partial/unable จะถูกบังคับ
     กรอกเหตุผล แล้วระบบเขียนเธรดว่า "เลื่อนนัด" ทั้งที่ไม่มีการเลื่อนเกิดขึ้น ·
     และ draft ที่ยังไม่มีลูกค้ารู้เรื่อง เปลี่ยนวันทีต้องพิมพ์เหตุผลที
     ⇒ นิยามเดียวอยู่ที่ visitStatus.canRescheduleVisit */
  if (!canRescheduleVisit(before)) return false;
  return !!before.scheduledDate && !!after.scheduledDate
    && String(before.scheduledDate) !== String(after.scheduledDate);
}

// ข้อความเหตุการณ์ที่ลงเธรด — ต้องอ่านย้อนหลังแล้วเห็นภาพโดยไม่ต้องเปิดนัด
export function rescheduleSummary(before, after, reason) {
  const from = before?.scheduledDate || '—';
  const to = after?.scheduledDate || '—';
  return `เลื่อนนัดจาก ${from} → ${to}${reason ? ` · ${reason}` : ''}`;
}

/* ── รูปหน้างานหนึ่งรูปในช่อง `attachments` ของนัด — คืน `{ value, error }` ─────────────
   ⭐ ยกออกมาจาก `normalizeVisitInput` (แผน operation-crew C5 · S3) — เส้นรูปทีละรูป (`visits/[id]/photos`)
      กับ PATCH ของนัด (แผ่นปิดงาน/แก้ผลที่ส่ง) ต้องตรวจรูปด้วยกติกาเดียวกัน · สองชุดเมื่อไรเพี้ยนหากัน
   ⚠️ URL ว่าง = **ไม่ใช่รูป** → `value: null` ไม่ใช่ error (ช่องว่างจากฟอร์มเก่าข้ามไปเงียบ ๆ ตามเดิม) */
export function normalizeAttachment(raw) {
  const url = String(raw?.url ?? '').trim();
  if (!url) return { value: null, error: null };
  if (url.length > 1000) return { value: null, error: 'ลิงก์ไฟล์แนบยาวเกินไป' };
  return {
    value: {
      url,
      name: String(raw?.name ?? '').trim().slice(0, 200) || 'ไฟล์แนบ',
      kind: ATTACHMENT_KINDS.includes(raw?.kind) ? raw.kind : 'other',
    },
    error: null,
  };
}

// ── ตรวจข้อมูลนัด ────────────────────────────────────────────────────────
export function normalizeVisitInput(body = {}, { existingKind = null } = {}) {
  const siteId = String(body.siteId ?? '').trim();
  if (!siteId) return { value: null, error: 'ต้องระบุไซต์' };
  if (!VISIT_KINDS.includes(body.kind)) return { value: null, error: 'ชนิดงานไม่ถูกต้อง' };
  /* 🔴 **ด่านของ "สร้างมือไม่ได้" ต้องอยู่ที่ API ไม่ใช่แค่ดรอปดาวน์** — ตัดออกจาก
     ตัวเลือกบนจอกันคนกดพลาดได้ แต่ไม่กันการยิง API ตรง ๆ · นัดประเมินที่ไม่มีใบ
     ต้นเรื่องคือนัดที่ผลวัดไม่รู้จะส่งกลับไปที่ไหน
     ⚠️ เส้นที่ถูกต้อง (`createSurveyVisit`) ไม่ผ่านตัวนี้ — มันประกอบแถวเองพร้อม
        `requestId` ⇒ ด่านนี้ไม่ขวางเส้นนั้น
     🐞 **ด่านนี้เป็นของ "สร้าง" เท่านั้น** — PATCH ส่ง `{...before, ...body}` เข้ามา
        ⇒ `kind` มาจากแถวเดิม · เผลอบังคับตอนแก้ด้วยเมื่อไร **นัดประเมินที่ลงคิวไปแล้ว
        จะแก้/เลื่อนจากตารางเจ้าหน้าที่ไม่ได้เลย** (เจอตอนทดสอบสด 2026-08-30) ⇒ ผู้เรียกที่แก้
        ของเดิมส่ง `existingKind` เข้ามาบอกว่านี่คือการแก้ ไม่ใช่การสร้าง */
  if (existingKind === null) {
    if (!VISIT_KINDS_MANUAL.includes(body.kind)) {
      return { value: null, error: 'นัดประเมินพื้นที่สร้างที่นี่ไม่ได้ — เกิดจากใบคำร้องตอน TS ลงคิว' };
    }
  } else if (body.kind !== existingKind
      && (!VISIT_KINDS_MANUAL.includes(body.kind) || !VISIT_KINDS_MANUAL.includes(existingKind))) {
    // สลับชนิดข้ามฝั่งไม่ได้ — นัดประเมินผูกใบคำร้องอยู่ · แปลงเป็นชนิดอื่นคือทิ้งต้นเรื่อง
    return { value: null, error: 'เปลี่ยนชนิดของนัดประเมินพื้นที่ไม่ได้ — นัดนี้เกิดจากใบคำร้อง' };
  }
  if (!body.scheduledDate) return { value: null, error: 'ต้องระบุวันที่นัด' };

  const status = body.status ?? 'scheduled';
  if (!VISIT_STATUSES.includes(status)) return { value: null, error: 'สถานะนัดไม่ถูกต้อง' };

  for (const [field, label] of [
    ['scheduledDate', 'วันที่นัด'], ['actualDate', 'วันที่เข้าจริง'], ['actualEndDate', 'วันที่เสร็จจริง'],
  ]) {
    const err = dateError(body[field], label);
    if (err) return { value: null, error: err };
  }

  // ⚠️ ปิดงานต้องรู้ว่าเข้าจริงวันไหน — `nextAfterDone` นับรอบถัดไปจากวันที่ทำจริง
  // ถ้าปล่อยว่างได้ รอบถัดไปจะเงียบ ๆ กลับไปอิงวันนัดเดิม แล้วตารางเลื่อนสะสมทั้งปี
  // 🐞 ของเดิมบังคับเฉพาะ `done` ⇒ partial/unable บันทึกได้โดยไม่มีวันที่เข้าจริง ทั้งที่
  // เจ้าหน้าที่ไปถึงไซต์แล้ว · ประวัติจะมีแถวที่ไม่รู้ว่าไปวันไหน และจอแสดงว่า "ยังไม่ปิดงาน"
  // ให้ใบที่ปิดไปแล้วจริง ๆ (DB มี CHECK คู่กันที่ mig 0300)
  // ⚠️ อยู่ **ก่อน** ตรวจช่วงเวลา — วันที่เสร็จจริง (ข้างล่าง) ต้องรู้วันเข้าจริงก่อนจึงจะเทียบเวลาได้
  const visited = isClosedVisit({ status });
  const actualDate = visited ? (body.actualDate || body.scheduledDate) : (body.actualDate || null);
  if (visited && !actualDate) return { value: null, error: 'ปิดงานต้องระบุวันที่เข้าจริง' };

  const times = {};
  for (const [field, label] of [
    ['startTime', 'เวลาเริ่ม'], ['endTime', 'เวลาสิ้นสุด'],
    ['actualStartTime', 'เวลาเริ่มจริง'], ['actualEndTime', 'เวลาสิ้นสุดจริง'],
  ]) {
    const raw = String(body[field] ?? '').trim();
    if (!raw) { times[field] = null; continue; }
    if (minutesOf(raw) === null) return { value: null, error: `${label}ไม่ถูกต้อง` };
    times[field] = toHHMM(raw);
  }
  /* ⭐ **วันที่เสร็จจริง** (mig 0386 · มติเจ้าของ 24/09 ข้อ 4) — งานที่เริ่มวันหนึ่งแล้วส่งงาน/ปิดงาน
     อีกวัน · NULL = เสร็จวันเดียวกับวันเข้า (แถวเดิมทุกแถว) · มีค่า = วันหลังวันเข้าเสมอ (CHECK คู่กัน)
     ⚠️ เก็บแบบเดียวต่อความหมายเดียว: ไม่มีวันเข้า/ไม่มีเวลาจบ = ไม่มีวันเสร็จ · วันเดียวกับวันเข้า = NULL
        (สองแบบแทนค่าเดียวกัน = ฐานตีกลับ และคนอ่านไม่รู้ว่าอันไหนจริง) */
  let actualEndDate = String(body.actualEndDate ?? '').trim().slice(0, 10) || null;
  const actualDay = actualDate ? String(actualDate).slice(0, 10) : null;
  if (!actualDay || !times.actualEndTime || actualEndDate === actualDay) actualEndDate = null;
  if (actualEndDate && actualEndDate < actualDay) {
    return { value: null, error: 'วันที่เสร็จจริงต้องไม่ก่อนวันที่เข้าจริง' };
  }

  for (const [from, to, label] of [
    ['startTime', 'endTime', 'เวลานัด'],
    ['actualStartTime', 'actualEndTime', 'เวลาที่เข้าจริง'],
  ]) {
    /* ⚠️ เวลา "ที่นัดไว้" ยังบังคับเริ่ม < สิ้นสุด (คนกรอกเอง ช่วงศูนย์นาทีไม่มีความหมาย)
       แต่เวลา "ที่เข้าจริง" ยอมให้เท่ากันได้ (mig 0300) — เมื่อเวลามาจากการประทับจริง
       งานที่เริ่มและจบในนาทีเดียวกันมีจริง (เปลี่ยนก้าน reed จุดเดียว · เข้าไปดูแล้วออก)
       ⚠️ เวลาที่เข้าจริงเทียบกันเฉพาะงานที่จบวันเดียวกัน — จบวันหลัง เวลาจบเช้ากว่าเวลาเริ่มได้ */
    const strict = from === 'startTime';
    if (!strict && actualEndDate) continue;
    const bad = strict
      ? minutesOf(times[from]) >= minutesOf(times[to])
      : minutesOf(times[from]) > minutesOf(times[to]);
    if (times[from] && times[to] && bad) {
      return { value: null, error: `${label}: เวลาเริ่มต้องไม่หลังเวลาสิ้นสุด` };
    }
  }

  // "ไปแล้วทำไม่ได้" ต้องอธิบายได้เสมอ — ใบที่ไม่มีเหตุผลคือใบที่ตอบลูกค้าไม่ได้
  const unableReason = String(body.unableReason ?? '').trim();
  if (status === 'unable' && unableReason.length < 10) {
    return { value: null, error: 'สถานะ “ทำไม่ได้” ต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร' };
  }
  if (unableReason.length > 500) return { value: null, error: 'เหตุผลยาวเกิน 500 ตัวอักษร' };

  const summary = String(body.summary ?? '').trim();
  if (summary.length > 2000) return { value: null, error: 'สรุปงานยาวเกิน 2000 ตัวอักษร' };
  const note = String(body.note ?? '').trim();
  if (note.length > 1000) return { value: null, error: 'หมายเหตุยาวเกิน 1000 ตัวอักษร' };

  const assistantIds = Array.isArray(body.assistantIds)
    ? body.assistantIds.map((v) => String(v)).filter(Boolean)
    : [];

  // ── รูปหน้างาน + ลายเซ็น (S-3) ──
  // ⚠️ **ไม่บังคับทั้งคู่** (มติผู้ใช้ 2026-07-30) — ลูกค้าไม่อยู่หน้างานมีจริง และ
  // สัญญาณมือถือที่ไซต์แย่เป็นเรื่องปกติ · บังคับแล้วเจ้าหน้าที่จะปิดงานไม่ได้ตรงนั้น
  // แล้วไปบันทึกย้อนหลังทีหลัง ซึ่งทำให้เวลาที่บันทึกผิดทั้งชุด
  const attachments = [];
  if (Array.isArray(body.attachments)) {
    for (const raw of body.attachments) {
      const { value: att, error: attError } = normalizeAttachment(raw);
      if (attError) return { value: null, error: attError };
      if (att) attachments.push(att);
    }
  }

  const signature = String(body.customerSignatureUrl ?? '').trim();
  if (signature.length > 1000) return { value: null, error: 'ลิงก์ลายเซ็นยาวเกินไป' };

  return {
    value: {
      siteId,
      planId: body.planId || null,
      kind: body.kind,
      scheduledDate: body.scheduledDate,
      startTime: times.startTime,
      endTime: times.endTime,
      assigneeId: body.assigneeId || null,
      assigneeName: String(body.assigneeName ?? '').trim() || null,
      assistantIds,
      status,
      actualDate,
      actualStartTime: times.actualStartTime,
      actualEndTime: times.actualEndTime,
      /* ⚠️ ใส่คีย์เฉพาะเมื่อผู้เรียกส่งมา — PATCH ส่ง `{...before, ...body}` ⇒ แถวจากฐานที่รัน 0386 แล้ว
         มีคีย์นี้เสมอ · สร้างนัดใหม่ / ฐานที่ยังไม่รัน 0386 ไม่มีคีย์ ⇒ ไม่ส่งคอลัมน์ที่ไม่มีอยู่ไปให้ฐาน */
      ...('actualEndDate' in body ? { actualEndDate } : {}),
      unableReason: unableReason || null,
      summary: summary || null,
      note: note || null,
      attachments,
      customerSignatureUrl: signature || null,
    },
    error: null,
  };
}

// ── ความยาวนัดเป็นนาที ───────────────────────────────────────────────────
// ใช้รวมชั่วโมงงานต่อวันและเรียงชิปบนปฏิทิน · ไม่รู้เวลา = null (ไม่เดาเป็น 0)
export function visitMinutes(visit) {
  const start = minutesOf(visit?.startTime);
  const end = minutesOf(visit?.endTime);
  if (start === null || end === null) return null;
  return Math.max(0, end - start);
}

// เรียงนัดตามเวลา · นัดที่ยังไม่ระบุเวลาไปท้ายสุด (ยังไม่ถูกวางลงช่วงเวลาไหน)
export function sortByTime(visits = []) {
  return [...visits].sort((a, b) => {
    const am = minutesOf(a?.startTime);
    const bm = minutesOf(b?.startTime);
    if (am === null && bm === null) return String(a?.code || '').localeCompare(String(b?.code || ''));
    if (am === null) return 1;
    if (bm === null) return -1;
    return am - bm;
  });
}

// ── วันที่ควรเข้าตามรอบ ──────────────────────────────────────────────────
// วันที่ตกวันหยุด/เสาร์-อาทิตย์ **เลื่อนหนี** — เจ้าหน้าที่ไม่ได้เข้าไซต์วันหยุด
//   ชนิด days      เลื่อนไปวันทำการถัดไป (ข้ามเดือนได้ — กติกาเดิม ไม่เปลี่ยน)
//   ตามปฏิทิน      ไปข้างหน้าโดยไม่ข้ามเดือน/สัปดาห์/ช่วงวัน ไปไม่ได้จึงถอยหลัง (มติเจ้าของ 29/09 · mig 0397)
// ⚠️ การเลื่อนไม่สะสม: รอบถัดไปนับจากวันตามรอบ (ก่อนเลื่อน) ไม่ใช่วันที่เลื่อนแล้ว
//    ไม่งั้นรอบ "ทุก 30 วัน" จะค่อย ๆ ถอยไปเรื่อย ๆ จนกลายเป็นทุก 35 วันภายในปีเดียว
/* ⭐ ตัวเดินรอบอยู่ที่ cadence.js (`plannedVisits`) — ไฟล์นี้แค่ส่งต่อ ⇒ รอบทุกชนิดได้วันจากตัวเดียวกับโมดัลและตัวเติมนัด
   ⚠️ `holidays` = Set ของ 'YYYY-MM-DD' · ไม่ส่ง = ชุดกลางของ pm/dateHelpers (เทสต์เดิม + ฝั่ง client เดินเหมือนเดิม)
      🔴 **โค้ดฝั่ง server ของโมดูลบริการต้องส่งเองเสมอ** (`planGen.loadPlanHolidays` · `holidaySet`) — ชุดกลางนั้น
         ถูก route อื่นเขียนทับรายคำขอ (`setHolidays`) จึงไม่ใช่ของที่ฝั่ง server พึ่งได้ */
export function plannedDates(plan, { from, to, holidays = getHolidays() } = {}) {
  return plannedVisits(plan, { from, to, holidays }).map((visit) => visit.date);
}

// ── นัดที่ต้อง gen เพิ่ม ─────────────────────────────────────────────────
// ⭐ gen สั้น ไม่ gen ทั้งปี: นัดที่ gen ล่วงหน้า 12 เดือนคือ 12 แถวที่จะถูก
// เลื่อนทุกเดือนแล้วไม่มีใครกล้าลบ · gen สั้น + ต่อรอบตอนปิดงานจริง ทำให้ตาราง
// สะท้อนของจริงเสมอ
// ⚠️ ระยะมองล่วงหน้า = `horizonDaysFor(plan)` เมื่อผู้เรียกไม่ส่ง: days 90 วันเท่าเดิม · รอบตามปฏิทินอย่างน้อยหนึ่งงวดเต็ม
//    (รอบทุก 3 เดือนที่มองแค่ 90 วันอาจไม่มีนัดข้างหน้าเลย)
// ⚠️ ปลายช่วง = `horizonEndFor`: รอบตามปฏิทินที่ **ยังไม่เริ่ม** นับระยะจากวันเริ่มรอบ (ไม่ใช่จากวันนี้) ⇒ ได้นัดแรกเสมอ
//    และตรงกับ "นัดถัดไป" ที่โมดัลโชว์ (ตัวเดียวกัน) · days นับจากวันนี้เท่าเดิม
export function ensureVisits(plan, existing = [], { from = null, horizonDays = null, holidays = getHolidays() } = {}) {
  if (!plan?.isActive) return [];
  const startIso = dayOf(from) || businessDate();
  if (!isIsoDay(startIso)) return [];

  /* นัดที่มีอยู่แล้วของรอบนี้ — นัดที่ถูกยกเลิก **ยังนับว่ามี**
     ไม่งั้นยกเลิกแล้วระบบ gen กลับมาให้ใหม่ทุกครั้งที่เปิดหน้า

     ⭐ **กันซ้ำด้วย "ช่องของรอบ" ไม่ใช่ด้วยวันนัด** (mig 0397 · `planSlotDate`) — ช่องถือว่ามีนัดแล้วเมื่อนัดของรอบนี้
        (a) จำช่องนั้นไว้ (`planSlotDate === ช่อง`) — ย้ายวันนัดไปไหนก็ยังเป็นนัดของช่องเดิม ⇒ ไม่ถูกสร้างซ้ำที่วันเดิม
            และวันหยุดที่เพิ่มทีหลังก็ไม่ทำให้ช่องเดิมได้นัดใบที่สอง
        (b) ไม่มีช่อง (นัดก่อน 0397 · นัดที่คนผูกรอบเอง) และ **วันนัดตรงกับวันที่ระบบจะนัดให้ช่องนั้น** — กติกาเดิม
     ⚠️ นัดที่ถูกยกเลิก **เพราะเปลี่ยนรอบ** ไม่อยู่ในชุดนี้ — เส้น PATCH ถอดมันออกจากรอบแล้ว (`planId` ว่าง)
        ⇒ เปลี่ยนรอบแล้วเปลี่ยนกลับ ช่องเดิมยังสร้างนัดได้ (ไม่งั้นรอบจะไม่มีนัดเปิดอีกเลย)

     🔴 **`v.planId === plan.id` คือกฎ ไม่ใช่ความหละหลวม — ห้าม dedup ข้ามรอบ**
     (มติผู้ใช้ 2026-09-02: *"2 SO ก็ต้อง 2 รอบ"*)
     ⭐ รอบเป็นข้อผูกพัน **ของใบสั่งขาย** ⇒ ไซต์เดียวที่ขายไว้สองใบ ต้องเดินสองรอบ
       และ `service_visits.planId` เก็บได้ค่าเดียว ⇒ นัดหนึ่งใบนับ n/N ให้ได้ใบเดียว
       ⇒ ยุบเป็นนัดเดียวเมื่อไร **ใบที่สองจะนับรอบขาดเงียบ ๆ ตลอดสัญญา**
     ⚠️ ผลคือสองนัดวันเดียวกันที่ไซต์เดียวกัน ซึ่ง **ถูกต้องแล้ว** และเข้ากับมติเดิม
       ของใบส่งงาน (2026-08-27): ใบหนึ่งครอบเฉพาะโซนที่ SO ของมันครอบ (`zoneGates`)
       ⇒ ช่างไปเที่ยวเดียวปิดสองใบได้ แต่ *เอกสาร* ต้องแยกตามข้อผูกพัน
     🪤 ถ้าจะ "แก้นัดซ้อน" ให้แก้ที่จอ (บอกให้ชัดว่าคนละใบ) ไม่ใช่ที่นี่ */
  const mine = existing.filter((v) => v.planId === plan.id);
  const takenSlots = new Set(mine.filter((v) => v.planSlotDate).map((v) => dayOf(v.planSlotDate)));
  const takenDates = new Set(mine.filter((v) => !v.planSlotDate).map((v) => dayOf(v.scheduledDate)));

  return plannedVisits(plan, { from: startIso, to: horizonEndFor(plan, startIso, horizonDays), holidays })
    .filter((visit) => !takenSlots.has(visit.slot) && !takenDates.has(visit.date))
    .map((visit) => ({
      siteId: plan.siteId,
      planId: plan.id,
      kind: plan.kind,
      scheduledDate: visit.date,
      planSlotDate: visit.slot,
      assigneeId: plan.assigneeId || null,
      assigneeName: plan.assigneeName || null,
      /* ⚠️ ไม่ใส่ status ที่นี่ — **ด่านเป็นคนตัดสิน** (`initialVisitStatus` ที่ planGen)
         ของเดิมยัด 'scheduled' ตรงนี้ ⇒ นัดที่ไม่มีเจ้าหน้าที่ขึ้นตารางไปเงียบ ๆ แล้วไม่มีใครไป */
    }));
}

// ── นัดถัดไปหลังปิดงาน ───────────────────────────────────────────────────
// ⭐ ชนิด days: นับจาก **วันที่ทำจริง** ไม่ใช่วันที่นัดไว้ — เข้าช้า 5 วัน รอบถัดไปต้องขยับตาม
// ไม่งั้นนัดถัดไปจะมาเร็วกว่าที่ควรทุกครั้งที่เข้าช้า แล้วรอบก็รวนสะสม
/* ⭐ รอบตามปฏิทิน (mig 0397): ข้อเสนอ = **นัดตามรอบตัวถัดไป** หลัง max(วันที่ทำจริง, วันที่นัด) — วันของรอบไม่ไหลตามวันที่ทำ
      ("วันที่ 22" เข้าช้าไป 28 รอบหน้ายังเป็น 22 ของเดือนถัดไป) · ถ้านัดที่เพิ่งปิดจำช่องของตัวเองไว้ ข้อเสนอต้องเป็นช่อง
      ที่ **หลังช่องนั้น** (นัดของช่อง 22 พ.ย. ที่ย้ายมาทำ 10 พ.ย. ไม่ถูกเสนอ 23 พ.ย. ซึ่งคือช่องของมันเอง)
      ข้อเสนอของรอบตามปฏิทินพก `planSlotDate` ไปด้วย ⇒ นัดที่คนกดยืนยันจากแถบ "ตั้งนัดรอบถัดไป" จำช่องได้เหมือนนัดที่ระบบเติม
   ⚠️ ข้อเสนอของชนิด days **ไม่มี** `planSlotDate` (วันที่เสนอนับจากวันที่ทำจริง ไม่ใช่ช่องของรอบ) — รูปเดิมทุกคีย์
   ⚠️ `holidays` ไม่ส่ง = ชุดกลางของ pm/dateHelpers · เส้น PATCH ของนัดส่งชุดจากตาราง holidays เอง */
export function nextAfterDone(plan, visit, { holidays = getHolidays() } = {}) {
  const cadence = plan?.isActive ? cadenceOf(plan) : null;
  if (!cadence) return null;
  const suggestion = (scheduledDate, slot) => ({
    siteId: plan.siteId,
    planId: plan.id,
    kind: plan.kind,
    scheduledDate,
    ...(slot ? { planSlotDate: slot } : {}),
    assigneeId: plan.assigneeId || visit?.assigneeId || null,
    assigneeName: plan.assigneeName || visit?.assigneeName || null,
    status: 'scheduled',
  });

  const actual = dayOf(visit?.actualDate);
  const scheduled = dayOf(visit?.scheduledDate);
  if (cadence.kind === 'days') {
    const anchor = actual || scheduled;
    if (!isIsoDay(anchor)) return null;
    const next = addDays(anchor, cadence.everyDays);
    const planEnd = dayOf(plan.endDate);
    if (planEnd && next > planEnd) return null;
    return suggestion(plannedDateOfSlot(plan, next, holidays), null);
  }

  const after = [actual, scheduled].filter(isIsoDay).sort().pop();
  if (!after) return null;
  const next = nextPlannedAfter(plan, after, holidays, { afterSlot: visit?.planSlotDate || null });
  return next ? suggestion(next.date, next.slot) : null;
}

/* ── เปลี่ยนตารางของรอบที่มีนัดอยู่แล้ว (mig 0397 · คำตอบเจ้าของข้อ 2 + 4) ────────────────────────────
   แก้ความถี่/ช่วงวันของรอบ → นัดที่ระบบสร้างไว้ตามรอบเดิมและ **ยังไม่ได้เข้า · ไม่มีใครย้ายวัน** ต้องถูกยกเลิก
   หลังคนยืนยันในโมดัลที่บอกผลก่อน ("ยกเลิกนัดตามรอบเดิม n นัด") · ตัวนี้ตอบว่านัดใบไหนตกกลุ่มไหน — เส้น PATCH เป็นคนเขียน

   `after` = รอบตามที่จะบันทึก (มี `id`) · `visits` = นัดของรอบ (ทุกสถานะ) · คืน
     cancel       นัดตามรอบเดิมที่จะถูกยกเลิก + ถอดออกจากรอบ (ต้องได้คำยืนยันครบทุกใบก่อน — `cancelConfirmation`)
     reslot       นัดที่ยังไม่ได้เข้าซึ่ง **อยู่ต่อเป็นนัดของรอบใหม่** — เก็บนัดไว้ ย้ายแค่ช่องที่มันถือ · มีสองเหตุ
                  (1) วันนัดตรงกับวันที่รอบใหม่นัดให้ช่องที่ยังว่าง ไม่ว่าคนย้ายมาหรือระบบวางไว้
                      (ทุก 30 วัน → ทุกเดือน วันที่ 22: นัดวันจันทร์ 23 พ.ย. ของช่องเดิม 21 พ.ย. คือวันเดียวกับที่ช่องใหม่ 22 พ.ย.
                      ซึ่งตรงวันอาทิตย์จะถูกนัด ⇒ ไม่ยกเลิกแล้วสร้างใหม่ให้คนจัดคิวเสียของที่จัดไว้)
                  (2) ช่องของรอบใหม่ในงวดนี้ (เดือน/สัปดาห์) **เลยวันไปแล้ว** ตัวเติมนัดจึงสร้างให้ไม่ได้อีก — ยกเลิกนัดใบนี้
                      งวดนี้จะไม่มีนัดเลย (วันที่ 22 → 15 ตอนวันที่ 20: นัด 22 ต้องอยู่ต่อ ไม่งั้นเดือนนี้หายทั้งรอบ)
     keptMoved    คนย้ายวันเองแล้ว (วันนัด ≠ วันที่รอบ **เดิม** นัดให้ช่องนั้น) — ไม่ยกเลิก
     keptStarted  กำลังทำ — ไม่ยกเลิก
     keptPast     เลยวันนัดแล้ว (งานค้าง คนจัดคิวตัดสินเอง) — ไม่ยกเลิก
     keptManual   นัดของรอบที่ยังไม่ได้เข้าและ **ไม่มีช่อง** (คนตั้งเอง · ยืนยันจากแถบ "ตั้งนัดรอบถัดไป" ของรอบทุก N วัน)
                  — ไม่เคยถูกแตะ แค่นับให้จอบอก และนับเฉพาะตอนตารางของรอบเปลี่ยนจริง (ความถี่ · วันเริ่ม · วันสิ้นสุด)
     hold         `{ visit, slot }` นัดที่ **ไม่ถูกยกเลิก** (สามกลุ่ม kept ข้างบน + นัดที่จบไปแล้ว: เข้าแล้ว · ทำไม่ครบ · ทำไม่ได้ ·
                  คนยกเลิกเอง · เลื่อนแล้ว) ซึ่งวันนัดอยู่ในงวดของช่องใหม่ที่ยังว่าง ⇒ ถือช่องนั้น ตัวเติมนัดจึงไม่สร้างนัดใบที่สอง
                  ลงงวดเดียวกัน (คำตอบเจ้าของข้อ 2: หนึ่งงวดหนึ่งนัด) — วันที่ 15 → 22 หลังนัดวันที่ 15 ปิดงานแล้ว ไม่ได้นัด 22 ซ้อน
     release      นัดในสามกลุ่ม kept ที่ไม่มีช่องใหม่ให้ถือ ⇒ ล้างช่องเดิมทิ้ง กลายเป็นนัดของรอบที่ไม่มีช่อง
                  🔴 ห้ามปล่อยให้ถือช่องของรอบเดิมค้าง — บันทึกรอบครั้งถัดไป (แก้แค่หมายเหตุ) จะตัดสิน "ย้ายเอง" ใหม่กับรอบที่
                     ไม่ได้สร้างนัดใบนั้น แล้วเสนอยกเลิกนัดที่คนย้ายด้วยมือ (เจอจริงตอนรีวิว 01/10)
   กติกา:
     · รอบถูกปิด (`isActive` false) · ความถี่ใหม่อ่านไม่ออก · วันเริ่ม/สิ้นสุดใหม่ไม่ใช่วันจริง = ว่างทุกกลุ่ม (ไม่แตะนัด)
     · นัดที่ถือช่องซึ่งยังเป็นช่องของรอบใหม่ = นัดตามรอบใหม่อยู่แล้ว ไม่อยู่ในกลุ่มไหน (วันนัดเป็นวันไหนก็ตาม)
     · ยกเลิกได้เฉพาะนัดที่ **ช่องเป็นช่องของรอบเดิมจริง** — ช่องที่ไม่ได้มาจากรอบเดิม (กดบันทึกซ้ำหลังบันทึกรอบไปแล้วแต่
       ย้ายช่องไม่ครบ) ไม่รู้ที่มา จึงเก็บไว้เสมอ แล้วให้ถือช่องใหม่/ล้างช่องตามกติกาเดียวกัน ⇒ กดซ้ำแล้วจบที่เดิม
     · "ย้ายเอง" เทียบกับรอบเดิมด้วยวันหยุดชุดปัจจุบัน — สงสัยเมื่อไร **เก็บไว้** ไม่ยกเลิก
     · งวด = เดือนของช่อง (รายเดือน รวมแบบช่วงวัน) / สัปดาห์ อาทิตย์–เสาร์ ของช่อง (รายสัปดาห์) · ทุก N วันไม่มีงวด
       ⇒ ถือช่องได้ทางเดียวคือวันนัดตรงกัน · งวดที่จบไปแล้วทั้งงวดไม่ถูกแตะ (ไม่เขียนย้อนประวัติ)
     · ช่องหนึ่งรับได้นัดเดียว: วันนัดตรงกันก่อน → นัดที่ไม่ถูกยกเลิก → นัดที่รอยกเลิก (เฉพาะช่องที่เลยวันแล้ว)
     · ทุกกลุ่มเรียงตามวันนัด แล้วตาม id */
const OPEN_VISIT_STATUSES = ['draft', 'scheduled', 'in_progress'];

/** ตารางของรอบเปลี่ยนไหม — ความถี่ · วันเริ่ม · วันสิ้นสุด (เจ้าหน้าที่ · หมายเหตุ · ใบสั่งขาย ไม่ใช่ตาราง) */
function planScheduleChanged(before, after) {
  return !sameCadence(before, after)
    || dayOf(before?.startDate) !== dayOf(after?.startDate)
    || dayOf(before?.endDate) !== dayOf(after?.endDate);
}

export function planScheduleDiff({
  before = null, after = null, visits = [], todayIso = businessDate(), holidays = getHolidays(),
} = {}) {
  const out = {
    cancel: [], reslot: [], keptMoved: [], keptStarted: [], keptPast: [], keptManual: [], hold: [], release: [],
  };
  if (!after?.isActive || !cadenceOf(after)) return out;
  const today = dayOf(todayIso);
  const afterEnd = dayOf(after.endDate);
  if (!isIsoDay(today) || !isIsoDay(dayOf(after.startDate)) || (afterEnd !== null && !isIsoDay(afterEnd))) return out;

  const mine = (visits || []).filter((v) => v.planId === after.id);
  const dateOf = (v) => dayOf(v.scheduledDate) || '';
  const byDateThenId = (a, b) => {
    const x = dateOf(a);
    const y = dateOf(b);
    return x < y ? -1 : x > y ? 1 : String(a.id).localeCompare(String(b.id));
  };
  const isOpen = (v) => OPEN_VISIT_STATUSES.includes(v.status);

  if (planScheduleChanged(before, after)) {
    out.keptManual = mine.filter((v) => !v.planSlotDate && isOpen(v) && dateOf(v) >= today).sort(byDateThenId);
  }

  const slotted = mine.filter((v) => v.planSlotDate);
  if (!slotted.length) return out;
  const heldSlots = slotted.map((v) => dayOf(v.planSlotDate)).sort();
  const heldRange = { from: heldSlots[0], to: heldSlots[heldSlots.length - 1] };
  const live = new Set(cadenceSlots(after, heldRange));
  const stale = slotted.filter((v) => !live.has(dayOf(v.planSlotDate))).sort(byDateThenId);   // ช่องไม่ใช่ช่องของรอบใหม่
  if (!stale.length) return out;

  /* นัดใบนี้เป็นอะไร: settled จบไปแล้ว · started กำลังทำ · past เลยวันนัด · unknown ช่องไม่ได้มาจากรอบเดิม ·
     moved คนย้ายวัน · due ระบบวางไว้ตามรอบเดิมและยังไม่มีใครแตะ (ใบเดียวที่ยกเลิกได้) */
  const origin = cadenceOf(before) ? new Set(cadenceSlots(before, heldRange)) : new Set();
  const classOf = (visit) => {
    if (!isOpen(visit)) return 'settled';
    if (visit.status === 'in_progress') return 'started';
    if (dateOf(visit) < today) return 'past';
    const slot = dayOf(visit.planSlotDate);
    if (!origin.has(slot)) return 'unknown';
    return dateOf(visit) !== plannedDateOfSlot(before, slot, holidays) ? 'moved' : 'due';
  };
  const kinds = new Map(stale.map((visit) => [visit, classOf(visit)]));

  /* ช่องของรอบใหม่ที่ยังว่าง (ไม่มีนัดของรอบนี้ถือ — ทุกสถานะ) รอบ ๆ นัดพวกนี้ · `span` = งวดของช่อง (ทุก N วัน = null) */
  const dates = stale.map(dateOf).filter(isIsoDay);
  const lo = dates.length && dates[0] < today ? dates[0] : today;
  const hi = dates.length && dates[dates.length - 1] > today ? dates[dates.length - 1] : today;
  const held = new Set(heldSlots);
  const free = cadenceSlots(after, { from: addDays(lo, -31), to: addDays(hi, 31) })
    .filter((slot) => !held.has(slot))
    .map((slot) => {
      const period = slotPeriod(after, slot);
      return { slot, date: plannedDateOfSlot(after, slot, holidays), span: period ? (period.fallback || period) : null };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.slot < b.slot ? -1 : 1)));
  const taken = new Set();
  const placed = new Set();
  const keep = (visit) => {
    const kind = kinds.get(visit);
    if (kind === 'moved') out.keptMoved.push(visit);
    else if (kind === 'started') out.keptStarted.push(visit);
    else if (kind === 'past') out.keptPast.push(visit);
  };

  /* ① วันนัดตรงกับวันที่รอบใหม่นัดให้ช่องที่ตัวเติมนัดยังสร้างได้ (วันนัด ≥ วันนี้) — วันเดียวมีหลายช่อง = ช่องแรก ใบแรก */
  const exact = new Map();
  for (const item of free) if (item.date >= today && !exact.has(item.date)) exact.set(item.date, item);
  for (const visit of stale) {
    const hit = exact.get(dateOf(visit));
    if (!hit) continue;
    exact.delete(hit.date);
    taken.add(hit.slot);
    placed.add(visit);
    const kind = kinds.get(visit);
    if (kind === 'settled' || kind === 'started') {
      out.hold.push({ visit, slot: hit.slot });
      keep(visit);
    } else {
      out.reslot.push({ visit, slot: hit.slot });
    }
  }

  /* ช่องว่างของงวดที่วันนั้นอยู่ — เฉพาะงวดที่ยังไม่จบ (วันสุดท้ายของงวด ≥ วันนี้) */
  const slotOfPeriod = (date) => free.find((item) => item.span && !taken.has(item.slot)
    && item.span.to >= today && date >= item.span.from && date <= item.span.to) || null;

  /* ② นัดที่ไม่ถูกยกเลิก ถือช่องของงวดที่มันอยู่ · ไม่มีช่องให้ถือ = ล้างช่องเดิม (นัดที่จบไปแล้วไม่แตะ) */
  for (const visit of stale) {
    const kind = kinds.get(visit);
    if (placed.has(visit) || kind === 'due') continue;
    const item = slotOfPeriod(dateOf(visit));
    if (item) {
      taken.add(item.slot);
      out.hold.push({ visit, slot: item.slot });
    } else if (kind !== 'settled') {
      out.release.push(visit);
    }
    keep(visit);
  }

  /* ③ นัดที่รอยกเลิก: งวดของมันยังไม่มีนัดใบไหนถือช่อง และช่องนั้นเลยวันไปแล้ว = อยู่ต่อ · นอกนั้นยกเลิก */
  for (const visit of stale) {
    if (placed.has(visit) || kinds.get(visit) !== 'due') continue;
    const item = slotOfPeriod(dateOf(visit));
    if (item && item.date < today) {
      taken.add(item.slot);
      out.reslot.push({ visit, slot: item.slot });
    } else {
      out.cancel.push(visit);
    }
  }

  const byVisit = (a, b) => byDateThenId(a.visit, b.visit);
  out.reslot.sort(byVisit);
  out.hold.sort(byVisit);
  for (const group of [out.keptMoved, out.keptStarted, out.keptPast]) group.sort(byDateThenId);
  return out;
}

/* คำยืนยันจากจอครอบนัดที่ server จะยกเลิกครบไหม (D13) → `{ ok, stale }`
   ok    = **ทุกใบ** ที่จะถูกยกเลิกอยู่ในรายการที่จอยืนยันมา (ยืนยันมาเกินได้ — นัดที่ปิด/เริ่ม/ย้ายไประหว่างนั้นหลุดออกเอง
           ⇒ กดบันทึกซ้ำหลังยกเลิกไปครึ่งทางไม่ถูกถามใหม่)
   stale = ยืนยันมาแล้วแต่ไม่ครบ (มีนัดใหม่ที่เข้าข่ายหลังจอเปิดรายการ) — จอต้องโชว์รายการใหม่ให้ดูอีกรอบ */
export function cancelConfirmation(diff, cancelVisitIds) {
  const confirmed = new Set(Array.isArray(cancelVisitIds) ? cancelVisitIds.map(String) : []);
  const missing = (diff?.cancel || []).filter((visit) => !confirmed.has(String(visit.id)));
  return { ok: missing.length === 0, stale: missing.length > 0 && confirmed.size > 0 };
}

// "อยู่บนตาราง" มีนิยามเดียวอยู่ที่ visitStatus.js — ห้ามเขียนซ้ำที่นี่

// ── โหลดงานรายคนรายวัน ───────────────────────────────────────────────────
// เตือนเมื่อเจ้าหน้าที่คนเดียวถูกนัดเกินที่ทำไหวในวันเดียว
export function dayLoad(visits = [], { perPersonPerDay = 5 } = {}) {
  const map = new Map();
  for (const visit of visits) {
    if (!isLiveVisit(visit)) continue;
    const key = `${visit.assigneeId || 'unassigned'}|${visit.scheduledDate}`;
    const entry = map.get(key) || {
      assigneeId: visit.assigneeId || null,
      assigneeName: visit.assigneeName || null,
      date: visit.scheduledDate,
      count: 0,
      minutes: 0,
      unknownTime: 0,
      visits: [],
    };
    entry.count += 1;
    const mins = visitMinutes(visit);
    if (mins === null) entry.unknownTime += 1; else entry.minutes += mins;
    entry.visits.push(visit);
    map.set(key, entry);
  }
  return [...map.values()].map((entry) => ({
    ...entry,
    over: entry.count > perPersonPerDay,
  }));
}

// ── สองช่วงเวลาทับกันไหม ────────────────────────────────────────────────
/**
 * ⭐ ตัวตัดสินเดียวของ "เวลาทับ" — ตารางใช้กับคู่นัดที่มีช่วงครบ (`overlaps`) · ตัวเลือกเจ้าหน้าที่
 *    ในโมดัลจัดคิวใช้เตือนว่าคนนั้นมีนัดชนกับเวลาที่กำลังกรอกไหม (รวมนัดที่รู้แค่เวลาเริ่ม)
 * @param a,b `{ startTime, endTime }` — มีแค่ `startTime` = **จุดเวลา** (เช่นนัดประเมิน "11:00")
 * · ช่วง × ช่วง — ทับเมื่อ `a.start < b.end && b.start < a.end` · ติดกันพอดี (11:00 จบ / 11:00 เริ่ม) ไม่ทับ
 * · จุด × ช่วง — ทับเมื่อจุดอยู่ใน `[start, end)` (จุดที่ตรงเวลาจบพอดีไม่ทับ — กติกาเดียวกับติดกันพอดี)
 * · จุด × จุด — **ไม่ทับ** · ไม่รู้ว่ากินเวลาเท่าไร จะเดาว่าชนก็ไม่ได้
 * · ฝั่งไหนไม่มีเวลาเริ่ม — ไม่ทับ (ไม่รู้เวลา ไม่ใช่ ทับกัน)
 * ⚠️ **เตือนอย่างเดียว** — ไม่มีด่านไหนบล็อกด้วยตัวนี้
 */
export function windowsOverlap(a, b) {
  const aStart = minutesOf(a?.startTime);
  const bStart = minutesOf(b?.startTime);
  if (aStart === null || bStart === null) return false;
  const aEnd = minutesOf(a?.endTime);
  const bEnd = minutesOf(b?.endTime);
  if (aEnd !== null && bEnd !== null) return aStart < bEnd && bStart < aEnd;
  if (aEnd !== null) return bStart >= aStart && bStart < aEnd;
  if (bEnd !== null) return aStart >= bStart && aStart < bEnd;
  return false;
}

// ── นัดของเจ้าหน้าที่คนเดียวกันที่เวลาทับกัน ────────────────────────────────────
// ⚠️ นัดที่ **ไม่ระบุเวลา** ชนกับใครไม่ได้ — ไม่รู้เวลา ไม่ใช่ ทับกัน
// ⚠️ นัดที่ **รู้แค่เวลาเริ่ม** ก็ไม่เข้าคู่บนตาราง (ชิปวาดเป็นจุด ไม่ใช่ช่วง) — `windowsOverlap`
//    รู้จักจุดเวลาแล้ว แต่ตารางยังจับคู่เฉพาะช่วงครบเหมือนเดิม (ป้ายบนชิปไม่เปลี่ยน)
// ⚠️ เจ้าหน้าที่คนละคนไม่นับว่าทับ แม้เวลาเดียวกันเป๊ะ (คนละคันรถ คนละไซต์)
// ⚠️ นัดที่ยังไม่มอบหมายคนก็ไม่นับ — ยังไม่รู้ว่าใครไป จะทับใครก็ยังไม่รู้
export function overlaps(visits = []) {
  const byPerson = new Map();
  for (const visit of visits) {
    if (!isLiveVisit(visit)) continue;
    if (!visit.assigneeId) continue;
    const start = minutesOf(visit.startTime);
    const end = minutesOf(visit.endTime);
    if (start === null || end === null) continue;
    const key = `${visit.assigneeId}|${visit.scheduledDate}`;
    if (!byPerson.has(key)) byPerson.set(key, []);
    byPerson.get(key).push({ visit, start, end });
  }

  const pairs = [];
  for (const rows of byPerson.values()) {
    rows.sort((a, b) => a.start - b.start);
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1];
      const cur = rows[i];
      // ติดกันพอดี (11:00 จบ / 11:00 เริ่ม) ไม่ถือว่าทับ — กติกาอยู่ที่ `windowsOverlap`
      if (windowsOverlap(prev.visit, cur.visit)) {
        pairs.push({
          assigneeId: cur.visit.assigneeId,
          assigneeName: cur.visit.assigneeName || null,
          date: cur.visit.scheduledDate,
          a: prev.visit,
          b: cur.visit,
        });
      }
    }
  }
  return pairs;
}

// เซ็ต id ของนัดที่ติดปัญหาเวลาทับ — ใช้แปะป้ายบนชิปปฏิทินโดยตรง
export function overlappingVisitIds(visits = []) {
  const ids = new Set();
  for (const pair of overlaps(visits)) {
    if (pair.a?.id) ids.add(pair.a.id);
    if (pair.b?.id) ids.add(pair.b.id);
  }
  return ids;
}

// ── วิ่งข้ามเขตในวันเดียว ────────────────────────────────────────────────
// จัดกลุ่มนัดของเจ้าหน้าที่คนหนึ่งในวันหนึ่งตาม **เขตวิ่งงาน** ของไซต์ (routeZone —
// 'BKK-E' / 'ปริมณฑล') · ≥2 เขต = ขึ้นป้ายเตือน
// (สาเหตุที่ตารางเลื่อนบ่อยที่สุดคือรถติดระหว่างเขต ไม่ใช่งานที่ไซต์นาน)
// ⚠️ คนละเรื่องกับ "โซน" (service_zones) ที่เป็นพื้นที่ย่อยในไซต์
export function routeZoneSplit(visits = [], sitesById = new Map()) {
  const map = new Map();
  for (const visit of visits) {
    if (!isLiveVisit(visit)) continue;
    const key = `${visit.assigneeId || 'unassigned'}|${visit.scheduledDate}`;
    const routeZone = sitesById.get(visit.siteId)?.routeZone || null;
    const entry = map.get(key) || {
      assigneeId: visit.assigneeId || null,
      assigneeName: visit.assigneeName || null,
      date: visit.scheduledDate,
      routeZones: new Set(),
      count: 0,
    };
    entry.count += 1;
    if (routeZone) entry.routeZones.add(routeZone);
    map.set(key, entry);
  }
  return [...map.values()].map((entry) => ({
    ...entry,
    routeZones: [...entry.routeZones],
    crossRouteZone: entry.routeZones.size > 1,
  }));
}

// ── ป้ายเตือนของนัดหนึ่งใบ ───────────────────────────────────────────────
// ⭐ **เตือน ไม่บล็อก** ทุกข้อ — ลูกค้าอนุโลมเป็นครั้ง ๆ ได้ และระบบที่บล็อก
// จะถูกเลี่ยงไปนัดนอกระบบ แล้วตารางก็ตายทั้งใบ
export function visitWarnings(visit, { site = null, overlapIds = new Set() } = {}) {
  const out = [];
  const conflict = accessConflict(site, {
    date: visit?.scheduledDate,
    startTime: visit?.startTime,
    endTime: visit?.endTime,
  });
  if (conflict) out.push({ kind: conflict.kind, message: conflict.message });
  if (visit?.id && overlapIds.has(visit.id)) {
    out.push({ kind: 'overlap', message: 'เวลาทับกับนัดอื่นของเจ้าหน้าที่คนเดียวกัน' });
  }
  return out;
}

// ── สรุปช่วงเวลาของนัดสำหรับแสดงบนชิป ────────────────────────────────────
export function visitTimeText(visit) {
  const start = toHHMM(visit?.startTime);
  const end = toHHMM(visit?.endTime);
  if (start && end) return `${start}–${end}`;
  if (start) return `${start}`;
  return 'ทั้งวัน';
}
