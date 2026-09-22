// ── งบหน้ากระดาษ FM-SA-04 — คณิตล้วน (ไม่มี HTML ไม่มีฐาน) ─────────────────────────
//
// ⭐ แยกออกมาจาก `productSpecDocument.js` (2026-09-22) ให้เทสต์ตรึงงบได้โดยไม่ต้องเปิดเบราว์เซอร์ —
//    ตัวเรนเดอร์ถามที่นี่ว่า "แต่ละก้อนสูงเท่าไร" แล้วให้ `paginateProductSpecSections` ตัดหน้า
//
// ⚠️ `.sheet` ของเปลือกเป็น `overflow: hidden` ⇒ ประเมินต่ำ = **เนื้อหาหายเงียบ** · ประเมินสูง = หน้าหลวม
//    ⇒ **เลือกทางประเมินสูงเสมอ** · ตัวเลขทุกตัวข้างล่างมาจากการวัด ไม่ใช่เดา
//
// ── วิธีวัด (รอบ 2026-09-22 · ใช้ซ้ำได้) ─────────────────────────────────────────────
//   headless Chrome (puppeteer-core) เปิด HTML ที่ `renderProductSpecDocument` คืนมาตรง ๆ (ฟอนต์ Sarabun
//   ฝังในไฟล์ · โลโก้เป็น data URI ⇒ file:// ได้หน้าตาเดียวกับของจริง) · ตั้ง `.document { zoom: 1 }`
//   แล้วอ่าน **`offsetHeight` / `scrollHeight` เทียบ `clientHeight` ของ `.sheetContent`** — ห้ามใช้
//   `getBoundingClientRect` เพราะเปลือกย่อทั้งแผ่นด้วย `zoom` ตามความกว้างจอ ค่าที่ได้จะเล็กลงตามขั้นบันได
//   ความกว้างตัวอักษรวัดจาก `<span>` ทีละตัวที่ 100px (ไม่มี zoom) แล้วหารเป็น em
//
// ── ความกว้างตัวอักษร (em · Sarabun ที่ฝังในเอกสาร) ─────────────────────────────────────
//   ตารางรายตัว (`ASCII_EM` · `THAI_EM`) วัดทีละตัวที่ 1000px ทั้งน้ำหนัก 400 และ 600 เก็บค่าที่มากกว่า + เผื่อ 3%
//   ภาพรวมที่วัดได้: เว้นวรรค 0.243 · พยัญชนะไทย 0.47–0.87 (เฉลี่ย 0.626) · A–Z 0.31–0.86 · a–z 0.26–0.84 ·
//   ตัวเลข 0.56 ทุกตัว · ข้อความจริงต่อตัวที่กินที่: ที่อยู่ไทย 0.508 · ร้อยแก้วไทย 0.541 · ร้อยแก้วอังกฤษ 0.434
//   🪤 **อย่ากลับไปใช้ค่าเฉลี่ยรายชนิด** (รอบแรกใช้) — คำที่มีตัวกว้างเยอะ (M W m ฒ ณ ญ) เกินค่าเฉลี่ยจนประเมินต่ำได้
//   🪤 สระบน/ล่าง วรรณยุกต์ ไม้หันอากาศ ฯลฯ ของไทย ซ้อนบนตัวหน้า **ไม่กินความกว้าง** (ในตาราง = 0)
//
// ── ตัดบรรทัด ────────────────────────────────────────────────────────────────────
//   จำลองจุดตัดของ Chrome ทีละอะตอม (ขอบคำไทยจาก `Intl.Segmenter` · ไทยติดละตินไม่ตัด · ตัดฉุกเฉินแล้วแบ่งใหม่)
//   รายละเอียด + ผลสอบเทียบ 11,760 กรณีอยู่เหนือ `partLines` · 🐞 รอบแรก (ไทยไหลได้ทุกที่ + เว้นท้ายบรรทัด
//   กว้าง × 0.1 + 3mm) ผ่านข้อความไทยล้วน/อังกฤษล้วน แต่ประเมินต่ำเมื่อไทยติดรหัส/URL และข้อความคั่น NBSP
//
// ── เรขาคณิตจาก CSS ของเปลือก + extraCss (มม.) ──────────────────────────────────────
//   แผ่น A4 297 − padding 11 + 10 ⇒ กล่องใน **276** · `.sheetContent` padding 5 (บน · extraCss) + 4 (ล่าง)
//   ตอนพิมพ์ padding ล่างเป็น 2vw = 4.2 ⇒ คิด **9.2** · เนื้อกว้าง 210 − 24 = **186**
//   บรรทัด = pt × 1.65 × 0.3528 : 6.8pt 3.96 · 7.2pt 4.19 · 7.7pt 4.48 · 8pt 4.66 · 8.4pt 4.89 · 9pt 5.24 ·
//   9.4pt 5.47 · 19pt 11.06
//
// ── ตัวเลขที่วัดได้ ─────────────────────────────────────────────────────────────────
//   กรอกไว้ที่ค่าคงที่แต่ละตัวข้างล่าง พร้อมค่าที่วัดได้กำกับ · สรุปรอบวัด + ผลสวีปอยู่หัว `productSpecDocument.js`
//   ⭐ เทสต์ตรึงว่าตัวประเมินไม่ต่ำกว่าของจริง: `MEASURED` (productSpecDocument.test) · `CALIBRATED`
//      (productSpecLayout.test) — แก้ CSS ของเปลือก/ตาราง/กล่องเมื่อไร วัดใหม่แล้วแก้ทั้งค่าคงที่และตารางในเทสต์

/* ── ความกว้างตัวอักษร ──────────────────────────────────────────────────────── */

const PT_MM = 25.4 / 72;
const LINE_HEIGHT = 1.65;
export const lineMm = (pt) => pt * LINE_HEIGHT * PT_MM;
/* 🪤 Chrome ปัดความสูงของแต่ละกล่องเป็นพิกเซลเต็ม (วัด: บรรทัด 8pt = 17.6px ⇒ กล่องสูง 18px = 4.76mm ·
   สองบรรทัด 35.2px ⇒ 35px) ⇒ ปัดทีละกล่อง ไม่ใช่ทีละบรรทัด · เผื่อกล่องละ 1px */
const PX_MM = 25.4 / 96;

const THAI = /[\u0E00-\u0E7F]/;

