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
import { surveyDrawingMethodEnabled } from '@/lib/service/surveyDrawingFlag';
import {
  SURVEY_METHOD_DRAWING, isDrawingZone, surveyNeedsVisit, surveyZoneChangeFlips,
} from '@/lib/service/surveyMethod';
import { notifySurveyDeskReady } from '@/lib/service/surveyMethodNotify';
import {
  SURVEY_METHOD_BODY_ERROR, SURVEY_METHOD_ERRORS, surveyDeskReadyTitle, surveyMethodActionId, surveyMethodPlanKey,
  surveyMethodSwitchPlan,
} from '@/lib/service/surveyMethodSwitch';
import { runSurveyMethodPlan, surveyVisitCancelledByKey } from '@/lib/service/surveyMethodWrites';
import { loadSurveySendBackState, loadSurveyZones } from '@/lib/service/surveyRepo';
import { findSurveyVisit, surveyDeskResultDate } from '@/lib/service/surveyVisit';
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
/* ช่างบันทึกพื้นที่ที่หัวหน้าเพิ่ง **สลับ** เป็นจากแบบ (แท็บที่ไม่ส่งรุ่นของแถว) — ไม่ใช่ "ไม่มีสิทธิ์" แต่ "ไม่ต้องวัดแล้ว" (แผน §3.4)
   ⚠️ แถวที่เกิดมาเป็นจากแบบ (ไม่เคยถูกสลับ) ยังได้ 403 ข้างบน — ช่างไม่เคยมีงานบนแถวนั้น */
const ZONE_SWITCHED_TO_DRAWING = 'พื้นที่นี้หัวหน้าเปลี่ยนเป็นประเมินจากแบบแล้ว — ไม่ต้องวัด · โหลดหน้าใหม่';
const ADDED_ZONE_CUT_ONSITE = 'พื้นที่นี้ช่างเพิ่มเองหน้างาน — ถ้าไม่เอาแล้วให้ลบทิ้ง ไม่ใช่ตัดออก';
// พื้นที่ที่เพิ่มบนใบงานโต๊ะ: คนเพิ่มคือหัวหน้า ไม่มีใครอยู่หน้างาน
const ADDED_ZONE_CUT_DRAWING = 'พื้นที่นี้ TS เพิ่มเอง — ถ้าไม่เอาแล้วให้ลบทิ้ง ไม่ใช่ตัดออก';
const LAST_ONSITE_CUT_CREW = 'พื้นที่สุดท้ายที่ต้องวัด — แจ้งหัวหน้าให้ตัดออก';
/* หัวหน้าตัดพื้นที่ลงหน้างานสุดท้ายขณะนัดยังเปิด — ประโยคที่บอกทางออกซึ่งมีจริงเสมอ (ยกเลิกนัดที่หน้าจัดคิวก่อน)
   สวิตช์ปิด = คำตอบทั้งหมด · สวิตช์เปิด = ประโยคเดียวกันนี้ พร้อม `code` ให้จอเปิดกล่องยืนยันที่ยกเลิกนัดให้ (แท็บเก่าอ่านประโยคนี้แล้วยังไปต่อได้) */
const lastOnsiteVisitOpenText = (visit) => `พื้นที่สุดท้ายที่ต้องวัด และนัด ${visit.code || visit.id} ยังเปิดอยู่`
  + ' — ยกเลิกนัดที่หน้าจัดคิวก่อน แล้วค่อยตัดพื้นที่นี้ออก';
const FLIP_CONFIRM_CODE = 'survey_flip_confirm';
const FLIP_RETRY_CODE = 'survey_flip_retry';
// แถวถูกตัดไปแล้ว แต่ผลที่ตามมา (ยกเลิกนัด · วันส่งผล · บรรทัดเธรด) ยังไม่ครบ — กดยืนยันซ้ำด้วย body เดิมทำต่อให้จบได้เสมอ
const flipRetryText = (zoneName) => `ตัดพื้นที่ ${zoneName} ออกแล้ว แต่บันทึกไม่ครบ — กดยืนยันอีกครั้ง`;

