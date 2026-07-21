// พิมพ์ใบสั่งขาย FM-SA-03 — Phase 7D: ใช้เครื่องยนต์เอกสาร Quotation Master V4
// (quotationMasterDocument) ตัวเดียวกับใบเสนอราคา ผ่าน options เฉพาะ SO
// (ฟอร์ม/เลข/ป้ายวันที่/แถวอ้างอิง/ผู้ลงนาม) — หน้าตาเดียวกัน ไม่มี CSS ซ้ำ.
import { fmtDate } from '@/lib/format';
import { DOCUMENT_FORMS } from '@/lib/documentBrand';
import { buildQuotationMasterHTML } from '@/lib/sales/quotationMasterDocument';
import { prepareQuotePrintWindow, showQuotePrintError } from '@/lib/sales/quotePrint';

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
  // อัตรา VAT คิดย้อนจากยอดเงิน (ปัดเป็นสตางค์แล้ว) — ปัด 2 ตำแหน่งกัน float noise
  const vatRate = taxableAmount > 0
    ? Math.round((Number(order.vatAmount || 0) / taxableAmount) * 10000) / 100
    : 0;
  const statusLabel = STATUS_LABELS[order.status] || order.status || '-';
  const notes = [order.notes, order.approvalNote ? `หมายเหตุการอนุมัติ: ${order.approvalNote}` : null]
    .filter(Boolean)
    .join('\n');

  // แมป order → รูป quote ที่ model builder V4 รับ (ข้อมูลลูกค้ามาจาก snapshot ในใบเสนอราคาที่ผูก)
  const printable = {
    customerName: order.customerName,
    customerTaxId: quotation.customerTaxId,
    billingAddress: quotation.billingAddress,
    shippingAddress: quotation.shippingAddress,
    branchCode: quotation.branchCode,
    contactName: quotation.contactName,
    contactPhone: quotation.contactPhone,
    lines: order.lines || [],
    subtotal: order.subtotal,
    discountType: order.discountType,
    discountValue: order.discountValue,
    discountAmount: order.discountAmount,
    vatAmount: order.vatAmount,
    vatRate,
    totalAmount: order.totalAmount,
    paymentPlan: quotation.paymentPlan,
    paymentTerms: quotation.paymentTerms,
    notes,
  };

  return buildQuotationMasterHTML(printable, {
    form: DOCUMENT_FORMS.salesOrder,
    documentTitleTh: 'ใบสั่งขาย',
    documentLabel: 'ใบสั่งขาย',
    documentNumber: order.orderNumber,
    dateLabel: 'วันที่ SO',
    dateValue: order.orderDate ? fmtDate(order.orderDate) : '-',
    secondaryLabel: 'กำหนดชำระ',
    secondaryValue: order.paymentDueDate ? fmtDate(order.paymentDueDate) : '-',
    referenceRows: [
      { label: 'อ้างอิง QT', value: quotation.quoteNumber || '-' },
      { label: 'สถานะเอกสาร', value: statusLabel },
      { label: 'ดีล', value: order.deal?.title || '-' },
      { label: 'โครงการ', value: order.project?.name || '-' },
    ],
    // ช่องลงชื่อ SO (มติผู้ใช้ 2026-07-18): ผู้จัดทำ=AE · ผู้อนุมัติ=AE Supervisor · ฝ่ายบัญชี
    signers: [
      { label: 'ผู้จัดทำ', role: 'พนักงานขาย', name: order.createdByName || '' },
      { label: 'ผู้อนุมัติ', role: 'ผู้จัดการฝ่ายขาย', name: order.approvedByName || '' },
      { label: 'ฝ่ายบัญชี', role: 'Scent & Sense', name: '' },
    ],
    // ลายน้ำ: อนุมัติแล้วไม่มี · ยกเลิก = "เอกสารยกเลิก" · อื่น ๆ = "ฉบับร่าง" (มติ 2026-07-18)
    watermark: order.status === 'approved' ? ''
      : (order.status === 'cancelled' ? `เอกสาร${statusLabel}` : 'ฉบับร่าง'),
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
