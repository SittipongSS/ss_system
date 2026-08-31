// ── แบรนด์สองภาษา (TH/EN) ─────────────────────────────────────────────
// customers.brands[] เดิมเป็น array ของ "ข้อความ" (ชื่อ TH ล้วน) — migration 0059
// แปลงเป็น array ของ object {th, en}. helper นี้อ่านได้ทั้งสองรูป เพื่อไม่ให้
// โค้ดที่ยังไม่รัน migration หรือแถวเก่าพัง (defensive normalize ทุกจุดที่ใช้).

import { categoryOf } from "@/lib/master/categoryOf";

// ชื่อ TH ของสมาชิกแบรนด์หนึ่งตัว (รับได้ทั้ง "ABC" และ {th,en}).
export function brandTh(b) {
  if (b == null) return "";
  if (typeof b === "string") return b.trim();
  return (b.th || "").trim();
}

// ชื่อ EN (รูปเก่า string ไม่มี EN → "").
export function brandEn(b) {
  if (b == null || typeof b === "string") return "";
  return (b.en || "").trim();
}

// แปลงสมาชิกหนึ่งตัวให้เป็น {th, en} เสมอ.
export function normalizeBrand(b) {
  return { th: brandTh(b), en: brandEn(b) };
}

// แปลงทั้ง array → [{th,en}] : เก็บถ้ามี th "หรือ" en (แบรนด์ EN-only ได้),
// ตัดเฉพาะแถวที่ว่างทั้งคู่ + dedupe ตามคีย์ th||en (case-insensitive).
// ใช้ที่ฝั่ง API ก่อนบันทึก และที่ฟอร์มก่อนส่ง.
export function normalizeBrands(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    const th = brandTh(raw);
    const en = brandEn(raw);
    if (!th && !en) continue;
    const key = (th || en).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ th, en });
  }
  return out;
}

