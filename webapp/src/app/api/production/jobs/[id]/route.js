// ── API งานผลิตรายใบ (mig 0189 · P-2) ─────────────────────────────────────
// PATCH  : วางคิว/ย้ายไลน์/เลื่อนวัน/ปิดงาน
// DELETE : ลบงาน — ใช้ได้เฉพาะงานที่ยังไม่เริ่มผลิต (เริ่มแล้วคือประวัติ)
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { normalizeJobInput } from '@/lib/pm/productionPlan';
import { findJob, requireJob } from '@/lib/pm/productionJobsRepo';
import { findLine } from '@/lib/pm/productionLinesRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireJob({ user, supabase, id });
    if (access.response) return access.response;
    return ok(access.job);
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireJob({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const before = access.job;

    const body = await req.json().catch(() => ({}));
    const { value, error } = normalizeJobInput({ ...before, ...body });
    if (error) return badRequest(error);

    // ไลน์ที่เลือกต้องมีจริง — ผูกไป id มั่วแล้วงานจะหายจากบอร์ด (บอร์ดวนตามไลน์)
    if (value.lineId && value.lineId !== before.lineId) {
      const line = await findLine(supabase, value.lineId);
      if (!line) return badRequest('ไม่พบไลน์ผลิตที่ระบุ');
      if (line.isActive === false) return badRequest('ไลน์นี้ปิดใช้งานอยู่ — เลือกไลน์อื่นหรือเปิดใช้งานก่อน');
    }

    const { data, error: updateError } = await supabase
      .from('production_jobs')
      .update({ ...value, updatedAt: new Date().toISOString() })
      .eq('id', id).select().single();
    if (updateError) return fail(updateError.message, 500);

    await recordAudit({
      user, action: 'update', entityType: 'production_job', entityId: id, before, after: data,
      summary: `แก้งานผลิต ${data.code || id}${data.lineId !== before.lineId ? ' · ย้ายไลน์' : ''}`,
      request: req,
    });
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireJob({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const before = access.job;

    // ⚠️ งานที่เริ่มผลิตแล้วคือ **ประวัติการผลิต** — ยกเลิกได้ (status) แต่ลบทิ้งไม่ได้
    // (กฎเดียวกับนัดเข้าบริการที่ปิดงานแล้ว)
    if (before.status === 'in_progress' || before.status === 'done') {
      return conflict('งานที่เริ่มผลิตแล้วลบไม่ได้ — เป็นประวัติการผลิต · ถ้ายกเลิกจริงให้เปลี่ยนสถานะเป็น "ยกเลิก"');
    }

    const { error } = await supabase.from('production_jobs').delete().eq('id', id);
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'delete', entityType: 'production_job', entityId: id, before,
      summary: `ลบงานผลิต ${before.code || id}`, request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});
