// Data-access helpers for the งานบริหาร (mgmt) module — mirrors the
// lib/pm/projectsRepo + lib/master/* repo pattern. API routes load/list through
// here instead of re-querying Supabase inline. `supabase` = service-role client.
//
// ปี: กรองจากวันที่จริง (dueDate / meetingDate) ไม่ partition — งานที่ไม่มีวันที่
// จะไม่ติดตัวกรองปี (แสดงในมุมมอง "ทั้งหมด" หรือ bucket "ไม่มีกำหนด").
import { genId } from '@/lib/id';

// รหัสภายในของแต่ละ entity (collision-resistant, ไม่ใช่ human code).
export const newTaskId = () => genId('MT');
export const newMeetingId = () => genId('MG');
export const newRockId = () => genId('RI');

// ช่วงวันที่ทั้งปี (ค.ศ.) → [from, to] แบบ inclusive สำหรับ .gte/.lte.
function yearRange(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return null;
  return [`${y}-01-01`, `${y}-12-31`];
}

// ── Tasks ─────────────────────────────────────────────────────────────
export async function listTasks(supabase, { year, deptCode, status, priority } = {}) {
  let q = supabase.from('mgmt_tasks').select('*').is('deletedAt', null);
  if (deptCode) q = q.eq('deptCode', deptCode);
  if (status) q = q.eq('status', status);
  if (priority) q = q.eq('priority', priority);
  const range = year ? yearRange(year) : null;
  if (range) q = q.gte('dueDate', range[0]).lte('dueDate', range[1]);
  q = q.order('dueDate', { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function loadTask(supabase, id) {
  const { data, error } = await supabase.from('mgmt_tasks').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// ── Meetings ──────────────────────────────────────────────────────────
export async function listMeetings(supabase, { year, deptCode, followUp } = {}) {
  let q = supabase.from('mgmt_meetings').select('*').is('deletedAt', null);
  if (deptCode) q = q.eq('deptCode', deptCode);
  if (followUp) q = q.eq('followUp', followUp);
  const range = year ? yearRange(year) : null;
  if (range) q = q.gte('meetingDate', range[0]).lte('meetingDate', range[1]);
  q = q.order('meetingDate', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function loadMeeting(supabase, id) {
  const { data, error } = await supabase.from('mgmt_meetings').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// ── Rock & Improve (1 แถว/แผนก/ปี) ───────────────────────────────────
export async function listRockImprove(supabase, { year } = {}) {
  let q = supabase.from('mgmt_rock_improve').select('*').is('deletedAt', null);
  if (year) q = q.eq('year', Number(year));
  q = q.order('deptCode', { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ── Departments (taxonomy) ────────────────────────────────────────────
export async function listDepartments(supabase, { includeInactive = false } = {}) {
  let q = supabase.from('mgmt_departments').select('*');
  if (!includeInactive) q = q.eq('active', true);
  q = q.order('sortOrder', { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ── Updates feed (ประวัติการแก้ไข, polymorphic) ──────────────────────
// เขียนหลัง write สำเร็จ (คู่กับ recordAudit). ไม่ throw — feed พลาดไม่ทำ action พัง.
export async function appendUpdate(supabase, { entityType, entityId, kind = 'edit', body = null, meta = {}, user = null }) {
  try {
    await supabase.from('mgmt_updates').insert({
      entityType,
      entityId: String(entityId),
      kind,
      body,
      meta,
      authorId: user?.id != null ? String(user.id) : null,
      authorName: user?.name ?? null,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[mgmt] appendUpdate failed', entityType, entityId, e?.message || e);
  }
}

export async function listUpdates(supabase, { entityType, entityId } = {}) {
  let q = supabase.from('mgmt_updates').select('*');
  if (entityType) q = q.eq('entityType', entityType);
  if (entityId) q = q.eq('entityId', String(entityId));
  q = q.order('createdAt', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
