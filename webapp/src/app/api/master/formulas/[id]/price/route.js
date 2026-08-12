// ── ใส่ราคา FB (เนื้อสาร ฿/กก.) ให้สูตรในทะเบียน ──────────────────────────
// ราคาลง material_prices เป็น rev ปกติ (ก้อนเดียวกับขั้นใส่ราคาในสายคำร้อง —
// ดูเหตุผลที่ lib/master/registryPriceRoute.js)
import { withUser } from '@/lib/http';
import { makeRegistryPriceHandler } from '@/lib/master/registryPriceRoute';
import { findFormula } from '@/lib/master/scentFormulaAdmin';
import { FORMULA_STATUS_LABELS, isFormulaUsable } from '@/lib/master/formulas';

export const dynamic = 'force-dynamic';

export const POST = withUser(makeRegistryPriceHandler({
  kind: 'RM_FB',
  stampColumn: 'formulaId',
  entityType: 'formula',
  entityLabel: 'สูตร',
  find: findFormula,
  usableError: (formula) => (isFormulaUsable(formula)
    ? null
    : `สูตรสถานะ "${FORMULA_STATUS_LABELS[formula.status] || formula.status}" ยังใส่ราคาไม่ได้ — ต้องรับเข้าทะเบียนก่อน`),
}));
