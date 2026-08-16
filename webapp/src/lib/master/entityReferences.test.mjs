// Tests ทะเบียน "ใครอ้างถึงลูกค้า" + ด่านก่อนลบ. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import {
  CUSTOMER_REFERENCE_TABLES, CUSTOMER_REFERENCE_TABLE_NAMES, findCustomerReferences,
  REFERENCE_REGISTRY, referenceTableNames, findEntityReferences,
} from './entityReferences.js';

// supabase ปลอม: rows = { ตาราง: [แถว...] }
function fakeDb(rows, { failOn = null } = {}) {
  const seen = [];
  return {
    seen,
    from(table) {
      seen.push(table);
      const data = rows[table] || [];
      const builder = {
        _cols: null,
        select(cols) { this._cols = cols; return this; },
        eq() { return this; },
        limit() { return this; },
        then(resolve) {
          if (failOn === table) return resolve({ data: null, count: null, error: new Error('ตารางพัง') });
          return resolve({ data, count: data.length, error: null });
        },
      };
      return builder;
    },
  };
}

test('ทะเบียนไม่มีตารางซ้ำ และทุกรายการมี label', () => {
  assert.equal(new Set(CUSTOMER_REFERENCE_TABLE_NAMES).size, CUSTOMER_REFERENCE_TABLE_NAMES.length);
  for (const entry of CUSTOMER_REFERENCE_TABLES) {
    assert.ok(entry.label && entry.label.trim(), `${entry.table} ไม่มี label`);
  }
});

test('ทะเบียนต้องครอบ 4 ตารางเดิม + ตัวที่เคยตกหล่นจนเอกสารเสียสายเชื่อม', () => {
  for (const t of ['projects', 'orders', 'excise_registrations', 'products',
    'sales_deals', 'sales_leads', 'quotations', 'sales_orders']) {
    assert.ok(CUSTOMER_REFERENCE_TABLE_NAMES.includes(t), `ทะเบียนขาด ${t}`);
  }
});

test('ไม่มีอะไรอ้างถึง → ลบได้ (refs ว่าง)', async () => {
  const { refs, error } = await findCustomerReferences(fakeDb({}), 'CUS-1');
  assert.equal(error, null);
  assert.deepEqual(refs, []);
});

test('มีดีลอ้างอยู่ → บล็อก พร้อมบอกเลขที่ให้ตามไปดูถูกใบ', async () => {
  const { refs } = await findCustomerReferences(fakeDb({
    sales_deals: [{ code: 'DL-26080196' }],
  }), 'CUS-1');
  assert.deepEqual(refs, ['1 ดีล (DL-26080196)']);
});

test('ตารางที่ไม่มี sample → นับอย่างเดียว ไม่โชว์ตัวอย่าง', async () => {
  const { refs } = await findCustomerReferences(fakeDb({
    excise_registrations: [{ id: 'REG-1' }, { id: 'REG-2' }],
  }), 'CUS-1');
  assert.deepEqual(refs, ['2 การขึ้นทะเบียนสรรพสามิต']);
});

test('ตัวอย่างจำกัด 5 รายการ แล้วต่อท้ายด้วย …', async () => {
  const { refs } = await findCustomerReferences(fakeDb({
    products: Array.from({ length: 5 }, (_, i) => ({ fgCode: `FG-${i}` })),
  }), 'CUS-1');
  // fake คืน count = จำนวนแถวที่ส่งมา (5) และ sample ครบ 5 → ไม่มี …
  assert.match(refs[0], /^5 สินค้า \(FG-0, FG-1, FG-2, FG-3, FG-4\)$/);
});

test('หลายตารางพร้อมกัน → รายงานครบทุกอัน', async () => {
  const { refs } = await findCustomerReferences(fakeDb({
    sales_deals: [{ code: 'DL-1' }],
    scents: [{ code: 'PF1190101' }, { code: 'PF1190102' }],
    sales_orders: [{ orderNumber: 'SO-1' }],
  }), 'CUS-1');
  assert.equal(refs.length, 3);
  assert.ok(refs.some((r) => r.startsWith('1 ดีล')));
  assert.ok(refs.some((r) => r.startsWith('2 กลิ่นในทะเบียน')));
  assert.ok(refs.some((r) => r.startsWith('1 ใบสั่งขาย')));
});

