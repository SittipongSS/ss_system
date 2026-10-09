// ── "แจ้งกำหนดส่ง / ลงคิวเข้าพื้นที่" — ก้าวที่สองของฝ่ายผู้รับ · ตรรกะล้วนของโมดัลกลาง ──
//
// ⭐ มติเจ้าของ 23/09: TS ต้องลงคิวคำร้องประเมินพื้นที่ได้ **จากหน้าจัดคิว** ด้วย ไม่ใช่เฉพาะหน้าใบ
//    ⇒ ฟอร์มเดียวกันถูกใช้สองที่ · กติกาของ repo (AGENTS.md "ฟอร์มเดียวกันต้องเป็น component เดียว")
//    ⇒ ยกทั้งป้าย · ค่าตั้งต้น · ก้อนที่ส่ง · ด่านของปุ่ม มาไว้ที่นี่ที่เดียว แล้ว `CommitDueDialog`
//    เป็นเปลือกเดียวที่สองหน้าเรียก — **ก้อน PATCH ที่สองหน้าส่งประกอบจากฟังก์ชันเดียว**
//    (`commitDuePayload`) ⇒ วันหนึ่งหน้าหนึ่งลืมส่ง `committedResultDate` ไม่ได้
// ⚠️ ข้อความทุกตัวย้ายมาจาก `app/requests/[id]/page.js` **ตัวอักษรเดิม** (เทสต์ล็อกไว้)
// ⚠️ โหมดอ่านจากทะเบียนหัวข้อ (`requestNeedsRef(kind, 'site')`) ไม่ใช่ `kind === '...'` (ม-34)
//    และผู้เรียกส่งโหมดเองไม่ได้ ⇒ ส่งผิดโหมดไม่ได้
// ⭐ **โหมดที่สาม `desk`** (mig 0408 · แผน survey-desk-assessment §3.2 · งวด S2a) — ใบประเมินที่ทุกพื้นที่ประเมินจากแบบ
//    ไม่ลงคิว ไม่มีนัด ไม่มีช่าง ⇒ ก้าวนี้ของมันคือ **หัวหน้ารับปากวันส่งผล** วันเดียว (`รับปากวันส่งผล`) และ
//    เปลี่ยนวันทีหลังด้วย `deskRescheduleView` (`เลื่อนวันส่งผล` · เหตุผลบังคับ)
//    โหมดมาจากธง `surveyNeedsVisit` ที่ตัวโหลดคำร้องติดมาจากแถวพื้นที่ (`false` ตรงตัวเท่านั้น) — server ตัดสินซ้ำจากแถวจริงเสมอ
//    ⚠️ ทุกจุดในไฟล์นี้ที่ถามว่า `=== 'site'` หมายถึง "ลงคิวเข้าพื้นที่" — งานโต๊ะ **ไม่ใช่** 'site' จึงไม่ได้แผงงาน ชิปวันนัด
//       ตัวเลือกช่าง หรือด่านเข้าไซต์ มาเองโดยไม่ต้องมีกิ่งเพิ่ม
import { requestKindMeta, requestNeedsRef } from '@/lib/master/requestTypes';
import { dueIsStale } from '@/lib/requests/dueRound';
import { NA, fmtDate } from '@/lib/format';
import { businessDate } from '@/lib/businessDate';
import {
  SURVEY_DESK_RESCHEDULE_REASON_ERROR, SURVEY_VISIT_KIND, surveyDeskResultDate, surveyScheduleGaps, surveyVisitDraft,
} from '@/lib/service/surveyVisit';
import { SURVEY_METHOD_RESULT_DATE_LABEL } from '@/lib/service/surveyMethodSwitch';
import { toHHMM } from '@/lib/service/sites';
import { MAX_ASSETS_PER_DAY, assigneeOverloaded } from '@/lib/service/visitLoad';
import { VISIT_KIND_LABELS, visitTimeText } from '@/lib/service/rounds';
import {
  SURVEY_QUEUE_STEP_BADGES, acknowledgedText, previousVisitText, surveyQueueStep,
} from '@/lib/service/surveyQueue';
/* ⚠️ คำกลางมาจากไฟล์ใบ `queueWords` ไม่ใช่ `scheduleQueueView` — ตัวนั้นนำเข้าไฟล์นี้อยู่แล้ว (กัน import วน) */
import {
  accessWarnText, dayText, requestAgeText, siteLoadText, siteWhereText, withWarnings,
} from '@/lib/service/queueWords';

/* ความยาวหมายเหตุสูงสุด — ตัวเดียวกับที่ route ตีกลับ (`เหตุผลยาวเกิน 500 ตัวอักษร`) */
export const COMMIT_DUE_REASON_MAX = 500;

