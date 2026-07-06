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

export const dynamic = 'force-dynamic';

const quoteSelect = '*, lines:quotation_lines(*)';

async function loadDeal(supabase, id) {
  const { data, error } = await supabase.from('sales_deals').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

function productLabel(product) {
  return product?.productDescription || product?.productDescriptionEn || product?.fgCode || 'สินค้า';
}

function qtyFromProjectProduct(row) {
  const raw = row?.orderQty || row?.productionQty || 1;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function seedLinesFromProject(supabase, deal) {
  if (!deal.projectId) return [];
  const { data } = await supabase
    .from('project_products')
    .select('*, product:products(id, fgCode, productDescription, productDescriptionEn, retailPriceIncVat)')
    .eq('projectId', deal.projectId);
  return (data || []).map((row, index) => {
    const qty = qtyFromProjectProduct(row);
    const unitPrice = toMoney(row.product?.retailPriceIncVat);
    return {
      id: genId('QTL'),
      productId: row.productId || row.product?.id || null,
      fgCode: row.product?.fgCode || null,
      description: productLabel(row.product),
      qty,
      unitPrice,
      lineTotal: qty * unitPrice,
      source: 'project_products',
      sortOrder: index,
      metadata: {
        projectProductId: row.id,
      },
    };
  });
}

function normalizeManualLines(lines = []) {
  return lines
    .map((line, index) => {
      const qty = toMoney(line.qty, 1) || 1;
      const unitPrice = toMoney(line.unitPrice);
      return {
        id: genId('QTL'),
        productId: line.productId || null,
        fgCode: line.fgCode || null,
        description: line.description || line.fgCode || `รายการ ${index + 1}`,
        qty,
        unitPrice,
        lineTotal: qty * unitPrice,
        source: 'manual',
        sortOrder: index,
        metadata: line.metadata || {},
      };
    })
    .filter((line) => line.description && line.qty > 0);
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const deal = await loadDeal(supabase, id);
  if (!deal) return notFound('ไม่พบ deal');
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
  if (!deal) return notFound('ไม่พบ deal');
  if (!inSalesEditScope(user, deal)) return forbidden();
  if (deal.stage === 'lost') return badRequest('ไม่สามารถสร้าง quotation จาก deal ที่ lost แล้ว');

  const body = await req.json().catch(() => ({}));
  let lines = normalizeManualLines(body.lines || []);
  if (!lines.length) lines = await seedLinesFromProject(supabase, deal);
  if (!lines.length) return badRequest('ต้องมีอย่างน้อย 1 line หรือผูก PM project ที่มี FG ก่อน');

  const totals = quoteTotals(lines);
  const approval = quoteApprovalRequirement(totals, body.metadata || {});
  let quoteNumber = body.quoteNumber || (await generateQuoteNumber(supabase));
  let quote = null;
  let error = null;
  const quoteId = genId('QT');
  for (let attempt = 0; attempt < 5; attempt++) {
    ({ data: quote, error } = await supabase
      .from('quotations')
      .insert({
        id: quoteId,
        dealId: deal.id,
        quoteNumber,
        status: body.status === 'sent' ? 'sent' : 'draft',
        quoteDate: body.quoteDate || new Date().toISOString().slice(0, 10),
        validUntil: body.validUntil || null,
        customerId: deal.customerId || null,
        customerName: deal.customerName || null,
        ...totals,
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
      .single());
    if (!error) break;
    if (error.code === '23505' && !body.quoteNumber) {
      quoteNumber = await generateQuoteNumber(supabase);
      continue;
    }
    break;
  }
  if (error) return fail(error.code === '23505' ? `เลข quotation ซ้ำ: ${quoteNumber}` : error.message, error.code === '23505' ? 409 : 500);

  const rows = lines.map((line) => ({ ...line, quotationId: quote.id }));
  const { data: insertedLines, error: lineError } = await supabase.from('quotation_lines').insert(rows).select();
  if (lineError) {
    await supabase.from('quotations').delete().eq('id', quote.id);
    return fail(lineError.message, 500);
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
