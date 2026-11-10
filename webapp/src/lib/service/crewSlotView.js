// ── ตัวเลือกวัน + ช่าง (ตาราง ช่าง × เวลา · P2) — ทุกอย่างที่จอวาด คำนวณที่นี่ ไม่มี React ─────────────────────
//
// ⭐ เจ้าของเลือกแบบ ก (10/11/2026) · ม็อกฉบับสุดท้าย `Final.dc.html` + `FinalPhone.dc.html`
//    (artifact MwnHQt5ELdwgnwAz6YwRjC · แผน ~/ss-team/mockups/ts-crew-picker/PLAN.md · มติใน docs/ts-crew-slot-picker.md)
//    · จอกว้าง = ตาราง 24 ชม. แถวละช่าง จัดกลุ่มตามทีม · ลากบนแถว = เลือกคน + ช่วงเวลา
//    · จอมือถือ = รายชื่อ (ว่างช่วงนี้ก่อน) + แถบวันย่อ 24 ชม. + ปุ่มช่วงเวลาสำเร็จรูป — ข้อมูลกับกติกาชุดเดียวกัน
// ⭐ ตัวคำนวณแกน (แถว · ก้อน · เตือน · ลาก/คลิก) อยู่ที่ `crewSlotGrid.js` (P1) — ไฟล์นี้แปลงเป็นสิ่งที่วาด
// ⚠️ ตำแหน่งก้อนเป็น **ช่อง 15 นาที** (`data-col` / `data-span` 96 ช่อง) ไม่ใช่ `style={{ left }}`
//    — audit:ui นับ `style={{` เป็นหนี้ (เพดานโมดูลส่วนกลางขึ้นไม่ได้) · ทรงเดียวกับตารางห้อง Studio
//    เวลาจริงทุกนาทีอยู่ในข้อความของก้อนเสมอ (ตำแหน่งปัดเป็นช่อง 15 นาทีเพื่อวาดอย่างเดียว)
// ⚠️ **ไม่รู้ = บอกว่าไม่รู้** — โหลดภาระไม่ได้ ⇒ แถวไม่มีตัวเลข ไม่มีก้อน + คำเตือน (ไม่ใช่ "ว่างทุกคน")
import { addDays } from '@/lib/sales/appointmentGrid';
import {
  DAY_MINUTES, DEFAULT_LENGTH, WORK_END, WORK_START,
  hhmm, slotRows, slotWarnings, weekdayOf, workingWindow,
} from './crewSlotGrid';
import { isFreeRow } from './scheduleQueue';
import {
  CREW_GONE_NOTE, CREW_NODATE_TEXT, CREW_RESERVED_TAG, CREW_ROSTER_TEXT, CREW_UNKNOWN_TEXT,
  UNASSIGNED_LABEL, UNASSIGNED_SUB, loadBarCells,
} from './scheduleModal';
import { accessConflict, minutesOf, toHHMM } from './sites';
import { MAX_ASSETS_PER_DAY, projectedDayLoad, workloadText } from './visitLoad';
import { dayText } from './queueWords';

/* ช่องวาด 15 นาที × 96 ช่อง = 24 ชม. (ลากยังปัดทีละ 30 นาทีตามมติ — ช่องวาดละเอียดกว่าเพื่อให้ 08:45 วางตรงที่) */
export const COL_MINUTES = 15;
export const SLOT_COLS = DAY_MINUTES / COL_MINUTES;
export const STRIP_DAYS = 14;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

export const SLOT_VIEW_TEXT = Object.freeze({
  hint: 'ลากบนแถวของช่าง = เลือกคน + ช่วงเวลา (ปัดทีละ 30 นาที) · คลิกช่องเดียว = ยาวเท่าที่ฝ่ายขายขอ',
  hintNoAsk: 'ลากบนแถวของช่าง = เลือกคน + ช่วงเวลา (ปัดทีละ 30 นาที) · คลิกช่องเดียว = ',
  noTime: 'ยังไม่ระบุเวลา — นัดทั้งวัน',
  noPerson: 'ยังไม่เลือกหัวหน้างาน',
  clean: 'ไม่ทับนัดอื่น · อยู่ในเวลาทำการ',
  cleanNoTime: 'ไม่ระบุเวลา ⇒ ไม่เช็กเวลาทับ',
  freeSlot: 'ว่างช่วงนี้',
  freeDay: 'ว่างทั้งวัน',
});

