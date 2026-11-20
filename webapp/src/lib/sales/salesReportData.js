import { businessDayKey, businessDayStart, addDays, lastDayOfMonth } from '@/lib/datePeriods';
import { loadUserDirectory } from '@/lib/usersRepo';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { reportPendingApproval } from '@/lib/sales/reportPendingApproval';
import {
  buildReportRows, isUncountedReportRow, reportActualRows, reportOrderMonth as orderMonth, reportOrderTeam,
} from '@/lib/sales/reportRows';
import { actualModeOf, actualNoneReasonOf, isInstallmentActualOrder } from '@/lib/sales/salesOrderActualMode';
import { exciseRowsOnly, pipelineRowsOnly } from '@/lib/sales/historicalOrders';
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
 * ⭐ ใบ "Actual รายงวด" (mig 0412 · มติเจ้าของ 26/10/2026) — **หนึ่งแถวต่อ (ใบ, เดือนที่นับ)** (reportActualRows):
 *   ยอดของแถว = งวดที่ AE Sup อนุมัตินับในเดือนนั้น · วัน/เดือน = เวลาที่นับงวด · ใบที่อนุมัติก่อนงวดก็ต้องโหลด
 *   (งวดของมันอาจนับในงวดนี้) · ส่วนรออนุมัติรวมงวดที่ยื่นแล้วรอ AE Sup · ใบทั้งใบได้ผลเท่าเดิมทุกไบต์
 *
 * ⭐ ใบที่ "โชว์แต่ไม่นับ" (มติเจ้าของ 20/11/2026 · mig 0439) คืนเป็นช่อง `uncountedOrders` แยก — รูปแถวเดียวกับ orders[]
 *   (ยอดที่นับ 0 · ยอดเก็บ/ค้างชำระตามจริง · ป้าย) · ไม่ปนเข้า orders[] / แถวบริษัท-ทีม-คน / pendingApproval / byDay
 *   ⇒ ตัวสรุป (reportSummary) ที่นับ "ใบสั่งขาย n ใบ" จาก orders[] ได้ผลเท่าเดิมทุกตัว · จอ/Excel ต่อสองก้อนเข้ารายการใบเอง
 *   - ใบ "ไม่นับ Actual" (actualMode 'none') — มากับคิวรีใบอนุมัติก้อนเดิม (pipeline) + เหตุผล `actualNoneReason`
 *   - ใบค่าสรรพสามิต (origin 'excise' · mig 0414) — คิวรีแยก (exciseRowsOnly) · ทีม/สาย/ประเภทดีล = ของดีลของ SO ต้นทาง
 *     (`sourceSalesOrderId` → sales_orders → deal) · ผู้รับผิดชอบ = ownerId ของใบค่าสรรพสามิตเอง
 *
 * ⭐ งวด (lib/sales/reportPeriod · มติผู้ใช้ 2026-09-22):
 *   - แกน `axis` อาจยาวกว่าเดือนที่โชว์ — เดือนเดียวโหลดตั้งแต่ ม.ค. เพื่อคิดทบยอด
 *   - ช่วงวัน: ใบนับตามวันอนุมัติ (วันไทย) ในช่วง · เป้าปันตามวัน (targetFactor) ·
 *     ยอดกรอกย้อนหลังรายเดือนใช้เฉพาะเดือนที่คลุมครบ (historyAppliesTo)
 */

const money = (v) => Number(v || 0);
const toSatang = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** วันไทยของยอด — วันอนุมัติ · ถอยไป orderDate เฉพาะแถวเก่าที่ไม่มี approvedAt (กติกาเดียวกับ reportOrderMonth)
 *  ⭐ แถวงวดของใบ "Actual รายงวด" (mig 0412) = วันที่นับงวด (`actualAt`) — ใบทั้งใบไม่มีช่องนี้ */
export const reportOrderDay = (order) => businessDayKey(order?.actualAt || order?.approvedAt)
  || (order?.orderDate ? String(order.orderDate).slice(0, 10) : null);

/** ขอบของคิวรีตาม approvedAt แบบครึ่งเปิด [from, until) — วันแรกของแกนถึงวันสุดท้ายของงวด
 *  ⚠️ ขอบต้องเป็นต้นวันเวลาไทย ไม่ใช่สตริงวันเปล่า (Postgres อ่านเป็น 00:00 UTC = 07:00 ไทย) */
