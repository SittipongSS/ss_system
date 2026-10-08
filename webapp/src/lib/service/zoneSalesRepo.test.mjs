// ตัวโหลด "การขายของโซน" (PR-C · C2) — ซอยก้อน · ไล่หน้า · อ่านไม่ขึ้น = โยน (ไม่ใช่ตอบ "ไม่มี")
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSetupOrdersByZone, loadZoneSaleContext } from './zoneSalesRepo.js';

/* supabase ปลอม: `.from().select().in().eq().order().range()` — `range` คือจุดที่ fetchAll ยิงจริง */
function fakeSupabase(tables, { failOn = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table, columns: null, inCol: null, inVals: null, eqs: [], orders: [], range: null };
      const builder = {
        select(columns) { q.columns = columns; return builder; },
        in(column, values) { q.inCol = column; q.inVals = [...values]; return builder; },
        eq(column, value) { q.eqs.push([column, value]); return builder; },
        order(column, opts = {}) { q.orders.push([column, opts.ascending !== false]); return builder; },
        range(from, to) {
          q.range = [from, to];
          calls.push(q);
          if (failOn === table) return Promise.resolve({ data: null, error: { message: `อ่าน ${table} ไม่ขึ้น` } });
          const rows = (tables[table] || [])
            .filter((r) => !q.inCol || q.inVals.includes(r[q.inCol]))
            .filter((r) => q.eqs.every(([c, v]) => r[c] === v));
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return builder;
    },
  };
}

const STAMP = '2026-09-29T03:00:00Z';
const TABLES = {
  sales_order_line_zones: [
    { id: 'L1', salesOrderId: 'S1', zoneId: 'Z1' },
    { id: 'L2', salesOrderId: 'S1', zoneId: 'Z1' },
    { id: 'L3', salesOrderId: 'S2', zoneId: 'Z1' },
    { id: 'L4', salesOrderId: 'S3', zoneId: 'Z2' },
  ],
  sales_orders: [
    { id: 'S1', orderNumber: 'SO-26100011-0', status: 'draft', supersededById: null, serviceTermsOpenedAt: null, serviceSetupState: null, origin: 'pipeline', dealId: 'D1' },
    { id: 'S2', orderNumber: 'SO-26090247-0', status: 'approved', supersededById: null, serviceTermsOpenedAt: STAMP, serviceSetupState: null, origin: 'pipeline', dealId: 'D2' },
    { id: 'S3', orderNumber: 'SO-26080036-0', status: 'approved', supersededById: null, serviceTermsOpenedAt: null, serviceSetupState: 'submitted', origin: 'pipeline', dealId: null },
  ],
  sales_deals: [
    { id: 'D1', ownerName: 'สมชาย' },
    { id: 'D2', ownerName: 'สมหญิง' },
  ],
  service_zone_terms: [
    { id: 'T1', zoneId: 'Z1', salesOrderId: 'S2', packageQty: 2, unit: 'แพ็ค', createdAt: '2026-09-29T03:00:00Z' },
    { id: 'T2', zoneId: 'Z1', salesOrderId: 'S2', packageQty: 2, unit: 'แพ็ค', createdAt: '2026-09-29T03:00:00Z' },
  ],
};

test('ใบที่ถือโซน: ติดป้ายครบ · ไม่ขอชื่อ AE = ไม่อ่านดีล', async () => {
  const supabase = fakeSupabase(TABLES);
  const map = await loadSetupOrdersByZone(supabase, ['Z1', 'Z2']);
  assert.deepEqual(map.get('Z1'), [
    { orderId: 'S1', orderNumber: 'SO-26100011-0', status: 'draft', group: 'unapproved', stateLabel: 'ฉบับร่าง', ownerName: null },
  ], 'ใบที่ประทับแล้ว (S2) ไม่มีป้าย · สองบรรทัดของ S1 = ชิปเดียว');
  assert.deepEqual(map.get('Z2').map((o) => [o.orderNumber, o.group, o.stateLabel]), [['SO-26080036-0', 'backfill', 'รอผู้จัดการตรวจ']]);
  assert.equal(supabase.calls.some((c) => c.table === 'sales_deals'), false, 'ไม่ขอชื่อ AE ต้องไม่ยิงดีล');
});

