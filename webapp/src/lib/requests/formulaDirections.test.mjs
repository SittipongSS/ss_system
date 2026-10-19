// ── พัฒนาสูตรหลาย direction ต่อกลิ่น (ม-157 · IS-26100002) ──
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDirectionError, directionRowFrom, formulaConfirmPlan, formulaDevRowOrder, notChosenReason,
} from './formulaDirections.js';
import { formulaDeliveryPreview } from './formulaRework.js';

const req = { id: 'REQ-1', status: 'acknowledged', customerId: 'CUS-A' };
const R = (id, over = {}) => ({
  id, requestId: 'REQ-1', lineKind: 'product_dev', label: 'หัวน้ำหอม · PF2810101 HOME RETREAT 01',
  categoryCode: '02-020', scentId: 'SCT-HR', answerStatus: 'pending', ackAt: '2026-09-24', sortOrder: 1, ...over,
});
const F = (id, over = {}) => ({
  id, code: id, name: id, categoryCode: '02-020', scentId: 'SCT-HR', status: 'developing', customerId: 'CUS-A', ...over,
});

// ── สภาพจริงของ RQ-FD-26090194 (19/10/2026) — แถวที่ส่งก่อน ม-157: สูตรรอบแก้ active · ต้นทางเลิกใช้แล้ว ──
const r1 = R('R1', { producedFormulaId: 'P1', producedFormulaAction: 'create', readyAt: '2026-10-05', sentAt: '2026-09-30', outcome: 'revise' });
const rr1 = R('RR1', { derivedFromItemId: 'R1', producedFormulaId: 'P11', producedFormulaAction: 'revise', readyAt: '2026-10-19', sortOrder: 5 });
const legacy = [F('P1', { status: 'archived' }), F('P11', { status: 'active', derivedFromFormulaId: 'P1' })];

test('ส่ง direction เพิ่ม: ได้เฉพาะแถวพัฒนาสูตรที่ส่งแล้ว ยังไม่มีผลลูกค้า และคู่นี้ยังไม่มีใครถูกคอนเฟิร์ม', () => {
  assert.equal(addDirectionError(req, rr1, [r1, rr1]), null);
  assert.match(addDirectionError(req, R('X'), [r1]), /ส่งงานรายการนี้ก่อน/);
  assert.match(addDirectionError(req, r1, [r1, rr1]), /ลูกค้าตอบแล้ว .*รอบแก้/);
  assert.match(addDirectionError(req, { ...rr1, lineKind: 'document' }, []), /เฉพาะรายการพัฒนาสูตร/);
  assert.match(addDirectionError({ ...req, status: 'closed' }, rr1, [rr1]), /ไม่ได้เปิดอยู่/);
  // อีก direction ของคู่นี้ถูกคอนเฟิร์มแล้ว = ปิดทาง
  const confirmed = R('RR2', { directionOfItemId: 'RR1', derivedFromItemId: 'R1', outcome: 'confirmed', readyAt: '2026-10-19' });
  assert.match(addDirectionError(req, rr1, [r1, rr1, confirmed]), /คอนเฟิร์มสูตรของกลิ่นนี้ในใบนี้ไปแล้ว/);
  // แถวที่ถูกปิดเป็น "ไม่ถูกเลือก" ก็ไม่รับเพิ่ม
  assert.match(addDirectionError(req, { ...rr1, answerStatus: 'declined' }, [r1, rr1]), /ลูกค้าตอบแล้ว/);
});

test('⭐ แถว direction เพิ่มยกสายพันธุ์รอบแก้ของแถวแรก (ต้นทางเดียวกัน) และชี้แถวแรกของชุด — ไม่ใช่รอบแก้ของ direction 1', () => {
  const extra = directionRowFrom(rr1, { sortOrder: 9 });
  assert.equal(extra.derivedFromItemId, 'R1');
  assert.equal(extra.directionOfItemId, 'RR1');
  assert.equal(extra.categoryCode, '02-020');
  assert.equal(extra.scentId, 'SCT-HR');
  assert.equal(extra.ackAt, '2026-09-24');
  assert.equal(extra.answerStatus, 'pending');
  assert.equal(extra.readyAt, undefined); // ช่องก้าวผู้เรียกใส่เอง
  // เพิ่มจาก direction 2 = ยังชี้แถวแรกของชุด
  assert.equal(directionRowFrom({ ...extra, id: 'RR2' }).directionOfItemId, 'RR1');
  // รอบแรก: ไม่มีต้นทาง
  assert.equal(directionRowFrom(R('A', { readyAt: '2026-10-19' })).derivedFromItemId, null);
});

