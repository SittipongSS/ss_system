// ── "ทีมตามดีล" บนแดชบอร์ดขาย (มติผู้ใช้ 2026-09-14) ─────────────────────────────
//
// ตัวเลขขายระดับทีมทุกช่องลงทีมที่ **ประทับบนแถวต้นทาง** (sales_deals.team · sales_targets.team)
// ไม่ใช่ทีมของบัญชีเจ้าของ · บัญชีตอบแค่ "ใคร" (รวม id เก่า/เปลี่ยนชื่อ + ชื่อที่แสดง)
// ⇒ คนที่มีตัวเลขหลายทีมได้แถวละทีม และถังทีม = Σ ถังคนใต้ทีมนั้น ทุกช่อง
//
// route.js export ได้แค่ HTTP handler — เทสต์นี้จำลองลูปคน/ทีมของ aggregateMonth ด้วยตัวช่วยจริง
// (แพตเทิร์นเดียวกับ dashboardReconcile) · ยามซอร์สท้ายไฟล์ผูกตัวจำลองไว้กับ route
//
// ข้อมูลจริง 2026-09-14: ดีล/เป้ารายคน/SO อนุมัติ/ประวัติรายคน ที่ทีมต่างจากทีมบัญชี = 0 · คนหลายทีม = 0
// ⇒ วันนี้ตัวเลขทุกช่องต้องเท่าเดิม (เทสต์ "กติกาเก่า = กติกาใหม่" ข้างล่าง) ต่างได้แค่คีย์ภายใน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  dealMatchesOwner, isOpenDeal, isRealLostDeal, isWonDeal, normalizedOwnerName, wonAmountOf, wonMonthOf,
} from './dashboardMetrics.js';
import { forecastAmount, monthKey, teamRank } from '../salesPlanning.js';
import { isEmptyDashboardBucket, pendingApprovalFields, rollupPendingApproval } from './pendingApprovalRollup.js';
import { addWonAwaitingSo, rollupWonAwaitingSo, wonAwaitingSoFields } from './wonAwaitingSoRollup.js';
import { snapForecastLevel } from './forecastLevels.js';
import { buildOwnerResolver } from './ownerIdentity.js';
import { ownerBucketKey } from './ownerBucketKey.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const route = readFileSync(join(ROOT, 'src/app/api/sales-planning/dashboard/route.js'), 'utf8');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── กติกาถังคน: ใหม่ (route ปัจจุบัน) กับเก่า (ก่อนมติ — ทีมจากบัญชี) ─────────────────
const NEW_RULE = {
  key: ownerBucketKey,
  team: ({ team }) => team || null,
  mergeTeam: false,
};
const OLD_RULE = {
  key: ({ acc, id, name, team }) => {
    const cleanName = normalizedOwnerName(name);
    return acc ? `u|${acc.id}` : (cleanName ? `${team || 'no-team'}|${cleanName}` : (id || 'unassigned'));
  },
  team: ({ acc, team }) => acc?.team || team || null,
  mergeTeam: true,
};

