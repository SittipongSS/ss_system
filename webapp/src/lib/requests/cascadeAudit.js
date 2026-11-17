// ตัวเขียน audit ของคำร้องที่ถูกลบพ่วงดีล — ส่งเข้า `cleanupDealOrphans` เป็น `auditRequests`
// (เส้นลบโครงการ `deleteProjectDeep` ถอดแล้วในงวด P3b-1) · แยกไฟล์จาก cascadeDelete.js เพราะ
// `recordAudit` ดึง client ฝั่งเซิร์ฟเวอร์ ส่วนตัวนั้นถูก import จากเทสต์ของ lib ลบ
import { recordAudit } from '@/lib/audit';
import { requestCascadeSummary } from '@/lib/requests/cascadeDelete';

/** `cause` เช่น "การลบดีล DL-260900432" — ขึ้นท้าย summary ของทุกใบ */
export function requestCascadeAuditor({ user, request, cause }) {
  return async (rows) => {
    for (const row of rows || []) {
      await recordAudit({
        user, action: 'delete', entityType: 'dept_request', entityId: row.id,
        before: row, summary: requestCascadeSummary(row, cause), request,
      });
    }
  };
}
