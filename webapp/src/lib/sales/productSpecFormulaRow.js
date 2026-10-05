// ── FM-SA-04: แถว "สูตร / รหัสสูตร / วันที่" ของ Product Overview — ตัวประกอบตัวเดียวของกระดาษและจอ ──
//
// ⭐ **มติเจ้าของ 01/10/2569** — แถว "กลิ่น / รหัสกลิ่น" บนกระดาษเปลี่ยนเป็น **"สูตร / รหัสสูตร / วันที่"**
//   · พิมพ์ **สูตรที่ FG ผูกอยู่จริง** (ชื่อสูตร · รหัสสูตร · วันที่ของสูตร) ไม่ใช่กลิ่นแม่
//     🐞 ของจริงบน prod: FG-0510-02-020-10067 พิมพ์ "THE MOMENT OF TEA TIME #3 | PF859010103" (กลิ่น) ทั้งที่ FG ผูกสูตร
//        "THE MOMENT OF TEA TIME #3.1 REV1" / PF85901010301 / 10/09/2569 — กลิ่นหนึ่งมีได้หลายสูตร (รอบแก้งาน ·
//        `formulas.derivedFromFormulaId`) ฝ่ายผลิตต้องรู้ว่าเป็นสูตรตัวไหน
//   · FG ที่ไม่ผูกสูตร **แต่มีกลิ่นให้พิมพ์** ⇒ ถอยไปกลิ่นแบบเดิมทั้งแถว (ป้าย "กลิ่น / รหัสกลิ่น" + ชื่อ | รหัส)
//   · FG ที่ไม่มีทั้งสูตรและกลิ่น ⇒ **ป้ายใหม่** ช่องว่าง (กระดาษ N/A · จอขีด) — แถวนี้ชื่อ "สูตร / รหัสสูตร / วันที่" แล้ว
//   · ชิ้นที่ไม่มีเป็นขีด (สูตรที่ยังไม่มีรหัส เช่น "Secret Valley #1") — ไม่ทิ้งตัวคั่นลอย
//   · เอกสารที่อนุมัติแล้วไม่เปลี่ยน (ตรึงเป็น frozenHtml) · มีผลกับใบที่ยื่นตั้งแต่นี้
//
// ⚠️ **ป้ายกลิ่นเหลือเฉพาะแถวที่พิมพ์กลิ่นจริง** — ไม่พิมพ์รหัสกลิ่นใต้คำว่า "รหัสสูตร" (กระดาษใบนี้ลูกค้าเซ็น และฝ่ายผลิต
//    อ่านรหัสในแถวนี้ไปหยิบสูตร — ป้ายผิดชนิด = หยิบผิดตัว) · เหตุผลนี้ใช้ได้ **เมื่อมีค่ากลิ่นถูกพิมพ์** เท่านั้น
//    🐞 รอบแรกคงป้ายกลิ่นไว้ทุกครั้งที่ FG ไม่ผูกสูตร ⇒ บน prod (01/10: สินค้า 593 · ผูกสูตร 4 · FG ที่ไม่ผูกสูตรไม่มีตัวไหน
//       มีกลิ่นเลย · สินค้าที่มีสเปคทั้ง 8 ตัวไม่มีทั้งสูตรและกลิ่น) ทุกใบที่พิมพ์ได้จริงยังขึ้น "กลิ่น / รหัสกลิ่น · N/A"
//       เหมือนเดิมทุกตัวอักษร = มติเปลี่ยนชื่อแถวมองไม่เห็นเลย ⇒ ช่องว่างใช้ป้ายใหม่
// ⚠️ **ไม่มี "ข้อความที่ประกอบแล้ว" เก็บในภาพนิ่ง** (ต่างจาก `scentText`) — วันที่ของสูตรพิมพ์ตามภาษาของใบ
//    (ไทย พ.ศ. · อังกฤษ ค.ศ.) ซึ่งรู้ตอนพิมพ์ · ประกอบค้างไว้ = ตรึงปีไว้แบบเดียว แล้วใบอังกฤษพิมพ์ พ.ศ.
//    ⇒ ภาพนิ่งเก็บ **ชิ้นดิบ** (`formulaId` · `formulaName` · `formulaCode` · `formulaDate`) ตัวนี้ประกอบตอนใช้
// ⚠️ ไฟล์นี้ต้องเบา — จอ (`ProductSpecForm` เป็น client component) เรียกตัวเดียวกับกระดาษ ⇒ ห้าม import เปลือกเอกสาร
//    (`documentShell` ฝังฟอนต์/โลโก้ทั้งชุด) หรืออะไรที่เป็นของฝั่ง server
import { BUDDHIST_YEAR_OFFSET, fmtDateNumeric } from '@/lib/format';

