// "Won รอยื่น SO" (มติผู้ใช้ 2026-09-14) — ดีล Won ที่ยังไม่มี SO อนุมัติและไม่มี SO รออนุมัติ
// ใช้ปิดรูของยอดคาดการณ์ช่วงรับใบเสนอราคา → ยื่น SO · ล็อกนิยามตัวช่วยกลางไว้ที่นี่
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WON_AWAITING_SO_LABEL,
  dealHasApprovedSalesOrder,
  isWonAwaitingSo,
  wonAwaitingSoAmountOf,
  wonAwaitingSoCountOf,
  wonAwaitingSoMonthOf,
  wonAmountOf,
  pendingApprovalAmountOf,
} from './dashboardMetrics.js';

const won = (over = {}) => ({
  stage: 'won',
  projectValue: 120000,
  wonValue: 0,
  confirmedAt: '2026-09-14T03:00:00Z',
  forecastMonth: '2026-10',
  metadata: { actualSource: 'sale_order', wonMonth: null, wonValueExVat: 0 },
  ...over,
});

test('ป้าย', () => {
  assert.equal(WON_AWAITING_SO_LABEL, 'Won รอยื่น SO');
});

test('Won ที่ยังไม่มี SO อนุมัติ/รออนุมัติ = รอยื่น SO ด้วยมูลค่าดีลเต็มก้อน', () => {
  const d = won();
  assert.equal(isWonAwaitingSo(d), true);
  assert.equal(wonAwaitingSoAmountOf(d), 120000);
  assert.equal(wonAwaitingSoCountOf(d), 1);
  // ไม่ใช่ Actual ไม่ใช่รออนุมัติ — เป็นกองที่สามแยกกัน
  assert.equal(wonAmountOf(d), 0);
  assert.equal(pendingApprovalAmountOf(d), 0);
});

test('เดือน = wonMonthOf (ถังเดียวกับ FC Total ของดีล Won) ไม่ใช่เดือน FC และไม่ใช่เดือนปัจจุบัน', () => {
  assert.equal(wonAwaitingSoMonthOf(won()), '2026-09');
  assert.equal(wonAwaitingSoMonthOf(won({ confirmedAt: null })), '2026-10');
});

test('มี SO รออนุมัติ = ไม่ใช่รอยื่น (ย้ายไปกองรออนุมัติ) — รวมใบ 0 บาทที่นับจากจำนวนใบ', () => {
  assert.equal(isWonAwaitingSo(won({ metadata: { actualSource: 'sale_order', soPendingAmount: 120000, soPendingCount: 1 } })), false);
  assert.equal(isWonAwaitingSo(won({ metadata: { actualSource: 'sale_order', soPendingAmount: 0, soPendingCount: 1 } })), false);
});

test('มี SO อนุมัติแล้ว = ไม่ใช่รอยื่น — รวมใบอนุมัติยอด 0 บาท (ดูจาก wonMonth)', () => {
  const zeroApproved = won({ metadata: { actualSource: 'sale_order', wonMonth: '2026-08', wonValueExVat: 0 } });
  assert.equal(dealHasApprovedSalesOrder(zeroApproved), true);
  assert.equal(isWonAwaitingSo(zeroApproved), false);
  const approved = won({ wonValue: 90000, metadata: { actualSource: 'sale_order', wonMonth: '2026-09', wonValueExVat: 90000 } });
  assert.equal(isWonAwaitingSo(approved), false);
  assert.equal(wonAwaitingSoAmountOf(approved), 0);
});

test('ดีลที่ยังเปิด / แพ้ ไม่ใช่รอยื่น SO', () => {
  assert.equal(isWonAwaitingSo(won({ stage: 'quotation' })), false);
  assert.equal(isWonAwaitingSo(won({ stage: 'lost' })), false);
  assert.equal(wonAwaitingSoMonthOf(won({ stage: 'quotation' })), null);
  assert.equal(isWonAwaitingSo(won({ stage: 'in_project' })), true);
});

test('มูลค่าติดลบ/ว่าง = 0 แต่ยังนับเป็นหนึ่งดีล', () => {
  assert.equal(wonAwaitingSoAmountOf(won({ projectValue: null })), 0);
  assert.equal(wonAwaitingSoAmountOf(won({ projectValue: -5 })), 0);
  assert.equal(wonAwaitingSoCountOf(won({ projectValue: null })), 1);
});
