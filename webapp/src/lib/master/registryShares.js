// ── แชร์กลิ่น/สูตรให้ลูกค้ารายอื่น (ม-150 · mig 0373) — ตัวตัดสินล้วน ไม่แตะ DB ─────────────
//
// ⭐ มติผู้ใช้ 2026-09-22: กลิ่น/สูตร "ผูกได้หลายลูกค้า" แบบ **แชร์ให้ลูกค้าอื่น** — เจ้าของยังมีรายเดียว
//   (`customerId` · อยู่ในตัวตนของกลิ่น) ส่วนลูกค้าที่ได้รับแชร์ **ใช้ได้เหมือนเป็นของตัวเอง**:
//   เลือกในคำร้อง/PDR · ทำสูตรของตัวเองจากกลิ่นนี้ · แตกรอบแก้ · เห็นในหน้าลูกค้า · แชร์สูตรได้ด้วย
//   · RD เท่านั้นที่แชร์/เลิกแชร์ (เจ้าของทะเบียน — `isScentRegistrar` / `isFormulaRegistrar`)
//
// ⚠️ **ทุกด่าน "ของลูกค้ารายนี้ไหม" ต้องถามสองตัวนี้** — เทียบ `x.customerId === customerId` ตรง ๆ เมื่อไร
//   กลิ่นที่แชร์แล้วจะหายจากตัวเลือกของลูกค้าที่ได้รับแชร์เงียบ ๆ (มติ 9 เดิมเทียบแบบนั้นราว 15 จุด)
// ⚠️ แถวต้องมี `sharedCustomerIds` ติดมาก่อน (server: `attachShares` ใน scentFormulaAdmin) — ไม่มี = ถือว่าไม่ได้แชร์

/** ลูกค้าที่ได้รับแชร์ของแถวนี้ (ไม่รวมเจ้าของ) */
export function sharedCustomerIdsOf(entity) {
  return Array.isArray(entity?.sharedCustomerIds) ? entity.sharedCustomerIds : [];
}

/** กลิ่นนี้ลูกค้ารายนี้ใช้ได้ไหม — เจ้าของ หรือได้รับแชร์ */
export function scentUsableByCustomer(scent, customerId) {
  if (!scent || !customerId) return false;
  return scent.customerId === customerId || sharedCustomerIdsOf(scent).includes(customerId);
}

/** สูตรนี้ลูกค้ารายนี้ใช้ได้ไหม — สูตรฐาน (ไม่ผูกลูกค้า) · เจ้าของ · หรือได้รับแชร์ */
export function formulaUsableByCustomer(formula, customerId) {
  if (!formula) return false;
  if (!formula.customerId) return true;
  if (!customerId) return false;
  return formula.customerId === customerId || sharedCustomerIdsOf(formula).includes(customerId);
}

export const MAX_SHARED_CUSTOMERS = 50;

/**
 * ตรวจรายชื่อลูกค้าที่จะแชร์ — คืน `{ customerIds, error }`
 * · ตัดซ้ำ · ตัดช่องว่าง · **ตัดเจ้าของออกเงียบ ๆ** (เจ้าของใช้ได้อยู่แล้ว ไม่ต้องแชร์ให้ตัวเอง)
 * · สูตรฐาน (ไม่มีเจ้าของ) แชร์ไม่ได้ — ใช้ได้ทุกลูกค้าอยู่แล้ว
 */
export function normalizeShareInput(raw, { ownerId = null, kind = 'scent' } = {}) {
  if (!Array.isArray(raw)) return { customerIds: [], error: 'รายชื่อลูกค้าไม่ถูกต้อง' };
  if (kind === 'formula' && !ownerId) {
    return { customerIds: [], error: 'สูตรฐาน (ไม่ผูกลูกค้า) ใช้ได้ทุกลูกค้าอยู่แล้ว — ไม่ต้องแชร์' };
  }
  const ids = [...new Set(raw.map((v) => String(v ?? '').trim()).filter(Boolean))]
    .filter((id) => id !== ownerId);
  if (ids.length > MAX_SHARED_CUSTOMERS) {
    return { customerIds: [], error: `แชร์ได้สูงสุด ${MAX_SHARED_CUSTOMERS} ลูกค้า` };
  }
  return { customerIds: ids, error: null };
}

/** สิ่งที่ต้องทำกับตาราง — `{ add, remove }` จากชุดเดิม → ชุดใหม่ */
export function diffShares(current = [], next = []) {
  const before = new Set(current);
  const after = new Set(next);
  return {
    add: next.filter((id) => !before.has(id)),
    remove: current.filter((id) => !after.has(id)),
  };
}

/**
 * ด่านเลิกแชร์ — ลูกค้าที่ใช้ของชิ้นนี้อยู่แล้วเลิกแชร์ไม่ได้ (ไม่งั้นสูตร/คำร้องของเขาจะติดด่าน "ของลูกค้าอื่น"
 * ทุกครั้งที่แก้ = ทางตัน) · `usage` = `{ [customerId]: { formulas, requests, products } }`
 */
export function unshareError(removeIds = [], usage = {}, nameOf = (id) => id) {
  for (const id of removeIds) {
    const u = usage[id] || {};
    const parts = [
      u.formulas ? `สูตร ${u.formulas} ตัว` : null,
      u.scents ? `กลิ่นรอบแก้ ${u.scents} ตัว` : null,
      u.sharedFormulas ? `สูตรที่แชร์ให้ ${u.sharedFormulas} ตัว (เลิกแชร์สูตรก่อน)` : null,
      u.requests ? `คำร้อง ${u.requests} ใบ` : null,
      u.products ? `สินค้า ${u.products} รายการ` : null,
    ].filter(Boolean);
    if (parts.length) return `เลิกแชร์ ${nameOf(id)} ไม่ได้ — ลูกค้ารายนี้ใช้อยู่ (${parts.join(' · ')})`;
  }
  return null;
}
