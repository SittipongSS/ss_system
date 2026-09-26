#!/usr/bin/env node
/* ── รอยต่อคำไทยที่เบราว์เซอร์อ่านผิด ต้องไม่เพิ่มขึ้น ────────────────────────
 *
 * 🐞 **ที่มา (UAT 2026-09-07)**: บนมือถือ คำโปรยหน้าจัดทีมขึ้นบรรทัดใหม่กลางคำ
 *   `…ย้ายคนแล้วดี` / `ล/เป้าที่ค้าง…`
 *   ไม่มี CSS ตัวไหนแก้ได้ (วัดครบแล้ว ดู `src/lib/thaiWrap.js`) เพราะเบราว์เซอร์
 *   ตัดบรรทัดไทยด้วย **พจนานุกรม ICU** · คำทับศัพท์ที่พจนานุกรมไม่รู้จักจะไป
 *   **ขโมยตัวสะกดของคำหน้า** (`ของ+ดีล` ⇒ `ขอ|งดีล`) แล้วจุดตัดไปตกตรงรอยต่อปลอมนั้น
 *
 * ⚠️ ใช้ `Intl.Segmenter('th')` ของ Node — **ICU ชุดเดียวกับที่ Chrome ใช้**
 *   ⇒ ด่านนี้วัดของจริงได้โดยไม่ต้องมีเบราว์เซอร์ ไม่ต้องมี secret รันได้ทุกที่รวม CI
 *
 * ⚠️ **ทำไมเป็นเพดาน ไม่ใช่ศูนย์** — ตัวตรวจนี้เป็นสถิติ ไม่ใช่พจนานุกรม: มันเดา
 *   "คำจริง" จากท่อนที่โผล่ซ้ำทั่วคอร์ปัสเอง ⇒ มีบวกลวงติดมาเสมอ (เช่น ICU แยก
 *   คำประสม `ข้อ|มูล` `พื้น|ที่` ซึ่งอ่านออกอยู่แล้ว) · สิ่งที่มีค่าคือ **ตัวเลขต้องไม่โต**
 *   เพิ่มคำทับศัพท์ใหม่เข้าแอปเมื่อไรตัวเลขจะเด้งขึ้น แล้วด่านนี้จะชี้ให้เห็นว่าคำไหน
 *
 * แก้เมื่อด่านแดง: ดูรายการที่พิมพ์ออกมา · คำไหนเป็นคำทับศัพท์จริง ให้เติมใน
 * `THAI_LOANWORDS` ที่ `src/lib/thaiWrap.js` (เทสต์ `thaiWrap.test.mjs` จะยืนยัน
 * ให้เองว่าเติมแล้วหายเพี้ยนจริง) แล้วลดเพดานลงตามผลใหม่
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { thaiWrapText, THAI_LOANWORDS } from '../src/lib/thaiWrap.js';

/* 🔴 เพดาน — ขึ้นไม่ได้ ลงได้อย่างเดียว (วัด 2026-09-07: ก่อนแปลง 419 · หลังแปลง 23)
   ลดเป็น 21 เมื่อ 2026-09-17 หลังเติม `สเปค`/`สเปก` ลงทะเบียนคำทับศัพท์ (ใบสเปค FM-SA-04)
   ลดเป็น 20 เมื่อ 2026-09-25 หลังตัดรอยต่อที่เป็นไปไม่ได้ (ท่อนที่เหลือขึ้นต้นด้วยสระเกาะ — ดู badJunctions)
   ออกจากการนับ · วัดบน main ก่อนงานนี้ได้ 20 เท่ากัน (ตัดบวกลวง `ท่อ+น้ำ` ไป 1)
   ลดเป็น 19 เมื่อ 2026-09-25 หลังเติม `ม็อก` ลงทะเบียนคำทับศัพท์ (จอหน้างานแบบ A §10.5 S8 — คำนี้ถี่ขึ้นจนตัวตรวจจับ
   `ม็|อกทะเบียน` ได้ · เติมแล้วรอยต่อนั้นหาย และ `จา|กม็|อก` · `ขอ|งม็|อก` ไม่เกิดอีก) */
const CEILING = 19;

const THAI_WORD = /^[฀-๿]+$/;
const HAS_THAI = /[฀-๿]/;
const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
const segments = (s) => [...segmenter.segment(s)].map((x) => x.segment);

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(path);
  }
  return out;
}

