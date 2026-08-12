// Tests การ์ดสรุปเช้า "ลีดค้างคิว" — ใครถืออยู่ + ค้างมากี่วันทำการ
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIGEST_MAX_OWNERS, describeOwners, summarizeLeadQueue } from './leadDigest.js';
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
