// ── รูปของรายงานการประเมินพื้นที่ — ดึงจาก Drive · ย่อ · เก็บตามเนื้อไฟล์ (PR-2 §5 · ข้อ 19 · ข้อ 25) ──────
//
// ⭐ **ตัวเดียว สามผู้เรียก** — รอบตรวจรูปก่อนส่งผล (60 วิ · ก่อนเขียนอะไรทั้งสิ้น) · รอบเติมหลังล็อกคำตอบ (20 วิ ·
//   ส่ง `have` = แผนที่ของรอบแรก ไฟล์เดิมไม่ถูกดึงซ้ำ) · ปุ่ม "ออกเอกสาร" ของใบที่ส่งไปแล้ว (180 วิ)
//
// 🔴 **ความล้มเหลวมีสองชนิด และผู้เรียกปฏิบัติต่างกัน** (มติเจ้าของข้อ 2):
//   `permanent: true`  ตัวไฟล์เองคือปัญหา — ถอดรหัสไม่ได้ (HEIC ที่ตั้งชื่อ .jpg · JPEG ขาดท้าย) · หายจาก Drive (404) ·
//                      ไม่มีสิทธิ์เปิด (403) · แถวไม่มี `driveFileId` · ใหญ่เกินเพดานอัป ⇒ รอบตรวจ **ปฏิเสธการส่งผล**
//                      ตอนที่ใบยังแก้ได้ (หลังล็อกแล้วหัวหน้าเปลี่ยนไฟล์ไม่ได้ ทางออกเดียวคือดึงผลกลับ)
//   `permanent: false` ระบบคือปัญหา — Drive ช้า/ล่ม · ที่เก็บอัปไม่ขึ้น · หมดเวลา · โหลด `sharp` ไม่ได้ ⇒ **ไม่ปฏิเสธ**
//                      ผลประเมินต้องถึงฝ่ายขายเสมอ เอกสารออกตามทีหลังได้
//
// 🔴 **404/403 เป็นของ "ไฟล์" ต่อเมื่อรอบนี้พิสูจน์ได้ว่าระบบยังเข้า Drive ได้** — service account ที่หลุดจาก Shared Drive
//   ได้ 404/403 กับ **ทุกไฟล์** หน้าตาเดียวกับไฟล์ที่ถูกลบ · ถ้านับเป็นถาวร ทุกการส่งผลจะถูกตีกลับด้วย "อัปใหม่เป็น JPG"
//   (อัปใหม่ก็ไม่หาย) และปุ่มออกเอกสารจะบอกให้ดึงผลกลับโดยไม่จำเป็น ⇒ รอบที่ **ไม่มีไฟล์ไหนดึงได้เลย** และมี 404/403
//   จะถาม Drive หนึ่งครั้ง (`drives.get` ของ Shared Drive) — ถามไม่ผ่าน = ทั้งชุดนั้นกลายเป็น `drive_error` (ไม่ถาวร)
//
// 🔴 **ไม่มีทางโยน error เข้า route** — ทุกทางล้มกลับมาเป็นแถวใน `failed`
//
// 🔴 **`sharp` โหลดด้วย `await import()` ข้างในฟังก์ชันเท่านั้น** (ข้อ 24) — มันโยนตั้งแต่ตอนโหลดถ้าไม่มีไบนารีของ
//   แพลตฟอร์ม (`node_modules/sharp/lib/sharp.js`) ⇒ import ไว้หัวไฟล์ = ทุก route ที่เห็นไฟล์นี้ตายพร้อมกัน
//   `lib/drive` (googleapis) ก็โหลดช้าแบบเดียวกัน
//
// 🔴 **อัปขึ้น bucket ต่อเมื่อ `storeAllowed` เป็นจริง** (§0 — เขียนถาวรได้เฉพาะ production) · ปิดอยู่ = ยังดึง ยังย่อ
//   ยังคืน sha/ขนาด (รอบตรวจยังจับไฟล์เสียได้) แต่ **ไม่อัปอะไรเลย**
//
// ที่เก็บ: `img/<sha256 ของไฟล์ที่ย่อแล้ว>.jpg` — อ้างด้วยเนื้อไฟล์ ⇒ ส่งใหม่หลังดึงกลับใช้รูปเดิมซ้ำ
//   ("มีอยู่แล้ว" = สำเร็จ ไม่งั้นทุกการส่งใหม่จะล้ม) · bucket รับเฉพาะ JPEG กับ PDF (0401) ⇒ ทุกรูปออกเป็น JPEG พื้นขาว
//
// ⭐ **ลายเซ็นของผู้ลงนาม** (PR-SIG §3.2 · มติเจ้าของ 09/10/2026) — `prepareSurveyReportSignatures` ท้ายไฟล์: อ่าน PNG จากคลังลายเซ็น
//   (`signature-assets` · อ่านอย่างเดียว) → ตรวจว่าตรงกับที่บันทึก → ถมพื้นขาว ย่อ → ตรวจว่ามีหมึก → JPEG → เก็บที่ `img/<sha>.jpg` ถังเดียวกับรูป
//   สัญญาเดียวกับรูปทุกข้อ: ความล้มเหลวสองชนิด · ไม่โยน · `sharp` โหลดแบบ lazy · อัปต่อเมื่อด่านเขียนถาวรเปิด
import 'server-only';
import { createHash } from 'node:crypto';
import { MAX_UPLOAD_BYTES } from '@/lib/master/attachmentTypes';
import { SIGNATURE_BUCKET, isSignatureStoragePathForUser } from '@/lib/signatures';
import { MAX_BYTES } from '@/lib/upload/limits';
import { timeoutSignal } from '@/lib/timeoutSignal';
import { SURVEY_REPORT_BUCKET, surveyReportStoreAllowed } from './surveyReportRows';

/** ด้านยาวสุดของรูปที่เก็บ (px) — ภาพผังต้องอ่านตัวหนังสือบนแบบได้จึงใหญ่กว่า */
export const SURVEY_IMAGE_PLAN_EDGE = 1600;
export const SURVEY_IMAGE_EDGE = 1000;

/** เพดานเวลาต่อไฟล์ (Drive ค้าง · ที่เก็บค้าง) — ตัวเลขเดียวกับที่สถานะ `issuing` ใช้คิด 180 วินาที (§1) */
export const SURVEY_IMAGE_FILE_TIMEOUT_MS = 30_000;

