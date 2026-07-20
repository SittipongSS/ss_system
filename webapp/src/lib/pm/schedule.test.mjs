// Characterization tests for the (pure) PM scheduling math — the highest-risk
// logic behind the timeline. No DB needed; recalc functions take task arrays.
// Run: npm test  (or: node --import ./scripts/test-loader.mjs --test src/lib/pm/schedule.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert';
import { setHolidays, isBusinessDay, countBusinessDays } from './dateHelpers';
import { recalculateForward, recalculateGraph, buildProjectTasks, mergeTemplateTasks } from './schedule';
import { templateFor } from './templates';

setHolidays([]); // weekends only → deterministic, no calendar dependency
const biz = (d) => isBusinessDay(new Date(d));

// every task: lands on business days, finish>=start, business-day span ==
// durationDays, and starts strictly after each predecessor's finish.
function assertInvariants(rows, label) {
  const byId = Object.fromEntries(rows.map((t) => [t.id, t]));
  for (const t of rows) {
    assert.ok(biz(t.startDate), `${label}: ${t.id} start on business day (${t.startDate})`);
    assert.ok(biz(t.finishDate), `${label}: ${t.id} finish on business day (${t.finishDate})`);
    assert.ok(t.finishDate >= t.startDate, `${label}: ${t.id} finish >= start`);
    assert.equal(countBusinessDays(t.startDate, t.finishDate) + 1, Math.max(1, t.durationDays), `${label}: ${t.id} duration matches span`);
    for (const p of (t.predecessors || [])) {
      assert.ok(t.startDate > byId[p].finishDate, `${label}: ${t.id} starts after pred ${p}`);
    }
  }
}

const chain = [
  { id: 'a', durationDays: 2, predecessors: [] },
  { id: 'b', durationDays: 3, predecessors: ['a'] },
  { id: 'c', durationDays: 1, predecessors: ['b'] },
];

test('forward schedule respects business days + predecessors', () => {
  assertInvariants(recalculateForward(chain, '2026-06-15'), 'chain');
});

test('a longer predecessor pushes the whole downstream later', () => {
  const r1 = recalculateForward(chain, '2026-06-15');
  const r2 = recalculateForward(chain.map((t) => (t.id === 'a' ? { ...t, durationDays: 6 } : t)), '2026-06-15');
  assertInvariants(r2, 'chain-longer');
  assert.ok(r2.find((t) => t.id === 'b').startDate > r1.find((t) => t.id === 'b').startDate, 'b shifts later');
  assert.ok(r2.find((t) => t.id === 'c').startDate > r1.find((t) => t.id === 'c').startDate, 'shift propagates to c');
});

test('parallel tasks (no predecessors) start on the same day', () => {
  const r = recalculateForward([
    { id: 'x', durationDays: 2, predecessors: [] },
    { id: 'y', durationDays: 2, predecessors: [] },
  ], '2026-06-15');
  assert.equal(r[0].startDate, r[1].startDate);
});

// ── dependency-driven recalc (recalculateGraph) ──────────────────────────
const get = (rows, id) => rows.find((t) => t.id === id);
const fixture = () => ([
  { id: 'A', durationDays: 2, predecessors: [] },
  { id: 'B', durationDays: 3, predecessors: ['A'] },
  { id: 'C', durationDays: 2, predecessors: [] },        // independent — must never follow B
  { id: 'D', durationDays: 1, predecessors: ['A'] },     // depends on A, NOT on B
]);

test('graph: editing one task only moves its transitive dependents (independents stay put)', () => {
  const before = recalculateGraph(fixture(), '2026-06-15');
  // extend B's duration; only B (and anything depending on B) may move
  const after = recalculateGraph(fixture().map((t) => (t.id === 'B' ? { ...t, durationDays: 10 } : t)), '2026-06-15');
  assert.equal(get(after, 'C').startDate, get(before, 'C').startDate, 'independent C unchanged');
  assert.equal(get(after, 'D').startDate, get(before, 'D').startDate, 'sibling D (deps on A, not B) unchanged');
  assert.ok(get(after, 'B').finishDate > get(before, 'B').finishDate, 'B itself extends');
});

