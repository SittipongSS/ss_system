import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { monthsInRange } from '../datePeriods.js';
import {
  matchPendingApprovalRows,
  pendingApprovalRowKey,
  reportPendingApproval,
} from './reportPendingApproval.js';

/* ยอด SO "รออนุมัติ" ของรายงานยอดขาย — มติผู้ใช้ 2026-09-11 · mig 0353
   ล็อกสี่เรื่อง: ลงเดือนปัจจุบัน (เวลาไทย) อย่างเดียว · ช่วงที่ไม่มีเดือนนี้ = ไม่มียอด ·
   ของเจ้าของดีลปัจจุบัน (ไม่ใช่ ownerId บนใบ) · ไม่แตะขายจริงเลย */

// 11 ก.ย. 2026 บ่ายโมงเวลาไทย
const NOW = new Date('2026-09-11T06:00:00Z');
const YEAR_2026 = monthsInRange('2026-01', '2026-12');

const directory = new Map([
  ['u1', { name: 'สมชาย', team: 'KA' }],
  ['u2', { name: 'สมหญิง', team: 'SV' }],
  ['u3', { name: 'สมศรี', team: 'KA' }],
]);
const person = (id) => directory.get(id) || null;

const deal = (over) => ({ id: 'D1', stage: 'won', ownerId: 'u1', ownerName: 'ชื่อบนดีล', ...over });
const so = (over) => ({
  id: 'SO1', orderNumber: 'SO-26090001-0', quotationId: 'Q1', dealId: 'D1',
  customerId: 'AR-1', customerName: 'ลูกค้า ก', status: 'pending_approval',
  submittedAt: '2026-09-05T03:00:00Z', ownerId: null,
  actualAmount: 100000, vatAmount: 7000, totalAmount: 107000,
  metadata: { quoteNumber: 'QT-26090001-1' }, ...over,
});

const build = (over = {}) => reportPendingApproval({
  orders: [so()], deals: [deal()], months: YEAR_2026, person, now: NOW, ...over,
});

test('ลงเดือนปัจจุบันตามเวลาไทยเสมอ — ไม่ใช่เดือนที่ร่างหรือยื่นใบ', () => {
  const out = build({
    // ร่างตั้งแต่ ก.ค. ยื่นตั้งแต่ ส.ค. — ค้างข้ามเดือนแล้วต้องเลื่อนมาอยู่เดือนนี้เอง
    orders: [so({ orderDate: '2026-07-20', submittedAt: '2026-08-28T03:00:00Z' })],
  });
  assert.equal(out.month, '2026-09');
  assert.equal(out.amount, 100000);
  assert.equal(out.count, 1);
});

test('ช่วงที่ไม่มีเดือนปัจจุบัน = ไม่มียอดรออนุมัติเลย (เดือนที่ปิดแล้ว/ปีก่อน/อนาคต)', () => {
  for (const months of [
    monthsInRange('2026-01', '2026-08'),
    monthsInRange('2025-01', '2025-12'),
    monthsInRange('2026-10', '2026-12'),
    [],
  ]) {
    const out = build({ months });
    assert.equal(out.month, null);
    assert.equal(out.amount, 0);
    assert.equal(out.count, 0);
    assert.deepEqual(out.byOwner, []);
    assert.deepEqual(out.byTeam, []);
    assert.deepEqual(out.orders, []);
  }
});

test('ขอบเดือนคิดตามเวลาไทย ไม่ใช่ UTC', () => {
  // 31 ส.ค. 18:00 UTC = 1 ก.ย. ตี 1 เวลาไทย ⇒ เดือนนี้คือ ก.ย. แล้ว
  const now = new Date('2026-08-31T18:00:00Z');
  assert.equal(build({ now, months: ['2026-08'] }).month, null);
  assert.equal(build({ now, months: ['2026-09'] }).amount, 100000);
});

