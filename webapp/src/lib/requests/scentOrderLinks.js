// ── SO ของคำร้องพัฒนากลิ่น: SO หลัก + SO ที่แนบเพิ่ม (ม-163 · mig 0436) — logic ล้วน ไม่แตะ DB ──
//
// ⭐ **ที่มา** (มติเจ้าของ 13/11/2026 · docs/scent-dev-topup-plan.md) — ลูกค้าอยากได้เพิ่มต้องจ่ายเพิ่ม
// ซึ่งเดินลูป DL > QT > SO ใหม่ตามปกติ แต่ SO ใบใหม่ไม่เคยมีทางผูกกลับไปหาคำร้องเดิม (ม-37 ล็อก
// 1 SO : 1 คำร้อง) · วัด prod 13/11: SO ออกแบบ/แก้กลิ่นที่อนุมัติแล้ว 73 ใบ **ไม่มีคำร้องรับ 17 ใบ**
//
// ⭐ ของที่ลูกค้าซื้อเพิ่มมีสองชนิด ⇒ คำถามเดียวตัดสิน "งานนี้ต้องมีบรีฟใหม่ไหม"
//   · ไม่ต้อง + ใบเดิมยังไม่ปิด = **แนบ** SO เข้าใบเดิม (ตาราง `dept_request_sales_orders`)
//   · ต้อง หรือใบเดิมปิดแล้ว = **เปิดใบใหม่** ชี้กลับ (`continuesRequestId`)
//
// ⭐ **นับสองแบบ ห้ามปน**
//   · **จำนวนกลิ่น** (ตัวหารของด่านปิดใบ) = บรรทัดออกแบบกลิ่นของ SO หลักแบบเดิมทุกอย่าง (ม-38 ·
//     รวม 03-010 ของ SO หลัก) + บรรทัดออกแบบกลิ่นของ SO แนบ **ยกเว้น 03-010**
//   · **รอบแก้ที่ซื้อ** = 03-010 ของ SO แนบ — ไม่เข้าด่านปิดใบ
//   🐞 ถ้าเอา 03-010 ของ SO แนบไปนับเป็นกลิ่น จำนวนที่ต้องคอนเฟิร์มขึ้นทั้งที่ไม่มีกลิ่นเพิ่ม ⇒ ใบปิดไม่ได้ตลอดกาล
//
// ⭐ **SO หนึ่งใบมีเจ้าของได้คำร้องเดียว** (หลักหรือแนบ) และ **เจ้าของเดินตามสาย Rev.** —
// SO ไม่พาคำร้องตามไปใบ Rev. ใหม่ (ไม่มีโค้ดไหนย้าย `salesOrderId`) ⇒ ไม่เดินสาย = ใบ Rev.
// ดูเหมือนไม่มีคำร้อง เปิดซ้ำได้ และคำร้องนับบรรทัดจากใบที่ถูกแทนไปแล้ว
import { lineCategoryCode, scentDesignLines } from '@/lib/requests/scentDesignOrders';
import { salesOrderQty } from '@/lib/requests/soReconcile';

/** หมวด "แก้ไขกลิ่น" — บน SO แนบนับเป็นรอบแก้ที่ซื้อ ไม่ใช่จำนวนกลิ่น */
export const SCENT_REVISION_CATEGORY = '03-010';

export const isScentRevisionLine = (line) => lineCategoryCode(line) === SCENT_REVISION_CATEGORY;

// เพดานการเดินสาย Rev. — กันวงวนจากข้อมูลเสีย (ใบชี้กันเอง) ไม่ใช่จำนวน Rev. ที่คาดว่าจะมีจริง
const MAX_REVISION_HOPS = 20;

/**
 * ใบ Rev. ที่ใช้นับของ SO — เดิน `supersededById` ไปข้างหน้า
 *
 * ⭐ เลือก **ใบล่าสุดที่อนุมัติแล้ว** · ไม่มีใบอนุมัติในสาย (Rev. ใหม่ยังรออนุมัติ) = ใบล่าสุดที่เป็น
 * `revised` (คือใบที่เคยอนุมัติแล้วถูกแทน — บรรทัดที่ลูกค้าตกลงไว้ล่าสุด) · ไม่มีทั้งคู่ = ใบที่ผูกไว้เอง
 * (พฤติกรรมเดิมก่อน ม-163)
 * ⚠️ ใบที่ตามไม่เจอใน `ordersById` = หยุดเดินที่ใบก่อนหน้า ไม่เดา
 */
