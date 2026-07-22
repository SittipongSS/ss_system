// core สร้างใบเสนอราคา "ร่าง + รออนุมัติเจ้าของดีล" — implementation เดียวที่ใช้ร่วม
// ระหว่าง route มาตรฐาน (POST /api/sales-planning/deals/[id]/quotations) กับสายสหมิตร
// (ยืนยัน PO → ออก QT). ผู้เรียกต้องเช็คสิทธิ์ + สถานะดีล (open, มี projectId/customerId)
// ก่อนเรียก; ที่นี่คุมกติกาตัวใบอย่างเดียว: ราคา master, งวดชำระ, snapshot ลูกค้า,
// เลขรันจาก DB, บรรทัด (rollback ถ้าพลาด), ดีล lead/qualified → quotation, audit.
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { dealAuditLabel, dealTypeOf, generateQuoteNumber, quoteTotals, toMoney } from '@/lib/salesPlanning';
import { resolvePublishedCommercialPreset } from '@/lib/admin/commercialPresets';
import { enforceMasterPrices, normalizeManualLines, seedLinesFromProject } from '@/lib/sales/quoteLines';
import { normalizePaymentPlan, validatePaymentPlan, paymentPlanSummary } from '@/lib/sales/paymentPlan';
import { businessDate } from '@/lib/businessDate';
import { validateQuotationPeople } from '@/lib/sales/quotationPeople';

// ความผิดพลาดเชิงกติกา (ไม่ใช่บั๊ก) — route แปลงเป็น HTTP response ตาม status
export class QuotationDraftError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function createQuotationDraft({ supabase, user, deal, body = {}, request }) {
  // ราคาบรรทัด FG ล็อกตาม master เสมอ (client ส่งราคามาเองไม่ได้ — มติผู้ใช้ 2026-07-15)
  // ราคาขายในใบ = ราคาผลิตทั้งระบบ (มติ 2026-07-19 — ดู QUOTE_PRICE_FIELD)
  let lines = await enforceMasterPrices(supabase, normalizeManualLines(body.lines || []));
  // ดึง FG ของโครงการมาตั้งต้นเฉพาะเมื่อขอ (default = ใบเปล่า ให้ใส่รหัส FG เองใน editor)
  if (!lines.length && body.seedFromProject) lines = await seedLinesFromProject(supabase, deal);
  if (body.status === 'sent' && !lines.length) {
    throw new QuotationDraftError('ต้องมีอย่างน้อย 1 รายการก่อนส่งลูกค้า');
  }

  // งวดชำระ — validate ก่อน (client อาจส่งมาไม่ครบ 100%)
  const pv = validatePaymentPlan(body.paymentPlan);
  if (!pv.ok) throw new QuotationDraftError(pv.error);

  // snapshot ข้อมูลลูกค้า ณ วันออกใบ — server เติมเอง (ในใบ read-only, มติผู้ใช้:
  // แก้ข้อมูลลูกค้าต้องไปแก้ที่ฐานข้อมูลลูกค้า). เลือก "คน" ผู้ติดต่อได้ผ่าน contactIndex.
  const { data: customer } = await supabase
    .from('customers')
    .select('taxId, address, shippingAddress, branchCode, contacts, contactPerson, contactPhone')
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
  // default +VAT 7% ท้ายใบ (มติ 2026-07-19): ราคาบรรทัด = ราคาผลิตไม่รวม VAT →
  // ท้ายใบเห็นยอด ex-VAT แล้วบวก VAT ให้ยอดจบเทียบกับเอกสารจริงของลูกค้า (เช่น PO
  // สหมิตรที่ยอดรวม VAT) ได้; ผู้ใช้สลับเป็น "รวม VAT แล้ว" (0) ในใบได้เสมอ
  const vatRate = toMoney(body.vatRate, 7);
  const totals = quoteTotals(lines, { discountType, discountValue, vatRate });
  // งวดชำระ: เติมยอดจาก % ของยอดรวม + สรุปเป็นข้อความ paymentTerms (แก้ทับได้)
  const paymentPlan = normalizePaymentPlan(body.paymentPlan, totals.totalAmount);
  // ใบใหม่เริ่มเป็น "ร่าง + รออนุมัติ" เสมอ (มติ 2026-07-18): ส่งลูกค้าตอนสร้างไม่ได้
  // เพราะต้องให้เจ้าของดีลอนุมัติก่อน (flow: ร่าง → อนุมัติ → ส่ง). ไม่รับ status='sent'.
  // ผู้รับผิดชอบเอกสารตรวจตอนสร้างแบบไม่บังคับ (บังคับครบตอนกดส่งจริงใน PATCH).
  const peoplePick = await validateQuotationPeople(supabase, body.metadata || {}, { require: false });
  if (!peoplePick.ok) throw new QuotationDraftError(peoplePick.error);

