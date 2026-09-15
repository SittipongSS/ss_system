import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { monthsInRange } from '../datePeriods.js';
import {
  NO_TEAM_ROW_KEY,
  buildReportRows,
  reportOrderMonth,
  reportOrderTeam,
  reportPersonRowKey,
  reportTeamRowKey,
} from './reportRows.js';
import { matchPendingApprovalRows, pendingApprovalRowKey, reportPendingApproval } from './reportPendingApproval.js';
import { personSliceKey } from './personSlice.js';

/* แถวของรายงานยอดขาย — มติผู้ใช้ 2026-09-14 "ทีมตามดีล"
   ล็อก: ทีมมาจากแถวต้นทาง (ดีลของใบ / เป้า / ยอดกรอกมือ) ไม่ใช่บัญชี · คนย้ายทีมแล้วไม่มีอะไรขยับ ·
   คนหลายทีม = แถวละทีม และแถวทีม = Σ คนในทีม · คนแบ่งยอดบริษัทครบ (ใบที่มีเจ้าของ) ·
   คีย์แถวตรงกับยอดรออนุมัติ · ข้อมูลวันนี้ (ทีมบนแถว = ทีมในบัญชี) ได้ตัวเลขเท่ากติกาเดิมทุกตัว */

const MONTHS = monthsInRange('2026-07', '2026-09'); // ก.ค. = 0 · ส.ค. = 1 · ก.ย. = 2

const directoryOf = (entries) => {
  const map = new Map(entries);
  return (id) => map.get(id) || null;
};
const person = directoryOf([
  ['u1', { name: 'สมชาย', team: 'KA', teams: ['KA'] }],
  ['u2', { name: 'สมหญิง', team: 'SV', teams: ['SV'] }],
  ['u3', { name: 'สมศรี', team: 'KA', teams: ['KA'] }],
]);

const so = (over) => ({
  id: 'SO1', ownerId: 'u1', ownerName: 'ชื่อบนใบ', approvedAt: '2026-08-10T03:00:00Z',
  actualAmount: 100, deal: { team: 'KA' }, ...over,
});
const target = (over) => ({ period: '2026-08', team: 'KA', ownerId: 'u1', targetAmount: 1000, ...over });
const hist = (over) => ({ period: '2026-07', team: 'KA', ownerId: 'u1', actualAmount: 50, ...over });

const build = (over = {}) => buildReportRows({ months: MONTHS, targets: [], orders: [], history: [], person, ...over });
const rowsByKey = (rows) => Object.fromEntries(rows.map((r) => [r.key, r]));
const sumAt = (rows, i) => rows.reduce((s, r) => s + r.actual[i], 0);

test('คีย์แถว: คน = personSliceKey (ทีม, คน) · ทีม = team:<code> · ไม่ระบุทีมไม่ชนแถวบริษัท', () => {
  assert.equal(reportPersonRowKey({ team: 'KA', ownerId: 'u1' }), personSliceKey({ team: 'KA', ownerId: 'u1' }));
  assert.equal(reportPersonRowKey({ team: null, ownerId: 'u1' }), 'owner:-:u1');
  assert.equal(reportTeamRowKey('KA'), 'team:KA');
  assert.equal(reportTeamRowKey(null), NO_TEAM_ROW_KEY);
  assert.notEqual(NO_TEAM_ROW_KEY, 'company');
});

test('งวด = เดือนอนุมัติตามเวลาไทย · ทีมของใบ = ทีมบนดีล', () => {
  // 31 ก.ค. 18:00 UTC = 1 ส.ค. ตี 1 เวลาไทย
  assert.equal(reportOrderMonth({ approvedAt: '2026-07-31T18:00:00Z' }), '2026-08');
  assert.equal(reportOrderMonth({ approvedAt: null, orderDate: '2026-07-20' }), '2026-07');
  assert.equal(reportOrderTeam({ deal: { team: 'ODM' } }), 'ODM');
  assert.equal(reportOrderTeam({ deal: null }), null);
  assert.equal(reportOrderTeam({}), null);
});

