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

async function repair() {
  console.log('============================================================');
  console.log('             DATABASE LINKAGE REPAIR & HEALING              ');
  console.log('============================================================\n');

  // Load database tables
  const { data: customers } = await supabase.from('customers').select('*');
  const { data: products } = await supabase.from('products').select('*');
  const { data: orders } = await supabase.from('orders').select('*');
  const { data: orderItems } = await supabase.from('order_items').select('*');

  const customerMap = new Map(customers?.map(c => [c.id, c]) || []);
  const productMap = new Map(products?.map(p => [p.id, p]) || []);
  const orderItemsByOrderId = {};
  
  orderItems?.forEach(item => {
    if (!orderItemsByOrderId[item.orderId]) {
      orderItemsByOrderId[item.orderId] = [];
    }
    orderItemsByOrderId[item.orderId].push(item);
  });

  // 1. Repair: Missing order_items for orders
  console.log('1. Repairing missing order_items...');
  let repairedItemsCount = 0;
  const itemsToInsert = [];

  for (const order of orders || []) {
    const items = orderItemsByOrderId[order.id] || [];
    if (items.length === 0 && order.productId) {
      console.log(`· Order [${order.id}] has legacy productId [${order.productId}] but no order_items.`);
      
      const newItem = {
        id: `OIT-${order.id}-1`,
        orderId: order.id,
        productId: order.productId,
        quantity: order.quantity || 1,
        totalExciseTax: order.totalExciseTax || 0,
        totalLocalTax: order.totalLocalTax || 0,
        totalTax: order.totalTax || 0
      };
      itemsToInsert.push(newItem);
    }
  }

  if (itemsToInsert.length > 0) {
    const { error: insertErr } = await supabase.from('order_items').insert(itemsToInsert);
    if (insertErr) {
      console.error(`✗ Error inserting order_items: ${insertErr.message}`);
    } else {
      console.log(`✓ Successfully created ${itemsToInsert.length} missing order_items!`);
      repairedItemsCount = itemsToInsert.length;
    }
  } else {
    console.log('✓ All orders have their corresponding order_items.');
  }
  console.log();

  // 2. Repair: Missing customer linkages on orders
  console.log('2. Repairing missing customer linkages on orders...');
  let repairedOrdersCount = 0;

  for (const order of orders || []) {
    // We want to fill customerId, customerName, and customerTaxId if they are missing
    if (!order.customerId && order.productId) {
      const product = productMap.get(order.productId);
      if (product) {
        const updates = {};
        
        // Use customerId from product if available
        if (product.customerId) {
          updates.customerId = product.customerId;
          const customer = customerMap.get(product.customerId);
          if (customer) {
            updates.customerName = customer.name;
            updates.customerTaxId = customer.taxId;
          }
        } else {
          // If no customerId, copy the product's snapshot names if they exist
          if (product.customerName) updates.customerName = product.customerName;
          if (product.taxId) updates.customerTaxId = product.taxId;
        }

        if (Object.keys(updates).length > 0) {
          console.log(`· Repairing order [${order.id}] customer info using product [${product.id}] metadata:`);
          console.log(`  Updates:`, JSON.stringify(updates));
          
          const { error: updateErr } = await supabase
            .from('orders')
            .update(updates)
            .eq('id', order.id);
          
          if (updateErr) {
            console.error(`  ✗ Error updating order [${order.id}]: ${updateErr.message}`);
          } else {
            console.log(`  ✓ Repaired successfully.`);
            repairedOrdersCount++;
          }
        }
      }
    }
  }

  console.log(`\n✓ Repair process finished.`);
  console.log(`  - Created order_items: ${repairedItemsCount}`);
  console.log(`  - Repaired order customer links: ${repairedOrdersCount}`);
  console.log('============================================================');
}

repair().catch(err => {
  console.error('Error repairing linkages:', err);
});
