// ── ลบดีลแล้วต้องไม่เหลือของค้าง ───────────────────────────────────────────
//
// อาการที่ผู้ใช้รายงาน 2026-07-30: "โครงการที่ลบดีลออกแล้ว ไทม์ไลน์ยังคงค้างอยู่"
// ตรวจ prod แล้วเจอของค้าง 2 ชนิดจากสาเหตุเดียวกัน — เส้นทางลบดีลเก็บกวาดไม่ครบ
// เมื่อลบตามปกติ (ไม่ใช่ break-glass ของแอดมิน):
//   1. งานที่ผูกดีล (personal_tasks.dealId, ไม่มี FK) ค้าง 5 แถวชี้ดีลที่ไม่มีแล้ว
//   2. โครงการที่ไม่เหลือดีลเลย ค้างเป็นโครงเปล่า 3 ใบโดยไม่มีใครรู้ว่ามันว่าง
//      (P3a 16/11: เลิกเสนอลบแล้ว — โครงการเก็บเป็นประวัติ)
//
// เทสต์นี้ล็อก ratchet อ่าน source
// กันการถอย `cleanupDealOrphans` กลับไปอยู่ใต้ `if (force)` และกันการทิ้ง error
// ของคำสั่งลบไทม์ไลน์ (ซึ่งเป็นจุดที่ทำให้ไทม์ไลน์ค้าง**ถาวร** — ดูคอมเมนต์ใน route)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEAL_ROUTE = join(SRC, 'app/api/sales-planning/deals/[id]/route.js');

// ⭐ P3a (มติ 16/11 ⑩): เลิกเสนอให้ลบโครงการเปล่าหลังลบดีลแล้ว — โครงการเก็บเป็นประวัติ ห้ามลบแถว
test('ลบดีล: ไม่ตรวจ/ไม่เสนอลบโครงการเปล่าอีก (โครงการเป็นประวัติ)', () => {
  const src = readFileSync(DEAL_ROUTE, 'utf8');
  assert.doesNotMatch(src, /emptyProjectAfterDealDelete|emptyProject\b/);
});

// ── ratchet: อ่าน source ของ route (ตัดคอมเมนต์ก่อน ไม่งั้นจับคำในคำอธิบายเอง) ──
const codeOnly = (path) => readFileSync(path, 'utf8')
  .split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');

test('ลบดีล: cleanupDealOrphans ต้องทำงานทุกครั้ง ไม่ใช่เฉพาะตอน force', () => {
  const src = codeOnly(DEAL_ROUTE);
  assert.match(src, /await cleanupDealOrphans\(/);
  // เดิมเป็น `if (force) await cleanupDealOrphans(supabase, id);` → ลบดีลปกติทิ้งงานค้าง
  assert.doesNotMatch(src, /if\s*\(\s*force\s*\)[^\n]*cleanupDealOrphans/);
});

test('ลบดีล: คำสั่งลบไทม์ไลน์ต้องรับ error และหยุดก่อนลบแถวดีล', () => {
  const src = codeOnly(DEAL_ROUTE);
  // FK dealId เป็น SET NULL — ลบดีลสำเร็จทั้งที่ลบ task ไม่สำเร็จ = ขั้นตอนที่เหลือ
  // ถูกล้าง dealId ทิ้ง กลายเป็นแถวไร้เจ้าของที่ตามเก็บไม่ได้อีกเลย
  assert.match(src, /const \{ error: taskError \} = await supabase\s*\n?\s*\.?from\('project_tasks'\)\.delete\(\)\.eq\('dealId', id\)/);
  assert.match(src, /if \(taskError\) return fail\(/);
});
