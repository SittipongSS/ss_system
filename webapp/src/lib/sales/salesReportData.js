import { businessDayKey, businessDayStart, addDays, lastDayOfMonth } from '@/lib/datePeriods';
import { loadUserDirectory } from '@/lib/usersRepo';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { reportPendingApproval } from '@/lib/sales/reportPendingApproval';
import { buildReportRows, reportOrderMonth as orderMonth, reportOrderTeam } from '@/lib/sales/reportRows';
import { pipelineRowsOnly } from '@/lib/sales/historicalOrders';
import { historyAppliesTo, targetFactorOf } from '@/lib/sales/reportPeriod';
import { orderBusinessLineOf } from '@/lib/sales/serviceOrders';

/* ตัวโหลดข้อมูลของรายงานยอดขาย — ใช้ร่วมกันสองทาง: JSON ของหน้าจอ (/api/sales-planning/report)
 * กับไฟล์ Excel (/api/sales-planning/report/export) ⇒ **ไฟล์กับจอได้ข้อมูลก้อนเดียวกันเสมอ**
 * (ยกออกจาก route.js 2026-09-22 — ก่อนหน้านี้มีแต่จอ)
 *
 * ⭐ ทำไมไม่ใช้ `/api/sales-planning/dashboard` ซ้ำ (มติหลังรื้อรอบ 2026-08-26):
 * แดชบอร์ดคืนแต่ยอดรวมและถูกแคชระดับทั้งบริษัท 5 นาที — รายงานต้องการ **รายการใบ**
 * ซึ่งไม่มีอยู่ในนั้นเลย และต้องการเลขที่ตรงกับที่บัญชีเห็น ณ วินาทีที่เปิด
 *
 * ⚠️ "ของใคร" อ่านจาก `sales_orders."ownerId"` ที่ **แช่ไว้ตอนอนุมัติ** (mig 0292)
 * ไม่ใช่เจ้าของดีลปัจจุบัน — ไม่งั้นย้ายดีลแล้วยอดของเดือนที่จ่ายคอมไปแล้วย้ายตาม
 * ⭐ "ทีมไหน" = **ทีมตามดีล** (มติผู้ใช้ 2026-09-14): sales_deals.team ของดีลของใบ ·
 * sales_targets.team ของเป้า · sales_history.team ของยอดกรอกมือ — ไม่อ่านทีมจากบัญชีเจ้าของ
 *
 * ⭐ ใบ **รออนุมัติ** (มติผู้ใช้ 2026-09-11 · mig 0353) คืนเป็นช่อง `pendingApproval` แยก
 * ไม่ปนเข้า actual[] / orders[] · ลงเดือนปัจจุบันเวลาไทยเสมอ ⇒ มีเฉพาะงวดที่คลุม "วันนี้"
 *
 * ⭐ งวด (lib/sales/reportPeriod · มติผู้ใช้ 2026-09-22):
 *   - แกน `axis` อาจยาวกว่าเดือนที่โชว์ — เดือนเดียวโหลดตั้งแต่ ม.ค. เพื่อคิดทบยอด
 *   - ช่วงวัน: ใบนับตามวันอนุมัติ (วันไทย) ในช่วง · เป้าปันตามวัน (targetFactor) ·
 *     ยอดกรอกย้อนหลังรายเดือนใช้เฉพาะเดือนที่คลุมครบ (historyAppliesTo)
 */

const money = (v) => Number(v || 0);

/** วันไทยของยอด — วันอนุมัติ · ถอยไป orderDate เฉพาะแถวเก่าที่ไม่มี approvedAt (กติกาเดียวกับ reportOrderMonth) */
export const reportOrderDay = (order) => businessDayKey(order?.approvedAt)
  || (order?.orderDate ? String(order.orderDate).slice(0, 10) : null);

/** ขอบของคิวรีตาม approvedAt แบบครึ่งเปิด [from, until) — วันแรกของแกนถึงวันสุดท้ายของงวด
 *  ⚠️ ขอบต้องเป็นต้นวันเวลาไทย ไม่ใช่สตริงวันเปล่า (Postgres อ่านเป็น 00:00 UTC = 07:00 ไทย) */
