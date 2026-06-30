import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// DELETE /api/sahamit/locks/[id] — unlock a cell. Scoped to AR-109.
export async function DELETE(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { id } = await params;

  const { data: lock } = await supabase
    .from('sahamit_fc_locks').select('*').eq('id', id).eq('customerId', customerId).maybeSingle();
  if (!lock) return Response.json({ error: 'ไม่พบล็อก' }, { status: 404 });

  const { error } = await supabase.from('sahamit_fc_locks').delete().eq('id', id).eq('customerId', customerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await recordAudit({ user, action: 'delete', entityType: 'sahamit_fc_lock', entityId: id, before: lock, summary: `ปลดล็อก FC ${lock.fgCode} ${lock.month}`, request });
  return Response.json({ ok: true });
}
