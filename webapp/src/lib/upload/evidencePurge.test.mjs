// ── เก็บกวาดไฟล์หลักฐานตอนลบเอกสาร (bug 2026-08-30) ────────────────────────
//
// 🐞 ของจริง: ลบใบสั่งขาย + ใบเสนอราคาต้นทางแล้ว ไฟล์ยังอยู่ครบใน bucket
// (`sales-evidence/quotations/<id>/order-confirmation/…`) — เส้นลบทั้งสองเส้นเก็บ
// กวาดแค่แถวในตาราง ไม่มีใครแตะ Storage เลย ⇒ ไฟล์กำพร้าถาวรที่หาไม่เจอจากในระบบ
//
// ⚠️ กติกาที่เทสต์ชุดนี้ล็อกไว้:
//   1. กวาด **ทุกโฟลเดอร์** ของตารางนั้น (ใบเสนอราคามีทั้ง won/ และ order-confirmation/)
//   2. รายการที่ Storage คืนมาแบบ "โฟลเดอร์" (id = null) ไม่ใช่ไฟล์ ห้ามสั่งลบ
//   3. best-effort — Storage ล้มต้องไม่โยน error ออกไป (แถวถูกลบไปแล้ว)
import test from 'node:test';
import assert from 'node:assert/strict';
import { purgePrivateEvidence, removeEvidenceRefs } from './privateEvidence.js';

function fakeStorage({ listing = {}, failRemove = false, failList = false } = {}) {
  const removed = [];
  const listed = [];
  return {
    removed,
    listed,
    supabase: {
      storage: {
        from(bucket) {
          return {
            async list(folder) {
              listed.push(`${bucket}:${folder}`);
              if (failList) return { data: null, error: { message: 'boom' } };
              return { data: listing[folder] || [], error: null };
            },
            async remove(paths) {
              if (failRemove) return { error: { message: 'boom' } };
              removed.push(...paths.map((path) => `${bucket}:${path}`));
              return { error: null };
            },
          };
        },
      },
    },
  };
}

test('ลบใบเสนอราคา: กวาดครบทุกโฟลเดอร์ของใบ ไม่ใช่แค่โฟลเดอร์เดียว', async () => {
  const fake = fakeStorage({
    listing: {
      'quotations/QT-1/won': [{ name: 'slip.pdf', id: 'a' }],
      'quotations/QT-1/order-confirmation': [{ name: 'po.pdf', id: 'b' }, { name: 'po2.pdf', id: 'c' }],
    },
  });
  const removed = await purgePrivateEvidence(fake.supabase, 'quotations', 'QT-1');
  assert.equal(removed, 3);
  assert.deepEqual(fake.removed.sort(), [
    'sales-evidence:quotations/QT-1/order-confirmation/po.pdf',
    'sales-evidence:quotations/QT-1/order-confirmation/po2.pdf',
    'sales-evidence:quotations/QT-1/won/slip.pdf',
  ]);
});

test('ลบใบสั่งขาย: กวาดเฉพาะโฟลเดอร์ของใบสั่งขาย ไม่ไปแตะโฟลเดอร์ใบเสนอราคา', async () => {
  const fake = fakeStorage({ listing: { 'sales-orders/SOR-1/payments': [{ name: 'pay.pdf', id: 'a' }] } });
  await purgePrivateEvidence(fake.supabase, 'sales_orders', 'SOR-1');
  assert.deepEqual(fake.removed, ['sales-evidence:sales-orders/SOR-1/payments/pay.pdf']);
  assert.ok(!fake.listed.some((entry) => entry.includes('quotations/')));
});

test('รายการที่เป็นโฟลเดอร์ (id = null) ไม่ถูกสั่งลบ', async () => {
  const fake = fakeStorage({
    listing: { 'quotations/QT-2/won': [{ name: 'nested', id: null }, { name: 'ok.pdf', id: 'x' }] },
  });
  await purgePrivateEvidence(fake.supabase, 'quotations', 'QT-2');
  assert.deepEqual(fake.removed, ['sales-evidence:quotations/QT-2/won/ok.pdf']);
});