/**
 * 'site' = ลงคิวเข้าพื้นที่ (วัน · เวลา · เจ้าหน้าที่ · วันส่งผล) · 'date' = แจ้งกำหนดส่ง (วันอย่างเดียว)
 * · 'desk' = รับปากวันส่งผลของใบประเมินที่ประเมินจากแบบทั้งใบ (วันส่งผลอย่างเดียว · หัวหน้าเป็นผู้รับผิดชอบเอง)
 * ⚠️ 'desk' เฉพาะหัวข้อที่มีสถานที่ **และ** ธง `surveyNeedsVisit === false` ตรงตัว — ไม่มีธง / ค่าอื่น = ต้องมีนัด (กติกาของงวด S1)
 *    ⇒ ใบของวันนี้ทุกใบ (ไม่มีพื้นที่จากแบบ) ได้ 'site' เหมือนเดิม
 */
export function commitDueMode(request) {
  if (!requestNeedsRef(request?.kind, 'site')) return 'date';
  return request?.surveyNeedsVisit === false ? 'desk' : 'site';
}

/* ── ถ้อยคำของงานโต๊ะ (แผน §3.2 ข้อ 2 · toast = สเปก S2a §7 ข้อ 4) ── */
const DESK_COMMIT_ACTION = 'รับปากวันส่งผล';
const DESK_COMMIT_TITLE = 'รับปากวันส่งผลประเมิน (จากแบบ)';
const DESK_COMMIT_OK = 'รับปากวันส่งผลแล้ว — ฝ่ายขายเห็นวันส่งผลนี้';
const DESK_NOTE_LABEL = 'หมายเหตุถึงฝ่ายขาย';
/* ผู้วางคิวไม่มีปุ่มของก้าวนี้ (รับปากได้เฉพาะหัวหน้า — `canSendSurveyResult`) ⇒ จอขึ้นประโยคนี้ **แทนปุ่ม** */
const DESK_PLANNER_NOTE = 'ใบนี้ประเมินจากแบบ — หัวหน้าฝ่ายบริการเป็นผู้รับและส่งผล ไม่ต้องลงคิว';
const DESK_RESCHEDULE_TITLE = 'เลื่อนวันส่งผล';
/* คำเดียวกับ `rescheduleRequestError` (`lib/requests/stages.js`) ที่ route ถามต่อ — เทสต์ `surveyMethodJob.test.mjs` เทียบกับตัวจริง */
const DESK_SAME_DATE_ERROR = 'วันเดิมกับที่แจ้งไว้แล้ว';
const reasonTooLong = (value) => String(value ?? '').trim().length > COMMIT_DUE_REASON_MAX;
const REASON_TOO_LONG_ERROR = `เหตุผลยาวเกิน ${COMMIT_DUE_REASON_MAX} ตัวอักษร`;

/**
 * ป้ายทุกตัวของก้าวนี้ — ปุ่มหลักบนหน้าใบ · ปุ่มบนการ์ดหน้าจัดคิว · หัวโมดัล · ปุ่มส่ง · toast
 *
 * @param requeue ใบมีวันแล้วแต่ไม่มีนัดที่ยังมีชีวิต (ผู้เรียกพิสูจน์ — `surveyQueueStep === 'requeue'`)
 * ⚠️ หัวโมดัลไม่ดู `requeue` — ของเดิมเป็นแบบนั้น (ปุ่ม "ลงคิวใหม่" เปิดโมดัล "ลงคิวเข้าพื้นที่")
 */
