/* ป้ายกลิ่น/สูตร — "PF · ชื่อ · วันที่" ทรงเดียวทั้งระบบ (มติเจ้าของ 13/11/2026)
   ─────────────────────────────────────────────────────────────────────────────
   ก่อนหน้านี้แต่ละจอประกอบป้ายเอง ⇒ บางจอ "รหัส · ชื่อ" บางจอ "ชื่อ · รหัส"
   บางจอรหัสอย่างเดียว บางจอชื่ออย่างเดียว และไม่มีจอไหนบอกวันที่ ⇒ กลิ่นชื่อซ้ำกัน
   คนละรอบ (Citrus Dawn ปี 68 กับปี 69) แยกไม่ออกจากช่องเลือก

   มติ:
   - ทุกจุดที่ชี้ถึงกลิ่นหรือสูตร = **PF · ชื่อ · วันที่** ครบสามท่อนเสมอ
   - ตาราง: รหัสบรรทัดบน (กฎ "รหัสบน · ชื่อล่าง" มติ 12/08 ยังอยู่) · บรรทัดล่าง = ชื่อ · วันที่
   - วันที่ของ **กลิ่น = วันที่ผลิต** (`producedAt` · กรอกแล้ว 448/500 ณ 13/11)
     ไม่ใช่วันส่งลูกค้า (`sentAt` · 183/500) — วันส่งยังโชว์แยกได้ในจอที่บอกสถานะการส่ง
   - วันที่ของ **สูตร = วันที่สูตร** (`formulaDate`)
   - ท่อนที่ว่างไม่หายไปเฉย ๆ: ไม่มีรหัส = "ไม่มี PF" (คำเดิมของตารางทะเบียน) ·
     ไม่มีวันที่ = ขีด (กติกาค่าว่างทั้งระบบ) — คนต้องเห็นว่า "ขาด" ไม่ใช่ "ไม่มีช่องนี้"

   ⚠️ ป้ายที่ประกอบจากสำเนาบนแถวอื่น (เช่น products.scentCode/scentName) ต้องส่ง
   วันที่เข้ามาเองผ่าน `{ code, name, date }` — สำเนาพวกนั้นไม่ได้เก็บวันผลิตกลิ่นไว้ */
import { fmtDate, NA } from '../format.js';

export const NO_PF = 'ไม่มี PF';
export const LABEL_SEP = ' · ';

const text = (v) => String(v ?? '').trim();

/** วันที่ที่ใช้บนป้ายกลิ่น — วันที่ผลิตเท่านั้น (ดูหัวไฟล์) */
export const scentLabelDate = (scent) => scent?.producedAt || null;
/** วันที่ที่ใช้บนป้ายสูตร */
export const formulaLabelDate = (formula) => formula?.formulaDate || null;

/** สามท่อนของป้าย — ใช้เมื่อจอต้องจัดวางเอง (ตาราง: รหัสบน · ชื่อ+วันล่าง) */
export function registryLabelParts({ code, name, date } = {}) {
  return {
    code: text(code) || NO_PF,
    hasCode: Boolean(text(code)),
    name: text(name) || NA,
    date: date ? fmtDate(date) : NA,
    hasDate: Boolean(date),
  };
}

/** "PF · ชื่อ · วันที่" จากท่อนดิบ */
export function registryLabel(parts = {}) {
  const p = registryLabelParts(parts);
  return [p.code, p.name, p.date].join(LABEL_SEP);
}

/** บรรทัดล่างของเซลล์ตาราง: "ชื่อ · วันที่" */
export function registryLabelSub(parts = {}) {
  const p = registryLabelParts(parts);
  return [p.name, p.date].join(LABEL_SEP);
}

export const scentLabelParts = (s) =>
  registryLabelParts({ code: s?.code, name: s?.name, date: scentLabelDate(s) });
export const formulaLabelParts = (f) =>
  registryLabelParts({ code: f?.code, name: f?.name, date: formulaLabelDate(f) });

export const scentLabel = (s) => registryLabel({ code: s?.code, name: s?.name, date: scentLabelDate(s) });
export const formulaLabel = (f) => registryLabel({ code: f?.code, name: f?.name, date: formulaLabelDate(f) });

export const scentLabelSub = (s) => registryLabelSub({ name: s?.name, date: scentLabelDate(s) });
export const formulaLabelSub = (f) => registryLabelSub({ name: f?.name, date: formulaLabelDate(f) });

/** ข้อความค้นหาของช่องเลือก — ตาเห็นบนแถว = ต้องค้นเจอ (รวมวันที่ทั้งรูปที่โชว์และรูปดิบ) */
export function registrySearchText({ code, name, date } = {}, ...extra) {
  return [text(code), text(name), date ? fmtDate(date) : '', text(date), ...extra.map(text)]
    .filter(Boolean)
    .join(' ');
}
export const scentSearchText = (s, ...extra) =>
  registrySearchText({ code: s?.code, name: s?.name, date: scentLabelDate(s) }, ...extra);
export const formulaSearchText = (f, ...extra) =>
  registrySearchText({ code: f?.code, name: f?.name, date: formulaLabelDate(f) }, ...extra);
