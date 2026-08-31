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

import { readFileSync, readdirSync } from 'node:fs';

/* ไล่ไฟล์ .js ทั้งต้นไม้ — ใช้แทนการไล่ชื่อไฟล์ทีละอัน (ดูเหตุผลที่เทสต์ LEAD_BELL_KINDS) */
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
    if (entry.isDirectory()) yield* walk(child);
    else if (entry.name.endsWith('.js')) yield child;
  }
}

import {
  EXCISE_BELL_KINDS, LEAD_BELL_KINDS, SERVICE_BELL_KINDS,
  NOTIFICATION_BOXES, entityLabel, entityTitle, listNotificationPage, markAllRead,
  notificationBox, notificationCursor, notificationHref, notifyThreadUpdate,
  recipientsForUpdate, threadParticipants, unreadCount,
} from './notifications.js';
import { UPDATE_ENTITIES, updateRecipients } from './master/updateAccess.js';
import { isQuietUpdateKind } from './master/updateTypes.js';

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
  // QT/SO ไม่มีเธรดของตัวเองแล้ว (มติผู้ใช้ 2026-08-04) — เหตุการณ์ของใบลงเธรดดีล
  // ผู้รับจึงเป็นชุดของดีล ไม่ใช่ชุดของใบ
  assert.deepEqual(await updateRecipients(supabase, 'quotation', { dealId: 'DL-1' }), []);
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

/* 🐞 ของจริง 2026-08-13: อนุมัติสินค้า 1 ครั้ง = แจ้งเตือน 2 ใบ ให้คนกลุ่มเดียวกัน
   ในวินาทีเดียวกัน (`approve` + `override` เพราะสินค้าบังคับแนบ Artwork แต่ไม่มีใบไหน
   แนบเลย ⇒ ต้องยกเว้นทุกครั้ง) · 218 จาก 259 แถวของสินค้ามาจากคู่นี้ ไม่ถูกอ่าน 84% */
test('⭐ ชนิด quiet ลงเธรดได้แต่ต้องไม่เด้ง — กันแจ้งเตือนซ้ำต่อหนึ่งการกระทำ', async () => {
  let wrote = false;
  const supabase = {
    from: () => ({
      select: () => ({ eq: function () { return this; }, then: (r) => Promise.resolve({ data: [], error: null }).then(r) }),
      upsert: async () => { wrote = true; return { error: null }; },
    }),
  };
  const got = await notifyThreadUpdate(supabase, {
    entityType: 'product',
    entityId: 'PRD-1',
    parent: { id: 'PRD-1', customerId: 'CUS-1' },
    update: { id: 'UPD-1', kind: 'override', body: 'อนุมัติโดยยกเว้นเอกสารบังคับ' },
  });
  assert.deepEqual(got, { sent: 0, quiet: true });
  assert.equal(wrote, false, 'ชนิด quiet ต้องไม่แตะตาราง notifications เลย');
});

test('quiet ผูกกับชนิด ไม่ใช่ทั้ง entity — อนุมัติยังต้องเด้งตามปกติ', () => {
  assert.equal(isQuietUpdateKind('product', 'override'), true);
  assert.equal(isQuietUpdateKind('customer', 'override'), true);
  // ⚠️ ถ้าใครเผลอใส่ quiet ให้สามตัวนี้ = อนุมัติ/ตีกลับ/ตกกลับรออนุมัติ จะเงียบสนิท
  for (const kind of ['approve', 'reject', 'reset', 'comment']) {
    assert.equal(isQuietUpdateKind('product', kind), false, kind);
    assert.equal(isQuietUpdateKind('customer', kind), false, kind);
  }
  // entity อื่นไม่มีชนิด quiet เลยในตอนนี้
  assert.equal(isQuietUpdateKind('deal', 'approve'), false);
  assert.equal(isQuietUpdateKind('lead', 'comment'), false);
});

// ── หน้า "ดูทั้งหมด" ─────────────────────────────────────────────────────
// stub ของหน้า: จำ query ที่ถูกสร้าง แล้วคืนแถวตามที่ตั้งไว้
function pageStub(rows) {
  const calls = { or: null, ors: [], is: 0, order: [], limit: null };
  const chain = {
    eq: () => chain,
    is: () => { calls.is += 1; return chain; },
    or: (expr) => { calls.or = expr; calls.ors.push(expr); return chain; },
    order: (col, opts) => { calls.order.push([col, opts?.ascending]); return chain; },
    limit: async (n) => { calls.limit = n; return { data: rows.slice(0, n), error: null }; },
  };
  return { calls, supabase: { from: () => ({ select: () => chain }) } };
}