test('ใบที่ถือโซน: withOwners อ่านชื่อ AE เฉพาะดีลของใบที่ได้ป้าย', async () => {
  const supabase = fakeSupabase(TABLES);
  const map = await loadSetupOrdersByZone(supabase, ['Z1'], { withOwners: true });
  assert.equal(map.get('Z1')[0].ownerName, 'สมชาย');
  const deals = supabase.calls.filter((c) => c.table === 'sales_deals');
  assert.equal(deals.length, 1);
  assert.deepEqual(deals[0].inVals, ['D1'], 'ดีลของใบที่ประทับแล้ว (D2) ไม่ต้องอ่าน');
});

test('ใบที่ถือโซน: ไม่มีโซน = Map ว่าง ไม่ยิงสักคำขอ', async () => {
  const supabase = fakeSupabase(TABLES);
  assert.equal((await loadSetupOrdersByZone(supabase, [])).size, 0);
  assert.equal((await loadSetupOrdersByZone(supabase, null)).size, 0);
  assert.equal(supabase.calls.length, 0);
});

test('ใบที่ถือโซน: ลิสต์โซนยาว ⇒ ซอยก้อน (PostgREST 16 KB) · เรียง id · ชื่อคอลัมน์ ไม่ใช่ *', async () => {
  const supabase = fakeSupabase(TABLES);
  const ids = Array.from({ length: 160 }, (_, i) => `Z${i + 1}`);
  await loadSetupOrdersByZone(supabase, ids);
  const lineZones = supabase.calls.filter((c) => c.table === 'sales_order_line_zones');
  assert.deepEqual(lineZones.map((c) => c.inVals.length), [150, 10]);
  for (const call of supabase.calls) {
    assert.notEqual(call.columns.trim(), '*', `${call.table} ต้องเลือกคอลัมน์ตามชื่อ`);
    assert.equal(call.orders.at(-1)[0], 'id', `${call.table} ต้องปิดท้ายด้วย order id (ไล่หน้านิ่ง)`);
    assert.equal(call.inCol === 'zoneId' || call.inCol === 'id', true, `${call.table} กรองด้วย id ของตัวเองหรือโซนเท่านั้น`);
  }
  const orders = supabase.calls.find((c) => c.table === 'sales_orders');
  for (const column of ['"orderNumber"', 'status', '"supersededById"', '"serviceTermsOpenedAt"', '"serviceSetupState"', 'origin', '"dealId"']) {
    assert.ok(orders.columns.includes(column), `sales_orders ต้องเลือก ${column}`);
  }
});

test('🔴 อ่านไม่ขึ้นทุกก้อน = โยน ไม่ใช่ตอบว่าไม่มีใบ', async () => {
  /* error ของ supabase เป็นอ็อบเจกต์ที่มี message (fetchAll โยนตัวนั้นตรง ๆ) */
  const failed = (e) => /ไม่ขึ้น/.test(e?.message);
  for (const table of ['sales_order_line_zones', 'sales_orders', 'sales_deals']) {
    await assert.rejects(
      loadSetupOrdersByZone(fakeSupabase(TABLES, { failOn: table }), ['Z1'], { withOwners: true }),
      failed, table,
    );
  }
  await assert.rejects(loadZoneSaleContext(fakeSupabase(TABLES, { failOn: 'service_zone_terms' }), [{ id: 'Z1' }]), failed);
  await assert.rejects(loadZoneSaleContext(fakeSupabase(TABLES, { failOn: 'sales_orders' }), [{ id: 'Z1' }]), failed);
});