export function commitDueLabels(request, { requeue = false } = {}) {
  const mode = commitDueMode(request);
  // งานโต๊ะไม่มี "ลงคิวใหม่" (ไม่มีนัดให้หาย) และไม่มีรอบแก้ ⇒ ป้ายชุดเดียว ไม่ดู `requeue`
  if (mode === 'desk') return deskCommitLabels(request);
  const site = mode === 'site';
  const stale = dueIsStale(request, request?.items);
  const form = requestKindMeta(request?.kind)?.form || {};
  const dept = request?.dept || '';
  return {
    action: requeue
      ? 'ลงคิวใหม่'
      : (site
        ? (stale ? 'ลงคิวรอบใหม่' : 'ลงคิวเข้าพื้นที่')
        : (stale ? 'แจ้งวันส่งรอบแก้' : 'แจ้งกำหนดส่ง')),
    hint: requeue
      ? 'ใบมีวันแล้วแต่นัดยังไม่ขึ้นตารางเจ้าหน้าที่'
      : (stale ? `รอบก่อนแจ้งไว้ ${fmtDate(request.committedDueDate)}` : undefined),
    title: site
      ? (stale ? 'ลงคิวรอบใหม่' : 'ลงคิวเข้าพื้นที่')
      : (stale ? 'แจ้งวันส่งของรอบแก้' : 'แจ้งกำหนดส่ง'),
    submit: site ? 'ลงคิว' : 'แจ้งกำหนดส่ง',
    okMsg: site ? 'ลงคิวแล้ว — นัดขึ้นตารางเจ้าหน้าที่เรียบร้อย' : 'แจ้งกำหนดส่งแล้ว',
    // ── ช่องในโมดัล ──
    dateLabel: form.committedDueLabel || 'วันกำหนดส่ง',
    /* วันที่ผู้ขอต้องการเป็นของผู้ขอ · วันกำหนดส่งเป็นของฝ่ายปลายทาง (คนละช่อง คนละเจ้าของ)
       ⚠️ รอบแก้ต้องเห็นวันของรอบก่อน — ไม่งั้นคนกรอกไม่รู้ว่ากำลังแทนที่อะไร
       ⭐ **ลงคิวเข้าพื้นที่ไม่มีประโยคอธิบายระบบแล้ว** (มติ 24/09 แบบ A · pain 19) — "เป็นวันที่ TS แจ้ง
          และเป็นตัวที่ใช้นับว่าเลยกำหนดหรือยัง" เป็นคำของคนทำระบบ ไม่ใช่ของคนจัดคิว · วันที่ผู้ขอต้องการ
          ย้ายไปเป็นชิปข้างช่อง (`commitDueWishes`) ⇒ เหลือแค่วันของรอบก่อน (ถ้ามี) ในรูปวันไทย
       ⚠️ แจ้งกำหนดส่ง (หัวข้ออื่น) คงประโยคเดิม — โมดัลนั้นไม่มีชิปผู้ขอ */
    dateHint: site
      ? (stale ? `รอบก่อนแจ้งไว้ ${dayText(request.committedDueDate)}` : '')
      : `เป็นวันที่ ${dept} แจ้ง และเป็นตัวที่ใช้นับว่าเลยกำหนดหรือยัง`
        + (stale ? ` · รอบก่อนแจ้งไว้ ${fmtDate(request.committedDueDate)}` : '')
        + (request?.requestedDueDate ? ` · ผู้ขอต้องการรับงาน ${fmtDate(request.requestedDueDate)}` : ''),
    /* ⭐ เวลา/วันส่งผลที่ผู้ขอต้องการ **ไม่อยู่ในคำใบ้แล้ว** (มติ 24/09 แบบ A · pain 14) — เป็นชิปข้างช่อง
       (`commitDueWishes` · "ตรงกัน" / "ใช้ตามผู้ขอ") · "เว้นว่าง = ไปทั้งวัน" คือแผ่น "ไม่ระบุเวลา" ของช่องเวลา
       ⇒ คำใบ้ของวันส่งผลเหลือแค่กติกาลำดับวัน (ตัวเดียวกับที่ด่าน server ตรวจ) */
    resultLabel: form.committedResultLabel || 'วันที่จะส่งผล',
    resultHint: 'ต้องไม่มาก่อนวันนัดเข้าพื้นที่',
    /* ⚠️ ไม่มีคำใบ้ใต้ตัวเลือกคนแล้ว (`assigneeHint` ถอดทิ้ง) — 🐞 รีวิว UAT 24/09 (high): คำใบ้ "…นอกช่วง = จอดเป็นร่าง
       ในแท็บรอจัด" ทายผิด: server สร้างนัดจากไซต์ที่ `loadSurveySite` select แค่ id/code/name/customerId ⇒ ด่าน ④
       ไม่เห็นช่วงเวลา นัดลงตารางช่างเสมอ · ผลของการกดอยู่ที่บรรทัดผลลัพธ์ (`commitDueOutcome`) ที่เดียว */
    /* ตัวอย่างในช่องหมายเหตุ — **ตามงาน** (pain 17): ของเดิมทั้งสองโหมดใช้ประโยคของ "แจ้งกำหนดส่ง"
       ("รอวัตถุดิบเข้า…") ซึ่งไม่ใช่เรื่องของการนัดเข้าไซต์ */
    notePlaceholder: site
      ? 'เช่น นัดผู้จัดการไซต์ก่อนเข้า · แลกบัตรที่ รปภ.'
      : 'เช่น รอวัตถุดิบเข้าวันที่ 25 — ส่งได้หลังจากนั้น',
    /* สองคีย์ของงานโต๊ะ (`deskCommitLabels`) — โหมดอื่นว่างเสมอ: ชิปผู้ขอของการลงคิวอยู่ที่ `commitDueWishes`
       และผู้วางคิวมีปุ่มของก้าวนี้อยู่แล้ว */
    wish: null,
    plannerNote: null,
  };
}

