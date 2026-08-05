// core สร้างใบเสนอราคา "ร่าง + รออนุมัติเจ้าของดีล" — implementation เดียวที่ใช้ร่วม
// ระหว่าง route มาตรฐาน (POST /api/sales-planning/deals/[id]/quotations) กับสายสหมิตร
// (ยืนยัน PO → ออก QT). ผู้เรียกต้องเช็คสิทธิ์ + สถานะดีล (open, มี projectId/customerId)
// ก่อนเรียก; ที่นี่คุมกติกาตัวใบอย่างเดียว: ราคา master, งวดชำระ, snapshot ลูกค้า,
// เลขรันจาก DB, บรรทัด (rollback ถ้าพลาด), ดีล lead/qualified → quotation, audit.
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { resolveProbability } from '@/lib/sales/dealProbability';
import { advanceStage, dealAuditLabel, generateQuoteNumber, quoteTotals, toMoney } from '@/lib/salesPlanning';
import { resolvePinnedPresetVersionIds } from '@/lib/admin/commercialPresets';
import { enforceMasterPrices, normalizeManualLines, seedLinesFromProject } from '@/lib/sales/quoteLines';
import { normalizePaymentPlan, validatePaymentPlan } from '@/lib/sales/paymentPlan';
import { businessDate } from '@/lib/businessDate';
import { pickDocumentAddresses } from '@/lib/master/addresses';
import { validateQuotationPeople } from '@/lib/sales/quotationPeople';
import { loadDealOwnerContact } from '@/lib/sales/dealOwner';

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

  // เบอร์เจ้าของดีล ณ วันออกใบ — ตรึงลงใบ (sales_deals ไม่มีคอลัมน์เบอร์)
  const ownerContact = await loadDealOwnerContact(supabase, deal?.ownerId);

  // งวดชำระ — validate ก่อน (client อาจส่งมาไม่ครบ 100%)
  const pv = validatePaymentPlan(body.paymentPlan);
  if (!pv.ok) throw new QuotationDraftError(pv.error);

  // snapshot ข้อมูลลูกค้า ณ วันออกใบ — server เติมเอง (ในใบ read-only, มติผู้ใช้:
  // แก้ข้อมูลลูกค้าต้องไปแก้ที่ฐานข้อมูลลูกค้า). เลือก "คน" ผู้ติดต่อได้ผ่าน contactIndex.
  const { data: customer } = await supabase
    .from('customers')
    .select('taxId, addresses, address, shippingAddress, branchCode, contacts, contactPerson, contactPhone')
    .eq('id', deal.customerId)
    .maybeSingle();
  // ที่อยู่ที่ใบนี้เลือก (0202/0203) — คนทำใบเลือกได้ว่าออกบิล/ส่งที่ไหน ไม่ส่งมา
  // = ที่อยู่หลักของลูกค้า (พฤติกรรมเดิมของทุกสายที่ไม่มีหน้าจอให้เลือก เช่น PO สหมิตร)
  const picked = pickDocumentAddresses(customer, body);
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
  // งวดชำระ: เติมยอดจาก % ของยอดรวม โดยไม่สร้างหรือแก้ข้อความเงื่อนไขการชำระ
  const paymentPlan = normalizePaymentPlan(body.paymentPlan, totals.totalAmount);
  // ใบใหม่เริ่มเป็น "ร่าง + รออนุมัติ" เสมอ (มติ 2026-07-18): ส่งลูกค้าตอนสร้างไม่ได้
  // เพราะต้องให้เจ้าของดีลอนุมัติก่อน (flow: ร่าง → อนุมัติ → ส่ง). ไม่รับ status='sent'.
  // ผู้รับผิดชอบเอกสารตรวจตอนสร้างแบบไม่บังคับ (บังคับครบตอนกดส่งจริงใน PATCH).
  const peoplePick = await validateQuotationPeople(supabase, body.metadata || {}, { require: false });
  if (!peoplePick.ok) throw new QuotationDraftError(peoplePick.error);

  // ชุดเงื่อนไขการค้าที่คนทำใบเลือก — ตรวจฝั่ง server ก่อนตรึง (client ส่งอะไรมาก็ได้)
  const pinnedPresets = await resolvePinnedPresetVersionIds(supabase, body.metadata || {});

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
      // ข้อความ = snapshot ณ วันออกใบ · id = ที่อยู่ตัวไหน (ฉบับ Rev. ใช้ดึงสดใหม่)
      ...picked.snapshot,
      contactName: contact.name || null,
      contactPhone: contact.phone || null,
      contactEmail: contact.email || null,
      ...totals,
      discountType,
      discountValue,
      vatRate,
      paymentPlan,
      paymentTerms: (body.paymentTerms || '').trim() || null,
      // ใบใหม่เริ่มที่ "ร่าง ยังไม่ยื่น" (mig 0155) — ต้องกดยื่นอนุมัติเองก่อนเข้าคิวเจ้าของดีล
      // (เดิมเกิดมาเป็น 'pending' ทันที = อนุมัติใบที่ยังกรอกไม่เสร็จได้ และไม่มีจุดลงนามผู้เสนอราคา)
      // ใบเดิม grandfather เป็น not_required ไว้ที่ mig 0114
      approvalStatus: 'not_submitted',
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
      // ชุดเงื่อนไขการค้าที่ใบนี้ตั้งต้นมาจาก — server ตรวจเองว่ามีจริง+เผยแพร่+ชนิดตรง
      metadata: {
        ...(body.metadata || {}),
        aeOwner: peoplePick.people.aeOwner || null,
        preparedBy: peoplePick.people.preparedBy || null,
        aeSupervisor: peoplePick.people.aeSupervisor || null,
        // เบอร์ "ผู้เสนอราคา" บนเอกสาร = เบอร์เจ้าของดีล (คนเดียวกับผู้อนุมัติใบ) —
        // ตรึงคู่กับ id ไว้ เอกสารจะได้รู้ว่าเบอร์นี้ยังเป็นของเจ้าของดีลคนปัจจุบันไหม
        salesOwnerId: ownerContact?.id || null,
        salesOwnerPhone: ownerContact?.phone || null,
        paymentPresetVersionId: pinnedPresets.payment,
        remarksPresetVersionId: pinnedPresets.remarks,
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

  // ออกใบเสนอราคา = ดีลเดินมาถึงขั้น "เสนอราคา" แล้ว — ดันไปข้างหน้าเท่านั้น
  // (มติ B4) เดิมเช็คแค่ lead/qualified ตรง ๆ ดีลที่เสนอไทม์ไลน์ไปแล้วจึงค้างที่เดิม
  // ทั้งที่ออกใบไปแล้ว. ใช้ advanceStage เพื่อให้กติกา "ไม่ย้อนกลับ" มาจากที่เดียว
  const nextStage = advanceStage(deal.stage, 'quotation');
  let updatedDeal = deal;
  if (nextStage !== deal.stage) {
    // 🐞 เส้นนี้เคยขยับแต่ `stage` ไม่แตะ `probability` — ดีลที่ออกใบเสนอราคาไปแล้ว
    // จึงค้าง FC 20% ทั้งที่กติกาบอกว่าออกใบแล้ว = 50% (มติผู้ใช้ 2026-08-05)
    const nextProbability = await resolveProbability(supabase, { ...deal, stage: nextStage });
    const { data: patchedDeal } = await supabase
      .from('sales_deals')
      .update({ stage: nextStage, probability: nextProbability, updatedAt: new Date().toISOString() })
      .eq('id', deal.id)
      .select()
      .single();
    updatedDeal = patchedDeal || deal;
    // ⚠️ ทุกเส้นทางที่ขยับ stage ต้องลงประวัติ — ไม่ใช่แค่ audit log
    // 🐞 เส้นนี้เคยเป็นเส้นเดียวที่ลืม (create-project / link-project / timeline /
    // PATCH ดีล / accept RPC เขียนกันครบ) ผลคือขั้น "เสนอราคา" หายจากเส้นเรื่องของดีล
    // และ `daysInStage` บนหน้าดีล (นับจาก stageHistory[0].changedAt) ไปนับจากการ
    // เปลี่ยนสถานะ**ครั้งก่อน** = "อยู่ขั้นนี้มากี่วัน" ยาวเกินจริงเงียบ ๆ
    await supabase.from('sales_deal_stage_history').insert({
      id: genId('DSH'),
      dealId: deal.id,
      fromStage: deal.stage,
      toStage: nextStage,
      changedBy: user.id || null,
      changedByName: user.name || null,
    });
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
