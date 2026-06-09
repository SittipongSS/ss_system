// Migrate user roles from user_metadata.role -> app_metadata.role.
//
// WHY: user_metadata (raw_user_meta_data) is editable by the user themselves
// via supabase.auth.updateUser({ data: { role: 'admin' } }), which is a
// privilege-escalation hole. app_metadata can only be written with the
// service_role key, so the app now reads the role from there instead.
//
// Run this ONCE (against each environment) BEFORE deploying the code change,
// otherwise existing users lose their role and fall back to read-only viewer.
//
// Usage:  node scripts/migrate-roles-to-app-metadata.mjs [--dry-run] [--force]
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local (or env).
//
//   --dry-run  Report what WOULD change without writing anything. Run this
//              first to see how many users exist and where their role lives.
//   --force    Overwrite an existing app_metadata.role from user_metadata.
//
// Idempotent: skips users that already have app_metadata.role, and is safe to
// re-run.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// --- tiny .env.local loader (no dependency), mirrors migrate-to-supabase.mjs ---
try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set them in .env.local).');
  process.exit(1);
}

const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');
const supabase = createClient(url, key, { auth: { persistSession: false } });

if (DRY_RUN) console.log('— DRY RUN — no changes will be written —\n');

let page = 1;
let migrated = 0;
let skipped = 0;
let missing = 0;

for (;;) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) {
    console.error(`✗ listUsers (page ${page}): ${error.message}`);
    process.exit(1);
  }
  const users = data?.users || [];
  if (users.length === 0) break;

  for (const u of users) {
    const fromUser = u.user_metadata?.role;
    const existing = u.app_metadata?.role;

    if (existing && !FORCE) {
      console.log(`· ${u.email || u.id}: already has app_metadata.role '${existing}' — skip`);
      skipped++;
      continue;
    }
    if (!fromUser) {
      // No role anywhere -> leave as-is; app treats them as read-only viewer.
      console.log(`· ${u.email || u.id}: no role in user_metadata — leave as viewer`);
      missing++;
      continue;
    }

    if (DRY_RUN) {
      const verb = existing ? `overwrite '${existing}' with` : 'set';
      console.log(`→ ${u.email || u.id}: WOULD ${verb} app_metadata.role '${fromUser}'`);
      migrated++;
      continue;
    }

    const { error: upErr } = await supabase.auth.admin.updateUserById(u.id, {
      app_metadata: { role: fromUser },
    });
    if (upErr) {
      console.error(`✗ ${u.email || u.id}: ${upErr.message}`);
      process.exit(1);
    }
    console.log(`✓ ${u.email || u.id}: role '${fromUser}' -> app_metadata`);
    migrated++;
  }

  page++;
}

const verb = DRY_RUN ? 'would-migrate' : 'migrated';
console.log(
  `\nDone. ${verb}=${migrated}, skipped(existing)=${skipped}, no-role=${missing}.`
);
if (DRY_RUN) {
  console.log('Dry run only — nothing was written. Re-run without --dry-run to apply.');
}
console.log('Reminder: assign roles from now on with the service_role key only,');
console.log("e.g. supabase.auth.admin.updateUserById(id, { app_metadata: { role } }).");