/**
 * ป้ายของ "รับปากวันส่งผล" (โหมด `desk`) — คีย์ชุดเดียวกับ `commitDueLabels` + `noteLabel`
 *   `wish`        "ผู้ขอต้องการผล {วัน}" (เส้นประเหนือช่องวัน) · ผู้ขอไม่ระบุ = null
 *   `plannerNote` ประโยคที่จอขึ้น **แทนปุ่ม** ให้คนที่รับปากไม่ได้ (ผู้วางคิว · ไม่ผ่าน `canSendSurveyResult`)
 * ⚠️ ไม่มีคำไหนพูดเรื่องลงคิว / นัด / เจ้าหน้าที่ — ใบนี้ไม่มีทั้งสามอย่าง · `resultHint` ("ต้องไม่มาก่อนวันนัด") จึงว่าง
 * ⚠️ ไม่มีตัวอย่างในช่องหมายเหตุ — ตัวอย่างของสองโหมดเดิมเป็นเรื่องนัดเข้าไซต์กับวัตถุดิบ ซึ่งไม่ใช่เรื่องของใบนี้
 */
function deskCommitLabels(request) {
  const form = requestKindMeta(request?.kind)?.form || {};
  const wanted = String(request?.requestedResultDate ?? '').trim();
  return {
    action: DESK_COMMIT_ACTION,
    hint: undefined,
    title: DESK_COMMIT_TITLE,
    submit: DESK_COMMIT_ACTION,
    okMsg: DESK_COMMIT_OK,
    dateLabel: SURVEY_METHOD_RESULT_DATE_LABEL,
    dateHint: '',
    resultLabel: form.committedResultLabel || 'วันที่จะส่งผล',
    resultHint: '',
    noteLabel: DESK_NOTE_LABEL,
    notePlaceholder: '',
    wish: wanted ? `ผู้ขอต้องการผล ${dayText(wanted)}` : null,
    plannerNote: DESK_PLANNER_NOTE,
  };
}

/**
 * ค่าตั้งต้นของฟอร์มตอนเปิดโมดัล — `{ date, time, resultDate, assigneeId, reason }`
 *
 * ⭐ ใบประเมินตั้งต้นด้วย **วันที่ผู้ขอต้องการ** — คนลงคิวส่วนใหญ่ตอบรับวันนั้นอยู่แล้ว ·
 *    หัวข้ออื่นตั้งต้นวันนี้ (ฝ่ายเป็นคนกำหนด)
 * ⭐ ตอนกู้ (`requeue`) ตั้งต้นด้วย **ของเดิมบนใบ** — คนกดยืนยันวันเดิมได้ทันที
 * ⚠️ วันส่งผลตั้งต้นด้วยของเดิมบนใบ แล้วถอยไปวันที่ผู้ขอต้องการ — **ไม่ใช่วันนัด**
 *    (ค่าเริ่มต้นที่เท่ากันทำให้คนกดผ่านไปโดยไม่ได้คิด ซึ่งคือปัญหาที่ช่องนี้เกิดมาแก้)
 * ⭐ งานโต๊ะ (`desk`) มีวันเดียวคือวันส่งผล — ตั้งต้นด้วยของเดิมบนใบ แล้วถอยไปวันที่ผู้ขอต้องการ · ไม่มีทั้งคู่ = ว่าง
 *    (ไม่ตั้งต้นเป็นวันนี้: วันส่งผลเป็นคำสัญญากับฝ่ายขาย คนรับปากต้องเลือกเอง) · ไม่มีเวลา ไม่มีช่าง
 * @param today วันนี้แบบไทย 'YYYY-MM-DD' — ไม่ส่ง = `businessDate()`
 */
export function commitDueDefaults(request, { requeue = false, today } = {}) {
  const mode = commitDueMode(request);
  const site = mode === 'site';
  const req = request || {};
  if (mode === 'desk') {
    const date = req.committedResultDate || req.requestedResultDate || '';
    return { date, time: '', resultDate: date, assigneeId: '', reason: '' };
  }
  return {
    date: requeue
      ? req.committedDueDate
      : ((site && req.requestedDueDate) || today || businessDate()),
    time: requeue
      ? String(req.committedDueTime || '').slice(0, 5)
      : (site ? (req.requestedDueTime || '') : ''),
    resultDate: req.committedResultDate || req.requestedResultDate || '',
    assigneeId: req.assigneeId || '',
    reason: '',
  };
}

