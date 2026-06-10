import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, validateIdentity, departmentFor } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Only ae_supervisor (users:manage) may manage accounts. The proxy gates
// writes; GET is gated here.
async function requireAdmin() {
  const user = await getCurrentUser();
  return can(user?.role, 'users:manage') ? user : null;
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
        firstName: u.user_metadata?.firstName || (u.user_metadata?.name ? u.user_metadata.name.split(' ')[0] : ''),
        lastName: u.user_metadata?.lastName || (u.user_metadata?.name ? u.user_metadata.name.substring(u.user_metadata.name.indexOf(' ') + 1) : ''),
        role: u.app_metadata?.role || null,
        team: u.app_metadata?.team || null,
        department: u.app_metadata?.department || departmentFor(u.app_metadata?.role) || null,
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
  const firstName = (body.firstName || '').trim();
  const lastName = (body.lastName || '').trim();
  const name = `${firstName} ${lastName}`.trim();
  const role = body.role;
  const team = body.team || null;

  if (!email || !password) return Response.json({ error: 'ต้องระบุอีเมลและรหัสผ่าน' }, { status: 400 });
  if (password.length < 6) return Response.json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
  const invalid = validateIdentity(role, team, body.department);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no email verification step for internal accounts
    user_metadata: { name, firstName, lastName },
    // must_change_password forces a self-service password change on first login
    // (the admin-assigned password is temporary). Stored in app_metadata so the
    // user can't clear it client-side — only our /api/account/password route does.
    app_metadata: { role, department: departmentFor(role), must_change_password: true, ...(team ? { team } : {}) },
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ id: data.user.id }, { status: 201 });
}
