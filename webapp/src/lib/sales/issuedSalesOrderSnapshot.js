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
import { fillCustomerSnapshotFromMaster } from '@/lib/sales/customerSnapshotFallback';
import {
  loadSignatureImageDataUri,
  loadActiveSignatureAsset,
} from '@/lib/sales/issuedQuotationSnapshot';

// bump เมื่อ payload/artifact เปลี่ยนโครง เพื่อให้ระบุ generator ที่สร้าง snapshot เดิมได้
// v4.2 = ช่องผู้จัดทำเป็น evidence-backed (วันที่ลงนาม + Evidence id ฝังในใบตรึง, mig 0153)
export const ISSUED_SALES_ORDER_LAYOUT_VERSION = 'so-master-v4.2';
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
      /* ภาษาที่ใบนี้ถูกออกจริง (mig 0295) — **ต้องอยู่ในลายนิ้วมือ** ไม่งั้นเปลี่ยนภาษา
         แล้ว RPC มองว่าเนื้อหาเหมือนเดิม คืนฉบับเดิมกลับมา (reused) แล้วไฟล์ที่ตรึงไว้
         ยังเป็นภาษาเก่าค้างอยู่ · คีย์ใหม่กระทบ contentFingerprint ของฉบับที่จะตรึง
         ต่อจากนี้เท่านั้น ของเก่าเก็บค่าไว้ในตารางแล้ว ไม่เคยคำนวณซ้ำ */
      docLanguage: order.docLanguage === 'en' ? 'en' : 'th',
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
      /* ⭐ ผู้ตรวจฝั่งบัญชี (mig 0251) — อยู่ใน payload **โดยตั้งใจ** เพราะมันคือส่วนหนึ่ง
         ของเนื้อหาเอกสาร (ช่องลงชื่อที่สาม) · ผลข้างเคียงที่ต้องการ: fingerprint เปลี่ยน
         ตอนบัญชีเซ็น ⇒ RPC ออกฉบับใหม่ (issueSequence ถัดไป) แทนที่จะคืนฉบับเดิม
         ตามมติผู้ใช้ "ออกเอกสารใหม่ทับตอนบัญชีเซ็น"
         ⚠️ ใบเก่าที่ออกก่อนมีขั้นนี้ได้ null ทั้งคู่ ⇒ fingerprint ไม่ขยับ ไม่มีใบไหน
         ถูกออกซ้ำโดยไม่ได้ตั้งใจ */
      financeApprovedByName: trimOrNull(order.financeApprovedByName),
      financeApprovedAt: order.financeApprovedAt || null,
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
    // ช่องลงชื่อที่สาม "ฝ่ายบัญชี" (mig 0251) — ว่างจนกว่าบัญชีจะตรวจใบผ่าน
    financeSignature: options.financeSignatureImage
      ? {
        imageDataUri: options.financeSignatureImage,
        signerName: order.financeApprovedByName || '',
        signedAt: order.financeApprovedAt || null,
        evidenceId: order.financeSignatureEvidenceId || '',
      }
      : null,
    // มีหลักฐานการยื่น (mig 0153) → ฝังวันที่ลงนาม + Evidence id ลงในใบตรึงด้วย
    proposerSignature: options.proposerSignatureImage
      ? {
        imageDataUri: options.proposerSignatureImage,
        signerName: options.proposerEvidence?.signerName || order.createdByName || '',
        signedAt: options.proposerEvidence?.signedAt || null,
        evidenceId: options.proposerEvidence?.id || '',
      }
      : null,
  }, options.company || null, options.standard || null);
}

export function issuedContentFingerprint(payload) {
  return documentApprovalFingerprint(payload);
}

export function artifactSha256(html) {
  return `sha256:${createHash('sha256').update(String(html ?? ''), 'utf8').digest('hex')}`;
}

