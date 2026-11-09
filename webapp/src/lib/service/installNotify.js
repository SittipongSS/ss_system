// ── กระดิ่ง "ฝ่ายขายขอคิวติดตั้ง" ถึง TS (ขั้นเข้าติดตั้ง PR-2b · มติ 09/11/2026) ─────────────────────
//
// ⭐ ผู้รับ = หัวหน้า TS (`SERVICE_HEAD_ROLES`) + Planner (คนจัดคิว) — คนที่ยืนยันวันได้
//    · ไม่เด้งใส่คนกดเอง · ผู้ใช้ที่ปิดบัญชีไม่ได้รับ
// ⭐ ยิงทุกครั้งที่ขอคิว/แก้วันที่ขอ (กุญแจกันซ้ำผูกกับ `requestedAt` — กดซ้ำรอบเดียวกันไม่เด้งซ้ำ)
// ⚠️ **kind ประกาศตรง ๆ ที่นี่** และต้องอยู่ใน `SERVICE_BELL_KINDS` (เทสต์ตรึงไว้)
// ⚠️ href ไปแท็บ "รอติดตั้ง" ของงานเข้าใหม่ (งวด PR-3) — ทั้งเส้นอยู่หลังสวิตช์จนครบทุกงวด
import { after } from 'next/server';
import { notifyUsers } from '@/lib/notifications';
import { SERVICE_HEAD_ROLES, normalizeRole } from '@/lib/permissions';
import { loadUserDirectory } from '@/lib/usersRepo';
import { fmtDate } from '@/lib/format';

export const INSTALL_REQUESTED_KIND = 'install_requested';
export const INSTALL_DATE_CONFIRMED_KIND = 'install_date_confirmed';
export const INSTALL_CUSTOMER_CONFIRMED_KIND = 'install_customer_confirmed';
export const INSTALL_QUEUE_HREF = '/service/intake?tab=install';
export const INSTALL_REQUEST_RECIPIENT_ROLES = Object.freeze([...SERVICE_HEAD_ROLES, 'ts_planner']);

/**
 * ใครได้รับ + ข้อความ — ฟังก์ชันบริสุทธิ์
 * @param request แถวคำขอหลังบันทึก (id · requestedAt · requestedDate · ช่วงเวลา)
 * @param order   ใบสั่งขาย (id · orderNumber · customerName)
 * @param site    `{ code, name }` · zoneCount = จำนวนโซนที่ขอ
 * @param changed true = แก้คำขอเดิม (ไม่ใช่ขอครั้งแรก)
 * @param rescheduled true = ลูกค้าขอเปลี่ยนวันหลัง TS ยืนยัน (PR-4) — บอกเหตุ (`changeReason`) ให้ TS เห็นในกระดิ่ง
 * @returns payload ของ `notifyUsers` หรือ null เมื่อไม่มีใครต้องรู้
 */
export function installRequestedNotice({
  request, order, site = null, zoneCount = 0, users = [], actor = null, changed = false, rescheduled = false,
} = {}) {
  if (!request?.id || !order?.id) return null;
  const actorId = actor?.id ? String(actor.id) : null;
  const userIds = [...new Set((users || [])
    .filter((u) => u && !u.disabled && INSTALL_REQUEST_RECIPIENT_ROLES.includes(normalizeRole(u.role)))
    .map((u) => String(u.id)))]
    .filter((id) => id !== actorId);
  if (!userIds.length) return null;
  const where = [site?.code, site?.name].filter(Boolean).join(' ') || 'ไซต์';
  const time = request.requestedStartTime && request.requestedEndTime
    ? ` ${String(request.requestedStartTime).slice(0, 5)}–${String(request.requestedEndTime).slice(0, 5)}`
    : '';
  return {
    userIds,
    entityType: 'sales_order',
    entityId: order.id,
    kind: INSTALL_REQUESTED_KIND,
    title: `${rescheduled ? 'ลูกค้าขอเปลี่ยนวันติดตั้ง' : changed ? 'แก้คำขอคิวติดตั้ง' : 'ขอคิวติดตั้ง'} · ${order.orderNumber || order.id}`,
    body: rescheduled
      ? `${where} · วันใหม่ ${fmtDate(request.requestedDate)}${time} เพราะ ${String(request.changeReason || '').slice(0, 120)}`
        + ` (แจ้งโดย ${actor?.name || 'ฝ่ายขาย'}) — ยืนยันวันใหม่บนนัดเดิม แล้วฝ่ายขายคอนเฟิร์มลูกค้าอีกครั้ง`
      : `${actor?.name || 'ฝ่ายขาย'} ขอติดตั้ง ${where} · ${zoneCount} โซน · ต้องการ ${fmtDate(request.requestedDate)}${time}`
        + (order.customerName ? ` · ${order.customerName}` : '')
        + ' — ยืนยันวันได้เมื่อมัดจำก่อนติดตั้งผ่าน',
    dedupeKey: `install-requested:${request.id}:${String(request.requestedAt || '').slice(0, 19)}`,
    href: INSTALL_QUEUE_HREF,
  };
}

