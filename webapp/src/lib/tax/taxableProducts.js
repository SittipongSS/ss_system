// ── "สินค้าตัวนี้ต้องเสียภาษีสรรพสามิตไหม" — กฎเดียวของทั้งระบบ ────────────
//
// 🐞 เดิมมีสองนิยามที่ไม่ตรงกัน และไม่มีใครรู้ว่าคนละอันกัน:
//   `lib/tax/reports.js`            — `isExciseTaxable === true` **หรือ** หมวดติ๊ก isExcise
//                                     (คือ "ธงรายตัวชนะ ไม่มีธงก็ดูหมวด") ⇒ ถูก
//   `app/database/products/page.js` — `isExciseTaxable !== false` เฉย ๆ ⇒ นับสินค้าใน
//                                     หมวดที่ **ไม่เสียภาษี** เข้ามาด้วยทั้งหมด
// การ์ด "ต้องเสียภาษี" บนหน้าสินค้าจึงโป่งกว่าความจริงมาตลอด และรายงานกับหน้าจอ
// ตอบคนละเลขโดยไม่มีอะไรฟ้อง ⇒ ยกมาไว้ที่นี่ที่เดียว
//
// ⚠️ ฟังก์ชันบริสุทธิ์ ไม่แตะ DB — รับ `productTypes` ที่โหลดมาแล้ว จึงเรียกได้ทั้ง
// ฝั่ง server (รายงาน) และฝั่งจอ (หน้าสินค้า)
import { isExciseCategory } from '@/lib/master/categoryOf';

/**
 * ต้องเสียภาษีสรรพสามิตไหม
 *
 * ลำดับการตัดสิน: **ธงรายตัวชนะหมวดเสมอ** (ฝ่าย RA กดยกเว้น/บังคับรายตัวได้)
 *   isExciseTaxable === true   → เสีย (ฝ่าย RA บังคับ แม้หมวดจะไม่ติ๊ก)
 *   isExciseTaxable === false  → ไม่เสีย (ฝ่าย RA ยกเว้น แม้หมวดจะติ๊ก)
 *   null / undefined           → ตามหมวด (`product_types.isExcise`, mig 0131)
 */
export function isProductExciseTaxable(product, productTypes = []) {
  if (!product) return false;
  if (product.isExciseTaxable === true) return true;
  if (product.isExciseTaxable === false) return false;
  return isExciseCategory(product.categoryCode, productTypes);
}

/**
 * ⭐ สินค้าที่ **ต้องเสียภาษีแต่ยังไม่มีราคาขายปลีก**
 *
 * 🐞 ราคาขายปลีกคือฐานของภาษีทั้งก้อน — ไม่มีราคา = `exciseTax` คิดออกมาเป็น **0**
 * ⇒ ถ้าขายแล้วยื่น จะ **ยื่นภาษีขาดโดยไม่มีอะไรฟ้อง** (พบ 17 ตัวตอนตรวจระบบ 2026-08-16)
 *
 * ⚠️ ด่านที่กันจริงอยู่ตอน **ยื่นขึ้นทะเบียน** (`lib/tax/requirements.js`) ไม่ใช่ตอน
 * สร้างสินค้า — ราคาขายปลีกมาทีหลังเสมอ บังคับตอนเปิดสินค้าเท่ากับบล็อกงานด้วยข้อมูล
 * ที่ยังไม่มีอยู่จริง · รายการนี้จึงเป็น "ที่รวมให้ตามไปเติม" ไม่ใช่ด่าน
 */
export function isMissingRetailPrice(product, productTypes = []) {
  if (!isProductExciseTaxable(product, productTypes)) return false;
  const retail = Number(product?.retailPriceIncVat);
  return !Number.isFinite(retail) || retail <= 0;
}

/** สินค้าที่ขาดราคาขายปลีกทั้งหมดในลิสต์ที่ให้มา */
export function missingRetailPriceProducts(products = [], productTypes = []) {
  return (products || []).filter((p) => isMissingRetailPrice(p, productTypes));
}
