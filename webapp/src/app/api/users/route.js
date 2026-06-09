import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, ROLES, TEAMS, TEAM_ROLES } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Only ae_supervisor (users:manage) may manage accounts. The proxy gates
// writes; GET is gated here.
async function requireAdmin() {
  const user = await getCurrentUser();
  return can(user?.role, 'users:manage') ? user : null;
}

// Validate role + team together. Team-bound roles must have a valid team;
// supervisor/legal must not carry one.
function validateRoleTeam(role, team) {
  if (!ROLES.includes(role)) return 'role ไม่ถูกต้อง';
  if (TEAM_ROLES.includes(role)) {
    if (!TEAMS.includes(team)) return 'ตำแหน่งนี้ต้องระบุทีม (ODM/KA/SV)';
  } else if (team) {
    return 'ตำแหน่งนี้ไม่ต้องระบุทีม';
  }
  return null;
}

export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: 'forbidden' }, { status: 403 });
  const supabase = getSupabaseAdmin();

  const rows = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const users = data?.users || [];
    if (!users.length) break;
    for (const u of users) {
      rows.push({
        id: u.id,
        email: u.email,
        name: u.user_metadata?.name || '',
        role: u.app_metadata?.role || null,
        team: u.app_metadata?.team || null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
      });
    }
    page++;
  }
  return Response.json(rows);
}

export async function POST(request) {
  if (!(await requireAdmin())) return Response.json({ error: 'forbidden' }, { status: 403 });
  const supabase = getSupabaseAdmin();
  const body = await request.json();

  const email = (body.email || '').trim();
  const password = body.password || '';
  const name = (body.name || '').trim();
  const role = body.role;
  const team = body.team || null;

  if (!email || !password) return Response.json({ error: 'ต้องระบุอีเมลและรหัสผ่าน' }, { status: 400 });
  if (password.length < 6) return Response.json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
  const invalid = validateRoleTeam(role, team);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no email verification step for internal accounts
    user_metadata: { name },
    app_metadata: { role, ...(team ? { team } : {}) },
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ id: data.user.id }, { status: 201 });
}
