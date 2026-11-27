import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, normalizeRole, userTeams } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { genId } from '@/lib/id';
import { businessDate } from '@/lib/businessDate';
import { fmtMoney } from '@/lib/format';
import { planTargetTransfer, nextMonthKey, transferTeam } from '@/lib/usersTransfer';
import { validateTargetSplit } from '@/lib/sales/handover';
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

// POST /api/users/[id]/transfer — แบ่งเป้ารายเดือนที่เหลือของคนออกให้หลายคน (มติเจ้าของ 27/11/2026 ข้อ 5)
// body: { split: [{ sourceId, toUserId, amount }] }
//
// ⭐ ดีล/ลีดไม่ได้โอนที่นี่แล้ว — ย้ายไปหน้าโอนงาน /users/:id/handover ซึ่งเลือกคนรับทีละใบผ่าน
//    /api/sales-planning/handover (เดิมปุ่มนี้ยกดีลเปิดทั้งหมดให้คนเดียวในคลิกเดียว)
// นโยบายพนักงานเข้า-ออก (EMPLOYEE_TURNOVER_GUIDE.md):
//   - เป้าเฉพาะเดือนถัดไปเป็นต้นไป — เดือนเก่า + เดือนนี้ไม่แตะ
//   - ผลรวมของแต่ละแถวต้นทาง (เดือน × ทีม) ต้องเท่าเป้าเดิมพอดี (validateTargetSplit)
//   - ต้นทางตั้ง 0 + โน้ตบอกปลายทาง (แถว ghost ในหน้าวางเป้าหายเพราะโชว์เฉพาะ > 0)
//   - ทีมของเป้าที่รับ = ทีมเดิมของแถวถ้าคนรับอยู่ทีมนั้น ไม่งั้นทีมหลักของคนรับ (transferTeam)
export async function POST(request, { params }) {
  const actor = await getCurrentUser();
  if (!can(actor?.role, 'users:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id: fromId } = await params;
  const body = await request.json().catch(() => ({}));
  const split = Array.isArray(body.split) ? body.split : null;
  if (!split) {
    return Response.json({ error: 'ส่งการแบ่งเป้ามาเป็นรายการ { sourceId, toUserId, amount } — ดีล/ลีดโอนที่หน้าโอนงาน' }, { status: 400 });
  }
  if (split.some((item) => String(item?.toUserId || '') === String(fromId))) {
    return Response.json({ error: 'คนรับเป้าต้องเป็นคนละคนกับต้นทาง' }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const fromPeriod = nextMonthKey();

  const { data: fromRes, error: fromErr } = await supabase.auth.admin.getUserById(fromId);
  if (fromErr || !fromRes?.user) return Response.json({ error: 'ไม่พบผู้ใช้ต้นทาง' }, { status: 404 });
  const fromName = fromRes.user.user_metadata?.name || fromRes.user.email || fromId;

  const { data: fromRowsRaw, error: tErr } = await supabase
    .from('sales_targets')
    .select('id, period, team, targetAmount')
    .eq('ownerId', fromId)
    .eq('periodType', 'month')
    .gte('period', fromPeriod);
  if (tErr) return Response.json({ error: `อ่านเป้าไม่สำเร็จ: ${tErr.message}` }, { status: 500 });
  const fromRows = (fromRowsRaw || []).filter((row) => Number(row.targetAmount || 0) > 0);
  if (!fromRows.length) return Response.json({ error: 'ไม่มีเป้าตั้งแต่เดือนถัดไปให้โอนแล้ว' }, { status: 409 });

  const checked = validateTargetSplit(fromRows, split);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });

  /* คนรับ — บัญชีใช้งานอยู่และมีบทบาท (กติกาเดิมของปุ่มโอนงาน) */
  const receiverIds = [...new Set([...checked.bySource.values()].flat().map((x) => x.toUserId))];
  const receivers = new Map();
  for (const toUserId of receiverIds) {
    const { data: toRes, error: toErr } = await supabase.auth.admin.getUserById(toUserId);
    const toUser = toRes?.user;
    if (toErr || !toUser) return Response.json({ error: 'ไม่พบผู้รับเป้า' }, { status: 404 });
    const toRole = normalizeRole(toUser.app_metadata?.role) || null;
    const toDisabled = !!toUser.banned_until && new Date(toUser.banned_until) > new Date();
    const toName = toUser.user_metadata?.name || toUser.email || toUserId;
    if (!toRole || toRole === 'user' || toDisabled) {
      return Response.json({ error: `${toName} ไม่ใช่บัญชีที่ใช้งานอยู่และมีบทบาท — เลือกคนรับเป้าใหม่` }, { status: 400 });
    }
    receivers.set(toUserId, { id: toUserId, name: toName, team: toUser.app_metadata?.team || null, teams: userTeams(toUser.app_metadata) });
  }

  const now = new Date().toISOString();
  const sourceById = new Map(fromRows.map((row) => [String(row.id), row]));
  const moved = [];
  for (const receiver of receivers.values()) {
    /* แถวสมมติของคนรับคนนี้ = ยอดที่แบ่งให้เขาจากแต่ละแถวต้นทาง แล้วใช้ตัววางแผนเดิม (รวมกับแถวที่เขามีอยู่แล้ว) */
    const mine = [];
    for (const [sourceId, parts] of checked.bySource) {
      const amount = parts.filter((x) => x.toUserId === receiver.id).reduce((s, x) => s + x.amount, 0);
      if (amount > 0) mine.push({ ...sourceById.get(sourceId), targetAmount: amount });
    }
    if (!mine.length) continue;
    const periods = [...new Set(mine.map((r) => r.period))];
    /* 🔴 เป้าที่ปลายทาง **มีอยู่แล้ว** — อ่านไม่ได้แล้วถือว่าว่าง = สร้างแถวซ้ำแทนที่จะรวมยอด */
    const { data: toRows, error: toRowsError } = await supabase
      .from('sales_targets')
      .select('id, period, team, targetAmount')
      .eq('ownerId', receiver.id)
      .eq('periodType', 'month')
      .in('period', periods);
    if (toRowsError) return Response.json({ error: `อ่านเป้าของ ${receiver.name} ไม่สำเร็จ: ${toRowsError.message}` }, { status: 500 });
    const plan = planTargetTransfer(mine, toRows || [], receiver);
    for (const item of plan.add) {
      if (item.existingId) {
        const { error } = await supabase.from('sales_targets')
          .update({ targetAmount: item.amount, updatedAt: now })
          .eq('id', item.existingId);
        if (error) return Response.json({ error: `โยกเป้า ${item.period} ให้ ${receiver.name} ไม่สำเร็จ: ${error.message}` }, { status: 500 });
      } else {
        const { error } = await supabase.from('sales_targets').insert({
          id: genId('TGT'),
          period: item.period,
          periodType: 'month',
          targetMonth: item.period,
          team: item.team,
          ownerId: receiver.id,
          ownerName: receiver.name,
          targetAmount: item.amount,
          notes: `รับโอนจาก ${fromName}`,
          createdBy: actor.id || null,
        });
        if (error) return Response.json({ error: `โยกเป้า ${item.period} ให้ ${receiver.name} ไม่สำเร็จ: ${error.message}` }, { status: 500 });
      }
    }
    moved.push({ id: receiver.id, name: receiver.name, rows: mine.map((r) => ({ period: r.period, team: transferTeam(receiver, r.team), amount: r.targetAmount })) });
  }

  const zeroIds = fromRows.map((row) => row.id);
  const names = moved.map((m) => m.name).join(', ');
  const { error: zeroError } = await supabase.from('sales_targets')
    .update({ targetAmount: 0, notes: `โอนให้ ${names} (${businessDate(now)})`, updatedAt: now })
    .in('id', zeroIds);
  if (zeroError) return Response.json({ error: `ล้างเป้าต้นทางไม่สำเร็จ: ${zeroError.message}` }, { status: 500 });

  const total = fromRows.reduce((s, r) => s + Number(r.targetAmount || 0), 0);
  await recordAudit({
    user: actor,
    action: 'update',
    entityType: 'user',
    entityId: fromId,
    before: { targets: fromRows },
    after: { targetsSplitTo: moved, fromPeriod },
    summary: `แบ่งเป้าของ ${fromName} ตั้งแต่ ${fromPeriod} (${fromRows.length} แถว · ${fmtMoney(total)}) ให้ ${names}`,
    request,
  });
  return Response.json({ ok: true, rows: fromRows.length, total, receivers: moved.map((m) => m.name) });
}
