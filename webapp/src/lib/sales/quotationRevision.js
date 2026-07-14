import { quoteTotals, toMoney } from '@/lib/salesPlanning';
import { normalizeManualLines } from '@/lib/sales/quoteLines';
import { normalizePaymentPlan, validatePaymentPlan, paymentPlanSummary } from '@/lib/sales/paymentPlan';

export function buildQuotationRevisionContent(quote, body = {}) {
  const lines = 'lines' in body
    ? normalizeManualLines(body.lines || [])
    : normalizeManualLines(quote.lines || []);
  const discountType = 'discountType' in body
    ? (['percent', 'amount'].includes(body.discountType) ? body.discountType : null)
    : quote.discountType;
  const discountValue = discountType
    ? toMoney('discountValue' in body ? body.discountValue : quote.discountValue)
    : 0;
  const vatRate = toMoney('vatRate' in body ? body.vatRate : quote.vatRate, 0);
  const totals = quoteTotals(lines, { discountType, discountValue, vatRate });

  if ('paymentPlan' in body) {
    const paymentValidation = validatePaymentPlan(body.paymentPlan);
    if (!paymentValidation.ok) return paymentValidation;
  }

  const paymentPlan = normalizePaymentPlan(
    'paymentPlan' in body ? body.paymentPlan : quote.paymentPlan,
    totals.totalAmount,
  );
  const paymentTerms = 'paymentTerms' in body
    ? (body.paymentTerms || '').trim() || paymentPlanSummary(paymentPlan, totals.totalAmount)
    : quote.paymentTerms;

  return {
    ok: true,
    lines,
    totals,
    discountType,
    discountValue,
    vatRate,
    paymentPlan,
    paymentTerms,
    validUntil: 'validUntil' in body ? body.validUntil || null : quote.validUntil,
    notes: 'notes' in body ? (body.notes || '').trim() || null : quote.notes,
  };
}
