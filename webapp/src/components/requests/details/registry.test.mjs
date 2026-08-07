// ── ทะเบียนเนื้อหน้ารายละเอียดรายหัวข้อ (P3b) ────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REQUEST_KIND_LIST } from '../../../lib/master/requestTypes.js';

const SRC = readFileSync('src/components/requests/details/index.js', 'utf8');
const PAGE = readFileSync('src/app/requests/[id]/page.js', 'utf8');

test('ทุกหัวข้อในทะเบียนต้องมีเนื้อหน้ารายละเอียด — ถอยได้ ไม่พัง', () => {
  // ⚠️ หัวข้อที่ไม่มีจอของตัวเองต้อง **ถอยไปตัวกลาง** ไม่ใช่จอขาว — ใบเก่าของ
  // หัวข้อที่ถูกถอดไปแล้วก็ยังต้องเปิดอ่านได้
  assert.match(SRC, /BY_KIND\[kind\] \|\| SharedRequestDetail/);
  assert.ok(REQUEST_KIND_LIST.length > 0);
});

test('🔴 หน้า /requests/[id] ต้องไม่ตัดสินเนื้อจากชื่อหัวข้อเอง', () => {
  // ⚠️ ratchet ของ ม-34: `kind === '...'` กลางหน้าที่ทุกหัวข้อใช้ร่วมกัน คือทางที่
  // ทำให้ไฟล์นี้โตกลับไปเป็นก้อนเดียวอีกรอบ · เงื่อนไขรายหัวข้ออยู่ในไฟล์ของหัวข้อนั้น
  // ⚠️ เทียบเฉพาะ `req.kind` — `confirm.kind` เป็นชนิด*โมดัล* คนละเรื่องกัน
  assert.ok(!/req\.kind === ["']/.test(PAGE), 'หน้าเปลือกต้องไม่เทียบชื่อหัวข้อตรง ๆ');
  assert.match(PAGE, /detailForKind\(req\.kind\)/, 'ต้องเลือกเนื้อจากทะเบียน');
});

test('ทะเบียนแยกจาก lib/requests/kinds โดยตั้งใจ — server bundle ต้องไม่ลาก React', () => {
  // ⚠️ `lib/requests/kinds/registry.js` ถูก import จาก route กับ permissions ซึ่งแตะ
  // React ไม่ได้ · ผูก component เข้าไปเมื่อไรจะลาก React เข้า server ทั้งสาย
  const kinds = readFileSync('src/lib/requests/kinds/registry.js', 'utf8');
  assert.ok(!/from ['"]react['"]/.test(kinds));
  assert.ok(!/components\//.test(kinds), 'ทะเบียนหัวข้อต้องไม่ import component');
});
