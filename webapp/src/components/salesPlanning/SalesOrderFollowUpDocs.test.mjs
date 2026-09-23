// ── การ์ด "เอกสารต่อเนื่อง" บนหน้า SO — ยามระดับซอร์ส (มติเจ้าของ 23/09/2569) ─────────────────────
//
// ⭐ "การสร้างเอกสาร ยังไม่ต้องรันอะไร จนกว่าจะบันทึก เอาแบบ คำร้อง แบบใบเสนอราคา" — ปุ่ม "ออกเอกสาร" บนการ์ด
//    ต้อง **พาไปหน้าออกเอกสาร** (`/sales-planning/spec-documents/new`) ไม่ใช่ขึ้นโมดัลแล้ว POST ออกเลขจากการ์ด
//    (เดิมเลขที่ FM-SA-04 ถูกใช้ตั้งแต่ยังไม่ได้เห็นเนื้อเอกสาร และเลขที่คืนไม่ได้)
// ⚠️ คอมโพเนนต์ import ใต้ raw Node ไม่ได้ (JSX) ⇒ ล็อก "รูปร่างที่ต้องมี" จากซอร์ส · ตรรกะของแถวเทสต์อยู่ที่
//    productSpecDocView.test.mjs (`followUpLineView` ได้ href ของหน้าออกเอกสาร)
// ⚠️ ตัดคอมเมนต์ก่อนตรวจ — คำอธิบายในคอมเมนต์ (ที่พูดถึง POST/โมดัลเดิม) ต้องไม่ทำให้ยามแดง/ผ่านเอง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const source = stripComments(readFileSync(join(HERE, 'SalesOrderFollowUpDocs.js'), 'utf8'));

test('⭐ "ออกเอกสาร" บนการ์ดหน้า SO = การนำทางไปหน้าออกเอกสาร ไม่ใช่ POST ออกเลข', () => {
  // ไม่มี POST ใด ๆ จากการ์ด — ทางเขียนที่เหลือมีแค่ PATCH ยกเลิกเอกสารที่บรรทัดถูกถอด
  assert.doesNotMatch(source, /method: "POST"/, 'การ์ดต้องไม่ยิง POST (ออกเลข) เองอีก');
  assert.doesNotMatch(source, /ConfirmDialog/, 'ไม่มีโมดัลยืนยันก่อนออกเลขบนการ์ดแล้ว');
  assert.doesNotMatch(source, /lineIssuePrompt|setIssuing|issuing/, 'สถานะ/ข้อความของการออกเลขจากการ์ดต้องไม่เหลือ');
  // แถวรู้ใบสั่งขายของตัวเอง ⇒ ประกอบลิงก์ไปหน้าออกเอกสารได้
  assert.match(source, /followUpLineView\(row, \{ orderId \}\)/);
  // ปุ่มยังเป็น GatedAction: ติดด่าน = บอกเหตุตอนกด ไม่พาไป · ผ่านด่าน = พาไป `href`
  const issue = source.slice(source.indexOf('view.action?.kind === "issue"'), source.indexOf(') : view.action?.href ?'));
  assert.match(issue, /<GatedAction/);
  assert.match(issue, /blocker=\{view\.action\.blocker \|\| ""\}/);
  assert.match(issue, /href=\{view\.action\.href \|\| ""\}/);
  assert.doesNotMatch(issue, /onClick=/, 'ปุ่มออกเอกสารต้องไม่มีตัวจัดการที่ทำงานเอง — นำทางผ่าน href เท่านั้น');
});

test('ทางเขียนที่เหลือบนการ์ด = ยกเลิกเอกสารที่บรรทัดถูกถอด (PATCH void ผ่าน ReasonDialog) เท่านั้น', () => {
  const writes = source.match(/method: "(POST|PATCH|PUT|DELETE)"/g) || [];
  assert.deepEqual(writes, ['method: "PATCH"']);
  assert.match(source, /json: \{ action: "void", reason: voidReason\.trim\(\) \}/);
  assert.match(source, /<ReasonDialog/);
});
