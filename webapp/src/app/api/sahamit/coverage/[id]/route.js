import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// DELETE /api/sahamit/coverage/[id] — remove a coverage allocation. Scoped.
export async function DELETE(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { id } = await params;

  const { data: cov } = await supabase
    .from('sahamit_po_coverage').select('*').eq('id', id).eq('customerId', customerId).maybeSingle();
  if (!cov) return Response.json({ error: 'ไม่พบรายการชดเชย' }, { status: 404 });

  const { error } = await supabase.from('sahamit_po_coverage').delete().eq('id', id).eq('customerId', customerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await recordAudit({ user, action: 'delete', entityType: 'sahamit_po_coverage', entityId: id, before: cov, summary: `ลบการชดเชย ${cov.fgCode} ${cov.sourceMonth}→${cov.targetMonth}`, request });
  return Response.json({ ok: true });
}
