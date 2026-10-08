// ── ยามของตัวเตรียมรูปรายงานประเมินพื้นที่ (PR-2 §5 · ข้อ 19 · ข้อ 25) — **sharp ตัวจริง** กับรูปที่สร้างในเทสต์ ─────
//
// ⭐ สี่ชั้นที่ต้องล็อก:
//   1. ผลของการย่อ — หมุนตาม EXIF แล้ว w/h สลับ · ด้านยาวไม่เกิน 1000/1600 · PNG โปร่งใสได้พื้นขาว · TIFF ถอดได้ ·
//      ไบต์เดียวกัน = sha เดียวกัน
//   2. ชนิดของความล้มเหลว — ไฟล์เสีย/หาย = `permanent` (รอบตรวจก่อนส่งผลปฏิเสธ) · Drive ช้า/ล่ม · หมดเวลา · sharp
//      โหลดไม่ได้ = ไม่ถาวร (ไม่ปฏิเสธ) · ผิดชนิด = ส่งผลไม่ได้ทั้งที่ระบบล่มเอง หรือออกเอกสารที่รูปหาย
//   3. ที่เก็บ — อัปเฉพาะเมื่อด่านเขียนถาวรเปิด · "มีอยู่แล้ว" = สำเร็จ · **ที่เก็บกับ Drive ในไฟล์นี้เป็นตัวปลอมทั้งหมด**
//      (Drive ตัวจริงของ `lib/drive.js` ถูกชี้ไปที่ server บนเครื่อง 127.0.0.1 — ไม่มีคำขอออกนอกเครื่อง)
//   4. น้ำหนัก — import ไฟล์นี้ต้องไม่โหลด sharp/googleapis (ข้อ 24) · `sharp` ล็อกรุ่น 0.34.5 ตรงตัว (ข้อ 19)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { MAX_UPLOAD_BYTES } from '../master/attachmentTypes.js';
import { MAX_BYTES } from '../upload/limits.js';
import { surveySendImageRefusal } from './surveySendClose.js';
import {
  SURVEY_IMAGE_EDGE,
  SURVEY_IMAGE_FAILURE,
  SURVEY_IMAGE_FILE_TIMEOUT_MS,
  SURVEY_IMAGE_PLAN_EDGE,
  SURVEY_IMAGE_PROBE_TIMEOUT_MS,
  downscaleSurveyImage,
  prepareSurveyReportImages,
  surveyReportImagePath,
} from './surveyReportImages.js';

const WEBAPP = process.cwd();
const F = SURVEY_IMAGE_FAILURE;
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/* ── รูปทดสอบ (สร้างด้วย sharp ตัวจริง) ───────────────────────────────── */

const flat = (width, height, background, channels = 3) => sharp({ create: { width, height, channels, background } });

