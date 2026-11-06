// นัดหมายของลีด + ห้อง Studio — กติกาบริสุทธิ์ที่จอและ API ใช้ร่วมกัน (mig 0424 · มติเจ้าของ 05/11/2026)
//
// ⭐ มติ 6 ข้อ (ถามทีละข้อ 05/11):
//   1. เช็คห้องชนกับ **ทุกนัดที่ใช้ Studio** — นัดที่ MKT กรอกตอนรับลีด + นัดประชุมที่ AE บันทึกแบบลูกค้าเข้ามา
//   2. เวลาพิมพ์เริ่ม–จบเองทุกครั้ง
//   3. ห้องเดียวกันเวลาคาบกัน = บล็อก (ฐานมี EXCLUDE กันสองคนกดพร้อมกันอีกชั้น)
//   4. MKT รับนัดได้สามแบบ: Studio (ต้องเลือกห้อง) / Online / โทร
//   5. นัดของ MKT ยังไม่นับเป็นนัดประชุม — AE กด "นัดประชุม" แล้วช่องเติมจากนัดนี้ให้
//   6. ลีดหนึ่งใบมีนัดที่รออยู่นัดเดียว — นัดใหม่แทนที่นัดเดิมที่ยังไม่ถึงเวลา
//
// ⚠️ ค่าที่จอส่งมาเป็น "วัน + เวลา" ตามนาฬิกาไทยเสมอ (ไม่ใช่นาฬิกาเครื่อง) — แปลงเป็นจุดเวลาด้วย
// `+07:00` ตรง ๆ ที่นี่ที่เดียว · ทางกลับ (จุดเวลา → วัน/เวลา) ผ่าน businessDayKey/businessTimeKey
// ตัวเดียวกับทั้งเว็บ (memory thai-time-display) ⇒ เปิดจากเครื่องที่ตั้งโซนอื่นก็ได้วันเดียวกัน

import { businessDayKey, businessTimeKey } from "@/lib/datePeriods";
import { normalizeTime } from "@/lib/format";

export const STUDIO_ROOMS = ["studio_01", "studio_02", "studio_03"];
export const STUDIO_ROOM_LABELS = {
  studio_01: "Studio 01",
  studio_02: "Studio 02",
  studio_03: "Studio 03",
};

/** รูปแบบนัดที่ต้องมีห้อง — ชื่อเดียวกับ MEETING_MODES ("ลูกค้าเข้ามา") เพื่อให้นัดของ MKT
 *  ส่งต่อเป็นนัดประชุมของ AE ได้ตรง ๆ ไม่ต้องแปลงรหัส */
export const STUDIO_MODE = "onsite_at_office";

export const APPOINTMENT_MODES = ["onsite_at_office", "online", "phone", "onsite_customer_visit"];
export const APPOINTMENT_MODE_LABELS = {
  onsite_at_office: "Studio",
  online: "Online",
  phone: "โทร",
  onsite_customer_visit: "ออกไปหาลูกค้า",
};
/** คำอธิบายใต้แผ่นเลือก — บอกผลของตัวเลือกก่อนกด (form-design-rules: show the consequence) */
export const APPOINTMENT_MODE_HINTS = {
  onsite_at_office: "ลูกค้าเข้ามา · ต้องเลือกห้อง",
  online: "ไม่ใช้ห้อง",
  phone: "ไม่ใช้ห้อง",
  onsite_customer_visit: "ไม่ใช้ห้อง",
};

/** MKT ตอนรับลีด (มติข้อ 4) */
export const INTAKE_APPOINTMENT_MODES = ["onsite_at_office", "online", "phone"];
/** AE ตอนบันทึกนัดประชุม — ต้องเท่ากับ MEETING_MODES ใน leads.js (เทสต์ยึดไว้ ·
 *  import ตรงไม่ได้เพราะ leads.js เป็นฝั่งที่จะเรียกไฟล์นี้) */
export const MEETING_APPOINTMENT_MODES = ["onsite_customer_visit", "onsite_at_office", "online"];

/** ค่า "ไม่มีนัด" ของแผ่นเลือกในฟอร์มรับลีด — ไม่ใช่รูปแบบนัด ไม่เคยลงฐาน */
export const NO_APPOINTMENT = "none";

export const APPOINTMENT_MAX_MINUTES = 12 * 60; // คู่กับ CHECK lead_appointments_range_check (mig 0424)

