// ── API แจ้งเตือนรายคน (mig 0185) ────────────────────────────────────────
// GET   /api/notifications                 กล่องของ *ตัวเอง* + ตัวนับยังไม่อ่าน
// PATCH /api/notifications                 { action: 'read_all' }
//                                          { action: 'read_thread', entityType, entityId }
//
// ⚠️ ไม่มีพารามิเตอร์ `userId` โดยเจตนา — ผู้รับคือคนที่ล็อกอินอยู่เท่านั้น
// ส่ง id คนอื่นมาอ่านกล่องเขาไม่ได้ (ไม่ใช่แค่ "ไม่มีปุ่ม" แต่ไม่มีทางเลย)
import { withUser, ok, fail, badRequest, unauthorized } from '@/lib/http';
import {
  listNotifications, markAllRead, markThreadRead, unreadCount,
} from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase }) => {
  if (!user?.id) return unauthorized();
  try {
    const [items, unread] = await Promise.all([
      listNotifications(supabase, user.id),
      unreadCount(supabase, user.id),
    ]);
    return ok({ items, unread });
  } catch (e) {
    // ยังไม่รัน migration = กระดิ่งต้องขึ้น 0 เฉย ๆ ไม่ใช่ทำ header พังทั้งระบบ
    // (component นี้อยู่บนทุกหน้า — พังที่นี่ = พังทุกหน้า)
    console.error('[notifications] list failed', e.message);
    return ok({ items: [], unread: 0, unavailable: true });
  }
});

export const PATCH = withUser(async ({ user, supabase, req }) => {
  if (!user?.id) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  try {
    if (action === 'read_all') {
      await markAllRead(supabase, user.id);
      return ok({ ok: true });
    }
    // (มติ 15) เปิดเธรด = อ่านทั้ง entity ก้อนเดียว ไม่มี watermark ต่อข้อความ
    if (action === 'read_thread') {
      if (!body.entityType || !body.entityId) return badRequest('ต้องระบุ entityType/entityId');
      await markThreadRead(supabase, user.id, String(body.entityType), String(body.entityId));
      return ok({ ok: true });
    }
    return badRequest('คำสั่งไม่ถูกต้อง');
  } catch (e) {
    return fail(e.message, 500);
  }
});
