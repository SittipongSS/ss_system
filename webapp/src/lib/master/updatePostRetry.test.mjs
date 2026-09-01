// ── กดส่งอัปเดตใหม่หลังล้ม ต้องไม่อัปไฟล์เดิมซ้ำ ──────────────────────────
//
// 🐞 ที่มา (01/09/69): ผู้ใช้กด "ส่งอัปเดต" พร้อมรูปสองใบแล้วได้ "เชื่อมต่อเซิร์ฟเวอร์
// ไม่ได้" · ช่องพิมพ์ค้างข้อความ+ไฟล์ไว้ให้โดยตั้งใจ (ที่พิมพ์ไว้ต้องไม่หาย) แต่การกด
// ส่งรอบสองเดิม **อัปไฟล์ใหม่ทุกใบ** แม้รอบแรกไบต์ขึ้น Drive สำเร็จไปแล้วและไปล้มตอน
// ส่งข้อความ ⇒ ไฟล์รอบแรกกลายเป็นไฟล์กำพร้าบน Drive (ไม่มีแถวไหนชี้ถึง) และจ่าย
// egress ซ้ำทุกครั้งที่กด — ซึ่งเป็นโควตาที่ระบบนี้ตึงอยู่แล้ว
//
// ⭐ กติกา: `uploadUpdateFiles` รับ `{ file, ref }` · ใบที่พก `ref` มาแล้ว = อัปเสร็จแล้ว
// ต้องถูก **ข้าม** ไม่ใช่อัปทับ · และผู้เรียกต้องเก็บ ref ผ่าน `onUploaded` ไว้ให้รอบถัดไป
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { uploadUpdateFiles } from './updatePost.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const refOf = (name) => ({
  fileUrl: `https://drive/${name}`, driveFileId: `drive-${name}`,
  fileName: name, mimeType: 'image/jpeg', sizeBytes: 1234,
});

test('ใบที่พก ref มาแล้ว ไม่ถูกอัปซ้ำ — คืน ref เดิมครบตามลำดับ', async () => {
  // ไม่มี stub ของ `uploadFileBytes` ที่นี่โดยตั้งใจ: ถ้าโค้ดหลุดไปเรียกอัปจริง
  // เทสต์จะพังเพราะไม่มี `fetch` ปลายทาง ซึ่งคือสิ่งที่อยากจับพอดี
  const files = [
    { file: { name: 'a.jpg', type: 'image/jpeg', size: 1234 }, ref: refOf('a.jpg') },
    { file: { name: 'b.jpg', type: 'image/jpeg', size: 1234 }, ref: refOf('b.jpg') },
  ];
  const out = await uploadUpdateFiles({ entityType: 'deal', entityId: 'x', files });
  assert.deepEqual(out, [refOf('a.jpg'), refOf('b.jpg')]);
});

test('ไม่มีไฟล์ = ไม่แตะชั้นอัปเลย', async () => {
  assert.deepEqual(await uploadUpdateFiles({ entityType: 'deal', entityId: 'x', files: [] }), []);
});

test('รับ File ตรง ๆ ได้เหมือนเดิม — ผู้เรียกเก่า (โมดัลรับลีด) ต้องไม่พัง', () => {
  const src = read('./updatePost.js');
  // `item?.file || item` คือบรรทัดที่ทำให้ทั้งสองทรงอยู่ร่วมกันได้ — หายเมื่อไรหน้าลีดพัง
  assert.match(src, /item\?\.file \|\| item/);
  const leads = read('../../app/sales-planning/leads/page.js');
  assert.match(leads, /files: pendingFiles/);
});

test('เธรดอัปเดตส่ง ref กลับเข้าไป และเก็บ ref ที่อัปเสร็จผ่าน onUploaded', () => {
  const src = read('../../components/updates/UpdateThread.js');
  // ส่ง `{ file, ref }` ไม่ใช่ File เปล่า — ส่ง File เปล่าเมื่อไรคือกลับไปอัปซ้ำทุกครั้ง
  assert.match(src, /files: pending\.map\(\(p\) => \(\{ file: p\.file, ref: p\.ref \}\)\)/);
  // และต้องเขียน ref กลับลง pending ไม่งั้นรอบถัดไปไม่มีอะไรให้ข้าม
  assert.match(src, /onUploaded:/);
  assert.match(src, /ref: attachment/);
});

test('ขอ signed URL เป็น POST ที่ลองใหม่ได้ — ขานี้ไม่เขียนอะไรลงระบบ', () => {
  const src = read('./uploadFile.js');
  const session = src.slice(src.indexOf("apiFetch('/api/upload/session'"));
  assert.match(session.slice(0, 400), /retry: true/);
  // ⚠️ commit ห้ามลองใหม่ — มันย้ายไฟล์เข้า Drive แล้วลบที่พัก ยิงซ้ำ = ไฟล์ซ้ำ/ที่พักหาย
  const commit = src.slice(src.indexOf("apiFetch('/api/upload/commit'"));
  assert.doesNotMatch(commit.slice(0, 400), /retry: true/);
});
