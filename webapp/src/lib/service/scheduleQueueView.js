// ── แผง "รายการงาน" ของหน้าจัดคิวเจ้าหน้าที่ — ประกอบแถว/กลุ่มจากนัดข้ามสัปดาห์ ──
//
// ⭐ มติผู้ใช้ 2026-09-22: "ไม่มี panel รายการงาน มีแต่ปฏิทิน อยากโชว์รายการคิวที่รอ ที่จัดแล้ว"
//    ⇒ รายการงานวางคู่กับตารางสัปดาห์ (ทางเลือก B) · ไม่ผูกกับสัปดาห์ที่เปิด
// 🐞 ของเดิม "คิวรอจัด" โผล่เฉพาะร่างในสัปดาห์ที่เปิด — ร่างของรอบบริการ (สร้างล่วงหน้า 90 วัน)
//    กับงานถอนเครื่อง (วันที่ = วันที่เกิด) หายจากทุกจอเมื่อพ้นสัปดาห์ · นัดค้างมองไม่เห็นเลย
//    ต้องกดย้อนสัปดาห์เอง (docs/service-field-operations.md ข้อ F-6 สัญญา "คิวรอจัดถาวร" ไว้)
//
// ⚠️ ไฟล์นี้ **ประกอบอย่างเดียว ไม่ตัดสินเอง** — ถัง/กลุ่ม/ช่วงวันมาจาก scheduleQueue.js
//    ด่านมาจาก visitGate.js ตัวเดียวกับ server · สถานะมาจาก visitStatus.js
//    ห้ามเทียบสตริงสถานะหรือเจ้าของด่านตรงนี้
import { VISIT_KIND_LABELS, VISIT_STATUS_LABELS, overlappingVisitIds, visitTimeText, visitWarnings } from './rounds';
import { evaluateVisitGate, gateBlockedItems, GATE_OWNERS, visitSkipsContractGates } from './visitGate';
import { gateContextForSite } from './gateContext';
import { isDraftVisit, isLiveVisit, isShortfallVisit } from './visitStatus';
import { isRenewalRetrieveVisit, visitDeleteButton } from './visitDelete';
import { NO_TEAM } from './crewTeams';
import { MAX_ASSETS_PER_DAY } from './visitLoad';
import { toHHMM } from './sites';
import { INTAKE_TAB_LABELS } from './intake';
import {
  SURVEY_QUEUE_STEPS, SURVEY_QUEUE_STEP_BADGES, SURVEY_QUEUE_STEP_LABELS, acknowledgedText,
  liveSurveyVisitsByRequest, previousVisitText, surveyQueueStep,
} from './surveyQueue';
import { requestStatusView } from '@/lib/requests/statuses';
import { acknowledgeRequestError } from '@/lib/requests/stages';
import { commitDueLabels } from '@/lib/requests/commitDue';
import { dayText, daysBetween, relDayText, requestAgeText, siteLoadText } from './queueWords';
import {
  QUEUE_BUCKETS,
  WAITING_GROUPS,
  WAITING_GROUP_LABELS,
  addDaysIso,
  freeCrewOn,
  inQueueRange,
  isStaleDraft,
  overdueDaysOf,
  queueBucketOf,
  queueHaystack,
  queueWindow,
  staffLoadOn,
  teamViewVisit,
  waitingGroupOf,
} from './scheduleQueue';
import { fmtMonthShort } from '@/lib/format';

/* ป้ายผลของนัดที่ปิดแล้ว — ตารางสีแบบเดียวกับ VISIT_STATUS_LABELS (ไม่ใช่ชุดสถานะใหม่) */
const CLOSED_TONES = { done: 'success', partial: 'warning', unable: 'danger' };

/* ⭐ คำกลาง (วัน · ระยะห่าง · ภาระไซต์) อยู่ที่ `queueWords.js` — ส่งต่อจากที่นี่ให้ผู้เรียกเดิม
   (หน้าจัดคิว · เทสต์) ไม่ต้องแก้ import · โมดัลจัดคิวอ่านชุดเดียวกัน (คำบนการ์ด = คำในโมดัล) */
export { dayText, relDayText, siteLoadText };

/* ข้อที่ TS แก้เองได้ของด่าน → ป้ายของลิงก์แก้ + ช่องที่พาโฟกัสไป — ชุดเดียวของการ์ดและโมดัล
   (`fix` ของ `evaluateVisitGate` มีสองค่า: 'assignee' · 'schedule') */
export const GATE_FIX = Object.freeze({
  assignee: Object.freeze({ label: 'เลือกเจ้าหน้าที่', field: 'assignee' }),
  schedule: Object.freeze({ label: 'แก้วัน/เวลา', field: 'scheduledDate' }),
});

/**
 * ข้อที่ติดของด่านหนึ่งข้อ (จาก `gateBlockedItems`) → ของที่การ์ด/โมดัลวาด
 * ⭐ ข้อที่แก้ได้บนจอมีลิงก์แก้ต่อท้ายอยู่แล้ว ⇒ ตัดครึ่งหลังของเหตุที่เป็นคำสั่งซ้ำทิ้ง
 *    ("ยังไม่มอบหมาย — เลือกเจ้าหน้าที่…" + ลิงก์ "เลือกเจ้าหน้าที่" = พูดสองครั้ง)
 */
