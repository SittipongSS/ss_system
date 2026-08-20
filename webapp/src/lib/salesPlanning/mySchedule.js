// ── "กำหนดการของฉัน" — กติกาวันที่/ช่วง/การวางบล็อกเวลา (ล้วน ไม่แตะจอ) ──────
//
// ⭐ แดชบอร์ดของฉันตอบว่า "ต้องทำอะไร" (คิว) แต่ไม่เคยตอบว่า **"กี่โมง"** — นัดลูกค้า
// ที่บันทึกจากคิวลีดไม่เคยโผล่ในหน้านี้เลย ทั้งที่เป็นของที่มีเวลาตายตัวชิ้นเดียวของคนขาย
// (มติผู้ใช้ 2026-08-21) ⇒ ส่วนใหม่ "กำหนดการของฉัน" = การ์ดซ้ายสองใบ (นัด · ถึงกำหนด)
// + ปฏิทินขวาที่สลับ วัน/สัปดาห์/เดือน
//
// ⚠️ **สามอย่างที่รวมกันในนี้มีความละเอียดของเวลาไม่เท่ากัน** และนั่นคือกติกาหลัก:
//   นัด (`lead_events.eventAt`) = timestamptz มีเวลาจริง ⇒ วางลงรางชั่วโมงได้
//   งาน (`personal_tasks.dueDate`) · คำร้อง (`dept_requests.committedDueDate`) = วันล้วน
//   ⇒ **ห้ามเดาเวลาให้มัน** ของพวกนี้อยู่แถว "ทั้งวัน" เท่านั้น
//
// ⚠️ **แบ่งช่องวันด้วยเวลาท้องถิ่นของเครื่องผู้ใช้** — `eventAt` เป็น UTC · กติกาเดียว
// กับ `lib/sales/leadCalendar.js` (server ส่งช่วงเผื่อขอบมาให้ แล้วฝั่งจอเป็นคนตัดจริง)

/** มุมมองปฏิทิน — คีย์ตรงกับค่าที่จำไว้ใน localStorage */
export const SCHEDULE_VIEWS = [
  { key: 'day', label: 'วัน' },
  { key: 'week', label: 'สัปดาห์' },
  { key: 'month', label: 'เดือน' },
];
export const SCHEDULE_VIEW_KEYS = SCHEDULE_VIEWS.map((view) => view.key);
export const DEFAULT_SCHEDULE_VIEW = 'week';

/* จำมุมมองล่าสุดไว้ข้ามการเข้าใช้ (มติผู้ใช้ 2026-08-21) — คนที่ทำงานเป็นสัปดาห์กับ
   คนที่ทำงานเป็นวันคนละกลุ่มกัน การรีเซ็ตทุกครั้งคือการบังคับให้กดซ้ำทุกเช้า
   ⚠️ ค่าที่อ่านมาต้องผ่าน `normalizeScheduleView` เสมอ — ค่าที่ค้างจากเวอร์ชันก่อน
   (หรือคนแก้ localStorage เล่น) ต้องตกกลับมาที่ค่าตั้งต้น ไม่ใช่ทำให้ปฏิทินว่างเปล่า */
export const SCHEDULE_VIEW_STORAGE_KEY = 'ss:my-dashboard:schedule-view';

export function normalizeScheduleView(value) {
  return SCHEDULE_VIEW_KEYS.includes(value) ? value : DEFAULT_SCHEDULE_VIEW;
}

// ── รางชั่วโมงของมุมมองวัน ────────────────────────────────────────────────
// ช่วงที่วาด 09:00–18:00 แบ่งช่องละ 30 นาที · นัดนอกช่วงไม่ได้หายไป — ไปอยู่แถบ
// "นอกช่วงเวลาทำงาน" เหนือราง (ดู `splitDayMeetings`)
export const DAY_START_HOUR = 9;
export const DAY_END_HOUR = 18;
export const SLOT_MINUTES = 30;
export const DAY_SLOT_COUNT = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES;

/* ⚠️ **`lead_events` ไม่มีความยาวนัด** (เก็บแต่เวลาเริ่ม) — บล็อกในรางจึงยาว 1 ชั่วโมง
   ตามข้อสมมติ ไม่ใช่ข้อมูลจริง · "เวลาชนกัน" ทั้งหมดในไฟล์นี้อยู่ใต้ข้อสมมตินี้
   ถ้าวันหนึ่งอยากได้ของจริง ต้องเพิ่มคอลัมน์ `durationMin` + ช่องในฟอร์มนัดของคิวลีด */
export const ASSUMED_MEETING_MINUTES = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const pad = (value) => String(value).padStart(2, '0');

