// ── ไฟล์หลักฐานหน้างานของนัด (รูปหน้างาน · ลายเซ็นผู้รับงาน) — เปิดผ่านระบบ ไม่ใช่ลิงก์ Drive ตรง ──
//
// 🐞 เดิมจอ (ใบส่งงาน · แผ่นปิดงาน) ลิงก์ `webViewLink` ของ Drive ที่เก็บอยู่ในแถวตรง ๆ แต่ไฟล์อยู่ใน
//    Shared Drive ที่มีสมาชิกแค่ 2 ราย (เจ้าของระบบ + service account) และตอนอัปไม่มีการให้สิทธิ์รายไฟล์
//    ⇒ TS และฝ่ายขายกดแล้วเจอหน้า "ขอสิทธิ์เข้าถึง" ของ Google ทุกคน · ห้ามแก้ด้วยการเพิ่มคนเข้า
//    Shared Drive หรือแชร์ทั้งโดเมน (มติ #1274) ⇒ server สตรีมไบต์ให้แทน ด้วยด่านเดียวกับใบส่งงาน
//    (`GET /api/service/visits/[id]/file` · `requireVisit({ report: true })`)
//
// ⭐ ชี้ไฟล์ด้วย **กุญแจของ URL** (`?h=`) · ลำดับในแถว (`?i=`) หรือ `?sig=1` — แพตเทิร์นเดียวกับไฟล์ในเธรดอัปเดต
//    (`/api/updates/[id]/file?i=`) · **ไม่รับ Drive id จาก query เด็ดขาด**: server หยิบ URL จากแถวของนัด
//    แล้วแกะ id เอง ⇒ สตรีมได้เฉพาะไฟล์ที่นัดนี้อ้างถึง
// 🔑 `?h=` (แผน operation-crew C5 · R14) — ลบรูปทีละรูปได้แล้ว (`visits/[id]/photos`) ⇒ ลบรูปหนึ่งแล้ว **ลำดับ
//    ของรูปถัดไปเลื่อนหมด** ⇒ ลิงก์ `?i=` ในแท็บที่เปิดค้างเปิดได้ **อีกรูปหนึ่ง** เงียบ ๆ · กุญแจคิดจาก URL ของรูป
//    ⇒ รูปเดิมเสมอ หรือ 404 "รูปนี้ถูกลบแล้ว" · `?i=` ยังรับอยู่สำหรับลิงก์เก่า
// ⚠️ แถวยังเก็บ URL ของ Drive เหมือนเดิม (ไม่ย้ายข้อมูล) — แปลงเป็นลิงก์ของระบบตอนแสดงผลเท่านั้น
import { parseDriveId } from '@/lib/driveId';

export const VISIT_SIGNATURE_FILE_NAME = 'ลายเซ็นผู้รับงาน';

const cleanUrl = (value) => String(value || '').trim();

export const VISIT_FILE_GONE_ERROR = 'รูปนี้ถูกลบแล้ว';

/**
 * กุญแจคงที่ของรูปหนึ่งรูป = แฮชของ URL (cyrb53 · ฐาน 36 · ≤ 11 ตัว) — URL ว่าง = null
 * ⚠️ **คิดได้ทั้งเบราว์เซอร์และ server** (ไม่ใช้ `node:crypto`) — จอสร้างลิงก์ · server หาไฟล์ · เส้นลบรูปชี้รูป
 *    ด้วยค่าเดียวกันนี้ · ไม่ใช่ความลับ (ด่านจริงคือไฟล์ต้องอยู่ในแถวของนัด) แค่ต้องไม่ชนกันในนัดเดียว
 */
