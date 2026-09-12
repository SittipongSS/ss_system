// ── ตัวเขียนแถวงาน NPD ชนดัชนีคู่ซ้ำ (mig 0356) — อีกคำขอเขียนไปก่อน = ผลที่ต้องการ ไม่ใช่ error ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { insertNpdWorkRows } from './npdWorkRowsApply.js';

/* supabase ปลอม: ตาราง dept_request_items ตัวเดียว · insert ทั้งก้อนล้มถ้าชนคู่ต้นทางที่รับเรื่องแล้ว (แบบดัชนีจริง)
   `before(n)` = สิ่งที่ "อีกคำขอ" ทำก่อน insert ครั้งที่ n ของเรา (จำลองการแข่งกัน) */
function fakeSupabase(existing = [], { before = () => {} } = {}) {
  const table = [...existing];
  const calls = { insert: 0, batches: [] };
  const indexed = (r) => r.lineKind === 'product_dev' && !r.derivedFromItemId && r.ackAt;
  const key = (r) => `${r.requestId}|${r.categoryCode}|${r.scentId}`;
  return {
    table,
    calls,
    from(name) {
      assert.equal(name, 'dept_request_items');
      return {
        insert(rows) {
          calls.insert += 1;
          const forced = before(calls.insert, table);
          if (forced) return Promise.resolve({ error: forced });
          const list = Array.isArray(rows) ? rows : [rows];
          calls.batches.push(list.map((r) => `${r.categoryCode}::${r.scentId}`));
          const taken = new Set(table.filter(indexed).map(key));
          if (list.some((r) => indexed(r) && taken.has(key(r)))) {
            return Promise.resolve({ error: { code: '23505', message: 'duplicate key value violates unique constraint "dept_request_items_product_pair_uk"' } });
          }
          table.push(...list);
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq: (col, value) => {
              assert.equal(col, 'requestId');
              return Promise.resolve({ data: table.filter((r) => r.requestId === value), error: null });
            },
          };
        },
      };
    },
  };
}
const row = (id, categoryCode, scentId, over = {}) => ({
  id, requestId: 'RQ-1', lineKind: 'product_dev', categoryCode, scentId, ackAt: '2026-09-11', sortOrder: 1, ...over,
});

test('ไม่ชน = เขียนทั้งชุด · เรียงตามคู่ก่อนเขียน (สองคนเขียนลำดับเดียวกัน = ไม่ deadlock)', async () => {
  const db = fakeSupabase();
  const out = await insertNpdWorkRows(db, 'RQ-1', [row('A', '01-009', 'SC-1'), row('B', '01-006', 'SC-2')]);
  assert.equal(out.error, null);
  assert.deepEqual(out.inserted.map((r) => r.id).sort(), ['A', 'B']);
  assert.deepEqual(db.calls.batches[0], ['01-006::SC-2', '01-009::SC-1']);
});

test('⭐ อีกคำขอเขียนครบไปก่อน = สำเร็จแบบไม่เขียนอะไร (ไม่ใช่คำเตือนให้ซ่อม)', async () => {
  const db = fakeSupabase([row('X', '01-009', 'SC-1'), row('Y', '01-006', 'SC-2')]);
  const out = await insertNpdWorkRows(db, 'RQ-1', [row('A', '01-009', 'SC-1'), row('B', '01-006', 'SC-2')]);
  assert.deepEqual(out, { inserted: [], error: null });
  assert.equal(db.table.length, 2); // ไม่มีแถวซ้ำ
});

test('⭐ อีกคำขอเขียนไปบางคู่ = เติมเฉพาะคู่ที่ขาด · ลำดับต่อท้ายของจริง', async () => {
  const db = fakeSupabase([row('X', '01-009', 'SC-1', { sortOrder: 7 })]);
  const out = await insertNpdWorkRows(db, 'RQ-1', [row('A', '01-009', 'SC-1'), row('B', '01-006', 'SC-2')]);
  assert.equal(out.error, null);
  assert.deepEqual(out.inserted.map((r) => [r.id, r.sortOrder]), [['B', 8]]);
  assert.deepEqual(db.table.map((r) => r.id).sort(), ['B', 'X']);
});

test('⭐ สามคนพร้อมกัน: ชนรอบสองก็ยังจบแบบสำเร็จเมื่อทุกคู่มีแถวแล้ว', async () => {
  // ก่อนรอบสองของเรา คำขอที่สามเขียนคู่ที่เราเหลืออยู่ไปก่อน
  const db = fakeSupabase([row('X', '01-009', 'SC-1')], {
    before: (n, table) => { if (n === 2) table.push(row('Z', '01-006', 'SC-2')); },
  });
  const out = await insertNpdWorkRows(db, 'RQ-1', [row('A', '01-009', 'SC-1'), row('B', '01-006', 'SC-2')]);
  assert.deepEqual(out, { inserted: [], error: null });
  assert.equal(db.table.filter((r) => r.scentId === 'SC-2').length, 1);
});

test('deadlock (40P01) = อีกคนกำลังเขียน — อ่านใหม่แล้วเติมที่ขาด ไม่ใช่ error ดิบ', async () => {
  const db = fakeSupabase([], {
    before: (n, table) => {
      if (n !== 1) return null;
      table.push(row('Z', '01-009', 'SC-1'));
      return { code: '40P01', message: 'deadlock detected' };
    },
  });
  const out = await insertNpdWorkRows(db, 'RQ-1', [row('A', '01-009', 'SC-1'), row('B', '01-006', 'SC-2')]);
  assert.equal(out.error, null);
  assert.deepEqual(out.inserted.map((r) => r.id), ['B']);
});

test('error อื่นที่ไม่ใช่การแข่งกัน = ส่งต่อผู้เรียก ไม่ลองใหม่', async () => {
  const db = fakeSupabase([], { before: () => ({ code: '23503', message: 'boom' }) });
  const out = await insertNpdWorkRows(db, 'RQ-1', [row('A', '01-009', 'SC-1')]);
  assert.deepEqual(out, { inserted: [], error: 'boom' });
  assert.equal(db.calls.insert, 1);
});

test('ชนไม่รู้จบ (ข้อมูลเพี้ยน) = หยุดตามเพดานรอบ แล้วคืน error', async () => {
  const db = fakeSupabase([], { before: () => ({ code: '23505', message: 'dup' }) });
  const out = await insertNpdWorkRows(db, 'RQ-1', [row('A', '01-009', 'SC-1')]);
  assert.equal(out.error, 'dup');
  assert.equal(db.calls.insert, 2);
});