const row = (n) => ({ id: `NTF-${n}`, createdAt: '2026-08-12T03:00:00+00:00', title: `t${n}` });

test('⭐ หน้าถัดไปอ้างแถวสุดท้าย ไม่ใช่ offset — แจ้งเตือนใหม่เข้าแล้วต้องไม่ทำของซ้ำ/หาย', async () => {
  // ขอ 2 แถว แต่ในกองมี 3 → ต้องคืน 2 และบอกว่ายังมีต่อ พร้อมกุญแจของแถวที่ 2
  const { calls, supabase } = pageStub([row(1), row(2), row(3)]);
  const got = await listNotificationPage(supabase, 'u-1', { limit: 2 });
  assert.equal(calls.limit, 3, 'ต้องขอเกินมา 1 แถวเพื่อรู้ว่ายังมีต่อ');
  assert.deepEqual(got.items.map((r) => r.id), ['NTF-1', 'NTF-2']);
  assert.equal(got.hasMore, true);
  assert.equal(got.nextCursor, '2026-08-12T03:00:00+00:00|NTF-2');
});

test('หมดกองแล้วต้องไม่มีกุญแจหน้าถัดไป (ปุ่มโหลดเพิ่มต้องหาย)', async () => {
  const { supabase } = pageStub([row(1), row(2)]);
  const got = await listNotificationPage(supabase, 'u-1', { limit: 5 });
  assert.equal(got.hasMore, false);
  assert.equal(got.nextCursor, null);
  assert.equal(got.items.length, 2);
});

test('⭐ เรียงสองคอลัมน์เสมอ — fan-out เขียนหลายแถวด้วยเวลาเดียวกัน', async () => {
  const { calls, supabase } = pageStub([]);
  await listNotificationPage(supabase, 'u-1', {});
  assert.deepEqual(calls.order, [['createdAt', false], ['id', false]]);
});

test('กุญแจหน้าถัดไปต้องกันแถวเวลาชนกัน ไม่ใช่แค่ createdAt.lt', async () => {
  const { calls, supabase } = pageStub([]);
  await listNotificationPage(supabase, 'u-1', { cursor: '2026-08-12T03:00:00+00:00|NTF-2' });
  // ต้องมีทั้งขา "เก่ากว่า" และขา "เวลาเท่ากันแต่ id เล็กกว่า" ไม่งั้นแถวที่เวลา
  // ตรงกับแถวสุดท้ายของหน้าก่อนจะถูกข้ามทั้งชุด
  assert.match(calls.or, /createdAt\.lt\."2026-08-12T03:00:00\+00:00"/);
  assert.match(calls.or, /and\(createdAt\.eq\."2026-08-12T03:00:00\+00:00",id\.lt\."NTF-2"\)/);
});

test('โหมด "ยังไม่อ่าน" ต้องกรองที่ฐานข้อมูล ไม่ใช่กรองหลังดึงมาแล้ว', async () => {
  // กรองในหน้าจอ = จำนวนต่อหน้าเพี้ยน (ดึง 30 เหลือ 3) และ hasMore โกหก
  const { calls, supabase } = pageStub([]);
  await listNotificationPage(supabase, 'u-1', { unreadOnly: true });
  assert.equal(calls.is, 1);
  const plain = pageStub([]);
  await listNotificationPage(plain.supabase, 'u-1', {});
  assert.equal(plain.calls.is, 0);
});

test('เพดานต่อคำขอกันคนแก้ query string ดึงทั้งตาราง', async () => {
  const { calls, supabase } = pageStub([]);
  await listNotificationPage(supabase, 'u-1', { limit: 9999 });
  assert.equal(calls.limit, 101, 'ต้องถูกตัดเหลือเพดาน 100 (+1 แถวตรวจว่ามีต่อ)');
});

test('แถวที่ยังไม่มีข้อมูลครบ ไม่กลายเป็นกุญแจพัง', () => {
  assert.equal(notificationCursor(null), null);
  assert.equal(notificationCursor({ id: 'NTF-1' }), null);
  assert.equal(notificationCursor({ createdAt: 'x', id: 'NTF-1' }), 'x|NTF-1');
});

test('ทุก entity ที่มีเธรดมีป้ายชื่อของตัวเอง — หน้ารวมต้องไม่ขึ้นคำว่า "รายการ" ลอย ๆ', () => {
  for (const entityType of Object.keys(UPDATE_ENTITIES)) {
    assert.notEqual(
      entityLabel(entityType), 'รายการ',
      `${entityType}: ไม่มีป้ายชื่อ (เติมใน ENTITY_LABEL ของ lib/notificationTargets.js)`,
    );
  }
});

