import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesTarget } from '@/lib/salesPlanning';
import { currentMonth, isMonthValue, monthsInRange, normalizeMonthRange } from '@/lib/datePeriods';
import { loadUserDirectory } from '@/lib/usersRepo';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { reportPendingApproval } from '@/lib/sales/reportPendingApproval';
import { buildReportRows, reportOrderMonth as orderMonth, reportOrderTeam } from '@/lib/sales/reportRows';

export const dynamic = 'force-dynamic';

/* รายงานยอดขาย — ยอดรวมเทียบเป้าตามช่วงเดือน + รายการใบสั่งขายในช่วงนั้น
 *
 * ⭐ ทำไมไม่ใช้ `/api/sales-planning/dashboard` ซ้ำ (มติหลังรื้อรอบ 2026-08-26):
 * แดชบอร์ดคืนแต่ยอดรวมและถูกแคชระดับทั้งบริษัท 5 นาที — รายงานต้องการ **รายการใบ**
 * ซึ่งไม่มีอยู่ในนั้นเลย และต้องการเลขที่ตรงกับที่บัญชีเห็น ณ วินาทีที่เปิด
 * ⇒ รายงานถามฐานข้อมูลเอง ตรง ๆ · ไม่แตะแดชบอร์ด ไม่แตะแท็บผลงานขาย
 *
 * 🔒 เปิดให้ `salesplan:target` เท่านั้น (หัวหน้าฝ่ายขาย + admin — มติผู้ใช้)
 * เพราะรายงานนี้กางยอดรายคนทั้งฝ่ายไว้ในหน้าเดียว ต่างจากแท็บผลงานขายที่เปิดกว้างกว่า
 *
 * ⚠️ "ของใคร" อ่านจาก `sales_orders."ownerId"` ที่ **แช่ไว้ตอนอนุมัติ** (mig 0292)
 * ไม่ใช่เจ้าของดีลปัจจุบัน — ไม่งั้นย้ายดีลแล้วยอดของเดือนที่จ่ายคอมไปแล้วย้ายตาม
 * ⭐ "ทีมไหน" = **ทีมตามดีล** (มติผู้ใช้ 2026-09-14): sales_deals.team ของดีลของใบ ·
 * sales_targets.team ของเป้า · sales_history.team ของยอดกรอกมือ — ไม่อ่านทีมจากบัญชีเจ้าของ
 * ⇒ คนย้ายทีม ยอดเก่าไม่ย้ายตาม · คนที่มียอดหลายทีมได้แถวละทีม · กติกาแถวอยู่ที่ lib/sales/reportRows
 *
 * ⭐ ใบ **รออนุมัติ** (มติผู้ใช้ 2026-09-11 · mig 0353) คืนเป็นช่อง `pendingApproval` แยก
 * ไม่ปนเข้า actual[] / orders[] · ลงเดือนปัจจุบันเวลาไทยเสมอ · ของเจ้าของดีล *ปัจจุบัน*
 * (ใบยังไม่ถูกแช่เจ้าของจนกว่าจะอนุมัติ) ทีมตามดีล — กติกาทั้งหมดอยู่ที่ lib/sales/reportPendingApproval
 */

