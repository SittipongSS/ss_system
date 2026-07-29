// ── API ของเข้า PM/RM ของโครงการ (mig 0176) ─────────────────────────────
// GET  : รายการของเข้าทั้งหมดของโครงการ (ทุกคนที่เห็นโครงการ)
// POST : เพิ่มแถวเอง (PC หรือฝ่ายขายในทีมโครงการ)
//
// ⚠️ สิทธิ์แก้ไขเปิดให้ PC ด้วย ไม่ใช่แค่ scope ของ PM — ดูเหตุผลใน lib/pm/deliveries.js
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { projectWriteBlockedError } from '@/lib/pm/projectClose';
import { normalizeDeliveryInput } from '@/lib/pm/deliveries';
import { loadDeliveries, requireProject } from '@/lib/pm/deliveriesRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  const access = await requireProject({ user, supabase, id });
  if (access.response) return access.response;
  try {
    return ok(await loadDeliveries(supabase, access.project.id));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST { kind, label, qty?, unit?, poRef?, dueDate?, arrivedAt?, materialId?, dealId?, note? }
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  const access = await requireProject({ user, supabase, id, edit: true });
  if (access.response) return access.response;
  const project = access.project;
  // โครงการที่ปิดแล้วไม่รับของเข้าใหม่ (ต้อง reopen ผ่าน /close ก่อน) — อ่านยังได้
  const closedErr = projectWriteBlockedError(project);
  if (closedErr) return conflict(closedErr);

  const body = await req.json().catch(() => ({}));
  const { value, error } = normalizeDeliveryInput(body);
  if (error) return badRequest(error);

  try {
    // ดีลของแถว: client ส่งมาได้ แต่ต้องเป็นดีลของโครงการนี้เท่านั้น
    const dealId = body.dealId || null;
    if (dealId) {
      const { data: deal, error: dealError } = await supabase
        .from('sales_deals').select('id, projectId').eq('id', dealId).maybeSingle();
      if (dealError) throw dealError;
      if (deal?.projectId !== project.id) return badRequest('ดีลที่ระบุไม่ได้อยู่ในโครงการนี้');
    }

    const nowIso = new Date().toISOString();
    const row = {
      id: genId('MDL'),
      projectId: project.id,
      dealId,
      ...value,
      source: 'manual',
      createdById: user?.id ?? null,
      createdByName: user?.name ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const { data, error: insertError } = await supabase
      .from('material_deliveries').insert(row).select().single();
    if (insertError) return fail(insertError.message, 500);

    await recordAudit({
      user, action: 'create', entityType: 'material_delivery', entityId: data.id, after: data,
      summary: `เพิ่มรายการของเข้า "${data.label}" ในโครงการ ${project.code || project.id}`, request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
