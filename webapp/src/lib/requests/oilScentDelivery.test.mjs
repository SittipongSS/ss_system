// ── พัฒนาสูตรหมวดหัวน้ำหอม (02-020) ส่งแล้วได้กลิ่น (ม-166 · 23/11/2026) ──
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isOilScentRow, oilPairScentIds, oilReworkParentScentId, oilScentConfirmPlan, oilScentDeliveryPreview,
  planOilScentDelivery,
} from './oilScentDelivery.js';

const R = (id, over = {}) => ({
  id, requestId: 'REQ-1', lineKind: 'product_dev', label: 'หัวน้ำหอม · PF859010103 THE MOMENT OF TEA TIME #3',
  categoryCode: '02-020', scentId: 'SCT-3', answerStatus: 'pending', ackAt: '2026-09-10', sortOrder: 1, ...over,
});
const S = (id, over = {}) => ({ id, code: id, name: id, status: 'developing', customerId: 'CUS-A', ...over });
const parent = S('SCT-3', { code: 'PF859010103', name: 'THE MOMENT OF TEA TIME #3', status: 'developing' });

test('แถวไหนเดินทางกลิ่น: พัฒนาสูตร 02-020 ที่ยังไม่มีสูตร · แถวที่ส่งเป็นสูตรไปแล้ว (ก่อน ม-166) เดินทางเดิม', () => {
  assert.equal(isOilScentRow(R('A')), true);
  assert.equal(isOilScentRow(R('A', { producedScentId: 'SCT-REV1' })), true);
  assert.equal(isOilScentRow(R('A', { producedFormulaId: 'FML-OLD' })), false);
  assert.equal(isOilScentRow(R('A', { categoryCode: '01-002' })), false);
  assert.equal(isOilScentRow({ ...R('A'), lineKind: 'scent_dev' }), false);
});

test('แผนส่ง: รหัสใหม่ = กลิ่นลูกชี้กลับกลิ่นที่ขอ · รหัสเดียวกับกลิ่นที่ขอ = ผูกกลิ่นเดิม (MARIGOLD)', () => {
  assert.deepEqual(
    planOilScentDelivery({ row: R('A'), requested: parent, code: 'PF85901010301' }),
    { kind: 'create', derivedFromScentId: 'SCT-3' },
  );
  assert.deepEqual(
    planOilScentDelivery({ row: R('A'), requested: parent, code: ' pf859010103 ' }),
    { kind: 'bind', scentId: 'SCT-3' },
  );
  assert.equal(planOilScentDelivery({ row: R('A', { scentId: null }), code: 'X' }).kind, 'blocked');
});

test('รอบแก้: ชี้กลิ่นที่รอบก่อนส่ง · ต้นทางส่งเป็นสูตร (ข้อมูลเก่า) ถอยไปกลิ่นที่ขอ · ใช้รหัสกลิ่นที่ขอไม่ได้', () => {
  const r1 = R('R1', { producedScentId: 'SCT-REV1', readyAt: '2026-09-11', outcome: 'revise' });
  const rr = R('RR', { derivedFromItemId: 'R1', sortOrder: 2 });
  assert.equal(oilReworkParentScentId(rr, [r1, rr]), 'SCT-REV1');
  assert.deepEqual(planOilScentDelivery({ row: rr, items: [r1, rr], requested: parent, code: 'PF8590101030101' }),
    { kind: 'create', derivedFromScentId: 'SCT-REV1' });
  const legacy = R('L1', { producedFormulaId: 'FML-OLD', outcome: 'revise' });
  const rrLegacy = R('RR', { derivedFromItemId: 'L1' });
  assert.equal(oilReworkParentScentId(rrLegacy, [legacy, rrLegacy]), null);
  assert.equal(planOilScentDelivery({ row: rrLegacy, items: [legacy], requested: parent, code: 'NEW' }).derivedFromScentId, 'SCT-3');
  assert.match(planOilScentDelivery({ row: rr, items: [r1], requested: parent, code: 'PF859010103' }).error, /รอบแก้ต้องเป็นกลิ่นตัวใหม่/);
  assert.match(planOilScentDelivery({ row: R('D', { directionOfItemId: 'R1' }), requested: parent, code: 'PF859010103' }).error,
    /direction เพิ่มต้องเป็นกลิ่นตัวใหม่/);
});

