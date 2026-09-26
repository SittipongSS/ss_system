// ── งานประเมินพื้นที่บนหน้าคำร้อง — ไทม์ไลน์ 6 ขั้น + แถบ "ตอนนี้" (มติเจ้าของ 25/09 เลือกแบบ A) ──
//
// ⭐ โจทย์ของเจ้าของ: *"ข้อมูลงานขาด (เช่น นัด เจ้าหน้าที่ ผล)"* — หน้าคำร้องเล่าแต่เธรด
//    ("รอ TS ตอบ · ตอบกันในเธรด") ทั้งที่ของจริงคือช่างออกไปวัดหน้างาน · ข้อมูลอยู่ในระบบครบ
//    (นัด · เวลาเริ่ม/ส่งงาน · ผู้ช่วย · รูปรายพื้นที่ · ผลที่ส่ง) แต่ไม่เคยขึ้นบนหน้านี้
//
// 🔑 **คำนวณที่นี่ที่เดียว จอแค่วาด** — ทุกตัวเลขมาจากตัวตัดสินชุดเดียวกับใบประเมิน
//    (`surveyControlView` · `surveyZoneFacts` · `surveyGateChecklist` · `surveyTotals`) ⇒ หน้าคำร้องกับ
//    ใบประเมินบอก "วัดแล้วกี่พื้นที่ ขาดอะไร" เท่ากันเสมอ
// ⚠️ **ชื่อขั้นไม่ได้เขียนที่นี่** — มาจาก `requestRailSteps` (ทะเบียน `fieldRail`) ตัวเดียวกับการ์ดของ TS
// ⚠️ ไฟล์นี้ต้อง **ไม่มี import ฝั่ง server** — จอ client เรียกตรง
import { fmtNumber, fmtTime, isoDateToWeekdayText } from '@/lib/format';
import { requestKindMeta } from '@/lib/master/requestTypes';
import { requestAssignee } from '@/lib/requests/assign';
import { requestClosure, requestClosureLine, requestClosureStarted } from '@/lib/requests/closure';
import { committedVsRequested } from '@/lib/requests/headerFacts';
import { liveDueDate } from '@/lib/requests/dueRound';
import { requestRailSteps } from '@/lib/requests/requestRail';
import { requestSideLabel, requestWaitLabel } from '@/lib/requests/replyTurn';
import { accessWindowText } from './sites';
import { dayText, daysBetween, relDayText, thaiDayOf } from './queueWords';
import {
  surveyChangeCounts, surveyChangeText, surveyGateChecklist, surveyTotals,
} from './survey';
import { surveyControlView, surveySendBackAskText, surveyZoneFacts } from './surveyControl';
import { VISIT_STATUS_LABELS, holdsRequestSlot, isClosedVisit } from './visitStatus';

const join = (...parts) => parts.flat().filter(Boolean).join(' · ');
const clock = (value) => {
  if (!value) return '';
  const text = fmtTime(value);
  return text === '-' ? '' : text;
};
/** "พ. 23 ก.ย. 14:50" จาก timestamp — วันไทยเสมอ (ไม่ใช่วัน UTC ของเครื่อง) */
export const stampText = (timestamp) => {
  const day = thaiDayOf(timestamp);
  return day ? `${dayText(day)} ${clock(timestamp)}`.trim() : '';
};
/** "จ. 28 ก.ย. 10:00" จากวัน + เวลา (ช่องแยกกันบนนัด) */
const dayTime = (date, time) => (date ? `${dayText(date)}${clock(time) ? ` ${clock(time)}` : ''}` : '');
/** "พ. 23 ก.ย. 2026" — ช่องข้อเท็จจริงที่ต้องมีปี */
const dayYear = (date) => (date ? isoDateToWeekdayText(String(date).slice(0, 10)) : '');
const num = (value) => fmtNumber(value, { maximumFractionDigits: 2 });

const reachedSite = (visit) => isClosedVisit(visit) && visit?.status !== 'unable';

/** ชื่อผู้ช่วยจากทะเบียนคน — ไม่รู้จัก = บอกตรง ๆ ไม่ใช่ id ดิบ (กติกาเดียวกับหน้าจัดคิว) */
function helperNames(visit, people = [], peopleLoading = false) {
  const ids = (Array.isArray(visit?.assistantIds) ? visit.assistantIds : [])
    .filter((id) => id && id !== visit?.assigneeId);
  const byId = new Map((people || []).map((p) => [String(p.id), p]));
  return ids.map((id) => {
    const person = byId.get(String(id));
    if (person?.name) return person.name;
    return peopleLoading ? 'กำลังโหลดชื่อ…' : 'เจ้าหน้าที่ที่ไม่อยู่ในรายชื่อแล้ว';
  });
}

/** ช่วงเวลาที่อยู่หน้างานจริง — "จ. 28 ก.ย. 10:12–11:48" (ข้ามวันเขียนวันที่ปลายด้วย) */
function onSiteText(visit) {
  if (!visit?.actualStartTime && !visit?.actualEndTime) return '';
  const day = visit.actualDate || visit.scheduledDate;
  const start = clock(visit.actualStartTime);
  const end = clock(visit.actualEndTime);
  const endDay = visit.actualEndDate && visit.actualEndDate !== day ? visit.actualEndDate : null;
  if (!end) return `${dayText(day)} ${start}`.trim();
  if (endDay) return `${dayText(day)} ${start} – ${dayText(endDay)} ${end}`;
  return `${dayText(day)} ${start ? `${start}–` : ''}${end}`;
}

