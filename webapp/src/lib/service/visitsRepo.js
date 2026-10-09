// ── Data access ของรอบบริการ + ตารางนัด (mig 0188) ───────────────────────
import { conflict, forbidden, notFound } from '@/lib/http';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { canDoFieldWork, canViewService, canViewVisitReport } from '@/lib/permissions';
import { crewClosedEditError, crewNotRunningError, visitWriteAccess } from './visitAccess';
import {
  VISIT_STATUSES, holdsRequestSlot, isClosedVisit, isDraftVisit, isLiveVisit, isOpenVisit,
} from './visitStatus';
import { requireService } from './sitesRepo';
import { SURVEY_VISIT_KIND } from './surveyVisit';
import {
  SEND_BACK_DONE_KIND, SEND_BACK_KIND, surveySendBackOnSheet, surveySendBackState,
} from './survey';
import { surveyNeedsVisit } from './surveyMethod';
import { loadCrewNames, visitCrewFrom, visitCrewRole, visitHelperIds } from './crew/visitCrew';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { addDays } from '@/lib/datePeriods';

// ทีมบนนัด — ตัวจริงอยู่ไฟล์ใบ `crew/visitCrew.js` (surveyRepo ต้อง import ได้โดยไม่ลาก `@/lib/http`)
export { loadCrewNames, loadVisitCrew, visitCrewRole } from './crew/visitCrew';

/* ⚠️ PostgREST ต้องการ **ลิสต์ค่า** ไม่ใช่ฟังก์ชัน — ประกอบจากนิยามกลางที่
   visitStatus.js เพื่อไม่ให้มีชุดสถานะชุดที่หกในระบบ */
const CLOSED_VISITED = VISIT_STATUSES.filter((s) => isClosedVisit({ status: s }));
const OPEN_STATUSES = VISIT_STATUSES.filter((s) => isOpenVisit({ status: s }));
/* อยู่บนตาราง = ไม่ใช่ร่าง · ไม่ยกเลิก · ไม่เลื่อน — คิวงานของช่างตัดสามกลุ่มนั้นที่ server (แผน operation-crew §5) */
const LIVE_STATUSES = VISIT_STATUSES.filter((s) => isLiveVisit({ status: s }));
/* นัดประเมินที่ปิดแล้ว **และเข้าถึงไซต์ได้** — แถบ "ส่งกลับให้แก้" บนจอประเมินขึ้นเฉพาะชุดนี้
   (`surveyFieldView` · `isClosedVisit(visit) && visit.status !== 'unable'`) ⇒ คิวงานถามชุดเดียวกัน ไม่งั้นการ์ดพาไปจอที่ไม่มีอะไรให้ทำ */
const SENT_BACK_VISITED = CLOSED_VISITED.filter((s) => s !== 'unable');
/* ร่าง + นัดที่ยังเปิด = งานที่รายการงานยังต้องจัดการ (แท็บ รอจัด · ค้าง · จัดแล้ว) */
const QUEUE_OPEN = VISIT_STATUSES.filter((s) => isDraftVisit({ status: s }) || isOpenVisit({ status: s }));

// ── นัด ──────────────────────────────────────────────────────────────────
/* ⭐ **เจ้าหน้าที่ที่ไปด้วยต้องเห็นงานของตัวเองด้วย** (F-6 · มอบหมายหลายคน) — ของเดิม
   กรองเฉพาะ `assigneeId` ⇒ คนที่ถูกใส่เป็นผู้ช่วยจะไม่เห็นนัดนั้นในงานวันนี้เลย
   แล้ววันนั้นเขาจะไม่รู้ว่าต้องไปไหน · `assistantIds` เป็น jsonb array จึงใช้ `cs`
   (contains) ไม่ใช่ `eq` · `.or()` ก้อนเดียวเพราะสองเงื่อนไขนี้เป็น "อย่างใดอย่างหนึ่ง"
   ⚠️ **ค่าถูกยัดลงสตริงตัวกรองของ PostgREST ตรง ๆ** — id ที่มีวงเล็บหรือจุลภาค
   จะแตกไวยากรณ์ `or()` แล้วกลายเป็นตัวกรองอื่นที่เราไม่ได้ตั้งใจ · id ของระบบ
   เป็น uuid/สตริงรหัสเสมอ จึงกรองอักขระให้เหลือชุดที่ปลอดภัยก่อนเสมอ
   (ค่านี้มาจาก query param `assignee` ได้ด้วย ไม่ได้มาจาก session อย่างเดียว)
   ⚠️ `.or()` ถือ id **ตัวเดียว** เสมอ ⇒ ไม่มีวันยาวถึงเพดาน 16 KB */
function whereCrewOf(query, assigneeId) {
  if (!assigneeId) return query;
  const safeId = String(assigneeId).replace(/[^A-Za-z0-9_-]/g, '');
  return safeId ? query.or(`assigneeId.eq.${safeId},assistantIds.cs.["${safeId}"]`) : query;
}

// ปฏิทินอ่านเป็นช่วงวันเสมอ · siteId ใช้ตอนดูประวัติของไซต์เดียว
// ⭐ `liveOnly` = เฉพาะนัดที่อยู่บนตาราง (`isLiveVisit`) กรองที่ query — คิวงานของช่าง · ไม่ส่ง = ทุกสถานะเหมือนเดิม
/* 🔴 ไล่หน้าด้วย fetchAll + ลำดับนิ่ง `scheduledDate, startTime, id` (แผน operation-crew §5) — ช่วงวันของ
   ตารางทั้งฝ่ายกับประวัติของไซต์เก่าโตเกินพันแถวได้ แล้วเพดาน PostgREST ตัดเงียบ ๆ (ด่าน check:rowcap)
   ⚠️ builder ยิงซ้ำไม่ได้ ⇒ ประกอบ query ใหม่ในฟังก์ชันทุกหน้า */
