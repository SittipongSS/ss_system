import { isSuperuser } from '@/lib/permissions';

// ── ทุกงานต้องผูกดีล (มติผู้ใช้ 2026-08-06) ─────────────────────────────────
// เดิมบังคับเฉพาะฝ่ายขาย (SA) เพราะฝ่ายอื่นไม่มี team → taskDealScope = 'none' →
// ไม่มีดีลให้เลือกเลย บังคับไปก็แค่ทำให้เขาสร้างงานไม่ได้. ตอนนี้แก้ที่ต้นเหตุ:
// **ฝ่ายที่ไม่มีทีมเห็นดีลทั้งหมด** (เขาทำงานให้ทุกทีมขายอยู่แล้ว) แล้วจึงบังคับได้จริง
//
// ทำไมต้องบังคับ — งานที่ไม่ผูกดีลคืองานที่หน้าดีล/หน้าโครงการมองไม่เห็น: ดีลไม่รู้ว่า
// มีงานเปิดค้างอยู่ และ KPI รายดีลนับไม่ครบ ทั้งที่คนทำงานก็ทำให้ดีลใบใดใบหนึ่งอยู่ดี
//
// ⚠️ ข้อยกเว้นที่เหลือ 2 อย่าง (จงใจ):
//   · ผู้ดูแลระบบ/เลขานุการ — งานดูแลระบบกับงานธุรการไม่ได้เกิดจากดีลโดยธรรมชาติ
//     (ไม่ใช้ isSuperuser ตรงนี้! `ae_supervisor` นับเป็น superuser ด้วย แต่เขาคือ
//      หัวหน้าฝ่ายขาย — งานของเขาผูกดีลเหมือนลูกทีมทุกคน)
//   · งานที่สร้างจากคำร้อง — ดีลมาจากคำร้องต้นทาง ซึ่งบางหัวข้อไม่ผูกดีลโดยเจตนา
//     (เช่น ขอราคา F/FB) คนสร้างงานเลือกเองไม่ได้ จึงบังคับไม่ได้
const DEAL_LINK_EXEMPT_ROLES = Object.freeze(['admin', 'secretary']);

export function requiresDealLink(user) {
  if (!user) return false;
  return !DEAL_LINK_EXEMPT_ROLES.includes(user.role);
}

export function canLinkTaskToDeal(user, deal) {
  if (!user || !deal) return false;
  if (isSuperuser(user.role)) return true;
  // ฝ่ายที่ไม่มีทีม (RD/PC/PD/WH/QC/TS/FN) รับงานจากทุกทีมขาย — ขอบเขต "ทีมเดียวกัน"
  // ใช้กับคนที่มีทีมเท่านั้น ไม่งั้นกติกาจะกลายเป็น "ผูกดีลไม่ได้เลย"
  if (!user.team) return true;
  return !!deal.team && user.team === deal.team;
}

export function taskDealScope(user) {
  if (!user) return { kind: 'none', team: null };
  if (isSuperuser(user.role)) return { kind: 'all', team: null };
  return user.team ? { kind: 'team', team: user.team } : { kind: 'all', team: null };
}
