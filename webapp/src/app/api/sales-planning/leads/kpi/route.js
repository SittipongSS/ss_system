import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { holidaySet } from '@/lib/master/holidays';
import { canSeeLeadKpi } from '@/lib/permissions';
import {
  slaHit, slaStage, channelRollup, withAssigneePending, lostReasonRollup,
  leadOutcomesFor, leadOutcomeTotals, chunkLeadIds, LEAD_OUTCOME_EVENT_KINDS,
} from '@/lib/sales/leads';
import { monthKey } from '@/lib/salesPlanning';
import {
  businessDayKey, businessMonthKey, dateRangeOfBusinessDays, dateRangeOfBusinessMonth,
  dateRangeOfBusinessYear, daysInRange, isDayValue, isYearValue, lastDayOfMonth,
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

/** ประวัติของลีดทั้งชุด → Map(leadId → events[]) · คืน `null` ถ้าอ่านไม่ครบ
 *
 * ⭐ **ทำไมต้องอ่านประวัติ ทั้งที่คอลัมน์มีอยู่แล้ว**: `bounce` ล้าง `meetingAt` และ
 * `firstContactAt` ทิ้ง (ดู transition/route.js) ⇒ ลีดที่นัดประชุมไปแล้วจริงแล้วถูก
 * ตีกลับ จะ **หายจากตัวเศษ** ของอัตราแปลง ทั้งที่นัดนั้นเกิดขึ้นจริงและมีคนไปนั่งประชุม
 * มาแล้ว · `lead_events` ไม่เคยถูกล้าง (ลบเฉพาะตอนลบลีดทั้งใบ)
 *
 * ⚠️ **ซอย `.in()` เสมอ** — PostgREST ยัดลิสต์ลง query string ทั้งก้อน id ลีดยาว ~19
 * ตัวอักษร ⇒ ทั้งปี ~30KB เกินลิมิตความยาว URL (ดู LEAD_ID_CHUNK ใน leads.js)
 *
 * 🪤 **ก้อนใดก้อนหนึ่งพัง = คืน null ทั้งหมด** ไม่ใช่ส่งเท่าที่ได้ — ประวัติมาไม่ครบแล้ว
 * นับต่อ จะได้ตัวเลขที่ต่ำกว่าความจริงโดยไม่มีอะไรบอก ซึ่งอ่านเหมือนผลงานตกจริง ๆ
 * ถอยไปใช้คอลัมน์ทั้งกระดานแทน แล้วบอกหน้าจอผ่าน `outcome.basis`
 */
/* 🪤 **นับ "ใบ" ไม่ได้แปลว่านับ "แถว"** — ลีดหนึ่งใบมีเหตุการณ์ได้ไม่จำกัด (ติดตาม
   กี่ครั้งก็ได้ตั้งแต่ mig 0288) · ซอย 200 ใบเหมือน `.in()` ที่อื่นแล้วอาจได้ 2,000 แถว
   ซึ่งชน **เพดาน 1,000 แถวของ PostgREST ที่ตัดเงียบ ๆ** ⇒ นัดของลีดท้ายก้อนหายไป
   แล้วอัตราแปลงต่ำกว่าความจริง — อาการเดียวกับบั๊กที่ฟีเจอร์นี้เกิดมาแก้พอดี
   ⇒ ซอยเล็กลง + ขอ limit ชัดเจน + **ตรวจว่าเต็มพอดีไหม** ถ้าเต็มแปลว่าอาจโดนตัด
   ให้ถือว่าอ่านไม่สำเร็จ ดีกว่านับต่อด้วยข้อมูลที่อาจไม่ครบ */
const EVENT_LEADS_PER_QUERY = 60;
const EVENT_ROW_LIMIT = 1000;

async function loadOutcomeEvents(supabase, ids) {
  const chunks = chunkLeadIds(ids, EVENT_LEADS_PER_QUERY);
  if (!chunks.length) return new Map();
  const byLead = new Map(ids.map((id) => [id, []]));
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('lead_events')
      .select('leadId, kind')
      .in('leadId', chunk)
      .in('kind', LEAD_OUTCOME_EVENT_KINDS)
      .limit(EVENT_ROW_LIMIT);
    if (error) {
      console.error('[lead kpi] อ่านประวัติลีดไม่สำเร็จ — ถอยไปนับจากคอลัมน์:', error.message);
      return null;
    }
    if ((data || []).length >= EVENT_ROW_LIMIT) {
      console.error(`[lead kpi] ประวัติลีดเต็มเพดาน ${EVENT_ROW_LIMIT} แถวในก้อนเดียว — อาจถูกตัด ถอยไปนับจากคอลัมน์`);
      return null;
    }
    for (const row of data || []) byLead.get(row.leadId)?.push(row);
  }
  return byLead;
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
//   • ผลลัพธ์รวม: เปิดลูกค้า · ไม่ไปต่อ  (ตีกลับออกจากแท็บแล้ว — มติ 2026-08-11)
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
  /* โหมดช่วงวัน (IS-26080023) — Marketing นับลีดรายวัน/สัปดาห์เทียบยอด Spending Ads
     ⚠️ ต้องมาก่อน month/year ในลำดับความสำคัญ แต่ **ไม่ลบทั้งสองตัวทิ้ง** เพราะหน้าจอ
     ยังเปิดมาที่โหมดรายเดือนเป็นค่าตั้งต้น และลิงก์เก่าที่คนบุ๊กมาร์กไว้ยังต้องใช้ได้ */
  const fromDay = isDayValue(params.get('from')) ? params.get('from') : null;
  const toDay = isDayValue(params.get('to')) ? params.get('to') : null;
  const dayRange = fromDay && toDay ? { from: fromDay, to: toDay } : null;
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
  const range = dayRange ? dateRangeOfBusinessDays(dayRange.from, dayRange.to)
    : year ? dateRangeOfBusinessYear(year)
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
  /* ⭐ ประวัติลีด — แหล่งเดียวของคำว่า "เคยไปถึงขั้นไหน" (ดู loadOutcomeEvents)
     คำนวณ outcome ชุดเดียวแล้วส่งต่อให้ทุกตัวนับในหน้านี้ ⇒ ไม่มีทางที่สองตาราง
     บนจอเดียวกันจะนับคนละนิยาม */
  const eventsByLead = await loadOutcomeEvents(supabase, rows.map((l) => l.id).filter(Boolean));
  const outcomes = leadOutcomesFor(rows, eventsByLead);
  const outcomeOf = new Map(rows.map((lead, i) => [lead.id, outcomes[i]]));

  const byChannel = channelRollup(rows, outcomeOf);

  /* ⭐ "แพ้เพราะอะไร" (mig 0290) — ก่อนหน้านี้ `disqualifiedReason` ถูกเขียนทุกใบแต่
     **ไม่มีใครอ่าน** และ KPI มีแค่ % รวม ตอบได้แค่ว่าแพ้เท่าไร ไม่ใช่แพ้เพราะอะไร
     ⚠️ กติกาการนับอยู่ที่ `lostReasonRollup` ที่เดียว (route เหลือหน้าที่ส่งต่อ) */
  const lostReasons = lostReasonRollup(rows);

  /* SLA (นับเฉพาะใบที่ถึงขั้นนั้นแล้ว): hit = ≤1 วันทำการ · กติกาอยู่ใน slaStage ที่เดียว
     เส้นทางลีดมี **สามด่าน** ไม่ใช่สอง — ด่านกลาง "กระจาย" (Senior AE เลือก AE) เคยหายไป
     ทั้งที่การ์ดค้างคิวขึ้นหัวว่า "SLA 1 วันทำการทุกขั้น" และ `screenedAt`/`assignedAt`
     มีอยู่ในแถวแล้ว คำนวณได้ทันที · ของค้างขั้นนี้เป็นอันดับสองของทั้งฝ่ายแต่ไม่มีตัวเลขไหนแตะ */
  /* ⚠️ ด่านคัดกรองวัดถึง `firstScreenedAt` (ครั้งแรกตลอดกาล) ส่วนอีกสองด่านวัดด้วย
     คอลัมน์ **ของรอบปัจจุบัน** ที่ตีกลับล้างทิ้งทุกครั้ง (mig 0234) — ต่างกันโดยเจตนา:
     rework ไม่ลบผลงานคัดกรองรอบแรก แต่ Senior AE/AE คนใหม่ต้องเริ่มนับจากตอนที่ใบ
     มาถึงมือเขา ไม่ใช่จากรอบที่แล้ว · เขียน `screenedAt` ตรงนี้เมื่อไรคนที่มอบภายใน
     วันเดียวหลังตีกลับจะกลับไปถูกนับเป็น "ไม่ทัน" อีก */
  const screen = slaStage(rows, 'createdAt', 'firstScreenedAt', holidays);
  /* ⚠️ ด่านกระจายวัดถึง `firstAssignedAt` (มอบครั้งแรกของรอบ — mig 0273) ไม่ใช่
     `assignedAt` ที่ขยับตามการเปลี่ยนผู้รับผิดชอบ · เขียน `assignedAt` ตรงนี้เมื่อไร
     Senior AE ที่มอบทันเวลาจะถูกนับเป็น "ไม่ทัน" ย้อนหลังทุกครั้งที่มีคนย้ายเจ้าของ
     (บั๊กพี่น้องกับที่ 0234 แก้ให้ด่านคัดกรองไปแล้ว) */
  const assign = slaStage(rows, 'screenedAt', 'firstAssignedAt', holidays);
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
  /* ⚠️ นิยาม "ไปถึงไหน" มาจาก `leadOutcome` ที่เดียว เหมือน funnel และ channelRollup
     เดิมสามที่นี้เขียนเงื่อนไขเดียวกันซ้ำสามชุด (`l.meetingAt` · `l.firstContactAt` ·
     `status === 'qualified'`) แก้ที่หนึ่งลืมอีกสองที่ = ตัวเลขบนจอเดียวกันขัดกันเอง
     ⚠️ `slaHit` ยังคำนวณตรงนี้เพราะเป็นคำถามคนละอัน — "ทันไหม" ไม่ใช่ "ไปถึงไหน" */
  const byAssignee = {};
  for (const l of rows) {
    if (!l.assigneeId) continue;
    const k = l.assigneeId;
    if (!byAssignee[k]) byAssignee[k] = { assigneeId: k, name: l.assigneeName || 'ไม่ระบุ', team: l.team || null, assigned: 0, contacted: 0, slaHit: 0, meetings: 0, qualified: 0 };
    const b = byAssignee[k];
    const outcome = outcomeOf.get(l.id);
    b.assigned += 1;
    if (outcome.reachedContact) {
      b.contacted += 1;
      if (slaHit(l.assignedAt, l.firstContactAt, holidays) === true) b.slaHit += 1;
    }
    if (outcome.reachedMeeting) b.meetings += 1;
    if (outcome.won) b.qualified += 1;
  }

  /* ⚠️ ไม่มี "ตีกลับ" ในก้อนนี้แล้ว — มติผู้ใช้ 2026-08-11 เอาออกจากผัง แล้วไม่มีหน้าจอไหน
     อ่าน `funnel.bounced` อีกเลย แต่ route ยังไล่ยิง count query ใส่ `lead_events` เป็นก้อน ๆ
     ทุกครั้งที่เปิดแท็บอยู่ ~1 ปี ⇒ จ่ายค่า query ให้ตัวเลขที่ไม่มีใครเห็น (ตรวจ 2026-08-12)
     จะเอากลับมาเมื่อไร: metric "ตีกลับทีมผิด" ยังอยู่ในแผน (SALES_REVAMP_PLAN §3) และ
     `chunkLeadIds` ยังอยู่พร้อมเทส — ซอย `.in()` ก่อนเสมอ อย่ายัด id ทั้งเดือนก้อนเดียว

     ผัง = **สถานะของรอบปัจจุบัน** ทุกขั้น ไม่ใช่ "เคยไปถึง" — ใบที่ถูกตีกลับกลับไปนอน
     คิวคัดกรองต้องหล่นออกจาก "คัดกรองแล้ว/มอบหมายแล้ว" เหมือนที่มันหล่นออกจาก
     "ติดต่อแล้ว/นัด" อยู่แล้ว (ตีกลับล้างครบทั้งสี่คอลัมน์ตั้งแต่ mig 0234)
     🐞 เดิมสองขั้นบนนับจากซากของรอบก่อนที่ไม่ถูกล้าง ⇒ ส.ค. 2026 ผังขึ้น "มอบหมายแล้ว 56"
     ขณะที่ตาราง AE ข้างล่างรวมได้ 54 (byAssignee ข้ามใบที่ assigneeId ว่างไปแล้ว)
     สองตัวเลขบนจอเดียวกันขัดกันเองโดยไม่มีอะไรอธิบาย */
  /* ⚠️ สองขั้นบน (คัดกรอง/มอบหมาย) ยังอ่าน timestamp ตรง ๆ — เป็นเรื่อง "ผ่านด่านไหน
     มาแล้ว" ของรอบปัจจุบัน ไม่ใช่ "ผลลัพธ์" จึงไม่ใช่หน้าที่ของ leadOutcome
     สี่ขั้นล่างมาจาก `leadOutcome` ที่เดียวร่วมกับ channelRollup และ byAssignee */
  const funnel = {
    total: rows.length,
    screened: rows.filter((l) => l.screenedAt).length,
    assigned: rows.filter((l) => l.firstAssignedAt || l.assignedAt).length,
    contacted: outcomes.filter((o) => o.reachedContact).length,
    meeting: outcomes.filter((o) => o.reachedMeeting).length,
    qualified: outcomes.filter((o) => o.won).length,
    disqualified: outcomes.filter((o) => o.lost).length,
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
    lostReasons,
    /* ⭐ อัตราแปลง "เปิดลีด → นัดประชุม" — ตัวเศษเป็น **เคยนัด หรือ เปิดดีล**
       `LEAD_TRANSITIONS.contacted` มี `create_deal` ⇒ ปิดดีลได้โดยไม่ต้องนัด
       (ข้อมูลจริง ส.ค. 2026: นัด 2 แต่เปิดลูกค้า 4) นับแค่ "เคยนัด" เมื่อไร
       **ผลลัพธ์ที่ดีที่สุดจะได้คะแนนศูนย์**
       ⚠️ ตัวส่วนตัดลีดซ้ำ/ข้อมูลติดต่อผิดออก — ไม่เคยเป็นโอกาสขาย นับเข้าไปแล้ว
       อัตราแปลงจะต่ำลงตามปริมาณสแปม ซึ่งไม่ใช่ผลงานของใคร
       ⚠️ `basis` บอกว่าอ่านจากประวัติหรือคอลัมน์ — 'row' = อ่านประวัติไม่ได้
       ตัวเลขจะต่ำกว่าความจริง หน้าจอต้องบอกผู้ใช้ ไม่ใช่ปล่อยให้อ่านผิด */
    outcome: leadOutcomeTotals(outcomes),
    /* เรียงตาม "ค้างตอนนี้" มากสุดก่อน ไม่ใช่ตามจำนวนที่รับมอบ — ตารางนี้ตอบคำถาม
       "ตอนนี้ต้องไปตามใคร" · withAssigneePending เติมแถวให้คนที่เดือนนี้ไม่มีลีดใหม่
       แต่ยังกองของเก่าไว้ด้วย ไม่งั้นคนที่ต้องตามที่สุดจะหายจากตาราง */
    byAssignee: withAssigneePending(Object.values(byAssignee), aePending.counts, aePending.meta),
    byDay,
    /* รายชื่อวันของงวดที่เลือก — **รวมวันที่ไม่มีลีดด้วย** (`byDay` มีเฉพาะวันที่มีลีด)
       กราฟรายวันต้องวาดวันว่างเป็นแท่งเปล่า ไม่ใช่ยุบทิ้ง เพราะ "วันที่ยิงแอดแล้วไม่มี
       ลีด" คือข้อมูลที่ Marketing ต้องเห็น (มติผู้ใช้ 2026-08-13 · IS-26080023)
       ส่งจาก server เพื่อไม่ให้ฝั่งจอต้องคำนวณขอบเดือน/ปีซ้ำอีกชุดแล้วเพี้ยนกันเอง
       · โหมด "ทุกเดือน/ทั้งปี" ไม่ส่ง (365 แท่งอ่านไม่ออกอยู่แล้ว) */
    days: dayRange ? daysInRange(dayRange.from, dayRange.to)
      : (!year && month !== 'all' ? daysInRange(`${month}-01`, lastDayOfMonth(month)) : null),
  });
});

