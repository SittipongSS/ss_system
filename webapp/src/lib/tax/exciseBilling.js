// ── ยอดที่เรียกเก็บจากลูกค้าบน "ใบแจ้งชำระค่าภาษีสรรพสามิต" — สูตรเดียวของระบบ ──
//
// มติผู้ใช้ 2026-07-26: **ยอดที่ต้องเรียกเก็บ = ค่าภาษี + VAT 7%** เพราะนั่นคือเงินที่
// เก็บจากลูกค้าจริงตามเอกสารที่ส่งไป. ก่อนหน้านี้ระบบเก็บ/แสดง amountToCollect เป็น
// ค่าภาษีเปล่า ๆ (สรรพสามิต + ท้องถิ่น) แต่เอกสารพิมพ์ยอดสุทธิรวม VAT → เลขบนจอกับ
// บนเอกสารต่างกัน 7% คนขายจึงแจ้งลูกค้าผิด
//
// ⚠️ ต้องคิดด้วยฟังก์ชันนี้ทุกที่ (ตอนสร้างใบ + ตอนพิมพ์ + ตอนแสดงบนจอ) — ปัดเศษ
// "ต่อหน่วยก่อน แล้วคูณจำนวน" เพื่อให้เอกสารกระทบยอดด้วยมือได้ (ภาษี/ชิ้น × จำนวน =
// รวมภาษี พอดี) ถ้าที่ไหนคิดเองใหม่ เศษสตางค์จะเดินหนีจากเลขบนเอกสารทันที

export const EXCISE_VAT_RATE = 0.07;

export const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// บรรทัดหนึ่งของใบยื่น: order_items / resolveSoFiling().lines ใช้รูปเดียวกัน
// ({ quantity, totalTax }) — ภาษี/หน่วยปัดก่อน แล้วคูณจำนวน
export function billedTaxLine(item = {}) {
  const quantity = Number(item.quantity) || 0;
  const perUnit = round2(quantity ? (Number(item.totalTax) || 0) / quantity : 0);
  return { quantity, perUnit, tax: round2(perUnit * quantity) };
}

// ยอดรวมของใบ: ค่าภาษีก่อน VAT · VAT · ยอดที่เรียกเก็บจริง (รวม VAT)
export function billedTaxTotals(items = []) {
  const rows = (Array.isArray(items) ? items : []).map(billedTaxLine);
  const totalTax = round2(rows.reduce((sum, row) => sum + row.tax, 0));
  const vat = round2(totalTax * EXCISE_VAT_RATE);
  return { totalTax, vat, amountToCollect: round2(totalTax + vat) };
}

// ยอดที่เรียกเก็บของใบยื่นใบหนึ่ง: ค่าที่ตรึงไว้บนใบมาก่อน แล้วจึงคิดจากรายการ
// (ใบที่สร้างก่อนมติ 2026-07-26 เก็บยอดไม่รวม VAT ไว้ — คิดใหม่จากรายการให้ตรงเอกสาร)
export function orderAmountToCollect(order) {
  if (!order) return 0;
  const items = order.items || [];
  if (items.length) return billedTaxTotals(items).amountToCollect;
  const stored = Number(order.amountToCollect);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const tax = round2(order.totalTax);
  return round2(tax + round2(tax * EXCISE_VAT_RATE));
}
