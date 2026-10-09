// ── ส่งผลประเมินให้ฝ่ายขาย (เฟส 3 · ปุ่มบนจอส่งผล) ───────────────────────
//
// ⭐ **"ส่งผล" = "ตอบคำร้อง"** — ใบประเมินเป็นคำร้องหัวข้อหนึ่ง ไม่ใช่เอกสารพันธุ์ใหม่
//   ⇒ การกดส่งผลคือการกด `answeredAt` ของใบ และเข้ากติกา **ปิดสองฝั่ง** เดิมทุกอย่าง
//     (ใบจบก็ต่อเมื่อ SA กด "ปิดเรื่อง" ด้วย · ปิดเรื่องได้หลังส่งผลเท่านั้น — มติเจ้าของ 24/09 ข้อ 3)
//
// 🔴 **ทางเดียวที่ใบประเมินเป็น "ตอบแล้ว"** (มติเจ้าของ 24/09 ข้อ 1) — `PATCH /api/sa/requests/[id]`
//   action=answer ไม่รู้จักด่านหกข้อของใบประเมิน (ขนาด · รูป · จุด · แพ็คเกจ) ซึ่งอยู่ในตารางลูก
//   ⇒ เส้นนั้นปฏิเสธหัวข้อนี้แล้ว (`genericAnswerError` · lib/requests/answerVia.js) และหน้าคำร้องพามาที่นี่แทน
//   ⚠️ แต่ **กติกาการเปลี่ยนสถานะยังใช้ของกลางตัวเดิม** (`answerRequestError` ·
//     `closureStatus`) — เขียนกติกาซ้ำเมื่อไร สองเส้นจะเพี้ยนหากันแน่
//
// ⭐ **ส่งผลปิดนัดประเมินที่ยังเปิดอยู่ให้ด้วย** (มติเจ้าของ 24/09 ข้อ 2 — แทนมติ 16/09 "ส่งผลไม่ปิดนัด")
//   🐞 ส่งผลตอนช่างยังไม่กดส่งงาน ⇒ ใบล็อก แถบส่งงานหาย ⇒ นัดค้าง "กำลังทำ" ปิดจากจอไหนก็ไม่ได้
//   🔑 ด่านของการปิดคือด่านส่งผลหกข้อตัวเดียวกัน — ครอบด่านส่งงานของช่างทั้งหมด (ดู `surveySendError`)
//   🔑 **ลำดับคือความปลอดภัย**: ปิดนัดก่อน → ตอบใบทีหลัง · ล้มกลางทางเหลือได้แค่ "นัดปิดแล้ว ใบยังไม่ตอบ"
//      ซึ่งเท่ากับหลังช่างกดส่งงานตามปกติ และกดส่งผลซ้ำก็จบ · สภาพ "ตอบแล้วแต่นัดยังเปิด" ไปไม่ถึงอีกแล้ว
//   ⚠️ ไม่ทำเป็น RPC: ด่านต้องอ่านไฟล์ใน JS อยู่ดี (`listAttachments`) · RPC จะห่อแค่ UPDATE สองคำสั่ง
//      แต่ต้องเขียน `closureStatus` ซ้ำใน SQL และเพิ่ม RPC ที่ anon เรียกได้อีกตัว
//
// ⭐ **ส่งผล = ออกเอกสารประเมิน (เลข SU) ด้วย** (มติเจ้าของ 01/10 ข้อ 1 · สเปก PR-2 §2 · S1–S9)
//   🔑 เปิดด้วยสวิตช์ `SURVEY_REPORT_ISSUE_AT_SEND=on` **บน production เท่านั้น** (`surveyReportIssueAtSend`) —
//      ปิดอยู่ = เส้นนี้เดินเหมือนเดิมทุกก้าว: ไม่ตรวจรูป ไม่ตรวจเอกสาร ไม่ออกเลข ไม่อ่านแถวเอกสาร และ **ไม่โหลดของหนัก**
//      (ตัวย่อรูป · ตัวเรนเดอร์ เข้ามาทาง `await import()` ในกิ่งที่เปิดสวิตช์เท่านั้น)
//   🔴 **เรื่องของเอกสารตีกลับได้เฉพาะก่อนเขียน** (S2 · S3 · S5) — นัดถูกปิดก่อนตอบใบ ⇒ หลังจุดนั้นห้ามมีอะไรตีกลับอีก ·
//      ขั้นออกเลข (S8) อยู่หลังกระดิ่งและ audit ใน try/catch ของตัวเอง: ล้มยังไงการส่งผลก็ตอบ 200 พร้อมเหตุใน `report`
//   🔴 **ปัญหาของใบตีกลับ · ปัญหาของระบบไม่ตีกลับ** (มติข้อ 2) — ผลประเมินต้องถึงฝ่ายขายเสมอ เอกสารออกตามทีหลังได้
//      (ปุ่ม "ออกเอกสาร" ของ route เอกสาร)
//   ⚠️ ของในไฟล์นี้ที่มีผลไม่ว่าสวิตช์เปิดหรือปิด (§0): ฐานของส่วนต่างรอบก่อน + `meta.totals` บนแถวคำตอบ (S7) ·
//      `meta.closedBySend` บนบรรทัดเธรดของนัด (S6)
//
// ⭐ **รู้จักวิธีประเมินรายพื้นที่** (ประเมินจากแบบ · mig 0408 · งวด S1)
//   🔑 `needsVisit` (= `surveyNeedsVisit` ของแถวพื้นที่) คิดครั้งเดียวหลังอ่านผลวัด แล้วส่งให้ทุกที่ที่ถามเรื่องนัด —
//      ใบงานโต๊ะ (จากแบบทั้งใบ) ไม่ปิดนัดที่ยังไม่มีใครไปเป็น "เข้าแล้ว" · ใบลงหน้างานล้วนได้ `true` = เส้นเดิมทุกก้าว
//   🔑 ด่าน "พื้นที่ลงหน้างานต้องมีนัดที่เข้าพื้นที่" (แถว 17a) ทำงาน **เฉพาะตอนเปิดสวิตช์ `SURVEY_DRAWING_METHOD`**
//      (`surveyDrawingMethodEnabled`) — ปิดอยู่ = ไม่อ่านนัดเพิ่ม ไม่ตรวจ
//   🔑 การส่งผลผูกกับ `updatedAt` ที่อ่านมาตอนต้น (แถว 19 ② · `expectUpdatedAt`) **เฉพาะตอนเปิดสวิตช์เดียวกัน** —
//      จองแถวเป็นคำสั่งเขียนแรก ก่อนปิดนัด · ปิดอยู่ = ไม่จอง ไม่ผูก คำสั่งเขียนชุดเดิม
//   🔑 **ใบที่มีพื้นที่จากแบบต้องตอบว่า "ต้องยืนยันหน้างานไหม"** (งวด S2a · แผน §3.2) — จอส่ง `methodMix` (สัดส่วนวิธีประเมิน
//      ที่หัวหน้าเห็น) กับ `surveyConfirm` · ด่าน `surveySendMethodError` ตัดสิน **จากแถว ไม่ถามสวิตช์** (ใบที่มีพื้นที่จากแบบ
//      ไปแล้วต้องส่งได้แม้สวิตช์ถูกปิดทีหลัง) · คำตอบลงคอลัมน์ `surveyConfirm` ของใบ และต่อท้ายบรรทัดเธรด / audit
//      ⚠️ ใบลงหน้างานล้วน: ไม่ต้องส่งสองคีย์นี้ · คำสั่งตอบใบไม่มีคีย์ `surveyConfirm` · บรรทัดเธรดและ audit ตัวเดิมทุกตัวอักษร
import { recordAudit } from '@/lib/audit';
import { appendRequestEvent } from '@/lib/sales/documentThread';
import { appendUpdate } from '@/lib/master/updates';
import { withUser, ok, fail, badRequest, forbidden, notFound, conflict } from '@/lib/http';
import { canSendSurveyResult } from '@/lib/permissions';
import { canAnswerRequest } from '@/lib/requests/access';
import { closureStatus } from '@/lib/requests/closure';
import { answerRequestError } from '@/lib/requests/stages';
import { listAttachments } from '@/lib/master/attachments';
import { businessDate } from '@/lib/businessDate';
import { surveyPackageSizeSendError } from '@/lib/service/packageSizes';
import { loadPackageSizesOrNull } from '@/lib/service/packageSizesRepo';
import { loadSurveyZones } from '@/lib/service/surveyRepo';
import { findSurveyVisit } from '@/lib/service/surveyVisit';
import { surveyDrawingMethodEnabled } from '@/lib/service/surveyDrawingFlag';
import { surveyMethodMix, surveyNeedsVisit } from '@/lib/service/surveyMethod';
import { surveyReportIssueAtSend } from '@/lib/service/surveyReportRows';
import {
  SURVEY_SEND_OLD_PAGE_ERROR, SURVEY_SEND_PREFLIGHT_MS, SURVEY_SEND_REPORT_FAILED, SURVEY_SEND_REPORT_OFF,
  SURVEY_SEND_WARNINGS_CHANGED_ERROR, surveySendCloseBody, surveySendDiffBaseline, surveySendDocumentRefusal,
  surveySendImageRefusal, surveySendMethodError, surveySendMethodText, surveySendReport, surveySendSiteVisitError,
  surveySendUnseenWarnings, surveySendVisitStep, surveySendWrites,
} from '@/lib/service/surveySendClose';
import {
  surveyChangeCounts, surveyChangeText, surveyPackagesText, surveySendError, surveyTotals, surveyTotalsDiff,
} from '@/lib/service/survey';
import { surveySpotSendError } from '@/lib/service/surveySpotPhotos';

