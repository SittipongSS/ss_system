import { genId } from '@/lib/id';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesTarget, canViewSalesPlanning, isWonStage, monthKey, normalizeTargetPeriod, resolveTargetRowScope, toMoney, yearKey } from '@/lib/salesPlanning';
import { dealActualFromSalesOrders } from '@/lib/sales/salesOrderWorkflow';

export const dynamic = 'force-dynamic';

// Sum won deals into a { [year]: { total, byTeam, byOwner, byMonth } } shape so
// the wizard can pre-fill historical actuals for years the system already knows.
function aggregateWonDeals(deals) {
  const wonAmt = dealActualFromSalesOrders;
  const wonMonth = (d) => monthKey(d.metadata?.wonMonth) || monthKey(d.confirmedAt) || monthKey(d.metadata?.poReceivedDate) || monthKey(d.forecastMonth);
  const isWon = (d) => isWonStage(d.stage);
  const years = {};
  for (const d of deals || []) {
    if (!isWon(d)) continue;
    const mk = wonMonth(d);
    if (!mk) continue;
    const yr = mk.slice(0, 4);
    const mi = Number(mk.slice(5, 7)) - 1;
    const amt = wonAmt(d);
    const y = (years[yr] ||= { total: 0, byTeam: {}, byOwner: {}, byMonth: Array(12).fill(0) });
    y.total += amt;
    if (d.team) y.byTeam[d.team] = (y.byTeam[d.team] || 0) + amt;
    if (d.ownerId) y.byOwner[d.ownerId] = (y.byOwner[d.ownerId] || 0) + amt;
    if (mi >= 0 && mi < 12) y.byMonth[mi] += amt;
  }
  return years;
}

// GET /api/sales-planning/history?years=2568,2569,2570
// Returns saved history rows + a `systemActuals` map (from won deals) the client
// overlays as pre-fill / "source: system" hints. Superuser-scoped like targets.
//
// โหมด ?monthsOf=YYYY: คืนเฉพาะแถวรายเดือน (periodType='month') ของปีนั้น —
// ให้แท็บผลงานขาย/หน้ากรอกยอดรายเดือนใช้ โดยไม่ scan sales_deals ทั้งตาราง
// (systemActuals จำเป็นเฉพาะ wizard วางเป้า).
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const params = new URL(req.url).searchParams;

  const monthsOf = yearKey(params.get('monthsOf'));
  if (monthsOf) {
    const { data: rows, error } = await supabase
      .from('sales_history')
      .select('*')
      .eq('periodType', 'month')
      .gte('period', `${monthsOf}-01`)
      .lte('period', `${monthsOf}-12`)
      .order('period', { ascending: true });
    if (error) return fail(error.message, 500);
    return ok({ rows: rows || [] });
  }

  const yearsParam = (params.get('years') || '')
    .split(',')
    .map((y) => yearKey(y.trim()))
    .filter(Boolean);

  let query = supabase.from('sales_history').select('*').order('period', { ascending: true });
  if (yearsParam.length) query = query.in('period', yearsParam);
  const { data: rows, error } = await query;
  if (error) return fail(error.message, 500);

  // ⚠️ ไล่ทีละหน้า — `aggregateWonDeals` รวมยอดจากดีลทุกใบ โดนตัดที่ 1,000 เมื่อไร
  // ยอด Actual ต่ำกว่าจริงเงียบ ๆ แล้วไปโผล่เป็นตัวเลขใบ้ใต้ช่องกรอกของทั้งตาราง
  const { data: deals, error: dealsErr } = await fetchAllResult(() => supabase
    .from('sales_deals').select('*').order('id', { ascending: true }));
  if (dealsErr) return fail(dealsErr.message, 500);

  return ok({ rows: rows || [], systemActuals: aggregateWonDeals(deals) });
});

