import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachRegistryLinks, registryIdsFromItems, registryRenameBody,
} from './registryLinks.js';

test('เก็บ id ครบทั้งกลิ่นที่เกิดจากแถวและกลิ่นที่แถวอ้างถึง', () => {
  const { scentIds, formulaIds } = registryIdsFromItems([
    { producedScentId: 'SC-1' },
    { scentId: 'SC-2', producedFormulaId: 'FM-1' },
    { producedScentId: 'SC-1' },   // ซ้ำ = ยิง query ครั้งเดียว
    null,
  ]);
  assert.deepEqual(scentIds, ['SC-1', 'SC-2']);
  assert.deepEqual(formulaIds, ['FM-1']);
});

test('แถวได้ค่าสดจากทะเบียน · แถวที่ไม่มีลิงก์ได้ null ไม่ใช่ค่าของแถวอื่น', () => {
  const rows = attachRegistryLinks(
    [
      { id: 'a', producedScentId: 'SC-1', label: 'ชื่อตอนส่ง' },
      { id: 'b', label: 'แถวเก่าที่ไม่เคยผูกทะเบียน' },
    ],
    { scents: [{ id: 'SC-1', code: 'PF-9', name: 'VANILLA MK2', status: 'active' }] },
  );
  assert.deepEqual(rows[0].refScent, { id: 'SC-1', code: 'PF-9', name: 'VANILLA MK2', status: 'active' });
  assert.equal(rows[0].label, 'ชื่อตอนส่ง', 'label เดิมต้องอยู่ครบ — เป็นหลักฐานว่าตอนนั้นส่งอะไร');
  assert.equal(rows[1].refScent, null);
  assert.equal(rows[1].refFormula, null);
});

test('กลิ่นที่แถวขอ (scentId) ใช้ได้เมื่อแถวยังไม่ผลิตกลิ่นของตัวเอง', () => {
  const [row] = attachRegistryLinks(
    [{ id: 'a', scentId: 'SC-2', producedFormulaId: 'FM-1' }],
    {
      scents: [{ id: 'SC-2', code: 'PF-2', name: 'AMBER', status: 'active' }],
      formulas: [{ id: 'FM-1', code: 'FR-77', name: 'ครีมทามือ · AMBER', status: 'active' }],
    },
  );
  assert.equal(row.refScent.code, 'PF-2');
  assert.equal(row.refFormula.code, 'FR-77');
});

test('ประวัติเขียนเฉพาะตอนชื่อ/รหัสเปลี่ยน และต้องมีค่าเดิมเสมอ', () => {
  assert.equal(
    registryRenameBody('scent', { code: 'PF-1', name: 'A' }, { code: 'PF-2', name: 'A' }),
    'แก้ทะเบียนกลิ่น — รหัส PF-1 → PF-2',
  );
  assert.equal(
    registryRenameBody('formula', { code: 'FR-1', name: 'A' }, { code: 'FR-1', name: 'B' }),
    'แก้ทะเบียนสูตร — ชื่อ A → B',
  );
  // แก้หมายเหตุ/ชื่อที่ลูกค้าเรียก = ไม่ต้องไปกวนใบที่ผูกอยู่
  assert.equal(registryRenameBody('scent', { code: 'PF-1', name: 'A' }, { code: 'PF-1', name: 'A' }), null);
});