/* ความกว้างรายตัวอักษร (em) ของ Sarabun ที่ฝังในเอกสาร — วัดทีละตัวที่ 1000px ด้วย Chrome (2026-09-22)
   ค่าละตัว = ค่าที่มากกว่าระหว่างน้ำหนัก 400 กับ 600 (ป้ายตาราง/หัวกล่องเป็นตัวหนา · หนากว้างกว่าได้ถึง 10.8%)
   ⚠️ ตารางแทนค่าเฉลี่ยรายชนิดที่รอบแรกใช้ — ค่าเฉลี่ยไม่ปลอดภัยกับคำที่มีตัวกว้างเยอะ (M W m ฒ ณ ญ …)
   ASCII 0x20–0x7E ตามลำดับ · ไทย 0x0E01–0x0E5B ตามลำดับ (สระบน/ล่าง วรรณยุกต์ = 0 ⇒ ซ้อนบนตัวหน้า) */
const ASCII_EM = [
  0.243, 0.25, 0.388, 0.7, 0.537, 0.947, 0.688, 0.201, 0.342, 0.342, 0.448, 0.614, 0.278, 0.34, 0.278, 0.451,
  0.56, 0.56, 0.56, 0.56, 0.56, 0.56, 0.56, 0.56, 0.56, 0.56, 0.278, 0.278, 0.614, 0.614, 0.614, 0.466,
  0.802, 0.626, 0.601, 0.608, 0.636, 0.565, 0.566, 0.648, 0.688, 0.313, 0.475, 0.639, 0.559, 0.81, 0.693, 0.681,
  0.585, 0.681, 0.591, 0.544, 0.58, 0.661, 0.632, 0.86, 0.639, 0.61, 0.584, 0.324, 0.384, 0.324, 0.595, 0.347,
  0.4, 0.524, 0.553, 0.486, 0.553, 0.534, 0.362, 0.55, 0.564, 0.264, 0.268, 0.518, 0.298, 0.844, 0.559, 0.572,
  0.558, 0.558, 0.382, 0.433, 0.406, 0.558, 0.512, 0.694, 0.5, 0.491, 0.468, 0.34, 0.252, 0.34, 0.614,
];
const THAI_EM = [
  0.59, 0.619, 0.639, 0.617, 0.621, 0.665, 0.473, 0.566, 0.586, 0.635, 0.65, 0.824, 0.843, 0.619, 0.619, 0.562,
  0.743, 0.861, 0.867, 0.607, 0.621, 0.593, 0.671, 0.57, 0.646, 0.649, 0.664, 0.64, 0.64, 0.733, 0.733, 0.626,
  0.625, 0.582, 0.493, 0.593, 0.594, 0.619, 0.527, 0.617, 0.705, 0.594, 0.642, 0.733, 0.597, 0.578, 0.565, 0.544,
  0, 0.502, 0.502, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.7, 0.7, 0.7, 0.599, 0.321,
  0.604, 0.399, 0.41, 0.43, 0.301, 0.651, 0, 0, 0, 0, 0, 0, 0, 0, 0.625, 0.664,
  0.686, 0.706, 0.704, 0.685, 0.685, 0.675, 0.777, 0.681, 0.698, 0.81, 1.044,
];
const OTHER_EM = Object.freeze({
  '\u00a0': 0.243, '\t': 0.243, '\u00b7': 0.278, '\u2013': 0.54, '\u2014': 0.836, '\u201c': 0.554, '\u201d': 0.554,
  '\u2018': 0.338, '\u2019': 0.338, '\u2022': 0.368, '\u2026': 0.774, '\u2611': 0.831, '\u2610': 0.831,
});
// อักษรนอกตาราง (ภาษาอื่น · อีโมจิ) — กว้างกว่าตัวที่กว้างที่สุดในตาราง
const UNKNOWN_EM = 1.1;
// เผื่อ kerning/การปัดของเบราว์เซอร์บนผลรวมความกว้าง
const WIDTH_MARGIN = 1.03;

function glyphEm(ch) {
  const code = ch.codePointAt(0);
  if (code >= 0x20 && code <= 0x7e) return ASCII_EM[code - 0x20];
  if (code >= 0x0e01 && code <= 0x0e5b) return THAI_EM[code - 0x0e01];
  return OTHER_EM[ch] ?? UNKNOWN_EM;
}

/** ความกว้างที่ข้อความกินจริงก่อนตัดบรรทัด (มม.) */
export function textWidthMm(text, pt) {
  let em = 0;
  for (const ch of String(text ?? '')) em += glyphEm(ch);
  return em * pt * PT_MM * WIDTH_MARGIN;
}

