// ── ทะเบียน "ใครอ้างถึงลูกค้าบ้าง" — ใช้ก่อนลบลูกค้าทุกครั้ง ──────────────
//
// 🐞 **พบตอนตรวจระบบ 2026-08-16:** ด่านก่อนลบลูกค้าตรวจแค่ 4 ตาราง
// (projects · orders · excise_registrations · products) ทั้งที่บนฐานจริงมี **25 ตาราง**
// ที่มีคอลัมน์ `customerId` และ FK ของหลายตัวเป็น `ON DELETE SET NULL`
//
// ⇒ ลูกค้าที่มีลีด/ดีล/ใบเสนอราคา/ใบสั่งขาย แต่ยังไม่มีโครงการ ไม่มีสินค้า ไม่มีออเดอร์
// (= ลูกค้าต้นทางท่อ ซึ่งเป็นสถานะปกติ) จะ **ลบผ่านด่าน** แล้ว `customerId` บนเอกสาร
// เหล่านั้นกลายเป็น null **เงียบ ๆ ไม่มี error ไม่มี log** · ชื่อลูกค้าบนตัวเอกสารรอด
// (ใบเก็บ `customerName` เป็น snapshot) แต่สายเชื่อมหายถาวร กู้ไม่ได้เพราะค่าเดิม
// ถูกเขียนทับด้วย null
//
// ⭐ **ทำไมเป็นทะเบียนกลาง ไม่ใช่ลิสต์ในตัว route:** ลิสต์แบบเขียนมือตกหล่นทุกครั้งที่
// เพิ่มตารางใหม่ — เกิดมาแล้วจริง: คอมเมนต์ในเส้นลบเขียนเองว่า `products` เพิ่งถูกเพิ่ม
// เข้าด่านเมื่อ 2026-08-13 หลังพบว่าสินค้ากลายเป็นกำพร้าเงียบ ๆ
// ⇒ ที่นี่คือที่เดียว และมี `npm run check:refs` คอยเทียบกับฐานจริงว่าไม่มีตารางตกหล่น

/**
 * ทุกตารางที่ถือ `customerId` — เรียงตามลำดับที่ผู้ใช้เข้าใจ (ของหลักก่อน ของลูกทีหลัง)
 *
 * `label`  ชื่อที่ขึ้นในข้อความ "ลบไม่ได้เพราะ…" — ต้องเป็นคำที่ผู้ใช้เห็นบนเมนู
 * `sample` คอลัมน์ที่หยิบมาโชว์เป็นตัวอย่างให้ตามไปดูถูกใบ (null = นับอย่างเดียว)
 */
export const CUSTOMER_REFERENCE_TABLES = [
  { table: 'projects', label: 'โครงการ', sample: 'code' },
  { table: 'orders', label: 'ออเดอร์', sample: 'id' },
  { table: 'excise_registrations', label: 'การขึ้นทะเบียนสรรพสามิต', sample: null },
  { table: 'products', label: 'สินค้า', sample: 'fgCode' },
  { table: 'sales_deals', label: 'ดีล', sample: 'code' },
  { table: 'sales_leads', label: 'ลีด', sample: null },
  { table: 'quotations', label: 'ใบเสนอราคา', sample: 'quoteNumber' },
  { table: 'sales_orders', label: 'ใบสั่งขาย', sample: 'orderNumber' },
  { table: 'dept_requests', label: 'คำร้อง', sample: 'docNo' },
  { table: 'costing_requests', label: 'ใบขอราคาผลิต', sample: 'docNo' },
  { table: 'scents', label: 'กลิ่นในทะเบียน', sample: 'code' },
  { table: 'formulas', label: 'สูตรในทะเบียน', sample: 'code' },
  { table: 'material_prices', label: 'ราคาวัสดุ', sample: null },
  { table: 'service_sites', label: 'ไซต์บริการ', sample: 'code' },
  { table: 'shipment_prep', label: 'งานเตรียมจัดส่ง', sample: null },
  { table: 'sales_deal_forecast_lines', label: 'บรรทัดพยากรณ์ของดีล', sample: null },
  // สหมิตร — ท่อแยกของตัวเอง แต่ผูกกับลูกค้า AR-109 เหมือนกัน
  { table: 'sahamit_pos', label: 'PO สหมิตร', sample: 'poNumber' },
  { table: 'sahamit_po_lines', label: 'บรรทัด PO สหมิตร', sample: null },
  { table: 'sahamit_po_coverage', label: 'ความครอบคลุม PO สหมิตร', sample: null },
  { table: 'sahamit_forecast_rounds', label: 'รอบพยากรณ์สหมิตร', sample: null },
  { table: 'sahamit_forecast_lines', label: 'บรรทัดพยากรณ์สหมิตร', sample: null },
  { table: 'sahamit_fc_flags', label: 'ธงพยากรณ์สหมิตร', sample: null },
  { table: 'sahamit_fc_locks', label: 'การล็อกพยากรณ์สหมิตร', sample: null },
  { table: 'sahamit_fc_pred_ack', label: 'การรับทราบพยากรณ์สหมิตร', sample: null },
  { table: 'sahamit_material_tracking', label: 'การติดตามวัสดุสหมิตร', sample: null },
];

