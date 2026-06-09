import { createClient } from '@supabase/supabase-js';

// Server-only Supabase client using the SERVICE ROLE key.
// NEVER import this into client components — the service role key bypasses RLS.
let _admin = null;

export function getSupabaseAdmin() {
  if (_admin) return _admin;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase env missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).'
    );
  }

  _admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
