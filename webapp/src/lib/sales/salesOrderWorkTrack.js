// ── เส้นเดินงานของใบสั่งขาย — logic ล้วน ────────────────────────────────
//
// ⭐ **เส้นเดียวสามช่วง ไม่ใช่สามเส้นขนาน** (มติผู้ใช้ 2026-08-13)
// บรีฟกลิ่นจบก่อนถึงสั่งของ · ของครบก่อนถึงผลิต ⇒ มันต่อกัน ไม่ได้เดินพร้อมกัน
// วาดขนานคือโกหกลำดับงาน และจำนวนจุดไม่เท่ากัน (5·3·4) ทำให้ตาเทียบข้ามแถวไม่ได้
//
// ⚠️ แยกสองสถานะนี้ให้ขาด:
//   · **ไม่เกี่ยวกับใบนี้เลย** (ใบไม่มีบรรทัดออกแบบกลิ่น) ⇒ ช่วงนั้น **หายไปทั้งช่วง**
//   · **เกี่ยวแต่ยังไม่เชื่อม** ⇒ ขึ้นกล่องชวนกด ไม่ใช่จุดเปล่า ๆ ที่ไม่บอกว่าต้องทำอะไร
import { REQUEST_STATUS_LABELS } from '@/lib/requests/statuses';
import { JOB_STATUS_LABELS } from '@/lib/pm/productionPlan';

/** จุดของแต่ละช่วง — ลำดับต้องตรงกับสถานะจริงของโมดูลเจ้าของงาน */
export const SCENT_STEPS = ['draft', 'pending', 'acknowledged', 'answered', 'closed'];
export const DELIVERY_STEPS = ['linked', 'arriving', 'complete'];
export const JOB_STEPS = ['draft', 'planned', 'in_progress', 'done'];

const SHORT_SCENT = {
  draft: 'ร่าง', pending: 'รอรับเรื่อง', acknowledged: 'กำลังทำ', answered: 'ตอบแล้ว', closed: 'ปิดเรื่อง',
};
const DELIVERY_LABELS = { linked: 'ผูกรายการ', arriving: 'ของทยอยเข้า', complete: 'ครบทุกรายการ' };
const SHORT_JOB = {
  draft: 'ร่าง', planned: 'วางคิวแล้ว', in_progress: 'กำลังผลิต', done: 'ผลิตเสร็จ',
};

/** จุดถึงไหนแล้ว → รายการจุดพร้อมสถานะ done/live/late/todo */
function markSteps(keys, labels, activeIndex, { late = false } = {}) {
  return keys.map((key, index) => ({
    key,
    label: labels[key] || key,
    state: index < activeIndex ? 'done'
      : index === activeIndex ? (late ? 'late' : 'live')
        : 'todo',
  }));
}

function scentSegment(scent, orderId) {
  if (!scent?.hasDesignLines) return null; // ไม่เกี่ยวกับใบนี้ → หายทั้งช่วง
  const request = scent.existing;
  if (!request) {
    // ⭐ งานพัฒนากลิ่นเริ่มที่ SO ไม่ใช่ที่หน้าคำร้อง (มติผู้ใช้ 2026-08-08) — พาไปพร้อม
    // ใบที่เลือกไว้แล้ว และ `returnTo` กลับมาที่ใบเดิม ไม่ใช่โยนไปหน้าคิวรวม
    // ⚠️ ผูกกับ `scentBriefEntry.test.mjs` — สาม query นี้ต้องครบ ไม่งั้นฟอร์มเปิดมาเปล่า
    const back = `/sa/sales-orders/${orderId}`;
    return {
      key: 'scent',
      label: 'บรีฟกลิ่น',
      state: 'todo',
      connect: {
        message: scent.blocked || 'ยังไม่ได้เปิดคำร้องพัฒนากลิ่นสำหรับใบนี้',
        actionLabel: scent.blocked ? null : 'เปิดคำร้องพัฒนากลิ่น',
        href: scent.blocked || !orderId
          ? null
          : `/requests/new?kind=scent_dev&salesOrderId=${encodeURIComponent(orderId)}&returnTo=${encodeURIComponent(back)}`,
      },
      meta: scent.count != null ? `${scent.count} กลิ่น` : null,
    };
  }
  const index = Math.max(0, SCENT_STEPS.indexOf(request.status || 'pending'));
  const done = request.status === 'closed';
  return {
    key: 'scent',
    label: 'บรีฟกลิ่น',
    state: done ? 'done' : 'live',
    steps: markSteps(SCENT_STEPS, SHORT_SCENT, done ? SCENT_STEPS.length - 1 : index),
    statusLabel: REQUEST_STATUS_LABELS[request.status] || request.status,
    meta: scent.count != null ? `${scent.count} กลิ่น` : null,
    link: { label: request.docNo || 'เปิดคำร้อง', href: `/requests/${request.id}` },
  };
}