/** สำเนาลูปคน/ทีมของ aggregateMonth (route.js) — เปลี่ยนได้แค่กติกาถังคน */
function aggregateOwnersAndTeams(visibleDeals, targets, month, users, { now, rule = NEW_RULE } = {}) {
  const resolveOwner = buildOwnerResolver(users);
  const openDeals = visibleDeals.filter((d) => isOpenDeal(d) && monthKey(d.forecastMonth) === month);
  const wonDeals = visibleDeals.filter((d) => isWonDeal(d) && wonMonthOf(d) === month);
  const lostDeals = visibleDeals.filter((d) => isRealLostDeal(d) && monthKey(d.forecastMonth) === month);
  const blank = () => ({ target: 0, won: 0, weighted: 0, fcTotal: 0, lost: 0, openCount: 0, wonCount: 0, fc: { 20: 0, 50: 0, 80: 0, 100: 0 }, ...pendingApprovalFields(), ...wonAwaitingSoFields() });

  const ownerMap = {};
  const ownerBucket = (id, name, team) => {
    const acc = resolveOwner(id, name);
    const key = rule.key({ acc, id, name, team });
    if (!ownerMap[key]) {
      ownerMap[key] = { ownerId: acc?.id || id || null, ownerName: acc?.name || name || 'ไม่ระบุ', team: rule.team({ acc, team }), ...blank() };
    } else {
      ownerMap[key].ownerId ||= id || null;
      ownerMap[key].ownerName = ownerMap[key].ownerName === 'ไม่ระบุ' && name ? name : ownerMap[key].ownerName;
      if (rule.mergeTeam) ownerMap[key].team ||= team || null;
    }
    return ownerMap[key];
  };
  const addDeal = (b, d) => {
    if (isWonDeal(d)) {
      b.won += wonAmountOf(d); b.fcTotal += Number(d.projectValue ?? 0); b.wonCount += 1;
      addWonAwaitingSo(b, d);
    }
    else if (d.stage === 'lost') { b.lost += Number(d.projectValue ?? 0); b.fcTotal += Number(d.projectValue ?? 0); }
    else if (isOpenDeal(d)) { b.weighted += forecastAmount(d); b.fcTotal += Number(d.projectValue ?? 0); b.openCount += 1; b.fc[snapForecastLevel(d.probability)] += forecastAmount(d); }
  };
  for (const t of targets) {
    if (!t.ownerId) continue;
    ownerBucket(t.ownerId, t.ownerName, t.team).target += Number(t.targetAmount || 0);
  }
  for (const d of [...openDeals, ...wonDeals, ...lostDeals]) addDeal(ownerBucket(d.ownerId, d.ownerName, d.team), d);

  const teamMap = {};
  const teamKey = (team) => team || 'ไม่ระบุ';
  const teamBucket = (team) => (teamMap[teamKey(team)] ||= { team: team || null, ...blank() });
  let saWideTarget = 0;
  const teamTargetParts = {};
  for (const t of targets) {
    if (!t.team) { saWideTarget += Number(t.targetAmount || 0); continue; }
    const key = teamKey(t.team);
    teamBucket(t.team);
    teamTargetParts[key] ||= { level: 0, person: 0 };
    if (t.ownerId) teamTargetParts[key].person += Number(t.targetAmount || 0);
    else teamTargetParts[key].level += Number(t.targetAmount || 0);
  }
  for (const [key, parts] of Object.entries(teamTargetParts)) teamMap[key].target = parts.level > 0 ? parts.level : parts.person;
  for (const d of [...openDeals, ...wonDeals, ...lostDeals]) addDeal(teamBucket(d.team), d);

  const pending = rollupPendingApproval(visibleDeals, month, {
    now,
    attribute: [(d) => ownerBucket(d.ownerId, d.ownerName, d.team), (d) => teamBucket(d.team)],
  });

  const byOwner = Object.values(ownerMap).filter((b) => !isEmptyDashboardBucket(b))
    .map((b) => ({ ...b, gap: b.target - b.won }))
    .sort((a, b) => b.target - a.target || b.won - a.won);
  const byTeam = Object.values(teamMap).filter((b) => !isEmptyDashboardBucket(b))
    .map((b) => ({ ...b, gap: b.target - b.won }))
    .sort((a, b) => teamRank(a.team) - teamRank(b.team) || b.target - a.target);
  return { byOwner, byTeam, saWideTarget, pending, wonAwaitingSo: rollupWonAwaitingSo(wonDeals) };
}

// ช่องที่มาจากดีล — ถังทีมต้องเท่า Σ ถังคนของทีมเดียวกันทุกช่อง (เป้าไม่อยู่ในนี้: ทีมใช้เป้าระดับทีมก่อน)
const DEAL_FIELDS = ['won', 'fcTotal', 'weighted', 'lost', 'openCount', 'wonCount', 'pendingApproval', 'pendingApprovalCount', 'wonAwaitingSo', 'wonAwaitingSoCount'];
function assertTeamsEqualSumOfPeople(result, label = '') {
  const teamKey = (team) => team || 'ไม่ระบุ';
  const teams = new Map(result.byTeam.map((t) => [teamKey(t.team), t]));
  for (const p of result.byOwner) {
    const hasDealFigures = DEAL_FIELDS.some((f) => p[f]);
    if (hasDealFigures) assert.ok(teams.has(teamKey(p.team)), `${label} แถวคน ${p.ownerId}/${p.team} ไม่มีแถวทีมรองรับ`);
  }
  for (const [key, t] of teams) {
    const people = result.byOwner.filter((p) => teamKey(p.team) === key);
    for (const f of DEAL_FIELDS) {
      assert.equal(people.reduce((s, p) => s + p[f], 0), t[f], `${label} ทีม ${key} ช่อง ${f}: ถังทีม ≠ Σ ถังคน`);
    }
    for (const level of [20, 50, 80, 100]) {
      assert.equal(people.reduce((s, p) => s + p.fc[level], 0), t.fc[level], `${label} ทีม ${key} fc ${level}`);
    }
  }
}
const sortRows = (rows) => rows.slice().sort((a, b) => `${a.team}|${a.ownerId}|${a.ownerName}`.localeCompare(`${b.team}|${b.ownerId}|${b.ownerName}`));
// เรียงแถวของคนหนึ่งตามรหัสทีม · แถวไร้ทีมไว้ท้ายสุด
const rowsOf = (result, ownerId) => result.byOwner.filter((r) => r.ownerId === ownerId)
  .sort((a, b) => (a.team === null) - (b.team === null) || String(a.team).localeCompare(String(b.team)));

