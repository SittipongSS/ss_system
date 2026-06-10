import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, validateIdentity, departmentFor } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

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
  const existingMeta = existing.user.app_metadata || {};

  // An admin password reset re-arms the "must change on next login" flag; the
  // reset password is temporary. Otherwise keep whatever the flag already was.
  const mustChange = body.password ? true : !!existingMeta.must_change_password;

  // role + team always travel together (app_metadata is replaced wholesale).
  if (body.role !== undefined) {
    const team = body.team || null;
    const invalid = validateIdentity(body.role, team, body.department);
    if (invalid) return Response.json({ error: invalid }, { status: 400 });
    // Guard against self-demotion locking everyone out of user management.
    if (id === me.id && body.role !== 'ae_supervisor') {
      return Response.json({ error: 'ไม่สามารถลดสิทธิ์ของตัวเองได้' }, { status: 400 });
    }
    updates.app_metadata = { role: body.role, department: departmentFor(body.role), must_change_password: mustChange, ...(team ? { team } : {}) };
  } else if (mustChange !== !!existingMeta.must_change_password) {
    // Password reset without a role change still needs to persist the flag.
    updates.app_metadata = { ...existingMeta, must_change_password: mustChange };
  }

  if (body.firstName !== undefined || body.lastName !== undefined) {
    const fn = (body.firstName !== undefined ? body.firstName : (existing.user.user_metadata?.firstName || '')).trim();
    const ln = (body.lastName !== undefined ? body.lastName : (existing.user.user_metadata?.lastName || '')).trim();
    updates.user_metadata = {
      ...(existing.user.user_metadata || {}),
      firstName: fn,
      lastName: ln,
      name: `${fn} ${ln}`.trim(),
    };
  } else if (body.name !== undefined) {
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
