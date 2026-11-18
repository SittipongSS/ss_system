// ── คิว "SO ออกแบบกลิ่นรอเปิดคำร้อง" — ฝั่ง DB (ม-164 PR-5) ──────────────────────────────────────────
//
// ⭐ ตัวจัดคิว/ด่านอยู่ที่ `scentOrderQueue.js` (logic ล้วน) · ไฟล์นี้โหลดแถวมาให้มันตัดสิน
// ⭐ ตัวเขียน audit รับเป็นพารามิเตอร์ (`deps.audit`) — เทสต์ส่งตัวจำลองเข้ามาเสมอ (AGENTS.md: ห้ามต่อฐานจริง)
// ⚠️ **ไม่อยู่ใน `/api/nav/counts`** — คิวต้องอ่าน SO อนุมัติทั้งทะเบียน + บรรทัด ⇒ แพงเกินสำหรับเส้นที่ยิงทุก 2 นาทีทุกคน
// ⚠️ ทุกคำสั่งอ่านมีขอบเขต (`fetchAll` · `fetchAllInChunks`) — sales_orders/dept_requests อยู่ใน check:rowcap
import { recordAudit } from '@/lib/audit';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { isActualOrder, pipelineRowsOnly } from '@/lib/sales/historicalOrders';
import { loadScentOrderLines, loadScentOrderOwners } from '@/lib/requests/scentOrderLinksAdmin';
import { loadScentOrderDismissals, typeNamesOrNone } from '@/lib/requests/scentOrderAttachAdmin';
import { scentDesignLines } from '@/lib/requests/scentDesignOrders';
import { dismissScentOrderError, scentOrderQueueRows, undismissScentOrderError } from '@/lib/requests/scentOrderQueue';

const DISMISSALS_TABLE = 'scent_order_dismissals';
const ORDER_COLS = 'id, "orderNumber", status, origin, "customerId", "customerName", "dealId", "approvedAt", "orderDate", "revisedFromId", "supersededById"';

const defaultDeps = { audit: recordAudit };

async function loadQueueContext(supabase, orders, { today }) {
  const linesBySo = await loadScentOrderLines(supabase, orders.map((o) => o.id));
  // ถามเจ้าของเฉพาะใบที่มีงานพัฒนากลิ่น — ใบขายสินค้าล้วนไม่ต้องจ่ายคำสั่งอ่านคำร้อง
  const scentOrders = orders.filter((o) => scentDesignLines(linesBySo.get(o.id) || []).length);
  const { ownerById } = await loadScentOrderOwners(supabase, scentOrders);
  const free = scentOrders.filter((o) => !ownerById.get(o.id));
  const [dismissals, deals, requests] = await Promise.all([
    loadScentOrderDismissals(supabase, free.map((o) => o.id)),
    fetchAllInChunks([...new Set(free.map((o) => o.dealId).filter(Boolean))], (chunk) => supabase
      .from('sales_deals').select('id, code, title, "ownerId", "ownerName", team')
      .in('id', chunk).order('id', { ascending: true })),
    // ใบล่าสุดของลูกค้า — ค่าตั้งต้นของ "ต่อจากคำร้อง" ตอนกดเปิดคำร้องใหม่จากคิว
    fetchAllInChunks([...new Set(free.map((o) => o.customerId).filter(Boolean))], (chunk) => supabase
      .from('dept_requests').select('id, "docNo", status, "customerId", "createdAt"')
      .in('customerId', chunk).eq('kind', 'scent_dev').neq('status', 'cancelled').order('id', { ascending: true })),
  ]);
  const latestRequestByCustomer = new Map();
  for (const r of requests) {
    const held = latestRequestByCustomer.get(r.customerId);
    if (!held || String(r.createdAt || '') > String(held.createdAt || '')) latestRequestByCustomer.set(r.customerId, r);
  }
  return scentOrderQueueRows({
    orders: free, linesBySo, ownerById, dismissals,
    dealsById: new Map(deals.map((d) => [d.id, d])), latestRequestByCustomer, today,
    productTypes: free.length ? await typeNamesOrNone(supabase) : [],
  });
}

