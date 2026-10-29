// ── เอกสารทั้งหมดของใบสั่งขายหนึ่งใบ — แท็บ "เอกสาร" (มติเจ้าของ 25/09/2569) ─────────────
//
// ⭐ ไฟล์ของใบสั่งขายวันนี้อยู่สี่บ้าน และไม่มีจอไหนเห็นครบ:
//   แนบเพิ่ม     — แถว `attachments` entity `sales_order` (ของที่ลูกค้าส่งมาหลังออกใบ)
//   ยืนยันคำสั่งซื้อ — `sales_orders.confirmAttachments` (ใบเก่าก่อน 0285: `quotations.wonAttachments`)
//   การชำระ      — `sales_order_installments.evidence[]` + `taxInvoiceFile`
//   สัญญา        — แถว `attachments` ของสัญญาที่ผูกใบ (`serviceContractId`)
// ⇒ รวมเป็นกลุ่มตามบ้าน **ไม่ย้ายข้อมูล** (มติ: ไฟล์ยืนยันคงที่เดิม ตรึงตอนอนุมัติ)
//
// ⚠️ รับข้อมูลดิบที่ route อ่านมาแล้ว ไม่แตะ DB เอง — ทดสอบได้จริง และ route เป็นคนตัดสินว่า
//   คนดูเห็นอะไรได้บ้าง (เช่น ไฟล์สัญญาต้องผ่านด่านสิทธิ์ของสัญญาเองก่อนส่งมา)
// ⚠️ ลิงก์ทุกแถวชี้ **proxy ของบ้านนั้น** ไม่ใช่ fileUrl ดิบ — proxy คือที่ตรวจสิทธิ์และตรวจ path
import { ATTACHMENT_TYPES } from '@/lib/master/attachmentTypes';
import { isGoogleDoc } from '@/lib/master/googleDocView';
import { CONFIRM_DOC_TYPE_LABELS, orderConfirmationOf } from '@/lib/sales/orderConfirmationDocs';
import { INSTALLMENT_STATUS_LABELS, installmentDisplayStatus } from '@/lib/sales/salesOrderPayments';

/* ลำดับกลุ่ม = ลำดับบนจอ · "แนบเพิ่ม" ขึ้นก่อนเพราะเป็นกลุ่มเดียวที่ยังขยับได้ (แนบ/ลบ) ·
   ที่เหลือเป็นของที่ตรึงแล้วหรือจัดการที่แท็บอื่น (`manageTab`) */
export const SALES_ORDER_DOC_GROUPS = Object.freeze([
  { key: 'extra', label: 'แนบเพิ่มหลังออกใบ', note: 'เอกสารที่ลูกค้าส่งมาทีหลัง — แนบได้ทุกสถานะ ยกเว้นใบที่ยกเลิก' },
  { key: 'confirmation', label: 'ยืนยันคำสั่งซื้อ', note: 'ชุดที่ใช้ยื่นอนุมัติ — หลังยื่นเพิ่มไฟล์ไม่ได้ (ของใหม่แนบที่กลุ่มแรก) ลบไฟล์ที่แนบผิดได้' },
  { key: 'payment', label: 'หลักฐานการชำระ', note: 'หลักฐานรายงวดและใบกำกับภาษี', manageTab: 'payment' },
  { key: 'contract', label: 'สัญญา', note: 'ไฟล์ของสัญญาที่ผูกกับใบนี้', manageTab: 'contract' },
]);

const typeLabel = (entityType, key) => (ATTACHMENT_TYPES[entityType] || []).find((t) => t.key === key)?.label || null;
const join = (...parts) => parts.filter(Boolean).join(' · ') || null;
const enc = encodeURIComponent;

function attachmentRow(att, entityType, extraNote = null) {
  return {
    id: `att:${att.id}`,
    title: att.fileName || typeLabel(entityType, att.docType) || 'ไฟล์แนบ',
    note: join(typeLabel(entityType, att.docType), extraNote, att.uploadedByName ? `โดย ${att.uploadedByName}` : null),
    // เอกสาร Google เปิดที่ Google ตรง (proxy สตรีมได้แต่ไฟล์ไบนารี) · ที่เหลือผ่าน proxy กลางของไฟล์แนบ
    href: isGoogleDoc(att) ? (att.fileUrl || null) : `/api/master/attachments/${enc(att.id)}/file`,
    at: att.createdAt || null,
  };
}

/* ไฟล์ยืนยัน — ลิงก์ตามบ้านที่ไฟล์อยู่จริง (ตัวเดียวกับ `confirmFileHref` บนหน้าใบ)
   ⚠️ ใบเก่าก่อน 0285 ไฟล์อยู่ที่ใบเสนอราคาต้นทาง ⇒ proxy ของใบเสนอราคา ไม่ใช่ confirm-file (ตอบ 404)
   ⭐ `removeRef` = ตัวชี้ที่ action `remove_confirm_file` ใช้หาไฟล์ (มติ 29/10) — มีเฉพาะไฟล์ของ **ใบนี้เอง** ที่อยู่ใน bucket
     (ไฟล์ที่ยังอยู่ที่ใบเสนอราคาไม่ใช่ของใบนี้ให้ลบ) · `index` คู่กันใช้เมื่อ path ซ้ำในชุด */
