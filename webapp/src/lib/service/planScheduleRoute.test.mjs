// รอบบริการตามปฏิทิน (mig 0397) — เส้น API ตัวจริง: POST/PATCH ของรอบ · POST/PATCH ของนัด
//
// ⭐ เรียก handler **ตัวจริง** ผ่าน supabase ปลอมที่จำแถว (`crew/routeTestKit.mjs`) — ถามได้ว่า "เขียนอะไรลงตารางไหน
//    ก่อนหลังกันอย่างไร" ไม่ใช่แค่ว่าซอร์สมีคำสั่งหน้าตาแบบนี้ · ไม่มี client จริงในเทสต์นี้ (dev DB = prod DB)
// กติกาที่ยึด (แผน IMPL_PLAN_C2 §7 · คำตอบเจ้าของข้อ 4):
//   · เปลี่ยนรอบที่มีนัดตามรอบเดิมค้างอยู่ = 409 `plan_schedule_confirm` พร้อมรายการ **ยังไม่เขียนอะไร** จนกว่าจอยืนยันครบ
//   · ลำดับเขียน: ยกเลิก + ถอดออกจากรอบ → บันทึกรอบ → ย้ายช่อง → เติมนัด — ล้มครึ่งทางแล้วกดซ้ำต้องจบถูก
//   · อ่านวันหยุดไม่ได้ = 500 ก่อนเขียนอะไร (ไม่บันทึกรอบด้วยรายการวันหยุดที่เดา)
// ⚠️ "วันนี้" ตรึงที่ 1 ต.ค. 2026 10:00 เวลาไทย (นาฬิกาปลอมของ node:test) — route อ่าน businessDate() เอง
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb, callRoute, planner, tech } from './crew/routeTestKit.mjs';
import { CADENCE_ERRORS, CADENCE_TEXT } from './cadence.js';
import { businessDate } from '../businessDate.js';

mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-01T03:00:00Z') });

const { POST: postPlan } = await import('../../app/api/service/plans/route.js');
const { PATCH: patchPlan, DELETE: deletePlan } = await import('../../app/api/service/plans/[id]/route.js');
const { POST: postVisit } = await import('../../app/api/service/visits/route.js');
const { PATCH: patchVisit } = await import('../../app/api/service/visits/[id]/route.js');
const { loadPlanHolidays, planHolidayGapYears } = await import('./planGen.js');

test('นาฬิกาของเทสต์: วันนี้ (เวลาไทย) = 1 ต.ค. 2026', () => {
  assert.equal(businessDate(), '2026-10-01');
});

/* วันหยุดปี 2026 ของตาราง holidays ของจริง ณ 01/10 — ไม่มีปี 2027 สักแถว (ช่องโหว่ข้อมูลที่ต้องเตือน ไม่ใช่เดา) */
const H2026 = [
  '2026-01-01', '2026-03-03', '2026-04-06', '2026-04-13', '2026-04-14', '2026-04-15', '2026-05-01', '2026-05-04',
  '2026-05-31', '2026-06-01', '2026-06-03', '2026-07-28', '2026-07-29', '2026-07-30', '2026-08-12', '2026-10-13',
  '2026-10-23', '2026-12-07', '2026-12-10', '2026-12-31',
];
const HOLIDAY_ROWS = H2026.map((date, i) => ({ id: `HOL-${i}`, date, name: 'วันหยุด' }));
const SITE = { id: 'S1', code: 'ST-1', name: 'ไซต์ A', kind: 'customer', customerId: 'C1', isActive: true };
const SIX_NULL = { cadenceKind: null, everyDays: null, cadenceEvery: null, cadenceWeekday: null, cadenceMonthDay: null, cadenceMonthDayTo: null };
const MONTHLY22 = { ...SIX_NULL, cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 22 };
const MONTHLY15 = { ...SIX_NULL, cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 15 };
const DAYS30 = { ...SIX_NULL, cadenceKind: 'days', everyDays: 30 };
const planRow = (over = {}) => ({
  id: 'P1', siteId: 'S1', salesOrderId: null, kind: 'refill', ...MONTHLY22,
  startDate: '2026-10-22', endDate: '2027-10-21', assigneeId: null, assigneeName: null, isActive: true, note: null,
  createdAt: '2026-09-30T02:00:00.000Z', updatedAt: null, ...over,
});
const visitRow = (id, planSlotDate, scheduledDate, over = {}) => ({
  id, code: `SV-${id}`, siteId: 'S1', planId: 'P1', requestId: null, kind: 'refill', status: 'draft',
  scheduledDate, planSlotDate, startTime: null, endTime: null, assigneeId: null, assigneeName: null, assistantIds: [],
  actualDate: null, actualStartTime: null, actualEndTime: null, actualEndDate: null, unableReason: null,
  summary: null, note: null, attachments: [], customerSignatureUrl: null, ...over,
});
/* นัดที่ตัวเติมสร้างให้ "ทุก 30 วัน" จาก 22 ต.ค. (วันนี้ 1 ต.ค. · มองล่วงหน้า 90 วัน): 21 พ.ย. = เสาร์ → จันทร์ 23 */
const EVERY30_VISITS = () => [
  visitRow('V1', '2026-10-22', '2026-10-22'),
  visitRow('V2', '2026-11-21', '2026-11-23'),
  visitRow('V3', '2026-12-21', '2026-12-21'),
];
/* นัดที่ตัวเติมสร้างให้ "ทุกเดือน วันที่ 22": 22 พ.ย. = อาทิตย์ → จันทร์ 23 */
const MONTHLY22_VISITS = () => [
  visitRow('V1', '2026-10-22', '2026-10-22'),
  visitRow('V2', '2026-11-22', '2026-11-23'),
  visitRow('V3', '2026-12-22', '2026-12-22'),
];

/** ฐานปลอม + ตัวออกรหัสปลอมที่ **จำแถวที่ส่งมา** (ตัวตั้งต้นของชุดเครื่องมือตอบ `{ data: null }` และไม่จดอะไร) */
function seed({ plans = [planRow()], visits = [], holidays = HOLIDAY_ROWS, hook = null, rpcError = null } = {}) {
  const db = fakeDb({
    service_sites: [SITE], service_plans: plans, service_visits: visits, holidays,
    sales_orders: [{ id: 'SO1', orderNumber: 'SO-26100001-0' }],
  }, { hook });
  let run = 0;
  db.rpcCalls = [];
  db.rpc = async (name, args) => {
    db.rpcCalls.push({ name, args });
    if (rpcError) return { data: null, error: rpcError };
    const rows = (args.p_rows || []).map((row) => ({ ...row, code: `SV-NEW${String(run += 1).padStart(2, '0')}` }));
    (db.tables.service_visits ||= []).push(...rows.map((row) => ({ ...row })));
    return { data: rows, error: null };
  };
  return db;
}
const generatedRows = (db) => db.rpcCalls.flatMap((call) => call.args.p_rows);
const slotAt = (rows) => rows.map((v) => `${v.planSlotDate}@${v.scheduledDate}`);
const visitsOfPlan = (db, planId = 'P1') => db.tables.service_visits.filter((v) => v.planId === planId);
const visitById = (db, id) => db.tables.service_visits.find((v) => v.id === id);
const reads = (db, table) => db.calls.filter((c) => c.table === table && !c.write);
const allWrites = (db) => db.calls.filter((c) => c.write);

const create = (db, body, user = planner) => callRoute(postPlan, { user, db, method: 'POST', path: '/api/service/plans', body });
const save = (db, body, { id = 'P1', generate = true, user = planner } = {}) => callRoute(patchPlan, {
  user, db, method: 'PATCH', path: `/api/service/plans/${id}${generate ? '?generate=1' : ''}`, params: { id }, body,
});
const NEW_PLAN = { siteId: 'S1', kind: 'refill', startDate: '2026-10-22', endDate: '2027-10-21' };

// ── POST /api/service/plans ────────────────────────────────────────────────────────────────
test('POST รอบรายเดือน: แถวรอบมีความถี่ครบหกช่อง · นัดที่ส่งให้ตัวออกรหัสพกช่องของรอบ · ตอบ holidayGapYears', async () => {
  const db = seed({ plans: [] });
  const { status, json } = await create(db, { ...NEW_PLAN, ...MONTHLY22 });
  assert.equal(status, 201, json.error);
  const [insert] = db.writes('service_plans');
  assert.equal(insert.write, 'insert');
  for (const [key, want] of Object.entries(MONTHLY22)) assert.equal(insert.payload[key], want, key);
  assert.equal(json.plan.cadenceKind, 'monthly');

  assert.equal(db.rpcCalls.length, 1);
  assert.equal(db.rpcCalls[0].name, 'create_entity_rows_with_code');
  assert.deepEqual(slotAt(generatedRows(db)), ['2026-10-22@2026-10-22', '2026-11-22@2026-11-23', '2026-12-22@2026-12-22']);
  assert.ok(generatedRows(db).every((row) => row.planId === json.plan.id && row.siteId === 'S1' && row.status));
  assert.equal(json.generated.length, 3);
  assert.deepEqual(json.holidayGapYears, [2027], 'รอบถึง ต.ค. 2027 แต่ตารางวันหยุดมีถึงปี 2026');
  assert.equal(reads(db, 'holidays').length, 1, 'อ่านวันหยุดครั้งเดียวต่อคำขอ แล้วส่งลงไปให้ตัวเติมนัด');
  assert.ok(db.calls.findIndex((c) => c.table === 'holidays') < db.calls.findIndex((c) => c.table === 'service_plans' && c.write),
    'อ่านวันหยุดก่อนเขียนรอบ');

  const audits = db.tables.audit_logs.map((row) => row.summary);
  assert.ok(audits.some((s) => s === 'สร้างรอบบริการทุกเดือน วันที่ 22 ที่ ไซต์ A · gen นัด 3 ครั้ง'), audits.join(' | '));
  assert.ok(audits.some((s) => /gen นัดตามรอบ 3 ครั้ง \(ล่วงหน้า 90 วัน\)/.test(s)));
});

