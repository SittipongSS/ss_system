// ── ลบกลิ่น/สูตรในทะเบียนได้ทุกสถานะ — Project Coordinator ของ RD (มติผู้ใช้ 2026-09-22) ─────────
//
// ถ้อยคำผู้ใช้: *"อยากเพิ่มสิทธิ์การลบ ทะเบียนกลิ่น สูตร ให้ Project Co RD ด้วย"* · เลือก
// "ลบได้ทุกสถานะ ถ้าไม่มีใครอ้าง" (ไม่ใช่บังคับลบเท่า admin ที่ปลดลิงก์ให้)
//
// ล็อกไว้:
//   1) cap `registry:delete` — rd_coordinator + admin เท่านั้น · ตำแหน่ง RD อื่น/หัวหน้าฝ่ายขายไม่มี
//   2) ข้ามแค่ด่านสถานะ — ด่านนับของที่อ้างทุกตัวยังอยู่ (คำร้อง · ราคา · สูตร · สินค้า · สายพันธุ์)
//   3) ปุ่มบนจอ = ตัวตัดสินเดียวกับ API (`canOffer…Delete` → ธง `_canDelete`)
//   4) ลบรายการในคำร้องไม่ได้สิทธิ์นี้ไปด้วย — กลิ่น/สูตรที่ลบพ่วงแถวต้องยังเป็นร่าง/กำลังพัฒนา
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canDeleteRegistryAnyStatus } from '../permissions.js';
import { canForceDelete } from '../forceDelete.js';
import { canOfferScentDelete, deleteScentError } from './scents.js';
import { canOfferFormulaDelete, deleteFormulaError } from './formulas.js';

const read = (rel) => readFileSync(rel, 'utf8');
const u = (role, extra = {}) => ({ id: `U-${role}`, role, department: role.startsWith('rd') ? 'RD' : null, ...extra });
const STATUSES = ['draft', 'developing', 'active', 'archived'];

test('cap registry:delete — Project Coordinator + admin เท่านั้น', () => {
  assert.equal(canDeleteRegistryAnyStatus(u('rd_coordinator')), true);
  assert.equal(canDeleteRegistryAnyStatus(u('admin')), true);
  for (const role of ['rd', 'rd_perfumer', 'rd_chemist', 'rd_supervisor', 'ae_supervisor', 'ae', 'viewer', 'executive']) {
    assert.equal(canDeleteRegistryAnyStatus(u(role)), false, role);
  }
  // ไม่ใช่บังคับลบ — break-glass ยังเป็นของ admin คนเดียว
  assert.equal(canForceDelete(u('rd_coordinator')), false);
  // grant รายคนไม่ได้ (ไม่อยู่ใน GRANTABLE_CAPS) — extraCaps ปลอมถูกทิ้ง
  assert.equal(canDeleteRegistryAnyStatus(u('rd_perfumer', { extraCaps: ['registry:delete'] })), false);
});

test('ลบกลิ่น: ข้ามแค่ด่านสถานะ — ด่านนับของที่อ้างยังอยู่ครบ', () => {
  const any = { anyStatus: true };
  for (const status of STATUSES) assert.equal(deleteScentError({ status }, {}, any), null, status);
  // ไม่ส่ง anyStatus = กติกาเดิม
  assert.match(deleteScentError({ status: 'active' }, {}), /ลบได้เฉพาะร่าง/);
  assert.match(deleteScentError({ status: 'archived' }, {}), /ลบได้เฉพาะร่าง/);
  assert.equal(deleteScentError({ status: 'developing' }, {}), null);
  // ของที่อ้างอยู่ — anyStatus ไม่ช่วย
  const active = { status: 'active' };
  assert.match(deleteScentError(active, { linkedCount: 2 }, any), /ถูกอ้างอยู่ 2 ที่/);
  assert.match(deleteScentError(active, { formulaCount: 1 }, any), /มีสูตร 1 ตัว/);
  assert.match(deleteScentError(active, { productCount: 3 }, any), /สินค้า 3 รายการ/);
  // ⭐ ใหม่: กลิ่นที่แก้ต่อจากกลิ่นนี้ (derivedFromScentId SET NULL — สายพันธุ์หายเงียบ)
  assert.match(deleteScentError(active, { childCount: 1 }, any), /กลิ่น 1 ตัวแก้ต่อ/);
  assert.match(deleteScentError({ status: 'developing' }, { childCount: 1 }), /กลิ่น 1 ตัวแก้ต่อ/);
});

