// ── ทะเบียน "ใครอ้างถึงระเบียนหลักบ้าง" — ใช้ก่อนลบทุกครั้ง ──────────────────
//
// 🐞 **ที่มา (ตรวจระบบ 2026-08-16):** ด่านก่อนลบเขียนลิสต์ตารางด้วยมือในตัว route
// แล้วตกหล่นทุกครั้งที่มีตารางใหม่ — ลูกค้าตรวจ 4 จาก 25 · **สินค้าตรวจ 3 จาก 15**
// FK หลายตัวเป็น `ON DELETE SET NULL` ⇒ ฐานข้อมูล **ไม่ได้กัน** ให้ มันแค่ลบสายเชื่อม
// ทิ้งเงียบ ๆ ⇒ เอกสารที่อ้างของนั้นเสียสายเชื่อมถาวร
//
// ⇒ ประกาศไว้ที่เดียวต่อ entity แล้วให้ `npm run check:refs` เทียบกับฐานจริงว่าไม่มี
// ตารางตกหล่น
//
// ⚠️ **ไฟล์นี้ห้าม import อะไรที่ผูกกับ runtime ของ Next** (`@/…`) — `scripts/check-reference-tables.mjs`
// import มันด้วย node เปล่า ๆ เพื่อเทียบทะเบียนกับสคีมาจริง · ตัวกวาดประวัติราคาที่ต้อง
// ใช้ supabase จึงอยู่ที่ lib/master/priceHistory.js แทน

const MAX_SAMPLES = 5;

/**
 * ทะเบียนต่อ entity — คีย์ = ชื่อคอลัมน์ที่ใช้อ้าง (`customerId` / `productId`)
 *
 * `label`  ชื่อที่ขึ้นในข้อความ "ลบไม่ได้เพราะ…" — ต้องเป็นคำที่ผู้ใช้เห็นบนเมนู
 * `sample` คอลัมน์ที่หยิบมาโชว์เป็นตัวอย่างให้ตามไปดูถูกใบ (null = นับอย่างเดียว)
 */
export const REFERENCE_REGISTRY = {
  customer: {
    column: 'customerId',
    entityLabel: 'ลูกค้าราย',
    tables: [
      { table: 'projects', label: 'โครงการ', sample: 'code' },
      { table: 'orders', label: 'ออเดอร์', sample: 'id' },
      { table: 'excise_registrations', label: 'การขึ้นทะเบียนสรรพสามิต', sample: null },
      { table: 'products', label: 'สินค้า', sample: 'fgCode' },
      { table: 'sales_deals', label: 'ดีล', sample: 'code' },
      { table: 'sales_leads', label: 'ลีด', sample: null },
      { table: 'quotations', label: 'ใบเสนอราคา', sample: 'quoteNumber' },
      { table: 'sales_orders', label: 'ใบสั่งขาย', sample: 'orderNumber' },
      /* 🐞 **ตกทะเบียนมาตั้งแต่ระบบสัญญาขึ้น** (พบ 2026-08-25 ตอนเอา check:refs เข้า CI) —
         ด่านนี้มีอยู่แล้วแต่ไม่เคยถูกรันใน CI จึงไม่มีใครเห็นว่ามันแดง
         ผลถ้าไม่มีบรรทัดนี้: ลบลูกค้าที่ยังมีสัญญาอยู่ได้ แล้วสัญญาเสียสายเชื่อมเงียบ ๆ */
      { table: 'sales_contracts', label: 'สัญญา', sample: 'contractNo' },
      { table: 'dept_requests', label: 'คำร้อง', sample: 'docNo' },
      { table: 'costing_requests', label: 'ใบขอราคาผลิต', sample: 'docNo' },
      { table: 'scents', label: 'กลิ่นในทะเบียน', sample: 'code' },
      { table: 'formulas', label: 'สูตรในทะเบียน', sample: 'code' },
      { table: 'material_prices', label: 'ราคาวัสดุ', sample: null },
      { table: 'service_sites', label: 'ไซต์บริการ', sample: 'code' },
      { table: 'shipment_prep', label: 'งานเตรียมจัดส่ง', sample: null },
      { table: 'sales_deal_forecast_lines', label: 'บรรทัดพยากรณ์ของดีล', sample: null },
      { table: 'sahamit_pos', label: 'PO สหมิตร', sample: 'poNumber' },
      { table: 'sahamit_po_lines', label: 'บรรทัด PO สหมิตร', sample: null },
      { table: 'sahamit_po_coverage', label: 'ความครอบคลุม PO สหมิตร', sample: null },
      { table: 'sahamit_forecast_rounds', label: 'รอบพยากรณ์สหมิตร', sample: null },
      { table: 'sahamit_forecast_lines', label: 'บรรทัดพยากรณ์สหมิตร', sample: null },
      { table: 'sahamit_fc_flags', label: 'ธงพยากรณ์สหมิตร', sample: null },
      { table: 'sahamit_fc_locks', label: 'การล็อกพยากรณ์สหมิตร', sample: null },
      { table: 'sahamit_fc_pred_ack', label: 'การรับทราบพยากรณ์สหมิตร', sample: null },
      { table: 'sahamit_material_tracking', label: 'การติดตามวัสดุสหมิตร', sample: null },
    ],
    ignored: {},
  },

  product: {
    column: 'productId',
    entityLabel: 'สินค้า',
    tables: [
      // เดิมด่านตรวจแค่สามตัวแรกนี้ — ที่เหลือคือที่ตกหล่น
      { table: 'project_products', label: 'โครงการ', sample: 'projectId' },
      { table: 'order_items', label: 'ออเดอร์', sample: 'orderId' },
      { table: 'excise_registrations', label: 'การขึ้นทะเบียนสรรพสามิต', sample: null },
      { table: 'quotation_lines', label: 'บรรทัดใบเสนอราคา', sample: null },
      { table: 'sales_order_lines', label: 'บรรทัดใบสั่งขาย', sample: null },
      { table: 'dept_requests', label: 'คำร้อง', sample: 'docNo' },
      { table: 'costing_request_items', label: 'รายการในใบขอราคาผลิต', sample: null },
      { table: 'production_jobs', label: 'คิวงานผลิต', sample: 'code' },
      { table: 'service_assets', label: 'อุปกรณ์ที่ไซต์บริการ', sample: null },
      { table: 'service_visit_items', label: 'รายการในใบเข้าบริการ', sample: null },
      { table: 'shipment_prep_lines', label: 'บรรทัดงานเตรียมจัดส่ง', sample: null },
      { table: 'sahamit_forecast_lines', label: 'บรรทัดพยากรณ์สหมิตร', sample: null },
      { table: 'sahamit_po_lines', label: 'บรรทัด PO สหมิตร', sample: null },
      { table: 'orders', label: 'ใบยื่นภาษี', sample: 'id' },
    ],
    ignored: {
      /* ⚠️ **ห้ามเอามาบล็อกการลบ** — เป็นสมุดประวัติ *ของตัวสินค้าเอง* ไม่ใช่ของที่อื่น
         อ้างถึง · แถวแรกถูกเขียนตั้งแต่ตอน **สร้าง** สินค้า (`changeType: 'create'`)
         ⇒ ถ้านับเป็นการอ้างอิง จะลบสินค้าไม่ได้เลยสักตัวตั้งแต่วินาทีแรก และทำลาย
         กติกา "ลบร่างที่ไม่เคยอนุมัติ = เลขกลับมาใช้ได้" (mig 0248)
         ⚠️ ตารางนี้ไม่มี FK และ `productId` เป็น NOT NULL ⇒ ลบสินค้าแล้วแถวกำพร้าจริง ๆ
         (ไม่ได้ถูก null) — จึงต้องกวาดทิ้งพร้อมกัน ดู purgeProductPriceHistory */
      product_price_history: 'สมุดประวัติราคาของตัวสินค้าเอง — มีตั้งแต่ตอนสร้าง กวาดทิ้งพร้อมสินค้า',
    },
  },
};

