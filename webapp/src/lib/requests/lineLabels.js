// ── ป้ายชื่อของบรรทัด — snapshot ที่ derive จากทะเบียน ไม่ใช่ค่าที่ client ส่ง ──
//
// ⭐ ย้ายมาจาก `POST /api/sa/requests` (บล็อก `isProductDev`) เพื่อให้ **ทางแก้ใบ
// ใช้ตัวเดียวกัน** — ไม่งั้นจะมีสองที่ที่ประกอบป้าย "หมวด · กลิ่น" แล้วเพี้ยนกัน
// ภายในไม่กี่เดือน ซึ่งเป็นโรคประจำของรีโปนี้ (ดูหัวไฟล์ RequestEditableFields.js)
//
// ⚠️ **ด่านกลิ่นข้ามลูกค้าอยู่ที่นี่ด้วย** (มติ 9) — มันเดินคู่กับการอ่านทะเบียน
// อยู่แล้ว · แยกออกไปเมื่อไรจะมีทางเข้าที่อ่านชื่อกลิ่นมาแปะป้ายโดยไม่ผ่านด่าน
//
// ⚠️ คืน `{ items, error }` **ไม่โยน** — ผู้เรียกตัดสินเองว่าจะเป็น 400 หรือ 500
// (POST เดิมโยนในบล็อก try ⇒ ออกเป็น 500 · ทางแก้ใบตอบ 400 ซึ่งตรงความจริงกว่า)

import { attachShares } from '@/lib/master/registrySharesAdmin';
import { scentUsableByCustomer } from '@/lib/master/registryShares';

/**
 * เติม `label` ให้บรรทัดที่ป้ายมาจากทะเบียน — รูปร่างอื่นคืนของเดิมทั้งก้อน
 *
 * @param {*} supabase  client ที่มีสิทธิ์อ่านทะเบียน
 * @param {Array} items ผลของ `normalizeLinesFor`
 * @param {{lineShape: string, customerId?: string|null}} ctx
 */
export async function resolveLineLabels(supabase, items = [], { lineShape, customerId = null } = {}) {
  /* ⭐ บรรทัดเอกสารที่ผูก FG (MSDS · Spec Sheet — mig 0428 · ศูนย์กลางเอกสารของสินค้า P2b · มติเจ้าของ 09/11/2026):
     FG ต้องมีจริง และเป็นของลูกค้าของใบ (ใบผูกดีลของลูกค้ารายเดียว — ขอ MSDS ของ FG ลูกค้าอื่นไม่ได้ · กติกาเดียวกับกลิ่นข้างล่าง)
     · ป้ายของแถว = ชื่อชนิด · รหัส FG (อ่านออกในเธรด/ประวัติโดยไม่ต้องเปิดแถว)
     ⚠️ อ่านพัง = error (ห้ามปล่อยผ่าน — ผ่านแล้วบรรทัดชี้ FG ที่ไม่มีจริง ไฟล์ของ RD ไม่มีที่ลง) */
  if (lineShape === 'document') return resolveDocumentProducts(supabase, items, { customerId });
  // บรรทัดใบวางบิลได้ป้ายครบตั้งแต่ normalize (ชื่อชนิดมาจาก vocab)
  if (lineShape !== 'product_dev') return { items, error: null };
  if (!items.length) return { items, error: null };

  const scentIds = [...new Set(items.map((i) => i.scentId))];
  const [{ data: scentRows, error: scentError }, { data: typeRows, error: typeError }] =
    await Promise.all([
      supabase.from('scents').select('id, code, name, customerId').in('id', scentIds),
      supabase.from('product_types').select('mainCategoryCode, typeCode, nameTh, nameEn'),
    ]);
  if (scentError) return { items: [], error: scentError.message };
  if (typeError) return { items: [], error: typeError.message };

  let sharedRows;
  try {
    sharedRows = await attachShares(supabase, scentRows || [], 'scent');
  } catch (e) {
    return { items: [], error: e.message };
  }
  const scentById = new Map(sharedRows.map((r) => [r.id, r]));
  const typeByCode = new Map((typeRows || [])
    .map((r) => [`${r.mainCategoryCode}-${r.typeCode}`, r]));

  const out = [];
  for (const item of items) {
    const scent = scentById.get(item.scentId);
    if (!scent) return { items: [], error: `ไม่พบกลิ่นที่เลือกในรายการที่ ${item.sortOrder}` };
    // ⚠️ กลิ่นข้ามลูกค้าไม่ได้ (มติ 9) — ใบผูกดีลของลูกค้ารายหนึ่ง จะขอกลิ่นของ
    // อีกรายไม่ได้ · ตรวจที่นี่ ไม่ใช่แค่กรองตัวเลือกบนจอ
    // ⭐ ของลูกค้ารายนี้ = เจ้าของ หรือได้รับแชร์ (ม-150)
    if (customerId && !scentUsableByCustomer(scent, customerId)) {
      return { items: [], error: `รายการที่ ${item.sortOrder}: กลิ่นนี้เป็นของลูกค้าคนละราย` };
    }
    const type = typeByCode.get(item.categoryCode);
    // หมวดที่ชื่อว่างทั้งสองภาษามีจริง (prod 5 แถว) — ถอยไปใช้รหัส ห้ามป้ายว่าง
    const typeName = type?.nameTh || type?.nameEn || item.categoryCode;
    out.push({
      ...item,
      label: `${typeName} · ${scent.code ? `${scent.code} ` : ''}${scent.name}`,
    });
  }
  return { items: out, error: null };
}

async function resolveDocumentProducts(supabase, items, { customerId }) {
  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  if (!productIds.length) return { items, error: null };
  const { data, error } = await supabase.from('products')
    .select('id, "fgCode", "customerId"').in('id', productIds).limit(productIds.length);
  if (error) return { items: [], error: error.message };
  const byId = new Map((data || []).map((p) => [p.id, p]));
  const out = [];
  for (const item of items) {
    if (!item.productId) { out.push(item); continue; }
    const product = byId.get(item.productId);
    if (!product) return { items: [], error: `ไม่พบสินค้า (FG) ที่เลือกในรายการที่ ${item.sortOrder}` };
    if (customerId && product.customerId && product.customerId !== customerId) {
      return { items: [], error: `รายการที่ ${item.sortOrder}: FG นี้เป็นของลูกค้าคนละรายกับใบ` };
    }
    out.push({ ...item, label: product.fgCode ? `${item.label} · ${product.fgCode}` : item.label });
  }
  return { items: out, error: null };
}
