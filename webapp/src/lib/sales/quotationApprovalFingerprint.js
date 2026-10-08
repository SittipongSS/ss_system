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
      ...packKeyOf(line),
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
