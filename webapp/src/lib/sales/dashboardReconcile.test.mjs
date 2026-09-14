// ── ยอดรวมบริษัทต้องกระทบกับผลรวมรายทีมได้ ─────────────────────────────────
//
// แดชบอร์ดคืนตัวเลขสองระดับที่คนอ่านเอามาเทียบกันเสมอ:
//   totals.*  ยอดรวมทั้งฝ่าย
//   byTeam[]  แยกรายทีม (หน้า "ผลงานขาย" วาดเป็นแถวทีม + แถวบริษัท)
// ถ้าดีลบางใบถูกนับใน totals แต่หายจาก byTeam ⇒ สองแถวไม่ตรงกันโดยไม่มีอะไรบอก
// แล้วคนจะไปไล่หาว่า "ยอดหายไปไหน" ทั้งที่ข้อมูลอยู่ครบ
//
// 🐞 เดิม route กรอง `.filter((b) => b.team)` ทิ้งถังของดีลที่ไม่ระบุทีม
// เอื้อมถึงจริง: ฟอร์มสร้างดีลไม่มีช่องทีม → ทีมมาจาก `user.team` ล้วน และ
// **แอดมิน/AE Supervisor ไม่มีทีม** ⇒ ดีลที่สองตำแหน่งนี้เปิดจะไร้ทีมทันที
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { forecastAccuracyRollup, isRealLostDeal, isWonDeal, wonAmountOf, wonMonthOf } from './dashboardMetrics.js';
import { attributionTeam } from '../permissions.js';
import { isEmptyDashboardBucket, pendingApprovalFields } from './pendingApprovalRollup.js';
import { addWonAwaitingSo, rollupWonAwaitingSo, wonAwaitingSoFields } from './wonAwaitingSoRollup.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const route = readFileSync(join(ROOT, 'src/app/api/sales-planning/dashboard/route.js'), 'utf8');

test('byTeam ต้องไม่ทิ้งถังของดีลที่ไม่ระบุทีม', () => {
  assert.doesNotMatch(
    route, /\.filter\(\(b\) => b\.team\)/,
    'ตัดถัง null ทิ้ง = ดีลไร้ทีมนับใน totals แต่หายจากตารางทีม ⇒ ยอดสองระดับไม่ตรงกัน',
  );
});

/* 🐞 ลิ้นชักรายดีลของแถว "ไม่ระบุทีม" เคยโชว์ดีลทุกทีมทั้งบริษัท (ป้ายนี้หลุดไป `return true`)
   ⇒ ช่องบนตารางคิดจากถัง null (ดีลไร้ทีม) แต่ลิ้นชักรวมทุกดีล ยอดสองที่ไม่ตรงกัน
   2026-09-11: ช่อง "รออนุมัติ" ของแถวนี้เปิดลิ้นชักได้ด้วย (mig 0353) — ต้องกระทบกันเหมือนทุก metric */
test('ลิ้นชักของแถว "ไม่ระบุทีม" = ดีลที่ไม่มีทีมเท่านั้น (ตรงกับถัง null ของ route)', () => {
  const modal = readFileSync(join(ROOT, 'src/components/salesPlanning/DealDrillDownModal.js'), 'utf8');
  const perf = readFileSync(join(ROOT, 'src/lib/sales/performanceMath.js'), 'utf8');
  // ป้ายแถวต้องเป็นคีย์เดียวกับที่ buildMatrix ตั้งให้ถัง null
  assert.match(modal, /const NO_TEAM_ROW = "ไม่ระบุทีม";/);
  assert.match(perf, /\|\| 'ไม่ระบุทีม'/, 'buildMatrix เปลี่ยนป้ายถัง null แล้ว — NO_TEAM_ROW ของลิ้นชักต้องตามไปด้วย');
  // route: ถัง null = ดีลที่ team ว่าง (null หรือสตริงว่าง)
  assert.match(route, /const teamKey = \(team\) => team \|\| 'ไม่ระบุ';/);
  const scope = modal.slice(modal.indexOf('let filtered = (data || []).filter('), modal.indexOf('if (filter.metric === "won")'));
  assert.match(scope, /if \(filter\.team === NO_TEAM_ROW\) return !d\.team;/);
  assert.match(scope, /if \(filter\.team\) return d\.team === filter\.team;/);
  assert.doesNotMatch(scope, /filter\.team !== "ไม่ระบุทีม"/, 'ห้ามให้ป้าย "ไม่ระบุทีม" หลุดไปเป็นทุกดีล');
  // เช็กแถวคนก่อนแถวทีม — แถวรายคนในกลุ่ม "ไม่ระบุทีม" ยังจับด้วยตัวตนคน ไม่ใช่ทีมว่าง
  assert.ok(scope.indexOf('dealMatchesOwner(d, filter)') < scope.indexOf('NO_TEAM_ROW'));
});

