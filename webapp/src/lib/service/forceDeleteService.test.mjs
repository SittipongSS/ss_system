// ── บังคับลบของโมดูลบริการ × ใบสั่งขายที่ชี้โซน (mig 0374 บรรทัดใบย้อนหลัง · mig 0392 รายการงานบริการ) ────────
//
// ⭐ มติ 22/09: ใบสั่งขายย้อนหลังเลือกโซนจากทะเบียนตอนคีย์ ⇒ `sales_order_lines."serviceZoneId"` เป็น FK
//   **RESTRICT** ไปที่โซน · บรรทัดคือเนื้อเอกสารขาย ระบบไม่ลบ/ปลดให้จากฝั่งโซน
// 🔴 ตัวลบจริงเดินทีละขั้นที่ commit แยกกัน (runSteps ไม่ใช่ transaction) ⇒ ถ้าไม่ขวางก่อนขั้นแรก
//   FK จะตีกลับที่ขั้น "ลบโซน" หลังจากรอบขาย · ผลวัด · ไฟล์บน Drive (และของไซต์: นัด · เครื่อง) หายไปแล้ว
//   ⇒ เทสต์ชุดนี้ยืนยันว่า **พรีวิวบอก blocked** และ **ตัวลบจริงไม่ยิงคำสั่งเขียนสักคำสั่ง**
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteSiteDeep, deleteZoneDeep, siteForceManifest, zoneForceManifest,
} from './forceDeleteService.js';

/* supabase ปลอม — พอสำหรับรูปคำสั่งที่ไฟล์นี้ใช้: select (รวม head-count) · eq · in · order · range ·
   delete · update · และจดทุกคำสั่งตามลำดับ (ดูว่าตรวจก่อนเขียนไหม · ลำดับขั้นของตัวลบไม่เพี้ยน) */
