// Characterization tests for the (pure) PM scheduling math — the highest-risk
// logic behind the timeline. No DB needed; recalc functions take task arrays.
// Run: npm test  (or: node --import ./scripts/test-loader.mjs --test src/lib/pm/schedule.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert';
import { setHolidays, isBusinessDay, countBusinessDays } from './dateHelpers';
import { recalculateForward, buildProjectTasks } from './schedule';

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

test('buildProjectTasks produces a valid, sequentially-ordered template schedule', () => {
  const tasks = buildProjectTasks({ type: 'NPD', productMainCategory: '01-002', startDate: '2026-06-15' }, 'PRJ-test');
  assert.ok(tasks.length > 0, 'template produced tasks');
  assertInvariants(tasks, 'buildProjectTasks');
  assert.ok(tasks.every((t, i) => t.stepOrder === i), 'stepOrder is 0..n sequential');
});