/* **ดีลไร้ทีมยังเกิดได้อยู่** — เหตุผลของเทสต์ข้างบน (ถัง null ต้องโชว์) จึงยังจริง
   2026-08-11: ฟอร์มมีช่องทีมแล้ว แต่ช่องนั้นให้เลือกได้เฉพาะ "ทีมของเจ้าของ" เท่านั้น
   ⇒ เจ้าของที่ไม่มีทีม (admin/AE Sup เปิดดีลเอง) ยังได้ดีลไร้ทีมเหมือนเดิม
   ตรวจด้วยฟังก์ชันจริง ไม่ใช่ regex — แข็งแรงกว่าและไม่พังตอนจัดรูปโค้ดใหม่ */
test('ดีลยังไร้ทีมได้เมื่อเจ้าของไม่มีทีม — ต้นเหตุที่ถัง null ต้องโชว์', () => {
  assert.equal(attributionTeam({ role: 'admin' }, 'KA'), null,
    'คนไม่มีทีมเลือกทีมไม่ได้ แม้ยิงค่ามาเอง ⇒ ดีลไร้ทีม');
  assert.equal(attributionTeam({ role: 'ae_supervisor', team: null, teams: [] }, 'ODM'), null);
  // คนมีทีมยังได้ทีมเสมอ — ไม่ใช่ว่ากติกาใหม่ทำให้ทุกใบไร้ทีม
  assert.equal(attributionTeam({ role: 'ae', team: 'ODM', teams: ['ODM', 'SV'] }, 'SV'), 'SV');

  const post = readFileSync(join(ROOT, 'src/app/api/sales-planning/deals/route.js'), 'utf8');
  assert.match(post, /team: owner\?\.team \|\| attributionTeam\(user, body\.team\)/);
});

// ── กติกาการรวมยอดที่หน้าเว็บกับ server ต้องใช้ชุดเดียวกัน ──────────────────
test('FC Total = เปิด + Won + แพ้ (ไม่เอา Actual มาแทน FC ของดีลที่ปิดแล้ว)', () => {
  const open = [{ projectValue: 100 }];
  const won = [{ projectValue: 200, wonValue: 180, metadata: { actualSource: 'sale_order' } }];
  const lost = [{ projectValue: 50 }];
  const r = forecastAccuracyRollup(open, won, lost);
  assert.equal(r.fullForecast, 350, 'FC Total ต้องคิดจาก projectValue ของทั้งสามกลุ่ม');
  assert.equal(r.remainingForecast, 100, 'FC คงเหลือ = เฉพาะดีลที่ยังเปิด');
  assert.equal(r.wonValue, 180, 'Actual = ยอดจาก SO ที่อนุมัติแล้ว');
  assert.equal(r.forecastVariance, 180 - 200 - 50);
});

