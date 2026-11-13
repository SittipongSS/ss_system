// ── ตัวกรองหน้าทะเบียนสูตร — จอกับไฟล์ Excel ใช้ตัวเดียว (ม-158 · มติเจ้าของ 03/11/2026) ─────────────────
//
// ⭐ ไฟล์ Excel ทะเบียนสูตร = **เท่าที่ตาเห็นบนจอ** (กติกาเดียวกับ Excel ทะเบียนสินค้า · มติผู้ใช้ 2026-08-28)
//   ⇒ ตัวกรองต้องเป็นฟังก์ชันเดียว · ยกออกมาจากหน้า `/database/formulas` เดิมทั้งก้อน ไม่เปลี่ยนพฤติกรรม
// ⚠️ ไฟล์นี้ไม่ยิง I/O — ผู้เรียกส่งหมวดสินค้า · ชื่อกลิ่น · แผนที่ AR มาเอง (จอโหลดอยู่แล้ว · route โหลดเอง)
import { customerSearchText } from '@/lib/master/customerAr';
import { categoryNameBoth, findCategoryByCode } from '@/lib/master/productCategoryOptions';
import { matchesFormulaSource } from '@/lib/master/formulas';
import { fmtDate } from '@/lib/format';

/**
 * @param formulas แถวจาก `loadFormulas`
 * @param filters `{ search, status, kind, source }` — ค่าเดียวกับตัวเลือกบนจอ ('' = ไม่กรอง · status 'open' = ไม่รวมเลิกใช้)
 * @param ctx `{ categories, scentNameOf, arIndex }`
 */
export function filterFormulas(formulas = [], { search = '', status = '', kind = '', source = '' } = {}, ctx = {}) {
  const { categories = [], scentNameOf = () => null, arIndex = null } = ctx;
  const q = String(search || '').trim().toLowerCase();
  return (formulas || []).filter((f) => {
    if (!matchesFormulaSource(f, source)) return false;
    if (status === 'open' && f.status === 'archived') return false;
    if (status && status !== 'open' && f.status !== status) return false;
    // ⚠️ ตัวกรองชนิดต้องอยู่ **ก่อน** ทางลัด `if (!q) return true` — วางหลังเมื่อไร
    // มันจะทำงานเฉพาะตอนมีคำค้น แล้วผู้ใช้จะเห็นตัวกรองที่กดแล้วไม่มีอะไรเกิดขึ้น
    if (kind === 'customer' && !f.customerId) return false;
    if (kind === 'base' && f.customerId) return false;
    if (!q) return true;
    // ค้นด้วยรหัสหมวดได้ด้วย · ชื่อที่ลูกค้าเรียกไม่อยู่ที่สูตรแล้ว (อยู่ที่กลิ่น · มติเจ้าของ 04/11)
    // ⭐ รหัส AR ค้นได้ด้วย — คนที่ถือรหัสลูกค้าอยากรู้ว่ารายนี้มีสูตรอะไรบ้าง
    return [
      f.name, f.code, customerSearchText(f.customerId, f.customerName, arIndex),
      f.categoryCode,
      // วันที่บนป้าย "PF · ชื่อ · วันที่" (มติเจ้าของ 13/11) — ตาเห็น = ค้นเจอ
      f.formulaDate ? fmtDate(f.formulaDate) : null,
      // ⭐ ลูกค้าที่ได้รับแชร์ (ม-150)
      ...(f.sharedCustomers || []).map((c) => customerSearchText(c.customerId, c.customerName, arIndex)),
      // ค้นชื่อหมวดได้ทั้งไทย/อังกฤษ ไม่ใช่แค่รหัส (มติ 2026-08-12)
      categoryNameBoth(findCategoryByCode(categories, f.categoryCode)),
      scentNameOf(f.scentId),
      // เลขที่คำร้องที่เป็นที่มาของสูตร — ขึ้นในคอลัมน์ "ที่มา" อยู่แล้ว และทะเบียน
      // กลิ่นค้นเจอตั้งแต่แรก · ขาดที่นี่ = คนถือเลขคำร้องหาสูตรที่มันผลิตไม่เจอ
      f.sourceRequest?.docNo,
      // ⭐ Ingredient List (ม-158) — คนถือชื่อสารอยากรู้ว่าสูตรไหนใช้
      f.ingredientList,
    ]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  });
}

/* ใหม่สุดขึ้นก่อน (มติผู้ใช้ 2026-09-02) — ลำดับเดียวกับตารางบนจอ */
export const sortFormulasNewestFirst = (rows = []) => [...rows]
  .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