/** JPEG ลายสุ่มที่นิ่ง — ไฟล์ใหญ่พอให้ "ตัดท้าย" เป็นการตัดกลางข้อมูลภาพจริง ไม่ใช่ตัดแค่ตัวปิดไฟล์ */
async function noiseJpeg(width, height) {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = Math.imul(i, 2654435761) >>> 24;
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

/** รูปนอน 40×20 ครึ่งซ้ายแดง ครึ่งขวาน้ำเงิน ติดป้าย EXIF orientation 6 (กล้องถือแนวตั้ง — ต้องหมุน 90° ตามเข็มก่อนแสดง) */
const exifRotatedJpeg = () => flat(40, 20, '#ff0000')
  .composite([{ input: { create: { width: 20, height: 20, channels: 3, background: '#0000ff' } }, left: 20, top: 0 }])
  .jpeg()
  .withMetadata({ orientation: 6 })
  .toBuffer();

/* HEIC ของจริง 16×16 (468 ไบต์ · สร้างด้วย `sips -s format heic` บน macOS) — ไบนารีสำเร็จรูปของ sharp ไม่มีตัวถอด HEVC
   ⇒ นี่คือไบต์แบบเดียวกับรูปจาก iPhone ที่ถูกตั้งชื่อ/ประกาศชนิดเป็น JPEG ตอนอัป */
const HEIC = Buffer.from(
  'AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABhm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAA'
  + 'AAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAAAQAAABVp'
  + 'bmZlAgAAAAABAABodmMxAAAAAOZpcHJwAAAAxWlwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAAFGlzcGUAAAAA'
  + 'AAAAEAAAABAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAcWh2Y0MBA3AAAACwAAAAAAAe8AD8/fj4AAALA6AAAQAXQAEMAf//'
  + 'A3AAAAMAsAAAAwAAAwAecCShAAEAI0IBAQNwAAADALAAAAMAAAMAHqAUIEHAkwziHuRZVNwICBgCogABAAlEAcBhcshAUyQAAAAZ'
  + 'aXBtYQAAAAAAAAABAAEGgQIDBYaEAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAAboAAAAaAAAAAW1kYXQAAAAAAAAAKgAAABYoAa+i'
  + 'REgDcNcLlYkegD5hQcFQEpWA',
  'base64',
);

/** พิกเซลของ JPEG ที่ออกมา `[r, g, b]` */
async function pixel(jpeg, x, y) {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return [data[at], data[at + 1], data[at + 2]];
}

/* ── ตัวปลอม: Drive · ที่เก็บ ────────────────────────────────────────── */

/**
 * Drive ปลอม — `bodies[driveFileId]` เป็น Buffer (คืนเป็น stream ทีละ 64 KB) · Error (โยน) · หรือฟังก์ชัน `(signal) => stream`
 * จำทุกการเรียกไว้ใน `calls` (ไฟล์ไหน · ได้ signal มาไหม)
 */
function fakeDrive(bodies) {
  const calls = [];
  const getFileStream = async (driveFileId, options = {}) => {
    calls.push({ driveFileId, signal: options.signal });
    const body = bodies[driveFileId];
    if (body instanceof Error) throw body;
    if (typeof body === 'function') return body(options.signal);
    if (!body) throw Object.assign(new Error('File not found'), { status: 404 });
    const parts = [];
    for (let i = 0; i < body.length; i += 65536) parts.push(body.subarray(i, i + 65536));
    return Readable.from(parts);
  };
  return { getFileStream, calls, fetched: () => calls.map((c) => c.driveFileId) };
}

/** ที่เก็บปลอม — เก็บในหน่วยความจำ · ซ้ำ path = error แบบเดียวกับ Supabase Storage (`upsert: false`) */
function fakeStore({ existing = [], uploadError = null, throws = null } = {}) {
  const objects = new Map(existing.map((key) => [key, null]));
  const uploads = [];
  const supabase = {
    storage: {
      from(bucket) {
        return {
          async upload(objectPath, data, options) {
            uploads.push({ bucket, path: objectPath, data: Buffer.from(data), options });
            if (throws) throw throws;
            if (uploadError) return { data: null, error: uploadError };
            const key = `${bucket}/${objectPath}`;
            if (objects.has(key)) {
              return { data: null, error: { message: 'The resource already exists', statusCode: '409', error: 'Duplicate' } };
            }
            objects.set(key, Buffer.from(data));
            return { data: { path: objectPath }, error: null };
          },
        };
      },
    },
  };
  return { supabase, objects, uploads };
}

const fileRow = (id, kind, extra = {}) => ({
  attId: id,
  kind,
  zoneId: 'SVZ-1',
  file: { id, fileName: `${id}.jpg`, mimeType: 'image/jpeg', driveFileId: `drv-${id}`, ...extra },
});

const quiet = () => {};
/** ตัวเลือกตั้งต้นของเทสต์ — ด่านเขียนถาวร **เปิดกับที่เก็บปลอม** · ไม่พิมพ์บรรทัดเวลา */
const run = (store, drive, files, opts = {}) => prepareSurveyReportImages(store.supabase, files, {
  storeAllowed: true, bucket: 'survey-report', getFileStream: drive.getFileStream, log: quiet, ...opts,
});

/* ── 1. ผลของการย่อ ──────────────────────────────────────────────────── */

test('รูปที่มี EXIF orientation ออกมาตั้งตรง — w/h สลับตามที่ตาเห็น', async () => {
  const input = await exifRotatedJpeg();
  const before = await sharp(input).metadata();
  assert.deepEqual([before.width, before.height, before.orientation], [40, 20, 6]);

  const out = await downscaleSurveyImage(input, 'wide');
  assert.deepEqual([out.w, out.h], [20, 40], 'ขนาดต้องมาจากผลหลังหมุน ไม่ใช่จากหัวไฟล์');
  const meta = await sharp(out.data).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.deepEqual([meta.width, meta.height], [20, 40]);
  assert.ok(!meta.orientation || meta.orientation === 1, 'ไฟล์ที่เก็บต้องไม่พกป้ายหมุนไปให้ตัวพิมพ์หมุนซ้ำ');

  // ครึ่งซ้าย (แดง) ต้องขึ้นไปอยู่บน ครึ่งขวา (น้ำเงิน) ลงมาอยู่ล่าง
  const [topR, , topB] = await pixel(out.data, 10, 5);
  const [bottomR, , bottomB] = await pixel(out.data, 10, 35);
  assert.ok(topR > 200 && topB < 60, `บนต้องแดง ได้ r=${topR} b=${topB}`);
  assert.ok(bottomB > 200 && bottomR < 60, `ล่างต้องน้ำเงิน ได้ r=${bottomR} b=${bottomB}`);
});

test('ด้านยาวไม่เกิน 1000 px (ภาพกว้าง · รูปจุด) และ 1600 px (ภาพผัง) — รูปเล็กไม่ถูกขยาย', async () => {
  assert.equal(SURVEY_IMAGE_EDGE, 1000);
  assert.equal(SURVEY_IMAGE_PLAN_EDGE, 1600);
  const landscape = await flat(3000, 1500, '#336699').jpeg().toBuffer();
  const portrait = await flat(1200, 2400, '#336699').jpeg().toBuffer();
  const small = await flat(320, 240, '#336699').jpeg().toBuffer();

  const size = async (buffer, kind) => { const o = await downscaleSurveyImage(buffer, kind); return [o.w, o.h]; };
  assert.deepEqual(await size(landscape, 'wide'), [1000, 500]);
  assert.deepEqual(await size(landscape, 'spot'), [1000, 500]);
  assert.deepEqual(await size(landscape, 'plan'), [1600, 800]);
  assert.deepEqual(await size(portrait, 'wide'), [500, 1000]);
  assert.deepEqual(await size(portrait, 'plan'), [800, 1600]);
  assert.deepEqual(await size(small, 'wide'), [320, 240]);
  assert.deepEqual(await size(small, 'plan'), [320, 240]);
});

test('PNG โปร่งใสได้พื้นขาว (bucket รับเฉพาะ JPEG — ไม่มีช่องโปร่งใสให้กลายเป็นดำ)', async () => {
  const png = await flat(30, 30, { r: 0, g: 0, b: 0, alpha: 0 }, 4).png().toBuffer();
  const out = await downscaleSurveyImage(png, 'plan');
  assert.equal((await sharp(out.data).metadata()).format, 'jpeg');
  assert.deepEqual(await pixel(out.data, 15, 15), [255, 255, 255]);
});

test('TIFF ถอดรหัสได้ · ผลเป็น JPEG เสมอ · sha/bytes ตรงกับไบต์ที่ออก', async () => {
  const tiff = await flat(2000, 1000, '#884422').tiff().toBuffer();
  const out = await downscaleSurveyImage(tiff, 'wide');
  assert.deepEqual([out.w, out.h], [1000, 500]);
  assert.equal((await sharp(out.data).metadata()).format, 'jpeg');
  assert.equal(out.sha, sha256(out.data));
  assert.equal(out.bytes, out.data.length);
  assert.match(out.sha, /^[0-9a-f]{64}$/);
});

/* ── 2. เส้นปกติ: ดึง → ย่อ → เก็บ ────────────────────────────────────── */

test('เส้นปกติ — เก็บที่ img/<sha>.jpg เป็น image/jpeg ไม่เขียนทับ · แผนที่คืน sha/w/h/bytes ของไฟล์ที่เก็บ', async () => {
  const drive = fakeDrive({
    'drv-A1': await noiseJpeg(1400, 700),
    'drv-A2': await flat(900, 1800, '#225577').png().toBuffer(),
  });
  const store = fakeStore();
  const lines = [];
  const res = await run(store, drive, [fileRow('A1', 'wide'), fileRow('A2', 'plan')], { log: (line) => lines.push(line) });

  assert.deepEqual(res.failed, []);
  assert.deepEqual(Object.keys(res.imageByAttId), ['A1', 'A2']);
  assert.equal(store.uploads.length, 2);
  for (const attId of ['A1', 'A2']) {
    const img = res.imageByAttId[attId];
    assert.deepEqual(Object.keys(img).sort(), ['bytes', 'h', 'sha', 'w'], 'รูปร่างเดียวกับที่ buildSurveyReportSnapshot อ่าน');
    const up = store.uploads.find((u) => u.path === surveyReportImagePath(img.sha));
    assert.ok(up, `ต้องอัป ${attId}`);
    assert.equal(up.path, `img/${img.sha}.jpg`);
    assert.equal(up.bucket, 'survey-report');
    assert.deepEqual(up.options, { contentType: 'image/jpeg', upsert: false });
    assert.equal(sha256(up.data), img.sha, 'sha = sha256 ของไบต์ที่เก็บจริง');
    assert.equal(up.data.length, img.bytes);
    const meta = await sharp(up.data).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', img.w, img.h]);
  }
  assert.deepEqual([res.imageByAttId.A1.w, res.imageByAttId.A1.h], [1000, 500]);
  assert.deepEqual([res.imageByAttId.A2.w, res.imageByAttId.A2.h], [800, 1600]);

  // ทุกไฟล์ได้ signal ของตัวเอง (เพดาน 30 วิ) และมีบรรทัดเวลา fetch/resize/upload
  assert.equal(SURVEY_IMAGE_FILE_TIMEOUT_MS, 30_000);
  assert.ok(drive.calls.every((c) => c.signal instanceof AbortSignal));
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.equal(line.ok, true);
    for (const key of ['fetchMs', 'resizeMs', 'uploadMs', 'inBytes', 'outBytes']) {
      assert.equal(typeof line[key], 'number', `บรรทัดเวลาต้องมี ${key}`);
    }
  }
});

test('ไบต์เดียวกันสองไฟล์ = sha เดียว อัปครั้งเดียว', async () => {
  const bytes = await noiseJpeg(600, 400);
  const drive = fakeDrive({ 'drv-A1': bytes, 'drv-A2': Buffer.from(bytes), 'drv-A3': await flat(600, 400, '#101010').jpeg().toBuffer() });
  const store = fakeStore();
  const res = await run(store, drive, [fileRow('A1', 'wide'), fileRow('A2', 'spot'), fileRow('A3', 'wide')]);

  assert.deepEqual(res.failed, []);
  assert.equal(res.imageByAttId.A1.sha, res.imageByAttId.A2.sha);
  assert.notEqual(res.imageByAttId.A1.sha, res.imageByAttId.A3.sha);
  assert.equal(store.uploads.length, 2, 'ไฟล์ซ้ำเนื้อต้องไม่อัปสองรอบ');
  assert.equal(store.objects.size, 2);
});

