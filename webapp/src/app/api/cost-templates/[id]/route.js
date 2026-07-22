// แก้ไข / ซ่อน แม่แบบต้นทุนรายใบ — ผู้ดูแลระบบเท่านั้น (master:manage)
// ไม่มีเส้นทางลบ: 0140 guard บล็อก DELETE ไว้ที่ฐานข้อมูล (มติ: ซ่อนแทนลบ)
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canViewCosting } from '@/lib/permissions';
import { normalizeCostTemplateLines } from '@/lib/master/costTemplate';
import { findCostTemplate } from '@/lib/master/costTemplateAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const { id } = await params;
    const template = await findCostTemplate(getSupabaseAdmin(), id);
    if (!template) return Response.json({ error: 'ไม่พบแม่แบบต้นทุน' }, { status: 404 });
    return Response.json(template, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — สองการกระทำ: แก้เนื้อหา (ค่าเริ่มต้น) และ { action: 'hide' } ซ่อนถาวร
// แยกเป็น action ชัด ๆ ไม่ให้ซ่อนหลุดไปกับการกดบันทึกธรรมดา
export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!can(user?.role, 'master:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const before = await findCostTemplate(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบแม่แบบต้นทุน' }, { status: 404 });
  if (before.isHidden) {
    return Response.json({ error: 'แม่แบบนี้ถูกซ่อนแล้ว แก้ไขไม่ได้ — สร้างใบใหม่ของหมวดนี้แทน' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const nowIso = new Date().toISOString();

  if (body.action === 'hide') {
    const { error } = await supabase
      .from('product_type_cost_templates')
      .update({
        isHidden: true, hiddenAt: nowIso, updatedAt: nowIso,
        hiddenById: user?.id ?? null, hiddenByName: user?.name ?? null,
      })
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const after = await findCostTemplate(supabase, id);
    await recordAudit({
      user, action: 'update', entityType: 'cost_template', entityId: id, before, after,
      summary: `ซ่อนแม่แบบต้นทุนของหมวด ${before.categoryCode}`, request,
    });
    return Response.json(after);
  }

  const { lines, error: lineError } = normalizeCostTemplateLines(body.lines);
  if (lineError) return Response.json({ error: lineError }, { status: 400 });

  // แก้บรรทัด = เขียนชุดใหม่ทับทั้งชุด (ลบแล้วใส่ใหม่) — ง่ายและตรงกับหน้าจอที่
  // ให้แก้ทั้งตารางแล้วกดบันทึกครั้งเดียว. หมวดของแม่แบบเปลี่ยนไม่ได้ (guard 0140)
  const { error: delError } = await supabase
    .from('product_type_cost_lines').delete().eq('templateId', id);
  if (delError) return Response.json({ error: delError.message }, { status: 500 });

  const { error: insError } = await supabase
    .from('product_type_cost_lines')
    .insert(lines.map((l) => ({ id: `PTCL-${randomUUID()}`, templateId: id, ...l })));
  if (insError) return Response.json({ error: insError.message }, { status: 500 });

  const { error: metaError } = await supabase
    .from('product_type_cost_templates')
    .update({
      note: body.note ? String(body.note).trim().slice(0, 500) : null,
      updatedAt: nowIso, updatedById: user?.id ?? null, updatedByName: user?.name ?? null,
    })
    .eq('id', id);
  if (metaError) return Response.json({ error: metaError.message }, { status: 500 });

  const after = await findCostTemplate(supabase, id);
  await recordAudit({
    user, action: 'update', entityType: 'cost_template', entityId: id, before, after,
    summary: `แก้ไขแม่แบบต้นทุนของหมวด ${before.categoryCode} (${lines.length} บรรทัด)`, request,
  });
  return Response.json(after);
}