/* ── ขั้นของงานตอนนี้ (ละเอียดกว่ารางหกขั้น — แถบ "ตอนนี้" ต้องแยก นัดแล้ว / เลยวันนัด / กำลังวัด …) ── */
function stageOf(request, visit, control, today, { filesUnknown = false, sendBack = null } = {}) {
  if (request.cancelledAt || request.status === 'cancelled') return 'cancelled';
  if (request.status === 'draft') return 'draft';
  if (request.status === 'pending') return 'pending';
  const sent = !!request.answeredAt;
  if (request.status === 'closed') return sent ? 'closed' : 'closed-unassessed';
  if (sent) return 'sent';
  if (request.closedAt) return 'closed-early';
  /* 🔴 **อ่านรูปไม่สำเร็จ = ไม่รู้ว่าวัดไปเท่าไร** — ตัวตัดสินทุกตัวนับรูปจาก `filesByZone` ที่ว่างเปล่า
     แล้วจะตอบว่า "วัดแล้ว 0" ⇒ ขั้นต้องมาจากนัดอย่างเดียว (กติกา อ่านพลาด = ไม่ทราบ ไม่ใช่ ไม่มี) */
  const key = filesUnknown && control?.status?.key !== 'recalled' ? null : control?.status?.key;
  if (key === 'no-zones') return key;
  /* ⚠️ **งานหน้างานมาก่อนแถว "ดึงกลับ"** — ใบที่ถูกดึงกลับแล้วช่างกำลังวัดใหม่ (RQ-AS-26090188: ถูกดึงกลับ
     เพราะตอบด้วยปุ่มกลางตอนยังไม่มีผลวัด) ถ้าขึ้น "ดึงผลกลับมาแก้ — หัวหน้าแก้ผลแล้วส่งอีกครั้ง" คือชี้ผิดคน
     ⇒ "ดึงกลับ" เป็นขั้นของงานเฉพาะเมื่อช่างวัดเสร็จแล้ว · ก่อนหน้านั้นเป็นป้ายบนขั้นส่งผล (ประวัติ) */
  if (visit?.status === 'in_progress') {
    if (key === 'ready') return 'ready';
    return key === 'awaiting-submit' ? 'awaiting-submit' : 'measuring';
  }
  if (reachedSite(visit)) {
    if (key === 'recalled') return key;
    /* 🐞 **ส่งกลับที่ค้างมาก่อนของขาด** (แผน §10.5 S4 · ม็อก A-5/AW-2) — หัวหน้าส่งกลับได้แม้ฝั่งช่างครบแล้ว
       (ขอรูปเพิ่ม) · เดิมขั้นดูของขาดก่อน ⇒ ช่างครบ = "รอหัวหน้าเคาะ"/"พร้อมส่งผล" ตาหัวหน้า ทั้งที่คนที่ต้อง
       ขยับคือช่าง · ⚠️ "ดึงกลับ" ยังมาก่อน — ใบที่ถูกดึงกลับ ตาหัวหน้าแก้ผลแล้วส่งอีกครั้ง */
    if (sendBack?.pending) return 'sent-back';
    if (key === 'ready') return key;
    /* 🐞 **ช่างส่งงานแล้ว (นัดปิด) แต่ของฝั่งช่างยังขาด** — ปุ่ม "ส่งงาน" ไม่มีแล้ว ⇒ ห้ามบอกให้ช่างกดส่งงาน
       ตาเป็นของหัวหน้า (ส่งกลับให้ช่างแก้ · ตัดพื้นที่) · ส่งกลับไปแล้ว = ตาช่างกด "แจ้งหัวหน้าว่าแก้แล้ว" (มติ 22/09) */
    if (key === 'measuring') return 'crew-gaps';
    return 'awaiting-decision';
  }
  if (visit?.status === 'draft') return 'visit-draft';
  if (visit?.status === 'scheduled') {
    return today && visit.scheduledDate && visit.scheduledDate < today ? 'overdue' : 'scheduled';
  }
  return visit ? 'requeue' : 'queue';
}

const STAGE_BADGE = {
  cancelled: { label: 'ยกเลิก', tone: 'neutral' },
  draft: { label: 'ร่าง', tone: 'neutral' },
  pending: { label: 'รอรับเรื่อง', tone: 'warning' },
  queue: { label: 'รอลงคิว', tone: 'warning' },
  requeue: { label: 'ต้องลงคิวใหม่', tone: 'warning' },
  'visit-draft': { label: 'นัดยังไม่ขึ้นตาราง', tone: 'warning' },
  scheduled: { label: 'นัดแล้ว', tone: 'info' },
  overdue: { label: 'เลยวันนัด', tone: 'danger' },
  measuring: { label: 'กำลังวัดหน้างาน', tone: 'info' },
  'awaiting-submit': { label: 'วัดครบ — รอช่างส่งงาน', tone: 'info' },
  'awaiting-decision': { label: 'รอหัวหน้าเคาะ', tone: 'info' },
  ready: { label: 'พร้อมส่งผล', tone: 'info' },
  recalled: { label: 'ดึงผลกลับมาแก้', tone: 'warning' },
  'crew-gaps': { label: 'ของหน้างานยังขาด', tone: 'warning' },
  'sent-back': { label: 'ส่งกลับให้ช่างแก้', tone: 'warning' },
  'no-zones': { label: 'ไม่มีพื้นที่ให้ประเมิน', tone: 'neutral' },
  sent: { label: 'ส่งผลให้ฝ่ายขายแล้ว', tone: 'success' },
  closed: { label: 'ปิดเรื่องแล้ว', tone: 'success' },
  'closed-unassessed': { label: 'ปิดโดยไม่ได้ประเมิน', tone: 'neutral' },
  'closed-early': { label: 'ฝ่ายขายปิดก่อนได้ผล', tone: 'neutral' },
};

/** "ส่งผลภายใน" — วันที่ TS รับปาก ถ้ายังไม่มีถอยไปวันที่ผู้ขอต้องการ (บอกให้รู้ว่าเป็นของใคร) */
function dueOf(request, today) {
  const committed = String(request.committedResultDate || '').trim();
  const wanted = String(request.requestedResultDate || '').trim();
  const date = committed || wanted;
  if (!date) return { label: 'ส่งผลภายใน', value: '', badge: null, note: `${request.dept || 'TS'} ยังไม่ได้แจ้งวันส่งผล` };
  const sentDay = thaiDayOf(request.answeredAt);
  if (sentDay) {
    const early = daysBetween(sentDay, date);
    return {
      label: committed ? 'ส่งผลภายใน' : 'ผู้ขอต้องการผล',
      value: dayYear(date),
      badge: early > 0
        ? { text: `ส่งแล้ว ก่อนกำหนด ${early} วัน`, tone: 'success' }
        : early === 0
          ? { text: 'ส่งแล้ว ตรงกำหนด', tone: 'success' }
          : { text: `ส่งแล้ว ช้ากว่ากำหนด ${-early} วัน`, tone: 'warning' },
      note: `ส่งจริง ${stampText(request.answeredAt)}`,
    };
  }
  const rel = today ? relDayText(date, today, 'เลยกำหนด') : null;
  const gap = committed && wanted ? committedVsRequested(committed, wanted) : null;
  return {
    label: committed ? 'ส่งผลภายใน' : 'ผู้ขอต้องการผล',
    value: dayYear(date),
    badge: rel?.text ? { text: rel.text, tone: rel.tone === 'warn' ? 'danger' : 'info' } : null,
    note: committed
      ? (gap ? (gap.text === 'ตรงกับที่ขอ' ? 'ตรงกับที่ผู้ขอต้องการ' : gap.text) : '')
      : `${request.dept || 'TS'} ยังไม่ได้แจ้งวันส่งผล`,
  };
}

