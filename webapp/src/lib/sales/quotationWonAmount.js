export function quotationWonAmount(quotation) {
  const total = Number(quotation?.totalAmount || 0);
  const vat = Number(quotation?.vatAmount || 0);
  if (!Number.isFinite(total) || !Number.isFinite(vat)) return 0;
  return Math.max(0, Math.round((total - vat) * 100) / 100);
}
