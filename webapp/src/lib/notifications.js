// ── แจ้งเตือนรายคนในแอป (notifications, mig 0185) ────────────────────────
//
// ระบบเดิมมีแต่ Chat webhook ที่ยิงเข้า**ห้องรวมของฝ่าย** — บอกไม่ได้ว่าใครต้องทำ
// และไม่รู้ว่าใครอ่านแล้ว · ไฟล์นี้คือฝั่ง "งานของคุณคนเดียว"
//
// ⚠️ webhook ไม่ถูกแทนที่ — คนละหน้าที่ (ประกาศให้ฝ่าย vs งานของคุณ)
//
// ⚠️ **fire-and-forget เสมอ**: ทุกฟังก์ชันที่เขียนต้องกลืน error เอง (log ไว้)
// เพราะผู้เรียกอยู่หลังจุดที่ข้อความถูกบันทึกสำเร็จแล้ว — แจ้งเตือนพลาดต้องไม่ทำให้
// การโพสต์ที่สำเร็จแล้วตอบ error (กติกาเดียวกับ lib/chat.js)
import { randomUUID } from 'node:crypto';

// ⚠️ **ห้าม import จาก `lib/master/updates.js`** — ไฟล์นั้น import ไฟล์นี้ (fan-out
// อยู่ใน appendUpdate) การอ้างกลับจะเป็นวงกลม · ต้องการรู้แค่ "ใครเคยโพสต์" จึง
// query คอลัมน์เดียวเองตรง ๆ ซึ่งถูกกว่าโหลดเธรดทั้งเธรดอยู่แล้ว
import { updateEntityConfig, updateRecipients } from '@/lib/master/updateAccess';
import { isSystemUpdateItem, updateKindMeta } from '@/lib/master/updateTypes';
import { mentionIdsOf } from '@/lib/master/mentions';

export const NOTIFICATION_LIST_LIMIT = 30;

// เธรดของ entity ไหนกดไปหน้าไหน — เก็บ path ตอนสร้างเพราะกล่องแจ้งเตือนไม่ควรต้อง
// รู้จัก routing ของทุกโมดูล · entity ที่ไม่มีในนี้ = แจ้งเตือนไม่มีลิงก์ (ยังอ่านได้)
const HREF = {
  personal_task: (id) => `/pm/tasks/${id}`,
  project: (id) => `/sa/projects/${id}`,
  dept_request: (id) => `/sa/requests/${id}`,
  deal: (id) => `/sa/deals/${id}`,
  lead: (id) => `/sa/leads/${id}`,
  costing_request: (id) => `/sa/costing/${id}`,
  customer: (id) => `/database/customers/${id}`,
  product: (id) => `/database/products/${id}`,
  excise_registration: (id) => `/tax/registrations/${id}`,
  excise_order: (id) => `/tax/filings/${id}`,
  sahamit_po: (id) => `/sahamit/po/${id}`,
  // นัดเข้าบริการยังไม่มีหน้ารายละเอียดรายใบ — ส่งไปที่ **ตาราง** ซึ่งเป็นที่ที่เปิด
  // นัดนั้นได้จริง (คลิกชิปแล้วโมดัลเปิดพร้อมเธรด)
  service_visit: () => '/service/schedule',
};

// ป้ายที่ขึ้นหัวแจ้งเตือน — ใช้ชื่อเอกสารจากแถวแม่ถ้ามี ไม่มีก็ใช้ id ดิบเป็นทางสุดท้าย
// (⚠️ กฎเดิม: อย่า fallback เป็น id ดิบบนหน้าจอถ้าเลี่ยงได้ — ลองหลายช่องก่อน)
const ENTITY_LABEL = {
  personal_task: 'งาน',
  project: 'โครงการ',
  dept_request: 'คำร้อง',
  deal: 'ดีล',
  lead: 'ลีด',
  costing_request: 'ใบขอราคาผลิต',
  customer: 'ลูกค้า',
  product: 'สินค้า',
  excise_registration: 'ทะเบียนสรรพสามิต',
  excise_order: 'ใบยื่นชำระภาษี',
  sahamit_po: 'PO สหมิตร',
  service_visit: 'นัดเข้าบริการ',
};

