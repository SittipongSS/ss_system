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
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound } from '@/lib/http';
import { canDoFieldWork, canEditService, canSendSurveyResult } from '@/lib/permissions';
import { deleteZoneRow, purgeSurveyZoneRows, zoneReleaseDecision } from '@/lib/service/surveyCancelCleanup';
import {
  normalizeSurveyParts, normalizeSurveySpots, packageNeedsNote, surveyAddZoneError, surveyEditLockError,
  surveyZoneStaleBody, surveyZoneStaleError,
  surveyOnlyBlankRows,
} from '@/lib/service/survey';
import { findSurveyVisit } from '@/lib/service/surveyVisit';
import { visitWriteAccess } from '@/lib/service/visitAccess';
import { genId } from '@/lib/id';

export const dynamic = 'force-dynamic';

/* ⭐ **ตัวจัดแถว (ส่วน · จุด) อยู่ที่ `lib/service/survey.js`** — จอถามตัวเดียวกันก่อนยิง
   (`surveyZoneSavePayload`) ⇒ ของที่จอส่งผ่านเสมอ และกฎ "แถวว่าง ≠ แถวเสีย" มีที่เดียว
   🐞 เดิมสองตัวนี้อยู่ในไฟล์นี้ และตีกลับแถวว่าง ⇒ ตัดพื้นที่ที่ยังไม่เคยวัดไม่ได้ (การ์ดส่งร่างที่มี
     "ส่วน" ว่างแถวเดียวมาพร้อมคำขอตัด) · แท็บเก่าที่เปิดค้างยังส่งทรงนั้นอยู่ ⇒ server ต้องรับได้เอง
     ไม่ใช่พึ่งจอรุ่นใหม่อย่างเดียว */

/* ⚠️ **ทั้งสองเมธอดต้องถามใบแม่ก่อนเขียน** — แถวผลวัดเป็นลูกของใบคำร้อง และของที่
   ล็อกคือ *ใบ* ไม่ใช่ *แถว* ⇒ อ่านที่เดียว ใช้ด่านตัวเดียว (`surveyEditLockError`)
   🐞 **ต้องเลือกทุกคอลัมน์ที่ด่านอ่าน** — เดิมเลือกแค่ `answeredAt`/`cancelledAt` ขณะที่ด่านอ่าน
     `status` (ปิดโดยไม่ประเมิน) กับ `closedAt` (ฝ่ายขายปิดเรื่องก่อนได้ผล) ด้วย ⇒ สองข้อนั้นได้
     `undefined` แล้วปล่อยผ่านเงียบ ๆ · จอบอกล็อก แต่ยิง API ตรงยังเขียนผลวัดได้ */
