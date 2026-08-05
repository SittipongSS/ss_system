// พิมพ์ใบสั่งขาย FM-SA-03 — Phase 7D: ใช้เครื่องยนต์เอกสาร Quotation Master V4
// (quotationMasterDocument) ตัวเดียวกับใบเสนอราคา ผ่าน options เฉพาะ SO
// (ฟอร์ม/เลข/ป้ายวันที่/แถวอ้างอิง/ผู้ลงนาม) — หน้าตาเดียวกัน ไม่มี CSS ซ้ำ.
import { fmtDate } from '@/lib/format';
import { buildQuotationMasterHTML } from '@/lib/sales/quotationMasterDocument';
import { dealTypeOf } from '@/lib/salesPlanning';
import { prepareQuotePrintWindow, showQuotePrintError } from '@/lib/sales/quotePrint';
import {
  getDocumentStandardsForPrint,
  resolveDocumentAccentKey,
  resolveDocumentForm,
  resolveDocumentTitleTh,
} from '@/lib/documentStandards';

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

// standard = เวอร์ชันมาตรฐานเอกสารที่เผยแพร่ (ชนิด salesOrder) — ฝั่ง client ดึงสดจาก API,
// ฝั่ง server ตอนตรึง snapshot ส่งค่าที่ตรึงไว้ใน evidence มา; ไม่ส่ง = ใช้ค่าสำรอง
export function buildSalesOrderPrintHTML(order, company = null, standard = null) {
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

  // ลายเซ็นผู้อนุมัติ: server ฝังรูปมาให้เป็น data URI (order.approverSignature) → stamp
  // รูปจริง; ไม่มี (ยังไม่อนุมัติ/โหลดไม่ได้) → หล่นไปช่องเซ็นเปล่าเดิม. role ปล่อยว่างกัน
  // ซ้ำกับหัวช่อง "ผู้จัดการฝ่ายขาย"; โชว์วันที่ลงนามจาก evidence.
  const sig = order.approverSignature;
  const approverEsignature = sig?.imageDataUri
    ? {
      imageDataUri: sig.imageDataUri,
      signerName: sig.signerName || order.approvedByName || '',
      signerRole: '',
      signedAt: sig.signedAt ? fmtDate(sig.signedAt) : '',
      evidenceId: sig.evidenceId || '',
    }
    : null;

  // ลายเซ็นผู้จัดทำ (พนักงานขาย): stamp เชิงภาพจากลายเซ็น active ของผู้สร้าง — ไม่ใช่
  // evidence-backed จึงไม่มี role/เวลา/Evidence (เหมือนช่องผู้เสนอราคาในใบเสนอราคา).
  // live print โหลดสด (route GET); ฉบับตรึง snapshot ฝังรูปตอนอนุมัติ.
  // ใบที่ยื่นตั้งแต่ mig 0153 มีหลักฐานการลงนามของผู้จัดทำ → โชว์วันที่ + Evidence เหมือน
  // ช่องผู้อนุมัติ; ใบเก่าไม่มี (stamp เชิงภาพ) → signBox จะข้าม 2 บรรทัดนั้นให้เอง
  const proposerSig = order.proposerSignature;
  const proposerEsignature = proposerSig?.imageDataUri
    ? {
      imageDataUri: proposerSig.imageDataUri,
      signerName: proposerSig.signerName || order.createdByName || '',
      signerRole: '',
      signedAt: proposerSig.signedAt ? fmtDate(proposerSig.signedAt) : '',
      evidenceId: proposerSig.evidenceId || '',
    }
    : null;

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
    // ส่วนลดระดับหัวเก็บที่ใบเสนอราคา (sales_orders ไม่มี discountType/Value) — ดึงจาก
    // quotation ที่ผูก เพื่อให้ป้าย "ส่วนลด X%" แสดงถูก; ยอดเงินใช้ order.discountAmount เดิม
    discountType: quotation.discountType,
    discountValue: quotation.discountValue,
    discountAmount: order.discountAmount,
    vatAmount: order.vatAmount,
    vatRate,
    totalAmount: order.totalAmount,
    paymentPlan: quotation.paymentPlan,
    paymentTerms: quotation.paymentTerms,
    notes,
  };

  return buildQuotationMasterHTML(printable, {
    company,
    // มาตรฐานเอกสารที่เผยแพร่คุมรหัสแบบฟอร์ม/Revision/ชื่อเอกสาร/สี — ไม่มีก็ตกไปใช้
    // ค่าสำรอง (ใบสั่งขาย = Steel Blue ตามมติผู้ใช้ 2026-07-21; ใบเสนอราคา = Terracotta)
    form: resolveDocumentForm(standard, 'salesOrder'),
    documentTitleTh: resolveDocumentTitleTh(standard, 'salesOrder'),
    documentLabel: 'ใบสั่งขาย',
    accentKey: resolveDocumentAccentKey(standard, 'salesOrder'),
    documentNumber: order.orderNumber,
    dateLabel: 'วันที่ SO',
    dateValue: order.orderDate ? fmtDate(order.orderDate) : '-',
    secondaryLabel: 'กำหนดชำระ',
    secondaryValue: order.paymentDueDate ? fmtDate(order.paymentDueDate) : '-',
    // ชุดอ้างอิงต้องตรงกับใบเสนอราคาซึ่งเป็นใบต้นทางของ SO ไม่งั้นลูกค้าได้สองใบที่
    // เรียกของอย่างเดียวกันคนละชื่อ คนละลำดับ (มติผู้ใช้ 2026-08-04, แยกช่อง 08-05)
    // "โครงการ" บนเอกสาร = ดีล · ผู้เสนอราคา = AE เจ้าของดีล (ไม่มีบทบาทผู้จัดทำแล้ว)
    // ดีลไม่มีเจ้าของ → ขีด ไม่ถอยไปใช้ชื่อคนทำใบ เพราะคนละบทบาท
    referenceRows: [
      { label: 'อ้างอิง QT', value: quotation.quoteNumber || '-' },
      { label: 'สถานะเอกสาร', value: statusLabel },
      { label: 'เลขที่โครงการ', value: order.project?.code || '-' },
      { label: 'โครงการ', value: order.deal?.title || '-' },
      { label: 'ประเภทโครงการ', value: (order.deal && dealTypeOf(order.deal)) || '-' },
      { label: 'ผู้เสนอราคา', value: order.deal?.ownerName || '-' },
    ],
    // ช่องลงชื่อ SO (มติผู้ใช้ 2026-07-18, ปรับ 2026-08-05):
    // ผู้จัดทำ = AE เจ้าของดีล · ผู้อนุมัติ = ผู้จัดการฝ่ายขาย · ฝ่ายบัญชี
    // ⚠️ ช่องผู้จัดทำยังไม่ได้เซ็น = โชว์ชื่อ AE เจ้าของดีลไว้ให้เซ็น (ไม่ใช่ชื่อคนกดสร้างใบ
    // อย่างที่เป็นมา) แต่ "เซ็นแล้ว" เมื่อไรใช้ชื่อคนที่เซ็นจริงจาก evidence เสมอ — ลายเซ็น
    // ที่ระบบ stamp มาเป็นของผู้สร้างใบ เอาชื่อเจ้าของดีลไปแปะทับจะได้ชื่อคนหนึ่งคู่ลายมือ
    // อีกคน (กติกาเดียวกับช่องผู้จัดทำในใบเสนอราคา)
    signers: [
      proposerEsignature
        ? { label: 'ผู้จัดทำ', role: 'ฝ่ายขาย', esignature: proposerEsignature }
        : { label: 'ผู้จัดทำ', role: 'ฝ่ายขาย', name: order.deal?.ownerName || '' },
      approverEsignature
        ? { label: 'ผู้อนุมัติ', role: 'ผู้จัดการฝ่ายขาย', esignature: approverEsignature }
        : { label: 'ผู้อนุมัติ', role: 'ผู้จัดการฝ่ายขาย', name: order.approvedByName || '' },
      { label: 'ฝ่ายบัญชี', role: 'Scent & Sense', name: '' },
    ],
    // ลายน้ำ: อนุมัติแล้วไม่มี · ยกเลิก = "เอกสารยกเลิก" · อื่น ๆ = "ฉบับร่าง" (มติ 2026-07-18)
    watermark: order.status === 'approved' ? ''
      : (order.status === 'cancelled' ? `เอกสาร${statusLabel}` : 'ฉบับร่าง'),
  });
}

