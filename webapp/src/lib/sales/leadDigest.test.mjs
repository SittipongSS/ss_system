// Tests การ์ดสรุปเช้า "ลีดค้างคิว" — ใครถืออยู่ + ค้างมากี่วันทำการ
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIGEST_MAX_OWNERS, describeOwners, leadDigestRows, summarizeLeadQueue } from './leadDigest.js';
import { businessDaysWaiting } from './handoffQueue.js';

/* ⚠️ ต้องเป็น **วันทำการ** — เคยตั้งเป็นวันเสาร์แล้วทุกอายุกลายเป็น 0 เพราะปลายทาง
   ไม่ใช่วันทำการ เทสต์เลยดูเหมือนพังทั้งที่โค้ดถูก */
const NOW = '2026-08-10T03:00:00.000Z'; // จันทร์ 10 ส.ค. 10:00 น. เวลาไทย
const HOLIDAYS = new Set();
const sum = (leads, nameOf) => summarizeLeadQueue(leads, { asOf: NOW, holidays: HOLIDAYS, nameOf });

const lead = (over) => ({ status: 'assigned', team: 'ODM', assigneeId: null, assigneeName: null, createdAt: NOW, screenedAt: null, assignedAt: null, ...over });

test('อายุของแต่ละสถานะนับจากจุดตั้งต้น SLA ของสถานะนั้น ไม่ใช่ createdAt เสมอ', () => {
  /* ลีดที่รับเข้ามาตั้งแต่ 20 ก.ค. แต่เพิ่งถูกมอบเมื่อวาน ยังไม่ถือว่า AE ดอง —
     ถ้านับจาก createdAt จะกลายเป็น "ค้าง 14 วัน" แล้วไปทวงผิดคน */
  const OLD = '2026-07-20T03:00:00Z';
  const age = (iso) => businessDaysWaiting(iso, NOW, HOLIDAYS);

  const assigned = sum([lead({ status: 'assigned', createdAt: OLD, assignedAt: '2026-08-07T03:00:00Z' })]);
  assert.equal(assigned.contact.oldest, age('2026-08-07T03:00:00Z'), 'ต้องนับจาก assignedAt');
  assert.notEqual(assigned.contact.oldest, age(OLD), 'ห้ามนับจาก createdAt — จะไปทวงผิดคน');

  const screened = sum([lead({ status: 'screened', createdAt: OLD, screenedAt: '2026-08-06T03:00:00Z' })]);
  assert.equal(screened.spread.oldest, age('2026-08-06T03:00:00Z'), 'รอกระจายนับจาก screenedAt');

  const fresh = sum([lead({ status: 'new', createdAt: '2026-08-05T03:00:00Z' })]);
  assert.equal(fresh.screen.oldest, age('2026-08-05T03:00:00Z'), 'รอคัดกรองนับจาก createdAt');
});

test('จัดกลุ่มผู้รับผิดชอบ: เรียงคนที่ค้างนานสุดขึ้นก่อน ไม่ใช่คนที่ถือเยอะสุด', () => {
  const s = sum([
    lead({ assigneeId: 'u-many', assignedAt: '2026-08-07T03:00:00Z' }),
    lead({ assigneeId: 'u-many', assignedAt: '2026-08-07T03:00:00Z' }),
    lead({ assigneeId: 'u-many', assignedAt: '2026-08-07T03:00:00Z' }),
    lead({ assigneeId: 'u-old', assignedAt: '2026-07-21T03:00:00Z' }),
  ], (id) => ({ 'u-many': 'ถือเยอะ', 'u-old': 'ดองนาน' }[id]));

  assert.equal(s.contact.count, 4);
  assert.deepEqual(s.contact.owners.map((o) => o.label), ['ดองนาน', 'ถือเยอะ'],
    'คนที่ดองนานกว่าต้องถูกเห็นก่อน แม้ถือใบเดียว');
  assert.equal(s.contact.owners[0].oldest, businessDaysWaiting('2026-07-21T03:00:00Z', NOW, HOLIDAYS));
  assert.equal(s.contact.owners[1].count, 3);
});