test('Actual นับเฉพาะที่ยืนยันว่ามาจาก Sale Order ที่อนุมัติแล้ว', () => {
  // ดีล Won ที่ยังไม่มี SO อนุมัติ → Actual = 0 (wonValue เป็นแค่ cache จากใบเสนอราคา)
  const r = forecastAccuracyRollup([], [{ projectValue: 200, wonValue: 180, metadata: {} }], []);
  assert.equal(r.wonValue, 0, 'ยังไม่มี actualSource=sale_order ห้ามนับเป็น Actual');
  assert.equal(r.fullForecast, 200, 'แต่ FC ของมันยังอยู่ในภาพรวม');
});

test('ดีลที่ถูกยุบ/แทนที่ของสายสหมิตร ไม่ใช่ "แพ้จริง"', () => {
  assert.equal(isRealLostDeal({ stage: 'lost' }), true);
  assert.equal(isRealLostDeal({ stage: 'lost', metadata: { sahamitMergedIntoDealId: 'D9' } }), false);
  assert.equal(isRealLostDeal({ stage: 'lost', metadata: { sahamitSupersededByRoundId: 'R2' } }), false);
});

/* เดือนที่นับ Actual มาก่อนเดือน FC เสมอ — ดีลที่ FC ไว้เดือนหนึ่งแต่ปิดได้อีกเดือน
   จะย้ายไปนับ (ทั้ง Actual **และ FC ของตัวเอง**) ที่เดือนที่ปิด ไม่ค้างที่เดือน FC เดิม

   ⭐ มติผู้ใช้ 2026-08-05: **ตั้งใจให้เป็นแบบนี้** เพราะเส้นทางทำงานจริงคือ SA/AE
   เลื่อนเดือน FC ตามความเป็นจริงอยู่แล้ว เดือน FC กับเดือนที่ปิดจึงควรตรงกันเอง
   ตรึงลำดับ fallback ไว้เพราะมันเป็นตัวกำหนดว่ายอดไปโผล่เดือนไหน */
test('ลำดับการเลือกเดือนของยอด Won', () => {
  assert.equal(wonMonthOf({ metadata: { wonMonth: '2026-03' }, confirmedAt: '2026-05-01', forecastMonth: '2026-01' }), '2026-03');
  assert.equal(wonMonthOf({ confirmedAt: '2026-05-01T00:00:00Z', forecastMonth: '2026-01' }), '2026-05');
  assert.equal(wonMonthOf({ forecastMonth: '2026-01' }), '2026-01', 'ไม่มีข้อมูลอื่น = ใช้เดือน FC');
});

/* ── "Won รอยื่น SO" (มติผู้ใช้ 2026-09-14) ต้องกระทบกันสองระดับเหมือนทุกช่อง ─────────
   route บวกยอดนี้ในกิ่ง Won ของลูปหมวด/คน/ทีม ลงถัง `b` ตัวเดียวกับ wonCount และคิดยอดบริษัท
   จาก wonDeals ชุดเดียวกัน ⇒ Σ byTeam = Σ byOwner = Σ byType = totals · ถังไร้ทีมต้องอยู่ครบ
   (เทสต์นี้จำลองลูปของ route ด้วยตัวช่วยจริง — route.js เรียกตรงไม่ได้ ยามซอร์สอยู่ท้ายเทสต์) */