export function currentRevisionOf(order, ordersById = new Map()) {
  if (!order) return null;
  const chain = [order];
  const seen = new Set([order.id]);
  let cursor = order;
  for (let hop = 0; hop < MAX_REVISION_HOPS && cursor?.supersededById; hop += 1) {
    const next = ordersById.get(cursor.supersededById);
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    chain.push(next);
    cursor = next;
  }
  for (let i = chain.length - 1; i >= 0; i -= 1) if (chain[i].status === 'approved') return chain[i];
  for (let i = chain.length - 1; i >= 0; i -= 1) if (chain[i].status === 'revised') return chain[i];
  return order;
}

/**
 * id ของใบนี้และใบก่อนหน้าทั้งสาย (เดิน `revisedFromId` ย้อนหลัง) — ตัวเองมาก่อนเสมอ
 * ⚠️ ใบก่อนหน้าที่ไม่อยู่ใน `ordersById` = id ของมันยังอยู่ในผล แต่หยุดเดินต่อ (ไม่รู้ว่าก่อนหน้านั้นคือใคร)
 */
export function revisionAncestorIds(order, ordersById = new Map()) {
  if (!order?.id) return [];
  const ids = [order.id];
  const seen = new Set(ids);
  let parentId = order.revisedFromId || null;
  for (let hop = 0; hop < MAX_REVISION_HOPS && parentId && !seen.has(parentId); hop += 1) {
    ids.push(parentId);
    seen.add(parentId);
    parentId = ordersById.get(parentId)?.revisedFromId || null;
  }
  return ids;
}

/**
 * คำร้องเจ้าของ SO — คืน `{ requestId, docNo, status, role: 'main'|'attached', viaOrderId }` หรือ null
 *
 * @param order       แถว SO (ต้องมี `id` · `revisedFromId`)
 * @param ordersById  Map ของ SO ที่โหลดมา (ใช้เดินสาย Rev. ย้อนหลัง)
 * @param mainBySo    Map salesOrderId → คำร้องพัฒนากลิ่นที่ใช้ใบนั้นเป็น SO หลัก (ไม่ยกเลิก · ตามดัชนี 0219)
 * @param linkBySo    Map salesOrderId → `{ requestId, request }` ของ SO แนบ
 *
 * ⚠️ ลิงก์ที่ชี้คำร้องที่ยกเลิกแล้ว **ไม่นับเป็นเจ้าของ** — ยกเลิกใบต้องปลด SO กลับเข้าคิว
 * (ตัวยกเลิกลบลิงก์ให้ · ตรงนี้เป็นตาข่ายชั้นสองเผื่อแถวค้าง)
 * ⚠️ `viaOrderId` ≠ `order.id` = เจ้าของมาทางใบก่อนหน้าในสาย Rev. — ข้อความบนจอต้องบอกแบบนั้น
 */
export function scentOrderOwnerOf(order, { ordersById = new Map(), mainBySo = new Map(), linkBySo = new Map() } = {}) {
  for (const soId of revisionAncestorIds(order, ordersById)) {
    const main = mainBySo.get(soId);
    if (main && main.status !== 'cancelled') {
      return { requestId: main.id, docNo: main.docNo || null, status: main.status, role: 'main', viaOrderId: soId };
    }
    const link = linkBySo.get(soId);
    if (link?.request && link.request.status !== 'cancelled') {
      return {
        requestId: link.request.id, docNo: link.request.docNo || null, status: link.request.status,
        role: 'attached', viaOrderId: soId,
      };
    }
  }
  return null;
}

/**
 * ข้อความ "ใบนี้มีเจ้าของแล้ว" — ใช้ทั้งด่านเปิดคำร้อง (server) และป้ายบนจอ
 * ⚠️ บอกทางออกเสมอ — คนถือใบเดียวในมือต้องรู้ว่าไปหาใบไหน
 */
export function scentOrderTakenText(owner, { orderNumberOf = () => null } = {}) {
  if (!owner) return null;
  const no = owner.docNo || owner.requestId;
  if (owner.viaRevision) {
    const from = orderNumberOf(owner.viaOrderId) || 'ใบก่อนหน้า';
    return `ใบสั่งขายนี้เป็น Rev. ของ ${from} ซึ่งมีคำร้อง ${no} อยู่แล้ว — งานต่อที่คำร้องนั้น`;
  }
  if (owner.role === 'attached') return `ใบสั่งขายนี้แนบอยู่กับคำร้อง ${no} แล้ว`;
  return `ใบสั่งขายนี้เปิดคำร้องไปแล้ว (${no}) — ขอเพิ่มต้องออกใบสั่งขายใหม่`;
}

/**
 * ก้อน `scentRequest` ที่ API ฝั่ง SO ส่งให้จอ — รูปเดิม `{ id, docNo, status }` + บทบาท + ข้อความด่าน
 * ⚠️ คงสามคีย์เดิมไว้ — ฟอร์มเปิดคำร้อง (`scentDesignOrderOptions`) และเส้นงานหน้า SO อ่านชื่อเดิมอยู่
 */