export function reportQueryWindow(period) {
  const firstDay = period.mode === 'range' ? period.from : `${period.axis[0]}-01`;
  const lastDay = period.mode === 'range' ? period.to : lastDayOfMonth(period.axis.at(-1));
  return { firstDay, lastDay, from: businessDayStart(firstDay), until: businessDayStart(addDays(lastDay, 1)) };
}

/** รูปของใบหนึ่งแถวที่จอและไฟล์ใช้ — ยอดที่รายงานนับ = actualAmount (= totalAmount − vatAmount) */
function shapeOrder(o, { person, lineCount, payments = new Map() }) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    quoteNumber: o.metadata?.quoteNumber || null,
    quotationId: o.quotationId,
    dealId: o.dealId,
    customerId: o.customerId,
    customerName: o.customerName,
    ownerId: o.ownerId,
    ownerName: person(o.ownerId)?.name || o.ownerName || null,
    // ทีมตามดีล — ตัวเดียวกับที่แถวทีม/รายคนใช้ ⇒ กรอง/จัดกลุ่มตามทีมในตารางใบกระทบกับสรุปได้
    team: reportOrderTeam(o),
    // ประเภทธุรกิจ (สินค้า/บริการ) ตามตัวกลาง — โครงการก่อน ดีลทีหลัง · ประเภทดีล (SCENT/NPD/RE-ORDER/OTHER) ของดีล
    // ⚠️ ไม่เติมค่าตั้งต้น (dealTypeOf ตีค่าว่างเป็น NPD) — ว่าง = ขีด ให้เห็นว่าดีลยังไม่ระบุ
    line: orderBusinessLineOf(o),
    dealType: o.deal?.dealType || null,
    month: orderMonth(o),
    day: reportOrderDay(o),
    approvedAt: o.approvedAt,
    lineCount: lineCount.get(o.id) || 0,
    amount: money(o.actualAmount),
    vatAmount: money(o.vatAmount),
    totalAmount: money(o.totalAmount),
    /* ⭐ ยอดเก็บจริง (มติผู้ใช้ 2026-09-22) = ผลรวมงวดที่บัญชี **รับรองแล้ว** (`confirmed`) · รวม VAT เหมือนยอดหน้าใบ
       (งวดของใบรวมกันเท่ายอดหน้าใบ — ตรวจ prod ครบ 166/166 ใบ) · `reported` = SA แจ้งว่าเข้าแล้ว บัญชียังไม่รับรอง
       ⇒ แยกเป็น awaitingAmount ไม่ใช่ยอดเก็บจริง (กติกาเดียวกับทะเบียนการชำระ · mig 0245)
       ⛔ คนละแกนกับยอดขาย — ห้ามเอาไปหัก/บวก Actual (lib/sales/salesOrderPayments หัวไฟล์) */
    collectedAmount: payments.get(o.id)?.collected || 0,
    awaitingAmount: payments.get(o.id)?.awaiting || 0,
    /* ⭐ ยอดค้างชำระ (มติผู้ใช้ 2026-09-22) = ยอดหน้าใบ − ยอดเก็บจริง (ไม่ต่ำกว่า 0)
       = งวดที่ยังไม่ confirmed ทั้งหมด **รวมที่รอบัญชีรับรอง** (กติกาเดียวกับ outstandingAmount ของทะเบียนการชำระ)
       คิดจากยอดหน้าใบ ไม่ใช่ผลรวมงวด — ใบที่ยังไม่มีงวดยังค้างเต็มใบ ไม่ใช่ 0 (งวดรวมกัน = ยอดหน้าใบทุกใบที่มีงวด) */
    outstandingAmount: Math.max(0, Math.round((money(o.totalAmount) - (payments.get(o.id)?.collected || 0)) * 100) / 100),
    installmentCount: payments.get(o.id)?.count || 0,
    discountAmount: money(o.discountAmount),
    // ใบที่ส่วนลดท้ายใบเต็มจำนวน (งานที่ไม่คิดเงิน) — ต้องขึ้นครบทุกใบ ห้ามกรองทิ้ง
    free: money(o.actualAmount) === 0,
    financeStatus: o.financeStatus || null,
  };
}

/**
 * โหลดทุกอย่างของรายงานหนึ่งงวด
 *
 * @param period ผลของ parseReportPeriod (ไม่มี error)
 * @returns { period, axis, months, lead, targetFactor[], company, teams, people, pendingApproval,
 *            orders[] (เฉพาะเดือน/วันที่โชว์), byDay{ 'YYYY-MM-DD': count }, historyDropped[] }
 *          | { error, status }
 */
