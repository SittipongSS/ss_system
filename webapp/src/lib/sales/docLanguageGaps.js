// ── อะไรบนใบที่ยัง "ไม่มีคู่ภาษาอังกฤษ" ────────────────────────────────────
//
// สลับใบเป็นภาษาอังกฤษแล้วไม่ได้แปลทุกอย่าง — ช่องที่ไม่มีคู่ภาษาจะ **พิมพ์ข้อความไทย
// ต่อไปเงียบ ๆ** ⇒ ได้เอกสารครึ่งไทยครึ่งอังกฤษที่ส่งลูกค้าต่างชาติไม่ได้ โดยไม่มีอะไรเตือน
// (วัดจากฐานจริง 2026-08-26: บรรทัดสินค้ามีชื่ออังกฤษแค่ 71 จาก 381)
//
// ⭐ **ชื่อ/ที่อยู่ลูกค้าเดินกติกาเดียวกับชื่อสินค้าแล้ว** (มติผู้ใช้ 2026-09-03) — ใบเก็บ
// คู่ภาษาอังกฤษของตัวเอง (`customerNameEn` · `billingAddressEn` · `shippingAddressEn`)
// ⇒ เตือน **เฉพาะช่องที่จะพิมพ์ไทยจริง ๆ** และกรอกครบทั้งคู่ = ไม่เตือนเลย
// เดิมบรรทัดลูกค้าเป็นค่าคงที่ "พิมพ์ไทยเสมอ" เพราะเอกสารไม่มีทางเดินภาษาอังกฤษของลูกค้า
// เลย (ทะเบียนมี `customers.nameEn` ตั้งแต่ #1380 แต่ยังไม่ได้ต่อเข้าใบ) — พอต่อถึงใบแล้ว
// ข้อความเดิมกลายเป็นคำโกหก: คนกรอกครบก็ยังโดนเตือนว่าจะพิมพ์ไทย
//
// ตรรกะล้วน ไม่มี IO — ใช้ได้ทั้งฝั่ง server ตอนสร้างเอกสารและฝั่งหน้าจอ

const hasText = (value) => String(value ?? '').trim().length > 0;

/* ช่องนี้จะพิมพ์ไทยบนใบอังกฤษไหม — **มีไทย แต่ไม่มีคู่อังกฤษ** เท่านั้นที่นับเป็นช่องขาด
   ว่างทั้งสองภาษา = เอกสารพิมพ์ '-' อยู่แล้ว ไม่ใช่ของที่ตกหล่นตอนแปล จึงไม่ต้องเตือน
   (กติกาเดียวกับ headerText ของเปลือกเอกสาร: มีภาษาเดียวก็พิมพ์ภาษานั้น) */
const printsThai = (thai, english) => hasText(thai) && !hasText(english);

/**
 * @param {object} quote ใบเสนอราคา/ใบสั่งขายพร้อม `lines` และคู่ภาษาของลูกค้า
 * @returns {{linesTotal:number, linesMissingEn:number, customerNamePrintsThai:boolean,
 *            billingAddressPrintsThai:boolean, shippingAddressPrintsThai:boolean}}
 */
export function englishDocumentGaps(quote = {}) {
  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  const linesMissingEn = lines.filter((line) => !hasText(line?.metadata?.descriptionEn)).length;
  const billingAddressPrintsThai = printsThai(quote.billingAddress, quote.billingAddressEn);
  /* แถว "ที่อยู่จัดส่ง" ว่างทั้งสองภาษา = เอกสารพิมพ์ที่อยู่ออกบิลซ้ำลงแถวนั้น
     (buildQuotationMasterModelFromQuote) ⇒ ต้องเดินตามผลของที่อยู่ออกบิล ไม่ใช่ตอบว่า
     "ไม่ขาด" เพราะช่องตัวเองว่าง — ไม่งั้นใบที่ไม่ได้แยกที่อยู่จัดส่งจะไม่มีคำเตือนเลย */
  const shippingAddressPrintsThai = hasText(quote.shippingAddress) || hasText(quote.shippingAddressEn)
    ? printsThai(quote.shippingAddress, quote.shippingAddressEn)
    : billingAddressPrintsThai;
  return {
    linesTotal: lines.length,
    linesMissingEn,
    customerNamePrintsThai: printsThai(quote.customerName, quote.customerNameEn),
    billingAddressPrintsThai,
    shippingAddressPrintsThai,
  };
}

/**
 * ข้อความที่เอาไปโชว์ได้ตรง ๆ — ทุกบรรทัดคือ "ช่องที่จะพิมพ์ไทยบนใบอังกฤษ" ที่แก้ได้เอง
 * @returns {string[]} ว่าง = ไม่มีอะไรต้องเตือน
 */
export function englishGapMessages(gaps) {
  const out = [];
  if (gaps?.linesMissingEn > 0) {
    out.push(gaps.linesMissingEn === gaps.linesTotal
      ? `ชื่อสินค้าทั้ง ${gaps.linesTotal} บรรทัด ยังไม่มีชื่ออังกฤษ — จะพิมพ์ชื่อไทย`
      : `ชื่อสินค้า ${gaps.linesMissingEn} จาก ${gaps.linesTotal} บรรทัด ยังไม่มีชื่ออังกฤษ — จะพิมพ์ชื่อไทย`);
  }
  if (gaps?.customerNamePrintsThai) {
    out.push('ชื่อลูกค้ายังไม่มีภาษาอังกฤษ — จะพิมพ์ชื่อไทย');
  }
  /* ที่อยู่บนใบมีสองแถว (ผู้ซื้อ / จัดส่ง) — ขาดทั้งคู่พูดรวมบรรทัดเดียว ขาดข้างเดียว
     ต้องบอกว่าแถวไหน ไม่งั้นคนไปแก้ผิดช่องแล้วคำเตือนก็ยังอยู่ */
  const { billingAddressPrintsThai: billing, shippingAddressPrintsThai: shipping } = gaps || {};
  if (billing && shipping) {
    out.push('ที่อยู่ลูกค้ายังไม่มีภาษาอังกฤษ — จะพิมพ์ที่อยู่ไทย');
  } else if (billing) {
    out.push('ที่อยู่ผู้ซื้อยังไม่มีภาษาอังกฤษ — จะพิมพ์ที่อยู่ไทย');
  } else if (shipping) {
    out.push('ที่อยู่จัดส่งยังไม่มีภาษาอังกฤษ — จะพิมพ์ที่อยู่ไทย');
  }
  return out;
}
