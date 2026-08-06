// ── กติกาการค้นของตัวเลือกทั้งระบบ — ตรรกะล้วน ที่เดียว ────────────────────
//
// ⭐ เดิมแต่ละตัวเลือกเขียนเงื่อนไขค้นเอง (SearchableSelect ใช้ includes ตรง ๆ,
// FilterPopover ก็อีกชุด, DealPicker อีกชุด) — ผลคือ "ค้นได้" ไม่ได้แปลว่าเหมือนกัน:
// บางที่พิมพ์สองคำแล้วเจอ บางที่ไม่เจอ ทั้งที่หน้าตาช่องค้นเหมือนกันเป๊ะ
//
// กติกากลาง: **หลายคำ = ต้องเจอทุกคำ** (ไม่ใช่ทั้งประโยคติดกัน) และไม่สนตัวพิมพ์เล็ก/ใหญ่
// คนพิมพ์ "rinvala 2026-08" โดยคาดว่าจะได้ดีลรินวาลาของเดือนนั้น ไม่ใช่ผลลัพธ์ว่าง
export function matchesQuery(text, query) {
  const hay = String(text || '').toLocaleLowerCase('th');
  return String(query || '')
    .toLocaleLowerCase('th')
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

/** กรองรายการด้วยคำค้น — `textOf` คืน "ข้อความที่ค้นได้" ของแต่ละแถว */
export function filterByQuery(rows = [], query = '', textOf = (row) => row?.search ?? row?.label ?? '') {
  const needle = String(query || '').trim();
  if (!needle) return rows;
  return rows.filter((row) => matchesQuery(textOf(row), needle));
}
