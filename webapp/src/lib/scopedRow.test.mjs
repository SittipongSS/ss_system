// Tests loadScoped — โหลด+ตรวจในจังหวะเดียว. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { loadScoped, SCOPED_TABLES } from './scopedRow.js';

// supabase ปลอม: คืนแถวเดียวตามที่กำหนด
function db(row, { error = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(table);
      const b = {
        select(cols) { calls.push(cols); return b; },
        eq() { return b; },
        maybeSingle: async () => ({ data: row, error }),
      };
      return b;
    },
  };
}

const admin = { role: 'admin' };
const aeOdm = { role: 'ae', team: 'ODM', teams: ['ODM'], id: 'U-1', name: 'AE ODM' };
const dealOdm = { id: 'D-1', team: 'ODM', ownerId: 'U-1', ownerName: 'AE ODM' };
const dealOther = { id: 'D-2', team: 'Services', ownerId: 'U-9', ownerName: 'คนอื่น' };

test('ทะเบียนทุกตารางประกาศครบทุกช่อง', () => {
  for (const [table, e] of Object.entries(SCOPED_TABLES)) {
    for (const k of ['label', 'select', 'scopeOf', 'view', 'edit']) {
      assert.ok(e[k], `${table} ขาด ${k}`);
    }
  }
});

test('ตารางที่ไม่อยู่ในทะเบียน = โยน error ทันที ไม่ใช่ปล่อยผ่าน', async () => {
  await assert.rejects(() => loadScoped(db(null), 'attachments', 'X', admin), /SCOPED_TABLES/);
});

test('ไม่พบแถว → 404 พร้อมชื่อของที่หา', async () => {
  const { response, row } = await loadScoped(db(null), 'sales_deals', 'D-9', admin);
  assert.equal(row, undefined);
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /ดีล/);
});

test('อ่านฐานพลาด → 500 ไม่ใช่ 404 ("ถามไม่สำเร็จ" ≠ "ไม่มี")', async () => {
  const { response } = await loadScoped(db(null, { error: new Error('boom') }), 'sales_deals', 'D-1', admin);
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /boom/);
});

test('อยู่ในขอบเขต → คืนแถว ไม่มี response', async () => {
  const { row, response } = await loadScoped(db(dealOdm), 'sales_deals', 'D-1', aeOdm);
  assert.equal(response, undefined);
  assert.equal(row.id, 'D-1');
});

test('นอกขอบเขต → 403', async () => {
  const { row, response } = await loadScoped(db(dealOther), 'sales_deals', 'D-2', aeOdm);
  assert.equal(row, undefined);
  assert.equal(response.status, 403);
});

test('ใบเสนอราคา/ใบสั่งขาย ตรวจผ่าน "ดีลที่สังกัด" ไม่ใช่ตัวใบ', async () => {
  const quote = { id: 'QT-1', deal: dealOther };
  const { response } = await loadScoped(db(quote), 'quotations', 'QT-1', aeOdm);
  assert.equal(response.status, 403, 'ใบของดีลทีมอื่นต้องถูกปฏิเสธ');

  const mine = { id: 'QT-2', deal: dealOdm };
  const okRes = await loadScoped(db(mine), 'quotations', 'QT-2', aeOdm);
  assert.equal(okRes.response, undefined);
});

test('ใบที่ไม่มีดีล = พิสูจน์สิทธิ์ไม่ได้ → ปฏิเสธ ไม่ใช่ปล่อยผ่าน', async () => {
  const orphan = { id: 'SO-1', deal: null };
  const { response } = await loadScoped(db(orphan), 'sales_orders', 'SO-1', aeOdm);
  assert.equal(response.status, 403);
});

/* ⭐ **ยกเว้นผู้ดูแลระบบ** (มติผู้ใช้ 2026-08-28 "ขอสิทธิ์ทุกอย่างให้แอดมิน รวมลบด้วย")
   แถวกำพร้าคือเคสเดียวที่ต้องใช้แอดมินเข้าไปเก็บกวาดจริง ๆ แต่ของเดิมปฏิเสธแอดมิน
   ไปพร้อมกับทุกคน ⇒ ไม่มีใครในระบบลบแถวกำพร้าได้เลย */
test('⭐ แถวกำพร้า: แอดมินเข้าถึงได้ · คนอื่นได้ข้อความที่บอกว่าเป็นแถวไร้ต้นสังกัด', async () => {
  const orphan = { id: 'SO-1', deal: null };
  const adminRes = await loadScoped(db(orphan), 'sales_orders', 'SO-1', admin);
  assert.equal(adminRes.response, undefined);
  assert.equal(adminRes.row.id, 'SO-1');

  const denied = await loadScoped(db(orphan), 'sales_orders', 'SO-1', aeOdm);
  const body = await denied.response.json();
  assert.match(body.error, /ไม่มีดีลต้นสังกัด/, 'ข้อความต้องชี้ว่าเป็นแถวกำพร้า ไม่ใช่ forbidden เปล่า ๆ');
});

test('โหมด view กว้างกว่า edit — คนนอกทีมที่เห็นได้ ต้องแก้ไม่ได้', async () => {
  const head = { role: 'senior_ae', team: 'Services', teams: ['Services'], id: 'U-5' };
  const viewRes = await loadScoped(db(dealOdm), 'sales_deals', 'D-1', head, 'view');
  const editRes = await loadScoped(db(dealOdm), 'sales_deals', 'D-1', head, 'edit');
  // senior_ae เห็นได้เฉพาะทีมตัวเอง ⇒ ทั้งคู่ปฏิเสธ — ข้อนี้ล็อกว่าโหมดถูกส่งต่อจริง
  assert.equal(viewRes.response?.status, 403);
  assert.equal(editRes.response?.status, 403);
});

test('join ของใบต้องลากดีลมาด้วยเสมอ — ไม่งั้น scopeOf ได้ undefined แล้ว 403 ทุกใบ', () => {
  for (const t of ['quotations', 'sales_orders']) {
    assert.match(SCOPED_TABLES[t].select, /deal:sales_deals\(/, `${t} ต้อง join ดีล`);
  }
});
