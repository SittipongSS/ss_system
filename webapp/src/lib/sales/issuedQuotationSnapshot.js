// Phase 7B — immutable issued-document snapshot for approved quotations.
//
// When a quotation is approved the server captures a snapshot that pins the
// resolved commercial content, the exact versions used (document standard,
// optional commercial preset, signature evidence) and a canonical HTML artifact
// so reprints render identically even after master data changes. Phase 7B keeps
// the artifact as canonical HTML; binary PDF is deferred to Phase 7C.

import { createHash } from 'node:crypto';
import { genId } from '@/lib/id';
import { documentApprovalFingerprint } from '@/lib/documentApproval';
import { quotationApprovalContent } from '@/lib/sales/quotationApprovalFingerprint';
import { buildQuotationMasterHTML } from '@/lib/sales/quotationMasterDocument';
import {
  COMPANY_ADDRESS,
  COMPANY_LEGAL_NAME,
  COMPANY_LINE,
  COMPANY_OFFICE_TEL,
  COMPANY_TAX_ID,
  COMPANY_WEBSITE,
} from '@/lib/documentBrand';

// Bump when the payload shape or the rendered artifact structure changes so old
// snapshots stay identifiable by the generator that produced them.
// v2 = Phase 7C Direction B: artifact ใช้เครื่องยนต์เอกสาร Quotation Master V4
// (quotationMasterDocument) แทน quotePrint เดิม
// v4.1 = สะสมการเปลี่ยนแปลงช่วง PR #618–#628: payload เพิ่ม taxId/phone ของลูกค้า,
// artifact ฝังฟอนต์เป็น base64 + ฝังรูปลายเซ็นผู้อนุมัติ/ผู้เสนอราคา + accent เป็น
// inline style — snapshot ที่ tag 'quote-master-v4' อาจมาจาก generator รุ่นใดรุ่นหนึ่ง
// ในช่วงนั้น (tag ไม่เคยขยับตามสัญญาไว้ข้างบน)
export const ISSUED_QUOTATION_LAYOUT_VERSION = 'quote-master-v4.1';
export const ISSUED_QUOTATION_LOCALE = 'th-TH';

const trimOrNull = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

// Snapshot of the company block exactly as printed at issue time. The print
// engine reads these constants live, so pinning them keeps a reprint faithful
// even if the constants change later.
function companySnapshot() {
  return {
    legalName: COMPANY_LEGAL_NAME,
    address: COMPANY_ADDRESS,
    taxId: COMPANY_TAX_ID,
    officeTel: COMPANY_OFFICE_TEL,
    line: COMPANY_LINE,
    website: COMPANY_WEBSITE,
  };
}

// Deterministic structured payload behind the rendered artifact. Any change here
// changes the content fingerprint, which marks a new issue of the document.
export function buildIssuedQuotationPayload(quote = {}, evidence = {}) {
  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  const form = evidence.controlledFormSnapshot || null;
  return {
    document: {
      quoteNumber: trimOrNull(quote.quoteNumber),
      quoteDate: quote.quoteDate || null,
      validUntil: quote.validUntil || null,
      revisionNo: Number(quote.revisionNo) || 0,
    },
    content: quotationApprovalContent(quote, lines),
    customer: {
      customerName: trimOrNull(quote.customerName),
      customerTaxId: trimOrNull(quote.customerTaxId),
      branchCode: trimOrNull(quote.branchCode),
      billingAddress: trimOrNull(quote.billingAddress),
      shippingAddress: trimOrNull(quote.shippingAddress),
      contactName: trimOrNull(quote.contactName),
      contactPhone: trimOrNull(quote.contactPhone),
    },
    context: {
      dealTitle: trimOrNull(quote.deal?.title || quote.dealTitle),
      // โครงการผูกผ่านดีล (deal.project แนบจาก route ตอนโหลดใบ) — chain เดิมคงไว้เผื่อ caller เก่า
      projectName: trimOrNull(quote.deal?.project?.name || quote.project?.name || quote.projectName),
      aeOwner: trimOrNull(quote.metadata?.aeOwner),
    },
    approval: {
      approvedByName: trimOrNull(quote.approvedByName || quote.deal?.ownerName),
      approvedAt: quote.approvedAt || null,
      proposer: trimOrNull(quote.createdByName || quote.metadata?.preparedBy),
      proposerPhone: trimOrNull(quote.createdByPhone),
    },
    company: companySnapshot(),
    standard: form
      ? {
        versionId: form.versionId || null,
        formCode: form.formCode || null,
        revision: form.revision || null,
        versionNumber: form.versionNumber ?? null,
      }
      : null,
  };
}

