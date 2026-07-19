import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';
import { businessDate } from '@/lib/businessDate';
import { buildQuotationRevisionContent } from '@/lib/sales/quotationRevision';
import { enforceMasterPrices, normalizeManualLines } from '@/lib/sales/quoteLines';
import { validateQuotationPeople } from '@/lib/sales/quotationPeople';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/quotations/[id]/revise — ออกฉบับแก้ไข (FM-SA-01):
// เลขฐานเดิม + R ถัดไป (QT-YYMMXXXX-1, -2, …) คัดลอกเนื้อหาทั้งใบเป็น draft ใหม่
// ใบเดิม → status 'revised' (read-only, ประวัติยังอยู่ครบ). ใช้เลขที่ในการติดตาม — ห้ามซ้ำ.
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const { data: quote, error } = await supabase
    .from('quotations')
    .select('*, lines:quotation_lines(*), deal:sales_deals(id, title, stage, team, ownerId, ownerName)')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!quote) return notFound('ไม่พบใบเสนอราคา');
  if (!quote.deal || !inSalesEditScope(user, quote.deal)) return forbidden();
  if (!['draft', 'sent', 'rejected'].includes(quote.status)) {
    if (quote.status === 'closed') {
      return badRequest('ใบนี้ถูกปิดแล้ว (ดีลจบด้วยใบเสนอราคาฉบับอื่น) — ออก Revise ไม่ได้');
    }
    return badRequest(`ใบสถานะ "${quote.status}" ออก Revise ไม่ได้${quote.status === 'accepted' ? ' — ใบที่รับแล้วต้องยกเลิกก่อน' : ''}`);
  }
  // ดีล Lost = จบแล้ว — ห้ามออกฉบับแก้ไขใหม่ (กติกาเดียวกับ PATCH/สร้างใบ)
  if (quote.deal?.stage === 'lost') {
    return badRequest('ดีลนี้ Lost แล้ว — ออก Revision ใหม่ไม่ได้');
  }

  const body = await req.json().catch(() => ({}));
  // ราคาบรรทัด FG ล็อกตาม master เสมอ (มติผู้ใช้ 2026-07-15) — enforce ก่อนคิดยอดฉบับใหม่
  body.lines = await enforceMasterPrices(
    supabase,
    normalizeManualLines('lines' in body ? body.lines || [] : quote.lines || []),
    quote.lines || [],
  );
  const revision = buildQuotationRevisionContent(quote, body);
  if (!revision.ok) return badRequest(revision.error);
  const {
    lines: revisionLines,
    totals,
    discountType,
    discountValue,
    vatRate,
    paymentPlan,
    paymentTerms,
    validUntil,
    notes,
  } = revision;

  // เลข R ถัดไปของเลขฐานเดียวกัน (กันช่องโหว่ revise ใบเก่าซ้ำ → เลขชน unique)
  const base = quote.baseNumber || quote.quoteNumber;
  const { data: maxRow } = await supabase
    .from('quotations')
    .select('revisionNo')
    .eq('baseNumber', base)
    .order('revisionNo', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextRev = (maxRow?.revisionNo ?? quote.revisionNo ?? 0) + 1;
  const now = new Date().toISOString();

  // ผู้รับผิดชอบเอกสาร: สืบทอดจากใบเดิม + ทับด้วยค่าที่แก้ตอน revise — ต้องเป็นผู้ใช้จริง
  // + role ตรง (ฉบับ revise เป็น draft จึงยังไม่บังคับครบ; บังคับตอนกดส่งใบ). ผู้จัดทำ
  // ไม่ล็อกเป็นผู้ออก revision อีกต่อไป — เลือก AC จริง (มติผู้ใช้ 2026-07-16).
  const revBody = (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) ? body.metadata : {};
  const revPeople = {
    aeOwner: 'aeOwner' in revBody ? revBody.aeOwner : quote.metadata?.aeOwner,
    preparedBy: 'preparedBy' in revBody ? revBody.preparedBy : quote.metadata?.preparedBy,
    aeSupervisor: 'aeSupervisor' in revBody ? revBody.aeSupervisor : quote.metadata?.aeSupervisor,
  };
  const revPick = await validateQuotationPeople(supabase, revPeople, { require: false });
  if (!revPick.ok) return badRequest(revPick.error);

  const newId = genId('QT');
  // ใบ R ใหม่ดึงที่อยู่ลูกค้า "สดจาก master ณ ตอน revise" (มติผู้ใช้) — ที่อยู่เปลี่ยน
  // จะได้ค่าใหม่ ใบเก่าคงเดิม; ผู้ติดต่อ + งวดชำระ สืบทอดจากใบเดิม.
  const { data: cust } = quote.customerId
    ? await supabase.from('customers').select('address, shippingAddress, branchCode').eq('id', quote.customerId).maybeSingle()
    : { data: null };
  const { data: revised, error: insertErr } = await supabase
    .from('quotations')
    .insert({
      id: newId,
      dealId: quote.dealId,
      quoteNumber: `${base}-${nextRev}`,
      baseNumber: base,
      revisionNo: nextRev,
      revisedFromId: quote.id,
      status: 'draft',
      quoteDate: businessDate(),
      validUntil,
      customerId: quote.customerId,
      customerName: quote.customerName,
      // snapshot: ที่อยู่ refresh สดจาก master; ผู้ติดต่อ + งวดชำระ สืบทอดจากใบเดิม
      billingAddress: cust?.address ?? quote.billingAddress ?? null,
      shippingAddress: cust?.shippingAddress || cust?.address || quote.shippingAddress || null,
      branchCode: cust?.branchCode ?? quote.branchCode ?? null,
      contactName: quote.contactName,
      contactPhone: quote.contactPhone,
      contactEmail: quote.contactEmail,
      paymentPlan,
      ...totals,
      discountType,
      discountValue,
      vatRate,
      paymentTerms,
      approvalStatus: 'pending', // ฉบับ revise ใหม่ต้องให้เจ้าของดีลอนุมัติก่อนส่ง (มติ 2026-07-18)
      approvalReason: null,
      approvalRequestedAt: null,
      approvalRequestedBy: null,
      approvalRequestedByName: null,
      approvalFingerprint: null,
      approvedAt: null,
      approvedBy: null,
      approvedByName: null,
      notes,
      // metadata สืบทอดจากใบเดิม + ทับด้วยค่าที่แก้ตอน revise; ผู้รับผิดชอบ validate แล้ว
      metadata: {
        ...(quote.metadata || {}),
        ...revBody,
        aeOwner: revPick.people.aeOwner || null,
        preparedBy: revPick.people.preparedBy || null,
        aeSupervisor: revPick.people.aeSupervisor || null,
        revisedFrom: quote.quoteNumber,
      },
      createdBy: user.id || null,
      createdByName: user.name || null,
    })
    .select()
    .single();
  if (insertErr) {
    // ชนเลขกับ revise ที่ยิงพร้อมกัน (quoteNumber UNIQUE) → 409 อ่านรู้เรื่อง ไม่ใช่ 500 ดิบ
    if (insertErr.code === '23505') return fail('มีการออก Revision พร้อมกัน — รีเฟรชแล้วลองใหม่', 409);
    return fail(insertErr.message, 500);
  }

  const lineRows = revisionLines.map((l, i) => ({
    id: genId('QTL'),
    quotationId: newId,
    productId: l.productId,
    fgCode: l.fgCode,
    description: l.description,
    qty: l.qty,
    unitPrice: l.unitPrice,
    discountType: l.discountType,
    discountValue: l.discountValue,
    discountAmount: l.discountAmount,
    lineTotal: l.lineTotal,
    source: l.source,
    sortOrder: l.sortOrder ?? i,
    metadata: l.metadata || {},
  }));
  if (lineRows.length) {
    const { error: lineErr } = await supabase.from('quotation_lines').insert(lineRows);
    if (lineErr) {
      await supabase.from('quotations').delete().eq('id', newId);
      return fail(lineErr.message, 500);
    }
  }

  // ใบต้นทางต้องกลายเป็น 'revised' (read-only) — ถ้าล้มเหลว จะเหลือ 2 ใบ active ในเลข
  // ฐานเดียว. guard .eq('status', quote.status) กัน race, และถ้าเขียนไม่สำเร็จให้ถอน
  // ใบ R ที่เพิ่งสร้าง (กันสถานะค้างครึ่งทาง — ไม่มี transaction ร่วมข้าม request)
  const { data: sourceUpdated, error: sourceErr } = await supabase
    .from('quotations').update({ status: 'revised', updatedAt: now })
    .eq('id', quote.id).eq('status', quote.status).select('id').maybeSingle();
  if (sourceErr || !sourceUpdated) {
    if (lineRows.length) await supabase.from('quotation_lines').delete().eq('quotationId', newId);
    await supabase.from('quotations').delete().eq('id', newId);
    return fail(sourceErr?.message || 'ใบต้นทางถูกแก้ไขพร้อมกัน — รีเฟรชแล้วลองใหม่', 409);
  }

  await recordAudit({
    user, action: 'create', entityType: 'quotation', entityId: newId,
    after: revised,
    summary: `Revise ใบเสนอราคา ${quote.quoteNumber} → ${revised.quoteNumber}`,
    request: req,
  });

  return ok(revised, 201);
});
