// ── แจ้งเตือนของเรื่องแจ้งปัญหาระบบ (mig 0223) ───────────────────────────
//
// ⭐ **สองช่อง คนละหน้าที่** (มติ Q11)
//   เรื่องใหม่เข้าคิว  → Chat webhook ห้องผู้ดูแลระบบ (ห้อง ไม่ใช่คน — ยังไม่รู้ว่าใครรับ)
//   หลังจากนั้นทุกก้าว → notification รายคน ผ่านเธรดอัปเดตของกลาง
//
// ⚠️ **fire-and-forget เสมอ** — ทุกฟังก์ชันที่นี่กลืน error เอง (log ไว้) เพราะ
// ผู้เรียกอยู่หลังจุดที่ข้อมูลถูกบันทึกสำเร็จแล้ว · แจ้งเตือนพลาดต้องไม่ทำให้เรื่อง
// ที่ส่งสำเร็จแล้วตอบ error กลับไปหาคนที่กำลังแจ้งบั๊กอยู่ (กติกาเดียวกับ lib/chat.js
// และ lib/notifications.js)
import { chatCard, sendChat } from '@/lib/chat';
import { appendUpdate } from '@/lib/master/updates';
import { issueImpactLabel, issueKindLabel } from '@/lib/issues/statuses';

export const ISSUE_ENTITY_TYPE = 'system_issue';

export const issuePath = (id) => `/support/${id}`;

// ── เรื่องใหม่เข้าคิว → ห้องผู้ดูแลระบบ ─────────────────────────────────
export function notifyNewIssue(row) {
  try {
    sendChat('admin', chatCard({
      title: `🐞 ${row.title || 'เรื่องแจ้งปัญหาใหม่'}`,
      subtitle: `${row.code || row.id} · ${issueKindLabel(row.kind)}`,
      rows: [
        { label: 'ผลกระทบ', value: issueImpactLabel(row.impact) },
        { label: 'ผู้แจ้ง', value: row.reportedByName },
        { label: 'ฝ่าย/ทีม', value: [row.reporterDepartment, row.reporterTeam].filter(Boolean).join(' · ') },
        { label: 'หน้าที่พบ', value: row.pageUrl },
      ],
      linkPath: issuePath(row.id),
      linkLabel: 'เปิดเรื่องนี้',
    }));
  } catch (e) {
    console.error('[issues] chat webhook failed', row?.id, e?.message || e);
  }
}

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