/** เพดานเวลาของคำถาม "ระบบยังเข้า Drive ได้ไหม" (คำขอเดียว ไม่มีเนื้อไฟล์) — ไม่เกินเพดานต่อไฟล์ของรอบนั้น */
export const SURVEY_IMAGE_PROBE_TIMEOUT_MS = 10_000;

/* เพดานขนาดต้นฉบับ = เพดานที่ **server บังคับจริง** ตอนอัป (`lib/upload/limits` — ตั้งผ่าน env ได้) แต่ไม่ต่ำกว่าค่ากลาง
   ⇒ ไฟล์ที่ระบบรับอัปมาแล้วไม่มีวันถูกฟ้องว่า "ใหญ่เกิน" ที่นี่ · เกินกว่านี้ = ไฟล์ที่ไม่ได้มาทางอัปปกติ หยุดอ่านทันที */
const ORIGINAL_CAP_BYTES = Math.max(MAX_BYTES, MAX_UPLOAD_BYTES);

/** เหตุใน `failed[].reason` — ผู้เรียกแยกชนิดด้วย `permanent` · แยก "หมดงบเวลา" ด้วย `timeout` */
export const SURVEY_IMAGE_FAILURE = Object.freeze({
  // ตัวไฟล์คือปัญหา
  NO_DRIVE_FILE: 'no_drive_file',
  DRIVE_NOT_FOUND: 'drive_not_found',
  DRIVE_FORBIDDEN: 'drive_forbidden',
  TOO_LARGE: 'too_large',
  UNDECODABLE: 'undecodable',
  // ระบบคือปัญหา
  TIMEOUT: 'timeout',               // งบเวลาของทั้งรอบหมดก่อนถึงคิวไฟล์นี้ (ยังไม่ได้ลอง)
  DRIVE_TIMEOUT: 'drive_timeout',   // ไฟล์นี้ค้างเกินเพดานต่อไฟล์
  DRIVE_ERROR: 'drive_error',       // 5xx · 429 · โควตา · เครือข่าย · โหลด lib/drive ไม่ได้ · 404/403 ตอนที่ระบบเข้า Drive ไม่ได้ทั้งก้อน
  UPLOAD_FAILED: 'upload_failed',
  SHARP_UNAVAILABLE: 'sharp_unavailable',
  INTERNAL: 'prepare_failed',       // เหตุที่ไม่รู้จัก · หน่วยความจำไม่พอ
});
const F = SURVEY_IMAGE_FAILURE;

/** ที่อยู่ของรูปใน bucket — ที่เดียว ตัวพิมพ์ PDF อ่านกลับด้วยฟังก์ชันนี้ */
export const surveyReportImagePath = (sha) => `img/${sha}.jpg`;

class ImageFailure extends Error {
  constructor(reason, permanent, cause) {
    super(String(cause?.message || reason));
    this.reason = reason;
    this.permanent = permanent;
  }
}
const failure = (reason, permanent, cause = null) => new ImageFailure(reason, permanent, cause);

const list = (v) => (Array.isArray(v) ? v : []);
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const elapsed = (from) => Math.round(performance.now() - from);

/* ── sharp ─────────────────────────────────────────────────────────── */

const importSharp = async () => (await import('sharp')).default;

// ตัวที่ลองแล้วว่าเข้ารหัส JPEG ได้จริง (ต่อ instance ของฟังก์ชัน) — ลองครั้งเดียวต่อ process
const sharpChecked = new WeakSet();

/**
 * โหลด `sharp` แล้วลองเข้ารหัสรูป 2×2 หนึ่งครั้ง — แยก "sharp ใช้ไม่ได้ทั้งเครื่อง" (ระบบ · ไม่ปฏิเสธการส่งผล)
 * ออกจาก "ไฟล์นี้ถอดรหัสไม่ได้" (ไฟล์ · ปฏิเสธ) · ไม่มีขั้นนี้ ไบนารีที่โหลดขึ้นแต่เข้ารหัสไม่ได้จะทำให้ทุกรูป
 * ถูกฟ้องว่า "เปิดไม่ได้ อัปใหม่เป็น JPG" ทั้งที่ไฟล์ไม่ผิด
 */
async function readySharp(loadSharp) {
  const sharp = await loadSharp();
  if (typeof sharp !== 'function') throw new Error('sharp โหลดมาไม่ใช่ฟังก์ชัน');
  if (!sharpChecked.has(sharp)) {
    await sharp({ create: { width: 2, height: 2, channels: 3, background: '#808080' } })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
    sharpChecked.add(sharp);
  }
  return sharp;
}

/**
 * 🔑 **ย่อรูปหนึ่งรูปเป็นไฟล์ที่เอกสารใช้** — หมุนตาม EXIF · ถมพื้นขาว (PNG โปร่งใส) · ย่อให้ด้านยาวไม่เกินเพดาน
 * (ไม่ขยายรูปเล็ก) · JPEG คุณภาพ 72
 * ⚠️ `failOn: 'error'` — JPEG ที่ขาดท้ายต้อง **ล้ม** ไม่ใช่ออกมาเป็นรูปครึ่งเทา (ค่าตั้งต้นของ libvips ยอมให้ผ่าน)
 * ⚠️ `w`/`h` มาจาก **ผลลัพธ์** (หลังหมุนแล้ว) — ตัวเรนเดอร์เลือก cover/contain จากสองค่านี้
 * @param kind `'plan'` = 1600 px · อื่น ๆ (`'wide'`, `'spot'`) = 1000 px
 * @returns `{ data: Buffer, sha, w, h, bytes }` · โยนเมื่อถอดรหัสไม่ได้
 */
