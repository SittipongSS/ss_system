// ── API แจ้งเตือนรายคน (mig 0185) ────────────────────────────────────────
// GET   /api/notifications                 กล่องของ *ตัวเอง* + ตัวนับยังไม่อ่าน
//         ?scope=unread                    เฉพาะที่ยังไม่อ่าน (ค่าเริ่มต้น = ทั้งหมด)
//         ?limit=&cursor=                  หน้า "ดูทั้งหมด" — กุญแจหน้าถัดไป ไม่ใช่ offset
// PATCH /api/notifications                 { action: 'read_all' }
//                                          { action: 'read_thread', entityType, entityId }
//                                          { action: 'read_one', id }
//
// ⚠️ ไม่มีพารามิเตอร์ `userId` โดยเจตนา — ผู้รับคือคนที่ล็อกอินอยู่เท่านั้น
// ส่ง id คนอื่นมาอ่านกล่องเขาไม่ได้ (ไม่ใช่แค่ "ไม่มีปุ่ม" แต่ไม่มีทางเลย)
import { withUser, ok, fail, badRequest, unauthorized } from '@/lib/http';
import {
  listNotificationPage, markAllRead, markOneRead, markThreadRead, totalCount, unreadCount,
} from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user?.id) return unauthorized();
  const params = new URL(req.url).searchParams;
  const unreadOnly = params.get('scope') === 'unread';
  const limit = Number(params.get('limit')) || undefined;
  const cursor = params.get('cursor') || null;
  try {
    // `total` เป็นของหน้า "ดูทั้งหมด" — กระดิ่งไม่ได้ใช้ แต่นับสองครั้งยังถูกกว่า
    // แยก endpoint แล้วต้องมี round trip เพิ่มทุกครั้งที่เปิดหน้า
    const [page, unread, total] = await Promise.all([
      listNotificationPage(supabase, user.id, { unreadOnly, limit, cursor }),
      unreadCount(supabase, user.id),
      totalCount(supabase, user.id),
    ]);
    return ok({ ...page, unread, total });
  } catch (e) {
    // ยังไม่รัน migration = กระดิ่งต้องขึ้น 0 เฉย ๆ ไม่ใช่ทำ header พังทั้งระบบ
    // (component นี้อยู่บนทุกหน้า — พังที่นี่ = พังทุกหน้า)
    console.error('[notifications] list failed', e.message);
    return ok({ items: [], unread: 0, total: 0, hasMore: false, nextCursor: null, unavailable: true });
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
    // ทีละแถวจากหน้า "ดูทั้งหมด" — ของที่ปลายทางไม่มีเธรดให้เปิด (ดู markOneRead)
    if (action === 'read_one') {
      if (!body.id) return badRequest('ต้องระบุ id');
      await markOneRead(supabase, user.id, String(body.id));
      return ok({ ok: true });
    }
    return badRequest('คำสั่งไม่ถูกต้อง');
  } catch (e) {
    return fail(e.message, 500);
  }
});
