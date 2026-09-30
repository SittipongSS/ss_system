// ── ป้าย "รายการ n · FG" ของรอบขาย (review 29/09) — ตัวช่วยเดียวของสองจอที่มีช่องมาตรฐาน มล. ─────────────────
//
// ⭐ โซนเดียวถือหลายรอบขายได้ (SO-26090247-0: สองบรรทัด FG เดียวกันลงโซน Office) ⇒ สองช่องหน้าตาเหมือนกันเป๊ะ
//   ⇒ บอกว่าเป็นของบรรทัดไหน · เลขรายการ = ตำแหน่งในใบเรียงตาม sortOrder (ตรงคอลัมน์ # ของตารางรายการของใบ)
// ⭐ ผู้ใช้: แท็บงานบริการของใบ (`salesOrderServiceSummary`) + แถวคิว TS (`intakePlanFacts.planRowFacts`)
//   — สองจอต้องเรียงและติดป้ายรอบขายชุดเดียวกันเหมือนกันทุกตัวอักษร (เทสต์เทียบตรง ๆ)
// ⚠️ **ไฟล์นี้ไม่มี import** — salesOrderServiceSummary ห้ามดึงไฟล์ของคิว TS (แผน C §3.8 · กฎ 16) ⇒ ตัวกลางต้องเบา
// ⚠️ ไม่แตะทรงของรายการ term (§4.3) — คืนอาเรย์ใหม่ที่เรียงแล้ว + แผนที่ป้ายแยก

const text = (value) => String(value ?? '').trim();
/* เรียงแบบคนอ่าน — ไทย · ตัวเลขเทียบเป็นเลข (กติกาเดียวกับตารางโซนของหน้าไซต์) */
const naturalCompare = (a, b) => text(a).localeCompare(text(b), 'th', { numeric: true, sensitivity: 'base' });

/**
 * @param items รายการ term ทรง §4.3 (`id · zoneId · zoneCode · zoneName · fgCode …`)
 * @param terms term ดิบ (`id → salesOrderLineId`) · @param lines บรรทัด **ทั้งใบ** (`id · sortOrder`)
 * @returns `{ items, labels }` — items เรียง ชื่อโซน → ลำดับบรรทัด → id · labels = `{ [termId]: { zone, detail } }`
 *          `detail` = "รายการ n · FG" เฉพาะโซนที่มีมากกว่าหนึ่งรอบขาย (โซนเดียวรอบเดียว = null)
 */
export function termLineLabels(items = [], { terms = [], lines = [] } = {}) {
  const lineNo = new Map();
  [...(Array.isArray(lines) ? lines : [])]
    .sort((a, b) => (Number(a?.sortOrder) || 0) - (Number(b?.sortOrder) || 0))
    .forEach((line, index) => { if (line?.id) lineNo.set(line.id, index + 1); });
  const lineNoOfTerm = new Map((Array.isArray(terms) ? terms : [])
    .filter((t) => t?.id)
    .map((t) => [t.id, lineNo.get(t.salesOrderLineId) ?? null]));

  const sorted = [...(Array.isArray(items) ? items : [])].sort((a, b) => naturalCompare(a.zoneName, b.zoneName)
    || (lineNoOfTerm.get(a.id) ?? Infinity) - (lineNoOfTerm.get(b.id) ?? Infinity)
    || naturalCompare(a.id, b.id));

  const perZone = new Map();
  for (const item of sorted) perZone.set(item.zoneId, (perZone.get(item.zoneId) || 0) + 1);
  const labels = Object.fromEntries(sorted.map((item) => {
    const n = lineNoOfTerm.get(item.id);
    const detail = perZone.get(item.zoneId) > 1
      ? [n ? `รายการ ${n}` : null, item.fgCode].filter(Boolean).join(' · ') || null
      : null;
    return [item.id, { zone: item.zoneName || item.zoneCode || item.zoneId, detail }];
  }));
  return { items: sorted, labels };
}