test('บัญชีอยู่ทีมหนึ่ง ดีลประทับอีกทีม ⇒ ยอดลงทีมบนดีล ทีมในบัญชีไม่ได้อะไร', () => {
  // u2 บัญชีอยู่ SV แต่ใบมาจากดีล KA
  const out = build({ orders: [so({ ownerId: 'u2', deal: { team: 'KA' } })] });
  assert.deepEqual(out.people.map((r) => [r.key, r.team, r.ownerName, r.actual]), [
    ['owner:KA:u2', 'KA', 'สมหญิง', [0, 100, 0]],
  ]);
  assert.deepEqual(out.teams.map((r) => [r.key, r.team, r.actual]), [['team:KA', 'KA', [0, 100, 0]]]);
  assert.equal(out.teams.some((r) => r.team === 'SV'), false);
});

test('คนย้ายทีม (เปลี่ยนทีมในบัญชี) — บริษัท ทีม รายคน เท่าเดิมทุกตัวเลขทุกคีย์', () => {
  const input = {
    targets: [target(), target({ ownerId: null, targetAmount: 5000 }), target({ ownerId: 'u2', team: 'SV' })],
    orders: [so(), so({ id: 'SO2', ownerId: 'u2', deal: { team: 'SV' }, actualAmount: 70 }), so({ id: 'SO3', approvedAt: '2026-09-02T03:00:00Z' })],
    history: [hist(), hist({ ownerId: null, team: null, actualAmount: 900 })],
  };
  const before = build(input);
  const moved = directoryOf([
    ['u1', { name: 'สมชาย', team: 'ODM', teams: ['ODM'] }],
    ['u2', { name: 'สมหญิง', team: 'KA', teams: ['KA', 'SV'] }],
  ]);
  assert.deepEqual(build({ ...input, person: moved }), before);
});

test('คนเดียวสองทีม = สองแถวรายคน · แถวทีม = Σ คนในทีมทุกเดือน · Σ คน = บริษัท', () => {
  const out = build({
    orders: [
      so({ id: 'A', actualAmount: 100 }),
      so({ id: 'B', deal: { team: 'SV' }, actualAmount: 40 }),
      so({ id: 'C', deal: { team: 'SV' }, actualAmount: 60, approvedAt: '2026-09-03T03:00:00Z' }),
      so({ id: 'D', ownerId: 'u3', actualAmount: 30 }),
    ],
  });
  assert.deepEqual(out.people.map((r) => [r.key, r.ownerId, r.team]), [
    ['owner:KA:u1', 'u1', 'KA'],
    ['owner:SV:u1', 'u1', 'SV'],
    ['owner:KA:u3', 'u3', 'KA'],
  ]);
  MONTHS.forEach((_, i) => {
    for (const teamRow of out.teams) {
      assert.equal(teamRow.actual[i], sumAt(out.people.filter((p) => p.team === teamRow.team), i), `${teamRow.key} เดือน ${i}`);
    }
    assert.equal(sumAt(out.people, i), out.company.actual[i]);
    assert.equal(sumAt(out.teams, i), out.company.actual[i]);
  });
  assert.deepEqual(rowsByKey(out.teams)['team:SV'].actual, [0, 40, 60]);
});

test('ดีลไม่ระบุทีม ⇒ แถวคนทีมว่าง + แถวทีม "ไม่ระบุทีม" · ใบไม่มีเจ้าของ = ยอดบริษัทอย่างเดียว', () => {
  const out = build({
    orders: [
      so({ id: 'A', actualAmount: 100 }),
      so({ id: 'B', ownerId: 'u3', deal: { team: null }, actualAmount: 25 }),
      so({ id: 'C', ownerId: null, ownerName: null, deal: { team: 'KA' }, actualAmount: 9 }),
      so({ id: 'D', ownerId: 'u2', deal: null, actualAmount: 5 }),
    ],
  });
  const teams = rowsByKey(out.teams);
  assert.deepEqual(teams[NO_TEAM_ROW_KEY], {
    key: 'team:-', scope: 'team', ownerId: null, ownerName: null, team: null,
    target: [0, 0, 0], actual: [0, 30, 0], history: [0, 0, 0],
  });
  assert.equal(teams['team:KA'].actual[1], 100); // ใบไม่มีเจ้าของไม่เข้าแถวทีม แม้ดีลมีทีม
  assert.deepEqual(out.people.map((r) => [r.key, r.team]), [['owner:KA:u1', 'KA'], ['owner:-:u3', null], ['owner:-:u2', null]]);
  assert.equal(out.company.actual[1], 139);
  // แถวคนแบ่งใบที่มีเจ้าของครบ · แถวทีมก็เช่นกัน — ส่วนต่างกับบริษัท = ใบไม่มีเจ้าของพอดี
  assert.equal(sumAt(out.people, 1), 130);
  assert.equal(sumAt(out.teams, 1), 130);
});

