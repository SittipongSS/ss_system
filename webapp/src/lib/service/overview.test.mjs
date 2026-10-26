import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  attentionView,
  serviceCounts,
  serviceAttention,
  refillWatchlist,
  refillWatchView,
  refillTotals,
  todayByTechnician,
} from './overview.js';
import { QUEUE_RANGE_LABELS } from './scheduleQueueLink.js';

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

test('serviceCounts แยกวันนี้ / 7 วันข้างหน้า ถูกต้อง (หน้าต่าง = วันนี้ … วันนี้ + 6 · ไม่ใช่สัปดาห์ อา.–ส.)', () => {
  const c = serviceCounts([
    visit({ id: 'a', scheduledDate: TODAY }),
    visit({ id: 'b', scheduledDate: '2026-07-12' }), // วันที่ 7 ของช่วง → นับ
    visit({ id: 'c', scheduledDate: '2026-07-13' }), // เลยช่วง → ไม่นับ
  ], TODAY);
  assert.equal(c.today, 1);
  assert.equal(c.week, 2);
});

test('serviceCounts ไม่นับนัดค้างเป็น "7 วันข้างหน้า" — ค้างคือหนี้เก่า ไม่ใช่แผนข้างหน้า', () => {
  const c = serviceCounts([visit({ scheduledDate: '2026-07-01' })], TODAY);
  assert.equal(c.overdue, 1);
  assert.equal(c.week, 0);
});

test('serviceCounts นับ "ยังไม่มอบหมาย" เฉพาะใน 7 วันข้างหน้า — นัดไกล ๆ ยังไม่ต้องมีเจ้าหน้าที่', () => {
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

/* ══ แผง "ต้องจัดการก่อน" — "แสดง 8 จาก N" ต้องขยายดูครบ N ได้ในแผงเดียวกัน (ตรวจตัวเลข L8 · 26/10/2026) ═══════
   🐞 คำอธิบายเคยชี้ "ที่เหลืออยู่ในตารางเข้าบริการ" (ชื่อเก่าของหน้าจัดคิว) ซึ่งไม่มีตัวกรองชุดนี้ */
const attentionFleet = Array.from({ length: 11 }, (_, i) => visit({
  id: `late${i}`, code: `SV-${String(i).padStart(2, '0')}`, scheduledDate: '2026-07-01',
}));

test('🔴 L8: ขยายแล้วแถว = ทุกแถวของ serviceAttention · ย่อ = 8 แถวพร้อมบอกว่าถูกตัด', () => {
  const all = serviceAttention(attentionFleet, new Map(), TODAY);
  assert.equal(all.length, 11);
  const open = attentionView(all, { all: true, limit: 8 });
  assert.equal(open.rows.length, all.length);
  assert.equal(open.total, all.length);
  assert.equal(open.truncated, false);
  const folded = attentionView(all, { limit: 8 });
  assert.equal(folded.rows.length, 8);
  assert.equal(folded.total, 11, '"แสดง 8 จาก N" — N = แถวที่เห็นตอนขยาย');
  assert.equal(folded.truncated, true);
  assert.deepEqual(folded.rows, all.slice(0, 8), 'ย่อแล้วยังเรียงตามความเจ็บ (ตัดท้าย ไม่สุ่ม)');
  // ไม่ถึงเพดาน = ไม่ตัด ไม่ต้องมีปุ่ม
  assert.equal(attentionView(all.slice(0, 5), { limit: 8 }).truncated, false);
});

test('🔴 L8/L21 ยามอ่านซอร์ส: ปุ่ม "ดูทั้งหมด" ในหัวแผง · ไม่ชี้ "ตารางเข้าบริการ" · การ์ด 7 วันไม่เรียกตัวเองว่าสัปดาห์', () => {
  const live = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
  const page = live(readFileSync(new URL('../../app/service/page.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(page, /ตารางเข้าบริการ/, 'ชื่อเก่าของหน้าจัดคิว (F-1) — ไม่มีที่ไหนให้ไปดูต่อ');
  assert.match(page, /attentionView\(attention, \{ all: attentionAll, limit: ATTENTION_LIMIT \}\)/);
  assert.match(page, /attentionShown\.rows\.map\(/);
  assert.doesNotMatch(page, /attention\.slice\(/, 'ห้ามตัดเองบนหน้า — ใช้ attentionView ตัวเดียว');
  const section = page.match(/title="ต้องจัดการก่อน"[\s\S]*?<ActionQueue/)?.[0] || '';
  assert.match(section, /actions=\{attentionShown\.total > ATTENTION_LIMIT \?/);
  assert.match(section, /aria-expanded=\{attentionAll\}/);
  assert.match(section, /\{attentionAll \? "ย่อ" : "ดูทั้งหมด"\}/);
  assert.match(section, /กด “ดูทั้งหมด” เพื่อดูครบ/);
  // L21: การ์ดหน้าต่างเลื่อน 7 วัน = "นัด 7 วันข้างหน้า" และยังเปิดชิป 7 วัน
  const card = page.match(/label="นัด 7 วันข้างหน้า"(?:(?!\/>)[\s\S])*\/>/)?.[0] || '';
  assert.match(card, /value=\{counts\.week\}/);
  assert.match(card, /scheduleQueueHref\(\{ tab: "scheduled", range: "7d" \}\)/);
  assert.doesNotMatch(page, /นัดสัปดาห์นี้/);
});

/* ══ ชิป "ยังไม่มีเจ้าหน้าที่" บอกขอบ 7 วันในป้าย (ตรวจตัวเลข L22 · 26/10/2026) ════════════════════════════════
   ช่วงนี้ (= serviceCounts().unassigned = คำใบ้ใต้การ์ด "นัด 7 วันข้างหน้า") นับเฉพาะนัดที่ถึงคิวใน 7 วัน — ป้ายเปล่า
   "ยังไม่มีเจ้าหน้าที่" อ่านเป็นทุกนัดที่ยังไม่มีคน ทั้งที่นัดไม่มีคนซึ่งไกลกว่านั้นไม่อยู่ในเลขไหนเลย */
test('L22: ป้ายช่วง "ยังไม่มีเจ้าหน้าที่" บอกหน้าต่าง 7 วัน — คำเดียวกับชิป "7 วัน" · ไม่ใช่ "สัปดาห์"', () => {
  assert.equal(QUEUE_RANGE_LABELS.unassigned, 'ยังไม่มีเจ้าหน้าที่ · 7 วัน');
  assert.ok(QUEUE_RANGE_LABELS.unassigned.includes(QUEUE_RANGE_LABELS['7d']));
  for (const label of Object.values(QUEUE_RANGE_LABELS)) assert.doesNotMatch(label, /สัปดาห์/);
  // นัดไม่มีเจ้าหน้าที่ที่ไกลกว่า 7 วันไม่เข้าเลข — ป้ายต้องพูดขอบนั้นเอง
  const c = serviceCounts([
    visit({ id: 'near', assigneeId: null, scheduledDate: '2026-07-12' }),
    visit({ id: 'far', assigneeId: null, scheduledDate: '2026-07-13' }),
  ], TODAY);
  assert.equal(c.unassigned, 1);
});
