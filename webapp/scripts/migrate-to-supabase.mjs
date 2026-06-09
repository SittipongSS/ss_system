// Migrate data.json -> Supabase.
// Usage:  node scripts/migrate-to-supabase.mjs
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local (or env).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// --- tiny .env.local loader (no dependency) ---
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

const supabase = createClient(url, key, { auth: { persistSession: false } });
const data = JSON.parse(readFileSync(new URL('../data.json', import.meta.url), 'utf8'));

async function upsert(table, rows) {
  if (!rows || !rows.length) {
    console.log(`· ${table}: nothing to migrate`);
    return;
  }
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (error) {
    console.error(`✗ ${table}: ${error.message}`);
    process.exit(1);
  }
  console.log(`✓ ${table}: ${rows.length} rows`);
}

// Normalize: brands is NOT NULL in the schema; default missing/invalid to [].
const customers = (data.customers || []).map((c) => ({
  ...c,
  brands: Array.isArray(c.brands) ? c.brands : [],
}));

// Dedupe products by fgCode (unique in schema). Keep the latest by createdAt,
// and remap any orders that pointed at a dropped duplicate to the kept row.
const byFg = new Map();
for (const p of data.products || []) {
  const ex = byFg.get(p.fgCode);
  if (!ex || new Date(p.createdAt) > new Date(ex.createdAt)) byFg.set(p.fgCode, p);
}
const products = [...byFg.values()];
const keptIds = new Set(products.map((p) => p.id));
const idToFg = new Map((data.products || []).map((p) => [p.id, p.fgCode]));
const fgToKept = new Map(products.map((p) => [p.fgCode, p.id]));
const remap = (pid) => (keptIds.has(pid) ? pid : fgToKept.get(idToFg.get(pid)) ?? pid);
const orders = (data.orders || []).map((o) => ({ ...o, productId: remap(o.productId) }));

const dropped = (data.products || []).length - products.length;
if (dropped > 0) console.log(`· products: dropped ${dropped} duplicate fgCode row(s), orders remapped`);

// Order matters: products before orders (FK orders.productId -> products.id)
await upsert('customers', customers);
await upsert('products', products);
await upsert('orders', orders);

console.log('\nDone. data.json migrated to Supabase.');
