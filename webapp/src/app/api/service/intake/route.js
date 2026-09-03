// ── API คิวงานเข้าใหม่ของฝ่าย TS (เฟส 4) ─────────────────────────────────
//
// ⭐ ทำไมต้องมี endpoint ใหม่ ทั้งที่มี /api/sales-planning/sales-orders อยู่แล้ว:
//   ใบนั้นปิดด้วย `canViewSalesPlanning` ⇒ ฝ่าย TS เรียกไม่ได้เลย · และมันคืนทุกใบ
//   ทุกสถานะพร้อมราคา/ส่วนลด ซึ่งฝ่ายบริการไม่ควรได้เห็น
//   ⇒ ที่นี่คืนเฉพาะ **ใบที่อนุมัติแล้ว สายบริการ ที่ยังมีบรรทัดไม่ผูกโซน** และ
//     เฉพาะช่องที่หน้าคิวใช้จริง (ไม่มีราคา ไม่มีส่วนลด)
//
// ⚠️ ทุกคิวคำนวณด้วยตัวตัดสินกลาง: terms.js (รอบมีผลไหม) · visitStatus.isLiveVisit
//   (นัดยังมีชีวิตไหม) — ห้ามเขียนเงื่อนไขซ้ำที่นี่
import { withUser, ok, fail } from '@/lib/http';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { requireService, loadSites } from '@/lib/service/sitesRepo';
import { loadPlans, loadVisits } from '@/lib/service/visitsRepo';
import { loadAllZones, loadTerms } from '@/lib/service/termsRepo';
import { bindQueue, intakeCounts, planQueue, visitQueue } from '@/lib/service/intake';
import { isLiveVisit } from '@/lib/service/visitStatus';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase }) => {
  const access = requireService({ user });
  if (access.response) return access.response;

  try {
    /* ⚠️ ไล่ทีละหน้า — เพดาน 1,000 แถวของ Supabase ตัดเงียบ ๆ แล้วคิวจะ "ครบ"
       ทั้งที่ขาด (check:rowcap คุมจุดนี้ไว้) · เรียงพ่วง id ให้ลำดับนิ่ง */
    const { data: orders, error: orderError } = await fetchAllResult(() => supabase
      .from('sales_orders')
      /* 🐞 **UAT 2026-09-01: `serviceContractId` เคยตกจาก select ตัวนี้** — `contractIds`
         ข้างล่างอ่านจากคอลัมน์นี้ ⇒ ไม่ดึงมา = ลิสต์ว่างเสมอ = ชิปบนคิวขึ้น
         "ยังไม่ผูกสัญญา" ทุกใบตลอดกาล แม้ฝ่ายขายจะผูกไปแล้ว (ไม่มี error ให้เห็น) */
      .select('id, "orderNumber", status, supersededById, customerId, customerName, projectId, dealId, orderDate, approvedAt, "serviceContractId"')
      .eq('status', 'approved')
      .is('supersededById', null)
      .order('approvedAt', { ascending: false })
      .order('id', { ascending: true }));
    if (orderError) return fail(orderError.message, 500);

    const orderIds = (orders || []).map((o) => o.id);
    const projectIds = [...new Set((orders || []).map((o) => o.projectId).filter(Boolean))];
    const dealIds = [...new Set((orders || []).map((o) => o.dealId).filter(Boolean))];

    const [lines, terms, projects, deals, zones, sites, plans, visits] = await Promise.all([
      orderIds.length
        ? fetchAllResult(() => supabase.from('sales_order_lines')
          // ⚠️ ไม่ดึงราคา/ส่วนลด — ฝ่ายบริการไม่ต้องใช้ และยิ่งดึงมามาก
          //    ยิ่งมีของหลุดออกทาง response โดยไม่ตั้งใจ
          // "serviceRounds" = ข้อผูกพันจำนวนรอบที่ขายไว้ (mig 0326) — TS ใช้ตอนวางรอบ
          .select('id, salesOrderId, quotationLineId, productId, fgCode, description, qty, unit, sortOrder, "serviceRounds"')
          .in('salesOrderId', orderIds)
          .order('salesOrderId', { ascending: true })
          .order('sortOrder', { ascending: true })
          .order('id', { ascending: true })).then((r) => { if (r.error) throw r.error; return r.data || []; })
        : [],
      loadTerms(supabase),
      /* ⚠️ ห่อ fetchAllResult ทั้งคู่ — จำนวนโครงการ/ดีลโตตามจำนวนใบสั่งขาย
         ที่อนุมัติแล้ว ซึ่งวันหนึ่งเกิน 1,000 แน่ · PostgREST ตัดที่ 1,000 เงียบ ๆ
         แล้วใบที่หลุดจะ "ตอบไม่ได้ว่าสายอะไร" ทั้งที่โครงการระบุไว้ชัดเจน */
      projectIds.length
        ? fetchAllResult(() => supabase.from('projects').select('id, line')
          .in('id', projectIds).order('id', { ascending: true }))
          .then((r) => { if (r.error) throw r.error; return r.data || []; })
        : [],
      dealIds.length
        ? fetchAllResult(() => supabase.from('sales_deals').select('id, line')
          .in('id', dealIds).order('id', { ascending: true }))
          .then((r) => { if (r.error) throw r.error; return r.data || []; })
        : [],
      loadAllZones(supabase),
      loadSites(supabase),
      loadPlans(supabase),
      loadVisits(supabase, { from: businessDate() }),
    ]);

    const projectsById = new Map(projects.map((p) => [p.id, p]));
    const dealsById = new Map(deals.map((d) => [d.id, d]));
    const ordersById = new Map((orders || []).map((o) => [o.id, o]));
    const todayIso = businessDate();

    /* ⭐ ชิปความพร้อม (PR-C) — ต้องรู้สัญญากับ "จ่ายถึง" ของแต่ละใบ
       ⚠️ ยิงเป็นก้อนเดียว ห้ามยิงรายใบในลูป (N+1) · `orderIds` ประกาศไว้ข้างบนแล้ว */
    const contractIds = [...new Set((orders || []).map((o) => o.serviceContractId).filter(Boolean))];
    const [instRows, contractRows] = await Promise.all([
      orderIds.length
        ? fetchAllResult(() => supabase.from('sales_order_installments')
          .select('"salesOrderId", status, "dueDate", "coversFrom", "coversTo"')
          .in('salesOrderId', orderIds)
          .order('salesOrderId', { ascending: true }).order('id', { ascending: true }))
          .then(({ data }) => data || [])
        : Promise.resolve([]),
      contractIds.length
        ? supabase.from('sales_contracts').select('id, "contractNo", status').in('id', contractIds)
          .then(({ data }) => data || [])
        : Promise.resolve([]),
    ]);
    const installmentsByOrderId = new Map();
    for (const r of instRows) {
      const list = installmentsByOrderId.get(r.salesOrderId) || [];
      list.push(r);
      installmentsByOrderId.set(r.salesOrderId, list);
    }
    const contractsById = new Map(contractRows.map((c) => [c.id, c]));

    const bind = bindQueue({
      orders: orders || [], lines, terms, projectsById, dealsById,
      contractsById, installmentsByOrderId, todayIso,
    });
    // ⚠️ term ชี้บรรทัดด้วย salesOrderLineId — ส่ง Map เข้าไปเพื่อให้คิววางรอบตอบ
    // "ขายไว้กี่รอบ" ได้ (ไม่ส่ง = ตอบ null ซึ่งอ่านว่า "ยังไม่ระบุ" ไม่ใช่ศูนย์)
    const linesById = new Map((lines || []).map((row) => [row.id, row]));
    const plan = planQueue({ zones, terms, plans, sites, ordersById, linesById, todayIso });
    const visit = visitQueue({ plans, visits, sites, ordersById, isLive: isLiveVisit, todayIso });

    return ok({
      bind: bind.rows,
      unknownLine: bind.unknownLine,
      plan,
      visit,
      counts: intakeCounts({ bind, plan, visit }),
      todayIso,
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});
