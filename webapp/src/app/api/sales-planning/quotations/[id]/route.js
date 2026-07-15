import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import {
  canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope,
  quoteTotals, toMoney,
} from '@/lib/salesPlanning';
import { normalizeManualLines } from '@/lib/sales/quoteLines';
import { normalizePaymentPlan, validatePaymentPlan, paymentPlanSummary } from '@/lib/sales/paymentPlan';
import { quotationApprovalFingerprint } from '@/lib/sales/quotationApprovalFingerprint';
import { validateDocumentReadiness } from '@/lib/documentWorkflow';

export const dynamic = 'force-dynamic';

const quoteSelect = '*, lines:quotation_lines(*), deal:sales_deals(id, title, stage, dealType, team, ownerId, ownerName, customerId, customerName, projectId)';

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
  return data;
}

// สถานะที่ยังแก้เนื้อหาได้ — accepted/revised/cancelled = read-only (หลักฐานการค้า)
const EDITABLE_STATUSES = new Set(['draft', 'sent', 'rejected']);

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const quote = await loadQuote(supabase, id);
  if (!quote) return notFound('ไม่พบใบเสนอราคา');
  if (!quote.deal || !inSalesViewScope(user, quote.deal)) return forbidden();
  const baseNumber = quote.baseNumber || quote.quoteNumber;
  const { data: revisionHistory, error: revisionError } = await supabase
    .from('quotations')
    .select('id, quoteNumber, revisionNo, status, quoteDate, createdAt, totalAmount')
    .eq('baseNumber', baseNumber)
    .order('revisionNo', { ascending: false });
  if (revisionError) return fail(revisionError.message, 500);
  return ok({ ...quote, revisionHistory: revisionHistory || [] });
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

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const patch = {
    updatedAt: now,
    approvalStatus: 'not_required',
    approvalReason: null,
    approvalRequestedAt: null,
    approvalRequestedBy: null,
    approvalRequestedByName: null,
    approvalFingerprint: null,
    approvalNotes: null,
    approvedAt: null,
    approvedBy: null,
    approvedByName: null,
  };

  // เนื้อหาใบ
  if ('quoteDate' in body) patch.quoteDate = body.quoteDate || before.quoteDate;
  if ('validUntil' in body) patch.validUntil = body.validUntil || null;
  if ('paymentTerms' in body) patch.paymentTerms = (body.paymentTerms || '').trim() || null;
  if ('notes' in body) patch.notes = (body.notes || '').trim() || null;
  if ('status' in body) {
    if (!['draft', 'sent'].includes(body.status)) return badRequest('เปลี่ยนสถานะได้เฉพาะ draft/sent (รับใบใช้ปุ่ม Accept)');
    patch.status = body.status;
  }

  // บรรทัด + ส่วนลด + VAT → คิดยอดใหม่
  let newLines = null;
  const moneyChanged = 'lines' in body || 'discountType' in body || 'discountValue' in body || 'vatRate' in body;
  if (moneyChanged) {
    newLines = 'lines' in body
      ? normalizeManualLines(body.lines || [])
      : (before.lines || []).map((l) => ({ ...l }));
    // ใบว่าง (0 รายการ) เก็บเป็นร่างได้ — ใส่รหัส FG ทีหลัง; การส่ง/รับใบมี guard ยอด>0 อยู่แล้ว
    if (!newLines.length && (body.status === 'sent' || before.status === 'sent')) {
      return badRequest('ต้องมีอย่างน้อย 1 รายการก่อนส่งลูกค้า');
    }
    const discountType = 'discountType' in body
      ? (['percent', 'amount'].includes(body.discountType) ? body.discountType : null)
      : before.discountType;
    const discountValue = discountType ? toMoney('discountValue' in body ? body.discountValue : before.discountValue) : 0;
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
    if (!('paymentTerms' in body)) patch.paymentTerms = paymentPlanSummary(plan, grand);
  } else if ('totalAmount' in patch && before.paymentPlan?.type === 'installment') {
    // ยอดเปลี่ยนแต่ไม่ได้ส่งแผนมา → คิดยอดงวดใหม่ตามสัดส่วน % เดิม
    const plan = normalizePaymentPlan(before.paymentPlan, patch.totalAmount);
    patch.paymentPlan = plan;
    if (!('paymentTerms' in body)) patch.paymentTerms = paymentPlanSummary(plan, patch.totalAmount);
  }

  // Editing document content after it was sent creates a new draft state.
  const contentChanged = moneyChanged || 'paymentPlan' in body || 'paymentTerms' in body
    || 'notes' in body || 'quoteDate' in body || 'validUntil' in body;
  const finalLines = newLines || before.lines || [];
  let finalQuote = { ...before, ...patch, lines: finalLines };
  if (contentChanged) {
    Object.assign(patch, before.status === 'sent' && body.status !== 'sent' ? { status: 'draft' } : {});
    finalQuote = { ...before, ...patch, lines: finalLines };
  }

  if ('status' in body && body.status === 'sent') {
    const readiness = validateDocumentReadiness({
      action: 'send',
      status: before.status,
      lineCount: finalLines.length,
      totalAmount: finalQuote.totalAmount,
      approvalStatus: 'not_required',
      approvalFingerprint: null,
      currentFingerprint: quotationApprovalFingerprint(finalQuote, finalLines),
    });
    if (!readiness.ok) return badRequest(readiness.error);
  }

  const rows = newLines && 'lines' in body ? newLines : null;
  const { error } = await supabase.rpc('save_quotation_content', {
    p_quote_id: id,
    p_content: patch,
    p_lines: rows,
  });
  if (error) return fail(error.message, 500);

  const after = await loadQuote(supabase, id);
  await recordAudit({ user, action: 'update', entityType: 'quotation', entityId: id, before, after, summary: `แก้ไขใบเสนอราคา ${before.quoteNumber}`, request: req });
  return ok(after);
});

// DELETE — เฉพาะ draft (ใบที่ส่ง/รับแล้ว = หลักฐาน ห้ามลบ ใช้ cancel/revise)
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const before = await loadQuote(supabase, id);
  if (!before) return notFound('ไม่พบใบเสนอราคา');
  if (!before.deal || !inSalesEditScope(user, before.deal)) return forbidden();
  if (before.status === 'closed') {
    return badRequest('ใบนี้ถูกปิดแล้ว (ดีลจบด้วยใบเสนอราคาฉบับอื่น) — ลบไม่ได้');
  }
  if (before.status !== 'draft') {
    return badRequest('ลบได้เฉพาะฉบับร่าง — ใบที่ส่งแล้วให้ยกเลิก (cancel) หรือออก Revise แทน');
  }
  const { error } = await supabase.from('quotations').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'delete', entityType: 'quotation', entityId: id, before, summary: `ลบใบเสนอราคา (ร่าง) ${before.quoteNumber}`, request: req });
  return ok({ ok: true });
});
