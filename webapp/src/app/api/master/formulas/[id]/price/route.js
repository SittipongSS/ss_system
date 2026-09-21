// ── ใส่ราคาให้สูตรในทะเบียน — F · B · FB (ม-148 · มติผู้ใช้ 2026-09-22) ─────────────
// ราคาลง material_prices เป็น rev ปกติ (ก้อนเดียวกับขั้นใส่ราคาในสายคำร้อง —
// ดูเหตุผลที่ lib/master/registryPriceRoute.js)
// ⭐ *"ถ้าเป็นสูตร ก็ใส่ได้ทั้ง F และ B และ FB"* — B/FB ลงที่สูตรนี้ · F ลงที่ **กลิ่นของสูตร**
//   (F เป็นของกลิ่น: สูตรทุกตัวที่ใช้กลิ่นเดียวกันเห็นราคา F ตัวเดียวกัน) · สูตรไม่มีกลิ่น = ไม่มีช่อง F
import { withUser } from '@/lib/http';
import { makeRegistryPriceHandler } from '@/lib/master/registryPriceRoute';
import { findFormula, findScent } from '@/lib/master/scentFormulaAdmin';
import { FORMULA_STATUS_LABELS, isFormulaUsable } from '@/lib/master/formulas';
import { SCENT_STATUS_LABELS, isScentUsable } from '@/lib/master/scents';
import { priceSlotsFor } from '@/lib/master/priceSlots';

export const dynamic = 'force-dynamic';

export const POST = withUser(makeRegistryPriceHandler({
  kind: 'RM_FB',
  stampColumn: 'formulaId',
  // สูตรหมวดหัวน้ำหอม (02-020) = F ช่องเดียว ลงกลิ่นของสูตร (ดู priceSlotsFor)
  slotsOf: (formula) => priceSlotsFor({
    scentId: formula.scentId, formulaId: formula.id, categoryCode: formula.categoryCode,
  }),
  // ช่อง F → กลิ่นของสูตร · ด่านสถานะชุดเดียวกับปุ่มราคาบนหน้าทะเบียนกลิ่น
  findOther: async (supabase, slot) => {
    const scent = await findScent(supabase, slot.id);
    if (!scent) return { source: null, error: 'ไม่พบกลิ่นของสูตรนี้ในทะเบียน — ใส่ราคา F ไม่ได้' };
    if (!isScentUsable(scent)) {
      return {
        source: null,
        error: `กลิ่นของสูตรนี้สถานะ "${SCENT_STATUS_LABELS[scent.status] || scent.status}" ยังใส่ราคา F ไม่ได้`,
      };
    }
    return { source: scent };
  },
  entityType: 'formula',
  entityLabel: 'สูตร',
  find: findFormula,
  usableError: (formula) => (isFormulaUsable(formula)
    ? null
    : `สูตรสถานะ "${FORMULA_STATUS_LABELS[formula.status] || formula.status}" ยังใส่ราคาไม่ได้ — ต้องรับเข้าทะเบียนก่อน`),
}));
