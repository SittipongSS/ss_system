// Tests โดเมนของปุ่มบนการ์ด Google Chat
// Run: npm test
//
// 🐞 ที่มา 2026-08-08: `APP_BASE_URL` เป็นค่าที่คนต้องตั้งเอง ⇒ พลาดได้สองแบบและเงียบ
// ทั้งคู่ — ลืมตั้งแล้วปุ่มหาย กับเอาค่าจากเครื่อง (localhost) ไปใส่บน Vercel แล้ว
// ทั้งทีมกดปุ่มไม่ได้ ขณะที่การ์ดยังส่งสำเร็จทุกครั้ง
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAppBaseUrl } from './chat.js';

test('ค่าที่ตั้งเองมาก่อนเสมอ — ตัด / ท้ายทิ้งให้ด้วย', () => {
  assert.equal(resolveAppBaseUrl({ APP_BASE_URL: 'https://ss.example.com' }), 'https://ss.example.com');
  assert.equal(resolveAppBaseUrl({ APP_BASE_URL: 'https://ss.example.com/' }), 'https://ss.example.com');
  // NEXT_PUBLIC_BASE_URL เป็นตัวรอง (ของเดิมรองรับอยู่แล้ว ห้ามหลุด)
  assert.equal(resolveAppBaseUrl({ NEXT_PUBLIC_BASE_URL: 'https://b.example.com' }), 'https://b.example.com');
  assert.equal(
    resolveAppBaseUrl({ APP_BASE_URL: 'https://a.example.com', NEXT_PUBLIC_BASE_URL: 'https://b.example.com' }),
    'https://a.example.com',
  );
});

test('ไม่ได้ตั้งค่า แต่รันบน Vercel → ใช้โดเมน production ที่ Vercel ใส่ให้เอง', () => {
  assert.equal(
    resolveAppBaseUrl({ VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'ss-system.vercel.app' }),
    'https://ss-system.vercel.app',
  );
  // เผลอใส่ protocol/slash มาด้วยก็ต้องไม่ได้ https://https:// หรือ // ซ้อน
  assert.equal(
    resolveAppBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'https://ss-system.vercel.app/' }),
    'https://ss-system.vercel.app',
  );
});

test('⭐ ตั้ง localhost ไว้บน Vercel = ผิดแน่นอน — ข้ามไปใช้โดเมนจริง', () => {
  /* เคสนี้คือสาเหตุที่ฟังก์ชันนี้เกิด: ค่าในไฟล์ของเครื่องคือ http://localhost:3000
     ถ้าถูกก๊อปไปใส่บน Vercel ปุ่มบนการ์ดจะพาทั้งทีมไป localhost โดยการ์ดยังส่งสำเร็จ */
  const env = { VERCEL: '1', APP_BASE_URL: 'http://localhost:3000', VERCEL_PROJECT_PRODUCTION_URL: 'ss-system.vercel.app' };
  assert.equal(resolveAppBaseUrl(env), 'https://ss-system.vercel.app');
  assert.equal(
    resolveAppBaseUrl({ ...env, APP_BASE_URL: 'http://127.0.0.1:3000' }),
    'https://ss-system.vercel.app',
  );
});

test('localhost ตอนรันในเครื่อง = ถูกต้อง ห้ามไปยุ่ง', () => {
  // ไม่มี VERCEL = นักพัฒนารันเอง ลิงก์ควรชี้เครื่องตัวเอง
  assert.equal(resolveAppBaseUrl({ APP_BASE_URL: 'http://localhost:3000' }), 'http://localhost:3000');
});

test('ไม่มีอะไรให้ใช้เลย → คืนค่าว่าง (ผู้เรียกตัดปุ่มทิ้ง ดีกว่าปุ่มที่กดแล้วพัง)', () => {
  assert.equal(resolveAppBaseUrl({}), '');
  assert.equal(resolveAppBaseUrl({ VERCEL: '1' }), '');
  // localhost บน Vercel แต่ไม่มีโดเมนสำรอง — ยอมไม่มีปุ่ม ดีกว่าพาไป localhost
  assert.equal(resolveAppBaseUrl({ VERCEL: '1', APP_BASE_URL: 'http://localhost:3000' }), '');
});
