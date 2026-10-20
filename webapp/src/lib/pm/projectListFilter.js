// ── ตัวกรองของทะเบียนโครงการ (/sa/projects) — ตัวนับกับแถวใช้ชุดเดียวกัน ──────────
//
// 🐞 (ตรวจตัวเลข M17 · 20/10) ป้ายเมนู "โครงการ N" (`?count=projectCloses`) นับคำขอปิดที่รอฉันเซ็น
//    ด้วย `isProjectCloseWaitingOnMe` แต่หน้าทะเบียนเคย:
//    ① อ่าน `?count=` ครั้งเดียวตอนเมานต์ (ม-115) ⇒ อยู่บนหน้าแล้วกดป้าย = ไม่มีอะไรเปลี่ยน ·
//       ปุ่ม × ล้างแค่ state ⇒ URL ยังมี `?count=` กดป้ายซ้ำก็ไป URL เดิม
//    ② ติ๊ก "รอฉันเซ็นปิด" เองแล้วสถานะยังเป็น "กำลังดำเนินการ" ⇒ คำขอปิดของโครงการ Completed/Dropped หาย
//       (route ขอปิดเขียนแค่ `closeStatus` ไม่แตะ `status` ⇒ แถวแบบนี้มีจริง)
//    ③ ชิปทีมกรองทุกคนที่อยู่หลายทีม รวมหัวหน้าที่ขอบเขตเป็น 'all' ⇒ โครงการทีมอื่น/ไม่มีทีมหายจากลิสต์
// ⭐ กติกา (เหมือน `productionJobsLink` #1915): ตัวกรอง "รอฉันเซ็นปิด" อยู่ใน URL ที่เดียว —
//    เปิด = ไป `?count=projectCloses` (ป้ายเมนู/ตัวเลือกในปุ่มตัวกรอง) · ปิด/× = เขียน URL ใหม่โดยถอดพารามิเตอร์
//    ตอนเปิด หน้าล้างตัวกรองที่ค้าง (`withWaitingOnMe`) ⇒ แถว = เลขบนป้ายพอดี — ล้างเฉพาะจังหวะปิด→เปิดขณะอยู่บนหน้า
//    (เมานต์พร้อม `?count=` จากกดย้อน/F5 ต้องได้ค่าที่ useStickyState คืนมา · มติ 2026-08-25)
// ⚠️ ชิปทีมใช้เฉพาะคนที่ขอบเขตเป็น 'team' (`viewScope`) — กติกาเดียวกับหน้าดีล/ลีด/คำร้อง/ปฏิทิน
//    (ADR 0015) · ผู้อนุมัติปิดเป็น superuser ทุกคน (ขอบเขต 'all') ⇒ ไม่มีชิปมาหั่นแถวของป้าย
import { CLOSED_WORK_STATUSES } from './projectLifecycle';
import { isBusinessLine } from '../master/businessLines';

// คีย์ของป้ายเมนู (`menuRegistry` countHref · ม-114) — คงไว้ ลิงก์เก่าที่ผู้ใช้เก็บไว้ยังกรองได้
export const PROJECTS_COUNT_KEY = 'projectCloses';
export const PROJECT_SCOPE_DEFAULT = 'active';
export const PROJECT_SCOPE_VALUES = Object.freeze(['active', 'all', 'closed']);
export const UNSET_LINE = '__unset';

const PATH = '/sa/projects';

/** ตัวกรอง "รอฉันเซ็นปิด" เปิดอยู่ไหม — อ่านจาก query string (`URLSearchParams` หรือสตริง) */
export function projectsWaitingOnMeFrom(search) {
  const params = new URLSearchParams(search ? String(search) : '');
  return params.get('count') === PROJECTS_COUNT_KEY;
}

/** URL ของทะเบียนตอนเปิด "รอฉันเซ็นปิด" — query อื่นคงไว้ */
export function projectsWaitingOnMeHref(search) {
  const params = new URLSearchParams(search ? String(search) : '');
  params.set('count', PROJECTS_COUNT_KEY);
  return `${PATH}?${params.toString()}`;
}

/** URL ของปุ่ม × / เอาติ๊กออก / ล้างตัวกรอง — ถอดเฉพาะ `?count=projectCloses` query อื่นคงไว้ */
export function projectsClearedHref(search) {
  const params = new URLSearchParams(search ? String(search) : '');
  if (params.get('count') === PROJECTS_COUNT_KEY) params.delete('count');
  const rest = params.toString();
  return rest ? `${PATH}?${rest}` : PATH;
}

/** สถานะตัวกรองหลังเปิด "รอฉันเซ็นปิด" — ล้างของที่ค้าง (ค้นหา · สายธุรกิจ) และเปิดสถานะเป็น "ทุกสถานะ"
 *  ⚠️ ต้องเปิดสถานะเป็น 'all' — โครงการที่ขอปิดมักอยู่ Completed ซึ่งค่าตั้งต้น 'active' กรองทิ้ง (ม-115) */
export function withWaitingOnMe(state = {}) {
  return { ...state, waitingOnMe: true, status: 'all', query: '', lines: [] };
}

/** ตัวกรองแถวเดียว — ทั้งตารางและตัวนับใช้ตัวนี้
 *  @param teamMatches `(team) => boolean` ของชิปทีม · `null` = ไม่กรองทีม (ขอบเขตไม่ใช่ 'team')
 *  @param brandOf     `(project) => string` แบรนด์ที่โชว์บนแถว (ค้นได้ตามที่ตาเห็น) */
export function projectMatchesListFilter(project, {
  query = '',
  status = PROJECT_SCOPE_DEFAULT,
  lines = [],
  waitingOnMe = false,
  teamMatches = null,
  brandOf = null,
} = {}) {
  const p = project || {};
  if (teamMatches && !teamMatches(p.team)) return false;
  if (waitingOnMe && !p._waitingOnMe) return false;
  /* 🐞 ของเดิมกรองด้วย ["Done","Drop"] ซึ่ง **ไม่ใช่ค่าที่มีอยู่จริง** — CHECK ของตาราง
     ยอมแค่ New / In Progress / Completed / On Hold / Dropped */
  if (status === 'active' && CLOSED_WORK_STATUSES.includes(p.status)) return false;
  if (status === 'closed' && !CLOSED_WORK_STATUSES.includes(p.status)) return false;
  if (!PROJECT_SCOPE_VALUES.includes(status) && p.status !== status) return false;
  // สายธุรกิจ: "ยังไม่ระบุสาย" เป็นตัวเลือกจริง — ของที่ยังไม่กรอกต้องหาเจอ ไม่ใช่หายเงียบ
  if (lines.length && !lines.includes(isBusinessLine(p.line) ? p.line : UNSET_LINE)) return false;
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const brand = brandOf ? brandOf(p) : '';
  return [p.code, p.name, p.customerName, brand, p.formulaName, ...(p.deals || []).map((d) => d.title)]
    .some((v) => String(v || '').toLowerCase().includes(q));
}

export function filterProjects(rows = [], state = {}) {
  return (rows || []).filter((p) => projectMatchesListFilter(p, state));
}