test('"มีอยู่แล้ว" ในที่เก็บ = สำเร็จ (ส่งใหม่หลังดึงผลกลับใช้รูปเดิม)', async () => {
  const bytes = await noiseJpeg(500, 500);
  const first = fakeStore();
  const one = await run(first, fakeDrive({ 'drv-A1': bytes }), [fileRow('A1', 'wide')]);
  const { sha } = one.imageByAttId.A1;

  const again = fakeStore({ existing: [`survey-report/img/${sha}.jpg`] });
  const two = await run(again, fakeDrive({ 'drv-A1': bytes }), [fileRow('A1', 'wide')]);
  assert.deepEqual(two.failed, []);
  assert.deepEqual(two.imageByAttId.A1, one.imageByAttId.A1, 'ผลการย่อของไบต์เดิมต้องนิ่ง');
  assert.equal(again.uploads.length, 1);

  // ข้อความของ error ที่ Storage ตอบได้ทุกแบบ — กติกาเดียวกับ issuedQuotationPdf.js
  for (const error of [{ message: 'Duplicate' }, { message: 'Object already exists' }, { message: 'x', error: 'Duplicate' }]) {
    const res = await run(fakeStore({ uploadError: error }), fakeDrive({ 'drv-A1': bytes }), [fileRow('A1', 'wide')]);
    assert.deepEqual(res.failed, [], JSON.stringify(error));
    assert.equal(res.imageByAttId.A1.sha, sha);
  }
});

test('อัปไม่ขึ้น = ไม่ถาวร (ระบบ) — ทั้ง { error } และตัวที่โยน · ไม่มีรูปนั้นในแผนที่', async () => {
  const bytes = await noiseJpeg(300, 300);
  for (const store of [
    fakeStore({ uploadError: { message: 'Bucket not found', statusCode: '404' } }),
    fakeStore({ throws: new TypeError('fetch failed') }),
  ]) {
    const res = await run(store, fakeDrive({ 'drv-A1': bytes }), [fileRow('A1', 'wide')]);
    assert.deepEqual(res.imageByAttId, {});
    assert.deepEqual(res.failed, [{ attId: 'A1', fileName: 'A1.jpg', reason: F.UPLOAD_FAILED, permanent: false }]);
  }
});

test('ที่เก็บค้างไม่ตอบ = upload_failed เมื่อครบเพดานต่อไฟล์ ไม่ลากทั้งรอบค้าง', async () => {
  const store = { supabase: { storage: { from: () => ({ upload: () => new Promise(() => {}) }) } } };
  const res = await run(store, fakeDrive({ 'drv-A1': await noiseJpeg(200, 200) }), [fileRow('A1', 'wide')], { fileTimeoutMs: 80 });
  assert.deepEqual(res.failed, [{ attId: 'A1', fileName: 'A1.jpg', reason: F.UPLOAD_FAILED, permanent: false }]);
});

/* ── 3. ด่านเขียนถาวร ────────────────────────────────────────────────── */

test('ด่านเขียนถาวรปิด = ไม่อัปอะไรเลย แต่ยังย่อและยังจับไฟล์เสียได้', async () => {
  const bodies = { 'drv-A1': await noiseJpeg(400, 300), 'drv-A2': HEIC };
  const store = fakeStore();
  const res = await run(store, fakeDrive(bodies), [fileRow('A1', 'wide'), fileRow('A2', 'wide')], { storeAllowed: false });
  assert.equal(store.uploads.length, 0);
  assert.match(res.imageByAttId.A1.sha, /^[0-9a-f]{64}$/);
  assert.deepEqual(res.failed.map((f) => [f.attId, f.reason, f.permanent]), [['A2', F.UNDECODABLE, true]]);
});