/**
 * ก้อน `PATCH /api/sa/requests/[id]` — **ตัวเดียวที่สองหน้าส่ง**
 * ⚠️ ชื่อเจ้าหน้าที่ส่งไปเพื่อความเข้ากันได้เท่านั้น — server อ่านชื่อจากทะเบียนคนเสมอ
 * ⭐ งานโต๊ะ (`desk`) ส่งแค่วันส่งผลกับหมายเหตุ — กิ่งงานโต๊ะของ route อ่าน `committedResultDate` ตัวเดียว
 *    (วันนัด · เวลา · ช่าง ไม่ถูกส่ง: ใบนี้ไม่มีนัด และผู้รับผิดชอบคือหัวหน้าที่กด)
 */
export function commitDuePayload(request, form, { technicians = [] } = {}) {
  const mode = commitDueMode(request);
  const site = mode === 'site';
  const f = form || {};
  if (mode === 'desk') return { action: 'commit-due', committedResultDate: f.date, reason: f.reason };
  return {
    action: 'commit-due',
    committedDueDate: f.date,
    reason: f.reason,
    ...(site ? {
      committedDueTime: f.time || null,
      // วันส่งผล (mig 0368) — ด่านฝั่ง server เป็นคนตรวจลำดับวัน
      committedResultDate: f.resultDate || null,
      assigneeId: f.assigneeId,
      assigneeName: (technicians || []).find((t) => t.id === f.assigneeId)?.name || null,
    } : {}),
  };
}

/**
 * ทุกช่องที่ยังขาด/ผิด — **ในครั้งเดียว** (กฎฟอร์มของ repo) · ผ่าน = `[]`
 * ⚠️ ด่านจริงตัวเดียวกับ server: ใบประเมินถาม `surveyScheduleGaps` (ลำดับเดียวกับที่ route
 *    ตอบข้อแรก) · หัวข้ออื่นถามข้อความเดียวกับ `commitDueRequestError`
 *    · งานโต๊ะถาม `surveyDeskResultDate` ตัวเดียวกับกิ่งงานโต๊ะของ route (ว่าง / ผิดรูป) — ไม่ถามช่าง เวลา สถานที่
 *      หรือลำดับกับวันนัด เพราะใบนี้ไม่มีนัด
 */
export function commitDueGaps(request, form) {
  const f = form || {};
  const mode = commitDueMode(request);
  let gaps;
  if (mode === 'site') {
    gaps = surveyScheduleGaps({
      committedDueDate: f.date,
      committedDueTime: f.time,
      assigneeId: f.assigneeId,
      committedResultDate: f.resultDate,
    }, request);
  } else if (mode === 'desk') {
    const result = surveyDeskResultDate({ committedResultDate: f.date });
    gaps = result.error ? [result.error] : [];
  } else {
    gaps = /^\d{4}-\d{2}-\d{2}$/.test(String(f.date ?? '').trim()) ? [] : ['ต้องระบุวันกำหนดส่ง'];
  }
  if (reasonTooLong(f.reason)) gaps.push(REASON_TOO_LONG_ERROR);
  return gaps;
}

/** ข้อความของปุ่มส่งที่กดไม่ได้ (`GatedAction.blocker`) — ผ่าน = '' */
export function commitDueBlocker(request, form) {
  return commitDueGaps(request, form).join(' · ');
}

/* ═══ ของโมดัลจัดคิวแบบ A "สองคอลัมน์" (มติเจ้าของ 24/09) ═══════════════════════════════
   ⭐ หัว · "งานนี้" · ชิปความต้องการของผู้ขอ · บรรทัดผลลัพธ์ใต้ปุ่ม — **ตรรกะล้วน** ให้โมดัลวาดอย่างเดียว
   ⚠️ ไม่มีกติกาใหม่: ทุกข้อความ/การตัดสินอ่านจากของเดิม (`commitDueGaps` · `evaluateVisitGate` ·
      `surveyVisitDraft` · คำของการ์ด) — โมดัลกับ server ต้องพูดเรื่องเดียวกันเสมอ */

/** ข้อความของชิปผู้ขอ — "ตรงกัน" เมื่อค่าที่กรอกเท่ากับที่ผู้ขอต้องการ · ไม่ตรง = ปุ่มกดใช้ค่าของผู้ขอ */
export const WISH_SAME_TEXT = 'ตรงกัน';
export const WISH_APPLY_TEXT = 'ใช้ตามผู้ขอ';

