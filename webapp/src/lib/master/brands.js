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

// แปลงทั้ง array → [{th,en}] : ตัด th ว่างทิ้ง + dedupe ตาม th (case-insensitive).
// ใช้ที่ฝั่ง API ก่อนบันทึก และที่ฟอร์มก่อนส่ง.
export function normalizeBrands(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    const th = brandTh(raw);
    if (!th) continue;
    const key = th.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ th, en: brandEn(raw) });
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

// ป้ายชื่อแบรนด์สำหรับ "แสดงผล" (ทั้งเว็บ): โชว์อังกฤษก่อน ถ้าไม่มีค่อยไทย (en || th).
export function brandLabel(th, en) {
  return (en || "").trim() || (th || "").trim();
}

// เวอร์ชันรับสมาชิก brand ตัวเดียว (string หรือ {th,en}).
export function brandLabelOf(b) {
  return brandLabel(brandTh(b), brandEn(b));
}

// หา EN ที่คู่กับชื่อ TH หนึ่งๆ ใน brands ของลูกค้า (ใช้ auto-fill ตอนเลือกแบรนด์
// ในฟอร์มสินค้า). ไม่พบ/ไม่มี EN → "".
export function brandEnFor(brands, th) {
  const key = brandTh(th).toLowerCase();
  if (!key || !Array.isArray(brands)) return "";
  const hit = brands.find((b) => brandTh(b).toLowerCase() === key);
  return hit ? brandEn(hit) : "";
}