test('เป้า: รายคนลงทีมของแถวเป้า · เป้าทีม/บริษัทเป็นเส้นแยก · เป้าล้วนไม่สร้างแถวทีมศูนย์', () => {
  const out = build({
    targets: [
      target({ team: 'KA', ownerId: 'u1', targetAmount: 1000 }),
      target({ team: 'SV', ownerId: 'u1', targetAmount: 500 }),
      target({ team: 'KA', ownerId: null, targetAmount: 7000 }),
      target({ team: null, ownerId: null, targetAmount: 20000 }),
      target({ period: '2025-12', targetAmount: 999 }), // นอกช่วง
    ],
    orders: [so({ deal: { team: 'ODM' } })],
  });
  const people = rowsByKey(out.people);
  assert.deepEqual(people['owner:KA:u1'].target, [0, 1000, 0]);
  assert.deepEqual(people['owner:SV:u1'].target, [0, 500, 0]);
  assert.deepEqual(people['owner:ODM:u1'].target, [0, 0, 0]);
  assert.deepEqual(people['owner:ODM:u1'].actual, [0, 100, 0]);
  const teams = rowsByKey(out.teams);
  assert.deepEqual(teams['team:KA'].target, [0, 7000, 0]);
  assert.deepEqual(teams['team:KA'].actual, [0, 0, 0]);
  assert.equal(teams['team:SV'], undefined);
  assert.deepEqual(teams['team:ODM'].actual, [0, 100, 0]);
  assert.deepEqual(out.company.target, [0, 20000, 0]);
});

test('ยอดกรอกมือทับเฉพาะแถว (ทีม, คน) ของมัน · ทีมที่มีแต่ยอดกรอกได้แถวทีม · เดือนทีมกรอกเองชนะ', () => {
  const out = build({
    orders: [
      so({ id: 'A', actualAmount: 100 }),
      so({ id: 'B', deal: { team: 'SV' }, actualAmount: 40 }),
      so({ id: 'C', ownerId: 'u3', actualAmount: 500, approvedAt: '2026-09-03T03:00:00Z' }),
    ],
    history: [
      hist({ period: '2026-08', team: 'KA', ownerId: 'u1', actualAmount: 70 }), // ต่ำกว่ายอดใบของ (KA, u1)
      hist({ period: '2026-07', team: 'ODM', ownerId: 'u2', actualAmount: 80 }), // ทีมที่มีแต่ยอดกรอก
      hist({ period: '2026-09', team: 'KA', ownerId: null, actualAmount: 999 }), // ทีมกรอกเอง
      hist({ period: '2026-07', team: null, ownerId: null, actualAmount: 12345 }), // บริษัท
    ],
  });
  const people = rowsByKey(out.people);
  assert.deepEqual(people['owner:KA:u1'].actual, [0, 70, 0]);
  assert.deepEqual(people['owner:KA:u1'].history, [0, 1, 0]);
  assert.deepEqual(people['owner:SV:u1'].actual, [0, 40, 0]); // ทีมอื่นของคนเดียวกันไม่โดนทับ
  assert.deepEqual(people['owner:SV:u1'].history, [0, 0, 0]);
  assert.deepEqual(people['owner:ODM:u2'].actual, [80, 0, 0]);

  const teams = rowsByKey(out.teams);
  // ⚠️ กติกา "ค่ามากกว่าชนะ" คงไว้: ยอดใบของทีม 100 > Σ สมาชิก 70 ⇒ ทีมยังเป็น 100
  assert.deepEqual(teams['team:KA'].actual, [0, 100, 999]);
  assert.deepEqual(teams['team:KA'].history, [0, 0, 1]);
  assert.deepEqual(teams['team:ODM'].actual, [80, 0, 0]);
  assert.deepEqual(out.company.actual, [12345, 140, 500]);
  assert.deepEqual(out.company.history, [1, 0, 0]);
});

