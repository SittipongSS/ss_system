// ── ด่านที่มาของไฟล์ Drive สำหรับปลายทางที่เก็บ "ทั้งชุด" (ไฟล์ในเธรดอัปเดต · รูป/ลายเซ็นของนัดช่าง) ─────────────
//
// 🐞 ที่มา (รอบสองของมติเจ้าของ 08/10/2569): รอบแรกปิดช่องที่ POST /api/attachments แล้ว แต่เธรดอัปเดตกับนัดช่างยังรับ
//    `driveFileId` / ลิงก์ Drive จาก client ทั้งดุ้น แล้ว proxy อ่านไฟล์ของสองที่นั้นสตรีมตาม id ที่เก็บไว้ ⇒ ส่ง id ของ
//    ไฟล์คนอื่น (สัญญาที่เซ็นแล้ว · บัตรประชาชนลูกค้า) มาโพสต์ แล้วเปิดอ่านผ่านข้อความ/นัดของตัวเองได้
//
// ⭐ ที่เดียวที่ตอบว่า "ชุดไฟล์ที่ client ส่งมานี้เก็บได้ไหม" — route เรียก `verifyDriveRefs` หลังด่านสิทธิ์ ก่อนเขียนแถว
//    แล้วเรียก `claimDriveRefs` หลังเขียนสำเร็จ (เฉพาะปลายทางที่ประทับใบรับ) · ใบรับเองอยู่ที่ lib/upload/receipts.js
// ⭐ ไฟล์ที่ **อยู่บนแถวเดิมอยู่แล้ว** (`storedIds`) ไม่ถูกถามใบรับอีก — ปลายทางพวกนี้บันทึกทั้งชุดซ้ำทุกครั้งที่แก้
//    ไฟล์เดิมที่อายุเกิน 24 ชั่วโมงจึงต้องไม่ถูกตีกลับ
// ⚠️ ตัวใดตัวหนึ่งไม่ผ่าน = ปฏิเสธทั้งคำขอ (ผู้เรียกต้องไม่เขียนอะไรเลย) · 400 = ตัวอ้างอิงใช้ไม่ได้ ส่งซ้ำกี่ครั้งก็ไม่ผ่าน
//    จึงติด `code` ให้จอลืมไฟล์ที่จำไว้แล้วอัปใหม่ · 503 = อ่านทะเบียนใบรับไม่ได้ ตัวอ้างอิงเดิมลองใหม่แล้วอาจผ่าน
//    จึง **ไม่ติด** `code`
// ⚠️ สวิตช์ฉุกเฉินของด่านใบรับไม่ถูกอ่านที่นี่ — `requireUploadReceipt` ตัดสินเอง (ขั้น ⑥ ขั้นเดียวที่ผ่อนได้) ·
//    รูปร่าง · ลิงก์ตรงกับไฟล์ · id ซ้ำ · "ใบรับถูกใช้ไปแล้ว" บังคับเสมอ
// ⚠️ ไม่ถามว่ามีแถวอื่นถือไฟล์นี้อยู่ไหม (ตัวถามของ POST /api/attachments) โดยเจตนา — เส้นนี้อยู่บนทางร้อนของทุกโพสต์
//    ใบรับที่ถูกประทับกันการใช้ซ้ำให้แล้ว
import { parseDriveId } from '@/lib/driveId';
import { attachmentUrlError } from '@/lib/master/attachmentStorage';
import {
  DRIVE_FILE_ID_PATTERN, claimUploadReceipt, requireUploadReceipt, uploadReceiptStatus,
} from '@/lib/upload/receipts';

export const REF_SHAPE_TEXT = 'ไฟล์แนบต้องเป็นไฟล์ที่อัปโหลดผ่านระบบ — ลบไฟล์ออกแล้วแนบใหม่อีกครั้ง';
export const REF_IN_USE_TEXT = 'ไฟล์นี้ถูกใช้กับรายการอื่นไปแล้ว — ลบไฟล์ออกแล้วแนบใหม่อีกครั้ง';
/* รหัสที่ติดไปกับคำตอบ 400 ของด่านนี้ — จอใช้แยก "ตัวอ้างอิงไฟล์ใช้ไม่ได้ ต้องอัปใหม่" ออกจาก 400 เรื่องอื่น */
export const FILE_REF_ERROR_CODE = 'file_ref';