/**
 * วันที่บนกระดาษ — DD/MM/YYYY ตามนาฬิกาไทย · **ใบไทย = พ.ศ. · ใบอังกฤษ = ค.ศ.** (มติ 22/09)
 *
 * ⚠️ ผ่าน `fmtDateNumeric` (วันไทยของจุดเวลา · วันในปฏิทินไม่ขยับโซน) แล้วค่อยบวกปี —
 *    ห้ามตัด `slice(0, 10)` จากจุดเวลาเอง ไม่งั้นกระดาษที่ยื่นช่วงตี 0–7 ได้วันที่ของเมื่อวาน
 * ⭐ ตัวจัดวันที่ตัวเดียวของทั้งใบ (หัว · กำหนดส่ง · ลายเซ็น · วันที่ของสูตร) — ย้ายมาจาก `productSpecDocument.js`
 *    (ที่นั่นยัง export ต่อให้ผู้เรียกเดิม) เพื่อให้จอประกอบแถวสูตรได้โดยไม่ลากเปลือกเอกสารเข้า bundle
 * @param language ภาษาของใบ (`'th'` ตั้งต้น — ค่าอื่นที่ไม่ใช่ `'en'` ถือเป็นไทย แบบ `docLanguageOf`)
 * @returns {string|null} `null` = ไม่มีวันที่ (ช่องนั้นพิมพ์ขีด/ว่างตามบล็อก)
 */
export function productSpecDateText(value, language = 'th') {
  if (value === null || value === undefined || value === '') return null;
  const match = String(fmtDateNumeric(value)).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const year = language === 'en' ? Number(match[3]) : Number(match[3]) + BUDDHIST_YEAR_OFFSET;
  return `${match[1]}/${match[2]}/${year}`;
}

/* ป้ายแถว — ชุดเดียวทั้งสองภาษา (มติเจ้าของ: ป้ายแถวในตารางไม่แปล · เปลี่ยนเฉพาะหัวข้อ) */
export const PRODUCT_SPEC_FORMULA_ROW_LABEL = 'สูตร / รหัสสูตร / วันที่';
export const PRODUCT_SPEC_SCENT_ROW_LABEL = 'กลิ่น / รหัสกลิ่น';

/* ตัวคั่นเดียวกับแถวกลิ่นเดิม ("ชื่อ | รหัส") · ชิ้นที่ไม่มี = ขีดแบบที่ใบนี้ใช้ในค่าที่ประกอบจากหลายชิ้น
   (ผู้ติดต่อ "- · 08x…" ของกล่องผู้ซื้อ) — ไม่ใช่ N/A ซึ่งเป็นของช่องที่ว่างทั้งช่อง */
const PART_SEPARATOR = ' | ';
const MISSING_PART = '-';

const textOf = (value) => String(value ?? '').trim();

/* ภาพนิ่งที่ยื่นก่อน 01/10/2569 = ก้อนสินค้าที่ **ไม่มีคีย์ `formulaId`** — ตั้งแต่วันนั้น `loadProductPrintFields` ใส่คีย์ช่องสูตร
   ครบทั้งสี่เสมอ (ไม่ผูก = null · เทสต์ของ store ตรึงไว้) ⇒ "มีคีย์" คือสัญญาณเดียวที่แยกของใหม่ออกจากของเก่าได้
   ⚠️ ไม่มีก้อนสินค้าเลย (null/undefined — จอที่ยังโหลดไม่เสร็จ) ไม่ใช่ภาพนิ่งเก่า */
const predatesFormulaRow = (product) => typeof product === 'object' && product !== null && !('formulaId' in product);

