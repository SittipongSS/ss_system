// ── ลิงก์ไปหน้าออกใบเสนอราคาค่าสรรพสามิต (มติเจ้าของ 29/10 "แก้ก่อนบันทึก แบบ new ใบเสนอราคา") ──────────────────
// ตัวเดียวที่ปุ่มบนเส้นเดินงานของ SO ลูกค้าใช้ · หน้าอยู่ที่ app/sales-planning/quotations/new-excise
// ⚠️ ไฟล์บริสุทธิ์ — จอ import ได้
export const NEW_EXCISE_QUOTATION_PATH = '/sa/quotations/new-excise';

/** `/sa/quotations/new-excise?salesOrderId=…&returnTo=…` — returnTo ไม่ส่ง = หน้าออกใบถอยไป SO ต้นทางเอง */
export function newExciseQuotationHref(salesOrderId, returnTo = null) {
  const query = new URLSearchParams({ salesOrderId: String(salesOrderId || '') });
  if (returnTo) query.set('returnTo', returnTo);
  return `${NEW_EXCISE_QUOTATION_PATH}?${query.toString()}`;
}
