// ── ตัวเขียนของการสลับวิธีประเมิน (งวด S2a §2.3 · ลำดับเขียน §4.4) — server only ───────────────
//
// ⭐ **อ่านแต่ `plan.writes` ไม่คิดซ้ำ** — แผน (`surveyMethodSwitchPlan`) ตัดสินไปแล้วว่าจะเกิดอะไร และโมดัลโชว์ข้อความ
//   จากแผนตัวเดียวกัน · ตัวเขียนที่คิดเองอีกรอบ = วันหนึ่งกล่องบอกอย่าง ฐานได้อีกอย่าง
//
// ลำดับ (แต่ละขั้นวิ่งเมื่อแผนสั่งเท่านั้น ยกเว้น 1 · 4 · 5 · 6 ที่วิ่งเสมอ):
//   1  **จอง** ใบ: แตะ `updatedAt` แบบผูกกับรุ่นที่ route อ่าน + "ยังไม่ส่งผล"  →  ถามว่าการกดนี้เคยลงเธรดแล้วหรือยัง
//      (เคย = ทุกขั้นเสร็จไปแล้วในรอบก่อน ⇒ ข้าม 2–5 ทั้งหมด · ตอบ `already`)
//                                                              4  วันบนใบ + **แตะปิดท้ายด้วยเวลาใหม่**
//   2  ยกเลิกนัด + บรรทัดบนเธรดของนัด                        5  บรรทัดเธรดของใบ (กันซ้ำด้วยกุญแจ) + กระดิ่ง
//   3a พื้นที่ → จากแบบ · 3b พื้นที่ → ลงหน้างาน (ทีละแถว)     6  audit
//   3c แถวที่ตัดไปแล้วตามไปเป็นจากแบบ
//
// 🔴 **ทำไมแตะใบสองครั้งด้วยค่าที่ต่างกัน** — เส้นส่งผลอ่านใบ แล้วอ่านแถวพื้นที่ แล้วเคลมใบทีหลังด้วย `updatedAt` ที่อ่านไว้
//   แตะครั้งเดียวตอนต้นมีรู: ส่งผลอ่านใบ **หลัง** ขั้น 1 อ่านแถว **ก่อน** ขั้น 3 (วิธีเก่า ด่านเก่า) แล้วเคลมยังผ่าน
//   แตะหัว (`nowIso`) + แตะท้าย (เวลาใหม่) ⇒ การส่งผลที่อ่านแถวก่อนเขียนเสร็จ ถือ `updatedAt` ที่ไม่ใช่ค่าปัจจุบันเสมอ
//
// 🔴 **"ชน" ไม่ใช่ "ฐานพัง"** — ใบถูกส่งผลไปก่อน · นัดเดินไปแล้ว · แถวถูกคนอื่นขยับ: กดซ้ำกี่ครั้งก็ไม่สำเร็จ
//   ⇒ ตอบข้อความของมันเอง (`sentRoute` / `stale`) · "บันทึกไม่ครบ — กดอีกครั้ง" (`partial`) ตอบเฉพาะตอนฐานพังจริง
//
// 🪤 `runSteps` ทำ `error.message = …` — error รูป **สตริง** (`appendUpdate` คืน `error: error.message`) จะกลายเป็น
//   `TypeError: Cannot create property 'message' on string` ⇒ ทุกขั้นคืน `{ error: <Error> }` ผ่าน `toError` เสมอ
// ⚠️ supabase ไม่ throw — ทุกคำสั่งรับ `{ error }` มาอ่าน · การอ่านที่พังไม่เคยถูกนับเป็น "ไม่มีแถว"
import { recordAudit } from '@/lib/audit';
import { appendUpdate } from '@/lib/master/updates';
import { isDrawingZone } from '@/lib/service/surveyMethod';
import { notifySurveyDeskReady, notifySurveyMethodCrew } from '@/lib/service/surveyMethodNotify';
import { SURVEY_METHOD_BODY_ERROR, SURVEY_METHOD_ERRORS } from '@/lib/service/surveyMethodSwitch';
import { runSteps } from '@/lib/supabaseWriteBatch';

