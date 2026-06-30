import { randomUUID } from 'crypto';
import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/sahamit/coverage — cross-month PO coverage allocations for AR-109.
export async function GET() {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId } = ctx;
  const { data, error } = await supabase.from('sahamit_po_coverage').select('*').eq('customerId', customerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

// POST /api/sahamit/coverage — allocate PO from sourceMonth to cover targetMonth.
// Body: { fgCode, sourceMonth, targetMonth, qty, note? }
export async function POST(request) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }
  const fgCode = String(body?.fgCode || '').trim();
  const sourceMonth = String(body?.sourceMonth || '').trim();
  const targetMonth = String(body?.targetMonth || '').trim();
  const qty = Number(body?.qty);
  const mOk = (m) => /^\d{4}-\d{2}$/.test(m);
  if (!fgCode || !mOk(sourceMonth) || !mOk(targetMonth) || !Number.isFinite(qty) || qty <= 0) {
    return Response.json({ error: 'ข้อมูลไม่ครบ (สินค้า/เดือนต้นทาง/เดือนปลายทาง/จำนวน > 0)' }, { status: 400 });
  }
  if (sourceMonth === targetMonth) return Response.json({ error: 'เดือนต้นทางและปลายทางต้องต่างกัน' }, { status: 400 });

  const row = {
    id: 'COV-' + randomUUID(), customerId, fgCode, sourceMonth, targetMonth, qty,
    note: body?.note || null, confirmedById: user?.id ?? null, confirmedByName: user?.name ?? null,
    createdAt: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('sahamit_po_coverage').insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await recordAudit({ user, action: 'create', entityType: 'sahamit_po_coverage', entityId: data.id, after: data, summary: `ชดเชย ${fgCode} ${sourceMonth}→${targetMonth} ${qty}`, request });
  return Response.json(data, { status: 201 });
}
