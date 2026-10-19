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

test('⭐ ม-157: รอบแก้ที่ต้นทางใช้งานอยู่ = สร้างสูตรใหม่ (กำลังพัฒนา) ชี้กลับ · ต้นทาง **ไม่ถูกเก็บตอนส่ง** — เลิกใช้ตอนลูกค้าคอนเฟิร์ม', () => {
  const plan = planFormulaDelivery({ row: reworkRow, items, existing: F('FML-A'), clientDerivedFrom: 'FML-Z' });
  assert.equal(plan.kind, 'create');
  assert.equal(plan.derivedFromFormulaId, 'FML-A');
  assert.equal(plan.replaces.id, 'FML-A');
  // ไม่มีแผน "เก็บตอนส่ง" อีกแล้ว — direction ที่สองต้องยืนได้ข้างตัวแรก
  assert.notEqual(plan.kind, 'revise');
});

test('⭐ ร่างจองตัวตนอยู่ = ตีกลับก่อนเขียน (คอนเฟิร์มทีหลังเลิกใช้ร่างไม่ได้ · ร่างไม่มีรหัสชน CHECK)', () => {
  for (const code of [null, 'X-1']) {
    const parent = planFormulaDelivery({ row: reworkRow, items, existing: F('FML-A', { status: 'draft', code }) });
    assert.equal(parent.kind, 'blocked');
    assert.match(parent.error, /สูตรต้นทาง .*ยังเป็นร่าง.*รับเข้าทะเบียน/);
    const other = planFormulaDelivery({ row: parentRow, items, existing: F('FML-Q', { status: 'draft', code }) });
    assert.equal(other.kind, 'blocked');
    assert.match(other.error, /หมวด × กลิ่นนี้มีสูตร .*ยังเป็นร่าง/);
  }
});

test('รอบแก้ที่คู่นี้ไม่มีตัวใช้งานแล้ว = สร้างใหม่ชี้กลับ · ไม่เชื่อค่าจากฟอร์ม', () => {
  assert.deepEqual(
    planFormulaDelivery({ row: reworkRow, items, existing: null, clientDerivedFrom: 'FML-Z' }),
    { kind: 'create', derivedFromFormulaId: 'FML-A', replaces: null },
  );
});

test('⭐ สูตรที่ใช้งานอยู่ไม่ใช่ต้นทาง (ใบอื่น/คืนด้วยมือ) = ยังสร้างใหม่ได้ · ตัวนั้นถูกแทนตอนคอนเฟิร์ม ไม่ผูกทิ้งฟอร์มอีกต่อไป', () => {
  const rework = planFormulaDelivery({ row: reworkRow, items, existing: F('FML-Q') });
  assert.equal(rework.kind, 'create');
  assert.equal(rework.replaces.id, 'FML-Q');
  const plain = planFormulaDelivery({ row: parentRow, items, existing: F('FML-Q'), clientDerivedFrom: 'FML-Z' });
  assert.deepEqual(plain, { kind: 'create', derivedFromFormulaId: 'FML-Z', replaces: F('FML-Q') });
});

test('⭐ สูตรของคู่นี้เป็นของลูกค้าอื่น (แชร์มา · ม-150): แถวปกติผูก+แชร์ · รอบแก้/direction เพิ่ม ตีกลับ', () => {
  const foreign = F('FML-Q', { customerId: 'CUS-B', customerName: 'บริษัท บี' });
  assert.deepEqual(
    planFormulaDelivery({ row: parentRow, items, existing: foreign, customerId: 'CUS-A' }),
    { kind: 'bind', formulaId: 'FML-Q', warn: true },
  );
  assert.match(formulaBindWarning(foreign), /ใช้สูตร FML-Q ของ บริษัท บี .*ไม่ได้ใช้/);
  for (const row of [reworkRow, { ...parentRow, id: 'DRI-9', directionOfItemId: 'DRI-1' }]) {
    const plan = planFormulaDelivery({ row, items, existing: foreign, customerId: 'CUS-A' });
    assert.equal(plan.kind, 'blocked');
    assert.match(plan.error, /เป็นของ บริษัท บี .*ทับสูตรของลูกค้าอื่นไม่ได้/);
  }
  // ลูกค้าเดียวกัน = สร้างใหม่ตามปกติ
  assert.equal(planFormulaDelivery({ row: reworkRow, items, existing: F('FML-A', { customerId: 'CUS-A' }), customerId: 'CUS-A' }).kind, 'create');
});