test('Won รอยื่น SO: ยอดบริษัท = ผลรวมรายทีม/รายคน/รายหมวด · ถังไร้ทีมไม่ถูกตัด · ถังเดียวกับ Won', () => {
  const MONTH = '2026-09';
  const deal = (over) => ({
    stage: 'won', projectValue: 100000, wonValue: 0, confirmedAt: '2026-09-03T03:00:00Z', forecastMonth: '2026-09',
    metadata: { actualSource: 'sale_order', wonMonth: null }, ...over,
  });
  const visible = [
    deal({ ownerId: 'u1', team: 'KA', dealType: 'NPD' }),
    deal({ ownerId: 'u2', team: 'ODM', dealType: 'SCENT', projectValue: 40000 }),
    // แอดมิน/AE Sup เปิดดีลเอง = ไร้ทีม ⇒ ถัง "ไม่ระบุ"
    deal({ ownerId: 'admin', team: null, dealType: 'OTHER', projectValue: 5000 }),
    // มี SO อนุมัติแล้ว → Actual ไม่ใช่รอยื่น
    deal({ ownerId: 'u1', team: 'KA', dealType: 'NPD', wonValue: 80000, metadata: { actualSource: 'sale_order', wonMonth: MONTH, wonValueExVat: 80000 } }),
    // มีแต่ใบรออนุมัติ → กองรออนุมัติ ไม่ใช่รอยื่น
    deal({ ownerId: 'u3', team: 'SV', dealType: 'NPD', metadata: { actualSource: 'sale_order', soPendingAmount: 60000, soPendingCount: 1 } }),
    // Won เดือนอื่น / ดีลยังเปิด → ไม่อยู่ในถังเดือนนี้
    deal({ ownerId: 'u2', team: 'ODM', dealType: 'SCENT', confirmedAt: '2026-08-10T03:00:00Z' }),
    deal({ ownerId: 'u1', team: 'KA', dealType: 'NPD', stage: 'quotation' }),
  ];
  const wonDeals = visible.filter((d) => isWonDeal(d) && wonMonthOf(d) === MONTH);
  const maps = { owner: {}, team: {}, type: {} };
  const bucketOf = (map, key) => (map[key] ||= {
    target: 0, won: 0, weighted: 0, lost: 0, openCount: 0, wonCount: 0, ...pendingApprovalFields(), ...wonAwaitingSoFields(),
  });
  bucketOf(maps.team, 'RT').target = 300000; // ถังที่เกิดจากเป้าอย่างเดียว
  for (const d of wonDeals) {
    for (const b of [bucketOf(maps.owner, d.ownerId), bucketOf(maps.team, d.team || 'ไม่ระบุ'), bucketOf(maps.type, d.dealType)]) {
      b.won += wonAmountOf(d); b.wonCount += 1;
      addWonAwaitingSo(b, d);
    }
  }
  const totals = rollupWonAwaitingSo(wonDeals);
  assert.deepEqual(totals, { wonAwaitingSo: 145000, wonAwaitingSoCount: 3 });
  for (const [name, map] of Object.entries(maps)) {
    const rows = Object.values(map).filter((b) => !isEmptyDashboardBucket(b));
    assert.equal(rows.reduce((s, b) => s + b.wonAwaitingSo, 0), totals.wonAwaitingSo, `${name}: ยอดต้องกระทบกับบริษัท`);
    assert.equal(rows.reduce((s, b) => s + b.wonAwaitingSoCount, 0), totals.wonAwaitingSoCount, `${name}: จำนวนดีลต้องกระทบกับบริษัท`);
    for (const b of rows) assert.ok(b.wonCount >= b.wonAwaitingSoCount, `${name}: ยอดรอยื่นต้องลงถังที่ Won ของดีลนั้นลง`);
  }
  assert.equal(maps.team['ไม่ระบุ'].wonAwaitingSo, 5000, 'ถังไร้ทีมต้องมียอด ไม่หายจากผลรวมรายทีม');
  assert.equal(maps.team.RT.wonAwaitingSo, 0);
  assert.equal(maps.team.RT.wonAwaitingSoCount, 0);
  assert.equal(maps.team.KA.wonAwaitingSo, 100000);
  assert.equal(maps.team.KA.won, 80000, 'Actual ของทีมยังเป็นยอด SO อนุมัติล้วน');
  assert.equal(maps.team.SV.wonAwaitingSo, 0, 'ดีลที่มีใบรออนุมัติไม่ใช่รอยื่น');
  assert.equal(maps.team.ODM.wonAwaitingSo, 40000, 'Won เดือนอื่นไม่ปนเดือนนี้');
  assert.equal(maps.type.OTHER.wonAwaitingSo, 5000);

  // ยามซอร์ส: ลูปทีมของ route ใช้ดีลชุดเดียวกับ Won และยอดบริษัทมาจาก wonDeals
  const teamLoop = route.slice(route.indexOf('const b = teamBucket(d.team);'), route.indexOf('const b = teamBucket(d.team);') + 400);
  assert.match(teamLoop, /if \(isWon\(d\)\) \{[^}]*addWonAwaitingSo\(b, d\);/);
  assert.match(route, /const wonAwaitingSoTotals = rollupWonAwaitingSo\(wonDeals\);/);
});

