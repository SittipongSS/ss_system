// เตือนน้ำหอมใกล้หมด (S-4) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEEDS_ATTENTION,
  refillAnchor,
  refillStatus,
  siteRefillBadge,
  siteRefillSummary,
} from './refill.js';

const TODAY = '2026-07-31';
// ขวด 300 ml ใช้วันละ 10 → อยู่ได้ 30 วัน
const asset = (over = {}) => ({ id: 'A1', status: 'active', bottleMl: 300, mlPerDay: 10, ...over });

test('⭐ ข้อมูลไม่พอ = ไม่เดา — ป้ายที่มั่วจะทำให้ป้ายจริงถูกเมินไปด้วย', () => {
  assert.equal(refillStatus(asset({ mlPerDay: null, installedAt: '2026-07-01' }), { todayIso: TODAY }).state, 'unknown');
  assert.equal(refillStatus(asset({ installedAt: null }), { todayIso: TODAY }).state, 'unknown');
});

test('เครื่องที่ถอดออกแล้วไม่เตือน — ของไม่ได้อยู่หน้างานแล้ว', () => {
  const status = refillStatus(asset({ status: 'removed', installedAt: '2026-01-01' }), { todayIso: TODAY });
  assert.equal(status.state, 'unknown');
  assert.equal(status.label, 'ถอดออกแล้ว');
});

test('ยังอีกนาน = ok', () => {
  const status = refillStatus(asset(), { lastSiteRefillDate: '2026-07-25', todayIso: TODAY });
  assert.equal(status.state, 'ok');
  assert.equal(status.dueDate, '2026-08-24');
  assert.equal(status.daysLeft, 24);
});

test('ใกล้หมดภายใน 14 วัน = soon', () => {
  const status = refillStatus(asset(), { lastSiteRefillDate: '2026-07-10', todayIso: TODAY });
  assert.equal(status.state, 'soon');
  assert.equal(status.dueDate, '2026-08-09');
  assert.match(status.label, /อีก 9 วัน/);
});

test('เลยวันที่คาดว่าหมดแล้ว = overdue', () => {
  const status = refillStatus(asset(), { lastSiteRefillDate: '2026-06-01', todayIso: TODAY });
  assert.equal(status.state, 'overdue');
  assert.equal(status.tone, 'danger');
});

test('⭐ มีนัดก่อนวันหมด = covered ไม่ต้องเตือน — ไม่งั้นกระดานเต็มไปด้วยงานที่จัดคิวไว้แล้ว', () => {
  const status = refillStatus(asset(), {
    lastSiteRefillDate: '2026-07-10', nextVisitDate: '2026-08-03', todayIso: TODAY,
  });
  assert.equal(status.state, 'covered');   // หมด 08-09 · เข้า 08-03 = ทัน

  // ⚠️ ของที่แห้งไปแล้วยังต้องเป็น overdue แม้มีนัดรออยู่ — นัดที่มาหลังวันหมด
  // ไม่ได้แปลว่าไม่มีปัญหา ลูกค้าดมไม่ได้กลิ่นไปแล้วหลายวัน
  const late = refillStatus(asset(), {
    lastSiteRefillDate: '2026-06-01', nextVisitDate: '2026-08-03', todayIso: TODAY,
  });
  assert.equal(late.state, 'overdue');
});

test('นัดที่ตรงวันหมดพอดียังนับว่าครอบ (เข้าวันนั้นก็ทัน)', () => {
  const status = refillStatus(asset(), {
    lastSiteRefillDate: '2026-07-10', nextVisitDate: '2026-08-09', todayIso: TODAY,
  });
  assert.equal(status.state, 'covered');
});

test('นัดที่มาหลังวันหมด ไม่ครอบ', () => {
  const status = refillStatus(asset(), {
    lastSiteRefillDate: '2026-07-10', nextVisitDate: '2026-08-20', todayIso: TODAY,
  });
  assert.equal(status.state, 'soon');
});

test('⭐ เครื่องที่ติดตั้งหลังวันเติมล่าสุด ใช้วันติดตั้งเป็นตัวตั้ง', () => {
  assert.equal(refillAnchor({ installedAt: '2026-07-20' }, '2026-07-01'), '2026-07-20');
  assert.equal(refillAnchor({ installedAt: '2026-06-01' }, '2026-07-01'), '2026-07-01');
  assert.equal(refillAnchor({ installedAt: null }, '2026-07-01'), '2026-07-01');
  assert.equal(refillAnchor({ installedAt: '2026-07-20' }, null), '2026-07-20');
});

test('สรุประดับไซต์นับเฉพาะเครื่องที่ยังอยู่หน้างาน', () => {
  const summary = siteRefillSummary([
    asset({ id: 'A1' }),
    asset({ id: 'A2', mlPerDay: null }),
    asset({ id: 'A3', status: 'removed' }),
  ], { lastSiteRefillDate: '2026-06-01', todayIso: TODAY });
  assert.equal(summary.total, 2);
  assert.equal(summary.overdue, 1);
  assert.equal(summary.unknown, 1);
  assert.equal(summary.needsAttention, 1);
  assert.equal(summary.earliestDue, '2026-07-01');
});

test('ป้ายสรุป: ไม่มีอะไรต้องเตือน → ไม่มีป้าย (ป้ายเปล่าห้อยอยู่คือขยะ)', () => {
  const clean = siteRefillSummary([asset()], { lastSiteRefillDate: '2026-07-25', todayIso: TODAY });
  assert.equal(siteRefillBadge(clean), null);
  assert.equal(siteRefillBadge(null), null);
});

test('ป้ายสรุปยกเรื่อง "หมดแล้ว" ขึ้นก่อน "ใกล้หมด"', () => {
  const mixed = siteRefillSummary([
    asset({ id: 'A1' }),
    asset({ id: 'A2', installedAt: '2026-07-10' }),
  ], { lastSiteRefillDate: '2026-06-01', todayIso: TODAY });
  assert.equal(siteRefillBadge(mixed).tone, 'danger');
  assert.match(siteRefillBadge(mixed).label, /หมดแล้ว/);
});

test('สถานะที่ต้องมีคนทำอะไรต่อมีแค่ overdue กับ soon', () => {
  assert.deepEqual(NEEDS_ATTENTION, ['overdue', 'soon']);
});
