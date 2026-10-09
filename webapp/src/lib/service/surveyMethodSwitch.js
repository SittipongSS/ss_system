// ── สลับวิธีประเมินรายพื้นที่: แผนเดียวที่ทั้งโมดัล กล่องยืนยัน และ server ใช้ (งวด S2a §2.2) ────────
//
// ⭐ **`surveyMethodSwitchPlan` ตัวเดียว = ข้อความในกล่องผลลัพธ์ = บรรทัดเธรด = กระดิ่ง = สิ่งที่ถูกเขียน**
//   โมดัลเรียกตอนหัวหน้าเลือก · route เรียกอีกครั้งจากแถวจริงแล้วส่ง `writes` ให้ `runSurveyMethodPlan`
//   (`surveyMethodWrites.js`) ซึ่ง **อ่านแต่ `writes` ไม่คิดซ้ำ** ⇒ จอบอกอย่างไร ฐานได้อย่างนั้น
//   แยกสองที่เมื่อไร = กล่องบอกว่า "นัดจะถูกยกเลิก" แต่ server ไม่ได้ยกเลิก โดยไม่มีอะไรฟ้อง
//
// ⭐ ข้อความไทยของฟีเจอร์นี้อยู่ที่นี่ที่เดียว — ทุกกลุ่มดึงค่าคงที่ไปใช้ ห้ามพิมพ์ซ้ำ
//
// 🔴 **ไฟล์ล้วน** — ไม่แตะฐานข้อมูล ไม่อ่าน `process.env` ไม่อ่านสวิตช์ `SURVEY_DRAWING_METHOD` เอง
//   (จอจะดึงไฟล์นี้เข้า bundle · route เป็นคนส่ง `enabled` มา)
// 🔴 **ดึงได้สี่โมดูลข้างล่างเท่านั้น** และ `survey.js` · `surveyMethod.js` · `attachmentTypes.js` ห้ามดึงไฟล์นี้กลับ
//   (วงกลม attachmentTypes → survey → surveyMethod — ยามอยู่ที่ `surveyMethodSwitch.test.mjs` ข้อ ⑮)
//   ⇒ `surveyDeskCommitPatch` (`surveyVisit.js`) ดึงมาไม่ได้: patch ของ "รับปากวันส่งผล" ประกอบเองข้างล่าง
//     และเทสต์ข้อ ② เทียบกับตัวจริงทุกคีย์
import { fmtDate } from '@/lib/format';
import { VISIT_STATUS_LABELS } from '@/lib/service/visitStatus';
import { surveyEditLockError, surveyZoneName } from '@/lib/service/survey';
import { isDrawingZone, surveyMethodMix, surveyNeedsVisit, zoneMethod } from '@/lib/service/surveyMethod';

export const SURVEY_METHOD_LABEL = { onsite: 'ลงหน้างาน', drawing: 'ประเมินจากแบบ' };
export const SURVEY_METHOD_CHIP = { onsite: 'ลงหน้างาน', drawing: 'จากแบบ' };
export const SURVEY_CONFIRM_LABEL = { needed: 'ต้องยืนยันหน้างาน', not_needed: 'ไม่ต้องยืนยันหน้างาน' };
export const SURVEY_CONFIRM_MISSING = 'ยังไม่ได้เลือกว่าต้องยืนยันหน้างานไหม';
export const SURVEY_ZONE_TAG = { awaiting: 'ประเมินจากแบบ · รอยืนยันหน้างาน', drawing: 'ประเมินจากแบบ' };
export const SURVEY_METHOD_BUTTON = 'เปลี่ยนวิธีประเมิน';
export const SURVEY_METHOD_MODAL_TITLE = 'วิธีประเมินรายพื้นที่';
export const SURVEY_METHOD_REASON_LABEL = 'เหตุผล (ฝ่ายขายจะเห็น)';
export const SURVEY_METHOD_REASON_MIN = 10;
export const SURVEY_METHOD_REASON_MAX = 300; // CHECK ของ mig 0408
export const SURVEY_METHOD_REASON_CHIPS = [
  'หน้างานยังก่อสร้าง', 'เข้าพื้นที่แล้วแต่ยังก่อสร้าง', 'ลูกค้ายังไม่ให้เข้า', 'ฝ่ายขายขอประเมินจากแบบ', 'แบบไม่พอ ต้องดูของจริง',
];
export const SURVEY_METHOD_SHORTCUTS = { onsite: 'ทั้งใบ: ลงหน้างาน', drawing: 'ทั้งใบ: ประเมินจากแบบ' };
export const SURVEY_METHOD_RESULT_DATE_LABEL = 'วันที่จะส่งผลประเมิน';
export const SURVEY_METHOD_CANCEL_ONLY_REASON = 'ใบนี้ประเมินจากแบบทั้งใบ ไม่มีการเข้าพื้นที่';
export const SURVEY_METHOD_ERRORS = {
  off: 'ยังไม่เปิดใช้การประเมินจากแบบ',
  role: 'เปลี่ยนวิธีประเมินได้เฉพาะหัวหน้าฝ่ายบริการ',
  notAcknowledged: 'กด “รับเรื่อง” ก่อน แล้วค่อยเปลี่ยนวิธีประเมิน',
  sentButton: 'ส่งผลไปแล้ว — ดึงผลกลับมาแก้ก่อน แล้วค่อยเปลี่ยนวิธีประเมิน',
  sentRoute: 'ส่งผลไปแล้ว — เปลี่ยนวิธีประเมินไม่ได้ โหลดหน้าใหม่',
  reason: 'ต้องบอกเหตุผลอย่างน้อย 10 ตัวอักษร',
  resultDate: 'ต้องระบุวันที่จะส่งผลประเมิน',
  stale: 'ใบนี้ถูกแก้โดยคนอื่นระหว่างที่เปิดกล่องนี้ — โหลดหน้าใหม่',
  partial: 'บันทึกไม่ครบ — กด “บันทึกวิธีประเมิน” อีกครั้ง',
  nothing: 'ยังไม่ได้เปลี่ยนวิธีประเมินของพื้นที่ไหน',
};

