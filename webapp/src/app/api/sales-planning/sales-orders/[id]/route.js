import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { purgeUpdates } from '@/lib/master/updates';
import { appendDocumentEvent } from '@/lib/sales/documentThread';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import {
  DEFAULT_EVIDENCE_BUCKET, salesOrderConfirmationGate, validateOrderConfirmation,
} from '@/lib/sales/orderConfirmationDocs';
import { missingStoredEvidence, purgePrivateEvidence, removeEvidenceRefs } from '@/lib/upload/privateEvidence';
import { departmentOf } from '@/lib/permissions';
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
  salesOrderRevisionChainDeleteBlock,
} from '@/lib/sales/salesOrderWorkflow';
import { documentWorkflowError } from '@/lib/sales/documentWorkflowErrors';
import { freezeInstallments, loadInstallments } from '@/lib/sales/salesOrderInstallmentsStore';
import { withLiveAmounts } from '@/lib/sales/salesOrderPayments';
import { paymentLockReason, paymentNotRequired } from '@/lib/sales/salesOrderPayments';
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
import {
  exciseFilingBlockMessage, exciseFilingsOfSalesOrder, isDryRun, isForceRequest, salesOrderForcePreview,
} from '@/lib/forceDelete';
import { fmtMoney } from '@/lib/format';
import { projectWriteBlockedError } from '@/lib/pm/projectClose';
import { loadScoped } from '@/lib/scopedRow';
import { serviceContractLinkError } from '@/lib/sales/serviceContractLink';

const soAmount = (o) => `${fmtMoney(o?.actualAmount)} บาท`;

export const dynamic = 'force-dynamic';

