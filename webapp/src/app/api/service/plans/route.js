// ── API รอบบริการ (mig 0186) ─────────────────────────────────────────────
// GET  ?siteId= : รอบของไซต์
// POST : สร้างรอบ + gen นัดล่วงหน้าตาม horizon (ค่าตั้งต้น 90 วัน)
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest } from '@/lib/http';
import { generateVisitsForPlan } from '@/lib/service/planGen';
import { normalizePlanInput } from '@/lib/service/rounds';
import { findSite, requireService } from '@/lib/service/sitesRepo';
import { loadPlans } from '@/lib/service/visitsRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user });
  if (access.response) return access.response;
  try {
    const url = new URL(req.url);
    return ok(await loadPlans(supabase, {
      siteId: url.searchParams.get('siteId'),
      activeOnly: url.searchParams.get('activeOnly') === '1',
    }));
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const POST = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user, edit: true });
  if (access.response) return access.response;

  const body = await req.json().catch(() => ({}));
  const { value, error } = normalizePlanInput(body);
  if (error) return badRequest(error);

  try {
    const site = await findSite(supabase, value.siteId);
    if (!site) return badRequest('ไม่พบไซต์ที่ระบุ');

    const row = {
      id: genId('SVP'),
      ...value,
      createdById: user.id ? String(user.id) : null,
      createdByName: user.name || null,
    };
    const { data: plan, error: insertError } = await supabase
      .from('service_plans').insert(row).select().single();
    if (insertError) return fail(insertError.message, 500);

    // gen นัดล่วงหน้าทันที — รอบที่ยังไม่มีนัดสักใบคือรอบที่ไม่มีใครเห็นบนตาราง
    const generated = await generateVisitsForPlan({ supabase, plan, user, req });

    await recordAudit({
      user, action: 'create', entityType: 'service_plan', entityId: plan.id, after: plan,
      summary: `สร้างรอบบริการทุก ${plan.everyDays} วัน ที่ ${site.name} · gen นัด ${generated.length} ครั้ง`,
      request: req,
    });
    return ok({ plan, generated }, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