/* ── "ทีมตามดีล" (มติผู้ใช้ 2026-09-14): ถังคนแยกตามทีมที่ประทับบนดีล ⇒ Σ ถังคนต่อทีม = ถังทีม ────
   🐞 เดิมถังคน key ด้วยบัญชีล้วนและใช้ทีมของบัญชี ⇒ คนที่มีดีลสองทีมรวมเป็นแถวเดียวใต้ทีมบัญชี
      แถวทีมหนึ่งจึงไม่เท่าผลรวมคนใต้ทีมนั้น (อีกทีมขาด อีกทีมเกิน) · คนย้ายทีมลากยอดเก่าไปทีมใหม่
   เทสต์เต็ม (จำลองลูปของ route ทุกช่อง + กติกาเก่า = ใหม่บนข้อมูลทีมเดียว) อยู่ที่ teamByDeal.test.mjs */
test('ทีมตามดีล: ดีลของคนเดียวสองทีม — Σ ถังคน (ownerBucketKey) ต่อทีม = ถังทีม · ไม่อ่านทีมบัญชี', async () => {
  const { ownerBucketKey } = await import('./ownerBucketKey.js');
  const MONTH = '2026-09';
  const acc = { id: 'u1', name: 'สมชาย ใจดี', team: 'KA' }; // บัญชีอยู่ KA
  const deal = (over) => ({
    stage: 'won', projectValue: 100000, wonValue: 70000, confirmedAt: '2026-09-03T03:00:00Z', forecastMonth: MONTH,
    metadata: { actualSource: 'sale_order', wonMonth: MONTH }, ownerId: 'u1', ...over,
  });
  const wonDeals = [
    deal({ team: 'KA' }),
    deal({ team: 'ODM', wonValue: 30000 }),
    deal({ team: 'ODM', wonValue: 0, metadata: { wonMonth: null } }), // รอยื่น SO
    deal({ team: null, wonValue: 0, metadata: { wonMonth: null }, projectValue: 5000 }),
  ];
  const owner = {};
  const team = {};
  const bucketOf = (map, key, seed) => (map[key] ||= { ...seed, won: 0, wonCount: 0, ...pendingApprovalFields(), ...wonAwaitingSoFields() });
  for (const d of wonDeals) {
    const o = bucketOf(owner, ownerBucketKey({ acc, id: d.ownerId, name: null, team: d.team }), { team: d.team || null });
    const t = bucketOf(team, d.team || 'ไม่ระบุ', { team: d.team || null });
    for (const b of [o, t]) { b.won += wonAmountOf(d); b.wonCount += 1; addWonAwaitingSo(b, d); }
  }
  assert.equal(Object.keys(owner).length, 3, 'u1 ได้แถว KA · ODM · ไร้ทีม');
  for (const t of Object.values(team)) {
    const people = Object.values(owner).filter((o) => o.team === t.team);
    for (const f of ['won', 'wonCount', 'wonAwaitingSo', 'wonAwaitingSoCount']) {
      assert.equal(people.reduce((s, o) => s + o[f], 0), t[f], `ทีม ${t.team} ช่อง ${f}`);
    }
  }
  assert.equal(owner['u|u1|ODM'].won, 30000, 'ยอด ODM ไม่ไหลไปทีมบัญชี (KA)');
  assert.equal(owner['u|u1|'].wonAwaitingSo, 5000);

  const src = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /const key = ownerBucketKey\(\{ acc, id, name, team \}\);/);
  assert.doesNotMatch(src, /\bacc\??\.teams?\b/, 'ถังคนห้ามใช้ทีมของบัญชี');
});
