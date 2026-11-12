import test from 'node:test';
import assert from 'node:assert/strict';

import { fgCodeForCustomer } from './masterCodes.js';
import { REFERENCE_REGISTRY, findReferencedIds } from './entityReferences.js';
import {
  FG_RECODE_OWN_TABLES, applyFgRecode, fgMoveBlockedMessage, loadFgRecodePlan, planFgRecode,
} from './fgCustomerCode.js';

/* 🐞 ที่มา (ตรวจทั้งระบบ 12/11/2026): ท่อนลูกค้าในรหัส FG ไม่เดินตามเจ้าของสองทาง
   ① ย้ายลูกค้าบน FG (AR-000 → AR-1044 ค้าง `FG-0000-…`) ② แก้รหัส AR (AR-1001 → AR-867 ค้าง `FG-1001-…`)
   มติเจ้าของ: ยังไม่ขึ้นเอกสาร = เปลี่ยนให้ · ขึ้นแล้ว = ① บล็อก ② คงรหัสเดิม */

test('fgCodeForCustomer เขียนเฉพาะท่อนลูกค้า — หมวดและเลขรันเดิม', () => {
  assert.equal(fgCodeForCustomer('FG-0000-02-002-10218', 'AR-1044'), 'FG-1044-02-002-10218');
  // ลูกค้ารหัส 3 หลักเติมศูนย์ (กติกาเดียวกับตอนออกรหัส)
  assert.equal(fgCodeForCustomer('FG-1001-01-006-10006', 'AR-867'), 'FG-0867-01-006-10006');
  // หมวด 03/04 ไม่มีเลขรัน
  assert.equal(fgCodeForCustomer('FG-1001-03-002', 'AR-867'), 'FG-0867-03-002');
  // ช่องว่างหัวท้ายของรหัสเดิมไม่ติดไปกับรหัสใหม่
  assert.equal(fgCodeForCustomer(' FG-1001-03-002\t', 'AR-867'), 'FG-0867-03-002');
});

test('fgCodeForCustomer ไม่แตะรหัสกรอกมือ และไม่ประกอบจาก AR ที่ผิดรูป', () => {
  // รหัสกรอกมือท่อนลูกค้า 3 หลัก เลขรัน 4 หลัก — แปลงเป็นรูประบบไม่ได้
  assert.equal(fgCodeForCustomer('FG-319-01-004-1250', 'AR-673'), null);
  assert.equal(fgCodeForCustomer('FG-0000-02-002-10218', ''), null);
  assert.equal(fgCodeForCustomer('FG-0000-02-002-10218', 'AR-12'), null);
  assert.equal(fgCodeForCustomer('', 'AR-1044'), null);
});

test('planFgRecode: ยังไม่ขึ้นเอกสาร = เปลี่ยน · ขึ้นแล้ว / กรอกมือ / ชน = คงเดิมพร้อมเหตุ', () => {
  const products = [
    { id: 'P1', fgCode: 'FG-1001-01-006-10006' },
    { id: 'P2', fgCode: 'FG-1001-03-002' },
    { id: 'P3', fgCode: 'FG-1001-01-037-10002' },
    { id: 'P4', fgCode: 'FG-867-01-002-1500' },
    { id: 'P5', fgCode: 'FG-0867-01-006-10028' }, // สร้างหลังแก้ AR — ถูกอยู่แล้ว
    { id: 'P6', fgCode: 'FG-1001-03-005' },
  ];
  const referenced = new Map([['P3', ['บรรทัดใบเสนอราคา', 'บรรทัดใบสั่งขาย']]]);
  const taken = new Set(['FG-0867-03-005']);
  const { changes, kept } = planFgRecode({ products, arCode: 'AR-867', referenced, taken });
  assert.deepEqual(changes, [
    { id: 'P1', fgCode: 'FG-1001-01-006-10006', next: 'FG-0867-01-006-10006' },
    { id: 'P2', fgCode: 'FG-1001-03-002', next: 'FG-0867-03-002' },
  ]);
  assert.deepEqual(kept.map((k) => [k.id, k.reason]), [
    ['P3', 'ขึ้นเอกสารแล้ว: บรรทัดใบเสนอราคา · บรรทัดใบสั่งขาย'],
    ['P4', 'รหัสกรอกมือ — ระบบไม่เขียนท่อนลูกค้าให้'],
    ['P6', 'รหัสใหม่ชนกับ FG ที่มีอยู่แล้ว'],
  ]);
});