/* ── จุดตัดบรรทัดของ Chrome (วัด 2026-09-22 รอบสอง · กล่อง `overflow-wrap: anywhere`) ─────────────────
   🐞 **รอบแรกประเมินต่ำเมื่อไทยติดกับละติน/ตัวเลข/URL** (ผลตรวจ: "ขวดแก้วใส…50mlพร้อมหัวสเปรย์FEA15…
      อยู่ที่https://drive.google.com/…" ประเมิน 9 บรรทัด วาด 10 · ฟัซ 4 ใน 36 ใบล้นเข้าท้ายกระดาษ) — ตัวเดิม
      ให้ท่อนที่มีอักษรไทย "ไหลได้ทุกที่" ทั้งท่อน แต่ Chrome **ไม่ตัดระหว่างไทยกับละติน/ตัวเลข** ⇒ คำไทยที่ติด
      หัว/ท้าย URL หรือรหัสสินค้ายกไปทั้งก้อน · และ `\s` ของ regex กิน NBSP ⇒ ข้อความที่คั่นด้วย NBSP (ตัดไม่ได้)
      ถูกนับเป็นเว้นวรรคปกติ
   ⇒ จำลองตัวตัดของเบราว์เซอร์ตรง ๆ: แบ่งข้อความเป็น "อะตอม" ที่ตัดกลางไม่ได้ แล้ววางทีละอะตอมแบบ greedy
      · หลังเว้นวรรค (U+0020 · ช่องว่างแคบ U+2000–200A · U+3000) และ ZWSP
      · หลัง `- ? – — …` (`-` หน้าตัวเลขตัดเฉพาะเมื่อหน้า `-` เป็น ASCII ตัวอักษร/ตัวเลข — กติกาของ Blink)
      · หลังอีโมจิ/อักษรจีน-ญี่ปุ่น
      · หลัง `/ ! | }` **เฉพาะเมื่อตัวถัดไปไม่ใช่ ASCII** (หน้าอักษรไทยตัดได้ หน้าอักษรละตินไม่ได้ — `a/b` ไม่ตัด)
      · ในท่อนไทย: ขอบคำตามพจนานุกรม ICU (`Intl.Segmenter` — พจนานุกรมไทยชุดเดียวกับที่ Chrome ใช้ตัดบรรทัด)
        **เฉพาะขอบที่อักษรสองข้างเป็นไทย** — ขอบไทย|ละติน ไม่ใช่จุดตัด
      · ที่เหลือ (`, . : ; ( ) [ ] @ & % + = _ ' "` NBSP ✅ ⭐ …) ติดกันหมด
   ⭐ อะตอมที่ยาวเกินบรรทัด = ตัดฉุกเฉินที่ขอบ (anywhere) แล้ว **แบ่งอะตอมของส่วนที่เหลือใหม่** — Chrome ตัดคำไทยกลางคำ
      แล้วแบ่งคำของเศษใหม่ (วัดได้ "สมุทรป | รา | การ(50ML)…" = เศษสองตัวกินทั้งบรรทัด)
   ⚠️ เผื่อสองชั้นเพราะผู้ใช้พิมพ์จากเบราว์เซอร์ของตัวเอง (พจนานุกรม/ICU คนละรุ่นได้):
      · บรรทัดที่จบตรงขอบคำไทย เว้นท้ายไว้ `thaiSlack` (5% + 1.5mm) — ขอบคำที่ Node เห็นแต่เบราว์เซอร์ไม่เห็น
        ถอยไปขอบก่อนหน้าได้โดยไม่ล้น
      · ตัดฉุกเฉินที่ความกว้าง − 1.1em (อักษรที่กว้างที่สุด) — เบราว์เซอร์ตัดที่ขอบตัวอักษร ไม่ใช่ขอบพอดี
   สอบเทียบ (Chrome · 19 ชุดข้อความ × 18 ความยาว × 14 ช่อง = 11,760 กรณี รวมไทยติด URL/รหัส/NBSP/อีโมจิ):
      ข้อความจริงทุกชุด (ร้อยแก้ว · ที่อยู่ · ไทยติดละติน · URL · NBSP · ZWSP) ประเมินต่ำ 0 กรณี · ประเมินเกิน
      ~5–12% ของบรรทัด (ตัวเดิม 11–14% แถมต่ำ 432 กรณี) · ที่ยังต่ำได้: สตริงพยัญชนะไทยสุ่มไม่มีสระ (ไม่มีคำใน
      พจนานุกรม · 9 กรณี) — ไม่ใช่ข้อความที่คนพิมพ์ */
const BREAK_AFTER = new Set(['-', '?', '\u2013', '\u2014', '\u2026', '\u200b', '\u3000']);
const BREAK_AFTER_BEFORE_NON_ASCII = new Set(['/', '!', '|', '}']);
const isThaiChar = (ch) => ch >= '\u0e01' && ch <= '\u0e5b';

const ASCII_ALNUM = /^[0-9A-Za-z]$/;
const ASCII_DIGIT = /^[0-9]$/;

function breaksAfter(ch, next, prev) {
  if (!next) return false;
  /* 🪤 "-" หน้าตัวเลข: Blink ตัดเฉพาะเมื่อหน้า "-" เป็นตัวอักษร/ตัวเลข ASCII (`ABCD-1234` ใน URL) — หน้าเป็นไทย
     หรือเครื่องหมาย = อาจเป็นเครื่องหมายลบ ไม่ตัด (วัด: "ประชาสัมพันธ์-1,500,000,000-" ติดกันทั้งก้อน · ฟัซรอบสอง) */
  if (ch === '-' && ASCII_DIGIT.test(next)) return ASCII_ALNUM.test(prev || '');
  if (BREAK_AFTER.has(ch)) return true;
  const code = ch.codePointAt(0);
  if ((code >= 0x2000 && code <= 0x200a && code !== 0x2007) || code >= 0x1f000
    || (code >= 0x3040 && code <= 0x9fff) || (code >= 0xff01 && code <= 0xff60)) return true;
  return BREAK_AFTER_BEFORE_NON_ASCII.has(ch) && next.codePointAt(0) > 0x7f;
}

/* ตัวแบ่งคำไทย — Node/Chrome มี ICU เต็มชุด · ไม่มี (runtime แปลก) = ถอยไปแบบตัวเดิม: ตัดได้ทุกตัวในท่อนไทย
   แต่เว้นท้ายบรรทัดเกือบหนึ่งคำ (กว้าง × 0.1 + 3mm ที่สอบเทียบรอบแรก) */
const THAI_WORDS = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('th', { granularity: 'word' })
  : null;
const thaiSlack = (widthMm) => (THAI_WORDS ? widthMm * 0.05 + 1.5 : widthMm * 0.1 + 3);

/* อะตอมของข้อความหนึ่งท่อนที่ไม่มีเว้นวรรค — `thaiEnd` = อะตอมจบที่ขอบคำไทย (ท้ายบรรทัดต้องเว้น thaiSlack) */
function atomsOf(token) {
  const thaiBreaks = new Set();
  if (THAI.test(token)) {
    if (THAI_WORDS) {
      for (const { index } of THAI_WORDS.segment(token)) {
        if (index > 0 && isThaiChar(token[index - 1]) && isThaiChar(token[index])) thaiBreaks.add(index);
      }
    } else {
      for (let i = 1; i < token.length; i += 1) if (isThaiChar(token[i - 1]) && isThaiChar(token[i])) thaiBreaks.add(i);
    }
  }
  const chars = [...token];
  const atoms = [];
  let text = '';
  let offset = 0;
  chars.forEach((ch, k) => {
    if (text && thaiBreaks.has(offset)) { atoms.push({ text, thaiEnd: true }); text = ''; }
    text += ch;
    offset += ch.length;
    if (breaksAfter(ch, chars[k + 1], chars[k - 1])) { atoms.push({ text, thaiEnd: false }); text = ''; }
  });
  if (text) atoms.push({ text, thaiEnd: false });
  return atoms;
}

