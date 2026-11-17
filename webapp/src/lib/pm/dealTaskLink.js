// ── "งานของดีลนี้" มีนิยามเดียว — การ์ดบนหน้าดีล · ฟีดอัปเดตงาน · ตัวกรองดีลของคิว /sa/tasks ─────────────
//
// 🐞 ที่มา (ตรวจตัวเลข M8c · 20/10/2026): หน้าดีลโหลดงานด้วย `dealId = X OR projectId = P` ⇒ งานของ **ดีลพี่น้อง**
//    ในโครงการเดียวกันติดมาด้วยทั้งหมด · โครงการ 2 ดีล ดีลละ 2 งาน ⇒ การ์ดทั้งสองดีลบอก "0/4" แต่คิวเจอแค่ 2
// ⭐ นิยาม: งานของดีล X = `dealId = X` เท่านั้น
//    งวด P3b-2 ยุบโครงการ: ถอดสาขา "งานเดิมของโครงการที่ไม่มี dealId" (ตรวจ prod 16/11 = 0 แถว) พร้อมลิงก์/ธงของหน้าโครงการ
//    (`?projectId=` · `?central=` — หน้านั้นลบไปใน P3a) · ลิงก์เก่าที่ยังถือสองพารามิเตอร์นี้ = ไม่มีผล
// ⚠️ ตัวกรอง DB (`dealTaskOrFilter`) กับตัวตัดสินฝั่ง JS (`isDealTask`) ต้องตอบชุดเดียวกันเสมอ — เทสต์แปลสตริง
//    `.or()` แล้วเทียบกับตัวตัดสินทีละแถว (dealTaskLink.test.mjs)

/** ตัวกรอง PostgREST ของ "งานของดีลนี้" — ส่งเข้า `.or(...)` · ดีลไม่มี id = null */
export function dealTaskOrFilter(deal) {
  if (!deal?.id) return null;
  return `dealId.eq.${deal.id}`;
}

/** งานนี้เป็นของดีลนี้ไหม — นิยามเดียวกับ `dealTaskOrFilter` (deal = { id }) */
export function isDealTask(task, deal) {
  if (!task || !deal?.id) return false;
  return task.dealId === deal.id;
}

/* ── ลิงก์ไปคิว /sa/tasks พร้อมตัวกรองดีล ─────────────────────────────────────────────── */

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** อ่านลิสต์ id จาก query (`a,b,c`) — ค่าที่ไม่ใช่ id ถูกทิ้ง (กันสตริงแปลกไหลเข้า `.in()`/URL) */
export function idListParam(value) {
  return [...new Set(String(value || '').split(',').map((v) => v.trim()).filter((v) => ID_PATTERN.test(v)))];
}

/**
 * อ่านพารามิเตอร์ลิงก์ของคิว (`dealId`) — ตัวเดียวที่หน้าคิวใช้ (และเทสต์ใช้พิสูจน์ว่าลิงก์ไปกลับตรง)
 * @param {{ dealId?: string|null }} raw ค่าดิบจาก URL
 */
export function readTasksQueueLink({ dealId = '' } = {}) {
  return { dealIds: idListParam(dealId) };
}

/**
 * ลิงก์คิวงานที่กรองดีลไว้แล้ว
 * @param {{ dealIds?: string[] }} link
 */
export function tasksQueueHref({ dealIds = [] } = {}) {
  const deals = (dealIds || []).filter(Boolean);
  if (!deals.length) return '/sa/tasks';
  return `/sa/tasks?${new URLSearchParams({ dealId: deals.join(',') })}`;
}