export function reportQueryWindow(period) {
  const firstDay = period.mode === 'range' ? period.from : `${period.axis[0]}-01`;
  const lastDay = period.mode === 'range' ? period.to : lastDayOfMonth(period.axis.at(-1));
  return { firstDay, lastDay, from: businessDayStart(firstDay), until: businessDayStart(addDays(lastDay, 1)) };
}

/** รูปของใบหนึ่งแถวที่จอและไฟล์ใช้ — ยอดที่รายงานนับ = actualAmount (= totalAmount − vatAmount)
 *  ⭐ แถวงวดของใบ "Actual รายงวด" (mig 0412) ได้ช่องเงินของ **งวดในแถวนั้น** (installmentShape) + ช่องเพิ่ม —
 *     ใบทั้งใบได้รูปเดิมทุกช่อง (ไม่มีช่องเพิ่ม) */
function shapeOrder(o, { person, lineCount, payments = new Map(), installmentById = new Map() }) {
  if (o.rowKey) return installmentShape(o, shapeOrderRow(o, { person, lineCount, payments }), installmentById);
  return shapeOrderRow(o, { person, lineCount, payments });
}

/* แถวงวดของใบรายงวด — เงินคิดจากงวดที่นับในแถวนี้เท่านั้น (ยอดหน้างวดรวม VAT · เก็บจริง = งวดที่บัญชีรับรองแล้ว)
   ⇒ หลายแถวของใบเดียวไม่นับเงินของใบซ้ำ · นับครบทุกงวด = ผลรวมทุกแถวเท่ายอดหน้าใบ/VAT ของใบ (คลาดได้ไม่เกินสตางค์จากการปัด)
   ⭐ VAT ของแถว = ยอดหน้างวด × (VAT ÷ ยอดรวม VAT ของใบ) — สัดส่วน VAT ของใบเอง (review รอบสี่ 26/10)
   🐞 เดิม = ยอดหน้างวด − ยอดที่นับ (ก่อน VAT) หนีบที่ 0 — ถูกเฉพาะตอนยอดงวดยังเท่ากับส่วนแบ่งที่ตรึงตอนนับ ⇒ ยกเงิน (C2b ย้าย Actual ไปแถวที่ยก) ·
      ปรับยอดงวดที่นับแล้ว (มติข้อ 9) · งวดที่นับให้เองด้วยส่วนแบ่ง 0 (มติข้อ 10) ทำ VAT ของแถวเพี้ยน (ทั้งแถวเป็น VAT · Σ VAT เกินของใบ) */
function installmentShape(o, base, installmentById) {
  const rows = (o.installmentIds || []).map((id) => installmentById.get(id)).filter(Boolean);
  const total = toSatang(rows.reduce((s, r) => s + money(r.amount), 0));
  const collected = toSatang(rows.filter((r) => r.status === 'confirmed').reduce((s, r) => s + money(r.amount), 0));
  const awaiting = toSatang(rows.filter((r) => r.status === 'reported').reduce((s, r) => s + money(r.amount), 0));
  return {
    ...base,
    vatAmount: base.totalAmount > 0 ? toSatang((total * base.vatAmount) / base.totalAmount) : 0,
    totalAmount: total,
    collectedAmount: collected,
    awaitingAmount: awaiting,
    outstandingAmount: toSatang(Math.max(0, total - collected)),
    installmentCount: rows.length,
    free: money(o.orderActualAmount) === 0,
    actualMode: 'installment',
    rowKey: o.rowKey,
    actualAt: o.actualAt || null,
    installmentSeqs: [...(o.installmentSeqs || [])].sort((a, b) => a - b),
  };
}