/* ตัดฉุกเฉิน: ความยาว (code unit) ของส่วนหน้าที่ใส่ในความกว้าง `room` ได้ — อย่างน้อยหนึ่งตัว (กันวนไม่จบ) */
function fitPrefix(text, room, pt) {
  let width = 0;
  let length = 0;
  for (const ch of text) {
    const w = textWidthMm(ch, pt);
    if (length > 0 && width + w > room) break;
    width += w;
    length += ch.length;
  }
  return length;
}

/* บรรทัดของข้อความหนึ่งท่อน (ไม่มีขึ้นบรรทัดใหม่) — วางอะตอมทีละตัวแบบที่เบราว์เซอร์ทำ
   🪤 อะตอมที่ไม่พอที่เหลือ **ขึ้นบรรทัดใหม่ทั้งอะตอม** (ท้ายบรรทัดเดิมเสียเปล่า) — ตัดฉุกเฉินเฉพาะอะตอมที่ยาวกว่า
      บรรทัดเปล่า (`overflow-wrap: anywhere` ใช้เมื่อบรรทัดไม่มีจุดตัดอื่นเท่านั้น) */
function partLines(part, widthMm, pt) {
  if (textWidthMm(part, pt) <= widthMm) return 1; // ลงบรรทัดเดียวได้ = ไม่มีการตัด ไม่มีท้ายบรรทัดที่เสีย
  const cutRoom = Math.max(4, widthMm - UNKNOWN_EM * pt * PT_MM);
  const slack = thaiSlack(widthMm);
  const space = ASCII_EM[0] * pt * PT_MM * WIDTH_MARGIN;
  let lines = 1;
  let used = 0;
  let spaces = 0; // เว้นวรรคที่ค้างก่อนคำถัดไป (pre-wrap เก็บเว้นวรรคซ้อน — แต่ละตัวกินที่)
  part.split(' ').forEach((token, index) => {
    if (index > 0) spaces += 1;
    let rest = token;
    while (rest) {
      let consumed = 0;
      let cutAt = -1;
      for (const atom of atomsOf(rest)) {
        const width = textWidthMm(atom.text, pt);
        const gap = used > 0 ? spaces * space : 0;
        spaces = 0;
        if (used + gap + width <= widthMm - (atom.thaiEnd ? slack : 0)) {
          used += gap + width;
          consumed += atom.text.length;
          continue;
        }
        if (used > 0) {
          lines += 1;
          used = 0;
        }
        if (width <= widthMm) {
          used = width;
          consumed += atom.text.length;
          continue;
        }
        cutAt = consumed + fitPrefix(atom.text, cutRoom, pt);
        break;
      }
      if (cutAt < 0) break;
      // ส่วนหน้าเต็มบรรทัดนี้ · ส่วนที่เหลือขึ้นบรรทัดใหม่แล้วแบ่งอะตอมใหม่ (แบบที่ Chrome แบ่งคำของเศษใหม่)
      lines += 1;
      used = 0;
      rest = rest.slice(cutAt);
    }
  });
  return lines;
}

/**
 * จำนวนบรรทัดที่ข้อความหนึ่งก้อนกินในกล่องกว้าง `widthMm` ที่ตัวอักษร `pt`
 *
 * @param opts.preWrap `true` = กล่องเป็น `white-space: pre-wrap` (กล่องผู้ซื้อ/อ้างอิงของเปลือก) —
 *   ขึ้นบรรทัดใหม่ของผู้ใช้เป็นบรรทัดจริง บรรทัดว่างก็กินที่ · `false` (ตาราง) = เว้นวรรค/แท็บ/ขึ้นบรรทัดยุบเป็นหนึ่ง
 * ⚠️ ว่าง = 1 บรรทัด — ช่องว่างพิมพ์ขีด/N/A ซึ่งกินหนึ่งบรรทัดเสมอ
 * 🪤 ยุบเฉพาะช่องว่างที่ HTML ยุบจริง (space · tab · ขึ้นบรรทัด) — **ห้าม `\s`** ซึ่งกิน NBSP ด้วย แล้ว NBSP (ตัดไม่ได้)
 *    กลายเป็นเว้นวรรคที่ตัดได้ ⇒ ประเมินต่ำ (ผลตรวจรอบสอง)
 */
export function estimateTextLines(text, widthMm, pt, { preWrap = false } = {}) {
  const source = String(text ?? '');
  const parts = preWrap ? source.split(/\r?\n/) : [source.replace(/[ \t\n\r\f]+/g, ' ').trim()];
  return parts.reduce((sum, part) => sum + partLines(part.trimEnd(), widthMm, pt), 0);
}

/* ── ค่าคงที่ของแผ่น (วัด 2026-09-22) ─────────────────────────────────────────── */

export const PRODUCT_SPEC_LAYOUT_MM = Object.freeze({
  sheetInner: 276,     // 297 − 11 − 10 (clientHeight ของ .sheetContent แผ่นที่ไม่มีหัว วัดได้ 276.0)
  contentPad: 9.2,     // padding บน 5 + ล่าง 4 (พิมพ์ 2vw = 4.2)
  contentWidth: 186,
  /* เผื่อต่อแผ่น — ใช้ตอน **หลายก้อนแชร์แผ่นเดียวกัน** · ก้อนที่อยู่คนเดียวบนแผ่นเปล่า และก้อนท้าย (ลายเซ็น — สูงคงที่
     วัดแล้ว) ได้ความจุเต็ม (`reserve` ของ productSpecPageBudgets) — ดู paginateProductSpecSections */
  safety: 4,
});

const L = PRODUCT_SPEC_LAYOUT_MM;

/* ── หัวเอกสาร (documentHeader ของเปลือก) ─────────────────────────────────────────
   brandBlock (กว้าง 186 − 8 − 72 = 106): โลโก้ 13.5 + gap 4.5 + ชื่อบริษัท 9pt + สามบรรทัด 6.8pt (margin .6)
   identityBlock (กว้าง 72 — minmax(72mm, .9fr) ชนะ): บรรทัดแบบฟอร์ม 8.5pt + h1 19pt (margin 2) +
   dl (margin 2.5) แถวละ padding .8 + 9.5pt
   หัวทั้งก้อน = max(สองบล็อก) + padding-bottom 4 + เส้น 1.3px */
