// ── แอดมินต้องผ่านด่านชั้นนอกทุกเส้นทางในระบบ ──────────────────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-28: "ขอสิทธิ์ทุกอย่างให้แอดมิน รวมลบด้วย"**
//
// ⚠️ `proxy.test.mjs` **จงใจไม่ทดสอบ admin** ("admin ผ่านทุกอย่างจึงพิสูจน์อะไรไม่ได้")
//   ซึ่งถูกในเชิงหาบั๊กของ role อื่น แต่แปลว่า **ไม่มีเทสต์ตัวไหนเลยที่รับประกันว่า
//   admin ผ่านจริง** — ถ้ามีคนเผลอเพิ่มกฎที่ตัด admin ไม่มีอะไรฟ้อง
//   ⇒ ไฟล์นี้เดินตรงข้าม: ไล่ **ทุก route ที่มีอยู่จริงในดิสก์** แล้วยืนยันว่า admin ผ่าน
//
// สองด่านที่ตรวจ (คนละชั้นกัน):
//   `lockedOut`       — เข้าหน้า/เรียก API ได้ไหม (allowlist ของทั้งระบบ)
//   `apiWriteAllowed` — เขียน/ลบ ผ่านชั้นนอกได้ไหม (ด่านหยาบก่อนถึง handler)
//
// ⚠️ ด่านชั้นในของแต่ละ handler (สถานะเอกสาร · มีลูกอ้างอยู่ · ต้องยืนยันโดยผู้แจ้ง)
//   เป็น **ด่านข้อมูล ไม่ใช่ด่านสิทธิ์** — ไม่อยู่ในขอบเขตของไฟล์นี้ และห้ามถอดทิ้ง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiWriteAllowed, lockedOut } from './proxy.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'app');

/* เดินหาไฟล์ route.js / page.js แล้วแปลงโฟลเดอร์เป็น URL จริง
   `[id]` → ค่าตัวอย่าง เพราะ proxy ตัดสินด้วยรูปเส้นทาง ไม่ใช่ค่าพารามิเตอร์ */
function routes(kind) {
  const out = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (name !== kind) continue;
      const rel = path.relative(appRoot, path.dirname(full)).replaceAll('\\', '/');
      const url = `/${rel}`
        .replace(/\/\([^/]+\)/g, '')        // route group (…) ไม่อยู่ใน URL จริง
        .replace(/\[\.\.\.[^\]]+\]/g, 'x')  // catch-all
        .replace(/\[[^\]]+\]/g, 'x');       // dynamic segment
      out.push(url === '/' ? '/' : url.replace(/\/$/, ''));
    }
  })(appRoot);
  return [...new Set(out)];
}

const ADMIN = { role: 'admin', extraCaps: [] };

test('⭐ แอดมินเปิดได้ทุกหน้าในระบบ — ไม่มีหน้าไหนเด้ง', () => {
  const pages = routes('page.js').filter((url) => !url.startsWith('/api'));
  assert.ok(pages.length > 40, `เจอหน้าแค่ ${pages.length} หน้า — ตัวเดินไฟล์น่าจะพัง`);

  const blocked = pages.filter((url) => lockedOut(ADMIN, url, 'GET', false));
  assert.deepEqual(blocked, [], 'มติ "admin ทำได้ทุกอย่าง" — หน้าที่เด้งแอดมินคือบั๊ก');
});

test('⭐ แอดมินเรียกได้ทุก API — ทุกเมธอด', () => {
  const apis = routes('route.js').filter((url) => url.startsWith('/api'));
  assert.ok(apis.length > 100, `เจอ API แค่ ${apis.length} เส้น — ตัวเดินไฟล์น่าจะพัง`);

  const blocked = [];
  for (const url of apis) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      if (lockedOut(ADMIN, url, method, true)) blocked.push(`${method} ${url} (lockedOut)`);
    }
  }
  assert.deepEqual(blocked, []);
});

test('⭐ แอดมิน **ลบ** ได้ทุกเส้นทางที่ด่านชั้นนอกรู้จัก', () => {
  const apis = routes('route.js').filter((url) => url.startsWith('/api'));
  const blocked = apis.filter((url) => !apiWriteAllowed('DELETE', url, 'admin', []));
  assert.deepEqual(blocked, [], 'ด่านหยาบต้องไม่ตัดแอดมินออกจากการลบเส้นทางไหนเลย');
});

test('แอดมินเขียนได้ทุกเส้นทาง (POST/PUT/PATCH) ด้วย', () => {
  const apis = routes('route.js').filter((url) => url.startsWith('/api'));
  const blocked = [];
  for (const url of apis) {
    for (const method of ['POST', 'PUT', 'PATCH']) {
      if (!apiWriteAllowed(method, url, 'admin', [])) blocked.push(`${method} ${url}`);
    }
  }
  assert.deepEqual(blocked, []);
});

/* ⚠️ ด่านนี้ต้องยังทำงานกับคนอื่นอยู่ — ถ้าเผลอทำให้ apiWriteAllowed คืน true
   ให้ทุกคน เทสต์สามตัวข้างบนจะเขียวโดยไม่มีความหมายอะไรเลย */
test('ด่านชั้นนอกยังตัดคนอื่นอยู่จริง — ไม่ได้เขียวเพราะประตูเปิดหมด', () => {
  assert.equal(apiWriteAllowed('DELETE', '/api/users/x', 'ae', []), false);
  assert.equal(apiWriteAllowed('POST', '/api/holidays', 'ae', []), false);
  assert.equal(lockedOut({ role: 'ae', extraCaps: [] }, '/users', 'GET', false), true);
});
