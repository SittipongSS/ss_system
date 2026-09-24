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
import { NA, fmtDate } from '@/lib/format';
import { businessDate } from '@/lib/businessDate';
import { SURVEY_VISIT_KIND, surveyScheduleGaps, surveyVisitDraft } from '@/lib/service/surveyVisit';
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
 * @param load/siteLoad ภาระของวันนั้น + ของไซต์ — ตัวเดียวกับตัวเลือกคน ("ถ้าเลือก … x/12 จุด")
 */
export function commitDueOutcome(request, form, {
  site = null, accessKnown = true, technicians = [], load = null, siteLoad = null,
} = {}) {
  const f = form || {};
  const siteMode = commitDueMode(request) === 'site';
  const gaps = commitDueGaps(request, f);
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
