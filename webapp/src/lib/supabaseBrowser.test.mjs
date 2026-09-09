// ── createClient ฝั่งเบราว์เซอร์ตอน devBypass ───────────────────────────────
//
// 🐞 UAT 2026-09-09: หน้าไปป์ไลน์ดีลเปิดไม่ขึ้นใต้ devBypass เพราะเรียก
// `createClient().auth.getUser()` แล้ว `createBrowserClient` โยน error เมื่อ
// `NEXT_PUBLIC_SUPABASE_*` ว่าง — ซึ่งคือสวิตช์ที่เปิด bypass พอดี
//
// เทสต์นี้อ่านซอร์ส (ไฟล์นั้น import จาก '@supabase/ssr' + ใช้ alias '@/' ⇒ รันตรง ๆ
// ในเทสต์รันเนอร์ไม่ได้) แล้วตรึงสามข้อที่ทำให้ทางนี้ปลอดภัย
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'supabaseBrowser.js'), 'utf8');

/* 🔴 ด่านที่สำคัญที่สุด — ทางสมมติต้องเดินไม่ได้บน production ที่ตั้งค่าหลุด
   ไม่งั้นจะกลายเป็น "ล็อกอินปลอม" แทนที่จะเด้ง error ให้คนแก้ค่า */
test('ทางสมมติต้องต้องการทั้งสองเงื่อนไข: env ว่าง และไม่ใช่ production', () => {
  assert.match(SRC, /const DEV_BYPASS_ALLOWED = !SUPABASE_BROWSER_CONFIGURED\s*\n?\s*&& process\.env\.NODE_ENV !== 'production';/);
  assert.match(SRC, /if \(DEV_BYPASS_ALLOWED\) return devBypassBrowserClient\(\);/);
});

/* ⚠️ ต้องอ่าน env แบบอ้างชื่อเต็มตรง ๆ — Next แทนค่าให้เฉพาะรูปนี้
   ส่ง `process.env` ทั้งก้อนเข้าไปจะได้ค่าว่างในเบราว์เซอร์ (บทเรียนเดียวกับ AppLayout) */
test('อ่าน env ด้วยชื่อเต็ม ไม่ส่ง process.env ทั้งก้อน', () => {
  for (const key of [
    'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_DEV_BYPASS_ROLE', 'NEXT_PUBLIC_DEV_BYPASS_DEPARTMENT', 'NEXT_PUBLIC_DEV_BYPASS_TEAM',
  ]) {
    assert.match(SRC, new RegExp(`process\\.env\\.${key}\\b`), key);
  }
  assert.doesNotMatch(SRC, /devBypassUser\(process\.env\)/, 'ห้ามส่ง process.env ทั้งก้อน');
});

/* ⚠️ ผู้ใช้สมมติต้องเป็นคนเดียวกับฝั่ง server — ถ้าคนละ id ขอบเขต "ของฉัน" บนจอ
   กับด่านฝั่ง API จะตัดสินคนละคน แล้ว UAT เชื่อไม่ได้ */
test('ใช้ devBypassUser ตัวเดียวกับฝั่ง server และไม่กลบเมธอดที่ไม่รองรับเงียบ ๆ', () => {
  assert.match(SRC, /import \{ devBypassUser \} from '@\/lib\/devBypass';/);
  assert.match(SRC, /id: me\.id,/);
  for (const method of ['getUser', 'getSession', 'signOut', 'onAuthStateChange']) {
    assert.match(SRC, new RegExp(`${method}:`), method);
  }
  // เมธอดที่ทางสมมติทำแทนไม่ได้ ต้องโยน error เดิม ไม่ใช่คืนค่าว่าง
  assert.match(SRC, /signInWithPassword: async \(\) => \{ throw new Error\(MISSING_ENV\); \}/);
  assert.match(SRC, /from\(\) \{ throw new Error\(MISSING_ENV\); \}/);
});