test('⭐ ของจริง (RQ-FD-26090194): direction 2 ของรอบแก้ได้สูตรใหม่ชี้ต้นทางเดิม · ตัวที่ใช้งานอยู่ (#1.1) จะถูกแทนตอนคอนเฟิร์ม', () => {
  const extra = { ...directionRowFrom(rr1, { sortOrder: 9 }), id: null };
  const preview = formulaDeliveryPreview({ row: extra, items: [r1, rr1], formulas: legacy, customerId: 'CUS-A' });
  assert.equal(preview.plan.kind, 'create');
  assert.equal(preview.plan.derivedFromFormulaId, 'P1');
  assert.equal(preview.plan.replaces.id, 'P11');
  assert.equal(preview.lockLineage, true);
});

test('⭐ คอนเฟิร์ม direction 2: เลิกใช้ตัวที่ใช้งานอยู่ก่อน แล้วพลิกตัวที่ได้ · ปิด direction 1 ที่ยังค้างเป็น "ไม่ถูกเลือก"', () => {
  const rr2 = R('RR2', {
    directionOfItemId: 'RR1', derivedFromItemId: 'R1', producedFormulaId: 'P12', producedFormulaAction: 'create',
    readyAt: '2026-10-20', sentAt: '2026-10-21', sortOrder: 6,
  });
  const formulas = [...legacy, F('P12', { derivedFromFormulaId: 'P1' })];
  const plan = formulaConfirmPlan({ row: rr2, items: [r1, rr1, rr2], formulas, customerId: 'CUS-A' });
  assert.equal(plan.kind, 'apply');
  assert.equal(plan.activate, true);
  assert.deepEqual(plan.archive.map((f) => f.id), ['P11']);
  assert.deepEqual(plan.close.map((r) => r.id), ['RR1']);
  assert.match(plan.note, /P12 เปลี่ยนเป็น "ใช้งานได้" · P11 เปลี่ยนเป็น "เลิกใช้" · ปิดรายการอื่นของกลิ่นนี้ที่ยังค้าง 1 รายการ/);
  assert.equal(notChosenReason(plan.chosen), 'ลูกค้าเลือก P12 แล้ว');
});

test('⭐ คอนเฟิร์ม direction 1 ที่ส่งก่อน ม-157 (active อยู่แล้ว): ไม่พลิกซ้ำ · เลิกใช้ direction 2 ที่กำลังพัฒนา', () => {
  const rr2 = R('RR2', { directionOfItemId: 'RR1', derivedFromItemId: 'R1', producedFormulaId: 'P12', readyAt: '2026-10-20' });
  const plan = formulaConfirmPlan({
    row: { ...rr1, sentAt: '2026-10-20' }, items: [r1, rr1, rr2], formulas: [...legacy, F('P12')], customerId: 'CUS-A',
  });
  assert.equal(plan.activate, false);
  assert.deepEqual(plan.archive.map((f) => f.id), ['P12']);
  assert.deepEqual(plan.close.map((r) => r.id), ['RR2']);
});

test('รอบแรกสอง direction + รอบแก้ที่ยังไม่ส่ง: คอนเฟิร์มตัวหนึ่ง = ตัวที่ขอแก้ไว้เลิกใช้ และแถวรอบแก้ที่ยังไม่ส่งถูกปิดด้วย', () => {
  const a = R('A', { producedFormulaId: 'FA', readyAt: '2026-10-01', sentAt: '2026-10-02', outcome: 'revise' });
  const b = R('B', { directionOfItemId: 'A', producedFormulaId: 'FB', readyAt: '2026-10-01', sentAt: '2026-10-02' });
  const aRework = R('A2', { derivedFromItemId: 'A', sortOrder: 7 }); // รอ RD ส่ง
  const formulas = [F('FA'), F('FB')];
  const plan = formulaConfirmPlan({ row: b, items: [a, b, aRework], formulas, customerId: 'CUS-A' });
  assert.equal(plan.activate, true);
  assert.deepEqual(plan.archive.map((f) => f.id), ['FA']);
  assert.deepEqual(plan.close.map((r) => r.id), ['A2']);
  // คู่ยังไม่มีตัวใช้งาน = ไม่มีอะไรต้องเลิกก่อนพลิก
  assert.equal(formulaConfirmPlan({ row: b, items: [b], formulas, customerId: 'CUS-A' }).archive.length, 0);
});

