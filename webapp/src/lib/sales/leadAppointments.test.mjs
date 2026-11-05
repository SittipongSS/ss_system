import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  APPOINTMENT_MODES, INTAKE_APPOINTMENT_MODES, MEETING_APPOINTMENT_MODES, STUDIO_ROOMS, STUDIO_ROOM_LABELS,
  appointmentConflictMessage, appointmentConflicts, appointmentFormValue, appointmentInputError, appointmentPlace,
  appointmentTimeRange, emptyAppointment, hasAppointmentInput, intakeAppointmentState, isAppointmentToday,
  meetingAppointmentDefaults, normalizeAppointmentInput, pickUpcomingAppointment, sameAppointment, thaiDateTimeToIso,
  thaiDayRange,
} from "./leadAppointments.js";
import { MEETING_MODES } from "./leads.js";

const studio = (over = {}) => ({ mode: "onsite_at_office", date: "2026-11-11", start: "13:30", end: "15:00", room: "studio_02", ...over });
const row = (over = {}) => ({
  id: "APT-1", leadId: "L-1", source: "intake", mode: "onsite_at_office", room: "studio_02",
  startAt: "2026-11-11T06:30:00.000Z", endAt: "2026-11-11T08:00:00.000Z", endedAt: null, ...over,
});

test("ชุดรูปแบบนัดของ AE ต้องเท่ากับ MEETING_MODES — นัดของ MKT ส่งต่อเป็นนัดประชุมได้ตรง ๆ", () => {
  assert.deepEqual([...MEETING_APPOINTMENT_MODES].sort(), [...MEETING_MODES].sort());
  // MKT รับได้สามแบบ (มติข้อ 4) — "โทร" มีเฉพาะฝั่ง MKT
  assert.deepEqual(INTAKE_APPOINTMENT_MODES, ["onsite_at_office", "online", "phone"]);
  assert.ok(!MEETING_APPOINTMENT_MODES.includes("phone"));
  assert.deepEqual(STUDIO_ROOMS.map((room) => STUDIO_ROOM_LABELS[room]), ["Studio 01", "Studio 02", "Studio 03"]);
});

test("ค่าที่ฐานยอม (CHECK ของ 0424) ตรงกับค่าคงที่ — เพิ่มห้อง/รูปแบบต้องแก้ทั้งสองที่", () => {
  const sql = readFileSync(path.resolve(process.cwd(), "supabase/migrations/0424_lead_appointments.sql"), "utf8");
  for (const room of STUDIO_ROOMS) assert.match(sql, new RegExp(`'${room}'`), `ห้อง ${room} ต้องอยู่ใน CHECK`);
  for (const mode of APPOINTMENT_MODES) assert.match(sql, new RegExp(`'${mode}'`), `รูปแบบ ${mode} ต้องอยู่ใน CHECK`);
  // ช่วงครึ่งเปิดเดียวกับ appointmentConflicts — จบ 15:00 กับเริ่ม 15:00 ไม่ชน
  assert.match(sql, /tstzrange\("startAt", "endAt", '\[\)'\) WITH &&/);
  assert.match(sql, /"leadId" WITH <>/, "ลีดเดียวกันต้องไม่ชนตัวเอง (AE ยืนยันนัดที่ MKT จองไว้)");
});

test("วัน+เวลาไทย → จุดเวลา UTC ไม่ขึ้นกับโซนของเครื่อง", () => {
  assert.equal(thaiDateTimeToIso("2026-11-11", "13:30"), "2026-11-11T06:30:00.000Z");
  assert.equal(thaiDateTimeToIso("2026-11-11", "0:30"), "2026-11-10T17:30:00.000Z", "หลังเที่ยงคืนไทย = ยังเป็นวันก่อนใน UTC");
  assert.equal(thaiDateTimeToIso("2026-11-11", "930"), "2026-11-11T02:30:00.000Z", "พิมพ์ 930 ได้ตาม normalizeTime");
  assert.equal(thaiDateTimeToIso("11/11/2026", "13:30"), null);
  assert.equal(thaiDateTimeToIso("2026-11-11", "25:00"), null);
  assert.deepEqual(thaiDayRange("2026-11-11"), { fromIso: "2026-11-10T17:00:00.000Z", untilIso: "2026-11-11T17:00:00.000Z" });
  assert.equal(thaiDayRange("ไม่ใช่วัน"), null);
});

