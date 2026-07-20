import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { can, canUser, canManageCommercialPresets, canManageDocumentStandards, canManageProductCategories } from '@/lib/permissions';

// Next.js 16 renamed `middleware` -> `proxy`. Runs on the Node.js runtime.
// Responsibilities:
//   1. Refresh the Supabase auth session cookie on each request.
//   2. Gate access: unauthenticated users are redirected to "/" (login);
//      unauthenticated /api calls get 401.
export async function proxy(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase isn't configured yet (e.g. local dev before setup), don't
  // block anything — the app keeps working without auth. In PRODUCTION this is
  // never intended: it means the deploy is missing env vars and auth is OFF for
  // the whole app, so make the misconfiguration loud in the server logs.
  if (!url || !anon) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[proxy] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing at runtime — ' +
          'auth is DISABLED. Set them in the deployment env (and rebuild, since NEXT_PUBLIC_* ' +
          'are inlined at build time).'
      );
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: getUser() validates the token with Supabase and refreshes cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isApi = path.startsWith('/api');
  const isLogin = path === '/'; // login page is public

  // getUser() may have rotated the access/refresh token and queued the new
  // cookies onto `response` (via setAll above). Any time we return a DIFFERENT
  // response (redirect / 4xx) we must copy those cookies over, or the browser
  // keeps the stale token — which, after rotation, fails the next request and
  // bounces the user back to login. (See @supabase/ssr middleware docs.)
  const withRefreshedCookies = (res) => {
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!user && !isLogin) {
    if (isApi) {
      return withRefreshedCookies(NextResponse.json({ error: 'unauthorized' }, { status: 401 }));
    }
    const redirectUrl = new URL('/', request.url);
    return withRefreshedCookies(NextResponse.redirect(redirectUrl));
  }

  // Business taxonomy management belongs to the Sales head and the break-glass
  // admin account. Other signed-in users still read categories through the API
  // for forms, but a direct URL must not expose the management surface.
  if (
    user && !isApi && path.startsWith('/database/product-categories') &&
    !canManageProductCategories(user.app_metadata?.role)
  ) {
    return withRefreshedCookies(NextResponse.redirect(new URL('/database', request.url)));
  }

  // Phase 4 versioned settings are system configuration. Keep these pages
  // aligned with their server API gates until the permission redesign in Phase 8.
  if (
    user && !isApi &&
    (path.startsWith('/settings/company') || path.startsWith('/settings/workflow-templates')) &&
    !can(user.app_metadata?.role, 'master:manage')
  ) {
    return withRefreshedCookies(NextResponse.redirect(new URL('/home', request.url)));
  }

  if (
    user && !isApi && path.startsWith('/settings/document-standards') &&
    !canManageDocumentStandards(user.app_metadata?.role)
  ) {
    return withRefreshedCookies(NextResponse.redirect(new URL('/settings', request.url)));
  }

  if (
    user && !isApi && path.startsWith('/settings/commercial-presets') &&
    !canManageCommercialPresets(user.app_metadata?.role)
  ) {
    return withRefreshedCookies(NextResponse.redirect(new URL('/settings', request.url)));
  }

  // ── Phased rollout lockdown ───────────────────────────────────────────
  // All three systems — Project Management (/pm), database (/database) and the
  // excise tax system (/tax) — are now open to their normal roles. Admins
  // (users:manage) reach everything. Non-admins also get the hub (/home), their
  // own-account API, and the master/holiday data the PM forms depend on. The
  // per-role capability gate (apiWriteAllowed) + row-level scope still apply.
  if (user && !isLogin && lockedOut({ role: user.app_metadata?.role, extraCaps: user.app_metadata?.extraCaps }, path, request.method, isApi)) {
    if (isApi) return withRefreshedCookies(NextResponse.json({ error: 'forbidden' }, { status: 403 }));
    return withRefreshedCookies(NextResponse.redirect(new URL('/home', request.url)));
  }

  // Role-based write protection for API routes (defense-in-depth; the UI also
  // hides actions). GET is always allowed for any signed-in user.
  if (user && isApi && !apiWriteAllowed(request.method, path, user.app_metadata?.role, user.app_metadata?.extraCaps)) {
    return withRefreshedCookies(NextResponse.json({ error: 'forbidden' }, { status: 403 }));
  }

  return response;
}

// Master switch for the phased lockdown. Set to false to re-open all three
// systems to their normal roles (the per-route capability gate below still
// applies).
const ADMIN_LOCKDOWN = true;

const startsWithAny = (path, prefixes) => prefixes.some((p) => path === p || path.startsWith(p + '/'));

