// ── สรุปฝั่งบริการของใบสั่งขาย (PR-F · แผน §3.4) ────────────────────────────
//
// ⭐ **แยก endpoint จาก GET ของใบโดยตั้งใจ** — ข้อมูลชุดนี้ต้องยิงถึง 5 ตาราง
//   (terms · zones · sites · plans · visits) แต่ใบส่วนใหญ่ในระบบเป็นสายสินค้า
//   ซึ่งไม่มีแท็บนี้เลย ⇒ ยัดรวมใน GET หลัก = ทุกคนจ่ายค่าคิวรีที่ตัวเองไม่ได้ใช้
//   (และเพิ่มแรงกดบน `check:rowcap` ของ route ที่ร้อนที่สุดของโมดูล)
//
// ⚠️ ตรรกะทั้งหมดอยู่ที่ `lib/sales/salesOrderServiceSummary.js` — ที่นี่หยิบข้อมูล
//   กับตรวจสิทธิ์เท่านั้น
import { loadScoped } from '@/lib/scopedRow';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { loadTerms } from '@/lib/service/termsRepo';
import { loadPlans, loadVisits } from '@/lib/service/visitsRepo';
import { loadVisitGateContext, gateContextForSite } from '@/lib/service/gateContext';
import { evaluateVisitGate, gateBlockedItems, gatePassed } from '@/lib/service/visitGate';
import { salesOrderServiceSummary } from '@/lib/sales/salesOrderServiceSummary';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  /* ⚠️ `loadScoped` ไม่ใช่แค่ "โหลดแถว" — ตรวจขอบเขตของผู้ใช้ให้ด้วย
     (ด่าน ratchet ในเทสต์บังคับไว้ว่าตารางที่มีทะเบียนขอบเขตห้ามโหลดเอง) */
  const { row: order, response } = await loadScoped(supabase, 'sales_orders', id, user, 'view');
  if (response) return response;

  try {
    const todayIso = businessDate();
    const { data: lines, error: lineError } = await supabase
      .from('sales_order_lines')
      .select('id, "fgCode", description, qty, unit, "sortOrder", "serviceRounds"')
      .eq('salesOrderId', id).order('sortOrder', { ascending: true });
    if (lineError) return fail(lineError.message, 500);

    /* รอบขายของใบนี้ → โซน → ไซต์ · ยิงเฉพาะของใบเดียว ไม่กวาดทั้งตาราง */
    const terms = await loadTerms(supabase, { salesOrderId: id });
    const zoneIds = [...new Set(terms.map((t) => t.zoneId).filter(Boolean))];
    const { data: zones, error: zoneError } = zoneIds.length
      ? await supabase.from('service_zones').select('id, "siteId", name').in('id', zoneIds)
      : { data: [], error: null };
    if (zoneError) return fail(zoneError.message, 500);

    const siteIds = [...new Set((zones || []).map((z) => z.siteId).filter(Boolean))];
    const { data: sites, error: siteError } = siteIds.length
      ? await supabase.from('service_sites').select('id, code, name, "customerName", "routeZone"').in('id', siteIds)
      : { data: [], error: null };
    if (siteError) return fail(siteError.message, 500);

    /* แผน/นัด ยิงรายไซต์เพราะ repo กลางรับ siteId เดียว — ไซต์ต่อใบมีหลักหน่วย
       ⚠️ ถ้าวันหนึ่งใบเดียวลงหลายสิบไซต์ ให้ย้ายไปทำตัวโหลดเป็นก้อนแทน (N+1) */
    const plans = (await Promise.all(siteIds.map((siteId) => loadPlans(supabase, { siteId })))).flat();
    const visits = (await Promise.all(siteIds.map((siteId) => loadVisits(supabase, { siteId })))).flat();

    /* ด่านเข้าไซต์ — ใช้ตัวเดียวกับที่ตารางจัดคิวของ TS ใช้ ไม่งั้นจอสองจอบอกคนละเรื่อง
       ⚠️ **ตัดสินราย "นัด" ไม่ใช่ราย "ไซต์"** — ด่านมีข้อที่เป็นของนัดจริง ๆ อยู่ด้วย
       (มีเจ้าหน้าที่ไหม · วันนัดอยู่ในช่วงที่ไซต์ยอมให้เข้าไหม) ⇒ ถามด้วยไซต์เปล่า ๆ
       จะติด "ยังไม่มอบหมาย" ทุกไซต์ทั้งที่นัดจริงมอบหมายแล้ว
       ⚠️ `evaluateVisitGate` คืน **อาร์เรย์ของข้อ** ไม่ใช่ออบเจ็กต์ — ผ่านหรือไม่ถาม
       `gatePassed` เสมอ (เขียนเงื่อนไขเองที่นี่ = ด่านที่สองที่เพี้ยนจากตัวจริง) */
    const gateCtx = await loadVisitGateContext(supabase, siteIds);
    const sitesById = new Map((sites || []).map((s) => [s.id, s]));
    const gateByVisitId = new Map(visits.map((visit) => {
      const items = evaluateVisitGate(visit, {
        ...gateContextForSite(gateCtx, visit.siteId, { site: sitesById.get(visit.siteId) || null }),
        todayIso,
      });
      return [visit.id, { ok: gatePassed(items), blocked: gateBlockedItems(items) }];
    }));

    return ok(salesOrderServiceSummary({
      order,
      lines: lines || [],
      terms,
      zonesById: new Map((zones || []).map((z) => [z.id, z])),
      sitesById,
      plans,
      visits,
      gateByVisitId,
      todayIso,
    }));
  } catch (e) {
    return fail(e.message, 500);
  }
});
