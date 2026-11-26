import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, normalizeRole, userTeams } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { genId } from '@/lib/id';
import { businessDate } from '@/lib/businessDate';
import { CLOSED_STAGES } from '@/lib/salesPlanning';
import { planTargetTransfer, nextMonthKey, transferTeam } from '@/lib/usersTransfer';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { historicalRowsOnly } from '@/lib/sales/historicalOrders';

export const dynamic = 'force-dynamic';

/* ── ดีลของใบสั่งขายย้อนหลังที่คนต้นทางยังถือ (คำตอบข้อ 4 · mig 0360) ──────────────────
   ⭐ ปุ่มนี้ **ไม่ย้าย** ดีลภาชนะ — ดีล Won อยู่นอกเงื่อนไข "ดีลเปิด" อยู่แล้ว และการย้ายต้องดูทีละใบว่า
     คนรับมีดีลภาชนะของลูกค้ารายเดียวกันหรือยัง (UNIQUE ลูกค้า × AE · P1 ไม่รวมดีล)
   ⇒ พรีวิว (GET) และผลลัพธ์ (POST) บอกจำนวนที่ยังค้าง · AE Supervisor/Admin ย้ายเจ้าของทีละใบ
     ผ่าน PATCH /api/sales-planning/deals/:id `{ ownerId }` */
function historicalDealsOwnedBy(supabase, ownerId) {
  return fetchAllResult(() => historicalRowsOnly(supabase.from('sales_deals').select('id, code, title, "customerName"')
    .eq('ownerId', ownerId)).order('id', { ascending: true }));
}
const dealBrief = ({ id, code, title, customerName }) => ({ id, code: code || null, title: title || null, customerName: customerName || null });