/** ตำแหน่งวาดของช่วง `[start, end)` นาที — `{ col, span }` ในช่อง 15 นาที (อย่างน้อยหนึ่งช่อง · ไม่ล้นสุดวัน) */
export function placeOf(start, end) {
  const s = Math.max(0, Math.min(DAY_MINUTES - COL_MINUTES, Number(start) || 0));
  const col = Math.floor(s / COL_MINUTES);
  const last = Math.max(col + 1, Math.min(SLOT_COLS, Math.ceil((Number(end) || 0) / COL_MINUTES)));
  return { col, span: last - col };
}

/** "3 ชม." · "1 ชม. 30 นาที" · "45 นาที" */
export function lengthText(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${rest} นาที`;
  return rest ? `${h} ชม. ${rest} นาที` : `${h} ชม.`;
}

/* เวลาจบที่แสดง — 23:59 ที่ส่งฟอร์ม (`slotTimes`) อ่านว่า "24:00" บนจอ */
const endText = (end) => (end >= DAY_MINUTES - 1 ? '24:00' : hhmm(end));
export const rangeText = (start, end) => `${hhmm(start)}–${endText(end)}`;

/* ค่าฟอร์ม `HH:MM` → นาที · "23:59" (สุดวันที่ส่งฟอร์ม) = 24:00 */
function minutesOfForm(time) {
  const m = minutesOf(time);
  return m === DAY_MINUTES - 1 ? DAY_MINUTES : m;
}

/** ช่วงที่ฟอร์มถืออยู่ → `{ start, end }` นาที · ไม่ครบคู่ / กลับหัว = null (นัดทั้งวัน) */
export function valueSlot({ startTime = '', endTime = '' } = {}) {
  const start = minutesOf(startTime);
  const end = minutesOfForm(endTime);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

/**
 * วันบนแถบ — 14 วันจากวันนี้ · ★ = วันที่ฝ่ายขายขอ · วันอาทิตย์ = นอกเวลาทำการ (ยังกดได้ — ทางตันถ้าบล็อก)
 * ⭐ วันที่ขอ/วันที่เลือกที่ไกลกว่าแถบ ขึ้นเป็นปุ่มท้ายแถบ (ไม่หายไปจากสายตา)
 * @returns `{ days: [{ date, weekday, weekdayText, today, workday, asked, extra }] }`
 */
export function slotStripDays(todayIso, { count = STRIP_DAYS, askedDate = null, value = null } = {}) {
  if (!DATE_RE.test(String(todayIso || ''))) return { days: [] };
  const dayOf = (date, extra = false) => {
    const weekday = weekdayOf(date);
    return {
      date, weekday, weekdayText: WEEKDAYS[weekday] || '',
      today: date === todayIso, workday: Boolean(workingWindow(date)), asked: date === askedDate, extra,
    };
  };
  const days = Array.from({ length: count }, (_, i) => dayOf(addDays(todayIso, i)));
  const inStrip = new Set(days.map((d) => d.date));
  const extras = [...new Set([askedDate, value].filter((d) => DATE_RE.test(String(d || '')) && !inStrip.has(d)))]
    .sort()
    .map((d) => dayOf(d, true));
  return { days: [...days, ...extras] };
}

/**
 * เลื่อนช่วงเข้าไปในเวลาที่ไซต์ให้เข้า **โดยคงความยาว** — ม็อกฉบับสุดท้าย: ขอ 09:00–12:00 · ไซต์เปิด 10:00 ⇒ 10:00–13:00
 * @returns `{ start, end }` ที่เลื่อนแล้ว · ไม่ต้องเลื่อน / ไซต์ไม่มีเวลา / ยาวกว่าช่วงที่ไซต์เปิด = null
 */
export function fitToAccess(site, slot) {
  if (!site || !slot) return null;
  const from = minutesOf(site.accessFrom);
  const to = minutesOf(site.accessTo);
  if (from === null && to === null) return null;
  const length = slot.end - slot.start;
  let start = slot.start;
  if (from !== null && start < from) start = from;
  if (to !== null && start + length > to) start = to - length;
  if (start === slot.start) return null;
  if ((from !== null && start < from) || start < 0 || start + length > DAY_MINUTES) return null;
  return { start, end: start + length };
}

/**
 * ปุ่มช่วงเวลาสำเร็จรูป (จอมือถือ · ม็อก FinalPhone) — `[{ key, label, start, end }]`
 * · เลื่อนตามไซต์ (ถ้าที่ขอชนช่วงไซต์) · ที่ขอ · เช้า · บ่าย (ยาวเท่าที่ขอ) · ทั้งวัน = เวลาทำการ 08:30–17:30
 * ⚠️ "กำหนดเอง" ไม่อยู่ในลิสต์ — เป็นการเปิดช่องพิมพ์เวลา ไม่ใช่ช่วงเวลา
 */
export function slotPresets({ asked = null, site = null, currentLength = null } = {}) {
  const timed = asked && !asked.allDay;
  const length = timed ? asked.length : (Number(currentLength) > 0 ? Number(currentLength) : DEFAULT_LENGTH);
  const cap = (start, len) => ({ start, end: Math.min(DAY_MINUTES, start + len) });
  const out = [];
  const fitted = timed ? fitToAccess(site, asked) : null;
  if (fitted) out.push({ key: 'site', ...fitted, label: `${rangeText(fitted.start, fitted.end)} · เลื่อนตามไซต์` });
  if (timed) out.push({ key: 'asked', start: asked.start, end: asked.end, label: `${rangeText(asked.start, asked.end)} ที่ขอ` });
  const morning = asked?.allDay ? { start: WORK_START, end: 12 * 60 } : cap(WORK_START, length);
  const afternoon = asked?.allDay ? { start: 13 * 60, end: WORK_END } : cap(13 * 60, length);
  out.push({ key: 'morning', ...morning, label: `เช้า ${rangeText(morning.start, morning.end)}` });
  out.push({ key: 'afternoon', ...afternoon, label: `บ่าย ${rangeText(afternoon.start, afternoon.end)}` });
  out.push({ key: 'allday', start: WORK_START, end: WORK_END, label: `ทั้งวัน ${rangeText(WORK_START, WORK_END)}` });
  const seen = new Set();
  return out.filter((p) => {
    const k = `${p.start}-${p.end}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ภาระที่ "ถ้าเลือก" — ตัวเดียวกับตัวเลือกช่างเดิม (`projectedDayLoad`) ⇒ ตัวเลขตรงกับคำเตือนบรรทัดผลลัพธ์ */
function projectionOf(row, siteLoad) {
  const next = projectedDayLoad(row, siteLoad);
  return {
    text: next.known ? `ถ้าเลือก → ${next.assets}/${MAX_ASSETS_PER_DAY} จุด` : `ถ้าเลือก ${next.visits} นัด`,
    over: next.over,
  };
}

const kindText = (b) => (b.kind === 'reserved' ? `${CREW_RESERVED_TAG} · รอฝ่ายขายคอนเฟิร์ม` : b.kind === 'assist' ? 'ไปช่วย' : 'นัดบนตาราง');
const isNight = (b) => b.end <= WORK_START || b.start >= WORK_END;

function blockView(b) {
  const time = b.endTime ? `${b.startTime}–${b.endTime}` : `${b.startTime} (ไม่รู้เวลาจบ)`;
  const reserved = b.kind === 'reserved' || Boolean(b.reserved);
  return {
    key: `${b.kind}-${b.id || b.code}`,
    ...placeOf(b.start, b.end),
    start: b.start,
    end: b.end,
    kind: b.kind,
    reserved,
    night: isNight(b),
    code: String(b.code || ''),
    time,
    title: `${b.code} ${time} · ${kindText(b)}${b.kind === 'assist' && reserved ? ` (${CREW_RESERVED_TAG})` : ''}`,
  };
}

function chipView(c) {
  const tail = [c.assets ? `${c.assets} จุด` : null, c.assist ? 'ไปช่วย' : null, c.reserved ? CREW_RESERVED_TAG : null].filter(Boolean);
  return { key: `allday-${c.id || c.code}`, text: `ทั้งวัน · ${c.code}${tail.length ? ` · ${tail.join(' · ')}` : ''}` };
}

/**
 * ตัวเลือกทั้งกล่อง — คอมโพเนนต์วาดตามนี้อย่างเดียว
 *
 * @param load   ก้อนภาระดิบ `{ status, visits, workload, closedSince, teams, members }` (`useCrewLoadData`)
 * @param value  `{ date, startTime, endTime, assigneeId }` ที่ฟอร์มถือ
 * @param asked  ที่ฝ่ายขายขอ (`askedSlot`) · null = ไม่มี (งานบริการ/ประเมิน)
 * @param site   ไซต์ (`accessFrom`/`accessTo`/`accessDays`) · null = ไม่รู้ ⇒ ไม่เตือนช่วงไซต์
 * @param siteLoad `{ assets }` ของงานนี้ · null = ไม่รู้ ⇒ "ถ้าเลือก n นัด" (ไม่เดาจุด)
 * @returns `{ state, roster, notice, head, hint, groups, rows, selection, tracks, summary, overview, pinned, unassigned, invalid }`
 */
export function crewSlotView({
  technicians = [], load = null, value = {}, asked = null, site = null, siteLoad = null,
  excludeVisitId = null, allowUnassigned = false, currentName = '', rosterState = 'ready', currentLength = null,
} = {}) {
  const list = Array.isArray(technicians) ? technicians : [];
  const roster = rosterState === 'loading' || rosterState === 'error' ? rosterState : (list.length ? 'ready' : 'empty');
  const dateIso = DATE_RE.test(String(value?.date || '')) ? value.date : '';
  const known = Boolean(dateIso) && load?.status === 'ok' && !(load.closedSince && dateIso < load.closedSince);
  const state = !dateIso ? 'nodate' : known ? 'ok' : 'unknown';
  const slot = valueSlot(value || {});
  const assigneeId = String(value?.assigneeId || '');

  const base = known
    ? slotRows({
      visits: load.visits, workload: load.workload, technicians: list, members: load.members, teams: load.teams,
      dateIso, siteLoad, excludeVisitId,
    }).rows
    : list.map((t) => ({ id: t.id, name: t.name || '', team: t.team || '', blocks: [], allDay: [] }));

  const rows = base.map((row) => {
    const blocks = (row.blocks || []).map(blockView);
    const allDay = (row.allDay || []).map(chipView);
    const overlapping = slot ? blocks.filter((b) => slot.start < b.end && b.start < slot.end) : [];
    const free = known && isFreeRow(row);
    const projection = known ? projectionOf(row, siteLoad) : null;
    const warnings = known && slot ? slotWarnings({ row, start: slot.start, end: slot.end, site, dateIso }) : [];
    const tags = [];
    if (known) {
      if (slot && !overlapping.length) tags.push({ key: 'free-slot', text: free ? SLOT_VIEW_TEXT.freeDay : SLOT_VIEW_TEXT.freeSlot, tone: 'success' });
      else if (!slot && free) tags.push({ key: 'free-day', text: SLOT_VIEW_TEXT.freeDay, tone: 'success' });
      for (const b of overlapping) tags.push({ key: `o-${b.key}`, text: `เวลาทับ ${b.code} ${b.time}${b.reserved ? ` (${CREW_RESERVED_TAG})` : b.kind === 'assist' ? ' (ไปช่วย)' : ''}`, tone: 'warning' });
      for (const b of blocks.filter((x) => x.reserved && !overlapping.includes(x))) tags.push({ key: `r-${b.key}`, text: `${CREW_RESERVED_TAG} ${b.time}`, tone: 'info' });
      for (const c of allDay) tags.push({ key: c.key, text: c.text, tone: 'info' });
      if (projection?.over) tags.push({ key: 'over', text: `เกินภาระ ${MAX_ASSETS_PER_DAY} จุด`, tone: 'danger' });
    }
    const busyText = [...blocks.map((b) => `${b.code} ${b.time} ${kindText(b)}`), ...allDay.map((c) => c.text)].join(' · ');
    return {
      id: row.id,
      name: row.name || '',
      team: row.team || '',
      selected: String(row.id) === assigneeId,
      free,
      freeForSlot: known && (slot ? overlapping.length === 0 : free),
      loadText: known ? (free ? SLOT_VIEW_TEXT.freeDay : `ตอนนี้ ${workloadText(row)}`) : '',
      projection,
      bar: known ? loadBarCells({ now: row.assets, add: siteLoad ? (siteLoad.assets || 0) : 0 }) : null,
      blocks,
      allDay,
      tags,
      warnings,
      a11y: [row.team, known ? (busyText || SLOT_VIEW_TEXT.freeDay) : ''].filter(Boolean).join(' · '),
    };
  });

  const groupMap = new Map();
  for (const row of rows) {
    const key = row.team || '';
    if (!groupMap.has(key)) groupMap.set(key, { key, label: key || 'ไม่ระบุทีม', rows: [] });
    groupMap.get(key).rows.push(row);
  }
  const groups = [...groupMap.values()].sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1));

  const work = workingWindow(dateIso);
  const accessFrom = minutesOf(site?.accessFrom);
  const accessTo = minutesOf(site?.accessTo);
  const hasAccess = accessFrom !== null || accessTo !== null;
  const askedHere = asked && asked.date === dateIso ? asked : null;
  const tracks = {
    work: work ? placeOf(work.start, work.end) : null,
    access: hasAccess ? { ...placeOf(accessFrom ?? 0, accessTo ?? DAY_MINUTES), text: `ไซต์ให้เข้า ${toHHMM(site.accessFrom) || '00:00'}–${toHHMM(site.accessTo) || '24:00'}` } : null,
    asked: askedHere ? { ...placeOf(askedHere.start, askedHere.end), text: askedHere.allDay ? 'ทั้งวัน' : rangeText(askedHere.start, askedHere.end) } : null,
    askedElsewhere: asked && !askedHere ? `ฝ่ายขายขอ ${dayText(asked.date)}` : '',
    accessLabel: hasAccess ? 'ไซต์ให้เข้า' : site ? 'ไซต์ไม่กำหนดเวลา' : 'ไม่รู้ช่วงไซต์',
  };

  const selected = rows.find((r) => r.selected) || null;
  const pinned = assigneeId && !list.some((t) => String(t.id) === assigneeId)
    ? { id: assigneeId, name: currentName || '', note: CREW_GONE_NOTE }
    : null;
  const selection = slot ? { ...slot, ...placeOf(slot.start, slot.end), text: rangeText(slot.start, slot.end) } : null;

  /* บรรทัด "เลือกแล้ว" — ใคร · วัน · เวลา (ยาวเท่าไร · ตรงที่ขอไหม) + ผลต่อภาระ + เตือน */
  const who = selected?.name || pinned?.name || '';
  const sameAsAsk = askedHere && slot && slot.end - slot.start === askedHere.length;
  const when = slot
    ? `${rangeText(slot.start, slot.end)} (${lengthText(slot.end - slot.start)}${sameAsAsk ? ' เท่าที่ขอ' : ''})`
    : SLOT_VIEW_TEXT.noTime;
  /* ⭐ ไม่มีคนที่เลือก ก็ยังต้องเตือนเวลา (นอกเวลาทำการ / นอกช่วงไซต์) — ไม่ผูกกับแถว */
  const warnings = slot
    ? (selected && known ? selected.warnings : slotWarnings({ row: null, start: slot.start, end: slot.end, site, dateIso }))
    : [];
  const dayConflict = !slot && site && dateIso ? accessConflict(site, { date: dateIso }) : null;
  const allWarnings = dayConflict ? [...warnings, { key: 'access-day', text: dayConflict.message, tone: 'warning' }] : warnings;
  const summary = {
    text: dateIso ? `${who || SLOT_VIEW_TEXT.noPerson} · ${dayText(dateIso)} · ${when}` : CREW_NODATE_TEXT,
    load: selected?.projection ? `${selected.projection.text}${selected.projection.over ? ' — เกินภาระ' : ''}` : '',
    warnings: allWarnings,
    clean: !allWarnings.length && Boolean(slot) ? SLOT_VIEW_TEXT.clean : (!slot && dateIso ? SLOT_VIEW_TEXT.cleanNoTime : ''),
  };

  /* แถบภาพรวม 24 ชม. — ก้อนของทุกคน (ไม่ซ้ำ) ให้รู้ว่ามีงานนอกจอทางไหน */
  const seen = new Set();
  const jobs = [];
  for (const row of rows) for (const b of row.blocks) {
    if (seen.has(b.key)) continue;
    seen.add(b.key);
    jobs.push({ key: b.key, col: b.col, span: b.span, start: b.start, end: b.end, night: b.night });
  }
  const freeCount = rows.filter((r) => r.free).length;

  return {
    state,
    roster: { state: roster, text: CREW_ROSTER_TEXT[roster] || '' },
    notice: state === 'unknown' ? CREW_UNKNOWN_TEXT : state === 'nodate' ? CREW_NODATE_TEXT : '',
    head: {
      aside: known ? `วันนั้นว่าง ${freeCount} จาก ${rows.length} คน` : '',
      asideTone: known ? (freeCount ? 'ok' : 'warn') : '',
    },
    hint: asked ? SLOT_VIEW_TEXT.hint : `${SLOT_VIEW_TEXT.hintNoAsk}${lengthText(Number(currentLength) > 0 ? currentLength : DEFAULT_LENGTH)}`,
    groups,
    rows,
    /* จอมือถือ: ว่างช่วงนี้ก่อน (ลำดับเดิมในกลุ่ม) */
    phoneRows: [...rows.filter((r) => r.freeForSlot), ...rows.filter((r) => !r.freeForSlot)],
    selection,
    tracks,
    summary,
    overview: { work: tracks.work, jobs, selection },
    pinned,
    unassigned: allowUnassigned ? { label: UNASSIGNED_LABEL, sub: UNASSIGNED_SUB, selected: !assigneeId } : null,
    invalid: !allowUnassigned && !assigneeId,
  };
}

