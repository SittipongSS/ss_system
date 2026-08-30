import test from 'node:test';
import assert from 'node:assert/strict';
import {
  serviceCounts,
  serviceAttention,
  refillWatchlist,
  refillTotals,
  todayByTechnician,
} from './overview.js';

const TODAY = '2026-07-06'; // จันทร์

const visit = (over = {}) => ({
  id: 'V1', code: 'SV-1', siteId: 'S1', status: 'scheduled',
  scheduledDate: TODAY, assigneeId: 'U1', assigneeName: 'เจ้าหน้าที่เอ', ...over,
});

test('serviceCounts นับเฉพาะนัดที่ยังเปิดอยู่ — ปิด/ยกเลิก/เลื่อน ไม่ใช่งานค้าง', () => {
  const c = serviceCounts([
    visit({ id: 'a', scheduledDate: '2026-07-01' }),                    // ค้าง
    visit({ id: 'b', scheduledDate: '2026-07-01', status: 'done' }),     // ปิดแล้ว
    visit({ id: 'c', scheduledDate: '2026-07-01', status: 'cancelled' }),
    visit({ id: 'd', scheduledDate: '2026-07-01', status: 'rescheduled' }),
  ], TODAY);
  assert.equal(c.overdue, 1);
});

test('serviceCounts แยกวันนี้ / สัปดาห์นี้ ถูกต้อง (สัปดาห์ = วันนี้ + 6)', () => {
  const c = serviceCounts([
    visit({ id: 'a', scheduledDate: TODAY }),
    visit({ id: 'b', scheduledDate: '2026-07-12' }), // วันที่ 7 ของช่วง → นับ
    visit({ id: 'c', scheduledDate: '2026-07-13' }), // เลยช่วง → ไม่นับ
  ], TODAY);
  assert.equal(c.today, 1);
  assert.equal(c.week, 2);
});

test('serviceCounts ไม่นับนัดค้างเป็น "สัปดาห์นี้" — ค้างคือหนี้เก่า ไม่ใช่แผนข้างหน้า', () => {
  const c = serviceCounts([visit({ scheduledDate: '2026-07-01' })], TODAY);
  assert.equal(c.overdue, 1);
  assert.equal(c.week, 0);
});

test('serviceCounts นับ "ยังไม่มอบหมาย" เฉพาะในสัปดาห์นี้ — นัดไกล ๆ ยังไม่ต้องมีเจ้าหน้าที่', () => {
  const c = serviceCounts([
    visit({ id: 'a', assigneeId: null, scheduledDate: '2026-07-08' }),
    visit({ id: 'b', assigneeId: null, scheduledDate: '2026-09-01' }),
  ], TODAY);
  assert.equal(c.unassigned, 1);
});

test('serviceAttention ดันนัดค้างขึ้นก่อนทุกอย่าง', () => {
  const rows = serviceAttention([
    visit({ id: 'soon', assigneeId: null, scheduledDate: '2026-07-08' }),
    visit({ id: 'late', scheduledDate: '2026-07-01' }),
  ], new Map(), TODAY);
  assert.deepEqual(rows.map((r) => r.visit.id), ['late', 'soon']);
});

test('serviceAttention ฟ้องเวลาทับกันของเจ้าหน้าที่คนเดียวกัน', () => {
  const rows = serviceAttention([
    visit({ id: 'a', startTime: '09:00', endTime: '11:00' }),
    visit({ id: 'b', startTime: '10:00', endTime: '12:00' }),
  ], new Map(), TODAY);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.reasons.some((x) => x.kind === 'overlap')));
});

test('serviceAttention ไม่ฟ้องทับเมื่อเป็นคนละเจ้าหน้าที่ แม้เวลาเดียวกันเป๊ะ', () => {
  const rows = serviceAttention([
    visit({ id: 'a', assigneeId: 'U1', startTime: '09:00', endTime: '11:00' }),
    visit({ id: 'b', assigneeId: 'U2', assigneeName: 'เจ้าหน้าที่บี', startTime: '09:00', endTime: '11:00' }),
  ], new Map(), TODAY);
  assert.equal(rows.length, 0);
});

test('serviceAttention ฟ้องนัดที่ชนช่วงเวลาเข้าไซต์', () => {
  const sites = new Map([['S1', { id: 'S1', name: 'สาขา A', accessFrom: '09:00', accessTo: '17:00' }]]);
  const rows = serviceAttention([visit({ startTime: '07:00', endTime: '08:00' })], sites, TODAY);
  assert.equal(rows[0].reasons[0].kind, 'time');
});

test('serviceAttention: นัดปกติที่มีเจ้าหน้าที่และไม่ชนอะไร ไม่ขึ้นรายการ', () => {
  const rows = serviceAttention([visit({ scheduledDate: '2026-07-08' })], new Map(), TODAY);
  assert.equal(rows.length, 0);
});

test('refillWatchlist ตัดไซต์ที่มีนัดครอบแล้วออก (needsAttention = 0)', () => {
  const rows = refillWatchlist([
    { id: 'A', name: 'ครอบแล้ว', refill: { needsAttention: 0, overdue: 0, soon: 0 } },
    { id: 'B', name: 'ใกล้หมด', refill: { needsAttention: 1, overdue: 0, soon: 1, earliestDue: '2026-07-15' } },
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['B']);
});

test('refillWatchlist เอาไซต์ที่เลยกำหนดขึ้นก่อน แม้วันที่คาดว่าหมดจะช้ากว่า', () => {
  const rows = refillWatchlist([
    { id: 'soon', name: 'ใกล้หมด', refill: { needsAttention: 1, overdue: 0, soon: 1, earliestDue: '2026-07-08' } },
    { id: 'over', name: 'หมดแล้ว', refill: { needsAttention: 1, overdue: 1, soon: 0, earliestDue: '2026-07-20' } },
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['over', 'soon']);
});

test('refillWatchlist ไม่เอาไซต์ที่ปิดใช้งานแล้ว', () => {
  const rows = refillWatchlist([
    { id: 'A', name: 'ปิดแล้ว', isActive: false, refill: { needsAttention: 3, overdue: 3 } },
  ]);
  assert.equal(rows.length, 0);
});

test('refillTotals รวมเครื่องข้ามไซต์ และไม่นับไซต์ที่ปิดใช้งาน', () => {
  const t = refillTotals([
    { id: 'A', name: 'A', refill: { needsAttention: 3, overdue: 2, soon: 1, unknown: 1 } },
    { id: 'B', name: 'B', refill: { needsAttention: 1, overdue: 0, soon: 1, unknown: 0 } },
    { id: 'C', name: 'C', isActive: false, refill: { needsAttention: 9, overdue: 9, soon: 0, unknown: 0 } },
  ]);
  assert.deepEqual(t, { overdue: 2, soon: 2, unknown: 1, sites: 2 });
});

test('todayByTechnician ดันแถว "ยังไม่มอบหมาย" ขึ้นบนสุด', () => {
  const rows = todayByTechnician([
    visit({ id: 'a', assigneeId: 'U1', assigneeName: 'เจ้าหน้าที่เอ' }),
    visit({ id: 'b', assigneeId: null, assigneeName: null }),
  ], TODAY);
  assert.equal(rows[0].assigneeId, null);
  assert.equal(rows.length, 2);
});

test('todayByTechnician เอาเฉพาะนัดของวันนี้ที่ยังไม่ปิด', () => {
  const rows = todayByTechnician([
    visit({ id: 'a' }),
    visit({ id: 'b', status: 'done' }),
    visit({ id: 'c', scheduledDate: '2026-07-07' }),
  ], TODAY);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].count, 1);
});
