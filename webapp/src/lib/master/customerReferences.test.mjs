// Tests ทะเบียน "ใครอ้างถึงลูกค้า" + ด่านก่อนลบ. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import {
  CUSTOMER_REFERENCE_TABLES, CUSTOMER_REFERENCE_TABLE_NAMES, findCustomerReferences,
} from './customerReferences.js';

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