export async function downscaleSurveyImage(buffer, kind, { sharp = null } = {}) {
  const lib = sharp || await importSharp();
  const edge = kind === 'plan' ? SURVEY_IMAGE_PLAN_EDGE : SURVEY_IMAGE_EDGE;
  const { data, info } = await lib(buffer, { failOn: 'error' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data, sha: sha256(data), w: info.width, h: info.height, bytes: data.length };
}

// ข้อความของ libvips/glib เมื่อจองหน่วยความจำไม่ได้ ("out of memory --- size == 512 MiB" · "failed to allocate N bytes")
const OUT_OF_MEMORY = /out of memory|failed to allocate|unable to allocate|cannot allocate|ENOMEM/i;

/* ── Drive ─────────────────────────────────────────────────────────── */

/** แข่งกับ signal — promise ที่ค้างไม่มีวันจบ (Drive ไม่ตอบ · stream ไม่ไหล) ต้องไม่ลากทั้งรอบค้างตาม */
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

const destroy = (stream) => {
  if (stream && typeof stream.destroy === 'function' && !stream.destroyed) {
    try { stream.destroy(); } catch { /* ปิดไม่ได้ก็ปล่อย — ไม่มีอะไรต้องกู้ */ }
  }
};

/** อ่านเนื้อไฟล์เข้า Buffer · เกิน `cap` = หยุดอ่านทันที (ไม่ดูดไฟล์ 300 MB เข้าหน่วยความจำก่อนแล้วค่อยรู้) */
async function readBody(body, cap) {
  if (body instanceof Uint8Array) { // ตัวปลอมของ harness/เทสต์คืน Buffer ตรง ๆ ได้
    if (body.length > cap) throw failure(F.TOO_LARGE, true);
    return Buffer.from(body.buffer, body.byteOffset, body.length);
  }
  if (!body || typeof body[Symbol.asyncIterator] !== 'function') throw new Error('Drive ไม่ได้คืน stream');
  const chunks = [];
  let size = 0;
  for await (const chunk of body) {
    const part = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += part.length;
    if (size > cap) throw failure(F.TOO_LARGE, true); // ออกจาก for await = stream ถูกปิดให้เอง
    chunks.push(part);
  }
  return Buffer.concat(chunks, size);
}

const driveStatus = (err) => {
  for (const value of [err?.status, err?.response?.status, err?.code]) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 100 && n <= 599) return n;
  }
  return null;
};

/* 403 ของ Drive มีสองความหมาย: "ไฟล์นี้เปิดไม่ได้" (ถาวร) กับ "ยิงถี่เกิน/โควตาหมด/ยังไม่เปิด API" (ระบบ)
   เหตุอยู่ใน `errors[].reason` — คำขอแบบ stream ได้เนื้อคำตอบกลับมาเป็นสตริง JSON (`gaxios`) จึงค้นจากข้อความรวม */
const DRIVE_BUSY = /rate ?limit|quota|dailyLimit|accessNotConfigured|backendError/i;
const driveErrorText = (err) => {
  const data = err?.response?.data;
  let body = '';
  if (typeof data === 'string') body = data;
  else if (data && typeof data === 'object' && !(typeof data.pipe === 'function')) {
    try { body = JSON.stringify(data); } catch { body = ''; }
  }
  const reasons = list(err?.errors).map((e) => e?.reason || '').join(' ');
  return `${err?.message || ''} ${reasons} ${body}`.slice(0, 4000);
};

function driveFailure(err) {
  const status = driveStatus(err);
  const message = String(err?.message || '');
  if (status === 404 || (status === null && /notFound|File not found/i.test(message))) {
    return failure(F.DRIVE_NOT_FOUND, true, err);
  }
  if (status === 403 && !DRIVE_BUSY.test(driveErrorText(err))) return failure(F.DRIVE_FORBIDDEN, true, err);
  return failure(F.DRIVE_ERROR, false, err);
}

/* ── Drive: ไฟล์หาย หรือระบบมองไม่เห็น Drive ทั้งก้อน ─────────────────── */

// เหตุที่ Drive ตอบเหมือนกันทั้งสองกรณี — แยกได้ด้วยการถาม Drive เรื่องอื่นเท่านั้น
const DRIVE_ACCESS_REASONS = new Set([F.DRIVE_NOT_FOUND, F.DRIVE_FORBIDDEN]);

/**
 * ตัวถามตั้งต้น: "เห็น Shared Drive ของระบบไหม" — คำขอเดียวกับขั้น "เข้าถึง Shared Drive ได้" ของหน้าตรวจการเชื่อมต่อ
 * (`driveHealth` ใน `lib/driveMaintenance.js`) · ผ่าน = token · service account · สมาชิกภาพของ Shared Drive ครบสาย
 * @returns ฟังก์ชัน `({ signal }) => Promise` (โยน = เข้าไม่ได้) หรือ `null` เมื่อโมดูลที่ได้มาไม่มี `getDrive`
 */
function sharedDriveProbe(driveLib) {
  if (typeof driveLib?.getDrive !== 'function') return null;
  return async ({ signal }) => {
    const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;
    if (!driveId) throw new Error('ยังไม่ได้ตั้ง GOOGLE_SHARED_DRIVE_ID');
    await driveLib.getDrive().drives.get({ driveId, fields: 'id' }, { signal });
  };
}

/** ถามหนึ่งครั้ง มีเพดานเวลา ไม่โยน — `{ ok, ms, detail }` · ค้าง/โยน/ตอบอะไรที่ไม่ใช่สำเร็จ = `ok: false` */
async function askDriveAccess(probe, timeoutMs) {
  const { signal, clear } = timeoutSignal(timeoutMs);
  const mark = performance.now();
  try {
    await abortable(Promise.resolve().then(() => probe({ signal })), signal);
    return { ok: true, ms: elapsed(mark), detail: '' };
  } catch (err) {
    if (signal.aborted) return { ok: false, ms: elapsed(mark), detail: 'ไม่ตอบภายในเพดานเวลา' };
    // googleapis ทิ้ง `message` ว่างได้เมื่อ `errors[]` ไม่มีข้อความ — เหตุจริงอยู่ในสถานะกับ `errors[].reason`
    const status = driveStatus(err);
    const text = driveErrorText(err).replace(/\s+/g, ' ').trim().slice(0, 200) || String(err);
    return { ok: false, ms: elapsed(mark), detail: `${status ? `HTTP ${status} · ` : ''}${text}` };
  } finally {
    clear();
  }
}

/** ดึงไฟล์ต้นฉบับหนึ่งไฟล์ — เพดานเวลาครอบทั้งการรอหัวคำตอบและการไหลของเนื้อไฟล์ */
async function fetchOriginal(getFileStream, driveFileId, { timeoutMs, cap }) {
  const { signal, clear } = timeoutSignal(timeoutMs);
  let stream = null;
  try {
    const opening = Promise.resolve().then(() => getFileStream(driveFileId, { signal }));
    // หมดเวลาไปก่อนแล้ว stream ค่อยมา = ปิดทิ้ง ไม่ปล่อย socket ค้าง
    opening.then((late) => { if (signal.aborted) destroy(late); }, () => {});
    stream = await abortable(opening, signal);
    return await abortable(readBody(stream, cap), signal);
  } catch (err) {
    if (err instanceof ImageFailure) throw err;
    if (signal.aborted) throw failure(F.DRIVE_TIMEOUT, false, err);
    throw driveFailure(err);
  } finally {
    clear();
    destroy(stream);
  }
}

