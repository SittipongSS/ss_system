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
import {
  uploadUpdateFiles, postUpdateWithFiles, forgetUploadRefs, FILE_REF_ERROR_CODE,
} from './updatePost.js';

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

// ── server ตีกลับตัว ref (ด่านใบรับของ POST /api/updates) ─────────────────────
//
// ⭐ ข้อยกเว้นเดียวของกติกาข้างบน: 400 + `code: 'file_ref'` = ref ที่จำไว้ใช้ไม่ได้แล้ว
// ส่งซ้ำกี่รอบก็โดนตีกลับ ⇒ ต้องลืม ref แล้วอัปใหม่ · ล้มแบบอื่นทุกแบบ ref ต้องอยู่ครบ

const pendingWithRefs = () => [
  { file: { name: 'a.jpg', type: 'image/jpeg', size: 1234 }, url: 'blob:a', ref: refOf('a.jpg') },
  { file: { name: 'b.jpg', type: 'image/jpeg', size: 1234 }, url: 'blob:b', ref: refOf('b.jpg') },
];

// ส่งหนึ่งรอบโดยสวม `fetch` ปลอม (ทุกใบพก ref ⇒ ชั้นอัปไม่ถูกแตะ มีแต่ POST /api/updates)
// แล้วทำสิ่งที่ `UpdateThread.post()` ทำกับ error — คืนรายการไฟล์ค้างหลังรอบนั้น
async function failedRound(fakeFetch) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return fakeFetch(); };
  let pending = pendingWithRefs();
  let error;
  try {
    await postUpdateWithFiles({
      entityType: 'deal', entityId: 'x', body: 'hi',
      files: pending.map((p) => ({ file: p.file, ref: p.ref })),
    });
  } catch (e) {
    error = e;
    if (e.refRejected) pending = forgetUploadRefs(pending);
  } finally { globalThis.fetch = realFetch; }
  return { error, pending, calls };
}

const jsonRes = (status, body) => new Response(JSON.stringify(body), { status });

test('400 + code file_ref ⇒ ติดธง refRejected และ ref ที่จำไว้ถูกลืม — ไฟล์ยังอยู่', async () => {
  const { error, pending, calls } = await failedRound(
    () => jsonRes(400, { error: 'ไฟล์แนบใช้ไม่ได้', code: 'file_ref' }),
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/updates');
  assert.equal(error.message, 'ไฟล์แนบใช้ไม่ได้');
  assert.equal(error.refRejected, true);
  assert.deepEqual(pending.map((p) => p.ref), [undefined, undefined]);
  assert.deepEqual(pending.map((p) => [p.file.name, p.url]), [['a.jpg', 'blob:a'], ['b.jpg', 'blob:b']]);
});

test('503 ของด่านเดียวกัน (ตรวจใบรับไม่ได้ · ไม่มี code) ⇒ ref อยู่ครบ กดใหม่ไม่อัปซ้ำ', async () => {
  const { error, pending } = await failedRound(() => jsonRes(503, { error: 'ตรวจไฟล์ไม่ได้ชั่วคราว' }));
  assert.equal(error.message, 'ตรวจไฟล์ไม่ได้ชั่วคราว');
  assert.equal(error.refRejected, false);
  assert.deepEqual(pending.map((p) => p.ref), [refOf('a.jpg'), refOf('b.jpg')]);
});

test('ธงขึ้นเฉพาะ 400 + code ตรงตัว — 400 อื่น และ code ที่มากับสถานะอื่น ไม่ทิ้ง ref', async () => {
  const plain = await failedRound(() => jsonRes(400, { error: 'ข้อความยาวเกิน' }));
  assert.equal(plain.error.refRejected, false);
  assert.deepEqual(plain.pending.map((p) => p.ref), [refOf('a.jpg'), refOf('b.jpg')]);
  const other = await failedRound(() => jsonRes(503, { error: 'x', code: 'file_ref' }));
  assert.equal(other.error.refRejected, false);
  const forbidden = await failedRound(() => jsonRes(403, { error: 'ไม่มีสิทธิ์', code: 'other' }));
  assert.equal(forbidden.error.refRejected, false);
});

test('ต่อไม่ติด (fetch โยน) ⇒ ไม่ติดธง · ref อยู่ครบ — กติกาห้ามอัปซ้ำยังใช้เต็ม', async () => {
  const { error, pending, calls } = await failedRound(() => { throw new TypeError('Failed to fetch'); });
  assert.equal(calls.length, 1); // POST ไม่ถูกลองใหม่ให้เอง
  assert.match(error.message, /^ส่งข้อความไม่สำเร็จ — /);
  assert.ok(!error.refRejected);
  assert.deepEqual(pending.map((p) => p.ref), [refOf('a.jpg'), refOf('b.jpg')]);
});

test('รหัส file_ref ฝั่งเบราว์เซอร์ตรงกับค่าคงที่ของด่านฝั่ง server', () => {
  const gate = read('../upload/driveRefGate.js');
  const m = gate.match(/export const FILE_REF_ERROR_CODE = '([^']+)'/);
  assert.ok(m, 'หา FILE_REF_ERROR_CODE ใน driveRefGate.js ไม่เจอ');
  assert.equal(FILE_REF_ERROR_CODE, m[1]);
});

test('เธรดอัปเดตลืม ref เฉพาะเมื่อ error ติดธง refRejected — และยังโชว์ข้อความของ server', () => {
  const src = read('../../components/updates/UpdateThread.js');
  const post = src.slice(src.indexOf('const post = async'), src.indexOf('const mutate = async'));
  const tail = post.slice(post.indexOf('} catch (e) {'));
  assert.match(tail, /if \(e\.refRejected\) setPending\(forgetUploadRefs\);/);
  assert.match(tail, /setErr\(e\.message\)/);
  // ข้อความที่พิมพ์ไว้ต้องไม่ถูกล้างในทางล้ม และ setPending ต้องไม่ถูกเรียกแบบไม่มีเงื่อนไข
  assert.doesNotMatch(tail, /setText\(/);
  assert.equal((tail.match(/setPending\(/g) || []).length, 1);
});
