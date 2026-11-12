// ── ท่อนลูกค้าในรหัส FG ต้องเดินตามเจ้าของ ──────────────────────────────────
//
// รหัส FG ที่ระบบออกให้ (`FG-AAAA-BB-CCC-DDDDD`) ฝังรหัสลูกค้าไว้ในท่อน AAAA · เดิมรหัสนี้
// ถูกล็อกถาวร ⇒ เจ้าของเปลี่ยนเมื่อไร รหัสบอกลูกค้าผิดรายทันที และไม่มีทางแก้นอกจาก datafix
//
// 🐞 ของจริงสองทาง (ตรวจทั้งระบบ 12/11/2026):
//   ① ย้ายลูกค้าบน FG — ย้าย 5 ตัวจาก AR-000 ไป AR-1044 แล้วรหัสค้าง `FG-0000-…`
//   ② แอดมินแก้รหัส AR — AR-1001 → AR-867 (25/08) แล้ว FG ของรายนั้นค้าง `FG-1001-…` ทั้งชุด
//
// มติเจ้าของ 12/11/2026 (ทั้งสองทาง): **FG ที่ยังไม่ขึ้นเอกสาร เปลี่ยนท่อนลูกค้าให้อัตโนมัติ**
// (หมวด + เลขรันเดิม) · ตัวที่ขึ้นเอกสารแล้ว:
//   ① ย้ายลูกค้า = **บล็อก** — เอกสารของลูกค้าเดิมจะชี้ FG ของลูกค้าอีกราย ⇒ สร้าง FG ใหม่แทน
//   ② แก้รหัส AR = **คงรหัสเดิม** และโมดัลยืนยันโชว์รายชื่อให้เห็นก่อนกด (แก้ต่อด้วย datafix)
//
// "ขึ้นเอกสาร" = มีแถวในทะเบียน "ใครอ้างสินค้า" (`REFERENCE_REGISTRY.product` — ชุดเดียวกับ
// ด่านก่อนลบ ซึ่ง `npm run check:refs` เทียบกับสคีมาจริงใน CI) ⇒ ตารางใหม่ที่อ้างสินค้าถูกนับ
// ตรงนี้เองโดยไม่ต้องจำมาเพิ่ม · ยกเว้นตารางที่เป็นเนื้อของตัวสินค้าเอง (ข้างล่าง)
//
// ⚠️ รหัสกรอกมือ (`FG-AAA-…` ท่อนลูกค้า 3 หลัก) ไม่ถูกเขียนใหม่ — ท่อนเลขรันของมันกว้าง 4
// แปลงเป็นรูป 4 หลักของระบบไม่ได้ และคนแก้รหัสกรอกมือเองได้อยู่แล้วที่ฟอร์มสินค้า
import { fgCodeForCustomer, isAutoFgCode } from './masterCodes.js';
import { findReferencedIds } from './entityReferences.js';

/* ตารางในทะเบียน "ใครอ้างสินค้า" ที่ **ไม่นับ** ว่าขึ้นเอกสาร — เป็นเนื้อของตัวสินค้าเอง
   ย้ายลูกค้าแล้วตามไปด้วยกัน (เหตุผลต้องเขียนกำกับเสมอ · เทสต์บังคับ) */
export const FG_RECODE_OWN_TABLES = Object.freeze({
  product_specs: 'สเปคสินค้า FM-SA-04 หนึ่งแถวต่อสินค้า เป็นเนื้อของตัวสินค้าเอง — '
    + 'เอกสารที่ออกให้ลูกค้าจากสเปคอยู่ที่ product_spec_documents ซึ่งยังนับ',
});

const CODE_COLLISION = 'รหัสใหม่ชนกับ FG ที่มีอยู่แล้ว';
const MANUAL_CODE = 'รหัสกรอกมือ — ระบบไม่เขียนท่อนลูกค้าให้';
const NO_SEGMENT = 'รหัส AR ใหม่ใช้ประกอบรหัส FG ไม่ได้';

/**
 * ตัดสินราย FG ว่าจะได้รหัสอะไร — ฟังก์ชันบริสุทธิ์ ไม่แตะฐาน
 * @param products   แถวสินค้า (ต้องมี id, fgCode)
 * @param arCode     รหัส AR ของเจ้าของ (ใหม่)
 * @param referenced Map<productId, labels[]> จาก findReferencedIds
 * @param taken      Set ของรหัส FG ที่มีอยู่แล้วในทะเบียน
 * @returns {{changes: {id, fgCode, next}[], kept: {id, fgCode, reason, inUse?: string[]}[]}}
 *          ตัวที่รหัสถูกอยู่แล้วไม่อยู่ทั้งสองลิสต์
 */
