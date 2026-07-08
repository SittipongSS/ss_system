import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dealFgCodes,
  dealHasExciseFg,
  dealLifecycle,
} from './salesPlanningLifecycle';

const deal = (over = {}) => ({ id: 'D1', stage: 'lead', projectId: null, metadata: {}, ...over });
const stateOf = (lc, key) => lc.steps.find((s) => s.key === key)?.state;
const route = (lc, kind) => lc.routes.find((r) => r.kind === kind);
const exciseRoute = (lc) => lc.routes.find((r) => r.kind === 'excise' || r.kind.startsWith('excise:'));

test('dealFgCodes รวมจาก metadata + project_products (unique)', () => {
  const d = deal({ metadata: { fgCodes: ['FG-A-01-002-1', 'FG-A-01-002-1'] } });
  const pp = [{ product: { fgCode: 'FG-B-02-001-9' } }];
  assert.deepEqual(dealFgCodes(d, pp).sort(), ['FG-A-01-002-1', 'FG-B-02-001-9']);
});

test('dealHasExciseFg: จริงเฉพาะเมื่อมี FG หมวด 01-002', () => {
  assert.equal(dealHasExciseFg(deal({ metadata: { fgCodes: ['FG-A-01-002-1'] } })), true);
  assert.equal(dealHasExciseFg(deal({ metadata: { fgCodes: ['FG-A-02-001-1'] } })), false);
  // มาจาก project_products ก็นับ
  assert.equal(dealHasExciseFg(deal(), [{ product: { fgCode: '01-002' } }]), true);
  assert.equal(dealHasExciseFg(deal()), false);
});

test('steps: stage ปัจจุบัน = current, ก่อนหน้า = done, หลัง = todo', () => {
  const lc = dealLifecycle(deal({ stage: 'qualified' }));
  assert.equal(stateOf(lc, 'lead'), 'done');
  assert.equal(stateOf(lc, 'qualified'), 'current');
  assert.equal(stateOf(lc, 'won'), 'todo');
});

test('lost: ทุก step = skipped, ไม่มี nextAction, ปิด/แพ้ต่อไม่ได้', () => {
  const lc = dealLifecycle(deal({ stage: 'lost' }));
  assert.equal(stateOf(lc, 'lead'), 'skipped');
  assert.equal(lc.nextAction, null);
  assert.equal(lc.canGo, false);
  assert.equal(lc.canNoGo, false);
});

test('go/no-go: เปิดได้ทุกสถานะที่ยังไม่ปิด; ปิดแล้วทำไม่ได้', () => {
  assert.equal(dealLifecycle(deal({ stage: 'lead' })).canGo, true);
  assert.equal(dealLifecycle(deal({ stage: 'deposit_pending' })).canNoGo, true);
  assert.equal(dealLifecycle(deal({ stage: 'won' })).canGo, false);
  assert.equal(dealLifecycle(deal({ stage: 'in_project' })).canNoGo, false);
});

test('nextAction ที่ stage สำคัญ', () => {
  assert.equal(dealLifecycle(deal({ stage: 'deposit_pending' })).nextAction.kind, 'win');
  assert.equal(dealLifecycle(deal({ stage: 'won' })).nextAction.kind, 'create_project');
  assert.equal(dealLifecycle(deal({ stage: 'won', projectId: 'P1' })).nextAction.kind, 'open_project');
});

test('route PM: locked ที่ lead, available ที่ won ไม่มีโครงการ, done เมื่อมีโครงการ', () => {
  assert.equal(route(dealLifecycle(deal({ stage: 'lead' })), 'pm').status, 'locked');
  assert.equal(route(dealLifecycle(deal({ stage: 'won' })), 'pm').status, 'available');
  assert.equal(route(dealLifecycle(deal({ stage: 'won', projectId: 'P1' })), 'pm').status, 'done');
});