test('อ่านตารางไหนไม่ได้ = ยังไม่รู้ว่ามีอะไรอ้าง → ต้องคืน error ไม่ใช่ปล่อยผ่าน', async () => {
  const { refs, error } = await findCustomerReferences(
    fakeDb({ sales_deals: [{ code: 'DL-1' }] }, { failOn: 'quotations' }),
    'CUS-1',
  );
  assert.ok(error, 'ต้องคืน error');
  assert.match(error.message, /quotations/);
  assert.deepEqual(refs, []);
});

test('ยิงครบทุกตารางในทะเบียน — ไม่ตกตัวไหน', async () => {
  const db = fakeDb({});
  await findCustomerReferences(db, 'CUS-1');
  assert.deepEqual([...db.seen].sort(), [...CUSTOMER_REFERENCE_TABLE_NAMES].sort());
});

// ── สินค้า (เพิ่ม 2026-08-16) ──────────────────────────────────────────────
test('ทะเบียนสินค้าต้องครอบตารางที่เคยตกหล่นจนบรรทัดเอกสารเสียสายเชื่อม', () => {
  const names = referenceTableNames('product');
  for (const t of [
    // สามตัวที่ด่านเดิมตรวจ
    'project_products', 'order_items', 'excise_registrations',
    // ที่ตกหล่น — ทุกตัวมีข้อมูลจริงอยู่บนฐาน
    'quotation_lines', 'sales_order_lines', 'dept_requests',
    'sahamit_forecast_lines', 'sahamit_po_lines', 'production_jobs',
  ]) {
    assert.ok(names.includes(t), `ทะเบียนสินค้าขาด ${t}`);
  }
});

test('สมุดประวัติราคาต้องอยู่ในลิสต์ยกเว้น พร้อมเหตุผล — ไม่ใช่ตัวบล็อกการลบ', () => {
  /* 🪤 แถวแรกเขียนตั้งแต่ตอน **สร้าง** สินค้า ⇒ ถ้านับเป็นการอ้างอิง จะลบสินค้าไม่ได้
     เลยสักตัว และทำลายกติกา "ลบร่างที่ไม่เคยอนุมัติ = เลขกลับมาใช้ได้" (mig 0248) */
  const ignored = REFERENCE_REGISTRY.product.ignored;
  assert.ok(ignored.product_price_history, 'ต้องประกาศไว้ในลิสต์ยกเว้น');
  assert.ok(ignored.product_price_history.length > 10, 'ต้องเขียนเหตุผลกำกับ');
  assert.ok(!referenceTableNames('product').includes('product_price_history'),
    'ห้ามอยู่ในลิสต์ที่บล็อกการลบพร้อมกัน');
});

test('findEntityReferences ใช้คอลัมน์ของ entity นั้น (productId ไม่ใช่ customerId)', async () => {
  const seen = [];
  const db = {
    from(table) {
      const b = {
        select() { return b; },
        eq(col, val) { seen.push(`${table}.${col}=${val}`); return b; },
        limit() { return b; },
        then(resolve) { return resolve({ data: [], count: 0, error: null }); },
      };
      return b;
    },
  };
  await findEntityReferences(db, 'product', 'PRD-1');
  assert.ok(seen.every((s) => s.includes('.productId=PRD-1')), 'ต้องกรองด้วย productId ทุกตาราง');
  assert.equal(seen.length, referenceTableNames('product').length, 'ต้องยิงครบทุกตารางในทะเบียน');
});

test('entity ที่ไม่รู้จัก → โยน error ไม่ใช่คืนว่าง (ว่าง = ลบผ่าน)', async () => {
  await assert.rejects(() => findEntityReferences({}, 'scent', 'X'), /ไม่รู้จัก entity/);
});
