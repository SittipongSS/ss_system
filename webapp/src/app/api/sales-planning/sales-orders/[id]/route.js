import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { purgeUpdates } from '@/lib/master/updates';
import { moveSalesOrderAttachments, purgeSalesOrderFiles } from '@/lib/sales/salesOrderAttachmentAccess';
import { appendDocumentEvent } from '@/lib/sales/documentThread';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import {
  DEFAULT_EVIDENCE_BUCKET, salesOrderConfirmationGate, validateOrderConfirmation,
} from '@/lib/sales/orderConfirmationDocs';
import { missingStoredEvidence, purgePrivateEvidence, removeEvidenceRefs } from '@/lib/upload/privateEvidence';
import { canEditCustomerBillingRule, departmentOf } from '@/lib/permissions';
import {
  canEditSalesPlanning,
  canViewSalesPlanning,
  inSalesEditScope,
  inSalesViewScope,
} from '@/lib/salesPlanning';
import {
  canHardDeleteSalesOrder,
  canIssueSalesOrderRevision,
  canRevokeSalesOrderApproval,
  canSubmitSalesOrder,
  canWithdrawSalesOrderSubmission,
  cancelReasonLabel,
  canSwitchSalesOrderDocLanguage,
  isForeignKeyViolation,
  isSalesOrderReviewer,
  isValidCancelReasonCode,
  isValidReversalTarget,
  salesOrderActionNeedsEditScope,
  salesOrderCancelNeedsReviewer,
  salesOrderRestoreBlock,
  salesOrderRevisionChainDeleteBlock,
} from '@/lib/sales/salesOrderWorkflow';
import { documentWorkflowError } from '@/lib/sales/documentWorkflowErrors';
import { parseDeliveryDueDate } from '@/lib/sales/salesOrderDeliveryDue';
import {
  freezeInstallments, historicalCancelSettleReady, installmentMoveColumnError, loadCarrySources, loadInstallments, loadMovedOut,
} from '@/lib/sales/salesOrderInstallmentsStore';
import { withLiveAmounts } from '@/lib/sales/salesOrderPayments';
import {
  cancelledMoneyRestoreBlock, installmentsTotalMismatch, movedOutDeleteBlock, paymentNotRequired,
  revisionAuditSummary,
} from '@/lib/sales/salesOrderPayments';
import { financeActionError } from '@/lib/sales/salesOrderFinanceApproval';
import { resolveExpectedUpdatedAt } from '@/lib/sales/documentConcurrency';
import { salesOrderApprovalFingerprint } from '@/lib/sales/salesOrderApprovalFingerprint';
import {
  adminOverrideReasonError,
  isSalesOrderSelfApproval,
  normalizeAdminOverrideReason,
} from '@/lib/sales/salesOrderApprovalOverride';
import {
  approveSalesOrderWithSignatureEvidence,
  financeApproveSalesOrderWithSignatureEvidence,
  signatureEvidenceErrorResponse,
  submitSalesOrderWithSignatureEvidence,
} from '@/lib/admin/signatureEvidence';
import { loadActiveSignatureAsset, loadSignatureImageDataUri } from '@/lib/sales/issuedQuotationSnapshot';
import { captureIssuedSalesOrderSnapshot } from '@/lib/sales/issuedSalesOrderSnapshot';
import { getPublishedCompanyProfile } from '@/lib/admin/organizationSettings';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { fillCustomerSnapshotFromMaster } from '@/lib/sales/customerSnapshotFallback';
import { fillMissingLineCategories } from '@/lib/sales/quoteLines';
import {
  exciseFilingBlockMessage, exciseFilingsOfSalesOrder, isDryRun, isForceRequest, salesOrderForcePreview,
} from '@/lib/forceDelete';
import { fmtMoney } from '@/lib/format';
import { projectWriteBlockedError } from '@/lib/pm/projectClose';
import { loadScoped } from '@/lib/scopedRow';
import { serviceContractLinkError } from '@/lib/sales/serviceContractLink';
import { serviceRoundsEditError, validateServiceRoundsPatch } from '@/lib/sales/serviceRoundsEntry';
import {
  HISTORICAL_CANCEL_SETTLE_STUCK, HISTORICAL_CORRECTION_PATH, historicalCancelBlock, historicalCancelNoteError,
  historicalCancelOpening, historicalCancelSettleBlock, historicalDeleteBlock, historicalOpeningSettled, isHistoricalOrder,
} from '@/lib/sales/historicalOrders';
import { historicalOpeningVoidSummary } from '@/lib/sales/historicalOrderCopy';
import {
  approveHistoricalOrder, historicalContractVoided, loadHistoricalOrderExtras, submitHistoricalOrder,
  voidedContractLabel,
} from '@/lib/sales/historicalOrderWorkflow';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import {
  activeDocumentsForOrder, moveDocumentsToRevisedOrder, voidDocumentsByIds, voidDocumentsForOrder,
} from '@/lib/sales/productSpecStore';

const soAmount = (o) => `${fmtMoney(o?.actualAmount)} บาท`;

/* ── จังหวะของเอกสาร FM-SA-04 ที่ตามหลัง SO (mig 0370 · docs/fm-sa-04-document-model.md) ──
   · SO ยกเลิก ⇒ เอกสารทุกใบของ SO นั้นเป็น void (เลขที่ไม่นำกลับมาใช้)
   · SO ออก Rev ⇒ เอกสารย้ายไปผูกใบใหม่ เลขที่เดิม (approved ⇒ Rev+1 ร่าง · รออนุมัติ ⇒ ถอยเป็นร่าง)
   ⚠️ เรียก **หลัง** ที่ SO บันทึกสำเร็จแล้วเท่านั้น · hook ล้ม = SO ยังสำเร็จ แต่ต้องตอบ `warning`
      และลง audit (ไม่เงียบ) — เอกสารที่ค้างผูก SO ที่ยกเลิก/ถูกแทนแล้ว คือกระดาษที่เดินด่านต่อไม่ได้
      และไม่มีใครรู้ว่าต้องไปเก็บ
   🪤 ห่อ try — store คืน `{ error }` เสมอก็จริง แต่ hook ต้องไม่มีทางทำให้ action ของ SO ที่
      บันทึกไปแล้วตอบ 500 (คนจะกดซ้ำ) */
async function voidSpecDocumentsAfterCancel({ supabase, user, req, order }) {
  const reason = `ใบสั่งขาย ${order?.orderNumber || order?.id} ถูกยกเลิก`;
  let res;
  try {
    res = await voidDocumentsForOrder(supabase, { salesOrderId: order.id, reason, user });
  } catch (error) {
    res = { error: error?.message || String(error) };
  }
  if (res.error) {
    const warning = `ยกเลิกใบสั่งขายแล้ว แต่ยกเลิกเอกสารใบสเปคสินค้าของใบนี้ไม่สำเร็จ: ${res.error} — แจ้งผู้ดูแลระบบ`;
    await recordAudit({
      user, action: 'update', entityType: 'sales_order', entityId: order.id,
      before: null, after: { specDocumentHookError: res.error },
      summary: `⚠️ void FM-SA-04 documents of ${order?.orderNumber || order.id} FAILED: ${res.error}`, request: req,
    });
    return warning;
  }
  for (const doc of res.documents || []) {
    await recordAudit({
      user, action: 'update', entityType: 'product_spec_document', entityId: doc.id,
      before: { status: 'active' }, after: { status: 'void', voidReason: reason },
      summary: `void ${doc.docNo}: ${reason}`, request: req,
    });
  }
  return null;
}

/* ผู้ดูแลระบบบังคับลบ SO ⇒ เอกสาร FM-SA-04 ที่ยัง active ของใบนั้นเป็น void (เหมือนทางยกเลิก SO)
   🐞 เดิมไม่มี hook ทางนี้ ⇒ FK SET NULL ปลด SO/บรรทัดออกเงียบ ๆ เอกสารยัง active พร้อม Rev ที่อนุมัติแล้ว
      (เลขที่ส่งลูกค้าไปแล้ว) ไม่มี SO ไม่มีรอยใน audit และหน้า SO ที่จะโชว์แถว "บรรทัดถูกถอด" ก็ไม่มีแล้ว
   ⚠️ id ต้องจดไว้ **ก่อน** ลบ (หลังลบหาตาม SO ไม่ได้อีก) แต่ void **หลัง** ลบสำเร็จ — ลบล้มแล้วเอกสาร
      ของ SO ที่ยังอยู่ถูก void ไปก่อน = ย้อนไม่ได้ (void คือปลายทาง)
   ⚠️ void ล้มหลังลบสำเร็จ = การลบยังสำเร็จ แต่ต้องตอบ warning + audit (ไม่เงียบ) */
async function voidSpecDocumentsAfterForceDelete({ supabase, user, req, order, documents }) {
  if (!documents?.length) return null;
  const reason = `ใบสั่งขาย ${order?.orderNumber || order?.id} ถูกลบถาวร`;
  let res;
  try {
    res = await voidDocumentsByIds(supabase, { documentIds: documents.map((doc) => doc.id), reason, user });
  } catch (error) {
    res = { error: error?.message || String(error) };
  }
  if (res.error) {
    await recordAudit({
      user, action: 'update', entityType: 'sales_order', entityId: order.id,
      before: null, after: { specDocumentHookError: res.error, documents },
      summary: `⚠️ void FM-SA-04 documents of deleted ${order?.orderNumber || order.id} FAILED: ${res.error}`, request: req,
    });
    return `ลบใบสั่งขายแล้ว แต่ยกเลิกเอกสารใบสเปคสินค้าของใบนี้ไม่สำเร็จ (${documents.map((doc) => doc.docNo).join(', ')}): ${res.error} — แจ้งผู้ดูแลระบบ`;
  }
  for (const doc of res.documents || []) {
    await recordAudit({
      user, action: 'update', entityType: 'product_spec_document', entityId: doc.id,
      before: { status: 'active', salesOrderId: order.id }, after: { status: 'void', voidReason: reason },
      summary: `void ${doc.docNo}: ${reason}`, request: req,
    });
  }
  return null;
}

async function moveSpecDocumentsAfterRevise({ supabase, user, req, oldOrder, newOrder }) {
  let res;
  try {
    res = await moveDocumentsToRevisedOrder(supabase, { oldOrderId: oldOrder.id, newOrder, user });
  } catch (error) {
    res = { error: error?.message || String(error) };
  }
  const label = `${oldOrder?.orderNumber || oldOrder.id} → ${newOrder?.orderNumber || newOrder?.id}`;
  if (res.error) {
    await recordAudit({
      user, action: 'update', entityType: 'sales_order', entityId: newOrder?.id || oldOrder.id,
      before: null, after: { specDocumentHookError: res.error },
      summary: `⚠️ move FM-SA-04 documents ${label} FAILED: ${res.error}`, request: req,
    });
    return `ออก Rev. ใบสั่งขายแล้ว แต่ย้ายเอกสารใบสเปคสินค้าไปใบใหม่ไม่สำเร็จ: ${res.error} — แจ้งผู้ดูแลระบบ`;
  }
  // ใบที่ย้ายสำเร็จ (outcome ≠ failed/skipped) ลงประวัติรายใบ · ใบที่ล้มอยู่ในก้อน warnings ข้างล่าง
  for (const doc of (res.documents || []).filter((row) => !['failed', 'skipped'].includes(row.outcome))) {
    await recordAudit({
      user, action: 'update', entityType: 'product_spec_document', entityId: doc.id,
      before: { salesOrderId: oldOrder.id }, after: { salesOrderId: newOrder.id, outcome: doc.outcome },
      summary: `move ${doc.docNo} with SO revise ${label} (${doc.outcome})`, request: req,
    });
  }
  if (!res.warnings?.length) return null;
  await recordAudit({
    user, action: 'update', entityType: 'sales_order', entityId: newOrder?.id || oldOrder.id,
    before: null, after: { specDocumentWarnings: res.warnings, documents: res.documents },
    summary: `⚠️ move FM-SA-04 documents ${label}: ${res.warnings.join(' · ')}`, request: req,
  });
  return `ออก Rev. ใบสั่งขายแล้ว แต่เอกสารใบสเปคสินค้าบางใบต้องตรวจ: ${res.warnings.join(' · ')}`;
}

/* ไฟล์แนบเพิ่มของใบ (แท็บ "เอกสาร") ย้ายไปฉบับ Rev. — ล้ม = Rev. ยังสำเร็จ + warning + audit
   (Rev. commit ไปแล้วใน RPC · ย้อนไม่ได้ ⇒ บอกให้ชัดว่าไฟล์ค้างอยู่ใบไหน ผู้ดูแลย้ายตามได้) */
async function moveAttachmentsAfterRevise({ supabase, user, req, oldOrder, newOrder }) {
  const res = await moveSalesOrderAttachments(supabase, oldOrder.id, newOrder.id);
  const label = `${oldOrder?.orderNumber || oldOrder.id} → ${newOrder?.orderNumber || newOrder.id}`;
  if (res.error) {
    await recordAudit({
      user, action: 'update', entityType: 'sales_order', entityId: newOrder.id,
      before: null, after: { attachmentMoveError: res.error, fromOrderId: oldOrder.id },
      summary: `⚠️ move attachments ${label} FAILED: ${res.error}`, request: req,
    });
    return `ออก Rev. ใบสั่งขายแล้ว แต่ย้ายไฟล์ในแท็บเอกสารไปใบใหม่ไม่สำเร็จ (ยังอยู่ที่ ${oldOrder?.orderNumber || oldOrder.id}): ${res.error} — แจ้งผู้ดูแลระบบ`;
  }
  if (res.moved) {
    await recordAudit({
      user, action: 'update', entityType: 'sales_order', entityId: newOrder.id,
      before: { attachmentsOn: oldOrder.id }, after: { attachmentsOn: newOrder.id, moved: res.moved },
      summary: `move ${res.moved} attachment(s) with SO revise ${label}`, request: req,
    });
  }
  return null;
}

/* ใบสั่งขายย้อนหลัง (mig 0360 → 0374) — CHECK sales_orders_origin_shape ห้ามย้อนอนุมัติ/ออก Rev. อยู่แล้ว ตอบไทยก่อนถึงฐาน
   ⭐ ทางแก้หลังอนุมัติมีทางเดียว (มติ 22/09 · ผู้ยกเลิกขยายเป็นผู้จัดการฝ่ายขายที่อนุมัติได้ มติ 24/09): ยกเลิกใบ แล้วฝ่ายขายคีย์ใหม่
     — ประโยคกลางของทุกทางตัน */
const HISTORICAL_NO_REVISION = `ใบสั่งขายย้อนหลังย้อนการอนุมัติ/ออก Rev. ไม่ได้ — ${HISTORICAL_CORRECTION_PATH}`;

export const dynamic = 'force-dynamic';

/* ลูกค้าของใบ — รหัส AR (หัวหน้าใบ) + **รอบวางบิล** (mig 0389 · แผงงวดบรรทัด "รอบวางบิล: …" · ตัวเลือกรอบของงวด)
   ⭐ รอบอ่านสดจากทะเบียนทุกครั้ง (ไม่ประทับลงใบ) — แก้รอบที่ทะเบียนแล้วชิปรอบของงวดถัดไปเปลี่ยนตาม ·
     วันที่บันทึกลงงวดไปแล้วไม่ขยับ (ไม่มีทางเติม/คิดวันย้อนหลังให้ใบเก่าเอง · มติข้อ 10)
   ⚠️ ก่อนรัน 0389 ไม่มีคอลัมน์ (42703) ⇒ ถอยไปอ่านชุดเดิม (แพตเทิร์น loadListInstallments) + บอกจอว่าฐานยังไม่พร้อม
     (`billingSchemaReady: false` ⇒ แผงซ่อนคอลัมน์วันวางบิล/ตัวเลือกรอบ แทนที่จะชวนตั้งรอบที่ยังบันทึกไม่ได้)
     · อ่านพลาดอย่างอื่น = ไม่มีแถวลูกค้า (พฤติกรรมเดิม — หัวใบขึ้นแค่ชื่อ) แต่ไม่โทษ migration
   ⭐ `team, teams` = ทีมที่ดูแลลูกค้า — GET ถาม `canEditCustomerBillingRule` (ตัวเดียวกับ API ตั้งรอบ) ส่งเป็นธง
     `canEditBillingRule` ให้แผงเลือกคำ "ตั้งรอบวางบิล" (คนที่ตั้งได้) หรือ "ดูที่ทะเบียนลูกค้า" (ไม่มีสิทธิ์ = ไม่ชวนตั้ง)
     ⚠️ ขาดสองช่องนี้ = `caretakerTeamsOf` เห็นลูกค้าไร้ทีม ⇒ ถือเป็นของกลาง ⇒ ฝ่ายขายทุกทีมได้ธงจริงผิด ๆ */
async function loadCustomerOfOrder(supabase, customerId) {
  if (!customerId) return { customer: null, billingSchemaReady: true };
  const withRule = await supabase.from('customers').select('id, arCode, team, teams, "billingRule"').eq('id', customerId).maybeSingle();
  if (withRule.error?.code !== '42703') return { customer: withRule.data || null, billingSchemaReady: true };
  const legacy = await supabase.from('customers').select('id, arCode, team, teams').eq('id', customerId).maybeSingle();
  return { customer: legacy.data || null, billingSchemaReady: false };
}

