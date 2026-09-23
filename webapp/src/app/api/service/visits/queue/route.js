// ── API รายการงาน — คอลัมน์ซ้ายของหน้าจัดตาราง (/service/schedule) ──────────────
// GET : ร่าง + นัดที่ยังเปิด (ไม่มีขอบวันที่) + นัดที่ปิดใน QUEUE_CLOSED_DAYS วันล่าสุด
//       พร้อมไซต์ · ภาระ · บริบทด่าน — รูปเดียวกับ GET ของตารางสัปดาห์ (`../route.js`)
//       + คำร้องประเมินพื้นที่ที่รอลงคิว (`surveyRequests` · มติเจ้าของ 23/09)
//       `?requests=0` = ไม่เอาคำร้อง · `?view=load` = ภาระอย่างเดียว (ตัวเลือกเจ้าหน้าที่บนหน้าใบคำร้อง
//       — ไม่มีคำร้อง ไม่มีบริบทด่าน ไม่มีร่าง · `queueRouteMode`)
//
// ⭐ **แยกจากตารางสัปดาห์โดยเจตนา** (มติเจ้าของ 2026-09-22: สัปดาห์คุมเฉพาะปฏิทิน)
//    ปฏิทินอ่านเป็นช่วงวัน · รายการงานต้องเห็นของค้างทุกวัน ⇒ ถ้าอ่านร่วมก้อนเดียวกัน
//    ร่างที่วันเลยมาแล้วจะหายจากจอทันทีที่คนเลื่อนสัปดาห์
// ⚠️ ทีมไม่กรองที่นี่ — จอกรองเอง (งานที่ยังไม่มีเจ้าหน้าที่ต้องโผล่ใต้ทุกทีม)
import { withUser, ok, fail } from '@/lib/http';
import { businessDate } from '@/lib/businessDate';
import { canAnswerServiceRequests } from '@/lib/permissions';
import { requireService } from '@/lib/service/sitesRepo';
import { loadQueueVisits } from '@/lib/service/visitsRepo';
import { visitBundle } from '@/lib/service/visitBundle';
import { loadSurveyQueueRequests } from '@/lib/service/surveyQueueRepo';
import { isDraftVisit } from '@/lib/service/visitStatus';
import { QUEUE_CLOSED_DAYS, addDaysIso, queueRouteMode } from '@/lib/service/scheduleQueue';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  /* ด่านเดียวกับ GET ของตารางสัปดาห์ (อ่าน ไม่ใช่แก้) — คนที่เห็นปฏิทินต้องเห็นรายการงานด้วย
     ไม่งั้นครึ่งหน้าซ้ายขึ้น 403 ขณะที่ครึ่งขวาใช้ได้ */
  const access = requireService({ user });
  if (access.response) return access.response;
  try {
    // "วันนี้" ตามนาฬิกาไทยเสมอ — ตัวแบ่งแท็บ ค้าง/จัดแล้ว ของจอเทียบกับ asOf ตัวนี้
    const todayIso = businessDate();
    const closedSince = addDaysIso(todayIso, -QUEUE_CLOSED_DAYS);
    const url = new URL(req.url);
    const mode = queueRouteMode(url.searchParams, { canAnswer: canAnswerServiceRequests(user) });
    const loaded = await loadQueueVisits(supabase, { closedSince });
    /* โหมดภาระไม่ส่งร่าง — ร่างไม่นับภาระ (`staffLoadOn`) และเป็นก้อนใหญ่สุดของรายการงาน (รอบบริการ ~90 วัน) */
    const visits = mode.drafts ? loaded : loaded.filter((visit) => !isDraftVisit(visit));

    /* ⭐ คำร้องรอลงคิว (มติเจ้าของ 23/09) — เฉพาะคนที่ **ตอบคำร้องของ TS ได้** (รับเรื่อง/ลงคิว)
       · UI visibility rule: ไม่มีสิทธิ์ = ไม่ส่ง (null) ไม่ใช่ส่งการ์ดที่กดแล้วโดน 403
         ⇒ เจ้าหน้าที่ Operation เห็นรายการงานได้แต่ไม่ได้คำร้อง
       🔴 **พังแยกจากนัด** — query ของคำร้องล้มต้องไม่ทำให้รายการงานทั้งแผงว่าง
          (ว่างทั้งแผง = "ไม่มีงาน" ซึ่งโกหก) ⇒ try ของตัวเอง + บอก error แยกช่อง
          ⚠️ พังแล้วส่ง null ไม่ใช่ [] — [] อ่านว่า "ไม่มีใบรอลงคิว" ซึ่งไม่รู้จริง */
    const wantRequests = mode.requests;
    let surveyRequests = null;
    let surveyRequestsError = null;
    if (wantRequests) {
      try {
        surveyRequests = await loadSurveyQueueRequests(supabase, { visits });
      } catch (e) {
        surveyRequests = null;
        surveyRequestsError = `โหลดคำร้องรอลงคิวไม่สำเร็จ — ${e?.message || 'ไม่ทราบสาเหตุ'}`;
      }
    }

    /* ⭐ บริบทด่านโหลดเฉพาะไซต์ของ **ร่าง** — ด่าน ①② ถามตอนปล่อยร่างขึ้นตารางเท่านั้น
       นัดที่เปิด/ปิดแล้วผ่านด่านมาแล้ว · รายการงานไม่มีขอบวันที่ ⇒ ไซต์ของนัดเปิดคือ
       เกือบทั้งทะเบียน โหลดด่านให้ทั้งหมดคือยิงโซน/รอบขาย/ใบสั่งขาย/งวด/สัญญาทั้งระบบฟรี ๆ
       ⭐ ไซต์ของคำร้องมาด้วย (ชื่อ · เขตวิ่งงาน · ลูกค้าบนการ์ด) แต่ไม่ได้บริบทด่าน */
    const gateSiteIds = mode.gate ? visits.filter(isDraftVisit).map((visit) => visit.siteId) : [];
    const extraSiteIds = (surveyRequests || []).map((request) => request.siteId);
    const { sites, workload, gateContext } = await visitBundle(supabase, visits, { gateSiteIds, extraSiteIds });

    return ok({
      asOf: todayIso, closedSince, visits, sites, workload, gateContext,
      surveyRequests, surveyRequestsError,
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});
