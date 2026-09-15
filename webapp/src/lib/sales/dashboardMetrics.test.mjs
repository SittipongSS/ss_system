import test from 'node:test';
import assert from 'node:assert/strict';
import {
  forecastAccuracyRollup, isWonDeal, isOpenDeal, wonAmountOf, wonMonthOf, dealMatchesOwner,
  isKpiDeal, isWonAwaitingSo, wonAwaitingSoAmountOf, wonAwaitingSoCountOf,
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

/* 🔒 ทั้งสองฝั่งมี id แล้วไม่ตรง = คนละคน จบ — ห้ามให้ "ชื่อพ้อง" ดึงดีลข้ามคน
   (เคสจริงที่ต้องกัน: สองบัญชีชื่อซ้ำในทีมเดียวกัน หรือคนใหม่ที่ตั้งชื่อไปชนชื่อ
   เก่าที่ยังค้างอยู่ในแถวของคนที่เปลี่ยนชื่อไปแล้ว) */
test('owner matching: id ครบทั้งสองฝั่งแต่ไม่ตรง = ไม่ match แม้ชื่อ+ทีมจะเหมือนกันเป๊ะ', () => {
  const deal = { ownerId: 'ของจริง', ownerName: 'สมชาย ใจดี', team: 'KA' };
  assert.equal(dealMatchesOwner(deal, { ownerId: 'คนละคน', ownerName: 'สมชาย ใจดี', team: 'KA' }), false);
});

// แถวเก่าที่ไม่มี ownerId เลย ยังต้องจับด้วยชื่อ+ทีมได้ (ยอดย้อนหลัง)
test('owner matching: แถวที่ไม่มี ownerId ยังถอยไปใช้ชื่อ+ทีมได้ตามเดิม', () => {
  const legacy = { ownerId: null, ownerName: 'สมชาย ใจดี', team: 'KA' };
  assert.equal(dealMatchesOwner(legacy, { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA' }), true);
  assert.equal(dealMatchesOwner(legacy, { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'ODM' }), false);
});

/* ⭐ มติผู้ใช้ 2026-09-14 "ทีมตามดีล" — แถวคนบนแดชบอร์ดแยกตามทีมที่ประทับบนดีล (คนเดียวมีได้หลายแถว)
   ลิ้นชักของแถวคนส่ง `teamScoped: true` ⇒ ดีลต้องอยู่ทีมเดียวกับแถวก่อน · ธงเลือกเปิด ผู้เรียกเดิมไม่กระทบ */
test('owner matching teamScoped: id ตรงแต่ดีลคนละทีม = ไม่ match · ทีมว่าง null/\'\' เป็นทีมเดียวกัน', () => {
  const ka = { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA' };
  assert.equal(dealMatchesOwner(ka, { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA', teamScoped: true }), true);
  assert.equal(dealMatchesOwner(ka, { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'ODM', teamScoped: true }), false);
  assert.equal(dealMatchesOwner(ka, { ownerId: 'u1', team: null, teamScoped: true }), false, 'แถวไร้ทีมไม่ได้ดีล KA');
  // ไม่ส่งธง = กติกาเดิม (id ตรงไม่ดูทีม)
  assert.equal(dealMatchesOwner(ka, { ownerId: 'u1', team: 'ODM' }), true);
  assert.equal(dealMatchesOwner(ka, { ownerId: 'u1', team: 'ODM', teamScoped: false }), true);

  // ดีลไร้ทีมของคน KA — ลงแถว (u1, ไม่ระบุทีม) เท่านั้น
  const teamless = { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: null };
  assert.equal(dealMatchesOwner(teamless, { ownerId: 'u1', team: null, teamScoped: true }), true);
  assert.equal(dealMatchesOwner(teamless, { ownerId: 'u1', team: '', teamScoped: true }), true);
  assert.equal(dealMatchesOwner(teamless, { ownerId: 'u1', team: 'KA', teamScoped: true }), false);
  assert.equal(dealMatchesOwner({ ...teamless, team: '' }, { ownerId: 'u1', team: null, teamScoped: true }), true);
  assert.equal(dealMatchesOwner({ ...teamless, team: undefined }, { ownerId: 'u1', teamScoped: true }), true);

  // ทีมตรงแล้ว กติกาตัวตนเดิมยังตัดสินต่อ: id คนละคน = จบ · แถว legacy ไม่มี id ถอยไปชื่อ
  assert.equal(dealMatchesOwner(ka, { ownerId: 'u2', ownerName: 'สมชาย ใจดี', team: 'KA', teamScoped: true }), false);
  const legacy = { ownerId: null, ownerName: 'สมชาย ใจดี', team: 'KA' };
  assert.equal(dealMatchesOwner(legacy, { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA', teamScoped: true }), true);
  assert.equal(dealMatchesOwner(legacy, { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'ODM', teamScoped: true }), false);
});

test('ดีลของใบสั่งขายย้อนหลัง (mig 0360): ไม่ใช่ KPI · ไม่อยู่กอง Won รอยื่น SO แม้เป็น Won ที่ไม่มีใบอนุมัติ', () => {
  const container = { stage: 'won', origin: 'historical', projectValue: 9000, wonValue: 5000, metadata: {} };
  assert.equal(isKpiDeal(container), false);
  assert.equal(isWonAwaitingSo(container), false);
  assert.equal(wonAwaitingSoCountOf(container), 0);
  assert.equal(wonAwaitingSoAmountOf(container), 0);
  assert.equal(isWonAwaitingSo({ ...container, metadata: { wonMonth: '2026-09' } }), false);
  // ดีล pipeline หน้าตาเดียวกันยังเข้ากองตามเดิม
  const pipeline = { ...container, origin: 'pipeline' };
  assert.equal(isKpiDeal(pipeline), true);
  assert.equal(isWonAwaitingSo(pipeline), true);
  assert.equal(wonAwaitingSoAmountOf(pipeline), 9000);
});
