import { quoteTotals, toMoney } from '@/lib/salesPlanning';
import { normalizeManualLines } from '@/lib/sales/quoteLines';
import { QUOTE_PACK_INPUT_OPEN } from '@/lib/sales/linePacks';
import { normalizePaymentPlan, validatePaymentPlan } from '@/lib/sales/paymentPlan';

/* `packInputOpen` = ช่องสำหรับเทสต์เท่านั้น (ค่าตั้งต้น = สวิตช์จริง) — ส่งต่อให้ตัว normalize ทั้งสองทาง
   เพื่อให้เทสต์พิสูจน์ได้ว่าเลขแพ็ค (mig 0407) รอดทางออก Rev. ทั้งเส้น (normalize → ราคาทะเบียน → normalize)
   ขณะช่องยังปิดบน production · route ไม่ส่งค่านี้ (ยาม linePackWritePaths.test.mjs) */
export function buildQuotationRevisionContent(quote, body = {}, { packInputOpen = QUOTE_PACK_INPUT_OPEN } = {}) {
  const lines = 'lines' in body
    ? normalizeManualLines(body.lines || [], { packInputOpen })
    : normalizeManualLines(quote.lines || [], { packInputOpen });
  const discountType = 'discountType' in body
    ? (['percent', 'amount'].includes(body.discountType) ? body.discountType : null)
    : quote.discountType;
  const discountValue = discountType
    ? toMoney('discountValue' in body ? body.discountValue : quote.discountValue)
    : 0;
  const vatRate = toMoney('vatRate' in body ? body.vatRate : quote.vatRate, 0);
  const totals = quoteTotals(lines, { discountType, discountValue, vatRate });

  if ('paymentPlan' in body) {
    const paymentValidation = validatePaymentPlan(body.paymentPlan);
    if (!paymentValidation.ok) return paymentValidation;
  }

  const paymentPlan = normalizePaymentPlan(
    'paymentPlan' in body ? body.paymentPlan : quote.paymentPlan,
    totals.totalAmount,
  );
  const paymentTerms = 'paymentTerms' in body
    ? (body.paymentTerms || '').trim() || null
    : quote.paymentTerms;

  return {
    ok: true,
    lines,
    totals,
    discountType,
    discountValue,
    vatRate,
    paymentPlan,
    paymentTerms,
    validUntil: 'validUntil' in body ? body.validUntil || null : quote.validUntil,
    notes: 'notes' in body ? (body.notes || '').trim() || null : quote.notes,
    // เอกสารอ้างอิง (mig 0267) — สืบทอดจากใบเดิม ทับได้ตอนออก Rev. เหมือน notes
    referenceNote: 'referenceNote' in body
      ? (body.referenceNote || '').trim() || null
      : quote.referenceNote,
  };
}