test('ของใคร = เจ้าของดีลปัจจุบัน — ไม่อ่าน ownerId บนใบ (ว่างจนกว่าจะอนุมัติ หรือค้างรอบเก่า)', () => {
  const out = build({
    orders: [
      so({ id: 'A', ownerId: null }),
      // ใบที่เคยอนุมัติแล้วถูกย้อน ยื่นใหม่ — ownerId ค้างของรอบก่อน ต้องไม่ถูกใช้
      so({ id: 'B', ownerId: 'u2', ownerName: 'คนเก่า', actualAmount: 50000 }),
    ],
  });
  assert.deepEqual(out.byOwner.map((r) => [r.ownerId, r.ownerName, r.team, r.amount, r.count]), [
    ['u1', 'สมชาย', 'KA', 150000, 2],
  ]);
  assert.deepEqual(out.byTeam, [{ team: 'KA', amount: 150000, count: 2 }]);
  assert.ok(out.orders.every((o) => o.ownerId === 'u1' && o.team === 'KA'));
});

test('ทีมมาจากบัญชีปัจจุบันของเจ้าของ · บัญชีหาย = ชื่อจากดีล ไม่มีทีม', () => {
  const out = build({ deals: [deal({ ownerId: 'ghost', ownerName: 'คนลาออก' })] });
  assert.deepEqual(out.byOwner, [{ ownerId: 'ghost', ownerName: 'คนลาออก', team: null, amount: 100000, count: 1 }]);
  assert.deepEqual(out.byTeam, []);
  assert.equal(out.amount, 100000);
});

test('ดีลไม่มีเจ้าของ = เข้ายอดบริษัทอย่างเดียว (เหมือนใบอนุมัติแล้วที่ไม่มีเจ้าของ)', () => {
  const out = build({
    orders: [so({ id: 'A', dealId: 'D1' }), so({ id: 'B', dealId: 'D2', actualAmount: 40000 })],
    deals: [deal(), deal({ id: 'D2', ownerId: null, ownerName: null })],
  });
  assert.equal(out.amount, 140000);
  assert.equal(out.count, 2);
  assert.deepEqual(out.unassigned, { amount: 40000, count: 1 });
  assert.equal(out.byOwner.reduce((s, r) => s + r.amount, 0) + out.unassigned.amount, out.amount);
});

test('กระทบยอดได้: บริษัท = Σ รายคน + ไม่มีเจ้าของ = Σ รายทีม + เจ้าของไม่มีทีม + ไม่มีเจ้าของ', () => {
  const out = build({
    orders: [
      so({ id: 'A' }),
      so({ id: 'B', dealId: 'D2', actualAmount: 30000 }),
      so({ id: 'C', dealId: 'D3', actualAmount: 20000 }),
    ],
    deals: [
      deal(),
      deal({ id: 'D2', ownerId: 'ghost', ownerName: 'คนลาออก' }),
      deal({ id: 'D3', ownerId: null, ownerName: null }),
    ],
  });
  const total = (rows, key) => rows.reduce((s, r) => s + r[key], 0);
  assert.equal(total(out.byOwner, 'amount') + out.unassigned.amount, out.amount);
  assert.equal(total(out.byOwner, 'count') + out.unassigned.count, out.count);
  /* มุมรายทีม: ส่วนที่ไม่มีแถว = ใบดีลไม่มีเจ้าของ + ใบของเจ้าของที่ไม่อยู่ทีมไหน
     หน้ารายงานบอกส่วนนี้ใต้ตารางจากผลต่าง (หัวรายงาน − Σ แถว) — ต้องเท่ากันพอดี */
  const teamless = out.byOwner.filter((r) => !r.team);
  assert.equal(out.amount - total(out.byTeam, 'amount'), out.unassigned.amount + total(teamless, 'amount'));
  assert.equal(out.count - total(out.byTeam, 'count'), out.unassigned.count + total(teamless, 'count'));
  assert.equal(out.count - total(out.byTeam, 'count'), 2);
});

