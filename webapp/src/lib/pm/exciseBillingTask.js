// ── งานไทม์ไลน์ SA "วางบิลสินค้าก่อนส่ง + ค่าสรรพสามิต" ผูกกับคิวใหม่ (แผนรื้อสรรพสามิต Q21 · มติเจ้าของ 03/11/2026) ──
//
// ⭐ มติ: งานปิดเองเมื่อใบสั่งขายทุกใบของดีลจัดการค่าสรรพสามิตแล้ว · ย้อนการตัดสิน = งานกลับเป็นค้าง · บนงานมีป้ายพาไปหน้า SO
// "จัดการแล้ว" = ไม่อยู่ในคิว "รอออกใบค่าสรรพสามิต" ของ SA (`handoffQueueData.loadAwaitingFiling`) — นิยามเดียวกับแดชบอร์ด
//   ของฉัน · หน้าภาพรวมดีล · ด่านปิดโครงการ ⇒ ออกใบค่าสรรพสามิตแล้ว (รอบไหนกำลังเดินก็นับ) · ตัดสินไม่เรียกเก็บ ·
//   ปิดยอดค้าง · หรือ SO ไม่มีสินค้าที่ต้องยื่นจริง
// ⚠️ ย้อนเฉพาะงานที่ระบบติ๊กเอง (`systemCompletedBy` · mig 0421) — งานที่คนติ๊ก Completed เองไม่แตะ
// ⚠️ ไฟล์บริสุทธิ์ — ตัวซิงก์ (`exciseBillingTaskSync.js`) กับป้ายบนไทม์ไลน์ (หน้าดีล/หน้าโครงการ) ใช้ตัวเดียวกัน

export const EXCISE_BILLING_TASK_SOURCE = 'excise_billing';

/** ขั้นของแม่แบบทุกฉบับ (npd v1/v2 · re-order v1/v2 · service-npd · service-re-order) — ชื่อเดียวกันทุกฉบับ */
export const EXCISE_BILLING_STEP_KEYS = Object.freeze(['npd-43', 'reorder-16']);

/** งาน SA วางบิล + ค่าสรรพสามิต ไหม — จับด้วยคีย์ขั้นของแม่แบบ · งานเก่าที่ไม่มีคีย์ (2 แถว ณ 03/11) จับด้วยชื่อ */
export function isExciseBillingTask(task) {
  if (!task || task.role !== 'SA') return false;
  if (EXCISE_BILLING_STEP_KEYS.includes(task.workflowTemplateStepKey)) return true;
  return /\+\s*ค่าสรรพสามิต/.test(String(task.name || ''));
}

/**
 * แพตช์ของงานที่ต้องเปลี่ยน — `[{ id, prevStatus, patch, projectId, dealId }]`
 * @param dealStates Map ดีล → `{ approvedCount, pendingCount }` (SO อนุมัติที่ยังมีผล · SO ในคิวรอออกใบ)
 * @param closedProjectIds โครงการที่ปิดแล้ว — ห้ามแก้ขั้นตอน (กติกาเดียวกับ route PATCH ของขั้นตอน)
 */
export function exciseBillingTaskUpdates(tasks = [], { dealStates = new Map(), closedProjectIds = new Set(), today, now } = {}) {
  const updates = [];
  for (const task of tasks || []) {
    if (!isExciseBillingTask(task) || !task.dealId || !dealStates.has(task.dealId)) continue;
    if (task.projectId && closedProjectIds.has(task.projectId)) continue;
    const { approvedCount = 0, pendingCount = 0 } = dealStates.get(task.dealId) || {};
    const done = approvedCount > 0 && pendingCount === 0;
    let patch = null;
    if (done && task.status !== 'Completed') {
      patch = {
        status: 'Completed',
        actualStartDate: task.actualStartDate || today,
        actualFinishDate: today,
        systemCompletedAt: now,
        systemCompletedBy: EXCISE_BILLING_TASK_SOURCE,
        updatedAt: now,
      };
    } else if (!done && task.status === 'Completed' && task.systemCompletedBy === EXCISE_BILLING_TASK_SOURCE) {
      // กลับไปค้าง — กติกาเดียวกับ route PATCH ตอนถอยเป็น Pending (ล้างวันเริ่ม/วันเสร็จของจริง)
      patch = {
        status: 'Pending',
        actualStartDate: null,
        actualFinishDate: null,
        systemCompletedAt: null,
        systemCompletedBy: null,
        updatedAt: now,
      };
    }
    if (patch) updates.push({ id: task.id, prevStatus: task.status, patch, projectId: task.projectId || null, dealId: task.dealId });
  }
  return updates;
}

/**
 * ป้ายบนงานในไทม์ไลน์ (`TimelineWorkspace.stepBadgeFor`) — null = ไม่มีป้าย
 * @param awaiting SO ในคิวรอออกใบค่าสรรพสามิต `[{ id, orderNumber, dealId }]` (ลำดับของคิว SA)
 */
export function exciseBillingStepBadge(task, awaiting = []) {
  if (!isExciseBillingTask(task)) return null;
  const mine = (awaiting || []).filter((order) => !task.dealId || order.dealId === task.dealId);
  if (mine.length) {
    return {
      tone: 'warning',
      label: `รอออกใบค่าสรรพสามิต ${mine.length} ใบ`,
      title: `ใบสั่งขายที่ยังไม่ออกใบค่าสรรพสามิต: ${mine.map((order) => order.orderNumber || order.id).join(', ')}`,
      href: `/sales-planning/sales-orders/${encodeURIComponent(mine[0].id)}`,
    };
  }
  if (task.systemCompletedBy === EXCISE_BILLING_TASK_SOURCE) {
    return {
      tone: 'success',
      label: 'ออกใบค่าสรรพสามิตครบ',
      title: 'ระบบติ๊กเสร็จให้ — ใบสั่งขายทุกใบของดีลออกใบค่าสรรพสามิตหรือตัดสินไม่เรียกเก็บแล้ว',
    };
  }
  return null;
}
