// ── ทะเบียนสูตร (mig 0171) — logic ล้วน ใช้ร่วมทั้ง API และหน้าจอ ─────────
//
// เดิมสูตรเป็น 3 ช่องข้อความบน products (mig 0112: formulaName/Code/Date) ไม่มี
// ตาราง ไม่มีความสัมพันธ์กับกลิ่น → คำร้อง "ขอราคา FB อ้างชื่อสูตร" อ้างได้แค่
// ข้อความ จับคู่ข้ามงานไม่ได้
//
// ⚠️ รหัสสูตรเป็นของจริงจาก RD ไม่ใช่เลขรันของระบบ (มติ 8) — ร่างยังไม่มีรหัสได้
// เพราะของจริงบน prod มี 10 แถวที่มีแต่ชื่อไม่มีรหัส (ดูหัว migration 0171)
import { canUser, isReadOnlyObserver, isSuperuser } from '@/lib/permissions';

export const FORMULA_STATUSES = ['draft', 'active', 'archived'];

export const FORMULA_STATUS_LABELS = {
  draft: 'ร่าง — รอ RD รับเข้าทะเบียน',
  active: 'ใช้งานได้',
  archived: 'เลิกใช้',
};

export const FORMULA_STATUS_TONES = {
  draft: 'var(--text-3)',
  active: 'var(--green)',
  archived: 'var(--text-3)',
};

// สถานะที่อ้างอิงในคำร้องขอราคา FB ได้
export const FORMULA_USABLE_STATUSES = ['active'];

export function normalizeFormulaStatus(value) {
  return FORMULA_STATUSES.includes(value) ? value : 'draft';
}

export function isFormulaUsable(formula) {
  return FORMULA_USABLE_STATUSES.includes(formula?.status);
}

// ── ตัวตนของสูตร = รหัส (ตัดช่องว่าง/ไม่สนตัวพิมพ์) ──────────────────────
// ต้องตรงกับ formulas_code_uk เป๊ะ ๆ · ร่างที่ยังไม่มีรหัสไม่มีตัวตนที่เทียบได้
// (index เป็น partial) จึงซ้ำกันได้ชั่วคราวจนกว่า RD จะใส่รหัสตอนรับเข้าทะเบียน
export function formulaIdentityKey({ code } = {}) {
  return String(code ?? '').trim().toLowerCase();
}

export function findFormulaByCode(formulas = [], code) {
  const key = formulaIdentityKey({ code });
  if (!key) return null;
  return formulas.find((f) => formulaIdentityKey(f) === key) || null;
}

// ── สิทธิ์ (แพตเทิร์นเดียวกับทะเบียนกลิ่น — ดู scents.js) ─────────────────
export function canViewFormulas(user) {
  return canUser(user, 'products:view');
}

export function isFormulaRegistrar(user) {
  return user?.role === 'rd' || isSuperuser(user?.role);
}

export function canProposeFormula(user) {
  if (isReadOnlyObserver(user?.role)) return false;
  return isFormulaRegistrar(user) || canUser(user, 'products:edit');
}

export function canEditFormula(user, formula) {
  if (!formula) return false;
  if (isFormulaRegistrar(user)) return true;
  if (formula.status !== 'draft') return false;
  return canProposeFormula(user) && formula.createdById === user?.id;
}

// ── ด่านของแต่ละ action ──────────────────────────────────────────────────
export function acceptFormulaError(formula, { code } = {}) {
  if (!formula) return 'ไม่พบสูตร';
  if (formula.status !== 'draft') return 'สูตรนี้รับเข้าทะเบียนไปแล้ว';
  if (!String(code ?? '').trim()) return 'ต้องระบุรหัสสูตรตอนรับเข้าทะเบียน';
  return null;
}

export function archiveFormulaError(formula) {
  if (!formula) return 'ไม่พบสูตร';
  if (formula.status === 'archived') return 'สูตรนี้เลิกใช้ไปแล้ว';
  if (formula.status === 'draft') return 'ร่างยังไม่ได้เข้าทะเบียน — ลบทิ้งแทน';
  return null;
}