const CLAIM_ATTEMPTS = 2;

const DEFAULT_DEPS = {
  uploadReceiptStatus, requireUploadReceipt, claimUploadReceipt, attachmentUrlError, parseDriveId,
};

const refusal = (index, text) => ({
  error: { status: 400, error: text, code: FILE_REF_ERROR_CODE, index },
});

/* ตัวจริงของ `strictDriveId` — แยกออกมาให้ `verifyDriveRefs` ส่งตัวปลอมของเทสต์เข้ามาได้ โดยที่ตัวส่งออกยังรับ
   อาร์กิวเมนต์เดียว (`urls.map(strictDriveId)` จึงไม่มีวันส่งเลขลำดับมาเป็น deps) */
function strictDriveIdWith(url, deps) {
  if (typeof url !== 'string') return null;
  if (deps.attachmentUrlError(url) !== null) return null;
  let target;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.username || target.password) return null;
  // `/d/<id>` นอก pathname (ใน query หรือหลัง #) คือ id ตัวที่สองที่ตัวอ่านแบบ regex จะหยิบไปแทน
  if (target.search.includes('/d/') || target.hash.includes('/d/')) return null;

  const segments = target.pathname.split('/');
  const marks = segments.reduce((found, segment, at) => (segment === 'd' ? [...found, at] : found), []);
  const queryIds = target.searchParams.getAll('id');
  if (marks.length > 1 || queryIds.length > 1) return null;
  if (marks.length + queryIds.length !== 1) return null;

  const id = marks.length ? segments[marks[0] + 1] : queryIds[0];
  if (typeof id !== 'string' || !DRIVE_FILE_ID_PATTERN.test(id)) return null;
  // ตัวอ่านไฟล์ของนัดช่างแกะ id จากสตริงที่เก็บไว้ด้วย `parseDriveId` — สองตัวต้องชี้ไฟล์ใบเดียวกันเสมอ
  return deps.parseDriveId(url) === id ? id : null;
}

/**
 * id ไฟล์ที่ลิงก์ Drive หนึ่งลิงก์ชี้ — คืน id เมื่อลิงก์ชี้ไฟล์ **ใบเดียวแบบไม่กำกวม** เท่านั้น ไม่งั้น `null`
 *
 * · ต้องเป็นตัวหนังสือ · https · host ของ Google ตามรายการของ `attachmentUrlError` (ไม่มี user:pass@ · ไม่มีพอร์ต)
 * · id มาจากรูป `/d/<id>` ใน pathname **หรือ** พารามิเตอร์ `id` — อย่างใดอย่างหนึ่ง ไม่ใช่ทั้งคู่ · `/d/` ใน pathname
 *   มีได้ครั้งเดียว · `id` มีได้ตัวเดียว · ใน query และหลัง # ต้องไม่มี `/d/` อีก
 * · ผลต้องตรงกับ `parseDriveId(url)` ตัวต่อตัว (ตัวอ่านใช้ตัวนั้นกับสตริงที่เก็บไว้)
 * 🐞 กันลิงก์สองหน้า: `…/open?id=<ไฟล์เหยื่อ>&x=/d/<ไฟล์ตัวเอง>` — ด่านที่อ่าน `id` เห็นไฟล์เหยื่อ ส่วนตัวอ่านแบบ regex
 *    หยิบ `/d/` ก่อน เห็นไฟล์ตัวเอง (หรือกลับกัน) ⇒ ใบรับของไฟล์หนึ่งเปิดอีกไฟล์หนึ่งได้
 * @returns {string|null}
 */
export function strictDriveId(url) {
  return strictDriveIdWith(url, DEFAULT_DEPS);
}

