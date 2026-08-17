import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';
import { businessDate } from '@/lib/businessDate';
import { pickDocumentAddresses } from '@/lib/master/addresses';
import { revisionSeparatorOf } from '@/lib/documentStandards';
import { buildQuotationRevisionContent } from '@/lib/sales/quotationRevision';
import { appendDocumentEvent } from '@/lib/sales/documentThread';
import {
  customerMismatchMessage, customerMismatchedLines, enforceMasterPrices, normalizeManualLines,
} from '@/lib/sales/quoteLines';
import { QT_PEOPLE_FIELDS, QT_PEOPLE_RETIRED_FIELDS, validateQuotationPeople } from '@/lib/sales/quotationPeople';
import { isRevisableQuotationApprovalStatus } from '@/lib/sales/quotationWorkflow';
import { loadDealOwnerContact } from '@/lib/sales/dealOwner';
import { closedProjectBlock } from '@/lib/sales/closedProjectGate';

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
    .select('*, lines:quotation_lines(*), deal:sales_deals(id, title, stage, team, ownerId, ownerName, projectId)')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!quote) return notFound('ไม่พบใบเสนอราคา');
  if (!quote.deal || !inSalesEditScope(user, quote.deal)) return forbidden();
  // ใบ grandfather (not_required) ออก Rev. ได้เหมือนใบ approved — เป็นทางเดียวที่ใบเก่า
  // ยังแก้ได้ (มติ 2026-07-26) เพราะทุกด่านในระบบนับใบพวกนี้เป็น "อนุมัติแล้ว" อยู่แล้ว
  if (!isRevisableQuotationApprovalStatus(quote.approvalStatus)) {
    if (quote.approvalStatus === 'pending') {
      return badRequest('ใบเสนอราคานี้กำลังรออนุมัติ — ดึงกลับก่อนแก้ฉบับเดิม');
    }
    return badRequest('ออก Rev. ได้เฉพาะใบเสนอราคาที่อนุมัติแล้ว');
  }
  if (!['draft', 'sent', 'rejected'].includes(quote.status)) {
    if (quote.status === 'closed') {
      return badRequest('ใบนี้ถูกปิดแล้ว (ดีลจบด้วยใบเสนอราคาฉบับอื่น) — ออก Rev. ไม่ได้');
    }
    return badRequest(`ใบสถานะ "${quote.status}" ออก Rev. ไม่ได้${quote.status === 'accepted' ? ' — ใบที่รับแล้วต้องยกเลิกก่อน' : ''}`);
  }
  // ดีล Lost = จบแล้ว — ห้ามออกฉบับแก้ไขใหม่ (กติกาเดียวกับ PATCH/สร้างใบ)
  if (quote.deal?.stage === 'lost') {
    return badRequest('ดีลนี้ Lost แล้ว — ออก Rev. ใหม่ไม่ได้');
  }
  // ฉบับ Rev. = เอกสารใบใหม่ (เลขใหม่ ใบเดิมกลายเป็น read-only) → อยู่ในขอบเขตด่าน B3
  const closedProject = await closedProjectBlock(supabase, quote.deal?.projectId, 'ออก Rev. ใบเสนอราคา');
  if (closedProject) return badRequest(closedProject);

  const body = await req.json().catch(() => ({}));
  const revLines = normalizeManualLines('lines' in body ? body.lines || [] : quote.lines || []);
  // FG ต้องเป็นของลูกค้าที่ออกใบให้ (มติผู้ใช้ 2026-08-17) — ยกเว้นบรรทัดที่สืบทอด
  // มาจากใบเดิม ไม่งั้นใบเก่าที่มีของข้ามลูกค้าค้างอยู่จะออก Rev. ไม่ได้เลย
  const revMismatched = await customerMismatchedLines(supabase, revLines, {
    customerId: quote.customerId,
    previousLines: quote.lines || [],
  });
  if (revMismatched.length) return badRequest(customerMismatchMessage(revMismatched));
  // ราคาบรรทัด FG ล็อกตาม master เสมอ (มติผู้ใช้ 2026-07-15) — enforce ก่อนคิดยอดฉบับใหม่
  body.lines = await enforceMasterPrices(supabase, revLines, quote.lines || []);
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
  const { data: maxRow, error: maxRowError } = await supabase
    .from('quotations')
    .select('revisionNo')
    .eq('baseNumber', base)
    .order('revisionNo', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxRowError) return fail(maxRowError.message, 500);
  const nextRev = (maxRow?.revisionNo ?? quote.revisionNo ?? 0) + 1;
  // ตัวคั่นก่อนเลข R อ่านจากใบต้นทางเอง ไม่ใช่จากรูปแบบปัจจุบัน — ใบที่ออกไว้ก่อน
  // มีการเปลี่ยนรูปแบบเลขที่ในหน้าตั้งค่า จะได้ต่อ R ด้วยตัวคั่นเดิมของสายตัวเอง
  const revSeparator = revisionSeparatorOf(quote.quoteNumber, base);
  const now = new Date().toISOString();

  // ผู้รับผิดชอบเอกสาร: สืบทอดจากใบเดิม + ทับด้วยค่าที่แก้ตอน revise — ต้องเป็นผู้ใช้จริง
  // + role ตรง (ฉบับ revise เป็น draft จึงยังไม่บังคับครบ; บังคับตอนกดยื่นอนุมัติ).
  // ผู้จัดทำไม่ใช่ช่องในนี้ — มันคือคนที่กดยื่นฉบับ Rev. (มติผู้ใช้ 2026-08-17).
  const revBody = (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) ? body.metadata : {};
  const revPeople = Object.fromEntries(QT_PEOPLE_FIELDS.map(
    (field) => [field, field in revBody ? revBody[field] : quote.metadata?.[field]],
  ));
  const revPick = await validateQuotationPeople(supabase, revPeople, { require: false });
  if (!revPick.ok) return badRequest(revPick.error);
  // ช่องผู้รับผิดชอบเขียนจากค่าที่ผ่าน validate เท่านั้น — ตัดค่าดิบจาก client ออกก่อน merge
  const revEditableMeta = { ...revBody };
  for (const field of [...QT_PEOPLE_FIELDS, ...QT_PEOPLE_RETIRED_FIELDS]) delete revEditableMeta[field];

  // เบอร์เจ้าของดีล ณ วันออก Rev. — อ่านสดทุกครั้ง เพราะเจ้าของดีลเปลี่ยนมือได้
  const ownerContact = await loadDealOwnerContact(supabase, quote.deal?.ownerId);

  const newId = genId('QT');
  // ใบ R ใหม่ดึงที่อยู่ลูกค้า "สดจาก master ณ ตอน revise" (มติผู้ใช้) — ที่อยู่เปลี่ยน
  // จะได้ค่าใหม่ ใบเก่าคงเดิม; ผู้ติดต่อ + งวดชำระ สืบทอดจากใบเดิม.
  // ⭐ "สดใหม่ของที่อยู่ **ตัวเดิม**" — ใบเดิมเลือกสาขา/คลังไหนไว้ ฉบับ Rev. ต้องอยู่
  // ที่นั่น (0203) ไม่ใช่เด้งกลับที่อยู่หลักเงียบ ๆ เพราะ master มีหลายที่อยู่แล้ว
  const { data: cust } = quote.customerId
    ? await supabase.from('customers').select('addresses, address, shippingAddress, branchCode, taxId').eq('id', quote.customerId).maybeSingle()
    : { data: null };
  const revAddresses = pickDocumentAddresses(cust, quote);
  const { data: revised, error: insertErr } = await supabase
    .from('quotations')
    .insert({
      id: newId,
      dealId: quote.dealId,
      quoteNumber: `${base}${revSeparator}${nextRev}`,
      baseNumber: base,
      revisionNo: nextRev,
      revisedFromId: quote.id,
      status: 'draft',
      quoteDate: businessDate(),
      validUntil,
      customerId: quote.customerId,
      customerName: quote.customerName,
      // snapshot: ที่อยู่ refresh สดจาก master; ผู้ติดต่อ + งวดชำระ สืบทอดจากใบเดิม
      billingAddress: revAddresses.snapshot.billingAddress ?? quote.billingAddress ?? null,
      shippingAddress: revAddresses.snapshot.shippingAddress || quote.shippingAddress || null,
      branchCode: revAddresses.snapshot.branchCode ?? quote.branchCode ?? null,
      billingAddressId: revAddresses.snapshot.billingAddressId ?? quote.billingAddressId ?? null,
      shippingAddressId: revAddresses.snapshot.shippingAddressId ?? quote.shippingAddressId ?? null,
      customerTaxId: cust?.taxId ?? quote.customerTaxId ?? null,
      contactName: quote.contactName,
      contactPhone: quote.contactPhone,
      contactEmail: quote.contactEmail,
      paymentPlan,
      ...totals,
      discountType,
      discountValue,
      vatRate,
      paymentTerms,
      // ภาษาเอกสารสืบทอดจากใบเดิม (mig 0238) — ลูกค้ารายเดิมยังอ่านภาษาเดิม
      // ฉบับ Rev. ยังเป็นร่าง สลับได้เองถ้าต้องการ
      docLanguage: quote.docLanguage === 'en' ? 'en' : 'th',
      // ฉบับ revise = ร่างใหม่ ต้องกดยื่นอนุมัติเองอีกครั้ง (mig 0155) ไม่สืบทอดการยื่น/อนุมัติเดิม
      approvalStatus: 'not_submitted',
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
        // เจ้าของดีลอาจเปลี่ยนไปตั้งแต่ Rev. ก่อน — อ่านเบอร์ใหม่ทุกครั้ง ไม่สืบทอด
        salesOwnerId: ownerContact?.id || null,
        salesOwnerPhone: ownerContact?.phone || null,
        ...revEditableMeta,
        ...Object.fromEntries(QT_PEOPLE_FIELDS.map((field) => [field, revPick.people[field] || null])),
        // ผู้ดูแล/ผู้ตรวจสอบไม่ใช่ช่องของใบเสนอราคาแล้ว (มติ 2026-08-17) —
        // ฉบับ Rev. เป็นเอกสารใหม่ ไม่สืบทอดคีย์ที่เลิกใช้ (ผู้ดูแล = เจ้าของดีล อ่านสด)
        ...Object.fromEntries(QT_PEOPLE_RETIRED_FIELDS.map((field) => [field, null])),
        revisedFrom: quote.quoteNumber,
      },
      createdBy: user.id || null,
      createdByName: user.name || null,
      createdByPhone: user.phone || null, // snapshot เบอร์ผู้เสนอราคา → โชว์บนเอกสาร V4

    })
    .select()
    .single();
  if (insertErr) {
    // ชนเลขกับ revise ที่ยิงพร้อมกัน (quoteNumber UNIQUE) → 409 อ่านรู้เรื่อง ไม่ใช่ 500 ดิบ
    if (insertErr.code === '23505') return fail('มีการออก Rev. พร้อมกัน — รีเฟรชแล้วลองใหม่', 409);
    return fail(insertErr.message, 500);
  }

  const lineRows = revisionLines.map((l, i) => ({
    id: genId('QTL'),
    quotationId: newId,
    productId: l.productId,
    fgCode: l.fgCode,
    description: l.description,
    qty: l.qty,
    unit: l.unit || 'ชิ้น',
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

  // เหตุการณ์ลงเธรด — ไม่เช็ค error โดยเจตนา (ดู submit/route.js)
  // ⚠️ ลงเธรดของ **ใบเดิม** ไม่ใช่ใบ Rev. ใหม่ (คนละ id) ไม่งั้นใบเดิมจบห้วน ๆ
  // โดยไม่บอกว่าไปต่อที่ไหน · เหตุผลที่ออก Rev. เดิมมีที่เดียวคือ audit log
  await appendDocumentEvent(supabase, {
    docType: 'quotation', doc: quote, action: 'revise',
    opts: { reason: notes, toRevisionNo: nextRev }, user,
  });

  await recordAudit({
    user, action: 'create', entityType: 'quotation', entityId: newId,
    after: revised,
    summary: `Revise ใบเสนอราคา ${quote.quoteNumber} → ${revised.quoteNumber}`,
    request: req,
  });

  return ok(revised, 201);
});