export async function loadVisits(supabase, {
  from = null, to = null, siteId = null, assigneeId = null, liveOnly = false,
} = {}) {
  return fetchAll(() => {
    let query = supabase.from('service_visits').select('*');
    if (from) query = query.gte('scheduledDate', from);
    if (to) query = query.lte('scheduledDate', to);
    if (siteId) query = query.eq('siteId', siteId);
    if (liveOnly) query = query.in('status', LIVE_STATUSES);
    return whereCrewOf(query, assigneeId)
      .order('scheduledDate', { ascending: true })
      .order('startTime', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });
  });
}

/**
 * **นัดค้าง** ของคิวงาน — ยังเปิดอยู่ (`isOpenVisit`) และวันนัดเลย `before` มาแล้ว
 *
 * ⭐ **ไม่มีขอบล่าง** (แผน operation-crew §5 · R3) — นัดที่ลืมปิดเมื่อสองเดือนก่อนคือหนี้ที่ต้องเห็นที่สุด
 *    ของเดิมถอยหลังแค่ 14 วัน (`my-visits` ?back) ⇒ พ้นวันที่ 15 นัดนั้นหายจากสายตาช่างถาวร
 * ⚠️ ร่าง/ยกเลิก/เลื่อน/ปิดแล้ว ไม่ใช่ของค้าง — ชุดสถานะมาจาก `isOpenVisit` ตัวเดียวกับตัวเลขหัวจอ
 * ⚠️ ไล่หน้าด้วย fetchAll — ไม่มีขอบล่าง = แถวโตตามอายุระบบ (scope ทั้งฝ่ายยิ่งโต)
 * @throws error ของ Supabase ตัวแรกที่เจอ
 */
export async function loadOverdueVisits(supabase, { assigneeId = null, before }) {
  // ไม่มีวันตัด = กวาดนัดเปิดทั้งอนาคตด้วย — ผิดสัญญาของผู้เรียก ไม่ใช่ค่าตั้งต้นที่ควรเดา
  if (!before) throw new Error('loadOverdueVisits: ต้องระบุ before');
  return fetchAll(() => whereCrewOf(supabase
    .from('service_visits').select('*')
    .in('status', OPEN_STATUSES)
    .lt('scheduledDate', before), assigneeId)
    .order('scheduledDate', { ascending: true })
    .order('startTime', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true }));
}

/**
 * นัดของ "รายการงาน" (คอลัมน์ซ้ายของ /service/schedule) — คนละคำถามกับ `loadVisits`
 * ที่อ่านเป็นช่วงวันของปฏิทิน
 *
 * ⭐ **ร่าง + นัดที่ยังเปิด ไม่มีขอบวันที่** — ร่างที่วันเลยมาแล้วกับนัดค้างเมื่อเดือนก่อน
 *    คือของที่ต้องเห็นที่สุด ถ้าตัดตามสัปดาห์ของปฏิทิน มันจะหายจากจอทันทีที่เลื่อนสัปดาห์
 * ⭐ **นัดที่ปิดแล้ว เฉพาะที่เข้าจริงตั้งแต่ `closedSince`** — แท็บ "ปิดแล้ว" ดูย้อนหลังสั้น ๆ
 *    ไม่ใช่ประวัติทั้งระบบ (ประวัติอยู่หน้าไซต์) · กรองที่ `actualDate` ได้ตรง ๆ เพราะ DB
 *    บังคับว่าสามสถานะปิดต้องมีวันเข้าจริงเสมอ (mig 0300)
 * ⚠️ สองก้อนนี้ไม่ซ้อนกัน (ชุดสถานะไม่ทับกัน) ⇒ ต่อกันได้เลยไม่ต้องกันแถวซ้ำ
 * ⚠️ ไล่หน้าด้วย fetchAll + ลำดับนิ่งที่ `id` — ร่างและนัดเปิดทั้งระบบโตตามจำนวนไซต์
 *    เพดาน 1,000 แถวตัดเงียบ ๆ ได้ (ด่าน check:rowcap)
 * @throws error ของ Supabase ตัวแรกที่เจอ
 */
export async function loadQueueVisits(supabase, { closedSince }) {
  // ไม่มีขอบล่าง = กวาดประวัติปิดงานทั้งระบบ — ผิดสัญญาของผู้เรียก ไม่ใช่ค่าตั้งต้นที่ควรเดา
  if (!closedSince) throw new Error('loadQueueVisits: ต้องระบุ closedSince');
  const [open, closed] = await Promise.all([
    fetchAll(() => supabase
      .from('service_visits').select('*')
      .in('status', QUEUE_OPEN)
      .order('scheduledDate', { ascending: true })
      .order('id', { ascending: true })),
    fetchAll(() => supabase
      .from('service_visits').select('*')
      .in('status', CLOSED_VISITED)
      .gte('actualDate', closedSince)
      .order('actualDate', { ascending: false })
      .order('id', { ascending: true })),
  ]);
  return [...open, ...closed];
}

