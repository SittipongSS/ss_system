// ── ดึงผลประเมินกลับมาแก้ (§5E ④ · มติข้อ 25) ────────────────────────────
//
// ⭐ **"ดึงกลับ" ไม่ใช่ "ตีกลับ"** — คำนี้ล็อกไว้ทั้งระบบแล้ว (`hops.js`):
//   ตีกลับ = ผู้รับส่งคืน · ดึงกลับ = คนที่ส่งเอาคืนเอง ⇒ คนที่ส่งผลคือ TS
//
// 🔴 **เป็นความสามารถใหม่ ไม่ใช่การใช้ของเดิมซ้ำ** — `reopenRequestError` บล็อก `closed`
//   ไว้ชัดเจน แต่กรณีนี้คือ *หลัง SA ปิดใบไปแล้ว* พอดี ⇒ ต้องมีด่านของตัวเอง
//   ⚠️ **ไม่แตะ `reopenRequestError`** ซึ่งเป็นกติกากลางของทุกหัวข้อ — เปิดกว้างที่นั่น
//     เมื่อไร ทุกฝ่ายลากใบที่ปิดครบสองฝั่งแล้วกลับมาได้ · ประตูนี้แคบเฉพาะใบประเมิน
//
// 🔴 **จุดอันตรายที่สุดของทั้งแผน** — SA อาจเอาตัวเลขผิดไปเสนอราคาไปแล้ว
//   ⇒ ต้อง **ตรึงตัวเลขที่ส่งไปแล้ว** ไว้ในเธรด เพื่อให้ตอนส่งรอบใหม่บอกส่วนต่างได้
//     (เก็บใน `entity_updates.meta` — ไม่ต้องมีคอลัมน์ใหม่)
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, conflict } from '@/lib/http';
import { canSendSurveyResult } from '@/lib/permissions';
import { appendUpdate } from '@/lib/master/updates';
import { loadSurveyZones } from '@/lib/service/surveyRepo';
import { surveyRecallError, surveyTotals } from '@/lib/service/survey';

export const dynamic = 'force-dynamic';

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason ?? '').trim();

    const { data: request, error: reqError } = await supabase
      .from('dept_requests').select('*').eq('id', id).maybeSingle();
    if (reqError) return fail(reqError.message, 500);
    if (!request) return notFound('ไม่พบใบคำร้อง');

    /* 🔑 ด่านตัวเดียวกับที่ปุ่มบนจอใช้ — สิทธิ์ · สถานะ · เหตุผล อยู่ในนั้นครบ */
    const gate = surveyRecallError(request, { reason, canRecall: canSendSurveyResult(user) });
    if (gate) {
      if (/ต้องบอกเหตุผล/.test(gate)) return badRequest(gate);
      if (/ได้เฉพาะหัวหน้า/.test(gate)) return forbidden(gate);
      return conflict(gate);
    }

    const nowIso = new Date().toISOString();
    /* ⭐ **ถอยไปขั้น "ส่งผลประเมิน" ไม่ถอยถึงลงคิว** (แผน §5E ④) — ขนาดวัดมาแล้ว
       แค่ตัวเลขผิด ⇒ ล้างตราปิดทั้งสองฝั่ง แล้วใบกลับเป็น `acknowledged`
       ⚠️ ล้าง `closedAt` ด้วย ไม่ใช่แค่ `answeredAt` — ไม่งั้นใบค้างสถานะที่ผู้ขอ
         ปิดไปแล้วแต่ฝ่ายยังไม่ตอบ ซึ่งเป็นสภาพที่ไม่มีปุ่มไหนพาออกมาได้
       ⚠️ **ไม่แตะ `committedDueDate`** — ต่างจาก §5E ② ตรงนี้ไม่ต้องไปวัดใหม่ */
    const patch = {
      answeredAt: null, answeredById: null, answeredByName: null,
      closedAt: null, closedById: null, closedByName: null,
      status: 'acknowledged',
      updatedAt: nowIso,
    };
    const { data, error } = await supabase
      .from('dept_requests').update(patch).eq('id', id).select().single();
    if (error) return fail(error.message, 500);

    /* ตัวเลขที่ส่งไปแล้ว — ตรึงไว้ในเธรดเพื่อให้รอบส่งถัดไปบอกส่วนต่างได้
       ⚠️ อ่านจากแถวผลวัดจริง ณ ตอนนี้ ไม่ใช่จาก audit เก่า — ระหว่างที่ใบปิดอยู่
         ไม่มีใครแก้ได้ (`surveyEditLockError` ล็อกไว้) ⇒ ค่านี้ = ค่าที่ SA ได้รับไป */
    const totals = surveyTotals(await loadSurveyZones(supabase, id));

    /* บรรทัดในเธรดคือตัวที่แจกกระดิ่ง — SA ต้องรู้ทันทีว่าตัวเลขที่ถืออยู่กำลังจะเปลี่ยน
       ⚠️ meta พก `totals` ไว้ให้รอบส่งถัดไปหยิบมาเทียบ (ไม่ต้องมีคอลัมน์ใหม่) */
    await appendUpdate(supabase, {
      entityType: 'dept_request', entityId: id, kind: 'recall',
      body: `TS ดึงผลประเมินกลับมาแก้ — ${reason.slice(0, 300)}`
        + ` · ตัวเลขที่ส่งไปแล้ว ${totals.zones} พื้นที่ · ${totals.areaSqm} ตร.ม.`
        + ` · ${totals.packageQty} แพ็คเกจ (อย่าเพิ่งใช้ตั้งราคา)`,
      meta: { totals },
      user,
    });

    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id,
      before: request, after: data,
      summary: `ดึงผลประเมินกลับมาแก้ ${request.docNo || id} — ${reason}`
        + ` · ตัวเลขเดิม ${totals.zones} พื้นที่ · ${totals.areaSqm} ตร.ม. · ${totals.packageQty} แพ็คเกจ`,
      request: req,
    });
    return ok({ request: data, totals });
  } catch (e) {
    return fail(e.message, 500);
  }
});
