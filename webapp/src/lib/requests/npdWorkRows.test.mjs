// ── แถวงานของพัฒนาสูตร NPD แตกจากแถวสินค้าใน PDR (ม-144 · มติผู้ใช้ 2026-09-11 "เอา ก") ──
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  npdSyncClosurePatch, npdTargetPairs, npdWorkRowSpec, npdWorkRowsEmpty, npdWorkRowsError, npdWorkRowsScentError,
  npdWorkRowsSummary, planNpdWorkRows,
} from './npdWorkRows.js';
import { closeRequestError, requestRowsClosurePatch } from './stages.js';
import { npdUncoveredError, npdUncoveredPairs } from './npdPairs.js';
import { requestNextStep } from './queueBoard.js';
import { requestStageKey } from './deptOverview.js';
import { deleteRequestRowError } from './rowDelete.js';
import submitScope from './submitScope.js';
import {
  requestShapeError, requestUsesDeliveredRows, requestUsesItems, requestLineShape,
} from '../master/requestTypes.js';

const T = (categoryCode, scentId, over = {}) => ({ categoryCode, scentId, sizeValue: 100, sizeUnit: 'ml', ...over });
const row = (id, categoryCode, scentId, over = {}) => ({
  id, lineKind: 'product_dev', categoryCode, scentId, label: `${categoryCode} · ${scentId}`,
  ackAt: '2026-09-11', ...over,
});

test('⭐ หนึ่งแถวงานต่อคู่ หมวด × กลิ่นที่ไม่ซ้ำ — สินค้าคู่เดียวกันหลายขนาดรวมเป็นสูตรเดียว', () => {
  const targets = [T('01-009', 'SC-1', { sizeValue: 50 }), T('01-006', 'SC-1'), T('01-009', 'SC-1'), T('01-009', 'SC-2')];
  const pairs = npdTargetPairs(targets);
  assert.deepEqual(pairs.map((p) => p.key), ['01-009::SC-1', '01-006::SC-1', '01-009::SC-2']);
  const plan = planNpdWorkRows({ targets, items: [] });
  assert.equal(plan.insert.length, 3);
  // สเปกย่อบอกทุกขนาดของคู่นั้น — ไม่รวมเป็นตัวเลขเดียว
  assert.match(plan.insert[0].spec, /50 ml.*100 ml/);
  assert.match(npdWorkRowSpec(pairs[0]), /^ตามแบบฟอร์ม PDR: /);
  // แถวที่ยังไม่เลือกกลิ่นไม่งอกแถวงาน (ด่านรับเรื่องกันไว้อยู่แล้ว แต่ตัววางแผนต้องไม่พังเอง)
  assert.equal(planNpdWorkRows({ targets: [{ categoryCode: '01-009', scentId: '' }] }).insert.length, 0);
});

test('⭐ ทำซ้ำได้ — คู่ที่มีแถวไหนถืออยู่แล้ว (รวมรอบแก้/ไม่ถูกเลือก) ไม่งอกซ้ำ', () => {
  const targets = [T('01-009', 'SC-1'), T('01-006', 'SC-2')];
  const items = [
    row('DRI-1', '01-009', 'SC-1', { answerStatus: 'declined', outcome: 'revise' }),
    row('DRI-2', '01-009', 'SC-1', { derivedFromItemId: 'DRI-1' }),
  ];
  const plan = planNpdWorkRows({ targets, items });
  assert.deepEqual(plan.insert.map((p) => `${p.categoryCode}::${p.scentId}`), ['01-006::SC-2']);
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.blocked, []);
  // รับเรื่องซ้ำ/บันทึกซ้ำโดยไม่เปลี่ยนอะไร = ไม่มีอะไรต้องเขียน (แถวที่เดินอยู่มีสเปกตรงแบบฟอร์มแล้ว)
  const specOf = (c, sc) => npdWorkRowSpec(npdTargetPairs(targets).find((p) => p.key === `${c}::${sc}`));
  const done = planNpdWorkRows({
    targets,
    items: [items[0], { ...items[1], spec: specOf('01-009', 'SC-1') }, row('DRI-3', '01-006', 'SC-2', { spec: specOf('01-006', 'SC-2') })],
  });
  assert.equal(npdWorkRowsEmpty(done), true);
});

