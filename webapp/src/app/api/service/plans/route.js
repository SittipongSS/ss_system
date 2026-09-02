// ── API รอบบริการ (mig 0188) ─────────────────────────────────────────────
// GET  ?siteId= : รอบของไซต์
// POST : สร้างรอบ + gen นัดล่วงหน้าตาม horizon (ค่าตั้งต้น 90 วัน)
import { genId } from '@/lib/id';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
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
    const plans = await loadPlans(supabase, {
      siteId: url.searchParams.get('siteId'),
      activeOnly: url.searchParams.get('activeOnly') === '1',
    });
    /* ⭐ **แนบเลขที่ใบมาด้วย** — รอบเป็นข้อผูกพันของใบสั่งขาย และไซต์เดียวถือรอบของ
       หลายใบพร้อมกันได้ (ขายเพิ่ม · ออก Rev.) ⇒ ตารางรอบที่บอกแค่ "ทุก N วัน"
       แยกไม่ออกว่าแถวไหนของใบไหน · id ดิบอ่านไม่รู้เรื่อง ต้องเป็นเลขที่
       ⚠️ ห่อ `fetchAllResult` ตามกติกา check:rowcap และเรียงด้วยคีย์ที่ไม่ซ้ำ
       ⚠️ อ่านไม่ได้ = ปล่อยช่องว่าง ไม่ใช่ล้มทั้งคำขอ (ตารางรอบยังต้องขึ้น) */
    const orderIds = [...new Set(plans.map((p) => p.salesOrderId).filter(Boolean))];
    if (!orderIds.length) return ok(plans);
    const { data: orders } = await fetchAllResult(() => supabase.from('sales_orders')
      .select('id, "orderNumber"').in('id', orderIds).order('id', { ascending: true }));
    const numberById = new Map((orders || []).map((o) => [o.id, o.orderNumber]));
    return ok(plans.map((plan) => ({
      ...plan,
      salesOrderNumber: numberById.get(plan.salesOrderId) || null,
    })));
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

    /* 🪤 **คอลัมน์ `salesOrderId` ไม่มี FK** (mig 0188:20) และ `normalizePlanInput`
       ปล่อยผ่านทุกค่า ⇒ id มั่วเข้าฐานได้เงียบ ๆ แล้วคอลัมน์ "รอบที่เดิน" บนทะเบียน
       ใบสั่งขายจะนับรอบนี้ให้ใบที่ไม่มีอยู่จริง (หรือไม่นับให้ใครเลย) */
    if (value.salesOrderId) {
      const { data: order, error: orderError } = await supabase
        .from('sales_orders').select('id').eq('id', value.salesOrderId).maybeSingle();
      if (orderError) return fail(orderError.message, 500);
      if (!order) return badRequest('ไม่พบใบสั่งขายที่อ้างถึง');
    }

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
