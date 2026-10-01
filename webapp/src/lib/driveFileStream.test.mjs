// ── `getFileStream(driveFileId, { signal })` — ตัวเลือก signal ของตัวดึงไฟล์จาก Drive (PR-2 §5) ─────────────
//
// ทำไมต้องมี: ตัวเตรียมรูปของรายงานประเมินพื้นที่ดึงไฟล์ทีละหลายสิบรูปในคำขอเดียว — Drive ค้างรูปเดียวโดยไม่มีเพดานเวลา
//   = ทั้งคำขอค้างจน Vercel ตัดที่ 300 วินาที ⇒ ต้องตัดได้ทั้ง "รอหัวคำตอบ" และ "เนื้อไฟล์หยุดไหลกลางทาง"
//
// ⭐ สองอย่างที่ล็อก:
//   1. ผู้เรียกเดิม (proxy ดาวน์โหลด · ZIP · ใบจดทะเบียนสรรพสามิต) ที่ไม่ส่ง signal ได้คำขอหน้าตาเดิมทุกตัวอักษร
//   2. signal ที่ส่งมา **ถึงมือ googleapis จริงและตัดได้จริง** — ไม่ใช่แค่ถูกส่งต่อเป็นคีย์ที่ไม่มีใครอ่าน
//
// ⚠️ ไม่มีคำขอออกนอกเครื่อง: client ของ `lib/drive.js` ถูกสลับปลายทางไปที่ server บน 127.0.0.1 (ไม่มีการขอ token)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { google } from 'googleapis';

// env ปลอมพอให้ `getDrive()` สร้าง client ได้ — ต้องตั้งก่อน import
process.env.GOOGLE_WIF_AUDIENCE ||= '//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/v';
process.env.GOOGLE_SA_EMAIL ||= 'test@example.iam.gserviceaccount.com';
const { getDrive, getFileStream } = await import('./drive.js');

const realGet = getDrive().files.get;

test('ไม่ส่ง signal = คำขอเดิมทุกอย่าง · ส่งมา = ติดไปในตัวเลือกของคำขอ · คืน res.data', async (t) => {
  const calls = [];
  getDrive().files.get = async (params, options) => { calls.push({ params, options }); return { data: `stream:${params.fileId}` }; };
  t.after(() => { getDrive().files.get = realGet; });

  const signal = AbortSignal.timeout(60_000);
  assert.equal(await getFileStream('f1'), 'stream:f1');
  assert.equal(await getFileStream('f2', { signal }), 'stream:f2');
  assert.equal(await getFileStream('f3', {}), 'stream:f3');
  assert.equal(await getFileStream('f4', { signal: null }), 'stream:f4');

  const params = (fileId) => ({ fileId, alt: 'media', supportsAllDrives: true });
  assert.deepEqual(calls.map((c) => c.params), ['f1', 'f2', 'f3', 'f4'].map(params));
  assert.deepEqual(calls[0].options, { responseType: 'stream' }, 'ผู้เรียกเดิมต้องไม่ได้คีย์ signal เพิ่ม');
  assert.deepEqual(Object.keys(calls[1].options).sort(), ['responseType', 'signal']);
  assert.equal(calls[1].options.signal, signal, 'ต้องเป็น signal ตัวเดียวกับที่ผู้เรียกถือ');
  assert.deepEqual(calls[2].options, { responseType: 'stream' });
  assert.deepEqual(calls[3].options, { responseType: 'stream' });
});

test('googleapis ตัวจริง: signal ตัดได้ทั้งตอนรอหัวคำตอบและตอนเนื้อไฟล์หยุดไหล · ไม่ส่ง signal ไฟล์มาครบ', async (t) => {
  const body = Buffer.alloc(200_000, 9);
  const server = http.createServer((req, res) => {
    if (req.url.includes('/stall-head')) return; // ไม่ตอบ
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    if (req.url.includes('/stall-body')) { res.write(body.subarray(0, 1000)); return; } // ส่งนิดเดียวแล้วเงียบ
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const rootUrl = `http://127.0.0.1:${server.address().port}/`;
  const local = google.drive({ version: 'v3' });
  getDrive().files.get = (params, options) => local.files.get(params, { ...options, rootUrl });
  t.after(() => { getDrive().files.get = realGet; server.closeAllConnections(); server.close(); });

  const read = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  };

  // ไฟล์ดี — ทั้งแบบเดิมและแบบมี signal
  assert.ok((await read(await getFileStream('ok'))).equals(body));
  assert.ok((await read(await getFileStream('ok', { signal: AbortSignal.timeout(10_000) }))).equals(body));

  // ไม่ตอบหัว: คำขอต้องล้มเมื่อ signal ถูกตัด ไม่ค้างไปเรื่อย ๆ
  let started = Date.now();
  const head = AbortSignal.timeout(250);
  await assert.rejects(() => getFileStream('stall-head', { signal: head }));
  assert.ok(head.aborted);
  assert.ok(Date.now() - started < 5000, 'ต้องจบใกล้ ๆ เพดานที่ตั้ง');

  // หัวมาแล้ว เนื้อค้าง: stream ต้อง error เมื่อ signal ถูกตัด
  started = Date.now();
  const mid = AbortSignal.timeout(250);
  const stream = await getFileStream('stall-body', { signal: mid });
  await assert.rejects(() => read(stream));
  assert.ok(mid.aborted);
  assert.ok(Date.now() - started < 5000);
});
