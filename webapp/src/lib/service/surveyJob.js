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
import { NA, fmtNumber, fmtTime, isoDateToWeekdayText } from '@/lib/format';
import { requestKindMeta, requestResultDateOnly, requestVariants } from '@/lib/master/requestTypes';
import { requestAssignee } from '@/lib/requests/assign';
import { requestClosure, requestClosureLine, requestClosureStarted } from '@/lib/requests/closure';
import { committedVsRequested } from '@/lib/requests/headerFacts';
import { liveDueDate } from '@/lib/requests/dueRound';
import { requestRailSteps } from '@/lib/requests/requestRail';
import { requestSideLabel, requestWaitLabel } from '@/lib/requests/replyTurn';
import { accessWindowText } from './sites';
import { dayText, daysBetween, relDayText, thaiDayOf } from './queueWords';
import {
  surveyChangeCounts, surveyChangeText, surveyGateChecklist, surveyPackageMixText, surveyTotals,
  surveyZonePackageText, surveyZoneSuggestedDiffText,
} from './survey';
import { surveyControlView, surveyPackagesLabel, surveyPlanGateShown, surveySendBackAskText, surveyZoneFacts } from './surveyControl';
import { surveyRequestDocumentView } from './surveyDocumentView';
import { isDrawingZone, surveyMethodMix, surveyNeedsVisit, surveyZoneNeedsResave, zoneMethod } from './surveyMethod';
import {
  SURVEY_CONFIRM_ACTION_READY, SURVEY_CONFIRM_PENDING_NOTE, SURVEY_DESK_RAIL_LABELS, SURVEY_METHOD_CHIP, surveyProgressText,
  surveyZoneAddedLabel,
} from './surveyMethodSwitch';
/* ประเมินจากแบบ งวด 4 (S4 C-4/C-5) — "ฝ่ายขายขออะไร" กับ "ผู้ขออยากให้เข้าวันไหน" มีตัวอ่านเดียว (pure · ไม่มีของ server) */
import {
  SURVEY_INTAKE_REMEASURE_CHIP, SURVEY_INTAKE_SWITCH_NOTE, SURVEY_INTAKE_SWITCH_REASON, SURVEY_NO_VISIT_WISH_LINE,
  SURVEY_NO_VISIT_WISH_TEXT, surveyFiledAsDrawing, surveySalesAskedLine, surveyWishedVisit,
} from './surveyIntake';
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
function stageOf(request, visit, control, today, { filesUnknown = false, sendBack = null, needsVisit = true } = {}) {
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
  /* ⭐ **งานโต๊ะ** (ทุกพื้นที่ประเมินจากแบบ · mig 0408) — ไม่ลงคิว ไม่มีนัดเข้าพื้นที่ ⇒ ขั้นเดินตาม **วันส่งผล**
     ที่หัวหน้าแจ้ง ไม่ใช่ตามนัด: ยังไม่แจ้ง = รอแจ้งวันส่งผล · แจ้งแล้ว = กำลังประเมิน · เลยวัน = เลยวันส่งผล
     ⚠️ อยู่ **ก่อน** กิ่งของนัดทั้งหมดโดยตั้งใจ — นัดเก่าที่ยังติดใบ (จากตอนที่ยังเป็นงานหน้างาน) ต้องไม่พาใบ
        กลับไปขั้น "นัดแล้ว/กำลังวัด" และการส่งกลับที่ค้างต้องไม่ขึ้น "ส่งกลับให้ช่างแก้" (ไม่มีอะไรให้ช่างแก้แล้ว)
     ⚠️ `today` ยังไม่รู้ = ไม่นับเลยกำหนด (กติกาเดียวกับ "เลยวันนัด" ข้างล่าง) */
  if (needsVisit === false) {
    /* ผลที่ส่งไปแล้วถูกดึงกลับมาแก้ — พูดเรื่องนั้นก่อนวันส่งผล (การ์ดของใบประเมินก็ถามเรื่องดึงกลับก่อนกิ่งงานโต๊ะ)
       🐞 ไม่ดัก = ใบที่ส่งผลก่อนกำหนดแล้วถูกดึงกลับหลังวันที่รับปาก ขึ้น "เลยวันที่จะส่งผลมา n วัน" ทั้งที่ส่งไปแล้ว */
    if (key === 'recalled') return key;
    const resultDate = String(request.committedResultDate ?? '').trim();
    if (!resultDate) return 'desk-queue';
    if (today && resultDate < today) return 'desk-overdue';
    /* ⭐ **ด่านส่งผลผ่านครบ = "พร้อมส่งผลให้ฝ่ายขาย"** (S2b แก้หลังตรวจจอ head-rc-r2-22 · ผลรีวิวรอบสาม) — ไทม์ไลน์ของหน้านี้ชี้ขั้น "ส่งผล"
       และติ๊ก "ประเมินจากแบบ" เสร็จแล้ว (`deskReady` ← ขั้นของการ์ดตัวเดียวกัน) ⇒ แถบตอนนี้ต้องไม่พูด "กำลังประเมินจากแบบ" ข้างกัน ·
       พาดหัวคำเดียวกับใบผสมที่พร้อมส่ง (`nowByStage.ready` — ไม่เอ่ยนัดหรือช่าง)
       ⚠️ หน้าคำร้องไม่ส่งเอกสารให้การ์ด ⇒ คีย์ `ready` ของการ์ด = ด่านของพื้นที่ผ่านครบ = `deskReady` ของราง (สองตัวมาจากก้อนเดียวกัน)
       ⚠️ เลยวันส่งผลแล้วยังเป็น "เลยวันส่งผล" — โทนแดงของคำสัญญาที่พลาดสำคัญกว่า และบรรทัดรอง ("… ส่งผล หรือเลื่อนวันส่งผล") ก็ชี้ขั้นส่งผลอยู่แล้ว */
    /* นัดค้างบนงานโต๊ะที่ครบแล้ว (`desk-visit-open` ของการ์ด — UAT S2b รอบสอง S09) = ขั้นส่งผลเหมือนกัน · เหตุอยู่ใต้ปุ่มของการ์ด */
    return key === 'ready' || key === 'desk-visit-open' ? 'ready' : 'desk-working';
  }
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
  /* งานโต๊ะ (ประเมินจากแบบทั้งใบ) — ป้ายของตัวเอง ไม่งั้นคีย์ที่ไม่มีในตารางนี้ถอยไปขึ้น "รอลงคิว" ซึ่งผิดความจริง
     · คำของแถบ "ตอนนี้" (หัวข้อ · บรรทัดรอง · ตาใคร) อยู่ที่ `nowByStage` คีย์เดียวกัน (งวด S2a) */
  'desk-queue': { label: 'รอแจ้งวันส่งผล', tone: 'warning' },
  'desk-working': { label: 'กำลังประเมินจากแบบ', tone: 'info' },
  'desk-overdue': { label: 'เลยวันส่งผล', tone: 'danger' },
  sent: { label: 'ส่งผลให้ฝ่ายขายแล้ว', tone: 'success' },
  closed: { label: 'ปิดเรื่องแล้ว', tone: 'success' },
  'closed-unassessed': { label: 'ปิดโดยไม่ได้ประเมิน', tone: 'neutral' },
  'closed-early': { label: 'ฝ่ายขายปิดก่อนได้ผล', tone: 'neutral' },
};

/* ชื่อขั้นบนรางของงานโต๊ะอยู่ที่ `surveyMethodSwitch.js` (`SURVEY_DESK_RAIL_LABELS`) — การ์ดควบคุมใช้แผนที่ตัวเดียวกัน */
const DESK_RAIL_LABELS = SURVEY_DESK_RAIL_LABELS;

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
  /* เลยวันที่รับปากแล้ว = ไม่มีบรรทัด "เร็วกว่าที่ขอ" (S2b แก้หลังตรวจจอ sales-minor-3 · กติกาอยู่ที่ `committedVsRequested`) */
  const gap = committed && wanted ? committedVsRequested(committed, wanted, { today }) : null;
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

/* จำนวนภาพแบบของแถวจากแบบบนตารางที่ยังไม่ส่งผล — null = อ่านรูปไม่สำเร็จ ("ไม่ทราบ" ไม่ใช่ขีด: ขีด = ยังไม่มีรูป) */
const zonePlanText = (count) => {
  if (count == null) return 'ไม่ทราบ';
  return count ? `แบบ ${count}` : NA;
};

/* คำของช่อง "หน้างาน" บนตารางพื้นที่ สำหรับแถวที่เหลือแค่บันทึกอีกครั้งหลังกลับมาเป็นลงหน้างาน (ย่อจากประโยคของด่านขนาด)
   🔄 S2b แก้หลังตรวจจอ (crew-q3 + head-rc-q2) — "ขนาดและภาพกว้าง" ตามประโยคของด่านขนาด (`survey.js`) */
export const SURVEY_ZONE_RESAVE_TEXT = 'กลับมาเป็นลงหน้างาน — รอตรวจขนาดและภาพกว้างแล้วบันทึกอีกครั้ง';
/* หมายเหตุของช่องจุดติดตั้งบนแถบตัวเลขของใบจากแบบทั้งใบที่ส่งผลแล้ว (S2b-O9 · มติเจ้าของ 19/10) — แทน "เลือก / ที่ติดตั้งได้"
   ซึ่งอ่านว่ามีคนเลือกจุดและตรวจแล้วว่าติดตั้งได้ (ไม่จริงกับพื้นที่จากแบบ — จุดไม่บังคับ และไม่มีการเลือก) */
export const SURVEY_DRAWING_SPOTS_NOTE = 'จุดโดยประมาณจากแบบ';

/* ท่อนในบรรทัดของขั้นบนไทม์ไลน์ที่ห้ามขาดกลางบรรทัด — คำของวิธีกับจำนวนเป็นหน่วยเดียว ("… · จากแบบ 1") (S2b แก้หลังตรวจจอ sales-q8) */
const STEP_LINE_KEEP = /จากแบบ \d[\d,]*/g;
const zoneResaveOnly = (zone, facts) => surveyZoneNeedsResave(zone)
  && facts.missingCrew.length === 1 && facts.missingCrew[0].key === 'size' && facts.sizeComplete === true;

