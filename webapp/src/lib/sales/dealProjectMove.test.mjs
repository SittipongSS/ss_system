// ── ย้ายดีลข้ามโครงการ: ของต้องย้ายครบ และถอนคืนได้ตรงตัวเมื่อพังกลางทาง ──────
//
// ความเสี่ยงจริงของฟีเจอร์นี้ไม่ใช่ "ย้ายไม่ได้" แต่คือ **ย้ายได้ครึ่งเดียว**:
// ดีลไปอยู่โครงการใหม่ แต่งาน/คำร้อง/ใบสั่งขายค้างชี้โครงการเก่า แล้วรายการเดียวกัน
// โผล่ผิดที่ทั้งสองฝั่งโดยไม่มีใครรู้ตัว — เทสต์ชุดนี้ล็อกทั้งทางสำเร็จและทางถอนคืน
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DEAL_PROJECT_MIRROR_TABLES, mirrorCounts, moveDealMirrors, moveSegmentTasks,
  nextStepOrder, planSegmentMove, rollbackSegmentTasks,
} from './dealProjectMove.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// stub: เก็บแถวในหน่วยความจำ + สั่งให้ update ของตารางไหนพังก็ได้
function stubDb(tables, { failUpdate = {}, failSelect = {} } = {}) {
  const rows = structuredClone(tables);
  return {
    rows,
    from(table) {
      const builder = {
        select() { return builder; },
        order() { return builder; },
        eq(column, value) {
          if (failSelect[table]) return Promise.resolve({ data: null, error: { message: failSelect[table] } });
          // คืน "สำเนา" เหมือน supabase จริง — ผู้เรียกที่เผลอถือ reference ของแถว
          // แล้วอ่านค่าเดิมทีหลังจะได้เจอบั๊กที่นี่ ไม่ใช่บน prod
          return Promise.resolve({ data: (rows[table] || []).filter((row) => row[column] === value).map((row) => ({ ...row })), error: null });
        },
        update(patch) {
          const apply = (matcher) => {
            if (failUpdate[table]) return Promise.resolve({ error: { message: failUpdate[table] } });
            for (const row of rows[table] || []) if (matcher(row)) Object.assign(row, patch);
            return Promise.resolve({ error: null });
          };
          return {
            eq: (column, value) => apply((row) => row[column] === value),
            in: (column, values) => apply((row) => values.includes(row[column])),
          };
        },
      };
      return builder;
    },
  };
}

test('planSegmentMove: ต่อท้ายปลายทางตามลำดับเดิม และ pin รากของ segment', () => {
  const plan = planSegmentMove([
    { id: 'T2', stepOrder: 5, predecessors: ['T1'], startLocked: false, projectId: 'PJ-OLD' },
    { id: 'T1', stepOrder: 3, predecessors: [], startLocked: false, projectId: 'PJ-OLD' },
  ], 10, 'PJ-NEW');

  assert.deepEqual(plan.map((move) => move.id), ['T1', 'T2'], 'ต้องเรียงตาม stepOrder เดิม');
  assert.deepEqual(plan[0].to, { projectId: 'PJ-NEW', stepOrder: 10, startLocked: true });
  // ขั้นที่มี predecessor ไม่ถูกบังคับ pin — วันของมันคำนวณจากขั้นก่อนหน้าอยู่แล้ว
  assert.deepEqual(plan[1].to, { projectId: 'PJ-NEW', stepOrder: 11, startLocked: false });
  assert.deepEqual(plan[0].from, { projectId: 'PJ-OLD', stepOrder: 3, startLocked: false });
});

test('nextStepOrder: โครงการว่าง = 0 · มีของแล้ว = ท้ายสุด + 1', () => {
  assert.equal(nextStepOrder([]), 0);
  assert.equal(nextStepOrder([{ stepOrder: 0 }, { stepOrder: 7 }, { stepOrder: 3 }]), 8);
});

