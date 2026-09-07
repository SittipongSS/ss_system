// ── ส่งผลประเมินให้ฝ่ายขาย (เฟส 3 · ปุ่มบนจอส่งผล) ───────────────────────
//
// ⭐ **"ส่งผล" = "ตอบคำร้อง"** — ใบประเมินเป็นคำร้องหัวข้อหนึ่ง ไม่ใช่เอกสารพันธุ์ใหม่
//   ⇒ การกดส่งผลคือการกด `answeredAt` ของใบ และเข้ากติกา **ปิดสองฝั่ง** เดิมทุกอย่าง
//     (ใบจบก็ต่อเมื่อ SA กด "ปิดเรื่อง" ด้วย · กดก่อน/หลังกันได้ทั้งคู่)
//
// 🔴 **ทำไมไม่ใช้ `PATCH /api/sa/requests/[id]` action=answer ตรง ๆ** — เส้นนั้นไม่รู้จัก
//   ด่านหกข้อของใบประเมิน (ขนาด · รูป · จุด · แพ็คเกจ) ซึ่งอยู่ในตารางลูก
//   ⇒ กดจากที่นั่นได้แปลว่าส่งใบที่ยังไม่มีขนาดออกไปหา SA ได้จริง
//   ⚠️ แต่ **กติกาการเปลี่ยนสถานะยังใช้ของกลางตัวเดิม** (`answerRequestError` ·
//     `closureStatus`) — เขียนกติกาซ้ำเมื่อไร สองเส้นจะเพี้ยนหากันแน่
import { recordAudit } from '@/lib/audit';
import { appendRequestEvent } from '@/lib/sales/documentThread';
import { withUser, ok, fail, forbidden, notFound, conflict } from '@/lib/http';
import { canSendSurveyResult } from '@/lib/permissions';
import { canAnswerRequest } from '@/lib/requests/access';
import { closureStatus } from '@/lib/requests/closure';
import { answerRequestError } from '@/lib/requests/stages';
import { listAttachments } from '@/lib/master/attachments';
import { loadSurveyZones } from '@/lib/service/surveyRepo';
import { surveySendError, surveyTotals, surveyTotalsDiff } from '@/lib/service/survey';

export const dynamic = 'force-dynamic';

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

    /* 🔑 **ด่านหกข้อ — ตัวเดียวกับที่ปุ่มบนจอใช้** · ต้องอ่านไฟล์จริงมานับ
       ⚠️ ไม่มีไฟล์ = ยังไม่มีรูป ⇒ ปฏิเสธ (fail-closed) ไม่ใช่ปล่อยผ่านตอนไม่รู้ */
    const zones = await loadSurveyZones(supabase, id);
    const files = await Promise.all(
      zones.map((z) => listAttachments('service_survey_zone', z.id, supabase)),
    );
    const filesByZone = Object.fromEntries(zones.map((z, i) => [z.id, files[i] || []]));
    const gate = surveySendError(zones, filesByZone, { canSend: true });
    if (gate) return conflict(gate);

    const nowIso = new Date().toISOString();
    const patch = {
      answeredAt: nowIso,
      answeredById: user?.id ?? null,
      answeredByName: user?.name ?? null,
      /* ⭐ สถานะมาจากตัวตัดสินกลาง ไม่ใช่เขียน `'answered'` เอง — ใบที่ SA กดปิดไปก่อน
         จะกลายเป็น `closed` ทันทีตรงนี้ (ปิดสองฝั่ง กดก่อน/หลังกันได้) */
      status: closureStatus({ status: request.status, answeredAt: nowIso, closedAt: request.closedAt }),
      updatedAt: nowIso,
    };

    const { data, error } = await supabase
      .from('dept_requests').update(patch).eq('id', id).select().single();
    if (error) return fail(error.message, 500);

    /* สรุปที่เขียนลง audit ต้องบอก **ตัวเลขที่ส่งออกไป** ไม่ใช่แค่ "ส่งผลแล้ว" —
       ใบนี้คือของที่ SA เอาไปตั้งราคา ⇒ ต้องย้อนได้ว่าตอนส่งบอกไปเท่าไร */
    const totals = surveyTotals(zones);

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
    /* 🔴 **ส่งรอบใหม่หลังดึงกลับ ต้องบอกส่วนต่างเก่า→ใหม่** (§5E ④)
       จุดอันตรายที่สุดของทั้งแผน: SA อาจเอาตัวเลขผิดไปเสนอราคาไปแล้ว ⇒ ข้อความว่า
       "ใบถูกแก้" เฉย ๆ ไม่พอ · ตัวเลขที่ส่งไปรอบก่อนถูกตรึงไว้ใน meta ของแถว `recall`
       ⚠️ ไม่มีแถว `recall` = ส่งรอบแรก ⇒ ไม่มีอะไรให้เทียบ (ปกติ ไม่ใช่ข้อผิดพลาด) */
    let diff = [];
    try {
      const { data: recalls } = await supabase
        .from('entity_updates')
        .select('meta, "createdAt"')
        .eq('entityType', 'dept_request').eq('entityId', id).eq('kind', 'recall')
        .order('createdAt', { ascending: false }).limit(1);
      diff = surveyTotalsDiff(recalls?.[0]?.meta?.totals || null, totals);
    } catch { /* เทียบไม่ได้ = ส่งตามปกติ · ห้ามลากปุ่มส่งล้มเพราะเรื่องข้อความ */ }

    await appendRequestEvent(supabase, {
      request: data,
      action: 'answer',
      user,
      opts: {
        /* ผู้ขอรอ "ตร.ม. กี่แพ็คเกจ" เพื่อเอาไปตั้งราคา ⇒ ให้อ่านจากกระดิ่งได้เลย
           🔴 **พื้นที่ที่ TS เพิ่มเองต้องอยู่ในกระดิ่ง ไม่ใช่ให้ไปเจอเองในตาราง** (แผน §9
             ข้อ 3) — TS เพิ่มได้โดยไม่ต้องขออนุมัติ ⇒ จังหวะที่ SA จะรู้เรื่องมีจังหวะนี้
             จังหวะเดียว และเขาคือคนที่เอาตัวเลขนี้ไปตั้งราคาต่อ */
        summary: `${totals.zones} พื้นที่ · ${totals.areaSqm} ตร.ม. · ${totals.packageQty} แพ็คเกจ`
          + (totals.cutZones ? ` · ตัดออก ${totals.cutZones}` : '')
          + (totals.addedZones ? ` · TS เพิ่มหน้างาน ${totals.addedZones}` : '')
          + (diff.length ? ` · ⚠️ แก้จากรอบก่อน: ${diff.join(' · ')}` : ''),
      },
    });

    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id,
      before: request, after: data,
      summary: `ส่งผลประเมิน ${request.docNo || id} — ${totals.zones} พื้นที่ · `
        + `${totals.areaSqm} ตร.ม. · ${totals.packageQty} แพ็คเกจ`
        + (totals.cutZones ? ` · ตัดออก ${totals.cutZones}` : '')
        + (totals.addedZones ? ` · เพิ่มหน้างาน ${totals.addedZones}` : '')
        + (data.status === 'closed' ? ' · ปิดครบสองฝั่ง' : ''),
      request: req,
    });
    return ok({ request: data, totals });
  } catch (e) {
    return fail(e.message, 500);
  }
});