/* ข้อความที่สเปค §7 ขอให้เจ้าของเคาะ — รวมไว้ตรงนี้ให้แก้ที่เดียวเมื่อได้คำตอบ
   ⚠️ สองตัวล่างซ้ำคำกับ `normalizeSurveyCommittedResult` / กติกาเหตุผลของระบบโดยตั้งใจ (ดึงไฟล์นั้นมาไม่ได้ — หัวไฟล์) */
export const SURVEY_METHOD_BODY_ERROR = 'วิธีประเมินไม่ถูกต้อง'; // body ของ route ผิดรูป (changes · actionId · seenMix) — 400
const REASON_TOO_LONG_ERROR = `เหตุผลยาวเกิน ${SURVEY_METHOD_REASON_MAX} ตัวอักษร`;
const RESULT_DATE_BAD_ERROR = 'วันที่จะส่งผลประเมินไม่ถูกต้อง';
const CUT_CONFIRM_LABEL = 'ตัดพื้นที่และยกเลิกนัด';

/* ⭐ ชื่อขั้นบนรางของ **งานโต๊ะ** (ทุกพื้นที่ประเมินจากแบบ · แผน survey-desk-assessment §3.1) — ใบแบบนี้ไม่ลงคิว
   และไม่มีนัดเข้าพื้นที่ ⇒ ชื่อขั้นกลางสองขั้นของรางหน้างาน ("ลงคิว / นัด" · "เข้าพื้นที่") เล่าเรื่องที่ไม่ได้เกิด
   ⚠️ เปลี่ยนแต่ **ชื่อ** — รหัสขั้น ลำดับ และตำแหน่งขั้นปัจจุบันยังมาจาก `requestRailSteps` ตัวเดิม (ทะเบียน `fieldRail` ไม่ถูกแตะ)
   ⚠️ คีย์ต้องครบหกขั้นของราง — ขาดคีย์ไหน ขั้นนั้นถอยไปใช้ชื่อของรางหน้างาน
   ⭐ อยู่ที่นี่ที่เดียว — ไทม์ไลน์หน้าคำร้อง (`surveyJob.js`) · การ์ดควบคุม (`surveyControl.js`) · รางบนแผงของหน้าคำร้อง (งวด S2b)
      ใช้แผนที่ตัวเดียวกัน (สองชุดที่ชื่อไม่ตรงกัน = สองฝ่ายคุยคนละเรื่องทั้งที่ดูใบเดียวกัน) */
export const SURVEY_DESK_RAIL_LABELS = {
  draft: 'ส่งคำร้อง',
  pending: 'รับเรื่อง',
  commitDue: 'รับปากวันส่งผล',
  acknowledged: SURVEY_METHOD_LABEL.drawing,
  answered: 'ส่งผล',
  closed: 'ปิดเรื่อง',
};
const DESK_RAIL_NO_HINT = ['commitDue', 'acknowledged'];

/**
 * ขั้นของ `requestRailSteps` ในคำของงานโต๊ะ — ชื่อจาก `SURVEY_DESK_RAIL_LABELS` · บรรทัดใต้ขั้นกลางสองขั้นถูกล้าง
 * (รางกลางเขียน "รอ … ลงคิว" / เลขนัดเก่าไว้ตรงนั้น — งานโต๊ะไม่มีคิวและไม่มีนัดให้พูดถึง)
 * ⚠️ ผู้เรียกเป็นคนถามว่าใบเป็นงานโต๊ะไหม (`surveyNeedsVisit(rows) === false`) — ตัวนี้ไม่ถาม แค่แปลงคำ
 */
export function surveyDeskRailSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map((step) => {
    const label = SURVEY_DESK_RAIL_LABELS[step?.id];
    if (!label) return step;
    return DESK_RAIL_NO_HINT.includes(step.id) ? { ...step, label, hint: null } : { ...step, label };
  });
}

/**
 * ป้ายที่มาของพื้นที่ที่ **ถูกเพิ่มบนใบ** (ไม่ได้มาจากคำร้อง) — แถวที่ไม่ได้ถูกเพิ่ม = `null`
 *   ลงหน้างาน = "เพิ่มหน้างาน" (ช่างเพิ่มตอนอยู่หน้างาน) · จากแบบ = "เพิ่มโดย {ฝ่าย}" (หัวหน้าเพิ่มที่โต๊ะ ไม่มีใครอยู่หน้างาน)
 * ⭐ กติกาเดียวทุกจอ — ตารางของฝ่ายขาย · รายการพื้นที่ · หัวหน้าพื้นที่ · ตารางสรุปส่งผล (จอวาดคำนี้ ไม่พิมพ์คำตายตัวเอง)
 */