export function visitFileKey(url) {
  const text = cleanUrl(url);
  if (!text) return null;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const FILE_KEY_RE = /^[0-9a-z]{1,16}$/;

/** ค่า `?h=` ที่รูปร่างถูก (ตัวเลข/อักษรเล็ก ≤ 16 ตัว) หรือ null — เส้นลบรูปใช้ตรวจก่อนแตะแถว */
export function cleanVisitFileKey(raw) {
  const key = String(raw ?? '').trim();
  return FILE_KEY_RE.test(key) ? key : null;
}

/**
 * ลิงก์เปิดไฟล์ของนัดผ่านระบบ — `{ url }` = รูปนั้นตามกุญแจของ URL (**ใช้ทางนี้เมื่อมี URL** · R14)
 * · `{ index }` = รูปลำดับนั้นใน `attachments` (ลิงก์เก่า/จอที่มีแต่ลำดับ) · `{ signature: true }` = ลายเซ็น
 * ลำดับที่ไม่ใช่จำนวนเต็มไม่ติดลบ = null (ผู้เรียกแสดงเป็นป้ายเฉย ๆ ไม่ใช่ลิงก์เสีย)
 */
export function visitFileHref(visitId, { index = null, signature = false, url = null } = {}) {
  if (!visitId) return null;
  const base = `/api/service/visits/${encodeURIComponent(visitId)}/file`;
  if (signature) return `${base}?sig=1`;
  const key = visitFileKey(url);
  if (key) return `${base}?h=${key}`;
  return Number.isInteger(index) && index >= 0 ? `${base}?i=${index}` : null;
}

/**
 * ไฟล์ที่ query ชี้ในแถวนัด → `{ url, name }` · ไม่มีไฟล์นั้นในนัดนี้ = null
 * `sig=1` มาก่อน `h` มาก่อน `i` · `i` ต้องเป็นตัวเลขล้วนที่อยู่ในช่วง — **ไม่เดาเป็น 0** แบบเธรดอัปเดต
 * (ลิงก์ที่เสียต้องได้ "ไม่พบ" ไม่ใช่รูปแรกของใบ)
 * ⚠️ มี `h` มาแล้วหาไม่เจอ = null **ไม่ถอยไปใช้ `i`** — รูปที่ถูกลบต้องได้ 404 ไม่ใช่รูปที่เลื่อนขึ้นมาแทนที่
 * @param {object} visit แถว service_visits
 * @param {URLSearchParams} params
 */
export function pickVisitFile(visit, params) {
  if (params?.get('sig') === '1') {
    const url = cleanUrl(visit?.customerSignatureUrl);
    return url ? { url, name: VISIT_SIGNATURE_FILE_NAME } : null;
  }
  const list = Array.isArray(visit?.attachments) ? visit.attachments : [];
  const photo = (att) => {
    const url = cleanUrl(att?.url);
    return url ? { url, name: String(att?.name || '').trim() || 'รูปหน้างาน' } : null;
  };
  if (params?.get('h') != null) {
    const key = cleanVisitFileKey(params.get('h'));
    return key ? photo(list.find((att) => visitFileKey(att?.url) === key)) : null;
  }
  const raw = params?.get('i');
  if (raw == null || !/^\d{1,4}$/.test(raw)) return null;
  return photo(list[Number(raw)]);
}

/**
 * ตัดสินครบในตัวเดียวว่าจะสตรีมไฟล์ไหน — route เหลือแค่คุยกับ Drive
 * คืน `{ driveFileId, name }` หรือ `{ status, error }`
 */
export function visitFileTarget(visit, params) {
  const file = pickVisitFile(visit, params);
  // ลิงก์กุญแจที่หาไม่เจอ = รูปถูกลบออกจากนัดไปแล้ว (ลิงก์ในแท็บเก่า) — บอกตรง ๆ ไม่ใช่ "ไม่พบ" กลาง ๆ
  if (!file) return { status: 404, error: params?.get('h') != null ? VISIT_FILE_GONE_ERROR : 'ไม่พบไฟล์นี้ในนัด' };
  const driveFileId = parseDriveId(file.url);
  /* URL ที่ไม่ใช่ Drive = ไม่ใช่ไฟล์ที่ระบบอัปเอง (ทางอัปของนัดมีทางเดียวคือ Drive) ⇒ **ไม่ redirect ตาม**
     ไม่งั้นเส้นนี้เป็น open redirect จากโดเมนของแอปตามค่าที่อยู่ในแถว (ดู /api/master/attachments/[id]/file) */
  if (!driveFileId) return { status: 404, error: 'ไฟล์นี้ไม่ได้อยู่ในที่เก็บของระบบ' };
  return { driveFileId, name: file.name };
}

/**
 * แผ่นปิดงาน: ไฟล์ในฟอร์ม (ตาม URL) → ลิงก์ของระบบ ถ้าไฟล์นั้น **บันทึกอยู่ในแถวแล้ว** · ไม่อยู่ = null
 * (ไฟล์ที่เพิ่งอัปรอบนี้ server ยังไม่รู้จัก ⇒ จอเปิดจากไบต์ในเครื่องแทน)
 * ⭐ ลิงก์เป็นกุญแจของ URL (`?h=`) ไม่ใช่ลำดับ — แถวเรียงใหม่/มีคนลบรูปก่อนหน้า ลิงก์ยังชี้รูปเดิม (R14)
 * @param {{ attachments?: object[], customerSignatureUrl?: string } | null} saved แถวล่าสุดจาก server
 */
export function savedVisitFileHref(visitId, saved, url) {
  const target = cleanUrl(url);
  if (!target || !saved) return null;
  if (cleanUrl(saved.customerSignatureUrl) === target) return visitFileHref(visitId, { signature: true });
  const list = Array.isArray(saved.attachments) ? saved.attachments : [];
  return list.some((att) => cleanUrl(att?.url) === target) ? visitFileHref(visitId, { url: target }) : null;
}