/* ── ที่เก็บ ───────────────────────────────────────────────────────── */

// ไฟล์ค้างอยู่แล้ว (รอบก่อน · Rev ก่อน · อีกคำขอที่วิ่งคู่กัน) = ใช้ได้ — กติกาเดียวกับ `issuedQuotationPdf.js`
const alreadyStored = (error) => /exists|duplicate|already/i.test(`${error?.message || ''} ${error?.error || ''}`);

async function uploadImage(supabase, bucket, out, timeoutMs) {
  const { signal, clear } = timeoutSignal(timeoutMs);
  let result;
  try {
    result = await abortable(
      Promise.resolve().then(() => supabase.storage.from(bucket).upload(
        surveyReportImagePath(out.sha), out.data, { contentType: 'image/jpeg', upsert: false },
      )),
      signal,
    );
  } catch (err) {
    throw failure(F.UPLOAD_FAILED, false, err);
  } finally {
    clear();
  }
  // supabase ไม่โยน — ต้องอ่าน { error } เอง
  if (result?.error && !alreadyStored(result.error)) throw failure(F.UPLOAD_FAILED, false, result.error);
}

/* ── ตัวหลัก ───────────────────────────────────────────────────────── */

/** `deadline` = จุดเวลา (epoch ms หรือ Date) · เลขต่ำกว่า 1e11 = "อีกกี่ ms จากนี้" (ผู้เรียกส่งงบ 60_000 มาตรง ๆ ได้) */
function deadlineAt(deadline, now) {
  if (deadline === null || deadline === undefined) return null;
  if (deadline instanceof Date) return deadline.getTime();
  const n = Number(deadline);
  if (!Number.isFinite(n)) return null;
  return n < 1e11 ? now() + n : n;
}

const preparedIn = (have, attId) => {
  if (!have) return null;
  const hit = have instanceof Map ? have.get(attId) : have[attId];
  return hit && hit.sha ? hit : null;
};

const defaultLog = (line) => console.info('[survey-report] image', JSON.stringify(line));

/**
 * 🔑 **เตรียมรูปของเอกสาร** — ดึงจาก Drive · ย่อ · เก็บ `img/<sha>.jpg` · คืนแผนที่ที่ `buildSurveyReportSnapshot` ใช้
 *
 * @param supabase  service-role client (ใช้เฉพาะ `storage.from(bucket).upload`)
 * @param files     `[{ attId, kind: 'wide'|'plan'|'spot', file }]` จาก `surveyReportImageFiles` (`file` = แถว attachments)
 * @param opts.deadline       งบเวลาของทั้งรอบ — epoch ms / Date / หรือจำนวน ms จากนี้ · **ตรวจก่อนเริ่มแต่ละชุด**:
 *                            หมดแล้ว = ไฟล์ที่เหลือทั้งหมดเป็น `timeout` (ชุดที่เริ่มไปแล้วทำต่อจนจบ — เกินได้ไม่เกินเพดานต่อไฟล์)
 * @param opts.concurrency    ขนาดชุด (ค่าตั้งต้น 4)
 * @param opts.have           แผนที่ `imageByAttId` ของรอบก่อน (object หรือ Map) — id ที่มีแล้วไม่ถูกดึงซ้ำ และติดกลับไปในผล
 * @param opts.storeAllowed   ด่านเขียนถาวร — **`true` เท่านั้นจึงอัป** · ไม่ส่ง = `surveyReportStoreAllowed()` (production เท่านั้น)
 * @param opts.bucket         ไม่ส่ง = `SURVEY_REPORT_BUCKET`
 * @param opts.getFileStream  ตัวดึงไฟล์ `(driveFileId, { signal })` — ไม่ส่ง = `lib/drive` (โหลดเมื่อมีไฟล์ต้องดึงเท่านั้น)
 * @param opts.probeDrive     ตัวถาม "ระบบยังเข้า Drive ได้ไหม" `({ signal }) => Promise` (โยน = เข้าไม่ได้) — ถูกเรียก **ไม่เกินหนึ่งครั้ง**
 *                            และเฉพาะรอบที่ไม่มีไฟล์ไหนดึงได้เลยแต่มี 404/403 · ไม่ผ่าน = 404/403 ชุดนั้นกลายเป็น `drive_error` (ไม่ถาวร)
 *                            · ไม่ส่ง = ของ `lib/drive` (`drives.get` ของ Shared Drive) **เมื่อตัวดึงไฟล์เป็นของ `lib/drive` ด้วย** ·
 *                            ส่ง `getFileStream` ของตัวเองมาโดยไม่ส่งตัวถาม = ไม่มีอะไรให้ถาม 404/403 ถาวรตามที่ Drive ตอบ
 *                            ⚠️ เกินงบเวลาของรอบได้อีกไม่เกิน `SURVEY_IMAGE_PROBE_TIMEOUT_MS`
 * @param opts.loadSharp      ตัวโหลด sharp — ไม่ส่ง = `await import('sharp')`
 * @param opts.fileTimeoutMs  เพดานต่อไฟล์ (ค่าตั้งต้น 30 วิ) · `now` · `log` = จุดเสียบของเทสต์
 * @returns `{ imageByAttId: { [attId]: { sha, w, h, bytes } }, failed: [{ attId, fileName, reason, permanent }] }`
 *   · ทั้งสองเรียงตามลำดับของ `files` · attId ซ้ำใน `files` นับครั้งเดียว · **ไม่โยน**
 */
