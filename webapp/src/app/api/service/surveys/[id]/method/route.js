// ── สลับวิธีประเมินรายพื้นที่: ลงหน้างาน ↔ ประเมินจากแบบ (แผน survey-desk-assessment §3 · งวด S2a §4) ────────
//
// ⭐ **ทางเดียวที่พื้นที่เปลี่ยนวิธีได้** — ปุ่ม "เปลี่ยนวิธีประเมิน" ของหัวหน้าฝ่ายบริการ (จอเป็นของงวด S2b)
//   คำขอเดียวทำได้สามอย่าง: สลับพื้นที่ (`changes`) · สลับทั้งใบ (ทุกพื้นที่ใน `changes`) ·
//   ยกเลิกนัดที่ค้างบนใบซึ่งไม่ต้องมีนัดแล้ว (`changes: []`)
//
// 🔑 **แผนเดียว** — `surveyMethodSwitchPlan` ตัวเดียวกับที่โมดัลใช้พิมพ์กล่องผลลัพธ์ ถูกสร้างที่นี่ **ครั้งเดียว** จากแถวจริง
//   แล้วส่งให้ `runSurveyMethodPlan` ซึ่งอ่านแต่ `plan.writes` ⇒ กล่องบอกอย่างไร ฐานได้อย่างนั้น
//   เส้นนี้ไม่คิดเองว่าจะยกเลิกนัดไหม วันบนใบเป็นอะไร หรือเธรดพูดว่าอะไร
//
// 🔴 **ลำดับด่านคือสัญญา** (§4.2) — ก่อนขั้นเขียนแรกของตัวเขียน ไม่มีอะไรถูกเขียนทั้งสิ้น:
//   ① หัวหน้าฝ่ายบริการ (403) → ② สวิตช์ `SURVEY_DRAWING_METHOD` (409) → ③ ใบประเมินมีจริง (404) → ④ ใบของฝ่ายเรา (403)
//   → ⑤ สภาพใบ (409) → ⑥ รูปของ body (400) → ⑦ อ่านแถว · เลือกนัด · สร้างแผน · ล้าสมัยไหม (409) → ⑧ ไม่มีอะไรให้ทำ (409)
//   → ⑨ ช่องกรอก (400) → ⑩ นัดที่โมดัลบอกตรงกับแผนไหม (409) → ⑪ แถวที่ "เขียนไปแล้ว" เป็นของการกดนี้จริงไหม (409)
//   · การอ่านที่พังทุกตัว = 500 ไม่ใช่ปล่อยผ่าน
//   ⚠️ ถามสิทธิ์ก่อนถามสวิตช์ และถามสวิตช์ **ก่อนแตะฐาน** — สวิตช์ปิด = เส้นนี้ไม่อ่านอะไรเลย
//
// 🔴 **นัดถูกเลือกก่อนสร้างแผน** (ด่าน ⑦) — แผนต้องรู้ตั้งแต่ต้นว่านัดที่ body เอ่ยถึงถูกยกเลิกโดยการกดครั้งนี้ไปแล้วหรือยัง
//   ไม่งั้นการกดซ้ำของ "ยกเลิกนัดอย่างเดียว" ที่พังหลังยกเลิกนัดสำเร็จ จะถูกตอบว่า "ไม่มีอะไรให้ทำ" ตลอดไป
//   ⚠️ **"ถูกยกเลิกโดยการกดนี้" ต้องพิสูจน์ ไม่เชื่อ body** — ดูจากบรรทัดยกเลิกบนเธรดของนัดที่พก `meta.methodKey`
//      (`surveyVisitCancelledByKey`) · เลขนัดเก่าที่ถูกยกเลิกด้วยเหตุอื่น = 409 ไม่ได้บรรทัดเธรดและกระดิ่งว่าการสลับนี้ยกเลิกมัน
//
// 🔑 **กดซ้ำ ≠ กดใหม่** — `actionId` คือเลขของการกดหนึ่งครั้ง (จอสร้างใหม่ทุกครั้งที่เปิดโมดัล) · กุญแจ = `userId|actionId`
//   body เดิม + เลขเดิม = กดซ้ำ: เธรดหนึ่งบรรทัด กระดิ่งชุดเดียว คำตอบ `already: true` · เลขใหม่ = เหตุการณ์ใหม่แม้เนื้อหาเหมือนกันทุกตัว
//
// ⚠️ เส้นนี้ **ไม่เขียน** ผลวัด (ขนาด · แพ็คเกจ · โน้ต) ตราผู้วัดของแถว หรือไฟล์ใด ๆ — รูปเก่าของพื้นที่ที่กลายเป็นจากแบบยังอยู่ครบ
// ⚠️ เส้นเบา: ห้ามลาก sharp / chromium / ตัวเรนเดอร์เอกสารเข้ามา (ด่าน `check-doc-tracing.mjs` ตรวจผล build)
import { withUser, ok, fail, badRequest, forbidden, notFound, conflict } from '@/lib/http';
import { canSendSurveyResult } from '@/lib/permissions';
import { listAttachments } from '@/lib/master/attachments';
import { canAnswerRequest } from '@/lib/requests/access';
import { surveyDrawingMethodEnabled } from '@/lib/service/surveyDrawingFlag';
import {
  runSurveyMethodPlan, surveyMethodAppliedByOther, surveyVisitCancelledByKey,
} from '@/lib/service/surveyMethodWrites';
import {
  SURVEY_METHOD_BODY_ERROR, SURVEY_METHOD_ERRORS, surveyMethodActionId, surveyMethodChanges, surveyMethodPlanKey,
  surveyMethodRequestError, surveyMethodSwitchPlan,
} from '@/lib/service/surveyMethodSwitch';
import { loadSurveySendBackState, loadSurveyZones } from '@/lib/service/surveyRepo';
import { findSurveyVisit } from '@/lib/service/surveyVisit';

