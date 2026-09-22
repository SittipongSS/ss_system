// ── ชื่อหมวดสินค้าที่ติดไปกับสินค้า / บรรทัด FG ในเอกสารขาย ────────────────
//
// ⭐ มติผู้ใช้ 2026-09-22: รายการ FG ในใบเสนอราคา/ใบสั่งขายต้องโชว์ชื่อหมวดสินค้าด้วย
// (ดรอปดาวน์เลือก FG · บรรทัดรายการบนจอ · เอกสารพิมพ์) — บนจอเป็นชื่อไทย
// เอกสารพิมพ์เดินตามภาษาของใบ (กติกาเดียวกับชื่อสินค้า)
//
// รหัสหมวดของสินค้า = `products.categoryCode` ที่บันทึกไว้ ถอยไปถอดจาก fgCode ให้แถวเก่า
// (กติกาเดียวกับ productCategoryCode ของหน้าทะเบียนสินค้า) · ชื่ออยู่ที่ `product_types`
// ⚠️ ทะเบียนมีหมวดที่ชื่อว่างทั้งสองภาษาจริง (prod 5 แถว) — ไม่มีชื่อ = ไม่ติดอะไรเลย
//    ไม่ใช่เอารหัสดิบไปโชว์แทน (รหัสหมวดอยู่ในรหัส FG บนบรรทัดเดียวกันอยู่แล้ว)
import { categoryOf, categoryRow } from '@/lib/master/categoryOf';

const clean = (value) => String(value ?? '').trim();

/** ชื่อหมวดสองทาง: `categoryName` ไทยก่อน · `categoryNameEn` อังกฤษก่อน — ขาดภาษาไหนถอยไปอีกภาษา */
export function categoryNamesOf(product, productTypes = []) {
  const row = categoryRow(product?.categoryCode || categoryOf(product?.fgCode), productTypes);
  const th = clean(row?.nameTh);
  const en = clean(row?.nameEn);
  if (!th && !en) return null;
  return { categoryName: th || en, categoryNameEn: en || th };
}

/** แปะ `categoryName` / `categoryNameEn` ลงแถวสินค้า (แก้แถวเดิม) — หาชื่อไม่เจอ = ไม่แปะ */
export function attachCategoryNames(products = [], productTypes = []) {
  for (const product of products || []) {
    const names = categoryNamesOf(product, productTypes);
    if (names) Object.assign(product, names);
  }
  return products;
}

/** ทะเบียนหมวดเท่าที่ต้องใช้หาชื่อ — ทั้งตาราง (~105 แถว) ถูกกว่าไล่กรองตามรหัส */
export async function loadProductTypeNames(supabase) {
  const { data, error } = await supabase
    .from('product_types')
    .select('mainCategoryCode, typeCode, nameTh, nameEn');
  if (error) throw error;
  return data || [];
}
