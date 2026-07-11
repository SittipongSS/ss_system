// SAHAMIT — report derivations (pure). Value = qty × unit price, where the
// price is supplied by the caller on each product (ss-team = ราคาโรงงาน / costPrice
// จาก products master, mapped to `price` in loadSahamitProducts — no re-entry).
// Reuses the tested reconcile matrix for status/qty and po helpers for split.
import { buildReconMatrix } from './reconcileClient';
import { deliveryMonthOf } from './po';

// Build the value/status report from rounds, pos, coverages + a priced product
// list. Returns totals, per-status counts, per-SKU value rows, and the PO lines
// that can still be split-delivered ("แบ่งส่ง").
//   → { fcValue, poValue, coveragePct, alertCount, unpricedCount,
//       statusCounts:{status:n}, perSku:[...], splittable:[...] }
export function buildReport(rounds, pos, coverages, products) {
  const priceByFg = new Map();
  const nameByFg = new Map();
  for (const p of products || []) {
    if (p.fgCode) {
      priceByFg.set(String(p.fgCode).trim().toLowerCase(), p.price == null ? null : Number(p.price));
      nameByFg.set(String(p.fgCode).trim().toLowerCase(), p.name || null);
    }
  }
  const priceOf = (fg) => priceByFg.get(String(fg).trim().toLowerCase()) ?? null;

  const matrix = buildReconMatrix(rounds, pos, coverages);

  const statusCounts = {};
  let fcValue = 0, poValue = 0, unpricedCount = 0;
  const perSku = matrix.rows.map((r) => {
    for (const m of matrix.months) {
      const st = r.cells[m]?.status;
      if (st && st !== 'none') statusCounts[st] = (statusCounts[st] || 0) + 1;
    }
    const price = priceOf(r.fgCode);
    if (price == null && (r.fcTotal > 0 || r.poTotal > 0)) unpricedCount += 1;
    const skuFcValue = price == null ? 0 : r.fcTotal * price;
    const skuPoValue = price == null ? 0 : r.poTotal * price;
    fcValue += skuFcValue;
    poValue += skuPoValue;
    return {
      fgCode: r.fgCode,
      productName: r.productName || nameByFg.get(String(r.fgCode).trim().toLowerCase()) || null,
      fcQty: r.fcTotal, poQty: r.poTotal,
      price, fcValue: skuFcValue, poValue: skuPoValue,
    };
  });

  const alertCount = (statusCounts.pending || 0) + (statusCounts.discrepancy || 0) + (statusCounts.unforecasted || 0);
  // % ครอบคลุม — มาตรฐานระบบ: ละเอียดทศนิยม 2 ตำแหน่ง (แสดงผลผ่าน fmtPct)
  const coveragePct = fcValue > 0 ? Math.round((poValue / fcValue) * 10000) / 100 : (poValue > 0 ? 100 : 0);

  // Split-delivery opportunities: active lines not yet fully delivered — can be
  // split into a balance line ("แบ่งส่ง") or still awaiting delivery.
  const splittable = [];
  for (const po of pos || []) {
    for (const l of po.lines || []) {
      if (l.status === 'cancelled' || l.status === 'delivered') continue;
      if (l.actualDeliveredDate) continue;
      splittable.push({
        poId: po.id, poNumber: po.poNumber, lineId: l.id,
        fgCode: l.fgCode, productName: l.productName || null,
        qty: Number(l.qty || 0), status: l.status,
        deliveryMonth: l.deliveryMonth || deliveryMonthOf(l),
        dueDate: l.dueDate || null, expectedDate: l.expectedDate || null,
        destination: l.destination || null,
        isBalance: !!l.splitFromPoLineId,
      });
    }
  }
  splittable.sort((a, b) => String(a.deliveryMonth || '').localeCompare(String(b.deliveryMonth || '')) || String(a.poNumber).localeCompare(String(b.poNumber)));

  return { fcValue, poValue, coveragePct, alertCount, unpricedCount, statusCounts, perSku, splittable };
}
