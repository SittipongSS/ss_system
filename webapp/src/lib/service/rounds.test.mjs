// รอบบริการ + ตารางนัด (mig 0188) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  routeZoneSplit,
} from './rounds.js';

const plan = (over = {}) => ({
  id: 'P1', siteId: 'S1', kind: 'refill', everyDays: 30,
  startDate: '2026-08-03', endDate: null, isActive: true,
  assigneeId: 'U1', assigneeName: 'เจ้าหน้าที่เอ', ...over,
});

const visit = (over = {}) => ({
  id: 'V1', siteId: 'S1', kind: 'refill', scheduledDate: '2026-08-03',
  status: 'scheduled', assigneeId: 'U1', assigneeName: 'เจ้าหน้าที่เอ', ...over,
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
  assert.equal(rows[0].assigneeId, 'U1');   // เจ้าหน้าที่ประจำของรอบเป็นค่าตั้งต้น
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
test('เตือนเมื่อเจ้าหน้าที่คนเดียวถูกนัดเกินที่ทำไหวในวันเดียว', () => {
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
test('⭐ นัดของเจ้าหน้าที่คนเดียวกันที่เวลาทับกัน → เตือน', () => {
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

test('⭐ เจ้าหน้าที่คนละคนไม่นับว่าทับ แม้เวลาเดียวกันเป๊ะ', () => {
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

// ── ข้ามเขตวิ่งงาน ───────────────────────────────────────────────────────
test('วิ่งข้ามเขตในวันเดียว → ขึ้นป้ายเตือน', () => {
  const sites = new Map([['S1', { routeZone: 'BKK-E' }], ['S2', { routeZone: 'ปริมณฑล' }]]);
  const [row] = routeZoneSplit([visit({ id: 'V1' }), visit({ id: 'V2', siteId: 'S2' })], sites);
  assert.equal(row.crossRouteZone, true);
  assert.deepEqual(row.routeZones.sort(), ['BKK-E', 'ปริมณฑล'].sort());

  const same = routeZoneSplit([visit({ id: 'V1' }), visit({ id: 'V2' })], sites);
  assert.equal(same[0].crossRouteZone, false);
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

/* ═══════════════════════════════════════════════════════════════════════
   รอบบริการผูกกับใบสั่งขาย (mig 0188 มีคอลัมน์ `salesOrderId` มาตั้งแต่แรก)

   🔴 **ก่อนหน้านี้ไม่มีโค้ดไหนในระบบเขียนค่านี้เลย** — ทั้งโมดัลและ route ปล่อยว่างเสมอ
      แต่ทะเบียนใบสั่งขายอ่านคอลัมน์นี้มาทำคอลัมน์ "รอบที่เดิน n/N"
      ⇒ ทุกใบบริการตอบ 0 มาตลอด (วันนี้ยังไม่มีใครเจอเพราะ service_plans ว่างเปล่า)
   ═══════════════════════════════════════════════════════════════════════ */

/* 🪤 **กฎนี้กลับด้านแล้ว (2026-09-02)** — ของเดิมบังคับว่า "ส่งเฉพาะตอนสร้าง"
   เพราะยังไม่มีช่องให้แก้: PATCH ผสม `{...before, ...body}` ⇒ ส่งค่าว่างทุกครั้ง
   จะล้างค่าเดิมทิ้ง · ตอนนี้มีช่องจริงในฟอร์มแล้ว ค่าที่ส่งคือสิ่งที่คนเลือกเสมอ
   ⇒ ต้องส่ง **ทุกครั้ง** ไม่งั้นย้ายใบไม่ได้ ซึ่งเป็นทางเดียวที่รอบของใบที่ถูก Rev.
     จะตามไปใบใหม่ได้ (ไม่มีโค้ดไหนย้ายให้อัตโนมัติ) */
test('🪤 โมดัลรอบบริการต้องมีช่องเลือกใบ และส่งค่าทุกครั้ง ไม่ใช่เฉพาะตอนสร้าง', () => {
  const modal = readFileSync(
    new URL('../../components/service/ServicePlanModal.js', import.meta.url),
    'utf8',
  );
  assert.match(modal, /salesOrderId: form\.salesOrderId \|\| null/,
    'payload ต้องส่งค่าจากฟอร์มเสมอ — ค่าว่างคือ "ไม่ผูกใบ" ไม่ใช่ "ไม่ได้กรอก"');
  assert.doesNotMatch(modal, /!editing && salesOrderId/,
    'ท่าเดิมที่ส่งเฉพาะตอนสร้าง ทำให้ย้ายใบไม่ได้');
  assert.match(modal, /ใบสั่งขายที่ครอบรอบนี้/, 'ต้องมีช่องจริงให้เลือก ไม่ใช่ค่าที่แอบยัด');
  assert.match(modal, /ไม่ผูกใบ/, 'ต้องเลือก "ไม่ผูกใบ" ได้ — เป็นคำตอบที่ถูกต้องคำตอบหนึ่ง');
});

/* 🔴 ด่านของ POST ต้องมีที่ PATCH ด้วย เมื่อ PATCH ย้ายใบได้แล้ว —
   คอลัมน์ไม่มี FK ⇒ id มั่วเข้าฐานได้ทางที่เพิ่งเปิด */
test('🔴 PATCH ที่ย้ายใบต้องตรวจว่าใบมีจริง และเขียน audit ว่าย้าย', () => {
  const route = readFileSync(
    new URL('../../app/api/service/plans/[id]/route.js', import.meta.url), 'utf8',
  );
  assert.match(route, /const movedOrder = /);
  assert.match(route, /if \(movedOrder && value\.salesOrderId\)/,
    'ตรวจเฉพาะตอนค่าเปลี่ยน — PATCH ผสมค่าเดิมมาทุกครั้ง');
  assert.match(route, /ไม่พบใบสั่งขายที่อ้างถึง/);
  assert.match(route, /if \(orderError\) return fail\(orderError\.message, 500\)/);
  assert.match(route, /ย้ายข้อผูกพันไปใบ/, 'บรรทัดสรุปต้องบอกว่าย้ายใบ — มันขยับ n/N ของสองใบ');
});

test('🔴 route สร้างรอบต้องตรวจว่าใบสั่งขายที่อ้างถึงมีจริง', () => {
  const route = readFileSync(
    new URL('../../app/api/service/plans/route.js', import.meta.url),
    'utf8',
  );
  // คอลัมน์ไม่มี FK และ normalizePlanInput ปล่อยผ่านทุกค่า ⇒ ด่านต้องอยู่ที่ route
  assert.match(route, /if \(value\.salesOrderId\) \{/);
  assert.match(route, /ไม่พบใบสั่งขายที่อ้างถึง/);
  // ห้ามกลืน error ของคิวรีแล้วเอา !order ไปตัดสิน (กฎเดียวกับทั้งระบบ)
  assert.match(route, /if \(orderError\) return fail\(orderError\.message, 500\)/);
});

/* ⭐ **ปุ่มวางรอบบนหน้าใบสั่งขายเป็นของฝ่ายบริการ ไม่ใช่ของฝ่ายขาย**
   มติผู้ใช้ 2026-08-30 ("ระบบธุรกิจบริการ เข้าใช้ได้เฉพาะ TS") ยังยืนอยู่ และ
   `POST /api/service/plans` บังคับ `canEditService` อยู่แล้ว ⇒ จอต้องถามด่านตัวเดียวกัน
   ไม่ใช่โชว์ปุ่มให้ทุกคนที่เปิดใบได้แล้วปล่อยให้ไปเจอ 403 */
test('แท็บงานบริการถามด่านตัวเดียวกับ API ก่อนโชว์ปุ่มวางรอบ', () => {
  const tab = readFileSync(
    new URL('../../components/salesPlanning/SalesOrderServiceTab.js', import.meta.url),
    'utf8',
  );
  assert.match(tab, /canEditService\(\{ role, team, teams, department \}\)/);
  assert.match(tab, /\{canPlan && !row\.hasPlan &&/, 'ไม่มีสิทธิ์ = ไม่โชว์ปุ่ม (ไม่ใช่ปุ่มเทา)');
  // ต้องเป็นโมดัลตัวเดิมของหน้าไซต์ ไม่ใช่ฟอร์มที่สอง
  assert.match(tab, /import ServicePlanModal from "@\/components\/service\/ServicePlanModal"/);
  assert.match(tab, /salesOrderId=\{orderId\}/);
});
