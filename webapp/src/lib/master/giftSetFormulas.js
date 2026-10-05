// ── ชุดของขวัญ (01-037): FG หนึ่งตัวผูกได้หลายสูตร สูตรละหนึ่งหมวด ─────────────
//
// ⭐ มติผู้ใช้ 2026-10-05 (mig 0403)
//   · **เฉพาะหมวด 01-037 ชุดของขวัญ** ผูกได้มากกว่า 1 สูตร — ในกล่องมีของหลายชิ้น
//     (น้ำหอม + ก้านหอม + โลชั่น …) แต่ละชิ้นเป็นสูตรของตัวเอง
//   · ทุกแถวต้องบอกหมวดว่าสูตรนั้นเป็นอะไร · **เลือกหมวดก่อน แล้วลิสต์สูตรกรองตามหมวด**
//   · หมวดที่เลือกได้ = กลุ่ม 01 ทั้งกลุ่ม ยกเว้น 01-037 เอง (ชุดซ้อนชุดไม่มีความหมาย)
//   · ใบสเปค FM-SA-04 พิมพ์ทุกสูตร แถวละสูตร บอกหมวด (productSpecFormulaRow.js)
//
// ⚠️ FG หมวดอื่นยังใช้ `products.formulaId` ตัวเดียวเหมือนเดิม — ชุดของขวัญไม่มี "สูตรหลัก"
//    (formulaId = null เสมอ) รายการอยู่ที่ตาราง `product_formulas` ทั้งหมด
// ⚠️ ไฟล์นี้ต้องเบา (logic ล้วน) — ฟอร์มสินค้าฝั่ง client กับ API ใช้ตัวตรวจตัวเดียวกัน
//    (กฎ: เงื่อนไขที่ปุ่มรู้แต่ฟอร์มไม่รู้ห้ามมี) · ของที่แตะฐานอยู่ giftSetFormulasStore.js

export const GIFT_SET_CATEGORY_CODE = '01-037';
const COMPONENT_MAIN_CATEGORY = '01';

const clean = (value) => String(value ?? '').trim();

/** หมวดนี้เป็นชุดของขวัญ (ผูกได้หลายสูตร) ไหม */
export function isGiftSetCategory(categoryCode) {
  return clean(categoryCode) === GIFT_SET_CATEGORY_CODE;
}

/** หมวดนี้ใช้เป็นหมวดของแถวสูตรในชุดของขวัญได้ไหม — กลุ่ม 01 ยกเว้นตัวชุดเอง */
export function isGiftSetComponentCategory(categoryCode) {
  const code = clean(categoryCode);
  const [main, type] = code.split('-');
  return main === COMPONENT_MAIN_CATEGORY && !!type && code !== GIFT_SET_CATEGORY_CODE;
}

/** แถวทะเบียนหมวดที่ตัวเลือกหมวดของแถวสูตรโชว์ (ตัวกรองพักใช้อยู่ที่ ProductCategorySelect) */
export function giftSetComponentCategories(productTypes = []) {
  return (productTypes || []).filter((row) => isGiftSetComponentCategory(`${row?.mainCategoryCode}-${row?.typeCode}`));
}

/**
 * สูตรที่เลือกได้ในแถวของหมวดนี้ — สูตรหมวดเดียวกัน + สูตรที่ยังไม่ระบุหมวด (ทะเบียนมี ~30% ที่หมวดว่าง)
 * · สูตรที่เก็บเข้ากรุไม่ให้เลือกใหม่ · ตัวที่แถวนี้ถืออยู่คงอยู่ในลิสต์เสมอ (ไม่งั้นเปิดแก้แล้วกดบันทึก สูตรหลุดเงียบ ๆ)
 * · ยังไม่เลือกหมวด = ไม่มีตัวเลือก (ลำดับ หมวด → สูตร)
 */
export function giftSetFormulaChoices(formulas = [], categoryCode = '', currentFormulaId = '') {
  const code = clean(categoryCode);
  const current = clean(currentFormulaId);
  if (!code) return (formulas || []).filter((f) => current && f.id === current);
  return (formulas || []).filter((f) => {
    if (current && f.id === current) return true;
    if (f.status === 'archived') return false;
    const own = clean(f.categoryCode);
    return !own || own === code;
  });
}