test('best-effort: Storage ล้มแล้วต้องไม่โยน error (แถวถูกลบไปแล้ว)', async () => {
  const failing = fakeStorage({ listing: { 'quotations/QT-3/won': [{ name: 'a.pdf', id: 'x' }] }, failRemove: true });
  assert.equal(await purgePrivateEvidence(failing.supabase, 'quotations', 'QT-3'), 0);
  const listBroken = fakeStorage({ failList: true });
  assert.equal(await purgePrivateEvidence(listBroken.supabase, 'quotations', 'QT-4'), 0);
});

test('ไฟล์ที่ใบอ้างไว้ตรง ๆ: ลบตาม ref และแยกตาม bucket', async () => {
  const fake = fakeStorage();
  const removed = await removeEvidenceRefs(fake.supabase, [
    { storagePath: 'quotations/QT-1/order-confirmation/po.pdf' },
    { storageBucket: 'issued-quotation-pdf', storagePath: 'quotations/QT-1/IDOC-1.pdf' },
    { fileName: 'ไม่มี path' },
  ]);
  assert.equal(removed, 2);
  assert.deepEqual(fake.removed.sort(), [
    'issued-quotation-pdf:quotations/QT-1/IDOC-1.pdf',
    'sales-evidence:quotations/QT-1/order-confirmation/po.pdf',
  ]);
});

test('ไม่มี ref / ไม่มี id = ไม่เรียก Storage เลย', async () => {
  const fake = fakeStorage();
  assert.equal(await removeEvidenceRefs(fake.supabase, []), 0);
  assert.equal(await purgePrivateEvidence(fake.supabase, 'quotations', null), 0);
  assert.deepEqual(fake.removed, []);
  assert.deepEqual(fake.listed, []);
});

/* ── ขอบเขตของการลบตาม ref (รอบสองของด่านที่มาไฟล์ · 2026-10-09) ──────────────
   🐞 ref ใน jsonb ของใบสั่งขายเคยรับ `{ fileUrl:'x', storagePath }` ที่ไม่มี bucket ได้ ⇒ ลบใบแล้ว
   object ที่ path นั้นชี้ถูกลบตาม ไม่ว่าเป็นของใคร · ผู้เรียกที่รู้โฟลเดอร์ของตัวเองจึงส่งขอบเขตมา */
function muteWarn(t) {
  const warned = [];
  t.mock.method(console, 'warn', (...args) => { warned.push(args); });
  return warned;
}

test('ส่งขอบเขตมา: ลบเฉพาะ ref ใน bucket นั้นและใต้โฟลเดอร์ที่อนุญาต ที่เหลือข้ามพร้อมเตือน', async (t) => {
  const warned = muteWarn(t);
  const fake = fakeStorage();
  const removed = await removeEvidenceRefs(fake.supabase, [
    { storageBucket: 'sales-evidence', storagePath: 'quotations/QT-1/order-confirmation/po.pdf', fileName: 'ลับ.pdf' },
    { storageBucket: 'sales-evidence', storagePath: 'quotations/QT-2/order-confirmation/other.pdf', fileName: 'ของใบอื่น.pdf' },
    { storageBucket: 'sales-evidence', storagePath: 'quotations/QT-1/won/slip.pdf' },
    { storageBucket: 'issued-quotation-pdf', storagePath: 'quotations/QT-1/order-confirmation/x.pdf' },
    { fileUrl: 'x', storagePath: 'quotations/QT-1/order-confirmation/no-bucket.pdf' },
    { storageBucket: 'sales-evidence', storagePath: 123 },
    { fileName: 'ไม่มี path' },
  ], { bucket: 'sales-evidence', prefixes: ['quotations/QT-1/order-confirmation/'] });
  assert.equal(removed, 1);
  assert.deepEqual(fake.removed, ['sales-evidence:quotations/QT-1/order-confirmation/po.pdf']);
  assert.equal(warned.length, 1, 'เตือนครั้งเดียวต่อการเรียก');
  const text = JSON.stringify(warned[0]);
  assert.ok(!text.includes('other.pdf') && !text.includes('ของใบอื่น') && !text.includes('no-bucket'), 'log ไม่มีชื่อไฟล์/ path ของ ref ที่ข้าม');
});

