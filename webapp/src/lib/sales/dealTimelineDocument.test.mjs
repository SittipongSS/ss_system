import test from 'node:test';
import assert from 'node:assert/strict';
import { dealTimelineDocument } from './dealTimelineDocument.js';

test('linked deal timeline uses project data but ผู้ดูแล follows the live deal owner', () => {
  const result = dealTimelineDocument(
    { id: 'D1', code: 'DEAL-1', title: 'ดีล', ownerName: 'AE ดีล', categoryCode: '01' },
    {
      project: {
        id: 'P1', code: 'PJ-1', name: 'โครงการ', customerName: 'ลูกค้าโครงการ',
        aeOwner: 'AE โครงการ', preparedBy: 'AC โครงการ', aeSupervisor: 'Supervisor โครงการ',
        metadata: { brand: 'แบรนด์โครงการ' },
      },
      projectTasks: [{ id: 'T1', dealId: 'D1' }],
      projectProducts: [{ id: 'PP1' }],
    },
  );

  assert.equal(result.code, 'PJ-1');
  assert.equal(result.aeOwner, 'AE ดีล'); // เจ้าของดีลสด ไม่ใช่ snapshot โครงการ
  assert.equal(result.preparedBy, 'AC โครงการ');
  assert.equal(result.aeSupervisor, 'Supervisor โครงการ');
  assert.deepEqual(result.tasks.map((task) => task.id), ['T1']);
  assert.deepEqual(result.projectProducts.map((row) => row.id), ['PP1']);
});

test('unlinked deal timeline falls back to deal document data', () => {
  const result = dealTimelineDocument({
    id: 'D2', code: 'DEAL-2', title: 'ดีลลอย', customerName: 'ลูกค้าดีล', ownerName: 'AE ดีล',
    startDate: '2026-07-01', metadata: { brand: 'แบรนด์ดีล', preparedBy: 'AC ดีล', aeSupervisor: 'Supervisor ดีล' },
  }, { projectTasks: [{ id: 'T2' }] });

  assert.equal(result.code, 'DEAL-2');
  assert.equal(result.aeOwner, 'AE ดีล');
  assert.equal(result.preparedBy, 'AC ดีล');
  assert.equal(result.aeSupervisor, 'Supervisor ดีล');
  assert.equal(result.metadata.brand, 'แบรนด์ดีล');
});

test('ผู้จัดทำ ไม่ fallback เป็นเจ้าของดีลเมื่อยังไม่ระบุ AC', () => {
  const result = dealTimelineDocument({
    id: 'D3', title: 'ดีลไม่มี AC', ownerName: 'AE ดีล', metadata: {},
  }, {});
  assert.equal(result.aeOwner, 'AE ดีล');
  assert.equal(result.preparedBy, ''); // ว่าง ไม่ใช่ 'AE ดีล'
});