test('ประโยคก่อนกด: บอกว่าได้กลิ่นใหม่ แก้มาจากตัวไหน และวิธีส่งกลิ่นเดิม', () => {
  const p = oilScentDeliveryPreview({ row: R('A'), scents: [parent], code: 'PF85901010301' });
  assert.equal(p.plan.kind, 'create');
  assert.equal(p.parentId, 'SCT-3');
  assert.match(p.note, /ได้กลิ่นใหม่ในทะเบียนกลิ่น .*แก้มาจาก PF859010103 .*ราคา F ลงที่กลิ่นใหม่/);
  assert.match(p.note, /ใส่รหัส PF859010103/);
  const bind = oilScentDeliveryPreview({ row: R('A'), scents: [parent], code: 'PF859010103' });
  assert.equal(bind.parentId, null);
  assert.match(bind.note, /ผูกรายการกับกลิ่น PF859010103 เดิม/);
});

test('คอนเฟิร์ม: กลิ่นลูกตัวอื่นที่ใบนี้สร้างเลิกใช้ · แถวค้างปิด · กลิ่นแม่กับตัวที่ผูกของเดิมไม่ถูกแตะ', () => {
  const d1 = R('D1', { producedScentId: 'SCT-A', producedFormulaAction: 'create', readyAt: '2026-10-14' });
  const d2 = R('D2', { producedScentId: 'SCT-B', producedFormulaAction: 'create', readyAt: '2026-10-14', directionOfItemId: 'D1' });
  const bound = R('D3', { producedScentId: 'SCT-3', producedFormulaAction: 'bind', readyAt: '2026-10-14', directionOfItemId: 'D1' });
  const items = [d1, d2, bound];
  const scents = [S('SCT-A'), S('SCT-B'), parent];
  const plan = oilScentConfirmPlan({ row: d1, items, scents, customerId: 'CUS-A' });
  assert.equal(plan.kind, 'apply');
  assert.equal(plan.registry, 'scent');
  assert.deepEqual(plan.archive.map((s) => s.id), ['SCT-B']);
  assert.deepEqual(plan.close.map((i) => i.id), ['D2', 'D3']);
  assert.match(plan.note, /SCT-A เปลี่ยนเป็น "ใช้งานได้" · SCT-B เปลี่ยนเป็น "เลิกใช้" · ปิดรายการอื่น/);
  assert.deepEqual(oilPairScentIds(d1, items).sort(), ['SCT-3', 'SCT-A', 'SCT-B']);
});

test('คอนเฟิร์ม: ตีกลับเมื่อกลิ่นถูกเลิกใช้ / คู่นี้คอนเฟิร์มไปแล้ว · แถวสูตรเดิมไม่ใช่เรื่องของแผนนี้', () => {
  const d1 = R('D1', { producedScentId: 'SCT-A', readyAt: '2026-10-14' });
  assert.match(oilScentConfirmPlan({ row: d1, items: [d1], scents: [S('SCT-A', { status: 'archived' })] }).error, /ถูกเลิกใช้/);
  const done = R('D2', { producedScentId: 'SCT-B', outcome: 'confirmed', readyAt: '2026-10-14' });
  assert.match(oilScentConfirmPlan({ row: d1, items: [d1, done], scents: [S('SCT-A'), S('SCT-B')] }).error, /คอนเฟิร์มกลิ่น SCT-B/);
  assert.equal(oilScentConfirmPlan({ row: R('F', { producedFormulaId: 'FML-1', producedScentId: 'SCT-A' }), scents: [S('SCT-A')] }).kind, 'none');
  assert.equal(oilScentConfirmPlan({ row: R('N'), scents: [] }).kind, 'none');
});
