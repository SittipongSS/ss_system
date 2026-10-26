// ── โมดูล "งานบริหาร" (mgmt) — ค่าคงที่ + label + helper (pure) ─────────
// ใช้ได้ทั้ง client + server. สถานะ/ลำดับ/flag ตรงกับต้นแบบ Apps Script
// ("แผนติดตามงาน"). ปีเก็บเป็น ค.ศ. ใน DB, แปลง พ.ศ. ตอนแสดง.

// สถานะงาน (4) — key ในเครื่อง = อังกฤษ, label = ไทยตามต้นแบบ.
export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'cancelled'];
export const TASK_STATUS_LABELS = {
  todo: 'รอเริ่ม',
  in_progress: 'กำลังดำเนิน',
  done: 'เสร็จสมบูรณ์',
  cancelled: 'ยกเลิก',
};

// ลำดับความสำคัญ (2).
export const TASK_PRIORITIES = ['normal', 'urgent'];
export const TASK_PRIORITY_LABELS = { normal: 'ปกติ', urgent: 'ด่วน' };

// flag ติดตามผลของการประชุม.
export const MEETING_FOLLOWUPS = ['none', 'follow'];
export const MEETING_FOLLOWUP_LABELS = { none: 'ไม่ติดตาม', follow: 'ติดตามต่อ' };

export const isDoneStatus = (status) => status === 'done';
export const isOpenStatus = (status) => status === 'todo' || status === 'in_progress';

/* "รอฉันลงมือ" ของงานบริหาร = งานที่ยังไม่จบและ **มอบหมายให้ฉัน** (ม-116)
   ⚠️ คนละตารางกับ "งานของฉัน" ใต้ระบบขาย (`personal_tasks`) — งานจากที่ประชุม
   อยู่ `mgmt_tasks` ⇒ ป้ายสองตัวนี้นับคนละก้อน ไม่ใช่ตัวเลขซ้ำ
   ⚠️ ผู้สั่งงาน (คนสร้าง) ไม่นับ — งานที่เรามอบให้คนอื่นไม่ใช่งานที่รอเรา
   (กติกาเดียวกับ `myTasksTodoCount` ที่ตัด assignedBy ออก) */
export const isMyOpenTask = (task, userId) => Boolean(userId)
  && isOpenStatus(task?.status)
  && task?.assigneeId === userId;

/* "งานด่วนที่ยังไม่เสร็จ" — การ์ด KPI + กล่องงานด่วนของ /mgmt (`/api/mgmt/overview` → `urgent`) และมุมมอง
   `?view=urgentOpen` ของ /mgmt/tasks เรียกตัวนี้ตัวเดียว (ตรวจตัวเลข L4 · 2026-10-26)
   🐞 เดิม route นับเงื่อนไขของตัวเอง ส่วนลิงก์ "งานด่วน — ยังไม่เสร็จ" พาไป /mgmt/tasks เปล่า = งานทุกใบของปีปัจจุบัน */
export const isUrgentOpenTask = (task) => task?.priority === 'urgent' && isOpenStatus(task?.status);

/* ── ลิงก์ /mgmt/tasks ที่กรองไว้แล้ว (ตรวจตัวเลข L4) ──────────────────────────────────────────────
   ⭐ **URL เป็นแหล่งเดียวของปี · สถานะ · มุมมอง** (กติกาที่แทน ม-115 "อ่านครั้งเดียว" · docs/requests-rd-decision-log.md)
   — การ์ด KPI ของ /mgmt พาไปพร้อมปีที่เลือกอยู่ (เดิมหน้ารายการเปิดที่ปีปัจจุบันเสมอ) · × / "ล้าง" = เขียน URL ใหม่
   `waitingOnMe` = `?count=mgmtTasks` ของป้ายเมนู (ม-116 · menuRegistry `countHref`) */
export const MGMT_TASKS_COUNT_PARAM = 'mgmtTasks';
export const MGMT_TASKS_URGENT_OPEN_VIEW = 'urgentOpen';
export const MGMT_TASKS_URGENT_OPEN_LABEL = 'งานด่วนที่ยังไม่เสร็จ';

