// ── ช่างแจ้งหัวหน้าว่าแก้ตามที่ส่งกลับแล้ว (มติผู้ใช้ 2026-09-22) ─────────────────
//
// ⭐ ปิดวงของ "แจ้งช่างให้กลับไป" (`send-back`) — เดิมช่างแก้เสร็จแล้วไม่มีทางบอก หัวหน้าต้อง
//   คอยเปิดใบดูเอง · ใบค้างขั้นเดิมโดยไม่มีใครรู้ว่าถึงคิวหัวหน้าแล้ว
//
// 🔑 **ด่านตัวเดียวกับปุ่มบนจอ** (`surveySendBackDoneError`) — ล็อก · สิทธิ์รายใบ · มีเรื่องค้าง ·
//   ของฝั่งช่างครบจริง · ทั้งหมดอ่านจาก **ฐาน** ไม่ใช่จากจอ (จอที่โหลดค้างบอกผิดได้ทั้งสองทาง)
//
// ⚠️ **ไม่แตะสถานะใบและไม่แตะนัด** — เหมือนขาไป (`send-back`): การส่งกลับไม่ได้เปิดรอบวัดใหม่
//   ⇒ การแจ้งว่าแก้แล้วก็ไม่ได้ปิดอะไร นอกจากเรื่องที่ค้างในเธรด
// 🔴 **บรรทัดเธรดไม่ผูก `authorId`** — ช่างเปิดหน้าคำร้องไม่ได้ (403) · ผูกแล้วเขากลายเป็น
//   past author ของใบถาวรแล้วได้กระดิ่งทุกความเคลื่อนไหวของใบที่กดเข้าไปไม่ได้ (บทเรียน #1690)
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound } from '@/lib/http';
import { canDoFieldWork, canEditService } from '@/lib/permissions';
import { appendUpdate } from '@/lib/master/updates';
import {
  SEND_BACK_DONE_KIND, surveySendBackDoneBody, surveySendBackDoneError, surveySendBackDoneItems,
} from '@/lib/service/survey';
import { loadSurveyFieldState, loadSurveySendBackState } from '@/lib/service/surveyRepo';
import { findSurveyVisit } from '@/lib/service/surveyVisit';
import { visitWriteAccess } from '@/lib/service/visitAccess';
import { notifySurveySendBackDone } from '@/lib/service/surveyFieldDoneNotify';

export const dynamic = 'force-dynamic';

