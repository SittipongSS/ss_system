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

  // Role-based write protection for API routes (defense-in-depth; the UI also
  // hides actions). GET is always allowed for any signed-in user.
  if (user && isApi && !apiWriteAllowed(request.method, path, user.app_metadata?.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  return response;
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
