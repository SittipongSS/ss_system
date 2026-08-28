// ── API ทะเบียนไซต์บริการ (mig 0187) ─────────────────────────────────────
// GET  : รายการไซต์ + จำนวนเครื่องต่อไซต์ (กรองด้วย ?customerId=)
// POST : เพิ่มไซต์ (ฝ่าย TS หรือทีมขาย SV — ดู canEditService)
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { insertRowWithEntityCode } from '@/lib/entityCode';
import { withUser, ok, fail, badRequest } from '@/lib/http';
import { toLocalISODate } from '@/lib/pm/dateHelpers';
import { normalizeSiteInput } from '@/lib/service/sites';
import { siteRefillSummary } from '@/lib/service/refill';
import { assetCountsBySite, findCustomer, loadSites, requireService } from '@/lib/service/sitesRepo';
import { assetsForSites, siteScheduleContext } from '@/lib/service/visitsRepo';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

// GET ?customerId= &includeInactive=0 &withSchedule=1
//   withSchedule = แนบ เข้าล่าสุด / ครั้งหน้า / สรุปน้ำหอมใกล้หมด มาด้วย (S-4)
//   ⚠️ ไม่ทำเป็นค่าตั้งต้น — หน้าทะเบียนที่มีไซต์เป็นร้อยไม่ต้องใช้ 3 คำสั่งเพิ่มทุกครั้ง
export const GET = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user });
  if (access.response) return access.response;
  const url = new URL(req.url);
  try {
    const sites = await loadSites(supabase, {
      customerId: url.searchParams.get('customerId'),
      includeInactive: url.searchParams.get('includeInactive') !== '0',
    });
    const siteIds = sites.map((s) => s.id);
    // นับเครื่องรวดเดียว ไม่ยิงรายไซต์ (ไซต์ 200 แห่ง = 200 คำขอ)
    const counts = await assetCountsBySite(supabase, siteIds);

    if (url.searchParams.get('withSchedule') !== '1') {
      return ok(sites.map((site) => ({
        ...site,
        assetCount: counts.get(site.id)?.total || 0,
        activeAssetCount: counts.get(site.id)?.active || 0,
      })));
    }

    const todayIso = businessDate();
    const [schedule, assets] = await Promise.all([
      siteScheduleContext(supabase, siteIds, todayIso),
      assetsForSites(supabase, siteIds),
    ]);

    return ok(sites.map((site) => {
      const ctx = schedule.get(site.id) || { lastRefillDate: null, nextVisitDate: null };
      return {
        ...site,
        assetCount: counts.get(site.id)?.total || 0,
        activeAssetCount: counts.get(site.id)?.active || 0,
        lastRefillDate: ctx.lastRefillDate,
        nextVisitDate: ctx.nextVisitDate,
        refill: siteRefillSummary(assets.get(site.id) || [], {
          lastSiteRefillDate: ctx.lastRefillDate,
          nextVisitDate: ctx.nextVisitDate,
          todayIso,
        }),
      };
    }));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST { customerId, name, routeZone?, address?, mapUrl?, contactName?, contactPhone?,
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

    // รหัส SS ออกพร้อม insert ในทรานแซกชันเดียว (mig 0240) — insert ล้ม = เลขคืน
    const row = {
      id: genId('SVS'),
      ...value,
      customerName: customer.name || null,
      createdById: user.id ? String(user.id) : null,
      createdByName: user.name || null,
    };
    const { data, error: insertError } = await insertRowWithEntityCode(supabase, 'SS', row);
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