/* `extras` = แนบของเสริมของใบย้อนหลัง (โซน · ไฟล์เอกสารแทนสัญญา · หลักฐานงวดยกมา · รอบขายของใบอื่น) — เฉพาะ GET
   ที่จอใช้โชว์/ป้อนโมดัลอนุมัติ · action ใน PATCH/DELETE ไม่ต้องจ่ายค่าคิวรีชุดนั้น */
async function loadOrder(supabase, id, { extras = false } = {}) {
  const { data: order, error } = await supabase
    .from('sales_orders')
    .select('*, lines:sales_order_lines(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  const [{ data: deal }, { data: quotation, error: quotationError }, { data: project }, { data: signatureEvidence, error: signatureEvidenceError }, { data: scentRequest }, { customer, billingSchemaReady }] = await Promise.all([
    /* `line` = สายธุรกิจ (PRODUCT|SERVICE|null) — หน้าใบใช้ตัดสินว่าเป็น "ใบมีรอบบริการ"
       ไหม (มติ 2026-08-30: สาย SERVICE + มีบรรทัดหมวด 02-001 ≥1) ผ่าน `orderHasServiceRounds`
       ⚠️ ตัวจริงของค่าอยู่ที่โครงการ ดีลเป็นสำเนาที่ใช้ตอนยังไม่มีโครงการ — ต้องดึงทั้งคู่
       ⚠️ เพิ่มชื่อคอลัมน์ที่นี่ปลอดภัยกับฉบับตรึง: `buildIssuedSalesOrderPayload` หยิบจาก
       deal/project แค่ `title`/`name` แบบระบุชื่อฟิลด์ ⇒ fingerprint ไม่ขยับ */
    supabase.from('sales_deals').select('id, title, stage, dealType, line, team, ownerId, ownerName, customerName, projectId').eq('id', order.dealId).maybeSingle(),
    /* 🪤 คู่ภาษาต้องมาด้วยกันเสมอ — `salesOrderPrint`/`issuedSalesOrderSnapshot` เขียน
       ทางถอย `order.xxxEn || quotation.xxxEn` ไว้ ลืมชื่อคอลัมน์ที่นี่ = ฝั่งขวาเป็น
       undefined เสมอ แล้วใบอังกฤษพิมพ์ชื่อ/ที่อยู่ไทยเงียบ ๆ โดยไม่มีอะไรฟ้อง */
    supabase.from('quotations').select('id, quoteNumber, status, wonDocType, wonDocDate, wonDocNo, wonAttachments, customerId, customerTaxId, "customerNameEn", billingAddress, "billingAddressEn", shippingAddress, "shippingAddressEn", branchCode, contactName, contactPhone, paymentPlan, paymentTerms, discountType, discountValue').eq('id', order.quotationId).maybeSingle(),
    order.projectId
      // closeStatus: ด่าน B3 ใช้ตัดสินว่าออก Rev. ใบใหม่ได้ไหม (หน้าเว็บใช้ซ่อนปุ่มด้วย)
      // line: สายธุรกิจตัวจริง (โครงการเป็นเจ้าของค่า ดีลเป็นสำเนา) — ดู `orderBusinessLineOf`
      ? supabase.from('projects').select('id, code, name, line, closeStatus').eq('id', order.projectId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('document_signature_evidence').select('id').eq('salesOrderId', id).limit(1).maybeSingle(),
    // ⭐ คำร้องพัฒนากลิ่นที่เปิดจากใบนี้ — หน้า SO ใช้ตัดสินว่าโชว์ปุ่ม "เปิดคำร้อง"
    // หรือลิงก์ไปใบที่เปิดไว้แล้ว
    //
    // ⚠️ **เงื่อนไขต้องตรงกับ `dept_requests_pdr_so_uk` (mig 0219) เป๊ะ ๆ** —
    // `kind = 'scent_dev'` + `status <> 'cancelled'` · หลวมกว่านี้ = ปุ่มหายทั้งที่
    // ใบเก่าถูกยกเลิกไปแล้วและเปิดใหม่ได้ · แคบกว่านี้ = กดแล้วชน unique violation
    // ที่ DB ซึ่งเด้ง error ดิบภาษาอังกฤษหลังกรอก PDR จนจบแล้ว
    //
    // ⚠️ อ่านด้วย service-role โดยตั้งใจ — ทะเบียนคำร้องมีขอบเขตของตัวเอง (ผู้ขอเห็น
    // เฉพาะของตัวเอง) ⇒ ถามผ่านทางนั้นจะได้ "ไม่มีใบ" ทั้งที่เพื่อนร่วมทีมเปิดไปแล้ว
    // แล้วปุ่มจะโชว์ให้กดจนไปตายที่ DB · ที่คืนออกไปมีแค่ เลขที่/สถานะ/id
    supabase.from('dept_requests').select('id, docNo, status')
      .eq('salesOrderId', id).eq('kind', 'scent_dev').neq('status', 'cancelled')
      .maybeSingle(),
    /* รหัส AR ของลูกค้า — หัวหน้ารายละเอียดต้องขึ้น `AR-306 · ชื่อ` (มติผู้ใช้ 2026-08-21)
       ⚠️ อ่านสดจากทะเบียน ไม่ใช่ประทับลงใบ: ชื่อบนใบเป็นหลักฐาน ณ วันออก ส่วนรหัส
       เป็นตัวชี้กลับทะเบียน ต้องเป็นค่าปัจจุบันเสมอ (กติกาเดียวกับ lib/master/customerAr.js)
       + รอบวางบิลของลูกค้า (mig 0389) ให้แผงงวด — ดู loadCustomerOfOrder */
    loadCustomerOfOrder(supabase, order.customerId),
  ]);
  if (signatureEvidenceError) throw signatureEvidenceError;
  /* ⚠️ อ่าน QT พลาด ≠ ใบไม่มี QT (review R1) — เดิมกลืน error ⇒ quotation = null แล้วด่านที่พึ่งสถานะ QT
     (ยื่นอนุมัติ · กู้คืน `salesOrderRestoreBlock` · ล็อกงวดของร่างที่ QT ตาย) ตอบผิดเหตุ ฟังเหมือนถาวร */
  if (quotationError) throw quotationError;
  const { data: revisionHistory, error: revisionHistoryError } = await supabase
    .from('sales_orders')
    .select('id, orderNumber, revisionNo, status, orderDate, createdAt')
    .eq('baseNumber', order.baseNumber || order.orderNumber)
    .order('revisionNo', { ascending: false });
  if (revisionHistoryError) throw revisionHistoryError;

  /* ⭐ คำร้องขอเอกสารการเงินของ **ใบเสนอราคาเดียวกัน** (B-5) — คำร้องเกิดก่อนงวดเสมอ
     (ของจริงขอใบวางบิล "50% ก่อนผลิต" ตั้งแต่ยังไม่มีใบสั่งขาย) ⇒ หน้าใบต้องโชว์ว่ามี
     คำร้องอะไรรออยู่บ้าง แล้วให้ SA กดแนบเข้ากับงวดเอง — **ไม่เดาจับคู่ให้**
     ⚠️ อ่านด้วย service-role ด้วยเหตุผลเดียวกับคำร้องพัฒนากลิ่นข้างบน — ที่คืนออกไป
     มีแค่เลขที่/สถานะ/ยอด/เลขเอกสารที่บัญชีออกให้ ซึ่งเป็นข้อมูลของงานใบนี้อยู่แล้ว */
  let billingRequests = [];
  if (order.quotationId) {
    const { data: reqRows } = await supabase
      .from('dept_requests')
      .select('id, docNo, status, title, "billAmount", "billPercent", items:dept_request_items(id, "docType", "docNumber", "docDueDate")')
      .eq('quotationId', order.quotationId).eq('kind', 'billing_doc')
      .neq('status', 'cancelled')
      .order('createdAt', { ascending: true });
    billingRequests = reqRows || [];
  }

  /* ── สัญญาบริการของใบ + ตัวเลือกของดีลเดียวกัน (mig 0324) ─────────────────
     ⭐ โหลดมากับใบเลย ไม่ให้การ์ดต้องยิงรอบสอง (แพตเทิร์นเดียวกับงวดชำระ)
     ⚠️ ตัวเลือกดึง **ทั้งดีล** แล้วให้ `serviceContractOptions` กรองเอง — ด่านว่าใบไหน
       ผูกได้อยู่ที่ lib ตัวเดียว ไม่ใช่เขียนเงื่อนไขซ้ำใน query
     ⚠️ ไม่บล็อกถ้าโหลดไม่ได้ — ใบสั่งขายต้องเปิดดูได้เสมอ สัญญาเป็นข้อมูลประกอบ
     ⭐ ชนิด/เลขอ้างอิงของเอกสารภายนอก + metadata (0374) — เอกสารแทนสัญญาของใบย้อนหลังชี้กลับมาใบด้วย
       `metadata.historicalSalesOrderId` · การ์ดสัญญา/ผลของปุ่มยกเลิก (historicalCancelEffect) อ่านจากตรงนี้ */
  let serviceContract = null;
  let contractChoices = [];
  try {
    const { data: rows } = await supabase.from('sales_contracts')
      .select('id, "contractNo", kind, status, "dealId", "effectiveDate", "expiryDate", source, '
        + '"externalDocKind", "externalRef", "contractDate", "signedFileId", metadata')
      .eq('dealId', order.dealId)
      .order('createdAt', { ascending: false });
    contractChoices = rows || [];
    serviceContract = contractChoices.find((c) => c.id === order.serviceContractId) || null;
  } catch { contractChoices = []; }

  /* ── งวดชำระ (mig 0245) — โหลดมากับใบเลยเพื่อไม่ให้การ์ด "การชำระ" ต้องยิงรอบสอง
     ⭐ งวดร่างของใบปกติเดินตามแผนของ QT สด ๆ (B-4) — ทับตอนอ่านที่เดียวกับ route ของงวด
     ⛔ **ใบย้อนหลังไม่ทับ** (0374) — ไม่มีใบเสนอราคา ⇒ แผนว่างกลายเป็น "ชำระเต็มจำนวน" 100% ทับงวดที่คีย์
        (งวดของใบนี้ยังไม่หยุดยอดจน AE Sup อนุมัติ ⇒ ตัวทับจะเห็นทุกแถวเป็นร่าง) */
  const historical = isHistoricalOrder(order);
  let installmentsError = null;
  const installmentRows = await loadInstallments(supabase, order.id)
    .catch((error) => { installmentsError = error; return []; });

  /* ⭐ คำร้องวางบิลที่งวดผูกอยู่ แต่เป็นของ **ใบเสนอราคาอื่น** (review F3) — งวดที่ยกมาจากใบที่ยกเลิก (0378) พก billingRequestId
     ของใบเดิมมาด้วย และใบใหม่ของดีลเดียวกันมาจาก QT คนละใบเสมอ (sales_orders.quotationId UNIQUE) ⇒ ค้นด้วย QT ของใบนี้ไม่เจอ
     แผงจึงขึ้น "คำร้องขอเอกสารถูกลบไปแล้ว" ทั้งที่คำร้องยังอยู่ = ชวนออกคำร้องซ้ำให้เงินที่วางบิล/เก็บไปแล้ว
     ⇒ อ่านเพิ่มด้วย id (แบ่งก้อน · เงื่อนไขชุดเดียวกับข้างบน) · อ่านพลาด = บอกบนแผง (`billingRequestsError`) ไม่ใช่ "ถูกลบ" */
  let billingRequestsError = null;
  const knownRequestIds = new Set(billingRequests.map((r) => r.id));
  const linkedRequestIds = [...new Set(installmentRows.map((r) => r?.billingRequestId)
    .filter((requestId) => requestId && !knownRequestIds.has(requestId)))];
  if (linkedRequestIds.length) {
    /* ⭐ **รวมคำร้องที่ยกเลิกแล้วด้วย** (กำหนดวางบิล 26/09) — ยกเลิกคำร้องไม่ล้างลิงก์บนงวด ⇒ ถ้ากรองทิ้ง แผงขึ้น
       "คำร้องขอเอกสารถูกลบไปแล้ว" ทั้งที่แค่ยกเลิก และบอกไม่ได้ว่าลิงก์นี้ตายเพราะอะไร · ตัวตัดสิน "ขอใบวางบิลแล้ว"
       (installmentBillingRequested) ตัดคำร้องที่ตายทิ้งเอง · เฉพาะ **id ที่งวดผูกอยู่** — ชุดตามใบเสนอราคาข้างบน
       (ตัวเลือกของ "แนบคำร้องที่ขอไว้แล้ว") ยังตัดใบที่ยกเลิกเหมือนเดิม */
    const { data: linkedRows, error: linkedError } = await fetchInChunks(linkedRequestIds, (chunk) => fetchAllResult(() => supabase
      .from('dept_requests')
      .select('id, docNo, status, title, "billAmount", "billPercent", "quotationId", items:dept_request_items(id, "docType", "docNumber", "docDueDate")')
      .in('id', chunk).eq('kind', 'billing_doc')
      .order('id', { ascending: true })));
    if (linkedError) {
      console.error('[sales-order] โหลดคำร้องวางบิลของงวดที่ยกมาไม่สำเร็จ:', id, linkedError);
      billingRequestsError = `อ่านคำร้องขอเอกสารของงวดไม่สำเร็จ: ${linkedError.message || linkedError}`;
    } else {
      billingRequests = [...billingRequests, ...(linkedRows || [])];
    }
  }

  /* ── เงินค้างจากใบที่ยกเลิก (PR3 · mig 0378 · มติ D4) ────────────────────────────────────────────────
     · ใบ pipeline ที่ยังเดินอยู่: ใบที่ยกเลิกของดีลเดียวกันที่มีเงินค้าง — ปุ่ม "ยกเงินจากใบที่ยกเลิก" + คำเตือนในโมดัลอนุมัติ
     · ใบที่ยกเลิก: แถวที่ยกออกไปแล้ว (movedFrom reason carry) — ลิงก์ "ยกไป {SO}" + เหตุที่ปุ่มกู้คืนปิด
     ⚠️ อ่านไม่ขึ้นไม่บล็อกหน้าใบ แต่ต้องบอก (`moneyLinksError`) — กลืนเป็น [] = ปุ่มหาย/เตือนหายเงียบ ๆ
     ⚠️ ใบย้อนหลังไม่มีทางนี้ (ยกเลิกได้เฉพาะตอนไม่มีเงินรับแล้ว · RPC 0378 รับเฉพาะใบ pipeline) — ไม่ยิง query
     ⚠️ เฉพาะ GET (`extras`) — action ใน PATCH/DELETE ไม่ใช้ก้อนนี้ (ด่านกู้คืน/ลบถาวรอ่านสดของตัวเองแบบโยน error) */
  let carrySources = [];
  let carriedAway = [];
  let moneyLinksError = null;
  if (extras) {
    try {
      if (!historical && !['cancelled', 'revised'].includes(order.status)) carrySources = await loadCarrySources(supabase, order);
      if (!historical && order.status === 'cancelled') carriedAway = await loadMovedOut(supabase, order.id, { reason: 'carry' });
    } catch (moneyError) {
      console.error('[sales-order] โหลดเงินค้างจากใบที่ยกเลิกไม่สำเร็จ:', id, moneyError);
      moneyLinksError = `อ่านเงินค้างจากใบที่ยกเลิกไม่สำเร็จ: ${moneyError?.message || moneyError}`;
    }
  }

  /* ── ของเสริมของใบย้อนหลัง (historicalOrderWorkflow) — อ่านไม่ขึ้นไม่บล็อกหน้าใบ แต่ต้องบอก (`extrasError`)
     ⚠️ ห้ามกลืนเป็นรายการว่าง — โมดัลอนุมัติที่แถวหายเงียบ ๆ อ่านเหมือน "ไม่มีเรื่องต้องตรวจ"
     ⚠️ งวดอ่านไม่ขึ้นก็นับ — หลักฐานงวดยกมาอ่านจากแถวงวด ⇒ ว่างเพราะอ่านพัง ≠ "ไม่มีหลักฐาน" */
  let historicalExtras = null;
  if (extras && historical) {
    try {
      historicalExtras = {
        ...await loadHistoricalOrderExtras(supabase, { ...order, serviceContract, installments: installmentRows }),
        extrasError: installmentsError ? `อ่านงวดชำระไม่สำเร็จ: ${installmentsError.message || installmentsError}` : null,
      };
    } catch (extrasError) {
      console.error('[sales-order] โหลดของเสริมของใบย้อนหลังไม่สำเร็จ:', id, extrasError);
      historicalExtras = {
        lineZones: [], serviceContract, serviceContractFiles: [], openingEvidence: [], liveTermWarnings: [],
        extrasError: extrasError?.message || String(extrasError),
      };
    }
  }

  return {
    ...order,
    billingRequests,
    billingRequestsError,
    ...(historicalExtras || {}),
    serviceContract: historicalExtras?.serviceContract || serviceContract,
    contractChoices,
    deal: deal || null,
    customer: customer || null,
    billingSchemaReady,
    quotation: quotation || null,
    project: project || null,
    revisionHistory: revisionHistory || [],
    hasSignatureEvidence: Boolean(signatureEvidence?.id || order.signatureEvidenceId),
    scentRequest: scentRequest || null,
    carrySources,
    carriedAway,
    moneyLinksError,
    installments: historical
      ? installmentRows
      : withLiveAmounts(installmentRows, quotation?.paymentPlan, order.totalAmount),
  };
}

