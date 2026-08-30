import { recordAudit } from '@/lib/audit';
import { purgeUpdates } from '@/lib/master/updates';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { isSuperuser } from '@/lib/permissions';
import {
  isForceRequest, isDryRun, canForceDelete,
  quotationForcePreview, cleanupQuotationOrphans,
  exciseFilingBlockMessage, exciseFilingsOfQuotation,
  contractsOfQuotation, contractBlockMessage,
} from '@/lib/forceDelete';
import { canSwitchQuotationDocLanguage, isQuotationAwaitingApproval } from '@/lib/sales/quotationWorkflow';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { isForeignKeyViolation } from '@/lib/sales/salesOrderWorkflow';
import {
  canApproveQuotation, canEditSalesPlanning, canViewSalesPlanning, dealAuditLabel,
  inSalesEditScope, inSalesViewScope, normalizeDiscountValue, quoteTotals, toMoney,
} from '@/lib/salesPlanning';
import {
  customerMismatchMessage, customerMismatchedLines,
  enforceMasterPrices, normalizeManualLines, refreshFgLinesForDisplay,
} from '@/lib/sales/quoteLines';
import { normalizePaymentPlan, validatePaymentPlan } from '@/lib/sales/paymentPlan';
import { quotationApprovalFingerprint } from '@/lib/sales/quotationApprovalFingerprint';
import { QUOTATION_DOC_LANGUAGES } from '@/lib/sales/quotationMasterTemplate';
import { validateDocumentReadiness } from '@/lib/documentWorkflow';
import { stripRetiredPeople } from '@/lib/sales/quotationMetadata';
import { resolvePinnedPresetVersionIds } from '@/lib/admin/commercialPresets';
import { fillCustomerSnapshotFromMaster, refreshCustomerNameForDisplay } from '@/lib/sales/customerSnapshotFallback';
import { pickDocumentAddresses } from '@/lib/master/addresses';
import { loadSignatureImageDataUri, reissueQuotationDocumentForLanguage } from '@/lib/sales/issuedQuotationSnapshot';
import { captureIssuedQuotationPdf } from '@/lib/sales/issuedQuotationPdf';
import { purgePrivateEvidence, removeEvidenceRefs } from '@/lib/upload/privateEvidence';
import { getPublishedCompanyProfile } from '@/lib/admin/organizationSettings';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const quoteSelect = '*, lines:quotation_lines(*), deal:sales_deals(id, title, stage, dealType, team, ownerId, ownerName, customerId, customerName, projectId, project:projects(id, code, name))';

async function loadQuote(supabase, id) {
  const { data, error } = await supabase.from('quotations').select(quoteSelect).eq('id', id).maybeSingle();
  if (error) throw error;
  if (data?.deal?.projectId) {
    const { data: project } = await supabase
      .from('projects')
      .select('id, code, name')
      .eq('id', data.deal.projectId)
      .maybeSingle();
    data.deal.project = project || null;
  }
  if (data?.status === 'accepted') {
    const { data: salesOrder } = await supabase
      .from('sales_orders')
      .select('id, orderNumber, status, orderDate, actualAmount')
      .eq('quotationId', data.id)
      .maybeSingle();
    data.salesOrder = salesOrder || null;
  }
  return data;
}

// สถานะที่ยังแก้เนื้อหาได้ — accepted/revised/cancelled = read-only (หลักฐานการค้า)
const EDITABLE_STATUSES = new Set(['draft', 'sent', 'rejected']);