export const dynamic = 'force-dynamic';

/* คำตอบที่ไม่สำเร็จซึ่งจอต้องแยกด้วยเครื่อง ไม่ใช่ด้วยการเทียบประโยคไทย — `code`:
   `partial` = ฐานพังกลางทาง กดซ้ำด้วย `actionId` เดิมได้ · `stale` / `sent` = ต้องโหลดใบใหม่แล้วเปิดกล่องใหม่ (`actionId` ใหม่)
   · `nothing` = ไม่มีอะไรให้ทำ · `error` = ฐานพังก่อนเขียนอะไร (ทั้งสองตัวแรกเป็น 409 เหมือนกัน) */
const refuse = (error, status, code) => Response.json({ error, code }, { status });
const staleAnswer = () => refuse(SURVEY_METHOD_ERRORS.stale, 409, 'stale');

const isCount = (v) => Number.isInteger(v) && v >= 0;
const isId = (v) => (typeof v === 'string' && v.trim() !== '') || typeof v === 'number';

/* `seenMix` — จำนวนพื้นที่รายวิธีที่โมดัลเห็นก่อนเปลี่ยน · ผิดรูป = `null` (400) */
function seenMixOf(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (!isCount(input.onsite) || !isCount(input.drawing)) return null;
  return { onsite: input.onsite, drawing: input.drawing };
}

/**
 * ใบนี้มีไฟล์ที่แผง "แบบจากฝ่ายขาย" จะโชว์ไหม — ไฟล์แนบของคำร้องที่ไม่ใช่แถวเอกสาร Google (ชนิดเอกสารใดก็ได้)
 * หรือไฟล์ที่แนบในเธรดของใบ (แถวที่ยังไม่ถูกลบ) · ใช้ตัดสินอย่างเดียวว่าบรรทัดเธรดจะทวงแบบจากฝ่ายขายไหม
 * ⚠️ ไม่ดูชนิดเอกสาร `spec` — ชนิดนั้นมีเฉพาะใบที่เปิดจากฟอร์มรุ่นหลัง · ใบก่อนหน้าเก็บแบบเป็นชนิด "อื่น ๆ"
 *    ถามจากชนิด = ทวงแบบทั้งที่แผงของหัวหน้าโชว์แบบอยู่ครบ
 * ⚠️ **อ่านไม่สำเร็จ = นับว่ามี** — ไม่ทวงแบบจากฝ่ายขายเพราะฐานอ่านไม่ออก และไม่ล้มการสลับเพราะประโยคท้ายเธรด
 */
async function requestHasDrawings(supabase, requestId) {
  try {
    const files = await listAttachments('dept_request', requestId, supabase);
    if (files.some((row) => !row?.metadata?.kind)) return true;
    const { data, error } = await supabase
      .from('entity_updates').select('id, attachments, "deletedAt"')
      .eq('entityType', 'dept_request').eq('entityId', String(requestId));
    if (error) throw error;
    return (data || []).some((row) => !row?.deletedAt
      && Array.isArray(row.attachments) && row.attachments.some((file) => String(file?.fileUrl ?? '').trim()));
  } catch (e) {
    console.error('[survey-method] อ่านไฟล์แบบของคำร้องไม่สำเร็จ — ถือว่ามีแบบ', requestId, e?.message || e);
    return true;
  }
}