/**
 * หัวโมดัล — `{ title, kind, status, origin, context }` รูปเดียวกับหัวของโมดัลนัด
 * · ลงคิวเข้าพื้นที่: ชิปชนิดงาน "ประเมินพื้นที่" · ที่มา "RQ-… · ผู้ขอ …" · บรรทัดไซต์ "รหัส · ชื่อ · ลูกค้า"
 * · แจ้งกำหนดส่ง (หัวข้ออื่น): ไม่มีชิป ไม่มีไซต์
 * @param site ไซต์ของใบ (หน้าจัดคิว: แถวไซต์เต็ม · หน้าใบ: `req.surveySite`) — ไม่มี = ไม่มีบรรทัดไซต์
 */
export function commitDueHeader(request, { site = null } = {}) {
  const siteMode = commitDueMode(request) === 'site';
  const req = request || {};
  return {
    title: commitDueLabels(request).title,
    kind: siteMode ? { key: SURVEY_VISIT_KIND, label: VISIT_KIND_LABELS[SURVEY_VISIT_KIND] } : null,
    status: null,
    origin: [req.docNo || req.id, req.requestedByName ? `ผู้ขอ ${req.requestedByName}` : '']
      .filter(Boolean).join(' · '),
    context: siteMode && site
      ? { code: site.code || '', name: site.name || '', customer: site.customerName || req.customerName || '' }
      : null,
  };
}

/**
 * แถว "งานนี้" (คอลัมน์ซ้าย) — `[{ key, label, value, sub?, kind?, extra?, badge? }]` · แจ้งกำหนดส่ง = []
 * ⭐ คำชุดเดียวกับการ์ดคำร้องบนหน้าจัดคิว (`surveyRequestRow`): อายุคำร้อง (`requestAgeText`) ·
 *    ป้ายขั้น (`SURVEY_QUEUE_STEP_BADGES`) · "รับเรื่องแล้ว โดย …" (`acknowledgedText`) · นัดเดิม (`previousVisitText`)
 * @param siteLoad `{ assets, packs }` ของไซต์ (หน้าจัดคิว) · null = ไม่รู้ (หน้าใบ) ⇒ ไม่มีตัวเลขต่อท้ายชนิดงาน
 * @param todayIso วันนี้แบบไทย — นับ "ค้างมา n วัน"
 */
export function commitDueJobRows(request, { site = null, todayIso, siteLoad = null } = {}) {
  if (commitDueMode(request) !== 'site') return [];
  const req = request || {};
  const step = surveyQueueStep(req);
  const wantTime = toHHMM(req.requestedDueTime);
  return [
    {
      key: 'kind', label: 'งาน', value: VISIT_KIND_LABELS[SURVEY_VISIT_KIND], kind: SURVEY_VISIT_KIND,
      extra: siteLoadText(siteLoad, { showZero: true }),
    },
    req.title ? { key: 'title', label: 'เรื่อง', value: req.title } : null,
    { key: 'where', label: 'ที่ไหน', value: siteWhereText(site) || NA },
    { key: 'requester', label: 'ผู้ขอ', value: req.requestedByName || NA, sub: requestAgeText(req, todayIso) },
    {
      key: 'wants', label: 'ต้องการ',
      value: req.requestedDueDate
        ? `เข้า ${dayText(req.requestedDueDate)}${wantTime ? ` · ช่วง ${wantTime}` : ''}`
        : 'ผู้ขอไม่ระบุวันที่ต้องการ',
      sub: req.requestedResultDate ? `ผล ${dayText(req.requestedResultDate)}` : '',
    },
    {
      key: 'origin', label: 'ที่มา', value: 'คำร้องประเมินพื้นที่',
      badge: step ? SURVEY_QUEUE_STEP_BADGES[step] : null,
      sub: step === 'requeue' ? previousVisitText(req.surveyVisit) : step === 'queue' ? acknowledgedText(req) : '',
    },
  ].filter(Boolean);
}

/**
 * ชิปความต้องการของผู้ขอข้างช่องวัน/เวลา และข้างช่องวันส่งผล (pain 14: เดิมซ่อนในประโยคคำใบ้)
 * @returns `{ visit, result }` — แต่ละตัว `{ key, lead, value, same, patch }` หรือ null (ผู้ขอไม่ได้ระบุ)
 *   · `same` = ค่าที่กรอกตรงกับที่ผู้ขอต้องการ ⇒ ชิปขึ้น "ตรงกัน" (`WISH_SAME_TEXT`)
 *   · ไม่ตรง ⇒ ปุ่ม "ใช้ตามผู้ขอ" (`WISH_APPLY_TEXT`) ที่เอา `patch` ไปทับฟอร์ม
 * ⚠️ ผู้ขอไม่ระบุเวลา = วันตรงก็ถือว่าตรง (เวลาอะไรก็ได้) และปุ่มใช้ตามผู้ขอไม่ล้างเวลาที่กรอกไว้
 * ⚠️ แจ้งกำหนดส่ง (หัวข้ออื่น) ไม่มีชิป — วันที่ผู้ขอต้องการยังอยู่ในคำใบ้ของโหมดนั้น
 */
