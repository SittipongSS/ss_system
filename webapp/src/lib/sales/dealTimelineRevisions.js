// ── Rev. ไทม์ไลน์ของดีล (งวด P2b ของการยุบดีล/โครงการ · มติเจ้าของ 13/11/2026) ─────────────────────
//
// ① เลขที่เอกสาร FM-PD-05 = รหัสดีล + Rev. · Rev. ต้องเก็บ (ส่งลูกค้าแล้วต้องปรับได้)
// โมเดลเดียวกับ Rev. ของโครงการ (mig 0040/0045) ย้ายมาอยู่บนดีล:
//   • `sales_deals.timelineRev` = Rev. ที่ live ตรงอยู่ (ว่าง = ยังไม่เคยออก = ฉบับร่าง) — ย้อนถอยได้
//   • `sales_deals.timelineRevStale` = แก้ขั้นตอนหลังออก Rev. (trigger mig 0435 ตั้งให้เอง)
//   • เลข Rev. ใหม่ = สูงสุดที่เคยออก + 1 (ไม่ใช่ timelineRev + 1 — ย้อนแล้วออกใหม่ต้องไม่ชนเลขเดิม)
//   • ประวัติ `deal_timeline_revisions` · ย้อนผ่าน RPC `deal_restore_timeline_revision` (mig 0436)
// ไฟล์นี้บริสุทธิ์ (ไม่ต่อฐาน) — route ประกอบข้อมูลแล้วเรียกใช้

export const TIMELINE_STANDARD_KEY = 'projectTimeline';

// ช่องของดีลที่ตรึงลง snapshot — พอให้พิมพ์ Rev. เก่าซ้ำได้หน้าตาเดิม (หัวเอกสาร · ผู้ลงชื่อ · หมวด)
// ⚠️ ไม่เก็บเงิน/ยอดขาย: snapshot ถูกอ่านผ่านสิทธิ์ดูดีล ไม่ต้องมีด่านตัดยอดแบบ projectProducts ของโครงการ
export const DEAL_SNAPSHOT_FIELDS = Object.freeze([
  'id', 'code', 'title', 'dealType', 'line', 'stage', 'customerId', 'customerName', 'brand', 'categoryCode',
  'ownerId', 'ownerName', 'acOwnerId', 'acOwnerName', 'aeSupervisorId', 'aeSupervisorName',
  'startDate', 'endDate', 'expectedCloseDate', 'projectId', 'metadata',
]);

const PROJECT_SNAPSHOT_FIELDS = Object.freeze([
  'id', 'code', 'name', 'line', 'productMainCategory', 'productSubCategory', 'startDate', 'dueDate',
  'acOwner', 'aeSupervisor', 'metadata',
]);

const pick = (row, fields) => (row ? Object.fromEntries(fields.filter((k) => k in row).map((k) => [k, row[k]])) : null);

/** snapshot ของ Rev. = { deal, project, tasks, standard } — ถ่ายจากฐาน ณ ตอนออก (route เป็นคนอ่าน ไม่เชื่อจอ) */
export function buildDealTimelineSnapshot({ deal, project = null, tasks = [], standard = null }) {
  return {
    deal: pick(deal, DEAL_SNAPSHOT_FIELDS),
    project: pick(project, PROJECT_SNAPSHOT_FIELDS),
    tasks: [...(tasks || [])].sort((a, b) => Number(a.stepOrder ?? 0) - Number(b.stepOrder ?? 0)),
    // มาตรฐานเอกสาร (รหัสฟอร์ม/Rev. ของแบบฟอร์ม) ที่ใช้ตอนออก — พิมพ์ซ้ำต้องได้หัวฟอร์มเดิม
    standard: standard || null,
  };
}

/** เลข Rev. ถัดไป · ยังไม่เคยออก = 0 */
export function nextTimelineRev(maxRev) {
  const n = Number(maxRev);
  return maxRev == null || !Number.isFinite(n) ? 0 : n + 1;
}

/** Rev. ที่พิมพ์บนเอกสาร live — แก้หลังออก Rev. (stale) หรือยังไม่เคยออก = ไม่ปั๊มเลข Rev. ทางการ */
export function liveTimelineRev(deal) {
  if (deal?.timelineRev == null || deal?.timelineRevStale) return null;
  return deal.timelineRev;
}

/** ป้ายบนหัวแผงไทม์ไลน์ — { label, title, stale } */
export function timelineRevBadge(deal) {
  const rev = deal?.timelineRev;
  if (rev == null) return { label: 'ฉบับร่าง', title: 'ยังไม่ออกเวอร์ชัน (ฉบับร่าง)', stale: false };
  if (deal.timelineRevStale) {
    return {
      label: `Rev. ${rev} • แก้แล้ว`,
      title: `แก้ไขหลังออก Rev. ${rev} — เนื้อหาปัจจุบันต่างจากเวอร์ชันทางการ กรุณาออก Rev. ใหม่เพื่อยืนยัน`,
      stale: true,
    };
  }
  return { label: `Rev. ${rev}`, title: `เวอร์ชันเอกสารล่าสุด: Rev. ${rev}`, stale: false };
}

/** ข้อความผลการย้อน (จอใช้) */
export function restoreSummaryText(result, revNo) {
  const changed = (result?.recreated || 0) + (result?.overwritten || 0) + (result?.deleted || 0);
  if (!changed) return `Rev. ${revNo} เหมือนสถานะปัจจุบันอยู่แล้ว — ไม่มีอะไรเปลี่ยน`;
  return `ย้อนกลับไป Rev. ${revNo} แล้ว — เขียนทับ ${result.overwritten || 0}, สร้างคืน ${result.recreated || 0}, ลบ ${result.deleted || 0} ขั้น`;
}
