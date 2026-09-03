// พิมพ์ใบสั่งขาย FM-SA-03 — Phase 7D: ใช้เครื่องยนต์เอกสาร Quotation Master V4
// (quotationMasterDocument) ตัวเดียวกับใบเสนอราคา ผ่าน options เฉพาะ SO
// (ฟอร์ม/เลข/ป้ายวันที่/แถวอ้างอิง/ผู้ลงนาม) — หน้าตาเดียวกัน ไม่มี CSS ซ้ำ.
import { fmtDate } from '@/lib/format';
import { buildQuotationMasterHTML, buildQuotationMasterSwitchableHTML } from '@/lib/sales/quotationMasterDocument';
import { docLanguageOf, quotationDocLabels } from '@/lib/sales/quotationMasterTemplate';
import { canSwitchSalesOrderDocLanguage } from '@/lib/sales/salesOrderWorkflow';
import { dealTypeOf } from '@/lib/salesPlanning';
import { prepareQuotePrintWindow, showQuotePrintError } from '@/lib/sales/quotePrint';
import { apiFetch } from "@/lib/apiFetch";
import {
  getDocumentStandardsForPrint,
  resolveDocumentAccentKey,
  resolveDocumentForm,
  resolveDocumentTitleTh,
} from '@/lib/documentStandards';

/* 🐞 เดิมเป็นข้อความไทยตายตัว — ใบสั่งขายเลือกภาษาได้แล้ว (#1457) แต่ทุกป้ายที่ไฟล์นี้
   ประกอบเองแล้วส่งผ่าน options ข้าม L.t() ของแม่แบบไป ⇒ ใบอังกฤษพิมพ์ไทย 13 จุด
   ตอนนี้ทุกป้ายอยู่ใน DOC_LABEL_PAIRS ที่เดียวกับใบเสนอราคา */
const STATUS_LABEL_KEYS = {
  draft: 'soStatusDraft',
  pending_approval: 'soStatusPending',
  approved: 'soStatusApproved',
  rejected: 'soStatusRejected',
  cancelled: 'soStatusCancelled',
};

export function prepareSalesOrderPrintWindow() {
  return prepareQuotePrintWindow('ใบสั่งขาย');
}

export function showSalesOrderPrintError(printWindow, message = 'ไม่สามารถโหลดข้อมูลใบสั่งขายได้') {
  return showQuotePrintError(printWindow, message, 'ใบสั่งขาย');
}