test('route สรรพสามิต: มีเฉพาะดีล FG 01-002; locked ถ้ายังไม่มีโครงการ', () => {
  const noExcise = dealLifecycle(deal({ stage: 'won', metadata: { fgCodes: ['FG-A-02-001-1'] } }));
  assert.equal(exciseRoute(noExcise), undefined);

  const excNoProj = dealLifecycle(deal({ stage: 'won', metadata: { fgCodes: ['FG-A-01-002-1'] } }));
  assert.equal(exciseRoute(excNoProj).status, 'locked');
});

test('สรรพสามิตราย FG: ยังไม่ขึ้น → สร้างทะเบียน (create-excise)', () => {
  const lc = dealLifecycle(
    deal({ stage: 'in_project', projectId: 'P1', metadata: { fgCodes: ['FG-A-01-002-1'] } }),
    { exciseRegistrations: [] },
  );
  const r = exciseRoute(lc);
  assert.equal(r.status, 'available');
  assert.equal(r.actionKind, 'create-excise');
});

test('สรรพสามิตราย FG: ทะเบียนยังไม่อนุมัติ → เปิดทะเบียนไปทำต่อ (ไม่สร้างซ้ำ)', () => {
  for (const st of ['draft', 'pending_legal', 'rejected']) {
    const lc = dealLifecycle(
      deal({ stage: 'in_project', projectId: 'P1', metadata: { fgCodes: ['FG-A-01-002-1'] } }),
      { exciseRegistrations: [{ id: 'R1', fgCode: 'FG-A-01-002-1', status: st }] },
    );
    const r = exciseRoute(lc);
    assert.equal(r.status, 'progress', st);
    assert.ok(!r.actionKind, st); // ไม่มีปุ่มสร้างซ้ำ
    assert.equal(r.href, '/tax/registrations/R1', st);
  }
});

test('สรรพสามิตราย FG: อนุมัติแล้ว → ไปยื่นชำระ (ไม่สร้างทะเบียนซ้ำ)', () => {
  const lc = dealLifecycle(
    deal({ stage: 'in_project', projectId: 'P1', metadata: { fgCodes: ['FG-A-01-002-1'] } }),
    { exciseRegistrations: [{ id: 'R1', fgCode: 'FG-A-01-002-1', status: 'approved' }] },
  );
  const r = exciseRoute(lc);
  assert.equal(r.status, 'done');
  assert.ok(!r.actionKind);
  assert.equal(r.href, '/tax/filings');
});

test('สรรพสามิตหลาย FG: แยกการ์ดตามสถานะราย FG (จับด้วย productId)', () => {
  const lc = dealLifecycle(
    deal({ stage: 'in_project', projectId: 'P1' }),
    {
      projectProducts: [
        { productId: 'PA', product: { fgCode: 'FG-A-01-002-1' } },
        { productId: 'PB', product: { fgCode: 'FG-B-01-002-2' } },
      ],
      exciseRegistrations: [{ id: 'R1', productId: 'PA', fgCode: 'FG-A-01-002-1', status: 'approved' }],
    },
  );
  const rA = lc.routes.find((r) => r.kind === 'excise:FG-A-01-002-1');
  const rB = lc.routes.find((r) => r.kind === 'excise:FG-B-01-002-2');
  assert.equal(rA.status, 'done'); // อนุมัติ → ยื่นชำระ
  assert.equal(rA.href, '/tax/filings');
  assert.equal(rB.status, 'available'); // ยังไม่ขึ้น → สร้างทะเบียน
  assert.equal(rB.actionKind, 'create-excise');
  assert.equal(rB.productId, 'PB');
});

test('route สหมิตร: แสดงเมื่อผูก PO แล้ว', () => {
  const lc = dealLifecycle(deal({ stage: 'in_project', projectId: 'P1' }), { sahamitPo: { id: 'PO1', poNumber: 'PO-9', lines: [{}, {}] } });
  assert.equal(route(lc, 'sahamit').status, 'done');
  assert.equal(route(lc, 'sahamit').href, '/sahamit/po/PO1');
});
