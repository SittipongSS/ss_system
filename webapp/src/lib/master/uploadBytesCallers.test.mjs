// ── ใครเรียก `uploadFileBytes` ตรง ๆ ได้บ้าง ──────────────────────────────
//
// 🐞 ที่มา (PR #1394): การแนบไฟล์มีสองขั้น — ไบต์ขึ้น Drive แล้ว **บันทึกแถวใน
// `attachments`** · ขั้นสองคือขั้นที่ทำให้ไฟล์ "มีอยู่" ในสายตาระบบ
// ฟอร์มสร้างงานเรียก `uploadFileBytes` (ขั้นเดียว) แล้วทิ้ง ref ที่คืนมา ⇒ ไบต์ขึ้น
// Drive จริงแต่ไม่มีแถว ⇒ แผงไฟล์แนบว่างเปล่าโดยไม่มี error สักตัว ผู้ใช้เห็นว่า
// "แนบแล้วไฟล์หาย" · ไม่มีใครรู้ตั้งแต่ 17/07 ถึง 24/08/69 เพราะทางแนบอื่นของ
// หน้าเดียวกันใช้ `uploadAttachment` ซึ่งถูกอยู่แล้ว ⇒ ส่วนใหญ่แนบแล้วขึ้นปกติ
//
// ⭐ กติกา: ไฟล์แนบปกติใช้ `uploadAttachment()` · เรียกตัวขั้นเดียวได้เฉพาะเมื่อ
// **เอา ref ไปเขียนลงคอลัมน์ของตัวเอง** ซึ่งต้องเขียนไว้ตรงนี้ว่าเขียนลงที่ไหน
//
// ⚠️ เทสต์นี้ไม่ได้ตรวจว่าโค้ดใช้ ref จริงไหม (ตรวจแบบนั้นด้วยการอ่านข้อความไม่ไหว)
// — มันบังคับให้ **ผู้เรียกรายใหม่ต้องหยุดคิดและเขียนเหตุผล** ซึ่งเป็นจังหวะเดียวกับ
// ที่คนเขียนจะเห็นว่าตัวเองตอบไม่ได้ · ถ้ากติกานี้มีอยู่ตอน #1301 บั๊กนั้นไม่เกิด
// (TaskFormModal กลายเป็นผู้เรียกรายใหม่พอดีในคอมมิตนั้น)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

/** ผู้เรียกที่อนุญาต → เอา ref ไปไว้ไหน (path นับจาก `src/`) */
const ALLOWED_CALLERS = {
  'lib/master/attachmentUpload.js':
    'ตัวกลางของไฟล์แนบเอง — ทำขั้นสองต่อให้ทันที (นี่คือทางที่ทุกที่ควรใช้)',
  'lib/master/updatePost.js':
    'ไฟล์ในเธรดอัปเดต — ref ลง `entity_updates.attachments[]` ไม่ใช่ตาราง attachments',
  'app/sales-planning/sales-orders/[id]/page.js':
    'หลักฐานยืนยันคำสั่งซื้อ — ref ลง `quotations.wonAttachments[]`',
  'app/sales-planning/sales-orders/new/page.js':
    'หลักฐานยืนยันคำสั่งซื้อตอนสร้างใบ — ปลายทางเดียวกับหน้ารายละเอียด',
  'components/excise/FileTaxDialog.js':
    'ใบเสร็จยื่นภาษี — ref ลงคอลัมน์ `receiptUrl` ของใบยื่น',
  'components/excise/ReceiveDialog.js':
    'ไฟล์ตอนรับแสตมป์ — ยิง POST /api/master/attachments เองในบรรทัดถัดไป',
  'components/service/CloseVisitSheet.js':
    'รูปหน้างาน/ลายเซ็นผู้รับงาน — ref ลงคอลัมน์ของ `service_visits`',
  'components/issues/ReportIssueModal.js':
    'ไฟล์แนบเรื่องแจ้งปัญหา — ลงเธรด /api/updates ตั้งใจไม่ผ่านตาราง attachments',
};

/* ⚠️ จับ **การ import** ไม่ใช่การเอ่ยชื่อ — ไฟล์ที่เขียนคอมเมนต์เตือนว่า "อย่าเรียก
   ตัวนี้" ไม่ใช่ผู้เรียก (TaskFormModal มีคอมเมนต์แบบนั้นอยู่หลัง #1394) */
const IMPORTS_BYTES = /import\s*\{[^}]*\buploadFileBytes\b[^}]*\}\s*from\s*['"]@\/lib\/master\/uploadFile['"]/;

function jsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { jsFiles(full, out); continue; }
    if (/\.js$/.test(entry)) out.push(full);
  }
  return out;
}

const callers = jsFiles(SRC)
  .filter((f) => !f.endsWith(path.join('lib', 'master', 'uploadFile.js')))
  .filter((f) => IMPORTS_BYTES.test(readFileSync(f, 'utf8')))
  .map((f) => path.relative(SRC, f))
  .sort();

test('⭐ ผู้เรียก uploadFileBytes ทุกรายต้องบอกได้ว่าเอา ref ไปเก็บไว้ไหน', () => {
  const undeclared = callers.filter((f) => !ALLOWED_CALLERS[f]);
  assert.deepEqual(
    undeclared,
    [],
    `ผู้เรียกที่ยังไม่ได้ประกาศ: ${undeclared.join(', ')}\n`
    + 'ไฟล์แนบปกติให้ใช้ uploadAttachment() แทน — ถ้าจำเป็นต้องเรียกตัวขั้นเดียวจริง '
    + 'ให้เพิ่มลง ALLOWED_CALLERS พร้อมบอกว่า ref ถูกเขียนลงคอลัมน์ไหน',
  );
});

test('ทะเบียนต้องไม่มีของตายค้าง — ทุกรายการต้องชี้ไฟล์ที่ยังเรียกอยู่จริง', () => {
  const stale = Object.keys(ALLOWED_CALLERS).filter((f) => !callers.includes(f));
  assert.deepEqual(stale, [], `ทะเบียนอ้างไฟล์ที่เลิกเรียกแล้ว: ${stale.join(', ')}`);
});

test('ตัวกลางที่ทำครบสองขั้นต้องยังอยู่ และยังบันทึกแถว metadata ต่อให้', () => {
  const helper = readFileSync(path.join(SRC, 'lib/master/attachmentUpload.js'), 'utf8');
  assert.match(helper, /uploadFileBytes\(/, 'ขั้นแรกต้องยังยิงผ่านทางกลาง');
  assert.match(helper, /fetch\('\/api\/master\/attachments'/, 'ขั้นสองคือขั้นที่ทำให้ไฟล์มีอยู่จริง');
  assert.match(
    helper,
    /if \(!res\.ok\)[\s\S]{0,200}method: 'DELETE'/,
    'ขั้นสองล้มต้องลบไฟล์ที่เพิ่งอัปทิ้ง ไม่งั้นเหลือไฟล์กำพร้าบน Drive',
  );
});