test("ด่านช่องนัด: ไม่มีนัด = ผ่าน · มีนัดต้องครบ · Studio ต้องมีห้อง", () => {
  assert.equal(appointmentInputError(undefined), null);
  assert.equal(appointmentInputError(emptyAppointment()), null, "เลือก 'ยังไม่มีนัด'");
  assert.equal(appointmentInputError(emptyAppointment(), { required: true }), "กรุณาเลือกรูปแบบนัด");
  assert.equal(appointmentInputError(studio({ date: "" })), "กรุณาระบุวันนัด");
  assert.equal(appointmentInputError(studio({ start: "" })), "กรุณาระบุเวลาเริ่มนัด");
  assert.equal(appointmentInputError(studio({ end: "" })), "กรุณาระบุเวลาจบนัด");
  assert.equal(appointmentInputError(studio({ start: "15:00", end: "13:30" })), "เวลาจบนัดต้องหลังเวลาเริ่ม");
  assert.equal(appointmentInputError(studio({ start: "13:30", end: "13:30" })), "เวลาจบนัดต้องหลังเวลาเริ่ม");
  assert.equal(appointmentInputError(studio({ room: "" })), "นัดที่ Studio ต้องเลือกห้อง");
  assert.equal(appointmentInputError(studio({ room: "studio_09" })), "นัดที่ Studio ต้องเลือกห้อง");
  assert.equal(appointmentInputError(studio()), null);
  assert.equal(appointmentInputError(studio({ mode: "online", room: "" })), null, "Online ไม่ต้องมีห้อง");
  assert.equal(appointmentInputError(studio({ mode: "phone" }), { modes: MEETING_APPOINTMENT_MODES }), "รูปแบบนัดไม่ถูกต้อง");
  assert.equal(appointmentInputError(studio({ start: "06:00", end: "19:00" })), "นัดหนึ่งครั้งยาวได้ไม่เกิน 12 ชั่วโมง");
});

test("normalize: ห้องค้างจากตอนเลือก Studio ต้องหลุดเมื่อเปลี่ยนเป็น Online", () => {
  assert.deepEqual(normalizeAppointmentInput(studio()), {
    mode: "onsite_at_office", room: "studio_02", startAt: "2026-11-11T06:30:00.000Z", endAt: "2026-11-11T08:00:00.000Z",
  });
  assert.equal(normalizeAppointmentInput(studio({ mode: "online" })).room, null);
  assert.equal(normalizeAppointmentInput(studio({ room: "" })), null);
  assert.equal(normalizeAppointmentInput(emptyAppointment()), null);
  assert.equal(hasAppointmentInput({ mode: "none" }), false);
});

test("ห้องชน: ห้องเดียวกัน ช่วงคาบกัน ลีดต่างใบ ยังไม่ปิด — จบชนเริ่มพอดีไม่นับ", () => {
  const booked = [row()];
  const at = (start, end, room = "studio_02") => ({
    room, startAt: thaiDateTimeToIso("2026-11-11", start), endAt: thaiDateTimeToIso("2026-11-11", end),
  });
  assert.equal(appointmentConflicts(at("14:00", "15:30"), booked, { leadId: "L-2" }).length, 1, "คาบกลางช่วง");
  assert.equal(appointmentConflicts(at("13:00", "16:00"), booked, { leadId: "L-2" }).length, 1, "ครอบทั้งช่วง");
  assert.equal(appointmentConflicts(at("15:00", "16:30"), booked, { leadId: "L-2" }).length, 0, "เริ่มตอนอีกนัดจบ");
  assert.equal(appointmentConflicts(at("12:00", "13:30"), booked, { leadId: "L-2" }).length, 0, "จบตอนอีกนัดเริ่ม");
  assert.equal(appointmentConflicts(at("14:00", "15:30", "studio_01"), booked, { leadId: "L-2" }).length, 0, "คนละห้อง");
  assert.equal(appointmentConflicts(at("14:00", "15:30"), booked, { leadId: "L-1" }).length, 0, "ลีดเดียวกันไม่ชนตัวเอง");
  assert.equal(appointmentConflicts(at("14:00", "15:30"), [row({ endedAt: "2026-11-05T00:00:00Z" })], { leadId: "L-2" }).length, 0, "นัดที่ยกเลิกแล้วคืนห้องแล้ว");
  assert.equal(appointmentConflicts({ ...at("14:00", "15:30"), room: null }, booked).length, 0, "Online ไม่ใช้ห้อง");
});