// ตรึง snapshot + artifact ผ่าน RPC atomic idempotent. เนื้อหาเดิมคืนของเดิม ไม่ซ้ำ.
export async function captureIssuedSalesOrderSnapshot(supabase, { order: rawOrder, evidence, user, company }) {
  // ข้อมูลลูกค้าบนใบสั่งขายอ่านจาก snapshot ของใบเสนอราคาที่ผูก — ช่องที่ว่าง (ผู้ติดต่อ/
  // เลขผู้เสียภาษี) เคยถูกเติมจากทะเบียนลูกค้าเฉพาะตอนอ่านหน้ารายละเอียด (GET) ทำให้
  // **ฉบับตรึงแสดง '-' ทั้งที่หน้าเว็บแสดงครบ**. เติมที่ชั้น capture เหมือนฝั่ง QT
  const order = rawOrder?.quotation
    ? { ...rawOrder, quotation: await fillCustomerSnapshotFromMaster(supabase, rawOrder.quotation) }
    : rawOrder;
  const payload = buildIssuedSalesOrderPayload(order, company);
  // ผู้อนุมัติ = รูปจาก evidence ที่ตรึงตอนอนุมัติ
  // ผู้จัดทำ = รูปจาก evidence ที่ตรึงตอน "ยื่น" (mig 0153) ถ้ามี — ตรึงเวอร์ชันลายเซ็นจริง
  //           ทำให้ reprint คงรูปเดิมแม้เจ้าตัวเปลี่ยนลายเซ็นภายหลัง; ใบเก่าที่ยื่นก่อนมี
  //           หลักฐานผู้จัดทำ fallback เป็นลายเซ็น active เดิม (stamp เชิงภาพ ไม่มีวันที่)
  let proposerAsset = null;
  let proposerEvidence = null;
  if (order.proposerSignatureEvidenceId) {
    const { data: ev } = await supabase
      .from('document_signature_evidence')
      .select('id, signerName, signedAt, signatureAssetSnapshot')
      .eq('id', order.proposerSignatureEvidenceId)
      .maybeSingle();
    if (ev?.signatureAssetSnapshot) {
      proposerAsset = ev.signatureAssetSnapshot;
      proposerEvidence = ev;
    }
  }
  if (!proposerAsset) proposerAsset = await loadActiveSignatureAsset(supabase, order.createdBy);
  /* ฝ่ายบัญชี = รูปจาก evidence ที่ตรึงตอนบัญชีตรวจใบผ่าน (mig 0251)
     ⚠️ อ่านจาก evidence เท่านั้น ไม่ fallback ไปลายเซ็น active — ช่องนี้เป็นการรับรอง
     ต้องมีหลักฐานคู่เสมอ ต่างจากช่องผู้จัดทำที่ใบเก่ายอมให้ stamp เชิงภาพได้ */
  let financeAsset = null;
  if (order.financeSignatureEvidenceId) {
    const { data: fev } = await supabase
      .from('document_signature_evidence')
      .select('signatureAssetSnapshot')
      .eq('id', order.financeSignatureEvidenceId)
      .maybeSingle();
    financeAsset = fev?.signatureAssetSnapshot || null;
  }
  const [approverSignatureImage, proposerSignatureImage, financeSignatureImage] = await Promise.all([
    loadSignatureImageDataUri(supabase, evidence?.signatureAssetSnapshot),
    loadSignatureImageDataUri(supabase, proposerAsset),
    loadSignatureImageDataUri(supabase, financeAsset),
  ]);
  // มาตรฐานเอกสารที่ควบคุมใบนี้ = ค่าที่ RPC ตรึงไว้ใน evidence ตอนอนุมัติ (mig 0125)
  // ไม่ใช่ค่าที่เผยแพร่อยู่ตอนนี้ — ใบที่ออกไปแล้วต้องคงรหัสแบบฟอร์มเดิมเสมอ (ADR 0011)
  const standard = evidence?.controlledFormSnapshot || null;
  const html = buildIssuedSalesOrderArtifactHtml(order, {
    company, standard, approverSignatureImage, proposerSignatureImage, proposerEvidence,
    financeSignatureImage,
  });
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
    // ทะเบียนเอกสารที่ออกจริงต้องบอกภาษาให้ตรง ไม่งั้นใบอังกฤษถูกบันทึกว่าเป็นใบไทย
    p_locale: order.docLanguage === 'en' ? 'en-US' : ISSUED_SALES_ORDER_LOCALE,
    p_actor_id: user?.id || order.approvedBy || null,
    p_actor_name: user?.name || order.approvedByName || null,
  });
  if (error) throw error;
  return data;
}