export const dynamic = 'force-dynamic';
/* ตัวย่อรูป (sharp) กับตัวต่อ Drive เป็นของ Node · รอบตรวจรูป 60 วิ + รอบเติมหลังล็อก 20 วิ + RPC ⇒ เพดานเท่า cron ที่เดินนานที่สุด */
export const runtime = 'nodejs';
export const maxDuration = 300;

const message = (e) => String(e?.message || e || '').trim();

/**
 * S3 — **รอบตรวจรูปก่อนเขียนอะไรทั้งสิ้น** · คืน `{ refusal, prepared }`
 *
 * 🔴 รูปที่ **ตัวไฟล์เองเปิดไม่ได้** (HEIC ที่ตั้งชื่อ .jpg · JPEG ขาดท้าย · หายจาก Drive) ต้องเจอตอนที่ใบยังแก้ได้ —
 *    หลังตอบใบแล้วหัวหน้าเปลี่ยนไฟล์ไม่ได้ ทางออกเดียวคือดึงผลกลับ ⇒ `refusal` (409 พร้อมชื่อไฟล์)
 * 🔴 Drive ช้า/ล่ม · อัปไม่ขึ้น · หมดงบเวลา · โหลดตัวย่อรูปไม่ได้ · อ่านไฟล์ไม่สำเร็จ = **ไม่ตีกลับ** (ลง log แล้วส่งผลต่อ ·
 *    ขั้นออกเลขเติมรูปที่ขาดเอง ไม่ทันก็กด "ออกเอกสาร" ทีหลัง)
 * ⭐ อ่านผลวัดกับไฟล์ของตัวเองแบบเบา แล้วรอบด่านหกข้ออ่านใหม่อีกครั้ง **หลัง** รอบนี้ — ช่วง "อ่านด่าน → ล็อก" จึงสั้นเท่าเดิม
 *    (ถ้าใช้แถวชุดเดียวกัน ด่านจะตัดสินบนข้อมูลที่เก่าไปได้ถึง 60 วินาที)
 * ⚠️ `prepared` ส่งต่อให้ขั้นออกเลข — ไฟล์ที่เตรียมแล้วไม่ถูกดึงจาก Drive ซ้ำ · เขียนได้อย่างเดียวคือรูป `img/<sha>.jpg`
 *    (อ้างด้วยเนื้อไฟล์ ส่งผลไม่สำเร็จก็ไม่เสียอะไร รอบหน้าใช้ซ้ำ)
 */