/**
 * ตัด/ลบแถวนี้แล้วใบ **พลิก** จาก "ต้องมีนัด" เป็นงานโต๊ะไหม (พื้นที่ลงหน้างานสุดท้ายหายไป ขณะที่ยังมีพื้นที่จากแบบ)
 * คืน `{ flips, heal, staleCutIds, response, rows, held }` — `response` = ต้องตีกลับ (ยังไม่เขียนอะไร) · ไม่พลิก = `flips: false` เดินเหมือนเดิม
 *   `staleCutIds` = แถวที่ถูกตัดไว้แล้วและยังไม่เป็นจากแบบ (ของที่ `markCutZonesDrawing` ต้องทำเครื่องหมาย)
 *   `rows` = แถวของใบที่เพิ่งอ่าน · `held` = นัดร่าง/ลงตารางแล้วที่ขวางอยู่ (เฉพาะ ②) — `PATCH` ใช้สองตัวนี้สร้างกล่องยืนยันของหัวหน้า
 *      (งวด S2a) แทน `response` เมื่อเปิดสวิตช์ · `DELETE` ตอบ `response` ตรง ๆ เสมอ (ลบแล้วแถวหาย กดซ้ำทำต่อให้จบไม่ได้)
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
    return {
      flips: false, heal: !surveyNeedsVisit(rows) && staleCutIds.length > 0, staleCutIds, response: null, rows, held: null,
    };
  }
  const open = await findSurveyVisit(supabase, id, { openOnly: true });
  if (open && ['draft', 'scheduled'].includes(open.status)) {
    return {
      flips: true,
      heal: false,
      staleCutIds,
      response: canSendSurveyResult(user) ? conflict(lastOnsiteVisitOpenText(open)) : forbidden(LAST_ONSITE_CUT_CREW),
      rows,
      held: open,
    };
  }
  return { flips: true, heal: false, staleCutIds, response: null, rows, held: null };
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

/**
 * กระดิ่งถึงหัวหน้าฝ่าย: ใบเพิ่งกลายเป็นงานประเมินจากแบบ **โดยคนที่ไม่ใช่หัวหน้า** (ตัด / ลบพื้นที่ลงหน้างานสุดท้าย ① —
 * ไม่มีนัดค้าง หรือนัดกำลังทำ) · งานต่อจากนี้เป็นของหัวหน้า และไม่มีอะไรบนจอของเขาบอกว่าใบเปลี่ยนมือแล้ว (งวด S2a §3 B-13)
 *
 * 🔴 **กุญแจของเหตุการณ์บังคับ** (`key`) — กระดิ่งกันซ้ำถาวรด้วยกุญแจ: ไม่มี = ตัวยิงไม่ยิงเลย · ผู้เรียกส่งกุญแจที่ชี้ "ครั้งที่ใบพลิก"
 *    (ตัด = รุ่นของแถวหลังตัด — ตัดอีกครั้งหลังเอากลับเข้าใบได้รุ่นใหม่ จึงเด้งอีกรอบ · ลบ = แถวถูกลบได้ครั้งเดียว)
 * ⚠️ ไม่เขียนเธรด ไม่แตะวันบนใบ (แผน §2 แถว 16 ①) · ไม่ขึ้นกับสวิตช์ — ใบพลิกจากแถว ไม่ใช่จากปุ่มใหม่
 * ⚠️ พลาด = ลง log แล้วจบ — การตัด / ลบที่เขียนติดไปแล้วต้องไม่ตอบ error เพราะกระดิ่ง
 * @param request  แถวใบที่ผู้เรียกมีอยู่แล้ว (`DELETE`) — ไม่ส่ง = อ่านเฉพาะ `docNo` / `title` หนึ่งครั้ง (เฉพาะตอนใบพลิก)
 */
async function bellHeadsDeskReady(supabase, { id, request = null, user, key }) {
  try {
    let sheet = request;
    if (!sheet) {
      const { data, error } = await supabase
        .from('dept_requests').select('id, "docNo", title').eq('id', id).maybeSingle();
      if (error) throw error;
      sheet = data;
    }
    if (!sheet) return;
    notifySurveyDeskReady(supabase, { request: sheet, actor: user, title: surveyDeskReadyTitle(sheet), key });
  } catch (e) {
    console.error('[survey] แจ้งหัวหน้าว่าใบกลายเป็นงานประเมินจากแบบไม่สำเร็จ', id, e?.message || e);
  }
}

