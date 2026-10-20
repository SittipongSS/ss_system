// ── "งานของดีลนี้" มีนิยามเดียว — การ์ดบนหน้าดีล · ฟีดอัปเดตงาน · ตัวกรองดีลของคิว /sa/tasks ─────────────
//
// 🐞 ที่มา (ตรวจตัวเลข M8c · 20/10/2026): หน้าดีลโหลดงานด้วย `dealId = X OR projectId = P` ⇒ งานของ **ดีลพี่น้อง**
//    ในโครงการเดียวกันติดมาด้วยทั้งหมด (POST งานประทับ `projectId = deal.projectId` ให้ทุกงานของดีลที่ผูกโครงการ
//    และโครงการหนึ่งมีได้หลายดีล — deal↔project N:1) · โครงการ 2 ดีล ดีลละ 2 งาน ⇒ การ์ดทั้งสองดีลบอก "0/4"
//    แต่คิวที่กรองดีลใดดีลหนึ่งเจอแค่ 2 · ฟีด "อัปเดตงาน" ของดีล B ก็ดึงเธรดของงานดีล A มาปน
// ⭐ สาขา `projectId` มีไว้ให้ **งานเดิม** ที่ผูกผ่านไทม์ไลน์เก่า (ไม่มี `dealId`) อย่างเดียว ⇒ นิยาม:
//    งานของดีล X = `dealId = X` หรือ (`projectId = โครงการของ X` และ `dealId` ว่าง)
//    งานที่มี `dealId` ของดีลอื่น **ไม่ใช่** งานของดีลนี้ แม้อยู่โครงการเดียวกัน
// ⚠️ ตัวกรอง DB (`dealTaskOrFilter`) กับตัวตัดสินฝั่ง JS (`isDealTask`) ต้องตอบชุดเดียวกันเสมอ — เทสต์แปลสตริง
//    `.or()` แล้วเทียบกับตัวตัดสินทีละแถว (dealTaskLink.test.mjs)

/** ตัวกรอง PostgREST ของ "งานของดีลนี้" — ส่งเข้า `.or(...)` · ดีลไม่มี id = null */
export function dealTaskOrFilter(deal) {
  if (!deal?.id) return null;
  return deal.projectId
    ? `dealId.eq.${deal.id},and(projectId.eq.${deal.projectId},dealId.is.null)`
    : `dealId.eq.${deal.id}`;
}

/** งานนี้เป็นของดีลนี้ไหม — นิยามเดียวกับ `dealTaskOrFilter` (deal = { id, projectId }) */
export function isDealTask(task, deal) {
  if (!task || !deal?.id) return false;
  if (task.dealId) return task.dealId === deal.id;
  return !!deal.projectId && task.projectId === deal.projectId;
}

/**
 * งานนี้อยู่ในชุด "งานของโครงการ" ไหม — ชุดเดียวกับแท็บงานของหน้าโครงการ (`api/pm/projects/[id]`:
 * `projectId = P OR dealId ∈ ดีลของโครงการ`)
 * @param dealProjectOf (dealId) => projectId ของดีลนั้น (null = ไม่รู้/ไม่มี)
 */
export function isProjectTask(task, projectId, dealProjectOf = () => null) {
  if (!task || !projectId) return false;
  if (task.projectId === projectId) return true;
  return !!task.dealId && dealProjectOf(task.dealId) === projectId;
}

/**
 * แถวที่แท็บงานของ **หน้าโครงการ** โชว์ตามตัวเลือก "ดีลที่แสดง" — ไม่เลือก = ทั้งโครงการ · เลือกดีล = `dealId` ตรงตัว ·
 * "งานกลางโครงการ" = งานที่ไม่มี `dealId` (ผู้เรียกส่งเฉพาะงานของโครงการเข้ามา)
 * ⚠️ ต่างจาก `isDealTask` โดยเจตนา: หน้าโครงการแยก "งานกลาง" เป็นตัวเลือกของตัวเอง (ตัวกรองตัวเดียวกับไทม์ไลน์ ·
 *    `filterTimelineTasks`) ส่วนหน้าดีลรวมงานกลางเข้ากับดีล ⇒ ลิงก์ `projectTasksQueueHref` ต้องพาธง `central`
 *    ไปด้วยให้คิวตอบชุดนี้เป๊ะ (ตรวจตัวเลข M8b · รีวิว 20/10/2026)
 */
export function projectSelectionPasses(task, selections = [], centralMarker = '__central__') {
  if (!task) return false;
  const picks = (selections || []).filter(Boolean);
  return !picks.length || picks.includes(task.dealId || centralMarker);
}

/* ── ธง `?central=` ของลิงก์หน้าโครงการ: งานเดิมของโครงการ (ไม่มี `dealId`) อยู่ในชุดไหม ──────────────────
   🐞 รีวิว M8b: เลือกดีล A (ไม่เลือกงานกลาง) บนหน้าโครงการเห็น "2 งาน" · ลิงก์ `?dealId=A` ลงตัวกรอง `isDealTask`
      ซึ่งรวมงานกลางของโครงการ ⇒ คิวขึ้น 3 · เลือกเฉพาะงานกลางแล้วลิงก์ `?projectId=P` ได้ทั้งโครงการ
   ⇒ ธงมีผลคู่กับตัวกรองที่ลิงก์ตั้งเท่านั้น (ไม่เคยกรองคิวทั้งคิวลำพัง — งานส่วนตัวที่ไม่ผูกดีลไม่ใช่ "งานกลางโครงการ") */