export async function prepareSurveyReportImages(supabase, files, opts = {}) {
  const {
    deadline = null, concurrency = 4, have = null, storeAllowed, bucket = SURVEY_REPORT_BUCKET,
    getFileStream = null, probeDrive = null, loadSharp = importSharp,
    fileTimeoutMs = SURVEY_IMAGE_FILE_TIMEOUT_MS, now = Date.now, log = defaultLog,
  } = opts || {};

  const doneById = new Map();
  const failedById = new Map();
  const entries = [];
  const seen = new Set();
  for (const item of list(files)) {
    const attId = String(item?.attId ?? item?.file?.id ?? '');
    if (!attId || seen.has(attId)) continue;
    seen.add(attId);
    entries.push({ attId, kind: item?.kind, file: item?.file || {} });
  }
  const fail = (entry, reason, permanent) => failedById.set(entry.attId, {
    attId: entry.attId,
    fileName: String(entry.file?.fileName || entry.attId),
    reason,
    permanent,
  });
  // ประกอบผลตามลำดับของ `files` — ไม่ขึ้นกับว่าไฟล์ไหนย่อเสร็จก่อน (ผลนิ่ง เทียบสองรอบได้)
  const result = () => {
    const imageByAttId = {};
    const failed = [];
    for (const entry of entries) {
      if (doneById.has(entry.attId)) imageByAttId[entry.attId] = doneById.get(entry.attId);
      else if (failedById.has(entry.attId)) failed.push(failedById.get(entry.attId));
    }
    return { imageByAttId, failed };
  };
  const say = (line) => { try { log(line); } catch { /* log พังต้องไม่ทำให้รูปพัง */ } };

  try {
    const endAt = deadlineAt(deadline, now);
    const todo = [];
    for (const entry of entries) {
      const hit = preparedIn(have, entry.attId);
      if (hit) doneById.set(entry.attId, hit);
      else todo.push(entry);
    }
    if (!todo.length) return result();

    let sharp;
    try {
      sharp = await readySharp(loadSharp);
    } catch (err) {
      console.error('[survey-report] โหลด sharp ไม่ได้ — ยังไม่ได้เตรียมรูป', err?.message);
      todo.forEach((entry) => fail(entry, F.SHARP_UNAVAILABLE, false));
      return result();
    }

    let fetchStream = getFileStream;
    let probe = typeof probeDrive === 'function' ? probeDrive : null;
    if (typeof fetchStream !== 'function' && todo.some((entry) => entry.file?.driveFileId)) {
      try {
        const driveLib = await import('@/lib/drive');
        fetchStream = driveLib.getFileStream;
        probe = probe || sharedDriveProbe(driveLib);
      } catch (err) {
        console.error('[survey-report] โหลดตัวต่อ Drive ไม่ได้ — ยังไม่ได้เตรียมรูป', err?.message);
        fetchStream = () => { throw failure(F.DRIVE_ERROR, false, err); };
      }
    }

    // ด่านเขียนถาวร (§0) — ต้องเป็น `true` ตรงตัว ค่าอื่นทุกค่า = ไม่อัป
    const store = (storeAllowed === undefined ? surveyReportStoreAllowed() : storeAllowed) === true;
    // สองไฟล์ที่เนื้อเดียวกัน (รูปเดียวอัปสองครั้ง) = sha เดียว อัปครั้งเดียว
    const uploads = new Map();
    const storeOnce = (out) => {
      if (!uploads.has(out.sha)) uploads.set(out.sha, uploadImage(supabase, bucket, out, fileTimeoutMs));
      return uploads.get(out.sha);
    };

    // รอบนี้ Drive ส่งเนื้อไฟล์มาครบอย่างน้อยหนึ่งไฟล์ = ระบบยังเข้า Drive ได้ ⇒ 404/403 ของไฟล์อื่นเป็นเรื่องของไฟล์นั้นเอง
    let driveReached = false;

    const one = async (entry) => {
      const line = { attId: entry.attId, kind: entry.kind, ok: false };
      try {
        const driveFileId = entry.file?.driveFileId;
        if (!driveFileId) throw failure(F.NO_DRIVE_FILE, true);

        let mark = performance.now();
        let original = await fetchOriginal(fetchStream, driveFileId, { timeoutMs: fileTimeoutMs, cap: ORIGINAL_CAP_BYTES });
        driveReached = true;
        line.fetchMs = elapsed(mark);
        line.inBytes = original.length;

        mark = performance.now();
        let out;
        try {
          out = await downscaleSurveyImage(original, entry.kind, { sharp });
        } catch (err) {
          // หน่วยความจำไม่พอ = เครื่อง ไม่ใช่ไฟล์ — ห้ามบอกหัวหน้าว่า "รูปเปิดไม่ได้"
          if (OUT_OF_MEMORY.test(String(err?.message || ''))) throw failure(F.INTERNAL, false, err);
          throw failure(F.UNDECODABLE, true, err);
        } finally {
          original = null; // ต้นฉบับ (สูงสุด 25 MB ต่อไฟล์) ปล่อยทันทีที่ย่อเสร็จ ไม่ถือข้ามการอัป
        }
        line.resizeMs = elapsed(mark);
        line.outBytes = out.bytes;

        if (store) {
          mark = performance.now();
          await storeOnce(out);
          line.uploadMs = elapsed(mark);
        }
        doneById.set(entry.attId, { sha: out.sha, w: out.w, h: out.h, bytes: out.bytes });
        line.ok = true;
        line.stored = store;
      } catch (err) {
        const known = err instanceof ImageFailure ? err : failure(F.INTERNAL, false, err);
        fail(entry, known.reason, known.permanent);
        line.reason = known.reason;
        line.detail = String(known.message || '').split('\n').pop().slice(0, 200);
      }
      say(line);
    };

    const size = Math.max(1, Math.floor(Number(concurrency)) || 4);
    for (let i = 0; i < todo.length; i += size) {
      if (endAt !== null && now() >= endAt) {
        todo.slice(i).forEach((entry) => fail(entry, F.TIMEOUT, false));
        break;
      }
      await Promise.all(todo.slice(i, i + size).map(one));
    }

    /* 🔴 ไม่มีไฟล์ไหนดึงได้เลย และมี 404/403 = ยังบอกไม่ได้ว่า "ไฟล์หาย" หรือ "ระบบเข้า Drive ไม่ได้" — ถามหนึ่งครั้ง
       ถามผ่าน = Drive ปกติ ไฟล์พวกนั้นหาย/ถูกปิดสิทธิ์จริง (ถาวร ตีกลับ) · ถามไม่ผ่านไม่ว่าด้วยเหตุใด = ปัญหาของระบบ (มติเจ้าของ
       ข้อ 2: ไม่ตีกลับ) ⇒ ผลประเมินไปถึงฝ่ายขาย ขั้นออกเลขตอบ `images_failed` ให้กดใหม่ · ไฟล์ที่หายจริงแต่ถามไม่ผ่านรอบนี้
       จะถูกจับได้ที่รอบเติมหลังล็อก/ปุ่มออกเอกสาร (รอบนั้นถามใหม่) — ทางออกคือดึงผลกลับตามเดิม (§11 แถว 4) */
    const suspects = todo.filter((entry) => DRIVE_ACCESS_REASONS.has(failedById.get(entry.attId)?.reason));
    if (suspects.length && !driveReached && probe) {
      const access = await askDriveAccess(probe, Math.min(fileTimeoutMs, SURVEY_IMAGE_PROBE_TIMEOUT_MS));
      if (!access.ok) {
        console.error(`[survey-report] Drive ตอบ 404/403 กับ ${suspects.length} ไฟล์ ไม่มีไฟล์ไหนดึงได้ และถาม Shared Drive ไม่ผ่าน`
          + ' — ถือเป็นปัญหาการเข้าถึง Drive ของระบบ ไม่ใช่ของไฟล์ (ตรวจสิทธิ์ service account ใน Shared Drive)', access.detail);
        suspects.forEach((entry) => fail(entry, F.DRIVE_ERROR, false));
      }
      say({ probe: 'drive_access', ok: access.ok, ms: access.ms, files: suspects.length, ...(access.ok ? {} : { detail: access.detail }) });
    }
    return result();
  } catch (err) {
    // ไม่ควรมาถึง — ทุกขั้นข้างบนจับของตัวเองแล้ว · กันไว้เพราะสัญญาคือ "ไม่โยนเข้า route"
    console.error('[survey-report] เตรียมรูปล้มกลางทาง', err?.message);
    for (const entry of entries) {
      if (!doneById.has(entry.attId) && !failedById.has(entry.attId)) fail(entry, F.INTERNAL, false);
    }
    return result();
  }
}