// POST /api/sales-planning/history — bulk upsert history rows (one per org node).
// Superuser only (same gate as targets). Matched on (period, periodType, team,
// ownerId); existing rows updated in place. targetAmount/actualAmount are the
// past figures being recorded.
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesTarget(user)) return forbidden();

  const body = await req.json();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return badRequest('ไม่มีรายการประวัติ');
  /* หน้ากรอกยอดย้อนหลังส่งได้ทั้งตารางในครั้งเดียว: (1 บริษัท + 3 ทีม + N คน) × 13 งวด
     — ทีมขาย 12 คนก็ทะลุ 200 แล้ว · ขยับเพดานให้พอกับทีมขนาดจริง (ราว 60 แถว)
     ยังต้องมีเพดานอยู่เพราะแต่ละ item = upsert แบบ sequential */
  if (items.length > 800) return badRequest('รายการมากเกินไป');

  const results = [];
  for (const item of items) {
    // แถวรายปีใช้คีย์ 'YYYY', รายเดือน 'YYYY-MM' — เดิมใช้ yearKey ทื่อ ๆ ซึ่งตัด
    // '2025-01' เหลือ '2025' เงียบ ๆ ทั้งที่ periodType เป็น month (บั๊ก แก้ 2026-07-18).
    // ไม่ส่ง periodType = year เหมือนพฤติกรรม API เดิม (helper กลาง default เป็น month)
    const normalized = normalizeTargetPeriod(item.period, item.periodType === 'month' ? 'month' : 'year');
    if (!normalized) return badRequest('ระบุงวดไม่ถูกต้อง (YYYY หรือ YYYY-MM)');
    const { period, periodType } = normalized;
    // ขอบเขตทีม — กติกาเดียวกับ targets/bulk (ดู resolveTargetRowScope)
    const scope = resolveTargetRowScope(user, item, { label: 'ประวัติ' });
    if (scope.error) {
      return scope.status === 403 ? forbidden() : badRequest(scope.error);
    }
    const { team, ownerId } = scope;

    // เขียนทับเฉพาะยอดที่ผู้เรียก "ส่งมาจริง" — ไม่ส่ง = ไม่แตะ ไม่ใช่ตั้งเป็น 0
    // (หน้ายอดขายย้อนหลังส่งแค่ actual ของแถวรายปี ถ้าเหมาว่าไม่ส่ง = 0 เป้าที่ตัวช่วย
    //  วางเป้าบันทึกไว้ในแถวเดียวกันจะถูกล้างทิ้งเงียบ ๆ)
    const hasTarget = Object.hasOwn(item, 'targetAmount');
    const hasActual = Object.hasOwn(item, 'actualAmount');
    const targetAmount = toMoney(item.targetAmount);
    const actualAmount = toMoney(item.actualAmount);
    const source = ['manual', 'system', 'mixed'].includes(item.source) ? item.source : 'manual';

    let find = supabase
      .from('sales_history')
      .select('id')
      .eq('period', period)
      .eq('periodType', periodType);
    find = team == null ? find.is('team', null) : find.eq('team', team);
    find = ownerId == null ? find.is('ownerId', null) : find.eq('ownerId', ownerId);
    const { data: existing, error: findErr } = await find.maybeSingle();
    if (findErr) return fail(findErr.message, 500);

    if (existing) {
      const patch = { source, notes: item.notes || null, updatedAt: new Date().toISOString() };
      if (hasTarget) patch.targetAmount = targetAmount;
      if (hasActual) patch.actualAmount = actualAmount;
      const { data, error } = await supabase
        .from('sales_history')
        .update(patch)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return fail(error.message, 500);
      results.push(data);
    } else {
      const row = {
        id: genId('SHIS'),
        period,
        periodType,
        team,
        ownerId,
        ownerName: ownerId ? (item.ownerName || null) : null,
        targetAmount,
        actualAmount,
        source,
        notes: item.notes || null,
        createdBy: user.id || null,
      };
      const { data, error } = await supabase.from('sales_history').insert(row).select().single();
      if (error) return fail(error.message, 500);
      results.push(data);
    }
  }

  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_history',
    entityId: results[0]?.id || 'bulk',
    after: { count: results.length },
    summary: `บันทึกประวัติยอดขาย ${results.length} รายการ`,
    request: req,
  });
  return ok(results, 201);
});