test('แถวปกติไม่มีสูตร = สร้างใหม่ ใช้ "แก้มาจากสูตร" ที่ RD เลือกเอง', () => {
  assert.deepEqual(
    planFormulaDelivery({ row: parentRow, items, existing: null, clientDerivedFrom: 'FML-Z' }),
    { kind: 'create', derivedFromFormulaId: 'FML-Z', replaces: null },
  );
});

test('⭐ ประโยคก่อนกดมาจากแผนตัวเดียวกับ server — บอกว่าสูตรเป็น "กำลังพัฒนา" และตัวเดิมเลิกใช้ตอนคอนเฟิร์ม', () => {
  const normal = formulaDeliveryPreview({ row: reworkRow, items, formulas: [F('FML-A')] });
  assert.equal(normal.plan.kind, 'create');
  assert.equal(normal.lockLineage, true);
  assert.match(normal.note, /ได้สูตรใหม่ที่ชี้กลับ FML-A .*"กำลังพัฒนา" จนลูกค้าคอนเฟิร์ม .*FML-A ยังใช้งานอยู่ระหว่างรอ .*เลิกใช้/);
  // direction ที่สองของรอบเดียวกัน: ตัวแรก (กำลังพัฒนา) ไม่จองตัวตน ⇒ ตัวที่ถูกแทนยังเป็นต้นทาง
  const second = formulaDeliveryPreview({
    row: { ...reworkRow, id: 'DRI-3', directionOfItemId: 'DRI-2' }, items,
    formulas: [F('FML-A'), F('FML-B', { status: 'developing', derivedFromFormulaId: 'FML-A' })],
  });
  assert.equal(second.plan.kind, 'create');
  assert.equal(second.plan.replaces.id, 'FML-A');
  // คู่นี้ไม่มีตัวใช้งาน = ไม่มีประโยค "ตัวเดิม"
  const fresh = formulaDeliveryPreview({ row: { ...parentRow, producedFormulaId: null }, items: [], formulas: [] });
  assert.match(fresh.note, /"กำลังพัฒนา" จนลูกค้าคอนเฟิร์ม$/);
});

test('ประโยคบอกรหัสสินค้า FG ที่ผูกตัวที่จะถูกแทน (รูปจริง usedByProducts = [{ id, fgCode }] · หลาย FG ได้ — ม-150)', () => {
  const held = formulaDeliveryPreview({
    row: reworkRow, items, formulas: [F('FML-A', { usedByProducts: [{ id: 'PRD-1', fgCode: 'FG-0123' }] })],
  });
  assert.match(held.note, /สินค้า FG-0123 ผูกสูตรนี้อยู่ — ขอราคา FB ของสินค้านั้น/);
  const many = formulaDeliveryPreview({
    row: reworkRow, items,
    formulas: [F('FML-A', { usedByProducts: ['FG-1', 'FG-2', 'FG-3', 'FG-4'].map((c, i) => ({ id: `P${i}`, fgCode: c })) })],
  });
  assert.match(many.note, /สินค้า FG-1, FG-2, FG-3 \+1 ผูกสูตรนี้อยู่ — ขอราคา FB ของสินค้าเหล่านั้น/);
  const noCode = formulaDeliveryPreview({ row: reworkRow, items, formulas: [F('FML-A', { usedByProducts: [{ id: 'PRD-1', fgCode: null }] })] });
  assert.match(noCode.note, /สินค้า 1 รายการ ผูกสูตรนี้อยู่/);
  const none = formulaDeliveryPreview({ row: reworkRow, items, formulas: [F('FML-A', { usedByProducts: [] })] });
  assert.doesNotMatch(none.note, /ผูกสูตรนี้อยู่/);
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
