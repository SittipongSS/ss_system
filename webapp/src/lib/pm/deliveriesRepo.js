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

// ใบสั่งขายที่ผูกกับโครงการนี้ได้จริง — ผูกข้าม SO ของโครงการอื่นคือทำให้หน้า SO
// นั้นตอบ "พร้อมผลิต" จากของที่ไม่ใช่ของตัวเอง
// คืนข้อความไทย หรือ null ถ้าผ่าน
export async function salesOrderScopeError(supabase, project, salesOrderId) {
  if (!salesOrderId) return null;
  const { data, error } = await supabase
    .from('sales_orders').select('id, projectId, dealId').eq('id', salesOrderId).maybeSingle();
  if (error) throw error;
  if (!data) return 'ไม่พบใบสั่งขายที่ระบุ';
  if (data.projectId === project.id) return null;
  // SO เก่าบางใบยังไม่มี projectId (nullable ตั้งแต่ mig 0107) → ยอมรับถ้าดีลของมัน
  // อยู่ในโครงการนี้ ไม่งั้นข้อมูลเก่าจะผูกไม่ได้เลยทั้งที่ถูกต้อง
  const { data: deal, error: dealError } = await supabase
    .from('sales_deals').select('id, projectId').eq('id', data.dealId).maybeSingle();
  if (dealError) throw dealError;
  if (deal?.projectId === project.id) return null;
  return 'ใบสั่งขายที่ระบุไม่ได้อยู่ในโครงการนี้';
}

// ใบสั่งขายของโครงการ (ให้ผู้ใช้เลือกในพาเนล) — ใบที่ยกเลิกแล้วไม่ต้องโชว์
export async function loadProjectSalesOrders(supabase, project) {
  const { data: deals, error: dealError } = await supabase
    .from('sales_deals').select('id').eq('projectId', project.id);
  if (dealError) throw dealError;
  const dealIds = (deals || []).map((d) => d.id);

  let query = supabase.from('sales_orders')
    .select('id, orderNumber, status, orderDate, dealId, projectId').neq('status', 'cancelled');
  query = dealIds.length
    ? query.or(`projectId.eq.${project.id},dealId.in.(${dealIds.join(',')})`)
    : query.eq('projectId', project.id);
  const { data, error } = await query.order('orderDate', { ascending: false });
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