test('planFgRecode: สองตัวในแผนเดียวกันได้รหัสใหม่ซ้ำกัน = ตัวที่สองคงเดิม', () => {
  // หมวด 03/04 ไม่มีเลขรัน — ลูกค้าเดียวมี FG-1001-03-002 กับ FG-0867-03-002 ไม่ได้อยู่แล้ว
  // แต่ย้ายสองรายรวมกันเป็นรายเดียวทำให้เกิดได้ (กันไว้ ไม่ใช่ปล่อยให้ unique ของฐานตีกลับกลางทาง)
  const { changes, kept } = planFgRecode({
    products: [{ id: 'A', fgCode: 'FG-1001-03-002' }, { id: 'B', fgCode: 'FG-1002-03-002' }],
    arCode: 'AR-1044',
  });
  assert.equal(changes.length, 1);
  assert.equal(kept[0].id, 'B');
});

test('ตารางที่ไม่นับว่า "ขึ้นเอกสาร" ต้องอยู่ในทะเบียนผู้อ้างสินค้าจริง และมีเหตุผลกำกับ', () => {
  const declared = new Set(REFERENCE_REGISTRY.product.tables.map((t) => t.table));
  for (const [table, reason] of Object.entries(FG_RECODE_OWN_TABLES)) {
    assert.ok(declared.has(table), `${table} ไม่อยู่ในทะเบียน — ข้ามไม่ได้`);
    assert.ok(reason.length > 30, `${table} ต้องเขียนเหตุผลว่าทำไมไม่นับ`);
  }
  // เอกสารที่ออกให้ลูกค้าต้องนับเสมอ — ข้ามเมื่อไร FG ที่อยู่บนใบจะถูกย้าย/เปลี่ยนรหัสเงียบ ๆ
  for (const table of ['quotation_lines', 'sales_order_lines', 'excise_registrations', 'production_jobs', 'product_spec_documents']) {
    assert.equal(table in FG_RECODE_OWN_TABLES, false, `${table} เป็นเอกสาร ห้ามข้าม`);
    assert.ok(declared.has(table), `${table} ต้องอยู่ในทะเบียนผู้อ้างสินค้า`);
  }
});

// supabase ปลอม: rows = { ตาราง: [แถว] } · จด .in/.range ที่ถูกเรียก
function fakeDb(rows, { failOn = null, pageSize = 1000 } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const state = { table, filters: [], range: [0, pageSize - 1], update: null };
      const builder = {
        select() { return builder; },
        in(column, values) { state.filters.push((r) => values.includes(r[column])); return builder; },
        eq(column, value) { state.filters.push((r) => r[column] === value); return builder; },
        order() { return builder; },
        limit() { return builder; },
        range(from, to) { state.range = [from, to]; return builder; },
        update(patch) { state.update = patch; return builder; },
        then(resolve) {
          calls.push(state);
          if (failOn === table) return resolve({ data: null, error: new Error('ตารางพัง') });
          const hit = (rows[table] || []).filter((r) => state.filters.every((f) => f(r)));
          if (state.update) {
            for (const r of hit) Object.assign(r, state.update);
            return resolve({ data: hit.map((r) => ({ ...r })), error: null });
          }
          return resolve({ data: hit.slice(state.range[0], state.range[1] + 1), error: null });
        },
      };
      return builder;
    },
  };
}

test('findReferencedIds รวมป้ายรายตัว ข้ามตารางที่สั่ง และไม่รับชื่อตารางที่ไม่อยู่ในทะเบียน', async () => {
  const db = fakeDb({
    quotation_lines: [{ id: 'l1', productId: 'P1' }, { id: 'l2', productId: 'P1' }],
    sales_order_lines: [{ id: 's1', productId: 'P1' }],
    product_specs: [{ id: 'sp', productId: 'P2' }],
  });
  const { byId, error } = await findReferencedIds(db, 'product', ['P1', 'P2', 'P3'], { skip: ['product_specs'] });
  assert.equal(error, null);
  assert.deepEqual(byId.get('P1').sort(), ['บรรทัดใบสั่งขาย', 'บรรทัดใบเสนอราคา'].sort());
  assert.equal(byId.has('P2'), false, 'สเปคของตัวเองไม่นับ');
  assert.equal(db.calls.some((c) => c.table === 'product_specs'), false);
  await assert.rejects(() => findReferencedIds(db, 'product', ['P1'], { skip: ['product_specz'] }), /ไม่อยู่ในทะเบียน/);
});

