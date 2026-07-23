// SAHAMIT dashboard — pure derivations for the revamped overview (แดชบอร์ด
// ติดตาม FC/PO + การเติบโต). ★ กฎเหล็ก: แดชบอร์ดเป็น "มุมมอง" ของข้อมูล ห้ามสร้าง
// เครื่องยนต์จับคู่ FC↔PO ตัวที่สอง — ทุกกราฟ/ตัวเลขต่อจาก peak engine เดิม
// (buildReconMatrix / reconcileClient). ห้าม re-implement แบบ owner-round
// (findActiveFC = รอบล่าสุดก่อนวัน PO) ที่เราทิ้งไปแล้ว เพราะจะ regress โมเดล peak.
import { buildReconMatrix } from './reconcileClient';
import { deliveryMonthOf, effectivePoQty } from './po';

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

// ── แท็บ "FC แต่ละรอบ" (pure) ────────────────────────────────────────
// วิวัฒนาการ FC: แต่ละรอบมองเดือนเป้าหมายไว้เท่าไร (เส้นละรอบ). รับ rounds ที่
// กรองสินค้าแล้ว (filterRoundsByFg) + mult(fg) จาก unitMultiplier + years (กรอง
// เดือน). คืนรูปที่ recharts กินตรง: { months, rounds:[{roundNo,key,receivedDate}],
// data:[{month, r<roundNo>:qty|null}] }. เดือนที่รอบไม่ครอบ = null (เว้นเส้น).
export function fcEvolution(rounds, { mult = () => 1, years = [] } = {}) {
  const yrOk = (m) => !years.length || years.includes(yearOf(m));
  const monthSet = new Set();
  const perRound = (rounds || []).map((r) => {
    const byMonth = new Map();
    for (const l of r.lines || []) {
      if (!yrOk(l.month)) continue;
      const q = Number(l.qty || 0) * mult(l.fgCode);
      byMonth.set(l.month, (byMonth.get(l.month) || 0) + q);
      monthSet.add(l.month);
    }
    return { roundNo: r.roundNo, receivedDate: r.receivedDate, byMonth };
  }).sort((a, b) => (a.roundNo || 0) - (b.roundNo || 0));

  const months = [...monthSet].sort();
  const roundsMeta = perRound.map((p) => ({ roundNo: p.roundNo, key: `r${p.roundNo}`, receivedDate: p.receivedDate }));
  const data = months.map((m) => {
    const row = { month: m };
    for (const p of perRound) { const v = p.byMonth.get(m); row[`r${p.roundNo}`] = v == null ? null : v; }
    return row;
  });
  return { months, rounds: roundsMeta, data };
}

// ยอดรวมต่อรอบ + %เปลี่ยนเทียบรอบก่อนหน้า (เรียงตาม roundNo). prevPct = null ที่รอบแรก
// หรือเมื่อรอบก่อนหน้ายอด 0. รับ rounds ที่กรองสินค้าแล้ว + mult + years.
export function roundTotals(rounds, { mult = () => 1, years = [] } = {}) {
  const yrOk = (m) => !years.length || years.includes(yearOf(m));
  const arr = (rounds || []).map((r) => {
    let total = 0;
    for (const l of r.lines || []) { if (!yrOk(l.month)) continue; total += Number(l.qty || 0) * mult(l.fgCode); }
    return { roundNo: r.roundNo, receivedDate: r.receivedDate, total };
  }).sort((a, b) => (a.roundNo || 0) - (b.roundNo || 0));
  return arr.map((r, i) => ({
    ...r,
    prevPct: i > 0 && arr[i - 1].total > 0 ? ((r.total - arr[i - 1].total) / arr[i - 1].total) * 100 : null,
  }));
}

