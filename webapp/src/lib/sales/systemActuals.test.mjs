// ── systemActuals ของตัวช่วยวางเป้า (GET /api/sales-planning/history) — Actual รายเดือน (mig 0412) ──────────
// ล็อกไว้:
//   1. ใบทั้งใบล้วน (ทุกดีลวันนี้) — ผลเท่าตัวรวมเดิมใน route ทุกช่อง (ไม้บรรทัดข้างล่าง ห้ามแก้ตามโค้ดใหม่)
//   2. ใบ "Actual รายงวด" แตกปี/เดือนตาม actualByMonth — ยอดปีนี้ไม่รวมงวดที่อนุมัติปีหน้า · ไม่ซ้ำสองปี
//   3. Actual ล้วน — ยอดรออนุมัติ / รอนับรายงวด ไม่หลุดเข้า · ดีลย้อนหลังไม่นับ
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateSystemActuals } from './systemActuals.js';
import { dealActualFromSalesOrders } from './salesOrderWorkflow.js';
import { wonMonthOf } from './dashboardMetrics.js';
import { isHistoricalDeal } from './historicalOrders.js';
import { isWonStage } from '../salesPlanning.js';

/* 🧊 ไม้บรรทัด: ตัวรวมใน route ก่อน mig 0412 (wonValue ทั้งก้อนที่ wonMonth) — ห้ามแก้ตามโค้ดใหม่ */
function legacyAggregate(deals) {
  const years = {};
  for (const d of deals || []) {
    if (!isWonStage(d.stage) || isHistoricalDeal(d)) continue;
    const mk = wonMonthOf(d);
    if (!mk) continue;
    const yr = mk.slice(0, 4);
    const mi = Number(mk.slice(5, 7)) - 1;
    const amt = dealActualFromSalesOrders(d);
    const y = (years[yr] ||= { total: 0, byTeam: {}, byOwner: {}, byTeamOwner: {}, byMonth: Array(12).fill(0) });
    y.total += amt;
    if (d.team) y.byTeam[d.team] = (y.byTeam[d.team] || 0) + amt;
    if (d.ownerId) y.byOwner[d.ownerId] = (y.byOwner[d.ownerId] || 0) + amt;
    if (d.team && d.ownerId) {
      const inTeam = (y.byTeamOwner[d.team] ||= {});
      inTeam[d.ownerId] = (inTeam[d.ownerId] || 0) + amt;
    }
    if (mi >= 0 && mi < 12) y.byMonth[mi] += amt;
  }
  return years;
}

const won = (over = {}) => ({
  stage: 'won', ownerId: 'u1', team: 'KA', wonValue: 100,
  metadata: { actualSource: 'sale_order', wonMonth: '2025-03' }, ...over,
});

test('ใบทั้งใบล้วน: ผลเท่าตัวรวมเดิมทุกช่อง (มี/ไม่มีคีย์ actualByMonth · Actual 0 · Won รอยื่น SO · ไม่ยืนยัน actualSource)', () => {
  const deals = [
    won(),
    won({ ownerId: 'u2', wonValue: 1234.56, metadata: { actualSource: 'sale_order', wonMonth: '2025-07', actualByMonth: { '2025-07': 1234.56 } } }),
    won({ ownerId: 'u3', team: null, wonValue: 0.29, metadata: { actualSource: 'sale_order', wonMonth: '2026-01' } }),
    won({ ownerId: null, team: 'ODM', wonValue: 50 }),
    // ใบอนุมัติ 0 บาท — ถังปีของ wonMonth ยังเกิด (ยอด 0)
    won({ wonValue: 0, metadata: { actualSource: 'sale_order', wonMonth: '2024-12', actualByMonth: { '2024-12': 0 } } }),
    // Won รอยื่น SO (ไม่มี wonMonth → confirmedAt) · ไม่ยืนยัน actualSource
    won({ wonValue: 0, metadata: {}, confirmedAt: '2023-05-02T03:00:00Z' }),
    won({ wonValue: 999, metadata: { wonMonth: '2025-03' } }),
    won({ stage: 'quotation', wonValue: 5 }),
    won({ wonValue: 5000, origin: 'historical' }),
  ];
  assert.deepEqual(aggregateSystemActuals(deals), legacyAggregate(deals));
  assert.deepEqual(aggregateSystemActuals([]), {});
  assert.deepEqual(aggregateSystemActuals(null), {});
});

test('ใบรายงวดข้ามปี: แต่ละปีได้เฉพาะงวดที่อนุมัติในปีนั้น · ผลรวมสองปี = wonValue · ทีม/คนตามดีล', () => {
  const deal = won({
    ownerId: 'u9', team: 'SV', wonValue: 300,
    metadata: {
      actualSource: 'sale_order', wonMonth: '2025-11',
      actualByMonth: { '2025-11': 100, '2025-12': 100, '2026-02': 100 },
      soInstPendingAmount: 40, soInstPendingCount: 1, soInstRemainingByDue: { '2026-05': 60 },
    },
  });
  const years = aggregateSystemActuals([deal]);
  assert.equal(years['2025'].total, 200);
  assert.equal(years['2026'].total, 100);
  assert.equal(years['2025'].byMonth[10], 100);
  assert.equal(years['2025'].byMonth[11], 100);
  assert.equal(years['2026'].byMonth[1], 100);
  assert.deepEqual(years['2025'].byTeamOwner, { SV: { u9: 200 } });
  assert.deepEqual(years['2026'].byOwner, { u9: 100 });
  // ไม้บรรทัดเดิมจะเอาทั้ง 300 ไปลง พ.ย. 2025 — นี่คือบั๊กที่ไฟล์นี้กัน
  assert.equal(legacyAggregate([deal])['2025'].total, 300);
  // ยอดรออนุมัติ/รอนับรายงวดไม่ใช่ Actual — ไม่มีปีไหนได้ 40 หรือ 60
  assert.equal(years['2025'].total + years['2026'].total, 300);
  assert.equal(years['2026'].byMonth[4], 0);
});
