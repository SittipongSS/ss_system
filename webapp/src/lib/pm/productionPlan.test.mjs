// แผนผลิต (mig 0189 · P-2) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  draftJobsForSalesOrder,
  dueRisk,
  jobDateRange,
  jobFinishDate,
  jobWarnings,
  lineLoad,
  normalizeJobInput,
  overloadedDays,
  readinessConflict,
  salesOrderPlanSummary,
  sortQueue,
  spreadJob,
} from './productionPlan.js';

// ไลน์ผสม 100 ชิ้น/วัน · 2026-08-03 = จันทร์ (สัปดาห์ 3–7 ส.ค. เป็นวันทำการล้วน)
const line = (over = {}) => ({ id: 'L1', code: 'MIX-01', name: 'ไลน์ผสม 1', capacityPerDay: 100, unit: 'ชิ้น', isActive: true, ...over });
const job = (over = {}) => ({ id: 'J1', code: 'PB-1', qty: 250, lineId: 'L1', plannedStart: '2026-08-03', status: 'planned', dayOverrides: {}, ...over });

// ── กระจายงานลงวัน ───────────────────────────────────────────────────────
test('กระจายงานตามกำลังไลน์ วันละเท่ากำลัง จนครบจำนวน', () => {
  assert.deepEqual(spreadJob(job(), line()), [
    { date: '2026-08-03', qty: 100 },
    { date: '2026-08-04', qty: 100 },
    { date: '2026-08-05', qty: 50 },
  ]);
});

test('⭐ ข้ามเสาร์-อาทิตย์/วันหยุด — แผนที่เดินต่อในวันที่โรงงานปิดจะจบเร็วกว่าจริงเสมอ', () => {
  // เริ่มศุกร์ 7 ส.ค. → 7 ส.ค. · ข้าม ส-อา · ต่อจันทร์ 10 ส.ค.
  const days = spreadJob(job({ plannedStart: '2026-08-07', qty: 150 }), line());
  assert.deepEqual(days.map((d) => d.date), ['2026-08-07', '2026-08-10']);
});

test('⭐ อัตราของงานยังต้องเคารพวันปิดไลน์ — ไม่ใช่เดินทุกวันปฏิทิน', () => {
  const days = spreadJob(job({ plannedStart: '2026-08-07', qty: 60, ratePerDay: 30 }), line());
  assert.deepEqual(days.map((d) => d.date), ['2026-08-07', '2026-08-10']);
});

test('อัตราของงานชนะกำลังไลน์ (งานใบนี้เดินช้ากว่าปกติ)', () => {
  const days = spreadJob(job({ qty: 90, ratePerDay: 30 }), line());
  assert.deepEqual(days, [
    { date: '2026-08-03', qty: 30 },
    { date: '2026-08-04', qty: 30 },
    { date: '2026-08-05', qty: 30 },
  ]);
});

test('dayOverrides ชนะทุกอย่าง — 0 = วันนั้นไลน์ไปทำงานอื่น', () => {
  const days = spreadJob(job({ qty: 150, dayOverrides: { '2026-08-04': 0 } }), line());
  assert.deepEqual(days, [
    { date: '2026-08-03', qty: 100 },
    { date: '2026-08-05', qty: 50 },
  ]);
});

test('⭐ ไม่รู้กำลังไลน์ และงานไม่ระบุอัตรา → คืน [] ไม่เดา — แท่งงานที่วาดจากอัตราที่เดาเองดูน่าเชื่อถือทั้งที่ไม่มีข้อมูลรองรับ', () => {
  assert.deepEqual(spreadJob(job(), line({ capacityPerDay: null })), []);
  // แต่ถ้างานระบุอัตราเอง คำนวณได้ แม้ไลน์ยังไม่กรอกกำลัง
  assert.equal(spreadJob(job({ qty: 60, ratePerDay: 30 }), line({ capacityPerDay: null })).length, 2);
});

test('ไลน์ปิดใช้งาน = ไม่เดินเลย → คำนวณไม่ออก', () => {
  assert.deepEqual(spreadJob(job(), line({ isActive: false })), []);
});

test('วันจบ + ช่วงวันของงาน', () => {
  assert.equal(jobFinishDate(job(), line()), '2026-08-05');
  assert.deepEqual(jobDateRange(job(), line()), { start: '2026-08-03', finish: '2026-08-05', days: 3 });
  assert.equal(jobFinishDate(job({ plannedStart: null }), line()), null);
});