async function surveySendPreflight(supabase, requestId) {
  try {
    const zones = await loadSurveyZones(supabase, requestId);
    const lists = await Promise.all(zones.map((z) => listAttachments('service_survey_zone', z.id, supabase)));
    const filesByZone = Object.fromEntries(zones.map((z, i) => [z.id, lists[i] || []]));
    const [{ surveyReportImageFiles }, { prepareSurveyReportImages }] = await Promise.all([
      import('@/lib/service/surveyReportSnapshot'),
      import('@/lib/service/surveyReportImages'),
    ]);
    const prepared = await prepareSurveyReportImages(
      supabase, surveyReportImageFiles({ zones, filesByZone }), { deadline: SURVEY_SEND_PREFLIGHT_MS },
    );
    const failed = Array.isArray(prepared?.failed) ? prepared.failed : [];
    const refusal = surveySendImageRefusal(failed);
    if (refusal) return { refusal, prepared: null };
    if (failed.length) {
      console.warn('[survey-report] รอบตรวจรูปก่อนส่งผลเตรียมไม่ครบ — ส่งผลต่อ ขั้นออกเลขจะเติมให้', requestId,
        failed.map((f) => `${f.fileName || f.attId}: ${f.reason}`).join(' · '));
    }
    return { refusal: null, prepared: prepared || null };
  } catch (e) {
    console.error('[survey-report] รอบตรวจรูปก่อนส่งผลล้ม — ส่งผลต่อ', requestId, message(e));
    return { refusal: null, prepared: null };
  }
}

/**
 * S5 — **เหตุที่เอกสารออกไม่ได้เพราะเนื้อของใบ** · คืนประโยค 409 หรือ `null` (ส่งผลต่อได้)
 *
 * 1. นัดที่ค้างยังเป็นร่าง → ประโยคของ `surveySendVisitStep` เอง (ประโยคเดียวกับที่ลำดับการเขียนตอบ — ถ้าไม่ดักตรงนี้
 *    ตัวตรวจข้างล่างจะแทนด้วย "ไม่พบนัดประเมิน" ซึ่งชี้ผิดทาง) · ใบงานโต๊ะที่ยังมีนัดร่าง/นัดไว้ค้าง = ประโยคของงานโต๊ะ
 *    (`needsVisit` ตัวเดียวกับที่ด่านรูปจุดและลำดับการเขียนใช้ — สามที่ต้องตอบเรื่องนัดตรงกัน)
 * 2. server เจอคำเตือนที่จอไม่ได้ส่งมาใน `seenWarnings` → ให้โหลดหน้าใหม่ (หัวหน้าต้องได้อ่านก่อนเอกสารถูกตรึง)
 * 3. เหตุชนิด `content` ของตัวตรวจ (ผังเป็น PDF/HEIC/BMP · ไม่มีนัดที่ปิด/ไม่มีวัน/ไม่มีผู้ประเมิน · หน้าล้น) → ตีกลับ
 * 🔴 ตัวตรวจอ่านไม่ครบ (`unknown`) หรือโยน = **ข้ามข้อ 2 กับ 3** แล้วลง log — ปัญหาของระบบไม่ขวางการส่งผล
 */
async function surveySendDocumentError(supabase, {
  request, user, zones, filesByZone, open, today, nowIso, seenWarnings, needsVisit,
}) {
  const step = surveySendVisitStep(open, { today, needsVisit });
  if (step.action === 'block') return step.error;
  try {
    const { surveyReportPrecheck } = await import('@/lib/service/surveyReportInputs');
    /* ทะเบียนขนาดไม่ได้ส่งต่อ (ตัวตรวจอ่านเอง) — ด่าน "ขนาดถูกลบ" ข้างบนอ่านแล้วส่งเข้าด่านในคำสั่งเดียว (ยามซอร์สล็อกบรรทัดนั้นไว้) */
    const check = await surveyReportPrecheck(supabase, { request, user, zones, filesByZone, open, today, nowIso });
    const unknown = Array.isArray(check?.unknown) ? check.unknown : ['precheck'];
    if (unknown.length) {
      console.error('[survey-report] ตรวจเอกสารก่อนส่งผลอ่านไม่ครบ — ส่งผลต่อ', request?.docNo || request?.id, unknown.join(' · '));
      return null;
    }
    if (surveySendUnseenWarnings(check.warnings, seenWarnings).length) return SURVEY_SEND_WARNINGS_CHANGED_ERROR;
    return surveySendDocumentRefusal(check.blockers);
  } catch (e) {
    console.error('[survey-report] ตรวจเอกสารก่อนส่งผลล้ม — ส่งผลต่อ', request?.docNo || request?.id, message(e));
    return null;
  }
}

