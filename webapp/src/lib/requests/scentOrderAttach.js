// ── แนบ / ถอด SO ที่ลูกค้าซื้อเพิ่ม เข้าคำร้องพัฒนากลิ่นเดิม (ม-164 · PR-2) — logic ล้วน ไม่แตะ DB ──
//
// ⭐ **จอกับ server ถามตัวเดียวกัน** — ปุ่มบนหน้าคำร้องกับ route `api/sa/requests/[id]/sales-orders`
//   ตัดสินด้วยฟังก์ชันในไฟล์นี้ ⇒ ปุ่มกับ API ขัดกันไม่ได้ (กติกาเดียวกับ `scentDesignOrderError`)
// ⭐ **บอกผลก่อนกด** (กติกา #1223) — `attachPreview` คืนตัวเลขก่อน/หลังให้โมดัลยืนยัน
//
// มติเจ้าของ 13/11/2026 (docs/scent-dev-topup-plan.md §2):
//   · แนบได้เฉพาะคำร้องพัฒนากลิ่นที่ยังไม่ปิด/ไม่ยกเลิก — ใบที่ปิดแล้วต้องเปิดใบใหม่ "ต่อจากคำร้อง" (PR-4)
//   · คนแนบ = ฝ่ายขายที่เกี่ยวข้อง: ผู้ขอของคำร้อง (+ ทีม · กติกา `canManageRequest`) · เจ้าของดีลของ SO ·
//     หัวหน้าฝ่ายขาย · แอดมิน — **RD แนบไม่ได้**
//   · ลูกค้าเดียวกัน = เลขผู้เสียภาษีเดียวกัน (`customerTaxSiblings` · กติกาเดียวกับ FG)
import { canManageRequest } from '@/lib/requests/access';
import { requestCloseNeedsSoConfirm } from '@/lib/master/requestTypes';
import { isActualOrder } from '@/lib/sales/historicalOrders';
import { scentDesignLines, lineCategoryCode, scentCountForOrder } from '@/lib/requests/scentDesignOrders';
import { salesOrderQty, confirmedQty } from '@/lib/requests/soReconcile';
import {
  isScentRevisionLine, scentOrderTakenText, scentSlotSummary,
} from '@/lib/requests/scentOrderLinks';

const CLOSED = new Set(['closed', 'cancelled']);

/** ใครแนบ/ถอด SO ของใบนี้ได้ — ผู้จัดการคำร้อง (ผู้ขอ · ทีม · หัวหน้าฝ่ายขาย · แอดมิน) หรือเจ้าของดีลของ SO */
export function canActOnScentOrders(user, request, { dealOwnerId = null } = {}) {
  if (!user?.id || !request) return false;
  if (canManageRequest(user, request)) return true;
  return !!dealOwnerId && String(dealOwnerId) === String(user.id);
}

/** ใบนี้รับ SO แนบได้ไหม (ไม่ดูสิทธิ์คน) — คืนข้อความไทย หรือ null */
export function attachRequestError(request) {
  if (!request) return 'ไม่พบคำร้อง';
  if (!requestCloseNeedsSoConfirm(request.kind)) return 'แนบใบสั่งขายได้เฉพาะคำร้องพัฒนากลิ่น';
  if (request.status === 'cancelled') return 'คำร้องนี้ถูกยกเลิกแล้ว แนบใบสั่งขายเพิ่มไม่ได้';
  if (request.status === 'closed') {
    return 'คำร้องนี้ปิดแล้ว — งานเพิ่มต้องเปิดคำร้องใหม่ "ต่อจากคำร้อง" ใบนี้';
  }
  return null;
}

/**
 * แนบ SO ใบนี้เข้าคำร้องได้ไหม — คืนข้อความไทย หรือ null
 *
 * @param owner          เจ้าของปัจจุบันของ SO (`scentOrderOwner`) · null = ยังว่าง
 * @param sameTaxEntity  ลูกค้าของ SO อยู่ในนิติบุคคลเดียวกับคำร้องไหม
 * @param allowed        ผลของ `canActOnScentOrders`
 * ⚠️ ลำดับ = ทางแก้ที่ง่ายไปยาก (กติกาเดียวกับ `scentDesignOrderError`) และสิทธิ์มาก่อนทุกอย่าง
 */
export function attachOrderError({
  request, order, lines = [], owner = null, sameTaxEntity = false, allowed = false, orderNumberOf,
} = {}) {
  if (!allowed) return 'แนบใบสั่งขายได้เฉพาะฝ่ายขายของคำร้องนี้ (ผู้ขอ · เจ้าของดีล · หัวหน้าฝ่ายขาย)';
  const requestError = attachRequestError(request);
  if (requestError) return requestError;
  if (!order) return 'ไม่พบใบสั่งขายที่เลือก';
  if (order.id === request.salesOrderId) return 'ใบสั่งขายนี้เป็นใบหลักของคำร้องนี้อยู่แล้ว';
  if (order.status !== 'approved') return 'ใบสั่งขายต้องอนุมัติแล้วก่อนจึงแนบได้';
  // ใบย้อนหลัง = งานจบไปแล้ว (ทางของมันคือปัดออกจากคิว) · ใบค่าสรรพสามิตไม่มีงานออกแบบกลิ่น
  if (!isActualOrder(order)) return 'ใบสั่งขายย้อนหลังหรือใบค่าสรรพสามิตแนบเข้าคำร้องไม่ได้';
  if (!scentDesignLines(lines).length) {
    return 'ใบสั่งขายนี้ไม่มีบรรทัดออกแบบหรือแก้กลิ่น — แนบได้เฉพาะใบที่ขายงานพัฒนากลิ่น';
  }
  if (scentCountForOrder(lines) == null) return 'อ่านจำนวนจากใบสั่งขายไม่ได้ — จำนวนต้องเป็นจำนวนเต็มบวก';
  if (!sameTaxEntity) return 'ใบสั่งขายนี้เป็นของลูกค้ารายอื่น — แนบได้เฉพาะลูกค้าเดียวกับคำร้อง';
  if (owner) {
    if (owner.requestId === request.id) return 'ใบสั่งขายนี้แนบอยู่กับคำร้องนี้แล้ว';
    return scentOrderTakenText(owner, { orderNumberOf });
  }
  return null;
}

