// ── แนบ / ถอด SO เข้าคำร้องพัฒนากลิ่น — ฝั่ง DB (ม-164 · PR-2) ──────────────────────────────
//
// ⭐ route บาง ๆ (`api/sa/requests/[id]/sales-orders/**`) เรียกไฟล์นี้ · ด่านทุกข้อมาจาก `scentOrderAttach.js`
//   ตัวเดียวกับปุ่มบนจอ
// ⭐ **ตัวเขียน audit / เธรด / ตัวหาพี่น้องนิติบุคคล รับเป็นพารามิเตอร์** (`deps`) — เทสต์ส่งตัวจำลองเข้ามาเสมอ
//   (AGENTS.md: เทสต์ห้ามต่อฐานจริง · บทเรียน audit_logs ปลอม 1,523 แถว)
// ⚠️ ใบที่ผ่านเข้ามา (`request`) คือผลของ `findRequest` — มี `attachedOrders` · `scentSlots` · `items` ·
//   `salesOrderLines` ครบ ⇒ ตัวเลขก่อน/หลังคิดจากก้อนเดียวกับที่จอเห็น ไม่อ่านซ้ำ
import { randomUUID } from 'crypto';
import { recordAudit } from '@/lib/audit';
import { appendUpdate } from '@/lib/master/updates';
import { customerTaxSiblingIds } from '@/lib/master/customerTaxSiblings';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { pipelineRowsOnly } from '@/lib/sales/historicalOrders';
import { isMissingTableError, loadScentOrderLines, loadScentOrderOwners, SCENT_ORDER_LINKS_TABLE } from '@/lib/requests/scentOrderLinksAdmin';
import { scentDesignLines } from '@/lib/requests/scentDesignOrders';
import {
  attachAdds, attachOrderError, attachPreview, attachPreviewText, attachRequestError, canActOnScentOrders,
  detachOrderError, scentOrderLinesText, slotsAfterDetach,
} from '@/lib/requests/scentOrderAttach';

const DISMISSALS_TABLE = 'scent_order_dismissals';
// `origin` — ด่านแนบตัดใบย้อนหลัง/ใบค่าสรรพสามิตด้วย `isActualOrder` (ยาม historicalMoneyGuards)
const ORDER_COLS = 'id, "orderNumber", status, origin, "orderDate", "approvedAt", "customerId", "customerName", "dealId", "revisedFromId", "supersededById"';

const defaultDeps = {
  audit: recordAudit,
  append: appendUpdate,
  siblings: customerTaxSiblingIds,
  newId: () => `DRSO-${randomUUID()}`,
};

/* ข้อความของ trigger 0436 ลงท้าย `[scent_order_*]` — ตัดรหัสออกก่อนส่งถึงจอ (แบบเดียวกับ 0410) */
const triggerText = (message) => String(message || '').replace(/\s*\[scent_order_[a-z_]+\]\s*$/, '').trim();

/** ลูกค้าของคำร้อง — ช่องบนใบก่อน · ไม่มีก็ถอยไปลูกค้าของ SO หลัก */
async function requestCustomerId(supabase, request) {
  if (request.customerId) return request.customerId;
  if (!request.salesOrderId) return null;
  const { data, error } = await supabase.from('sales_orders').select('"customerId"').eq('id', request.salesOrderId).maybeSingle();
  if (error) throw error;
  return data?.customerId || null;
}

async function dealOwnerIdOf(supabase, dealId) {
  if (!dealId) return null;
  const { data, error } = await supabase.from('sales_deals').select('"ownerId"').eq('id', dealId).maybeSingle();
  if (error) throw error;
  return data?.ownerId || null;
}

/** การปัดออกจากคิวของ SO หลายใบ — Map(salesOrderId → แถว) · ตารางยังไม่มี = ว่าง (คิว PR-5 ใช้ตัวเดียวกัน) */
export async function loadScentOrderDismissals(supabase, orderIds) {
  return loadDismissals(supabase, orderIds);
}

async function loadDismissals(supabase, orderIds) {
  try {
    const rows = await fetchAllInChunks(orderIds, (chunk) => supabase
      .from(DISMISSALS_TABLE).select('"salesOrderId", reason, "dismissedAt", "dismissedById", "dismissedByName"')
      .in('salesOrderId', chunk).order('salesOrderId', { ascending: true }));
    return new Map(rows.map((r) => [r.salesOrderId, r]));
  } catch (error) {
    if (isMissingTableError(error)) return new Map();
    throw error;
  }
}

/**
 * SO ที่แนบเข้าคำร้องนี้ได้ — ลูกค้าเดียวกัน (นิติบุคคล) · อนุมัติแล้ว · มีบรรทัดพัฒนากลิ่น · ยังไม่มีเจ้าของ
 * @returns `{ candidates, hidden: { owned }, requestError }`
 *   · `candidates[]` = `{ id, orderNumber, orderDate, customerName, linesText, adds: { slots, revisions }, dismissed }`
 *   · `hidden.owned` = ใบของลูกค้าเดียวกันที่มีคำร้องรับไปแล้ว (บอกจอว่าทำไมไม่เห็น)
 */
