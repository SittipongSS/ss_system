// Archive (export + delete) old audit_logs rows to keep the table from growing
// without bound. The audit design is intentionally NO auto-purge — so this is a
// MANUAL tool: it first writes the rows being removed to a JSON file (cold
// archive you keep elsewhere, e.g. Google Drive), then deletes them.
//
// WHY: audit_logs stores full before/after jsonb per write and never expires.
// For a near-full Supabase, trimming logs older than N months reclaims space
// while preserving the records in an exported file.
//
// Usage:
//   node scripts/archive-audit-logs.mjs --months=24 [--dry-run] [--out=path.json]
//
//   --months=N   archive rows with createdAt older than N months (REQUIRED to
//                delete anything — without it the script only reports counts).
//   --dry-run    report what WOULD be archived/deleted; write nothing, delete nothing.
//   --out=PATH   archive file path (default: ./audit-archive-<cutoff>.json).
//
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local (or env).
// Safe to re-run: only ever touches rows older than the cutoff.
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// --- tiny .env.local loader (no dependency), mirrors other scripts/ ---
try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set them in .env.local).');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const monthsArg = process.argv.find((a) => a.startsWith('--months='));
const outArg = process.argv.find((a) => a.startsWith('--out='));
const months = monthsArg ? parseInt(monthsArg.split('=')[1], 10) : null;

if (months !== null && (!Number.isFinite(months) || months < 1)) {
  console.error('--months must be a positive integer (e.g. --months=24).');
  process.exit(1);
}

const cutoff = new Date();
if (months !== null) cutoff.setMonth(cutoff.getMonth() - months);
const cutoffIso = cutoff.toISOString();

const supabase = createClient(url, key, { auth: { persistSession: false } });
const PAGE = 1000;

async function main() {
  if (months === null) {
    // Report-only: no cutoff given, just show table size + oldest/newest.
    const { count } = await supabase.from('audit_logs').select('id', { count: 'exact', head: true });
    console.log(`audit_logs has ${count ?? '?'} rows total.`);
    console.log('Pass --months=N (e.g. --months=24) to archive rows older than N months.');
    return;
  }

  console.log(`${DRY_RUN ? '— DRY RUN — ' : ''}archiving audit_logs older than ${cutoffIso} (${months} months).`);

  // Count first so we know the scope before touching anything.
  const { count, error: cntErr } = await supabase
    .from('audit_logs').select('id', { count: 'exact', head: true }).lt('createdAt', cutoffIso);
  if (cntErr) { console.error('count failed:', cntErr.message); process.exit(1); }
  if (!count) { console.log('Nothing older than the cutoff. Done.'); return; }
  console.log(`${count} rows match.`);

  // Page through the matching rows and collect them for the archive file.
  const rows = [];
  for (let from = 0; from < count; from += PAGE) {
    const { data, error } = await supabase
      .from('audit_logs').select('*').lt('createdAt', cutoffIso)
      .order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) { console.error('fetch failed:', error.message); process.exit(1); }
    rows.push(...(data || []));
  }

  const outPath = outArg ? outArg.split('=')[1] : `./audit-archive-${cutoffIso.slice(0, 10)}.json`;
  if (DRY_RUN) {
    console.log(`Would write ${rows.length} rows to ${outPath} and delete them. (dry run — nothing written)`);
    return;
  }

  // 1) Export to file FIRST — never delete before the archive is safely on disk.
  writeFileSync(outPath, JSON.stringify({ cutoff: cutoffIso, count: rows.length, rows }, null, 2), 'utf8');
  console.log(`Wrote ${rows.length} rows to ${outPath}.`);

  // 2) Delete in id batches (avoid one huge statement).
  const ids = rows.map((r) => r.id);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += PAGE) {
    const batch = ids.slice(i, i + PAGE);
    const { error } = await supabase.from('audit_logs').delete().in('id', batch);
    if (error) { console.error(`delete batch failed at ${i}:`, error.message); process.exit(1); }
    deleted += batch.length;
  }
  console.log(`Deleted ${deleted} rows. Archive kept at ${outPath}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