const HEADER = Object.freeze({
  brandWidth: 106,
  identityWidth: 71.96, // วาดจริง 71.967 (รอบสอง)
  // วัดได้: brandBlock 38.2 (ชื่อ 1 บรรทัด · ที่อยู่ 1 บรรทัด) · identityBlock 35.3 (ชื่อเอกสาร 1 บรรทัด · 2 แถว)
  brandBase: 39,        // โลโก้ + gap + ชื่อ 1 บรรทัด + สาม <p> บรรทัดเดียว
  identityBase: 36,     // บรรทัดแบบฟอร์ม + h1 บรรทัดเดียว + dl สองแถว
  tail: 4.4,            // padding-bottom 4 + เส้น 1.3px
});

/**
 * ความสูงหัวเอกสาร (มม.) จากข้อความที่พิมพ์จริง
 * ⚠️ ชื่อเอกสารตกบรรทัดได้ (ชื่อไทยที่มาตรฐานเผยแพร่ยาวขึ้น) — แต่ละบรรทัดเพิ่ม 11.06
 * @param p.title ชื่อเอกสารตามภาษาของใบ · p.companyName · p.companyLines [ที่อยู่, เลขผู้เสียภาษี, โทร/Line/เว็บ]
 */
export function productSpecHeaderMm({ title = '', companyName = '', companyLines = [] } = {}) {
  const titleLines = estimateTextLines(title, HEADER.identityWidth, 19);
  const nameLines = estimateTextLines(companyName, HEADER.brandWidth, 9);
  const extraBrand = (nameLines - 1) * lineMm(9)
    + companyLines.reduce((sum, text) => sum + (estimateTextLines(text, HEADER.brandWidth, 6.8) - 1) * lineMm(6.8), 0);
  const brand = HEADER.brandBase + extraBrand;
  const identity = HEADER.identityBase + (titleLines - 1) * lineMm(19);
  return Math.max(brand, identity) + HEADER.tail;
}

/* ── กล่องผู้ซื้อ / อ้างอิง (partyGrid ของเปลือก) ─────────────────────────────────────
   กริด 1.15fr .85fr ห่าง 3 ⇒ ซ้าย 105.2 · ขวา 77.8 · padding 3 × 3.5 + เส้นซ้าย 1.5px
   ⇒ เนื้อซ้าย 97.8 · ขวา 70.4 · แถว dl = ป้าย 24 + ห่าง 2 ⇒ ค่าซ้าย 71.8 · ขวา 44.4
   ตัวอักษร: h2 8.7pt (5.06 + margin 1.5) · ชื่อ 9.4pt · ที่อยู่ <p> 8pt (margin .8) · ป้าย 7.7pt · ค่า 8pt
   ⚠️ กล่องผู้ซื้อ/อ้างอิงเป็น `white-space: pre-wrap` — ขึ้นบรรทัดใหม่ในที่อยู่คือบรรทัดจริง
   (ที่อยู่จริงบนฐานมีถึง 6 บรรทัด · ยาวสุด 250 ตัว วัด 2026-09-22) */
const PARTY = Object.freeze({
  leftText: 97.8,
  rightText: 70.4,
  labelWidth: 23.99,    // วาดจริง 23.999 · ค่าซ้าย/ขวาวาดจริง 71.97 / 44.52 · เนื้อ 98.04 / 70.52 (ค่าข้างล่างแคบกว่า = ปลอดภัย)
  leftValue: 71.8,
  rightValue: 44.4,
  // padding 6 + h2 5.06 + 1.5 + dl margin 1.2 — ส่วนคงที่ของทั้งสองคอลัมน์
  frame: 13.8,
  rowGap: 0.5,
  marginTop: 4,
  fudge: 1,             // ปัดขึ้นกันเศษของเส้น/การปัดพิกเซล
});

const dlRowsMm = (rows, valueWidth) => rows.reduce((sum, row) => {
  const label = estimateTextLines(row.label, PARTY.labelWidth, 7.7) * lineMm(7.7);
  const value = estimateTextLines(row.value ?? '-', valueWidth, 8, { preWrap: true }) * lineMm(8);
  return sum + PARTY.rowGap + Math.max(label, value) + PX_MM;
}, 0);

/**
 * ความสูงกล่องผู้ซื้อ + อ้างอิง (มม.) รวม margin-top — กริดสูงเท่าคอลัมน์ที่สูงกว่า
 * @param p.name ชื่อลูกค้า · p.address ที่อยู่เอกสาร · p.partyRows / p.referenceRows `[{label, value}]`
 *   (ข้อความที่พิมพ์จริง ภาษาเดียวกับกระดาษ)
 */
export function productSpecPartyMm({ name = '', address = '', partyRows = [], referenceRows = [] } = {}) {
  const left = PARTY.frame
    + estimateTextLines(name || '-', PARTY.leftText, 9.4, { preWrap: true }) * lineMm(9.4) + PX_MM
    + 0.8 + estimateTextLines(address || '-', PARTY.leftText, 8, { preWrap: true }) * lineMm(8) + PX_MM
    + dlRowsMm(partyRows.filter(Boolean), PARTY.leftValue);
  const right = PARTY.frame + dlRowsMm(referenceRows.filter(Boolean), PARTY.rightValue);
  return PARTY.marginTop + Math.max(left, right) + PARTY.fudge;
}

/* ── ก้อนในเนื้อกระดาษ ────────────────────────────────────────────────────────── */

/* ตาราง: padding 1.2 × 2 + บรรทัด 8.4pt 4.89 + เส้น .2mm (border-collapse — แถวติดกันใช้เส้นร่วม)
   🐞 รอบแรกคิดกรอบ 2.8 จาก `offsetHeight` ของ <tr> ทีละแถว (ปัดเป็นพิกเซลเต็ม 29px = 7.67) — แต่ในตารางจริง
      แถวซ้อนกันด้วยความสูงเศษพิกเซล: **ระยะแถวต่อแถว (pitch) = กรอบ 2.65–2.69 + n × 4.89** (วัดรอบสอง: ตาราง 12 แถว
      ลบตาราง 1 แถว ÷ 11 · kv/checklist/cert · n = 1–10 · จอและพิมพ์เท่ากัน) ⇒ กรอบ 2.8 เกินจริง ~0.13 ต่อแถว
      สะสม 17 แถว + หัว ≈ 3mm ⇒ ลายเซ็นที่ลงหน้า 2 ได้จริง (เหลือ 3.3mm) ถูกดันไปหน้า 3 คนเดียว (ผลตรวจ)
   ⇒ กรอบ **2.72** (ครอบ pitch สูงสุดที่วัดได้ 2.688 + เศษพิกเซลของการวัด) · แถวแรกของตารางสูงกว่า pitch ได้ถึง
      0.41 (เส้นขอบบน + การปัด) ⇒ เปิดตาราง **+0.53** (2px) */
