// ── รายการของใบยื่นที่ออกจากใบสั่งขาย: คิด + แปลงเป็นแถว order_items — ที่เดียวของทั้งสองทาง ──
//
// ใช้ร่วม: สร้างใบยื่น (POST /api/tax/orders/from-sales-order) · คิดภาษีใหม่จากใบสั่งขาย
// (PATCH /api/orders/[id] `recalcFromSalesOrder`) — สองทางต้องได้แถวหน้าตาเดียวกันเป๊ะ
// ไม่งั้นใบที่คิดใหม่จะต่างจากใบที่เพิ่งสร้างทั้งที่มาจาก SO เดียวกัน
//
// 🐞 ตรวจระบบ 2026-10-26 (ข้อ 3): ใบยื่นจาก SO ที่ถูกตีกลับ แก้ผ่านฟอร์มเลือกทะเบียน
// (OrderFormModal) ⇒ บรรทัดที่ยังไม่มีทะเบียน (`registrationId` ว่าง — มติ 2026-07-22 ข้อ 4
// ยอมให้มี) ถูกทิ้งเงียบ ๆ ทั้งฝั่งจอและ route · ทุกบรรทัดไม่มีทะเบียน = ส่งกลับไม่ได้เลย ·
// แถวใหม่ยังทิ้ง `salesOrderLineId` (ลิงก์กลับบรรทัด SO) ⇒ ใบยื่นจาก SO แก้รายการได้ทางเดียว
// คือคิดใหม่จาก SO ด้วยตัวนี้ ไม่ใช่เลือกทะเบียนทีละบรรทัด
import { genId } from "@/lib/id";
import { resolveSoFiling } from "@/lib/excise/soFiling";
import { customerTaxSiblingIds } from "@/lib/master/customerTaxSiblings";
import { billedTaxTotals } from "@/lib/tax/exciseBilling";

/** คิดบรรทัดภาษีของ SO หนึ่งใบจากข้อมูลสด (อัตราของสินค้า ณ ตอนนี้ + ทะเบียน ณ ตอนนี้)
 *  @param salesOrder แถว sales_orders ที่ฝัง `lines` (sales_order_lines ครบคอลัมน์ — ต้องมี packQty) */
export async function resolveSalesOrderFiling(supabase, salesOrder) {
  const productIds = [...new Set((salesOrder.lines || []).map((line) => line.productId).filter(Boolean))];
  // ใบลูกค้าทุกใบของนิติบุคคลนี้ — ทะเบียนอยู่ใต้ใบที่เป็นเจ้าของ FG ซึ่งอาจไม่ใช่ใบที่ขาย
  const ownerCustomerIds = salesOrder.customerId
    ? await customerTaxSiblingIds(supabase, salesOrder.customerId)
    : [];
  const [{ data: products, error: productError }, { data: productTypes, error: typeError }, registrationResult] = await Promise.all([
    productIds.length
      ? supabase.from("products").select("*").in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("product_types").select("mainCategoryCode, typeCode, isExcise, requiresFdaNotice"),
    productIds.length && ownerCustomerIds.length
      ? supabase.from("excise_registrations").select("id, productId, customerId, status, isExciseTaxable").in("customerId", ownerCustomerIds).in("productId", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (productError) throw productError;
  if (typeError) throw typeError;
  if (registrationResult.error) throw registrationResult.error;
  const resolved = resolveSoFiling({
    salesOrder,
    lines: salesOrder.lines || [],
    products: products || [],
    productTypes: productTypes || [],
    registrations: registrationResult.data || [],
    ownerCustomerIds,
  });
  /* สินค้า FG ต้นทางที่อ่านมาแล้ว — ตัวสร้างบรรทัดใบเสนอราคาค่าสรรพสามิตใช้ชื่อ EN/หน่วย/ราคาขายปลีก (ไม่ต้องอ่านซ้ำ) */
  return { ...resolved, products: products || [] };
}

/** บรรทัดที่ resolve แล้ว → แถว order_items · id ใหม่ทุกครั้ง (ทางคิดใหม่ใส่ชุดใหม่ก่อนแล้วค่อยลบชุดเก่า
 *  ⇒ id ห้ามชนกับแถวเดิมของใบ) · `salesOrderLineId` ต้องติดไปเสมอ — ลิงก์เดียวกลับบรรทัด SO */
export function filingItemRows(orderId, lines = []) {
  return lines.map((line) => ({
    id: genId("TXI"),
    orderId,
    salesOrderLineId: line.salesOrderLineId,
    registrationId: line.registrationId,
    productId: line.productId,
    quantity: line.quantity,
    exciseRatePerUnit: line.exciseRatePerUnit,
    localTaxRatePerUnit: line.localTaxRatePerUnit,
    totalExciseTax: line.totalExciseTax,
    totalLocalTax: line.totalLocalTax,
    totalTax: line.totalTax,
  }));
}

/** ยอดหัวใบจากผล resolve — ยอดเรียกเก็บ = ค่าภาษี + VAT 7% (มติผู้ใช้ 2026-07-26) สูตรเดียวกับเอกสาร */
export function filingTotalsOf(resolved) {
  return {
    totalExciseTax: resolved.totalExciseTax,
    totalLocalTax: resolved.totalLocalTax,
    totalTax: resolved.totalTax,
    amountToCollect: billedTaxTotals(resolved.lines).amountToCollect,
  };
}
