// ── งวด P2b ยุบดีล/โครงการ: ไทม์ไลน์เต็มรูปที่หน้าดีล (มติเจ้าของ 13/11/2026 ①②) ─────────────────────────
// ล็อก:
//  1. mig 0436 ย้อน Rev. รายดีล — ขอบเขต dealId · ใส่ dealId/projectId/systemCompleted* กลับ · คอลัมน์ครบตาม project_tasks
//  2. route ไทม์ไลน์ของดีลไม่ส่งดีลในโครงการไป "หน้าโครงการ" อีก · ลบเฉพาะขั้นของดีล
//  3. งานในไทม์ไลน์ใช้ขอบเขตของดีลเมื่อมี dealId (มีโครงการหรือไม่ก็ตาม)
//  4. หน้าดีล: แผงเดียวทุกดีล + ด่านกันออก/ย้อน Rev. ตอนแก้ค้าง
// พฤติกรรมจริงของ 0436 ซ้อมบน Postgres ในหน่วยความจำแล้วตอนเขียน (ย้อนครบ · ดีลอื่นไม่ถูกแตะ · ดีลย้ายโครงการ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dealScopeRow, loadTaskScope } from '../pm/dealTimelineScope.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const MIG = read('../../../supabase/migrations/0436_deal_timeline_restore.sql').replace(/--[^\n]*/g, '');

// คอลัมน์ของ project_tasks บน prod (13/11/2026) — เพิ่มคอลัมน์ใหม่ต้องต่อใน 0436 (และ pm_restore_snapshot) ด้วย
const PROJECT_TASK_COLUMNS = [
  'id', 'projectId', 'stepOrder', 'name', 'role', 'assignee', 'phase', 'isMilestone', 'durationDays', 'startDate',
  'finishDate', 'actualFinishDate', 'status', 'predecessors', 'cellsOverride', 'createdAt', 'updatedAt', 'assigneeId',
  'note', 'showNoteInPrint', 'origin', 'userEdited', 'dueDate', 'startLocked', 'dealId', 'workflowTemplateVersionId',
  'workflowTemplateStepKey', 'actualStartDate', 'systemCompletedAt', 'systemCompletedBy',
];

