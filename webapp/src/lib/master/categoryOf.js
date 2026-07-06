// Pure FG-code parsing — no server imports, safe for client components too.
// FG codes look like 'FG-AAA-BB-CCC-DDDD' → category 'BB-CCC' (e.g. '01-002').
export function categoryOf(fgCode) {
  if (!fgCode || typeof fgCode !== 'string') return null;
  const m = fgCode.match(/(\d{2})-(\d{3})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

// '01-002' (body perfume) is the one category subject to excise tax.
// Always derive this from categoryOf() — never re-check fgCode.includes(...)
// separately, or the taxability flag can disagree with the stored category.
export function isExciseCategory(categoryCode) {
  return categoryCode === '01-002';
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