  // ตรึงเวอร์ชัน Commercial Preset (Published) ที่ "ควบคุม" ใบนี้ตาม scope ของดีล ณ ตอนสร้าง
  // — ใช้เป็น commercialPresetVersionId ตอนตรึง issued snapshot (Phase 7B). server เป็น
  // ผู้ตัดสิน (ไม่เชื่อค่าจาก client) และเป็น best-effort: preset พังต้องไม่ทำให้สร้างใบไม่ได้.
  const governingPreset = await resolvePublishedCommercialPreset(supabase, {
    documentKey: 'quotation',
    teamKey: deal.team,
    dealType: dealTypeOf(deal),
  }).catch(() => null);

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
      status: 'draft', // ใบใหม่เป็นร่างเสมอ — ส่งได้หลังเจ้าของดีลอนุมัติ (มติ 2026-07-18)
      quoteDate: body.quoteDate || businessDate(),
      validUntil: body.validUntil || null,
      customerId: deal.customerId || null,
      customerName: deal.customerName || null,
      // snapshot ลูกค้า (read-only ในใบ)
      customerTaxId: customer?.taxId || null,
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
      // รออนุมัติจากเจ้าของดีลก่อนส่ง (มติ 2026-07-18) — ใบเดิม grandfather ไว้ที่ mig 0114
      approvalStatus: 'pending',
      approvalReason: null,
      approvalRequestedAt: null,
      approvalRequestedBy: null,
      approvalRequestedByName: null,
      approvalFingerprint: null,
      approvedAt: null,
      approvedBy: null,
      approvedByName: null,
      notes: body.notes || null,
      // ผู้รับผิดชอบเอกสาร validate แล้ว (ผู้ดูแล/ผู้จัดทำ/ผู้ตรวจสอบ = ผู้ใช้จริง+role ตรง)
      metadata: {
        ...(body.metadata || {}),
        aeOwner: peoplePick.people.aeOwner || null,
        preparedBy: peoplePick.people.preparedBy || null,
        aeSupervisor: peoplePick.people.aeSupervisor || null,
        // server เป็นผู้ตัดสิน — เขียนทับค่าจาก client เสมอ (forensic ของ snapshot)
        commercialPresetVersionId: governingPreset?.published?.id || null,
      },
      createdBy: user.id || null,
      createdByName: user.name || null,
      createdByPhone: user.phone || null, // snapshot เบอร์ผู้เสนอราคา → โชว์บนเอกสาร V4
    })
    .select()
    .single();
  if (error) {
    throw new QuotationDraftError(
      error.code === '23505' ? `เลข quotation ซ้ำ: ${quoteNumber}` : error.message,
      error.code === '23505' ? 409 : 500,
    );
  }

  let insertedLines = [];
  if (lines.length) {
    const rows = lines.map((line) => ({ ...line, quotationId: quote.id }));
    const { data: lineRows, error: lineError } = await supabase.from('quotation_lines').insert(rows).select();
    if (lineError) {
      await supabase.from('quotations').delete().eq('id', quote.id);
      throw new QuotationDraftError(lineError.message, 500);
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
    request,
  });

  return { quote: { ...quote, lines: insertedLines || [] }, deal: updatedDeal };
}
