// ตรวจตัวเลข 26/10 · L17 — ตัวกรอง "ทีมดูแล" ของหน้าภาพรวมฐานข้อมูล: สินค้าตามทีมดูแลของลูกค้าเจ้าของ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  customersById, matchesOverviewTeams, overviewTeamOptions, overviewTeamsOf, teamsOf,
} from './overviewTeamFilter.js';

const CUSTOMERS = [
  { id: 'C-X', name: 'ลูกค้าของ X', teams: ['X'] },
  { id: 'C-Y', name: 'ลูกค้าของ Y', team: 'Y' },              // แถวเก่า — ทีมเดี่ยว
  { id: 'C-XZ', name: 'ลูกค้าสองทีม', teams: ['X', 'Z'] },
  { id: 'C-NONE', name: 'ยังไม่มีทีม' },
];
const PRODUCTS = [
  { id: 'P1', customerId: 'C-X', team: 'X' },     // X เปิดให้ลูกค้าของ X
  { id: 'P2', customerId: 'C-X', team: 'Y' },     // Y เปิดให้ลูกค้าของ X — ต้องอยู่ใต้ X
  { id: 'P3', customerId: 'C-Y', team: 'X' },     // X เปิดให้ลูกค้าของ Y — ต้องไม่อยู่ใต้ X
  { id: 'P4', customerId: 'C-XZ', team: 'Q' },    // ลูกค้าสองทีม
  { id: 'P5', customerId: 'C-GONE', team: 'X' },  // หาลูกค้าไม่เจอ = ไม่มีทีม
  { id: 'P6', customerId: 'C-NONE', team: 'X' },
];
const byId = customersById(CUSTOMERS);
const pick = (team) => PRODUCTS.filter((p) => matchesOverviewTeams(p, 'product', [team], byId)).map((p) => p.id);

test('🔴 L17: เลือกทีม X = สินค้าของลูกค้าที่ X ดูแล (รวมที่ทีมอื่นเปิด) · ไม่รวมสินค้าที่ X เปิดให้ลูกค้าทีมอื่น', () => {
  assert.deepEqual(pick('X'), ['P1', 'P2', 'P4']);
  assert.deepEqual(pick('Y'), ['P3']);
  assert.deepEqual(pick('Z'), ['P4']);
  assert.deepEqual(pick('Q'), [], 'ทีมของคนเปิดสินค้า (p.team) ไม่ใช่ทีมดูแล');
  // หาลูกค้าไม่เจอ / ลูกค้าไม่มีทีม = ไม่มีทีม ⇒ ซ่อนระหว่างเลือกทีม ไม่เดาจาก p.team
  assert.deepEqual(overviewTeamsOf(PRODUCTS[4], 'product', byId), []);
  assert.deepEqual(overviewTeamsOf(PRODUCTS[5], 'product', byId), []);
  // ไม่เลือกทีม = ทุกแถว
  assert.equal(PRODUCTS.filter((p) => matchesOverviewTeams(p, 'product', [], byId)).length, PRODUCTS.length);
});

test('🔴 L17: สองสายใช้ความหมายเดียวกัน — สินค้าใต้ทีม X = สินค้าของลูกค้าที่ฝั่งลูกค้าโชว์ใต้ทีม X พอดี', () => {
  for (const team of overviewTeamOptions(CUSTOMERS)) {
    const customerIds = new Set(CUSTOMERS.filter((c) => matchesOverviewTeams(c, 'customer', [team], byId)).map((c) => c.id));
    const productIds = PRODUCTS.filter((p) => matchesOverviewTeams(p, 'product', [team], byId)).map((p) => p.id);
    assert.deepEqual(productIds, PRODUCTS.filter((p) => customerIds.has(p.customerId)).map((p) => p.id), team);
  }
  // หลายทีม = รวมกัน
  assert.deepEqual(PRODUCTS.filter((p) => matchesOverviewTeams(p, 'product', ['Y', 'Z'], byId)).map((p) => p.id), ['P3', 'P4']);
});

test('ตัวเลือกทีม = ทีมดูแลของลูกค้าเท่านั้น (ไม่เก็บ p.team) · teamsOf ถอยไป team เดี่ยวของแถวเก่า', () => {
  assert.deepEqual(overviewTeamOptions(CUSTOMERS), ['X', 'Y', 'Z']);
  assert.deepEqual(overviewTeamOptions([]), []);
  assert.deepEqual(overviewTeamOptions(null), []);
  assert.deepEqual(teamsOf({ teams: [], team: 'Y' }), ['Y']);
  assert.deepEqual(teamsOf(null), []);
  assert.equal(customersById(null).size, 0);
});

test('🔴 L17 ด่านซอร์ส: หน้า /database กรองสองสายผ่านตัวตัดสินกลาง · ตัวเลือกจากลูกค้า · สิทธิ์อนุมัติสินค้ายังดู p.team', () => {
  const page = readFileSync(new URL('../../app/database/page.js', import.meta.url), 'utf8');
  assert.match(page, /const customerIndex = useMemo\(\(\) => customersById\(rawCustomers \|\| \[\]\), \[rawCustomers\]\);/);
  assert.match(page, /const allTeams = useMemo\(\(\) => overviewTeamOptions\(rawCustomers \|\| \[\]\), \[rawCustomers\]\);/);
  assert.match(page, /if \(!matchesOverviewTeams\(item, kind, teamFilter, customerIndex\)\) return false;/);
  assert.match(page, /products: \(rawProducts \|\| \[\]\)\.filter\(filterFn\("product"\)\),/);
  assert.match(page, /customers: \(rawCustomers \|\| \[\]\)\.filter\(filterFn\("customer"\)\),/);
  assert.doesNotMatch(page, /rawProducts \|\| \[\]\)\.forEach\(p => p\.team/, 'ตัวเลือกทีมห้ามมาจากทีมผู้สร้างสินค้า');
  assert.match(page, /const canApproveProduct = \(p\) => canApprove && \(isSuperuser\(role\) \|\| myTeams\.includes\(p\?\.team\)\);/);
  assert.match(page, /key: "team", label: "ทีมดูแล"/);
});