test('ลบสูตร: ข้ามแค่ด่านสถานะ — ด่านนับของที่อ้างยังอยู่ครบ', () => {
  const any = { anyStatus: true };
  for (const status of STATUSES) assert.equal(deleteFormulaError({ status }, {}, any), null, status);
  assert.match(deleteFormulaError({ status: 'active' }, {}), /ลบได้เฉพาะร่าง/);
  const active = { status: 'active' };
  assert.match(deleteFormulaError(active, { productCount: 1 }, any), /สินค้า 1 รายการ/);
  assert.match(deleteFormulaError(active, { linkedCount: 1 }, any), /ถูกอ้างอยู่ 1 ที่/);
  assert.match(deleteFormulaError(active, { childCount: 1 }, any), /สูตร 1 ตัวแก้ต่อ/);
});

test('ปุ่มลบ = ตัวตัดสินเดียวกับ API — ตามสิทธิ์ + สถานะ', () => {
  const offerS = (user, status, extra = {}) => canOfferScentDelete(user, { status, createdById: 'OTHER', ...extra });
  const offerF = (user, status, extra = {}) => canOfferFormulaDelete(user, { status, createdById: 'OTHER', ...extra });
  const coord = u('rd_coordinator');
  const perfumer = u('rd_perfumer');
  const sales = u('ae', { team: 'KA' });
  for (const status of STATUSES) {
    assert.equal(offerS(coord, status), true, `coordinator กลิ่น ${status}`);
    assert.equal(offerF(coord, status), true, `coordinator สูตร ${status}`);
    assert.equal(offerS(u('admin'), status), true, `admin กลิ่น ${status}`);
  }
  assert.deepEqual(STATUSES.map((s) => offerS(perfumer, s)), [true, true, false, false]);
  assert.deepEqual(STATUSES.map((s) => offerF(perfumer, s)), [true, true, false, false]);
  // ฝ่ายขาย: ร่างของตัวเองเท่านั้น (เหมือนเดิม)
  assert.equal(offerS(sales, 'draft', { createdById: sales.id }), true);
  assert.equal(offerS(sales, 'draft'), false);
  assert.equal(offerS(sales, 'developing', { createdById: sales.id }), false);
  assert.equal(offerS(u('viewer'), 'draft'), false);
});

test('ต่อสาย: API ส่ง anyStatus + ติดธง _canDelete · จอใช้ธง · ลบรายการในคำร้องไม่ส่ง', () => {
  const scentRoute = read('src/app/api/master/scents/[id]/route.js');
  const formulaRoute = read('src/app/api/master/formulas/[id]/route.js');
  for (const src of [scentRoute, formulaRoute]) {
    assert.match(src, /\{ anyStatus: canDeleteRegistryAnyStatus\(user\) \}/);
    assert.match(src, /_canDelete: canOffer(Scent|Formula)Delete\(user, (scent|formula)\)/);
  }
  assert.match(read('src/app/api/master/scents/route.js'), /_canDelete: canOfferScentDelete\(user, s\)/);
  assert.match(read('src/app/api/master/formulas/route.js'), /_canDelete: canOfferFormulaDelete\(user, f\)/);
  assert.match(read('src/app/database/scents/page.js'), /visible: isAdmin \|\| !!s\._canDelete/);
  assert.match(read('src/app/database/formulas/page.js'), /visible: isAdmin \|\| !!f\._canDelete/);
  assert.match(read('src/app/database/scents/[id]/page.js'), /dangerActions=\{scent\._canDelete \?/);
  assert.match(read('src/app/database/formulas/[id]/page.js'), /dangerActions=\{formula\._canDelete \?/);
  // ⚠️ ลบแถวคำร้องลบกลิ่น/สูตรพ่วงได้เฉพาะร่าง/กำลังพัฒนา — ห้ามได้สิทธิ์ทุกสถานะตามไปด้วย
  const rowDelete = read('src/app/api/sa/requests/[id]/items/[itemId]/route.js');
  assert.doesNotMatch(rowDelete, /anyStatus/);
  // ตัวนับของที่อ้างฝั่งกลิ่นนับ "กลิ่นที่แก้ต่อ" ด้วย
  assert.match(read('src/lib/master/scentFormulaAdmin.js'), /head\('scents', 'derivedFromScentId'\)/);
});