/* ══ หัวหน้าตัดพื้นที่ลงหน้างานสุดท้ายขณะนัดยังเป็นร่าง / ลงตารางแล้ว (แถว 16 ② · งวด S2a §3 B-12) ═══════════════
 *
 * ⭐ งวด S1 ตีกลับให้ไปยกเลิกนัดที่หน้าจัดคิวก่อน · งวดนี้ (เมื่อเปิดสวิตช์) หัวหน้ายืนยันในกล่องเดียว แล้วเส้นนี้ทำให้ครบ:
 *    ตัดแถว → ยกเลิกนัด + แจ้งช่าง → แถวที่ตัดไว้ก่อนตามไปเป็นจากแบบ → รับปากวันส่งผล → บรรทัดเธรดถึงฝ่ายขาย
 *    ข้อความในกล่อง บรรทัดเธรด กระดิ่ง และสิ่งที่เขียน มาจาก **แผนตัวเดียว** (`surveyMethodSwitchPlan` แบบ `cut`) —
 *    เส้นนี้ไม่แต่งประโยคและไม่คิดผลเอง · ลำดับเขียนหลังแถวของตัวเองอยู่ที่ `runSurveyMethodPlan`
 *
 * 🔴 **แถวของตัวเองก่อนเสมอ** (บทเรียนรีวิวงวด S1) — คำสั่งตัดผูกกับรุ่นของแถว จึงพลาดได้ (อีกคนบันทึกแทรก)
 *    ยกเลิกนัดก่อนแล้วตัดไม่ติด = บอกช่างว่างานหายทั้งที่ใบยังต้องไปวัด ⇒ ตัดไม่ติด = 409 เดิม ไม่มีอะไรอื่นถูกเขียน
 * 🔴 **ตัดติดแล้วผลที่ตามมาไม่ครบ = `survey_flip_retry`** ทุกกรณี (ฐานพัง · ช่างกดเริ่มงานแทรก) — กดยืนยันซ้ำด้วย body เดิม
 *    เข้า "ทางทำต่อให้จบ" (`finishFlipCut`) ซึ่งจบได้เสมอ · ข้อยกเว้นเดียว: ใบถูกส่งผลไปก่อน (ไม่มีอะไรให้ทำต่อ — ตอบประโยคนั้นตรง ๆ)
 * ⚠️ `actionId` ใน `flip` = เลขของการกดหนึ่งครั้ง — กดซ้ำด้วยเลขเดิมได้บรรทัดเธรดและกระดิ่งชุดเดียว
 * ⚠️ `DELETE` ไม่มีทางนี้ — ลบแล้วแถวหาย กดซ้ำเพื่อทำต่อไม่ได้ (ยังตอบประโยคของงวด S1)
 */
const flipBodyOf = (body) => (body?.flip && typeof body.flip === 'object' && !Array.isArray(body.flip) ? body.flip : null);
const flipStale = () => conflict(SURVEY_METHOD_ERRORS.stale);

/** ตรวจ `flip.actionId` กับวันส่งผลที่หัวหน้าพิมพ์ — `{ response }` (400 · ยังไม่อ่านอะไรเพิ่ม) หรือ `{ key, resultDate }` */
function readFlipInput(flip, user) {
  const actionId = surveyMethodActionId(flip.actionId);
  if (!actionId) return { response: badRequest(SURVEY_METHOD_BODY_ERROR) };
  const result = surveyDeskResultDate({ committedResultDate: flip.committedResultDate });
  if (result.error) return { response: badRequest(result.error) };
  return { key: surveyMethodPlanKey({ userId: user.id, actionId }), resultDate: result.value };
}

/**
 * แผนของการตัดที่พลิกใบ — อ่านใบทั้งแถว (วันบนใบ · เลขที่ · ชื่องาน) กับสภาพการส่งกลับ **เฉพาะในกิ่งนี้**
 * คืน `{ request, plan }` · ใบหาย = `{ request: null }` · อ่านพลาด = โยน (500 ก่อนเขียนอะไร)
 * @param resultDate  วันส่งผลที่หัวหน้าพิมพ์ · ไม่ส่ง = วันที่ใบถืออยู่ (ค่าตั้งต้นของกล่อง)
 */
