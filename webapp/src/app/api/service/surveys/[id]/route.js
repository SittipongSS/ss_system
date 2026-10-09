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
import { canOpenRequestPage, canOpenSurveySheet, surveyReadError } from '@/lib/service/surveyAccess';
import { listAttachments } from '@/lib/master/attachments';
import { loadPackageSizesOrNull } from '@/lib/service/packageSizesRepo';
import { loadSurveyCrew, loadSurveySheetContext, loadSurveyZones } from '@/lib/service/surveyRepo';
import { surveySendBackOnSheet } from '@/lib/service/survey';
/* ประเมินจากแบบ (mig 0408 · งวด S2a) — สวิตช์อ่านผ่านตัวอ่านกลางตัวเดียว · จอรู้ค่าจาก payload ของเส้นนี้เท่านั้น */
import { surveyDrawingMethodEnabled } from '@/lib/service/surveyDrawingFlag';
import { surveyMethodMix, surveyNeedsVisit } from '@/lib/service/surveyMethod';
/* ⚠️ เอกสารประเมิน: import ได้เฉพาะตัวอ่านแถว (`surveyReportRows`) — ช่างเปิดเส้นนี้ทุกครั้งที่บันทึกหน้างาน
   ⇒ ห้ามลาก sharp / chromium / ตัวเรนเดอร์เข้ามาที่หัวไฟล์ (สเปก PR-2 มติ 24 · ด่าน `check-doc-tracing.mjs`) */
import { surveyDocumentSummary } from '@/lib/service/surveyReportRows';
import { loadSurveyRequestFiles } from '@/lib/service/surveyRequestFiles';
import { loadSurveyThreadFiles } from '@/lib/service/surveyThreadFiles';
import { surveySpotLinkDecision } from '@/lib/service/surveySpotPhotos';
import { findSurveyVisit } from '@/lib/service/surveyVisit';
import { visitWriteAccess } from '@/lib/service/visitAccess';

export const dynamic = 'force-dynamic';

const isOnVisit = (user, visit) => {
  if (!user?.id || !visit) return false;
  const crew = [visit.assigneeId, ...(Array.isArray(visit.assistantIds) ? visit.assistantIds : [])];
  return crew.filter(Boolean).map(String).includes(String(user.id));
};

const NO_THREAD_FILES = Object.freeze({ files: [], unknown: false });

/**
 * ใบนี้มีนัดที่ **เข้าพื้นที่แล้ว** (เข้าแล้ว · ทำไม่ครบ) อย่างน้อยหนึ่งนัดไหม — `true` / `false` · อ่านไม่สำเร็จ = `null`
 * ⭐ คำถามเดียวกับด่านแถว 17a ของ route ส่งผล (ตาราง · ตัวกรอง · ชุดสถานะเดียวกัน) — การ์ดเอาไปบอกล่วงหน้าว่า
 *    พื้นที่ลงหน้างานยังไม่มีนัดที่เข้าพื้นที่ · สองที่ถามไม่เหมือนกันเมื่อไร การ์ดบอกอย่าง route ตอบอีกอย่าง
 * ⚠️ `null` ≠ `false` — อ่านไม่สำเร็จไม่ใช่ "ไม่มีนัด": การ์ดไม่ขึ้นบรรทัดเตือน แล้วให้ route ส่งผลเป็นคนตัดสิน
 *    (supabase ไม่ throw ⇒ อ่าน `{ error }` เอง) · ไม่ตีทั้งเส้นเป็น 500 เพราะผลวัดอ่านได้แล้ว
 */
