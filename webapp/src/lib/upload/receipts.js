// ── ใบรับการอัปโหลด (upload_receipts · mig 0406) ─────────────────────────────
//
// "ไฟล์ Drive ใบนี้ ใครอัปขึ้นมา เมื่อไร" — ทะเบียนฝั่ง server ที่ทำให้ `driveFileId` จาก client เชื่อได้
//
// 🐞 ที่มา (มติเจ้าของ 08/10/2569): `driveFileId` ตอนบันทึกแถวไฟล์แนบและตอนถอยการอัป **มาจาก client** — ไม่มีที่ไหน
//    จดว่า id นั้นเป็นไฟล์ที่คนเรียกอัปเองจริง ⇒ ส่ง id ของไฟล์คนอื่น (สัญญาที่เซ็นแล้ว · บัตรประชาชนลูกค้า · โฟลเดอร์
//    ลูกค้าทั้งโฟลเดอร์) มาแล้วเปิดอ่านผ่านแถวของตัวเอง หรือให้ระบบทิ้งไฟล์นั้นลงถังขยะ Drive ได้
//
// ⭐ ออกใบรับ (`recordUploadReceipt`) ได้จากสองจุดเท่านั้น: POST /api/upload/commit และขา Drive ของ POST /api/upload —
//    id มาจาก Drive ไม่ใช่จากคำขอ · ปลายทางที่รับ `driveFileId` จาก client ถาม `requireUploadReceipt` ก่อนเก็บ
// ⭐ อายุใบรับ 24 ชั่วโมง ตัดสิน **ตอนอ่าน** (แถวไม่ถูกลบ) — ครบ 24 ชั่วโมงพอดียังใช้ได้ เกินจึงหมดอายุ
// ⚠️ supabase-js ไม่ throw — ทุกจุดอ่าน `{ error }` · ตรวจไม่ได้ (query ล้ม · ยังไม่ได้รัน 0406) = `unverifiable`
//    ซึ่ง **ไม่ผ่าน** (ปิดไว้ก่อน) ไม่ใช่ "ไม่มีใบรับ" และไม่ใช่ปล่อยผ่าน
// ⚠️ `entityType`/`entityId` ในใบรับคือค่าที่ client ส่งมาตอนอัป ยังไม่ผ่านด่านสิทธิ์ใด — จดไว้ดูย้อนหลังเท่านั้น
//    ห้ามใช้ตัดสินว่าไฟล์เป็นของระเบียนไหน
// ⚠️ ฝั่ง server เท่านั้น (ตารางเข้าได้ด้วย service_role อย่างเดียว) — ทุกฟังก์ชันรับ supabase จากผู้เรียก
//    ไฟล์นี้จึงไม่ import อะไรเลย และเทสต์ยัดตัวปลอม + นาฬิกาเองได้ (`now`)

export const UPLOAD_RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;

/* รูปร่างของ id ไฟล์บน Drive — รูปเดียวกับ CHECK ของตาราง (0406 · เทสต์เทียบตัวหนังสือให้) · ค่าที่หลุดรูปนี้
   ห้ามถึงตัวกรองของ PostgREST (`,` `)` `.` ในค่าคือการเขียนเงื่อนไขใหม่เอง) */
export const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

const RECEIPT_COLUMNS = '"driveFileId", "userId", "entityType", "entityId", "createdAt", "claimedBy", "claimedAt"';
const TEXT_MAX = 200;
/* เวลาไทยเร็วกว่า UTC 7 ชั่วโมง — "สิ้นวัน" ของสวิตช์ผ่อนด่านนับตามนาฬิกาไทย (กติกาทั้งระบบ) */
const THAI_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/* สวิตช์ผ่อนด่านตั้งล่วงหน้าได้ไกลสุดกี่วันนับจากวันนี้ (เวลาไทย) — ไกลกว่านี้ = ไม่ใช่สวิตช์ฉุกเฉิน (พิมพ์ปีผิด · 9999-12-31)
   ⇒ ถือว่าไม่ได้ตั้ง · เหตุฉุกเฉินที่ยาวกว่านี้ต้องมีคนมาต่ออายุค่าเอง */
export const OBSERVE_MAX_AHEAD_DAYS = 7;
const RECORD_ATTEMPTS = 2;
const RECORD_RETRY_MS = 250;