export function scentRequestRef(owner, { orderNumberOf = () => null } = {}) {
  if (!owner) return null;
  return {
    id: owner.requestId,
    docNo: owner.docNo || null,
    status: owner.status,
    role: owner.role,
    viaRevision: !!owner.viaRevision,
    takenText: scentOrderTakenText(owner, { orderNumberOf }),
  };
}

/**
 * เจ้าของพร้อมธง `viaRevision` — ห่อ `scentOrderOwnerOf` ให้ผู้เรียกไม่ต้องเทียบ id เอง
 */
export function scentOrderOwner(order, maps) {
  const owner = scentOrderOwnerOf(order, maps);
  return owner ? { ...owner, viaRevision: owner.viaOrderId !== order?.id } : null;
}

/**
 * บรรทัดที่เป็น "จำนวนกลิ่น" ของคำร้อง — ตัวหารของด่านปิดใบและการ์ดกระทบยอด
 *
 * @param mainLines  บรรทัดของ SO หลัก (ใบ Rev. ที่ใช้นับ)
 * @param attached   `[{ lines }]` ของ SO แนบ (ใบ Rev. ที่ใช้นับ)
 * ⚠️ SO หลักนับแบบเดิมทั้งหมด (ม-38 รวม 03-010) — ใบที่เปิดเพื่อแก้กลิ่นล้วนต้องยังมีจำนวนกลิ่น
 */
export function scentSlotLines({ mainLines = [], attached = [] } = {}) {
  return [
    ...scentDesignLines(mainLines || []),
    ...(attached || []).flatMap((a) => scentDesignLines(a?.lines || []).filter((l) => !isScentRevisionLine(l))),
  ];
}

/** บรรทัดรอบแก้ที่ซื้อ — 03-010 ของ SO แนบเท่านั้น */
export function paidRevisionLines({ attached = [] } = {}) {
  return (attached || []).flatMap((a) => scentDesignLines(a?.lines || []).filter(isScentRevisionLine));
}

/** แถวรอบแก้ของสายพัฒนากลิ่นที่เกิดแล้วในใบ — "รอบแก้ที่ใช้" (ข้อมูลอย่างเดียว · มติ 3 ยังไม่จำกัด) */
export function usedRevisionCount(items = []) {
  return (items || []).filter((row) => row?.lineKind === 'scent_dev' && row.derivedFromItemId).length;
}

/**
 * สรุปตัวเลขของคำร้อง — จอใช้ประกอบข้อความ · ด่านใช้ `slots`
 * @returns `{ slots, mainSlots, attachedSlots, paidRevisions, usedRevisions, attachedCount }`
 */
export function scentSlotSummary({ mainLines = [], attached = [], items = [] } = {}) {
  const mainSlots = salesOrderQty(scentDesignLines(mainLines || []));
  const attachedSlots = salesOrderQty(scentSlotLines({ attached }));
  return {
    slots: mainSlots + attachedSlots,
    mainSlots,
    attachedSlots,
    paidRevisions: salesOrderQty(paidRevisionLines({ attached })),
    usedRevisions: usedRevisionCount(items),
    attachedCount: (attached || []).length,
  };
}

/**
 * บรรทัด "จำนวนกลิ่น" ของคำร้องที่โหลดมาแล้ว — ผู้อ่านทุกตัว (ด่านปิด · การ์ดกระทบยอด) เรียกตัวนี้
 * ⚠️ ถอยไปบรรทัดออกแบบกลิ่นของ SO หลักแบบเดิมเมื่อตัวโหลดไม่ได้เติม `scentSlotLines` มา
 * (คำร้องที่ไม่ใช่พัฒนากลิ่น · ตัวเรียกที่ไม่ผ่าน findRequest)
 */
export function scentSlotLinesOf(request) {
  if (Array.isArray(request?.scentSlotLines)) return request.scentSlotLines;
  return scentDesignLines(request?.salesOrderLines || []);
}

/**
 * ข้อความเสริมใต้การ์ดกระทบยอด — คืน null เมื่อไม่มีอะไรเพิ่มจากข้อความเดิม (ไม่มี SO แนบ)
 * ⚠️ ใบที่ไม่มี SO แนบต้องเงียบ — วันนี้ทุกใบบน prod เป็นแบบนั้น จอต้องเหมือนเดิมเป๊ะ
 */
export function scentSlotNote(summary) {
  if (!summary?.attachedCount) return null;
  const parts = [`จำนวนกลิ่น ${summary.slots} (SO หลัก ${summary.mainSlots} + แนบ ${summary.attachedSlots})`];
  if (summary.paidRevisions) parts.push(`รอบแก้: ซื้อ ${summary.paidRevisions} · ใช้ ${summary.usedRevisions}`);
  return parts.join(' · ');
}