export function entityTitle(entityType, parent) {
  // ⚠️ ลำดับสำคัญ: ของที่มี "เลขที่เอกสาร" ต้องมาก่อน `name`/`title` เสมอ —
  // ทะเบียนสรรพสามิตมีทั้ง fgCode และชื่อสินค้า คนทำงานเรียกด้วยรหัส FG
  const name = parent?.title || parent?.code || parent?.quoteNumber || parent?.orderNumber
    || parent?.poNumber || parent?.docNo || parent?.fgCode
    || parent?.contactName || parent?.name || parent?.id || '';
  const label = ENTITY_LABEL[entityType] || 'รายการ';
  return `${label} ${name}`.trim().slice(0, 200);
}

export function notificationHref(entityType, entityId) {
  return HREF[entityType] ? HREF[entityType](entityId) : null;
}

// ── ผู้รับของอัปเดตหนึ่งแถว ──────────────────────────────────────────────
// = คนที่ผูกกับ entity (ทะเบียน updateAccess) + **คนที่เคยโพสต์ในเธรดนั้น**
//   − คนที่เพิ่งโพสต์เอง (ไม่ต้องแจ้งตัวเอง)
//
// ⭐ "คนเคยโพสต์" คือส่วนที่ทำให้เธรดสองฝ่ายทำงานได้โดยไม่ต้องแจ้งทั้งฝ่าย: RD ที่
// ตอบเคสไปแล้วครั้งหนึ่งจะได้รับข้อความถัดไปเอง ส่วนคนที่ไม่เคยเกี่ยวไม่ถูกรบกวน
export function threadParticipants(items = []) {
  return [...new Set(
    items
      .filter((row) => !row?.deletedAt && row?.authorId)
      .map((row) => String(row.authorId)),
  )];
}

async function pastAuthors(supabase, entityType, entityId) {
  const { data, error } = await supabase
    .from('entity_updates').select('authorId, deletedAt')
    .eq('entityType', entityType).eq('entityId', String(entityId));
  if (error) {
    // อ่านคนเคยโพสต์ไม่ได้ ≠ ไม่มีใครเคยโพสต์ — log แล้วเดินต่อด้วยผู้รับจากทะเบียน
    // (แจ้งเตือนขาดคนดีกว่าโพสต์ไม่สำเร็จ) ดู [[supabase-masked-query-errors]]
    console.error('[notifications] อ่านคนเคยโพสต์ไม่สำเร็จ', entityType, entityId, error.message);
    return [];
  }
  return data || [];
}

export async function recipientsForUpdate(supabase, { entityType, entityId, parent, actorId, update }) {
  const [owners, thread] = await Promise.all([
    updateRecipients(supabase, entityType, parent),
    pastAuthors(supabase, entityType, entityId),
  ]);
  // คนที่ถูก @ ถึงในข้อความนี้ — id ถูกกรองด้วยด่านของ entity ตั้งแต่ตอนโพสต์แล้ว
  // (ดู lib/master/mentions) จึงเชื่อได้ตรงนี้
  const all = new Set([...owners, ...threadParticipants(thread), ...mentionIdsOf(update)]);
  if (actorId) all.delete(String(actorId));
  return [...all];
}

