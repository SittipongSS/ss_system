// ── บันทึกผลวัดของพื้นที่หนึ่ง (เฟส 3 · จอหน้างาน) ────────────────────────
//
// ⭐ **ช่างรายงานข้อเท็จจริง หัวหน้าตัดสินใจ** (มติผู้ใช้ 2026-08-29) — เส้นนี้รับเฉพาะ
//   ของที่ต้องยืนอยู่หน้างานถึงจะรู้: **ขนาด · จุดที่ติดตั้งได้ · หมายเหตุ · การตัดพื้นที่**
//   ⚠️ `packageQty` · `packageSize` กับ `spots[].selected` **ไม่รับที่นี่** — เป็นการตัดสินใจเชิงพาณิชย์
//     ที่ทำบนโต๊ะ ⇒ อยู่ที่เส้นของหัวหน้า (จอส่งผล) · ปล่อยให้เขียนทั้งสองทางเมื่อไร
//     ช่างจะทับตัวเลขที่หัวหน้าเคาะไปแล้วโดยไม่มีใครรู้
//   ⭐ ข้อเดียวที่เส้นนี้แตะฝั่งแพ็คเกจ: **วัดใหม่หลังหัวหน้าเคาะ = ประทับ "ที่ระบบเสนอ" ใหม่** (`surveyRemeasureStamp`)
//     — ไม่ใช่การเคาะ (ขนาด/จำนวนของหัวหน้าไม่ถูกแตะ) แต่เป็นข้อเท็จจริงที่ตามมาจากปริมาตรใหม่ · ไม่ทำ = ด่านเหตุผลหลับ
//
// ⚠️ ด่านสิทธิ์เป็น **ด่านรายใบ** ไม่ใช่ cap ล้วน — เจ้าหน้าที่หน้างานถือ `service:work`
//   ซึ่งเปิดเฉพาะงานที่ตัวเองถูกมอบหมาย (กติกาเดียวกับ `visitWriteAccess` ของนัด)
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound } from '@/lib/http';
import { canDoFieldWork, canEditService, canSendSurveyResult } from '@/lib/permissions';
import { deleteZoneRow, purgeSurveyZoneRows, zoneReleaseDecision } from '@/lib/service/surveyCancelCleanup';
import { surveyPackageDecision, surveyRemeasureStamp, surveyRemeasureTouchesSuggestion } from '@/lib/service/packageSizes';
import { loadPackageSizesOrNull } from '@/lib/service/packageSizesRepo';
import {
  normalizeSurveyParts, normalizeSurveySpots, surveyAddZoneError, surveyEditLockError,
  surveyZoneStaleBody, surveyZoneStaleError,
  surveyOnlyBlankRows,
} from '@/lib/service/survey';
import {
  SURVEY_METHOD_DRAWING, isDrawingZone, surveyNeedsVisit, surveyZoneChangeFlips,
} from '@/lib/service/surveyMethod';
import { loadSurveyZones } from '@/lib/service/surveyRepo';
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

/* ══ วิธีประเมินรายพื้นที่ (mig 0408 · แผน survey-desk-assessment §2 แถว 13 · 15 · 16) ═══════════
 *
 * ⭐ **พื้นที่จากแบบเป็นของหัวหน้าฝ่ายคนเดียว** — ผู้จัดคิวและช่างไม่ได้เขียน และไม่ถามนัด
 *   (งานโต๊ะไม่มีนัด · ช่างของนัดเก่ายังถูกมอบหมายอยู่บนนัดนั้น ด่านนัดจึงกันไม่ได้)
 * ⚠️ ถามวิธีผ่าน `isDrawingZone` เท่านั้น — แถวที่ไม่มีคีย์ `method` คือลงหน้างาน เดินด่านเดิมทุกตัวอักษร
 */
