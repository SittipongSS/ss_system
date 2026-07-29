// ── Data access + ด่านสิทธิ์ของ "ของเข้า" (mig 0176) ─────────────────────
// แยกออกจากไฟล์ route เพราะ route.js ของ Next ส่งออกได้เฉพาะ HTTP method —
// ยัด helper ไว้ในนั้นแล้ว import ข้ามไฟล์คือทางที่ build จะพังทีหลัง
import { forbidden, notFound, unauthorized } from '@/lib/http';
import { can, inScope, viewScope } from '@/lib/permissions';
import { loadProject } from '@/lib/pm/projectsRepo';
import { canEditDeliveries } from '@/lib/pm/deliveries';

// คืน { project } หรือ { response } ที่พร้อมส่งกลับเลย (แพตเทิร์นเดียวกับ shipment-prep)
export async function requireProject({ user, supabase, id, edit = false }) {
  if (!user) return { response: unauthorized() };
  if (!can(user.role, 'pm:view')) return { response: forbidden() };

  const project = await loadProject(supabase, id);
  if (!project) return { response: notFound('ไม่พบโครงการ') };

  if (edit) {
    if (!canEditDeliveries(user, project)) {
      return { response: forbidden('ไม่มีสิทธิ์แก้รายการของเข้าของโครงการนี้') };
    }
  } else if (viewScope(user.role) === 'team' && !inScope('team', user, project)) {
    return { response: forbidden() };
  }
  return { project };
}

export async function loadDeliveries(supabase, projectId) {
  const { data, error } = await supabase
    .from('material_deliveries')
    .select('*')
    .eq('projectId', projectId)
    // ของที่ใกล้ถึงกำหนดขึ้นก่อน — แถวที่ยังไม่มีกำหนดไปท้ายสุด
    .order('dueDate', { ascending: true, nullsFirst: false })
    .order('createdAt', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function findDelivery(supabase, projectId, deliveryId) {
  const { data, error } = await supabase
    .from('material_deliveries').select('*')
    .eq('id', deliveryId).eq('projectId', projectId).maybeSingle();
  if (error) throw error;
  return data || null;
}