/* ⭐ **ตัวเลขในแถวยังเป็นของหัวหน้า (จากแบบ) — ช่างยังไม่ได้วัดทับ** (ค่าตั้งต้น A ของคำถามเจ้าของ · UAT S4 รอบ 4 ข้อ 17)
   ร่างที่ถูกตีกลับแล้วฝ่ายขายสลับเป็นลงหน้างาน (O8 = ข): แถวที่มีผลจากโต๊ะถูกตรา `methodReason` = `SURVEY_INTAKE_SWITCH_REASON`
   แล้วกลายเป็นแถวลงหน้างานที่ถือตัวเลขเดิม ⇒ บนตารางอ่านเหมือนช่างวัดมาแล้ว · ป้ายบอกว่าเป็นตัวเลขจากแบบที่รอวัดใหม่
   สามเงื่อนไขพร้อมกัน: ตอนนี้ลงหน้างาน · ตราของฝ่ายขาย (ไม่ใช่หัวหน้าสลับกลับ — แถวนั้นมีบรรทัด "กลับมาเป็นลงหน้างาน" ของตัวเอง) ·
   ยังไม่ถูกบันทึกทับหลังตรา (`surveyZoneNeedsResave` — ผลที่บันทึกหลังเวลาตรา = ช่างวัดแล้ว ป้ายหายเอง) และมีผลอยู่จริง */
const intakeRemeasure = (zone) => !isDrawingZone(zone)
  && String(zone?.methodReason ?? '').trim() === SURVEY_INTAKE_SWITCH_REASON
  && !!String(zone?.surveyedAt ?? '').trim()
  && surveyZoneNeedsResave(zone);

function zoneRows(zones, filesByZone, { sent, filesUnknown = false, dept = 'TS', allDrawing = false }) {
  return zones.map((zone) => {
    const facts = surveyZoneFacts(zone, filesByZone[zone.id] || []);
    const drawing = isDrawingZone(zone);
    let state;
    if (facts.cut) state = { label: 'ตัดออก', tone: 'neutral' };
    else if (sent || filesUnknown) state = null;
    /* พื้นที่จากแบบไม่ใช่งานของช่าง (ทุกด่านของมันเป็นของหัวหน้า) — ไม่มีของฝั่งช่างให้ขาด จึงตกกิ่ง "ครบฝั่งช่าง" เอง
       ทั้งที่ไม่มีช่างคนไหนทำอะไรกับมัน ⇒ ไม่มีป้ายสถานะหน้างาน · ความคืบหน้าของมันอยู่ที่การ์ดด่านของหัวหน้า */
    else if (drawing) state = null;
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
      /* ขนาดที่หัวหน้าเคาะ + ขนาดที่ระบบเสนอตอนเคาะ (ภาพนิ่งบนแถว · mig 0398) — 🔄 แทน `suggested` (สูตร ÷ 2,400 ถอดแล้ว) */
      packageSize: facts.packageSize,
      suggestedSize: facts.suggestedSize,
      packageQty: facts.packageQty,
      /* ⭐ ถ้อยคำของช่องแพ็คเกจ (จอแค่วาด) — "SM · 1" คือของที่ฝ่ายขายเอาไปตั้งราคา · บรรทัดรอง "ระบบเสนอ ST · 1"
         ขึ้นเฉพาะเมื่อที่เคาะต่างจากที่ระบบเสนอ (ต่างได้ แต่ต้องเห็นว่าต่าง) · หัวคอลัมน์บอกหน่วยแล้ว ⇒ ไม่ต่อ "แพ็ค" */
      packageText: surveyZonePackageText(facts, { unit: false }),
      suggestedText: surveyZoneSuggestedDiffText(facts, { unit: false }),
      packageNote: String(zone.packageNote || '').trim() || null,
      state,
      /* 🔄 แถวที่เพิ่งกลับมาเป็นลงหน้างานและขาดแค่ "บันทึกอีกครั้ง": ขนาดพิมพ์อยู่ในแถวเดียวกัน — "ขาด: ขนาด" ข้างตัวเลขอ่านว่าระบบพัง
         (🐞 UAT S2b S06 · มติ O3) ⇒ บอกสิ่งที่ค้างจริง · แถวที่ไม่เคยสลับวิธีได้คำเดิม */
      missingText: facts.cut || filesUnknown ? null
        : zoneResaveOnly(zone, facts) ? SURVEY_ZONE_RESAVE_TEXT : facts.missingText,
      /* หมายเหตุของพื้นที่ — ของผู้ขอ (พื้นที่ใหม่) หรือของช่างหน้างาน · ฝ่ายขายเปิดใบประเมินไม่ได้ ⇒ ต้องอ่านได้ที่นี่ */
      note: String(zone.note || '').trim() || null,
      /* ── วิธีประเมินของแถว (mig 0408 · งวด S2a) — ถ้อยคำอยู่ที่นี่ จอแค่วาด ──
         chip         ป้าย "จากแบบ" ใต้ชื่อพื้นที่ · ตารางของฝ่ายขายติดป้ายเฉพาะแถวจากแบบ ⇒ แถวลงหน้างาน = null
         `photosText` ช่องรูปของแถวจากแบบ "แบบ n" (n = ภาพแบบของพื้นที่นั้น) · null = วาดช่องเดิม
                      (แถวลงหน้างาน · แถวที่ถูกตัด · อ่านรูปไม่สำเร็จ — ไม่เดาว่า "แบบ 0")
         `addedLabel` พื้นที่ที่ถูกเพิ่มบนใบ — แถวจากแบบหัวหน้าเป็นคนเพิ่มที่โต๊ะ ไม่ได้ "เพิ่มหน้างาน" */
      method: zoneMethod(zone),
      /* ⚠️ "รอวัดใหม่" ไม่ขึ้นบนแถวที่ถูกตัด (รีวิว UAT S4 รอบ 4) — ไม่มีใครวัดพื้นที่ที่ตัดออกแล้ว ⇒ ป้ายจะค้างตลอดไป
         ข้าง "ตัดออก — {เหตุ}" (ทาง: หัวหน้าตัดแถวจากแบบตอนรอรับเรื่อง → ตีกลับ → ฝ่ายขายสลับเป็นลงหน้างาน = ตัวตั้งวิธีตราแถวนั้นด้วย)
         · กติกาเดียวกับ `missingText` ของแถวที่ตัด (ไม่มีคำ "ยังต้องทำ") */
      chip: drawing ? SURVEY_METHOD_CHIP.drawing : (!facts.cut && intakeRemeasure(zone) ? SURVEY_INTAKE_REMEASURE_CHIP : null),
      photosText: drawing && !facts.cut && !filesUnknown ? `แบบ ${facts.photos.plan}` : null,
      addedLabel: surveyZoneAddedLabel(zone, dept),
      /* ── ช่องของแถวจากแบบบนตารางที่ **ยังไม่ส่งผล** (มติเจ้าของ 12/10 · ทรงของตารางอยู่ที่ `surveyZoneTable`) ──
         `wideText`  ช่อง "ภาพกว้าง" — ภาพกว้างเป็นหลักฐานของการลงหน้างาน ไม่ใช่ของวิธีนี้ ⇒ ขีดเสมอ
                     (แม้มีรูปค้างจากตอนที่พื้นที่ยังลงหน้างาน — ตัวนับ `photosWide` ยังเป็นของจริง แค่ไม่ถูกพิมพ์)
         `planText`  ช่องสุดท้าย — **ใบจากแบบทั้งใบ** (`allDrawing` · หัวคอลัมน์ "แบบ"): จำนวนภาพแบบ "แบบ n" (คำเดียวกับตารางผล)
                     · ยังไม่มีสักรูป = ขีด · อ่านรูปไม่สำเร็จ = "ไม่ทราบ"
                     · **ใบผสม** (หัวคอลัมน์ / ป้ายบนจอแคบยังเป็น "หน้างาน"): ขีดเสมอ — ช่องของงานหน้างานไม่เกี่ยวกับแถวจากแบบ
                       (มติ 12/10 ข้อ 2 · เดิมพิมพ์ "แบบ 2" ใต้ป้าย "หน้างาน" · รีวิว 12/10)
                     · แถวที่ถูกตัด = null (ช่องนั้นมีป้าย "ตัดออก" อยู่แล้ว)
         ⚠️ ทั้งคู่ `null` บนแถวลงหน้างานทุกแถว และบนตารางผล (ส่งแล้ว) ⇒ จอวาดช่องเดิม */
      wideText: drawing && !sent ? NA : null,
      planText: drawing && !sent && !facts.cut
        ? (allDrawing ? zonePlanText(filesUnknown ? null : facts.photos.plan) : NA)
        : null,
    };
  });
}

/* ── ทรงของตารางพื้นที่บนหน้าคำร้อง ตามวิธีประเมิน (มติเจ้าของ 12/10 · S2b-followups ข้อ 2) ─────────────────────────
   ⭐ ฝ่ายขายกับผู้วางคิวอ่านตารางนี้ระหว่างที่ใบยังทำอยู่ — ใบจากแบบทั้งใบเคยมีคอลัมน์ "ภาพกว้าง" (ขีดทุกแถว) กับ
      "หน้างาน" (ว่างทุกแถว) ซึ่งเป็นช่องของงานที่ไม่มีใครทำ (UAT 12/10 · ผู้วางคิวข้อ 9 · ฝ่ายขายข้อ 10)
     ส่งผลแล้ว             ตารางผลของวันนี้ทุกวิธี — ไม่มีคอลัมน์ภาพกว้าง · หัวคอลัมน์สุดท้าย "รูป"
     ยังไม่ส่ง · จากแบบทั้งใบ  ไม่มีคอลัมน์ภาพกว้าง · หัวคอลัมน์สุดท้าย "แบบ" (ช่องของแถว = `row.planText`)
     ยังไม่ส่ง · ผสม          คอลัมน์ของวันนี้ · ภาพกว้างรวมนับเฉพาะพื้นที่ลงหน้างาน (แถวจากแบบพิมพ์ขีด — รวมแล้วต้องเท่าที่แถวพิมพ์)
                            · ช่องสุดท้ายของแถวจากแบบ = ขีด (`row.planText` — `zoneRows` ถามโหมดเดียวกันผ่าน `allDrawing`)
     ยังไม่ส่ง · ลงหน้างานล้วน ทรงของวันนี้ทุกช่อง · ภาพกว้างรวม = `photos.wide` ตัวเดิม
   คืน `{ wideColumn, wideTotal, lastLabel }` — `lastLabel` = หัวคอลัมน์สุดท้าย **และ** ป้ายของเซลล์นั้นบนจอแคบ (`data-label`)
   · `wideTotal` null = อ่านรูปไม่สำเร็จ (จอเขียน "ไม่ทราบ") หรือตารางไม่มีคอลัมน์นี้
   ⚠️ "จากแบบทั้งใบ" ถามจาก `mix.mode` (นับเฉพาะพื้นที่ที่ยังใช้อยู่) — ใบที่ถูกตัดออกหมดได้ตารางของวันนี้ กติกาเดียวกับการ์ดของช่าง */