// ── แท็บ "FC ซ้อน PO รายเดือน" (pure) ───────────────────────────────
// รวมเป็นรายเดือน: PO (มาแล้ว) + FC ที่ยังรอ PO (waiting) + เส้น FC แต่ละรอบ.
// ต่อจาก peak engine: fcActive = ผลรวม effective FC (peak) ต่อเดือน, po = ผลรวม
// PO ที่จับคู่เดือนนั้น, waiting = fcActive − po (ติดลบ = PO เกิน FC). เส้นรอบมา
// จาก fcEvolution รวมเข้าแถวเดียวกัน (ต่อ recharts ComposedChart).
// รับ rounds/pos ที่กรองสินค้าแล้ว (filterRoundsByFg/filterPosByFg) + mult + years.
// คืน { months, rounds:[{roundNo,key}], data:[{month, PO, waiting, fcActive, r<n>}] }.
export function fcVsPoByMonth(rounds, pos, coverages, { mult = () => 1, years = [] } = {}) {
  const yrOk = (m) => !years.length || years.includes(yearOf(m));
  const matrix = buildReconMatrix(rounds, pos, coverages || []);
  const evo = fcEvolution(rounds, { mult, years });

  const agg = new Map(); // month -> { fcActive, po }
  for (const row of matrix.rows) {
    const m = mult(row.fgCode);
    for (const mo of matrix.months) {
      if (!yrOk(mo)) continue;
      const c = row.cells[mo];
      if (!c) continue;
      const a = agg.get(mo) || { fcActive: 0, po: 0 };
      a.fcActive += (c.fcQty || 0) * m;
      a.po += (c.poQty || 0) * m;
      agg.set(mo, a);
    }
  }

  const months = matrix.months.filter(yrOk).slice().sort();
  const evoByMonth = new Map(evo.data.map((d) => [d.month, d]));
  const data = months.map((mo) => {
    const a = agg.get(mo) || { fcActive: 0, po: 0 };
    const row = { month: mo, PO: a.po, waiting: a.fcActive - a.po, fcActive: a.fcActive };
    const ev = evoByMonth.get(mo);
    for (const r of evo.rounds) row[r.key] = ev ? (ev[r.key] ?? null) : null;
    return row;
  });
  return { months, rounds: evo.rounds, data };
}

// ── แท็บ "PO เทียบ FC" + งานมูลค่า (ยุบจากหน้า /report) ───────────────
// รายสินค้า: FC/PO (ชิ้น) + มูลค่า (× ราคาผลิต) + สถานะรายเดือน (drill-down) +
// รายการ PO ที่ยังแบ่งส่ง/ค้างส่ง. ต่อ peak engine (buildReconMatrix). รับ
// rounds/pos ที่กรองสินค้าแล้ว + products (ราคา) + unit + years (กรองเดือน).
export function matchReport(rounds, pos, coverages, products, { years = [] } = {}) {
  const yrOk = (m) => !years.length || years.includes(yearOf(m));
  const matrix = buildReconMatrix(rounds, pos, coverages || []);
  const prices = priceMap(products);
  const months = matrix.months.filter(yrOk);

  const rows = matrix.rows.map((r) => {
    const price = prices.get(lc(r.fgCode));
    let fcQty = 0, poQty = 0;
    const statuses = {};
    const cells = [];
    for (const mo of months) {
      const c = r.cells[mo];
      if (!c) continue;
      fcQty += c.fcQty || 0;
      poQty += c.poQty || 0;
      if (c.status && c.status !== 'none') statuses[c.status] = (statuses[c.status] || 0) + 1;
      if ((c.fcQty || 0) > 0 || (c.poQty || 0) > 0) cells.push({ month: mo, status: c.status, fcQty: c.fcQty || 0, poQty: c.poQty || 0 });
    }
    return {
      fgCode: r.fgCode, productName: r.productName || null, price: price ?? null,
      fcQty, poQty, fcValue: price == null ? 0 : fcQty * price, poValue: price == null ? 0 : poQty * price,
      statuses, cells,
    };
  }).filter((r) => r.fcQty > 0 || r.poQty > 0);
  rows.sort((a, b) => String(a.fgCode).localeCompare(b.fgCode));

  const totals = rows.reduce((t, r) => ({
    fcQty: t.fcQty + r.fcQty, poQty: t.poQty + r.poQty, fcValue: t.fcValue + r.fcValue, poValue: t.poValue + r.poValue,
  }), { fcQty: 0, poQty: 0, fcValue: 0, poValue: 0 });
  const unpricedCount = rows.filter((r) => r.price == null).length;
  const coveragePct = totals.fcValue > 0 ? Math.round((totals.poValue / totals.fcValue) * 100) : (totals.poValue > 0 ? 100 : 0);

  // PO ที่ยังแบ่งส่งได้ / ค้างส่ง (ตัดยกเลิก/ส่งแล้ว) — กรองปีตามเดือนส่ง.
  const splittable = [];
  for (const po of pos || []) {
    for (const l of po.lines || []) {
      if (l.status === 'cancelled' || l.status === 'delivered' || l.actualDeliveredDate) continue;
      const dm = l.deliveryMonth || deliveryMonthOf(l);
      if (years.length && dm && !yrOk(dm)) continue;
      splittable.push({
        poId: po.id, poNumber: po.poNumber, lineId: l.id, fgCode: l.fgCode, productName: l.productName || null,
        qty: Number(l.qty || 0), status: l.status, deliveryMonth: dm, dueDate: l.dueDate || null, expectedDate: l.expectedDate || null,
        isBalance: !!l.splitFromPoLineId,
      });
    }
  }
  splittable.sort((a, b) => String(a.deliveryMonth || '').localeCompare(b.deliveryMonth || '') || String(a.poNumber).localeCompare(b.poNumber));

  return { months, rows, totals, unpricedCount, coveragePct, splittable };
}

