// ── ทะเบียนไซต์ (ตรวจตัวเลข M21c · 20/10): "รวมไซต์ที่ปิดใช้งาน (n)" = ไซต์ที่เพิ่มขึ้นเมื่อติ๊ก ภายใต้ตัวกรองอื่น ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterSites, siteFilterFacets } from './siteListFilter.js';

const S = (over) => ({ name: 'ไซต์', isActive: true, ...over });
const SITES = [
  S({ id: 1, code: 'ST-001', name: 'สาขาสยาม', province: 'กรุงเทพมหานคร', customerId: 'C1', customerName: 'สยามหอม', customerArCode: 'AR-001', routeZone: 'กลาง' }),
  S({ id: 2, code: 'ST-002', name: 'สาขาสีลม', province: 'กรุงเทพมหานคร', customerId: 'C1', customerName: 'สยามหอม', customerArCode: 'AR-001', routeZone: 'กลาง', isActive: false }),
  S({ id: 3, code: 'ST-003', name: 'นิมมาน', province: 'เชียงใหม่', customerId: 'C2', customerName: 'Lanna Spa', customerArCode: 'AR-002', routeZone: 'เหนือ' }),
  S({ id: 4, code: 'ST-004', name: 'ภูเก็ต', province: 'ภูเก็ต', customerId: 'C3', customerName: 'Beach Hotel', customerArCode: 'AR-003', routeZone: 'ใต้', isActive: false }),
  S({ id: 5, code: 'ST-005', name: 'ป่าตอง', province: 'ภูเก็ต', customerId: 'C3', customerName: 'Beach Hotel', customerArCode: 'AR-003', routeZone: null }),
  S({ id: 6, code: 'ST-006', name: 'เก่า', province: null, customerId: 'C2', customerName: 'Lanna Spa', routeZone: 'เหนือ', isActive: false }),
];
const ids = (rows) => rows.map((r) => r.id);
const subsets = (values) => values.reduce((acc, v) => acc.concat(acc.map((s) => [...s, v])), [[]]);

test('🔴 ทุกคำค้น × จังหวัด × ลูกค้า × เขต × ติ๊กค้าง — เลขบนตัวเลือก = แถวที่เพิ่มขึ้นเมื่อติ๊ก', () => {
  let checked = 0;
  for (const search of ['', 'สาขา', 'ar-003', 'lanna', 'ไม่มี']) {
    for (const provinces of [[], ['เชียงใหม่'], ['กรุงเทพมหานคร', 'ภูเก็ต']]) {
      for (const customers of [[], ['C2'], ['C1', 'C3']]) {
        for (const zones of subsets(['เหนือ', 'ใต้'])) {
          for (const showInactive of [false, true]) {
            const state = { search, provinces, customers, zones, showInactive };
            const off = filterSites(SITES, { ...state, showInactive: false });
            const on = filterSites(SITES, { ...state, showInactive: true });
            assert.equal(siteFilterFacets(SITES, state).inactive, on.length - off.length, JSON.stringify(state));
            assert.ok(off.every((r) => on.includes(r)), 'ติ๊ก "รวม" เพิ่มแถวอย่างเดียว');
            checked += 1;
          }
        }
      }
    }
  }
  assert.ok(checked > 300);
  // ตัวอย่างในผลตรวจ: ทะเบียนมีไซต์ปิด 3 ไซต์ (ตัวเดิมโชว์ "(3)" เสมอ) · กรองเชียงใหม่ (ไม่มีไซต์ปิด) ⇒ 0
  assert.equal(siteFilterFacets(SITES, {}).inactive, 3);
  assert.equal(siteFilterFacets(SITES, { provinces: ['เชียงใหม่'] }).inactive, 0);
  assert.equal(siteFilterFacets(SITES, { provinces: ['ภูเก็ต'] }).inactive, 1);
});

test('ค้นเจอทุกช่องที่ตาเห็นบนแถว — ชื่อ · ลูกค้า · AR · เขต · รหัส · จังหวัด', () => {
  const hit = (search) => ids(filterSites(SITES, { search, showInactive: true }));
  assert.deepEqual(hit('นิมมาน'), [3]);
  assert.deepEqual(hit('BEACH'), [4, 5]);
  assert.deepEqual(hit('ar-001'), [1, 2]);
  assert.deepEqual(hit('เหนือ'), [3, 6]);
  assert.deepEqual(hit('st-005'), [5]);
  assert.deepEqual(hit('เชียงใหม่'), [3]);
  assert.deepEqual(hit('  '), ids(SITES));
  assert.deepEqual(ids(filterSites(SITES)), [1, 3, 5], 'ค่าตั้งต้นซ่อนไซต์ปิดใช้งาน');
});

test('ด่านซอร์ส: หน้าทะเบียนไซต์กรอง/นับผ่าน siteListFilter ตัวเดียว', () => {
  const page = readFileSync(new URL('../../app/database/sites/page.js', import.meta.url), 'utf8');
  assert.match(page, /return \{ filtered: filterSites\(sites, state\), facets: siteFilterFacets\(sites, state\) \};/);
  assert.match(page, /label: `รวมไซต์ที่ปิดใช้งาน \(\$\{facets\.inactive\}\)`/);
  assert.match(page, /\.\.\.\(inactiveCount > 0 \|\| showInactive \?/, 'ตัวเลือกยังขึ้นขณะติ๊กค้างอยู่');
  assert.doesNotMatch(page, /sites\.filter\(\(site\) => \{\s*if \(!showInactive/, 'ห้ามเขียนตัวกรองสดกลับในหน้า');
});
