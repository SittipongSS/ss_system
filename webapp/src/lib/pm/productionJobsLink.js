// ── ลิงก์เข้าคิวงานผลิตที่กรองไว้แล้ว — ต้นทาง (การ์ดภาพรวม · ป้ายเมนู) กับหน้าคิวใช้ชุดเดียวกัน ──
//
// 🐞 (ตรวจตัวกรองทั้งระบบ 08/10 · H8) การ์ด "งานร่างรอวางคิว N" กับ "กำลังผลิต N" บน `/production`
//    พาไป `/production/jobs` เปล่า ๆ ⇒ เปิดมาเจองานเปิดทั้งโรงงาน ไม่ใช่ N งานที่การ์ดบอก · หน้าคิวรู้จัก
//    ตัวกรองร่างอยู่แล้ว (`?count=productionJobs` ของป้ายเมนู ม-118) แต่การ์ดไม่ส่ง · "กำลังผลิต" ไม่มีตัวกรองเลย
// ⭐ ต้นทางสร้างลิงก์ด้วย `productionJobsHref` · หน้าคิวอ่านด้วย `productionJobsFilterFrom` แล้วกรองด้วย
//    `filterProductionJobs` ⇒ เทสต์เทียบเลขบนการ์ด (`productionCounts`) กับแถวที่หน้าคิวโชว์ได้ตรง ๆ
// ⚠️ ตัวกรองนิยามเดียวกับตัวนับของการ์ด (`productionOverview.productionCounts`) — แก้ข้างหนึ่งต้องแก้อีกข้าง
//    (`productionJobsLink.test.mjs` จับให้)
import { isJobWaitingToSchedule } from './productionPlan';

// คีย์ของป้ายเมนู (`menuRegistry` countHref · ม-118) — คงไว้ ลิงก์เก่าที่ผู้ใช้เก็บไว้ยังกรองได้
const NAV_COUNT_KEY = 'productionJobs';

export const PRODUCTION_JOB_FILTERS = Object.freeze({
  // "รอฉันลงมือ" ของคิว = งานร่างที่ยังไม่ถูกวางคิว (ตัวเดียวกับป้ายเมนู)
  draft: Object.freeze({ label: 'รอวางคิว', match: isJobWaitingToSchedule }),
  running: Object.freeze({ label: 'กำลังผลิต', match: (job) => job?.status === 'in_progress' }),
});

/** ลิงก์เข้าคิวที่กรองไว้แล้ว — ตัวกรองที่ไม่รู้จัก = คิวเปล่า */
export function productionJobsHref(filter) {
  if (filter === 'draft') return `/production/jobs?count=${NAV_COUNT_KEY}`;
  if (PRODUCTION_JOB_FILTERS[filter]) return `/production/jobs?filter=${filter}`;
  return '/production/jobs';
}

/** ตัวกรองจาก query string ของหน้าคิว (`URLSearchParams` หรือสตริง) — ไม่มี/ไม่รู้จัก = `null` */
export function productionJobsFilterFrom(search) {
  const params = new URLSearchParams(search ? String(search) : '');
  if (params.get('count') === NAV_COUNT_KEY) return 'draft';
  const key = params.get('filter');
  return Object.hasOwn(PRODUCTION_JOB_FILTERS, key) ? key : null;
}

/** ลิงก์ของปุ่ม "×" ล้างตัวกรอง — หน้าคิวเดิม **ถอดเฉพาะพารามิเตอร์ของตัวกรอง** query อื่นคงไว้
 *  🐞 (รอบตรวจ 19/10) ปุ่ม × เคยล้างแค่ state ⇒ URL ยังเป็น `?count=productionJobs` · กดป้ายเมนูซ้ำ = ไป URL เดิม
 *     ⇒ ตัวอ่านได้ค่าเดิม ไม่มีอะไรเปลี่ยน คิวโชว์งานทั้งโรงงานทั้งที่ป้ายบอก N งาน
 *  ⇒ ตัวกรองอยู่ใน URL ที่เดียว: × เขียน URL ใหม่ (router.replace) · ป้าย/การ์ดพาไป URL ที่มีตัวกรอง */
export function productionJobsClearedHref(search) {
  const params = new URLSearchParams(search ? String(search) : '');
  if (params.get('count') === NAV_COUNT_KEY) params.delete('count');
  params.delete('filter');
  const rest = params.toString();
  return rest ? `/production/jobs?${rest}` : '/production/jobs';
}

export function filterProductionJobs(jobs = [], filter) {
  const rule = PRODUCTION_JOB_FILTERS[filter];
  return rule ? jobs.filter(rule.match) : jobs;
}