test('หัวเรื่องใช้ชื่อ/เลขที่เอกสาร ไม่ใช่ id ดิบ ถ้ามีให้ใช้', () => {
  assert.equal(entityTitle('deal', { id: 'DL-1', name: 'ดีลกลิ่นห้องน้ำ' }), 'ดีล ดีลกลิ่นห้องน้ำ');
  assert.equal(entityTitle('lead', { id: 'LD-1', contactName: 'คุณสมชาย' }), 'ลีด คุณสมชาย');
  assert.equal(entityTitle('personal_task', { id: 'T-1', title: 'ทำใบเสนอราคา' }), 'งาน ทำใบเสนอราคา');
  // ไม่มีอะไรให้ใช้จริง ๆ ค่อยถอยไป id (ทางสุดท้าย ไม่ใช่ทางแรก)
  assert.equal(entityTitle('deal', { id: 'DL-9' }), 'ดีล DL-9');
});

// ── กล่องของกระดิ่ง (มติผู้ใช้ 2026-08-20) ───────────────────────────────

test('⭐ กระดิ่งกรองเหลือคำร้อง + แจ้งปัญหา + มอบหมายงาน และกรองที่ฐานข้อมูล', async () => {
  // กรองในหน้าจอ = ขอ 30 แถวได้จริง 3 แถว แล้ว `hasMore` โกหก (เหตุผลเดียวกับ
  // โหมด "ยังไม่อ่าน") · และเลขบนป้ายจะไม่มีวันตรงกับสิ่งที่กล่องแสดง
  const { calls, supabase } = pageStub([]);
  await listNotificationPage(supabase, 'u-1', { box: notificationBox('bell') });
  assert.deepEqual(calls.ors, [
    'entityType.eq.dept_request,entityType.eq.system_issue,kind.eq.task_assign,'
    + [...LEAD_BELL_KINDS, ...EXCISE_BELL_KINDS, ...SERVICE_BELL_KINDS].map((k) => `kind.eq.${k}`).join(','),
  ]);
});

test('⭐ มอบหมายงานเข้ากล่องด้วย kind ไม่ใช่ทั้ง entity — เธรดงานทั้งเธรดต้องไม่ตามมา', () => {
  // เธรดงาน 92% เป็นเหตุการณ์ระบบ (เปลี่ยนสถานะ/เลื่อนกำหนด) — ลากเข้ามาทั้ง entity
  // เมื่อไรกระดิ่งก็กลับไปเป็นกองเดิมที่ไม่มีใครอ่าน
  assert.equal(NOTIFICATION_BOXES.bell.entityTypes.includes('personal_task'), false);
  assert.deepEqual(NOTIFICATION_BOXES.bell.kinds,
    ['task_assign', ...LEAD_BELL_KINDS, ...EXCISE_BELL_KINDS, ...SERVICE_BELL_KINDS]);
});

/* ── ลีดเข้ากระดิ่ง (2026-08-25) ────────────────────────────────────────────
   เหตุผลเดียวกับมอบหมายงานเป๊ะ ๆ: เอา **เหตุการณ์ที่ต้องลงมือ** ไม่เอาทั้ง entity
   🪤 ใส่ 'lead' ลง entityTypes เมื่อไร เธรดกลางของลีด (เปิดอยู่ทุกใบทุกสถานะ)
   จะไหลเข้ากระดิ่งทั้งหมด แล้วคำร้องถูกดันตกขอบกล่อง 30 แถวอีกรอบ */
test('⭐ ลีดเข้ากระดิ่งด้วย kind ไม่ใช่ทั้ง entity — เธรดลีดต้องไม่ตามมา', () => {
  assert.equal(NOTIFICATION_BOXES.bell.entityTypes.includes('lead'), false);
  for (const kind of LEAD_BELL_KINDS) {
    assert.ok(NOTIFICATION_BOXES.bell.kinds.includes(kind), `${kind} หลุดจากกระดิ่ง`);
  }
});

/* ⚠️ ดริฟต์ที่พังเงียบที่สุดของงานนี้: เพิ่ม action ใหม่ใน `leadHandoffNotice`
   แล้วลืมเติม `LEAD_BELL_KINDS` ⇒ แจ้งเตือนถูกเขียนลงตารางตามปกติ แต่ไม่โผล่
   ในกระดิ่ง ไม่มี error ไม่มีอะไรฟ้อง · เทสต์นี้อ่านซอร์สจริงมาเทียบ
   (ท่าเดียวกับ leadLifecycle.test.mjs ที่อ่าน route.js มาเทียบกับลิสต์ของตัวเอง) */
