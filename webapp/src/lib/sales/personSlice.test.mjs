import test from 'node:test';
import assert from 'node:assert/strict';
import { NO_TEAM_LABEL, findPersonRow, personSliceKey } from './personSlice.js';
import { historyRowKey } from './historyEntry.js';

test('คีย์แถวคน = historyRowKey เมื่อมี ownerId (คีย์ upsert ของ sales_history)', () => {
  for (const team of ['KA', 'ODM', null]) {
    assert.equal(personSliceKey({ team, ownerId: 'u1' }), historyRowKey({ team, ownerId: 'u1' }));
  }
  assert.equal(personSliceKey({ team: 'KA', ownerId: 'u1' }), 'owner:KA:u1');
  assert.equal(personSliceKey({ team: null, ownerId: 'u1' }), 'owner:-:u1');
});

test('คนเดียวกันต่างทีม = คนละแถว · แถว legacy ไม่มี ownerId ใช้ชื่อ ไม่ชนคีย์ owner:', () => {
  assert.notEqual(personSliceKey({ team: 'KA', ownerId: 'u1' }), personSliceKey({ team: 'ODM', ownerId: 'u1' }));
  assert.equal(personSliceKey({ team: 'KA', ownerName: ' สมชาย ' }), 'name:KA:สมชาย');
  assert.equal(personSliceKey({}), 'name:-:ไม่ระบุ');
  assert.equal(NO_TEAM_LABEL, 'ไม่ระบุทีม');
});

test('findPersonRow: คีย์เต็มก่อน · id เปล่าได้แถวทีมที่เรียงก่อน · ไม่เจอ = null ไม่ถอยไปคนอื่น', () => {
  const people = [
    { id: 'owner:ODM:u1', ownerId: 'u1', team: 'ODM' },
    { id: 'owner:KA:u1', ownerId: 'u1', team: 'KA' },
    { id: 'owner:SV:u2', ownerId: 'u2', team: 'SV' },
  ];
  assert.equal(findPersonRow(people, 'owner:ODM:u1').team, 'ODM');
  assert.equal(findPersonRow(people, 'u1').team, 'KA');
  assert.equal(findPersonRow(people, 'u2').id, 'owner:SV:u2');
  assert.equal(findPersonRow(people, 'nobody'), null);
  assert.equal(findPersonRow(people, ''), null);
  assert.equal(findPersonRow(null, 'u1'), null);
});
