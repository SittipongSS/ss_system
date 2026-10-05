// ── ใส่ราคาให้สูตรในทะเบียน — F · B · FB (ม-148 · มติผู้ใช้ 2026-09-22) ─────────────
// ราคาลง material_prices เป็น rev ปกติ (ก้อนเดียวกับขั้นใส่ราคาในสายคำร้อง —
// ดูเหตุผลที่ lib/master/registryPriceRoute.js)
// ⭐ *"ถ้าเป็นสูตร ก็ใส่ได้ทั้ง F และ B และ FB"* — B/FB ลงที่สูตรนี้ · F ลงที่ **กลิ่นของสูตร**
//   (F เป็นของกลิ่น: สูตรทุกตัวที่ใช้กลิ่นเดียวกันเห็นราคา F ตัวเดียวกัน) · สูตรไม่มีกลิ่น = ไม่มีช่อง F
import { withUser } from '@/lib/http';
import { makeRegistryPriceHandler } from '@/lib/master/registryPriceRoute';
import { findFormula, findScent, loadPriceSlotSource } from '@/lib/master/scentFormulaAdmin';
import { FORMULA_STATUS_LABELS, isFormulaUsable } from '@/lib/master/formulas';
import { formulaPriceSlots } from '@/lib/master/priceSlots';

export const dynamic = 'force-dynamic';

export const POST = withUser(makeRegistryPriceHandler({
  kind: 'RM_FB',
  stampColumn: 'formulaId',
  // สูตรหมวดหัวน้ำหอม (02-020) = F ช่องเดียว ลงกลิ่นของสูตร (ดู priceSlotsFor) · กลิ่นใช้ไม่ได้ = ไม่มีช่อง F
  // (หัวน้ำหอมที่กลิ่นใช้ไม่ได้ = ไม่มีช่องเลย + `blocker` บอกเหตุ) · ตัวเดียวกับที่หน้าทะเบียนสูตรใช้เปิดโมดัล
  slotsOf: async (formula, supabase) => formulaPriceSlots(
    formula, formula.scentId ? await findScent(supabase, formula.scentId) : null,
  ),
  // ช่อง F → กลิ่นของสูตร · ด่านเดียวกับขั้นใส่ราคาในคำร้อง (`loadPriceSlotSource`)
  findOther: (supabase, slot) => loadPriceSlotSource(supabase, slot),
  entityType: 'formula',
  entityLabel: 'สูตร',
  find: findFormula,
  usableError: (formula) => (isFormulaUsable(formula)
    ? null
    : `สูตรสถานะ "${FORMULA_STATUS_LABELS[formula.status] || formula.status}" ยังใส่ราคาไม่ได้ — ต้องรับเข้าทะเบียนก่อน`),
}));
