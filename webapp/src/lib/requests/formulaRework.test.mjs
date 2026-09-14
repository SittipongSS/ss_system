// ── รอบแก้ของพัฒนาสูตร = สูตรใหม่ที่ชี้กลับสูตรเดิม (ม-147) ──
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formulaActionFor, formulaBindWarning, formulaDeliveryPreview, planFormulaDelivery, reworkParentFormulaId,
  reworkUndoDecision,
} from './formulaRework.js';

const parentRow = { id: 'DRI-1', requestId: 'REQ-1', lineKind: 'product_dev', categoryCode: '01-009', scentId: 'SC-1', producedFormulaId: 'FML-A', outcome: 'revise' };
const reworkRow = { id: 'DRI-2', requestId: 'REQ-1', lineKind: 'product_dev', categoryCode: '01-009', scentId: 'SC-1', derivedFromItemId: 'DRI-1' };
const items = [parentRow, reworkRow];
const F = (id, over = {}) => ({ id, code: id, name: id, categoryCode: '01-009', scentId: 'SC-1', status: 'active', ...over });

test('สูตรต้นทางของรอบแก้มาจากแถวต้นทาง · แถวปกติ/ข้อมูลเก่าไม่มี', () => {
  assert.equal(reworkParentFormulaId(reworkRow, items), 'FML-A');
  assert.equal(reworkParentFormulaId(parentRow, items), null);
  assert.equal(reworkParentFormulaId({ ...reworkRow, derivedFromItemId: 'DRI-X' }, items), null);
});

test('⭐ รอบแก้ที่เจอสูตรต้นทางใช้งานอยู่ = เก็บสูตรเดิม แล้วสร้างสูตรใหม่ชี้กลับ (ไม่ผูกเข้าสูตรเดิมเงียบ ๆ)', () => {
  for (const status of ['active', 'developing']) {
    const plan = planFormulaDelivery({ row: reworkRow, items, existing: F('FML-A', { status }), clientDerivedFrom: 'FML-Z' });
    assert.deepEqual(plan, { kind: 'revise', derivedFromFormulaId: 'FML-A', archiveId: 'FML-A' });
  }
});

test('⭐ ต้นทางยังเป็นร่าง = ตีกลับก่อนเขียน (เก็บร่างไม่ได้ · ร่างไม่มีรหัสชน CHECK)', () => {
  for (const code of [null, 'X-1']) {
    const plan = planFormulaDelivery({ row: reworkRow, items, existing: F('FML-A', { status: 'draft', code }) });
    assert.equal(plan.kind, 'blocked');
    assert.match(plan.error, /ยังเป็นร่าง.*รับเข้าทะเบียน/);
  }
});

test('รอบแก้ที่สูตรต้นทางถูกเลิกใช้ไปแล้ว = สร้างใหม่ชี้กลับ · ไม่เชื่อค่าจากฟอร์ม', () => {
  assert.deepEqual(
    planFormulaDelivery({ row: reworkRow, items, existing: null, clientDerivedFrom: 'FML-Z' }),
    { kind: 'create', derivedFromFormulaId: 'FML-A' },
  );
});

test('ส่งซ้ำหลังรอบก่อนสร้างสูตรได้แต่เขียนรายการไม่ได้ (สูตรกำพร้า) = ผูกเงียบ ไม่เก็บอะไรเพิ่ม', () => {
  assert.deepEqual(
    planFormulaDelivery({ row: reworkRow, items, existing: F('FML-B', { derivedFromFormulaId: 'FML-A', sourceRequest: null }) }),
    { kind: 'bind', formulaId: 'FML-B', warn: false },
  );
  // ใบนี้ถือสูตรนั้นอยู่เอง = เงียบเหมือนกัน
  assert.equal(planFormulaDelivery({
    row: reworkRow, items, existing: F('FML-B', { derivedFromFormulaId: 'FML-A', sourceRequest: { id: 'REQ-1' } }),
  }).warn, false);
});