/** ส่วนของ SO ใบหนึ่งที่จะเพิ่มเข้าคำร้อง — จำนวนกลิ่นที่เพิ่ม และรอบแก้ที่ซื้อ */
export function attachAdds(lines = []) {
  const design = scentDesignLines(lines);
  return {
    slots: salesOrderQty(design.filter((l) => !isScentRevisionLine(l))),
    revisions: salesOrderQty(design.filter(isScentRevisionLine)),
  };
}

/**
 * ตัวเลขก่อน/หลังแนบ — โมดัลยืนยันโชว์ และเธรดลงประโยคเดียวกัน
 * @param slots  `scentSlots` ของใบตอนนี้ (findRequest)
 */
export function attachPreview(slots, lines = []) {
  return attachPreviewFromAdds(slots, attachAdds(lines));
}

/** รุ่นที่รับส่วนเพิ่มมาแล้ว — จอมีแค่ `adds` ของตัวเลือก (GET ไม่ส่งบรรทัดทั้งใบ) */
export function attachPreviewFromAdds(slots, adds = { slots: 0, revisions: 0 }) {
  const before = { slots: slots?.slots || 0, revisions: slots?.paidRevisions || 0 };
  return {
    before,
    after: { slots: before.slots + adds.slots, revisions: before.revisions + adds.revisions },
    adds,
  };
}

/** ประโยคตัวเลขก่อน/หลัง — "จำนวนกลิ่น 2 เป็น 3 · รอบแก้ที่ซื้อ 0 เป็น 1" (เอ่ยเฉพาะตัวที่เปลี่ยน) */
export function attachPreviewText(preview) {
  if (!preview) return '';
  const parts = [];
  if (preview.after.slots !== preview.before.slots) {
    parts.push(`จำนวนกลิ่น ${preview.before.slots} เป็น ${preview.after.slots}`);
  }
  if (preview.after.revisions !== preview.before.revisions) {
    parts.push(`รอบแก้ที่ซื้อ ${preview.before.revisions} เป็น ${preview.after.revisions}`);
  }
  return parts.join(' · ');
}

/** สิ่งที่ SO ขาย (เฉพาะงานพัฒนากลิ่น) — "03-002 ×1 · 03-010 ×1" · โชว์บนแถวตัวเลือกและการ์ด */
export function scentOrderLinesText(lines = []) {
  const byCategory = new Map();
  for (const line of scentDesignLines(lines)) {
    const code = lineCategoryCode(line);
    byCategory.set(code, (byCategory.get(code) || 0) + salesOrderQty([line]));
  }
  return [...byCategory].map(([code, qty]) => `${code} ×${qty}`).join(' · ');
}

/**
 * ถอด SO แนบออกได้ไหม — คืนข้อความไทย หรือ null
 *
 * ⭐ บล็อกเมื่อถอดแล้ว **คอนเฟิร์มเกินจำนวนกลิ่นโดยไม่มีแถมรองรับ** — ไม่งั้นตัวเลขเพี้ยนเงียบ
 *   (คอนเฟิร์มไปแล้วเพราะลูกค้าจ่ายใบนี้ ถอดทิ้งแล้วการ์ดกลายเป็น "เกิน" โดยไม่มีใครรู้ว่าทำไม)
 * @param slotsAfter  จำนวนกลิ่นหลังถอด
 */
export function detachOrderError({ request, link, items = [], slotsAfter = 0, allowed = false } = {}) {
  if (!allowed) return 'ถอดใบสั่งขายได้เฉพาะฝ่ายขายของคำร้องนี้ (ผู้ขอ · เจ้าของดีล · หัวหน้าฝ่ายขาย)';
  if (!request) return 'ไม่พบคำร้อง';
  if (!link) return 'ใบสั่งขายนี้ไม่ได้แนบอยู่กับคำร้องนี้';
  if (CLOSED.has(request.status)) return 'คำร้องนี้ปิดหรือยกเลิกแล้ว — ถอดใบสั่งขายไม่ได้';
  const confirmed = confirmedQty(items);
  const freebies = (items || []).filter((i) => i?.outcome === 'confirmed' && i.freebieReason).length;
  const over = confirmed - freebies - slotsAfter;
  if (over > 0) {
    return `ถอดแล้วลูกค้าคอนเฟิร์มเกินที่จ่าย ${over} กลิ่น (คอนเฟิร์ม ${confirmed} จาก ${slotsAfter})`
      + ' — แนบใบสั่งขายอื่นแทน หรือระบุว่าเป็นของแถมก่อน';
  }
  return null;
}

/** จำนวนกลิ่นหลังถอด SO แนบใบหนึ่ง — คิดจากก้อนเดียวกับที่ findRequest ใช้ (ไม่อ่านฐานซ้ำ) */
export function slotsAfterDetach({ salesOrderLines = [], attachedOrders = [], items = [] } = {}, salesOrderId) {
  return scentSlotSummary({
    mainLines: salesOrderLines,
    attached: (attachedOrders || []).filter((a) => a.salesOrderId !== salesOrderId),
    items,
  }).slots;
}