// ── ตรวจข้อมูล ───────────────────────────────────────────────────────────
test('จำนวนต้องมากกว่า 0', () => {
  assert.match(normalizeJobInput({ qty: 0 }).error, /มากกว่า 0/);
  assert.match(normalizeJobInput({ qty: 'abc' }).error, /มากกว่า 0/);
});

test('⭐ วางคิวแล้วต้องมีไลน์ + วันเริ่ม — งาน planned ที่ไม่มีไลน์จะลอยบนบอร์ดโดยไม่มีช่องให้วาง', () => {
  assert.match(normalizeJobInput({ qty: 10, status: 'planned' }).error, /ต้องเลือกไลน์ผลิต/);
  assert.match(normalizeJobInput({ qty: 10, status: 'planned', lineId: 'L1' }).error, /ต้องระบุวันเริ่มผลิต/);
  assert.equal(normalizeJobInput({ qty: 10, status: 'planned', lineId: 'L1', plannedStart: '2026-08-03' }).error, null);
  // ร่างยังไม่ต้องมีไลน์ — PC ยังไม่ได้ตัดสินใจ
  assert.equal(normalizeJobInput({ qty: 10, status: 'draft' }).error, null);
});

test('⭐ อัตราว่าง = ใช้กำลังไลน์ ไม่ใช่ 0 (0 = เดินไม่ได้เลย)', () => {
  assert.equal(normalizeJobInput({ qty: 10 }).value.ratePerDay, null);
  assert.match(normalizeJobInput({ qty: 10, ratePerDay: 0 }).error, /มากกว่า 0/);
});

test('วันจบจริงต้องไม่ก่อนวันเริ่มจริง · ปีพิมพ์ผิดถูกจับ', () => {
  assert.match(normalizeJobInput({ qty: 10, actualStart: '2026-08-05', actualFinish: '2026-08-01' }).error, /ไม่ก่อนวันเริ่มจริง/);
  assert.match(normalizeJobInput({ qty: 10, dueDate: '2202-08-06' }).error, /นอกช่วงปี/);
});

test('dayOverrides รับเฉพาะวันที่ถูกรูปแบบและตัวเลขไม่ติดลบ', () => {
  assert.match(normalizeJobInput({ qty: 10, dayOverrides: { 'พรุ่งนี้': 5 } }).error, /ไม่ถูกต้อง/);
  assert.match(normalizeJobInput({ qty: 10, dayOverrides: { '2026-08-04': -1 } }).error, /ไม่ติดลบ/);
  assert.deepEqual(normalizeJobInput({ qty: 10, dayOverrides: { '2026-08-04': 0 } }).value.dayOverrides, { '2026-08-04': 0 });
});

// ── โหลดของไลน์ + เกินกำลัง ──────────────────────────────────────────────
test('รวมโหลดหลายงานบนไลน์เดียวกันรายวัน + คิด %', () => {
  const jobs = [
    job({ id: 'J1', qty: 60, ratePerDay: 60 }),
    job({ id: 'J2', qty: 60, ratePerDay: 60 }),
  ];
  const load = lineLoad(jobs, [line()], { from: '2026-08-01', to: '2026-08-31' });
  const cell = load.get('L1|2026-08-03');
  assert.equal(cell.planned, 120);
  assert.equal(cell.capacity, 100);
  assert.equal(cell.pct, 120);
  assert.equal(overloadedDays(load).length, 1);
});

test('⭐ งานร่าง/จบ/ยกเลิก ไม่กินกำลังผลิต — ร่างยังไม่มีไลน์ จบไปแล้วก็ไม่กินที่', () => {
  const jobs = [
    job({ id: 'J1', status: 'draft' }),
    job({ id: 'J2', status: 'done' }),
    job({ id: 'J3', status: 'cancelled' }),
  ];
  assert.equal(lineLoad(jobs, [line()], { from: '2026-08-01', to: '2026-08-31' }).size, 0);
});

test('⭐ ไลน์ที่ยังไม่กรอกกำลัง → pct = null ไม่ใช่เกิน — ช่องที่ไม่รู้ต้องไม่ขึ้นแดง', () => {
  const load = lineLoad([job({ qty: 60, ratePerDay: 60 })], [line({ capacityPerDay: null })], { from: '2026-08-01', to: '2026-08-31' });
  const cell = load.get('L1|2026-08-03');
  assert.equal(cell.capacity, null);
  assert.equal(cell.pct, null);
  assert.deepEqual(overloadedDays(load), []);
});

