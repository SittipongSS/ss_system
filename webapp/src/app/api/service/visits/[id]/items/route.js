// ── API ของที่ใช้ในนัด (mig 0188 · S-3) ──────────────────────────────────
// ⚠️ มติ §10.2: **บันทึกอย่างเดียว ไม่ตัดสต็อก ไม่ออกบิล** — เป็นหลักฐานว่าเติม
// อะไรไปเท่าไร เพื่อตอบลูกค้าย้อนหลัง + ทำให้ประเมินรอบถัดไปแม่นขึ้น
// ⚠️ ห้ามเผลอทำครึ่งทาง — ถ้าไม่ตัดสต็อกก็อย่ามีช่อง "คงเหลือ" ให้เข้าใจผิด
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest } from '@/lib/http';
import { loadVisitItems, requireVisit } from '@/lib/service/visitsRepo';
import { normalizeVisitItem } from '@/lib/service/visitItems';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id });
    if (access.response) return access.response;
    return ok(await loadVisitItems(supabase, id));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST { label, qty?, unit?, assetId?, productId?, note? }
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id, edit: true, running: true });
    if (access.response) return access.response;

    const body = await req.json().catch(() => ({}));
    // ⭐ ตัวตรวจตัวเดียวกับ PATCH ของบรรทัด (`items/[itemId]`) — เพิ่ม/แก้ต้องได้กติกาเดียวกัน (R9)
    const { value, error: invalid } = normalizeVisitItem(body);
    if (invalid) return badRequest(invalid);

    const row = { id: genId('SVI'), visitId: id, ...value };
    const { data, error } = await supabase.from('service_visit_items').insert(row).select().single();
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'create', entityType: 'service_visit', entityId: id, after: data,
      summary: `บันทึกของที่ใช้ ${data.label} ในนัด ${access.visit.code || id}`, request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
