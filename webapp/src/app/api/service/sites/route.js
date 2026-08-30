// ── API ทะเบียนไซต์บริการ (mig 0187) ─────────────────────────────────────
// GET  : รายการไซต์ + จำนวนเครื่องต่อไซต์ (กรองด้วย ?customerId=)
// POST : เพิ่มไซต์ (ฝ่าย TS · ทีมขาย SV · **ฝ่ายขาย** — ดู canCreateServiceSite)
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { insertRowWithComposedCode } from '@/lib/entityCode';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canCreateServiceSite } from '@/lib/permissions';
import { SITE_RUN_BUCKET, SITE_RUN_WIDTH, siteCodePrefix } from '@/lib/service/siteCode';
import { toLocalISODate } from '@/lib/pm/dateHelpers';
import { normalizeSiteInput } from '@/lib/service/sites';
import { siteRefillSummary } from '@/lib/service/refill';
import { checkSiteReferences } from '@/lib/service/siteReferences';
import { assetCountsBySite, findCustomer, loadSites, requireService, zoneCountsBySite } from '@/lib/service/sitesRepo';
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
    // นับเครื่อง+โซนรวดเดียว ไม่ยิงรายไซต์ (ไซต์ 200 แห่ง = 200 คำขอ)
    const [counts, zoneCounts] = await Promise.all([
      assetCountsBySite(supabase, siteIds),
      zoneCountsBySite(supabase, siteIds),
    ]);

    if (url.searchParams.get('withSchedule') !== '1') {
      return ok(sites.map((site) => ({
        ...site,
        assetCount: counts.get(site.id)?.total || 0,
        activeAssetCount: counts.get(site.id)?.active || 0,
        zoneCount: zoneCounts.get(site.id) || 0,
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
        zoneCount: zoneCounts.get(site.id) || 0,
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
//        accessFrom?, accessTo?, accessDays?, accessNote?, note?,
//        customerAddressId?, projectId? }
//   สองช่องท้ายไม่ใช่ช่องกรอก — ฟอร์มส่งมาเองจากไทล์ที่อยู่ (mig 0313) และวิซาร์ด
//   รับใบสั่งขายส่ง projectId ของใบที่เปิดอยู่ (mig 0299)
export const POST = withUser(async ({ user, supabase, req }) => {
  /* ⚠️ **ด่านของ POST กว้างกว่าที่อื่นในโมดูลนี้โดยตั้งใจ** (มติผู้ใช้ 2026-08-29) —
     ฝ่ายขายสร้างไซต์ของลูกค้าได้ แต่ยัง *แก้/ลบ* ไม่ได้ (PATCH/DELETE ยังใช้
     requireService edit ตามเดิม) · เหตุผลเต็มอยู่ที่ `canCreateServiceSite` */
  if (!user) return unauthorized();
  if (!canCreateServiceSite(user)) return forbidden('ไม่มีสิทธิ์เพิ่มไซต์บริการ');

  const body = await req.json().catch(() => ({}));
  const { value, error } = normalizeSiteInput(body);
  if (error) return badRequest(error);

  try {
    // ลูกค้าต้องมีจริง + snapshot ชื่อจากทะเบียน ไม่ใช่จากที่ client ส่งมา
    // (ชื่อที่ client ส่งอาจเก่าหรือถูกแก้ระหว่างทาง)
    const customer = await findCustomer(supabase, value.customerId);
    if (!customer) return badRequest('ไม่พบลูกค้าที่ระบุ');

    // ที่อยู่ต้นทาง (mig 0313) + โครงการที่คลอดไซต์ (mig 0299) — ไม่มี FK ทั้งคู่
    const refError = await checkSiteReferences(supabase, value, customer);
    if (refError) return badRequest(refError);

    /* ── รหัส `ST-XXXX-AA-BBB-CCCC` (mig 0315) ────────────────────────
       ⭐ ท่อนหน้าเลขรันประกอบจาก **รหัสลูกค้าในทะเบียน** (ไม่ใช่ค่าที่ client ส่ง)
          กับ **จังหวัดที่เลือกบนฟอร์ม** ⇒ รหัสตรงกับของจริงเสมอ
       ⚠️ ประกอบก่อน insert — ตกด่านตรงนี้ยังไม่มีแถวและยังไม่กินเลขรัน */
    const { prefix, error: codeError } = siteCodePrefix({
      arCode: customer.arCode,
      provinceCode: value.provinceCode,
    });
    if (codeError) return badRequest(codeError);

    // รหัสออกพร้อม insert ในทรานแซกชันเดียว (mig 0240) — insert ล้ม = เลขคืน
    const row = {
      id: genId('SVS'),
      ...value,
      customerName: customer.name || null,
      createdById: user.id ? String(user.id) : null,
      createdByName: user.name || null,
    };
    const { data, error: insertError } = await insertRowWithComposedCode(
      supabase,
      { scope: 'SS', bucket: SITE_RUN_BUCKET, prefix, width: SITE_RUN_WIDTH },
      row,
    );
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
