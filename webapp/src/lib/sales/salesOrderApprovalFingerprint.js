import { documentApprovalFingerprint } from '@/lib/documentApproval';

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function salesOrderApprovalContent(order = {}, lines = order.lines || []) {
  const normalizedLines = [...lines]
    .sort((a, b) => {
      const orderValue = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
      return orderValue || String(a.id || '').localeCompare(String(b.id || ''));
    })
    .map((line) => ({
      quotationLineId: line.quotationLineId || null,
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
    orderNumber: order.orderNumber || null,
    quotationId: order.quotationId || null,
    dealId: order.dealId || null,
    projectId: order.projectId || null,
    customerId: order.customerId || null,
    customerName: String(order.customerName || '').trim(),
    orderDate: order.orderDate || null,
    paymentDueDate: order.paymentDueDate || null,
    subtotal: money(order.subtotal),
    discountAmount: money(order.discountAmount),
    vatAmount: money(order.vatAmount),
    totalAmount: money(order.totalAmount),
    actualAmount: money(order.actualAmount),
    notes: String(order.notes || '').trim(),
    lines: normalizedLines,
  };
}

export function salesOrderApprovalFingerprint(order, lines = order?.lines || []) {
  return documentApprovalFingerprint(salesOrderApprovalContent(order, lines));
}