export function commitDueWishes(request, form) {
  if (commitDueMode(request) !== 'site') return { visit: null, result: null };
  const req = request || {};
  const f = form || {};
  const wantDate = req.requestedDueDate || '';
  const wantTime = toHHMM(req.requestedDueTime);
  const wantResult = req.requestedResultDate || '';
  return {
    visit: wantDate ? {
      key: 'visit',
      lead: 'ผู้ขอต้องการ',
      value: [dayText(wantDate), wantTime].filter(Boolean).join(' · '),
      same: f.date === wantDate && (!wantTime || toHHMM(f.time) === wantTime),
      patch: wantTime ? { date: wantDate, time: wantTime } : { date: wantDate },
    } : null,
    result: wantResult ? {
      key: 'result',
      lead: 'ผู้ขอต้องการผล',
      value: dayText(wantResult),
      same: f.resultDate === wantResult,
      patch: { resultDate: wantResult },
    } : null,
  };
}

/**
 * บรรทัดผลลัพธ์ใต้ปุ่มหลัก — กดแล้วจะเกิดอะไร (pain 16) · `{ tone: 'ok'|'warn'|'info', lands, text }`
 *
 * · ยังขาดช่อง ⇒ "ยังลงคิวไม่ได้ — …" (`commitDueGaps` ตัวเดียวกับปุ่ม)
 * · ครบ ⇒ **นัดขึ้นตารางเสมอ** (`lands: 'scheduled'`) "จะขึ้นตารางของ {ชื่อ} · {วัน} {เวลา} · ส่งผลภายใน {วัน}"
 *   ⭐ ทำไมแน่นอน: server สร้างนัดด้วย `initialVisitStatus` บนไซต์จาก `loadSurveySite` ซึ่ง select แค่
 *      id/code/name/customerId ⇒ ①② ข้าม (งานสำรวจ) · ③ บังคับแล้ว (ช่องที่ขาด) · ④ ไม่เห็นช่วงเวลา ⇒ ผ่านทุกข้อ
 *   🐞 รีวิว UAT 24/09 (high): เคยทาย "จะจอดเป็นร่าง…" เมื่อเวลานอกช่วงของไซต์ (หน้าจัดคิว) และตอบกั๊กสองทาง
 *      (หน้าใบ) — ทั้งสองผิด · ยาม: surveyVisit.test.mjs เทียบกับไซต์รูปที่ `loadSurveySite` คืนจริง ⇒ วันที่ server
 *      เริ่มเห็นช่วงเวลา ยามแดง แล้วต้องกลับมาแก้ตัวนี้ (= เปลี่ยนพฤติกรรม ต้องได้มติเจ้าของก่อน)
 *   · เตือน (ไม่บล็อก · อำพัน): นอกช่วงที่ไซต์ให้เข้า (รู้เมื่อจอมีแถวไซต์เต็ม — หน้าจัดคิว) · คนที่เลือกเกินภาระ
 * · แจ้งกำหนดส่ง (หัวข้ออื่น) ⇒ บอกวันที่จะแจ้งผู้ขอ
 * · รับปากวันส่งผล (งานโต๊ะ) ⇒ ประโยคเดียว: ไม่ลงคิว · ใครรับผิดชอบ · ใครเห็น (`lands: null` — ไม่มีอะไรขึ้นตารางช่าง)
 *   ยังขาดช่อง ⇒ ข้อความของช่องที่ขาดล้วน ๆ (ตัวเดียวกับปุ่ม) — ไม่มีคำนำ "ยังลงคิวไม่ได้" เพราะใบนี้ไม่ลงคิว
 * @param load/siteLoad ภาระของวันนั้น + ของไซต์ — ตัวเดียวกับตัวเลือกคน ("ถ้าเลือก … x/12 จุด")
 * @param viewerName ชื่อคนที่เปิดโมดัล — งานโต๊ะเท่านั้น (คนกด = ผู้รับผิดชอบ) · ไม่ส่ง = "คุณ"
 */