/**
 * คิวทั้งทะเบียน — `{ pending, dismissed }` (ยังไม่กรองขอบเขต · ผู้เรียกกรองด้วย `scentOrderQueueScope`)
 * ⚠️ เฉพาะใบในสายขายปกติ (`pipelineRowsOnly`) — ใบย้อนหลังคืองานที่จบแล้ว · ใบค่าสรรพสามิตไม่มีงานออกแบบ
 */
export async function loadScentOrderQueue(supabase, { today = null } = {}) {
  const orders = await fetchAll(() => pipelineRowsOnly(supabase
    .from('sales_orders').select(ORDER_COLS).eq('status', 'approved'))
    .order('id', { ascending: true }));
  return loadQueueContext(supabase, orders, { today });
}

/** แถวคิวของ SO ใบเดียว (ด่านปัดออก/คืนเข้าคิว) — null = ไม่อยู่ในคิว (มีเจ้าของแล้ว · ไม่ใช่งานพัฒนากลิ่น · ยังไม่อนุมัติ) */
async function loadQueueRow(supabase, salesOrderId, { today }) {
  const { data: order, error } = await supabase.from('sales_orders').select(ORDER_COLS)
    .eq('id', String(salesOrderId || '')).maybeSingle();
  if (error) throw error;
  if (!order || order.status !== 'approved' || !isActualOrder(order)) return null;
  const { pending, dismissed } = await loadQueueContext(supabase, [order], { today });
  return pending[0] || dismissed[0] || null;
}

/** ปัดออกจากคิว ("ไม่ต้องมีคำร้อง") — คืน `{ status, error? }` */
export async function dismissScentOrder(supabase, { user, salesOrderId, reason, today = null, httpRequest = null }, deps = {}) {
  const { audit } = { ...defaultDeps, ...deps };
  const row = await loadQueueRow(supabase, salesOrderId, { today });
  const error = dismissScentOrderError({ user, row, reason });
  if (error) return { status: row ? (row.dismissal ? 409 : 403) : 404, error };
  const text = String(reason).trim().slice(0, 500);
  const { error: insertError } = await supabase.from(DISMISSALS_TABLE).insert({
    salesOrderId: row.id,
    reason: text,
    dismissedById: user?.id != null ? String(user.id) : null,
    dismissedByName: user?.name || null,
  });
  if (insertError) {
    if (insertError.code === '23505') return { status: 409, error: 'ใบสั่งขายนี้เพิ่งถูกปัดออกจากอีกหน้าจอ — โหลดหน้าใหม่' };
    throw insertError;
  }
  await audit({
    user, action: 'update', entityType: 'sales_order', entityId: row.id,
    before: { scentOrderDismissed: false }, after: { scentOrderDismissed: true, reason: text },
    summary: `ปัด ${row.orderNumber} ออกจากคิว "SO ออกแบบกลิ่นรอเปิดคำร้อง" — ${text}`, request: httpRequest,
  });
  return { status: 200 };
}

/** คืนเข้าคิว — คืน `{ status, error? }` */
export async function undismissScentOrder(supabase, { user, salesOrderId, today = null, httpRequest = null }, deps = {}) {
  const { audit } = { ...defaultDeps, ...deps };
  const row = await loadQueueRow(supabase, salesOrderId, { today });
  const error = undismissScentOrderError({ user, row });
  if (error) return { status: row?.dismissal ? 403 : 404, error };
  const { error: deleteError } = await supabase.from(DISMISSALS_TABLE).delete().eq('salesOrderId', row.id);
  if (deleteError) throw deleteError;
  await audit({
    user, action: 'update', entityType: 'sales_order', entityId: row.id,
    before: { scentOrderDismissed: true, reason: row.dismissal.reason }, after: { scentOrderDismissed: false },
    summary: `คืน ${row.orderNumber} เข้าคิว "SO ออกแบบกลิ่นรอเปิดคำร้อง" (เดิมปัดออกเพราะ: ${row.dismissal.reason})`, request: httpRequest,
  });
  return { status: 200 };
}
