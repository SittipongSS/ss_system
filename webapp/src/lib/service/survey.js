// ── ตรรกะของใบประเมินพื้นที่ (mig 0314) — ไม่แตะ DB ─────────────────────
//
// ⭐ ที่มา: ฝ่ายขายต้องรู้ว่าพื้นที่ต้องใช้กี่แพ็คเกจก่อนตั้งราคา แต่ไม่มีใครรู้
// จนกว่าจะมีคนไปวัด · ไฟล์นี้คือกฎทั้งหมดที่ทั้งจอและ server ต้องถามตัวเดียวกัน
//
// 🔴 **ห้ามให้ปุ่มบนจอตัดสินเองแยกจาก server** — เงื่อนไขที่ปุ่มรู้แต่ server ไม่รู้
// คือปุ่มที่จางเงียบโดยไม่บอกเหตุ (กติกาเดิมของ lib/requests/stages.js)

/* ── สูตร: 2,400 ลบ.ม. = 1 แพ็คเกจ (มติผู้ใช้ 2026-08-29) ───────────────
   ⚠️ ใช้ **ปริมาตร** ไม่ใช่พื้นที่ — เพดาน 6.5 ม. กับ 2.8 ม. ที่พื้นที่เท่ากัน
      ต้องการไม่เท่ากัน
   🪤 อย่าสับสนกับ `suggestStandardMl` (1 แพ็คเกจ = 1 ลิตร/เดือน) ซึ่งเป็นความสัมพันธ์
      **แพ็คเกจ ↔ น้ำหอม** คนละแกนกัน — ตัวนี้ตอบว่า *ต้องใช้กี่แพ็คเกจ* */
export const CBM_PER_PACKAGE = 2400;

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/* ── ส่วนของพื้นที่หนึ่งส่วน ────────────────────────────────────────────
   พื้นที่จริงไม่ใช่กล่องสี่เหลี่ยม — รูปตัว L แบ่งเป็นสองก้อนแล้วบวกกัน
   ⚠️ กรอกไม่ครบสามช่อง = **แถวเสีย ต้องตีกลับ** ไม่ใช่แถวที่คิดเป็น 0 */
export function normalizeSurveyPart(input = {}) {
  const out = { id: String(input.id ?? '').trim() || null, label: String(input.label ?? '').trim() || null };
  for (const [field, label] of [['widthM', 'กว้าง'], ['lengthM', 'ยาว'], ['heightM', 'สูง']]) {
    const value = num(input[field]);
    if (value === null) return { value: null, error: `ส่วนของพื้นที่: ต้องระบุ${label} (เมตร)` };
    if (value <= 0) return { value: null, error: `ส่วนของพื้นที่: ${label}ต้องมากกว่า 0` };
    // เพดานกันพิมพ์ผิดหลัก — 500 ม. คือความยาวสนามบิน ไม่ใช่โซนในห้าง
    if (value > 500) return { value: null, error: `ส่วนของพื้นที่: ${label} ${value} เมตร ดูเหมือนพิมพ์ผิดหลัก` };
    out[field] = value;
  }
  return { value: out, error: null };
}

/* ── ขนาดรวมของพื้นที่หนึ่ง = ผลบวกของทุกส่วน ───────────────────────── */
export function surveyZoneSize(parts = []) {
  const rows = Array.isArray(parts) ? parts : [];
  let areaSqm = 0;
  let volumeCbm = 0;
  let measured = 0;
  for (const part of rows) {
    const w = num(part?.widthM);
    const l = num(part?.lengthM);
    const h = num(part?.heightM);
    if (!(w > 0) || !(l > 0) || !(h > 0)) continue;
    measured += 1;
    areaSqm += w * l;
    volumeCbm += w * l * h;
  }
  return {
    parts: rows.length,
    measuredParts: measured,
    // ปัดทศนิยมหนึ่งตำแหน่งตอนอ่าน — เก็บดิบไว้ให้ผู้เรียกคำนวณต่อได้
    areaSqm: Math.round(areaSqm * 100) / 100,
    volumeCbm: Math.round(volumeCbm * 100) / 100,
    complete: rows.length > 0 && measured === rows.length,
  };
}

