// ── API ไลน์ผลิตรายตัว (mig 0184) ────────────────────────────────────────
// PATCH  : แก้ข้อมูลไลน์
// DELETE : ลบไลน์ — ถูกบล็อกถ้ามีคิวผลิตอ้างอยู่ (ให้ปิดใช้งานแทน)
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, notFound } from '@/lib/http';
import { normalizeLineInput } from '@/lib/pm/productionLines';
import { countJobsOnLine, findLine, requireProduction } from '@/lib/pm/productionLinesRepo';

export const dynamic = 'force-dynamic';

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const access = requireProduction({ user, edit: true });
  if (access.response) return access.response;
  const { id } = await ctx.params;

  try {
    const before = await findLine(supabase, id);
    if (!before) return notFound('ไม่พบไลน์ผลิต');

    // ฟอร์มเดียวกับตอนสร้าง (กฎ AGENTS.md) → validate ชุดเดียวกัน โดยรวมค่าเดิม
    // เข้าไปก่อน เพื่อให้ PATCH ที่ส่งมาบางช่องไม่ถูกอ่านว่า "ล้างช่องที่เหลือ"
    const body = await req.json().catch(() => ({}));
    const { value, error } = normalizeLineInput({ ...before, ...body });
    if (error) return badRequest(error);

    const { data, error: updateError } = await supabase
      .from('production_lines')
      .update({ ...value, updatedAt: new Date().toISOString() })
      .eq('id', id).select().single();
    if (updateError) {
      if (updateError.code === '23505') return conflict(`มีไลน์รหัส ${value.code} อยู่แล้ว`);
      return fail(updateError.message, 500);
    }

    await recordAudit({
      user, action: 'update', entityType: 'production_line', entityId: id, before, after: data,
      summary: `แก้ไลน์ผลิต ${data.code}`, request: req,
    });
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const access = requireProduction({ user, edit: true });
  if (access.response) return access.response;
  const { id } = await ctx.params;

  try {
    const before = await findLine(supabase, id);
    if (!before) return notFound('ไม่พบไลน์ผลิต');

    // ⚠️ ลบไลน์ที่มีคิวผลิตอยู่ = คิวนั้นกลายเป็นงานไร้ไลน์เงียบ ๆ (FK เป็น SET NULL)
    // ปิดใช้งานคือสิ่งที่ผู้ใช้ต้องการจริงเกือบทุกครั้ง
    const jobs = await countJobsOnLine(supabase, id);
    if (jobs > 0) {
      return conflict(`ไลน์นี้มีคิวผลิตอยู่ ${jobs} งาน — ปิดใช้งานแทนการลบ`);
    }

    const { error } = await supabase.from('production_lines').delete().eq('id', id);
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'delete', entityType: 'production_line', entityId: id, before,
      summary: `ลบไลน์ผลิต ${before.code}`, request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});
