// ── Data access ของรอบบริการ + ตารางนัด (mig 0186) ───────────────────────
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
