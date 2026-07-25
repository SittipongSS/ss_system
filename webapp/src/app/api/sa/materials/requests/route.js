// ── API ใบขอราคาวัสดุ — รายการ + เปิดใบ (mig 0143) ──────────────────────
// เซลเปิดใบถามราคาวัสดุ (costing:edit). RD/PC เห็นคิวทั้งฝ่ายเพื่อไปตอบ
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canViewCosting } from '@/lib/permissions';
import { normalizeMaterialRequestItems } from '@/lib/materialPrices';
import { findMaterialRequest, loadMaterialRequests } from '@/lib/materialPricesAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/sa/materials/requests?status=pending
export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const url = new URL(request.url);
    const listParam = (k) => (url.searchParams.get(k) || '').split(',').filter(Boolean);
    const rows = await loadMaterialRequests(getSupabaseAdmin(), {
      filters: { status: listParam('status'), team: listParam('team') },
    });
    return Response.json(rows, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/sa/materials/requests — เปิดใบใหม่ (ร่าง; เลขที่ออกตอนส่ง)
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!can(user?.role, 'costing:edit')) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { items, error } = normalizeMaterialRequestItems(body.items);
  if (error) return Response.json({ error }, { status: 400 });

  const requestId = `MR-${randomUUID()}`;
  const { error: headerError } = await supabase.from('material_price_requests').insert({
    id: requestId,
    status: 'draft',
    customerId: body.customerId || null,
    customerName: body.customerName || null,
    requestedById: user?.id ?? null,
    requestedByName: user?.name ?? null,
    team: user?.team ?? null,
    note: body.note ? String(body.note).trim().slice(0, 2000) : null,
  });
  if (headerError) return Response.json({ error: headerError.message }, { status: 500 });

  const { error: itemError } = await supabase.from('material_price_request_items')
    .insert(items.map((it) => ({ id: `MRI-${randomUUID()}`, requestId, ...it })));
  if (itemError) {
    await supabase.from('material_price_requests').delete().eq('id', requestId);
    return Response.json({ error: itemError.message }, { status: 500 });
  }

  const created = await findMaterialRequest(supabase, requestId);
  await recordAudit({
    user, action: 'create', entityType: 'material_price_request', entityId: requestId, after: created,
    summary: `เปิดใบขอราคาวัสดุ ${items.length} รายการ`, request,
  });
  return Response.json(created, { status: 201 });
}
