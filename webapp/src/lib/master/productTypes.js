// ── Master Data: product_types (category taxonomy) ────────────────────
// Shared-core access layer for product categories. Used by the product form
// (category dropdown) and later by PM templates (categoryOnly / categoryExclude
// steps keyed on 'XX-YYY', e.g. '01-002' = excise-taxable perfume).
//
// Server-only: uses the service-role admin client.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { categoryLabel } from '@/lib/master/categoryOf';
export { categoryOf, isExciseCategory, categoryFlags } from '@/lib/master/categoryOf';

export async function listProductTypes() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('product_types')
    .select('*')
    .order('mainCategoryCode', { ascending: true })
    .order('typeCode', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getProductTypeByCode(categoryCode) {
  const [mainCategoryCode = '', typeCode = ''] = String(categoryCode || '').split('-');
  if (!/^\d{2}$/.test(mainCategoryCode) || !/^\d{3}$/.test(typeCode)) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('product_types')
    .select('*')
    .eq('mainCategoryCode', mainCategoryCode)
    .eq('typeCode', typeCode)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// ธงกำกับดูแลของหมวด (mig 0131) ฉบับ server: อ่านแถวหมวดจาก DB ตรง ๆ —
// ใช้ตอน gen ไทม์ไลน์/คำนวณภาษีฝั่ง API. หมวดไม่รู้จัก → ธง false ทุกตัว
// (พฤติกรรมเดียวกับ categoryFlags ฝั่ง client).
export async function categoryFlagsOf(categoryCode) {
  const row = await getProductTypeByCode(categoryCode);
  return { isExcise: !!row?.isExcise, requiresFdaNotice: !!row?.requiresFdaNotice };
}

/** ป้ายหมวด "รหัส ชื่อ" จากแถวหมวด (มติเจ้าของ 18/11/2026 รหัส + ชื่อเสมอ) — ไม่มีแถว/ไม่มีชื่อ = รหัสดิบ */
export function productTypeRowLabel(categoryCode, row) {
  return categoryLabel(categoryCode, row ? [row] : []);
}

/** ป้ายหมวด "รหัส ชื่อ" ฉบับ server สำหรับข้อความ/audit — อ่านทะเบียนเอง · ล้มเหลว = รหัสดิบ (ข้อความต้องออกได้เสมอ) */
export async function productTypeLabel(categoryCode) {
  if (!categoryCode) return '';
  try {
    return productTypeRowLabel(categoryCode, await getProductTypeByCode(categoryCode));
  } catch {
    return String(categoryCode);
  }
}

export async function activeProductTypeError(categoryCode) {
  if (!categoryCode) return null;
  const row = await getProductTypeByCode(categoryCode);
  if (!row) return `ไม่พบหมวดสินค้า ${categoryCode} ในฐานข้อมูล`;
  if (row.isActive === false) return `หมวดสินค้า ${productTypeRowLabel(categoryCode, row)} ถูกพักใช้งานแล้ว`;
  return null;
}