test('⭐ เอาสินค้าออกจากแบบฟอร์ม: ถอนแถวที่ยังไม่มีใครแตะ · ส่งสูตร/มีผลลูกค้าแล้ว = ปฏิเสธพร้อมเหตุผล', () => {
  const items = [
    row('DRI-1', '01-009', 'SC-1'),
    row('DRI-2', '01-006', 'SC-2', { readyAt: '2026-09-12', producedFormulaId: 'FML-1', label: 'ก้านหอม · S2' }),
  ];
  const keepSecond = planNpdWorkRows({ targets: [T('01-006', 'SC-2')], items });
  assert.deepEqual(keepSecond.remove.map((r) => r.id), ['DRI-1']);
  assert.equal(npdWorkRowsError(keepSecond), null);

  const dropSent = planNpdWorkRows({ targets: [T('01-009', 'SC-1')], items });
  assert.deepEqual(dropSent.blocked.map((b) => b.row.id), ['DRI-2']);
  assert.match(npdWorkRowsError(dropSent), /"ก้านหอม · S2" ส่งสูตรหรือมีผลลูกค้าแล้ว — เอาออกจากแบบฟอร์ม PDR ไม่ได้/);
  // แถวที่มีรอบแก้ต่อจากมันก็นับว่าเดินแล้ว
  const withChild = planNpdWorkRows({
    targets: [], items: [row('DRI-1', '01-009', 'SC-1'), row('DRI-9', '01-009', 'SC-1', { derivedFromItemId: 'DRI-1' })],
  });
  assert.deepEqual(withChild.blocked.map((b) => b.row.id), ['DRI-1']);
});

test('สเปกย่อของแถวที่ยังไม่ส่งสูตรตามแบบฟอร์ม — แถวที่ส่งแล้วไม่ถูกเขียนทับ', () => {
  const items = [row('DRI-1', '01-009', 'SC-1', { spec: 'เก่า' }), row('DRI-2', '01-006', 'SC-2', { spec: 'เก่า', readyAt: '2026-09-12' })];
  const plan = planNpdWorkRows({ targets: [T('01-009', 'SC-1'), T('01-006', 'SC-2')], items });
  assert.deepEqual(plan.update.map((u) => u.id), ['DRI-1']);
});

test('บรรทัดเล่าในเธรด', () => {
  assert.equal(npdWorkRowsSummary({}), null);
  assert.equal(
    npdWorkRowsSummary({ inserted: [{ label: 'สเปรย์ · S1' }], removed: [{ label: 'ก้านหอม · S2' }] }),
    'รายการงานตามแบบฟอร์ม PDR: เพิ่ม 1 (สเปรย์ · S1) · ถอน 1 (ก้านหอม · S2)',
  );
});

// ── รูปทรงของใบ NPD หลังมีแถวงาน ────────────────────────────────────────────
const npd = (over = {}) => ({
  kind: 'formula_dev', variant: 'npd', status: 'acknowledged', dept: 'RD', title: 'ก', dealId: 'D-1',
  requestedDueDate: '2026-09-30', ...over,
});

test('⭐ ธงรูปทรง: NPD ฝ่าย/ระบบสร้างแถว · ผู้ขอไม่กรอกตาราง', () => {
  assert.equal(requestUsesDeliveredRows(npd()), true);
  assert.equal(requestUsesItems(npd()), false, 'ฟอร์มสร้าง/แก้ต้องไม่มีตารางรายการ');
  assert.equal(requestLineShape(npd()), null);
});

test('⭐ แก้หัวใบ NPD ที่มีแถวงานแล้วต้องผ่าน — แถวที่มี id มาจากฐาน · แถวใหม่จากผู้ขอยังตีกลับ', () => {
  assert.equal(requestShapeError('formula_dev', { ...npd(), items: [row('DRI-1', '01-009', 'SC-1')] }), null);
  assert.match(
    requestShapeError('formula_dev', { ...npd(), items: [{ categoryCode: '01-009', scentId: 'SC-1' }] }),
    /ไม่มีตารางรายการ/,
  );
});