const validId = (value) => typeof value === 'string' && DRIVE_FILE_ID_PATTERN.test(value);
const validUser = (value) => typeof value === 'string' && value.length > 0 && value.length <= TEXT_MAX;
/* ค่าจากฟอร์มอัปเป็น File ได้ (`formData.get`) — เก็บเฉพาะตัวหนังสือ ตัดไม่เกินความยาวของช่อง */
const cleanText = (value) => (typeof value === 'string' && value ? value.slice(0, TEXT_MAX) : null);
const toMs = (now) => {
  if (now instanceof Date) return now.getTime();
  return typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
};
const asError = (err) => (err && typeof err === 'object' ? err : { message: String(err) });
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * ออกใบรับให้ไฟล์ที่ server เพิ่งอัปขึ้น Drive — เรียกทันทีหลัง `uploadForEntity` สำเร็จ
 *
 * ⚠️ ลองสองครั้งก่อนยอมแพ้ (ฐานสะดุดครั้งเดียวไม่ควรทำให้ไฟล์ที่ขึ้น Drive แล้วแนบไม่ได้) · id ซ้ำ (23505) ไม่ลองใหม่ —
 *    การอัปหนึ่งครั้งได้ไฟล์ใหม่เสมอ id ซ้ำ **ตั้งแต่ครั้งแรก** จึงเป็นของผิดปกติ = error ทันที ไม่อ่านอะไรต่อ และห้ามเขียนทับ
 *    ชื่อผู้อัปของใบรับเดิม (insert ไม่ใช่ upsert)
 * ⚠️ id ซ้ำ **ตอนลองครั้งที่สอง** เป็นอีกเรื่อง: ครั้งแรกจบแบบไม่รู้ผล (ไม่ได้คำตอบ ≠ ฐานไม่ได้เขียน) แล้วแถวของครั้งแรกนั่นเอง
 *    ที่ชนครั้งที่สอง ⇒ อ่านแถวกลับด้วย primary key หนึ่งครั้ง — เป็นใบรับของผู้ใช้คนเดียวกัน = สำเร็จ · อ่านไม่ได้ / ไม่เจอแถว /
 *    เป็นของคนอื่น = คืน 23505 ตามเดิม (🐞 เดิมคืน error ทั้งที่ใบรับอยู่ครบ ⇒ log แดงชวนไปตรวจ migration ที่รันแล้ว)
 * ⚠️ ไม่มีผู้ใช้ / id ผิดรูป = error โดยไม่ยิงฐานเลย · ไม่ throw
 * @param wait ตัวหน่วงระหว่างสองครั้ง (ให้เทสต์ข้ามได้)
 * @returns {Promise<{ error: object|null }>}
 */
export async function recordUploadReceipt(supabase, { driveFileId, userId, entityType, entityId } = {}, { wait = pause } = {}) {
  if (!validUser(userId)) return { error: { message: 'ออกใบรับการอัปโหลดไม่ได้ — ไม่มีผู้ใช้' } };
  if (!validId(driveFileId)) return { error: { message: 'ออกใบรับการอัปโหลดไม่ได้ — รหัสไฟล์ไม่ถูกต้อง' } };
  const row = { driveFileId, userId, entityType: cleanText(entityType), entityId: cleanText(entityId) };
  let lastError = null;
  for (let attempt = 1; attempt <= RECORD_ATTEMPTS; attempt += 1) {
    try {
      const { error } = await supabase.from('upload_receipts').insert(row);
      if (!error) return { error: null };
      lastError = error;
      if (error.code === '23505') {
        if (attempt > 1 && await ownReceiptExists(supabase, driveFileId, userId)) return { error: null };
        break;
      }
    } catch (err) {
      lastError = asError(err);
    }
    if (attempt < RECORD_ATTEMPTS) await wait(RECORD_RETRY_MS);
  }
  return { error: lastError };
}

/* ใบรับของไฟล์นี้มีอยู่แล้วและเป็นของผู้ใช้คนนี้ไหม — ใช้เฉพาะตอนลองออกใบรับครั้งที่สองแล้วชน id ซ้ำ (ดู `recordUploadReceipt`)
   ⚠️ ไม่ throw · อ่านไม่ได้ = false (ผู้เรียกคืน 23505 ต่อ ไม่ใช่ถือว่าสำเร็จ) */