const CELL = Object.freeze({ frame: 2.72, pt: 8.4 });
/** ระยะแถวตารางที่มี `lines` บรรทัด (มม.) — ส่งออกให้เทสต์ตรึงกับค่าที่วัด */
export const tableRowMm = (lines) => CELL.frame + lines * lineMm(CELL.pt);
const cellMm = tableRowMm;

export const PRODUCT_SPEC_COST_MM = Object.freeze({
  heading: 12.8,        // h3 10.5pt 6.09 + margin 5 + 1.6 (วัด 12.69)
  /* หัวข้อ "Final Review & Approval" ห่างก้อนบน 2.5 แทน 5 (`h3.signHeading` — ดู signatureBlock) · วัด 10.19
     🪤 หัวข้อนี้ขึ้นต้นแผ่นได้ (margin บนหาย) ขณะที่งบแผ่นต่อคืน margin 5 ของหัวข้อแรกไว้แล้ว ⇒ คืนเกิน 2.5 —
        ปลอดภัยเพราะลายเซ็นเป็นก้อนท้าย: ขึ้นต้นแผ่นเมื่อไร แผ่นนั้นมีแต่ลายเซ็น (สูง ~45 จากงบ ~270) */
  signatureHeading: 10.3,
  // h3 ตัวแรกของแผ่นต่อไม่มี margin บน (`.sheetContent > h3:first-child`) — ดู productSpecPageBudgets
  headingTopMargin: 5,
  tableEdge: 0.53,      // แถวแรก + เส้นขอบบนแบบ collapse สูงกว่า pitch ได้ถึง 0.41 (วัดรอบสอง) ⇒ 2px
  checklistHead: 12.7,  // หัวตารางสองบรรทัด ("ลำดับ" ตกบรรทัดในช่อง 9mm · วัด 12.44)
  certHead: 7.9,        // หัวตารางบรรทัดเดียว (วัด 7.67)
  /* ภาพ: figGrid margin 2 + 4 · กรอบ 70 (สูงคงที่โดยตั้งใจ — ปล่อยตามสัดส่วนรูปแล้วเดาความสูงไม่ได้) ·
     คำบรรยาย margin 1.6 + max(min-height 2.6em = 7.705, บรรทัด × 4.89) · วัดแถวคำบรรยายบรรทัดเดียว 85.37 */
  figureFrame: 77.8,
  figureCaptionMin: 7.71,
});

const C = PRODUCT_SPEC_COST_MM;

/* ความกว้างข้อความในแต่ละช่อง (มม.) = **ที่ Chrome วาดจริง** (`clientWidth` − padding · วัด 2026-09-22 รอบสอง
   ทั้งจอและสื่อพิมพ์ได้ค่าเดียวกัน · ปัดลง)
   🐞 รอบแรกคิดจากสัดส่วนตาราง (186 × 0.62 − 4 …) ได้กว้างเกินที่วาด 0.2–0.5mm — เส้นขอบแบบ collapse กินครึ่งเส้น
      ต่อข้าง + Chrome ปัดความกว้างช่องเป็นพิกเซล ⇒ ประเมินบรรทัดบนช่องที่กว้างกว่าจริง
   ⚠️ แก้ความกว้างคอลัมน์/padding ใน extraCss ของ productSpecDocument เมื่อไร วัดใหม่ (วิธีที่หัวไฟล์) */
const WIDTH = Object.freeze({
  kvLabel: 66.37,       // th 38% (สูตรเดิม 66.68)
  kvValue: 110.82,      // (111.32)
  checklistCol: 46.53,  // สามช่องแบ่งที่เหลือเท่ากัน · table-layout: fixed (47.00)
  certLabel: 58.97,     // 34% (59.24)
  certCol: 57.11,       // (57.38)
  figCaption: 90.48,    // (186 − 5) / 2
});

const tableLines = (text, width) => estimateTextLines(text || 'N/A', width, CELL.pt);

export const kvRowMm = (label, value) => cellMm(Math.max(
  tableLines(label, WIDTH.kvLabel), tableLines(value, WIDTH.kvValue),
));

export const checklistRowMm = (row = {}) => cellMm(Math.max(
  tableLines(row.itemLabel, WIDTH.checklistCol),
  tableLines(row.detail, WIDTH.checklistCol),
  tableLines(row.note, WIDTH.checklistCol),
));

// ช่องสถานะพิมพ์สองบรรทัดเสมอ (พร้อม · อยู่ระหว่าง…)
export const certRowMm = (row = {}) => cellMm(Math.max(
  2, tableLines(row.label, WIDTH.certLabel), tableLines(row.note, WIDTH.certCol),
));

/** ต้นทุนเปิดหัวข้อ = หัวข้อ + หัวตาราง (ตารางที่มีหัว) + ขอบตาราง (ทุกหัวข้อที่เป็นตาราง) */
export const sectionOpenMm = ({ table = null, headCost = 0 } = {}) => C.heading + headCost + (table ? C.tableEdge : 0);

/** แถวภาพ (สองภาพต่อแถว) — สูงตามคำบรรยายที่ยาวที่สุดในแถว */
export function figureRowMm(captions = []) {
  const lines = Math.max(1, ...captions.map((text) => estimateTextLines(text, WIDTH.figCaption, 8.4)));
  return C.figureFrame + Math.max(C.figureCaptionMin, lines * lineMm(8.4));
}