export function mgmtTasksHref({ year = null, status = '', urgentOpen = false, waitingOnMe = false } = {}) {
  const q = new URLSearchParams();
  if (Number.isFinite(Number(year)) && Number(year) > 0) q.set('year', String(Number(year)));
  if (TASK_STATUSES.includes(status)) q.set('status', status);
  if (urgentOpen) q.set('view', MGMT_TASKS_URGENT_OPEN_VIEW);
  if (waitingOnMe) q.set('count', MGMT_TASKS_COUNT_PARAM);
  const s = q.toString();
  return s ? `/mgmt/tasks?${s}` : '/mgmt/tasks';
}

/** อ่านลิงก์กลับ — ค่าที่ไม่รู้จักทิ้ง (ปีที่อ่านไม่ออก = ปีตั้งต้น · สถานะแปลก = ทุกสถานะ) */
export function readMgmtTasksLink(searchParams, { defaultYear } = {}) {
  const get = (key) => (searchParams && typeof searchParams.get === 'function' ? searchParams.get(key) : null);
  const year = Number(get('year'));
  const status = get('status') || '';
  return {
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : defaultYear,
    status: TASK_STATUSES.includes(status) ? status : '',
    urgentOpen: get('view') === MGMT_TASKS_URGENT_OPEN_VIEW,
    waitingOnMe: get('count') === MGMT_TASKS_COUNT_PARAM,
  };
}

/** แถวของ /mgmt/tasks หลังธงจากลิงก์ (ก่อนคำค้น) — ธงทั้งสองตัดเพิ่ม ไม่ใช่สลับกัน */
export function mgmtTaskLinkRows(tasks = [], { urgentOpen = false, waitingOnMe = false } = {}) {
  return (tasks || []).filter((t) => (!waitingOnMe || t._waitingOnMe) && (!urgentOpen || isUrgentOpenTask(t)));
}

/* %เสร็จ (live badge) = สัดส่วนงานที่ done จากงานที่ไม่ถูกยกเลิก.
   ⚠️ **คืนค่าดิบ ไม่ปัด** — จอเป็นคนจัดรูปแบบด้วย `fmtPercent` (ทศนิยม 2 ตำแหน่ง
   ตามมติ "เปอร์เซ็นต์บนจอทุกตัว = ทศนิยม 2 ตำแหน่ง") · ถ้าปัดที่นี่ ทศนิยมหายไป
   ตั้งแต่ต้นทาง แล้วจอจะได้แค่ ".00" หลอก ๆ ที่ไม่ใช่ตัวเลขจริง
   (ผู้เรียกมีที่เดียว: /api/mgmt/overview → หน้า /mgmt ซึ่งจัดรูปแบบก่อนพิมพ์ทั้งสองจุด) */
export function completionPercent(tasks) {
  const counted = (tasks || []).filter((t) => t.status !== 'cancelled');
  if (!counted.length) return 0;
  const done = counted.filter((t) => isDoneStatus(t.status)).length;
  return (done / counted.length) * 100;
}

// นับจำนวนงานตามสถานะ (ใช้โดนัท/KPI หน้า Overview).
export function statusCounts(tasks) {
  const out = { todo: 0, in_progress: 0, done: 0, cancelled: 0 };
  for (const t of tasks || []) {
    if (out[t.status] != null) out[t.status] += 1;
  }
  return out;
}

/* ── ปี: เก็บ ค.ศ. · แสดง ค.ศ. ────────────────────────────────────────
   เคยมี toBuddhistYear/toGregorianYear คู่หนึ่งไว้แปลงตอนแสดงผล — ถอดออกพร้อมกับ
   ที่ระบบเปลี่ยนเป็น **ปี ค.ศ. ทั้งระบบ** (มติผู้ใช้ 2026-08-05 ดู lib/datePeriods)
   ⇒ ถ้าจะเอา พ.ศ. กลับมา ให้กลับมาที่ชั้นแสดงผลกลางที่เดียว อย่าเขียน +543
     กระจายรายหน้าอีก (ของเดิมมี 15 จุดใน 8 ไฟล์) */
// ปี ค.ศ. ของ date string ('YYYY-MM-DD') — null ถ้าไม่มีวันที่.
export function yearOf(dateStr) {
  if (!dateStr) return null;
  const y = Number(String(dateStr).slice(0, 4));
  return Number.isFinite(y) ? y : null;
}
