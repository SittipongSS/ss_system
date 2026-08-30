// ── รอบบริการ + ตารางนัดเข้าไซต์ (mig 0188) — logic ล้วน ──────────────────
//
// ⭐ `service_visits` คือ "ตาราง" ที่ผู้ใช้ขอ · ไฟล์นี้คือกฎทั้งหมดของมัน:
// gen นัดตามรอบ · เตือนเวลาทับกัน · เตือนวิ่งข้ามเขต · เตือนนอกช่วงที่ไซต์ให้เข้า
//
// ไฟล์นี้ไม่แตะ DB — ใช้ได้ทั้ง client (ปฏิทิน/ฟอร์ม) และ server (validate + gen)
import { isBusinessDay, toLocalISODate } from '@/lib/pm/dateHelpers';
import { accessConflict, minutesOf, toHHMM } from './sites';
import { businessDate } from '@/lib/businessDate';
import { VISIT_STATUSES, canRescheduleVisit, isClosedVisit, isLiveVisit } from './visitStatus';

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
  remove: 'ถอดเครื่อง',
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

const parseDate = (iso) => {
  if (!ISO_DATE.test(String(iso ?? ''))) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

function dateError(value, label) {
  if (!value) return null;
  if (!ISO_DATE.test(String(value))) return `${label}ไม่ถูกต้อง`;
  const year = Number(String(value).slice(0, 4));
  if (year < 2000 || year > 2100) return `${label}อยู่นอกช่วงปีที่เป็นไปได้ (${year})`;
  return null;
}

// ── ตรวจข้อมูลรอบบริการ ──────────────────────────────────────────────────
export function normalizePlanInput(body = {}) {
  const siteId = String(body.siteId ?? '').trim();
  if (!siteId) return { value: null, error: 'ต้องระบุไซต์' };
  if (!PLAN_KINDS.includes(body.kind)) return { value: null, error: 'ชนิดรอบบริการไม่ถูกต้อง' };

  const everyDays = Number(body.everyDays);
  if (!Number.isInteger(everyDays) || everyDays < 1 || everyDays > 365) {
    return { value: null, error: 'รอบต้องเป็นจำนวนวันระหว่าง 1–365' };
  }

  for (const [field, label] of [['startDate', 'วันเริ่มรอบ'], ['endDate', 'วันสิ้นสุดรอบ']]) {
    const err = dateError(body[field], label);
    if (err) return { value: null, error: err };
  }
  if (!body.startDate) return { value: null, error: 'ต้องระบุวันเริ่มรอบ' };
  if (body.endDate && String(body.endDate) < String(body.startDate)) {
    return { value: null, error: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มรอบ' };
  }

  const note = String(body.note ?? '').trim();
  if (note.length > 1000) return { value: null, error: 'หมายเหตุยาวเกิน 1000 ตัวอักษร' };

  return {
    value: {
      siteId,
      salesOrderId: body.salesOrderId || null,
      kind: body.kind,
      everyDays,
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

// ── การเลื่อนนัด (S-5) ───────────────────────────────────────────────────
//
// ⭐ "เลื่อน" = เปลี่ยน **วันที่นัด** ของนัดที่ยังไม่ปิด · เปลี่ยนเวลาในวันเดิมไม่นับ
// (ขยับ 30 นาทีเพราะรถติดไม่ใช่เรื่องที่ต้องอธิบายให้ลูกค้าฟัง)
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
        จะแก้/เลื่อนจากตารางช่างไม่ได้เลย** (เจอตอนทดสอบสด 2026-08-30) ⇒ ผู้เรียกที่แก้
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

  for (const [field, label] of [['scheduledDate', 'วันที่นัด'], ['actualDate', 'วันที่เข้าจริง']]) {
    const err = dateError(body[field], label);
    if (err) return { value: null, error: err };
  }

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
  for (const [from, to, label] of [
    ['startTime', 'endTime', 'เวลานัด'],
    ['actualStartTime', 'actualEndTime', 'เวลาที่เข้าจริง'],
  ]) {
    /* ⚠️ เวลา "ที่นัดไว้" ยังบังคับเริ่ม < สิ้นสุด (คนกรอกเอง ช่วงศูนย์นาทีไม่มีความหมาย)
       แต่เวลา "ที่เข้าจริง" ยอมให้เท่ากันได้ (mig 0300) — เมื่อเวลามาจากการประทับจริง
       งานที่เริ่มและจบในนาทีเดียวกันมีจริง (เปลี่ยนก้าน reed จุดเดียว · เข้าไปดูแล้วออก) */
    const strict = from === 'startTime';
    const bad = strict
      ? minutesOf(times[from]) >= minutesOf(times[to])
      : minutesOf(times[from]) > minutesOf(times[to]);
    if (times[from] && times[to] && bad) {
      return { value: null, error: `${label}: เวลาเริ่มต้องไม่หลังเวลาสิ้นสุด` };
    }
  }

  // ⚠️ ปิดงานต้องรู้ว่าเข้าจริงวันไหน — `nextAfterDone` นับรอบถัดไปจากวันที่ทำจริง
  // ถ้าปล่อยว่างได้ รอบถัดไปจะเงียบ ๆ กลับไปอิงวันนัดเดิม แล้วตารางเลื่อนสะสมทั้งปี
  // 🐞 ของเดิมบังคับเฉพาะ `done` ⇒ partial/unable บันทึกได้โดยไม่มีวันที่เข้าจริง ทั้งที่
  // ช่างไปถึงไซต์แล้ว · ประวัติจะมีแถวที่ไม่รู้ว่าไปวันไหน และจอแสดงว่า "ยังไม่ปิดงาน"
  // ให้ใบที่ปิดไปแล้วจริง ๆ (DB มี CHECK คู่กันที่ mig 0300)
  const visited = isClosedVisit({ status });
  const actualDate = visited ? (body.actualDate || body.scheduledDate) : (body.actualDate || null);
  if (visited && !actualDate) return { value: null, error: 'ปิดงานต้องระบุวันที่เข้าจริง' };

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
  // สัญญาณมือถือที่ไซต์แย่เป็นเรื่องปกติ · บังคับแล้วช่างจะปิดงานไม่ได้ตรงนั้น
  // แล้วไปบันทึกย้อนหลังทีหลัง ซึ่งทำให้เวลาที่บันทึกผิดทั้งชุด
  const attachments = [];
  if (Array.isArray(body.attachments)) {
    for (const raw of body.attachments) {
      const url = String(raw?.url ?? '').trim();
      if (!url) continue;
      if (url.length > 1000) return { value: null, error: 'ลิงก์ไฟล์แนบยาวเกินไป' };
      attachments.push({
        url,
        name: String(raw?.name ?? '').trim().slice(0, 200) || 'ไฟล์แนบ',
        kind: ATTACHMENT_KINDS.includes(raw?.kind) ? raw.kind : 'other',
      });
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
// วันที่ตกวันหยุด/เสาร์-อาทิตย์ **เลื่อนไปวันทำการถัดไป** — ช่างไม่ได้เข้าไซต์วันหยุด
// ⚠️ การเลื่อนไม่สะสม: รอบถัดไปนับจากวันตามรอบ (ก่อนเลื่อน) ไม่ใช่วันที่เลื่อนแล้ว
//    ไม่งั้นรอบ "ทุก 30 วัน" จะค่อย ๆ ถอยไปเรื่อย ๆ จนกลายเป็นทุก 35 วันภายในปีเดียว
export function plannedDates(plan, { from, to } = {}) {
  if (!plan?.startDate || !plan?.everyDays) return [];
  const every = Number(plan.everyDays);
  if (!Number.isFinite(every) || every < 1) return [];

  const start = parseDate(plan.startDate);
  const rangeFrom = parseDate(from) || start;
  const rangeTo = parseDate(to);
  if (!start || !rangeTo) return [];

  const planEnd = parseDate(plan.endDate);
  const out = [];
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= rangeTo && guard < 2000) {
    guard += 1;
    if (planEnd && cursor > planEnd) break;

    // เลื่อนหนีวันหยุดแบบ "ชั่วคราว" — ไม่แตะ cursor ที่เดินตามรอบจริง
    const shifted = new Date(cursor);
    let shiftGuard = 0;
    while (!isBusinessDay(shifted) && shiftGuard < 14) {
      shifted.setDate(shifted.getDate() + 1);
      shiftGuard += 1;
    }
    if (shifted >= rangeFrom && shifted <= rangeTo && (!planEnd || shifted <= planEnd || cursor <= planEnd)) {
      out.push(toLocalISODate(shifted));
    }
    cursor.setDate(cursor.getDate() + every);
  }
  return out;
}

// ── นัดที่ต้อง gen เพิ่ม ─────────────────────────────────────────────────
// ⭐ horizon 90 วัน ไม่ gen ทั้งปี: นัดที่ gen ล่วงหน้า 12 เดือนคือ 12 แถวที่จะถูก
// เลื่อนทุกเดือนแล้วไม่มีใครกล้าลบ · gen สั้น + ต่อรอบตอนปิดงานจริง ทำให้ตาราง
// สะท้อนของจริงเสมอ
export function ensureVisits(plan, existing = [], { from = null, horizonDays = 90 } = {}) {
  if (!plan?.isActive) return [];
  const startIso = from || businessDate();
  const start = parseDate(startIso);
  if (!start) return [];
  const end = new Date(start);
  end.setDate(end.getDate() + horizonDays);

  // นัดที่มีอยู่แล้วของรอบนี้ — เทียบด้วยวัน · นัดที่ถูกยกเลิก **ยังนับว่ามี**
  // ไม่งั้นยกเลิกแล้วระบบ gen กลับมาให้ใหม่ทุกครั้งที่เปิดหน้า
  const taken = new Set(existing.filter((v) => v.planId === plan.id).map((v) => v.scheduledDate));

  return plannedDates(plan, { from: startIso, to: toLocalISODate(end) })
    .filter((date) => !taken.has(date))
    .map((date) => ({
      siteId: plan.siteId,
      planId: plan.id,
      kind: plan.kind,
      scheduledDate: date,
      assigneeId: plan.assigneeId || null,
      assigneeName: plan.assigneeName || null,
      /* ⚠️ ไม่ใส่ status ที่นี่ — **ด่านเป็นคนตัดสิน** (`initialVisitStatus` ที่ planGen)
         ของเดิมยัด 'scheduled' ตรงนี้ ⇒ นัดที่ไม่มีช่างขึ้นตารางไปเงียบ ๆ แล้วไม่มีใครไป */
    }));
}

// ── นัดถัดไปหลังปิดงาน ───────────────────────────────────────────────────
// ⭐ นับจาก **วันที่ทำจริง** ไม่ใช่วันที่นัดไว้ — เข้าช้า 5 วัน รอบถัดไปต้องขยับตาม
// ไม่งั้นนัดถัดไปจะมาเร็วกว่าที่ควรทุกครั้งที่เข้าช้า แล้วรอบก็รวนสะสม
export function nextAfterDone(plan, visit) {
  if (!plan?.isActive || !plan?.everyDays) return null;
  const anchor = parseDate(visit?.actualDate || visit?.scheduledDate);
  if (!anchor) return null;

  const next = new Date(anchor);
  next.setDate(next.getDate() + Number(plan.everyDays));
  const planEnd = parseDate(plan.endDate);
  if (planEnd && next > planEnd) return null;

  let guard = 0;
  while (!isBusinessDay(next) && guard < 14) { next.setDate(next.getDate() + 1); guard += 1; }

  return {
    siteId: plan.siteId,
    planId: plan.id,
    kind: plan.kind,
    scheduledDate: toLocalISODate(next),
    assigneeId: plan.assigneeId || visit?.assigneeId || null,
    assigneeName: plan.assigneeName || visit?.assigneeName || null,
    status: 'scheduled',
  };
}

// "อยู่บนตาราง" มีนิยามเดียวอยู่ที่ visitStatus.js — ห้ามเขียนซ้ำที่นี่

// ── โหลดงานรายคนรายวัน ───────────────────────────────────────────────────
// เตือนเมื่อช่างคนเดียวถูกนัดเกินที่ทำไหวในวันเดียว
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

// ── นัดของช่างคนเดียวกันที่เวลาทับกัน ────────────────────────────────────
// ⚠️ นัดที่ **ไม่ระบุเวลา** ชนกับใครไม่ได้ — ไม่รู้เวลา ไม่ใช่ ทับกัน
// ⚠️ ช่างคนละคนไม่นับว่าทับ แม้เวลาเดียวกันเป๊ะ (คนละคันรถ คนละไซต์)
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
      // ติดกันพอดี (11:00 จบ / 11:00 เริ่ม) ไม่ถือว่าทับ — ใช้ `<` ไม่ใช่ `<=`
      if (cur.start < prev.end) {
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
// จัดกลุ่มนัดของช่างคนหนึ่งในวันหนึ่งตาม **เขตวิ่งงาน** ของไซต์ (routeZone —
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
    out.push({ kind: 'overlap', message: 'เวลาทับกับนัดอื่นของช่างคนเดียวกัน' });
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
