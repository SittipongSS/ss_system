import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentUrlError } from './attachmentStorage.js';

const SUPA = 'https://abcdefgh.supabase.co';
const ok = (url) => assert.equal(attachmentUrlError(url), null, `ต้องผ่าน: ${url}`);
const bad = (url) => assert.ok(attachmentUrlError(url), `ต้องไม่ผ่าน: ${url}`);

// prod มี prefix เดียวคือ https://drive.google.com/file/ (128/128 แถว) + เอกสาร Google
// native ของงานบริหารที่เป็น docs.google.com — สองอันนี้คือของจริงที่ห้ามพลาด
test('ผ่าน: ลิงก์ Drive/Docs ที่ backend คืนมา', () => {
  ok('https://drive.google.com/file/d/1KawvYa4Zkso9j3ikC4Axxfi2KdJ/view?usp=drivesdk');
  ok('https://docs.google.com/spreadsheets/d/abc123/edit');
  ok('https://docs.google.com/document/d/abc123/edit');
});

// 🐞 รูที่ปิด: client ส่ง fileUrl อะไรมาก็ได้ แล้วตั้ง driveFileId เป็น null
// → แถวนั้นถูก render เป็น <a href> ดิบ ๆ และ proxy ดาวน์โหลดกลายเป็น open redirect
test('ไม่ผ่าน: โดเมนภายนอก — ต้นตอของ open redirect', () => {
  bad('https://evil.com/malware.pdf');
  bad('https://drive.google.com.evil.com/file/d/x');      // โดเมนหลอกที่ขึ้นต้นเหมือน
  bad('https://evil.com/?x=https://drive.google.com/file'); // ของจริงอยู่ใน query
  bad('http://drive.google.com/file/d/x');                  // Google ต้องเป็น https
});

test('ไม่ผ่าน: สคีมที่เป็น XSS ตอน render เป็น href', () => {
  bad('javascript:alert(document.cookie)');
  bad('JavaScript:alert(1)');
  bad('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==');
  bad('blob:https://evil.com/1234');
  bad('vbscript:msgbox(1)');
});

// ที่เก็บเหลือ Google Drive ที่เดียว (2026-07-30) — URL ของ Supabase Storage ทุกแบบ
// ต้องไม่ผ่านอีกต่อไป รวมถึง bucket public เก่าที่เคยรับได้
test('ไม่ผ่าน: Supabase Storage ทุกแบบ — ตัดทางนี้ทิ้งแล้ว', () => {
  bad(`${SUPA}/storage/v1/object/public/ss-customer/general/1781013054552_map_000_ss.pdf`);
  bad(`${SUPA}/storage/v1/object/public/sales-evidence/quotations/x.pdf`);
  bad(`${SUPA}/storage/v1/object/authenticated/ss-customer/x.pdf`);
  bad(`${SUPA}/rest/v1/attachments`);
  bad('https://someoneelse.supabase.co/storage/v1/object/public/ss-customer/x.pdf');
});

test('ไม่ผ่าน: ค่าว่าง / path เปล่า / protocol-relative', () => {
  bad('');
  bad(null);
  bad(undefined);
  bad('   ');
  bad('/storage/v1/object/public/ss-customer/x.pdf'); // relative — parse ไม่ได้
  bad('//evil.com/x.pdf');                            // protocol-relative
  bad('ไม่ใช่ url');
});
