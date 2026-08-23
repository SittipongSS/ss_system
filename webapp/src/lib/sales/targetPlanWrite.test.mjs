import test from 'node:test';
import assert from 'node:assert/strict';
import { planNodeKey, planNodes, summarizeOverwrite } from './targetPlanWrite.js';

const TEAMS = ['ODM', 'KA', 'SV'];
const MEMBERS = {
  ODM: [{ id: 'u1', name: 'เอ' }, { id: 'u2', name: 'บี' }],
  KA: [{ id: 'u3', name: 'ซี' }],
  SV: [],
};

const monthRow = (period, { team = null, ownerId = null, ownerName = null, targetAmount = 0 }) => ({
  period, periodType: 'month', team, ownerId, ownerName, targetAmount,
});

test('โหนดที่ยอดเป็น 0 ต้องไม่อยู่ในรายการเขียน — ของเดิมเขียนศูนย์ทับเป้าที่ปรับมือไว้', () => {
  const nodes = planNodes({
    finalTarget: 12_000_000,
    teams: TEAMS,
    teamTargets: { ODM: 8_000_000, KA: 4_000_000, SV: 0 },
    teamMembers: MEMBERS,
    personTargets: { u1: 5_000_000, u2: 0, u3: 4_000_000 },
  });

  assert.deepEqual(nodes.map((n) => n.key), [
    '|',            // บริษัท
    'ODM|',         // ทีม ODM
    'KA|',          // ทีม KA — SV ยอด 0 หลุดออก
    'ODM|u1',       // เอ — บี ยอด 0 หลุดออก
    'KA|u3',
  ]);
  assert.equal(nodes.find((n) => n.key === 'ODM|u1').annual, 5_000_000);
});

test('ยอดติดลบ/ไม่ใช่ตัวเลข = ไม่เขียน ไม่ใช่เขียน 0', () => {
  const nodes = planNodes({
    finalTarget: -5,
    teams: ['ODM'],
    teamTargets: { ODM: 'ไม่ใช่ตัวเลข' },
    teamMembers: { ODM: [{ id: 'u1', name: 'เอ' }] },
    personTargets: { u1: null },
  });
  assert.deepEqual(nodes, []);
});

test('คนอยู่สองทีมได้สองโหนด คีย์ไม่ชนกัน — เป้าคนละก้อน', () => {
  const nodes = planNodes({
    finalTarget: 0,
    teams: ['ODM', 'KA'],
    teamTargets: {},
    teamMembers: { ODM: [{ id: 'u1', name: 'เอ' }], KA: [{ id: 'u1', name: 'เอ' }] },
    personTargets: { u1: 3_000_000 },
  });
  assert.deepEqual(nodes.map((n) => n.key), ['ODM|u1', 'KA|u1']);
});

test('แถวที่มีของอยู่แล้วแยกเป็นสองกอง: ที่จะถูกทับ กับที่แผนไม่แตะ', () => {
  const nodes = planNodes({
    finalTarget: 10_000_000,
    teams: ['ODM'],
    teamTargets: { ODM: 10_000_000 },
    teamMembers: { ODM: [{ id: 'u1', name: 'เอ' }] },
    personTargets: { u1: 10_000_000 },
  });

  const existingRows = [
    monthRow('2026-01', { targetAmount: 400_000 }),                                   // บริษัท → ถูกทับ
    monthRow('2026-02', { targetAmount: 600_000 }),                                   // บริษัท → รวมเป็นก้อนเดียว
    monthRow('2026-01', { team: 'ODM', ownerId: 'u1', ownerName: 'เอ', targetAmount: 500_000 }),  // เอ → ถูกทับ
    monthRow('2026-01', { team: 'ODM', ownerId: 'u9', ownerName: 'คนเก่า', targetAmount: 300_000 }), // ลาออกแล้ว → ค้าง
    monthRow('2026-01', { team: 'KA', targetAmount: 700_000 }),                       // ทีมที่ไม่อยู่ในแผน → ค้าง
  ];

  const { overwrite, keep } = summarizeOverwrite({ existingRows, nodes, year: '2026' });

  assert.deepEqual(overwrite.map((r) => [r.key, r.amount]), [['|', 1_000_000], ['ODM|u1', 500_000]]);
  assert.deepEqual(keep.map((r) => [r.key, r.amount]), [['ODM|u9', 300_000], ['KA|', 700_000]]);
  assert.equal(keep[0].ownerName, 'คนเก่า');
});

test('แถวศูนย์/ปีอื่น/แถวรายปี ไม่นับเป็นของที่จะเสีย', () => {
  const nodes = planNodes({ finalTarget: 1_000_000, teams: [], teamTargets: {}, teamMembers: {}, personTargets: {} });
  const existingRows = [
    monthRow('2026-01', { targetAmount: 0 }),                          // ศูนย์ = ไม่มีอะไรให้เสีย
    monthRow('2025-01', { targetAmount: 900_000 }),                    // คนละปี
    { period: '2026', periodType: 'year', team: null, ownerId: null, targetAmount: 5_000_000 }, // แถวรายปี
  ];
  const { overwrite, keep } = summarizeOverwrite({ existingRows, nodes, year: '2026' });
  assert.deepEqual(overwrite, []);
  assert.deepEqual(keep, []);
});

test('คีย์โหนดตรงกับคีย์ upsert ของ API คือ (team, ownerId)', () => {
  assert.equal(planNodeKey({}), '|');
  assert.equal(planNodeKey({ team: 'ODM' }), 'ODM|');
  assert.equal(planNodeKey({ team: 'ODM', ownerId: 'u1' }), 'ODM|u1');
});
