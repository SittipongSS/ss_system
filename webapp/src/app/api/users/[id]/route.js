import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, ROLES, TEAMS, TEAM_ROLES } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

function validateRoleTeam(role, team) {
  if (!ROLES.includes(role)) return 'role ไม่ถูกต้อง';
  if (TEAM_ROLES.includes(role)) {
    if (!TEAMS.includes(team)) return 'ตำแหน่งนี้ต้องระบุทีม (ODM/KA/SV)';
  } else if (team) {
    return 'ตำแหน่งนี้ไม่ต้องระบุทีม';
  }
  return null;
}

// PATCH /api/users/[id] — update name / role / team / password.
export async function PATCH(request, { params }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!can(me?.role, 'users:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const body = await request.json();

  const { data: existing, error: findErr } = await supabase.auth.admin.getUserById(id);
  if (findErr || !existing?.user) return Response.json({ error: 'ไม่พบผู้ใช้รายนี้' }, { status: 404 });

  const updates = {};

  // role + team always travel together (app_metadata is replaced wholesale).
  if (body.role !== undefined) {
    const team = body.team || null;
    const invalid = validateRoleTeam(body.role, team);
    if (invalid) return Response.json({ error: invalid }, { status: 400 });
    // Guard against self-demotion locking everyone out of user management.
    if (id === me.id && body.role !== 'ae_supervisor') {
      return Response.json({ error: 'ไม่สามารถลดสิทธิ์ของตัวเองได้' }, { status: 400 });
    }
    updates.app_metadata = { role: body.role, ...(team ? { team } : {}) };
  }

  if (body.name !== undefined) {
    updates.user_metadata = {
      ...(existing.user.user_metadata || {}),
      name: (body.name || '').trim(),
    };
  }

  if (body.password) {
    if (body.password.length < 6) {
      return Response.json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
    }
    updates.password = body.password;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'ไม่มีข้อมูลที่จะอัปเดต' }, { status: 400 });
  }

  const { error } = await supabase.auth.admin.updateUserById(id, updates);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ success: true });
}

// DELETE /api/users/[id]
export async function DELETE(request, { params }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!can(me?.role, 'users:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (id === me.id) {
    return Response.json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ success: true, message: 'ลบผู้ใช้เรียบร้อยแล้ว' });
}