export function openSalesOrderPrintWindow(order, preparedWindow = null, company = null, standard = null) {
  const win = preparedWindow || prepareSalesOrderPrintWindow();
  if (!win) return;
  win.document.open();
  win.document.write(buildSalesOrderPrintHTML(order, company, standard));
  win.document.close();
  return win;
}

// มาตรฐานเอกสารของใบสั่งขายสำหรับการเรนเดอร์สด (มีค่าสำรองในตัว ล้มแล้วยังพิมพ์ได้)
async function liveSalesOrderStandard() {
  const standards = await getDocumentStandardsForPrint();
  return standards?.salesOrder || null;
}

// พิมพ์โดยเลือกฉบับตรึง (issued snapshot) ก่อนถ้ามี — SO ที่อนุมัติแล้วเล่นฉบับที่ตรึงตอน
// อนุมัติ (หน้าตา + รูปลายเซ็นคงที่ ไม่เปลี่ยนตามข้อมูลสด); ยังไม่อนุมัติ/ไม่มี snapshot
// (404) หรือสถานะเปลี่ยนหลังอนุมัติ (409) → เรนเดอร์สดตามปกติ. คู่ขนานกับ QT prefer-issued.
export async function openSalesOrderPrintWindowPreferIssued(order, preparedWindow = null, company = null) {
  const win = preparedWindow || prepareSalesOrderPrintWindow();
  if (!win) return undefined;
  const id = order?.id;
  if (!id) return openSalesOrderPrintWindow(order, win, company, await liveSalesOrderStandard());
  try {
    const res = await fetch(`/api/sales-planning/sales-orders/${encodeURIComponent(id)}/issued?render=latest`, {
      cache: 'no-store',
    });
    if (res.ok) {
      win.document.open();
      win.document.write(await res.text());
      win.document.close();
      return win;
    }
  } catch {
    // โหลดฉบับตรึงไม่ได้ = ไม่บล็อกการพิมพ์ ตกไปใช้ข้อมูลสดแทน (พร้อม company profile สด)
  }
  return openSalesOrderPrintWindow(order, win, company, await liveSalesOrderStandard());
}
