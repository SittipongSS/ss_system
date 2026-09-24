// ── คำร้องประเมินพื้นที่ที่ "รอลงคิว" — ตัวตัดสินล้วน ไม่มี React ไม่มี DB ──────────
//
// ⭐ มติเจ้าของ 23/09: คำร้องประเมินพื้นที่ที่ยังไม่มีนัด ต้องขึ้นเป็น **การ์ด** ในแท็บ "รอจัด"
//    ของหน้าจัดคิว (/service/schedule) เป็นกลุ่มของตัวเอง ("คำร้องรอลงคิว") และ TS ลงคิวได้
//    จากหน้านั้นเลยโดยไม่ต้องเปิดใบ · ของเดิมหน้าจัดคิวเห็นแค่ **ตัวเลข** "รอฝ่าย TS N"
//    ซึ่งนับผิดชุดด้วย (รวมใบที่ลงคิวแล้ว · คำร้องสอบถามข้อมูล · ใบที่รอ TS กดปิด)
//
// ⚠️ **ตัวตัดสินเดียวของ "ใบนี้อยู่ขั้นไหนของการลงคิว"** — สามที่ถามตัวนี้ตัวเดียว:
//    ตัวโหลดฝั่ง server (`surveyQueueRepo`) · การ์ดบนหน้าจัดคิว (`scheduleQueueView`)
//    · ปุ่ม "ลงคิวใหม่" บนหน้ารายละเอียดคำร้อง ⇒ สามจอตอบตรงกันเชิงโครงสร้าง
//    (เคยมีสองนิยามคนละไฟล์แล้วพูดไม่ตรงกัน — ดู `visitReachedSite` ข้างล่าง)
// ⚠️ **ชนิดคำร้องอ่านจากทะเบียน** (`requestNeedsRef(kind, 'site')`) ไม่ใช่ `kind === '...'`
//    — กติกา ม-34 ของทั้งระบบคำร้อง
import { REQUEST_KIND_LIST, requestNeedsRef } from '@/lib/master/requestTypes';
import { requestAwaitingDue } from '@/lib/requests/statuses';
import { VISIT_STATUS_LABELS, holdsRequestSlot, isClosedVisit } from './visitStatus';

/** หัวข้อคำร้องที่กลายเป็นนัดเข้าไซต์ได้ (ประกาศ `needs: ['site']` ในทะเบียน) */
export const SITE_REQUEST_KINDS = Object.freeze(REQUEST_KIND_LIST.filter((kind) => requestNeedsRef(kind, 'site')));

/** ขั้นของการ์ด — ลำดับนี้คือลำดับบนจอ (ใบที่นัดหลุดขึ้นก่อน เพราะเคยรับปากวันไปแล้ว) */
export const SURVEY_QUEUE_STEPS = Object.freeze(['requeue', 'acknowledge', 'queue']);
export const SURVEY_QUEUE_STEP_LABELS = Object.freeze({
  acknowledge: 'รอรับเรื่อง',
  queue: 'รอลงคิว',
  requeue: 'ไม่มีนัดบนตาราง',
});

/** ป้ายขั้น ("ขั้น 2/2") ของการ์ดคำร้องบนหน้าจัดคิว และแถว "ที่มา" ในโมดัลลงคิว — ชุดเดียวของสองจอ
 *  (ย้ายมาจาก `scheduleQueueView` · ⚠️ คนละชุดกับ `SURVEY_QUEUE_STEP_LABELS` ซึ่งเป็นคำของกลุ่ม) */
export const SURVEY_QUEUE_STEP_BADGES = Object.freeze({
  acknowledge: Object.freeze({ label: 'ขั้น 1/2', tone: 'warning' }),
  queue: Object.freeze({ label: 'ขั้น 2/2', tone: 'info' }),
  requeue: Object.freeze({ label: 'ลงคิวใหม่', tone: 'warning' }),
});

/** "รับเรื่องแล้ว โดย {ชื่อ}" — บรรทัดของขั้นลงคิวบนการ์ด และแถว "ที่มา" ในโมดัลลงคิว (ชุดคำเดียว) */
export const acknowledgedText = (request) =>
  `รับเรื่องแล้ว${request?.acknowledgedByName ? ` โดย ${request.acknowledgedByName}` : ''}`;

/** นัดเดิมของใบที่ต้อง "ลงคิวใหม่" — "นัดเดิม SV-… ทำไม่ได้" · ไม่มีแถว = บอกว่านัดหายจากตาราง
 *  (การ์ดต่อท้ายด้วย " — ลงคิวใหม่" · โมดัลใช้เป็นบรรทัดย่อยของ "ที่มา") */
export const previousVisitText = (previous) => (previous
  ? `นัดเดิม ${previous.code || previous.id} ${VISIT_STATUS_LABELS[previous.status] || previous.status}`
  : 'นัดเดิมไม่อยู่บนตาราง (สร้างไม่สำเร็จหรือถูกลบ)');

