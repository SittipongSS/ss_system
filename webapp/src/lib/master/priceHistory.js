import { getSupabaseAdmin } from '../supabaseAdmin';

const PRICE_FIELDS = [
  'costPrice',
  'retailPriceIncVat',
  'retailPriceExVat',
  'exciseTax',
  'localTax',
];

const same = (a, b) => {
  if ((a == null || a === '') && (b == null || b === '')) return true;
  return Number(a) === Number(b);
};

function priceSnapshot(record, suffix) {
  const out = {};
  for (const field of PRICE_FIELDS) out[`${field}${suffix}`] = record?.[field] ?? null;
  return out;
}

export function hasPriceChange(before, after) {
  if (!before || !after) return false;
  return PRICE_FIELDS.some((field) => !same(before[field], after[field]));
}

export async function recordProductPriceHistory({
  user,
  productId,
  before = null,
  after = null,
  changeType = 'update',
  source = 'products-api',
  metadata = {},
}) {
  try {
    if (!productId || !after) return;
    if (changeType === 'update' && !hasPriceChange(before, after)) return;

    const supabase = getSupabaseAdmin();
    await supabase.from('product_price_history').insert({
      productId: String(productId),
      changedBy: user?.id != null ? String(user.id) : null,
      changedByName: user?.name ?? null,
      changeType,
      ...priceSnapshot(before, 'Before'),
      ...priceSnapshot(after, 'After'),
      source,
      metadata,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[price-history] record failed', productId, e?.message || e);
  }
}

/* กวาดสมุดประวัติราคาทิ้งพร้อมสินค้า — ตารางนี้**ไม่มี FK** และ `productId` เป็น NOT NULL
   ⇒ ลบสินค้าแล้วแถวกำพร้าจริง ๆ ไม่ได้ถูก null และไม่มีใครกวาดให้
   (รูปเดียวกับ purgeAttachments / purgeUpdates ที่เส้นลบเรียกอยู่แล้ว)
   ⚠️ ไม่นับเป็น "การอ้างอิงที่บล็อกการลบ" — ดูเหตุผลที่ REFERENCE_REGISTRY.product.ignored */
export async function purgeProductPriceHistory(productId) {
  if (!productId) return;
  await getSupabaseAdmin().from('product_price_history').delete().eq('productId', String(productId));
}