// รายการชื่อ TH (unique, เรียง ก-ฮ/A-Z) สำหรับ dropdown/ค้นหา — จาก brands ลูกค้าคนเดียว
// หรือหลายคน (flatten). ใช้แทน pattern `(brands||[]).map(b=>b.trim())` เดิมทั่วเว็บ.
export function brandThList(brandsArrays) {
  const flat = Array.isArray(brandsArrays) ? brandsArrays : [];
  const names = flat.map(brandTh).filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

// กฎแสดงผลแบรนด์ทั้งระบบ: ชื่อทางการ EN ก่อน ถ้าไม่มีค่อย TH.
// ทั้งสองภาษายังอยู่ใน search ของตัวเลือก แต่ไม่แสดงซ้ำให้หน้าจอรก.
export function brandLabel(th, en) {
  const t = (th || "").trim();
  const e = (en || "").trim();
  return e || t;
}

// เวอร์ชันรับสมาชิก brand ตัวเดียว (string หรือ {th,en}).
export function brandLabelOf(b) {
  return brandLabel(brandTh(b), brandEn(b));
}

// ชื่อเดิมคงไว้เพื่อ compatibility กับจุดเรียกเก่า แต่ใช้กฎภาษาเดียวชุดกลาง.
export function brandBoth(th, en) {
  return brandLabel(th, en);
}
export function brandBothOf(b) {
  return brandBoth(brandTh(b), brandEn(b));
}

// Dropdown เก็บ legacy value เดิม แต่แสดงภาษาเดียวและค้นได้ทั้ง TH/EN.
export function brandSelectOptions(brands) {
  return normalizeBrands(brands).map((brand) => ({
    value: brand.th || brand.en,
    label: brandBothOf(brand),
    search: `${brand.th} ${brand.en}`.trim(),
  }));
}

// Resolve legacy value (often TH-only) against customer brand master.
export function brandDisplayFromList(brands, value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const key = text.toLocaleLowerCase("th-TH");
  const match = normalizeBrands(brands).find((brand) =>
    brand.th.toLocaleLowerCase("th-TH") === key
    || brand.en.toLocaleLowerCase("en-US") === key
    || brandBothOf(brand).toLocaleLowerCase("th-TH") === key
  );
  return match ? brandBothOf(match) : text;
}

// หา EN ที่คู่กับชื่อ TH หนึ่งๆ ใน brands ของลูกค้า (ใช้ auto-fill ตอนเลือกแบรนด์
// ในฟอร์มสินค้า). ไม่พบ/ไม่มี EN → "".
export function brandEnFor(brands, th) {
  const key = brandTh(th).toLowerCase();
  if (!key || !Array.isArray(brands)) return "";
  const hit = brands.find((b) => brandTh(b).toLowerCase() === key);
  return hit ? brandEn(hit) : "";
}

// ── กลุ่มหลักที่ "มีแบรนด์ให้พูดถึง" (มติผู้ใช้ 2026-08-21) ──────────────────
// 03 ค่าออกแบบ · 04 รายได้อื่นๆ ไม่ใช่ของที่วางขายใต้แบรนด์ของลูกค้า แต่เป็นค่าบริการ
// ที่ออกให้ลูกค้าหนึ่งรายต่อหมวดรอง (รหัสไม่มีเลขรันด้วยเหตุผลเดียวกัน — masterCodes.js)
// ⇒ **ฟอร์มไม่มีช่องแบรนด์เลย** ไม่ใช่แค่ไม่บังคับกรอก · เหตุผลเดียวกับที่ถอดช่อง
// ปริมาตร/หน่วยบรรจุออกจากสองกลุ่มนี้ (units.js): ช่องบังคับที่ไม่มีคำตอบจริง คนกรอก
// จะหาอะไรมาใส่ให้ผ่าน แล้วทะเบียนก็เก็บค่าหลอกไว้ทั้งชุด
//
// ⚠️ เลขหมวดตายตัวชุดเดียวกับ PACKAGING_MAIN_CATEGORIES (units.js) — ไม่รู้หมวด =
// ถือว่ามี เพื่อไม่ให้ช่องหายเงียบ ๆ กับแถวเก่าที่อ่านหมวดไม่ออก
export const BRAND_MAIN_CATEGORIES = Object.freeze(["01", "02"]);

/**
 * สินค้าตัวนี้มีช่องแบรนด์ไหม — รับได้ทั้ง record ({ categoryCode, fgCode, hasBrand })
 * และรหัสหมวดตรง ๆ ('03-001' หรือ '03')
 *
 * ⭐ กลุ่ม 02 ธุรกิจบริการ: แบรนด์เลือกได้ว่ามีหรือไม่มี **ต่อสินค้าหนึ่งตัว** ผ่านสวิตช์
 * บนฟอร์ม (record.hasBrand, mig 0325) — กลุ่ม 01 ยังบังคับเหมือนเดิม ไม่มีสวิตช์
 * รับแค่รหัสหมวดเป็นสตริง (ไม่รู้ hasBrand) = ถือว่ามี เหมือนกฎ "ไม่รู้ = มี" เดิม
 */
export function hasBrandField(recordOrCode) {
  const isRecord = recordOrCode !== null && typeof recordOrCode === "object";
  const raw = isRecord
    ? (recordOrCode.categoryCode || categoryOf(recordOrCode.fgCode))
    : recordOrCode;
  const mainCode = String(raw || "").slice(0, 2);
  if (!mainCode) return true;
  if (!BRAND_MAIN_CATEGORIES.includes(mainCode)) return false;
  if (mainCode === "02" && isRecord && recordOrCode.hasBrand === false) return false;
  return true;
}

// ช่องแบรนด์ที่ต้องล้างเมื่อสินค้าอยู่กลุ่มที่ไม่มีแบรนด์ — ใช้ทั้งตอนสร้างและตอนแก้
// (ฝั่ง server) · ซ่อนช่องบนจออย่างเดียวไม่พอ: POST/PATCH ยิงตรงได้ และสินค้าที่ย้าย
// หมวดข้ามกลุ่มจะพาชื่อแบรนด์เก่าติดไปโผล่บนเอกสารของหมวดที่ไม่มีแบรนด์
export const BRAND_FIELDS = Object.freeze(["brandName", "brandNameEn"]);

/** คืน patch ที่ล้างช่องแบรนด์ (ว่างเปล่าเมื่อกลุ่มนั้นมีแบรนด์อยู่แล้ว) */
export function clearedBrandFields(recordOrCode) {
  if (hasBrandField(recordOrCode)) return {};
  return Object.fromEntries(BRAND_FIELDS.map((key) => [key, null]));
}