test("ข้อความห้องชน: ชื่อลูกค้าเฉพาะลีดที่มองเห็นได้", () => {
  assert.equal(
    appointmentConflictMessage([{ ...row(), contactName: "คุณเอ", createdByName: "Marketing S&S" }]),
    "Studio 02 ไม่ว่าง 13:30–15:00 — ชนนัดของ คุณเอ (จองโดย Marketing S&S) · เลือกห้องอื่นหรือเปลี่ยนเวลา",
  );
  const hidden = appointmentConflictMessage([{ ...row(), contactName: null }, row({ id: "APT-2" })]);
  assert.match(hidden, /ชนนัดของลีดทีมอื่น และอีก 1 นัด/);
  assert.equal(appointmentConflictMessage([]), "");
});

test("นัดที่รออยู่: ยังไม่ปิด · ยังไม่จบ · เอานัดที่เริ่มก่อน", () => {
  const now = "2026-11-11T07:00:00.000Z"; // 14:00 ไทย ระหว่างนัดแรก
  const later = row({ id: "APT-2", startAt: "2026-11-12T02:00:00.000Z", endAt: "2026-11-12T03:00:00.000Z" });
  assert.equal(pickUpcomingAppointment([later, row()], now).id, "APT-1", "นัดที่กำลังเกิดอยู่ยังนับว่ารออยู่");
  assert.equal(pickUpcomingAppointment([row()], "2026-11-11T08:00:00.000Z"), null, "จบแล้ว = ไม่มีธง");
  assert.equal(pickUpcomingAppointment([row({ endedAt: "2026-11-10T00:00:00Z" })], now), null);
  assert.equal(pickUpcomingAppointment([], now), null);
});

test("แถว → ฟอร์ม (วัน/เวลาไทย) และเทียบนัดเดิม", () => {
  assert.deepEqual(appointmentFormValue(row()), studio());
  assert.deepEqual(appointmentFormValue(null), emptyAppointment());
  assert.ok(sameAppointment(row(), normalizeAppointmentInput(studio())), "ส่งค่าเดิมกลับมา = ไม่แตะ");
  assert.ok(!sameAppointment(row(), normalizeAppointmentInput(studio({ room: "studio_03" }))));
  assert.ok(!sameAppointment(row(), null));
  // รูปแบบสตริงต่างกัน (…Z vs …+00:00) ต้องเทียบด้วยจุดเวลา ไม่ใช่สตริง
  assert.ok(sameAppointment(row({ startAt: "2026-11-11T06:30:00+00:00", endAt: "2026-11-11T08:00:00+00:00" }), row()));
});

test("ป้ายนัด: วัน เวลา ห้อง/รูปแบบ ตามเวลาไทย", () => {
  assert.equal(appointmentTimeRange(row()), "13:30–15:00");
  assert.equal(appointmentPlace(row()), "Studio 02");
  assert.equal(appointmentPlace(row({ mode: "online", room: null })), "Online");
  assert.equal(appointmentPlace(row({ mode: "phone", room: null })), "โทร");
  assert.ok(isAppointmentToday(row(), "2026-11-10T18:00:00.000Z"), "01:00 ไทยของวันที่ 11 = วันเดียวกับนัด");
  assert.ok(!isAppointmentToday(row(), "2026-11-10T16:00:00.000Z"), "23:00 ไทยของวันที่ 10");
});

test("ฟอร์มแก้ลีด: นัดที่ AE ยืนยันแล้วล็อก · นัดของ MKT แก้ได้", () => {
  assert.deepEqual(intakeAppointmentState({}), { value: emptyAppointment(), lock: null });
  const intake = intakeAppointmentState({ appointment: row() });
  assert.deepEqual(intake.value, studio());
  assert.equal(intake.lock, null);
  const meeting = intakeAppointmentState({ appointment: row({ source: "meeting" }) });
  assert.ok(meeting.lock, "นัดประชุมต้องล็อก");
  assert.deepEqual(meeting.value, studio(), "ค่าเดิมยังอยู่ในฟอร์ม — API เทียบแล้วถือว่าไม่แตะ");
});

test("กล่องนัดประชุมเติมจากนัดที่จองไว้ — โทรไม่ใช่รูปแบบนัดประชุม", () => {
  assert.deepEqual(meetingAppointmentDefaults({ appointment: row() }), studio());
  assert.deepEqual(meetingAppointmentDefaults({ appointment: row({ mode: "phone", room: null }) }),
    { mode: "", date: "2026-11-11", start: "13:30", end: "15:00", room: "" });
  assert.deepEqual(meetingAppointmentDefaults({}), { ...emptyAppointment(), mode: "" });
});