function confirmationRows(order, quotation) {
  const conf = orderConfirmationOf(order, quotation);
  if (!conf) return [];
  const fromOrder = conf.source === 'order' || !order?.quotationId;
  const note = join(CONFIRM_DOC_TYPE_LABELS[conf.docType] || null, conf.docNo ? `เลขที่ ${conf.docNo}` : null,
    conf.source === 'quotation' ? `อยู่ที่ใบเสนอราคา ${quotation?.quoteNumber || ''}`.trim() : null);
  const ownFiles = conf.source === 'order';
  return (conf.attachments || []).map((att, i) => ({
    id: `confirm:${i}`,
    title: att?.fileName || `ไฟล์ยืนยัน ${i + 1}`,
    note,
    href: fromOrder
      ? `/api/sales-planning/sales-orders/${enc(order.id)}/confirm-file?i=${i}`
      : `/api/sales-planning/quotations/${enc(order.quotationId)}/file?i=${i}`,
    at: conf.docDate || att?.uploadedAt || null,
    index: i,
    removeRef: ownFiles && att?.storagePath ? att.storagePath : null,
  }));
}

function paymentRows(order, installments) {
  const rows = [];
  const sorted = [...(installments || [])].sort((a, b) => (Number(a?.seq) || 0) - (Number(b?.seq) || 0));
  for (const inst of sorted) {
    const name = inst.label || `งวดที่ ${inst.seq}`;
    const base = `/api/sales-planning/sales-orders/${enc(order.id)}/payment-file?installment=${enc(inst.id)}`;
    (Array.isArray(inst.evidence) ? inst.evidence : []).forEach((att, i) => {
      rows.push({
        id: `pay:${inst.id}:${i}`,
        // seq · kind = ที่ตั้งชื่อไฟล์ในชุดเอกสาร (salesOrderBundle.js) — แท็บเอกสารไม่ได้อ่าน
        seq: inst.seq ?? null,
        kind: 'evidence',
        title: att?.fileName || `หลักฐาน ${i + 1}`,
        note: join(name, 'หลักฐานการชำระ'),
        href: `${base}&i=${i}`,
        at: att?.uploadedAt || null,
      });
    });
    // ⚠️ ไฟล์ใบกำกับที่ไม่มี storagePath = proxy ตอบ 404 (แผงงวดเช็กแบบเดียวกัน)
    if (inst.taxInvoiceFile?.storagePath) {
      rows.push({
        id: `tax:${inst.id}`,
        seq: inst.seq ?? null,
        kind: 'tax_invoice',
        taxInvoiceNo: inst.taxInvoiceNo || null,
        title: inst.taxInvoiceFile.fileName || 'ไฟล์ใบกำกับภาษี',
        note: join(name, inst.taxInvoiceNo ? `ใบกำกับภาษี ${inst.taxInvoiceNo}` : 'ใบกำกับภาษี'),
        href: `${base}&doc=tax_invoice`,
        at: inst.taxInvoiceDate || null,
      });
    }
  }
  return rows;
}

/* สรุปงวดของใบ (ไม่มีไบต์ ไม่มีลิงก์) — ชุดเอกสาร SO บอก "งวดไหนยังไม่มีสลิป/ใบกำกับ เพราะอะไร" ได้
   (🐞 27/10 เจ้าของ: "ไฟล์หลักฐานการชำระแต่ละงวดไม่มีหรอ" — งวดที่ยังไม่จ่ายไม่มีไฟล์ แต่ ZIP ไม่บอกอะไรเลย) */
function installmentSummary(installments) {
  return [...(installments || [])]
    .sort((a, b) => (Number(a?.seq) || 0) - (Number(b?.seq) || 0))
    .map((inst) => {
      const status = installmentDisplayStatus(inst);
      return {
        id: inst.id,
        seq: inst.seq ?? null,
        status,
        statusLabel: INSTALLMENT_STATUS_LABELS[status] || status || null,
        evidenceCount: Array.isArray(inst.evidence) ? inst.evidence.length : 0,
        taxInvoiceFile: Boolean(inst.taxInvoiceFile?.storagePath),
        taxInvoiceNo: inst.taxInvoiceNo || null,
      };
    });
}

/**
 * รวมเอกสารทุกบ้านของใบเป็นกลุ่ม — คืน `{ groups, total, installments }`
 * กลุ่มว่างยังอยู่ในผลลัพธ์ (จอเลือกเองว่าจะซ่อน) · `total` นับทุกไฟล์ = ตัวเลขบนหัวแท็บ
 */
export function buildSalesOrderDocuments({
  order, quotation = null, installments = [], extra = [], contract = null, contractFiles = [],
} = {}) {
  if (!order) return { groups: [], total: 0, installments: [] };
  const rowsByKey = {
    extra: (extra || []).map((att) => attachmentRow(att, 'sales_order')),
    confirmation: confirmationRows(order, quotation),
    payment: paymentRows(order, installments),
    contract: contract
      ? (contractFiles || []).map((att) => attachmentRow(att, 'contract', contract.contractNo || null))
      : [],
  };
  const groups = SALES_ORDER_DOC_GROUPS.map((g) => ({ ...g, rows: rowsByKey[g.key] }));
  return { groups, total: groups.reduce((sum, g) => sum + g.rows.length, 0), installments: installmentSummary(installments) };
}

/**
 * ลายนิ้วมือของไฟล์ฝั่งงวด — ส่วนหนึ่งของคีย์โหลดแท็บ "เอกสาร" บนหน้าใบ
 * ⚠️ แจ้งชำระ/แนบใบกำกับ/ถอนใบกำกับ **ไม่ขยับ `updatedAt` ของใบ** (หน้าแค่ผสานงวดใหม่เข้า state) ⇒ ไม่มีตัวนี้
 *   ตัวเลขบนหัวแท็บค้าง และแถวใบกำกับที่ถอนไปแล้วยังเป็นลิงก์ที่เปิดแล้วเจอ 404
 */
export function installmentFilesKey(installments) {
  return (installments || [])
    .map((row) => `${row?.id}:${Array.isArray(row?.evidence) ? row.evidence.length : 0}:${row?.taxInvoiceFile?.storagePath || ''}`)
    .join(',');
}