async function ownReceiptExists(supabase, driveFileId, userId) {
  try {
    const { data, error } = await supabase.from('upload_receipts').select('"userId"').eq('driveFileId', driveFileId).maybeSingle();
    return !error && Boolean(data) && data.userId === userId;
  } catch {
    return false;
  }
}

/**
 * สถานะใบรับของไฟล์หนึ่งใบ **สำหรับผู้ใช้คนหนึ่ง** — อ่านด้วย primary key แถวเดียว
 *
 * reason: `invalid` (id ผิดรูป · ไม่มีผู้ใช้ — ไม่ยิงฐาน) · `missing` (ไม่มีใบรับ) · `foreign` (คนอื่นอัป) ·
 *         `expired` (เกิน 24 ชั่วโมง) · `unverifiable` (อ่านไม่ได้ · ตารางยังไม่มี · เวลาในแถวอ่านไม่ออก)
 * ⚠️ เวลาในแถวล้ำหน้านาฬิกาเรา (นาฬิกาสองเครื่องไม่ตรงกัน) = ยังใช้ได้
 * ⚠️ `receipt` คืนมาด้วยทุกครั้งที่เจอแถว (รวม foreign/expired) — ผู้เรียกอ่าน `claimedBy` ต่อได้โดยไม่ต้องถามซ้ำ
 * @returns {Promise<{ ok: boolean, reason: string|null, receipt: object|null }>}
 */
export async function uploadReceiptStatus(supabase, { driveFileId, userId, now } = {}) {
  if (!validUser(userId) || !validId(driveFileId)) return { ok: false, reason: 'invalid', receipt: null };
  let data = null;
  try {
    const { data: found, error } = await supabase.from('upload_receipts').select(RECEIPT_COLUMNS).eq('driveFileId', driveFileId).maybeSingle();
    if (error) return { ok: false, reason: 'unverifiable', receipt: null };
    data = found || null;
  } catch {
    return { ok: false, reason: 'unverifiable', receipt: null };
  }
  if (!data) return { ok: false, reason: 'missing', receipt: null };
  if (data.userId !== userId) return { ok: false, reason: 'foreign', receipt: data };
  const createdMs = Date.parse(data.createdAt);
  if (!Number.isFinite(createdMs)) return { ok: false, reason: 'unverifiable', receipt: data };
  if (toMs(now) - createdMs > UPLOAD_RECEIPT_TTL_MS) return { ok: false, reason: 'expired', receipt: data };
  return { ok: true, reason: null, receipt: data };
}

/**
 * โหมดของด่านใบรับ — `enforce` เสมอ ยกเว้นตั้ง `UPLOAD_RECEIPT_MODE=observe:YYYY-MM-DD` **ตรงรูปนี้เป๊ะ** วันนั้น
 * (เวลาไทย) ยังไม่จบ และอยู่ไม่ไกลกว่า 7 วันนับจากวันนี้ (`OBSERVE_MAX_AHEAD_DAYS`)
 *
 * ⭐ สวิตช์ฉุกเฉินที่ **หมดอายุเอง** — ลืมถอดก็กลับมาบังคับเองเมื่อพ้นวันที่ระบุ · `observe` เฉย ๆ · ตัวพิมพ์ใหญ่ ·
 *    มีช่องว่าง · วันที่ไม่มีจริง · วันที่ผ่านไปแล้ว = enforce ทั้งหมด (พิมพ์ผิดต้องไม่เปิดด่าน)
 * 🔴 **วันที่ไกลกว่า 7 วันนับจากวันนี้ (เวลาไทย) = enforce** — 🐞 เดิมรับวันในอนาคตไกลแค่ไหนก็ได้ ⇒ `observe:2062-10-10`
 *    (สลับหลักของปี) หรือ `observe:9999-12-31` ค่าเดียวปิดด่านใบรับไปตลอด "หมดอายุเอง" จึงไม่จริง · ต้องผ่อนนานกว่านั้น =
 *    มีคนมาตั้งวันใหม่เองทุกสัปดาห์ (ค่าที่ตั้งไว้ไกลเกินจะเริ่มมีผลเองเมื่อวันนั้นเข้ามาอยู่ในระยะ 7 วัน)
 * ⚠️ ผ่อนได้ **ด่านเดียว** คือใบรับตอนแนบ (`requireUploadReceipt`) — รูปร่าง id · ลิงก์ตรงกับไฟล์ · "มีแถวอื่นถือ" ·
 *    เส้นถอยการอัป (DELETE /api/upload) ไม่อ่านค่านี้เลย
 * ⚠️ อ่านจาก env ⇒ เปลี่ยนค่าแล้วต้อง build ใหม่จึงมีผล — กด Redeploy ของ deployment ปัจจุบันบน Vercel
 *    (workflow "Deploy to production" ไม่ build คอมมิตเดิมซ้ำ · ดู DEPLOY.md)
 * @returns {'enforce'|'observe'}
 */
