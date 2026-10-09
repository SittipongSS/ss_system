// ── ตัวกวาดไฟล์กำพร้าต้องรู้จักไฟล์ของนัดช่าง ───────────────────────────────
//
// รูปหน้างานกับลายเซ็นลูกค้าของนัด (`service_visits`) เก็บเป็น **URL ของ Drive** ไม่มีแถวใน attachments
// ⇒ ก่อนแก้ `collectReferencedIds` ไม่อ่านตารางนี้เลย ⇒ รายงานไฟล์กำพร้านับไฟล์ของนัดเป็นกำพร้า
// และปุ่ม "ทิ้งไฟล์กำพร้า" บนหน้าเดียวกันทิ้งมันลงถังขยะได้
//
// เทสต์นี้เรียกฟังก์ชันจริงด้วยฐานปลอม (ไม่มีฐาน ไม่มี Drive) — ฐานปลอมตอบผ่าน `.range()` เท่านั้น
// ⇒ ถ้าใครถอด `fetchAll` ออกจากการอ่านตารางไหน เทสต์นี้ล้มด้วย
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectReferencedIds } from './driveMaintenance.js';

const PHOTO = '1PhotoPhotoPhotoPhoto_01';
const PHOTO_2 = '1PhotoPhotoPhotoPhoto_02';
const SIGNATURE = '1SignSignSignSignSign_01';

// ฐานปลอม: จำว่าถูกถามตารางไหน คอลัมน์ไหน ช่วงไหน · ตารางที่ไม่ได้ป้อนแถว = ว่าง
function fakeSupabase(tables, { failOn } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, select: null, order: null, ranges: [] };
      calls.push(call);
      const builder = {
        select(cols) { call.select = cols; return builder; },
        order(col) { call.order = col; return builder; },
        async range(from, to) {
          call.ranges.push([from, to]);
          if (failOn === table) return { data: null, error: { message: 'boom' } };
          return { data: (tables[table] || []).slice(from, to + 1), error: null };
        },
      };
      return builder;
    },
  };
}

test('รูปหน้างานกับลายเซ็นของนัด = ไฟล์ที่มีคนอ้าง', async () => {
  const supabase = fakeSupabase({
    service_visits: [{
      id: 'v1',
      attachments: [
        { url: `https://drive.google.com/file/d/${PHOTO}/view?usp=drivesdk`, name: 'หน้างาน.jpg' },
        { url: `https://drive.google.com/uc?export=download&id=${PHOTO_2}`, name: 'ตู้.jpg' },
      ],
      customerSignatureUrl: `https://drive.google.com/file/d/${SIGNATURE}/view`,
    }],
  });
  const refs = await collectReferencedIds(supabase);
  assert.ok(refs.has(PHOTO), 'รูปหน้างาน (/d/<id>) ต้องถูกนับว่ามีคนอ้าง');
  assert.ok(refs.has(PHOTO_2), 'รูปหน้างาน (?id=<id>) ต้องถูกนับว่ามีคนอ้าง');
  assert.ok(refs.has(SIGNATURE), 'ลายเซ็นลูกค้าต้องถูกนับว่ามีคนอ้าง');
  assert.equal(refs.size, 3);
});

test('อ่าน service_visits ด้วยคอลัมน์ของ mig 0188 ผ่านตัวไล่หน้า พร้อมลำดับที่นิ่ง', async () => {
  const supabase = fakeSupabase({});
  await collectReferencedIds(supabase);
  const call = supabase.calls.find((c) => c.table === 'service_visits');
  assert.ok(call, 'ต้องอ่านตาราง service_visits');
  assert.equal(call.select, 'id, attachments, "customerSignatureUrl"');
  assert.equal(call.order, 'id');
  assert.deepEqual(call.ranges, [[0, 999]]);
});

test('นัดเกินหนึ่งหน้า — ไฟล์ของแถวที่ 1,001 ยังถูกนับ', async () => {
  const rows = Array.from({ length: 1000 }, (_, i) => ({ id: `v${i}`, attachments: [], customerSignatureUrl: null }));
  rows.push({ id: 'last', attachments: [{ url: `https://drive.google.com/file/d/${PHOTO}/view` }], customerSignatureUrl: null });
  const supabase = fakeSupabase({ service_visits: rows });
  const refs = await collectReferencedIds(supabase);
  assert.ok(refs.has(PHOTO));
  // fetchAll สร้าง query ใหม่ทุกหน้า ⇒ หนึ่งหน้า = หนึ่ง from()
  assert.deepEqual(supabase.calls.filter((c) => c.table === 'service_visits').flatMap((c) => c.ranges), [[0, 999], [1000, 1999]]);
});

test('แถวรูปแปลกไม่ทำให้รายงานล้ม และไม่เพิ่ม id มั่ว', async () => {
  const supabase = fakeSupabase({
    service_visits: [
      null,
      { id: 'a' },
      { id: 'b', attachments: null, customerSignatureUrl: null },
      { id: 'c', attachments: 'ไม่ใช่ array', customerSignatureUrl: 42 },
      { id: 'd', attachments: { url: `https://drive.google.com/file/d/${PHOTO_2}/view` }, customerSignatureUrl: '' },
      { id: 'e', attachments: [null, 'x', 7, {}, { url: null }, { url: 123 }, { url: {} }, { url: 'https://example.com/a.jpg' }, { url: '/d/สั้น' }], customerSignatureUrl: {} },
      { id: 'f', attachments: [{ url: `https://drive.google.com/file/d/${PHOTO}/view` }], customerSignatureUrl: 'data:image/png;base64,AAAA' },
    ],
  });
  const refs = await collectReferencedIds(supabase);
  assert.deepEqual([...refs], [PHOTO]);
});

test('แหล่งเดิมยังถูกนับครบเมื่อมีนัดปนอยู่', async () => {
  const supabase = fakeSupabase({
    attachments: [{ id: 'a1', driveFileId: 'att_file_0001', fileUrl: null, metadata: { googleFileId: 'att_meta_0001' } }],
    entity_updates: [{ id: 'u1', attachments: [{ driveFileId: 'upd_file_0001' }] }],
    quotations: [{ id: 'q1', wonAttachments: [{ driveFileId: 'won_file_0001' }] }],
    customers: [{ id: 'c1', driveFolderId: 'cus_folder_001' }],
    products: [{ id: 'p1', driveFolderId: 'pro_folder_001' }],
    service_visits: [{ id: 'v1', attachments: [], customerSignatureUrl: `https://drive.google.com/file/d/${SIGNATURE}/view` }],
  });
  const refs = await collectReferencedIds(supabase);
  assert.deepEqual([...refs].sort(), ['att_file_0001', 'att_meta_0001', 'cus_folder_001', 'pro_folder_001', 'upd_file_0001', 'won_file_0001', SIGNATURE].sort());
});

test('อ่าน service_visits ไม่ได้ = โยน error ต่อ (ไม่รายงานไฟล์ของนัดเป็นกำพร้าเงียบ ๆ)', async () => {
  await assert.rejects(collectReferencedIds(fakeSupabase({}, { failOn: 'service_visits' })), { message: 'boom' });
});