test('moveSegmentTasks: ย้ายครบทุกแถว', async () => {
  const db = stubDb({ project_tasks: [
    { id: 'T1', projectId: 'PJ-OLD', stepOrder: 0, predecessors: [], startLocked: false },
    { id: 'T2', projectId: 'PJ-OLD', stepOrder: 1, predecessors: ['T1'], startLocked: false },
  ] });
  const plan = planSegmentMove(db.rows.project_tasks, 4, 'PJ-NEW');
  const applied = await moveSegmentTasks(db, plan);

  assert.equal(applied.length, 2);
  assert.deepEqual(db.rows.project_tasks.map((t) => [t.projectId, t.stepOrder]), [['PJ-NEW', 4], ['PJ-NEW', 5]]);
});

test('moveSegmentTasks: พังกลางทาง → ถอนคืนแถวที่ย้ายไปแล้ว แล้วโยน error', async () => {
  const db = stubDb({ project_tasks: [{ id: 'T1', projectId: 'PJ-OLD', stepOrder: 2, predecessors: [], startLocked: false }] });
  const plan = planSegmentMove(db.rows.project_tasks, 0, 'PJ-NEW');
  await moveSegmentTasks(db, plan);
  // ย้ายแล้วรอบแรก — รอบสองสั่งให้ update พัง เพื่อดูว่าถอนคืนกลับค่าเดิมไหม
  const broken = stubDb({ project_tasks: [{ id: 'T1', projectId: 'PJ-OLD', stepOrder: 2, predecessors: [], startLocked: false }] }, { failUpdate: { project_tasks: 'db ล่ม' } });
  await assert.rejects(
    () => moveSegmentTasks(broken, planSegmentMove(broken.rows.project_tasks, 0, 'PJ-NEW')),
    /ย้ายไทม์ไลน์ของดีลไม่สำเร็จ/,
  );
  assert.equal(broken.rows.project_tasks[0].projectId, 'PJ-OLD', 'แถวต้องไม่ขยับเมื่อย้ายไม่สำเร็จ');
});

test('rollbackSegmentTasks: คืนทั้ง projectId/stepOrder/startLocked ของเดิม', async () => {
  const db = stubDb({ project_tasks: [{ id: 'T1', projectId: 'PJ-OLD', stepOrder: 2, predecessors: [], startLocked: false }] });
  const applied = await moveSegmentTasks(db, planSegmentMove(db.rows.project_tasks, 9, 'PJ-NEW'));
  await rollbackSegmentTasks(db, applied);
  assert.deepEqual(
    { ...db.rows.project_tasks[0], predecessors: undefined },
    { id: 'T1', projectId: 'PJ-OLD', stepOrder: 2, startLocked: false, predecessors: undefined },
  );
});

test('moveDealMirrors: งาน/คำร้อง/ใบสั่งขาย ย้ายตามดีลครบทุกตาราง', async () => {
  const db = stubDb({
    personal_tasks: [{ id: 'PT1', dealId: 'D1', projectId: 'PJ-OLD' }, { id: 'PT2', dealId: 'D2', projectId: 'PJ-OLD' }],
    dept_requests: [{ id: 'RQ1', dealId: 'D1', projectId: null }],
    sales_orders: [{ id: 'SO1', dealId: 'D1', projectId: 'PJ-OLD' }],
  });
  const applied = await moveDealMirrors(db, { dealId: 'D1', toProjectId: 'PJ-NEW' });

  assert.deepEqual(mirrorCounts(applied), { personal_tasks: 1, dept_requests: 1, sales_orders: 1 });
  assert.equal(db.rows.personal_tasks[0].projectId, 'PJ-NEW');
  assert.equal(db.rows.personal_tasks[1].projectId, 'PJ-OLD', 'ดีลอื่นต้องไม่โดนย้ายด้วย');
  assert.equal(db.rows.dept_requests[0].projectId, 'PJ-NEW');
  assert.equal(db.rows.sales_orders[0].projectId, 'PJ-NEW');
});