// ── เขียน ────────────────────────────────────────────────────────────────
// fan-out 1 ผู้รับ = 1 แถว (มติ 14) · unique (userId, updateId) กันซ้ำที่ระดับ DB
// จึงใช้ upsert แบบ ignore ได้ปลอดภัยเมื่อถูกเรียกซ้ำ
export async function notifyThreadUpdate(supabase, { entityType, entityId, parent, update, actor }) {
  try {
    if (!updateEntityConfig(entityType) || !update?.id) return { sent: 0 };
    const userIds = await recipientsForUpdate(supabase, {
      entityType, entityId, parent, actorId: actor?.id, update,
    });
    if (!userIds.length) return { sent: 0 };

    // เหตุการณ์ระบบก็แจ้งได้ (ถูกตีกลับ = สิ่งที่ต้องรู้ที่สุด) — ป้ายมาจากทะเบียน
    // ชนิดเดียวกับที่หน้าจอใช้ ผู้ใช้จะได้เห็นคำเดียวกันทั้งกล่องและในเธรด
    const kindLabel = updateKindMeta(entityType, update.kind)?.label || 'อัปเดต';
    const rows = userIds.map((userId) => ({
      id: `NTF-${randomUUID()}`,
      userId,
      entityType,
      entityId: String(entityId),
      updateId: update.id,
      kind: 'thread_update',
      title: `${kindLabel} · ${entityTitle(entityType, parent)}`.slice(0, 200),
      body: update.body ? String(update.body).slice(0, 500) : null,
      href: notificationHref(entityType, entityId),
      // เหตุการณ์ระบบไม่มี "คนพูด" ในความหมายของบทสนทนา แต่ยังมีคนกดปุ่ม —
      // โชว์ชื่อคนกดเสมอ ไม่งั้นอ่านว่า "ใครตีกลับ" ไม่ได้
      actorName: actor?.name || update.authorName || null,
      createdAt: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('notifications')
      .upsert(rows, { onConflict: 'userId,updateId', ignoreDuplicates: true });
    if (error) {
      console.error('[notifications] fan-out failed', entityType, entityId, error.message);
      return { sent: 0, error: error.message };
    }
    return { sent: rows.length, system: isSystemUpdateItem(entityType, { kind: 'own', row: update }) };
  } catch (e) {
    console.error('[notifications] fan-out threw', entityType, entityId, e.message);
    return { sent: 0, error: e.message };
  }
}

// ── อ่าน ─────────────────────────────────────────────────────────────────
export async function listNotifications(supabase, userId, { limit = NOTIFICATION_LIST_LIMIT } = {}) {
  const { data, error } = await supabase
    .from('notifications').select('*')
    .eq('userId', String(userId))
    .order('createdAt', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function unreadCount(supabase, userId) {
  const { count, error } = await supabase
    .from('notifications').select('id', { count: 'exact', head: true })
    .eq('userId', String(userId)).is('readAt', null);
  if (error) throw error;
  return count || 0;
}

// ── อ่านแล้ว ─────────────────────────────────────────────────────────────
// (มติ 15) เปิดเธรด = mark read **ทั้ง entity ก้อนเดียว** ตั้งใจไม่ทำ watermark
// ต่อเธรดต่อคนแบบ Slack (เส้นคั่น "ข้อความใหม่") — แพงและได้เพิ่มน้อย
export async function markThreadRead(supabase, userId, entityType, entityId) {
  const { error } = await supabase
    .from('notifications').update({ readAt: new Date().toISOString() })
    .eq('userId', String(userId))
    .eq('entityType', entityType).eq('entityId', String(entityId))
    .is('readAt', null);
  if (error) throw error;
}

export async function markAllRead(supabase, userId) {
  const { error } = await supabase
    .from('notifications').update({ readAt: new Date().toISOString() })
    .eq('userId', String(userId)).is('readAt', null);
  if (error) throw error;
}

// ลบ entity → กวาดแจ้งเตือนของมันทิ้ง (ไม่มี FK — เรียกจาก purgeUpdatesMany ที่เดียว)
// ไม่กวาด = กล่องมีแถวที่กดแล้วเจอ 404 ค้างอยู่ตลอดไป
export async function purgeNotificationsMany(supabase, entityType, entityIds = []) {
  const ids = (entityIds || []).filter(Boolean).map(String);
  if (!entityType || !ids.length) return;
  const { error } = await supabase
    .from('notifications').delete()
    .eq('entityType', entityType).in('entityId', ids);
  if (error) console.error('[notifications] purge failed', entityType, ids.length, error.message);
}