test('LEAD_BELL_KINDS ครบทุก kind ที่ยิงจริง — ทั้งจุดส่งมอบและทวงประจำวัน', () => {
  const notify = readFileSync(new URL('./sales/leadNotify.js', import.meta.url), 'utf8');
  // `action === 'xxx'` ทุกตัวใน leadHandoffNotice = หนึ่ง kind (`lead_${action}`)
  const actions = [...notify.matchAll(/action === '([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(actions.length >= 5, 'อ่าน action จากซอร์สไม่ได้ — เทสต์นี้ตาบอดแล้ว');
  for (const action of actions) {
    assert.ok(LEAD_BELL_KINDS.includes(`lead_${action}`), `lead_${action} ยังไม่อยู่ในกระดิ่ง`);
  }
  /* 🪤 **กวาดทั้ง src ไม่ใช่ไล่ไฟล์ทีละชื่อ** — เดิมเทสต์นี้อ่าน `daily-digest` ตรง ๆ
     ตามชื่อไฟล์ ⇒ ผู้ยิงแจ้งเตือนลีดรายใหม่ (cron อื่น · route อื่น) จะไม่ถูกตรวจเลย
     แล้ว kind ใหม่จะเงียบหายจากกระดิ่งโดยไม่มีอะไรแดง ซึ่งคือบั๊กเดียวกับที่เทสต์นี้
     เกิดมาจับพอดี · ตอนนี้หาเองจากทุกไฟล์ที่ยิง `entityType: 'lead'` */
  const leadKinds = new Set();
  for (const file of walk(new URL('..', import.meta.url))) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes("entityType: 'lead'")) continue;
    for (const [, kind] of src.matchAll(/kind: '(lead_[a-z_]+)'/g)) leadKinds.add(kind);
  }
  assert.ok(leadKinds.size >= 1, 'หา kind ของแจ้งเตือนลีดไม่เจอเลย — เทสต์นี้ตาบอดแล้ว');
  for (const kind of leadKinds) {
    assert.ok(LEAD_BELL_KINDS.includes(kind),
      `${kind} ยิงอยู่จริงแต่ยังไม่อยู่ใน LEAD_BELL_KINDS ⇒ ไม่ขึ้นกระดิ่ง`);
  }
});

/* ── ทะเบียนสรรพสามิตเข้ากระดิ่ง (2026-08-28) ──────────────────────────────
   เหตุผลเดียวกับลีด: เอา **เหตุการณ์ที่ต้องลงมือ** ไม่เอาทั้ง entity
   🪤 ใส่ 'excise_registration' ลง entityTypes เมื่อไร เธรดกลางของทะเบียน (เปิดอยู่
   ทุกใบ) จะไหลเข้ากระดิ่งทั้งหมด แล้วคำร้องถูกดันตกขอบกล่อง 30 แถวอีกรอบ */
test('⭐ ทะเบียนสรรพสามิตเข้ากระดิ่งด้วย kind ไม่ใช่ทั้ง entity', () => {
  assert.equal(NOTIFICATION_BOXES.bell.entityTypes.includes('excise_registration'), false);
  for (const kind of EXCISE_BELL_KINDS) {
    assert.ok(NOTIFICATION_BOXES.bell.kinds.includes(kind), `${kind} หลุดจากกระดิ่ง`);
  }
});

/* ⚠️ ดริฟต์แบบเดียวกับ LEAD_BELL_KINDS: เพิ่ม action ใหม่ใน `registrationNotice`
   แล้วลืมเติมลิสต์ ⇒ แถวถูกเขียนลงตารางตามปกติแต่ไม่โผล่ในกระดิ่ง ไม่มีอะไรฟ้อง
   · กวาดทั้ง src หาไฟล์ที่ยิง entityType นี้ ไม่ไล่ตามชื่อไฟล์ (ผู้ยิงรายใหม่จะได้
   ไม่หลุดจากการตรวจ) */