// The master-data registries are reachable under both the legacy /api/X paths
// (kept for cross-domain callers) and the cohesive /api/master/X namespace.
// Collapse the latter onto the former so a single set of gating rules covers
// both. e.g. /api/master/customers/123 -> /api/customers/123.
const normalizeMaster = (path) => path.replace(/^\/api\/master\//, '/api/');

// Pages a non-admin may open: own account + hub + PM + database + excise tax + Sales Planning + SAHAMIT.
// NOTE: the proxy is coarse (role-only). /sahamit is opened here for any sales
// role, but the page guard + API handlers narrow it to team===KA + customer
// AR-109 (the proxy can't see team/customer). See canAccessSahamit().
const OPEN_PAGES = ['/account', '/home', '/sa', '/pm', '/database', '/tax', '/sales-planning', '/sahamit', '/mgmt'];
// APIs a non-admin may WRITE to: own account + PM + master-data registries +
// the excise tax tracks (registrations + orders). Row-level scope + the per-role
// capability gate (apiWriteAllowed) still apply: AE/AC need customers:edit/
// products:edit to create (lands as 'pending'), AE Supervisor to approve; excise
// registrations are SA-submit / LG-approve, filings are sales:act / legal:approve.
// Holiday/product-type writes stay supervisor-only.
const OPEN_WRITE_APIS = ['/api/account', '/api/pm', '/api/sa', '/api/customers', '/api/products', '/api/product-types', '/api/attachments', '/api/upload', '/api/excise-registrations', '/api/orders', '/api/sales-planning', '/api/sahamit', '/api/mgmt', '/api/document-standards', '/api/commercial-presets'];
// APIs a non-admin may READ (GET) — PM forms/timeline need this master data;
// managing the registries now lives in the (open) database system above; the tax
// tracks + reports power the (open) excise system.
const OPEN_READ_APIS = ['/api/customers', '/api/products', '/api/product-types', '/api/holidays', '/api/users', '/api/excise-registrations', '/api/orders', '/api/tax', '/api/sales-planning', '/api/sahamit'];

// During the phased lockdown, admins (users:manage) get everything; normal
// roles get the hub + PM system (+ read-only master data it depends on).
// `/` (login) is handled by the caller and never reaches here.
export function lockedOut(user, path, method, isApi) {
  if (!ADMIN_LOCKDOWN) return false;
  const role = user?.role;
  if (can(role, 'users:manage')) return false; // admin — full access to all systems
  path = normalizeMaster(path); // /api/master/X gated identically to /api/X
  if (isApi) {
    if (startsWithAny(path, OPEN_WRITE_APIS)) return false; // PM + own account: read+write
    if (method === 'GET' && startsWithAny(path, OPEN_READ_APIS)) return false; // supporting reads
    // Read-only admin surface opened by a per-user grant: the audit log.
    if (method === 'GET' && path.startsWith('/api/audit') && canUser(user, 'audit:view')) return false;
    return true;
  }
  if (path === '/settings') return false;
  if (path.startsWith('/settings/document-standards') && canManageDocumentStandards(role)) return false;
  if (path.startsWith('/settings/commercial-presets') && canManageCommercialPresets(role)) return false;
  // ย้ายมาจาก /database/* (เดิมเปิดผ่าน OPEN_PAGES): ปฏิทินวันหยุดทุก role ต้องดูได้
  // (ไทม์ไลน์โครงการอ้างอิง) ส่วน chat-webhooks หน้าเปิดได้แต่ตัวหน้า gate การจัดการ
  // ด้วย master:manage เอง — สิทธิ์คงเดิมทุกประการ ไม่ขยาย/ไม่หด
  if (startsWithAny(path, ['/settings/holidays', '/settings/chat-webhooks'])) return false;
  // Pages: the hub + open systems, plus the two admin READ surfaces when granted
  // per-user (audit log / user list). Grants are read-only; the write APIs stay
  // gated on the role caps (users:manage) in apiWriteAllowed.
  if (startsWithAny(path, OPEN_PAGES)) return false;
  if (path === '/audit' && canUser(user, 'audit:view')) return false;
  if (path === '/users' && canUser(user, 'users:view')) return false;
  return true;
}

// Coarse capability gate: does this role do this KIND of write at all?
// Row-level scope (own team / own record) is enforced inside the route
// handlers, which can see the target record's team + ownerId — the proxy
// only sees method + path.
function apiWriteAllowed(method, path, role, extraCaps) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true; // reads ok
  path = normalizeMaster(path); // /api/master/X gated identically to /api/X
  // mgmt access may be a per-user grant (app_metadata.extraCaps), not just the
  // role — so mgmt checks go through canUser, not can(role, …).
  const mgmtUser = { role, extraCaps };
  if (path.startsWith('/api/users')) return can(role, 'users:manage');
  if (path.startsWith('/api/customers')) {
    if (method === 'DELETE') return can(role, 'customers:delete');
    return can(role, 'customers:edit');
  }
  if (path.startsWith('/api/orders')) {
    if (method === 'DELETE') return can(role, 'sales:delete');
    // PATCH covers both sales clearance (sales:act) and legal tax payment (legal:approve)
    if (method === 'PATCH') return can(role, 'sales:act') || can(role, 'legal:approve');
    return can(role, 'sales:act'); // create
  }
  // Project management (SALES only). Row-level team scope enforced in handlers.
  if (path.startsWith('/api/pm')) {
    if (can(role, 'pm:edit')) return true;
    // staff/rd (ฝ่ายที่ไม่ใช่ sales) ต้องใช้ "งานของฉัน" ได้จริง — เปิดเฉพาะสอง
    // เส้นที่ handler บังคับสิทธิ์รายแถวเองครบ: งานส่วนตัว (canAssignTask — มอบได้
    // เฉพาะตัวเอง) + อัปเดตขั้นตอนรายตัว (pmTaskEditTier 'workflow' — เฉพาะงานที่
    // มอบให้เขา/ฝ่ายเขา แก้ได้แค่สถานะ/โน้ต). viewer คงอ่านอย่างเดียวทุกเส้น.
    if (can(role, 'pm:view') && role !== 'viewer') {
      if (path.startsWith('/api/pm/personal-tasks')) return true;
      if (method === 'PATCH' && /^\/api\/pm\/project-tasks\/[^/]+$/.test(path)) return true;
    }
    return false;
  }
  // ลีด (เฟส C): role marketing มีแค่ salesplan:lead (ไม่มี salesplan:edit) —
  // เปิดเขียนเฉพาะเส้นลีด; เส้น sales-planning อื่นยังต้อง salesplan:edit ตามเดิม.
  if (path.startsWith('/api/sales-planning/leads')) return can(role, 'salesplan:lead');
  // ระบบสอบถาม–ตอบกลับ (inquiries, mig 0104): ฝ่ายขายสร้าง/ถามต่อ/ปิดด้วย
  // salesplan:edit; ฝ่ายผู้ตอบ (role rd — cap inquiries:respond) รับเรื่อง/ตอบได้
  // แม้ไม่มีสิทธิ์แก้งานขาย. สิทธิ์รายแถว (ฝ่าย/scope ทีม) บังคับใน handler.
  if (path.startsWith('/api/sales-planning/inquiries')) {
    return can(role, 'salesplan:edit') || can(role, 'inquiries:respond');
  }
  if (path.startsWith('/api/sales-planning')) return can(role, 'salesplan:edit');
  // Native /sa APIs are part of Sales Planning (for example, creating a
  // project container before deals are linked). Keep the same write gate.
  if (path.startsWith('/api/sa')) return can(role, 'salesplan:edit');
  // SAHAMIT module. Coarse cap gate here; team===KA + customer AR-109 scope is
  // enforced inside the handlers (canAccessSahamit), which the proxy can't see.
  if (path.startsWith('/api/sahamit')) return can(role, 'sahamit:edit');
  // งานบริหาร (mgmt) — admin + secretary, หรือผู้ใช้ที่ได้รับสิทธิ์เสริม mgmt:edit.
  if (path.startsWith('/api/mgmt')) return canUser(mgmtUser, 'mgmt:edit');
  // Master taxonomy (product categories) — supervisor-only writes.
  if (path.startsWith('/api/product-types')) return canManageProductCategories(role);
  if (path.startsWith('/api/document-standards')) return canManageDocumentStandards(role);
  if (path.startsWith('/api/commercial-presets')) return canManageCommercialPresets(role);
  // Holiday calendar (working-day source for PM timeline) — supervisor-only writes.
  if (path.startsWith('/api/holidays')) return can(role, 'master:manage');
  // Excise registrations: SA submits/edits the link, LG approves (PATCH).
  if (path.startsWith('/api/excise-registrations')) {
    if (method === 'DELETE') return can(role, 'products:delete');
    if (method === 'PATCH') return can(role, 'products:edit') || can(role, 'legal:approve');
    return can(role, 'products:edit'); // create
  }
  if (path.startsWith('/api/products')) {
    if (method === 'DELETE') return can(role, 'products:delete');
    // PATCH covers both edit (sa) and approve (legal)
    if (method === 'PATCH') return can(role, 'products:edit') || can(role, 'legal:approve');
    return can(role, 'products:edit'); // create
  }
  // Attachments (polymorphic, migration 0028). Coarse gate: anyone who may edit
  // ANY supported parent entity passes here (customer/product = master editors;
  // order receipts = sales filing / legal tax approval). The route handler then
  // enforces the precise per-entity row scope (canEditRecord on the parent).
  if (path.startsWith('/api/attachments')) {
    return (
      can(role, 'customers:edit') ||
      can(role, 'products:edit') ||
      can(role, 'sales:act') ||
      can(role, 'legal:approve') ||
      can(role, 'pm:edit') ||
      canUser(mgmtUser, 'mgmt:edit')
    );
  }
  return true; // e.g. /api/upload — any signed-in user
}

export const config = {
  // Run on everything except Next internals and static image assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
