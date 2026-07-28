// ทะเบียนกลิ่น/สูตรบนหน้าลูกค้า (mig 0171) — จุดที่พังง่ายคือ "สูตรของลูกค้ารายนี้"
// ไม่ได้แปลว่า formulas."customerId" ตรงอย่างเดียว เพราะช่องนั้นเป็น NULL ได้
// (= สูตรกลาง) ส่วน scents."customerId" เป็น NOT NULL เสมอ → สูตรที่ผูกกลิ่นของ
// ลูกค้ารายนี้ก็เป็นของลูกค้ารายนี้ ต้องขึ้นด้วย และต้องขึ้นแถวเดียวถ้าเข้าทั้งสองเกณฑ์
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { customerRelations } from './relations.js';

// fake chainable: .select().eq()/.in()/.order() แล้ว await ได้ (thenable)
// กรองจริงตาม filter ที่ต่อไว้ เพื่อให้เทสต์วัด "เกณฑ์" ไม่ใช่แค่จำนวนครั้งที่เรียก
function query(getRows) {
  const filters = [];
  const chain = {
    eq(col, val) { filters.push((r) => r[col] === val); return chain; },
    in(col, vals) { filters.push((r) => vals.includes(r[col])); return chain; },
    order() { return chain; },
    then(resolve, reject) {
      const data = getRows().filter((r) => filters.every((f) => f(r)));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return chain;
}

function fakeSupabase(rows = {}, tablesQueried = []) {
  return {
    from(table) {
      tablesQueried.push(table);
      return { select: () => query(() => rows[table] || []) };
    },
  };
}

const admin = { id: 'u-admin', role: 'admin' };

const baseRows = {
  products: [], excise_registrations: [], orders: [], projects: [],
  scents: [
    { id: 'SCT-1', code: 'SC-001', name: 'Well sleep', status: 'active', customerId: 'CUS-1' },
    { id: 'SCT-9', code: 'SC-009', name: 'ของลูกค้าอื่น', status: 'active', customerId: 'CUS-2' },
  ],
  formulas: [
    // เข้าเกณฑ์ customerId ตรง ๆ
    { id: 'FML-1', code: 'PF-1', name: 'สูตรผูกลูกค้า', status: 'active', customerId: 'CUS-1', scentId: null },
    // ⭐ customerId ว่าง แต่ผูกกลิ่นของลูกค้ารายนี้ — เคสที่กรอง customerId ล้วนจะทำหาย
    { id: 'FML-2', code: 'PF-2', name: 'สูตรผูกกลิ่น', status: 'active', customerId: null, scentId: 'SCT-1' },
    // เข้าทั้งสองเกณฑ์ — ต้องไม่ขึ้นซ้ำ
    { id: 'FML-3', code: 'PF-3', name: 'สูตรเข้าทั้งคู่', status: 'active', customerId: 'CUS-1', scentId: 'SCT-1' },
    // ของลูกค้าอื่น ไม่เกี่ยวข้องทั้งสองทาง
    { id: 'FML-9', code: 'PF-9', name: 'สูตรลูกค้าอื่น', status: 'active', customerId: 'CUS-2', scentId: 'SCT-9' },
  ],
};

test('กลิ่นของลูกค้ารายนี้เท่านั้นที่ขึ้น', async () => {
  const rel = await customerRelations(fakeSupabase(baseRows), 'CUS-1', admin);
  assert.deepEqual(rel.scents.map((s) => s.id), ['SCT-1']);
});

test('สูตรรวมทั้งที่ผูกลูกค้าตรง ๆ และที่ผูกผ่านกลิ่นของลูกค้ารายนี้', async () => {
  const rel = await customerRelations(fakeSupabase(baseRows), 'CUS-1', admin);
  assert.deepEqual(rel.formulas.map((f) => f.id).sort(), ['FML-1', 'FML-2', 'FML-3']);
});

test('สูตรที่เข้าทั้งสองเกณฑ์ขึ้นแถวเดียว ไม่ซ้ำ', async () => {
  const rel = await customerRelations(fakeSupabase(baseRows), 'CUS-1', admin);
  const ids = rel.formulas.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('ลูกค้าที่ยังไม่มีกลิ่น ยังได้สูตรที่ผูกลูกค้าตรง ๆ (ไม่พังตอนไม่มี scentId ให้ค้น)', async () => {
  const rows = { ...baseRows, scents: [] };
  const tables = [];
  const rel = await customerRelations(fakeSupabase(rows, tables), 'CUS-1', admin);
  assert.deepEqual(rel.scents, []);
  assert.deepEqual(rel.formulas.map((f) => f.id).sort(), ['FML-1', 'FML-3']);
  // ไม่มีกลิ่น = ไม่ต้องยิง query หาสูตรจาก scentId (ครั้งเดียวพอ)
  assert.equal(tables.filter((t) => t === 'formulas').length, 1);
});

test('ลูกค้าที่ไม่มีอะไรในทะเบียนเลย คืนอาเรย์ว่าง ไม่ใช่ undefined', async () => {
  const rel = await customerRelations(fakeSupabase(baseRows), 'CUS-404', admin);
  assert.deepEqual(rel.scents, []);
  assert.deepEqual(rel.formulas, []);
});