// GET /api/users/[id]/transfer — พรีวิวก่อนโอน: ดีลของใบสั่งขายย้อนหลังที่ต้องย้ายเจ้าของทีละใบ
export async function GET(request, { params }) {
  const actor = await getCurrentUser();
  if (!can(actor?.role, 'users:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id: fromId } = await params;
  const { data, error } = await historicalDealsOwnedBy(getSupabaseAdmin(), fromId);
  if (error) {
    return Response.json({ error: `นับดีลของใบสั่งขายย้อนหลังไม่สำเร็จ: ${error.message}` }, { status: 500 });
  }
  return Response.json({ historicalDeals: data.length, historicalDealList: data.map(dealBrief) });
}

// POST /api/users/[id]/transfer — โอนงานพนักงาน (offboarding) ในคลิกเดียว
// body: { toUserId, transferDeals=true, transferTargets=true, fromPeriod='YYYY-MM' }
//
// นโยบายพนักงานเข้า-ออก (ดู EMPLOYEE_TURNOVER_GUIDE.md):
//   - ดีลเปิด (ยังไม่ won/lost) → เปลี่ยนผู้ดูแลเป็นคนรับ · ทีมคงเดิมถ้าคนรับอยู่ทีมนั้น ไม่งั้นทีมหลักคนรับ — FC ย้ายตาม
//   - ดีล won/lost ไม่แตะ — AT อยู่กับคนปิดจริง ประวัติไม่เพี้ยน
//   - เป้า (TG) โยกเฉพาะ period >= fromPeriod (default เดือนถัดไป) —
//     เดือนเก่าไม่โยก; ต้นทางตั้ง 0 (แถว ghost ในวางเป้าจะหายเพราะโชว์เฉพาะ >0)
export async function POST(request, { params }) {
  const actor = await getCurrentUser();
  if (!can(actor?.role, 'users:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id: fromId } = await params;
  const body = await request.json().catch(() => ({}));
  const toUserId = body.toUserId;
  if (!toUserId) return Response.json({ error: 'ต้องระบุผู้รับโอน (toUserId)' }, { status: 400 });
  if (toUserId === fromId) return Response.json({ error: 'ผู้รับโอนต้องเป็นคนละคนกับต้นทาง' }, { status: 400 });

  const transferDeals = body.transferDeals !== false;
  const transferTargets = body.transferTargets !== false;
  const fromPeriod = /^\d{4}-\d{2}$/.test(body.fromPeriod || '') ? body.fromPeriod : nextMonthKey();

  const supabase = getSupabaseAdmin();
  const [{ data: fromRes, error: fromErr }, { data: toRes, error: toErr }] = await Promise.all([
    supabase.auth.admin.getUserById(fromId),
    supabase.auth.admin.getUserById(toUserId),
  ]);
  if (fromErr || !fromRes?.user) return Response.json({ error: 'ไม่พบผู้ใช้ต้นทาง' }, { status: 404 });
  if (toErr || !toRes?.user) return Response.json({ error: 'ไม่พบผู้รับโอน' }, { status: 404 });

  const toUser = toRes.user;
  const toRole = normalizeRole(toUser.app_metadata?.role) || null;
  const toDisabled = !!toUser.banned_until && new Date(toUser.banned_until) > new Date();
  if (!toRole || toRole === 'user' || toDisabled) {
    return Response.json({ error: 'ผู้รับโอนต้องเป็นบัญชีที่ใช้งานอยู่และมีบทบาทแล้ว' }, { status: 400 });
  }
  const fromName = fromRes.user.user_metadata?.name || fromRes.user.email || fromId;
  const toName = toUser.user_metadata?.name || toUser.email || toUserId;
  const toTeam = toUser.app_metadata?.team || null;
  /* คนรับอยู่ได้หลายทีม — งานที่โอนไปคงทีมเดิมถ้าคนรับอยู่ทีมนั้น (transferTeam) · ไม่งั้นลงทีมหลักของคนรับ
     🐞 ตรวจบัญชีสองทีม 26/11/2026: เดิมประทับ `toTeam` ทับทุกแถว ⇒ ดีล/เป้า SV ที่โอนให้ AE ODM+SV
     (ทีมหลัก ODM) ย้ายเข้า ODM ทั้งก้อน แล้วหัวหน้าทีม SV มองไม่เห็นดีลที่ทีมตัวเองถืออยู่ */
  const toWho = { id: toUserId, team: toTeam, teams: userTeams(toUser.app_metadata) };
  const now = new Date().toISOString();

  const result = { deals: 0, targetMonths: 0, targetAmount: 0, fromPeriod };

  // ── ดีลเปิด: เปลี่ยนผู้ดูแล + ทีม (FC เดือนปัจจุบัน/อนาคตย้ายตามในแดชบอร์ดทันที) ──
  let movedDeals = [];
  if (transferDeals) {
    /* อ่านก่อนแล้วเขียนเป็นกลุ่มตามทีมปลายทาง — ทีมของแต่ละใบขึ้นกับทีมเดิมของใบ (คำสั่ง update ก้อนเดียว
       ประทับทีมเดียวทับทุกใบไม่ได้แล้ว) · เงื่อนไข ownerId + ดีลเปิด ซ้ำในคำสั่งเขียนด้วย กันใบที่เพิ่งปิด/ย้ายระหว่างทาง */
    const { data: openDeals, error: readError } = await fetchAllResult(() => supabase
      .from('sales_deals')
      .select('id, title, stage, team')
      .eq('ownerId', fromId)
      // เฉพาะดีลที่ยังเปิด — สร้างจากนิยามกลางเพื่อไม่ให้ลิสต์ในสตริง SQL เพี้ยนจากที่อื่น
      .not('stage', 'in', `(${CLOSED_STAGES.join(',')})`)
      .order('id', { ascending: true }));
    if (readError) return Response.json({ error: `อ่านดีลที่ต้องโอนไม่สำเร็จ: ${readError.message}` }, { status: 500 });
    const idsByTeam = new Map();
    for (const deal of openDeals || []) {
      const team = transferTeam(toWho, deal.team);
      idsByTeam.set(team, [...(idsByTeam.get(team) || []), deal.id]);
    }
    /* ทีละ 200 ใบ — ลิสต์ id ใน `.in()` โตตามจำนวนดีลของคนออก (เพดาน URL ของ PostgREST ~16 KB) */
    const CHUNK = 200;
    for (const [team, ids] of idsByTeam) {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await supabase
          .from('sales_deals')
          .update({ ownerId: toUserId, ownerName: toName, team, updatedAt: now })
          .in('id', ids.slice(i, i + CHUNK))
          .eq('ownerId', fromId)
          .not('stage', 'in', `(${CLOSED_STAGES.join(',')})`)
          .select('id, title, stage, team');
        if (error) return Response.json({ error: `โอนดีลไม่สำเร็จ: ${error.message}` }, { status: 500 });
        movedDeals.push(...(data || []));
      }
    }
    result.deals = movedDeals.length;
  }

  // ── เป้ารายเดือน: โยกยอดตั้งแต่ fromPeriod เข้าแถวของคนรับ (ทีมเดิมของแถวถ้าคนรับอยู่ทีมนั้น · ไม่งั้นทีมหลักคนรับ) ──
  if (transferTargets) {
    const { data: fromRows, error: tErr } = await supabase
      .from('sales_targets')
      .select('id, period, team, targetAmount')
      .eq('ownerId', fromId)
      .eq('periodType', 'month')
      .gte('period', fromPeriod);
    if (tErr) return Response.json({ error: `อ่านเป้าไม่สำเร็จ: ${tErr.message}` }, { status: 500 });

    const periods = [...new Set((fromRows || []).map((r) => r.period))];
    let toRows = [];
    if (periods.length) {
      /* 🔴 เป้าที่ปลายทาง **มีอยู่แล้ว** — อ่านไม่ได้แล้วคืน [] แปลว่า "ปลายทางว่าง"
         ⇒ ตัววางแผนสร้างแถวใหม่ทับแทนที่จะรวมยอด · เส้นนี้เขียนข้อมูลจริง */
      const { data, error } = await supabase
        .from('sales_targets')
        .select('id, period, team, targetAmount')
        .eq('ownerId', toUserId)
        .eq('periodType', 'month')
        .in('period', periods);
      if (error) throw error;
      toRows = data || [];
    }

    const plan = planTargetTransfer(fromRows || [], toRows, { ...toWho, name: toName });
    for (const item of plan.add) {
      if (item.existingId) {
        const { error } = await supabase.from('sales_targets')
          .update({ targetAmount: item.amount, updatedAt: now })
          .eq('id', item.existingId);
        if (error) return Response.json({ error: `โยกเป้า ${item.period} ไม่สำเร็จ: ${error.message}` }, { status: 500 });
      } else {
        const { error } = await supabase.from('sales_targets').insert({
          id: genId('TGT'),
          period: item.period,
          periodType: 'month',
          targetMonth: item.period,
          team: item.team,
          ownerId: toUserId,
          ownerName: toName,
          targetAmount: item.amount,
          notes: `รับโอนจาก ${fromName}`,
          createdBy: actor.id || null,
        });
        if (error) return Response.json({ error: `โยกเป้า ${item.period} ไม่สำเร็จ: ${error.message}` }, { status: 500 });
      }
      result.targetMonths += 1;
    }
    if (plan.zero.length) {
      const { error } = await supabase.from('sales_targets')
        .update({ targetAmount: 0, notes: `โอนให้ ${toName} (${businessDate(now)})`, updatedAt: now })
        .in('id', plan.zero);
      if (error) return Response.json({ error: `ล้างเป้าต้นทางไม่สำเร็จ: ${error.message}` }, { status: 500 });
    }
    result.targetAmount = (fromRows || []).reduce((s, r) => s + Number(r.targetAmount || 0), 0);
  }

  // ── ดีลของใบสั่งขายย้อนหลัง: ไม่ย้าย · นับให้เห็นว่ายังค้างกี่ใบ (อ่านพลาด = บอก ไม่ล้มการโอนที่ลงไปแล้ว) ──
  const { data: heldHistorical, error: historicalError } = await historicalDealsOwnedBy(supabase, fromId);
  result.historicalDeals = historicalError ? null : heldHistorical.length;
  result.historicalDealList = historicalError ? [] : heldHistorical.map(dealBrief);
  if (historicalError) result.historicalDealsError = `นับดีลของใบสั่งขายย้อนหลังไม่สำเร็จ: ${historicalError.message}`;

  await recordAudit({
    user: actor,
    action: 'update',
    entityType: 'user',
    entityId: fromId,
    after: {
      transferredTo: { id: toUserId, name: toName, team: toTeam },
      deals: movedDeals.map((d) => ({ id: d.id, title: d.title, stage: d.stage, team: d.team })),
      targetMonths: result.targetMonths,
      targetAmount: result.targetAmount,
      fromPeriod,
      historicalDealsToReassign: result.historicalDealList,
    },
    summary: `โอนงานจาก ${fromName} → ${toName}: ดีลเปิด ${result.deals} ใบ, เป้า ${result.targetMonths} เดือน (ตั้งแต่ ${fromPeriod})`
      + (result.historicalDeals ? ` · ดีลของใบสั่งขายย้อนหลังยังเป็นของ ${fromName} ${result.historicalDeals} ใบ (ย้ายทีละใบ)` : ''),
    request,
  });

  return Response.json({ ok: true, ...result, toName });
}