test('POST รอบทุก 3 เดือน: ระยะเติมนัดเป็นของรอบ (100 วัน) นับจากวันเริ่มรอบที่ยังมาไม่ถึง — บรรทัด audit บอกเลขจริง', async () => {
  const db = seed({ plans: [] });
  const { status, json } = await create(db, { ...NEW_PLAN, ...MONTHLY22, cadenceEvery: 3 });
  assert.equal(status, 201, json.error);
  // รอบเริ่ม 22 ต.ค. (ยังไม่เริ่ม) ⇒ ช่วงเติมนัดถึง 22 ต.ค. + 100 วัน = 30 ม.ค. 2027 — เห็นช่อง 22 ม.ค. ด้วย
  assert.deepEqual(slotAt(generatedRows(db)), ['2026-10-22@2026-10-22', '2027-01-22@2027-01-22']);
  assert.ok(db.tables.audit_logs.some((row) => /ล่วงหน้า 100 วัน/.test(row.summary)));
});

test('🔴 POST รอบตามปฏิทินที่เริ่มไกลกว่าระยะเติมนัด: ได้นัดแรกทันที (เดิมได้ศูนย์ใบ ทั้งที่โมดัลโชว์ "นัดถัดไป" สามวัน)', async () => {
  const db = seed({ plans: [] });
  const future = { ...NEW_PLAN, startDate: '2027-01-15', endDate: '2028-01-14' };
  const { status, json } = await create(db, { ...future, ...SIX_NULL, cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 15 });
  assert.equal(status, 201, json.error);
  assert.deepEqual(slotAt(generatedRows(db)),
    ['2027-01-15@2027-01-15', '2027-02-15@2027-02-15', '2027-03-15@2027-03-15', '2027-04-15@2027-04-15']);
  // ทุก N วัน: พฤติกรรมเดิม (90 วันนับจากวันนี้) — ยังไม่มีนัด
  const daysDb = seed({ plans: [] });
  const days = await create(daysDb, { ...future, ...DAYS30 });
  assert.equal(days.status, 201, days.json.error);
  assert.deepEqual(days.json.generated, []);
});

test('POST จากลูกข่ายรุ่นก่อน 0397 (ส่งแค่ everyDays) = รอบชนิด days เหมือนเดิม · รอบที่จบในปีที่มีวันหยุดครบ = ไม่มีคำเตือน', async () => {
  const db = seed({ plans: [] });
  const { status, json } = await create(db, { ...NEW_PLAN, endDate: '2026-12-31', everyDays: 30 });
  assert.equal(status, 201, json.error);
  const [insert] = db.writes('service_plans');
  assert.deepEqual(
    [insert.payload.cadenceKind, insert.payload.everyDays, insert.payload.cadenceEvery, insert.payload.cadenceMonthDay],
    ['days', 30, null, null],
  );
  assert.deepEqual(slotAt(generatedRows(db)), ['2026-10-22@2026-10-22', '2026-11-21@2026-11-23', '2026-12-21@2026-12-21']);
  assert.deepEqual(json.holidayGapYears, []);
  assert.ok(db.tables.audit_logs.some((row) => row.summary === 'สร้างรอบบริการทุก 30 วัน ที่ ไซต์ A · gen นัด 3 ครั้ง'));
});

test('🔴 POST: อ่านตารางวันหยุดไม่ได้ = 500 ก่อนเขียนอะไร — ไม่ทิ้งรอบที่ไม่มีนัดไว้ในฐาน', async () => {
  const db = seed({ plans: [], hook: (q) => (q.table === 'holidays' ? { data: null, error: { message: 'connection reset' } } : undefined) });
  const { status, json } = await create(db, { ...NEW_PLAN, ...MONTHLY22 });
  assert.equal(status, 500);
  assert.equal(json.error, CADENCE_TEXT.holidayReadFailed);
  assert.deepEqual(allWrites(db), [], 'ต้องไม่มีการเขียนตารางไหนเลย');
  assert.equal(db.rpcCalls.length, 0);
});

test('POST: ตารางวันหยุดว่าง (ยังไม่ได้ตั้ง) = ใช้รายการตั้งต้น ไม่ใช่ล้ม · วันหยุดจากตารางถูกใช้จริงตอนเติมนัด', async () => {
  const empty = seed({ plans: [], holidays: [] });
  const first = await create(empty, { ...NEW_PLAN, ...SIX_NULL, cadenceKind: 'weekly', cadenceEvery: 1, cadenceWeekday: 5 });
  assert.equal(first.status, 201, first.json.error);
  // ศุกร์ 23 ต.ค. (วันปิยมหาราช — อยู่ในรายการตั้งต้น) → พฤหัสฯ 22
  assert.equal(generatedRows(empty)[0].scheduledDate, '2026-10-22');

  // ตารางมีวันหยุดที่รายการตั้งต้นไม่มี: พฤหัสฯ 22 ต.ค. ⇒ รอบรายเดือนวันที่ 22 ต้องหนีไปศุกร์... ซึ่งหยุดด้วย → จันทร์ 26
  const custom = seed({ plans: [], holidays: [...HOLIDAY_ROWS, { id: 'HOL-X', date: '2026-10-22', name: 'หยุดพิเศษ' }] });
  const second = await create(custom, { ...NEW_PLAN, ...MONTHLY22 });
  assert.equal(second.status, 201, second.json.error);
  assert.equal(generatedRows(custom)[0].planSlotDate, '2026-10-22');
  assert.equal(generatedRows(custom)[0].scheduledDate, '2026-10-26', 'วันหยุดที่เจ้าของคีย์ในตารางต้องถูกใช้ ไม่ใช่รายการ hardcode');
});

test('POST: ความถี่ผิด = 400 ข้อความของตัวตรวจตัวเดียว · ไม่มีสิทธิ์ = 403 · ไม่เขียนอะไร', async () => {
  const db = seed({ plans: [] });
  const weekend = await create(db, { ...NEW_PLAN, ...SIX_NULL, cadenceKind: 'weekly', cadenceEvery: 1, cadenceWeekday: 0 });
  assert.deepEqual([weekend.status, weekend.json.error], [400, CADENCE_ERRORS.weekend]);
  const none = await create(db, NEW_PLAN);
  assert.deepEqual([none.status, none.json.error], [400, CADENCE_ERRORS.kind]);
  const crew = await create(db, { ...NEW_PLAN, ...MONTHLY22 }, tech);
  assert.equal(crew.status, 403);
  assert.deepEqual(allWrites(db), []);
});

// ── PATCH /api/service/plans/[id] ──────────────────────────────────────────────────────────
test('🔴 PATCH เปลี่ยนรอบโดยยังไม่ยืนยัน = 409 พร้อมรายการ และ **ไม่เขียนอะไรเลย**', async () => {
  const db = seed({ plans: [planRow(DAYS30)], visits: EVERY30_VISITS() });
  const { status, json } = await save(db, MONTHLY22);
  assert.equal(status, 409);
  assert.equal(json.code, 'plan_schedule_confirm');
  assert.equal(json.stale, false);
  assert.equal(json.error, CADENCE_TEXT.confirm.needConfirm(1));
  assert.deepEqual(json.preview, {
    fromText: 'ทุก 30 วัน',
    toText: 'ทุกเดือน วันที่ 22',
    cancel: [{ id: 'V3', code: 'SV-V3', scheduledDate: '2026-12-21', planSlotDate: '2026-12-21', status: 'draft', assigneeName: null }],
    keptMoved: 0, keptStarted: 0, keptPast: 0, keptManual: 0, reslot: 1,
  });
  assert.deepEqual(allWrites(db), [], 'ไม่มีการเขียนตารางไหนเลย — ทั้งรอบ นัด เธรด audit');
  assert.equal(db.rpcCalls.length, 0);
  assert.equal(db.tables.service_plans[0].cadenceKind, 'days');
});

test('🔴 PATCH ยืนยันไม่ครบ = 409 stale พร้อมรายการล่าสุด · ไม่เขียนอะไร', async () => {
  const db = seed({ plans: [planRow()], visits: MONTHLY22_VISITS() });
  const first = await save(db, MONTHLY15);
  assert.equal(first.status, 409);
  assert.deepEqual(first.json.preview.cancel.map((v) => v.id), ['V1', 'V2', 'V3']);
  assert.equal(first.json.error, CADENCE_TEXT.confirm.needConfirm(3));

  const partial = await save(db, { ...MONTHLY15, cancelVisitIds: ['V1', 'V2'] });
  assert.equal(partial.status, 409);
  assert.equal(partial.json.stale, true);
  assert.equal(partial.json.error, CADENCE_TEXT.confirm.stale);
  assert.deepEqual(partial.json.preview.cancel.map((v) => v.id), ['V1', 'V2', 'V3']);
  assert.deepEqual(allWrites(db), []);
});

