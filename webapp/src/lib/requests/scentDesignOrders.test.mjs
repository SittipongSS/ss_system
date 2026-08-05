// ── ด่านใบสั่งขายออกแบบกลิ่น ────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENT_DESIGN_CATEGORIES, categoryCodeFromProductCode, isScentDesignLine,
  lineCategoryCode, scentCountForOrder, scentDesignOrderError,
} from './scentDesignOrders.js';

const approved = { status: 'approved' };
// แถวจริงบน prod (SO-26080001-0)
const realLine = { qty: '25', description: 'FG-321-03-002' };

test('แกะรหัสหมวดจากรหัสสินค้าได้ · อ่านไม่ออกคืน null', () => {
  assert.equal(categoryCodeFromProductCode('FG-321-03-002'), '03-002');
  assert.equal(categoryCodeFromProductCode('03-005'), '03-005');
  assert.equal(categoryCodeFromProductCode('FG-321'), null);
  assert.equal(categoryCodeFromProductCode(''), null);
  assert.equal(categoryCodeFromProductCode(null), null);
});

test('หมวดที่ resolve มาแล้วชนะรหัสที่แกะจากข้อความเสมอ', () => {
  // ⚠️ ทางหลักคือ productId → products · การแกะจากข้อความเป็นทางรอง
  assert.equal(lineCategoryCode({ categoryCode: '03-001', description: 'FG-1-03-002' }), '03-001');
  assert.equal(lineCategoryCode({ fgCode: 'FG-9-03-005' }), '03-005');
  assert.equal(lineCategoryCode({}), null);
});

test('⭐ หมวด 03 ทั้งก้อนใช้ไม่ได้ — ออกแบบแพ็กเกจกับ CI ไม่ใช่งานกลิ่น', () => {
  for (const code of SCENT_DESIGN_CATEGORIES) {
    assert.ok(isScentDesignLine({ categoryCode: code }), `${code} ต้องผ่าน`);
  }
  assert.ok(!isScentDesignLine({ categoryCode: '03-003' }), 'PACKAGE DESIGN ไม่ใช่งานกลิ่น');
  assert.ok(!isScentDesignLine({ categoryCode: '03-004' }), 'CI DESIGN ไม่ใช่งานกลิ่น');
  assert.ok(!isScentDesignLine({ categoryCode: '01-002' }));
});

test('จำนวนกลิ่นมาจาก qty ของบรรทัดออกแบบกลิ่น', () => {
  assert.equal(scentCountForOrder([realLine]), 25);
  // รวมหลายบรรทัดออกแบบกลิ่น · ไม่นับบรรทัดอื่น
  assert.equal(scentCountForOrder([
    { qty: 2, categoryCode: '03-001' },
    { qty: 1, categoryCode: '03-005' },
    { qty: 99, categoryCode: '01-002' },
  ]), 3);
  assert.equal(scentCountForOrder([{ qty: 5, categoryCode: '03-003' }]), null);
  assert.equal(scentCountForOrder([]), null);
});

test('เศษทศนิยมคืน null — ปัดเศษเงียบ ๆ จะได้บล็อกบรีฟผิดจำนวน', () => {
  assert.equal(scentCountForOrder([{ qty: '2.5', categoryCode: '03-002' }]), null);
  assert.equal(scentCountForOrder([{ qty: 0, categoryCode: '03-002' }]), null);
  assert.equal(scentCountForOrder([{ qty: 'สาม', categoryCode: '03-002' }]), null);
});

test('ด่าน: ต้องอนุมัติแล้ว · ต้องมีบรรทัดออกแบบกลิ่น · 1 SO ต่อ 1 คำร้อง', () => {
  assert.equal(scentDesignOrderError(approved, [realLine]), null);
  assert.match(scentDesignOrderError(null, []), /ต้องเลือกใบสั่งขาย/);
  assert.match(scentDesignOrderError({ status: 'draft' }, [realLine]), /ต้องอนุมัติแล้ว/);
  assert.match(
    scentDesignOrderError(approved, [{ qty: 1, categoryCode: '03-003' }]),
    /ไม่มีบรรทัดงานออกแบบกลิ่น/,
  );
  // ⭐ 1 SO : 1 PDR — ข้อความต้องบอกทางออก ไม่ใช่แค่ปฏิเสธ
  const used = scentDesignOrderError(approved, [realLine], { usedByRequestNo: 'SB-26080002' });
  assert.match(used, /SB-26080002/);
  assert.match(used, /ออกใบสั่งขายใหม่/);
  assert.match(
    scentDesignOrderError(approved, [{ qty: '2.5', categoryCode: '03-002' }]),
    /จำนวนเต็มบวก/,
  );
});