/** ข้อความไทยที่ยาวพอจะขึ้นบรรทัดใหม่ — สตริงลิเทอรัลและข้อความใน JSX */
function thaiStrings(src, into) {
  for (const m of src.matchAll(/["`']([^"`'\n]{12,240})["`']/g)) {
    if (HAS_THAI.test(m[1])) into.add(m[1]);
  }
  for (const m of src.matchAll(/>\s*([^<>{}\n]{12,240})\s*</g)) {
    const s = m[1].trim();
    if (HAS_THAI.test(s)) into.add(s);
  }
}

const strings = new Set();
for (const file of sourceFiles('src')) thaiStrings(readFileSync(file, 'utf8'), strings);
const corpus = [...strings];

/* "คำจริง" = ท่อนที่ ICU ตัดออกมาซ้ำ ๆ ทั่วคอร์ปัส — ใช้เป็นหลักฐานว่าท่อนที่สั้นกว่า
   ในรอยต่อหนึ่ง ๆ คือของเสีย (ตัวสะกดถูกขโมยไป) */
const freq = new Map();
for (const s of corpus) {
  for (const w of segments(s)) if (THAI_WORD.test(w)) freq.set(w, (freq.get(w) || 0) + 1);
}
const real = new Set([...freq].filter(([w, n]) => n >= 5 && w.length >= 2).map(([w]) => w));

function badJunctions(list) {
  const found = new Map();
  for (const s of list) {
    const segs = segments(s);
    for (let i = 0; i < segs.length - 1; i += 1) {
      const a = segs[i];
      const b = segs[i + 1];
      if (!THAI_WORD.test(a) || !THAI_WORD.test(b)) continue;
      const joined = a + b;
      for (let len = a.length + 1; len <= Math.min(joined.length, a.length + 3); len += 1) {
        const candidate = joined.slice(0, len);
        /* 🪤 ท่อนที่เหลือขึ้นต้นด้วยสระ/วรรณยุกต์ที่เกาะพยัญชนะ = รอยต่อที่เป็นไปไม่ได้ ไม่ใช่ตัวสะกดถูกขโมย
           🐞 เจอ 2026-09-25: `รอ+บัญชี` ⇒ "ควรเป็น รอบ…" ทั้งที่เหลือ `ัญชี` (ขึ้นต้นด้วยไม้หันอากาศ) · `ท่อ+น้ำ` ⇒
              "ท่อน…" เหลือ `้ำ` — ICU ตัดถูกทั้งคู่ แต่ตัวตรวจเดาตามความถี่: ข้อความ "…ของรอบก่อน" เพิ่มเข้าคอร์ปัส
              จน `รอบ` ถี่กว่า `รอ` แล้วเพดานแดงเพราะคำว่า "รอบัญชี" ที่ไม่ได้แตะเลย 13 จุด
           ⚠️ ไม่ตัดของจริงทิ้ง: ตัวสะกดที่ถูกขโมยคือพยัญชนะ ⇒ ท่อนที่เหลือคือคำทับศัพท์ ซึ่งขึ้นต้นด้วยพยัญชนะ
              หรือสระหน้า (เ แ โ ใ ไ) เสมอ (`ขอ+งดีล` ⇒ เหลือ `ดีล` · `จา+กลี` ⇒ เหลือ `ลี`) — สระหน้าไม่อยู่ในช่วงนี้ */
        if (/^[\u0E30-\u0E3A\u0E45\u0E47-\u0E4E]/u.test(joined.slice(len))) continue; // ะ า ำ ิ–ฺ ๅ ็–๎
        if (!real.has(candidate) || (freq.get(candidate) || 0) <= (freq.get(a) || 0)) continue;
        const key = `${a}+${b}  ⇒ ควรเป็น ${candidate}…`;
        if (!found.has(key)) found.set(key, { count: 0, example: s.slice(0, 60) });
        found.get(key).count += 1;
        break;
      }
    }
  }
  return found;
}

const before = badJunctions(corpus);
const after = badJunctions(corpus.map(thaiWrapText));
const total = [...after.values()].reduce((sum, v) => sum + v.count, 0);
const beforeTotal = [...before.values()].reduce((sum, v) => sum + v.count, 0);

if (total > CEILING) {
  console.error(`\n❌ รอยต่อคำไทยที่เบราว์เซอร์อ่านผิดเพิ่มขึ้น: ${total} (เพดาน ${CEILING})\n`);
  for (const [key, info] of [...after].sort((a, b) => b[1].count - a[1].count).slice(0, 15)) {
    console.error(`   ${info.count}× ${key}\n      เช่น: ${info.example}…`);
  }
  console.error('\nคำไหนเป็นคำทับศัพท์จริง ให้เติมใน THAI_LOANWORDS ที่ src/lib/thaiWrap.js');
  console.error('แล้วลดเพดานใน scripts/check-thai-wrap.mjs ตามผลใหม่\n');
  process.exit(1);
}

console.log(
  `check:thaiwrap ผ่าน — ตรวจ ${corpus.length} ข้อความไทย · รอยต่อที่อ่านผิด `
  + `${beforeTotal} ⇒ ${total} หลังใส่ขอบคำ (เพดาน ${CEILING} ขึ้นไม่ได้) · `
  + `ทะเบียนคำทับศัพท์ ${THAI_LOANWORDS.length} คำ`,
);