test('EXCISE_BELL_KINDS ครบทุก kind ที่ยิงจริง', () => {
  const notify = readFileSync(new URL('./tax/registrationNotify.js', import.meta.url), 'utf8');
  const actions = [...notify.matchAll(/action === '([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(actions.length >= 4, 'อ่าน action จากซอร์สไม่ได้ — เทสต์นี้ตาบอดแล้ว');
  for (const action of actions) {
    assert.ok(EXCISE_BELL_KINDS.includes(`excise_${action}`), `excise_${action} ยังไม่อยู่ในกระดิ่ง`);
  }
  /* ฝั่งกลับ: kind ที่ยิงจริงจากทุกไฟล์ต้องอยู่ในลิสต์ · `notifyRegistration` ยิงด้วย
     template `excise_${action}` ⇒ อ่าน kind ตรง ๆ ไม่เจอ ต้องไล่จาก action ข้างบน
     ที่นี่จึงตรวจว่าไม่มีใคร "ยิง kind ดิบ" ที่หลุดทะเบียนเพิ่มเข้ามาทีหลัง */
  const raw = new Set();
  for (const file of walk(new URL('..', import.meta.url))) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes("entityType: 'excise_registration'")) continue;
    for (const [, kind] of src.matchAll(/kind: '(excise_[a-z_]+)'/g)) raw.add(kind);
  }
  for (const kind of raw) {
    assert.ok(EXCISE_BELL_KINDS.includes(kind),
      `${kind} ยิงอยู่จริงแต่ยังไม่อยู่ใน EXCISE_BELL_KINDS ⇒ ไม่ขึ้นกระดิ่ง`);
  }
});


test('กล่อง + กุญแจหน้าถัดไปอยู่ด้วยกันได้ — or สองก้อนถูก and กันที่ PostgREST', async () => {
  const { calls, supabase } = pageStub([]);
  await listNotificationPage(supabase, 'u-1', {
    box: notificationBox('bell'), cursor: '2026-08-12T03:00:00+00:00|NTF-2',
  });
  assert.equal(calls.ors.length, 2, 'ต้องเป็นคนละก้อน ห้ามยัดรวมเป็น or เดียว (จะกลายเป็น "หรือ")');
  assert.match(calls.ors[0], /kind\.eq\.task_assign/);
  assert.match(calls.ors[1], /createdAt\.lt\./);
});

test('ไม่ระบุกล่อง = ไม่กรอง — หน้า "ดูทั้งหมด" ต้องยังเห็นทุกชนิดเหมือนเดิม', async () => {
  const { calls, supabase } = pageStub([]);
  await listNotificationPage(supabase, 'u-1', {});
  assert.deepEqual(calls.ors, [], 'แจ้งเตือนชนิดอื่นต้องไม่หายไปจากหน้าเต็ม');
  // ชื่อกล่องที่ไม่รู้จัก (query string มั่ว) ต้องตกเป็น "ไม่กรอง" ไม่ใช่กรองเป็นชุดว่าง
  const unknown = pageStub([]);
  await listNotificationPage(unknown.supabase, 'u-1', { box: notificationBox('มั่ว') });
  assert.deepEqual(unknown.calls.ors, []);
});

test('ทุก entity ในกล่องกระดิ่งต้องมีเธรดจริงในทะเบียน — ไม่งั้นกระดิ่งว่างตลอดกาล', () => {
  for (const type of NOTIFICATION_BOXES.bell.entityTypes) {
    assert.ok(UPDATE_ENTITIES[type], `${type} ไม่มีในทะเบียน entity ที่มีเธรด`);
  }
});

// stub ของ query ปลายทางเป็น thenable (count/update) — จำ .or() ที่ถูกเรียก
function tailStub(result = { count: 7, error: null }) {
  const calls = { or: null, update: null };
  const chain = {
    eq: () => chain,
    is: () => chain,
    or: (expr) => { calls.or = expr; return chain; },
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return {
    calls,
    supabase: {
      from: () => ({
        select: () => chain,
        update: (patch) => { calls.update = patch; return chain; },
      }),
    },
  };
}

test('⭐ เลขบนป้ายนับกล่องเดียวกับที่กระดิ่งแสดง — ป้าย 12 แต่เปิดมาเจอ 3 คือกระดิ่งที่ไม่มีใครเชื่อ', async () => {
  const { calls, supabase } = tailStub();
  await unreadCount(supabase, 'u-1', { box: notificationBox('bell') });
  assert.match(calls.or, /entityType\.eq\.dept_request/);
  assert.match(calls.or, /kind\.eq\.task_assign/);
});

test('⭐ "อ่านทั้งหมด" ในกระดิ่งล้างเฉพาะกล่องนั้น — ห้ามกลืนของที่คนกดไม่เคยเห็น', async () => {
  const bell = tailStub({ error: null });
  await markAllRead(bell.supabase, 'u-1', { box: notificationBox('bell') });
  assert.match(bell.calls.or, /entityType\.eq\.system_issue/);
  assert.ok(bell.calls.update?.readAt, 'ต้องเขียน readAt');
  // ปุ่มบนหน้าเต็มยังล้างทั้งกอง เพราะหน้านั้นแสดงทั้งกองจริง ๆ
  const full = tailStub({ error: null });
  await markAllRead(full.supabase, 'u-1');
  assert.equal(full.calls.or, null);
});
