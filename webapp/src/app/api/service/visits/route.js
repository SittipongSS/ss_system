// ── API ตารางนัดเข้าบริการ (mig 0186) ────────────────────────────────────
// GET  ?from=&to=&siteId=&assigneeId= : นัดในช่วง + ไซต์ที่เกี่ยวข้อง (ปฏิทินใช้ทั้งคู่)
// POST : สร้างนัด (นอกรอบก็ได้ — งานซ่อมด่วนไม่ได้มาจากรอบไหน)
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { generateEntityCode } from '@/lib/entityCode';
import { withUser, ok, fail, badRequest } from '@/lib/http';
import { normalizeVisitInput } from '@/lib/service/rounds';
import { findSite, requireService } from '@/lib/service/sitesRepo';
import { loadVisits, sitesForVisits } from '@/lib/service/visitsRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user });
  if (access.response) return access.response;
  const url = new URL(req.url);
  try {
    const visits = await loadVisits(supabase, {
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      siteId: url.searchParams.get('siteId'),
      assigneeId: url.searchParams.get('assigneeId'),
    });
    // ปฏิทินต้องรู้ชื่อ/โซน/ช่วงเวลาเข้าไซต์เพื่อขึ้นป้ายเตือน — ส่งไปพร้อมกัน
    // ไม่งั้นหน้าจอต้องยิงตามรายนัด (สัปดาห์หนึ่ง 40 นัด = 40 คำขอ)
    const sites = await sitesForVisits(supabase, visits);
    return ok({ visits, sites: [...sites.values()] });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const POST = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user, edit: true });
  if (access.response) return access.response;

  const body = await req.json().catch(() => ({}));
  const { value, error } = normalizeVisitInput(body);
  if (error) return badRequest(error);

  try {
    const site = await findSite(supabase, value.siteId);
    if (!site) return badRequest('ไม่พบไซต์ที่ระบุ');

    const row = {
      id: genId('SVV'),
      code: await generateEntityCode(supabase, 'SV'),
      ...value,
      createdById: user.id ? String(user.id) : null,
      createdByName: user.name || null,
    };
    const { data, error: insertError } = await supabase
      .from('service_visits').insert(row).select().single();
    if (insertError) return fail(insertError.message, 500);

    await recordAudit({
      user, action: 'create', entityType: 'service_visit', entityId: data.id, after: data,
      summary: `นัดเข้าบริการ ${data.code} · ${site.name} · ${data.scheduledDate}`,
      request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