/* ══ ลายเซ็นของผู้ลงนาม (PR-SIG §3.2) ═══════════════════════════════════════════════════════ */

/** กรอบของลายเซ็นที่เก็บ (px) — พอสำหรับช่อง 45px บนกระดาษที่ 300 dpi · ลายเซ็นที่เล็กกว่านี้ไม่ถูกขยาย */
export const SURVEY_SIGN_MAX_WIDTH = 600;
export const SURVEY_SIGN_MAX_HEIGHT = 200;

/** คุณภาพ JPEG ของลายเซ็น — สูงกว่ารูปถ่าย (72): เส้นปากกาบนพื้นขาวเห็นรอยบีบอัดง่าย และไฟล์เล็กอยู่แล้ว */
export const SURVEY_SIGN_JPEG_QUALITY = 90;

/**
 * ด่าน "มีหมึกไหม" — นับพิกเซลที่ **เข้มกว่า** `SURVEY_SIGN_INK_LEVEL` (ระดับเทา 0–255) บนรูปที่ถมพื้นขาวและย่อแล้ว ·
 * น้อยกว่า `SURVEY_SIGN_INK_MIN_PIXELS` = ว่างหรือจางเกินไป
 * 🔴 คลังลายเซ็นตรวจแค่โครงสร้างกับขนาดของ PNG (`inspectSignaturePng`) — PNG โปร่งใสทั้งแผ่นหรือเส้นสีเทาอ่อนผ่านคลังได้
 *    แล้วจะกลายเป็นช่องขาวบนกระดาษที่ตรึงแล้วแก้ไม่ได้ · ตัวเลขสองตัวนี้ยังไม่ได้เทียบกับลายเซ็นจริง (สเปก §11)
 */
export const SURVEY_SIGN_INK_LEVEL = 160;
export const SURVEY_SIGN_INK_MIN_PIXELS = 50;

/** เพดานเวลาของการอ่านไฟล์ลายเซ็นหนึ่งไฟล์ และของการเก็บสำเนาหนึ่งไฟล์ (ไฟล์ไม่เกิน 1 MB — สั้นกว่ารูปถ่ายจาก Drive) */
export const SURVEY_SIGN_FILE_TIMEOUT_MS = 10_000;

/** เหตุใน `failed[].reason` ของ `prepareSurveyReportSignatures` — แยกจาก `SURVEY_IMAGE_FAILURE` (ผู้เรียกของรูปล็อกชุดนั้นไว้) */
export const SURVEY_SIGN_FAILURE = Object.freeze({
  // ตัวไฟล์/แถวของลายเซ็นคือปัญหา — เจ้าของลายเซ็นต้องอัปโหลดใหม่
  PATH: 'sign_path',                 // ที่อยู่ไฟล์ไม่อยู่ใต้โฟลเดอร์ของเจ้าของ (แถวถูกแก้มือ/ข้อมูลเพี้ยน) — ไม่อ่านไฟล์
  MISSING: 'sign_missing',           // ไม่มีไฟล์นี้ในคลัง
  MISMATCH: 'sign_mismatch',         // เนื้อไฟล์ไม่ตรงกับ sha256 ที่บันทึกตอนอัปโหลด
  UNDECODABLE: 'sign_undecodable',   // ถอดรหัสไม่ได้
  BLANK: 'sign_blank',               // ว่างหรือจางเกินไป (ด่านหมึก)
  // ระบบคือปัญหา — ลองใหม่ได้
  TIMEOUT: 'sign_timeout',           // คลังไม่ตอบภายในเพดาน · งบของรอบหมดก่อนถึงคิว
  STORAGE: 'sign_storage',           // อ่านคลัง/เก็บสำเนาไม่สำเร็จ
  SHARP_UNAVAILABLE: 'sharp_unavailable',
  INTERNAL: 'prepare_failed',
});
const S = SURVEY_SIGN_FAILURE;

/** เหตุถาวรของลายเซ็น — ชุดเดียวกับที่มีป้ายใน `SURVEY_SIGN_FAILURE_LABELS` ของ surveyReportSigners (เทสต์ล็อกคู่กัน) */
export const SURVEY_SIGN_PERMANENT_REASONS = Object.freeze([S.PATH, S.MISSING, S.MISMATCH, S.UNDECODABLE, S.BLANK]);