/* ── สูตรแพ็คเกจ ───────────────────────────────────────────────────────
   🔴 **ปัดเศษครั้งเดียวที่ระดับพื้นที่ ห้ามปัดรายส่วน** — สองส่วนส่วนละ 100 ลบ.ม.
      รวม 200 ⇒ 1 แพ็คเกจ · ปัดรายส่วนจะได้ ceil(100/2400) สองครั้ง = 2 ซึ่งผิดเป็นเท่าตัว
   ⭐ กติกาที่ครอบทั้งสองระดับ: **ขอบของการปัดเศษ = ขอบที่กลิ่นข้ามไม่ได้ = ผนังของพื้นที่**
      รวมข้ามพื้นที่ไม่ได้ (กลิ่นไม่ทะลุผนัง) · แยกในพื้นที่ก็ไม่ได้ (กลิ่นเดินทั่วห้อง) */
export function suggestedPackages(volumeCbm) {
  const volume = num(volumeCbm);
  if (!(volume > 0)) return null;
  return Math.max(1, Math.ceil(volume / CBM_PER_PACKAGE));
}

/* จุดที่ติดตั้งได้ (ช่างแจ้ง) กับจุดที่เลือกติดตั้ง (หัวหน้าเลือก)
   ⚠️ **จำนวนจุด ≠ จำนวนแพ็คเกจ** — `service-field-operations` §2.4 บันทึกไว้แล้วว่า
      "จำนวนเครื่องต่อแพ็คเกจแกว่ง" · หนึ่งแพ็คเกจกระจายหลายจุดได้ หลายแพ็คเกจลงจุดเดียวได้
      ⇒ ห้ามผูกสองเลขนี้เข้าหากัน และห้ามเตือนว่า "ไม่เท่ากัน" */
export function spotCounts(spots = []) {
  const rows = Array.isArray(spots) ? spots : [];
  return { total: rows.length, selected: rows.filter((s) => s?.selected === true).length };
}

/* ── สรุปพื้นที่หนึ่งแถว ─────────────────────────────────────────────── */
export function surveyZoneSummary(row = {}) {
  const size = surveyZoneSize(row.parts);
  const spots = spotCounts(row.spots);
  const suggested = suggestedPackages(size.volumeCbm);
  const packageQty = Number.isFinite(Number(row.packageQty)) ? Number(row.packageQty) : null;
  return {
    ...size,
    ...{ spotsTotal: spots.total, spotsSelected: spots.selected },
    suggestedPackages: suggested,
    packageQty,
    // ต่างจากสูตรกี่แพ็คเกจ — บวก = สูงกว่าสูตร · ลบ = ต่ำกว่า
    packageDelta: suggested !== null && packageQty !== null ? packageQty - suggested : null,
    status: row.status || 'ok',
  };
}

/* ── ยอดรวมทั้งใบ ──────────────────────────────────────────────────────
   ⚠️ พื้นที่ที่ถูกตัด (`status='cut'`) ไม่นับรวมทุกตัวเลข — ไม่ใช่นับเป็น 0
      เพราะ 0 อ่านว่า "วัดแล้วได้ศูนย์" ส่วนตัดออกคือ "ไม่ได้วัด และจะไม่ขาย" */
export function surveyTotals(rows = []) {
  const active = (Array.isArray(rows) ? rows : []).filter((r) => (r?.status || 'ok') !== 'cut');
  const t = {
    zones: active.length, cutZones: (rows || []).length - active.length,
    areaSqm: 0, volumeCbm: 0, suggestedPackages: 0, packageQty: 0,
    spotsTotal: 0, spotsSelected: 0,
  };
  for (const row of active) {
    const s = surveyZoneSummary(row);
    t.areaSqm += s.areaSqm;
    t.volumeCbm += s.volumeCbm;
    // 🔴 บวก "แพ็คเกจที่สูตรบอก" รายพื้นที่ แล้วค่อยรวม — ห้ามเอาปริมาตรรวมมาหาร
    if (s.suggestedPackages) t.suggestedPackages += s.suggestedPackages;
    if (s.packageQty) t.packageQty += s.packageQty;
    t.spotsTotal += s.spotsTotal;
    t.spotsSelected += s.spotsSelected;
  }
  t.areaSqm = Math.round(t.areaSqm * 100) / 100;
  t.volumeCbm = Math.round(t.volumeCbm * 100) / 100;
  return t;
}
