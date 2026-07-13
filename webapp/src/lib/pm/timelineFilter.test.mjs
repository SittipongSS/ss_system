import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIMELINE_CENTRAL,
  filterTimelineTasks,
  singleSelectedDeal,
} from './timelineFilter.js';

const tasks = [
  { id: 'PT-1', dealId: 'DL-1' },
  { id: 'PT-2', dealId: null },
  { id: 'PT-3', dealId: 'DL-2' },
  { id: 'PT-4', dealId: 'DL-1' },
];

test('all timeline keeps every deal segment and central task', () => {
  assert.deepEqual(filterTimelineTasks(tasks, []).map((task) => task.id), ['PT-1', 'PT-2', 'PT-3', 'PT-4']);
});

test('deal timeline shows only the selected deal segment', () => {
  assert.deepEqual(filterTimelineTasks(tasks, ['DL-1']).map((task) => task.id), ['PT-1', 'PT-4']);
  assert.equal(singleSelectedDeal(['DL-1']), 'DL-1');
});

test('timeline can combine multiple selected deal segments', () => {
  assert.deepEqual(filterTimelineTasks(tasks, ['DL-1', 'DL-2']).map((task) => task.id), ['PT-1', 'PT-3', 'PT-4']);
  assert.equal(singleSelectedDeal(['DL-1', 'DL-2']), null);
});

test('central timeline shows only tasks without a deal', () => {
  assert.deepEqual(filterTimelineTasks(tasks, [TIMELINE_CENTRAL]).map((task) => task.id), ['PT-2']);
  assert.equal(singleSelectedDeal([TIMELINE_CENTRAL]), null);
});

test('central tasks can be combined with selected deals', () => {
  assert.deepEqual(filterTimelineTasks(tasks, ['DL-2', TIMELINE_CENTRAL]).map((task) => task.id), ['PT-2', 'PT-3']);
});