// POST { actionId, changes: [{ zoneId, method }], reason, committedResultDate?, cancelVisitId?, seenMix: { onsite, drawing } }
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    /* ① ② — สิทธิ์ก่อนสวิตช์ (คนที่ไม่ใช่หัวหน้าได้ 403 เสมอ ไม่ว่าสวิตช์เปิดหรือปิด) · ทั้งคู่ก่อนแตะฐาน */
    if (!canSendSurveyResult(user)) return forbidden(SURVEY_METHOD_ERRORS.role);
    if (!surveyDrawingMethodEnabled()) return conflict(SURVEY_METHOD_ERRORS.off);

    /* ③ ④ ⑤ — ใบประเมินของฝ่ายเรา ที่รับเรื่องแล้วและยังไม่ส่งผล */
    const { data: request, error: reqError } = await supabase
      .from('dept_requests').select('*').eq('id', id).maybeSingle();
    if (reqError) return fail(reqError.message, 500);
    if (!request || request.kind !== 'site_survey') return notFound('ไม่พบใบประเมินพื้นที่');
    if (!canAnswerRequest(user, request)) return forbidden(`ตอบได้เฉพาะฝ่าย ${request.dept}`);
    const stateError = surveyMethodRequestError(request);
    if (stateError) return conflict(stateError);

    /* ⑥ — รูปของ body · ก่อนอ่านอะไรเพิ่ม (body ผิดรูปไม่ต้องแตะตารางผลวัด) */
    const raw = await req.json().catch(() => null);
    const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const actionId = surveyMethodActionId(body.actionId);
    const changes = surveyMethodChanges(body.changes);
    const seenMix = seenMixOf(body.seenMix);
    const namesVisit = body.cancelVisitId != null && body.cancelVisitId !== '';
    if (!actionId || changes.error || !seenMix || (namesVisit && !isId(body.cancelVisitId))) {
      return badRequest(SURVEY_METHOD_BODY_ERROR);
    }
    const cancelVisitId = namesVisit ? String(body.cancelVisitId).trim() : null;
    // ไม่ใช่สตริง = ไม่ได้กรอก — แผนเป็นคนตอบว่าต้องกรอกไหม (ไม่ปั้นออบเจ็กต์เป็นข้อความเหตุผล)
    const reason = typeof body.reason === 'string' ? body.reason : '';
    const resultDate = typeof body.committedResultDate === 'string' ? body.committedResultDate : '';

    /* ⑦ — อ่านทุกอย่างที่แผนต้องใช้ แล้วเลือกนัด **ก่อน** สร้างแผน (หัวไฟล์)
       ⚠️ ตัวอ่านสามตัวแรกโยนเมื่ออ่านพลาด ⇒ 500 ที่ catch ข้างล่าง · ยังไม่มีอะไรถูกเขียน
       ⚠️ ตัวอ่านไฟล์แบบไม่โยน (อ่านไม่ได้ = นับว่ามี) — ไม่มีก้อนไหนรอผลของอีกก้อน จึงยิงขนานกันรอบเดียว */
    const key = surveyMethodPlanKey({ userId: user.id, actionId });
    const [rows, sendBack, open, hasDrawings] = await Promise.all([
      loadSurveyZones(supabase, id),
      loadSurveySendBackState(supabase, id),
      findSurveyVisit(supabase, id, { openOnly: true }),
      requestHasDrawings(supabase, id),
    ]);

    let visit = open;
    if (open) {
      // โมดัลพูดถึงนัดอีกใบ — นัดของใบเปลี่ยนไปแล้วตั้งแต่เปิดกล่อง
      if (cancelVisitId && cancelVisitId !== String(open.id)) return staleAnswer();
    } else if (cancelVisitId) {
      /* ไม่มีนัดค้างแล้ว แต่ body ยังเอ่ยถึงนัดที่จะยกเลิก — ทางเดียวที่ถูกคือการกดซ้ำหลังรอบแรกยกเลิกนัดนั้นไปแล้ว
         🔴 ผูก `requestId` ในคำสั่งอ่าน — เลขนัดของใบอื่นต้องได้คำตอบเดียวกับนัดที่ไม่มีอยู่ */
      const { data: named, error: namedError } = await supabase
        .from('service_visits').select('*').eq('id', cancelVisitId).eq('requestId', id).maybeSingle();
      if (namedError) return fail(namedError.message, 500);
      if (!named || named.status !== 'cancelled') return staleAnswer();
      const proof = await surveyVisitCancelledByKey(supabase, { visitId: named.id, key });
      // 🔴 อ่านหลักฐานไม่สำเร็จ = 500 — ห้ามตกไปเป็น "ไม่ใช่" (กดซ้ำที่ถูกต้องโดนตอบว่าล้าสมัย) หรือ "ใช่"
      if (proof.error) return fail(proof.error.message, 500);
      if (!proof.proved) return staleAnswer();
      visit = { ...named, cancelledByThisAction: true };
    } else {
      visit = await findSurveyVisit(supabase, id);
    }

    const nowIso = new Date().toISOString();
    const plan = surveyMethodSwitchPlan({
      rows, changes: changes.value, visit, request, sendBack, reason, resultDate, hasDrawings,
      actor: { id: user.id, name: user.name }, nowIso,
    });
    if (plan.stale) return staleAnswer();
    /* แถวที่โมดัลเห็นต้องเป็นชุดเดียวกับที่แผนใช้เป็น "ก่อน" — อีกจอเพิ่ม · ตัด · สลับพื้นที่ไประหว่างที่กล่องเปิดอยู่
       = กล่องผลลัพธ์ที่หัวหน้าอ่านไม่ใช่ของใบนี้แล้ว (ใบอาจพลิกหรือไม่พลิกต่างจากที่กล่องบอก)
       ⚠️ เทียบกับ "ก่อน" ที่แผนประกอบกลับ ไม่ใช่กับแถวตรง ๆ — การกดซ้ำหลังบันทึกครึ่งทางยังผ่าน */
    if (seenMix.onsite !== plan.before.mix.onsite || seenMix.drawing !== plan.before.mix.drawing) {
      return staleAnswer();
    }
    /* ⑧ ⑨ */
    if (plan.kind === 'none') return refuse(SURVEY_METHOD_ERRORS.nothing, 409, 'nothing');
    if (plan.errors.length) return badRequest(plan.errors[0]);
    /* ⑩ — นัดที่จะถูกยกเลิกต้องตรงกันสองทาง: แผนยกเลิกนัดที่โมดัลไม่ได้บอก (หรือบอกนัดอื่น) ·
       โมดัลสัญญาว่ายกเลิก แต่แผนไม่ยกเลิกแล้ว (เช่นช่างกด "เริ่มงาน" ไประหว่างนั้น) */
    const cancels = plan.visit.action === 'cancel';
    if (cancels ? cancelVisitId !== String(plan.visit.id) : !!cancelVisitId) {
      return staleAnswer();
    }
    /* แถวที่แผนนับว่า "การกดนี้เขียนไปแล้ว" ต้องไม่ใช่ของการกดครั้งอื่นที่เสร็จครบไปแล้ว (แท็บที่สองของหัวหน้าคนเดียวกัน
       ด้วยชิปเหตุผลเดียวกัน) — ยังไม่ได้เขียนอะไร · อ่านไม่สำเร็จ = 500 */
    const applied = await surveyMethodAppliedByOther(supabase, { requestId: id, key, plan });
    if (applied.error) return fail(applied.error.message, 500);
    if (applied.other) return staleAnswer();

    /* ── เขียน — ลำดับ · การกันซ้ำ · การแยก "ชน" ออกจาก "ฐานพัง" อยู่ใน `runSurveyMethodPlan` ที่เดียว ── */
    const result = await runSurveyMethodPlan(supabase, { plan, request, user, nowIso, key, req });
    if (!result.ok) return refuse(result.error, result.status, result.code);

    /* แถวสดกลับไปให้จอ · 🔴 ถึงตรงนี้การสลับเขียนครบแล้ว ⇒ อ่านกลับไม่สำเร็จต้องไม่กลายเป็น 500
       (จอจะเข้าใจว่าไม่ได้บันทึก) — คืน `null` ทั้งคู่ แล้วให้จอโหลดใบใหม่เอง (ไม่คืนครึ่งเดียวให้จอวาดปนของเก่า) */
    let zones = null;
    let fresh = null;
    try {
      const rowsNow = await loadSurveyZones(supabase, id);
      const { data, error } = await supabase.from('dept_requests').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('ไม่พบแถวของใบ');
      zones = rowsNow;
      fresh = data;
    } catch (e) {
      console.error('[survey-method] สลับวิธีสำเร็จแต่อ่านแถวกลับไม่ได้', request.docNo || id, e?.message || e);
    }
    return ok({
      ok: true,
      already: result.already === true,
      plan: { kind: plan.kind, flip: plan.flip, visitAction: plan.visit.action },
      zones,
      request: fresh,
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});