/* ── ช่องลงนาม (`signatureSection` ของเปลือก — กล่องชุดเดียวกับ QT/SO · มติ 2026-09-22) ─────────────────
   กริดสี่ช่องห่าง 2.5 ⇒ กล่องกว้าง (186 − 7.5) / 4 = 44.625 · padding 2 + เส้น 1px ⇒ เนื้อ ~40.1 (วัด: SIGNATURE.text)
   ⚠️ ช่องกว้างเท่ากันได้เพราะ extraCss ของ FM-SA-04 ตั้ง minmax(0, 1fr) + ชื่อตัดในช่อง — 1fr ของเปลือกให้ชื่อที่ไม่มีจุดตัด
      ถ่างช่อง แล้วช่องอื่นแคบจนตกหลายบรรทัด (วัดได้สูงเกินที่ประเมิน 30mm) · ถอดกฎนั้นเมื่อไร ค่าข้างล่างใช้ไม่ได้
   กล่องหนึ่ง = padding + เส้น + ป้าย h2 8pt (4.66/บรรทัด) + ตำแหน่ง span 6.8pt (3.96/บรรทัด · ไม่มี = ไม่มีบรรทัด) +
     ช่องเซ็น/รูป/กล่อง "ลายเซ็นอิเล็กทรอนิกส์" สูงคงที่ 12 + ชื่อ strong 7.8pt (4.54/บรรทัด) +
     บรรทัดล่าง p 6.8pt (margin .5 · วันที่ หรือ "วันที่ ___/___/___") · min-height 31
   กริดยืดทุกกล่องเท่ากล่องที่สูงที่สุด ⇒ ทั้งก้อน = หัวข้อ h3 (margin บน 2.5 · `signatureHeading`) + กล่องที่สูงที่สุด
   🪤 ป้าย/ชื่อเป็นตัวหนา (700) — ไทยกว้างเท่าน้ำหนักอื่น · ละตินกว้างกว่า 600 ~1.5–2% ซึ่งอยู่ในเผื่อ 3% ของตาราง
      ความกว้าง (วัด 2026-09-22: "Account Executive Supervisor" 700 = 0.983 ของที่ประเมิน)
   วัด (Chrome รอบสาม · จอ = พิมพ์): กล่องบรรทัดเดียว 34.13 · ชื่อสองบรรทัด 38.63 · สามบรรทัด 43.13 · ช่องลูกค้าใบอังกฤษ 30.16
      (ติด min-height 31) · ทั้งก้อน 44.32 / 48.81 / 53.31 · 146 แบบ ไม่มีกล่องไหนประเมินต่ำ (เผื่อต่ำสุด 0.53 ต่อกล่อง ·
      0.66 ทั้งก้อน) — เทสต์ตรึงที่ SIGNATURE_MEASURED (productSpecLayout.test) */
const SIGNATURE = Object.freeze({
  text: 40.18,          // เนื้อกล่อง (clientWidth − padding) ที่ Chrome วาด 40.185 ทั้งจอและพิมพ์ (สูตร 40.09)
  frame: 4.53,          // padding 2 × 2 + เส้น 1px × 2
  mark: 12,             // .signatureSpace / .signaturePreview / .signatureImage สูง 12mm
  metaGap: 0.5,         // .signatures p { margin-top: .5mm }
  minBox: 31,           // .signatures > div { min-height: 31mm }
  fudge: 0.53,          // Chrome ปัดความสูงของแต่ละก้อนเป็นพิกเซล (สี่ก้อนในกล่อง) — เผื่อ 2px
});

/** ความสูงกล่องลงนามหนึ่งกล่อง (มม.) จากข้อความที่พิมพ์ (`signatureBoxText` ของเปลือก) */
export function signatureBoxMm({ label = '', role = '', name = '', meta = '' } = {}) {
  const lines = (text, pt) => estimateTextLines(text || '-', SIGNATURE.text, pt);
  const body = SIGNATURE.frame
    + lines(label, 8) * lineMm(8)
    + (role ? lines(role, 6.8) * lineMm(6.8) : 0)
    + SIGNATURE.mark
    + lines(name, 7.8) * lineMm(7.8)
    + (meta ? SIGNATURE.metaGap + lines(meta, 6.8) * lineMm(6.8) : 0);
  return Math.max(SIGNATURE.minBox, body) + SIGNATURE.fudge;
}

/**
 * ลายเซ็นทั้งก้อน = หัวข้อ "Final Review & Approval" + แถวกล่อง (สูงเท่ากล่องที่สูงที่สุด)
 * @param boxes `[{ label, role, name, meta }]` — ข้อความที่พิมพ์จริงทีละกล่อง (`signatureBoxText`)
 */
export function signaturesMm(boxes = []) {
  const tallest = Math.max(SIGNATURE.minBox + SIGNATURE.fudge, ...boxes.filter(Boolean).map(signatureBoxMm));
  return C.signatureHeading + tallest;
}

/* ── งบต่อแผ่น ──────────────────────────────────────────────────────────────── */

/**
 * งบเนื้อหาต่อแผ่น (มม.) — แผ่นแรกเสียที่ให้หัวเอกสาร + กล่องผู้ซื้อ/อ้างอิง (สองก้อนนี้อยู่แผ่นแรกเท่านั้น)
 * 🪤 กล่องผู้ซื้อ **ไม่อยู่ในลิสต์ที่ตัดหน้าเห็น** (วางบนสุดของแผ่นแรกตรง ๆ) ⇒ ต้องหักจากงบแผ่นแรกที่นี่
 *    รอบแรกของเอกสารนี้ลืมหักแล้วแผ่นแรกล้น 230.7 > 221.2 ซึ่ง `.sheet` ตัดทิ้งเงียบ ๆ
 */
export function productSpecPageBudgets({ headerMm, partyMm }) {
  const content = L.sheetInner - L.contentPad - L.safety;
  /* ⭐ แผ่นต่อทุกแผ่นเปิดด้วยหัวข้อเสมอ (หัวข้อใหม่ · หัวข้อ "(ต่อ)" · หัวลายเซ็น — `paginateProductSpecSections`
     รับประกัน) และ h3 ตัวแรกของ `.sheetContent` ไม่มี margin บน ⇒ ต้นทุนหัวข้อที่คิดเต็ม 12.8 เกินจริง 5 ต่อแผ่น
     คืนที่นี่ทีเดียว · แผ่นแรกไม่ได้คืน (กล่องผู้ซื้อมาก่อน h3 ⇒ margin บนยังอยู่) */
  // `reserve` = เผื่อต่อแผ่นที่หักไว้แล้วใน first/rest — ก้อนที่อยู่คนเดียวบนแผ่น/ก้อนท้ายขอคืนได้ (ดูตัวตัดหน้า)
  return { first: content - headerMm - partyMm, rest: content + C.headingTopMargin, reserve: L.safety };
}