test('⭐ PATCH ยืนยันครบ: ยกเลิก + ถอดออกจากรอบ → บันทึกรอบ → ย้ายช่อง → เติมนัด · เธรด + audit · รูปคำตอบ', async () => {
  const db = seed({ plans: [planRow(DAYS30)], visits: EVERY30_VISITS() });
  const { status, json } = await save(db, { ...MONTHLY22, cancelVisitIds: ['V3'] });
  assert.equal(status, 200, json.error);

  // นัดที่ถูกยกเลิก: สถานะยกเลิก + ไม่อยู่ในรอบ + ไม่ถือช่อง
  const v3 = visitById(db, 'V3');
  assert.deepEqual([v3.status, v3.planId, v3.planSlotDate], ['cancelled', null, null]);
  // นัดที่วันตรงกับรอบใหม่: เก็บไว้ ย้ายแค่ช่อง
  const v2 = visitById(db, 'V2');
  assert.deepEqual([v2.status, v2.planId, v2.planSlotDate, v2.scheduledDate], ['draft', 'P1', '2026-11-22', '2026-11-23']);
  // นัดแรกไม่ถูกแตะ
  assert.deepEqual([visitById(db, 'V1').planSlotDate, visitById(db, 'V1').status], ['2026-10-22', 'draft']);
  // เติมนัด: ได้เพิ่มใบเดียว (22 ธ.ค.)
  assert.deepEqual(slotAt(generatedRows(db)), ['2026-12-22@2026-12-22']);
  assert.deepEqual(slotAt(visitsOfPlan(db).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))),
    ['2026-10-22@2026-10-22', '2026-11-22@2026-11-23', '2026-12-22@2026-12-22']);

  // ลำดับเขียน
  const order = allWrites(db)
    .filter((c) => ['service_visits', 'service_plans'].includes(c.table))
    .map((c) => `${c.table}:${c.payload.status === 'cancelled' ? 'cancel' : c.table === 'service_plans' ? 'save' : 'reslot'}`);
  assert.deepEqual(order, ['service_visits:cancel', 'service_plans:save', 'service_visits:reslot']);
  const cancelWrite = db.writes('service_visits')[0];
  assert.deepEqual(cancelWrite.filters, [['in', 'id', ['V3']], ['eq', 'planId', 'P1'], ['in', 'status', ['draft', 'scheduled']]]);
  assert.deepEqual(Object.keys(cancelWrite.payload).sort(), ['planId', 'planSlotDate', 'status', 'updatedAt']);
  const reslotWrite = db.writes('service_visits')[1];
  assert.deepEqual(reslotWrite.filters, [['eq', 'id', 'V2'], ['eq', 'planId', 'P1']]);
  assert.deepEqual(Object.keys(reslotWrite.payload).sort(), ['planSlotDate', 'updatedAt']);
  // แถวรอบ: ครบหกช่อง ไม่เหลือ everyDays ของรอบเดิม
  const planWrite = db.writes('service_plans')[0];
  assert.deepEqual([planWrite.payload.cadenceKind, planWrite.payload.everyDays, planWrite.payload.cadenceMonthDay], ['monthly', null, 22]);
  assert.equal('cancelVisitIds' in planWrite.payload, false);

  // เธรดของนัดที่ถูกยกเลิก + audit
  const thread = db.tables.entity_updates.filter((row) => row.entityId === 'V3');
  assert.equal(thread.length, 1);
  assert.deepEqual([thread[0].entityType, thread[0].kind, thread[0].body],
    ['service_visit', 'cancel', CADENCE_TEXT.confirm.threadBody('ทุก 30 วัน', 'ทุกเดือน วันที่ 22')]);
  const visitAudit = db.tables.audit_logs.find((row) => row.entityId === 'V3');
  assert.equal(visitAudit.summary, 'ยกเลิกนัดตามรอบเดิม SV-V3 · 2026-12-21 · ถอดออกจากรอบ');
  assert.deepEqual([visitAudit.before.planId, visitAudit.before.status, visitAudit.after.planId], ['P1', 'draft', null]);
  assert.ok(db.tables.audit_logs.some((row) => row.entityId === 'V2' && /คงนัด SV-V2/.test(row.summary)));
  // รอยของรอบ: เขียนทันทีหลังบันทึกรอบ (ก่อนย้ายช่อง/เติมนัด) พร้อมค่าเดิม — จำนวนนัดที่คงไว้/เติมอยู่ในรอยรายนัดกับรอยของตัวเติมนัด
  const planAudits = db.tables.audit_logs.filter((row) => row.entityType === 'service_plan');
  assert.equal(planAudits.length, 1);
  const planAudit = planAudits[0];
  assert.equal(planAudit.summary, 'แก้รอบบริการทุกเดือน วันที่ 22 (เดิม ทุก 30 วัน) · ยกเลิกนัดตามรอบเดิม 1 นัด');
  assert.deepEqual([planAudit.before.cadenceKind, planAudit.before.everyDays, planAudit.after.cadenceKind, planAudit.after.cadenceMonthDay],
    ['days', 30, 'monthly', 22]);
  const auditAt = (match) => db.tables.audit_logs.findIndex(match);
  assert.ok(auditAt((row) => row.entityId === 'V3') < auditAt((row) => row === planAudit), 'ยกเลิกนัดก่อนบันทึกรอบ');
  assert.ok(auditAt((row) => row === planAudit) < auditAt((row) => row.entityId === 'V2'), 'รอยของรอบมาก่อนย้ายช่อง');
  assert.ok(db.tables.audit_logs.some((row) => /gen นัดตามรอบ 1 ครั้ง/.test(row.summary)), 'จำนวนที่เติมอยู่ในรอยของตัวเติมนัด');

  assert.equal(reads(db, 'holidays').length, 1, 'อ่านวันหยุดครั้งเดียวต่อคำขอ — ชุดเดียวกันทั้งตัวตัดสินและตัวเติมนัด');

  // รูปคำตอบ
  assert.deepEqual(Object.keys(json).sort(), ['cancelled', 'generated', 'holidayGapYears', 'kept', 'offDayVisits', 'plan', 'reslotted']);
  assert.deepEqual(json.cancelled, [{ id: 'V3', code: 'SV-V3', scheduledDate: '2026-12-21' }]);
  assert.equal(json.reslotted, 1);
  assert.deepEqual(json.kept, { moved: 0, started: 0, past: 0, manual: 0 });
  assert.deepEqual(json.offDayVisits, []);
  assert.equal(json.generated.length, 1);
  assert.deepEqual(json.holidayGapYears, [2027]);
  assert.equal(json.plan.cadenceKind, 'monthly');

  // บันทึกซ้ำ: ไม่ถาม ไม่ยกเลิก ไม่สร้างนัดเพิ่ม
  const before = db.tables.service_visits.length;
  const again = await save(db, MONTHLY22);
  assert.equal(again.status, 200, again.json.error);
  assert.deepEqual([again.json.cancelled, again.json.reslotted, again.json.generated], [[], 0, []]);
  assert.equal(db.tables.service_visits.length, before);
});

test('PATCH ยืนยันมาเกิน (นัดที่ไม่อยู่ในรายการแล้ว) = ผ่าน · นัดนอกรายการไม่ถูกแตะ', async () => {
  const db = seed({ plans: [planRow(DAYS30)], visits: [...EVERY30_VISITS(), visitRow('X1', '2026-12-21', '2026-12-21', { planId: 'P2' })] });
  const { status, json } = await save(db, { ...MONTHLY22, cancelVisitIds: ['V3', 'V1', 'X1', 'V-GONE'] });
  assert.equal(status, 200, json.error);
  assert.deepEqual(json.cancelled.map((v) => v.id), ['V3']);
  assert.equal(visitById(db, 'V1').status, 'draft', 'นัดตามรอบใหม่ที่ถูกยืนยันมาเกิน ไม่ถูกยกเลิก');
  assert.deepEqual([visitById(db, 'X1').status, visitById(db, 'X1').planId], ['draft', 'P2'], 'นัดของรอบอื่น');
});

test('🔴 R5-h ผ่าน API: วันที่ 22 → 15 → 22 รอบยังมีนัดเปิดครบสามเดือน (นัดที่ยกเลิกเพราะเปลี่ยนรอบไม่ถือช่อง)', async () => {
  const db = seed({ plans: [planRow()], visits: MONTHLY22_VISITS() });
  const openSlots = () => slotAt(visitsOfPlan(db).filter((v) => v.status !== 'cancelled')
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)));

  const to15 = await save(db, { ...MONTHLY15, cancelVisitIds: ['V1', 'V2', 'V3'] });
  assert.equal(to15.status, 200, to15.json.error);
  assert.equal(to15.json.cancelled.length, 3);
  // รอบยังไม่เริ่ม (22 ต.ค.) ⇒ ระยะเติมนัดนับจากวันเริ่มรอบ: ถึง 20 ม.ค. 2027
  assert.deepEqual(openSlots(), ['2026-11-15@2026-11-16', '2026-12-15@2026-12-15', '2027-01-15@2027-01-15']);

  const ask = await save(db, MONTHLY22);
  assert.equal(ask.status, 409);
  const back = await save(db, { ...MONTHLY22, cancelVisitIds: ask.json.preview.cancel.map((v) => v.id) });
  assert.equal(back.status, 200, back.json.error);
  assert.equal(back.json.cancelled.length, 3);
  assert.deepEqual(openSlots(), ['2026-10-22@2026-10-22', '2026-11-22@2026-11-23', '2026-12-22@2026-12-22']);
  // นัดที่ถูกยกเลิกทั้งหกใบยังอยู่ในฐาน (ประวัติของไซต์) ในฐานะนัดยกเลิกนอกรอบ
  const released = db.tables.service_visits.filter((v) => v.status === 'cancelled');
  assert.equal(released.length, 6);
  assert.ok(released.every((v) => v.planId === null && v.planSlotDate === null && v.siteId === 'S1'));
});

