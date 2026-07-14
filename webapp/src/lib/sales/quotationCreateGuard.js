export const ACTIVE_QUOTATION_STATUSES = Object.freeze(['draft', 'sent', 'accepted']);

export const ACTIVE_INITIAL_QUOTE_CONSTRAINT = 'quotations_one_active_initial_per_deal_uidx';

export function isConcurrentQuotationCreate(error) {
  if (error?.code !== '23505') return false;
  return [error.message, error.details, error.hint]
    .filter(Boolean)
    .some((value) => String(value).includes(ACTIVE_INITIAL_QUOTE_CONSTRAINT));
}

export function activeQuotationConflictMessage(quote) {
  const number = quote?.quoteNumber ? ` (${quote.quoteNumber})` : '';
  return `ดีลนี้มีใบเสนอราคาที่ใช้งานอยู่แล้ว${number} กรุณาเปิดใบเดิมหรือสร้างฉบับแก้ไข`;
}
