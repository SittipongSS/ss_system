// ── นัดประเมินพื้นที่ = ก้าว "ลงคิว" ของ TS (mig 0314 · เฟส 2) ────────────
//
// ⭐ **หนึ่งใบ = หนึ่งนัด** (แผน §4) — ใบประเมินหนึ่งใบมีสถานที่เดียว ⇒ นัดเดียว
//    วัน/เวลา/เจ้าหน้าที่ จึงเป็นของก้อนเดียวกัน ไม่ต้องถามว่า "วันนี้ไปสาขาไหน"
//
// 🔴 **ลงคิว = แจ้งกำหนดส่ง + สร้างนัด ในจังหวะเดียว** — ไม่ใช่สองปุ่มให้ลืมกดอันหนึ่ง
//    วันบนใบ (`committedDueDate`) กับวันบนนัด (`scheduledDate`) เป็นค่าเดียวกันเสมอ
//    ⇒ เลื่อนวันบนใบต้องขยับนัดด้วย และกลับกัน (ดู `moveSurveyVisit`)
//
// ⚠️ **นัดชนิดนี้สร้างมือไม่ได้** — `VISIT_KINDS_MANUAL` ตัด `survey` ออกจากโมดัลนัด
//    ทุกใบจึงมีใบคำร้องเป็นต้นเรื่องเสมอ (กติกาเดียวกับที่ไซต์เกิดจากคำร้องทางเดียว)
import { genId } from '@/lib/id';
import { insertRowWithEntityCode } from '@/lib/entityCode';
import { toHHMM } from '@/lib/service/sites';
import { initialVisitStatus } from '@/lib/service/visitGate';
import { normalizeSurveyCommittedResult } from '@/lib/service/surveyRequest';
import { REQUEST_SLOT_VISIT_STATES } from '@/lib/service/visitStatus';

export const SURVEY_VISIT_KIND = 'survey';


/**
 * ตรวจของที่ต้องมีก่อนลงคิว — คืน **ทุกข้อที่ขาด** เป็นลิสต์ข้อความไทย (ผ่าน = `[]`)
 *
 * ⭐ **ลิสต์ ไม่ใช่ข้อแรกข้อเดียว** (มติเจ้าของ 23/09 · ลงคิวจากหน้าจัดคิวได้) — ปุ่ม "ลงคิว"
 *    ของโมดัลกลาง (`CommitDueDialog`) ต้องบอกทุกช่องที่ขาดในครั้งเดียว (กฎฟอร์มของ repo)
 *    ไม่ใช่ให้คนแก้ทีละช่องแล้วเจอข้อถัดไป · server ยังตอบข้อแรกข้อเดียวผ่าน
 *    `surveyScheduleError` **ด้วยลำดับเดิมเป๊ะ** ⇒ ข้อความที่ API ตอบไม่เปลี่ยน
 * ⚠️ **เจ้าหน้าที่บังคับ** ต่างจากหัวข้ออื่นที่แจ้งกำหนดส่งได้โดยยังไม่รู้ว่าใครทำ — งานนี้
 *    ต้องมีคนขับรถไปจริง และนัดที่ไม่มีเจ้าหน้าที่จะไม่ผ่านด่านเข้าไซต์ (`evaluateVisitGate`)
 *    ⇒ จอดเป็นร่างที่ไม่โผล่บนตารางใคร ซึ่งอ่านเหมือนลงคิวไม่สำเร็จ
 * ⚠️ **เวลาไม่บังคับ** — "ไปวันนั้นทั้งวัน" เป็นคำตอบที่ถูกต้องของงานจริง
 */