// ── แท็บ "การเติบโต" (pure) ──────────────────────────────────────────
// ยอด PO จริง (ของที่สั่งแล้ว) ต่อช่วงเวลา + %เติบโต. บักเก็ตตามเดือนส่ง PO
// (deliveryMonth/expectedDate/dueDate). ตัดบรรทัดยกเลิก; แบ่งส่งนับยอดส่งจริง.
//   level: 'month' → YYYY-MM · 'quarter' → YYYY-Qn · 'year' → YYYY
//   seqGrowth = %เทียบช่วงก่อนหน้า; yoyGrowth = %เทียบช่วงเดียวกันปีก่อน
//   (month/quarter เท่านั้น — ต้องมีข้อมูลปีก่อน ไม่งั้น null).
// รับ pos ที่กรองสินค้าแล้ว + mult (unit) + years (กรองปี). คืน
//   { rows:[{period,total,seqGrowth,yoyGrowth}], years:[...] }.
export function poGrowth(pos, { level = 'month', mult = () => 1, years = [] } = {}) {
  const yrOk = (y) => !years.length || years.includes(y);
  const bucketOf = (ym) => {
    const [y, m] = ym.split('-');
    if (level === 'year') return y;
    if (level === 'quarter') return `${y}-Q${Math.ceil(Number(m) / 3)}`;
    return ym;
  };
  const map = new Map();
  const yearSet = new Set();
  for (const po of pos || []) {
    for (const l of po.lines || []) {
      if (l.status === 'cancelled') continue;
      const dm = l.deliveryMonth || deliveryMonthOf(l);
      const y = yearOf(dm);
      if (!y || !yrOk(y)) continue;
      yearSet.add(y);
      const key = bucketOf(dm);
      map.set(key, (map.get(key) || 0) + effectivePoQty(l) * mult(l.fgCode));
    }
  }
  const keys = [...map.keys()].sort();
  const rows = keys.map((k, i) => {
    const total = map.get(k);
    const prev = i > 0 ? map.get(keys[i - 1]) : null;
    const seqGrowth = prev ? ((total - prev) / prev) * 100 : null;
    // ช่วงเดียวกันปีก่อน: ลดปีนำหน้า 1 (month "YYYY-MM" / quarter "YYYY-Qn")
    let yoyKey = null;
    if (level === 'month' || level === 'quarter') yoyKey = `${Number(k.slice(0, 4)) - 1}${k.slice(4)}`;
    const yoyPrev = yoyKey != null ? map.get(yoyKey) : null;
    const yoyGrowth = yoyPrev ? ((total - yoyPrev) / yoyPrev) * 100 : null;
    return { period: k, total, seqGrowth, yoyGrowth };
  });
  return { rows, years: [...yearSet].sort() };
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