export function uploadReceiptMode(env = process.env, now) {
  const raw = env?.UPLOAD_RECEIPT_MODE;
  if (typeof raw !== 'string') return 'enforce';
  const m = /^observe:(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return 'enforce';
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const start = new Date(Date.UTC(year, month - 1, day));
  if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month - 1 || start.getUTCDate() !== day) return 'enforce';
  // สิ้นวันนั้นตามเวลาไทย = เที่ยงคืนของวันถัดไป (ไทย) — ประกอบจากตัวเลขปฏิทิน ไม่ตัดสตริงเวลา
  const endOfDayMs = Date.UTC(year, month - 1, day + 1) - THAI_OFFSET_MS;
  const nowMs = toMs(now);
  if (nowMs >= endOfDayMs) return 'enforce';
  // นับเป็น "วันตามปฏิทินไทย" ทั้งสองฝั่ง (เลขวันนับจาก epoch) — ไม่ใช่ 168 ชั่วโมงจากวินาทีนี้
  const todayThai = Math.floor((nowMs + THAI_OFFSET_MS) / DAY_MS);
  const targetDay = Math.round(start.getTime() / DAY_MS);
  return targetDay - todayThai <= OBSERVE_MAX_AHEAD_DAYS ? 'observe' : 'enforce';
}

const RECEIPT_ERROR_TEXT = 'ไฟล์นี้ไม่ได้มาจากการอัปโหลดของคุณในช่วง 24 ชั่วโมงที่ผ่านมา — อัปโหลดไฟล์ใหม่แล้วแนบอีกครั้ง';
const UNVERIFIABLE_ERROR_TEXT = 'ตรวจที่มาของไฟล์ไม่ได้ในขณะนี้ — ลองแนบอีกครั้ง';
export const OBSERVE_LOG_PREFIX = '[upload-receipt] observe would-reject';

/**
 * ด่านของปลายทางที่รับ `driveFileId` จาก client — คืน `null` เมื่อผ่าน · ไม่ผ่านคืน `{ status, error }` (ข้อความไทย)
 *
 * · ไม่มีใบรับ / ของคนอื่น / หมดอายุ / id ผิดรูป = 400 · ตรวจไม่ได้ = 503 (ไม่ใช่ปล่อยผ่าน)
 * · `alreadyStored` (Set) — id ที่ **อยู่บนแถวที่กำลังเขียนทับอยู่แล้ว** ข้ามด่าน: ปลายทางรอบสองบันทึกทั้งชุดซ้ำทุกครั้ง
 *   ที่แก้ (ไฟล์ในเธรด · รูปของนัดช่าง) ⇒ ไฟล์เดิมที่อายุเกิน 24 ชั่วโมงต้องไม่ถูกตีกลับ
 * · โหมด observe (`uploadReceiptMode`): คำขอที่ **จะถูกปฏิเสธ** ถูกจดหนึ่งบรรทัด (`[upload-receipt] observe would-reject` +
 *   JSON บรรทัดเดียว) แล้วปล่อยผ่าน · ⚠️ id ผิดรูป/ไม่มีผู้ใช้ไม่ถูกผ่อน — นั่นไม่ใช่เรื่องของใบรับ
 * ⚠️ บรรทัดที่จดไม่มีชื่อไฟล์และไม่มีอีเมล — มีแค่ id (ผู้ใช้ · ระเบียน · ไฟล์)
 * @param status ผลของ `uploadReceiptStatus` ที่ผู้เรียกถามไว้แล้ว (ผู้เรียกที่ต้องอ่าน `claimedBy` ต่อ — ไม่ต้องถามฐานสองรอบ)
 * @param logContext `{ entityType, entityId, docType, rule }` ของปลายทาง — ลงบรรทัดที่จด
 * @param log ตัวเขียน log (ให้เทสต์จับได้)
 * @returns {Promise<null | { status: number, error: string }>}
 */