/** ยิงจริง — fire-and-forget หลังบันทึกสำเร็จ · กระดิ่งที่พลาดต้องไม่ทำให้การขอคิวตอบ error */
export function notifyInstallRequested(supabase, args = {}) {
  const deliver = async () => {
    const directory = await loadUserDirectory(supabase);
    const notice = installRequestedNotice({ ...args, users: [...directory.values()] });
    if (!notice) return;
    await notifyUsers(supabase, { ...notice, actorName: args.actor?.name || null });
  };
  const safe = () => deliver().catch((e) => console.error('[install-requested] แจ้ง TS ไม่สำเร็จ:', e?.message));
  try {
    after(safe);
  } catch {
    safe();
  }
}

/* ── กระดิ่ง "TS ยืนยันวันติดตั้งแล้ว" ถึงฝ่ายขาย (PR-3a · มติ 09/11 N3/N4) ─────────────────────────────────
   ⭐ ผู้รับ = คนขอคิว + คนเลือก "ติดตั้ง" ของไซต์นั้น (ฝ่ายขายที่ถือเรื่อง) · ไม่เด้งใส่คนกดเอง
   ⭐ บอกวันที่ TS ยืนยัน และ **เหตุที่ปรับวัน** เมื่อไม่ตรงกับที่ขอ — SA ต้องโทรคอนเฟิร์มลูกค้า **ทุกครั้ง** (N4)
   ⚠️ href ไปการ์ดติดตั้งบนใบสั่งขาย (ที่เดียวที่คอนเฟิร์มลูกค้าได้ · งวด PR-4) */
export function installDateConfirmedNotice({ request, order, visit, site = null, zoneCount = 0, actor = null } = {}) {
  if (!request?.id || !order?.id || !visit?.id) return null;
  const actorId = actor?.id ? String(actor.id) : null;
  const userIds = [...new Set([request.requestedById, request.decidedById].filter(Boolean).map(String))]
    .filter((id) => id !== actorId);
  if (!userIds.length) return null;
  const where = [site?.code, site?.name].filter(Boolean).join(' ') || 'ไซต์';
  const time = visit.startTime && visit.endTime
    ? ` ${String(visit.startTime).slice(0, 5)}–${String(visit.endTime).slice(0, 5)}`
    : '';
  const moved = visit.dateChangeReason && request.requestedDate && request.requestedDate !== visit.scheduledDate
    ? ` (ปรับจาก ${fmtDate(request.requestedDate)} เพราะ ${String(visit.dateChangeReason).slice(0, 120)})`
    : '';
  return {
    userIds,
    entityType: 'sales_order',
    entityId: order.id,
    kind: INSTALL_DATE_CONFIRMED_KIND,
    title: `TS ยืนยันวันติดตั้ง · ${order.orderNumber || order.id}`,
    body: `${where} · ${fmtDate(visit.scheduledDate)}${time} · ${zoneCount} โซน${moved} — โทรคอนเฟิร์มลูกค้าแล้วกดยืนยันที่ใบสั่งขาย`,
    dedupeKey: `install-date-confirmed:${visit.id}:${String(visit.tsConfirmedAt || '').slice(0, 19)}`,
    href: `/sales-planning/sales-orders/${order.id}#install`,
  };
}

