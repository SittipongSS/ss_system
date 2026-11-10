// ── ตัวเลือกวัน + ช่างแบบตาราง (P2) — สิ่งที่จอวาด คำนวณจากข้อมูลล้วน ─────────────────────────────────────────────
//
// ⭐ ม็อกฉบับสุดท้าย (เจ้าของ 10/11/2026): ตาราง 24 ชม. แถวละช่าง · มือถือ = รายชื่อว่างช่วงนี้ก่อน + ปุ่มช่วงเวลา
// ⚠️ ไม่รู้ภาระ = ไม่มีตัวเลข ไม่มีก้อน (ไม่ใช่ "ว่างทุกคน") · เตือน ไม่ห้าม
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAY_MINUTES, WORK_END, WORK_START, askedSlot } from './crewSlotGrid.js';
import {
  SLOT_COLS, crewSlotView, fitToAccess, lengthText, minuteAt, offscreenText, placeOf, rangeText,
  slotPresets, slotStripDays, valueSlot,
} from './crewSlotView.js';
import { CREW_UNKNOWN_TEXT } from './scheduleModal.js';

const DAY = '2026-11-18'; // พุธ
const technicians = [
  { id: 'U-NATE', name: 'Nattawut' }, { id: 'U-PEERA', name: 'Peera' }, { id: 'U-VEE', name: 'Veerachai' },
  { id: 'U-WIT', name: 'Witthaya' }, { id: 'U-API', name: 'Apisith' },
];
const load = {
  status: 'ok',
  closedSince: '2026-11-01',
  workload: { S1: { assets: 2 }, S2: { assets: 6 }, S4: { assets: 4 }, S5: { assets: 3 }, S6: { assets: 9 } },
  teams: [{ code: 'OPS', name: 'Operations' }],
  members: [{ userId: 'U-NATE', teamCode: 'OPS' }, { userId: 'U-PEERA', teamCode: 'OPS' }, { userId: 'U-VEE', teamCode: 'OPS' }, { userId: 'U-WIT', teamCode: 'OPS' }],
  visits: [
    { id: 'V1', code: 'SV-18', status: 'scheduled', scheduledDate: DAY, siteId: 'S1', assigneeId: 'U-NATE', startTime: '13:30:00', endTime: '15:00:00' },
    { id: 'V2', code: 'SV-21', status: 'scheduled', scheduledDate: DAY, siteId: 'S2', assigneeId: 'U-PEERA', startTime: '09:30:00', endTime: '11:30:00' },
    { id: 'V4', code: 'SV-30', kind: 'install', status: 'draft', installRequestId: 'R9', tsConfirmedAt: '2026-11-10T03:00:00Z', scheduledDate: DAY, siteId: 'S4', assigneeId: 'U-VEE', startTime: '13:00:00', endTime: '16:00:00' },
    { id: 'V5', code: 'SV-40', status: 'scheduled', scheduledDate: DAY, siteId: 'S5', assigneeId: 'U-WIT', startTime: '21:00:00', endTime: '23:30:00' },
    { id: 'V6', code: 'SV-50', status: 'scheduled', scheduledDate: DAY, siteId: 'S6', assigneeId: 'U-WIT' },
  ],
};
const asked = askedSlot({ requestedDate: DAY, requestedStartTime: '09:00', requestedEndTime: '12:00' });
const site = { accessFrom: '10:00:00', accessTo: '20:00:00', accessDays: [] };
const view = (value = {}, over = {}) => crewSlotView({
  technicians, load, asked, site, siteLoad: { assets: 4 },
  value: { date: DAY, startTime: '10:00', endTime: '13:00', assigneeId: 'U-NATE', ...value }, ...over,
});
const rowOf = (v, id) => v.rows.find((r) => r.id === id);

test('ตำแหน่งวาด: ช่อง 15 นาที 96 ช่อง · อย่างน้อยหนึ่งช่อง · ไม่ล้นวัน', () => {
  assert.equal(SLOT_COLS, 96);
  assert.deepEqual(placeOf(600, 780), { col: 40, span: 12 });
  assert.deepEqual(placeOf(525, 540), { col: 35, span: 1 }, '08:45–09:00');
  assert.deepEqual(placeOf(600, 600), { col: 40, span: 1 });
  assert.deepEqual(placeOf(1410, DAY_MINUTES), { col: 94, span: 2 });
  assert.deepEqual(placeOf(DAY_MINUTES, DAY_MINUTES), { col: 95, span: 1 });
});

