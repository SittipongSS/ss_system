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
import { requestKindMeta, requestNeedsRef } from '@/lib/master/requestTypes';
import { dueIsStale } from '@/lib/requests/dueRound';
import { fmtDate } from '@/lib/format';
import { businessDate } from '@/lib/businessDate';
import { surveyScheduleGaps } from '@/lib/service/surveyVisit';
import { toHHMM } from '@/lib/service/sites';

/* ความยาวหมายเหตุสูงสุด — ตัวเดียวกับที่ route ตีกลับ (`เหตุผลยาวเกิน 500 ตัวอักษร`) */
export const COMMIT_DUE_REASON_MAX = 500;

/** 'site' = ลงคิวเข้าพื้นที่ (วัน · เวลา · เจ้าหน้าที่ · วันส่งผล) · 'date' = แจ้งกำหนดส่ง (วันอย่างเดียว) */
export function commitDueMode(request) {
  return requestNeedsRef(request?.kind, 'site') ? 'site' : 'date';
}

/**
 * ป้ายทุกตัวของก้าวนี้ — ปุ่มหลักบนหน้าใบ · ปุ่มบนการ์ดหน้าจัดคิว · หัวโมดัล · ปุ่มส่ง · toast
 *
 * @param requeue ใบมีวันแล้วแต่ไม่มีนัดที่ยังมีชีวิต (ผู้เรียกพิสูจน์ — `surveyQueueStep === 'requeue'`)
 * ⚠️ หัวโมดัลไม่ดู `requeue` — ของเดิมเป็นแบบนั้น (ปุ่ม "ลงคิวใหม่" เปิดโมดัล "ลงคิวเข้าพื้นที่")
 */
export function commitDueLabels(request, { requeue = false } = {}) {
  const site = commitDueMode(request) === 'site';
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
       ⚠️ รอบแก้ต้องเห็นวันของรอบก่อน — ไม่งั้นคนกรอกไม่รู้ว่ากำลังแทนที่อะไร */
    dateHint: `เป็นวันที่ ${dept} แจ้ง และเป็นตัวที่ใช้นับว่าเลยกำหนดหรือยัง`
      + (stale ? ` · รอบก่อนแจ้งไว้ ${fmtDate(request.committedDueDate)}` : '')
      + (request?.requestedDueDate ? ` · ผู้ขอต้องการรับงาน ${fmtDate(request.requestedDueDate)}` : ''),
    /* ⚠️ Postgres คืน time เป็น '11:00:00' — ตัดวินาทีด้วยตัวเดียวกับการ์ดบนหน้าจัดคิว (`toHHMM`)
       🐞 UAT 24/09: คำใบ้พิมพ์ "11:00:00" ข้างการ์ดที่พิมพ์ "ช่วง 11:00" */
    timeHint: 'เว้นว่าง = ไปทั้งวัน'
      + (toHHMM(request?.requestedDueTime) ? ` · ผู้ขอต้องการช่วง ${toHHMM(request.requestedDueTime)}` : ''),
    resultLabel: form.committedResultLabel || 'วันที่จะส่งผล',
    resultHint: 'ต้องไม่มาก่อนวันนัดเข้าพื้นที่'
      + (request?.requestedResultDate ? ` · ผู้ขอต้องการผลวันที่ ${fmtDate(request.requestedResultDate)}` : ''),
    /* คำใบ้ใต้ตัวเลือกคน — **บอกเงื่อนไข ไม่ใช่สัญญา**
       🐞 รีวิว 24/09: เคยเขียน "นัดจะขึ้นตารางและงานวันนี้ของคนนี้" ตายตัว ⇒ ผิดทุกครั้งที่ด่าน ④ (ช่วงเวลาที่
          ไซต์ให้เข้า) ไม่ผ่าน — `createSurveyVisit` จอดนัดเป็นร่างที่ไม่อยู่บนตารางของใคร (งานสำรวจข้ามด่าน ①②
          และบังคับเลือกคนแล้ว ⇒ ข้อ ④ คือทางเดียวที่นัดเป็นร่าง) · โมดัลไม่รู้ช่วงเข้าของไซต์ จึงบอกทั้งสองทาง */
    assigneeHint: site ? 'นัดขึ้นตารางของคนนี้เมื่อวัน/เวลาอยู่ในช่วงที่ไซต์ให้เข้า · นอกช่วง = จอดเป็นร่างในแท็บรอจัด' : '',
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
 * @param today วันนี้แบบไทย 'YYYY-MM-DD' — ไม่ส่ง = `businessDate()`
 */
export function commitDueDefaults(request, { requeue = false, today } = {}) {
  const site = commitDueMode(request) === 'site';
  const req = request || {};
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
 */
export function commitDuePayload(request, form, { technicians = [] } = {}) {
  const site = commitDueMode(request) === 'site';
  const f = form || {};
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
 */
export function commitDueGaps(request, form) {
  const f = form || {};
  const gaps = commitDueMode(request) === 'site'
    ? surveyScheduleGaps({
      committedDueDate: f.date,
      committedDueTime: f.time,
      assigneeId: f.assigneeId,
      committedResultDate: f.resultDate,
    }, request)
    : (/^\d{4}-\d{2}-\d{2}$/.test(String(f.date ?? '').trim()) ? [] : ['ต้องระบุวันกำหนดส่ง']);
  if (String(f.reason ?? '').trim().length > COMMIT_DUE_REASON_MAX) {
    gaps.push(`เหตุผลยาวเกิน ${COMMIT_DUE_REASON_MAX} ตัวอักษร`);
  }
  return gaps;
}

/** ข้อความของปุ่มส่งที่กดไม่ได้ (`GatedAction.blocker`) — ผ่าน = '' */
export function commitDueBlocker(request, form) {
  return commitDueGaps(request, form).join(' · ');
}