const DRAWING_ZONE_HEAD_ONLY = 'พื้นที่นี้หัวหน้าประเมินจากแบบ — ไม่ต้องวัดหน้างาน';
const LAST_ONSITE_CUT_CREW = 'พื้นที่สุดท้ายที่ต้องวัด — แจ้งหัวหน้าให้ตัดออก';
// งวด S1: หัวหน้าก็ยังตัดไม่ได้ขณะนัดเปิดอยู่ — บอกทางออกที่มีจริง (ยกเลิกนัดก่อน) · งวด S2a แทนด้วยกล่องยืนยันที่ยกเลิกนัดให้
const lastOnsiteVisitOpenText = (visit) => `พื้นที่สุดท้ายที่ต้องวัด และนัด ${visit.code || visit.id} ยังเปิดอยู่`
  + ' — ยกเลิกนัดที่หน้าจัดคิวก่อน แล้วค่อยตัดพื้นที่นี้ออก';

/**
 * ตัด/ลบแถวนี้แล้วใบ **พลิก** จาก "ต้องมีนัด" เป็นงานโต๊ะไหม (พื้นที่ลงหน้างานสุดท้ายหายไป ขณะที่ยังมีพื้นที่จากแบบ)
 * คืน `{ flips, heal, staleCutIds, response }` — `response` = ต้องตีกลับ (ยังไม่เขียนอะไร) · ไม่พลิก = `flips: false` เดินเหมือนเดิม
 *   `staleCutIds` = แถวที่ถูกตัดไว้แล้วและยังไม่เป็นจากแบบ (ของที่ `markCutZonesDrawing` ต้องทำเครื่องหมาย)
 *
 * ① ไม่มีนัดค้าง หรือนัดกำลังทำ — ใครตัดได้วันนี้ก็ตัดได้ (ช่างยืนอยู่หน้างานแล้ว) · ไม่ยกเลิกนัด ไม่แตะวันบนใบ
 * ② นัดยังเป็นร่าง/ลงตารางแล้ว — นัดนั้นจะค้างอยู่บนใบที่ไม่เหลืออะไรให้ไปวัด ⇒ ตีกลับทุกคน
 *    (ช่างที่ยังไม่กดเริ่มงานยังไม่ได้อยู่หน้างาน ⇒ ให้แจ้งหัวหน้า)
 * ⭐ `heal` = ใบ **เป็นงานโต๊ะอยู่แล้ว** แต่ยังมีแถวที่ถูกตัดซึ่งไม่ได้เป็นจากแบบ (รอบพลิกก่อนหน้าทำเครื่องหมายไม่สำเร็จ)
 *    ⇒ ผู้เรียกทำเครื่องหมายให้ครบ **ก่อน** ตัด/ลบแถวนี้ — นี่คือจังหวะเดียวที่แถวค้างแบบนั้นมีผล (ตัดจนหมดใบ)
 *    ใบลงหน้างานล้วนและใบผสมได้ `false` เสมอ
 * ⚠️ อ่านแถวของใบเฉพาะตอนเรียก — ผู้เรียกเรียกเฉพาะคำขอที่ตัด/ลบจริง การบันทึกทั่วไปไม่เสีย query เพิ่ม
 */
async function lastOnsiteZoneGate(supabase, { id, row, to, user }) {
  const rows = await loadSurveyZones(supabase, id);
  const staleCutIds = rows.filter((r) => r?.status === 'cut' && !isDrawingZone(r)).map((r) => r.id);
  if (!surveyZoneChangeFlips(rows, { id: row.id, to })) {
    return { flips: false, heal: !surveyNeedsVisit(rows) && staleCutIds.length > 0, staleCutIds, response: null };
  }
  const open = await findSurveyVisit(supabase, id, { openOnly: true });
  if (open && ['draft', 'scheduled'].includes(open.status)) {
    return {
      flips: true,
      heal: false,
      staleCutIds,
      response: canSendSurveyResult(user) ? conflict(lastOnsiteVisitOpenText(open)) : forbidden(LAST_ONSITE_CUT_CREW),
    };
  }
  return { flips: true, heal: false, staleCutIds, response: null };
}

