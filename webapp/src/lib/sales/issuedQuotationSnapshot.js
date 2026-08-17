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
import { resolveCompanyBlock } from '@/lib/companyProfile';
import { fillCustomerSnapshotFromMaster } from '@/lib/sales/customerSnapshotFallback';
import { resolveDocumentAccentKey, resolveDocumentForm, resolveDocumentTitleTh } from '@/lib/documentStandards';

// Bump when the payload shape or the rendered artifact structure changes so old
// snapshots stay identifiable by the generator that produced them.
// v2 = Phase 7C Direction B: artifact ใช้เครื่องยนต์เอกสาร Quotation Master V4
// (quotationMasterDocument) แทน quotePrint เดิม
// v4.1 = สะสมการเปลี่ยนแปลงช่วง PR #618–#628: payload เพิ่ม taxId/phone ของลูกค้า,
// artifact ฝังฟอนต์เป็น base64 + ฝังรูปลายเซ็นผู้อนุมัติ/ผู้เสนอราคา + accent เป็น
// inline style — snapshot ที่ tag 'quote-master-v4' อาจมาจาก generator รุ่นใดรุ่นหนึ่ง
// ในช่วงนั้น (tag ไม่เคยขยับตามสัญญาไว้ข้างบน)
// v4.2 = ช่องผู้เสนอราคาเป็น evidence-backed (วันที่ลงนาม + Evidence id ฝังในใบตรึง, mig 0155)
//        + ข้อมูลลูกค้าที่ว่างถูกเติมจากทะเบียนก่อนตรึง (#710)
// v4.3 = ใบเลือกภาษาเอกสารได้ (quotations.docLanguage, mig 0238 · IS-26080005) — artifact
//        ที่ตรึงเป็นภาษาที่ใบเลือกไว้ ณ เวลาอนุมัติ และ locale บันทึกภาษานั้นจริง ๆ
export const ISSUED_QUOTATION_LAYOUT_VERSION = 'quote-master-v4.3';
export const ISSUED_QUOTATION_LOCALE = 'th-TH';

/* ── docLanguage กับฉบับตรึง: ตัดสินแล้ว (2026-08-12) ────────────────────────
   ใบที่ออกไปแล้ว **เปลี่ยนภาษาตามค่าปัจจุบันไม่ได้อยู่แล้ว** เพราะ reprint เล่น
   `issued_document_artifacts.content` ซึ่งเป็น HTML ที่ตรึงตอนอนุมัติ ภาษาถูกอบอยู่
   ในไฟล์นั้นแล้ว (ดู GET .../issued?render=…) — ไม่มีเส้นทางไหน re-render จากข้อมูลสด
   แล้วเรียกว่า "ฉบับตรึง"

   ถึงอย่างนั้นก็ยังต้องบันทึกภาษาลงฉบับตรึงด้วย สองเหตุผล:
     1. คอลัมน์ `locale` เคยเป็น 'th-TH' ตายตัว — ปล่อยไว้แปลว่าใบอังกฤษถูกบันทึกใน
        ทะเบียนเอกสารที่ออกจริงว่าเป็นใบไทย = หลักฐานโกหก (API รายการ snapshot คืนค่านี้)
     2. `resolvedPayload` คือ "เนื้อหาที่ resolve แล้ว" ที่อยู่เบื้องหลัง artifact ถ้าวันหนึ่ง
        มีคนสร้างเอกสารจาก payload (route PDF อ่าน payload อยู่แล้วสำหรับชื่อไฟล์)
        แล้วไม่มีภาษาอยู่ในนั้น มันจะกลับไปเป็นไทยเงียบ ๆ

   ⛔ **ห้ามเอา docLanguage ไปใส่ `quotationApprovalContent`** (fingerprint การอนุมัติ)
   ค่านั้นถูกเก็บไว้ในคอลัมน์ `approvalFingerprint` ของใบทุกใบบน prod แล้วเทียบกับค่าที่
   คำนวณสดตอนกด "ส่งลูกค้า" (validateDocumentReadiness) — เพิ่มคีย์เข้าไปคือทำให้ค่าที่
   คำนวณสดไม่ตรงกับที่เก็บไว้ **ทุกใบที่อนุมัติไปแล้ว** ⇒ ส่งใบไม่ได้ทั้งระบบ
   และไม่ได้อะไรกลับมาเลย เพราะสวิตช์ภาษาล็อกตั้งแต่ใบพ้นสถานะ not_submitted */
