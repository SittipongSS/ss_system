import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// --- tiny .env.local loader ---
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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey) {
  console.error('✗ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });
const supabaseAnon = anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

async function runDiagnostics() {
  console.log('============================================================');
  console.log('         EXCISE TAX MANAGER — DATABASE DIAGNOSTICS          ');
  console.log('============================================================');
  console.log(`Supabase URL: ${url}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('------------------------------------------------------------\n');

  // 1. Connection check
  console.log('1. Testing Connection...');
  const { data: connTest, error: connErr } = await supabaseAdmin.from('customers').select('id').limit(1);
  if (connErr) {
    console.error('✗ Connection failed:', connErr.message);
    process.exit(1);
  }
  console.log('✓ Connection successful.\n');

  // Define tables to check
  const tables = [
    'customers',
    'products',
    'orders',
    'order_items',
    'product_types',
    'projects',
    'project_tasks',
    'project_products',
    'excise_registrations',
    'holidays',
    'personal_tasks'
  ];

  // 2. Fetch counts & RLS verification
  console.log('2. Table Status and Row Counts (Admin vs Anon Key RLS Check)...');
  const counts = {};
  for (const table of tables) {
    // Admin count (bypasses RLS)
    const { count: adminCount, error: adminErr } = await supabaseAdmin
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (adminErr) {
      console.log(`✗ ${table}: Error reading as admin - ${adminErr.message}`);
      continue;
    }
    counts[table] = adminCount || 0;

    // Anon count (subject to RLS)
    let anonStatus = 'Unknown (No Anon Client)';
    if (supabaseAnon) {
      const { data: anonData, error: anonErr } = await supabaseAnon
        .from(table)
        .select('*')
        .limit(1);

      if (anonErr) {
        anonStatus = `SECURE (Error/No access: ${anonErr.message})`;
      } else if (anonData && anonData.length > 0) {
        anonStatus = `⚠ WARNING: RLS Bypassed or Read Policy exists! (Found ${anonData.length} records)`;
      } else {
        anonStatus = `SECURE (Returned 0 rows)`;
      }
    }
    console.log(`· [${table.padEnd(20)}] Rows: ${String(counts[table]).padStart(6)} | RLS Status: ${anonStatus}`);
  }
  console.log();

  // 3. Deep Data Consistency Checks
  console.log('3. Running Deep Data Consistency Checks...');

  // Fetch reference IDs for relational checks
  const { data: customers } = await supabaseAdmin.from('customers').select('id, name, arCode');
  const { data: products } = await supabaseAdmin.from('products').select('id, fgCode, productDescription');
  const { data: orders } = await supabaseAdmin.from('orders').select('*');
  const { data: orderItems } = await supabaseAdmin.from('order_items').select('*');
  const { data: projects } = await supabaseAdmin.from('projects').select('id, name');
  const { data: projectTasks } = await supabaseAdmin.from('project_tasks').select('*');
  const { data: projectProducts } = await supabaseAdmin.from('project_products').select('*');
  const { data: registrations } = await supabaseAdmin.from('excise_registrations').select('*');

  const customerIds = new Set(customers?.map(c => c.id) || []);
  const productIds = new Set(products?.map(p => p.id) || []);
  const orderIds = new Set(orders?.map(o => o.id) || []);
  const projectIds = new Set(projects?.map(p => p.id) || []);

  let issuesFound = 0;

  // A. Orphaned Order Items
  if (orderItems) {
    const orphanedItems = orderItems.filter(item => !orderIds.has(item.orderId));
    if (orphanedItems.length > 0) {
      console.log(`⚠ Found ${orphanedItems.length} order_items without a matching order!`);
      orphanedItems.forEach(item => {
        console.log(`   - Item ID: ${item.id}, Order ID: ${item.orderId}, Product ID: ${item.productId}`);
      });
      issuesFound += orphanedItems.length;
    } else {
      console.log('✓ No orphaned order_items found.');
    }

    const itemsWithoutProduct = orderItems.filter(item => item.productId && !productIds.has(item.productId));
    if (itemsWithoutProduct.length > 0) {
      console.log(`⚠ Found ${itemsWithoutProduct.length} order_items referencing deleted/non-existent product IDs!`);
      itemsWithoutProduct.forEach(item => {
        console.log(`   - Item ID: ${item.id}, Order ID: ${item.orderId}, Invalid Product ID: ${item.productId}`);
      });
      issuesFound += itemsWithoutProduct.length;
    } else {
      console.log('✓ All order_items point to valid products.');
    }
  }

  // B. Orders referencing non-existent Customers or Products (backward compat field `productId` in orders)
  if (orders) {
    const ordersWithoutCustomer = orders.filter(o => o.customerId && !customerIds.has(o.customerId));
    if (ordersWithoutCustomer.length > 0) {
      console.log(`⚠ Found ${ordersWithoutCustomer.length} orders referencing non-existent customer IDs!`);
      ordersWithoutCustomer.forEach(o => {
        console.log(`   - Order ID: ${o.id}, Invalid Customer ID: ${o.customerId}`);
      });
      issuesFound += ordersWithoutCustomer.length;
    } else {
      console.log('✓ All orders point to valid customers.');
    }

    const legacyOrdersWithoutProduct = orders.filter(o => o.productId && !productIds.has(o.productId));
    if (legacyOrdersWithoutProduct.length > 0) {
      console.log(`· Info: Found ${legacyOrdersWithoutProduct.length} orders referencing non-existent product IDs in their legacy productId field.`);
    }
  }

  // C. Order financial math check (Sum of order_items vs Order rollup columns)
  if (orders && orderItems) {
    let mathMismatches = 0;
    const orderItemsByOrderId = {};
    orderItems.forEach(item => {
      if (!orderItemsByOrderId[item.orderId]) {
        orderItemsByOrderId[item.orderId] = [];
      }
      orderItemsByOrderId[item.orderId].push(item);
    });

    orders.forEach(order => {
      const items = orderItemsByOrderId[order.id] || [];
      const sumExcise = items.reduce((acc, item) => acc + Number(item.totalExciseTax || 0), 0);
      const sumLocal = items.reduce((acc, item) => acc + Number(item.totalLocalTax || 0), 0);
      const sumTax = items.reduce((acc, item) => acc + Number(item.totalTax || 0), 0);

      const diffExcise = Math.abs(Number(order.totalExciseTax || 0) - sumExcise);
      const diffLocal = Math.abs(Number(order.totalLocalTax || 0) - sumLocal);
      const diffTax = Math.abs(Number(order.totalTax || 0) - sumTax);

      // Allow very tiny rounding error <= 0.02
      if (diffExcise > 0.02 || diffLocal > 0.02 || diffTax > 0.02) {
        mathMismatches++;
        console.log(`⚠ Rollup mismatch on Order ${order.id}:`);
        console.log(`   - totalExciseTax: DB Rollup = ${order.totalExciseTax}, Sum of Items = ${sumExcise.toFixed(2)} (diff: ${diffExcise.toFixed(2)})`);
        console.log(`   - totalLocalTax:  DB Rollup = ${order.totalLocalTax}, Sum of Items = ${sumLocal.toFixed(2)} (diff: ${diffLocal.toFixed(2)})`);
        console.log(`   - totalTax:       DB Rollup = ${order.totalTax}, Sum of Items = ${sumTax.toFixed(2)} (diff: ${diffTax.toFixed(2)})`);
      }
    });

    if (mathMismatches > 0) {
      console.log(`⚠ Total order rollup mismatches: ${mathMismatches}`);
      issuesFound += mathMismatches;
    } else {
      console.log('✓ All order rollups match the sum of their order_items exactly.');
    }
  }

  // D. PM Project Tasks orphan check
  if (projectTasks) {
    const orphanedTasks = projectTasks.filter(t => !projectIds.has(t.projectId));
    if (orphanedTasks.length > 0) {
      console.log(`⚠ Found ${orphanedTasks.length} project_tasks without a matching project!`);
      orphanedTasks.forEach(t => {
        console.log(`   - Task ID: ${t.id}, Title: "${t.title}", Project ID: ${t.projectId}`);
      });
      issuesFound += orphanedTasks.length;
    } else {
      console.log('✓ No orphaned project_tasks found.');
    }
  }

  // E. PM Project Products orphan check
  if (projectProducts) {
    const orphanedProjProds = projectProducts.filter(pp => !projectIds.has(pp.projectId));
    if (orphanedProjProds.length > 0) {
      console.log(`⚠ Found ${orphanedProjProds.length} project_products without a matching project!`);
      orphanedProjProds.forEach(pp => {
        console.log(`   - ID: ${pp.id}, Project ID: ${pp.projectId}, Product ID: ${pp.productId}`);
      });
      issuesFound += orphanedProjProds.length;
    } else {
      console.log('✓ No orphaned project_products found.');
    }

    const projProdsWithoutProduct = projectProducts.filter(pp => pp.productId && !productIds.has(pp.productId));
    if (projProdsWithoutProduct.length > 0) {
      console.log(`⚠ Found ${projProdsWithoutProduct.length} project_products referencing non-existent product IDs!`);
      projProdsWithoutProduct.forEach(pp => {
        console.log(`   - ID: ${pp.id}, Project ID: ${pp.projectId}, Invalid Product ID: ${pp.productId}`);
      });
      issuesFound += projProdsWithoutProduct.length;
    } else {
      console.log('✓ All project_products point to valid products.');
    }
  }

  // F. Excise Registrations orphan check
  if (registrations) {
    const regsWithoutProduct = registrations.filter(r => r.productId && !productIds.has(r.productId));
    if (regsWithoutProduct.length > 0) {
      console.log(`⚠ Found ${regsWithoutProduct.length} excise_registrations referencing non-existent product IDs!`);
      regsWithoutProduct.forEach(r => {
        console.log(`   - Reg ID: ${r.id}, Product ID: ${r.productId}, Product FG: ${r.fgCode}, Customer ID: ${r.customerId}`);
      });
      issuesFound += regsWithoutProduct.length;
    } else {
      console.log('✓ All excise_registrations point to valid products.');
    }

    const regsWithoutCustomer = registrations.filter(r => r.customerId && !customerIds.has(r.customerId));
    if (regsWithoutCustomer.length > 0) {
      console.log(`⚠ Found ${regsWithoutCustomer.length} excise_registrations referencing non-existent customer IDs!`);
      regsWithoutCustomer.forEach(r => {
        console.log(`   - Reg ID: ${r.id}, Customer ID: ${r.customerId}, Customer Name: ${r.customerName}`);
      });
      issuesFound += regsWithoutCustomer.length;
    } else {
      console.log('✓ All excise_registrations point to valid customers.');
    }
  }

  // 4. Summarize Diagnostic Results
  console.log('\n------------------------------------------------------------');
  console.log('                     DIAGNOSTIC SUMMARY                     ');
  console.log('------------------------------------------------------------');
  if (issuesFound === 0) {
    console.log('✓ DATABASE IS HEALTHY: No inconsistencies, orphans, or rollup mismatches detected.');
  } else {
    console.log(`⚠ DATABASE HAS ISSUES: Found ${issuesFound} discrepancy/discrepancies that may need correction.`);
  }
  console.log('============================================================\n');
}

runDiagnostics().catch(err => {
  console.error('✗ Diagnostic execution error:', err);
});
