import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesTarget } from '@/lib/salesPlanning';
import { businessMonthKey, isMonthValue, monthsInRange, normalizeMonthRange } from '@/lib/datePeriods';
import { loadUserDirectory } from '@/lib/usersRepo';
import { fetchAllResult } from '@/lib/supabaseFetchAll';

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
 */

const money = (v) => Number(v || 0);

/** งวดของยอด = เดือนที่หัวหน้าอนุมัติใบ ตามเวลาไทย (กติกาเดียวกับ mig 0279)
 *  ถอยไป orderDate เฉพาะแถวเก่าที่ไม่มี approvedAt */
const orderMonth = (order) => businessMonthKey(order.approvedAt)
  || (order.orderDate ? String(order.orderDate).slice(0, 7) : null);

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesTarget(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const range = normalizeMonthRange({ from: params.get('from'), to: params.get('to') });
  if (!range) return badRequest('ต้องระบุช่วงเป็นงวดเดือน YYYY-MM ทั้งสองด้าน');
  const months = monthsInRange(range.from, range.to);
  if (months.length > 60) return badRequest('ช่วงยาวเกิน 60 เดือน');

  const slot = new Map(months.map((m, i) => [m, i]));
  const zeros = () => Array(months.length).fill(0);

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
     ให้ตรงงวดด้วย businessMonthKey ในโค้ด — กันใบที่อนุมัติหัวค่ำวันสิ้นเดือนหลุดงวด */
  const guardFrom = `${range.from}-01T00:00:00+07:00`;
  const [y, m] = range.to.split('-').map(Number);
  const guardUntil = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01T00:00:00+07:00`;
  const { data: orders, error: orderError } = await fetchAllResult(() => supabase
    .from('sales_orders')
    .select('id, "orderNumber", "quotationId", "dealId", "customerName", "customerId", "orderDate", "approvedAt", "ownerId", "ownerName", subtotal, "discountAmount", "vatAmount", "totalAmount", "actualAmount", "financeStatus", metadata')
    .eq('status', 'approved')
    .gte('approvedAt', guardFrom)
    .lt('approvedAt', guardUntil)
    .order('approvedAt', { ascending: true })
    .order('id', { ascending: true }));
  if (orderError) return fail(orderError.message, 500);

  const inRange = (orders || []).filter((o) => slot.has(orderMonth(o)));

  // จำนวนบรรทัดต่อใบ — บอกว่ากดเข้าไปดูในใบแล้วจะเจอกี่รายการ (รายการจริงอยู่ในใบ)
  const ids = inRange.map((o) => o.id);
  const { data: lines, error: lineError } = ids.length
    ? await supabase.from('sales_order_lines').select('"salesOrderId"').in('salesOrderId', ids)
    : { data: [], error: null };
  if (lineError) return fail(lineError.message, 500);
  const lineCount = new Map();
  for (const line of lines || []) {
    lineCount.set(line.salesOrderId, (lineCount.get(line.salesOrderId) || 0) + 1);
  }

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

  // ชื่อ/ทีมจากบัญชีปัจจุบัน — ป้ายบนจอต้องเป็นชื่อวันนี้ ส่วนการ *จัดกลุ่ม* ยึด ownerId
  const directory = await loadUserDirectory(supabase);
  const person = (id) => directory.get(id) || null;

  const rows = new Map();   // key → { scope, ownerId, ownerName, team, target[], actual[], history[] }
  const rowFor = (key, seed) => {
    if (!rows.has(key)) rows.set(key, { ...seed, target: zeros(), actual: zeros(), history: zeros() });
    return rows.get(key);
  };
  const companyRow = rowFor('company', { scope: 'company', ownerId: null, ownerName: null, team: null });

  for (const t of targets || []) {
    const i = slot.get(t.period);
    if (i == null) continue;
    const amount = money(t.targetAmount);
    if (t.ownerId) {
      const p = person(t.ownerId);
      rowFor(`owner:${t.ownerId}`, {
        scope: 'owner',
        ownerId: t.ownerId,
        ownerName: p?.name || t.ownerId,
        team: p?.team || t.team || null,
      }).target[i] += amount;
    } else if (t.team) {
      rowFor(`team:${t.team}`, { scope: 'team', ownerId: null, ownerName: null, team: t.team }).target[i] += amount;
    } else {
      companyRow.target[i] += amount;
    }
  }

  for (const o of inRange) {
    const i = slot.get(orderMonth(o));
    const amount = money(o.actualAmount);
    companyRow.actual[i] += amount;
    if (!o.ownerId) continue; // ใบที่ยังไม่ถูกแช่เจ้าของ (ก่อน mig 0292) — เข้ายอดบริษัทอย่างเดียว
    const p = person(o.ownerId);
    const team = p?.team || null;
    const row = rowFor(`owner:${o.ownerId}`, {
      scope: 'owner', ownerId: o.ownerId, ownerName: p?.name || o.ownerName || o.ownerId, team,
    });
    row.actual[i] += amount;
    if (team) rowFor(`team:${team}`, { scope: 'team', ownerId: null, ownerName: null, team }).actual[i] += amount;
  }

  /* ยอดกรอกมือ **ทับ** ยอดจากใบของเดือนนั้น ไม่ใช่บวกเพิ่ม — และทับทีละระดับ
     (บริษัท/ทีม/คน เป็นเส้นแยกกัน ไม่ได้บวกกันขึ้นไป กติกาเดียวกับ overlayHistory) */
  for (const h of history || []) {
    const i = slot.get(h.period);
    if (i == null) continue;
    const amount = money(h.actualAmount);
    const key = h.ownerId ? `owner:${h.ownerId}` : (h.team ? `team:${h.team}` : 'company');
    const seed = h.ownerId
      ? { scope: 'owner', ownerId: h.ownerId, ownerName: person(h.ownerId)?.name || h.ownerId, team: person(h.ownerId)?.team || h.team || null }
      : (h.team ? { scope: 'team', ownerId: null, ownerName: null, team: h.team }
        : { scope: 'company', ownerId: null, ownerName: null, team: null });
    const row = rowFor(key, seed);
    row.actual[i] = amount;
    row.history[i] = 1;
  }

  const all = [...rows.values()];
  return ok({
    range,
    months,
    company: all.find((r) => r.scope === 'company') || null,
    teams: all.filter((r) => r.scope === 'team'),
    people: all.filter((r) => r.scope === 'owner'),
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