// รูปลายเซ็นผู้อนุมัติสำหรับออกเอกสาร SO: ต้องอ่านจาก evidence (mig 0125) แล้วโหลด
// ไฟล์จาก bucket ส่วนตัวด้วย service-role (RLS บล็อก client ปกติ) ฝังเป็น data URI ให้
// ฝั่งพิมพ์ใช้ตรง ๆ — เหมือนใบเสนอราคาที่ฝังรูปตอนตรึง snapshot. ล้มเหลว/dev = null.
async function loadApproverSignature(supabase, order) {
  if (order.status !== 'approved') return null;
  // ต้องกรอง signingRole (mig 0151) — เอกสารหนึ่งใบมีหลักฐานหลายบทบาทได้ (ผู้ยื่น/ผู้อนุมัติ)
  // ถ้าเรียงด้วย approvalSequence ล้วน แถวของผู้ยื่นที่เกิดหลังสุด (เช่น approved → ยกเลิก →
  // คืนร่าง → ยื่นใหม่) จะถูกหยิบมาแสดงในช่องผู้อนุมัติ = ลายเซ็นผิดคนบนเอกสาร
  /* 🐞 (พบ 2026-09-22 ตอนเพิ่มตำแหน่งเต็มในช่องลงนาม) ลายเซ็น **ฝ่ายบัญชี** (mig 0251) ก็ลง `signingRole = 'approver'`
     และเกิดทีหลังเสมอ ⇒ "แถว approver ล่าสุด" คือบัญชี ไม่ใช่ผู้จัดการฝ่ายขาย · วัดบนฐาน: SO ที่อนุมัติแล้ว 72 ใบ
     ได้ลายเซ็น/ชื่อ (และตอนนี้ตำแหน่ง Finance Officer) ของบัญชีในช่อง "ผู้จัดการฝ่ายขาย" ทางพิมพ์สด
     ⇒ ใช้หลักฐานที่การอนุมัติตรึงไว้กับใบ (`signatureEvidenceId` — SO ที่อนุมัติแล้วมีครบทุกใบ) ก่อนเสมอ
     ไม่มี id (ใบเก่ามาก) ค่อยถอยไปแถว approver ล่าสุดแบบเดิม */
  const evidenceQuery = supabase
    .from('document_signature_evidence')
    .select('id, signerName, signerRole, signedAt, signatureAssetSnapshot');
  const { data: ev, error: evError } = order.signatureEvidenceId
    ? await evidenceQuery.eq('id', order.signatureEvidenceId).maybeSingle()
    : await evidenceQuery
      .eq('salesOrderId', order.id)
      .eq('signingRole', 'approver')
      .order('approvalSequence', { ascending: false })
      .limit(1)
      .maybeSingle();
  // ลายเซ็นผู้อนุมัติหาย = เอกสารยังพิมพ์ได้แต่ไม่มีลายเซ็น · ไม่ throw (จะทำให้เปิดหน้า
  // SO ไม่ได้ทั้งใบ) แต่ต้อง log เพราะลายเซ็นคือหลักฐานอนุมัติ หายเงียบ ๆ ไม่ได้
  if (evError) console.error('[sales-order] โหลดหลักฐานลายเซ็นผู้อนุมัติไม่สำเร็จ:', evError.message);
  if (!ev?.signatureAssetSnapshot) return null;
  const imageDataUri = await loadSignatureImageDataUri(getSupabaseAdmin(), ev.signatureAssetSnapshot);
  if (!imageDataUri) return null;
  return {
    imageDataUri,
    signerName: ev.signerName || order.approvedByName || '',
    signerRole: ev.signerRole || '',
    signedAt: ev.signedAt || order.approvedAt || null,
    evidenceId: ev.id || order.signatureEvidenceId || '',
  };
}

// รูปลายเซ็นผู้จัดทำ (พนักงานขาย = ผู้สร้างใบ): stamp เชิงภาพจากลายเซ็น active ของผู้สร้าง
// ณ ปัจจุบัน (ไม่ตรึงเหมือนผู้อนุมัติ) — เหมือนช่องผู้เสนอราคาในใบเสนอราคา. ใช้ admin ทั้ง
// อ่าน metadata และโหลดไฟล์ เพราะลายเซ็นเป็น private ต่อเจ้าของ (ผู้ดูเอกสารไม่ใช่เจ้าของ).
async function loadProposerSignature(supabase, order) {
  const admin = getSupabaseAdmin();

  // ใบที่ยื่นตั้งแต่ mig 0153: อ่านจากหลักฐานที่ตรึงตอนยื่น → ได้วันที่ลงนาม + Evidence id
  // และรูปเป็นเวอร์ชันที่ตรึงไว้จริง (ไม่ใช่ลายเซ็นสดที่อาจถูกเปลี่ยนภายหลัง)
  if (order.proposerSignatureEvidenceId) {
    const { data: ev, error: evError } = await supabase
      .from('document_signature_evidence')
      .select('id, signerName, signerRole, signedAt, signatureAssetSnapshot')
      .eq('id', order.proposerSignatureEvidenceId)
      .maybeSingle();
    /* อ่านพลาด = ช่องฝ่ายขายของพิมพ์สดเป็นช่องเปล่า — ไม่ throw (เปิดหน้า SO ไม่ได้ทั้งใบ) แต่ต้อง log แบบผู้อนุมัติ
       ⚠️ ต้องจบที่นี่ ไม่ถอยไปทางใบเก่าข้างล่าง — ใบนี้มีหลักฐานจริง ถอยไปลายเซ็นสดของผู้สร้างจะได้รูปอีกคนไม่มีวันที่ */
    if (evError) {
      console.error('[sales-order] โหลดหลักฐานลายเซ็นผู้ยื่นไม่สำเร็จ:', evError.message);
      return null;
    }
    if (ev?.signatureAssetSnapshot) {
      const imageDataUri = await loadSignatureImageDataUri(admin, ev.signatureAssetSnapshot);
      if (imageDataUri) {
        return {
          imageDataUri,
          signerName: ev.signerName || order.createdByName || '',
          // role ของคนที่ยื่นจริง ⇒ ตำแหน่งเต็มใต้ "ฝ่ายขาย" (positionTitle · มติ 2026-09-22)
          signerRole: ev.signerRole || null,
          signedAt: ev.signedAt || order.submittedAt || null,
          evidenceId: ev.id,
        };
      }
    }
  }

  // ใบเก่าที่ยื่นก่อนมีหลักฐานผู้จัดทำ: คงพฤติกรรมเดิม (stamp เชิงภาพ ไม่มีวันที่/Evidence)
  // ไม่ให้ช่องลงนามหายไปจากเอกสารที่เคยออกแล้ว
  if (order.status !== 'approved' || !order.createdBy) return null;
  const asset = await loadActiveSignatureAsset(admin, order.createdBy);
  const imageDataUri = await loadSignatureImageDataUri(admin, asset);
  if (!imageDataUri) return null;
  return { imageDataUri, signerName: order.createdByName || '' };
}

/* ตำแหน่งของ AE เจ้าของดีล (role ในบัญชี) — ช่อง "ฝ่ายขาย" ของ SO ที่ยังไม่มีหลักฐานการยื่น (ร่าง · ยกเลิกก่อนยื่น)
   พิมพ์ชื่อเจ้าของดีลรอไว้ (คนที่ต้องกดยื่นคือเขา — canSubmitSalesOrder) ⇒ ตำแหน่งใต้ชื่อต้องเป็นของเขาจริง
   🐞 (ตรวจรอบสาม) เดิมพิมพ์ตำแหน่งของช่อง "Account Executive" คู่ชื่อ Senior AE — ใบที่ยื่นแล้วของใบเดียวกันพิมพ์
      "Senior Account Executive" จากหลักฐาน · ใบที่มีหลักฐานการยื่นไม่ต้องอ่าน (salesOrderPrint ใช้ signerRole ของหลักฐาน)
   ⚠️ role อยู่ใน app_metadata ของบัญชี (ไม่มีตาราง users) ⇒ service role · best-effort: อ่านไม่ได้ = ตำแหน่งของช่อง + log */
