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
export const INSTALL_QUEUE_HREF = '/service/intake?tab=install';
export const INSTALL_REQUEST_RECIPIENT_ROLES = Object.freeze([...SERVICE_HEAD_ROLES, 'ts_planner']);

/**
 * ใครได้รับ + ข้อความ — ฟังก์ชันบริสุทธิ์
 * @param request แถวคำขอหลังบันทึก (id · requestedAt · requestedDate · ช่วงเวลา)
 * @param order   ใบสั่งขาย (id · orderNumber · customerName)
 * @param site    `{ code, name }` · zoneCount = จำนวนโซนที่ขอ
 * @param changed true = แก้คำขอเดิม (ไม่ใช่ขอครั้งแรก)
 * @returns payload ของ `notifyUsers` หรือ null เมื่อไม่มีใครต้องรู้
 */
export function installRequestedNotice({ request, order, site = null, zoneCount = 0, users = [], actor = null, changed = false } = {}) {
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
    title: `${changed ? 'แก้คำขอคิวติดตั้ง' : 'ขอคิวติดตั้ง'} · ${order.orderNumber || order.id}`,
    body: `${actor?.name || 'ฝ่ายขาย'} ขอติดตั้ง ${where} · ${zoneCount} โซน · ต้องการ ${fmtDate(request.requestedDate)}${time}`
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