/**
 * แถวสูตรของ Product Overview — ป้าย + ค่า พร้อมพิมพ์
 *
 * @param product ก้อนสินค้าของภาพนิ่ง / `loadProductPrintFields` (`formulaId` · `formulaName` · `formulaCode` ·
 *   `formulaDate` · `scentText`)
 * @param language ภาษาของใบ — คุมปีของวันที่สูตรอย่างเดียว (ป้ายไม่แปล)
 * @returns {{ kind: 'formula'|'scent', label: string, value: string|null }} `value: null` = ช่องว่าง (กระดาษพิมพ์ N/A)
 *
 * สามทาง เรียงตามนี้:
 *   1. ผูกสูตรและมีชิ้นให้พิมพ์ ⇒ ป้ายสูตร + "ชื่อ | รหัส | วันที่" (ชิ้นที่ไม่มีเป็นขีด)
 *   2. มีกลิ่นให้พิมพ์ (`scentText`) หรือเป็นภาพนิ่งเก่า ⇒ แถวกลิ่นเดิม (ป้าย "กลิ่น / รหัสกลิ่น")
 *   3. ที่เหลือ (ของใหม่ที่ไม่มีทั้งสูตรและกลิ่น · ยังไม่มีก้อนสินค้า) ⇒ ป้ายสูตร ช่องว่าง
 *
 * ⭐ **ภาพนิ่งเก่า** (ยื่นก่อน 01/10/2569 — รออนุมัติ/ถูกตีกลับ) ไม่มีช่องสูตรเลย ⇒ ได้แถวกลิ่นจาก `scentText` ของมันเอง
 *    หน้าตาเดิมทุกตัวอักษร รวมใบที่กลิ่นว่าง (ป้ายกลิ่น + N/A) — ไม่ใช่ "- | - | -" และไม่เปลี่ยนป้ายของใบที่ยื่นไปแล้ว
 *    (ภาพนิ่งห้ามเขียนทับ ต้องอ่านของเก่าได้เสมอ)
 * ⚠️ ผูกสูตร = มี `formulaId` **และ** มีชิ้นให้พิมพ์อย่างน้อยหนึ่งชิ้น — สูตรที่ไม่มีอะไรเลยสักชิ้น (ไม่ควรเกิด ชื่อสูตรบังคับ)
 *    ถอยไปกลิ่น ดีกว่าพิมพ์ขีดสามตัว · ไม่มี `formulaId` ไม่เชื่อ `formulaName` ลอย ๆ — สินค้ารุ่นก่อนทะเบียนสูตร
 *    พิมพ์ *ชื่อกลิ่น* ไว้ในช่องนั้น (กอง "รอจัดระเบียบ" ของ scentFormulaAdmin)
 */
export function productSpecFormulaRow(product, language = 'th') {
  const name = textOf(product?.formulaName);
  const code = textOf(product?.formulaCode);
  const date = productSpecDateText(product?.formulaDate, language) || '';
  if (product?.formulaId && (name || code || date)) {
    return {
      kind: 'formula',
      label: PRODUCT_SPEC_FORMULA_ROW_LABEL,
      value: [name, code, date].map((part) => part || MISSING_PART).join(PART_SEPARATOR),
    };
  }
  const scent = textOf(product?.scentText);
  if (scent || predatesFormulaRow(product)) {
    return { kind: 'scent', label: PRODUCT_SPEC_SCENT_ROW_LABEL, value: scent || null };
  }
  return { kind: 'formula', label: PRODUCT_SPEC_FORMULA_ROW_LABEL, value: null };
}

/**
 * แถวสูตรทั้งหมดของ Product Overview — ชุดของขวัญได้หลายแถว · สินค้าอื่นได้แถวเดียว (`productSpecFormulaRow`)
 *
 * ⭐ มติผู้ใช้ 2026-10-05 (mig 0403): ชุดของขวัญ (01-037) ผูกได้หลายสูตร สูตรละหนึ่งหมวด ⇒ กระดาษพิมพ์
 *    **ทุกสูตร แถวละสูตร บอกหมวด** — ป้าย "สูตร 1 · น้ำหอมสำหรับผิวกาย" · ค่า "ชื่อ | รหัส | วันที่" รูปเดียวกับแถวสูตรเดี่ยว
 *    ลำดับ = ลำดับในชุดที่ตั้งไว้บนฟอร์มสินค้า · ป้ายไม่แปล (ชื่อหมวดไทยก่อน) เหมือนป้ายแถวอื่นของตาราง
 * ⚠️ `formulaComponents` มีเฉพาะก้อนของชุดของขวัญ (`loadProductPrintFields`) — ไม่มีคีย์/อาเรย์ว่าง = ทางเดิมทุกตัวอักษร
 *    (ชุดที่ยังไม่ผูกสูตรสักตัวจึงได้แถว "สูตร / รหัสสูตร / วันที่" ช่องว่างเหมือน FG ที่ไม่ผูกสูตร)
 * @returns {Array<{ kind: 'formula'|'scent', label: string, value: string|null }>}
 */
export function productSpecFormulaRows(product, language = 'th') {
  const parts = Array.isArray(product?.formulaComponents) ? product.formulaComponents : [];
  if (!parts.length) return [productSpecFormulaRow(product, language)];
  return parts.map((row, index) => {
    const pieces = [textOf(row?.formulaName), textOf(row?.formulaCode), productSpecDateText(row?.formulaDate, language) || ''];
    const category = textOf(row?.categoryName) || textOf(row?.categoryCode);
    return {
      kind: 'formula',
      label: `สูตร ${index + 1}${category ? ` · ${category}` : ''}`,
      value: pieces.some(Boolean) ? pieces.map((part) => part || MISSING_PART).join(PART_SEPARATOR) : null,
    };
  });
}
