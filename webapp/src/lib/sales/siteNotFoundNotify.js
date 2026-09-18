// ── กระดิ่ง "TS แจ้งว่าไม่พบจุดนี้หน้างาน" (มติ 16/09/2026 ข้อ 23.2 · ข2) ─────────
//
// 🐞 **ฝ่ายขายรู้ต่อเมื่อบังเอิญเปิดทะเบียนแล้วเห็นชิป** — ข1 ให้ TS แจ้งได้แล้ว และจุดนั้น
//   หลุดจากคิวทันที แต่ไม่มีอะไรไปสะกิดคนที่ต้องตัดสิน ⇒ จุดค้างรอได้เป็นสัปดาห์โดยไม่มีใครผิด
//
// ⭐ **ถึงผู้คีย์ใบ ไม่ใช่ AE ของดีล** (มติข้อ 23.2) — คนตัดสินคือ AE Supervisor/แอดมินที่คีย์ใบ
//   (`sales_orders."createdBy"`) ส่วน AE ของดีล (`ownerId`) เป็นคนละคนโดยออกแบบ และดูได้จาก
//   ชิปในทะเบียน SO อยู่แล้ว · ยิงหา AE ด้วยคือกระดิ่งที่เขาทำอะไรต่อไม่ได้
//
// ⚠️ **kind ต้องเป็นค่าคงที่ ประกาศตรง ๆ ในไฟล์นี้** — ยามกัน drift ใน `notifications.test.mjs`
//   กวาดทั้ง `src/` ด้วย regex หา `kind: 'sales_order_…'` กับ `_KIND = 'sales_order_…'`
//   ประกอบจาก template string เมื่อไร ยามมองไม่เห็นแล้วแจ้งเตือนหายจากกระดิ่งเงียบ ๆ
import { after } from 'next/server';
import { notifyUsers } from '@/lib/notifications';

export const SITE_NOT_FOUND_KIND = 'sales_order_site_not_found';
export const SITE_NOT_FOUND_ENTITY_TYPE = 'sales_order';

/* กุญแจกันยิงซ้ำ — หนึ่งใบ หนึ่งรอบการแจ้ง
   ⚠️ ใช้ **เวลาที่แจ้ง** ไม่ใช่ id ของบรรทัด: TS กดแจ้งทีเดียวหลายจุด (ขั้น 1 ของวิซาร์ด)
      ⇒ คีย์รายบรรทัดจะยิงกระดิ่งห้าใบพร้อมกันสำหรับเรื่องเดียว · และถ้า TS ถอนแล้วแจ้งใหม่
      รอบถัดไปได้เวลาใหม่ ⇒ กระดิ่งรอบสองไม่ถูกกลืน */
export const siteNotFoundDedupeKey = (orderId, at) => `sitenf:${orderId}:${String(at || '').slice(0, 19)}`;

/** ปลายทาง — หน้าใบ ซึ่งเป็นที่เดียวที่กดตัดสินได้ */
const hrefOf = (orderId) => `/sa/sales-orders/${orderId}`;

/**
 * ใครควรได้รับ + ข้อความว่าอะไร — ฟังก์ชันบริสุทธิ์ เทสต์ได้โดยไม่ต้องมี DB
 * @returns payload ของ `notifyUsers` หรือ null เมื่อไม่มีใครต้องรู้
 */
export function siteNotFoundNotice({ order, lines = [], actorId = null, at = null } = {}) {
  if (!order?.id || !order?.orderNumber) return null;
  const points = (lines || []).map((l) => String(l?.installationPoint ?? '').trim()).filter(Boolean);
  if (!points.length) return null;

  const actor = actorId ? String(actorId) : null;
  /* ผู้คีย์ใบเท่านั้น · ตัวเองแจ้งเองไม่ต้องเด้งใส่ตัวเอง (TS กับผู้คีย์เป็นคนละคนเสมอในทางปฏิบัติ
     แต่แอดมินสวมได้ทั้งสองบทบาท) */
  const userIds = [...new Set([order.createdBy].filter(Boolean).map(String))]
    .filter((id) => id !== actor);
  if (!userIds.length) return null;

  const head = points.slice(0, 3).join(' · ');
  const more = points.length > 3 ? ` และอีก ${points.length - 3} จุด` : '';
  return {
    userIds,
    entityType: SITE_NOT_FOUND_ENTITY_TYPE,
    entityId: order.id,
    kind: SITE_NOT_FOUND_KIND,
    title: `TS ไม่พบจุดติดตั้ง ${points.length} จุดของ ${order.orderNumber}`,
    body: `${head}${more} — เปิดใบเพื่อตัดสิน: แก้ชื่อจุดส่งกลับ · ปิดจุด (เก็บยอด) · ถอดออกจากใบ`,
    dedupeKey: siteNotFoundDedupeKey(order.id, at),
    href: hrefOf(order.id),
  };
}

/**
 * ยิงจริง — fire-and-forget หลังบันทึกธงสำเร็จแล้ว
 * ⚠️ **ห้ามให้กระดิ่งที่ยิงพลาดทำให้การแจ้งจุดตอบ error** — TS กดมาแจ้งจุด ไม่ได้มาส่งแจ้งเตือน
 *    `notifyUsers` กลืน error ของตัวเองอยู่แล้ว ที่ห่อเพิ่มคือกัน `after()` ที่โยนนอก request scope
 */
export function notifySiteNotFound(supabase, { order, lines, actor, at } = {}) {
  const notice = siteNotFoundNotice({ order, lines, actorId: actor?.id, at });
  if (!notice) return false;
  const deliver = () => notifyUsers(supabase, {
    ...notice,
    actorName: actor?.name || actor?.email || null,
  });
  try {
    after(deliver);
  } catch {
    deliver().catch(() => {});
  }
  return true;
}