test('⭐ ปิดใบ NPD: แถวค้างปิดไม่ได้ · ครบแล้วปิดได้ · ยังไม่มีแถวต้องยกเลิกแทน', () => {
  assert.match(closeRequestError(npd(), []), /ยกเลิกแทนการปิด/);
  assert.match(closeRequestError(npd(), [row('DRI-1', '01-009', 'SC-1')]), /ยังมีรายการที่ยังเดินไม่จบ/);
  // แถวใหม่งอกตอนใบ "ตอบแล้ว" ⇒ ตราปิดของฝ่ายต้องถูกถอน ใบกลับมาเปิด
  const patch = requestRowsClosurePatch(
    npd({ status: 'answered', answeredAt: '2026-09-12T00:00:00Z' }),
    [row('DRI-1', '01-009', 'SC-1')], '2026-09-13T00:00:00Z',
  );
  assert.equal(patch.answeredAt, null);
  assert.equal(patch.status, 'acknowledged');
});

test('แถวงานของ NPD ลบที่แถวไม่ได้ — ต้องเอาออกจากแบบฟอร์ม (แถวรอบแก้ยังตามกติกาเดิม)', () => {
  const req = npd({ items: [] });
  assert.match(deleteRequestRowError(req, row('DRI-1', '01-009', 'SC-1')), /มาจากแบบฟอร์ม PDR/);
  assert.equal(deleteRequestRowError(req, row('DRI-2', '01-009', 'SC-1', { derivedFromItemId: 'DRI-1' })), null);
  // Standard ไม่ถูกกระทบ
  assert.equal(deleteRequestRowError(npd({ variant: 'standard', items: [] }), row('DRI-3', '01-009', 'SC-1')), null);
});

test('ประโยคตอนกดส่งของ NPD เล่าเป็นแบบฟอร์ม + จำนวนสินค้า (แถวงานยังไม่เกิดจนรับเรื่อง)', () => {
  assert.equal(submitScope(npd({ status: 'draft', targets: [T('01-009', 'SC-1'), T('01-006', 'SC-2')] })), 'แบบฟอร์ม PDR · สินค้า 2 รายการ');
  assert.equal(submitScope(npd({ status: 'draft' })), 'แบบฟอร์ม PDR');
});

// ── รีวิวรอบแรกของ ม-144 ─────────────────────────────────────────────────────
test('⭐ แถวที่มีไฟล์แนบถอนเงียบ ๆ ไม่ได้ — ปฏิเสธพร้อมเหตุผลของตัวเอง (ไม่ใช่ "ส่งสูตรแล้ว")', () => {
  const items = [row('DRI-1', '01-006', 'SC-2', { label: 'ก้านหอม · S2' })];
  const plan = planNpdWorkRows({ targets: [T('02-010', 'SC-2')], items, rowsWithFiles: new Set(['DRI-1']) });
  assert.deepEqual(plan.remove, []);
  assert.match(npdWorkRowsError(plan), /"ก้านหอม · S2" มีไฟล์แนบในรายการงานแล้ว/);
  // ไม่มีไฟล์ = ถอนได้ตามปกติ
  assert.deepEqual(planNpdWorkRows({ targets: [T('02-010', 'SC-2')], items }).remove.map((r) => r.id), ['DRI-1']);
});

test('สเปกย่อตามแบบฟอร์มถึงแถวรอบแก้ที่ RD กำลังทำ — แถวต้นทางที่ส่งแล้วไม่ถูกแตะ', () => {
  const items = [
    row('DRI-1', '01-006', 'SC-2', { readyAt: '2026-09-12', producedFormulaId: 'F1', outcome: 'revise', spec: 'เก่า' }),
    row('DRI-2', '01-006', 'SC-2', { derivedFromItemId: 'DRI-1', spec: 'เก่า' }),
  ];
  const plan = planNpdWorkRows({ targets: [T('01-006', 'SC-2', { sizeValue: 500 })], items });
  assert.deepEqual(plan.update.map((u) => u.id), ['DRI-2']);
  assert.match(plan.update[0].spec, /500 ml/);
});