test('ยอดกรอกรายคนสูงกว่ายอดใบ ⇒ แถวทีมขึ้นตามผลรวมสมาชิก', () => {
  const out = build({
    orders: [so({ actualAmount: 100 })],
    history: [hist({ period: '2026-08', actualAmount: 300 })],
  });
  assert.deepEqual(rowsByKey(out.teams)['team:KA'].actual, [0, 300, 0]);
});

test('คีย์แถวของรายงานตรงกับยอดรออนุมัติทุกตัวอักษร — ไม่มียอดตกแถวเกิน', () => {
  const now = new Date('2026-09-11T06:00:00Z');
  const out = build({
    orders: [
      so({ id: 'A' }),
      so({ id: 'B', deal: { team: 'SV' } }),
      so({ id: 'C', ownerId: 'u2', deal: { team: null } }),
    ],
  });
  const pendingApproval = reportPendingApproval({
    months: MONTHS,
    now,
    person,
    orders: ['D1', 'D2', 'D3', 'D4'].map((dealId) => ({ id: `P-${dealId}`, orderNumber: dealId, dealId, status: 'pending_approval', actualAmount: 10 })),
    deals: [
      { id: 'D1', stage: 'won', team: 'KA', ownerId: 'u1' },
      { id: 'D2', stage: 'won', team: 'SV', ownerId: 'u1' },
      { id: 'D3', stage: 'won', team: null, ownerId: 'u2' },
      { id: 'D4', stage: 'won', team: 'KA', ownerId: null }, // ไม่มีเจ้าของ = นอกทุกแถว
    ],
  });
  for (const row of out.people) assert.equal(pendingApprovalRowKey('person', row), row.key);
  for (const row of out.teams) assert.equal(pendingApprovalRowKey('team', row), row.key);
  for (const group of pendingApproval.byOwner) assert.equal(group.key, pendingApprovalRowKey('person', group));

  const byPerson = matchPendingApprovalRows(pendingApproval, out.people, 'person');
  assert.deepEqual(byPerson.extra, []);
  assert.deepEqual(out.people.map((r) => byPerson.byKey.get(r.key)?.amount), [10, 10, 10]);

  const byTeam = matchPendingApprovalRows(pendingApproval, out.teams, 'team');
  assert.deepEqual(byTeam.extra, []);
  assert.equal(byTeam.byKey.get(NO_TEAM_ROW_KEY).amount, 10);
  // ส่วนที่ไม่มีแถว (ทั้งสองมุม) = ดีลไม่มีเจ้าของอย่างเดียว
  const matched = (m) => [...m.byKey.values()].reduce((s, g) => s + g.amount, 0);
  assert.equal(pendingApproval.amount - matched(byPerson), pendingApproval.unassigned.amount);
  assert.equal(pendingApproval.amount - matched(byTeam), pendingApproval.unassigned.amount);
});

test('ทุกแถวมี key ไม่ซ้ำ · ใบนอกแกนเดือนถูกข้าม', () => {
  const out = build({
    targets: [target(), target({ ownerId: null })],
    orders: [so(), so({ id: 'old', approvedAt: '2026-01-10T03:00:00Z', actualAmount: 1e6 })],
    history: [hist()],
  });
  const all = [out.company, ...out.teams, ...out.people];
  assert.ok(all.every((r) => typeof r.key === 'string' && r.key));
  assert.equal(new Set(all.map((r) => r.key)).size, all.length);
  assert.equal(out.company.key, 'company');
  assert.deepEqual(out.company.actual, [0, 100, 0]);
});

/* ── ข้อมูลวันนี้ (ทีมบนทุกแถว = ทีมในบัญชี · ไม่มีใครอยู่หลายทีม) ต้องได้ตัวเลขเท่ากติกาเดิม ──
   `legacyRows` = สำเนาตัวสร้างแถวของ route ก่อนมติ 2026-09-14 (อ่านทีมจากบัญชี · คีย์ owner:<id>)
   เก็บไว้ในเทสต์เท่านั้น เพื่อยืนยันว่ารอบนี้เปลี่ยน "ที่มาของทีม" อย่างเดียว ไม่ได้เปลี่ยนตัวเลข */
