import { documentApprovalFingerprint } from '@/lib/documentApproval';
import { packQtyValue } from '@/lib/sales/linePacks';

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/* ⭐ เลขแพ็คของบรรทัด (mig 0407) เข้าลายนิ้วมือ **เฉพาะบรรทัดที่มีเลขแพ็ค** — คีย์ต้อง "ไม่มี" ไม่ใช่ "มีแต่เป็น null"
   ⛔ canonical JSON เก็บค่า null ไว้ (lib/documentApproval.js) ⇒ ใส่ `packQty: null` ให้ทุกบรรทัด = ลายนิ้วมือของใบที่อนุมัติแล้ว
     ทุกใบบน production เปลี่ยนพร้อมกัน แล้วทุกใบกลายเป็น "ถูกแก้หลังอนุมัติ" · ยาม: approvalFingerprintGolden.test.mjs
   · เลขแพ็ค 1 ≠ ไม่มีเลขแพ็ค: "1 แพ็ค × 12 เดือน" กับ "12" เป็นเอกสารคนละหน้าตา จึงเป็นลายนิ้วมือคนละค่า */
const packKeyOf = (line) => {
  const pack = packQtyValue(line.packQty);
  return typeof pack === 'number' ? { packQty: pack } : {};
};

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
      ...packKeyOf(line),
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
