// Phase 7D+ — immutable issued-document snapshot สำหรับใบสั่งขาย (SO) ที่อนุมัติแล้ว.
//
// คู่ขนานกับ issuedQuotationSnapshot.js (QT): ตอน SO อนุมัติ ตรึงเนื้อหา + HTML artifact
// ที่ฝังรูปลายเซ็นผู้อนุมัติ (จาก evidence) และผู้จัดทำ (จาก active signature) ให้ reprint
// เล่นฉบับตรึงเสมอ แม้ลายเซ็น/ข้อมูลเปลี่ยนภายหลัง. SO ไม่มี versioned standard/preset จึง
// ตรึงเบากว่า QT — ใช้ตาราง issued_documents ร่วม (documentType='sales_order', mig 0148).

import 'server-only';
import { createHash } from 'node:crypto';
import { genId } from '@/lib/id';
import { documentApprovalFingerprint } from '@/lib/documentApproval';
import { buildSalesOrderPrintHTML } from '@/lib/sales/salesOrderPrint';
import { resolveCompanyBlock } from '@/lib/companyProfile';
import {
  loadSignatureImageDataUri,
  loadActiveSignatureAsset,
} from '@/lib/sales/issuedQuotationSnapshot';

// bump เมื่อ payload/artifact เปลี่ยนโครง เพื่อให้ระบุ generator ที่สร้าง snapshot เดิมได้
export const ISSUED_SALES_ORDER_LAYOUT_VERSION = 'so-master-v4.1';
export const ISSUED_SALES_ORDER_LOCALE = 'th-TH';

const trimOrNull = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

// payload structured เบื้องหลัง artifact — เปลี่ยนที่นี่ = fingerprint เปลี่ยน = ออกฉบับใหม่
// company = บล็อกบริษัทที่เผยแพร่ ณ เวลาอนุมัติ (ตรึงให้ reprint ตรงเดิม); ไม่ส่ง → fallback
export function buildIssuedSalesOrderPayload(order = {}, company) {
  const lines = Array.isArray(order.lines) ? order.lines : [];
  const q = order.quotation || {};
  const co = resolveCompanyBlock(company);
  return {
    document: {
      orderNumber: trimOrNull(order.orderNumber),
      orderDate: order.orderDate || null,
      paymentDueDate: order.paymentDueDate || null,
    },
    content: {
      lines: lines
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((l) => ({
          fgCode: trimOrNull(l.fgCode),
          description: trimOrNull(l.description),
          qty: Number(l.qty || 0),
          unit: trimOrNull(l.unit),
          unitPrice: Number(l.unitPrice || 0),
          lineTotal: Number(l.lineTotal || 0),
        })),
      subtotal: Number(order.subtotal || 0),
      discountAmount: Number(order.discountAmount || 0),
      vatAmount: Number(order.vatAmount || 0),
      totalAmount: Number(order.totalAmount || 0),
    },
    customer: {
      customerName: trimOrNull(order.customerName),
      customerTaxId: trimOrNull(q.customerTaxId),
      branchCode: trimOrNull(q.branchCode),
      billingAddress: trimOrNull(q.billingAddress),
      shippingAddress: trimOrNull(q.shippingAddress),
      contactName: trimOrNull(q.contactName),
      contactPhone: trimOrNull(q.contactPhone),
    },
    context: {
      quoteNumber: trimOrNull(q.quoteNumber),
      dealTitle: trimOrNull(order.deal?.title),
      projectName: trimOrNull(order.project?.name),
    },
    approval: {
      approvedByName: trimOrNull(order.approvedByName),
      approvedAt: order.approvedAt || null,
      proposer: trimOrNull(order.createdByName),
    },
    // บริษัทที่เผยแพร่ ณ เวลาอนุมัติ — คนละชุด = คนละ issue (เหมือน QT)
    company: {
      legalName: co.legalNameTh,
      address: co.address,
      taxId: co.taxId,
      officeTel: co.phone,
      line: co.line,
      website: co.website,
    },
  };
}

// artifact = HTML ที่ reprint เล่นซ้ำ. buildSalesOrderPrintHTML เป็น pure string builder
// (ไม่แตะ DOM) จึงรันบน server ได้. ฝังรูปลายเซ็นผ่าน order.approverSignature/proposerSignature
// ให้ self-contained (reprint แสดงรูปเดิมเสมอ). status ตรึงเป็น approved (ไม่มีลายน้ำ).
export function buildIssuedSalesOrderArtifactHtml(order = {}, options = {}) {
  return buildSalesOrderPrintHTML({
    ...order,
    status: 'approved',
    approverSignature: options.approverSignatureImage
      ? {
        imageDataUri: options.approverSignatureImage,
        signerName: order.approvedByName || '',
        signedAt: order.approvedAt || null,
        evidenceId: order.signatureEvidenceId || '',
      }
      : null,
    proposerSignature: options.proposerSignatureImage
      ? { imageDataUri: options.proposerSignatureImage, signerName: order.createdByName || '' }
      : null,
  }, options.company || null);
}

export function issuedContentFingerprint(payload) {
  return documentApprovalFingerprint(payload);
}

export function artifactSha256(html) {
  return `sha256:${createHash('sha256').update(String(html ?? ''), 'utf8').digest('hex')}`;
}

// ตรึง snapshot + artifact ผ่าน RPC atomic idempotent. เนื้อหาเดิมคืนของเดิม ไม่ซ้ำ.
export async function captureIssuedSalesOrderSnapshot(supabase, { order, evidence, user, company }) {
  const payload = buildIssuedSalesOrderPayload(order, company);
  // ผู้อนุมัติ = รูปจาก evidence (path ตรึงตอนอนุมัติ); ผู้จัดทำ = รูป active ของผู้สร้าง SO
  const proposerAsset = await loadActiveSignatureAsset(supabase, order.createdBy);
  const [approverSignatureImage, proposerSignatureImage] = await Promise.all([
    loadSignatureImageDataUri(supabase, evidence?.signatureAssetSnapshot),
    loadSignatureImageDataUri(supabase, proposerAsset),
  ]);
  const html = buildIssuedSalesOrderArtifactHtml(order, { company, approverSignatureImage, proposerSignatureImage });
  const { data, error } = await supabase.rpc('capture_issued_sales_order_snapshot_atomic', {
    p_snapshot_id: genId('ISD'),
    p_artifact_id: genId('IDA'),
    p_sales_order_id: order.id,
    p_content_fingerprint: issuedContentFingerprint(payload),
    p_resolved_payload: payload,
    p_artifact_html: html,
    p_artifact_sha256: artifactSha256(html),
    p_signature_evidence_id: evidence.id,
    p_layout_version: ISSUED_SALES_ORDER_LAYOUT_VERSION,
    p_locale: ISSUED_SALES_ORDER_LOCALE,
    p_actor_id: user?.id || order.approvedBy || null,
    p_actor_name: user?.name || order.approvedByName || null,
  });
  if (error) throw error;
  return data;
}
