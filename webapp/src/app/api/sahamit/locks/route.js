import { randomUUID } from 'crypto';
import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/sahamit/locks — locked (agreed) FC cells for AR-109.
export async function GET() {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId } = ctx;
  const { data, error } = await supabase.from('sahamit_fc_locks').select('*').eq('customerId', customerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

// POST /api/sahamit/locks — lock a cell. Body: { fgCode, month, lockedQty, note? }
export async function POST(request) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }
  const fgCode = String(body?.fgCode || '').trim();
  const month = String(body?.month || '').trim();
  const lockedQty = Number(body?.lockedQty);
  if (!fgCode || !/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(lockedQty)) {
    return Response.json({ error: 'ข้อมูลล็อกไม่ครบ (สินค้า/เดือน/จำนวน)' }, { status: 400 });
  }

  const { data: dup } = await supabase
    .from('sahamit_fc_locks').select('id').eq('customerId', customerId).eq('fgCode', fgCode).eq('month', month).maybeSingle();
  if (dup) return Response.json({ error: 'ช่องนี้ถูกล็อกอยู่แล้ว' }, { status: 409 });

  const row = {
    id: 'FCK-' + randomUUID(), customerId, fgCode, month, lockedQty,
    note: body?.note || null, lockedById: user?.id ?? null, lockedByName: user?.name ?? null,
    lockedAt: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('sahamit_fc_locks').insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await recordAudit({ user, action: 'create', entityType: 'sahamit_fc_lock', entityId: data.id, after: data, summary: `ล็อก FC ${fgCode} ${month} = ${lockedQty}`, request });
  return Response.json(data, { status: 201 });
}