// "ไม่มีไฟล์นี้" ของ Supabase Storage — 404 หรือ 400 ที่ข้อความบอกว่าไม่พบ (รุ่นของ storage-js ตอบต่างกัน · กติกาเดียวกับขั้นกระดาษ)
const objectMissing = (error) => Number(error?.status) === 404 || String(error?.statusCode) === '404'
  || /not.?found|does not exist|no such/i.test(`${error?.message || ''} ${error?.error || ''}`);

async function blobBytes(data) {
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data && typeof data.arrayBuffer === 'function') return Buffer.from(await data.arrayBuffer());
  return Buffer.alloc(0);
}

/** อ่าน PNG ของลายเซ็นหนึ่งฉบับจากคลัง — เพดานเวลาครอบทั้งคำขอและการอ่านเนื้อไฟล์ · โยน `ImageFailure` เท่านั้น */
async function fetchSignature(supabase, storagePath, timeoutMs) {
  const { signal, clear } = timeoutSignal(timeoutMs);
  try {
    // `signal` ไปถึง fetch ของคลัง (storage-js รับที่อาร์กิวเมนต์ตัวที่สาม) — หมดเวลาแล้วสายถูกตัดจริง
    const result = await abortable(
      Promise.resolve().then(() => supabase.storage.from(SIGNATURE_BUCKET).download(storagePath, {}, { signal })),
      signal,
    );
    // supabase ไม่โยน — ต้องอ่าน { error } เอง · ไม่มีทั้ง data และ error = ไม่มีไฟล์
    if (result?.error || !result?.data) {
      if (!result?.error || objectMissing(result.error)) throw failure(S.MISSING, true, result?.error);
      throw failure(S.STORAGE, false, result.error);
    }
    return await abortable(blobBytes(result.data), signal);
  } catch (err) {
    if (err instanceof ImageFailure) throw err;
    if (signal.aborted) throw failure(S.TIMEOUT, false, err);
    throw failure(S.STORAGE, false, err);
  } finally {
    clear();
  }
}

/**
 * 🔑 **ลายเซ็นหนึ่งไฟล์ → รูปที่เอกสารพิมพ์** — หมุนตาม EXIF · ถมพื้นขาว (ลายเซ็นเป็น PNG โปร่งใส) · ย่อให้อยู่ในกรอบ 600×200
 * (ไม่ขยาย) · นับหมึกบนรูปที่ถมและย่อแล้ว · JPEG คุณภาพ 90
 * ⚠️ ไม่ตัดขอบให้ชิดหมึก (สเปก §10) — ช่องบนกระดาษสูงตายตัวและวางแบบ `contain` ขนาดของไฟล์จึงขยับเลย์เอาต์ไม่ได้
 * @returns `{ data: Buffer, sha, w, h, bytes, ink }` · `ink` = จำนวนพิกเซลที่เข้มกว่า `SURVEY_SIGN_INK_LEVEL` · โยนเมื่อถอดรหัสไม่ได้
 */