// ── ตัวอย่างข้อมูล ──────────────────────────────────────────────────────────────
const NOW = new Date('2026-09-10T03:00:00Z'); // 10:00 เวลาไทย ⇒ เดือนปัจจุบัน 2026-09
const MONTH = '2026-09';
const open = (o) => ({ stage: 'quotation', projectValue: 100000, probability: 50, forecastMonth: MONTH, dealType: 'NPD', metadata: {}, ...o });
const won = (o) => ({ stage: 'won', projectValue: 200000, wonValue: 180000, confirmedAt: '2026-09-03T03:00:00Z', forecastMonth: MONTH, dealType: 'NPD', metadata: { actualSource: 'sale_order', wonMonth: MONTH }, ...o });
// Won แล้ว ไม่มี SO อนุมัติ/รออนุมัติ ⇒ กองรอยื่น SO (ยอด = projectValue)
const awaiting = (o) => ({ stage: 'won', projectValue: 150000, wonValue: 0, confirmedAt: '2026-09-04T03:00:00Z', forecastMonth: MONTH, dealType: 'SCENT', metadata: { wonMonth: null }, ...o });
// Won เดือนนี้ มีใบรออนุมัติ
const pending = (o) => ({ stage: 'won', projectValue: 90000, wonValue: 0, confirmedAt: '2026-09-05T03:00:00Z', forecastMonth: MONTH, dealType: 'NPD', metadata: { actualSource: 'sale_order', soPendingAmount: 60000, soPendingCount: 2 }, ...o });
// Won เดือนก่อน (SO อนุมัติ ส.ค.) แล้วมีใบใหม่รออนุมัติ ⇒ ถังเดือนนี้เกิดจากรอบรออนุมัติอย่างเดียว
const pendingFromAug = (o) => ({ stage: 'won', projectValue: 50000, wonValue: 40000, confirmedAt: '2026-08-05T03:00:00Z', forecastMonth: '2026-08', dealType: 'RE-ORDER', metadata: { actualSource: 'sale_order', wonMonth: '2026-08', soPendingAmount: 25000, soPendingCount: 1 }, ...o });
const lost = (o) => ({ stage: 'lost', projectValue: 70000, forecastMonth: MONTH, dealType: 'OTHER', metadata: {}, ...o });