test('ไม่ส่ง storeAllowed มา = ถามตัวตัดสินกลาง — นอก production ต้องไม่อัป', async () => {
  const keep = process.env.VERCEL_ENV;
  try {
    for (const env of [undefined, 'preview', 'development']) {
      if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;
      const store = fakeStore();
      const res = await prepareSurveyReportImages(store.supabase, [fileRow('A1', 'wide')], {
        getFileStream: fakeDrive({ 'drv-A1': await noiseJpeg(200, 200) }).getFileStream, log: quiet,
      });
      assert.deepEqual(res.failed, []);
      assert.equal(store.uploads.length, 0, `VERCEL_ENV=${env} ต้องไม่อัป`);
    }
  } finally {
    if (keep === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = keep;
  }
});

test('ไม่ส่ง storeAllowed มา บน production = อัป (ลงที่เก็บปลอมของเทสต์) ที่ bucket ของตัวตัดสินกลาง', async () => {
  const rows = await import('./surveyReportRows.js');
  const keep = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  try {
    assert.equal(rows.surveyReportStoreAllowed(), true);
    const store = fakeStore();
    const res = await prepareSurveyReportImages(store.supabase, [fileRow('A1', 'wide')], {
      getFileStream: fakeDrive({ 'drv-A1': await noiseJpeg(200, 200) }).getFileStream, log: quiet,
    });
    assert.deepEqual(res.failed, []);
    assert.deepEqual(store.uploads.map((u) => [u.bucket, u.path]), [[rows.SURVEY_REPORT_BUCKET, `img/${res.imageByAttId.A1.sha}.jpg`]]);
    assert.equal(rows.SURVEY_REPORT_BUCKET, 'survey-report', 'ชื่อ bucket ของ 0401');
  } finally {
    if (keep === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = keep;
  }
});

/* ── 4. ความล้มเหลวถาวร (ตัวไฟล์คือปัญหา) ─────────────────────────────── */

test('HEIC ที่ตั้งชื่อ .jpg = ล้มถาวร บอกชื่อไฟล์ · ไฟล์อื่นในรอบเดียวกันผ่านตามปกติ', async () => {
  const drive = fakeDrive({ 'drv-A1': await noiseJpeg(400, 300), 'drv-A2': HEIC });
  const store = fakeStore();
  const res = await run(store, drive, [
    fileRow('A1', 'wide'),
    fileRow('A2', 'spot', { fileName: 'IMG_0412.jpg', mimeType: 'image/jpeg' }),
  ]);
  assert.deepEqual(res.failed, [{ attId: 'A2', fileName: 'IMG_0412.jpg', reason: F.UNDECODABLE, permanent: true }]);
  assert.deepEqual(Object.keys(res.imageByAttId), ['A1']);
  assert.equal(store.uploads.length, 1, 'ไฟล์ที่ถอดไม่ได้ต้องไม่มีอะไรขึ้นที่เก็บ');
});

test('JPEG ขาดท้าย (อัปไม่จบ) = ล้มถาวร บอกชื่อไฟล์ — ไม่ออกมาเป็นรูปครึ่งเทา', async () => {
  const whole = await noiseJpeg(1600, 1200);
  const cases = {
    half: whole.subarray(0, whole.length >> 1),
    tail: whole.subarray(0, whole.length - 2),
    header: whole.subarray(0, 200),
    empty: Buffer.alloc(0),
    text: Buffer.from('ไม่ใช่รูป'),
  };
  for (const [name, bytes] of Object.entries(cases)) {
    const store = fakeStore();
    const res = await run(store, fakeDrive({ 'drv-A1': bytes }), [fileRow('A1', 'wide', { fileName: 'หน้างาน 1.jpg' })]);
    assert.deepEqual(
      res.failed,
      [{ attId: 'A1', fileName: 'หน้างาน 1.jpg', reason: F.UNDECODABLE, permanent: true }],
      `กรณี ${name}`,
    );
    assert.equal(store.uploads.length, 0, `กรณี ${name}`);
  }
});

test('แถวที่ไม่มี driveFileId = ล้มถาวร และไม่ยิง Drive', async () => {
  const drive = fakeDrive({});
  const res = await run(fakeStore(), drive, [fileRow('A1', 'wide', { driveFileId: null, fileName: 'เก่า.png' })]);
  assert.deepEqual(res.failed, [{ attId: 'A1', fileName: 'เก่า.png', reason: F.NO_DRIVE_FILE, permanent: true }]);
  assert.deepEqual(drive.calls, []);
});

test('ต้นฉบับใหญ่เกินเพดานอัป = ล้มถาวร และหยุดอ่านทันทีที่เกิน', async () => {
  const chunk = Buffer.alloc(1024 * 1024, 7);
  let sent = 0;
  let destroyed = false;
  const endless = () => {
    const stream = new Readable({
      read() { sent += 1; this.push(chunk); }, // ไม่มีวันจบ — ต้องถูกปิดจากฝั่งอ่าน
      destroy(err, done) { destroyed = true; done(err); },
    });
    return stream;
  };
  const res = await run(fakeStore(), fakeDrive({ 'drv-A1': endless }), [fileRow('A1', 'plan', { fileName: 'ผังใหญ่.jpg' })]);
  assert.deepEqual(res.failed, [{ attId: 'A1', fileName: 'ผังใหญ่.jpg', reason: F.TOO_LARGE, permanent: true }]);
  assert.ok(destroyed, 'stream ต้องถูกปิด');
  const capMb = Math.max(MAX_BYTES, MAX_UPLOAD_BYTES) / (1024 * 1024);
  assert.ok(capMb >= 25);
  assert.ok(sent > capMb && sent < capMb + 30, `ต้องหยุดอ่านทันทีที่เกิน ${capMb} MB (อ่านไป ${sent} MB)`);
});

/* ── 5. Drive: 404/403 ถาวร · ที่เหลือไม่ถาวร ─────────────────────────── */

test('Drive ตอบ 404/403 = ถาวร · 403 เพราะยิงถี่/โควตา · 429 · 5xx · เครือข่าย = ไม่ถาวร', async () => {
  const gaxios = (status, body) => Object.assign(new Error(body), { status, response: { status, data: body } });
  const bodies = {
    'drv-N404': gaxios(404, '{"error":{"code":404,"message":"File not found: x","errors":[{"reason":"notFound"}]}}'),
    'drv-N403': gaxios(403, '{"error":{"code":403,"errors":[{"reason":"insufficientFilePermissions"}]}}'),
    'drv-RATE': gaxios(403, '{"error":{"code":403,"message":"User Rate Limit Exceeded","errors":[{"reason":"userRateLimitExceeded"}]}}'),
    'drv-T429': gaxios(429, 'Too Many Requests'),
    'drv-E500': gaxios(500, 'Internal Error'),
    'drv-E503': Object.assign(new Error('Service Unavailable'), { code: '503' }),
    'drv-NET': Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    'drv-AUTH': gaxios(401, 'Invalid Credentials'),
  };
  const ids = ['N404', 'N403', 'RATE', 'T429', 'E500', 'E503', 'NET', 'AUTH'];
  const store = fakeStore();
  const res = await run(store, fakeDrive(bodies), ids.map((id) => fileRow(id, 'wide')));
  assert.deepEqual(res.failed.map((f) => [f.attId, f.reason, f.permanent]), [
    ['N404', F.DRIVE_NOT_FOUND, true],
    ['N403', F.DRIVE_FORBIDDEN, true],
    ['RATE', F.DRIVE_ERROR, false],
    ['T429', F.DRIVE_ERROR, false],
    ['E500', F.DRIVE_ERROR, false],
    ['E503', F.DRIVE_ERROR, false],
    ['NET', F.DRIVE_ERROR, false],
    ['AUTH', F.DRIVE_ERROR, false],
  ]);
  assert.ok(res.failed.every((f) => f.fileName === `${f.attId}.jpg`), 'ทุกแถวบอกชื่อไฟล์');
  assert.deepEqual(res.imageByAttId, {});
  assert.equal(store.uploads.length, 0);
});

test('Drive ค้าง (ไม่ตอบหัว · เนื้อไฟล์หยุดไหล · ตัวดึงโยนตรง ๆ) = ไม่ถาวร และไม่ลากทั้งรอบค้าง', async () => {
  let destroyed = false;
  const stalledBody = () => new Readable({
    read() { if (!this.sentOnce) { this.sentOnce = true; this.push(Buffer.from([0xff, 0xd8, 0xff])); } }, // แล้วเงียบ
    destroy(err, done) { destroyed = true; done(err); },
  });
  const drive = fakeDrive({
    'drv-HEAD': () => new Promise(() => {}),
    'drv-BODY': stalledBody,
    'drv-OK': await noiseJpeg(300, 200),
  });
  const getFileStream = (id, options) => {
    if (id === 'drv-SYNC') throw new Error('boom');
    return drive.getFileStream(id, options);
  };
  const started = Date.now();
  const res = await run(fakeStore(), { getFileStream }, [
    fileRow('HEAD', 'wide'), fileRow('BODY', 'wide'), fileRow('SYNC', 'wide'), fileRow('OK', 'wide'),
  ], { fileTimeoutMs: 120 });

  assert.deepEqual(res.failed.map((f) => [f.attId, f.reason, f.permanent]), [
    ['HEAD', F.DRIVE_TIMEOUT, false],
    ['BODY', F.DRIVE_TIMEOUT, false],
    ['SYNC', F.DRIVE_ERROR, false],
  ]);
  assert.deepEqual(Object.keys(res.imageByAttId), ['OK']);
  assert.ok(Date.now() - started < 5000);
  assert.ok(destroyed, 'stream ที่ค้างต้องถูกปิด ไม่ปล่อย socket ไว้');
  assert.ok(drive.calls.find((c) => c.driveFileId === 'drv-HEAD').signal.aborted, 'signal ที่ส่งให้ Drive ต้องถูกตัด');
});

/* ── 5b. 404/403 ทั้งรอบ: ไฟล์หาย หรือระบบเข้า Drive ไม่ได้ (มติเจ้าของข้อ 2) ─────────── */

const gone404 = () => Object.assign(new Error('File not found: x'), { status: 404 });
const deny403 = () => {
  const body = '{"error":{"code":403,"errors":[{"reason":"insufficientFilePermissions"}]}}';
  return Object.assign(new Error(body), { status: 403, response: { status: 403, data: body } });
};
/** ตัวถามปลอม — `answer` เป็น Error (โยน) · ฟังก์ชัน `(signal) => Promise` · อย่างอื่น = ผ่าน · จำ signal ของทุกครั้งที่ถูกเรียก */
function fakeProbe(answer = null) {
  const calls = [];
  const probeDrive = async ({ signal } = {}) => {
    calls.push(signal);
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'function') return answer(signal);
    return undefined;
  };
  return { probeDrive, calls };
}

test('🔴 ทุกไฟล์ได้ 404/403 และถาม Shared Drive ไม่ผ่าน = ระบบเข้า Drive ไม่ได้ — ไม่ถาวร การส่งผลไม่ถูกตีกลับ', async () => {
  const drive = fakeDrive({ 'drv-A1': gone404(), 'drv-A2': deny403(), 'drv-A3': gone404() });
  const probe = fakeProbe(Object.assign(new Error('Shared drive not found: 0AB'), { status: 404 }));
  const lines = [];
  const store = fakeStore();
  const res = await run(store, drive, ['A1', 'A2', 'A3'].map((id) => fileRow(id, 'wide')), {
    probeDrive: probe.probeDrive, log: (line) => lines.push(line),
  });

  assert.deepEqual(res.failed, [
    { attId: 'A1', fileName: 'A1.jpg', reason: F.DRIVE_ERROR, permanent: false },
    { attId: 'A2', fileName: 'A2.jpg', reason: F.DRIVE_ERROR, permanent: false },
    { attId: 'A3', fileName: 'A3.jpg', reason: F.DRIVE_ERROR, permanent: false },
  ]);
  assert.deepEqual(res.imageByAttId, {});
  assert.equal(store.uploads.length, 0);
  assert.equal(surveySendImageRefusal(res.failed), null, 'S3 ต้องไม่ตีกลับ — อัปรูปใหม่ไม่ได้ช่วยอะไร');
  assert.equal(probe.calls.length, 1, 'ถามครั้งเดียวต่อรอบ ไม่ใช่ต่อไฟล์');
  assert.ok(probe.calls[0] instanceof AbortSignal);
  const said = lines.find((line) => line.probe === 'drive_access');
  assert.deepEqual([said.ok, said.files], [false, 3]);
  assert.equal(said.detail, 'HTTP 404 · Shared drive not found: 0AB');

  // ไฟล์เดียวก็ถาม (ใบที่มีรูปเดียว) · ตัวถามตอบด้วยเหตุอื่น (5xx) ก็ยังเป็น "ระบบ" — เอกสารออกตามทีหลังได้
  const lone = fakeProbe(Object.assign(new Error('Backend Error'), { status: 503 }));
  const one = await run(fakeStore(), fakeDrive({}), [fileRow('B1', 'plan')], { probeDrive: lone.probeDrive });
  assert.deepEqual(one.failed, [{ attId: 'B1', fileName: 'B1.jpg', reason: F.DRIVE_ERROR, permanent: false }]);
  assert.equal(lone.calls.length, 1);
});

test('🔴 ทุกไฟล์ได้ 404/403 แต่ถาม Shared Drive ผ่าน = ไฟล์หายจริง — ถาวร ตีกลับพร้อมชื่อไฟล์ตามเดิม', async () => {
  const drive = fakeDrive({ 'drv-A1': gone404(), 'drv-A2': deny403() });
  const probe = fakeProbe();
  const lines = [];
  const res = await run(fakeStore(), drive, [fileRow('A1', 'wide'), fileRow('A2', 'plan')], {
    probeDrive: probe.probeDrive, log: (line) => lines.push(line),
  });
  assert.deepEqual(res.failed.map((f) => [f.attId, f.reason, f.permanent]), [
    ['A1', F.DRIVE_NOT_FOUND, true],
    ['A2', F.DRIVE_FORBIDDEN, true],
  ]);
  assert.equal(probe.calls.length, 1);
  assert.equal(
    surveySendImageRefusal(res.failed),
    'รูป 2 รูปเปิดไม่ได้ — อัปใหม่เป็น JPG แล้วส่งอีกครั้ง (ชื่อไฟล์ A1.jpg · A2.jpg) · ยังไม่ได้ส่งผล',
  );
  assert.equal(lines.find((line) => line.probe === 'drive_access').ok, true);
});

test('มีไฟล์ที่ Drive ส่งเนื้อมาได้ในรอบเดียวกัน = ไม่ต้องถาม — 404/403 ของไฟล์อื่นถาวร (รูปเสียก็นับว่า Drive ตอบ)', async () => {
  const never = () => fakeProbe(new Error('ห้ามถูกเรียก'));

  const mixed = never();
  const ok = await run(fakeStore(), fakeDrive({ 'drv-A1': gone404(), 'drv-A2': await noiseJpeg(200, 100), 'drv-A3': deny403() }),
    ['A1', 'A2', 'A3'].map((id) => fileRow(id, 'wide')), { probeDrive: mixed.probeDrive, concurrency: 1 });
  assert.deepEqual(ok.failed.map((f) => [f.attId, f.reason, f.permanent]), [
    ['A1', F.DRIVE_NOT_FOUND, true],
    ['A3', F.DRIVE_FORBIDDEN, true],
  ]);
  assert.deepEqual(Object.keys(ok.imageByAttId), ['A2']);
  assert.equal(mixed.calls.length, 0);

  // ไฟล์ที่ดึงมาได้แต่ถอดรหัสไม่ได้ ก็พิสูจน์ว่าระบบเข้า Drive ได้
  const heic = never();
  const bad = await run(fakeStore(), fakeDrive({ 'drv-A1': gone404(), 'drv-A2': HEIC }),
    [fileRow('A1', 'wide'), fileRow('A2', 'wide')], { probeDrive: heic.probeDrive });
  assert.deepEqual(bad.failed.map((f) => [f.attId, f.reason, f.permanent]), [
    ['A1', F.DRIVE_NOT_FOUND, true],
    ['A2', F.UNDECODABLE, true],
  ]);
  assert.equal(heic.calls.length, 0);

  // ไม่มี 404/403 เลย (5xx · ไม่มี driveFileId · ไฟล์ที่มีอยู่แล้วใน have) = ไม่มีอะไรต้องแยก ไม่ถาม
  const none = never();
  const res = await run(fakeStore(), fakeDrive({ 'drv-A1': Object.assign(new Error('Internal Error'), { status: 500 }) }),
    [fileRow('A1', 'wide'), fileRow('A2', 'wide', { driveFileId: null }), fileRow('A3', 'wide')],
    { probeDrive: none.probeDrive, have: { A3: { sha: 'c'.repeat(64), w: 10, h: 10, bytes: 99 } } });
  assert.deepEqual(res.failed.map((f) => [f.attId, f.reason, f.permanent]), [
    ['A1', F.DRIVE_ERROR, false],
    ['A2', F.NO_DRIVE_FILE, true],
  ]);
  assert.equal(none.calls.length, 0);
});

test('ไฟล์ของรอบก่อน (have) ไม่ได้พิสูจน์ว่าตอนนี้ยังเข้า Drive ได้ — รอบเติมที่ได้ 404 ทั้งชุดยังต้องถาม', async () => {
  const probe = fakeProbe(Object.assign(new Error('The user does not have sufficient permissions'), { status: 403 }));
  const res = await run(fakeStore(), fakeDrive({}), [fileRow('A1', 'wide'), fileRow('A2', 'wide')], {
    probeDrive: probe.probeDrive, have: { A1: { sha: 'a'.repeat(64), w: 10, h: 10, bytes: 99 } },
  });
  assert.deepEqual(Object.keys(res.imageByAttId), ['A1']);
  assert.deepEqual(res.failed, [{ attId: 'A2', fileName: 'A2.jpg', reason: F.DRIVE_ERROR, permanent: false }]);
  assert.equal(probe.calls.length, 1);
});

test('ตัวถามค้างไม่ตอบ = ถือว่าเข้า Drive ไม่ได้ (ไม่ถาวร) เมื่อครบเพดาน ไม่ลากทั้งรอบค้าง · ตัวถามโยนตรง ๆ ก็ไม่หลุดเข้า route', async () => {
  assert.equal(SURVEY_IMAGE_PROBE_TIMEOUT_MS, 10_000);
  assert.ok(SURVEY_IMAGE_PROBE_TIMEOUT_MS <= SURVEY_IMAGE_FILE_TIMEOUT_MS);

  const stuck = fakeProbe(() => new Promise(() => {}));
  const started = Date.now();
  const res = await run(fakeStore(), fakeDrive({}), [fileRow('A1', 'wide')], { probeDrive: stuck.probeDrive, fileTimeoutMs: 120 });
  assert.deepEqual(res.failed, [{ attId: 'A1', fileName: 'A1.jpg', reason: F.DRIVE_ERROR, permanent: false }]);
  assert.ok(Date.now() - started < 5000);
  assert.ok(stuck.calls[0].aborted, 'signal ที่ส่งให้ตัวถามต้องถูกตัด');

  const sync = await run(fakeStore(), fakeDrive({}), [fileRow('A1', 'wide')], { probeDrive: () => { throw new Error('boom'); } });
  assert.deepEqual(sync.failed, [{ attId: 'A1', fileName: 'A1.jpg', reason: F.DRIVE_ERROR, permanent: false }]);
});

test('ส่งตัวดึงไฟล์ของตัวเองมาโดยไม่ส่งตัวถาม = ไม่มีอะไรให้ถาม — 404/403 ถาวรตามที่ Drive ตอบ ไม่แตะ lib/drive', async () => {
  const res = await run(fakeStore(), fakeDrive({ 'drv-A2': deny403() }), [fileRow('A1', 'wide'), fileRow('A2', 'wide')]);
  assert.deepEqual(res.failed.map((f) => [f.attId, f.reason, f.permanent]), [
    ['A1', F.DRIVE_NOT_FOUND, true],
    ['A2', F.DRIVE_FORBIDDEN, true],
  ]);
});

/* ── 6. งบเวลา · ชุด · have ───────────────────────────────────────────── */

test('งบเวลาหมด = ไม่เริ่มชุดใหม่ ไฟล์ที่เหลือเป็น timeout (ไม่ถาวร) — ชุดที่เริ่มแล้วทำจนจบ', async () => {
  const ids = ['A1', 'A2', 'A3', 'A4', 'A5'];
  const bytes = {};
  for (const [i, id] of ids.entries()) bytes[id] = await flat(200, 200, { r: 40 * i, g: 90, b: 200 - 40 * i }).jpeg().toBuffer();
  const make = () => {
    let clock = 1_790_000_000_000;
    const drive = fakeDrive(Object.fromEntries(ids.map((id) => [`drv-${id}`, () => {
      clock += 40_000; // ไฟล์ละ 40 วินาที
      return Readable.from([bytes[id]]);
    }])));
    return { drive, now: () => clock, start: clock };
  };

  for (const mode of ['absolute', 'date', 'duration']) {
    const { drive, now, start } = make();
    const deadline = { absolute: start + 60_000, date: new Date(start + 60_000), duration: 60_000 }[mode];
    const res = await run(fakeStore(), drive, ids.map((id) => fileRow(id, 'wide')), { deadline, concurrency: 2, now });
    assert.deepEqual(drive.fetched(), ['drv-A1', 'drv-A2'], `${mode}: ชุดที่สองต้องไม่เริ่ม`);
    assert.deepEqual(Object.keys(res.imageByAttId), ['A1', 'A2'], mode);
    assert.deepEqual(
      res.failed,
      ['A3', 'A4', 'A5'].map((id) => ({ attId: id, fileName: `${id}.jpg`, reason: F.TIMEOUT, permanent: false })),
      mode,
    );
  }

  // งบหมดตั้งแต่ก่อนเริ่ม = ไม่ยิง Drive เลย
  const late = make();
  const res = await run(fakeStore(), late.drive, ids.map((id) => fileRow(id, 'wide')), { deadline: late.start - 1, now: late.now });
  assert.deepEqual(late.drive.calls, []);
  assert.deepEqual(res.failed.map((f) => f.reason), ids.map(() => F.TIMEOUT));

  // ไม่ตั้งงบ = ทำครบ
  const free = make();
  const all = await run(fakeStore(), free.drive, ids.map((id) => fileRow(id, 'wide')), { now: free.now });
  assert.deepEqual(all.failed, []);
  assert.equal(Object.keys(all.imageByAttId).length, 5);
});

test('concurrency = ขนาดชุด — ไม่มีไฟล์เกินจำนวนนี้ถูกดึงพร้อมกัน', async () => {
  const bytes = await noiseJpeg(120, 120);
  let live = 0;
  let peak = 0;
  const ids = Array.from({ length: 9 }, (_, i) => `A${i + 1}`);
  const getFileStream = async () => {
    live += 1;
    peak = Math.max(peak, live);
    await new Promise((resolve) => setTimeout(resolve, 15));
    live -= 1;
    return Readable.from([bytes]);
  };
  const res = await run(fakeStore(), { getFileStream }, ids.map((id) => fileRow(id, 'wide')));
  assert.equal(Object.keys(res.imageByAttId).length, 9);
  assert.equal(peak, 4, 'ค่าตั้งต้น 4');

  peak = 0;
  await run(fakeStore(), { getFileStream }, ids.map((id) => fileRow(id, 'wide')), { concurrency: 2 });
  assert.equal(peak, 2);
});

test('have = แผนที่ของรอบก่อน — id ที่มีแล้วไม่ถูกดึงซ้ำ และติดกลับมาในผล (object หรือ Map)', async () => {
  const a = await noiseJpeg(300, 200);
  const b = await flat(300, 200, '#445566').jpeg().toBuffer();
  const first = await run(fakeStore(), fakeDrive({ 'drv-A1': a }), [fileRow('A1', 'wide')]);

  for (const have of [first.imageByAttId, new Map(Object.entries(first.imageByAttId))]) {
    const drive = fakeDrive({ 'drv-A1': a, 'drv-A2': b });
    const store = fakeStore();
    const res = await run(store, drive, [fileRow('A1', 'wide'), fileRow('A2', 'wide')], { have });
    assert.deepEqual(drive.fetched(), ['drv-A2'], 'A1 ต้องไม่ถูกดึงอีก');
    assert.deepEqual(res.imageByAttId.A1, first.imageByAttId.A1);
    assert.match(res.imageByAttId.A2.sha, /^[0-9a-f]{64}$/);
    assert.equal(store.uploads.length, 1);
    assert.deepEqual(res.failed, []);
  }

  // มีครบแล้ว = ไม่โหลด sharp ไม่ยิง Drive ไม่อัป · รายการที่ไม่ได้ขอไม่ติดมา
  const drive = fakeDrive({});
  const store = fakeStore();
  const res = await run(store, drive, [fileRow('A1', 'wide')], {
    have: { ...first.imageByAttId, GONE: { sha: 'x'.repeat(64), w: 1, h: 1, bytes: 1 } },
    loadSharp: async () => { throw new Error('ต้องไม่ถูกเรียก'); },
  });
  assert.deepEqual(res, { imageByAttId: { A1: first.imageByAttId.A1 }, failed: [] });
  assert.deepEqual(drive.calls, []);
  assert.equal(store.uploads.length, 0);
});

test('attId ซ้ำในลิสต์นับครั้งเดียว · failed เรียงตามลำดับของลิสต์ · ลิสต์ว่าง/ไม่ใช่อาร์เรย์ไม่ล้ม', async () => {
  const drive = fakeDrive({ 'drv-A1': await noiseJpeg(200, 200), 'drv-A2': HEIC, 'drv-A3': Buffer.from('x') });
  const res = await run(fakeStore(), drive, [
    fileRow('A3', 'wide'), fileRow('A1', 'wide'), fileRow('A2', 'wide'), fileRow('A1', 'wide'), null, {},
  ], { concurrency: 1 });
  assert.deepEqual(drive.fetched().sort(), ['drv-A1', 'drv-A2', 'drv-A3']);
  assert.deepEqual(res.failed.map((f) => f.attId), ['A3', 'A2']);

  for (const files of [[], null, undefined, 'x']) {
    assert.deepEqual(await run(fakeStore(), fakeDrive({}), files), { imageByAttId: {}, failed: [] });
  }
});

/* ── 7. sharp โหลดไม่ได้ ──────────────────────────────────────────────── */

test('import sharp ล้ม = ทุกไฟล์ล้มแบบไม่ถาวร (sharp_unavailable) ไม่โยน ไม่ยิง Drive ไม่อัป', async () => {
  const drive = fakeDrive({ 'drv-A1': await noiseJpeg(200, 200) });
  const store = fakeStore();
  const loaders = {
    rejects: async () => { throw new Error("Could not load the \"sharp\" module using the linux-x64 runtime"); },
    notFunction: async () => undefined,
    cannotEncode: async () => () => ({ jpeg: () => ({ toBuffer: async () => { throw new Error('vips: no jpeg'); } }) }),
  };
  const keep = console.error;
  console.error = () => {};
  try {
    for (const [name, loadSharp] of Object.entries(loaders)) {
      const res = await run(store, drive, [fileRow('A1', 'wide'), fileRow('A2', 'plan', { driveFileId: null })], { loadSharp });
      assert.deepEqual(res, {
        imageByAttId: {},
        failed: [
          { attId: 'A1', fileName: 'A1.jpg', reason: F.SHARP_UNAVAILABLE, permanent: false },
          { attId: 'A2', fileName: 'A2.jpg', reason: F.SHARP_UNAVAILABLE, permanent: false },
        ],
      }, name);
    }
  } finally {
    console.error = keep;
  }
  assert.deepEqual(drive.calls, []);
  assert.equal(store.uploads.length, 0);
});

test('sharp จองหน่วยความจำไม่ได้ = ไม่ถาวร (เครื่อง ไม่ใช่ไฟล์) — เหตุอื่นจากการถอดรหัส = ถาวร', async () => {
  // sharp ปลอมที่ผ่านการลองเข้ารหัส 2×2 แต่ล้มกับไฟล์จริงด้วยข้อความที่กำหนด
  const failing = (message) => async () => (input) => {
    const chain = {
      rotate: () => chain, flatten: () => chain, resize: () => chain, jpeg: () => chain,
      toBuffer: async () => { if (Buffer.isBuffer(input)) throw new Error(message); return Buffer.from('ok'); },
    };
    return chain;
  };
  const bytes = await noiseJpeg(100, 100);
  const reasonOf = async (message) => {
    const res = await run(fakeStore(), fakeDrive({ 'drv-A1': bytes }), [fileRow('A1', 'wide')], { loadSharp: failing(message) });
    return [res.failed[0].reason, res.failed[0].permanent];
  };
  assert.deepEqual(await reasonOf('out of memory --- size == 512 MiB'), [F.INTERNAL, false]);
  assert.deepEqual(await reasonOf('vips_tracked: failed to allocate 536870912 bytes'), [F.INTERNAL, false]);
  assert.deepEqual(await reasonOf('Input image exceeds pixel limit'), [F.UNDECODABLE, true]);
  assert.deepEqual(await reasonOf('VipsJpeg: premature end of JPEG image'), [F.UNDECODABLE, true]);
});

/* ── 8. Drive ตัวจริงของ lib/drive.js กับ server บนเครื่อง (ไม่มีคำขอออกนอกเครื่อง) ─────── */

test('getFileStream ของ lib/drive.js + googleapis ตัวจริง — 404/403 ถาวร · โควตา/5xx/ค้าง ไม่ถาวร · ไฟล์ดีผ่าน', async (t) => {
  const good = await noiseJpeg(640, 480);
  const json = (res, status, reason) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: status, message: reason, errors: [{ reason }] } }));
  };
  const seen = [];
  const server = http.createServer((req, res) => {
    const id = decodeURIComponent(new URL(req.url, 'http://x').pathname.split('/').pop());
    seen.push({ id, query: new URL(req.url, 'http://x').searchParams });
    if (id === 'drv-OK') { res.writeHead(200, { 'content-type': 'image/jpeg' }); res.end(good); return; }
    if (id === 'drv-GONE') { json(res, 404, 'notFound'); return; }
    if (id === 'drv-DENY') { json(res, 403, 'insufficientFilePermissions'); return; }
    if (id === 'drv-RATE') { json(res, 403, 'userRateLimitExceeded'); return; }
    if (id === 'drv-BAD') { json(res, 400, 'badRequest'); return; }
    if (id === 'drv-DOWN') { json(res, 503, 'backendError'); return; }
    if (id === 'drv-BODY') { res.writeHead(200, { 'content-type': 'image/jpeg' }); res.write(good.subarray(0, 500)); return; }
    // drv-HEAD: ไม่ตอบอะไรเลย
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const rootUrl = `http://127.0.0.1:${server.address().port}/`;

  // env ปลอมพอให้สร้าง client ได้ (ไม่มีการขอ token — ทุกคำขอถูกพาไปที่ client ไร้ auth ข้างล่าง)
  process.env.GOOGLE_WIF_AUDIENCE ||= '//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/v';
  process.env.GOOGLE_SA_EMAIL ||= 'test@example.iam.gserviceaccount.com';
  const { google } = await import('googleapis');
  const driveLib = await import('../drive.js');
  const local = google.drive({ version: 'v3' });
  const passed = [];
  // สลับเฉพาะปลายทาง: พารามิเตอร์และตัวเลือกที่ `getFileStream` ส่งมาถูกใช้ตามจริงทุกตัว
  driveLib.getDrive().files.get = (params, options) => {
    passed.push({ params, options });
    return local.files.get(params, { ...options, rootUrl });
  };

  const ids = ['OK', 'GONE', 'DENY', 'RATE', 'BAD', 'BODY', 'HEAD'];
  const store = fakeStore();
  const res = await prepareSurveyReportImages(store.supabase, ids.map((id) => fileRow(id, 'wide')), {
    storeAllowed: true, bucket: 'survey-report', getFileStream: driveLib.getFileStream, fileTimeoutMs: 400, concurrency: 7, log: quiet,
  });

  assert.deepEqual(res.failed.map((f) => [f.attId, f.reason, f.permanent]), [
    ['GONE', F.DRIVE_NOT_FOUND, true],
    ['DENY', F.DRIVE_FORBIDDEN, true],
    ['RATE', F.DRIVE_ERROR, false],
    ['BAD', F.DRIVE_ERROR, false],
    ['BODY', F.DRIVE_TIMEOUT, false],
    ['HEAD', F.DRIVE_TIMEOUT, false],
  ]);

  // 5xx: googleapis ลองซ้ำเองก่อนยอมแพ้ (จึงให้เพดานยาวกว่า) — จบเป็น "ไม่ถาวร" เสมอ
  const down = await prepareSurveyReportImages(store.supabase, [fileRow('DOWN', 'wide')], {
    storeAllowed: true, bucket: 'survey-report', getFileStream: driveLib.getFileStream, fileTimeoutMs: 20_000, log: quiet,
  });
  assert.deepEqual(down.failed, [{ attId: 'DOWN', fileName: 'DOWN.jpg', reason: F.DRIVE_ERROR, permanent: false }]);
  assert.ok(seen.filter((s) => s.id === 'drv-DOWN').length >= 1);
  assert.deepEqual(Object.keys(res.imageByAttId), ['OK']);
  assert.deepEqual([res.imageByAttId.OK.w, res.imageByAttId.OK.h], [640, 480]);
  assert.equal(store.uploads.length, 1);

  // สิ่งที่ lib/drive.js ส่งให้ googleapis: stream + signal ของไฟล์นั้น · และไปถึง Drive เป็น alt=media
  assert.equal(passed.length, 8);
  for (const call of passed) {
    assert.deepEqual(call.params, { fileId: call.params.fileId, alt: 'media', supportsAllDrives: true });
    assert.equal(call.options.responseType, 'stream');
    assert.ok(call.options.signal instanceof AbortSignal);
  }
  assert.ok(seen.every((s) => s.query.get('alt') === 'media' && s.query.get('supportsAllDrives') === 'true'));
});

