// ── กระดาษของเอกสารทั้งระบบต้องเป็น A4 เท่านั้น ────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-21: *"เอกสารของระบบทั้งระบบ ขนาด A4"*
//
// ตอนตรวจ (2026-08-21) ของจริง **เป็น A4 อยู่แล้วทุกใบ** — เทสต์นี้จึงไม่ใช่การแก้ของเสีย
// แต่เป็นตัวกันไม่ให้ดริฟต์: ขนาดกระดาษเป็นค่าที่ "ใส่ตอนเขียนหน้าใหม่แล้วไม่มีใครเห็น
// จนกว่าจะพิมพ์" · เอกสารชนิดใหม่ที่เผลอตั้ง Letter/Legal หรือขนาดมั่ว ๆ จะแดงที่นี่
//
// ครอบสองชั้นที่กำหนดกระดาษได้จริง:
//   1. `@page { size: … }` — ทุกที่ในซอร์ส (เปลือกเอกสาร + globals ของแอป)
//   2. กล่องกระดาษที่ตั้งความกว้าง/สูงเป็นมิลลิเมตรตายตัว (แผ่นพิมพ์ที่วาดเอง)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { PAPER_SIZES } from './paperSize.js';

const ROOT = path.join(process.cwd(), 'src');

function sourceFiles() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|css)$/.test(entry.name)) out.push(full);
    }
  })(ROOT);
  return out;
}

const rel = (file) => path.relative(process.cwd(), file);

/* ⚠️ ต้องตัดคอมเมนต์ก่อนสแกน — คอมเมนต์ที่พูดถึง "@page" (มีอยู่จริงในเปลือกเอกสาร)
   ทำให้ตัวจับบล็อกวิ่งเลยไปคาบกฎ CSS ถัดไปมาเป็นขนาดกระดาษ */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

test('ทุก @page ในระบบสั่งกระดาษ A4 (แนวตั้งหรือแนวนอนก็ได้)', () => {
  const bad = [];
  for (const file of sourceFiles()) {
    if (/\.test\.mjs$/.test(file)) continue; // เทสต์เขียนสตริงตัวอย่างไว้เทียบ
    /* ⚠️ ตัด `${…}` ทิ้งก่อนสแกน — ปีกกาปิดของตัวแปรใน template literal ทำให้
       ตัวจับบล็อก `{…}` จบก่อนเวลา แล้วไปคาบเอา `font-size: 8.5pt` ของกฎถัดไปมาเป็น
       "ขนาดกระดาษ" (เจอจริงตอนเขียนเทสต์นี้) */
    const source = stripComments(fs.readFileSync(file, 'utf8')).replace(/\$\{[^}]*\}/g, 'VAR');
    for (const block of source.matchAll(/@page[^{]*\{([^}]*)\}/g)) {
      const size = /size:\s*([^;}]+)/.exec(block[1])?.[1]?.trim().replace(/\s+/g, ' ');
      if (!size) continue;
      // เปลือกกลางประกอบค่าจากตัวแปร — ค่าที่เป็นไปได้ถูกล็อกด้วยเทสต์ PAPER_SIZES ด้านล่าง
      if (size === 'VAR') continue;
      if (!/^A4( portrait| landscape)?$/.test(size)) bad.push(`${rel(file)}: size: ${size}`);
    }
  }
  assert.deepEqual(bad, [], `พบกระดาษที่ไม่ใช่ A4:\n${bad.join('\n')}`);
});

test('ขนาดกระดาษของเปลือกเอกสารมีแค่ A4 สองแนว', () => {
  const values = Object.values(PAPER_SIZES).map((paper) => `${paper.width}×${paper.height} (${paper.page})`);
  assert.deepEqual(values.sort(), [
    '210mm×297mm (A4 portrait)',
    '297mm×210mm (A4 landscape)',
  ].sort());
});

test('ไม่มีขนาดกระดาษชนิดอื่นโผล่ในซอร์ส (Letter · Legal · A3 · A5)', () => {
  /* ⚠️ ตรวจ "คำ" ไม่ใช่ตัวเลข — แผ่นพิมพ์หลายที่ตั้งกล่องเนื้อเป็น A4 หักระยะขอบ
     (เช่น 190×277mm = A4 ลบขอบ 10mm) ซึ่งถูกต้องแล้ว ⇒ ห้ามไปจับตัวเลขมั่ว */
  const bad = [];
  for (const file of sourceFiles()) {
    if (/\.test\.mjs$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const hit of source.matchAll(/size:\s*(letter|RA|a3|a5)\b/gi)) {
      bad.push(`${rel(file)}: ${hit[0]}`);
    }
  }
  assert.deepEqual(bad, [], `พบกระดาษชนิดอื่น:\n${bad.join('\n')}`);
});