/**
 * ตรวจชุดตัวอ้างอิงไฟล์ Drive ที่ client ส่งมา ก่อนเก็บลงแถว — ไล่ทีละตัวตามลำดับที่ส่งมา ตัวแรกที่ไม่ผ่านปฏิเสธทั้งคำขอ
 *
 * ต่อหนึ่งตัว เรียงจากถูกสุดไปแพงสุด:
 * ① `driveFileId` เป็นตัวหนังสือตรงรูปของ id ไฟล์ — ไม่งั้น 400 (ค่าที่หลุดรูปห้ามถึงตัวกรองของฐาน)
 * ② มี `fileUrl` ⇒ `strictDriveId(fileUrl)` ต้องได้ id เดียวกัน — ไม่งั้น 400 (ลิงก์ที่จอโชว์กับไฟล์ที่ระบบถือเป็นคนละใบ)
 * ③ อยู่ใน `storedIds` (อยู่บนแถวเดิมอยู่แล้ว) ⇒ ผ่าน ไม่ถามฐาน ไม่ประทับ
 * ④ id ซ้ำกับตัวก่อนหน้าในคำขอเดียวกัน (นับเฉพาะตัวที่ไม่ได้อยู่บนแถวเดิม) ⇒ 400
 * ⑤ ถามใบรับ · ใบรับที่ **ปลายทางนี้เอง** ประทับไว้ (`ownClaim` ตรงกับ `claimedBy`) ⇒ ผ่าน ไม่ประทับซ้ำ —
 *    ไฟล์ที่แถวนี้รับไปแล้วแต่ `storedIds` มองไม่เห็น (เขียนแถวสำเร็จ คำตอบหาย แล้วจอส่งซ้ำ) แม้ใบรับหมดอายุ/เป็นของคนอื่น
 * ⑥ `requireUploadReceipt` — ไม่มีใบรับ/ของคนอื่น/หมดอายุ = 400 · ตรวจไม่ได้ = 503 (ขั้นเดียวที่สวิตช์ฉุกเฉินผ่อนได้)
 * ⑦ `refuseClaimed` และใบรับถูกประทับไปแล้ว ⇒ 400 (ใบรับหนึ่งใบใช้ได้กับปลายทางเดียว)
 * ⑧ ใบรับของคนเรียกเอง ยังไม่หมดอายุ ยังไม่ถูกประทับ ⇒ เข้า `claimable` · ตัวที่ผ่านเพราะสวิตช์ฉุกเฉินเท่านั้น
 *    เก็บได้แต่ **ไม่** เข้า `claimable` (ไม่มีใบรับของคนเรียกให้ประทับ)
 *
 * ⚠️ `refs` ไม่ใช่ array หรือมีตัวที่ไม่ใช่ object = 400 (ผู้เรียกส่งผิด ต้องไม่กลายเป็น "ไม่มีอะไรให้ตรวจ") · `[]` ผ่านโดยไม่ถามฐาน
 * ⚠️ ไม่มี `userId` ไม่ได้แยกทางเอง — ตัวถามใบรับตอบ "ใช้ไม่ได้" ให้ (400) · ตัวที่อยู่บนแถวเดิมยังผ่านตามขั้น ③
 * @param refs `[{ driveFileId, fileUrl }]` — `fileUrl` ไม่ส่งได้ (ผู้เรียกที่มีแต่ id)
 * @param storedIds Set ของ id ที่อยู่บนแถวที่กำลังเขียนทับ (ไม่ส่ง = ไม่มี)
 * @param ownClaim ค่าที่ปลายทางนี้ประทับลงใบรับ เช่น `service_visits:<id นัด>`
 * @param deps ตัวปลอมของเทสต์ — `{ uploadReceiptStatus, requireUploadReceipt, attachmentUrlError, parseDriveId }`
 * @returns {Promise<{ error: { status: number, error: string, code?: string, index: number } } | { claimable: string[] }>}
 *   `index` = ลำดับของตัวที่ไม่ผ่านใน `refs` (-1 เมื่อ `refs` เองผิดรูป) ให้ผู้เรียกบอกผู้ใช้ได้ว่าไฟล์ไหน · `code` มีเฉพาะ 400
 */
