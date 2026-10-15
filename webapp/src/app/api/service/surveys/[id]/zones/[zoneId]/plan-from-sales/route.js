// ── ใช้ไฟล์ของฝ่ายขายเป็นภาพแบบของพื้นที่จากแบบ (ประเมินจากแบบ · งวด S2b §2.4 · มติเจ้าของ §10 ข้อ 6) ────────────────
//
// ⭐ ปุ่ม "ใช้รูปนี้เป็นภาพแบบของพื้นที่นี้" บนแผง "แบบจากฝ่ายขาย" — เส้นนี้ **คัดลอกไบต์เป็นไฟล์ใหม่** ในโฟลเดอร์ของพื้นที่แล้วออก
//   ใบรับการอัปให้คนกด · **ไม่เขียนแถวไฟล์แนบ**: เบราว์เซอร์แนบไฟล์ใหม่ผ่านเส้นไฟล์แนบเส้นเดียวของระบบต่อเอง
//   (`lib/service/surveyPlanReuse.js`) และถอยไฟล์ด้วย `DELETE /api/upload` ถ้าแนบไม่ผ่าน
// 🔑 **ด่านทั้งสิบเอ็ดข้อและข้อความอยู่ที่ `lib/service/surveyPlanCopy.js`** — เส้นนี้แค่อ่านใบกับแถวพื้นที่แล้วส่งต่อ
//   สองข้อแรก (สิทธิ์ · รูปของ body) ถูกถามที่นี่ก่อนด้วย เพื่อให้คนที่ไม่ใช่หัวหน้าและคำขอผิดรูปถูกปฏิเสธ **ก่อนแตะฐาน**
//   (ตัวกลางถามซ้ำเองทุกข้อ — ลำดับและข้อความมาจากที่เดียว)
// ⚠️ proxy เปิดการเขียนใต้ `/api/service` ให้ทุกคนที่ถือ `service:edit` / `service:work` — ด่านจริงคือ `canSendSurveyResult` ข้อแรก
// ⚠️ ไม่ถามสวิตช์ `SURVEY_DRAWING_METHOD`: สวิตช์ปิด = ไม่มีแถวจากแบบ ⇒ ด่าน "เฉพาะพื้นที่จากแบบ" ปฏิเสธเอง
// ⚠️ อ่านใบ / อ่านแถวพื้นที่ไม่ได้ = 500 ไม่ใช่ 404 (supabase-js ไม่ throw — อ่าน `{ error }` เอง)
// ⚠️ เส้นเบา: `lib/drive` (googleapis) ถูกดึงแบบ dynamic ในตัวกลางตอนถึงด่านที่ต้องถาม Drive เท่านั้น
import { withUser, ok, fail } from '@/lib/http';
import { canSendSurveyResult } from '@/lib/permissions';
import {
  SURVEY_PLAN_COPY_ERRORS, copySalesFileToZonePlan, surveyPlanCopySource,
} from '@/lib/service/surveyPlanCopy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { source: { kind: 'request', attachmentId } | { kind: 'thread', updateId, index } }
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id, zoneId } = await ctx.params;
  try {
    if (!canSendSurveyResult(user)) return fail(SURVEY_PLAN_COPY_ERRORS.role, 403);
    const raw = await req.json().catch(() => null);
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.source : null;
    if (!surveyPlanCopySource(source)) return fail(SURVEY_PLAN_COPY_ERRORS.shape, 400);

    const { data: request, error: reqError } = await supabase
      .from('dept_requests').select('*').eq('id', id).maybeSingle();
    if (reqError) return fail(reqError.message, 500);
    const { data: zone, error: zoneError } = request
      ? await supabase.from('service_survey_zones').select('*').eq('id', zoneId).eq('requestId', id).maybeSingle()
      : { data: null, error: null };
    if (zoneError) return fail(zoneError.message, 500);

    const result = await copySalesFileToZonePlan(supabase, { request: request || null, zone: zone || null, source, user });
    return result.status === 201 ? ok(result.body, 201) : fail(result.body.error, result.status);
  } catch (e) {
    return fail(e.message, 500);
  }
});
