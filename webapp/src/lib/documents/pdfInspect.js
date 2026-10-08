// ── อ่านข้อเท็จจริงของ PDF ที่ chromium พิมพ์ — จำนวนหน้า · ฟอนต์ที่ฝัง · ขนาด · sha256 ─────────────────
//
// ⭐ ใช้สองที่: ด่านกระดาษก่อนตรึง (จำนวนหน้า PDF ต้องเท่าจำนวนแผ่นของ HTML · ฟอนต์ต้องเป็น Sarabun)
//   กับแถว audit ของไฟล์ที่เก็บ (`{ bytes, sha256, pages, fonts }` — แทนคอลัมน์ sha/ขนาดที่ตารางไม่มี)
//   ย้ายมาจาก `scripts/render-survey-report.mjs` (ตัวเรนเดอร์ทดลองของ PR-1) — ที่นั่น import กลับไปจากที่นี่
//
// 🔑 ไม่ใช้ตัวแกะ PDF: Chrome (Skia) เขียน dictionary ของหน้าและฟอนต์เป็นข้อความเปล่า ไม่ห่อใน object stream
//   ⇒ ค้นด้วย regex บนไบต์ที่อ่านแบบ latin1 ก็พอ และไม่เพิ่ม dependency ให้ route ที่มี chromium อยู่แล้ว
//   ⚠️ ใช้ได้กับ PDF ของ `renderHtmlPdf` เท่านั้น — PDF จากที่อื่นอาจบีบ object พวกนี้ไว้ (นับไม่ได้ = `null` ไม่ใช่ 0)
// ไม่ throw: อินพุตที่ไม่ใช่ไบต์ได้ค่าว่างกลับไป — ผู้เรียกฝั่ง audit เป็น best effort
import { createHash } from 'node:crypto';

/** Buffer ของอินพุต · puppeteer รุ่นใหม่คืน Uint8Array · อย่างอื่น = null */
function bytesOf(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  return null;
}

const countPages = (text) => {
  const hits = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return hits ? hits.length : null;
};

function listFonts(text) {
  const names = new Set();
  for (const m of text.matchAll(/\/(?:BaseFont|FontName)\s*\/([^\s/[\]<>()]+)/g)) names.add(m[1].replace(/^[A-Z]{6}\+/, ''));
  return { names: [...names].sort(), type3: (text.match(/\/Subtype\s*\/Type3/g) || []).length };
}

/** จำนวนหน้าของ PDF — นับ object ชนิด Page (ไม่นับ `/Pages`) · นับไม่ได้ = `null` */
export function pdfPageCount(buffer) {
  const bytes = bytesOf(buffer);
  return bytes ? countPages(bytes.toString('latin1')) : null;
}

/**
 * ฟอนต์ที่ PDF ฝัง — ชื่อจาก `/BaseFont` กับ `/FontName` (ตัดคำนำหน้า subset "ABCDEF+") + จำนวนฟอนต์ Type3 (ไม่มีชื่อ)
 * 🔴 กระดาษฝัง Sarabun ชุด latin + thai เท่านั้น — อักขระนอกชุด ("≤" "⇒" อีโมจิ) ทำให้ Chrome หยิบฟอนต์ของเครื่องมาแทน
 *   (เครื่องนักพัฒนา: Tahoma / Hiragino เป็น Type3) และ chromium บน production มีแต่ Open Sans ⇒ กล่องสี่เหลี่ยมบนกระดาษที่ตรึงแล้ว
 * @returns `{ names: string[], type3: number }` — `names` เรียงตามตัวอักษร ไม่ซ้ำ
 */
export function pdfFonts(buffer) {
  const bytes = bytesOf(buffer);
  return bytes ? listFonts(bytes.toString('latin1')) : { names: [], type3: 0 };
}

/**
 * ข้อเท็จจริงของไฟล์ PDF หนึ่งไฟล์ — รูปเดียวกับที่แถว audit "เก็บกระดาษแล้ว" บันทึกต่อฉบับ
 * @param buffer Buffer หรือ Uint8Array ของ PDF
 * @returns `{ bytes, sha256, pages, fonts: { names, type3 } }` · อินพุตไม่ใช่ไบต์ = `{ bytes: 0, sha256: null, pages: null, fonts ว่าง }`
 */
export function pdfInspect(buffer) {
  const bytes = bytesOf(buffer);
  if (!bytes) return { bytes: 0, sha256: null, pages: null, fonts: { names: [], type3: 0 } };
  const text = bytes.toString('latin1');
  return {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    pages: countPages(text),
    fonts: listFonts(text),
  };
}