export async function verifyDriveRefs(supabase, {
  refs, userId, storedIds, ownClaim, refuseClaimed, route, logContext,
} = {}, deps = {}) {
  const use = { ...DEFAULT_DEPS, ...deps };
  if (!Array.isArray(refs)) return refusal(-1, REF_SHAPE_TEXT);
  const stored = storedIds && typeof storedIds.has === 'function' ? storedIds : new Set();
  const seen = new Set();
  const claimable = [];

  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index];
    if (!ref || typeof ref !== 'object') return refusal(index, REF_SHAPE_TEXT);
    const { driveFileId, fileUrl } = ref;
    if (typeof driveFileId !== 'string' || !DRIVE_FILE_ID_PATTERN.test(driveFileId)) return refusal(index, REF_SHAPE_TEXT);
    if (fileUrl !== undefined && fileUrl !== null && strictDriveIdWith(fileUrl, use) !== driveFileId) {
      return refusal(index, REF_SHAPE_TEXT);
    }
    if (stored.has(driveFileId)) continue;
    if (seen.has(driveFileId)) return refusal(index, REF_SHAPE_TEXT);
    seen.add(driveFileId);

    const status = await use.uploadReceiptStatus(supabase, { driveFileId, userId });
    const claimedBy = status?.receipt?.claimedBy || null;
    if (typeof ownClaim === 'string' && ownClaim && claimedBy === ownClaim) continue;
    const rejection = await use.requireUploadReceipt(supabase, { driveFileId, userId, status, route, logContext });
    if (rejection) {
      return {
        error: {
          status: rejection.status,
          error: rejection.error,
          ...(rejection.status === 400 ? { code: FILE_REF_ERROR_CODE } : {}),
          index,
        },
      };
    }
    if (refuseClaimed && claimedBy) return refusal(index, REF_IN_USE_TEXT);
    if (status?.ok && !claimedBy) claimable.push(driveFileId);
  }
  return { claimable };
}

/**
 * ประทับใบรับของไฟล์ที่ปลายทางเพิ่งเก็บลงแถว (`claimable` ของ `verifyDriveRefs`) — เรียก **หลัง** เขียนแถวสำเร็จ
 *
 * ⚠️ best-effort: แถวเขียนไปแล้ว ประทับพังไม่ล้มคำขอ — ลองซ้ำหนึ่งครั้ง ยังพังให้ log บรรทัดแดงแล้วเดินต่อ · ไม่ throw
 *    (ใบรับที่ไม่ถูกประทับ = ไฟล์ใบนั้นยังถูกนำไปแนบที่อื่น/ถอยการอัปได้จนกว่าใบรับหมดอายุ จึงต้องมีคนเห็น)
 * ⚠️ บรรทัดที่จดมีแค่ปลายทางกับ id ไฟล์ — ไม่มีชื่อไฟล์
 * @param deps ตัวปลอมของเทสต์ — `{ claimUploadReceipt, log }`
 * @returns {Promise<void>}
 */
export async function claimDriveRefs(supabase, { ids, claimedBy } = {}, deps = {}) {
  const claim = deps.claimUploadReceipt || claimUploadReceipt;
  const log = deps.log || console.error;
  if (!Array.isArray(ids)) return;
  for (const driveFileId of ids) {
    let failure = null;
    for (let attempt = 1; attempt <= CLAIM_ATTEMPTS; attempt += 1) {
      try {
        const result = await claim(supabase, { driveFileId, claimedBy });
        failure = result?.error || null;
      } catch (err) {
        failure = err && typeof err === 'object' ? err : { message: String(err) };
      }
      if (!failure) break;
    }
    if (!failure) continue;
    try {
      log(`🔴 [upload-receipt] ประทับใบรับการอัปโหลดไม่สำเร็จ claimedBy=${String(claimedBy)} driveFileId=${String(driveFileId)} — ${failure.message || 'ไม่ทราบสาเหตุ'}`);
    } catch {
      // ตัวเขียน log พังก็ต้องไม่ล้มคำขอที่เขียนแถวสำเร็จไปแล้ว
    }
  }
}
