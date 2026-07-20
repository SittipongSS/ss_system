// Pure FG-code parsing — no server imports, safe for client components too.
// FG codes look like 'FG-AAA-BB-CCC-DDDD' → category 'BB-CCC' (e.g. '01-002').
export function categoryOf(fgCode) {
  if (!fgCode || typeof fgCode !== 'string') return null;
  const m = fgCode.match(/(\d{2})-(\d{3})/);
  return m ? `${m[1]}-${m[2]}` : null;
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

export function isExciseCategory(categoryCode, productTypes = []) {
  return categoryFlags(categoryCode, productTypes).isExcise;
}

// Resolve an fgCode against a productTypes list → { found, code, typeInfo }
// (or null for an empty fgCode). Client-safe: takes the already-loaded list,
// no DB access. Shared by the product form + edit modal so the category
// lookup lives in one place.
export function categoryInfo(fgCode, productTypes = []) {
  if (!fgCode) return null;
  const code = categoryOf(fgCode);
  if (!code) return { found: false, code: null };
  const typeInfo = productTypes.find((t) => `${t.mainCategoryCode}-${t.typeCode}` === code);
  return { found: !!typeInfo, code, typeInfo };
}