/** ชื่อตารางทั้งหมดในทะเบียน — ให้สคริปต์ตรวจใช้ */
export const CUSTOMER_REFERENCE_TABLE_NAMES = CUSTOMER_REFERENCE_TABLES.map((t) => t.table);

/* ตารางที่มี `customerId` แต่ **จงใจไม่กันการลบ** — ต้องเขียนเหตุผลกำกับทุกบรรทัด
   (สคริปต์ check:refs อ่านลิสต์นี้เป็นข้อยกเว้นที่ประกาศไว้แล้ว) */
export const CUSTOMER_REFERENCE_IGNORED = {
  // ยังไม่มี — ถ้าจะเพิ่ม ให้ใส่ 'ชื่อตาราง': 'เหตุผลที่ไม่ต้องกัน'
};

const MAX_SAMPLES = 5;

/**
 * หาว่าลูกค้ารายนี้ยังถูกอ้างที่ไหนบ้าง
 *
 * ⚠️ ยิงทุกตารางพร้อมกันด้วย `head: true` (นับอย่างเดียว ไม่ดึงแถว) ยกเว้นตารางที่มี
 * `sample` ซึ่งดึงมาไม่กี่แถวเพื่อเอาเลขที่เอกสารไปบอกผู้ใช้ว่าไปจัดการที่ใบไหน
 *
 * @returns {Promise<{refs: string[], error: Error|null}>} refs = ข้อความพร้อมแสดง
 */
export async function findCustomerReferences(supabase, customerId) {
  const results = await Promise.all(CUSTOMER_REFERENCE_TABLES.map(async (entry) => {
    const query = entry.sample
      ? supabase.from(entry.table).select(entry.sample, { count: 'exact' }).eq('customerId', customerId).limit(MAX_SAMPLES)
      : supabase.from(entry.table).select('id', { count: 'exact', head: true }).eq('customerId', customerId);
    const { data, count, error } = await query;
    return { entry, count: count || 0, rows: data || [], error };
  }));

  const failed = results.find((r) => r.error);
  if (failed) {
    // อ่านไม่ได้ = **ยังไม่รู้ว่ามีอะไรอ้างอยู่** — ห้ามเดินต่อไปลบ (บทเรียนเดียวกับ
    // การนับดีลที่เหลือใน projectsRepo: นับพลาดแล้วเงียบ = ชวนผู้ใช้ลบของที่ยังมีคนใช้)
    return { refs: [], error: new Error(`ตรวจรายการที่อ้างถึงลูกค้าไม่สำเร็จ (${failed.entry.table}): ${failed.error.message}`) };
  }

  const refs = results.filter((r) => r.count > 0).map(({ entry, count, rows }) => {
    const samples = entry.sample ? rows.map((r) => r[entry.sample]).filter(Boolean) : [];
    const tail = samples.length ? ` (${samples.join(', ')}${count > samples.length ? ' …' : ''})` : '';
    return `${count} ${entry.label}${tail}`;
  });
  return { refs, error: null };
}
