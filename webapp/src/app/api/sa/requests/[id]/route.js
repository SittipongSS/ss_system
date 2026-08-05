// ── API คำร้องข้ามฝ่ายรายเรื่อง (mig 0173) ──────────────────────────────
// GET    : รายละเอียด (canViewCosting + **ต้องเป็นใบของตัวเอง/ของฝ่ายตน** — ดู
//          canReadRequestRow; เดิมด่านนี้ไม่ดูแถวเลย เปิดตรงด้วย id ได้ทุกใบ)
// PATCH  : submit (ผู้ขอ — ออกเลขตาม scope ของชนิด + แจ้ง space ฝ่าย + @mention)
//          acknowledge (RD/PC รับเรื่อง + รับปากวันที่จะตอบ) · answer (ชนิดที่ไม่มี
//          บรรทัด — ตอบเสร็จแล้ว) · close (ปิดเรื่อง) · cancel (ผู้ขอยกเลิก)
// DELETE : ร่างที่ยังไม่ส่ง (+ admin ?force=1 ผ่าน RPC)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewCosting } from '@/lib/permissions';
import {
  canForceDelete, cleanupRequestOrphans, isDryRun, isForceRequest, requestForcePreview,
} from '@/lib/forceDelete';
import {
  acknowledgeRequestError,
  bounceRequestError, answerRequestError, canAnswerRequest, canManageRequest,
  canReadRequestRow, cancelRequestError, closeOutcomeError, closeRequestError,
  deleteRequestError, generateRequestDocNo, submitRequestError,
} from '@/lib/deptRequests';
import { requestHasItems, requestKindLabel } from '@/lib/master/requestTypes';
import { isScentRegistrar } from '@/lib/master/scents';
import { createScent } from '@/lib/master/scentFormulaAdmin';
import { findRequest } from '@/lib/materialPricesAdmin';
import { syncCostingPricingStatus } from '@/lib/costingAdmin';
import { appendRequestEvent } from '@/lib/sales/documentThread';
import { sanitizeMentions } from '@/lib/master/mentions';
import { purgeUpdates } from '@/lib/master/updates';
import { chatCard, sendChat } from '@/lib/chat';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

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
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const { id } = await params;
    const row = await findRequest(getSupabaseAdmin(), id);
    if (!row) return Response.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });
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
      { ...row, _mine: canManageRequest(user, row) },
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
  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const nowIso = new Date().toISOString();
  const patch = { updatedAt: nowIso };
  let summary = '';

  try {
    if (action === 'submit') {
      if (!canManageRequest(user, before)) {
        return Response.json({ error: 'ส่งคำร้องได้เฉพาะผู้เปิดเรื่อง' }, { status: 403 });
      }
      const err = submitRequestError(before, before.items);
      if (err) return Response.json({ error: err }, { status: 409 });
      // เลขออกตอนนี้เท่านั้น — ร่างที่ถูกทิ้งจะได้ไม่กินเลขจนขาดช่วง
      patch.docNo = await generateRequestDocNo(supabase, before.kind, before.dept);
      patch.status = 'pending';
      patch.submittedAt = nowIso;
      summary = `ส่งคำร้อง ${patch.docNo} ถึงฝ่าย ${before.dept}`;
    } else if (action === 'acknowledge') {
      if (!canAnswerRequest(user, before)) {
        return Response.json({ error: `รับเรื่องได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
      }
      const err = acknowledgeRequestError(before);
      if (err) return Response.json({ error: err }, { status: 409 });
      // "วันที่จะตอบ" ยกแนวคิดมาจากระบบสอบถามเดิมซึ่ง**บังคับ**กรอกตอนรับเรื่อง
      // ⚠️ ที่นี่ไม่บังคับ เพราะเคสขอราคา (ของเดิมที่มีผู้ใช้จริงอยู่แล้ว) ไม่เคยมี
      // ช่องนี้ — บังคับทันทีจะเปลี่ยนขั้นตอนของคนที่ใช้อยู่โดยไม่ได้ตกลงกัน
      // ถ้าจะบังคับควรบังคับ "รายชนิด" ทีหลังเมื่อผู้ใช้ยืนยัน
      const due = String(body.committedDueDate ?? '').trim();
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
        return Response.json({ error: 'วันที่จะตอบไม่ถูกต้อง' }, { status: 400 });
      }
      patch.status = 'acknowledged';
      patch.acknowledgedById = user?.id ?? null;
      patch.acknowledgedByName = user?.name ?? null;
      patch.acknowledgedAt = nowIso;
      if (due) patch.committedDueDate = due;
      summary = `รับเรื่อง ${before.docNo || id}`;
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
      if (!canManageRequest(user, before) && !canAnswerRequest(user, before)) {
        return Response.json({ error: 'ไม่มีสิทธิ์ปิดเรื่องนี้' }, { status: 403 });
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

    const { error } = await supabase.from('dept_requests').update(patch).eq('id', id);
    if (error) throw error;

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
      opts: { reason: patch.cancelReason ?? patch.bounceReason }, user, mentions,
    });

    // แจ้งฝ่ายเจ้าของเมื่อมีคำร้องใหม่เข้าคิว (space rd/pc ตามฝ่าย)
    if (action === 'submit') {
      sendChat(after.dept === 'PC' ? 'pc' : 'rd', chatCard({
        title: `คำร้องใหม่ ${after.docNo}`,
        subtitle: `${requestKindLabel(after.kind)}${after.customerName ? ` · ${after.customerName}` : ''}`,
        rows: [
          { label: 'ผู้ขอ', value: after.requestedByName || '' },
          { label: 'เรื่อง', value: after.title || `${(after.items || []).length} รายการ` },
          { label: 'ต้องการคำตอบภายใน', value: after.requestedDueDate || '' },
          { label: 'ความเร่งด่วน', value: after.urgent ? 'ด่วน' : '' },
        ],
        linkPath: `/requests/${id}`,
        linkLabel: 'เปิดคำร้อง',
      }));
    }
    // ผู้ขอควรรู้ว่ามีคนรับเรื่องแล้ว ไม่ต้องเดาว่าเงียบเพราะอะไร
    if (action === 'acknowledge') {
      sendChat('sales', chatCard({
        title: `รับเรื่อง ${after.docNo} แล้ว`,
        subtitle: `ฝ่าย ${after.dept} กำลังดำเนินการ`,
        rows: [
          { label: 'ผู้รับเรื่อง', value: after.acknowledgedByName || '' },
          { label: 'รับปากว่าจะตอบ', value: after.committedDueDate || '' },
        ],
        linkPath: `/requests/${id}`,
        linkLabel: 'เปิดคำร้อง',
      }));
    }
    return Response.json({ ...after, _mine: canManageRequest(user, after) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });
  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

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
  if (error) return Response.json({ error: error.message }, { status: 500 });
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