test('graph: independent + A-dependent tasks anchor correctly (not dragged behind B)', () => {
  const r = recalculateGraph(fixture(), '2026-06-15');
  assert.equal(get(r, 'A').startDate, get(r, 'C').startDate, 'A and independent C both start at the anchor');
  assert.ok(get(r, 'D').startDate > get(r, 'A').finishDate, 'D starts after its real predecessor A');
  assert.ok(get(r, 'D').startDate <= get(r, 'B').startDate, 'D not pushed behind unrelated B');
});

test('graph: result is order-independent (reordering steps does not change the math)', () => {
  const normal = recalculateGraph(fixture(), '2026-06-15');
  const shuffled = recalculateGraph([fixture()[3], fixture()[1], fixture()[2], fixture()[0]], '2026-06-15');
  for (const id of ['A', 'B', 'C', 'D']) {
    assert.equal(get(shuffled, id).startDate, get(normal, id).startDate, `${id} start stable under reorder`);
    assert.equal(get(shuffled, id).finishDate, get(normal, id).finishDate, `${id} finish stable under reorder`);
  }
});

test('graph: a task with multiple predecessors waits for the latest one', () => {
  const r = recalculateGraph([
    { id: 'a', durationDays: 2, predecessors: [] },
    { id: 'b', durationDays: 6, predecessors: [] },
    { id: 'c', durationDays: 1, predecessors: ['a', 'b'] }, // must wait for b (longer)
  ], '2026-06-15');
  assert.ok(get(r, 'c').startDate > get(r, 'b').finishDate, 'c starts after the later predecessor b');
});

test('graph: a missing (deleted) predecessor does not block', () => {
  const withGhost = recalculateGraph([{ id: 'x', durationDays: 2, predecessors: ['ghost'] }], '2026-06-15');
  const noPred = recalculateGraph([{ id: 'x', durationDays: 2, predecessors: [] }], '2026-06-15');
  // a task whose only predecessor was deleted behaves like one with no predecessor
  assert.equal(get(withGhost, 'x').startDate, get(noPred, 'x').startDate);
});

test('graph: startLocked pin delays a task and shifts its dependents', () => {
  const base = [
    { id: 'A', durationDays: 2, predecessors: [] },
    { id: 'B', durationDays: 2, predecessors: ['A'] },
  ];
  const unpinned = recalculateGraph(base, '2026-06-15');
  // pin A to start two weeks later → A holds, B (depends on A) shifts after A
  const pinned = recalculateGraph(
    base.map((t) => (t.id === 'A' ? { ...t, startLocked: true, startDate: '2026-06-29' } : t)),
    '2026-06-15',
  );
  assert.equal(get(pinned, 'A').startDate, '2026-06-29', 'pinned start holds');
  assert.ok(get(pinned, 'B').startDate > get(unpinned, 'B').startDate, 'dependent B shifts later with the pin');
});

test('graph: a pin earlier than dependencies allow is clamped (cannot violate predecessors)', () => {
  const r = recalculateGraph([
    { id: 'A', durationDays: 5, predecessors: [] },
    { id: 'B', durationDays: 1, predecessors: ['A'], startLocked: true, startDate: '2026-06-15' }, // same day as A — impossible
  ], '2026-06-15');
  assert.ok(get(r, 'B').startDate > get(r, 'A').finishDate, 'B clamped to after A despite the early pin');
});

test('graph: a startDate without startLocked is NOT treated as a pin (flows from deps)', () => {
  const computed = recalculateGraph([
    { id: 'A', durationDays: 2, predecessors: [] },
    { id: 'B', durationDays: 2, predecessors: ['A'] },
  ], '2026-06-15');
  // same tasks but each carries a stale computed startDate and startLocked=false
  const withStale = recalculateGraph([
    { id: 'A', durationDays: 2, predecessors: [], startDate: '2030-01-01', startLocked: false },
    { id: 'B', durationDays: 2, predecessors: ['A'], startDate: '2030-01-01', startLocked: false },
  ], '2026-06-15');
  assert.equal(get(withStale, 'A').startDate, get(computed, 'A').startDate, 'unlocked start ignored');
  assert.equal(get(withStale, 'B').startDate, get(computed, 'B').startDate);
});

test('buildProjectTasks produces a valid, sequentially-ordered template schedule', () => {
  // mig 0131: หมวดสรรพสามิตส่งธงผ่าน templateOptions (token flag:excise ใน template)
  const tasks = buildProjectTasks(
    { type: 'NPD', productMainCategory: '01-002', startDate: '2026-06-15' },
    'PRJ-test', null, { categoryFlags: { isExcise: true } },
  );
  assert.ok(tasks.length > 0, 'template produced tasks');
  assertInvariants(tasks, 'buildProjectTasks');
  assert.ok(tasks.every((t, i) => t.stepOrder === i), 'stepOrder is 0..n sequential');
});

