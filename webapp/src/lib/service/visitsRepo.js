// ── Data access ของรอบบริการ + ตารางนัด (mig 0188) ───────────────────────
import { notFound } from '@/lib/http';
import { requireService } from './sitesRepo';

// ── นัด ──────────────────────────────────────────────────────────────────
// ปฏิทินอ่านเป็นช่วงวันเสมอ · siteId ใช้ตอนดูประวัติของไซต์เดียว
export async function loadVisits(supabase, { from = null, to = null, siteId = null, assigneeId = null } = {}) {
  let query = supabase.from('service_visits').select('*');
  if (from) query = query.gte('scheduledDate', from);
  if (to) query = query.lte('scheduledDate', to);
  if (siteId) query = query.eq('siteId', siteId);
  if (assigneeId) query = query.eq('assigneeId', assigneeId);
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

export async function requireVisit({ user, supabase, id, edit = false }) {
  const access = requireService({ user, edit });
  if (access.response) return access;
  const visit = await findVisit(supabase, id);
  if (!visit) return { response: notFound('ไม่พบนัดเข้าบริการ') };
  return { visit };
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
    .eq('status', 'done')
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
    .eq('status', 'scheduled')
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
  const { data, error } = await supabase
    .from('service_assets')
    .select('id, siteId, label, status, bottleMl, mlPerDay, installedAt, productName')
    .in('siteId', ids);
  if (error) throw error;
  for (const row of data || []) {
    if (!out.has(row.siteId)) out.set(row.siteId, []);
    out.get(row.siteId).push(row);
  }
  return out;
}

// ── ไซต์ที่นัดชุดหนึ่งอ้างถึง — ปฏิทินต้องรู้ชื่อ/โซน/ช่วงเวลาเข้าไซต์ ───
// ⚠️ ยิงรวดเดียวด้วย `in` ไม่ใช่รายนัด (สัปดาห์หนึ่ง 40 นัด = 40 คำขอ)
export async function sitesForVisits(supabase, visits = []) {
  const ids = [...new Set(visits.map((v) => v.siteId).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('service_sites')
    .select('id, code, name, zone, customerName, accessFrom, accessTo, accessDays, accessNote, mapUrl, contactName, contactPhone')
    .in('id', ids);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, row]));
}
