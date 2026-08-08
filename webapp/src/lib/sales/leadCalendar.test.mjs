// Tests ปฏิทินนัดฝ่ายขาย — ขอบวันที่ (UTC vs เวลาไทย) + ขอบเขตข้อมูล
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { CALENDAR_MAX_DAYS, calendarRange, isInLocalMonth, toCalendarEntries } from './leadCalendar.js';

test('calendarRange: ถ่างขอบด้านละ 1 วัน — นัดตีหนึ่งต้องไม่หายไปจากเดือนที่กำลังดู', () => {
  const range = calendarRange('2026-08-01', '2026-08-31');
  assert.equal(range.error, null);
  // ต้นทางถอยหนึ่งวัน: นัด 01:00 น. ของ 1 ส.ค. (เวลาไทย) = 2026-07-31T18:00Z
  assert.equal(range.fromIso, '2026-07-31T00:00:00.000Z');
  // ปลายทางเป็นแบบ "ไม่รวม" = สิ้นวัน 31 (+1) แล้วเผื่อขอบอีกวัน (+1)
  assert.equal(range.untilIso, '2026-09-02T00:00:00.000Z');
  assert.ok(Date.parse('2026-07-31T18:00:00.000Z') >= Date.parse(range.fromIso),
    'นัดตีหนึ่งของวันแรกต้องอยู่ในช่วงที่ query');
});

test('calendarRange: ปฏิเสธรูปแบบผิด ช่วงกลับหัว และช่วงยาวเกินเพดาน', () => {
  assert.match(calendarRange('', '2026-08-31').error, /YYYY-MM-DD/);
  assert.match(calendarRange('2026-8-1', '2026-08-31').error, /YYYY-MM-DD/);
  assert.match(calendarRange('2026-08-31', '2026-08-01').error, /ไม่มาก่อน/);
  assert.match(calendarRange('2026-01-01', '2026-12-31').error, new RegExp(String(CALENDAR_MAX_DAYS)));
  // ขอบพอดีเพดานต้องผ่าน (92 วัน = 1 ม.ค. → 2 เม.ย. ในปีที่ไม่ใช่อธิกสุรทิน)
  assert.equal(calendarRange('2026-01-01', '2026-04-02').error, null);
});

/* ⭐ ด่านที่สำคัญที่สุดของหน้านี้ — ปฏิทินที่หลวมกว่าคิวลีดคือช่องอ่านชื่อลูกค้าข้ามทีม
   `leadsById` คือผลของ applyLeadScope แล้ว: อะไรที่ไม่อยู่ในนั้น = คนดูไม่มีสิทธิ์เห็น */
test('toCalendarEntries: นัดที่ลีดต้นทางอยู่นอกขอบเขต ต้องหายไปทั้งใบ ไม่ใช่คืนแบบไม่มีชื่อ', () => {
  const events = [
    { id: 'LEV-1', leadId: 'L-mine', eventAt: '2026-08-12T03:00:00+00:00', meetingMode: 'online', createdByName: 'ศิริพร' },
    { id: 'LEV-2', leadId: 'L-other-team', eventAt: '2026-08-12T05:00:00+00:00', meetingMode: 'online' },
  ];
  const leadsById = new Map([
    ['L-mine', { id: 'L-mine', contactName: 'คุณมนัสวี', company: 'ริเวอร์ เพลส', team: 'KA', assigneeId: 'u1', assigneeName: 'ศิริพร', status: 'meeting' }],
  ]);
  const out = toCalendarEntries(events, leadsById);
  assert.equal(out.length, 1);
  assert.equal(out[0].leadId, 'L-mine');
  assert.equal(out[0].contactName, 'คุณมนัสวี');
  assert.equal(out[0].bookedByName, 'ศิริพร');
  assert.equal(JSON.stringify(out).includes('L-other-team'), false, 'ห้ามมีร่องรอยของลีดนอกขอบเขตเลย');
});

