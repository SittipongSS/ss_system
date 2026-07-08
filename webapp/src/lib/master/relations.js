// ── Master Data: cross-module relations (Database 360-view) ───────────
// อ่านความสัมพันธ์ข้ามโมดูลแบบ read-only summary สำหรับหน้า Database detail.
// หลักการ (BOUNDARY_MAP_PLAN): อ่านข้ามโมดูลได้ (DB เดียว) แต่ "ห้าม write ข้าม
// โมดูล" — service นี้คืนเฉพาะสรุป + id ให้ frontend ลิงก์ไปหน้าเจ้าของงาน
// (Tax/PM) เท่านั้น ไม่มี action เขียนใด ๆ.
//
// scope: กรองแถวด้วย view-scope ของผู้ใช้ (เหมือน route อื่น) — registrations/
// orders/products ใช้ canViewRecord; projects ต้องมี pm:view + team scope.
import { can, canViewRecord, viewScope, inScope } from '@/lib/permissions';

// projects ที่ผู้ใช้เห็นได้ (PM เป็นเครื่องมือของ SALES — ต้องมี pm:view).
function visibleProjects(user, rows) {
  if (!can(user?.role, 'pm:view')) return [];
  const scope = viewScope(user?.role);
  return (rows || []).filter((p) => inScope(scope, user, p));
}

// ข้อมูลภาษี (registrations/orders) เป็นความลับของระบบภาษี — เปิดให้เฉพาะ role ที่
// เห็นระบบภาษีได้ (history:view) เท่านั้น. staff/viewer มี viewScope='all' จึงต้อง
// กั้นด้วย capability ที่ชั้นนี้ ไม่ใช่แค่ scope (กัน leak ผ่าน API ตรง ๆ).
const seesTax = (user) => can(user?.role, 'history:view');

const PROJECT_COLS = 'id, code, name, status, customerId, team, ownerId';

// ความสัมพันธ์ของลูกค้า 1 ราย → { products, registrations, orders, projects }.
export async function customerRelations(supabase, customerId, user) {
  const [prodRes, regRes, orderRes, projRes] = await Promise.all([
    supabase.from('products')
      .select('id, fgCode, productDescription, productDescriptionEn, brandName, brandNameEn, approvalStatus, isActive, customerId, team, teams, ownerId')
      .eq('customerId', customerId).order('createdAt', { ascending: false }),
    supabase.from('excise_registrations')
      .select('id, fgCode, productName, brandName, status, approvalNumber, customerId, team, ownerId')
      .eq('customerId', customerId).order('createdAt', { ascending: false }),
    supabase.from('orders')
      .select('id, quotationRef, poReference, status, totalTax, deliveryDate, customerId, team, ownerId')
      .eq('customerId', customerId).order('createdAt', { ascending: false }),
    supabase.from('projects').select(PROJECT_COLS)
      .eq('customerId', customerId).order('createdAt', { ascending: false }),
  ]);

  const tax = seesTax(user);
  return {
    products: (prodRes.data || []).filter((p) => canViewRecord(user, 'products', p)),
    registrations: tax ? (regRes.data || []).filter((r) => canViewRecord(user, 'registrations', r)) : [],
    orders: tax ? (orderRes.data || []).filter((o) => canViewRecord(user, 'orders', o)) : [],
    projects: visibleProjects(user, projRes.data),
  };
}

// ความสัมพันธ์ของสินค้า 1 ชิ้น → { registrations, orders, projects }.
// orders = สรุปจาก order_items (dedupe ต่อ order + รวมจำนวนที่สั่งของสินค้านี้).
export async function productRelations(supabase, productId, user) {
  // order_items→orders มี FK จริง (cascade) → embed ปลอดภัย. project_products→
  // projects FK ไม่แน่นอน (ดู no-real-fk-constraints) → query สองสเตปกัน join พัง.
  const [regRes, itemRes, ppRes] = await Promise.all([
    supabase.from('excise_registrations')
      .select('id, fgCode, customerName, status, approvalNumber, customerId, team, ownerId')
      .eq('productId', productId).order('createdAt', { ascending: false }),
    supabase.from('order_items')
      .select('orderId, quantity, order:orders(id, quotationRef, status, customerName, totalTax, customerId, team, ownerId)')
      .eq('productId', productId),
    supabase.from('project_products').select('projectId').eq('productId', productId),
  ]);

  const tax = seesTax(user);

  // order_items → สรุปต่อ order (รวม qty ของสินค้านี้), กรองด้วย view-scope.
  const orderMap = new Map();
  if (tax) {
    for (const it of itemRes.data || []) {
      const o = it.order;
      if (!o || !canViewRecord(user, 'orders', o)) continue;
      const prev = orderMap.get(o.id) || { ...o, productQuantity: 0 };
      prev.productQuantity += it.quantity || 0;
      orderMap.set(o.id, prev);
    }
  }

  // projects: ดึง id จาก project_products แล้ว query projects แยก (ไม่พึ่ง embed).
  let projRows = [];
  const projectIds = [...new Set((ppRes.data || []).map((r) => r.projectId).filter(Boolean))];
  if (projectIds.length) {
    const { data } = await supabase.from('projects').select(PROJECT_COLS).in('id', projectIds);
    projRows = data || [];
  }

  return {
    registrations: tax ? (regRes.data || []).filter((r) => canViewRecord(user, 'registrations', r)) : [],
    orders: [...orderMap.values()],
    projects: visibleProjects(user, projRows),
  };
}