async function requestLock(supabase, id) {
  const { data, error } = await supabase
    .from('dept_requests').select('id, status, "answeredAt", "cancelledAt", "closedAt"').eq('id', id).maybeSingle();
  if (error) throw error;
  return surveyEditLockError(data);
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

    const locked = await requestLock(supabase, id);
    if (locked) return conflict(locked);

    /* 🔑 **ด่านรายใบ ใช้ตัวตัดสินตัวเดียวกับนัด** — เจ้าหน้าที่หน้างานเขียนได้เฉพาะ
       ใบที่ตัวเองถูกมอบหมาย · นัดของใบประเมินคือที่เดียวที่บอกว่า "ใครไป" */
    const visit = await findSurveyVisit(supabase, id);
    const access = visitWriteAccess({ user, visit, canEditAll });
    if (!access.ok) return access.error ? forbidden(access.error) : forbidden();

    const body = await req.json().catch(() => ({}));

    /* 🐞 review 26/09 — **ร่างตั้งต้นจากแถวรุ่นไหน** (`baseUpdatedAt`) · ไม่ตรงกับแถวในฐาน = อีกคนบันทึกไปก่อน
       ⇒ 409 พร้อมแถวล่าสุด แทนการเขียนทั้งก้อนทับ (ร่างเก่าที่มีแค่ส่วนว่าง = `parts: []` ลบขนาดที่เขาเพิ่งวัด)
       ⚠️ ไม่ส่งมา = ไม่ถาม (แท็บเก่า · ตัด/เอากลับจากหน้าแม่ซึ่งไม่แตะขนาด/จุด/หมายเหตุ) */
    if (surveyZoneStaleError(row, body.baseUpdatedAt)) return Response.json(surveyZoneStaleBody(row), { status: 409 });

    const patch = {};

    /* แท็บรุ่นเก่า (ไม่ส่งรุ่น) ส่งส่วน/จุดว่างที่จอเติมให้ทั้งก้อน = ไม่ได้ตั้งใจแก้ช่องนั้น — ไม่งั้นกลายเป็น `[]` ทับของอีกคน (review 26/09) */
    if (body.baseUpdatedAt === undefined) {
      if (surveyOnlyBlankRows(body.parts, ['label', 'widthM', 'lengthM', 'heightM'])) body.parts = undefined;
      if (surveyOnlyBlankRows(body.spots, ['label', 'note'])) body.spots = undefined;
    }

    const parts = normalizeSurveyParts(body.parts, { newId: () => genId('PRT') });
    if (parts.error) return badRequest(parts.error);
    if (parts.value !== undefined) patch.parts = parts.value;

    const spots = normalizeSurveySpots(body.spots, row.spots, { newId: () => genId('SPT') });
    if (spots.error) return badRequest(spots.error);
    if (spots.value !== undefined) patch.spots = spots.value;

    if (body.note !== undefined) {
      const note = String(body.note ?? '').trim();
      if (note.length > 1000) return badRequest('หมายเหตุยาวเกิน 1000 ตัวอักษร');
      patch.note = note || null;
    }

    /* ⚠️ **ตัดพื้นที่ต้องบอกเหตุผลเสมอ** (CHECK ของ mig 0314 บังคับอีกชั้น) — ของที่หายไป
       จากสิ่งที่ SA จะเสนอราคา คือของที่ลูกค้าจะถาม และ SA ไม่ได้ไปหน้างาน
       ⚠️ `'added'` ไม่รับที่นี่ — พื้นที่ที่เพิ่มหน้างานเกิดจาก **เส้นสร้างแถว** (`POST ../zones`)
         ไม่ใช่การแก้สถานะของแถวที่ SA ขอมา */
    if (body.status !== undefined) {
      if (!['ok', 'cut'].includes(body.status)) return badRequest('สถานะพื้นที่ไม่ถูกต้อง');
      /* 🔴 **พื้นที่ที่ช่างเพิ่มเองหน้างาน ตัดออกไม่ได้ — ต้องลบทิ้ง** (`DELETE` ข้างล่าง)
         ① ทางเทคนิค: คอลัมน์เดียวเก็บได้ค่าเดียว ⇒ เขียน `'cut'` ทับ = ป้าย "เพิ่มหน้างาน"
            หายถาวร แล้วกด "เอากลับเข้าใบ" จะได้แถวที่โผล่มาเป็นของ SA ทั้งที่ SA ไม่เคยขอ
         ② ทางความหมาย: "ตัดออก" แปลว่า *SA ขอมาแล้วเราไม่ทำ* ⇒ ต้องมีเหตุผลให้เขาอ่าน
            ส่วนพื้นที่ที่เขาไม่เคยขอ ไม่มีอะไรต้องอธิบาย — แค่ไม่ต้องมีอยู่ */
      if (row.status === 'added') {
        return badRequest('พื้นที่นี้ช่างเพิ่มเองหน้างาน — ถ้าไม่เอาแล้วให้ลบทิ้ง ไม่ใช่ตัดออก');
      }
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

    /* 🐞 review 26/09 — **เขียนแบบมีเงื่อนไขกับรุ่นที่เพิ่งอ่าน** ปิดช่องระหว่างอ่านกับเขียน (อีกคนบันทึกแทรกกลาง
       = 0 แถว ไม่ใช่ทับ · จุดที่หัวหน้าเคาะไว้ที่อ่านจาก `row.spots` ก็ไม่ถูกย้อน) — ใช้ทุกคำขอ ไม่ใช่แค่ที่ส่งรุ่นมา
       ⚠️ supabase ไม่ throw และ update ที่ไม่โดนแถวไหนไม่ใช่ error ⇒ `maybeSingle` แล้วเช็ก `data` เอง
          (`single` เดิมเจอ 0 แถว = 500 "JSON object requested…" ที่ไม่บอกอะไรผู้ใช้) */
    const { data, error } = await supabase
      .from('service_survey_zones').update(patch).eq('id', zoneId).eq('updatedAt', row.updatedAt).select().maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) {
      // อ่านไม่ได้ = ไม่มีแถวพกกลับ (จอยังขึ้นป้ายชนได้ แค่ยังไม่มีรุ่นใหม่ให้ใช้)
      const { data: latest } = await supabase
        .from('service_survey_zones').select('*').eq('id', zoneId).eq('requestId', id).maybeSingle();
      return Response.json(surveyZoneStaleBody(latest || null), { status: 409 });
    }

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


/* ── PUT: การตัดสินใจของหัวหน้า (จอส่งผล) ────────────────────────────────
 *
 * ⭐ **แยกเมธอดจาก PATCH โดยตั้งใจ** — ทรัพยากรเดียวกัน แต่คนละคน คนละจังหวะ
 *   คนละชุดช่อง: `PATCH` = ช่างรายงานข้อเท็จจริงหน้างาน · `PUT` = หัวหน้าตัดสินใจ
 *   เชิงพาณิชย์บนโต๊ะ ⇒ รวมเป็นเส้นเดียวเมื่อไร ช่างจะทับตัวเลขที่หัวหน้าเคาะไปแล้ว
 *
 * 🔴 ด่านสิทธิ์ **ไม่ใช่ `canEditService`** ซึ่งช่างทุกคนผ่าน — การเคาะแพ็คเกจกับจุด
 *   คือของที่ SA จะเอาไปเสนอราคา ⇒ `canSendSurveyResult` (หัวหน้าฝ่าย TS)
 */
// PUT { packageQty?, packageNote?, selectedSpotIds? }
export const PUT = withUser(async ({ user, supabase, req, ctx }) => {
  const { id, zoneId } = await ctx.params;
  try {
    if (!canSendSurveyResult(user)) return forbidden('เคาะแพ็คเกจและจุดติดตั้งได้เฉพาะหัวหน้าฝ่ายบริการ');

    const { data: row, error: rowError } = await supabase
      .from('service_survey_zones').select('*').eq('id', zoneId).eq('requestId', id).maybeSingle();
    if (rowError) return fail(rowError.message, 500);
    if (!row) return notFound('ไม่พบพื้นที่นี้ในใบประเมิน');
    if (row.status === 'cut') return badRequest('พื้นที่นี้ถูกตัดออกจากใบแล้ว');

    const locked = await requestLock(supabase, id);
    if (locked) return conflict(locked);

    const body = await req.json().catch(() => ({}));
    const patch = {};

    if (body.packageQty !== undefined) {
      const qty = Number(body.packageQty);
      if (body.packageQty === null || body.packageQty === '') {
        patch.packageQty = null;
      } else {
        if (!Number.isInteger(qty) || qty < 1) return badRequest('จำนวนแพ็คเกจต้องเป็นจำนวนเต็มอย่างน้อย 1');
        if (qty > 99) return badRequest('จำนวนแพ็คเกจดูเหมือนพิมพ์ผิดหลัก');
        patch.packageQty = qty;
      }
    }

    if (body.packageNote !== undefined) {
      const note = String(body.packageNote ?? '').trim();
      if (note.length > 500) return badRequest('เหตุผลยาวเกิน 500 ตัวอักษร');
      patch.packageNote = note || null;
    }

    /* จุดที่ **เลือกติดตั้งจริง** — หัวหน้าติ๊กจากรายการที่ช่างแจ้งมา
       ⚠️ รับเป็น **id ของจุด** ไม่ใช่ทั้งอาร์เรย์ — ส่งทั้งอาร์เรย์มาแปลว่าหัวหน้า
         แก้ชื่อ/บันทึกของจุดได้ด้วย ซึ่งเป็นของช่าง (เขาเป็นคนไปเห็น) */
    if (body.selectedSpotIds !== undefined) {
      if (!Array.isArray(body.selectedSpotIds)) return badRequest('รายการจุดที่เลือกไม่ถูกต้อง');
      const picked = new Set(body.selectedSpotIds.map((v) => String(v)));
      const spots = Array.isArray(row.spots) ? row.spots : [];
      const unknown = [...picked].filter((sid) => !spots.some((s) => String(s?.id) === sid));
      if (unknown.length) return badRequest('มีจุดที่เลือกซึ่งไม่อยู่ในรายการที่ช่างแจ้งมา');
      patch.spots = spots.map((s) => ({ ...s, selected: picked.has(String(s?.id)) }));
    }

    if (!Object.keys(patch).length) return badRequest('ไม่มีอะไรให้บันทึก');

    /* ⚠️ ตรวจกฎ "ต่างจากสูตรต้องมีเหตุผล" จาก **ค่าหลังรวม patch** ไม่ใช่จาก body —
       แก้เฉพาะเหตุผลโดยไม่ส่ง qty มาด้วย ต้องตัดสินจากตัวเลขที่มีอยู่จริง
       ⚠️ ปล่อยให้ล้างเหตุผลทิ้งได้เมื่อยังไม่เคาะแพ็คเกจ — ด่านตอนกดส่งผลจะจับเอง
         (บล็อกตรงนี้ด้วยจะแก้ทีละช่องไม่ได้เลย ซึ่งเป็นวิธีกรอกจริงของคน) */
    const after = { ...row, ...patch };
    if (Number(after.packageQty) > 0 && packageNeedsNote(after)
      && !String(after.packageNote ?? '').trim()) {
      return badRequest('แพ็คเกจต่างจากที่สูตรบอก — ต้องบอกเหตุผลด้วย');
    }

    patch.updatedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('service_survey_zones').update(patch).eq('id', zoneId).select().single();
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'update', entityType: 'service_survey_zone', entityId: zoneId,
      before: row, after: data,
      summary: `เคาะผลประเมิน ${data.zoneName}`
        + (patch.packageQty !== undefined
          ? (data.packageQty ? ` · ${data.packageQty} แพ็คเกจ` : ' · ล้างจำนวนแพ็คเกจ')
          : ''),
      request: req,
    });
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});


