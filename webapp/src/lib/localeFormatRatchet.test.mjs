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
// ⭐ **นี่คือ ratchet ไม่ใช่ด่านห้ามขาด** — วันที่เขียนเทสต์นี้มีของเก่าค้างอยู่ 86 จุด
// การกวาดรวดเดียวเสี่ยงเกินไป (แต่ละจุดมี options ของตัวเอง แก้พลาดแล้วตัวเลขบน
// เอกสารเพี้ยนเงียบ) ⇒ **ห้ามเพิ่ม ลดได้เสมอ** · ลดแล้วรูดเพดานลงในคอมมิตเดียวกัน
//
// ⚠️ ไฟล์ที่ยกเว้นถาวรมีเหตุผลด้านหน้าที่ ไม่ใช่ความสะดวก — ดู `EXEMPT`

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..');

// เพดานปัจจุบัน — **ลดได้ ห้ามขึ้น**
const BUDGET = 86;

const EXEMPT = [
  // ตัวกลางเอง — ที่เดียวที่ได้รับอนุญาตให้เรียก Intl ตรง ๆ
  'lib/format.js',
  // ตัวจัดรูปแบบของหน้าเอกสาร/พิมพ์ที่ผูกกับ locale ของกระดาษโดยตรง จะย้ายเมื่อ
  // ยกเครื่องตัวสร้างเอกสารรอบหน้า (มีของเก่าอยู่ในเพดานแล้ว ไม่ใช่ข้อยกเว้นใหม่)
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

test('⭐ ratchet: จำนวนจุดที่จัดรูปแบบเองห้ามเพิ่ม (ลดได้เสมอ)', () => {
  const found = offenders();
  assert.ok(
    found.length <= BUDGET,
    `จุดที่เรียก toLocaleString/toLocaleDateString เองเพิ่มเป็น ${found.length} (เพดาน ${BUDGET})\n`
      + `${found.slice(0, 12).join('\n')}\n`
      + 'ใช้ตัวกลางใน `lib/format.js` แทน: fmtMoney · fmtNumber · fmtDate · fmtPercent',
  );
});

test('⚠️ ลดได้แล้วต้องรูดเพดานลง — ไม่งั้นของเก่าไหลกลับเข้ามาแทนที่เงียบ ๆ', () => {
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