export function gateItemView(item) {
  return {
    key: item.key, owner: item.owner, ownerTone: ownerTone(item.owner),
    reason: item.fix ? String(item.reason).split(' — ')[0] : item.reason,
    fix: item.fix || null,
  };
}

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/* โทนของป้ายเจ้าของด่าน — SA = สีแบรนด์อ่อน (เรื่องของฝ่ายขาย) · เงิน = อำพัน · TS = ฟ้า
   ⚠️ เทียบกับ GATE_OWNERS ไม่ใช่สตริงลอย ๆ */
export function ownerTone(owner) {
  if (owner === GATE_OWNERS.TS) return 'info';
  if (owner === GATE_OWNERS.FN) return 'warning';
  if (owner === GATE_OWNERS.SA) return 'accent';
  return 'neutral';
}

/* ต้นเรื่องของนัด — คนจัดคิวต้องรู้ว่าร่างมาจากไหน (มติ 2026-08-28: TS ไม่ใช่ต้นทางของงาน)
   ⚠️ "ถอนเครื่อง · ลูกค้าไม่ต่อสัญญา" อ่านนิยามจาก `isRenewalRetrieveVisit` ตัวเดียวกับด่านลบนัด (visitDelete.js)
      — ป้ายที่บอกว่าใบนี้มาจากเรื่องไม่ต่อสัญญา กับเหตุที่ปุ่ม "ลบนัด" ปฏิเสธ ต้องชี้ใบชุดเดียวกัน */
export function originText(visit) {
  if (visit?.requestId) return 'จากคำร้องประเมินพื้นที่';
  if (visit?.planId) return 'จากรอบบริการ';
  if (isRenewalRetrieveVisit(visit)) return 'ถอนเครื่อง · ลูกค้าไม่ต่อสัญญา';
  return 'งานนอกรอบ';
}

/* ป้ายตัวเลข "งานเข้าใหม่" บนแถบต้นทางงาน — ตัวเลขนั้นนับ **สองแท็บรวมกัน** (รอตั้งไซต์/โซน +
   รอตั้งรอบ · `api/nav/counts` ส่ง `bind.rows.length + plan.length`) ⇒ ป้ายต้องบอกทั้งสองแท็บ
   🐞 ของเดิมป้ายบอกแค่แท็บแรก ⇒ ตัวเลขอ่านว่า "รอตั้งไซต์ 12" ทั้งที่ 9 ใบในนั้นคือรอตั้งรอบ
   ⚠️ แท็บ "ครบรอบยังไม่มีนัด" ไม่อยู่ในตัวเลขนั้น จึงไม่อยู่ในป้าย */
export const INTAKE_UPSTREAM_LABEL = `${INTAKE_TAB_LABELS.bind} + ${INTAKE_TAB_LABELS.plan}`;

/* ── การ์ด "คำร้องรอลงคิว" (มติเจ้าของ 23/09) ───────────────────────────────
   ⭐ ใช้การ์ดตัวเดียวกับนัด (`ScheduleQueueCard`) ลำดับช่องเดิม: รหัส · ไซต์ · วัน · คน · ภาระ ·
      สิ่งที่ต้องทำ · ปุ่ม — คนจัดคิวสลับไปมาทั้งวัน ตำแหน่งของข้อมูลต้องไม่ย้ายตามชนิดการ์ด
   ⚠️ ขั้นของใบมาจาก `surveyQueueStep` ตัวเดียว (ตัวเดียวกับตัวโหลดฝั่ง server) — ห้ามคิดเงื่อนไขเอง */
/* ป้ายขั้นของการ์ด ("ขั้น 2/2") อยู่ที่ `SURVEY_QUEUE_STEP_BADGES` (surveyQueue.js) — ชุดเดียวกับ
   แถว "ที่มา" ในโมดัลลงคิว */
export const REQUEST_ORIGIN_TEXT = 'คำร้องประเมินพื้นที่ · ยังไม่มีนัด';

/**
 * แถวการ์ดของคำร้องหนึ่งใบ — `null` ถ้าใบนี้ไม่ใช่ของกลุ่มนี้แล้ว (`surveyQueueStep` ตอบ null)
 *
 * @param todayIso     วันนี้ของหน้าต่าง (วันไทย)
 * @param live         นัดที่อยู่บนตาราง (นับ "วันนั้นว่างกี่คน")
 * @param peopleInView เจ้าหน้าที่ในมุมมองตอนนี้ (กรองทีมแล้ว)
 */