export function planFgRecode({ products = [], arCode, referenced = new Map(), taken = new Set() }) {
  const changes = [];
  const kept = [];
  const claimed = new Set();
  for (const product of products) {
    const fgCode = String(product.fgCode ?? '').trim();
    if (!isAutoFgCode(fgCode)) {
      if (fgCode) kept.push({ id: product.id, fgCode, reason: MANUAL_CODE });
      continue;
    }
    const next = fgCodeForCustomer(fgCode, arCode);
    if (!next) { kept.push({ id: product.id, fgCode, reason: NO_SEGMENT }); continue; }
    if (next === fgCode) continue;
    const inUse = referenced.get(product.id);
    if (inUse?.length) {
      kept.push({ id: product.id, fgCode, reason: `ขึ้นเอกสารแล้ว: ${inUse.join(' · ')}`, inUse });
      continue;
    }
    if (taken.has(next) || claimed.has(next)) { kept.push({ id: product.id, fgCode, reason: CODE_COLLISION }); continue; }
    claimed.add(next);
    changes.push({ id: product.id, fgCode, next });
  }
  return { changes, kept };
}

const CODES_PER_REQUEST = 100;

/**
 * อ่านฐานแล้ววางแผน — ตัวไหนขึ้นเอกสาร · รหัสใหม่ชนของเดิมไหม
 * @returns {Promise<{plan: {changes, kept}|null, error: Error|null}>} error ≠ null ⇒ ยังไม่รู้ ห้ามเขียน
 */
export async function loadFgRecodePlan(supabase, { products = [], arCode }) {
  const auto = products.filter((p) => isAutoFgCode(p.fgCode));
  const { byId: referenced, error } = await findReferencedIds(
    supabase, 'product', auto.map((p) => p.id), { skip: Object.keys(FG_RECODE_OWN_TABLES) },
  );
  if (error) return { plan: null, error };
  const wanted = [...new Set(auto.map((p) => fgCodeForCustomer(p.fgCode, arCode)).filter(Boolean))];
  const taken = new Set();
  for (let from = 0; from < wanted.length; from += CODES_PER_REQUEST) {
    // fgCode เป็น unique (mig 0035) ⇒ ก้อนละ ≤ CODES_PER_REQUEST แถวเสมอ — limit ตรงกับความจริง ไม่ได้ตัดอะไร
    const { data, error: takenError } = await supabase.from('products').select('fgCode')
      .in('fgCode', wanted.slice(from, from + CODES_PER_REQUEST)).order('fgCode').limit(CODES_PER_REQUEST);
    if (takenError) return { plan: null, error: new Error(`ตรวจรหัส FG ซ้ำไม่สำเร็จ: ${takenError.message}`) };
    for (const row of data || []) taken.add(row.fgCode);
  }
  return { plan: planFgRecode({ products, arCode, referenced, taken }), error: null };
}

/**
 * เขียนรหัสใหม่ตามแผน — ทีละแถวแบบ CAS (`fgCode` ต้องยังเป็นค่าเดิม) ไม่ใช่เขียนทับดื้อ ๆ
 * ⚠️ `audit` ส่งเข้ามาจากผู้เรียก (ห่อ recordAudit) — เทสต์ต้องไม่แตะฐานจริง (กฎใน AGENTS.md)
 * @returns {Promise<{changed: {id, fgCode, next}[], failed: {id, fgCode, next, message}[]}>}
 */
export async function applyFgRecode(supabase, changes = [], { audit = async () => {}, now = () => new Date().toISOString() } = {}) {
  const changed = [];
  const failed = [];
  for (const change of changes) {
    const { data, error } = await supabase.from('products')
      .update({ fgCode: change.next, updatedAt: now() })
      .eq('id', change.id).eq('fgCode', change.fgCode)
      .select('*');
    if (error || (data || []).length !== 1) {
      failed.push({ ...change, message: error?.message || 'รหัสถูกเปลี่ยนไปก่อนแล้ว' });
      continue;
    }
    changed.push(change);
    await audit({ change, after: data[0] });
  }
  return { changed, failed };
}

/* ข้อความตอนบล็อกการย้ายลูกค้า (ทาง ①) */
export function fgMoveBlockedMessage(kept) {
  if (kept.inUse?.length) {
    return `ย้ายลูกค้าไม่ได้ — ${kept.fgCode} ขึ้นเอกสารของลูกค้าเดิมแล้ว (${kept.inUse.join(' · ')}) `
      + 'ย้ายไปแล้วใบเหล่านั้นจะชี้ FG ของลูกค้าอีกราย · ต้องการใช้กับลูกค้ารายใหม่ให้สร้าง FG ใหม่';
  }
  if (kept.reason === CODE_COLLISION) {
    return `ย้ายลูกค้าไม่ได้ — รหัสใหม่ของ ${kept.fgCode} ชนกับ FG ที่ลูกค้าปลายทางมีอยู่แล้ว`;
  }
  return `ย้ายลูกค้าไม่ได้ — ${kept.reason}`;
}