/* ── ตัดหน้าตามหัวข้อ ──────────────────────────────────────────────────────────── */

/**
 * ตัดหน้า **ทั้งหัวข้อ** (มติผู้ใช้ 2026-09-22 "แบ่งหน้า ตัดตามหัวข้อ")
 *
 *   · หัวข้อหนึ่ง (หัว + หัวตาราง + ทุกแถว) อยู่แผ่นเดียวกันเสมอ — ใส่ที่เหลือไม่พอ ย้ายทั้งหัวข้อไปแผ่นใหม่
 *   · **เฉพาะหัวข้อที่สูงกว่าแผ่นเปล่าทั้งแผ่น** จึงตัดกลางได้ (ทีละแถว) — แผ่นต่อเปิดด้วยหัวข้อเดิม + "(ต่อ)"
 *     พร้อมหัวตารางซ้ำ (คิดที่ให้ทั้งคู่) · เริ่มบนแผ่นปัจจุบันถ้าหัว + แถวแรกลงได้ ไม่งั้นเริ่มแผ่นใหม่
 *   · ก้อนท้าย (ลายเซ็น) ไม่แบ่ง — ลงไม่พอ ขึ้นแผ่นใหม่
 *   ⭐ **ความจุเต็ม (ไม่หักเผื่อต่อแผ่น `reserve`)** ให้สองกรณี (ผลตรวจรอบสอง — ทั้งคู่เจอบนข้อมูลจริง):
 *     · หัวข้อที่เป็นก้อนแรกของแผ่น — 🐞 ภาพ 5–6 รูปสูง 269.6 เกินงบ 267.8 แค่ส่วนเผื่อ ⇒ ถูกตัดไปแผ่น "(ต่อ)"
 *       ทั้งที่วาดจริงลงแผ่นเดียวเหลือ 3.2mm (ผิดกติกา "ไม่ตัดหัวข้อที่ลงแผ่นเปล่าได้")
 *     · ก้อนท้าย (ลายเซ็น สูงคงที่ที่วัดแล้ว) — 🐞 ใบมาตรฐาน (checklist 17 · เอกสาร 4) ได้หน้า 3 ที่มีแต่ลายเซ็น
 *       ทั้งที่ลงหน้า 2 ได้จริง
 *     ส่วนเผื่อยังคุมตอนหลายก้อนแชร์แผ่น (ตัวประเมินข้อความแต่ละก้อนสอบเทียบแล้วว่าไม่ต่ำกว่าจริง)
 * 🪤 แผ่นแรกที่หัวข้อแรกลงไม่พอ ได้แผ่นแรกที่มีแค่หัวเอกสาร + กล่องผู้ซื้อ — ตั้งใจ (ตามกติกา "ไม่ตัดหัวข้อ")
 *    เกิดได้เฉพาะที่อยู่ยาวหลายบรรทัด + ช่องสเปคยาวเต็มเพดาน
 *
 * @param sections `[{ key, openCost, rows: [{ cost, ... }] }]` — `openCost` = หัวข้อ + หัวตาราง
 * @param tail `{ cost }` ก้อนท้าย · `null` = ไม่มี
 * @param budgets `{ first, rest, reserve? }` ของ `productSpecPageBudgets`
 * @returns `[[{ kind: 'open'|'continue'|'row'|'tail', section, row? }]]` ทีละแผ่น (ตัวเรนเดอร์แปลงเป็น HTML)
 */
export function paginateProductSpecSections(sections = [], tail = null, budgets) {
  const pages = [];
  let page = [];
  let used = 0;
  let budget = budgets.first;
  const reserve = budgets.reserve || 0;
  const newPage = () => {
    pages.push(page);
    page = [];
    used = 0;
    budget = budgets.rest;
  };
  const place = (entry, cost) => { page.push(entry); used += cost; };
  const placeWhole = (section, rows) => {
    place({ kind: 'open', section }, section.openCost);
    rows.forEach((row) => place({ kind: 'row', section, row }, row.cost));
  };
  // แผ่นต่อที่ยังว่าง — ห้ามเปิดแผ่นใหม่ซ้อน (ได้แผ่นเปล่าเปล่า ๆ) · แผ่นแรกที่ว่างไม่นับ (มีหัว/กล่องผู้ซื้ออยู่)
  const blankContinuation = () => page.length === 0 && pages.length > 0;

  for (const section of sections) {
    const rows = section.rows || [];
    const total = section.openCost + rows.reduce((sum, row) => sum + row.cost, 0);
    /* ⭐ `breakBefore` = หัวข้อนี้ขึ้นแผ่นใหม่เสมอ (ภาพประกอบ · มติผู้ใช้ 2026-09-22 "อยากให้ขึ้นหน้าใหม่เสมอ")
       ⚠️ แผ่นต่อที่ยังว่างไม่เปิดซ้อน · แผ่นแรกนับว่ามีของเสมอ (หัวเอกสาร + กล่องผู้ซื้อ) ⇒ เปิดแผ่นใหม่ */
    if (section.breakBefore && !blankContinuation()) newPage();
    // ก้อนแรกของแผ่นได้ความจุเต็ม · แชร์แผ่นกับก้อนก่อนหน้า = หักส่วนเผื่อ
    if (used + total <= budget + (page.length === 0 ? reserve : 0)) {
      placeWhole(section, rows);
      continue;
    }
    if (total <= budgets.rest + reserve) {
      // ลงแผ่นเปล่าได้ ⇒ ย้ายทั้งหัวข้อ ไม่ตัด
      if (!blankContinuation()) newPage();
      placeWhole(section, rows);
      continue;
    }
    // สูงกว่าแผ่นเปล่า — ตัดทีละแถว
    if (!blankContinuation() && used + section.openCost + (rows[0]?.cost || 0) > budget) newPage();
    place({ kind: 'open', section }, section.openCost);
    rows.forEach((row) => {
      if (used + row.cost > budget) {
        newPage();
        place({ kind: 'continue', section }, section.openCost);
      }
      place({ kind: 'row', section, row }, row.cost);
    });
  }
  if (tail) {
    // ก้อนท้ายสูงคงที่ (วัดแล้ว) ⇒ ใช้ความจุเต็มของแผ่น
    if (used + tail.cost > budget + reserve) newPage();
    place({ kind: 'tail' }, tail.cost);
  }
  pages.push(page);
  return pages;
}
