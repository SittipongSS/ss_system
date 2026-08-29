// ── API คำร้องข้ามฝ่ายรายเรื่อง (mig 0173) ──────────────────────────────
// GET    : รายละเอียด (canViewRequests + **ต้องเป็นใบของตัวเอง/ของฝ่ายตน** — ดู
//          canReadRequestRow; เดิมด่านนี้ไม่ดูแถวเลย เปิดตรงด้วย id ได้ทุกใบ)
// PATCH  : submit (ผู้ขอ — ออกเลขตาม scope ของชนิด + แจ้ง space ฝ่าย + @mention)
//          reopen (ยังไม่จบ — ถอนตราปิดของฝั่งที่กดไปแล้ว) ·
//          acknowledge (RD/PC รับเรื่อง = ตัดรอบ) · commit-due (แจ้งกำหนดส่ง —
//          ก้าวแยกจากการรับเรื่อง) · answer (ชนิดที่ไม่มี
//          บรรทัด — ตอบเสร็จแล้ว) · close (ปิดเรื่อง) · cancel (ผู้ขอยกเลิก) ·
//          pdr-ref (ออกเลขที่เอกสาร PDR ย้อนหลังให้ใบที่รับเรื่องไปก่อน mig 0271) ·
//          pdr-ref-manual (RD กรอก/แก้เลขเองในช่วงเปลี่ยนผ่าน mig 0272)
// DELETE : ร่างที่ยังไม่ส่ง (+ admin ?force=1 ผ่าน RPC)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canBeServiceAssignee, canViewRequests } from '@/lib/permissions';
import {
  canForceDelete, cleanupRequestOrphans, isDryRun, isForceRequest, requestForcePreview,
} from '@/lib/forceDelete';
import { randomUUID } from 'crypto';
import { assignPatch, assignRequestError } from '@/lib/requests/assign';
import { canEditPdr, editPdrError } from '@/lib/requests/pdrEdit';
import { normalizePdr } from '@/lib/requests/pdr';
import { pdrChangeSummary } from '@/lib/requests/pdrChanges';
import { normalizePdrTargets } from '@/lib/requests/pdrTargets';
import { pdrArtworkError } from '@/lib/requests/pdrFields';
import {
  assignPdrRefNo, issuesPdrRefNoOnAcknowledge, normalizePdrRefNo, pdrRefManualError,
  pdrRefNoError,
} from '@/lib/requests/pdrRefNo';
import { listAttachments, purgeAttachments } from '@/lib/master/attachments';
import { normalizeScentBriefs, scentBriefNameError } from '@/lib/requests/scentBriefs';
import {
  acknowledgeRequestError, commitDueRequestError, rescheduleRequestError,
  bounceRequestError, answerRequestError, canAnswerRequest, canManageRequest,
  canReadRequestRow, cancelRequestError, closeOutcomeError, closeRequestError,
  assignRequestDocNo, deleteRequestError, requestGuardMessage, submitRequestError,
} from '@/lib/deptRequests';
import {
  lineShapeForKind, requestHasItems, requestKindLabel, requestNeedsRef, requestShapeError,
} from '@/lib/master/requestTypes';
import { closureStatus, reopenRequestError, requestClosure } from '@/lib/requests/closure';
import { requestSideText } from '@/lib/requests/replyTurn';
import { requestEditError, requestEditPatch } from '@/lib/requests/requestEdit';
import { lineDiffIsEmpty, lineShapeEditable, requestLineDiff } from '@/lib/requests/requestLineEdit';
import { normalizeLinesFor } from '@/lib/requests/kinds/lineShapes';
import { resolveLineLabels } from '@/lib/requests/lineLabels';
import { resolveOptionalRefs } from '@/lib/requests/optionalRefs';
import { resolveBillAmount } from '@/lib/requests/billingQuotations';
import { isScentRegistrar } from '@/lib/master/scents';
import { createScent } from '@/lib/master/scentFormulaAdmin';
import { findRequest } from '@/lib/materialPricesAdmin';
import { businessDate } from '@/lib/businessDate';
import { attachRegistryLinks, registryIdsFromItems } from '@/lib/requests/registryLinks';
import { loadUserDirectory } from '@/lib/usersRepo';
import { toHHMM } from '@/lib/service/sites';
import { normalizeSurveyTime } from '@/lib/service/surveyRequest';
import { loadSurveySite, materializeSurveyZones } from '@/lib/service/surveyRepo';
import {
  CLOSED_VISIT_STATES, createSurveyVisit, findSurveyVisit, moveSurveyVisit, surveyScheduleError,
} from '@/lib/service/surveyVisit';
import { syncCostingPricingStatus } from '@/lib/costingAdmin';
import { appendRequestEvent } from '@/lib/sales/documentThread';
import { sanitizeMentions } from '@/lib/master/mentions';
import { purgeUpdates } from '@/lib/master/updates';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// ── เติมค่าสดของทะเบียนให้แถวคำร้อง ──────────────────────────────────────
// ⚠️ สอง query ต่อใบ (กลิ่น + สูตร) และยิงเฉพาะเมื่อมีแถวที่ผูกจริง — ใบสอบถาม/
// ขอเอกสารไม่มีลิงก์เลย จึงไม่ต้องจ่ายอะไรเพิ่ม
async function withRegistryLinks(supabase, items = []) {
  const { scentIds, formulaIds } = registryIdsFromItems(items);
  if (!scentIds.length && !formulaIds.length) return items;
  const [scentRes, formulaRes] = await Promise.all([
    scentIds.length
      ? supabase.from('scents').select('id, code, name, status').in('id', scentIds)
      : Promise.resolve({ data: [] }),
    formulaIds.length
      ? supabase.from('formulas').select('id, code, name, status').in('id', formulaIds)
      : Promise.resolve({ data: [] }),
  ]);
  return attachRegistryLinks(items, {
    scents: scentRes.data || [],
    formulas: formulaRes.data || [],
  });
}

// ผลลัพธ์ของบรีฟกลิ่นตอนปิดเรื่อง → id ของกลิ่นในทะเบียน (หรือ null ถ้า "ไม่ได้กลิ่น")
//
// สร้างใหม่ใช้กติกาเดียวกับหน้าทะเบียนเป๊ะ ๆ ผ่าน `createScent`: RD ที่ใส่รหัสมาด้วย
// = เข้าทะเบียนเลย (`developing`) · คนอื่นหรือ RD ที่ยังไม่มีรหัส = ร่างรอ RD รับ
// ห้ามเขียน insert เองที่นี่ ไม่งั้นกฎสองชุดจะเพี้ยนหากันเหมือนที่ AGENTS.md เตือน
async function resolveScentOutcome(supabase, request, outcome, user) {
  if (request?.scentId) return { scentId: request.scentId };
  if (!outcome || outcome.mode === 'none') return null;

  if (outcome.mode === 'link') {
    const { data, error } = await supabase.from('scents')
      .select('id, customerId').eq('id', outcome.scentId).maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'ไม่พบกลิ่นที่เลือก' };
    // มติ 9: กลิ่นของลูกค้า A ใช้กับ B ไม่ได้ — ผูกข้ามลูกค้าคือทำทะเบียนพัง
    if (request.customerId && data.customerId !== request.customerId) {
      return { error: 'กลิ่นนี้เป็นของลูกค้ารายอื่น ผูกกับคำร้องนี้ไม่ได้' };
    }
    return { scentId: data.id };
  }

  const accepted = isScentRegistrar(user) && !!String(outcome.code ?? '').trim();
  try {
    const scent = await createScent(supabase, {
      name: outcome.scentName,
      code: accepted ? outcome.code : undefined,
      customerId: request.customerId,
      customerName: request.customerName,
      dealId: request.dealId || null,
      note: outcome.note || null,
    }, user, { accepted });
    return { scentId: scent.id, created: true };
  } catch (e) {
    // ชื่อซ้ำในลูกค้าเดียวกัน ฯลฯ = เรื่องที่ผู้ใช้แก้เองได้ ไม่ใช่ 500
    return { error: e.message };
  }
}

