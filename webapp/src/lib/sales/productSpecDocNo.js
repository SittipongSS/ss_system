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

/**
 * เลขที่ที่ **คนอ่าน** — `DDMMYY-XXX-RR` (มติผู้ใช้ 2026-09-22 "Doc No. ใช้ form DDMMYY-XXX-RR")
 * เช่น `FM-SA-04-220969-001` + Rev 0 ⇒ `220969-001-00`
 *
 * ⭐ ใช้ทั้งบนกระดาษ (ช่อง "เลขที่" ของหัวเอกสาร · ท้ายกระดาษ) และบนจอทุกที่ที่เลขที่โชว์คู่กับ Rev
 *    (การ์ดบนหน้า SO · หน้าเอกสาร · รายการเอกสารบนหน้าสเปค · หัวแจ้งเตือน) — ที่เดียวที่ประกอบรูปนี้
 *    ห้ามต่อสตริงเองที่ปลายทาง ไม่งั้นกระดาษกับจอพิมพ์เลขใบเดียวกันคนละหน้าตา
 * ⚠️ **เลขที่ในฐาน (`product_spec_documents.docNo`) ไม่เปลี่ยน** — ยังเป็น `FM-SA-04-DDMMYY-XXX`
 *    ที่ตัวนับ/UNIQUE/ตัวค้นเลขอ้างอิง (docRefs `FM`) ใช้อยู่ · ที่นี่แค่ตัดรหัสแบบฟอร์มออก (บรรทัด
 *    แบบฟอร์ม `FM-SA-04: Rev. No.00` บนหัวกระดาษบอกอยู่แล้วว่าใบอะไร) แล้วต่อ Rev ของเอกสาร 2 หลัก
 * ⚠️ RR = Rev ของ **เอกสาร** ไม่ใช่เวอร์ชันแบบฟอร์ม — Rev ใหม่เลขที่เดิม ⇒ ส่วนหน้าเท่าเดิม RR ขยับ
 * @param docNo เลขที่ในฐาน · ว่าง = `'-'` (ตัวอย่างจากหน้าสินค้ายังไม่มีเอกสาร)
 * @param revNo Rev ของเอกสาร · ว่าง/ไม่ใช่ตัวเลข = ไม่ต่อ `-RR` (รู้แค่เลขที่ ไม่เดา Rev)
 */
export function formatSpecDocNo(docNo, revNo) {
  const raw = String(docNo ?? '').trim();
  if (!raw) return '-';
  // เลขที่รูปอื่น (ไม่ควรมี — ตัวนับออกรูปเดียว) พิมพ์ตามเดิม ดีกว่าตัดผิดที่
  const base = raw.startsWith(`${PRODUCT_SPEC_DOC_PREFIX}-`) ? raw.slice(PRODUCT_SPEC_DOC_PREFIX.length + 1) : raw;
  // 🪤 `Number(true)` = 1 — boolean ไม่ใช่ Rev (ผลตรวจรอบสอง: true เคยได้ "-01") · Rev ≥ 100 พิมพ์เต็มหลัก (ไม่ตัด)
  const known = typeof revNo !== 'boolean' && revNo !== null && revNo !== undefined && revNo !== ''
    && Number.isInteger(Number(revNo)) && Number(revNo) >= 0;
  return known ? `${base}-${String(Number(revNo)).padStart(2, '0')}` : base;
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
