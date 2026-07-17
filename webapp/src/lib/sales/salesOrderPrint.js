import { DOCUMENT_FORMS } from '@/lib/documentBrand';
import { buildQuotePrintHTML, prepareQuotePrintWindow, showQuotePrintError } from '@/lib/sales/quotePrint';

const STATUS_LABELS = {
  draft: 'ฉบับร่าง',
  pending_approval: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ตีกลับให้แก้ไข',
  cancelled: 'ยกเลิก',
};

export function prepareSalesOrderPrintWindow() {
  return prepareQuotePrintWindow('ใบสั่งขาย');
}

export function showSalesOrderPrintError(printWindow, message = 'ไม่สามารถโหลดข้อมูลใบสั่งขายได้') {
  return showQuotePrintError(printWindow, message, 'ใบสั่งขาย');
}

export function buildSalesOrderPrintHTML(order) {
  const quotation = order.quotation || {};
  const taxableAmount = Math.max(0, Number(order.totalAmount || 0) - Number(order.vatAmount || 0));
  const vatRate = taxableAmount > 0 ? (Number(order.vatAmount || 0) / taxableAmount) * 100 : 0;
  const statusLabel = STATUS_LABELS[order.status] || order.status || '-';
  const notes = [order.notes, order.approvalNote ? `หมายเหตุการอนุมัติ: ${order.approvalNote}` : null]
    .filter(Boolean)
    .join('\n');
  const printable = {
    quoteNumber: order.orderNumber,
    quoteDate: order.orderDate,
    customerName: order.customerName,
    billingAddress: quotation.billingAddress,
    shippingAddress: quotation.shippingAddress,
    branchCode: quotation.branchCode,
    contactName: quotation.contactName,
    contactPhone: quotation.contactPhone,
    lines: order.lines || [],
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    vatAmount: order.vatAmount,
    vatRate,
    totalAmount: order.totalAmount,
    paymentPlan: quotation.paymentPlan,
    paymentTerms: quotation.paymentTerms,
    notes,
    deal: order.deal,
    project: order.project,
    metadata: { aeOwner: order.deal?.ownerName || '' },
  };

  return buildQuotePrintHTML(printable, {
    form: DOCUMENT_FORMS.salesOrder,
    documentLabel: 'ใบสั่งขาย',
    documentNumber: order.orderNumber,
    documentDate: order.orderDate,
    documentDateLabel: 'วันที่ SO',
    secondaryDateLabel: 'กำหนดชำระ',
    secondaryDateValue: order.paymentDueDate,
    referenceLabel: 'อ้างอิง QT',
    referenceValue: quotation.quoteNumber,
    statusLabel,
    watermark: order.status === 'approved' ? '' : `เอกสาร${statusLabel}`,
    paginatedPreview: true,
    // ช่องลงชื่อ SO (มติผู้ใช้ 2026-07-18): ผู้จัดทำ = AE (พนักงานขาย) ·
    // ผู้อนุมัติ = AE Supervisor (ผู้จัดการฝ่ายขาย) · ฝ่ายบัญชี (เว้นให้เซ็นรับเอกสาร).
    // name = ชื่อผู้ทำจริง (createdByName/approvedByName); role = ตำแหน่งบนแบบฟอร์ม.
    signers: [
      { label: 'ผู้จัดทำ', role: 'พนักงานขาย', name: order.createdByName || '' },
      { label: 'ผู้อนุมัติ', role: 'ผู้จัดการฝ่ายขาย', name: order.approvedByName || '' },
      { label: 'ฝ่ายบัญชี', role: 'Scent & Sense', name: '' },
    ],
  });
}

export function openSalesOrderPrintWindow(order, preparedWindow = null) {
  const win = preparedWindow || prepareSalesOrderPrintWindow();
  if (!win) return;
  win.document.open();
  win.document.write(buildSalesOrderPrintHTML(order));
  win.document.close();
  return win;
}
