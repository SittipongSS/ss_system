import { randomUUID } from 'crypto';
import {
  getSahamitContext, sahamitError,
  loadSahamitProducts, indexByFgCode, resolveFgCode,
} from '@/lib/sahamit/server';
import { deliveryMonthOf } from '@/lib/sahamit/po';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/sahamit/po — all POs for AR-109, each with its lines (newest first).
export async function GET() {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId } = ctx;

  const { data: pos, error } = await supabase
    .from('sahamit_pos')
    .select('*')
    .eq('customerId', customerId)
    .order('receivedDate', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const ids = (pos || []).map((p) => p.id);
  const linesByPo = {};
  if (ids.length) {
    const { data: lines, error: lErr } = await supabase
      .from('sahamit_po_lines')
      .select('*')
      .in('poId', ids);
    if (lErr) return Response.json({ error: lErr.message }, { status: 500 });
    for (const l of lines || []) (linesByPo[l.poId] ||= []).push(l);
  }

  return Response.json((pos || []).map((p) => ({ ...p, lines: linesByPo[p.id] || [] })));
}

// POST /api/sahamit/po — create a PO with its lines.
// Body: { poNumber, docDate?, receivedDate?, quoteRef?, note?,
//         lines:[{fgCode, qty, dueDate?, expectedDate?}] }
export async function POST(request) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const poNumber = String(body?.poNumber || '').trim();
  if (!poNumber) return Response.json({ error: 'ต้องระบุเลขที่ PO' }, { status: 400 });

  const cleaned = (Array.isArray(body?.lines) ? body.lines : [])
    .map((l) => ({
      fgCode: String(l.fgCode || '').trim(),
      qty: Number(l.qty),
      dueDate: l.dueDate || null,
      expectedDate: l.expectedDate || null,
    }))
    .filter((l) => l.fgCode && Number.isFinite(l.qty) && l.qty > 0);
  if (!cleaned.length) return Response.json({ error: 'ต้องมีรายการสินค้าอย่างน้อย 1 รายการ (รหัส + จำนวน > 0)' }, { status: 400 });

  // Reject duplicate PO number for this customer up-front (DB also enforces).
  const { data: dup } = await supabase
    .from('sahamit_pos').select('id').eq('customerId', customerId).eq('poNumber', poNumber).maybeSingle();
  if (dup) return Response.json({ error: `เลขที่ PO "${poNumber}" มีอยู่แล้ว` }, { status: 409 });

  let products;
  try { products = await loadSahamitProducts(supabase, customerId); }
  catch (e) { return Response.json({ error: `อ่านแคตตาล็อกสินค้าไม่สำเร็จ: ${e.message}` }, { status: 500 }); }
  const index = indexByFgCode(products);
  const unknown = new Set();

  const poId = 'SPO-' + randomUUID();
  const nowIso = new Date().toISOString();
  const po = {
    id: poId,
    poNumber,
    customerId,
    docDate: body?.docDate || null,
    receivedDate: body?.receivedDate || null,
    quoteRef: body?.quoteRef || null,
    note: body?.note || null,
    createdById: user?.id ?? null,
    createdByName: user?.name ?? null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const { error: pErr } = await supabase.from('sahamit_pos').insert(po);
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

  const lineRows = cleaned.map((l) => {
    const r = resolveFgCode(index, l.fgCode);
    if (!r.known) unknown.add(l.fgCode);
    return {
      id: 'SPL-' + randomUUID(),
      poId,
      customerId,
      productId: r.productId,
      fgCode: l.fgCode,
      productName: r.productName,
      qty: l.qty,
      dueDate: l.dueDate,
      expectedDate: l.expectedDate,
      expectedHistory: [],
      actualDeliveredDate: null,
      deliveryMonth: deliveryMonthOf(l),
      splitFromPoLineId: null,
      status: 'open',
      createdAt: nowIso,
    };
  });

  const { error: lErr } = await supabase.from('sahamit_po_lines').insert(lineRows);
  if (lErr) {
    await supabase.from('sahamit_pos').delete().eq('id', poId);
    return Response.json({ error: lErr.message }, { status: 500 });
  }

  await recordAudit({
    user, action: 'create', entityType: 'sahamit_po', entityId: poId,
    after: po, summary: `สร้าง PO ${poNumber} (${lineRows.length} รายการ)`, request,
  });

  return Response.json({ ...po, lines: lineRows, unknownFgCodes: [...unknown] }, { status: 201 });
}