export async function GET(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!canViewRequests(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const { id } = await params;
    const row = await findRequest(getSupabaseAdmin(), id);
    if (!row) return Response.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });
    // ⭐ ค่าสดจากทะเบียนกลิ่น/สูตร (มติผู้ใช้ 2026-08-18) — แถวคำร้องเก็บแต่ id
    // ส่วนชื่อ/รหัสที่โชว์ต้องมาจากทะเบียนเสมอ ดู `lib/requests/registryLinks.js`
    // ⚠️ เติม **เฉพาะหน้ารายละเอียด** ไม่ใช่ใน `findRequest` — คิวโหลดทีละหลายสิบใบ
    // การเพิ่ม query ให้ทุกใบเพื่อค่าที่คิวไม่ได้โชว์คือจ่ายฟรี
    row.items = await withRegistryLinks(getSupabaseAdmin(), row.items);
    // ด่านรายแถว — ให้ตรงกับที่ GET /api/sa/requests กรองไว้อยู่แล้ว ไม่งั้นรายการ
    // ซ่อนใบของคนอื่น แต่เปิดตรงด้วย id อ่านได้หมด (id หลุดทางลิงก์แจ้งเตือน/ /go/)
    if (!canReadRequestRow(user, row)) {
      return Response.json(
        { error: 'คำร้องนี้ไม่ใช่ของคุณ และไม่ได้ส่งถึงฝ่ายของคุณ' },
        { status: 403 },
      );
    }
    // ฝั่ง client ไม่รู้ user id ของตัวเอง (roleContext มีแค่ role/team/ฝ่าย) —
    // ติดธงมาจาก server ให้ปุ่มส่ง/ยกเลิกโผล่เฉพาะกับผู้เปิดคำร้องจริง ๆ
    return Response.json(
      {
        ...row,
        // ⚠️ **ที่นี่ `_mine` = "จัดการใบนี้ได้"** (เจ้าของใบ · เพื่อนร่วมทีม · admin)
        // ไม่ใช่ "ฉันเปิดเอง" — หน้ารายละเอียดใช้ธงนี้ตัดสินว่าจะโชว์ปุ่มไหน ส่วน
        // รายการใช้ชื่อเดียวกันแทน "ฉันเปิดเอง" (ดูคอมเมนต์ที่ route ของรายการ)
        _mine: canManageRequest(user, row),
        // ⭐ "ฉันเป็นคนเปิดใบนี้เอง" — ชิปบนหัวใบใช้ตัวนี้เลือกคำว่า "ใบของฉัน" หรือ
        // "ผู้ยื่น <ชื่อ>" (ม-101) · ใช้ `_mine` ไม่ได้เพราะเพื่อนร่วมทีมก็จัดการได้แล้ว
        // ⇒ ป้าย "ใบของฉัน" จะไปขึ้นบนใบของเพื่อน ซึ่งเป็นการโกหกหน้าจอ
        _opener: !!user?.id && row.requestedById === user.id,
        _canEditPdr: canEditPdr(user, row),
        // ⭐ **เหตุผลที่แก้ไม่ได้ ไม่ใช่แค่ว่าแก้ไม่ได้** — `editPdrError` บอกว่า
        // "ตอนนี้เป็นของใคร" (ผู้ขอ ก่อนรับเรื่อง · ฝ่ายปลายทาง หลังรับเรื่อง)
        // 🐞 ประโยคนี้มีมาตั้งแต่ mig 0216 แต่ถูกเรียกที่ route เท่านั้น ⇒ **จอไม่เคย
        // แสดง** · ปุ่มแก้หายไปเฉย ๆ แล้วคนกดต้องเดาเองว่าต้องไปบอกใคร
        // (บทเรียนเดียวกับ `requestFormBlocker` ที่คอมเมนต์ของ pdrEdit.js อ้างถึง)
        _editPdrBlocker: editPdrError(row, user),
        /* ⭐ **เหตุผลที่แก้หัวใบไม่ได้** (มติผู้ใช้ 2026-08-24) — คู่แฝดของบรรทัดบน
           สำหรับหัวข้อที่ **ไม่มีแบบฟอร์ม PDR**
           🐞 ก่อนหน้านี้จอมีแต่ `_editPdrBlocker` ⇒ ใบขอเอกสาร/ขอใบวางบิล/พัฒนาสูตร/
           สอบถาม พอฝ่ายกด "รับเรื่อง" **ปุ่มแก้หายไปทั้งปุ่มโดยไม่มีเหตุผลบนจอ**
           ทั้งที่ `requestEditError` เขียนประโยคไทยรออยู่แล้ว — อาการเดียวกับที่
           คอมเมนต์ของ `_editPdrBlocker` ข้างบนเล่าไว้ แค่คนละหัวข้อ
           ⚠️ กติกาของระบบคือ "ปุ่มกดไม่ได้ = โชว์เสมอ บอกเหตุตอนกด" (GatedAction) */
        _editBlocker: requestEditError(row, user),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });
  if (!canViewRequests(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const nowIso = new Date().toISOString();
  const patch = { updatedAt: nowIso };
  // กดส่ง = ต้องออกเลขที่คำร้องพร้อมบันทึกในทรานแซกชันเดียว (mig 0243) ไม่ใช่ใส่ลง patch
  let issueDocNo = false;
  /* รับเรื่อง = ออก **เลขที่เอกสาร PDR** (DDMMYY-XXX · mig 0271) พร้อมบันทึก
     ในทรานแซกชันเดียวด้วยเหตุผลเดียวกัน · ค่าที่เก็บคือ *วันที่ของเลข* ไม่ใช่ธง
     เพราะปุ่มออกเลขย้อนหลังใช้วันที่รับเรื่องของใบนั้น ไม่ใช่วันที่กดปุ่ม */
  let pdrRefAt = null;
  let summary = '';
  // รายการเปลี่ยนแปลงของ PDR — ใช้ตอนเขียนเธรดท้าย handler
  let pdrChanges = null;
  /* แผนเขียน **บรรทัด** ของ action 'update' — ประกอบตอนตรวจ แล้วเขียนหลังหัวใบผ่าน
     ⚠️ เขียนทีหลังโดยตั้งใจ: หัวใบล้ม (เช่นลืมเหตุผลด่วน) ต้องไม่มีอะไรถูกเขียนเลย
     — เหตุผลเดียวกับที่ปุ่มบันทึกบนจอยิงหัวใบก่อนแบบฟอร์ม */
  let lineWrites = null;
  /* รับเรื่องที่ใบแล้วต้องประทับลงแถวที่ยังไม่มี `ackAt` ด้วย — ดูเหตุผลที่ action
     `acknowledge` · เขียนหลังหัวใบผ่าน ด้วยเหตุผลเดียวกับ `lineWrites` */
  let ackFanOut = false;
  // เหตุผลที่ต้องไหลไปถึงเธรด (นอกเหนือจาก cancel/bounce ที่เก็บลง patch อยู่แล้ว)
  let eventReason = null;
  /* ⚠️ **ครึ่งหลังของ "ลงคิว" ล้มได้โดยที่ใบบันทึกไปแล้ว** — ใบกับนัดอยู่คนละคำสั่ง
     (PostgREST ไม่มีทรานแซกชันครอบ) ⇒ ต้อง **บอกผู้ใช้** ไม่ใช่ log เงียบ ๆ
     แล้วปล่อยให้คนคิดว่าช่างเห็นงานแล้วทั้งที่ตารางว่าง */
  let visitWarning = null;

  try {
    if (action === 'submit') {
      if (!canManageRequest(user, before)) {
        return Response.json({ error: 'ส่งคำร้องได้เฉพาะผู้เปิดเรื่องหรือคนในทีมเดียวกัน' }, { status: 403 });
      }
      const err = submitRequestError(before, before.items);
      if (err) return Response.json({ error: err }, { status: 409 });

      // ⭐ ติ๊กว่า "มีภาพประกอบบรรจุภัณฑ์" แล้วต้องแนบจริง (มติผู้ใช้ · mig 0217)
      //
      // ⚠️ **บังคับตอนกดส่ง ไม่ใช่ตอนเปิดใบ** — หน้า `/requests/new` แนบไฟล์ไม่ได้
      // (ไฟล์ต้องมี id ของคำร้องให้เกาะก่อน) ⇒ บังคับตอนสร้างจะกลายเป็นกำแพงที่
      // ผ่านไม่ได้เลย · จังหวะกดส่งคือจังหวะที่แนบได้แล้วและยังแก้ทัน
      const artworkError = pdrArtworkError(
        { packagingArtwork: before.pdrPackagingArtwork },
        { attachmentCount: (await listAttachments('dept_request', id)).length, stage: 'submit' },
      );
      if (artworkError) return Response.json({ error: artworkError }, { status: 409 });

      // ⭐ **ชื่อเรียกบรีฟต้องครบก่อนส่ง** (มติผู้ใช้ 2026-08-10) — ด่านเดียวกับ artwork
      // ข้างบนทั้งเหตุผลและจังหวะ: ร่างยังปล่อยว่างได้ กดส่งคือจังหวะที่ต้องครบ
      // (ดูเหตุผลเต็มที่ `lib/requests/scentBriefs.js`)
      const briefNameError = scentBriefNameError(before.briefs, { stage: 'submit' });
      if (briefNameError) return Response.json({ error: briefNameError }, { status: 409 });

      /* ⭐ **พื้นที่ใหม่ได้รหัส ZN ตรงนี้** (mig 0314) — จังหวะเดียวกับเลขใบ ด้วยเหตุผล
         เดียวกันเป๊ะ: ร่างที่ถูกทิ้งต้องไม่ทิ้งโซนกำพร้าไว้ในทะเบียนของลูกค้า
         ⚠️ ทำ **ก่อน** `issueDocNo` — ล้มตรงนี้แล้วเลขใบยังไม่ออก ⇒ กดส่งใหม่ได้เลย
         ⚠️ ตัวมันรันซ้ำได้ (ข้ามแถวที่มี `zoneId` แล้ว) ⇒ ใบที่ถูกตีกลับแล้วส่งใหม่
            จะไม่สร้างโซนซ้อน */
      if (requestNeedsRef(before.kind, 'site')) {
        if (!before.siteId) {
          return Response.json({ error: 'ใบนี้ยังไม่มีสถานที่ — แก้ใบแล้วเลือกสถานที่ก่อนส่ง' }, { status: 409 });
        }
        const { error: zoneError } = await materializeSurveyZones(supabase, {
          requestId: id, siteId: before.siteId, user,
        });
        if (zoneError) return Response.json({ error: zoneError }, { status: 409 });
      }
      // เลขออกตอนนี้เท่านั้น — ร่างที่ถูกทิ้งจะได้ไม่กินเลขจนขาดช่วง
      // ⚠️ ใบที่ถูก **ตีกลับ** เป็นร่างที่มีเลขอยู่แล้ว ⇒ ต้องใช้เลขเดิม ไม่ใช่ออกใหม่
      // (`docNo` แก้ไม่ได้ที่ระดับ trigger — ดูเหตุผลเต็มใน `assignRequestDocNo`)
      // ⚠️ ไม่ใส่ docNo ลง patch: เลขออกพร้อม UPDATE ในคำสั่งเดียว (mig 0243) ไม่งั้น
      // ทุก UPDATE ที่ไม่ผ่านจะกินเลขทิ้ง — เคยเกิดจริง ตัวนับ RQ วิ่งเกินเลขที่ออกจริง 8 เลข
      issueDocNo = true;
      patch.status = 'pending';
      patch.submittedAt = nowIso;
      summary = `ส่งคำร้อง ${before.docNo || id} ถึงฝ่าย ${before.dept}`;
    } else if (action === 'acknowledge') {
      if (!canAnswerRequest(user, before)) {
        return Response.json({ error: `รับเรื่องได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
      }
      /* ⭐ **รับเรื่องไม่ผูกวันแล้ว** (มติผู้ใช้ 2026-08-19) — กดรับ = ตัดรอบเข้าฝ่าย ·
         วันที่รับปากเป็น action ของตัวเอง (`commit-due`) ที่กดทีหลังได้เมื่อฝ่ายรู้จริง
         ⚠️ **ไม่รับ `committedDueDate` จาก body ที่นี่โดยตั้งใจ** — เปิดช่องไว้เมื่อไร
         วันก็ถูกผูกได้โดยไม่มีแถว `commitDue` ในเธรด แล้วฝ่ายขายไม่มีวินาทีที่รู้ว่า
         ได้วันแล้ว (โรคเดียวกับที่ `reschedule` เคยเป็น: แก้จริงแต่เธรดเงียบ) */
      const err = acknowledgeRequestError(before);
      if (err) return Response.json({ error: err }, { status: 409 });
      patch.status = 'acknowledged';
      patch.acknowledgedById = user?.id ?? null;
      patch.acknowledgedByName = user?.name ?? null;
      patch.acknowledgedAt = nowIso;
      // ⭐ เลขที่เอกสาร PDR ออกที่จังหวะนี้ (มติผู้ใช้ 2026-08-20) — วันบนเลข
      // คือวันที่ฝ่ายรับเรื่อง ⇒ ออกก่อนหน้านี้ไม่ได้ เพราะยังไม่มีวันให้ใช้
      // ⚠️ เดือนนี้ยังเป็นช่วงที่ RD เดินเลขบนกระดาษเอง ⇒ ฟังก์ชันนี้คืน false
      // และใบจะไปได้เลขทางปุ่ม "กรอกเลขที่เอกสาร" แทน (mig 0272)
      if (issuesPdrRefNoOnAcknowledge(before, new Date(nowIso))) pdrRefAt = nowIso;
      /* ⭐ **รับเรื่องที่ใบ = รับทุกแถวในใบ** (มติผู้ใช้ 2026-08-24) — ประทับ `ackAt`
         ลงแถวที่ยังไม่มี ณ จังหวะเดียวกัน
         🐞 ก่อนหน้านี้ไม่ทำ ⇒ ใบที่กดรับแล้ว แถวข้างในยังค้างขั้น `awaiting_ack` และ
         จอขึ้นปุ่ม "รับเรื่อง" ให้กดซ้ำรายแถวก่อนถึงจะกด "ส่งงาน" ได้ · วัดบน prod:
         DC-26080003 รับเรื่องใบแล้วแต่ต้องกดรับอีก **25 ครั้ง** · และแถวที่กดทีหลัง
         บันทึก `ackAt` เป็นวันที่กด ไม่ใช่วันที่ฝ่ายรับเรื่องจริง (เส้นวัด lead time เพี้ยน)
         ⚠️ ทำ **หลัง** หัวใบเขียนสำเร็จ (ดูท้าย handler) ไม่ใช่ตรงนี้ — หัวใบล้มแล้ว
         แถวต้องไม่ถูกแตะ · แค่ติดธงไว้ก่อน */
      ackFanOut = true;
      summary = `รับเรื่อง ${before.docNo || id}`;
    } else if (action === 'commit-due') {
      /* ⭐ **แจ้งกำหนดส่ง** (มติผู้ใช้ 2026-08-19) — ก้าวที่สองของฝ่ายผู้รับ · แยกจาก
         การรับเรื่องเพราะของจริงคือ "รับไว้แล้ว แต่ยังตอบวันไม่ได้" (รอวัตถุดิบ ·
         รอฝ่ายอื่น) · ครั้งแรกทางนี้ · เปลี่ยนวันหลังจากนั้นไปทาง `reschedule` ซึ่ง
         บังคับให้เธรดเห็นว่าเลื่อนจากวันไหนเป็นวันไหน */
      if (!canAnswerRequest(user, before)) {
        return Response.json({ error: `แจ้งกำหนดส่งได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
      }
      /* ⭐ **รอบแก้เปิดก้าวนี้ใหม่** (มติผู้ใช้ 2026-08-25) — อ่าน **ก่อน** เขียน patch
         เพราะพอเขียนแล้ววันเก่าหายไปจากมือ
         ⚠️ **ใช้ "มีวันเดิมอยู่ไหม" ไม่ใช่ `dueIsStale` ซ้ำอีกตัว** (เก็บกวาด 2026-08-27)
         — `commitDueRequestError` ปล่อยผ่านแค่สองกรณี: ยังไม่มีวันเลย หรือวันที่มีเป็น
         ของรอบที่ส่งไปแล้ว ⇒ ถึงบรรทัดนี้แล้ว "มีวันเดิม" กับ "เป็นรอบแก้" คือเรื่อง
         เดียวกันเสมอ · และเป็นตัวเดียวกับที่เธรดใช้ (`previousDueDate` ที่ส่งให้
         `appendRequestEvent` ข้างล่าง) ⇒ audit log กับเธรดพูดตรงกันเชิงโครงสร้าง
         ไม่ใช่เพราะมีคนคอยดูให้ตรง */
      /* ⭐ **ลงคิวซ้ำได้เมื่อใบมีวันแต่ไม่มีนัด** — พิสูจน์จากของจริง ไม่ใช่จากธงที่
         client ส่งมา · เส้นนี้คือทางกู้เมื่อครึ่งหลังของการลงคิวล้ม (สร้างนัดไม่สำเร็จ
         หรือนัดถูกลบทิ้ง) ⇒ กดยืนยัน **วันเดิม** ได้โดยไม่ต้องเลื่อนวันปลอม */
      const requeue = requestNeedsRef(before.kind, 'site')
        && !!String(before.committedDueDate ?? '').trim()
        && !(await findSurveyVisit(supabase, id));
      // รอบแก้ ≠ ลงคิวซ้ำเพราะนัดไม่เกิด — ไม่งั้นเธรดขึ้น "แจ้งกำหนดส่งรอบแก้" ทั้งที่ไม่ใช่
      const rework = !requeue && !!String(before.committedDueDate ?? '').trim();
      const err = commitDueRequestError(before, {
        committedDueDate: body.committedDueDate, requeue,
      });
      if (err) return Response.json({ error: err }, { status: /ระบุวัน/.test(err) ? 400 : 409 });

      /* ── ประเมินพื้นที่: ก้าวนี้คือ **"ลงคิว"** ไม่ใช่แค่แจ้งวัน (แผน เฟส 2) ─────
         ⭐ วัน + เวลา + ช่าง + นัดบนตาราง เกิดพร้อมกันในจังหวะเดียว — แยกเป็นสองปุ่ม
            เมื่อไรจะมีใบที่แจ้งวันแล้วแต่ไม่มีนัด (ช่างไม่เห็นงาน) หรือมีนัดที่ใบไม่รู้
         ⚠️ ตรวจให้ครบ **ก่อน** เขียนอะไรลงใบ — ตกด่านกลางทางแล้วใบจะถือวันของนัดที่
            ไม่มีอยู่จริง */
      let technician = null;
      if (requestNeedsRef(before.kind, 'site')) {
        const scheduleError = surveyScheduleError(body, before);
        if (scheduleError) return Response.json({ error: scheduleError }, { status: 400 });
        /* 🔴 **ช่างต้องมีจริงและรับงานเข้าไซต์ได้** — ของเดิมตรวจแค่ว่า `assigneeId`
           ไม่ว่าง และเชื่อ `assigneeName` ที่ client ส่งมาตรง ๆ ⇒ ยิง API เองใส่ id
           อะไรก็ได้ แล้วนัดจะถือชื่อที่ไม่ตรงกับใคร (ตารางช่างชี้คนที่ไม่มีอยู่)
           ⚠️ ชื่อเอาจากทะเบียนเสมอ ไม่ใช่จาก body — แพตเทิร์นเดียวกับ customerName
              ที่ทุก route ในรีโปนี้อ่านจากทะเบียนแทนค่าที่จอส่งมา */
        const directory = await loadUserDirectory(supabase);
        technician = directory.get(String(body.assigneeId).trim()) || null;
        if (!technician || technician.disabled) {
          return Response.json({ error: 'ไม่พบบัญชีช่างที่เลือก' }, { status: 400 });
        }
        if (!canBeServiceAssignee(technician)) {
          return Response.json({
            error: `${technician.name} รับงานเข้าไซต์ไม่ได้ — ต้องเป็นฝ่ายบริการ (TS) หรือทีมขาย SV`,
          }, { status: 400 });
        }
      }

      patch.committedDueDate = String(body.committedDueDate).trim();
      /* ⭐ **ตราเวลาที่ลงวัน** (mig 0288) — ตัวเดียวที่ตอบได้ว่าวันที่ถืออยู่เป็นของ
         รอบไหน · ขาดไปเมื่อไร ใบจะค้างอยู่ขั้น "แจ้งกำหนดส่ง" ตลอดกาลเพราะแถวรอบแก้
         เกิดหลัง `dueCommittedAt` ที่ยังเป็น NULL ไม่ได้ (NULL = ไม่ค้าง) แต่ใบที่เคย
         มีค่าแล้วจะไม่มีอะไรมาขยับให้ */
      patch.dueCommittedAt = nowIso;
      /* เวลานัด + ช่าง ของใบประเมิน — เก็บบนใบด้วย ไม่ใช่เฉพาะบนนัด
         ⚠️ คิว/หน้ารายละเอียดอ่านจากใบ ไม่ได้ join นัดทุกแถว ⇒ ค่าที่ใบไม่มี = ค่าที่
            ไม่มีใครเห็นจนกว่าจะเปิดหน้าตารางช่าง */
      if (requestNeedsRef(before.kind, 'site')) {
        patch.committedDueTime = String(body.committedDueTime ?? '').trim() || null;
        patch.assigneeId = technician.id;
        patch.assigneeName = technician.name || null;
        patch.assignedAt = nowIso;
      }

      // เหตุผลไม่บังคับ — ครั้งแรกยังไม่มีคำสัญญาเดิมให้ต้องอธิบาย (ต่างจากการเลื่อน)
      const note = String(body.reason ?? '').trim();
      if (note.length > 500) {
        return Response.json({ error: 'เหตุผลยาวเกิน 500 ตัวอักษร' }, { status: 400 });
      }
      eventReason = note || null;
      /* ⚠️ **รอบแก้ต้องบอกวันเดิมด้วย** — ไม่ใช่เพราะเลื่อน แต่เพราะคนอ่านย้อนหลัง
         ต้องแยกออกว่า 05/09 นี้เป็นวันของรอบใหม่ ไม่ใช่การแก้ตัวเลข 14/08 ที่ค้างอยู่ */
      summary = rework
        ? `แจ้งกำหนดส่งรอบแก้ ${patch.committedDueDate} (รอบก่อน ${before.committedDueDate})`
          + (note ? ` — ${note}` : '')
        : `แจ้งกำหนดส่ง ${patch.committedDueDate}${note ? ` — ${note}` : ''}`;
      if (requestNeedsRef(before.kind, 'site')) {
        summary = `ลงคิวเข้าพื้นที่ ${patch.committedDueDate}`
          + (patch.committedDueTime ? ` ${patch.committedDueTime}` : '')
          + (patch.assigneeName ? ` · ${patch.assigneeName}` : '')
          + (note ? ` — ${note}` : '');
      }
    } else if (action === 'update') {
      // ⭐ **แก้คำร้องที่ยังไม่ถูกรับเรื่อง** (มติผู้ใช้ 2026-08-09) — ก่อนหน้านี้
      // ใบที่บันทึกแล้วแก้ไม่ได้เลยสักช่อง ต้องลบทิ้งแล้วเปิดใหม่
      // ⚠️ กฎว่า "ใครแก้ได้ ตอนไหน ช่องไหน" อยู่ใน `lib/requests/requestEdit.js`
      // ที่เดียว — หน้าจอถามตัวเดียวกันเพื่อไม่ให้ปุ่มกับ API เห็นไม่ตรงกัน
      const denied = requestEditError(before, user);
      if (denied) return Response.json({ error: denied }, { status: 403 });

      const next = requestEditPatch(body);

      /* ── เวลาที่ต้องการให้เข้าพื้นที่ (หัวข้อที่มีสถานที่) ────────────────────
         🐞 ช่อง "ช่วงเวลาที่ต้องการ" **กางอยู่บนฟอร์มแก้** (`showTime` ของ
            RequestEditableFields) แต่ `requestEditPatch` ไม่มีคีย์นี้ ⇒ คนแก้เวลาแล้ว
            กดบันทึกได้ 200 โดยค่าไม่เคยถึง DB — อาการ "แก้แล้วหายเงียบ" ตัวเดียวกับที่
            บล็อกอ้างอิง QT/SO ข้างล่างเขียนเตือนไว้
         ⚠️ ถามทะเบียน (`requestNeedsRef(..., 'site')`) ไม่ใช่เทียบ kind ตรง ๆ (ม-34)
         ⚠️ ไม่ส่งคีย์มา = ไม่แตะของเดิม (ผู้เรียกที่แก้แค่ช่องอื่น) */
      if (requestNeedsRef(before.kind, 'site') && body.requestedDueTime !== undefined) {
        const parsed = normalizeSurveyTime(body.requestedDueTime);
        if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });
        next.requestedDueTime = parsed.value;
      }

      /* ── บรรทัด (มติผู้ใช้ 2026-08-24) ───────────────────────────────────
         ⭐ **หัวข้อที่เนื้องานอยู่ในบรรทัดต้องแก้บรรทัดได้** — ขอเอกสาร/ขอใบวางบิล
         เลือกชนิดผิดหรือพิมพ์รายละเอียดตกไปบรรทัดหนึ่ง เคยต้องลบทั้งใบเปิดใหม่
         ⚠️ **ตัวตรวจตัวเดียวกับ POST** (`normalizeLinesFor` + `resolveLineLabels`)
         ไม่ใช่กฎชุดที่สอง · ที่เพิ่มมาคือ "แถวไหนคือแถวไหน" (`requestLineDiff`)
         ⚠️ ไม่ส่ง `items` มา = ไม่แตะบรรทัดเลย (ผู้เรียกที่แก้แค่หัวใบ) — แพตเทิร์น
         เดียวกับ `pdrTargets` · ส่งอาเรย์ว่างมาถูกตีกลับที่ `normalizeLinesFor`
         ด้วยข้อความ "ต้องมีรายการอย่างน้อย 1 รายการ" ตัวเดียวกับตอนเปิดใบ */
      let nextItems = before.items;
      if (Array.isArray(body.items) && requestHasItems(before.kind)) {
        const lineShape = lineShapeForKind(before.kind);
        if (!lineShapeEditable(lineShape)) {
          return Response.json({
            error: 'รายการของหัวข้อนี้ไม่ได้กรอกตอนเปิดใบ — แก้ทางนี้ไม่ได้',
          }, { status: 400 });
        }
        const normalized = normalizeLinesFor(lineShape, body.items, {
          dept: before.dept, kindLabel: requestKindLabel(before.kind),
        });
        if (normalized.error) return Response.json({ error: normalized.error }, { status: 400 });

        const resolvedLines = await resolveLineLabels(supabase, normalized.items, {
          lineShape, customerId: before.customerId,
        });
        if (resolvedLines.error) {
          return Response.json({ error: resolvedLines.error }, { status: 400 });
        }

        const plan = requestLineDiff(before.items, resolvedLines.items, { lineShape });
        if (plan.error) return Response.json({ error: plan.error }, { status: 409 });
        lineWrites = lineDiffIsEmpty(plan) ? null : plan;
        nextItems = resolvedLines.items;
      }

      /* ── ยอดที่ขอวางบิล (มติเดียวกัน) ────────────────────────────────────
         ⚠️ **คิดใหม่จากยอดจริงของใบ ไม่เชื่อค่าที่ client แนบมา** — กฎเดียวกับ POST
         · `quotationId` แก้ไม่ได้ ⇒ ฐานยังเป็นใบเดิมเสมอ แต่ยอดของใบนั้นขยับได้
         (แก้ใบเสนอราคาแล้วอนุมัติใหม่) จึงต้องอ่านสด ไม่ใช้ `billBaseAmount` ที่
         ประทับไว้ตอนเปิด */
      if (requestNeedsRef(before.kind, 'quotation')
        && (body.billPercent != null || body.billAmount != null)) {
        const { data: qtRow, error: qtError } = await supabase
          .from('quotations').select('id, "totalAmount"')
          .eq('id', before.quotationId).maybeSingle();
        if (qtError) return Response.json({ error: qtError.message }, { status: 500 });
        if (!qtRow) return Response.json({ error: 'ไม่พบใบเสนอราคาของคำร้องนี้' }, { status: 409 });
        const bill = resolveBillAmount({
          percent: body.billPercent, amount: body.billAmount,
          baseAmount: Number(qtRow.totalAmount),
        });
        if (bill.error) return Response.json({ error: bill.error }, { status: 400 });
        next.billPercent = bill.percent;
        next.billAmount = bill.amount;
        next.billBaseAmount = Number(qtRow.totalAmount);
      }

      /* ── อ้างอิงเพิ่ม QT/SO/FG (มติเดียวกัน) ─────────────────────────────
         ⭐ ฟอร์มแก้เป็นฟอร์มเดียวกับตอนสร้าง ⇒ ช่องพวกนี้กางอยู่บนจอ · ไม่รับที่นี่
         = ผู้ใช้แก้แล้วหายเงียบ ซึ่งเป็นอาการเดิมที่ใบนี้มาแก้พอดี
         ⚠️ ด่านก้อนเดียวกับ POST (`resolveOptionalRefs`) — "มีจริง + อยู่ดีลเดียวกัน"
         ⚠️ **ดีลของใบเป็นตัวอ้างอิง ไม่ใช่ค่าที่ client ส่ง** — `dealId` แก้ทางนี้ไม่ได้ */
      const { patch: refPatch, error: refError } = await resolveOptionalRefs(
        supabase, before.kind, body, { dealId: before.dealId },
      );
      if (refError) return Response.json({ error: refError }, { status: 400 });
      Object.assign(next, refPatch);

      // ⚠️ ด่านรูปทรงเดียวกับตอนเปิดใบ — ชื่อเรื่องบังคับ · วันที่ต้องมีและถูกรูปแบบ ·
      // ด่วนต้องมีเหตุผล · ส่งของเดิมที่ไม่ได้แก้เข้าไปด้วยเพื่อให้ด่านเห็นใบทั้งใบ
      // ⚠️ ใช้ **บรรทัดชุดใหม่** — ลบแถวจนหมดต้องตกที่ "ต้องมีรายการอย่างน้อย 1 รายการ"
      // ไม่ใช่ผ่านเพราะด่านมองแถวเดิมที่กำลังจะถูกลบ
      /* 🐞 **ใบประเมินแก้ไม่ได้เลยสักครั้ง** — ด่านรูปทรงมีข้อ "ต้องมีพื้นที่อย่างน้อย
         1 รายการ" ซึ่งอ่านจาก `body.zones` · ทางแก้ใบไม่ได้ส่งคีย์นั้นมา (พื้นที่แก้ที่
         บล็อกของมันเอง ไม่ใช่ผ่านฟอร์มแก้หัวใบ) ⇒ ทุกการกดบันทึกตกด่านทันที
         ⇒ ส่ง **แถวพื้นที่ที่มีอยู่จริง** เข้าไปให้ด่านเห็นใบทั้งใบตามเจตนาของมัน
         (`findRequest` โหลด `surveyZones` มาให้แล้วสำหรับหัวข้อนี้) */
      const shapeError = requestShapeError(before.kind, {
        zones: before.surveyZones || [],
        ...before, ...next, items: nextItems,
      });
      if (shapeError) return Response.json({ error: shapeError }, { status: 400 });

      Object.assign(patch, next);
      summary = `แก้ข้อมูลคำร้อง ${before.docNo || before.id}`;
    } else if (action === 'pdr') {
      // ⭐ แก้แบบฟอร์ม PDR — สิทธิ์สลับมือที่จังหวะ "รับเรื่อง" (ดู lib/requests/pdrEdit.js)
      const denied = editPdrError(before, user);
      if (denied) return Response.json({ error: denied }, { status: 403 });

      const { columns, error: pdrError } = normalizePdr(body.pdr);
      if (pdrError) return Response.json({ error: pdrError }, { status: 400 });
      Object.assign(patch, columns);

      /* ⭐ ข้อ 2.2/2.3 · ต้นทุน/ราคาขายรายสินค้า (mig 0229) — **ตรวจตรงนี้ ก่อนเขียน
         อะไรลง DB** ตามกฎเดียวกับที่ route สร้างใบเขียนไว้ ("ตรวจก่อน insert เสมอ") ·
         ตกด่านหลังบรีฟถูกเขียนไปแล้ว = ใบที่บันทึกครึ่งเดียวโดยผู้ใช้เห็นแค่ข้อความ error
         ⚠️ ไม่ส่ง `pdrTargets` มา = ไม่แตะของเดิมเลย (ผู้เรียกที่แก้แค่ส่วนอื่น) ·
         ส่งอาเรย์ว่างมา = สั่งลบทั้งชุด ซึ่งต่างกัน */
      let nextTargets = null;
      if (Array.isArray(body.pdrTargets)) {
        const { targets, error: targetError } = normalizePdrTargets(body.pdrTargets, {
          categoryCodes: columns.pdrProductKinds || before.pdrProductKinds || [],
        });
        if (targetError) return Response.json({ error: targetError }, { status: 400 });
        nextTargets = targets;
      }

      // บรีฟรายกลิ่น — เขียนทับทั้งชุด (แก้ = ส่งมาใหม่ทั้งก้อน ไม่ใช่ patch รายช่อง)
      //
      // ⚠️ **ไม่ลบแล้วสร้างใหม่** ถ้ามี direction ชี้อยู่ — `dept_request_items.briefId`
      // เป็น ON DELETE SET NULL ⇒ ลบบรีฟทิ้งแล้ว direction ที่ RD ส่งไปแล้วจะขาดจาก
      // บรีฟที่มันตอบ · จึงอัปเดตทับตาม id เดิม และห้ามเปลี่ยนจำนวนหลังมีของส่งแล้ว
      const { data: existing, error: loadError } = Array.isArray(body.briefs)
        ? await supabase.from('dept_request_scents').select('id').eq('requestId', id)
          .order('sortOrder', { ascending: true })
        : { data: null, error: null };
      if (loadError) throw loadError;

      // 🔴 **ใบที่ไม่มีบรีฟต้องยังบันทึกส่วนอื่นได้** (ผู้ใช้เจอเอง 2026-08-09) —
      // เดิมพอ `briefs` ว่าง `normalizeScentBriefs` ตีกลับ "ต้องมีบรีฟกลิ่นอย่างน้อย
      // 1 ก้อน" ⇒ คนที่กำลังแก้ *หมวดสินค้า* กดบันทึกแล้วโดนบล็อกด้วยเรื่องคนละส่วน
      // และไม่มีทางแก้ในจอนั้นเลย เพราะจำนวนบล็อกบรีฟมาจากใบสั่งขาย กดเพิ่มเองไม่ได้
      // ⇒ ไม่มีทั้งของเดิมและของใหม่ = ไม่มีอะไรต้องเขียน ข้ามไปเงียบ ๆ
      // ⚠️ **ยังไม่ข้ามเมื่อของเดิมมีอยู่** — ส่งอาเรย์ว่างมาทับใบที่มีบรีฟแล้วคือคำสั่ง
      // ลบทั้งชุด ซึ่งต้องโดนตีกลับเหมือนเดิม (direction ที่ส่งไปแล้วผูกกับบรีฟอยู่)
      if (Array.isArray(body.briefs) && (body.briefs.length || (existing || []).length)) {
        const delivered = (before.items || []).some((i) => i.briefId);
        if (delivered && body.briefs.length !== (existing || []).length) {
          return Response.json({
            error: 'ส่งของไปแล้ว — เปลี่ยนจำนวนบรีฟไม่ได้ เพราะของที่ส่งไปผูกกับบรีฟเดิมอยู่',
          }, { status: 409 });
        }

        const { briefs, error: briefError } = normalizeScentBriefs(body.briefs, {});
        if (briefError) return Response.json({ error: briefError }, { status: 400 });

        for (let i = 0; i < briefs.length; i += 1) {
          const row = briefs[i];
          const target = (existing || [])[i];
          const values = {
            requestId: id,
            sortOrder: row.sortOrder,
            label: row.label,
            brief: row.brief,
            researchTopic: row.researchTopic,
            inspiration: row.inspiration,
            likedNotes: row.likedNotes,
            dislikedNotes: row.dislikedNotes,
            scentotypes: row.scentotypes,
            // ข้อความต่อท้าย Scentotype รายตัว (mig 0222 · ข้อ 2.1.4 บนกระดาษ)
            scentotypeNotes: row.scentotypeNotes || {},
            performance: row.performance,
            updatedAt: nowIso,
          };
          const { error: saveError } = target
            ? await supabase.from('dept_request_scents').update(values).eq('id', target.id)
            : await supabase.from('dept_request_scents').insert({ id: `DRS-${randomUUID()}`, ...values });
          if (saveError) throw saveError;
        }
        // ก้อนที่เกินมาจากของเดิม (ลดจำนวนตอนยังไม่ส่งของ) — ลบทิ้ง
        for (const extra of (existing || []).slice(briefs.length)) {
          const { error: delError } = await supabase
            .from('dept_request_scents').delete().eq('id', extra.id);
          if (delError) throw delError;
        }
      }

      /* เขียนแถว 2.2/2.3 — **ลบทิ้งแล้วเขียนใหม่** ต่างจากบรีฟที่ต้องอัปเดตทับตาม id
         เดิม เพราะบรีฟมี direction ของ RD ชี้กลับมา (`dept_request_items.briefId`)
         แต่แถวราคาไม่มีใครชี้ถึง ⇒ ลบ-เขียนใหม่คือท่าที่ตรงกับความหมาย: ผู้ใช้จัด
         ลำดับใหม่/เอาออก/เพิ่มได้อิสระในรอบเดียว (ด่านตรวจอยู่ข้างบนก่อนเขียนอะไรลง DB) */
      if (nextTargets) {
        const { error: clearError } = await supabase
          .from('dept_request_pdr_targets').delete().eq('requestId', id);
        if (clearError) throw clearError;
        if (nextTargets.length) {
          const { error: insertError } = await supabase.from('dept_request_pdr_targets')
            .insert(nextTargets.map((t) => ({ ...t, id: `DPT-${randomUUID()}`, requestId: id })));
          if (insertError) throw insertError;
        }
      }
      /* ⭐ เก็บ "ช่องไหนเปลี่ยนจากอะไรเป็นอะไร" ไว้ลงเธรด (IS-26080021) — ต้องคิด
         **ก่อน** เขียน patch ลง DB เพราะหลังจากนั้น `before` ไม่มีค่าเดิมให้เทียบแล้ว */
      pdrChanges = pdrChangeSummary(before, columns);
      summary = `แก้แบบฟอร์ม PDR ${before.docNo || id}`;
    } else if (action === 'reschedule') {
      // ⭐ **เลื่อนวันกำหนดส่ง** — RD แจ้งวันไปแล้วเปลี่ยนใจได้ (มติผู้ใช้)
      // ⚠️ ใบที่ยังไม่เคยแจ้งวันไปทาง `commit-due` — ด่านที่ `stages.js` กันไว้แล้ว
      //
      // ⚠️ **ไม่แก้เงียบ ๆ** — วันกำหนดส่งคือคำสัญญาที่ให้ฝ่ายขายไปแล้ว และเป็นตัวที่
      // ใช้นับว่าเลยกำหนดหรือยัง ⇒ เลื่อนแล้วต้องเห็นในเธรดว่าเลื่อนจากวันไหนเป็น
      // วันไหน ไม่งั้น "ไม่เคยเลยกำหนดสักใบ" จะกลายเป็นเรื่องจริงที่ไม่มีความหมาย
      if (!canAnswerRequest(user, before)) {
        return Response.json({ error: `เลื่อนวันได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
      }
      // ด่านทั้งชุดอยู่ที่ lib/requests/stages.js — route ไม่คิดกฎเอง
      const err = rescheduleRequestError(before, { committedDueDate: body.committedDueDate });
      if (err) return Response.json({ error: err }, { status: /ระบุวัน/.test(err) ? 400 : 409 });

      const next = String(body.committedDueDate).trim();
      patch.committedDueDate = next;
      // ⚠️ เลื่อนวันก็คือการลงวันใหม่ — ไม่ประทับที่นี่ด้วย ใบที่แจ้งครั้งแรกแล้วเลื่อน
      // ก่อนมีรอบแก้ จะถือ `dueCommittedAt` ของครั้งแรกซึ่งเก่ากว่าความจริง (mig 0288)
      patch.dueCommittedAt = nowIso;
      const reason = String(body.reason ?? '').trim();
      if (reason.length > 500) {
        return Response.json({ error: 'เหตุผลยาวเกิน 500 ตัวอักษร' }, { status: 400 });
      }
      // ⚠️ ต้องส่งต่อให้เธรดด้วย ไม่ใช่จบที่ audit log — ดูเหตุผลที่ appendRequestEvent
      eventReason = reason || null;
      // ⚠️ เขียน **วันเดิม → วันใหม่** ลงเธรด ไม่ใช่แค่ "แก้วันแล้ว" — คนอ่านย้อนหลัง
      // ต้องเห็นว่าเลื่อนไปกี่ครั้งและครั้งละกี่วัน โดยไม่ต้องไปขุด audit log
      summary = `เลื่อนวันกำหนดส่ง ${before.committedDueDate || '(ไม่เคยระบุ)'} → ${next}`
        + (reason ? ` — ${reason}` : '');
      /* ⭐ ใบประเมิน: เลื่อนวันบนใบ = **เลื่อนนัดของช่างด้วย** (แผน เฟส 2)
         ⚠️ เวลาแก้ได้พร้อมกัน — ไม่ส่งมา = ไม่แตะเวลาเดิม (ต่างจากส่งค่าว่างที่แปลว่า
            "เอาเวลาออก ไปทั้งวัน") */
      if (requestNeedsRef(before.kind, 'site')) {
        /* เวลาเปลี่ยนพร้อมวันได้ — **คีย์ต้องถูกส่งมาจริง** ถึงจะถือว่า "ตั้งใจแก้เวลา"
           (ค่าว่าง = เอาเวลาออก ไปทั้งวัน · ไม่ส่งคีย์เลย = ไม่แตะเวลาเดิม) */
        if ('committedDueTime' in body) {
          const raw = String(body.committedDueTime ?? '').trim();
          if (raw && !toHHMM(raw)) {
            return Response.json({ error: 'เวลานัดไม่ถูกต้อง' }, { status: 400 });
          }
          patch.committedDueTime = raw ? toHHMM(raw) : null;
        }
        summary = `เลื่อนวันนัดเข้าพื้นที่ ${before.committedDueDate || '(ไม่เคยระบุ)'} → ${next}`
          + (reason ? ` — ${reason}` : '');
      }
    } else if (action === 'assign') {
      /* ⭐ **มอบหมายให้คนในฝ่าย** (mig 0230 · มติผู้ใช้ 2026-08-12) — คนละเรื่องกับ
         "รับเรื่อง": รับเรื่องคือคำสัญญาของ *ฝ่าย* ต่อผู้ขอ · มอบหมายคือการจัดคน
         *ในฝ่าย* ซึ่งเปลี่ยนได้หลายรอบระหว่างทาง
         ⚠️ สิทธิ์เดียวกับการตอบ (`canAnswerRequest`) — คนนอกฝ่ายจัดคนในฝ่ายอื่นไม่ได้
         ⚠️ **ไม่ตรวจว่าคนที่ถูกมอบหมายอยู่ฝ่ายนี้จริงไหม** โดยตั้งใจ — งานข้ามฝ่าย
         มีจริง (RD ยืมคน QC มาช่วยดม) และการบล็อกจะทำให้ต้องแก้ทะเบียนก่อนทำงาน */
      if (!canAnswerRequest(user, before)) {
        return Response.json({ error: `มอบหมายได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
      }
      const err = assignRequestError(before, {
        assigneeId: body.assigneeId ?? null,
        assigneeName: body.assigneeName ?? null,
      });
      if (err) return Response.json({ error: err }, { status: 409 });
      Object.assign(patch, assignPatch({
        assigneeId: body.assigneeId ?? null,
        assigneeName: body.assigneeName ?? null,
        by: user,
        nowIso,
      }));
      // ⚠️ ลงเธรดเสมอ รวมตอน **ถอน** — "ทำไมงานกลับมาอยู่กองกลาง" ต้องตามได้
      summary = patch.assigneeId || patch.assigneeName
        ? `มอบหมายให้ ${patch.assigneeName || patch.assigneeId}`
        : `ถอนการมอบหมาย${before.assigneeName ? ` (เดิม ${before.assigneeName})` : ''}`;
    // ⚠️ action `approve` (ประตูหัวหน้าสายงานขาย · mig 0216) เคยอยู่ตรงนี้ — ถอดออก
    // ทั้งขั้นตามมติผู้ใช้ 2026-08-16 · RD รับเรื่องแล้วลงมือได้เลย · ผู้เรียกที่ยังยิง
    // `action: 'approve'` มาจะตกท้าย else เป็น 400 "action ไม่ถูกต้อง" ซึ่งถูกแล้ว
    } else if (action === 'bounce') {
      // ⭐ ตีกลับ = ผู้รับเรื่องส่งคืนผู้ยื่น ⇒ สิทธิ์เป็นของ **ฝ่ายปลายทาง** ไม่ใช่ผู้ขอ
      // (ผู้ขอเอาใบคืนเองเรียก "ดึงกลับ" ซึ่งเป็นคนละเรื่องและยังไม่มีในรอบนี้)
      if (!canAnswerRequest(user, before)) {
        return Response.json({ error: `ตีกลับได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
      }
      const err = bounceRequestError(before, { reason: body.reason });
      if (err) return Response.json({ error: err }, { status: 409 });
      // ⚠️ **ไม่แตะ docNo** — trigger ห้ามแก้อยู่แล้ว และนั่นคือสิ่งที่ต้องการ:
      // ใบเดิมกลับไปเป็นร่างพร้อมเลขที่เดิม ไม่ใช่ใบใหม่
      patch.status = 'draft';
      patch.bounceReason = String(body.reason).trim();
      patch.bouncedAt = nowIso;
      patch.bouncedById = user?.id ?? null;
      patch.bouncedByName = user?.name ?? null;
      summary = `ตีกลับ ${before.docNo || id}`;
    } else if (action === 'answer') {
      // ชนิดที่ไม่มีบรรทัด: ระบบไม่มีทางรู้ว่าคำตอบครบหรือยัง ผู้ตอบกดเองว่าตอบแล้ว
      // (ชนิดที่มีบรรทัดใช้ /answer ซึ่ง derive สถานะจากรายการให้อัตโนมัติ)
      if (requestHasItems(before.kind)) {
        return Response.json({ error: 'ชนิดนี้ตอบเป็นรายบรรทัด' }, { status: 400 });
      }
      if (!canAnswerRequest(user, before)) {
        return Response.json({ error: `ตอบได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
      }
      const err = answerRequestError(before);
      if (err) return Response.json({ error: err }, { status: 409 });
      /* ⭐ **ปุ่มนี้คือตราปิดของฝั่งฝ่าย** (มติผู้ใช้ 2026-08-20 · ปิดสองฝั่ง) — ใบจบ
         ก็ต่อเมื่อผู้ขอกด "ปิดเรื่อง" ด้วย · กดก่อน/หลังกันได้ทั้งคู่ (ดู `closure.js`) */
      patch.answeredAt = nowIso;
      patch.answeredById = user?.id ?? null;
      patch.answeredByName = user?.name ?? null;
      patch.status = closureStatus({
        status: before.status, answeredAt: nowIso, closedAt: before.closedAt,
      });
      summary = `ตอบคำร้อง ${before.docNo || id}`
        + (patch.status === 'closed'
          ? ' · ปิดครบสองฝั่ง'
          : ` — ${requestSideText(before, 'requester', 'ยังไม่ปิด')}`);
    } else if (action === 'close') {
      // ⭐ **ปิดสองฝ่าย** (มติผู้ใช้ 2026-08-08 · ม-89): แถวทุกแถวจบด้วยมือของ
      // สองฝ่ายอยู่แล้ว (ฝ่ายส่ง → ผู้ขอกดรับ · หรือฝ่ายปฏิเสธพร้อมเหตุผล) แล้ว
      // **ผู้ขอเป็นคนกดปิด** — ฝ่ายปลายทางลากปิดเองไม่ได้ ไม่งั้นการปิดเป็นการ
      // ตัดสินฝ่ายเดียวทั้งที่ผู้ขอยังไม่ได้ยืนยันว่าของที่ได้ใช้ได้จริง
      if (!canManageRequest(user, before)) {
        return Response.json({
          error: 'ปิดเรื่องได้เฉพาะฝ่ายผู้ขอ — ฝ่ายปลายทางจบงานผ่านรายการ (ส่ง/ปฏิเสธ) แล้วผู้ขอเป็นคนปิด',
        }, { status: 403 });
      }
      const err = closeRequestError(before, before.items);
      if (err) return Response.json({ error: err }, { status: 409 });

      // ชนิดที่มีผลลัพธ์ (บรีฟกลิ่น) ต้องบอกก่อนว่าได้ของอะไรออกมา — ดูเหตุผลใน
      // lib/deptRequests.js · ทำก่อน update หัวเรื่อง เพื่อไม่ให้ปิดสำเร็จแต่ทะเบียนพัง
      const outcomeErr = closeOutcomeError(before, body.outcome);
      if (outcomeErr) return Response.json({ error: outcomeErr }, { status: 400 });
      const linked = await resolveScentOutcome(supabase, before, body.outcome, user);
      if (linked?.error) return Response.json({ error: linked.error }, { status: 400 });
      if (linked?.scentId) patch.scentId = linked.scentId;

      /* ⭐ **ปิดฝั่งผู้ขอ ≠ ใบจบ** (มติผู้ใช้ 2026-08-20) — ใบจบเมื่อมีตราครบสองฝั่ง ·
         ฝั่งฝ่ายคือ `answeredAt` (มาเองเมื่อแถวครบ หรือปุ่ม "ตอบแล้ว" ของใบไม่มีแถว)
         🐞 ของเดิมกดปุ่มนี้แล้วใบ `closed` ทันที ⇒ ใบสอบถามที่ฝ่ายยังไม่ตอบสักคำก็ปิดได้
         และงานที่ค้างจริงหายจากคิวเงียบ ๆ */
      patch.closedById = user?.id ?? null;
      patch.closedByName = user?.name ?? null;
      patch.closedAt = nowIso;
      patch.status = closureStatus({
        status: before.status, answeredAt: before.answeredAt, closedAt: nowIso,
      });
      summary = (patch.status === 'closed'
        ? `ปิดเรื่อง ${before.docNo || id} · ครบสองฝั่ง`
        : `ผู้ขอปิดฝั่งตัวเอง ${before.docNo || id} — ${requestSideText(before, 'dept', 'ยังไม่ตอบ')}`)
        + (linked?.created ? ' · เพิ่มกลิ่นเข้าทะเบียน' : linked?.scentId ? ' · ผูกกลิ่นในทะเบียน' : '');
    } else if (action === 'reopen') {
      /* ⭐ **"ยังไม่จบ" — ถอนตราปิดที่กดไปแล้ว** (มติผู้ใช้ 2026-08-20) — กดได้ทั้ง
         สองฝั่ง: ฝั่งที่กดไปแล้วเปลี่ยนใจ หรืออีกฝั่งที่รู้ว่างานยังไม่จบจริง
         ⚠️ ใบที่ปิดครบสองฝั่งแล้วเปิดกลับไม่ได้ — ด่านที่ `reopenRequestError` กันไว้ */
      if (!canAnswerRequest(user, before) && !canManageRequest(user, before)) {
        return Response.json({ error: 'ทำได้เฉพาะผู้ขอกับฝ่ายที่รับเรื่อง' }, { status: 403 });
      }
      const reason = String(body.reason ?? '').trim();
      const err = reopenRequestError(before, { reason });
      if (err) return Response.json({ error: err }, { status: /ต้องบอก|ยาวเกิน/.test(err) ? 400 : 409 });
      const closure = requestClosure(before);
      patch.answeredAt = null;
      patch.answeredById = null;
      patch.answeredByName = null;
      patch.closedAt = null;
      patch.closedById = null;
      patch.closedByName = null;
      patch.status = 'acknowledged';
      eventReason = reason;
      summary = `ยังไม่จบ — ถอนการปิดของ${closure.deptDone ? before.dept || 'ฝ่ายผู้รับ' : 'ผู้ขอ'}`
        + ` ${before.docNo || id} — ${reason}`;
    } else if (action === 'cancel') {
      if (!canManageRequest(user, before)) {
        return Response.json({ error: 'ยกเลิกได้เฉพาะผู้เปิดเรื่อง' }, { status: 403 });
      }
      const err = cancelRequestError(before);
      if (err) return Response.json({ error: err }, { status: 409 });
      const reason = String(body.cancelReason ?? '').trim();
      if (!reason) return Response.json({ error: 'ต้องระบุเหตุผลที่ยกเลิก' }, { status: 400 });
      patch.status = 'cancelled';
      patch.cancelReason = reason.slice(0, 500);
      patch.cancelledAt = nowIso;
      summary = `ยกเลิกคำร้อง ${before.docNo || id}`;
    } else if (action === 'pdr-ref') {
      /* ⭐ **ออกเลขที่เอกสารย้อนหลังทีละใบ** (มติผู้ใช้ 2026-08-20) — ใบที่รับเรื่อง
         ไปก่อน mig 0271 ไม่มีเลข และ **ไม่ backfill อัตโนมัติ** เพราะการไล่ออกเลขให้
         ทุกใบย้อนหลังคือการใช้เลขรันของเดือนเก่าไปกับใบที่ไม่มีใครจะพิมพ์แล้ว
         ⚠️ วันบนเลขมาจาก `acknowledgedAt` **ของใบนั้น** ไม่ใช่วันที่กดปุ่ม — ไม่งั้น
         ใบที่รับเรื่องเดือนก่อนจะไปกินเลขรันของเดือนนี้ */
      if (!canAnswerRequest(user, before)) {
        return Response.json({ error: `ออกเลขที่เอกสารได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
      }
      const err = pdrRefNoError(before);
      if (err) return Response.json({ error: err }, { status: 409 });
      pdrRefAt = before.acknowledgedAt;
      // ⚠️ **ไม่ลงเธรด** โดยตั้งใจ — `askActionUpdate` ไม่รู้จัก action นี้ (คืน null)
      // เพราะมันเป็นงานธุรการของฝ่ายบนใบที่ทุกฝ่ายรับรู้สถานะแล้ว ไม่ใช่ก้าวของงาน ·
      // หลักฐานว่าใครกดเมื่อไรอยู่ที่ `recordAudit` ท้าย handler
      summary = 'ออกเลขที่เอกสาร PDR';
    } else if (action === 'pdr-ref-manual') {
      /* ⭐ **ช่วงเปลี่ยนผ่าน: RD กรอกเลขของตัวเอง** (มติผู้ใช้ 2026-08-20 · mig 0272)
         — ใบที่รับเรื่องก่อนเดือนที่ระบบเริ่มออกเลข ต้องลอกเลขจากกระดาษที่ออกไปแล้ว
         ⚠️ **เขียน `pdrRefManual` ทุกครั้ง** — ธงนี้คือสิ่งเดียวที่บอก trigger ว่าเลข
         ใบนี้แก้ได้ · ลืมเขียน = เลขที่พิมพ์ผิดล็อกถาวรตั้งแต่ครั้งแรก
         ⚠️ ธงห้ามพลิกหลังมีเลขแล้ว (trigger กันไว้) ⇒ ใบที่มีเลขอยู่แล้วส่งค่าเดิมไป
         ไม่ใช่ค่าใหม่ */
      if (!canAnswerRequest(user, before)) {
        return Response.json({ error: `กรอกเลขที่เอกสารได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
      }
      const err = pdrRefManualError(before, body.pdrRefNo);
      if (err) return Response.json({ error: err }, { status: /รูปแบบ|กรุณากรอก/.test(err) ? 400 : 409 });
      patch.pdrRefNo = normalizePdrRefNo(body.pdrRefNo);
      patch.pdrRefManual = true;
      summary = before.pdrRefNo
        ? `แก้เลขที่เอกสาร PDR ${before.pdrRefNo} → ${patch.pdrRefNo}`
        : `กรอกเลขที่เอกสาร PDR ${patch.pdrRefNo}`;
    } else {
      return Response.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 });
    }

    let saved = null;
    let error = null;
    if (issueDocNo) {
      ({ data: saved, error } = await assignRequestDocNo(supabase, before, patch));
    } else if (pdrRefAt) {
      ({ data: saved, error } = await assignPdrRefNo(supabase, id, patch, new Date(pdrRefAt)));
    } else {
      ({ data: saved, error } = await supabase.from('dept_requests').update(patch).eq('id', id));
    }
    /* 🪤 **เลขซ้ำต้องเป็นข้อความไทย ไม่ใช่ 500** — ช่วงกรอกเองคนพิมพ์เลขที่ใบอื่น
       ใช้ไปแล้วได้ง่ายมาก (ลอกจากกระดาษผิดแผ่น) · unique index
       `dept_requests_pdr_ref_no_key` เป็นด่านจริง ตรวจฝั่ง JS ก่อนไม่พอเพราะสองคน
       กรอกพร้อมกันได้ */
    if (error?.code === '23505' && /pdr_ref_no/.test(error.message || '')) {
      return Response.json({ error: 'เลขที่เอกสารนี้ถูกใช้กับคำร้องใบอื่นแล้ว' }, { status: 409 });
    }
    if (error) throw error;

    /* ── บรรทัดของ action 'update' — เขียน **หลัง** หัวใบผ่านแล้วเท่านั้น ─────
       ⚠️ **ไม่มี transaction ข้ามตาราง** (PostgREST ไม่มีให้) — ลำดับจึงเป็น
       "ลบ → แก้ → เพิ่ม" · ลบก่อนเพราะแถวที่ถูกลบไม่มีวันชนกับแถวใหม่ และ
       `sortOrder` ของชุดใหม่ถูกคิดจากตำแหน่งในฟอร์มอยู่แล้ว
       ⚠️ **ไม่ลบแล้วสร้างใหม่ทั้งชุด** — id ของแถวคือ `attachments.entityId`
       (ดู `requestLineEdit.js`) */
    if (lineWrites) {
      if (lineWrites.remove.length) {
        /* ⚠️ **กวาดไฟล์แนบของแถวก่อน** — `attachments` เป็น polymorphic ไม่มี FK
           cascade (ดู `purgeAttachments`) · ลบแถวเฉย ๆ แล้วไฟล์บน Drive กับแถว
           attachment จะค้างชี้ id ที่ไม่มีแล้ว · สายพัฒนาสูตรให้ผู้ขอแนบรูป/สเปก
           รายแถวได้ตั้งแต่ร่าง ⇒ เกิดจริงได้ ไม่ใช่เคสสมมติ */
        for (const rowId of lineWrites.remove) {
          await purgeAttachments('dept_request_item', rowId).catch(() => {});
        }
        const { error: removeError } = await supabase
          .from('dept_request_items').delete().in('id', lineWrites.remove);
        if (removeError) throw removeError;
      }
      for (const row of lineWrites.update) {
        const { error: rowError } = await supabase
          .from('dept_request_items').update({ ...row.patch, updatedAt: nowIso })
          .eq('id', row.id);
        if (rowError) throw rowError;
      }
      if (lineWrites.insert.length) {
        const { error: insertError } = await supabase.from('dept_request_items').insert(
          lineWrites.insert.map((row) => ({
            id: `DRI-${randomUUID()}`,
            requestId: id,
            ...row,
            createdAt: nowIso,
            updatedAt: nowIso,
          })),
        );
        if (insertError) throw insertError;
      }
      /* ⚠️ **บอกว่าเปลี่ยนอะไร ไม่ใช่แค่ "แก้ข้อมูลคำร้อง"** — บรรทัดคือของที่ฝ่าย
         ปลายทางเอาไปทำงานจริง · ใบที่ยังไม่ถูกรับเรื่องก็มีคนเปิดดูบนคิวไปแล้ว */
      const parts = [
        lineWrites.insert.length && `เพิ่ม ${lineWrites.insert.length}`,
        lineWrites.update.length && `แก้ ${lineWrites.update.length}`,
        lineWrites.remove.length && `ลบ ${lineWrites.remove.length}`,
      ].filter(Boolean);
      summary += ` · รายการ: ${parts.join(' · ')}`;
    }

    /* ── รับเรื่องที่ใบ ⇒ ประทับลงแถวที่ยังไม่มี ─────────────────────────────
       ⚠️ `.is('ackAt', null)` **ไม่ใช่ `.eq('ackAt', null)`** — PostgREST แปล `eq`
       เป็น `= NULL` ซึ่งไม่เคยจริง ⇒ อัปเดตศูนย์แถวแบบเงียบ ๆ (กับดักเดิมของรีโปนี้)
       ⚠️ วันไทย ไม่ใช่วัน UTC — กดรับตอนเช้ามืดแล้ววันจะถอยไปหนึ่งวัน
       ⚠️ ล้มแล้ว **ไม่ throw** — ใบถูกรับเรื่องไปแล้วจริง ย้อนไม่ได้ · ปล่อยให้ทั้ง
       request ล้มจะได้ผู้ใช้กดซ้ำแล้วเจอ "รับเรื่องไปแล้ว" ทั้งที่ของจริงบันทึกแล้ว
       (เหตุผลเดียวกับบล็อกวันส่งของ items route) */
    if (ackFanOut) {
      const { error: ackError } = await supabase.from('dept_request_items').update({
        ackAt: businessDate(),
        ackById: user?.id ?? null,
        ackByName: user?.name ?? null,
        updatedAt: nowIso,
      }).eq('requestId', id).is('ackAt', null);
      if (ackError) console.error('[requests] ประทับวันรับเรื่องลงแถวไม่สำเร็จ:', ackError.message);
    }

    /* ── นัดของช่าง: เกิด/ขยับตามวันบนใบ (แผน เฟส 2) ─────────────────────
       ⭐ **ลงคิว = ใบได้วัน + ช่างได้นัด** ⇒ เขียนนัดหลังหัวใบผ่าน ด้วยเหตุผลเดียวกับ
          `ackFanOut`: ใบถูกบันทึกไปแล้วจริง ย้อนไม่ได้
       ⚠️ ล้มแล้ว **ไม่ throw** — แต่ต้อง **ไม่เงียบ**: ใบที่มีวันแต่ไม่มีนัด = ช่างไม่เห็น
          งานบนตาราง · เขียน error ลง log แล้วให้ audit summary บอกว่านัดยังไม่เกิด
       ⚠️ `commit-due` รอบสอง (รอบแก้) ไม่สร้างนัดซ้ำ — มีนัดอยู่แล้วก็ขยับตัวเดิม
          ("หนึ่งใบ = หนึ่งนัด") */
    /* ⭐ **เปลี่ยนช่างบนใบ = เปลี่ยนช่างบนนัดด้วย** — ใบกับตารางช่างชี้คนละคนไม่ได้
       ⚠️ ทำก่อนบล็อกวัน/นัดข้างล่าง เพราะเป็นคนละ action กัน (ไม่มีทางเข้าพร้อมกัน) */
    if (requestNeedsRef(before.kind, 'site') && action === 'assign') {
      try {
        const visit = await findSurveyVisit(supabase, id);
        if (visit && !CLOSED_VISIT_STATES.includes(visit.status)) {
          const { error: assignError } = await supabase.from('service_visits').update({
            assigneeId: patch.assigneeId || null,
            assigneeName: patch.assigneeName || null,
            updatedAt: nowIso,
          }).eq('id', visit.id);
          if (assignError) {
            visitWarning = `ใบเปลี่ยนผู้รับผิดชอบแล้ว แต่นัด ${visit.code || ''} ยังเป็นชื่อเดิม`;
          }
        }
      } catch (e) {
        visitWarning = `ใบเปลี่ยนผู้รับผิดชอบแล้ว แต่แก้ชื่อบนนัดไม่สำเร็จ: ${e.message}`;
      }
      if (visitWarning) console.error('[requests] สายนัดประเมิน:', visitWarning);
    }

    if (requestNeedsRef(before.kind, 'site') && (action === 'commit-due' || action === 'reschedule')) {
      try {
        /* ⚠️ ค่าที่นัดต้องใช้ หยิบจาก **ใบหลังแก้** เสมอ — `reschedule` เลื่อนวันอย่างเดียว
           ไม่ได้ส่งช่างมาด้วย ⇒ อ่านจากค่าที่ใบถือไว้ตั้งแต่ลงคิว
           🐞 ของเดิมอ่านจาก `patch` ล้วน ⇒ เส้นที่ต้องสร้างนัดใหม่ตอน reschedule จะได้
              นัดไม่มีช่าง แล้วตกด่านเข้าไซต์กลายเป็นร่างที่ไม่ขึ้นตารางใคร */
        const date = patch.committedDueDate;
        const time = 'committedDueTime' in patch ? patch.committedDueTime : before.committedDueTime;
        const assigneeId = patch.assigneeId ?? before.assigneeId ?? null;
        const assigneeName = patch.assigneeName ?? before.assigneeName ?? null;

        const moved = await moveSurveyVisit(supabase, {
          requestId: id,
          date,
          time: 'committedDueTime' in patch ? patch.committedDueTime : undefined,
        });
        if (moved.error) {
          visitWarning = `ใบลงวันแล้ว แต่ขยับนัดของช่างไม่สำเร็จ: ${moved.error}`;
        } else if (moved.needsNew) {
          /* ⭐ **เส้นกู้** — ไม่มีนัด (สร้างไม่สำเร็จรอบก่อน · ถูกลบ) หรือนัดเดิมจบไปแล้ว
             (ไปแล้วเข้าไม่ได้ · ยกเลิก) ⇒ สร้างใบใหม่ตรงนี้
             🐞 ไม่มีเส้นนี้ = ใบค้างสถานะ "ลงวันแล้วแต่ไม่มีนัด" แบบกู้ไม่ได้ เพราะ
                `commit-due` กดซ้ำไม่ได้อีกแล้วเมื่อใบมีวันอยู่ */
          const { site, error: siteError } = await loadSurveySite(supabase, before.siteId, null);
          if (siteError || !site) {
            visitWarning = 'ใบลงวันแล้ว แต่หาสถานที่ของใบไม่เจอ — นัดยังไม่ขึ้นตารางช่าง';
          } else {
            const { visit, error: visitError } = await createSurveyVisit(supabase, {
              request: { ...before, ...patch },
              site,
              date,
              time,
              assigneeId,
              assigneeName,
              user,
            });
            if (visitError) visitWarning = `ใบลงวันแล้ว แต่สร้างนัดไม่สำเร็จ: ${visitError}`;
            else if (visit?.code) {
              summary += ` · นัด ${visit.code}`;
              /* ⚠️ นัดที่ไม่ผ่านด่านเข้าไซต์จอดเป็น **ร่าง** — ไม่ขึ้นตารางใคร
                 ⇒ ต้องบอกตรงนั้น ไม่ใช่ให้คนไปค้นเองว่าทำไมช่างไม่เห็นงาน */
              if (visit.status === 'draft') {
                visitWarning = `นัด ${visit.code} ยังเป็นร่าง — ยังไม่ขึ้นตารางช่าง `
                  + '(ตรวจช่วงเวลาที่ไซต์ให้เข้า หรือช่างที่เลือก) แก้ได้ที่หน้าจัดคิวช่าง';
              }
            }
          }
        }
      } catch (e) {
        visitWarning = `ใบลงวันแล้ว แต่สายนัดล้ม: ${e.message}`;
      }
      if (visitWarning) console.error('[requests] สายนัดประเมิน:', visitWarning);
    }

    // เลขจริงรู้ได้หลังฟังก์ชันออกให้เท่านั้น (ใบใหม่ยังไม่มีเลขตอนประกอบ summary)
    if (issueDocNo && saved?.docNo) summary = `ส่งคำร้อง ${saved.docNo} ถึงฝ่าย ${before.dept}`;
    if (action === 'pdr-ref' && saved?.pdrRefNo) summary = `ออกเลขที่เอกสาร PDR ${saved.pdrRefNo}`;

    // ใบขอราคาผลิตที่คำร้องนี้ถามแทน: เปิด = ใบเป็น 'pricing', ปิด/ยกเลิก = คืนสถานะ
    if (before.costingRequestId) await syncCostingPricingStatus(supabase, before.costingRequestId);

    const after = await findRequest(supabase, id);
    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id, before, after, summary, request,
    });

    // เหตุการณ์ลงเธรด **ทั้งของคำร้องและของดีลแม่** ในครั้งเดียว (มติ 2026-08-03:
    // "รวมเข้าเธรดของดีล") — ไม่เช็ค error โดยเจตนา: เขียนเธรดพลาดต้องไม่ทำให้
    // action ที่ DB บันทึกสำเร็จแล้วตอบ 500 (กติกาเดียวกับ autoTaskUpdates)
    //
    // @mention มาพร้อมตอน "ส่ง" เท่านั้น — ร่างยังไม่ใช่งานของใคร แจ้งเตือนคนอื่น
    // ให้มาดูเรื่องที่ยังไม่ถูกส่งคือเรียกเขามาดูหน้าที่กดอะไรไม่ได้
    // ⚠️ ด่านจริงคือ sanitizeMentions ซึ่งเช็คทีละคนด้วย canViewUpdates ของ
    // `dept_request` — @คนที่เปิดคำร้องนี้ไม่ได้ จะถูกตัดออกที่นี่ ไม่ใช่ที่ dropdown
    const mentions = action === 'submit'
      ? await sanitizeMentions(supabase, 'dept_request', after, body.mentions)
      : [];
    await appendRequestEvent(supabase, {
      request: after, action,
      opts: {
        reason: patch.cancelReason ?? patch.bounceReason ?? eventReason,
        pdrChanges,
        // วันเดิมก่อนเลื่อน — อ่านจาก `before` เพราะ `after` ถูกทับไปแล้ว
        previousDueDate: before.committedDueDate ?? null,
        // ⚠️ อ่านจาก `patch` ไม่ใช่ `body` — ตอนถอนมอบหมาย `patch` เป็น null ชัดเจน
        // ส่วน body อาจไม่ส่งคีย์มาเลย แล้วเธรดจะเขียนว่า "มอบหมายให้ undefined"
        assigneeName: patch.assigneeName ?? null,
      },
      user,
      mentions,
    });

    return Response.json({
      ...after,
      // ครึ่งหลังของงานล้ม — จอต้องทักเป็นคำเตือน ไม่ใช่ขึ้น "สำเร็จ" เฉย ๆ
      ...(visitWarning ? { _warning: visitWarning } : {}),
      _mine: canManageRequest(user, after),
      _canEditPdr: canEditPdr(user, after),
      // ต้องคืนคู่กับ `_editPdrBlocker` เสมอ — จอตัดสินว่าจะโชว์ปุ่มแก้แบบกดไม่ได้
      // หรือซ่อนทิ้ง จากสองค่านี้รวมกัน
      _editBlocker: requestEditError(after, user),
      // ต้องคืนคู่กับ `_canEditPdr` เสมอ — สองอันนี้มาจากด่านเดียวกัน ขาดตัวใดตัวหนึ่ง
      // แล้วหน้าจอหลัง PATCH จะรู้ว่า "กดไม่ได้" แต่ไม่รู้ว่าทำไม
      _editPdrBlocker: editPdrError(after, user),
    });
  } catch (e) {
    // guard ระดับ DB โยนรหัสดิบ — แปลก่อนส่งขึ้นจอ ไม่งั้นผู้ใช้เห็นแต่ชื่อ exception
    return Response.json({ error: requestGuardMessage(e) || e.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });
  if (!canViewRequests(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  // ── บังคับลบ (break-glass ของผู้ดูแลระบบ) ──────────────────────────────
  //
  // 🔴 เดิมกั้นด้วย `isSuperuser` ซึ่งรวม `ae_supervisor` → หัวหน้าทีมขายลบคำร้องที่
  // ส่งแล้ว (ของที่ guard ระดับ DB ตั้งใจกัน) ได้ · endpoint force ทุกตัวในระบบใช้
  // `canForceDelete` = role admin เท่านั้น (ดูเหตุผลใน lib/forceDelete.js) — ที่นี่
  // เป็นตัวเดียวที่หลุดมาตรฐาน
  const force = isForceRequest(request);
  const dryRun = isDryRun(request);
  if (force || dryRun) {
    if (!canForceDelete(user)) {
      return Response.json({ error: 'บังคับลบต้องเป็นผู้ดูแลระบบ (admin)' }, { status: 403 });
    }
    // พรีวิวใช้เส้นทางเดียวกับตอนลบจริง — สิ่งที่โชว์ = สิ่งที่จะโดนลบเป๊ะ
    if (dryRun) return Response.json(await requestForcePreview(supabase, before));
  } else {
    if (!canManageRequest(user, before)) return Response.json({ error: 'ไม่มีสิทธิ์ลบคำร้องนี้' }, { status: 403 });
    const err = deleteRequestError(before);
    if (err) return Response.json({ error: err }, { status: 409 });
  }

  try {
    // ลูกที่ไม่มี FK จริง (ไฟล์แนบสองระดับ + งานที่สร้างจากคำร้อง + เธรดของงานนั้น)
    // ต้องกวาด **ก่อน** ลบแถวแม่ · โยน error แล้วหยุด ไม่ลบต่อ ไม่งั้นคำร้องหายแต่
    // ลูกค้างเป็นแถวกำพร้าที่ไม่มีทางเข้าถึง (รูเดิมของเส้นนี้ — ตอนลบดีลมี
    // cleanupDealOrphans กวาดให้ แต่ลบคำร้องทีละใบไม่มีใครกวาด)
    await cleanupRequestOrphans(supabase, id);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }

  // guard ระดับ DB บล็อกการลบคำร้องที่ส่งแล้ว — admin ต้องผ่าน RPC ที่ตั้ง flag ให้
  const { error } = force
    ? await supabase.rpc('force_delete_dept_request', { p_id: id })
    : await supabase.from('dept_requests').delete().eq('id', id);
  if (error) {
    return Response.json({ error: requestGuardMessage(error) || error.message }, { status: 500 });
  }
  // เธรดไม่มี FK กับคำร้อง (polymorphic) — ลบแล้วต้องเก็บกวาดเอง ไม่งั้นเหลือเธรด
  // ลอยที่ไม่มีเจ้าของ · ครอบทั้งเส้นปกติและเส้น force (RPC ไม่รู้จักตารางนี้)
  await purgeUpdates(supabase, 'dept_request', id);
  if (before.costingRequestId) await syncCostingPricingStatus(supabase, before.costingRequestId);

  await recordAudit({
    user, action: 'delete', entityType: 'dept_request', entityId: id, before,
    summary: force
      ? `[admin force] ลบคำร้อง ${before.docNo || id} (สถานะ ${before.status})`
      : 'ลบร่างคำร้องที่ยังไม่ส่ง',
    request,
  });
  return Response.json({ ok: true, forced: force });
}