export async function requireUploadReceipt(supabase, {
  driveFileId, userId, alreadyStored, route, logContext, now, env, status, log,
} = {}) {
  if (alreadyStored && typeof alreadyStored.has === 'function' && alreadyStored.has(driveFileId)) return null;
  const verdict = status || await uploadReceiptStatus(supabase, { driveFileId, userId, now });
  if (verdict.ok) return null;
  const rejection = verdict.reason === 'unverifiable'
    ? { status: 503, error: UNVERIFIABLE_ERROR_TEXT }
    : { status: 400, error: RECEIPT_ERROR_TEXT };
  if (verdict.reason === 'invalid') return rejection;
  if (uploadReceiptMode(env, now) !== 'observe') return rejection;
  const createdMs = Date.parse(verdict.receipt?.createdAt);
  const line = JSON.stringify({
    rule: logContext?.rule || 'upload-receipt',
    reason: verdict.reason,
    route: route || null,
    userId: userId || null,
    entityType: cleanText(logContext?.entityType),
    entityId: cleanText(logContext?.entityId),
    docType: cleanText(logContext?.docType),
    driveFileId,
    receiptUserId: verdict.receipt?.userId || null,
    receiptAgeSeconds: Number.isFinite(createdMs) ? Math.round((toMs(now) - createdMs) / 1000) : null,
  });
  (log || console.warn)(`${OBSERVE_LOG_PREFIX} ${line}`);
  return null;
}

/**
 * ประทับว่าปลายทางไหนรับไฟล์นี้ไปแล้ว (เช่น `attachments:<id แถว>`) — เขียนเฉพาะใบรับที่ **ยังไม่ถูกประทับ**
 * (`claimedBy` ว่าง) ⇒ ประทับแรกชนะ ไม่มีการเขียนทับ
 *
 * ⚠️ best-effort: ผู้เรียกเขียนแถวของตัวเองสำเร็จไปแล้ว — พังให้ log แล้วเดินต่อ (ด่าน "มีแถวอื่นถือ" ยังกันการแนบซ้ำอยู่)
 * ⚠️ ไม่มีใบรับให้ประทับ (โหมด observe ปล่อยไฟล์ที่ไม่มีใบรับผ่าน) = ไม่มีแถวถูกแก้ ไม่ใช่ error
 * @returns {Promise<{ error: object|null }>}
 */
export async function claimUploadReceipt(supabase, { driveFileId, claimedBy, now } = {}) {
  if (!validId(driveFileId)) return { error: { message: 'ประทับใบรับไม่ได้ — รหัสไฟล์ไม่ถูกต้อง' } };
  if (typeof claimedBy !== 'string' || !claimedBy) return { error: { message: 'ประทับใบรับไม่ได้ — ไม่ระบุปลายทาง' } };
  try {
    const { error } = await supabase.from('upload_receipts')
      .update({ claimedBy: claimedBy.slice(0, TEXT_MAX), claimedAt: new Date(toMs(now)).toISOString() })
      .eq('driveFileId', driveFileId)
      .is('claimedBy', null);
    return { error: error || null };
  } catch (err) {
    return { error: asError(err) };
  }
}

/**
 * ทะเบียนใบรับอ่านได้ไหม — อ่านหนึ่งแถว (มีเพดาน) ให้หน้าตรวจที่เก็บไฟล์ของแอดมินใช้ภายหลัง
 * (ตารางยังไม่มี = ลืมรัน 0406 ⇒ `ok: false` พร้อมเหตุ ก่อนที่ผู้ใช้จะเจอ 503 ตอนแนบ)
 * @returns {Promise<{ ok: boolean, error: object|null }>}
 */
export async function ledgerHealth(supabase) {
  try {
    const { error } = await supabase.from('upload_receipts').select('"driveFileId"').limit(1);
    return { ok: !error, error: error || null };
  } catch (err) {
    return { ok: false, error: asError(err) };
  }
}
