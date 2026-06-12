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

async function checkLinkages() {
  console.log('============================================================');
  console.log('         DATABASE LINKAGE & RELATIONSHIP ANALYSIS           ');
  console.log('============================================================\n');

  // Load all tables
  const { data: customers } = await supabase.from('customers').select('*');
  const { data: products } = await supabase.from('products').select('*');
  const { data: orders } = await supabase.from('orders').select('*');
  const { data: orderItems } = await supabase.from('order_items').select('*');
  const { data: productTypes } = await supabase.from('product_types').select('*');
  const { data: projects } = await supabase.from('projects').select('*');
  const { data: projectTasks } = await supabase.from('project_tasks').select('*');
  const { data: projectProducts } = await supabase.from('project_products').select('*');
  const { data: registrations } = await supabase.from('excise_registrations').select('*');

  const customerMap = new Map(customers?.map(c => [c.id, c]) || []);
  const productMap = new Map(products?.map(p => [p.id, p]) || []);
  const orderMap = new Map(orders?.map(o => [o.id, o]) || []);
  const projectMap = new Map(projects?.map(p => [p.id, p]) || []);
  const regMap = new Map(registrations?.map(r => [r.id, r]) || []);

  console.log('------------------------------------------------------------');
  console.log('1. PRODUCTS -> CUSTOMERS (สินค้า เชื่อมโยง ลูกค้า)');
  console.log('------------------------------------------------------------');
  if (products) {
    products.forEach(p => {
      const linkedCust = p.customerId ? customerMap.get(p.customerId) : null;
      console.log(`Product: [${p.id}] FG: ${p.fgCode} | Brand: ${p.brandName || '-'}`);
      console.log(`  - customerId FK: ${p.customerId || 'NULL'}`);
      if (linkedCust) {
        console.log(`    ↳ Linked to Customer: "${linkedCust.name}" (AR Code: ${linkedCust.arCode})`);
      } else if (p.customerId) {
        console.log(`    ↳ ⚠ BROKEN LINK: Customer ID ${p.customerId} does not exist in customers!`);
      } else {
        console.log(`    ↳ Info: No Customer ID linked (unlinked master catalog product).`);
      }
      
      // Check snapshots
      console.log(`  - Snapshot customerName: ${p.customerName || 'NULL'} | taxId: ${p.taxId || 'NULL'}`);
    });
  }
  console.log();

  console.log('------------------------------------------------------------');
  console.log('2. ORDERS -> CUSTOMERS & PRODUCTS (ใบสั่งซื้อ เชื่อมโยง ลูกค้า/สินค้า)');
  console.log('------------------------------------------------------------');
  if (orders) {
    orders.forEach(o => {
      const cust = o.customerId ? customerMap.get(o.customerId) : null;
      console.log(`Order: [${o.id}] Ref: ${o.quotationRef || '-'} | Status: ${o.status}`);
      console.log(`  - customerId: ${o.customerId || 'NULL'}`);
      if (cust) {
        console.log(`    ↳ Linked to Customer: "${cust.name}"`);
      } else if (o.customerId) {
        console.log(`    ↳ ⚠ BROKEN LINK: Customer ID ${o.customerId} does not exist!`);
      } else {
        console.log(`    ↳ Info: No customerId linked (Legacy or unassigned order).`);
      }
      console.log(`  - Snapshot customerName: ${o.customerName || 'NULL'} | taxId: ${o.customerTaxId || 'NULL'}`);

      // Legacy productId field check
      if (o.productId) {
        const prod = productMap.get(o.productId);
        console.log(`  - Legacy productId: ${o.productId}`);
        if (prod) {
          console.log(`    ↳ Linked to Product: "${prod.productDescription}" (${prod.fgCode})`);
        } else {
          console.log(`    ↳ ⚠ BROKEN LINK: Product ID ${o.productId} does not exist!`);
        }
      }
    });
  }
  console.log();

  console.log('------------------------------------------------------------');
  console.log('3. ORDER ITEMS -> ORDERS & REGISTRATIONS (รายการสินค้าในสั่งซื้อ)');
  console.log('------------------------------------------------------------');
  if (orderItems) {
    orderItems.forEach(oi => {
      const order = orderMap.get(oi.orderId);
      const reg = oi.registrationId ? regMap.get(oi.registrationId) : null;
      const prod = oi.productId ? productMap.get(oi.productId) : null;

      console.log(`Order Item: [${oi.id}] in Order [${oi.orderId}] | Qty: ${oi.quantity}`);
      if (!order) {
        console.log(`  - ⚠ BROKEN LINK: Parent Order [${oi.orderId}] does not exist!`);
      }

      console.log(`  - registrationId: ${oi.registrationId || 'NULL'}`);
      if (reg) {
        console.log(`    ↳ Linked to Excise Registration: [${reg.id}] Product FG: ${reg.fgCode}`);
        const regProd = reg.productId ? productMap.get(reg.productId) : null;
        if (regProd) {
          console.log(`      ↳ Registration maps to Product: "${regProd.productDescription}" (${regProd.fgCode})`);
        }
      } else if (oi.registrationId) {
        console.log(`    ↳ ⚠ BROKEN LINK: Registration ID ${oi.registrationId} does not exist!`);
      }

      console.log(`  - productId: ${oi.productId || 'NULL'}`);
      if (prod) {
        console.log(`    ↳ Linked to Product: "${prod.productDescription}" (${prod.fgCode})`);
      } else if (oi.productId) {
        console.log(`    ↳ ⚠ BROKEN LINK: Product ID ${oi.productId} does not exist!`);
      }

      // Cross-check registration vs product alignment
      if (reg && prod) {
        if (reg.productId !== oi.productId) {
          console.log(`  - ⚠ MISMATCH: Item points to Product [${oi.productId}] but its Registration points to Product [${reg.productId}]!`);
        }
      }
      if (reg && order && order.customerId) {
        if (reg.customerId !== order.customerId) {
          console.log(`  - ⚠ MISMATCH: Parent Order has Customer [${order.customerId}] but Registration belongs to Customer [${reg.customerId}]!`);
        }
      }
    });
  }
  console.log();

  console.log('------------------------------------------------------------');
  console.log('4. PROJECTS -> CUSTOMERS & CATEGORIES (โครงการ PM)');
  console.log('------------------------------------------------------------');
  if (projects) {
    projects.forEach(pj => {
      const cust = pj.customerId ? customerMap.get(pj.customerId) : null;
      console.log(`Project: [${pj.id}] Code: ${pj.code} | Name: "${pj.name}"`);
      console.log(`  - customerId: ${pj.customerId || 'NULL'}`);
      if (cust) {
        console.log(`    ↳ Linked to Customer: "${cust.name}"`);
      } else if (pj.customerId) {
        console.log(`    ↳ ⚠ BROKEN LINK: Customer ID ${pj.customerId} does not exist!`);
      } else {
        console.log(`    ↳ Info: No customerId linked.`);
      }
      console.log(`  - Snapshot customerName: ${pj.customerName || 'NULL'}`);
      console.log(`  - Category: Main Category Code: ${pj.productMainCategory || 'NULL'} | Sub Category: ${pj.productSubCategory || 'NULL'}`);
    });
  }
  console.log();

  console.log('------------------------------------------------------------');
  console.log('5. PROJECT PRODUCTS -> PROJECTS & PRODUCTS (สินค้าในโครงการ)');
  console.log('------------------------------------------------------------');
  if (projectProducts) {
    projectProducts.forEach(pp => {
      const project = projectMap.get(pp.projectId);
      const product = pp.productId ? productMap.get(pp.productId) : null;

      console.log(`Project Product Link: [${pp.id}]`);
      console.log(`  - projectId: ${pp.projectId}`);
      if (project) {
        console.log(`    ↳ Linked to Project: "${project.name}" (${project.code})`);
      } else {
        console.log(`    ↳ ⚠ BROKEN LINK: Project ID ${pp.projectId} does not exist!`);
      }

      console.log(`  - productId: ${pp.productId || 'NULL'}`);
      if (product) {
        console.log(`    ↳ Linked to Product: "${product.productDescription}" (${product.fgCode})`);
      } else if (pp.productId) {
        console.log(`    ↳ ⚠ BROKEN LINK: Product ID ${pp.productId} does not exist!`);
      }
    });
  }
  console.log();

  console.log('------------------------------------------------------------');
  console.log('6. EXCISE REGISTRATIONS -> PRODUCTS & CUSTOMERS (ทะเบียนสรรพสามิต)');
  console.log('------------------------------------------------------------');
  if (registrations && registrations.length > 0) {
    registrations.forEach(r => {
      const prod = r.productId ? productMap.get(r.productId) : null;
      const cust = r.customerId ? customerMap.get(r.customerId) : null;

      console.log(`Registration: [${r.id}] Status: ${r.status}`);
      console.log(`  - productId: ${r.productId || 'NULL'}`);
      if (prod) {
        console.log(`    ↳ Linked to Product: "${prod.productDescription}" (${prod.fgCode})`);
      } else if (r.productId) {
        console.log(`    ↳ ⚠ BROKEN LINK: Product ID ${r.productId} does not exist!`);
      }

      console.log(`  - customerId: ${r.customerId || 'NULL'}`);
      if (cust) {
        console.log(`    ↳ Linked to Customer: "${cust.name}"`);
      } else if (r.customerId) {
        console.log(`    ↳ ⚠ BROKEN LINK: Customer ID ${r.customerId} does not exist!`);
      }
      
      console.log(`  - Snapshot Product FG: ${r.fgCode || 'NULL'} | Brand: ${r.brandName || 'NULL'}`);
      console.log(`  - Snapshot Customer Name: ${r.customerName || 'NULL'} | Tax ID: ${r.taxId || 'NULL'}`);
    });
  } else {
    console.log('No excise registrations found.');
  }
  console.log();
  console.log('============================================================');
}

checkLinkages().catch(err => {
  console.error('Error running linkages check:', err);
});