/** ยิงจริง — fire-and-forget หลังสร้างนัดสำเร็จ · กระดิ่งพลาดต้องไม่ทำให้การยืนยันวันตอบ error */
export function notifyInstallDateConfirmed(supabase, args = {}) {
  const deliver = async () => {
    const notice = installDateConfirmedNotice(args);
    if (!notice) return;
    await notifyUsers(supabase, { ...notice, actorName: args.actor?.name || null });
  };
  const safe = () => deliver().catch((e) => console.error('[install-date-confirmed] แจ้งฝ่ายขายไม่สำเร็จ:', e?.message));
  try {
    after(safe);
  } catch {
    safe();
  }
}

/* ── กระดิ่ง "ลูกค้ายืนยันนัดติดตั้งแล้ว" ถึง TS (PR-4 · ม็อก A5) ──────────────────────────────────────────────
   ⭐ ผู้รับ = หัวหน้า TS + Planner (คนที่ดูแลตาราง) + หัวหน้างานของนัด (ช่างเห็นงานตั้งแต่ตอนนี้ถ้าขึ้นตารางแล้ว)
      · ไม่เด้งใส่คนกดเอง · ผู้ใช้ที่ปิดบัญชีไม่ได้รับ
   ⭐ บอกผลของการเลื่อนขึ้นตาราง — ขึ้นแล้ว หรือยังเป็นร่างเพราะด่านข้ออื่น (TS ต้องปล่อยเองที่หน้าจัดคิว)
   ⚠️ href ไปหน้าจัดคิว (จอของฝ่ายบริการ · ช่างเปิดหน้าใบสั่งขายไม่ได้) */
export function installCustomerConfirmedNotice({
  order, visit, site = null, users = [], actor = null, scheduled = false, blocker = '',
} = {}) {
  if (!order?.id || !visit?.id) return null;
  const actorId = actor?.id ? String(actor.id) : null;
  const heads = (users || [])
    .filter((u) => u && !u.disabled && INSTALL_REQUEST_RECIPIENT_ROLES.includes(normalizeRole(u.role)))
    .map((u) => String(u.id));
  const active = new Set((users || []).filter((u) => u && !u.disabled).map((u) => String(u.id)));
  const assignee = visit.assigneeId && active.has(String(visit.assigneeId)) ? [String(visit.assigneeId)] : [];
  const userIds = [...new Set([...heads, ...assignee])].filter((id) => id !== actorId);
  if (!userIds.length) return null;
  const where = [site?.code, site?.name].filter(Boolean).join(' ') || 'ไซต์';
  const time = visit.startTime && visit.endTime
    ? ` ${String(visit.startTime).slice(0, 5)}–${String(visit.endTime).slice(0, 5)}`
    : '';
  return {
    userIds,
    entityType: 'service_visit',
    entityId: visit.id,
    kind: INSTALL_CUSTOMER_CONFIRMED_KIND,
    title: `ลูกค้ายืนยันนัดติดตั้ง · ${visit.code || order.orderNumber || visit.id}`,
    body: `${where} · ${fmtDate(visit.scheduledDate)}${time} · ${order.orderNumber || order.id}`
      + (scheduled ? ' — ขึ้นตารางช่างแล้ว' : ` — ยังเป็นร่าง${blocker ? `: ${String(blocker).slice(0, 160)}` : ''} · ปล่อยขึ้นตารางที่หน้าจัดคิว`),
    dedupeKey: `install-customer-confirmed:${visit.id}:${String(visit.customerConfirmedAt || '').slice(0, 19)}`,
    href: '/service/schedule',
  };
}

/** ยิงจริง — fire-and-forget หลังบันทึกสำเร็จ · กระดิ่งพลาดต้องไม่ทำให้การคอนเฟิร์มตอบ error */
export function notifyInstallCustomerConfirmed(supabase, args = {}) {
  const deliver = async () => {
    const directory = await loadUserDirectory(supabase);
    const notice = installCustomerConfirmedNotice({ ...args, users: [...directory.values()] });
    if (!notice) return;
    await notifyUsers(supabase, { ...notice, actorName: args.actor?.name || null });
  };
  const safe = () => deliver().catch((e) => console.error('[install-customer-confirmed] แจ้ง TS ไม่สำเร็จ:', e?.message));
  try {
    after(safe);
  } catch {
    safe();
  }
}