/**
 * ใบพลิกเป็นงานโต๊ะ ⇒ แถวที่ **ถูกตัดไปก่อนแล้ว** ของใบต้องเป็นจากแบบด้วย — คืนข้อความ error หรือ `null`
 * 🐞 กติกา "ถูกตัดหมดทั้งใบ" ของ `surveyNeedsVisit` อ่านวิธีของแถวที่ตัด ⇒ เหลือแถวตัดที่ยังเป็นลงหน้างานไว้
 *    แล้ววันหนึ่งพื้นที่จากแบบถูกตัดจนหมด ใบจะพลิกกลับไป "ต้องมีนัด" ทั้งที่วันบนใบเป็นวันของงานโต๊ะ
 * @param ids แถวที่ต้องทำเครื่องหมาย (`staleCutIds` ของ `lastOnsiteZoneGate`) — ว่าง = ไม่ยิงคำสั่งเลย
 *            ⚠️ ระบุรายแถว ไม่กวาดทั้งใบ: แถวที่กำลังตัดเองพก `method` ไปในคำสั่งของมันแล้ว และ `updatedAt` ของมัน
 *               ต้องตรงกับที่เพิ่งส่งกลับให้จอ · `.eq('status', 'cut')` ยังอยู่ — แถวที่ถูกคืนเข้าใบแทรกกลางไม่ถูกแตะ
 * 🔴 **ตอนพลิก เรียกหลังแถวของตัวเองเขียนติดแล้วเท่านั้น**
 *    🐞 เดิมทำเครื่องหมายก่อน ⇒ แถวของตัวเองเขียนไม่ติด (อีกคนบันทึกแทรก = 409) = ใบยังต้องมีนัด แต่แถวที่ตัดไว้ก่อน
 *       กลายเป็นจากแบบไปแล้ว: ช่าง/ผู้จัดคิวที่ตัดไว้คืนเองไม่ได้ และหัวหน้ากด "เอากลับเข้าใบ" ได้พื้นที่จากแบบที่ไม่มีใครเลือก
 *    ล้มหลังแถวของตัวเองติด = ใบเป็นงานโต๊ะแล้วแต่แถวที่ตัดไว้ก่อนยังไม่ครบ — ไม่มีผลจนกว่าจะตัดจนหมดใบ
 *    และการตัด/ลบครั้งถัดไปของใบซ่อมให้ก่อน (`heal` ของ `lastOnsiteZoneGate`)
 */