test('0436: ใส่กลับครบทุกคอลัมน์ของ project_tasks (ยกเว้น createdAt) — คอลัมน์ที่ขาด = ค่าหายเงียบทั้งชุด', () => {
  const list = MIG.match(/INSERT INTO public\.project_tasks \(([\s\S]*?)\)\s*SELECT/);
  assert.ok(list, 'ไม่พบลิสต์คอลัมน์ของ INSERT');
  const cols = [...list[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
  for (const col of PROJECT_TASK_COLUMNS.filter((c) => c !== 'createdAt')) {
    assert.ok(cols.includes(col), `0436 ไม่ได้ใส่คอลัมน์ ${col} กลับ`);
  }
});

test('0436: ขอบเขต = ขั้นของดีลนี้ · projectId = ของดีลตอนย้อน · ตั้ง Rev. + ล้าง "แก้แล้ว" · anon เรียกไม่ได้', () => {
  assert.match(MIG, /DELETE FROM public\.project_tasks WHERE "dealId" = p_deal_id;/);
  assert.doesNotMatch(MIG, /DELETE FROM public\.project_tasks WHERE "projectId"/, 'ห้ามลบทั้งโครงการ — ขั้นของดีลอื่นหาย');
  assert.match(MIG, /SELECT "projectId" INTO v_project_id FROM public\.sales_deals WHERE id = p_deal_id FOR UPDATE;/);
  assert.match(MIG, /t ->> 'id', v_project_id, p_deal_id,/);
  assert.match(MIG, /SET "timelineRev" = p_rev_no,\s+"timelineRevStale" = false/);
  assert.match(MIG, /RAISE EXCEPTION 'deal_timeline_revision_not_found' USING errcode = 'P0002';/);
  assert.match(MIG, /REVOKE ALL ON FUNCTION public\.deal_restore_timeline_revision\(text, integer\) FROM PUBLIC, anon, authenticated;/);
});

test('route ไทม์ไลน์ของดีล: ลบเฉพาะขั้นของดีล · งวด P3b-2 ไม่อ่านโครงการ · สายรับจากโมดัล · ชุดใหม่ไม่ประทับ projectId', () => {
  const route = stripComments(read('../../app/api/sales-planning/deals/[id]/timeline/route.js'));
  assert.doesNotMatch(route, /จัดการไทม์ไลน์ที่หน้าโครงการ/);
  assert.match(route, /\.from\('project_tasks'\)\.delete\(\)\.eq\('dealId', deal\.id\)\.select\('id'\)/);
  assert.doesNotMatch(route, /\.delete\(\)\.eq\('dealId', deal\.id\)\.is\('projectId', null\)/);
  assert.match(route, /type: body\.type, line: body\.line,/, 'มติ ⑫: ดีลเก่าในโครงการเลือกสายได้เหมือนดีลทั่วไป');
  assert.doesNotMatch(route, /attachRowsToProject|projects|projectWriteBlockedError|propagateAndPersist/);
  assert.match(route, /const guard = \(user, deal\) => \(canEditDealTimeline\(user, deal\) \? null : forbidden\(\)\);/, 'ด่านตัวกลางตัวเดียวกับ route Rev.');
});

test('route Rev.: ออก/ย้อน/อ่าน ใช้ด่านของดีล · snapshot ถ่ายจากฐานด้วย dealId', () => {
  const issue = stripComments(read('../../app/api/sales-planning/deals/[id]/timeline/revisions/route.js'));
  assert.match(issue, /loadScoped\(supabase, 'sales_deals', id, user, 'edit'\)/);
  assert.match(issue, /if \(!canEditDealTimeline\(user, deal\)\) return forbidden\(\);/);
  assert.match(issue, /\.from\('project_tasks'\)\.select\('\*'\)\.eq\('dealId', deal\.id\)/);
  assert.match(issue, /insertError\.code === '23505'/, 'ออกเลขชนกัน = 409 ไม่ใช่ 500');
  assert.match(issue, /update\(\{ timelineRev: revNo, timelineRevStale: false \}\)/);
  const restore = stripComments(read('../../app/api/sales-planning/deals/[id]/timeline/restore/route.js'));
  assert.match(restore, /loadScoped\(supabase, 'sales_deals', id, user, 'edit'\)/);
  assert.match(restore, /if \(!canEditDealTimeline\(user, deal\)\) return forbidden\(\);/);
  assert.match(restore, /rpc\('deal_restore_timeline_revision', \{ p_deal_id: deal\.id, p_rev_no: revNo \}\)/);
  const one = stripComments(read('../../app/api/sales-planning/deals/[id]/timeline/revisions/[revNo]/route.js'));
  assert.match(one, /loadScoped\(supabase, 'sales_deals', id, user, 'view'\)/);
});

test('API งาน: ขอบเขตของดีล · งวด P3b-2 กราฟ/ลำดับ/จุดยึดวันเป็นชุดของดีล ไม่อ่านโครงการ', () => {
  const create = stripComments(read('../../app/api/pm/project-tasks/route.js'));
  assert.doesNotMatch(create, /ดีลนี้ผูกโครงการแล้ว — เพิ่มขั้นตอนด้วย projectId/);
  assert.match(create, /if \(!body\.dealId\) return badRequest\('ต้องระบุ dealId'\);/);
  assert.match(create, /inScope\(pmEditScope\(user\?\.role\), user, dealScopeRow\(deal\)\)/);
  assert.match(create, /\.eq\('dealId', deal\.id\)\.order\('stepOrder', \{ ascending: true \}\)/);
  assert.doesNotMatch(create, /projectId|projects|resolveSchedule|export const GET/);
  const one = stripComments(read('../../app/api/pm/project-tasks/[id]/route.js'));
  assert.match(one, /await loadTaskScope\(supabase, id\)/);
  assert.doesNotMatch(one, /loadTaskWithProject|resolveSchedule|projectWriteBlockedError|entityType: 'project'/);
  assert.equal((one.match(/\.eq\('dealId', task\.dealId\)\.order\('stepOrder', \{ ascending: true \}\)/g) || []).length, 2, 'PATCH + DELETE คำนวณใหม่ในชุดของดีล');
  assert.equal((one.match(/await propagateAndPersist\(supabase, task\.dealId\);/g) || []).length, 2);
});

function fakeSupabase(tables) {
  return {
    from(table) {
      const filters = [];
      const chain = {
        select() { return chain; },
        eq(col, val) { filters.push((r) => r[col] === val); return chain; },
        maybeSingle() {
          const row = (tables[table] || []).find((r) => filters.every((f) => f(r))) || null;
          return Promise.resolve({ data: row, error: null });
        },
      };
      return chain;
    },
  };
}

test('ขอบเขตงาน: ขอบเขตของดีลเสมอ (แม้มีโครงการค้าง) · ไม่มีดีล = ไม่มีขอบเขต · แถวดีลพก ownerId', async () => {
  const supabase = fakeSupabase({
    project_tasks: [
      { id: 'T1', projectId: 'P1', dealId: 'D1' },
      { id: 'T2', projectId: 'P1', dealId: null },
    ],
    sales_deals: [{ id: 'D1', team: 'KA', ownerId: 'u-ae', ownerName: 'AE', projectId: 'P1' }],
    projects: [{ id: 'P1', team: 'ODM', aeOwner: 'AE โครงการ', ownerId: 'u-creator' }],
  });
  const dealTask = await loadTaskScope(supabase, 'T1');
  assert.deepEqual(dealTask.scopeRow, { team: 'KA', ownerId: 'u-ae', aeOwner: 'AE' });
  assert.ok(!('project' in dealTask), 'งวด P3b-2: ไม่โหลดโครงการแล้ว');
  const central = await loadTaskScope(supabase, 'T2');
  assert.equal(central.scopeRow, null, 'ขั้นที่ไม่มีดีล (prod 0 แถว) ไม่มีขอบเขต = ด่านสิทธิ์ปฏิเสธ');
  assert.equal(dealScopeRow(null), null);
  assert.equal((await loadTaskScope(supabase, 'nope')).task, null);
});

test('หน้าดีล: แผงไทม์ไลน์เดียวทุกดีล · Rev. รับจำนวนแก้ค้าง · ลบทั้งชุดได้ทุกดีล', () => {
  const page = read('../../app/sales-planning/deals/[id]/page.js');
  assert.equal((page.match(/<TimelineWorkspace\b/g) || []).length, 1, 'สองกิ่ง (มี/ไม่มีโครงการ) ต้องรวมเป็นแผงเดียว');
  assert.match(page, /onDirtyChange=\{setTimelineDirty\}/);
  assert.match(page, /<DealTimelineRevControls[\s\S]*?dirtyCount=\{timelineDirty\}/);
  assert.doesNotMatch(page, /data\??\.project\b/, 'งวด P3b-2: หน้าดีลไม่อ่านโครงการ · สายในโมดัลสร้างไทม์ไลน์ไม่ล็อก (มติ ⑫)');
  const controls = read('../../components/salesPlanning/DealTimelineRevControls.js');
  assert.match(controls, /if \(blockedByDrafts\(\)\) return;\s+setNote/, 'ออก Rev. ต้องกันแก้ค้าง');
  assert.match(controls, /const restoreRevision = async \(revNo\) => \{\s+if \(blockedByDrafts\(\)\) return;/, 'ย้อนต้องกันแก้ค้าง');
});
