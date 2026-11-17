// ── ลิงก์หน้าโครงการเก่า (ยุบดีล/โครงการ P2d · มติเจ้าของ 13/11/2026 ④: ซ่อนเมนู + ลิงก์เก่าพาไปหน้าลูกค้าศูนย์รวม) ──
//
// ตรรกะล้วน แยกจาก proxy ให้เทสต์ได้ — proxy ในโหมด devBypass ไม่ทำงานเลย (ไม่มีคีย์ Supabase) จอจริงจึงพิสูจน์เส้นนี้ไม่ได้
//   · `/sa/projects` (ทะเบียนเดิม · มีคิวรีได้) → รายการดีล
//   · `/sa/projects/<id หรือรหัส PJ>/**` และ `/pm/projects/<…>` → `/go/project/<…>` (หน้า server อ่านลูกค้าของโครงการ)
//   · `/api/**` ไม่แตะ — `/api/pm/projects` ยังมีผู้เรียกจนงวด P3

const OLD_PROJECT_PAGE = /^\/(?:sa|pm)\/projects(?:\/([^/]+))?(?:\/.*)?$/;

/** path ของหน้าโครงการเก่า → path ปลายทาง · ไม่ใช่หน้าโครงการ = null */
export function oldProjectRedirectTarget(path = '') {
  const match = String(path).match(OLD_PROJECT_PAGE);
  if (!match) return null;
  return match[1] ? `/go/project/${match[1]}` : '/sa/deals';
}

/** ค่าที่ลิงก์เก่าส่งมาเป็นได้ทั้ง id (`PRJ-…`) และรหัส (`PJ-…`) — หน้าคำร้อง/ประเมินพื้นที่เคยลิงก์ด้วยรหัส */
export const isProjectCode = (value) => /^PJ-/i.test(String(value || '').trim());
