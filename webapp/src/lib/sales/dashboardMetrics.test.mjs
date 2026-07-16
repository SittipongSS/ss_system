import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWonDeal, isOpenDeal, wonAmountOf, wonMonthOf, dealMatchesOwner,
} from './dashboardMetrics.js';

test('won/open classification matches the dashboard aggregator rules', () => {
  assert.equal(isWonDeal({ stage: 'won' }), true);
  assert.equal(isWonDeal({ stage: 'in_project' }), true); // ดีลเก่าแปลงเป็นโครงการ = Won
  assert.equal(isWonDeal({ stage: 'quotation' }), false);
  assert.equal(isOpenDeal({ stage: 'quotation' }), true);
  assert.equal(isOpenDeal({ stage: 'in_project' }), false);
  assert.equal(isOpenDeal({ stage: 'lost' }), false);
});

test('won month prefers explicit wonMonth then confirmedAt then PO date then forecast', () => {
  assert.equal(wonMonthOf({ metadata: { wonMonth: '2026-06' }, confirmedAt: '2026-07-02T00:00:00Z' }), '2026-06');
  assert.equal(wonMonthOf({ confirmedAt: '2026-07-02T00:00:00Z', forecastMonth: '2026-05' }), '2026-07');
  assert.equal(wonMonthOf({ metadata: { poReceivedDate: '2026-04-10' }, forecastMonth: '2026-05' }), '2026-04');
  assert.equal(wonMonthOf({ forecastMonth: '2026-05' }), '2026-05');
});

test('won amount counts only SO-verified actuals', () => {
  assert.equal(wonAmountOf({ wonValue: 500, metadata: { actualSource: 'sale_order' } }), 500);
  assert.equal(wonAmountOf({ wonValue: 500, metadata: {} }), 0);
});

test('owner matching folds legacy ids by name+team like byOwner buckets', () => {
  const deal = { ownerId: 'old-id', ownerName: ' สมชาย  ใจดี ', team: 'KA' };
  assert.equal(dealMatchesOwner(deal, { ownerName: 'สมชาย ใจดี', team: 'KA' }), true);
  assert.equal(dealMatchesOwner(deal, { ownerName: 'สมชาย ใจดี', team: 'ODM' }), false);
  assert.equal(dealMatchesOwner(deal, { ownerId: 'old-id' }), true);
  assert.equal(dealMatchesOwner(deal, {}), true); // ไม่ระบุ = แถวสรุปรวม
});
