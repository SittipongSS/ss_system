// Tests ตัวไล่ดึงทุกแถว (กันเพดาน Max rows = 1000 ตัดเงียบ). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { fetchAll, fetchAllResult, SUPABASE_MAX_ROWS } from './supabaseFetchAll.js';

// query ปลอมที่เลียนพฤติกรรมจริงของ PostgREST: คืนได้ไม่เกิน pageSize ต่อครั้ง
function fakeTable(totalRows, { failOnPage = null } = {}) {
  const calls = [];
  const rows = Array.from({ length: totalRows }, (_, i) => ({ id: i + 1 }));
  const make = () => ({
    range(from, to) {
      calls.push([from, to]);
      if (failOnPage !== null && calls.length === failOnPage) {
        return Promise.resolve({ data: null, error: new Error('boom') });
      }
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    },
  });
  return { make, calls };
}

test('ตารางเล็กกว่าเพดาน — ยิงครั้งเดียว ได้ครบ', async () => {
  const t = fakeTable(20);
  const out = await fetchAll(t.make, { pageSize: 1000 });
  assert.equal(out.length, 20);
  assert.equal(t.calls.length, 1);
});

test('ตารางใหญ่กว่าเพดาน — ไล่จนหมด ไม่ตกแถว', async () => {
  const t = fakeTable(2820);
  const out = await fetchAll(t.make, { pageSize: 1000 });
  assert.equal(out.length, 2820);
  assert.equal(t.calls.length, 3); // 1000 + 1000 + 820 (หน้าสุดท้ายไม่เต็ม = จบ)
  assert.deepEqual(t.calls[0], [0, 999]);
  assert.deepEqual(t.calls[2], [2000, 2999]);
  // ไม่มี id ซ้ำและครบทุกตัว
  assert.equal(new Set(out.map((r) => r.id)).size, 2820);
});

test('จำนวนแถวเท่าเพดานพอดี — ต้องยิงอีกหน้าเพื่อรู้ว่าหมดแล้ว', async () => {
  const t = fakeTable(1000);
  const out = await fetchAll(t.make, { pageSize: 1000 });
  assert.equal(out.length, 1000);
  assert.equal(t.calls.length, 2); // หน้าเต็มพอดีแยกจาก "ยังมีต่อ" ไม่ได้ ต้องถามอีกที
});

test('ตารางว่าง — ได้ [] ไม่พัง', async () => {
  const t = fakeTable(0);
  assert.deepEqual(await fetchAll(t.make), []);
});

test('pageSize เกินเพดานถูกบีบลงมา — ไม่งั้นหน้าโดนตัดแล้วลูปจบก่อนเวลา', async () => {
  const t = fakeTable(1500);
  const out = await fetchAll(t.make, { pageSize: 5000 });
  assert.equal(out.length, 1500);
  assert.deepEqual(t.calls[0], [0, SUPABASE_MAX_ROWS - 1]);
});

test('error ระหว่างไล่หน้า — โยนออก ไม่คืนข้อมูลครึ่ง ๆ กลาง ๆ', async () => {
  const t = fakeTable(2500, { failOnPage: 2 });
  await assert.rejects(() => fetchAll(t.make, { pageSize: 1000 }), /boom/);
});

test('fetchAllResult — คืนรูป { data, error } เหมือน query ปกติ', async () => {
  const ok = fakeTable(30);
  assert.deepEqual((await fetchAllResult(ok.make)).data.length, 30);

  const bad = fakeTable(30, { failOnPage: 1 });
  const res = await fetchAllResult(bad.make);
  assert.equal(res.data, null);
  assert.match(res.error.message, /boom/);
});
