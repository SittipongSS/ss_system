import { documentApprovalFingerprint } from '@/lib/documentApproval';

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function quotationApprovalContent(quote = {}, lines = quote.lines || []) {
  const normalizedLines = [...lines]
    .sort((a, b) => {
      const order = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
      return order || String(a.id || '').localeCompare(String(b.id || ''));
    })
    .map((line) => ({
      productId: line.productId || null,
      fgCode: line.fgCode || null,
      description: String(line.description || '').trim(),
      qty: money(line.qty),
      unitPrice: money(line.unitPrice),
      discountType: line.discountType || null,
      discountValue: money(line.discountValue),
      discountAmount: money(line.discountAmount),
      lineTotal: money(line.lineTotal),
    }));
  return {
    lines: normalizedLines,
    quoteDate: quote.quoteDate || null,
    validUntil: quote.validUntil || null,
    subtotal: money(quote.subtotal),
    discountType: quote.discountType || null,
    discountValue: money(quote.discountValue),
    discountAmount: money(quote.discountAmount),
    vatRate: money(quote.vatRate),
    vatAmount: money(quote.vatAmount),
    totalAmount: money(quote.totalAmount),
    paymentPlan: quote.paymentPlan || { type: 'full' },
    paymentTerms: String(quote.paymentTerms || '').trim(),
    notes: String(quote.notes || '').trim(),
  };
}

export function quotationApprovalFingerprint(quote, lines = quote?.lines || []) {
  return documentApprovalFingerprint(quotationApprovalContent(quote, lines));
}
