// รอบบริการ + ตารางนัด (mig 0188) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayLoad,
  ensureVisits,
  nextAfterDone,
  normalizePlanInput,
  normalizeVisitInput,
  overlaps,
  overlappingVisitIds,
  plannedDates,
  sortByTime,
  visitMinutes,
  visitTimeText,
  visitWarnings,
  zoneSplit,
} from './rounds.js';

const plan = (over = {}) => ({
  id: 'P1', siteId: 'S1', kind: 'refill', everyDays: 30,
  startDate: '2026-08-03', endDate: null, isActive: true,
  assigneeId: 'U1', assigneeName: 'ช่างเอ', ...over,
});

const visit = (over = {}) => ({
  id: 'V1', siteId: 'S1', kind: 'refill', scheduledDate: '2026-08-03',
  status: 'scheduled', assigneeId: 'U1', assigneeName: 'ช่างเอ', ...over,
});

// ── ตรวจข้อมูลรอบ ────────────────────────────────────────────────────────
test('รอบต้องมีไซต์ ชนิด และจำนวนวันที่สมเหตุสมผล', () => {
  assert.equal(normalizePlanInput({ kind: 'refill', everyDays: 30, startDate: '2026-08-03' }).error, 'ต้องระบุไซต์');
  assert.match(normalizePlanInput({ siteId: 'S1', kind: 'install', everyDays: 30, startDate: '2026-08-03' }).error, /ชนิดรอบ/);
  assert.match(normalizePlanInput({ siteId: 'S1', kind: 'refill', everyDays: 0, startDate: '2026-08-03' }).error, /1–365/);
  assert.match(normalizePlanInput({ siteId: 'S1', kind: 'refill', everyDays: 400, startDate: '2026-08-03' }).error, /1–365/);
});

test('วันสิ้นสุดรอบต้องไม่ก่อนวันเริ่ม', () => {
  const { error } = normalizePlanInput({ siteId: 'S1', kind: 'refill', everyDays: 30, startDate: '2026-08-03', endDate: '2026-07-01' });
  assert.match(error, /ไม่ก่อนวันเริ่ม/);
});

// ── ตรวจข้อมูลนัด ────────────────────────────────────────────────────────
test('นัดต้องมีไซต์ ชนิดงาน และวันที่', () => {
  assert.equal(normalizeVisitInput({ kind: 'refill', scheduledDate: '2026-08-03' }).error, 'ต้องระบุไซต์');
  assert.equal(normalizeVisitInput({ siteId: 'S1', kind: 'refill' }).error, 'ต้องระบุวันที่นัด');
});

test('เวลาเริ่มต้องก่อนเวลาสิ้นสุด ทั้งเวลานัดและเวลาจริง', () => {
  const base = { siteId: 'S1', kind: 'refill', scheduledDate: '2026-08-03' };
  assert.match(normalizeVisitInput({ ...base, startTime: '15:00', endTime: '10:00' }).error, /เวลานัด/);
  assert.match(normalizeVisitInput({ ...base, actualStartTime: '15:00', actualEndTime: '10:00' }).error, /เวลาที่เข้าจริง/);
});

test('⭐ ปิดงานโดยไม่ระบุวันเข้าจริง → เติมวันนัดให้ (nextAfterDone ต้องมี anchor เสมอ)', () => {
  const { value } = normalizeVisitInput({ siteId: 'S1', kind: 'refill', scheduledDate: '2026-08-03', status: 'done' });
  assert.equal(value.actualDate, '2026-08-03');
});

test('เวลาถูกตัดวินาทีทิ้ง (Postgres คืน 10:00:00)', () => {
  const { value } = normalizeVisitInput({ siteId: 'S1', kind: 'refill', scheduledDate: '2026-08-03', startTime: '10:00:00', endTime: '11:30:00' });
  assert.equal(value.startTime, '10:00');
  assert.equal(value.endTime, '11:30');
});

// ── วันที่ตามรอบ ─────────────────────────────────────────────────────────
test('รอบทุก 30 วัน คืนวันตามรอบในช่วงที่ถาม', () => {
  const dates = plannedDates(plan(), { from: '2026-08-01', to: '2026-11-01' });
  assert.deepEqual(dates, ['2026-08-03', '2026-09-02', '2026-10-02']);
  // 11-01 ตกวันอาทิตย์ → เลื่อนเป็น 11-02 ซึ่งหลุดกรอบที่ถาม จึงไม่คืนมา
  assert.deepEqual(plannedDates(plan(), { from: '2026-08-01', to: '2026-11-05' }).at(-1), '2026-11-02');
});

test('วันที่ตกเสาร์-อาทิตย์/วันหยุด เลื่อนไปวันทำการถัดไป', () => {
  // 2026-08-01 = เสาร์ → เลื่อนเป็นจันทร์ 3 ส.ค.
  const dates = plannedDates(plan({ startDate: '2026-08-01', everyDays: 90 }), { from: '2026-08-01', to: '2026-08-10' });
  assert.deepEqual(dates, ['2026-08-03']);
});