async function loadSiteVisitReached(supabase, requestId) {
  const { data, error } = await supabase
    .from('service_visits').select('id')
    .eq('requestId', requestId).in('status', ['done', 'partial']).limit(1);
  if (error) {
    console.error('[survey] อ่านนัดที่เข้าพื้นที่แล้วของใบไม่สำเร็จ', requestId, error.message);
    return null;
  }
  return Array.isArray(data) && data.length > 0;
}

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
    /* 🔑 ใบนี้ยังต้องมีนัดลงหน้างานไหม — ตัดสินจากแถวพื้นที่ (`surveyNeedsVisit`) ไม่ขึ้นกับสวิตช์ */
    const needsVisit = surveyNeedsVisit(zones);

    /* ── ประเมินจากแบบ (งวด S2a) — ของที่การ์ดของ **หัวหน้า** ต้องใช้เพิ่ม ─────────────────
       `drawingMethodEnabled`  ค่าสวิตช์ `SURVEY_DRAWING_METHOD` — ตอบทุกคนเสมอ (จออ่าน env ฝั่ง server ไม่ได้)
       ไฟล์ในเธรด              สวิตช์เปิด **หรือ** ใบมีพื้นที่จากแบบอยู่แล้ว — แถวที่เป็นจากแบบไปแล้วต้องเดินต่อได้
                               แม้สวิตช์ถูกปิดทีหลัง (หัวหน้ายังต้องเห็นแบบที่ฝ่ายขายส่งมาในเธรด)
       นัดที่เข้าพื้นที่แล้ว      สวิตช์เปิด และใบยังไม่ส่งผล — ป้อนบรรทัดเตือนแถว 17a ของการ์ด (ด่านนั้นอยู่ใต้สวิตช์)
       🔴 **ช่าง / ผู้จัดคิว ไม่ทำให้เกิดการอ่านเพิ่มสักคำขอ** — ช่างเปิดเส้นนี้ทุกครั้งที่บันทึกหน้างาน
       ⚠️ `canDecide` ย้ายขึ้นมาตรงนี้ (เดิมอยู่หลังก้อนอ่าน) เพราะสองคำสั่งอ่านข้างล่างต้องรู้ก่อนยิง */
    const canDecide = canSendSurveyResult(user);
    const drawingMethodEnabled = surveyDrawingMethodEnabled();
    const wantsThreadFiles = canDecide && (drawingMethodEnabled || surveyMethodMix(zones).drawing > 0);
    const wantsSiteVisit = canDecide && drawingMethodEnabled && !request.answeredAt;

    /* ── ทุกอย่างที่เหลือของใบ ยิงพร้อมกันรอบเดียว ────────────────────────────
       ① ไฟล์ของแต่ละพื้นที่ — ด่านนับรูปต้องการของจริง ไม่ใช่ตัวเลขที่จอเดา
          ⚠️ ยิงรายพื้นที่ **ขนานกัน** — ใบหนึ่งมีสิบพื้นที่ ยิงเรียงกันคือรอสิบรอบ
          ⚠️ ใบที่ยังไม่มีพื้นที่เลย = `[]` ไม่ใช่ error (ร่างที่เพิ่งเปิด)
       ② นัดของใบ — ที่เดียวที่บอกว่า "ใครไป" ⇒ ด่านเขียนของช่างอ่านจากตัวนี้
          ⭐ `preferOpen` — นัดที่ยังค้างมาก่อนใบล่าสุด: โมดัลส่งผลบอกว่าจะปิดนัดไหน และ route ส่งผลปิด
             **นัดที่ค้าง** (มติ 24/09) ⇒ จอต้องถือนัดตัวเดียวกัน ไม่งั้นส่งผลโดน 409 "นัดเปลี่ยนไป" ทุกครั้ง
       ③ ของประกอบใบที่การ์ดควบคุมและหัวใบต้องใช้ (PR2):
          ไซต์ (รหัส/ชื่อ/ที่อยู่/ผู้ติดต่อ · ช่วงเข้าไซต์/เงื่อนไขการเข้า/ลิงก์แผนที่ ของหัวงาน §10.5 S5) ·
          รหัส ZN ของแต่ละพื้นที่ · รหัส AR ของลูกค้า ·
          แถว "ดึงผลกลับ" ล่าสุด
          🔴 **ชิ้นไหนอ่านไม่สำเร็จ ตอบ `unknown.<ชิ้น>` ไม่ใช่ปล่อยว่างเงียบ** — ใบที่อ่าน
             ไซต์ไม่สำเร็จกับใบที่ไม่มีไซต์ต้องหน้าตาไม่เหมือนกันบนจอ (`ไม่ทราบ` vs ขีด)
          ⚠️ ไม่ตีกลับทั้งเส้นเมื่อชิ้นประกอบล้ม — ผลวัดซึ่งเป็นเนื้อหลักของจออ่านได้แล้ว
             ตีกลับ 500 = ช่างที่ยืนอยู่หน้างานเปิดใบไม่ได้เพราะที่อยู่ไซต์อ่านไม่ออก
          ⚠️ ตัวโหลดเติม `zoneCode` ลงแถว `zones` ให้ในที่ (อ่านสดจากทะเบียน ไม่ประทับลงแถว)
       ④ ทีมบนนัด (§10.5 S5) — ชื่อผู้ช่วยต้องรู้ก่อนว่านัดไหน ⇒ **ต่อท้ายนัดในสายเดียวกัน** ไม่ใช่รอทั้งก้อน
          (ใบที่ไม่มีผู้ช่วยไม่ยิงอะไรเพิ่มเลย) · ล้มรายคน = `unknown.crew` ไม่ใช่ 500
       ⑤ ไฟล์แนบของคำร้อง (PR-S · แผน crew Q6) — ช่างอ่านอย่างเดียว เปิดผ่าน proxy เดิม ไม่มีลิงก์ไปหน้าคำร้อง
          ⭐ ตัวโหลดถามด่านอ่านตัวเดียวกับ proxy ก่อน ⇒ ลิสต์เท่ากับที่เปิดได้ · พัง = `unknown.requestFiles`
       ⑥ ทะเบียนขนาดแพ็คเกจ (mig 0398) — แถบ "ขนาด" ของแท็บสรุปส่งผล · ที่ระบบเสนอ · ด่าน "ขนาดถูกลบ" ของการ์ด
          ⚠️ อ่านไม่สำเร็จ = `null` (ไม่ใช่ `[]`) ⇒ การ์ดบล็อกส่งผลด้วยเหตุเดียวกับ route ส่งผล ไม่ใช่บอกว่าขนาดถูกลบ
       ⑦ เอกสารประเมินของใบ (mig 0401 · สเปก PR-2 §10) — สรุปตามสิทธิ์ของคนดู ออกเป็นคีย์ `document`
          🔴 **ช่าง / Planner ได้ `{ access: 'none' }` เป๊ะ และไม่มีการอ่านแถวเอกสารเลย** — ตัวสรุปตัดสิทธิ์ก่อนแตะฐาน
          ⭐ `withChecks` — หัวหน้าฝ่ายได้ผลตรวจของ server เอง (`send` · `issue`): นัด/ทะเบียนโซน/ข้อมูลบริษัทที่เส้นนี้ถือ
             ไม่พอประกอบด่านเดียวกับเส้นส่งผล ⇒ จอแค่พิมพ์ผล ไม่ประกอบด่านเอง
          ⚠️ ส่ง `zones` ที่อ่านไว้แล้วให้ (ไม่อ่านซ้ำ) · ไฟล์/ทะเบียนขนาด/นัด ไม่ส่ง — กำลังอ่านขนานอยู่ในรอบเดียวกันนี้
             จะส่งได้ต้องรอให้เสร็จก่อน = เพิ่มรอบเดินทางให้ทุกคนที่มีสิทธิ์เอกสาร · ตัวตรวจอ่านเองเฉพาะตอนต้องตรวจ
          ⚠️ สรุปล้ม = `{ access: 'none', unknown: true }` ไม่ใช่ 500 (เหตุผลเดียวกับ ③ — ผลวัดอ่านได้แล้ว)
       ⑧ ไฟล์ในเธรดของคำร้อง + "มีนัดที่เข้าพื้นที่แล้วไหม" (ประเมินจากแบบ งวด S2a) — เฉพาะหัวหน้า ตามเงื่อนไขข้างบน
          ไม่เข้าเงื่อนไข = ค่าตั้งต้น **โดยไม่ยิงอ่าน** · เธรดอ่านพัง = `unknown.threadFiles` · นัดอ่านพัง = `null`

       ⭐ **ไม่มีก้อนไหนรอผลของอีกก้อน ⇒ ยิงขนานกัน** — จอนี้ถูกโหลดใหม่ทุกครั้ง
          ที่บันทึก/ส่ง/ดึงกลับ และทุกครั้งที่สลับกลับมาที่แท็บ (`useRevalidateOnFocus`)
          ⇒ รอบเดินทางที่เพิ่มมาหนึ่งรอบ คือรอบที่ช่างรอทุกครั้งที่กดบันทึกหน้างาน
       ⚠️ `findSurveyVisit` ยัง throw ได้เหมือนเดิม ⇒ ทั้งเส้นยังเป็น 500 เท่าเดิม
          (ตั้งใจ: มันเป็นด่านตัดสิน `canWrite` — เดาแทนไม่ได้ ต้อง fail-closed) */
    const [
      files, [visit, crewRes], context, requestFiles, packageSizes, reportDoc, threadFiles, siteVisitReached,
    ] = await Promise.all([
      Promise.all(zones.map((z) => listAttachments('service_survey_zone', z.id, supabase))),
      findSurveyVisit(supabase, id, { preferOpen: true })
        .then(async (found) => [found, await loadSurveyCrew(supabase, found, { viewerId: user?.id })]),
      loadSurveySheetContext(supabase, request, zones),
      loadSurveyRequestFiles(supabase, request, user),
      loadPackageSizesOrNull(supabase),
      surveyDocumentSummary(supabase, request, user, { withChecks: true, zones }).catch((e) => {
        console.error('[survey] สรุปเอกสารประเมินของใบล้ม', id, e?.message || e);
        return { access: 'none', unknown: true };
      }),
      wantsThreadFiles ? loadSurveyThreadFiles(supabase, request, user) : NO_THREAD_FILES,
      wantsSiteVisit ? loadSiteVisitReached(supabase, id) : null,
    ]);
    const filesByZone = Object.fromEntries(zones.map((z, i) => [z.id, files[i] || []]));
    if (crewRes.unknown) context.unknown.crew = true;
    if (requestFiles.unknown) context.unknown.requestFiles = true;
    if (threadFiles.unknown) context.unknown.threadFiles = true;

    // ⚠️ ส่ง `canWrite` มาจาก server ไม่ให้จอคำนวณเอง (จอไม่รู้ user id ของตัวเอง)
    const canEditAll = canEditService(user);
    const access = (canEditAll || canDoFieldWork(user))
      ? visitWriteAccess({ user, visit, canEditAll })
      : { ok: false, error: null };

    return ok({
      request,
      zones,
      filesByZone,
      /* นัดของใบ — `select('*')` อยู่แล้ว ⇒ รหัส SV · วัน/เวลา · ชื่อช่าง · สถานะนัด
         มาครบตั้งแต่เดิม (จอใช้ทั้งบอกว่าใครไป และเป็นด่านว่าใครเขียนได้) */
      visit,
      /* ⭐ ทีมบนนัด `[{ id, name, lead, you, gone? }]` — คนไปก่อน แล้วผู้ช่วย · `you` = คนที่เปิดจอ (หัวงานเขียน "คุณ")
         ⚠️ จอไม่รู้ user id ของตัวเอง ⇒ server บอก (ท่าเดียวกับ `canWrite` · `onVisit`) */
      crew: crewRes.crew,
      site: context.site,
      customer: context.customer,
      recall: context.recall,
      /* ⭐ หัวหน้าส่งกลับให้แก้ค้างอยู่ไหม — แถบของช่างขึ้นปุ่ม "แจ้งหัวหน้าว่าแก้แล้ว" ตามตัวนี้
         และการ์ดของหัวหน้าบอกว่ารอช่างแก้/ช่างแจ้งแล้ว */
      /* ใบส่งผลแล้ว = เรื่องที่ค้างไม่ค้างแล้ว (ผลล็อก ช่างแก้ต่อไม่ได้) · ดึงกลับ = ค้างตามจริงอีกครั้ง (`surveySendBackOnSheet`)
         ใบที่ไม่ต้องมีนัดแล้ว (ทุกพื้นที่ที่เหลือเป็นจากแบบ) = ไม่ค้างเช่นกัน — ไม่มีช่างให้รอ (`closedByMethod`) */
      sendBack: surveySendBackOnSheet(context.sendBack, request, { needsVisit }),
      unknown: context.unknown,
      canWrite: access.ok === true,
      /* ⭐ **คนละสิทธิ์กับ `canWrite`** — เคาะแพ็คเกจ/จุด และกดส่งผล เป็นการตัดสินใจ
         เชิงพาณิชย์ของหัวหน้าฝ่าย ไม่ใช่การรายงานหน้างานของช่าง (แผน §5.4) */
      canDecide,
      /* ⭐ **ผูก/ย้ายรูปจุดติดตั้งกับจุดได้ไหม** (PR-S · Q1a) — ตัวตัดสินเดียวกับด่าน PATCH (`surveySpotLinkAccess`)
         ใบเปิด = คนที่เขียนได้ · ใบที่ส่งผลแล้ว = หัวหน้าฝ่ายยังผูกได้ (metadata อย่างเดียว) ⇒ ถาด "ยังไม่ได้ผูกจุด"
         โชว์ปุ่มผูกตามธงนี้ · ⚠️ จอไม่รู้ role/แอดมินของตัวเอง ⇒ server ตอบให้ (ท่าเดียวกับ `canWrite`) */
      canLinkSpotPhotos: surveySpotLinkDecision(request, {
        canWrite: access.ok === true,
        canDecide,
        isAdmin: user?.role === 'admin',
      }).ok,
      /* ไฟล์แนบของคำร้อง — อ่านอย่างเดียว (`surveyRequestFileRows` · ไม่มี metadata ดิบ) */
      requestFiles: requestFiles.files,
      /* ── ประเมินจากแบบ (งวด S2a) — สามคีย์นี้มีในคำตอบเสมอ ทุกคนดู ─────────────────────
         `drawingMethodEnabled`  boolean — จอใช้ตัดสินว่าจะโชว์ปุ่ม "เปลี่ยนวิธีประเมิน" (ผ่าน `surveyControlView`)
         `threadFiles`           ไฟล์ที่แนบในเธรดของใบ `[{ updateId, index, fileName, mimeType, sizeBytes, createdAt, authorName }]`
                                 เปิดผ่าน proxy `/api/updates/<updateId>/file?i=<index>` · ไม่มีที่อยู่ไฟล์ดิบ
                                 · ช่าง / ผู้จัดคิว และใบที่ไม่เข้าเงื่อนไข = `[]`
         `siteVisitReached`      true / false = ใบมีนัดที่เข้าพื้นที่แล้วไหม · `null` = ไม่ได้ถาม หรืออ่านไม่สำเร็จ
                                 (การ์ดไม่เตือนอะไรเมื่อเป็น null — route ส่งผลยังเป็นคนตัดสิน) */
      drawingMethodEnabled,
      threadFiles: threadFiles.files,
      siteVisitReached,
      /* ⭐ ทะเบียนขนาดแพ็คเกจ เรียงตามที่แถบเลือกแสดง (mig 0398) · `null` = อ่านไม่สำเร็จ — จอส่งต่อให้
         `surveyControlView({ packageSizes })` และตัวตัดสินร่าง (`surveyDecisionError(…, { sizes })`) ซึ่ง fail-closed ทั้งคู่ */
      packageSizes,
      /* ⭐ **เอกสารประเมินของใบ ตามสิทธิ์ของคนดู** (`surveyDocumentSummary` · สเปก PR-2 §10) — จอ PR-3 อ่านจากคีย์นี้
         ไม่มีสิทธิ์ = `{ access: 'none' }` · มีสิทธิ์ = `{ access: {…}, issueAtSend, storeAllowed, state, current, … }`
         🔴 ไม่มีภาพนิ่ง · HTML · id ของแถว · ที่อยู่ไฟล์ — ตัวสรุปคัดคีย์ทีละตัว (เทสต์ไล่คีย์ทุกชั้นของคำตอบนี้)
         ⚠️ `history` · `nextDocNo` · `send` · `issue` เป็นคีย์ที่ **มีหรือไม่มี** ตามสิทธิ์ ไม่ใช่ค่าว่าง · `state` เป็น
            `null` ได้เมื่ออ่านแถวเอกสารไม่สำเร็จ (คู่กับ `unknown: true`) */
      document: reportDoc,
      // เหตุผลที่เขียนไม่ได้ — จอต้องบอกเหตุ ไม่ใช่ซ่อนปุ่มเงียบ ๆ
      writeBlockedReason: access.ok ? null : (access.error || 'ไม่มีสิทธิ์บันทึกผลของใบนี้'),
      /* ⭐ **เปิดหน้าคำร้องได้ไหม** — จอเอาไปตัดสินว่าจะโชว์ลิงก์ "คำร้อง RQ-…" หรือไม่
         🐞 จอเคยเดาเองว่า "เขียนได้แต่เคาะไม่ได้ = ช่าง" ⇒ **ช่างที่ไม่ได้อยู่ในนัด**
            (เปิดใบของเพื่อนอ่านได้ตามกติกาของโมดูล) หลุดเป็น "คนดู" แล้วได้ลิงก์ที่
            ตอบ 403 ใส่เขา · สิทธิ์ผูกกับ role ซึ่งจอไม่รู้ ⇒ server ตอบให้ที่นี่
         ⚠️ **ไม่ใช่ด่านอ่านของใบประเมิน** — ด่านนั้นคือ `surveyReadError` ข้างบน */
      canOpenRequest: canOpenRequestPage(user),
      /* ⭐ **คนดูอยู่บนนัดนี้ไหม** (คนไป/คนช่วย) — แถบ "เริ่มงาน/ส่งงาน" ของช่างขึ้นให้หัวหน้า
         เฉพาะเมื่อเขาเป็นคนออกหน้างานเอง (Senior) · หัวหน้าที่เปิดมาเคาะแพ็คเกจไม่ใช่คนส่งงาน
         ⚠️ จอไม่รู้ user id ของตัวเอง ⇒ server ตอบให้ (ท่าเดียวกับ `canWrite`) */
      onVisit: isOnVisit(user, visit),
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});