async function markCutZonesDrawing(supabase, requestId, ids) {
  if (!ids?.length) return null;
  const { error } = await supabase
    .from('service_survey_zones')
    .update({ method: SURVEY_METHOD_DRAWING, updatedAt: new Date().toISOString() })
    .eq('requestId', requestId).eq('status', 'cut').in('id', ids);
  return error ? error.message : null;
}
const markAfterWriteError = (done, message) => `${done} แต่บันทึกวิธีประเมินของพื้นที่ที่ตัดไว้ก่อนหน้าไม่สำเร็จ — โหลดหน้าใหม่ (${message})`;

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

    if (isDrawingZone(row)) {
      // พื้นที่จากแบบ — หัวหน้าฝ่ายเท่านั้น ไม่ถามนัด (เหตุผลที่หัวข้อ "วิธีประเมินรายพื้นที่" ข้างบน)
      if (!canSendSurveyResult(user)) return forbidden(DRAWING_ZONE_HEAD_ONLY);
    } else {
      /* 🔑 **ด่านรายใบ ใช้ตัวตัดสินตัวเดียวกับนัด** — เจ้าหน้าที่หน้างานเขียนได้เฉพาะ
         ใบที่ตัวเองถูกมอบหมาย · นัดของใบประเมินคือที่เดียวที่บอกว่า "ใครไป" */
      const visit = await findSurveyVisit(supabase, id);
      const access = visitWriteAccess({ user, visit, canEditAll });
      if (!access.ok) return access.error ? forbidden(access.error) : forbidden();
    }

    const body = await req.json().catch(() => ({}));

    /* 🐞 review 26/09 — **ร่างตั้งต้นจากแถวรุ่นไหน** (`baseUpdatedAt`) · ไม่ตรงกับแถวในฐาน = อีกคนบันทึกไปก่อน
       ⇒ 409 พร้อมแถวล่าสุด แทนการเขียนทั้งก้อนทับ (ร่างเก่าที่มีแค่ส่วนว่าง = `parts: []` ลบขนาดที่เขาเพิ่งวัด)
       ⚠️ ไม่ส่งมา = ไม่ถาม (แท็บเก่า · ตัด/เอากลับจากหน้าแม่ซึ่งไม่แตะขนาด/จุด/หมายเหตุ) */
    if (surveyZoneStaleError(row, body.baseUpdatedAt)) return Response.json(surveyZoneStaleBody(row), { status: 409 });

    const patch = {};
    // การตัดครั้งนี้ทำให้ใบพลิกเป็นงานโต๊ะไหม — ตั้งในก้อนสถานะข้างล่าง ใช้ตอนเขียน
    let flipsToDesk = false;
    // ใบงานโต๊ะที่ยังมีแถวตัดเก่าไม่ได้เป็นจากแบบ (รอบพลิกก่อนทำเครื่องหมายไม่สำเร็จ) — ซ่อมก่อนตัดแถวนี้
    let healCutMarks = false;
    let staleCutIds = [];

    /* แท็บรุ่นเก่า (ไม่ส่งรุ่น) ส่งส่วน/จุดว่างที่จอเติมให้ทั้งก้อน = ไม่ได้ตั้งใจแก้ช่องนั้น — ไม่งั้นกลายเป็น `[]` ทับของอีกคน (review 26/09) */
    if (body.baseUpdatedAt === undefined) {
      if (surveyOnlyBlankRows(body.parts, ['label', 'widthM', 'lengthM', 'heightM'])) body.parts = undefined;
      if (surveyOnlyBlankRows(body.spots, ['label', 'note'])) body.spots = undefined;
    }

    const parts = normalizeSurveyParts(body.parts, { newId: () => genId('PRT') });
    if (parts.error) return badRequest(parts.error);
    if (parts.value !== undefined) patch.parts = parts.value;

    /* 🔴 **วัดใหม่หลังหัวหน้าเคาะ = ประทับ "ที่ระบบเสนอ" ใหม่จากปริมาตรใหม่** (review PR-P · mig 0398) — ด่าน "ต่างจากที่
       ระบบเสนอต้องบอกเหตุผล" อ่านภาพนิ่งบนแถว ⇒ ไม่ประทับ = เคาะ SM ไว้ แล้ววัดใหม่ได้ 3,600 ลบ.ม. ส่งผลได้โดยไม่มีเหตุผล
       ⚠️ ทะเบียนอ่านเฉพาะเมื่อแถวเคาะแล้ว **และ** ปริมาตรเปลี่ยน — ช่างบันทึกทั่วไปไม่เสีย query เพิ่ม
       ⚠️ อ่านทะเบียนไม่สำเร็จ = ไม่บันทึก (500 · กดใหม่) — กติกาและเหตุผลอยู่ที่ตัวตัดสิน ห้ามเขียนซ้ำที่นี่ */
    let restamp = null;
    if (surveyRemeasureTouchesSuggestion(row, patch.parts)) {
      restamp = surveyRemeasureStamp(row, patch.parts, await loadPackageSizesOrNull(supabase));
      if (restamp.error) return fail(restamp.error, 500);
      Object.assign(patch, restamp.patch);
    }

    /* พื้นที่จากแบบ: จุดที่เพิ่มใหม่ถือว่า **เลือกแล้ว** ทันที — คนเพิ่มคือหัวหน้าคนเดียวกับที่เคาะจุด ไม่มีรอบ "ช่างแจ้ง → หัวหน้าเลือก"
       ⚠️ สายลงหน้างานเรียกด้วยคำเดิมทุกตัวอักษร (ไม่ส่งตัวเลือกนี้เลย) — จุดของช่างยังรอหัวหน้าเคาะเหมือนเดิม */
    const spots = isDrawingZone(row)
      ? normalizeSurveySpots(body.spots, row.spots, { newId: () => genId('SPT'), defaultSelected: true })
      : normalizeSurveySpots(body.spots, row.spots, { newId: () => genId('SPT') });
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

      /* ── การตัด/คืนที่เปลี่ยนคำตอบ "ใบนี้ต้องมีนัดไหม" (mig 0408 · แผน §2 แถว 15–16) ──
         ⚠️ ถามเฉพาะตอนสถานะเปลี่ยนจริง (ตัดแถวที่ยังใช้อยู่ · คืนแถวที่ถูกตัด) — ใบลงหน้างานล้วนได้คำตอบ "ไม่เปลี่ยน"
            เสมอ แล้วเดินต่อด้วยคำสั่งเขียนชุดเดิม ไม่มีคีย์ `method` */
      if (body.status === 'cut' && row.status !== 'cut') {
        // ตัดพื้นที่ลงหน้างานสุดท้ายขณะที่ยังมีพื้นที่จากแบบ = ใบพลิกเป็นงานโต๊ะ ⇒ แถวนี้ตามไปเป็นจากแบบด้วย
        const last = await lastOnsiteZoneGate(supabase, { id, row, to: 'cut', user });
        if (last.response) return last.response;
        if (last.flips) {
          flipsToDesk = true;
          patch.method = SURVEY_METHOD_DRAWING;
        }
        healCutMarks = last.heal;
        staleCutIds = last.staleCutIds;
      } else if (body.status === 'ok' && row.status === 'cut' && !surveyNeedsVisit(await loadSurveyZones(supabase, id))) {
        /* คืนแถวเข้าใบงานโต๊ะ = แถวที่คืนเป็นจากแบบ (หัวหน้าฝ่ายเท่านั้น) — คืนเป็นลงหน้างานเฉย ๆ
           ใบจะพลิกกลับไปต้องมีนัดเงียบ ๆ จากปุ่ม "เอากลับเข้าใบ" ปุ่มเดียว */
        if (!canSendSurveyResult(user)) return forbidden(DRAWING_ZONE_HEAD_ONLY);
        patch.method = SURVEY_METHOD_DRAWING;
      }
    }

    if (!Object.keys(patch).length) return badRequest('ไม่มีอะไรให้บันทึก');

    /* ⭐ **ประทับคนวัดและเวลาทุกครั้งที่บันทึก** — ไม่ใช่แค่ครั้งแรก · ใบที่ถูกแก้ทีหลัง
       ต้องบอกได้ว่าใครแก้ล่าสุด (ตารางไม่มี updatedBy แยก) */
    patch.surveyedAt = new Date().toISOString();
    patch.surveyedById = user.id ? String(user.id) : null;
    patch.surveyedByName = user.name || null;
    patch.updatedAt = patch.surveyedAt;

    // ใบงานโต๊ะที่แถวตัดเก่ายังทำเครื่องหมายไม่ครบ — ซ่อมก่อนตัดแถวนี้ (ล้ม = ยังไม่ได้ตัดอะไร กดใหม่ได้ · ใบลงหน้างานไม่เข้า)
    if (healCutMarks) {
      const markError = await markCutZonesDrawing(supabase, id, staleCutIds);
      if (markError) return fail(markError, 500);
    }

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

    /* ใบพลิกเป็นงานโต๊ะ — แถวที่ตัดไปก่อนแล้วตามไปเป็นจากแบบ **หลังแถวนี้ถูกตัดจริง** (เหตุผลที่ `markCutZonesDrawing`)
       ⚠️ ล้ม = แถวนี้ตัดไปแล้ว ⇒ ยังเขียน audit แล้วค่อยตอบ 500 ที่บอกตรง ๆ ว่าตัดแล้ว */
    const markError = flipsToDesk ? await markCutZonesDrawing(supabase, id, staleCutIds) : null;

    await recordAudit({
      user, action: 'update', entityType: 'service_survey_zone', entityId: zoneId,
      before: row, after: data,
      summary: `บันทึกผลวัด ${data.zoneName}${data.status === 'cut' ? ' (ตัดออก)' : ''}${restamp?.summary || ''}`,
      request: req,
    });
    if (markError) return fail(markAfterWriteError(`ตัดพื้นที่ ${data.zoneName} ออกแล้ว`, markError), 500);
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
// PUT { packageSize?, packageQty?, packageNote?, selectedSpotIds? }
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

    /* 🔑 **ขนาด · จำนวน · เหตุผล ผ่านตัวตัดสินกลางตัวเดียวกับร่างบนจอ** (`surveyPackageDecision` · mig 0398)
       — ตรวจจากค่าหลังรวม · ประทับภาพนิ่ง (`packageSizeSuggested` · `packageSizeManual`) เมื่อขนาด/จำนวนเปลี่ยน ·
         ล้างจำนวน = ล้างภาพนิ่งทั้งสาม · กติกาทั้งหมดอยู่ที่นั่น ห้ามเขียนซ้ำที่นี่ (สองชุด = เพี้ยนหากัน)
       ⚠️ ทะเบียนอ่านเฉพาะเมื่อคำขอแตะขนาด/จำนวน — ติ๊กจุดติดตั้งหรือแก้เหตุผลอย่างเดียวไม่ต้องใช้ และไม่ควรล้มเพราะมัน
       ⚠️ อ่านทะเบียนไม่สำเร็จ = `null` ⇒ ตัวตัดสินปฏิเสธเอง (fail-closed · 500 ไม่ใช่ 400 — ไม่ใช่ความผิดของคำขอ) */
    const touchesPick = body.packageQty !== undefined || body.packageSize !== undefined;
    const sizes = touchesPick ? await loadPackageSizesOrNull(supabase) : null;
    const decision = surveyPackageDecision(row, body, sizes);
    if (decision.error) return decision.registryDown ? fail(decision.error, 500) : badRequest(decision.error);
    Object.assign(patch, decision.patch);

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

    patch.updatedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('service_survey_zones').update(patch).eq('id', zoneId).select().single();
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'update', entityType: 'service_survey_zone', entityId: zoneId,
      before: row, after: data,
      summary: `เคาะผลประเมิน ${data.zoneName}`
        + (patch.packageQty !== undefined || patch.packageSize !== undefined
          ? (data.packageQty ? ` · ${data.packageSize} · ${data.packageQty} แพ็คเกจ` : ' · ล้างการเคาะแพ็คเกจ')
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

    if (isDrawingZone(row)) {
      // พื้นที่จากแบบ — หัวหน้าฝ่ายเท่านั้น ไม่ถามนัด · ด่านล็อกของใบยังเป็นตัวเดิม
      if (!canSendSurveyResult(user)) return forbidden(DRAWING_ZONE_HEAD_ONLY);
      const locked = surveyEditLockError(request);
      if (locked) return conflict(locked);
    } else {
      const visit = await findSurveyVisit(supabase, id);
      const access = visitWriteAccess({ user, visit, canEditAll });
      const gate = surveyAddZoneError(request, { canWrite: access.ok === true });
      if (gate) return access.ok ? conflict(gate) : forbidden(access.error || gate);
    }

    /* ลบพื้นที่ลงหน้างานสุดท้ายขณะที่ยังมีพื้นที่จากแบบ = ใบพลิกเป็นงานโต๊ะ — กติกาเดียวกับการตัดใน `PATCH`
       (นัดร่าง/ลงตารางแล้วยังเปิด = ตีกลับก่อนแตะอะไร) */
    const last = await lastOnsiteZoneGate(supabase, { id, row, to: 'removed', user });
    if (last.response) return last.response;

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

    // ใบงานโต๊ะที่แถวตัดเก่ายังทำเครื่องหมายไม่ครบ — ซ่อมก่อนลบแถวนี้ (ล้ม = ยังไม่ได้ลบอะไร กดใหม่ได้ · ใบลงหน้างานไม่เข้า)
    if (last.heal) {
      const healError = await markCutZonesDrawing(supabase, id, last.staleCutIds);
      if (healError) return fail(healError, 500);
    }

    const purgeError = await purgeSurveyZoneRows(supabase, [row.id]);
    if (purgeError) return fail(purgeError, 500);

    /* ใบพลิกเป็นงานโต๊ะ — แถวที่ตัดไปก่อนแล้วตามไปเป็นจากแบบ **หลังแถวนี้ถูกลบจริง** (เหตุผลที่ `markCutZonesDrawing`)
       ⚠️ ล้ม = แถวนี้ลบไปแล้ว ⇒ เดินต่อให้จบ (โซน · audit) แล้วค่อยตอบ 500 ที่บอกตรง ๆ ว่าลบแล้ว */
    const markError = last.flips ? await markCutZonesDrawing(supabase, id, last.staleCutIds) : null;

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
    if (markError) return fail(markAfterWriteError(`ลบพื้นที่ ${row.zoneName} ออกจากใบแล้ว`, markError), 500);
    return ok({ id: row.id, zoneDropped });
  } catch (e) {
    return fail(e.message, 500);
  }
});