export function surveyRequestRow(request, { todayIso, sitesById = new Map(), live = [], peopleInView = [] } = {}) {
  const step = surveyQueueStep(request);
  if (!step) return null;
  const requeue = step === 'requeue';
  const site = sitesById.get(request.siteId) || null;
  const labels = commitDueLabels(request, { requeue });
  const statusView = requestStatusView(request);
  /* ⭐ ป้ายมุมใช้ **คำของขั้น** (`SURVEY_QUEUE_STEP_LABELS`) ชุดเดียวกับบรรทัดย่อยของกลุ่ม
     🐞 รีวิว 24/09: เคยใช้คำสถานะของใบ ⇒ การ์ดเขียน "รอกำหนดส่ง" ใต้หัวกลุ่มที่นับใบเดียวกันว่า
        "รอลงคิว 1" (จอเดียวสองคำ) และค้นคำที่บรรทัดย่อยโชว์ไม่เจอ · คำสถานะของใบยังอยู่ใน haystack
        เป็นคำพ้อง (หน้าใบกับคิวคำร้องเรียกแบบนั้น) */
  const tag = { tone: requeue ? 'warning' : statusView.tone, label: SURVEY_QUEUE_STEP_LABELS[step] };

  // ── วัน: ใบที่ยังไม่มีนัดบอก "วันที่ผู้ขอต้องการ" · ใบที่นัดหลุดบอกวันที่เคยรับปาก ──
  const date = requeue ? request.committedDueDate : request.requestedDueDate;
  const time = toHHMM(requeue ? request.committedDueTime : request.requestedDueTime);
  const dateLine = requeue
    ? `นัดเดิม ${dayText(request.committedDueDate)}`
    : (date ? `ต้องการเข้า ${dayText(date)}` : 'ผู้ขอไม่ระบุวันที่ต้องการ');
  const timeLine = time ? `${requeue ? 'เวลา' : 'ช่วง'} ${time}` : '';
  const rel = relDayText(date, todayIso, requeue ? 'วันนัดเดิมผ่านไปแล้ว' : 'เลยวันที่ต้องการ');

  // ── คน: ยังไม่มีเจ้าหน้าที่ ⇒ ช่องนี้บอกผู้ขอ + ค้างมากี่วัน (นับจากวันไทยที่ส่ง) ──
  const who = {
    text: `ผู้ขอ ${request.requestedByName || '—'}`,
    tone: '',
    sub: [
      requestAgeText(request, todayIso),
      request.assigneeName ? `มอบหมายไว้ ${request.assigneeName}` : '',
    ].filter(Boolean).join(' · '),
    linkId: null,
  };

  // ── ภาระ: วันส่งผลที่ผู้ขอต้องการ + วันนั้นว่างกี่คน (เฉพาะวันนี้เป็นต้นไป) ──
  const resultDate = requeue
    ? (request.committedResultDate || request.requestedResultDate)
    : request.requestedResultDate;
  const siteLoadText = resultDate
    ? `${requeue && request.committedResultDate ? 'รับปากส่งผล' : 'ต้องการผล'} ${dayText(resultDate)}`
    : '';
  let dayLoad = null;
  if (date && date >= todayIso && peopleInView.length) {
    const { free, total } = freeCrewOn(live, date, peopleInView);
    dayLoad = { text: `วันนั้นว่าง ${free.length} จาก ${total} คน`, tone: free.length ? 'ok' : 'warn', free };
  }

  // ── สิ่งที่ต้องทำ ──
  const previous = request.surveyVisit;
  const instruction = step === 'acknowledge'
    ? 'ยังไม่มีใครรับเรื่อง — รับเรื่องก่อน แล้วจึงลงคิวเข้าพื้นที่'
    : step === 'queue'
      ? `${acknowledgedText(request)} — เลือกวัน เวลา เจ้าหน้าที่ และวันส่งผล`
      : `${previousVisitText(previous)} — ลงคิวใหม่`;
  const badge = SURVEY_QUEUE_STEP_BADGES[step];
  const status = { label: badge.label, tone: badge.tone, text: instruction };
  const actionLabel = step === 'acknowledge' ? 'รับเรื่อง' : labels.action;

  const row = {
    type: 'request',
    id: request.id,
    request,
    visit: null,
    site,
    bucket: 'waiting',
    group: 'requests',
    step,
    gate: null,
    ready: false,
    stale: false,
    tag,
    readyText: '',
    code: request.docNo || request.id,
    href: `/requests/${encodeURIComponent(request.id)}`,
    kind: 'survey',
    kindLabel: VISIT_KIND_LABELS.survey,
    siteCode: [site?.code, site?.routeZone].filter(Boolean).join(' · '),
    siteName: site?.name || request.siteId || '',
    customer: site?.customerName || request.customerName || '',
    dateLine,
    timeLine,
    rel,
    who,
    siteLoadText,
    dayLoad,
    gateItems: [],
    status,
    title: request.title || '',
    warns: [],
    origin: REQUEST_ORIGIN_TEXT,
    actionLabel,
    actionHint: step === 'acknowledge' ? '' : (labels.hint || ''),
    /* ⚠️ ด่านของปุ่มรับเรื่อง = ตัวเดียวกับที่ server ใช้ตีกลับ (GatedAction · โชว์เสมอ บอกเหตุตอนกด) */
    ackBlocker: step === 'acknowledge' ? (acknowledgeRequestError(request) || '') : '',
    deleteBlocker: '',
    actions: {
      acknowledge: step === 'acknowledge',
      commitDue: step !== 'acknowledge',
      release: false,
      open: false,
      assign: false,
      report: false,
      calendar: false,
      delete: false,
    },
  };
  row.haystack = queueHaystack([
    row.code, row.kindLabel, tag.label, statusView.label, row.siteCode, row.siteName, row.customer,
    dateLine, timeLine, rel.text, who.text, who.sub, siteLoadText, dayLoad?.text,
    status.label, status.text, row.title, row.origin, actionLabel, row.actionHint,
  ]);
  return row;
}

