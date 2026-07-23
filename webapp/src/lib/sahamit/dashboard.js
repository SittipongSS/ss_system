// SAHAMIT dashboard — pure derivations for the revamped overview (แดชบอร์ด
// ติดตาม FC/PO + การเติบโต). ★ กฎเหล็ก: แดชบอร์ดเป็น "มุมมอง" ของข้อมูล ห้ามสร้าง
// เครื่องยนต์จับคู่ FC↔PO ตัวที่สอง — ทุกกราฟ/ตัวเลขต่อจาก peak engine เดิม
// (buildReconMatrix / reconcileClient). ห้าม re-implement แบบ owner-round
// (findActiveFC = รอบล่าสุดก่อนวัน PO) ที่เราทิ้งไปแล้ว เพราะจะ regress โมเดล peak.
import { buildReconMatrix } from './reconcileClient';

const lc = (s) => String(s || '').trim().toLowerCase();

// ── ตัวกรอง (หมวด / ปริมาตร / รหัสสินค้า) ─────────────────────────────
// คืน Set ของ fgCode (lowercase) ที่ผ่านตัวกรอง หรือ null = ไม่มีตัวกรองเลย
// (= ทั้งหมด รวม fgCode ที่ไม่อยู่ใน master ด้วย — จะไม่ถูกกรองทิ้ง). ตัวกรอง
// ทำงานบน product meta ที่มากับ /api/sahamit/products (category/volume/fgCode).
export function fgCodeFilterSet(products, { category = 'All', volume = 'All', fgCode = 'All' } = {}) {
  if (category === 'All' && volume === 'All' && fgCode === 'All') return null;
  const set = new Set();
  for (const p of products || []) {
    if (category !== 'All' && p.category !== category) continue;
    if (volume !== 'All' && String(p.volume ?? '') !== String(volume)) continue;
    if (fgCode !== 'All' && p.fgCode !== fgCode) continue;
    if (p.fgCode) set.add(lc(p.fgCode));
  }
  return set;
}

const inSet = (set, fg) => set == null || set.has(lc(fg));

// กรองบรรทัดในแต่ละรอบ FC / ใบ PO ให้เหลือเฉพาะ fgCode ที่ผ่านตัวกรอง (คงโครง
// rounds/pos ไว้ให้ engine เดิมกินต่อได้). set==null → คืนของเดิม (ไม่กรอง).
export function filterRoundsByFg(rounds, set) {
  if (set == null) return rounds || [];
  return (rounds || []).map((r) => ({ ...r, lines: (r.lines || []).filter((l) => inSet(set, l.fgCode)) }));
}
export function filterPosByFg(pos, set) {
  if (set == null) return pos || [];
  return (pos || []).map((p) => ({ ...p, lines: (p.lines || []).filter((l) => inSet(set, l.fgCode)) }));
}

// ตัวเลือกหมวด/ปริมาตรจากรายการสินค้า (ไม่ซ้ำ, เรียง, 'All' นำหน้า).
export function categoryOptions(products) {
  const c = [...new Set((products || []).map((p) => p.category).filter(Boolean))].sort((a, b) => String(a).localeCompare(b));
  return ['All', ...c];
}
export function volumeOptions(products) {
  const v = [...new Set((products || []).map((p) => p.volume).filter((x) => x != null && x !== ''))];
  v.sort((a, b) => Number(a) - Number(b));
  return ['All', ...v];
}

// ── หน่วยที่แสดง: ชิ้น (qty) / มูลค่า (value = qty × ราคาผลิต) ─────────
// price = costPrice จาก products (map ที่ loadSahamitProducts). ราคา null →
// ตัวคูณ 0 (สินค้ายังไม่ตั้งราคา ไม่นับมูลค่า) — ตรงกับ reportClient.
export function priceMap(products) {
  const m = new Map();
  for (const p of products || []) if (p.fgCode) m.set(lc(p.fgCode), p.price == null ? null : Number(p.price));
  return m;
}
export function unitMultiplier(products, unit) {
  const prices = priceMap(products);
  return (fg) => (unit === 'value' ? (prices.get(lc(fg)) ?? 0) : 1);
}

// ── KPI สรุป (จาก peak engine, หลังกรอง) ─────────────────────────────
// unit: 'qty' | 'value'. คืน { fcTotal, poTotal, coveragePct, statusCounts,
//   overCount, pendingCount, unforecastedCount, discrepancyCount, alertCount,
//   unpricedCount, unit }.
export function dashboardKpis(rounds, pos, coverages, products, { unit = 'qty', filter } = {}) {
  const set = fgCodeFilterSet(products, filter || {});
  const matrix = buildReconMatrix(filterRoundsByFg(rounds, set), filterPosByFg(pos, set), coverages || []);
  const prices = priceMap(products);
  const mult = (fg) => (unit === 'value' ? (prices.get(lc(fg)) ?? 0) : 1);

  let fcTotal = 0, poTotal = 0, unpricedCount = 0;
  const statusCounts = {};
  for (const row of matrix.rows) {
    const price = prices.get(lc(row.fgCode));
    if (unit === 'value' && price == null && (row.fcTotal > 0 || row.poTotal > 0)) unpricedCount += 1;
    const m = mult(row.fgCode);
    fcTotal += row.fcTotal * m;
    poTotal += row.poTotal * m;
    for (const mo of matrix.months) {
      const st = row.cells[mo]?.status;
      if (st && st !== 'none') statusCounts[st] = (statusCounts[st] || 0) + 1;
    }
  }
  const coveragePct = fcTotal > 0 ? Math.round((poTotal / fcTotal) * 100) : (poTotal > 0 ? 100 : 0);
  const pendingCount = statusCounts.pending || 0;
  const discrepancyCount = statusCounts.discrepancy || 0;
  const unforecastedCount = statusCounts.unforecasted || 0;
  return {
    fcTotal, poTotal, coveragePct, statusCounts,
    overCount: statusCounts.over || 0,
    pendingCount, discrepancyCount, unforecastedCount,
    alertCount: pendingCount + discrepancyCount + unforecastedCount,
    unpricedCount, unit,
  };
}