function shapeOrderRow(o, { person, lineCount, payments = new Map() }) {
  /* ใบค่าสรรพสามิตไม่มีดีล — ประเภทธุรกิจ/ประเภทดีลอ่านจากดีลของ SO ต้นทาง (`sourceDeal` ที่ตัวโหลดเติม · ทีมด้วย reportOrderTeam)
     ใบอื่นไม่มี sourceDeal ⇒ ค่าเดิมทุกตัว */
  const deal = o.deal || o.sourceDeal || null;
  const base = {
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
    // ประเภทธุรกิจ (สินค้า/บริการ) ตามตัวกลาง — สายของดีล · ประเภทดีล (SCENT/NPD/RE-ORDER/OTHER) ของดีล
    // ⚠️ ไม่เติมค่าตั้งต้น (dealTypeOf ตีค่าว่างเป็น NPD) — ว่าง = ขีด ให้เห็นว่าดีลยังไม่ระบุ
    line: orderBusinessLineOf(o.excise ? { dealId: deal?.id || null, deal } : o),
    dealType: deal?.dealType || null,
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
  if (!isUncountedReportRow(o)) return base;
  /* ⭐ แถวที่โชว์แต่ไม่นับ (มติเจ้าของ 20/11 · mig 0439) — ยอดที่นับ 0 แต่ **ไม่ใช่ "ไม่คิดเงิน"**:
     "ไม่คิดเงิน" = ส่วนลดเต็มใบ ⇒ ตัดสินจากยอดก่อน VAT ของเอกสารเอง (ใบไม่นับ Actual = actualAmount เดิมของใบ ·
     ใบค่าสรรพสามิต actualAmount = 0 เสมอตาม CHECK ของ 0414 ⇒ ยอดหน้าใบ − VAT) · ช่องเพิ่มมีเฉพาะแถวชนิดนี้ (ใบปกติรูปเดิม) */
  const documentAmount = o.excise ? toSatang(money(o.totalAmount) - money(o.vatAmount)) : money(o.orderActualAmount);
  return {
    ...base,
    free: documentAmount === 0,
    actualMode: actualModeOf(o),
    actualNone: Boolean(o.actualNone),
    actualNoneReason: actualNoneReasonOf(o) || null,
    excise: Boolean(o.excise),
  };
}

/**
 * โหลดทุกอย่างของรายงานหนึ่งงวด
 *
 * @param period ผลของ parseReportPeriod (ไม่มี error)
 * @returns { period, axis, months, lead, targetFactor[], company, teams, people, pendingApproval,
 *            orders[] (เฉพาะเดือน/วันที่โชว์), uncountedOrders[] (ใบที่โชว์แต่ไม่นับ · รูปเดียวกับ orders[] + ธง),
 *            byDay{ 'YYYY-MM-DD': count }, historyDropped[] }
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
     ⭐ ประเภทธุรกิจตัดสินด้วย `orderBusinessLineOf` ตัวกลาง: สายของ **ดีล** (embed `line` มากับ `deal:` แล้ว —
        กติกาเดียวกับทะเบียนการชำระ/คิว TS) · งวด P3b-1 ยุบโครงการ เลิก embed `project:projects(id, line)` (สายของโครงการ = ของดีลทุกใบบน prod)
        ⚠️ ห้ามแยกไปถาม `.in('id', dealIds)` — ลิสต์โตตามจำนวนใบ ชนเพดาน URL 16 KB
     ⛔ ใบสั่งขายย้อนหลัง (mig 0360) อนุมัติ ณ เวลาคีย์แต่ไม่ใช่ยอดขาย — ไม่กรอง = งานเก่าทั้งกองโผล่เป็นยอดของเดือนที่คีย์ */
  /* ⭐ ใบ "Actual รายงวด" (mig 0412) ที่อนุมัติ **ก่อน** งวดก็โหลดมาด้วย (`.or` ข้างล่าง) — งวดของมันนับในเดือนที่ AE Sup
     อนุมัติงวด ซึ่งอาจอยู่ในงวดนี้ · ใบทั้งใบยังเป็นช่วงเดิม [from, until) · `status` / แบบการนับ / cache สองช่องมาด้วย
     (ตัวแตกแถว + ส่วนรออนุมัติของงวดอ่าน) · ดีลพ่วง `stage` ให้ส่วนรออนุมัติของงวดนับเฉพาะดีล Won (กติกาเดียวกับแดชบอร์ด) */
  const { data: orders, error: orderError } = await fetchAllResult(() => pipelineRowsOnly(supabase
    .from('sales_orders')
    .select('id, "orderNumber", "quotationId", "dealId", "projectId", "customerName", "customerId", "orderDate", "approvedAt", "ownerId", "ownerName", subtotal, "discountAmount", "vatAmount", "totalAmount", "actualAmount", "financeStatus", status, "actualMode", "actualCountedAmount", "actualSubmittedAmount", "actualNoneReason", metadata, deal:sales_deals(team, id, line, "dealType", stage)'))
    .eq('status', 'approved')
    .lt('approvedAt', window.until)
    .or(`approvedAt.gte."${window.from}",actualMode.eq.installment`)
    .order('approvedAt', { ascending: true })
    .order('id', { ascending: true }));
  if (orderError) return { error: orderError.message, status: 500 };

  /* ── ใบค่าสรรพสามิตที่อนุมัติในงวด (มติเจ้าของ 20/11 · mig 0414) ── โชว์ในรายการใบด้วยยอดที่นับ 0 (ไม่นับ Actual / FC / เป้า)
     ช่วงเดียวกับใบทั้งใบ [from, until) · `origin` มาด้วยให้ตัวแตกแถว (reportActualRows · isExciseOrder) ติดธงเอง
     ⚠️ ไม่มีดีล — ทีม/สาย/ประเภทดีลเติมจาก SO ต้นทางทีหลัง เฉพาะใบในงวดที่โชว์ */
  const { data: exciseOrders, error: exciseError } = await fetchAllResult(() => exciseRowsOnly(supabase
    .from('sales_orders')
    .select('id, "orderNumber", "quotationId", "dealId", "customerName", "customerId", "orderDate", "approvedAt", "ownerId", "ownerName", "discountAmount", "vatAmount", "totalAmount", "actualAmount", "financeStatus", status, origin, "actualMode", "sourceSalesOrderId", metadata'))
    .eq('status', 'approved')
    .gte('approvedAt', window.from)
    .lt('approvedAt', window.until)
    .order('approvedAt', { ascending: true })
    .order('id', { ascending: true }));
  if (exciseError) return { error: exciseError.message, status: 500 };

  /* งวดของใบ "Actual รายงวด" — เหตุการณ์ Actual (งวดที่นับแล้ว) + งวดที่ยื่นรอ AE Sup (ส่วนรออนุมัติ) + เงินของแถวงวด
     ใบทั้งใบล้วน = ลิสต์ว่าง ⇒ ไม่ยิงคำถามเพิ่มเลย (fetchInChunks ข้ามเมื่อไม่มี id) */
  const installmentOrders = (orders || []).filter(isInstallmentActualOrder);
  const { data: actualInstallments, error: actualInstallmentError } = await fetchInChunks(
    installmentOrders.map((o) => o.id),
    (chunk) => fetchAllResult(() => supabase
      .from('sales_order_installments')
      .select('id, "salesOrderId", seq, amount, status, "actualStatus", "actualAmount", "actualApprovedAt", "actualSubmittedAt"')
      .in('salesOrderId', chunk)
      .order('salesOrderId', { ascending: true }).order('id', { ascending: true })),
  );
  if (actualInstallmentError) return { error: actualInstallmentError.message, status: 500 };
  const installmentsByOrder = new Map();
  const installmentById = new Map();
  for (const row of actualInstallments || []) {
    if (!installmentsByOrder.has(row.salesOrderId)) installmentsByOrder.set(row.salesOrderId, []);
    installmentsByOrder.get(row.salesOrderId).push(row);
    installmentById.set(row.id, row);
  }

  /* ตัดให้ตรงงวดด้วยวันไทยในโค้ด (ขอบคิวรีเป็นต้นวันไทยแล้ว ตรงนี้กันแถวที่ไม่มี approvedAt)
     ⭐ ใบรายงวดแตกเป็นแถวต่อ (ใบ, เดือนที่นับ) ก่อน แล้วคัดด้วยวัน/เดือนที่นับงวด (reportActualRows) — ใบทั้งใบผ่านตัวคัดเดิม
     ⭐ ใบค่าสรรพสามิต / ใบไม่นับ Actual ผ่านตัวคัดเดียวกัน (วันอนุมัติใบ) แล้วแยกออกเป็นก้อนที่ไม่นับ — ก้อนที่นับเหลือ
        ออบเจกต์เดิม ลำดับเดิม ⇒ แถวยอด/orders[] ของใบปกติเท่าเดิมทุกไบต์ */
  const actualRows = reportActualRows([...(orders || []), ...(exciseOrders || [])], {
    installmentsOf: (o) => installmentsByOrder.get(o.id) || [],
    keep: (o) => {
      const day = reportOrderDay(o);
      return Boolean(day && day >= window.firstDay && day <= window.lastDay && slot.has(orderMonth(o)));
    },
  });
  const inAxis = actualRows.filter((o) => !isUncountedReportRow(o));
  // เดือนนำ (ไว้คิดทบยอด) เข้าแถวยอด แต่ไม่เข้ารายการใบของงวดที่โชว์
  const inShown = inAxis.filter((o) => shown.has(orderMonth(o)));
  const uncountedShown = actualRows.filter((o) => isUncountedReportRow(o) && shown.has(orderMonth(o)));

  /* ทีม/สาย/ประเภทดีลของใบค่าสรรพสามิต = ดีลของ SO ต้นทาง — เติมเป็น `sourceDeal` (ไม่ใช่ `deal` · กติกาเดียวกับ lib/scopedRow)
     ⚠️ ลิสต์ id โตตามจำนวนใบค่าสรรพสามิตในงวด ⇒ ซอยด้วย fetchInChunks (PostgREST 16 KB) · หาต้นทางไม่เจอ = ทีมว่าง
     (loadSourceDeals ของ scopedRow ไม่มี line/dealType — คอลัมน์ประเภทธุรกิจ/ประเภทดีลต้องใช้) */
  const { data: sourceOrders, error: sourceError } = await fetchInChunks(
    uncountedShown.filter((o) => o.excise).map((o) => o.sourceSalesOrderId),
    (chunk) => fetchAllResult(() => supabase
      .from('sales_orders')
      .select('id, deal:sales_deals(id, team, line, "dealType")')
      .in('id', chunk)
      .order('id', { ascending: true })),
  );
  if (sourceError) return { error: sourceError.message, status: 500 };
  const sourceDealById = new Map((sourceOrders || []).map((row) => [row.id, row.deal || null]));
  const uncountedRows = uncountedShown.map((o) => (o.excise
    ? { ...o, sourceDeal: sourceDealById.get(o.sourceSalesOrderId) || null }
    : o));

  // จำนวนบรรทัดต่อใบ — บอกว่ากดเข้าไปดูในใบแล้วจะเจอกี่รายการ (รายการจริงอยู่ในใบ)
  const ids = inShown.map((o) => o.id);
  // ใบที่โชว์แต่ไม่นับ (อนุมัติในงวดเหมือนกัน) ได้จำนวนบรรทัด + ยอดเก็บจริงจากสองคำถามเดียวกัน
  const listedIds = [...ids, ...uncountedRows.map((o) => o.id)];
  const { data: lines, error: lineError } = await fetchInChunks(listedIds, (chunk) => fetchAllResult(() => supabase
    .from('sales_order_lines').select('"salesOrderId"').in('salesOrderId', chunk)
    .order('salesOrderId', { ascending: true }).order('id', { ascending: true })));
  if (lineError) return { error: lineError.message, status: 500 };
  const lineCount = new Map();
  for (const line of lines || []) {
    lineCount.set(line.salesOrderId, (lineCount.get(line.salesOrderId) || 0) + 1);
  }

  /* งวดชำระของใบในงวดที่โชว์ — ยอดเก็บจริง (confirmed) + ที่รอบัญชีรับรอง (reported)
     เฉพาะงวดที่ยอดหยุดแล้ว (`frozenAt` · B-4 mig 0259) เหมือนทะเบียนการชำระ ⇒ ตัวเลขตรงกับหน้า /finance */
  const { data: installments, error: installmentError } = await fetchInChunks(listedIds, (chunk) => fetchAllResult(() => supabase
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
      .select('id, "orderNumber", "quotationId", "dealId", "projectId", "customerName", "customerId", status, "submittedAt", "vatAmount", "totalAmount", "actualAmount", metadata'))
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

  // ประเภทธุรกิจของใบรออนุมัติ — ตัวกลางเดียวกับใบอนุมัติแล้ว (สายของดีลของใบ)
  const pendingDealById = new Map((pendingDeals || []).map((d) => [d.id, d]));
  /* ⭐ งวดที่ยื่นแล้วรอ AE Sup ของใบ "Actual รายงวด" (mig 0412 · มติข้อ 5) อยู่ในส่วนรออนุมัติด้วย — ใบที่อนุมัติแล้ว
     ทุกใบอยู่ในก้อน `orders` เมื่องวดคลุมวันนี้ (คิวรีโหลดใบรายงวดทุกใบที่อนุมัติก่อนสิ้นงวด) · แนบงวดให้นับจำนวนงวดได้ */
  const pendingApproval = reportPendingApproval({
    orders: (pendingOrders || []).map((o) => ({ ...o, line: orderBusinessLineOf({ ...o, deal: pendingDealById.get(o.dealId) || null }) })),
    deals: pendingDeals,
    installmentOrders: installmentOrders.map((o) => ({
      ...o,
      line: orderBusinessLineOf(o),
      installments: installmentsByOrder.get(o.id) || [],
    })),
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
    orders: inShown.map((o) => shapeOrder(o, { person, lineCount, payments, installmentById })),
    // ⭐ โชว์ในรายการใบ (ยอดที่นับ 0 + ป้าย) แต่ไม่อยู่ในตัวเลขไหนเลย — ดูหัวไฟล์ (มติเจ้าของ 20/11 · mig 0439)
    uncountedOrders: uncountedRows.map((o) => shapeOrder(o, { person, lineCount, payments, installmentById })),
    byDay,
    historyDropped,
    generatedAt: now.toISOString(),
  };
}
