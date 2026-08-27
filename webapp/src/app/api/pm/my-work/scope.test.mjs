// ── งานของทีมต้องรวม "งานลอย" ของดีลที่ยังไม่ผูกโครงการ ─────────────────────
//
// งานเก็บสองแบบในตารางเดียว: ผูกโครงการ (`projectId`) และลอยอยู่กับดีล
// (`projectId = null` + `dealId` — DL1 ใน lib/pm/status.js) · scope ทีมเคยกรองด้วย
// `projectId` ล้วน ⇒ งานของดีลที่ยังไม่ผูกโครงการหายไปจากสายตาหัวหน้าทีมทั้งหมด
// ทั้งที่มีคนทำอยู่จริง (prod 2026-08-22: 81 แถว) — เทสต์นี้ล็อกไม่ให้สาขานั้นหลุดอีก
//
// 🪤 กติกานี้เคยอยู่บนสาขา `project_tasks` ซึ่งถอดออกแล้ว (ไม่มีจอไหนอ่าน — ดูหัวไฟล์
// route.js) · ตัวที่ยังเสิร์ฟจออยู่คือ `personal_tasks` จึงย้ายมาล็อกที่สาขานั้นแทน
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const route = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'route.js'), 'utf8');

test('my-work scope=team: ต้องดึงทั้งทาง projectId และ dealId', () => {
  assert.match(route, /queries\.push\(\(q\) => q\.in\('projectId', teamProjIds\)\)/,
    'งานของโครงการในทีมต้องยังติดมาเหมือนเดิม');
  assert.match(route, /queries\.push\(\(q\) => q\.in\('dealId', teamDealIds\)\)/,
    'งานลอยของดีลในทีมต้องติดมาด้วย');
  assert.match(route, /whereTeamIn\(supabase\.from\('sales_deals'\)\.select\('id'\), user\)/,
    'ลิสต์ดีลของทีมต้องมาจากตัวกรองทีมกลาง ไม่ใช่เงื่อนไขที่เขียนเองในไฟล์นี้');
});

test('my-work scope=team: ผลจากหลายสาขาต้อง dedupe ก่อนส่งออก', () => {
  // ดีลที่ผูกโครงการอยู่แล้วจะเข้าเงื่อนไขมากกว่าหนึ่งสาขา — ไม่ dedupe = งานซ้ำบนจอ
  assert.match(route, /seenP\.has\(t\.id\) \? false : seenP\.add\(t\.id\)/,
    'ต้องกรองซ้ำด้วย id');
});

test('my-work: ห้ามดึง project_tasks กลับมาโดยไม่ได้ตั้งใจ', () => {
  // ตารางนี้ 4,653 แถว · `select(*)` ทั้งตาราง = 3.45 MB ต่อการเปิดหน้าหนึ่งครั้ง
  // ที่ไม่มีจอไหนอ่าน — ถ้าจะเอากลับต้องแก้เทสต์นี้พร้อมกับอ่านหัวไฟล์ route.js ก่อน
  assert.doesNotMatch(route, /from\('project_tasks'\)/,
    'route นี้ไม่ควรแตะ project_tasks — ดูเหตุผลที่หัวไฟล์ route.js');
});
