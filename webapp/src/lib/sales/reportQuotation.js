/* ใบเสนอราคาที่ "เป็นตัวแทนของดีล" สำหรับรายงาน/การวางแผนผลิต (มติผู้ใช้ 2026-09-16)
 *
 * 🐞 รายงาน FC รายหมวด (Excel) อ่านบรรทัดสินค้าจาก `forecastQuotationId` ซึ่งเป็น **ใบที่ FC เดินตาม**
 *    = ใบที่อนุมัติภายในซึ่งยอดต่ำที่สุด (lib/sales/forecastSource) · ไม่ใช่ใบที่ลูกค้ารับ
 *    ⇒ ดีลที่ปิด Won ด้วยใบหนึ่ง แต่ FC ชี้อีกใบ จะถูกวางแผนผลิตตามใบที่ลูกค้าไม่ได้ซื้อ
 *    ตรวจฐานจริง 16/09: ดีล Won 38 ใบที่ยอดบนดีลไม่ตรงใบที่ลูกค้ารับ
 *
 * ⭐ ลำดับ: **ใบที่ลูกค้ารับ** (metadata.acceptedQuotationId — RPC รับใบเป็นคนเขียน ไม่ใช่ client)
 *    ก่อนเสมอ · ดีลที่ยังไม่ปิดค่อยใช้ใบที่ FC เดินตาม
 */
export function reportQuotationIdOf(deal) {
  const accepted = deal?.metadata?.acceptedQuotationId;
  if (accepted) return String(accepted);
  if (deal?.forecastSource === 'quotation' && deal?.forecastQuotationId) return String(deal.forecastQuotationId);
  return null;
}
