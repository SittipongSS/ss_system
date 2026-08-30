import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canUser, validateIdentity, departmentFor, normalizeDepartment, normalizeRole, sanitizeExtraCaps, userTeams, resolveTeamAssignment } from '@/lib/permissions';
import {
  LOGIN_PHONE_DOMAIN, isPhoneLogin, loginLabel, loginPhoneOf, normalizeLoginPhone, phoneLoginEmail,
} from '@/lib/auth/loginIdentity';
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
        email: isPhoneLogin(u.email) ? '' : u.email,
    // เบอร์ที่ใช้ **เข้าระบบ** (ต่างจาก `phone` ข้างล่างซึ่งเป็นเบอร์บนเอกสาร)
    loginPhone: loginPhoneOf(u.email) || '',
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

  const typedEmail = (body.email || '').trim();
  const password = body.password || '';
  const firstName = (body.firstName || '').trim();
  const lastName = (body.lastName || '').trim();
  const name = `${firstName} ${lastName}`.trim();
  const phone = (body.phone || '').trim();
  const role = body.role;
  // อยู่ได้หลายทีม — teams คือสังกัดทั้งหมด, team คือทีมหลักที่ใช้ stamp ของใหม่
  const { team, teams } = resolveTeamAssignment(role, { team: body.team || null, teams: body.teams });

  /* ── ช่องทางเข้าระบบ: อีเมล **หรือ** เบอร์โทร (มติผู้ใช้ 2026-08-30) ─────────
     ⭐ เจ้าหน้าที่หน้างานไม่มีอีเมลบริษัท ⇒ เบอร์ถูกมัดเป็นที่อยู่ล็อกอินภายใน
        (lib/auth/loginIdentity.js) · ที่อยู่นั้นไม่มีกล่องจดหมายและไม่ควรโผล่บนจอ
     ⚠️ **ห้ามพิมพ์โดเมนภายในลงช่องอีเมลเอง** — จะได้บัญชีที่ดูเหมือนล็อกอินด้วยเบอร์
        แต่เบอร์อาจไม่ตรงรูปมาตรฐาน แล้วคนกรอกเบอร์จริงจะล็อกอินไม่ได้ทั้งที่พิมพ์ถูก */
  if (typedEmail && isPhoneLogin(typedEmail)) {
    return Response.json({
      error: `อีเมลโดเมน ${LOGIN_PHONE_DOMAIN} เป็นที่อยู่ภายในของระบบ — ถ้าจะให้เข้าด้วยเบอร์ ให้กรอกที่ช่องเบอร์เข้าระบบแทน`,
    }, { status: 400 });
  }
  const loginPhone = normalizeLoginPhone(body.loginPhone);
  if (!typedEmail && String(body.loginPhone ?? '').trim() && !loginPhone) {
    return Response.json({ error: 'เบอร์เข้าระบบไม่ถูกต้อง — ใช้เบอร์ไทย เช่น 081-234-5678' }, { status: 400 });
  }
  const email = typedEmail || phoneLoginEmail(loginPhone) || '';
  if (!email || !password) {
    return Response.json({ error: 'ต้องระบุอีเมลหรือเบอร์เข้าระบบ และรหัสผ่าน' }, { status: 400 });
  }
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
    /* ⚠️ `phone` ในนี้คือ **เบอร์สำหรับเอกสาร** ไม่ใช่ช่องทางเข้าระบบ — คนละค่ากัน
       โดยเจตนา (เบอร์บนใบเสนอราคาเปลี่ยนได้โดยไม่กระทบการล็อกอิน) · ถ้าไม่ได้กรอก
       เบอร์เอกสารไว้ ใช้เบอร์ที่ใช้เข้าระบบเป็นค่าตั้งต้นให้ จะได้ไม่ต้องพิมพ์สองรอบ */
    user_metadata: { name, firstName, lastName, phone: phone || (loginPhone ? `0${loginPhone.slice(2)}` : '') },
    // must_change_password forces a self-service password change on first login
    // (the admin-assigned password is temporary). Stored in app_metadata so the
    // user can't clear it client-side — only our /api/account/password route does.
    app_metadata: { role, department, must_change_password: true, ...(team ? { team, teams } : {}), ...(extraCaps.length ? { extraCaps } : {}) },
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  invalidateCache('assignable-users'); // dropdown ผู้รับผิดชอบเห็นคนใหม่ทันที
  await recordAudit({
    user: me, action: 'create', entityType: 'user', entityId: data.user.id,
    after: userAuditSnapshot(data.user), summary: `สร้างผู้ใช้ ${loginLabel(data.user)} (${role})`, request,
  });
  return Response.json({ id: data.user.id }, { status: 201 });
}
