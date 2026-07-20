import test from 'node:test';
import assert from 'node:assert/strict';
import {
  forecastAccuracyRollup, isWonDeal, isOpenDeal, wonAmountOf, wonMonthOf, dealMatchesOwner,
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

test('FC Total keeps Open, Won and Lost forecasts while remaining keeps Open only', () => {
  const result = forecastAccuracyRollup(
    [{ projectValue: 40 }],
    [{ projectValue: 100, wonValue: 80, metadata: { actualSource: 'sale_order' } }],
    [{ projectValue: 25 }],
  );
  assert.equal(result.fullForecast, 165);
  assert.equal(result.remainingForecast, 40);
  assert.equal(result.wonForecastValue, 100);
  assert.equal(result.lostForecast, 25);
  assert.equal(result.wonValue, 80);
  assert.equal(result.forecastVariance, -45);
});

test('owner matching: id ก่อน (ครอบดีลก่อน/หลังเปลี่ยนชื่อ) แล้วถอย name+team สำหรับ legacy', () => {
  const deal = { ownerId: 'old-id', ownerName: ' สมชาย  ใจดี ', team: 'KA' };
  assert.equal(dealMatchesOwner(deal, { ownerName: 'สมชาย ใจดี', team: 'KA' }), true);
  assert.equal(dealMatchesOwner(deal, { ownerName: 'สมชาย ใจดี', team: 'ODM' }), false);
  assert.equal(dealMatchesOwner(deal, { ownerId: 'old-id' }), true);
  assert.equal(dealMatchesOwner(deal, {}), true); // ไม่ระบุ = แถวสรุปรวม

  // แถว byOwner ตอนนี้ใช้ชื่อ "ปัจจุบัน" จากบัญชี — ดีลเก่าชื่อ snapshot เดิม
  // ต้องยังถูกจับด้วย id แม้ชื่อ/ทีมบน filter เปลี่ยนไปแล้ว
  assert.equal(dealMatchesOwner(deal, { ownerId: 'old-id', ownerName: 'สมชาย นามใหม่', team: 'ODM' }), true);
  // id ไม่ตรง → ตัดสินด้วยชื่อ+ทีมตามเดิม (คนละคน ห้าม match)
  assert.equal(dealMatchesOwner(deal, { ownerId: 'other-id', ownerName: 'สมหญิง อื่น', team: 'KA' }), false);
});