/** ชื่อตารางทั้งหมดที่ประกาศไว้ของ entity นั้น — ให้สคริปต์ตรวจใช้ */
export const referenceTableNames = (entity) => REFERENCE_REGISTRY[entity].tables.map((t) => t.table);

/**
 * หาว่าระเบียนนี้ยังถูกอ้างที่ไหนบ้าง
 *
 * ⚠️ ยิงทุกตารางพร้อมกันด้วย `head: true` (นับอย่างเดียว) ยกเว้นตารางที่มี `sample`
 * ซึ่งดึงมาไม่กี่แถวเพื่อบอกผู้ใช้ว่าไปจัดการที่ใบไหน
 *
 * @returns {Promise<{refs: string[], error: Error|null}>}
 */
export async function findEntityReferences(supabase, entity, id) {
  const spec = REFERENCE_REGISTRY[entity];
  if (!spec) throw new Error(`findEntityReferences: ไม่รู้จัก entity "${entity}"`);

  const results = await Promise.all(spec.tables.map(async (entry) => {
    const query = entry.sample
      ? supabase.from(entry.table).select(entry.sample, { count: 'exact' }).eq(spec.column, id).limit(MAX_SAMPLES)
      : supabase.from(entry.table).select('id', { count: 'exact', head: true }).eq(spec.column, id);
    const { data, count, error } = await query;
    return { entry, count: count || 0, rows: data || [], error };
  }));

  const failed = results.find((r) => r.error);
  if (failed) {
    // อ่านไม่ได้ = **ยังไม่รู้ว่ามีอะไรอ้างอยู่** — ห้ามเดินต่อไปลบ
    return { refs: [], error: new Error(`ตรวจรายการที่อ้างถึงไม่สำเร็จ (${failed.entry.table}): ${failed.error.message}`) };
  }

  const refs = results.filter((r) => r.count > 0).map(({ entry, count, rows }) => {
    const samples = entry.sample ? rows.map((r) => r[entry.sample]).filter(Boolean) : [];
    const tail = samples.length ? ` (${samples.join(', ')}${count > samples.length ? ' …' : ''})` : '';
    return `${count} ${entry.label}${tail}`;
  });
  return { refs, error: null };
}

// ── ชื่อเดิม (คงไว้ให้ผู้เรียกเก่า) ────────────────────────────────────────
export const CUSTOMER_REFERENCE_TABLES = REFERENCE_REGISTRY.customer.tables;
export const CUSTOMER_REFERENCE_TABLE_NAMES = referenceTableNames('customer');
export const CUSTOMER_REFERENCE_IGNORED = REFERENCE_REGISTRY.customer.ignored;
export const findCustomerReferences = (supabase, customerId) => findEntityReferences(supabase, 'customer', customerId);