// ลบได้เฉพาะร่างที่ยังไม่มีสินค้าอ้างถึง — ของที่รับเข้าทะเบียนแล้วเป็นหลักฐาน
export function deleteFormulaError(formula, { productCount = 0 } = {}) {
  if (!formula) return 'ไม่พบสูตร';
  if (formula.status !== 'draft') return 'ลบได้เฉพาะร่าง — สูตรในทะเบียนให้เปลี่ยนเป็น "เลิกใช้" แทน';
  if (productCount > 0) return `มีสินค้า ${productCount} รายการอ้างสูตรนี้อยู่ ลบไม่ได้`;
  return null;
}

// ── ตรวจข้อมูลก่อนสร้าง/แก้ — คืน { value, error } ───────────────────────
export function normalizeFormulaInput(body = {}) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { value: null, error: 'ต้องระบุชื่อสูตร' };
  if (name.length > 200) return { value: null, error: 'ชื่อสูตรยาวเกิน 200 ตัวอักษร' };

  const code = String(body.code ?? '').trim() || null;
  if (code && code.length > 100) return { value: null, error: 'รหัสสูตรยาวเกิน 100 ตัวอักษร' };

  const formulaDate = String(body.formulaDate ?? '').trim() || null;
  if (formulaDate && !/^\d{4}-\d{2}-\d{2}$/.test(formulaDate)) {
    return { value: null, error: 'วันที่ของสูตรไม่ถูกต้อง' };
  }
  // กันปีพิมพ์ผิดแบบที่เจอจริงบน prod ('2202-08-06') — ปีเกินช่วงที่เป็นไปได้
  // แปลว่าพิมพ์ผิด ไม่ใช่ข้อมูลจริง ต้องดักตั้งแต่ตอนกรอก
  if (formulaDate) {
    const year = Number(formulaDate.slice(0, 4));
    if (year < 1990 || year > 2100) return { value: null, error: 'ปีของวันที่สูตรไม่ถูกต้อง' };
  }

  const note = String(body.note ?? '').trim();
  if (note.length > 2000) return { value: null, error: 'หมายเหตุยาวเกิน 2000 ตัวอักษร' };

  return {
    value: {
      name,
      code,
      formulaDate,
      scentId: String(body.scentId ?? '').trim() || null,
      customerId: String(body.customerId ?? '').trim() || null,
      customerName: String(body.customerName ?? '').trim() || null,
      note: note || null,
    },
    error: null,
  };
}

// วันที่ที่ "สืบทอดมา" จากสินค้าเก่าอาจเสีย (prod มีจริง: '2202-08-06')
// ⚠️ ถ้าปล่อยให้ตัวดักปีพิมพ์ผิดปฏิเสธตอนจัดระเบียบ แถวนั้นจะจัดไม่ได้เลยตลอดไป —
// กฎที่ตั้งใจกันข้อมูลเสียจะกลายเป็นตัวบล็อกการล้างข้อมูลเสียเอง
// ค่าที่ผู้ใช้พิมพ์เองยังตรวจตามปกติ (ผู้เรียกส่งเข้ามาแล้วให้ normalize จับ)
// ส่วนค่าที่สืบทอดมาถ้าไม่ผ่านให้ทิ้งเป็น null แล้ว RD เติมทีหลังได้
export function sanitizeInheritedFormulaDate(typed, inherited) {
  const typedValue = String(typed ?? '').trim();
  if (typedValue) return typedValue;
  if (!inherited) return null;
  return normalizeFormulaInput({ name: 'x', formulaDate: inherited }).error ? null : inherited;
}

// ── "รอจัดระเบียบ" — สินค้าที่มีชื่อสูตรแต่ยังไม่ได้ผูกทะเบียน ────────────
// prod มี 10 แถวแบบนี้ และชื่อส่วนใหญ่คือ *ชื่อกลิ่น* ไม่ใช่ชื่อสูตร
// migration ตั้งใจไม่ backfill (เดาแทน RD ไม่ได้) — หน้าจอโชว์ให้ RD ตัดสินทีละแถว
export function unsortedFormulaRows(products = []) {
  return products
    .filter((p) => !p.formulaId && !p.scentId && String(p.formulaName ?? '').trim())
    .map((p) => ({
      productId: p.id,
      fgCode: p.fgCode || null,
      productName: p.productDescription || p.fgCode || p.id,
      customerId: p.customerId || null,
      customerName: p.customerName || null,
      formulaName: String(p.formulaName).trim(),
      formulaCode: String(p.formulaCode ?? '').trim() || null,
      formulaDate: p.formulaDate || null,
    }));
}