test('PATCH ที่ตารางของรอบไม่เปลี่ยน (แก้เจ้าหน้าที่/หมายเหตุ) = ไม่ถาม ไม่เขียนนัด · นัดที่คนย้ายวันบนรอบเดิมไม่ถูกแตะ', async () => {
  const visits = MONTHLY22_VISITS();
  visits[1].scheduledDate = '2026-11-27';                     // ผู้จัดคิวย้ายวันเอง
  const db = seed({ plans: [planRow()], visits });
  const { status, json } = await save(db, { assigneeId: 'U-TECH', assigneeName: 'ช่างเอ', note: 'เข้าหลังบ่ายโมง' });
  assert.equal(status, 200, json.error);
  assert.deepEqual(db.writes('service_visits'), []);
  assert.equal(db.rpcCalls.length, 0, 'ทุกช่องมีนัดแล้ว — ไม่สร้างซ้ำที่ 23 พ.ย.');
  assert.deepEqual([json.cancelled, json.reslotted, json.generated, json.kept], [[], 0, [], { moved: 0, started: 0, past: 0, manual: 0 }]);
  assert.equal(json.plan.assigneeId, 'U-TECH');
  assert.equal(db.tables.audit_logs.find((row) => row.entityType === 'service_plan').summary, 'แก้รอบบริการทุกเดือน วันที่ 22');
});

test('PATCH เปลี่ยนรอบ: นัดที่คนย้ายวันเอง · กำลังทำ · เลยวันนัด ถูกนับใน kept ไม่อยู่ในรายการยกเลิก', async () => {
  const visits = [
    visitRow('V0', '2026-09-22', '2026-09-22', { status: 'scheduled' }),      // เลยวันนัดแล้ว (วันนี้ 1 ต.ค.)
    visitRow('V1', '2026-10-22', '2026-10-22', { status: 'in_progress' }),
    visitRow('V2', '2026-11-22', '2026-11-27'),                               // ย้ายเอง
    visitRow('V3', '2026-12-22', '2026-12-22'),
  ];
  const db = seed({ plans: [planRow({ startDate: '2026-09-22' })], visits });
  const ask = await save(db, MONTHLY15);
  assert.equal(ask.status, 409);
  assert.deepEqual(ask.json.preview.cancel.map((v) => v.id), ['V3']);
  assert.deepEqual([ask.json.preview.keptMoved, ask.json.preview.keptStarted, ask.json.preview.keptPast], [1, 1, 1]);
  const done = await save(db, { ...MONTHLY15, cancelVisitIds: ['V3'] });
  assert.equal(done.status, 200, done.json.error);
  assert.deepEqual(done.json.kept, { moved: 1, started: 1, past: 1, manual: 0 });
  assert.deepEqual(['V0', 'V1', 'V2'].map((id) => visitById(db, id).status), ['scheduled', 'in_progress', 'draft']);
  assert.deepEqual(['V0', 'V1', 'V2'].map((id) => visitById(db, id).planId), ['P1', 'P1', 'P1']);
  assert.deepEqual(['V0', 'V1', 'V2'].map((id) => visitById(db, id).scheduledDate), ['2026-09-22', '2026-10-22', '2026-11-27'], 'วันนัดไม่ถูกแตะ');
  /* นัดที่อยู่ต่อไม่ถือช่องของรอบเดิมค้าง: ใบที่อยู่ในงวดของช่องใหม่ถือช่องนั้น (ต.ค. · พ.ย.) ใบที่งวดจบไปแล้วถูกล้างช่อง (ก.ย.)
     ⇒ ตัวเติมนัดไม่สร้างใบที่สองลง ต.ค./พ.ย. — ได้เพิ่มเฉพาะช่องที่ถูกยกเลิก (15 ธ.ค.) กับช่องถัดไปในระยะ */
  assert.deepEqual(['V0', 'V1', 'V2'].map((id) => visitById(db, id).planSlotDate), [null, '2026-10-15', '2026-11-15']);
  assert.deepEqual(slotAt(generatedRows(db)), ['2026-12-15@2026-12-15']);
  assert.equal(done.json.reslotted, 0, 'นัดที่ไม่ถูกแตะไม่นับเป็น "คงนัดเดิมไว้ตามรอบใหม่" — อยู่ในบรรทัด kept');
});

test('🔴 PATCH: "ย้ายวันเอง" ตัดสินจากรอบ **ก่อนแก้** — นัดสิ้นเดือนที่ระบบถอยให้เอง ไม่ถูกนับเป็นนัดที่คนย้าย', async () => {
  const MONTH_END = { ...SIX_NULL, cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 31 };
  const visits = [
    visitRow('V1', '2026-10-31', '2026-10-30'),               // เสาร์ 31 → ศุกร์ 30
    visitRow('V2', '2026-11-30', '2026-11-30'),
    visitRow('V3', '2026-12-31', '2026-12-30'),               // 31 ธ.ค. หยุด → 30
  ];
  const db = seed({ plans: [planRow(MONTH_END)], visits });
  const ask = await save(db, DAYS30);
  assert.equal(ask.status, 409);
  assert.deepEqual(ask.json.preview.cancel.map((v) => v.id), ['V1', 'V2', 'V3']);
  assert.equal(ask.json.preview.keptMoved, 0);
  assert.deepEqual([ask.json.preview.fromText, ask.json.preview.toText], ['ทุกเดือน สิ้นเดือน', 'ทุก 30 วัน']);
});

test('PATCH: นัดที่ถูกถอดออกจากรอบไประหว่างคำขอ ไม่ถูกนับว่าย้ายช่อง (คำสั่งผูก planId ไว้)', async () => {
  const db = seed({
    plans: [planRow(DAYS30)], visits: EVERY30_VISITS(),
    hook: (q, api) => {
      // มีคนถอด V2 ออกจากรอบ ระหว่างที่คำขอนี้บันทึกรอบ
      if (q.table === 'service_plans' && q.write === 'update') api.tables.service_visits.find((v) => v.id === 'V2').planId = null;
      return undefined;
    },
  });
  const { status, json } = await save(db, { ...MONTHLY22, cancelVisitIds: ['V3'] });
  assert.equal(status, 200, json.error);
  assert.equal(json.reslotted, 0);
  assert.equal(visitById(db, 'V2').planSlotDate, '2026-11-21', 'ไม่ใช่นัดของรอบนี้แล้ว — ไม่เขียนช่องของรอบนี้ลงไป');
  assert.equal(db.tables.audit_logs.some((row) => row.entityId === 'V2'), false);
  // ช่อง 22 พ.ย. ของรอบจึงยังว่าง ⇒ ตัวเติมสร้างนัดให้
  assert.deepEqual(slotAt(generatedRows(db)), ['2026-11-22@2026-11-23', '2026-12-22@2026-12-22']);
});

test('🔴 PATCH: นัดที่ช่างเริ่มงานไปหลังจอเปิดรายการ ไม่ถูกยกเลิก และถูกนับใน kept.started', async () => {
  const db = seed({ plans: [planRow(DAYS30)], visits: EVERY30_VISITS() });
  const ask = await save(db, MONTHLY22);
  assert.deepEqual(ask.json.preview.cancel.map((v) => v.id), ['V3']);
  visitById(db, 'V3').status = 'in_progress';                 // ระหว่างที่โมดัลยืนยันเปิดอยู่
  const done = await save(db, { ...MONTHLY22, cancelVisitIds: ['V3'] });
  assert.equal(done.status, 200, done.json.error);
  assert.deepEqual(done.json.cancelled, []);
  assert.deepEqual(done.json.kept, { moved: 0, started: 1, past: 0, manual: 0 });
  assert.deepEqual([visitById(db, 'V3').status, visitById(db, 'V3').planId], ['in_progress', 'P1']);
  // นัดที่กำลังทำคือ "นัดของเดือน ธ.ค." — ถือช่อง 22 ธ.ค. ของรอบใหม่ ตัวเติมนัดไม่สร้างใบที่สอง
  assert.equal(visitById(db, 'V3').planSlotDate, '2026-12-22');
  assert.deepEqual(done.json.generated, []);
});

test('PATCH ปิดรอบ: ไม่อ่านวันหยุด ไม่อ่านนัด ไม่แตะนัด ไม่เติมนัด — แม้ความถี่เปลี่ยนในคำขอเดียวกัน', async () => {
  const db = seed({
    plans: [planRow()], visits: MONTHLY22_VISITS(),
    hook: (q) => (q.table === 'holidays' ? { data: null, error: { message: 'ต้องไม่ถูกอ่าน' } } : undefined),
  });
  const { status, json } = await save(db, { ...MONTHLY15, isActive: false });
  assert.equal(status, 200, json.error);
  assert.equal(json.plan.isActive, false);
  assert.deepEqual(reads(db, 'holidays'), []);
  assert.deepEqual(db.calls.filter((c) => c.table === 'service_visits'), []);
  assert.equal(db.rpcCalls.length, 0);
  assert.deepEqual([json.cancelled, json.reslotted, json.generated, json.holidayGapYears], [[], 0, [], []]);
  assert.deepEqual(MONTHLY22_VISITS().map((v) => visitById(db, v.id).planId), ['P1', 'P1', 'P1']);
});