export function commitDueOutcome(request, form, {
  site = null, accessKnown = true, technicians = [], load = null, siteLoad = null, viewerName = '',
} = {}) {
  const f = form || {};
  const mode = commitDueMode(request);
  const siteMode = mode === 'site';
  const gaps = commitDueGaps(request, f);
  if (mode === 'desk') {
    if (gaps.length) return { tone: 'warn', lands: null, text: gaps.join(' · ') };
    const owner = String(viewerName ?? '').trim() || 'คุณ';
    return {
      tone: 'info',
      lands: null,
      text: `ใบนี้ไม่ลงคิว ไม่มีนัดบนตารางเจ้าหน้าที่ · ผู้รับผิดชอบ = ${owner} · ฝ่ายขายจะเห็นวันส่งผลนี้`,
    };
  }
  if (gaps.length) {
    return { tone: 'warn', lands: null, text: `${siteMode ? 'ยังลงคิวไม่ได้' : 'ยังแจ้งกำหนดส่งไม่ได้'} — ${gaps.join(' · ')}` };
  }
  if (!siteMode) return { tone: 'info', lands: null, text: `จะแจ้งผู้ขอว่ากำหนดส่ง ${dayText(f.date)}` };
  const name = (technicians || []).find((t) => t.id === f.assigneeId)?.name || request?.assigneeName || '';
  const draft = surveyVisitDraft({ request, date: f.date, time: f.time, assigneeId: f.assigneeId, assigneeName: name });
  const warnings = [
    accessKnown && site ? accessWarnText(site, { date: draft.scheduledDate, startTime: draft.startTime }) : '',
    assigneeOverloaded({ load, assigneeId: f.assigneeId, siteLoad }) ? `เกินภาระ ${MAX_ASSETS_PER_DAY} จุด` : '',
  ].filter(Boolean);
  const text = `จะขึ้นตารางของ ${name || 'เจ้าหน้าที่ที่เลือก'} · ${dayText(f.date)} ${visitTimeText(draft)} · ส่งผลภายใน ${dayText(f.resultDate)}`;
  return { tone: warnings.length ? 'warn' : 'ok', lands: 'scheduled', text: withWarnings(text, warnings) };
}

/* ═══ "เลื่อนวันส่งผล" ของงานโต๊ะ (mig 0408 · แผน survey-desk-assessment §3.2 ข้อ 2 · งวด S2a) ═══════════════════ */

/**
 * โมดัลเดียวกับ "รับปากวันส่งผล" ในทรงเลื่อนวัน — `{ title, dateLabel, reasonRequired, gaps, payload }`
 *
 * ⭐ ใบที่รับปากวันส่งผลไปแล้วเปลี่ยนวันได้ทางนี้ทางเดียว และ **ต้องบอกเหตุผลเสมอ** — ใบนี้ไม่มีนัด จึงไม่มีเธรดของนัด
 *    เล่าแทน บรรทัดในเธรดของใบคือที่เดียวที่ฝ่ายขายรู้ว่าทำไมวันขยับ (`SURVEY_DESK_RESCHEDULE_REASON_ERROR`)
 * ⚠️ `gaps` = ทุกช่องที่ขาด/ผิดในครั้งเดียว ด้วยข้อความเดียวกับกิ่งงานโต๊ะของ `PATCH /api/sa/requests/[id]`
 *    (`surveyDeskResultDate` → `rescheduleRequestError` → เหตุผล) — โมดัลกับ route เพี้ยนจากกันไม่ได้
 * ⚠️ **"วันเดิม" เทียบกับวันส่งผลที่รับปากไว้** (`committedResultDate`) — ใบที่กลายเป็นงานโต๊ะด้วยการตัดพื้นที่ยังถือ
 *    วันนัดเก่าใน `committedDueDate` ซึ่งไม่ใช่คำสัญญาของใบนี้แล้ว · ไม่มีวันส่งผลเลย (ใบก่อน mig 0368) จึงค่อยเทียบกับวันนัดเดิม
 *    — ฐานเดียวกับที่ route ใช้
 * ⚠️ เลื่อนให้เร็วขึ้นได้ — ไม่มีวันนัดให้วันส่งผลต้องตามหลัง
 * @param form `{ date, reason }` — ช่องชุดเดียวกับ `commitDueDefaults`
 */
export function deskRescheduleView(request, form) {
  const req = request || {};
  const f = form || {};
  const result = surveyDeskResultDate({ committedResultDate: f.date });
  const held = String(req.committedResultDate ?? '').trim() || String(req.committedDueDate ?? '').trim();
  const gaps = [];
  if (result.error) gaps.push(result.error);
  else if (result.value === held) gaps.push(DESK_SAME_DATE_ERROR);
  if (!String(f.reason ?? '').trim()) gaps.push(SURVEY_DESK_RESCHEDULE_REASON_ERROR);
  else if (reasonTooLong(f.reason)) gaps.push(REASON_TOO_LONG_ERROR);
  return {
    title: DESK_RESCHEDULE_TITLE,
    dateLabel: SURVEY_METHOD_RESULT_DATE_LABEL,
    reasonRequired: true,
    gaps,
    payload: { action: 'reschedule', committedResultDate: f.date, reason: f.reason },
  };
}
