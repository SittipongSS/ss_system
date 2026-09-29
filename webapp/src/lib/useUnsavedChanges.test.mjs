// ── ยามของ useUnsavedChanges — อ่านซอร์ส (Node ไม่มี DOM) ─────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./useUnsavedChanges.js', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('กล่องถามรับได้ทั้งประโยค (ของเดิม 6 หน้า) และกล่องทั้งกล่อง (จอหน้างาน) — ถือไว้ใน ref ไม่เข้า deps', () => {
  assert.match(SRC, /confirm = null,/);
  assert.match(SRC, /requestRef\.current = confirm \|\| message;/);
  assert.match(SRC, /confirmAction\(requestRef\.current\)/);
  assert.match(SRC, /\}, \[dirty\]\);/, 'ออบเจ็กต์ใหม่ทุกเรนเดอร์ต้องไม่ทำให้ตัวดักถอด/ผูกใหม่');
});

test('🐞 ตอบ "ทิ้ง" ในกล่องของแอปแล้ว เบราว์เซอร์ต้องไม่ถาม "Leave site?" ซ้ำ (UAT 25/09 Chrome ถามสองรอบ)', () => {
  assert.match(SRC, /if \(leaving \|\| Date\.now\(\) < leaveAllowedUntil\) return;\s*event\.preventDefault\(\);/);
  assert.match(SRC, /leaving = true;\s*window\.location\.assign\(url\.href\);/);
});

test('🐞 review 26/09: ตอบ "ทิ้งแล้วออก" ในกล่องของตัวต่อสายประวัติ = เบราว์เซอร์ไม่ถามซ้ำ (อายุสั้น — ออกไม่เกิด รีเฟรชทีหลังยังถาม)', () => {
  assert.match(SRC, /export function allowNextLeave\(ms = 3000\) \{\s*leaveAllowedUntil = Date\.now\(\) \+ ms;/);
  assert.match(SRC, /if \(leaving \|\| Date\.now\(\) < leaveAllowedUntil\) return;/);
  const page = readFileSync(new URL('../app/service/surveys/[id]/page.js', import.meta.url), 'utf8');
  assert.match(page, /confirmAction\(box\)\.then\(\(ok\) => \{\s*if \(ok\) allowNextLeave\(\);/);
});
