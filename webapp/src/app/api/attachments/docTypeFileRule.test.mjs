// ── POST ของเส้นไฟล์แนบบังคับกติกาไฟล์ราย docType (มติผู้ใช้ 2026-09-22) ─────────────
//
// ⭐ "ภาพประกอบใบสเปค อยากจำกัดไฟล์แค่รูป เพราะตอนนี้ pdf ai ก็ดันแนบได้"
// ⚠️ ด่านจริงต้องอยู่ที่ server — ปุ่มเลือกไฟล์กันได้แค่ทางเดียว ลากวาง/Ctrl+V/ยิง API ตรงผ่านไปได้
// ⚠️ อ่านจาก source ไม่ใช่ import — route.js ของ Next export ได้แค่ handler และตัว route
//    ดึง supabase/Drive มาด้วยทั้งชุด (แพตเทิร์นเดียวกับ specIllustrationRetire.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('./route.js', import.meta.url)), 'utf8');
const post = source.slice(source.indexOf('export async function POST'));

test('POST ถามกติกาไฟล์ของ docType ก่อนคุยกับ Drive และก่อนเขียนแถว', () => {
  const check = post.indexOf('attachmentFileRuleError(safeDocType');
  assert.ok(check > 0, 'POST ต้องเรียก attachmentFileRuleError กับ docType ที่ผ่านการคัดแล้ว');
  assert.ok(check < post.indexOf('buildGoogleAttachment('), 'ต้องตรวจก่อนสร้างเอกสาร Google บน Drive');
  assert.ok(check < post.indexOf(".insert("), 'ต้องตรวจก่อน INSERT แถวไฟล์แนบ');
});

test('เอกสาร Google แนบเป็น docType ที่มีกติกาไฟล์ไม่ได้', () => {
  assert.match(post, /fileRule[\s\S]{0,200}google\s*\?/);
});