/** คู่กับ `?dealId=` — ตัดงานที่ไม่มี `dealId` (ชุดดีลที่ไม่ได้เลือก "งานกลางโครงการ") */
export const TASK_CENTRAL_EXCLUDE = 'none';
/** คู่กับ `?projectId=` — เหลือแต่งานที่ไม่มี `dealId` (เลือกเฉพาะ "งานกลางโครงการ") */
export const TASK_CENTRAL_ONLY = 'only';

/** อ่าน `?central=` — ค่าอื่น = ไม่มีธง */
export function centralParam(value) {
  return value === TASK_CENTRAL_EXCLUDE || value === TASK_CENTRAL_ONLY ? value : null;
}

/* ── ลิงก์ไปคิว /sa/tasks พร้อมตัวกรองดีล/โครงการ ─────────────────────────────────────────────── */

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** อ่านลิสต์ id จาก query (`a,b,c`) — ค่าที่ไม่ใช่ id ถูกทิ้ง (กันสตริงแปลกไหลเข้า `.in()`/URL) */
export function idListParam(value) {
  return [...new Set(String(value || '').split(',').map((v) => v.trim()).filter((v) => ID_PATTERN.test(v)))];
}

/** id เดี่ยวจาก query — ไม่ใช่ id = '' */
export function idParam(value) {
  const v = String(value || '').trim();
  return ID_PATTERN.test(v) ? v : '';
}

/**
 * อ่านพารามิเตอร์ลิงก์ของคิว (`dealId` · `projectId` · `central`) — ตัวเดียวที่หน้าคิวใช้ (และเทสต์ใช้พิสูจน์ว่าลิงก์ไปกลับตรง)
 * ดีลมาก่อนโครงการ (มีดีล ⇒ ทิ้ง projectId) · ธง `central` ต้องคู่ถูก (`none`↔ดีล · `only`↔โครงการ) ไม่งั้นทิ้ง
 * @param {{ dealId?: string|null, projectId?: string|null, central?: string|null }} raw ค่าดิบจาก URL
 */
export function readTasksQueueLink({ dealId = '', projectId = '', central = '' } = {}) {
  const dealIds = idListParam(dealId);
  const project = dealIds.length ? '' : idParam(projectId);
  const flag = centralParam(central);
  const paired = (flag === TASK_CENTRAL_EXCLUDE && dealIds.length) || (flag === TASK_CENTRAL_ONLY && project) ? flag : null;
  return { dealIds, projectId: project, central: paired };
}

/**
 * ลิงก์คิวงานที่กรองดีล/โครงการไว้แล้ว
 * @param {{ dealIds?: string[], projectId?: string, central?: string|null }} link
 *   `central` — `TASK_CENTRAL_EXCLUDE` คู่กับดีล · `TASK_CENTRAL_ONLY` คู่กับโครงการ (คู่ผิดถูกทิ้ง)
 */
export function tasksQueueHref({ dealIds = [], projectId = '', central = null } = {}) {
  const params = new URLSearchParams();
  const deals = (dealIds || []).filter(Boolean);
  if (deals.length) {
    params.set('dealId', deals.join(','));
    if (central === TASK_CENTRAL_EXCLUDE) params.set('central', TASK_CENTRAL_EXCLUDE);
  } else if (projectId) {
    params.set('projectId', projectId);
    if (central === TASK_CENTRAL_ONLY) params.set('central', TASK_CENTRAL_ONLY);
  }
  const query = params.toString();
  return query ? `/sa/tasks?${query}` : '/sa/tasks';
}

/**
 * ลิงก์ "เปิดหน้างาน" ของหน้าโครงการ — พาชุดที่เลือกไปด้วย (มติเจ้าของ 20/10/2026 · M8b)
 * 🐞 เดิมเลือกดีลศูนย์ตัวหรือหลายตัว = `/sa/tasks` เปล่า ⇒ คิวงานทั้งระบบของคนกด ไม่ใช่งานของโครงการนี้
 * ⭐ คิวต้องได้ **ชุดเดียวกับ `projectSelectionPasses`** (แท็บงานของหน้าโครงการ) — เทสต์เทียบทุกตัวเลือก:
 * · ไม่ได้เลือก = ทั้งโครงการ (`?projectId=P` · `isProjectTask`)
 * · ดีล + งานกลาง = `?dealId=a,b` (`isDealTask` รวมงานกลางของโครงการของดีลมาให้เอง)
 * · ดีลอย่างเดียว = `?dealId=a,b&central=none` (ตัดงานกลาง)
 * · งานกลางอย่างเดียว = `?projectId=P&central=only`
 * @param central ค่าหมุดของตัวเลือก "งานกลางโครงการ" (TIMELINE_CENTRAL)
 */
export function projectTasksQueueHref(projectId, selections = [], central = '__central__') {
  const picks = (selections || []).filter(Boolean);
  const dealIds = picks.filter((value) => value !== central);
  const withCentral = picks.includes(central);
  return tasksQueueHref(dealIds.length
    ? { dealIds, central: withCentral ? null : TASK_CENTRAL_EXCLUDE }
    : { projectId, central: withCentral ? TASK_CENTRAL_ONLY : null });
}