test('⭐ รอบแก้ของต้นทางเดียวกันแต่ใบอื่นทำไว้ = ผูกพร้อมคำเตือน ไม่เงียบ', () => {
  assert.deepEqual(
    planFormulaDelivery({
      row: reworkRow, items, existing: F('FML-B', { derivedFromFormulaId: 'FML-A', sourceRequest: { id: 'REQ-9' } }),
    }),
    { kind: 'bind', formulaId: 'FML-B', warn: true },
  );
});

test('สูตรอื่นใช้งานอยู่ (ไม่ใช่ต้นทาง) = ผูกพร้อมคำเตือน ไม่เก็บสูตรของใครทิ้ง', () => {
  assert.deepEqual(
    planFormulaDelivery({ row: reworkRow, items, existing: F('FML-Q') }),
    { kind: 'bind', formulaId: 'FML-Q', warn: true },
  );
  // แถวปกติที่คู่นี้มีสูตรแล้ว — เดิมเงียบ ตอนนี้เตือน
  assert.deepEqual(
    planFormulaDelivery({ row: parentRow, items, existing: F('FML-Q') }),
    { kind: 'bind', formulaId: 'FML-Q', warn: true },
  );
  assert.match(formulaBindWarning({ code: 'F-001' }), /มีสูตร F-001 .*ไม่ได้ใช้/);
});

test('แถวปกติไม่มีสูตร = สร้างใหม่ ใช้ "แก้มาจากสูตร" ที่ RD เลือกเอง', () => {
  assert.deepEqual(
    planFormulaDelivery({ row: parentRow, items, existing: null, clientDerivedFrom: 'FML-Z' }),
    { kind: 'create', derivedFromFormulaId: 'FML-Z' },
  );
});

test('⭐ ประโยคก่อนกดมาจากแผนตัวเดียวกับ server — หลังคืนสูตรเดิมด้วยมือไม่สัญญาว่าจะได้สูตรใหม่', () => {
  // ปกติ: ต้นทางใช้งานอยู่ = รอบแก้ + ล็อกต้นทาง
  const normal = formulaDeliveryPreview({ row: reworkRow, items, formulas: [F('FML-A')] });
  assert.equal(normal.plan.kind, 'revise');
  assert.equal(normal.lockLineage, true);
  assert.match(normal.note, /ได้สูตรใหม่ที่ชี้กลับ FML-A .*เลิกใช้/);
  // คืนสูตรเดิม F0 ด้วยมือ (ต้นทางของรอบนี้ FML-A เลิกใช้) — server จะผูก F0 ⇒ จอต้องเตือน ไม่ล็อก
  const reverted = formulaDeliveryPreview({
    row: reworkRow, items, formulas: [F('FML-A', { status: 'archived' }), F('FML-0')],
  });
  assert.equal(reverted.plan.kind, 'bind');
  assert.equal(reverted.lockLineage, false);
  assert.match(reverted.note, /มีสูตร FML-0 .*ไม่ได้ใช้/);
  // แถวปกติไม่มีสูตร = ไม่มีประโยคพิเศษ
  assert.equal(formulaDeliveryPreview({ row: { ...parentRow, producedFormulaId: null }, items: [], formulas: [] }).note, null);
});

test('ประโยครอบแก้บอกรหัสสินค้า FG ที่ผูกสูตรต้นทาง (รูปจริงของ usedByProduct = { id, fgCode })', () => {
  const held = formulaDeliveryPreview({
    row: reworkRow, items, formulas: [F('FML-A', { usedByProduct: { id: 'PRD-1', fgCode: 'FG-0123' } })],
  });
  assert.equal(held.plan.kind, 'revise');
  assert.match(held.note, /สินค้า FG-0123 ผูกสูตรนี้อยู่/);
  const noCode = formulaDeliveryPreview({ row: reworkRow, items, formulas: [F('FML-A', { usedByProduct: { id: 'PRD-1', fgCode: null } })] });
  assert.doesNotMatch(noCode.note, /สินค้า {2}/);
});

