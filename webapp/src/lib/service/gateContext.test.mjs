// ── รวมบริบทด่านสองก้อน (สัปดาห์ + รายการงาน) บนหน้าจัดคิว ───────────────────────
//
// ⭐ โมดัลของร่างที่อยู่นอกสัปดาห์ที่เปิด ต้องเห็นบริบทจากรายการงาน — ไม่งั้นด่านบนโมดัลตอบ "ติด"
//    (ไม่มีบริบท = ติด) ทั้งที่แถวในรายการงานเพิ่งบอกว่า "พร้อมปล่อย"
import test from 'node:test';
import assert from 'node:assert/strict';
import { gateContextForSite, loadVisitGateContext, mergeGateContext } from './gateContext.js';
import { evaluateVisitGate, gatePassed } from './visitGate.js';

/* ⭐ ก้อนที่หก `setupOrdersByZone` (PR-C · C9 · D15) — ชิปใบสั่งขายของโซนที่ไม่มีรอบขายที่มีผล · ว่างเสมอเมื่อไม่ขอ */
const EMPTY = { zonesBySite: {}, termsBySite: {}, ordersById: {}, installmentsByOrderId: {}, contractsById: {}, setupOrdersByZone: {} };

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

test('รวมหกก้อนครบ · ไซต์จากทั้งสองแหล่งอยู่ในก้อนเดียว', () => {
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

test('null-safe — ก้อนว่าง/ไม่มี/ช่องขาด ข้ามไป · ไม่ส่งอะไรเลย = หกก้อนว่าง', () => {
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

/* ══ D15 · ชิปใบสั่งขายบนร่างที่ติดด่าน (PR-C · C9 · C-D19) ═════════════════════════════════════════
   ⭐ **opt-in เฉพาะจอจัดคิว** (`visitBundle`) — ทางตรวจด่านฝั่ง server (สร้าง/แก้นัด · planGen · ถอนเครื่อง · แท็บงานบริการ
      ของใบ) ไม่ขอ ⇒ เบาเท่าเดิม และผลผ่าน/ไม่ผ่านไม่ขึ้นกับก้อนนี้เลย (ชิปเป็นแค่ป้ายบอกทาง)
   ⚠️ ขอแล้วอ่านไม่ขึ้น = โยน (ตัวโหลดของ C2) ไม่ใช่ "ไม่มีใบ" — ชิปที่หายเพราะ query พังหน้าตาเหมือนไม่มีใบถือโซน */

/* ฐานปลอม: กรอง in/eq จริง · `range` = จุดยิงของ fetchAll · บันทึกทุกคำสั่ง (ตาราง · คอลัมน์ · in · order) */
function fakeDb(tables = {}, { errors = {} } = {}) {
  const log = [];
  return {
    log,
    from(table) {
      const q = { table, select: null, filters: [], orders: [], ranged: false };
      log.push(q);
      const rows = () => {
        let out = [...(tables[table] || [])];
        for (const [op, col, val] of q.filters) {
          if (op === 'in') out = out.filter((r) => val.includes(r[col]));
          if (op === 'eq') out = out.filter((r) => r[col] === val);
        }
        return out;
      };
      const result = (from = 0, to = 999) => Promise.resolve(errors[table]
        ? { data: null, error: errors[table] }
        : { data: rows().slice(from, to + 1), error: null });
      const chain = {
        select(cols) { q.select = cols; return chain; },
        in(col, val) { q.filters.push(['in', col, [...val]]); return chain; },
        eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
        order(col, opts = {}) { q.orders.push([col, opts.ascending !== false]); return chain; },
        range(from, to) { q.ranged = true; return result(from, to); },
        then(resolve, reject) { return result().then(resolve, reject); },
      };
      return chain;
    },
  };
}

const gateTables = () => ({
  service_zones: [
    { id: 'Z1', siteId: 'S1', name: 'ล็อบบี้' },
    { id: 'Z2', siteId: 'S1', name: 'ชั้น 2' },
    { id: 'Z9', siteId: 'S9', name: 'ไซต์อื่น' },
  ],
  service_zone_terms: [
    { id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1', startDate: '2026-01-01', endDate: '2027-12-31', createdAt: '2026-09-01' },
  ],
  sales_orders: [
    { id: 'SO1', status: 'approved', supersededById: null, serviceContractId: null, origin: 'pipeline', totalAmount: 1000 },
    { id: 'SOR-D', orderNumber: 'SO-26100011-0', status: 'draft', supersededById: null, serviceTermsOpenedAt: null, serviceSetupState: null, origin: 'pipeline', dealId: 'D1' },
  ],
  sales_order_installments: [],
  sales_contracts: [],
  sales_order_line_zones: [
    { id: 'L1', salesOrderId: 'SOR-D', zoneId: 'Z2' },
    { id: 'L2', salesOrderId: 'SOR-D', zoneId: 'Z2' },
    { id: 'L9', salesOrderId: 'SOR-D', zoneId: 'Z9' },
  ],
  sales_deals: [{ id: 'D1', ownerName: 'สมชาย ใจดี' }],
});

const CHIP = { orderId: 'SOR-D', orderNumber: 'SO-26100011-0', status: 'draft', group: 'unapproved', stateLabel: 'ฉบับร่าง', ownerName: 'สมชาย ใจดี' };

test('D15 ค่าตั้งต้น: ไม่ขอชิป = ไม่แตะ sales_order_line_zones/sales_deals · คีย์ setupOrdersByZone ว่างเสมอ', async () => {
  const db = fakeDb(gateTables());
  const ctx = await loadVisitGateContext(db, ['S1']);
  assert.deepEqual(ctx.setupOrdersByZone, {});
  assert.deepEqual(Object.keys(ctx).sort(), Object.keys(EMPTY).sort());
  assert.equal(db.log.some((q) => q.table === 'sales_order_line_zones' || q.table === 'sales_deals'), false,
    'ทางตรวจด่านฝั่ง server ต้องไม่ยิงคำขอเพิ่ม');
  // ไม่มีไซต์ = ก้อนว่างทั้งหก (รวมคีย์ใหม่) โดยไม่แตะฐาน
  const none = fakeDb(gateTables());
  assert.deepEqual(await loadVisitGateContext(none, []), EMPTY);
  assert.deepEqual(await loadVisitGateContext(none, [], { withSetupOrders: true }), EMPTY);
  assert.equal(none.log.length, 0);
});

test('D15 opt-in: อ่านรายการโซนของใบ → ใบ → ดีล (ชื่อ AE) แบบซอยก้อน+ไล่หน้า · ได้ object รายโซน (ไม่ใช่ Map)', async () => {
  const db = fakeDb(gateTables());
  const ctx = await loadVisitGateContext(db, ['S1'], { withSetupOrders: true });
  assert.equal(ctx.setupOrdersByZone instanceof Map, false, 'ต้องเป็น object ธรรมดา — ส่งออกทาง JSON ของ route ได้');
  assert.deepEqual(ctx.setupOrdersByZone, { Z2: [CHIP] }, 'สองบรรทัดของใบเดียว = ชิปเดียว · โซนของไซต์อื่นไม่มา');
  const allocations = db.log.filter((q) => q.table === 'sales_order_line_zones');
  assert.equal(allocations.length, 1);
  assert.deepEqual(allocations[0].filters.map(([op, col]) => [op, col]), [['in', 'zoneId']]);
  assert.deepEqual([...allocations[0].filters[0][2]].sort(), ['Z1', 'Z2'], 'ถามเฉพาะโซนของไซต์ที่ขอ');
  assert.equal(allocations[0].ranged, true, 'ไล่หน้า (เพดาน 1,000 แถว)');
  assert.deepEqual(allocations[0].orders, [['id', true]]);
  const deals = db.log.filter((q) => q.table === 'sales_deals');
  assert.equal(deals.length, 1, 'withOwners: ชื่อ AE บนชิป');
  assert.deepEqual(deals[0].filters, [['in', 'id', ['D1']]]);
  // ก้อนเดิมทั้งห้าไม่ขยับ
  const plain = await loadVisitGateContext(fakeDb(gateTables()), ['S1']);
  for (const key of Object.keys(plain).filter((k) => k !== 'setupOrdersByZone')) assert.deepEqual(ctx[key], plain[key], key);
});

test('D15 opt-in: อ่านไม่ขึ้น = โยน (ไม่ใช่ตอบว่าไม่มีใบ)', async () => {
  for (const table of ['sales_order_line_zones', 'sales_deals']) {
    const boom = { message: `${table} timeout` };
    await assert.rejects(loadVisitGateContext(fakeDb(gateTables(), { errors: { [table]: boom } }), ['S1'], { withSetupOrders: true }),
      (e) => e === boom, table);
  }
});

test('D15 opt-in: ไซต์ที่ไม่มีโซน = ไม่ยิงรายการโซนของใบ · คีย์ยังอยู่', async () => {
  const db = fakeDb({ ...gateTables(), service_zones: [] });
  const ctx = await loadVisitGateContext(db, ['S1'], { withSetupOrders: true });
  assert.deepEqual(ctx.setupOrdersByZone, {});
  assert.equal(db.log.some((q) => q.table === 'sales_order_line_zones'), false);
});

test('D15: mergeGateContext พาก้อนชิปไปด้วย (ตัวหลังชนะรายโซน) · gateContextForSite ส่งต่อให้ evaluateVisitGate', () => {
  const merged = mergeGateContext(
    { setupOrdersByZone: { Z1: [CHIP], Z2: [CHIP] } },
    { setupOrdersByZone: new Map([['Z2', []]]) },
  );
  assert.deepEqual(merged.setupOrdersByZone, { Z1: [CHIP], Z2: [] });
  assert.deepEqual(gateContextForSite(merged, 'S1').setupOrdersByZone, merged.setupOrdersByZone);
  assert.deepEqual(gateContextForSite(null, 'S1').setupOrdersByZone, {}, 'ไม่มีบริบท = ก้อนว่าง ไม่ใช่ undefined');
  assert.deepEqual(gateContextForSite(weekCtx, 'S1').setupOrdersByZone, {}, 'บริบทเก่าที่ไม่มีคีย์นี้');
});