/* ── ตารางพื้นที่ ─────────────────────────────────────────────────────────────── */
const partText = (part) => {
  const dims = [part?.widthM, part?.lengthM, part?.heightM].map(Number);
  if (dims.some((d) => !Number.isFinite(d) || d <= 0)) return '';
  return `${dims.map(num).join(' × ')} ม.`;
};

function sizeText(parts) {
  const list = (Array.isArray(parts) ? parts : []).map((part) => ({ label: part?.label, text: partText(part) }))
    .filter((part) => part.text);
  if (!list.length) return '';
  if (list.length === 1) return list[0].text;
  return list.map((part, i) => `${String(part.label || '').trim() || `ส่วน ${i + 1}`} ${part.text}`).join(' + ');
}

function zoneRows(zones, filesByZone, { sent, filesUnknown = false }) {
  return zones.map((zone) => {
    const facts = surveyZoneFacts(zone, filesByZone[zone.id] || []);
    let state;
    if (facts.cut) state = { label: 'ตัดออก', tone: 'neutral' };
    else if (sent || filesUnknown) state = null;
    else if (facts.crewComplete) state = { label: 'ครบฝั่งช่าง', tone: 'success' };
    else if (!facts.measuredParts && !facts.photos.wide && !facts.spotsTotal) state = { label: 'ยังไม่วัด', tone: 'warning' };
    else state = { label: 'ยังไม่ครบ', tone: 'warning' };
    return {
      id: zone.id,
      code: facts.zoneCode,
      codeUnknown: facts.zoneCodeUnknown,
      name: facts.zoneName,
      floor: zone.floor || zone.zoneFloor || null,
      added: zone.status === 'added',
      cut: facts.cut,
      cutReason: facts.cutReason,
      size: sizeText(zone.parts),
      areaSqm: facts.measuredParts ? facts.areaSqm : null,
      volumeCbm: facts.measuredParts ? facts.volumeCbm : null,
      /* null = อ่านรูปไม่สำเร็จ (จอเขียน "ไม่ทราบ") — ไม่ใช่ 0 รูป */
      photosWide: filesUnknown ? null : facts.photos.wide,
      photosPlan: filesUnknown ? null : facts.photos.plan,
      spotsTotal: facts.spotsTotal,
      spotsSelected: facts.spotsSelected,
      suggested: facts.measuredParts ? facts.suggestedPackages : null,
      packageQty: facts.packageQty,
      packageNote: String(zone.packageNote || '').trim() || null,
      state,
      missingText: facts.cut || filesUnknown ? null : facts.missingText,
      /* หมายเหตุของพื้นที่ — ของผู้ขอ (พื้นที่ใหม่) หรือของช่างหน้างาน · ฝ่ายขายเปิดใบประเมินไม่ได้ ⇒ ต้องอ่านได้ที่นี่ */
      note: String(zone.note || '').trim() || null,
    };
  });
}

function gateCard(gates, owner) {
  const list = gates.filter((g) => g.owner === owner);
  /* ⚠️ ถูกตัดออกหมดทุกพื้นที่ = ด่านนับ 0/0 แล้วตอบ "ผ่าน" — ห้ามขึ้นเขียว "ครบ" บนใบที่ส่งผลไม่ได้ */
  const hasActive = list.some((g) => g.total > 0);
  return {
    items: list.map((g) => ({ key: g.key, label: g.short || g.label, ok: g.ok, done: g.done, total: g.total, zones: g.zones })),
    hasActive,
    ok: hasActive && list.every((g) => g.ok),
    labels: list.map((g) => g.short || g.label),
  };
}

/* ── ข้อเท็จจริงรายวัน 6 ช่อง (การ์ดรายละเอียดคำร้อง) ─────────────────────────────────── */
function dateFacts(request, visit, today, assignee, { finished = false } = {}) {
  const copy = requestKindMeta(request.kind)?.form || {};
  const dept = request.dept || 'TS';
  const wanted = String(request.requestedDueDate || '').trim();
  const committed = liveDueDate(request) || '';
  const wantedResult = String(request.requestedResultDate || '').trim();
  const committedResult = String(request.committedResultDate || '').trim();
  /* 🐞 **นัดเลยวันแล้วยังขึ้นเขียว "ตรงกับที่ขอ"** (RQ-AS-26090190 · นัด 24/09 ค้าง "นัดไว้" ถึง 25/09) —
     ของเดิมเทียบวันนัดกับวันที่ขออย่างเดียว ไม่ดูว่าวันนั้นผ่านไปแล้วและช่างยังไม่ได้ไป */
  const visitDate = visit?.scheduledDate || committed;
  const notReached = visit && holdsRequestSlot(visit) && visit.status !== 'in_progress';
  /* ⚠️ ใบที่ฝั่งไหนปิดแล้ว/ยกเลิกแล้ว ไม่มีวันให้ทวง (ม-145 · `requestClosureStarted`) */
  const lateBy = !finished && notReached && today && visitDate && visitDate < today ? daysBetween(visitDate, today) : 0;
  const visitSub = lateBy > 0
    ? { text: `เลยวันนัดมา ${lateBy} วัน — ยังไม่เริ่มงาน`, tone: 'late' }
    : reachedSite(visit) || visit?.status === 'in_progress'
      ? { text: `เข้าพื้นที่ ${dayText(visit.actualDate || visit.scheduledDate)}`, tone: 'ok' }
      : visit && !holdsRequestSlot(visit)
        ? { text: `นัด ${visit.code || ''} ${VISIT_STATUS_LABELS[visit.status] || visit.status}`.replace('  ', ' '), tone: 'late' }
        : committed && wanted && !finished ? committedVsRequested(committed, wanted) : null;
  const sentDay = thaiDayOf(request.answeredAt);
  const resultSub = sentDay && committedResult
    ? (() => {
      const early = daysBetween(sentDay, committedResult);
      return {
        text: `ส่งแล้ว ${dayText(sentDay)} · ${early > 0 ? `ก่อนกำหนด ${early} วัน` : early === 0 ? 'ตรงกำหนด' : `ช้ากว่ากำหนด ${-early} วัน`}`,
        tone: early >= 0 ? 'ok' : 'late',
      };
    })()
    : committedResult && wantedResult ? committedVsRequested(committedResult, wantedResult) : null;
  return [
    {
      key: 'submitted',
      label: 'ส่งเมื่อ',
      value: request.submittedAt ? join(dayYear(thaiDayOf(request.submittedAt)), clock(request.submittedAt)) : 'ยังไม่ได้ส่ง',
      sub: request.requestedByName || null,
    },
    {
      key: 'requestedDue',
      label: `ผู้ขอ: ${copy.dueLabel || 'วันที่ต้องการ'}`,
      value: wanted ? join(dayYear(wanted), clock(request.requestedDueTime)) : '',
      sub: null,
    },
    {
      key: 'requestedResultDue',
      label: `ผู้ขอ: ${copy.resultDueLabel || 'วันที่ต้องการรับผล'}`,
      value: wantedResult ? dayYear(wantedResult) : '',
      sub: null,
    },
    {
      key: 'assignee',
      label: 'ผู้รับผิดชอบ',
      value: assignee.name || '',
      sub: request.acknowledgedByName && request.acknowledgedByName !== assignee.name
        ? `รับเรื่องโดย ${request.acknowledgedByName}` : null,
    },
    {
      key: 'committedDue',
      label: `${dept}: ${copy.committedDueLabel || 'วันกำหนดส่ง'}`,
      value: committed ? join(dayYear(visit?.scheduledDate || committed), clock(visit?.startTime || request.committedDueTime)) : '',
      sub: committed ? visitSub?.text || null : `${dept} ยังไม่ได้ลงคิว`,
      tone: committed ? visitSub?.tone || null : 'muted',
    },
    {
      key: 'committedResultDue',
      label: `${dept}: ${copy.committedResultLabel || 'วันส่งผล'}`,
      value: committedResult ? dayYear(committedResult) : '',
      sub: committedResult ? resultSub?.text || null : `${dept} ยังไม่ได้แจ้งวันส่งผล`,
      tone: committedResult ? resultSub?.tone || null : 'muted',
    },
  ];
}

