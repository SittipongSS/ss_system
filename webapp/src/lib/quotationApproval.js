import { toMoney } from '@/lib/salesPlanning';

export const QUOTE_APPROVAL_AMOUNT_THRESHOLD = 500000;

export function quoteApprovalRequirement(quoteOrTotals = {}, metadata = {}) {
  const totalAmount = toMoney(quoteOrTotals.totalAmount ?? quoteOrTotals.subtotal);
  const forced = metadata?.requiresApproval === true || quoteOrTotals?.metadata?.requiresApproval === true;
  const threshold = toMoney(metadata?.approvalThreshold ?? quoteOrTotals?.metadata?.approvalThreshold, QUOTE_APPROVAL_AMOUNT_THRESHOLD);
  const required = forced || totalAmount >= threshold;
  const reason = required
    ? forced
      ? 'manual approval flag'
      : `total amount >= ${threshold}`
    : null;
  return { required, reason, threshold, totalAmount };
}

export function quoteCanBeAccepted(quote) {
  const status = quote?.approvalStatus || 'not_required';
  return status === 'not_required' || status === 'approved';
}
