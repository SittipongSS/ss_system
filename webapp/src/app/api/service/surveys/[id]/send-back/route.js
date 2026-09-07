// ── หัวหน้าแจ้งช่างให้กลับไปเก็บงานหน้างาน (แผน §5.4 บรรทัด 604) ──────────
//
// 🐞 **ทางตันที่มีมาตั้งแต่เฟส 3** — ด่านสามข้อบนของหกข้อเป็นของช่าง (ขนาด · ภาพกว้าง ·
//   จุดที่ติดตั้งได้) ซึ่งหัวหน้าแก้เองไม่ได้ ⇒ เขาเห็นแค่ปุ่มส่งผลที่กดไม่ได้ และไม่มีทาง
//   บอกช่างในระบบเลย · คอมเมนต์ใน `survey.js` อ้างถึงปุ่มนี้มาตั้งแต่วันแรกในฐานะเหตุผล
//   ที่จอสรุปต้องกางเช็คลิสต์ทั้งหกข้อ — แต่ปุ่มไม่เคยถูกสร้าง
//
// 🔴 **กระดิ่งของใบคำร้องไปไม่ถึงช่าง และยัดเข้าไปตรง ๆ ก็ไม่ได้**
//   ทะเบียนผู้รับของ `dept_request` = ผู้ขอ (SA) + คนที่เคยโพสต์ + คนที่ถูก @ เท่านั้น
//   และ role `ts` **เปิดหน้าคำร้องไม่ได้** (403) ⇒ ต่อให้ยัดชื่อเข้าไป เขากดกระดิ่งแล้วเจอ
//   หน้าปฏิเสธ ⇒ ต้องยิงตรงด้วย `notifyUsers` ไปที่ **คนที่ถูกมอบหมายบนนัด** และ
//   **ชี้ href ไปที่จอที่เขาเปิดได้** (`/service/surveys/[id]`) ไม่ใช่หน้าคำร้อง
//
// ⚠️ **ไม่แตะสถานะใบและไม่แตะนัด** — ดูเหตุผลเต็มที่ `surveySendBackError`
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound } from '@/lib/http';
import { canSendSurveyResult } from '@/lib/permissions';
import { appendUpdate } from '@/lib/master/updates';
import { notifyUsers } from '@/lib/notifications';
import { listAttachments } from '@/lib/master/attachments';
import { loadSurveyZones } from '@/lib/service/surveyRepo';
import { findSurveyVisit } from '@/lib/service/surveyVisit';
import { surveyCrewGaps, surveySendBackBody, surveySendBackError } from '@/lib/service/survey';

export const dynamic = 'force-dynamic';

// POST { note }
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const body = await req.json().catch(() => ({}));
    const note = String(body.note ?? '').trim();

    const { data: request, error: reqError } = await supabase
      .from('dept_requests').select('*').eq('id', id).maybeSingle();
    if (reqError) return fail(reqError.message, 500);
    if (!request) return notFound('ไม่พบใบคำร้อง');

    /* ⚠️ **ต้องนับของขาดจากฐาน ไม่ใช่เชื่อจอ** — จอที่โหลดค้างไว้ตั้งแต่ก่อนช่างบันทึก
       จะบอกว่ายังขาด ทั้งที่ครบไปแล้ว ⇒ ช่างได้กระดิ่งให้กลับไปทำของที่ทำเสร็จแล้ว */
    const zones = await loadSurveyZones(supabase, id);
    const files = await Promise.all(
      zones.map((z) => listAttachments('service_survey_zone', z.id, supabase)),
    );
    const filesByZone = Object.fromEntries(zones.map((z, i) => [z.id, files[i] || []]));
    const gaps = surveyCrewGaps(zones, filesByZone);

    /* คนที่จะได้รับแจ้ง = คนที่ถูกมอบหมายบนนัดของใบนี้ (คนไป + คนช่วย)
       ⚠️ ใช้ `findSurveyVisit` แบบไม่กรองสถานะ — นัดที่ปิดว่า `done` ไปแล้วยังบอกได้ว่า
         "ใครไป" และคนคนนั้นยังเขียนผลวัดของใบนี้ได้อยู่ (`visitWriteAccess` ดูการมอบหมาย
         ไม่ได้ดูสถานะนัด) ⇒ เขาคือคนที่กลับไปเก็บงานได้จริงโดยไม่ต้องลงคิวใหม่ */
    const visit = await findSurveyVisit(supabase, id);
    const crewIds = [...new Set([
      visit?.assigneeId,
      ...(Array.isArray(visit?.assistantIds) ? visit.assistantIds : []),
    ].filter(Boolean).map(String))];

    /* 🔑 ด่านตัวเดียวกับที่ปุ่มบนจอใช้ — สิทธิ์ · ล็อก · มีเรื่องให้แจ้งไหม · แจ้งถึงใครไหม
       · เหตุผล อยู่ในนั้นครบ */
    const gate = surveySendBackError(request, {
      canSend: canSendSurveyResult(user), note, gaps, crewIds,
    });
    if (gate) {
      if (/ได้เฉพาะหัวหน้า/.test(gate)) return forbidden(gate);
      if (/ต้องบอกว่าให้กลับไปทำอะไร/.test(gate)) return badRequest(gate);
      return conflict(gate);
    }

    const text = surveySendBackBody(gaps, note);

    /* บรรทัดในเธรดของใบ — **ผู้ขอเห็นด้วย และควรเห็น** ผลที่รอมาช้าลงเพราะอะไร
       ⚠️ แต่บรรทัดนี้ **ไม่ใช่ตัวที่แจ้งช่าง** (ดูหัวไฟล์) ⇒ ต้องยิงกระดิ่งแยกข้างล่าง */
    await appendUpdate(supabase, {
      entityType: 'dept_request', entityId: id, kind: 'send_back',
      body: text,
      meta: { gates: gaps.map((g) => g.key), crew: crewIds.length },
      user,
    });

    /* 🔴 กระดิ่งของช่าง — `href` ต้องเป็นจอที่เขาเปิดได้ ไม่ใช่หน้าคำร้องที่เขาโดน 403 */
    const notified = await notifyUsers(supabase, {
      userIds: crewIds,
      entityType: 'dept_request',
      entityId: id,
      kind: 'survey_send_back',
      title: `กลับไปเก็บงานที่ ${request.title || request.docNo || 'ใบประเมิน'}`,
      body: text,
      actorName: user?.name || null,
      href: `/service/surveys/${id}`,
    });

    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id,
      before: request, after: request,
      summary: `แจ้งช่างให้กลับไปเก็บงาน ${request.docNo || id} — ${note}`
        + ` · ติด ${gaps.length} ข้อ · แจ้ง ${notified.sent || 0} คน`,
      request: req,
    });
    return ok({ gaps, notified: notified.sent || 0 });
  } catch (e) {
    return fail(e.message, 500);
  }
});
