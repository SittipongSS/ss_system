// ── API คำร้องข้ามฝ่ายรายเรื่อง (mig 0173) ──────────────────────────────
// GET    : รายละเอียด (canViewRequests + **ต้องเป็นใบของตัวเอง/ของฝ่ายตน** — ดู
//          canReadRequestRow; เดิมด่านนี้ไม่ดูแถวเลย เปิดตรงด้วย id ได้ทุกใบ)
// PATCH  : submit (ผู้ขอ — ออกเลขตาม scope ของชนิด + แจ้ง space ฝ่าย + @mention)
//          acknowledge (RD/PC รับเรื่อง = ตัดรอบ) · commit-due (แจ้งกำหนดส่ง —
//          ก้าวแยกจากการรับเรื่อง) · answer (ชนิดที่ไม่มี
//          บรรทัด — ตอบเสร็จแล้ว) · close (ปิดเรื่อง) · cancel (ผู้ขอยกเลิก)
// DELETE : ร่างที่ยังไม่ส่ง (+ admin ?force=1 ผ่าน RPC)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
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
import { listAttachments } from '@/lib/master/attachments';
import { normalizeScentBriefs, scentBriefNameError } from '@/lib/requests/scentBriefs';
import {
  acknowledgeRequestError, commitDueRequestError, rescheduleRequestError,
  bounceRequestError, answerRequestError, canAnswerRequest, canManageRequest,
  canReadRequestRow, cancelRequestError, closeOutcomeError, closeRequestError,
  assignRequestDocNo, deleteRequestError, requestGuardMessage, submitRequestError,
} from '@/lib/deptRequests';
import { requestHasItems, requestShapeError } from '@/lib/master/requestTypes';
import { requestEditError, requestEditPatch } from '@/lib/requests/requestEdit';
import { isScentRegistrar } from '@/lib/master/scents';
import { createScent } from '@/lib/master/scentFormulaAdmin';
import { findRequest } from '@/lib/materialPricesAdmin';
import { attachRegistryLinks, registryIdsFromItems } from '@/lib/requests/registryLinks';
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
  let summary = '';
  // รายการเปลี่ยนแปลงของ PDR — ใช้ตอนเขียนเธรดท้าย handler
  let pdrChanges = null;
  // เหตุผลที่ต้องไหลไปถึงเธรด (นอกเหนือจาก cancel/bounce ที่เก็บลง patch อยู่แล้ว)
  let eventReason = null;

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
      summary = `รับเรื่อง ${before.docNo || id}`;
    } else if (action === 'commit-due') {
      /* ⭐ **แจ้งกำหนดส่ง** (มติผู้ใช้ 2026-08-19) — ก้าวที่สองของฝ่ายผู้รับ · แยกจาก
         การรับเรื่องเพราะของจริงคือ "รับไว้แล้ว แต่ยังตอบวันไม่ได้" (รอวัตถุดิบ ·
         รอฝ่ายอื่น) · ครั้งแรกทางนี้ · เปลี่ยนวันหลังจากนั้นไปทาง `reschedule` ซึ่ง
         บังคับให้เธรดเห็นว่าเลื่อนจากวันไหนเป็นวันไหน */
      if (!canAnswerRequest(user, before)) {
        return Response.json({ error: `แจ้งกำหนดส่งได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
      }
      const err = commitDueRequestError(before, { committedDueDate: body.committedDueDate });
      if (err) return Response.json({ error: err }, { status: /ระบุวัน/.test(err) ? 400 : 409 });
      patch.committedDueDate = String(body.committedDueDate).trim();
      // เหตุผลไม่บังคับ — ครั้งแรกยังไม่มีคำสัญญาเดิมให้ต้องอธิบาย (ต่างจากการเลื่อน)
      const note = String(body.reason ?? '').trim();
      if (note.length > 500) {
        return Response.json({ error: 'เหตุผลยาวเกิน 500 ตัวอักษร' }, { status: 400 });
      }
      eventReason = note || null;
      summary = `แจ้งกำหนดส่ง ${patch.committedDueDate}${note ? ` — ${note}` : ''}`;
    } else if (action === 'update') {
      // ⭐ **แก้คำร้องที่ยังไม่ถูกรับเรื่อง** (มติผู้ใช้ 2026-08-09) — ก่อนหน้านี้
      // ใบที่บันทึกแล้วแก้ไม่ได้เลยสักช่อง ต้องลบทิ้งแล้วเปิดใหม่
      // ⚠️ กฎว่า "ใครแก้ได้ ตอนไหน ช่องไหน" อยู่ใน `lib/requests/requestEdit.js`
      // ที่เดียว — หน้าจอถามตัวเดียวกันเพื่อไม่ให้ปุ่มกับ API เห็นไม่ตรงกัน
      const denied = requestEditError(before, user);
      if (denied) return Response.json({ error: denied }, { status: 403 });

      const next = requestEditPatch(body);
      // ⚠️ ด่านรูปทรงเดียวกับตอนเปิดใบ — ชื่อเรื่องบังคับ · วันที่ต้องมีและถูกรูปแบบ ·
      // ด่วนต้องมีเหตุผล · ส่งของเดิมที่ไม่ได้แก้เข้าไปด้วยเพื่อให้ด่านเห็นใบทั้งใบ
      const shapeError = requestShapeError(before.kind, {
        ...before, ...next, items: before.items,
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
      patch.status = 'answered';
      patch.answeredAt = nowIso;
      summary = `ตอบคำร้อง ${before.docNo || id}`;
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

      patch.status = 'closed';
      patch.closedById = user?.id ?? null;
      patch.closedByName = user?.name ?? null;
      patch.closedAt = nowIso;
      summary = `ปิดเรื่อง ${before.docNo || id}`
        + (linked?.created ? ' · เพิ่มกลิ่นเข้าทะเบียน' : linked?.scentId ? ' · ผูกกลิ่นในทะเบียน' : '');
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
    } else {
      return Response.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 });
    }

    const { data: saved, error } = issueDocNo
      ? await assignRequestDocNo(supabase, before, patch)
      : await supabase.from('dept_requests').update(patch).eq('id', id);
    if (error) throw error;
    // เลขจริงรู้ได้หลังฟังก์ชันออกให้เท่านั้น (ใบใหม่ยังไม่มีเลขตอนประกอบ summary)
    if (issueDocNo && saved?.docNo) summary = `ส่งคำร้อง ${saved.docNo} ถึงฝ่าย ${before.dept}`;

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
      _mine: canManageRequest(user, after),
      _canEditPdr: canEditPdr(user, after),
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
