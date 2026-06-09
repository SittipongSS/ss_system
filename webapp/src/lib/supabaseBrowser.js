import { createBrowserClient } from '@supabase/ssr';

// Supabase client for use in client components (login, layout, logout).
// Uses the public anon key + cookie-based session (shared with proxy.js).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
