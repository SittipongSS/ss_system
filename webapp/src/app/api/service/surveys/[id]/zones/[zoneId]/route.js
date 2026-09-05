// ── บันทึกผลวัดของพื้นที่หนึ่ง (เฟส 3 · จอหน้างาน) ────────────────────────
//
// ⭐ **ช่างรายงานข้อเท็จจริง หัวหน้าตัดสินใจ** (มติผู้ใช้ 2026-08-29) — เส้นนี้รับเฉพาะ
//   ของที่ต้องยืนอยู่หน้างานถึงจะรู้: **ขนาด · จุดที่ติดตั้งได้ · หมายเหตุ · การตัดพื้นที่**
//   ⚠️ `packageQty` กับ `spots[].selected` **ไม่รับที่นี่** — เป็นการตัดสินใจเชิงพาณิชย์
//     ที่ทำบนโต๊ะ ⇒ อยู่ที่เส้นของหัวหน้า (จอส่งผล) · ปล่อยให้เขียนทั้งสองทางเมื่อไร
//     ช่างจะทับตัวเลขที่หัวหน้าเคาะไปแล้วโดยไม่มีใครรู้
//
// ⚠️ ด่านสิทธิ์เป็น **ด่านรายใบ** ไม่ใช่ cap ล้วน — เจ้าหน้าที่หน้างานถือ `service:work`
//   ซึ่งเปิดเฉพาะงานที่ตัวเองถูกมอบหมาย (กติกาเดียวกับ `visitWriteAccess` ของนัด)
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound } from '@/lib/http';
import { canDoFieldWork, canEditService } from '@/lib/permissions';
import { normalizeSurveyPart } from '@/lib/service/survey';
import { findSurveyVisit } from '@/lib/service/surveyVisit';
import { visitWriteAccess } from '@/lib/service/visitAccess';
import { genId } from '@/lib/id';

export const dynamic = 'force-dynamic';

/** จุดที่ติดตั้งได้ — ช่างเพิ่มรายการเอง จุดละชื่อ (รูปผูกทีหลังผ่านไฟล์แนบ)
 *  🔴 **จุดต้องมีตัวตนแม้ยังไม่มีรูป** — ถ้าออกแบบให้ "จุด = รูปที่มีป้ายชื่อ" จุดที่ยัง
 *    ไม่ได้ถ่ายจะไม่มีอยู่ในระบบ แล้วช่างไม่มีทางรู้ว่าเหลือถ่ายอะไร
 *  ⚠️ `selected` **ไม่รับจากฝั่งนี้** — คงค่าเดิมที่หัวหน้าเคาะไว้เสมอ */
function normalizeSpots(input, before = []) {
  if (input === undefined) return { value: undefined, error: null };
  if (!Array.isArray(input)) return { value: null, error: 'รายการจุดติดตั้งไม่ถูกต้อง' };
  if (input.length > 30) return { value: null, error: 'จุดติดตั้งต่อพื้นที่ไม่ควรเกิน 30 จุด' };
  const keep = new Map((Array.isArray(before) ? before : []).map((s) => [s?.id, s?.selected === true]));
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const label = String(raw?.label ?? '').trim();
    if (!label) return { value: null, error: 'จุดติดตั้งต้องมีชื่อ' };
    if (label.length > 100) return { value: null, error: `ชื่อจุด "${label.slice(0, 20)}…" ยาวเกิน 100 ตัวอักษร` };
    const id = String(raw?.id ?? '').trim() || genId('SPT');
    if (seen.has(id)) return { value: null, error: 'รายการจุดติดตั้งมี id ซ้ำ' };
    seen.add(id);
    const note = String(raw?.note ?? '').trim();
    if (note.length > 300) return { value: null, error: 'บันทึกของจุดยาวเกิน 300 ตัวอักษร' };
    out.push({ id, label, note: note || null, selected: keep.get(id) === true });
  }
  return { value: out, error: null };
}

/** ส่วนที่วัด — `[{ id, label, widthM, lengthM, heightM }]`
 *  ⚠️ ส่วนที่กรอกไม่ครบสามช่อง = **แถวเสีย ต้องตีกลับ** ไม่ใช่แถวที่คิดเป็น 0 */
function normalizeParts(input) {
  if (input === undefined) return { value: undefined, error: null };
  if (!Array.isArray(input)) return { value: null, error: 'รายการส่วนของพื้นที่ไม่ถูกต้อง' };
  if (input.length > 20) return { value: null, error: 'แบ่งส่วนได้ไม่เกิน 20 ส่วนต่อพื้นที่' };
  const out = [];
  for (const raw of input) {
    const { value, error } = normalizeSurveyPart(raw);
    if (error) return { value: null, error };
    out.push({ ...value, id: value.id || genId('PRT') });
  }
  return { value: out, error: null };
}

