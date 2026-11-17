// ── เอกสารไทม์ไลน์ FM-PD-05 ของดีล (ตัวแปลงเป็นรูปที่ buildGanttPrintHTML อ่าน) ────────────────────────
//
// ⭐ งวด P2b ยุบดีล/โครงการ (มติเจ้าของ 13/11/2026):
//   ① เลขที่เอกสาร = **รหัสดีล + Rev.** ทุกดีล — เลิกยืมเลข PT/รหัส PJ ของโครงการ (เดิมดีลในโครงการพิมพ์ PT-…-0
//      เลขเดียวกันทุกดีลในโครงการ)
//   ② ผู้ประสานงาน (AC) + ผู้ตรวจสอบ = ช่องบนดีล (`acOwnerName` · `aeSupervisorName` · mig 0435)
//      ถอยไปค่าของโครงการเมื่อดีลยังว่าง (ดีลที่เกิดหลัง backfill 0435 ผ่านปุ่มสร้างโครงการ) แล้วค่อย metadata เดิม
//      🐞 กระดาษเดิมพิมพ์ `projects.preparedBy` ในช่อง AC ซึ่งตรงกับ AC จริงแค่ 105/341 ใบ (ส่วนใหญ่ = คนกดสร้างโครงการ)
//   • ผู้ดูแล (AE) = เจ้าของดีลสดเสมอ
//   • Rev. บนเอกสารสด: ยังไม่เคยออก/แก้หลังออก = ไม่ปั๊มเลข Rev. ทางการ (liveTimelineRev) · พิมพ์ฉบับเก่าส่ง rev มาเอง
//   • มาตรฐานฟอร์ม: ที่ตรึงใน snapshot ของ Rev. > ที่โครงการตรึงไว้ > ที่เผยแพร่อยู่ (ganttPrint ตัดสินลำดับสุดท้าย)
import { liveTimelineRev } from './dealTimelineRevisions.js';

/**
 * @param {object} deal แถวดีล (หรือ snapshot.deal ของ Rev. เก่า)
 * @param {object} overview { projectTasks, projectProducts, project, timelineRevision }
 * @param {object} [options] { rev, revDate, standard } — ส่งมาเมื่อพิมพ์ Rev. ที่ออกแล้ว
 */
export function dealTimelineDocument(deal = {}, overview = {}, options = {}) {
  const tasks = Array.isArray(overview.projectTasks) ? overview.projectTasks : [];
  const projectProducts = Array.isArray(overview.projectProducts) ? overview.projectProducts : [];
  const project = overview.project || null;
  const isIssuedPrint = Object.prototype.hasOwnProperty.call(options, 'rev');
  const rev = isIssuedPrint ? options.rev : liveTimelineRev(deal);
  const revDate = isIssuedPrint
    ? (options.revDate ?? null)
    : (rev == null ? null : (overview.timelineRevision?.revisedAt ?? null));

  return {
    id: `deal-${deal.id || 'timeline'}`,
    // รหัสดีลเป็นเลขที่เอกสาร (ไม่มีเลข PT แยก) — ganttPrint ต่อ "-Rev." ให้เอง
    code: deal.code || '',
    docNumber: deal.code || '',
    timelineDocBase: null,
    timelineDocNumber: null,
    timelineStandardSnapshot: options.standard || project?.timelineStandardSnapshot || null,
    name: deal.title || '',
    productName: deal.title || '',
    customerName: deal.customerName || deal.customer?.name || project?.customerName || '',
    aeOwner: deal.ownerName || deal.metadata?.aeOwner || project?.aeOwner || '',
    // ช่อง "ผู้ประสานงาน (AC)" — ไม่ fallback เป็นเจ้าของดีล (AE) · ว่างไว้ถ้ายังไม่ได้ระบุ AC
    // (ชื่อ field ยังเป็น preparedBy ตามสคีมาเดิมของกระดาษ — คำบนเอกสารเปลี่ยน สคีมาไม่เปลี่ยน)
    preparedBy: deal.acOwnerName || project?.acOwner || deal.metadata?.preparedBy || '',
    aeSupervisor: deal.aeSupervisorName || project?.aeSupervisor || deal.metadata?.aeSupervisor || '',
    startDate: deal.startDate || project?.startDate || '',
    dueDate: deal.endDate || deal.expectedCloseDate || project?.dueDate || '',
    status: deal.stage || '',
    metadata: {
      ...(deal.metadata || {}),
      brand: deal.metadata?.brand || deal.brand || project?.metadata?.brand || '',
    },
    // แถว "โครงการ/ประเภท" บนหัวกระดาษ = ดีลใบนี้ใบเดียว (เดิมไล่ทุกดีลในโครงการ)
    deals: deal.title ? [{ id: deal.id, title: deal.title, dealType: deal.dealType, metadata: deal.metadata }] : [],
    categoryFallback: deal.categoryCode || project?.productMainCategory || project?.productSubCategory || '',
    projectProducts,
    tasks,
    rev,
    revDate,
  };
}