export async function loadSalesReportData(supabase, period, { now = new Date() } = {}) {
  const axis = period.axis;
  const slot = new Map(axis.map((m, i) => [m, i]));
  const shown = new Set(period.months);
  const window = reportQueryWindow(period);

  /* ── เป้า ────────────────────────────────────────────────────────────
     แถวเป้ามีสามระดับในตารางเดียว: บริษัท (team null) · ทีม (ownerId null) · รายคน
     ห้ามบวกรวมข้ามระดับ — เป้าระดับทีมไม่ได้เป็นผลรวมของรายคนเสมอไป
     🪤 อ่านผ่าน fetchAllResult — เดิม select เปล่าไม่มี order โดนเพดาน 1,000 แถวได้เงียบ ๆ (ตรวจ 2026-09-22) */
  const { data: targets, error: targetError } = await fetchAllResult(() => supabase
    .from('sales_targets')
    .select('id, period, periodType, team, "ownerId", "targetAmount"')
    .eq('periodType', 'month')
    .gte('period', axis[0])
    .lte('period', axis.at(-1))
    .order('period', { ascending: true })
    .order('id', { ascending: true }));
  if (targetError) return { error: targetError.message, status: 500 };

  /* ── ใบสั่งขายที่อนุมัติแล้ว ─────────────────────────────────────────
     ⭐ ทีมของยอด = `deal:sales_deals(team, …)` — embed ในคิวรีเดียวกัน (พ่วงประเภทดีล `dealType` + สาย `line`
        ของดีลมาด้วย — คอลัมน์ "ประเภทธุรกิจ/ประเภทดีล" ของรายการใบ · มติผู้ใช้ 2026-09-22)
     ⭐ ประเภทธุรกิจตัดสินด้วย `orderBusinessLineOf` ตัวกลาง: สายของ **โครงการ** ก่อน แล้วค่อยสายของดีล
        (โครงการเป็นเจ้าของค่าจริง ดีลเป็นสำเนา — กติกาเดียวกับทะเบียนการชำระ/คิว TS) ⇒ embed `project:projects(id, line)` (FK เดียว 0107 · service role
        ไม่โดน RLS) ⚠️ ห้ามแยกไปถาม `.in('id', dealIds)` — ลิสต์โตตามจำนวนใบ ชนเพดาน URL 16 KB
     ⛔ ใบสั่งขายย้อนหลัง (mig 0360) อนุมัติ ณ เวลาคีย์แต่ไม่ใช่ยอดขาย — ไม่กรอง = งานเก่าทั้งกองโผล่เป็นยอดของเดือนที่คีย์ */
  const { data: orders, error: orderError } = await fetchAllResult(() => pipelineRowsOnly(supabase
    .from('sales_orders')
    .select('id, "orderNumber", "quotationId", "dealId", "projectId", "customerName", "customerId", "orderDate", "approvedAt", "ownerId", "ownerName", subtotal, "discountAmount", "vatAmount", "totalAmount", "actualAmount", "financeStatus", metadata, project:projects(id, line), deal:sales_deals(team, id, line, "dealType")'))
    .eq('status', 'approved')
    .gte('approvedAt', window.from)
    .lt('approvedAt', window.until)
    .order('approvedAt', { ascending: true })
    .order('id', { ascending: true }));
  if (orderError) return { error: orderError.message, status: 500 };

  /* ตัดให้ตรงงวดด้วยวันไทยในโค้ด (ขอบคิวรีเป็นต้นวันไทยแล้ว ตรงนี้กันแถวที่ไม่มี approvedAt) */
  const inAxis = (orders || []).filter((o) => {
    const day = reportOrderDay(o);
    return day && day >= window.firstDay && day <= window.lastDay && slot.has(orderMonth(o));
  });
  // เดือนนำ (ไว้คิดทบยอด) เข้าแถวยอด แต่ไม่เข้ารายการใบของงวดที่โชว์
  const inShown = inAxis.filter((o) => shown.has(orderMonth(o)));

  // จำนวนบรรทัดต่อใบ — บอกว่ากดเข้าไปดูในใบแล้วจะเจอกี่รายการ (รายการจริงอยู่ในใบ)
  const ids = inShown.map((o) => o.id);
  const { data: lines, error: lineError } = await fetchInChunks(ids, (chunk) => fetchAllResult(() => supabase
    .from('sales_order_lines').select('"salesOrderId"').in('salesOrderId', chunk)
    .order('salesOrderId', { ascending: true }).order('id', { ascending: true })));
  if (lineError) return { error: lineError.message, status: 500 };
  const lineCount = new Map();
  for (const line of lines || []) {
    lineCount.set(line.salesOrderId, (lineCount.get(line.salesOrderId) || 0) + 1);
  }

  /* งวดชำระของใบในงวดที่โชว์ — ยอดเก็บจริง (confirmed) + ที่รอบัญชีรับรอง (reported)
     เฉพาะงวดที่ยอดหยุดแล้ว (`frozenAt` · B-4 mig 0259) เหมือนทะเบียนการชำระ ⇒ ตัวเลขตรงกับหน้า /finance */
  const { data: installments, error: installmentError } = await fetchInChunks(ids, (chunk) => fetchAllResult(() => supabase
    .from('sales_order_installments').select('"salesOrderId", amount, status').in('salesOrderId', chunk)
    .not('frozenAt', 'is', null)
    .order('salesOrderId', { ascending: true }).order('id', { ascending: true })));
  if (installmentError) return { error: installmentError.message, status: 500 };
  const payments = new Map();
  for (const row of installments || []) {
    const acc = payments.get(row.salesOrderId) || { collected: 0, awaiting: 0, count: 0 };
    acc.count += 1;
    if (row.status === 'confirmed') acc.collected += money(row.amount);
    if (row.status === 'reported') acc.awaiting += money(row.amount);
    payments.set(row.salesOrderId, acc);
  }

  /* ── ใบสั่งขายที่รออนุมัติ (มติผู้ใช้ 2026-09-11 · mig 0353) ──────────────────
     ยอดลง **วันนี้ (เดือนปัจจุบัน) เสมอ** ⇒ งวดที่ไม่คลุมวันนี้ไม่ต้องถามฐานเลย
     (ช่วงวัน "สัปดาห์ก่อน" อยู่ในเดือนนี้ก็จริง แต่ไม่คลุมวันนี้ — ยอดรออนุมัติไม่ใช่ของช่วงนั้น)
     ⚠️ ห้ามต่อ id ของใบพวกนี้เข้า `.in('salesOrderId', ids)` ข้างบน */
  const coversToday = period.from <= period.today && period.today <= period.to;
  const { data: pendingOrders, error: pendingError } = coversToday
    ? await fetchAllResult(() => pipelineRowsOnly(supabase
      .from('sales_orders')
      .select('id, "orderNumber", "quotationId", "dealId", "projectId", "customerName", "customerId", status, "submittedAt", "vatAmount", "totalAmount", "actualAmount", metadata, project:projects(id, line)'))
      .eq('status', 'pending_approval')
      .order('id', { ascending: true }))
    : { data: [], error: null };
  if (pendingError) return { error: pendingError.message, status: 500 };

  /* เจ้าของดีล **ปัจจุบัน** + ทีมของดีล — `sales_orders."ownerId"` ยังว่างจนกว่าจะอนุมัติ (mig 0294)
     ลิสต์ id โตตามจำนวนใบที่ค้าง ⇒ ซอยด้วย fetchInChunks ตั้งแต่วันแรก */
  const { data: pendingDeals, error: pendingDealError } = await fetchInChunks(
    (pendingOrders || []).map((o) => o.dealId),
    (chunk) => fetchAllResult(() => supabase
      .from('sales_deals')
      .select('id, stage, team, line, "dealType", "ownerId", "ownerName"')
      .in('id', chunk)
      .order('id', { ascending: true })),
  );
  if (pendingDealError) return { error: pendingDealError.message, status: 500 };

  /* ── ยอดที่กรอกย้อนหลัง ──────────────────────────────────────────────
     เดือนที่มีแถวนี้ = ยอดมาจากการกรอกมือ **ทับ** ยอดจากใบ (กติกาเดียวกับแท็บผลงานขาย)
     ช่วงวันที่คลุมเดือนไม่ครบ ใช้แถวรายเดือนนี้ไม่ได้ — ตัดทิ้งแล้วบอกจอ (historyDropped) */
  const { data: history, error: historyError } = await fetchAllResult(() => supabase
    .from('sales_history')
    .select('id, period, team, "ownerId", "actualAmount"')
    .eq('periodType', 'month')
    .gte('period', axis[0])
    .lte('period', axis.at(-1))
    .order('period', { ascending: true })
    .order('id', { ascending: true }));
  if (historyError) return { error: historyError.message, status: 500 };
  const usableHistory = (history || []).filter((h) => historyAppliesTo(period, h.period));
  const historyDropped = [...new Set((history || [])
    .filter((h) => !historyAppliesTo(period, h.period))
    .map((h) => h.period))].sort();

  // ชื่อจากบัญชีปัจจุบัน — ป้ายบนจอต้องเป็นชื่อวันนี้ · ⛔ ทีมในบัญชีห้ามใช้จัดยอด (ทีมตามดีล)
  const directory = await loadUserDirectory(supabase);
  const person = (id) => directory.get(id) || null;

  // บริษัท / ทีม / รายคน — กติกาทั้งหมดอยู่ที่ lib/sales/reportRows (เทสต์ได้)
  const { company, teams, people } = buildReportRows({
    months: axis,
    targets,
    orders: inAxis,
    history: usableHistory,
    person,
  });

  /* ช่วงวัน: ปันเป้าตามวันที่คลุมและถึงวันนี้แล้ว — ทุกระดับด้วยสัดส่วนเดียวกัน
     (โหมดรายเดือน/ทั้งปีได้ 1 ทุกเดือน = เป้าเต็มตามเดิม)
     🐞 เดือนกรอกมือที่ช่วงคลุมไม่ครบ (historyDropped) = เป้า 0 "ไม่เทียบ" — ยอดเดือนนั้นอยู่ในก้อนรายเดือน
        ที่แบ่งรายวันไม่ได้ ขายจริงจากใบจึงต่ำกว่าความจริง เทียบเป้าที่ปันแล้ว % ทรุดหลอกตา (ตรวจ 2026-09-22)
        ขายจริงจากใบยังนับตามจริง (ใบที่อนุมัติในช่วงเป็นข้อเท็จจริง) */
  const dropped = new Set(historyDropped);
  const targetFactor = axis.map((m) => (dropped.has(m) ? 0 : targetFactorOf(period, m)));
  // เป้าเต็มเดือนของบริษัท ก่อนปัน — ช่วงวันโชว์เป็นบรรทัดรอง "เต็มเดือน ฿…"
  if (company) company.targetFull = [...company.target];
  if (period.mode === 'range') {
    for (const row of [company, ...teams, ...people].filter(Boolean)) {
      // ปัดเป็นสตางค์รายเดือนรายแถว — ผลรวมบนจอ/ไฟล์บวกจากตัวที่ปัดแล้ว ไม่มีเศษทศนิยมยาวโผล่
      row.target = row.target.map((v, i) => Math.round(v * targetFactor[i] * 100) / 100);
    }
  }

  // ประเภทธุรกิจของใบรออนุมัติ — ตัวกลางเดียวกับใบอนุมัติแล้ว (โครงการของใบก่อน แล้วดีล)
  const pendingDealById = new Map((pendingDeals || []).map((d) => [d.id, d]));
  const pendingApproval = reportPendingApproval({
    orders: (pendingOrders || []).map((o) => ({ ...o, line: orderBusinessLineOf({ ...o, deal: pendingDealById.get(o.dealId) || null }) })),
    deals: pendingDeals,
    months: coversToday ? axis : [],
    person,
    now,
  });

  // จุดใต้วันที่ในปฏิทินช่วงวัน = วันที่มีใบอนุมัติ
  const byDay = {};
  for (const o of inShown) {
    const day = reportOrderDay(o);
    if (day) byDay[day] = (byDay[day] || 0) + 1;
  }

  return {
    period,
    axis,
    months: period.months,
    lead: period.lead,
    targetFactor,
    company,
    teams,
    people,
    pendingApproval,
    orders: inShown.map((o) => shapeOrder(o, { person, lineCount, payments })),
    byDay,
    historyDropped,
    generatedAt: now.toISOString(),
  };
}
