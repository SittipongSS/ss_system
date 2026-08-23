// ── งานของทีมต้องรวม "ไทม์ไลน์ลอย" ของดีลที่ยังไม่ผูกโครงการ ─────────────────
//
// project_tasks เก็บงานสองแบบในตารางเดียว: ผูกโครงการ (`projectId`) และลอยอยู่กับดีล
// (`projectId = null` + `dealId` — DL1 ใน lib/pm/status.js) · scope ทีมเคยกรองด้วย
// `projectId` ล้วน ⇒ งานของดีลที่ยังไม่ผูกโครงการหายไปจากสายตาหัวหน้าทีมทั้งหมด
// ทั้งที่มีคนทำอยู่จริง (prod 2026-08-22: 81 แถว) — เทสต์นี้ล็อกไม่ให้สาขานั้นหลุดอีก
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const route = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'route.js'), 'utf8');

test('my-work scope=team: project_tasks ต้องดึงทั้งทาง projectId และ dealId', () => {
  assert.match(route, /wheres\.push\(\(q\) => q\.in\('projectId', projIds\)\)/,
    'งานของโครงการในทีมต้องยังติดมาเหมือนเดิม');
  assert.match(route, /wheres\.push\(\(q\) => q\.in\('dealId', dealIds\)\)/,
    'ไทม์ไลน์ลอยของดีลในทีมต้องติดมาด้วย');
  assert.match(route, /whereTeamIn\(supabase\.from\('sales_deals'\)\.select\('id'\), user\)/,
    'ลิสต์ดีลของทีมต้องมาจากตัวกรองทีมกลาง ไม่ใช่เงื่อนไขที่เขียนเองในไฟล์นี้');
});

test('my-work scope=team: ผลจากสองสาขาต้อง dedupe ก่อนส่งออก', () => {
  // ดีลที่ผูกโครงการอยู่แล้วจะเข้าเงื่อนไขทั้งสองสาขา — ไม่ dedupe = งานซ้ำสองแถวบนจอ
  assert.match(route, /seenTask\.has\(t\.id\) \? false : seenTask\.add\(t\.id\)/,
    'ต้องกรองซ้ำด้วย id เหมือนสาขา scope=mine');
});
