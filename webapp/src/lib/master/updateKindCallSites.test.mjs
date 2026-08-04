// ทุก kind ที่ **โค้ดเขียนลงเธรดจริง** ต้องอยู่ในทะเบียน UPDATE_KINDS
//
// ⭐ เทสต์ตัวอื่นวนจากทะเบียนออกไป จึงไม่มีวันเห็นว่า route เขียนอะไรลงไปจริง —
// customer/product เขียน kind='note' ที่ไม่เคยประกาศไว้ อยู่มาถึง 25 แถวใน prod
// โดยเทสต์ 79 ตัวผ่านหมด (ดู mig 0200) · ตัวนี้อ่านซอร์สแล้วเทียบกับทะเบียนตรง ๆ
//
// อาการเวลาหลุด: `updateKindMeta` ถอยไปใช้ meta ของชนิดตั้งต้นที่คนพิมพ์ได้ ⇒
// เหตุการณ์ระบบขึ้นป้าย "ข้อความ" เหมือนคนพิมพ์เอง + หายไปตอนกดซ่อนเหตุการณ์ระบบ
//
// ⚠️ ตรวจได้เฉพาะจุดที่เขียน entityType กับ kind เป็นค่าคงที่ในการเรียกเดียวกัน —
// จุดที่ kind มาจาก builder (`...threadEvent`) ตรวจแบบนี้ไม่ได้ ตัวรับคือยาม
// runtime ใน appendUpdate ที่ log error เมื่อเจอ kind นอกทะเบียน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isKnownUpdateKind } from './updateTypes.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return jsFiles(full);
    return name.endsWith('.js') ? [full] : [];
  });
}

// ตัดข้อความของการเรียกหนึ่งครั้งออกมาโดยนับวงเล็บ (อาร์กิวเมนต์มี object ซ้อน)
function callBody(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(openIdx, i);
    }
  }
  return text.slice(openIdx);
}

function callSites() {
  const found = [];
  for (const file of jsFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    // เฉพาะไฟล์ที่ใช้เธรดของกลาง — โมดูลบริหารมี appendUpdate ของตัวเอง
    // (lib/mgmt/repo.js เขียนลงตาราง mgmt_updates ซึ่งไม่มีทะเบียนชนิด)
    if (!/import\s*{[^}]*\bappendUpdate\b[^}]*}\s*from\s*'@\/lib\/master\/updates'/.test(text)) continue;
    for (const m of text.matchAll(/\bappendUpdate\s*\(/g)) {
      const body = callBody(text, m.index + m[0].length - 1);
      const entityType = body.match(/entityType:\s*'([a-z_]+)'/)?.[1];
      const kind = body.match(/\bkind:\s*'([a-z_]+)'/)?.[1];
      if (entityType && kind) {
        found.push({ file: path.relative(SRC, file), entityType, kind });
      }
    }
  }
  return found;
}

test('kind ที่เขียนลงเธรดตรง ๆ ในโค้ด ต้องอยู่ในทะเบียนของ entity นั้น', () => {
  const sites = callSites();
  // กันเทสต์ตายเงียบ: regex พังเมื่อไรจะเจอ 0 จุดแล้วผ่านฉลุย
  assert.ok(sites.length >= 3, `หาจุดเรียก appendUpdate แบบค่าคงที่ไม่เจอ (${sites.length}) — regex น่าจะพัง`);
  const bad = sites.filter((s) => !isKnownUpdateKind(s.entityType, s.kind));
  assert.deepEqual(
    bad, [],
    `kind นอกทะเบียน: ${bad.map((s) => `${s.file} → ${s.entityType}.${s.kind}`).join(' · ')}`,
  );
});
