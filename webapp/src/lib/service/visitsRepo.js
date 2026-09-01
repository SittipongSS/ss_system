// ── Data access ของรอบบริการ + ตารางนัด (mig 0188) ───────────────────────
import { forbidden, notFound } from '@/lib/http';
import { canDoFieldWork } from '@/lib/permissions';
import { visitWriteAccess } from './visitAccess';
import { VISIT_STATUSES, isClosedVisit, isOpenVisit } from './visitStatus';
import { requireService } from './sitesRepo';
import { fetchAll } from '@/lib/supabaseFetchAll';
/* ⚠️ PostgREST ต้องการ **ลิสต์ค่า** ไม่ใช่ฟังก์ชัน — ประกอบจากนิยามกลางที่
   visitStatus.js เพื่อไม่ให้มีชุดสถานะชุดที่หกในระบบ */
const CLOSED_VISITED = VISIT_STATUSES.filter((s) => isClosedVisit({ status: s }));
const OPEN_STATUSES = VISIT_STATUSES.filter((s) => isOpenVisit({ status: s }));

// ── นัด ──────────────────────────────────────────────────────────────────
// ปฏิทินอ่านเป็นช่วงวันเสมอ · siteId ใช้ตอนดูประวัติของไซต์เดียว
export async function loadVisits(supabase, { from = null, to = null, siteId = null, assigneeId = null } = {}) {
  let query = supabase.from('service_visits').select('*');
  if (from) query = query.gte('scheduledDate', from);
  if (to) query = query.lte('scheduledDate', to);
  if (siteId) query = query.eq('siteId', siteId);
  /* ⭐ **เจ้าหน้าที่ที่ไปด้วยต้องเห็นงานของตัวเองด้วย** (F-6 · มอบหมายหลายคน) — ของเดิม
     กรองเฉพาะ `assigneeId` ⇒ คนที่ถูกใส่เป็นผู้ช่วยจะไม่เห็นนัดนั้นในงานวันนี้เลย
     แล้ววันนั้นเขาจะไม่รู้ว่าต้องไปไหน · `assistantIds` เป็น jsonb array จึงใช้ `cs`
     (contains) ไม่ใช่ `eq` · `.or()` ก้อนเดียวเพราะสองเงื่อนไขนี้เป็น "อย่างใดอย่างหนึ่ง" */
  if (assigneeId) {
    /* ⚠️ **ค่าถูกยัดลงสตริงตัวกรองของ PostgREST ตรง ๆ** — id ที่มีวงเล็บหรือจุลภาค
       จะแตกไวยากรณ์ `or()` แล้วกลายเป็นตัวกรองอื่นที่เราไม่ได้ตั้งใจ · id ของระบบ
       เป็น uuid/สตริงรหัสเสมอ จึงกรองอักขระให้เหลือชุดที่ปลอดภัยก่อนเสมอ
       (ค่านี้มาจาก query param `assignee` ได้ด้วย ไม่ได้มาจาก session อย่างเดียว) */
    const safeId = String(assigneeId).replace(/[^A-Za-z0-9_-]/g, '');
    if (safeId) {
      query = query.or(`assigneeId.eq.${safeId},assistantIds.cs.["${safeId}"]`);
    }
  }
  const { data, error } = await query
    .order('scheduledDate', { ascending: true })
    .order('startTime', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function findVisit(supabase, id) {
  const { data, error } = await supabase
    .from('service_visits').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * ด่านของ "นัดใบนี้" — คืน `{ visit, ownWorkOnly }` หรือ `{ response }`
 *
 * ⭐ **เจ้าหน้าที่หน้างานเขียนได้เฉพาะใบของตัวเอง** (มติผู้ใช้ 2026-08-30) — ตำแหน่ง Operation
 *    ถือ `service:work` ไม่ใช่ `service:edit` ⇒ ตกด่านฝ่ายชั้นนอก แต่ต้องไปต่อได้ถ้า
 *    นัดใบนี้เป็นของเขา · `ownWorkOnly: true` บอกผู้เรียกว่า **ต้องจำกัดช่องที่แก้ได้**
 *    (ดู `FIELD_WORK_FIELDS` ใน route ของนัด) เพราะคนกลุ่มนี้ไม่ได้แก้ตาราง
 * 🔴 อ่านแถวก่อนตัดสิน — ด่านนี้เป็นด่าน *รายใบ* ไม่ใช่ด่าน cap ล้วน
 */
export async function requireVisit({ user, supabase, id, edit = false }) {
  const access = requireService({ user, edit });
  const blocked = !!access.response;
  // ตกด่านชั้นนอกด้วยเหตุอื่นที่ไม่ใช่ "แก้ไม่ได้" (ไม่ล็อกอิน · อ่านไม่ได้) = จบตรงนี้
  if (blocked && (!edit || !canDoFieldWork(user))) return access;

  const visit = await findVisit(supabase, id);
  if (!visit) return { response: notFound('ไม่พบนัดเข้าบริการ') };

  const decision = visitWriteAccess({ user, visit, canEditAll: !blocked });
  if (!decision.ok) return decision.error ? { response: forbidden(decision.error) } : access;
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

  const { data: done, error: doneError } = await supabase
    .from('service_visits')
    .select('siteId, actualDate')
    .in('siteId', ids)
    /* 🐞 เดิม `.eq('status','done')` ⇒ นัดที่เติมได้ 4 จาก 10 เครื่อง (partial) ไม่นับเป็น
       วันเติมล่าสุด ทั้งที่เติมจริง แล้วระบบเตือน "น้ำหอมจะหมด" ซ้ำทั้งที่เพิ่งไปเติมมา */
    .in('status', CLOSED_VISITED)
    .in('kind', ['refill', 'maintenance', 'install'])
    .order('actualDate', { ascending: false });
  if (doneError) throw doneError;
  for (const row of done || []) {
    const entry = seed(row.siteId);
    if (row.actualDate && (!entry.lastRefillDate || row.actualDate > entry.lastRefillDate)) {
      entry.lastRefillDate = row.actualDate;
    }
  }

  const { data: upcoming, error: upcomingError } = await supabase
    .from('service_visits')
    .select('siteId, scheduledDate')
    .in('siteId', ids)
    /* 🐞 เดิม `.eq('status','scheduled')` ⇒ นัดที่เจ้าหน้าที่กดเริ่มงานแล้ว (in_progress) ไม่นับเป็น
       "มีนัดครอบ" ⇒ refillStatus เด้ง soon/overdue ขณะที่เจ้าหน้าที่ยืนอยู่หน้าเครื่องพอดี
       ⚠️ ร่างไม่นับ — ยังไม่ผ่านด่าน ยังไม่ใช่นัดที่ครอบอะไรได้ */
    .in('status', OPEN_STATUSES)
    .gte('scheduledDate', todayIso)
    .order('scheduledDate', { ascending: true });
  if (upcomingError) throw upcomingError;
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
  const data = await fetchAll(() => supabase
    .from('service_assets')
    /* ⚠️ ต้องมี `qty` ด้วย — ภาระของเจ้าหน้าที่นับเป็น **จุด** ไม่ใช่แถว (visitLoad.js)
       ชุดอุปกรณ์ 1 แถวมีได้หลายจุด (สบู่ 242 จุด) · ไม่ดึงมา = ตารางจัดคิวประเมินงานต่ำ
       โดยไม่มีอะไรฟ้อง (พบตอน UAT 2026-08-28: ไซต์ 14 จุด ขึ้นเป็น "3 จุด") */
    .select('id, siteId, label, status, condition, qty, bottleMl, mlPerDay, installedAt, productName')
    .in('siteId', ids).order('id', { ascending: true }));
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
  const { data, error } = await supabase
    .from('service_sites')
    .select('id, code, name, routeZone, customerName, accessFrom, accessTo, accessDays, accessNote, mapUrl, contactName, contactPhone')
    .in('id', ids);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, row]));
}