/* ลำดับในกลุ่มคำร้อง: นัดหลุด → รอรับเรื่อง → รอลงคิว · แล้ววันที่ต้องการ (ว่างไว้ท้าย) · แล้ววันส่ง */
const requestSortKey = (row) => [
  SURVEY_QUEUE_STEPS.indexOf(row.step),
  String((row.step === 'requeue' ? row.request.committedDueDate : row.request.requestedDueDate) || '9999-99-99'),
  String(row.request.submittedAt || ''),
  String(row.code),
];
const byRequestOrder = (a, b) => {
  const ka = requestSortKey(a);
  const kb = requestSortKey(b);
  return (ka[0] - kb[0]) || ka[1].localeCompare(kb[1]) || ka[2].localeCompare(kb[2]) || ka[3].localeCompare(kb[3]);
};

function relativeText(visit, bucket, win) {
  const date = visit?.scheduledDate;
  if (!date) return { text: '', tone: '' };
  if (bucket === 'waiting' && isStaleDraft(visit, win)) {
    const n = overdueDaysOf(visit, win);
    return { text: `วันเสนอผ่านไปแล้ว ${n} วัน — เลือกวันใหม่ก่อนปล่อย`, tone: 'warn' };
  }
  if (bucket === 'overdue') return { text: `ค้าง ${overdueDaysOf(visit, win)} วัน`, tone: 'bad' };
  if (bucket === 'closed') {
    const actual = visit.actualDate || date;
    if (actual === date) return { text: '', tone: '' };
    const n = daysBetween(date, actual);
    return { text: n > 0 ? `เข้าช้ากว่านัด ${n} วัน` : `เข้าก่อนนัด ${-n} วัน`, tone: '' };
  }
  const n = daysBetween(win.todayIso, date);
  if (n === 0) return { text: 'วันนี้', tone: '' };
  if (n === 1) return { text: 'พรุ่งนี้', tone: '' };
  return { text: `อีก ${n} วัน`, tone: '' };
}

function statusOf(visit, bucket) {
  if (bucket === 'overdue') {
    /* "เริ่มแล้วยังไม่ปิด" อ่านจากเวลาที่ประทับ (ปุ่มเริ่มงานเป็นทางเดียวที่ทำให้เป็น in_progress) */
    const inProgress = !!visit.actualStartTime && !visit.actualEndTime;
    return {
      label: VISIT_STATUS_LABELS[visit.status] || visit.status,
      tone: inProgress ? 'success' : 'info',
      text: inProgress
        ? 'เริ่มงานแล้วยังไม่ปิด — ตามให้ปิดงาน'
        : !visit.assigneeId
          ? 'ยังไม่มีเจ้าหน้าที่ — มอบหมาย หรือเลื่อนวัน'
          : 'ยังไม่เริ่มงาน — เลื่อนวัน หรือบันทึกว่าทำไม่ได้',
    };
  }
  if (bucket === 'scheduled') {
    if (visit.gateOverrideReason) {
      return {
        label: 'ข้ามด่าน', tone: 'warning',
        text: `โดย ${visit.gateOverrideByName || 'หัวหน้า'}: ${visit.gateOverrideReason}`,
      };
    }
    if (visit.actualStartTime && !visit.actualEndTime) {
      return { label: VISIT_STATUS_LABELS[visit.status] || visit.status, tone: 'success', text: `เริ่มงาน ${String(visit.actualStartTime).slice(0, 5)} น.` };
    }
    return null;
  }
  if (bucket === 'closed') {
    return {
      label: VISIT_STATUS_LABELS[visit.status] || visit.status,
      tone: CLOSED_TONES[visit.status] || (isShortfallVisit(visit) ? 'warning' : 'success'),
      text: visit.unableReason || visit.summary || '',
    };
  }
  return null;
}

/**
 * ประกอบรายการงานทั้งแผง
 *
 * @param visits       นัดจาก `/api/service/visits/queue` (ร่างทุกวัน + นัดเปิด + ปิดใน 14 วัน)
 * @param sitesById    Map ไซต์ (id → site)
 * @param gateContext  บริบทด่านของไซต์ที่มีร่าง (จาก API ตัวเดียวกัน)
 * @param workload     { [siteId]: { assets, packs } }
 * @param crewPeople   เจ้าหน้าที่หน้างาน [{ id, name }] — ใช้นับ "วันนั้นว่างกี่คน"
 * @param teamNames    Map teamCode → ชื่อทีม
 * @param assignablePeople คนที่มอบหมายงานเข้าไซต์ได้ทั้งฝ่าย [{ id, name }] (`canBeServiceAssignee`) — ใช้นับ
 *                     "วันนั้นว่างกี่คน" บน **การ์ดคำร้อง** ให้ตรงกับตัวเลือกในโมดัลลงคิว · null = ใช้ crewPeople
 * @param surveyRequests คำร้องประเมินพื้นที่ที่รอลงคิว (จาก API ตัวเดียวกัน · null = ไม่มีสิทธิ์/โหลดไม่ได้)
 *                     ⭐ ขึ้นเป็นกลุ่ม "คำร้องรอลงคิว" บนสุดของถังรอจัด (มติเจ้าของ 23/09)
 * @returns `requestCount` = จำนวนการ์ดคำร้อง (หลังกรองทีม ก่อนค้นหา — กติกาเดียวกับเม็ดถัง)
 *          ⇒ ตัวเลขบนแถบต้นทางงานอ่านจากตัวนี้ **จึงเท่าจำนวนการ์ดเสมอ** (อาร์เรย์เดียวกัน)
 */
