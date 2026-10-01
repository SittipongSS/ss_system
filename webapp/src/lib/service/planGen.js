// ── gen นัดตามรอบบริการ (mig 0188) — ฝั่ง server ─────────────────────────
// แยกจาก route.js เพราะไฟล์ route ของ Next ส่งออกได้เฉพาะ HTTP method
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { insertRowsWithEntityCode } from '@/lib/entityCode';
import { listHolidays } from '@/lib/master/holidays';
import { THAI_HOLIDAYS } from '@/lib/pm/dateHelpers';
import { businessDate } from '@/lib/businessDate';
import { CADENCE_TEXT, horizonDaysFor, horizonEndFor, yearsWithoutHolidays } from './cadence';
import { ensureVisits } from './rounds';
import { initialVisitStatus } from './visitGate';
import { gateContextForSite, loadVisitGateContext } from './gateContext';
import { findSite } from './sitesRepo';
import { loadVisits } from './visitsRepo';

/* ── วันหยุดที่ตัวเติมนัดใช้ (mig 0397 · D27) → Set ของ 'YYYY-MM-DD' ─────────────────────────────────
   ⭐ **อ่านจากตาราง `holidays` รายคำขอ แล้วส่งลงไปเป็นอาร์กิวเมนต์** — ไม่แตะชุดกลางของ pm/dateHelpers
      (`setHolidays` เป็นตัวแปรระดับโมดูลที่ route อื่นเขียนทับรายคำขอ ⇒ พึ่งไม่ได้ และห้ามเขียนทับจากโมดูลนี้)
   🔴 **อ่านไม่ได้ = โยน error** (`CADENCE_TEXT.holidayReadFailed`) — ต่างจาก `holidaySet()` ของ lib/master/holidays
      ที่กลืน error แล้วตอบรายการ hardcode ปี 2025–2026: บันทึกรอบด้วยรายการนั้น = นัดไปลงวันที่เจ้าของคีย์ไว้ว่าหยุด
      โดยไม่มีใครรู้ และตัวตัดสิน "ย้ายวันเอง" ของการเปลี่ยนรอบจะคิดจากชุดผิด
      ⇒ เส้นบันทึกรอบ (POST / PATCH) เรียกตัวนี้ **ก่อนเขียนอะไรทั้งหมด** แล้วตอบ 500
   ⚠️ ตารางว่าง (ยังไม่ได้ตั้ง) = รายการ hardcode เหมือน `holidaySet` — ว่าง ≠ อ่านไม่ได้
   ⚠️ ตารางมีแค่ปีที่คีย์ไว้ (01/10/2026: 2025–2026) — ปีที่ไม่มีแถวเลื่อนหนีได้แค่เสาร์–อาทิตย์
      ผู้เรียกบอกผู้ใช้ด้วย `yearsWithoutHolidays` (คำเตือนไม่บล็อก) · ไม่มีการเดาวันหยุดในโค้ด */
export async function loadPlanHolidays(supabase) {
  let rows;
  try {
    rows = await listHolidays(supabase);
  } catch {
    throw new Error(CADENCE_TEXT.holidayReadFailed);
  }
  return rows.length ? new Set(rows.map((row) => String(row.date).slice(0, 10))) : new Set(THAI_HOLIDAYS);
}

/* ปีในช่วงที่รอบนี้ยังสร้างนัดได้ซึ่งตาราง holidays **ไม่มีแถวเลย** → `number[]` (ปี ค.ศ.)
   ⭐ คำเตือนไม่บล็อกของเส้นบันทึกรอบ (ช่อง `holidayGapYears` ของคำตอบ POST / PATCH) — จอต่อท้าย toast ด้วย `holidayGapText`
   ช่วง = [max(วันนี้, วันเริ่มรอบ), วันสิ้นสุดรอบ] · รอบปลายเปิด = ถึงวันนัดสุดท้ายที่ตัวเติมนัดสร้างให้วันนี้ (`horizonEndFor` —
   รอบตามปฏิทินที่ยังไม่เริ่มนับระยะจากวันเริ่มรอบ)
   ⚠️ ชุดว่าง = [] (ยังไม่ได้ตั้งตาราง ≠ ปีขาด — `yearsWithoutHolidays`) · รอบที่จบไปแล้ว = [] */
export function planHolidayGapYears(plan, holidays, todayIso = businessDate()) {
  const today = String(todayIso).slice(0, 10);
  const start = plan?.startDate ? String(plan.startDate).slice(0, 10) : today;
  const from = start > today ? start : today;
  const to = plan?.endDate ? String(plan.endDate).slice(0, 10) : horizonEndFor(plan, today);
  return yearsWithoutHolidays(holidays, from, to);
}

