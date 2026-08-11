import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ── จัดรูปแบบตัวเลข/วันที่ ต้องผ่าน `lib/format.js` ที่เดียว ──────────────
//
// 🐞 **ของจริงที่หลุดถึงผู้ใช้แล้วสองรอบ**
//   · เงินบนจอเป็น "1,200" แต่ในช่องกรอกเป็น "1,200.00" — คนละหน้าตาในจอเดียวกัน
//     (แถวยุบของ PDR 2.2 · แก้ 2026-08-11)
//   · วันที่บนกระดาษเคยพิมพ์ ISO ดิบ `2026-08-14` ทั้งที่ทั้งระบบเป็น DD/MM/YYYY
//
// สาเหตุเดียวกันทุกครั้ง: `toLocaleString`/`toLocaleDateString` เรียกตรงจากหน้าจอ
// ⇒ แต่ละที่ตั้ง options เอง แล้วเพี้ยนกันโดยไม่มีอะไรฟ้อง · `lib/format.js` มีตัวกลาง
// ครบแล้ว (`fmtMoney` · `fmtNumber` · `fmtDate` · `fmtPercent` · `fmtMoneyCompact`)
//
// ⭐ **เพดานเป็น 0 แล้ว = ด่านห้ามขาด** (2026-08-11) — วันที่ตั้ง ratchet นี้มีของเก่า
// ค้างอยู่ 86 จุด · กวาดครบทั้ง 86 จุดใน 60 ไฟล์แล้ว (82 จุดเป็นตัวเลข → `fmtNumber`
// อีก 4 จุดเป็นวันที่ → `fmtDayMonth` / `fmtMonthShort` ที่เพิ่มเข้า `lib/format.js`)
// ⇒ ตั้งแต่นี้ **เพิ่มใหม่ไม่ได้เลย** ไม่ใช่แค่ห้ามเกินเพดาน
//
// ⚠️ ผลข้างเคียงที่ตั้งใจ: `toLocaleString("th-TH")` ดิบใช้ทศนิยมสูงสุด **3** ตำแหน่ง
// (ค่าตั้งต้นของ Intl) ส่วน `fmtNumber` ใช้ 2 ⇒ จำนวนที่มีเศษเกินสองตำแหน่งจะสั้นลง
// หนึ่งหลัก · ของที่กวาดเป็นจำนวนชิ้น/กิโล/ยอดเงินซึ่งไม่ควรมีหลักที่สามอยู่แล้ว
// และการมีสองมาตรฐานในจอเดียวคือปัญหาที่เทสต์นี้ตั้งมาแก้
//
// ⚠️ ไฟล์ที่ยกเว้นถาวรมีเหตุผลด้านหน้าที่ ไม่ใช่ความสะดวก — ดู `EXEMPT`

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..');

// เพดานปัจจุบัน — **ต้องเป็น 0** · ขึ้นเมื่อไรแปลว่ามีคนเขียนท่าเดิมกลับเข้ามา
const BUDGET = 0;

const EXEMPT = [
  // ตัวกลางเอง — ที่เดียวที่ได้รับอนุญาตให้เรียก Intl ตรง ๆ
  'lib/format.js',
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { walk(full, out); continue; }
    if (full.endsWith('.js')) out.push(full);
  }
  return out;
}

const BANNED = /\.toLocale(String|DateString|TimeString)\(/;

function offenders() {
  const found = [];
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file);
    if (EXEMPT.some((skip) => rel === skip)) continue;
    // ⚠️ ตัดคอมเมนต์ก่อน — คอมเมนต์ที่เตือนห้ามใช้ท่านี้ต้องเขียนชื่อท่าลงไปได้
    // (บทเรียนเดียวกับ businessDate.test.mjs)
    const lines = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .split(/\r?\n/)
      .map((line) => line.replace(/\/\/.*$/, ''));
    lines.forEach((line, index) => {
      if (BANNED.test(line)) found.push(`${rel}:${index + 1}`);
    });
  }
  return found;
}

test('⭐ ห้ามจัดรูปแบบตัวเลข/วันที่เองเลย — ต้องผ่าน lib/format.js', () => {
  const found = offenders();
  assert.ok(
    found.length <= BUDGET,
    `จุดที่เรียก toLocaleString/toLocaleDateString เองเพิ่มเป็น ${found.length} (เพดาน ${BUDGET})\n`
      + `${found.slice(0, 12).join('\n')}\n`
      + 'ใช้ตัวกลางใน `lib/format.js` แทน: fmtMoney · fmtNumber · fmtDate · fmtPercent',
  );
});

test('⚠️ เพดานต้องตรงกับของจริงเป๊ะ — เผื่อไว้เมื่อไรของเก่าไหลกลับเข้ามาเงียบ ๆ', () => {
  const found = offenders();
  assert.equal(
    found.length,
    BUDGET,
    found.length < BUDGET
      ? `เหลือ ${found.length} จุดแล้ว — แก้ BUDGET ในไฟล์นี้เป็น ${found.length} ในคอมมิตเดียวกัน`
      : `เกินเพดาน (${found.length} > ${BUDGET})`,
  );
});

test('ไฟล์ที่ยกเว้นต้องมีอยู่จริง — ชื่อไฟล์ตกยุคทำให้ ratchet หลวมโดยไม่มีใครรู้', () => {
  const all = new Set(walk(SRC).map((f) => path.relative(SRC, f)));
  for (const rel of EXEMPT) assert.equal(all.has(rel), true, `EXEMPT อ้างไฟล์ที่ไม่มีแล้ว: ${rel}`);
});