const ZONE_TABLE_LAST = { sent: 'รูป', work: 'หน้างาน', drawing: 'แบบ' };
function surveyZoneTable(rows, mix, { sent = false, filesUnknown = false } = {}) {
  if (sent) return { wideColumn: false, wideTotal: null, lastLabel: ZONE_TABLE_LAST.sent };
  if (mix.mode === 'drawing') return { wideColumn: false, wideTotal: null, lastLabel: ZONE_TABLE_LAST.drawing };
  const wideTotal = filesUnknown ? null
    // แถวของ `zoneRows` พกวิธีของตัวเอง (`row.method`) — ถามผ่านตัวตัดสินกลางตัวเดียวกับแถวพื้นที่จริง
    : rows.filter((row) => !row.cut && !isDrawingZone(row)).reduce((sum, row) => sum + row.photosWide, 0);
  return { wideColumn: true, wideTotal, lastLabel: ZONE_TABLE_LAST.work };
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

/* ── แถบแจ้งเหนือตารางผลของใบที่มีพื้นที่จากแบบ (แผน survey-desk-assessment §3.1 · งวด S2a) ─────────────
   ⭐ ฝ่ายขายต้องรู้สองอย่างก่อนเอาตัวเลขไปเสนอราคา: กี่พื้นที่ที่ไม่ได้วัดจากของจริง และหัวหน้าเลือกไว้ว่าต้องยืนยันหน้างานไหม
      (`dept_requests.surveyConfirm` — หัวหน้าเลือกตอนกดส่งผล · มติเจ้าของ D1)
   คืน `{ text, action }` หรือ `null` (ไม่มีแถบ):
     'needed'      ประโยค + ปุ่ม "ขอยืนยันหน้างาน" · `ready: false` = เส้นของปุ่มยังไม่มี (มาพร้อมงวด S5) จออย่าเปิดให้กด
     'not_needed'  ประโยคล้วน ไม่มีปุ่ม
     ค่าอื่น        ไม่มีแถบ — ข้อมูลเก่า/ยังไม่เลือก ไม่ถูกเดาว่า "ต้องยืนยัน" (เทียบค่าตรงตัว)
   ⚠️ `count` = พื้นที่จากแบบที่ **ยังใช้อยู่** เท่านั้น (ใบผสมไม่นับพื้นที่ลงหน้างาน · แถวที่ถูกตัดไม่นับ)
   🔴 ห้ามมีประโยคไหนพูดว่า "ไม่ได้เข้าพื้นที่" — พื้นที่จากแบบอาจมาหลังช่างเข้าไปจริงแล้วห้องยังไม่พร้อม (มติ D3) */
const CONFIRM_ACTION_LABEL = 'ขอยืนยันหน้างาน';
function surveyDrawingBanner(request, { show = false, count = 0, dept = 'TS' } = {}) {
  if (!show || !(count > 0)) return null;
  const lead = `มี ${count} พื้นที่ที่ประเมินจากแบบ`;
  if (request.surveyConfirm === 'needed') {
    return {
      text: `${lead} — ใช้ตัวเลขเสนอราคาได้เลย · เมื่อพื้นที่พร้อม กด “${CONFIRM_ACTION_LABEL}” เพื่อให้ ${dept} เข้าวัดจริง`,
      /* `keep` = วลีที่จอห้ามตัดกลาง — ชื่อปุ่มในเครื่องหมายคำพูด (375 เคยขึ้น "“ขอยืนยัน" / "หน้างาน”") · S2b แก้หลังตรวจจอ sales รอบ 27/10 */
      keep: [`“${CONFIRM_ACTION_LABEL}”`],
      /* งวด S2b: ประโยคข้างบนเอ่ยถึงปุ่มที่ยังไม่มีจนถึงงวด S5 ⇒ จอพิมพ์ `note` ต่อท้าย (สวิตช์เดียวกับกล่องส่งผลของหัวหน้า) */
      note: SURVEY_CONFIRM_ACTION_READY ? null : SURVEY_CONFIRM_PENDING_NOTE,
      action: { label: CONFIRM_ACTION_LABEL, ready: SURVEY_CONFIRM_ACTION_READY },
    };
  }
  if (request.surveyConfirm === 'not_needed') {
    /* `keep` — "ไม่" ห้ามขาดจากกริยา: 375 เคยขึ้น "…แจ้งว่าไม่" / "ต้องยืนยันหน้างาน…" บรรทัดล่างอ่านกลับความ (S2b แก้หลังตรวจจอ sales รอบ 27/10) */
    return { text: `${lead} — ${dept} แจ้งว่าไม่ต้องยืนยันหน้างาน ใช้ผลนี้เป็นผลสุดท้าย`, keep: ['ไม่ต้องยืนยันหน้างาน'], action: null };
  }
  return null;
}

/* ── ช่องรูปของแถวรวมบนตารางผล เมื่อใบมีพื้นที่จากแบบ (งวด S2b §2.5 d) ─────────────────────────────────────────
   แถวจากแบบพิมพ์ "แบบ n" ในช่องรูปของตัวเอง ⇒ แถวรวมต้องพูดภาษาเดียวกัน ไม่งั้นรวม "ผัง" ของสองวิธีเป็นเลขเดียวที่ไม่มีแถวไหนใช้
     ไม่มีพื้นที่จากแบบ / อ่านรูปไม่สำเร็จ  `null` (จอวาดช่องเดิม — ไม่เดาว่า "แบบ 0")
     จากแบบทั้งใบ                        "แบบ k"
     ผสม                               "ภาพกว้าง w · ผัง p · แบบ k" — w · p นับเฉพาะพื้นที่ลงหน้างาน (ภาพกว้างที่ค้างบนพื้นที่จากแบบไม่ลงเอกสาร)
   ⚠️ นับจากแถวของ `zoneRows` (ไม่นับแถวที่ถูกตัด) — เลขเดียวกับที่แต่ละแถวพิมพ์ */
function surveyPhotosTotalText(rows, zones, mix, { filesUnknown = false } = {}) {
  if (filesUnknown || !(mix.drawing > 0)) return null;
  const sum = (list, key) => list.reduce((n, r) => n + (Number(r[key]) || 0), 0);
  // แถวของ `zoneRows` เรียงตาม `zones` ตัวต่อตัว — วิธีของแถวถามจากแถวพื้นที่จริงผ่านตัวตัดสินกลาง
  const live = rows.map((row, i) => ({ row, drawing: isDrawingZone(zones[i]) })).filter((x) => !x.row.cut);
  const drawingRows = live.filter((x) => x.drawing).map((x) => x.row);
  const onsiteRows = live.filter((x) => !x.drawing).map((x) => x.row);
  const plans = `แบบ ${sum(drawingRows, 'photosPlan')}`;
  if (mix.onsite === 0) return plans;
  return `ภาพกว้าง ${sum(onsiteRows, 'photosWide')} · ผัง ${sum(onsiteRows, 'photosPlan')} · ${plans}`;
}

/**
 * สรุปเรื่อง "ประเมินจากแบบ" ของคำร้อง สำหรับจอรายละเอียดรุ่นเก่า (`SurveyDetail`) ที่ไม่ได้วาดจาก `surveyJobView` (งวด S2b §2.5 d)
 *   `banner` — แถบแจ้งตัวเดียวกับ `zones.drawingBanner` ของ `surveyJobView` (กติกาเดียวกัน: ใบส่งผลแล้ว · ไม่ถูกยกเลิก ·
 *              นับพื้นที่จากแบบที่ยังใช้อยู่) · ไม่เข้าเงื่อนไข = `null`
 *   `rows`   — `{ [id ของแถวพื้นที่]: { ป้ายวิธี, addedLabel } }` **เฉพาะพื้นที่จากแบบ** (พื้นที่ลงหน้างานไม่มีรายการ)
 *              ⇒ คำร้องลงหน้างานล้วนได้ `{ banner: null, rows: {} }` และจอรุ่นเก่าพิมพ์คำของตัวเองเหมือนเดิมทุกแถว
 * ⚠️ อ่านจาก `request.surveyZones` อย่างเดียว — ไม่มีแถวติดมา = ไม่มีอะไรให้สรุป (ไม่เดา)
 */
export function surveyRequestDrawingSummary(request) {
  const zones = Array.isArray(request?.surveyZones) ? request.surveyZones : [];
  const dept = request?.dept || 'TS';
  const rows = {};
  for (const zone of zones) {
    if (!zone?.id || !isDrawingZone(zone)) continue;
    rows[zone.id] = { chip: SURVEY_METHOD_CHIP.drawing, addedLabel: surveyZoneAddedLabel(zone, dept) };
  }
  if (!request) return { banner: null, rows };
  const cancelled = !!request.cancelledAt || request.status === 'cancelled';
  return {
    banner: surveyDrawingBanner(request, { show: !!request.answeredAt && !cancelled, count: surveyMethodMix(zones).drawing, dept }),
    rows,
  };
}

/**
 * ราคาของการสลับวิธีบนฟอร์มแก้ของร่าง — `{ [รูปแบบ]: ประโยค }` ให้ `RequestForm` (`variantSwitchNotes`) ต่อท้ายกล่องยืนยัน
 * ⭐ O8 = ข (มติ 19/10 · UAT S4 รอบ 4 ข้อ 7): ร่างที่ถูกตีกลับหลังหัวหน้าบันทึกผลพื้นที่จากแบบไปแล้ว แล้วฝ่ายขายสลับเป็นวิธีที่มี
 *    วันเข้าพื้นที่ (ลงหน้างาน) — server รับ แล้วตราแถวนั้นให้ช่างวัดใหม่ (`surveyIntakeSeed`) ⇒ ผลจากแบบไม่ถูกใช้ ต้องบอกก่อนกด
 * ⚠️ แถวที่นับ = แถวที่ตัวตั้งวิธีจะตราจริง (จากแบบ + มี `surveyedAt`) · ใบที่ไม่ใช่ร่าง (ฟอร์มไม่วาดไทล์อยู่แล้ว) /
 *    ไม่มีแถวแบบนั้น = `{}` ⇒ กล่องยืนยันเท่าเดิมทุกตัวอักษร · รูปแบบที่มีแต่วันรับผล (จากแบบ) ไม่ได้ประโยคนี้
 */
export function surveyIntakeSwitchNotes(request) {
  if (!request || request.status !== 'draft') return {};
  const zones = Array.isArray(request.surveyZones) ? request.surveyZones : [];
  if (!zones.some((zone) => isDrawingZone(zone) && !!String(zone?.surveyedAt ?? '').trim())) return {};
  return Object.fromEntries(Object.keys(requestVariants(request.kind) || {})
    .filter((key) => !requestResultDateOnly({ kind: request.kind, variant: key }))
    .map((key) => [key, SURVEY_INTAKE_SWITCH_NOTE]));
}

/* ── ข้อเท็จจริงรายวัน 6 ช่อง (การ์ดรายละเอียดคำร้อง) ───────────────────────────────────
   ⭐ **งานโต๊ะเหลือ 4 ช่อง** (`deskJob`) — สองช่องวันเข้าพื้นที่ (ผู้ขอ: วันที่ต้องการให้เข้า · TS: วันนัด) ไม่ถูกส่งออก:
      ใบแบบนี้ไม่มีนัด และ `committedDueDate` ของมันคือวันส่งผลที่ถูกเขียนซ้ำไว้ (`surveyDeskCommitPatch`) ⇒ ปล่อยไว้ = ขึ้น
      "วันนัดเข้าพื้นที่" ให้ใบที่ไม่มีใครไป · กติกาเดียวกับหัวใบ (`requestHeaderFacts`) · เหลือคู่ "ต้องการผล / จะส่งผล" */
function dateFacts(request, visit, today, assignee, { finished = false, deskJob = false } = {}) {
  const copy = requestKindMeta(request.kind)?.form || {};
  const dept = request.dept || 'TS';
  /* 🔴 **วันที่อยากให้เข้าพื้นที่อ่านผ่าน `surveyWishedVisit` เท่านั้น** (S4 C-5) — ใบที่ยื่นเป็นประเมินจากแบบเก็บ
     `requestedDueDate` = กระจกของวันรับผล ⇒ อ่านคอลัมน์ตรง ๆ = ใบที่หัวหน้าสลับกลับเป็นลงหน้างานขึ้นวันรับผลเป็นวันที่ขอให้เข้า
     · ไม่มีวันที่ขอ ⇒ บรรทัดเทียบ "ตรงกับที่ขอ / ช้ากว่าที่ขอ" ใต้วันนัดหายไปเอง */
  const wish = surveyWishedVisit(request);
  const wanted = wish.known ? String(wish.date).trim() : '';
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
    /* เลยวันส่งผลที่รับปากแล้ว = ไม่เทียบกับวันที่ขอ (sales-minor-3 — หัวแดง "เลยวันที่จะส่งผล" ข้างคำเขียว "เร็วกว่าที่ขอ" อ่านไม่ออก) */
    : committedResult && wantedResult ? committedVsRequested(committedResult, wantedResult, { today }) : null;
  const facts = [
    {
      key: 'submitted',
      label: 'ส่งเมื่อ',
      value: request.submittedAt ? join(dayYear(thaiDayOf(request.submittedAt)), clock(request.submittedAt)) : 'ยังไม่ได้ส่ง',
      sub: request.requestedByName || null,
    },
    {
      key: 'requestedDue',
      label: `ผู้ขอ: ${copy.dueLabel || 'วันที่ต้องการ'}`,
      // ยื่นเป็นประเมินจากแบบ = ไม่มีใครขอวันเข้า (ฟอร์มมีวันเดียว) — บอกตรง ๆ แทนช่องว่างที่อ่านเหมือนข้อมูลหาย
      value: surveyFiledAsDrawing(request)
        ? SURVEY_NO_VISIT_WISH_TEXT
        : (wanted ? join(dayYear(wanted), clock(wish.time)) : ''),
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
  return deskJob ? facts.filter((fact) => fact.key !== 'requestedDue' && fact.key !== 'committedDue') : facts;
}

/**
 * 🔑 ทุกอย่างที่หน้าคำร้องประเมินพื้นที่วาด (หัวใบ · ไทม์ไลน์ · แถบตอนนี้ · ตารางพื้นที่ · ช่องวันที่)
 *
 * @param request     ใบจาก GET `/api/sa/requests/[id]` — มี `surveyZones` · `surveySite` · `surveyVisit` ·
 *                    `surveyVisits` · `surveyFilesByZone` · `surveyRecall` · `surveySendBack` · `surveyUnknown`
 *                    · แถวพื้นที่พก `method` (mig 0408) — ใบที่ทุกพื้นที่ประเมินจากแบบ = "งานโต๊ะ": แถบตอนนี้ ชื่อขั้น
 *                      และช่องวันเป็นชุดของงานโต๊ะ · `surveyConfirm` ของใบ = ตัวเลือก "ต้องยืนยันหน้างานไหม" (`zones.drawingBanner`)
 * @param today       วันไทยวันนี้ `YYYY-MM-DD` (เปลือกจับใน effect) — `null` = ยังไม่รู้ ไม่นับเลยกำหนด
 * @param viewer      `{ canDecide, canWork, isOpener, isRequesterSide }` — ส่งผลได้ไหม · เปิดใบประเมินได้ไหม · เป็นคนเปิดใบเองไหม ·
 *                    อยู่ฝั่งผู้ขอไหม (`_mine` ของ GET คำร้อง)
 * @param people      ทะเบียนคน `[{ id, name }]` (ชื่อผู้ช่วยบนนัด) · `peopleLoading` = ยังโหลดไม่เสร็จ
 * @param refreshStalled เปลือกอ่านใบเบื้องหลังพังติดกันจนเลิกตรวจซ้ำเองแล้ว (`refreshStalled` ของ `app/requests/[id]`)
 *                    — บล็อกเอกสารใช้เลิกสัญญาว่า "หน้านี้ตรวจให้เองทุก 15 วินาที" (`surveyRequestDocumentView`)
 */
/* ── ก้อนของใบคำร้องที่ view ทั้งสองตัวข้างล่างอ่าน (แถวพื้นที่ · ไฟล์ · การ์ดควบคุมของหน้าคำร้อง) — ประกอบที่เดียว ──
   ⚠️ การ์ดควบคุมของหน้าคำร้องประกอบด้วยค่าชุดนี้ชุดเดียว ⇒ `surveyJobView` กับ `surveyRequestDeskReady` ตอบขั้นเดียวกันเสมอ */
/* ⭐ **"ใบนี้มีนัดที่เข้าพื้นที่แล้วไหม" ของหน้าคำร้อง** — คำถามเดียวกับ `siteVisitReached` ของ GET ใบประเมิน (`loadSiteVisitReached`:
   นัดของใบที่ `done` / `partial` สักนัด) แต่ตอบจากนัดทุกรอบที่ GET คำร้องอ่านมาแล้ว (`surveyVisits` — ไม่มีคำขอเพิ่ม)
   · ถามใต้เงื่อนไขเดียวกับ GET ใบประเมิน (`wantsSiteVisit`: สวิตช์เปิด · ใบยังไม่ส่งผล) ⇒ สวิตช์ปิด / ส่งผลแล้ว / ไม่มีลิสต์นัด = `null`
     (สองจอพูดตรงกันทุกสภาพของสวิตช์ — ไม่ผูกกับคนดู: นัดอ่านได้ทุกคนที่เปิดหน้านี้)
   · ผู้ใช้ตัวเดียว: การ์ดควบคุมถามว่าใครบันทึกพื้นที่ที่สลับกลับเป็นลงหน้างาน (`resaveByHead` · มติเจ้าของ 26/10 S2b-O3-sub)
     — หน้านี้ไม่ส่งสวิตช์ให้การ์ด ⇒ แถว 17a / "รอลงคิวเข้าพื้นที่" ของการ์ดไม่ถูกแตะ
   ⚠️ เพดาน 20 รอบของ GET คำร้อง — นัดที่เข้าพื้นที่ซึ่งเก่ากว่านั้นอ่านไม่เห็น ⇒ `false` = ทางเดิม (ช่างเป็นคนเก็บ) ไม่ใช่ทางที่ผิดกว่า */
function requestSiteVisitReached(request) {
  if (request.drawingMethodEnabled !== true || request.answeredAt) return null;
  if (!Array.isArray(request.surveyVisits)) return null;
  return request.surveyVisits.some(reachedSite);
}

function requestSurveyParts(request, { today = null, canDecide = false } = {}) {
  const visit = request.surveyVisit || null;
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
    viewer: { canWrite: false, canDecide: canDecide === true, canOpenRequest: true },
    /* หน้าคำร้องไม่มีทะเบียนขนาดแพ็คเกจและไม่มีปุ่มส่งผล — ด่าน "ขนาดถูกลบ" ถามที่จอใบประเมินกับ route ส่งผล (PR-P §1)
       ⭐ ขั้นของงานโต๊ะ (`deskReady` · ขั้น "ส่งผล") ไม่ขึ้นกับด่านนี้ทั้งสองจอ (`deskGatesPass` ของการ์ด · head-rc-r2-22 ผลรีวิวรอบห้า)
          ⇒ ทะเบียนที่หน้านี้ถามไม่ได้ไม่ทำให้รางของหน้านี้ชี้ขั้นต่างจากการ์ดของใบประเมิน (ขนาดถูกลบ = เหตุของขั้นส่งผล เหมือนเหตุของเอกสาร) */
    skipPackageRegistry: true,
    tab: 'result',
    today,
    siteVisitReached: requestSiteVisitReached(request),
    /* ⚠️ **ไม่ส่ง `document`** — หน้านี้ไม่มีแถวด่าน "เอกสารประเมินออกได้" (GET คำร้องไม่ตรวจเนื้อเอกสาร · PR-3 §3.6)
       เอกสารของหน้านี้อยู่ที่คีย์ `document` ของผลลัพธ์ (`surveyRequestDocumentView`) */
  });
  return { visit, zones, unknown, filesByZone, control };
}

/* งานโต๊ะที่ด่านส่งผลผ่านครบ ⇒ ขั้นปัจจุบันบนรางคือ "ส่งผล" (head-rc-r2-22) — ถามจากขั้นของการ์ดตัวเดียวกัน ไม่ตัดสินซ้ำ */
const deskReadyOf = (needsVisit, control) => needsVisit === false && control?.step?.id === 'answered';

/**
 * งานโต๊ะ (ทุกพื้นที่ที่ใช้อยู่ประเมินจากแบบ) ที่ด่านส่งผลผ่านครบแล้วไหม — ค่าที่ไทม์ไลน์ของ `surveyJobView` ส่งให้ `requestRailSteps`
 * ⭐ ส่งออกให้รางของการ์ด "จัดการคำร้อง" ในเปลือก `app/requests/[id]` (โหมดแก้ — `requestRailSteps(req, { hasItems, deskReady })`)
 *    ชี้ขั้นเดียวกับไทม์ไลน์ของหน้าเดียวกันตอนไม่แก้ (S2b แก้หลังตรวจจอ head-rc-r2-22 · ผลรีวิวรอบสอง)
 *    🐞 ไม่ส่ง = รางของการ์ดค้าง "ประเมินจากแบบ" (ขั้น 4) ขณะที่ไทม์ไลน์ของใบเดียวกันขึ้น "ส่งผล" (ขั้น 5) — สลับโหมดแก้แล้วขั้นถอยเอง
 *    ⭐ ต่อสายแล้วตอนรวมงาน: `requestRailSteps(req, { hasItems, deskReady: deskJob && surveyRequestDeskReady(req, { today }) })`
 *       (`app/requests/[id]/page.js` · ยามซอร์สที่ `surveyFixCard.test.mjs`)
 * @param request ใบจาก GET คำร้อง (ก้อน `survey*` ชุดเดียวกับ `surveyJobView`) · @param today วันไทยวันนี้ (`null` = ไม่รู้)
 * ⚠️ ใบที่ต้องมีนัด / ไม่ใช่ใบประเมิน / ไม่มีใบ = `false` (รางเดิมทุกค่า)
 */
export function surveyRequestDeskReady(request, { today = null } = {}) {
  if (!request || !Array.isArray(request.surveyZones)) return false;
  const needsVisit = surveyNeedsVisit(request.surveyZones);
  if (needsVisit !== false) return false;
  return deskReadyOf(needsVisit, requestSurveyParts(request, { today }).control);
}

export function surveyJobView({
  request = null, today = null, viewer = {}, people = [], peopleLoading = false, refreshStalled = false,
} = {}) {
  if (!request) return null;
  const { visit, zones, unknown, filesByZone, control } = requestSurveyParts(request, { today, canDecide: viewer.canDecide });
  const visits = Array.isArray(request.surveyVisits) ? request.surveyVisits : (visit ? [visit] : []);
  const filesUnknown = unknown.files === true;
  /* 🔑 ใบนี้ต้องมีนัดเข้าพื้นที่ไหม — คำนวณจากแถวพื้นที่ของใบ (ตัวตัดสินเดียวของทั้งระบบ · `surveyMethod.js`)
     ขั้นของงานกับจุดบนรางถามค่าเดียวกัน ⇒ สองที่ชี้ขั้นเดียวกันเสมอ */
  const needsVisit = surveyNeedsVisit(zones);
  /* ⭐ **งานโต๊ะ** = ใบที่ไม่ต้องมีนัด (ทุกพื้นที่ที่ใช้อยู่ประเมินจากแบบ · mig 0408) — ไม่ลงคิว ไม่มีใครเข้าพื้นที่
     ⇒ ถ้อยคำของงานหน้างาน (ลงคิว · นัด · ช่างส่งงาน) ไม่ถูกพูดกับใบแบบนี้ · ใบผสมยังเป็นงานหน้างานทุกคำ
     `mix` นับเฉพาะพื้นที่ที่ยังใช้อยู่ — แถบแจ้ง ตัวนับ และการ์ดของช่างอ่านจากตัวนี้ */
  const deskJob = needsVisit === false;
  const mix = surveyMethodMix(zones);
  // วันส่งผลที่หัวหน้ารับปากไว้ (ช่องว่างล้วน = ยังไม่มี — กติกาเดียวกับ `stageOf`)
  const deskResultDate = String(request.committedResultDate ?? '').trim();
  const stage = stageOf(request, visit, control, today, {
    filesUnknown, sendBack: request.surveySendBack || null, needsVisit,
  });
  const sent = !!request.answeredAt;
  /* ใบจบแล้ว (ยกเลิก · ปิด · ฝั่งไหนปิดก่อน) = ไม่มีวันให้ทวง ไม่มีคำสั่งให้ใครทำต่อ (ม-145) */
  const finished = ['closed', 'closed-unassessed', 'cancelled', 'closed-early'].includes(stage)
    || (!sent && requestClosureStarted(request));
  /* นัดที่ไม่ได้เข้าพื้นที่และไม่มีชีวิตแล้ว (ทำไม่ได้ · ยกเลิก · เลื่อนแล้ว) — เป็น **ประวัติ** เสมอ */
  const visitDead = !!visit && !holdsRequestSlot(visit) && !reachedSite(visit);
  const dept = request.dept || 'TS';
  /* 🔴 วันที่ผู้ขออยากให้เข้า — ตัวอ่านเดียว (`surveyWishedVisit` · S4 C-5) ห้ามอ่าน `requestedDueDate` ตรง ๆ ในไฟล์นี้:
     ใบที่ยื่นเป็นประเมินจากแบบเก็บกระจกของวันรับผลไว้ในคอลัมน์นั้น */
  const wish = surveyWishedVisit(request);
  const assignee = requestAssignee(request);
  const headWho = `หัวหน้า ${dept}`;
  /* ⭐ เช็คลิสต์ด่านของใบ (ตัวเดียวกับการ์ดของใบประเมิน) — แถวผังของใบผสมนับพื้นที่ลงหน้างาน (`surveyPlanGateShown` · head-r3-53)
     ⚠️ ของงานโต๊ะ: คนที่ถือใบ = ผู้รับผิดชอบบนใบ (หัวหน้าที่รับปากวันส่งผล) · ยังไม่มีชื่อ = "หัวหน้า TS"
        ตัวนับคือ **ด่านขนาด** (พื้นที่ที่ยังใช้อยู่และมีขนาดครบ / พื้นที่ที่ยังใช้อยู่) · เขียน "กรอกขนาดจากแบบแล้ว" ไม่ใช่ "วัดแล้ว"
        — แถบตอนนี้ กล่องขั้นตอน (sales-q2) และการ์ดด่านฝั่งหัวหน้าของใบผสม (head-rc-q11) อ่านคู่เดียวกัน */
  const gates = surveyGateChecklist(zones, filesByZone).map((gate) => surveyPlanGateShown(gate, zones, filesByZone));
  const deskHead = assignee.name || headWho;
  const deskSize = gates.find((gate) => gate.key === 'size') || null;
  const deskSizeText = deskSize?.total > 0 ? `กรอกขนาดจากแบบแล้ว ${deskSize.done} / ${deskSize.total} พื้นที่` : '';
  const helpers = helperNames(visit, people, peopleLoading);
  const totals = surveyTotals(zones);
  const progress = control.progress;
  const closure = requestClosure(request);
  const closureLine = requestClosureLine(request);
  const requesterLabel = requestSideLabel(request, 'requester');
  /* สามท่อนของยอด — แต่ละท่อน (ตัวเลข + หน่วย) ห้ามขาดกลางบรรทัดในพาดหัว "ได้รับผลแล้ว — …" (`headlineKeep` ของขั้น sent) */
  const totalsParts = [
    `${fmtNumber(totals.zones)} พื้นที่`,
    `${num(totals.areaSqm)} ตร.ม.`,
    surveyPackagesLabel(totals),
  ];
  const totalsText = join(...totalsParts);
  const visitWhen = visit ? dayTime(visit.scheduledDate, visit.startTime) : '';
  const lateBy = stage === 'overdue' ? daysBetween(visit.scheduledDate, today) : 0;
  const unableRounds = visits.filter((v) => v.status === 'unable').length;
  /* ⭐ ตัวนับความคืบหน้า — คำเดียวกับการ์ดของใบประเมิน (`control.progress.text` ซึ่งมาจาก `surveyProgressText` ตัวเดียวกัน
     · การ์ดยังไม่ส่งคีย์นี้มา = ประกอบเองด้วยตัวเลขชุดเดียวกัน ⇒ สองจอพูดตรงกันเสมอ)
       ใบลงหน้างาน      "วัดแล้ว a / b พื้นที่" ตัวเดิมทุกตัวอักษร
       ใบผสม            ต่อท้าย " · จากแบบ k" (หัวหน้าเห็น "(หัวหน้ากรอกเอง)")
       ใบจากแบบทั้งใบ    "จากแบบ k พื้นที่"
     ⚠️ พื้นที่จากแบบไม่ถูกเรียกว่า "วัดแล้ว" — ตัวตั้งและตัวหารนับเฉพาะพื้นที่ลงหน้างาน (`surveyFieldProgress`) */
  const progressText = progress.text
    || surveyProgressText({ ...progress, drawing: mix.drawing }, { owner: viewer.canDecide === true });
  const measuredText = progress.total
    ? (filesUnknown ? 'วัดแล้วกี่พื้นที่ ไม่ทราบ (อ่านรูปไม่สำเร็จ)' : progressText)
    : (mix.drawing ? progressText : '');

  /* ── หกขั้น — ชื่อจากราง (ทะเบียน) · เนื้อจากใบจริง ─────────────────────────── */
  /* งานโต๊ะที่ด่านส่งผลผ่านครบชี้ขั้น "ส่งผล" (head-rc-r2-22) — ถามจากขั้นของการ์ดตัวเดียวกัน ไม่ตัดสินซ้ำที่นี่ (สองจอชี้ขั้นเดียวกัน)
     · ตัวเดียวกับ `surveyRequestDeskReady` ที่รางของการ์ด "จัดการคำร้อง" ในโหมดแก้อ่าน */
  const deskReady = deskReadyOf(needsVisit, control);
  const rail = requestRailSteps(request, { visit, needsVisit, deskReady });
  const index = stage === 'closed' || stage === 'closed-unassessed' ? rail.steps.length : rail.index;
  const byId = Object.fromEntries(rail.steps.map((step) => [step.id, step]));
  const person = (name, note = null) => (name ? { name, note } : null);
  const requeue = stage === 'requeue';
  const steps = [];

  steps.push({
    id: 'draft',
    when: request.submittedAt ? stampText(request.submittedAt) : 'ยังไม่ได้ส่ง',
    people: [person(request.requestedByName, request.team ? `ทีม ${request.team}` : null)],
    /* ⭐ "ฝ่ายขายขอ: ประเมินจากแบบ" (S4 C-4) — สิ่งที่ผู้ขอยื่น ไม่ใช่วิธีปัจจุบัน (หัวหน้าสลับรายพื้นที่ได้) · ใบลงหน้างาน = null
       ⇒ `steps` ของผลลัพธ์เท่าของวันนี้ (บรรทัดว่างถูกกรองที่ `timeline` อยู่แล้ว) */
    lines: [surveySalesAskedLine(request), join(
      // งานโต๊ะไม่มีวันเข้าพื้นที่ (กติกาเดียวกับช่องวันของ `dateFacts`) — เหลือวันที่ต้องการผล
      // ยื่นเป็นประเมินจากแบบ = ไม่มีวันที่ขอให้เข้า (คอลัมน์ถือกระจกของวันรับผล · `surveyWishedVisit`)
      !deskJob && wish.known && `ขอเข้า ${dayTime(wish.date, wish.time)}`,
      request.requestedResultDate && `ขอผล ${dayText(request.requestedResultDate)}`,
    )].filter(Boolean),
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
      const gap = liveDue && wish.known ? committedVsRequested(liveDue, wish.date) : null;
      if (gap && stage !== 'overdue' && !finished) queueStep.lines.push({ text: gap.text, tone: gap.tone });
    }
  } else if (request.acknowledgedAt && !finished) {
    queueStep.lines.push('เลือกวัน เวลา และเจ้าหน้าที่ที่จะไป');
  }
  if (unableRounds && !(visitDead && visit.status === 'unable' && unableRounds === 1)) {
    queueStep.lines.push(`เคยไปแล้วเข้าไม่ได้ ${unableRounds} รอบ`);
  }
  /* ⭐ **สองขั้นกลางของงานโต๊ะไม่เล่าเรื่องนัด** (แผน survey-desk-assessment §3.1 · งวด S2a) — ชื่อขั้นของใบแบบนี้คือ
     "รับปากวันส่งผล" กับ "ประเมินจากแบบ" (`DESK_RAIL_LABELS`) ⇒ เนื้อของงานหน้างานวางใต้สองชื่อนี้ไม่ได้:
       นัดเดิมที่ถูกยกเลิกตอนสลับวิธีจะอ่านว่า "ประเมินจากแบบ — ยกเลิก" · ใบที่ไม่เคยมีนัดจะอ่านว่า "รอ TS ลงคิว"
     · ขั้น 3 เหลือเวลาที่หัวหน้ารับปาก (`dueCommittedAt`) · ขั้น 4 ว่าง — แผนไม่ได้ให้ประโยคของสองขั้นนี้ จึงไม่แต่งเอง
     · นัดของใบ (ถ้ามี) ยังอยู่ครบที่คีย์ `visit` ของผลลัพธ์ และรหัสนัดบนแถบตอนนี้ (`now.visitCode`)
     🔴 ไม่มีขั้นไหนของงานโต๊ะเขียน "ไม่เคยลงคิว" / "ไม่ได้เข้าพื้นที่" — พื้นที่จากแบบอาจมาหลังช่างเข้าไปจริงแล้วห้อง
        ยังไม่พร้อม (มติ D3) ประโยคหลังจึงไม่จริงทุกกรณี */
  /* 🔄 S2b แก้หลังตรวจจอ sales-q2 — กล่องของสองขั้นนี้เคยว่าง (ขั้นปัจจุบันที่ไฮไลต์อยู่ดูเหมือนจอโหลดไม่ครบ) ⇒ ใส่ข้อเท็จจริงที่แถบหัวพูดอยู่แล้ว
     · รับปากวันส่งผล = หัวหน้าที่ถือใบ (คนเดียวกับ "… รับผิดชอบ" ของแถบตอนนี้) + "จะส่งผล {วัน}" · ยังไม่รับปาก = ไม่มีของ (ขั้นยังไม่เกิด)
     · ประเมินจากแบบ = "กรอกขนาดจากแบบแล้ว a / k พื้นที่" (ตัวนับเดียวกับแถบตอนนี้) · ไม่มีคำใหม่ */
  const deskPromiseStep = {
    id: 'commitDue',
    when: deskResultDate ? stampText(request.dueCommittedAt) : '',
    people: deskResultDate ? [person(deskHead)] : [],
    visitLink: null,
    lines: deskResultDate ? [`จะส่งผล ${dayText(deskResultDate)}`] : [],
  };
  const deskAssessStep = { id: 'acknowledged', when: '', people: [], lines: deskResultDate && deskSizeText ? [deskSizeText] : [] };
  steps.push(deskJob ? deskPromiseStep : queueStep);

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
      /* ใบผสม: ต่อท้าย " · จากแบบ k" เหมือนบรรทัดระหว่างทำ (S2b แก้หลังตรวจจอ sales-q8 · แผน §2 แถว 9a) — "วัดครบ 2 / 2" บนใบสามพื้นที่
         อ่านเหมือนพื้นที่หายไปหนึ่ง · ใบลงหน้างานล้วน (k = 0) = บรรทัดเดิมทุกตัวอักษร */
      visitStep.lines.push(join(
        visit.actualEndTime && `ส่งงาน ${clock(visit.actualEndTime)}`,
        !filesUnknown && progress.total && `วัดครบ ${progress.done} / ${progress.total} พื้นที่${mix.drawing > 0 ? ` · จากแบบ ${mix.drawing}` : ''}`,
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
  steps.push(deskJob ? deskAssessStep : visitStep);

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
      /* 🐞 UAT S2b S18 — ใบงานโต๊ะไม่มีภาพผังที่มาร์กจุดและไม่มีจุดติดตั้งให้เคาะ: ของที่หัวหน้าทำคือสามข้อของการ์ดด่าน
         ("ขนาด · ภาพแบบ · แพ็คเกจ") · ใบที่ยังต้องมีนัด (ลงหน้างานล้วน · ผสม) = คำเดิมตรงตัว */
      sendStep.lines.push(deskJob
        ? 'เคาะขนาด · ภาพแบบ · แพ็คเกจ แล้วส่งผลให้ฝ่ายขาย'
        : 'เคาะภาพผัง · จุดติดตั้ง · แพ็คเกจ แล้วส่งผลให้ฝ่ายขาย');
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
  /* "ขั้นกลางนี้เกิดขึ้นจริงไหม" — งานหน้างานดูจากนัด (มีนัด · ช่างถึงไซต์) เหมือนเดิมทุกตัวอักษร
     ⭐ งานโต๊ะไม่มีนัดให้ดู ⇒ ถามจากของจริงของมันเอง: รับปากวันส่งผลแล้ว = ขั้น 3 เกิด · ส่งผลแล้ว = ขั้น 4 เกิด
        🐞 ถามจากนัดต่อไป = ใบงานโต๊ะที่รับปากแล้วขึ้น "รับปากวันส่งผล (ข้าม)" และใบที่ส่งผลแล้วขึ้น "ประเมินจากแบบ (ข้าม)"
           ทุกใบ เพราะไม่มีนัด · ตำแหน่งขั้นปัจจุบัน (`index`) ยังเป็นของรางตัวเดิม — ที่นี่แค่ไม่ติ๊ก "ข้าม" ผิดใบ */
  const queueHappened = deskJob ? !!deskResultDate : !!visit;
  /* งานโต๊ะที่พร้อมส่ง (ขั้นปัจจุบัน = ส่งผล) — ขั้นประเมินจากแบบเกิดขึ้นแล้ว ไม่ใช่ "ข้าม" */
  const visitHappened = deskJob ? (sent || deskReady) : (reachedSite(visit) || visit?.status === 'in_progress');
  const timeline = steps.map((step, i) => {
    let state = i < index ? 'done' : i === index ? 'current' : 'pending';
    if (cancelledAt != null) state = i < cancelledAt ? 'done' : 'pending';
    if (stage === 'cancelled' && step.id === 'closed') state = 'cancelled';
    if (step.skipped) state = 'skipped';
    /* 🐞 **ขั้นที่ไม่เคยเกิดห้ามติ๊กผ่าน** — ใบที่ปิด/ส่งผลโดยไม่เคยลงคิว หรือไม่เคยเข้าพื้นที่ ได้ ✓ ทั้งแถว
       เพราะ index ชี้ท้ายราง ⇒ ขั้นที่ผ่านไปแล้วแต่ไม่มีของจริง = "ข้าม" */
    if (state === 'done' && step.id === 'commitDue' && (!queueHappened || byId.commitDue?.state === 'pending')) state = 'skipped';
    if (state === 'done' && step.id === 'acknowledged' && !visitHappened) state = 'skipped';
    const skippedEmpty = state === 'skipped' && !step.when && !(step.lines || []).length;
    /* คำบอกเหตุของขั้นที่ข้ามเป็นของงานหน้างาน — งานโต๊ะไม่มีคิวให้ "ไม่เคยลง" และ "ไม่ได้เข้าพื้นที่" ไม่จริงทุกกรณี ⇒ เว้นว่าง */
    const skippedWhen = deskJob ? ''
      : (step.id === 'commitDue' ? 'ไม่เคยลงคิว' : step.id === 'acknowledged' ? 'ไม่ได้เข้าพื้นที่' : '');
    return {
      ...step,
      when: skippedEmpty ? skippedWhen : step.when,
      number: i + 1,
      // งานโต๊ะใช้ชื่อขั้นของตัวเอง (`DESK_RAIL_LABELS`) — รหัสขั้นและลำดับยังเป็นของรางตัวเดิม
      label: (deskJob && DESK_RAIL_LABELS[step.id]) || byId[step.id]?.label || step.id,
      state,
      people: (step.people || []).filter(Boolean),
      lines: (step.lines || []).filter((line) => (typeof line === 'string' ? line : line?.text))
        .map((line) => (typeof line === 'string' ? { text: line, tone: null } : line))
        /* คู่ "จากแบบ k" ห้ามขาดกลางบรรทัด — จอห่อด้วย `keepPhrases` (S2b แก้หลังตรวจจอ sales-q8 · ราง 1440 ขาดเป็น "จาก" / "แบบ 1")
           · บรรทัดที่ไม่มีคู่นี้ไม่มีคีย์ `keep` (รูปเดิม) */
        .map((line) => { const keep = line.text.match(STEP_LINE_KEEP); return keep ? { ...line, keep } : line; }),
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
  const requesterWho = viewer.isOpener ? 'คุณ' : (request.requestedByName || requesterLabel);
  /* ── ของงานโต๊ะ (แผน §3.1 ตาราง "While waiting") — คนที่ถือใบ (`deskHead`) กับตัวนับ (`deskSize`) คำนวณไว้ต้นฟังก์ชัน ──
     ⚠️ ไม่มีบรรทัด "ต่อไป" — แผนไม่ได้ให้ประโยคสำหรับงานโต๊ะ (ชุดของงานหน้างานพูดเรื่องลงคิว/ช่าง ซึ่งไม่จริงที่นี่) */
  const deskLateBy = stage === 'desk-overdue' ? daysBetween(deskResultDate, today) : 0;
  const nowByStage = {
    /* 🔴 ร่างที่ทุกพื้นที่เกิดมาจากแบบ (S4 สร้างแถวพื้นที่ตอนเปิดใบ) = ไม่มีการลงคิวเข้าพื้นที่ ⇒ ใช้คำของงานโต๊ะ
       (ตัดสินจากธงพื้นที่ `deskJob` ไม่ใช่ `variant` — กติกาเดียวกับราง/ขั้นรอรับเรื่อง) · ลงหน้างาน = ประโยคเดิมทุกตัวอักษร */
    draft: {
      headline: 'ยังไม่ส่งคำร้อง',
      sub: deskJob
        ? `ส่งแล้ว ${headWho} จะรับเรื่องแล้วแจ้งวันส่งผล — ใบนี้ประเมินจากแบบ ไม่มีการเข้าพื้นที่`
        : `ส่งแล้ว ${dept} จะรับเรื่องและลงคิวเข้าพื้นที่`,
      next: 'กด “ส่งคำร้อง” เมื่อกรอกครบ',
      turn: { side: requesterLabel, who: requesterWho },
    },
    /* งานโต๊ะที่ยังไม่รับเรื่อง — คนรับคือหัวหน้า ไม่ใช่ผู้วางคิว และไม่มีการลงคิวตามมา */
    pending: deskJob ? {
      headline: `รอ ${dept} รับเรื่อง`,
      sub: `ใบนี้ประเมินจากแบบ — ไม่มีการเข้าพื้นที่ · ${headWho} จะรับเรื่องแล้วแจ้งวันส่งผล`,
      next: null,
      turn: { side: dept, who: headWho },
    } : {
      headline: `รอ ${dept} รับเรื่อง`,
      sub: join(request.submittedAt && `ส่งเมื่อ ${stampText(request.submittedAt)}`),
      next: `${dept} รับเรื่อง แล้วลงคิววัน เวลา และเจ้าหน้าที่ที่จะไป`,
      turn: { side: dept, who: `ผู้วางคิว ${dept}` },
    },
    'desk-queue': {
      headline: `รอ${headWho} แจ้งวันส่งผล`,
      sub: join(
        'ประเมินจากแบบ — ไม่ลงคิว ไม่มีนัดเข้าพื้นที่',
        request.requestedResultDate && `ผู้ขอต้องการผล ${dayText(request.requestedResultDate)}`,
      ),
      next: null,
      turn: { side: dept, who: headWho },
    },
    'desk-working': {
      headline: `${STAGE_BADGE['desk-working'].label} — จะส่งผล ${dayText(deskResultDate)}`,
      sub: join(`${deskHead} รับผิดชอบ`, deskSizeText),
      next: null,
      turn: { side: dept, who: deskHead },
    },
    'desk-overdue': {
      headline: `เลยวันที่จะส่งผลมา ${deskLateBy} วัน`,
      sub: `${headWho} ส่งผล หรือเลื่อนวันส่งผล`,
      next: null,
      turn: { side: dept, who: deskHead },
    },
    queue: {
      headline: 'รอลงคิวเข้าพื้นที่',
      sub: join(
        request.acknowledgedByName && `รับเรื่องแล้วโดย ${request.acknowledgedByName}`,
        // ยื่นเป็นประเมินจากแบบแล้วหัวหน้าสลับกลับเป็นลงหน้างาน = ไม่มีใครขอวันเข้า ⇒ บอกว่าไม่ได้ระบุ ไม่ใช่วันรับผล (S4 C-5)
        wish.known
          ? `ผู้ขออยากให้เข้า ${dayTime(wish.date, wish.time)}`
          : (surveyFiledAsDrawing(request) && SURVEY_NO_VISIT_WISH_LINE),
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
    /* 🔄 `control.status.resave` — เหลือแค่พื้นที่ที่กลับมาเป็นลงหน้างานหลังนัดปิดแล้ว (มติ O3): ยังไม่ "วัดครบ" และไม่มีอะไรให้ช่างเก็บ
       ⇒ พาดหัวตัวเดียวกับการ์ดของใบประเมิน + ก้าวถัดไปที่ทำได้จริง (🐞 UAT S2b S06: เดิมตก "ช่างส่งงานแล้ว แต่ของหน้างานยังขาด") */
    'awaiting-decision': control.status?.resave === true
      ? {
        headline: control.status.headline,
        sub: join(measuredText, progress.leftText && `เหลือ ${progress.leftText}`),
        next: `${headWho} เปิดพื้นที่ที่กลับมาเป็นลงหน้างานที่ใบประเมิน ตรวจขนาดแล้วกด “บันทึกพื้นที่นี้” → เคาะแล้วกด “ส่งผลให้ฝ่ายขาย”`,
        turn: { side: dept, who: headWho },
      }
      : {
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
      /* งานโต๊ะที่พร้อมส่ง (head-rc-r2-22) — ตาของคนที่ถือใบคนเดิม (`deskHead` ตัวเดียวกับ "กำลังประเมินจากแบบ" / "เลยวันส่งผล")
         🐞 ไม่แยก = ช่อง "ตาใคร" ของใบเดียวกันสลับ ชื่อหัวหน้า → "หัวหน้า TS" → ชื่อหัวหน้า ตามขั้น · ใบลงหน้างาน/ใบผสม = คำเดิม */
      turn: { side: dept, who: deskJob ? deskHead : headWho },
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
  /* ⚠️ สามขั้นของงานโต๊ะ (`desk-…`) ไม่อยู่ในลิสต์โดยตั้งใจ — มาตรวัดคือ "ช่างวัดแล้วกี่พื้นที่" ซึ่งพื้นที่จากแบบไม่เคยนับ */
  const showMeter = progress.total > 0 && !filesUnknown
    && ['measuring', 'awaiting-submit', 'awaiting-decision', 'crew-gaps', 'sent-back', 'ready', 'recalled', 'sent', 'closed'].includes(stage);

  /* ── ตารางพื้นที่ + ด่านสองฝั่ง ─────────────────────────────────────────────── */
  // `allDrawing` = เงื่อนไขเดียวกับหัวคอลัมน์ "แบบ" ของ `surveyZoneTable` (`mix.mode`) — ช่องของแถวกับหัวคอลัมน์ต้องไปด้วยกัน
  const rows = zoneRows(zones, filesByZone, { sent, filesUnknown, dept, allDrawing: mix.mode === 'drawing' });
  const crew = gateCard(gates, 'crew');
  const head = gateCard(gates, 'head');
  const crewStarted = visit?.status === 'in_progress' || reachedSite(visit);
  /* การ์ดของหัวหน้า "เริ่มได้เมื่อช่างส่งงาน" — งานโต๊ะไม่มีช่างให้รอ ⇒ เปิดตั้งแต่แรก (ด่านของพื้นที่จากแบบเป็นของหัวหน้าทั้งหมด)
     🔄 **ใบผสมก็เปิดตั้งแต่แรก** (S2b แก้หลังตรวจจอ head-rc-q11) — พื้นที่จากแบบเป็นงานของหัวหน้าตั้งแต่ต้น ป้าย "ยังไม่เริ่ม" กับ
        "เริ่มได้เมื่อช่างส่งงาน" อ่านว่ายังไม่มีใครทำอะไร · บรรทัดของการ์ดนำด้วยตัวนับของพื้นที่จากแบบ ("กรอกขนาดจากแบบแล้ว a / k พื้นที่")
        แล้วตามด้วยข้อของหัวหน้าคำเดิม · ใบลงหน้างานล้วน = ทางเดิมทุกตัวอักษร */
  const mixedSheet = mix.mode === 'mixed';
  /* ⭐ **ส่วนของพื้นที่จากแบบเอ่ยทั้งขนาดและภาพแบบ** (มติ head-rc-q11 "เอ่ยขนาดกับภาพแบบของพื้นที่จากแบบ" · ผลรีวิวรอบสาม) —
     เช็คลิสต์ของพื้นที่จากแบบล้วน (ชื่อข้อผังเป็น "ภาพแบบ" เอง — `drawingShort` ของทะเบียนด่าน) ⇒ "กรอกขนาดจากแบบแล้ว a / k พื้นที่ · ภาพแบบ b/k"
     และแถว "ภาพผัง" ของการ์ดนี้นับพื้นที่ลงหน้างานล้วน (เช็คลิสต์ของพื้นที่ลงหน้างาน) — ภาพแบบมีที่ของตัวเองแล้ว
     🐞 เดิมภาพแบบโผล่แค่ในตัวนับ "ภาพผัง x/y" และเฉพาะตอนขาด ⇒ "ภาพผัง 1/2" เรียกภาพแบบของพื้นที่จากแบบว่าภาพผัง · มีครบก็ไม่มีคำไหนเอ่ยถึง
     ⚠️ จอเท่านั้น — การ์ดควบคุมของใบประเมิน (`surveyPlanGateShown` · head-r3-53) ไม่มีส่วนภาพแบบแยก จึงยังนับพื้นที่จากแบบที่ขาดในแถวผังของมัน */
  const mixedDrawingGates = mixedSheet ? surveyGateChecklist(zones.filter(isDrawingZone), filesByZone) : [];
  const mixedDrawingSize = mixedDrawingGates.find((g) => g.key === 'size') || null;
  const mixedDrawingPlan = mixedDrawingGates.find((g) => g.key === 'plan') || null;
  const mixedDrawingText = join(
    mixedDrawingSize?.total > 0 && `กรอกขนาดจากแบบแล้ว ${mixedDrawingSize.done} / ${mixedDrawingSize.total} พื้นที่`,
    mixedDrawingPlan?.total > 0 && `${mixedDrawingPlan.short || mixedDrawingPlan.label} ${mixedDrawingPlan.done}/${mixedDrawingPlan.total}`,
  );
  const mixedOnsitePlan = mixedSheet
    ? surveyGateChecklist(zones.filter((z) => !isDrawingZone(z)), filesByZone).find((g) => g.key === 'plan') || null
    : null;
  const headItems = mixedOnsitePlan
    ? head.items.map((item) => (item.key === 'plan'
      ? { ...item, ok: mixedOnsitePlan.ok, done: mixedOnsitePlan.done, total: mixedOnsitePlan.total, zones: mixedOnsitePlan.zones }
      : item))
    : head.items;
  /* ⚠️ "ครบ" ของการ์ดหัวหน้าในใบผสมต้องรวมส่วนของพื้นที่จากแบบที่การ์ดพิมพ์นำหน้า — ด่านขนาดของใบผสมประกาศเป็นของช่าง (`gateCard` ไม่เห็น)
     🐞 ไม่รวม = ป้ายเขียว "ครบ" ข้าง "กรอกขนาดจากแบบแล้ว 0 / 1 พื้นที่" (มีภาพแบบ + แพ็คเกจแล้วแต่ยังไม่มีขนาด) และแถวรวมขึ้น "หัวหน้าเคาะแล้ว"
        (S2b แก้หลังตรวจจอ head-rc-q11 · ผลรีวิวรอบสอง) · ภาพแบบที่ขาดทำให้ `head.ok` เท็จอยู่แล้ว (แถวผังของ `gates` นับพื้นที่จากแบบที่ขาด) — ถามซ้ำ
        เพื่อให้ป้ายกับส่วน "ภาพแบบ b/k" ที่พิมพ์อยู่ไปด้วยกันตรง ๆ · ใบลงหน้างานล้วน / ใบจากแบบทั้งใบ = `head.ok` ตัวเดิม */
  const headOk = head.ok && (!mixedDrawingSize || mixedDrawingSize.ok) && (!mixedDrawingPlan || mixedDrawingPlan.ok);
  const headOpen = deskJob || mixedSheet || reachedSite(visit);
  const changeCounts = surveyChangeCounts(zones);
  const photos = filesUnknown ? { wide: null, plan: null }
    : rows.filter((r) => !r.cut).reduce((acc, r) => ({ wide: acc.wide + r.photosWide, plan: acc.plan + r.photosPlan }), { wide: 0, plan: 0 });

  const site = request.surveySite || null;

  return {
    stage,
    status: STAGE_BADGE[stage] || STAGE_BADGE.queue,
    control,
    /* ⭐ บล็อก "เอกสารประเมินพื้นที่" ของหน้าคำร้อง (PR-3 · สเปก §5.1) — `null` = ไม่มีบล็อก (ไม่มีสิทธิ์ · ยังไม่ส่งผล · Planner)
       ปุ่มมาจากธง `surveyDocument.access` ของ server · ธงของคนดูที่ส่งต่อไปใช้เลือก **ข้อความ** เท่านั้น */
    document: surveyRequestDocumentView({
      surveyDocument: request.surveyDocument,
      request,
      viewer: {
        canOpenSheet: viewer.canWork === true,
        isRequesterSide: viewer.isRequesterSide === true,
        canDecide: viewer.canDecide === true,
      },
      pollStopped: refreshStalled === true,
      /* ใบที่มีพื้นที่จากแบบได้บล็อกเดียวกับใบลงหน้างาน (งวด S3 ถอดข้อพักเอกสาร) — ไม่มีอาร์กิวเมนต์ของวิธีประเมิน */
    }),
    steps: timeline,
    index: Math.min(index, timeline.length),
    current,
    now: {
      step: current ? `ตอนนี้ · ${current.label}` : 'ตอนนี้',
      /* รหัสนัดข้างขั้นปัจจุบัน — จอทำเป็นลิงก์ (ที่เดียวที่กดไปนัดได้ ⇒ ลำดับโฟกัสตรงกับที่ตาเห็นทุกขนาดจอ) */
      visitCode: visit?.code && !visitDead && current && !['draft', 'pending'].includes(current.id) ? visit.code : null,
      headline: nowBase.headline,
      /* วันที่ในพาดหัวของงานโต๊ะ ("กำลังประเมินจากแบบ — จะส่งผล จ. 12 ต.ค.") — จอห่อท่อนนี้ไม่ให้ขาดกลางวันที่บนมือถือ
         (S2b แก้หลังตรวจจอ sales-q10c) · คีย์มีเฉพาะขั้นนั้น — ขั้นอื่นทุกขั้นรูปเดิม */
      ...(stage === 'desk-working' && deskResultDate ? { headlineKeep: [dayText(deskResultDate)] } : {}),
      /* พาดหัวของผลที่ส่งแล้ว ("ได้รับผลแล้ว — 3 พื้นที่ · 125 ตร.ม. · 3 แพ็คเกจ (SM 3)") — ตัดบรรทัดได้ที่ " · " เท่านั้น ไม่ให้ "3" / "แพ็คเกจ"
         แยกบรรทัด (S2b แก้หลังตรวจจอ sales รอบ 27/10 · 768 / 375) · เฉพาะใบที่มีพื้นที่จากแบบ — ใบลงหน้างานล้วนต้องได้รูปก่อนงวด S1
         ทุกตัวอักษร (surveyMethodGolden) */
      ...(stage === 'sent' && mix.drawing > 0 ? { headlineKeep: totalsParts.filter(Boolean) } : {}),
      sub: nowBase.sub || '',
      /* บรรทัดรองตัดได้ที่ " · " / ช่องว่างระหว่างท่อน แต่ไม่แยกตัวเลขจากหน่วยหรือป้าย (S2b แก้หลังตรวจจอ sales รอบ 27/10 · 768 / 375):
         "2 / 3" กับ "พื้นที่" ของงานโต๊ะ · "ปิดแล้ว" กับ "1/2" ของผลที่ส่งแล้ว · เฉพาะใบที่มีพื้นที่จากแบบ — ใบลงหน้างานล้วนรูปเดิม (surveyMethodGolden) */
      ...(stage === 'desk-working' && deskSize?.total > 0 ? { subKeep: [`${deskSize.done} / ${deskSize.total} พื้นที่`] } : {}),
      ...(stage === 'sent' && mix.drawing > 0 ? { subKeep: [`ปิดแล้ว ${closureLine?.done ?? 1}/2`] } : {}),
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
      /* สัดส่วนขนาดของทั้งใบ ("SM 1 · ST 1") — จำนวนรวมเท่ากันแต่ขนาดต่าง = ราคาต่าง · ยังไม่เคาะสักพื้นที่ = '' */
      packageMixText: surveyPackageMixText(totals.packagesBySize),
      photos,
      /* งวด S2b: ช่องรูปของแถวรวม เมื่อใบมีพื้นที่จากแบบ (`null` = ไม่มีพื้นที่จากแบบ หรืออ่านรูปไม่สำเร็จ ⇒ จอวาดช่องเดิม) */
      photosTotalText: surveyPhotosTotalText(rows, zones, mix, { filesUnknown }),
      /* มติ 12/10: ทรงของตารางตามวิธีประเมิน — มีคอลัมน์ภาพกว้างไหม · หัวคอลัมน์สุดท้ายชื่ออะไร · ภาพกว้างรวม (`surveyZoneTable`)
         ใบลงหน้างานล้วน = ทรงของวันนี้ทุกช่อง · จอไม่ตัดสินเอง */
      table: surveyZoneTable(rows, mix, { sent, filesUnknown }),
      measured: { done: progress.done, total: progress.total },
      progressText: join(measuredText, !sent && totals.areaSqm ? `รวมตอนนี้ ${num(totals.areaSqm)} ตร.ม. · ${num(totals.volumeCbm)} ลบ.ม.` : ''),
      changeText: surveyChangeText(changeCounts, { actor: dept }),
      unchanged: !changeCounts.cut && !changeCounts.added,
      /* แถบแจ้งเหนือตารางผล — เฉพาะใบที่ส่งผลแล้วและมีพื้นที่จากแบบ · `null` = ไม่มีแถบ (`surveyDrawingBanner`) */
      drawingBanner: surveyDrawingBanner(request, { show: sent && stage !== 'cancelled', count: mix.drawing, dept }),
      /* ⭐ ใบที่ส่งผลแล้วและทุกพื้นที่ที่ยังใช้อยู่ประเมินจากแบบ (เงื่อนไขเดียวกับหัวคอลัมน์ของตารางสรุปส่งผล `drawnHead` · `mix.mode`)
         ⇒ ช่องจุดของตารางผลเป็น "จุดติดตั้งโดยประมาณ · {n} จุด" ไม่ใช่ "เลือก / ทั้งหมด" (S2b-O9 · มติเจ้าของ 19/10) — จอไม่นับเอง
         ⚠️ คีย์มีเฉพาะใบแบบนั้น — ใบลงหน้างาน/ใบผสมรูปเดิมทุกคีย์ */
      ...(sent && mix.mode === 'drawing' ? { drawingOnly: true } : {}),
      crewGate: {
        ...crew,
        /* ใบจากแบบทั้งใบไม่มีพื้นที่ของช่างเลย — การ์ดนี้เหลือแค่ป้าย "ไม่มีพื้นที่" ⇒ จอถอดทั้งการ์ดได้
           ⚠️ ถามจาก `mix.mode` ไม่ใช่ "ไม่ต้องมีนัด": ใบที่ถูกตัดออกหมด (`empty`) ยังขึ้นการ์ดเหมือนใบที่ตัดหมดของวันนี้ */
        hidden: mix.mode === 'drawing',
        /* 🔄 `control.status.resave` (มติ O3) — เหลือแค่พื้นที่ที่กลับมาเป็นลงหน้างานหลังนัดปิดแล้ว: ไม่มีช่างคนไหนทำอยู่
           งานที่ค้างคือหัวหน้าตรวจขนาดแล้วบันทึกอีกครั้ง ⇒ การ์ดนี้ห้ามขึ้น "กำลังทำ · เหลือ …" สวนกับแถบ "ตาใคร: หัวหน้า"
           (🐞 UAT S2b S06 `o3-desk-back-after-visit`) — พูดประโยคเดียวกับพาดหัวของใบ
           🔄 มติ 26/10 (S2b-O3-sub): นัดล่าสุดยกเลิก/ทำไม่ได้หลังมีนัดที่เข้าพื้นที่แล้ว ก็เข้าทางนี้ (`requestSiteVisitReached`) — ขั้นของใบยัง
              "ต้องลงคิวใหม่" (`stageOf` อ่านนัดล่าสุด) แต่คนที่บันทึกขนาดคือหัวหน้า ไม่ใช่ช่าง ("ยังไม่เริ่ม" อ่านว่ารอช่าง) */
        badge: !crew.hasActive ? { label: 'ไม่มีพื้นที่', tone: 'neutral' }
          : filesUnknown ? { label: 'ไม่ทราบ', tone: 'neutral' }
            : crew.ok ? { label: 'ครบ', tone: 'success' }
              : control.status?.resave === true ? { label: 'รอหัวหน้า', tone: 'warning' }
                : crewStarted ? { label: 'กำลังทำ', tone: 'info' } : { label: 'ยังไม่เริ่ม', tone: 'neutral' },
        text: filesUnknown ? 'อ่านรูปรายพื้นที่ไม่สำเร็จ — ไม่ทราบว่าครบไหม'
          : control.status?.resave === true ? control.status.headline
          : progress.total
            ? join(`ครบ ${progress.done} / ${progress.total} พื้นที่`, progress.leftText && `เหลือ ${progress.leftText}`)
            : '',
      },
      headGate: {
        ...head,
        items: headItems,
        ok: headOk,
        badge: !head.hasActive ? { label: 'ไม่มีพื้นที่', tone: 'neutral' }
          : filesUnknown ? { label: 'ไม่ทราบ', tone: 'neutral' }
            : headOk ? { label: 'ครบ', tone: 'success' } : headOpen ? { label: 'รอเคาะ', tone: 'info' } : { label: 'ยังไม่เริ่ม', tone: 'neutral' },
        text: filesUnknown ? 'อ่านรูปรายพื้นที่ไม่สำเร็จ — ไม่ทราบว่าครบไหม'
          : headOpen || headOk
            ? join(mixedDrawingText, headItems.map((g) => `${g.label} ${g.done}/${g.total}`))
            : 'เริ่มได้เมื่อช่างส่งงาน',
      },
      unknownFiles: unknown.files === true,
    },
    facts: dateFacts(request, visit, today, assignee, { finished, deskJob }),
  };
}