function legacyRows({ months, targets, orders, history, person: who }) {
  const slot = new Map(months.map((m, i) => [m, i]));
  const zeros = () => Array(months.length).fill(0);
  const money = (v) => Number(v || 0);
  const rows = new Map();
  const rowFor = (key, seed) => {
    if (!rows.has(key)) rows.set(key, { ...seed, target: zeros(), actual: zeros(), history: zeros() });
    return rows.get(key);
  };
  const companyRow = rowFor('company', { scope: 'company', ownerId: null, ownerName: null, team: null });
  for (const t of targets) {
    const i = slot.get(t.period);
    if (i == null) continue;
    const amount = money(t.targetAmount);
    if (t.ownerId) {
      const p = who(t.ownerId);
      rowFor(`owner:${t.ownerId}`, { scope: 'owner', ownerId: t.ownerId, ownerName: p?.name || t.ownerId, team: p?.team || t.team || null }).target[i] += amount;
    } else if (t.team) {
      rowFor(`team:${t.team}`, { scope: 'team', ownerId: null, ownerName: null, team: t.team }).target[i] += amount;
    } else {
      companyRow.target[i] += amount;
    }
  }
  for (const o of orders.filter((x) => slot.has(reportOrderMonth(x)))) {
    const i = slot.get(reportOrderMonth(o));
    const amount = money(o.actualAmount);
    companyRow.actual[i] += amount;
    if (!o.ownerId) continue;
    const p = who(o.ownerId);
    const team = p?.team || null;
    rowFor(`owner:${o.ownerId}`, { scope: 'owner', ownerId: o.ownerId, ownerName: p?.name || o.ownerName || o.ownerId, team }).actual[i] += amount;
    if (team) rowFor(`team:${team}`, { scope: 'team', ownerId: null, ownerName: null, team }).actual[i] += amount;
  }
  for (const h of history) {
    const i = slot.get(h.period);
    if (i == null) continue;
    const key = h.ownerId ? `owner:${h.ownerId}` : (h.team ? `team:${h.team}` : 'company');
    const seed = h.ownerId
      ? { scope: 'owner', ownerId: h.ownerId, ownerName: who(h.ownerId)?.name || h.ownerId, team: who(h.ownerId)?.team || h.team || null }
      : (h.team ? { scope: 'team', ownerId: null, ownerName: null, team: h.team } : { scope: 'company', ownerId: null, ownerName: null, team: null });
    const row = rowFor(key, seed);
    row.actual[i] = money(h.actualAmount);
    row.history[i] = 1;
  }
  const teamHistory = new Set(history.filter((h) => h.team && !h.ownerId && slot.has(h.period)).map((h) => `${h.team}|${slot.get(h.period)}`));
  for (const row of rows.values()) {
    if (row.scope !== 'team') continue;
    const members = [...rows.values()].filter((r) => r.scope === 'owner' && r.team === row.team);
    months.forEach((_, i) => {
      if (teamHistory.has(`${row.team}|${i}`)) return;
      const fromMembers = members.reduce((sum, m) => sum + m.actual[i], 0);
      if (fromMembers > row.actual[i]) row.actual[i] = fromMembers;
    });
  }
  const all = [...rows.values()];
  return { company: all.find((r) => r.scope === 'company'), teams: all.filter((r) => r.scope === 'team'), people: all.filter((r) => r.scope === 'owner') };
}

