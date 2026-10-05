// ── ชุดของขวัญ (01-037): อ่าน/เขียนรายการสูตรของ FG (ตาราง product_formulas · mig 0403) ──
//
// กติกาอยู่ที่ giftSetFormulas.js (จอกับ API ใช้ตัวเดียวกัน) — ไฟล์นี้คือชั้นที่แตะฐาน
// ⚠️ supabase-js ไม่ throw เอง — ทุกจุดเช็ค `error` แล้วโยนต่อ ("อ่านไม่ได้" ≠ "ไม่มีสูตร")
import { randomUUID } from 'node:crypto';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { categoryRow } from '@/lib/master/categoryOf';
import { categoryName } from '@/lib/master/productCategoryOptions';
import { loadProductTypeNames } from '@/lib/master/productCategoryNames';
import { giftSetFormulasError, normalizeGiftSetFormulas } from '@/lib/master/giftSetFormulas';

const FORMULA_COLUMNS = 'id, code, name, "formulaDate", "categoryCode", "scentId", status';

const byOrder = (a, b) => (a.sortOrder - b.sortOrder) || String(a.id).localeCompare(String(b.id));

/** แถวดิบของสินค้า `[{ id, formulaId, categoryCode, sortOrder }]` เรียงตามลำดับในชุด */
export async function loadProductFormulaRows(supabase, productId) {
  const { data, error } = await supabase
    .from('product_formulas')
    .select('id, "formulaId", "categoryCode", "sortOrder"')
    .eq('productId', productId)
    .order('sortOrder')
    .order('id');
  if (error) throw error;
  return (data || []).sort(byOrder);
}

/**
 * รายการสูตรของชุดพร้อมของที่จอ/กระดาษต้องโชว์ — อ่านทะเบียนสดทุกครั้ง (ไม่มี snapshot บนแถว
 * เหมือน `products.formulaName`) จึงตาม RD ที่แก้ชื่อ/รหัส/วันที่ของสูตรได้เอง
 * @returns `[{ id, formulaId, categoryCode, categoryName, categoryNameEn, formulaCode, formulaName,
 *   formulaDate, formulaStatus, scentId, scentName }]`
 */
export async function loadProductFormulas(supabase, productId, { productTypes = null } = {}) {
  const rows = await loadProductFormulaRows(supabase, productId);
  if (!rows.length) return [];
  const formulaIds = [...new Set(rows.map((r) => r.formulaId))];
  const { data: formulas, error } = await supabase.from('formulas').select(FORMULA_COLUMNS).in('id', formulaIds);
  if (error) throw error;
  const formulaById = new Map((formulas || []).map((f) => [f.id, f]));
  const scentIds = [...new Set((formulas || []).map((f) => f.scentId).filter(Boolean))];
  let scentById = new Map();
  if (scentIds.length) {
    const { data: scents, error: scentError } = await supabase.from('scents').select('id, name').in('id', scentIds);
    if (scentError) throw scentError;
    scentById = new Map((scents || []).map((s) => [s.id, s]));
  }
  const types = productTypes || await loadProductTypeNames(supabase);
  return rows.map((row) => {
    const formula = formulaById.get(row.formulaId) || null;
    const type = categoryRow(row.categoryCode, types);
    const nameEn = String(type?.nameEn ?? '').trim();
    return {
      id: row.id,
      formulaId: row.formulaId,
      categoryCode: row.categoryCode,
      categoryName: categoryName(type) || null,
      categoryNameEn: nameEn || categoryName(type) || null,
      formulaCode: formula?.code || null,
      formulaName: formula?.name || null,
      formulaDate: formula?.formulaDate || null,
      formulaStatus: formula?.status || null,
      scentId: formula?.scentId || null,
      scentName: scentById.get(formula?.scentId)?.name || null,
    };
  });
}

/**
 * ตรวจรายการที่ฟอร์มส่งมากับทะเบียนสด — คืน `{ rows, error }` (`error` ไม่ว่าง = ตีกลับ 400)
 * ⚠️ ตัวตรวจตัวเดียวกับจอ (`giftSetFormulasError`) แต่ส่งแถวสูตรที่อ่านจากฐาน ไม่ใช่ที่จอโหลดไว้
 */
export async function planGiftSetFormulas(supabase, raw) {
  const rows = normalizeGiftSetFormulas(raw);
  const formulaIds = [...new Set(rows.map((r) => r.formulaId).filter(Boolean))];
  let formulasById = new Map();
  if (formulaIds.length) {
    const { data, error } = await supabase.from('formulas').select(FORMULA_COLUMNS).in('id', formulaIds);
    if (error) throw error;
    formulasById = new Map((data || []).map((f) => [f.id, f]));
  }
  const types = rows.length ? await loadProductTypeNames(supabase) : [];
  const error = giftSetFormulasError(rows, {
    formulasById,
    categoryName: (code) => categoryName(categoryRow(code, types)),
  });
  return { rows, error };
}

/** ทับรายการทั้งชุดในทรานแซกชันเดียว (RPC `replace_product_formulas` · mig 0403) */
export async function replaceProductFormulas(supabase, productId, rows) {
  const payload = rows.map((row, index) => ({
    id: `PFM-${randomUUID()}`,
    formulaId: row.formulaId,
    categoryCode: row.categoryCode,
    sortOrder: index,
  }));
  const { error } = await supabase.rpc('replace_product_formulas', { p_product_id: productId, p_rows: payload });
  if (error) throw error;
  return payload;
}

/**
 * FG ชุดของขวัญที่ใช้สูตรเหล่านี้ — `[{ productId, formulaId, fgCode, customerId }]`
 * ⭐ ทะเบียนสูตร ("FG ที่ใช้สูตรนี้") · ด่านเลิกแชร์ · พรีวิวบังคับลบ ถามตัวนี้ตัวเดียว
 *    — ถามแค่ `products.formulaId` เมื่อไร ชุดของขวัญหายจากทุกด่านเงียบ ๆ
 */
export async function giftSetsUsingFormulas(supabase, formulaIds = []) {
  const links = await fetchAllInChunks(formulaIds, (chunk) => supabase
    .from('product_formulas').select('id, "productId", "formulaId"').in('formulaId', chunk).order('id'));
  if (!links.length) return [];
  const products = await fetchAllInChunks(links.map((l) => l.productId), (chunk) => supabase
    .from('products').select('id, "fgCode", "customerId"').in('id', chunk).order('id'));
  const productById = new Map(products.map((p) => [p.id, p]));
  return links.map((l) => ({
    productId: l.productId,
    formulaId: l.formulaId,
    fgCode: productById.get(l.productId)?.fgCode || null,
    customerId: productById.get(l.productId)?.customerId || null,
  }));
}

/** จำนวนชุดของขวัญที่ใช้สูตรนี้ — ด่านก่อนลบสูตร */
export async function countGiftSetsUsingFormula(supabase, formulaId) {
  const { count, error } = await supabase
    .from('product_formulas').select('id', { count: 'exact', head: true }).eq('formulaId', formulaId);
  if (error) throw error;
  return count || 0;
}

