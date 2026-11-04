// ── อ่านแถวของคิว "ลง BOM" จากฐาน — ตัวเดียวที่ทั้งตาราง (`GET /api/rd/bom-board`) และไฟล์ Excel
//    (`GET /api/rd/bom-board/export`) เรียก (มติเจ้าของ 04/11/2026: กดดาวน์โหลดรายการได้)
//
// ⭐ ยกออกมาจาก route ของตารางเพื่อให้ไฟล์ = ของบนจอทุกช่อง — อ่านสองทางเมื่อไร ช่องใหม่ที่เพิ่มให้ตาราง
//    (เช่นเลขผู้เสียภาษี/แบรนด์ 03/11 · ชื่อที่ลูกค้าเรียกของกลิ่น 04/11) จะหายจากไฟล์โดยไม่มีใครเห็น
// ⚠️ ไม่เลือกราคาผลิต — RD ไม่มีสิทธิ์เห็น (redactProductMargin) · ลูกค้า AR/ชื่อไทย-อังกฤษ/เลขผู้เสียภาษีอ่านสดจากทะเบียน
// ⚠️ throw `Error` ที่ข้อความพร้อมโชว์ — route แปลงเป็น 500 เอง
import { fetchAll } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { loadProductFormulasMany } from '@/lib/master/giftSetFormulasStore';
import { isGiftSetCategory } from '@/lib/master/giftSetFormulas';
import { BOM_BOARD_PRODUCT_COLUMNS, bomBoardRows } from '@/lib/rd/bomBoard';

/** แถวของคิวทุกสถานะ (ยังไม่แยกแท็บ · ยังไม่เรียง) */
export async function loadBomBoardRows(supabase) {
  let products;
  try {
    // ดัชนีบางส่วน products_bom_status_idx (0419) — FG ส่วนใหญ่ bomStatus ว่างตลอดกาล
    products = await fetchAll(() => supabase.from('products').select(BOM_BOARD_PRODUCT_COLUMNS)
      .not('bomStatus', 'is', null).order('id'));
  } catch (e) {
    throw new Error(e?.message || 'อ่านสินค้าที่ส่งลง BOM ไม่สำเร็จ');
  }
  if (!products.length) return [];

  try {
    // ⭐ มติเจ้าของ 03/11: ลูกค้า + เลขผู้เสียภาษี/สาขา · สูตร/กลิ่นอ่านสดจากทะเบียน
    //    ชื่อที่ลูกค้าเรียก (`customerTradeName`) อ่านจาก **กลิ่นที่เดียว** (มติเจ้าของ 04/11)
    const [customers, scents, formulas, giftSetsByProduct] = await Promise.all([
      fetchAllInChunks(products.map((p) => p.customerId), (chunk) => supabase
        .from('customers').select('id, "arCode", name, "nameEn", "taxId", "branchCode"').in('id', chunk).order('id')),
      fetchAllInChunks(products.map((p) => p.scentId), (chunk) => supabase
        .from('scents').select('id, code, name, "customerTradeName"').in('id', chunk).order('id')),
      fetchAllInChunks(products.map((p) => p.formulaId), (chunk) => supabase
        .from('formulas').select('id, code, name').in('id', chunk).order('id')),
      loadProductFormulasMany(supabase, products.filter((p) => isGiftSetCategory(p.categoryCode)).map((p) => p.id)),
    ]);
    return bomBoardRows(products, {
      customersById: new Map(customers.map((c) => [c.id, c])),
      scentsById: new Map(scents.map((s) => [s.id, s])),
      formulasById: new Map(formulas.map((f) => [f.id, f])),
      giftSetsByProduct,
    });
  } catch (e) {
    throw new Error(`อ่านลูกค้า/สูตร/กลิ่นไม่สำเร็จ: ${e?.message || ''}`.trim());
  }
}
