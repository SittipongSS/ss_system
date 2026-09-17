// ── เลขที่เอกสารใบสเปคสินค้า — FM-SA-04-DDMMYY-XXX (mig 0364) ────────────────
//
// ⭐ รูปแบบเดียวกับ PDR (`lib/requests/pdrRefNo.js`): DDMMYY ของวันที่ออก (YY เป็น
// **พ.ศ.** 2 หลัก) + เลขรัน 3 หลัก **ตัดรอบทุกเดือน** · ต่างกันแค่มีรหัสแบบฟอร์ม
// อยู่ในตัวเลขด้วย เพราะเลขนี้ถูกอ้างในอีเมล/แชตโดยไม่มีหัวเอกสารติดไปด้วย
//
// ⚠️ **ตัวนับอยู่ใน SQL ไม่ใช่ที่นี่** (บทเรียน mig 0243/0271) — ฝั่งนี้รู้แค่
// "รูปแบบของเลข" แล้วส่งชิ้นส่วนให้ RPC ออกเลขพร้อม INSERT ในคำสั่งเดียว
// ห้ามประกอบเลขเองแล้วส่งไปเขียน ไม่งั้นตัวนับวิ่งเกินเลขที่ออกจริง
//
// 🪤 **`month` เป็น YYMM ค.ศ. แต่ `prefix` เป็น DDMMYY พ.ศ.** — สองรูปนี้อยู่ในเลข
// เดียวกันโดยตั้งใจ (คีย์ตัวนับใช้ของระบบ · เลขบนกระดาษใช้ของคนอ่าน) · เผลอสลับ
// เมื่อไร ตัวนับจะตัดรอบผิดเดือนแบบที่ไม่มีใครเห็นจนเลขซ้ำ
// 🪤 `like` ปิดตาสองตัวแรก (วัน) ด้วย `_` — seed ด้วย prefix เต็มจะไม่เจออะไรเลย
// เพราะ prefix เปลี่ยนทุกวัน แล้วตัวนับที่หายจะเริ่มนับ 1 ใหม่ทับเลขที่ออกไปแล้ว
import { businessDate, businessMonthKey } from '@/lib/businessDate';
import { BUDDHIST_YEAR_OFFSET } from '@/lib/format';

export const PRODUCT_SPEC_DOC_PREFIX = 'FM-SA-04';
export const PRODUCT_SPEC_DOC_RUNNING_WIDTH = 3;

export function productSpecDocNoParts(now = new Date()) {
  const [year, month, day] = businessDate(now).split('-');
  const beYear = String((Number(year) + BUDDHIST_YEAR_OFFSET) % 100).padStart(2, '0');
  return {
    month: businessMonthKey(now),
    prefix: `${PRODUCT_SPEC_DOC_PREFIX}-${day}${month}${beYear}-`,
    like: `${PRODUCT_SPEC_DOC_PREFIX}-__${month}${beYear}-%`,
    width: PRODUCT_SPEC_DOC_RUNNING_WIDTH,
  };
}

/** แยกชิ้นส่วนกลับจากเลขที่ออกไปแล้ว — ใช้ตอนเรียงและตอนอ่านเลขบนตาราง */
export function parseProductSpecDocNo(docNo) {
  const match = String(docNo || '').match(/^FM-SA-04-(\d{2})(\d{2})(\d{2})-(\d{3})$/);
  if (!match) return null;
  const [, day, month, beYear, running] = match;
  return {
    day, month, beYear, running: Number(running),
    dateText: `${day}/${month}/${Number(beYear) + 2500}`,
  };
}