test('⭐ ลบรายการรอบแก้: ถอยเฉพาะแถวที่บันทึกว่าการส่งคือ revise — สภาพทะเบียนอย่างเดียวไม่พอ (mig 0358)', () => {
  const produced = F('FML-B', { derivedFromFormulaId: 'FML-A' });
  const parent = F('FML-A', { status: 'archived' });
  const revised = { ...reworkRow, producedFormulaId: 'FML-B', producedFormulaAction: 'revise' };
  assert.deepEqual(reworkUndoDecision({ row: revised, produced, parent }), { kind: 'undo' });
  // แถวที่แค่ผูก (อีกใบทำรอบแก้ไว้) / แถวเก่าไม่มีบันทึก / แผนสร้าง (ต้นทางถูกเลิกใช้ด้วยมือก่อนส่ง) = ลบตามเดิม ไม่แตะทะเบียน
  for (const producedFormulaAction of ['bind', null, 'create']) {
    assert.deepEqual(reworkUndoDecision({ row: { ...revised, producedFormulaAction }, produced, parent }), { kind: 'none' });
  }
  // คืนสูตรเดิมไปแล้วด้วยมือ = การส่งไม่มีผลแล้ว
  assert.deepEqual(reworkUndoDecision({ row: revised, produced, parent: { ...parent, status: 'active' } }), { kind: 'none' });
});

test('⭐ สูตรรอบแก้ถูกใช้ต่อแล้ว = ตีกลับก่อนลบ บอกว่าใช้ที่ไหน (สินค้า/สายพันธุ์เป็น SET NULL — ลบแล้วหลุดเงียบ)', () => {
  const produced = F('FML-B', { derivedFromFormulaId: 'FML-A' });
  const parent = F('FML-A', { status: 'archived' });
  const revised = { ...reworkRow, producedFormulaId: 'FML-B', producedFormulaAction: 'revise' };
  const blocked = reworkUndoDecision({ row: revised, produced, parent, otherRefs: 1, productCount: 1, childCount: 2 });
  assert.equal(blocked.kind, 'blocked');
  assert.match(blocked.error, /ถูกอ้างในคำร้อง\/ราคา · มีสินค้าผูก · มีสูตรที่แก้ต่อจากมัน/);
  assert.equal(reworkUndoDecision({ row: revised, produced, parent, childCount: 1 }).kind, 'blocked');
});

test('⭐ ส่งซ้ำหลังเขียนแถวล้ม: เจตนา revise ที่ประกาศไว้ต้องไม่ถูกทับเป็น bind/create — ไม่งั้นลบรายการถอยไม่ได้', () => {
  const intent = { ...reworkRow, producedFormulaAction: 'revise' };
  // สูตรกำพร้าของตัวเอง = ผูกเงียบ ⇒ ยังเป็น revise
  assert.equal(formulaActionFor({ plan: { kind: 'bind', formulaId: 'FML-B', warn: false }, row: intent, items }), 'revise');
  // สร้างล้มและคืนต้นทางไม่สำเร็จ (ต้นทางค้างเลิกใช้จากรอบก่อนของแถวนี้) = สร้างใหม่ชี้ต้นทาง ⇒ ยังเป็น revise
  assert.equal(formulaActionFor({ plan: { kind: 'create', derivedFromFormulaId: 'FML-A' }, row: intent, items }), 'revise');
  // ผูกพร้อมคำเตือน (สูตรของคนอื่น) = bind
  assert.equal(formulaActionFor({ plan: { kind: 'bind', formulaId: 'FML-Q', warn: true }, row: intent, items }), 'bind');
  // ไม่มีเจตนาจากรอบก่อน = ตามแผน
  assert.equal(formulaActionFor({ plan: { kind: 'create', derivedFromFormulaId: 'FML-A' }, row: reworkRow, items }), 'create');
  assert.equal(formulaActionFor({ plan: { kind: 'revise', archiveId: 'FML-A' }, row: reworkRow, items }), 'revise');
});
