// ── ทะเบียนลูกค้า (ตรวจตัวเลข M21b · 20/10): "รวมลูกค้าที่เลิกใช้ (n)" = แถวที่เพิ่มขึ้นเมื่อติ๊ก ภายใต้ตัวกรองอื่น ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { customerFilterFacets, filterCustomers } from './customerFilter.js';
import { approvalStatCounts } from './pendingApprovalLinks.js';

const C = (over) => ({ arCode: 'AR-1', name: 'ลูกค้า', isActive: true, approvalStatus: 'approved', ...over });
const ROWS = [
  C({ id: 1, arCode: 'AR-001', name: 'สยามหอม', teams: ['ODM'] }),
  C({ id: 2, arCode: 'AR-002', name: 'Bangkok Scent', nameEn: 'Bangkok Scent', team: 'KA', isActive: false }),
  C({ id: 3, arCode: 'AR-003', name: 'บริษัท ก', teams: ['ODM', 'SV'], approvalStatus: 'pending', isActive: false }),
  C({ id: 4, arCode: 'AR-004', name: 'บริษัท ข', teams: ['SV'], approvalStatus: 'pending' }),
  C({ id: 5, arCode: 'AR-005', name: 'บริษัท ค', teams: ['ODM'], approvalStatus: 'rejected', isActive: false, taxId: '0105551234567' }),
  C({ id: 6, arCode: 'AR-006', name: 'บริษัท ง', team: null, brands: [{ th: 'หอมดี', en: 'Hom Dee' }], branchCode: '00002' }),
  C({ id: 7, arCode: 'AR-007', name: 'บริษัท จ', teams: ['KA'], approvalStatus: null, isActive: false, phone: '0812345678' }),
];
const ids = (rows) => rows.map((r) => r.id);
const subsets = (values) => values.reduce((acc, v) => acc.concat(acc.map((s) => [...s, v])), [[]]);

test('🔴 ทุกคำค้น × สถานะ × ทีม × ติ๊กค้าง — "รวมลูกค้าที่เลิกใช้ (n)" = แถวที่เพิ่มขึ้นเมื่อติ๊ก', () => {
  let checked = 0;
  for (const search of ['', 'บริษัท', 'bangkok', 'AR-00', 'ไม่มี']) {
    for (const statuses of subsets(['pending', 'approved', 'rejected'])) {
      for (const teams of [[], ['ODM'], ['KA', 'SV']]) {
        for (const showInactive of [false, true]) {
          const state = { search, statuses, teams, showInactive };
          const off = filterCustomers(ROWS, { ...state, showInactive: false });
          const on = filterCustomers(ROWS, { ...state, showInactive: true });
          assert.equal(customerFilterFacets(ROWS, state).inactive, on.length - off.length, JSON.stringify(state));
          assert.ok(off.every((r) => on.includes(r)), 'ติ๊ก "รวม" เพิ่มแถวอย่างเดียว');
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked > 200);
  // ตัวอย่างในผลตรวจ: ทะเบียนมีใบเลิกใช้ 4 ใบ (ตัวเดิมโชว์ "(4)" เสมอ) · กรองทีม ODM แล้วติ๊กเพิ่มแค่ 2 ใบ (3 · 5)
  assert.equal(customerFilterFacets(ROWS, {}).inactive, 4);
  assert.equal(customerFilterFacets(ROWS, { teams: ['ODM'] }).inactive, 2);
  // กรอง "รออนุมัติ" อยู่: ใบเลิกใช้ที่รออนุมัติขึ้นอยู่แล้ว (H3) ⇒ ไม่นับซ้ำ
  assert.equal(customerFilterFacets(ROWS, { statuses: ['pending'] }).inactive, 0);
  assert.deepEqual(ids(filterCustomers(ROWS, { statuses: ['pending'] })), [3, 4]);
});

test('ค้นเจอทุกช่องที่ตาเห็นบนแถว — AR · ชื่อสองภาษา · เลขผู้เสียภาษี · สาขา · โทร · แบรนด์สองภาษา', () => {
  const hit = (search) => ids(filterCustomers(ROWS, { search, showInactive: true }));
  assert.deepEqual(hit('ar-004'), [4]);
  assert.deepEqual(hit('BANGKOK'), [2]);
  assert.deepEqual(hit('0105551234567'), [5]);
  assert.deepEqual(hit('00002'), [6]);
  assert.deepEqual(hit('0812345678'), [7]);
  assert.deepEqual(hit('หอมดี'), [6]);
  assert.deepEqual(hit('hom dee'), [6]);
  assert.deepEqual(hit('   '), ids(ROWS));
});

test('ทีม: ลูกค้าหลายทีมผ่านถ้าตรงทีมใดทีมหนึ่ง · แถวเก่าที่มีแค่ `team` ก็กรองได้', () => {
  assert.deepEqual(ids(filterCustomers(ROWS, { teams: ['SV'], showInactive: true })), [3, 4]);
  assert.deepEqual(ids(filterCustomers(ROWS, { teams: ['KA'], showInactive: true })), [2, 7]);
});

test('StatCards ลูกค้า (M20b) — เลขแต่ละช่อง = แถวของ filterCustomers หลังตั้งสถานะ', () => {
  const stats = approvalStatCounts(ROWS);
  assert.equal(stats.total, filterCustomers(ROWS).length);
  assert.equal(stats.pending, filterCustomers(ROWS, { statuses: ['pending'] }).length);
  assert.equal(stats.approved, filterCustomers(ROWS, { statuses: ['approved'] }).length);
  assert.equal(stats.rejected, filterCustomers(ROWS, { statuses: ['rejected'] }).length);
});

test('ด่านซอร์ส: หน้าลูกค้ากรอง/นับผ่าน customerFilter ตัวเดียว', () => {
  const page = readFileSync(new URL('../../app/database/customers/page.js', import.meta.url), 'utf8');
  assert.match(page, /const filterState = \{ search: q, statuses: statusFilter, teams: teamFilter, showInactive \};/);
  assert.match(page, /const filteredCustomers = filterCustomers\(customers, filterState\);/);
  assert.match(page, /const facets = customerFilterFacets\(customers, filterState\);/);
  assert.match(page, /label: `รวมลูกค้าที่เลิกใช้ \(\$\{facets\.inactive\}\)`/);
  assert.match(page, /\.\.\.\(inactiveInRegistry \|\| showInactive \?/, 'ตัวเลือกยังขึ้นขณะติ๊กค้างอยู่');
  assert.doesNotMatch(page, /customers\.filter\(\(c\) => \{\s*\/\*/, 'ห้ามเขียนตัวกรองสดกลับในหน้า');
});
