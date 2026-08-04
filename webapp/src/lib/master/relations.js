// ── Master Data: cross-module relations (Database 360-view) ───────────
// อ่านความสัมพันธ์ข้ามโมดูลแบบ read-only summary สำหรับหน้า Database detail.
// หลักการ (BOUNDARY_MAP_PLAN): อ่านข้ามโมดูลได้ (DB เดียว) แต่ "ห้าม write ข้าม
// โมดูล" — service นี้คืนเฉพาะสรุป + id ให้ frontend ลิงก์ไปหน้าเจ้าของงาน
// (Tax/PM) เท่านั้น ไม่มี action เขียนใด ๆ.
//
// scope: กรองแถวด้วย view-scope ของผู้ใช้ (เหมือน route อื่น) — registrations/
// orders/products ใช้ canViewRecord; projects ต้องมี pm:view + team scope.
import { can, canViewRecord, viewScope, inScope } from '@/lib/permissions';
import { canViewScents } from '@/lib/master/scents';
import { canViewFormulas } from '@/lib/master/formulas';

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

// ทะเบียนกลิ่น/สูตร (mig 0171) — สรุปพอโชว์ในแท็บ ไม่ดึงโน้ตมาทั้งก้อน
// `sentAt` = วันที่ส่งกลิ่นให้ลูกค้า อยู่บนตัวกลิ่นเองแล้ว (0205) — กลิ่นตัวหนึ่งถูกส่ง
// ครั้งเดียวตลอดชีวิต จึงไม่มี "Rev ล่าสุด" ให้แสดงอีก
const SCENT_COLS = 'id, code, name, status, sentAt, customerId, createdAt';
const FORMULA_COLS = 'id, code, name, status, formulaDate, scentId, customerId';

// กลิ่น + สูตรของลูกค้า 1 ราย.
//
// ⚠️ สูตรหาด้วย customerId อย่างเดียวไม่พอ — formulas."customerId" เป็น NULL ได้
// (= "สูตรกลาง") แต่ scents."customerId" เป็น NOT NULL เสมอ (มติ 9: กลิ่นของลูกค้า
// A ใช้กับ B ไม่ได้) ดังนั้น "สูตรที่ผูกกลิ่นของลูกค้ารายนี้" ย่อมเป็นของลูกค้ารายนี้
// เสมอ — ถ้ากรองด้วย customerId ล้วน สูตรที่ RD ผูกกลิ่นแล้วแต่ยังไม่ได้เติมลูกค้า
// จะหายไปเงียบ ๆ · เกณฑ์นี้ over-match ไม่ได้เพราะกลิ่นหนึ่งมีลูกค้าได้รายเดียว
async function scentsAndFormulas(supabase, customerId, user) {
  const seesScents = canViewScents(user);
  const seesFormulas = canViewFormulas(user);
  if (!seesScents && !seesFormulas) return { scents: [], formulas: [] };

  const { data: scentRows } = await supabase.from('scents').select(SCENT_COLS)
    .eq('customerId', customerId).order('name', { ascending: true });
  const scents = scentRows || [];
  if (!seesFormulas) return { scents: seesScents ? scents : [], formulas: [] };

  const scentIds = scents.map((s) => s.id);
  const [byCustomer, byScent] = await Promise.all([
    supabase.from('formulas').select(FORMULA_COLS).eq('customerId', customerId),
    scentIds.length
      ? supabase.from('formulas').select(FORMULA_COLS).in('scentId', scentIds)
      : Promise.resolve({ data: [] }),
  ]);
  // รวมสองชุดแล้ว dedupe ด้วย id — สูตรที่เข้าเกณฑ์ทั้งคู่ต้องขึ้นแถวเดียว
  const merged = new Map();
  for (const f of [...(byCustomer.data || []), ...(byScent.data || [])]) merged.set(f.id, f);
  const formulas = [...merged.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));

  return { scents: seesScents ? scents : [], formulas };
}

// ความสัมพันธ์ของลูกค้า 1 ราย → { products, registrations, orders, projects, scents, formulas }.
export async function customerRelations(supabase, customerId, user) {
  const [prodRes, regRes, orderRes, projRes, registry] = await Promise.all([
    // 🐞 เคย select `teams` ซึ่ง **ไม่มีในตาราง** (products มี `team` เดี่ยว) → PostgREST
    // ตอบ 42703 ทั้ง query · โค้ดข้างล่างอ่าน `.data || []` โดยไม่ดู `.error` แท็บสินค้า
    // บนหน้าลูกค้าจึงว่างเปล่าทุกราย ทั้งที่ prod มีสินค้าผูกลูกค้า 120 ชิ้น (2026-07-29)
    // — ไม่มีใครใช้ค่านี้ด้วยซ้ำ แค่ค้างอยู่ใน select list
    supabase.from('products')
      .select('id, fgCode, productDescription, productDescriptionEn, brandName, brandNameEn, approvalStatus, isActive, customerId, team, ownerId')
      .eq('customerId', customerId).order('createdAt', { ascending: false }),
    supabase.from('excise_registrations')
      .select('id, fgCode, productName, brandName, status, approvalNumber, customerId, team, ownerId')
      .eq('customerId', customerId).order('createdAt', { ascending: false }),
    supabase.from('orders')
      .select('id, quotationRef, poReference, status, totalTax, deliveryDate, customerId, team, ownerId')
      .eq('customerId', customerId).order('createdAt', { ascending: false }),
    supabase.from('projects').select(PROJECT_COLS)
      .eq('customerId', customerId).order('createdAt', { ascending: false }),
    scentsAndFormulas(supabase, customerId, user),
  ]);

  // query พัง = ต้องดัง ไม่ใช่คืนลิสต์ว่าง · `.data || []` เพียว ๆ ทำให้ schema error
  // (ชื่อคอลัมน์ผิด / RLS) กลายเป็น "ลูกค้ารายนี้ไม่มีสินค้า" ซึ่งอ่านแล้วเชื่อสนิท
  // — เป็นสาเหตุที่บั๊ก `teams` ข้างบนอยู่เงียบ ๆ ได้นาน
  const failed = [
    ['สินค้า', prodRes.error],
    ['ทะเบียนสรรพสามิต', regRes.error],
    ['ใบยื่นภาษี', orderRes.error],
    ['โครงการ', projRes.error],
  ].filter(([, error]) => error);
  if (failed.length) {
    throw new Error(`โหลดข้อมูลที่เกี่ยวข้องไม่สำเร็จ (${failed.map(([label]) => label).join(', ')}): ${failed[0][1].message}`);
  }

  const tax = seesTax(user);
  return {
    products: (prodRes.data || []).filter((p) => canViewRecord(user, 'products', p)),
    registrations: tax ? (regRes.data || []).filter((r) => canViewRecord(user, 'registrations', r)) : [],
    orders: tax ? (orderRes.data || []).filter((o) => canViewRecord(user, 'orders', o)) : [],
    projects: visibleProjects(user, projRes.data),
    // ทะเบียนกลิ่น/สูตรไม่มี team/owner จึงไม่มี view-scope รายแถว — เห็นทั้งทะเบียน
    // หรือไม่เห็นเลย ตามเจตนาเดิมของ canViewScents/canViewFormulas (แคตตาล็อกข้ามทีม)
    scents: registry.scents,
    formulas: registry.formulas,
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
