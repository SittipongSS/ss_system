import { randomUUID } from 'crypto';
import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const STATUSES = ['open', 'confirmed_shift', 'confirmed_cut', 'ignored'];
const KINDS = ['drop', 'shift_suspect', 'lockedBreak'];

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

// POST /api/sahamit/flags — raise a flag MANUALLY from a reconcile cell (the
// import path seeds flags automatically; this is the proactive "predicted shift →
// queue it for review" button). Create-or-update on the (cell, round, kind)
// identity so it composes with the auto-seeded flags instead of throwing on the
// unique key. Defaults to status 'open' — confirming shift-vs-cut still happens
// in /review WITH the customer's answer (we suggest, we don't decide).
// Body: { fgCode, month, roundNo?, kind?, prevQty?, newQty?, drop?, shiftToMonth?, status?, customerResponse?, note? }
export async function POST(request) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }
  const fgCode = String(body?.fgCode || '').trim();
  const month = String(body?.month || '').trim();
  const mOk = (m) => /^\d{4}-\d{2}$/.test(m);
  if (!fgCode || !mOk(month)) return Response.json({ error: 'ข้อมูลไม่ครบ (สินค้า/เดือน)' }, { status: 400 });

  const kind = KINDS.includes(body?.kind) ? body.kind : 'shift_suspect';
  const status = STATUSES.includes(body?.status) ? body.status : 'open';
  const roundNo = Number.isFinite(Number(body?.roundNo)) ? Number(body.roundNo) : 0;
  const shiftToMonth = mOk(String(body?.shiftToMonth || '')) ? body.shiftToMonth : null;
  if (status === 'confirmed_shift' && !shiftToMonth) {
    return Response.json({ error: 'ยืนยันเลื่อนต้องระบุเดือนปลายทาง (shiftToMonth)' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const resolved = status !== 'open'
    ? { resolvedById: user?.id ?? null, resolvedByName: user?.name ?? null, resolvedAt: now }
    : { resolvedById: null, resolvedByName: null, resolvedAt: null };
  const mutable = {
    prevQty: Number(body?.prevQty) || 0,
    newQty: Number(body?.newQty) || 0,
    drop: Number(body?.drop) || 0,
    kind, status, shiftToMonth,
    customerResponse: body?.customerResponse || null,
    note: body?.note || null,
    ...resolved,
  };

  // Update the existing (cell, round, kind) flag if present; else insert.
  const { data: existing } = await supabase
    .from('sahamit_fc_flags').select('*')
    .eq('customerId', customerId).eq('fgCode', fgCode).eq('month', month).eq('roundNo', roundNo).eq('kind', kind)
    .maybeSingle();

  let data, error;
  if (existing) {
    ({ data, error } = await supabase
      .from('sahamit_fc_flags').update(mutable).eq('id', existing.id).eq('customerId', customerId).select().single());
  } else {
    ({ data, error } = await supabase
      .from('sahamit_fc_flags')
      .insert({ id: 'FCF-' + randomUUID(), customerId, fgCode, month, roundNo, createdAt: now, ...mutable })
      .select().single());
  }
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await recordAudit({
    user, action: existing ? 'update' : 'create', entityType: 'sahamit_fc_flag', entityId: data.id,
    before: existing || null, after: data, summary: `ตั้งธง FC ${fgCode} ${month} (${kind} → ${status})`, request,
  });
  return Response.json(data, { status: existing ? 200 : 201 });
}