export function buildScheduleQueue({
  visits = [], sitesById = new Map(), gateContext = {}, workload = {},
  todayIso, teamFilter, crewByUser = new Map(), crewPeople = [], teamNames = new Map(),
  bucket = 'waiting', range = 'all', search = '', farOn = false, within = null,
  surveyRequests = [], assignablePeople = null,
} = {}) {
  const win = queueWindow(todayIso);
  const needle = String(search || '').trim().toLowerCase();

  // ภาระ/เวลาทับนับจากนัดที่ "อยู่บนตาราง" เท่านั้น — ร่างไม่นับภาระ (มติ 2026-08-28)
  const live = visits.filter(isLiveVisit);
  const overlapIds = overlappingVisitIds(live);
  const loadCache = new Map();
  const loadOn = (date) => {
    if (!loadCache.has(date)) loadCache.set(date, staffLoadOn(live, date, workload));
    return loadCache.get(date);
  };
  const teamOf = (userId) => (userId ? crewByUser.get(userId) || NO_TEAM : null);
  const teamLabel = (userId) => {
    const code = teamOf(userId);
    if (!code || code === NO_TEAM) return '';
    return teamNames.get(code) || '';
  };
  const inTeamView = (p) => teamViewVisit({ assigneeId: p.id }, teamFilter, crewByUser);
  const peopleInView = crewPeople.filter(inTeamView);
  /* ⭐ การ์ดคำร้องนับคนว่างจาก **คนที่มอบหมายได้** — ชุดเดียวกับตัวเลือกในโมดัลลงคิวที่การ์ดเปิด
     🐞 UAT 24/09: เคยนับแค่คนหน้างาน ⇒ การ์ด "ว่าง 5 จาก 5 คน" แต่โมดัลให้เลือก 8 คน (งานประเมินมักไปที่หัวหน้า)
     ⚠️ ไม่ส่งมา = ถอยไปคนหน้างาน (ของเดิม) · แถวร่างของนัดยังนับคนหน้างานตามเดิม */
  const requestPeopleInView = Array.isArray(assignablePeople) ? assignablePeople.filter(inTeamView) : peopleInView;

  const rows = [];
  for (const visit of visits) {
    const b = queueBucketOf(visit, win);
    if (!b) continue;
    if (!teamViewVisit(visit, teamFilter, crewByUser)) continue;
    const site = sitesById.get(visit.siteId) || null;
    const draft = b === 'waiting';
    const gate = draft
      ? evaluateVisitGate(visit, gateContextForSite(gateContext, visit.siteId, { site }))
      : null;
    const group = draft ? waitingGroupOf(gate, visit, win) : null;
    const blocked = draft ? gateBlockedItems(gate) : [];
    const siteLoad = workload[visit.siteId] || null;
    const assets = siteLoad?.assets || 0;
    const rel = relativeText(visit, b, win);

    // ── เจ้าหน้าที่ ──
    const date = visit.scheduledDate;
    const soon = date && date <= win.weekUntil;
    let who;
    if (!visit.assigneeId) {
      who = { text: 'ยังไม่มอบหมาย', tone: (b === 'overdue' || soon || isStaleDraft(visit, win)) ? 'warn' : '', sub: 'ทุกทีมหยิบได้', linkId: null };
    } else if (draft) {
      /* ⚠️ ร่างที่ตั้งชื่อไว้ **ยังไม่ใช่งานของคนนั้น** — ห้ามลิงก์ไปงานวันนี้ของเขา
         และต้องเขียนให้ชัดว่ายังไม่ถึงมือ (กฎ "ร่างต้องไม่อ่านเป็นงานของเจ้าหน้าที่") */
      who = { text: `ตั้งไว้ ${visit.assigneeName || ''}`.trim(), tone: '', sub: 'ยังไม่ถึงมือเจ้าหน้าที่', linkId: null };
    } else {
      const extra = Array.isArray(visit.assistantIds) && visit.assistantIds.length ? ` · ไปด้วย +${visit.assistantIds.length}` : '';
      who = { text: visit.assigneeName || '', tone: '', sub: `${teamLabel(visit.assigneeId)}${extra}`.replace(/^ · /, ''), linkId: visit.assigneeId };
    }

    // ── ภาระวันนั้น (เฉพาะวันนี้เป็นต้นไป) ──
    let dayLoad = null;
    if (date && date >= win.todayIso && (b === 'waiting' || b === 'scheduled')) {
      if (visit.assigneeId) {
        const load = loadOn(date).get(visit.assigneeId) || { visits: 0, assets: 0, packs: 0 };
        const total = draft ? load.assets + assets : load.assets;
        /* 🐞 (รีวิว 24/09) ชื่อติดคำไทยไม่มีวรรค ⇒ ชื่ออังกฤษอ่านเป็น "วันนั้นVeerachaiรวม 2/12 จุด"
           ⇒ วรรคหน้า-หลังชื่อเสมอ · ไม่มีชื่อ (มี id แต่ชื่อหาย) = "เจ้าหน้าที่" แทนช่องว่างสองช่อง */
        const name = firstName(visit.assigneeName) || 'เจ้าหน้าที่';
        dayLoad = {
          text: draft
            ? `ถ้าปล่อย วันนั้น ${name} รวม ${total}/${MAX_ASSETS_PER_DAY} จุด`
            : `วันนั้นของ ${name} ${total}/${MAX_ASSETS_PER_DAY} จุด`,
          tone: total > MAX_ASSETS_PER_DAY ? 'warn' : '',
          projected: total,
        };
      } else if (peopleInView.length) {
        const { free, total } = freeCrewOn(live, date, peopleInView);
        dayLoad = { text: `วันนั้นว่าง ${free.length} จาก ${total} คน`, tone: free.length ? 'ok' : 'warn', free };
      }
    }

    const status = statusOf(visit, b);
    const warns = b === 'overdue' || b === 'scheduled'
      ? visitWarnings(visit, { site, overlapIds }).map((w) => w.message)
      : [];
    /* ข้อที่แก้ได้บนการ์ดมีลิงก์แก้ต่อท้ายอยู่แล้ว ⇒ ตัดครึ่งหลังของเหตุที่เป็นคำสั่งซ้ำทิ้ง
       ("ยังไม่มอบหมาย — เลือกเจ้าหน้าที่…" + ลิงก์ "เลือกเจ้าหน้าที่" = พูดสองครั้ง) */
    const gateItems = blocked.map(gateItemView);
    const kindLabel = VISIT_KIND_LABELS[visit.kind] || visit.kind;
    const dateLine = b === 'closed' ? `เข้า ${dayText(visit.actualDate || date)}` : dayText(date);
    const timeLine = b === 'closed' ? (visit.actualDate && visit.actualDate !== date ? `นัด ${dayText(date)}` : '') : visitTimeText(visit);
    const origin = originText(visit);
    const ready = group === 'ready';
    const stale = draft && isStaleDraft(visit, win);
    /* ⭐ ปุ่ม "ลบนัด" (มติเจ้าของ 24/09) — เฉพาะงานนอกรอบที่ยังไม่ปิด · เหตุตอนกดมาจากด่านตัวเดียวกับ API */
    const deleteAction = visitDeleteButton(visit);
    /* ป้ายหัวการ์ด (เฉพาะรอจัด) + บรรทัดผ่านด่าน — ประกอบที่นี่เพื่อให้ **ค้นเจอทุกอย่างที่ตาเห็น** */
    const tag = !draft ? null
      : stale ? { tone: 'warning', label: 'วันเสนอผ่านแล้ว' }
        : ready ? { tone: 'success', label: 'พร้อมปล่อย' }
          : { tone: 'warning', label: 'ติดด่าน' };
    const readyText = ready
      ? (visitSkipsContractGates(visit) ? 'ผ่านด่าน · งานนี้ไม่ต้องตรวจสัญญา/เงิน' : 'ผ่านด่านครบ')
      : '';
    const row = {
      type: 'visit',
      id: visit.id,
      visit,
      site,
      bucket: b,
      group,
      gate,
      ready,
      stale,
      tag,
      readyText,
      code: visit.code || visit.id,
      kind: visit.kind,
      kindLabel,
      siteCode: [site?.code, site?.routeZone].filter(Boolean).join(' · '),
      siteName: site?.name || visit.siteId,
      customer: site?.customerName || '',
      dateLine,
      timeLine,
      rel,
      who,
      siteLoadText: siteLoadText(siteLoad),
      dayLoad,
      gateItems,
      status,
      warns,
      origin,
      deleteBlocker: deleteAction?.blocker || '',
      actions: {
        release: draft,
        open: b === 'overdue',
        assign: b === 'scheduled' && !visit.assigneeId,
        report: b === 'closed',
        delete: !!deleteAction,
      },
    };
    row.haystack = queueHaystack([
      row.code, kindLabel, row.siteCode, row.siteName, row.customer, dateLine, timeLine, rel.text,
      who.text, who.sub, status?.label, status?.text, origin,
      ...gateItems.map((g) => `${g.owner || ''} ${g.reason}`), ...warns,
      dayLoad?.text, row.siteLoadText, tag?.label, readyText,
    ]);
    rows.push(row);
  }

  /* ── การ์ดคำร้องรอลงคิว (มติเจ้าของ 23/09) ──
     ⭐ **ตัวกรองทีมไม่ซ่อน** — ใบยังไม่มีเจ้าหน้าที่ (กติกาเดียวกับนัดที่ยังไม่มอบหมาย: ทุกทีมหยิบได้)
     ⚠️ ใบที่มีนัดที่ยังมีชีวิตในชุดนัดนี้แล้วไม่ขึ้นซ้ำ — ตัวโหลดกรองให้แล้ว แต่ถามซ้ำด้วยนัดชุดที่
        จอกำลังวาดจริง ⇒ ใบเดียวกันไม่มีทางเป็นสองการ์ด (การ์ดคำร้อง + การ์ดนัด) */
  const queuedRequests = liveSurveyVisitsByRequest(visits);
  let requestCount = 0;
  for (const request of Array.isArray(surveyRequests) ? surveyRequests : []) {
    if (!request?.id || queuedRequests.has(request.id)) continue;
    const row = surveyRequestRow(request, { todayIso: win.todayIso, sitesById, live, peopleInView: requestPeopleInView });
    if (!row) continue;
    rows.push(row);
    requestCount += 1;
  }

  // ── ตัวเลขบนเม็ดถัง — หลังกรองทีม ก่อนค้นหา · ร่างไกลที่ยังติดด่านไม่นับ (เลขต้องลงถึง 0 ได้) ──
  const counts = Object.fromEntries(QUEUE_BUCKETS.map((k) => [k, 0]));
  let farCount = 0;
  const rangeCounts = { all: 0, '7d': 0, unassigned: 0 };
  for (const row of rows) {
    if (row.bucket === 'waiting' && row.group === 'far') { farCount += 1; continue; }
    counts[row.bucket] += 1;
    if (row.bucket === 'scheduled') {
      for (const r of Object.keys(rangeCounts)) if (inQueueRange(row.visit, r, win)) rangeCounts[r] += 1;
    }
  }

  // ── แถวของถังที่เปิดอยู่ ──
  /* ⚠️ ชิปสัปดาห์นับเฉพาะ **ร่าง** ที่เสนอวันในสัปดาห์นั้น (ตัวเลขบนชิปมาจาก `draftsInRange`)
     ⇒ การ์ดคำร้องซ่อนเมื่อเปิดชิป ไม่งั้นรายการที่ขึ้นมากกว่าตัวเลขบนชิปที่คนเพิ่งกด */
  const inWithin = (row) => !within || (row.type !== 'request'
    && row.visit.scheduledDate >= within.from && row.visit.scheduledDate <= within.to);
  const showFar = farOn || !!needle || !!within;
  const listed = rows.filter((row) => {
    if (row.bucket !== bucket) return false;
    if (bucket === 'waiting') {
      if (row.group === 'far' && !showFar) return false;
      if (!inWithin(row)) return false;
    }
    if (bucket === 'scheduled' && !inQueueRange(row.visit, range, win)) return false;
    if (needle && !row.haystack.includes(needle)) return false;
    return true;
  });

  const byDateThenTime = (a, b) => (a.visit.scheduledDate || '').localeCompare(b.visit.scheduledDate || '')
    || String(a.visit.startTime || '99').localeCompare(String(b.visit.startTime || '99'))
    || String(a.code).localeCompare(String(b.code));

  let groups = [];
  if (bucket === 'waiting') {
    const tallyKeys = (items, key) => items.filter((r) => r.gateItems.some((g) => g.key === key)).length;
    for (const key of WAITING_GROUPS) {
      const items = listed.filter((r) => r.group === key)
        .sort(key === 'requests'
          ? byRequestOrder
          : (a, b) => (Number(b.stale) - Number(a.stale)) || byDateThenTime(a, b));
      if (!items.length) continue;
      let sub = '';
      if (key === 'requests') {
        // ลำดับคำบนบรรทัดย่อยเดินตามขั้นของใบ (รับเรื่อง → ลงคิว) แล้วค่อยใบที่นัดหลุด
        sub = ['acknowledge', 'queue', 'requeue']
          .map((step) => [SURVEY_QUEUE_STEP_LABELS[step], items.filter((r) => r.step === step).length])
          .filter(([, n]) => n > 0)
          .map(([label, n]) => `${label} ${n}`)
          .join(' · ');
      }
      if (key === 'ready') sub = 'ผ่านด่านครบ — ปล่อยขึ้นตารางได้เลย';
      if (key === 'ts') {
        /* ⭐ โซนที่ยังไม่จัดสรรจากใบสั่งขาย = งานของ TS ที่หน้า "งานเข้าใหม่" (ข้อสัญญาเจ้าของ TS)
           ⇒ ในกลุ่มนี้ข้อ `contract` ที่ติดมีได้แค่เหตุนั้น (ข้อสัญญาเหตุอื่นเป็นของ SA ไปอยู่ "รอฝ่ายอื่น") */
        const unallocated = tallyKeys(items, 'contract');
        sub = `ขาดเจ้าหน้าที่ ${tallyKeys(items, 'assignee')} · นอกช่วงเข้าไซต์ ${tallyKeys(items, 'access')}`
          + (unallocated ? ` · ยังไม่จัดสรรโซน ${unallocated}` : '');
      }
      if (key === 'others') {
        const owners = new Map();
        for (const r of items) for (const g of r.gateItems) if (g.owner && g.owner !== GATE_OWNERS.TS) owners.set(g.owner, (owners.get(g.owner) || 0) + 1);
        sub = `${[...owners].map(([o, n]) => `${o} ${n}`).join(' · ')} — แจ้งเจ้าของเรื่องแทนการกดซ้ำ`;
      }
      if (key === 'far') sub = 'รอบบริการสร้างร่างล่วงหน้า 90 วัน ยังไม่ต้องรีบ';
      groups.push({
        key, label: WAITING_GROUP_LABELS[key], sub,
        tone: key === 'ready' ? 'ok' : (key === 'ts' || key === 'requests') ? 'warn' : 'quiet',
        total: `${items.length} ใบ`, collapsible: key === 'others' || key === 'far', rows: items,
      });
    }
  } else if (bucket === 'overdue') {
    const byPerson = new Map();
    for (const r of listed) {
      const key = r.visit.assigneeId || '__none__';
      if (!byPerson.has(key)) byPerson.set(key, []);
      byPerson.get(key).push(r);
    }
    groups = [...byPerson.entries()].map(([key, items]) => {
      items.sort(byDateThenTime);
      const first = items[0].visit;
      const team = key === '__none__' ? '' : teamLabel(key);
      return {
        key: `od-${key}`,
        label: key === '__none__' ? 'ยังไม่มอบหมาย' : `${first.assigneeName || ''}${team ? ` · ${team}` : ''}`,
        sub: key === '__none__' ? 'นัดที่ขึ้นตารางแล้วแต่ยังไม่มีคนไป' : '',
        tone: key === '__none__' ? 'warn' : '',
        total: `${items.length} นัด`,
        personId: key === '__none__' ? null : key,
        personName: key === '__none__' ? '' : firstName(first.assigneeName),
        oldest: first.scheduledDate,
        rows: items,
      };
    }).sort((a, b) => (Number(!!a.personId) - Number(!!b.personId)) || a.oldest.localeCompare(b.oldest));
  } else if (bucket === 'scheduled') {
    const byDay = new Map();
    for (const r of [...listed].sort(byDateThenTime)) {
      const key = r.visit.scheduledDate;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(r);
    }
    groups = [...byDay.entries()].map(([date, items]) => {
      const assets = items.reduce((sum, r) => sum + (workload[r.visit.siteId]?.assets || 0), 0);
      const packs = items.reduce((sum, r) => sum + (workload[r.visit.siteId]?.packs || 0), 0);
      const n = daysBetween(win.todayIso, date);
      const prefix = n === 0 ? 'วันนี้ · ' : n === 1 ? 'พรุ่งนี้ · ' : '';
      return {
        key: `d-${date}`, label: `${prefix}${dayText(date)}`, sub: '', tone: '',
        total: `${items.length} นัด · ${assets} จุด · ${packs} แพ็ค`, rows: items,
      };
    });
  } else if (bucket === 'closed') {
    const byActual = (a, b) => (b.visit.actualDate || '').localeCompare(a.visit.actualDate || '') || String(a.code).localeCompare(String(b.code));
    const shortfall = listed.filter((r) => isShortfallVisit(r.visit)).sort(byActual);
    const done = listed.filter((r) => !isShortfallVisit(r.visit)).sort(byActual);
    if (shortfall.length) groups.push({ key: 'cl-follow', label: 'ต้องตามต่อ — ทำไม่ครบ / ทำไม่ได้', sub: '', tone: 'warn', total: `${shortfall.length} นัด`, rows: shortfall });
    if (done.length) groups.push({ key: 'cl-done', label: 'เข้าแล้ว', sub: '', tone: 'ok', total: `${done.length} นัด`, rows: done });
  }

  const flat = groups.flatMap((g) => g.rows);
  return { win, counts, rangeCounts, farCount, requestCount, groups, listedCount: flat.length, rows };
}

