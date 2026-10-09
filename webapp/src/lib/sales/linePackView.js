// ── เลขแพ็คของบรรทัด: ของที่ "ตัวอ่าน" ใช้ (งวด PR-2 · docs/qt-pack-column.md) ───────────────────────────────
//
// ⭐ กฎของงวดนี้: ทุกที่ที่อ่านบรรทัดใบเสนอราคา/ใบสั่งขายแล้วโชว์หรือใช้ จำนวน · หน่วย · ราคา · ยอด
//   ต้องถูกสำหรับบรรทัดที่มีเลขแพ็ค และ **เหมือนเดิมทุกตัวอักษร** สำหรับใบ/จอที่ไม่มีบรรทัดไหนมีเลขแพ็ค
//   - ตัวที่ "นับหน่วย" ใช้ `lineUnitsTotal(line)` ของ linePacks.js (แพ็ค × จำนวน)
//   - ตัวที่ "โชว์" ใช้ตัวช่วยของไฟล์นี้ — ตัวที่คืนข้อความ **คืน null เมื่อบรรทัดไม่มีเลขแพ็ค** โดยตั้งใจ:
//     ผู้เรียกเขียน `ตัวช่วย(line) ?? <นิพจน์เดิม>` เสมอ ⇒ ข้อความของบรรทัดเดิมไม่ถูกแตะแม้ตัวอักษรเดียว
//
// 🪤 ไฟล์นี้ import ได้สามตัวเท่านั้น (เทสต์ยึด): format · master/units · linePacks
//   ห้าม import salesPlanning / quoteLines / serviceOrders / serviceSetup — ไฟล์เหล่านั้น (หรือผู้เรียกของมัน) เรียกไฟล์นี้
//   ⇒ คำที่ต้องตรงกับไฟล์เหล่านั้นเขียนเป็นค่าตรง ๆ แล้วให้ linePackView.test.mjs ยึด
import { fmtNumber } from '@/lib/format';
import { saleUnitLabel } from '@/lib/master/units';
import { PACK_LINE_UNIT, packQtyValue } from '@/lib/sales/linePacks';

/** หัวคอลัมน์บนจอ บนไฟล์ Excel และบนกระดาษไทย (มติ A2) — ที่เดียว ห้ามพิมพ์คำนี้ซ้ำที่อื่น */
export const PACK_COLUMN_LABEL = 'แพ็ค/เดือน';
/** คำว่า "แพ็ค" ของ "2 แพ็ค" และหน่วยของยอดหน่วยรวมของบรรทัดที่มีเลขแพ็ค — คำเดียวกับตารางงานบริการ (เทสต์ยึด) */
export const PACK_WORD = 'แพ็ค';

const PACK_WORD_EN = 'Pack';
const TIMES = ' × '; // U+00D7 มีในฟอนต์เอกสารที่ฝัง (เทสต์ยึด)

/** เลขแพ็คที่ตัวอ่านโชว์: จำนวนเต็ม 1–9999 · ว่างหรือค่าที่เก็บไม่ได้ = null (ไม่โชว์คอลัมน์ · ไม่คูณอะไร) */
export function linePackQty(line) {
  const value = packQtyValue(line?.packQty);
  return typeof value === 'number' ? value : null;
}

/** บรรทัดนี้มีเลขแพ็คไหม */
export function lineHasPacks(line) {
  return linePackQty(line) !== null;
}

/** ตัดสิน **ทั้งใบ/ทั้งตาราง**: มีอย่างน้อยหนึ่งบรรทัดที่มีเลขแพ็ค · ไม่ใช่อาร์เรย์ = false */
export function hasPackColumn(lines) {
  return Array.isArray(lines) && lines.some(lineHasPacks);
}

/** หน่วยของ `lineUnitsTotal(line)`: บรรทัดที่มีเลขแพ็ค = "แพ็ค" · นอกนั้นคืนหน่วยที่ส่งมาตามเดิม (null ก็คืน null) */
export function lineUnitsUnit(line, unit) {
  return lineHasPacks(line) ? PACK_WORD : unit;
}

/** สูตรใต้ยอดของบรรทัด: "2 × 12 × 3,500.00" · บรรทัดไม่มีเลขแพ็ค = null (ผู้เรียกไม่วาดอะไร) */
export function linePackFormulaText(line) {
  const pack = linePackQty(line);
  if (pack === null) return null;
  const price = fmtNumber(Number(line?.unitPrice) || 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return [fmtNumber(pack), fmtNumber(Number(line?.qty) || 0), price].join(TIMES);
}

/** จำนวนของบรรทัดที่มีเลขแพ็คในวลีเดียว: "2 แพ็ค × 12 เดือน" · language 'en' = "2 Pack × 12 Month" · ไม่มีเลขแพ็ค = null */
export function linePackQtyText(line, language = 'th') {
  const pack = linePackQty(line);
  if (pack === null) return null;
  const packWord = String(language) === 'en' ? PACK_WORD_EN : PACK_WORD;
  return [
    `${fmtNumber(pack)} ${packWord}`,
    `${fmtNumber(Number(line?.qty) || 0)} ${saleUnitLabel(PACK_LINE_UNIT, language)}`,
  ].join(TIMES);
}