test('ข้อความเวลา: ความยาว · 23:59 ที่ส่งฟอร์มอ่านว่า 24:00 · ค่าฟอร์มไม่ครบคู่ = ทั้งวัน', () => {
  assert.equal(lengthText(180), '3 ชม.');
  assert.equal(lengthText(90), '1 ชม. 30 นาที');
  assert.equal(lengthText(45), '45 นาที');
  assert.equal(rangeText(1260, DAY_MINUTES), '21:00–24:00');
  assert.deepEqual(valueSlot({ startTime: '21:00', endTime: '23:59' }), { start: 1260, end: DAY_MINUTES });
  // 🐞 11/11: มีแค่เวลาเริ่ม = รู้เวลาเริ่ม (วาด 1 ชม. · ธง open) ไม่ใช่ "นัดทั้งวัน"
  assert.deepEqual(valueSlot({ startTime: '10:00', endTime: '' }), { start: 600, end: 660, open: true });
  assert.deepEqual(valueSlot({ startTime: '13:00', endTime: '10:00' }), { start: 780, end: 840, open: true });
  assert.deepEqual(valueSlot({ startTime: '10:00', endTime: '12:00' }, { startOnly: true }), { start: 600, end: 660, open: true });
  assert.equal(valueSlot({ startTime: '', endTime: '12:00' }), null);
});

test('แถบวัน: 14 วันจากวันนี้ · ★ วันที่ขอ · อาทิตย์นอกเวลาทำการ · วันไกลกว่าแถบขึ้นท้าย', () => {
  const { days } = slotStripDays('2026-11-15', { askedDate: DAY, value: '2026-12-20' });
  assert.equal(days.length, 15);
  assert.equal(days[0].today, true);
  assert.equal(days[0].workday, false, '15/11 = อาทิตย์');
  assert.equal(days[0].weekdayText, 'อา.');
  assert.equal(days.find((d) => d.date === DAY).asked, true);
  assert.equal(days.at(-1).date, '2026-12-20');
  assert.equal(days.at(-1).extra, true);
  assert.deepEqual(slotStripDays('bad'), { days: [] });
});

test('เลื่อนตามไซต์: คงความยาว · ไม่ต้องเลื่อน/ไม่มีเวลาไซต์/ยาวกว่าช่วงไซต์ = null', () => {
  assert.deepEqual(fitToAccess(site, { start: 540, end: 720 }), { start: 600, end: 780 });
  assert.deepEqual(fitToAccess(site, { start: 1140, end: 1260 }), { start: 1080, end: 1200 }, 'จบเลย 20:00 ดันถอย');
  assert.equal(fitToAccess(site, { start: 660, end: 720 }), null);
  assert.equal(fitToAccess({}, { start: 540, end: 720 }), null);
  assert.equal(fitToAccess({ accessFrom: '10:00', accessTo: '11:00' }, { start: 540, end: 720 }), null);
});

test('ปุ่มช่วงเวลา (มือถือ): เลื่อนตามไซต์ก่อน · ที่ขอ · เช้า/บ่ายยาวเท่าที่ขอ · ทั้งวัน = เวลาทำการ', () => {
  assert.deepEqual(slotPresets({ asked, site }).map((p) => [p.key, p.label]), [
    ['site', '10:00–13:00 · เลื่อนตามไซต์'],
    ['asked', '09:00–12:00 ที่ขอ'],
    ['morning', 'เช้า 08:30–11:30'],
    ['afternoon', 'บ่าย 13:00–16:00'],
    ['allday', 'ทั้งวัน 08:30–17:30'],
  ]);
  const allDay = slotPresets({ asked: askedSlot({ requestedDate: DAY }) });
  assert.deepEqual(allDay.map((p) => p.key), ['morning', 'afternoon', 'allday']);
  assert.deepEqual(allDay[0], { key: 'morning', start: WORK_START, end: 720, label: 'เช้า 08:30–12:00' });
  assert.deepEqual(slotPresets({ currentLength: 90 }).map((p) => p.label).slice(0, 2), ['เช้า 08:30–10:00', 'บ่าย 13:00–14:30']);
});

