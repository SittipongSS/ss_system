import { canAccessRd } from '@/lib/permissions';
import { withUser, ok, fail, unauthorized, forbidden } from '@/lib/http';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { loadProductFormulasMany } from '@/lib/master/giftSetFormulasStore';
import { isGiftSetCategory } from '@/lib/master/giftSetFormulas';
import { BOM_BOARD_PRODUCT_COLUMNS, bomBoardRows } from '@/lib/rd/bomBoard';

export const dynamic = 'force-dynamic';

// GET /api/rd/bom-board — FG ที่ฝ่ายขายส่งมาให้ลง BOM ทุกสถานะ (mig 0419 · มติเจ้าของ 03/11/2026)
//
// ⚠️ **อ่านอย่างเดียว** — ปุ่มรับเรื่อง/ตีกลับ/ลงเสร็จเขียนผ่าน `POST /api/products/[id]/bom` ซึ่งมีด่านของตัวเอง ·
//    `proxy.js` เปิด `/api/rd` ไว้เฉพาะ GET โดยตั้งใจ
// ⚠️ ไม่เลือกราคาผลิต — RD ไม่มีสิทธิ์เห็น (redactProductMargin) · ลูกค้า AR/ชื่อไทย-อังกฤษ/เลขผู้เสียภาษีอ่านสดจากทะเบียน
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  // ด่านเดียวกับเมนู + เส้นเขียนฝั่ง RD — แยกสองที่เมื่อไรก็ได้เมนูที่กดแล้ว 403
  if (!canAccessRd(user)) return forbidden('เส้นนี้เป็นของฝ่าย RD');

  let products;
  try {
    // ดัชนีบางส่วน products_bom_status_idx (0419) — FG ส่วนใหญ่ bomStatus ว่างตลอดกาล
    products = await fetchAll(() => supabase.from('products').select(BOM_BOARD_PRODUCT_COLUMNS)
      .not('bomStatus', 'is', null).order('id'));
  } catch (e) {
    return fail(e?.message || 'อ่านสินค้าที่ส่งลง BOM ไม่สำเร็จ', 500);
  }
  if (!products.length) return ok([]);

  try {
    // ⭐ มติเจ้าของ 03/11: ลูกค้า + เลขผู้เสียภาษี/สาขา · สูตร/กลิ่นอ่านสดจากทะเบียนพร้อม "ชื่อที่ลูกค้าเรียก" (customerTradeName)
    const [customers, scents, formulas, giftSetsByProduct] = await Promise.all([
      fetchAllInChunks(products.map((p) => p.customerId), (chunk) => supabase
        .from('customers').select('id, "arCode", name, "nameEn", "taxId", "branchCode"').in('id', chunk).order('id')),
      fetchAllInChunks(products.map((p) => p.scentId), (chunk) => supabase
        .from('scents').select('id, code, name, "customerTradeName"').in('id', chunk).order('id')),
      fetchAllInChunks(products.map((p) => p.formulaId), (chunk) => supabase
        .from('formulas').select('id, code, name, "customerTradeName"').in('id', chunk).order('id')),
      loadProductFormulasMany(supabase, products.filter((p) => isGiftSetCategory(p.categoryCode)).map((p) => p.id)),
    ]);
    return ok(bomBoardRows(products, {
      customersById: new Map(customers.map((c) => [c.id, c])),
      scentsById: new Map(scents.map((s) => [s.id, s])),
      formulasById: new Map(formulas.map((f) => [f.id, f])),
      giftSetsByProduct,
    }));
  } catch (e) {
    return fail(`อ่านลูกค้า/สูตร/กลิ่นไม่สำเร็จ: ${e?.message || ''}`.trim(), 500);
  }
});
