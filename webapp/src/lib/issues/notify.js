// ── แจ้งเตือนของเรื่องแจ้งปัญหาระบบ (mig 0223) ───────────────────────────
//
// ทุกก้าวไปที่ **กล่องแจ้งเตือนรายคน** ผ่านเธรดอัปเดตของกลาง
//
// 🪦 เดิม "เรื่องใหม่เข้าคิว" ยิงเข้า Chat ห้องผู้ดูแลระบบ (มติ Q11 — ห้อง ไม่ใช่คน
// เพราะตอนเรื่องเข้ามายังไม่รู้ว่าแอดมินคนไหนจะรับ) · ท่อ Chat ถูกถอดออกทั้งระบบ
// 2026-08-12 ⇒ **ตอนนี้เรื่องใหม่ไม่มีสัญญาณอัตโนมัติ** แอดมินต้องเปิดคิว /support เอง
//
// ⚠️ **fire-and-forget เสมอ** — ทุกฟังก์ชันที่นี่กลืน error เอง (log ไว้) เพราะ
// ผู้เรียกอยู่หลังจุดที่ข้อมูลถูกบันทึกสำเร็จแล้ว · แจ้งเตือนพลาดต้องไม่ทำให้เรื่อง
// ที่ส่งสำเร็จแล้วตอบ error กลับไปหาคนที่กำลังแจ้งบั๊กอยู่ (กติกาเดียวกับ lib/notifications.js)
import { appendUpdate } from '@/lib/master/updates';

export const ISSUE_ENTITY_TYPE = 'system_issue';

export const issuePath = (id) => `/support/${id}`;

/**
 * บันทึกเหตุการณ์ลงเธรด — การแจ้งเตือนรายคนตามมาเอง
 *
 * ⚠️ ผ่าน `appendUpdate` เสมอ **ห้าม insert แถว `notifications` เอง** ด้วยสองเหตุผล:
 *   1. `appendUpdate` fan-out ให้อยู่แล้วในตัว (ต่อไว้ที่นั่นที่เดียวโดยเจตนา) —
 *      เรียก `notifyThreadUpdate` ซ้ำที่นี่ = ผู้ใช้ได้แจ้งเตือนสองใบต่อหนึ่งเหตุการณ์
 *   2. ตาราง `notifications` unique ที่ (userId, updateId) จึงต้องมีแถวอัปเดตจริง
 *      เป็นหลักยึด ไม่งั้นกดปุ่มรัว ๆ จะได้แจ้งเตือนซ้ำโดยไม่มีอะไรกัน
 *
 * ⚠️ **เรียกหลังอัปเดตแถวเสร็จแล้วเสมอ** — `appendUpdate` โหลดแถวแม่ใหม่เองเพื่อหา
 * ผู้รับ ถ้าเรียกก่อน update ผู้รับผิดชอบคนใหม่จะยังไม่อยู่ในแถว แล้วคนที่เพิ่งถูก
 * มอบหมายจะไม่ได้รับแจ้งเตือนของก้าวที่มอบหมายเขาเอง
 */
export async function recordIssueEvent(supabase, { row, kind, body = null, user = null }) {
  try {
    const { row: update, error } = await appendUpdate(supabase, {
      entityType: ISSUE_ENTITY_TYPE,
      entityId: row.id,
      kind,
      body,
      user,
    });
    if (error) return { error };
    return { update };
  } catch (e) {
    console.error('[issues] event/notify failed', row?.id, kind, e?.message || e);
    return { error: e.message };
  }
}
