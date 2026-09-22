// ม-148 · ข้อที่รีวิวหลายมุมรอบแรกจับได้ (2026-09-22) — ล็อกไว้ไม่ให้กลับมา
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addendumFormulaIds } from '../sales/addendumRequests.js';
import { pickStampedMaterial } from '../materialPrices.js';
import { deleteFormulaError, formulaDateError } from '../master/formulas.js';
import { deleteScentError } from '../master/scents.js';
import { normalizeDeliveryRows } from './delivery.js';
import { briefBoard } from './briefBoard.js';
import { followUpRowFrom } from './hops.js';

const read = (rel) => readFileSync(rel, 'utf8');

test('บันทึกเพิ่มเติมสัญญา: สูตรเฉพาะ direction ที่ลูกค้าคอนเฟิร์ม (ไม่เอาตัวที่ปฏิเสธ/ถูกรอบแก้แทน)', () => {
  const items = [
    { producedFormulaId: 'F-rejected', outcome: 'rejected' },
    { producedFormulaId: 'F-round1', outcome: 'revise' },
    { producedFormulaId: 'F-round2', outcome: 'confirmed' },
    { producedFormulaId: 'F-ok', outcome: 'confirmed' },
    { producedFormulaId: 'F-ok', outcome: 'confirmed' },
    { producedFormulaId: null, outcome: 'confirmed' }, // ส่งเป็นหัวน้ำหอม — ไม่มีสูตร
    { producedFormulaId: 'F-pending', outcome: null },
  ];
  assert.deepEqual(addendumFormulaIds(items), ['F-round2', 'F-ok']);
  // ตัวนับของตัวเลือกกับ POST ต้องถามตัวเดียวกัน
  assert.match(read('src/app/api/sales-planning/contracts/[id]/addenda/route.js'), /addendumFormulaIds\(items/);
  assert.match(read('src/lib/sales/addendumRequests.js'), /addendumFormulaIds\(\(items/);
});

test('วัสดุสองตัวชี้แถวเดียวกัน: ตัวเขียนกับตัวแสดงเลือกตัวเดียวกัน (ชื่อตรงก่อน · แล้วล่าสุด)', () => {
  const mats = [
    { id: 'OLD', kind: 'RM_F', scentId: 'S1', label: 'ชื่อเก่า', updatedAt: '2026-09-01' },
    { id: 'NEW', kind: 'RM_F', scentId: 'S1', label: 'ชื่อใหม่', updatedAt: '2026-08-01' },
    { id: 'B', kind: 'RM_B', formulaId: 'F1', label: 'x' },
    { id: 'FB', kind: 'RM_FB', formulaId: 'F1', label: 'x' },
  ];
  const pick = (o) => pickStampedMaterial(mats, o)?.id ?? null;
  assert.equal(pick({ stampColumn: 'scentId', id: 'S1', kind: 'RM_F', label: 'ชื่อใหม่' }), 'NEW');
  assert.equal(pick({ stampColumn: 'scentId', id: 'S1', kind: 'RM_F', label: 'ไม่ตรงสักตัว' }), 'OLD');
  // B กับ FB ของสูตรเดียวกันแยกด้วยชนิด
  assert.equal(pick({ stampColumn: 'formulaId', id: 'F1', kind: 'RM_B' }), 'B');
  assert.equal(pick({ stampColumn: 'formulaId', id: 'F1', kind: 'RM_FB' }), 'FB');
  assert.equal(pick({ stampColumn: 'formulaId', id: 'F9', kind: 'RM_FB' }), null);
  assert.match(read('src/lib/master/scentFormulaAdmin.js'), /pickStampedMaterial\(materials/);
  assert.match(read('src/lib/materialPricesAdmin.js'), /pickStampedMaterial\(candidates/);
});

test('ด่านลบนับของที่ชี้ด้วย SET NULL — สูตรที่สินค้าผูก/มีสูตรแก้ต่อ · กลิ่นที่มีสูตรใช้', () => {
  const dev = { status: 'developing' };
  assert.equal(deleteFormulaError(dev, {}), null);
  assert.match(deleteFormulaError(dev, { productCount: 1 }), /สินค้า 1 รายการ/);
  assert.match(deleteFormulaError(dev, { childCount: 2 }), /สูตร 2 ตัวแก้ต่อ/);
  assert.equal(deleteScentError(dev, {}), null);
  assert.match(deleteScentError(dev, { formulaCount: 1 }), /มีสูตร 1 ตัวใช้กลิ่นนี้/);
  assert.match(deleteScentError(dev, { productCount: 3 }), /สินค้า 3 รายการ/);
});

test('ลบรายการในคำร้อง: ใช้ด่านเดียวกับหน้าทะเบียน · อ่านพังหยุด · เก็บตัวแรกแล้วหยุดก่อนถึงกลิ่น', () => {
  const src = read('src/app/api/sa/requests/[id]/items/[itemId]/route.js');
  const loop = src.slice(src.indexOf('for (const [n, own] of owned.entries())'));
  assert.match(loop, /countRegistryDependents\(supabase, own\.kind, own\.id\)/);
  assert.match(loop, /deleteFormulaError\(entity/);
  assert.match(loop, /deleteScentError\(entity/);
  assert.match(loop, /if \(readError\) throw readError;/);
  assert.match(loop, /if \(blocked\) \{[\s\S]*?break;/);
  // แถวถูกลบแล้ว ⇒ ห้ามโยนออกนอกลูป: ทุกขั้นอยู่ใน try และ catch = เก็บไว้ + หยุด
  assert.match(loop, /\} catch \(e\) \{[\s\S]*?keep\(n, text\);[\s\S]*?registryWarning = [\s\S]*?break;/);
  // ของที่ลบตามแถวต้องมาจากแถวตอนลบจริง + มี audit ให้กู้คืน
  assert.match(src, /registryOwnedByRow\(\{ \.\.\.row, \.\.\.\(deletedRows\?\.\[0\] \|\| \{\}\) \}\)/);
  assert.match(loop, /recordAudit\(\{[\s\S]*?action: 'delete', entityType: own\.kind/);
  // หน้าทะเบียนสูตรนับสูตรที่แก้ต่อด้วย
  assert.match(read('src/app/api/master/formulas/[id]/route.js'), /countRegistryDependents\(supabase, 'formula', id\)/);
  // หน้าทะเบียนกลิ่นนับสูตร/สินค้าด้วย
  assert.match(read('src/app/api/master/scents/[id]/route.js'), /countRegistryDependents\(supabase, 'scent', id\)/);
});

test('ส่งงาน: ย้อนลบสูตร (ด้วยกลิ่น) ก่อนกลิ่น · ลบสูตรไม่ได้ = ข้ามกลิ่น · เติมรอบแก้ต้องโดนแถวที่ยังว่าง', () => {
  const src = read('src/app/api/sa/requests/[id]/items/route.js');
  const undo = src.slice(src.indexOf('} catch (e) {'));
  const formulaAt = undo.indexOf("from('formulas').delete().eq('scentId', scent.id)");
  const scentAt = undo.indexOf("from('scents').delete()");
  assert.ok(formulaAt > -1 && scentAt > formulaAt, 'ลบสูตรก่อนกลิ่น');
  assert.match(undo.slice(formulaAt, scentAt), /continue;/);
  assert.match(src, /\.is\('readyAt', null\)\.is\('producedScentId', null\)/);
  assert.match(src, /if \(!filled\?\.length\) throw/);
});

test('วันที่ของสูตร: กติกาเดียวทั้งทะเบียนและด่านส่งงาน (ปีพิมพ์ผิดตีกลับก่อนกลิ่นเกิด)', () => {
  assert.equal(formulaDateError(null), null);
  assert.equal(formulaDateError('2026-09-22'), null);
  assert.match(formulaDateError('2202-08-06'), /ปี/);
  assert.match(formulaDateError('22/09/2026'), /ไม่ถูกต้อง/);
  const { error } = normalizeDeliveryRows([{
    scent: { name: 'x', code: 'X-1' }, categoryCode: '01-002',
    formula: { name: 'x', code: 'X-1-P1', formulaDate: '2202-08-06' },
  }]);
  assert.match(error, /ปีของวันที่สูตร/);
});

test('แถวรอบแก้ที่ยังไม่ส่ง ไม่บอกว่า "ส่งเป็น…" ทั้งที่ยกหมวดมาจากรอบก่อน', () => {
  const parent = {
    id: 'A', requestId: 'R', lineKind: 'scent_dev', briefId: 'B1', label: 'EDP', categoryCode: '01-002',
    producedScentId: 'S1', producedFormulaId: 'F1', outcome: 'revise',
  };
  const waiting = { id: 'B', ...followUpRowFrom(parent, 2), ackAt: '2026-09-01' };
  assert.equal(waiting.categoryCode, '01-002'); // ยกมาเป็นค่าตั้งต้นของฟอร์ม
  const [group] = briefBoard([{ id: 'B1' }], [parent, waiting]);
  const rework = group.directions.find((d) => d.id === 'B');
  assert.equal(rework.delivered, null);
});

test('รอบแก้: ฟอร์มล็อก "แก้มาจากสูตร" ทุกแถวรอบแก้ (server ยกจากแถวต้นทางเสมอ)', () => {
  assert.match(read('src/components/requests/ScentDeliveryFields.js'),
    /locked=\{row\.targetItemId\s*\? \["customerId", "scentId", "derivedFromFormulaId"\]/);
});