test('⭐ การเลื่อนหนีวันหยุดต้องไม่สะสม — ไม่งั้น "ทุก 30 วัน" กลายเป็นทุก 35 วันภายในปีเดียว', () => {
  const dates = plannedDates(plan({ startDate: '2026-08-01', everyDays: 30 }), { from: '2026-08-01', to: '2026-10-05' });
  // รอบจริงเดินจาก 08-01: 08-01, 08-31, 09-30 · เฉพาะวันที่ตกวันหยุดถูกเลื่อน
  assert.deepEqual(dates, ['2026-08-03', '2026-08-31', '2026-09-30']);
});

test('รอบที่หมดอายุแล้วไม่คืนวันหลัง endDate', () => {
  const dates = plannedDates(plan({ endDate: '2026-09-01' }), { from: '2026-08-01', to: '2026-12-01' });
  assert.deepEqual(dates, ['2026-08-03']);
});

// ── gen นัด ──────────────────────────────────────────────────────────────
test('gen เฉพาะนัดที่ยังไม่มี ภายใน horizon 90 วัน', () => {
  const existing = [visit({ id: 'V1', planId: 'P1', scheduledDate: '2026-08-03' })];
  const rows = ensureVisits(plan(), existing, { from: '2026-08-01', horizonDays: 90 });
  assert.deepEqual(rows.map((r) => r.scheduledDate), ['2026-09-02', '2026-10-02']);
  assert.equal(rows[0].assigneeId, 'U1');   // ช่างประจำของรอบเป็นค่าตั้งต้น
  assert.equal(rows[0].planId, 'P1');
});

test('⭐ นัดที่ถูกยกเลิกยังนับว่า "มีแล้ว" — ไม่งั้นระบบ gen กลับมาให้ใหม่ทุกครั้งที่เปิดหน้า', () => {
  const existing = [visit({ id: 'V1', planId: 'P1', scheduledDate: '2026-08-03', status: 'cancelled' })];
  const rows = ensureVisits(plan(), existing, { from: '2026-08-01', horizonDays: 20 });
  assert.deepEqual(rows.map((r) => r.scheduledDate), []);
});

test('รอบที่ปิดใช้งานไม่ gen อะไรเลย', () => {
  assert.deepEqual(ensureVisits(plan({ isActive: false }), [], { from: '2026-08-01' }), []);
});

// ── รอบถัดไปหลังปิดงาน ───────────────────────────────────────────────────
test('⭐ รอบถัดไปนับจากวันที่ทำจริง ไม่ใช่วันที่นัดไว้ — เข้าช้า 5 วัน รอบหน้าต้องขยับตาม', () => {
  const done = visit({ scheduledDate: '2026-08-03', actualDate: '2026-08-10', status: 'done' });
  const next = nextAfterDone(plan(), done);
  assert.equal(next.scheduledDate, '2026-09-09');   // 08-10 + 30 วัน

  const onTime = nextAfterDone(plan(), visit({ scheduledDate: '2026-08-03', actualDate: '2026-08-03', status: 'done' }));
  assert.equal(onTime.scheduledDate, '2026-09-02');
});

test('รอบถัดไปที่ตกวันหยุดถูกเลื่อนไปวันทำการ และไม่ล้ำ endDate', () => {
  assert.equal(nextAfterDone(plan({ endDate: '2026-08-31' }), visit({ actualDate: '2026-08-03' })), null);
});

// ── โหลดงานรายวัน ────────────────────────────────────────────────────────
test('เตือนเมื่อช่างคนเดียวถูกนัดเกินที่ทำไหวในวันเดียว', () => {
  const visits = Array.from({ length: 6 }, (_, i) => visit({ id: `V${i}`, siteId: `S${i}` }));
  const [load] = dayLoad(visits, { perPersonPerDay: 5 });
  assert.equal(load.count, 6);
  assert.equal(load.over, true);
  assert.equal(dayLoad(visits.slice(0, 5), { perPersonPerDay: 5 })[0].over, false);
});

test('นัดที่ยกเลิก/เลื่อนแล้วไม่กินคิวของใคร', () => {
  const visits = [
    visit({ id: 'V1' }),
    visit({ id: 'V2', status: 'cancelled' }),
    visit({ id: 'V3', status: 'rescheduled' }),
  ];
  assert.equal(dayLoad(visits)[0].count, 1);
});

test('รวมนาทีงานต่อวัน และนับนัดที่ยังไม่ระบุเวลาแยก', () => {
  const visits = [
    visit({ id: 'V1', startTime: '09:00', endTime: '10:30' }),
    visit({ id: 'V2', startTime: '13:00', endTime: '14:00' }),
    visit({ id: 'V3' }),
  ];
  const [load] = dayLoad(visits);
  assert.equal(load.minutes, 150);
  assert.equal(load.unknownTime, 1);
  assert.equal(visitMinutes(visits[0]), 90);
  assert.equal(visitMinutes(visits[2]), null);   // ไม่รู้เวลา = null ไม่ใช่ 0
});