// PATCH { parts?, spots?, note?, status?, cutReason? }
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id, zoneId } = await ctx.params;
  try {
    /* ด่านชั้นนอก: ต้องอยู่ในโมดูลบริการก่อน — คนจัดคิว (`service:edit`) หรือ
       เจ้าหน้าที่หน้างาน (`service:work`) เท่านั้น */
    const canEditAll = canEditService(user);
    if (!canEditAll && !canDoFieldWork(user)) return forbidden();

    const { data: row, error: rowError } = await supabase
      .from('service_survey_zones').select('*').eq('id', zoneId).eq('requestId', id).maybeSingle();
    if (rowError) return fail(rowError.message, 500);
    if (!row) return notFound('ไม่พบพื้นที่นี้ในใบประเมิน');

    /* 🔑 **ด่านรายใบ ใช้ตัวตัดสินตัวเดียวกับนัด** — เจ้าหน้าที่หน้างานเขียนได้เฉพาะ
       ใบที่ตัวเองถูกมอบหมาย · นัดของใบประเมินคือที่เดียวที่บอกว่า "ใครไป" */
    const visit = await findSurveyVisit(supabase, id);
    const access = visitWriteAccess({ user, visit, canEditAll });
    if (!access.ok) return access.error ? forbidden(access.error) : forbidden();

    const body = await req.json().catch(() => ({}));
    const patch = {};

    const parts = normalizeParts(body.parts);
    if (parts.error) return badRequest(parts.error);
    if (parts.value !== undefined) patch.parts = parts.value;

    const spots = normalizeSpots(body.spots, row.spots);
    if (spots.error) return badRequest(spots.error);
    if (spots.value !== undefined) patch.spots = spots.value;

    if (body.note !== undefined) {
      const note = String(body.note ?? '').trim();
      if (note.length > 1000) return badRequest('หมายเหตุยาวเกิน 1000 ตัวอักษร');
      patch.note = note || null;
    }

    /* ⚠️ **ตัดพื้นที่ต้องบอกเหตุผลเสมอ** (CHECK ของ mig 0314 บังคับอีกชั้น) — ของที่หายไป
       จากสิ่งที่ SA จะเสนอราคา คือของที่ลูกค้าจะถาม และ SA ไม่ได้ไปหน้างาน
       ⚠️ `'added'` ไม่รับที่นี่ — พื้นที่ที่เพิ่มหน้างานเกิดจากเส้นสร้างแถว ไม่ใช่การแก้สถานะ */
    if (body.status !== undefined) {
      if (!['ok', 'cut'].includes(body.status)) return badRequest('สถานะพื้นที่ไม่ถูกต้อง');
      patch.status = body.status;
      if (body.status === 'cut') {
        const reason = String(body.cutReason ?? row.cutReason ?? '').trim();
        if (reason.length < 5) return badRequest('ตัดพื้นที่ออกต้องบอกเหตุผล (อย่างน้อย 5 ตัวอักษร)');
        patch.cutReason = reason;
      } else {
        // กลับมาใช้ = เหตุผลเดิมไม่จริงอีกต่อไป (CHECK ยอมให้ null เมื่อไม่ใช่ 'cut')
        patch.cutReason = null;
      }
    }

    if (!Object.keys(patch).length) return badRequest('ไม่มีอะไรให้บันทึก');

    /* ⭐ **ประทับคนวัดและเวลาทุกครั้งที่บันทึก** — ไม่ใช่แค่ครั้งแรก · ใบที่ถูกแก้ทีหลัง
       ต้องบอกได้ว่าใครแก้ล่าสุด (ตารางไม่มี updatedBy แยก) */
    patch.surveyedAt = new Date().toISOString();
    patch.surveyedById = user.id ? String(user.id) : null;
    patch.surveyedByName = user.name || null;
    patch.updatedAt = patch.surveyedAt;

    const { data, error } = await supabase
      .from('service_survey_zones').update(patch).eq('id', zoneId).select().single();
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'update', entityType: 'service_survey_zone', entityId: zoneId,
      before: row, after: data,
      summary: `บันทึกผลวัด ${data.zoneName}${data.status === 'cut' ? ' (ตัดออก)' : ''}`,
      request: req,
    });
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});