/** นัดใบนี้ "ไปถึงไซต์แล้ว" ไหม — เข้าแล้ว/ทำไม่ครบ = งานเดินหน้าไปรอผลประเมิน ไม่ใช่กลับไปลงคิว
 *  ⚠️ `unable` (ไปแล้วเข้าไม่ได้) **ไม่นับ** — ต้องลงคิวรอบใหม่ (กติกาเดียวกับ surveyStepBack.js)
 *  🐞 ของเดิมหน้าคำร้องถามแค่ "ไม่มีนัดที่ยังมีชีวิต" ⇒ ใบที่ช่างไปเข้าแล้ว (`done`)
 *     ขึ้นปุ่ม "ลงคิวใหม่" พร้อมคำใบ้ "ใบมีวันแล้วแต่นัดยังไม่ขึ้นตารางเจ้าหน้าที่" ซึ่งผิดทั้งสองท่อน */
export const visitReachedSite = (visit) => isClosedVisit(visit) && visit?.status !== 'unable';

/**
 * ใบนี้อยู่ขั้นไหนของการลงคิว — `'acknowledge' | 'queue' | 'requeue' | null`
 *
 * · acknowledge = ส่งมาแล้ว ยังไม่มีใครรับเรื่อง (รอรับเรื่อง) — **ไม่ข้ามขั้น**: การ์ดมีแค่ปุ่ม
 *                 "รับเรื่อง" · ลงคิวต้องรอรับเรื่องก่อน (server ปฏิเสธ commit-due ที่ยังไม่มี
 *                 `acknowledgedAt` อยู่แล้ว · และตีกลับทำได้เฉพาะก่อนรับเรื่อง)
 * · queue       = รับเรื่องแล้ว ยังไม่มีวันนัด ("รอกำหนดส่ง" — `requestAwaitingDue`)
 * · requeue     = มีวันบนใบแล้ว แต่ไม่มีนัดที่ยังมีชีวิต (ยกเลิก · เลื่อนแล้ว · เข้าไม่ได้ ·
 *                 สร้างไม่สำเร็จ/ถูกลบ) — ต้องลงคิวใหม่ด้วยวันเดิมได้ (ธง `requeue` ของ route)
 * · null        = ไม่ใช่ใบประเมิน · ไม่ใช่ใบที่เดินอยู่ · ผู้ขอปิดฝั่งตัวเองแล้ว ·
 *                 มีนัดที่ยังมีชีวิตอยู่แล้ว (การ์ดของนัดโผล่แทน) · ช่างไปถึงไซต์แล้ว
 *
 * @param request แถวคำร้อง + `surveyVisit` (นัดที่ `pickSurveyVisit` เลือก · ไม่มี = null)
 * ⚠️ ผู้เรียกต้องติด `surveyVisit` มาให้ใบที่มีวันแล้วเสมอ — ไม่ติดมา = อ่านว่า "ไม่มีนัด"
 */
export function surveyQueueStep(request) {
  if (!request || !requestNeedsRef(request.kind, 'site')) return null;
  if (request.status === 'pending') return 'acknowledge';
  if (request.status !== 'acknowledged' || request.closedAt) return null;
  if (holdsRequestSlot(request.surveyVisit)) return null;
  if (requestAwaitingDue(request)) return 'queue';
  if (visitReachedSite(request.surveyVisit)) return null;
  return 'requeue';
}

/**
 * นัดตัวแทนของใบหนึ่งใบ จากนัดทุกแถวที่ผูก `requestId` เดียวกัน
 *
 * ⭐ กติกาเดียวกับ `findRequest` (lib/materialPricesAdmin.js) ที่หน้ารายละเอียดใช้ —
 *    **นัดที่ยังมีชีวิตล่าสุดก่อน** ไม่มีค่อยเอานัดล่าสุดมาเป็นประวัติ
 * 🐞 เอาแถวล่าสุดเฉย ๆ ไม่พอ — นัดที่ปิดแล้วถูกเปิดกลับได้จากโมดัลนัด ⇒ แถวที่ยังมีชีวิต
 *    อาจเก่ากว่าแถวที่ปิดแล้ว (เหตุเดียวกับ `moveSurveyVisit`)
 * ⚠️ `createdAt` เท่ากัน = แถวที่มาก่อนในลิสต์ชนะ (ลำดับนิ่ง)
 */
export function pickSurveyVisit(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
  const newest = (items) => items.reduce(
    (best, visit) => (!best || String(visit.createdAt || '') > String(best.createdAt || '') ? visit : best),
    null,
  );
  return newest(list.filter(holdsRequestSlot)) || newest(list);
}

/** requestId → นัดที่ยังกินสิทธิ์ "หนึ่งใบ = หนึ่งนัด" จากนัดชุดหนึ่ง (เช่นนัดของรายการงาน) */
export function liveSurveyVisitsByRequest(visits) {
  const byRequest = new Map();
  for (const visit of Array.isArray(visits) ? visits : []) {
    if (!visit?.requestId || !holdsRequestSlot(visit)) continue;
    byRequest.set(visit.requestId, pickSurveyVisit([byRequest.get(visit.requestId), visit]));
  }
  return byRequest;
}