test('แถว: ก้อนวางตามช่อง · จองไว้/งานดึกติดธง · ทั้งวันเป็นชิป · ถ้าเลือก → x/12', () => {
  const v = view();
  const nate = rowOf(v, 'U-NATE');
  assert.equal(nate.selected, true);
  assert.deepEqual(nate.blocks.map((b) => [b.code, b.col, b.span, b.kind]), [['SV-18', 54, 6, 'live']]);
  assert.equal(nate.projection.text, 'ถ้าเลือก → 6/12 จุด');
  assert.equal(nate.freeForSlot, true, '10:00–13:00 ไม่ทับ 13:30');
  const vee = rowOf(v, 'U-VEE');
  assert.equal(vee.blocks[0].reserved, true);
  assert.equal(vee.freeForSlot, true, 'จองไว้ 13:00 จบพอดีไม่ทับ');
  const wit = rowOf(v, 'U-WIT');
  assert.equal(wit.blocks[0].night, true);
  assert.deepEqual(wit.allDay.map((c) => c.text), ['ทั้งวัน · SV-50 · 9 จุด']);
  assert.equal(wit.projection.text, 'ถ้าเลือก → 16/12 จุด');
  assert.equal(wit.projection.over, true);
  assert.ok(wit.tags.some((t) => t.key === 'over' && t.tone === 'danger'));
  const api = rowOf(v, 'U-API');
  assert.equal(api.free, true);
  assert.equal(api.loadText, 'ว่างทั้งวัน');
  assert.deepEqual(v.groups.map((g) => g.label), ['Operations', 'ไม่ระบุทีม']);
  assert.equal(v.head.aside, 'วันนั้นว่าง 1 จาก 5 คน');
});

test('ทับนัด: ป้ายเตือนบอกเลขนัดกับเวลา · มือถือเรียงว่างช่วงนี้ก่อน', () => {
  const v = view({ startTime: '09:00', endTime: '12:00' });
  const peera = rowOf(v, 'U-PEERA');
  assert.equal(peera.freeForSlot, false);
  assert.ok(peera.tags.some((t) => t.text === 'เวลาทับ SV-21 09:30–11:30'));
  assert.equal(v.phoneRows.at(-1).id, 'U-PEERA');
  assert.ok(v.phoneRows.slice(0, 4).every((r) => r.freeForSlot));
});

test('บรรทัดเลือกแล้ว: ใคร · วัน · เวลา (เท่าที่ขอ) · ภาระ · เตือนนอกช่วงไซต์/นอกเวลาทำการ', () => {
  const v = view();
  assert.equal(v.summary.text, 'Nattawut · พ. 18 พ.ย. · 10:00–13:00 (3 ชม. เท่าที่ขอ)');
  assert.equal(v.summary.load, 'ถ้าเลือก → 6/12 จุด');
  assert.equal(v.summary.clean, 'ไม่ทับนัดอื่น · อยู่ในเวลาทำการ');
  const early = view({ startTime: '09:00', endTime: '12:00' });
  assert.ok(early.summary.warnings.some((w) => w.key === 'access'));
  const night = view({ startTime: '21:00', endTime: '23:59', assigneeId: '' });
  assert.equal(night.summary.text, 'ยังไม่เลือกหัวหน้างาน · พ. 18 พ.ย. · 21:00–24:00 (3 ชม. เท่าที่ขอ)');
  assert.ok(night.summary.warnings.some((w) => w.key === 'offhours'), 'ไม่มีคนเลือกก็ยังเตือนเวลา');
  assert.equal(night.invalid, true);
  const allDay = view({ startTime: '', endTime: '' });
  assert.equal(allDay.selection, null);
  assert.match(allDay.summary.text, /ยังไม่ระบุเวลา — นัดทั้งวัน$/);
});

test('แทร็กหัวตาราง: เวลาทำการ · ช่วงไซต์ · ที่ขอ (วันอื่น = บอกเป็นคำ)', () => {
  const v = view();
  assert.deepEqual(v.tracks.work, placeOf(WORK_START, WORK_END));
  assert.equal(v.tracks.access.text, 'ไซต์ให้เข้า 10:00–20:00');
  assert.deepEqual([v.tracks.asked.col, v.tracks.asked.span, v.tracks.asked.text], [36, 12, '09:00–12:00']);
  const sunday = view({ date: '2026-11-22' });
  assert.equal(sunday.tracks.work, null, 'อาทิตย์ทั้งวันนอกเวลาทำการ');
  assert.equal(sunday.tracks.asked, null);
  assert.equal(sunday.tracks.askedElsewhere, 'ขอ พ. 18 พ.ย.');
});