export async function findVisit(supabase, id) {
  const { data, error } = await supabase
    .from('service_visits').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * จำนวนแถวลูกที่เป็น **ผลของการไปจริง** ของนัดหนึ่งใบ — ผลรายเครื่อง (`service_visit_assets`) + ของที่ใช้
 * (`service_visit_items`) · ด่านลบนัดใช้ (`visitDeleteBlock(visit, { fieldRecords })`)
 * ⚠️ ตารางลูกทั้งสองเป็น CASCADE ⇒ ลบนัดเมื่อไร ของพวกนี้หายตามเงียบ ๆ — ต้องถามก่อนลบเสมอ
 * ⚠️ supabase ไม่ throw ⇒ คืน `{ count, error }` ให้ผู้เรียกตีกลับเอง (ห้ามถือว่า error = 0 แถว = ลบได้)
 */
export async function visitFieldRecordCount(supabase, visitId) {
  const [assets, items] = await Promise.all([
    supabase.from('service_visit_assets').select('id', { count: 'exact', head: true }).eq('visitId', visitId),
    supabase.from('service_visit_items').select('id', { count: 'exact', head: true }).eq('visitId', visitId),
  ]);
  const error = assets.error || items.error || null;
  return { count: error ? null : (assets.count || 0) + (items.count || 0), error };
}

/**
 * ด่านของ "นัดใบนี้" — คืน `{ visit, ownWorkOnly }` หรือ `{ response }`
 *
 * ⭐ **เจ้าหน้าที่หน้างานเขียนได้เฉพาะใบของตัวเอง** (มติผู้ใช้ 2026-08-30) — ตำแหน่ง Operation
 *    ถือ `service:work` ไม่ใช่ `service:edit` ⇒ ตกด่านฝ่ายชั้นนอก แต่ต้องไปต่อได้ถ้า
 *    นัดใบนี้เป็นของเขา · `ownWorkOnly: true` บอกผู้เรียกว่า **ต้องจำกัดช่องที่แก้ได้**
 *    (ดู `FIELD_WORK_FIELDS` ใน route ของนัด) เพราะคนกลุ่มนี้ไม่ได้แก้ตาราง
 * 🔴 อ่านแถวก่อนตัดสิน — ด่านนี้เป็นด่าน *รายใบ* ไม่ใช่ด่าน cap ล้วน
 * ⭐ `report` = **อ่านใบส่งงาน** (GET ของใบเท่านั้น) — ฝ่ายขายเปิดได้ด้วย (มติผู้ใช้ 2026-09-24
 *    "ใบส่งงานเปิดให้ฝ่ายขายดูได้ด้วย") · คืน `readOnly: true` · ⚠️ ไม่มีผลกับ `edit` เลย —
 *    ส่ง edit มาด้วยเมื่อไร ทางนี้ถูกข้าม ด่านเขียนเดิมตัดสินทั้งหมด
 * ⭐ `running` (คู่กับ `edit`) = **เส้นเขียนผลของการไป** (ผลรายเครื่อง · ของที่ใช้ · รูปทีละรูป) — ช่างต้องเป็นงาน
 *    ที่กำลังทำ (`crewNotRunningError`) · ⚠️ PATCH/DELETE ของนัดห้ามส่ง — รับงานเดินเส้นนั้นจากนัดที่ยังไม่เริ่ม
 */
export async function requireVisit({ user, supabase, id, edit = false, report = false, running = false }) {
  if (report && !edit && user && !canViewService(user) && canViewVisitReport(user)) {
    const visit = await findVisit(supabase, id);
    if (!visit) return { response: notFound('ไม่พบนัดเข้าบริการ') };
    return { visit, ownWorkOnly: false, readOnly: true };
  }
  const access = requireService({ user, edit });
  const blocked = !!access.response;
  // ตกด่านชั้นนอกด้วยเหตุอื่นที่ไม่ใช่ "แก้ไม่ได้" (ไม่ล็อกอิน · อ่านไม่ได้) = จบตรงนี้
  if (blocked && (!edit || !canDoFieldWork(user))) return access;

  const visit = await findVisit(supabase, id);
  if (!visit) return { response: notFound('ไม่พบนัดเข้าบริการ') };

  const decision = visitWriteAccess({ user, visit, canEditAll: !blocked });
  if (!decision.ok) return decision.error ? { response: forbidden(decision.error) } : access;
  /* 🔴 **ส่งงานแล้ว ช่างแก้ไม่ได้** (มติเจ้าของ 28/09 Q3) — ถามหลังด่านรายใบ ⇒ ใบของคนอื่นยังได้ 403 เดิม
     ⚠️ ทาง edit เท่านั้น — ทางอ่าน (`canEditAll` = ผ่านด่านอ่าน) ไม่มีธง ownWorkOnly อยู่แล้ว */
  const closedEdit = edit ? crewClosedEditError(visit, decision) : null;
  if (closedEdit) return { response: conflict(closedEdit) };
  const notRunning = edit && running ? crewNotRunningError(visit, decision) : null;
  if (notRunning) return { response: conflict(notRunning) };
  return { visit, ownWorkOnly: decision.ownWorkOnly };
}

// ── รอบบริการ ────────────────────────────────────────────────────────────
export async function loadPlans(supabase, { siteId = null, activeOnly = false } = {}) {
  let query = supabase.from('service_plans').select('*');
  if (siteId) query = query.eq('siteId', siteId);
  if (activeOnly) query = query.eq('isActive', true);
  const { data, error } = await query.order('startDate', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function findPlan(supabase, id) {
  const { data, error } = await supabase
    .from('service_plans').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function requirePlan({ user, supabase, id, edit = false }) {
  const access = requireService({ user, edit });
  if (access.response) return access;
  const plan = await findPlan(supabase, id);
  if (!plan) return { response: notFound('ไม่พบรอบบริการ') };
  return { plan };
}

// ── ของที่ใช้ในนัด ───────────────────────────────────────────────────────
export async function loadVisitItems(supabase, visitId) {
  const { data, error } = await supabase
    .from('service_visit_items').select('*').eq('visitId', visitId)
    .order('createdAt', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ── ตารางเข้า/เติมล่าสุดของหลายไซต์ (S-4) ────────────────────────────────
// คืน Map<siteId, { lastRefillDate, nextVisitDate }>
//   lastRefillDate = วันที่เข้าเติม/บำรุงล่าสุดที่ปิดงานแล้ว → ตัวตั้งของ refillDue
//   nextVisitDate  = นัดที่ยังไม่ถึงและยังไม่ปิด → ใช้ตัดสินว่า "มีนัดครอบแล้ว"
//
// ⚠️ สองคำสั่ง ไม่ใช่รายไซต์ — หน้าลูกค้าที่มี 12 สาขาจะยิง 24 คำขอถ้าทำแบบไร้เดียงสา
// ⚠️ นับเฉพาะ **นัดที่ปิดงานแล้ว** เป็นวันเติมล่าสุด — นัดที่ตั้งไว้แต่ยังไม่ไปไม่ได้
//    เติมอะไรจริง ถ้านับด้วยจะได้วันหมดที่เลื่อนออกไปเรื่อย ๆ ทั้งที่ขวดแห้งอยู่
export async function siteScheduleContext(supabase, siteIds = [], todayIso) {
  const out = new Map();
  const ids = [...new Set((siteIds || []).filter(Boolean))];
  if (!ids.length) return out;
  const seed = (id) => {
    if (!out.has(id)) out.set(id, { lastRefillDate: null, nextVisitDate: null });
    return out.get(id);
  };

  /* ⚠️ ซอยลิสต์ข้างนอก — URL ยาวเกิน 16 KB แล้วซ็อกเก็ตถูกตัด (lib/supabaseInChunks)
     ⭐ ลำดับไม่ต้องเรียงซ้ำ: ข้างล่างหา **ค่ามากสุดต่อไซต์** ด้วยการเทียบทีละแถว
     ซึ่งไม่ขึ้นกับลำดับ · `.order()` คงไว้ให้ fetchAll ไล่หน้าได้นิ่ง */
  const done = await fetchAllInChunks(ids, (chunk) => supabase
    .from('service_visits')
    .select('siteId, actualDate, id')
    .in('siteId', chunk)
    /* 🐞 เดิม `.eq('status','done')` ⇒ นัดที่เติมได้ 4 จาก 10 เครื่อง (partial) ไม่นับเป็น
       วันเติมล่าสุด ทั้งที่เติมจริง แล้วระบบเตือน "น้ำหอมจะหมด" ซ้ำทั้งที่เพิ่งไปเติมมา */
    .in('status', CLOSED_VISITED)
    .in('kind', ['refill', 'maintenance', 'install'])
    .order('actualDate', { ascending: false })
    .order('id', { ascending: true }));
  for (const row of done || []) {
    const entry = seed(row.siteId);
    if (row.actualDate && (!entry.lastRefillDate || row.actualDate > entry.lastRefillDate)) {
      entry.lastRefillDate = row.actualDate;
    }
  }

  /* ⭐ เช่นเดียวกัน — ข้างล่างหา **ค่าน้อยสุดต่อไซต์** ไม่ขึ้นกับลำดับ */
  const upcoming = await fetchAllInChunks(ids, (chunk) => supabase
    .from('service_visits')
    .select('siteId, scheduledDate, id')
    .in('siteId', chunk)
    /* 🐞 เดิม `.eq('status','scheduled')` ⇒ นัดที่เจ้าหน้าที่กดเริ่มงานแล้ว (in_progress) ไม่นับเป็น
       "มีนัดครอบ" ⇒ refillStatus เด้ง soon/overdue ขณะที่เจ้าหน้าที่ยืนอยู่หน้าเครื่องพอดี
       ⚠️ ร่างไม่นับ — ยังไม่ผ่านด่าน ยังไม่ใช่นัดที่ครอบอะไรได้ */
    .in('status', OPEN_STATUSES)
    .gte('scheduledDate', todayIso)
    .order('scheduledDate', { ascending: true })
    .order('id', { ascending: true }));
  for (const row of upcoming || []) {
    const entry = seed(row.siteId);
    if (row.scheduledDate && (!entry.nextVisitDate || row.scheduledDate < entry.nextVisitDate)) {
      entry.nextVisitDate = row.scheduledDate;
    }
  }

  return out;
}

// เครื่องของหลายไซต์รวดเดียว — แท็บบนหน้าลูกค้าต้องรู้ว่าเครื่องไหนใกล้หมด
export async function assetsForSites(supabase, siteIds = []) {
  const out = new Map();
  const ids = [...new Set((siteIds || []).filter(Boolean))];
  if (!ids.length) return out;
  /* 🔴 ห่อ fetchAll ด้วยเหตุผลเดียวกับ assetCountsBySite — เครื่อง 1,239 ตัวเกิน
     เพดาน 1,000 แถว และตัวเรียกส่ง siteId ของทุกไซต์เข้ามา */
  /* ⚠️ ซอยลิสต์ข้างนอก · ซอยตาม `siteId` ⇒ แถวของไซต์เดียวกันอยู่ก้อนเดียวเสมอ
     ลำดับภายในไซต์จึงไม่เสีย ไม่ต้องเรียงซ้ำ */
  const data = await fetchAllInChunks(ids, (chunk) => supabase
    .from('service_assets')
    /* ⚠️ ต้องมี `qty` ด้วย — ภาระของเจ้าหน้าที่นับเป็น **จุด** ไม่ใช่แถว (visitLoad.js)
       ชุดอุปกรณ์ 1 แถวมีได้หลายจุด (สบู่ 242 จุด) · ไม่ดึงมา = ตารางจัดคิวประเมินงานต่ำ
       โดยไม่มีอะไรฟ้อง (พบตอน UAT 2026-08-28: ไซต์ 14 จุด ขึ้นเป็น "3 จุด") */
    .select('id, siteId, label, status, condition, qty, bottleMl, mlPerDay, installedAt, productName')
    .in('siteId', chunk).order('id', { ascending: true }));
  for (const row of data || []) {
    if (!out.has(row.siteId)) out.set(row.siteId, []);
    out.get(row.siteId).push(row);
  }
  return out;
}

// ── ไซต์ที่นัดชุดหนึ่งอ้างถึง — ปฏิทินต้องรู้ชื่อ/เขตวิ่งงาน/ช่วงเวลาเข้าไซต์ ───
// ⚠️ ยิงรวดเดียวด้วย `in` ไม่ใช่รายนัด (สัปดาห์หนึ่ง 40 นัด = 40 คำขอ)
export async function sitesForVisits(supabase, visits = []) {
  const ids = [...new Set(visits.map((v) => v.siteId).filter(Boolean))];
  if (!ids.length) return new Map();
  /* ผลเข้า Map ทันที ⇒ ลำดับไม่มีความหมาย */
  const data = await fetchAllInChunks(ids, (chunk) => supabase
    .from('service_sites')
    .select('id, code, name, routeZone, customerName, accessFrom, accessTo, accessDays, accessNote, mapUrl, contactName, contactPhone')
    .in('id', chunk).order('id', { ascending: true }));
  return new Map((data || []).map((row) => [row.id, row]));
}

// ── คิวงานของช่าง — `my-visits` แบบมีช่วงวัน (แผน operation-crew §5 · S2) ────────────────────────
//
// ⭐ **สองชั้น ไม่ใช่ก้อนเดียว** (R15) — `loadMyWorkRows` = แถวล้วน (ไม่มีชื่อ · เครื่อง · พื้นที่) ⇒ ป้ายนับบนเมนู
//    ที่ยิงทุก 120 วิ ต่อแท็บ จะถามตัวนี้ใน PR-3 (C11) · `enrichMyWork` = ของประกอบการ์ด จ่ายเฉพาะตอนเปิดจอ
// 🔴 **ไม่มีช่องแพ็ก/แผนรอบในคิวงาน** (มติเจ้าของ 28/09 Q2) — จำนวนแพ็กต่อรอบของโซนขึ้นที่ GET ของงานใบเดียว
//    (S9) · ห้ามเรียก `visitBundle` จากที่นี่ (ลากแผน/แพ็กของทั้งไซต์มาด้วย)

/* ขอบซ้ายของ "ส่งกลับให้แก้" — นัดประเมินที่ปิดเกินนี้ไม่ถูกถามอีก (เท่าขอบซ้ายของปฏิทินช่าง) */
export const SENT_BACK_DAYS = 31;
/* การ์ดบอกเครื่องชำรุดได้สองตัว ("1 เครื่องชำรุด · OV-05 · หน้าลิฟต์ ชั้น 1" · R13) — ที่เหลือเป็นตัวเลข */
export const BROKEN_ASSETS_SHOWN = 2;

/**
 * แถวเธรด "ส่งกลับให้ช่างแก้" / "ช่างแจ้งว่าแก้แล้ว" ของ **หลายใบรวดเดียว** — คู่ของ `surveyRepo.loadSendBackRows` (ใบเดียว)
 * ⚠️ ไม่มี `.limit(20)` แบบตัวใบเดียว — เพดานนั้นเป็นต่อใบ ใช้กับหลายใบไม่ได้ · ตัวตัดสินเลือกแถวล่าสุดเอง
 * ⚠️ ซอยลิสต์ข้างนอก + ไล่หน้าข้างใน (fetchAllInChunks) — ลิสต์ใบโตตาม scope
 * @returns `Map<requestId, rows[]>` · @throws error ของ Supabase ตัวแรกที่เจอ
 */
export async function loadSendBackRowsByRequest(supabase, requestIds = []) {
  const out = new Map();
  const rows = await fetchAllInChunks(requestIds, (chunk) => supabase
    .from('entity_updates')
    .select('id, kind, body, meta, "entityId", "authorId", "authorName", "createdAt"')
    .eq('entityType', 'dept_request')
    .in('entityId', chunk)
    .in('kind', [SEND_BACK_KIND, SEND_BACK_DONE_KIND])
    .order('createdAt', { ascending: false })
    .order('id', { ascending: true }));
  for (const row of rows) {
    const key = String(row.entityId);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(row);
  }
  return out;
}

/**
 * นัดที่จอประเมินของแต่ละใบจะเปิด — **กติกาเดียวกับ `findSurveyVisit(..., { preferOpen: true })`**
 * (นัดที่ยังกินสิทธิ์ของใบก่อน · ไม่มีก็ใบล่าสุดตาม `createdAt` ทุกสถานะ · ทุกคน · ทุกชนิดนัด เหมือนตัวนั้นที่กรองแค่ `requestId`)
 * ⚠️ ถามทั้งใบ ไม่ใช่เฉพาะนัดของฉัน — นัดที่ใหม่กว่าของช่างอีกคน/นัดที่ถูกยกเลิก คือตัวที่จอเห็นจริง
 * @returns `Map<requestId, visit>` · @throws error ของ Supabase ตัวแรกที่เจอ
 */
async function loadSurveyScreenVisits(supabase, requestIds) {
  const rows = await fetchAllInChunks(requestIds, (chunk) => supabase
    .from('service_visits').select('id, "requestId", status, "createdAt"')
    .in('requestId', chunk)
    .order('createdAt', { ascending: false })
    .order('id', { ascending: true }));
  const newer = (a, b) => String(a.createdAt || '') > String(b.createdAt || '');
  const out = new Map();
  for (const row of rows) {
    const key = String(row.requestId);
    const seen = out.get(key);
    if (!seen) { out.set(key, row); continue; }
    // นัดค้างชนะเสมอ · ชั้นเดียวกันเอาใบใหม่กว่า (ตัวเดียวกับ order createdAt desc + limit 1)
    const rank = Number(holdsRequestSlot(row)) - Number(holdsRequestSlot(seen));
    if (rank > 0 || (rank === 0 && newer(row, seen))) out.set(key, row);
  }
  return out;
}

/**
 * นัดประเมินของฉันที่ปิดไปแล้ว แต่หัวหน้า **ส่งกลับให้แก้และยังค้าง** (R16 · มติเจ้าของ 28/09 Q7: ช่องค้าง + ป้าย)
 *
 * ⭐ นัดไม่ถูกเปิดใหม่ตอนส่งกลับ (ไม่ใช่รอบวัดใหม่) ⇒ ไม่มีใครเห็นมันในคิวของวันไหนเลย ถ้าไม่ถามตรงนี้
 * ⭐ "ค้าง" = **ตามที่จอประเมินเห็น** (`surveySendBackOnSheet`) — ใบที่ส่งผล/ยกเลิก/ปิดไปแล้ว เรื่องค้างไม่ค้างแล้ว
 *    (ช่างแก้ต่อไม่ได้) · ไม่ถามข้อนี้ = การ์ดค้างพาไปจอที่ไม่มีปุ่มให้กด (บทเรียน review 26/09 ของแถบเดียวกัน)
 * ⭐ **นัดต้องเป็นตัวเดียวกับที่จอเปิด** (`loadSurveyScreenVisits`) — จอขึ้นแถบเฉพาะนัดที่ปิดแล้วและไม่ใช่ `unable`
 *    และตัดสิน `canWrite` จากนัดนั้น · 🐞 review S2 28/09: ของเดิมเอานัดล่าสุด **ของฉัน** แล้วข้ามเฉพาะใบที่ฉันมีนัดเปิด
 *    **ในช่วงวันที่ขอ** ⇒ ใบที่มีนัดใหม่กว่าของช่างอีกคน · นัดเปิดของฉันที่อยู่นอกช่วง (+20 วัน) · นัดล่าสุดถูกยกเลิก
 *    = การ์ดค้าง (และป้ายนับใน PR-3) ที่เปิดแล้วไม่มีอะไรให้ทำ ค้างได้ถึง 31 วัน · ช่องค้างเปลี่ยนตามช่วงวันที่ขอด้วย
 * ⭐ **ใบที่ทุกพื้นที่กลายเป็น "ประเมินจากแบบ" แล้ว ไม่ค้าง** (mig 0408) — ไม่มีนัดเข้าพื้นที่ ไม่มีอะไรให้ช่างแก้
 *    ⇒ อ่านวิธีประเมินรายพื้นที่ของใบที่ค้าง แล้วให้ `surveySendBackOnSheet` ตัดสิน (`needsVisit`) ตัวเดียวกับจอ
 * ⚠️ ถามใบคำร้อง · นัดทั้งใบ · วิธีประเมินของพื้นที่ เฉพาะใบที่ค้างจริง ⇒ วันปกติ (ไม่มีใครส่งกลับ) ไม่มีคำขอที่สาม
 * @returns นัด + `sendBack` (รอบที่ค้าง: `{ id, at, byId, byName, note, items }`) เรียงรอนานสุดก่อน
 */
async function loadSentBackSurveys(supabase, { assigneeId, since }) {
  // ของ "ฉัน" เท่านั้น — ทั้งฝ่าย (scope=team) ไม่มีเจ้าของให้ตาม
  if (!assigneeId) return [];
  const closed = await fetchAll(() => whereCrewOf(supabase
    .from('service_visits').select('*')
    .eq('kind', SURVEY_VISIT_KIND)
    .in('status', SENT_BACK_VISITED)
    // DB บังคับว่าสถานะปิดมีวันเข้าจริงเสมอ (mig 0300) ⇒ กรองที่ `actualDate` ได้ตรง ๆ
    .gte('actualDate', since), assigneeId)
    .order('actualDate', { ascending: false })
    .order('id', { ascending: true }));

  const mine = new Map();
  const requestKeys = new Set();
  for (const visit of closed) {
    if (visit.requestId == null) continue;
    mine.set(String(visit.id), visit);
    requestKeys.add(String(visit.requestId));
  }
  if (!requestKeys.size) return [];

  const threads = await loadSendBackRowsByRequest(supabase, [...requestKeys]);
  const pending = [...requestKeys]
    .map((key) => ({ key, state: surveySendBackState(threads.get(key) || []) }))
    .filter((hit) => hit.state.pending);
  if (!pending.length) return [];

  const keys = pending.map((hit) => hit.key);
  const [requests, screenVisits, zones] = await Promise.all([
    fetchAllInChunks(keys, (chunk) => supabase
      .from('dept_requests').select('id, status, "answeredAt", "closedAt", "cancelledAt"')
      .in('id', chunk).order('id', { ascending: true })),
    loadSurveyScreenVisits(supabase, keys),
    /* วิธีประเมินรายพื้นที่ของใบที่ค้าง — แค่พอตอบ `surveyNeedsVisit` (สถานะตัด + วิธี) ไม่อ่านผลวัด
       🔴 อ่านพลาดต้องโยน (fetchAll) — เดาว่า "ยังค้าง" = การ์ดพาไปจอที่ไม่มีปุ่ม · เดาว่า "ไม่ค้าง" = งานแก้หายเงียบ */
    fetchAllInChunks(keys, (chunk) => supabase
      .from('service_survey_zones').select('id, "requestId", status, method')
      .in('requestId', chunk).order('id', { ascending: true })),
  ]);
  const requestById = new Map(requests.map((row) => [String(row.id), row]));
  const zonesByRequest = new Map();
  for (const zone of zones) {
    const key = String(zone.requestId);
    if (!zonesByRequest.has(key)) zonesByRequest.set(key, []);
    zonesByRequest.get(key).push(zone);
  }

  const out = [];
  for (const { key, state } of pending) {
    // ใบหายไปแล้ว = ไม่มีจอประเมินให้เปิด — ไม่ใช่ "ค้าง"
    const request = requestById.get(key);
    if (!request) continue;
    // นัดที่จอเปิดต้องเป็นนัดปิดแล้ว (ไม่ใช่ `unable`) ของฉัน — ชุด `closed` ข้างบนกรองทั้งสามข้อไว้แล้ว
    const screen = screenVisits.get(key);
    const visit = screen && isClosedVisit(screen) && screen.status !== 'unable' ? mine.get(String(screen.id)) : null;
    if (!visit) continue;
    // ใบที่ไม่มีแถวพื้นที่ = ต้องมีนัด (กติกาของ `surveyNeedsVisit`) ⇒ ค้างตามเดิม
    const onSheet = surveySendBackOnSheet(state, request, {
      needsVisit: surveyNeedsVisit(zonesByRequest.get(key) || []),
    });
    if (onSheet?.pending) out.push({ ...visit, sendBack: onSheet.sentBack });
  }
  return out.sort((a, b) => String(a.sendBack?.at || '').localeCompare(String(b.sendBack?.at || '')));
}

/**
 * **แถวของคิวงาน** — ตัวเดียวกับที่ป้ายนับบนเมนูจะถาม (PR-3) · ไม่อ่านชื่อ เครื่อง หรือผลวัดของพื้นที่เลย (R15)
 *   (ข้อเดียวที่แตะตารางพื้นที่: วิธีประเมินสี่คอลัมน์ของใบที่มีส่งกลับค้าง — `loadSentBackSurveys` · วันปกติไม่ยิง)
 * @param assigneeId เจ้าของคิว (null = ทั้งฝ่าย · scope=team)
 * @param from/to    ช่วงวันของปฏิทิน (ผู้เรียกตรวจ/บีบช่วงมาแล้ว) · today = วันไทย (`businessDate`)
 * @returns `{ visits, overdue, sentBack }`
 *   visits   = นัดบนตารางในช่วงวัน **รวมที่ปิดแล้ว** (ปฏิทิน/แถบวันนับด้วย) — ร่าง/ยกเลิก/เลื่อน ตัดที่ query
 *   overdue  = นัดเปิดที่เลยวันแล้ว **ไม่มีขอบล่าง** · ⚠️ ช่วงวันที่ย้อนเข้าอดีตซ้อนกับ `visits` ได้ — คนละคำถาม
 *              (ปฏิทินถามว่า "วันนั้นมีอะไร" · ช่องค้างถามว่า "อะไรยังไม่จบ") จอเลือกเองว่าวาดจากลิสต์ไหน
 *   sentBack = นัดประเมินที่ปิดแล้วใน 31 วัน แต่หัวหน้าส่งกลับให้แก้และยังค้าง (`loadSentBackSurveys`)
 *              ⚠️ **ไม่ขึ้นกับช่วงวันที่ขอ** — ป้ายนับ (PR-3) กับจอขอคนละช่วง ต้องได้ช่องค้างชุดเดียวกัน
 * @throws error ของ Supabase ตัวแรกที่เจอ — คิวที่อ่านไม่ครบต้องขึ้น error ไม่ใช่วันว่าง
 */
export async function loadMyWorkRows(supabase, { assigneeId = null, from, to, today }) {
  if (!from || !to || !today) throw new Error('loadMyWorkRows: ต้องระบุ from · to · today');
  const [visits, overdue, sentBack] = await Promise.all([
    loadVisits(supabase, { from, to, assigneeId, liveOnly: true }),
    loadOverdueVisits(supabase, { assigneeId, before: today }),
    loadSentBackSurveys(supabase, { assigneeId, since: addDays(today, -SENT_BACK_DAYS) }),
  ]);
  return { visits, overdue, sentBack };
}

/* เครื่อง "ใช้งาน" ของหลายไซต์ — ชุดเดียวกับที่หน้างานบังคับให้ตอบ (`pendingAssets`: status active)
   ⚠️ select แคบ ไม่ใช่ `assetsForSites` — การ์ดต้องการรหัส/ตำแหน่งของเครื่องชำรุด (code · floor · spot)
      ซึ่งตัวนั้นไม่ได้ select (คอลัมน์มีจริง: code mig 0344 · floor/spot mig 0298) และไม่ต้องการน้ำหอม/ขวด
   ⚠️ ซอยตาม `siteId` + ไล่หน้า — ไซต์คลังถือเครื่องเกินพัน (ไม่ควรมีนัดบริการ แต่ห้ามตัดเงียบถ้ามี) */
async function crewAssetsForSites(supabase, siteIds = []) {
  const out = new Map();
  const rows = await fetchAllInChunks(siteIds, (chunk) => supabase
    .from('service_assets')
    .select('id, siteId, code, label, status, condition, floor, spot')
    .in('siteId', chunk)
    .eq('status', 'active')
    .order('id', { ascending: true }));
  for (const row of rows) {
    if (!out.has(row.siteId)) out.set(row.siteId, []);
    out.get(row.siteId).push(row);
  }
  return out;
}

/* จำนวนพื้นที่ของใบประเมิน — ไม่นับพื้นที่ที่ถูกตัด (`survey.js`: ตัดแล้วไม่นับรวมทุกตัวเลข) */
async function surveyZoneCounts(supabase, requestIds = []) {
  const out = new Map();
  const rows = await fetchAllInChunks(requestIds, (chunk) => supabase
    .from('service_survey_zones').select('id, "requestId", status')
    .in('requestId', chunk)
    .order('id', { ascending: true }));
  for (const row of rows) {
    const key = String(row.requestId);
    if (!out.has(key)) out.set(key, 0);
    if ((row.status || 'ok') !== 'cut') out.set(key, out.get(key) + 1);
  }
  return out;
}

const brokenLine = (asset) => ({
  code: asset.code || null, label: asset.label || null, floor: asset.floor || null, spot: asset.spot || null,
});

/**
 * **ของประกอบการ์ดงาน** — เฉพาะ `my-visits` (ป้ายนับไม่ต้องจ่าย · R15) · ต่อนัดเพิ่ม:
 *   crewRole      'lead' | 'helper' | null — บทบาทของ **เจ้าของคิว** (`personId`) บนนัดนั้น
 *                 ⚠️ ไม่ใช่ของคนเปิดจอ: หัวหน้าที่ดูคิวแทน (?user=) ต้องเห็นว่าช่างคนนั้นเป็นคนไปหรือผู้ช่วย
 *   crew          `[{ id, name, lead, you, gone? }]` — `you` = คนเปิดจอ (`viewerId`) · crewUnknown = อ่านชื่อพลาด
 *   machineCount  เครื่องใช้งานของไซต์ (นับแถว ไม่ใช่ `qty`) · brokenCount · brokenAssets ≤ 2 `{ code, label, floor, spot }`
 *   zoneCount     พื้นที่ของใบประเมิน (ไม่นับที่ตัด) — นัดงานเครื่องเป็น null · นัดประเมินไม่มีตัวเลขเครื่อง (null)
 * ⭐ ทุกอย่างอ่าน **ครั้งเดียวต่อคำขอ** — ชื่อต่อผู้ช่วยที่ไม่ซ้ำ (C10) · เครื่องต่อไซต์ · พื้นที่ต่อใบ
 * ⚠️ นัดซ้ำระหว่างลิสต์ (ช่วงวันย้อนเข้าอดีต) ได้ของประกอบชุดเดียวกัน — ไม่อ่านซ้ำ
 * @throws error ของ Supabase ตัวแรกที่เจอ (เครื่อง/พื้นที่) · ชื่ออ่านพลาดไม่โยน (ของประกอบ)
 */
export async function enrichMyWork(supabase, lists = {}, { personId = null, viewerId = null } = {}) {
  const visits = Array.isArray(lists.visits) ? lists.visits : [];
  const overdue = Array.isArray(lists.overdue) ? lists.overdue : [];
  const sentBack = Array.isArray(lists.sentBack) ? lists.sentBack : [];
  const all = [...visits, ...overdue, ...sentBack];
  const isSurvey = (visit) => visit?.kind === SURVEY_VISIT_KIND;
  const uniq = (values) => [...new Set(values.filter((v) => v != null && v !== '').map(String))];

  const [names, assetsBySite, zonesByRequest] = await Promise.all([
    loadCrewNames(supabase, all.flatMap(visitHelperIds)),
    crewAssetsForSites(supabase, uniq(all.filter((v) => !isSurvey(v)).map((v) => v.siteId))),
    surveyZoneCounts(supabase, uniq(all.filter(isSurvey).map((v) => v.requestId))),
  ]);

  const enrich = (visit) => {
    const { crew, unknown } = visitCrewFrom(visit, names, { viewerId });
    const out = { ...visit, crewRole: visitCrewRole(visit, personId), crew, crewUnknown: unknown };
    if (isSurvey(visit)) {
      return {
        ...out, machineCount: null, brokenCount: null, brokenAssets: [],
        zoneCount: visit.requestId != null ? (zonesByRequest.get(String(visit.requestId)) ?? 0) : 0,
      };
    }
    const machines = assetsBySite.get(visit.siteId) || [];
    const broken = machines
      .filter((asset) => asset.condition === 'broken')
      .sort((a, b) => String(a.code || a.label || '').localeCompare(String(b.code || b.label || ''), 'th'));
    return {
      ...out,
      machineCount: machines.length,
      brokenCount: broken.length,
      brokenAssets: broken.slice(0, BROKEN_ASSETS_SHOWN).map(brokenLine),
      zoneCount: null,
    };
  };
  return { visits: visits.map(enrich), overdue: overdue.map(enrich), sentBack: sentBack.map(enrich) };
}