const toError = (e) => (e instanceof Error ? e : new Error(String(e?.message ?? e)));
const isCut = (row) => (row?.status || 'ok') === 'cut';
const CANCELLABLE = ['draft', 'scheduled'];

/**
 * บรรทัดเธรด "ยกเลิก" ของนัด — ตัวเดียวที่ PATCH ของนัดและเส้นสลับวิธีใช้ · คืนผลของ `appendUpdate` (`{ row, error }`)
 * ⚠️ `meta` ส่งเฉพาะเมื่อมี — ไม่ส่ง = แถวเดียวกับที่ PATCH ของนัดเขียนมาตลอดทุกคีย์
 */
export async function appendVisitCancelLine(supabase, { visitId, reason, user, meta }) {
  return appendUpdate(supabase, {
    entityType: 'service_visit', entityId: visitId, kind: 'cancel',
    body: reason || 'ยกเลิกนัด', user, ...(meta ? { meta } : {}),
  });
}

/**
 * ยกเลิกนัดของใบแบบมีเงื่อนไข (เฉพาะร่าง / นัดไว้) + บรรทัดเธรดของนัดที่พก `meta.methodKey`
 * คืน `{ cancelled: true, visit }` ยกเลิกในรอบนี้ · `{ cancelled: false, visit }` ถูกยกเลิกอยู่แล้ว (กดซ้ำ — ไม่เขียนบรรทัดที่สอง)
 *     `{ conflict: true }` นัดเดินไปแล้ว (ช่างกดเริ่มงาน / ปิดนัด) หรือไม่ใช่นัดของใบนี้ — **การชน ไม่ใช่การเขียนพัง**
 *     `{ error: Error }` ฐานพัง
 * 🔴 **ไม่เขียน `dept_requests`** — การยกเลิกนัดไม่มีผลข้างเคียงบนใบ (ใบถอยขั้นเฉพาะตอน "เข้าพื้นที่ไม่ได้")
 * 🔴 บรรทัดเธรดคือ **หลักฐาน** ว่านัดนี้ถูกยกเลิกโดยการกดครั้งนี้ (`surveyVisitCancelledByKey`) — ยกเลิกแล้วบรรทัดไม่ลง =
 *    การกดซ้ำพิสูจน์ไม่ได้ ช่างไม่ได้กระดิ่ง ⇒ log เลขนัดดัง ๆ ให้คนตามได้ (สภาพค้างที่ยอมรับ สเปค §4.6)
 */
export async function cancelSurveyVisitForMethod(supabase, {
  visitId, requestId, reason, key, user, nowIso, req, audit = recordAudit,
}) {
  const { data: visit, error } = await supabase
    .from('service_visits').update({ status: 'cancelled', updatedAt: nowIso })
    .eq('id', visitId).eq('requestId', requestId).in('status', CANCELLABLE)
    .select().maybeSingle();
  if (error) return { error: toError(error) };

  if (visit) {
    const line = await appendVisitCancelLine(supabase, { visitId, reason, user, meta: { methodKey: key } });
    if (line.error) {
      console.error(`[survey-method] 🔴 นัด ${visit.code || visitId} ถูกยกเลิกแล้วแต่บรรทัดเธรดของนัดไม่ลง`
        + ' — ช่างไม่ได้รับแจ้ง และการกดซ้ำจะถูกตอบว่าใบถูกแก้โดยคนอื่น:', line.error);
      return { error: toError(line.error) };
    }
    await audit({
      user, action: 'update', entityType: 'service_visit', entityId: visitId,
      before: null, after: visit, summary: `ยกเลิกนัดประเมิน ${visit.code || visitId} — ${reason}`, request: req,
    });
    return { cancelled: true, visit };
  }

  const { data: now, error: readError } = await supabase
    .from('service_visits').select('id, code, status')
    .eq('id', visitId).eq('requestId', requestId).maybeSingle();
  if (readError) return { error: toError(readError) };
  if (now?.status === 'cancelled') return { cancelled: false, visit: now };
  return { conflict: true };
}

