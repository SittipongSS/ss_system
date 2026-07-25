// ── แบรนด์สองภาษา (TH/EN) ─────────────────────────────────────────────
// customers.brands[] เดิมเป็น array ของ "ข้อความ" (ชื่อ TH ล้วน) — migration 0059
// แปลงเป็น array ของ object {th, en}. helper นี้อ่านได้ทั้งสองรูป เพื่อไม่ให้
// โค้ดที่ยังไม่รัน migration หรือแถวเก่าพัง (defensive normalize ทุกจุดที่ใช้).

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
