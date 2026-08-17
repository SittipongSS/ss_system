// ── ทุกจุดที่ยิงคำขออัปโหลดต้องรายงานสาเหตุจริง ไม่ใช่ข้อความตายตัว ────────
//
// 🐞 ที่มา: แพตเทิร์นนี้ถูกก๊อปไป 7 จุดโดยไม่มีใครสังเกต
//     const data = await res.json().catch(() => ({}));
//     throw new Error(data.error || "อัปโหลดไฟล์ไม่สำเร็จ");
// มันอ่านได้เฉพาะ error ที่ handler ของเราตอบเป็น JSON · คำขอที่ถูกตัด **ก่อน**
// ถึง handler (เพดานขนาดของชั้นโฮสติ้ง / เกตเวย์ / หมดเวลารอ) ตอบเป็น HTML ⇒
// ตกไปใช้ค่าสำรองที่ไม่บอกอะไรเลย แม้แต่ HTTP status ก็ถูกทิ้ง
//
// ผลจริงบน prod: ผู้ใช้แนบเอกสารในหน้าลูกค้าไม่ขึ้น ได้ข้อความว่า "อัปโหลดไฟล์
// ไม่สำเร็จ" ซึ่งตามต่อไม่ได้ทั้งฝั่งผู้ใช้และคนดูแลระบบ — ต้องมานั่งไล่โค้ดถึงจะรู้ว่า
// ข้อความนั้นแปลว่า "คำขอไปไม่ถึงแอปเลย"
//
// ⭐ รอบขยายเพดานเป็น 25 MB: จุดอัปโหลดทั้ง 9 จุดถูกยุบเหลือ **ทางเดียว**
// (`lib/master/uploadFile.js` — ขอทางที่ /api/upload/session แล้วยิงไบต์ขึ้นที่เก็บตรง)
// เทสต์นี้จึงคุมสองอย่าง: ทางอัปต้องมีที่เดียว และทางนั้นต้องไม่กลืนสาเหตุจริง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SRC = fileURLToPath(new URL('../', import.meta.url));
const UPLOAD_ENTRY = 'lib/master/uploadFile.js';

function jsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { jsFiles(full, out); continue; }
    if (/\.js$/.test(entry)) out.push(full);
  }
  return out;
}

// ไฟล์ที่ "อัปโหลดจริง" = ยิง POST ไป /api/upload (เส้นสำรอง) · /api/upload/session
// (ขอทางอัปตรง) · /api/upload/commit (ย้ายจากที่พักเข้า Drive) · การเรียกแบบ DELETE
// (rollback ไฟล์กำพร้า) ไม่นับ เพราะเป็น best-effort ที่ตั้งใจเงียบ
const UPLOAD_FETCH = /fetch\(\s*["']\/api\/upload(\/session|\/commit)?["']\s*,\s*\{\s*method:\s*["']POST["']/;

const uploaders = jsFiles(SRC).filter((f) => UPLOAD_FETCH.test(readFileSync(f, 'utf8')));

test('⭐ ทางอัปไฟล์มีที่เดียว — ห้ามก๊อปการยิง /api/upload ไปไว้ในหน้า/โมดัลอีก', () => {
  const rel = uploaders.map((f) => path.relative(SRC, f)).sort();
  assert.deepEqual(
    rel,
    [UPLOAD_ENTRY],
    'จุดที่ยิงคำขออัปโหลดเองแทนที่จะเรียก uploadFileForEntity():\n  '
      + `${rel.filter((r) => r !== UPLOAD_ENTRY).join('\n  ')}`,
  );
});

test('⭐ ทางอัปต้องใช้ describeResponseError อ่านสาเหตุจาก response', () => {
  const missing = uploaders
    .filter((f) => !readFileSync(f, 'utf8').includes('describeResponseError'))
    .map((f) => path.relative(SRC, f));
  assert.deepEqual(
    missing,
    [],
    'จุดอัปโหลดที่ยังกลืนสาเหตุจริง — ผู้ใช้จะเห็นแค่ข้อความตายตัวเวลาคำขอไปไม่ถึงแอป:\n  '
      + `${missing.join('\n  ')}`,
  );
});

// ดูเฉพาะโค้ดถัดจากบรรทัด fetch ของการอัปโหลดจริง — ไฟล์เดียวกันมี fetch อื่นอีกหลาย
// ตัวที่ไม่เกี่ยว (ถ้าสแกนทั้งไฟล์จะฟ้องผิดตัว)
const AFTER_UPLOAD = new RegExp(`${UPLOAD_FETCH.source}[\\s\\S]{0,600}`, 'g');

test('ห้ามอ่าน body ก่อนเช็ก .ok ในจุดอัปโหลด — body ของ error ไม่ใช่ JSON', () => {
  const bad = [];
  for (const f of uploaders) {
    for (const block of readFileSync(f, 'utf8').match(AFTER_UPLOAD) || []) {
      const readsBody = block.indexOf('.json()');
      const checksOk = block.search(/!\w+\.ok|\w+\.ok\s*\?/);
      // อ่าน body ก่อนเช็กสถานะ = แพตเทิร์นเดิมที่ทำให้สาเหตุจริงหายไป
      if (readsBody !== -1 && (checksOk === -1 || readsBody < checksOk)) {
        bad.push(path.relative(SRC, f));
      }
    }
  }
  assert.deepEqual([...new Set(bad)], [], `ต้องเช็ก .ok ก่อนแล้วค่อยอ่าน body:\n  ${bad.join('\n  ')}`);
});