async function flipCutPlan(supabase, { id, rows, row, visit, reason, resultDate = null, user, nowIso }) {
  const { data: request, error } = await supabase
    .from('dept_requests').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!request) return { request: null, plan: null };
  const sendBack = await loadSurveySendBackState(supabase, id);
  const plan = surveyMethodSwitchPlan({
    rows,
    cut: { zoneId: row.id, to: 'cut' },
    visit,
    request,
    sendBack,
    reason,
    resultDate: resultDate ?? (request.committedResultDate || ''),
    actor: { id: user.id, name: user.name },
    nowIso,
  });
  return { request, plan };
}

/**
 * กิ่งของหัวหน้าเมื่อด่านตอบว่า "นัดยังเปิด" และสวิตช์เปิด — ยังไม่เขียนอะไร
 *   ไม่ส่ง `flip`  ⇒ `{ response }` 409 ประโยคเดิม + `code` + เนื้อของกล่องยืนยัน (บรรทัดผล · ช่องที่ต้องกรอก · ป้ายปุ่ม · นัดที่จะยกเลิก)
 *   ส่ง `flip`     ⇒ ตรวจเลขการกด → วันส่งผล → นัดที่กล่องบอกไว้ต้องเป็นนัดที่ขวางอยู่ตัวนี้ → คืน `{ plan, request, key, nowIso }`
 *                    ให้ `PATCH` ตัดแถวก่อนแล้วค่อยเดินแผน
 * @param fallback  คำตอบของงวด S1 — ใช้เมื่อแผนไม่เห็นว่าการตัดนี้พลิกใบ (ไม่ควรเกิด: ด่านกับแผนอ่านแถวชุดเดียวกัน)
 */
async function confirmFlipCut(supabase, { id, row, rows, held, flip, reason, user, fallback }) {
  let input = { key: null, resultDate: null };
  if (flip) {
    input = readFlipInput(flip, user);
    if (input.response) return input;
    if (String(flip.cancelVisitId) !== String(held.id)) return { response: flipStale() };
  }
  const nowIso = new Date().toISOString();
  const { request, plan } = await flipCutPlan(supabase, {
    id, rows, row, visit: held, reason, resultDate: input.resultDate, user, nowIso,
  });
  if (!request) return { response: notFound('ไม่พบใบคำร้อง') };
  if (!flip) {
    if (plan.stale || plan.kind !== 'cut') return { response: fallback };
    return {
      response: Response.json({
        error: lastOnsiteVisitOpenText(held),
        code: FLIP_CONFIRM_CODE,
        flip: {
          lines: plan.lines,
          needs: plan.needs,
          defaults: plan.defaults,
          confirmLabel: plan.confirmLabel,
          visit: { id: held.id, code: held.code ?? null },
        },
      }, { status: 409 }),
    };
  }
  if (plan.stale || plan.kind !== 'cut') return { response: flipStale() };
  if (plan.errors[0]) return { response: badRequest(plan.errors[0]) };
  return { plan, request, key: input.key, nowIso };
}

/** เดินแผนหลังแถวถูกตัดแล้ว — คืนผลของตัวเขียน · ตัวเขียนโยน (ไม่ควรเกิด) = นับเป็น "ไม่ครบ" ให้กดซ้ำ ไม่ใช่ 500 ที่ทิ้งนัดค้าง */
async function runFlipPlan(supabase, { plan, request, user, nowIso, key, req }) {
  try {
    return await runSurveyMethodPlan(supabase, { plan, request, user, nowIso, key, req });
  } catch (e) {
    console.error('[survey] เดินแผนของการตัดที่พลิกใบไม่สำเร็จ', request?.docNo || request?.id, e?.message || e);
    return { status: 409, error: SURVEY_METHOD_ERRORS.partial, code: 'partial' };
  }
}

/** ผลของตัวเขียนที่ไม่สำเร็จ → คำตอบของเส้นตัด (หัวข้อข้างบน: ทุกอย่าง = กดซ้ำ ยกเว้นใบถูกส่งผลไปก่อน) */
function flipFailure(out, zoneName) {
  if (out?.code === 'sent') return Response.json({ error: out.error }, { status: out.status || 409 });
  return Response.json({ error: flipRetryText(zoneName), code: FLIP_RETRY_CODE }, { status: 409 });
}

