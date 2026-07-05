import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { monthOf, cleanDestination } from '@/lib/sahamit/po';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// dueDate + destination = ระดับหัว (mig 0058); denormalize ลงบรรทัดด้วยเมื่อแก้
const HEADER_FIELDS = ['poNumber', 'docDate', 'receivedDate', 'dueDate', 'destination', 'quoteRef', 'note'];

async function loadPo(supabase, customerId, id) {
  const { data } = await supabase
    .from('sahamit_pos').select('*').eq('id', id).eq('customerId', customerId).maybeSingle();
  return data;
}

// PATCH /api/sahamit/po/[id] — update header fields only (lines have their own
// endpoint). Scoped to AR-109.
export async function PATCH(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { id } = await params;

  const before = await loadPo(supabase, customerId, id);
  if (!before) return Response.json({ error: 'ไม่พบ PO นี้' }, { status: 404 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const patch = {};
  for (const f of HEADER_FIELDS) if (f in body) patch[f] = body[f] === '' ? null : body[f];
  if ('destination' in patch) patch.destination = cleanDestination(patch.destination);
  if (patch.poNumber) {
    patch.poNumber = String(patch.poNumber).trim();
    const { data: dup } = await supabase
      .from('sahamit_pos').select('id').eq('customerId', customerId).eq('poNumber', patch.poNumber).maybeSingle();
    if (dup && dup.id !== id) return Response.json({ error: `เลขที่ PO "${patch.poNumber}" มีอยู่แล้ว` }, { status: 409 });
  }
  if (!Object.keys(patch).length) return Response.json(before);
  patch.updatedAt = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from('sahamit_pos').update(patch).eq('id', id).eq('customerId', customerId).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // denormalize กำหนดส่ง/สถานที่ ลงทุกบรรทัด (ให้กระทบยอด/วัสดุอ่านรายบรรทัดตรงกับหัว).
  // deliveryMonth คิดจาก expectedDate (ถ้าเลื่อนไว้) ไม่งั้นใช้ dueDate ใหม่.
  const linePatch = {};
  if ('dueDate' in patch) linePatch.dueDate = patch.dueDate;
  if ('destination' in patch) linePatch.destination = patch.destination;
  if (Object.keys(linePatch).length) {
    const { data: lines } = await supabase
      .from('sahamit_po_lines').select('id,expectedDate').eq('poId', id).eq('customerId', customerId);
    for (const l of lines || []) {
      const lp = { ...linePatch };
      if ('dueDate' in patch) lp.deliveryMonth = monthOf(l.expectedDate || patch.dueDate);
      await supabase.from('sahamit_po_lines').update(lp).eq('id', l.id).eq('customerId', customerId);
    }
  }

  await recordAudit({
    user, action: 'update', entityType: 'sahamit_po', entityId: id,
    before, after: updated, summary: `แก้ไข PO ${updated.poNumber}`, request,
  });
  return Response.json(updated);
}

// DELETE /api/sahamit/po/[id] — remove a PO (lines cascade via FK). Scoped.
export async function DELETE(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { id } = await params;

  const before = await loadPo(supabase, customerId, id);
  if (!before) return Response.json({ error: 'ไม่พบ PO นี้' }, { status: 404 });

  const { error } = await supabase
    .from('sahamit_pos').delete().eq('id', id).eq('customerId', customerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await recordAudit({
    user, action: 'delete', entityType: 'sahamit_po', entityId: id,
    before, summary: `ลบ PO ${before.poNumber}`, request,
  });
  return Response.json({ ok: true });
}
