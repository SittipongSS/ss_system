import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// POST /api/sahamit/po/[id]/merge — รวมกลับ (ยกเลิกแบ่งส่ง): [id] = PO ยอดเหลือ.
// คืน PO แม่เป็นยอดเต็ม (ล้าง shippedQty ทุกบรรทัด) แล้วลบ PO ยอดเหลือ (+บรรทัด).
export async function POST(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { id } = await params;

  const { data: balance } = await supabase
    .from('sahamit_pos').select('*').eq('id', id).eq('customerId', customerId).maybeSingle();
  if (!balance) return Response.json({ error: 'ไม่พบ PO นี้' }, { status: 404 });
  if (!balance.splitFromPoId) return Response.json({ error: 'PO นี้ไม่ใช่ยอดเหลือจากการแบ่งส่ง' }, { status: 400 });

  // คืน PO แม่เป็นเต็ม
  await supabase
    .from('sahamit_po_lines').update({ shippedQty: null })
    .eq('poId', balance.splitFromPoId).eq('customerId', customerId);

  // ลบ PO ยอดเหลือ (+บรรทัด)
  await supabase.from('sahamit_po_lines').delete().eq('poId', id).eq('customerId', customerId);
  const { error } = await supabase.from('sahamit_pos').delete().eq('id', id).eq('customerId', customerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await recordAudit({
    user, action: 'delete', entityType: 'sahamit_po', entityId: id,
    before: balance, summary: `รวมกลับ (ยกเลิกแบ่งส่ง) PO ยอดเหลือ ${balance.poNumber} → คืน PO แม่เป็นเต็ม`, request,
  });
  return Response.json({ ok: true, restoredPoId: balance.splitFromPoId });
}