export function surveyScheduleGaps(body = {}, request = {}) {
  const gaps = [];
  const input = body || {};
  if (!request?.siteId) gaps.push('ใบนี้ไม่มีสถานที่ — ลงคิวไม่ได้');
  if (!String(input.committedDueDate ?? '').trim()) gaps.push('ต้องระบุวันนัดเข้าพื้นที่');
  if (!String(input.assigneeId ?? '').trim()) gaps.push('ต้องเลือกเจ้าหน้าที่ผู้รับผิดชอบ');
  const time = String(input.committedDueTime ?? '').trim();
  if (time && !toHHMM(time)) gaps.push('เวลานัดไม่ถูกต้อง');
  /* ⭐ **วันส่งผลบังคับตั้งแต่ตอนลงคิว** (มติผู้ใช้ 2026-09-21 · mig 0368) — ฝ่ายขาย
     ที่ต้องเสนอราคาถามคำถามเดียวคือ "ได้ตัวเลขวันไหน" · วันนัดเข้าพื้นที่ตอบคำถาม
     นั้นไม่ได้ ⇒ รับปากวันไปแล้วแต่ยังไม่บอกวันส่งผล = ใบที่ตอบคำถามผิดข้อ
     ⚠️ ตรวจที่นี่ ไม่ใช่ที่ route — จอกับ server ต้องอ่านกฎตัวเดียวกัน */
  const result = normalizeSurveyCommittedResult(input.committedResultDate, input.committedDueDate);
  if (result.error) gaps.push(result.error);
  return gaps;
}

/** ข้อแรกที่ขาด หรือ `null` ถ้าผ่าน — ตัวที่ route ใช้ตีกลับ 400 (ลำดับเดียวกับ `surveyScheduleGaps`) */
export function surveyScheduleError(body = {}, request = {}) {
  return surveyScheduleGaps(body, request)[0] ?? null;
}

/**
 * นัดของใบนี้ (ถ้ามี) — ใบเดียวมีนัด **ที่ยังไม่ปิด** ได้ใบเดียวตามมติ ⇒ คืนแถวเดียว
 *
 * ⚠️ `openOnly` = ถามว่า "ตอนนี้ใบนี้มีนัดค้างอยู่ไหม" ซึ่ง **ไม่เท่ากับ** "เคยมีนัดไหม" —
 *    ใบที่ไปแล้วเข้าไม่ได้ (`unable`) หรือยกเลิกไป มีประวัตินัดอยู่ แต่ไม่มีนัดค้าง
 *    ⇒ ต้องลงคิวใหม่ได้ · ตัวที่ตัดสินคือชุดเดียวกับ index ของ mig 0316
 * ⚠️ ไม่ใช้ `.eq('status', ...)` หลายรอบ — PostgREST ต้องการ `not.in.(a,b)` ก้อนเดียว
 * ⭐ `preferOpen` = "นัดที่ยังค้างถ้ามี ไม่มีก็ใบล่าสุด" — จอประเมินต้องเห็น **นัดตัวเดียวกับที่ปุ่มส่งผลจะปิด**
 *    (มติ 24/09 ส่งผลปิดนัด) · 🐞 ใบล่าสุดตาม `createdAt` ไม่ใช่นัดที่เปิดอยู่เสมอ: นัดเก่าที่ถูกเปิดกลับมา
 *    หลบอยู่หลังนัดใหม่ที่ปิดแล้ว ⇒ โมดัลบอกว่าไม่มีนัดต้องปิด แต่ route เจอนัดค้างแล้วตีกลับทุกครั้ง
 */
export async function findSurveyVisit(supabase, requestId, { openOnly = false, preferOpen = false } = {}) {
  if (preferOpen && !openOnly) {
    const open = await findSurveyVisit(supabase, requestId, { openOnly: true });
    if (open) return open;
  }
  let query = supabase
    .from('service_visits').select('*')
    .eq('requestId', requestId);
  if (openOnly) query = query.in('status', REQUEST_SLOT_VISIT_STATES);
  const { data, error } = await query.order('createdAt', { ascending: false }).limit(1);
  if (error) throw error;
  return (data || [])[0] || null;
}