/**
 * นัดนี้ถูกยกเลิกโดยการกดครั้งนี้จริงไหม — ดูจากบรรทัด "ยกเลิก" บนเธรดของนัด (ห้าบรรทัดล่าสุด) ที่ `meta.methodKey` ตรงกุญแจ
 * คืน `{ proved }` หรือ `{ error: Error }`
 * 🔴 **อ่านพัง = `{ error }`** (route ตอบ 500) — ห้ามตกไปเป็น "ไม่ใช่" (การกดซ้ำที่ถูกต้องโดนตอบว่าล้าสมัย) หรือ "ใช่"
 *    (เลขนัดเก่าใน body ได้บรรทัดเธรดและกระดิ่งว่าการสลับนี้ยกเลิกมัน)
 */
export async function surveyVisitCancelledByKey(supabase, { visitId, key }) {
  const { data, error } = await supabase
    .from('entity_updates').select('id, meta')
    .eq('entityType', 'service_visit').eq('entityId', String(visitId)).eq('kind', 'cancel')
    .order('createdAt', { ascending: false }).limit(5);
  if (error) return { error: toError(error) };
  return { proved: !!key && (data || []).some((row) => row?.meta?.methodKey === key) };
}

/**
 * แถวที่แผนนับว่า "การกดนี้เขียนไปแล้ว" (`applied`) ถูกเขียนโดย **การกดครั้งอื่น** ที่ลงเธรดครบแล้วหรือเปล่า — `{ other }` หรือ `{ error }`
 *
 * 🐞 แผนจำแถวของตัวเองจากเหตุผล + ชื่อคนสลับ ซึ่งเหตุผลมาจากชิปห้าตัว ⇒ หัวหน้าคนเดียวกันที่เปิดใบไว้สองแท็บแล้วสลับ
 *    ด้วยชิปเดียวกัน แท็บที่สองถูกนับเป็น "กดซ้ำ" ของแท็บแรก: วันส่งผลถูกเขียนทับ เธรดกับกระดิ่งบอกซ้ำว่าเพิ่งสลับ
 * 🔑 ตัดสินจากบรรทัดเธรดล่าสุดที่เอ่ยถึงพื้นที่นั้น: เป็นของกุญแจอื่น **และ** ไปทิศเดียวกับที่ขอ = คนอื่นทำครบไปแล้ว (ล้าสมัย)
 *    การกดซ้ำหลังบันทึกครึ่งทางไม่มีบรรทัดแบบนั้น (มันพังก่อนถึงขั้นเธรด) · การกดซ้ำหลังเสร็จครบ บรรทัดล่าสุดเป็นของกุญแจตัวเอง
 * ⚠️ ไม่มีแถว `applied` = ไม่อ่านอะไรเลย · อ่านพัง = `{ error }` (route ตอบ 500 — ยังไม่ได้เขียนอะไร ห้ามเดา)
 * ⚠️ ดูแค่สิบบรรทัดล่าสุด — พื้นที่ที่ถูกเอ่ยถึงเก่ากว่านั้นตกไปใช้กติกาของแผนตามเดิม
 */
export async function surveyMethodAppliedByOther(supabase, { requestId, key, plan }) {
  const sid = (v) => String(v);
  const applied = (zones, todoIds) => {
    const todo = new Set((todoIds || []).map(sid));
    return (zones || []).map((zone) => sid(zone.id)).filter((id) => !todo.has(id));
  };
  const targets = [
    ...applied(plan?.toDrawing, plan?.writes?.drawingIds).map((id) => ({ id, to: 'toDrawing' })),
    ...applied(plan?.toOnsite, plan?.writes?.onsiteIds).map((id) => ({ id, to: 'toOnsite' })),
  ];
  if (!targets.length) return { other: false };
  const { data, error } = await supabase
    .from('entity_updates').select('id, meta')
    .eq('entityType', 'dept_request').eq('entityId', String(requestId)).eq('kind', 'method')
    .order('createdAt', { ascending: false }).limit(10);
  if (error) return { error: toError(error) };
  const has = (row, field, id) => (Array.isArray(row?.meta?.[field]) ? row.meta[field] : []).some((v) => sid(v) === id);
  const other = targets.some(({ id, to }) => {
    const last = (data || []).find((row) => has(row, 'toDrawing', id) || has(row, 'toOnsite', id));
    return !!last && last.meta.key !== key && has(last, to, id);
  });
  return { other };
}

