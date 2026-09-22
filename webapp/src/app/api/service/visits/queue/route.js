// ── API รายการงาน — คอลัมน์ซ้ายของหน้าจัดตาราง (/service/schedule) ──────────────
// GET : ร่าง + นัดที่ยังเปิด (ไม่มีขอบวันที่) + นัดที่ปิดใน QUEUE_CLOSED_DAYS วันล่าสุด
//       พร้อมไซต์ · ภาระ · บริบทด่าน — รูปเดียวกับ GET ของตารางสัปดาห์ (`../route.js`)
//
// ⭐ **แยกจากตารางสัปดาห์โดยเจตนา** (มติเจ้าของ 2026-09-22: สัปดาห์คุมเฉพาะปฏิทิน)
//    ปฏิทินอ่านเป็นช่วงวัน · รายการงานต้องเห็นของค้างทุกวัน ⇒ ถ้าอ่านร่วมก้อนเดียวกัน
//    ร่างที่วันเลยมาแล้วจะหายจากจอทันทีที่คนเลื่อนสัปดาห์
// ⚠️ ทีมไม่กรองที่นี่ — จอกรองเอง (งานที่ยังไม่มีเจ้าหน้าที่ต้องโผล่ใต้ทุกทีม)
import { withUser, ok, fail } from '@/lib/http';
import { businessDate } from '@/lib/businessDate';
import { requireService } from '@/lib/service/sitesRepo';
import { loadQueueVisits } from '@/lib/service/visitsRepo';
import { visitBundle } from '@/lib/service/visitBundle';
import { isDraftVisit } from '@/lib/service/visitStatus';
import { QUEUE_CLOSED_DAYS, addDaysIso } from '@/lib/service/scheduleQueue';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase }) => {
  /* ด่านเดียวกับ GET ของตารางสัปดาห์ (อ่าน ไม่ใช่แก้) — คนที่เห็นปฏิทินต้องเห็นรายการงานด้วย
     ไม่งั้นครึ่งหน้าซ้ายขึ้น 403 ขณะที่ครึ่งขวาใช้ได้ */
  const access = requireService({ user });
  if (access.response) return access.response;
  try {
    // "วันนี้" ตามนาฬิกาไทยเสมอ — ตัวแบ่งแท็บ ค้าง/จัดแล้ว ของจอเทียบกับ asOf ตัวนี้
    const todayIso = businessDate();
    const closedSince = addDaysIso(todayIso, -QUEUE_CLOSED_DAYS);
    const visits = await loadQueueVisits(supabase, { closedSince });

    /* ⭐ บริบทด่านโหลดเฉพาะไซต์ของ **ร่าง** — ด่าน ①② ถามตอนปล่อยร่างขึ้นตารางเท่านั้น
       นัดที่เปิด/ปิดแล้วผ่านด่านมาแล้ว · รายการงานไม่มีขอบวันที่ ⇒ ไซต์ของนัดเปิดคือ
       เกือบทั้งทะเบียน โหลดด่านให้ทั้งหมดคือยิงโซน/รอบขาย/ใบสั่งขาย/งวด/สัญญาทั้งระบบฟรี ๆ */
    const gateSiteIds = visits.filter(isDraftVisit).map((visit) => visit.siteId);
    const { sites, workload, gateContext } = await visitBundle(supabase, visits, { gateSiteIds });

    return ok({ asOf: todayIso, closedSince, visits, sites, workload, gateContext });
  } catch (e) {
    return fail(e.message, 500);
  }
});