/** ร่างของสัปดาห์ที่ตารางเปิดอยู่ (ไม่ขึ้นกริด — ตารางบอกเป็นข้อความเท่านั้น) */
export function draftsInRange(visits = [], { from, to }, teamFilter, crewByUser) {
  return visits.filter((v) => isDraftVisit(v)
    && v.scheduledDate >= from && v.scheduledDate <= to
    && teamViewVisit(v, teamFilter, crewByUser)).length;
}

/** ช่วงวันของ "สัปดาห์" สำหรับชิป "วันเสนอ 20–26 ก.ย." — `from` เป็นวันอาทิตย์เสมอ (range7 ของตาราง · อา–ส) */
export function weekChipText(from) {
  const to = addDaysIso(from, 6);
  const [, m1, d1] = from.split('-').map(Number);
  const [, m2, d2] = to.split('-').map(Number);
  // สัปดาห์ที่คร่อมเดือน (อา. 27 ก.ย. – ส. 3 ต.ค.) ต้องบอกเดือนทั้งสองฝั่ง — "27–3 ต.ค." อ่านเป็นถอยหลัง
  if (m1 !== m2) return `วันเสนอ ${d1} ${fmtMonthShort(from)}–${d2} ${fmtMonthShort(to)}`;
  return `วันเสนอ ${d1}–${d2} ${fmtMonthShort(to)}`;
}