test('⭐ ตีกลับก่อนเขียน: คู่นี้คอนเฟิร์มไปแล้ว · ตัวที่จองตัวตนเป็นร่าง · เป็นของลูกค้าอื่น · สูตรของแถวถูกเลิกใช้ไปแล้ว', () => {
  const a = R('A', { producedFormulaId: 'FA', sentAt: '2026-10-02', readyAt: '2026-10-01' });
  const b = R('B', { directionOfItemId: 'A', producedFormulaId: 'FB', sentAt: '2026-10-02', readyAt: '2026-10-01', outcome: 'confirmed' });
  assert.match(formulaConfirmPlan({ row: a, items: [a, b], formulas: [F('FA'), F('FB', { status: 'active' })] }).error,
    /คอนเฟิร์มสูตร FB ของกลิ่นนี้ในใบนี้ไปแล้ว/);
  assert.match(formulaConfirmPlan({ row: a, items: [a], formulas: [F('FA'), F('D', { status: 'draft' })] }).error,
    /D เป็นร่างในทะเบียน/);
  assert.match(formulaConfirmPlan({
    row: a, items: [a], formulas: [F('FA'), F('X', { status: 'active', customerId: 'CUS-B', customerName: 'บริษัท บี' })], customerId: 'CUS-A',
  }).error, /เป็นของ บริษัท บี/);
  assert.match(formulaConfirmPlan({ row: a, items: [a], formulas: [F('FA', { status: 'archived' })] }).error,
    /ถูกเลิกใช้ในทะเบียนไปแล้ว/);
});

test('ไม่ใช่แถวพัฒนาสูตร/ยังไม่มีสูตร = ไม่แตะทะเบียน ไม่ปิดแถวอื่น · สูตรที่ผูกของเดิม (bind) ไม่ถูกเลิกใช้ตาม', () => {
  assert.equal(formulaConfirmPlan({ row: R('A'), items: [], formulas: [] }).kind, 'none');
  assert.equal(formulaConfirmPlan({ row: { ...R('A', { producedFormulaId: 'S' }), lineKind: 'scent_dev' } }).kind, 'none');
  const a = R('A', { producedFormulaId: 'FA', readyAt: '2026-10-01', sentAt: '2026-10-02' });
  const bound = R('Z', { derivedFromItemId: 'Q', producedFormulaId: 'FZ', producedFormulaAction: 'bind', outcome: 'revise' });
  const plan = formulaConfirmPlan({ row: a, items: [a, bound], formulas: [F('FA'), F('FZ', { status: 'developing' })] });
  assert.deepEqual(plan.archive.map((f) => f.id), []);
});

test('⭐ ลำดับตาราง: แถวของกลิ่นเดียวกันอยู่ติดกัน (รอบแรก → รอบแก้ · direction 1 → 2) + ป้าย direction เฉพาะชุดที่มี ≥ 2', () => {
  // ของจริง: HOME RETREAT(1) · WHITE TEA(2) · YOUNG ROSE(3) · รอบแก้ WT(4) · รอบแก้ HR(5) · direction 2 ของรอบแก้ HR(6)
  const hr = R('HR', { sortOrder: 1 });
  const wt = R('WT', { scentId: 'SCT-WT', sortOrder: 2 });
  const yr = R('YR', { scentId: 'SCT-YR', sortOrder: 3 });
  const wtR = R('WTR', { scentId: 'SCT-WT', derivedFromItemId: 'WT', sortOrder: 4 });
  const hrR = R('HRR', { derivedFromItemId: 'HR', sortOrder: 5 });
  const hrR2 = R('HRR2', { derivedFromItemId: 'HR', directionOfItemId: 'HRR', sortOrder: 6 });
  const { order, direction } = formulaDevRowOrder([hrR2, yr, wtR, hr, hrR, wt]);
  const ids = [...order.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id);
  assert.deepEqual(ids, ['HR', 'HRR', 'HRR2', 'WT', 'WTR', 'YR']);
  assert.deepEqual(direction.get('HRR'), { no: 1, total: 2 });
  assert.deepEqual(direction.get('HRR2'), { no: 2, total: 2 });
  assert.equal(direction.get('HR'), undefined);
  assert.equal(direction.get('WT'), undefined);
});
