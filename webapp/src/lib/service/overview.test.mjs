import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  serviceCounts,
  serviceAttention,
  refillWatchlist,
  refillWatchView,
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

/* ══ การ์ด "เครื่องที่ต้องเข้าเติม" ↔ แผง "ไซต์ที่น้ำหอมกำลังจะหมด" (ตรวจตัวกรองทั้งระบบ 08/10 · H14) ══════
   🐞 การ์ดพาไปทะเบียนไซต์ (ไม่มีข้อมูลการเติม ไม่มีตัวกรอง) ⇒ กดเลข N เจอทุกไซต์ · ตอนนี้เปิดแผงบนหน้าเดียวกัน */
const site = (id, overdue, soon, extra = {}) => ({
  id, name: id, refill: { needsAttention: overdue + soon, overdue, soon, unknown: 0, earliestDue: '2026-07-10' }, ...extra,
});
const fleet = [
  ...Array.from({ length: 10 }, (_, i) => site(`S${i}`, i % 3, 1)),
  site('COVERED', 0, 0),
  site('CLOSED', 4, 0, { isActive: false }),
];

test('🔴 เลขบนการ์ด = ผลรวมคอลัมน์ "เครื่องที่ต้องเติม" ของแผงที่การ์ดเปิด (ครบทุกไซต์)', () => {
  const totals = refillTotals(fleet);
  const card = totals.overdue + totals.soon;
  const opened = refillWatchView(fleet, { all: true, limit: 8 });
  assert.equal(opened.machines, card);
  assert.equal(opened.rows.reduce((n, r) => n + r.refill.needsAttention, 0), card, 'ทุกแถวที่เห็นรวมกันได้เลขการ์ด');
  assert.equal(opened.rows.length, totals.sites);
  assert.equal(opened.truncated, false);
  // ตั้งต้น (ไม่ได้มาจากการ์ด) ย่อเหลือ 8 แถว แต่ป้ายยังบอกยอดทั้งหมด
  const folded = refillWatchView(fleet, { limit: 8 });
  assert.equal(folded.rows.length, 8);
  assert.equal(folded.truncated, true);
  assert.equal(folded.machines, card);
});

test('🔴 ยามอ่านซอร์ส: การ์ดเปิดแผงบนหน้า ไม่ใช่ทะเบียนไซต์ · ป้ายแผงบอกจำนวนเครื่อง', () => {
  const live = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
  const page = live(readFileSync(new URL('../../app/service/page.js', import.meta.url), 'utf8'));
  const card = page.match(/label="เครื่องที่ต้องเข้าเติม"(?:(?!\/>)[\s\S])*\/>/)?.[0] || '';
  assert.match(card, /value=\{refill\.overdue \+ refill\.soon\}/);
  assert.match(card, /onClick=\{openWatchlist\}/);
  assert.doesNotMatch(card, /database\/sites/);
  assert.match(page, /id=\{WATCHLIST_ID\}/);
  assert.match(page, /\$\{watch\.machines\} เครื่อง/);
  assert.match(page, /setWatchAll\(true\);\s*document\.getElementById\(WATCHLIST_ID\)/);
});