test('🔴 PATCH จากแท็บรุ่นก่อน 0397: รอบ days = บันทึกเป็น days ตามเดิม · รอบตามปฏิทิน = 400 ไม่เขียนอะไร', async () => {
  const daysDb = seed({ plans: [planRow(DAYS30)] });
  const ok = await save(daysDb, { everyDays: 45, assigneeId: 'U-TECH' });
  assert.equal(ok.status, 200, ok.json.error);
  const [write] = daysDb.writes('service_plans');
  assert.deepEqual([write.payload.cadenceKind, write.payload.everyDays, write.payload.cadenceEvery], ['days', 45, null]);

  const calendarDb = seed({ plans: [planRow()], visits: MONTHLY22_VISITS() });
  const stale = await save(calendarDb, { everyDays: 30, assigneeId: 'U-TECH' });
  assert.deepEqual([stale.status, stale.json.error], [400, CADENCE_ERRORS.staleClient]);
  assert.deepEqual(allWrites(calendarDb), []);
  assert.equal(calendarDb.tables.service_plans[0].cadenceKind, 'monthly');
});

test('🔴 PATCH: อ่านวันหยุดไม่ได้ = 500 ก่อนเขียนอะไร (ไม่ตัดสิน "ย้ายวันเอง" ด้วยรายการวันหยุดที่เดา)', async () => {
  const db = seed({
    plans: [planRow(DAYS30)], visits: EVERY30_VISITS(),
    hook: (q) => (q.table === 'holidays' ? { data: null, error: { message: 'timeout' } } : undefined),
  });
  const { status, json } = await save(db, { ...MONTHLY22, cancelVisitIds: ['V3'] });
  assert.deepEqual([status, json.error], [500, CADENCE_TEXT.holidayReadFailed]);
  assert.deepEqual(allWrites(db), []);
});

test('🔴 PATCH: ยกเลิกนัดล้ม = 500 รอบยังไม่ถูกบันทึก · กดบันทึกอีกครั้งด้วยคำขอเดิมสำเร็จ', async () => {
  let failed = false;
  const db = seed({
    plans: [planRow()], visits: MONTHLY22_VISITS(),
    hook: (q) => {
      if (!failed && q.table === 'service_visits' && q.write === 'update' && q.payload.status === 'cancelled') {
        failed = true;
        return { data: null, error: { message: 'deadlock detected' } };
      }
      return undefined;
    },
  });
  const body = { ...MONTHLY15, cancelVisitIds: ['V1', 'V2', 'V3'] };
  const first = await save(db, body);
  assert.equal(first.status, 500);
  assert.ok(first.json.error.startsWith(CADENCE_TEXT.confirm.cancelFailed), first.json.error);
  assert.match(first.json.error, /deadlock detected/);
  assert.deepEqual(db.writes('service_plans'), [], 'รอบต้องยังไม่ถูกบันทึก');
  assert.equal(db.tables.service_plans[0].cadenceMonthDay, 22);
  assert.equal(db.rpcCalls.length, 0);

  const retry = await save(db, body);
  assert.equal(retry.status, 200, retry.json.error);
  assert.equal(retry.json.cancelled.length, 3);
  assert.equal(db.tables.service_plans[0].cadenceMonthDay, 15);
  assert.deepEqual(slotAt(visitsOfPlan(db).filter((v) => v.status !== 'cancelled')),
    ['2026-11-15@2026-11-16', '2026-12-15@2026-12-15', '2027-01-15@2027-01-15']);
});

test('🔴 PATCH: บันทึกรอบล้มหลังยกเลิกนัดไปแล้ว = 500 บอกจำนวนที่ยกเลิก · กดอีกครั้ง (ไม่มีอะไรเหลือให้ยกเลิก) สำเร็จ', async () => {
  let failed = false;
  const db = seed({
    plans: [planRow(DAYS30)], visits: EVERY30_VISITS(),
    hook: (q) => {
      if (!failed && q.table === 'service_plans' && q.write === 'update') {
        failed = true;
        return { data: null, error: { message: 'violates check constraint "service_plans_cadence_shape"' } };
      }
      return undefined;
    },
  });
  const body = { ...MONTHLY22, cancelVisitIds: ['V3'] };
  const first = await save(db, body);
  assert.equal(first.status, 500);
  assert.ok(first.json.error.startsWith(CADENCE_TEXT.confirm.saveFailed(1)), first.json.error);
  assert.match(first.json.error, /service_plans_cadence_shape/);
  assert.equal(visitById(db, 'V3').status, 'cancelled');
  assert.equal(db.tables.service_plans[0].cadenceKind, 'days', 'รอบยังเป็นของเดิม');
  assert.equal(visitById(db, 'V2').planSlotDate, '2026-11-21', 'ยังไม่ย้ายช่อง (อยู่หลังบันทึกรอบ)');

  const retry = await save(db, body);
  assert.equal(retry.status, 200, retry.json.error);
  assert.deepEqual([retry.json.cancelled, retry.json.reslotted, retry.json.generated.length], [[], 1, 1]);
  assert.deepEqual(slotAt(visitsOfPlan(db).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))),
    ['2026-10-22@2026-10-22', '2026-11-22@2026-11-23', '2026-12-22@2026-12-22']);

  // รอบที่ไม่ได้ยกเลิกอะไร แล้วบันทึกล้ม = ข้อความของฐานตามเดิม
  const plain = seed({ plans: [planRow()], hook: (q) => (q.table === 'service_plans' && q.write === 'update' ? { data: null, error: { message: 'boom' } } : undefined) });
  const out = await save(plain, { note: 'x' });
  assert.deepEqual([out.status, out.json.error], [500, 'boom']);
});

test('PATCH: ย้ายช่องล้ม / เติมนัดล้ม = 500 "บันทึกรอบแล้ว…" · รอบถูกบันทึกแล้ว · กดอีกครั้งทำส่วนที่ขาด', async () => {
  let failed = false;
  const db = seed({
    plans: [planRow(DAYS30)], visits: EVERY30_VISITS(),
    hook: (q) => {
      if (!failed && q.table === 'service_visits' && q.write === 'update' && 'planSlotDate' in q.payload && !('status' in q.payload)) {
        failed = true;
        return { data: null, error: { message: 'timeout' } };
      }
      return undefined;
    },
  });
  const body = { ...MONTHLY22, cancelVisitIds: ['V3'] };
  const first = await save(db, body);
  assert.equal(first.status, 500);
  assert.ok(first.json.error.startsWith(CADENCE_TEXT.confirm.afterSaveFailed), first.json.error);
  assert.equal(db.tables.service_plans[0].cadenceKind, 'monthly', 'รอบถูกบันทึกแล้ว');
  assert.equal(db.rpcCalls.length, 0, 'ยังไม่เติมนัด — ไม่งั้นได้นัดใบที่สองลงวันเดียวกับนัดที่ยังไม่ได้ย้ายช่อง');
  /* 🔴 รอยของการแก้รอบต้องอยู่ครบแม้ขั้นหลังล้ม — ค่าเดิม (ทุก 30 วัน) + จำนวนนัดที่ยกเลิก
     (เดิมรอยอยู่ท้ายสุด ⇒ ครั้งที่ล้มไม่มีรอยของรอบ และครั้งที่กดซ้ำบันทึก before = after) */
  const planAudits = () => db.tables.audit_logs.filter((row) => row.entityType === 'service_plan');
  assert.equal(planAudits().length, 1);
  assert.equal(planAudits()[0].summary, 'แก้รอบบริการทุกเดือน วันที่ 22 (เดิม ทุก 30 วัน) · ยกเลิกนัดตามรอบเดิม 1 นัด');
  assert.deepEqual([planAudits()[0].before.cadenceKind, planAudits()[0].before.everyDays, planAudits()[0].after.cadenceKind], ['days', 30, 'monthly']);
  const retry = await save(db, body);
  assert.equal(retry.status, 200, retry.json.error);
  assert.equal(retry.json.reslotted, 1);
  assert.deepEqual(retry.json.cancelled, [], 'กดซ้ำ: นัดที่ช่องยังเป็นของรอบเก่าไม่ถูกเสนอยกเลิก — แค่ย้ายช่องที่ค้าง');
  assert.deepEqual(planAudits().map((row) => row.summary),
    ['แก้รอบบริการทุกเดือน วันที่ 22 (เดิม ทุก 30 วัน) · ยกเลิกนัดตามรอบเดิม 1 นัด', 'แก้รอบบริการทุกเดือน วันที่ 22']);
  assert.deepEqual(slotAt(visitsOfPlan(db).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))),
    ['2026-10-22@2026-10-22', '2026-11-22@2026-11-23', '2026-12-22@2026-12-22']);

  // ตัวออกรหัสล้มตอนเติมนัด
  const genFail = seed({ plans: [planRow()], rpcError: { message: 'counter locked' } });
  const out = await save(genFail, { note: 'x' });
  assert.equal(out.status, 500);
  assert.ok(out.json.error.startsWith(CADENCE_TEXT.confirm.afterSaveFailed), out.json.error);
  assert.match(out.json.error, /counter locked/);
  assert.equal(genFail.tables.service_plans[0].note, 'x');
});

