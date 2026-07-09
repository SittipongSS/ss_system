import { toMoney } from '@/lib/salesPlanning';

export const QUOTE_APPROVAL_AMOUNT_THRESHOLD = 500000;

export function quoteApprovalRequirement(quoteOrTotals = {}, metadata = {}) {
  const totalAmount = toMoney(quoteOrTotals.totalAmount ?? quoteOrTotals.subtotal);
  // "บังคับเข้ม" ได้ (requiresApproval:true) แต่ห้าม "ลดเพดาน" ผ่าน client/metadata —
  // เพดานเป็นค่าคงที่ฝั่ง server กัน AE ตั้ง approvalThreshold สูงเพื่อข้ามการอนุมัติ (N2).
  const forced = metadata?.requiresApproval === true || quoteOrTotals?.metadata?.requiresApproval === true;
  const threshold = QUOTE_APPROVAL_AMOUNT_THRESHOLD;
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
