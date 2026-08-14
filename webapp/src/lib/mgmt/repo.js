// Data-access helpers for the งานบริหาร (mgmt) module — mirrors the
// lib/pm/projectsRepo + lib/master/* repo pattern. API routes load/list through
// here instead of re-querying Supabase inline. `supabase` = service-role client.
//
// ปี: กรองจากวันที่จริง (dueDate / meetingDate) ไม่ partition — และ **แถวที่ยังไม่มี
// วันที่ต้องติดทุกปี** ห้ามให้ตัวกรองปีกลืนหายไป
//
// 🐞 เดิมเขียนเป็น .gte().lte() ตรง ๆ โดยคิดว่าแถวไม่มีวันที่จะไปโผล่ในมุมมอง "ทั้งหมด"
// แต่มุมมองนั้นไม่เคยมีจริง — หน้ารายการส่ง year ไปทุกครั้ง (ตั้งต้นปีปัจจุบัน) และใน SQL
// `NULL >= '2026-01-01'` ไม่เป็นจริง งานที่ไม่ได้กรอกวันสิ้นสุดจึงบันทึกติดแต่ไม่โผล่มา
// อีกเลยหลังรีเฟรช (หน้าเพิ่งเห็นเพราะ upsertRow ยัดเข้า state ฝั่ง client) — ดูเหมือน
// ข้อมูลหาย ทั้งที่แถวยังอยู่ครบ. เอกสาร/ไฟล์แนบของงานนั้นก็เข้าไม่ถึงตามไปด้วย
import { genId } from '@/lib/id';

// รหัสภายในของแต่ละ entity (collision-resistant, ไม่ใช่ human code).
export const newTaskId = () => genId('MT');
export const newMeetingId = () => genId('MG');
export const newRockId = () => genId('RI');

// ช่วงวันที่ทั้งปี (ค.ศ.) → [from, to] แบบ inclusive.
function yearRange(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return null;
  return [`${y}-01-01`, `${y}-12-31`];
}

// เงื่อนไข "อยู่ในปีนี้ **หรือ** ยังไม่มีวันที่" เป็นสตริงของ PostgREST สำหรับ .or()
// ⚠ ต้องเป็น .or() ก้อนเดียว — .is(col, null) ต่อท้าย .gte/.lte จะกลายเป็น AND
// (แถวเดียวมีวันที่และไม่มีวันที่พร้อมกันไม่ได้) ผลลัพธ์คือว่างเปล่าเสมอ
export function dateInYearOrNull(column, [from, to]) {
  return `${column}.is.null,and(${column}.gte.${from},${column}.lte.${to})`;
}

// ── Tasks ─────────────────────────────────────────────────────────────
export async function listTasks(supabase, { year, deptCode, status, priority } = {}) {
  let q = supabase.from('mgmt_tasks').select('*').is('deletedAt', null);
  if (deptCode) q = q.eq('deptCode', deptCode);
  if (status) q = q.eq('status', status);
  if (priority) q = q.eq('priority', priority);
  const range = year ? yearRange(year) : null;
  if (range) q = q.or(dateInYearOrNull('dueDate', range));
  // งานไม่มีกำหนดไปท้ายลิสต์ — ยังเห็นได้ แต่ไม่แย่งที่งานที่มีเส้นตายจริง
  q = q.order('dueDate', { ascending: true, nullsFirst: false });
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
  if (range) q = q.or(dateInYearOrNull('meetingDate', range));
  // วันที่ประชุมบังคับกรอกตอนสร้าง แต่ตอนแก้ล้างเป็นว่างได้ (meetingDate || null)
  // — ประตูเดียวกันจึงต้องกันไว้เหมือนกัน ไม่งั้นการประชุมหายทั้งใบ
  q = q.order('meetingDate', { ascending: false, nullsFirst: false });
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
