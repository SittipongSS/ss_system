// Tests รหัสเอนทิตี DL/PJ (mig 0096). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import {
  ymKey,
  entityCounterKey,
  entityRunningWidth,
  entityCodeDisplay,
  insertRowWithComposedCode,
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

// รหัสต้องออกพร้อม insert ในทรานแซกชันเดียว (mig 0240) — ฝั่ง JS ส่งได้แค่ท่อนหน้า
// กับความกว้าง ห้ามส่งรหัสสำเร็จรูปหรือจองเลขไว้ก่อน
test('สร้างแถวพร้อมออกรหัส: ส่ง scope/เดือน/prefix/ความกว้าง ให้ฟังก์ชัน SQL', async () => {
  const calls = [];
  const fake = { rpc: async (fn, args) => { calls.push([fn, args]); return { data: [{ code: 'DL-26080001' }], error: null }; } };
  const when = new Date('2026-08-12T09:00:00+07:00');

  const single = await insertRowWithEntityCode(fake, 'DL', { id: 'DEAL-1' }, when);
  /* ⚠️ `p_month` (คีย์ถังนับ) กับ `p_prefix` (สิ่งที่โผล่ในรหัส) เป็นคนละค่ากันตั้งแต่
     mig 0330 — ดีลตัดรอบรายปี แต่รหัสยังมีเดือนอยู่ · เผลอส่งค่าเดียวกันสองช่องเมื่อไร
     เลขจะรีเซ็ตทุกเดือนเงียบ ๆ แล้วชนรหัสของเดือนก่อนทันที */
  assert.deepEqual(calls[0], [
    'create_entity_rows_with_code',
    { p_scope: 'DL', p_month: '26', p_prefix: 'DL-2608', p_width: 5, p_rows: [{ id: 'DEAL-1' }] },
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

// ── รหัสที่ประกอบเอง (ไซต์ ST- / โซน ZN- · มติผู้ใช้ 2026-08-29) ──────────
test('รหัสประกอบเอง: ส่ง prefix/ถังนับ/ความกว้าง ที่ผู้เรียกกำหนด ไม่ใช่เดือน', async () => {
  const calls = [];
  const fake = { rpc: async (fn, args) => { calls.push([fn, args]); return { data: [{ code: 'ST-0121-01-BKK-10001' }], error: null }; } };

  const one = await insertRowWithComposedCode(
    fake,
    { scope: 'SS', bucket: '-', prefix: 'ST-0121-01-BKK-', width: 5 },
    { id: 'SVS-1' },
  );
  assert.deepEqual(calls[0], [
    'create_entity_rows_with_code',
    { p_scope: 'SS', p_month: '-', p_prefix: 'ST-0121-01-BKK-', p_width: 5, p_rows: [{ id: 'SVS-1' }] },
  ]);
  assert.deepEqual(one, { data: { code: 'ST-0121-01-BKK-10001' }, error: null });
  // แถวที่ส่งไปต้องไม่มีคีย์ code ติดไปด้วย (กติกาเดียวกับรหัสรายเดือน)
  assert.equal('code' in calls[0][1].p_rows[0], false);
});

test('รหัสประกอบเอง: error ส่งกลับตามเดิม ไม่กลืน', async () => {
  const fake = { rpc: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) };
  const { data, error } = await insertRowWithComposedCode(
    fake, { scope: 'ZN', bucket: '-', prefix: 'ZN-10001-04-', width: 3 }, { id: 'SZN-1' },
  );
  assert.equal(data, null);
  assert.equal(error.code, '23505');
});

/* ── รอบตัด/ความกว้างรายสโคป (มติผู้ใช้ 2026-09-01 · mig 0330) ────────────── */
test('DL/PJ ตัดรอบรายปี 5 หลัก · PB/SV/IS ยังรายเดือน 4 หลัก', () => {
  const when = new Date('2026-09-01T09:00:00+07:00');
  for (const scope of ['DL', 'PJ']) {
    assert.equal(entityCounterKey(scope, when), '26', scope);
    assert.equal(entityRunningWidth(scope), 5, scope);
  }
  for (const scope of ['PB', 'SV', 'IS', 'SS', 'ZN']) {
    assert.equal(entityCounterKey(scope, when), '2609', scope);
    assert.equal(entityRunningWidth(scope), 4, scope);
  }
});

test('รหัสที่ออกจริงยังมีเดือนอยู่ ทั้งที่ตัดรอบรายปี', async () => {
  const calls = [];
  const fake = { rpc: async (fn, args) => { calls.push(args); return { data: [{ code: 'PJ-260900191' }], error: null }; } };
  await insertRowsWithEntityCode(fake, 'PJ', [{ id: 'PRJ-1' }], new Date('2026-09-01T09:00:00+07:00'));
  assert.equal(calls[0].p_prefix, 'PJ-2609');   // เดือนอยู่ในรหัส
  assert.equal(calls[0].p_month, '26');         // แต่ถังนับเป็นปี
  assert.equal(calls[0].p_width, 5);
});
