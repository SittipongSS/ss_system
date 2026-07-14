function revisionNumber(quotation) {
  const value = Number(quotation?.revisionNo);
  return Number.isFinite(value) ? value : 0;
}

function revisionTimestamp(quotation) {
  const value = Date.parse(quotation?.createdAt || quotation?.updatedAt || "");
  return Number.isFinite(value) ? value : 0;
}

export function quotationRevisionKey(quotation) {
  return quotation?.baseNumber || quotation?.quoteNumber || quotation?.id || "";
}

export function latestQuotationRevisions(quotations = []) {
  const latestByBase = new Map();

  for (const quotation of quotations) {
    const key = quotationRevisionKey(quotation);
    const current = latestByBase.get(key);
    if (!current
      || revisionNumber(quotation) > revisionNumber(current)
      || (revisionNumber(quotation) === revisionNumber(current)
        && revisionTimestamp(quotation) > revisionTimestamp(current))) {
      latestByBase.set(key, quotation);
    }
  }

  return [...latestByBase.values()].sort((a, b) => revisionTimestamp(b) - revisionTimestamp(a));
}