const money = (v) => Number(v || 0);

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesTarget(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const range = normalizeMonthRange({ from: params.get('from'), to: params.get('to') });
  if (!range) return badRequest('ต้องระบุช่วงเป็นงวดเดือน YYYY-MM ทั้งสองด้าน');
  const months = monthsInRange(range.from, range.to);
  if (months.length > 60) return badRequest('ช่วงยาวเกิน 60 เดือน');

  const slot = new Map(months.map((m, i) => [m, i]));

  /* ── เป้า ────────────────────────────────────────────────────────────
     แถวเป้ามีสามระดับในตารางเดียว: บริษัท (team null) · ทีม (ownerId null) · รายคน
     ห้ามบวกรวมข้ามระดับ — เป้าระดับทีมไม่ได้เป็นผลรวมของรายคนเสมอไป */
  const { data: targets, error: targetError } = await supabase
    .from('sales_targets')
    .select('period, periodType, team, "ownerId", "targetAmount"')
    .eq('periodType', 'month')
    .gte('period', range.from)
    .lte('period', range.to);
  if (targetError) return fail(targetError.message, 500);

  /* ── ใบสั่งขายที่อนุมัติแล้ว ─────────────────────────────────────────
     กรองด้วย approvedAt กว้างไว้ก่อน (ขอบวันไทยกับ UTC ต่างกัน 7 ชม.) แล้วค่อยตัด
     ให้ตรงงวดด้วย businessMonthKey ในโค้ด — กันใบที่อนุมัติหัวค่ำวันสิ้นเดือนหลุดงวด
     ⭐ ทีมของยอด = `deal:sales_deals(team)` — embed ในคิวรีเดียวกัน (FK เดียว 0107 · service role
        ไม่โดน RLS) ⚠️ ห้ามแยกไปถาม `.in('id', dealIds)` — ลิสต์โตตามจำนวนใบ ชนเพดาน URL 16 KB */
  const guardFrom = `${range.from}-01T00:00:00+07:00`;
  const [y, m] = range.to.split('-').map(Number);
  const guardUntil = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01T00:00:00+07:00`;
  const { data: orders, error: orderError } = await fetchAllResult(() => supabase
    .from('sales_orders')
    .select('id, "orderNumber", "quotationId", "dealId", "customerName", "customerId", "orderDate", "approvedAt", "ownerId", "ownerName", subtotal, "discountAmount", "vatAmount", "totalAmount", "actualAmount", "financeStatus", metadata, deal:sales_deals(team)')
    .eq('status', 'approved')
    .gte('approvedAt', guardFrom)
    .lt('approvedAt', guardUntil)
    .order('approvedAt', { ascending: true })
    .order('id', { ascending: true }));
  if (orderError) return fail(orderError.message, 500);

  const inRange = (orders || []).filter((o) => slot.has(orderMonth(o)));

  // จำนวนบรรทัดต่อใบ — บอกว่ากดเข้าไปดูในใบแล้วจะเจอกี่รายการ (รายการจริงอยู่ในใบ)
  const ids = inRange.map((o) => o.id);
  const { data: lines, error: lineError } = await fetchInChunks(ids, (chunk) => fetchAllResult(() => supabase
    .from('sales_order_lines').select('"salesOrderId"').in('salesOrderId', chunk)
    .order('salesOrderId', { ascending: true }).order('id', { ascending: true })));
  if (lineError) return fail(lineError.message, 500);
  const lineCount = new Map();
  for (const line of lines || []) {
    lineCount.set(line.salesOrderId, (lineCount.get(line.salesOrderId) || 0) + 1);
  }

  /* ── ใบสั่งขายที่รออนุมัติ (มติผู้ใช้ 2026-09-11 · mig 0353) ──────────────────
     โชว์แยกจากขายจริง — ยอดของมันลง **เดือนปัจจุบัน (เวลาไทย) เสมอ** ไม่ใช่เดือนในใบ
     ⇒ ช่วงที่ไม่มีเดือนนี้ไม่ต้องถามฐานเลย (เดือนที่ปิดแล้ว/ปีก่อนไม่มีวันเห็นยอดนี้)
     ไม่มีตัวกรอง approvedAt เพราะ "รออนุมัติ" เป็นสถานะ ณ ตอนนี้ ไม่ใช่เหตุการณ์ในช่วง
     ⚠️ ห้ามต่อ id ของใบพวกนี้เข้า `.in('salesOrderId', ids)` ข้างบน — ก้อนนั้นไม่ได้ซอย
        (เพดาน URL 16 KB) และจำนวนบรรทัดของใบรออนุมัติไม่มีจอไหนใช้ */
  const now = new Date();
  const { data: pendingOrders, error: pendingError } = slot.has(currentMonth(now))
    ? await fetchAllResult(() => supabase
      .from('sales_orders')
      .select('id, "orderNumber", "quotationId", "dealId", "customerName", "customerId", status, "submittedAt", "vatAmount", "totalAmount", "actualAmount", metadata')
      .eq('status', 'pending_approval')
      .order('id', { ascending: true }))
    : { data: [], error: null };
  if (pendingError) return fail(pendingError.message, 500);

  /* เจ้าของดีล **ปัจจุบัน** + ทีมของดีล — `sales_orders."ownerId"` ยังว่างจนกว่าจะอนุมัติ (แช่ตอนอนุมัติ ·
     mig 0294) ห้ามเดาจากใบ · stage ไว้กรอง "นับเฉพาะดีล Won" ให้ตรงกับแดชบอร์ด
     ลิสต์ id โตตามจำนวนใบที่ค้าง ⇒ ซอยด้วย fetchInChunks ตั้งแต่วันแรก */
  const { data: pendingDeals, error: pendingDealError } = await fetchInChunks(
    (pendingOrders || []).map((o) => o.dealId),
    (chunk) => fetchAllResult(() => supabase
      .from('sales_deals')
      .select('id, stage, team, "ownerId", "ownerName"')
      .in('id', chunk)
      .order('id', { ascending: true })),
  );
  if (pendingDealError) return fail(pendingDealError.message, 500);

  /* ── ยอดที่กรอกย้อนหลัง ──────────────────────────────────────────────
     เดือนที่มีแถวนี้ = ยอดมาจากการกรอกมือ **ทับ** ยอดจากใบ (กติกาเดียวกับแท็บผลงานขาย)
     ⇒ เดือนพวกนั้นไม่มีใบให้ไล่ดู ต้องบอกในรายงาน ไม่ใช่ปล่อยให้ตัวเลขลอย */
  const { data: history, error: historyError } = await supabase
    .from('sales_history')
    .select('period, team, "ownerId", "actualAmount"')
    .eq('periodType', 'month')
    .gte('period', range.from)
    .lte('period', range.to);
  if (historyError) return fail(historyError.message, 500);

  // ชื่อจากบัญชีปัจจุบัน — ป้ายบนจอต้องเป็นชื่อวันนี้ · ⛔ ทีมในบัญชีห้ามใช้จัดยอด (ทีมตามดีล)
  const directory = await loadUserDirectory(supabase);
  const person = (id) => directory.get(id) || null;

  // บริษัท / ทีม / รายคน — กติกาทั้งหมดอยู่ที่ lib/sales/reportRows (เทสต์ได้)
  const { company, teams, people } = buildReportRows({
    months,
    targets,
    orders: inRange,
    history,
    person,
  });

  /* ยอดรออนุมัติ — ก้อนแยก ไม่เคยแตะแถวข้างบน (actual[] / history[] / แถวทีมที่รวมจากสมาชิก)
     ⇒ ขายจริง ทบยอด % ส่วนต่าง และแถบเตือนยอดบริษัทไม่ตรงรายคน เท่าเดิมทุกตัวเลข */
  const pendingApproval = reportPendingApproval({
    orders: pendingOrders,
    deals: pendingDeals,
    months,
    person,
    now,
  });

  return ok({
    range,
    months,
    company,
    teams,
    people,
    pendingApproval,
    orders: inRange.map((o) => ({
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
      month: orderMonth(o),
      approvedAt: o.approvedAt,
      lineCount: lineCount.get(o.id) || 0,
      // ยอดที่รายงานนับ = actualAmount (= totalAmount − vatAmount) · อีกสองตัวไว้กระทบยอดกับบัญชี
      amount: money(o.actualAmount),
      vatAmount: money(o.vatAmount),
      totalAmount: money(o.totalAmount),
      discountAmount: money(o.discountAmount),
      // ใบที่ส่วนลดท้ายใบเต็มจำนวน (งานที่ไม่คิดเงิน) — ต้องขึ้นครบทุกใบ ห้ามกรองทิ้ง
      free: money(o.actualAmount) === 0,
      financeStatus: o.financeStatus || null,
    })),
  });
});