export function surveyZoneAddedLabel(zone, dept) {
  if (zone?.status !== 'added') return null;
  return isDrawingZone(zone) ? `เพิ่มโดย ${text(dept) || 'TS'}` : 'เพิ่มหน้างาน';
}

/** หัวกระดิ่งของหัวหน้าคนอื่นเมื่อใบกลายเป็นงานประเมินจากแบบ — แผนใช้ และเส้นแก้/ลบพื้นที่ใช้ตอนใบพลิกโดยไม่มีแผน (สถานะ ①) */
export const surveyDeskReadyTitle = (request) => `คำร้องประเมินจากแบบ ${request?.docNo || request?.id} — รอหัวหน้าประเมิน`;

const list = (v) => (Array.isArray(v) ? v : []);
const text = (v) => String(v ?? '').trim();
const isCut = (row) => (row?.status || 'ok') === 'cut';
const sameId = (a, b) => a != null && b != null && String(a) === String(b);
/* สองค่าของวิธี — ใช้กับ **เป้าใน body** และ **สำเนาแถวในหน่วยความจำ** ("ก่อน" / "หลัง" ของแผน) เท่านั้น
   ⚠️ ไฟล์นี้ไม่อ่านค่าคอลัมน์ของแถวเอง (ถามผ่าน `zoneMethod` / `isDrawingZone`) และไม่เขียนฐาน — ตัวเขียนคือ `surveyMethodWrites.js` */
const ONSITE = 'onsite';
const DRAWING = 'drawing';
const METHODS = [ONSITE, DRAWING];
const other = (to) => (to === DRAWING ? ONSITE : DRAWING);
const asMethod = (row, to) => ({ ...row, method: to });
const isDateKey = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const OPEN_VISIT = ['draft', 'scheduled', 'in_progress'];
const CANCELLABLE_VISIT = ['draft', 'scheduled'];

/**
 * ปุ่ม "เปลี่ยนวิธีประเมิน" — `{ show, allowed, reason }`
 * `show`    = สวิตช์เปิด + เป็นหัวหน้า + ใบยังไม่ถูกยกเลิก / ไม่ได้ปิดโดยไม่ได้ผล
 * `allowed` = โชว์ และใบอยู่ในสภาพที่ route รับ (`surveyMethodRequestError` ว่าง)
 * `reason`  = เหตุที่กดไม่ได้ (คำของ **ปุ่ม** — ส่งผลแล้วให้ดึงผลกลับ ไม่ใช่ "โหลดหน้าใหม่" ของ route)
 * ⚠️ ผู้วางคิวและช่าง **ไม่เห็นปุ่มเลย** (ไม่ใช่ปุ่มจาง) — ไม่มีสิทธิ์ = ไม่โชว์ · ติดด่าน = โชว์แล้วบอกเหตุ
 */
export function surveyMethodSwitchGate(request, { canSwitch = false, enabled = false } = {}) {
  const ended = !request || !!request.cancelledAt || (request.status === 'closed' && !request.answeredAt);
  const show = !!enabled && !!canSwitch && !ended;
  if (!show) return { show: false, allowed: false, reason: null };
  if (request.answeredAt) return { show, allowed: false, reason: SURVEY_METHOD_ERRORS.sentButton };
  const error = surveyMethodRequestError(request);
  return { show, allowed: !error, reason: error };
}

/**
 * สภาพของใบที่ route สลับวิธีไม่รับ — คืนข้อความ หรือ `null` เมื่อสลับได้
 * ลำดับ: ส่งผลแล้ว → ใบล็อก (ยกเลิก / ปิด — คำของ `surveyEditLockError`) → ยังไม่รับเรื่อง
 */
export function surveyMethodRequestError(request) {
  if (request?.answeredAt) return SURVEY_METHOD_ERRORS.sentRoute;
  const locked = surveyEditLockError(request);
  if (locked) return locked;
  if (request.status === 'draft' || request.status === 'pending' || !request.acknowledgedAt) {
    return SURVEY_METHOD_ERRORS.notAcknowledged;
  }
  return null;
}

/**
 * รูปของ `body.changes` — `{ value: [{ zoneId, method }], error }`
 * ต้องเป็นอาร์เรย์ · `method` เป็น `'onsite'` หรือ `'drawing'` ตรงตัว · พื้นที่หนึ่งมาได้ครั้งเดียว · `[]` ใช้ได้ (ยกเลิกนัดอย่างเดียว)
 * ⚠️ **ไม่ตรวจกับแถว** (`rows` ไม่ถูกอ่าน) — แถวที่ไม่มี / ถูกตัด / ถึงเป้าแล้ว เป็นเรื่องของแผน ซึ่งตอบว่า "ล้าสมัย" ไม่ใช่ "รูปผิด"
 * ⚠️ `zoneId` ถูกแปลงเป็นสตริง — id จาก body กับ id บนแถวเทียบกันผ่าน `String()` เสมอ
 */
export function surveyMethodChanges(input, rows) {
  const bad = { value: null, error: SURVEY_METHOD_BODY_ERROR };
  if (!Array.isArray(input)) return bad;
  const seen = new Set();
  const value = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') return bad;
    const { zoneId: raw, method } = item;
    if (typeof raw !== 'string' && typeof raw !== 'number') return bad;
    const zoneId = String(raw).trim();
    if (!zoneId || seen.has(zoneId)) return bad;
    if (!METHODS.includes(method)) return bad;
    seen.add(zoneId);
    value.push({ zoneId, method });
  }
  return { value, error: null };
}

