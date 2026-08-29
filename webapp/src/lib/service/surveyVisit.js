// ── นัดประเมินพื้นที่ = ก้าว "ลงคิว" ของ TS (mig 0314 · เฟส 2) ────────────
//
// ⭐ **หนึ่งใบ = หนึ่งนัด** (แผน §4) — ใบประเมินหนึ่งใบมีสถานที่เดียว ⇒ นัดเดียว
//    วัน/เวลา/ช่าง จึงเป็นของก้อนเดียวกัน ไม่ต้องถามว่า "วันนี้ไปสาขาไหน"
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

export const SURVEY_VISIT_KIND = 'survey';

/**
 * ตรวจของที่ต้องมีก่อนลงคิว — คืนข้อความไทย หรือ `null` ถ้าผ่าน
 *
 * ⚠️ **ช่างบังคับ** ต่างจากหัวข้ออื่นที่แจ้งกำหนดส่งได้โดยยังไม่รู้ว่าใครทำ — งานนี้
 *    ต้องมีคนขับรถไปจริง และนัดที่ไม่มีช่างจะไม่ผ่านด่านเข้าไซต์ (`evaluateVisitGate`)
 *    ⇒ จอดเป็นร่างที่ไม่โผล่บนตารางใคร ซึ่งอ่านเหมือนลงคิวไม่สำเร็จ
 * ⚠️ **เวลาไม่บังคับ** — "ไปวันนั้นทั้งวัน" เป็นคำตอบที่ถูกต้องของงานจริง
 */
export function surveyScheduleError(body = {}, request = {}) {
  if (!request?.siteId) return 'ใบนี้ไม่มีสถานที่ — ลงคิวไม่ได้';
  if (!String(body.committedDueDate ?? '').trim()) return 'ต้องระบุวันนัดเข้าพื้นที่';
  if (!String(body.assigneeId ?? '').trim()) return 'ต้องเลือกช่างผู้รับผิดชอบ';
  const time = String(body.committedDueTime ?? '').trim();
  if (time && !toHHMM(time)) return 'เวลานัดไม่ถูกต้อง';
  return null;
}

/** นัดของใบนี้ (ถ้ามี) — ใบเดียวมีนัดเดียวตามมติ ⇒ คืนแถวเดียว */
export async function findSurveyVisit(supabase, requestId) {
  const { data, error } = await supabase
    .from('service_visits').select('*')
    .eq('requestId', requestId)
    .order('createdAt', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data || [])[0] || null;
}

/**
 * สร้างนัดของใบ — คืน `{ visit, error }`
 *
 * ⚠️ **สถานะมาจากด่าน ไม่ใช่จากผู้เรียก** (`initialVisitStatus`) — นัดที่ผ่านด่าน
 *    ขึ้นตารางเลย · ไม่ผ่าน (เช่นวันอยู่นอกช่วงที่ไซต์ให้เข้า) จอดเป็นร่างให้คนจัดการ
 *    ซึ่งเป็นกติกาเดียวกับนัดทุกชนิดในโมดูลนี้
 */
export async function createSurveyVisit(supabase, {
  request, site, date, time, assigneeId, assigneeName, user,
}) {
  const draft = {
    siteId: request.siteId,
    requestId: request.id,
    kind: SURVEY_VISIT_KIND,
    scheduledDate: date,
    startTime: time ? toHHMM(time) : null,
    assigneeId: assigneeId || null,
    assigneeName: assigneeName || null,
    // ⭐ โน้ตของนัดชี้กลับไปที่ใบ — ช่างที่เปิดจากตารางต้องรู้ว่ามาจากเรื่องอะไร
    note: `ประเมินพื้นที่ตามคำร้อง ${request.docNo || request.id}`.slice(0, 1000),
  };
  const row = {
    id: genId('SVV'),
    ...draft,
    status: initialVisitStatus(draft, { site }),
    createdById: user?.id ? String(user.id) : null,
    createdByName: user?.name || null,
  };
  const { data, error } = await insertRowWithEntityCode(supabase, 'SV', row);
  if (error) return { visit: null, error: error.message };
  return { visit: data, error: null };
}

/** นัดที่ "จบไปแล้ว" — ขยับวันไม่ได้ เพราะเป็นประวัติของสิ่งที่เกิดขึ้นจริง */
export const CLOSED_VISIT_STATES = ['done', 'partial', 'unable', 'cancelled'];

/**
 * ขยับนัดที่มีอยู่ให้ตรงกับวันใหม่บนใบ — คืน `{ visit, error, needsNew }`
 *
 * ⚠️ **แก้แถวเดิม ไม่สร้างแถวใหม่** — การเลื่อนวันของงานที่ยังไม่ได้ไปคือ *แก้คำสัญญา*
 *    ไม่ใช่การไปครั้งที่สอง
 * ⭐ **แต่ถ้านัดจบไปแล้ว (ไปแล้วเข้าไม่ได้ · ยกเลิก) ต้องเป็นนัดใบใหม่** — ประวัติการ
 *    เข้าจริงห้ามถูกวันใหม่เขียนทับ ⇒ คืน `needsNew: true` ให้ผู้เรียกสร้างใบใหม่
 *    🐞 ของเดิมคืน `{ error: null }` เฉย ๆ ⇒ ใบบอกว่าเลื่อนแล้วทั้งที่ตารางช่างไม่ขยับ
 *       ซึ่งแย่กว่าปฏิเสธ เพราะไม่มีใครรู้ว่าต้องไปทำอะไรต่อ
 */
export async function moveSurveyVisit(supabase, { requestId, date, time }) {
  const visit = await findSurveyVisit(supabase, requestId);
  // ยังไม่เคยลงคิว หรือนัดถูกลบทิ้ง = ต้องสร้างใบใหม่ ไม่ใช่เงียบแล้วปล่อยใบไม่มีนัด
  if (!visit) return { visit: null, error: null, needsNew: true };
  if (CLOSED_VISIT_STATES.includes(visit.status)) {
    return { visit, error: null, needsNew: true };
  }
  const patch = { scheduledDate: date, updatedAt: new Date().toISOString() };
  if (time !== undefined) patch.startTime = time ? toHHMM(time) : null;
  const { data, error } = await supabase
    .from('service_visits').update(patch).eq('id', visit.id).select().maybeSingle();
  if (error) return { visit: null, error: error.message, needsNew: false };
  return { visit: data, error: null, needsNew: false };
}