/**
 * สร้างนัดของใบ — คืน `{ visit, error }`
 *
 * ⚠️ **สถานะมาจากด่าน ไม่ใช่จากผู้เรียก** (`initialVisitStatus`) — นัดที่ผ่านด่าน
 *    ขึ้นตารางเลย · ไม่ผ่าน (เช่นวันอยู่นอกช่วงที่ไซต์ให้เข้า) จอดเป็นร่างให้คนจัดการ
 *    ซึ่งเป็นกติกาเดียวกับนัดทุกชนิดในโมดูลนี้
 * 🪤 **ช่วงเข้าไซต์ต้องมากับ `site`** — route `commit-due` ส่งไซต์จาก `loadSurveySite` ซึ่ง select แค่
 *    id/code/name/customerId ⇒ ด่าน ④ ไม่เห็นช่วงเวลา นัดประเมินลงตารางเสมอ (รีวิว UAT 24/09 · รอมติเจ้าของว่า
 *    จะให้จอดร่างจริงไหม) · โมดัลลงคิวพูดตามพฤติกรรมจริงนี้ — ยาม surveyVisit.test.mjs แดงเมื่อ select เปลี่ยน
 */
/**
 * แปลง error ของ index `service_visits_survey_open_request_uk` (mig 0316) เป็นภาษาคน
 *
 * ⚠️ **จังหวะที่มาถึงตรงนี้จริงคือการกดพร้อมกันสองที่** — ด่านข้างบนตรวจไปแล้ว แต่
 *    ระหว่าง "ตรวจ" กับ "เขียน" มีช่องว่างเสมอ · ปล่อยข้อความดิบของ Postgres ขึ้นจอ
 *    (`duplicate key value violates unique constraint …`) = คนอ่านไม่รู้ว่าเกิดอะไร
 *    และจะกดซ้ำอีกรอบ
 */
export function surveyVisitInsertError(error) {
  const raw = String(error?.message || '');
  if (raw.includes('service_visits_survey_open_request_uk')) {
    return 'ใบนี้เพิ่งถูกลงคิวจากอีกหน้าจอ — เปิดใบใหม่อีกครั้งเพื่อดูนัดล่าสุด';
  }
  return raw;
}

/**
 * แถวนัดประเมินที่ "ลงคิว" จะสร้าง (ยังไม่มีสถานะ · ยังไม่มี id) — **ตัวเดียวของ server กับจอ**
 *
 * ⭐ `createSurveyVisit` ประกอบแถวที่จะบันทึกจากตัวนี้ และโมดัลลงคิวส่งตัวนี้เข้า `evaluateVisitGate`
 *    (แผงด่าน) และบรรทัดผลลัพธ์ใต้ปุ่ม ⇒ จอกับ server ประเมินแถวรูปเดียวกันเป๊ะ (มติ 24/09 แบบ A)
 * ⚠️ ห้ามเติม/ตัดช่องที่นี่เพื่อจอฝ่ายเดียว — สองฝั่งจะพูดไม่ตรงกันทันที
 */
export function surveyVisitDraft({ request, date, time, assigneeId, assigneeName } = {}) {
  return {
    siteId: request?.siteId,
    requestId: request?.id,
    kind: SURVEY_VISIT_KIND,
    scheduledDate: date,
    startTime: time ? toHHMM(time) : null,
    assigneeId: assigneeId || null,
    assigneeName: assigneeName || null,
    // ⭐ โน้ตของนัดชี้กลับไปที่ใบ — เจ้าหน้าที่ที่เปิดจากตารางต้องรู้ว่ามาจากเรื่องอะไร
    note: `ประเมินพื้นที่ตามคำร้อง ${request?.docNo || request?.id}`.slice(0, 1000),
  };
}

