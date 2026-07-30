// ── Data access + ด่านสิทธิ์ของ "ไลน์ผลิต" (mig 0184) ────────────────────
// แยกจาก route.js เพราะไฟล์ route ของ Next ส่งออกได้เฉพาะ HTTP method
import { forbidden, unauthorized } from '@/lib/http';
import { canEditProduction, canViewProduction } from '@/lib/permissions';

// ⚠️ ด่านจริงของโมดูลผลิตอยู่ตรงนี้ — proxy เห็นแค่ role จึงปล่อย `staff` ทุกฝ่าย
// ผ่านมาถึงนี่ (รวม WH/QC) · canEditProduction เป็นตัวที่เห็น department
export function requireProduction({ user, edit = false }) {
  if (!user) return { response: unauthorized() };
  if (edit) {
    if (!canEditProduction(user)) return { response: forbidden('ไม่มีสิทธิ์แก้ข้อมูลไลน์ผลิต') };
  } else if (!canViewProduction(user)) {
    return { response: forbidden() };
  }
  return {};
}

export async function loadLines(supabase, { includeInactive = true } = {}) {
  let query = supabase.from('production_lines').select('*');
  if (!includeInactive) query = query.eq('isActive', true);
  const { data, error } = await query
    .order('sortOrder', { ascending: true })
    .order('code', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function findLine(supabase, id) {
  const { data, error } = await supabase
    .from('production_lines').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

// วันที่กำลังไม่ปกติ — จำกัดช่วงเสมอเมื่อผู้เรียกส่งมา (ตารางนี้โตตามเวลาไม่มีเพดาน)
export async function loadCapacityDays(supabase, { lineId = null, from = null, to = null } = {}) {
  let query = supabase.from('production_capacity_days').select('*');
  if (lineId) query = query.eq('lineId', lineId);
  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);
  const { data, error } = await query.order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ไลน์ที่มีคิวผลิตค้างอยู่ห้ามลบ — งานผลิตอ้าง lineId ไว้ (production_jobs, mig 0185)
// ⚠️ PR-1 ยังไม่มีตารางนั้น ฟังก์ชันจึงกลืน error ตอนตารางยังไม่ถูกสร้าง แล้วคืน 0
//    (ไม่ใช่การซ่อน error — เป็นช่วงเปลี่ยนผ่านที่รู้ตัวว่า 0185 ยังไม่รัน)
export async function countJobsOnLine(supabase, lineId) {
  const { count, error } = await supabase
    .from('production_jobs').select('id', { count: 'exact', head: true }).eq('lineId', lineId);
  if (error) {
    if (error.code === '42P01') return 0; // ยังไม่มีตาราง production_jobs (ก่อน mig 0185)
    throw error;
  }
  return count || 0;
}
