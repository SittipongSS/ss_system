import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// PATCH /api/sahamit/products/[id] — set the standard unit price used for the
// SAHAMIT value report (มูลค่า = qty × price). Scoped to AR-109 so this module
// can only price its own catalog. Price-only: does NOT touch approvalStatus, so
// it never reverts a product to pending (unlike a full master edit).
// Body: { price: number | null }
export async function PATCH(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { id } = await params;

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  let price = null;
  if (body?.price !== null && body?.price !== undefined && body?.price !== '') {
    price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) return Response.json({ error: 'ราคาต้องเป็นตัวเลข ≥ 0' }, { status: 400 });
  }

  // Scope: the product must belong to AR-109.
  const { data: product } = await supabase
    .from('products').select('*')
    .eq('id', id).eq('customerId', customerId).maybeSingle();
  if (!product) return Response.json({ error: 'ไม่พบสินค้านี้ (หรือไม่ได้อยู่กับลูกค้า AR-109)' }, { status: 404 });

  const { data: updated, error } = await supabase
    .from('products').update({ price }).eq('id', id).eq('customerId', customerId).select('id, fgCode, price').single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await recordAudit({
    user, action: 'update', entityType: 'product', entityId: id,
    before: { price: product.price }, after: { price },
    summary: `ตั้งราคาสหมิตร ${product.fgCode} = ${price ?? '—'}`, request,
  });

  return Response.json(updated);
}
