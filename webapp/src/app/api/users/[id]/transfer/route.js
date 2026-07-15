import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { genId } from '@/lib/id';
import { planTargetTransfer, nextMonthKey } from '@/lib/usersTransfer';

export const dynamic = 'force-dynamic';

// POST /api/users/[id]/transfer — โอนงานพนักงาน (offboarding) ในคลิกเดียว
// body: { toUserId, transferDeals=true, transferTargets=true, fromPeriod='YYYY-MM' }
//
// นโยบายพนักงานเข้า-ออก (ดู EMPLOYEE_TURNOVER_GUIDE.md):
//   - ดีลเปิด (ยังไม่ won/lost) → เปลี่ยนผู้ดูแล+ทีมเป็นคนรับ — FC ย้ายตาม
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
  const toRole = toUser.app_metadata?.role || null;
  const toDisabled = !!toUser.banned_until && new Date(toUser.banned_until) > new Date();
  if (!toRole || toRole === 'user' || toDisabled) {
    return Response.json({ error: 'ผู้รับโอนต้องเป็นบัญชีที่ใช้งานอยู่และมีบทบาทแล้ว' }, { status: 400 });
  }
  const fromName = fromRes.user.user_metadata?.name || fromRes.user.email || fromId;
  const toName = toUser.user_metadata?.name || toUser.email || toUserId;
  const toTeam = toUser.app_metadata?.team || null;
  const now = new Date().toISOString();

  const result = { deals: 0, targetMonths: 0, targetAmount: 0, fromPeriod };

  // ── ดีลเปิด: เปลี่ยนผู้ดูแล + ทีม (FC เดือนปัจจุบัน/อนาคตย้ายตามในแดชบอร์ดทันที) ──
  let movedDeals = [];
  if (transferDeals) {
    const { data, error } = await supabase
      .from('sales_deals')
      .update({ ownerId: toUserId, ownerName: toName, team: toTeam, updatedAt: now })
      .eq('ownerId', fromId)
      .not('stage', 'in', '(won,in_project,lost)')
      .select('id, title, stage');
    if (error) return Response.json({ error: `โอนดีลไม่สำเร็จ: ${error.message}` }, { status: 500 });
    movedDeals = data || [];
    result.deals = movedDeals.length;
  }

  // ── เป้ารายเดือน: โยกยอดตั้งแต่ fromPeriod เข้าแถวของคนรับ (ทีมของคนรับ) ──
  if (transferTargets) {
    const { data: fromRows, error: tErr } = await supabase
      .from('sales_targets')
      .select('id, period, targetAmount')
      .eq('ownerId', fromId)
      .eq('periodType', 'month')
      .gte('period', fromPeriod);
    if (tErr) return Response.json({ error: `อ่านเป้าไม่สำเร็จ: ${tErr.message}` }, { status: 500 });

    const periods = [...new Set((fromRows || []).map((r) => r.period))];
    let toRows = [];
    if (periods.length) {
      const { data } = await supabase
        .from('sales_targets')
        .select('id, period, targetAmount')
        .eq('ownerId', toUserId)
        .eq('periodType', 'month')
        .in('period', periods);
      toRows = data || [];
    }

    const plan = planTargetTransfer(fromRows || [], toRows, { id: toUserId, name: toName, team: toTeam });
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
          team: toTeam,
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
        .update({ targetAmount: 0, notes: `โอนให้ ${toName} (${now.slice(0, 10)})`, updatedAt: now })
        .in('id', plan.zero);
      if (error) return Response.json({ error: `ล้างเป้าต้นทางไม่สำเร็จ: ${error.message}` }, { status: 500 });
    }
    result.targetAmount = (fromRows || []).reduce((s, r) => s + Number(r.targetAmount || 0), 0);
  }

  await recordAudit({
    user: actor,
    action: 'update',
    entityType: 'user',
    entityId: fromId,
    after: {
      transferredTo: { id: toUserId, name: toName, team: toTeam },
      deals: movedDeals.map((d) => ({ id: d.id, title: d.title, stage: d.stage })),
      targetMonths: result.targetMonths,
      targetAmount: result.targetAmount,
      fromPeriod,
    },
    summary: `โอนงานจาก ${fromName} → ${toName}: ดีลเปิด ${result.deals} ใบ, เป้า ${result.targetMonths} เดือน (ตั้งแต่ ${fromPeriod})`,
    request,
  });

  return Response.json({ ok: true, ...result, toName });
}