export async function renderSurveySignature(buffer, { sharp = null } = {}) {
  const lib = sharp || await importSharp();
  const fitted = () => lib(buffer, { failOn: 'error' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({ width: SURVEY_SIGN_MAX_WIDTH, height: SURVEY_SIGN_MAX_HEIGHT, fit: 'inside', withoutEnlargement: true });
  const grey = await fitted().greyscale().raw().toBuffer({ resolveWithObject: true });
  const step = Math.max(1, grey.info.channels);
  let ink = 0;
  for (let i = 0; i < grey.data.length; i += step) if (grey.data[i] < SURVEY_SIGN_INK_LEVEL) ink += 1;
  const { data, info } = await fitted()
    .jpeg({ quality: SURVEY_SIGN_JPEG_QUALITY, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data, sha: sha256(data), w: info.width, h: info.height, bytes: data.length, ink };
}

const defaultSignLog = (line) => console.info('[survey-report] signature', JSON.stringify(line));

/**
 * 🔑 **เตรียมลายเซ็นของผู้ลงนาม** — อ่านจากคลังลายเซ็น · ตรวจ · ย่อ · เก็บ `img/<sha>.jpg` · คืนแผนที่ที่ `buildSurveyReportSnapshot` ใช้
 *   (`signatureImageByVersionId`) · สองผู้เรียก: เส้นส่งผล **ก่อนเขียนอะไร** (เหตุถาวร = ปฏิเสธการส่งพร้อมชื่อ) กับขั้นออกเลข I4b
 *
 * ต่อหนึ่งคน (คนเดียวสองที่นั่ง = รอบเดียว · ฉบับที่อยู่ใน `have` แล้วไม่ถูกอ่านซ้ำ):
 *   ① ที่อยู่ไฟล์ต้องอยู่ใต้โฟลเดอร์ของเจ้าของ (`isSignatureStoragePathForUser`) — ไม่ใช่ = `sign_path` ไม่อ่านไฟล์
 *   ② อ่าน PNG จาก `signature-assets` ใต้เพดานต่อไฟล์ (`timeoutSignal`)
 *   ③ `sha256:<hash ของไฟล์>` ต้องตรงกับ `version.sha256` ที่บันทึกตอนอัปโหลด
 *   ④ ถมพื้นขาว ย่อ   ⑤ ด่านหมึก   ⑥ JPEG → `img/<sha>.jpg` (เฉพาะเมื่อ `storeAllowed` เป็นจริง · "มีอยู่แล้ว" = สำเร็จ)
 *
 * @param supabase  service-role client (`storage.from('signature-assets').download` · `storage.from(bucket).upload`)
 * @param signers   `[{ seats, userId, name, version: { versionId, versionNumber, storagePath, sha256, width, height } }]`
 *                  จาก `surveyReportSignerVersions` (หรือที่เส้นส่งผลส่งต่อมา)
 * @param opts.deadline       งบของทั้งรอบ — epoch ms / Date / หรือจำนวน ms จากนี้ · ตรวจก่อนเริ่มแต่ละคน: หมดแล้ว = `sign_timeout`
 * @param opts.have           แผนที่ `{ [versionId]: { sha, w, h, bytes } }` ของรอบก่อน (object หรือ Map) — ฉบับที่มีแล้วติดกลับไปในผล
 * @param opts.storeAllowed   ด่านเขียนถาวร — **`true` เท่านั้นจึงอัป** · ไม่ส่ง = `surveyReportStoreAllowed()` (production เท่านั้น)
 * @param opts.bucket         ถังของสำเนา JPEG — ไม่ส่ง = `SURVEY_REPORT_BUCKET` (คลังต้นทางเป็น `signature-assets` เสมอ ไม่มีตัวเลือก)
 * @param opts.loadSharp · opts.fileTimeoutMs (ค่าตั้งต้น 10 วิ) · opts.now · opts.log   จุดเสียบของเทสต์
 * @returns `{ imageByVersionId: { [versionId]: { sha, w, h, bytes } }, failed: [{ userId, name, seats, versionId, reason, permanent }] }`
 *   · `failed[].reason` = ค่าของ `SURVEY_SIGN_FAILURE` · เรียงตามลำดับของ `signers` · **ไม่โยน**
 *   🔴 ไม่มีอะไรในผลพกที่อยู่ไฟล์ของคลัง
 */
export async function prepareSurveyReportSignatures(supabase, signers, opts = {}) {
  const {
    deadline = null, have = null, storeAllowed, bucket = SURVEY_REPORT_BUCKET, loadSharp = importSharp,
    fileTimeoutMs = SURVEY_SIGN_FILE_TIMEOUT_MS, now = Date.now, log = defaultSignLog,
  } = opts || {};

  const entries = [];
  const seen = new Set();
  for (const row of list(signers)) {
    const version = row?.version && typeof row.version === 'object' ? row.version : {};
    const versionId = version.versionId != null && version.versionId !== '' ? String(version.versionId) : '';
    const key = versionId || `user:${row?.userId ?? entries.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      key, versionId: versionId || null, version,
      userId: row?.userId != null ? String(row.userId) : null,
      name: String(row?.name ?? '').trim() || null,
      seats: list(row?.seats).map(String),
    });
  }
  const doneByKey = new Map();
  const failedByKey = new Map();
  const fail = (entry, reason, permanent) => failedByKey.set(entry.key, {
    userId: entry.userId, name: entry.name, seats: [...entry.seats], versionId: entry.versionId, reason, permanent,
  });
  const result = () => {
    const imageByVersionId = {};
    const failed = [];
    for (const entry of entries) {
      if (doneByKey.has(entry.key)) imageByVersionId[entry.versionId] = doneByKey.get(entry.key);
      else if (failedByKey.has(entry.key)) failed.push(failedByKey.get(entry.key));
    }
    return { imageByVersionId, failed };
  };
  const say = (line) => { try { log(line); } catch { /* log พังต้องไม่ทำให้ลายเซ็นพัง */ } };

  try {
    const endAt = deadlineAt(deadline, now);
    const todo = [];
    for (const entry of entries) {
      const hit = entry.versionId ? preparedIn(have, entry.versionId) : null;
      if (hit) doneByKey.set(entry.key, { sha: hit.sha, w: hit.w, h: hit.h, bytes: hit.bytes });
      else todo.push(entry);
    }
    if (!todo.length) return result();

    let sharp;
    try {
      sharp = await readySharp(loadSharp);
    } catch (err) {
      console.error('[survey-report] โหลด sharp ไม่ได้ — ยังไม่ได้เตรียมลายเซ็น', err?.message);
      todo.forEach((entry) => fail(entry, S.SHARP_UNAVAILABLE, false));
      return result();
    }

    // ด่านเขียนถาวร (§0) — ต้องเป็น `true` ตรงตัว ค่าอื่นทุกค่า = ไม่อัป
    const store = (storeAllowed === undefined ? surveyReportStoreAllowed() : storeAllowed) === true;

    for (const entry of todo) {
      const line = { versionId: entry.versionId, seats: entry.seats, ok: false };
      try {
        if (endAt !== null && now() >= endAt) throw failure(S.TIMEOUT, false);
        const { storagePath } = entry.version;
        // แถวที่ไม่มีฉบับ/ไม่มีที่อยู่ = ผู้เรียกส่งของผิดรูป (ไม่ใช่ไฟล์เสีย) — ไม่บอกเจ้าตัวให้อัปโหลดใหม่
        if (!entry.versionId || !entry.userId) throw failure(S.INTERNAL, false);
        if (!isSignatureStoragePathForUser(entry.userId, storagePath)) throw failure(S.PATH, true);

        let mark = performance.now();
        let original = await fetchSignature(supabase, storagePath, fileTimeoutMs);
        line.fetchMs = elapsed(mark);
        line.inBytes = original.length;
        if (`sha256:${sha256(original)}` !== String(entry.version.sha256 ?? '')) throw failure(S.MISMATCH, true);

        mark = performance.now();
        let out;
        try {
          out = await renderSurveySignature(original, { sharp });
        } catch (err) {
          // หน่วยความจำไม่พอ = เครื่อง ไม่ใช่ไฟล์ — ห้ามบอกเจ้าตัวว่า "เปิดไฟล์ลายเซ็นไม่ได้"
          if (OUT_OF_MEMORY.test(String(err?.message || ''))) throw failure(S.INTERNAL, false, err);
          throw failure(S.UNDECODABLE, true, err);
        } finally {
          original = null;
        }
        line.resizeMs = elapsed(mark);
        line.outBytes = out.bytes;
        line.ink = out.ink;
        if (out.ink < SURVEY_SIGN_INK_MIN_PIXELS) throw failure(S.BLANK, true);

        if (store) {
          mark = performance.now();
          try {
            await uploadImage(supabase, bucket, out, fileTimeoutMs);
          } catch (err) {
            throw failure(S.STORAGE, false, err);
          }
          line.uploadMs = elapsed(mark);
        }
        doneByKey.set(entry.key, { sha: out.sha, w: out.w, h: out.h, bytes: out.bytes });
        line.ok = true;
        line.stored = store;
      } catch (err) {
        const known = err instanceof ImageFailure ? err : failure(S.INTERNAL, false, err);
        fail(entry, known.reason, known.permanent);
        line.reason = known.reason;
        line.detail = String(known.message || '').split('\n').pop().slice(0, 200);
      }
      say(line);
    }
    return result();
  } catch (err) {
    // ไม่ควรมาถึง — ทุกขั้นข้างบนจับของตัวเองแล้ว · กันไว้เพราะสัญญาคือ "ไม่โยนเข้า route"
    console.error('[survey-report] เตรียมลายเซ็นล้มกลางทาง', err?.message);
    for (const entry of entries) {
      if (!doneByKey.has(entry.key) && !failedByKey.has(entry.key)) fail(entry, S.INTERNAL, false);
    }
    return result();
  }
}
