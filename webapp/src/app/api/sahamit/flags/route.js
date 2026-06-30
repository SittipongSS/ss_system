import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';

export const dynamic = 'force-dynamic';

// GET /api/sahamit/flags[?status=open] — the shift/cut audit queue for AR-109.
export async function GET(request) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId } = ctx;
  const status = new URL(request.url).searchParams.get('status');

  let q = supabase.from('sahamit_fc_flags').select('*').eq('customerId', customerId).order('createdAt', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}
