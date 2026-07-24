// SAHAMIT — reconciliation matrix (pure). Builds the FC × PO grid the recon page
// renders, reusing the tested reconcileCell logic. No fetch, no React.
import { reconcileCell, RECON_STATUS_COLOR } from './reconcile';
import { deliveryMonthOf, effectivePoQty } from './po';

export { RECON_STATUS_COLOR };

// effective FC per (fgCode, month) — coverMonths rule.
//
// Each FC round states the customer's plan for a WINDOW of months (coverMonths).
// The OWNER of a month = the latest round whose window covers it. The effective
// FC for (sku, month) = the sum of that owning round's lines for that sku+month,
// or 0 if the owning round covers the month but doesn't list the sku.
//
// Why this rule (vs "latest round that has a line"): the customer agreement is
// "no cut, only shift". A shift moves qty from month A to month B. Under the
// line rule, month A would keep its old value AND month B gets the new one →
// double-count → the running total (peak) is wrong → we can't tell a real shift
// from a sneaky cut. The coverMonths rule zeroes month A (its owning round
// dropped it) so the total is preserved on a true shift and visibly drops on a
// cut — which is exactly what the peak warning needs to flag.
//
// Fallback: a round with no coverMonths (legacy) is treated as owning the months
// its lines mention, degrading gracefully to the old line behavior.
// effective FC per (fgCode, month) — PEAK-matching model (มติ 2026-07-23).
//
// เดิมใช้ "รอบล่าสุดที่ครอบเดือน" เป็นเจ้าของ → พอรอบใหม่ครอบเดือนแคบลง/ตัดสินค้า
// ออกจากเดือนอดีต FC กลายเป็น 0 ทั้งที่ PO มาชนแล้ว → PO ดูเป็น "นอก FC".
//
// โมเดลใหม่: ยึด **FC สูงสุดที่เคยพยากรณ์ (peak)** ต่อ (สินค้า×เดือน) เป็นดีมานด์ที่
// ลูกค้า commit ไว้ แล้วให้ PO มาจับคู่ในกระทบยอด (ล็อกส่วนที่แมช เหลือรอ PO).
// FC ไม่หายเองเพราะรอบใหม่ไม่พูดถึง — จะลดลงก็ต่อเมื่อ "คนยืนยันว่าตัด/เลื่อนจริง"
// (confirmedCuts: Map "fg||month" -> qty ที่ยืนยันตัด/เลื่อนออก จากธง status
// confirmed_cut / confirmed_shift). ที่หายเพราะ PO มา = ยังคง peak ไว้ให้ PO จับคู่.
function effectiveFc(rounds, confirmedCuts) {
  const ever = new Set();       // (fg,month) ever forecast with qty>0 (history)
  const names = new Map();
  const peakQty = new Map();    // "fg||month" -> max summed qty across rounds
  const months = new Set();     // ทุกเดือนที่เคยมี FC (สำหรับตั้งคอลัมน์)

  for (const r of rounds || []) {
    const agg = new Map();      // สรุป qty ต่อ (fg,month) ในรอบนี้
    for (const l of r.lines || []) {
      const q = Number(l.qty || 0);
      if (l.productName && !names.get(l.fgCode)) names.set(l.fgCode, l.productName);
      else if (!names.has(l.fgCode)) names.set(l.fgCode, null);
      const k = `${l.fgCode}||${l.month}`;
      agg.set(k, (agg.get(k) || 0) + q);
      months.add(l.month);
    }
    for (const [k, q] of agg) {
      if (q > 0) ever.add(k);
      if (q > (peakQty.get(k) || 0)) peakQty.set(k, q); // peak = สูงสุดข้ามรอบ
    }
  }

  const fcQtyOf = (fg, month) => {
    const k = `${fg}||${month}`;
    const cut = Number((confirmedCuts && confirmedCuts.get(k)) || 0);
    return Math.max(0, (peakQty.get(k) || 0) - cut); // peak − ที่ยืนยันตัด/เลื่อน
  };

  return { fcQtyOf, ever, names, months };
}

