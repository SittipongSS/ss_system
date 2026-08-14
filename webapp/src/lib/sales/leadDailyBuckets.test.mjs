import test from 'node:test';
import assert from 'node:assert/strict';
import { leadDailyBuckets, leadDailyTotals } from './leadDailyBuckets.js';
import { daysInRange } from '../datePeriods.js';

/* ข้อมูลจริงจาก production (ลีด 134 ใบ · 20/07–13/08/2026) นับด้วยวันไทย —
   ตัวเลขชุดนี้คือสิ่งที่ Marketing เอาไปเทียบกับยอด Spending Ads จริง
   ถ้าถังเพี้ยน กราฟยังวาดสวยเหมือนเดิมและไม่มีอะไรฟ้อง เทสต์นี้จึงเป็นด่านเดียว */
const BY_DAY = {
  '2026-07-20': 13, '2026-07-21': 11, '2026-07-22': 12, '2026-07-23': 6, '2026-07-24': 3,
  '2026-07-27': 12, '2026-07-29': 7, '2026-07-30': 5, '2026-07-31': 5,
  '2026-08-03': 5, '2026-08-04': 3, '2026-08-05': 4, '2026-08-06': 6, '2026-08-07': 18,
  '2026-08-10': 17, '2026-08-11': 3, '2026-08-13': 4,
};
const DAYS = daysInRange('2026-07-20', '2026-08-13');

test('รายวัน: กางครบทุกวันของงวด รวมวันที่ไม่มีลีด', () => {
  const buckets = leadDailyBuckets({ byDay: BY_DAY, days: DAYS, unit: 'day' });
  assert.equal(buckets.length, 25);
  // เสาร์ 25 ก.ค. ไม่มีลีด — ต้องมีแท่งศูนย์ ไม่ใช่หายไป
  const sat = buckets.find((b) => b.key === '2026-07-25');
  assert.equal(sat.count, 0);
  assert.equal(sat.withLeads, 0);
  assert.equal(buckets.find((b) => b.key === '2026-08-07').count, 18);
});

test('รายวัน: ไม่ส่งรายชื่อวันมา = ใช้เฉพาะวันที่มีลีด (โหมดทั้งปีที่ route ไม่ส่ง days)', () => {
  const buckets = leadDailyBuckets({ byDay: BY_DAY, unit: 'day' });
  assert.equal(buckets.length, 17);
  assert.equal(buckets[0].key, '2026-07-20');
});

/* 🔴 ตัวเลขสี่ตัวนี้คือหัวใจของใบนี้ — ตอนสำรวจข้อมูลรอบแรกผมหาวันในสัปดาห์ด้วยวัน UTC
   แล้วได้ 13/44/22/48/7 (ห้าสัปดาห์!) เพราะลีดวันจันทร์ตกไปอยู่สัปดาห์ก่อนทั้งก้อน */
test('รายสัปดาห์: จันทร์–อาทิตย์ ตรงกับที่นับจากข้อมูลจริง', () => {
  const buckets = leadDailyBuckets({ byDay: BY_DAY, days: DAYS, unit: 'week' });
  assert.deepEqual(
    buckets.map((b) => [b.key, b.count, b.withLeads]),
    [
      ['2026-07-20', 45, 5],
      ['2026-07-27', 29, 4],
      ['2026-08-03', 36, 5],
      ['2026-08-10', 24, 3],
    ],
  );
  // ผลรวมต้องเท่าจำนวนลีดจริงเป๊ะ ไม่มีใบไหนตกหล่นหรือถูกนับซ้ำ
  assert.equal(buckets.reduce((n, b) => n + b.count, 0), 134);
  assert.equal(buckets[0].name, '2026-07-20..2026-07-26');
});

test('รายสัปดาห์: สัปดาห์ที่ยังไม่จบนับเฉพาะวันที่มีจริง ไม่เติมให้ครบเจ็ด', () => {
  const buckets = leadDailyBuckets({ byDay: BY_DAY, days: DAYS, unit: 'week' });
  const last = buckets[buckets.length - 1];
  assert.equal(last.key, '2026-08-10');
  assert.equal(last.withLeads, 3);   // 10, 11, 13 ส.ค.
});

test('ยอดรวม: แยก "วันที่มีลีด" ออกจาก "จำนวนวันในงวด" — เฉลี่ยหารด้วยวันที่มีลีด', () => {
  const buckets = leadDailyBuckets({ byDay: BY_DAY, days: DAYS, unit: 'day' });
  const totals = leadDailyTotals(buckets, DAYS);
  assert.equal(totals.count, 134);
  assert.equal(totals.withLeads, 17);
  assert.equal(totals.spanDays, 25);
  assert.equal(totals.perDay, 7.9);
});

test('งวดว่าง = ไม่มีถัง (หน้าจอโชว์สถานะว่าง ไม่ใช่กราฟเปล่า)', () => {
  assert.deepEqual(leadDailyBuckets({ byDay: {}, days: [], unit: 'day' }), []);
  assert.deepEqual(leadDailyBuckets({}), []);
  assert.deepEqual(leadDailyTotals([], []), { count: 0, withLeads: 0, spanDays: 0, perDay: 0 });
});

test('ช่วงวันเดียว ทำงานได้ทั้งสองหน่วย', () => {
  const days = ['2026-08-07'];
  assert.deepEqual(
    leadDailyBuckets({ byDay: BY_DAY, days, unit: 'day' }).map((b) => b.count),
    [18],
  );
  const week = leadDailyBuckets({ byDay: BY_DAY, days, unit: 'week' });
  assert.equal(week.length, 1);
  assert.equal(week[0].key, '2026-08-03');   // ศุกร์ 7 ส.ค. อยู่สัปดาห์ที่เริ่ม 3 ส.ค.
  assert.equal(week[0].count, 18);
});