export async function loadAttachCandidates(supabase, request, deps = {}) {
  const { siblings } = { ...defaultDeps, ...deps };
  const customerId = await requestCustomerId(supabase, request);
  if (!customerId) return { candidates: [], hidden: { owned: 0 }, requestError: 'คำร้องนี้ไม่ได้ผูกลูกค้า — หาใบสั่งขายให้แนบไม่ได้' };
  const customerIds = await siblings(supabase, customerId);
  /* ⚠️ เฉพาะใบในสายขายปกติ (`pipelineRowsOnly`) — ใบย้อนหลังคืองานที่จบไปแล้ว (ทางของมันคือปัดออกจากคิว) ·
     ใบค่าสรรพสามิตไม่มีงานออกแบบกลิ่น · ด่านรายใบ (`attachOrderError`) ตัดซ้ำอีกชั้นด้วย `isActualOrder` */
  const orders = await fetchAllInChunks(customerIds, (chunk) => pipelineRowsOnly(supabase
    .from('sales_orders').select(ORDER_COLS).in('customerId', chunk).eq('status', 'approved'))
    .order('id', { ascending: true }));
  const linesBySo = await loadScentOrderLines(supabase, orders.map((o) => o.id));
  const scentOrders = orders.filter((o) => o.id !== request.salesOrderId && scentDesignLines(linesBySo.get(o.id) || []).length);
  const { ownerById } = await loadScentOrderOwners(supabase, scentOrders);
  const free = scentOrders.filter((o) => !ownerById.get(o.id));
  const dismissals = await loadDismissals(supabase, free.map((o) => o.id));
  const candidates = free.map((o) => {
    const lines = linesBySo.get(o.id) || [];
    return {
      id: o.id,
      orderNumber: o.orderNumber || o.id,
      orderDate: o.orderDate || null,
      customerName: o.customerName || null,
      linesText: scentOrderLinesText(lines),
      adds: attachAdds(lines),
      dismissed: dismissals.get(o.id) || null,
    };
  }).sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || '')) || String(b.orderNumber).localeCompare(String(a.orderNumber)));
  return {
    candidates,
    hidden: { owned: scentOrders.length - free.length },
    requestError: attachRequestError(request),
  };
}

/**
 * แนบ SO เข้าคำร้อง — คืน `{ status, error? , text? }` (route แปลงเป็น HTTP)
 * @param httpRequest  ส่งต่อให้ audit (IP/เอเจนต์) · เทสต์ไม่ต้องส่ง
 */
