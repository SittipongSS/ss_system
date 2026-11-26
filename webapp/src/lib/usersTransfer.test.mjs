import test from 'node:test';
import assert from 'node:assert/strict';
import { planTargetTransfer, nextMonthKey, transferTeam } from './usersTransfer';

test('planTargetTransfer: ย้ายยอดเข้าแถวใหม่เมื่อคนรับยังไม่มีเป้าเดือนนั้น', () => {
  const from = [
    { id: 'A1', period: '2026-08', targetAmount: 100000 },
    { id: 'A2', period: '2026-09', targetAmount: 200000 },
  ];
  const { zero, add } = planTargetTransfer(from, [], { id: 'U2' });
  assert.deepEqual(zero, ['A1', 'A2']);
  assert.deepEqual(add, [
    { period: '2026-08', team: null, amount: 100000, existingId: null },
    { period: '2026-09', team: null, amount: 200000, existingId: null },
  ]);
});

test('planTargetTransfer: บวกทบเข้าแถวเดิมของคนรับ (ไม่สร้างแถวซ้ำ)', () => {
  const from = [{ id: 'A1', period: '2026-08', targetAmount: 100000 }];
  const to = [{ id: 'B1', period: '2026-08', targetAmount: 50000 }];
  const { zero, add } = planTargetTransfer(from, to, { id: 'U2' });
  assert.deepEqual(zero, ['A1']);
  assert.deepEqual(add, [{ period: '2026-08', team: null, amount: 150000, existingId: 'B1' }]);
});

test('planTargetTransfer: แถวยอด 0 ของต้นทางถูกข้าม (ไม่โยก ไม่แตะ)', () => {
  const from = [
    { id: 'A1', period: '2026-08', targetAmount: 0 },
    { id: 'A2', period: '2026-09', targetAmount: 80000 },
  ];
  const { zero, add } = planTargetTransfer(from, [], {});
  assert.deepEqual(zero, ['A2']);
  assert.equal(add.length, 1);
  assert.equal(add[0].period, '2026-09');
});

test('planTargetTransfer: ต้นทางมีหลายแถวเดือนเดียวกัน (ต่างทีมเก่า) รวมยอดก่อนย้าย', () => {
  const from = [
    { id: 'A1', period: '2026-08', targetAmount: 60000 },
    { id: 'A2', period: '2026-08', targetAmount: 40000 },
  ];
  const { zero, add } = planTargetTransfer(from, [], {});
  assert.deepEqual(zero, ['A1', 'A2']);
  assert.deepEqual(add, [{ period: '2026-08', team: null, amount: 100000, existingId: null }]);
});

/* ── คนรับอยู่หลายทีม (ตรวจบัญชีสองทีม 26/11/2026) ───────────────────────────── */
const twoTeamAe = { id: 'U2', team: 'ODM', teams: ['ODM', 'SV'] };

test('transferTeam: งานคงทีมเดิมเมื่อคนรับอยู่ทีมนั้น · ไม่งั้นทีมหลักของคนรับ', () => {
  assert.equal(transferTeam(twoTeamAe, 'SV'), 'SV');
  assert.equal(transferTeam(twoTeamAe, 'ODM'), 'ODM');
  assert.equal(transferTeam(twoTeamAe, 'KA'), 'ODM'); // ไม่ได้อยู่ KA = ทีมหลัก
  assert.equal(transferTeam(twoTeamAe, null), 'ODM');
  assert.equal(transferTeam({ id: 'U3', team: 'SV', teams: ['SV'] }, 'ODM'), 'SV');
  assert.equal(transferTeam({ id: 'U4' }, 'SV'), null); // คนรับไม่มีทีม = null เหมือนเดิม
});

test('planTargetTransfer: เป้า SV ที่โอนให้ AE ODM+SV ยังเป็นเป้า SV — ไม่บวกเข้าแถว ODM เดือนเดียวกัน', () => {
  const from = [
    { id: 'A1', period: '2026-12', team: 'SV', targetAmount: 300000 },
    { id: 'A2', period: '2026-12', team: 'KA', targetAmount: 50000 },
  ];
  const to = [{ id: 'B1', period: '2026-12', team: 'ODM', targetAmount: 400000 }];
  const { zero, add } = planTargetTransfer(from, to, twoTeamAe);
  assert.deepEqual(zero, ['A1', 'A2']);
  assert.deepEqual(add, [
    // SV ลงแถวใหม่ของทีม SV (คนรับยังไม่มีเป้า SV เดือนนี้)
    { period: '2026-12', team: 'SV', amount: 300000, existingId: null },
    // KA คนรับไม่ได้อยู่ ⇒ ถอยเป็นทีมหลัก ODM แล้วบวกเข้าแถว ODM เดิม
    { period: '2026-12', team: 'ODM', amount: 450000, existingId: 'B1' },
  ]);
});

test('planTargetTransfer: แถวเดิมของคนรับจับคู่ด้วย เดือน × ทีม — แถว SV เดิมถูกบวก ไม่ใช่แถว ODM', () => {
  const from = [{ id: 'A1', period: '2027-01', team: 'SV', targetAmount: 100000 }];
  const to = [
    { id: 'B1', period: '2027-01', team: 'ODM', targetAmount: 400000 },
    { id: 'B2', period: '2027-01', team: 'SV', targetAmount: 200000 },
  ];
  const { add } = planTargetTransfer(from, to, twoTeamAe);
  assert.deepEqual(add, [{ period: '2027-01', team: 'SV', amount: 300000, existingId: 'B2' }]);
});

test('nextMonthKey: เดือนปกติ + ข้ามปี', () => {
  assert.equal(nextMonthKey(new Date('2026-07-15')), '2026-08');
  assert.equal(nextMonthKey(new Date('2026-12-03')), '2027-01');
});