async function loadOrder(supabase, id) {
  const { data: order, error } = await supabase
    .from('sales_orders')
    .select('*, lines:sales_order_lines(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  const [{ data: deal }, { data: quotation }, { data: project }, { data: signatureEvidence, error: signatureEvidenceError }, { data: scentRequest }, { data: customer }] = await Promise.all([
    /* `line` = สายธุรกิจ (PRODUCT|SERVICE|null) — หน้าใบใช้ตัดสินว่าเป็น "ใบมีรอบบริการ"
       ไหม (มติ 2026-08-30: สาย SERVICE + มีบรรทัดหมวด 02-001 ≥1) ผ่าน `orderHasServiceRounds`
       ⚠️ ตัวจริงของค่าอยู่ที่โครงการ ดีลเป็นสำเนาที่ใช้ตอนยังไม่มีโครงการ — ต้องดึงทั้งคู่
       ⚠️ เพิ่มชื่อคอลัมน์ที่นี่ปลอดภัยกับฉบับตรึง: `buildIssuedSalesOrderPayload` หยิบจาก
       deal/project แค่ `title`/`name` แบบระบุชื่อฟิลด์ ⇒ fingerprint ไม่ขยับ */
    supabase.from('sales_deals').select('id, title, stage, dealType, line, team, ownerId, ownerName, customerName, projectId').eq('id', order.dealId).maybeSingle(),
    supabase.from('quotations').select('id, quoteNumber, status, wonDocType, wonDocDate, wonDocNo, wonAttachments, customerId, customerTaxId, billingAddress, shippingAddress, branchCode, contactName, contactPhone, paymentPlan, paymentTerms, discountType, discountValue').eq('id', order.quotationId).maybeSingle(),
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
       เป็นตัวชี้กลับทะเบียน ต้องเป็นค่าปัจจุบันเสมอ (กติกาเดียวกับ lib/master/customerAr.js) */
    order.customerId
      ? supabase.from('customers').select('id, arCode').eq('id', order.customerId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (signatureEvidenceError) throw signatureEvidenceError;
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
     ⚠️ ไม่บล็อกถ้าโหลดไม่ได้ — ใบสั่งขายต้องเปิดดูได้เสมอ สัญญาเป็นข้อมูลประกอบ */
  let serviceContract = null;
  let contractChoices = [];
  try {
    const { data: rows } = await supabase.from('sales_contracts')
      .select('id, "contractNo", kind, status, "dealId", "effectiveDate", "expiryDate", source')
      .eq('dealId', order.dealId)
      .order('createdAt', { ascending: false });
    contractChoices = rows || [];
    serviceContract = contractChoices.find((c) => c.id === order.serviceContractId) || null;
  } catch { contractChoices = []; }

  return {
    ...order,
    billingRequests,
    serviceContract,
    contractChoices,
    deal: deal || null,
    customer: customer || null,
    quotation: quotation || null,
    project: project || null,
    revisionHistory: revisionHistory || [],
    hasSignatureEvidence: Boolean(signatureEvidence?.id || order.signatureEvidenceId),
    scentRequest: scentRequest || null,
    // งวดชำระ (mig 0245) — โหลดมากับใบเลยเพื่อไม่ให้การ์ด "การชำระ" ต้องยิงรอบสอง
    // ⭐ งวดร่างเดินตามแผนของ QT สด ๆ (B-4) — ทับตอนอ่านที่เดียวกับ route ของงวด
    installments: withLiveAmounts(
      await loadInstallments(supabase, order.id).catch(() => []),
      quotation?.paymentPlan, order.totalAmount,
    ),
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
  const { data: ev, error: evError } = await supabase
    .from('document_signature_evidence')
    .select('id, signerName, signerRole, signedAt, signatureAssetSnapshot')
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
    const { data: ev } = await supabase
      .from('document_signature_evidence')
      .select('id, signerName, signedAt, signatureAssetSnapshot')
      .eq('id', order.proposerSignatureEvidenceId)
      .maybeSingle();
    if (ev?.signatureAssetSnapshot) {
      const imageDataUri = await loadSignatureImageDataUri(admin, ev.signatureAssetSnapshot);
      if (imageDataUri) {
        return {
          imageDataUri,
          signerName: ev.signerName || order.createdByName || '',
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

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  let order;
  try { order = await loadOrder(supabase, id); }
  catch (error) { return fail(`โหลดใบสั่งขายไม่สำเร็จ: ${error.message}`, 500); }
  if (!order) return notFound('ไม่พบ ใบสั่งขาย');
  if (!order.deal || !inSalesViewScope(user, order.deal)) return forbidden();
  // ข้อมูลลูกค้าบนเอกสารมาจาก snapshot ในใบเสนอราคาที่ผูก — ใบเก่าที่ snapshot ไม่ครบ
  // (ผู้ติดต่อ/เลขภาษี) เติมเฉพาะช่องว่างจากทะเบียนลูกค้าสด เพื่อให้เอกสารแสดงครบ
  if (order.quotation) {
    order.quotation = await fillCustomerSnapshotFromMaster(supabase, order.quotation);
  }
  // รูปลายเซ็นผู้จัดทำ + ผู้อนุมัติ (ไม่บล็อกถ้าโหลดไม่ได้ — เอกสารยังออกได้ ตกช่องเซ็นเปล่า)
  let approverSignature = null;
  let proposerSignature = null;
  if (!user.devBypass) {
    try { approverSignature = await loadApproverSignature(supabase, order); }
    catch { approverSignature = null; }
    try { proposerSignature = await loadProposerSignature(supabase, order); }
    catch { proposerSignature = null; }
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
    meId: user.id || null,
    meDepartment: departmentOf(user),
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

  if (action === 'set-doc-language') {
    const language = body.language === 'en' ? 'en' : (body.language === 'th' ? 'th' : null);
    if (!language) return badRequest('ภาษาเอกสารต้องเป็น "th" หรือ "en" เท่านั้น');
    if (!canSwitchSalesOrderDocLanguage(before)) {
      return fail('ใบสั่งขายนี้เปลี่ยนภาษาเอกสารไม่ได้ในสถานะปัจจุบัน', 409);
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
    if (!canRevokeSalesOrderApproval(before, { reviewer })) {
      return forbidden('ย้อนการอนุมัติได้เฉพาะ AE Supervisor หรือ Admin');
    }
    // ⚠️ เงินที่บัญชีคอนเฟิร์มแล้วคือเงินที่รับมาจริง — ถอยใบทับมันเงียบ ๆ ไม่ได้
    // (กติกาเดียวกับที่ใบยื่นสรรพสามิตบล็อกปุ่มนี้อยู่แล้ว)
    const paymentBlock = paymentLockReason(before.installments);
    if (paymentBlock) return badRequest(paymentBlock);
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
    // ฉบับ Rev. = SO ใบใหม่ (เลขใหม่ ใบเดิม superseded) → อยู่ในขอบเขตด่าน B3
    const closedProject = projectWriteBlockedError(before.project)
      ? `โครงการ ${[before.project?.code, before.project?.name].filter(Boolean).join(' ') || 'นี้'} ปิดแล้ว — ออก Rev. ใบสั่งขายไม่ได้ ต้องให้ผู้อนุมัติเปิดโครงการใหม่ (RE-ORDER) ก่อน`
      : null;
    if (closedProject) return badRequest(closedProject);
    if (!canIssueSalesOrderRevision(before, { reviewer })) {
      return forbidden(before.status === 'approved'
        ? 'ต้องกด "ย้อนการอนุมัติ" ก่อนจึงจะออก Rev. ได้'
        : 'ออก Rev. ได้เฉพาะ AE Supervisor หรือ Admin บน SO ที่ย้อนการอนุมัติแล้ว');
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
    await recordAudit({
      user,
      action: 'create',
      entityType: 'sales_order',
      entityId: revision?.id || revisionId,
      before,
      after: revision,
      summary: `ออก Rev. ${before.orderNumber} → ${revision?.orderNumber || revisionId}: ${reason}`,
      request: req,
    });
    return ok(revision, 201);
  }

  if (action === 'save') {
    if (!['draft', 'rejected'].includes(before.status)) return badRequest('แก้ไขได้เฉพาะ SO ร่างหรือรายการที่ถูกตีกลับ');
    /* ⚠️ **ไม่รับ `orderDate` / `paymentDueDate` จาก client อีกแล้ว** (มติผู้ใช้ 2026-08-18)
       - วันที่ SO = วันที่สร้างใบ แก้ไม่ได้ (เดิมเป็นช่องกรอกที่แก้ย้อนหลังได้ ⇒ เลขที่ใบ
         กับวันที่บนใบเดินคนละทางได้)
       - กำหนดชำระย้ายไปอยู่ที่ **งวด** ทั้งหมด (action `schedule` รายงวด) ค่าระดับใบ
         มาจากหลักฐานตอนปิด Won และเป็นค่าอ้างอิงของฝ่ายผลิต ไม่ใช่ช่องให้แก้บนเอกสาร
       แก้ได้เหลือ **หมายเหตุ + เอกสารอ้างอิง** เท่านั้น */
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
    const patch = {
      referenceDoc: referenceDoc || null,
      notes: String(body.notes || '').trim() || null,
      ...confirmPatch,
      updatedAt: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).eq('status', before.status).select('*').maybeSingle();
    if (error) return fail(`บันทึกใบสั่งขายไม่สำเร็จ: ${error.message}`, 500);
    if (!data) return badRequest('สถานะ SO เปลี่ยนแล้ว กรุณาโหลดใหม่');
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `edit ${before.orderNumber}`, request: req });
    return ok(data);
  }

  if (action === 'submit') {
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
       ใบที่ธงไม่ติดจะไม่โผล่ในคิวบัญชี ซึ่งกู้ได้ด้วยการอนุมัติซ้ำหรือแก้มือ */
    try {
      /* ⭐ **ใบยอด 0 ไม่ต้องเข้าคิวบัญชี** (มติ 2026-08-18 · ขยายมาแกนนี้ 26/08) —
         ตรงกับงวดชำระที่ตัดใบยอด 0 ออกอยู่แล้ว · ธงค้างเป็น NULL = "ไม่มีขั้นนี้"
         ซึ่งเป็นความหมายเดียวกับใบที่ออกก่อน mig 0250 */
      if (!paymentNotRequired(before.totalAmount)) {
        await supabase.from('sales_orders')
          .update({ financeStatus: 'pending' })
          .eq('id', id)
          .is('financeStatus', null);
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
    try {
      await freezeInstallments(supabase, {
        order: { ...before, ...data, quotation: before.quotation },
        user,
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
    // ⚠️ เหตุผลเดียวกับ revoke — งวดที่บัญชีคอนเฟิร์มแล้วคือเงินที่รับมาจริง
    // ยกเลิกใบทิ้งเงียบ ๆ ไม่ได้ ต้องให้บัญชีจัดการก่อน
    const cancelPaymentBlock = paymentLockReason(before.installments);
    if (cancelPaymentBlock) return badRequest(cancelPaymentBlock);
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
    if (before.status === 'approved' && !reviewer) return forbidden('ยกเลิก SO ที่อนุมัติแล้วต้องให้ AE Supervisor ดำเนินการ (ถอนยอด Actual)');

    // ย้อน Won พร้อมยกเลิก SO (มติ 2026-07-18): เมื่อลูกค้าหลุด (เหตุฝั่งลูกค้า) ให้ถอย
    // ดีลออกจาก Won ด้วย — atomic ผ่าน RPC (ยกเลิก SO + ใบเสนอราคา accept → cancelled +
    // ถอยดีล). ทำได้เฉพาะ SO ที่อนุมัติแล้ว (ตัวที่นับ Actual + ดีล Won).
    const reverseTo = String(body.reverseTo || '').trim();
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
      return ok(result?.order || {});
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
    if (error) return fail(error.message, 500);
    if (!data) return badRequest('สถานะ SO เปลี่ยนแล้ว กรุณาโหลดใหม่');
    const summaryReason = cancelReasonLabel(reasonCode) + (note ? ` — ${note}` : '');
    await logThread('cancel', { reason: summaryReason });
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `cancel ${before.orderNumber}: ${summaryReason}`, request: req });
    return ok(data);
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
    if (before.status !== 'cancelled') return badRequest('ใบสั่งขายนี้ไม่ได้อยู่ในสถานะยกเลิก');
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
  if (isDryRun(req)) {
    const preview = await salesOrderForcePreview(supabase, before);
    return ok({ dryRun: true, ...preview });
  }
  // ?force=1 = break-glass ผู้ดูแลระบบ (mig 0152) ลบใบที่มีหลักฐาน/ฉบับตรึงได้ — มติผู้ใช้
  // 2026-07-25; เส้นทางปกติยังยอมเฉพาะร่างที่ไม่เคยเข้า workflow เหมือนเดิม
  const force = isForceRequest(req);
  // ด่าน revision chain มาก่อน force — break-glass ก็ข้าม FK RESTRICT ไม่ได้อยู่ดี
  // (force_delete_sales_order ล้างหลักฐาน/ฉบับตรึง ไม่ได้ล้าง pointer ของอีกฉบับ)
  const chainBlock = salesOrderRevisionChainDeleteBlock(before);
  if (chainBlock) return fail(chainBlock, 409);
  // ใบยื่นภาษีมาก่อน force เช่นกัน — RPC break-glass ไม่ล้างตาราง orders ให้ ถ้าไม่ดัก
  // ตรงนี้จะไปพังที่ FK RESTRICT แล้วได้ข้อความกลาง ๆ ที่ชี้ทางผิด ("ใช้ยกเลิก SO แทน"
  // ซึ่งใบยื่นก็บล็อกเหมือนกัน = ผู้ใช้วนกลับที่เดิม)
  const filings = await exciseFilingsOfSalesOrder(supabase, id);
  if (filings.length) return fail(exciseFilingBlockMessage(filings, 'ใบสั่งขาย'), 409);
  if (!force && !canHardDeleteSalesOrder(before)) {
    return fail(
      before.hasSignatureEvidence || before.signatureEvidenceId
        ? 'ลบถาวรไม่ได้: SO นี้มี Signature Evidence และต้องเก็บเป็นหลักฐาน — กรุณาใช้ “ยกเลิก SO” แทน'
        : 'ลบถาวรได้เฉพาะ SO ฉบับร่างที่ยังไม่เข้าสู่ workflow — กรุณาใช้ “ยกเลิก SO” แทน',
      409,
    );
  }
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
  /* ไฟล์หลักฐานใน bucket ไม่มี FK ให้ cascade — ต้องกวาดเอง ไม่งั้นกลายเป็นไฟล์
     กำพร้าถาวร (พบ 2026-08-30 · ดู purgePrivateEvidence)
     · หลักฐานการชำระอยู่ใต้โฟลเดอร์ของใบสั่งขายเอง ⇒ กวาดทั้งโฟลเดอร์
     · เอกสารยืนยันคำสั่งซื้ออยู่ใต้ **ใบเสนอราคาต้นทาง** (อัปตั้งแต่ใบยังไม่เกิด)
       ⇒ ลบเฉพาะไฟล์ที่ใบนี้อ้างไว้ ห้ามกวาดทั้งโฟลเดอร์ เพราะใบเสนอราคายังอยู่
       และอาจออกใบสั่งขายใหม่ที่มีไฟล์ของตัวเองอยู่ในโฟลเดอร์เดียวกัน */
  await purgePrivateEvidence(supabase, 'sales_orders', id);
  await removeEvidenceRefs(supabase, Array.isArray(before.confirmAttachments) ? before.confirmAttachments : []);
  await recordAudit({
    user, action: 'delete', entityType: 'sales_order', entityId: id, before, after: null,
    summary: force
      ? `delete ${before.orderNumber} (บังคับลบพร้อมหลักฐาน/ฉบับตรึง — สิทธิ์ผู้ดูแลระบบ)`
      : `delete ${before.orderNumber}`,
    request: req,
  });
  return ok({ deleted: true, forced: force });
});