test('ส่งขอบเขตมา: หลายโฟลเดอร์ได้ และโฟลเดอร์ว่างในรายการไม่นับ', async (t) => {
  muteWarn(t);
  const fake = fakeStorage();
  const refs = [
    { storageBucket: 'sales-evidence', storagePath: 'quotations/QT-1/order-confirmation/a.pdf' },
    { storageBucket: 'sales-evidence', storagePath: 'quotations/QT-9/order-confirmation/b.pdf' },
    { storageBucket: 'sales-evidence', storagePath: 'elsewhere/c.pdf' },
  ];
  const removed = await removeEvidenceRefs(fake.supabase, refs, {
    bucket: 'sales-evidence',
    prefixes: ['', null, 'quotations/QT-1/order-confirmation/', 'quotations/QT-9/order-confirmation/'],
  });
  assert.equal(removed, 2, 'โฟลเดอร์ว่าง ("" ขึ้นต้นทุก path) ต้องไม่เปิดทั้ง bucket');
  assert.deepEqual(fake.removed.sort(), [
    'sales-evidence:quotations/QT-1/order-confirmation/a.pdf',
    'sales-evidence:quotations/QT-9/order-confirmation/b.pdf',
  ]);
});

test('ส่งขอบเขตมาแต่ไม่มีโฟลเดอร์/ไม่มี bucket = ไม่ลบอะไรเลย (ไม่ใช่ "ไม่กรอง")', async (t) => {
  muteWarn(t);
  const refs = [
    { storageBucket: 'sales-evidence', storagePath: 'quotations/QT-1/order-confirmation/po.pdf' },
    { storagePath: 'quotations/QT-1/order-confirmation/po2.pdf' },
  ];
  for (const options of [
    { bucket: 'sales-evidence', prefixes: [] },
    { bucket: 'sales-evidence', prefixes: [''] },
    { bucket: 'sales-evidence' },
    { bucket: 'sales-evidence', prefixes: 'quotations/QT-1/order-confirmation/' },
    { prefixes: ['quotations/QT-1/order-confirmation/'] },
    { bucket: '', prefixes: ['quotations/QT-1/order-confirmation/'] },
    {},
  ]) {
    const fake = fakeStorage();
    assert.equal(await removeEvidenceRefs(fake.supabase, refs, options), 0, JSON.stringify(options));
    assert.deepEqual(fake.removed, [], JSON.stringify(options));
  }
});

test('ไม่ส่งขอบเขต: ลบทุก ref เหมือนเดิม และไม่เตือน (เส้นลบใบเสนอราคา)', async (t) => {
  const warned = muteWarn(t);
  const refs = [
    { storagePath: 'quotations/QT-1/order-confirmation/po.pdf' },
    { storageBucket: 'issued-quotation-pdf', storagePath: 'quotations/QT-1/IDOC-1.pdf' },
    { storageBucket: 'sales-evidence', storagePath: 'anywhere/else.pdf' },
  ];
  for (const args of [[], [undefined], [null]]) {
    const fake = fakeStorage();
    assert.equal(await removeEvidenceRefs(fake.supabase, refs, ...args), 3);
    assert.deepEqual(fake.removed.sort(), [
      'issued-quotation-pdf:quotations/QT-1/IDOC-1.pdf',
      'sales-evidence:anywhere/else.pdf',
      'sales-evidence:quotations/QT-1/order-confirmation/po.pdf',
    ]);
  }
  assert.equal(warned.length, 0);
});
