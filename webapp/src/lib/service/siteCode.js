// ── รหัสไซต์บริการ `ST-XXXX-AA-BBB-CCCC` (มติผู้ใช้ 2026-08-29) ────────────
//
//   XXXX = รหัสลูกค้า (AR) เติมศูนย์ครบ 4 หลัก — ท่อนเดียวกับรหัส FG
//   AA   = ภาค (01–07)
//   BBB  = ตัวย่อจังหวัด
//   CCCC = เลขรัน 4 หลัก **ไม่ซ้ำทั้งระบบ** เริ่ม 1001 (เพดาน 9999 ไซต์)
//
// ⭐ **แทนที่รูปเดิม `SS-YYMMNNNN`** — รูปเดิมบอกได้อย่างเดียวว่าเปิดเดือนไหน
// ส่วนรูปใหม่ตอบ "ของใคร ภาคไหน จังหวัดอะไร" ได้จากตัวรหัสเอง ซึ่งเป็นสามคำถามแรก
// ที่ทีมบริการถามทุกครั้งก่อนวางแผนเดินทาง (แพตเทิร์นเดียวกับรหัส FG ที่ใช้อยู่แล้ว)
//
// 🔴 **รหัสตรึงค่าที่ประกอบมันไว้ตลอดไป** — ย้ายไซต์ข้ามลูกค้า หรือแก้จังหวัดทีหลัง
// **ไม่ออกรหัสใหม่และไม่แก้รหัสเดิม** · รหัสคือ *ตัวตน* ไม่ใช่ *สรุปสถานะปัจจุบัน*
// (กติกาเดียวกับ `docNo` ของคำร้องที่ trigger ทำให้แก้ไม่ได้ · และกับ AR-109 ที่
//  ระบบสหมิตรอ้างค่าตรง ๆ) ⇒ ที่อยู่ที่เปลี่ยนแล้วอ่านจากคอลัมน์ ไม่ใช่จากรหัส
//
// ⚠️ เลขรันอยู่ **ท้ายสุด** โดยตั้งใจ — ตัวออกรหัสกลาง (`create_entity_rows_with_code`)
// ต่อเลขรันท้าย prefix เสมอ ⇒ รูปนี้ออกได้โดยไม่ต้องแก้ SQL สักบรรทัด
import { customerCodeSegment } from '@/lib/master/masterCodes';
import { provinceAbbr, provinceRegion } from '@/lib/master/thaiProvinces';

export const SITE_CODE_PREFIX = 'ST';
export const SITE_RUN_WIDTH = 4;
export const SITE_RUN_START = 1000;           // ใบแรกได้ 1001 (RPC คืนค่าหลัง +1)
/** ถังนับของเลขรันไซต์ — `'-'` = นับยาวตัวเดียวตลอดกาล ไม่รีเซ็ตรายเดือน (แบบ AR/FG) */
export const SITE_RUN_BUCKET = '-';

export const SITE_CODE_RE = /^ST-\d{4}-\d{2}-[A-Z]{3}-\d{4}$/;
/** รูปเดิมก่อนมติ 2026-08-29 — เก็บไว้เพื่ออ่านของเก่า ไม่ใช่เพื่อออกใหม่ */
export const LEGACY_SITE_CODE_RE = /^SS-\d{8}$/;

export const SITE_CODE_HINT = 'ST-XXXX-AA-BBB-CCCC';

/**
 * ท่อนหน้าเลขรันของรหัสไซต์ — คืน `{ prefix, error }`
 *
 * ⚠️ **คืนเหตุผลเป็นภาษาคน ไม่ใช่ null เปล่า** — สองเหตุที่ประกอบไม่ได้ (ลูกค้ายังไม่มี
 * รหัส AR · ยังไม่ได้เลือกจังหวัด) แก้คนละที่กันคนละคน ⇒ ข้อความต้องบอกว่าไปแก้ตรงไหน
 */
export function siteCodePrefix({ arCode, provinceCode } = {}) {
  const customer = customerCodeSegment(arCode);
  if (!customer) {
    return {
      prefix: null,
      error: 'ลูกค้ารายนี้ยังไม่มีรหัสลูกค้า (AR) — ออกรหัสที่ทะเบียนลูกค้าก่อนจึงสร้างไซต์ได้',
    };
  }
  const region = provinceRegion(provinceCode);
  const abbr = provinceAbbr(provinceCode);
  if (!region || !abbr) {
    return { prefix: null, error: 'ต้องเลือกจังหวัดของไซต์ — รหัสไซต์ประกอบจากภาคและจังหวัด' };
  }
  return { prefix: `${SITE_CODE_PREFIX}-${customer}-${region}-${abbr}-`, error: null };
}

/**
 * เลขรัน 4 หลักของไซต์ (ท่อน `CCCC`) — **หัวใจของรหัสโซน** ซึ่งอ้างไซต์ด้วยเลขนี้
 * คืน `null` ถ้ารหัสยังเป็นรูปเดิมหรือไม่มีรหัส ⇒ ผู้เรียกต้องบอกให้ไปออกรหัสใหม่ก่อน
 */
export function siteRunOf(siteCode) {
  const code = String(siteCode ?? '').trim().toUpperCase();
  if (!SITE_CODE_RE.test(code)) return null;
  return code.slice(-SITE_RUN_WIDTH);
}

/** แกะรหัสออกเป็นส่วน ๆ — ไว้ให้จอ/รายงานอ่านความหมายโดยไม่ต้องรู้รูปแบบเอง */
export function parseSiteCode(siteCode) {
  const code = String(siteCode ?? '').trim().toUpperCase();
  if (!SITE_CODE_RE.test(code)) return null;
  const [, customer, region, province, run] = code.split('-');
  return { customer, region, province, run };
}