// ข้อมูลทีมเดียว: ทุกดีล/เป้ารายคนประทับทีมเดียวกับบัญชี (= สภาพข้อมูลจริงวันนี้)
const SINGLE_USERS = [
  { id: 'u1', name: 'สมชาย ใจดี', team: 'KA', teams: ['KA'] },
  { id: 'u2', name: 'สมหญิง รักงาน', team: 'ODM', teams: ['ODM'] },
  { id: 'u3', name: 'สมศักดิ์ ขยัน', team: 'SV', teams: ['SV'] },
  { id: 'adm', name: 'แอดมิน ระบบ', team: null, teams: [] },
];
const SINGLE_DEALS = [
  open({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA', probability: 20 }),
  open({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA', probability: 80, projectValue: 120000 }),
  won({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA' }),
  awaiting({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA' }),
  lost({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA' }),
  // id เก่า stale จับบัญชีด้วยชื่อ snapshot (ช่องว่างเกิน) ⇒ ถังเดียวกับ u1
  won({ ownerId: 'old-u1', ownerName: ' สมชาย  ใจดี ', team: 'KA', wonValue: 50000 }),
  won({ ownerId: 'u2', ownerName: 'สมหญิง ชื่อเก่า', team: 'ODM', wonValue: 90000 }),
  pending({ ownerId: 'u2', ownerName: 'สมหญิง รักงาน', team: 'ODM' }),
  open({ ownerId: 'u2', ownerName: 'สมหญิง รักงาน', team: 'ODM' }),
  lost({ ownerId: 'u2', ownerName: 'สมหญิง รักงาน', team: 'ODM', metadata: { sahamitMergedIntoDealId: 'D9' } }), // แพ้เชิงธุรการ ไม่นับ
  pendingFromAug({ ownerId: 'u3', ownerName: 'สมศักดิ์ ขยัน', team: 'SV' }),
  // จับบัญชีไม่ได้: ชื่อ legacy · ไม่มีชื่อ (id stale) · ไม่มีเจ้าของเลย
  open({ ownerId: 'gone-9', ownerName: 'พนักงาน ลาออก', team: 'ODM' }),
  lost({ ownerId: 'ghost-id', ownerName: null, team: 'SV' }),
  open({ ownerId: null, ownerName: null, team: 'SV' }),
  // แอดมินไม่มีทีม เปิดดีลเอง ⇒ ดีลไร้ทีม (ทีมบัญชีก็ว่าง — ตรงกัน)
  awaiting({ ownerId: 'adm', ownerName: 'แอดมิน ระบบ', team: null }),
  // นอกเดือน
  open({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA', forecastMonth: '2026-10' }),
  won({ ownerId: 'u2', ownerName: 'สมหญิง รักงาน', team: 'ODM', confirmedAt: '2026-08-10T03:00:00Z', metadata: { actualSource: 'sale_order', wonMonth: '2026-08' } }),
];
const SINGLE_TARGETS = [
  { targetMonth: MONTH, ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA', targetAmount: 500000 },
  { targetMonth: MONTH, ownerId: 'u2', ownerName: 'สมหญิง รักงาน', team: 'ODM', targetAmount: 300000 },
  { targetMonth: MONTH, ownerId: 'u3', ownerName: 'สมศักดิ์ ขยัน', team: 'SV', targetAmount: 100000 },
  { targetMonth: MONTH, ownerId: null, ownerName: null, team: 'SV', targetAmount: 250000 }, // เป้าระดับทีม
  { targetMonth: MONTH, ownerId: null, ownerName: null, team: null, targetAmount: 1000000 }, // เป้า SA รวม
  { targetMonth: MONTH, ownerId: 'u9', ownerName: 'เป้าค้างศูนย์', team: 'RT', targetAmount: 0 }, // ถังผี
];

// ── คีย์ถังคน ──────────────────────────────────────────────────────────────────
test('ownerBucketKey: ทุกรูปคีย์มีทีมที่ประทับ · ไม่อ่านทีมของบัญชี · ทีมว่าง \'\' = null', () => {
  const acc = { id: 'u1', name: 'สมชาย ใจดี', team: 'ODM', teams: ['ODM'] };
  assert.equal(ownerBucketKey({ acc, id: 'u1', name: 'x', team: 'KA' }), 'u|u1|KA');
  assert.equal(ownerBucketKey({ acc, id: 'u1', name: 'x', team: null }), 'u|u1|');
  assert.equal(ownerBucketKey({ acc, id: 'u1', name: 'x', team: '' }), 'u|u1|');
  // ทีมของบัญชีเปลี่ยน คีย์ไม่เปลี่ยน
  assert.equal(ownerBucketKey({ acc: { ...acc, team: 'SV', teams: ['SV', 'KA'] }, id: 'u1', team: 'KA' }), 'u|u1|KA');
  // คนเดียวกันต่างทีม = คนละถัง
  assert.notEqual(ownerBucketKey({ acc, id: 'u1', team: 'KA' }), ownerBucketKey({ acc, id: 'u1', team: 'ODM' }));
  // จับบัญชีไม่ได้ → ชื่อ normalize + ทีม
  assert.equal(ownerBucketKey({ acc: null, id: 'gone', name: ' พนักงาน  ลาออก ', team: 'ODM' }), 'ODM|พนักงาน ลาออก');
  assert.equal(ownerBucketKey({ acc: null, id: 'gone', name: 'พนักงาน ลาออก', team: null }), 'no-team|พนักงาน ลาออก');
  // ไม่มีชื่อ → id + ทีม · ไม่มีอะไรเลย → unassigned + ทีม
  assert.equal(ownerBucketKey({ acc: null, id: 'ghost-id', name: null, team: 'SV' }), 'SV|ghost-id');
  assert.equal(ownerBucketKey({ acc: null, id: null, name: '  ', team: '' }), 'no-team|unassigned');
  assert.equal(ownerBucketKey(), 'no-team|unassigned');
});

// ── ข้อมูลวันนี้ (ทีมเดียว) ⇒ ตัวเลขเท่ากติกาเก่าทุกช่อง ─────────────────────────────
test('ข้อมูลทีมเดียว: byOwner/byTeam ตามกติกาใหม่ = กติกาเก่าทุกแถวทุกตัวเลข', () => {
  const next = aggregateOwnersAndTeams(SINGLE_DEALS, SINGLE_TARGETS, MONTH, SINGLE_USERS, { now: NOW, rule: NEW_RULE });
  const prev = aggregateOwnersAndTeams(SINGLE_DEALS, SINGLE_TARGETS, MONTH, SINGLE_USERS, { now: NOW, rule: OLD_RULE });
  assert.equal(next.byOwner.length, prev.byOwner.length);
  assert.deepEqual(sortRows(next.byOwner), sortRows(prev.byOwner));
  assert.deepEqual(next.byOwner, prev.byOwner, 'ลำดับแถวก็ต้องเท่าเดิม');
  assert.deepEqual(next.byTeam, prev.byTeam);
  assert.deepEqual(next.pending, prev.pending);
  assert.deepEqual(next.wonAwaitingSo, prev.wonAwaitingSo);
  assertTeamsEqualSumOfPeople(next, 'ทีมเดียว');

  // ตัวอย่างนี้ครอบทุกช่องจริง (กันเทสต์ผ่านเพราะทุกช่องเป็นศูนย์)
  const u1 = rowsOf(next, 'u1');
  assert.equal(u1.length, 1);
  assert.deepEqual(
    { team: u1[0].team, won: u1[0].won, wonCount: u1[0].wonCount, openCount: u1[0].openCount, lost: u1[0].lost, wonAwaitingSo: u1[0].wonAwaitingSo, target: u1[0].target },
    { team: 'KA', won: 230000, wonCount: 3, openCount: 2, lost: 70000, wonAwaitingSo: 150000, target: 500000 },
    'id เก่าที่จับด้วยชื่อรวมถังเดียวกับบัญชี',
  );
  assert.equal(rowsOf(next, 'u2')[0].ownerName, 'สมหญิง รักงาน', 'ชื่อที่แสดงมาจากบัญชี');
  assert.equal(rowsOf(next, 'u2')[0].pendingApproval, 60000);
  assert.equal(rowsOf(next, 'u3')[0].pendingApprovalCount, 1, 'ถังที่มีแต่รออนุมัติยังมีแถว');
  assert.equal(rowsOf(next, 'adm')[0].team, null);
  assert.ok(next.byOwner.some((r) => r.ownerId === 'gone-9' && r.team === 'ODM'));
  assert.ok(next.byOwner.some((r) => r.ownerId === 'ghost-id' && r.team === 'SV'));
  assert.ok(next.byOwner.some((r) => r.ownerId === null && r.ownerName === 'ไม่ระบุ' && r.team === 'SV'));
  assert.ok(!next.byOwner.some((r) => r.ownerId === 'u9'), 'ถังผีถูกตัด');
  assert.equal(next.byTeam.find((t) => t.team === 'SV').target, 250000, 'เป้าระดับทีมชนะผลรวมรายคน');
  assert.equal(next.saWideTarget, 1000000);
});

// ── คนเดียวมีดีลหลายทีม ────────────────────────────────────────────────────────
const MULTI_USERS = [
  { id: 'u1', name: 'สมชาย ใจดี', team: 'KA', teams: ['KA', 'ODM'] },
  { id: 'u4', name: 'มานพ ย้ายทีม', team: 'ODM', teams: ['ODM'] }, // ย้ายจาก KA มา ODM แล้ว
  { id: 'u5', name: 'วิภา เป้าข้ามทีม', team: 'ODM', teams: ['ODM'] },
];
const MULTI_DEALS = [
  // u1 ใน KA
  won({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA' }),
  open({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA', probability: 80 }),
  lost({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA' }),
  // u1 ใน ODM (รวมดีล id เก่าที่จับด้วยชื่อ)
  won({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'ODM', wonValue: 120000 }),
  awaiting({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'ODM' }),
  pending({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'ODM' }),
  open({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'ODM', probability: 20 }),
  open({ ownerId: 'old-u1', ownerName: 'สมชาย ใจดี', team: 'ODM', projectValue: 30000 }),
  // u1 ดีลไร้ทีม
  awaiting({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: null, projectValue: 40000 }),
  // u4 คนย้ายทีม: บัญชีเป็น ODM แล้ว แต่ดีลเดือนนี้ประทับ KA
  won({ ownerId: 'u4', ownerName: 'มานพ ย้ายทีม', team: 'KA', wonValue: 75000 }),
  pendingFromAug({ ownerId: 'u4', ownerName: 'มานพ ย้ายทีม', team: 'KA' }),
  open({ ownerId: 'u4', ownerName: 'มานพ ย้ายทีม', team: 'KA' }),
  // u5 ดีล ODM ล้วน แต่มีเป้า KA
  open({ ownerId: 'u5', ownerName: 'วิภา เป้าข้ามทีม', team: 'ODM' }),
  won({ ownerId: 'u5', ownerName: 'วิภา เป้าข้ามทีม', team: 'ODM', wonValue: 60000 }),
];
const MULTI_TARGETS = [
  { targetMonth: MONTH, ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA', targetAmount: 500000 },
  { targetMonth: MONTH, ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'ODM', targetAmount: 200000 },
  { targetMonth: MONTH, ownerId: 'u5', ownerName: 'วิภา เป้าข้ามทีม', team: 'KA', targetAmount: 400000 },
];

test('คนเดียวสองทีม: ได้แถวละทีม · ถังทีม = Σ ถังคนของทีมนั้นทุกช่อง', () => {
  const r = aggregateOwnersAndTeams(MULTI_DEALS, MULTI_TARGETS, MONTH, MULTI_USERS, { now: NOW });
  assertTeamsEqualSumOfPeople(r, 'หลายทีม');

  const u1 = rowsOf(r, 'u1');
  assert.deepEqual(u1.map((x) => x.team), ['KA', 'ODM', null], 'u1 มีแถว KA · ODM · ไร้ทีม');
  assert.ok(u1.every((x) => x.ownerName === 'สมชาย ใจดี'));
  const [ka, odm, none] = u1;
  assert.deepEqual(
    { won: ka.won, wonCount: ka.wonCount, openCount: ka.openCount, lost: ka.lost, weighted: ka.weighted, target: ka.target, pendingApproval: ka.pendingApproval, wonAwaitingSo: ka.wonAwaitingSo },
    { won: 180000, wonCount: 1, openCount: 1, lost: 70000, weighted: 100000, target: 500000, pendingApproval: 0, wonAwaitingSo: 0 },
  );
  assert.deepEqual(
    { won: odm.won, wonCount: odm.wonCount, openCount: odm.openCount, weighted: odm.weighted, fcTotal: odm.fcTotal, target: odm.target, pendingApproval: odm.pendingApproval, pendingApprovalCount: odm.pendingApprovalCount, wonAwaitingSo: odm.wonAwaitingSo, wonAwaitingSoCount: odm.wonAwaitingSoCount },
    { won: 120000, wonCount: 3, openCount: 2, weighted: 130000, fcTotal: 200000 + 150000 + 90000 + 100000 + 30000, target: 200000, pendingApproval: 60000, pendingApprovalCount: 2, wonAwaitingSo: 150000, wonAwaitingSoCount: 1 },
    'ดีล id เก่าที่จับด้วยชื่อลงแถวทีมของดีลนั้น',
  );
  assert.deepEqual({ wonAwaitingSo: none.wonAwaitingSo, wonAwaitingSoCount: none.wonAwaitingSoCount, target: none.target }, { wonAwaitingSo: 40000, wonAwaitingSoCount: 1, target: 0 });

  // ถังทีมรวมยอดของทุกคนในทีมนั้น — ยอดบริษัทยังเท่า Σ ทีม
  const teamOf = (team) => r.byTeam.find((t) => t.team === team);
  assert.equal(teamOf('KA').won, 180000 + 75000);
  assert.equal(teamOf('ODM').won, 120000 + 60000);
  assert.equal(teamOf(null).wonAwaitingSo, 40000);
  assert.equal(r.byTeam.reduce((s, t) => s + t.pendingApproval, 0), r.pending.pendingApproval);
  assert.equal(r.byOwner.reduce((s, p) => s + p.pendingApproval, 0), r.pending.pendingApproval);
  assert.equal(r.byTeam.reduce((s, t) => s + t.wonAwaitingSo, 0), r.wonAwaitingSo.wonAwaitingSo);
  assert.equal(r.byOwner.reduce((s, p) => s + p.wonAwaitingSoCount, 0), r.wonAwaitingSo.wonAwaitingSoCount);

  // กติกาเก่า (ทีมบัญชี) รวม u1 เป็นแถวเดียว ⇒ แถวทีมไม่เท่าผลรวมคน — เหตุที่ต้องเปลี่ยน
  const prev = aggregateOwnersAndTeams(MULTI_DEALS, MULTI_TARGETS, MONTH, MULTI_USERS, { now: NOW, rule: OLD_RULE });
  assert.equal(rowsOf(prev, 'u1').length, 1);
  assert.throws(() => assertTeamsEqualSumOfPeople(prev, 'กติกาเก่า'));
});

test('คนย้ายทีม: ดีลที่ประทับ KA อยู่แถว KA แม้บัญชีเป็น ODM แล้ว · เปลี่ยนทีมบัญชีตัวเลขไม่ขยับ', () => {
  const r = aggregateOwnersAndTeams(MULTI_DEALS, MULTI_TARGETS, MONTH, MULTI_USERS, { now: NOW });
  const u4 = rowsOf(r, 'u4');
  assert.equal(u4.length, 1);
  assert.equal(u4[0].team, 'KA');
  assert.deepEqual(
    { won: u4[0].won, wonCount: u4[0].wonCount, openCount: u4[0].openCount, pendingApproval: u4[0].pendingApproval, pendingApprovalCount: u4[0].pendingApprovalCount },
    { won: 75000, wonCount: 1, openCount: 1, pendingApproval: 25000, pendingApprovalCount: 1 },
    'ใบรออนุมัติของดีลเดือนก่อนก็ลงทีมของดีล',
  );
  const odmPeople = r.byOwner.filter((p) => p.team === 'ODM').map((p) => p.ownerId).sort();
  assert.deepEqual(odmPeople, ['u1', 'u5'], 'ทีมใหม่ของบัญชีไม่ได้ยอดของทีมเดิม');

  // ย้ายบัญชีไปทีมไหนก็ตาม (หรือไม่มีทีม) ผลต้องเท่าเดิมทุกตัวอักษร
  for (const moved of [{ team: 'SV', teams: ['SV'] }, { team: 'KA', teams: ['KA'] }, { team: null, teams: [] }]) {
    const users = MULTI_USERS.map((u) => ({ ...u, ...moved }));
    assert.deepEqual(aggregateOwnersAndTeams(MULTI_DEALS, MULTI_TARGETS, MONTH, users, { now: NOW }), r, JSON.stringify(moved));
  }
});

test('ดีลไร้ทีมของคน KA → แถวคนทีม null · ลงถัง "ไม่ระบุ" ของทีม', () => {
  const users = [{ id: 'u1', name: 'สมชาย ใจดี', team: 'KA', teams: ['KA'] }];
  const deals = [
    won({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA' }),
    open({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: null }),
    pending({ ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: '' }), // สตริงว่าง = ไร้ทีมเหมือน null
  ];
  const r = aggregateOwnersAndTeams(deals, [], MONTH, users, { now: NOW });
  assertTeamsEqualSumOfPeople(r, 'ไร้ทีม');
  const rows = rowsOf(r, 'u1');
  assert.deepEqual(rows.map((x) => x.team), ['KA', null]);
  assert.deepEqual(
    { openCount: rows[1].openCount, wonCount: rows[1].wonCount, pendingApproval: rows[1].pendingApproval },
    { openCount: 1, wonCount: 1, pendingApproval: 60000 },
    'null กับ \'\' เป็นถังเดียวกัน',
  );
  const none = r.byTeam.find((t) => t.team === null);
  assert.ok(none, 'ถังทีมไร้ทีมต้องมี');
  assert.equal(none.openCount, 1);
  assert.equal(rows[0].openCount, 0, 'ทีมบัญชี (KA) ไม่ได้ดีลไร้ทีม');
});

test('เป้ารายคนประทับ KA แต่ดีลอยู่ ODM → สองแถว · เป้าอยู่แถว KA เท่านั้น', () => {
  const r = aggregateOwnersAndTeams(MULTI_DEALS, MULTI_TARGETS, MONTH, MULTI_USERS, { now: NOW });
  const u5 = rowsOf(r, 'u5');
  assert.deepEqual(u5.map((x) => x.team), ['KA', 'ODM']);
  const [ka, odm] = u5;
  // gap = เป้า − Actual ⇒ แถวที่มีแต่เป้า ขาดเต็มเป้า
  assert.deepEqual({ target: ka.target, won: ka.won, gap: ka.gap, openCount: ka.openCount, wonCount: ka.wonCount }, { target: 400000, won: 0, gap: 400000, openCount: 0, wonCount: 0 });
  assert.deepEqual({ target: odm.target, won: odm.won, gap: odm.gap, openCount: odm.openCount }, { target: 0, won: 60000, gap: -60000, openCount: 1 });
  // เป้าทีม (ไม่มีเป้าระดับทีม) = Σ เป้ารายคนที่ประทับทีมนั้น
  const teamOf = (team) => r.byTeam.find((t) => t.team === team);
  assert.equal(teamOf('KA').target, 500000 + 400000);
  assert.equal(teamOf('ODM').target, 200000);
  for (const t of r.byTeam) {
    assert.equal(r.byOwner.filter((p) => p.team === t.team).reduce((s, p) => s + p.target, 0), t.target, `เป้าทีม ${t.team}`);
  }
});

test('ลิ้นชักแถวคน (teamScoped) ได้ดีลชุดเดียวกับแถว — ไม่ส่งธง = ดีลทีมอื่นของคนเดียวกันปนมา', () => {
  const r = aggregateOwnersAndTeams(MULTI_DEALS, MULTI_TARGETS, MONTH, MULTI_USERS, { now: NOW });
  const wonThisMonth = MULTI_DEALS.filter((d) => isWonDeal(d) && wonMonthOf(d) === MONTH);
  const drawer = (row, extra = {}) => wonThisMonth.filter((d) => dealMatchesOwner(d, { ownerId: row.ownerId, ownerName: row.ownerName, team: row.team, ...extra }));
  for (const row of [...rowsOf(r, 'u1'), ...rowsOf(r, 'u4'), ...rowsOf(r, 'u5')]) {
    const deals = drawer(row, { teamScoped: true });
    assert.equal(deals.length, row.wonCount, `${row.ownerId}/${row.team} wonCount`);
    assert.equal(deals.reduce((s, d) => s + wonAmountOf(d), 0), row.won, `${row.ownerId}/${row.team} won`);
  }
  const u1ka = rowsOf(r, 'u1').find((x) => x.team === 'KA');
  assert.ok(drawer(u1ka).length > u1ka.wonCount, 'ไม่ส่งธง = กติกาเดิม (id ตรงไม่ดูทีม)');
});

/* ⚠️ กรณีเดียวที่ตัวเลข "รายแถว" ต่างจากกติกาเก่าได้ **โดยไม่ขึ้นกับทีมบัญชี**: แถวที่จับบัญชีไม่ได้และไม่มีชื่อ
   (ดีลไม่มีเจ้าของ · id stale ที่ไม่มีชื่อ snapshot) — คีย์เก่า `id || 'unassigned'` ไม่มีทีม ⇒ ดีลสองทีมรวมเป็น
   แถวเดียวใต้ทีมที่เจอก่อน (แถวทีมไม่เท่าผลรวมคน) · คีย์ใหม่มีทีมตามสเปก ⇒ แยกแถวละทีม
   ผลรวมทุกช่องและถังทีมเท่าเดิม ต่างแค่การแบ่งแถว · ข้อมูลที่ตรวจ 2026-09-14 (ทีมดีล ≠ ทีมบัญชี) ไม่ครอบกรณีนี้
   เพราะแถวพวกนี้ไม่มีบัญชีให้เทียบ — ถ้ามีดีลแบบนี้ในเดือนเดียวกันหลายทีม แถว "ไม่ระบุ" จะแตกเป็นรายทีม */
test('แถวไม่มีเจ้าของ / id stale ไม่มีชื่อ ในสองทีม → แถวละทีม (กติกาเก่ารวมแถวเดียว) · ผลรวมและถังทีมเท่าเดิม', () => {
  const deals = [
    open({ ownerId: null, ownerName: null, team: 'KA' }),
    open({ ownerId: null, ownerName: '  ', team: 'ODM', projectValue: 40000 }),
    lost({ ownerId: 'ghost-id', ownerName: null, team: 'KA' }),
    won({ ownerId: 'ghost-id', ownerName: null, team: 'SV', wonValue: 30000 }),
  ];
  const next = aggregateOwnersAndTeams(deals, [], MONTH, [], { now: NOW });
  const prev = aggregateOwnersAndTeams(deals, [], MONTH, [], { now: NOW, rule: OLD_RULE });
  assertTeamsEqualSumOfPeople(next, 'ไม่มีเจ้าของ');
  assert.throws(() => assertTeamsEqualSumOfPeople(prev, 'กติกาเก่า'));
  const teamsOf = (result, ownerId) => result.byOwner.filter((r) => r.ownerId === ownerId).map((r) => r.team).sort();
  assert.deepEqual(teamsOf(next, null), ['KA', 'ODM']);
  assert.deepEqual(teamsOf(next, 'ghost-id'), ['KA', 'SV']);
  assert.equal(teamsOf(prev, null).length, 1);
  assert.equal(teamsOf(prev, 'ghost-id').length, 1);
  const sum = (rows, f) => rows.reduce((s, r) => s + r[f], 0);
  for (const f of DEAL_FIELDS) assert.equal(sum(next.byOwner, f), sum(prev.byOwner, f), `Σ ${f}`);
  assert.deepEqual(next.byTeam, prev.byTeam, 'ถังทีมไม่ขึ้นกับกติกาถังคน');
});

// ── ยามซอร์ส: ตัวจำลองข้างบนต้องยังเป็นกติกาเดียวกับ route ─────────────────────────
test('route: ถังคนใช้ ownerBucketKey + ทีมที่ประทับ · ไม่อ่านทีมบัญชี · ไม่เติมทีมทีหลัง', () => {
  const src = codeOnly(route);
  assert.match(src, /import \{ ownerBucketKey \} from '@\/lib\/sales\/ownerBucketKey';/);
  const at = src.indexOf('const ownerBucket = (id, name, team) => {');
  assert.ok(at > 0);
  const body = src.slice(at, src.indexOf('return ownerMap[key];', at));
  assert.match(body, /const acc = resolveOwner\(id, name\);/);
  assert.match(body, /const key = ownerBucketKey\(\{ acc, id, name, team \}\);/);
  assert.match(body, /ownerMap\[key\] = \{ ownerId: acc\?\.id \|\| id \|\| null, ownerName: acc\?\.name \|\| name \|\| 'ไม่ระบุ', team: team \|\| null, /);
  assert.match(body, /ownerMap\[key\]\.ownerId \|\|= id \|\| null;/);
  assert.doesNotMatch(body, /\.team \|\|=/, 'คีย์กำหนดทีมแล้ว — ห้ามเติมทีมให้ถังทีหลัง');
  assert.doesNotMatch(src, /\bacc\??\.teams?\b/, 'ทีมของบัญชีห้ามใช้วางยอด');
  assert.equal((src.match(/ownerBucketKey\(/g) || []).length, 1);
  // ทีมของถังทีม/เป้าทีมยังตามแถวต้นทาง
  assert.match(src, /const teamKey = \(team\) => team \|\| 'ไม่ระบุ';/);
  assert.match(src, /ownerBucket\(t\.ownerId, t\.ownerName, t\.team\)\.target \+= Number\(t\.targetAmount \|\| 0\);/);
  assert.match(src, /teamMap\[key\]\.target = parts\.level > 0 \? parts\.level : parts\.person;/);
});