/**
 * 🔑 **ทางทำต่อให้จบ** — หัวหน้ากดยืนยันซ้ำ หลังรอบแรกตัดแถวติดแล้วแต่ผลที่ตามมาไม่ครบ (`survey_flip_retry` · คำตอบหายกลางทาง)
 * ผู้เรียกรับรองแล้วว่า: มี `flip` · แถวถูกตัดอยู่ด้วยเหตุผลเดียวกัน · ใบไม่ต้องมีนัดแล้ว ⇒ **ไม่ถามรุ่นของแถว ไม่เขียนแถว**
 *
 * ด่านนัด (`lastOnsiteZoneGate`) ไม่ถูกเรียกบนทางนี้ (แถวถูกตัดไปแล้ว) ⇒ หานัดเองตามลำดับ:
 *   ① ใบมีนัดที่ยังเปิด: ไม่ใช่นัดที่กล่องบอกไว้ = 409 (มีคนลงนัดใหม่ระหว่างทาง · ไม่เขียนอะไร) · ตัวเดียวกันและยังร่าง/ลงตาราง = ยกเลิกตามแผน
 *      · ตัวเดียวกันแต่ช่างกดเริ่มงานแล้ว = ไม่ยกเลิก (แผนตอบ `keep-open`) แต่วันส่งผลกับบรรทัดเธรดยังถูกเขียน — ใบเป็นงานโต๊ะไปแล้ว
 *   ② ไม่มีนัดเปิด: อ่านนัดที่กล่องบอกไว้ (ของใบนี้เท่านั้น) — หาไม่เจอ = 409 · ถูกยกเลิกแล้ว = พิสูจน์จากบรรทัดบนเธรดของนัดว่า
 *      การกดครั้งนี้เป็นคนยกเลิก (ใช่ ⇒ เธรดยังเล่าว่ายกเลิกนัด และช่างได้กระดิ่ง · ไม่ใช่ ⇒ นัดเป็นแค่ประวัติ) · ปิดแบบอื่น = ประวัติ
 * ทุกกิ่งที่ไม่ตอบ 409 สร้างแผนใหม่ (แถวนี้ถูกนับว่า "การกดนี้ตัดไปแล้ว") แล้วเดินตัวเขียน ⇒ ไม่มีสภาพไหนที่ "กดอีกครั้ง" ถูกปฏิเสธตลอดไป
 * ⚠️ อ่านพลาด (นัด · หลักฐาน) = 500 — ห้ามเดาว่า "ไม่ใช่" หรือ "ใช่" (supabase ไม่ throw)
 */
async function finishFlipCut(supabase, { id, row, rows, flip, reason, user, req }) {
  const input = readFlipInput(flip, user);
  if (input.response) return input.response;

  const named = flip.cancelVisitId == null ? '' : String(flip.cancelVisitId);
  let visit = await findSurveyVisit(supabase, id, { openOnly: true });
  if (visit) {
    if (String(visit.id) !== named) return flipStale();
  } else {
    if (!named) return flipStale();
    const { data, error } = await supabase
      .from('service_visits').select('*').eq('id', named).eq('requestId', id).maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return flipStale();
    visit = data;
    if (data.status === 'cancelled') {
      const proof = await surveyVisitCancelledByKey(supabase, { visitId: data.id, key: input.key });
      if (proof.error) return fail(proof.error.message, 500);
      if (proof.proved) visit = { ...data, cancelledByThisAction: true };
    }
  }

  const nowIso = new Date().toISOString();
  const { request, plan } = await flipCutPlan(supabase, {
    id, rows, row, visit, reason, resultDate: input.resultDate, user, nowIso,
  });
  if (!request) return notFound('ไม่พบใบคำร้อง');
  if (plan.stale || plan.kind !== 'cut') return flipStale();
  if (plan.errors[0]) return badRequest(plan.errors[0]);

  const out = await runFlipPlan(supabase, { plan, request, user, nowIso, key: input.key, req });
  if (!out.ok) return flipFailure(out, plan.cutZone.name);
  // `flip.visitAction` บอกจอว่านัดเป็นยังไง — ไม่ได้ยกเลิก (ช่างกดเริ่มงานไปก่อน) จอต้องพูดตามนั้น
  return ok({ ...row, flip: { visitAction: plan.visit.action } });
}

