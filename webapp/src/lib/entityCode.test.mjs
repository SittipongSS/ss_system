// Tests รหัสเอนทิตี DL/PJ (mig 0096). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import {
  ymKey,
  entityCodeDisplay,
  insertRowWithEntityCode,
  insertRowsWithEntityCode,
} from './entityCode.js';

test('ymKey: YYMM จากปี ค.ศ. 2 หลัก', () => {
  assert.equal(ymKey(new Date('2026-07-14T09:00:00+07:00')), '2607'); // ก.ค. 2026
  assert.equal(ymKey(new Date('2026-01-01T09:00:00+07:00')), '2601'); // ม.ค.
  assert.equal(ymKey(new Date('2025-12-31T09:00:00+07:00')), '2512'); // ธ.ค.
});

// รอยต่อเดือน: นับตามเวลาไทย ไม่ใช่ timezone ของเครื่องที่รัน — วินาทีเดียวกันนี้ที่ UTC
// ยังเป็นเดือนก่อน ถ้าอ่านเดือนจาก Date ตรง ๆ ดีล/โครงการจะตกไปอยู่เดือนเก่า
// ขณะที่ใบเสนอราคา (businessMonthKey อยู่แล้ว) ขึ้นเดือนใหม่
test('ymKey: ข้ามเดือนตามเวลาไทย ไม่ใช่ UTC', () => {
  assert.equal(ymKey(new Date('2026-08-01T00:30:00+07:00')), '2608'); // = 2026-07-31T17:30Z
  assert.equal(ymKey(new Date('2026-07-31T23:59:00+07:00')), '2607'); // = 2026-07-31T16:59Z
  assert.equal(ymKey(new Date('2027-01-01T06:00:00+07:00')), '2701'); // ข้ามปีด้วย
});

// รหัสต้องออกพร้อม insert ในทรานแซกชันเดียว (mig 0238) — ฝั่ง JS ส่งได้แค่ท่อนหน้า
// กับความกว้าง ห้ามส่งรหัสสำเร็จรูปหรือจองเลขไว้ก่อน
test('สร้างแถวพร้อมออกรหัส: ส่ง scope/เดือน/prefix/ความกว้าง ให้ฟังก์ชัน SQL', async () => {
  const calls = [];
  const fake = { rpc: async (fn, args) => { calls.push([fn, args]); return { data: [{ code: 'DL-26080001' }], error: null }; } };
  const when = new Date('2026-08-12T09:00:00+07:00');

  const single = await insertRowWithEntityCode(fake, 'DL', { id: 'DEAL-1' }, when);
  assert.deepEqual(calls[0], [
    'create_entity_rows_with_code',
    { p_scope: 'DL', p_month: '2608', p_prefix: 'DL-2608', p_width: 4, p_rows: [{ id: 'DEAL-1' }] },
  ]);
  // ใบเดี่ยวคืนแถวเดียว ไม่ใช่ array — ผู้เรียกใช้แทน .insert().select().single() ได้ตรง ๆ
  assert.deepEqual(single, { data: { code: 'DL-26080001' }, error: null });
  // แถวที่ส่งไปต้องไม่มีคีย์ code ติดไปด้วย
  assert.equal('code' in calls[0][1].p_rows[0], false);

  await insertRowsWithEntityCode(fake, 'PB', [{ id: 'PBJ-1' }, { id: 'PBJ-2' }], when);
  assert.equal(calls[1][1].p_scope, 'PB');
  assert.equal(calls[1][1].p_prefix, 'PB-2608');
  assert.equal(calls[1][1].p_rows.length, 2);
});

test('สร้างแถวพร้อมออกรหัส: error ส่งกลับตามเดิม ไม่กลืน', async () => {
  const fake = { rpc: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) };
  const { data, error } = await insertRowWithEntityCode(fake, 'IS', { id: 'ISS-1' });
  assert.equal(data, null);
  assert.equal(error.code, '23505'); // ผู้เรียกยังแปลเป็น 409 ได้เหมือนตอน insert ตรง ๆ
});

test('entityCodeDisplay: ฐาน + "-" + revision (เริ่ม 0)', () => {
  assert.equal(entityCodeDisplay('DL-26070001', 0), 'DL-26070001-0');
  assert.equal(entityCodeDisplay('PJ-26070001', 2), 'PJ-26070001-2');
  assert.equal(entityCodeDisplay('DL-26070001', null), 'DL-26070001-0'); // null → 0 (ดีลไม่ revise)
  assert.equal(entityCodeDisplay('DL-26070001', undefined), 'DL-26070001-0');
  assert.equal(entityCodeDisplay('PJ-26070001'), 'PJ-26070001-0');
});

test('entityCodeDisplay: ไม่มีรหัส → "-"', () => {
  assert.equal(entityCodeDisplay(null, 0), '-');
  assert.equal(entityCodeDisplay('', 3), '-');
  assert.equal(entityCodeDisplay(undefined), '-');
});