test('⭐ กลิ่นของคู่ที่จะงอกต้องมีจริงและเป็นของลูกค้าเจ้าของใบ — อ้างเลขสินค้าในแบบฟอร์ม', () => {
  const targets = [T('01-009', 'SC-1'), T('01-009', 'SC-1', { sizeValue: 50 }), T('01-006', 'SC-2')];
  const plan = planNpdWorkRows({ targets, items: [] });
  const scents = [{ id: 'SC-1', code: 'S1', customerId: 'C-1' }, { id: 'SC-2', code: 'S2', customerId: 'C-9' }];
  assert.match(npdWorkRowsScentError(plan, targets, scents, { customerId: 'C-1' }), /สินค้ารายการที่ 3: กลิ่น S2 เป็นของลูกค้ารายอื่นแล้ว/);
  assert.match(npdWorkRowsScentError(plan, targets, scents.slice(0, 1), { customerId: 'C-1' }), /สินค้ารายการที่ 3: ไม่พบกลิ่นนี้/);
  assert.equal(npdWorkRowsScentError(plan, targets, [scents[0], { ...scents[1], customerId: 'C-1' }], { customerId: 'C-1' }), null);
});

test('ตราปิดคิดใหม่เฉพาะหลังรับเรื่อง — ใบรอรับเรื่องต้องไม่ถูกดันเป็น "รับเรื่องแล้ว" จากแถว', () => {
  assert.deepEqual(requestRowsClosurePatch(npd({ status: 'pending' }), [row('DRI-1', '01-009', 'SC-1', { answerStatus: 'done' })], 'x'), {});
  assert.deepEqual(requestRowsClosurePatch(npd({ status: 'draft' }), [row('DRI-1', '01-009', 'SC-1')], 'x'), {});
});

test('ข้อความด่านรูปทรงของหัวข้อที่ไม่มีรูปแบบ ใช้ชื่อหัวข้อ ไม่ใช่ "null"', () => {
  const msg = requestShapeError('scent_dev', {
    title: 'ก', dealId: 'D-1', salesOrderId: 'SO-1', requestedDueDate: '2026-09-30', items: [{ name: 'x' }],
  });
  assert.match(msg, /หัวข้อ "พัฒนากลิ่น" ไม่มีตารางรายการ/);
  assert.doesNotMatch(msg, /null/);
});

test('⭐ บันทึกแบบฟอร์มที่ไม่ได้แตะแถว ถอนตราได้อย่างเดียว — ไม่ทับ "ยังไม่จบ" ของฝ่าย (รีวิวรอบสอง)', () => {
  const settled = [row('DRI-1', '01-009', 'SC-1', { answerStatus: 'declined', outcome: 'rejected', readyAt: 'x' })];
  // ฝ่ายกด "ยังไม่จบ" แล้ว (ตราหลุด · แถวจบครบ) — แก้แค่ชื่อเรื่องต้องไม่ประทับคืน
  const reopened = npd({ status: 'acknowledged', answeredAt: null });
  assert.deepEqual(npdSyncClosurePatch({ request: reopened, rows: settled, nowIso: 'now' }), {});
  // ใบถือตราแต่มีแถวค้าง (หัวใบเขียนไม่สำเร็จหลังงอกแถวรอบก่อน) — ถอนตราเพื่อซ่อม
  const stale = npd({ status: 'answered', answeredAt: 'before' });
  const open = [row('DRI-2', '01-006', 'SC-2')];
  assert.equal(npdSyncClosurePatch({ request: stale, rows: open, nowIso: 'now' }).answeredAt, null);
  // บันทึกที่ถอนแถวค้างตัวสุดท้ายออก = เหตุการณ์ของแถว ประทับตราได้
  assert.equal(npdSyncClosurePatch({ request: reopened, rows: settled, nowIso: 'now', wroteRows: true }).answeredAt, 'now');
});