/**
 * 🔑 ลำดับเขียนทั้งหมดของแผน (สเปค §4.4)
 *
 * @param plan     ผลของ `surveyMethodSwitchPlan` ที่ route สร้าง **ครั้งเดียว** จากแถวจริง
 * @param request  แถว `dept_requests` ที่ route อ่าน (id · docNo · title · **`updatedAt` = รุ่นที่ขั้น 1 จอง** — ทั้งแถวลง `before` ของ audit)
 * @param user     คนกด — ชื่อลง `methodChangedByName` (ตัวเดียวกับที่แผนใช้จำว่าแถวไหนเป็นของการกดนี้)
 * @param nowIso   เวลาของ request นี้ — ลงทุกคอลัมน์เวลา ยกเว้นการแตะปิดท้ายของขั้น 4
 * @param key      `surveyMethodPlanKey(...)` — กันบรรทัดเธรด / กระดิ่งซ้ำ และเป็นหลักฐานบนบรรทัดยกเลิกของนัด
 * @param notify   `{ crew, head }` — ตัวยิงกระดิ่ง (ไม่ส่ง = ตัวจริงจาก `surveyMethodNotify.js`) · `audit` ก็ฉีดได้เหมือนกัน
 *
 * @returns `{ ok: true }` · `{ ok: true, already: true }` (การกดนี้เคยลงเธรดแล้ว — ไม่เขียนเธรด / กระดิ่งซ้ำ)
 *          `{ status, error, code }` — `code`: `'sent'` ส่งผลไปก่อน · `'stale'` ชนกับคนอื่น · `'partial'` ฐานพังกลางทาง (กดซ้ำได้)
 *          · `'error'` ฐานพังที่ขั้น 1 (ยังไม่มีอะไรถูกเขียน) · `'nothing'` / `'invalid'` แผนที่ไม่ควรมาถึงตัวเขียน
 */