test('🔴 ตัวถามตั้งต้น = drives.get ของ Shared Drive ผ่าน lib/drive.js ตัวจริง — service account หลุดจาก Shared Drive ไม่ทำให้การส่งผลถูกตีกลับ', async (t) => {
  const SHARED = '0ATestSharedDrive';
  const json = (res, status, reason) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: status, message: reason, errors: [{ reason }] } }));
  };
  // สิ่งที่ server บนเครื่องตอบ — สลับได้ระหว่างรอบ
  const world = { file: 404, drive: 404 };
  const seen = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').filter(Boolean); // drive / v3 / files|drives / <id>
    const [kind, id] = [parts.at(-2), decodeURIComponent(parts.at(-1))];
    seen.push({ kind, id, fields: url.searchParams.get('fields'), alt: url.searchParams.get('alt') });
    if (kind === 'drives') {
      if (world.drive === 200) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id })); return; }
      if (world.drive === 'hang') return; // ไม่ตอบ
      json(res, world.drive, world.drive === 404 ? 'notFound' : 'insufficientFilePermissions');
      return;
    }
    json(res, world.file, world.file === 404 ? 'notFound' : 'insufficientFilePermissions');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const rootUrl = `http://127.0.0.1:${server.address().port}/`;

  process.env.GOOGLE_WIF_AUDIENCE ||= '//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/v';
  process.env.GOOGLE_SA_EMAIL ||= 'test@example.iam.gserviceaccount.com';
  const before = process.env.GOOGLE_SHARED_DRIVE_ID;
  process.env.GOOGLE_SHARED_DRIVE_ID = SHARED;
  const { google } = await import('googleapis');
  const driveLib = await import('../drive.js');
  const client = driveLib.getDrive();
  const local = google.drive({ version: 'v3' });
  const real = { filesGet: client.files.get, drivesGet: client.drives.get };
  const probed = [];
  // สลับเฉพาะปลายทาง (ไม่มีคำขอออกนอกเครื่อง ไม่มีการขอ token) — พารามิเตอร์ที่โค้ดส่งมาถูกใช้ตามจริง
  client.files.get = (params, options) => local.files.get(params, { ...options, rootUrl });
  client.drives.get = (params, options) => { probed.push({ params, options }); return local.drives.get(params, { ...options, rootUrl }); };
  t.after(() => {
    client.files.get = real.filesGet;
    client.drives.get = real.drivesGet;
    if (before === undefined) delete process.env.GOOGLE_SHARED_DRIVE_ID; else process.env.GOOGLE_SHARED_DRIVE_ID = before;
    server.closeAllConnections();
    server.close();
  });

  // ⚠️ ไม่ส่ง getFileStream/probeDrive — เส้นเดียวกับที่ route เรียกจริง (`import('@/lib/drive')` ข้างในตัวเตรียมรูป)
  const files = ['P1', 'P2', 'P3'].map((id) => fileRow(id, 'wide'));
  const prepare = (opts = {}) => prepareSurveyReportImages(fakeStore().supabase, files, {
    storeAllowed: false, fileTimeoutMs: 400, log: quiet, ...opts,
  });

  // ① ทุกไฟล์ 404 และ Shared Drive ก็ 404 = service account หลุดจาก Shared Drive
  const lines = [];
  const outage = await prepare({ log: (line) => lines.push(line) });
  assert.deepEqual(outage.failed.map((f) => [f.attId, f.reason, f.permanent]), [
    ['P1', F.DRIVE_ERROR, false], ['P2', F.DRIVE_ERROR, false], ['P3', F.DRIVE_ERROR, false],
  ]);
  assert.equal(surveySendImageRefusal(outage.failed), null);
  assert.equal(probed.length, 1, 'ถามครั้งเดียว');
  assert.deepEqual(probed[0].params, { driveId: SHARED, fields: 'id' });
  assert.ok(probed[0].options.signal instanceof AbortSignal);
  assert.deepEqual(seen.filter((s) => s.kind === 'drives'), [{ kind: 'drives', id: SHARED, fields: 'id', alt: null }]);
  // บรรทัด log บอกเหตุที่คนดูแลระบบใช้ต่อได้ (สถานะ + เหตุของ Drive)
  const said = lines.find((line) => line.probe === 'drive_access');
  assert.deepEqual([said.ok, said.files], [false, 3]);
  assert.match(said.detail, /^HTTP 404 · .*notFound/);

  // ② ทุกไฟล์ 403 (ไม่ใช่โควตา) และ Shared Drive ก็ 403 · ③ ตัวถามค้าง = ไม่ถาวรเหมือนกัน
  Object.assign(world, { file: 403, drive: 403 });
  assert.ok((await prepare()).failed.every((f) => f.reason === F.DRIVE_ERROR && f.permanent === false));
  Object.assign(world, { file: 404, drive: 'hang' });
  assert.ok((await prepare()).failed.every((f) => f.reason === F.DRIVE_ERROR && f.permanent === false));

  // ④ Shared Drive เปิดได้ = Drive ปกติ ไฟล์หายจริง — ถาวร ตีกลับตามเดิม
  Object.assign(world, { file: 404, drive: 200 });
  const lost = await prepare();
  assert.deepEqual(lost.failed.map((f) => [f.attId, f.reason, f.permanent]), [
    ['P1', F.DRIVE_NOT_FOUND, true], ['P2', F.DRIVE_NOT_FOUND, true], ['P3', F.DRIVE_NOT_FOUND, true],
  ]);
  assert.match(surveySendImageRefusal(lost.failed), /^รูป 3 รูปเปิดไม่ได้/);
  assert.equal(probed.length, 4);

  // ⑤ ไม่ได้ตั้ง GOOGLE_SHARED_DRIVE_ID = ถามไม่ได้ = ปัญหาการตั้งค่าของระบบ ไม่ใช่ของไฟล์ · ไม่มีคำขอ drives.get ออกไป
  delete process.env.GOOGLE_SHARED_DRIVE_ID;
  const unset = await prepare();
  assert.ok(unset.failed.every((f) => f.reason === F.DRIVE_ERROR && f.permanent === false));
  assert.equal(probed.length, 4);
});