test('⭐ คู่ในแบบฟอร์มที่ไม่มีแถวงาน = งานค้าง — ตรา/ปิด/ตอบ ไม่ผ่าน จนกว่าบันทึกซ่อม (รีวิวรอบ 4)', () => {
  const settled = [row('DRI-1', '01-009', 'SC-1', { answerStatus: 'declined', outcome: 'rejected', readyAt: 'x' })];
  const targets = [T('01-009', 'SC-1'), T('01-006', 'SC-9')]; // SC-9 เพิ่มในแบบฟอร์มแต่งอกแถวไม่สำเร็จ
  assert.deepEqual(npdUncoveredPairs(npd({ targets }), settled).map((p) => p.key), ['01-006::SC-9']);
  // ใบไม่ใช่ NPD ไม่มีวันนับ (ธงรูปทรงตัดสิน ไม่ใช่ข้อมูล)
  assert.deepEqual(npdUncoveredPairs({ kind: 'formula_dev', variant: 'standard', targets }, settled), []);

  // บันทึกที่งอกไม่สำเร็จ (ไม่มีแถวถูกเขียน) ถอนตราที่ถืออยู่ — คิดจากแบบฟอร์มชุดใหม่
  const answered = npd({ status: 'answered', answeredAt: 'before', targets });
  const patch = npdSyncClosurePatch({ request: answered, rows: settled, nowIso: 'now' });
  assert.equal(patch.answeredAt, null);
  assert.equal(patch.status, 'acknowledged');

  // ก้าวอื่น (ราคา · ผลลูกค้า · ลบแถว) คิดตราใหม่ด้วยตัวเดียวกัน — ต้องไม่ประทับคืน
  const open = npd({ status: 'acknowledged', answeredAt: null, targets });
  assert.deepEqual(requestRowsClosurePatch(open, settled, 'now'), {});
  // ด่านปิดของผู้ขอ + ด่านตอบของฝ่ายบอกทางซ่อม
  assert.match(closeRequestError(open, settled), /ยังไม่มีรายการงาน — .*บันทึกแบบฟอร์มอีกครั้ง/);
  assert.match(npdUncoveredError(open, settled), /1 รายการ/);

  // บันทึกซ่อมงอกแถวได้ ⇒ ครบ ประทับได้
  const repaired = [...settled, row('DRI-9', '01-006', 'SC-9', { answerStatus: 'declined', outcome: 'rejected' })];
  assert.equal(requestRowsClosurePatch(open, repaired, 'now').answeredAt, 'now');
  assert.equal(closeRequestError(npd({ status: 'answered', answeredAt: 'now', targets }), repaired), null);

  // เอาคู่ออกจากแบบฟอร์ม (แถวถอนแล้ว) — ชุดใหม่ไม่มีคู่นั้น ต้องไม่ถูกนับค้าง
  const trimmed = npd({ status: 'answered', answeredAt: 'before', targets: [T('01-009', 'SC-1')] });
  assert.deepEqual(npdSyncClosurePatch({ request: trimmed, rows: settled, nowIso: 'now' }), {});
});

test('⭐ บันทึกที่ไม่เขียนแถวถอนตราผู้ขอด้วย ถ้าตราฝ่ายว่างอยู่แล้ว (รีวิวรอบ 4)', () => {
  const settled = [row('DRI-1', '01-009', 'SC-1', { answerStatus: 'declined', outcome: 'rejected', readyAt: 'x' })];
  // ฝ่ายกด "ยังไม่จบ" แล้วผู้ขอกดปิดฝั่งตัวเอง — จากนั้นเพิ่มสินค้าแต่งอกแถวไม่สำเร็จ
  const halfClosed = npd({
    status: 'acknowledged', answeredAt: null, closedAt: 'c', closedById: 'U-SA', closedByName: 'SA',
    targets: [T('01-009', 'SC-1'), T('01-006', 'SC-9')],
  });
  assert.deepEqual(
    npdSyncClosurePatch({ request: halfClosed, rows: settled, nowIso: 'now' }),
    { closedAt: null, closedById: null, closedByName: null },
  );
});

