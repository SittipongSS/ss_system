import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, validateIdentity, departmentFor, normalizeDepartment, isSuperuser } from '@/lib/permissions';

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

  // role + team always travel together. NOTE: Supabase admin.updateUserById
  // MERGES app_metadata top-level keys — it does NOT replace the object. So a
  // key we omit keeps its old value. When a role drops its team (e.g. senior_ae
  // → viewer/legal), we must send team: null explicitly to overwrite the stale
  // team, otherwise the user keeps their old team scope after the role change.
  if (body.role !== undefined) {
    const team = body.team || null;
    const invalid = validateIdentity(body.role, team, body.department);
    if (invalid) return Response.json({ error: invalid }, { status: 400 });
    // Guard against self-demotion locking everyone out of user management.
    if (id === me.id && !isSuperuser(body.role)) {
      return Response.json({ error: 'ไม่สามารถลดสิทธิ์ของตัวเองได้' }, { status: 400 });
    }
    const department = normalizeDepartment(body.department) || departmentFor(body.role);
    updates.app_metadata = { role: body.role, department, must_change_password: mustChange, team };
  } else if (mustChange !== !!existingMeta.must_change_password) {
    // Password reset without a role change still needs to persist the flag.
    updates.app_metadata = { ...existingMeta, must_change_password: mustChange };
  }

  if (body.firstName !== undefined || body.lastName !== undefined || body.phone !== undefined) {
    const meta = { ...(existing.user.user_metadata || {}) };
    if (body.firstName !== undefined || body.lastName !== undefined) {
      const fn = (body.firstName !== undefined ? body.firstName : (meta.firstName || '')).trim();
      const ln = (body.lastName !== undefined ? body.lastName : (meta.lastName || '')).trim();
      meta.firstName = fn;
      meta.lastName = ln;
      meta.name = `${fn} ${ln}`.trim();
    }
    if (body.phone !== undefined) meta.phone = (body.phone || '').trim();
    updates.user_metadata = meta;
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

  // Disable / enable account (admin "force logout + lock"). A ban makes the
  // user fail getUser() validation on their next request (the proxy revalidates
  // every request) and blocks re-login + token refresh, so the active session
  // ends within the access-token lifetime at the latest. 'none' lifts it.
  if (body.disabled !== undefined) {
    if (body.disabled && id === me.id) {
      return Response.json({ error: 'ไม่สามารถปิดบัญชีของตัวเองได้' }, { status: 400 });
    }
    updates.ban_duration = body.disabled ? '876000h' : 'none'; // ~100 years
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
