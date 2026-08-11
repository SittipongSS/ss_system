// ── เช็คสินค้าซ้ำ: ลูกค้า + ชื่อ + ขนาดบรรจุ ──────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-12: "สินค้าจะเช็คซ้ำยังไง ลูกค้า 1 หลายสินค้าได้"
//
// **รหัส FG กันซ้ำไม่ได้อีกแล้ว** ตั้งแต่มีสวิตช์ระบบใหม่ (mig 0230): เลขรันออกใหม่ทุก
// ครั้ง ⇒ กดเพิ่มสินค้าตัวเดิมซ้ำสิบรอบก็ผ่านหมด ได้สิบรหัส — ช่องเดียวกับที่รหัส AR
// เคยเปิดไว้ฝั่งลูกค้า (ดู customerTaxId.js)
//
// **ลูกค้ารายเดียวมีหลายสินค้าเป็นเรื่องปกติ** ตัวตนของสินค้าจึงไม่ใช่ "ลูกค้า" เดี่ยว ๆ
// วัดจากแคตตาล็อกจริง 143 แถว (2026-08-12):
//   ลูกค้า + ชื่ออังกฤษ            ชนกัน 22 กลุ่ม / 45 แถว
//   ลูกค้า + ชื่อ + **ขนาดบรรจุ**  ชนกัน **0**
// 22 กลุ่มนั้นต่างกันที่ขนาดทั้งหมด (เช่น "Glenn Eau De Parfum" 5ml กับ 30ml) ซึ่งเป็น
// คนละ SKU ที่ถูกต้อง ⇒ **ขนาดเป็นส่วนหนึ่งของตัวตน** ไม่ใช่รายละเอียดปลีกย่อย
//
// ⚠️ สูตรไม่ได้อยู่ในคีย์ ทั้งที่เป็นตัวชี้ที่แม่นกว่าชื่อ — เพราะวันที่ตัดสิน **ยังไม่มี
// สินค้าผูกทะเบียนสูตรสักแถว** (0/143) คีย์ที่ไม่มีวันมีค่าคือคีย์ที่ไม่มีวันเตือน ·
// เมื่อ Product Spec ผูกสูตรเข้า FG แล้ว ค่อยเพิ่มเป็นชั้นที่สอง
//
// ⚠️ **เตือน ไม่บล็อก** (มติผู้ใช้): มีเคสจริงที่ตั้งใจซ้ำ — เปลี่ยนบรรจุภัณฑ์แล้วออก
// รหัสใหม่ · ออกรหัสใหม่แทนตัวที่เลิกใช้ · และมีด่านอนุมัติของหัวหน้าคั่นอยู่แล้ว
//
// ไม่มี import ฝั่ง server — ฟอร์มเรียกได้ตรง ๆ
export const normalizeProductName = (value) =>
  String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// ขนาดบรรจุที่ใช้เทียบ — ตัวเลขเทียบเป็นตัวเลข ('50' กับ '50.0' คือขนาดเดียวกัน)
// หน่วยเทียบแบบไม่สนตัวพิมพ์ ('ML' กับ 'ml')
export function sizeKeyOf({ volume, volumeUnit } = {}) {
  const size = Number(volume);
  if (!Number.isFinite(size) || size <= 0) return null;
  return `${size}|${String(volumeUnit ?? '').trim().toLowerCase()}`;
}

// ชื่อตรงกันไหม — ตรง **ภาษาใดภาษาหนึ่ง** ก็ถือว่าใช่ (ฟอร์มบังคับแค่ 1 ภาษา แถวที่
// กรอกคนละภาษากันจึงเทียบกันได้เท่าที่มี) · ช่องว่างไม่นับว่าตรงกัน ไม่งั้นสินค้าทุกตัว
// ที่ยังไม่ได้กรอกชื่ออังกฤษจะกลายเป็นซ้ำกันหมด
export function productNameMatches(a, b) {
  const th = normalizeProductName(a?.productDescription);
  const en = normalizeProductName(a?.productDescriptionEn);
  const rowTh = normalizeProductName(b?.productDescription);
  const rowEn = normalizeProductName(b?.productDescriptionEn);
  return (!!th && th === rowTh) || (!!en && en === rowEn);
}

/**
 * แยกสินค้าของลูกค้ารายนี้ที่ "ชื่อตรงกัน" ออกเป็นขนาดเดียวกัน กับ ขนาดอื่น
 *
 * @param rows สินค้าของลูกค้ารายนั้น (ผู้เรียกโหลดมาแล้ว)
 * @param form ค่าที่กำลังกรอก (ชื่อ TH/EN + ปริมาตร + หน่วย) · excludeId = ตัวเอง (โหมดแก้)
 */
export function splitProductMatches(rows, form = {}, { excludeId = null } = {}) {
  const size = sizeKeyOf(form);
  return (rows || []).reduce((acc, row) => {
    if (!row || row.id === excludeId) return acc;
    if (!productNameMatches(form, row)) return acc;
    acc[size && sizeKeyOf(row) === size ? 'sameSize' : 'otherSize'].push(row);
    return acc;
  }, { sameSize: [], otherSize: [] });
}

const labelOf = (row) => {
  const size = Number(row?.volume);
  const unit = String(row?.volumeUnit ?? '').trim();
  return [row?.fgCode, Number.isFinite(size) && size > 0 ? `${size}${unit ? ` ${unit}` : ''}` : null]
    .filter(Boolean).join(' · ');
};

// ซ้ำจริง (ชื่อ + ขนาดตรง) — เตือน ไม่บล็อก
export function productDuplicateWarning(rows) {
  if (!rows?.length) return null;
  const list = rows.slice(0, 3).map(labelOf).join(' · ');
  const more = rows.length > 3 ? ` และอีก ${rows.length - 3} รายการ` : '';
  return `ลูกค้ารายนี้มีสินค้าชื่อนี้ขนาดนี้อยู่แล้ว: ${list}${more}`
    + ' — ถ้าเป็นตัวเดิม ให้แก้ที่รายเดิมแทนการเพิ่มรหัสใหม่';
}

// ชื่อเดียวกันแต่คนละขนาด = ของปกติ (ตระกูลเดียวกันคนละ SKU) — บอกไว้เฉย ๆ ไม่ใช่คำเตือน
export function productOtherSizeHint(rows) {
  if (!rows?.length) return null;
  const sizes = [...new Set(rows.map((row) => {
    const size = Number(row?.volume);
    return Number.isFinite(size) && size > 0 ? `${size} ${String(row?.volumeUnit ?? '').trim()}`.trim() : null;
  }).filter(Boolean))];
  if (!sizes.length) return null;
  return `ชื่อนี้มีอยู่แล้วที่ขนาด ${sizes.join(' · ')} — เพิ่มขนาดใหม่ได้ตามปกติ`;
}