test('จอข้ามกลิ่นที่ไม่พบในทะเบียนบนจอ (โหลดตอนเปิดหน้า) — บล็อกเฉพาะของลูกค้ารายอื่นที่เห็นชัด', () => {
  const targets = [T('01-009', 'SC-NEW'), T('01-006', 'SC-X')];
  const plan = planNpdWorkRows({ targets, items: [] });
  const scents = [{ id: 'SC-X', code: 'X', customerId: 'CUS-2' }];
  assert.match(npdWorkRowsScentError(plan, targets, scents, { customerId: 'CUS-1' }), /สินค้ารายการที่ 1: ไม่พบกลิ่น/);
  assert.match(
    npdWorkRowsScentError(plan, targets, scents, { customerId: 'CUS-1', skipMissing: true }),
    /สินค้ารายการที่ 2: กลิ่น X เป็นของลูกค้ารายอื่นแล้ว/,
  );
  assert.equal(npdWorkRowsScentError(plan, targets, [], { customerId: 'CUS-1', skipMissing: true }), null);
});

test('⭐ ตราที่ระบบประทับ/ถอนล้างชื่อคนกด "ตอบแล้ว" รอบก่อน (mig 0306 · รีวิวรอบ 3)', () => {
  const settled = [row('DRI-1', '01-009', 'SC-1', { answerStatus: 'declined', outcome: 'rejected', readyAt: 'x' })];
  const open = [row('DRI-2', '01-006', 'SC-2')];
  const manual = npd({ status: 'answered', answeredAt: 'before', answeredById: 'U-RD', answeredByName: 'สมชาย RD' });
  // ถอน (มีงานเพิ่ม) — ชื่อต้องหลุดพร้อมตรา
  assert.deepEqual(
    requestRowsClosurePatch(manual, [...settled, ...open], 'now'),
    { answeredAt: null, answeredById: null, answeredByName: null, status: 'acknowledged' },
  );
  // ประทับอัตโนมัติรอบใหม่ — ไม่มีชื่อคน
  const withdrawnStale = npd({ status: 'acknowledged', answeredAt: null, answeredById: 'U-RD', answeredByName: 'สมชาย RD' });
  assert.deepEqual(
    requestRowsClosurePatch(withdrawnStale, settled, 'now'),
    { answeredAt: 'now', answeredById: null, answeredByName: null, status: 'answered' },
  );
  // ตราไม่เปลี่ยน = ไม่แตะชื่อ (คนกด "ตอบแล้ว" เองยังได้เครดิต)
  assert.deepEqual(requestRowsClosurePatch(manual, settled, 'now'), {});
});

test('⭐ คิว + รางฝ่าย: ใบ NPD แถวครบแต่มีสินค้าไม่มีแถวงาน = งานของฝ่าย ไม่ใช่ "รอปิดเรื่อง" (รีวิวรอบ 5)', () => {
  const settled = [row('DRI-1', '01-009', 'SC-1', { answerStatus: 'declined', outcome: 'rejected', readyAt: 'x' })];
  const base = { dept: 'RD', requesterDept: 'SA', status: 'acknowledged', answeredAt: null, closedAt: null };
  const stuck = npd({ ...base, targets: [T('01-009', 'SC-1'), T('01-006', 'SC-9')] });
  const next = requestNextStep({ ...stuck, items: settled });
  assert.equal(next.owner, 'dept');
  assert.doesNotMatch(next.label, /ปิดเรื่อง/);
  assert.notEqual(requestStageKey({ ...stuck, items: settled }), 'waiting');
  // แถวที่เหลือรอผู้ขอ (ส่งสูตรแล้ว) — สินค้าที่ไม่มีแถวยังเป็นงานฝ่ายก่อน (รีวิวรอบ 6)
  const sentRow = [row('DRI-1', '01-009', 'SC-1', { readyAt: 'x' })];
  assert.equal(requestNextStep({ ...stuck, items: sentRow }).owner, 'dept');
  // ไม่มีสินค้าค้าง (หรือคิวไม่ได้ดึงแถวสินค้ามา) = ป้ายเดิม
  assert.equal(requestNextStep({ ...npd({ ...base, targets: [T('01-009', 'SC-1')] }), items: settled }).label, 'รอปิดเรื่อง');
  assert.equal(requestNextStep({ ...npd({ ...base, targets: undefined }), items: settled }).label, 'รอปิดเรื่อง');
});