/**
 * 🔑 ทุกอย่างที่หน้าคำร้องประเมินพื้นที่วาด (หัวใบ · ไทม์ไลน์ · แถบตอนนี้ · ตารางพื้นที่ · ช่องวันที่)
 *
 * @param request     ใบจาก GET `/api/sa/requests/[id]` — มี `surveyZones` · `surveySite` · `surveyVisit` ·
 *                    `surveyVisits` · `surveyFilesByZone` · `surveyRecall` · `surveySendBack` · `surveyUnknown`
 * @param today       วันไทยวันนี้ `YYYY-MM-DD` (เปลือกจับใน effect) — `null` = ยังไม่รู้ ไม่นับเลยกำหนด
 * @param viewer      `{ canDecide, isOpener, isRequesterSide }` — ส่งผลได้ไหม · เป็นคนเปิดใบเองไหม · อยู่ฝั่งผู้ขอไหม
 * @param people      ทะเบียนคน `[{ id, name }]` (ชื่อผู้ช่วยบนนัด) · `peopleLoading` = ยังโหลดไม่เสร็จ
 */
export function surveyJobView({
  request = null, today = null, viewer = {}, people = [], peopleLoading = false,
} = {}) {
  if (!request) return null;
  const visit = request.surveyVisit || null;
  const visits = Array.isArray(request.surveyVisits) ? request.surveyVisits : (visit ? [visit] : []);
  const zones = Array.isArray(request.surveyZones) ? request.surveyZones : [];
  const unknown = request.surveyUnknown || {};
  const filesByZone = request.surveyFilesByZone && typeof request.surveyFilesByZone === 'object'
    ? request.surveyFilesByZone : {};
  const control = surveyControlView({
    request,
    zones,
    filesByZone,
    visit,
    recall: request.surveyRecall || null,
    sendBack: request.surveySendBack ?? null,
    unknown: { recall: unknown.recall, sendBack: unknown.sendBack },
    viewer: { canWrite: false, canDecide: viewer.canDecide === true, canOpenRequest: true },
    tab: 'result',
    today,
  });
  const filesUnknown = unknown.files === true;
  const stage = stageOf(request, visit, control, today, { filesUnknown, sendBack: request.surveySendBack || null });
  const sent = !!request.answeredAt;
  /* ใบจบแล้ว (ยกเลิก · ปิด · ฝั่งไหนปิดก่อน) = ไม่มีวันให้ทวง ไม่มีคำสั่งให้ใครทำต่อ (ม-145) */
  const finished = ['closed', 'closed-unassessed', 'cancelled', 'closed-early'].includes(stage)
    || (!sent && requestClosureStarted(request));
  /* นัดที่ไม่ได้เข้าพื้นที่และไม่มีชีวิตแล้ว (ทำไม่ได้ · ยกเลิก · เลื่อนแล้ว) — เป็น **ประวัติ** เสมอ */
  const visitDead = !!visit && !holdsRequestSlot(visit) && !reachedSite(visit);
  const dept = request.dept || 'TS';
  const assignee = requestAssignee(request);
  const helpers = helperNames(visit, people, peopleLoading);
  const totals = surveyTotals(zones);
  const progress = control.progress;
  const closure = requestClosure(request);
  const closureLine = requestClosureLine(request);
  const requesterLabel = requestSideLabel(request, 'requester');
  const totalsText = join(
    `${fmtNumber(totals.zones)} พื้นที่`,
    `${num(totals.areaSqm)} ตร.ม.`,
    `${fmtNumber(totals.packageQty)} แพ็คเกจ`,
  );
  const visitWhen = visit ? dayTime(visit.scheduledDate, visit.startTime) : '';
  const lateBy = stage === 'overdue' ? daysBetween(visit.scheduledDate, today) : 0;
  const unableRounds = visits.filter((v) => v.status === 'unable').length;
  const measuredText = !progress.total ? ''
    : filesUnknown ? 'วัดแล้วกี่พื้นที่ ไม่ทราบ (อ่านรูปไม่สำเร็จ)'
      : `วัดแล้ว ${progress.done} / ${progress.total} พื้นที่`;

  /* ── หกขั้น — ชื่อจากราง (ทะเบียน) · เนื้อจากใบจริง ─────────────────────────── */
  const rail = requestRailSteps(request, { visit });
  const index = stage === 'closed' || stage === 'closed-unassessed' ? rail.steps.length : rail.index;
  const byId = Object.fromEntries(rail.steps.map((step) => [step.id, step]));
  const person = (name, note = null) => (name ? { name, note } : null);
  const requeue = stage === 'requeue';
  const steps = [];

  steps.push({
    id: 'draft',
    when: request.submittedAt ? stampText(request.submittedAt) : 'ยังไม่ได้ส่ง',
    people: [person(request.requestedByName, request.team ? `ทีม ${request.team}` : null)],
    lines: [join(
      request.requestedDueDate && `ขอเข้า ${dayTime(request.requestedDueDate, request.requestedDueTime)}`,
      request.requestedResultDate && `ขอผล ${dayText(request.requestedResultDate)}`,
    )],
  });
  steps.push({
    id: 'pending',
    when: request.acknowledgedAt ? stampText(request.acknowledgedAt) : `รอ ${dept} รับเรื่อง`,
    people: [person(request.acknowledgedByName, request.acknowledgedAt ? dept : null)],
    lines: [assignee.name && request.acknowledgedAt ? `ผู้รับผิดชอบ ${assignee.name}` : null],
  });
  const queueStep = {
    id: 'commitDue',
    when: visit
      ? stampText(request.dueCommittedAt || visit.createdAt)
      : request.acknowledgedAt && !finished ? `รอ ${dept} ลงคิว` : '',
    people: [visit ? person(visit.createdByName) : null],
    visitLink: visit ? { id: visit.id, code: visit.code } : null,
    lines: [],
  };
  if (visit) {
    queueStep.lines.push(visitWhen);
    if (visitDead) {
      /* นัดที่ตายแล้ว — บอกว่าเกิดอะไร ไม่ชม "ตรงกับที่ขอ" · ใบยังเดินอยู่ = ต้องลงคิวใหม่ */
      queueStep.lines.push({
        text: join(VISIT_STATUS_LABELS[visit.status] || visit.status, visit.unableReason && `เพราะ ${visit.unableReason}`),
        tone: 'late',
      });
      if (requeue) queueStep.badge = { label: 'ต้องลงคิวใหม่', tone: 'warning' };
    } else {
      const liveDue = liveDueDate(request);
      const gap = liveDue && request.requestedDueDate ? committedVsRequested(liveDue, request.requestedDueDate) : null;
      if (gap && stage !== 'overdue' && !finished) queueStep.lines.push({ text: gap.text, tone: gap.tone });
    }
  } else if (request.acknowledgedAt && !finished) {
    queueStep.lines.push('เลือกวัน เวลา และเจ้าหน้าที่ที่จะไป');
  }
  if (unableRounds && !(visitDead && visit.status === 'unable' && unableRounds === 1)) {
    queueStep.lines.push(`เคยไปแล้วเข้าไม่ได้ ${unableRounds} รอบ`);
  }
  steps.push(queueStep);

  const visitStep = { id: 'acknowledged', people: [], lines: [] };
  if (visit) {
    visitStep.people = [
      person(visit.assigneeName),
      ...helpers.map((name) => person(name, 'ช่วย')),
    ];
    if (visitDead) {
      visitStep.badge = { label: VISIT_STATUS_LABELS[visit.status] || visit.status, tone: visit.status === 'unable' ? 'warning' : 'neutral' };
      visitStep.when = `นัด ${visitWhen}`;
      visitStep.lines.push(visit.unableReason ? `ไม่ได้เข้าพื้นที่ — ${visit.unableReason}` : 'ไม่ได้เข้าพื้นที่');
    } else if (visit.status === 'in_progress') {
      visitStep.badge = { label: 'กำลังทำ', tone: 'info' };
      visitStep.when = `เริ่มงาน ${dayTime(visit.actualDate || visit.scheduledDate, visit.actualStartTime)}`;
      visitStep.lines.push(join(measuredText, 'ยังไม่ส่งงาน'));
    } else if (reachedSite(visit)) {
      visitStep.badge = { label: VISIT_STATUS_LABELS[visit.status], tone: visit.status === 'done' ? 'success' : 'warning' };
      visitStep.when = onSiteText(visit) || dayText(visit.actualDate || visit.scheduledDate);
      visitStep.lines.push(join(
        visit.actualEndTime && `ส่งงาน ${clock(visit.actualEndTime)}`,
        !filesUnknown && progress.total && `วัดครบ ${progress.done} / ${progress.total} พื้นที่`,
      ));
    } else if (finished) {
      /* ใบปิดไปแล้วแต่นัดยังค้าง (ปิดใบโดยไม่ได้ประเมินไม่ยกเลิกนัดให้) — บอกให้ไปเก็บ ไม่ใช่สั่งให้เริ่มงาน */
      visitStep.badge = { label: VISIT_STATUS_LABELS[visit.status] || visit.status, tone: 'neutral' };
      visitStep.when = `นัด ${visitWhen}`;
      visitStep.lines.push('ใบปิดแล้ว — นัดยังค้างบนตาราง ยกเลิกได้ที่หน้าจัดคิว');
    } else if (visit.status === 'draft') {
      visitStep.badge = { label: 'ยังไม่ขึ้นตาราง', tone: 'warning' };
      visitStep.when = `นัด ${visitWhen}`;
      visitStep.lines.push('รอผู้วางคิวปล่อยขึ้นตาราง');
    } else if (stage === 'overdue') {
      visitStep.badge = { label: 'เลยวันนัด', tone: 'danger' };
      visitStep.when = `นัด ${visitWhen}`;
      visitStep.lines.push({ text: `เลยมา ${lateBy} วัน — ยังไม่เริ่มงาน`, tone: 'late' });
    } else {
      const rel = today ? relDayText(visit.scheduledDate, today, 'เลยนัด') : null;
      visitStep.badge = { label: 'นัดไว้', tone: 'neutral' };
      visitStep.when = join(`นัด ${visitWhen}`, rel?.text);
      visitStep.lines.push('เจ้าหน้าที่กด “เริ่มงาน” เมื่อถึงไซต์');
    }
  } else {
    visitStep.when = request.acknowledgedAt && !finished ? 'หลังลงคิว' : '';
  }
  steps.push(visitStep);

  const recallPending = control.flags?.recallPending;
  const due = dueOf(request, today);
  const sendStep = { id: 'answered', people: [], lines: [] };
  if (sent) {
    sendStep.when = stampText(request.answeredAt);
    sendStep.people = [person(request.answeredByName)];
    sendStep.lines.push(totalsText);
    if (due.badge?.tone === 'success' || due.badge?.tone === 'warning') {
      sendStep.lines.push({ text: due.badge.text.replace(/^ส่งแล้ว /, ''), tone: due.badge.tone === 'success' ? 'ok' : 'late' });
    }
  } else if (finished) {
    sendStep.when = '';
    sendStep.badge = stage === 'cancelled' ? null : { label: 'ไม่ได้ประเมิน', tone: 'neutral' };
    sendStep.skipped = stage !== 'cancelled';
    sendStep.lines.push(stage === 'cancelled' ? 'ยกเลิกก่อนมีผล' : 'ปิดใบก่อนมีผล');
  } else {
    /* ⚠️ วันของใคร — ยังไม่มีวันของ TS = วันที่ผู้ขอต้องการ (คำเดียวกับแถบตอนนี้ · `dueOf`) */
    sendStep.when = due.value
      ? join(`${request.committedResultDate ? 'ภายใน' : 'ผู้ขอต้องการ'} ${dayText(request.committedResultDate || request.requestedResultDate)}`, due.badge?.text)
      : '';
    sendStep.people = [person(`หัวหน้า ${dept}`)];
    if (recallPending) {
      sendStep.badge = { label: 'ดึงกลับมาแก้', tone: 'warning' };
      sendStep.lines.push(join(
        control.recall?.at && `ดึงกลับ ${stampText(control.recall.at)}`,
        control.recall?.byName && `โดย ${control.recall.byName}`,
      ));
    } else {
      sendStep.lines.push('เคาะภาพผัง · จุดติดตั้ง · แพ็คเกจ แล้วส่งผลให้ฝ่ายขาย');
    }
  }
  steps.push(sendStep);

  const closeStep = { id: 'closed', people: [person(request.requestedByName)], lines: [] };
  if (closure.complete) {
    closeStep.when = stampText(request.closedAt) || '';
    closeStep.people = [person(request.closedByName || request.requestedByName)];
    closeStep.lines.push(stage === 'closed-unassessed' ? 'ปิดโดยไม่ได้ประเมิน' : closureLine?.text || 'ปิดครบสองฝั่งแล้ว');
  } else if (sent) {
    closeStep.badge = { label: `ปิดแล้ว ${closureLine?.done ?? 1}/2`, tone: 'warning' };
    closeStep.when = `รอตั้งแต่ ${stampText(request.answeredAt)}`;
    closeStep.lines.push(`${dept} ปิดฝั่งแล้ว ${dayText(thaiDayOf(request.answeredAt))} · เหลือฝั่ง ${requesterLabel}`);
  } else if (stage === 'cancelled') {
    closeStep.badge = { label: 'ยกเลิก', tone: 'neutral' };
    closeStep.when = stampText(request.cancelledAt);
    closeStep.lines.push(request.cancelReason ? `เหตุผล: ${request.cancelReason}` : 'ยกเลิกแล้ว');
  } else {
    closeStep.when = 'หลังได้รับผล';
    closeStep.lines.push('ต้องปิดทั้งสองฝั่งถึงจะจบ');
  }
  steps.push(closeStep);

  const cancelledAt = stage === 'cancelled' ? (request.acknowledgedAt ? 2 : 1) : null;
  const timeline = steps.map((step, i) => {
    let state = i < index ? 'done' : i === index ? 'current' : 'pending';
    if (cancelledAt != null) state = i < cancelledAt ? 'done' : 'pending';
    if (stage === 'cancelled' && step.id === 'closed') state = 'cancelled';
    if (step.skipped) state = 'skipped';
    /* 🐞 **ขั้นที่ไม่เคยเกิดห้ามติ๊กผ่าน** — ใบที่ปิด/ส่งผลโดยไม่เคยลงคิว หรือไม่เคยเข้าพื้นที่ ได้ ✓ ทั้งแถว
       เพราะ index ชี้ท้ายราง ⇒ ขั้นที่ผ่านไปแล้วแต่ไม่มีของจริง = "ข้าม" */
    if (state === 'done' && step.id === 'commitDue' && (!visit || byId.commitDue?.state === 'pending')) state = 'skipped';
    if (state === 'done' && step.id === 'acknowledged' && !reachedSite(visit) && visit?.status !== 'in_progress') state = 'skipped';
    const skippedEmpty = state === 'skipped' && !step.when && !(step.lines || []).length;
    return {
      ...step,
      when: skippedEmpty ? (step.id === 'commitDue' ? 'ไม่เคยลงคิว' : step.id === 'acknowledged' ? 'ไม่ได้เข้าพื้นที่' : '') : step.when,
      number: i + 1,
      label: byId[step.id]?.label || step.id,
      state,
      people: (step.people || []).filter(Boolean),
      lines: (step.lines || []).filter((line) => (typeof line === 'string' ? line : line?.text))
        .map((line) => (typeof line === 'string' ? { text: line, tone: null } : line)),
    };
  });
  const current = timeline.find((step) => step.state === 'current') || null;

  /* ── แถบ "ตอนนี้" ─────────────────────────────────────────────────────────── */
  const crewWho = visit?.assigneeName ? `เจ้าหน้าที่ ${visit.assigneeName}` : `เจ้าหน้าที่ ${dept}`;
  const crewNote = join(
    helpers.length && `ช่วย ${helpers.join(', ')}`,
    visit?.actualStartTime && `เริ่มงาน ${clock(visit.actualStartTime)}`,
  );
  const leftGaps = (control.zoneGaps?.rows || []).filter((row) => row.crew.length);
  const gapText = leftGaps.length === 1 ? `ขาด: ${leftGaps[0].crew.join(' · ')}` : '';
  const sendBackAsk = surveySendBackAskText(request.surveySendBack?.sentBack);
  const headWho = `หัวหน้า ${dept}`;
  const requesterWho = viewer.isOpener ? 'คุณ' : (request.requestedByName || requesterLabel);
  const nowByStage = {
    draft: {
      headline: 'ยังไม่ส่งคำร้อง',
      sub: `ส่งแล้ว ${dept} จะรับเรื่องและลงคิวเข้าพื้นที่`,
      next: 'กด “ส่งคำร้อง” เมื่อกรอกครบ',
      turn: { side: requesterLabel, who: requesterWho },
    },
    pending: {
      headline: `รอ ${dept} รับเรื่อง`,
      sub: join(request.submittedAt && `ส่งเมื่อ ${stampText(request.submittedAt)}`),
      next: `${dept} รับเรื่อง แล้วลงคิววัน เวลา และเจ้าหน้าที่ที่จะไป`,
      turn: { side: dept, who: `ผู้วางคิว ${dept}` },
    },
    queue: {
      headline: 'รอลงคิวเข้าพื้นที่',
      sub: join(
        request.acknowledgedByName && `รับเรื่องแล้วโดย ${request.acknowledgedByName}`,
        request.requestedDueDate && `ผู้ขออยากให้เข้า ${dayTime(request.requestedDueDate, request.requestedDueTime)}`,
      ),
      next: `${dept} เลือกวัน เวลา และเจ้าหน้าที่ แล้วกด “ลงคิวเข้าพื้นที่”`,
      turn: { side: dept, who: assignee.name || `ผู้วางคิว ${dept}` },
    },
    requeue: {
      headline: 'ต้องลงคิวใหม่',
      sub: visit ? join(`${visit.code || 'นัดเดิม'} ${VISIT_STATUS_LABELS[visit.status] || visit.status}`, visit.unableReason) : '',
      next: `${dept} ลงคิวใหม่ — เลือกวันและเจ้าหน้าที่อีกครั้ง`,
      turn: { side: dept, who: assignee.name || `ผู้วางคิว ${dept}` },
    },
    'visit-draft': {
      headline: 'นัดยังไม่ขึ้นตาราง',
      sub: join(visit?.code, visitWhen, 'รอผู้วางคิวปล่อยขึ้นตาราง'),
      next: `ผู้วางคิว ${dept} ปล่อยนัดขึ้นตารางที่หน้าจัดคิว`,
      turn: { side: dept, who: `ผู้วางคิว ${dept}` },
    },
    scheduled: {
      headline: `นัดเข้าพื้นที่ ${visitWhen}`,
      sub: join(visit?.code, today && visit?.scheduledDate ? relDayText(visit.scheduledDate, today, 'เลยนัด').text : ''),
      next: 'ถึงวันนัด เจ้าหน้าที่กด “เริ่มงาน” ที่ใบประเมิน แล้ววัดทีละพื้นที่',
      turn: { side: dept, who: crewWho, note: crewNote },
    },
    overdue: {
      headline: `เลยวันนัดมา ${lateBy} วัน — ยังไม่เริ่มงาน`,
      sub: join(visit?.code && `นัด ${visit.code} ${visitWhen}`, 'สถานะยังเป็น “นัดไว้”'),
      next: `${dept} ยืนยันว่าเข้าพื้นที่แล้ว (กด “เริ่มงาน”) หรือเลื่อนนัด`,
      turn: { side: dept, who: crewWho, note: crewNote },
    },
    measuring: {
      headline: `กำลังวัดหน้างาน${measuredText && !filesUnknown ? ` — ${measuredText}` : ''}`,
      sub: filesUnknown ? measuredText : join(progress.leftText && `เหลือ ${progress.leftText}`, gapText),
      next: `ช่างวัดพื้นที่ที่เหลือแล้วกด “ส่งงาน” → ${headWho} เคาะภาพผัง จุดติดตั้ง แพ็คเกจ แล้วกด “ส่งผลให้ฝ่ายขาย”`,
      turn: { side: dept, who: crewWho, note: crewNote },
    },
    'awaiting-submit': {
      headline: 'วัดครบแล้ว — ช่างยังไม่กดส่งงาน',
      sub: measuredText,
      next: `ช่างกด “ส่งงาน” ที่ใบประเมิน → ${headWho} เคาะแล้วส่งผล`,
      turn: { side: dept, who: crewWho, note: crewNote },
    },
    'awaiting-decision': {
      headline: 'วัดครบแล้ว — รอหัวหน้าเคาะ',
      sub: join(measuredText, visit?.actualEndTime && `ช่างส่งงาน ${dayTime(visit.actualEndDate || visit.actualDate || visit.scheduledDate, visit.actualEndTime)}`),
      next: `${headWho} เคาะภาพผัง จุดติดตั้ง แพ็คเกจ แล้วกด “ส่งผลให้ฝ่ายขาย”`,
      turn: { side: dept, who: headWho },
    },
    'crew-gaps': {
      headline: 'ช่างส่งงานแล้ว แต่ของหน้างานยังขาด',
      sub: join(measuredText, progress.leftText && `ขาดที่ ${progress.leftText}`, gapText),
      next: `${headWho} กด “ส่งกลับให้ช่างแก้” ที่ใบประเมิน หรือตัดพื้นที่ที่วัดไม่ได้พร้อมเหตุผล`,
      turn: { side: dept, who: headWho },
    },
    'sent-back': {
      headline: 'ส่งกลับให้ช่างแก้แล้ว — รอช่างแก้',
      sub: join(
        request.surveySendBack?.sentBack?.at && `ส่งกลับ ${stampText(request.surveySendBack.sentBack.at)}`,
        request.surveySendBack?.sentBack?.byName && `โดย ${request.surveySendBack.sentBack.byName}`,
        /* 🔄 S4 — ฝั่งช่างครบแล้วก็ส่งกลับได้ ⇒ ไม่มีของขาดให้เล่า ต้องบอกว่าหัวหน้า **ขออะไร**
           (ไม่งั้นแถบเหลือแค่ "ใคร · เมื่อไร") · ข้อความชุดเดียวกับกล่องของหัวหน้าบนใบประเมิน */
        gapText || (progress.leftText && `ขาดที่ ${progress.leftText}`)
          || (sendBackAsk && `ขอ ${sendBackAsk}`),
      ),
      next: `ช่างแก้ตามที่หัวหน้าแจ้ง แล้วกด “แจ้งหัวหน้าว่าแก้แล้ว” ที่ใบประเมิน → ${headWho} เคาะแล้วส่งผล`,
      turn: { side: dept, who: crewWho },
    },
    ready: {
      headline: 'พร้อมส่งผลให้ฝ่ายขาย',
      sub: control.status?.sub || totalsText,
      next: `${headWho} กด “ส่งผลให้ฝ่ายขาย” ที่ใบประเมิน`,
      turn: { side: dept, who: headWho },
    },
    recalled: {
      headline: 'ดึงผลกลับมาแก้',
      sub: control.status?.sub || '',
      next: `${headWho} แก้ผลแล้วส่งอีกครั้ง`,
      turn: { side: dept, who: headWho },
    },
    'no-zones': {
      headline: control.status?.headline || 'ยังไม่มีพื้นที่ที่ต้องประเมิน',
      sub: control.status?.sub || '',
      next: null,
      turn: null,
    },
    sent: {
      headline: `${viewer.isRequesterSide ? 'ได้รับผลแล้ว' : 'ส่งผลให้ฝ่ายขายแล้ว'} — ${totalsText}`,
      sub: join(
        request.answeredByName && `ส่งโดย ${request.answeredByName}`,
        request.answeredAt && stampText(request.answeredAt),
        /* ⚠️ ไม่ใช้ `closureLine.text` ตรง ๆ — มันพกวันที่ dd/mm/yy มา ปนกับ "อ. 29 ก.ย." ของทั้งแถบ */
        `ปิดแล้ว ${closureLine?.done ?? 1}/2`,
        requestWaitLabel(request, 'requester', 'ปิดเรื่อง'),
      ),
      next: viewer.isRequesterSide
        ? `อ่านผลรายพื้นที่ด้านล่าง แล้วกด “ปิดเรื่อง” · ถ้ายังขาดข้อมูล กด “ยังไม่จบ” พร้อมเหตุผล — เรื่องจะกลับไปที่ ${dept}`
        : `รอฝ่ายขายอ่านผลแล้วปิดเรื่อง`,
      turn: {
        side: requesterLabel,
        who: requesterWho,
        note: join(viewer.isOpener && request.team && `ทีม ${request.team}`, request.answeredAt && `ได้รับผลเมื่อ ${stampText(request.answeredAt)}`),
      },
    },
    closed: {
      headline: 'ปิดเรื่องแล้ว',
      sub: join(sent && totalsText, request.closedAt && `ปิด ${stampText(request.closedAt)}`),
      next: null,
      turn: null,
    },
    'closed-unassessed': {
      headline: 'ปิดใบโดยไม่ได้ประเมิน',
      sub: join(request.closedByName && `ปิดโดย ${request.closedByName}`, request.closedAt && stampText(request.closedAt)),
      next: null,
      turn: null,
    },
    'closed-early': {
      headline: control.status?.headline || 'ฝ่ายขายปิดเรื่องไปก่อนได้ผล',
      sub: control.status?.sub || '',
      next: null,
      turn: null,
    },
    cancelled: {
      headline: 'คำร้องถูกยกเลิก',
      sub: join(request.cancelledAt && stampText(request.cancelledAt), request.cancelReason),
      next: null,
      turn: null,
    },
  };
  const nowBase = nowByStage[stage] || nowByStage.queue;
  const showMeter = progress.total > 0 && !filesUnknown
    && ['measuring', 'awaiting-submit', 'awaiting-decision', 'crew-gaps', 'sent-back', 'ready', 'recalled', 'sent', 'closed'].includes(stage);

  /* ── ตารางพื้นที่ + ด่านสองฝั่ง ─────────────────────────────────────────────── */
  const rows = zoneRows(zones, filesByZone, { sent, filesUnknown });
  const gates = surveyGateChecklist(zones, filesByZone);
  const crew = gateCard(gates, 'crew');
  const head = gateCard(gates, 'head');
  const crewStarted = visit?.status === 'in_progress' || reachedSite(visit);
  const changeCounts = surveyChangeCounts(zones);
  const photos = filesUnknown ? { wide: null, plan: null }
    : rows.filter((r) => !r.cut).reduce((acc, r) => ({ wide: acc.wide + r.photosWide, plan: acc.plan + r.photosPlan }), { wide: 0, plan: 0 });

  const site = request.surveySite || null;

  return {
    stage,
    status: STAGE_BADGE[stage] || STAGE_BADGE.queue,
    control,
    steps: timeline,
    index: Math.min(index, timeline.length),
    current,
    now: {
      step: current ? `ตอนนี้ · ${current.label}` : 'ตอนนี้',
      /* รหัสนัดข้างขั้นปัจจุบัน — จอทำเป็นลิงก์ (ที่เดียวที่กดไปนัดได้ ⇒ ลำดับโฟกัสตรงกับที่ตาเห็นทุกขนาดจอ) */
      visitCode: visit?.code && !visitDead && current && !['draft', 'pending'].includes(current.id) ? visit.code : null,
      headline: nowBase.headline,
      sub: nowBase.sub || '',
      tone: stage === 'overdue' ? 'danger' : (STAGE_BADGE[stage]?.tone || 'neutral'),
      progress: showMeter ? { done: sent ? progress.total : progress.done, total: progress.total, complete: sent || progress.complete } : null,
      next: nowBase.next || null,
      turn: nowBase.turn || null,
      due: finished && !sent ? null : due,
      finished,
    },
    visit: visit ? {
      id: visit.id,
      code: visit.code,
      status: visit.status,
      statusLabel: VISIT_STATUS_LABELS[visit.status] || visit.status,
      when: visitWhen,
      assigneeName: visit.assigneeName || null,
      helpers,
      onSite: onSiteText(visit),
      unableReason: visit.unableReason || null,
    } : null,
    site: site ? {
      id: site.id,
      code: site.code,
      name: site.name,
      routeZone: site.routeZone || null,
      address: site.address || null,
      contact: join(site.contactName, site.contactPhone),
      access: accessWindowText(site),
      accessNote: site.accessNote || null,
    } : null,
    zones: {
      rows,
      sent,
      totals,
      photos,
      measured: { done: progress.done, total: progress.total },
      progressText: join(measuredText, !sent && totals.areaSqm ? `รวมตอนนี้ ${num(totals.areaSqm)} ตร.ม. · ${num(totals.volumeCbm)} ลบ.ม.` : ''),
      changeText: surveyChangeText(changeCounts, { actor: dept }),
      unchanged: !changeCounts.cut && !changeCounts.added,
      crewGate: {
        ...crew,
        badge: !crew.hasActive ? { label: 'ไม่มีพื้นที่', tone: 'neutral' }
          : filesUnknown ? { label: 'ไม่ทราบ', tone: 'neutral' }
            : crew.ok ? { label: 'ครบ', tone: 'success' } : crewStarted ? { label: 'กำลังทำ', tone: 'info' } : { label: 'ยังไม่เริ่ม', tone: 'neutral' },
        text: filesUnknown ? 'อ่านรูปรายพื้นที่ไม่สำเร็จ — ไม่ทราบว่าครบไหม'
          : progress.total
            ? join(`ครบ ${progress.done} / ${progress.total} พื้นที่`, progress.leftText && `เหลือ ${progress.leftText}`)
            : '',
      },
      headGate: {
        ...head,
        badge: !head.hasActive ? { label: 'ไม่มีพื้นที่', tone: 'neutral' }
          : filesUnknown ? { label: 'ไม่ทราบ', tone: 'neutral' }
            : head.ok ? { label: 'ครบ', tone: 'success' } : reachedSite(visit) ? { label: 'รอเคาะ', tone: 'info' } : { label: 'ยังไม่เริ่ม', tone: 'neutral' },
        text: filesUnknown ? 'อ่านรูปรายพื้นที่ไม่สำเร็จ — ไม่ทราบว่าครบไหม'
          : reachedSite(visit) || head.ok
            ? head.items.map((g) => `${g.label} ${g.done}/${g.total}`).join(' · ')
            : `เริ่มได้เมื่อช่างส่งงาน${totals.suggestedPackages ? ` — ตอนนี้สูตรให้ ${fmtNumber(totals.suggestedPackages)} แพ็คเกจ` : ''}`,
      },
      unknownFiles: unknown.files === true,
    },
    facts: dateFacts(request, visit, today, assignee, { finished }),
  };
}
