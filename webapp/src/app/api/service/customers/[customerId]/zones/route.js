// ── ทะเบียนพื้นที่ของลูกค้าหนึ่งราย (เฟส 3A · §5A) ───────────────────────
//
// ⭐ **เส้นเดียว สองจอ** — แท็บ "พื้นที่บริการ" บนหน้าลูกค้า (อ่านอย่างเดียว) และ
//   ฟอร์มเปิดใบประเมิน (บอกว่าลูกค้ารายนี้เคยประเมินไว้แล้วกี่พื้นที่ ใน กี่สถานที่)
//   ⇒ สองจอต้องเห็นตัวเลขชุดเดียวกัน · แยกเส้นเมื่อไรก็มีวันที่แท็บบอก 8 พื้นที่
//     แต่ฟอร์มให้ติ๊กได้ 6 แล้วไม่มีใครรู้ว่าอันไหนถูก
//
// ⚠️ **ด่านเดียวกับที่ฟอร์มใบประเมินใช้** (`forRequestForm: true` → `canPickServiceSite`)
//   ฝ่ายขายไม่ได้เข้าโมดูลบริการแล้ว (มติ 2026-08-30) แต่ทะเบียนนี้ทำมาเพื่อเขา —
//   *"AE คนไหนเปิดดีลใหม่ให้ลูกค้ารายนี้ ก็เห็นของเดิมทันทีโดยไม่ต้องรู้จักโมดูลบริการ"*
//   ⇒ ปิดด้วย `canViewService` เมื่อไร แท็บจะหายไปจากสายตาคนที่มันทำมาให้พอดี
//
// ⚠️ **อ่านอย่างเดียว ไม่มี POST/PATCH** — /database เป็นของกลาง การแก้ทะเบียนยัง
//   เป็นของฝ่าย TS ที่ /service ตามกฎ module-ownership
import { withUser, ok, fail } from '@/lib/http';
import { businessDate } from '@/lib/businessDate';
import { canViewService } from '@/lib/permissions';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks, byColumns } from '@/lib/supabaseInChunks';
import { loadSites, requireService } from '@/lib/service/sitesRepo';
import { customerZoneRegistry } from '@/lib/service/zoneRegistry';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { customerId } = await ctx.params;
  try {
    const access = requireService({ user, forRequestForm: true });
    if (access.response) return access.response;
    /* 🔑 ปลายทางของลิงก์ต้องเป็นที่ที่คนกดเปิดได้จริง — `/service/sites/[id]` อ่านด้วย
       `canViewService` (TS/แอดมิน) ⇒ AE กดแล้วเจอ "โหลดข้อมูลไซต์ไม่สำเร็จ"
       ⚠️ server เป็นคนตอบ ไม่ให้จอเดา (จอไม่รู้ cap ของตัวเองครบ) */
    const canOpenSiteRegistry = canViewService(user);
    if (!customerId) return ok({ ...customerZoneRegistry({}), canOpenSiteRegistry });

    /* ⚠️ `includeInactive: true` — สาขาที่ปิดไปแล้วยังต้องเห็น พร้อมป้ายว่าปิด
       ประวัติการประเมินของมันคือของที่ AE ใช้ตอบลูกค้าที่ถามถึงสาขาเก่า */
    const sites = await loadSites(supabase, { customerId, includeInactive: true });
    const siteIds = sites.map((s) => s.id);
    if (!siteIds.length) return ok({ ...customerZoneRegistry({}), canOpenSiteRegistry });

    /* 🔴 ต้องห่อ `fetchAllInChunks` ทุกก้อน — สองปัญหาคนละตัวเจอกันที่นี่
       ① เพดาน 1,000 แถวของ PostgREST ตัดเงียบ (นั่นคือหน้าที่ของ fetchAll ข้างใน)
       ② ลิสต์ id ยาวเกิน ⇒ URL เกิน 16 KB แล้วซ็อกเก็ตถูกตัด (fetchInChunks ข้างนอก)
       ⚠️ `fetchAll` อย่างเดียวแก้ข้อ ② ไม่ได้ — มันส่งตัวกรองก้อนเดิมไปทุกหน้า
       ⚠️ เรียงซ้ำหลังรวมก้อนด้วย `byColumns` — PostgREST เรียงต่อก้อน ไม่ได้เรียงทั้งชุด
       เพดาน 1,000 แถวของ PostgREST ตัดเงียบ
       ลูกค้ารายใหญ่มีได้หลายร้อยสาขา × หลายโซน × ประเมินหลายรอบ ⇒ แถวผลวัด
       โตเร็วที่สุดในสามก้อนนี้ · ไม่ห่อ = ตัวเลขต่ำกว่าจริงโดยไม่มี error ให้เห็น
       ⚠️ ต้อง `order` ด้วยคีย์ที่ unique (`id`) ปิดท้าย — เรียงด้วยคอลัมน์ซ้ำได้
          แล้วไล่หน้าจะได้แถวซ้ำและแถวหายพร้อมกัน */
    const zones = await fetchAllInChunks(siteIds, (chunk) => supabase
      .from('service_zones').select('*').in('siteId', chunk)
      .order('siteId', { ascending: true })
      .order('name', { ascending: true })
      .order('id', { ascending: true }), { sort: byColumns('siteId', 'name', 'id') });

    const zoneIds = zones.map((z) => z.id);
    const [surveys, terms] = zoneIds.length
      ? await Promise.all([
        fetchAllInChunks(zoneIds, (chunk) => supabase
          .from('service_survey_zones').select('*').in('zoneId', chunk)
          .order('zoneId', { ascending: true })
          .order('id', { ascending: true }), { sort: byColumns('zoneId', 'id') }),
        fetchAllInChunks(zoneIds, (chunk) => supabase
          .from('service_zone_terms').select('*').in('zoneId', chunk)
          .order('zoneId', { ascending: true })
          .order('id', { ascending: true }), { sort: byColumns('zoneId', 'id') }),
      ])
      : [[], []];

    /* ใบสั่งขายแม่ — ตัวตัดสิน "ขายแล้ว/ยังไม่ขาย" (`termOrderActive`)
       ⚠️ อ่านมาเท่าที่ term อ้างถึงเท่านั้น · ดึงทั้งตารางคือดึงใบขายทั้งบริษัท */
    const orderIds = [...new Set(terms.map((t) => t.salesOrderId).filter(Boolean))];
    const orders = await fetchAllInChunks(orderIds, (chunk) => supabase
      .from('sales_orders').select('id, status, "supersededById", "orderNumber"')
      .in('id', chunk)
      .order('id', { ascending: true }), { sort: byColumns('id') });

    /* ใบประเมินที่แตะโซนพวกนี้ — ใช้สองที่:
       ① 🔒 "โซนนี้มีใบอื่นสั่งวัดไว้แล้ว" (ฟอร์มเปิดใบต้องล็อกไม่ให้ติ๊กซ้ำ)
       ② ไทม์ไลน์ "ประวัติการประเมิน" บนแท็บ
       ⚠️ อ่านเท่าที่แถวผลวัดอ้างถึง — ดึงทั้งตารางคือดึงคำร้องทั้งบริษัท */
    const requestIds = [...new Set(surveys.map((r) => r.requestId).filter(Boolean))];
    const requests = await fetchAllInChunks(requestIds, (chunk) => supabase
      .from('dept_requests')
      .select('id, "docNo", status, title, "dealId", "committedDueDate", "answeredAt", "closedAt", "createdAt"')
      .in('id', chunk)
      .order('id', { ascending: true }), { sort: byColumns('id') });

    /* ⚠️ อ่านนาฬิกาที่ server ครั้งเดียวแล้วส่งลงไป — ห้ามให้ตัวคำนวณอ่านเอง
       (กติกา "วันนี้มาจากนาฬิกาไทยเสมอ" + ด่าน check:thaitime) */
    return ok({
      ...customerZoneRegistry({ sites, zones, surveys, terms, orders, requests, todayIso: businessDate() }),
      canOpenSiteRegistry,
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});