test('PATCH ไม่ส่ง ?generate=1 = ไม่เติมนัด (แต่ยังถาม/ยกเลิกนัดตามรอบเดิมตามปกติ)', async () => {
  const db = seed({ plans: [planRow(DAYS30)], visits: EVERY30_VISITS() });
  const ask = await save(db, MONTHLY22, { generate: false });
  assert.equal(ask.status, 409);
  const done = await save(db, { ...MONTHLY22, cancelVisitIds: ['V3'] }, { generate: false });
  assert.equal(done.status, 200, done.json.error);
  assert.equal(db.rpcCalls.length, 0);
  assert.deepEqual([done.json.cancelled.length, done.json.reslotted, done.json.generated], [1, 1, []]);
});

// ── รีวิว 01/10: หนึ่งงวดหนึ่งนัดตอนเปลี่ยนรอบ · นัดที่คนย้าย/ตั้งเอง · วันที่ไม่มีจริง · วันหยุดที่คีย์ทีหลัง ───────────
/** ขยับ "วันนี้" ของเทสต์ (นาฬิกาไทย) ชั่วคราว — คืนที่ 1 ต.ค. เสมอ */
async function onDay(iso, run) {
  mock.timers.setTime(new Date(`${iso}T03:00:00Z`).getTime());
  try { return await run(); } finally { mock.timers.setTime(new Date('2026-10-01T03:00:00Z').getTime()); }
}
const OCT_PLAN = { startDate: '2026-10-01', endDate: '2027-09-30' };
const openDates = (db) => visitsOfPlan(db).map((v) => v.scheduledDate).sort();

test('🔴 PATCH วันที่ 22 → 15 ตอนวันที่ 20: นัด 22 ต.ค. อยู่ต่อ (ช่องใหม่ของเดือนนี้เลยไปแล้ว) — เดือนนี้ไม่หายทั้งรอบ', async () => {
  await onDay('2026-10-20', async () => {
    assert.equal(businessDate(), '2026-10-20');
    const db = seed({ plans: [planRow(OCT_PLAN)], visits: MONTHLY22_VISITS() });
    const ask = await save(db, MONTHLY15);
    assert.equal(ask.status, 409);
    assert.deepEqual(ask.json.preview.cancel.map((v) => v.id), ['V2', 'V3'], 'นัด 22 ต.ค. ไม่อยู่ในรายการยกเลิก');
    assert.equal(ask.json.preview.reslot, 1);
    const done = await save(db, { ...MONTHLY15, cancelVisitIds: ['V2', 'V3'] });
    assert.equal(done.status, 200, done.json.error);
    assert.deepEqual([done.json.cancelled.length, done.json.reslotted, done.json.generated.length], [2, 1, 3]);
    assert.deepEqual([visitById(db, 'V1').status, visitById(db, 'V1').planSlotDate, visitById(db, 'V1').scheduledDate], ['draft', '2026-10-15', '2026-10-22']);
    assert.deepEqual(openDates(db), ['2026-10-22', '2026-11-16', '2026-12-15', '2027-01-15'], 'ทุกเดือนมีนัดหนึ่งใบ');
    // บันทึกอีกครั้ง (แก้หมายเหตุ): ไม่ถาม ไม่เขียนนัด
    const again = await save(db, { note: 'x' });
    assert.equal(again.status, 200, again.json.error);
    assert.deepEqual([again.json.cancelled, again.json.reslotted, again.json.generated], [[], 0, []]);
  });
  assert.equal(businessDate(), '2026-10-01');
});

test('🔴 PATCH วันที่ 15 → 22 หลังนัด 15 ต.ค. ปิดงานแล้ว: ไม่ถาม ไม่สร้าง 22 ต.ค. ซ้อน — นัดที่ปิดแล้วถือช่องของเดือนนี้', async () => {
  await onDay('2026-10-20', async () => {
    const visits = [
      visitRow('V1', '2026-10-15', '2026-10-15', { status: 'done', actualDate: '2026-10-15' }),
      visitRow('V2', '2026-11-15', '2026-11-16'),
      visitRow('V3', '2026-12-15', '2026-12-15'),
    ];
    const db = seed({ plans: [planRow({ ...MONTHLY15, ...OCT_PLAN })], visits });
    const ask = await save(db, MONTHLY22);
    assert.equal(ask.status, 409);
    assert.deepEqual(ask.json.preview.cancel.map((v) => v.id), ['V2', 'V3']);
    const done = await save(db, { ...MONTHLY22, cancelVisitIds: ['V2', 'V3'] });
    assert.equal(done.status, 200, done.json.error);
    assert.deepEqual([visitById(db, 'V1').status, visitById(db, 'V1').planSlotDate, visitById(db, 'V1').actualDate], ['done', '2026-10-22', '2026-10-15']);
    assert.deepEqual(slotAt(generatedRows(db)), ['2026-11-22@2026-11-23', '2026-12-22@2026-12-22'], 'ไม่มี 22 ต.ค.');
    assert.deepEqual(openDates(db), ['2026-10-15', '2026-11-23', '2026-12-22']);
    assert.equal(done.json.reslotted, 0);
    assert.deepEqual(done.json.kept, { moved: 0, started: 0, past: 0, manual: 0 });
    assert.ok(db.tables.audit_logs.some((row) => row.entityId === 'V1' && /คงนัด SV-V1/.test(row.summary)), 'การถือช่องมีรอยรายนัด');
  });
});

test('🔴 PATCH: นัดที่คนย้ายมาลงวันที่รอบใหม่นัดพอดี = อยู่ต่อเป็นนัดของช่องนั้น — ไม่ถาม ไม่ได้นัดซ้อนวันเดียวกัน (server-1)', async () => {
  const visits = EVERY30_VISITS();
  visits[2].scheduledDate = '2026-12-22';                     // ช่อง 21 ธ.ค. คนจัดคิวย้ายไป 22 ธ.ค.
  const db = seed({ plans: [planRow(DAYS30)], visits });
  const { status, json } = await save(db, MONTHLY22);
  assert.equal(status, 200, json.error);
  assert.deepEqual([json.cancelled, json.reslotted, json.generated, json.kept], [[], 2, [], { moved: 0, started: 0, past: 0, manual: 0 }]);
  assert.deepEqual(['V2', 'V3'].map((id) => visitById(db, id).planSlotDate), ['2026-11-22', '2026-12-22']);
  assert.deepEqual(openDates(db), ['2026-10-22', '2026-11-23', '2026-12-22'], 'ธ.ค. มีนัดใบเดียว');
  assert.equal(db.rpcCalls.length, 0);
});

test('🔴 PATCH: นัดที่คนย้ายวันถูกเก็บไว้ตอนเปลี่ยนรอบ — บันทึกครั้งถัดไป (แก้แค่หมายเหตุ) ไม่ตอบ 409 เสนอยกเลิกนัดใบนั้น (server-2)', async () => {
  const WEEKLY_TUE = { ...SIX_NULL, cadenceKind: 'weekly', cadenceEvery: 1, cadenceWeekday: 2 };
  const visits = [
    visitRow('V0', '2026-10-24', '2026-10-26'),               // ทุก 7 วันจากเสาร์ 24 ต.ค.: เสาร์ → จันทร์
    visitRow('V1', '2026-10-31', '2026-10-30'),               // ช่องเสาร์ 31 ต.ค. (นัดจันทร์ 2 พ.ย.) คนย้ายมาศุกร์ 30 ต.ค.
    visitRow('V2', '2026-11-07', '2026-11-09'),
  ];
  const db = seed({ plans: [planRow({ ...SIX_NULL, cadenceKind: 'days', everyDays: 7, startDate: '2026-10-24', endDate: '2027-10-23' })], visits });
  const ask = await save(db, WEEKLY_TUE);
  assert.equal(ask.status, 409);
  assert.deepEqual([ask.json.preview.cancel.map((v) => v.id), ask.json.preview.keptMoved], [['V0', 'V2'], 1]);
  const done = await save(db, { ...WEEKLY_TUE, cancelVisitIds: ['V0', 'V2'] });
  assert.equal(done.status, 200, done.json.error);
  assert.equal(done.json.kept.moved, 1);
  // นัดที่คนย้าย = นัดของสัปดาห์ 25–31 ต.ค. ⇒ ถือช่องวันอังคาร 27 ต.ค. · ตัวเติมนัดไม่สร้างวันอังคารของสัปดาห์นั้น
  assert.deepEqual([visitById(db, 'V1').planSlotDate, visitById(db, 'V1').scheduledDate, visitById(db, 'V1').status], ['2026-10-27', '2026-10-30', 'draft']);
  assert.equal(generatedRows(db).some((row) => row.planSlotDate === '2026-10-27'), false);
  assert.equal(generatedRows(db)[0].planSlotDate, '2026-11-03');

  const writesBefore = db.writes('service_visits').length;
  const note = await save(db, { note: 'เข้าหลังบ่ายโมง' });
  assert.equal(note.status, 200, `ต้องไม่ถูกถาม: ${note.json.error}`);
  assert.deepEqual([note.json.cancelled, note.json.reslotted, note.json.kept], [[], 0, { moved: 0, started: 0, past: 0, manual: 0 }]);
  assert.equal(db.writes('service_visits').length, writesBefore, 'ไม่เขียนนัดใบไหน');
  assert.equal(db.tables.service_plans[0].note, 'เข้าหลังบ่ายโมง');
});

