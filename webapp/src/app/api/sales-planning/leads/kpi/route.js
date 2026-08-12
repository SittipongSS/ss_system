import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { holidaySet } from '@/lib/master/holidays';
import { canSeeLeadKpi } from '@/lib/permissions';
import { slaHit, slaStage, channelRollup, withAssigneePending, chunkLeadIds } from '@/lib/sales/leads';
import { monthKey } from '@/lib/salesPlanning';
import {
  businessDayKey, businessMonthKey, dateRangeOfBusinessMonth, dateRangeOfBusinessYear, isYearValue,
} from '@/lib/datePeriods';

export const dynamic = 'force-dynamic';

/** ใบที่รอ AE ติดต่อ **ตอนนี้** แยกรายคน (ไม่ผูกกับเดือนที่เลือก เหมือน countLeadsByStatus)
 *  คืนจำนวนรายคน พร้อม **ชื่อกับทีมสำรอง** ไว้เผื่อคนนั้นไม่มีลีดของเดือนนี้เลย —
 *  ไม่งั้นแถวที่เติมเข้ามาจะขึ้น "ไม่ระบุ / -" ทั้งที่ข้อมูลอยู่ในใบที่เขาถือค้างอยู่นั่นเอง
 *  ⚠️ ล้มแล้วคืนก้อนว่าง ไม่ใช่โยน error — ตัวเลขอื่นทั้งหน้ายังใช้ได้ ไม่ควรพังทั้งแท็บ
 *  เพราะคอลัมน์เดียว (หน้าจอจะโชว์ 0 ซึ่งอ่านว่า "ไม่มีของค้าง" — ยอมรับได้เพราะคอลัมน์นี้
 *  เป็นตัวช่วยจัดลำดับ ไม่ใช่ตัวเลขประเมินผล ต่างจาก SLA pending ที่ต้องแยก null ให้ชัด)
 */
async function pendingContactByAssignee(supabase, team) {
  let query = supabase
    .from('sales_leads')
    .select('assigneeId, assigneeName, team')
    .eq('status', 'assigned')
    .not('assigneeId', 'is', null);
  if (team && team !== 'all') query = query.eq('team', team);
  const { data, error } = await query;
  if (error) {
    console.error('[lead kpi] นับใบที่ AE ค้างติดต่อไม่สำเร็จ:', error.message);
    return { counts: {}, meta: {} };
  }
  const counts = {};
  const meta = {};
  for (const row of data || []) {
    counts[row.assigneeId] = (counts[row.assigneeId] || 0) + 1;
    if (!meta[row.assigneeId]) meta[row.assigneeId] = { name: row.assigneeName || null, team: row.team || null };
  }
  return { counts, meta };
}

/** จำนวนลีดที่ค้างอยู่ในสถานะหนึ่ง **ตอนนี้** (ไม่ผูกกับเดือนที่เลือก)
 *  นับไม่ได้คืน `null` ไม่ใช่ 0 — หน้าจอจะได้โชว์ "-" แทนที่จะบอกว่า "ไม่มีค้าง" */
async function countLeadsByStatus(supabase, status, team) {
  let query = supabase.from('sales_leads').select('id', { count: 'exact', head: true }).eq('status', status);
  if (team && team !== 'all') query = query.eq('team', team);
  const { count, error } = await query;
  if (error) {
    console.error(`[lead kpi] นับลีดค้างสถานะ ${status} ไม่สำเร็จ:`, error.message);
    return null;
  }
  return count || 0;
}

