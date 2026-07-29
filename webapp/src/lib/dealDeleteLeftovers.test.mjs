// ── ลบดีลแล้วต้องไม่เหลือของค้าง ───────────────────────────────────────────
//
// อาการที่ผู้ใช้รายงาน 2026-07-30: "โครงการที่ลบดีลออกแล้ว ไทม์ไลน์ยังคงค้างอยู่"
// ตรวจ prod แล้วเจอของค้าง 2 ชนิดจากสาเหตุเดียวกัน — เส้นทางลบดีลเก็บกวาดไม่ครบ
// เมื่อลบตามปกติ (ไม่ใช่ break-glass ของแอดมิน):
//   1. งานที่ผูกดีล (personal_tasks.dealId, ไม่มี FK) ค้าง 5 แถวชี้ดีลที่ไม่มีแล้ว
//   2. โครงการที่ไม่เหลือดีลเลย ค้างเป็นโครงเปล่า 3 ใบโดยไม่มีใครรู้ว่ามันว่าง
//
// เทสต์นี้ล็อกทั้งสองอย่าง: ตัวช่วยตรวจโครงเปล่า (unit) + ratchet อ่าน source
// กันการถอย `cleanupDealOrphans` กลับไปอยู่ใต้ `if (force)` และกันการทิ้ง error
// ของคำสั่งลบไทม์ไลน์ (ซึ่งเป็นจุดที่ทำให้ไทม์ไลน์ค้าง**ถาวร** — ดูคอมเมนต์ใน route)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { emptyProjectAfterDealDelete } from './pm/projectsRepo.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEAL_ROUTE = join(SRC, 'app/api/sales-planning/deals/[id]/route.js');

// stub: ตอบ count ต่อ (table, column) — คืน error ได้เพื่อทดสอบทางพัง
function stubCounts(map, errors = {}) {
  return {
    from(table) {
      const builder = {
        select() { return builder; },
        eq(col, val) {
          const key = `${table}:${col}`;
          return Promise.resolve(
            errors[key]
              ? { count: null, error: { message: errors[key] } }
              : { count: map[`${key}:${val}`] ?? map[key] ?? 0, error: null },
          );
        },
      };
      return builder;
    },
  };
}

const project = { id: 'PRJ-1', code: 'PJ-26070028', name: 'KA_Rinvala_SACHET' };

test('emptyProjectAfterDealDelete: ยังมีดีลอื่นผูกอยู่ → ไม่ใช่โครงเปล่า', async () => {
  const supabase = stubCounts({ 'sales_deals:projectId': 2, 'project_tasks:projectId': 32 });
  assert.equal(await emptyProjectAfterDealDelete(supabase, project), null);
});

test('emptyProjectAfterDealDelete: 0 ดีล 0 ขั้นตอน → คืนโครงเปล่าพร้อมรหัส/ชื่อ', async () => {
  const supabase = stubCounts({ 'sales_deals:projectId': 0, 'project_tasks:projectId': 0 });
  const empty = await emptyProjectAfterDealDelete(supabase, project);
  assert.deepEqual(empty, {
    id: 'PRJ-1', code: 'PJ-26070028', name: 'KA_Rinvala_SACHET', tasksLeft: 0,
  });
});

// ขั้นตอนที่เหลือ = งานกลางที่ไม่ได้ผูกดีลใบไหน — ต้องรายงานจำนวนออกไป เพราะการลบ
// โครงการจะพาชุดนี้ไปด้วย ผู้ใช้ต้องเห็นตัวเลขก่อนกดยืนยัน ไม่ใช่รู้ตอนมันหายแล้ว
test('emptyProjectAfterDealDelete: ไม่มีดีลแต่ยังมีขั้นตอนเหลือ → บอกจำนวน', async () => {
  const supabase = stubCounts({ 'sales_deals:projectId': 0, 'project_tasks:projectId': 4 });
  assert.equal((await emptyProjectAfterDealDelete(supabase, project)).tasksLeft, 4);
});

test('emptyProjectAfterDealDelete: ไม่มีโครงการผูก → null (ไม่ต้องยิง query)', async () => {
  const supabase = { from() { throw new Error('ไม่ควรถูกเรียก'); } };
  assert.equal(await emptyProjectAfterDealDelete(supabase, null), null);
});

// query พังต้องไม่ถูกอ่านว่า "นับได้ 0 = โครงเปล่า" — ไม่งั้นจะไปชวนผู้ใช้ลบโครงการ
// ที่ยังมีดีลผูกอยู่ (count = null → 0) ซึ่งเป็นการลบข้อมูลจริงจากความผิดพลาดของ query
test('emptyProjectAfterDealDelete: นับดีลพัง → โยน error ไม่ใช่สรุปว่าว่าง', async () => {
  const supabase = stubCounts({}, { 'sales_deals:projectId': 'column does not exist' });
  await assert.rejects(() => emptyProjectAfterDealDelete(supabase, project), /column does not exist/);
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
