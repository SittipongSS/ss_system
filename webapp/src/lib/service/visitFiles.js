// ── ไฟล์หลักฐานหน้างานของนัด (รูปหน้างาน · ลายเซ็นผู้รับงาน) — เปิดผ่านระบบ ไม่ใช่ลิงก์ Drive ตรง ──
//
// 🐞 เดิมจอ (ใบส่งงาน · แผ่นปิดงาน) ลิงก์ `webViewLink` ของ Drive ที่เก็บอยู่ในแถวตรง ๆ แต่ไฟล์อยู่ใน
//    Shared Drive ที่มีสมาชิกแค่ 2 ราย (เจ้าของระบบ + service account) และตอนอัปไม่มีการให้สิทธิ์รายไฟล์
//    ⇒ TS และฝ่ายขายกดแล้วเจอหน้า "ขอสิทธิ์เข้าถึง" ของ Google ทุกคน · ห้ามแก้ด้วยการเพิ่มคนเข้า
//    Shared Drive หรือแชร์ทั้งโดเมน (มติ #1274) ⇒ server สตรีมไบต์ให้แทน ด้วยด่านเดียวกับใบส่งงาน
//    (`GET /api/service/visits/[id]/file` · `requireVisit({ report: true })`)
//
// ⭐ ชี้ไฟล์ด้วย **ลำดับในแถว** (`?i=`) หรือ `?sig=1` — แพตเทิร์นเดียวกับไฟล์ในเธรดอัปเดต
//    (`/api/updates/[id]/file?i=`) · **ไม่รับ Drive id จาก query เด็ดขาด**: server หยิบ URL จากแถวของนัด
//    แล้วแกะ id เอง ⇒ สตรีมได้เฉพาะไฟล์ที่นัดนี้อ้างถึง
// ⚠️ แถวยังเก็บ URL ของ Drive เหมือนเดิม (ไม่ย้ายข้อมูล) — แปลงเป็นลิงก์ของระบบตอนแสดงผลเท่านั้น
import { parseDriveId } from '@/lib/driveId';

export const VISIT_SIGNATURE_FILE_NAME = 'ลายเซ็นผู้รับงาน';

const cleanUrl = (value) => String(value || '').trim();

/**
 * ลิงก์เปิดไฟล์ของนัดผ่านระบบ — `{ index }` = รูปลำดับนั้นใน `attachments` · `{ signature: true }` = ลายเซ็น
 * ลำดับที่ไม่ใช่จำนวนเต็มไม่ติดลบ = null (ผู้เรียกแสดงเป็นป้ายเฉย ๆ ไม่ใช่ลิงก์เสีย)
 */
export function visitFileHref(visitId, { index = null, signature = false } = {}) {
  if (!visitId) return null;
  const base = `/api/service/visits/${encodeURIComponent(visitId)}/file`;
  if (signature) return `${base}?sig=1`;
  return Number.isInteger(index) && index >= 0 ? `${base}?i=${index}` : null;
}

/**
 * ไฟล์ที่ query ชี้ในแถวนัด → `{ url, name }` · ไม่มีไฟล์นั้นในนัดนี้ = null
 * `sig=1` มาก่อน `i` · `i` ต้องเป็นตัวเลขล้วนที่อยู่ในช่วง — **ไม่เดาเป็น 0** แบบเธรดอัปเดต
 * (ลิงก์ที่เสียต้องได้ "ไม่พบ" ไม่ใช่รูปแรกของใบ)
 * @param {object} visit แถว service_visits
 * @param {URLSearchParams} params
 */
export function pickVisitFile(visit, params) {
  if (params?.get('sig') === '1') {
    const url = cleanUrl(visit?.customerSignatureUrl);
    return url ? { url, name: VISIT_SIGNATURE_FILE_NAME } : null;
  }
  const raw = params?.get('i');
  if (raw == null || !/^\d{1,4}$/.test(raw)) return null;
  const list = Array.isArray(visit?.attachments) ? visit.attachments : [];
  const att = list[Number(raw)];
  const url = cleanUrl(att?.url);
  return url ? { url, name: String(att?.name || '').trim() || 'รูปหน้างาน' } : null;
}

/**
 * ตัดสินครบในตัวเดียวว่าจะสตรีมไฟล์ไหน — route เหลือแค่คุยกับ Drive
 * คืน `{ driveFileId, name }` หรือ `{ status, error }`
 */
export function visitFileTarget(visit, params) {
  const file = pickVisitFile(visit, params);
  if (!file) return { status: 404, error: 'ไม่พบไฟล์นี้ในนัด' };
  const driveFileId = parseDriveId(file.url);
  /* URL ที่ไม่ใช่ Drive = ไม่ใช่ไฟล์ที่ระบบอัปเอง (ทางอัปของนัดมีทางเดียวคือ Drive) ⇒ **ไม่ redirect ตาม**
     ไม่งั้นเส้นนี้เป็น open redirect จากโดเมนของแอปตามค่าที่อยู่ในแถว (ดู /api/master/attachments/[id]/file) */
  if (!driveFileId) return { status: 404, error: 'ไฟล์นี้ไม่ได้อยู่ในที่เก็บของระบบ' };
  return { driveFileId, name: file.name };
}

/**
 * แผ่นปิดงาน: ไฟล์ในฟอร์ม (ตาม URL) → ลิงก์ของระบบ ถ้าไฟล์นั้น **บันทึกอยู่ในแถวแล้ว** · ไม่อยู่ = null
 * (ไฟล์ที่เพิ่งอัปรอบนี้ server ยังไม่รู้จัก ⇒ จอเปิดจากไบต์ในเครื่องแทน)
 * @param {{ attachments?: object[], customerSignatureUrl?: string } | null} saved แถวล่าสุดจาก server
 */
export function savedVisitFileHref(visitId, saved, url) {
  const target = cleanUrl(url);
  if (!target || !saved) return null;
  if (cleanUrl(saved.customerSignatureUrl) === target) return visitFileHref(visitId, { signature: true });
  const list = Array.isArray(saved.attachments) ? saved.attachments : [];
  const index = list.findIndex((att) => cleanUrl(att?.url) === target);
  return index >= 0 ? visitFileHref(visitId, { index }) : null;
}
