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
  // ไม่มี POST ใด ๆ จากการ์ด — ทางเขียนที่เหลือมีแค่ปุ่มปลายทางของเอกสารที่บรรทัดถูกถอด (ดูเทสต์ถัดไป)
  assert.doesNotMatch(source, /method: "POST"/, 'การ์ดต้องไม่ยิง POST (ออกเลข) เองอีก');
  /* โมดัลยืนยันบนการ์ดมีได้ตัวเดียว = ลบร่างของใบที่บรรทัดถูกถอด (มติ 23/09) — ไม่ใช่โมดัลออกเลขแบบเดิม */
  const confirms = source.match(/<ConfirmDialog/g) || [];
  assert.ok(confirms.length <= 1, 'โมดัลยืนยันบนการ์ดมีได้ตัวเดียว (ลบร่าง)');
  if (confirms.length) {
    const dialog = source.slice(source.indexOf('<ConfirmDialog'));
    assert.match(dialog.slice(0, dialog.indexOf('/>')), /onConfirm=\{confirmRemove\}/, 'โมดัลยืนยันต้องเป็นของการลบร่างเท่านั้น');
  }
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

test('ทางเขียนที่เหลือบนการ์ด = ปุ่มปลายทางของเอกสารที่บรรทัดถูกถอด (PATCH void · DELETE ลบร่าง) เท่านั้น', () => {
  const writes = source.match(/method: "(POST|PATCH|PUT|DELETE)"/g) || [];
  assert.deepEqual(writes, ['method: "PATCH"', 'method: "DELETE"']);
  assert.match(source, /json: \{ action: "void", reason: voidReason\.trim\(\) \}/);
  assert.match(source, /<ReasonDialog/);
});

/* ── มติเจ้าของ 23/09/2569 "ซ่อนปุ่มยกเลิกช่วงร่าง" บนแถว "บรรทัดถูกถอด" ─────────────────────────────
 * 🔴 การ์ดนี้เป็นจอเดียวที่ใบกำพร้าโผล่ — ถ้ายังวาดแต่ `voidAction` แถวของร่างที่ไม่เคยยื่นจะไม่มีปุ่มอะไรเลย
 *    (API ซ่อน void ของใบแบบนั้นแล้ว) = ทางตัน · ตัดสินใจ: เสนอ "ลบร่าง" ที่นี่ด้วยเส้นเดียวกับหน้าเอกสาร */
test('🔴 แถวบรรทัดถูกถอดวาดทั้ง voidAction และ removeAction จาก API — ไม่มีแถวที่ไม่มีปุ่ม', () => {
  const orphans = source.slice(source.indexOf('orphans.map((orphan)'), source.indexOf('<p className={`form-note'));
  assert.match(orphans, /orphan\.voidAction\?\.visible \?/);
  assert.match(orphans, /orphan\.removeAction\?\.visible \?/);
  // ป้ายเดียวกับหน้าเอกสาร (docControlActions) — ปุ่มลบถาวรต้องบอกความถาวรบนตัวปุ่ม
  assert.match(orphans, /ลบร่างเอกสารถาวร/);
  assert.match(orphans, /blocker=\{orphan\.removeAction\.reason \|\| ""\}/);
});

