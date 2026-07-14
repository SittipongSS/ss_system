import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import {
  canEditSalesPlanning,
  canViewSalesPlanning,
  dealAuditLabel,
  generateQuoteNumber,
  inSalesEditScope,
  inSalesViewScope,
  quoteTotals,
  toMoney,
} from '@/lib/salesPlanning';
import { quoteApprovalRequirement } from '@/lib/quotationApproval';
import { normalizeManualLines, seedLinesFromProject } from '@/lib/sales/quoteLines';
import { normalizePaymentPlan, validatePaymentPlan, paymentPlanSummary } from '@/lib/sales/paymentPlan';

export const dynamic = 'force-dynamic';

const quoteSelect = '*, lines:quotation_lines(*)';

async function loadDeal(supabase, id) {
  const { data, error } = await supabase.from('sales_deals').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const deal = await loadDeal(supabase, id);
  if (!deal) return notFound('ไม่พบดีล');
  if (!inSalesViewScope(user, deal)) return forbidden();

  const { data, error } = await supabase
    .from('quotations')
    .select(quoteSelect)
    .eq('dealId', deal.id)
    .order('createdAt', { ascending: false });
  if (error) return fail(error.message, 500);
  return ok(data || []);
});

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const deal = await loadDeal(supabase, id);
  if (!deal) return notFound('ไม่พบดีล');
  if (!inSalesEditScope(user, deal)) return forbidden();
  if (deal.stage === 'lost') return badRequest('ไม่สามารถสร้างใบเสนอราคาจากโครงการที่ Lost แล้ว');

  // เงื่อนไขใหม่ (feedback ผู้ใช้): ดีลต้องผูกโครงการก่อน — โครงการเป็นตัวเชื่อมลูกค้า
  // ส่วนรายการสินค้า (รหัส FG) ค่อยใส่ตอนแก้ใบ ไม่บังคับตอนสร้าง
  if (!deal.projectId) return badRequest('ดีลนี้ยังไม่ผูกโครงการ — สร้าง/ผูกโครงการก่อน แล้วจึงออกใบเสนอราคา');
  // cascade: ใบเสนอราคาต้องมีลูกค้า (มติผู้ใช้ — เลือกลูกค้าที่ดีลก่อน)
  if (!deal.customerId) return badRequest('ดีลนี้ยังไม่ระบุลูกค้า — เลือกลูกค้าที่ดีลก่อน แล้วจึงออกใบเสนอราคา');

  const body = await req.json().catch(() => ({}));
  let lines = normalizeManualLines(body.lines || []);
  // ดึง FG ของโครงการมาตั้งต้นเฉพาะเมื่อขอ (default = ใบเปล่า ให้ใส่รหัส FG เองใน editor)
  if (!lines.length && body.seedFromProject) lines = await seedLinesFromProject(supabase, deal);
  if (body.status === 'sent' && !lines.length) {
    return badRequest('ต้องมีอย่างน้อย 1 รายการก่อนส่งลูกค้า');
  }

  // งวดชำระ — validate ก่อน (client อาจส่งมาไม่ครบ 100%)
  const pv = validatePaymentPlan(body.paymentPlan);
  if (!pv.ok) return badRequest(pv.error);

  // snapshot ข้อมูลลูกค้า ณ วันออกใบ — server เติมเอง (ในใบ read-only, มติผู้ใช้:
  // แก้ข้อมูลลูกค้าต้องไปแก้ที่ฐานข้อมูลลูกค้า). เลือก "คน" ผู้ติดต่อได้ผ่าน contactIndex.
  const { data: customer } = await supabase
    .from('customers')
    .select('address, shippingAddress, branchCode, contacts, contactPerson, contactPhone')
    .eq('id', deal.customerId)
    .maybeSingle();
  const contacts = Array.isArray(customer?.contacts) ? customer.contacts : [];
  const ci = Number.isInteger(body.contactIndex) ? body.contactIndex : 0;
  const contact = contacts[ci] || contacts[0] || {
    name: customer?.contactPerson || '', phone: customer?.contactPhone || '', email: '',
  };

  // ส่วนลดท้ายใบ + VAT (เฟส D — FM-SA-01): default vatRate 0 = ราคารวม VAT แล้ว
  const discountType = ['percent', 'amount'].includes(body.discountType) ? body.discountType : null;
  const discountValue = discountType ? toMoney(body.discountValue) : 0;
  const vatRate = toMoney(body.vatRate, 0);
  const totals = quoteTotals(lines, { discountType, discountValue, vatRate });
  // งวดชำระ: เติมยอดจาก % ของยอดรวม + สรุปเป็นข้อความ paymentTerms (แก้ทับได้)
  const paymentPlan = normalizePaymentPlan(body.paymentPlan, totals.totalAmount);
  const approval = quoteApprovalRequirement(totals, body.metadata || {});
  if (body.status === 'sent' && !(totals.totalAmount > 0)) {
    return badRequest('ยอดรวมต้องมากกว่า 0 ก่อนส่งลูกค้า');
  }
  if (body.status === 'sent' && approval.required) {
    return badRequest('ยอดนี้ต้องบันทึกร่างและรออนุมัติก่อนส่งลูกค้า');
  }
  // เลขรันจาก DB (atomic ต่อเดือน — mig 0092): QT-YYMMXXXX-0
  const { base, quoteNumber } = await generateQuoteNumber(supabase);
  const quoteId = genId('QT');
  const { data: quote, error } = await supabase
    .from('quotations')
    .insert({
      id: quoteId,
      dealId: deal.id,
      quoteNumber,
      baseNumber: base,
      revisionNo: 0,
      status: body.status === 'sent' ? 'sent' : 'draft',
      quoteDate: body.quoteDate || new Date().toISOString().slice(0, 10),
      validUntil: body.validUntil || null,
      customerId: deal.customerId || null,
      customerName: deal.customerName || null,
      // snapshot ลูกค้า (read-only ในใบ)
      billingAddress: customer?.address || null,
      shippingAddress: customer?.shippingAddress || customer?.address || null,
      branchCode: customer?.branchCode || null,
      contactName: contact.name || null,
      contactPhone: contact.phone || null,
      contactEmail: contact.email || null,
      ...totals,
      discountType,
      discountValue,
      vatRate,
      paymentPlan,
      paymentTerms: (body.paymentTerms || '').trim() || paymentPlanSummary(paymentPlan, totals.totalAmount),
      approvalStatus: approval.required ? 'pending' : 'not_required',
      approvalReason: approval.reason,
      approvalRequestedAt: approval.required ? new Date().toISOString() : null,
      approvalRequestedBy: approval.required ? user.id || null : null,
      approvalRequestedByName: approval.required ? user.name || null : null,
      notes: body.notes || null,
      metadata: {
        ...(body.metadata || {}),
        approvalThreshold: approval.threshold,
      },
      createdBy: user.id || null,
      createdByName: user.name || null,
    })
    .select()
    .single();
  if (error) return fail(error.code === '23505' ? `เลข quotation ซ้ำ: ${quoteNumber}` : error.message, error.code === '23505' ? 409 : 500);

  let insertedLines = [];
  if (lines.length) {
    const rows = lines.map((line) => ({ ...line, quotationId: quote.id }));
    const { data: lineRows, error: lineError } = await supabase.from('quotation_lines').insert(rows).select();
    if (lineError) {
      await supabase.from('quotations').delete().eq('id', quote.id);
      return fail(lineError.message, 500);
    }
    insertedLines = lineRows || [];
  }

  const nextStage = deal.stage === 'lead' || deal.stage === 'qualified' ? 'quotation' : deal.stage;
  let updatedDeal = deal;
  if (nextStage !== deal.stage) {
    const { data: patchedDeal } = await supabase
      .from('sales_deals')
      .update({ stage: nextStage, updatedAt: new Date().toISOString() })
      .eq('id', deal.id)
      .select()
      .single();
    updatedDeal = patchedDeal || deal;
  }

  await recordAudit({
    user,
    action: 'create',
    entityType: 'quotation',
    entityId: quote.id,
    after: { ...quote, lines: insertedLines || [] },
    summary: `สร้าง quotation ${quote.quoteNumber} สำหรับ ${dealAuditLabel(deal)}`,
    request: req,
  });

  return ok({ ...quote, lines: insertedLines || [], deal: updatedDeal }, 201);
});