test('นับเฉพาะ pending_approval · ยอด = actualAmount ก่อน VAT ไม่ใช่ totalAmount', () => {
  const out = build({
    orders: [
      so({ id: 'P', actualAmount: 93000, totalAmount: 99510 }),
      ...['draft', 'rejected', 'approved', 'approval_revoked', 'revised', 'cancelled']
        .map((status) => so({ id: status, status, actualAmount: 1000000 })),
    ],
  });
  assert.equal(out.amount, 93000);
  assert.equal(out.count, 1);
  assert.deepEqual(out.orders.map((o) => o.id), ['P']);
  assert.equal(out.orders[0].totalAmount, 99510);
});

test('นับเฉพาะใบบนดีล Won (รวมดีลเก่า in_project) · ดีลเปิด/หาไม่เจอไม่นับ', () => {
  const out = build({
    orders: [
      so({ id: 'won', dealId: 'D1' }),
      so({ id: 'legacy', dealId: 'D2', actualAmount: 20000 }),
      so({ id: 'open', dealId: 'D3', actualAmount: 500000 }),
      so({ id: 'lost', dealId: 'D4', actualAmount: 500000 }),
      so({ id: 'missing', dealId: 'D9', actualAmount: 500000 }),
    ],
    deals: [deal(), deal({ id: 'D2', stage: 'in_project' }), deal({ id: 'D3', stage: 'quotation' }), deal({ id: 'D4', stage: 'lost' })],
  });
  assert.equal(out.amount, 120000);
  assert.deepEqual(out.orders.map((o) => o.id).sort(), ['legacy', 'won']);
});

test('ใบยอด 0 บาทที่รออนุมัติจริงยังนับจำนวน (ถูกกฎตั้งแต่ mig 0197)', () => {
  const out = build({ orders: [so({ actualAmount: 0, vatAmount: 0, totalAmount: 0 })] });
  assert.equal(out.amount, 0);
  assert.equal(out.count, 1);
  assert.equal(out.byOwner[0].count, 1);
});

test('ไม่แตะขายจริง: ไม่มีช่อง actual ในผล และไม่แก้ของที่ส่งเข้ามา', () => {
  const orders = [so({ id: 'A' }), so({ id: 'B', dealId: 'D2' })];
  const deals = [deal(), deal({ id: 'D2', ownerId: 'u2' })];
  const snapshot = JSON.stringify({ orders, deals });
  const out = build({ orders, deals });
  assert.equal(JSON.stringify({ orders, deals }), snapshot);
  const keys = JSON.stringify(out);
  for (const banned of ['"actual"', '"wonValue"', '"won"', '"history"', '"target"']) {
    assert.ok(!keys.includes(banned), `ผลต้องไม่มีช่อง ${banned}`);
  }
});

test('เรียงนิ่ง: คนยอดมากก่อน · ใบที่รอนานสุดก่อน ใบไม่มีวันยื่นไปท้าย', () => {
  const out = build({
    orders: [
      so({ id: 'late', orderNumber: 'SO-3', dealId: 'D2', submittedAt: '2026-09-10T03:00:00Z' }),
      so({ id: 'none', orderNumber: 'SO-9', submittedAt: null }),
      so({ id: 'early', orderNumber: 'SO-1', submittedAt: '2026-09-01T03:00:00Z', actualAmount: 10 }),
    ],
    deals: [deal(), deal({ id: 'D2', ownerId: 'u2' })],
  });
  assert.deepEqual(out.orders.map((o) => o.id), ['early', 'late', 'none']);
  assert.deepEqual(out.byOwner.map((r) => r.ownerId), ['u1', 'u2']);
});