export const APPOINTMENT_ENDED_LABELS = {
  replaced: "เลื่อนเป็นนัดใหม่",
  cancelled: "ยกเลิกนัด",
  lead_closed: "ปิดลีดแล้ว",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const THAI_OFFSET = "+07:00";

export const emptyAppointment = () => ({ mode: NO_APPOINTMENT, date: "", start: "", end: "", room: "" });

/** ฟอร์มนี้ "มีนัด" ไหม — ไม่มีค่า / เลือก "ไม่มีนัด" = ไม่มี */
export function hasAppointmentInput(input) {
  return !!input && !!input.mode && input.mode !== NO_APPOINTMENT;
}

const minutesOf = (hhmm) => {
  const t = normalizeTime(hhmm);
  if (!t) return null;
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
};

/** วัน (YYYY-MM-DD) + เวลา (HH:MM) ตามนาฬิกาไทย → ISO (UTC) */
export function thaiDateTimeToIso(date, time) {
  const t = normalizeTime(time);
  if (!DATE_RE.test(String(date || "")) || !t) return null;
  const ms = Date.parse(`${date}T${t}:00${THAI_OFFSET}`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * ด่านเดียวของช่องนัด — ฟอร์มรับลีด · กล่องนัดประชุม · API ใช้ตัวนี้ตัวเดียว (form-design-rules §2)
 * @param {object} input { mode, date, start, end, room }
 * @param {{ modes?: string[], required?: boolean }} options
 * @returns {string|null} ข้อความไทย หรือ null = ผ่าน
 */
export function appointmentInputError(input, { modes = APPOINTMENT_MODES, required = false } = {}) {
  if (!hasAppointmentInput(input)) return required ? "กรุณาเลือกรูปแบบนัด" : null;
  if (!modes.includes(input.mode)) return "รูปแบบนัดไม่ถูกต้อง";
  if (!DATE_RE.test(String(input.date || "")) || !Number.isFinite(Date.parse(`${input.date}T00:00:00Z`))) {
    return "กรุณาระบุวันนัด";
  }
  const start = minutesOf(input.start);
  if (start == null) return "กรุณาระบุเวลาเริ่มนัด";
  const end = minutesOf(input.end);
  if (end == null) return "กรุณาระบุเวลาจบนัด";
  // นัดข้ามเที่ยงคืนไม่มีจริงในงานนี้ — เวลาจบก่อนเวลาเริ่มคือพิมพ์สลับ ไม่ใช่นัดถึงพรุ่งนี้
  if (end <= start) return "เวลาจบนัดต้องหลังเวลาเริ่ม";
  if (end - start > APPOINTMENT_MAX_MINUTES) return "นัดหนึ่งครั้งยาวได้ไม่เกิน 12 ชั่วโมง";
  if (input.mode === STUDIO_MODE && !STUDIO_ROOMS.includes(input.room)) return "นัดที่ Studio ต้องเลือกห้อง";
  return null;
}

/**
 * ค่าที่ผ่านด่านแล้ว → แถวที่จะเขียนลงฐาน (ไม่มี id/leadId) · ไม่ผ่านด่าน = null
 * ⚠️ ห้องถูกทิ้งเสมอเมื่อไม่ใช่ Studio — สลับรูปแบบจาก Studio เป็น Online แล้วห้องที่เคยเลือก
 * ค้างอยู่ในฟอร์ม ต้องไม่ติดไปกันห้องจริง (CHECK ของฐานก็ปฏิเสธอยู่แล้ว แต่ข้อความจะเป็นอังกฤษ)
 */
export function normalizeAppointmentInput(input, options = {}) {
  if (appointmentInputError(input, { ...options, required: true })) return null;
  return {
    mode: input.mode,
    room: input.mode === STUDIO_MODE ? input.room : null,
    startAt: thaiDateTimeToIso(input.date, input.start),
    endAt: thaiDateTimeToIso(input.date, input.end),
  };
}

/** แถวในฐาน → ค่าของฟอร์ม (วัน/เวลาไทย) — ใช้เติมกล่องนัดประชุมจากนัดที่ MKT จองไว้ และฟอร์มแก้ลีด */
export function appointmentFormValue(row) {
  if (!row?.startAt || !row?.endAt) return emptyAppointment();
  return {
    mode: row.mode || NO_APPOINTMENT,
    date: businessDayKey(row.startAt) || "",
    start: businessTimeKey(row.startAt) || "",
    end: businessTimeKey(row.endAt) || "",
    room: row.room || "",
  };
}

const msOf = (iso) => Date.parse(iso);

/** นัดสองนัดเป็นนัดเดียวกันไหม (รูปแบบ ห้อง เวลา) — PATCH ลีดที่ไม่ได้แตะนัดต้องไม่สร้างแถวใหม่ */
export function sameAppointment(a, b) {
  if (!a || !b) return false;
  return a.mode === b.mode
    && (a.room || null) === (b.room || null)
    && msOf(a.startAt) === msOf(b.startAt)
    && msOf(a.endAt) === msOf(b.endAt);
}

/** ยังกันห้อง/ยังรออยู่ไหม — ปิดแล้ว (เลื่อน/ยกเลิก/ปิดลีด) = ไม่ */
export const isActiveAppointment = (row) => !!row && !row.endedAt;

/**
 * นัดที่ชนกับ `candidate` — ห้องเดียวกัน · ช่วงครึ่งเปิดคาบกัน · ลีดต่างใบ · ยังไม่ปิด
 * ⚠️ กติกาเดียวกับ EXCLUDE lead_appointments_room_no_overlap (mig 0424) ทุกข้อ — ถ้าตรงนี้หลวมกว่า
 *   ฐาน จอจะปล่อยให้กดแล้วโดน 409 · ถ้าเข้มกว่า จอจะห้ามสิ่งที่ฐานยอม (จบ 15:00 กับเริ่ม 15:00 ไม่ชน)
 */
export function appointmentConflicts(candidate, rows = [], { leadId = null } = {}) {
  if (!candidate?.room) return [];
  const start = msOf(candidate.startAt);
  const end = msOf(candidate.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  return rows.filter((row) => isActiveAppointment(row)
    && row.room === candidate.room
    && (!leadId || row.leadId !== leadId)
    && msOf(row.startAt) < end
    && start < msOf(row.endAt));
}

/**
 * นัดที่ "รออยู่" ของลีดใบหนึ่ง — ยังไม่ปิด และยังไม่จบ (จบหลังเวลา now)
 * ถ้ามีหลายนัด (ไม่ควรเกิด — มติข้อ 6 · เหลือได้ตอนปิดนัดเดิมล้มกลางทาง) เอานัดที่เริ่มก่อน
 */
export function pickUpcomingAppointment(rows = [], nowIso = new Date().toISOString()) {
  const now = msOf(nowIso);
  return rows
    .filter((row) => isActiveAppointment(row) && msOf(row.endAt) > now)
    .sort((a, b) => msOf(a.startAt) - msOf(b.startAt))[0] || null;
}

/** สถานที่ของนัด — ห้องถ้ามี ไม่งั้นรูปแบบ ("Studio 02" · "Online" · "โทร") */
export function appointmentPlace(row) {
  if (!row) return "";
  return STUDIO_ROOM_LABELS[row.room] || APPOINTMENT_MODE_LABELS[row.mode] || "";
}

/** "13:30–15:00" ตามเวลาไทย */
export function appointmentTimeRange(row) {
  const start = businessTimeKey(row?.startAt);
  const end = businessTimeKey(row?.endAt);
  return start && end ? `${start}–${end}` : "";
}

/** วันนัดตรงกับวันนี้ (วันไทย) ไหม — ธงบนรายการเปลี่ยนสีเมื่อเป็นนัดวันนี้ */
export function isAppointmentToday(row, nowIso = new Date().toISOString()) {
  const day = businessDayKey(row?.startAt);
  return !!day && day === businessDayKey(nowIso);
}

/**
 * ข้อความบอกว่าชนกับนัดไหน — ชื่อลูกค้าโชว์เฉพาะลีดที่คนกดมองเห็นได้อยู่แล้ว
 * (ชื่อลูกค้าของทีมอื่นเป็นข้อมูลของทีมอื่น — กติกาเดียวกับปฏิทินนัด toCalendarEntries)
 * @param {object[]} conflicts แถวที่ชน (มี `contactName` เมื่อมองเห็นได้)
 */
export function appointmentConflictMessage(conflicts = []) {
  if (!conflicts.length) return "";
  const first = conflicts[0];
  const who = first.contactName ? `นัดของ ${first.contactName}` : "นัดของลีดทีมอื่น";
  const by = first.createdByName ? ` (จองโดย ${first.createdByName})` : "";
  const more = conflicts.length > 1 ? ` และอีก ${conflicts.length - 1} นัด` : "";
  return `${STUDIO_ROOM_LABELS[first.room] || "ห้องนี้"} ไม่ว่าง ${appointmentTimeRange(first)} — ชน${who}${by}${more} · เลือกห้องอื่นหรือเปลี่ยนเวลา`;
}

/** ช่วงวันไทยหนึ่งวันแบบครึ่งเปิด [00:00, 24:00) เป็น ISO — ใช้ดึงนัดของวันนั้นมาเช็คห้อง */
export function thaiDayRange(date) {
  if (!DATE_RE.test(String(date || ""))) return null;
  const from = thaiDateTimeToIso(date, "00:00");
  if (!from) return null;
  return { fromIso: from, untilIso: new Date(msOf(from) + 86400000).toISOString() };
}

/**
 * ค่าตั้งต้นของกล่อง "นัดประชุม" ของ AE — เติมจากนัดที่รออยู่ของลีด (มติข้อ 5: AE กดยืนยันทีเดียว)
 * · นัดแบบ "โทร" ไม่ใช่รูปแบบนัดประชุม ⇒ เติมแค่วัน/เวลา ให้ AE เลือกรูปแบบเอง
 * · ไม่มีนัดรออยู่ = กล่องว่าง (รูปแบบยังไม่ถูกเลือก — ไม่มีค่าตั้งต้นของการตัดสินใจ · form-design-rules §3)
 */
export function meetingAppointmentDefaults(lead) {
  const base = lead?.appointment ? appointmentFormValue(lead.appointment) : emptyAppointment();
  return MEETING_APPOINTMENT_MODES.includes(base.mode) ? base : { ...base, mode: "", room: "" };
}

/** ด่านของกล่องนัดประชุม — `validate` ของ field ชนิด custom ใน leadLifecycle */
export const meetingAppointmentError = (value) =>
  appointmentInputError(value, { modes: MEETING_APPOINTMENT_MODES, required: true });

/** หมายเหตุของนัดที่ล็อกในฟอร์มแก้ลีด — นัดที่ AE ยืนยันเป็นนัดประชุมแล้ว */
export const MEETING_LOCK_NOTE = "AE ยืนยันเป็นนัดประชุมแล้ว — เลื่อนที่ปุ่ม \"นัดเพิ่ม / เลื่อนนัด\" หรือกด \"ยกเลิกนัด\" บนหน้าลีด";

/**
 * ค่าเริ่มของช่องนัดในฟอร์มแก้ลีด (หน้ารายการ + หน้ารายละเอียด ใช้ตัวเดียวกัน)
 * นัดที่ AE ยืนยันแล้ว (source = meeting) ล็อก — ฟอร์มส่งค่าเดิมกลับไป API ถือว่าไม่แตะ (sameAppointment)
 */
export function intakeAppointmentState(lead) {
  const current = lead?.appointment || null;
  if (!current) return { value: emptyAppointment(), lock: null };
  return {
    value: appointmentFormValue(current),
    lock: current.source === "meeting" ? { appointment: current, note: MEETING_LOCK_NOTE } : null,
  };
}

/** ช่วงยาวสุดที่ขอนัดได้ในคำขอเดียว — แถบวัน 14 วัน + เผื่อวันที่เลือกจากปฏิทินนอกแถบ */
export const APPOINTMENT_RANGE_MAX_DAYS = 45;

/**
 * ช่วงเวลาที่ API นัดหมายต้องอ่าน — `date` วันเดียว หรือ `from`–`to` หลายวัน (วันไทย · ครึ่งเปิด)
 * @returns {{ error: string } | { error: null, fromIso: string, untilIso: string }}
 */
export function appointmentRangeOf({ date = null, from = null, to = null } = {}) {
  if (date) {
    const day = thaiDayRange(date);
    return day ? { error: null, ...day } : { error: "ต้องระบุวันที่ (date) รูปแบบ YYYY-MM-DD" };
  }
  const start = thaiDayRange(from);
  const end = thaiDayRange(to);
  if (!start || !end) return { error: "ต้องระบุวันที่ (date) หรือช่วง (from/to) รูปแบบ YYYY-MM-DD" };
  const days = Math.round((Date.parse(end.fromIso) - Date.parse(start.fromIso)) / 86400000) + 1;
  if (days < 1) return { error: "วันที่สิ้นสุดต้องไม่มาก่อนวันที่เริ่ม" };
  if (days > APPOINTMENT_RANGE_MAX_DAYS) return { error: `ขอนัดได้ครั้งละไม่เกิน ${APPOINTMENT_RANGE_MAX_DAYS} วัน (ขอมา ${days} วัน)` };
  return { error: null, fromIso: start.fromIso, untilIso: end.untilIso };
}