test('ข้อมูลวันนี้ (ทีมบนแถว = ทีมในบัญชี) ⇒ ตัวเลขเท่ากติกาเดิมทุกตัว ต่างแค่ key', () => {
  const input = {
    months: MONTHS,
    person,
    targets: [
      target({ period: '2026-07', team: null, ownerId: null, targetAmount: 90000 }),
      target({ period: '2026-08', team: null, ownerId: null, targetAmount: 95000 }),
      target({ period: '2026-07', team: 'KA', ownerId: null, targetAmount: 40000 }),
      target({ period: '2026-08', team: 'SV', ownerId: null, targetAmount: 30000 }),
      target({ period: '2026-07', team: 'KA', ownerId: 'u1', targetAmount: 20000 }),
      target({ period: '2026-08', team: 'KA', ownerId: 'u3', targetAmount: 15000 }),
      target({ period: '2026-08', team: 'SV', ownerId: 'u2', targetAmount: 10000 }),
    ],
    orders: [
      so({ id: 'A', ownerId: 'u1', deal: { team: 'KA' }, actualAmount: 12000 }),
      so({ id: 'B', ownerId: 'u1', deal: { team: 'KA' }, actualAmount: 3000, approvedAt: '2026-09-01T02:00:00Z' }),
      so({ id: 'C', ownerId: 'u2', deal: { team: 'SV' }, actualAmount: 8000 }),
      so({ id: 'D', ownerId: 'u3', deal: { team: 'KA' }, actualAmount: 0 }),
      so({ id: 'E', ownerId: null, ownerName: null, deal: { team: 'KA' }, actualAmount: 777 }),
    ],
    history: [
      hist({ period: '2026-07', team: null, ownerId: null, actualAmount: 88000 }),
      hist({ period: '2026-07', team: 'KA', ownerId: 'u1', actualAmount: 21000 }),
      hist({ period: '2026-07', team: 'KA', ownerId: 'u3', actualAmount: 9000 }),
      hist({ period: '2026-08', team: 'KA', ownerId: 'u1', actualAmount: 5000 }), // ต่ำกว่ายอดใบ — ค่ามากกว่าชนะ
      hist({ period: '2026-09', team: 'SV', ownerId: null, actualAmount: 4000 }),
    ],
  };
  const next = buildReportRows(input);
  const old = legacyRows(input);
  const strip = ({ key, ...row }) => { assert.ok(key); return row; };
  assert.deepEqual(strip(next.company), old.company);
  const byTeam = (rows) => [...rows].sort((a, b) => String(a.team).localeCompare(String(b.team)));
  assert.deepEqual(byTeam(next.teams).map(strip), byTeam(old.teams));
  const byOwner = (rows) => [...rows].sort((a, b) => String(a.ownerId).localeCompare(String(b.ownerId)));
  assert.deepEqual(byOwner(next.people).map(strip), byOwner(old.people));
});

/* ── ด่านโค้ด: route ใช้ตัวสร้างแถวนี้ และไม่อ่านทีมจากบัญชีมาจัดยอด ────────── */
const read = (rel) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');

test('route: ทีมของใบมาจาก embed ดีลในคิวรีเดียวกัน · แถวมาจาก buildReportRows · ไม่อ่านทีมจากบัญชี', () => {
  const route = read('app/api/sales-planning/report/route.js');
  // ใบสั่งขายย้อนหลัง (mig 0360) กรองในคิวรีเดียวกัน — pipelineRowsOnly ครอบ select (ยามรวมอยู่ที่ historicalMoneyGuards)
  assert.match(route, /fetchAllResult\(\(\) => pipelineRowsOnly\(supabase\s*\.from\('sales_orders'\)\s*\.select\('[^']*deal:sales_deals\(team\)'\)\)\s*\.eq\('status', 'approved'\)/);
  assert.match(route, /buildReportRows\(\{/);
  assert.match(route, /team: reportOrderTeam\(o\),/);
  for (const [name, source] of [['route', route], ['reportRows', read('lib/sales/reportRows.js')]]) {
    assert.doesNotMatch(source, /person\([^)]*\)\??\.team|\bp\??\.team\b|directory\.get\([^)]*\)\??\.team/, `${name} ห้ามอ่านทีมจากบัญชี`);
  }
});

test('หน้า: คีย์แถวมาจาก row.key · ทีมว่างมีป้าย · ตัวเลือกผู้รับผิดชอบไม่ซ้ำ', () => {
  const page = read('app/sales-planning/targets/report/page.js');
  assert.match(page, /<tr key=\{row\.key\}>/);
  assert.doesNotMatch(page, /key=\{row\.ownerId \|\| row\.team\}/);
  assert.match(page, /NO_TEAM_LABEL/);
  assert.match(page, /new Set\(\[\.\.\.rows, \.\.\.pendingOnly\]\.map\(\(row\) => row\.ownerId\)\)\.size/);
});
