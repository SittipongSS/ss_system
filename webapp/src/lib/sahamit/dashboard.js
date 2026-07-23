// SAHAMIT dashboard — pure derivations for the revamped overview (แดชบอร์ด
// ติดตาม FC/PO + การเติบโต). ★ กฎเหล็ก: แดชบอร์ดเป็น "มุมมอง" ของข้อมูล ห้ามสร้าง
// เครื่องยนต์จับคู่ FC↔PO ตัวที่สอง — ทุกกราฟ/ตัวเลขต่อจาก peak engine เดิม
// (buildReconMatrix / reconcileClient). ห้าม re-implement แบบ owner-round
// (findActiveFC = รอบล่าสุดก่อนวัน PO) ที่เราทิ้งไปแล้ว เพราะจะ regress โมเดล peak.
import { buildReconMatrix } from './reconcileClient';
import { deliveryMonthOf } from './po';

const lc = (s) => String(s || '').trim().toLowerCase();
const yearOf = (ym) => (/^\d{4}/.test(String(ym || '')) ? String(ym).slice(0, 4) : null);

// ── ตัวกรองสินค้า (หมวด / ปริมาตร / รหัส) — multi-select ──────────────
// รับ arrays (เลือกได้หลายค่า). ว่างทุกช่อง = ไม่มีตัวกรอง → คืน null (= ทั้งหมด
// รวม fgCode ที่ไม่อยู่ใน master ด้วย จะไม่ถูกกรองทิ้ง). ค่า volume เทียบเป็น string
// (FilterPopover ส่งค่าเป็น string). แต่ละมิติที่มีค่า = AND ระหว่างมิติ, OR ในมิติ.
export function fgCodeFilterSet(products, { cats = [], vols = [], skus = [] } = {}) {
  if (!cats.length && !vols.length && !skus.length) return null;
  const set = new Set();
  for (const p of products || []) {
    if (cats.length && !cats.includes(p.category)) continue;
    if (vols.length && !vols.includes(String(p.volume ?? ''))) continue;
    if (skus.length && !skus.includes(p.fgCode)) continue;
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

// ── ตัวเลือกตัวกรอง ───────────────────────────────────────────────────
export function categoryOptions(products) {
  return [...new Set((products || []).map((p) => p.category).filter(Boolean))].sort((a, b) => String(a).localeCompare(b));
}
export function volumeOptions(products) {
  const v = [...new Set((products || []).map((p) => p.volume).filter((x) => x != null && x !== ''))];
  return v.sort((a, b) => Number(a) - Number(b));
}
// ปีที่มีข้อมูลจริง (จากเดือนเป้าหมาย FC + เดือนส่ง PO) — ใช้ตั้งตัวเลือกตัวกรองปี.
// "ปี" = ปีของเดือนที่กราฟ plot (แกนเดือนเป้าหมาย/ส่ง) ไม่ใช่วันรับเอกสาร.
export function yearOptions(rounds, pos) {
  const ys = new Set();
  for (const r of rounds || []) for (const l of r.lines || []) { const y = yearOf(l.month); if (y) ys.add(y); }
  for (const po of pos || []) for (const l of po.lines || []) { const y = yearOf(l.deliveryMonth || deliveryMonthOf(l)); if (y) ys.add(y); }
  return [...ys].sort();
}

// ── หน่วยที่แสดง: ชิ้น (qty) / มูลค่า (value = qty × ราคาผลิต) ─────────
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
// opts: { unit:'qty'|'value', filter:{cats,vols,skus}, years:[] }
//   years ว่าง = ทุกปี. ปีกรองแค่ "คอลัมน์เดือนที่แสดง" ไม่แตะตรรกะจับคู่ —
//   PO ที่รับปลายปีแล้วส่งข้ามปียังกระทบยอดถูก แค่ซ่อน/โชว์เดือนตามปีที่เลือก.
// คืน { fcTotal, poTotal, coveragePct, statusCounts, overCount, pendingCount,
//   discrepancyCount, unforecastedCount, alertCount, unpricedCount, unit }.
export function dashboardKpis(rounds, pos, coverages, products, { unit = 'qty', filter, years = [] } = {}) {
  const set = fgCodeFilterSet(products, filter || {});
  const matrix = buildReconMatrix(filterRoundsByFg(rounds, set), filterPosByFg(pos, set), coverages || []);
  const prices = priceMap(products);
  const mult = (fg) => (unit === 'value' ? (prices.get(lc(fg)) ?? 0) : 1);
  const monthOk = (mo) => !years || years.length === 0 || years.includes(yearOf(mo));

  let fcTotal = 0, poTotal = 0, unpricedCount = 0;
  const statusCounts = {};
  for (const row of matrix.rows) {
    const price = prices.get(lc(row.fgCode));
    const m = mult(row.fgCode);
    let rowHasQty = false;
    for (const mo of matrix.months) {
      if (!monthOk(mo)) continue;
      const c = row.cells[mo];
      if (!c) continue;
      fcTotal += (c.fcQty || 0) * m;
      poTotal += (c.poQty || 0) * m;
      if ((c.fcQty || 0) > 0 || (c.poQty || 0) > 0) rowHasQty = true;
      if (c.status && c.status !== 'none') statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
    }
    if (unit === 'value' && price == null && rowHasQty) unpricedCount += 1;
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
