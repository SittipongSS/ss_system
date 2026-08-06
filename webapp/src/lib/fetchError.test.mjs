// ── ข้อความ error ต้องพาไปต่อได้เสมอ ─────────────────────────────────────
//
// 🐞 ที่มา: ผู้ใช้แนบเอกสารในหน้าลูกค้าไม่ขึ้น เห็นแค่ "อัปโหลดไฟล์ไม่สำเร็จ" ซึ่ง
// เป็นค่าสำรองตายตัวที่ใช้เมื่อ `res.json()` พัง — และมันพังทุกครั้งที่คำขอถูกตัด
// **ก่อน** ถึง handler ของเรา (ตอบเป็น HTML) ⇒ ทั้ง status และสาเหตุหายไปพร้อมกัน
// เทสต์นี้ล็อกไว้ว่าเคสนั้นต้องยังเหลือเลข status ให้ตามต่อ
import test from 'node:test';
import assert from 'node:assert/strict';

import { describeResponseError } from './fetchError.js';

const jsonRes = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const textRes = (body, status) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html' } });

test('ข้อความจาก handler ของเราชนะเสมอ — ส่งต่อทั้งดุ้น ไม่ตกแต่ง', async () => {
  const msg = await describeResponseError(
    jsonRes({ error: 'ชนิดไฟล์ไม่รองรับ: x.ai (.ai)' }, 415),
    'อัปโหลดไฟล์ไม่สำเร็จ',
  );
  assert.equal(msg, 'ชนิดไฟล์ไม่รองรับ: x.ai (.ai)');
});

test('⭐ body ไม่ใช่ JSON (ถูกตัดก่อนถึง handler) ต้องยังบอก status + ทางแก้', async () => {
  const msg = await describeResponseError(
    textRes('<html>Request Entity Too Large</html>', 413),
    'อัปโหลดไฟล์ไม่สำเร็จ',
  );
  assert.match(msg, /อัปโหลดไฟล์ไม่สำเร็จ/);
  assert.match(msg, /บีบไฟล์/, 'ต้องบอกว่าให้ไปบีบไฟล์ ไม่ใช่กดซ้ำ');
  assert.match(msg, /HTTP 413/, 'เลข status คือเบาะแสเดียวที่เหลือ ห้ามทิ้ง');
});

test('ห้ามเอาเนื้อ HTML ของหน้า error มาโชว์ผู้ใช้', async () => {
  const msg = await describeResponseError(textRes('<html><body>...</body></html>', 502), 'ส่งไม่สำเร็จ');
  assert.ok(!msg.includes('<'), `ต้องไม่มี markup หลุดเข้าไปในข้อความ: ${msg}`);
  assert.match(msg, /HTTP 502/);
});

test('JSON ที่ไม่มีฟิลด์ error ก็ยังต้องได้ status', async () => {
  const msg = await describeResponseError(jsonRes({ ok: false }, 500), 'บันทึกเอกสารไม่สำเร็จ');
  assert.match(msg, /บันทึกเอกสารไม่สำเร็จ/);
  assert.match(msg, /HTTP 500/);
});

test('error ที่เป็นช่องว่างล้วนไม่นับเป็นข้อความจริง — ตกไปใช้ status', async () => {
  const msg = await describeResponseError(jsonRes({ error: '   ' }, 403), 'ลบไม่สำเร็จ');
  assert.match(msg, /HTTP 403/);
  assert.match(msg, /ไม่มีสิทธิ์/);
});

test('status ที่ไม่มีคำอธิบายเฉพาะ ยังต้องติดเลขไปด้วย', async () => {
  const msg = await describeResponseError(textRes('nope', 418), 'ทำรายการไม่สำเร็จ');
  assert.equal(msg, 'ทำรายการไม่สำเร็จ (HTTP 418)');
});