// The rendered artifact is the frozen HTML a reprint replays. buildQuotationMasterHTML
// is a pure string builder (no DOM), so it runs unchanged on the server.
// options.approverSignatureImage = data URI ของรูปลายเซ็นผู้อนุมัติ ฝังลงในใบตรึง
// ให้ self-contained (reprint แสดงรูปเดิมเสมอ แม้ลายเซ็นถูกเปลี่ยน/ยกเลิกภายหลัง)
export function buildIssuedQuotationArtifactHtml(quote = {}, options = {}) {
  return buildQuotationMasterHTML(
    { ...quote, approvalStatus: 'approved' },
    {
      watermark: '',
      approverSignatureImage: options.approverSignatureImage || null,
      proposerSignatureImage: options.proposerSignatureImage || null,
    },
  );
}

// storage path ของลายเซ็น "ที่ใช้งานอยู่" ของ user (สำหรับผู้เสนอราคา = ผู้สร้างใบ).
// ต่างจากผู้อนุมัติที่ path ถูกตรึงใน evidence — ผู้เสนอราคาใช้เวอร์ชัน active ณ เวลาตรึง.
export async function loadActiveSignatureAsset(supabase, userId) {
  if (!userId) return null;
  try {
    const { data: root } = await supabase
      .from('user_signatures').select('activeVersionId').eq('userId', userId).maybeSingle();
    if (!root?.activeVersionId) return null;
    const { data: version } = await supabase
      .from('user_signature_versions')
      .select('storageBucket, storagePath, mimeType')
      .eq('id', root.activeVersionId).maybeSingle();
    return version || null;
  } catch {
    return null;
  }
}

// ดึงไฟล์รูปลายเซ็นจาก storage (bucket private → ต้อง service-role client) แล้วแปลงเป็น
// data URI base64. asset = signatureAssetSnapshot ที่ evidence ตรึงไว้ตอนอนุมัติ
// (มี storageBucket/storagePath/mimeType). ล้มเหลว/ไม่มี → null (ใบยังออกได้ ไม่บล็อก)
export async function loadSignatureImageDataUri(supabase, asset) {
  if (!asset || !asset.storageBucket || !asset.storagePath) return null;
  try {
    const { data, error } = await supabase.storage.from(asset.storageBucket).download(asset.storagePath);
    if (error || !data) return null;
    const buffer = Buffer.from(await data.arrayBuffer());
    if (!buffer.length) return null;
    const mime = asset.mimeType || 'image/png';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

export function issuedContentFingerprint(payload) {
  return documentApprovalFingerprint(payload);
}

export function artifactSha256(html) {
  return `sha256:${createHash('sha256').update(String(html ?? ''), 'utf8').digest('hex')}`;
}

// Captures the snapshot + artifact through the atomic, idempotent RPC. Retrying
// with identical content returns the existing snapshot instead of duplicating.
export async function captureIssuedQuotationSnapshot(supabase, { quote, evidence, user }) {
  const payload = buildIssuedQuotationPayload(quote, evidence);
  // ฝังรูปลายเซ็นลงในใบตรึง (self-contained เหมือนฟอนต์) — ผู้อนุมัติ = evidence-backed
  // (path ตรึงใน evidence); ผู้เสนอราคา = stamp เชิงภาพจากลายเซ็น active ของผู้สร้าง
  const proposerAsset = await loadActiveSignatureAsset(supabase, quote.createdBy);
  const [approverSignatureImage, proposerSignatureImage] = await Promise.all([
    loadSignatureImageDataUri(supabase, evidence?.signatureAssetSnapshot),
    loadSignatureImageDataUri(supabase, proposerAsset),
  ]);
  const html = buildIssuedQuotationArtifactHtml(quote, { approverSignatureImage, proposerSignatureImage });
  const { data, error } = await supabase.rpc('capture_issued_quotation_snapshot_atomic', {
    p_snapshot_id: genId('ISD'),
    p_artifact_id: genId('IDA'),
    p_quotation_id: quote.id,
    p_content_fingerprint: issuedContentFingerprint(payload),
    p_resolved_payload: payload,
    p_artifact_html: html,
    p_artifact_sha256: artifactSha256(html),
    p_document_standard_version_id: evidence.documentStandardVersionId,
    // เวอร์ชัน Commercial Preset ที่ควบคุมใบนี้ (ตรึงตอนสร้างใบใน metadata) — RPC จะ
    // validate ว่ามีจริงถ้าไม่ว่าง (mig 0130); ใบเก่าก่อนฟีเจอร์นี้ = null (ข้ามได้)
    p_commercial_preset_version_id: quote?.metadata?.commercialPresetVersionId || null,
    p_signature_evidence_id: evidence.id,
    p_layout_version: ISSUED_QUOTATION_LAYOUT_VERSION,
    p_locale: ISSUED_QUOTATION_LOCALE,
    p_actor_id: user?.id || quote.approvedBy || null,
    p_actor_name: user?.name || quote.approvedByName || null,
  });
  if (error) throw error;
  return data;
}
