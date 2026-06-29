import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// DELETE /api/sahamit/forecast/rounds/[id] — remove a round (lines cascade via
// the FK in migration 0051). Scoped to AR-109 so a stray id from another
// customer can't be deleted through this module.
export async function DELETE(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { id } = await params;

  const { data: round } = await supabase
    .from('sahamit_forecast_rounds')
    .select('*')
    .eq('id', id)
    .eq('customerId', customerId)
    .maybeSingle();
  if (!round) return Response.json({ error: 'ไม่พบรอบ FC นี้' }, { status: 404 });

  const { error } = await supabase
    .from('sahamit_forecast_rounds')
    .delete()
    .eq('id', id)
    .eq('customerId', customerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await recordAudit({
    user, action: 'delete', entityType: 'sahamit_forecast_round', entityId: id,
    before: round, summary: `ลบ FC รอบที่ ${round.roundNo}`, request,
  });

  return Response.json({ ok: true });
}
