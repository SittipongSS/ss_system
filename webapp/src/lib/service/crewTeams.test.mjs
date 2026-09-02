// ── ทีมเจ้าหน้าที่บริการบนหน้าจัดคิว (งวด T-4) ─────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

/* ═══════════════════════════════════════════════════════════════════════
   ⭐ **แถวของเจ้าหน้าที่หน้างานขึ้นเสมอบนหน้าจัดคิว** (มติผู้ใช้ 2026-09-02)
   *"หน้าจัดคิว โชว์รายชื่อ ตำแหน่ง operate / Senior Operate ไว้เลย"*

   ของเดิมสร้างแถวจาก **นัดที่มีอยู่** อย่างเดียว ⇒ คนที่ว่างทั้งสัปดาห์หายไปจากตาราง
   ทั้งคน · ตารางจึงบอกได้แค่ "ใครยุ่ง" แต่ตอบไม่ได้ว่า "เหลือใครว่าง" ซึ่งเป็นคำถาม
   หลักของคนจัดคิว
   ═══════════════════════════════════════════════════════════════════════ */

test('⭐ ทะเบียนตำแหน่งที่ออกหน้างาน = Operation + Senior เท่านั้น', async () => {
  const { FIELD_CREW_ROLES, isFieldCrewRole, ROLE_LABELS } = await import('../permissions.js');
  assert.deepEqual(FIELD_CREW_ROLES, ['ts', 'ts_senior']);
  assert.equal(isFieldCrewRole('ts'), true);
  assert.equal(isFieldCrewRole('ts_senior'), true);
  /* ⚠️ สามตำแหน่งนี้ยังถูกมอบหมายงานได้ (canBeServiceAssignee ยอมทั้งฝ่าย) —
     แค่ไม่ถูกจองแถวไว้ล่วงหน้า · ถ้าวันหนึ่งเปลี่ยนใจ ให้แก้ที่ลิสต์กลางที่เดียว */
  for (const role of ['ts_planner', 'ts_audit', 'ts_manager']) {
    assert.equal(isFieldCrewRole(role), false, role);
  }
  // ป้ายต้องมีครบ — แถวบนตารางใช้ชื่อคน แต่หน้า /users อ่านป้ายจากทะเบียนเดียวกัน
  for (const role of FIELD_CREW_ROLES) assert.ok(ROLE_LABELS[role], role);
});

test('หน้าจัดคิวจองแถวให้เจ้าหน้าที่หน้างานก่อน แล้วค่อยพับนัดเข้าแถว', () => {
  const page = readFileSync(new URL('../../app/service/schedule/page.js', import.meta.url), 'utf8');
  // ต้องอ่าน `people` (มี role) ไม่ใช่ `members` (มีแค่ userId/teamCode)
  assert.match(page, /people: body\?\.people \|\| \[\]/);
  assert.match(page, /for \(const person of crew\.people\) \{[\s\S]{0,120}isFieldCrewRole\(person\.role\)/);
  // แถวที่จองไว้ต้องเริ่มด้วยนัดว่าง แล้วให้ลูปนัดพับเข้าแถวเดิม (ไม่ใช่สร้างซ้ำ)
  assert.match(page, /map\.set\(person\.id, \{ key: person\.id, name: person\.name \|\| person\.id, visits: \[\] \}\)/);
  /* 🪤 ลืม dep = แถวไม่โผล่จนกว่าจะมีนัดขยับ (ทะเบียนคนโหลดทีหลัง visits) */
  assert.match(page, /\}, \[boardVisits, crew\.people\]\);/);
});

/* 🪤 **"ว่าง" ต้องวัดจากจำนวนนัด ไม่ใช่จำนวนแถว** — พอแถวเจ้าหน้าที่ขึ้นเสมอแล้ว
   `teamRows.length` แทบไม่มีวันเป็นศูนย์ ⇒ ใช้ตัวเดิมต่อ ข้อความ "สัปดาห์นี้ยังไม่มีนัด"
   จะไม่มีวันโผล่อีกเลย ทั้งที่สัปดาห์นั้นว่างจริง */
test('🪤 สถานะ "สัปดาห์นี้ยังไม่มีนัด" ต้องนับจากนัด ไม่ใช่จากแถว', () => {
  const page = readFileSync(new URL('../../app/service/schedule/page.js', import.meta.url), 'utf8');
  assert.match(page, /const visibleVisitCount = useMemo\(/);
  assert.match(page, /visibleVisitCount === 0 \? \(\s*\n\s*<EmptyState/);
  assert.doesNotMatch(page, /teamRows\.length === 0 \? \(\s*\n\s*<EmptyState/,
    'มุมมองรายการต้องไม่ตัดสินความว่างจากจำนวนแถวอีก');
});

/* ภาระของทีมต้องไม่เพี้ยนเพราะแถวที่ไม่มีนัด — คนว่างเพิ่มแถว แต่ไม่เพิ่มงาน */
test('แถวที่ไม่มีนัดไม่ทำให้ตัวเลขภาระของทีมขยับ', () => {
  const withIdle = [...rows, { key: 'U2', visits: [] }];
  assert.deepEqual(
    teamLoad({ teams, rows: withIdle, members, byUser }),
    teamLoad({ teams, rows, members, byUser }),
  );
});
