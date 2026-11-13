// ── ตัวโหลด SO ของคำร้องพัฒนากลิ่น (ม-163 · mig 0436) — ฝั่ง DB ของ `scentOrderLinks.js` ──
//
// ⭐ ที่เดียวที่อ่านตาราง `dept_request_sales_orders` + เดินสาย Rev. ของ SO จากฐาน
// ผู้เรียก: `findRequest` (หน้าคำร้อง · ด่านปิดใบ) · ด่านเปิดคำร้อง · หน้า SO รายใบ/รายการ
//
// ⚠️ **ทนได้ถ้า mig 0436 ยังไม่รัน** — ตารางไม่มี = "ยังไม่มีลิงก์" (log เตือน) ไม่ใช่ล้มทั้งหน้า
// ฐาน dev = ฐาน prod ⇒ โค้ดอาจขึ้นก่อนเจ้าของรัน migration · ล้มเมื่อไรคำร้องพัฒนากลิ่นทุกใบเปิดไม่ได้
// ⚠️ ทุกคำสั่งอ่านมีขอบเขต (`fetchAllInChunks` · `.limit`) — ตารางใน `check:rowcap` ห้ามอ่านแบบไร้ขอบเขต
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { currentRevisionOf, scentOrderOwner, scentSlotLines } from '@/lib/requests/scentOrderLinks';

export const SCENT_ORDER_LINKS_TABLE = 'dept_request_sales_orders';

/** error ของ "ตารางยังไม่มี" (migration ยังไม่รัน) — PostgREST `PGRST205` หรือ Postgres `42P01` */
export function isMissingTableError(error) {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  return /could not find the table|does not exist/i.test(String(error.message || ''));
}

const ORDER_COLS = 'id, "orderNumber", status, "supersededById", "revisedFromId"';
// เพดานรอบการเดินสาย Rev. — กันข้อมูลเสียที่ชี้กันเป็นวง ไม่ใช่จำนวน Rev. ที่คาดว่าจะมี
const MAX_ROUNDS = 20;

async function loadOrders(supabase, ids) {
  return fetchAllInChunks(ids, (chunk) => supabase
    .from('sales_orders').select(ORDER_COLS).in('id', chunk).order('id', { ascending: true }));
}

/**
 * โหลด SO ตาม id แล้วเดินสาย Rev. ต่อจนครบ (`direction`: 'back' = `revisedFromId` · 'forward' = `supersededById`)
 * @returns Map id → แถว SO (รวมใบที่ส่งมาใน `known`)
 */
export async function loadOrderChain(supabase, ids = [], { direction = 'back', known = [] } = {}) {
  const byId = new Map((known || []).filter((o) => o?.id).map((o) => [o.id, o]));
  const key = direction === 'forward' ? 'supersededById' : 'revisedFromId';
  // ใบที่ถามแล้วไม่เจอ (ถูกลบ) ต้องไม่ถูกถามซ้ำทุกรอบ
  const asked = new Set(byId.keys());
  let pending = [...new Set((ids || []).filter((id) => id && !asked.has(id)))];
  for (let round = 0; round < MAX_ROUNDS && pending.length; round += 1) {
    for (const id of pending) asked.add(id);
    for (const row of await loadOrders(supabase, pending)) byId.set(row.id, row);
    pending = [...new Set([...byId.values()].map((o) => o[key]).filter((id) => id && !asked.has(id)))];
  }
  return byId;
}

/**
 * ลิงก์ SO แนบ — คืน `{ rows, missing }` · `missing = true` เมื่อ mig 0436 ยังไม่รัน
 * @param filter `{ requestId }` หรือ `{ salesOrderIds }`
 */
export async function loadScentOrderLinks(supabase, { requestId = null, salesOrderIds = null } = {}) {
  const cols = 'id, "requestId", "salesOrderId", "createdAt", "createdById", "createdByName"';
  try {
    if (requestId) {
      // ⚠️ ใบหนึ่งแนบได้ไม่กี่ใบในชีวิตจริง — 200 คือขอบเขตกันพัง ไม่ใช่กติกาธุรกิจ
      const { data, error } = await supabase.from(SCENT_ORDER_LINKS_TABLE).select(cols)
        .eq('requestId', requestId).order('createdAt', { ascending: true }).limit(200);
      if (error) throw error;
      return { rows: data || [], missing: false };
    }
    const rows = await fetchAllInChunks(salesOrderIds || [], (chunk) => supabase
      .from(SCENT_ORDER_LINKS_TABLE).select(cols).in('salesOrderId', chunk).order('id', { ascending: true }));
    return { rows, missing: false };
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn('[scent-order-links] ยังไม่มีตาราง dept_request_sales_orders (mig 0436 ยังไม่รัน) — ถือว่าไม่มี SO แนบ');
      return { rows: [], missing: true };
    }
    throw error;
  }
}

