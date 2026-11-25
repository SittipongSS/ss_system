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
import { formulaUsableByCustomer, scentUsableByCustomer } from '@/lib/master/registryShares';
import { formulaLabel, scentLabel } from '@/lib/master/registryLabel';
import { docLineSubjectError, docLineSubjectValues, docLineWantsSubject } from '@/lib/requests/docLineSubject';

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
      supabase.from('scents').select('id, code, name, "producedAt", customerId').in('id', scentIds),
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
    // ⭐ หมวด = รหัส + ชื่อเสมอ (มติเจ้าของ 18/11/2026) · หมวดที่ชื่อว่างทั้งสองภาษามีจริง (prod 5 แถว) — เหลือรหัส ห้ามป้ายว่าง
    // ⚠️ ห้ามมี " · " ในส่วนหมวด — `productDevLabel` แยกหมวดกับกลิ่นที่ตัวคั่นตัวแรก
    const typeName = [item.categoryCode, type?.nameTh || type?.nameEn].filter(Boolean).join(' ');
    out.push({
      ...item,
      // กลิ่น = PF · ชื่อ · วันที่ผลิต (มติเจ้าของ 13/11 · lib/master/registryLabel)
      label: `${typeName} · ${scentLabel(scent)}`,
    });
  }
  return { items: out, error: null };
}