test('PATCH: นัดที่อยู่ต่อแต่ไม่มีช่องใหม่ให้ถือ → ช่องของรอบเดิมถูกล้าง (คำสั่งผูก planId) · บันทึกครั้งถัดไปไม่พูดถึงมันอีก', async () => {
  const visits = EVERY30_VISITS().slice(1);                    // V2 ช่อง 21 พ.ย. (นัด 23 พ.ย.) · V3 ช่อง 21 ธ.ค.
  visits[0].scheduledDate = '2026-11-27';                      // คนย้าย V2 ไป 27 พ.ย.
  /* รอบที่บันทึกไว้ = ทุก 3 เดือน วันที่ 22 แต่นัดสองใบนี้ยังถือช่องของ "ทุก 30 วัน" (สภาพครึ่งทาง: ช่องไม่ได้มาจากรอบที่บันทึกไว้)
     → เปลี่ยนเป็นทุก 45 วัน: ไม่มีงวด และวันนัดไม่ตรงกับวันของรอบใหม่ ⇒ ไม่มีช่องให้ถือ · ไม่รู้ที่มา ⇒ ไม่ถูกเสนอยกเลิก */
  const db = seed({ plans: [planRow({ ...MONTHLY22, cadenceEvery: 3 })], visits });
  const DAYS45 = { ...SIX_NULL, cadenceKind: 'days', everyDays: 45 };
  const out = await save(db, DAYS45);
  assert.equal(out.status, 200, out.json.error);
  const release = db.writes('service_visits').find((w) => w.payload.planSlotDate === null && !('status' in w.payload));
  assert.ok(release, 'ต้องมีคำสั่งล้างช่อง');
  assert.deepEqual(release.filters, [['in', 'id', ['V2', 'V3']], ['eq', 'planId', 'P1']]);
  assert.deepEqual(Object.keys(release.payload).sort(), ['planSlotDate', 'updatedAt']);
  assert.deepEqual(['V2', 'V3'].map((id) => [visitById(db, id).planId, visitById(db, id).planSlotDate, visitById(db, id).status]),
    [['P1', null, 'draft'], ['P1', null, 'draft']]);
  const again = await save(db, { note: 'x' });
  assert.equal(again.status, 200, again.json.error);
  assert.deepEqual(again.json.kept, { moved: 0, started: 0, past: 0, manual: 0 });
});

test('🔴 PATCH: นัดของรอบที่ไม่มีช่อง (ตั้งจากแถบ "ตั้งนัดรอบถัดไป" ของรอบทุก N วัน) ถูกนับใน kept.manual ทั้งในรายการ 409 และคำตอบ 200 (server-3)', async () => {
  const banner = () => visitRow('B1', null, '2026-12-23', { status: 'scheduled' });
  // ไม่มีนัดให้ยกเลิก = ไม่ถาม แต่คำตอบต้องบอกว่ามีนัดที่คนตั้งเองค้างอยู่ข้างนัดของรอบใหม่
  const quiet = seed({ plans: [planRow(DAYS30)], visits: [banner()] });
  const ok = await save(quiet, MONTHLY22);
  assert.equal(ok.status, 200, ok.json.error);
  assert.deepEqual(ok.json.kept, { moved: 0, started: 0, past: 0, manual: 1 });
  assert.deepEqual([visitById(quiet, 'B1').status, visitById(quiet, 'B1').planId, visitById(quiet, 'B1').scheduledDate], ['scheduled', 'P1', '2026-12-23'], 'ไม่ถูกแตะ');
  // มีนัดให้ยกเลิกด้วย = รายการ 409 บอกจำนวน
  const db = seed({ plans: [planRow(DAYS30)], visits: [...EVERY30_VISITS(), banner()] });
  const ask = await save(db, MONTHLY22);
  assert.equal(ask.status, 409);
  assert.equal(ask.json.preview.keptManual, 1);
  assert.deepEqual(ask.json.preview.cancel.map((v) => v.id), ['V3']);
  // ตารางของรอบไม่เปลี่ยน (แก้หมายเหตุ) = ไม่พูดซ้ำ
  const note = await save(quiet, { note: 'x' });
  assert.equal(note.json.kept.manual, 0);
});

test('🔴 PATCH: วันที่ไม่มีจริงในปฏิทิน = 400 ก่อนเขียนอะไร — ไม่ยกเลิกนัดทั้งรอบแล้วฐานตีรอบกลับ (server-4)', async () => {
  const db = seed({ plans: [planRow()], visits: MONTHLY22_VISITS() });
  for (const [bad, message] of [[{ endDate: '2027-02-31' }, 'วันสิ้นสุดรอบไม่ถูกต้อง'], [{ startDate: '2026-09-31' }, 'วันเริ่มรอบไม่ถูกต้อง']]) {
    const plain = await save(db, bad);
    assert.deepEqual([plain.status, plain.json.error], [400, message]);
    const confirmed = await save(db, { ...bad, cancelVisitIds: ['V1', 'V2', 'V3'] });
    assert.deepEqual([confirmed.status, confirmed.json.error], [400, message]);
  }
  assert.deepEqual(allWrites(db), []);
  assert.deepEqual(MONTHLY22_VISITS().map((v) => [visitById(db, v.id).status, visitById(db, v.id).planId]), Array(3).fill(['draft', 'P1']));
  const post = await create(seed({ plans: [] }), { ...NEW_PLAN, ...MONTHLY22, endDate: '2027-02-31' });
  assert.deepEqual([post.status, post.json.error], [400, 'วันสิ้นสุดรอบไม่ถูกต้อง']);
});

test('🔴 PATCH ?generate=1: นัดของรอบที่ยังไม่ได้เข้าและตรงวันหยุด/เสาร์–อาทิตย์ ถูกบอกรหัส — วันหยุดที่คีย์หลังนัดถูกสร้างไม่ย้ายนัดให้ (server-5)', async () => {
  const DAY1 = { ...SIX_NULL, cadenceKind: 'monthly', cadenceEvery: 1, cadenceMonthDay: 1 };
  const visits = [
    visitRow('V0', '2026-10-01', '2026-10-01', { status: 'scheduled' }),
    visitRow('V1', '2026-11-01', '2026-11-02'),
    visitRow('V2', '2026-12-01', '2026-12-01'),
    visitRow('V3', '2027-01-01', '2027-01-01', { status: 'scheduled' }),      // สร้างไว้ตอนตารางยังไม่มีวันหยุดปี 2027
    visitRow('V4', '2027-02-01', '2027-02-06'),                                // คนย้ายไปวันเสาร์
    visitRow('V5', '2026-09-01', '2026-09-05', { status: 'scheduled' }),       // เลยวันนัดแล้ว — ไม่นับ
    visitRow('V6', '2027-03-01', '2027-03-06', { status: 'done' }),            // ปิดงานแล้ว — ไม่นับ
  ];
  const holidays = [...HOLIDAY_ROWS, { id: 'HOL-2027', date: '2027-01-01', name: 'วันขึ้นปีใหม่' }];
  const db = seed({ plans: [planRow({ ...DAY1, startDate: '2026-09-01', endDate: '2027-08-31' })], visits, holidays });
  const { status, json } = await save(db, { note: 'x' });
  assert.equal(status, 200, json.error);
  assert.deepEqual(json.offDayVisits, [
    { id: 'V3', code: 'SV-V3', scheduledDate: '2027-01-01' },
    { id: 'V4', code: 'SV-V4', scheduledDate: '2027-02-06' },
  ]);
  assert.equal(visitById(db, 'V3').scheduledDate, '2027-01-01', 'ระบบไม่ย้ายให้เอง — วันนัดอาจถูกคนเลือกไว้');
  assert.equal(db.rpcCalls.length, 0, 'ช่อง 1 ม.ค. มีนัดถืออยู่ ไม่สร้างซ้ำ');
  // ไม่เติมนัด = ไม่ตรวจ · ปิดรอบ = ไม่ตรวจ
  assert.deepEqual((await save(db, { note: 'y' }, { generate: false })).json.offDayVisits, []);
  assert.deepEqual((await save(db, { isActive: false })).json.offDayVisits, []);
});

test('DELETE รอบตามปฏิทิน: บรรทัด audit พิมพ์ความถี่จาก cadenceText (ไม่ใช่ "ทุก null วัน")', async () => {
  const db = seed({ plans: [planRow()], visits: MONTHLY22_VISITS() });
  const { status, json } = await callRoute(deletePlan, { user: planner, db, method: 'DELETE', path: '/api/service/plans/P1', params: { id: 'P1' } });
  assert.equal(status, 200, json.error);
  const audit = db.tables.audit_logs.find((row) => row.action === 'delete');
  assert.equal(audit.summary, 'ลบรอบบริการทุกเดือน วันที่ 22 — นัดที่สร้างไว้แล้วยังอยู่ในฐานะงานนอกรอบ');
});

// ── วันหยุดของตัวเติมนัด (planGen) ─────────────────────────────────────────────────────────
test('loadPlanHolidays: แถวของตาราง → Set ของวัน · ตารางว่าง = รายการตั้งต้น · อ่านไม่ได้ = โยน error (ไม่กลืน)', async () => {
  const set = await loadPlanHolidays(seed({ holidays: [{ date: '2027-01-01' }, { date: '2027-04-13T00:00:00+07:00' }] }));
  assert.deepEqual([...set], ['2027-01-01', '2027-04-13']);
  const fallback = await loadPlanHolidays(seed({ holidays: [] }));
  assert.ok(fallback.has('2026-10-23') && fallback.size > 30, 'รายการตั้งต้นปี 2025–2026');
  await assert.rejects(
    loadPlanHolidays(seed({ hook: (q) => (q.table === 'holidays' ? { data: null, error: { message: 'x' } } : undefined) })),
    (error) => error.message === CADENCE_TEXT.holidayReadFailed,
  );
});