const versionedTemplate = (type) => templateFor(type).map((step) => ({
  ...step,
  stepKey: `${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${String(step.step).padStart(2, '0')}`,
  dependencyMode: Array.isArray(step.dependsOnSteps)
    ? (step.dependsOnSteps.length ? 'custom' : 'root')
    : 'sequential',
  dependsOnStepKeys: (step.dependsOnSteps || []).map(
    (dependency) => `${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${String(dependency).padStart(2, '0')}`,
  ),
}));

const comparableSchedule = (rows) => {
  const indexById = new Map(rows.map((row, index) => [row.id, index]));
  return rows.map((row) => ({
    name: row.name,
    role: row.role,
    durationDays: row.durationDays,
    phase: row.phase,
    isMilestone: row.isMilestone,
    predecessorIndexes: row.predecessors.map((id) => indexById.get(id)),
  }));
};

for (const type of ['SCENT', 'NPD', 'RE-ORDER']) {
  for (const category of ['01-002', '01-001']) {
    test(`versioned ${type} seed preserves static schedule for category ${category}`, () => {
      const project = { type, productMainCategory: category, startDate: '2026-06-15' };
      // ธงหมวด (mig 0131): 01-002 = หมวดที่ติ๊กเสียภาษีสรรพสามิต ในชุดข้อมูลจำลองนี้
      const categoryFlags = { isExcise: category === '01-002' };
      const staticRows = buildProjectTasks(project, 'PRJ-static', null, { categoryFlags });
      const versionedRows = buildProjectTasks(project, 'PRJ-versioned', null, {
        templateVersionId: `version-${type}`,
        template: versionedTemplate(type),
        categoryFlags,
      });
      assert.deepEqual(comparableSchedule(versionedRows), comparableSchedule(staticRows));
      assert.ok(versionedRows.every((row) => row.workflowTemplateVersionId === `version-${type}`));
      assert.ok(versionedRows.every((row) => row.workflowTemplateStepKey));
      assert.ok(staticRows.every((row) => !('workflowTemplateVersionId' in row)), 'legacy rows remain unpinned');
    });
  }
}

test('versioned sequential dependency follows previous visible category row', () => {
  const template = [
    { stepKey: 'a', name: 'A', role: 'SA', durationDays: 1, dependencyMode: 'root' },
    { stepKey: 'excise', name: 'Excise', role: 'LG', durationDays: 1, dependencyMode: 'sequential', categoryOnly: '01-002' },
    { stepKey: 'finish', name: 'Finish', role: 'WH', durationDays: 1, dependencyMode: 'sequential' },
  ];
  const nonExcise = buildProjectTasks(
    { type: 'NPD', productMainCategory: '01-001', startDate: '2026-06-15' },
    'PRJ-category', null, { templateVersionId: 'v1', template },
  );
  assert.deepEqual(nonExcise.map((row) => row.name), ['A', 'Finish']);
  assert.deepEqual(nonExcise[1].predecessors, [nonExcise[0].id]);
});

test('resync reuses a versioned task by stable step key after its display name changes', () => {
  const existing = [{
    id: 'task-a', projectId: 'PRJ-pinned', dealId: 'deal-1', origin: 'template',
    workflowTemplateVersionId: 'version-2', workflowTemplateStepKey: 'brief',
    name: 'ชื่อเดิม', role: 'SA', durationDays: 2, status: 'In Progress', predecessors: [],
  }];
  const result = mergeTemplateTasks(
    { id: 'PRJ-pinned', type: 'SCENT', productMainCategory: '', startDate: '2026-06-15' },
    existing,
    { templateVersionId: 'version-2', template: [{ stepKey: 'brief', name: 'ชื่อใหม่', role: 'SA', durationDays: 1, dependencyMode: 'root' }] },
  );
  assert.equal(result.templateRows[0].id, 'task-a');
  assert.equal(result.templateRows[0].name, 'ชื่อใหม่');
  assert.equal(result.templateRows[0].status, 'In Progress');
  assert.equal(result.templateRows[0].workflowTemplateVersionId, 'version-2');
  assert.equal(result.templateRows[0].workflowTemplateStepKey, 'brief');
});
