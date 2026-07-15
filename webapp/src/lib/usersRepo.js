// Lightweight auth-user lookups for server routes (task assignment / KPI).
// Wraps supabase.auth.admin.listUsers paging so callers don't re-implement it.

// user id → { id, name, role, team, department } for everyone with a real role.
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
        role,
        team: u.app_metadata?.team || null,
        department: u.app_metadata?.department || null, // ใช้กรองคนฝ่าย (rd-kpi)
      });
    }
    page++;
  }
  return map;
}

// user ids belonging to a team (empty array if no team given).
export async function teamUserIds(supabase, team) {
  if (!team) return [];
  const dir = await loadUserDirectory(supabase);
  return [...dir.values()].filter((u) => u.team === team).map((u) => u.id);
}
