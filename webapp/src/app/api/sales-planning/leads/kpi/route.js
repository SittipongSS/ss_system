import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { holidaySet } from '@/lib/master/holidays';
import { slaHit, channelGroupOf } from '@/lib/sales/leads';
import { monthKey } from '@/lib/salesPlanning';
import { canViewLeads } from '../route';

export const dynamic = 'force-dynamic';

// GET /api/sales-planning/leads/kpi?month=YYYY-MM — KPI ลีด (เฟส C v1):
//   • จำนวนกรอกรายวัน/รายเดือน ต่อคน (Marketing KPI) + ต่อช่องทาง
//   • SLA คัดกรอง ≤1 วันทำการ (Supervisor) · SLA ติดต่อกลับ ≤1 วันทำการ (AE)
//   • conversion: ลีด → นัด → เปิดลูกค้า + ตีกลับ
// ทุกตัวคำนวณจาก timestamp (วันทำการอิงตาราง holidays) — ไม่มีการกรอกมือ.
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewLeads(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const param = params.get('month');
  const month = param === 'all' ? 'all' : (monthKey(param) || monthKey(new Date().toISOString()));
  // ฟิลเตอร์ทีม (ODM/KA/SV) — เดิม client ส่ง team มาแต่ server ไม่อ่าน = ฟิลเตอร์ไม่ทำงาน
  const team = params.get('team');
  const holidays = await holidaySet().catch(() => new Set());

  // ลีดของเดือนที่เลือก (ตามวันที่รับเข้า) — KPI เป็นภาพรวมทั้งฝ่าย (นโยบายเดียวกับ
  // dashboard ขาย: ภาพรวมโปร่งใส; การทำงานรายใบยัง scope ที่หน้า /sa/leads)
  let query = supabase.from('sales_leads').select('*');
  if (month !== 'all') {
    query = query.gte('createdAt', `${month}-01`).lt('createdAt', nextMonthStart(month));
  }
  if (team && team !== 'all') query = query.eq('team', team);
  const { data: leads, error } = await query;
  if (error) return fail(error.message, 500);
  const rows = leads || [];

  // จำนวนกรอกต่อคน (Marketing) + ต่อวัน
  const byCreator = {};
  const byDay = {};
  const byChannel = {};
  for (const l of rows) {
    const day = String(l.createdAt).slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
    const ck = l.createdBy || 'unknown';
    if (!byCreator[ck]) byCreator[ck] = { createdBy: l.createdBy, name: l.createdByName || 'ไม่ระบุ', count: 0, days: new Set() };
    byCreator[ck].count += 1;
    byCreator[ck].days.add(day);
    const ch = l.channel || 'unknown';
    if (!byChannel[ch]) byChannel[ch] = { channel: ch, group: channelGroupOf(ch), count: 0, qualified: 0 };
    byChannel[ch].count += 1;
    if (l.status === 'qualified') byChannel[ch].qualified += 1;
  }

  // SLA (นับเฉพาะใบที่ถึงขั้นนั้นแล้ว): hit = ≤1 วันทำการ
  const screenChecked = rows.filter((l) => l.screenedAt);
  const screenHits = screenChecked.filter((l) => slaHit(l.createdAt, l.screenedAt, holidays) === true);
  const screenPending = rows.filter((l) => l.status === 'new');
  const contactChecked = rows.filter((l) => l.assignedAt && l.firstContactAt);
  const contactHits = contactChecked.filter((l) => slaHit(l.assignedAt, l.firstContactAt, holidays) === true);
  const contactPending = rows.filter((l) => l.status === 'assigned');

  // SLA ติดต่อกลับ รายผู้รับมอบ (AE KPI)
  const byAssignee = {};
  for (const l of rows) {
    if (!l.assigneeId) continue;
    const k = l.assigneeId;
    if (!byAssignee[k]) byAssignee[k] = { assigneeId: k, name: l.assigneeName || 'ไม่ระบุ', team: l.team || null, assigned: 0, contacted: 0, slaHit: 0, meetings: 0, qualified: 0 };
    const b = byAssignee[k];
    b.assigned += 1;
    if (l.firstContactAt) {
      b.contacted += 1;
      if (slaHit(l.assignedAt, l.firstContactAt, holidays) === true) b.slaHit += 1;
    }
    if (l.meetingAt) b.meetings += 1;
    if (l.status === 'qualified') b.qualified += 1;
  }

  // ตีกลับ (ทีมผิด) — นับจาก events ของลีดเดือนนี้
  const leadIds = rows.map((l) => l.id);
  let bounceCount = 0;
  if (leadIds.length) {
    const { count } = await supabase
      .from('lead_events').select('id', { count: 'exact', head: true })
      .eq('kind', 'bounce').in('leadId', leadIds);
    bounceCount = count || 0;
  }

  const funnel = {
    total: rows.length,
    screened: rows.filter((l) => l.screenedAt).length,
    assigned: rows.filter((l) => l.assignedAt).length,
    contacted: rows.filter((l) => l.firstContactAt).length,
    meeting: rows.filter((l) => l.meetingAt).length,
    qualified: rows.filter((l) => l.status === 'qualified').length,
    disqualified: rows.filter((l) => l.status === 'disqualified').length,
    bounced: bounceCount,
  };

  return ok({
    month,
    funnel,
    sla: {
      screen: { checked: screenChecked.length, hit: screenHits.length, pending: screenPending.length },
      contact: { checked: contactChecked.length, hit: contactHits.length, pending: contactPending.length },
    },
    byCreator: Object.values(byCreator)
      .map((c) => ({ ...c, days: c.days.size, perDay: c.days.size ? +(c.count / c.days.size).toFixed(1) : 0 }))
      .sort((a, b) => b.count - a.count),
    byChannel: Object.values(byChannel).sort((a, b) => b.count - a.count),
    byAssignee: Object.values(byAssignee).sort((a, b) => b.assigned - a.assigned),
    byDay,
  });
});

function nextMonthStart(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}
