// ── API คิวงานเข้าใหม่ของฝ่าย TS (เฟส 4) ─────────────────────────────────
//
// ⭐ ทำไมต้องมี endpoint ใหม่ ทั้งที่มี /api/sales-planning/sales-orders อยู่แล้ว:
//   ใบนั้นปิดด้วย `canViewSalesPlanning` ⇒ ฝ่าย TS เรียกไม่ได้เลย · และมันคืนทุกใบ
//   ทุกสถานะพร้อมราคา/ส่วนลด ซึ่งฝ่ายบริการไม่ควรได้เห็น
//   ⇒ ที่นี่คืนเฉพาะ **แถวคิวที่ประกอบแล้ว** (ไซต์รอตั้งรอบ · รอบที่ไม่มีนัดข้างหน้า · ใบเดิมที่รอฝ่ายขาย
//     ตั้งงานบริการ) และเฉพาะช่องที่หน้าคิวใช้จริง (ไม่มีราคา ไม่มีส่วนลด)
//   🔄 mig 0392 (D14): ถังผูกโซนของ TS ถอดแล้ว — คีย์ `bind` ของ response คงชื่อเดิม แต่แถวเป็นทรงของ
//     `legacySetupQueue` (ใบเดิมรอฝ่ายขายตั้งงานบริการ · TS ดูอย่างเดียว)
//
// ⚠️ ทุกคิวคำนวณด้วยตัวตัดสินกลาง: terms.js (รอบมีผลไหม) · visitStatus.isLiveVisit
//   (นัดยังมีชีวิตไหม) — ห้ามเขียนเงื่อนไขซ้ำที่นี่
import { withUser, ok, fail } from '@/lib/http';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { requireService, loadSites } from '@/lib/service/sitesRepo';
import { loadPlans, loadVisits } from '@/lib/service/visitsRepo';
import { loadAllZones, loadTerms } from '@/lib/service/termsRepo';
import { withLinePeriods } from '@/lib/service/terms';
import { intakeCounts, planQueue, visitQueue } from '@/lib/service/intake';
import { MAX_ORPHAN_HOPS, decoratePlanRows, orphanOrderIdsToLoad, orphanPlanRows } from '@/lib/service/intakePlanFacts';
import { legacySetupQueue } from '@/lib/service/legacySetupQueue';
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { isLiveVisit } from '@/lib/service/visitStatus';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

/* รอบกำพร้า (PR-C · C-D11): โหลดใบในโซ่ `supersededById` ทีละทอด — ทอดละหนึ่งคำสั่ง (ซอยก้อน) ·
   เพดานเท่าที่ตัวคำนวณเดินได้ (`MAX_ORPHAN_HOPS` ทอด + ทอดแรก) ⇒ โซ่ยาวเกินเพดาน = ไม่ใช่กำพร้า (ไม่เดา) */
const ORPHAN_CHAIN_ROUNDS = MAX_ORPHAN_HOPS + 1;

