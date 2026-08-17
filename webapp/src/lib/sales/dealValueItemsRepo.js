/* ── ฝั่ง server ของมูลค่าคาดการณ์รายหมวด (mig 0264) ─────────────────────────
 *
 * แยกจาก lib/sales/dealValueItems.js เพราะไฟล์นั้นเป็นสูตรล้วน ๆ ที่ฟอร์มฝั่ง
 * เบราว์เซอร์ import ด้วย — ไฟล์นี้แตะฐาน (service-role) จึงห้ามหลุดไปฝั่ง client
 *
 * ⭐ ทางเขียนทางเดียวของยอดดีลตอนนี้: `saveDealValueItems()` คืน { projectValue,
 * categoryCode } ให้ผู้เรียกเขียนลงแถวดีล — ห้ามคิดผลรวมเองในแต่ละ route
 */
import { genId } from '@/lib/id';
import { activeProductTypeError } from '@/lib/master/productTypes';
import { normalizeDealValueItems, primaryCategoryCode } from '@/lib/sales/dealValueItems';

export const DEAL_VALUE_ITEMS_TABLE = 'sales_deal_value_items';

// รายการของดีลใบเดียว เรียงตามลำดับที่ผู้ใช้จัดไว้ (แถวแรก = หมวดของดีล)
export async function loadDealValueItems(supabase, dealId) {
  const { data, error } = await supabase
    .from(DEAL_VALUE_ITEMS_TABLE)
    .select('*')
    .eq('dealId', dealId)
    .order('seq', { ascending: true })
    .limit(200);
  if (error) throw error;
  return data || [];
}

/* ตรวจ + คิดยอด **ก่อน** เขียนอะไรลงฐาน
 * คืน { error } เมื่อผิด · { items, projectValue, categoryCode } เมื่อผ่าน
 * ⚠️ ตรวจหมวดทีละรหัสที่ไม่ซ้ำ (ดีล 30 แถวที่เป็นหมวดเดียวกันไม่ควรยิงฐาน 30 ครั้ง) */
export async function prepareDealValueItems(raw) {
  const { items, total, error } = normalizeDealValueItems(raw);
  if (error) return { error };
  for (const code of [...new Set(items.map((item) => item.categoryCode))]) {
    const categoryError = await activeProductTypeError(code);
    if (categoryError) return { error: categoryError };
  }
  return { items, projectValue: total, categoryCode: primaryCategoryCode(items) };
}

/* เขียนทับรายการทั้งชุดของดีล (ลบของเดิม → ใส่ชุดใหม่)
 *
 * ⚠️ **replace ทั้งชุด ไม่ใช่ upsert รายแถว** — ฟอร์มส่งรายการที่ตาเห็นมาทั้งก้อน
 * และลำดับแถวมีความหมาย (แถวแรก = หมวดของดีล) การ merge ทีละแถวจะทำให้แถวที่ผู้ใช้
 * ลบไปแล้วค้างอยู่ในฐานโดยไม่มีใครเห็น
 *
 * ⚠️ ไม่มีทรานแซกชันข้ามคำสั่งใน PostgREST — ลบสำเร็จแต่ใส่ไม่สำเร็จ = ดีลเหลือ 0 แถว
 * ทั้งที่ยอดรวมในแถวดีลถูกเขียนไปแล้ว ⇒ ผู้เรียกต้องรายงาน error ให้ผู้ใช้กดใหม่
 * (กดใหม่ได้ผลเหมือนเดิมเสมอ เพราะเป็นการเขียนทับทั้งชุด)
 */
export async function saveDealValueItems(supabase, dealId, items) {
  const { error: dropError } = await supabase.from(DEAL_VALUE_ITEMS_TABLE).delete().eq('dealId', dealId);
  if (dropError) return { error: dropError.message };
  if (!items.length) return { error: null };
  const now = new Date().toISOString();
  const { error: insertError } = await supabase.from(DEAL_VALUE_ITEMS_TABLE).insert(
    items.map((item) => ({
      id: genId('DVI'),
      dealId,
      seq: item.seq,
      categoryCode: item.categoryCode,
      qty: item.qty,
      unit: item.unit,
      unitPrice: item.unitPrice,
      amount: item.amount,
      note: item.note,
      createdAt: now,
      updatedAt: now,
    })),
  );
  return { error: insertError?.message || null };
}
