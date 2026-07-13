export function normalizeDealOrder(deals = [], preferredOrder = []) {
  const knownIds = new Set(deals.map((deal) => String(deal.id)));
  const seen = new Set();
  const orderedIds = [];

  for (const rawId of preferredOrder || []) {
    const id = String(rawId);
    if (knownIds.has(id) && !seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  }
  for (const deal of deals) {
    const id = String(deal.id);
    if (!seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  }
  return orderedIds;
}

export function sortDealsByOrder(deals = [], preferredOrder = []) {
  const orderedIds = normalizeDealOrder(deals, preferredOrder);
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  return [...deals].sort((a, b) => (rank.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER));
}

export function reindexTasksByDealOrder(tasks = [], orderedDealIds = []) {
  const rank = new Map(orderedDealIds.map((id, index) => [String(id), index]));
  const sorted = [...tasks].sort((a, b) => {
    const aRank = a.dealId == null ? -1 : (rank.get(String(a.dealId)) ?? orderedDealIds.length);
    const bRank = b.dealId == null ? -1 : (rank.get(String(b.dealId)) ?? orderedDealIds.length);
    return aRank - bRank || (a.stepOrder ?? 0) - (b.stepOrder ?? 0);
  });
  return sorted.map((task, stepOrder) => ({ ...task, stepOrder }));
}