test('บริบทการขายของไซต์: term · ใบของ term · ใบที่ถือโซน — ในก้อนเดียว', async () => {
  const supabase = fakeSupabase(TABLES);
  const ctx = await loadZoneSaleContext(supabase, [{ id: 'Z1' }, { id: 'Z2' }]);
  assert.deepEqual(ctx.terms.map((t) => t.id).sort(), ['T1', 'T2']);
  assert.ok(ctx.ordersById instanceof Map);
  assert.deepEqual([...ctx.ordersById.keys()], ['S2'], 'ใบของ term เท่านั้น');
  assert.equal(ctx.ordersById.get('S2').serviceTermsOpenedAt, STAMP);
  assert.equal(ctx.pendingOrdersByZone.get('Z1')[0].orderNumber, 'SO-26100011-0');
  assert.equal(supabase.calls.filter((c) => c.table === 'service_zone_terms').length, 1, 'term อ่านครั้งเดียว');
  assert.equal(supabase.calls.some((c) => c.table === 'sales_deals'), false);

  const empty = fakeSupabase(TABLES);
  const none = await loadZoneSaleContext(empty, []);
  assert.deepEqual(none.terms, []);
  assert.equal(none.ordersById.size, 0);
  assert.equal(none.pendingOrdersByZone.size, 0);
  assert.equal(empty.calls.length, 0);
});

/* 🪤 ยามเงินของใบย้อนหลัง (historicalMoneyGuards) จับคำสั่งอ่าน sales_orders ที่แตะ 'approved'/ยอด/ตัวกรองสถานะ/select('*')
   ⇒ ตัวโหลดใหม่เลือกคอลัมน์ตามชื่อ กรองด้วย id อย่างเดียว แล้วตัดสินสถานะใน JS (กฎ 18 ของแผน C) */
/* 🔴 select ของใบต้องพกทุกช่องที่ `setupOrderState` → `serviceBackfillState` / `serviceSetupReopened` อ่าน — ขาดช่องเดียว ตัวตัดสินตอบจากค่า
   undefined เงียบ ๆ (mig 0404: ขาด "serviceSetupDeferredAt" = ใบที่ยื่นแบบข้ามหลังเคยเปิดแก้ ถูกเล่าว่า "แก้หลังอนุมัติ" บนป้ายโซน/ชิปด่านนัด
   ขณะที่หน้าใบ/ทะเบียน/แท็บ TS บอก "ข้ามตอนยื่น" — ตรวจทานรอบสุดท้าย lib-02) */
test('🔴 0404: select ของ sales_orders พกทุกช่องที่ตัวติดป้ายอ่าน (รวม "serviceSetupReopenedAt" ของ 0396 และ "serviceSetupDeferredAt" ของ 0404)', () => {
  const src = readFileSync(new URL('./zoneSalesRepo.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selects = [...src.matchAll(/from\('sales_orders'\)\.select\('([^']*)'\)/g)].map((m) => m[1]);
  assert.ok(selects.length >= 1, 'ไม่เจอ select ของ sales_orders');
  const setupSelect = selects.find((cols) => cols.includes('"serviceSetupState"'));
  assert.ok(setupSelect, 'ไม่เจอ select ที่ป้อน setupOrderState');
  for (const col of ['status', '"supersededById"', '"serviceTermsOpenedAt"', '"serviceSetupState"', 'origin', '"serviceSetupReopenedAt"', '"serviceSetupDeferredAt"']) {
    assert.ok(setupSelect.split(',').map((c) => c.trim()).includes(col), `select ขาด ${col}`);
  }
  /* ตัวตัดสินอ่านช่องของ 0404 จริง — ถ้าวันหนึ่งเลิกอ่าน ยามนี้ต้องถูกทบทวนพร้อมกัน */
  const lib = readFileSync(new URL('../sales/serviceSetup.js', import.meta.url), 'utf8');
  const reopened = lib.slice(lib.indexOf('export function serviceSetupReopened(order) {'), lib.indexOf('/* ══ ยื่นโดยยังไม่ตั้งงานบริการ: ตัวตัดสิน'));
  assert.match(reopened, /order\.serviceSetupDeferredAt && Date\.parse\(order\.serviceSetupDeferredAt\) > Date\.parse\(order\.serviceSetupReopenedAt\)/);
});

test('คำสั่งอ่าน sales_orders ไม่เป็น "ผู้ต้องสงสัย" ของยามเงิน', () => {
  const src = readFileSync(new URL('./zoneSalesRepo.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /['"]approved['"]/);
  assert.doesNotMatch(src, /\b(actualAmount|totalAmount|subtotal|vatAmount)\b/);
  assert.doesNotMatch(src, /\.(eq|neq|in)\(\s*['"]status['"]/);
  assert.doesNotMatch(src, /\.select\(\s*['"]\*/);
  assert.doesNotMatch(src, /['"]historical['"]/);
});
