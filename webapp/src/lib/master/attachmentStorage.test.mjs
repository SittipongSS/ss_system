import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentUrlError, uploadBucket, DEFAULT_UPLOAD_BUCKET } from './attachmentStorage.js';

const SUPA = 'https://abcdefgh.supabase.co';
const opts = { supabaseUrl: SUPA, bucket: 'ss-customer' };
const ok = (url, o = opts) => assert.equal(attachmentUrlError(url, o), null, `ต้องผ่าน: ${url}`);
const bad = (url, o = opts) => assert.ok(attachmentUrlError(url, o), `ต้องไม่ผ่าน: ${url}`);

// prod มี prefix เดียวคือ https://drive.google.com/file/ (128/128 แถว) + เอกสาร Google
// native ของงานบริหารที่เป็น docs.google.com — สองอันนี้คือของจริงที่ห้ามพลาด
test('ผ่าน: ลิงก์ Drive/Docs ที่ backend คืนมา', () => {
  ok('https://drive.google.com/file/d/1KawvYa4Zkso9j3ikC4Axxfi2KdJ/view?usp=drivesdk');
  ok('https://docs.google.com/spreadsheets/d/abc123/edit');
  ok('https://docs.google.com/document/d/abc123/edit');
});

test('ผ่าน: public URL ของ bucket เราเอง', () => {
  ok(`${SUPA}/storage/v1/object/public/ss-customer/general/1781013054552_map_000_ss.pdf`);
  ok(`${SUPA}/storage/v1/object/public/ss-customer/customer_CUS_1/x.pdf`);
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

test('ไม่ผ่าน: bucket อื่น / path นอก object/public ของเรา', () => {
  // bucket private ห้ามถูกอ้างเป็น public URL (อ่านไม่ได้จริง = ลิงก์ตาย)
  bad(`${SUPA}/storage/v1/object/public/sales-evidence/quotations/x.pdf`);
  bad(`${SUPA}/storage/v1/object/public/signature-assets/users/x.png`);
  // โฮสต์เราแต่ไม่ใช่เส้น storage — กันการชี้ไปที่ REST/auth
  bad(`${SUPA}/rest/v1/attachments`);
  bad(`${SUPA}/storage/v1/object/authenticated/ss-customer/x.pdf`);
  // โฮสต์ Supabase ของโปรเจกต์อื่น
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

// ไม่มี env ของ Supabase (เช่น backend Drive ล้วน) ต้องยังรับลิงก์ Google ได้ตามปกติ
// และต้องไม่เผลอรับ URL อื่นเพราะ opts ว่าง
test('ไม่มี supabaseUrl/bucket: รับแต่ Google — ห้าม fallback เป็นรับหมด', () => {
  ok('https://drive.google.com/file/d/x/view', {});
  bad(`${SUPA}/storage/v1/object/public/ss-customer/x.pdf`, {});
  bad('https://evil.com/x.pdf', {});
});

// 🐞 default เดิมเป็น 'uploads' ซึ่งไม่มี bucket ชื่อนี้อยู่จริงบน prod (404 NoSuchBucket)
// → ที่ไหนไม่ตั้ง env อัปโหลดพัง 500 และ objectPathFromUrl แกะ path ไฟล์เก่าไม่ออก
// (= ลบแถวได้แต่ไฟล์ค้างใน bucket public)
test('ชื่อ bucket: default ต้องเป็น bucket ที่มีอยู่จริง และ env ทับได้', () => {
  assert.equal(DEFAULT_UPLOAD_BUCKET, 'ss-customer');
  assert.notEqual(DEFAULT_UPLOAD_BUCKET, 'uploads', "ค่า default เดิมที่ไม่มี bucket จริงห้ามกลับมา");
  const saved = process.env.SUPABASE_STORAGE_BUCKET;
  try {
    delete process.env.SUPABASE_STORAGE_BUCKET;
    assert.equal(uploadBucket(), 'ss-customer');
    process.env.SUPABASE_STORAGE_BUCKET = 'another-bucket';
    assert.equal(uploadBucket(), 'another-bucket');
  } finally {
    if (saved === undefined) delete process.env.SUPABASE_STORAGE_BUCKET;
    else process.env.SUPABASE_STORAGE_BUCKET = saved;
  }
});
