// ── ตัวกรองของหน้าทะเบียนสินค้า — ตัวเดียวของทั้งระบบ ────────────────────
//
// ใช้ทั้ง **บนจอ** (app/database/products/page.js) และ **ตอนส่งออก Excel**
// (api/products/export) เพราะปุ่มโหลดสัญญาว่า "ได้แถวเท่าที่ตาเห็น" — ถ้าตรรกะ
// แยกเป็นสองชุด วันที่ใครแก้ตัวกรองบนจอแล้วลืมอีกฝั่ง ไฟล์กับตารางจะไม่ตรงกัน
// โดยไม่มีอะไรเตือน (ผู้ใช้เจอตอนกระทบยอดแล้วเลขไม่ลง ซึ่งสายไปแล้ว)
//
// ทุกฟังก์ชันบริสุทธิ์ ไม่มี React ไม่มี DB — เรียกได้ทั้งสองฝั่ง
import { categoryOf, categoryFlags } from '@/lib/master/categoryOf';
import { categoryNameBoth } from '@/lib/master/productCategoryOptions';
import { approvalStatusOf } from '@/lib/master/approvalStatus';

/** รหัสหมวดของสินค้า — ใช้ค่าที่บันทึกไว้ก่อน ถอยไปถอดจาก fgCode ให้แถวเก่า */
export function productCategoryCode(product) {
  return product?.categoryCode || categoryOf(product?.fgCode);
}

/**
 * ป้ายหมวดสำหรับแสดงผล/ค้นหา — { main, sub } หรือ null ถ้าหาไม่เจอ
 * sub = "EN · TH" (มติ 2026-08-12) · หมวดที่ชื่อว่างทั้งสองภาษาถอยไปโชว์รหัส
 */
export function productCategoryLabel(product, productTypes = []) {
  const code = productCategoryCode(product);
  if (!code) return null;
  const info = productTypes.find((t) => `${t.mainCategoryCode}-${t.typeCode}` === code);
  if (!info) return null;
  return { main: info.mainCategoryName, sub: categoryNameBoth(info) || code };
}

/** ช่องที่คำค้นวิ่งไล่ — รหัส ชื่อสองภาษา แบรนด์สองภาษา และหมวด (รหัส+ชื่อ) */
function searchHaystack(product, productTypes) {
  const cat = productCategoryLabel(product, productTypes);
  return [
    product.fgCode, product.productDescription, product.productDescriptionEn,
    product.brandName, product.brandNameEn,
    product.categoryCode, cat?.main, cat?.sub,
  ];
}

/**
 * กรองทะเบียนสินค้าตามชุดตัวกรองของหน้า list
 *
 * @param products  แถวจาก /api/products?manage=1
 * @param search    คำค้น (ยังไม่ trim/lowercase ก็ได้)
 * @param statuses  สถานะอนุมัติที่เลือก — ว่าง = ทั้งหมด
 * @param registrations สถานะขึ้นทะเบียนสรรพสามิตที่เลือก — ว่าง = ทั้งหมด
 *   ⚠️ มิตินี้มีความหมายเฉพาะหมวดสรรพสามิต: เลือกแล้ว **หมวดอื่นถูกตัดออกทั้งหมด**
 * @param showInactive true = รวมสินค้าที่เลิกใช้
 * @param productTypes ทะเบียนหมวด — ต้องส่งมาด้วย ไม่งั้นค้นชื่อหมวดไม่เจอ
 *   และตัวกรองขึ้นทะเบียนจะตัดทุกแถวทิ้ง (categoryFlags หาไม่เจอ = ไม่ใช่สรรพสามิต)
 */
export function filterProducts(products = [], {
  search = '', statuses = [], registrations = [], showInactive = false, productTypes = [],
} = {}) {
  const q = String(search || '').trim().toLowerCase();
  return products.filter((p) => {
    if (!showInactive && p.isActive === false) return false;
    if (statuses.length && !statuses.includes(approvalStatusOf(p))) return false;
    if (registrations.length) {
      const excise = categoryFlags(productCategoryCode(p), productTypes).isExcise;
      if (!excise || !registrations.includes(p.registrationStatus || 'none')) return false;
    }
    if (!q) return true;
    return searchHaystack(p, productTypes).some((v) => (v || '').toLowerCase().includes(q));
  });
}
