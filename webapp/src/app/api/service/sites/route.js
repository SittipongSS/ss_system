// ── API ทะเบียนไซต์บริการ (mig 0185) ─────────────────────────────────────
// GET  : รายการไซต์ + จำนวนเครื่องต่อไซต์ (กรองด้วย ?customerId=)
// POST : เพิ่มไซต์ (ฝ่าย TS หรือทีมขาย SV — ดู canEditService)
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { generateEntityCode } from '@/lib/entityCode';
import { withUser, ok, fail, badRequest } from '@/lib/http';
import { normalizeSiteInput } from '@/lib/service/sites';
import { assetCountsBySite, findCustomer, loadSites, requireService } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user });
  if (access.response) return access.response;
  const url = new URL(req.url);
  try {
    const sites = await loadSites(supabase, {
      customerId: url.searchParams.get('customerId'),
      includeInactive: url.searchParams.get('includeInactive') !== '0',
    });
    // นับเครื่องรวดเดียว ไม่ยิงรายไซต์ (ไซต์ 200 แห่ง = 200 คำขอ)
    const counts = await assetCountsBySite(supabase, sites.map((s) => s.id));
    return ok(sites.map((site) => ({
      ...site,
      assetCount: counts.get(site.id)?.total || 0,
      activeAssetCount: counts.get(site.id)?.active || 0,
    })));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST { customerId, name, zone?, address?, mapUrl?, contactName?, contactPhone?,
//        accessFrom?, accessTo?, accessDays?, accessNote?, note? }
export const POST = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user, edit: true });
  if (access.response) return access.response;

  const body = await req.json().catch(() => ({}));
  const { value, error } = normalizeSiteInput(body);
  if (error) return badRequest(error);

  try {
    // ลูกค้าต้องมีจริง + snapshot ชื่อจากทะเบียน ไม่ใช่จากที่ client ส่งมา
    // (ชื่อที่ client ส่งอาจเก่าหรือถูกแก้ระหว่างทาง)
    const customer = await findCustomer(supabase, value.customerId);
    if (!customer) return badRequest('ไม่พบลูกค้าที่ระบุ');

    const row = {
      id: genId('SVS'),
      code: await generateEntityCode(supabase, 'SS'),
      ...value,
      customerName: customer.name || null,
      createdById: user.id ? String(user.id) : null,
      createdByName: user.name || null,
    };
    const { data, error: insertError } = await supabase
      .from('service_sites').insert(row).select().single();
    if (insertError) return fail(insertError.message, 500);

    await recordAudit({
      user, action: 'create', entityType: 'service_site', entityId: data.id, after: data,
      summary: `เพิ่มไซต์บริการ ${data.code || data.id} · ${data.name} (${customer.name})`,
      request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
