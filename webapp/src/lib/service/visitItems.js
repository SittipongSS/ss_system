// ── ของที่ใช้ในนัด (mig 0188 · S-3) — ตรวจค่าหนึ่งบรรทัด · logic ล้วน (ไม่แตะ DB) ──────────
//
// ⭐ ยกออกมาจาก `POST visits/[id]/items` ตอนมีทางเขียนที่สอง — `PATCH items/[itemId]` (แผน operation-crew R9)
//    เพิ่ม/แก้ต้องตรวจด้วยกติกาเดียวกันเป๊ะ (กฎ "แก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง" ฝั่ง server) ·
//    สองชุดเมื่อไร ข้อความ/เพดานจะเพี้ยนหากันเงียบ ๆ
// ⚠️ มติ §10.2: **บันทึกอย่างเดียว ไม่ตัดสต็อก ไม่ออกบิล** — ไม่มีช่อง "คงเหลือ" ให้เข้าใจผิด
// ⚠️ ตรวจซ้ำทั้งที่ DB มี CHECK (mig 0188) — ข้อความของ Postgres เป็นภาษาอังกฤษดิบ

/**
 * ตรวจบรรทัดของที่ใช้ — คืน `{ value, error }` · `value` = ช่องที่เขียนลงแถวได้ตรง ๆ
 * (ไม่มี `id` / `visitId` — ผู้เรียกใส่เอง)
 */
export function normalizeVisitItem(body = {}) {
  const label = String(body?.label ?? '').trim().replace(/\s+/g, ' ');
  if (!label) return { value: null, error: 'ต้องระบุชื่อของที่ใช้' };
  if (label.length > 200) return { value: null, error: 'ชื่อของที่ใช้ยาวเกิน 200 ตัวอักษร' };

  // ⚠️ จำนวนเว้นว่างได้ — "เติมน้ำหอมขวดนึง" ที่ยังไม่ได้ชั่งจริงมีอยู่จริง
  // ห้ามแปลงค่าว่างเป็น 0 (0 อ่านว่า "ไม่ได้ใช้เลย" ซึ่งคนละความหมาย)
  let qty = null;
  if (body?.qty !== undefined && body?.qty !== null && String(body.qty).trim() !== '') {
    qty = Number(body.qty);
    if (!Number.isFinite(qty) || qty <= 0) return { value: null, error: 'จำนวนต้องเป็นตัวเลขมากกว่า 0' };
  }

  const unit = String(body?.unit ?? '').trim();
  if (unit.length > 30) return { value: null, error: 'หน่วยยาวเกิน 30 ตัวอักษร' };
  const note = String(body?.note ?? '').trim();
  if (note.length > 500) return { value: null, error: 'หมายเหตุยาวเกิน 500 ตัวอักษร' };

  return {
    value: {
      assetId: body?.assetId || null,
      productId: body?.productId || null,
      label,
      qty,
      unit: unit || null,
      note: note || null,
    },
    error: null,
  };
}
