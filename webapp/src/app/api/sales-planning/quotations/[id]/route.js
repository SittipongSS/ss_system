import { recordAudit } from '@/lib/audit';
import { isSuperuser } from '@/lib/permissions';
import {
  isForceRequest, isDryRun, canForceDelete,
  quotationForcePreview, cleanupQuotationOrphans,
} from '@/lib/forceDelete';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import {
  canApproveQuotation, canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope,
  quoteTotals, toMoney,
} from '@/lib/salesPlanning';
import { enforceMasterPrices, normalizeManualLines, refreshFgLinesForDisplay } from '@/lib/sales/quoteLines';
import { normalizePaymentPlan, validatePaymentPlan, paymentPlanSummary } from '@/lib/sales/paymentPlan';
import { quotationApprovalFingerprint } from '@/lib/sales/quotationApprovalFingerprint';
import { validateDocumentReadiness } from '@/lib/documentWorkflow';
import { validateQuotationPeople } from '@/lib/sales/quotationPeople';
import { fillCustomerSnapshotFromMaster } from '@/lib/sales/customerSnapshotFallback';

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
  const baseNumber = filledQuote.baseNumber || filledQuote.quoteNumber;
  const { data: revisionHistory, error: revisionError } = await supabase
    .from('quotations')
    .select('id, quoteNumber, revisionNo, status, quoteDate, createdAt, totalAmount')
    .eq('baseNumber', baseNumber)
    .order('revisionNo', { ascending: false });
  if (revisionError) return fail(revisionError.message, 500);
  // canApprove: ผู้ใช้ปัจจุบันเป็นเจ้าของดีล/superuser (ผู้อนุมัติ) — UI ใช้แสดงปุ่มอนุมัติ
  return ok({ ...filledQuote, revisionHistory: revisionHistory || [], canApprove: canApproveQuotation(user, filledQuote.deal) });
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
  // ผู้รับผิดชอบเอกสาร (ผู้ดูแล/ผู้จัดทำ/ผู้ตรวจสอบ) — ต้องเป็นผู้ใช้จริง + role ตรง.
  // ตรวจเมื่อมีการแก้ people หรือเมื่อกำลังส่งใบ (บังคับครบ+ถูก role ย้อนหลังกับใบเก่า).
  // ค่าอื่นใน metadata merge ตามเดิม ไม่ทับทั้งก้อน.
  const willSend = body.status === 'sent';
  const hasMetaPatch = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata);
  if (hasMetaPatch || willSend) {
    const src = hasMetaPatch ? body.metadata : {};
    const effectivePeople = {
      aeOwner: 'aeOwner' in src ? src.aeOwner : before.metadata?.aeOwner,
      preparedBy: 'preparedBy' in src ? src.preparedBy : before.metadata?.preparedBy,
      aeSupervisor: 'aeSupervisor' in src ? src.aeSupervisor : before.metadata?.aeSupervisor,
    };
    const peoplePick = await validateQuotationPeople(supabase, effectivePeople, { require: willSend });
    if (!peoplePick.ok) return badRequest(peoplePick.error);
    const { aeOwner: _o, preparedBy: _p, aeSupervisor: _s, ...editableMeta } = src;
    patch.metadata = {
      ...(before.metadata || {}),
      ...editableMeta,
      aeOwner: peoplePick.people.aeOwner || null,
      preparedBy: peoplePick.people.preparedBy || null,
      aeSupervisor: peoplePick.people.aeSupervisor || null,
    };
  }
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
  // แก้เนื้อหาที่กระทบเอกสาร/ยอด → ต้องอนุมัติใหม่ (มติ 2026-07-18): ล้างการอนุมัติเดิม
  // กลับเป็น 'pending' + ตัด fingerprint/ผู้อนุมัติ. ใบ grandfather (not_required) ก็ถูก
  // ดันเข้าสู่ระบบอนุมัติเมื่อถูกแก้เนื้อหา (สอดคล้องกับใบใหม่). ยกเว้น: ไม่แตะสถานะอนุมัติ
  // เมื่อแก้เฉพาะช่องที่ไม่ใช่เนื้อหา (ผู้รับผิดชอบ ฯลฯ).
  if (contentChanged) {
    patch.approvalStatus = 'pending';
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
      totalAmount: finalQuote.totalAmount,
      approvalStatus: effApprovalStatus,
      approvalFingerprint: effFingerprint,
      currentFingerprint: quotationApprovalFingerprint(finalQuote, finalLines),
    });
    if (!readiness.ok) {
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
  if (evidence?.id || before.signatureEvidenceId) {
    return fail('ลบถาวรไม่ได้: ใบเสนอราคานี้มีหลักฐานลายเซ็นและต้องเก็บเป็นหลักฐาน — ออก Revise แทน; ใบที่รับ (Won) แล้วให้หัวหน้าทีม/แอดมินใช้ “ย้อนการรับ” บนหน้าใบเสนอราคา', 409);
  }

  if (!force) {
    if (before.status === 'accepted') {
      return badRequest('ใบเสนอราคานี้เป็นแหล่งยอด Actual ของดีล — ลบไม่ได้: ถ้ามี SO อนุมัติแล้วใช้ “ยกเลิกใบสั่งขายพร้อมย้อนสถานะ” ที่หน้า SO; ถ้ายังไม่มี SO ให้หัวหน้าทีม/แอดมินใช้ “ย้อนการรับ” บนหน้าใบเสนอราคา');
    }
    const elevated = isSuperuser(user.role);
    if (!elevated) {
      if (before.status === 'closed') {
        return badRequest('ใบนี้ถูกปิดแล้ว (ดีลจบด้วยใบเสนอราคาฉบับอื่น) — ลบไม่ได้');
      }
      if (before.status !== 'draft') {
        return badRequest('ลบได้เฉพาะฉบับร่าง — ใบที่ส่งแล้วให้ออก Revise แทน');
      }
    }
  }

  // force: ปลด logical ref (metadata.acceptedQuotationId) ที่ชี้มาใบนี้ก่อนลบ.
  // sales_orders.quotationId เป็น ON DELETE CASCADE จึงหายเองที่ระดับ DB.
  if (force) await cleanupQuotationOrphans(supabase, before);

  const { error } = await supabase.from('quotations').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  const summary = force
    ? `ลบใบเสนอราคา ${before.quoteNumber} (สถานะ ${before.status} — บังคับลบ สิทธิ์ผู้ดูแลระบบ)`
    : (isSuperuser(user.role) && before.status !== 'draft'
      ? `ลบใบเสนอราคา ${before.quoteNumber} (สถานะ ${before.status} — สิทธิ์ผู้ดูแลระบบ)`
      : `ลบใบเสนอราคา (ร่าง) ${before.quoteNumber}`);
  await recordAudit({
    user, action: 'delete', entityType: 'quotation', entityId: id, before,
    summary, request: req,
  });
  return ok({ ok: true, forced: force });
});