// GET /api/sales-planning/leads/kpi?month=YYYY-MM — KPI ลีด (เฟส C v1):
//   • จำนวนกรอกรายวัน/รายเดือน ต่อคน (Marketing KPI)
//   • SLA ≤1 วันทำการ **ทั้งสามด่าน** — คัดกรอง (หัวหน้าฝ่ายขาย) · กระจาย (Senior AE) ·
//     ติดต่อกลับ (AE) พร้อมจำนวนที่ค้างอยู่ ณ ตอนนี้ของแต่ละด่าน
//   • รายช่องทาง: เข้า → ติดต่อ → นัด → เปิดลูกค้า + สถานะปัจจุบันที่ไม่ซ้อนกัน
//   • ผลลัพธ์รวม: เปิดลูกค้า · ไม่ไปต่อ · ตีกลับ
// ทุกตัวคำนวณจาก timestamp (วันทำการอิงตาราง holidays) — ไม่มีการกรอกมือ.
// ⚠️ ด่านคือ `canSeeLeadKpi` **ไม่ใช่ `canViewLeads`** — ก้อนที่คืนไปมีข้อมูล
// ประเมินผลรายบุคคล (`byAssignee` = SLA ติดต่อกลับรายคนทั้งฝ่าย · `byCreator` =
// ยอดกรอกรายคนของทีม Marketing) ซึ่งหน้าจอ**ตั้งใจ**ซ่อนจาก AE/AC/Senior AE อยู่แล้ว
// ทั้งลิงก์ "ดู KPI เต็ม" บนหน้าลีดและแท็บ "KPI ลีด" ใน /sa/dashboard
//
// 🐞 เดิมด่านนี้เป็น `canViewLeads` (salesplan:lead หรือ salesplan:view) = หลวมกว่า
// หน้าจอมาก → ใครที่เปิดคิวลีดได้ก็ยิง URL ตรงอ่านตัวเลขของเพื่อนร่วมทีมได้หมด
// (มติผู้ใช้ 2026-08-04: บีบ API ให้ตรง UI — ไม่มีหน้าจอไหนของ role ที่ถูกตัดเรียก
// endpoint นี้เลย จึงไม่กระทบงานที่ทำอยู่จริง)
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canSeeLeadKpi(user?.role)) return forbidden();

  const params = new URL(req.url).searchParams;
  const param = params.get('month');
  // ค่าถอย = เดือนปัจจุบัน **ตามเวลาไทย** — ถ้าใช้ UTC ช่วงตีหนึ่งถึงเจ็ดโมงของวันที่ 1
  // จะได้เดือนก่อนหน้า (หน้าจอส่ง month มาเสมอ ตัวนี้เป็นตาข่ายรับ)
  const month = param === 'all' ? 'all' : (monthKey(param) || businessMonthKey(new Date().toISOString()));
  // year=YYYY = "ทุกเดือนของปีนั้น" (ติ๊ก "ทุกเดือน" บน MonthPicker)
  // month=all ยังรับไว้เพื่อความเข้ากันได้ แต่หน้าจอไม่ส่งมาแล้ว
  const year = isYearValue(params.get('year')) ? params.get('year') : null;
  // ฟิลเตอร์ทีม (ODM/KA/SV) — เดิม client ส่ง team มาแต่ server ไม่อ่าน = ฟิลเตอร์ไม่ทำงาน
  const team = params.get('team');
  const holidays = await holidaySet().catch(() => new Set());

  // ลีดของเดือนที่เลือก (ตามวันที่รับเข้า) — KPI เป็นภาพรวมทั้งฝ่าย (นโยบายเดียวกับ
  // dashboard ขาย: ภาพรวมโปร่งใส; การทำงานรายใบยัง scope ที่หน้า /sa/leads)
  //
  // ⚠️ ขอบเดือน/ปีต้องเป็น **ต้นวันตามเวลาไทย** ไม่ใช่สตริงวันเปล่า ๆ ซึ่ง Postgres
  // อ่านเป็น 00:00 UTC = 07:00 กรุงเทพ ⇒ ลีดที่เข้ามาตอนดึกตกไปนับเป็นเดือนก่อน
  // (ดูเหตุผลเต็มที่ lib/datePeriods.js · แก้ 2026-08-08)
  let query = supabase.from('sales_leads').select('*');
  const range = year ? dateRangeOfBusinessYear(year)
    : month !== 'all' ? dateRangeOfBusinessMonth(month)
      : null;
  if (range) query = query.gte('createdAt', range.from).lt('createdAt', range.until);
  if (team && team !== 'all') query = query.eq('team', team);
  const { data: leads, error } = await query;
  if (error) return fail(error.message, 500);
  const rows = leads || [];

  // จำนวนกรอกต่อคน (Marketing) + ต่อวัน
  const byCreator = {};
  const byDay = {};
  for (const l of rows) {
    // วันไทย ไม่ใช่ `slice(0, 10)` (= วัน UTC) — ไม่งั้นลีดที่กรอกหลังห้าโมงเย็นตกไปวันก่อน
    const day = businessDayKey(l.createdAt);
    byDay[day] = (byDay[day] || 0) + 1;
    const ck = l.createdBy || 'unknown';
    if (!byCreator[ck]) byCreator[ck] = { createdBy: l.createdBy, name: l.createdByName || 'ไม่ระบุ', count: 0, days: new Set() };
    byCreator[ck].count += 1;
    byCreator[ck].days.add(day);
  }

  /* รายช่องทาง — ตอบ "เข้ามาทางไหน แล้วติดต่อ/นัด/เปิดลูกค้าได้เท่าไร" (มติผู้ใช้ 2026-08-12)
     เดิมคืนแค่ count + qualified ⇒ หน้าจอบอกได้แค่ปริมาณกับผลลัพธ์ปลายทาง มองไม่เห็นว่า
     ช่องทางไหนติดต่อไม่ทันหรือกองอยู่ตรงไหน · กติกาการจัดช่องอยู่ใน channelRollup ที่เดียว
     (มีเทสคุมว่าช่องสถานะสี่ช่องรวมกันต้องเท่าจำนวนลีดเป๊ะ ไม่งั้นแท่งสัดส่วนยาวเกินราง) */
  const byChannel = channelRollup(rows);

  /* SLA (นับเฉพาะใบที่ถึงขั้นนั้นแล้ว): hit = ≤1 วันทำการ · กติกาอยู่ใน slaStage ที่เดียว
     เส้นทางลีดมี **สามด่าน** ไม่ใช่สอง — ด่านกลาง "กระจาย" (Senior AE เลือก AE) เคยหายไป
     ทั้งที่การ์ดค้างคิวขึ้นหัวว่า "SLA 1 วันทำการทุกขั้น" และ `screenedAt`/`assignedAt`
     มีอยู่ในแถวแล้ว คำนวณได้ทันที · ของค้างขั้นนี้เป็นอันดับสองของทั้งฝ่ายแต่ไม่มีตัวเลขไหนแตะ */
  const screen = slaStage(rows, 'createdAt', 'screenedAt', holidays);
  const assign = slaStage(rows, 'screenedAt', 'assignedAt', holidays);
  const contact = slaStage(rows, 'assignedAt', 'firstContactAt', holidays);

  /* "ค้าง" = **ค้างอยู่ ณ ตอนนี้** ไม่ใช่ "ลีดของเดือนที่เลือกที่ยังค้าง"
     🐞 เดิมกรองจาก `rows` ซึ่งถูกตัดด้วยเดือนไปแล้ว ⇒ ลีดที่ค้างข้ามเดือนมา — ซึ่งเป็น
     ใบที่ค้างจริงที่สุดและควรถูกทวงที่สุด — **ไม่โผล่เลย** · คนอ่านตัวเลขข้าง SLA
     ตีความว่า "ตอนนี้เหลือกี่ใบ" อยู่แล้ว (ตรวจเจอ 2026-08-08)

     ⚠️ คิวคัดกรองเป็น **คิวกลาง ไม่มีทีม** (`new` มี team = null เสมอ) ⇒ ไม่ใส่ตัวกรองทีม
     ไม่งั้นพอเลือกทีมแล้วจะได้ 0 ทุกครั้งทั้งที่คิวกลางมีของค้างอยู่
     ส่วน "รอกระจาย" (`screened`) กับ "รอติดต่อกลับ" (`assigned`) ถูกคัดเข้าทีมแล้ว
     (action `screen` บังคับเลือกทีม) จึงกรองทีมตามที่ผู้ใช้เลือกได้ทั้งคู่ */
  const [screenPending, assignPending, contactPending, aePending] = await Promise.all([
    countLeadsByStatus(supabase, 'new', null),
    countLeadsByStatus(supabase, 'screened', team),
    countLeadsByStatus(supabase, 'assigned', team),
    pendingContactByAssignee(supabase, team),
  ]);

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
  //
  // 🐞 เดิมยัด id ทั้งเดือนลง `.in()` ครั้งเดียวและ **ไม่อ่าน error** ⇒ พอลีดเยอะจน
  // query string ยาวเกินลิมิต query ล้ม แล้ว `count` เป็น undefined → `|| 0` กลบเป็น 0
  // ผลคือตัวเลข "ตีกลับ" โชว์ 0 ทั้งที่มีจริง และยิ่งบริษัทโตยิ่งพังแน่ขึ้น (ตรวจ 2026-08-08)
  //
  // ⚠️ ล้มแล้วต้องคืน `null` ไม่ใช่ 0 — 0 เป็นคำตอบที่ดูปกติจนไม่มีใครสงสัย
  // ส่วน null ทำให้หน้าจอโชว์ "-" (ดู KpiLeadsTab) = บอกว่า "ไม่รู้" ไม่ใช่ "ไม่มี"
  let bounceCount = 0;
  for (const chunk of chunkLeadIds(rows.map((l) => l.id))) {
    const { count, error: bounceError } = await supabase
      .from('lead_events').select('id', { count: 'exact', head: true })
      .eq('kind', 'bounce').in('leadId', chunk);
    if (bounceError) {
      console.error('[lead kpi] นับจำนวนตีกลับไม่สำเร็จ:', bounceError.message);
      bounceCount = null;
      break;
    }
    bounceCount += count || 0;
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
    // ลำดับ = ลำดับของด่านจริงบนเส้นทาง (คัดกรอง → กระจาย → ติดต่อกลับ) หน้าจอเรียงตามนี้ได้เลย
    sla: {
      screen: { ...screen, pending: screenPending },
      assign: { ...assign, pending: assignPending },
      contact: { ...contact, pending: contactPending },
    },
    byCreator: Object.values(byCreator)
      .map((c) => ({ ...c, days: c.days.size, perDay: c.days.size ? +(c.count / c.days.size).toFixed(1) : 0 }))
      .sort((a, b) => b.count - a.count),
    byChannel,
    /* เรียงตาม "ค้างตอนนี้" มากสุดก่อน ไม่ใช่ตามจำนวนที่รับมอบ — ตารางนี้ตอบคำถาม
       "ตอนนี้ต้องไปตามใคร" · withAssigneePending เติมแถวให้คนที่เดือนนี้ไม่มีลีดใหม่
       แต่ยังกองของเก่าไว้ด้วย ไม่งั้นคนที่ต้องตามที่สุดจะหายจากตาราง */
    byAssignee: withAssigneePending(Object.values(byAssignee), aePending.counts, aePending.meta),
    byDay,
  });
});