// PATCH { parts?, spots?, note?, status?, cutReason?, baseUpdatedAt?, flip? }
//   `flip` = { committedResultDate, cancelVisitId, actionId } — คำยืนยันของหัวหน้าจากกล่อง "ตัดพื้นที่และยกเลิกนัด" (อ่านเฉพาะตอนเปิดสวิตช์)
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

    /* ⚠️ อ่าน body **ก่อน** ด่านสิทธิ์ (งวด S2a) — ด่านของพื้นที่จากแบบต้องรู้ว่าจอส่งรุ่นของแถวมาไหม (ดูข้างล่าง) */
    const body = await req.json().catch(() => ({}));
    const isHead = canSendSurveyResult(user);

    /* 🐞 review 26/09 — **ร่างตั้งต้นจากแถวรุ่นไหน** (`baseUpdatedAt`) · ไม่ตรงกับแถวในฐาน = อีกคนบันทึกไปก่อน
       ⇒ 409 พร้อมแถวล่าสุด แทนการเขียนทั้งก้อนทับ (ร่างเก่าที่มีแค่ส่วนว่าง = `parts: []` ลบขนาดที่เขาเพิ่งวัด)
       ⚠️ ไม่ส่งมา = ไม่ถาม (แท็บเก่า · ตัด/เอากลับจากหน้าแม่ซึ่งไม่แตะขนาด/จุด/หมายเหตุ)
       ⚠️ ถามตรงนี้ ตอบข้างล่าง (หลังด่านสิทธิ์) — ลำดับคำตอบของสายลงหน้างานเท่าเดิม: ไม่มีสิทธิ์ก่อน ชนรุ่นทีหลัง */
    const staleVersion = surveyZoneStaleError(row, body.baseUpdatedAt);

    if (isDrawingZone(row)) {
      /* พื้นที่จากแบบ — หัวหน้าฝ่ายเท่านั้น ไม่ถามนัด (เหตุผลที่หัวข้อ "วิธีประเมินรายพื้นที่" ข้างบน)
         ⭐ **ช่างที่บันทึกช้ากว่าการสลับของหัวหน้า** (แผน §3.4 · งวด S2a) — การสลับขยับรุ่นของแถว ⇒ จอที่ส่งรุ่นมาได้คำตอบ
            "ชนรุ่น" ตัวเดิม (พกแถวล่าสุด จอขึ้นป้ายเองได้) · แท็บที่ไม่ส่งรุ่นได้ 409 ที่บอกว่าไม่ต้องวัดแล้ว
            · แถวที่เกิดมาเป็นจากแบบ (ไม่เคยถูกสลับ) = 403 เดิม */
      if (!isHead && !staleVersion) {
        return row.methodChangedAt ? conflict(ZONE_SWITCHED_TO_DRAWING) : forbidden(DRAWING_ZONE_HEAD_ONLY);
      }
    } else {
      /* 🔑 **ด่านรายใบ ใช้ตัวตัดสินตัวเดียวกับนัด** — เจ้าหน้าที่หน้างานเขียนได้เฉพาะ
         ใบที่ตัวเองถูกมอบหมาย · นัดของใบประเมินคือที่เดียวที่บอกว่า "ใครไป" */
      const visit = await findSurveyVisit(supabase, id);
      const access = visitWriteAccess({ user, visit, canEditAll });
      if (!access.ok) return access.error ? forbidden(access.error) : forbidden();
    }

    /* 🔑 **หัวหน้ากดยืนยันการตัดที่พลิกใบซ้ำ** (งวด S2a · `finishFlipCut`) — รอบแรกตัดแถวติดแล้ว ⇒ รุ่นของแถวที่จอถืออยู่เก่าไปแล้ว
       และไม่มีอะไรให้เขียนลงแถวอีก: ต้องดักก่อนคำตอบ "ชนรุ่น" ไม่งั้นการกดซ้ำถูกตีกลับตลอดไป ทั้งที่นัดยังไม่ถูกยกเลิก
       ⚠️ เข้าเฉพาะ: หัวหน้า · เปิดสวิตช์ · ส่ง `flip` มา · แถวถูกตัดอยู่ด้วยเหตุผลเดียวกับที่ขอ · ใบไม่ต้องมีนัดแล้ว
          นอกนั้น (รวมถึงไม่ส่ง `flip`) = เดินทางเดิมข้างล่างทุกก้าว */
    const flip = flipBodyOf(body);
    if (flip && isHead && body.status === 'cut' && row.status === 'cut' && surveyDrawingMethodEnabled()) {
      const cutReason = String(body.cutReason ?? row.cutReason ?? '').trim();
      if (cutReason === String(row.cutReason ?? '').trim()) {
        const rows = await loadSurveyZones(supabase, id);
        if (!surveyNeedsVisit(rows)) {
          return await finishFlipCut(supabase, { id, row, rows, flip, reason: cutReason, user, req });
        }
      }
    }

    if (staleVersion) return Response.json(surveyZoneStaleBody(row), { status: 409 });

    const patch = {};
    // การตัดครั้งนี้ทำให้ใบพลิกเป็นงานโต๊ะไหม — ตั้งในก้อนสถานะข้างล่าง ใช้ตอนเขียน
    let flipsToDesk = false;
    // ใบงานโต๊ะที่ยังมีแถวตัดเก่าไม่ได้เป็นจากแบบ (รอบพลิกก่อนทำเครื่องหมายไม่สำเร็จ) — ซ่อมก่อนตัดแถวนี้
    let healCutMarks = false;
    let staleCutIds = [];
    // หัวหน้ายืนยันการตัดที่พลิกใบขณะนัดยังเปิด (งวด S2a) — แผน + กุญแจของการกดนี้ · เดินหลังแถวนี้ถูกตัดจริง
    let flipRun = null;

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
        return badRequest(isDrawingZone(row) ? ADDED_ZONE_CUT_DRAWING : ADDED_ZONE_CUT_ONSITE);
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
        if (last.response) {
          /* นัดร่าง / ลงตารางแล้วขวางอยู่ (②) — ช่างและผู้จัดคิวได้ 403 เดิม · หัวหน้าตอนสวิตช์ปิดได้ประโยคเดิมของงวด S1
             หัวหน้าตอนสวิตช์เปิด = กล่องยืนยัน (`confirmFlipCut`): ยังไม่ส่ง `flip` ได้เนื้อของกล่อง · ส่งแล้วได้แผนไว้เดินหลังตัด */
          if (!last.held || !isHead || !surveyDrawingMethodEnabled()) return last.response;
          const confirmed = await confirmFlipCut(supabase, {
            id, row, rows: last.rows, held: last.held, flip, reason: patch.cutReason, user, fallback: last.response,
          });
          if (confirmed.response) return confirmed.response;
          flipRun = confirmed;
        } else if (flip && isHead && surveyDrawingMethodEnabled()) {
          /* 🔴 **หัวหน้ากดยืนยันจากกล่อง แต่กล่องนั้นไม่จริงแล้ว** — นัดที่กล่องบอกว่าจะยกเลิกไม่ได้ขวางอยู่แล้ว (ช่างกดเริ่มงาน ·
             มีคนปิด / ยกเลิกนัด) หรือการตัดนี้ไม่พลิกใบแล้ว (อีกคนสลับพื้นที่อื่นกลับเป็นลงหน้างาน) ⇒ ตอบ "ล้าสมัย" **ก่อนเขียนอะไร**
             — คำตอบเดียวกับเส้นสลับวิธี (ด่าน ⑩) · โหลดใหม่แล้วตัดอีกครั้งได้ผลตามสภาพจริงของใบ
             🐞 เดิมกิ่งนี้ตกไปเป็นการตัดธรรมดา: แถวถูกตัด ใบกลายเป็นงานโต๊ะ ตอบ 200 — แต่วันส่งผลที่พิมพ์ในกล่อง บรรทัดเธรดถึง
                ฝ่ายขาย และกระดิ่ง หายเงียบทั้งหมด โดยไม่มีอะไรบอกหัวหน้าว่าของในกล่องไม่ได้เกิด */
          return flipStale();
        }
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

    const zoneAudit = () => recordAudit({
      user, action: 'update', entityType: 'service_survey_zone', entityId: zoneId,
      before: row, after: data,
      summary: `บันทึกผลวัด ${data.zoneName}${data.status === 'cut' ? ' (ตัดออก)' : ''}${restamp?.summary || ''}`,
      request: req,
    });

    /* หัวหน้ายืนยันการตัดที่พลิกใบ (งวด S2a) — แถวนี้ตัดติดแล้ว ⇒ เดินแผนต่อทันที: ยกเลิกนัด · แถวที่ตัดไว้ก่อนตามไปเป็นจากแบบ ·
       วันส่งผล · บรรทัดเธรด (ตัวเขียนทำเครื่องหมายแถวที่ตัดไว้ก่อนเอง — ไม่เรียก `markCutZonesDrawing` ซ้ำ)
       ⚠️ audit ของแถวเขียนหลังแผน: ช่วงระหว่าง "ตัดติด" กับ "ยกเลิกนัด" ต้องสั้นที่สุด (ช่างกดเริ่มงานแทรกได้) · แผนไม่ครบก็ยังเขียน —
          การตัดเกิดขึ้นจริง */
    if (flipRun) {
      const out = await runFlipPlan(supabase, { ...flipRun, user, req });
      await zoneAudit();
      if (!out.ok) return flipFailure(out, flipRun.plan.cutZone.name);
      return ok({ ...data, flip: { visitAction: flipRun.plan.visit.action } });
    }

    /* ใบพลิกเป็นงานโต๊ะ — แถวที่ตัดไปก่อนแล้วตามไปเป็นจากแบบ **หลังแถวนี้ถูกตัดจริง** (เหตุผลที่ `markCutZonesDrawing`)
       ⚠️ ล้ม = แถวนี้ตัดไปแล้ว ⇒ ยังเขียน audit แล้วค่อยตอบ 500 ที่บอกตรง ๆ ว่าตัดแล้ว */
    const markError = flipsToDesk ? await markCutZonesDrawing(supabase, id, staleCutIds) : null;
    /* ใบเพิ่งกลายเป็นงานประเมินจากแบบโดยคนที่ไม่ใช่หัวหน้า ⇒ กระดิ่งถึงหัวหน้า (`bellHeadsDeskReady`) · หัวหน้าตัดเองไม่เด้งหาใคร
       กุญแจ = รุ่นของแถวหลังตัด: ตัดอีกครั้งหลังเอากลับเข้าใบได้รุ่นใหม่ · คำขอเดิมที่ถูกส่งซ้ำไม่เข้ากิ่งนี้ (แถวถูกตัดไปแล้ว = ไม่พลิก) */
    if (flipsToDesk && !isHead) {
      await bellHeadsDeskReady(supabase, { id, user, key: `cut:${zoneId}:${data.updatedAt}` });
    }

    await zoneAudit();
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
    /* 🔴 **ผูกกับรุ่นของแถวที่เพิ่งอ่าน** — ท่าเดียวกับ `PATCH` ข้างบน (ไม่โดนแถว = 409 พร้อมแถวล่าสุด ไม่ใช่เขียนทับ)
       `spots` ของคำสั่งนี้ประกอบจากแถวที่อ่านไว้ ⇒ เขียนแบบไม่ผูกรุ่น = ทับการปลดเลือกจุดของเส้นสลับวิธี (พื้นที่ที่เพิ่ง
       กลับเป็นลงหน้างานได้จุดที่เลือกจากแบบกลับมา) และทับจุดที่ช่างเพิ่งบันทึก */
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
    /* ใบเพิ่งกลายเป็นงานประเมินจากแบบโดยคนที่ไม่ใช่หัวหน้า ⇒ กระดิ่งถึงหัวหน้า — กติกาเดียวกับการตัดใน `PATCH`
       กุญแจ = id ของแถว (แถวถูกลบได้ครั้งเดียว) · ใบอ่านไว้แล้วข้างบน ไม่อ่านซ้ำ */
    if (last.flips && request && !canSendSurveyResult(user)) {
      await bellHeadsDeskReady(supabase, { id, request, user, key: `del:${zoneId}` });
    }

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
