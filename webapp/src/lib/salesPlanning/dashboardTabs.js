// ── แท็บของหน้าแดชบอร์ด — ใครเห็นแท็บไหน ────────────────────────────────
//
// ⭐ **ยกออกมาจาก JSX เพราะเป็นกฎที่พังเงียบได้** (2026-08-11) — ตอนลบแท็บ
// "แดชบอร์ด RD" ทิ้ง เกือบทำให้ role `rd` เหลือ **ศูนย์แท็บ** (เดิม rd ถูกกันออกจาก
// แท็บ "ของฉัน" เพราะมีแท็บ RD ให้อยู่แล้ว) ⇒ เปิดหน้าแดชบอร์ดแล้วได้จอเปล่า
// โดยไม่มีอะไรบอกว่าทำไม · อยู่ในไฟล์ JSX แล้วเทสต์ node เรียกไม่ได้ จึงไม่มีใครดักไว้
//
// 🔑 **สิทธิ์ของแท็บตัดสินที่เดียว** แล้วใช้ทั้งแถบแท็บและตัวเนื้อหา — ของเดิมเช็ค
// สองที่ (filter ของแถบ + เงื่อนไขตอน render) แล้วไม่ตรงกัน: เปิด `?tab=` ที่ไม่มีสิทธิ์
// แล้วได้หน้าว่าง ส่วนอีกแท็บลืมเงื่อนไขตอน render จนหลุดไปตกที่ API 403 แทน
import { canSeeDealKpi, canSeeLeadKpi, canSeeTaskKpi } from '@/lib/permissions';

export const DASHBOARD_TABS = [
  // ⚠️ **ทุก role ต้องเห็นแท็บนี้** — มันเป็นแดชบอร์ดของ *คนที่เปิด* ไม่ใช่ของฝ่ายขาย
  // จึงเป็นตาข่ายที่ทำให้ไม่มี role ไหนเหลือศูนย์แท็บ (ดูเทสต์ประกอบ)
  { key: 'my', label: 'ภาพรวมของฉัน' },
  { key: 'lead_kpi', label: 'KPI ลีด' },
  { key: 'performance', label: 'ผลงานขาย' },
  { key: 'task_kpi', label: 'KPI งาน' },
];

// แท็บกินช่วงเวลาคนละหน่วย — ตัวคุมบนหัวหน้าเปลี่ยนตามแท็บ (มติผู้ใช้ 2026-08-05)
// "none" = แท็บถือตัวคุมของตัวเอง หัวหน้าต้องไม่มีตัวคุมซ้อน
export const TAB_PERIOD = {
  my: 'month',
  lead_kpi: 'month',
  performance: 'year',
  task_kpi: 'none',
};

export const DEFAULT_DASHBOARD_TAB = 'my';

export function normalizeDashboardTab(tab) {
  return DASHBOARD_TABS.some((t) => t.key === tab) ? tab : DEFAULT_DASHBOARD_TAB;
}

/** แท็บที่ role นี้เปิดได้ — **ต้องไม่เคยว่าง** ไม่ว่า role ไหน */
export function allowedDashboardTabs(role) {
  return DASHBOARD_TABS.filter((t) => {
    if (t.key === 'performance') return canSeeDealKpi(role); // ผลงานขาย = สิทธิ์เดิมของ KPI ดีล
    if (t.key === 'task_kpi') return canSeeTaskKpi(role);
    if (t.key === 'lead_kpi') return canSeeLeadKpi(role);
    return true; // 'my' — แดชบอร์ดของคนที่เปิด เปิดให้ทุก role
  });
}

/**
 * แท็บที่แสดงจริง — ตัวที่ขอมาถ้ามีสิทธิ์ ไม่งั้นถอยไปตัวแรกที่เปิดให้
 *
 * ⚠️ คืน `{ tab, denied }` ไม่ใช่แค่ชื่อแท็บ — จอต้องบอกได้ว่า "ถูกปฏิเสธ" ต่างจาก
 * "ค่าตั้งต้นพาไปแท็บอื่น" · `denied` มีค่าเฉพาะตอนผู้ใช้ **ขอแท็บนั้นมาเองทาง URL**
 */
export function resolveDashboardTab(role, requestedTab) {
  const allowed = allowedDashboardTabs(role);
  const asked = normalizeDashboardTab(requestedTab);
  const tab = allowed.some((t) => t.key === asked) ? asked : allowed[0]?.key;
  const denied = requestedTab && asked === requestedTab && asked !== tab
    ? DASHBOARD_TABS.find((t) => t.key === asked) || null
    : null;
  return { tab, denied, allowed };
}
