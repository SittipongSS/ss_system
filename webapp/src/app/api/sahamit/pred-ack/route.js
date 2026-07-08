import { randomUUID } from 'crypto';
import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';

export const dynamic = 'force-dynamic';

const mOk = (m) => /^\d{4}-\d{2}$/.test(m);

// GET /api/sahamit/pred-ack — ช่องที่ "ดูแล้ว" (ปิดเตือนคาดการณ์) ของ AR-109.
export async function GET() {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId } = ctx;
  const { data, error } = await supabase
    .from('sahamit_fc_pred_ack').select('*').eq('customerId', customerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

// POST /api/sahamit/pred-ack — กด "ดูแล้ว" ช่อง (upsert). Body: { fgCode, month }
export async function POST(request) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }
  const fgCode = String(body?.fgCode || '').trim();
  const month = String(body?.month || '').trim();
  if (!fgCode || !mOk(month)) return Response.json({ error: 'ข้อมูลไม่ครบ (สินค้า/เดือน)' }, { status: 400 });

  const row = {
    id: 'FPA-' + randomUUID(), customerId, fgCode, month,
    ackAt: new Date().toISOString(), ackById: user?.id ?? null, ackByName: user?.name ?? null,
  };
  const { data, error } = await supabase
    .from('sahamit_fc_pred_ack')
    .upsert(row, { onConflict: 'customerId,fgCode,month' })
    .select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}

// DELETE /api/sahamit/pred-ack — ยกเลิก "ดูแล้ว". Body: { fgCode, month }
export async function DELETE(request) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId } = ctx;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }
  const fgCode = String(body?.fgCode || '').trim();
  const month = String(body?.month || '').trim();
  const { error } = await supabase
    .from('sahamit_fc_pred_ack').delete()
    .eq('customerId', customerId).eq('fgCode', fgCode).eq('month', month);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