/**
 * เจ้าของของ SO หลายใบพร้อมกัน — ด่านเปิดคำร้อง · หน้า SO รายใบ · ลิสต์ SO
 *
 * @param orders แถว SO ที่ผู้เรียกมีอยู่แล้ว (ต้องมี `id` · `revisedFromId` ถ้ามี) — ใบก่อนหน้าในสาย Rev. โหลดเพิ่มเอง
 * @returns `{ ownerById: Map(orderId → owner | null), ordersById }`
 *
 * ⚠️ เงื่อนไขของ "SO หลัก" ต้องตรงกับ `dept_requests_pdr_so_uk` (mig 0219) เป๊ะ ๆ: `kind = 'scent_dev'` +
 * `status <> 'cancelled'` — หลวมกว่านี้ = ใบที่ยกเลิกไปแล้วเปิดใหม่ไม่ได้ · แคบกว่านี้ = ชน unique ที่ DB
 * ⚠️ อ่านด้วย service-role โดยตั้งใจ (ผู้เรียกส่งมา) — ทะเบียนคำร้องมีขอบเขตของตัวเอง ถามผ่านทางนั้น
 * จะได้ "ไม่มีใบ" ทั้งที่เพื่อนร่วมทีมเปิดไปแล้ว
 */
export async function loadScentOrderOwners(supabase, orders = []) {
  const given = (orders || []).filter((o) => o?.id);
  const ordersById = await loadOrderChain(supabase, given.map((o) => o.revisedFromId).filter(Boolean), {
    direction: 'back', known: given,
  });
  const allIds = [...ordersById.keys()];
  const ownerById = new Map();
  if (!allIds.length) return { ownerById, ordersById };

  const mains = await fetchAllInChunks(allIds, (chunk) => supabase
    .from('dept_requests').select('id, "docNo", status, "salesOrderId"')
    .in('salesOrderId', chunk).eq('kind', 'scent_dev').neq('status', 'cancelled')
    .order('id', { ascending: true }));
  const mainBySo = new Map(mains.map((row) => [row.salesOrderId, row]));

  const { rows: links } = await loadScentOrderLinks(supabase, { salesOrderIds: allIds });
  const linkRequestIds = [...new Set(links.map((l) => l.requestId))];
  const linkRequests = await fetchAllInChunks(linkRequestIds, (chunk) => supabase
    .from('dept_requests').select('id, "docNo", status').in('id', chunk).order('id', { ascending: true }));
  const requestById = new Map(linkRequests.map((r) => [r.id, r]));
  const linkBySo = new Map(links.map((l) => [l.salesOrderId, { ...l, request: requestById.get(l.requestId) || null }]));

  for (const order of given) {
    ownerById.set(order.id, scentOrderOwner(ordersById.get(order.id) || order, { ordersById, mainBySo, linkBySo }));
  }
  return { ownerById, ordersById };
}

/**
 * SO ทั้งหมดของคำร้องพัฒนากลิ่นใบเดียว — `findRequest` เรียก
 *
 * @returns `{ salesOrderLines, attachedOrders, scentSlotLines, mainOrder }`
 *   · `salesOrderLines` = บรรทัดของ **ใบ Rev. ที่ใช้นับ** ของ SO หลัก (PDR 1.12 · ด่านปิดเดิม)
 *   · `attachedOrders` = `[{ linkId, salesOrderId, orderNumber, countedOrderId, countedOrderNumber, createdAt, createdByName, lines }]`
 *   · `scentSlotLines` = บรรทัด "จำนวนกลิ่น" (SO หลัก + SO แนบที่ไม่ใช่ 03-010)
 * ⚠️ ส่งบรรทัดออกไปแค่ `id, qty, fgCode, description` — ที่เหลือเป็นของใบสั่งขายที่หน้าคำร้องไม่ควรรู้
 */
export async function loadRequestScentOrders(supabase, request) {
  const { rows: links } = await loadScentOrderLinks(supabase, { requestId: request.id });
  const linkedIds = [request.salesOrderId, ...links.map((l) => l.salesOrderId)].filter(Boolean);
  const ordersById = await loadOrderChain(supabase, linkedIds, { direction: 'forward' });
  const counted = (id) => currentRevisionOf(ordersById.get(id) || { id }, ordersById);

  const mainCounted = request.salesOrderId ? counted(request.salesOrderId) : null;
  const countedIds = [mainCounted?.id, ...links.map((l) => counted(l.salesOrderId).id)].filter(Boolean);
  const lines = await fetchAllInChunks(countedIds, (chunk) => supabase
    .from('sales_order_lines').select('id, qty, "fgCode", description, "salesOrderId"')
    .in('salesOrderId', chunk).order('id', { ascending: true }));
  // ⚠️ ไม่แตะ `qty` ที่นี่ — ส่งต่อทั้งแถวที่ select มาแล้ว ตัดแค่คีย์ภายใน (ยามเลขแพ็ค GC: ตัวอ่าน qty มีแค่ตัวนับกลิ่น)
  const linesOf = (soId) => lines.filter((l) => l.salesOrderId === soId)
    .map((line) => { const { salesOrderId: _omit, ...rest } = line; return rest; });

  const salesOrderLines = mainCounted ? linesOf(mainCounted.id) : [];
  const attachedOrders = links.map((link) => {
    const order = ordersById.get(link.salesOrderId) || null;
    const current = counted(link.salesOrderId);
    return {
      linkId: link.id,
      salesOrderId: link.salesOrderId,
      orderNumber: order?.orderNumber || null,
      countedOrderId: current.id,
      countedOrderNumber: current.orderNumber || null,
      createdAt: link.createdAt,
      createdByName: link.createdByName || null,
      lines: linesOf(current.id),
    };
  });
  return {
    salesOrderLines,
    attachedOrders,
    scentSlotLines: scentSlotLines({ mainLines: salesOrderLines, attached: attachedOrders }),
    mainOrder: mainCounted && mainCounted.id !== request.salesOrderId
      ? { id: mainCounted.id, orderNumber: mainCounted.orderNumber || null }
      : null,
  };
}
