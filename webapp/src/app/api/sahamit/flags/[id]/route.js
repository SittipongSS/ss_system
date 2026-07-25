import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const STATUSES = ['open', 'confirmed_shift', 'confirmed_filled', 'confirmed_cut', 'ignored'];

// PATCH /api/sahamit/flags/[id] — resolve a flag (confirm shift / cut / ignore).
// Body: { status, shiftToMonth?, note?, customerResponse? }
export async function PATCH(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { id } = await params;

  const { data: flag } = await supabase
    .from('sahamit_fc_flags').select('*').eq('id', id).eq('customerId', customerId).maybeSingle();
  if (!flag) return Response.json({ error: 'ไม่พบรายการ' }, { status: 404 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }
  if (body.status && !STATUSES.includes(body.status)) return Response.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 });

  const patch = {
    status: body.status ?? flag.status,
    shiftToMonth: 'shiftToMonth' in body ? (body.shiftToMonth || null) : flag.shiftToMonth,
    note: 'note' in body ? (body.note || null) : flag.note,
    customerResponse: 'customerResponse' in body ? (body.customerResponse || null) : flag.customerResponse,
    resolvedById: user?.id ?? null,
    resolvedByName: user?.name ?? null,
    resolvedAt: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('sahamit_fc_flags').update(patch).eq('id', id).eq('customerId', customerId).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await recordAudit({
    user, action: 'update', entityType: 'sahamit_fc_flag', entityId: id,
    before: flag, after: data, summary: `เคลียร์ธง FC ${data.fgCode} ${data.month} → ${data.status}`, request,
  });
  return Response.json(data);
}