export async function runSurveyMethodPlan(supabase, {
  plan, request, user, nowIso, key, req,
  notify = { crew: notifySurveyMethodCrew, head: notifySurveyDeskReady },
  audit = recordAudit,
}) {
  // ── ด่านของตัวเขียนเอง — route ตรวจมาก่อนแล้วทั้งหมด ชั้นนี้กันผู้เรียกรายใหม่ที่ข้ามด่าน ──
  if (!plan || !key || !request?.id) return { status: 400, error: SURVEY_METHOD_BODY_ERROR, code: 'invalid' };
  if (plan.stale) return { status: 409, error: SURVEY_METHOD_ERRORS.stale, code: 'stale' };
  if (plan.kind === 'none') return { status: 409, error: SURVEY_METHOD_ERRORS.nothing, code: 'nothing' };
  if (plan.errors?.length) return { status: 400, error: plan.errors[0], code: 'invalid' };

  const id = request.id;
  const { writes } = plan;
  const stamp = {
    methodReason: plan.reason || null,
    methodChangedAt: nowIso,
    methodChangedByName: user?.name || null,
  };
  let halt = null;
  /* การกดนี้ (กุญแจนี้) เคยลงบรรทัดเธรดแล้ว = ทุกขั้นก่อนหน้าเสร็จไปแล้วในรอบใดรอบหนึ่ง (บรรทัดเธรดคือขั้นเขียนสุดท้าย)
     ⇒ ขั้น 2–5 ไม่วิ่งซ้ำ · 🐞 เดิมกันซ้ำแค่เธรดกับกระดิ่ง: คำตอบรอบแรกหายกลางทาง → หัวหน้าเลื่อนวันส่งผลที่หน้าคำร้อง →
        กลับมากดบันทึกในโมดัลเดิม = ขั้น 4 เขียนวันเก่าทับเงียบ ๆ (และแถวที่ถูกสลับกลับไปแล้วถูกสลับซ้ำโดยไม่มีบรรทัดเธรด) */
  let already = false;
  const stop = (status, error, code) => {
    halt = { status, error, code };
    return { error: new Error('halt') };
  };
  const sent = () => stop(409, SURVEY_METHOD_ERRORS.sentRoute, 'sent');
  const stale = () => stop(409, SURVEY_METHOD_ERRORS.stale, 'stale');

  /* PostgREST ผูกเงื่อนไขข้ามตารางไม่ได้ ⇒ ก่อนเขียนตารางอื่น อ่าน `answeredAt` ของใบอีกรอบ (ขั้น 1 และ 4 เป็นคำสั่งบนใบเอง มีเงื่อนไขในตัว) */
  const stillOpen = async () => {
    const { data, error } = await supabase
      .from('dept_requests').select('id, "answeredAt"').eq('id', id).maybeSingle();
    if (error) return { error: toError(error) };
    if (!data || data.answeredAt) return sent();
    return {};
  };

  const writeOnsite = (row, spots, updatedAt) => {
    const query = supabase
      .from('service_survey_zones')
      .update({ method: 'onsite', ...stamp, spots, updatedAt: nowIso })
      .eq('id', row.id).eq('requestId', id);
    return (updatedAt == null ? query.is('updatedAt', null) : query.eq('updatedAt', updatedAt))
      .neq('status', 'cut').select('id').maybeSingle();
  };

  /* บรรทัดเธรดชนิด `method` ล่าสุดของใบ — ใช้ถามว่ากุญแจนี้เคยลงแล้วหรือยัง (หลังขั้น 1 และอีกครั้งก่อนเขียนบรรทัด) */
  const keyRecorded = async () => {
    const { data, error } = await supabase
      .from('entity_updates').select('id, meta')
      .eq('entityType', 'dept_request').eq('entityId', String(id)).eq('kind', 'method')
      .order('createdAt', { ascending: false }).limit(10);
    // 🔴 อ่านพัง = ขั้นนี้พัง — ห้ามอ่าน `data: undefined` เป็น "ยังไม่มีบรรทัด" แล้วเขียนซ้ำ
    if (error) return { error: toError(error) };
    return { recorded: (data || []).some((row) => row?.meta?.key === key) };
  };

  const steps = [];
  // ขั้นหลังการจอง — ไม่วิ่งเมื่อการกดนี้เสร็จครบไปแล้ว (`already`)
  const addStep = (label, run) => steps.push([label, async () => (already ? {} : run())]);

  /* 🔑 **จองใบด้วยรุ่นที่ route อ่าน** (ท่าเดียวกับ `claimRequestForSend`) — หัวหน้าสองคนที่สร้างแผนจากแถวชุดเดียวกันก่อนใคร
     เขียน ได้ผ่านคนเดียว: คนที่สองจองไม่ติด = ยังไม่ได้เขียนอะไร ตอบ "ถูกแก้โดยคนอื่น"
     🐞 เดิมแตะแบบไม่ผูกรุ่น ⇒ คนหนึ่งสลับพื้นที่ลงหน้างานสุดท้ายเป็นจากแบบ (ยกเลิกนัด · รับปากวันส่งผล) พร้อมกับอีกคนสลับ
        พื้นที่จากแบบกลับเป็นลงหน้างาน = ใบต้องมีนัด แต่นัดถูกยกเลิกและเธรดบอกว่าไม่เหลือพื้นที่ที่ต้องลงหน้างาน
     ⚠️ การกดซ้ำอ่านใบใหม่ก่อนเสมอ (route · ทางทำต่อให้จบของการตัด) ⇒ ตารางกดซ้ำของสเปค §4.6 เท่าเดิม */
  steps.push(['1 จองใบ', async () => {
    const version = request.updatedAt;
    const claim = supabase
      .from('dept_requests').update({ updatedAt: nowIso })
      .eq('id', id).is('answeredAt', null);
    const { data, error } = await (version == null || version === '' ? claim.is('updatedAt', null) : claim.eq('updatedAt', version))
      .select('id').maybeSingle();
    // ยังไม่มีอะไรถูกเขียน ⇒ 500 พร้อมข้อความจริง ไม่ใช่ "กดอีกครั้ง"
    if (error) return stop(500, toError(error).message, 'error');
    if (data) return {};
    // จองไม่ติด — ส่งผลไปแล้ว หรือใบถูกแก้หลังจาก route อ่าน · อ่านไม่ออก = 500 (ยังไม่ได้เขียนอะไร ไม่เดาว่าเป็นแบบไหน)
    const { data: now, error: readError } = await supabase
      .from('dept_requests').select('id, "answeredAt"').eq('id', id).maybeSingle();
    if (readError) return stop(500, toError(readError).message, 'error');
    return !now || now.answeredAt ? sent() : stale();
  }]);

  steps.push(['1 การกดนี้เคยลงเธรดแล้วหรือยัง', async () => {
    const seen = await keyRecorded();
    if (seen.error) return seen;
    already = seen.recorded;
    return {};
  }]);

  if (writes.cancelVisitId) {
    addStep('2 ยกเลิกนัด', async () => {
      const open = await stillOpen();
      if (open.error) return open;
      const out = await cancelSurveyVisitForMethod(supabase, {
        visitId: writes.cancelVisitId, requestId: id, reason: plan.visitCancelReason, key, user, nowIso, req, audit,
      });
      if (out.error) return { error: out.error };
      // ช่างกดเริ่มงาน หรือมีคนปิดนัด หลังจากแผนอ่าน — เขียนไปแค่การแตะใบ
      if (out.conflict) return stale();
      return {};
    });
  }

  if (writes.drawingIds.length) {
    addStep('3a พื้นที่เป็นจากแบบ', async () => {
      const open = await stillOpen();
      if (open.error) return open;
      const { error } = await supabase
        .from('service_survey_zones')
        .update({ method: 'drawing', ...stamp, updatedAt: nowIso })
        .eq('requestId', id).in('id', writes.drawingIds).neq('status', 'cut');
      return error ? { error: toError(error) } : {};
    });
  }

  if (writes.onsiteIds.length) {
    /* ทีละแถว และผูกกับรุ่นของแถวที่แผนอ่าน — คำสั่งนี้เขียนทับ `spots` ซึ่งเส้นบันทึกพื้นที่ (PATCH / PUT) ก็เขียน
       ไม่โดนแถว ⇒ อ่านใหม่หนึ่งครั้ง: ยังเป็นจากแบบและยังไม่ถูกตัด = ปลดเลือกจุดชุดใหม่แล้วเขียนอีกรอบ (การบันทึกธรรมดาของคนอื่น
       ไม่ควรทิ้งการสลับหลายแถวค้างครึ่งทาง) · นอกนั้น หรือไม่โดนอีก = ชน */
    writes.unselectSpotRows.forEach((row, index) => {
      addStep(`3b พื้นที่กลับเป็นลงหน้างาน (${row.id})`, async () => {
        if (index === 0 && !writes.drawingIds.length) {
          const open = await stillOpen();
          if (open.error) return open;
        }
        const first = await writeOnsite(row, row.spots, row.updatedAt);
        if (first.error) return { error: toError(first.error) };
        if (first.data) return {};

        const { data: fresh, error: readError } = await supabase
          .from('service_survey_zones').select('*').eq('id', row.id).eq('requestId', id).maybeSingle();
        if (readError) return { error: toError(readError) };
        if (!fresh || isCut(fresh) || !isDrawingZone(fresh)) return stale();
        const spots = (Array.isArray(fresh.spots) ? fresh.spots : []).map((spot) => ({ ...spot, selected: false }));
        const second = await writeOnsite(row, spots, fresh.updatedAt);
        if (second.error) return { error: toError(second.error) };
        return second.data ? {} : stale();
      });
    });
  }

  if (writes.cutMarkIds.length) {
    addStep('3c แถวที่ตัดตามไปเป็นจากแบบ', async () => {
      const { error } = await supabase
        .from('service_survey_zones').update({ method: 'drawing', updatedAt: nowIso })
        .eq('requestId', id).eq('status', 'cut').in('id', writes.cutMarkIds);
      return error ? { error: toError(error) } : {};
    });
  }

  addStep('4 วันบนใบ + แตะปิดท้าย', async () => {
    // 🔴 ต้องต่างจากค่าของขั้น 1 เสมอ (หัวไฟล์) — เครื่องเร็วพอจะได้มิลลิวินาทีเดียวกัน จึงบวกหนึ่งกันไว้
    let touchIso = new Date().toISOString();
    if (touchIso === nowIso) touchIso = new Date(Date.parse(nowIso) + 1).toISOString();
    const dates = writes.dates ? { ...writes.dates } : {};
    // แผนที่สร้างโดยไม่ได้ส่งเวลามา (`nowIso` ของแผนเป็น null) — เวลารับปากคือเวลาของ request นี้
    if ('dueCommittedAt' in dates && !dates.dueCommittedAt) dates.dueCommittedAt = nowIso;
    if ('assignedAt' in dates && !dates.assignedAt) dates.assignedAt = nowIso;
    const { error } = await supabase
      .from('dept_requests').update({ ...dates, updatedAt: touchIso })
      .eq('id', id).is('answeredAt', null).select('id').maybeSingle();
    // ไม่โดนแถว = ใบถูกส่งผลไประหว่างทาง: วันไม่มีความหมายแล้ว แต่แถวที่สลับไปคือประวัติจริง ⇒ ไปเขียนเธรดต่อ
    return error ? { error: toError(error) } : {};
  });

  addStep('5 เธรดของใบ', async () => {
    // ถามอีกครั้งก่อนเขียน — คำขอเดียวกันสองตัวที่วิ่งพร้อมกัน (กดซ้ำเร็ว) ต้องได้บรรทัดเดียว
    const seen = await keyRecorded();
    if (seen.error) return seen;
    if (seen.recorded) {
      already = true;
      return {};
    }
    const line = await appendUpdate(supabase, {
      entityType: 'dept_request', entityId: id, kind: 'method', body: plan.thread, user,
      meta: {
        key,
        kind: plan.kind,
        flip: plan.flip,
        toDrawing: plan.toDrawing.map((zone) => zone.id),
        toOnsite: plan.toOnsite.map((zone) => zone.id),
        cancelledVisitId: plan.visit.action === 'cancel' ? plan.visit.id : null,
        resultDate: plan.dates.action === 'set' ? plan.resultDate : null,
      },
    });
    // บรรทัดนี้คือตัวที่แจ้งฝ่ายขาย — ไม่ลง = ต้องให้กดซ้ำ
    if (line.error) return { error: toError(line.error) };
    return {};
  });

  try {
    await runSteps(steps);
  } catch (e) {
    if (halt) return halt;
    console.error('[survey-method] บันทึกการสลับวิธีไม่ครบ', request.docNo || id, '—', e?.message || e);
    return { status: 409, error: SURVEY_METHOD_ERRORS.partial, code: 'partial' };
  }

  // กระดิ่งมาหลังบรรทัดเธรดเสมอ และไม่ยิงซ้ำเมื่อการกดนี้เคยลงเธรดแล้ว · พลาดต้องไม่ทำให้การสลับที่เขียนครบแล้วตอบว่าพัง
  if (!already) {
    try {
      if (plan.bells.crew) {
        notify.crew(supabase, { request, visit: plan.visit, bell: plan.bells.crew, reason: plan.reason, actor: user, key });
      }
      if (plan.bells.head) notify.head(supabase, { request, actor: user, title: plan.bells.head.title, key });
    } catch (e) {
      console.error('[survey-method] ยิงกระดิ่งไม่สำเร็จ', request.docNo || id, '—', e?.message || e);
    }
  }

  // 6 audit — อ่านใบใหม่เป็น `after` · อ่านไม่ได้ก็ยังบันทึก (audit ต้องไม่ทำ action พัง)
  const { data: fresh, error: freshError } = await supabase
    .from('dept_requests').select('*').eq('id', id).maybeSingle();
  await audit({
    user, action: 'update', entityType: 'dept_request', entityId: id,
    before: request, after: freshError || !fresh ? { ...request, ...(writes.dates || {}) } : fresh,
    summary: `${request.docNo || id} · ${plan.thread}`, request: req,
  });

  return already ? { ok: true, already: true } : { ok: true };
}
