// ── ด่านใบสั่งขายออกแบบกลิ่น ────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENT_DESIGN_CATEGORIES, categoryCodeFromProductCode, isScentDesignLine,
  lineCategoryCode, scentCountForOrder, scentDesignOrderError,
  scentDesignOrderOptions, scentDesignOrderSkipHint, scentDesignOrderSkips,
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
  // ⭐ สามตัวที่เพิ่มตามมติผู้ใช้ 2026-08-10 — เกณฑ์เดียวกัน: RD ต้องปรุงกลิ่นจริง
  // แล้วส่ง direction กลับ ⇒ ใบที่ขายแต่รหัสพวกนี้ต้องเปิดคำร้องพัฒนากลิ่นได้
  for (const [code, name] of [
    ['03-008', 'SCENT TOPPING'], ['03-009', 'EXPERIENCE SCENT DESIGN'], ['03-010', 'แก้ไขกลิ่น'],
  ]) {
    assert.ok(isScentDesignLine({ categoryCode: code }), `${code} ${name} ต้องผ่าน`);
    assert.equal(scentCountForOrder([{ qty: 2, categoryCode: code }]), 2);
  }
  // ⚠️ MOCK UP / WORK SHOP ยังไม่ใช่งานกลิ่น — ไม่ใช่ว่าหมวด 03 ทั้งก้อนผ่านแล้ว
  assert.ok(!isScentDesignLine({ categoryCode: '03-006' }), 'MOCK UP ไม่ใช่งานกลิ่น');
  assert.ok(!isScentDesignLine({ categoryCode: '03-007' }), 'WORK SHOP ไม่ใช่งานกลิ่น');
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

// ── ตัวเลือกบน dropdown ของฟอร์มเปิดคำร้อง ──────────────────────────────
//
// 🐞 ป้ายช่องเขียนว่า "ใบสั่งขายออกแบบกลิ่น" แต่ลิสต์เคยแสดง SO ทุกใบในขอบเขต
// ⇒ เลือกใบขายสินค้าธรรมดาได้ กรอก PDR จนจบ แล้วโดนปฏิเสธตอนกดส่ง
const SO = {
  ok:      { id: 'A', status: 'approved', lines: [{ fgCode: 'FG-1-03-002', qty: 3 }] },
  draft:   { id: 'B', status: 'draft', lines: [{ fgCode: 'FG-1-03-002', qty: 1 }] },
  goods:   { id: 'C', status: 'approved', lines: [{ fgCode: 'FG-1-01-004', qty: 5 }] },
  used:    { id: 'D', status: 'approved', lines: [{ fgCode: 'FG-1-03-001', qty: 2 }], scentRequest: { docNo: 'SB-1' } },
};
const ALL = [SO.ok, SO.draft, SO.goods, SO.used];

test('⭐ ลิสต์เหลือเฉพาะใบที่เปิดบรีฟได้จริง — ด่านเดียวกับ server', () => {
  assert.deepEqual(scentDesignOrderOptions(ALL).map((o) => o.id), ['A']);
  assert.deepEqual(scentDesignOrderOptions([]).map((o) => o.id), []);
});

test('⭐ ค่าที่เลือกไว้แล้วต้องอยู่ในลิสต์เสมอ — ไม่งั้นหายเงียบจากช่อง', () => {
  // ใบที่เพิ่งถูกคนอื่นเปิดคำร้องตัดหน้า หรือมาทางลิงก์ ?salesOrderId=
  assert.deepEqual(scentDesignOrderOptions(ALL, { keepId: 'D' }).map((o) => o.id), ['A', 'D']);
  // keepId ที่ไม่มีในลิสต์ไม่ทำให้อะไรงอกขึ้นมา
  assert.deepEqual(scentDesignOrderOptions(ALL, { keepId: 'ไม่มีจริง' }).map((o) => o.id), ['A']);
});

test('⭐ นับเหตุผลที่ซ่อน — ใบหนึ่งนับข้อแรกที่ติดเท่านั้น', () => {
  const skips = scentDesignOrderSkips(ALL);
  assert.deepEqual(skips, { notApproved: 1, notScentDesign: 1, used: 1, total: 3 });
  // ผลรวมรายเหตุผลต้องไม่เกินจำนวนใบที่ซ่อนจริง
  assert.equal(skips.notApproved + skips.notScentDesign + skips.used, skips.total);
  assert.deepEqual(scentDesignOrderSkips([SO.ok]), { notApproved: 0, notScentDesign: 0, used: 0, total: 0 });
});

test('ข้อความบอกว่าซ่อนอะไรไปเพราะอะไร — ไม่ซ่อนอะไรเลยคืนค่าว่าง', () => {
  assert.equal(scentDesignOrderSkipHint(scentDesignOrderSkips([SO.ok])), '');
  const hint = scentDesignOrderSkipHint(scentDesignOrderSkips(ALL));
  assert.match(hint, /ซ่อนไว้ 3 ใบ/);
  assert.match(hint, /ยังไม่อนุมัติ 1 ใบ/);
  assert.match(hint, /ไม่ใช่งานออกแบบกลิ่น 1 ใบ/);
  assert.match(hint, /เปิดคำร้องไปแล้ว 1 ใบ/);
});

test('⚠️ ใบร่างที่ยังไม่มีเลขที่ ต้องนับว่าใช้ไปแล้วเหมือนกัน', () => {
  // guard 0219 ห้ามเปิดซ้อนโดยไม่สนว่าใบเดิมออกเลขที่หรือยัง ⇒ ลิสต์ต้องกันด้วย
  const draftRequest = { id: 'E', status: 'approved', lines: [{ fgCode: 'FG-1-03-002', qty: 1 }], scentRequest: { id: 'REQ-9' } };
  assert.deepEqual(scentDesignOrderOptions([draftRequest]).map((o) => o.id), []);
  assert.equal(scentDesignOrderSkips([draftRequest]).used, 1);
});
