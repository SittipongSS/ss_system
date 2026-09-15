// ทีมตามดีล (มติผู้ใช้ 2026-09-14) × ตัวช่วยวางเป้า + หน้ายอดขายย้อนหลัง
//
// ตัวช่วยวางเป้าแบ่งเป้าทีมลงคนตามยอด Won ปีล่าสุด · เดิมอ่าน `byOwner` (ยอดของคนนั้นข้ามทุกทีม)
// ⇒ คนที่อยู่สองทีม/เพิ่งย้ายทีม ได้น้ำหนักจากยอดของทีมอื่นในทุกทีมที่สังกัด
// ⭐ `byTeamOwner[team][ownerId]` = ยอดบนดีลที่ประทับทีมนั้น · `byTeam`/`byOwner` คงรูปเดิม (มีคนอ่านอยู่)
// ⛔ Actual ล้วน — ห้ามมียอดรออนุมัติ/รอยื่น SO (ล็อกซอร์สไว้ใน myDashboardPendingApproval.test.mjs)
//
// ⚠️ route.js export ได้แค่ HTTP handler — เทสต์นี้ตัดตัวฟังก์ชันจากซอร์สมารันกับตัวช่วยจริง
//    (ไม่ใช่สำเนา) ส่วนหน้าแผน/หน้าประวัติเป็น client page จึงยามด้วยซอร์ส
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dealActualFromSalesOrders } from './salesOrderWorkflow.js';
import { wonMonthOf } from './dashboardMetrics.js';
import { isHistoricalDeal } from './historicalOrders.js';
import { isWonStage } from '../salesPlanning.js';
import { splitByProportion } from '../salesForecast.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const ROUTE = read('../../app/api/sales-planning/history/route.js');
const PLAN = read('../../app/sales-planning/targets/plan/page.js');
const HISTORY_PAGE = read('../../app/sales-planning/targets/history/page.js');

const aggregateWonDeals = (() => {
  const start = ROUTE.indexOf('function aggregateWonDeals(deals) {');
  const end = ROUTE.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start, 'หา aggregateWonDeals ในซอร์ส route ไม่เจอ');
  const body = ROUTE.slice(start, end + 2);
  return new Function('dealActualFromSalesOrders', 'wonMonthOf', 'isWonStage', 'isHistoricalDeal', `${body}\nreturn aggregateWonDeals;`)(
    dealActualFromSalesOrders, wonMonthOf, isWonStage, isHistoricalDeal,
  );
})();

const won = (over) => ({
  stage: 'won', wonValue: 0, metadata: { actualSource: 'sale_order', wonMonth: '2025-03' }, ...over,
});
const inMonth = (month, over) => won({ ...over, metadata: { actualSource: 'sale_order', wonMonth: month } });

test('byTeamOwner = ยอดของคนบนดีลที่ประทับทีมนั้น · byTeam/byOwner/total คงเดิม', () => {
  const deals = [
    won({ ownerId: 'u1', team: 'KA', wonValue: 100 }),
    inMonth('2025-07', { ownerId: 'u1', team: 'ODM', wonValue: 40 }), // คนเดียวกัน ดีลอีกทีม
    won({ ownerId: 'u2', team: 'KA', wonValue: 50 }),
    won({ ownerId: 'u3', team: null, wonValue: 7 }), // ดีลไม่ระบุทีม — ไม่ลงรายทีม
    won({ ownerId: null, team: 'KA', wonValue: 3 }), // ดีลไม่มีเจ้าของ — ลงแค่ยอดทีม
    won({ ownerId: 'u1', team: 'KA', stage: 'quotation', wonValue: 999 }), // ยังไม่ Won
    // มีแต่ใบรออนุมัติ — Actual 0 (ห้ามเอายอดรออนุมัติมาปน)
    won({ ownerId: 'u2', team: 'KA', metadata: { actualSource: 'sale_order', wonMonth: '2025-03', soPendingAmount: 60000, soPendingCount: 1 } }),
    inMonth('2026-01', { ownerId: 'u1', team: 'KA', wonValue: 11 }),
  ];
  const years = aggregateWonDeals(deals);
  const y = years['2025'];
  assert.equal(y.total, 200);
  assert.deepEqual(y.byTeam, { KA: 153, ODM: 40 });
  assert.deepEqual(y.byOwner, { u1: 140, u2: 50, u3: 7 });
  assert.deepEqual(y.byTeamOwner, { KA: { u1: 100, u2: 50 }, ODM: { u1: 40 } });
  assert.equal(y.byMonth[2], 160);
  assert.equal(y.byMonth[6], 40);
  assert.deepEqual(years['2026'].byTeamOwner, { KA: { u1: 11 } });

  // ไม่มีคีย์ทีม null/undefined หลุดเข้า byTeamOwner (หน้าแผนกวาดคีย์ทีมไปวาดแถว)
  for (const code of Object.keys(y.byTeamOwner)) assert.ok(code && code !== 'null' && code !== 'undefined');

  // กระทบกัน: ต่อทีม Σ คนในทีม + ดีลไม่มีเจ้าของ = ยอดทีม · ต่อคน Σ ทุกทีม + ดีลไร้ทีม = byOwner
  for (const [code, people] of Object.entries(y.byTeamOwner)) {
    const ownerless = deals
      .filter((d) => d.team === code && !d.ownerId && isWonStage(d.stage) && wonMonthOf(d)?.startsWith('2025'))
      .reduce((s, d) => s + dealActualFromSalesOrders(d), 0);
    assert.equal(Object.values(people).reduce((s, v) => s + v, 0) + ownerless, y.byTeam[code], `ทีม ${code}`);
  }
  for (const [ownerId, total] of Object.entries(y.byOwner)) {
    const acrossTeams = Object.values(y.byTeamOwner).reduce((s, people) => s + (people[ownerId] || 0), 0);
    const teamless = deals
      .filter((d) => d.ownerId === ownerId && !d.team && isWonStage(d.stage) && wonMonthOf(d)?.startsWith('2025'))
      .reduce((s, d) => s + dealActualFromSalesOrders(d), 0);
    assert.equal(acrossTeams + teamless, total, `คน ${ownerId}`);
  }
});

