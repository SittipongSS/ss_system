// 🐞 `purgeAttachments` ทิ้ง `{ error }` ของคำสั่งลบแถว attachments (supabase-js ไม่ throw) ⇒ ลบพัง = แถวกำพร้า
// ค้างเงียบ ทั้งที่ผู้เรียกทุกคนเข้าใจว่าเก็บกวาดสำเร็จ · ⚠️ ห้าม throw (ผู้เรียก ~20 จุดไม่มี try/catch
// และหลายจุดเรียกหลังลบ entity แม่แล้ว) ⇒ คืน `{ count, error }` ให้ผู้เรียกที่บอกจอได้อ่านเอง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { purgeAttachments } from './attachments.js';

// ไฟล์แนบที่ไม่มีไฟล์บน Drive และไม่มีสิทธิ์ค้าง — releaseAttachmentFile ไม่ต้องยิงออกนอกเครื่อง
const ROWS = [
  { id: 'ATT-1', entityType: 'dept_request_item', entityId: 'DRI-1', driveFileId: null, accessGranted: [] },
  { id: 'ATT-2', entityType: 'dept_request_item', entityId: 'DRI-1', driveFileId: null, accessGranted: [] },
];

function fakeSupabase({ rows = ROWS, deleteError = null } = {}) {
  const calls = { deletes: 0 };
  return {
    calls,
    from(table) {
      assert.equal(table, 'attachments');
      const read = {
        select: () => read, eq: () => read,
        order: () => Promise.resolve({ data: rows, error: null }),
      };
      return {
        ...read,
        delete: () => {
          calls.deletes += 1;
          const del = { eq: () => del, then: (resolve) => resolve({ error: deleteError }) };
          return del;
        },
      };
    },
  };
}

test('ลบแถวไฟล์แนบพัง = คืน error (ไม่ throw) พร้อมจำนวนที่จัดการ', async () => {
  const supabase = fakeSupabase({ deleteError: { message: 'permission denied', code: '42501' } });
  const result = await purgeAttachments('dept_request_item', 'DRI-1', supabase);
  assert.equal(supabase.calls.deletes, 1);
  assert.equal(result.count, 2);
  assert.equal(result.error?.message, 'permission denied');
});

test('ลบสำเร็จ = error เป็น null · ไม่มีไฟล์แนบ = ไม่ยิงลบ', async () => {
  const ok = fakeSupabase();
  assert.deepEqual(await purgeAttachments('dept_request_item', 'DRI-1', ok), { count: 2, error: null });
  const empty = fakeSupabase({ rows: [] });
  assert.deepEqual(await purgeAttachments('dept_request_item', 'DRI-1', empty), { count: 0, error: null });
  assert.equal(empty.calls.deletes, 0);
  assert.deepEqual(await purgeAttachments('', 'DRI-1', ok), { count: 0, error: null });
});

test('ลบรายการในคำร้องอ่าน error แล้วบอกจอผ่าน _warning', () => {
  const src = readFileSync('src/app/api/sa/requests/[id]/items/[itemId]/route.js', 'utf8');
  assert.match(src, /const \{ error: purgeError \} = await purgeAttachments\('dept_request_item', itemId\);/);
  assert.match(src, /if \(purgeError\) attachWarning = /);
});