export const GET = withUser(async ({ user, supabase }) => {
  const access = requireService({ user });
  if (access.response) return access.response;

  try {
    /* ⚠️ ไล่ทีละหน้า — เพดาน 1,000 แถวของ Supabase ตัดเงียบ ๆ แล้วคิวจะ "ครบ"
       ทั้งที่ขาด (check:rowcap คุมจุดนี้ไว้) · เรียงพ่วง id ให้ลำดับนิ่ง
       🐞 **UAT 2026-09-01: `serviceContractId` เคยตกจาก select ตัวนี้** — `contractIds`
       ข้างล่างอ่านจากคอลัมน์นี้ ⇒ ไม่ดึงมา = ลิสต์ว่างเสมอ = ชิปบนคิวขึ้น
       "ยังไม่ผูกสัญญา" ทุกใบตลอดกาล แม้ฝ่ายขายจะผูกไปแล้ว (ไม่มี error ให้เห็น)
       ⭐ ใบสั่งขายย้อนหลัง (mig 0360/0374): `origin` + เลขเอกสารเดิม ขึ้นป้าย "ย้อนหลัง" · มติ 22/09 ใบย้อนหลังเลือกโซน
       จากทะเบียนตอนคีย์ และรอบขายเกิดตอน AE Sup อนุมัติ ⇒ ไม่ผ่านถังผูกโซนแล้ว มาเข้าถัง "รอตั้งรอบ" ตรง ๆ
       ⭐ `totalAmount` — ใช้ตัดสิน "ใบยอด 0 ไม่มีงวดให้เก็บ" (`paymentNotRequired` ตัวเดียวกับ visitGate ข้อ②)
          🔄 แทน `paymentGateExemptAt` (สวิตช์ยกเว้นด่านเงินของ 0360 — ถอดแล้ว)
          🔒 ยอดไม่ออกไปกับ response — แถวคิวพกแค่ธง `paymentNotRequired` (ฝ่ายบริการไม่เห็นราคาโดยตั้งใจ · หัวไฟล์)
       🪤 **คอมเมนต์อยู่เหนือคำสั่ง ไม่แทรกระหว่าง `.from()` กับ `.select()`** — `check:columns` มองหา select
          ไม่เกิน 200 ตัวอักษรหลัง `.from()` · คอมเมนต์ที่เคยคั่นตรงนั้น (261 ตัวอักษร) ทำให้ select นี้หลุดจากด่านมาตลอด
       ⭐ mig 0392: คอลัมน์ตั้งงานบริการของใบเดิม — `serviceTermsOpenedAt` (ประทับแล้ว = ไม่อยู่ในถังใบเดิม · ขาด = ตัวถังโยน)
          · สถานะ/ผู้ยื่น/ผู้ตีกลับ/เหตุผล · `servicePeriodFrom` (เริ่มตั้งแล้ว) · `updatedAt` (แก้ล่าสุด — RPC บันทึกขยับให้)
       ⭐ PR-C (C7): `servicePeriodTo` — ช่วงบริการของแถวรอตั้งรอบ (`servicePeriodOf` · หัวใบของใบที่ตั้งแล้ว) ⇒ ค่าเติมวันของโมดัล
          + รอบที่แนะนำ · ต่อท้าย select ตัวเดิม (ไม่เพิ่มคำสั่งอ่านใบ — ยามเงินนับคำสั่ง)
       ⭐ mig 0396: ผู้เปิดแก้/เวลา/เหตุผลของใบที่ฝ่ายขายเปิดแก้งานบริการหลังอนุมัติ — ถังใบเดิมขึ้นป้าย "ฝ่ายขายกำลังแก้ (หลังอนุมัติ)"
          (`serviceSetupReopened`) · ⚠️ ต้องรัน 0396 ก่อน deploy (ไม่มีคอลัมน์ = select 500 ทั้งหน้างานเข้าใหม่ · check:columns แดงจนกว่ารัน)
       ⭐ mig 0400: `servicePeriodMode` — ใบแยกรายรายการ ('line') ช่วงของแถวรอตั้งรอบ = ช่วงของรายการที่ลงไซต์นั้น (แนบให้ term ข้างล่าง)
          ไม่ใช่ช่วงรวมของใบ · ถังใบเดิมใช้ตัดสิน "เริ่มตั้งแล้ว/ครบกี่รายการ" · ต่อท้าย select ตัวเดิม (ไม่เพิ่มคำสั่งอ่านใบ — ยามเงินนับคำสั่ง)
          ⚠️ ต้องรัน 0400 ก่อน deploy (ไม่มีคอลัมน์ = select 500 ทั้งหน้างานเข้าใหม่ · check:columns แดงจนกว่ารัน) */
    const { data: orders, error: orderError } = await fetchAllResult(() => supabase
      .from('sales_orders')
      .select('id, "orderNumber", status, supersededById, customerId, customerName, projectId, dealId, orderDate, approvedAt, "serviceContractId", origin, "historicalQuoteRef", "historicalExpressRef", "historicalInvoiceRef", "totalAmount", "serviceTermsOpenedAt", "serviceSetupState", "serviceSetupSubmittedAt", "serviceSetupSubmittedByName", "serviceSetupRejectedAt", "serviceSetupRejectedByName", "serviceSetupRejectedReason", "servicePeriodFrom", "servicePeriodTo", "updatedAt", "serviceSetupReopenedAt", "serviceSetupReopenedByName", "serviceSetupReopenedReason", "servicePeriodMode"')
      .eq('status', 'approved')
      .is('supersededById', null)
      .order('approvedAt', { ascending: false })
      .order('id', { ascending: true }));
    if (orderError) return fail(orderError.message, 500);

    const orderIds = (orders || []).map((o) => o.id);
    const projectIds = [...new Set((orders || []).map((o) => o.projectId).filter(Boolean))];
    const dealIds = [...new Set((orders || []).map((o) => o.dealId).filter(Boolean))];
    /* ใบที่อาจอยู่ในถังใบเดิม — pipeline · ยังไม่ประทับ (อนุมัติ + ยังไม่ถูก Rev. ทับ กรองที่ query แล้ว)
       ⇒ อ่านโซนที่ฝ่ายขายเลือกเฉพาะใบพวกนี้ ไม่กวาดทั้งตาราง */
    const legacyCandidateIds = (orders || [])
      .filter((o) => !o.serviceTermsOpenedAt && !isHistoricalOrder(o))
      .map((o) => o.id);

    const [lines, rawTerms, projects, deals, zones, sites, plans, visits, allocations] = await Promise.all([
      /* ⚠️ ซอยลิสต์ข้างนอก ไล่หน้าข้างใน — `fetchAllResult` แก้เพดานแถว ไม่ได้แก้
         URL ยาว (มันส่งตัวกรองก้อนเดิมไปทุกหน้า) · ซอยตาม `salesOrderId` ⇒ บรรทัด
         ของใบเดียวกันอยู่ก้อนเดียวเสมอ ลำดับ sortOrder ภายในใบจึงไม่เสีย
         ⚠️ ไม่ดึงราคา/ส่วนลด — ฝ่ายบริการไม่ต้องใช้ และยิ่งดึงมามาก ยิ่งมีของหลุดออกทาง response โดยไม่ตั้งใจ
         "serviceRounds" = ข้อผูกพันจำนวนรอบที่ขายไว้ (mig 0326) — TS ใช้ตอนวางรอบ
         "installationPoint" = จุดติดตั้งตามชีตของใบย้อนหลัง (mig 0360) — fgSummary แยกกลุ่มตามจุด
         🚫 ธงจุด 9 ช่อง (mig 0362) ถอดออกจาก select แล้ว (มติ 22/09) — ทางแจ้ง "ไม่พบจุดนี้หน้างาน"
         หายทั้งเส้นพร้อมแผง "ถอนการแจ้ง" · บรรทัดของใบย้อนหลังผูกโซนตั้งแต่ตอนคีย์ใบ ⇒ ไม่เข้าถังนี้อีก
         ⭐ mig 0392: ชนิด/แพ็คเกจ/หมวดของบรรทัด (`metadata.categoryCode` #1844) — ตัวตัดสิน "ใบเดิมต้องตั้งไหม ·
         ตั้งไปกี่รายการ" (serviceSetup.js) อ่านสามช่องนี้ · ยังไม่ดึงราคา/ส่วนลดเหมือนเดิม
         ⭐ mig 0400: "servicePeriodFrom"/"servicePeriodTo" = ช่วงบริการของรายการ (ใบแยกรายรายการ) — แนบให้รอบขายด้วย `withLinePeriods`
         (ไม่ยิงเพิ่ม — บรรทัดของใบที่อนุมัติโหลดอยู่แล้ว) · ถังใบเดิมอ่านจากบรรทัดตรง ๆ (ครบกี่รายการ)
         🪤 คอมเมนต์อยู่เหนือคำสั่ง — แทรกระหว่าง `.from()` กับ `.select()` แล้ว check:columns มองไม่เห็น select นี้ */
      fetchAllInChunks(orderIds, (chunk) => supabase.from('sales_order_lines')
          .select('id, salesOrderId, quotationLineId, productId, fgCode, description, qty, unit, sortOrder, "serviceRounds", "installationPoint", "serviceKind", "serviceProductId", "serviceFgCode", metadata, "servicePeriodFrom", "servicePeriodTo"')
          .in('salesOrderId', chunk)
          .order('salesOrderId', { ascending: true })
          .order('sortOrder', { ascending: true })
          .order('id', { ascending: true })),
      loadTerms(supabase),
      /* ⚠️ ห่อ fetchAllResult ทั้งคู่ — จำนวนโครงการ/ดีลโตตามจำนวนใบสั่งขาย
         ที่อนุมัติแล้ว ซึ่งวันหนึ่งเกิน 1,000 แน่ · PostgREST ตัดที่ 1,000 เงียบ ๆ
         แล้วใบที่หลุดจะ "ตอบไม่ได้ว่าสายอะไร" ทั้งที่โครงการระบุไว้ชัดเจน */
      fetchAllInChunks(projectIds, (chunk) => supabase.from('projects').select('id, line')
        .in('id', chunk).order('id', { ascending: true })),
      /* `ownerName` = ผู้ดูแลฝ่ายขายของใบเดิม (เจ้าของดีลปัจจุบัน · คนที่ต้องตั้งงานบริการ) */
      fetchAllInChunks(dealIds, (chunk) => supabase.from('sales_deals').select('id, line, "ownerName"')
        .in('id', chunk).order('id', { ascending: true })),
      loadAllZones(supabase),
      loadSites(supabase),
      loadPlans(supabase),
      loadVisits(supabase, { from: businessDate() }),
      /* โซนที่ฝ่ายขายเลือกในใบเดิม (mig 0392) — ความคืบหน้า + สรุป "ยื่นแล้ว n โซนใน m ไซต์" ของถังใบเดิม
         ⚠️ ซอยก้อน + ไล่หน้า (ใบเดียวลงได้ถึง 500 โซนต่อบรรทัด · check:rowcap) · อ่านพัง = โยน (catch ของ route ตอบ 500) */
      fetchAllInChunks(legacyCandidateIds, (chunk) => supabase.from('sales_order_line_zones')
        .select('id, "salesOrderId", "salesOrderLineId", "zoneId", "packsPerRound"')
        .in('salesOrderId', chunk).order('id')),
    ]);

    const projectsById = new Map(projects.map((p) => [p.id, p]));
    const dealsById = new Map(deals.map((d) => [d.id, d]));
    const ordersById = new Map((orders || []).map((o) => [o.id, o]));
    const todayIso = businessDate();

    /* ⭐ ชิปความพร้อม (PR-C) — ต้องรู้สัญญากับ "จ่ายถึง" ของแต่ละใบ
       ⚠️ ยิงเป็นก้อนเดียว ห้ามยิงรายใบในลูป (N+1) · `orderIds` ประกาศไว้ข้างบนแล้ว */
    const contractIds = [...new Set((orders || []).map((o) => o.serviceContractId).filter(Boolean))];
    const [instRows, contractRows] = await Promise.all([
      /* งวดชำระ: ซอยตาม `salesOrderId` ⇒ งวดของใบเดียวกันอยู่ก้อนเดียว ลำดับไม่เสีย
         ⚠️ ของเดิมกลืน error ทิ้ง (`.then(({ data }) => data || [])`) ⇒ พังแล้ว
         คอลัมน์งวดว่างทั้งหน้าเงียบ ๆ · ตอนนี้โยนออกมาให้ catch ของ route จับ */
      fetchAllInChunks(orderIds, (chunk) => supabase.from('sales_order_installments')
        .select('"salesOrderId", status, "dueDate", "coversFrom", "coversTo", id')
        .in('salesOrderId', chunk)
        .order('salesOrderId', { ascending: true }).order('id', { ascending: true })),
      /* ⭐ PR-C (C7): วันเริ่ม/สิ้นสุดของสัญญา = ช่วงบริการของใบย้อนหลัง (`servicePeriodOf` · C-D4) */
      fetchAllInChunks(contractIds, (chunk) => supabase.from('sales_contracts')
        .select('id, "contractNo", status, "effectiveDate", "expiryDate"').in('id', chunk).order('id', { ascending: true })),
    ]);
    const installmentsByOrderId = new Map();
    for (const r of instRows) {
      const list = installmentsByOrderId.get(r.salesOrderId) || [];
      list.push(r);
      installmentsByOrderId.set(r.salesOrderId, list);
    }
    const contractsById = new Map(contractRows.map((c) => [c.id, c]));

    /* ⭐ ถังใบเดิม (แท็บ `bind` · D14) — ใบที่อนุมัติก่อนฝ่ายขายตั้งงานบริการเอง · ตัดสินด้วย serviceSetup.js ทั้งหมด
       โซน → ไซต์ จากทะเบียนโซนที่โหลดไว้แล้ว (ไม่ยิงเพิ่ม) */
    /* ลูกค้าที่มีไซต์ลูกค้าที่ใช้งานในทะเบียน — ไม่มี = แถวใบเดิมบอก TS ให้เพิ่มไซต์ก่อน (ฝ่ายขายเลือกโซนไม่ได้)
       ⭐ ใช้ไซต์ที่โหลดไว้แล้ว (loadSites: kind='customer' รวมที่ปิด) · กติกาเดียวกับ `noSites` ของหน้าใบสั่งขาย (ไซต์ที่ใช้งาน) */
    const customersWithSite = new Set((sites || []).filter((s) => s?.isActive !== false).map((s) => s.customerId).filter(Boolean));
    const legacy = legacySetupQueue({
      orders: orders || [], lines, allocations, projectsById, dealsById, contractsById,
      zonesById: new Map((zones || []).map((z) => [z.id, z])),
      customersWithSite,
    });
    // ⚠️ term ชี้บรรทัดด้วย salesOrderLineId — ส่ง Map เข้าไปเพื่อให้คิววางรอบตอบ
    // "ขายไว้กี่รอบ" ได้ (ไม่ส่ง = ตอบ null ซึ่งอ่านว่า "ยังไม่ระบุ" ไม่ใช่ศูนย์)
    // ⭐ งวดของใบ ⇒ แถวรอตั้งรอบบอก "เงินครอบถึง" ได้ (มติ 22/09 · ม็อก TsIntake)
    const linesById = new Map((lines || []).map((row) => [row.id, row]));
    /* ⭐ mig 0400: รอบขายของใบแยกรายรายการได้ช่วงของบรรทัดตัวเองติดไปด้วย (`linePeriodFrom/To`) — แถวรอตั้งรอบ (`planRowFacts`)
       คิดช่วง/ค่าเติมโมดัล/รอบที่แนะนำจากช่วงนี้ · term ของใบโหมดทั้งใบเป็นออบเจ็กต์เดิม (ไม่มีอะไรเปลี่ยน) */
    const terms = withLinePeriods(rawTerms, ordersById, linesById);
    const visit = visitQueue({ plans, visits, sites, ordersById, isLive: isLiveVisit, todayIso });

    /* ⭐ รอบกำพร้า (PR-C · C-D11 · [owner]) — รอบที่ยังเดินแต่ชี้ใบที่ไม่มีผลแล้ว (Rev. ถอดไซต์ · Rev. ของ Rev. ·
       ใบถูกยกเลิก) ⇒ แถบเตือนบนแท็บตั้งรอบ · ระบบไม่ปิด/ย้ายรอบเอง
       · `ordersById` ของคิวมีเฉพาะใบที่มีผล ⇒ ใบที่รอบชี้แต่ไม่อยู่ในนั้นต้องโหลดเพิ่ม ทีละทอดของโซ่ `supersededById`
         (ทอดละหนึ่งคำสั่ง · ซอยก้อน · มีเพดาน) จนไม่มีใบใหม่ให้โหลด
       · 🔒 กฎ 18 (ยามเงินของใบย้อนหลัง): เลือกคอลัมน์ที่ตั้งชื่อ ค้นด้วย id ล้วน กรองสถานะใน JS (`intakePlanFacts`)
       · id ที่ขอแล้วแต่ไม่ได้แถวกลับ (ใบถูกลบ) จำไว้ ⇒ ไม่ขอซ้ำทุกทอด
       · ใบที่โหลดเพิ่มใช้เดินโซ่อย่างเดียว — ไม่ปนเข้า `ordersById` ของคิว (คิวยังเห็นเฉพาะใบที่มีผล) และไม่ออกไปกับ response */
    const chainById = new Map();
    const requested = new Set();
    for (let hop = 0; hop < ORPHAN_CHAIN_ROUNDS; hop += 1) {
      const known = new Map([...ordersById, ...chainById]);
      const missing = orphanOrderIdsToLoad({ plans, ordersById: known, todayIso }).filter((id) => !requested.has(id));
      if (!missing.length) break;
      for (const id of missing) requested.add(id);
      const chainRows = await fetchAllInChunks(missing, (chunk) => supabase.from('sales_orders')
        .select('id, "orderNumber", status, "supersededById"')
        .in('id', chunk).order('id', { ascending: true }));
      for (const row of chainRows) chainById.set(row.id, row);
    }
    const allOrdersById = new Map([...ordersById, ...chainById]);
    const orphans = orphanPlanRows({ plans, ordersById: allOrdersById, terms, zones, sites, todayIso });

    /* ⭐ PR-C (C7 · C-D2): ข้อเท็จจริงของแถว (แพ็คต่อรอบ · ช่วงบริการ · รอบที่แนะนำ · สัญญา · รายการรอบขาย · ค่าเติมโมดัล)
       มาจากตัวคำนวณ `decoratePlanRows` ตัวเดียว — ครอบ `planQueue` ตัวเดิม ⇒ จำนวน/ลำดับแถว (= ตัวนับบนเมนู) ไม่เปลี่ยน
       ⭐ review 29/09: ส่งรอบกำพร้าเข้าไปด้วย — รอบ stale ที่ใบปลายโซ่คือใบของแถว ติดแถวเป็น "ย้ายรอบเดิมมาใบนี้" (ไม่ใช่ตั้งรอบซ้อน) */
    const plan = decoratePlanRows(planQueue({ zones, terms, plans, sites, ordersById, linesById, installmentsByOrderId, todayIso }), { ordersById, contractsById, linesById, todayIso, orphans });

    return ok({
      bind: legacy.rows,
      unknownLine: legacy.unknownLine,
      plan,
      visit,
      orphans,
      counts: intakeCounts({ legacy, plan, visit }),
      todayIso,
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});