test('ข้อมูลวันนี้ (ทุกดีลมีทีม · คนละหนึ่งทีม) — น้ำหนักรายคนเท่ากับ byOwner เดิมทุกคน', () => {
  const deals = [
    won({ ownerId: 'u1', team: 'KA', wonValue: 300 }),
    won({ ownerId: 'u1', team: 'KA', wonValue: 200 }),
    won({ ownerId: 'u2', team: 'KA', wonValue: 500 }),
    won({ ownerId: 'u3', team: 'ODM', wonValue: 900 }),
  ];
  const y = aggregateWonDeals(deals)['2025'];
  const teamOf = { u1: 'KA', u2: 'KA', u3: 'ODM' };
  for (const [ownerId, total] of Object.entries(y.byOwner)) {
    assert.equal(y.byTeamOwner?.[teamOf[ownerId]]?.[ownerId], total, ownerId);
  }
});

test('หน้าแผน: น้ำหนักคนในทีมอ่าน byTeamOwner ของทีมนั้น — คนสองทีมไม่ลากยอดทีมอื่นมา', () => {
  assert.match(PLAN, /weight: Number\(systemActuals\?\.\[latestHistYear\]\?\.byTeamOwner\?\.\[t\]\?\.\[m\.id\] \|\| 0\),/);
  assert.doesNotMatch(PLAN, /byOwner\?\.\[m\.id\]/, 'น้ำหนักรายคนกลับไปใช้ยอดข้ามทีมแล้ว');

  // จำลองการแบ่ง: u1 อยู่ทั้ง KA และ ODM · ขาย KA 100 / ODM 900
  const sys = aggregateWonDeals([
    won({ ownerId: 'u1', team: 'KA', wonValue: 100 }),
    won({ ownerId: 'u2', team: 'KA', wonValue: 300 }),
    won({ ownerId: 'u1', team: 'ODM', wonValue: 900 }),
    won({ ownerId: 'u3', team: 'ODM', wonValue: 100 }),
  ]);
  const weightsOf = (t, members) => members.map((id) => ({
    key: id, weight: Number(sys?.['2025']?.byTeamOwner?.[t]?.[id] || 0),
  }));
  assert.deepEqual(splitByProportion(1000, weightsOf('KA', ['u1', 'u2', 'u4'])), [
    { key: 'u1', amount: 250 }, { key: 'u2', amount: 750 }, { key: 'u4', amount: 0 }, // u4 ไม่มียอดในทีม = 0
  ]);
  assert.deepEqual(splitByProportion(1000, weightsOf('ODM', ['u1', 'u3'])), [
    { key: 'u1', amount: 900 }, { key: 'u3', amount: 100 },
  ]);
  // ทีมที่ไม่มีคีย์เลย (ทีมเปิดใหม่) — ไม่พัง แบ่งเท่ากันตามกติกาเดิมของ splitByProportion
  assert.deepEqual(splitByProportion(1000, weightsOf('NEW', ['u5', 'u6'])), [
    { key: 'u5', amount: 500 }, { key: 'u6', amount: 500 },
  ]);
});

test('หน้ายอดขายย้อนหลัง: ตัวเลขใบ้มาจาก systemHintCells ตัวกลาง ไม่ใช่สำเนาที่เขียนทับในหน้า', () => {
  assert.match(HISTORY_PAGE, /const sys = dashRes\.ok \? systemHintCells\(\(await dashRes\.json\(\)\)\.months\) : \{\};/);
  assert.doesNotMatch(HISTORY_PAGE, /\(sys\[key\] \|\|= \{\}\)\[mi\] = /, 'สำเนาตัวเติมแบบเขียนทับกลับมาในหน้าแล้ว');
  assert.doesNotMatch(HISTORY_PAGE, /for \(const teamRow of month\.byTeam/, 'ลูปถังทีมกลับมาในหน้าแล้ว (ถังไร้ทีมจะทับแถวบริษัท)');
});

/* ดีลของใบสั่งขายย้อนหลัง (mig 0360) — ยอดประวัติถูกคัดลง sales_history ถาวรผ่าน "เติมยอดจากระบบ"
   ⇒ ต่อให้ cache บนดีลมียอด/เดือน Won (ข้อมูลเพี้ยนหรือ trigger เก่า) ก็ต้องไม่เข้า */
test('ดีลของใบสั่งขายย้อนหลังไม่เข้ายอดประวัติ — แม้ cache บนดีลมียอดและเดือน Won', () => {
  const deals = [
    won({ ownerId: 'u1', team: 'KA', wonValue: 100 }),
    won({ ownerId: 'u1', team: 'KA', wonValue: 5000, origin: 'historical' }),
  ];
  const years = aggregateWonDeals(deals);
  assert.equal(years['2025'].total, 100);
  assert.equal(years['2025'].byOwner.u1, 100);
  assert.equal(years['2025'].byTeam.KA, 100);
  assert.equal(years['2025'].byTeamOwner.KA.u1, 100);
  assert.deepEqual(aggregateWonDeals([deals[1]]), {});
});
