// แจ้งเตือนรายคน (mig 0185)
//
// สิ่งที่ต้องล็อกไว้ เรียงตามความเสียหายถ้าหลุด:
//   1) **ห้ามแจ้งตัวเอง** — คนโพสต์ได้แจ้งเตือนข้อความตัวเอง = กล่องตายทันที
//   2) **ห้ามมี "ทุกคนในฝ่าย" เป็นผู้รับ** (มติ 14) — ซ้ำกับ Chat webhook
//      → เทสต์ไล่ทุก entity ในทะเบียนว่าคืนเฉพาะคนที่ผูกกับแถวนั้นจริง
//   3) "คนเคยโพสต์" ต้องถูกนับ — เป็นกลไกเดียวที่ทำให้เธรดสองฝ่ายทำงานได้
//      โดยไม่ต้องแจ้งทั้งฝ่าย
//   4) แจ้งเตือนต้องกดไปถึงของจริงได้ (href) ไม่ใช่แถวที่กดแล้วไม่ไปไหน
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  entityTitle, notificationHref, recipientsForUpdate, threadParticipants,
} from './notifications.js';
import { UPDATE_ENTITIES, updateRecipients } from './master/updateAccess.js';

// stub: .from(t).select(...).eq().eq() → thenable คืนแถวของตารางนั้น
function stub(tables = {}) {
  const make = (table) => {
    const chain = {
      eq: () => chain,
      maybeSingle: async () => ({ data: (tables[table] || [])[0] || null, error: null }),
      then: (resolve, reject) =>
        Promise.resolve({ data: tables[table] || [], error: null }).then(resolve, reject),
    };
    return chain;
  };
  return { from: (table) => ({ select: () => make(table) }) };
}

test('⭐ ไม่แจ้งตัวเอง — คนที่เพิ่งโพสต์ต้องหลุดออกจากรายชื่อผู้รับเสมอ', async () => {
  const supabase = stub({
    entity_updates: [{ authorId: 'u-ae' }, { authorId: 'u-rd' }],
  });
  const got = await recipientsForUpdate(supabase, {
    entityType: 'personal_task',
    entityId: 'T-1',
    parent: { ownerId: 'u-own', assigneeId: 'u-ae' },
    actorId: 'u-ae',
  });
  assert.equal(got.includes('u-ae'), false, 'คนโพสต์ต้องไม่ได้รับแจ้งเตือนตัวเอง');
  assert.deepEqual([...got].sort(), ['u-own', 'u-rd']);
});

test('⭐ "คนเคยโพสต์" ถูกนับเป็นผู้รับ — กลไกที่แทน "แจ้งทั้งฝ่าย"', async () => {
  // RD เคยตอบเคสไปแล้วหนึ่งครั้ง → ข้อความถัดไปต้องถึง RD คนนั้นเอง
  // โดยที่คนอื่นในฝ่าย RD ไม่ถูกรบกวน
  const supabase = stub({ entity_updates: [{ authorId: 'u-rd' }] });
  const got = await recipientsForUpdate(supabase, {
    entityType: 'dept_request',
    entityId: 'RQ-1',
    parent: { requestedById: 'u-sa' },
    actorId: 'u-sa',
  });
  assert.deepEqual(got, ['u-rd']);
});

test('ข้อความที่ถูกลบไม่ทำให้เจ้าของกลายเป็นผู้รับตลอดกาล', () => {
  assert.deepEqual(
    threadParticipants([
      { authorId: 'u-1' },
      { authorId: 'u-2', deletedAt: '2026-07-01T00:00:00Z' },
      { authorId: null },
      { authorId: 'u-1' },
    ]),
    ['u-1'],
  );
});

test('⭐ ไม่มี entity ไหนคืน "ทุกคนในฝ่าย" — ผู้รับต้องมาจากแถวนั้นเท่านั้น (มติ 14)', async () => {
  // ทะเบียนประกาศ recipients เป็นฟังก์ชันที่รับ parent → ถ้าใครเผลอ hardcode
  // รายชื่อ/ฝ่ายไว้ ผลลัพธ์จะไม่เปลี่ยนตาม parent · ป้อน parent ว่างแล้วต้องได้ว่าง
  const supabase = stub({ sales_deals: [] });
  for (const entityType of Object.keys(UPDATE_ENTITIES)) {
    const got = await updateRecipients(supabase, entityType, {});
    assert.deepEqual(got, [], `${entityType}: parent ว่างต้องไม่มีผู้รับ (ห้ามมีรายชื่อตายตัว)`);
  }
});

test('ผู้รับของแต่ละ entity มาจากช่องที่ถูกต้องบนแถวแม่', async () => {
  const supabase = stub({ sales_deals: [{ id: 'DL-1', ownerId: 'u-owner' }] });
  assert.deepEqual(
    await updateRecipients(supabase, 'personal_task', { ownerId: 'u-a', assigneeId: 'u-b' }),
    ['u-a', 'u-b'],
  );
  assert.deepEqual(await updateRecipients(supabase, 'deal', { ownerId: 'u-a' }), ['u-a']);
  assert.deepEqual(
    await updateRecipients(supabase, 'lead', { assigneeId: 'u-a', createdBy: 'u-b' }),
    ['u-a', 'u-b'],
  );
  // QT/SO ต้อง query ดีลต่อเพื่อหาผู้อนุมัติ (= เจ้าของดีล)
  assert.deepEqual(
    await updateRecipients(supabase, 'quotation', { dealId: 'DL-1', createdBy: 'u-maker' }),
    ['u-maker', 'u-owner'],
  );
});

test('id ซ้ำ/ค่าว่างถูกกรองทิ้ง — คนเดียวต้องไม่ได้สองแถว', async () => {
  const supabase = stub({});
  // ผู้สร้าง = ผู้รับมอบคนเดียวกัน (เคสปกติของลีดที่ตัวเองกรอกเอง)
  assert.deepEqual(
    await updateRecipients(supabase, 'lead', { assigneeId: 'u-a', createdBy: 'u-a' }),
    ['u-a'],
  );
  assert.deepEqual(
    await updateRecipients(supabase, 'personal_task', { ownerId: 'u-a', assigneeId: null }),
    ['u-a'],
  );
});

test('ทุก entity ที่มีเธรดต้องกดจากกล่องแจ้งเตือนไปถึงของจริงได้', () => {
  for (const entityType of Object.keys(UPDATE_ENTITIES)) {
    assert.ok(
      notificationHref(entityType, 'X-1'),
      `${entityType}: ไม่มี href — แจ้งเตือนจะกดแล้วไม่ไปไหน (เติมใน HREF ของ lib/notifications.js)`,
    );
  }
});

test('หัวเรื่องใช้ชื่อ/เลขที่เอกสาร ไม่ใช่ id ดิบ ถ้ามีให้ใช้', () => {
  assert.equal(entityTitle('quotation', { id: 'QT-1', quoteNumber: 'QT-2569-001' }), 'ใบเสนอราคา QT-2569-001');
  assert.equal(entityTitle('lead', { id: 'LD-1', contactName: 'คุณสมชาย' }), 'ลีด คุณสมชาย');
  assert.equal(entityTitle('personal_task', { id: 'T-1', title: 'ทำใบเสนอราคา' }), 'งาน ทำใบเสนอราคา');
  // ไม่มีอะไรให้ใช้จริง ๆ ค่อยถอยไป id (ทางสุดท้าย ไม่ใช่ทางแรก)
  assert.equal(entityTitle('deal', { id: 'DL-9' }), 'ดีล DL-9');
});
