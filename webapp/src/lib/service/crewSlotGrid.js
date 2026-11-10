// ── ตารางช่าง × เวลา ของตัวเลือกวัน + ช่าง (ตัวเลือก TS · P1 · มติเจ้าของ 10/11/2026) — ตัวตัดสินล้วน ─────────────
//
// ⭐ เจ้าของเลือกแบบ ก (ม็อก artifact MwnHQt5ELdwgnwAz6YwRjC · แผน ~/ss-team/mockups/ts-crew-picker/PLAN.md):
//    "รู้ว่าใครไปวันไหนกี่โมง ซึ่งจะรู้สล็อตเวลา" — ยืมทรงตารางห้อง Studio (`lib/sales/appointmentGrid.js`) มาเป็นแถวของช่าง
//    · ตาราง **ครอบ 24 ชม.** (งานดึกมีได้) · เวลาทำการ จ–ส 08:30–17:30 (นอกนั้น + วันอาทิตย์ = พื้นจาง แต่ยังเลือกได้)
//    · ลากปัดทีละ 30 นาที · พิมพ์เวลาเองได้ทุกนาที · คลิกช่องเดียว = ยาวเท่าที่ฝ่ายขายขอ
// ⭐ ตัวเลขภาระมาจาก `crewLoadPeople` ตัวเดียวกับหน้าจัดคิว/ตัวเลือกช่างเดิม ⇒ ภาระคนเดียวกันวันเดียวกันตรงกันทุกจอ
//    · นัด "ทั้งวัน" (ไม่ระบุเวลา) วาดเป็นชิปท้ายแถว แต่ **นับในภาระ** (ไม่งั้นตารางโล่งหลอกตาว่าว่าง)
// ⚠️ ทับกัน / เกินภาระ / นอกช่วงไซต์ = **เตือน ไม่ห้าม** (กติกาเดิมของ TS · ต่างจาก Studio ที่ชนแล้วบล็อก)
// ⚠️ เวลาทั้งหมดเป็น **นาทีนับจากเที่ยงคืน** ช่วงครึ่งเปิด [เริ่ม, จบ) — จบ 10:00 กับเริ่ม 10:00 ไม่ทับ
import { crewLoadPeople, freeCrewOn } from './scheduleQueue';
import { teamByUser } from './crewTeams';
import { accessConflict, minutesOf, toHHMM } from './sites';
import { MAX_ASSETS_PER_DAY } from './visitLoad';
import { isLiveVisit, isReservedDraft } from './visitStatus';

export const DAY_MINUTES = 24 * 60;
export const SLOT_STEP = 30;
/* เวลาทำการของ TS (มติเจ้าของ 10/11): จันทร์–เสาร์ 08:30–17:30 · อาทิตย์ไม่มีเวลาทำการ */
export const WORK_START = 8 * 60 + 30;
export const WORK_END = 17 * 60 + 30;
export const WORK_DAYS = Object.freeze([1, 2, 3, 4, 5, 6]);
/* ไม่มีที่ฝ่ายขายขอ และไม่มีความยาวเดิมของนัด = 1 ชม. (ค่าตั้งต้นที่ยังไม่ได้ถาม · บอกไว้ในแผน) */
export const DEFAULT_LENGTH = 60;
/* นัดที่รู้แค่เวลาเริ่ม — วาดยาวเท่านี้ และติดธงว่าไม่รู้เวลาจบ */
export const OPEN_END_LENGTH = 60;

