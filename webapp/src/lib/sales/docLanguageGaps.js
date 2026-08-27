// ── อะไรบนใบที่ยัง "ไม่มีคู่ภาษาอังกฤษ" ────────────────────────────────────
//
// สลับใบเป็นภาษาอังกฤษแล้วไม่ได้แปลทุกอย่าง — ช่องที่ไม่มีคู่ภาษาจะ **พิมพ์ข้อความไทย
// ต่อไปเงียบ ๆ** ⇒ ได้เอกสารครึ่งไทยครึ่งอังกฤษที่ส่งลูกค้าต่างชาติไม่ได้ โดยไม่มีอะไรเตือน
// (วัดจากฐานจริง 2026-08-26: บรรทัดสินค้ามีชื่ออังกฤษแค่ 71 จาก 381)
//
// ⚠️ **ชื่อและที่อยู่ลูกค้าเป็นคนละเรื่องกับ "ข้อมูลขาด"** — เอกสารไม่มีทางเดินภาษาอังกฤษ
// ของลูกค้าเลย (`customers.nameEn` มีในทะเบียนแต่ยังไม่ได้ต่อเข้าใบ ดู #1380) ⇒ ต่อให้
// กรอกชื่ออังกฤษไว้ครบ ใบก็ยังพิมพ์ชื่อไทย · จึงบอกเป็น "ข้อจำกัดของเอกสาร" ไม่ใช่
// "ช่องที่ยังไม่ได้กรอก" ไม่งั้นคนจะไปกรอกแล้วงงว่าทำไมไม่ขึ้น
//
// ตรรกะล้วน ไม่มี IO — ใช้ได้ทั้งฝั่ง server ตอนสร้างเอกสารและฝั่งหน้าจอ

const hasText = (value) => String(value ?? '').trim().length > 0;

/**
 * @param {object} quote ใบเสนอราคาพร้อม `lines`
 * @returns {{linesTotal:number, linesMissingEn:number, customerAlwaysThai:boolean}}
 */
export function englishDocumentGaps(quote = {}) {
  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  const linesMissingEn = lines.filter((line) => !hasText(line?.metadata?.descriptionEn)).length;
  return { linesTotal: lines.length, linesMissingEn, customerAlwaysThai: true };
}

/**
 * ข้อความที่เอาไปโชว์ได้ตรง ๆ — เรียงจาก "ของที่แก้ได้เอง" ไป "ข้อจำกัดของระบบ"
 * @returns {string[]} ว่าง = ไม่มีอะไรต้องเตือน
 */
export function englishGapMessages(gaps) {
  const out = [];
  if (gaps?.linesMissingEn > 0) {
    out.push(gaps.linesMissingEn === gaps.linesTotal
      ? `ชื่อสินค้าทั้ง ${gaps.linesTotal} บรรทัด ยังไม่มีชื่ออังกฤษ — จะพิมพ์ชื่อไทย`
      : `ชื่อสินค้า ${gaps.linesMissingEn} จาก ${gaps.linesTotal} บรรทัด ยังไม่มีชื่ออังกฤษ — จะพิมพ์ชื่อไทย`);
  }
  if (gaps?.customerAlwaysThai) {
    out.push('ชื่อและที่อยู่ลูกค้าพิมพ์เป็นภาษาไทยเสมอ — เอกสารยังไม่ได้ต่อกับชื่ออังกฤษในทะเบียนลูกค้า');
  }
  return out;
}