// ลายเซ็นผู้เสนอราคาสำหรับพิมพ์สด: อ่านจากหลักฐานที่ตรึงตอนยื่น (mig 0155) แล้วโหลดไฟล์รูป
// จาก bucket ส่วนตัวด้วย service-role (RLS บล็อก client) ฝังเป็น data URI — ใบที่ยังไม่ยื่น/
// ไม่มีหลักฐาน (grandfather) คืน null แล้วเอกสารหล่นไปช่องเซ็นเปล่าเหมือนเดิม.
// ฉบับตรึง snapshot มีเส้นทางของตัวเอง (captureIssuedQuotationSnapshot) ไม่ผ่านทางนี้
async function loadProposerSignature(supabase, quote) {
  if (!quote?.proposerSignatureEvidenceId) return null;
  const { data: ev, error: evError } = await supabase
    .from('document_signature_evidence')
    .select('id, signerName, signedAt, signatureAssetSnapshot')
    .eq('id', quote.proposerSignatureEvidenceId)
    .maybeSingle();
  if (evError) console.error('[quotation] โหลดหลักฐานลายเซ็นผู้จัดทำไม่สำเร็จ:', evError.message);
  if (!ev?.signatureAssetSnapshot) return null;
  const imageDataUri = await loadSignatureImageDataUri(getSupabaseAdmin(), ev.signatureAssetSnapshot);
  if (!imageDataUri) return null;
  return {
    imageDataUri,
    // ผู้จัดทำ = คนที่กดยื่น (มติผู้ใช้ 2026-08-17) — ชื่อจากหลักฐานมาก่อนเสมอ
    // ค่าสำรองจึงต้องเป็นผู้ยื่น ไม่ใช่ผู้สร้างร่าง (createdByName เหลือไว้ให้ใบเก่า)
    signerName: ev.signerName || quote.approvalRequestedByName || quote.createdByName || '',
    signedAt: ev.signedAt || quote.approvalRequestedAt || null,
    evidenceId: ev.id,
  };
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const quote = await loadQuote(supabase, id);
  if (!quote) return notFound('ไม่พบใบเสนอราคา');
  if (!quote.deal || !inSalesViewScope(user, quote.deal)) return forbidden();
  // ข้อมูลลูกค้าบนใบเป็น snapshot — ใบเก่าที่ snapshot ไม่ครบ (ผู้ติดต่อ/เลขภาษี) เติม
  // เฉพาะช่องว่างจากทะเบียนลูกค้าสด เพื่อให้หน้ารายละเอียด/เอกสารแสดงครบโดยไม่ต้อง Revise
  const filledQuote = await fillCustomerSnapshotFromMaster(supabase, quote);
  // บรรทัด FG โชว์คำอธิบายสดจาก master (แบรนด์ · ชื่อสินค้า · ปริมาตร) เฉพาะใบที่ยัง
  // แก้ได้ — ใบเก่าที่ snapshot แค่ชื่อจะแสดง/พิมพ์ครบโดยไม่ต้องบันทึกใหม่
  await refreshFgLinesForDisplay(supabase, [filledQuote]);
  // ชื่อลูกค้าบนร่างที่ยังไม่ยื่น อ่านสดจากทะเบียน (ดูเหตุผลที่ customerSnapshotFallback.js)
  await refreshCustomerNameForDisplay(supabase, [filledQuote]);
  const baseNumber = filledQuote.baseNumber || filledQuote.quoteNumber;
  // ⚠️ ไล่ทีละหน้า — ประวัติ Rev. ของเลขใบเดียว สะสมได้ไม่จำกัด
  const { data: revisionHistory, error: revisionError } = await fetchAllResult(() => supabase
    .from('quotations')
    .select('id, quoteNumber, revisionNo, status, quoteDate, createdAt, totalAmount')
    .eq('baseNumber', baseNumber)
    .order('revisionNo', { ascending: false })
    .order('id', { ascending: true }));
  if (revisionError) return fail(revisionError.message, 500);
  // รูปลายเซ็นผู้เสนอราคา (ไม่บล็อกถ้าโหลดไม่ได้ — เอกสารยังพิมพ์ได้ ตกช่องเซ็นเปล่า)
  let proposerSignature = null;
  if (!user.devBypass) {
    try { proposerSignature = await loadProposerSignature(supabase, filledQuote); }
    catch { proposerSignature = null; }
  }
  // canApprove: ผู้ใช้ปัจจุบันเป็นเจ้าของดีล/superuser (ผู้อนุมัติ) — UI ใช้แสดงปุ่มอนุมัติ
  return ok({
    ...filledQuote,
    revisionHistory: revisionHistory || [],
    meId: user.id,
    canApprove: canApproveQuotation(user, filledQuote.deal),
    proposerSignature,
  });
});