/**
 * เลขประจำ **การกดหนึ่งครั้ง** ที่จอส่งมา — ใช้ได้คืนตัวเดิม ใช้ไม่ได้คืน `null`
 * สัญญากับจอ (S2b): เปิดโมดัล / กล่องยืนยันใหม่ทุกครั้ง = เลขใหม่ · แก้ช่องไหนหลังส่งพลาด = เลขใหม่ ·
 * ส่ง body เดิมซ้ำเท่านั้นจึงใช้เลขเดิม
 */
export function surveyMethodActionId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null;
}

/**
 * กุญแจกันซ้ำของการกดครั้งนั้น — อยู่ใน `meta.key` ของบรรทัดเธรดบนใบ · `meta.methodKey` ของบรรทัดยกเลิกบนนัด · `dedupeKey` ของกระดิ่ง
 * ⚠️ **ชี้ "ครั้งที่กด" ไม่ใช่ "เนื้อหา"** — เหตุผลมาจากชิปห้าตัว: สลับ → สลับกลับ → สลับอีกด้วยชิปเดิม คือสามเหตุการณ์จริง
 *    ที่เนื้อหาเหมือนกันทุกตัวอักษร · กุญแจจากเนื้อหาจะกลืนบรรทัดเธรดครั้งที่สาม และกระดิ่งกันซ้ำถาวรที่ unique index
 */
export function surveyMethodPlanKey({ userId, actionId } = {}) {
  return `${String(userId)}|${actionId}`;
}

/**
 * ข้อความตัวนับความคืบหน้า — `progress` = ผลของ `surveyFieldProgress`
 *   ไม่มีพื้นที่จากแบบ         ⇒ `วัดแล้ว a / b พื้นที่` **ตัวเดิมทุกตัวอักษร**
 *   ผสม                       ⇒ ต่อท้าย ` · จากแบบ k` (+ ` (หัวหน้ากรอกเอง)` เมื่อคนดูเป็นหัวหน้า)
 *   จากแบบทั้งใบ              ⇒ `จากแบบ k พื้นที่`
 * ⚠️ พื้นที่จากแบบไม่ถูกเรียกว่า "วัดแล้ว" ในกรณีไหนเลย
 */
export function surveyProgressText(progress, { owner = false } = {}) {
  const total = Number(progress?.total) || 0;
  const done = Number(progress?.done) || 0;
  const drawing = Number(progress?.drawing) || 0;
  const measured = `วัดแล้ว ${done} / ${total} พื้นที่`;
  if (drawing === 0) return measured;
  if (total === 0) return `จากแบบ ${drawing} พื้นที่`;
  return `${measured} · จากแบบ ${drawing}${owner ? ' (หัวหน้ากรอกเอง)' : ''}`;
}

/** ชื่อพื้นที่ในประโยค — `A · B · C และอีก 2 พื้นที่` (ทรงเดียวกับ `surveySendSiteVisitError`) */
export function surveyZoneNamesText(names, max = 3) {
  const all = list(names);
  const more = all.length > max ? ` และอีก ${all.length - max} พื้นที่` : '';
  return `${all.slice(0, max).join(' · ')}${more}`;
}

/* ── ชิ้นส่วนของแผน ──────────────────────────────────────────────────────── */

const named = (row) => ({ id: row.id, name: surveyZoneName(row) });
const snapshot = (rows) => ({ needsVisit: surveyNeedsVisit(rows), mix: surveyMethodMix(rows) });

/* จัดชั้นการสลับทีละพื้นที่เทียบกับแถวจริง — `todo` ต้องเขียน · `applied` การกดครั้งนี้เขียนไปแล้ว (กดซ้ำ) · `stale` คนอื่นแก้
   ⚠️ แถวที่ถึงเป้าแล้วนับเป็นของการกดนี้ **เฉพาะเมื่อเหตุผลและชื่อคนสลับตรงกัน** — ไม่งั้นการกดซ้ำหลังบันทึกครึ่งทางจะเห็นว่า
      "ไม่มีอะไรเปลี่ยน" แล้ววันกับบรรทัดเธรดหายไปเงียบ ๆ และการสลับของคนอื่นจะถูกนับเป็นของเรา */
function classifyChange(change, rows, { reason, actorName }) {
  const row = rows.find((r) => r && sameId(r.id, change.zoneId));
  const { method: to } = change;
  if (!row || isCut(row)) return { cls: 'stale', row: row || null, to };
  if (zoneMethod(row) !== to) return { cls: 'todo', row, to };
  const mine = text(row.methodReason) === reason && reason !== '' && (row.methodChangedByName || null) === actorName;
  return { cls: mine ? 'applied' : 'stale', row, to };
}

/* 🔴 ลำดับของห้ากิ่งนี้สำคัญ — route พื้นที่เขียน `method: 'drawing'` ลงแถวพร้อมการตัดที่พลิกใบ
   ⇒ ตอนกดยืนยันซ้ำ แถวเป็นทั้ง "ถูกตัด" และ "จากแบบ": ต้องถามเรื่องถูกตัดด้วยเหตุผลเดิมก่อนถามว่าเป็นจากแบบ */
