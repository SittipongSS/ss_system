import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationsDir = path.join(root, 'supabase', 'migrations');

// These duplicate numeric prefixes were already committed and may already be
// recorded/applied in production. Renaming them would make an existing database
// disagree with git. Keep the exception explicit and reject every new duplicate.
const LEGACY_DUPLICATES = new Map([
  ['0076', ['0076_mgmt_departments.sql', '0076_product_pieces_per_case.sql']],
  ['0087', ['0087_personal_tasks_proxy_worker.sql', '0087_sales_history.sql']],
  ['0099', ['0099_chat_webhooks.sql', '0099_quotation_concurrent_create_guard.sql']],
]);

const files = (await readdir(migrationsDir))
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b, 'en'));

const malformed = files.filter((name) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(name));
const byVersion = new Map();

for (const name of files) {
  const version = name.slice(0, 4);
  const group = byVersion.get(version) || [];
  group.push(name);
  byVersion.set(version, group);
}

const unexpectedDuplicates = [];
const changedLegacyDuplicates = [];

for (const [version, group] of byVersion) {
  if (group.length < 2) continue;
  const expected = LEGACY_DUPLICATES.get(version);
  if (!expected) {
    unexpectedDuplicates.push(`${version}: ${group.join(', ')}`);
    continue;
  }
  if (group.join('\n') !== [...expected].sort().join('\n')) {
    changedLegacyDuplicates.push(`${version}: expected [${expected.join(', ')}], found [${group.join(', ')}]`);
  }
}

for (const [version, expected] of LEGACY_DUPLICATES) {
  if (!byVersion.has(version)) {
    changedLegacyDuplicates.push(`${version}: legacy exception is stale; expected [${expected.join(', ')}]`);
  }
}

if (malformed.length || unexpectedDuplicates.length || changedLegacyDuplicates.length) {
  console.error('Migration integrity check failed.');
  if (malformed.length) console.error(`Malformed filenames:\n- ${malformed.join('\n- ')}`);
  if (unexpectedDuplicates.length) console.error(`Unexpected duplicate versions:\n- ${unexpectedDuplicates.join('\n- ')}`);
  if (changedLegacyDuplicates.length) console.error(`Changed legacy duplicate groups:\n- ${changedLegacyDuplicates.join('\n- ')}`);
  process.exit(1);
}

const latest = files.at(-1)?.slice(0, 4) || 'none';
console.log(`Migration integrity OK: ${files.length} files, latest ${latest}.`);
console.warn('Legacy duplicate versions are intentionally preserved: 0076, 0087, 0099. Do not reuse them.');
