// ── ขอบเขตที่มองเห็นในคิวคำร้อง (P6) — logic ล้วน ────────────────────────
//
// ⚠️ **กฎข้อเดียวที่สำคัญที่สุดของไฟล์นี้: กรองที่ API ไม่ใช่ที่จอ**
// กรองที่จอแปลว่าข้อมูลของทีมอื่นถูกส่งถึงเบราว์เซอร์แล้วค่อยซ่อน — เปิดดูได้จาก
// แท็บ Network โดยไม่ต้องมีความรู้อะไรเลย · ตัวเลือกที่ไม่มีสิทธิ์ต้อง **จางและ
// กดไม่ได้ ไม่ใช่ซ่อน** เพราะการซ่อนทำให้คนไม่รู้ว่ามีของที่ตัวเองเข้าไม่ถึงอยู่
import { isSuperuser, userTeams } from '@/lib/permissions';

export const REQUEST_SCOPES = ['mine', 'team', 'all'];

// ⚠️ **ป้ายอยู่ที่ `components/salesPlanning/ui.js` (SCOPE_LABELS) ที่เดียว** —
// คิวลีดกับไปป์ไลน์ดีลใช้ชุดนั้นอยู่แล้ว · ประกาศชุดที่สองที่นี่จะได้คำแปลสองที่
// ที่ต้องคอยดูแลให้ตรงกัน (ไฟล์นี้เป็น server-safe จึง import ตัวนั้นไม่ได้ —
// เหตุผลนั้นแหละที่ทำให้ต้องเลือกว่าจะเก็บที่ไหน ไม่ใช่เก็บทั้งสองที่)

// ใครใช้ขอบเขตไหนได้
//
// mine  — ทุกคน (ของตัวเองเสมอ)
// team  — ต้องอยู่ทีมใดทีมหนึ่ง · คนไม่มีทีม (เช่น RD/PC) ไม่มี "ทีม" ให้ดู
// all   — superuser เท่านั้น
export function canUseScope(user, scope) {
  if (scope === 'mine') return true;
  if (scope === 'all') return isSuperuser(user?.role);
  if (scope === 'team') return isSuperuser(user?.role) || userTeams(user).length > 0;
  return false;
}

// ขอบเขตที่ใช้ได้จริง — **ถอยลงมา ไม่ใช่ปฏิเสธ**
//
// ⚠️ ปฏิเสธทั้งคำขอเมื่อสิทธิ์ไม่พอ จะทำให้ลิงก์ที่แชร์กันไว้ (`?scope=all`) พังใน
// มือคนที่สิทธิ์น้อยกว่า ทั้งที่เจตนาคือ "ดูคิว" ⇒ ถอยไป `mine` แล้วบอกที่หน้าจอ
export function resolveScope(user, requested) {
  const want = REQUEST_SCOPES.includes(requested) ? requested : 'mine';
  if (canUseScope(user, want)) return want;
  if (want === 'all' && canUseScope(user, 'team')) return 'team';
  return 'mine';
}

// ตัวกรองที่ต้องส่งให้ชั้นข้อมูล — คืน null เมื่อ "ไม่ต้องกรองเลย" (all)
//
// ⚠️ `mine` กรองด้วย **id ของผู้ใช้** ไม่ใช่ทีม — คำร้องเป็นงานปฏิบัติของคนเปิด
// (มติเดิมของ canManageRequest: หัวหน้าทีมไม่ได้ถูกดึงเข้ามาโดยตั้งใจ)
export function scopeFilter(user, scope) {
  if (scope === 'all') return null;
  if (scope === 'team') {
    // ไม่มีทีม = เห็นแต่ของตัวเอง · คืนตัวกรองที่ไม่มีวันตรงกับใครไม่ได้ เพราะนั่น
    // จะกลายเป็น "คิวว่าง" ที่อ่านเหมือนไม่มีงาน แทนที่จะเป็น "ไม่มีทีม"
    // อยู่หลายทีมได้ ⇒ คิวทีม = ของทุกทีมที่สังกัด (ชั้นข้อมูลรับเป็นอาร์เรย์)
    const teams = userTeams(user);
    return teams.length ? { team: teams } : { requestedById: user?.id || '—' };
  }
  return { requestedById: user?.id || '—' };
}