function classifyCut(cut, rows, reason) {
  const row = rows.find((r) => r && sameId(r.id, cut?.zoneId));
  if (!row) return { cls: 'stale', row: null };
  if (isCut(row)) return { cls: text(row.cutReason) === reason ? 'applied' : 'stale', row };
  if (isDrawingZone(row) || row.status === 'added') return { cls: 'stale', row };
  return { cls: 'todo', row };
}

/* patch ของ "รับปากวันส่งผล" — ต้องเท่ากับ `surveyDeskCommitPatch` (`surveyVisit.js`) ทุกคีย์ (ดึงมาไม่ได้ ดูหัวไฟล์) */
const deskCommitPatch = ({ date, actor, nowIso }) => ({
  committedDueDate: date,
  committedResultDate: date,
  committedDueTime: null,
  dueCommittedAt: nowIso,
  assigneeId: String(actor.id),
  assigneeName: actor.name || null,
  assignedAt: nowIso,
});

/* นัดที่ยังค้างกลับมาเป็นนัดของใบ — วัน เวลา ช่าง กลับขึ้นใบ (สามคอลัมน์เดียวกับที่ PATCH ของนัดซิงก์)
   ⚠️ **ไม่มี `committedResultDate`** — คำสัญญาวันส่งผลกับฝ่ายขายเปลี่ยนโดยคนเท่านั้น */
const visitSyncPatch = (visit) => ({
  committedDueDate: visit.scheduledDate || null,
  committedDueTime: String(visit.startTime ?? '').slice(0, 5) || null,
  ...(visit.assigneeId ? { assigneeId: String(visit.assigneeId), assigneeName: visit.assigneeName || null } : {}),
});

const CLEAR_DATES_PATCH = { committedDueDate: null, committedDueTime: null, committedResultDate: null };

function visitAction({ kind, flip, visit, byThisAction }) {
  const status = visit?.status || null;
  if (!status) return 'none';
  if (kind === 'cancel-only') return 'cancel';
  if (kind === 'cut' || (kind === 'switch' && flip === 'to-desk')) {
    if (CANCELLABLE_VISIT.includes(status) || byThisAction) return 'cancel';
    return status === 'in_progress' ? 'keep-open' : 'history';
  }
  if (kind === 'switch' && flip === null && (status === 'scheduled' || status === 'in_progress')) return 'stays';
  return 'none';
}

/**
 * 🔑 แผนของการสลับวิธี / การตัดที่พลิกใบ / การยกเลิกนัดอย่างเดียว
 *
 * @param rows        ทุกแถวพื้นที่ของใบ รวมแถวที่ตัด
 * @param changes     `[{ zoneId, method }]` — การสลับ (ใช้ไม่ได้พร้อม `cut`: มี `cut` = `changes` ไม่ถูกอ่าน)
 * @param cut         `{ zoneId, to: 'cut' }` — หัวหน้าตัดพื้นที่ลงหน้างานสุดท้าย
 * @param visit       นัดที่ route เลือกมาแล้ว · `cancelledByThisAction: true` = นัดที่ถูกยกเลิกโดยการกดครั้งนี้ (route พิสูจน์แล้ว)
 * @param request     `{ id, docNo, committedResultDate, committedDueDate, answeredAt }`
 * @param sendBack    `surveySendBackState(...)` ของใบ
 * @param reason      เหตุผล (ของการตัด = เหตุผลที่ตัด)
 * @param resultDate  `'YYYY-MM-DD'` ที่พิมพ์ในโมดัล
 * @param hasDrawings ใบมีไฟล์ที่แผง "แบบจากฝ่ายขาย" จะโชว์ไหม — ไม่ส่ง = มี (ไม่ทวงแบบเพราะอ่านไม่ได้)
 * @param actor       `{ id, name }`
 * @param nowIso      เวลาของ request นี้ — ลง `dueCommittedAt` / `assignedAt` ของ patch วัน · จอไม่ต้องส่ง (ตัวเขียนเติมเอง)
 *
 * ⭐ **"ก่อน" ถูกประกอบกลับจาก body** ไม่ได้อ่านจากแถวตรง ๆ: การกดซ้ำหลังบันทึกไปครึ่งทางเจอแถวที่ถึงเป้าแล้ว
 *    ถ้าเทียบกับแถวตรง ๆ จะเห็นว่า "ไม่พลิก" ⇒ วันไม่ถูกเขียน เธรดไม่มีวัน · ประกอบกลับแล้วแผนของรอบกดซ้ำ = แผนของรอบแรก
 * ⚠️ แผนที่ `stale` ไม่สั่งเขียนอะไรเลย (`writes` ว่าง) — route ตอบ 409 โมดัลขึ้นข้อความเดียวกัน
 */