test('moveDealMirrors: ตารางกลางทางพัง → ถอนคืนตารางก่อนหน้าเป็นค่าเดิม "รายแถว"', async () => {
  const db = stubDb({
    // สองแถวคนละค่าเดิม — ถอนคืนแบบเหมารวมจะทำให้ RQ ที่เคยว่างได้โครงการเกินมา
    personal_tasks: [{ id: 'PT1', dealId: 'D1', projectId: 'PJ-OLD' }, { id: 'PT2', dealId: 'D1', projectId: null }],
    dept_requests: [{ id: 'RQ1', dealId: 'D1', projectId: 'PJ-OLD' }],
    sales_orders: [],
  }, { failUpdate: { dept_requests: 'db ล่ม' } });

  await assert.rejects(() => moveDealMirrors(db, { dealId: 'D1', toProjectId: 'PJ-NEW' }), /dept_requests/);
  assert.deepEqual(db.rows.personal_tasks.map((row) => row.projectId), ['PJ-OLD', null]);
});

test('moveDealMirrors: อ่านตารางไม่ได้ = หยุด ไม่ใช่เดินต่อแบบตาบอด', async () => {
  const db = stubDb({ personal_tasks: [], dept_requests: [], sales_orders: [] }, { failSelect: { personal_tasks: 'อ่านไม่ได้' } });
  await assert.rejects(() => moveDealMirrors(db, { dealId: 'D1', toProjectId: 'PJ-NEW' }), /personal_tasks/);
});

// ── ratchet บน route: ด่านและการถอนคืนต้องไม่หายไปเงียบ ๆ ────────────────────
test('link-project route: ย้ายได้เฉพาะเมื่อสั่ง move และถอนคืนเมื่อ mirror พัง', () => {
  const route = readFileSync(join(SRC, 'app/api/sales-planning/deals/[id]/link-project/route.js'), 'utf8');
  assert.match(route, /movingFrom && !body\.move/, 'ดีลที่มีโครงการต้องยัง 409 เมื่อไม่ได้สั่ง move');
  assert.match(route, /dealUpdate\.eq\('projectId', fromProject\.id\)/, 'การย้ายต้อง guard ว่ายังอยู่โครงการเดิม');
  assert.match(route, /rollbackSegmentTasks\(supabase, movedSegment\)/, 'mirror พังแล้วต้องถอนไทม์ไลน์คืน');
});

test('รายชื่อตาราง mirror ตรงกับที่ตั้งใจ — เพิ่มตารางใหม่ต้องมาแก้ที่นี่ด้วย', () => {
  assert.deepEqual(
    [...DEAL_PROJECT_MIRROR_TABLES],
    ['personal_tasks', 'dept_requests', 'sales_orders', 'production_jobs'],
  );
});

// ── ผูกโครงการครั้งแรกต้องเก็บของที่เปิดไว้ตอนดีลยังลอยเข้าโครงการด้วย ────────
test('create-project / link-project: เรียก moveDealMirrors ทั้งเส้นผูกแรกและเส้นย้าย', () => {
  const link = readFileSync(join(SRC, 'app/api/sales-planning/deals/[id]/link-project/route.js'), 'utf8');
  const create = readFileSync(join(SRC, 'app/api/sales-planning/deals/[id]/create-project/route.js'), 'utf8');
  assert.match(create, /moveDealMirrors\(supabase, \{ dealId: deal\.id, toProjectId: project\.id \}\)/,
    'สร้างโครงการใหม่ต้องดูดของที่ผูกแค่ดีลเข้าโครงการ');
  // เส้นผูกแรกของ link-project ต้องไม่ถูกครอบด้วย `if (fromProject)` อีก
  assert.doesNotMatch(link, /let movedMirrors = \[\];\s*\n\s*if \(fromProject\) \{/,
    'moveDealMirrors ต้องเรียกทั้งสองเส้น ไม่ใช่เฉพาะตอนย้าย');
  assert.match(link, /mirrorWarning/, 'ผูกครั้งแรกที่ mirror พังต้องเตือน ไม่ใช่ถอนการผูก');
});
