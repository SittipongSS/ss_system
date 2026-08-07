// ย่อ user agent สำหรับแสดงผล — ค่าเต็มยังถูกเก็บไว้เสมอ
import test from 'node:test';
import assert from 'node:assert/strict';
import { shortUserAgent } from './userAgent.js';

test('เบราว์เซอร์หลักอ่านออกเป็น "ชื่อ เวอร์ชัน · ระบบ"', () => {
  assert.equal(
    shortUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'),
    'Chrome 141 · macOS',
  );
  assert.equal(
    shortUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'),
    'Safari 18 · iPhone',
  );
  assert.equal(
    shortUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0'),
    'Firefox 130 · Windows',
  );
});

// 🐞 กับดัก: Edge/Opera/Samsung ใส่คำว่า "Chrome" ไว้ใน UA ของตัวเองด้วย
// เช็คผิดลำดับเมื่อไร ทุกอย่างกลายเป็น Chrome แล้วไล่บั๊กเฉพาะเบราว์เซอร์ไม่ได้
test('เบราว์เซอร์ที่ปลอมตัวเป็น Chrome ต้องไม่ถูกอ่านว่า Chrome', () => {
  const base = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  assert.equal(shortUserAgent(`${base} Edg/141.0.0.0`), 'Edge 141 · Windows');
  assert.equal(shortUserAgent(`${base} OPR/117.0.0.0`), 'Opera 117 · Windows');
  assert.equal(
    shortUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36'),
    'Samsung Internet 27 · Android',
  );
});

// เดาไม่ออกยังดีกว่าไม่บอกอะไรเลย — แถบนี้มีไว้บอกผู้ใช้ว่าระบบเก็บอะไรไป (มติ Q6)
test('จับรูปแบบไม่ได้ = ตัดสั้น ไม่คืนค่าว่าง', () => {
  assert.equal(shortUserAgent(''), '');
  assert.equal(shortUserAgent(null), '');
  assert.equal(shortUserAgent('curl/8.4.0'), 'curl/8.4.0');
  assert.equal(shortUserAgent('x'.repeat(200)).length, 60);
});