test('จับยอดเข้าแถวรายคน/รายทีม และคืนกลุ่มที่ไม่มีแถวให้เติม', () => {
  const pendingApproval = build({
    orders: [so({ id: 'A' }), so({ id: 'B', dealId: 'D2', actualAmount: 5 }), so({ id: 'C', dealId: 'D3', actualAmount: 7 })],
    deals: [deal(), deal({ id: 'D2', ownerId: 'u2' }), deal({ id: 'D3', ownerId: 'u3' })],
  });
  const people = [{ ownerId: 'u1', team: 'KA' }, { ownerId: 'u9', team: 'KA' }];
  const byPerson = matchPendingApprovalRows(pendingApproval, people, 'person');
  assert.equal(byPerson.byKey.get(pendingApprovalRowKey('person', people[0])).amount, 100000);
  assert.equal(byPerson.byKey.get(pendingApprovalRowKey('person', people[1])), undefined);
  assert.deepEqual(byPerson.extra.map((r) => r.ownerId).sort(), ['u2', 'u3']);

  const byTeam = matchPendingApprovalRows(pendingApproval, [{ team: 'KA' }], 'team');
  assert.equal(byTeam.byKey.get('KA').amount, 100007);
  assert.deepEqual(byTeam.extra.map((r) => r.team), ['SV']);

  // ช่วงที่ไม่มีเดือนนี้ / ยังไม่โหลด = ไม่มีอะไรให้จับ
  assert.deepEqual(matchPendingApprovalRows(null, people, 'person').extra, []);
});

/* ── ด่านโค้ด: route กับหน้ารายงานต้องไม่ปนยอดรออนุมัติเข้าขายจริง ────────── */
const read = (rel) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');

test('route: อ่านใบรออนุมัติแยกก้อน ไม่ต่อ id เข้าคิวรีจำนวนบรรทัด และคืนเป็นช่องแยก', () => {
  const source = read('app/api/sales-planning/report/route.js');
  assert.match(source, /\.eq\('status', 'pending_approval'\)/);
  assert.match(source, /reportPendingApproval\(\{/);
  assert.match(source, /pendingApproval,/);
  // จำนวนบรรทัดยังนับเฉพาะใบอนุมัติแล้วในช่วง — `.in()` ก้อนนี้ไม่ได้ซอย ห้ามโตตามใบรออนุมัติ
  assert.match(source, /const ids = inRange\.map\(\(o\) => o\.id\);/);
  // เจ้าของมาจากดีลปัจจุบัน ต้องซอยลิสต์ id (PostgREST 16 KB)
  assert.match(source, /fetchInChunks\(/);
});

test('หน้า: ขายจริง ทบยอด % ส่วนต่าง ยังคิดจาก actual ล้วน', () => {
  const source = read('app/sales-planning/targets/report/page.js');
  assert.match(source, /actual: sum\(row\.actual\.slice\(0, closedCount\)\)/);
  assert.match(source, /carryIn\(company\.target, company\.actual, i, closedCount, months\)/);
  assert.doesNotMatch(source, /actual[^\n;]*\+[^\n;]*pendingApproval|pendingApproval[^\n;]*\+[^\n;]*actual/);
  assert.match(source, /import PendingApprovalAmount from "@\/components\/salesPlanning\/PendingApprovalAmount"/);
  // ช่องรออนุมัติบนหัวรายงานไม่ผ่านด่านเดือนที่จบแล้ว — เดือนที่มันอยู่คือเดือนที่ยังไม่จบเสมอ
  assert.doesNotMatch(source, /hasPendingApproval[^\n;]*closedCount|closedCount[^\n;]*hasPendingApproval/);
  // รายทีม/รายคน: แถวรวมต้องบอกส่วนที่ไม่มีแถว และสถานะว่างต้องชี้ไปการ์ดรายใบ ไม่ปล่อยให้ยอดหายเงียบ
  assert.match(source, /pendingOutsideCount > 0/);
  assert.match(source, /ดูราย\{label\}ได้ที่การ์ด/);
});
