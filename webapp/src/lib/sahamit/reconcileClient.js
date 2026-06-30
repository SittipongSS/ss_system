// SAHAMIT — reconciliation matrix (pure). Builds the FC × PO grid the recon page
// renders, reusing the tested reconcileCell logic. No fetch, no React.
import { reconcileCell, RECON_STATUS_COLOR } from './reconcile';
import { deliveryMonthOf } from './po';

export { RECON_STATUS_COLOR };

// effective FC per (fgCode, month) = the LATEST round that covers that month
// (lines within that round are summed). This handles rolling forecast windows:
// a month dropped from later rounds keeps its value from the last round that had
// it — until a newer round restates it.
function effectiveFc(rounds) {
  const agg = new Map(); // key "fg||month" -> { roundNo, qty }
  const ever = new Set(); // every (fg,month) ever forecast (for 'cancelled' detection)
  const names = new Map();
  for (const r of rounds || []) {
    const rn = r.roundNo || 0;
    for (const l of r.lines || []) {
      const key = `${l.fgCode}||${l.month}`;
      ever.add(key);
      if (l.productName && !names.get(l.fgCode)) names.set(l.fgCode, l.productName);
      else if (!names.has(l.fgCode)) names.set(l.fgCode, null);
      const cur = agg.get(key);
      if (!cur || rn > cur.roundNo) agg.set(key, { roundNo: rn, qty: Number(l.qty || 0) });
      else if (rn === cur.roundNo) cur.qty += Number(l.qty || 0);
    }
  }
  return { agg, ever, names };
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
export function buildReconMatrix(rounds, pos) {
  const { agg: fcAgg, ever, names } = effectiveFc(rounds);
  const poAgg = poByMonth(pos, names);

  const months = new Set();
  const skus = new Set();
  for (const key of new Set([...fcAgg.keys(), ...poAgg.keys()])) {
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
      const fcQty = fcAgg.get(key)?.qty || 0;
      const poQty = poAgg.get(key) || 0;
      cells[m] = reconcileCell({ fcQty, poQty, originalFcQty: fcQty, hasHistory: ever.has(key) });
      fcTotal += fcQty;
      poTotal += poQty;
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