/** นาทีที่จุดกดบนแถว — `clientX` เทียบกล่องของแถว (แถวกว้าง = 24 ชม.) */
export function minuteAt(clientX, rect) {
  const width = Number(rect?.width) || 0;
  if (!width) return 0;
  return Math.max(0, Math.min(DAY_MINUTES, ((clientX - rect.left) / width) * DAY_MINUTES));
}

/**
 * งานนอกจอ — ปุ่ม "‹ ก่อน 07:00" / "หลัง 18:00 · มีงาน 1 ›" (ม็อกฉบับสุดท้าย)
 * @param from/to ช่วงนาทีที่จอเห็นอยู่
 */
export function offscreenText(jobs = [], { from = 0, to = DAY_MINUTES, selection = null } = {}) {
  const before = jobs.filter((j) => j.end <= from).length;
  const after = jobs.filter((j) => j.start >= to).length;
  const selBefore = Boolean(selection && selection.end <= from);
  const selAfter = Boolean(selection && selection.start >= to);
  const tail = (n, sel) => [n ? `มีงาน ${n}` : '', sel ? 'ช่วงที่เลือก' : ''].filter(Boolean).join(' · ');
  return {
    prev: { disabled: from <= 0, text: `‹ ก่อน ${hhmm(Math.floor(from / 60) * 60)}${tail(before, selBefore) ? ` · ${tail(before, selBefore)}` : ''}`, flagged: Boolean(before || selBefore) },
    next: { disabled: to >= DAY_MINUTES, text: `หลัง ${endText(Math.ceil(to / 60) * 60)}${tail(after, selAfter) ? ` · ${tail(after, selAfter)}` : ''} ›`, flagged: Boolean(after || selAfter) },
  };
}
