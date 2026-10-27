/* ความยาวของค่าบนการ์ด ⇒ `data-len` ให้ CSS ย่อตัวเลขพอดีช่อง (กฎ `.ui-metric strong[data-len]` ใน globals.css)
 * 🐞 ที่มา: /finance/payments จอ 390 — "เก็บได้แล้ว ฿10,648,762.…" · "ค้างรับทั้งหมด ฿27,934,367.…" ยอดเงินถูกตัดด้วย "…"
 *    ทั้งที่กติกาตัวเลขคือเงินเต็มหลักเสมอ (ช่องละ ~111px แต่ค่ายาว 14 ตัวอักษรที่ fs-10 กิน ~121px)
 * ⚠️ ส่งเป็นแอตทริบิวต์ ไม่ใช่ inline style (เหตุผลเดียวกับ `data-cols` ของ `MetricStrip` ใน Workspace.js) · ≤ 8 ตัวอักษร = ไม่ส่ง (ค่าสั้นได้ขั้นเต็มเหมือนเดิม)
 *    · ยาวกว่า 18 ตัดที่ 18 (CSS มีขั้นถึง 18 — เกินนั้นหายากและยอมให้ … ตัดท้ายตามเดิม)
 *    · ค่าที่ไม่ใช่ข้อความ/ตัวเลข (เช่น element) ไม่ส่ง = ขนาดเดิม */
export function metricValueLen(value) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const len = String(value).length;
  return len > 8 ? String(Math.min(len, 18)) : undefined;
}
