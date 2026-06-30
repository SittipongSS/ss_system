import { randomUUID } from 'crypto';
import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const FIELDS = ['pmInStock', 'pmArrivedAt', 'rmOrderedAt', 'rmArrivedAt', 'note'];

// PATCH /api/sahamit/material/[poLineId] — upsert the manual PM/RM tracking for a
// PO line. Derived fields (inForecast/leadDays/readyDate) are computed live in
// GET, not stored here. Scoped: the PO line must belong to AR-109.
export async function PATCH(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { poLineId } = await params;

  // Verify the line is ours.
  const { data: line } = await supabase
    .from('sahamit_po_lines').select('id,customerId,fgCode').eq('id', poLineId).eq('customerId', customerId).maybeSingle();
  if (!line) return Response.json({ error: 'ไม่พบรายการ PO นี้' }, { status: 404 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const patch = {};
  for (const f of FIELDS) {
    if (f in body) patch[f] = f === 'pmInStock' ? !!body[f] : (body[f] || null);
  }
  patch.updatedAt = new Date().toISOString();
  patch.updatedById = user?.id ?? null;
  patch.updatedByName = user?.name ?? null;

  const { data: existing } = await supabase
    .from('sahamit_material_tracking').select('*').eq('poLineId', poLineId).maybeSingle();

  let saved;
  if (existing) {
    const { data, error } = await supabase
      .from('sahamit_material_tracking').update(patch).eq('poLineId', poLineId).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    saved = data;
  } else {
    const row = { id: 'SMT-' + randomUUID(), poLineId, customerId, ...patch };
    const { data, error } = await supabase
      .from('sahamit_material_tracking').insert(row).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    saved = data;
  }

  await recordAudit({
    user, action: existing ? 'update' : 'create', entityType: 'sahamit_material', entityId: poLineId,
    before: existing || null, after: saved, summary: `ติดตามวัสดุ PO line ${line.fgCode}`, request,
  });
  return Response.json(saved);
}