/* ── DELETE: ลบพื้นที่ที่เพิ่มผิด ─────────────────────────────────────────
 *
 * 🔴 **ต้องมาคู่กับปุ่มเพิ่มเสมอ ไม่ใช่ของแถม** — ด่านหกข้อ (`surveySendError`) บล็อก
 *   **ทั้งใบ ไม่ใช่รายแถว** ⇒ แถวที่กดเพิ่มผิดแล้วกรอกไม่จบ (พิมพ์ชื่อผิด · กดซ้ำ · เพิ่ม
 *   แล้วรู้ทีหลังว่าเป็นพื้นที่ของตึกข้าง ๆ) จะ **ล็อกใบไม่ให้ส่งผลตลอดกาล** และไม่มี
 *   ปุ่มไหนในระบบพาออกมาได้เลย เพราะ "ตัดออก" ก็ใช้กับแถวชนิดนี้ไม่ได้ (ดู `PATCH`)
 *
 * ⚠️ **เฉพาะแถวที่ช่างเพิ่มเอง** — แถวที่ SA ขอมาห้ามหาย · ของที่ไม่ทำใช้ "ตัดออก"
 *   พร้อมเหตุผล เพราะ SA ต้องรู้ว่าสิ่งที่เขาขอไปหายไปไหน
 */
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id, zoneId } = await ctx.params;
  try {
    const canEditAll = canEditService(user);
    if (!canEditAll && !canDoFieldWork(user)) return forbidden();

    const { data: row, error: rowError } = await supabase
      .from('service_survey_zones').select('*').eq('id', zoneId).eq('requestId', id).maybeSingle();
    if (rowError) return fail(rowError.message, 500);
    if (!row) return notFound('ไม่พบพื้นที่นี้ในใบประเมิน');
    if (row.status !== 'added') {
      return badRequest('ลบได้เฉพาะพื้นที่ที่ช่างเพิ่มเองหน้างาน'
        + ' — พื้นที่ที่ฝ่ายขายขอมา ให้ใช้ "ตัดพื้นที่นี้ออก" พร้อมเหตุผล');
    }

    const { data: request, error: reqError } = await supabase
      .from('dept_requests').select('*').eq('id', id).maybeSingle();
    if (reqError) return fail(reqError.message, 500);

    const visit = await findSurveyVisit(supabase, id);
    const access = visitWriteAccess({ user, visit, canEditAll });
    const gate = surveyAddZoneError(request, { canWrite: access.ok === true });
    if (gate) return access.ok ? conflict(gate) : forbidden(access.error || gate);

    /* ⚠️ **ตัดสินชะตาโซนก่อนลบแถว** — โซนที่ขายไปแล้ว/มีเครื่องต้องอยู่ต่อ และต้องอยู่
       *พร้อมประวัติการวัด* ⇒ ถามก่อนว่าจะลบโซนไหม แล้วค่อยแตะแถว
       (ตัวนับให้คำตอบเดียวกันทั้งก่อนและหลังลบแถว — ดูหัวข้อของ `zoneReleaseDecision`) */
    let zone = null;
    if (row.zoneId) {
      // `*` — ตัวตัดสินต้องเห็นจุดติดตั้งของโซน (mig 0354 · เหตุผลเต็มที่ surveyCancelCleanup.js)
      const { data } = await supabase
        .from('service_zones').select('*').eq('id', row.zoneId).maybeSingle();
      zone = data || null;
    }
    const decision = zone ? await zoneReleaseDecision(supabase, { request, zone }) : null;

    const purgeError = await purgeSurveyZoneRows(supabase, [row.id]);
    if (purgeError) return fail(purgeError, 500);

    let zoneDropped = false;
    if (decision?.action === 'delete') {
      const dropError = await deleteZoneRow(supabase, zone.id);
      zoneDropped = !dropError;
    }

    await recordAudit({
      user, action: 'delete', entityType: 'service_survey_zone', entityId: row.id,
      before: row,
      summary: `ลบพื้นที่ที่เพิ่มหน้างาน ${row.zoneName} ออกจากใบ ${request?.docNo || id}`
        + (zoneDropped ? ` · ถอนพื้นที่ ${decision.label} ออกจากทะเบียนด้วย` : '')
        + (zone && !zoneDropped ? ` · เก็บพื้นที่ ${decision.label} ไว้ในทะเบียน (${decision.reason})` : ''),
      request: req,
    });
    return ok({ id: row.id, zoneDropped });
  } catch (e) {
    return fail(e.message, 500);
  }
});