test('ไม่รู้ภาระ = ไม่มีตัวเลข ไม่มีก้อน ไม่มีป้ายว่าง + คำเตือน · ไม่มีวัน = บอกให้เลือกวัน', () => {
  for (const bad of [null, { status: 'error' }, { ...load, closedSince: '2026-12-01' }]) {
    const v = view({}, { load: bad });
    assert.equal(v.state, 'unknown');
    assert.equal(v.notice, CREW_UNKNOWN_TEXT);
    assert.ok(v.rows.every((r) => r.blocks.length === 0 && r.loadText === '' && r.bar === null && r.tags.length === 0));
    assert.equal(v.head.aside, '');
  }
  assert.equal(view({ date: '' }).state, 'nodate');
});

test('คนเดิมหลุดรายชื่อ = แถวค้าง · ยอมให้ไม่มอบหมาย = มีแถว · ไม่ยอม = invalid', () => {
  const v = view({ assigneeId: 'U-GONE' }, { currentName: 'Somchai' });
  assert.deepEqual(v.pinned, { id: 'U-GONE', name: 'Somchai', note: 'ไม่อยู่ในรายชื่อเจ้าหน้าที่บริการแล้ว' });
  assert.equal(view({ assigneeId: '' }, { allowUnassigned: true }).unassigned.selected, true);
  assert.equal(view().unassigned, null);
  assert.equal(view({ assigneeId: '' }).invalid, true);
  assert.equal(crewSlotView({ technicians: [], value: { date: DAY } }).roster.state, 'empty');
});

test('นัดที่กำลังแก้ไม่นับเป็นก้อน/ภาระของตัวเอง', () => {
  const v = view({ assigneeId: 'U-VEE' }, { excludeVisitId: 'V4' });
  assert.equal(rowOf(v, 'U-VEE').blocks.length, 0);
  assert.equal(rowOf(v, 'U-VEE').free, true);
});

test('จุดกด → นาที · งานนอกจอ', () => {
  assert.equal(minuteAt(820, { left: 100, width: 1440 }), 720);
  assert.equal(minuteAt(50, { left: 100, width: 1440 }), 0);
  assert.equal(minuteAt(5000, { left: 100, width: 1440 }), DAY_MINUTES);
  const jobs = view().overview.jobs;
  const off = offscreenText(jobs, { from: 420, to: 1080, selection: null });
  assert.equal(off.prev.text, '‹ ก่อน 07:00');
  assert.equal(off.prev.flagged, false);
  assert.equal(off.next.text, 'หลัง 18:00 · มีงาน 1 ›');
  assert.equal(off.next.flagged, true);
  assert.equal(offscreenText(jobs, { from: 0, to: DAY_MINUTES }).prev.disabled, true);
});

test('ไฟล์ตัวคำนวณไม่มี React และคอมโพเนนต์ไม่เขียน style={{ (audit:ui)', () => {
  const lib = readFileSync(new URL('./crewSlotView.js', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /from ['"]react['"]/);
  const ui = readFileSync(new URL('../../components/service/CrewSlotPicker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /style=\{\{/);
  assert.match(ui, /crewSlotView\(/, 'จอวาดตามตัวคำนวณ ไม่คิดเอง');
});

test('รู้แค่เวลาเริ่ม: บรรทัดเลือกแล้ว "เริ่ม … (ไม่ระบุเวลาจบ)" · ช่วงไซต์ตัดสินจากเวลาเริ่ม · ปุ่มมือถือเติมแค่เวลาเริ่ม', () => {
  const v = view({ startTime: '14:00', endTime: '' });
  assert.equal(v.summary.text, 'Nattawut · พ. 18 พ.ย. · เริ่ม 14:00 (ไม่ระบุเวลาจบ)');
  assert.equal(v.selection.text, 'เริ่ม 14:00');
  assert.ok(rowOf(v, 'U-NATE').tags.some((t) => t.text.startsWith('เวลาทับ SV-18')), 'วาด 1 ชม. ⇒ ทับ 13:30–15:00');
  const late = view({ startTime: '19:30', endTime: '' });
  assert.ok(!late.summary.warnings.some((w) => w.key === 'access'), '19:30 ยังอยู่ในช่วงไซต์ (ไม่เดาเวลาจบ)');
  const survey = crewSlotView({ technicians, load, value: { date: DAY, startTime: '09:00', assigneeId: 'U-NATE' }, site, startOnly: true });
  assert.ok(survey.summary.warnings.some((w) => w.key === 'access'), 'เริ่มก่อนไซต์เปิด');
  assert.match(survey.hint, /นัดนี้เก็บแค่เวลาเริ่ม/);
  assert.deepEqual(slotPresets({ startOnly: true, asked }).map((p) => p.label), ['เริ่ม 09:00 ที่ขอ', 'เช้า เริ่ม 08:30', 'บ่าย เริ่ม 13:00']);
});
