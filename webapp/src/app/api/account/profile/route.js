import { getCurrentUser } from "@/lib/authUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { accountProfileFromAuthUser, normalizeAccountProfile } from "@/lib/accountProfile";
import { recordAudit, userAuditSnapshot } from "@/lib/audit";
import { invalidateCache } from "@/lib/serverCache";

export const dynamic = "force-dynamic";

function localProfile(me) {
  return {
    id: me.id,
    email: "local@example.com",
    firstName: "Local",
    lastName: "Dev",
    name: "Local Dev",
    phone: "",
    role: me.role,
    team: me.team,
    department: me.department,
    mustChangePassword: false,
    createdAt: null,
    lastSignInAt: null,
  };
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (me.devBypass) return Response.json({ profile: localProfile(me) });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(me.id);
  if (error || !data?.user) {
    return Response.json({ error: "ไม่พบบัญชีผู้ใช้" }, { status: 404 });
  }

  return Response.json({ profile: accountProfileFromAuthUser(data.user) });
}

export async function PATCH(request) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const normalized = normalizeAccountProfile(body);
  if (normalized.error) return Response.json({ error: normalized.error }, { status: 400 });
  if (me.devBypass) {
    return Response.json({ profile: { ...localProfile(me), ...normalized.value }, localOnly: true });
  }

  const admin = getSupabaseAdmin();
  const { data: existing, error: findError } = await admin.auth.admin.getUserById(me.id);
  if (findError || !existing?.user) {
    return Response.json({ error: "ไม่พบบัญชีผู้ใช้" }, { status: 404 });
  }

  const userMetadata = {
    ...(existing.user.user_metadata || {}),
    ...normalized.value,
  };
  const { data: updated, error } = await admin.auth.admin.updateUserById(me.id, { user_metadata: userMetadata });
  if (error || !updated?.user) {
    return Response.json({ error: error?.message || "บันทึกข้อมูลส่วนตัวไม่สำเร็จ" }, { status: 400 });
  }

  invalidateCache("assignable-users");
  await recordAudit({
    user: me,
    action: "update",
    entityType: "user",
    entityId: me.id,
    before: userAuditSnapshot(existing.user),
    after: userAuditSnapshot(updated.user),
    summary: `แก้ไขข้อมูลส่วนตัว ${updated.user.email}`,
    request,
  });

  return Response.json({ profile: accountProfileFromAuthUser(updated.user) });
}
