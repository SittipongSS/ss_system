// SAHAMIT — reconciliation matrix (pure). Builds the FC × PO grid the recon page
// renders, reusing the tested reconcileCell logic. No fetch, no React.
import { reconcileCell, RECON_STATUS_COLOR } from './reconcile';
import { deliveryMonthOf } from './po';

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
function effectiveFc(rounds) {
  const ever = new Set();   // (fg,month) ever forecast with qty>0 (history)
  const names = new Map();
  const ownerRoundNo = new Map();   // month -> latest roundNo that covers it
  const roundQty = new Map();       // "roundNo||fg||month" -> summed qty

  const claim = (month, rn) => {
    const cur = ownerRoundNo.get(month);
    if (cur === undefined || rn > cur) ownerRoundNo.set(month, rn);
  };

  for (const r of rounds || []) {
    const rn = r.roundNo || 0;
    for (const m of Array.isArray(r.coverMonths) ? r.coverMonths : []) claim(m, rn);
    for (const l of r.lines || []) {
      const q = Number(l.qty || 0);
      if (l.productName && !names.get(l.fgCode)) names.set(l.fgCode, l.productName);
      else if (!names.has(l.fgCode)) names.set(l.fgCode, null);
      if (q > 0) ever.add(`${l.fgCode}||${l.month}`);
      const k = `${rn}||${l.fgCode}||${l.month}`;
      roundQty.set(k, (roundQty.get(k) || 0) + q);
      claim(l.month, rn); // fallback when coverMonths is absent
    }
  }

  const fcQtyOf = (fg, month) => {
    const rn = ownerRoundNo.get(month);
    if (rn === undefined) return 0;
    return roundQty.get(`${rn}||${fg}||${month}`) || 0;
  };

  return { fcQtyOf, ever, names, ownerRoundNo };
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
      agg.set(key, (agg.get(key) || 0) + Number(l.qty || 0));
      if (l.productName && !names.get(l.fgCode)) names.set(l.fgCode, l.productName);
      else if (!names.has(l.fgCode)) names.set(l.fgCode, null);
    }
  }
  return agg;
}

// Returns { months:[...], rows:[{ fgCode, productName, fcTotal, poTotal,
//   cells:{ month: { status, label, fcQty, poQty, excess } } }] }.
export function buildReconMatrix(rounds, pos, coverages = []) {
  const { fcQtyOf, ever, names, ownerRoundNo } = effectiveFc(rounds);
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

  // months = every owned (forecast) month + every PO delivery month + coverage months.
  const months = new Set([...ownerRoundNo.keys(), ...extraMonths]);
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
        poLines.push({ poNumber: po.poNumber, qty: Number(l.qty || 0), dueDate: l.dueDate, expectedDate: l.expectedDate, actualDeliveredDate: l.actualDeliveredDate, status: l.status });
      }
    }
  }
  return { fcs, poLines };
}