export function issuedQuotationLocale(quote = {}) {
  return quote.docLanguage === 'en' ? 'en-US' : ISSUED_QUOTATION_LOCALE;
}

const trimOrNull = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

// Deterministic structured payload behind the rendered artifact. Any change here
// changes the content fingerprint, which marks a new issue of the document.
// `company` = บล็อกบริษัทที่เผยแพร่ ณ เวลาอนุมัติ (ตรึงลง payload ให้ reprint ตรงเดิม
// แม้ข้อมูลบริษัทถูกแก้ภายหลัง); ไม่ส่ง → fallback constants
export function buildIssuedQuotationPayload(quote = {}, evidence = {}, company) {
  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  const form = evidence.controlledFormSnapshot || null;
  const co = resolveCompanyBlock(company);
  return {
    document: {
      quoteNumber: trimOrNull(quote.quoteNumber),
      quoteDate: quote.quoteDate || null,
      validUntil: quote.validUntil || null,
      revisionNo: Number(quote.revisionNo) || 0,
      // ภาษาที่ใบนี้ถูกออกจริง (mig 0238) — ใบก่อนหน้าคอลัมน์นี้คือไทยทั้งหมด
      // ⚠️ คีย์ใหม่เปลี่ยน contentFingerprint ของ **ฉบับที่จะตรึงต่อจากนี้** เท่านั้น
      // ของเก่าเก็บค่าไว้ในตารางแล้ว ไม่เคยถูกคำนวณซ้ำ (RPC ใช้เทียบเพื่อกันตรึงซ้ำ
      // ของใบเดียวกัน ซึ่งเกิดครั้งเดียวตอนอนุมัติ)
      docLanguage: quote.docLanguage === 'en' ? 'en' : 'th',
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
      // ผู้ดูแล = เจ้าของดีล อ่านสด (มติผู้ใช้ 2026-08-17) — เดิมอ่าน metadata.aeOwner
      // ซึ่งเป็นดรอปดาวน์อิสระที่ตั้งต้นจาก `project.aeOwner` ⇒ ไม่ผูกกับดีลใบนี้เลย
      // ⚠️ คนละช่องกับ approval.approvedByName ข้างล่าง: ผู้กำกับดูแล (admin/หัวหน้าขาย)
      // อนุมัติแทนได้ ⇒ คนอนุมัติจริงอาจไม่ใช่เจ้าของดีล ต้องเก็บทั้งสองค่า
      aeOwner: trimOrNull(quote.deal?.ownerName || quote.metadata?.aeOwner),
      // เอกสารอ้างอิงที่พิมพ์เอง (mig 0267) — ขึ้นบนเอกสารจริง จึงต้องอยู่ในหลักฐาน
      // ที่ตรึงด้วย · คีย์ใหม่เปลี่ยน contentFingerprint ของ **ฉบับที่จะตรึงต่อจากนี้**
      // เท่านั้น (เหตุผลเดียวกับ docLanguage ด้านบน) — คนละตัวกับ approvalFingerprint
      referenceNote: trimOrNull(quote.referenceNote),
    },
    approval: {
      approvedByName: trimOrNull(quote.approvedByName || quote.deal?.ownerName),
      approvedAt: quote.approvedAt || null,
      // ผู้จัดทำ = คนที่กดยื่น (มติผู้ใช้ 2026-08-17) — กติกาเดียวกับ preparedBy ใน
      // quotationMasterTemplate ต้องตรงกัน ไม่งั้นฉบับตรึงกับฉบับพิมพ์สดชื่อคนละคน
      // ⚠️ ค่าที่เปลี่ยนกระทบ contentFingerprint ของ **ฉบับที่จะตรึงต่อจากนี้** เท่านั้น
      // (เหตุผลเดียวกับ docLanguage ด้านบน — ของเก่าเก็บค่าไว้ในตารางแล้ว ไม่คำนวณซ้ำ)
      proposer: trimOrNull(quote.approvalRequestedByName || quote.createdByName),
      proposerPhone: trimOrNull(quote.createdByPhone),
    },
    // คงรูป payload.company เดิม (fingerprint semantics ไม่เปลี่ยน) แต่ค่าดึงจากบริษัท
    // ที่เผยแพร่ ณ เวลาอนุมัติ — บริษัทคนละชุด = คนละ issue ตามเจตนา
    company: {
      legalName: co.legalNameTh,
      address: co.address,
      taxId: co.taxId,
      officeTel: co.phone,
      line: co.line,
      website: co.website,
    },
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
    // ภาษาเดินทางมากับตัวใบ (quote.docLanguage) — builder อ่านเอง ไม่ต้องส่งซ้ำทาง options
    { ...quote, approvalStatus: 'approved' },
    {
      watermark: '',
      company: options.company || null,
      // มาตรฐานเอกสารที่ตรึงไว้ใน evidence ตอนอนุมัติ — ใบที่ออกไปแล้วต้องคงรหัสแบบฟอร์ม
      // เดิมเสมอ ไม่วิ่งตามมาตรฐานที่เผยแพร่ทีหลัง (ADR 0011)
      form: resolveDocumentForm(options.standard, 'quotation'),
      accentKey: resolveDocumentAccentKey(options.standard, 'quotation'),
      documentTitleTh: resolveDocumentTitleTh(options.standard, 'quotation'),
      approverSignatureImage: options.approverSignatureImage || null,
      proposerSignatureImage: options.proposerSignatureImage || null,
      // มีหลักฐานการยื่น (mig 0155) → ฝังวันที่ลงนาม + Evidence id ของผู้เสนอราคาลงในใบตรึง
      proposerEvidence: options.proposerEvidence || null,
    },
  );
}

