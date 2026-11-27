// ยาม "เลขผู้เสียภาษีออกรูปเดียวทั้งระบบ" (คำขอเจ้าของ 27/11/2026)
//
// ฐานเก็บตัวเลขล้วน (taxIdStore) แต่ช่องกรอก (NationalIdInput) โชว์ 0-1234-56789-01-2 ⇒ ทุกจุดที่วาดเลขลงจอ ·
// กระดาษ · Excel ต้องผ่าน `fmtTaxId` · 🐞 ก่อนหน้านี้หน้าลูกค้าใส่ขีด แต่ QT/SO/สัญญา/FM-SA-04/ทะเบียนสรรพสามิต
// พิมพ์ค่าดิบ ⇒ ลูกค้า 607 รายออกเลขไม่มีขีด อีก 3 รายที่เก็บแบบมีขีดยุคเก่า (บางรายขีดผิดตำแหน่ง) ออกอีกรูป
//
// ยามนี้สแกนซอร์สหารูปที่เอาคีย์ชื่อ *taxId* ไปวางตรง ๆ: `{x.taxId}` · `${x.taxId}` · `value: x.taxId` · `val(x.taxId)`
// ช่องกรอก (`value={form.taxId}` ของ NationalIdInput) ไม่นับ — มันจัดขีดเองตอนพิมพ์
// ⚠️ จับได้เฉพาะรูปที่พบบ่อย (ลองกับซอร์สก่อนแก้เจอ 4 จาก ~20 จุด) — รูปอื่นอย่าง `naText(r.taxId)` หรือคีย์โมเดล
//    `taxId: quote.customerTaxId` หลุดได้ ⇒ จุดใหม่ที่วาดเลขภาษีให้ใช้ fmtTaxId เอง อย่าพึ่งยามนี้อย่างเดียว
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..');
const RAW_RENDER = [
  /\{\s*[\w$.?]*[tT]axId\s*\}/,              // JSX {row.taxId}
  /\$\{\s*[\w$.?]*[tT]axId\s*\}/,            // template `${co.taxId}`
  /\bvalue:\s*[\w$.?]*[tT]axId\s*(\|\||,|\})/, // { label, value: q.customerTaxId }
  /\bval\(\s*[\w$.?]*[tT]axId\s*\)/,         // documentShell val(company.taxId)
];
const SKIP_DIR = new Set(['api']);

function* sourceFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) yield* sourceFiles(full);
    } else if (/\.(js|jsx|mjs)$/.test(entry.name) && !/\.test\.mjs$/.test(entry.name)) {
      yield full;
    }
  }
}

test('ไม่มีจุดไหนวาดเลขผู้เสียภาษีดิบ — ต้องผ่าน fmtTaxId (รูปเดียวกับช่องกรอก)', () => {
  const hits = [];
  for (const file of sourceFiles(SRC)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/NationalIdInput|fmtTaxId\(/.test(line)) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (/^\s*import\b/.test(line)) return;
      if (RAW_RENDER.some((re) => re.test(line))) hits.push(`${path.relative(SRC, file)}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(hits, [], 'เลขผู้เสียภาษีที่วาดตรง ๆ — ห่อด้วย fmtTaxId จาก @/lib/format');
});
