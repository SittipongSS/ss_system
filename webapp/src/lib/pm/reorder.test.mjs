import { test } from 'node:test';
import assert from 'node:assert';
import { reindexByOrder, moveStep } from './reorder';

const tasks = [
  { id: 'a', stepOrder: 0 },
  { id: 'b', stepOrder: 1 },
  { id: 'c', stepOrder: 2 },
  { id: 'd', stepOrder: 3 },
];

test('reindexByOrder assigns 0..n and returns only changed rows', () => {
  const changed = reindexByOrder(tasks, ['c', 'a', 'b', 'd']); // d stays at 3
  const map = Object.fromEntries(changed.map((c) => [c.id, c.stepOrder]));
  assert.equal(map.c, 0);
  assert.equal(map.a, 1);
  assert.equal(map.b, 2);
  assert.equal(map.d, undefined, 'd unchanged → not returned');
});

test('reindexByOrder ignores unknown ids and appends missing tasks in current order', () => {
  const changed = reindexByOrder(tasks, ['ghost', 'd']); // only d listed
  const map = Object.fromEntries(changed.map((c) => [c.id, c.stepOrder]));
  // d → 0; a,b,c appended after in their original order → 1,2,3
  assert.equal(map.d, 0);
  assert.equal(map.a, 1);
  assert.equal(map.b, 2);
  assert.equal(map.c, 3);
});

test('moveStep moves a task and reindexes minimally', () => {
  const changed = moveStep(tasks, 'd', 0); // d to front
  const map = Object.fromEntries(changed.map((c) => [c.id, c.stepOrder]));
  assert.equal(map.d, 0);
  assert.equal(map.a, 1);
  assert.equal(map.b, 2);
  assert.equal(map.c, 3);
});

test('moveStep to the same position yields no changes', () => {
  assert.deepEqual(moveStep(tasks, 'b', 1), []);
});

test('moveStep clamps an out-of-range index to the end', () => {
  const changed = moveStep(tasks, 'a', 99); // a to end
  const map = Object.fromEntries(changed.map((c) => [c.id, c.stepOrder]));
  assert.equal(map.a, 3);
  assert.equal(map.b, 0);
});

test('moveStep on a missing task is a no-op', () => {
  assert.deepEqual(moveStep(tasks, 'ghost', 0), []);
});
