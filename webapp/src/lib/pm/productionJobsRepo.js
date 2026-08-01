// ── Data access ของงานผลิต (mig 0189 · P-2) ──────────────────────────────
// แยกจาก route.js เพราะไฟล์ route ของ Next ส่งออกได้เฉพาะ HTTP method
import { notFound } from '@/lib/http';
import { requireProduction } from './productionLinesRepo';

export async function loadJobs(supabase, { status = null, salesOrderId = null, projectId = null, from = null, to = null } = {}) {
  let query = supabase.from('production_jobs').select('*');
  if (status) query = Array.isArray(status) ? query.in('status', status) : query.eq('status', status);
  if (salesOrderId) query = query.eq('salesOrderId', salesOrderId);
  if (projectId) query = query.eq('projectId', projectId);
  // บอร์ดอ่านเป็นช่วงวัน — งานที่เริ่มก่อนช่วงแต่ยังเดินอยู่ต้องติดมาด้วย จึงกรอง
  // แค่ขอบขวา (เริ่มก่อนวันสุดท้ายของช่วง) แล้วให้ spreadJob ตัดวันที่เกินเอง
  if (to) query = query.lte('plannedStart', to);
  if (from) query = query.or(`plannedStart.is.null,plannedStart.gte.${from}`);
  const { data, error } = await query.order('dueDate', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function findJob(supabase, id) {
  const { data, error } = await supabase
    .from('production_jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function requireJob({ user, supabase, id, edit = false }) {
  const access = requireProduction({ user, edit });
  if (access.response) return access;
  const job = await findJob(supabase, id);
  if (!job) return { response: notFound('ไม่พบงานผลิต') };
  return { job };
}

// ── ของเข้าของ SO ที่งานชุดนี้อ้างถึง — ใช้ตอบ "ผลิตได้เมื่อไหร่" ─────────
// ⭐ นี่คือจุดที่โมดูลผลิตต่อกับของเข้า PM/RM ที่ PC กรอกไว้แล้ว (mig 0176/0177)
// ⚠️ ยิงรวดเดียวด้วย `in` ไม่ใช่รายงาน (คิว 200 ใบ = 200 คำขอถ้าทำแบบไร้เดียงสา)
export async function deliveriesForJobs(supabase, jobs = []) {
  const ids = [...new Set(jobs.map((j) => j.salesOrderId).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('material_deliveries')
    .select('id, salesOrderId, dueDate, arrivedAt')
    .in('salesOrderId', ids);
  if (error) {
    // ยังไม่มีตาราง (สภาพแวดล้อมที่ยังไม่รัน mig 0176) → ไม่มีข้อมูลของเข้า
    // ซึ่ง productionReadiness อ่านว่า 'unknown' แล้วไม่ฟ้อง — ตรงกับความจริง
    if (error.code === '42P01') return new Map();
    throw error;
  }
  const map = new Map();
  for (const row of data || []) {
    if (!map.has(row.salesOrderId)) map.set(row.salesOrderId, []);
    map.get(row.salesOrderId).push(row);
  }
  return map;
}

// SO ที่อนุมัติแล้วและยังไม่มีงานร่าง — ใช้ตอน auto-draft
export async function approvedOrdersWithLines(supabase, { salesOrderId = null } = {}) {
  let query = supabase
    .from('sales_orders')
    .select('id, orderNumber, status, dealId, projectId, paymentDueDate')
    .eq('status', 'approved');
  if (salesOrderId) query = query.eq('id', salesOrderId);
  const { data: orders, error } = await query;
  if (error) throw error;
  if (!orders?.length) return [];

  const { data: lines, error: lineError } = await supabase
    .from('sales_order_lines')
    .select('id, salesOrderId, productId, fgCode, description, qty')
    .in('salesOrderId', orders.map((o) => o.id));
  if (lineError) throw lineError;

  const byOrder = new Map();
  for (const line of lines || []) {
    if (!byOrder.has(line.salesOrderId)) byOrder.set(line.salesOrderId, []);
    byOrder.get(line.salesOrderId).push(line);
  }
  return orders.map((order) => ({ order, lines: byOrder.get(order.id) || [] }));
}

// บรรทัด SO ที่มีงานผลิตอยู่แล้ว — กันสร้างซ้ำ (ดู draftJobsForSalesOrder)
export async function existingJobLineIds(supabase, salesOrderIds = []) {
  const ids = [...new Set((salesOrderIds || []).filter(Boolean))];
  if (!ids.length) return new Set();
  const { data, error } = await supabase
    .from('production_jobs').select('salesOrderLineId').in('salesOrderId', ids);
  if (error) throw error;
  return new Set((data || []).map((r) => r.salesOrderLineId).filter(Boolean));
}