export async function attachScentOrder({ supabase, user, request, salesOrderId, httpRequest = null }, deps = {}) {
  const { audit, append, siblings, newId } = { ...defaultDeps, ...deps };
  const soId = String(salesOrderId || '').trim();
  if (!soId) return { status: 400, error: 'ต้องเลือกใบสั่งขายที่จะแนบ' };

  const { data: order, error: orderError } = await supabase.from('sales_orders').select(ORDER_COLS).eq('id', soId).maybeSingle();
  if (orderError) throw orderError;
  const lines = order ? (await loadScentOrderLines(supabase, [order.id])).get(order.id) || [] : [];
  const { ownerById, ordersById } = order ? await loadScentOrderOwners(supabase, [order]) : { ownerById: new Map(), ordersById: new Map() };
  const dealOwnerId = order ? await dealOwnerIdOf(supabase, order.dealId) : null;
  const customerId = await requestCustomerId(supabase, request);
  const siblingIds = customerId ? await siblings(supabase, customerId) : [];
  const allowed = canActOnScentOrders(user, request, { dealOwnerId });

  const error = attachOrderError({
    request, order, lines,
    owner: order ? ownerById.get(order.id) || null : null,
    sameTaxEntity: !!order && siblingIds.includes(order.customerId),
    allowed,
    orderNumberOf: (id) => ordersById.get(id)?.orderNumber || null,
  });
  if (error) return { status: !allowed ? 403 : (order ? 409 : 404), error };

  const preview = attachPreview(request.scentSlots, lines);
  const { error: insertError } = await supabase.from(SCENT_ORDER_LINKS_TABLE).insert({
    id: newId(),
    requestId: request.id,
    salesOrderId: order.id,
    createdById: user?.id != null ? String(user.id) : null,
    createdByName: user?.name || null,
  });
  if (insertError) {
    if (insertError.code === '23505') return { status: 409, error: 'ใบสั่งขายนี้เพิ่งถูกแนบกับคำร้องอื่น — โหลดหน้าใหม่แล้วลองอีกครั้ง' };
    if (/\[scent_order_/.test(insertError.message || '')) return { status: 409, error: triggerText(insertError.message) };
    throw insertError;
  }

  /* แนบชนะการปัดออกจากคิว (แผน §2) — ลบแถวปัดออกให้เอง · พลาดไม่ล้มการแนบ (ลิงก์ลงแล้ว · คิวกรองด้วยเจ้าของอยู่แล้ว) */
  const { error: undismissError } = await supabase.from(DISMISSALS_TABLE).delete().eq('salesOrderId', order.id);
  if (undismissError && !isMissingTableError(undismissError)) {
    console.error('[scent-order-attach] ล้างการปัดออกไม่สำเร็จ', order.id, undismissError.message);
  }

  const no = order.orderNumber || order.id;
  const numbers = attachPreviewText(preview);
  const text = `แนบใบสั่งขาย ${no} (${scentOrderLinesText(lines)})${numbers ? ` — ${numbers}` : ''}`;
  // เธรดแจ้งเตือนฝ่ายที่ถือใบให้เอง (`appendUpdate` → notifyThreadUpdate) · พลาดไม่ล้มการแนบ
  await Promise.resolve(append(supabase, { entityType: 'dept_request', entityId: request.id, kind: 'so_attach', body: text, user })).catch(() => {});
  await audit({
    user, action: 'update', entityType: 'dept_request', entityId: request.id,
    before: { attachedSalesOrderIds: (request.attachedOrders || []).map((a) => a.salesOrderId) },
    after: { attachedSalesOrderIds: [...(request.attachedOrders || []).map((a) => a.salesOrderId), order.id] },
    summary: `${text} (${request.docNo || request.id})`, request: httpRequest,
  });
  return { status: 200, text };
}

/** ถอด SO แนบออกจากคำร้อง — คืน `{ status, error?, text? }` */
export async function detachScentOrder({ supabase, user, request, salesOrderId, httpRequest = null }, deps = {}) {
  const { audit, append } = { ...defaultDeps, ...deps };
  const link = (request.attachedOrders || []).find((a) => a.salesOrderId === salesOrderId) || null;
  const { data: order, error: orderError } = link
    ? await supabase.from('sales_orders').select('id, "orderNumber", "dealId"').eq('id', salesOrderId).maybeSingle()
    : { data: null, error: null };
  if (orderError) throw orderError;
  const dealOwnerId = order ? await dealOwnerIdOf(supabase, order.dealId) : null;
  const allowed = canActOnScentOrders(user, request, { dealOwnerId });
  const slotsAfter = slotsAfterDetach(request, salesOrderId);
  const error = detachOrderError({ request, link, items: request.items || [], slotsAfter, allowed });
  if (error) return { status: !allowed ? 403 : (link ? 409 : 404), error };

  const { error: deleteError } = await supabase.from(SCENT_ORDER_LINKS_TABLE).delete()
    .eq('id', link.linkId).eq('requestId', request.id);
  if (deleteError) throw deleteError;

  const no = link.orderNumber || order?.orderNumber || salesOrderId;
  const before = request.scentSlots?.slots ?? 0;
  const text = `ถอดใบสั่งขาย ${no} ออกจากคำร้อง${before !== slotsAfter ? ` — จำนวนกลิ่น ${before} เป็น ${slotsAfter}` : ''}`;
  await Promise.resolve(append(supabase, { entityType: 'dept_request', entityId: request.id, kind: 'so_detach', body: text, user })).catch(() => {});
  await audit({
    user, action: 'update', entityType: 'dept_request', entityId: request.id,
    before: { attachedSalesOrderIds: (request.attachedOrders || []).map((a) => a.salesOrderId) },
    after: { attachedSalesOrderIds: (request.attachedOrders || []).map((a) => a.salesOrderId).filter((id) => id !== salesOrderId) },
    summary: `${text} (${request.docNo || request.id})`, request: httpRequest,
  });
  return { status: 200, text };
}

/**
 * ยกเลิกคำร้อง = ปลด SO แนบทุกใบกลับเข้าคิว (แผน §7) — เรียก **หลัง** ใบถูกยกเลิกสำเร็จ
 * @returns ประโยคสรุปสำหรับ audit ของการยกเลิก · ไม่มี SO แนบ = ''
 * ⚠️ ไม่โยน — ใบยกเลิกสำเร็จแล้ว ล้มตรงนี้ต้องไม่ทำให้ตอบ 500 (log + ลิงก์ค้างจะถูกมองข้ามโดย `scentOrderOwnerOf`)
 */
export async function releaseScentOrderLinks(supabase, { request, user }, deps = {}) {
  const { append } = { ...defaultDeps, ...deps };
  const attached = request?.attachedOrders || [];
  if (!attached.length) return '';
  const { error } = await supabase.from(SCENT_ORDER_LINKS_TABLE).delete().eq('requestId', request.id);
  if (error) {
    console.error('[scent-order-attach] ปลดใบสั่งขายที่แนบไม่สำเร็จ', request.id, error.message);
    return '';
  }
  const numbers = attached.map((a) => a.orderNumber || a.salesOrderId).join(', ');
  const text = `ปลดใบสั่งขายที่แนบ ${attached.length} ใบกลับเข้าคิวรอเปิดคำร้อง: ${numbers}`;
  await Promise.resolve(append(supabase, { entityType: 'dept_request', entityId: request.id, kind: 'so_detach', body: text, user })).catch(() => {});
  return text;
}