// standard = เวอร์ชันมาตรฐานเอกสารที่เผยแพร่ (ชนิด salesOrder) — ฝั่ง client ดึงสดจาก API,
// ฝั่ง server ตอนตรึง snapshot ส่งค่าที่ตรึงไว้ใน evidence มา; ไม่ส่ง = ใช้ค่าสำรอง
export function buildSalesOrderPrintHTML(order, company = null, standard = null, options = {}) {
  const quotation = order.quotation || {};
  /* อัตรา VAT ที่พิมพ์บนใบ — **เอาของใบเสนอราคาต้นทางก่อนเสมอ**
     (กติกาเดียวกับ discountType/discountValue ข้างล่างที่ดึงจาก quotation ด้วยเหตุผลเดียวกัน:
     sales_orders ไม่เก็บช่องนี้ แต่ป้ายบนกระดาษต้องตรงกับใบที่ลูกค้าถือคู่กัน)

     🐞 **พบตอนตรวจระบบ 2026-08-16:** เดิมคิดย้อนจากยอดเงินอย่างเดียว
     (`vatAmount ÷ (total − vat)`) ⇒ ใบที่ฐานภาษีเป็น 0 — ใบยอดศูนย์ และใบที่ให้ฟรีด้วย
     ส่วนลดเต็มจำนวน ซึ่งเป็นสถานะที่ระบบรองรับโดยตั้งใจ (มติ 2026-08-03 · #1271) —
     ตัวหารเป็น 0 แล้วตกไปทาง `: 0` ⇒ **พิมพ์ "VAT 0%" ขณะที่ใบเสนอราคาพิมพ์ "VAT 7%"**
     วัดกับข้อมูลจริงตอนพบ: 10 จาก 18 ใบสั่งขายอยู่ในสภาพนี้

     ยอดเงินไม่เคยผิด (ทั้งคู่พิมพ์ VAT 0.00) — ที่ขัดกันคือป้ายอัตรา ซึ่งอยู่บนเอกสารที่
     ส่งถึงลูกค้า · ของฟรีก็ยังเป็น "7% ของ 0 บาท" ไม่ใช่ "0%"

     ⚠️ ยังคงทางคิดย้อนไว้เป็นตัวสำรอง — ใบเก่าที่ไม่ได้ผูกใบเสนอราคา (หรือ quotation
     โหลดมาไม่ครบ) ต้องพิมพ์ได้เหมือนเดิม ไม่ใช่ตกไปเป็น 0% */
  const taxableAmount = Math.max(0, Number(order.totalAmount || 0) - Number(order.vatAmount || 0));
  const quotedVatRate = Number(quotation.vatRate);
  const vatRate = Number.isFinite(quotedVatRate) && quotation.vatRate != null
    ? quotedVatRate
    // คิดย้อนจากยอดเงิน (ปัดเป็นสตางค์แล้ว) — ปัด 2 ตำแหน่งกัน float noise
    : (taxableAmount > 0
      ? Math.round((Number(order.vatAmount || 0) / taxableAmount) * 10000) / 100
      : 0);
  // ป้ายทั้งใบเดินตามภาษาของใบ — ตัวเดียวกับที่แม่แบบใช้ ไม่มีตารางป้ายของตัวเอง
  const L = quotationDocLabels(docLanguageOf(order.docLanguage));
  const statusKey = STATUS_LABEL_KEYS[order.status];
  const statusLabel = statusKey ? L.t(statusKey) : (order.status || '-');
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

  /* ลายเซ็นฝ่ายบัญชี (mig 0251) — ช่องที่สามมีอยู่บนใบตั้งแต่มติ 2026-08-05 แต่ว่าง
     มาตลอดเพราะไม่มีใครเซ็น · ขั้นบัญชีตรวจใบเป็นตัวเติมช่องนี้
     ⚠️ evidence-backed เหมือนช่องผู้อนุมัติ ⇒ มีวันที่ลงนาม + Evidence id ครบ */
  const financeSig = order.financeSignature;
  const financeEsignature = financeSig?.imageDataUri
    ? {
      imageDataUri: financeSig.imageDataUri,
      signerName: financeSig.signerName || order.financeApprovedByName || '',
      signerRole: '',
      signedAt: financeSig.signedAt ? fmtDate(financeSig.signedAt) : '',
      evidenceId: financeSig.evidenceId || '',
    }
    : null;

  // แมป order → รูป quote ที่ model builder V4 รับ (ข้อมูลลูกค้ามาจาก snapshot ในใบเสนอราคาที่ผูก)
  const printable = {
    customerName: order.customerName,
    /* คู่ภาษาอังกฤษของชื่อ/ที่อยู่ลูกค้า (มติผู้ใช้ 2026-09-03) — แม่แบบเลือกภาษาเอง
       แล้วถอยไปไทยเมื่อว่าง · ลำดับที่มาต้องตรงกับ buildIssuedSalesOrderPayload เป๊ะ
       (ใบสั่งขายก่อน ถอยไปใบเสนอราคาที่ผูก) ไม่งั้นพิมพ์สดกับฉบับตรึงพิมพ์คนละภาษา */
    customerNameEn: order.customerNameEn || quotation.customerNameEn,
    customerTaxId: quotation.customerTaxId,
    billingAddress: quotation.billingAddress,
    billingAddressEn: order.billingAddressEn || quotation.billingAddressEn,
    shippingAddress: quotation.shippingAddress,
    shippingAddressEn: order.shippingAddressEn || quotation.shippingAddressEn,
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
    // ภาษาของใบ (mig 0295) — ใบเก่าก่อนคอลัมน์นี้เป็นไทยทั้งหมด
    docLanguage: order.docLanguage === 'en' ? 'en' : 'th',
  };

  /* ⭐ สวิตช์ภาษาบนหน้าพิมพ์ (มติผู้ใช้ 2026-08-27) — ใบสั่งขายใช้เครื่องยนต์เอกสาร
     ตัวเดียวกับใบเสนอราคาอยู่แล้ว แต่เดิม **ไม่เคยส่งภาษาเข้าไปเลย** จึงตกเป็นไทยเสมอ
     ⚠️ `docLanguage` ต้องอยู่บน `printable` ไม่ใช่ options — builder อ่านจากตัวใบ
     ⚠️ ฉบับตรึง (issued snapshot) ไม่เดินทางนี้ มันเสิร์ฟ HTML ที่ตรึงไว้ตรง ๆ */
  const build = options.switchable ? buildQuotationMasterSwitchableHTML : buildQuotationMasterHTML;
  return build(printable, {
    company,
    editable: options.editable === true,
    languageSave: {
      url: `/api/sales-planning/sales-orders/${encodeURIComponent(order.id || '')}`,
      body: { action: 'set-doc-language', language: '__LANG__' },
    },
    // มาตรฐานเอกสารที่เผยแพร่คุมรหัสแบบฟอร์ม/Revision/ชื่อเอกสาร/สี — ไม่มีก็ตกไปใช้
    // ค่าสำรอง (ใบสั่งขาย = Steel Blue ตามมติผู้ใช้ 2026-07-21; ใบเสนอราคา = Terracotta)
    form: resolveDocumentForm(standard, 'salesOrder'),
    documentTitleTh: resolveDocumentTitleTh(standard, 'salesOrder'),
    documentLabel: 'ใบสั่งขาย',
    accentKey: resolveDocumentAccentKey(standard, 'salesOrder'),
    // printable ที่แมปให้เครื่องยนต์ V4 ไม่มี deal ติดไปด้วย จึงส่งชื่อดีลมาตรง ๆ
    // สำหรับประกอบชื่อไฟล์ (รหัสเอกสาร_ชื่อลูกค้า_ชื่อดีล)
    dealTitle: order.deal?.title || '',
    documentNumber: order.orderNumber,
    dateLabel: L.t('soDate'),
    dateValue: order.orderDate ? fmtDate(order.orderDate) : '-',
    secondaryLabel: L.t('soPaymentDue'),
    secondaryValue: order.paymentDueDate ? fmtDate(order.paymentDueDate) : '-',
    // ชุดอ้างอิงต้องตรงกับใบเสนอราคาซึ่งเป็นใบต้นทางของ SO ไม่งั้นลูกค้าได้สองใบที่
    // เรียกของอย่างเดียวกันคนละชื่อ คนละลำดับ (มติผู้ใช้ 2026-08-04, แยกช่อง 08-05)
    // "โครงการ" บนเอกสาร = ดีล · ผู้เสนอราคา = AE เจ้าของดีล (ไม่มีบทบาทผู้จัดทำแล้ว)
    // ดีลไม่มีเจ้าของ → ขีด ไม่ถอยไปใช้ชื่อคนทำใบ เพราะคนละบทบาท
    referenceRows: [
      { label: L.t('refQuotation'), value: quotation.quoteNumber || '-' },
      { label: L.t('documentStatus'), value: statusLabel },
      { label: L.t('projectCode'), value: order.project?.code || '-' },
      { label: L.t('projectTitle'), value: order.deal?.title || '-' },
      { label: L.t('projectType'), value: (order.deal && dealTypeOf(order.deal)) || '-' },
      { label: L.t('proposer'), value: order.deal?.ownerName || '-' },
    ],
    // ช่องลงชื่อ SO — ป้ายช่องเป็น "หน่วยงาน" ไม่ใช่บทบาทในเอกสาร
    // (มติผู้ใช้ 2026-08-05): ฝ่ายขาย / ผู้จัดการฝ่ายขาย / ฝ่ายบัญชี
    // ฝ่ายขาย = AE เจ้าของดีล · AC สร้างใบแทนได้ แต่ต้องให้ AE เจ้าของดีลเป็นคนกดยื่น
    // (บังคับที่ action submit ด้วย canSubmitSalesOrder) ลายเซ็นในช่องนี้จึงเป็นของ
    // เจ้าของดีลเสมอ เพราะการยื่น = การลงนามในช่องนี้ (mig 0153)
    // ⚠️ ถึงอย่างนั้น "เซ็นแล้ว" ก็ยังใช้ชื่อคนที่เซ็นจริงจาก evidence — ใบเก่าที่ยื่นก่อน
    // มีด่านนี้อาจถูกยื่นโดยคนอื่น เอาชื่อเจ้าของดีลไปแปะทับจะได้ชื่อคนหนึ่งคู่ลายมืออีกคน
    signers: [
      proposerEsignature
        ? { label: L.t('salesTeam'), role: L.t('salesTeamRole'), esignature: proposerEsignature }
        : { label: L.t('salesTeam'), role: L.t('salesTeamRole'), name: order.deal?.ownerName || '' },
      approverEsignature
        ? { label: L.t('salesManager'), role: 'AE Supervisor', esignature: approverEsignature }
        : { label: L.t('salesManager'), role: 'AE Supervisor', name: order.approvedByName || '' },
      financeEsignature
        ? { label: L.t('financeTeam'), role: L.t('financeTeamRole'), esignature: financeEsignature }
        : { label: L.t('financeTeam'), role: 'Scent & Sense', name: '' },
    ],
    // ลายน้ำ: อนุมัติแล้วไม่มี · ยกเลิก = "เอกสารยกเลิก" · อื่น ๆ = "ฉบับร่าง" (มติ 2026-07-18)
    watermark: order.status === 'approved' ? ''
      : (order.status === 'cancelled' ? L.t('cancelledDocument') : L.t('draft')),
  });
}

export function openSalesOrderPrintWindow(order, preparedWindow = null, company = null, standard = null) {
  const win = preparedWindow || prepareSalesOrderPrintWindow();
  if (!win) return;
  win.document.open();
  win.document.write(buildSalesOrderPrintHTML(order, company, standard, {
    switchable: true,
    editable: canSwitchSalesOrderDocLanguage(order),
  }));
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
    const res = await apiFetch(`/api/sales-planning/sales-orders/${encodeURIComponent(id)}/issued?render=latest`, {
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