async function loadDealOwnerRole(order) {
  const ownerId = order?.deal?.ownerId;
  if (order?.proposerSignatureEvidenceId || !ownerId) return null;
  try {
    const res = await getSupabaseAdmin().auth.admin.getUserById(ownerId);
    if (res?.error) {
      console.error('[sales-order] อ่านบัญชีเจ้าของดีลไม่สำเร็จ — ช่องฝ่ายขายพิมพ์ตำแหน่งของช่อง:', res.error.message);
      return null;
    }
    return res?.data?.user?.app_metadata?.role || null;
  } catch (error) {
    console.error('[sales-order] อ่านบัญชีเจ้าของดีลไม่สำเร็จ — ช่องฝ่ายขายพิมพ์ตำแหน่งของช่อง:', error?.message || error);
    return null;
  }
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  let order;
  try { order = await loadOrder(supabase, id, { extras: true }); }
  catch (error) { return fail(`โหลดใบสั่งขายไม่สำเร็จ: ${error.message}`, 500); }
  if (!order) return notFound('ไม่พบ ใบสั่งขาย');
  if (!order.deal || !inSalesViewScope(user, order.deal)) return forbidden();
  // ข้อมูลลูกค้าบนเอกสารมาจาก snapshot ในใบเสนอราคาที่ผูก — ใบเก่าที่ snapshot ไม่ครบ
  // (ผู้ติดต่อ/เลขภาษี) เติมเฉพาะช่องว่างจากทะเบียนลูกค้าสด เพื่อให้เอกสารแสดงครบ
  if (order.quotation) {
    order.quotation = await fillCustomerSnapshotFromMaster(supabase, order.quotation);
  }
  // ชื่อหมวดของบรรทัด FG — บรรทัดที่ก๊อปจากใบเสนอราคาก่อนมติ 2026-09-22 ยังไม่มี
  // เติมเพื่อแสดง/พิมพ์เท่านั้น ไม่บันทึก (บรรทัด SO เป็น snapshot แก้ไม่ได้)
  order.lines = await fillMissingLineCategories(supabase, order.lines || []);
  // รูปลายเซ็นผู้จัดทำ + ผู้อนุมัติ (ไม่บล็อกถ้าโหลดไม่ได้ — เอกสารยังออกได้ ตกช่องเซ็นเปล่า)
  let approverSignature = null;
  let proposerSignature = null;
  let dealOwnerRole = null;
  if (!user.devBypass) {
    try { approverSignature = await loadApproverSignature(supabase, order); }
    catch { approverSignature = null; }
    try { proposerSignature = await loadProposerSignature(supabase, order); }
    catch { proposerSignature = null; }
    dealOwnerRole = await loadDealOwnerRole(order);
  }
  // ⭐ ของเข้าที่สั่งมาเพื่อผลิตใบนี้ (mig 0177 · มติผู้ใช้ 2026-07-29:
  // "PR RM เข้า มันจะเชื่อมกับ SO เพราะว่ามันติดตามเพื่อสู่การผลิต")
  // อ่านอย่างเดียวที่นี่ — แก้ที่หน้าโครงการซึ่ง PC เป็นเจ้าของงาน
  // ไม่บล็อกถ้าโหลดไม่ได้: SO ต้องเปิดดูได้เสมอ ของเข้าเป็นข้อมูลประกอบ
  let deliveries = [];
  try {
    const { data } = await supabase
      .from('material_deliveries')
      .select('id, kind, label, qty, unit, poRef, dueDate, arrivedAt, projectId')
      .eq('salesOrderId', id)
      .order('dueDate', { ascending: true, nullsFirst: false });
    deliveries = data || [];
  } catch { deliveries = []; }

  // meId ให้หน้าเว็บซ่อนปุ่มอนุมัติของ SO ที่ตัวเองสร้าง/ยื่น (แบ่งแยกหน้าที่)
  // meDepartment ให้ซ่อนปุ่มของขั้นบัญชี (mig 0250) — `canConfirmPayment` ตัดสินด้วย **ฝ่าย**
  // ไม่ใช่ role ⇒ ส่งมาด้วย ไม่งั้นหน้าเว็บซ่อนปุ่มผิดคนแล้วไปเจอ 400 ตอนกด
  return ok({
    ...order,
    // ตำแหน่งของเจ้าของดีลสำหรับช่อง "ฝ่ายขาย" ที่ยังไม่มีคนยื่น (loadDealOwnerRole) · อ่านไม่ได้/ไม่ต้องอ่าน = ไม่เติม
    deal: dealOwnerRole ? { ...order.deal, ownerRole: dealOwnerRole } : order.deal,
    meId: user.id || null,
    meDepartment: departmentOf(user),
    /* ⭐ **สิทธิ์แก้ต้องมาจาก server** — จอเคยคิดเองด้วย `useCan("salesplan:edit")` ล้วน
       ซึ่งตอบแค่ "มี cap ไหม" ไม่ได้ตอบ "ใบนี้อยู่ในขอบเขตที่แก้ได้ไหม" ส่วน action
       ทุกตัวใน PATCH ตรวจ `canEditSalesPlanning(user) && inSalesEditScope(user, deal)`
       ⇒ วันไหนขอบเขตแก้แคบกว่าขอบเขตอ่าน (role ใหม่) ปุ่มจะโผล่แล้วเด้ง 409 เงียบ ๆ
       · แพตเทิร์นเดียวกับ `/contracts/[id]` และ `/addenda/[id]` ที่ส่งค่านี้มาให้อยู่แล้ว */
    canEdit: canEditSalesPlanning(user) && inSalesEditScope(user, order.deal),
    /* สิทธิ์ตั้งรอบวางบิลของลูกค้าของใบ (mig 0389 · มติข้อ 4: ฝ่ายขายทีมที่ดูแล + FN) — ตัวตัดสินตัวเดียวกับ
       `/api/customers/[id]/billing-rule` ⇒ แผงไม่ชวน "ตั้งรอบวางบิล" คนที่ไปถึงทะเบียนแล้วกดแก้ไม่ได้ (ไม่มีสิทธิ์ = ไม่วาด) */
    canEditBillingRule: canEditCustomerBillingRule(user, order.customer),
    approverSignature,
    proposerSignature,
    deliveries,
  });
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  let before;
  try { before = await loadOrder(supabase, id); }
  catch (error) { return fail(`โหลดใบสั่งขายไม่สำเร็จ: ${error.message}`, 500); }
  if (!before) return notFound('ไม่พบ ใบสั่งขาย');

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  const withdrawing = action === 'withdraw';
  /* 🐞 **ด่านนี้เคยตัดฝ่ายบัญชีทิ้งทุกครั้ง** — บังคับ `salesplan:edit` กับทุก action
     ที่ไม่ใช่ "ดึงกลับ" แต่ฝ่ายบัญชีไม่มี cap นั้นโดยเจตนา (เขาไม่ใช่คนแก้งานขาย)
     ⇒ ปุ่ม "บัญชีอนุมัติใบนี้" ขึ้นบนจอปกติแต่กดแล้ว 403 ก่อนถึงสาขา action
     ⚠️ ที่ **คอนเฟิร์มงวดรอด** เพราะอยู่คนละ route (`/installments`) ซึ่งกั้นด้วย
     `canViewSalesPlanning` เท่านั้น — อาการจึงเป็น "ปุ่มหนึ่งได้ อีกปุ่มไม่ได้"
     ซึ่งชี้ตรงมาที่ด่านนี้ (ผู้ใช้แจ้งเข้ามาเอง 2026-08-13)

     ⭐ **ขั้นบัญชีคือ "อ่านใบแล้วตัดสิน" ไม่ใช่ "แก้ใบ"** — เกณฑ์ที่ถูกคือ view scope
     เหมือน `withdraw` · ด่านจริงของแต่ละคำสั่งคือ `financeActionError` ซึ่งแคบด้วย
     **ฝ่าย** อีกชั้น และ RPC ที่ปลายทางก็ตรวจฝ่ายซ้ำอีกที (mig 0251) */
  const readerAction = !salesOrderActionNeedsEditScope(action);
  if (!before.deal || !(readerAction
    ? inSalesViewScope(user, before.deal)
    : canEditSalesPlanning(user) && inSalesEditScope(user, before.deal))) return forbidden();
  const reviewer = isSalesOrderReviewer(user.role);

  // เหตุการณ์ลงเธรดของใบ — ไม่เช็ค error โดยเจตนา: เขียนเธรดพลาดต้องไม่ทำให้ action
  // ที่ DB บันทึกสำเร็จแล้วตอบ 500 (กติกาเดียวกับ askActionUpdate)
  // ⚠️ ทุก action เรียกด้วย `before` ไม่ใช่แถวหลังอัปเดต — เธรดเล่า "ใบเลขนี้ Rev.นี้
  // ถูกทำอะไร" ซึ่งเป็นข้อมูลของใบก่อนเปลี่ยนสถานะ
  // ⭐ เขียนสองที่ในครั้งเดียว: เธรดของใบ + เธรดของ**ดีลแม่** (ดู documentThread.js)
  // — action ที่ดีลไม่สนใจ (ดึงกลับ/กู้ร่าง) ตัวมันคืน null ให้เอง
  const logThread = async (act, opts = {}) => {
    await appendDocumentEvent(supabase, {
      docType: 'sales_order', doc: before, action: act, opts, user,
      dealId: before.dealId || before.deal?.id || null,
    });
  };

  /* กิ่งของใบย้อนหลัง (0374) — ตรรกะอยู่ใน lib/sales/historicalOrderWorkflow (คืน { status, body }) · route แค่ส่งต่อ
     ⚠️ ห่อ try: ตัวกรองหลักฐานอ่านที่เก็บไฟล์ได้ล้ม — ตอบไทยแทน stack ดิบ (แพตเทิร์นเดียวกับเส้นคีย์ใบ) */
  const historicalReply = async (what, run) => {
    try {
      const result = await run();
      return Response.json(result.body, { status: result.status });
    } catch (error) {
      console.error(`[sales order ${id}] historical ${action} failed:`, error);
      return fail(`${what}ไม่สำเร็จ กรุณาลองใหม่ หากยังไม่ได้แจ้งผู้ดูแลระบบ`, 500);
    }
  };

  /* ⭐ เปลี่ยนภาษาเอกสาร (มติผู้ใช้ 2026-08-27 · mig 0295) — คู่ขนานกับใบเสนอราคา #1456
     ภาษาเปลี่ยนแค่กระดาษที่พิมพ์ ไม่ใช่ข้อเสนอ ⇒ ใบที่อนุมัติแล้วก็เปลี่ยนได้ ไม่ต้องออก Rev.
     ⚠️ **ต้องตรึงเอกสารฉบับใหม่ด้วย** ไม่ใช่แค่เปลี่ยนค่าในตาราง — ใบที่อนุมัติแล้วพิมพ์
     จากฉบับตรึงเสมอ (openSalesOrderPrintWindowPreferIssued) ⇒ ไม่ตรึงใหม่ = จอบอกอังกฤษ
     แต่ไฟล์ที่ส่งลูกค้ายังเป็นไทย */
  /* ── ผูก/ถอดสัญญาบริการของใบ (mig 0324 · มติผู้ใช้ 2026-08-31) ────────────
     ⭐ **แหล่งความจริงอยู่ที่ใบ** — แผนเดิมให้เขียนลง `service_zone_terms` แต่ term
       เกิดตอน TS จัดสรรลงโซนเท่านั้น ⇒ SA ผูกก่อนจัดสรรไม่ได้เลย ซึ่งเป็นลำดับที่
       ของจริงเดินกัน (สัญญามาก่อนงาน) · term อ่านผ่านใบแม่ ไม่ก๊อป
     ⚠️ ด่านอยู่ที่ `serviceContractLinkError` ตัวเดียวกับที่การ์ดบนจอถาม */
  if (action === 'set_service_contract') {
    const contractId = body.contractId ? String(body.contractId).trim() : null;
    const canEdit = canEditSalesPlanning(user) && inSalesEditScope(user, before.deal);

    /* โหลดสัญญาจริงมาตรวจ ไม่ใช่เชื่อ id ที่ยิงมา — ด่านต้องรู้ว่ามันเป็นของดีลไหน
       และมีผลแล้วหรือยัง (จอส่ง id อะไรมาก็ได้) */
    let contract = null;
    if (contractId) {
      /* ⚠️ `loadScoped` ไม่ใช่แค่ "โหลดแถว" — มันตรวจขอบเขตของผู้ใช้ให้ด้วย
         (ด่าน ratchet ในเทสต์บังคับไว้ว่าตารางที่มีทะเบียนขอบเขตห้ามโหลดเอง) */
      const { row, response } = await loadScoped(supabase, 'sales_contracts', contractId, user, 'view');
      if (response) return response;
      contract = row;
    }

    const gate = serviceContractLinkError(before, contract, { canEdit });
    if (gate) return fail(gate, 409);
    if ((before.serviceContractId || null) === (contractId || null)) return ok(before);

    const { data, error } = await supabase.from('sales_orders')
      .update({ serviceContractId: contractId, updatedAt: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data,
      summary: contract
        ? `ผูกสัญญา ${contract.contractNo} เข้ากับใบสั่งขาย ${before.orderNumber}`
        : `ถอดสัญญาออกจากใบสั่งขาย ${before.orderNumber}`,
      request: req,
    });
    return ok(data);
  }

  /* ⛔ สวิตช์ยกเว้นด่านเงินรายใบ (`set_payment_gate_exemption` · 0360 มติข้อ 13) **ถอดแล้ว** (มติ 22/09 · 0374) —
     เงินที่เก็บก่อนเข้าระบบคีย์เป็นงวดยกมาให้บัญชีรับรอง · ใบ ฿0 ผ่านด่าน ② เองด้วย paymentNotRequired
     · คอลัมน์ paymentGateExempt* ยังอยู่แต่ CHECK ของ 0374 บังคับให้ใบย้อนหลังว่างเสมอ */

  /* ── กรอกจำนวนรอบบริการรายบรรทัด (mig 0326 · มติผู้ใช้ 2026-08-31 รอบสอง) ──
     ⭐ **ช่องเดียวบนบรรทัดใบสั่งขายที่แก้ได้** — ที่เหลือเป็น snapshot จากใบเสนอราคา
       เหตุผลอยู่ที่ `lib/sales/serviceRoundsEntry.js` (ไม่กระทบยอดเงิน/เอกสารที่ออกแล้ว)
     ⚠️ ด่านสองชั้นคนละคำถาม: `serviceRoundsEditError` = "ใบนี้/คนนี้แก้ได้ไหม" ·
       `validateServiceRoundsPatch` = "บรรทัดที่ส่งมาเป็นของใบนี้และเป็นหมวดบริการจริงไหม"
     ⚠️ **แก้ได้แม้ใบอนุมัติแล้ว** โดยตั้งใจ — ไม่ต้องออก Rev. เพื่อแก้เลขตัวเดียว */
  if (action === 'set_service_rounds') {
    const canEdit = canEditSalesPlanning(user) && inSalesEditScope(user, before.deal);
    const gate = serviceRoundsEditError(before, { canEdit });
    if (gate) return fail(gate, 409);

    const { data: lines, error: lineError } = await supabase
      .from('sales_order_lines').select('id, "fgCode", description, "serviceRounds"')
      .eq('salesOrderId', id);
    if (lineError) return fail(lineError.message, 500);

    const { value, error: invalid } = validateServiceRoundsPatch(body.serviceRounds, lines || []);
    if (invalid) return badRequest(invalid);

    /* เขียนเฉพาะบรรทัดที่ค่าเปลี่ยนจริง — ไม่งั้นกดบันทึกโดยไม่แก้อะไรก็ยัง
       ประทับ audit log ไปหนึ่งแถวทุกครั้ง */
    const byId = new Map((lines || []).map((l) => [l.id, l]));
    const changed = [...value.entries()].filter(([lineId, rounds]) => (byId.get(lineId)?.serviceRounds ?? null) !== rounds);
    if (!changed.length) return ok(before);

    for (const [lineId, rounds] of changed) {
      const { error: updateError } = await supabase.from('sales_order_lines')
        .update({ serviceRounds: rounds }).eq('id', lineId).eq('salesOrderId', id);
      if (updateError) return fail(updateError.message, 500);
    }

    const summary = changed
      .map(([lineId, rounds]) => `${byId.get(lineId)?.fgCode || lineId}: ${rounds === null ? 'ยังไม่ระบุ' : `${rounds} รอบ`}`)
      .join(' · ');
    await recordAudit({
      user, action: 'update', entityType: 'sales_order', entityId: id,
      before: { lines: (lines || []).map(({ id: lineId, fgCode, serviceRounds }) => ({ id: lineId, fgCode, serviceRounds })) },
      after: { lines: changed.map(([lineId, rounds]) => ({ id: lineId, fgCode: byId.get(lineId)?.fgCode || null, serviceRounds: rounds })) },
      summary: `แก้จำนวนรอบบริการของใบสั่งขาย ${before.orderNumber} — ${summary}`,
      request: req,
    });
    // จอโหลดใบใหม่ทั้งก้อนหลังบันทึก (บรรทัดอยู่ในนั้น) — ตอบแถวใบพอ
    return ok(before);
  }

  if (action === 'set-doc-language') {
    const language = body.language === 'en' ? 'en' : (body.language === 'th' ? 'th' : null);
    if (!language) return badRequest('ภาษาเอกสารต้องเป็น "th" หรือ "en" เท่านั้น');
    if (!canSwitchSalesOrderDocLanguage(before)) {
      return fail(isHistoricalOrder(before)
        ? 'ใบสั่งขายย้อนหลังยังออกเอกสารจากระบบไม่ได้ — ใช้เอกสารเดิมที่ออกนอกระบบ'
        : 'ใบสั่งขายนี้เปลี่ยนภาษาเอกสารไม่ได้ในสถานะปัจจุบัน', 409);
    }
    if (before.docLanguage === language) return ok(before);
    const { data, error } = await supabase.from('sales_orders')
      .update({ docLanguage: language, updatedAt: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) return fail(error.message, 500);

    // ตรึงฉบับใหม่เฉพาะใบที่มีฉบับตรึงอยู่แล้ว (= ผ่านการอนุมัติมาแล้ว) · best-effort
    if (before.signatureEvidenceId) {
      try {
        const { data: evidence } = await supabase
          .from('document_signature_evidence').select('*')
          .eq('id', before.signatureEvidenceId).maybeSingle();
        if (evidence) {
          const company = await getPublishedCompanyProfile(supabase).catch(() => null);
          await captureIssuedSalesOrderSnapshot(getSupabaseAdmin(), {
            order: {
              ...before, ...data,
              lines: before.lines, deal: before.deal, quotation: before.quotation, project: before.project,
            },
            evidence,
            user,
            company,
          });
        }
      } catch (snapshotError) {
        console.error('reissue sales order for language failed', id, snapshotError);
      }
    }

    await recordAudit({
      user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data,
      summary: `เปลี่ยนภาษาเอกสารใบสั่งขาย ${before.orderNumber} เป็น ${language === 'en' ? 'อังกฤษ' : 'ไทย'}`,
      request: req,
    });
    return ok(data);
  }

  if (action === 'withdraw') {
    // ดึงกลับเป็นการกระทำของผู้ยื่นเท่านั้น (มติ 2026-07-26) — ผู้รีวิวใช้ตีกลับแทน
    if (!canWithdrawSalesOrderSubmission(before, { userId: user.id })) {
      return forbidden('ดึงกลับได้เฉพาะผู้ยื่นเอกสารเอง — ผู้รีวิวให้ใช้ “ตีกลับให้แก้ไข”');
    }
    const reason = String(body.reason || '').trim();
    // เวอร์ชันที่ "หน้าเว็บเห็น" ไม่ใช่ที่ server เพิ่งอ่าน — ดู lib/sales/documentConcurrency.js
    const expected = resolveExpectedUpdatedAt(body);
    if (!expected.ok) return badRequest(expected.error);
    const { data, error } = await supabase.rpc('withdraw_sales_order_submission_atomic', {
      p_order_id: id,
      p_expected_updated_at: expected.value,
      p_reason: reason,
      p_actor_id: user.id,
      p_actor_name: user.name || null,
      p_actor_role: user.role || null,
    });
    if (error) {
      const mapped = documentWorkflowError(error, { context: `sales order withdraw ${id}` });
      return fail(mapped.message, mapped.status);
    }
    await logThread('withdraw', { reason });
    await recordAudit({
      user,
      action: 'update',
      entityType: 'sales_order',
      entityId: id,
      before,
      after: data,
      summary: `ดึงกลับ ${before.orderNumber}: ${reason}`,
      request: req,
    });
    return ok(data);
  }

  // ขั้นที่ 1 (mig 0166): ย้อนการอนุมัติ → สถานะกลางที่แก้ไม่ได้ · Actual หลุดที่ขั้นนี้
  if (action === 'revoke') {
    // ใบย้อนหลังต้องได้เหตุจริงก่อนด่านสิทธิ์ — ไม่งั้น AE Sup เจอ "ได้เฉพาะ AE Supervisor" ซึ่งผิดความจริง
    if (isHistoricalOrder(before)) return fail(HISTORICAL_NO_REVISION, 409);
    if (!canRevokeSalesOrderApproval(before, { reviewer })) {
      return forbidden('ย้อนการอนุมัติได้เฉพาะ AE Supervisor หรือ Admin');
    }
    /* ⭐ **งวดที่บัญชีรับรองแล้วไม่ล็อกขั้นนี้อีก** (PR1 · mig 0376 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09)
       เดิมถาม paymentLockReason ที่นี่ เพราะ RPC ออก Rev. ก๊อปงวดเป็นแถวค้างรับ (เงินก้อนเดียวสองแถว) ⇒ ใบที่รับเงินแล้ว
       แก้เอกสารไม่ได้เลย · 0376 ย้ายแถวไปใบ Rev. ทั้งแถว (สถานะ · หลักฐาน · ใบกำกับคงเดิม) ⇒ ไม่มีเงินให้ถอยทับอีก
       · มติ D2: ใบที่บัญชีปิดแล้ว (financeStatus = approved) ย้อนได้ — ใบ Rev. เกิดเป็น NULL แล้วเข้าคิวปิดใหม่ตอนอนุมัติ
       🛑 **ลำดับ deploy** — ฐานยังเป็น RPC ตัวก๊อป (ยังไม่รัน 0376) = ย้อนไม่ได้ (503) ไม่งั้นเงินถูกก๊อปซ้ำเงียบ ๆ
       ⚠️ อ่านงวดสดแบบโยน error — `before.installments` ของ loadOrder กลืนการอ่านพังเป็น [] (ด่านเปิดเงียบ)
       ⚠️ Σ งวด ≠ ยอดใบ = RPC ออก Rev. RAISE ⇒ ต้องกันตั้งแต่ขั้นนี้ ไม่งั้นใบค้างที่ approval_revoked (ทางตัน) */
    const moveSchemaError = await installmentMoveColumnError(supabase);
    if (moveSchemaError) return fail(moveSchemaError, 503);
    let liveInstallments;
    try { liveInstallments = await loadInstallments(supabase, id); }
    catch (error) { return fail(`อ่านงวดชำระของใบไม่สำเร็จ: ${error.message}`, 500); }
    const totalMismatch = installmentsTotalMismatch(liveInstallments, before.totalAmount);
    if (totalMismatch) return fail(totalMismatch, 409);
    const reason = String(body.reason || '').trim();
    const expected = resolveExpectedUpdatedAt(body);
    if (!expected.ok) return badRequest(expected.error);
    const { data, error } = await supabase.rpc('revoke_sales_order_approval_atomic', {
      p_order_id: id,
      p_expected_updated_at: expected.value,
      p_reason: reason,
      p_actor_id: user.id,
      p_actor_name: user.name || null,
      p_actor_role: user.role || null,
    });
    if (error) {
      const mapped = documentWorkflowError(error, { context: `sales order revoke ${id}` });
      return fail(mapped.message, mapped.status);
    }
    await logThread('revoke', { reason });
    await recordAudit({
      user,
      action: 'update',
      entityType: 'sales_order',
      entityId: id,
      before,
      after: data,
      summary: `ย้อนการอนุมัติ ${before.orderNumber} (Actual ${soAmount(before)} หลุดจากยอด): ${reason}`,
      request: req,
    });
    // แจ้งทีมขาย: Actual หายไปจากยอด ต้องไม่เงียบ
    return ok(data);
  }

  // ขั้นที่ 2: ออก Rev. จากใบที่ย้อนการอนุมัติแล้ว — เหตุผลใช้ค่าที่กรอกไว้ขั้นแรก
  if (action === 'revise') {
    if (isHistoricalOrder(before)) return fail(HISTORICAL_NO_REVISION, 409);
    // ฉบับ Rev. = SO ใบใหม่ (เลขใหม่ ใบเดิม superseded) → อยู่ในขอบเขตด่าน B3
    const closedProject = projectWriteBlockedError(before.project)
      ? `โครงการ ${[before.project?.code, before.project?.name].filter(Boolean).join(' ') || 'นี้'} ปิดแล้ว — ออก Rev. ใบสั่งขายไม่ได้ ต้องให้ผู้อนุมัติเปิดโครงการใหม่ (RE-ORDER) ก่อน`
      : null;
    if (closedProject) return badRequest(closedProject);
    // ⭐ AE เจ้าของดีลออก Rev. เองได้ (มติ 24/09) — ฐานเช็คเจ้าของดีลซ้ำที่ RPC (mig 0385)
    if (!canIssueSalesOrderRevision(before, { reviewer, userId: user.id, deal: before.deal })) {
      return forbidden(before.status === 'approved'
        ? 'ต้องกด "ย้อนการอนุมัติ" ก่อนจึงจะออก Rev. ได้'
        : 'ออก Rev. ได้เฉพาะ AE เจ้าของดีลหรือ AE Supervisor บน SO ที่ย้อนการอนุมัติแล้ว');
    }
    const reason = String(body.reason || '').trim() || before.revisionReason || '';
    const expected = resolveExpectedUpdatedAt(body);
    if (!expected.ok) return badRequest(expected.error);
    const revisionId = genId('SO');
    const { data: result, error } = await supabase.rpc('revise_approved_sales_order_atomic', {
      p_order_id: id,
      p_revision_id: revisionId,
      p_expected_updated_at: expected.value,
      p_reason: reason,
      p_actor_id: user.id,
      p_actor_name: user.name || null,
      p_actor_role: user.role || null,
    });
    if (error) {
      const mapped = documentWorkflowError(error, { context: `sales order revise ${id}` });
      return fail(mapped.message, mapped.status);
    }
    const revision = result?.revision || null;
    // ⚠️ ลงเธรดของ **ใบเดิม** ไม่ใช่ใบ Rev. ใหม่ (คนละ id) ไม่งั้นใบเดิมจบห้วน ๆ
    await logThread('revise', { reason, toRevisionNo: revision?.revisionNo ?? null });

    /* ⭐ **งวดชำระย้ายไปใบ Rev. ทั้งแถว (mig 0376)** — RPC บอกผลการย้ายมาใน `moved` (นับจากแถวบนใบ Rev. จริง)
       ⇒ สรุป audit บอกว่าย้ายกี่งวด รับแล้วเท่าไร รอบัญชีตรวจกี่งวด (revisionAuditSummary)
       🛑 ไม่มี `moved` = ฐานยังเป็น RPC ตัวก๊อป (ยังไม่รัน 0376) ⇒ งวดถูกก๊อปเป็นแถวค้างรับ — ใส่ warning ในคำตอบ
         (ปกติมาไม่ถึง: ขั้นย้อนการอนุมัติถามคอลัมน์ของ 0376 ก่อนแล้ว · เหลือเฉพาะใบที่ย้อนไว้ก่อน deploy) */
    const { summary: reviseSummary, warning: moveWarning } = revisionAuditSummary({
      fromNumber: before.orderNumber, toNumber: revision?.orderNumber || revisionId, reason, moved: result?.moved,
    });
    if (moveWarning) console.error(`[sales order revise ${id}] ${moveWarning} — RPC ไม่คืน moved`);

    await recordAudit({
      user,
      action: 'create',
      entityType: 'sales_order',
      entityId: revision?.id || revisionId,
      before,
      after: revision,
      summary: reviseSummary,
      request: req,
    });
    // FM-SA-04 (mig 0370): เอกสารใบสเปคย้ายไปผูกใบ Rev. ใหม่ เลขที่เดิม · ล้ม = SO ยังสำเร็จ + warning
    const specWarning = revision?.id
      ? await moveSpecDocumentsAfterRevise({ supabase, user, req, oldOrder: before, newOrder: revision })
      : null;
    // แท็บ "เอกสาร" (มติ 25/09): ไฟล์ที่แนบเพิ่มย้ายตามไปฉบับ Rev. — ใบเดิมกลายเป็น revised = แนบ/ลบไม่ได้แล้ว
    const fileWarning = revision?.id
      ? await moveAttachmentsAfterRevise({ supabase, user, req, oldOrder: before, newOrder: revision })
      : null;
    const warning = [moveWarning, specWarning, fileWarning].filter(Boolean).join(' · ') || null;
    return ok(warning ? { ...revision, warning } : revision, 201);
  }

  if (action === 'save') {
    /* ⛔ ใบย้อนหลัง (0374) แก้ที่ฟอร์มคีย์ใบตัวเดียว (กฎ "ฟอร์มแก้ = ฟอร์มสร้าง") — ช่องที่นี่ (หมายเหตุ · เอกสารอ้างอิง ·
       เอกสารยืนยันคำสั่งซื้อ · กำหนดส่ง) เป็นของใบจากใบเสนอราคา และเขียนตรงโดยไม่ผ่านด่านของ RPC แก้ใบ */
    if (isHistoricalOrder(before)) return fail('แก้ใบย้อนหลังที่ฟอร์มคีย์ใบ — กด "แก้ไขและส่งอนุมัติ" บนหน้าใบ', 409);
    if (!['draft', 'rejected'].includes(before.status)) return badRequest('แก้ไขได้เฉพาะ SO ร่างหรือรายการที่ถูกตีกลับ');
    /* ⚠️ **ไม่รับ `orderDate` / `paymentDueDate` จาก client อีกแล้ว** (มติผู้ใช้ 2026-08-18)
       - วันที่ SO = วันที่สร้างใบ แก้ไม่ได้ (เดิมเป็นช่องกรอกที่แก้ย้อนหลังได้ ⇒ เลขที่ใบ
         กับวันที่บนใบเดินคนละทางได้)
       - กำหนดชำระย้ายไปอยู่ที่ **งวด** ทั้งหมด (action `schedule` รายงวด) ค่าระดับใบ
         มาจากหลักฐานตอนปิด Won และเป็นค่าอ้างอิงของฝ่ายผลิต ไม่ใช่ช่องให้แก้บนเอกสาร
       แก้ได้เหลือ **หมายเหตุ + เอกสารอ้างอิง + กำหนดส่งสินค้า** เท่านั้น
       ⭐ `deliveryDueDate` (0363) แก้ได้ตอนใบยังเป็นร่าง — วันส่งมักตกลงหลังตั้งใบร่าง
          ⚠️ ส่งคีย์มาเมื่อไร = ทับค่าเดิม (ส่ง '' = ล้างค่า) · ไม่ส่งมาเลย = ไม่แตะของเดิม
          ⚠️ ใบที่อนุมัติแล้วแก้ที่นี่ไม่ได้ (ติดด่านสถานะบรรทัดบน) — เลื่อนวันส่งของใบที่
             อนุมัติแล้วต้องออก Rev. ตามกติกาเดิมของเอกสาร */
    // ⚠️ เพดาน 200 = ด่านเดียวกับ CHECK ของ mig 0235 — ตัดที่นี่ก่อนถึง DB เพื่อไม่ให้
    // คนกรอกเจอ error ภาษาอังกฤษของ Postgres · ยาวกว่านี้แปลว่ากำลังใช้ช่องนี้เป็น
    // ช่องหมายเหตุ ซึ่งมี `notes` อยู่แล้วข้างล่าง
    const referenceDoc = String(body.referenceDoc || '').trim().slice(0, 200);
    /* ⭐ เอกสารยืนยันคำสั่งซื้อแก้ได้ตอนใบยังเป็นร่าง (mig 0285) — ใบที่ออกไว้ก่อน
       ได้เอกสารจากลูกค้าทีหลัง ต้องเติมได้โดยไม่ต้องออกใบใหม่
       ⚠️ ส่ง `confirmation` มาเมื่อไร = ทับทั้งก้อน (ไฟล์ที่หายไปคือไฟล์ที่ถูกลบ) ·
       ไม่ส่งมาเลย = ไม่แตะของเดิม */
    let confirmPatch = {};
    if ('confirmation' in body) {
      const privateBucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || DEFAULT_EVIDENCE_BUCKET;
      const safeQuoteId = String(before.quotationId || '').replace(/[^a-zA-Z0-9_-]+/g, '_');
      const check = validateOrderConfirmation(body.confirmation || {}, {
        allowedStorageBucket: privateBucket,
        allowedStoragePathPrefix: `quotations/${safeQuoteId}/order-confirmation/`,
      });
      if (!check.ok) return badRequest(check.error);
      const missing = await missingStoredEvidence(supabase, privateBucket, check.confirmation?.attachments || []);
      if (missing) return badRequest(missing);
      confirmPatch = {
        confirmDocType: check.confirmation?.docType || null,
        confirmDocNo: check.confirmation?.docNo || null,
        confirmDocDate: check.confirmation?.docDate || null,
        confirmAttachments: check.confirmation?.attachments || [],
      };
    }
    let deliveryPatch = {};
    if ('deliveryDueDate' in body) {
      const deliveryDue = parseDeliveryDueDate(body.deliveryDueDate);
      if (!deliveryDue.ok) return badRequest(deliveryDue.error);
      deliveryPatch = { deliveryDueDate: deliveryDue.value };
    }
    const patch = {
      referenceDoc: referenceDoc || null,
      notes: String(body.notes || '').trim() || null,
      ...confirmPatch,
      ...deliveryPatch,
      updatedAt: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).eq('status', before.status).select('*').maybeSingle();
    if (error) return fail(`บันทึกใบสั่งขายไม่สำเร็จ: ${error.message}`, 500);
    if (!data) return badRequest('สถานะ SO เปลี่ยนแล้ว กรุณาโหลดใหม่');
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `edit ${before.orderNumber}`, request: req });
    return ok(data);
  }

  if (action === 'submit') {
    /* ⭐ ใบย้อนหลัง (0374) มาก่อนเสมอ — ไม่มีใบเสนอราคา/โครงการ/เอกสารยืนยันคำสั่งซื้อ และไม่เก็บลายเซ็น
       (CHECK ของ 0374 บังคับว่าง) ⇒ ด่านของใบปกติข้างล่างตีกลับใบนี้ทุกข้อ · ผู้ส่ง = ผู้คีย์ ไม่ใช่เจ้าของดีลเท่านั้น
       ด่านจริงอยู่ที่ RPC submit_historical_sales_order (ไฟล์เอกสารแทนสัญญา · งวด · หลักฐานงวดยกมา) */
    if (isHistoricalOrder(before)) {
      return historicalReply('ส่งอนุมัติใบสั่งขายย้อนหลัง', () => submitHistoricalOrder({
        supabase, user, order: before, body, thread: logThread, request: req,
      }));
    }
    if (!['draft', 'rejected'].includes(before.status)) return badRequest('SO ใบนี้ยื่นอนุมัติไม่ได้');
    // ช่อง "ฝ่ายขาย" บนใบเป็นของ AE เจ้าของดีล และการยื่น = การลงนามในช่องนั้น (mig 0153)
    // AC สร้างใบแทนได้ตามเดิม แต่ต้องส่งให้เจ้าของดีลกดยื่นเอง (มติผู้ใช้ 2026-08-05)
    if (!canSubmitSalesOrder(user, before.deal)) {
      // บอกชื่อเจ้าของดีลไปด้วย — ข้อความนี้ไปโผล่บนจอคนที่กดไม่ได้ ซึ่งคือคนที่ต้อง
      // ไปตามอีกคน (ชุดเดียวกับ disabledReason ของปุ่มในหน้าใบ)
      const ownerName = String(before.deal?.ownerName || '').trim();
      return forbidden(ownerName
        ? `ยื่นอนุมัติใบสั่งขายได้เฉพาะ AE เจ้าของดีล — ส่งต่อให้ ${ownerName} กดยื่น`
        : 'ยื่นอนุมัติใบสั่งขายได้เฉพาะ AE เจ้าของดีล — ผู้ที่สร้างแทนให้ส่งต่อให้เจ้าของดีลกดยื่น');
    }
    // ยอดก่อน VAT 0 บาทยื่นได้ (มติผู้ใช้ 2026-08-03) — ต่อจาก QT ที่ปิด Won ด้วยยอด 0 ได้
    // (mig 0196); ถ้าด่านนี้ยังบังคับ > 0 ใบที่ Won แล้วจะเดินต่อไม่ได้เลย
    if (!before.orderDate || !(before.lines?.length > 0)) {
      return badRequest('ข้อมูล SO ไม่ครบ: ต้องมีวันที่และรายการสินค้า');
    }
    if (!before.quotation || before.quotation.status !== 'accepted' || !before.deal || !before.projectId || !before.customerName) {
      return badRequest('เอกสารอ้างอิงไม่ครบ: ต้องมี QT Won, ดีล, โครงการ และลูกค้า');
    }
    /* ⭐ **ด่านเอกสารยืนยันคำสั่งซื้ออยู่ตรงนี้ ไม่ใช่ตอนสร้างใบ** (มติผู้ใช้ 2026-08-24)
       AE ที่ยังรอ PO จากลูกค้าต้องตั้งใบร่างไว้ก่อนได้ แต่จะส่งให้คนอื่นอนุมัติโดยไม่มี
       หลักฐานจากลูกค้าไม่ได้ · ใบเก่าที่หลักฐานอยู่ที่ใบเสนอราคาผ่านด่านนี้ตามเดิม
       (`orderConfirmationOf` อ่านสองบ้าน) */
    const confirmationGate = salesOrderConfirmationGate(before, before.quotation);
    if (confirmationGate) return badRequest(confirmationGate);
    // การยื่น = การลงนามของผู้จัดทำ (mig 0153) — สถานะ + หลักฐาน proposer ต้อง commit
    // พร้อมกันในทรานแซกชันเดียว จึงยกจาก plain UPDATE มาเป็น RPC; ผู้ยื่นที่ไม่มีลายเซ็นจะ
    // ได้ 409 + ลิงก์ /account และสถานะไม่เปลี่ยนเลย (rollback ทั้งก้อน)
    let submitResult;
    try {
      submitResult = await submitSalesOrderWithSignatureEvidence(supabase, {
        documentId: id,
        evidenceId: genId('DSE'),
        expectedUpdatedAt: before.updatedAt,
        documentFingerprint: salesOrderApprovalFingerprint(before, before.lines),
        user,
      });
    } catch (submitError) {
      return signatureEvidenceErrorResponse(submitError, { action: 'submit' });
    }
    const data = submitResult.document;
    await logThread('submit');
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `submit ${before.orderNumber} for approval (ลงนามผู้จัดทำ)`, request: req });
    // แจ้ง space ผู้อนุมัติ: มี SO รออนุมัติ (จุด clear ยอด Actual — เดิมเงียบ)
    return ok(data);
  }

  if (action === 'approve') {
    /* ⭐ ใบย้อนหลัง (0374) มาก่อนเสมอ — RPC approve_historical_sales_order ทำครบในทรานแซกชันเดียว: เอกสารแทนสัญญา
       (ออกเลข CT ด้วยไฟล์ที่ AE Sup เห็นในโมดัล) → ใบ → หยุดยอดงวด → รอบขายของโซน · **ไม่นับ Actual**
       ⛔ ทางของใบปกติข้างล่างห้ามแตะใบนี้: ลายเซ็น (CHECK บังคับว่าง) · ฉบับตรึง · financeStatus · ตัวหยุดยอดตามแผน QT
          (ไม่มีใบเสนอราคา ⇒ งวดที่คีย์ถูกทับเป็น "ชำระเต็มจำนวน" 100%) */
    if (isHistoricalOrder(before)) {
      return historicalReply('อนุมัติใบสั่งขายย้อนหลัง', () => approveHistoricalOrder({
        supabase, user, order: before, body, thread: logThread, request: req,
      }));
    }
    if (!reviewer) return forbidden('เฉพาะ AE Supervisor ที่อนุมัติใบสั่งขายได้');
    if (before.status !== 'pending_approval') return badRequest('SO ใบนี้ไม่ได้รออนุมัติ');
    // แบ่งแยกหน้าที่ยังคงเป็นค่าเริ่มต้น; Admin ใช้ break-glass ได้เมื่อยังไม่มี
    // ผู้ตรวจสอบคนที่สอง โดยต้องระบุเหตุผลซึ่งถูกเก็บกับหลักฐานแบบ immutable.
    const selfApproval = isSalesOrderSelfApproval(before, user.id);
    let overrideReason = null;
    if (selfApproval) {
      if (user.role !== 'admin') {
        return forbidden('อนุมัติ SO ที่ตัวเองสร้างหรือยื่นไม่ได้ — ต้องให้ผู้ตรวจสอบคนอื่นอนุมัติ');
      }
      const reasonError = adminOverrideReasonError(body.overrideReason);
      if (reasonError) return badRequest(reasonError);
      overrideReason = normalizeAdminOverrideReason(body.overrideReason);
    }
    let result;
    try {
      result = await approveSalesOrderWithSignatureEvidence(supabase, {
        documentId: id,
        evidenceId: genId('DSE'),
        expectedUpdatedAt: before.updatedAt,
        documentFingerprint: salesOrderApprovalFingerprint(before, before.lines),
        note: String(body.note || '').trim() || null,
        overrideReason,
        user,
      });
    } catch (approvalError) {
      return signatureEvidenceErrorResponse(approvalError);
    }
    const data = result.document;

    // Phase 7D+: ตรึง issued snapshot ของ SO จากสถานะที่อนุมัติแล้ว (best-effort — อนุมัติ
    // commit ไปแล้ว snapshot ล้มต้องไม่ roll back; RPC idempotent regenerate ได้ภายหลัง).
    // ใช้ service-role: RPC เป็น service_role + ต้องดึงรูปลายเซ็นจาก bucket ส่วนตัว
    try {
      const snapshotOrder = {
        ...before, ...data,
        lines: before.lines, deal: before.deal, quotation: before.quotation, project: before.project,
      };
      // company profile ที่เผยแพร่ ณ เวลาอนุมัติ — ตรึงลง artifact ให้ reprint ตรงเดิม (เหมือน QT)
      const company = await getPublishedCompanyProfile(supabase).catch(() => null);
      await captureIssuedSalesOrderSnapshot(getSupabaseAdmin(), {
        order: snapshotOrder, evidence: result.evidence, user, company,
      });
    } catch (snapshotError) {
      console.error('issued sales order snapshot capture failed', id, snapshotError);
    }

    /* ⭐ เข้าคิวบัญชีทันทีที่ AE Supervisor อนุมัติ (mig 0250)
       ⚠️ **ไม่แตะ Actual** — ยอดเข้าไปแล้วตอน RPC อนุมัติ บัญชีเป็นคนละแกน (มติ 2026-08-13)
       ⚠️ best-effort แบบเดียวกับ snapshot: อนุมัติ commit ไปแล้ว ตั้งธงล้มต้องไม่ roll back
       ใบที่ธงไม่ติดจะไม่โผล่ในคิวบัญชี ซึ่งกู้ได้ด้วยการอนุมัติซ้ำหรือแก้มือ
       🐞 เดิมไม่อ่าน `error` ของ update — supabase ไม่ throw ⇒ catch ข้างล่างไม่เคยทำงาน
          ธงล้มแล้วเงียบสนิทไม่มีแม้แต่ log: ใบขึ้น "อนุมัติแล้ว" แต่ financeStatus ค้าง NULL
          ซึ่งอ่านเหมือนใบก่อน mig 0250 ("ไม่มีขั้นบัญชี") ⇒ หลุดคิวบัญชีโดยไม่มีใครรู้
          ⚠️ ตอบ 500 ไม่ได้ — อนุมัติ commit แล้ว คนกดซ้ำจะเจอ "ไม่ได้รออนุมัติ" แทน */
    try {
      /* ⭐ **ใบยอด 0 ไม่ต้องเข้าคิวบัญชี** (มติ 2026-08-18 · ขยายมาแกนนี้ 26/08) —
         ตรงกับงวดชำระที่ตัดใบยอด 0 ออกอยู่แล้ว · ธงค้างเป็น NULL = "ไม่มีขั้นนี้"
         ซึ่งเป็นความหมายเดียวกับใบที่ออกก่อน mig 0250 */
      if (!paymentNotRequired(before.totalAmount)) {
        const { error: financeFlagError } = await supabase.from('sales_orders')
          .update({ financeStatus: 'pending' })
          .eq('id', id)
          .is('financeStatus', null);
        if (financeFlagError) console.error('sales order finance queue flag failed', id, financeFlagError.message);
      }
    } catch (financeFlagError) {
      console.error('sales order finance queue flag failed', id, financeFlagError);
    }

    /* ⭐ **จุดที่ยอดต่องวดหยุดเดิน** (B-4 · mig 0259) — เดิมงวด "เกิด" ตรงนี้ (0245)
       ตอนนี้งวดเกิดได้ตั้งแต่ใบยังเป็นร่าง ⇒ ตรงนี้เปลี่ยนหน้าที่เป็น **เขียนยอดทับ
       ครั้งสุดท้ายจากแผนของ QT + ยอดจริงของใบ แล้วประทับ `frozenAt`**
       · ใบที่ไม่เคยกด "เริ่มติดตาม" ยังได้งวดสร้างให้ตรงนี้เหมือนพฤติกรรมเดิม
       ⚠️ best-effort แบบเดียวกับ snapshot: อนุมัติ commit ไปแล้ว งวดล้มต้องไม่ roll back
       กู้ได้ด้วยปุ่ม "เริ่มติดตามการชำระ" + อนุมัติซ้ำ (freezeInstallments idempotent) */
    /* 🛑 review MONEY-1: ดีลนี้มี "เงินค้างจากใบที่ยกเลิก" ⇒ ห้ามยืมสลิปจากเอกสารยืนยันคำสั่งซื้อมาตั้งงวดแรก — สลิปนั้นมักเป็น
       มัดจำก้อนเดียวกับเงินค้าง ยืมแล้วโมดัลก็บอกให้กด "ยกเงินจากใบที่ยกเลิก" = เงินก้อนเดียวนับสองครั้ง (SO-26080039-0 / -043-0)
       ⚠️ อ่านไม่ขึ้น = ไม่ยืม (ทางที่ปลอดภัย — ฝ่ายขายแจ้งชำระงวดแรกเองได้เสมอ) · โมดัลอนุมัติบอกผลนี้แล้ว (salesOrderMoneyOutcome) */
    let borrowConfirmation = true;
    try {
      borrowConfirmation = !(await loadCarrySources(supabase, before)).length;
    } catch (strandedError) {
      borrowConfirmation = false;
      console.error('sales order approve: อ่านเงินค้างของดีลไม่สำเร็จ — ไม่ยืมสลิปมาตั้งงวดแรก', id, strandedError);
    }
    try {
      await freezeInstallments(supabase, {
        order: { ...before, ...data, quotation: before.quotation },
        user,
        borrowConfirmation,
      });
    } catch (installmentError) {
      console.error('sales order installment freeze failed', id, installmentError);
    }

    await logThread('approve', { overrideReason });
    await recordAudit({
      user,
      action: 'update',
      entityType: 'sales_order',
      entityId: id,
      before,
      after: data,
      summary: selfApproval
        ? `admin override approve ${before.orderNumber}: ${overrideReason}`
        : `approve ${before.orderNumber}`,
      request: req,
    });
    // แจ้งทีมขาย: SO อนุมัติแล้ว → ยอด Actual เข้าระบบ
    return ok(data);
  }

  if (action === 'reject') {
    if (!reviewer) return forbidden('เฉพาะ AE Supervisor ที่ตีกลับใบสั่งขายได้');
    if (before.status !== 'pending_approval') return badRequest('SO ใบนี้ไม่ได้รออนุมัติ');
    const reason = String(body.reason || '').trim();
    if (!reason) return badRequest('กรุณาระบุเหตุผลที่ตีกลับ');
    const now = new Date().toISOString();
    const patch = { status: 'rejected', rejectedAt: now, rejectedBy: user.id || null, rejectedByName: user.name || null, rejectionReason: reason, updatedAt: now };
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).eq('status', before.status).select('*').maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return badRequest('สถานะ SO เปลี่ยนแล้ว กรุณาโหลดใหม่');
    // ⭐ หัวใจของ PR: `rejectionReason` ถูกล้างทิ้งตอนกู้คืน/ยื่นใหม่ — เหตุผลที่
    // ตีกลับรอบก่อน ๆ จึงไม่เคยเหลือให้คนทำใบรอบถัดไปอ่าน
    await logThread('reject', { reason });
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `reject ${before.orderNumber}: ${reason}`, request: req });
    // แจ้งทีมขาย: SO ถูกตีกลับ ให้ผู้ยื่นแก้แล้วยื่นใหม่
    return ok(data);
  }

  if (action === 'cancel') {
    /* ⭐ PR3 (mig 0378 · มติเจ้าของ 23/09 D4): **ใบ pipeline ที่มีเงินรับแล้วยกเลิกได้** — เงินอยู่กับใบนี้ต่อเป็น
       "เงินค้างจากใบที่ยกเลิก" (ไม่หาย · ไม่ต้องถอนคำรับรอง) แล้วออกทางยกเข้าใบใหม่ของดีลเดียวกัน หรือบัญชีบันทึกคืนเงิน
       ⇒ ด่าน "งวดรับรองแล้ว" ย้ายเข้าบล็อกใบย้อนหลังข้างล่าง (ใบย้อนหลังไม่มีทางยก/คืน) — มติ 24/09 เหลือเฉพาะงวดปกติ
       · RPC ย้อน Won (0170) และ UPDATE ยกเลิกธรรมดาไม่เปลี่ยน · StatusNotice ในโมดัลบอกผลเรื่องเงินก่อนกด (salesOrderMoneyOutcome) */
    // Once Tax owns a downstream filing, cancelling/reversing the source would
    // invalidate its immutable snapshot. Delete the eligible filing first.
    const { data: filing, error: filingError } = await supabase
      .from('orders')
      .select('id, status')
      .eq('salesOrderId', id)
      .limit(1)
      .maybeSingle();
    const filingSchemaMissing = filingError
      && (filingError.code === 'PGRST204' || filingError.code === '42703' || (filingError.message || '').includes('salesOrderId'));
    if (filingError && !filingSchemaMissing) return fail(filingError.message, 500);
    if (filing) {
      // บอกทางออกด้วย ไม่ใช่แค่บอกว่าไม่ได้ — ปุ่มอื่นทุกปุ่มที่แก้ใบนี้ก็ถูกใบยื่นบล็อก
      // เหมือนกัน (ย้อนการอนุมัติ/ออก Rev./ลบถาวร) ผู้ใช้จึงวนหาปุ่มไม่เจอถ้าไม่ชี้ทาง
      return badRequest(
        `ยกเลิกใบสั่งขายไม่ได้ เพราะมีใบยื่นชำระภาษี ${filing.id} (${filing.status}) ผูกอยู่`
        + ' — ต้องลบใบยื่นที่หน้า "ภาษี › การยื่นชำระ" ก่อน แล้วจึงยกเลิก SO ได้',
      );
    }
    // เหตุผลยกเลิกแบบมีโครงสร้าง (มติ 2026-07-18): เลือกรหัสจากตัวเลือกมาตรฐาน +
    // หมายเหตุอิสระ (บังคับหมายเหตุเมื่อเลือก "อื่น ๆ"). เก็บทั้ง code + note.
    const reasonCode = String(body.reasonCode || '').trim();
    const note = String(body.reason || body.note || '').trim();
    if (!isValidCancelReasonCode(reasonCode)) return badRequest('กรุณาเลือกเหตุผลที่ยกเลิก ใบสั่งขาย');
    if (reasonCode === 'other' && !note) return badRequest('เลือก "อื่น ๆ" ต้องระบุหมายเหตุ');
    if (before.status === 'cancelled') return badRequest('ใบสั่งขายนี้ถูกยกเลิกแล้ว');
    if (before.status === 'pending_approval' && !reviewer) return forbidden('รายการที่รออนุมัติต้องให้ AE Supervisor ดำเนินการ');
    // ยกเลิก SO ที่อนุมัติแล้ว = ถอนยอด Actual ที่ผ่านการอนุมัติ → ต้องเป็นผู้ตรวจสอบ
    // เท่านั้น (มติผู้ใช้ 2026-07-16): สมมาตรกับตอนอนุมัติ ไม่ให้ AE ถอนฝ่ายเดียว
    if (before.status === 'approved' && !reviewer) {
      return forbidden(isHistoricalOrder(before)
        // ใบย้อนหลังไม่นับ Actual — สิ่งที่ถอนคือเอกสารแทนสัญญาและรอบขายของโซน (ทางแก้หลังอนุมัติ = ยกเลิกแล้วคีย์ใหม่)
        // ผู้ยกเลิกได้ = ผู้อนุมัติได้ (isSalesOrderReviewer: CD · CM · AE Sup · Admin — มติ 24/09) ไม่ใช่ AE Sup คนเดียว
        ? 'ยกเลิกใบย้อนหลังที่อนุมัติแล้วต้องให้ผู้จัดการฝ่ายขายดำเนินการ (เอกสารแทนสัญญาถูกยกเลิกตาม)'
        : 'ยกเลิก SO ที่อนุมัติแล้วต้องให้ AE Supervisor ดำเนินการ (ถอนยอด Actual)');
    }
    /* ⛔ review MONEY-2: ใบที่ถือเงิน (งวด confirmed/reported) ยกเลิกได้เฉพาะผู้ตรวจสอบ — **ทุกสถานะ** ไม่ใช่แค่รออนุมัติ/อนุมัติแล้ว
       🐞 PR3 ถอด paymentLockReason ออกจากใบ pipeline ⇒ ใบที่ย้อนการอนุมัติ (D3 รับเงินต่อได้) และใบ Rev. ร่างที่งวดเงินย้ายมา (0376)
         เหลือด่านแค่สิทธิ์แก้งานขาย = AE เจ้าของดีลคนเดียวทำให้เงินที่รับรองแล้วค้างอยู่กับใบที่ยกเลิกได้ (ปรับแผน/ยกเงินเป็นของ
         AE Sup/admin/บัญชีทั้งนั้น) · ปุ่มถามตัวเดียวกัน (canCancelSalesOrder → salesOrderCancelNeedsReviewer)
       ⚠️ อ่านงวดสดแบบโยน error — อ่านไม่ขึ้น ≠ ไม่มีเงิน · ใบย้อนหลังมีด่านของตัวเองข้างล่าง (งวดปกติที่มีเงิน · มติ 24/09) */
    if (!reviewer && !isHistoricalOrder(before)) {
      let moneyRows;
      try { moneyRows = await loadInstallments(supabase, id); }
      catch (error) { return fail(`อ่านงวดชำระของใบไม่สำเร็จ: ${error.message} — ยังไม่ได้ยกเลิก`, 500); }
      if (salesOrderCancelNeedsReviewer(before, moneyRows)) {
        return forbidden('ใบนี้มีเงินรับแล้ว/รอบัญชีตรวจ — ยกเลิกต้องให้ AE Supervisor ดำเนินการ (เงินจะค้างอยู่กับใบที่ยกเลิก)');
      }
    }
    /* ⭐ ใบย้อนหลัง (มติเจ้าของ 24/09 · mig 0387 — "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ"):
       ผู้จัดการฝ่ายขายยกเลิกใบที่อนุมัติแล้วได้แม้งวดยกมารับรองแล้ว/รอตรวจ — งวดยกมาเป็นโมฆะตามใบ
       · รอตรวจ → trigger sales_orders_historical_cancel_settle ตีกลับให้ในทรานแซกชันเดียวกับ UPDATE ข้างล่าง (เหตุบอกว่าเป็น
         การยกเลิก ไม่ใช่บัญชีตีกลับ) ⇒ ไม่ค้างคิว/ป้ายเมนูของบัญชี · ⛔ ห้ามพลิกงวดฝั่ง JS (ครึ่งทาง = ใบอนุมัติอยู่แต่งวดถูกตีกลับ)
       · รับรองแล้ว → แถวคงเป็นประวัติ (installmentVoid ตัดออกจากทะเบียน/ยอด) · หมายเหตุบังคับ ≥ 10 ตัวอักษร (บัญชีเห็นในประวัติ)
       ⛔ งวดปกติที่รับเงินในระบบแล้ว/รอบัญชีตรวจยังบล็อก (historicalCancelBlock) — ใบย้อนหลังไม่มีทางยก/คืนเงิน และล็อกทั้งใบ
          ปิดทุกคำสั่งของใบที่ยกเลิก ⇒ บัญชีตีกลับก่อน (ที่รับรองแล้ว: ถอนคำรับรองแล้วตีกลับ) · trigger ของ 0387 กันซ้ำตอนแข่งกัน (409)
       🛑 fail closed (review 25/09): งวดยกมาที่มีเงินปล่อยให้ trigger จัดการได้ก็ต่อเมื่อ**ฐานยืนยัน**ว่า trigger ของ 0387 อยู่และเปิดอยู่
          (historicalCancelSettleReady) — โค้ดขึ้น prod ก่อนรันมิกได้ (deploy อัตโนมัติวันละ 3 รอบไม่ถามมิก) แล้วงวดยกมาจะค้าง
          "รอตรวจ" บนใบที่ยกเลิกถาวร (ล็อกทั้งใบปิดปุ่มบัญชี · ป้ายเมนูบัญชี +1 · รันมิกทีหลังไม่ซ่อม) ⇒ ไม่ยืนยัน = กติกาก่อนมติ (503)
          · ถามเฉพาะเมื่องวดยกมามีเงิน — ใบอื่นคงสิทธิ์เดิมทุกตัวอักษร · ถามไม่ขึ้น (เน็ต/สิทธิ์) = หยุด ไม่ถือว่าพร้อม
       · หมายเหตุบังคับถามหลังด่านฐาน — ฐานไม่พร้อมอย่าให้คนพิมพ์หมายเหตุแล้วค่อยบอกว่าทำไม่ได้ · trigger ตัดสินซ้ำ (บัญชีรับรองแทรก)
       ⚠️ อ่านงวดสดแบบโยน error — `before.installments` ของ loadOrder กลืนการอ่านพังเป็นรายการว่าง = ด่านเปิดเงียบ */
    let liveInstallments = null;
    let voidingOpening = null;
    if (isHistoricalOrder(before)) {
      try { liveInstallments = await loadInstallments(supabase, id); }
      catch (error) { return fail(`อ่านงวดชำระของใบไม่สำเร็จ: ${error.message}`, 500); }
      const moneyBlock = historicalCancelBlock(before, liveInstallments);
      if (moneyBlock) return badRequest(moneyBlock);
      voidingOpening = historicalCancelOpening(before, liveInstallments);
      if (voidingOpening) {
        const settle = await historicalCancelSettleReady(supabase);
        if (settle.error) return fail(`ตรวจความพร้อมของฐานไม่สำเร็จ: ${settle.error} — ยังไม่ได้ยกเลิก ลองใหม่อีกครั้ง`, 500);
        const settleBlock = historicalCancelSettleBlock(voidingOpening, settle.ready);
        if (settleBlock) return fail(settleBlock, 503);
      }
      const noteError = historicalCancelNoteError(before, liveInstallments, note);
      if (noteError) return badRequest(noteError);
    }

    // ย้อน Won พร้อมยกเลิก SO (มติ 2026-07-18): เมื่อลูกค้าหลุด (เหตุฝั่งลูกค้า) ให้ถอย
    // ดีลออกจาก Won ด้วย — atomic ผ่าน RPC (ยกเลิก SO + ใบเสนอราคา accept → cancelled +
    // ถอยดีล). ทำได้เฉพาะ SO ที่อนุมัติแล้ว (ตัวที่นับ Actual + ดีล Won).
    // ⛔ มติ 25/09 ข้อ 4: ทางนี้ไม่เปิดใบพี่น้องที่ถูกปิดตอนรับใบ — มีแต่ "ย้อนการรับ" (unaccept · mig 0388) ที่เปิดคืน
    //   ใบที่รับกลายเป็น 'cancelled' และดีลมักเสนอราคาใหม่ทั้งชุด ⇒ ใบ closed คงปิด (ตรา closedByAccept ชี้ใบที่ยกเลิกแล้ว
    //   ย้อนการรับใบอื่นทีหลังก็ไม่เปิดมัน · ใบรุ่นเก่าไม่มีตราก็เหมือนกัน แม้ใบที่ยกเลิกจะถูกลบทีหลัง — ย้อนการรับเปิด
    //   ใบรุ่นเก่าเฉพาะที่ updatedAt = acceptedAt ของใบที่ย้อน) · ต้องการใบเดิมกลับ = สร้างใบใหม่ / ออก Rev. จากใบที่ยังเปิดอยู่
    const reverseTo = String(body.reverseTo || '').trim();
    /* ⛔ ใบสั่งขายย้อนหลัง (mig 0360) ยกเลิกได้อย่างเดียว — ดีลของมันถือใบย้อนหลังทุกใบของลูกค้า × AE คู่นี้
       ย้อน Won = พาใบอื่นที่ยังเดินอยู่หลุดไปด้วย (และ RPC ย้อนต้องมีใบเสนอราคาที่ใบนี้ไม่มี)
       ยกเลิกเฉย ๆ ดีลยัง Won · รอบขายของโซนหยุดตามสถานะใบแม่ */
    if (reverseTo && isHistoricalOrder(before)) {
      return badRequest('ใบสั่งขายย้อนหลังยกเลิกได้อย่างเดียว — ย้อน Won ไม่ได้ (ดีลของใบย้อนหลังถือใบทุกใบของลูกค้าและ AE นี้)');
    }
    if (reverseTo) {
      if (!isValidReversalTarget(reverseTo)) return badRequest('ปลายทางการย้อน Won ไม่ถูกต้อง');
      if (before.status !== 'approved') return badRequest('ย้อน Won ได้เฉพาะ SO ที่อนุมัติแล้ว');
      if (reverseTo === 'lost' && !String(body.lostReason || '').trim()) {
        return badRequest('เลือกปลายทาง "Lost" ต้องระบุเหตุผล');
      }
      const { data: result, error: revErr } = await supabase.rpc('cancel_sales_order_with_reversal_atomic', {
        p_order_id: id,
        p_reason_code: reasonCode,
        p_reason_note: note || null,
        p_actor_id: user.id || null,
        p_actor_name: user.name || null,
        p_reverse_to: reverseTo,
        p_lost_reason: String(body.lostReason || '').trim() || null,
        p_history_id: genId('DSH'),
        p_forecast_id: genId('DFC'),
      });
      if (revErr) {
        const clientErr = /reversal_|sales_order_not_|deal_not_/.test(revErr.message || '');
        return fail(revErr.message, clientErr ? 400 : 500);
      }
      const revReason = cancelReasonLabel(reasonCode) + (note ? ` — ${note}` : '');
      const targetLabel = reverseTo === 'lost' ? 'Lost' : 'เปิดใหม่';
      await logThread('cancel', { reason: `${revReason} → ดีล ${targetLabel}` });
      await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: result?.order, summary: `cancel + reverse Won ${before.orderNumber}: ${revReason} → ดีล ${targetLabel}`, request: req });
      if (before.dealId) {
        await recordAudit({ user, action: 'update', entityType: 'sales_deal', entityId: before.dealId, after: result?.deal, summary: `ย้อน Won (${targetLabel}) จากยกเลิก SO ${before.orderNumber}: ${revReason}`, request: req });
      }
      // แจ้งทีมขาย: ดีลถูกถอนจาก Won (จุดสำคัญ — ยอด Actual ถูกนำออก)
      // FM-SA-04 (mig 0370): เอกสารใบสเปคของใบนี้เป็น void · ล้ม = SO ยังสำเร็จ + warning
      const specWarning = await voidSpecDocumentsAfterCancel({ supabase, user, req, order: before });
      return ok(specWarning ? { ...(result?.order || {}), warning: specWarning } : (result?.order || {}));
    }

    const patch = {
      status: 'cancelled', cancelledAt: new Date().toISOString(),
      cancelledBy: user.name || user.id || null,
      cancelReasonCode: reasonCode, cancelReason: note || null,
      updatedAt: new Date().toISOString(),
    };
    // optimistic guard .eq('status', before.status) — เหมือน save/submit/approve/reject
    // กัน TOCTOU: คนอื่น submit (draft→pending) พร้อมกัน ต้องไม่ยกเลิกทับสถานะที่เปลี่ยนไป
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).eq('status', before.status).select('*').maybeSingle();
    if (error) {
      // ใบย้อนหลัง: trigger ของ 0374 (reopen_forbidden ฯลฯ) มีรหัสไทยในตารางกลาง · ใบปกติคงข้อความเดิม
      if (isHistoricalOrder(before)) {
        const mapped = documentWorkflowError(error, { context: `historical sales order cancel ${id}` });
        return fail(mapped.message, mapped.status);
      }
      return fail(error.message, 500);
    }
    if (!data) return badRequest('สถานะ SO เปลี่ยนแล้ว กรุณาโหลดใหม่');
    /* ⭐ ใบย้อนหลัง: เอกสารแทนสัญญาถูกยกเลิกตามใบ **ในทรานแซกชันเดียวกัน** (trigger sales_orders_historical_void_contract_upd
       ของ 0374) — ที่นี่แค่อ่านผลมาบอกบนจอ/ใน audit · ⛔ ห้ามมีตัวยกเลิกสัญญาฝั่ง JS ซ้ำ (ครึ่งทาง = สัญญาค้างล็อก) */
    const voidedContract = await historicalContractVoided(supabase, before);
    /* ⭐ งวดยกมาหลังยกเลิกจริง (review 25/09) — สรุป audit ของใบ/ของงวด + คำตอบ ตัดสินจากแถวที่อ่าน**หลัง**ยกเลิก
       (historicalOpeningSettled) ไม่ใช่ค่าที่อ่านก่อน UPDATE: บัญชีรับรองแทรกระหว่างทาง = เดิม audit บอก "รอรับรอง" ทั้งที่เงินรับรองแล้ว
       ⚠️ อ่านแบบไม่ขวาง — การยกเลิกสำเร็จไปแล้ว อ่านไม่ขึ้น = ใช้ค่าก่อนเขียน ไม่ใช่ตอบ error ทับ
       🛑 งวดยกมายังค้าง "รอตรวจ" หลังยกเลิก = trigger ของ 0387 ไม่ทำงานทั้งที่ถามแล้วว่าพร้อม ⇒ เตือนดัง ไม่เงียบ */
    let afterOpening = null;
    let settledOpening = null;
    if (voidingOpening) {
      let afterRows = null;
      try { afterRows = await loadInstallments(supabase, id); } catch { afterRows = null; }
      afterOpening = afterRows?.find((row) => row.id === voidingOpening.row.id) || null;
      settledOpening = historicalOpeningSettled(voidingOpening, afterRows);
    }
    const settleWarning = settledOpening?.stuck ? HISTORICAL_CANCEL_SETTLE_STUCK : null;
    const summaryReason = cancelReasonLabel(reasonCode) + (note ? ` — ${note}` : '');
    const openingSummary = historicalOpeningVoidSummary(settledOpening);
    await logThread('cancel', { reason: summaryReason });
    await recordAudit({
      user, action: 'update', entityType: 'sales_order', entityId: id,
      // ใบย้อนหลัง: งวดที่อ่านสดตอนตัดสิน (รวมงวดยกมาที่เป็นโมฆะ + ผู้รับรอง) — ประวัติของเงินที่ออกจากทะเบียนบัญชี
      before: liveInstallments ? { ...before, installments: liveInstallments } : before,
      after: data,
      summary: `cancel ${before.orderNumber}: ${summaryReason}`
        + (voidedContract ? ` · ${voidedContractLabel(voidedContract)} ถูกยกเลิกตามใบ` : '')
        + (openingSummary ? ` · ${openingSummary}` : ''),
      request: req,
    });
    /* ⭐ แถว audit ของงวดยกมาที่โมฆะ (มติ 24/09) — ประวัติงวดที่บัญชีเปิดดูต้องเห็นว่าเงินที่รับรองไว้หายไปเพราะใบถูกยกเลิก
       (ไม่มีกระดิ่งถึงบัญชี — กระดิ่งมีแค่คำร้อง/แจ้งปัญหา/มอบหมายงาน) · entityId = ใบ แบบเดียวกับ "เริ่มติดตามการชำระ"
       · before = แถวที่อ่านก่อนเขียน · after = แถวที่อ่านหลังยกเลิก (อ่านไม่ขึ้น = ว่าง) */
    if (voidingOpening) {
      await recordAudit({
        user, action: 'update', entityType: 'sales_order_installments', entityId: id,
        before: voidingOpening.row,
        after: afterOpening,
        summary: `${openingSummary} — ยกเลิก ${before.orderNumber}: ${summaryReason}`
          + (settleWarning ? ` · ⚠️ ${settleWarning}` : ''),
        request: req,
      });
    }
    // FM-SA-04 (mig 0370): เอกสารใบสเปคของใบนี้เป็น void · ล้ม = SO ยังสำเร็จ + warning
    const specWarning = [
      await voidSpecDocumentsAfterCancel({ supabase, user, req, order: before }),
      settleWarning,
    ].filter(Boolean).join(' · ');
    const result = isHistoricalOrder(before)
      ? {
        ...data,
        contractVoided: Boolean(voidedContract),
        contractVoidedLabel: voidedContract ? voidedContractLabel(voidedContract) : '',
        openingVoided: settledOpening?.status || null,
      }
      : data;
    return ok(specWarning ? { ...result, warning: specWarning } : result);
  }

  /* ── ขั้นบัญชีปิดใบ (mig 0250 · สลับมาอยู่ท้ายวงตามมติผู้ใช้ 2026-08-30) ────
     ⚠️ **ไม่แตะ `status` หรือ `actualAmount`** — ยอดขายของ SA เข้าตั้งแต่ AE Sup
     อนุมัติและไม่ขยับตามการตัดสินของบัญชี (มติผู้ใช้ 2026-08-13 ยังใช้อยู่)
     ⭐ ด่านอยู่ที่ `financeActionError` ตัวเดียวกับที่หน้าเว็บใช้ซ่อนปุ่ม
     ⚠️ **ต้องอ่านงวดชำระสดส่งเข้าด่าน** — เงื่อนไขปิดใบคือ "เก็บครบทุกงวด"
        อ่านจากฐานที่นี่ ไม่เชื่อค่าที่ client ส่งมา (แพตเทิร์นเดียวกับด่านไล่ลำดับงวด)
     ⚠️ `finance_reject`/`finance_resubmit` ถอดออกแล้ว — ไม่มีตีกลับทั้งใบอีก
        ของที่ตีกลับได้คือ *รายงวด* ที่ route `/installments` */
  if (action === 'finance_approve') {
    const installments = await loadInstallments(supabase, id);
    const gate = financeActionError(before, action, user, { installments });
    if (gate) return badRequest(gate);

    /* ⭐ **บัญชีอนุมัติ = การลงนามในช่อง "ฝ่ายบัญชี" ของเอกสาร** (mig 0251 · มติผู้ใช้
       2026-08-13) — ช่องที่สามมีอยู่บนใบตั้งแต่ต้นแต่ว่างมาตลอดเพราะไม่มีใครเซ็น
       ⚠️ ตีกลับ/ส่งตรวจใหม่ **ไม่เซ็น** — ลายเซ็นคือการรับรอง ไม่ใช่การบันทึกว่าดูแล้ว
       ⚠️ RPC ตรึงลายเซ็นกับสถานะในทรานแซกชันเดียว ⇒ ไม่มีทางได้ใบที่ผ่านแล้วแต่ไม่มี
       ลายเซ็น หรือมีหลักฐานลายเซ็นค้างโดยใบไม่ผ่าน */
    if (action === 'finance_approve') {
      let result;
      try {
        result = await financeApproveSalesOrderWithSignatureEvidence(supabase, {
          documentId: id,
          evidenceId: genId('DSE'),
          expectedUpdatedAt: before.updatedAt,
          /* fingerprint ของ **เนื้อหาที่บัญชีเห็นตอนเซ็น** ไม่ใช่ค่าที่ตรึงตอน AE Sup
             อนุมัติ — ถ้าเนื้อหาถูกแก้ระหว่างทาง สองค่านี้จะต่างกันและเป็นหลักฐานเอง */
          documentFingerprint: salesOrderApprovalFingerprint(before, before.lines),
          note: String(body.note || '').trim() || null,
          user,
        });
      } catch (signatureError) {
        return signatureEvidenceErrorResponse(signatureError);
      }
      const data = result.document;

      /* ออกเอกสารฉบับใหม่ทับ (มติผู้ใช้ 2026-08-13) — payload มีชื่อ/เวลาของผู้ตรวจ
         ฝั่งบัญชีอยู่ด้วย ⇒ fingerprint เปลี่ยน ⇒ RPC ออก issueSequence ถัดไปให้เอง
         ⚠️ ส่ง **evidence ของผู้อนุมัติ** ไม่ใช่ของบัญชี เพราะ RPC ตรวจว่าตรงกับ
         `sales_orders.signatureEvidenceId` (ใบยังเป็นฉบับที่ AE Sup อนุมัติใบเดิม)
         ⚠️ best-effort เหมือนตอนอนุมัติ: การตรวจ commit ไปแล้ว ออกเอกสารล้มต้องไม่
         roll back — RPC idempotent ออกซ้ำได้ภายหลัง */
      try {
        const { data: approverEvidence } = await supabase
          .from('document_signature_evidence').select('*')
          .eq('id', before.signatureEvidenceId).maybeSingle();
        if (approverEvidence) {
          const company = await getPublishedCompanyProfile(supabase).catch(() => null);
          await captureIssuedSalesOrderSnapshot(getSupabaseAdmin(), {
            order: {
              ...before, ...data,
              lines: before.lines, deal: before.deal, quotation: before.quotation, project: before.project,
            },
            evidence: approverEvidence,
            user,
            company,
          });
        }
      } catch (reissueError) {
        console.error('finance re-issue sales order snapshot failed', id, reissueError);
      }

      await logThread(action, {});
      await recordAudit({
        user,
        action: 'update',
        entityType: 'sales_order',
        entityId: id,
        before,
        after: data,
        summary: `บัญชีปิดใบ ${before.orderNumber} (ลงนามแล้ว · เก็บครบทุกงวด)`,
        request: req,
      });
      return ok(data);
    }

  }

  if (action === 'restore') {
    if (user.role !== 'admin') return forbidden('เฉพาะผู้ดูแลระบบที่คืนสถานะใบสั่งขายได้');
    /* ใบสั่งขายย้อนหลังที่ยกเลิกแล้วคืนเป็นร่างไม่ได้ — ตั้งแต่ 0374 ใบย้อนหลังมีร่างแล้ว (CHECK ยอมร่างที่ approvedAt ว่าง)
       ⇒ ตัวกันที่ฐานคือ **trigger sales_orders_historical_no_reopen** (อนุมัติ/ยกเลิก → ร่าง/รออนุมัติ/ตีกลับ = raise
       historical_so_reopen_forbidden) ไม่ใช่ CHECK อีกแล้ว · patch ข้างล่างล้าง approvedAt ⇒ ถ้าไม่มีทั้งด่านนี้และ trigger
       ใบที่เคยอนุมัติ (รอบขายของโซน · เลข CT ของเอกสารแทนสัญญาที่ถูกยกเลิก) จะกลับมาเป็นร่างที่แก้ได้ · ตอบไทยก่อนถึงฐาน */
    if (isHistoricalOrder(before)) {
      // ด่านนี้มาก่อนเช็คสถานะ ⇒ ข้อความต้องไม่ระบุสถานะ (ใบที่ยังไม่ยกเลิกก็ได้คำนี้)
      return fail('ใบสั่งขายย้อนหลังคืนเป็นร่างไม่ได้ — คีย์ใบใหม่แทน', 409);
    }
    if (before.status !== 'cancelled') return badRequest('ใบสั่งขายนี้ไม่ได้อยู่ในสถานะยกเลิก');
    /* ⛔ PR3 (mig 0378): เงินของใบนี้ยกไปใบใหม่แล้ว หรือบัญชีบันทึกคืนลูกค้าแล้ว = ใบนี้ไม่ใช่เจ้าของเงินก้อนนั้นอีก
       ⇒ คืนเป็นร่างไม่ได้ (เงินก้อนเดียวจะมีสองที่ที่อ้างว่าเป็นของตัวเอง) — ให้ออกใบใหม่ · เงินค้างที่ยังอยู่กับใบ = กู้คืนได้ตามเดิม
       ⚠️ อ่านสดแบบโยน error — อ่านไม่ขึ้น ≠ ไม่มีเงินย้ายออก */
    let moneyRows;
    let carriedAway;
    try {
      moneyRows = await loadInstallments(supabase, id);
      carriedAway = await loadMovedOut(supabase, id, { reason: 'carry' });
    } catch (error) { return fail(`ตรวจเงินของใบไม่สำเร็จ: ${error.message} — ยังไม่ได้คืนสถานะ`, 500); }
    const moneyBlock = cancelledMoneyRestoreBlock(moneyRows, carriedAway);
    if (moneyBlock) return fail(moneyBlock, 409);
    /* ⛔ QT ต้องยัง Won และไม่มีใบอื่นของ QT เดียวกันที่ยังใช้งาน (`salesOrderRestoreBlock`)
       🐞 SO-26080039-0: กู้คืนหลัง QT-26080037-4 ถูกถอด Won/ออก QT-5 แล้ว ⇒ ร่างที่ยื่นไม่ได้ตลอดไปแต่ยังรับรองเงินได้
         แล้ว SO-26080043-0 ออกจาก QT-5 ⇒ ดีลเดียวสอง SO · สลิปเดียวรับรองสองใบ
       ⚠️ อ่านใบพี่น้องสด + เช็ก error (อ่านไม่ขึ้น ≠ ไม่มีใบซ้ำ) · limit กันแถวไม่จำกัด (ของจริงมีได้ไม่กี่ใบต่อ QT) */
    const { data: siblings, error: siblingError } = await supabase.from('sales_orders')
      .select('id, "orderNumber", status, "supersededById"')
      .eq('quotationId', before.quotationId)
      .neq('id', id)
      .limit(50);
    if (siblingError) return fail(`ตรวจใบสั่งขายอื่นของใบเสนอราคานี้ไม่สำเร็จ: ${siblingError.message} — ยังไม่ได้คืนสถานะ`, 500);
    // `before.quotation` มาจาก loadOrder ซึ่งโยน error เมื่ออ่าน QT พลาด (review R1) ⇒ null ตรงนี้ = ไม่มี QT จริง
    const restoreBlock = salesOrderRestoreBlock(before, siblings);
    if (restoreBlock) return fail(restoreBlock, 409);
    // คืนเป็น draft สะอาด: ล้างทั้งฟิลด์ยกเลิก/อนุมัติ และ submitted*/rejected* ที่ค้าง
    // (เดิมเหลือ rejectionReason → หน้ารายละเอียดโชว์ป้าย "ตีกลับ" บน draft ใหม่)
    const patch = {
      status: 'draft',
      cancelledAt: null, cancelledBy: null, cancelReason: null, cancelReasonCode: null,
      approvedAt: null, approvedBy: null, approvedByName: null, approvalNote: null,
      submittedAt: null, submittedBy: null, submittedByName: null,
      rejectedAt: null, rejectedBy: null, rejectedByName: null, rejectionReason: null,
      updatedAt: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).eq('status', before.status).select('*').maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return badRequest('สถานะ SO เปลี่ยนแล้ว กรุณาโหลดใหม่');
    await logThread('restore');
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `restore ${before.orderNumber}`, request: req });
    return ok(data);
  }

  return badRequest('คำสั่งไม่ถูกต้อง');
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (user.role !== 'admin') return forbidden('เฉพาะผู้ดูแลระบบที่ลบใบสั่งขายได้');
  const { id } = await ctx.params;
  let before;
  try { before = await loadOrder(supabase, id); }
  catch (error) { return fail(`โหลดใบสั่งขายไม่สำเร็จ: ${error.message}`, 500); }
  if (!before) return notFound('ไม่พบ ใบสั่งขาย');

  // ?dryRun=1 = พรีวิวว่าจะทำลายอะไร (หลักฐาน/ฉบับตรึง) — ใช้เส้นทางเดียวกับตอนลบจริง
  /* ⭐ พรีวิวบอกด่านที่ break-glass ข้ามไม่ได้ตั้งแต่พรีวิว (review UI-6) — สายโซ่ Rev. · งวดที่ย้ายไปจากใบนี้ (อ่านสด)
     🐞 เดิมพรีวิวลิสต์ "สิ่งที่จะถูกทำลาย" ของใบที่ลบไม่ได้จริง แล้ว 409 โผล่หลังกด "ยืนยันบังคับลบ" · อ่านไม่ขึ้น = blocked (ไม่ใช่ลบได้) */
  if (isDryRun(req)) {
    const chain = salesOrderRevisionChainDeleteBlock(before);
    if (chain) return ok({ dryRun: true, cascade: [], notes: [chain], blocked: true });
    let movedOutPreview;
    try { movedOutPreview = await loadMovedOut(supabase, id); }
    catch (error) {
      return ok({ dryRun: true, cascade: [], notes: [`ตรวจงวดที่ย้ายไปจากใบนี้ไม่สำเร็จ: ${error.message}`], blocked: true });
    }
    const preview = await salesOrderForcePreview(supabase, before, { movedOut: movedOutPreview });
    return ok({ dryRun: true, ...preview });
  }
  // ?force=1 = break-glass ผู้ดูแลระบบ (mig 0152) ลบใบที่มีหลักฐาน/ฉบับตรึงได้ — มติผู้ใช้
  // 2026-07-25; เส้นทางปกติยังยอมเฉพาะร่างที่ไม่เคยเข้า workflow เหมือนเดิม
  const force = isForceRequest(req);
  // ด่าน revision chain มาก่อน force — break-glass ก็ข้าม FK RESTRICT ไม่ได้อยู่ดี
  // (force_delete_sales_order ล้างหลักฐาน/ฉบับตรึง ไม่ได้ล้าง pointer ของอีกฉบับ)
  const chainBlock = salesOrderRevisionChainDeleteBlock(before);
  if (chainBlock) return fail(chainBlock, 409);
  /* ⛔ PR3 (mig 0378) — งวดที่ย้ายไปจากใบนี้ (ออก Rev. 0376 · ยกเงิน 0378) ยังใช้สลิป/ใบกำกับในโฟลเดอร์ของใบนี้
     ⇒ ลบใบแล้ว purgePrivateEvidence กวาดโฟลเดอร์ทิ้ง = หลักฐานเงินของใบอื่นหาย (บทเรียน SO-26080125-0) · มาก่อน force
       เหมือนด่าน chain (break-glass ก็ห้ามทำลายหลักฐานของเงินที่ย้ายไปแล้ว) · อ่านไม่ขึ้น = หยุดก่อนลบ */
  let movedOut;
  try { movedOut = await loadMovedOut(supabase, id); }
  catch (error) { return fail(`ตรวจงวดที่ย้ายไปจากใบนี้ไม่สำเร็จ: ${error.message} — ยังไม่ได้ลบใบ`, 500); }
  const movedBlock = movedOutDeleteBlock(movedOut);
  if (movedBlock) return fail(movedBlock, 409);
  // ใบยื่นภาษีมาก่อน force เช่นกัน — RPC break-glass ไม่ล้างตาราง orders ให้ ถ้าไม่ดัก
  // ตรงนี้จะไปพังที่ FK RESTRICT แล้วได้ข้อความกลาง ๆ ที่ชี้ทางผิด ("ใช้ยกเลิก SO แทน"
  // ซึ่งใบยื่นก็บล็อกเหมือนกัน = ผู้ใช้วนกลับที่เดิม)
  const filings = await exciseFilingsOfSalesOrder(supabase, id);
  if (filings.length) return fail(exciseFilingBlockMessage(filings, 'ใบสั่งขาย'), 409);
  /* ── ใบสั่งขายย้อนหลัง (mig 0360 → 0374): ลบแบบปกติ = ทาง undo ของคนคีย์ ─────────────────────────────
     ⭐ ได้เฉพาะตอนยังไม่มีอะไรปลายน้ำผูก (historicalDeleteBlock) — ติดเมื่อไรใช้บังคับลบหลังอ่านพรีวิว
     ⭐ 0374: ใบที่ยังไม่เคยอนุมัติ (ร่าง/รออนุมัติ/ตีกลับ/ยกเลิกก่อนอนุมัติ) ลบแบบปกติได้ (canHardDeleteSalesOrder)
       · อนุมัติแล้ว = มีรอบขายของโซน ⇒ บังคับลบ · เอกสารแทนสัญญาถูกยกเลิกตามใบในทรานแซกชันเดียวกัน
         (trigger sales_orders_historical_void_contract_del ของ 0374 — ไม่มีตัวยกเลิกฝั่ง JS · ที่นี่แค่อ่านผลลง audit)
     ⚠️ รอบขายของโซนเป็น ON DELETE CASCADE (0297) · service_plans.salesOrderId ไม่มี FK (0188)
       ⇒ โหลดทั้งสองก้อนเก็บลง audit ก่อนลบ แล้วปลดรอบบริการที่ชี้ใบนี้หลังลบ (ไม่งั้นชี้ใบที่ไม่มีแล้ว)
     ⚠️ อ่านไม่ขึ้น ≠ ไม่มี — หยุดก่อนลบ
     🐞 งวดต้องอ่านใหม่ตรงนี้ ห้ามเชื่อ `before.installments` — loadOrder กลืน error ของงวดเป็น [] (.catch)
       ⇒ อ่านงวดสะดุดครั้งเดียว = ด่านเห็น "ไม่มีงวดคอนเฟิร์ม/ใบกำกับ" แล้วลบแบบปกติผ่าน ·
       งวดเป็น ON DELETE CASCADE (0245) ⇒ งวดที่บัญชีคอนเฟิร์มแล้วหายเงียบพร้อมสลิป */
  const historical = isHistoricalOrder(before);
  let zoneTerms = [];
  let servicePlans = [];
  let installmentRows = [];
  if (historical) {
    const [termsResult, plansResult, installmentsResult] = await Promise.all([
      fetchAllResult(() => supabase.from('service_zone_terms').select('*').eq('salesOrderId', id).order('id', { ascending: true })),
      fetchAllResult(() => supabase.from('service_plans').select('*').eq('salesOrderId', id).order('id', { ascending: true })),
      fetchAllResult(() => supabase.from('sales_order_installments').select('*').eq('salesOrderId', id).order('id', { ascending: true })),
    ]);
    const loadError = termsResult.error || plansResult.error || installmentsResult.error;
    if (loadError) return fail(`ตรวจงานบริการ/งวดชำระที่ผูกใบนี้ไม่สำเร็จ: ${loadError.message} — ยังไม่ได้ลบใบ`, 500);
    zoneTerms = termsResult.data || [];
    servicePlans = plansResult.data || [];
    installmentRows = installmentsResult.data || [];
    if (!force) {
      const block = historicalDeleteBlock({
        order: { ...before, installments: installmentRows }, terms: zoneTerms, plans: servicePlans,
      });
      if (block) return fail(block, 409);
    }
  }
  if (!force && !canHardDeleteSalesOrder(before)) {
    return fail(
      historical
        ? 'ใบย้อนหลังที่เคยอนุมัติแล้วลบแบบปกติไม่ได้ — ดูผลกระทบด้วยพรีวิว แล้วใช้บังคับลบ'
        : before.hasSignatureEvidence || before.signatureEvidenceId
          ? 'ลบถาวรไม่ได้: SO นี้มี Signature Evidence และต้องเก็บเป็นหลักฐาน — กรุณาใช้ “ยกเลิก SO” แทน'
          : 'ลบถาวรได้เฉพาะ SO ฉบับร่างที่ยังไม่เข้าสู่ workflow — กรุณาใช้ “ยกเลิก SO” แทน',
      409,
    );
  }
  /* เอกสาร FM-SA-04 ที่ยัง active ของใบนี้ — จดไว้ก่อนลบ (FK SET NULL จะล้าง salesOrderId) แล้ว void
     หลังลบสำเร็จ (voidSpecDocumentsAfterForceDelete) · ⚠️ อ่านไม่ขึ้น = หยุดก่อนลบ ไม่ใช่ถือว่าไม่มี */
  const specDocs = await activeDocumentsForOrder(supabase, id);
  if (specDocs.error) return fail(`ตรวจเอกสารใบสเปคสินค้าที่ผูกใบนี้ไม่สำเร็จ: ${specDocs.error} — ยังไม่ได้ลบใบ`, 500);
  const { error } = force
    ? await supabase.rpc('force_delete_sales_order', { p_id: id })
    : await supabase.from('sales_orders').delete().eq('id', id);
  if (error) {
    if (isForeignKeyViolation(error)) {
      console.error(`[sales order delete ${id}] foreign key violation:`, error);
      return fail('ลบถาวรไม่ได้: ยังมีเอกสารอื่นอ้างอิง SO ใบนี้อยู่ — กรุณาใช้ “ยกเลิก SO” แทน', 409);
    }
    return fail(error.message, 500);
  }
  // ใบไม่มีเธรดของตัวเองแล้ว (มติ 2026-08-04) แต่แถวเก่าก่อนหน้านั้นยังค้างในตาราง
  // กลาง (polymorphic ไม่มี FK) — กวาดตอนลบใบต่อไป ไม่งั้นค้างเป็นขยะถาวร
  await purgeUpdates(supabase, 'sales_order', id);
  /* ไฟล์ในแท็บ "เอกสาร" (entity `sales_order` · polymorphic ไม่มี FK) — กวาด **หลัง** ลบใบสำเร็จ
     (ลบใบล้ม = ไฟล์ต้องยังอยู่ครบ) · ตัวกวาดไม่ throw — พลาด = log แถวกำพร้า ไม่ล้มการลบ/audit ข้างล่าง */
  await purgeSalesOrderFiles(supabase, [id]);
  /* ไฟล์หลักฐานใน bucket ไม่มี FK ให้ cascade — ต้องกวาดเอง ไม่งั้นกลายเป็นไฟล์
     กำพร้าถาวร (พบ 2026-08-30 · ดู purgePrivateEvidence)
     · หลักฐานการชำระอยู่ใต้โฟลเดอร์ของใบสั่งขายเอง ⇒ กวาดทั้งโฟลเดอร์
     · เอกสารยืนยันคำสั่งซื้ออยู่ใต้ **ใบเสนอราคาต้นทาง** (อัปตั้งแต่ใบยังไม่เกิด)
       ⇒ ลบเฉพาะไฟล์ที่ใบนี้อ้างไว้ ห้ามกวาดทั้งโฟลเดอร์ เพราะใบเสนอราคายังอยู่
       และอาจออกใบสั่งขายใหม่ที่มีไฟล์ของตัวเองอยู่ในโฟลเดอร์เดียวกัน */
  await purgePrivateEvidence(supabase, 'sales_orders', id);
  await removeEvidenceRefs(supabase, Array.isArray(before.confirmAttachments) ? before.confirmAttachments : []);
  // เอกสารแทนสัญญาที่ trigger ยกเลิกตามการลบ (อ่านอย่างเดียว · อ่านไม่ขึ้น = ไม่บอก ไม่ล้มการลบที่สำเร็จแล้ว)
  const voidedContract = historical ? await historicalContractVoided(supabase, before) : null;
  /* รอบบริการที่ชี้ใบย้อนหลังใบนี้ (ไม่มี FK) — ปลดหลังลบสำเร็จ · กรองด้วย salesOrderId ไม่ใช่ลิสต์ที่โหลดไว้
     ⇒ รอบที่เพิ่งผูกระหว่างตรวจกับลบก็ถูกปลดด้วย · พลาดไม่ล้มการลบที่สำเร็จแล้ว (บอกใน audit + คำตอบ) */
  let detachedPlanIds = [];
  let detachWarning = null;
  if (historical) {
    const { data: detached, error: detachError } = await supabase.from('service_plans')
      .update({ salesOrderId: null, updatedAt: new Date().toISOString() })
      .eq('salesOrderId', id)
      .select('id');
    if (detachError) {
      console.error(`[sales order delete ${id}] ปลดรอบบริการจากใบย้อนหลังที่ลบไม่สำเร็จ:`, detachError.message);
      detachWarning = `ลบใบแล้ว แต่ปลดรอบบริการที่ชี้ใบนี้ไม่สำเร็จ: ${detachError.message}`;
    } else {
      detachedPlanIds = (detached || []).map((row) => row.id);
    }
  }
  const specWarning = await voidSpecDocumentsAfterForceDelete({
    supabase, user, req, order: before, documents: specDocs.documents,
  });
  const warning = [detachWarning, specWarning].filter(Boolean).join(' · ') || null;
  await recordAudit({
    user, action: 'delete', entityType: 'sales_order', entityId: id,
    // ใบย้อนหลัง: เก็บรอบขายของโซน/รอบบริการ/งวดดิบที่ผูกไว้ก่อนลบ — CASCADE พารอบขายและงวดหายไปกับใบ
    before: historical ? { ...before, installments: installmentRows, zoneTerms, servicePlans } : before,
    after: (historical && (detachedPlanIds.length || detachWarning || voidedContract)) || specDocs.documents.length
      ? {
        ...(historical ? { servicePlansDetached: detachedPlanIds } : {}),
        ...(voidedContract ? { contractVoided: voidedContract } : {}),
        ...(specDocs.documents.length ? { specDocuments: specDocs.documents } : {}),
        ...(warning ? { warning } : {}),
      }
      : null,
    summary: `${historical ? 'ลบใบย้อนหลัง' : 'delete'} ${before.orderNumber}`
      + (force ? ' (บังคับลบพร้อมหลักฐาน/ฉบับตรึง — สิทธิ์ผู้ดูแลระบบ)' : '')
      + (historical && zoneTerms.length ? ` · รอบขายของโซนหายตาม ${zoneTerms.length} รอบ` : '')
      + (detachedPlanIds.length ? ` · ปลดรอบบริการ ${detachedPlanIds.length} รอบ` : '')
      + (voidedContract ? ` · ${voidedContractLabel(voidedContract)} ถูกยกเลิกตามใบ` : '')
      + (specDocs.documents.length ? ` · ยกเลิกเอกสาร FM-SA-04 ${specDocs.documents.length} ใบ` : ''),
    request: req,
  });
  return ok({ deleted: true, forced: force, ...(warning ? { warning } : {}) });
});
