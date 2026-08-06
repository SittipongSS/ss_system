import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { can, canUser, canDeleteRegistrationRole, canManageCommercialPresets, canManageDocumentStandards, canManageProductCategories, isReadOnlyObserver } from '@/lib/permissions';

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

  // มติ 2026-07-20: secretary/marketing ได้ products:view (อ่านแคตตาล็อกอย่างเดียว)
  // แต่ไม่มี customers:view — หน้าภาพรวม /database และหน้าลูกค้าโชว์ข้อมูลลูกค้า
  // จึงต้องกันการเข้าตรงด้วย URL แล้วส่งไปหน้าสินค้าแทน
  if (
    user && !isApi &&
    (path === '/database' || path.startsWith('/database/customers')) &&
    !can(user.app_metadata?.role, 'customers:view') &&
    can(user.app_metadata?.role, 'products:view')
  ) {
    return withRefreshedCookies(NextResponse.redirect(new URL('/database/products', request.url)));
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

// โมดูลภาษีเรียกใช้ได้ทั้งชื่อเดิม (/api/excise-registrations, /api/orders) และชื่อใน
// namespace /api/tax/* ซึ่งเป็น alias ที่ re-export handler ตัวเดียวกัน (ดู
// app/api/tax/*/route.js) — ยุบชื่อ alias ลงบนชื่อเดิมเหมือนที่ normalizeMaster ทำกับ
// /api/master/* เพื่อให้กฎ **ชุดเดียวกัน** คุมทั้งสองชื่อ
//
// 🐞 บั๊กจริง: ไม่มีบรรทัดนี้ = `/api/tax/*` ไม่ตรงกับ OPEN_WRITE_APIS สักตัว (มีแต่
// `/api/orders`, `/api/excise-registrations`) → **ทุก role ที่ไม่ใช่แอดมินโดน 403** เมื่อ
// POST /api/tax/orders/from-sales-order ซึ่งเป็นทางเดียวที่ปุ่ม "สร้างใบยื่นจาก Sale
// Order" ใช้ · GET ผ่านได้เพราะ OPEN_READ_APIS มี `/api/tax` จึงเห็นรายการ SO ครบ
// แต่กดสร้างแล้วเด้ง — ดูเหมือนระบบพังทั้งที่ handler ถูกทุกบรรทัด
//
// ⚠️ /api/tax/reports ไม่ต้องยุบ (อ่านอย่างเดียว + `/api/tax` อยู่ใน OPEN_READ_APIS แล้ว)
const normalizeTax = (path) => path
  .replace(/^\/api\/tax\/registrations/, '/api/excise-registrations')
  .replace(/^\/api\/tax\/orders/, '/api/orders');

// ชื่อ path ที่ใช้ตัดสินสิทธิ์ — ทุกด่านต้องเรียกตัวนี้ ไม่ใช่ path ดิบ
const normalizePath = (path) => normalizeTax(normalizeMaster(path));

// Pages a non-admin may open: own account + hub + PM + database + excise tax + Sales Planning + SAHAMIT.
// NOTE: the proxy is coarse (role-only). /sahamit is opened here for any sales
// role, but the page guard + API handlers narrow it to team===KA + customer
// AR-109 (the proxy can't see team/customer). See canAccessSahamit().
// ⚠️ /production = ระบบวางแผนผลิต (แยกจาก /pm ตามมติ 2026-07-30) — ไม่ลงทะเบียน
// ที่นี่ = ฝ่ายผลิต/จัดซื้อเปิดหน้าไม่ได้เลย ทั้งที่เป็นเจ้าของโมดูล
// ⚠️ /go = เส้นทางกลาง "รหัสเอกสาร → หน้าจริง" ที่ลิงก์ในเธรดชี้มา — ไม่ลงทะเบียน
// ที่นี่ = ทุกลิงก์รหัสเอกสารในข้อความพาไปหน้า 403 (บทเรียนจาก /api/company-profile)
// ตัวมันเองไม่เปิดข้อมูลอะไรเพิ่ม: แปลงรหัสเป็น id แล้วส่งต่อ ด่านจริงอยู่หน้าปลายทาง
// ⚠️ default-deny: หน้าที่ไม่อยู่ในลิสต์นี้ = non-admin เจอ 403 เงียบ ๆ · prefix ใหม่
// ต้องลงที่นี่พร้อมกับที่สร้าง route ไม่งั้นเทสต์ผ่าน build ผ่าน แต่ผู้ใช้จริงเข้าไม่ได้
// (ทดสอบด้วย admin จะไม่เห็นบั๊กเลย — ต้อง smoke test ด้วยบัญชีของฝ่าย)
// `/requests` = คำร้องข้ามฝ่าย ย้ายออกจาก /sa เมื่อ P0b (ทะเบียนกลางของทุกฝ่าย)
const OPEN_PAGES = ['/account', '/home', '/sa', '/pm', '/production', '/service', '/database', '/tax', '/sales-planning', '/sahamit', '/mgmt', '/go', '/requests'];
// APIs a non-admin may WRITE to: own account + PM + master-data registries +
// the excise tax tracks (registrations + orders). Row-level scope + the per-role
// capability gate (apiWriteAllowed) still apply: AE/AC need customers:edit/
// products:edit to create (lands as 'pending'), AE Supervisor to approve; excise
// registrations are SA-submit / LG-approve, filings are sales:act / legal:approve.
// Holiday/product-type writes stay supervisor-only.
// ⚠️ /api/scents + /api/formulas = ทะเบียนกลิ่น/สูตร (mig 0171) เข้าถึงจริงผ่าน
// /api/master/* ซึ่ง normalizeMaster ตัดเป็นชื่อนี้ — ไม่ลงทะเบียนที่นี่ = non-admin
// โดน 403 เงียบ ๆ ทั้งอ่านและเขียน (บทเรียนจาก /api/company-profile)
const OPEN_WRITE_APIS = ['/api/account', '/api/pm', '/api/production', '/api/service', '/api/sa', '/api/customers', '/api/products', '/api/product-types', '/api/scents', '/api/formulas', '/api/attachments', '/api/updates', '/api/notifications', '/api/upload', '/api/excise-registrations', '/api/orders', '/api/sales-planning', '/api/sahamit', '/api/mgmt', '/api/document-standards', '/api/commercial-presets'];
// APIs a non-admin may READ (GET) — PM forms/timeline need this master data;
// managing the registries now lives in the (open) database system above; the tax
// tracks + reports power the (open) excise system.
// /api/company-profile = บล็อกบริษัทที่เผยแพร่ ซึ่งพิมพ์อยู่บนเอกสารถึงลูกค้าอยู่แล้ว
// ทุกคนที่ล็อกอินจึงอ่านได้ (ไม่งั้นใบที่ AE พิมพ์จะตกไปใช้ constant สำรองเงียบ ๆ) —
// ทางเขียนยังอยู่ที่ /api/organization-settings ซึ่ง gate ด้วย master:manage ตามเดิม
// /api/thai-address = ทะเบียนจังหวัด/อำเภอ/ตำบล ของกรมการปกครอง — ข้อมูลสาธารณะ
// ไม่มีของใครอยู่ในนั้น และทุกคนที่กรอกที่อยู่ลูกค้า/ไซต์บริการต้องใช้ ⇒ อ่านได้หมด
const OPEN_READ_APIS = ['/api/customers', '/api/products', '/api/product-types', '/api/holidays', '/api/users', '/api/excise-registrations', '/api/orders', '/api/tax', '/api/sales-planning', '/api/sahamit', '/api/company-profile', '/api/thai-address'];

// During the phased lockdown, admins (users:manage) get everything; normal
// roles get the hub + PM system (+ read-only master data it depends on).
// `/` (login) is handled by the caller and never reaches here.
export function lockedOut(user, path, method, isApi) {
  if (!ADMIN_LOCKDOWN) return false;
  const role = user?.role;
  if (can(role, 'users:manage')) return false; // admin — full access to all systems
  path = normalizePath(path); // /api/master/X + /api/tax/X gated identically to /api/X
  if (isApi) {
    if (startsWithAny(path, OPEN_WRITE_APIS)) return false; // PM + own account: read+write
    if (method === 'GET' && startsWithAny(path, OPEN_READ_APIS)) return false; // supporting reads
    // Read-only admin surface opened by a per-user grant: the audit log.
    if (method === 'GET' && path.startsWith('/api/audit') && canUser(user, 'audit:view')) return false;
    // เช่นเดียวกัน: รายงานความพร้อมลายเซ็น (Phase 5B) อ่านอย่างเดียว ใช้ cap เดิม users:view
    if (method === 'GET' && path.startsWith('/api/admin/signature-coverage') && canUser(user, 'users:view')) return false;
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
  if (path === '/settings/signature-coverage' && canUser(user, 'users:view')) return false;
  return true;
}

// Coarse capability gate: does this role do this KIND of write at all?
// Row-level scope (own team / own record) is enforced inside the route
// handlers, which can see the target record's team + ownerId — the proxy
// only sees method + path.
export function apiWriteAllowed(method, path, role, extraCaps) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true; // reads ok
  path = normalizePath(path); // /api/master/X + /api/tax/X gated identically to /api/X
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
  // วางแผนผลิต — ระบบแยกจาก PM ของฝ่ายขาย (มติ 2026-07-30). คนวางคิวคือฝ่าย PC/PD
  // ซึ่งเป็น role `staff` **ไม่มี pm:edit** จึงต้องมีกฎของตัวเอง
  // ⚠️ ด่านนี้หยาบ (เห็นแค่ role) — `staff` ทุกฝ่ายผ่านตรงนี้หมด รวม WH/QC
  //    **ตัวกั้นจริงคือ canEditProduction() ใน handler** ที่เห็น department
  //    (รูปเดียวกับ /api/sahamit ที่ proxy มองไม่เห็น team) ห้ามลืมด่านนั้น
  if (path.startsWith('/api/production')) {
    return canUser({ role, extraCaps }, 'production:edit');
  }
  // ธุรกิจบริการ (ฝ่าย TS) — รูปเดียวกัน: ด่านหยาบที่นี่ ตัวกั้นจริงคือ canEditService()
  // ใน handler ซึ่งเห็นทั้ง department (TS) และ team (SV)
  if (path.startsWith('/api/service')) {
    return canUser({ role, extraCaps }, 'service:edit');
  }
  if (path.startsWith('/api/pm')) {
    if (can(role, 'pm:edit')) return true;
    // staff/rd (ฝ่ายที่ไม่ใช่ sales) ต้องใช้ "งานของฉัน" ได้จริง — เปิดเฉพาะสอง
    // เส้นที่ handler บังคับสิทธิ์รายแถวเองครบ: งานส่วนตัว (canAssignTask — มอบได้
    // เฉพาะตัวเอง) + อัปเดตขั้นตอนรายตัว (pmTaskEditTier 'workflow' — เฉพาะงานที่
    // มอบให้เขา/ฝ่ายเขา แก้ได้แค่สถานะ/โน้ต). viewer คงอ่านอย่างเดียวทุกเส้น.
    if (can(role, 'pm:view') && !isReadOnlyObserver(role)) {
      if (path.startsWith('/api/pm/personal-tasks')) return true;
      if (method === 'PATCH' && /^\/api\/pm\/project-tasks\/[^/]+$/.test(path)) return true;
    }
    return false;
  }
  // ลีด (เฟส C): role marketing มีแค่ salesplan:lead (ไม่มี salesplan:edit) —
  // เปิดเขียนเฉพาะเส้นลีด; เส้น sales-planning อื่นยังต้อง salesplan:edit ตามเดิม.
  if (path.startsWith('/api/sales-planning/leads')) return can(role, 'salesplan:lead');
  // (ระบบสอบถาม /api/sales-planning/inquiries ถูกปลดระวางใน mig 0174 —
  //  งานย้ายไปคำร้องข้ามฝ่าย /api/sa/requests ซึ่งมีกฎของตัวเองด้านล่าง)
  if (path.startsWith('/api/sales-planning')) return can(role, 'salesplan:edit');
  // ระบบขอราคาผลิต (/api/sa/costing) — ต้องมาก่อนกฎ /api/sa ด้านล่าง เพราะ
  // สามเส้นนี้ถือคนละ cap: ผู้บริหารอนุมัติได้ทั้งที่ไม่มี salesplan:edit, และ
  // RD/PC ตอบราคาได้ทั้งที่ไม่มีสิทธิ์แก้งานขายเลย. สิทธิ์รายแถว (บรรทัดของฝ่ายตน
  // ผ่าน sourceDept, สถานะใบ) บังคับใน handler ซึ่ง proxy มองไม่เห็น.
  if (path.startsWith('/api/sa/costing')) {
    if (/\/approve$/.test(path)) return can(role, 'costing:approve');
    // ราคาวัสดุตอบที่ "คำร้อง" (/api/sa/requests) แล้ว ไม่มีเส้นให้ RD/PC
    // แตะใบขอราคาผลิตโดยตรงอีก — ที่เหลือเป็นงานของฝ่ายขายเจ้าของใบล้วน ๆ
    return can(role, 'costing:edit');
  }
  // ทะเบียนวัสดุ + คำขอราคาวัสดุ (mig 0143 + 0157) — สองฝ่ายใช้เส้นเดียวกันคนละ
  // จุดประสงค์: เซลเปิดคำขอ/เสนอวัสดุร่าง (costing:edit) · RD/PC รับวัสดุและใส่ราคา
  // (costing:quote) → ต้องปล่อยผ่าน **ทั้งสอง cap** ไม่งั้น RD/PC ที่ไม่มี costing:edit
  // จะโดน 403 ทุกครั้งที่กดแก้ราคา (บั๊กเดิม) ส่วน handler เป็นด่านจริง: มันรู้ว่า
  // วัสดุตัวนั้นเป็นของฝ่ายไหน (sourceDept) ซึ่ง proxy มองไม่เห็น
  // ⚠️ /api/sa/requests (mig 0173, เดิม /api/sa/materials/asks) ต้องมาก่อนกฎ
  // /api/sa ด้านล่างด้วยเหตุผลเดียวกับทะเบียนวัสดุ — RD/PC รับเรื่อง/ตอบได้ทั้งที่
  // ไม่มี costing:edit และไม่มีสิทธิ์แก้งานขายเลย
  if (path.startsWith('/api/sa/requests') || path.startsWith('/api/sa/materials')) {
    // ⭐ `requests:answer` เพิ่มเข้ามาตอนแยกด่านคำร้องออกจากด่านราคา (R-1) — วันนี้
    // role ที่ถือมันถือ costing:quote อยู่แล้วทั้งคู่ ⇒ **ไม่มีใครได้สิทธิ์เพิ่ม** แต่
    // ฝ่ายที่รับคำร้องโดยไม่ตอบราคา (บัญชี) จะผ่านชั้นนี้ได้โดยไม่ต้องแจก costing:*
    // ⚠️ ชั้นนี้หยาบระดับ role · ฝ่ายจริงถูกแคบที่ handler ด้วย canAnswerRequestsFor
    return can(role, 'costing:edit') || can(role, 'costing:quote') || can(role, 'requests:answer');
  }
  // ทะเบียนกลิ่น + ทะเบียนสูตร (mig 0171) — ข้อมูลหลักที่ **สองฝ่ายใช้เส้นเดียวกัน
  // คนละจุดประสงค์**: ฝ่ายขายเสนอเป็นร่าง (products:edit) · RD รับเข้าทะเบียน/ใส่รหัส/
  // ส่ง Rev (ไม่มี products:edit แต่ต้องผ่าน) → ต้องปล่อยทั้งสองทาง เหมือนที่ทะเบียน
  // วัสดุเคยพลาดแล้วทำให้ RD/PC โดน 403 ทุกครั้งที่กดแก้ราคา
  // ด่านจริงอยู่ใน handler ซึ่งรู้ว่าแถวนั้นเป็นร่างของใครและใครเป็นเจ้าของทะเบียน
  if (path.startsWith('/api/scents') || path.startsWith('/api/formulas')) {
    return can(role, 'products:edit') || role === 'rd';
  }
  // แม่แบบต้นทุนต่อประเภทสินค้า — ข้อมูลหลักของระบบ ผู้ดูแลระบบเท่านั้น
  // (มติ 2026-07-22: ผู้บริหารมีหน้าที่อนุมัติ ไม่ได้ดูแล master data)
  if (path.startsWith('/api/cost-templates')) return can(role, 'master:manage');
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
    // ลบทะเบียน = อำนาจของโมดูลภาษี (superuser / senior_ae ในทีม / ae ของตัวเอง)
    // ไม่ใช่ products:delete ของแคตตาล็อกสินค้า — ด่านจริงราย record อยู่ที่ handler
    if (method === 'DELETE') return canDeleteRegistrationRole(role);
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
  //
  // 🐞 ลิสต์นี้เคยมีแต่ cap ของ "ฝ่ายขาย + master data + mgmt" ⇒ **RD และ staff
  // (PC/PD/WH/QC/TS) แนบไฟล์ไม่ได้เลยทั้งระบบ** ทั้งที่ทะเบียนไฟล์แนบเปิดทางให้
  // ครบทุกจุดแล้ว: /api/upload ผ่าน (ตกท้ายไฟล์นี้ = ทุกคนที่ล็อกอิน) ไฟล์ขึ้น Drive
  // จริง แล้วมาตายตอนบันทึกแถวที่ด่านนี้ ⇒ ระบบลบไฟล์ทิ้ง แล้วเด้งคำว่า "forbidden"
  // ดิบ ๆ · กระทบทุกที่ที่ฝ่ายเหล่านี้ต้องแนบ: รูป/สเปกในคำร้องข้ามฝ่าย (ซึ่งเป็น
  // เหตุผลที่สร้างที่แนบไฟล์ตรงนั้นตั้งแต่แรก), ใบขอราคาผลิต, ไฟล์แนบงานของตัวเอง
  //
  // ⚠️ ด่านนี้หยาบระดับ role โดยเจตนา — proxy เห็นแค่ method+path ไม่รู้ว่าไฟล์จะไป
  // เกาะ entity ไหน · **ตัวกั้นจริงคือ handler**: canAttachToCosting (ฝ่ายเจ้าของ
  // คำร้อง + เคสต้องยังเปิดอยู่) · canAttachToPersonalTask · canAttachToDeal ·
  // canEditRecord — ที่นี่จึงต้อง "กว้างพอให้ผ่าน" ไม่ใช่ "แคบจนตัดคนที่มีสิทธิ์จริง"
  if (path.startsWith('/api/attachments')) {
    return (
      can(role, 'customers:edit') ||
      can(role, 'products:edit') ||
      can(role, 'sales:act') ||
      can(role, 'legal:approve') ||
      can(role, 'pm:edit') ||
      canUser(mgmtUser, 'mgmt:edit') ||
      // ระบบขอราคา + คำร้องข้ามฝ่าย — ชุด cap เดียวกับด่าน /api/sa/requests ข้างบน
      // (RD/PC รับเรื่องและตอบได้ทั้งที่ไม่มีสิทธิ์แก้งานขายเลย) · ใช้ costing:edit/
      // quote ไม่ใช่ costing:view เพราะ view เป็นของผู้สังเกตการณ์ (executive) ด้วย
      can(role, 'costing:edit') ||
      can(role, 'costing:quote') ||
      can(role, 'requests:answer') ||
      // ไฟล์แนบ "งานของฉัน" (personal_task) — ฝ่ายที่ไม่ใช่ sales ถือแค่ pm:view
      // แพตเทิร์นเดียวกับด่าน /api/pm ข้างบน: ผู้สังเกตการณ์อ่านอย่างเดียวไม่นับ
      // (วันนี้ยังไม่เปิดให้ใครเพิ่มจากบรรทัดบน — มีไว้ไม่ให้สิทธิ์ของงานส่วนบุคคล
      //  ไปผูกกับ cap ของระบบขอราคาโดยบังเอิญ)
      (can(role, 'pm:view') && !isReadOnlyObserver(role))
    );
  }
  // เธรดอัปเดตของกลาง (mig 0163) — ปล่อยผ่านทุก role ที่ล็อกอินโดยตั้งใจ:
  // ด่านจริงคือทะเบียน lib/master/updateAccess.js ซึ่งรู้ว่า entity นั้นใครอ่าน/โพสต์ได้
  // (proxy เห็นแค่ role ไม่รู้จัก entity — เดาแทนไม่ได้). แพตเทิร์นเดียวกับ /api/upload
  if (path.startsWith('/api/updates')) return true;
  // กล่องแจ้งเตือน (mig 0185) — เป็นของ "ตัวเอง" ล้วน: route อ่าน userId จาก session
  // ไม่รับพารามิเตอร์ผู้ใช้เลย จึงไม่มีอะไรให้ proxy กั้นเพิ่ม · ทุก role ที่ล็อกอิน
  // ต้องมีกล่องของตัวเอง (รวม viewer/marketing) ไม่งั้นกระดิ่งขึ้น 403 เงียบทั้งระบบ
  if (path.startsWith('/api/notifications')) return true;
  return true; // e.g. /api/upload — any signed-in user
}

export const config = {
  // Run on everything except Next internals and static image assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
