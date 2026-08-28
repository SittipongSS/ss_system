// ── ทีมช่างบนหน้าจัดคิว (งวด T-4) ─────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_TEAMS, NO_TEAM, filterRowsByTeam, teamByUser, teamFilterOptions, teamLoad } from './crewTeams.js';

const teams = [
  { code: 'TS-A', name: 'ทีม A', kind: 'crew', isActive: true },
  { code: 'TS-B', name: 'ทีม B', kind: 'crew', isActive: true },
  { code: 'TS-OLD', name: 'ทีมเก่า', kind: 'crew', isActive: false },
  { code: 'SV', name: 'Services', kind: 'sales', isActive: true },
];
const members = [
  { teamCode: 'TS-A', userId: 'U1' },
  { teamCode: 'TS-A', userId: 'U2' },
  { teamCode: 'TS-B', userId: 'U3' },
];
const byUser = teamByUser(members);
const rows = [
  { key: 'U1', visits: [1, 2, 3] },
  { key: 'U3', visits: [4] },
  { key: '__unassigned__', visits: [5, 6] },
];

test('⭐ ตัวเลือกตัวกรองไม่มีทีมขายปน — คนละแกนกัน', () => {
  const options = teamFilterOptions(teams, rows, byUser);
  assert.ok(!options.some((o) => o.value === 'SV'));
});

test('⭐ ถัง "ยังไม่อยู่ทีมไหน" ต้องมีเมื่อมีคนอยู่ในถังนั้นจริง', () => {
  const options = teamFilterOptions(teams, rows, byUser);
  assert.ok(options.some((o) => o.value === NO_TEAM));
  // ไม่มีแถวไร้ทีม = ไม่ต้องมีถัง (ไม่ใช่ตัวเลือกที่กดแล้วว่างเปล่า)
  const clean = teamFilterOptions(teams, [{ key: 'U1', visits: [] }], byUser);
  assert.ok(!clean.some((o) => o.value === NO_TEAM));
});

test('ทีมที่ปิดแล้วไม่รกตัวกรอง เว้นแต่ยังมีงานค้างอยู่', () => {
  assert.ok(!teamFilterOptions(teams, rows, byUser).some((o) => o.value === 'TS-OLD'));
  const stillBusy = teamFilterOptions(teams, [{ key: 'U9', visits: [1] }], teamByUser([{ teamCode: 'TS-OLD', userId: 'U9' }]));
  assert.ok(stillBusy.some((o) => o.value === 'TS-OLD'));
});

test('กรองแถวตามทีม · ทุกทีมคืนครบ', () => {
  assert.equal(filterRowsByTeam(rows, ALL_TEAMS, byUser).length, 3);
  assert.deepEqual(filterRowsByTeam(rows, 'TS-A', byUser).map((r) => r.key), ['U1']);
  assert.deepEqual(filterRowsByTeam(rows, NO_TEAM, byUser).map((r) => r.key), ['__unassigned__']);
});

test('⭐ ทีมที่มีคนแต่ไม่มีนัดต้องขึ้นเป็น 0 ไม่ใช่หายไป — ทีมว่างคือทีมที่รับงานเพิ่มได้', () => {
  const load = teamLoad({ teams, rows: [{ key: 'U1', visits: [1] }], members });
  const b = load.find((t) => t.code === 'TS-B');
  assert.ok(b, 'ทีม B ต้องอยู่ในผลลัพธ์');
  assert.equal(b.visits, 0);
  assert.equal(b.people, 1);
});

test('ภาระรายทีมนับนัดกับคนแยกกัน และมีถังงานไร้ทีมเมื่อมีจริง', () => {
  const load = teamLoad({ teams, rows, members });
  const a = load.find((t) => t.code === 'TS-A');
  assert.equal(a.people, 2);
  assert.equal(a.visits, 3);
  const orphan = load.find((t) => t.code === NO_TEAM);
  assert.equal(orphan.visits, 2);
  assert.equal(orphan.people, 0);
});

test('ทีมที่ปิดแล้วไม่นับในภาระรายทีม', () => {
  assert.ok(!teamLoad({ teams, rows, members }).some((t) => t.code === 'TS-OLD'));
});
