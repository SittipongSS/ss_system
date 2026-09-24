// ── รวมบริบทด่านสองก้อน (สัปดาห์ + รายการงาน) บนหน้าจัดคิว ───────────────────────
//
// ⭐ โมดัลของร่างที่อยู่นอกสัปดาห์ที่เปิด ต้องเห็นบริบทจากรายการงาน — ไม่งั้นด่านบนโมดัลตอบ "ติด"
//    (ไม่มีบริบท = ติด) ทั้งที่แถวในรายการงานเพิ่งบอกว่า "พร้อมปล่อย"
import test from 'node:test';
import assert from 'node:assert/strict';
import { gateContextForSite, mergeGateContext } from './gateContext.js';
import { evaluateVisitGate, gatePassed } from './visitGate.js';

const EMPTY = { zonesBySite: {}, termsBySite: {}, ordersById: {}, installmentsByOrderId: {}, contractsById: {} };

const weekCtx = {
  zonesBySite: { S1: [{ id: 'Z1', siteId: 'S1', name: 'โซน A' }] },
  termsBySite: { S1: [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1', startDate: '2026-01-01', endDate: '2027-12-31' }] },
  ordersById: { SO1: { id: 'SO1', status: 'approved', serviceContractId: 'CT1' } },
  installmentsByOrderId: { SO1: [{ status: 'confirmed', coversFrom: '2026-08-01', coversTo: '2026-12-31', dueDate: '2026-08-01' }] },
  contractsById: { CT1: { id: 'CT1', status: 'signed' } },
};
const queueCtx = {
  zonesBySite: { S2: [{ id: 'Z2', siteId: 'S2', name: 'โซน B' }] },
  termsBySite: { S2: [{ id: 'T2', zoneId: 'Z2', salesOrderId: 'SO2', startDate: '2026-01-01', endDate: '2027-12-31' }] },
  ordersById: { SO2: { id: 'SO2', status: 'approved', serviceContractId: 'CT2' } },
  installmentsByOrderId: { SO2: [{ status: 'confirmed', coversFrom: '2026-08-01', coversTo: '2026-12-31', dueDate: '2026-08-01' }] },
  contractsById: { CT2: { id: 'CT2', status: 'signed' } },
};

test('รวมห้าก้อนครบ · ไซต์จากทั้งสองแหล่งอยู่ในก้อนเดียว', () => {
  const merged = mergeGateContext(weekCtx, queueCtx);
  assert.deepEqual(Object.keys(merged), Object.keys(EMPTY));
  assert.deepEqual(Object.keys(merged.zonesBySite).sort(), ['S1', 'S2']);
  assert.deepEqual(Object.keys(merged.ordersById).sort(), ['SO1', 'SO2']);
  assert.deepEqual(Object.keys(merged.contractsById).sort(), ['CT1', 'CT2']);
});

test('⭐ ร่างนอกสัปดาห์ผ่านด่านบนโมดัลได้เมื่อรวมบริบทแล้ว — ก้อนสัปดาห์อย่างเดียวตอบว่าติด', () => {
  const visit = { assigneeId: 'U1', scheduledDate: '2026-10-15', kind: 'refill', siteId: 'S2' };
  assert.equal(gatePassed(evaluateVisitGate(visit, gateContextForSite(weekCtx, 'S2'))), false);
  assert.equal(gatePassed(evaluateVisitGate(visit, gateContextForSite(mergeGateContext(weekCtx, queueCtx), 'S2'))), true);
});

test('ตัวหลังชนะรายคีย์ และ **แทนทั้งค่า ไม่ต่ออาร์เรย์** (ไม่งั้นโซนซ้ำสองเท่า)', () => {
  const newer = {
    zonesBySite: { S1: [{ id: 'Z1', siteId: 'S1', name: 'โซน A (ชื่อใหม่)' }] },
    ordersById: { SO1: { id: 'SO1', status: 'approved', serviceContractId: 'CT9' } },
  };
  const merged = mergeGateContext(weekCtx, newer);
  assert.equal(merged.zonesBySite.S1.length, 1);
  assert.equal(merged.zonesBySite.S1[0].name, 'โซน A (ชื่อใหม่)');
  assert.equal(merged.ordersById.SO1.serviceContractId, 'CT9');
  // ก้อนที่ตัวหลังไม่มี ยังอยู่ครบจากตัวแรก
  assert.equal(merged.termsBySite.S1.length, 1);
  assert.ok(merged.contractsById.CT1);
});

test('null-safe — ก้อนว่าง/ไม่มี/ช่องขาด ข้ามไป · ไม่ส่งอะไรเลย = ห้าก้อนว่าง', () => {
  assert.deepEqual(mergeGateContext(), EMPTY);
  assert.deepEqual(mergeGateContext(null, undefined, {}), EMPTY);
  const merged = mergeGateContext(null, { ordersById: null, contractsById: { CT1: { id: 'CT1' } } });
  assert.deepEqual(merged.ordersById, {});
  assert.deepEqual(merged.contractsById, { CT1: { id: 'CT1' } });
});

test('รับ Map ได้ · คืน object ธรรมดาเสมอ · ไม่แก้ก้อนต้นทาง', () => {
  const asMap = { ordersById: new Map([['SO3', { id: 'SO3' }]]) };
  const merged = mergeGateContext(weekCtx, asMap);
  assert.equal(merged.ordersById instanceof Map, false);
  assert.deepEqual(Object.keys(merged.ordersById).sort(), ['SO1', 'SO3']);
  assert.deepEqual(Object.keys(weekCtx.ordersById), ['SO1'], 'ก้อนต้นทางต้องไม่ถูกเขียนทับ');
});

/* ⭐ สัญญาที่ถูกยกเลิกหลังลงนาม (มติเจ้าของ 24/09/2026) — ด่านแยก "เคยมีผล" ด้วย `approvedAt` และหาวันจบจาก
   `cancelledAt` ⇒ **ตัวโหลดบริบทด่านกับทะเบียนต่อสัญญาต้องดึงสองคอลัมน์นี้ และชุดคอลัมน์ต้องเท่ากัน**
   🪤 ลืมที่ใดที่หนึ่ง = ด่านถือว่า "ไม่เคยมีผล" ⇒ ใบส่งงานที่ปิดไปแล้วกลายเป็น "งดบริการ" ย้อนหลังเงียบ ๆ */
test('ตัวโหลดสัญญาของด่านเข้าไซต์กับทะเบียนต่อสัญญาดึงคอลัมน์ชุดเดียวกัน รวม approvedAt/cancelledAt', async () => {
  const { readFileSync } = await import('node:fs');
  const select = (rel) => {
    const code = readFileSync(new URL(rel, import.meta.url), 'utf8');
    const at = code.indexOf("from('sales_contracts')");
    assert.ok(at > 0, rel);
    return code.slice(at).match(/\.select\('([^']+)'\)/)[1];
  };
  const gate = select('./gateContext.js');
  const renewals = select('../../app/api/sales-planning/renewals/route.js');
  assert.equal(gate, renewals);
  assert.match(gate, /"approvedAt"/);
  assert.match(gate, /"cancelledAt"/);
});
