// Pure FG-code parsing — no server imports, safe for client components too.
// FG codes look like 'FG-AAA-BB-CCC-DDDD' → category 'BB-CCC' (e.g. '01-002').
export function categoryOf(fgCode) {
  if (!fgCode || typeof fgCode !== 'string') return null;
  const m = fgCode.match(/(\d{2})-(\d{3})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

// กลุ่มหลักของหมวด = 2 หลักแรกของรหัสหมวด 'XX-YYY' (XX = mainCategoryCode)
export function mainCategoryOf(fgCode) {
  const code = categoryOf(fgCode);
  return code ? code.slice(0, 2) : null;
}

// ── ราคาขายปลีกโผล่เฉพาะกลุ่มหลัก 01 (มติผู้ใช้ 2026-08-05) ────────────────
// ⚠️ นี่คือ "เลขหมวดตายตัว" ซึ่งเป็นสิ่งที่มติ 2026-07-20 ด้านล่างเพิ่งเลิกใช้กับ
// ภาษี/อย. (ย้ายไปช่องติ๊กบนหมวดแทน) — ผู้ใช้เลือกทางนี้เองหลังเห็นสองทางเลือก
// ผลที่ตามมาถ้าวันหนึ่งมีหมวดใหม่ที่ต้องกรอกราคาขายปลีก: **ต้องมาแก้โค้ดบรรทัดนี้**
// ไม่ใช่ติ๊กเอาที่หน้าหมวดสินค้า · ถ้าถึงตอนนั้นให้ย้ายมาเป็นช่องติ๊กเหมือน isExcise
export const RETAIL_PRICE_MAIN_CATEGORY = '01';

// 🐞 **หมวดที่ต้องเสียภาษีต้องกรอกราคาขายปลีกได้เสมอ** ไม่ว่าจะอยู่กลุ่มไหน:
// ภาษีสรรพสามิตคิดจากราคาขายปลีก (products route: retailPriceExVat × 8%) ⇒ หมวดที่
// ติ๊ก isExcise แต่ไม่ได้อยู่กลุ่ม 01 จะไม่มีช่องให้กรอก ⇒ retailPriceIncVat = 0 ⇒
// **exciseTax = 0 เงียบ ๆ ทั้งที่ต้องเสียภาษี** = ยื่นภาษีขาดโดยไม่มีอะไรฟ้อง
// จึงเป็น "กลุ่ม 01 **หรือ** หมวดที่ติ๊กสรรพสามิต" ไม่ใช่กลุ่ม 01 อย่างเดียว
// (ผู้เรียกที่ยังไม่มีรายการหมวด ส่งมาไม่ได้ก็ได้ — จะเหลือกติกากลุ่ม 01 เหมือนเดิม)
export function showsRetailPrice(fgCode, productTypes = []) {
  return showsRetailPriceForCategory(categoryOf(fgCode), productTypes);
}

// เหมือนกันแต่รับรหัสหมวดตรง ๆ — ฟอร์มสินค้าโหมด "ระบบใหม่" รู้หมวดตั้งแต่ตอนเลือก
// ทั้งที่รหัส FG ยังไม่ถูกประกอบ (เลขรันมาจาก server ตอนบันทึก) ⇒ ถ้าผูกกับ fgCode
// อย่างเดียว ช่องราคาขายปลีกจะไม่โผล่เลยตอนสร้าง แล้วสินค้าสรรพสามิตจะถูกบันทึกโดยไม่มี
// ราคาขายปลีก = ภาษีคิดเป็น 0 เงียบ ๆ (บั๊กเดียวกับที่คอมเมนต์ด้านบนเล่าไว้)
export function showsRetailPriceForCategory(categoryCode, productTypes = []) {
  if (categoryCode && String(categoryCode).slice(0, 2) === RETAIL_PRICE_MAIN_CATEGORY) return true;
  return isExciseCategory(categoryCode, productTypes);
}

// มติ 2026-07-20: ภาษีสรรพสามิต/จดแจ้ง อย. ยึด "ช่องติ๊กบนหมวดสินค้า"
// (product_types.isExcise / requiresFdaNotice, mig 0131) — เลิก hardcode '01-002'.
// ผู้เรียกต้องส่งรายการหมวด (productTypes rows) ที่โหลดมาแล้ว; ไม่รู้จักหมวด/ไม่ส่ง
// รายการ → false ทุกธง (จงใจไม่มี fallback รหัสตายตัว เพื่อไม่ให้ค่าที่ติ๊กใน DB
// ถูกทับเงียบ ๆ). categoryCode ต้องมาจาก categoryOf()/ค่าที่เก็บไว้ — อย่า parse
// fgCode เองซ้ำ ไม่งั้นธงภาษีจะเพี้ยนจากหมวดที่เก็บจริง.
export function categoryFlags(categoryCode, productTypes = []) {
  const row = (productTypes || []).find(
    (t) => `${t.mainCategoryCode}-${t.typeCode}` === categoryCode,
  );
  return { isExcise: !!row?.isExcise, requiresFdaNotice: !!row?.requiresFdaNotice };
}

/**
 * แถวหมวดจากรหัสประกอบ `MM-TTT` — คืน row หรือ null
 *
 * ⚠️ **รหัสที่ระบบเก็บคือ `mainCategoryCode-typeCode`** ไม่ใช่ `typeCode` เดี่ยว ๆ
 * (ทะเบียนมี typeCode ซ้ำข้ามหมวดหลักได้) · เทียบผิดคีย์แล้วป้ายจะขึ้นเป็นรหัสดิบ
 * ทั้งที่ทะเบียนมีชื่ออยู่ — เจอจริงตอนทำ 0227 จึงยกมาเป็นตัวกลางตัวนี้
 */
export function categoryRow(categoryCode, productTypes = []) {
  if (!categoryCode) return null;
  return (productTypes || []).find(
    (t) => `${t.mainCategoryCode}-${t.typeCode}` === categoryCode,
  ) || null;
}

/** ป้ายอ่านออกของหมวด — "รหัส ชื่อ" · ไม่พบในทะเบียนคืนรหัสดิบ (ห้ามคืนค่าว่าง) */
export function categoryLabel(categoryCode, productTypes = []) {
  const row = categoryRow(categoryCode, productTypes);
  if (!row) return String(categoryCode ?? '');
  return [categoryCode, row.nameTh || row.nameEn].filter(Boolean).join(' ');
}

export function isExciseCategory(categoryCode, productTypes = []) {
  return categoryFlags(categoryCode, productTypes).isExcise;
}

// Resolve an fgCode against a productTypes list → { found, code, typeInfo }
// (or null for an empty fgCode). Client-safe: takes the already-loaded list,
// no DB access. Shared by the product form + edit modal so the category
// lookup lives in one place.
export function categoryInfo(fgCode, productTypes = []) {
  if (!fgCode) return null;
  return categoryInfoOf(categoryOf(fgCode), productTypes);
}

// เหมือน categoryInfo แต่รับ "รหัสหมวด" ตรง ๆ — ใช้เมื่อหมวดมาจากตัวเลือกหมวด
// (ProductCategorySelect) ไม่ได้มาจากการอ่านย้อนจากรหัส FG ที่พิมพ์ (มติ 2026-08-12:
// โหมดระบบใหม่เลือกหมวดก่อน แล้วรหัสค่อยประกอบตาม — ไม่ใช่พิมพ์รหัสแล้ว parse กลับ)
export function categoryInfoOf(categoryCode, productTypes = []) {
  if (!categoryCode) return { found: false, code: null };
  const typeInfo = productTypes.find((t) => `${t.mainCategoryCode}-${t.typeCode}` === categoryCode);
  return { found: !!typeInfo, code: categoryCode, typeInfo };
}
