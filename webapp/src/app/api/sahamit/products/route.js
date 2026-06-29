import { getSahamitContext, sahamitError, loadSahamitProducts } from '@/lib/sahamit/server';

export const dynamic = 'force-dynamic';

// GET /api/sahamit/products — the AR-109 product catalog (id, fgCode, name) used
// by the forecast/PO grids to pick SKUs and resolve fgCodes. Scoped + gated by
// getSahamitContext (team KA + customer AR-109).
export async function GET() {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  try {
    const products = await loadSahamitProducts(ctx.supabase, ctx.customerId);
    products.sort((a, b) => String(a.fgCode || '').localeCompare(String(b.fgCode || '')));
    return Response.json(products);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
