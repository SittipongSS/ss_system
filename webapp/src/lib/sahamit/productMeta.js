// ข้อความ meta ของสินค้ามาตรฐานทั้งระบบสหมิตร: แบรนด์ · หมวด · ปริมาตร.
// รับ product object จาก /api/sahamit/products (brandName, category, volume, volumeUnit).
// opts.withCategory=false เมื่อหน้านั้น group ตามหมวดอยู่แล้ว (ไม่ต้องซ้ำ).
export function productMetaText(p, { withCategory = true } = {}) {
  if (!p) return "";
  return [
    p.brandName,
    withCategory ? p.category : null,
    p.volume ? `${p.volume}${p.volumeUnit || ""}` : null,
  ].filter(Boolean).join(" · ");
}

// สร้าง Map fgCode(lower) → product จาก products list.
export function indexProducts(products) {
  const m = new Map();
  for (const p of products || []) m.set(String(p.fgCode).trim().toLowerCase(), p);
  return m;
}