/* ── 9. น้ำหนักของโมดูล + รุ่นของ sharp ───────────────────────────────── */

test('import ไฟล์นี้ (และเรียกด้วยลิสต์ว่าง) ไม่โหลด sharp/googleapis — โหลดเมื่อมีรูปต้องเตรียมเท่านั้น', () => {
  const script = `
    import { createRequire } from 'node:module';
    const mod = await import(${JSON.stringify(path.join(WEBAPP, 'src/lib/service/surveyReportImages.js'))});
    const loaded = () => Object.keys(createRequire(import.meta.url).cache)
      .filter((file) => /node_modules\\/(sharp|@img|googleapis|gaxios)\\//.test(file)).length;
    const atImport = loaded();
    await mod.prepareSurveyReportImages({}, [], {});
    const afterEmpty = loaded();
    const res = await mod.prepareSurveyReportImages({}, [{ attId: 'A1', kind: 'wide', file: { id: 'A1', fileName: 'a.jpg' } }], { storeAllowed: false, bucket: 'b', log() {} });
    console.log(JSON.stringify({ atImport, afterEmpty, afterWork: loaded(), failed: res.failed }));
  `;
  const out = spawnSync(process.execPath, ['--import', './scripts/test-loader.mjs', '--input-type=module', '-e', script], {
    cwd: WEBAPP, encoding: 'utf8',
  });
  assert.equal(out.status, 0, out.stderr);
  const seen = JSON.parse(out.stdout.trim().split('\n').pop());
  assert.equal(seen.atImport, 0, 'import เฉย ๆ ต้องไม่โหลด sharp/googleapis');
  assert.equal(seen.afterEmpty, 0, 'ไม่มีรูปให้เตรียม ต้องไม่โหลด sharp');
  assert.ok(seen.afterWork > 0, 'มีรูปให้เตรียมจึงโหลด sharp');
  assert.deepEqual(seen.failed, [{ attId: 'A1', fileName: 'a.jpg', reason: F.NO_DRIVE_FILE, permanent: true }]);
});

