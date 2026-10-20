// ── /sahamit/forecast แท็บรายเดือน · "สร้างแผนการขาย": รายการที่เลือก (ตรวจตัวเลข 20/10 · M24b) ──
//
// 🐞 เลขบนแถบ/ปุ่ม/โมดัล ("เลือก N รายการ" · "สร้างแผนการขาย (N)" · "สร้าง N ดีล") เคยนับ `selectedLines.size` ทั้งก้อน
//    ขณะที่จำนวนชิ้น/มูลค่า/ด่านเดือนส่งก่อน PO วนเฉพาะแถวบนจอ (ผ่านคำค้น/หมวด) ⇒ ติ๊ก 10 แล้วค้นจนเหลือ 3:
//    แถบบอก 10 กับยอดของ 3 และกดสร้างได้ 10 ดีล (7 ใบที่มองไม่เห็นไม่ผ่านด่านเดือนด้วย)
// ⭐ ตัวนับ ยอด ด่าน และ lineIds ที่ส่งไปสร้างดีล ออกจากลูปเดียว (`forecastSelectionOf`) — ชุด = แถวบนจอที่ยังไม่มีดีล ∩ ที่ติ๊กไว้
//    + `pruneSelection` ตัดรายการที่หลุดจากจอออกจากการเลือก (ร่วมสายกับ /tax ที่ล้างการเลือกเมื่อกรอง แต่ที่นี่ตัดเฉพาะที่หลุด)
// ⚠️ สูตรล้วน (จอ import ได้) — ด่านเดือน (`isEarly`) รับจากจอ: จอถือ "เดือนคาดได้รับ PO" ที่เลือกในโมดัล

/**
 * สรุปรายการที่เลือกของแถบ "สร้างแผนการขาย"
 * @param {Array<{ id, qty, price, amount, mapped, month }>} lineList แถวบนจอ (ผ่านคำค้น/หมวดแล้ว)
 * @param {Set} selectedIds ไอดีที่ติ๊กไว้
 * @param {{ isEarly?: (row) => boolean }} opts ด่านเดือนส่งของมาก่อนเดือนคาดได้รับ PO
 * @returns {{ ids: string[], count: number, qty: number, value: number, unpriced: number, early: object[] }}
 *   `ids` = ชุดที่ส่งไปสร้างดีล · `count === ids.length` เสมอ · ยอด/ด่านวนชุดเดียวกัน
 */
export function forecastSelectionOf(lineList = [], selectedIds = new Set(), { isEarly } = {}) {
  let qty = 0, value = 0, unpriced = 0;
  const ids = [];
  const early = []; // เดือนส่งของมาก่อนเดือนคาดได้รับ PO ⇒ วันเริ่มจะเลยวันสิ้นสุด (server ตีกลับ)
  for (const r of lineList || []) {
    // ติ๊กอยู่ ∩ บนจอ (lineList ผ่านคำค้น/หมวดแล้ว) ∩ ยังไม่มีดีล = ชุดเดียวกับ selectableLines ที่ติ๊กไว้
    if (r.mapped || !selectedIds?.has(r.id)) continue;
    ids.push(r.id);
    qty += Number(r.qty) || 0;
    if (isEarly?.(r)) early.push(r);
    if (r.price == null) { unpriced += 1; continue; }
    value += Number(r.amount) || 0;
  }
  return { ids, count: ids.length, qty, value, unpriced, early };
}

/**
 * ตัดไอดีที่ไม่อยู่ในแถวที่เลือกได้บนจอ (`selectableLines` = บนจอ ∩ ยังไม่มีดีล) ออกจากการเลือก
 * ไม่มีอะไรหลุด ⇒ คืน `prev` ตัวเดิม (setState ด้วยตัวเดิม = ไม่เรนเดอร์ซ้ำ ไม่วน effect)
 */
export function pruneSelection(prev, selectableLines = []) {
  const keep = new Set((selectableLines || []).map((r) => r.id));
  const next = new Set([...(prev || [])].filter((id) => keep.has(id)));
  return next.size === (prev?.size ?? 0) ? prev : next;
}
