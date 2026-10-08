// ── อักขระที่ฟอนต์ของเอกสารพิมพ์ได้จริง — ตรรกะล้วน ไม่ import ฟอนต์ ─────────────────────────
//
// ⭐ กระดาษทุกใบฝัง Sarabun ชุด latin + thai สี่น้ำหนัก (`DOCUMENT_FONT_FACE_CSS` · lib/sales/quotationDocumentFonts.js)
//   อักขระที่ชุดนี้ไม่มี Chrome จะหยิบฟอนต์ของเครื่องมาแทน — เครื่องนักพัฒนาได้ Tahoma/Hiragino ·
//   chromium บน production มีแต่ Open Sans ⇒ **กล่องสี่เหลี่ยมบนกระดาษที่ตรึงแล้ว** (แก้ไม่ได้)
//
// 🔴 รายการนี้คือ **cmap จริงของฟอนต์** ไม่ใช่ `unicode-range` ของ CSS
//   `unicode-range` บอกเบราว์เซอร์แค่ว่า "ช่วงนี้ให้ลองฟอนต์นี้" — อักขระในช่วงที่ฟอนต์ไม่มี glyph ก็ยังตกไปฟอนต์อื่น
//   ของจริง (แกะ cmap 01/10/2026): U+2000–206F ประกาศไว้ทั้งช่วง 112 ตัว แต่มี glyph แค่ 15 ตัว
//   — ขีด U+2010–2012 "‰" "※" ไม่มี · "≤" "→" "⇒" ไม่มี (อยู่นอกช่วงด้วย)
//   ⚠️ กลับด้านก็หลุดเหมือนกัน: อักขระที่ cmap มีแต่อยู่ **นอก** `unicode-range` ของฟอนต์ตัวนั้น เบราว์เซอร์ไม่ใช้ฟอนต์นั้นพิมพ์
//   (CSS Fonts: effective character map = cmap ∩ unicode-range) ⇒ รายการนี้ = cmap ∩ unicode-range ของแต่ละตัว แล้วรวมกัน
//   ที่ตกออกไปเพราะข้อนี้: วรรณยุกต์ผสมของละติน U+0300 U+0301 U+0309 U+0323
//
// 🔑 เก็บเป็นช่วง (ไม่ import ฟอนต์ 84 KB เข้ามาคำนวณ) — ไฟล์นี้ถูกเรียกจากตัวกรองของเอกสารซึ่งต้องเบา
//   `documentFontRanges.test.mjs` แกะ cmap ของฟอนต์ทุกตัวใน `DOCUMENT_FONT_FACE_CSS` แล้วล้มเมื่อรายการนี้ต่างไป
//   ⇒ รัน `npm run gen:document-fonts` ใหม่เมื่อไร เทสต์จะบอกให้แก้ช่วงข้างล่างตาม (ข้อความที่ล้มพิมพ์ช่วงใหม่ให้ลอก)
//   ทุกน้ำหนัก (400/500/600/700) มีชุดเดียวกัน — เทสต์ล็อก: ตัวหนาต้องไม่ขาดอักขระที่ตัวปกติมี

const range = (from, to = from) => Object.freeze([from, to]);

/** ช่วง code point `[จาก, ถึง]` (รวมปลายทั้งสองข้าง) เรียงจากน้อยไปมาก ไม่ซ้อน ไม่ติดกัน — รวม 313 ตัว */
export const DOCUMENT_FONT_CODEPOINTS = Object.freeze([
  range(0x0000), range(0x000d),
  range(0x0020, 0x007e), // ASCII ที่พิมพ์ได้
  range(0x00a0, 0x00ff), // Latin-1: NBSP · "·" (B7) · "×" (D7) · "°" "²" "³" "½"
  range(0x0131), range(0x0152, 0x0153),
  range(0x02bb, 0x02bc), range(0x02c6), range(0x02da), range(0x02dc),
  range(0x0303, 0x0304), range(0x0308), range(0x0331),
  range(0x0e01, 0x0e3a), range(0x0e3f, 0x0e5b), // ไทย — ทุกตัวที่ Unicode กำหนด (0E3B–0E3E ว่าง)
  range(0x2013, 0x2014), // "–" "—" · ⚠️ ขีด U+2010–2012 ไม่มี
  range(0x2018, 0x201a), range(0x201c, 0x201e), // อัญประกาศโค้ง
  range(0x2022), range(0x2026), // "•" "…"
  range(0x2032, 0x2033), range(0x2039, 0x203a), range(0x2044),
  range(0x20ac), range(0x2122), // "€" "™"
  range(0x2191), range(0x2193), // "↑" "↓" · ⚠️ "→" "←" ไม่มี
  range(0x2212), range(0x2215), // "−" "∕" · ⚠️ "≤" "≥" ไม่มี
]);

/** ฟอนต์ของเอกสารมี glyph ของ code point นี้ไหม */
export function documentFontCovers(codePoint) {
  for (const [from, to] of DOCUMENT_FONT_CODEPOINTS) {
    if (codePoint < from) return false;
    if (codePoint <= to) return true;
  }
  return false;
}

/* อักขระที่ไม่พิมพ์อะไรเลย ⇒ ไม่มี glyph ก็ไม่เป็นกล่อง:
     · ช่องว่างและขึ้นบรรทัดทุกแบบ (`\s` — รวม NBSP · U+2000–200A · BOM U+FEFF)
     · อักขระจัดรูปแบบที่ตัวจัดเรียงตัวอักษรซ่อนเสมอ (Default_Ignorable_Code_Point): ZWSP U+200B · ZWNJ U+200C · ZWJ U+200D ·
       word joiner · เครื่องหมายทิศทาง · variation selector ของอีโมจิ (U+FE0F)
   ⚠️ ZWSP มีอยู่ในข้อความไทยที่ก๊อปจากเว็บ/LINE เป็นปกติ — เตือนทุกครั้ง = หัวหน้าเลิกอ่านคำเตือน */
const PRINTS_NOTHING = /[\s\p{Default_Ignorable_Code_Point}]/u;

/**
 * อักขระในข้อความที่กระดาษพิมพ์ไม่ได้ (ฟอนต์ที่ฝังไม่มี glyph) — ไม่ซ้ำ เรียงตามที่พบครั้งแรก
 * @param text ข้อความใดก็ได้ (ค่าว่าง/ไม่ใช่สตริง = ไม่มีอะไรให้ตรวจ)
 * @returns `string[]` ตัวละหนึ่ง code point (อีโมจิที่ประกอบจากหลายตัวออกมาทีละตัว) · `[]` = พิมพ์ได้ทั้งข้อความ
 */
export function uncoveredChars(text) {
  const out = [];
  for (const ch of String(text ?? '')) {
    if (documentFontCovers(ch.codePointAt(0)) || PRINTS_NOTHING.test(ch)) continue;
    if (!out.includes(ch)) out.push(ch);
  }
  return out;
}