test('ลบร่างจากการ์ด: DELETE เส้นเดียวกับหน้าเอกสาร · ไม่ลองซ้ำ · ข้อความโมดัลชุดเดียวกับหน้าเอกสาร (orphan)', () => {
  const body = source.slice(source.indexOf('const removeDone'), source.indexOf('if (!loaded) return null;'));
  assert.match(body, /apiJson\(`\/api\/sales-planning\/spec-documents\/\$\{target\.documentId\}`/);
  assert.match(body, /method: "DELETE"/);
  assert.doesNotMatch(body, /retry: true/, 'DELETE ห้ามลองใหม่เอง — รอบสองได้ 404 ทั้งที่ลบสำเร็จ');
  assert.match(body, /docActionDoneMessage\(DOC_DELETE_KEY, \{ orphan: true \}\)/);
  // ล้ม ⇒ ตัดสินจากการ์ดชุดใหม่ด้วยตัวคิดกลาง (ตรรกะเทสต์อยู่ที่ productSpecDocView.test.mjs)
  assert.match(body, /const next = await load\(\{ background: true \}\)/);
  assert.match(body, /orphanRemoveFailureOutcome\(\{ failure: removeFailure, next, documentId: target\.documentId \}\)/);
  // 🐞 UAT 23/09: ลบสำเร็จแต่คำตอบหาย ⇒ นับว่าสำเร็จ ไม่ใช่ "เชื่อมต่อไม่ได้ ลองอีกครั้ง" ทั้งที่แถวหายไปแล้ว
  assert.match(body, /outcome === "done"\) \{\s*removeDone\(\);\s*onChanged\?\.\(\);\s*return;/);
  // ใบชุดใหม่ลบไม่ได้แล้ว = ปิดโมดัล ย้ายเหตุขึ้นแถบของการ์ด (ท่าเดียวกับ removeDraft ของหน้าเอกสาร)
  assert.match(body, /outcome === "moved"\) \{\s*setRemoving\(null\);\s*setWarning\(removeFailure\.message/);
  assert.match(body, /throw removeFailure/);
  // ก้อนโมดัลประกอบจากแถวด้วย `orphanDocPromptInput` (ตั้ง `orphan: true` เสมอ — เทสต์ที่ productSpecDocView.test.mjs)
  assert.match(source, /docConfirmPrompt\(DOC_DELETE_KEY, orphanDocPromptInput\(removing\)\)/);
  // ตัวโหลดต้องคืนคำตอบชุดใหม่ ไม่งั้นทางล้มอ่านได้แค่ undefined
  const loader = source.slice(source.indexOf('const load = useCallback'), source.indexOf('useEffect(() => { load(); }'));
  assert.match(loader, /return next;/);
  assert.match(loader, /return null;/);
});

/* ── ผลตรวจ 25/09 ของงานมติ 24/09 ("ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ") ───────────────────────
 * 🐞 ผู้อนุมัติเห็นปุ่ม "ยกเลิกเอกสาร" บนแถวบรรทัดถูกถอดของใบที่อนุมัติแล้ว แต่การ์ดประกอบก้อนโมดัลเองแค่ `{ docNo }`
 *    ⇒ โมดัลไม่บอกว่าฉบับที่อนุมัติแล้วใช้ไม่ได้อีก · toast `ยกเลิก X แล้ว` ไม่บอกว่าแจ้งเตือนใคร
 *    — การกระทำเดียวกับหน้าเอกสาร แต่คำบอกผลอ่อนกว่า ⇒ ใช้ตัวประกอบกลางชุดเดียวกับหน้าเอกสาร */
test('🐞 โมดัล/toast ยกเลิกบนการ์ดใช้ตัวประกอบกลาง — พูดเท่าหน้าเอกสาร (ฉบับที่อนุมัติ · แจ้งเตือนใคร)', () => {
  assert.match(source, /docReasonPrompt\("void", orphanDocPromptInput\(voiding\)\)/,
    'ก้อนโมดัลยกเลิกต้องมาจากแถวทั้งแถว (มี currentRevNo) ไม่ใช่ประกอบเองแค่ docNo');
  assert.doesNotMatch(source, /document: \{ docNo: (voiding|removing)\.docNo \}/, 'ห้ามประกอบก้อนเอกสารเองบนการ์ด');
  const confirm = source.slice(source.indexOf('const confirmVoid'), source.indexOf('const removeDone'));
  assert.match(confirm, /notifyToast\.success\(docActionDoneMessage\("void", \{ docNoText: voiding\.docNoText \|\| voiding\.docNo \}\)\)/,
    'toast ยกเลิกต้องเป็นข้อความกลาง (บอกว่าแจ้งเตือนใคร)');
  assert.doesNotMatch(confirm, /notifyToast\.success\(`/, 'ห้ามเขียน toast ยกเลิกเองบนการ์ด');
});