// PATCH — แก้เนื้อหาใบ (lines/ส่วนลด/VAT/เงื่อนไขชำระ/หมายเหตุ/วันหมดอายุ/สถานะ draft↔sent)
// ยอดเงินคิดใหม่ที่ server เสมอ + ประเมินเงื่อนไขอนุมัติซ้ำเมื่อยอดเปลี่ยน
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const before = await loadQuote(supabase, id);
  if (!before) return notFound('ไม่พบใบเสนอราคา');
  if (!before.deal || !inSalesEditScope(user, before.deal)) return forbidden();
  if (!EDITABLE_STATUSES.has(before.status)) {
    if (before.status === 'closed') {
      return badRequest('ใบนี้ถูกปิดแล้ว (ดีลจบด้วยใบเสนอราคาฉบับอื่น) — แก้ไขไม่ได้');
    }
    return badRequest(`ใบสถานะ "${before.status}" แก้ไขไม่ได้ — ใช้ Revise เพื่อออกฉบับใหม่`);
  }
  // ดีล Lost = จบแล้ว — ห้ามแก้/ส่งใบต่อ (สร้างใบใหม่ถูกบล็อกอยู่แล้ว แต่ใบเดิมเคยหลุด)
  if (before.deal?.stage === 'lost') {
    return badRequest('ดีลนี้ Lost แล้ว — แก้ไข/ส่งใบเสนอราคาต่อไม่ได้');
  }

  const body = await req.json().catch(() => ({}));
  const bodyKeys = Object.keys(body);
  const statusOnlySend = body.status === 'sent'
    && before.status === 'draft'
    && ['approved', 'not_required'].includes(before.approvalStatus)
    && bodyKeys.every((key) => key === 'status');
  /* ⭐ เปลี่ยน **ภาษาเอกสารอย่างเดียว** ผ่านด่านนี้ได้แม้ใบอนุมัติแล้ว (มติผู้ใช้ 2026-08-27)
     ภาษาเปลี่ยนแค่กระดาษที่พิมพ์ ไม่ใช่ข้อเสนอ ⇒ ไม่ต้องออก Rev. ไม่ล้างการอนุมัติ
     ⚠️ ต้อง **คีย์เดียวจริง ๆ** — ยัด docLanguage ไปพร้อมช่องอื่นแล้วปล่อยผ่าน คือช่องแก้
     ใบที่อนุมัติแล้วโดยไม่มีใครรู้ · ด่านของตัวเอง (`canSwitchQuotationDocLanguage`) บล็อก
     ใบที่ยื่นอนุมัติค้างอยู่ เพราะผู้อนุมัติกำลังเปิดใบนั้นอยู่ */
  const docLanguageOnly = bodyKeys.length > 0 && bodyKeys.every((key) => key === 'docLanguage');
  if (docLanguageOnly && !canSwitchQuotationDocLanguage(before)) {
    return fail('ใบนี้เปลี่ยนภาษาเอกสารไม่ได้ในสถานะปัจจุบัน', 409);
  }
  if (before.approvalStatus !== 'not_submitted' && !statusOnlySend && !docLanguageOnly) {
    if (before.approvalStatus === 'pending') {
      return fail('ใบเสนอราคานี้ยื่นอนุมัติแล้ว — ดึงกลับก่อนแก้ไข', 409);
    }
    if (before.approvalStatus === 'approved') {
      return fail('ใบเสนอราคานี้อนุมัติแล้ว — หากต้องการแก้ไขให้ใช้ “ออก Rev.”', 409);
    }
    return fail('ใบเสนอราคานี้แก้ไขตรงไม่ได้ — หากต้องการแก้ไขให้ใช้ “ออก Rev.”', 409);
  }
  const now = new Date().toISOString();
  // ไม่รีเซ็ตสถานะอนุมัติที่หัว patch อีกต่อไป (มติ 2026-07-18: ใบต้องอนุมัติจริง) —
  // จะรีเซ็ตเป็น 'pending' เฉพาะเมื่อ "เนื้อห ากระทบยอด/เอกสารเปลี่ยน" (contentChanged
  // ด้านล่าง) เท่านั้น; แก้ช่องที่ไม่กระทบเอกสาร (เช่น ผู้รับผิดชอบ) คงสถานะอนุมัติเดิม.
  const patch = { updatedAt: now };

  // เนื้อหาใบ
  if ('quoteDate' in body) patch.quoteDate = body.quoteDate || before.quoteDate;
  if ('validUntil' in body) patch.validUntil = body.validUntil || null;
  if ('paymentTerms' in body) patch.paymentTerms = (body.paymentTerms || '').trim() || null;
  if ('notes' in body) patch.notes = (body.notes || '').trim() || null;
  // เอกสารอ้างอิง (mig 0267) — ข้อความอิสระ ไม่ผูกกับเอกสารจริงในระบบ (มติผู้ใช้)
  if ('referenceNote' in body) patch.referenceNote = (body.referenceNote || '').trim() || null;
  /* ภาษาเอกสาร (mig 0238) — เปลี่ยนได้ตลอด รวมใบที่อนุมัติแล้ว (มติผู้ใช้ 2026-08-27)
     ด่านอยู่ที่หัว PATCH: ถ้าใบไม่ใช่ร่าง คำขอต้องมี **คีย์นี้คีย์เดียว** และผ่าน
     `canSwitchQuotationDocLanguage` · ไม่อยู่ใน QUOTATION_APPROVAL_INVALIDATING_FIELDS แล้ว
     ค่านอกลิสต์ทิ้งไปเงียบ ๆ ไม่ได้ — DB มี CHECK อยู่ ปล่อยผ่านคือ 500 ที่อ่านไม่รู้เรื่อง */
  if ('docLanguage' in body) {
    if (!QUOTATION_DOC_LANGUAGES.includes(body.docLanguage)) {
      return badRequest('ภาษาเอกสารต้องเป็น "th" หรือ "en" เท่านั้น');
    }
    patch.docLanguage = body.docLanguage;
  }
  // metadata ของใบ — merge ทีละคีย์ ไม่ทับทั้งก้อน
  // ⚠️ ไม่มีบล็อก "ผู้รับผิดชอบเอกสาร" แล้ว (มติผู้ใช้ 2026-08-18) — คีย์ที่ปลดระวาง
  // ถูกปอกทิ้งทุกครั้ง ดูเหตุผลเต็มที่ lib/sales/quotationMetadata.js
  const hasMetaPatch = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata);
  if (hasMetaPatch) {
    const src = body.metadata;
    const {
      // ชุดเงื่อนไขการค้าเป็นหลักฐาน — ห้ามรับค่าจาก client ตรง ๆ ต้องผ่านการตรวจก่อน
      paymentPresetVersionId: _pay, remarksPresetVersionId: _rem,
      ...rest
    } = src;
    const editableMeta = stripRetiredPeople(rest);
    const pinnedPresets = await resolvePinnedPresetVersionIds(supabase, src);
    patch.metadata = {
      ...(before.metadata || {}),
      ...editableMeta,
      paymentPresetVersionId: pinnedPresets.payment,
      remarksPresetVersionId: pinnedPresets.remarks,
    };
  }
  if ('status' in body) {
    if (!['draft', 'sent'].includes(body.status)) return badRequest('เปลี่ยนสถานะได้เฉพาะ draft/sent (รับใบใช้ปุ่ม Accept)');
    patch.status = body.status;
  }

  // ที่อยู่บนใบ (0202/0203) — ไม่ใช่การ "แก้ข้อมูลลูกค้า" (อันนั้นยังต้องไปที่ทะเบียน
  // ลูกค้าเหมือนเดิม) แต่คือ "ใบนี้ใช้ที่อยู่ไหนของลูกค้า" ซึ่งเป็นข้อมูลของเอกสารเอง
  // เปลี่ยนได้เฉพาะร่างที่ยังไม่ยื่นอนุมัติ — ด่านหัว PATCH คุมไว้แล้ว (not_submitted)
  // ตัวข้อความอ่านสดจากทะเบียนตอนเลือก ไม่ใช่ให้ client ส่งข้อความมาเอง
  const addressPicked = 'billingAddressId' in body || 'shippingAddressId' in body;
  /* ผู้ติดต่อบนใบ — เหตุผลเดียวกับที่อยู่ทุกประการ: ไม่ใช่การ "แก้ข้อมูลลูกค้า" แต่คือ
     "ใบนี้ติดต่อใคร" ซึ่งเป็นข้อมูลของเอกสารเอง · เดิมเลือกได้เฉพาะตอนสร้างใบ พอเป็น
     ร่างแล้วแก้ไม่ได้เลย ทั้งที่ที่อยู่ในบล็อกเดียวกันแก้ได้ (มติผู้ใช้ 2026-08-27)
     ⚠️ รับเป็น **index** ไม่ใช่ชื่อ/เบอร์ที่ client ส่งมาเอง — ข้อความอ่านสดจากทะเบียน
     ตอนเลือก กติกาเดียวกับที่อยู่ ไม่งั้นใบจะมีชื่อผู้ติดต่อที่ไม่มีอยู่ในทะเบียนจริง */
  const contactPicked = 'contactIndex' in body;
  if (contactPicked || addressPicked) {
    const { data: cust } = before.customerId
      ? await supabase.from('customers')
        .select('addresses, address, shippingAddress, branchCode, contacts, contactPerson, contactPhone')
        .eq('id', before.customerId).maybeSingle()
      : { data: null };
    if (contactPicked) {
      const contacts = Array.isArray(cust?.contacts) ? cust.contacts : [];
      const index = Number(body.contactIndex);
      if (!Number.isInteger(index) || index < 0 || (contacts.length && index >= contacts.length)) {
        return badRequest('ผู้ติดต่อที่เลือกไม่อยู่ในทะเบียนลูกค้ารายนี้');
      }
      // ลูกค้าที่ยังไม่มีลิสต์ contacts (แถวยุคเก่า) ถอยไปช่องเดี่ยวเดิม — กติกาเดียว
      // กับ createQuotationDraft ไม่งั้นใบของลูกค้าเก่าจะเลือกผู้ติดต่อไม่ได้เลย
      const contact = contacts[index] || (contacts.length ? null : {
        name: cust?.contactPerson || '', phone: cust?.contactPhone || '', email: '',
      });
      if (!contact) return badRequest('ผู้ติดต่อที่เลือกไม่อยู่ในทะเบียนลูกค้ารายนี้');
      patch.contactName = contact.name || null;
      patch.contactPhone = contact.phone || null;
      patch.contactEmail = contact.email || null;
    }
    if (!addressPicked) { /* เลือกแต่ผู้ติดต่อ — ไม่ต้องแตะที่อยู่ */ } else {
    const picked = pickDocumentAddresses(cust, {
      billingAddressId: 'billingAddressId' in body ? body.billingAddressId : before.billingAddressId,
      shippingAddressId: 'shippingAddressId' in body ? body.shippingAddressId : before.shippingAddressId,
    });
    if (!picked.snapshot.billingAddress) {
      return badRequest('ลูกค้ารายนี้ยังไม่มีที่อยู่สำหรับออกเอกสาร — เพิ่มที่ฐานข้อมูลลูกค้าก่อน');
    }
    Object.assign(patch, picked.snapshot);
    }
  }

  // บรรทัด + ส่วนลด + VAT → คิดยอดใหม่
  let newLines = null;
  const moneyChanged = 'lines' in body || 'discountType' in body || 'discountValue' in body || 'vatRate' in body;
  if (moneyChanged) {
    newLines = 'lines' in body
      ? normalizeManualLines(body.lines || [])
      : (before.lines || []).map((l) => ({ ...l }));
    // FG ต้องเป็นของลูกค้าที่ออกใบให้ (มติผู้ใช้ 2026-08-17) — ตรวจเฉพาะสินค้าที่
    // "เพิ่งใส่เข้ามา" เทียบกับบรรทัดเดิมของใบ ไม่งั้นใบเก่าที่มีของข้ามลูกค้าค้างอยู่
    // จะบันทึกไม่ได้เลย แม้จะมาแก้แค่ VAT/หมายเหตุ
    const mismatched = await customerMismatchedLines(supabase, newLines, {
      customerId: before.customerId,
      previousLines: before.lines || [],
    });
    if (mismatched.length) return badRequest(customerMismatchMessage(mismatched));
    // ราคาบรรทัด FG ล็อกตาม master เสมอ (มติผู้ใช้ 2026-07-15) — แก้ราคาต้องแก้ที่
    // ฐานข้อมูลสินค้า; สินค้าที่หายจาก master คงราคาเดิมของใบ (fallback before.lines)
    newLines = await enforceMasterPrices(supabase, newLines, before.lines || []);
    // ใบว่าง (0 รายการ) เก็บเป็นร่างได้ — ใส่รหัส FG ทีหลัง; การส่ง/รับใบมี guard ยอด>0 อยู่แล้ว
    if (!newLines.length && (body.status === 'sent' || before.status === 'sent')) {
      return badRequest('ต้องมีอย่างน้อย 1 รายการก่อนส่งลูกค้า');
    }
    const discountType = 'discountType' in body
      ? (['percent', 'amount'].includes(body.discountType) ? body.discountType : null)
      : before.discountType;
    const discountValue = normalizeDiscountValue(
      discountType,
      'discountValue' in body ? body.discountValue : before.discountValue,
    );
    const vatRate = toMoney('vatRate' in body ? body.vatRate : before.vatRate, 0);
    const totals = quoteTotals(newLines, { discountType, discountValue, vatRate });
    Object.assign(patch, totals, { discountType, discountValue, vatRate });
  }

  // งวดชำระ — recompute ยอดงวดจากยอดรวมล่าสุด (patch.totalAmount ถ้ายอดเปลี่ยน, ไม่งั้น before)
  if ('paymentPlan' in body) {
    const pv = validatePaymentPlan(body.paymentPlan);
    if (!pv.ok) return badRequest(pv.error);
    const grand = 'totalAmount' in patch ? patch.totalAmount : before.totalAmount;
    const plan = normalizePaymentPlan(body.paymentPlan, grand);
    patch.paymentPlan = plan;
  } else if ('totalAmount' in patch && before.paymentPlan?.type === 'installment') {
    // ยอดเปลี่ยนแต่ไม่ได้ส่งแผนมา → คิดยอดงวดใหม่ตามสัดส่วน % เดิม
    const plan = normalizePaymentPlan(before.paymentPlan, patch.totalAmount);
    patch.paymentPlan = plan;
  }

  // Editing document content after it was sent creates a new draft state.
  // ที่อยู่บนใบนับเป็น "เนื้อหาเอกสาร" ด้วย — เปลี่ยนที่อยู่ = เอกสารคนละใบในสายตาลูกค้า
  // ภาษาเอกสารนับเป็นเนื้อหาด้วย — เปลี่ยนภาษา = ใบที่ลูกค้าได้รับหน้าตาคนละใบ
  // ⚠️ **ไม่มี `docLanguage` ในลิสต์นี้แล้ว** (มติผู้ใช้ 2026-08-27) — เปลี่ยนภาษาไม่ล้าง
  // การอนุมัติ · แทนที่จะรีเซ็ต ระบบไปตรึงไฟล์เอกสารของภาษาใหม่ให้แทน (ด้านล่าง)
  const contentChanged = moneyChanged || 'paymentPlan' in body || 'paymentTerms' in body
    || 'notes' in body || 'quoteDate' in body || 'validUntil' in body || addressPicked
    || 'referenceNote' in body;
  // แก้เนื้อหาที่กระทบเอกสาร/ยอด → ต้องยื่นและอนุมัติใหม่ (มติ 2026-07-18 + ข้อ 7 ของ
  // มติ 2026-07-25): ล้างการอนุมัติเดิม กลับเป็น **'not_submitted' = ร่างที่ต้องยื่นใหม่**
  // ไม่ใช่ 'pending' — หลักฐานการยื่นรอบก่อนผูกกับ fingerprint ของเนื้อหาที่เปลี่ยนไปแล้ว
  // จึงสิ้นผล (trigger 0151 ล้าง proposer pointer ให้เองที่ระดับ DB).
  // ใบ grandfather (not_required) มาไม่ถึงบล็อกนี้: ด่านด้านบนบล็อกไว้แล้ว เพราะมติ 2026-07-26
  // จัดใบพวกนั้นเป็น "อนุมัติแล้ว" → แก้ทับฉบับเดิมไม่ได้ ต้องออก Rev. (คนละทางกับ
  // คอมเมนต์เดิม 2026-07-18 ที่ตั้งใจดันใบเก่าเข้าระบบอนุมัติเมื่อถูกแก้ — ยกเลิกไปแล้ว).
  // ยกเว้น: ไม่แตะสถานะอนุมัติเมื่อแก้เฉพาะช่องที่ไม่ใช่เนื้อหา (ผู้รับผิดชอบ ฯลฯ).
  if (contentChanged) {
    patch.approvalStatus = 'not_submitted';
    patch.approvalFingerprint = null;
    patch.approvedAt = null;
    patch.approvedBy = null;
    patch.approvedByName = null;
  }
  const finalLines = newLines || before.lines || [];
  let finalQuote = { ...before, ...patch, lines: finalLines };
  if (contentChanged) {
    Object.assign(patch, before.status === 'sent' && body.status !== 'sent' ? { status: 'draft' } : {});
    finalQuote = { ...before, ...patch, lines: finalLines };
  }

  if ('status' in body && body.status === 'sent') {
    // ส่งลูกค้าได้ต่อเมื่อสถานะอนุมัติ = approved (หรือ not_required สำหรับใบ grandfather)
    // และ fingerprint ตรงกับเนื้อหาปัจจุบัน (แก้หลังอนุมัติ = ต้องอนุมัติใหม่). ใช้ค่าหลัง
    // patch: ถ้าคำขอนี้แก้เนื้อหาด้วย จะกลายเป็น pending → ส่งไม่ได้ (ต้องอนุมัติก่อน).
    const effApprovalStatus = 'approvalStatus' in patch ? patch.approvalStatus : before.approvalStatus;
    const effFingerprint = 'approvalFingerprint' in patch ? patch.approvalFingerprint : before.approvalFingerprint;
    const readiness = validateDocumentReadiness({
      action: 'send',
      status: before.status,
      lineCount: finalLines.length,
      approvalStatus: effApprovalStatus,
      approvalFingerprint: effFingerprint,
      currentFingerprint: quotationApprovalFingerprint(finalQuote, finalLines),
    });
    if (!readiness.ok) {
      // แยกข้อความ 2 ขั้น (mig 0155): ยังไม่ยื่น ≠ ยื่นแล้วรอเจ้าของดีล — ผู้ใช้ต้องรู้ว่า
      // ต้องกดปุ่มไหนต่อ ไม่ใช่รอเฉย ๆ
      if (effApprovalStatus === 'not_submitted') {
        return badRequest('ใบเสนอราคานี้ยังไม่ได้ยื่นอนุมัติ — กด "ยื่นอนุมัติ" ก่อนจึงจะส่งลูกค้าได้');
      }
      return badRequest(effApprovalStatus === 'pending'
        ? 'ใบเสนอราคานี้ยังไม่ได้รับการอนุมัติจากเจ้าของดีล — อนุมัติก่อนจึงจะส่งลูกค้าได้'
        : readiness.error);
    }
  }

  // เขียน lines ทุกครั้งที่ยอดเปลี่ยน (ไม่เฉพาะตอน client ส่ง lines) — enforceMasterPrices
  // อาจปรับราคา FG ตาม master แม้ client แก้แค่ VAT/ส่วนลด ให้แถวกับยอดตรงกันเสมอ
  const rows = newLines || null;
  const { error } = await supabase.rpc('save_quotation_content', {
    p_quote_id: id,
    p_content: patch,
    p_lines: rows,
  });
  if (error) return fail(error.message, 500);

  const after = await loadQuote(supabase, id);

  /* ⭐ เปลี่ยนภาษาของใบที่อนุมัติแล้ว = ตรึงเอกสารฉบับใหม่ในภาษานั้นทันที (มติ 2026-08-27)
     ถ้าไม่ตรึง ปุ่มพิมพ์ของใบที่อนุมัติแล้วจะเล่นฉบับตรึงเดิมซึ่งยังเป็นภาษาเก่า ⇒ จอบอก
     อังกฤษ แต่ไฟล์ที่ส่งลูกค้าเป็นไทย · best-effort แบบเดียวกับตอนอนุมัติ: ค่าถูกบันทึกไป
     แล้ว ตรึงพลาดต้องไม่ตอบ error กลับไป (เส้นทางพิมพ์มี fallback สร้างใหม่ให้อยู่แล้ว) */
  const languageChanged = 'docLanguage' in patch && patch.docLanguage !== before.docLanguage;
  if (languageChanged && after?.approvalStatus === 'approved') {
    try {
      const company = await getPublishedCompanyProfile(supabase);
      const snap = await reissueQuotationDocumentForLanguage(supabase, {
        quote: { ...after, lines: after.lines || finalLines },
        user,
        company,
      });
      const snapshotId = snap?.snapshot?.id;
      const html = snap?.artifact?.content;
      if (snapshotId && html) {
        await captureIssuedQuotationPdf(supabase, { quotationId: id, snapshotId, html });
      }
    } catch (reissueError) {
      console.error('reissue quotation for language failed', id, reissueError);
    }
  }

  await recordAudit({ user, action: 'update', entityType: 'quotation', entityId: id, before, after, summary: `แก้ไขใบเสนอราคา ${before.quoteNumber}`, request: req });
  return ok(after);
});