export const SLOT_TEXT = Object.freeze({
  overCap: `เกินภาระ ${MAX_ASSETS_PER_DAY} จุด`,
  offHours: 'นอกเวลาทำการ (จ–ส 08:30–17:30)',
  offDay: 'วันอาทิตย์ — นอกเวลาทำการ',
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clamp = (m) => Math.max(0, Math.min(DAY_MINUTES, m));
const dateOf = (visit) => String(visit?.scheduledDate || '').slice(0, 10);

/** "HH:MM" ของนาที · 24:00 (สุดวัน) = "23:59" — ตัวตรวจเวลาทั้งระบบรับถึง 23:59 (`([01]\d|2[0-3]):[0-5]\d`) */
export function hhmm(minutes) {
  const m = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(Number(minutes) || 0)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** วันในสัปดาห์ของวันที่ (0 = อาทิตย์) — เลขคณิตปฏิทินล้วน ไม่ขยับโซน */
export function weekdayOf(dateIso) {
  if (!DATE_RE.test(String(dateIso || ''))) return null;
  return new Date(`${dateIso}T00:00:00Z`).getUTCDay();
}

/** เวลาทำการของวันนั้น `{ start, end }` · วันอาทิตย์ = null (ทั้งวันนอกเวลาทำการ) */
export function workingWindow(dateIso) {
  const wd = weekdayOf(dateIso);
  return wd !== null && WORK_DAYS.includes(wd) ? { start: WORK_START, end: WORK_END } : null;
}

/** ปัดลงช่อง 30 นาที (ขอบซ้ายของช่องที่นิ้ว/เมาส์อยู่) */
export const snapDown = (m, step = SLOT_STEP) => clamp(Math.floor(clamp(m) / step) * step);
/** ปัดขึ้นช่อง 30 นาที */
export const snapUp = (m, step = SLOT_STEP) => clamp(Math.ceil(clamp(m) / step) * step);

/**
 * ลากบนแถว → ช่วงเวลา `{ start, end }` — ลากซ้ายหรือขวาก็ได้ · ปัดเป็นช่อง 30 นาทีที่ครอบจุดเริ่ม–จุดปล่อย · อย่างน้อยหนึ่งช่อง
 * @param from/to นาทีจากเที่ยงคืนตรงจุดกดและจุดปล่อย (ผู้เรียกแปลงจากพิกัด)
 */
export function dragToSlot(from, to, { step = SLOT_STEP } = {}) {
  const a = Math.min(Number(from) || 0, Number(to) || 0);
  const b = Math.max(Number(from) || 0, Number(to) || 0);
  const start = snapDown(a, step);
  let end = snapUp(b, step);
  if (end <= start) end = Math.min(DAY_MINUTES, start + step);
  return { start: Math.min(start, DAY_MINUTES - step), end };
}

/**
 * ที่ฝ่ายขายขอ (จากคำขอคิว) → `{ date, start, end, allDay, length }` · ไม่มีวัน = null
 * ⭐ ขอ "ทั้งวัน" (ไม่ระบุเวลา) = เวลาทำการของวันนั้น (มติ 10/11) · วันอาทิตย์ที่ขอทั้งวัน = 08:30–17:30 เหมือนกัน
 */
export function askedSlot({ requestedDate = null, requestedStartTime = null, requestedEndTime = null } = {}) {
  if (!DATE_RE.test(String(requestedDate || ''))) return null;
  const start = minutesOf(requestedStartTime);
  const end = minutesOf(requestedEndTime);
  if (start !== null && end !== null && end > start) return { date: requestedDate, start, end, allDay: false, length: end - start };
  return { date: requestedDate, start: WORK_START, end: WORK_END, allDay: true, length: WORK_END - WORK_START };
}

/**
 * คลิกช่องเดียว (ไม่ลาก) → `{ start, end }` — เริ่มที่ขอบช่อง · ยาวเท่าที่ฝ่ายขายขอ (มติ 10/11)
 * · ขอ "ทั้งวัน" = เวลาทำการ 08:30–17:30 ทั้งก้อน (ไม่ขึ้นกับจุดที่คลิก)
 * · ไม่มีที่ขอ = ความยาวเดิมของนัด (ตอนแก้) · ไม่มีอีก = 1 ชม.
 * · ล้นเที่ยงคืน = ดันเวลาเริ่มถอยให้จบที่สุดวันพอดี (ไม่ตัดความยาวทิ้งเงียบ ๆ)
 */
export function clickSlot(minute, { asked = null, currentLength = null } = {}) {
  if (asked?.allDay) return { start: asked.start, end: asked.end };
  const length = asked?.length || (Number(currentLength) > 0 ? Number(currentLength) : DEFAULT_LENGTH);
  let start = snapDown(minute);
  let end = start + length;
  if (end > DAY_MINUTES) { end = DAY_MINUTES; start = Math.max(0, end - length); }
  return { start, end };
}

/* บล็อกของนัดหนึ่งใบบนแถวของคนหนึ่ง — ไม่มีเวลาเริ่ม = null (ไปเป็นชิป "ทั้งวัน") */
function blockOf(visit, kind) {
  const start = minutesOf(visit.startTime);
  if (start === null) return null;
  const end = minutesOf(visit.endTime);
  const known = end !== null && end > start;
  return {
    id: visit.id ?? null,
    code: visit.code || visit.id || '',
    siteId: visit.siteId || null,
    kind,
    start,
    end: known ? end : Math.min(DAY_MINUTES, start + OPEN_END_LENGTH),
    endUnknown: !known,
    startTime: toHHMM(visit.startTime) || null,
    endTime: known ? toHHMM(visit.endTime) : null,
  };
}

const helpersOf = (visit) => [...new Set((Array.isArray(visit?.assistantIds) ? visit.assistantIds : []).filter(Boolean))]
  .filter((id) => id !== visit?.assigneeId);

/**
 * แถวของตาราง — หนึ่งแถวต่อช่างหนึ่งคน (ลำดับตามรายชื่อ) + กลุ่มตามทีม
 * @param visits     นัดที่ตัวโหลดภาระส่งมา (ร่างอื่นถูกกรองแล้ว · ร่างที่จองไว้มาด้วย — `?view=load`)
 * @param siteLoad   `{ assets, packs }` ของงานที่กำลังนัด — ใช้คิด "ถ้าเลือก → x/12"
 * @param excludeVisitId นัดที่กำลังแก้ (ไม่นับเป็นภาระ/บล็อกของตัวเอง)
 * @returns `{ rows, groups }` · row = `{ id, name, team, visits, assets, packs, assisting, reserved, projected, over,
 *          blocks: [{ kind: 'live'|'reserved'|'assist', start, end, code, … }], allDay: [{ id, code, assets }] }`
 */
export function slotRows({
  visits = [], workload = {}, technicians = [], members = [], teams = [], dateIso, siteLoad = null, excludeVisitId = null,
} = {}) {
  const list = (visits || []).filter((v) => v && (!excludeVisitId || v.id !== excludeVisitId));
  const people = crewLoadPeople({
    visits: list, dateIso, workload, technicians,
    crewByUser: teamByUser(members || []),
    teamNames: new Map((teams || []).map((t) => [t.code, t.name])),
  });
  const seen = new Set();
  const dayVisits = list.filter((v) => {
    if (dateOf(v) !== dateIso || !(isLiveVisit(v) || isReservedDraft(v))) return false;
    if (v.id != null) { if (seen.has(v.id)) return false; seen.add(v.id); }
    return true;
  });
  const pointsOf = (v) => Number((workload instanceof Map ? workload.get(v.siteId) : workload?.[v.siteId])?.assets) || 0;
  const add = Number(siteLoad?.assets) || 0;

  const rows = people.map((person) => {
    const blocks = [];
    const allDay = [];
    for (const v of dayVisits) {
      const reserved = isReservedDraft(v);
      if (v.assigneeId === person.id) {
        const blk = blockOf(v, reserved ? 'reserved' : 'live');
        if (blk) blocks.push(blk); else allDay.push({ id: v.id ?? null, code: v.code || v.id || '', assets: pointsOf(v), reserved });
      } else if (helpersOf(v).includes(person.id)) {
        const blk = blockOf(v, 'assist');
        if (blk) blocks.push({ ...blk, reserved }); else allDay.push({ id: v.id ?? null, code: v.code || v.id || '', assets: 0, assist: true, reserved });
      }
    }
    blocks.sort((a, b) => a.start - b.start || String(a.code).localeCompare(String(b.code)));
    const projected = person.assets + add;
    return { ...person, blocks, allDay, projected, over: projected > MAX_ASSETS_PER_DAY };
  });

  const groupMap = new Map();
  for (const row of rows) {
    const key = row.team || '';
    if (!groupMap.has(key)) groupMap.set(key, { key, label: key || 'ไม่ระบุทีม', rows: [] });
    groupMap.get(key).rows.push(row);
  }
  /* ทีมที่มีชื่อก่อน (ตามลำดับที่พบในรายชื่อ) · "ไม่ระบุทีม" ท้ายสุด */
  const groups = [...groupMap.values()].sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1));
  return { rows, groups };
}

/**
 * เตือนของช่วงที่เลือกบนแถวหนึ่ง — `[{ key, text, tone }]` (ไม่มีข้อไหน = ว่าง/ผ่าน) · **เตือนเท่านั้น ไม่ห้าม**
 * · ทับนัดของคนนั้น (บนตาราง / จองไว้ / ไปช่วย) · เกินภาระ 12 จุด · นอกช่วงที่ไซต์ให้เข้า · นอกเวลาทำการ
 */
export function slotWarnings({ row = null, start, end, site = null, dateIso = null } = {}) {
  const out = [];
  if (row) {
    for (const b of row.blocks || []) {
      if (start < b.end && b.start < end) {
        const time = b.endTime ? `${b.startTime}–${b.endTime}` : b.startTime;
        const tail = b.kind === 'reserved' || b.reserved ? ' (จองไว้)' : b.kind === 'assist' ? ' (ไปช่วย)' : '';
        out.push({ key: `overlap-${b.id || b.code}`, text: `เวลาทับ ${b.code} ${time}${tail}`, tone: 'warning' });
      }
    }
    if (row.over) out.push({ key: 'over', text: `${SLOT_TEXT.overCap} (ถ้าเลือก ${row.projected}/${MAX_ASSETS_PER_DAY})`, tone: 'danger' });
  }
  const conflict = site ? accessConflict(site, { date: dateIso, startTime: hhmm(start), endTime: end >= DAY_MINUTES ? '23:59' : hhmm(end) }) : null;
  if (conflict) out.push({ key: 'access', text: conflict.message, tone: 'warning' });
  const work = workingWindow(dateIso);
  if (!work) out.push({ key: 'offday', text: SLOT_TEXT.offDay, tone: 'info' });
  else if (start < work.start || end > work.end) out.push({ key: 'offhours', text: SLOT_TEXT.offHours, tone: 'info' });
  return out;
}

/**
 * แถบวัน — ว่างกี่คนต่อวัน `[{ date, free, total }]` (นับ "จองไว้"/ไปช่วย ว่าไม่ว่าง · `freeCrewOn` ตัวเดียวกับการ์ด)
 * @param dates วันในแถบ (YYYY-MM-DD)
 */
export function dayStripCounts({ visits = [], technicians = [], dates = [], excludeVisitId = null } = {}) {
  const list = (visits || []).filter((v) => v && (!excludeVisitId || v.id !== excludeVisitId));
  return (dates || []).map((date) => {
    const { free, total } = freeCrewOn(list, date, technicians);
    return { date, free: free.length, total, workday: Boolean(workingWindow(date)) };
  });
}

/**
 * ตารางเปิดมาเลื่อนไปที่ไหน (นาที) — ช่วงทำงานของวันนั้น (มติ 10/11): 08:30 เว้นแต่ที่ฝ่ายขายขอหรือนัดแรกของวันเช้ากว่า
 * · ถอยหนึ่งชั่วโมงให้เห็นบริบทก่อนหน้า · ปัดลงเป็นต้นชั่วโมง
 */
export function slotScrollStart({ rows = [], asked = null } = {}) {
  const starts = [WORK_START];
  if (asked && !asked.allDay) starts.push(asked.start);
  for (const row of rows || []) for (const b of row.blocks || []) starts.push(b.start);
  const first = Math.min(...starts);
  return Math.max(0, Math.floor((first - 60) / 60) * 60);
}

/** ช่วงที่เลือก → ค่าที่ฟอร์ม/API รับ `{ startTime, endTime }` (24:00 = "23:59") */
export const slotTimes = ({ start, end }) => ({ startTime: hhmm(start), endTime: end >= DAY_MINUTES ? '23:59' : hhmm(end) });
