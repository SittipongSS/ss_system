import test from 'node:test';
import assert from 'node:assert/strict';
import { planTargetTransfer, nextMonthKey } from './usersTransfer';

test('planTargetTransfer: ย้ายยอดเข้าแถวใหม่เมื่อคนรับยังไม่มีเป้าเดือนนั้น', () => {
  const from = [
    { id: 'A1', period: '2026-08', targetAmount: 100000 },
    { id: 'A2', period: '2026-09', targetAmount: 200000 },
  ];
  const { zero, add } = planTargetTransfer(from, [], { id: 'U2' });
  assert.deepEqual(zero, ['A1', 'A2']);
  assert.deepEqual(add, [
    { period: '2026-08', amount: 100000, existingId: null },
    { period: '2026-09', amount: 200000, existingId: null },
  ]);
});

test('planTargetTransfer: บวกทบเข้าแถวเดิมของคนรับ (ไม่สร้างแถวซ้ำ)', () => {
  const from = [{ id: 'A1', period: '2026-08', targetAmount: 100000 }];
  const to = [{ id: 'B1', period: '2026-08', targetAmount: 50000 }];
  const { zero, add } = planTargetTransfer(from, to, { id: 'U2' });
  assert.deepEqual(zero, ['A1']);
  assert.deepEqual(add, [{ period: '2026-08', amount: 150000, existingId: 'B1' }]);
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
  assert.deepEqual(add, [{ period: '2026-08', amount: 100000, existingId: null }]);
});

test('nextMonthKey: เดือนปกติ + ข้ามปี', () => {
  assert.equal(nextMonthKey(new Date('2026-07-15')), '2026-08');
  assert.equal(nextMonthKey(new Date('2026-12-03')), '2027-01');
});