// ── ตัวตอบว่าแผนเป็นไปได้ไหม ─────────────────────────────────────────────
test('⭐ วางผลิตก่อนของมาถึง → เตือน (ดึงจาก productionReadiness ที่มีอยู่แล้ว)', () => {
  const readiness = { state: 'waiting', lastDue: '2026-08-10' };
  assert.equal(readinessConflict(job({ plannedStart: '2026-08-03' }), readiness).kind, 'materials');
  assert.equal(readinessConflict(job({ plannedStart: '2026-08-12' }), readiness), null);
});

test('⭐ ยังไม่มีรายการของเข้า = ไม่ฟ้อง — "ไม่รู้" ไม่ใช่ "ผิด" (ของ long-lead สั่งก่อนออก SO)', () => {
  assert.equal(readinessConflict(job(), { state: 'unknown' }), null);
  assert.equal(readinessConflict(job(), { state: 'ready' }), null);
});

test('ของยังไม่ครบและไม่มีกำหนดถึง → เตือนคนละข้อความ', () => {
  const conflict = readinessConflict(job(), { state: 'waiting', lastDue: null });
  assert.match(conflict.message, /ยังไม่มีกำหนดถึง/);
});

test('จบช้ากว่ากำหนดส่ง → บอกจำนวนวันที่ช้า', () => {
  assert.equal(dueRisk(job({ dueDate: '2026-08-03' }), '2026-08-05').lateDays, 2);
  assert.equal(dueRisk(job({ dueDate: '2026-08-10' }), '2026-08-05'), null);
  assert.equal(dueRisk(job({ dueDate: null }), '2026-08-05'), null);
});

test('ป้ายเตือนรวม: ของยังไม่มา + จบช้า พร้อมกันได้', () => {
  const warnings = jobWarnings(
    job({ dueDate: '2026-08-04' }), line(),
    { readiness: { state: 'waiting', lastDue: '2026-08-10' } },
  );
  assert.deepEqual(warnings.map((w) => w.kind).sort(), ['due', 'materials']);
});

test('งานที่วางคิวแล้วแต่คำนวณวันจบไม่ได้ → เตือนว่ายังไม่ได้กรอกกำลัง', () => {
  const warnings = jobWarnings(job(), line({ capacityPerDay: null }), {});
  assert.equal(warnings[0].kind, 'rate');
});

