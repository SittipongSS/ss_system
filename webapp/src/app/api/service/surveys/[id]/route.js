// ── ข้อมูลของใบประเมินสำหรับจอฝ่าย TS (เฟส 3) ────────────────────────────
//
// ⭐ **ทำไมไม่ใช้ `/api/sa/requests/[id]`** — เส้นนั้นตอบ "ใบคำร้อง" ในภาษาของระบบคำร้อง
//   (รายการ · เธรด · สถานะ) · จอของ TS ต้องการ **ผลวัดรายพื้นที่ + ไฟล์ของแต่ละพื้นที่**
//   ซึ่งเป็นตารางลูกที่เส้นนั้นไม่รู้จัก ⇒ ยิงเส้นนั้นแล้วต้องยิงตามอีกสองรอบต่อพื้นที่
//
// ⚠️ ด่านอ่านเป็น **ด่านของคำร้อง** ไม่ใช่ด่านโมดูลบริการล้วน — ใบที่ไม่ได้ส่งถึงฝ่ายเรา
//   ต้องอ่านไม่ได้ ถึงจะถือ `service:view` ก็ตาม (id หลุดทางลิงก์แจ้งเตือนได้)
import { withUser, ok, fail, forbidden, notFound } from '@/lib/http';
import { canDoFieldWork, canEditService, canSendSurveyResult } from '@/lib/permissions';
import { canOpenSurveySheet, surveyReadError } from '@/lib/service/surveyAccess';
import { listAttachments } from '@/lib/master/attachments';
import { loadSurveyZones } from '@/lib/service/surveyRepo';
import { findSurveyVisit } from '@/lib/service/surveyVisit';
import { visitWriteAccess } from '@/lib/service/visitAccess';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    // ตัดคนนอกโมดูลก่อนแตะฐาน — ไม่งั้นการยิง id ไปเรื่อย ๆ บอกได้ว่าใบไหนมีอยู่จริง
    if (!canOpenSurveySheet(user)) return forbidden();

    const { data: request, error: reqError } = await supabase
      .from('dept_requests').select('*').eq('id', id).maybeSingle();
    if (reqError) return fail(reqError.message, 500);
    if (!request) return notFound('ไม่พบใบคำร้อง');

    /* 🔑 **ด่านอ่านอยู่ที่เดียว** (`surveyReadError`) — ยอมทั้งคนคุมคิวและช่างหน้างาน
       🐞 เดิมเป็น `canViewRequests` ล้วน ซึ่งปิดประตูใส่ role `ts` ที่จอนี้ทำมาให้เขาใช้ */
    const readError = surveyReadError(user, request);
    if (readError) return forbidden(readError);

    const zones = await loadSurveyZones(supabase, id);

    /* ไฟล์ของแต่ละพื้นที่ — ด่านนับรูปต้องการของจริง ไม่ใช่ตัวเลขที่จอเดา
       ⚠️ ยิงรายพื้นที่ **ขนานกัน** — ใบหนึ่งมีสิบพื้นที่ ยิงเรียงกันคือรอสิบรอบ
       ⚠️ ใบที่ยังไม่มีพื้นที่เลย = `[]` ไม่ใช่ error (ร่างที่เพิ่งเปิด) */
    const files = await Promise.all(
      zones.map((z) => listAttachments('service_survey_zone', z.id, supabase)),
    );
    const filesByZone = Object.fromEntries(zones.map((z, i) => [z.id, files[i] || []]));

    /* นัดของใบ — เป็นที่เดียวที่บอกว่า "ใครไป" ⇒ ด่านเขียนของช่างอ่านจากตัวนี้
       ⚠️ ส่ง `canWrite` มาจาก server ไม่ให้จอคำนวณเอง (จอไม่รู้ user id ของตัวเอง) */
    const visit = await findSurveyVisit(supabase, id);
    const canEditAll = canEditService(user);
    const access = (canEditAll || canDoFieldWork(user))
      ? visitWriteAccess({ user, visit, canEditAll })
      : { ok: false, error: null };

    return ok({
      request,
      zones,
      filesByZone,
      visit,
      canWrite: access.ok === true,
      /* ⭐ **คนละสิทธิ์กับ `canWrite`** — เคาะแพ็คเกจ/จุด และกดส่งผล เป็นการตัดสินใจ
         เชิงพาณิชย์ของหัวหน้าฝ่าย ไม่ใช่การรายงานหน้างานของช่าง (แผน §5.4) */
      canDecide: canSendSurveyResult(user),
      // เหตุผลที่เขียนไม่ได้ — จอต้องบอกเหตุ ไม่ใช่ซ่อนปุ่มเงียบ ๆ
      writeBlockedReason: access.ok ? null : (access.error || 'ไม่มีสิทธิ์บันทึกผลของใบนี้'),
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});