test('planHolidayGapYears: ปีในช่วงที่รอบยังสร้างนัดได้ซึ่งตารางไม่มีแถว — นับจากวันนี้ ไม่ใช่จากวันเริ่มรอบที่ผ่านไปแล้ว', () => {
  const table = new Set(H2026);
  const today = '2026-10-01';
  const gap = (plan) => planHolidayGapYears({ ...planRow(), ...plan }, table, today);
  assert.deepEqual(gap({}), [2027]);
  assert.deepEqual(gap({ endDate: '2028-03-31' }), [2027, 2028]);
  assert.deepEqual(gap({ startDate: '2025-06-01', endDate: '2026-12-31' }), [], 'ปี 2025 ผ่านไปแล้ว — ไม่เตือนย้อนหลัง');
  assert.deepEqual(gap({ startDate: '2025-06-01', endDate: '2026-06-30' }), [], 'รอบที่จบไปแล้ว');
  assert.deepEqual(gap({ startDate: '2027-02-01', endDate: '2027-03-31' }), [2027], 'รอบที่ยังไม่เริ่ม นับจากวันเริ่มรอบ');
  // รอบปลายเปิด: ถึงวันนัดสุดท้ายที่ตัวเติมนัดสร้างให้วันนี้ (`horizonEndFor` — ตัวเดียวกับ ensureVisits)
  //   รอบที่เริ่มไปแล้ว รายเดือน: วันนี้ + 90 วัน = 30 ธ.ค. 2026 · ทุก 12 เดือน 372 วัน = ถึงปี 2027
  assert.deepEqual(gap({ startDate: '2026-09-22', endDate: null }), []);
  assert.deepEqual(gap({ startDate: '2026-09-22', endDate: null, cadenceEvery: 12 }), [2027]);
  //   รอบที่ยังไม่เริ่ม (22 ต.ค.): ระยะนับจากวันเริ่มรอบ = ถึง 20 ม.ค. 2027 · ทุก N วันยังนับจากวันนี้ (30 ธ.ค. 2026)
  assert.deepEqual(gap({ endDate: null }), [2027]);
  assert.deepEqual(gap({ endDate: null, ...DAYS30 }), []);
  // ชุดว่าง = ยังไม่ได้ตั้งตาราง ≠ ปีขาด
  assert.deepEqual(planHolidayGapYears(planRow(), new Set(), today), []);
  // ไม่ส่งวันนี้ = นาฬิกาไทย
  assert.deepEqual(planHolidayGapYears(planRow(), table), [2027]);
});

// ── POST /api/service/visits (D11) ─────────────────────────────────────────────────────────
const NEW_VISIT = { siteId: 'S1', planId: 'P1', kind: 'refill', scheduledDate: '2026-11-23' };
const book = (db, body) => callRoute(postVisit, { user: planner, db, method: 'POST', path: '/api/service/visits', body });

test('POST นัดของรอบ: ช่องของรอบที่เป็นช่องจริงถูกเก็บ · วันที่ไม่ใช่ช่อง / ไม่ผูกรอบ = ไม่ส่งคีย์เลย', async () => {
  const db = seed();
  const real = await book(db, { ...NEW_VISIT, planSlotDate: '2026-11-22' });
  assert.equal(real.status, 201, real.json.error);
  assert.equal(generatedRows(db).at(-1).planSlotDate, '2026-11-22');
  assert.equal(real.json.planSlotDate, '2026-11-22');

  // วันนัดที่เลื่อนแล้ว (23 พ.ย.) ไม่ใช่ช่องของรอบ · วันนอกช่วงรอบ · ค่ามั่ว
  for (const planSlotDate of ['2026-11-23', '2026-09-22', '2027-10-22', 'x', null, undefined]) {
    const out = await book(db, { ...NEW_VISIT, planSlotDate });
    assert.equal(out.status, 201, out.json.error);
    assert.equal('planSlotDate' in generatedRows(db).at(-1), false, String(planSlotDate));
  }
  // timestamp ที่ขึ้นต้นด้วยช่องจริง = เก็บเป็นวันล้วน
  await book(db, { ...NEW_VISIT, planSlotDate: '2026-12-22T00:00:00.000Z' });
  assert.equal(generatedRows(db).at(-1).planSlotDate, '2026-12-22');
  // งานนอกรอบ: ส่งช่องมาก็ไม่เก็บ
  const offRound = await book(db, { ...NEW_VISIT, planId: null, planSlotDate: '2026-11-22' });
  assert.equal(offRound.status, 201, offRound.json.error);
  assert.equal('planSlotDate' in generatedRows(db).at(-1), false);
});

// ── PATCH /api/service/visits/[id] ─────────────────────────────────────────────────────────
const edit = (db, id, body) => callRoute(patchVisit, { user: planner, db, method: 'PATCH', path: `/api/service/visits/${id}`, params: { id }, body });

test('⭐ ปิดงานนัดของรอบตามปฏิทิน: ข้อเสนอนัดถัดไป = นัดตามรอบตัวถัดไป พร้อมช่องของรอบ (เดิมไม่มีข้อเสนอเลย)', async () => {
  const plan = planRow({ startDate: '2026-09-22', assigneeId: 'U-TECH', assigneeName: 'ช่างเอ' });
  const running = visitRow('V1', '2026-09-22', '2026-09-22', {
    status: 'in_progress', assigneeId: 'U-TECH', assigneeName: 'ช่างเอ', actualDate: '2026-09-28', actualStartTime: '09:00',
  });
  const db = seed({ plans: [plan], visits: [running] });
  const { status, json } = await edit(db, 'V1', { status: 'done' });
  assert.equal(status, 200, json.error);
  assert.equal(json.visit.status, 'done');
  assert.deepEqual(json.nextVisitSuggestion, {
    siteId: 'S1', planId: 'P1', kind: 'refill', scheduledDate: '2026-10-22', planSlotDate: '2026-10-22',
    assigneeId: 'U-TECH', assigneeName: 'ช่างเอ', status: 'scheduled',
  });
  assert.equal(reads(db, 'holidays').length, 1, 'วันหยุดอ่านจากตาราง ส่งเป็นอาร์กิวเมนต์');
});

test('ปิดงานนัดของรอบทุก N วัน: ข้อเสนอรูปเดิม (ไม่มี planSlotDate) · อ่านวันหยุดไม่ได้ก็ยังปิดงานได้', async () => {
  const plan = planRow({ ...DAYS30, startDate: '2026-09-22' });
  const running = () => visitRow('V1', '2026-09-22', '2026-09-22', { status: 'in_progress', actualDate: '2026-09-22', actualStartTime: '09:00' });
  const db = seed({ plans: [plan], visits: [running()] });
  const { status, json } = await edit(db, 'V1', { status: 'done' });
  assert.equal(status, 200, json.error);
  assert.deepEqual(json.nextVisitSuggestion, {
    siteId: 'S1', planId: 'P1', kind: 'refill', scheduledDate: '2026-10-22', assigneeId: null, assigneeName: null, status: 'scheduled',
  });

  const broken = seed({
    plans: [plan], visits: [running()],
    hook: (q) => (q.table === 'holidays' ? { data: null, error: { message: 'timeout' } } : undefined),
  });
  const out = await edit(broken, 'V1', { status: 'done' });
  assert.equal(out.status, 200, out.json.error);
  assert.equal(out.json.nextVisitSuggestion.scheduledDate, '2026-10-22', 'ปิดงานต้องไม่ล้มเพราะตารางวันหยุด');
});

test('PATCH นัดที่ย้ายไปรอบอื่น / ถอดออกจากรอบ = ล้างช่องของรอบ · ไม่แตะ planId = ไม่ส่งคีย์ planSlotDate', async () => {
  const db = seed({ plans: [planRow(), planRow({ id: 'P2' })], visits: MONTHLY22_VISITS() });
  const note = await edit(db, 'V1', { note: 'โทรนัดก่อนเข้า' });
  assert.equal(note.status, 200, note.json.error);
  assert.equal('planSlotDate' in db.writes('service_visits').at(-1).payload, false);
  assert.equal(visitById(db, 'V1').planSlotDate, '2026-10-22');

  const moved = await edit(db, 'V2', { planId: 'P2' });
  assert.equal(moved.status, 200, moved.json.error);
  assert.equal(db.writes('service_visits').at(-1).payload.planSlotDate, null);
  assert.deepEqual([visitById(db, 'V2').planId, visitById(db, 'V2').planSlotDate], ['P2', null]);

  const detached = await edit(db, 'V3', { planId: null });
  assert.equal(detached.status, 200, detached.json.error);
  assert.deepEqual([visitById(db, 'V3').planId, visitById(db, 'V3').planSlotDate], [null, null]);

  // ฐานที่ยังไม่รัน 0397 (แถวไม่มีคอลัมน์) = ไม่ส่งคีย์ที่ไม่มีอยู่
  const { planSlotDate: _drop, ...old } = visitRow('V9', null, '2026-10-22');
  const pre = seed({ plans: [planRow(), planRow({ id: 'P2' })], visits: [old] });
  const out = await edit(pre, 'V9', { planId: 'P2' });
  assert.equal(out.status, 200, out.json.error);
  assert.equal('planSlotDate' in pre.writes('service_visits').at(-1).payload, false);
});