// ── คิวงาน ───────────────────────────────────────────────────────────────
test('⭐ คิวเรียงงานร่างขึ้นก่อน แล้วตามกำหนดส่ง · ไม่มีกำหนดส่งไปท้าย ไม่ใช่ขึ้นหัว', () => {
  const rows = sortQueue([
    job({ id: 'A', code: 'A', status: 'planned', dueDate: '2026-08-01' }),
    job({ id: 'B', code: 'B', status: 'draft', dueDate: null }),
    job({ id: 'C', code: 'C', status: 'draft', dueDate: '2026-08-20' }),
    job({ id: 'D', code: 'D', status: 'draft', dueDate: '2026-08-05' }),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['D', 'C', 'B', 'A']);
});

// ── สร้างงานร่างจาก SO ────────────────────────────────────────────────────
const order = (over = {}) => ({ id: 'SO1', status: 'approved', dealId: 'D1', projectId: 'P1', paymentDueDate: '2026-09-01', ...over });

test('SO อนุมัติแล้ว → สร้างงานร่างหนึ่งใบต่อบรรทัดที่มีสินค้า', () => {
  const rows = draftJobsForSalesOrder(order(), [
    { id: 'L1', productId: 'PRD1', fgCode: 'FG-1', description: 'น้ำหอม A', qty: 500 },
    { id: 'L2', productId: 'PRD2', description: 'น้ำหอม B', qty: 300 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].salesOrderLineId, 'L1');
  assert.equal(rows[0].dueDate, '2026-09-01');
  assert.equal(rows[0].status, 'draft');
});

test('⭐ บรรทัดที่ไม่มีสินค้า (ค่าออกแบบฉลาก/บริการ) ไม่สร้างงานผลิต — ไม่งั้นคิวมีงานที่ผลิตไม่ได้', () => {
  const rows = draftJobsForSalesOrder(order(), [
    { id: 'L1', productId: null, description: 'ค่าออกแบบฉลาก', qty: 1 },
    { id: 'L2', productId: 'PRD1', description: 'น้ำหอม A', qty: 100 },
  ]);
  assert.deepEqual(rows.map((r) => r.salesOrderLineId), ['L2']);
});

test('⭐ SO ที่ยังไม่อนุมัติไม่สร้างอะไรเลย — QT/ร่างยังไม่ใช่คำสั่ง จะได้คิวขยะที่ไม่มีใครกล้าลบ', () => {
  for (const status of ['draft', 'pending_approval', 'rejected', 'cancelled']) {
    assert.deepEqual(draftJobsForSalesOrder(order({ status }), [{ id: 'L1', productId: 'P', qty: 1 }]), [], status);
  }
});

test('⭐ กดซ้ำไม่ได้งานซ้ำ — บรรทัดที่มีงานอยู่แล้วถูกข้าม', () => {
  const lines = [{ id: 'L1', productId: 'PRD1', qty: 100 }, { id: 'L2', productId: 'PRD2', qty: 50 }];
  const rows = draftJobsForSalesOrder(order(), lines, { existingLineIds: ['L1'] });
  assert.deepEqual(rows.map((r) => r.salesOrderLineId), ['L2']);
});

test('บรรทัดจำนวนเป็น 0 หรือติดลบไม่สร้างงาน', () => {
  assert.deepEqual(draftJobsForSalesOrder(order(), [{ id: 'L1', productId: 'P', qty: 0 }]), []);
});

// ── สรุปแผนผลิตของ SO — การ์ดบนหน้า SO (P-3) ─────────────────────────────
test('SO ที่ยังไม่มีงานผลิต → "ยังไม่ได้วางคิวผลิต"', () => {
  const s = salesOrderPlanSummary([], [line()]);
  assert.equal(s.state, 'none');
  assert.equal(s.tone, 'neutral');
});

test('⭐ มีงานแต่ยังเป็นร่างทั้งหมด ต้องพูดว่า "ยังไม่วางคิว" ไม่ใช่บอกวัน', () => {
  const s = salesOrderPlanSummary([job({ status: 'draft', lineId: null, plannedStart: null })], [line()]);
  assert.equal(s.state, 'draft');
  assert.equal(s.tone, 'warning');
  assert.match(s.label, /ยังไม่วางคิว/);
});

test('วางคิวแล้ว → บอกช่วงวันที่ผลิตจริง (SA ตอบลูกค้าได้ทันที)', () => {
  const s = salesOrderPlanSummary([job()], [line()]);
  assert.equal(s.state, 'planned');
  assert.equal(s.start, '2026-08-03');
  assert.equal(s.finish, '2026-08-05');
  assert.match(s.label, /2026-08-03 – 2026-08-05/);
});

test('⭐ วางคิวแล้วแต่คำนวณวันไม่ออก ต้องพูดคนละอย่างกับ "ยังไม่วางคิว" — อันนี้แก้ได้ด้วยการกรอกกำลังไลน์', () => {
  const s = salesOrderPlanSummary([job()], [line({ capacityPerDay: null })]);
  assert.equal(s.state, 'planned');
  assert.equal(s.tone, 'warning');
  assert.match(s.label, /ยังคำนวณวันไม่ได้/);
});

test('หลายงานในใบเดียว → ช่วงคือ เริ่มเร็วสุด ถึง จบช้าสุด', () => {
  const s = salesOrderPlanSummary([
    job({ id: 'J1', qty: 100 }),                                  // 08-03
    job({ id: 'J2', qty: 100, plannedStart: '2026-08-10' }),       // 08-10
  ], [line()]);
  assert.equal(s.start, '2026-08-03');
  assert.equal(s.finish, '2026-08-10');
});

test('กำลังผลิตอยู่ → บอกวันคาดจบ · จบครบทุกใบ → ผลิตเสร็จแล้ว', () => {
  assert.equal(salesOrderPlanSummary([job({ status: 'in_progress' })], [line()]).state, 'running');
  assert.equal(salesOrderPlanSummary([job({ status: 'done' })], [line()]).state, 'done');
});

test('งานที่ยกเลิกไม่นับในสรุป — ยกเลิกหมดแล้วเท่ากับยังไม่ได้วางคิว', () => {
  assert.equal(salesOrderPlanSummary([job({ status: 'cancelled' })], [line()]).state, 'none');
});
