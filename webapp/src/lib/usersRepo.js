// Lightweight auth-user lookups for server routes (task assignment / KPI).
// Wraps supabase.auth.admin.listUsers paging so callers don't re-implement it.
import { userTeams } from '@/lib/permissions';

// user id → { id, name, email, role, team, teams, department } for everyone with a real role.
export async function loadUserDirectory(supabase) {
  const map = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    const users = data?.users || [];
    if (!users.length) break;
    for (const u of users) {
      const role = u.app_metadata?.role || null;
      if (!role || role === 'user') continue;
      map.set(u.id, {
        id: u.id,
        name: u.user_metadata?.name || u.email,
        email: u.email || null, // ใช้ตามคนที่ต้องทำอะไรต่อ (signature coverage)
        role,
        team: u.app_metadata?.team || null,   // ทีมหลัก (ของใหม่ที่คนนี้สร้างเข้าทีมนี้)
        // ทุกทีมที่สังกัด — คนเดียวอยู่ได้หลายทีม ทุกด่านที่ถามว่า "ทีมเดียวกันไหม"
        // ต้องอ่านช่องนี้ ไม่ใช่ `team` (ดู userTeams ใน permissions.js)
        teams: userTeams({ team: u.app_metadata?.team, teams: u.app_metadata?.teams }),
        department: u.app_metadata?.department || null, // ใช้กรองคนฝ่าย (rd-kpi)
        // บัญชีถูกปิด = ban ที่ Supabase auth (สูตรเดียวกับ GET /api/users) — ผู้เรียกที่
        // ต้องการเฉพาะคนที่ยังทำงานอยู่ต้องกรองเอง (loader ไม่กรองให้ เพราะบางที่ยังต้อง
        // เห็นคนที่ปิดบัญชีแล้ว เช่นการโอนงานต่อ)
        disabled: !!u.banned_until && new Date(u.banned_until) > new Date(),
      });
    }
    page++;
  }
  return map;
}

// user ids belonging to a team (empty array if no team given).
// `team` รับได้ทั้งทีมเดียวและอาร์เรย์ — และคนปลายทางก็อยู่ได้หลายทีมเหมือนกัน
// จึงนับว่า "อยู่ทีมนี้" เมื่อทีมของเขามีตัวใดตัวหนึ่งในชุดที่ถาม
export async function teamUserIds(supabase, team) {
  const wanted = userTeams(team);
  if (!wanted.length) return [];
  const dir = await loadUserDirectory(supabase);
  return [...dir.values()].filter((u) => userTeams(u).some((t) => wanted.includes(t))).map((u) => u.id);
}

export async function departmentUserIds(supabase, department) {
  if (!department) return [];
  const dir = await loadUserDirectory(supabase);
  return [...dir.values()].filter((u) => u.department === department).map((u) => u.id);
}