export function surveyMethodSwitchPlan({
  rows, changes = [], cut = null, visit = null, request = {}, sendBack = null,
  reason = '', resultDate = '', hasDrawings = true, actor = null, nowIso = null,
} = {}) {
  const all = list(rows).filter(Boolean);
  const req = request || {};
  const why = text(reason);
  const date = text(resultDate);
  const actorName = actor?.name || null;
  const isCutPlan = !!cut;

  /* ── 1) ประกอบ "ก่อน" / "หลัง" ───────────────────────────────────────── */
  let stale = false;
  let before = all;
  let after = all;
  let toDrawing = [];
  let toOnsite = [];
  let todoDrawing = [];
  let todoOnsite = [];
  let cutZone = null;

  if (isCutPlan) {
    const hit = classifyCut(cut, all, why);
    stale = hit.cls === 'stale';
    if (hit.row) cutZone = named(hit.row);
    if (!stale) {
      const isTarget = (r) => sameId(r.id, hit.row.id);
      // แถวที่ตัดไปแล้ว (กดซ้ำ) ต้องถูกหมุนกลับเป็นลงหน้างานที่ยังใช้อยู่ — ไม่งั้น "ก่อน" ไม่ต้องมีนัดอยู่แล้ว ใบไม่พลิก วันไม่ถูกเขียน
      before = all.map((r) => (isTarget(r) ? asMethod({ ...r, status: 'ok' }, ONSITE) : r));
      const cutOnly = before.map((r) => (isTarget(r) ? { ...r, status: 'cut' } : r));
      /* 🔴 ถามจากแถวที่ตัดแล้ว **โดยยังไม่เปลี่ยนวิธี** — ใบลงหน้างานล้วนที่ถูกตัดจนหมดยังต้องมีนัด (RQ-AS-26090233)
            ใบพลิกจริงจึงค่อยให้แถวที่ตัดทุกแถวตามไปเป็นจากแบบ (กติกา "ตัดหมด" ของ `surveyNeedsVisit` อ่านแถวที่ตัด) */
      after = surveyNeedsVisit(cutOnly)
        ? cutOnly
        : cutOnly.map((r) => (isCut(r) ? asMethod(r, DRAWING) : r));
    }
  } else {
    const classes = list(changes).map((c) => classifyChange(c, all, { reason: why, actorName }));
    stale = classes.some((c) => c.cls === 'stale');
    const live = classes.filter((c) => c.cls !== 'stale');
    const target = (r) => live.find((c) => sameId(c.row.id, r.id));
    before = all.map((r) => (target(r) ? asMethod(r, other(target(r).to)) : r));
    after = all.map((r) => (target(r) ? asMethod(r, target(r).to) : r));
    toDrawing = live.filter((c) => c.to === DRAWING).map((c) => named(c.row));
    toOnsite = live.filter((c) => c.to === ONSITE).map((c) => named(c.row));
    todoDrawing = live.filter((c) => c.cls === 'todo' && c.to === DRAWING).map((c) => c.row);
    todoOnsite = live.filter((c) => c.cls === 'todo' && c.to === ONSITE).map((c) => c.row);
  }

  const beforeState = snapshot(before);
  const afterState = snapshot(after);
  let flip = null;
  if (beforeState.needsVisit && !afterState.needsVisit) flip = 'to-desk';
  else if (!beforeState.needsVisit && afterState.needsVisit) flip = 'to-visit';

  /* ── 2) ชนิดของแผน ──────────────────────────────────────────────────── */
  const status = visit?.status || null;
  const byThisAction = status === 'cancelled' && visit?.cancelledByThisAction === true;
  let kind = 'none';
  if (isCutPlan) {
    // การตัดที่ไม่พลิกใบไม่ใช่แผน — route พื้นที่เดินทางปกติของมัน
    if (flip === 'to-desk') kind = 'cut';
  } else if (toDrawing.length + toOnsite.length > 0) {
    kind = 'switch';
  } else if (!stale && !surveyNeedsVisit(all) && (CANCELLABLE_VISIT.includes(status) || byThisAction)) {
    kind = 'cancel-only';
  }
  if (isCutPlan && kind !== 'cut') flip = null;

  /* ── 3) นัด ─────────────────────────────────────────────────────────── */
  const action = stale ? 'none' : visitAction({ kind, flip, visit, byThisAction });
  const sv = visit ? (visit.code || visit.id) : null;
  const planVisit = {
    action,
    id: visit?.id ?? null,
    code: visit?.code ?? null,
    status,
    scheduledDate: visit?.scheduledDate ?? null,
    assigneeId: visit?.assigneeId ?? null,
    assigneeName: visit?.assigneeName ?? null,
    assistantIds: list(visit?.assistantIds),
    cancelledByThisAction: byThisAction,
  };

  /* ── 4) วันบนใบ ─────────────────────────────────────────────────────── */
  let datesAction = 'none';
  if (kind === 'switch' || kind === 'cut') {
    if (flip === 'to-desk') datesAction = 'set';
    else if (flip === 'to-visit') datesAction = OPEN_VISIT.includes(status) ? 'sync' : 'clear';
  }
  const dateOk = isDateKey(date);
  let datesPatch = null;
  if (datesAction === 'set' && dateOk && actor?.id != null) datesPatch = deskCommitPatch({ date, actor, nowIso });
  else if (datesAction === 'sync') datesPatch = visitSyncPatch(visit);
  else if (datesAction === 'clear') datesPatch = { ...CLEAR_DATES_PATCH };

  const needs = { reason: kind !== 'none', resultDate: datesAction === 'set' };
  const defaults = {
    reason: kind === 'cancel-only' ? SURVEY_METHOD_CANCEL_ONLY_REASON : '',
    resultDate: req.committedResultDate || '',
  };

  /* ── 5) ข้อผิดพลาดของช่องกรอก (ลำดับของ route) ──────────────────────── */
  const errors = [];
  // เหตุผลของการตัดมีกติกาของ route พื้นที่เอง (≥ 5 ตัวอักษร) — ไม่ตรวจซ้ำที่นี่
  if (needs.reason && kind !== 'cut') {
    if (why.length < SURVEY_METHOD_REASON_MIN) errors.push(SURVEY_METHOD_ERRORS.reason);
    else if (why.length > SURVEY_METHOD_REASON_MAX) errors.push(REASON_TOO_LONG_ERROR);
  }
  if (needs.resultDate) {
    if (!date) errors.push(SURVEY_METHOD_ERRORS.resultDate);
    else if (!dateOk) errors.push(RESULT_DATE_BAD_ERROR);
  }

  /* ── 6) กล่องผลลัพธ์ ────────────────────────────────────────────────── */
  const visitDay = fmtDate(planVisit.scheduledDate);
  const crewName = planVisit.assigneeName || 'ยังไม่ระบุ';
  const sentBackCount = list(sendBack?.sentBack?.items).length;
  const closesSendBack = flip === 'to-desk' && !!sendBack?.pending;
  const lines = [];
  if (kind === 'cancel-only') {
    lines.push(`นัด ${sv} วันที่ ${visitDay} ของ ${crewName} จะถูกยกเลิก — ใบนี้ไม่มีพื้นที่ที่ต้องลงหน้างานแล้ว`);
  } else if (kind !== 'none') {
    if (toDrawing.length) {
      lines.push(`${toDrawing.length} พื้นที่จะประเมินจากแบบ — ไม่ต้องมีภาพกว้าง จุดติดตั้ง และรูปจุด · ข้อมูลที่กรอกไว้ยังอยู่ครบ`);
    }
    if (flip === 'to-desk') {
      lines.push('ไม่เหลือพื้นที่ที่ต้องลงหน้างาน — ใบออกจากคิวของผู้วางคิว'
        + (dateOk ? ` · หัวหน้ารับปากส่งผล ${fmtDate(date)}` : ''));
    }
    if (action === 'cancel') {
      lines.push(`นัด ${sv} วันที่ ${visitDay} ของ ${crewName} จะถูกยกเลิก — งานหายจากงานของช่าง และช่างได้รับแจ้ง`);
    }
    if (action === 'keep-open') {
      /* ⚠️ ท่อน "ช่างได้รับแจ้ง…" พิมพ์เฉพาะตอนมีกระดิ่งจริง (ข้อ 8: กระดิ่งช่างชนิด zones ต้องมีพื้นที่ที่สลับเป็นจากแบบ)
         การตัดพื้นที่ไม่สลับวิธีของแถวไหน ⇒ ไม่มีกระดิ่งช่าง ⇒ บรรทัดเหลือแค่ท่อนแรกของประโยคเดียวกัน (ไม่สัญญาสิ่งที่ไม่ได้ส่ง) */
      lines.push(`ช่างกดเริ่มงานของนัด ${sv} แล้ว — นัดไม่ถูกยกเลิก`
        + (toDrawing.length ? ' · ช่างได้รับแจ้งว่าไม่ต้องวัดพื้นที่นี้ แล้วกด “ส่งงาน” ได้เลย' : ''));
    }
    if (action === 'history') {
      lines.push(`นัด ${sv} (${VISIT_STATUS_LABELS[status] || status}) คงอยู่เป็นประวัติ — ผลของพื้นที่นี้จะระบุว่าประเมินจากแบบ`);
    }
    // ⚠️ บรรทัดนี้คือข้อความใหม่ข้อ 1 ของสเปค §7 (รอเจ้าของเคาะ) — ถ้าไม่เอา ลบเฉพาะบล็อกนี้ กระดิ่งช่างยังยิงตามเดิม
    if (action === 'stays' && toDrawing.length) {
      lines.push(`นัด ${sv} วันที่ ${visitDay} ของ ${crewName} ยังอยู่ — ยังมีพื้นที่ที่ต้องวัด · ช่างได้รับแจ้งว่าไม่ต้องวัดพื้นที่นี้`);
    }
    if (closesSendBack) {
      lines.push(`เรื่องที่ส่งกลับให้ช่างแก้${sentBackCount ? ` ${sentBackCount} ข้อ` : ''} ถูกปิดไปด้วย`);
    }
    if (toOnsite.length) {
      lines.push(`${toOnsite.length} พื้นที่กลับเป็นลงหน้างาน — ต้องวัดขนาดจริงแล้วบันทึกอีกครั้ง มีภาพกว้าง จุดติดตั้ง และรูปจุดตามปกติ · จุดที่มาร์กจากแบบยังอยู่ แต่ต้องเลือกจุดใหม่หลังเข้าพื้นที่`);
    }
    if (datesAction === 'clear') {
      const cleared = req.committedResultDate ? ` (${fmtDate(req.committedResultDate)})` : '';
      lines.push(`ใบกลับไปขั้น “รอลงคิว” — วันส่งผลที่รับปากไว้${cleared} ถูกล้าง · ผู้วางคิวลงวันเข้าพื้นที่และวันส่งผลใหม่`);
    }
  }

  /* ── 7) บรรทัดเธรดของใบ + เหตุผลบนเธรดของนัด ─────────────────────────── */
  // ท้ายสองตัวนี้ใช้เงื่อนไขเดียวกันทั้งการสลับและการตัด — แผนที่ไม่ได้ยกเลิกนัดต้องไม่พิมพ์ว่ายกเลิก
  const cancelTail = action === 'cancel' ? ` · ยกเลิกนัด ${sv}` : '';
  const resultTail = datesAction === 'set' && dateOk ? ` · ส่งผล ${fmtDate(date)}` : '';
  const cutSentence = cutZone ? `ตัดพื้นที่ ${cutZone.name} ออก — ไม่เหลือพื้นที่ที่ต้องลงหน้างาน` : null;
  let thread = null;
  if (kind === 'switch') {
    const parts = [];
    if (toDrawing.length) {
      parts.push(`เปลี่ยนวิธีประเมินเป็น “${SURVEY_METHOD_LABEL.drawing}” ${toDrawing.length} พื้นที่ (${surveyZoneNamesText(toDrawing.map((z) => z.name))}) — ${why}`
        + cancelTail + resultTail
        + (hasDrawings === false ? ' · ถ้ายังไม่ได้ส่งแบบ แนบในเธรดนี้ได้เลย' : ''));
    }
    if (toOnsite.length) {
      parts.push(`เปลี่ยนวิธีประเมินเป็น “${SURVEY_METHOD_LABEL.onsite}” ${toOnsite.length} พื้นที่ (${surveyZoneNamesText(toOnsite.map((z) => z.name))}) — ${why}`
        + (datesAction === 'clear' ? ' · ใบกลับไปรอลงคิว · ฝ่ายขายแจ้งวันที่หน้างานเข้าได้ในเธรดนี้' : ''));
    }
    thread = parts.join(' | ');
  } else if (kind === 'cancel-only') {
    thread = `ยกเลิกนัด ${sv} — ใบนี้ประเมินจากแบบทั้งใบ`;
  } else if (kind === 'cut') {
    thread = `${cutSentence}${cancelTail}${resultTail}`;
  }
  let visitCancelReason = null;
  if (action === 'cancel') visitCancelReason = kind === 'cut' ? cutSentence : `เปลี่ยนเป็นประเมินจากแบบ: ${why}`;

  /* ── 8) กระดิ่ง ─────────────────────────────────────────────────────── */
  let crew = null;
  if (action === 'cancel') {
    crew = { kind: 'cancel', title: `ยกเลิกนัด ${sv} — ใบนี้เปลี่ยนเป็นประเมินจากแบบ` };
  } else if (toDrawing.length && (action === 'keep-open' || action === 'stays')) {
    // กระดิ่งเดียวต่อการกดหนึ่งครั้ง — เอ่ยครบทุกชื่อ
    crew = { kind: 'zones', title: `หัวหน้าเปลี่ยน “${toDrawing.map((z) => z.name).join(' · ')}” เป็นประเมินจากแบบ — ไม่ต้องวัดพื้นที่นี้` };
  }
  const head = flip === 'to-desk' ? { title: surveyDeskReadyTitle(req) } : null;

  /* ── 9) สิ่งที่ตัวเขียนทำ ───────────────────────────────────────────── */
  const idle = stale || kind === 'none';
  const writes = {
    cancelVisitId: !idle && action === 'cancel' && !byThisAction ? planVisit.id : null,
    drawingIds: idle ? [] : todoDrawing.map((r) => r.id),
    onsiteIds: idle ? [] : todoOnsite.map((r) => r.id),
    /* `updatedAt` = รุ่นของแถวที่แผนอ่าน — ตัวเขียนใช้เป็นเงื่อนไข (มันเขียนทับ `spots` ซึ่งเส้นบันทึกพื้นที่ก็เขียน) */
    unselectSpotRows: idle ? [] : todoOnsite.map((r) => ({
      id: r.id,
      updatedAt: r.updatedAt ?? null,
      spots: list(r.spots).map((spot) => ({ ...spot, selected: false })),
    })),
    // แถวที่ตัดไปแล้วและยังไม่เป็นจากแบบ — ตามไปเฉพาะตอนใบไม่ต้องมีนัด (กันใบพลิกกลับเองจากแถวที่ตัด)
    cutMarkIds: idle || afterState.needsVisit ? [] : all.filter((r) => isCut(r) && !isDrawingZone(r)).map((r) => r.id),
    dates: idle ? null : datesPatch,
  };

  let disabledReason = null;
  if (stale) disabledReason = SURVEY_METHOD_ERRORS.stale;
  else if (kind === 'none') disabledReason = SURVEY_METHOD_ERRORS.nothing;

  let confirmLabel = 'บันทึกวิธีประเมิน';
  if (kind === 'cancel-only') confirmLabel = 'ยกเลิกนัด';
  else if (kind === 'cut') confirmLabel = CUT_CONFIRM_LABEL;

  return {
    kind,
    stale,
    toDrawing,
    toOnsite,
    cutZone,
    before: beforeState,
    after: afterState,
    flip,
    visit: planVisit,
    dates: { action: datesAction },
    sendBack: { closes: closesSendBack, itemCount: sentBackCount },
    needs,
    defaults,
    errors: idle ? [] : errors,
    disabledReason,
    confirmLabel,
    lines: stale ? [] : lines,
    thread: stale ? null : thread,
    visitCancelReason,
    bells: stale ? { crew: null, head: null } : { crew, head },
    writes,
    // ของที่ตัวเขียนต้องใช้แต่ไม่ได้รับเป็นอาร์กิวเมนต์: ลง `methodReason` ของแถว และ `meta.resultDate` ของบรรทัดเธรด
    reason: why,
    resultDate: dateOk ? date : null,
  };
}
