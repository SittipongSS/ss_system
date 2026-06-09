import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';

export const dynamic = 'force-dynamic';

// PATCH /api/account/password — self-service password change.
//
// Any signed-in user may change THEIR OWN password and only their own: the
// target is always getCurrentUser().id, never a value from the request body,
// so this can't be used to reset someone else's account. It also only sets the
// `password` field — role/team live in app_metadata and are never touched here,
// so a user still can't self-escalate. Requires the current password (re-auth)
// so a left-open / hijacked session can't silently change it.
//
// Admin control is unaffected: ae_supervisor still resets any account's password
// via PATCH /api/users/[id] (users:manage), which needs no current password.
export async function PATCH(request) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (me.devBypass) {
    return Response.json({ error: 'โหมดพัฒนา (local) ไม่มีรหัสผ่านให้เปลี่ยน' }, { status: 400 });
  }

  const body = await request.json();
  const currentPassword = body.currentPassword || '';
  const newPassword = body.newPassword || '';

  if (!currentPassword || !newPassword) {
    return Response.json({ error: 'ต้องระบุรหัสผ่านปัจจุบันและรหัสผ่านใหม่' }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return Response.json({ error: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return Response.json({ error: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: existing, error: findErr } = await admin.auth.admin.getUserById(me.id);
  const email = existing?.user?.email;
  if (findErr || !email) return Response.json({ error: 'ไม่พบบัญชีผู้ใช้' }, { status: 404 });

  // Verify the current password with a throwaway anon client so we don't touch
  // the caller's own session cookies.
  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error: signInErr } = await verifier.auth.signInWithPassword({ email, password: currentPassword });
  if (signInErr) return Response.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, { status: 400 });

  // Clear the first-login flag (if any) in the same update so the user is no
  // longer forced to change their password.
  const existingMeta = existing.user.app_metadata || {};
  const { error } = await admin.auth.admin.updateUserById(me.id, {
    password: newPassword,
    app_metadata: { ...existingMeta, must_change_password: false },
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ success: true });
}
