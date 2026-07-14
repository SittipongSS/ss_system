import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { isSuperuser } from '@/lib/permissions';
import {
  canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope,
  quoteTotals, toMoney,
} from '@/lib/salesPlanning';
import { quoteApprovalRequirement } from '@/lib/quotationApproval';
import { normalizeManualLines } from '@/lib/sales/quoteLines';
import { normalizePaymentPlan, validatePaymentPlan, paymentPlanSummary } from '@/lib/sales/paymentPlan';

export const dynamic = 'force-dynamic';

const quoteSelect = '*, lines:quotation_lines(*), deal:sales_deals(id, title, stage, dealType, team, ownerId, ownerName, customerId, customerName, projectId)';

async function loadQuote(supabase, id) {
  const { data, error } = await supabase.from('quotations').select(quoteSelect).eq('id', id).maybeSingle();
  if (error) throw error;
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
  return ok(quote);
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
    return badRequest(`ใบสถานะ "${before.status}" แก้ไขไม่ได้ — ใช้ Revise เพื่อออกฉบับใหม่`);
  }

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const patch = { updatedAt: now };

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
    // ยอดเปลี่ยน → เงื่อนไขอนุมัติประเมินใหม่ (เพดาน server-side — ห้ามหลุดผ่านการแก้ยอด)
    const approval = quoteApprovalRequirement(totals, before.metadata || {});
    if (approval.required && before.approvalStatus !== 'approved') {
      patch.approvalStatus = 'pending';
      patch.approvalReason = approval.reason;
      patch.approvalRequestedAt = now;
      patch.approvalRequestedBy = user.id || null;
      patch.approvalRequestedByName = user.name || null;
    } else if (!approval.required && before.approvalStatus === 'pending') {
      patch.approvalStatus = 'not_required';
      patch.approvalReason = null;
    }
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

  const { data, error } = await supabase.from('quotations').update(patch).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  if (newLines && 'lines' in body) {
    await supabase.from('quotation_lines').delete().eq('quotationId', id);
    const rows = newLines.map((l) => ({ ...l, quotationId: id }));
    const { error: lineErr } = await supabase.from('quotation_lines').insert(rows);
    if (lineErr) return fail(`บันทึกรายการไม่สำเร็จ: ${lineErr.message}`, 500);
  }

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
  if (before.status !== 'draft' && !isSuperuser(user.role)) {
    return badRequest('ลบได้เฉพาะฉบับร่าง — ใบที่ส่งแล้วให้ยกเลิก (cancel) หรือออก Revise แทน');
  }
  const { error } = await supabase.from('quotations').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'delete', entityType: 'quotation', entityId: id, before, summary: `ลบใบเสนอราคา (ร่าง) ${before.quoteNumber}`, request: req });
  return ok({ ok: true });
});
