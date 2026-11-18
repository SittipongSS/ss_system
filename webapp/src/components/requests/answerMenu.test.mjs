// ── ปุ่มเดียว "บันทึกคำตอบ ▾" แทนสามปุ่มของแถวที่รอคำตอบลูกค้า (ม-165 PR-3 · มติเจ้าของ 18/11/2026) ─────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const STEP = readFileSync('src/components/requests/NextStepBar.js', 'utf8');
const MENU = readFileSync('src/components/ui/RowActionMenu.js', 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('⭐ กิ่ง outcome เป็นเมนูเดียว "บันทึกคำตอบ" — ไม่เรียงสามปุ่มอีก', () => {
  const step = code(STEP);
  const branch = step.slice(step.indexOf('if (hop === "outcome")'), step.indexOf('return (', step.indexOf('if (hop === "outcome")') + 40));
  assert.match(branch, /<RowActionMenu/);
  assert.match(branch, /triggerLabel="บันทึกคำตอบ"/);
  assert.ok(!/<Button/.test(branch), 'กิ่ง outcome ต้องไม่มีปุ่มเรียงอีก');
  // ทุกคำตอบ (คอนเฟิร์ม · ขอให้แก้ · ไม่เอา) อยู่ในเมนู และเปิดก้าวเดิม — ด่าน/โมดัลไม่เปลี่ยน
  assert.match(branch, /ROW_OUTCOMES\.map/);
  assert.match(branch, /onHop\?\.\(row, "outcome", outcome\)/);
  assert.match(branch, /hopLabel\("outcome", outcome\)/);
});

test('เมนูกลางรองรับปุ่มมีป้าย — ใช้ portal/คีย์บอร์ดตัวเดิม ไม่สร้างดรอปดาวน์ตัวที่สอง', () => {
  const menu = code(MENU);
  assert.match(menu, /triggerLabel = null/);
  assert.match(menu, /\{triggerLabel \? \(/);
  // ปุ่มมีป้ายยังประกาศว่าเปิดเมนู (aria-haspopup · aria-expanded) เหมือนปุ่ม ⋯
  const at = menu.indexOf('{triggerLabel ? (');
  const labelled = menu.slice(at, menu.indexOf(') : (', at));
  assert.match(labelled, /aria-haspopup="menu"/);
  assert.match(labelled, /aria-expanded=\{open\}/);
  assert.match(labelled, /<ChevronDown/);
});
