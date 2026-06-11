import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { can } from '@/lib/permissions';

// Next.js 16 renamed `middleware` -> `proxy`. Runs on the Node.js runtime.
// Responsibilities:
//   1. Refresh the Supabase auth session cookie on each request.
//   2. Gate access: unauthenticated users are redirected to "/" (login);
//      unauthenticated /api calls get 401.
export async function proxy(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase isn't configured yet (e.g. local dev before setup), don't
  // block anything — the app keeps working without auth.
  if (!url || !anon) return NextResponse.next();

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

  if (!user && !isLogin) {
    if (isApi) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    const redirectUrl = new URL('/', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // ── Phased rollout lockdown ───────────────────────────────────────────
  // Only the Project Management system (/pm) is open to normal roles right now;
  // the tax + database systems stay admin-only. Admins (users:manage) reach
  // everything. Non-admins also get the hub (/home), their own-account API, and
  // READ-ONLY access to the master/holiday data the PM forms depend on.
  if (user && !isLogin && lockedOut(user.app_metadata?.role, path, request.method, isApi)) {
    if (isApi) return Response.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.redirect(new URL('/home', request.url));
  }

  // Role-based write protection for API routes (defense-in-depth; the UI also
  // hides actions). GET is always allowed for any signed-in user.
  if (user && isApi && !apiWriteAllowed(request.method, path, user.app_metadata?.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  return response;
}

// Master switch for the phased lockdown. Set to false to re-open all three
// systems to their normal roles (the per-route capability gate below still
// applies).
const ADMIN_LOCKDOWN = true;

const startsWithAny = (path, prefixes) => prefixes.some((p) => path === p || path.startsWith(p + '/'));

// Pages a non-admin may open during the phased rollout: hub + PM system.
const OPEN_PAGES = ['/home', '/pm'];
// APIs a non-admin may WRITE to: own account + the PM system itself.
const OPEN_WRITE_APIS = ['/api/account', '/api/pm'];
// APIs a non-admin may READ (GET) — PM forms/timeline need this master data,
// but managing those registries stays in the (still-locked) database system.
const OPEN_READ_APIS = ['/api/customers', '/api/products', '/api/product-types', '/api/holidays', '/api/users'];

// During the phased lockdown, admins (users:manage) get everything; normal
// roles get the hub + PM system (+ read-only master data it depends on).
// `/` (login) is handled by the caller and never reaches here.
function lockedOut(role, path, method, isApi) {
  if (!ADMIN_LOCKDOWN) return false;
  if (can(role, 'users:manage')) return false; // admin — full access to all systems
  if (isApi) {
    if (startsWithAny(path, OPEN_WRITE_APIS)) return false; // PM + own account: read+write
    if (method === 'GET' && startsWithAny(path, OPEN_READ_APIS)) return false; // supporting reads
    return true;
  }
  return !startsWithAny(path, OPEN_PAGES); // pages: hub + PM only
}

// Coarse capability gate: does this role do this KIND of write at all?
// Row-level scope (own team / own record) is enforced inside the route
// handlers, which can see the target record's team + ownerId — the proxy
// only sees method + path.
function apiWriteAllowed(method, path, role) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true; // reads ok
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
  if (path.startsWith('/api/pm')) return can(role, 'pm:edit');
  // Master taxonomy (product categories) — supervisor-only writes.
  if (path.startsWith('/api/product-types')) return can(role, 'master:manage');
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
  return true; // e.g. /api/upload — any signed-in user
}

export const config = {
  // Run on everything except Next internals and static image assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