test('ชื่อ: ใช้ชื่อปัจจุบันก่อน · ไม่เจอถอยไปชื่อในแถว · ไม่มีผู้รับผิดชอบก็บอกให้ชัด', () => {
  const s = sum([
    lead({ assigneeId: 'u1', assigneeName: 'Somchai S.', assignedAt: NOW }),
    lead({ assigneeId: 'u2', assigneeName: 'Malee M.', assignedAt: NOW }),
    lead({ assigneeId: null, assignedAt: NOW }),
  ], (id) => (id === 'u1' ? 'Somchai Sukjai' : null));
  const labels = s.contact.owners.map((o) => o.label);
  assert.ok(labels.includes('Somchai Sukjai'), 'มีชื่อปัจจุบันต้องใช้ตัวนั้น');
  assert.ok(labels.includes('Malee M.'), 'ไม่มีในทะเบียนถอยไปชื่อในแถว');
  assert.ok(labels.includes('ยังไม่มีผู้รับผิดชอบ'));
});

test('describeOwners: ใส่จำนวนวันเฉพาะรายแรก แล้วยุบส่วนเกินเป็น "อีก N คน"', () => {
  const entries = Array.from({ length: DIGEST_MAX_OWNERS + 2 }, (_, i) => ({
    label: `คน${i + 1}`, count: 2, oldest: 10 - i,
  }));
  const text = describeOwners(entries);
  assert.match(text, /^คน1 2 ใบ · นานสุด 10 วันทำการ/, 'รายแรกคือตัวที่แย่ที่สุด ต้องมีจำนวนวัน');
  assert.match(text, /อีก 2 คน$/);
  assert.equal((text.match(/วันทำการ/g) || []).length, 1, 'ใส่ทุกตัวการ์ดจะยาวจนไม่มีใครอ่าน');
  assert.equal(describeOwners([]), '');
});

test('แถวการ์ด: มีเฉพาะสถานะที่มีของค้าง · ไม่มีอะไรค้างคืน []', () => {
  const rows = leadDigestRows(sum([
    lead({ status: 'new', createdAt: '2026-07-24T03:00:00Z' }),
    lead({ status: 'assigned', assigneeId: 'u1', assigneeName: 'Ann', assignedAt: '2026-08-06T03:00:00Z' }),
  ]));
  assert.equal(rows.length, 2, 'ไม่มี "รอกระจาย" ค้าง จึงต้องไม่มีแถวนั้น');
  assert.match(rows[0].label, /รอคัดกรอง \(1\)/);
  assert.match(rows[0].value, new RegExp(`นานสุด ${businessDaysWaiting('2026-07-24T03:00:00Z', NOW, HOLIDAYS)} วันทำการ`));
  assert.match(rows[1].label, /รอติดต่อกลับ \(1\)/);
  assert.match(rows[1].value, new RegExp(`Ann 1 ใบ · นานสุด ${businessDaysWaiting('2026-08-06T03:00:00Z', NOW, HOLIDAYS)} วันทำการ`));

  assert.deepEqual(leadDigestRows(sum([])), []);
  assert.deepEqual(leadDigestRows(null), []);
});

test('รอกระจาย: บอกทีมที่ค้าง เพราะเจ้าของงานคือ Senior AE ของทีมนั้น', () => {
  const rows = leadDigestRows(sum([
    lead({ status: 'screened', team: 'KA', screenedAt: '2026-08-06T03:00:00Z' }),
    lead({ status: 'screened', team: 'KA', screenedAt: '2026-08-07T03:00:00Z' }),
    lead({ status: 'screened', team: 'SV', screenedAt: '2026-08-07T03:00:00Z' }),
  ]));
  assert.match(rows[0].value, /KA 2/);
  assert.match(rows[0].value, /SV 1/);
  assert.match(rows[0].value, new RegExp(`นานสุด ${businessDaysWaiting('2026-08-06T03:00:00Z', NOW, HOLIDAYS)} วันทำการ`));
});

test('route ของ digest ต้องกินสรุปจากกติกากลาง ไม่นับเองในไฟล์ route', () => {
  const src = readFileSync(new URL('../../app/api/cron/daily-digest/route.js', import.meta.url), 'utf8');
  assert.match(src, /summarizeLeadQueue\(rows, \{/);
  assert.match(src, /rows: leadDigestRows\(summary\)/);
  // ต้องดึงฟิลด์ที่ใช้คำนวณอายุ/เจ้าของมาด้วย ไม่ใช่ select('status') เฉย ๆ เหมือนเดิม
  assert.match(src, /assigneeId, assigneeName, createdAt, screenedAt, assignedAt/);
  assert.doesNotMatch(src, /const nAssigned = count\('assigned'\)/, 'ตรรกะเดิมต้องถูกแทนแล้ว');
});
