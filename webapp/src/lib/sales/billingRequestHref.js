// ── ลิงก์ "ขอใบวางบิลงวดนี้" — เปิดคำร้องขอเอกสารการเงินแบบเติมค่าให้แล้ว (B-5 · กำหนดวางบิล 26/09) ──
//
// ⭐ **บ้านเดียวของลิงก์นี้** — ปุ่มในแผงงวดของใบสั่งขาย (SalesOrderPaymentPanel) กับปุ่มในแถวกระดิ่ง
//   "ถึงรอบวางบิล" (billingDueNotify · รอบสองของกำหนดวางบิล) ต้องเปิดฟอร์มหน้าตาเดียวกันทุกตัวอักษร
//   เดิมประกอบเป็น closure ในแผงงวด (ไม่ได้ export) ⇒ ย้ายมาที่นี่ก่อนมีตัวเรียกคนที่สอง
//   ไม่งั้นสองปุ่มจะเพี้ยนหากันเงียบ ๆ (ชื่อพารามิเตอร์ตัวเดียวพิมพ์ผิด = ฟอร์มว่างช่องนั้น ไม่มี error)
//   · ยามต้นทางใน billingRequestHref.test.mjs: แผงต้อง import ตัวนี้ และห้ามมีสำเนา `kind: "billing_doc"` ของตัวเอง
//   · ⚠️ กระดิ่งส่ง **งวด/ใบสดตอนเปิดกล่อง** เข้ามา (lib/notifications.js) ไม่ใช่ค่าที่ฝังตอนยิง — ใบเปลี่ยนเป็นร่าง Rev. /
//     วันวางบิลถูกจัดใหม่ ลิงก์ต้องตามค่าปัจจุบัน
// ⚠️ ชื่อพารามิเตอร์ = ที่ `app/requests/new/page.js` อ่าน (`searchParams.get(...)`) — ยามใน
//   billingRequestHref.test.mjs เทียบสองฝั่งทุกตัว
// ⚠️ **เติมค่าไม่ใช่ปลดด่าน** — ฟอร์มกับ POST ยังตรวจครบทุกข้อ (ใบต้องอนุมัติแล้ว · ยอดต้องไม่เกินใบ)
//   เหมือนเปิดเองจาก /requests · การผูกงวด (`installmentId`) server ตัดสินเองหลังบันทึกร่าง
//   (lib/requests/billingInstallmentLink.js) — ลิงก์ไม่ได้พิสูจน์อะไร
// ⚠️ ไฟล์บริสุทธิ์ ไม่ import ของฝั่ง server — จอ (แผงงวด) import ตรงได้

/* หัวข้อคำร้องของปุ่มนี้ — ตรงกับ `BILLING_LINK_KIND` ของตัวผูกงวด (ไฟล์นั้นลากของ server มา จึงไม่ import ข้ามมา) */
export const BILLING_REQUEST_KIND = 'billing_doc';

/**
 * @param order       ใบสั่งขาย ({ id, quotationId })
 * @param installment งวดที่กด ({ id, amount, billingDate }) — ไม่มี id = ไม่ผูกงวด · ไม่มีวันวางบิล = ไม่เติมวันที่
 * @returns `/requests/new?...` · กลับหน้าเดิมที่ใบสั่งขาย (`returnTo`)
 */
export function billingRequestHref(order, installment) {
  const params = new URLSearchParams({
    kind: BILLING_REQUEST_KIND,
    quotationId: order?.quotationId || '',
    salesOrderId: order?.id || '',
    billAmount: String(installment?.amount ?? ''),
    returnTo: `/sales-planning/sales-orders/${order?.id || ''}`,
  });
  /* ⭐ กำหนดวางบิล (26/09): งวดที่กด + วันวางบิลของงวด — หน้าเปิดคำร้องเติม "วันที่ต้องการรับงาน" ให้เห็น/แก้ได้
     และ server ผูกคำร้องกับงวดนี้หลังบันทึกร่าง ⇒ ป้าย "ขอใบวางบิลแล้ว" ขึ้นเอง + กระดิ่งก่อนวันวางบิลหยุด
     (เดิม SA ต้องย้อนมากด "แนบคำร้องที่ขอไว้แล้ว" อีกรอบ ซึ่งไม่มีใครทำ) */
  if (installment?.id) params.set('installmentId', installment.id);
  if (installment?.billingDate) params.set('requiredDate', String(installment.billingDate));
  return `/requests/new?${params.toString()}`;
}
