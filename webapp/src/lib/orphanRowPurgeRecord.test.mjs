// ── ปุ่มลบถาวรต้องโชว์ก่อน และต้องเหลือบันทึกไว้ ──────────────────────────
//
// `purgeOrphanAttachmentRows` ลบแถวด้วย `.delete()` ตรง ๆ — **ไม่มี soft delete
// ไม่มี undo** · แถวกำพร้าคือหลักฐานชิ้นเดียวที่ผูกไฟล์บน Drive เข้ากับระเบียนที่ถูก
// ลบไปแล้ว (ไฟล์ยังอยู่ต่อโดยตั้งใจ) ⇒ ลบแถวโดยไม่บันทึกตัวตน = ไฟล์นั้นกลายเป็นของ
// ไม่มีที่มาในหัวข้อ "ของบน Drive ที่ไม่มีใครอ้างถึง" ตลอดกาล
//
// 🐞 ก่อน 2026-08-26: หน้าจอโชว์แค่ **จำนวนกับชนิด** ทั้งที่ API ส่ง `rows` มาให้แล้ว
// สูงสุด 200 แถว · และ audit เก็บแค่ `{ deleted, byType, unknownTypes, withDriveFile }`
// ⇒ กดปุ่มโดยไม่เห็นว่าลบอะไร แล้วตามกลับไม่ได้ด้วย
//
// เทียบกับปุ่ม "ทิ้งไฟล์กำพร้า" ที่อยู่ในหน้าเดียวกัน: โชว์รายการ · ส่ง id ที่คนเห็น ·
// server คำนวณซ้ำก่อนทิ้ง · ทิ้งลงถังขยะกู้ได้ 30 วัน — ปุ่มนี้เคยทำตรงข้ามทุกข้อ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lib = readFileSync(fileURLToPath(new URL('./driveMaintenance.js', import.meta.url)), 'utf8');
const page = readFileSync(
  fileURLToPath(new URL('../app/settings/storage/page.js', import.meta.url)),
  'utf8',
);

test('⭐ ตัวลบต้องคืนตัวตนของแถวที่ลบ ไม่ใช่แค่จำนวน', () => {
  const fn = lib.slice(lib.indexOf('export async function purgeOrphanAttachmentRows'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /orphans\.slice\(/, 'ต้องเก็บรายการแถวที่กำลังจะลบไว้ก่อน');
  assert.match(body, /^\s*rows,\s*$/m, 'ต้องคืน rows ออกไปให้ผู้เรียกเอาไปลง audit');
  for (const field of ['entityType', 'entityId', 'fileName', 'driveFileId']) {
    assert.match(body, new RegExp(`\\b${field}\\b`), `rows ต้องมี ${field} — ไม่งั้นตามกลับไม่ได้ว่าไฟล์เคยเป็นของใบไหน`);
  }
});

test('ไม่มีแถวให้ลบ ก็ยังต้องคืน rows เป็นอาร์เรย์ — ผู้เรียกจะได้ไม่ต้องเช็ค undefined', () => {
  const fn = lib.slice(lib.indexOf('export async function purgeOrphanAttachmentRows'));
  assert.match(fn.slice(0, 400), /return \{ deleted: 0[\s\S]{0,80}rows: \[\] \}/);
});

test('⭐ หน้าจอต้องเรนเดอร์รายการก่อนปุ่มลบ', () => {
  assert.match(page, /orphanRows\.rows\?\.length/, 'ต้องเช็คว่ามีรายการก่อนเรนเดอร์');
  assert.match(page, /orphanRows\.rows\.map/, 'ต้องเรนเดอร์รายการจริง ไม่ใช่แค่ตัวเลข');
  assert.match(
    page,
    /\{r\.entityType\} · \{r\.entityId\}/,
    'ต้องบอกว่าแถวนั้นเคยเป็นของระเบียนไหน — ชื่อไฟล์อย่างเดียวไม่พอ',
  );
});

test('รายการที่โชว์ต้องมาก่อนปุ่มในลำดับของไฟล์ — คนเห็นก่อนกด', () => {
  const list = page.indexOf('orphanRows.rows.map');
  const notice = page.indexOf('ลบแถวไม่กระทบไฟล์บน Drive');
  assert.ok(list > 0 && notice > 0);
  assert.ok(list < notice, 'รายการต้องอยู่เหนือคำเตือน/ปุ่ม ไม่ใช่ใต้');
});
