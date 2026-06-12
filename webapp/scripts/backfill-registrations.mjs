import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(url, key);

async function backfillRegs() {
  console.log('============================================================');
  console.log('         BACKFILL EXCISE REGISTRATIONS FROM PRODUCTS         ');
  console.log('============================================================\n');

  // Load products and customers
  const { data: products } = await supabase.from('products').select('*');
  const { data: customers } = await supabase.from('customers').select('*');
  const { data: existingRegs } = await supabase.from('excise_registrations').select('*');

  const customerMap = new Map(customers?.map(c => [c.id, c]) || []);
  const existingRegKeys = new Set(existingRegs?.map(r => `${r.productId}_${r.customerId}`) || []);

  const regsToInsert = [];

  for (const p of products || []) {
    // Only backfill if the product is linked to a customer
    if (p.customerId) {
      const key = `${p.id}_${p.customerId}`;
      if (!existingRegKeys.has(key)) {
        const customer = customerMap.get(p.customerId);
        console.log(`· Creating registration for Product [${p.id}] (${p.fgCode}) and Customer [${p.customerId}] ("${customer?.name || p.customerName}")`);
        
        const regId = `REG-${p.id.substring(4)}`;
        regsToInsert.push({
          id: regId,
          productId: p.id,
          customerId: p.customerId,
          fgCode: p.fgCode,
          productName: p.productDescription,
          brandName: p.brandName,
          customerName: customer?.name || p.customerName,
          taxId: customer?.taxId || p.taxId,
          isExciseTaxable: p.isExciseTaxable,
          taxableOverride: p.taxableOverride,
          exciseTax: p.exciseTax,
          localTax: p.localTax,
          status: p.status || 'pending_legal',
          approvalNumber: p.approvalNumber,
          approvedBy: p.approvedBy,
          approvedByName: p.approvedByName,
          approvedAt: p.approvedAt,
          rejectionReason: p.rejectionReason,
          team: p.team,
          ownerId: p.ownerId,
          assignee: p.assignee,
          metadata: p.metadata || {},
          createdAt: p.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    }
  }

  if (regsToInsert.length > 0) {
    const { error: insertErr } = await supabase.from('excise_registrations').insert(regsToInsert);
    if (insertErr) {
      console.error(`✗ Error inserting registrations: ${insertErr.message}`);
    } else {
      console.log(`✓ Successfully backfilled ${regsToInsert.length} excise registrations!`);
    }
  } else {
    console.log('✓ All eligible products already have excise registrations.');
  }
  console.log('============================================================');
}

backfillRegs().catch(err => {
  console.error('Error backfilling registrations:', err);
});