/**
 * S8 — **ออกเลขเอกสารหลังส่งผลสำเร็จ** · คืนคีย์ `report` ของคำตอบ (S9) · ไม่โยน ไม่ทำให้การส่งผลล้ม
 *
 * ⚠️ ขั้นออกเลขสัญญาว่าไม่โยน และเขียน audit ของการล้มเอง — try/catch ตรงนี้กันสิ่งที่อยู่นอกสัญญานั้น
 *    (โหลดโมดูลไม่ได้ · บั๊ก) ซึ่งไม่มีใครเขียน audit ให้ ⇒ เขียนที่นี่ (§12 "ออกเอกสารไม่สำเร็จหลังส่งผล")
 * ⚠️ ไม่เขียนบรรทัดเธรดของเอกสาร — แถวคำตอบของการส่งผลครั้งนี้ยิงกระดิ่งถึงผู้ขอไปแล้ว (มติเจ้าของ 01/10 ข้อ 4)
 */
async function surveySendIssue(supabase, { request, user, closedVisit, prepared, req }) {
  try {
    const { issueSurveyReport, SURVEY_REPORT_IMAGE_BUDGET_MS } = await import('@/lib/service/surveyReportIssue');
    const result = await issueSurveyReport(supabase, {
      request, user, closedVisit: closedVisit || null, via: 'send', prepared,
      deadline: SURVEY_REPORT_IMAGE_BUDGET_MS.send, req,
    });
    return surveySendReport(result);
  } catch (e) {
    const label = request?.docNo || request?.id;
    console.error('[survey-report] ขั้นออกเลขหลังส่งผลล้มนอกสัญญา', label, e?.stack || message(e));
    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: request?.id,
      summary: `ออกเอกสารประเมินไม่สำเร็จหลังส่งผล ${label} — ${SURVEY_SEND_REPORT_FAILED}`,
      request: req,
    });
    return surveySendReport(null);
  }
}

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    if (!canSendSurveyResult(user)) return forbidden('ส่งผลประเมินได้เฉพาะหัวหน้าฝ่ายบริการ');

    const { data: request, error: reqError } = await supabase
      .from('dept_requests').select('*').eq('id', id).maybeSingle();
    if (reqError) return fail(reqError.message, 500);
    if (!request) return notFound('ไม่พบใบคำร้อง');

    // ด่านของระบบคำร้อง — ใบต้องเป็นของฝ่ายเรา และยังเปิดอยู่
    if (!canAnswerRequest(user, request)) return forbidden(`ตอบได้เฉพาะฝ่าย ${request.dept}`);
    const stageError = answerRequestError(request);
    if (stageError) return conflict(stageError);

    const body = await req.json().catch(() => ({}));
    /* 🔑 ถามสวิตช์ครั้งเดียวต่อคำขอ — ทุกกิ่งของเอกสารข้างล่างอ่านค่านี้ (ปิด = เส้นเดิมทุกก้าว) */
    const issueAtSend = surveyReportIssueAtSend();

    /* S2 — จอรุ่นเก่า (ไม่รู้ว่าการส่งผลออกเอกสารด้วย) ไม่ส่ง `seenWarnings` มา ⇒ ตีกลับ **ก่อนอ่านอะไรเพิ่ม**
       จอรุ่นเก่าจึงไม่ต้องรอรอบตรวจรูปเพื่อมาเจอคำตอบเดียวกัน */
    if (issueAtSend && !Array.isArray(body?.seenWarnings)) return conflict(SURVEY_SEND_OLD_PAGE_ERROR);

    /* S3 — รอบตรวจรูป **ก่อน** อ่านด่านหกข้อ: รูปที่เปิดไม่ได้ตีกลับตรงนี้ (ยังไม่ได้เขียนอะไร นัดยังเปิด) */
    let prepared = null;
    if (issueAtSend) {
      const preflight = await surveySendPreflight(supabase, id);
      if (preflight.refusal) return conflict(preflight.refusal);
      prepared = preflight.prepared;
    }

    /* 🔑 **ด่านหกข้อ — ตัวเดียวกับที่ปุ่มบนจอใช้** · ต้องอ่านไฟล์จริงมานับ
       ⚠️ ไม่มีไฟล์ = ยังไม่มีรูป ⇒ ปฏิเสธ (fail-closed) ไม่ใช่ปล่อยผ่านตอนไม่รู้ */
    const zones = await loadSurveyZones(supabase, id);
    /* 🔑 **ใบนี้ต้องมีนัดลงหน้างานไหม** (ประเมินจากแบบ · mig 0408) — คิดจากแถวที่ด่านใช้ตัดสินชุดเดียวกันนี้ ครั้งเดียว
       แล้วส่งให้ทุกที่ที่ถามเรื่องนัดข้างล่าง (ด่านรูปจุด · ด่านนัดเข้าพื้นที่ · ตัวตรวจเอกสาร · ลำดับการเขียน)
       ⚠️ ใบลงหน้างานล้วน = `true` เสมอ ⇒ ทุกกิ่งข้างล่างเดินเหมือนก่อนมีวิธีประเมิน */
    const needsVisit = surveyNeedsVisit(zones);
    /* 🔑 **ใบที่มีพื้นที่จากแบบ: จอต้องเห็นสัดส่วนวิธีประเมินชุดเดียวกับแถวนี้ และหัวหน้าต้องเลือกแล้วว่าต้องยืนยันหน้างานไหม**
          (งวด S2a · `surveySendMethodError`) — ก่อนด่านหกข้อ ก่อนเขียนอะไรทั้งนั้น
       ⭐ **ไม่อยู่ใต้สวิตช์** — ตัดสินจากแถว · ใบลงหน้างานล้วนที่ไม่ส่งสองคีย์นี้มา (ทุกจอของวันนี้) ได้ `null` เดินต่อเหมือนเดิม
       ⚠️ สัดส่วนไม่ตรง = 409 ให้โหลดใหม่ (ด่านบนจอเป็นของวิธีเก่า) · ยังไม่เลือก = 400 */
    const methodMix = surveyMethodMix(zones);
    const methodError = surveySendMethodError(zones, { methodMix: body?.methodMix, surveyConfirm: body?.surveyConfirm });
    if (methodError) return methodError.status === 400 ? badRequest(methodError.error) : conflict(methodError.error);
    const files = await Promise.all(
      zones.map((z) => listAttachments('service_survey_zone', z.id, supabase)),
    );
    const filesByZone = Object.fromEntries(zones.map((z, i) => [z.id, files[i] || []]));
    const gate = surveySendError(zones, filesByZone, { canSend: true });
    if (gate) return conflict(gate);
    /* 🔑 **ขนาดที่เคาะไว้ยังอยู่ในทะเบียนไหม** (mig 0398 · มติ 01/10 "เพิ่ม ลบ ได้") — พื้นที่เก็บรหัสเป็นภาพนิ่ง ⇒ ขนาดที่ถูกลบ
       หลังเคาะต้องเลือกใหม่ก่อนส่ง (ฝ่ายขายเอารหัสนี้ไปตั้งราคา) · ตัวเดียวกับแถวด่านบนการ์ด
       ⚠️ อ่านทะเบียนไม่สำเร็จ = `null` ⇒ ปฏิเสธ (fail-closed) · ก่อนเขียนอะไรทั้งนั้น เหมือนด่านรูปจุดข้างล่าง */
    const sizeGate = surveyPackageSizeSendError(zones, await loadPackageSizesOrNull(supabase));
    if (sizeGate) return conflict(sizeGate);

    const nowIso = new Date().toISOString();
    const today = businessDate(nowIso);

    /* 🔑 **ด่านรูปจุด (มติ 01/10 · G2)** — รูปในถาด "ยังไม่ได้ผูกจุด" = ส่งผลไม่ได้ · ตัวเดียวกับแถวด่านบนการ์ด
       ⭐ ส่งผลที่ปิดนัดที่ยังเปิด (มติ 24/09 ข้อ 2) = ส่งงานแทนช่าง ⇒ G1 "ทุกจุดมีรูป" มาด้วย — ปิดนัดหรือไม่ถาม
          `surveySendVisitStep` ตัวเดียวกับที่ `surveySendWrites` ใช้ปิดจริงและที่การ์ดใช้บอกโมดัล
       ⚠️ ก่อนเขียนอะไรทั้งนั้น — ตีกลับหลังปิดนัดแล้ว = นัด "เข้าแล้ว" ทั้งที่ใบยังไม่ได้ส่ง */
    const open = await findSurveyVisit(supabase, id, { openOnly: true });
    const closesVisit = surveySendVisitStep(open, { today, needsVisit }).action === 'close';
    const spotGate = surveySpotSendError(zones, filesByZone, { closesVisit });
    if (spotGate) return conflict(spotGate);

    /* 🔑 **ด่านนัดเข้าพื้นที่ (ประเมินจากแบบ แถว 17a)** — ใบที่ยังมีพื้นที่ลงหน้างาน ต้องมีนัดที่เข้าพื้นที่แล้ว
          (เข้าแล้ว · ทำไม่ครบ) หรือการส่งผลนี้ปิดนัดที่ยังเปิดให้ · ไม่งั้น 409 พร้อมทางออกสองทาง (`surveySendSiteVisitError`)
       ⭐ **ทำงานเฉพาะตอนเปิดสวิตช์ `SURVEY_DRAWING_METHOD`** — คำปฏิเสธนี้ต้องมาพร้อมปุ่มสลับวิธีประเมิน (ทางออกที่ซื่อตรง)
          ปิดอยู่ = ไม่อ่าน ไม่ตรวจ เส้นเดิมทุกก้าว
       ⚠️ อ่านไม่สำเร็จ = 500 (supabase ไม่ throw) — ปล่อยผ่านตอนไม่รู้ = ด่านเปิดเอง · ตอบ 409 ตอนไม่รู้ = โทษใบที่อาจมีนัดครบ
       ⚠️ ก่อนเขียนอะไรทั้งนั้น เหมือนด่านรูปจุดข้างบน */
    if (surveyDrawingMethodEnabled()) {
      const { data: reached, error: reachedError } = await supabase
        .from('service_visits').select('id, status')
        .eq('requestId', id).in('status', ['done', 'partial']).limit(1);
      if (reachedError) return fail(reachedError.message, 500);
      const siteVisitGate = surveySendSiteVisitError(zones, {
        reachedSite: Array.isArray(reached) && reached.length > 0, closesVisit,
      });
      if (siteVisitGate) return conflict(siteVisitGate);
    }

    /* S5 — เรื่องของเอกสารที่ตีกลับได้ ต้องตีกลับ **ตรงนี้** (ก่อนปิดนัด/ตอบใบ) · หลังบรรทัดนี้ไม่มีอะไรของเอกสารตีกลับอีก */
    if (issueAtSend) {
      const documentError = await surveySendDocumentError(supabase, {
        request, user, zones, filesByZone, open, today, nowIso, seenWarnings: body.seenWarnings, needsVisit,
      });
      if (documentError) return conflict(documentError);
    }

    const patch = {
      answeredAt: nowIso,
      answeredById: user?.id ?? null,
      answeredByName: user?.name ?? null,
      /* ⭐ สถานะมาจากตัวตัดสินกลาง ไม่ใช่เขียน `'answered'` เอง — ใบที่ SA กดปิดไปก่อน (ใบเก่าก่อนมติ
         24/09 ข้อ 3) จะกลายเป็น `closed` ทันทีตรงนี้ */
      status: closureStatus({ status: request.status, answeredAt: nowIso, closedAt: request.closedAt }),
      updatedAt: nowIso,
    };
    /* คำตอบ "ต้องยืนยันหน้างานไหม" ลงใบ **เฉพาะใบที่มีพื้นที่จากแบบ** (ด่านข้างบนรับรองแล้วว่าเป็นหนึ่งในสองค่าที่ฐานรับ)
       ⚠️ ใบลงหน้างานล้วนไม่ส่งคีย์นี้เลย — คำสั่งตอบใบเท่าเดิมทุกคีย์ · ดึงผลกลับ / "ยังไม่จบ" ล้างคอลัมน์นี้ไว้แล้ว */
    if (methodMix.drawing > 0) patch.surveyConfirm = body?.surveyConfirm;

    /* ── ปิดนัดที่ยังเปิด (มติ 24/09 ข้อ 2) → ตอบใบ · ลำดับอยู่ใน `surveySendWrites` ที่เดียว ──────────
       ⭐ นัดที่ส่งผลจะปิด = นัดที่ยังกินสิทธิ์ของใบ (ร่าง = ตีกลับพร้อมทางออก) · ต้องตรงกับที่โมดัลบอกผู้ใช้
          (`closeVisitId` · ไม่ตรง = 409 ให้โหลดใหม่) · `open` อ่านไว้แล้วตอนด่านรูปจุด (ตัวเดียวกัน ไม่อ่านซ้ำ) */
    const written = await surveySendWrites(supabase, {
      requestId: id,
      open,
      closeVisitId: body?.closeVisitId ?? null,
      answerPatch: patch,
      today,
      nowIso,
      needsVisit,
      /* 🔑 ส่งผลได้เฉพาะแถวที่ยังเป็นตัวเดียวกับที่อ่านมาตอนต้น (ประเมินจากแบบ แถว 19 ②) — เส้นสลับวิธีประเมินแตะ
         `updatedAt` ของใบเป็นก้าวแรก ⇒ สลับระหว่าง "อ่านด่าน" กับ "ตอบใบ" = 409 ให้โหลดใหม่ ไม่ใช่ตอบด้วยด่านของวิธีเก่า
         ⭐ **ผูกเฉพาะตอนเปิดสวิตช์ `SURVEY_DRAWING_METHOD`** — ปิดอยู่ไม่มีเส้นไหนสลับวิธีได้ จึงไม่มีอะไรให้กัน
            และการผูกไม่ฟรี: คำสั่งเขียนอื่นที่แตะใบระหว่างส่ง (ลงคิว · ซิงก์วันจากนัด) จะทำให้การส่งผลของใบ
            ลงหน้างานตีกลับด้วยประโยคเรื่องวิธีประเมิน ที่ผู้ใช้ยังมองไม่เห็น ⇒ ปิดอยู่ = คำสั่งเดิมทุกตัวอักษร */
      expectUpdatedAt: surveyDrawingMethodEnabled() ? (request.updatedAt ?? null) : null,
      /* ⭐ ปิดทางนี้ต้องอ่านออกจากเธรดของนัด — ไม่งั้นนัดที่ไม่มีเวลาจบดูเหมือนระบบทำหาย
         ⚠️ ไม่ยิงกระดิ่ง "ช่างส่งงานแล้ว" — คนกดคือหัวหน้าเอง · ไม่ซิงก์วันกลับใบ — นัดที่ปิดไม่กินสิทธิ์ใบแล้ว
         ⚠️ `appendUpdate`/`recordAudit` กลืน error เอง — เขียนประวัติพลาดต้องไม่ลากการส่งผลล้มตาม */
      onVisitClosed: async (closedVisit, beforeVisit) => {
        await appendUpdate(supabase, {
          entityType: 'service_visit', entityId: closedVisit.id, kind: 'done',
          body: surveySendCloseBody(closedVisit, user),
          /* ⭐ ตราว่านัดนี้ปิดพร้อมการส่งผล (S6) — เอกสารประเมินอ่านตรานี้เพื่อพิมพ์ว่าเวลาจบที่ไม่มี = "ไม่ได้กดส่งงาน"
             ไม่ใช่ระบบทำหาย · นัดที่ปิดก่อน PR-2 ไม่มีตรา ⇒ ตัวอ่านถอยไปดูคำขึ้นต้นของข้อความ (`surveySendCloseBody`) */
          meta: { closedBySend: true },
          user,
        });
        await recordAudit({
          user, action: 'update', entityType: 'service_visit', entityId: closedVisit.id,
          before: beforeVisit, after: closedVisit,
          summary: `ปิดนัดประเมิน ${closedVisit.code || closedVisit.id} พร้อมส่งผล ${request.docNo || id}`,
          request: req,
        });
      },
    });
    if (written.error) return fail(written.error, written.status || 500);
    const { request: data, closedVisit } = written;

    /* สรุปที่เขียนลง audit ต้องบอก **ตัวเลขที่ส่งออกไป** ไม่ใช่แค่ "ส่งผลแล้ว" —
       ใบนี้คือของที่ SA เอาไปตั้งราคา ⇒ ต้องย้อนได้ว่าตอนส่งบอกไปเท่าไร */
    const totals = surveyTotals(zones);
    // "ที่ขอไป" เทียบ "ที่ได้กลับมา" — ตัวสร้างข้อความเดียวกับที่ขึ้นบนจอทั้งสองฝั่ง
    const change = surveyChangeCounts(zones);
    /* ท่อนของใบที่มีพื้นที่จากแบบ (" · จากแบบ 2 พื้นที่ (…) · ต้องยืนยันหน้างาน") — ต่อหลังแพ็คเกจทั้งในเธรดและ audit
       · ใบลงหน้างานล้วน = '' ⇒ สองบรรทัดข้างล่างเท่าเดิมทุกตัวอักษร */
    const methodText = surveySendMethodText(zones, body?.surveyConfirm);

    /* 🔴 **บรรทัดในเธรดคือตัวที่แจกกระดิ่ง** — `appendUpdate` เรียก `notifyThreadUpdate`
       ต่อให้เองเสมอ (lib/master/updates.js) ⇒ ไม่เขียนเธรด = ผู้ขอไม่มีทางรู้ว่าผลมาแล้ว
       🐞 เส้นนี้ถูกเขียนใหม่เพื่อเลี่ยงด่านหกข้อ แล้วก๊อปกติกาสถานะมาครบ
         (`answerRequestError` · `closureStatus`) **แต่ลืมก๊อปบรรทัดนี้ตามมา**
         ⇒ TS กดส่งผล ใบพลิกเป็น "ตอบแล้ว" จริง แต่ฝั่งฝ่ายขายเงียบสนิท
         (โรคเดียวกับที่ `costingUpdates.js` บันทึกไว้ว่าเคยเกิดมาแล้วครั้งหนึ่ง)
       ⚠️ **ส่งแถวหลังอัปเดต (`data`) ไม่ใช่ `request`** — ข้อความอ่าน `closedAt`
         มาตัดสินว่า "ปิดครบสองฝั่ง" หรือ "รอผู้ขอปิดเรื่อง" · ส่งแถวเก่าไปจะบอกผิด
       ⚠️ วางไว้ **หลัง** update สำเร็จ และไม่ให้ล้มลากปุ่มส่งล้มตาม — ทั้ง `appendUpdate`
         และ `notifyThreadUpdate` กลืน error เองอยู่แล้ว (fire-and-forget ทั้งสาย) */
    /* 🔴 **ส่งรอบใหม่ ต้องบอกส่วนต่างเก่า→ใหม่** (§5E ④)
       จุดอันตรายที่สุดของทั้งแผน: SA อาจเอาตัวเลขผิดไปเสนอราคาไปแล้ว ⇒ ข้อความว่า
       "ใบถูกแก้" เฉย ๆ ไม่พอ
       ⭐ **ฐาน = ยอดของรอบที่ตอบล่าสุด** (สเปก PR-2 §2 S7 · `surveySendDiffBaseline`) — แถว `answer` พกยอดที่ส่งออกไป
          (ข้างล่าง) · แถว `recall` พกยอด ณ ตอนดึงกลับ ⇒ อ่านสองชนิดใหม่ก่อน แล้วใช้แถวแรกที่มียอด
          🐞 เดิมอ่านแถว `recall` แถวเดียว ⇒ รอบที่ถูกเปิดกลับด้วย "ยังไม่จบ" (ไม่เขียนยอดไว้) เทียบกับรอบที่เก่ากว่านั้น
             หรือไม่เทียบเลย — ฝ่ายขายได้ส่วนต่างจากตัวเลขที่เขาไม่ได้ถืออยู่แล้ว
       ⚠️ ไม่มีแถวที่มียอด = ส่งรอบแรก ⇒ ไม่มีอะไรให้เทียบ (ปกติ ไม่ใช่ข้อผิดพลาด)
       ⚠️ supabase ไม่ throw — ต้องอ่าน `{ error }` เอง (try/catch เดิมไม่เคยทำงานสักครั้ง) · อ่านไม่ได้ = ส่งโดยไม่มีส่วนต่าง
          และลง log · try/catch ที่เหลือกันเฉพาะ client ที่โยนเอง: ใบตอบไปแล้ว ห้ามลากปุ่มส่งล้มเพราะเรื่องข้อความ */
    let diff = [];
    try {
      const { data: rounds, error: roundsError } = await supabase
        .from('entity_updates')
        .select('kind, meta, "createdAt"')
        .eq('entityType', 'dept_request').eq('entityId', id).in('kind', ['answer', 'recall'])
        .order('createdAt', { ascending: false }).limit(20);
      if (roundsError) {
        console.error('[survey] อ่านยอดของรอบก่อนไม่สำเร็จ — ส่งผลโดยไม่มีส่วนต่าง', request.docNo || id, roundsError.message);
      } else {
        diff = surveyTotalsDiff(surveySendDiffBaseline(rounds), totals);
      }
    } catch (e) {
      console.error('[survey] อ่านยอดของรอบก่อนไม่สำเร็จ — ส่งผลโดยไม่มีส่วนต่าง', request.docNo || id, message(e));
    }

    await appendRequestEvent(supabase, {
      request: data,
      action: 'answer',
      user,
      opts: {
        /* ผู้ขอรอ "ตร.ม. กี่แพ็คเกจ ขนาดไหน" เพื่อเอาไปตั้งราคา ⇒ ให้อ่านจากกระดิ่งได้เลย ("2 แพ็คเกจ (SM 1 · ST 1)")
           🔴 **สิ่งที่ TS ตัด/เพิ่มเองต้องอยู่ในกระดิ่ง ไม่ใช่ให้ไปเจอเองในตาราง** (แผน §9
             ข้อ 3) — TS ทำได้โดยไม่ต้องขออนุมัติ ⇒ จังหวะที่ SA จะรู้เรื่องมีจังหวะนี้
             จังหวะเดียว และเขาคือคนที่เอาตัวเลขนี้ไปตั้งราคาต่อ
           ⚠️ **ข้อความเดียวกับที่ขึ้นบนจอทั้งสองฝั่ง** (`surveyChangeText`) — เขียนคนละที่
             เมื่อไร กระดิ่งกับจอจะนับคนละแบบ แล้วไม่มีใครรู้ว่าอันไหนจริง
           ⚠️ เงียบเมื่อไม่มีอะไรเปลี่ยน — "ไม่มีตัด ไม่มีเพิ่ม" ซ้ำกับเลขพื้นที่ที่อยู่ต้นบรรทัด */
        summary: `${totals.zones} พื้นที่ · ${totals.areaSqm} ตร.ม. · ${surveyPackagesText(totals)}${methodText}`
          + (change.cut || change.added ? ` — ${surveyChangeText(change, { actor: 'TS' })}` : '')
          + (diff.length ? ` · ⚠️ แก้จากรอบก่อน: ${diff.join(' · ')}` : ''),
        /* ⭐ ยอดที่ส่งออกไปรอบนี้ → `meta.totals` ของแถวคำตอบ (S7) — ฐานของส่วนต่างรอบถัดไป แม้รอบนี้จะจบด้วย "ยังไม่จบ"
           ⭐ ใบที่มีพื้นที่จากแบบพกอีกสองคีย์ (จำนวนพื้นที่จากแบบ · คำตอบเรื่องยืนยันหน้างาน) — `surveyTotalsDiff` อ่านเฉพาะคีย์
              ที่ระบุชื่อ จึงไม่เกิดบรรทัดส่วนต่างจากสองคีย์นี้ · ใบลงหน้างานล้วนส่ง `totals` ตัวเดิม (ออบเจ็กต์เดียวกัน) */
        totals: methodMix.drawing > 0
          ? { ...totals, drawingZones: methodMix.drawing, surveyConfirm: body?.surveyConfirm }
          : totals,
      },
    });

    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id,
      before: request, after: data,
      summary: `ส่งผลประเมิน ${request.docNo || id} — ${totals.zones} พื้นที่ · `
        + `${totals.areaSqm} ตร.ม. · ${surveyPackagesText(totals)}${methodText}`
        + (change.cut || change.added ? ` · ${surveyChangeText(change, { actor: 'TS' })}` : '')
        + (data.status === 'closed' ? ' · ปิดครบสองฝั่ง' : '')
        + (closedVisit ? ` · ปิดนัด ${closedVisit.code || closedVisit.id}` : ''),
      request: req,
    });
    /* S8 — ออกเลขเอกสาร **หลัง** กระดิ่งและ audit (มติเจ้าของ 01/10 ข้อ 1) · ฝ่ายขายได้ผลไปแล้ว ⇒ ตรงนี้ล้มยังไงก็ตอบ 200
       ⚠️ ไม่มีอะไรใหม่คั่นระหว่าง "ตอบใบ" กับ "กระดิ่ง" — รูปที่เตรียมไว้ (`prepared`) มาจากรอบตรวจก่อนเขียน */
    const report = issueAtSend
      ? await surveySendIssue(supabase, { request: data, user, closedVisit, prepared, req })
      : SURVEY_SEND_REPORT_OFF;
    // จอบอกผลที่เกิดกับนัดด้วย — "ส่งผลแล้ว" เฉย ๆ ไม่บอกว่านัดบนตารางช่างปิดแล้ว · `report` = ผลของเอกสาร (S9 · จอรุ่นเก่าไม่อ่าน)
    return ok({ request: data, totals, closedVisit: closedVisit || null, report });
  } catch (e) {
    return fail(e.message, 500);
  }
});
