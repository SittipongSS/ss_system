// Backfill products.customerId from the existing customerName/taxId snapshot.
// One-time, safe & idempotent: only touches products where customerId IS NULL,
// never overwrites the name/taxId snapshot. Matches by taxId first (most
// precise), then exact name.
// Usage:  node scripts/backfill-product-customer.mjs
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

const norm = (s) => (s == null ? '' : String(s).trim());

async function main() {
  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('id, name, taxId');
  if (custErr) { console.error('✗ load customers:', custErr.message); process.exit(1); }

  const byTax = new Map();
  const byName = new Map();
  for (const c of customers || []) {
    if (norm(c.taxId)) byTax.set(norm(c.taxId), c.id);
    if (norm(c.name)) byName.set(norm(c.name), c.id);
  }

  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, customerId, customerName, taxId')
    .is('customerId', null);
  if (prodErr) { console.error('✗ load products:', prodErr.message); process.exit(1); }

  let matched = 0, unmatched = 0;
  for (const p of products || []) {
    const cid = byTax.get(norm(p.taxId)) || byName.get(norm(p.customerName));
    if (!cid) { unmatched++; continue; }
    const { error } = await supabase.from('products').update({ customerId: cid }).eq('id', p.id);
    if (error) { console.error(`✗ ${p.id}: ${error.message}`); continue; }
    matched++;
  }

  console.log(`✓ backfill done — linked ${matched}, unmatched ${unmatched}, total scanned ${(products || []).length}`);
}

main();