async function resolveDocumentProducts(supabase, items, { customerId }) {
  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  const scentIds = [...new Set(items.map((i) => i.scentId).filter(Boolean))];
  const formulaIds = [...new Set(items.map((i) => i.formulaId).filter(Boolean))];
  /* ⭐ ม-167: บรรทัด MSDS ใหม่ที่ไม่มี FG ก็ยังต้องผ่านด่าน FG ของ normalize (ตกก่อนมาถึงนี่) · ไม่มีอะไรให้อ่าน = จบ
     ⚠️ แต่บรรทัด MSDS ที่มี FG ต้องอ่าน FG เสมอ — ด่าน "ต้องมีกลิ่น/สูตร" ตัดสินจากหมวด + การผูกของ FG */
  if (!productIds.length && !scentIds.length && !formulaIds.length) return { items, error: null };

  let productById = new Map();
  if (productIds.length) {
    /* หมวด + การผูก (`formulaId` · `scentId`) ของ FG — ด่านกลิ่น/สูตรของ MSDS (ม-167) ตัดสินจากสองค่านี้ */
    const { data, error } = await supabase.from('products')
      .select('id, "fgCode", "customerId", "categoryCode", "formulaId", "scentId"').in('id', productIds).limit(productIds.length);
    if (error) return { items: [], error: error.message };
    productById = new Map((data || []).map((p) => [p.id, p]));
  }

  /* ⭐ ม-167: ตัดค่าผิดชนิดออกก่อนอ่านทะเบียน — FG หมวดสูตรที่พกกลิ่นค้าง (หรือกลับกัน) / FG ที่ผูกแล้ว ไม่เก็บอะไรในบรรทัด
     ⚠️ บรรทัด IFRA ไม่ผ่านทางนี้ (กลิ่นของ IFRA คือเป้าของบรรทัด ไม่ใช่ตัวตนของ FG) */
  const shaped = items.map((item) => {
    if (!docLineWantsSubject(item) || !item.productId) return item;
    const product = productById.get(item.productId);
    if (!product) return item;
    return { ...item, ...docLineSubjectValues(item, product) };
  });
  for (const item of shaped) {
    const product = item.productId ? productById.get(item.productId) : null;
    const subjectError = docLineSubjectError(item, product, { at: `รายการที่ ${item.sortOrder}` });
    if (subjectError) return { items: [], error: subjectError };
  }

  const liveScentIds = [...new Set(shaped.map((i) => i.scentId).filter(Boolean))];
  const liveFormulaIds = [...new Set(shaped.map((i) => i.formulaId).filter(Boolean))];

  /* ⭐ กลิ่นของบรรทัด IFRA (P3 · 09/11/2026) + กลิ่นของบรรทัด MSDS หมวด 02-020 (ม-167) — ต้องมีจริง และใช้กับลูกค้าของใบได้
     (เจ้าของหรือได้รับแชร์ · ม-150) กติกาเดียวกับกลิ่นของบรรทัดพัฒนาสูตรข้างล่าง */
  let scentById = new Map();
  if (liveScentIds.length) {
    const { data, error } = await supabase.from('scents')
      .select('id, code, name, "producedAt", customerId').in('id', liveScentIds).limit(liveScentIds.length);
    if (error) return { items: [], error: error.message };
    let shared;
    try {
      shared = await attachShares(supabase, data || [], 'scent');
    } catch (e) {
      return { items: [], error: e.message };
    }
    scentById = new Map(shared.map((r) => [r.id, r]));
  }
  /* ⭐ สูตรของบรรทัด MSDS (ม-167 · mig 0440) — มีจริง + ลูกค้าของใบใช้ได้ (สูตรฐาน · เจ้าของ · ได้รับแชร์) · เก็บเข้ากรุแล้ว = เลือกใหม่ไม่ได้ */
  let formulaById = new Map();
  if (liveFormulaIds.length) {
    const { data, error } = await supabase.from('formulas')
      .select('id, code, name, "formulaDate", "customerId", status').in('id', liveFormulaIds).limit(liveFormulaIds.length);
    if (error) return { items: [], error: error.message };
    let shared;
    try {
      shared = await attachShares(supabase, data || [], 'formula');
    } catch (e) {
      return { items: [], error: e.message };
    }
    formulaById = new Map(shared.map((r) => [r.id, r]));
  }

  const out = [];
  for (const item of shaped) {
    let label = item.label;
    if (item.productId) {
      const product = productById.get(item.productId);
      if (!product) return { items: [], error: `ไม่พบสินค้า (FG) ที่เลือกในรายการที่ ${item.sortOrder}` };
      if (customerId && product.customerId && product.customerId !== customerId) {
        return { items: [], error: `รายการที่ ${item.sortOrder}: FG นี้เป็นของลูกค้าคนละรายกับใบ` };
      }
      if (product.fgCode) label = `${label} · ${product.fgCode}`;
    }
    if (item.scentId) {
      const scent = scentById.get(item.scentId);
      if (!scent) return { items: [], error: `ไม่พบกลิ่นที่เลือกในรายการที่ ${item.sortOrder}` };
      if (customerId && !scentUsableByCustomer(scent, customerId)) {
        return { items: [], error: `รายการที่ ${item.sortOrder}: กลิ่นนี้เป็นของลูกค้าคนละราย` };
      }
      label = `${label} · ${scentLabel(scent)}`;
    }
    if (item.formulaId) {
      const formula = formulaById.get(item.formulaId);
      if (!formula) return { items: [], error: `ไม่พบสูตรที่เลือกในรายการที่ ${item.sortOrder}` };
      if (formula.status === 'archived' && !item.id) {
        return { items: [], error: `รายการที่ ${item.sortOrder}: สูตร ${formulaLabel(formula)} เก็บเข้ากรุแล้ว — เลือกสูตรอื่น` };
      }
      if (customerId && !formulaUsableByCustomer(formula, customerId)) {
        return { items: [], error: `รายการที่ ${item.sortOrder}: สูตรนี้เป็นของลูกค้าคนละราย` };
      }
      label = `${label} · ${formulaLabel(formula)}`;
    }
    // ชื่อที่พิมพ์เอง (ม-167) — ติดป้ายให้อ่านออกในเธรด/ประวัติ · ไม่ใช่ป้าย PF (ไม่มีในทะเบียน)
    if (item.typedSubjectName) label = `${label} · ${item.typedSubjectName}`;
    out.push(label === item.label ? item : { ...item, label });
  }
  return { items: out, error: null };
}