test('ซอร์ส: sharp กับ lib/drive เข้ามาทาง await import() เท่านั้น', () => {
  const src = fs.readFileSync(path.join(WEBAPP, 'src/lib/service/surveyReportImages.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.match(src, /await import\('sharp'\)/);
  assert.match(src, /await import\('@\/lib\/drive'\)/);
  assert.doesNotMatch(src, /^import[^;]*from\s+['"](sharp|@\/lib\/drive|googleapis)['"]/m);
  assert.doesNotMatch(src, /puppeteer|chromium|htmlPdf/);
  // สูตรการย่อ (§5) — แก้ตัวเลขพวกนี้ = sha ของรูปเดิมเปลี่ยน รูปที่เก็บไว้ไม่ถูกใช้ซ้ำ
  assert.match(src, /failOn: 'error'/);
  assert.match(src, /\.rotate\(\)\s*\.flatten\(\{ background: '#ffffff' \}\)/);
  assert.match(src, /fit: 'inside', withoutEnlargement: true/);
  assert.match(src, /\.jpeg\(\{ quality: 72, mozjpeg: true \}\)\s*\.toBuffer\(\{ resolveWithObject: true \}\)/);
});

test('sharp ล็อกรุ่น 0.34.5 ตรงตัวใน dependencies และใน lock (ข้อ 19)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(WEBAPP, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies.sharp, '0.34.5', 'ต้องไม่มี ^ หรือ ~');
  assert.equal(pkg.devDependencies.sharp, undefined);

  const lock = JSON.parse(fs.readFileSync(path.join(WEBAPP, 'package-lock.json'), 'utf8'));
  assert.equal(lock.packages[''].dependencies.sharp, '0.34.5');
  const entry = lock.packages['node_modules/sharp'];
  assert.equal(entry.version, '0.34.5');
  assert.notEqual(entry.optional, true, 'เป็น dependency ตรงแล้ว — ต้องไม่ถูกข้ามตอนติดตั้ง');
  // ไบนารีของ Vercel (linux x64 glibc) ต้องอยู่ใน lock รุ่นเดียวกัน
  assert.equal(entry.optionalDependencies['@img/sharp-linux-x64'], '0.34.5');
  assert.equal(lock.packages['node_modules/@img/sharp-linux-x64'].version, '0.34.5');
  assert.equal(sharp.versions.sharp, '0.34.5', 'ตัวที่ติดตั้งอยู่ต้องเป็นรุ่นเดียวกับที่ล็อก');
});