// PO qty per (fgCode, month) — active lines only (cancelled excluded), matched
// by deliveryMonth (expected delivery, else due date).
function poByMonth(pos, names) {
  const agg = new Map();
  for (const po of pos || []) {
    for (const l of po.lines || []) {
      if (l.status === 'cancelled') continue;
      const m = l.deliveryMonth || deliveryMonthOf(l);
      if (!m) continue;
      const key = `${l.fgCode}||${m}`;
      agg.set(key, (agg.get(key) || 0) + effectivePoQty(l)); // แบ่งส่ง: นับยอดส่งจริง
      if (l.productName && !names.get(l.fgCode)) names.set(l.fgCode, l.productName);
      else if (!names.has(l.fgCode)) names.set(l.fgCode, null);
    }
  }
  return agg;
}

// Returns { months:[...], rows:[{ fgCode, productName, fcTotal, poTotal,
//   cells:{ month: { status, label, fcQty, poQty, excess } } }] }.
// confirmedCuts (optional): Map "fg||month" -> qty ที่ยืนยันตัด/เลื่อนออก (จากธง)
// — ลดจาก peak FC. ไม่ส่ง = ไม่มีการยืนยันตัด (FC = peak เต็ม).
export function buildReconMatrix(rounds, pos, coverages = [], confirmedCuts = null) {
  const { fcQtyOf, ever, names, months: fcMonths } = effectiveFc(rounds, confirmedCuts);
  const poAgg = poByMonth(pos, names);

  // Cross-month coverage — ย้าย "FC" (ไม่ใช่ PO). PO = ของจริงที่สั่งแล้ว (สิ้นสุด)
  // จึงอยู่กับที่เสมอ; การชดเชยคือดึง FC จากเดือนต้นทาง (มี FC ไม่มี PO) ไปเดือน
  // ปลายทาง (มี PO แต่ FC ขาด) ให้ FC ตรงกับ PO. ยอด FC เดิมเก็บไว้ (cell.originalFc)
  // เพื่อตรวจย้อนได้. sourceMonth = FC ถูกดึงออก, targetMonth = FC ถูกเติมเข้า.
  const covIn = new Map();  // key fg||month (target) -> FC in
  const covOut = new Map(); // key fg||month (source) -> FC out
  const extraMonths = new Set();
  for (const c of coverages || []) {
    const q = Number(c.qty || 0);
    covIn.set(`${c.fgCode}||${c.targetMonth}`, (covIn.get(`${c.fgCode}||${c.targetMonth}`) || 0) + q);
    covOut.set(`${c.fgCode}||${c.sourceMonth}`, (covOut.get(`${c.fgCode}||${c.sourceMonth}`) || 0) + q);
    extraMonths.add(c.sourceMonth); extraMonths.add(c.targetMonth);
  }

  // months = ทุกเดือนที่เคยมี FC (peak) + เดือนส่ง PO + เดือนชดเชย.
  const months = new Set([...fcMonths, ...extraMonths]);
  const skus = new Set();
  for (const r of rounds || []) for (const l of r.lines || []) skus.add(l.fgCode);
  for (const c of coverages || []) skus.add(c.fgCode);
  for (const key of poAgg.keys()) {
    const i = key.indexOf('||');
    skus.add(key.slice(0, i));
    months.add(key.slice(i + 2));
  }
  const monthList = [...months].sort();
  const skuList = [...skus].sort((a, b) => a.localeCompare(b));

  const rows = skuList.map((fg) => {
    const cells = {};
    let fcTotal = 0;
    let poTotal = 0;
    for (const m of monthList) {
      const key = `${fg}||${m}`;
      const baseFc = fcQtyOf(fg, m);
      const basePo = poAgg.get(key) || 0;
      const cin = covIn.get(key) || 0;   // FC received from other months
      const cout = covOut.get(key) || 0; // FC sent to other months
      const effFc = Math.max(0, baseFc - cout + cin); // effective FC after moving
      const shiftedAway = cout > 0 && effFc === 0;     // this month's FC fully moved out
      const cell = reconcileCell({
        fcQty: effFc, poQty: basePo, originalFcQty: baseFc,
        hasHistory: ever.has(key), shiftedAway, totalCovered: cout,
      });
      cell.fcQty = effFc;        // effective FC (after coverage) for display/match
      cell.originalFc = baseFc;  // ยอด FC เดิม (ก่อนชดเชย) — ไว้ตรวจย้อน
      cell.poQty = basePo;       // PO fixed (สิ้นสุด, ไม่ขยับ)
      cell.effPo = basePo;
      cell.coverageIn = cin;     // FC เติมเข้า
      cell.coverageOut = cout;   // FC ดึงออก
      cells[m] = cell;
      fcTotal += effFc;
      poTotal += basePo;
    }
    return { fgCode: fg, productName: names.get(fg) || null, cells, fcTotal, poTotal };
  });

  return { months: monthList, rows };
}