/** วัน ISO ของค่าที่รับมา — คืน null ถ้าไม่ใช่วันที่ (ไม่ throw: ข้อมูลเก่ามีค่าเพี้ยนได้) */
export function isoDay(value) {
  const text = String(value || '').slice(0, 10);
  return DATE_RE.test(text) ? text : null;
}

/** วัน ISO ของ timestamp ตาม **เวลาท้องถิ่นของเครื่องที่รัน** (ห้ามใช้ toISOString) */
export function localDayKey(value) {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** เวลา HH:MM ตามเวลาท้องถิ่น */
export function localHhmm(value) {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '';
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** นาทีนับจากเที่ยงคืนตามเวลาท้องถิ่น */
export function localMinutes(value) {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return at.getHours() * 60 + at.getMinutes();
}

export function shiftDays(iso, days) {
  const base = isoDay(iso);
  if (!base) return null;
  const at = new Date(`${base}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export function dayDiff(fromIso, toIso) {
  const a = Date.parse(`${isoDay(fromIso)}T00:00:00Z`);
  const b = Date.parse(`${isoDay(toIso)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / DAY_MS);
}

/** วันในสัปดาห์แบบ 0 = อาทิตย์
 *  ⚠️ **สัปดาห์เริ่มวันอาทิตย์** ให้ตรงกับ `components/ui/MonthGrid` ซึ่งเป็นกริดปฏิทิน
 *  ตัวเดียวของระบบ (มติ 2026-08-08) — แถบสัปดาห์ที่เริ่มวันจันทร์จะทำให้คอลัมน์ของ
 *  สองมุมมองบนหน้าจอเดียวกันเรียงคนละแบบ */
export function weekIndex(iso) {
  const at = new Date(`${isoDay(iso)}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return null;
  return at.getUTCDay();
}

export function startOfWeek(iso) {
  const index = weekIndex(iso);
  return index == null ? null : shiftDays(iso, -index);
}

export function startOfMonth(iso) {
  const base = isoDay(iso);
  return base ? `${base.slice(0, 7)}-01` : null;
}

export function endOfMonth(iso) {
  const base = isoDay(iso);
  if (!base) return null;
  const [year, month] = base.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${base.slice(0, 7)}-${pad(last)}`;
}

/**
 * ช่วงที่ต้องขอจาก API สำหรับมุมมองนั้น
 *
 * ⚠️ **ช่วงที่ขอต้องเท่ากับช่วงที่วาดเป๊ะ** — ช่องที่วาดแต่ไม่ได้ขอข้อมูลมาจะว่างเปล่า
 * โดยที่คนอ่านไม่มีทางรู้ว่าว่างเพราะไม่มีงาน หรือว่างเพราะไม่ได้ขอมา
 */
export function scheduleRange(view, anchorIso) {
  const anchor = isoDay(anchorIso);
  if (!anchor) return null;
  if (view === 'day') return { from: anchor, to: anchor };
  // เดือน = 1 ถึงสิ้นเดือนพอดี — `MonthGrid` เติมช่องหัว/ท้ายเป็นช่องเว้น ไม่ใช่วันของ
  // เดือนข้างเคียง ⇒ ไม่มีช่องไหนต้องใช้ข้อมูลนอกเดือน
  if (view === 'month') return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  const from = startOfWeek(anchor);
  return { from, to: shiftDays(from, 6) };
}

/** เดินหน้า/ถอยหลังตามหน่วยของมุมมอง — ปุ่มลูกศรใช้ตัวนี้ตัวเดียว */
export function shiftAnchor(view, anchorIso, delta) {
  const anchor = isoDay(anchorIso);
  if (!anchor) return null;
  if (view === 'day') return shiftDays(anchor, delta);
  if (view === 'week') return shiftDays(anchor, delta * 7);
  const [year, month] = anchor.split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1 + delta, 1));
  return moved.toISOString().slice(0, 10);
}

/** ทุกวันในช่วง (รวมปลายทั้งสองข้าง) */
export function daysBetween(fromIso, toIso) {
  const from = isoDay(fromIso);
  const to = isoDay(toIso);
  if (!from || !to) return [];
  const out = [];
  for (let cursor = from; cursor && cursor <= to; cursor = shiftDays(cursor, 1)) out.push(cursor);
  return out;
}

/**
 * วันที่เลือกอยู่ยังอยู่ในช่วงที่กางไหม — ถ้าไม่ ให้ย้ายไปวันที่อ่านแล้วไม่งง
 *
 * 🪤 เคสที่ทำให้การ์ดซ้าย "โกหก": กดเปลี่ยนมุมมองหรือเลื่อนสัปดาห์ แล้วหัวการ์ดยังค้าง
 * วันเดิมซึ่งไม่มีช่องไหนบนปฏิทินชี้ถึง ⇒ อ่านเหมือนปฏิทินกับการ์ดคนละเรื่องกัน
 * ⇒ ตกมาที่ "วันนี้ถ้าอยู่ในช่วง" ไม่งั้นเอาวันแรกของช่วง
 */
export function clampSelected(selectedIso, range, todayIso) {
  if (!range) return selectedIso;
  const selected = isoDay(selectedIso);
  if (selected && selected >= range.from && selected <= range.to) return selected;
  const today = isoDay(todayIso);
  if (today && today >= range.from && today <= range.to) return today;
  return range.from;
}

// ── การวางบล็อกในรางชั่วโมง (มุมมองวัน) ───────────────────────────────────

/** ช่องที่นัดใบนี้ตกลง — `slot` = ดัชนีช่วง 30 นาทีนับจาก 09:00 · null = นอกช่วงที่วาด */
export function meetingSlot(at) {
  const minutes = localMinutes(at);
  if (minutes == null) return null;
  const offset = minutes - DAY_START_HOUR * 60;
  if (offset < 0 || minutes >= DAY_END_HOUR * 60) return null;
  return Math.floor(offset / SLOT_MINUTES);
}

/**
 * แยกนัดของวันเป็น "ลงราง" กับ "นอกช่วงเวลาทำงาน"
 *
 * ⚠️ นัดนอกช่วงต้อง **ยังเห็นอยู่** — ตอนแรกเขียนให้ตัดทิ้งเพราะรางไม่มีที่ให้วาง
 * แล้วนัด 08:00 หายไปจากหน้าจอโดยไม่มีอะไรบอก ซึ่งอันตรายกว่าหน้าตาไม่สวย
 */
export function splitDayMeetings(meetings = []) {
  const sorted = [...meetings].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const inWindow = [];
  const outside = [];
  for (const meeting of sorted) {
    const slot = meetingSlot(meeting.at);
    if (slot == null) outside.push(meeting);
    else inWindow.push({ ...meeting, slot });
  }
  return { inWindow, outside };
}

/**
 * รวมนัดที่เวลาคาบกันเป็นก้อนเดียว (ก้อนละหนึ่งแถวในราง)
 *
 * "คาบกัน" = เริ่มห่างกันน้อยกว่า `ASSUMED_MEETING_MINUTES` ⇒ ก้อนที่มีมากกว่าหนึ่งใบ
 * คือ **เวลาชนกัน** ซึ่งเป็นสิ่งที่คนขายต้องเห็นก่อนรับปากนัดใหม่
 */
export function clusterDayMeetings(meetings = []) {
  const { inWindow, outside } = splitDayMeetings(meetings);
  const clusters = [];
  for (const meeting of inWindow) {
    const last = clusters[clusters.length - 1];
    const minutes = localMinutes(meeting.at);
    if (last && minutes - last.minutes < ASSUMED_MEETING_MINUTES) {
      last.items.push(meeting);
      continue;
    }
    clusters.push({ slot: meeting.slot, minutes, items: [meeting] });
  }
  return {
    outside,
    clusters: clusters.map((cluster) => ({
      key: `slot-${cluster.slot}-${cluster.items[0].id}`,
      slot: cluster.slot,
      // ก้อนยาวเท่านัดหนึ่งใบเสมอ (ข้อสมมติ 1 ชม.) — ไม่ยืดตามจำนวนใบในก้อน
      span: ASSUMED_MEETING_MINUTES / SLOT_MINUTES,
      clash: cluster.items.length > 1,
      items: cluster.items,
    })),
  };
}

/** จำนวนคู่ที่เวลาชนกันในชุดนัดของวันเดียว — ใช้บนแถบสรุปของปฏิทิน */
export function clashCount(meetings = []) {
  return clusterDayMeetings(meetings).clusters
    .filter((cluster) => cluster.clash)
    .reduce((sum, cluster) => sum + cluster.items.length - 1, 0);
}

// ── จัดของทั้งช่วงลงเป็นรายวัน ────────────────────────────────────────────

/**
 * `{ iso → { meetings, due, overdueCount } }` สำหรับทุกวันในช่วง
 *
 * ⚠️ **นัดแบ่งช่องด้วย `localDayKey` ส่วนงาน/คำร้องใช้สตริงวันตรง ๆ** — สองอย่างนี้
 * คนละชนิดข้อมูล (timestamp กับ date) การเอากติกาเดียวมาใช้ทั้งคู่คือที่มาของนัด
 * ตอนตีหนึ่งไปโผล่ผิดวัน
 */
export function scheduleByDay({ meetings = [], due = [], from, to } = {}) {
  const map = new Map(daysBetween(from, to).map((iso) => [iso, { iso, meetings: [], due: [] }]));
  for (const meeting of meetings) {
    const key = localDayKey(meeting?.at);
    if (map.has(key)) map.get(key).meetings.push(meeting);
  }
  for (const item of due) {
    const key = isoDay(item?.date);
    if (map.has(key)) map.get(key).due.push(item);
  }
  for (const day of map.values()) {
    day.meetings.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    day.clashes = clashCount(day.meetings);
    day.total = day.meetings.length + day.due.length;
  }
  return map;
}

/** ของทั้งช่วงรวมกัน — เลขบนแถบสรุปต้องนับจากก้อนเดียวกับที่วาด ไม่ใช่นับใหม่ */
export function scheduleTotals(byDay) {
  const days = [...byDay.values()];
  return {
    meetings: days.reduce((sum, day) => sum + day.meetings.length, 0),
    due: days.reduce((sum, day) => sum + day.due.length, 0),
    clashes: days.reduce((sum, day) => sum + day.clashes, 0),
  };
}

// ── งานกับคำร้อง = "ของที่ถึงกำหนด" (วันล้วน) ─────────────────────────────

const TASK_STATUS_LABELS = {
  Pending: 'รอดำเนินการ',
  'In Progress': 'กำลังทำ',
  Waiting: 'รอคนอื่น',
  Completed: 'เสร็จแล้ว',
};

/**
 * แปลงแถวงาน/คำร้องเป็นรูปเดียวกัน — การ์ด "ถึงกำหนด" กับชิปบนปฏิทินอ่านจากก้อนนี้ก้อนเดียว
 *
 * ⚠️ **คำร้องมีวันสองชนิด ห้ามปนกัน** — `committedDueDate` = วันที่ฝ่ายผู้รับ *รับปาก*
 * (ของจริง) · `requestedDueDate` = วันที่ผู้ขอ *อยากได้* (ความหวัง) ⇒ ใบที่ฝ่ายยังไม่
 * รับปากต้องบอกออกมาตรง ๆ ว่ายังไม่มีใครรับปาก ไม่ใช่แสดงวันของผู้ขอเป็นกำหนดส่ง
 */
export function buildScheduleDueItems({ tasks = [], requests = [], todayIso = null } = {}) {
  const out = [];

  for (const task of tasks) {
    const date = isoDay(task?.dueDate);
    if (!date) continue;
    out.push({
      key: `task:${task.id}`,
      kind: 'task',
      id: task.id,
      title: task.title || 'งาน',
      sub: [task.category, task.assignedByName ? `มอบโดย ${task.assignedByName}` : null]
        .filter(Boolean).join(' · '),
      date,
      dateNote: 'ครบกำหนด',
      statusLabel: TASK_STATUS_LABELS[task.status] || task.status || '',
      href: `/pm/tasks/${task.id}`,
      urgent: !!task.urgent,
      ...overdueOf(date, todayIso),
    });
  }

  for (const request of requests) {
    const committed = isoDay(request?.committedDueDate);
    const date = committed || isoDay(request?.requestedDueDate);
    if (!date) continue;
    out.push({
      key: `request:${request.id}`,
      kind: 'request',
      id: request.id,
      title: request.title || request.customerName || 'คำร้อง',
      sub: [request.docNo, request.dept].filter(Boolean).join(' · '),
      date,
      dateNote: committed ? 'ฝ่ายรับปากส่ง' : 'ผู้ขอต้องการรับงาน — ฝ่ายยังไม่รับปาก',
      statusLabel: committed ? 'รอฝ่ายส่งงาน' : 'รอฝ่ายแจ้งกำหนดส่ง',
      href: `/requests/${request.id}`,
      urgent: !!request.urgent,
      /* ⚠️ ใบที่ยังไม่มีใครรับปาก **ไม่ใช่ "เลยกำหนด"** — วันที่ในใบเป็นความต้องการของ
         ผู้ขอ ไม่มีใครผิดสัญญา · ป้ายแดงตรงนี้จะกลายเป็นการโทษฝ่ายที่ยังไม่ได้รับปาก */
      ...(committed ? overdueOf(date, todayIso) : { overdue: false, days: dayDiff(date, todayIso) }),
    });
  }

  return sortScheduleDueItems(out);
}

function overdueOf(date, todayIso) {
  const days = dayDiff(date, todayIso);
  return { overdue: days != null && days < 0, days };
}

/** เรียง: เลยกำหนดก่อน แล้วตามวัน · ด่วนก่อนเมื่อวันเท่ากัน (กติกาเดียวกับคิวของฉัน) */
export function sortScheduleDueItems(items = []) {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return String(a.key).localeCompare(String(b.key));
  });
}