/**
 * รายการสูตรที่ฟอร์มส่งมา → แถวสะอาด `[{ formulaId, categoryCode }]` ตามลำดับที่เรียง
 * · แถวว่างทั้งสองช่อง (กด "เพิ่มสูตร" แล้วไม่ได้เลือก) ทิ้งไป · ไม่ใช่อาเรย์ = ไม่มีรายการ
 */
export function normalizeGiftSetFormulas(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({ formulaId: clean(row?.formulaId), categoryCode: clean(row?.categoryCode) }))
    .filter((row) => row.formulaId || row.categoryCode);
}

/**
 * เหตุผลที่รายการนี้บันทึกไม่ได้ — `''` = ผ่าน
 * @param rows ผลของ `normalizeGiftSetFormulas`
 * @param formulasById (ไม่บังคับ) Map id → แถวทะเบียนสูตร — ส่งมาเมื่อมีทะเบียนในมือ จะตรวจว่าสูตรมีจริง
 *   และหมวดของสูตรตรงกับหมวดของแถว · จอส่งทะเบียนที่โหลดไว้ · API ส่งแถวที่อ่านสดจากฐาน
 * @param categoryName (ไม่บังคับ) code → ชื่อหมวด ไว้พูดในข้อความ
 */
export function giftSetFormulasError(rows = [], { formulasById = null, categoryName = null } = {}) {
  const nameOf = (code) => {
    const name = categoryName ? clean(categoryName(code)) : '';
    return name ? `${code} ${name}` : code;
  };
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    const at = `สูตรแถวที่ ${index + 1}`;
    if (!row.categoryCode) return `${at}: เลือกหมวดก่อนว่าสูตรนี้เป็นสินค้าอะไร`;
    if (!isGiftSetComponentCategory(row.categoryCode)) {
      return `${at}: หมวด ${row.categoryCode} ใช้ในชุดของขวัญไม่ได้ — เลือกได้เฉพาะหมวดในกลุ่ม 01 (ยกเว้น ${GIFT_SET_CATEGORY_CODE} ชุดของขวัญ)`;
    }
    if (!row.formulaId) return `${at}: ยังไม่ได้เลือกสูตร`;
    if (seen.has(row.formulaId)) return `${at}: สูตรนี้อยู่ในชุดแล้ว — สูตรเดียวกันใส่ซ้ำในชุดเดียวไม่ได้`;
    seen.add(row.formulaId);
    if (formulasById) {
      const formula = formulasById.get(row.formulaId);
      if (!formula) return `${at}: ไม่พบสูตรที่เลือกในทะเบียนสูตร`;
      const own = clean(formula.categoryCode);
      if (own && own !== row.categoryCode) {
        return `${at}: สูตร ${clean(formula.code) || clean(formula.name)} เป็นสูตรหมวด ${nameOf(own)} — ไม่ใช่ ${nameOf(row.categoryCode)}`;
      }
    }
  }
  return '';
}

/** สองรายการเหมือนกันไหม (ลำดับนับด้วย — ลำดับคือลำดับที่พิมพ์บนใบสเปค) */
export function sameGiftSetFormulas(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((row, i) => row.formulaId === b[i].formulaId && row.categoryCode === b[i].categoryCode);
}

/**
 * ด่านฝั่งจอก่อนกดบันทึก (โมดัลเพิ่ม + โมดัลแก้) — ตัวตรวจเดียวกับ API แต่เทียบกับทะเบียนสูตรที่จอโหลดไว้
 * หมวดอื่นที่ไม่ใช่ชุดของขวัญ = ผ่านเสมอ (API ล้างรายการทิ้งเอง)
 */
export function giftSetFormError(categoryCode, rawRows, formulas = []) {
  if (!isGiftSetCategory(categoryCode)) return '';
  const formulasById = formulas.length ? new Map(formulas.map((f) => [f.id, f])) : null;
  return giftSetFormulasError(normalizeGiftSetFormulas(rawRows), { formulasById });
}