export async function createSurveyVisit(supabase, {
  request, site, date, time, assigneeId, assigneeName, user,
}) {
  /* 🔴 **ห้ามมีนัดเปิดค้างสองใบต่อหนึ่งคำร้อง** — ทั้งโมดูลอ่าน "นัดของใบ" เป็นแถวเดียว
     ⇒ ใบที่สองจะมองไม่เห็นบนจอ แต่ยังอยู่บนตารางเจ้าหน้าที่อีกคน · ยามจริงคือ index ของ
     mig 0316 · ตัวนี้อยู่เพื่อ **ข้อความไทย** ไม่ใช่เพื่อกันแทน (ตรวจแล้วค่อยเขียน
     ยังมีช่องว่างเสมอ — ดูการแปลง error ข้างล่าง) */
  const open = await findSurveyVisit(supabase, request.id, { openOnly: true });
  if (open) {
    return {
      visit: null,
      error: `ใบนี้มีนัดที่ยังไม่ปิดอยู่แล้ว (${open.code || open.id}) — ใช้ปุ่มเลื่อนวันนัดแทนการลงคิวใหม่`,
    };
  }
  const draft = surveyVisitDraft({ request, date, time, assigneeId, assigneeName });
  const row = {
    id: genId('SVV'),
    ...draft,
    status: initialVisitStatus(draft, { site }),
    createdById: user?.id ? String(user.id) : null,
    createdByName: user?.name || null,
  };
  const { data, error } = await insertRowWithEntityCode(supabase, 'SV', row);
  if (error) return { visit: null, error: surveyVisitInsertError(error) };
  return { visit: data, error: null };
}

/**
 * ขยับนัดที่มีอยู่ให้ตรงกับวันใหม่บนใบ — คืน `{ visit, error, needsNew }`
 *
 * ⚠️ **แก้แถวเดิม ไม่สร้างแถวใหม่** — การเลื่อนวันของงานที่ยังไม่ได้ไปคือ *แก้คำสัญญา*
 *    ไม่ใช่การไปครั้งที่สอง
 * ⭐ **แต่ถ้านัดจบไปแล้ว (ไปแล้วเข้าไม่ได้ · ยกเลิก) ต้องเป็นนัดใบใหม่** — ประวัติการ
 *    เข้าจริงห้ามถูกวันใหม่เขียนทับ ⇒ คืน `needsNew: true` ให้ผู้เรียกสร้างใบใหม่
 *    🐞 ของเดิมคืน `{ error: null }` เฉย ๆ ⇒ ใบบอกว่าเลื่อนแล้วทั้งที่ตารางเจ้าหน้าที่ไม่ขยับ
 *       ซึ่งแย่กว่าปฏิเสธ เพราะไม่มีใครรู้ว่าต้องไปทำอะไรต่อ
 */
export async function moveSurveyVisit(supabase, { requestId, date, time }) {
  /* 🐞 **ต้องถามหาแถวที่ยังกินสิทธิ์ตรง ๆ ไม่ใช่ "แถวล่าสุดแล้วค่อยดูสถานะ"** —
     "มีใบเดียว" ไม่ได้แปลว่า "เป็นใบล่าสุด": นัดที่ถูกปิดไปแล้วถูกเปิดกลับเป็น
     `scheduled` ได้จากโมดัลนัด (สถานะเลือกมือได้) ⇒ แถวที่ยังมีชีวิตกลายเป็นแถว *เก่ากว่า*
     แถวที่ปิดแล้ว · อ่านแถวล่าสุดจะเห็นแถวที่ปิด แล้วสั่งสร้างนัดใหม่ ซึ่งไปตกด่าน
     "ใบนี้มีนัดที่ยังไม่ปิดอยู่แล้ว" ⇒ ปุ่มสองปุ่มชี้ไปหากันเอง กดทางไหนก็ไม่ผ่าน
     ⚠️ ผู้เรียกมองสองเคสนี้เหมือนกันอยู่แล้ว (ไม่มีนัด · นัดจบไปแล้ว ⇒ สร้างใบใหม่) */
  const visit = await findSurveyVisit(supabase, requestId, { openOnly: true });
  // ยังไม่เคยลงคิว · นัดถูกลบ · นัดเดิมจบไปแล้ว = ต้องสร้างใบใหม่ ไม่ใช่เงียบ
  if (!visit) return { visit: null, error: null, needsNew: true };
  const patch = { scheduledDate: date, updatedAt: new Date().toISOString() };
  if (time !== undefined) patch.startTime = time ? toHHMM(time) : null;
  const { data, error } = await supabase
    .from('service_visits').update(patch).eq('id', visit.id).select().maybeSingle();
  if (error) return { visit: null, error: error.message, needsNew: false };
  return { visit: data, error: null, needsNew: false };
}