// DELETE — คนทั่วไปลบได้เฉพาะ draft. Superuser ลบสถานะอื่นได้ ยกเว้น accepted:
// accepted quotation เป็น canonical Actual source จึงห้าม hard-delete — เส้นทางย้อน
// ที่ถูกต้องคือ "ย้อนการรับ" (mig 0138 — ยังไม่มี SO) หรือย้อน Won ผ่านยกเลิก SO (0116).
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const before = await loadQuote(supabase, id);
  if (!before) return notFound('ไม่พบใบเสนอราคา');
  if (!before.deal || !inSalesEditScope(user, before.deal)) return forbidden();

  // force = ทางลัดผู้ดูแลระบบ (admin) ที่ลบใบ accepted ได้ทั้งที่เป็นแหล่งยอด Actual;
  // dryRun = พรีวิว Sale Order ที่จะ cascade หายตาม (admin เท่านั้น).
  const force = isForceRequest(req) && canForceDelete(user);
  const dryRun = isDryRun(req);
  if (dryRun) {
    if (!canForceDelete(user)) return forbidden();
    const preview = await quotationForcePreview(supabase, before);
    return ok({ dryRun: true, ...preview });
  }

  // ใบยื่นภาษีของ SO ลูก: FK RESTRICT ที่ break-glass ก็ข้ามไม่ได้ (force_delete_quotation
  // ลบ SO ลูกก่อนเสมอ → ชน orders.salesOrderId แล้ว error ดิบจาก Postgres หลุดออกหน้าเว็บ
  // เป็น 500). ดักก่อนทุกเส้นทาง ทั้งลบปกติและ ?force=1
  const filings = await exciseFilingsOfQuotation(supabase, id);
  if (filings.length) return fail(exciseFilingBlockMessage(filings, 'ใบเสนอราคา'), 409);

  /* 🐞 รูฝาแฝดของดีล (พบ 2026-08-28): `quotationForcePreview` ตรวจสัญญาและตอบ
     `blocked` ถูก แต่เส้นลบจริงไม่ตรวจ ⇒ `force_delete_quotation` ล้มด้วย 23503
     (`sales_contracts_quotationId_fkey`) แล้วตกลง catch ที่ตอบข้อความชี้ไป
     "ใบยื่นชำระภาษี" ทั้งที่ตัวขวางคือสัญญา
     ⚠️ ไม่ครอบด้วย force — สัญญาเป็นเอกสารผูกพันที่ break-glass ก็ข้ามไม่ได้ (mig 0278) */
  let quoteContracts;
  try {
    quoteContracts = await contractsOfQuotation(supabase, id);
  } catch (contractError) {
    // ตรวจไม่ได้ ≠ ไม่มี — หยุดไว้ก่อน ดีกว่าเดินหน้าลบแล้วพบทีหลังว่ามีสัญญาอยู่
    return fail(contractError.message, 500);
  }
  if (quoteContracts.length) return fail(contractBlockMessage(quoteContracts, 'ใบเสนอราคา'), 409);

  // หลักฐานลายเซ็น (mig 0125) เป็น immutable child ที่อ้างกลับมาใบนี้ — ใบที่เคย
  // อนุมัติ+เซ็นห้าม hard-delete แม้ pointer บนใบถูกล้างหลังแก้/ยกเลิก (Decision 0008).
  // FK RESTRICT + guard trigger บล็อกที่ DB อยู่แล้ว แต่ต้องแปลงเป็นข้อความแนะนำ
  // "ยกเลิก" ไม่ให้ raw FK error หลุด — บล็อกทั้ง path ปกติและ ?force=1 (break-glass
  // ก็ทำลายหลักฐานไม่ได้). เช็ก evidence table ตรง ๆ ไม่พึ่ง signatureEvidenceId บนใบ
  // เพราะ pointer ถูกล้างเมื่อออกจากสถานะ approved แต่แถวหลักฐานยังอยู่.
  const { data: evidence, error: evidenceError } = await supabase
    .from('document_signature_evidence')
    .select('id')
    .eq('quotationId', id)
    .limit(1)
    .maybeSingle();
  if (evidenceError) return fail(evidenceError.message, 500);
  const hasEvidence = Boolean(evidence?.id || before.signatureEvidenceId);
  // path ปกติยังห้ามลบเด็ดขาด (แปลง FK RESTRICT เป็นข้อความแนะนำ ไม่ให้ raw error หลุด);
  // ?force=1 ของผู้ดูแลระบบผ่านได้แล้ว (mig 0152 break-glass) — มติผู้ใช้ 2026-07-25
  if (hasEvidence && !force) {
    return fail('ลบถาวรไม่ได้: ใบเสนอราคานี้มีหลักฐานลายเซ็นและต้องเก็บเป็นหลักฐาน — ออก Rev. แทน; ใบที่รับ (Won) แล้วให้หัวหน้าทีม/แอดมินใช้ “ย้อนการรับ” บนหน้าใบเสนอราคา', 409);
  }

  if (!force) {
    // ใบที่ยื่นแล้วรออนุมัติ: `status` ยังเป็น 'draft' อยู่ ด่านล่างจึงปล่อยผ่าน — คนอนุมัติ
    // เปิดเข้ามาแล้วเอกสารหายไปพร้อมคำขอที่ค้างอยู่ ต้องดึงกลับหรือให้ตีกลับก่อน
    // (มติผู้ใช้ 2026-08-05) · ?force=1 ของผู้ดูแลระบบยังผ่านได้ตามเดิม
    if (isQuotationAwaitingApproval(before)) {
      return badRequest('ใบนี้กำลังรออนุมัติ — ลบไม่ได้: ผู้ยื่นให้ใช้ “ดึงกลับมาแก้ไข” หรือให้ผู้อนุมัติ “ตีกลับให้แก้ไข” ก่อน');
    }
    if (before.status === 'accepted') {
      return badRequest('ใบเสนอราคานี้เป็นแหล่งยอด Actual ของดีล — ลบไม่ได้: ถ้ามี SO อนุมัติแล้วใช้ “ยกเลิกใบสั่งขายพร้อมย้อนสถานะ” ที่หน้า SO; ถ้ายังไม่มี SO ให้หัวหน้าทีม/แอดมินใช้ “ย้อนการรับ” บนหน้าใบเสนอราคา');
    }
    const elevated = isSuperuser(user.role);
    if (!elevated) {
      if (before.status === 'closed') {
        return badRequest('ใบนี้ถูกปิดแล้ว (ดีลจบด้วยใบเสนอราคาฉบับอื่น) — ลบไม่ได้');
      }
      if (before.status !== 'draft') {
        return badRequest('ลบได้เฉพาะฉบับร่าง — ใบที่ส่งแล้วให้ออก Rev. แทน');
      }
    }
  }

  /* ⚠️ **อ่าน ref ของไฟล์ PDF ฉบับตรึงก่อนลบแถว** — `force_delete_quotation` ลบทั้ง
     issued_documents และ artifacts ในทรานแซกชันเดียว ⇒ หลังลบเสร็จไม่มีทางรู้แล้วว่า
     ไฟล์ไหนเป็นของใบนี้ (path มี snapshotId ที่หายไปพร้อมแถว) */
  /* ⚠️ **SO ลูกที่ cascade หายไปพร้อมใบ ต้องกวาดโฟลเดอร์ของมันด้วย** — หลักฐาน
     การชำระอยู่ใต้ `sales-orders/<id>/payments/` ซึ่งไม่ได้อยู่ใต้โฟลเดอร์ของใบ
     เสนอราคา · เส้นนี้ไม่ได้เดินผ่าน DELETE ของใบสั่งขาย จึงต้องเก็บ id ไว้ก่อนลบ */
  const childOrderIds = await (async () => {
    // ใบเดียวมี SO ไม่กี่ใบ แต่ยังต้องผ่าน fetchAllResult ตามด่าน check:rowcap —
    // จุดอ่านที่ไม่มีเพดานห้ามเพิ่มใหม่ ไม่ว่าจะมั่นใจแค่ไหนว่าแถวน้อย
    const { data } = await fetchAllResult(() => supabase
      .from('sales_orders').select('id')
      .eq('quotationId', id)
      .order('id', { ascending: true }));
    return (data || []).map((row) => row.id);
  })().catch(() => []);

  const issuedPdfRefs = await (async () => {
    const { data: snapshots } = await supabase
      .from('issued_documents').select('id').eq('documentType', 'quotation').eq('documentId', id);
    const ids = (snapshots || []).map((row) => row.id);
    if (!ids.length) return [];
    const { data: artifacts } = await supabase
      .from('issued_document_pdf_artifacts')
      .select('storageBucket, storagePath').in('issuedDocumentId', ids);
    return artifacts || [];
  })().catch(() => []);

  // force: ปลด logical ref (metadata.acceptedQuotationId) ที่ชี้มาใบนี้ก่อนลบ.
  // sales_orders.quotationId เป็น ON DELETE CASCADE จึงหายเองที่ระดับ DB.
  if (force) await cleanupQuotationOrphans(supabase, before);

  // ใบที่มีหลักฐาน/ฉบับตรึงต้องลบผ่าน RPC break-glass (mig 0152) — มันตั้ง session flag ให้
  // guard ยอม DELETE แล้วเก็บกวาดตามลำดับ FK: SO ลูก (ซึ่ง cascade เองไม่ได้เพราะลูกของมัน
  // เป็น RESTRICT) → ฉบับตรึง+ไฟล์แนบ → หลักฐาน → ตัวใบ. เส้นทางปกติยังลบตรงเหมือนเดิม
  //
  // ทุกการบังคับลบเดินผ่าน RPC เสมอ (ไม่ใช่แค่ใบที่มีหลักฐาน) เพราะ mig 0168 ให้ RPC
  // ถอยดีลออกจาก Won ในทรานแซกชันเดียวกับการลบ — ใบ accepted ที่ไม่มีหลักฐาน (ใบ
  // grandfather approvalStatus='not_required') ก็ต้องถอยดีลเหมือนกัน
  const { data: forceResult, error } = hasEvidence || force
    ? await supabase.rpc('force_delete_quotation', {
      p_id: id,
      p_actor_id: user.id || null,
      p_actor_name: user.name || null,
      p_actor_role: user.role || null,
    })
    : await supabase.from('quotations').delete().eq('id', id);
  if (error) {
    // ตาข่ายชั้นสอง: ยังมีลูกที่ FK RESTRICT อยู่ (เช่นใบยื่นภาษีที่เพิ่งถูกสร้างหลังเราตรวจ)
    // — ห้ามปล่อยข้อความ Postgres ดิบออกหน้าเว็บ (ชื่อ constraint/ตาราง/ค่าในแถวหลุด)
    if (isForeignKeyViolation(error)) {
      console.error(`[quotation delete ${id}] foreign key violation:`, error);
      return fail('ลบถาวรไม่ได้: ยังมีเอกสารอื่นอ้างใบเสนอราคานี้อยู่ (เช่น ใบยื่นชำระภาษี) — กรุณาจัดการเอกสารปลายทางก่อน', 409);
    }
    return fail(error.message, 500);
  }
  // ใบไม่มีเธรดของตัวเองแล้ว (มติ 2026-08-04) แต่แถวเก่าก่อนหน้านั้นยังค้างในตาราง
  // กลาง (polymorphic ไม่มี FK) — กวาดตอนลบใบต่อไป ไม่งั้นค้างเป็นขยะถาวร
  await purgeUpdates(supabase, 'quotation', id);
  /* ไฟล์หลักฐานใน bucket ไม่มี FK ให้ cascade — กวาดทั้งโฟลเดอร์ของใบนี้
     (หลักฐาน Won + เอกสารยืนยันคำสั่งซื้อของ SO ที่ออกจากใบนี้ ซึ่งพักไฟล์ไว้ใต้ใบ
     เสนอราคา) · SO ลูกถูก cascade ไปพร้อมใบอยู่แล้ว ⇒ ไม่มีใครอ้างไฟล์พวกนี้อีก
     ⚠️ ไฟล์ PDF ฉบับตรึงอยู่คนละ bucket และผูกกับ issued_document_pdf_artifacts —
     เก็บกวาดแยกด้านล่าง เพราะต้องอ่านแถวก่อนที่ RPC จะลบทิ้ง */
  await purgePrivateEvidence(supabase, 'quotations', id);
  for (const orderId of childOrderIds) await purgePrivateEvidence(supabase, 'sales_orders', orderId);
  await removeEvidenceRefs(supabase, issuedPdfRefs);
  const summary = force
    ? `ลบใบเสนอราคา ${before.quoteNumber} (สถานะ ${before.status} — บังคับลบ สิทธิ์ผู้ดูแลระบบ)`
    : (isSuperuser(user.role) && before.status !== 'draft'
      ? `ลบใบเสนอราคา ${before.quoteNumber} (สถานะ ${before.status} — สิทธิ์ผู้ดูแลระบบ)`
      : `ลบใบเสนอราคา (ร่าง) ${before.quoteNumber}`);
  await recordAudit({
    user, action: 'delete', entityType: 'quotation', entityId: id, before,
    summary, request: req,
  });
  // ถอยดีลออกจาก Won ต้องมีร่องรอยของตัวเอง — ไม่ใช่ผลข้างเคียงที่เงียบ (บทเรียน
  // 2026-07-26: ลบใบ accepted แล้วดีลค้าง Won โดยไม่มีใครรู้ จนเปิดใบใหม่ไม่ได้)
  if (forceResult?.dealReverted && before.deal) {
    await recordAudit({
      user,
      action: 'update',
      entityType: 'sales_deal',
      entityId: before.deal.id,
      before: before.deal,
      after: forceResult.deal,
      summary: `ถอยดีล ${dealAuditLabel(before.deal)} ออกจาก Won — ลบใบเสนอราคา ${before.quoteNumber} ที่รับแล้วถาวร`,
      request: req,
    });
  }
  return ok({ ok: true, forced: force, dealReverted: Boolean(forceResult?.dealReverted) });
});
