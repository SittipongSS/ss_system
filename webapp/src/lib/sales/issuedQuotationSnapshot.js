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
export const ISSUED_QUOTATION_LAYOUT_VERSION = 'quote-master-v4';
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
      branchCode: trimOrNull(quote.branchCode),
      billingAddress: trimOrNull(quote.billingAddress),
      shippingAddress: trimOrNull(quote.shippingAddress),
      contactName: trimOrNull(quote.contactName),
      contactPhone: trimOrNull(quote.contactPhone),
    },
    context: {
      dealTitle: trimOrNull(quote.deal?.title || quote.dealTitle),
      projectName: trimOrNull(quote.project?.name || quote.projectName),
      aeOwner: trimOrNull(quote.metadata?.aeOwner),
    },
    approval: {
      approvedByName: trimOrNull(quote.approvedByName || quote.deal?.ownerName),
      approvedAt: quote.approvedAt || null,
      proposer: trimOrNull(quote.createdByName || quote.metadata?.preparedBy),
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
export function buildIssuedQuotationArtifactHtml(quote = {}) {
  return buildQuotationMasterHTML(
    { ...quote, approvalStatus: 'approved' },
    { watermark: '' },
  );
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
  const html = buildIssuedQuotationArtifactHtml(quote);
  const { data, error } = await supabase.rpc('capture_issued_quotation_snapshot_atomic', {
    p_snapshot_id: genId('ISD'),
    p_artifact_id: genId('IDA'),
    p_quotation_id: quote.id,
    p_content_fingerprint: issuedContentFingerprint(payload),
    p_resolved_payload: payload,
    p_artifact_html: html,
    p_artifact_sha256: artifactSha256(html),
    p_document_standard_version_id: evidence.documentStandardVersionId,
    p_commercial_preset_version_id: null,
    p_signature_evidence_id: evidence.id,
    p_layout_version: ISSUED_QUOTATION_LAYOUT_VERSION,
    p_locale: ISSUED_QUOTATION_LOCALE,
    p_actor_id: user?.id || quote.approvedBy || null,
    p_actor_name: user?.name || quote.approvedByName || null,
  });
  if (error) throw error;
  return data;
}