test('toCalendarEntries: เหตุการณ์ที่ไม่มีเวลานัด ตกไป (ลงปฏิทินไม่ได้)', () => {
  const leadsById = new Map([['L1', { id: 'L1', contactName: 'ก', status: 'meeting' }]]);
  assert.deepEqual(toCalendarEntries([{ id: 'e1', leadId: 'L1', eventAt: null }], leadsById), []);
  assert.deepEqual(toCalendarEntries([], leadsById), []);
  assert.deepEqual(toCalendarEntries(), []);
});

/* ล็อกสัญญาฝั่ง route: ขอบเขตต้องมาจาก applyLeadScope ตัวเดียวกับคิวลีด
   ถ้าใครเขียนกติกาใหม่ที่นี่ สองที่จะดริฟต์ออกจากกันแบบไม่มี error ให้เห็น */
test('route ปฏิทินต้องใช้ applyLeadScope ตัวเดียวกับคิวลีด และอ่านจาก lead_events', () => {
  const routeSource = readFileSync(
    new URL('../../app/api/sales-planning/calendar/route.js', import.meta.url),
    'utf8',
  );
  assert.match(routeSource, /applyLeadScope\(query, user\)/);
  assert.match(routeSource, /from\('lead_events'\)/);
  assert.match(routeSource, /\.eq\('kind', 'meeting'\)/);
  // ตรวจเฉพาะ "โค้ดที่ query" ไม่ใช่ทั้งไฟล์ — คอมเมนต์อธิบายเหตุผลก็เอ่ยชื่อคอลัมน์นี้
  assert.doesNotMatch(routeSource, /\.select\([^)]*meetingAt/,
    'ห้ามอ่านจาก sales_leads.meetingAt — คอลัมน์นั้นเก็บได้ใบละ "นัดถัดไป" ค่าเดียว');
});

/* 🐞 บั๊กที่เจอตอนตรวจตัวเลข 2026-08-08: server ถ่างขอบ ±1 วันมาให้ (calendarRange)
   แต่หน้าจอไม่ได้ตัดทิ้ง ⇒ ป้าย "N นัด" กับมุมมองรายการกินนัดของเดือนข้างเคียงมาด้วย
   ขณะที่ตารางเดือนไม่โชว์ (วาดเฉพาะช่องของเดือนนี้) = สองมุมมองพูดคนละเลข */
test('isInLocalMonth: ตัดวันที่ถ่างเผื่อขอบทิ้ง — วัดด้วยเวลาท้องถิ่นไม่ใช่ UTC', () => {
  const AUG = 7; // getMonth: 0 = มกราคม
  // เที่ยงวันกลางเดือน — อยู่ในเดือนแน่นอนทุก timezone
  assert.equal(isInLocalMonth('2026-08-12T05:00:00.000Z', 2026, AUG), true);
  // ขอบที่ server ถ่างมา: 31 ก.ค. กับ 1–2 ก.ย. ต้องไม่ถูกนับเป็นเดือนสิงหาคม
  assert.equal(isInLocalMonth('2026-07-31T05:00:00.000Z', 2026, AUG), false);
  assert.equal(isInLocalMonth('2026-09-01T05:00:00.000Z', 2026, AUG), false);
  // เดือนเดียวกันแต่คนละปี
  assert.equal(isInLocalMonth('2025-08-12T05:00:00.000Z', 2026, AUG), false);
  // ค่าเสีย → ไม่นับ (ดีกว่าโผล่ผิดช่อง)
  assert.equal(isInLocalMonth('ไม่ใช่วันที่', 2026, AUG), false);
  assert.equal(isInLocalMonth(null, 2026, AUG), false);
});

test('หน้าปฏิทินต้องกรองด้วย isInLocalMonth ก่อนนับ — ไม่งั้นป้ายจำนวนกับตารางไม่ตรงกัน', () => {
  const pageSource = readFileSync(new URL('../../app/sa/calendar/page.js', import.meta.url), 'utf8');
  assert.match(pageSource, /isInLocalMonth\(entry\.at, cursor\.y, cursor\.m\)/);
});