// gen นัดของรอบหนึ่งภายใน horizon — ใช้ทั้งตอนสร้างรอบและตอนกดปุ่ม "เติมนัด"
//
// ⭐ gen สั้น ไม่ gen ทั้งปี: นัดที่ gen ล่วงหน้า 12 เดือนคือ 12 แถวที่จะถูก
// เลื่อนทุกเดือนแล้วไม่มีใครกล้าลบ · gen สั้น + ต่อรอบตอนปิดงานจริง
// ระยะมองล่วงหน้า = `horizonDaysFor(plan)` (days 90 วัน · รอบตามปฏิทินอย่างน้อยหนึ่งงวดเต็ม + 7 วัน) เว้นแต่ผู้เรียกส่งเอง
//
// ⚠️ อ่านนัดเดิมของ **ไซต์** ทั้งหมด (ไม่ใช่เฉพาะของรอบ) — ensureVisits กรอง planId
// เองอยู่แล้ว และชุดเดียวกันนี้ใช้เช็คซ้ำได้ทั้งกรณีกดเติมซ้ำ
// ⚠️ `holidays` = ชุดที่ผู้เรียกอ่านไว้แล้วในคำขอเดียวกัน (เส้นบันทึกรอบอ่านก่อนเขียน) · ไม่ส่ง = อ่านเองด้วยตัวเดียวกัน
//    (อ่านไม่ได้ = โยน error ก่อนสร้างนัด ไม่สร้างนัดด้วยรายการวันหยุดที่เดา)
export async function generateVisitsForPlan({ supabase, plan, user, req, horizonDays = null, holidays = null }) {
  const horizon = horizonDays ?? horizonDaysFor(plan);
  const holidaySetOfRequest = holidays ?? await loadPlanHolidays(supabase);
  const existing = await loadVisits(supabase, { siteId: plan.siteId });
  const rows = ensureVisits(plan, existing, { horizonDays: horizon, holidays: holidaySetOfRequest });
  if (!rows.length) return [];

  /* ⭐ นัดที่ระบบ gen เองก็ต้องผ่านด่านเหมือนกัน (มติผู้ใช้ 2026-08-28)
     รอบที่มีเจ้าหน้าที่ประจำและวันตกในช่วงที่ไซต์ให้เข้า ⇒ ขึ้นตารางเลย
     รอบที่ไม่มีเจ้าหน้าที่ หรือวันชนช่วงเข้าไซต์ ⇒ จอดเป็นร่างให้คนจัดคิวเห็นและจัดการ
     ⚠️ ของเดิม gen เป็น `scheduled` ตรง ๆ ⇒ นัดที่ไม่มีคนรับผิดชอบขึ้นตารางไปเงียบ ๆ
     แล้วไม่มีใครไป (prod วันนี้ `assigneeId = null` ทุกใบ) */
  const site = await findSite(supabase, plan.siteId);
  /* ⭐ ด่าน ①② ตรวจจริงตั้งแต่ PR-C — นัดที่ gen ออกมาต้องถูกตัดสินด้วยบริบทจริง
     ⚠️ ไม่ป้อน = ทุกใบเกิดเป็นร่าง แล้วคนจัดคิวต้องมานั่งปล่อยทีละใบ ซึ่งคืออาการ
        ที่กติกา "ด่านต้องไม่กลายเป็นแรงเสียดทานรายวัน" ห้ามไว้ */
  const gateCtx = await loadVisitGateContext(supabase, [plan.siteId]);
  const siteGateCtx = gateContextForSite(gateCtx, plan.siteId, { site });

  const payload = [];
  for (const draft of rows) {
    payload.push({
      id: genId('SVV'),
      status: initialVisitStatus(draft, siteGateCtx),
      // ⚠️ ไม่ใส่ code ตรงนี้ — รหัสออกทีละใบในฟังก์ชัน SQL ตอน insert (mig 0240)
      // ห้ามคำนวณเลขรันเองแล้วบวกทีละ 1 (สองคนกดเติมนัดพร้อมกันจะได้รหัสชนกัน)
      // และห้ามจองเลขไว้ก่อนตรงนี้ — ชุดนี้ล้มทั้งชุด เลขที่จองไว้จะหายไปทั้งหมด
      ...draft,
      createdById: user?.id ? String(user.id) : null,
      createdByName: user?.name || null,
    });
  }

  // ออกรหัสทุกใบ + insert ในทรานแซกชันเดียว — ล้มใบไหนก็คืนเลขทั้งชุด (mig 0240)
  const { data, error } = await insertRowsWithEntityCode(supabase, 'SV', payload);
  if (error) throw error;

  await recordAudit({
    user, action: 'create', entityType: 'service_visit', entityId: plan.id,
    summary: `gen นัดตามรอบ ${data?.length || 0} ครั้ง (ล่วงหน้า ${horizon} วัน) ที่ไซต์ ${plan.siteId}`,
    request: req,
  });
  return data || [];
}