// ── เวลาทับกัน ───────────────────────────────────────────────────────────
test('⭐ นัดของช่างคนเดียวกันที่เวลาทับกัน → เตือน', () => {
  const visits = [
    visit({ id: 'V1', startTime: '10:00', endTime: '12:00' }),
    visit({ id: 'V2', siteId: 'S2', startTime: '11:00', endTime: '13:00' }),
  ];
  const pairs = overlaps(visits);
  assert.equal(pairs.length, 1);
  assert.deepEqual([...overlappingVisitIds(visits)].sort(), ['V1', 'V2']);
});

test('⭐ ติดกันพอดี (11:00 จบ / 11:00 เริ่ม) ไม่ถือว่าทับ', () => {
  const visits = [
    visit({ id: 'V1', startTime: '10:00', endTime: '11:00' }),
    visit({ id: 'V2', siteId: 'S2', startTime: '11:00', endTime: '12:00' }),
  ];
  assert.deepEqual(overlaps(visits), []);
});

test('⭐ ช่างคนละคนไม่นับว่าทับ แม้เวลาเดียวกันเป๊ะ', () => {
  const visits = [
    visit({ id: 'V1', assigneeId: 'U1', startTime: '10:00', endTime: '12:00' }),
    visit({ id: 'V2', assigneeId: 'U2', siteId: 'S2', startTime: '10:00', endTime: '12:00' }),
  ];
  assert.deepEqual(overlaps(visits), []);
});

test('⭐ นัดที่ไม่ระบุเวลา หรือยังไม่มอบหมายคน ชนกับใครไม่ได้ — ไม่รู้ ไม่ใช่ ทับ', () => {
  const noTime = [visit({ id: 'V1' }), visit({ id: 'V2', siteId: 'S2', startTime: '10:00', endTime: '12:00' })];
  assert.deepEqual(overlaps(noTime), []);
  const noOwner = [
    visit({ id: 'V1', assigneeId: null, startTime: '10:00', endTime: '12:00' }),
    visit({ id: 'V2', assigneeId: null, siteId: 'S2', startTime: '10:00', endTime: '12:00' }),
  ];
  assert.deepEqual(overlaps(noOwner), []);
});

// ── ข้ามโซน ──────────────────────────────────────────────────────────────
test('วิ่งข้ามโซนในวันเดียว → ขึ้นป้ายเตือน', () => {
  const sites = new Map([['S1', { zone: 'BKK-E' }], ['S2', { zone: 'ปริมณฑล' }]]);
  const [row] = zoneSplit([visit({ id: 'V1' }), visit({ id: 'V2', siteId: 'S2' })], sites);
  assert.equal(row.crossZone, true);
  assert.deepEqual(row.zones.sort(), ['BKK-E', 'ปริมณฑล'].sort());

  const same = zoneSplit([visit({ id: 'V1' }), visit({ id: 'V2' })], sites);
  assert.equal(same[0].crossZone, false);
});

// ── ป้ายเตือนรวมของนัดใบเดียว ────────────────────────────────────────────
test('นัดนอกช่วงที่ไซต์ให้เข้า + เวลาทับ → เตือนทั้งสองข้อ (ไม่บล็อก)', () => {
  const site = { accessFrom: '10:00', accessTo: '11:00', accessDays: [] };
  const v = visit({ id: 'V1', startTime: '09:00', endTime: '10:30' });
  const warnings = visitWarnings(v, { site, overlapIds: new Set(['V1']) });
  assert.deepEqual(warnings.map((w) => w.kind).sort(), ['overlap', 'time']);
});

test('นัดที่ไม่มีเงื่อนไขอะไรเลย ไม่มีป้ายเตือน', () => {
  assert.deepEqual(visitWarnings(visit(), { site: { accessDays: [] } }), []);
});

// ── การแสดงผล ────────────────────────────────────────────────────────────
test('ชิปบนปฏิทินเรียงตามเวลา · นัดที่ยังไม่ระบุเวลาไปท้ายสุด', () => {
  const rows = sortByTime([
    visit({ id: 'V3', code: 'C3' }),
    visit({ id: 'V2', code: 'C2', startTime: '13:00' }),
    visit({ id: 'V1', code: 'C1', startTime: '09:00' }),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['V1', 'V2', 'V3']);
});

test('ข้อความเวลาบนชิปอ่านรู้เรื่องทุกกรณี', () => {
  assert.equal(visitTimeText(visit({ startTime: '10:00:00', endTime: '11:00:00' })), '10:00–11:00');
  assert.equal(visitTimeText(visit({ startTime: '10:00' })), '10:00');
  assert.equal(visitTimeText(visit()), 'ทั้งวัน');
});