function deliverySegment(readiness, projectId) {
  if (!readiness || readiness.state === 'unknown') {
    return {
      key: 'delivery',
      label: 'ของเข้า',
      state: 'todo',
      connect: {
        message: 'ยังไม่ผูกรายการของเข้ากับใบนี้',
        actionLabel: 'ผูกที่ไทม์ไลน์โครงการ',
        href: projectId ? `/sa/projects/${projectId}?tab=timeline` : null,
      },
    };
  }
  // 🔴 "เลยกำหนด" ไม่ใช่ขั้นถัดจาก "รอของ" — เป็น *สุขภาพ* ของขั้นเดียวกัน
  //    จึงระบายจุดกลางเป็นแดง ไม่ใช่เพิ่มจุดที่สี่
  // มีรายการผูกแล้ว = จุดแรกผ่านไปแล้วเสมอ ⇒ ยังไม่ครบก็อยู่ที่จุดกลางทุกกรณี
  const complete = readiness.state === 'ready';
  const activeIndex = complete ? DELIVERY_STEPS.length - 1 : 1;
  return {
    key: 'delivery',
    label: 'ของเข้า',
    state: complete ? 'done' : readiness.state === 'blocked' ? 'late' : 'live',
    steps: markSteps(DELIVERY_STEPS, DELIVERY_LABELS, activeIndex, { late: readiness.state === 'blocked' }),
    statusLabel: readiness.label,
    meta: readiness.total ? `มาแล้ว ${readiness.arrived}/${readiness.total}` : null,
    link: projectId ? { label: 'จัดการที่โครงการ', href: `/sa/projects/${projectId}?tab=timeline` } : null,
  };
}

function productionSegment(plan, { approved }) {
  if (!plan || plan.state === 'none') {
    return {
      key: 'production',
      label: 'ผลิต',
      state: 'todo',
      connect: {
        // ⚠️ ใบที่ยังไม่อนุมัติ "ยังไม่มีงานผลิต" เป็นเรื่องปกติ ไม่ใช่สิ่งที่ต้องชวนให้กด
        // (ระบบกวาดร่างจาก SO ที่อนุมัติแล้วให้เอง — ดู isJobWaitingToSchedule)
        message: approved ? 'ยังไม่มีงานผลิตที่ผูกกับใบนี้' : 'งานผลิตจะเกิดหลังใบนี้อนุมัติ',
        actionLabel: approved ? 'เปิดคิวงานผลิต' : null,
        href: '/production/jobs',
      },
    };
  }
  const order = { draft: 0, planned: 1, running: 2, done: 3 };
  const index = order[plan.state] ?? 0;
  return {
    key: 'production',
    label: 'ผลิต',
    state: plan.state === 'done' ? 'done' : plan.state === 'draft' ? 'late' : 'live',
    steps: markSteps(JOB_STEPS, SHORT_JOB, index, { late: plan.state === 'draft' }),
    statusLabel: plan.label,
    meta: plan.jobs?.length ? `${plan.jobs.length} งานผลิต` : null,
    link: { label: 'เปิดคิวงานผลิต', href: '/production/jobs' },
  };
}

/**
 * รวมเป็นเส้นเดียว — คืน `{ segments, current }` หรือ `null` เมื่อไม่มีช่วงไหนเกี่ยวเลย
 * `current` = ช่วงที่ใบนี้ "ติดอยู่" ตอนนี้ (ช่วงแรกที่ยังไม่ done)
 */
export function salesOrderWorkTrack({ scent, readiness, plan, orderId, projectId, approved = false } = {}) {
  const segments = [
    scentSegment(scent, orderId),
    deliverySegment(readiness, projectId),
    productionSegment(plan, { approved }),
  ].filter(Boolean);

  if (!segments.length) return null;
  const current = segments.find((s) => s.state !== 'done') || segments[segments.length - 1];
  return { segments, current };
}