// จัดกลุ่ม PO ตาม "รอบ FC ที่ active ตอนรับ PO" — รอบ = ช่วงตั้งแต่วันรับรอบนี้ ถึง
// ก่อนวันรับรอบถัดไป (ยึดวันรับ PO). ใช้ในหน้ากระทบยอด: เลือกรอบแล้วดูว่ารอบนั้นมี
// PO เข้ามารับอะไรบ้าง. รอบเรียงตามวันรับ; PO ที่รับก่อนรอบแรก/ไม่มีวันรับ = unassigned.
// คืน { windows:[{roundNo,start,end}], byRound:Map<roundNo,{roundNo,start,end,pos:[]}>,
//   unassigned:[] } (end = วันรับรอบถัดไป, exclusive; รอบล่าสุด end=null = ต่อเนื่อง).
export function posByRound(rounds, pos) {
  const sorted = [...(rounds || [])]
    .filter((r) => r.receivedDate)
    .sort((a, b) => String(a.receivedDate).localeCompare(String(b.receivedDate)));
  const windows = sorted.map((r, i) => ({
    roundNo: r.roundNo,
    start: r.receivedDate,
    end: i + 1 < sorted.length ? sorted[i + 1].receivedDate : null,
  }));
  const byRound = new Map(windows.map((w) => [w.roundNo, { ...w, pos: [] }]));
  const unassigned = [];
  for (const po of pos || []) {
    const d = po.receivedDate;
    if (!d) { unassigned.push(po); continue; }
    let placed = null;
    for (const w of windows) {
      if (String(d) >= String(w.start) && (w.end == null || String(d) < String(w.end))) { placed = w.roundNo; break; }
    }
    if (placed == null) unassigned.push(po);       // รับก่อนรอบแรก (ยังไม่มี FC)
    else byRound.get(placed).pos.push(po);
  }
  return { windows, byRound, unassigned };
}

// Per-(sku,month) drill-down: which FC rounds contributed and which PO lines
// deliver in that month. Pure — feed it the raw rounds/pos.
export function cellDetail(rounds, pos, fgCode, month) {
  const fcs = [];
  for (const r of rounds || []) {
    for (const l of r.lines || []) {
      if (l.fgCode === fgCode && l.month === month) {
        fcs.push({ roundNo: r.roundNo, receivedDate: r.receivedDate, qty: Number(l.qty || 0) });
      }
    }
  }
  fcs.sort((a, b) => (a.roundNo || 0) - (b.roundNo || 0));

  const poLines = [];
  for (const po of pos || []) {
    for (const l of po.lines || []) {
      const m = l.deliveryMonth || deliveryMonthOf(l);
      if (l.fgCode === fgCode && m === month) {
        poLines.push({ poNumber: po.poNumber, poId: po.id, docDate: po.docDate || null, receivedDate: po.receivedDate || null, qty: Number(l.qty || 0), dueDate: l.dueDate, expectedDate: l.expectedDate, actualDeliveredDate: l.actualDeliveredDate, status: l.status });
      }
    }
  }
  return { fcs, poLines };
}
