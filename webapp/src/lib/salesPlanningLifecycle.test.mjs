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

test('route สรรพสามิต: มีเฉพาะดีล FG 01-002; locked ถ้ายังไม่มีโครงการ, available เมื่อมีโครงการ', () => {
  const noExcise = dealLifecycle(deal({ stage: 'won', metadata: { fgCodes: ['FG-A-02-001-1'] } }));
  assert.equal(route(noExcise, 'excise'), undefined);

  const excNoProj = dealLifecycle(deal({ stage: 'won', metadata: { fgCodes: ['FG-A-01-002-1'] } }));
  assert.equal(route(excNoProj, 'excise').status, 'locked');

  const excWithProj = dealLifecycle(
    deal({ stage: 'in_project', projectId: 'P1', metadata: { fgCodes: ['FG-A-01-002-1'] } }),
    { exciseRegistrations: [] },
  );
  assert.equal(route(excWithProj, 'excise').status, 'available');

  const excDone = dealLifecycle(
    deal({ stage: 'in_project', projectId: 'P1', metadata: { fgCodes: ['FG-A-01-002-1'] } }),
    { exciseRegistrations: [{ id: 'R1' }] },
  );
  assert.equal(route(excDone, 'excise').status, 'done');
});

test('route สหมิตร: แสดงเมื่อผูก PO แล้ว', () => {
  const lc = dealLifecycle(deal({ stage: 'in_project', projectId: 'P1' }), { sahamitPo: { id: 'PO1', poNumber: 'PO-9', lines: [{}, {}] } });
  assert.equal(route(lc, 'sahamit').status, 'done');
  assert.equal(route(lc, 'sahamit').href, '/sahamit/po/PO1');
});