function fakeSupabase(seed, { failTable = null } = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((r) => ({ ...r }))]));
  const calls = [];
  const from = (table) => {
    const state = { op: 'select', filters: [], head: false, range: null, patch: null, cols: null };
    const run = () => {
      const all = tables[table] || [];
      if (table === failTable) {
        calls.push({ table, op: state.op, failed: true });
        return { data: null, error: { message: `อ่าน ${table} ไม่ได้ (จำลอง)` } };
      }
      const hit = all.filter((row) => state.filters.every((keep) => keep(row)));
      calls.push({ table, op: state.op });
      if (state.op === 'delete') {
        tables[table] = all.filter((row) => !hit.includes(row));
        return { data: null, error: null };
      }
      if (state.op === 'update') {
        for (const row of hit) Object.assign(row, state.patch);
        return { data: null, error: null };
      }
      if (state.head) return { count: hit.length, error: null };
      return { data: state.range ? hit.slice(state.range[0], state.range[1] + 1) : hit, error: null };
    };
    const builder = {
      select(cols, opts = {}) { state.head = !!opts.head; state.cols = cols; return builder; },
      eq(col, value) { state.filters.push((row) => row[col] === value); return builder; },
      in(col, values) { state.filters.push((row) => values.includes(row[col])); return builder; },
      order() { return builder; },
      range(a, b) { state.range = [a, b]; return builder; },
      delete() { state.op = 'delete'; return builder; },
      update(patch) { state.op = 'update'; state.patch = patch; return builder; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    return builder;
  };
  return { from, calls, tables };
}

const writes = (calls) => calls.filter((c) => c.op !== 'select').map((c) => `${c.op} ${c.table}`);

/* ไซต์ S1 มีสองโซน · Z1 ถูกใบย้อนหลังเลือกไว้ (บรรทัดชี้โซน) · มีรอบขาย ผลวัด นัด เครื่อง ครบทุกชั้น */
const seed = ({ withLines = true } = {}) => ({
  service_sites: [{ id: 'S1', name: 'สยามพารากอน' }],
  service_zones: [{ id: 'Z1', siteId: 'S1', name: 'ชั้น G ล็อบบี้' }, { id: 'Z2', siteId: 'S1', name: 'ห้องน้ำหญิง' }],
  service_zone_terms: [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SOR-H1' }],
  service_survey_zones: [{ id: 'SZ1', zoneId: 'Z1' }],
  service_assets: [{ id: 'A1', siteId: 'S1', zoneId: 'Z1' }],
  service_asset_moves: [{ id: 'M1', assetId: 'A1', toZoneId: 'Z1' }],
  service_visits: [{ id: 'V1', siteId: 'S1' }],
  service_visit_assets: [],
  service_visit_items: [],
  service_plans: [{ id: 'PL1', siteId: 'S1', salesOrderId: 'SOR-H1' }],
  service_renewal_followups: [],
  attachments: [],
  sales_order_lines: withLines
    ? [
      { id: 'SOL-1', salesOrderId: 'SOR-H1', serviceZoneId: 'Z1' },
      { id: 'SOL-2', salesOrderId: 'SOR-H2', serviceZoneId: 'Z1' },
      { id: 'SOL-9', salesOrderId: 'SOR-P', serviceZoneId: null },
    ]
    : [{ id: 'SOL-9', salesOrderId: 'SOR-P', serviceZoneId: null }],
  sales_orders: [
    { id: 'SOR-H1', orderNumber: 'SO-26090051-0' },
    { id: 'SOR-H2', orderNumber: 'SO-26090052-0' },
    { id: 'SOR-P', orderNumber: 'SO-26080077-0' },
  ],
});

test('🔴 โซนที่บรรทัดใบสั่งขายย้อนหลังชี้อยู่ — พรีวิวตอบ blocked พร้อมเลขใบ · ไม่เสนอรายการลบพ่วง', async () => {
  const db = fakeSupabase(seed());
  const manifest = await zoneForceManifest(db, 'Z1');
  assert.equal(manifest.blocked, true, 'forceDeleteClient ต้องไม่เสนอปุ่มบังคับลบที่ยังไงก็ล้ม');
  assert.deepEqual(manifest.cascade, []);
  assert.match(manifest.notes[0], /^โซนนี้อยู่ในใบสั่งขายย้อนหลัง SO-26090051-0, SO-26090052-0 — /);
  assert.match(manifest.notes[0], /ยกเลิกใบอย่างเดียวบรรทัดยังชี้โซนอยู่/, 'ต้องบอกว่ายกเลิกไม่ปลด — ไม่งั้นคนไปยกเลิกแล้วกลับมาเจอกำแพงเดิม');
  assert.match(manifest.notes[0], /ปิดใช้งานแทน/);
  assert.deepEqual(writes(db.calls), []);
});

test('🔴 deleteZoneDeep ขวางก่อนขั้นแรก — ไม่ยิงคำสั่งเขียนสักคำสั่ง (รอบขาย/ผลวัด/ไฟล์ยังอยู่ครบ)', async () => {
  const db = fakeSupabase(seed());
  await assert.rejects(() => deleteZoneDeep(db, 'Z1'), /โซนนี้อยู่ในใบสั่งขายย้อนหลัง SO-26090051-0/);
  assert.deepEqual(writes(db.calls), [], 'ห้ามลบอะไรไปก่อนแล้วค่อยล้มที่ FK');
  assert.equal(db.tables.service_zone_terms.length, 1);
  assert.equal(db.tables.service_survey_zones.length, 1);
});

test('🔴 ไซต์ที่มีโซนอยู่ในใบย้อนหลัง — พรีวิว blocked · deleteSiteDeep ไม่ลบนัด/เครื่อง/โซนไปก่อน', async () => {
  const preview = fakeSupabase(seed());
  const manifest = await siteForceManifest(preview, 'S1');
  assert.equal(manifest.blocked, true);
  assert.deepEqual(manifest.cascade, []);
  assert.match(manifest.notes[0], /^ไซต์นี้มีโซนที่อยู่ในใบสั่งขายย้อนหลัง SO-26090051-0/);
  assert.deepEqual(writes(preview.calls), []);

  const db = fakeSupabase(seed());
  await assert.rejects(() => deleteSiteDeep(db, 'S1'), /ไซต์นี้มีโซนที่อยู่ในใบสั่งขายย้อนหลัง/);
  assert.deepEqual(writes(db.calls), []);
  assert.equal(db.tables.service_visits.length, 1, 'นัดต้องยังอยู่');
  assert.equal(db.tables.service_assets.length, 1, 'เครื่องต้องยังอยู่');
});

test('บรรทัดที่ไม่ชี้โซน (ใบ pipeline · serviceZoneId ว่าง) ไม่ขวาง — ลำดับขั้นของตัวลบโซนเหมือนเดิม', async () => {
  const db = fakeSupabase(seed({ withLines: false }));
  const manifest = await zoneForceManifest(db, 'Z1');
  assert.equal(manifest.blocked, undefined);
  assert.deepEqual(manifest.cascade.map((l) => l.label), ['รอบขายที่ผูกกับโซนนี้', 'บรรทัดโซนในใบประเมินพื้นที่']);

  const run = fakeSupabase(seed({ withLines: false }));
  await deleteZoneDeep(run, 'Z1');
  assert.deepEqual(writes(run.calls), ['delete service_zone_terms', 'delete service_survey_zones', 'delete service_zones']);
  // ตรวจบรรทัดก่อนคำสั่งเขียนคำสั่งแรกเสมอ
  const checkedAt = run.calls.findIndex((c) => c.table === 'sales_order_lines');
  const firstWrite = run.calls.findIndex((c) => c.op !== 'select');
  assert.ok(checkedAt >= 0 && checkedAt < firstWrite);
});

test('ไซต์ที่ไม่มีบรรทัดชี้โซน — พรีวิวรายการลบพ่วงครบ · ลำดับขั้นของตัวลบไซต์เหมือนเดิม', async () => {
  const preview = fakeSupabase(seed({ withLines: false }));
  const manifest = await siteForceManifest(preview, 'S1');
  assert.equal(manifest.blocked, undefined);
  assert.ok(manifest.cascade.some((l) => l.label === 'โซน' && l.count === 2));

  const run = fakeSupabase(seed({ withLines: false }));
  await deleteSiteDeep(run, 'S1');
  assert.deepEqual(writes(run.calls), [
    'delete service_visits',
    'delete service_asset_moves',
    'delete service_assets',
    'delete service_zone_terms',
    'delete service_survey_zones',
    'delete service_zones',
    'delete service_renewal_followups',
    'delete service_plans',
    'delete service_sites',
  ]);
  const checkedAt = run.calls.findIndex((c) => c.table === 'sales_order_lines');
  const firstWrite = run.calls.findIndex((c) => c.op !== 'select');
  assert.ok(checkedAt >= 0 && checkedAt < firstWrite);
});

test('ข้อความขวางไม่ยาวจนอ่านไม่จบ — เกินห้าใบบอกจำนวนที่เหลือ', async () => {
  const lines = Array.from({ length: 7 }, (_, i) => ({ id: `SOL-${i}`, salesOrderId: `SOR-${i}`, serviceZoneId: 'Z1' }));
  const orders = lines.map((l, i) => ({ id: l.salesOrderId, orderNumber: `SO-2609010${i}-0` }));
  const db = fakeSupabase({ ...seed(), sales_order_lines: lines, sales_orders: orders });
  const manifest = await zoneForceManifest(db, 'Z1');
  assert.match(manifest.notes[0], /SO-26090104-0 และอีก 2 ใบ — /);
  assert.doesNotMatch(manifest.notes[0], /SO-26090105-0/);
});

/* ── รายการงานบริการของใบสั่งขาย (mig 0392 · PR-A) — ฝ่ายขายเลือกโซนในใบเอง ⇒ `sales_order_line_zones."zoneId"`
   เป็น FK RESTRICT · ขวางแบบเดียวกับบรรทัดใบย้อนหลัง แต่ทางออกคนละทาง (ถอดโซนออกจากใบ · ไม่ใช่ลบใบ) ────────── */
const withAllocations = (base = seed({ withLines: false })) => ({
  ...base,
  sales_order_line_zones: [
    { id: 'SLZ-1', salesOrderId: 'SOR-P', salesOrderLineId: 'SOL-9', zoneId: 'Z1' },
    { id: 'SLZ-2', salesOrderId: 'SOR-C', salesOrderLineId: 'SOL-8', zoneId: 'Z2' },
  ],
  sales_orders: [
    ...base.sales_orders.map((o) => ({ ...o, status: 'approved' })),
    { id: 'SOR-C', orderNumber: 'SO-26090010-0', status: 'cancelled' },
  ],
});

test('🔴 โซนที่ฝ่ายขายเลือกในรายการงานบริการ — พรีวิว blocked พร้อมเลขใบ + สถานะ · ตัวลบจริงไม่ยิงคำสั่งเขียน', async () => {
  const db = fakeSupabase(withAllocations());
  const manifest = await zoneForceManifest(db, 'Z1');
  assert.equal(manifest.blocked, true);
  assert.deepEqual(manifest.cascade, []);
  assert.equal(manifest.notes[0], 'โซนนี้อยู่ในรายการงานบริการของ SO-26080077-0 (อนุมัติแล้ว) — ถอดโซนออกจากใบก่อน หรือปิดใช้งานโซนแทน');
  assert.deepEqual(writes(db.calls), []);

  const run = fakeSupabase(withAllocations());
  await assert.rejects(() => deleteZoneDeep(run, 'Z1'), /โซนนี้อยู่ในรายการงานบริการของ SO-26080077-0 \(อนุมัติแล้ว\)/);
  assert.deepEqual(writes(run.calls), [], 'ห้ามลบรอบขาย/ผลวัดไปก่อนแล้วค่อยล้มที่ FK');
  assert.equal(run.tables.service_zone_terms.length, 1);
});

test('🔴 ใบที่ยกเลิกแล้วยังขวาง (อ่านใบด้วย id ไม่กรองสถานะ) — สถานะอยู่ในข้อความให้รู้ว่าต้องไปแก้ที่ไหน', async () => {
  const db = fakeSupabase(withAllocations());
  const manifest = await zoneForceManifest(db, 'Z2');
  assert.equal(manifest.blocked, true);
  assert.match(manifest.notes[0], /SO-26090010-0 \(ยกเลิก\)/);
  const orderRead = db.calls.find((c) => c.table === 'sales_orders');
  assert.ok(orderRead, 'ต้องอ่านใบเพื่อบอกเลขที่ใบ');
});

test('🔴 ไซต์ที่มีโซนอยู่ในรายการงานบริการ — ขวางทั้งไซต์ · นัด/เครื่อง/โซนยังอยู่ครบ', async () => {
  const preview = fakeSupabase(withAllocations());
  const manifest = await siteForceManifest(preview, 'S1');
  assert.equal(manifest.blocked, true);
  assert.match(manifest.notes[0], /^ไซต์นี้มีโซนที่อยู่ในรายการงานบริการของ SO-26080077-0 \(อนุมัติแล้ว\), SO-26090010-0 \(ยกเลิก\) — /);

  const db = fakeSupabase(withAllocations());
  await assert.rejects(() => deleteSiteDeep(db, 'S1'), /ไซต์นี้มีโซนที่อยู่ในรายการงานบริการ/);
  assert.deepEqual(writes(db.calls), []);
  assert.equal(db.tables.service_visits.length, 1);
  assert.equal(db.tables.service_zones.length, 2);
});

test('ขวางทั้งสองทางพร้อมกัน — ข้อความบอกทั้งใบย้อนหลัง (ลบใบก่อน) และรายการงานบริการ (ถอดโซนก่อน)', async () => {
  const db = fakeSupabase(withAllocations(seed()));
  const manifest = await zoneForceManifest(db, 'Z1');
  assert.equal(manifest.blocked, true);
  assert.match(manifest.notes[0], /^โซนนี้อยู่ในใบสั่งขายย้อนหลัง SO-26090051-0, SO-26090052-0 — .* · โซนนี้อยู่ในรายการงานบริการของ SO-26080077-0 \(อนุมัติแล้ว\) — ถอดโซนออกจากใบก่อน หรือปิดใช้งานโซนแทน$/);
});

/* ⭐ DD14 (PR-D · mig 0394/P6): ใบย้อนหลังที่บันทึกหลัง 0394 ถือโซนสองทางพร้อมกัน — บรรทัด (`serviceZoneId`) **และ**
   แถวโซนของงานบริการ (โซนเดียวกัน · แพ็คต่อรอบ) ⇒ ใบเดียวกันต้องถูกบอกครั้งเดียวในส่วน "ลบใบนั้นก่อน"
   (ถอดโซนออกจากใบย้อนหลังไม่ได้ — แถวเกิดจากบรรทัด) · ยังขวางเท่าเดิม · ใบ pipeline บนโซนเดียวกันยังถูกบอก */
const historicalBoth = (base = seed()) => ({
  ...withAllocations(base),
  sales_order_line_zones: [
    { id: 'SLZ-H1', salesOrderId: 'SOR-H1', salesOrderLineId: 'SOL-1', zoneId: 'Z1', packsPerRound: 2 },
    { id: 'SLZ-H2', salesOrderId: 'SOR-H2', salesOrderLineId: 'SOL-2', zoneId: 'Z1', packsPerRound: 1 },
  ],
});

test('🔴 ใบย้อนหลังที่มีทั้งบรรทัดและแถวโซนบนโซนเดียวกัน — บอกครั้งเดียว "ลบใบนั้นก่อน" · ไม่มีส่วน "ถอดโซนออกจากใบ"', async () => {
  const db = fakeSupabase(historicalBoth());
  const manifest = await zoneForceManifest(db, 'Z1');
  assert.equal(manifest.blocked, true);
  assert.deepEqual(manifest.cascade, []);
  assert.equal(manifest.notes[0], 'โซนนี้อยู่ในใบสั่งขายย้อนหลัง SO-26090051-0, SO-26090052-0 — ลบถาวรไม่ได้แม้ใช้สิทธิ์ผู้ดูแลระบบ'
    + 'จนกว่าจะลบใบนั้นก่อน (ยกเลิกใบอย่างเดียวบรรทัดยังชี้โซนอยู่) · ถ้าแค่เลิกใช้ ให้ปิดใช้งานแทน');
  assert.doesNotMatch(manifest.notes[0], /รายการงานบริการ|ถอดโซนออกจากใบ/);
  assert.deepEqual(writes(db.calls), []);

  const run = fakeSupabase(historicalBoth());
  await assert.rejects(() => deleteZoneDeep(run, 'Z1'), (error) => error.message === manifest.notes[0]);
  assert.deepEqual(writes(run.calls), [], 'ยังขวางก่อนขั้นแรก');

  const site = await siteForceManifest(fakeSupabase(historicalBoth()), 'S1');
  assert.equal(site.blocked, true);
  assert.doesNotMatch(site.notes[0], /รายการงานบริการ/);
});

test('ใบย้อนหลังซ้ำกับแถวโซนถูกตัดเฉพาะใบนั้น — ใบ pipeline บนโซนเดียวกันยังอยู่ในส่วน "รายการงานบริการ" · แถวโซนยังขวาง', async () => {
  const base = historicalBoth();
  const db = fakeSupabase({
    ...base,
    sales_order_line_zones: [
      ...base.sales_order_line_zones,
      { id: 'SLZ-P', salesOrderId: 'SOR-P', salesOrderLineId: 'SOL-9', zoneId: 'Z1', packsPerRound: 3 },
    ],
  });
  const manifest = await zoneForceManifest(db, 'Z1');
  assert.equal(manifest.blocked, true);
  assert.match(manifest.notes[0], /^โซนนี้อยู่ในใบสั่งขายย้อนหลัง SO-26090051-0, SO-26090052-0 — .* · โซนนี้อยู่ในรายการงานบริการของ SO-26080077-0 \(อนุมัติแล้ว\) — ถอดโซนออกจากใบก่อน หรือปิดใช้งานโซนแทน$/);
  assert.doesNotMatch(manifest.notes[0], /SO-26090051-0 \(/, 'ใบย้อนหลังไม่ถูกพิมพ์ซ้ำในส่วนรายการงานบริการ');

  /* แถวโซนของใบย้อนหลังที่บรรทัดชี้ **อีกโซน** (โซนไม่ตรง) = ตัวขวางตัวเดียวบนโซนนี้ ⇒ ยังต้องบอกว่าให้ถอดโซนออก */
  const mismatch = fakeSupabase({
    ...seed({ withLines: false }),
    sales_order_lines: [{ id: 'SOL-1', salesOrderId: 'SOR-H1', serviceZoneId: 'Z2' }],
    sales_order_line_zones: [{ id: 'SLZ-H1', salesOrderId: 'SOR-H1', salesOrderLineId: 'SOL-1', zoneId: 'Z1', packsPerRound: 2 }],
    sales_orders: [{ id: 'SOR-H1', orderNumber: 'SO-26090051-0', status: 'draft' }],
  });
  const only = await zoneForceManifest(mismatch, 'Z1');
  assert.equal(only.blocked, true);
  assert.equal(only.notes[0], 'โซนนี้อยู่ในรายการงานบริการของ SO-26090051-0 (ฉบับร่าง) — ถอดโซนออกจากใบก่อน หรือปิดใช้งานโซนแทน');
});

test('🔴 อ่านรายการงานบริการไม่ขึ้น = โยน ไม่ใช่ "ไม่มี" (ด่านหน้างานทำลาย) — ตัวลบจริงไม่ยิงคำสั่งเขียน', async () => {
  const preview = fakeSupabase(withAllocations(), { failTable: 'sales_order_line_zones' });
  await assert.rejects(() => zoneForceManifest(preview, 'Z1'), /ตรวจรายการงานบริการของใบสั่งขายที่เลือกโซนไม่สำเร็จ/);
  const run = fakeSupabase(withAllocations(), { failTable: 'sales_order_line_zones' });
  await assert.rejects(() => deleteZoneDeep(run, 'Z1'), /ตรวจรายการงานบริการของใบสั่งขายที่เลือกโซนไม่สำเร็จ/);
  assert.deepEqual(writes(run.calls), []);
  const orders = fakeSupabase(withAllocations(), { failTable: 'sales_orders' });
  await assert.rejects(() => deleteSiteDeep(orders, 'S1'), /ตรวจใบสั่งขายที่ชี้โซนไม่สำเร็จ/);
  assert.deepEqual(writes(orders.calls), []);
});

test('รายการงานบริการอ่านเฉพาะคอลัมน์ที่ต้องใช้ · ใบอ่านด้วย id ล้วนไม่มีตัวกรองสถานะ (ไม่เป็นผู้ต้องสงสัยของยามเงิน)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./forceDeleteService.js', import.meta.url), 'utf8');
  assert.match(src, /\.from\('sales_order_line_zones'\)\.select\('id, "salesOrderId", "zoneId"'\)\s*\.in\('zoneId', chunk\)/);
  assert.match(src, /\.from\('sales_orders'\)\.select\('id, "orderNumber", status'\)\s*\.in\('id', chunk\)/);
  assert.doesNotMatch(src, /\.(eq|in|neq)\(\s*'status'/);
});

/* ลบโซนแบบปกติ (ไม่ใช่บังคับ) ชน FK สองตัวที่ทางออกต่างกัน — รอบขาย (0297) กับบรรทัดใบสั่งขาย (0374)
   ⇒ route ต้องแยกข้อความตามชื่อ FK ไม่ใช่ตอบ "มีรอบขายผูกอยู่" กับทุก 23503 */
test('ลบโซนแบบปกติ: 23503 จากบรรทัดใบสั่งขาย (sales_order_lines_serviceZoneId_fkey) ได้ข้อความของมันเอง', async () => {
  const { readFileSync } = await import('node:fs');
  const route = readFileSync(new URL('../../app/api/service/sites/[id]/zones/[zoneId]/route.js', import.meta.url), 'utf8');
  const fk = route.indexOf("includes('sales_order_lines_serviceZoneId_fkey')");
  const terms = route.indexOf("conflict('โซนนี้มีรอบขายผูกอยู่");
  assert.ok(fk > 0 && terms > fk, 'ต้องถามชื่อ FK ของบรรทัดก่อนตกไปข้อความรอบขาย');
  assert.match(route, /conflict\('โซนนี้อยู่ในใบสั่งขาย ลบไม่ได้ — ปิดใช้งานแทนเพื่อเก็บประวัติ'\)/);
});

/* FK ตัวที่สาม (mig 0392): `sales_order_line_zones_zone_fk` — โซนที่ฝ่ายขายเลือกในรายการงานบริการ
   ⚠️ ชื่อ FK ตั้งตายตัวใน 0392 เพื่อจุดนี้ · ต้องถามก่อนตกไปข้อความ "มีรอบขายผูกอยู่" */
test('ลบโซนแบบปกติ: 23503 จากรายการงานบริการ (sales_order_line_zones_zone_fk) ได้ข้อความของมันเอง', async () => {
  const { readFileSync } = await import('node:fs');
  const route = readFileSync(new URL('../../app/api/service/sites/[id]/zones/[zoneId]/route.js', import.meta.url), 'utf8');
  const fk = route.indexOf("detail.includes('sales_order_line_zones_zone_fk')");
  const terms = route.indexOf("conflict('โซนนี้มีรอบขายผูกอยู่");
  assert.ok(fk > 0 && terms > fk, 'ต้องถามชื่อ FK ของรายการงานบริการก่อนตกไปข้อความรอบขาย');
  assert.match(route, /if \(detail\.includes\('sales_order_line_zones_zone_fk'\)\) return conflict\('โซนนี้ถูกเลือกไว้ในรายการงานบริการของใบสั่งขาย ลบไม่ได้ — ให้ฝ่ายขายถอดโซนออกจากใบ หรือปิดใช้งานโซนแทน'\);/);
  const migration = readFileSync(new URL('../../../supabase/migrations/0392_so_service_setup.sql', import.meta.url), 'utf8');
  assert.match(migration, /CONSTRAINT sales_order_line_zones_zone_fk\s+FOREIGN KEY \("zoneId"\) REFERENCES public\.service_zones\(id\) ON DELETE RESTRICT/,
    'ชื่อ FK ต้องตรงกับที่ route จับ');
});
