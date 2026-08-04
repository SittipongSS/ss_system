// ── หน้าดีล: query พังต้องไม่กลายเป็น "ไม่มีข้อมูล" ─────────────────────────
//
// `GET /deals/[id]/overview` โหลด 15 ก้อนพร้อมกันผ่านตัวช่วย `safe()` ซึ่งจับ error
// ไว้เป็น `{ data: fallback, warning }` — ออกแบบถูกแล้ว **แต่ผู้เรียกต้องเอา warning
// ไปใส่ลิสต์เอง** และเมื่อลืม ผลลัพธ์เหมือนไม่มีตัวช่วยเลย: การ์ดว่างเปล่าเงียบสนิท
//
// เจอจริง 2026-08-05 (ตรวจ flow DL): `inquiries` (คำร้องข้ามฝ่าย) กับ `siblingDeals`
// (ดีลอื่นในโครงการเดียวกัน) ตกหล่นทั้งคู่ — อาการเดียวกับที่หน้าโครงการโดนตอนตาราง
// `inquiries` ถูก DROP ใน mig 0174 แล้วไม่มีใครรู้อยู่หลายวัน
//
// ratchet ตัวนี้ต่างจาก `maskedQueryErrors.test.mjs`: อันนั้นจับ "ทิ้ง error ตั้งแต่ต้น"
// ส่วนอันนี้จับ "รับ error มาแล้วทำหล่นกลางทาง"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const ROUTE = 'src/app/api/sales-planning/deals/[id]/overview/route.js';
const src = readFileSync(join(ROOT, ROUTE), 'utf8');

/** ชื่อตัวแปรทุกตัวที่ถือผลของ safe() — ดูจากการที่มันถูกอ่านเป็น `X.data` */
function sections(text) {
  return [...new Set(
    [...text.matchAll(/\b([a-zA-Z][a-zA-Z0-9]*)\.data\b/g)].map(([, name]) => name),
  )];
}

test('ตัวช่วย safe() ยังคืน warning คู่กับ data (ถ้าเปลี่ยนรูป เทสต์นี้ต้องตามแก้)', () => {
  assert.match(src, /function safe\(/);
  assert.match(src, /return \{ data: fallback, warning: `\$\{label\}: \$\{error\.message\}` \}/);
});

test('ทุกก้อนที่โหลดผ่าน safe() ต้องมี warning ถูกส่งต่อ — ห้ามหล่นกลางทาง', () => {
  const missing = sections(src).filter((name) => !new RegExp(`\\b${name}\\.warning\\b`).test(src));
  assert.deepEqual(
    missing, [],
    `ก้อนเหล่านี้อ่าน .data แต่ไม่มีใครอ่าน .warning ⇒ query พังแล้วการ์ดจะว่างเงียบ ๆ: ${missing.join(', ')}`,
  );
});

// ⭐ ยืนยันว่าเคย**พังจริง** ไม่ใช่กันของที่ไม่เคยเกิด — สองตัวนี้คือที่ตกหล่น
test('inquiries กับ siblingDeals อยู่ในลิสต์ warning แล้ว', () => {
  const block = src.slice(src.indexOf('const warnings = ['), src.indexOf('.filter(Boolean)'));
  for (const name of ['inquiries', 'siblingDeals']) {
    assert.match(block, new RegExp(`${name}\\.warning`), `${name} ต้องอยู่ในลิสต์ warnings`);
  }
});

test('warnings ถูกส่งกลับไปให้หน้าจอจริง ไม่ได้คำนวณแล้วทิ้ง', () => {
  assert.match(src, /return ok\(\{[\s\S]*\bwarnings,[\s\S]*\}\)/);
});
