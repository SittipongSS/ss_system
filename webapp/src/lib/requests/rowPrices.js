// ── ราคาที่ใส่แล้วของแถวคำร้อง — ของกลางของหน้ารายละเอียด (ตารางสรุปทั้งใบ) และหน้ารายการ (คิว) ──────
//
// ⭐ ที่มา (ผู้ใช้ 2026-09-22): *"เมื่อส่งราคาแล้ว อยากให้โชว์ราคาด้วย ตอนนี้ ในหน้ารายการคำร้อง และ
// หน้ารายละเอียดคำร้อง ไม่ได้โชว์ราคาเลย"* — ราคาเข้าทะเบียนวัสดุแล้วแต่ใบคำร้องไม่บอกเลขสักตัว
// ⇒ ผู้ขอต้องไปเปิดหน้าทะเบียนกลิ่น/สูตรเองทีละตัว
//
// ⚠️ **อ่านอย่างเดียว** — ราคาอยู่ที่ทะเบียนวัสดุ (rev) · server ติด `pricedResults` มาให้แถว
// (`attachRowPrice`: ทุกช่องที่ใส่จากขั้นนี้ เรียง F · B · FB) · ที่นี่แค่จัดรูปให้จอสองแบบใช้ตรงกัน

/** ช่องราคาของแถวหนึ่ง — `[{ key, short, price, perUnit, validUntil }]` ว่าง = ยังไม่ใส่ราคา */
export function rowPriceLines(item) {
  const list = Array.isArray(item?.pricedResults) && item.pricedResults.length
    ? item.pricedResults
    : item?.pricedResult ? [item.pricedResult] : [];
  return list
    .filter((p) => p && p.price != null)
    .map((p) => ({
      key: p.revisionId || p.short || p.kind,
      short: p.short || null,
      price: p.price,
      perUnit: p.perUnit || 'กก.',
      validUntil: p.validUntil || null,
    }));
}

/**
 * ราคาของทั้งใบ (หน้ารายการ) — `{ lines: [{ id, label, prices }], priced, total }`
 * `total` = แถวที่ยังต้องมีราคา (ส่งงานแล้ว · ผูกกลิ่น/สูตร · ลูกค้าไม่ได้ปฏิเสธ/ขอแก้) · `priced` = แถวที่ใส่ราคาแล้ว
 * ⚠️ แถวที่ลูกค้าไม่เอา (`rejected` · ปิดแถว `declined`) และแถวที่ถูกรอบแก้แทน (`revise`) ไม่มีวันได้ราคา —
 *    นับเข้า `total` แล้วคิวจะบอก "ใส่ราคาแล้ว 2/4" ทั้งที่ครบแล้ว (เจอจริงที่ SB-26080011)
 */
export function requestPriceSummary(items = []) {
  const deliverable = (items || []).filter((i) => i && (i.producedScentId || i.producedFormulaId)
    && (rowPriceLines(i).length
      || (!['rejected', 'revise'].includes(i.outcome) && i.answerStatus !== 'declined')));
  const lines = deliverable
    .map((i) => ({ id: i.id, label: i.label || null, prices: rowPriceLines(i) }))
    .filter((l) => l.prices.length);
  return { lines, priced: lines.length, total: deliverable.length };
}
