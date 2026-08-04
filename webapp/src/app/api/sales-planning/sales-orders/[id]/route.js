import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { purgeUpdates } from '@/lib/master/updates';
import { appendDocumentEvent } from '@/lib/sales/documentThread';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import {
  canHardDeleteSalesOrder,
  canIssueSalesOrderRevision,
  canRevokeSalesOrderApproval,
  canWithdrawSalesOrderSubmission,
  isForeignKeyViolation,
  isSalesOrderReviewer,
  salesOrderRevisionChainDeleteBlock,
  isValidCancelReasonCode,
  cancelReasonLabel,
  isValidReversalTarget,
} from '@/lib/sales/salesOrderWorkflow';
import { documentWorkflowError } from '@/lib/sales/documentWorkflowErrors';
import { resolveExpectedUpdatedAt } from '@/lib/sales/documentConcurrency';
import { salesOrderApprovalFingerprint } from '@/lib/sales/salesOrderApprovalFingerprint';
import {
  adminOverrideReasonError,
  isSalesOrderSelfApproval,
  normalizeAdminOverrideReason,
} from '@/lib/sales/salesOrderApprovalOverride';
import {
  approveSalesOrderWithSignatureEvidence,
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
import { sendChat, chatCard } from '@/lib/chat';
import { fmtMoney } from '@/lib/format';
import { projectWriteBlockedError } from '@/lib/pm/projectClose';

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

  const [{ data: deal }, { data: quotation }, { data: project }, { data: signatureEvidence, error: signatureEvidenceError }] = await Promise.all([
    supabase.from('sales_deals').select('id, title, stage, dealType, team, ownerId, ownerName, customerName, projectId').eq('id', order.dealId).maybeSingle(),
    supabase.from('quotations').select('id, quoteNumber, status, wonDocType, wonDocDate, wonAttachments, customerId, customerTaxId, billingAddress, shippingAddress, branchCode, contactName, contactPhone, paymentPlan, paymentTerms, discountType, discountValue').eq('id', order.quotationId).maybeSingle(),
    order.projectId
      // closeStatus: ด่าน B3 ใช้ตัดสินว่าออก Rev. ใบใหม่ได้ไหม (หน้าเว็บใช้ซ่อนปุ่มด้วย)
      ? supabase.from('projects').select('id, code, name, closeStatus').eq('id', order.projectId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('document_signature_evidence').select('id').eq('salesOrderId', id).limit(1).maybeSingle(),
  ]);
  if (signatureEvidenceError) throw signatureEvidenceError;
  const { data: revisionHistory, error: revisionHistoryError } = await supabase
    .from('sales_orders')
    .select('id, orderNumber, revisionNo, status, orderDate, createdAt')
    .eq('baseNumber', order.baseNumber || order.orderNumber)
    .order('revisionNo', { ascending: false });
  if (revisionHistoryError) throw revisionHistoryError;
  return {
    ...order,
    deal: deal || null,
    quotation: quotation || null,
    project: project || null,
    revisionHistory: revisionHistory || [],
    hasSignatureEvidence: Boolean(signatureEvidence?.id || order.signatureEvidenceId),
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
  catch (error) { return fail(`โหลด Sale Order ไม่สำเร็จ: ${error.message}`, 500); }
  if (!order) return notFound('ไม่พบ Sale Order');
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
  return ok({ ...order, meId: user.id || null, approverSignature, proposerSignature, deliveries });
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  let before;
  try { before = await loadOrder(supabase, id); }
  catch (error) { return fail(`โหลด Sale Order ไม่สำเร็จ: ${error.message}`, 500); }
  if (!before) return notFound('ไม่พบ Sale Order');

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  const withdrawing = action === 'withdraw';
  if (!before.deal || !(withdrawing
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

  // ขั้นที่ 1 (mig 0166): ยกเลิกอนุมัติ → สถานะกลางที่แก้ไม่ได้ · Actual หลุดที่ขั้นนี้
  if (action === 'revoke') {
    if (!canRevokeSalesOrderApproval(before, { reviewer })) {
      return forbidden('ยกเลิกอนุมัติได้เฉพาะ AE Supervisor หรือ Admin');
    }
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
      summary: `ยกเลิกอนุมัติ ${before.orderNumber} (Actual ${soAmount(before)} หลุดจากยอด): ${reason}`,
      request: req,
    });
    // แจ้งทีมขาย: Actual หายไปจากยอด ต้องไม่เงียบ
    sendChat('sales', chatCard({
      title: '⚠️ ยกเลิกอนุมัติ Sale Order',
      subtitle: before.deal?.title || before.orderNumber,
      rows: [
        { label: 'เลขที่ SO', value: before.orderNumber },
        { label: 'Actual ที่หลุดออก', value: soAmount(before) },
        { label: 'เหตุผล', value: reason },
        { label: 'ผู้ดำเนินการ', value: user.name || '' },
      ],
      linkPath: `/sa/sales-orders/${id}`,
      linkLabel: 'ออก Rev. ต่อ',
    }));
    return ok(data);
  }

  // ขั้นที่ 2: ออก Rev. จากใบที่ยกเลิกอนุมัติแล้ว — เหตุผลใช้ค่าที่กรอกไว้ขั้นแรก
  if (action === 'revise') {
    // ฉบับ Rev. = SO ใบใหม่ (เลขใหม่ ใบเดิม superseded) → อยู่ในขอบเขตด่าน B3
    const closedProject = projectWriteBlockedError(before.project)
      ? `โครงการ ${[before.project?.code, before.project?.name].filter(Boolean).join(' ') || 'นี้'} ปิดแล้ว — ออก Rev. Sale Order ไม่ได้ ต้องให้ผู้อนุมัติเปิดโครงการใหม่ (RE-ORDER) ก่อน`
      : null;
    if (closedProject) return badRequest(closedProject);
    if (!canIssueSalesOrderRevision(before, { reviewer })) {
      return forbidden(before.status === 'approved'
        ? 'ต้องกด "ยกเลิกอนุมัติ" ก่อนจึงจะออก Rev. ได้'
        : 'ออก Rev. ได้เฉพาะ AE Supervisor หรือ Admin บน SO ที่ยกเลิกอนุมัติแล้ว');
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
    const orderDate = String(body.orderDate || '').trim();
    const paymentDueDate = String(body.paymentDueDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) return badRequest('วันที่ SO ไม่ถูกต้อง');
    if (paymentDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(paymentDueDate)) return badRequest('วันที่กำหนดชำระไม่ถูกต้อง');
    const patch = {
      orderDate,
      paymentDueDate: paymentDueDate || null,
      notes: String(body.notes || '').trim() || null,
      updatedAt: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).eq('status', before.status).select('*').maybeSingle();
    if (error) return fail(`บันทึก Sale Order ไม่สำเร็จ: ${error.message}`, 500);
    if (!data) return badRequest('สถานะ SO เปลี่ยนแล้ว กรุณาโหลดใหม่');
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `edit ${before.orderNumber}`, request: req });
    return ok(data);
  }

  if (action === 'submit') {
    if (!['draft', 'rejected'].includes(before.status)) return badRequest('SO ใบนี้ยื่นอนุมัติไม่ได้');
    // ยอดก่อน VAT 0 บาทยื่นได้ (มติผู้ใช้ 2026-08-03) — ต่อจาก QT ที่ปิด Won ด้วยยอด 0 ได้
    // (mig 0196); ถ้าด่านนี้ยังบังคับ > 0 ใบที่ Won แล้วจะเดินต่อไม่ได้เลย
    if (!before.orderDate || !(before.lines?.length > 0)) {
      return badRequest('ข้อมูล SO ไม่ครบ: ต้องมีวันที่และรายการสินค้า');
    }
    if (!before.quotation || before.quotation.status !== 'accepted' || !before.deal || !before.projectId || !before.customerName) {
      return badRequest('เอกสารอ้างอิงไม่ครบ: ต้องมี QT Won, ดีล, โครงการ และลูกค้า');
    }
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
    sendChat('approvals', chatCard({
      title: 'Sale Order รออนุมัติ',
      subtitle: before.deal?.title || before.orderNumber,
      rows: [
        { label: 'เลขที่ SO', value: before.orderNumber },
        { label: 'ยอด (ก่อน VAT)', value: soAmount(before) },
        { label: 'ลูกค้า', value: before.customerName || '' },
        { label: 'ผู้ยื่น', value: user.name || '' },
      ],
      linkPath: `/sa/sales-orders/${id}`,
      linkLabel: 'ตรวจ/อนุมัติ',
    }));
    return ok(data);
  }

  if (action === 'approve') {
    if (!reviewer) return forbidden('เฉพาะ AE Supervisor ที่อนุมัติ Sale Order ได้');
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
    sendChat('sales', chatCard({
      title: '✅ Sale Order อนุมัติแล้ว',
      subtitle: before.deal?.title || before.orderNumber,
      rows: [
        { label: 'เลขที่ SO', value: before.orderNumber },
        { label: 'ยอด Actual (ก่อน VAT)', value: soAmount(before) },
        { label: 'ผู้อนุมัติ', value: user.name || '' },
        { label: 'ผู้ยื่น', value: before.submittedByName || '' },
        ...(selfApproval ? [{ label: 'รูปแบบ', value: 'Admin Override' }] : []),
        // รอยต่อถัดไปเป็น manual. เขียนแบบมีเงื่อนไขเพราะตรงนี้ยังไม่รู้ว่าในใบมีสินค้า
        // สรรพสามิตไหม (ต้องยิงอีก 4 query) — ตัวกรองจริงอยู่ที่หน้ายื่นชำระกับการ์ดคิว
        { label: 'ขั้นถัดไป', value: 'ถ้าในใบมีสินค้าสรรพสามิต ให้สร้างใบยื่นชำระภาษีที่เมนูการยื่นชำระ' },
      ],
      linkPath: `/sa/sales-orders/${id}`,
      linkLabel: 'เปิด Sale Order',
    }));
    return ok(data);
  }

  if (action === 'reject') {
    if (!reviewer) return forbidden('เฉพาะ AE Supervisor ที่ตีกลับ Sale Order ได้');
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
    sendChat('sales', chatCard({
      title: '↩️ Sale Order ถูกตีกลับ',
      subtitle: before.deal?.title || before.orderNumber,
      rows: [
        { label: 'เลขที่ SO', value: before.orderNumber },
        { label: 'เหตุผล', value: reason },
        { label: 'ผู้ตีกลับ', value: user.name || '' },
        { label: 'ผู้ยื่น', value: before.submittedByName || '' },
      ],
      linkPath: `/sa/sales-orders/${id}`,
      linkLabel: 'แก้ไข Sale Order',
    }));
    return ok(data);
  }

  if (action === 'cancel') {
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
      // เหมือนกัน (ยกเลิกอนุมัติ/ออก Rev./ลบถาวร) ผู้ใช้จึงวนหาปุ่มไม่เจอถ้าไม่ชี้ทาง
      return badRequest(
        `ยกเลิก Sale Order ไม่ได้ เพราะมีใบยื่นชำระภาษี ${filing.id} (${filing.status}) ผูกอยู่`
        + ' — ต้องลบใบยื่นที่หน้า "ภาษี › การยื่นชำระ" ก่อน แล้วจึงยกเลิก SO ได้',
      );
    }
    // เหตุผลยกเลิกแบบมีโครงสร้าง (มติ 2026-07-18): เลือกรหัสจากตัวเลือกมาตรฐาน +
    // หมายเหตุอิสระ (บังคับหมายเหตุเมื่อเลือก "อื่น ๆ"). เก็บทั้ง code + note.
    const reasonCode = String(body.reasonCode || '').trim();
    const note = String(body.reason || body.note || '').trim();
    if (!isValidCancelReasonCode(reasonCode)) return badRequest('กรุณาเลือกเหตุผลที่ยกเลิก Sale Order');
    if (reasonCode === 'other' && !note) return badRequest('เลือก "อื่น ๆ" ต้องระบุหมายเหตุ');
    if (before.status === 'cancelled') return badRequest('Sale Order นี้ถูกยกเลิกแล้ว');
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
      sendChat('sales', chatCard({
        title: '↩️ ย้อน Won (ถอนยอดขาย)',
        subtitle: before.deal?.title || before.orderNumber,
        rows: [
          { label: 'SO', value: before.orderNumber },
          { label: 'เหตุผล', value: revReason },
          { label: 'ดีลไปสถานะ', value: targetLabel },
          { label: 'โดย', value: user.name || '' },
        ],
        linkPath: before.dealId ? `/sa/deals/${before.dealId}` : `/sa/sales-orders/${id}`,
        linkLabel: 'เปิดดีล',
      }));
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

  if (action === 'restore') {
    if (user.role !== 'admin') return forbidden('เฉพาะผู้ดูแลระบบที่คืนสถานะ Sale Order ได้');
    if (before.status !== 'cancelled') return badRequest('Sale Order นี้ไม่ได้อยู่ในสถานะยกเลิก');
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
  if (user.role !== 'admin') return forbidden('เฉพาะผู้ดูแลระบบที่ลบ Sale Order ได้');
  const { id } = await ctx.params;
  let before;
  try { before = await loadOrder(supabase, id); }
  catch (error) { return fail(`โหลด Sale Order ไม่สำเร็จ: ${error.message}`, 500); }
  if (!before) return notFound('ไม่พบ Sale Order');

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
  if (filings.length) return fail(exciseFilingBlockMessage(filings, 'Sale Order'), 409);
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
  await recordAudit({
    user, action: 'delete', entityType: 'sales_order', entityId: id, before, after: null,
    summary: force
      ? `delete ${before.orderNumber} (บังคับลบพร้อมหลักฐาน/ฉบับตรึง — สิทธิ์ผู้ดูแลระบบ)`
      : `delete ${before.orderNumber}`,
    request: req,
  });
  return ok({ deleted: true, forced: force });
});