// POST { note?, doneItems?, sendBackId? } — `doneItems` = เลขข้อที่ช่างติ๊ก (นับจาก 0 ตาม `sentBack.items` · แผน §10.5 S3)
//   `sendBackId` = รอบที่ติ๊ก (ไม่ตรงรอบล่าสุด = 409 · ไม่ส่ง = แท็บเก่า)
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    // ด่านชั้นนอก — ต้องอยู่ในโมดูลบริการก่อน (คนจัดคิว หรือเจ้าหน้าที่หน้างาน)
    const canEditAll = canEditService(user);
    if (!canEditAll && !canDoFieldWork(user)) return forbidden();

    const body = await req.json().catch(() => ({}));
    const note = String(body.note ?? '').trim();
    if (note.length > 300) return badRequest('ข้อความถึงหัวหน้ายาวเกิน 300 ตัวอักษร');

    const [field, visit, sendBack] = await Promise.all([
      loadSurveyFieldState(supabase, id),
      findSurveyVisit(supabase, id),
      loadSurveySendBackState(supabase, id),
    ]);
    if (!field.request) return notFound('ไม่พบใบคำร้อง');

    // ด่านรายใบ — คนที่อยู่บนนัดของใบนี้ (หรือคนจัดคิว) · ตัวเดียวกับที่เขียนผลวัดได้
    const access = visitWriteAccess({ user, visit, canEditAll });

    const gate = surveySendBackDoneError(field.request, {
      canWrite: access.ok === true,
      pending: sendBack.pending,
      rows: field.zones,
      filesByZone: field.filesByZone,
    });
    if (gate) {
      if (!access.ok) return forbidden(access.error || gate);
      return conflict(gate);
    }

    /* 🐞 UAT 25/09 — ติ๊กผูกกับรอบแค่บนจอ · เดิมคำขอไม่บอกรอบ ⇒ หัวหน้าส่งกลับรอบใหม่ระหว่างที่แท็บช่างค้างรอบเก่า
       ติ๊ก [0,1] ของรอบเก่าผ่านด่านทรงของรอบใหม่ได้ แล้วไปปิดรอบใหม่ "แก้แล้ว 2 / 3 ข้อ" ในข้อที่ช่างไม่เคยเห็น
       ⇒ จอส่ง `sendBackId` ของรอบที่ติ๊ก · ไม่ตรงรอบล่าสุดในฐาน = 409 (ก่อนตรวจทรง — ไม่ใช่ 400 "ผิดรูปแบบ")
       ⚠️ ไม่ส่งมา = แท็บเก่าก่อนแก้ ⇒ ทำแบบเดิม ไม่ตีกลับ */
    const staleRound = body.sendBackId == null || body.sendBackId === ''
      ? false : String(body.sendBackId) !== String(sendBack.sentBack?.id ?? '');
    if (staleRound) return conflict('หัวหน้าส่งกลับรอบใหม่แล้ว — โหลดหน้าใหม่แล้วดูข้อที่ขอก่อนแจ้ง');

    /* ⭐ ข้อที่ช่างติ๊ก — ตรวจแค่ทรงเทียบกับจำนวนข้อ **จากฐาน** (ไม่เชื่อจำนวนที่จอส่งมา) · ไม่ส่งมา = ไม่รู้
       ⚠️ ไม่ใช่ด่าน "แก้ครบไหม" — ด่านนั้นคือของขาดข้างบน · ติ๊กไม่ครบก็แจ้งได้ หัวหน้าเห็นว่าข้อไหนยังค้าง */
    const itemCount = sendBack.sentBack?.items?.length || 0;
    const ticks = surveySendBackDoneItems(body.doneItems, itemCount);
    if (ticks.error) return badRequest(ticks.error);

    /* 🔴 **แถวเธรดคือสภาพ "แก้แล้ว" ทั้งหมด** — ไม่มีคอลัมน์อื่นเก็บ ⇒ เขียนไม่สำเร็จต้องตอบว่า
       ไม่สำเร็จ และห้ามแจ้งหัวหน้า (ไม่งั้นหัวหน้าได้กระดิ่ง แต่จอยังขึ้นปุ่มให้ช่างกดซ้ำ) */
    const { row, error: writeError } = await appendUpdate(supabase, {
      entityType: 'dept_request', entityId: id, kind: SEND_BACK_DONE_KIND,
      body: surveySendBackDoneBody(note, { doneCount: ticks.value?.length ?? null, itemCount }),
      meta: { note: note || null, sendBackId: sendBack.sentBack?.id || null, doneItems: ticks.value, itemCount },
      // ชื่อไว้ให้คนอ่านเธรดรู้ว่าใครแจ้ง — แต่ไม่ผูกตัวตน (ดูหัวไฟล์)
      user: { name: user?.name || null, department: user?.department || null },
    });
    if (writeError || !row) return fail(`บันทึกการแจ้งไม่สำเร็จ — ${writeError || 'ไม่ได้แถวกลับมา'} · ลองใหม่อีกครั้ง`, 500);

    notifySurveySendBackDone(supabase, {
      request: field.request,
      actor: { id: user?.id || null, name: user?.name || null },
      sentBack: sendBack.sentBack,
      note,
      doneId: row.id || null,
      doneItems: ticks.value,
      itemCount,
    });

    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id,
      before: field.request, after: field.request,
      summary: `ช่างแจ้งว่าแก้ตามที่หัวหน้าส่งกลับแล้ว ${field.request.docNo || id}${note ? ` — ${note}` : ''}`,
      request: req,
    });
    return ok({ done: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});
