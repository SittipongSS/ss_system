import { withUser, ok, fail, unauthorized } from '@/lib/http';
import { businessDate } from '@/lib/businessDate';
import { canEditService } from '@/lib/permissions';
import { requireService } from '@/lib/service/sitesRepo';
import { loadInstallQueue } from '@/lib/service/installQueueRepo';
import { installQueueRows } from '@/lib/service/installQueueView';
// สวิตช์ขั้นเข้าติดตั้ง (mig 0425) — ตัวอ่านเดียว · ฝั่ง server เท่านั้น
import { installStepEnabled } from '@/lib/service/installStepFlag';

export const dynamic = 'force-dynamic';

/* ── คิว "รอติดตั้ง" ของ TS (ขั้นเข้าติดตั้ง PR-3b · ม็อก B1 · mig 0425) ────────────────────────────────────
   GET → `{ enabled, canConfirm, todayIso, rows }` — แถวราย (ใบสั่งขาย × ไซต์) จาก `installQueueRows`
   ⭐ สวิตช์ปิด = `{ enabled: false, rows: [] }` (แท็บไม่ขึ้น) — ไม่อ่านฐานเลย
   🔒 ไม่มีเงินในแถว (ตัวโหลดไม่ดึงยอด) · ⚠️ `canConfirm` = ปุ่มยืนยันวัน (ด่านเดียวกับ API ยืนยันวัน) */
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  const access = requireService({ user });
  if (access.response) return access.response;
  if (!installStepEnabled()) return ok({ enabled: false, canConfirm: false, todayIso: businessDate(), rows: [] });
  try {
    const todayIso = businessDate();
    const data = await loadInstallQueue(supabase, { todayIso });
    return ok({ enabled: true, canConfirm: canEditService(user), todayIso, rows: installQueueRows(data) });
  } catch (error) {
    console.error('[install-queue] GET unexpected error:', error);
    return fail(`โหลดคิวรอติดตั้งไม่สำเร็จ: ${error?.message || error}`, 500);
  }
});
