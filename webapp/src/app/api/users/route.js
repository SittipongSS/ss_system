import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canUser, validateIdentity, departmentFor, normalizeDepartment, normalizeRole, sanitizeExtraCaps, userTeams, resolveTeamAssignment } from '@/lib/permissions';
import { recordAudit, userAuditSnapshot } from '@/lib/audit';
import { invalidateCache } from '@/lib/serverCache';

export const dynamic = 'force-dynamic';

/* บัญชีผู้ใช้ **สร้าง/แก้/ลบได้เฉพาะ `admin`** — `users:manage` อยู่ใน
   ADMIN_SYSTEM_CAPS ซึ่งถูกกันออกจากหัวหน้าฝ่ายขายโดยตรง (permissions.js
   SALES_HEAD_EXCLUDED) · proxy กันชั้นนอก ตัวนี้กัน handler ที่เขียนข้อมูล
   ⚠️ คอมเมนต์เดิมเขียนว่า "ae_supervisor / admin" ซึ่งไม่จริงตั้งแต่รอบที่ตัด
      users:manage ออกจากหัวหน้าฝ่ายขาย — คนอ่านจะไปนัดให้หัวหน้าขายเป็นคนเปิด
      บัญชีให้ฝ่ายอื่น แล้วเจอ 403 หน้างาน */
async function requireAdmin() {
  const user = await getCurrentUser();
  return can(user?.role, 'users:manage') ? user : null;
}

// READ (GET) is open to users:manage OR a per-user users:view grant (a read-only
// observer/auditor who may see the account list but not touch it).
async function requireUsersRead() {
  const user = await getCurrentUser();
  return (canUser(user, 'users:view') || can(user?.role, 'users:manage')) ? user : null;
}

export async function GET() {
  if (!(await requireUsersRead())) return Response.json({ error: 'forbidden' }, { status: 403 });
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
        // เบอร์โทรผู้ใช้ — ใช้แสดงในเอกสาร ISO (เบอร์มือถือของ AE ผู้ดูแล) ฯลฯ.
        phone: u.user_metadata?.phone || '',
        role: normalizeRole(u.app_metadata?.role) || null,
        // team = ทีมหลัก (ยอดของใหม่เข้าทีมนี้) · teams = ทุกทีมที่สังกัด
        // บัญชีเก่าที่ยังไม่มี teams ถอยไปใช้ [team] เอง — ไม่ต้องแบ็คฟิล
        team: u.app_metadata?.team || null,
        teams: userTeams({ team: u.app_metadata?.team, teams: u.app_metadata?.teams }),
        department: normalizeDepartment(u.app_metadata?.department) || departmentFor(normalizeRole(u.app_metadata?.role)) || null,
        // Per-user capability grants (e.g. an SA granted the RA ra:approve).
        extraCaps: sanitizeExtraCaps(u.app_metadata?.extraCaps),
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        // Banned (disabled) accounts can't sign in and lose their session on the
        // next request. banned_until is an ISO date in the future while banned.
        disabled: !!u.banned_until && new Date(u.banned_until) > new Date(),
      });
    }
    page++;
  }
  return Response.json(rows);
}

export async function POST(request) {
  const me = await requireAdmin();
  if (!me) return Response.json({ error: 'forbidden' }, { status: 403 });
  const supabase = getSupabaseAdmin();
  const body = await request.json();

  const email = (body.email || '').trim();
  const password = body.password || '';
  const firstName = (body.firstName || '').trim();
  const lastName = (body.lastName || '').trim();
  const name = `${firstName} ${lastName}`.trim();
  const phone = (body.phone || '').trim();
  const role = body.role;
  // อยู่ได้หลายทีม — teams คือสังกัดทั้งหมด, team คือทีมหลักที่ใช้ stamp ของใหม่
  const { team, teams } = resolveTeamAssignment(role, { team: body.team || null, teams: body.teams });

  if (!email || !password) return Response.json({ error: 'ต้องระบุอีเมลและรหัสผ่าน' }, { status: 400 });
  if (password.length < 6) return Response.json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
  const invalid = validateIdentity(role, teams, body.department);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });
  const department = normalizeDepartment(body.department) || departmentFor(role);
  // Per-user capability grants — whitelisted (GRANTABLE_CAPS) so a create call
  // can never mint admin-system caps. Stored in app_metadata (service-role-only).
  const extraCaps = sanitizeExtraCaps(body.extraCaps);

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no email verification step for internal accounts
    user_metadata: { name, firstName, lastName, phone },
    // must_change_password forces a self-service password change on first login
    // (the admin-assigned password is temporary). Stored in app_metadata so the
    // user can't clear it client-side — only our /api/account/password route does.
    app_metadata: { role, department, must_change_password: true, ...(team ? { team, teams } : {}), ...(extraCaps.length ? { extraCaps } : {}) },
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  invalidateCache('assignable-users'); // dropdown ผู้รับผิดชอบเห็นคนใหม่ทันที
  await recordAudit({
    user: me, action: 'create', entityType: 'user', entityId: data.user.id,
    after: userAuditSnapshot(data.user), summary: `สร้างผู้ใช้ ${email} (${role})`, request,
  });
  return Response.json({ id: data.user.id }, { status: 201 });
}
