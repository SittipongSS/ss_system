// สัญญาของ URL ดาวน์โหลดรายงาน — ตัวประกอบอยู่ใน component แต่เป็นฟังก์ชันบริสุทธิ์
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DOWNLOAD_URL, buildExportUrl, queueExportIds, queueStatusParam } from './exportUrl.js';

const q = (url) => Object.fromEntries(new URL(url, 'http://x').searchParams.entries());

test('ส่งเฉพาะตัวกรองที่มีค่าจริง — ค่าว่างต้องไม่กลายเป็นพารามิเตอร์เปล่า', () => {
  const { url } = buildExportUrl({
    type: 'registration',
    params: { status: '', customerId: null, from: '2026-08-01', to: undefined },
  });
  assert.deepEqual(q(url), { type: 'registration', from: '2026-08-01' });
});

test('อาร์เรย์ต่อด้วยคอมมา (multi-select ของตัวกรอง)', () => {
  const { url } = buildExportUrl({
    type: 'filing',
    params: { status: ['pending', 'received'], customerId: ['CUS-1', 'CUS-2'] },
  });
  assert.deepEqual(q(url), { type: 'filing', status: 'pending,received', customerId: 'CUS-1,CUS-2' });
});

test('ไม่ส่ง format ตอนขอ JSON (ใช้ตอนพิมพ์) และส่งเมื่อโหลดไฟล์', () => {
  assert.equal(q(buildExportUrl({ type: 'registration' }).url).format, undefined);
  assert.equal(q(buildExportUrl({ type: 'registration', format: 'xlsx' }).url).format, 'xlsx');
  assert.equal(q(buildExportUrl({ type: 'registration', format: 'zip' }).url).format, 'zip');
});

test('ids ถูกส่งไปเมื่อมีการเลือก/ค้นหา', () => {
  const { url } = buildExportUrl({ type: 'registration', ids: ['REG-1', 'REG-2'] });
  assert.equal(q(url).ids, 'REG-1,REG-2');
  assert.equal(q(buildExportUrl({ type: 'registration', ids: [] }).url).ids, undefined,
    'ไม่มีการเลือก = ให้ server กรองเองจากตัวกรอง ไม่ใช่ส่ง ids ว่าง');
});

/* เลือกเอกสารครบทุกชนิด = ไม่ต้องส่ง docTypes (ค่าตั้งต้นของ server คือทั้งหมด)
   ⇒ URL สั้นลง และไม่ผูกกับลำดับของลิสต์ */
test('docTypes ส่งเฉพาะตอนเลือกไม่ครบ', () => {
  const all = ['label_artwork', 'approval_letter', 'other', 'address_map'];
  const zip = (docTypes) => q(buildExportUrl({
    type: 'registration', format: 'zip', docTypes, allDocTypeCount: all.length,
  }).url).docTypes;
  assert.equal(zip(all), undefined, 'ครบทุกชนิด = ค่าตั้งต้นของ server ไม่ต้องส่ง');
  assert.equal(zip(['label_artwork']), 'label_artwork');
  assert.equal(zip([]), undefined);
});

/* 🪤 URL ยาวเกินถูกตัดเงียบ ๆ ที่เบราว์เซอร์/พร็อกซี ⇒ ได้ไฟล์ที่แถวไม่ครบโดยไม่มี
   อะไรฟ้อง · ต้องรู้ตัวก่อนยิง แล้วบอกให้กรองแคบลง */
test('รู้ตัวเมื่อ URL ยาวเกินเพดาน', () => {
  const short = buildExportUrl({ type: 'registration', ids: ['REG-1'] });
  assert.equal(short.tooLong, false);

  const many = Array.from({ length: 200 }, (_, i) => `REG-abcdefghij${i}`);
  const long = buildExportUrl({ type: 'registration', ids: many });
  assert.equal(long.tooLong, true);
  assert.ok(long.url.length > MAX_DOWNLOAD_URL);
});

test('type ติดไปด้วยเสมอ — server ปฏิเสธคำขอที่ไม่มี type', () => {
  for (const type of ['registration', 'filing', 'missingRetailPrice']) {
    assert.equal(q(buildExportUrl({ type }).url).type, type);
  }
});

test('ชิป "ทั้งหมด" ไม่กรอง · ชิปสถานะจริงส่งตรง ๆ', () => {
  assert.equal(queueStatusParam('all'), null);
  assert.equal(queueStatusParam(null), null);
  assert.equal(queueStatusParam('pending_legal'), 'pending_legal');
});

/* ชิป "รอฉันลงมือ" คิดจากตำแหน่งของผู้ใช้ฝั่งจอ — server ไม่มีตัวกรองคู่กัน
   ⇒ ต้องแปลงเป็นชุดสถานะที่เลนนั้นเป็นเจ้าของ ไม่งั้นไฟล์จะได้ทั้งคิว */
test('ชิป "รอฉันลงมือ" แปลงเป็นชุดสถานะของเลนนั้น', () => {
  assert.deepEqual(queueStatusParam('mine', ['pending_legal']), ['pending_legal']);
  assert.deepEqual(queueStatusParam('mine', ['received', 'filing']), ['received', 'filing']);
  // ไม่มีเลนของตัวเอง (เช่นแอดมิน) = ไม่กรอง ดีกว่าส่งชุดว่างแล้วได้ 0 แถว
  assert.equal(queueStatusParam('mine', []), null);
});

test('ที่ติ๊กเลือกไว้ชนะคำค้นเสมอ', () => {
  assert.deepEqual(
    queueExportIds({ selected: new Set(['REG-2']), visibleIds: ['REG-1', 'REG-2'], searching: true }),
    ['REG-2'],
  );
});

test('ไม่ได้เลือกแต่มีคำค้น → ส่ง id ของแถวที่เห็น', () => {
  assert.deepEqual(
    queueExportIds({ selected: new Set(), visibleIds: ['REG-1', 'REG-2'], searching: true }),
    ['REG-1', 'REG-2'],
  );
});

/* ไม่เลือกไม่ค้น = ปล่อย server กรองเอง — URL สั้นและรับแถวได้ไม่จำกัด
   (ส่ง ids ทั้งคิวจะชนเพดานความยาว URL ทันทีที่คิวโตขึ้น) */
test('ไม่เลือกไม่ค้น → ไม่ส่ง ids เลย', () => {
  assert.deepEqual(queueExportIds({ selected: new Set(), visibleIds: ['REG-1'], searching: false }), []);
  assert.deepEqual(queueExportIds({}), []);
});
