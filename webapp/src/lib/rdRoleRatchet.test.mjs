// ── ด่านกันถอยหลัง: ห้ามเทียบ `role === 'rd'` ตรง ๆ อีก ────────────────────
//
// ⭐ ฝ่าย RD มีสี่ตำแหน่งตั้งแต่ 2026-09-01 (`RD_ROLES` · `isRdRole`) — เดิมมี role
// เดียวจึงเทียบสตริงตรง ๆ ได้ทั้งระบบ 16 จุด
//
// 🐞 กับดักที่ไฟล์นี้กันไว้: จุดที่ตกหล่นจะ **เงียบ ไม่ error** — คนตำแหน่งใหม่
// เสียสิทธิ์ทีละอย่างโดยไม่มีอะไรบนจอบอก (ขอบเขตข้อมูลตกจาก 'all' เหลือ 'team'
// ⇒ ตารางว่างเปล่าทั้งหน้า · แก้สูตร/กลิ่นในทะเบียนไม่ได้ · แท็บ "งานของฉัน" หาย)
// อาการเดียวกับที่คอมเมนต์ของ `OPS_ROLES` เตือนไว้ตอนเลิกใช้ role `staff`
//
// ⚠️ ตรวจ **เฉพาะการเทียบ role กับสตริง `rd`** — คำว่า 'rd' ในความหมายอื่น
// (ชื่อ *ระบบ*/เปลือกเมนู เช่น `systems.js` · `roleContext.js` · เส้นทาง `/rd`)
// ไม่เกี่ยว และต้องไม่ถูกจับผิด
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ไฟล์ที่ประกาศทะเบียนเอง — พูดถึง 'rd' ได้ตามหน้าที่
const ALLOW = new Set([
  path.join(srcRoot, 'lib', 'permissions.js'),
  path.join(srcRoot, 'lib', 'rdRoleRatchet.test.mjs'),
]);

function sourceFiles(dir = srcRoot) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (/\.(js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

/* รูปแบบที่ห้าม — ทั้งสองทิศทางของการเทียบ และทั้ง `role` / `.role`
   ครอบ `!==` ด้วย เพราะ "ไม่ใช่ rd" ก็ตัดตำแหน่งใหม่ทิ้งเหมือนกัน */
const BANNED = /(?:\w+\.)?role\s*[!=]==\s*['"]rd['"]|['"]rd['"]\s*[!=]==\s*(?:\w+\.)?role/;

test('🔒 ไม่มีที่ไหนเทียบ role กับ "rd" ตรง ๆ — ต้องถาม isRdRole()', () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    if (ALLOW.has(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (BANNED.test(line)) {
        offenders.push(`${path.relative(srcRoot, file)}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `เทียบ role === 'rd' ตรง ๆ — ใช้ isRdRole() แทน:\n${offenders.join('\n')}`);
});

test('🔒 ลิสต์ role ที่เขียนมือต้องไม่ลืมตำแหน่งใหม่ของ RD', () => {
  // จับ `[...OPS_ROLES, 'rd']` และญาติ ๆ — ลิสต์แบบนั้นครอบแค่ตำแหน่งเดิมตัวเดียว
  const pattern = /OPS_ROLES\s*,\s*['"]rd['"]/;
  const offenders = [];
  for (const file of sourceFiles()) {
    if (ALLOW.has(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (pattern.test(text)) offenders.push(path.relative(srcRoot, file));
  }
  assert.deepEqual(offenders, [], `ลิสต์ที่ต่อท้ายด้วย 'rd' ตัวเดียว — ใช้ ...RD_ROLES แทน: ${offenders.join(', ')}`);
});