// storage path ของลายเซ็น "ที่ใช้งานอยู่" ของ user (สำหรับผู้เสนอราคา = ผู้สร้างใบ).
// ต่างจากผู้อนุมัติที่ path ถูกตรึงใน evidence — ผู้เสนอราคาใช้เวอร์ชัน active ณ เวลาตรึง.
export async function loadActiveSignatureAsset(supabase, userId) {
  if (!userId) return null;
  try {
    const { data: root, error: rootError } = await supabase
      .from('user_signatures').select('activeVersionId').eq('userId', userId).maybeSingle();
    if (rootError) throw rootError;
    if (!root?.activeVersionId) return null;
    const { data: version, error: versionError } = await supabase
      .from('user_signature_versions')
      .select('storageBucket, storagePath, mimeType')
      .eq('id', root.activeVersionId).maybeSingle();
    if (versionError) throw versionError;
    return version || null;
  } catch (error) {
    // กลืนโดยเจตนา: ตรึงเอกสารต่อได้แม้ไม่มีลายเซ็น (ดีกว่าตรึงไม่ได้เลย) — แต่ต้องมี
    // ร่องรอย ไม่งั้นเอกสารออกมาไม่มีลายเซ็นแล้วไม่มีใครรู้ว่าเพราะอะไร
    console.error('[snapshot] โหลดลายเซ็นที่ใช้งานอยู่ไม่สำเร็จ:', error?.message || error);
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
export async function captureIssuedQuotationSnapshot(supabase, { quote, evidence, user, company }) {
  // ข้อมูลลูกค้าบนใบเป็น snapshot ณ วันสร้าง — ใบที่สร้างก่อนฟีเจอร์ snapshot ครบ
  // (ผู้ติดต่อ 2026-07-19 / เลขผู้เสียภาษี 2026-07-21) หรือใบที่ตอนสร้างทะเบียนลูกค้ายังไม่มี
  // ค่านั้น จะมีช่องว่าง. หน้ารายละเอียดเติมจากทะเบียนลูกค้าตอนอ่าน (GET) อยู่แล้ว แต่
  // **ฉบับตรึงไม่เคยเติม** → เอกสารที่ออกจริงแสดง '-' ทั้งที่หน้าเว็บแสดงครบ (บั๊กที่ผู้ใช้เจอ
  // 2026-07-26). เติมที่ชั้น capture = ทุก caller ได้เหมือนกัน ไม่ต้องจำไปเรียกเองทีละที่
  const filledQuote = await fillCustomerSnapshotFromMaster(supabase, quote);
  const payload = buildIssuedQuotationPayload(filledQuote, evidence, company);
  // ฝังรูปลายเซ็นลงในใบตรึง (self-contained เหมือนฟอนต์) — ผู้อนุมัติ = evidence-backed
  // (path ตรึงใน evidence); ผู้เสนอราคา = evidence ที่ตรึงตอน "ยื่น" (mig 0155) ถ้ามี →
  // ได้รูปเวอร์ชันที่ลงนามจริง + วันที่ + Evidence id; ใบที่ยื่นก่อนมีหลักฐาน (หรือ
  // grandfather not_required) fallback เป็นลายเซ็น active เดิม = stamp เชิงภาพไม่มีวันที่
  let proposerAsset = null;
  let proposerEvidence = null;
  if (filledQuote.proposerSignatureEvidenceId) {
    const { data: ev } = await supabase
      .from('document_signature_evidence')
      .select('id, signerName, signedAt, signatureAssetSnapshot')
      .eq('id', filledQuote.proposerSignatureEvidenceId)
      .maybeSingle();
    if (ev?.signatureAssetSnapshot) {
      proposerAsset = ev.signatureAssetSnapshot;
      proposerEvidence = ev;
    }
  }
  // fallback: ลายเซ็น active ของ **ผู้ยื่น** ก่อน (คนเดียวกับชื่อที่ขึ้นช่องผู้จัดทำ) แล้ว
  // ค่อยถอยไปผู้สร้างร่างสำหรับใบเก่าที่ไม่มีขั้นยื่น — สลับลำดับนี้ไม่ได้ ไม่งั้นได้
  // "รูปลายเซ็นคนหนึ่ง ชื่อกำกับอีกคน" บนช่องเดียวกัน
  if (!proposerAsset) {
    proposerAsset = await loadActiveSignatureAsset(supabase, filledQuote.approvalRequestedBy)
      || await loadActiveSignatureAsset(supabase, filledQuote.createdBy);
  }
  const [approverSignatureImage, proposerSignatureImage] = await Promise.all([
    loadSignatureImageDataUri(supabase, evidence?.signatureAssetSnapshot),
    loadSignatureImageDataUri(supabase, proposerAsset),
  ]);
  const html = buildIssuedQuotationArtifactHtml(filledQuote, {
    company,
    standard: evidence?.controlledFormSnapshot || null,
    approverSignatureImage,
    proposerSignatureImage,
    proposerEvidence,
  });
  const { data, error } = await supabase.rpc('capture_issued_quotation_snapshot_atomic', {
    p_snapshot_id: genId('ISD'),
    p_artifact_id: genId('IDA'),
    p_quotation_id: filledQuote.id,
    p_content_fingerprint: issuedContentFingerprint(payload),
    p_resolved_payload: payload,
    p_artifact_html: html,
    p_artifact_sha256: artifactSha256(html),
    p_document_standard_version_id: evidence.documentStandardVersionId,
    // เวอร์ชันชุดเงื่อนไขการค้าที่ควบคุมใบนี้ (ตรึงตอนสร้าง/แก้ใบใน metadata) — RPC จะ
    // validate ว่ามีจริงถ้าไม่ว่าง (mig 0130); ใบเก่าก่อนฟีเจอร์นี้ = null (ข้ามได้).
    // คอลัมน์นี้มีช่องเดียว จึงตรึง "เทมเพลตเงื่อนไขการชำระ" เพราะเป็นเงื่อนไขที่มีผลทางการเงิน
    // ส่วน id ของชุดหมายเหตุติดไปกับ metadata ใน payload ที่ตรึงอยู่แล้ว
    p_commercial_preset_version_id: filledQuote?.metadata?.paymentPresetVersionId
      || filledQuote?.metadata?.commercialPresetVersionId || null,
    p_signature_evidence_id: evidence.id,
    p_layout_version: ISSUED_QUOTATION_LAYOUT_VERSION,
    p_locale: issuedQuotationLocale(filledQuote),
    p_actor_id: user?.id || quote.approvedBy || null,
    p_actor_name: user?.name || quote.approvedByName || null,
  });
  if (error) throw error;
  return data;
}
