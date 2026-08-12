#!/usr/bin/env node
/**
 * สร้าง `src/lib/sales/quotationDocumentFonts.js` — @font-face ที่ฝัง woff2 เป็น base64
 * สำหรับเอกสาร standalone (ใบพิมพ์ / ฉบับตรึง snapshot) ที่ไม่มีตัวแปรของ next/font
 *
 * ⭐ ทำไมต้องฝัง: เอกสารเปิดในหน้าต่างใหม่/บันทึกเป็น snapshot แล้วเล่นซ้ำทีหลัง
 * ถ้าพึ่ง Google CDN แล้วโหลดไม่ทัน/ออฟไลน์ ตัวอักษรจะหล่นไปฟอนต์ระบบเงียบ ๆ
 * ⇒ เอกสารเดียวกันหน้าตาไม่เหมือนกันสองครั้ง ซึ่งยอมไม่ได้กับใบที่มีลายเซ็น
 *
 * 🪤 ก่อนหน้านี้หัวไฟล์ที่ generate ออกมาเขียนว่า "อย่าแก้มือ: รันสคริปต์ generate ใหม่"
 * แต่ **ไม่มีสคริปต์นั้นอยู่ในรีโป** (ตรวจ 2026-08-13 ตอนเปลี่ยนมาใช้ Sarabun)
 * ไฟล์นี้คือสคริปต์ที่หายไป — คอมมิตไปกับผลลัพธ์เสมอ
 *
 * ใช้:
 *   npm run gen:document-fonts
 *   npm run gen:document-fonts -- --family "Sarabun" --weights 400,500,600,700
 *
 * ต้องต่อเน็ต (ดึงจาก fonts.googleapis.com) · ฟอนต์ต้องเป็นสัญญาอนุญาต OFL
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "src", "lib", "sales", "quotationDocumentFonts.js");

// UA ของ Chrome รุ่นใหม่ — Google Fonts เลือกฟอร์แมตตาม UA, ถ้าไม่ส่งจะได้ ttf ซึ่งใหญ่กว่ามาก
const WOFF2_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ช่วงยูนิโค้ดที่เอกสารใช้จริง — ไทย (U+0E01–0E5B) และละตินพื้นฐาน
// ⚠️ ฿ = U+0E3F อยู่ใน "บล็อกไทย" ไม่ใช่บล็อกสัญลักษณ์สกุลเงิน ⇒ ต้องมี subset ไทยเสมอ
//    ไม่งั้นทุกยอดเงินบนเอกสารตกไปใช้ฟอนต์ระบบ (บั๊กเดิมสมัยโหลด Plex Mono คู่กัน)
// ⚠️ Google เขียนช่วงได้สองแบบ — เต็ม (`U+0E01-0E5B`) และย่อ (`U+E01-E5B`, `U+??`)
//    ขึ้นกับ UA/เวอร์ชันของ API · regex ต้องรับทั้งคู่ ไม่งั้นกรองไม่เจอแล้วสคริปต์ล้ม
const KEEP_THAI = /U\+0?E01-0?E5B/i;
const KEEP_LATIN = /U\+(0000-00FF|\?\?)\b/i; // บล็อกละตินพื้นฐาน (ตัวเลข เครื่องหมาย อังกฤษ)

function parseArgs(argv) {
  const out = { family: "Sarabun", weights: ["400", "500", "600", "700"] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--family") out.family = argv[i + 1];
    if (argv[i] === "--weights") out.weights = String(argv[i + 1] || "").split(",").map((w) => w.trim()).filter(Boolean);
  }
  return out;
}

/** แยก CSS ของ Google Fonts เป็นบล็อก @font-face พร้อม url + unicode-range */
function parseFontFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
    const body = m[1];
    const pick = (re) => (body.match(re) || [])[1] || "";
    return {
      weight: pick(/font-weight:\s*([^;]+);/).trim(),
      style: pick(/font-style:\s*([^;]+);/).trim(),
      url: pick(/url\(([^)]+)\)/).trim(),
      unicodeRange: pick(/unicode-range:\s*([^;]+);/).trim(),
    };
  });
}

async function main() {
  const { family, weights } = parseArgs(process.argv.slice(2));
  const api = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weights.join(";")}&display=swap`;

  const cssRes = await fetch(api, { headers: { "user-agent": WOFF2_UA } });
  if (!cssRes.ok) throw new Error(`ดึง CSS ไม่สำเร็จ (${cssRes.status}) — ${api}`);
  const css = await cssRes.text();

  const faces = parseFontFaces(css).filter(
    (f) => f.style === "normal" && (KEEP_THAI.test(f.unicodeRange) || KEEP_LATIN.test(f.unicodeRange)),
  );
  if (!faces.length) throw new Error("ไม่พบ @font-face ที่ต้องการ — เช็คชื่อ family/weights");

  // เรียงตามน้ำหนักแล้วละติน→ไทย ให้ diff อ่านง่ายและผลลัพธ์คงที่ทุกครั้งที่รัน
  faces.sort((a, b) => Number(a.weight) - Number(b.weight)
    || Number(KEEP_THAI.test(a.unicodeRange)) - Number(KEEP_THAI.test(b.unicodeRange)));

  const blocks = [];
  let bytes = 0;
  for (const face of faces) {
    const res = await fetch(face.url, { headers: { "user-agent": WOFF2_UA } });
    if (!res.ok) throw new Error(`ดาวน์โหลด woff2 ไม่สำเร็จ (${res.status}) — ${face.url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    bytes += buf.length;
    blocks.push(
      `@font-face{font-family:'${family}';font-style:normal;font-weight:${face.weight};font-display:swap;`
      + `src:url(data:font/woff2;base64,${buf.toString("base64")}) format('woff2');`
      + `unicode-range:${face.unicodeRange};}`,
    );
  }

  const kb = Math.round(bytes / 1024);
  const header = [
    `// ฟอนต์เอกสาร (Quotation/Sales Order Master V4) — ฝัง ${family} แบบ self-contained (base64)`,
    "// เพื่อให้ใบพิมพ์/ฉบับตรึง (snapshot) แสดงผลตรงกับแอป (next/font) ทุกที่ แม้ออฟไลน์/ไม่มี CDN.",
    `// GENERATED โดย scripts/generate-document-fonts.mjs (${family}, OFL) — weights ${weights.join("/")}, subset thai+latin.`,
    `// อย่าแก้มือ: รัน \`npm run gen:document-fonts\` ใหม่ถ้าจะอัปเดตฟอนต์. ขนาดฟอนต์รวม ~${kb}KB.`,
    "",
    "export const DOCUMENT_FONT_FACE_CSS = `",
  ].join("\n");

  writeFileSync(OUT, `${header}${blocks.join("\n")}\n\`;\n`, "utf8");
  process.stdout.write(`เขียน ${path.relative(process.cwd(), OUT)} — ${faces.length} บล็อก · ฟอนต์ ~${kb}KB\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