test('findReferencedIds ไล่หน้าเกิน 1,000 แถว — แถวที่หน้าสองต้องไม่หายเงียบ', async () => {
  const many = Array.from({ length: 1000 }, (_, i) => ({ id: `q${i}`, productId: 'P1' }));
  many.push({ id: 'q-last', productId: 'P2' });
  const { byId } = await findReferencedIds(fakeDb({ quotation_lines: many }), 'product', ['P1', 'P2']);
  assert.ok(byId.has('P2'));
});

test('findReferencedIds อ่านตารางไหนไม่ได้ = error (ยังไม่รู้) ไม่ใช่ "ไม่มีใครอ้าง"', async () => {
  const { byId, error } = await findReferencedIds(fakeDb({}, { failOn: 'sales_order_lines' }), 'product', ['P1']);
  assert.match(error.message, /sales_order_lines/);
  assert.equal(byId.size, 0);
});

test('loadFgRecodePlan อ่านการอ้างอิง + รหัสชน แล้วคืนแผน', async () => {
  const db = fakeDb({
    products: [{ id: 'X', fgCode: 'FG-0867-03-005' }],
    quotation_lines: [{ id: 'l1', productId: 'P3' }],
  });
  const { plan, error } = await loadFgRecodePlan(db, {
    arCode: 'AR-867',
    products: [
      { id: 'P1', fgCode: 'FG-1001-01-006-10006' },
      { id: 'P3', fgCode: 'FG-1001-01-037-10002' },
      { id: 'P6', fgCode: 'FG-1001-03-005' },
    ],
  });
  assert.equal(error, null);
  assert.deepEqual(plan.changes.map((c) => c.next), ['FG-0867-01-006-10006']);
  assert.deepEqual(plan.kept.map((k) => k.id), ['P3', 'P6']);
  const message = fgMoveBlockedMessage(plan.kept[0]);
  assert.match(message, /ย้ายลูกค้าไม่ได้/);
  assert.match(message, /บรรทัดใบเสนอราคา/);
});

test('loadFgRecodePlan อ่านการอ้างอิงไม่ได้ = ไม่มีแผน (ห้ามเขียน)', async () => {
  const { plan, error } = await loadFgRecodePlan(fakeDb({}, { failOn: 'production_jobs' }), {
    arCode: 'AR-867', products: [{ id: 'P1', fgCode: 'FG-1001-01-006-10006' }],
  });
  assert.equal(plan, null);
  assert.ok(error);
});

test('applyFgRecode เขียนแบบ CAS + audit รายตัว — รหัสถูกเปลี่ยนไปก่อนแล้วต้องไม่ทับ', async () => {
  const rows = {
    products: [
      { id: 'P1', fgCode: 'FG-1001-01-006-10006' },
      { id: 'P2', fgCode: 'FG-9999-03-002' }, // มีคนเปลี่ยนไปก่อน
    ],
  };
  const audits = [];
  const { changed, failed } = await applyFgRecode(fakeDb(rows), [
    { id: 'P1', fgCode: 'FG-1001-01-006-10006', next: 'FG-0867-01-006-10006' },
    { id: 'P2', fgCode: 'FG-1001-03-002', next: 'FG-0867-03-002' },
  ], { audit: async (entry) => audits.push(entry), now: () => 'T' });
  assert.deepEqual(changed.map((c) => c.id), ['P1']);
  assert.deepEqual(failed.map((f) => f.id), ['P2']);
  assert.equal(rows.products[0].fgCode, 'FG-0867-01-006-10006');
  assert.equal(rows.products[1].fgCode, 'FG-9999-03-002');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].after.fgCode, 'FG-0867-01-006-10006');
});
