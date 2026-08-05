import { departmentOf, isSuperuser } from '@/lib/permissions';

// ── ฝ่ายขาย (SA) ต้องผูกดีลทุกงาน (มติผู้ใช้ 2026-08-05) ─────────────────────
// งานของฝ่ายขายทุกชิ้นต้องรู้ว่าทำให้ดีลไหน — ไม่งั้นดีลไม่เห็นงานที่เปิดค้างอยู่
// และ KPI รายดีลนับไม่ครบ. ตัวเลือก "ไม่ผูก" ถูกถอดออกจากฟอร์มแล้ว.
// ⚠️ บังคับได้เฉพาะ SA: ฝ่ายอื่น (RD/PC/PD/WH/QC/TS/FN) ไม่มี team → taskDealScope
// = 'none' → ไม่มีดีลให้เลือกเลย ถ้าบังคับทั้งระบบ ฝ่ายเหล่านั้นจะสร้างงานไม่ได้.
// admin/เลขา (superuser) ก็ไม่บังคับ — งานดูแลระบบไม่ได้ผูกดีลโดยธรรมชาติ.
export const DEAL_REQUIRED_DEPARTMENT = 'SA';

export function requiresDealLink(user) {
  return departmentOf(user) === DEAL_REQUIRED_DEPARTMENT;
}

export function canLinkTaskToDeal(user, deal) {
  if (!user || !deal) return false;
  if (isSuperuser(user.role)) return true;
  return !!user.team && !!deal.team && user.team === deal.team;
}

export function taskDealScope(user) {
  if (!user) return { kind: 'none', team: null };
  if (isSuperuser(user.role)) return { kind: 'all', team: null };
  return user.team ? { kind: 'team', team: user.team } : { kind: 'none', team: null };
}
