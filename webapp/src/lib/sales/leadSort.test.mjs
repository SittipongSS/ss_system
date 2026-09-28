// ── ลำดับของตารางลีด /sa/leads (มติผู้ใช้ 2026-09-29) ─────────────────────
//
// ตั้งต้น = "ติดตามต่อ": ตารางเป็นคิวงาน ใบที่ต้องโทรตามขึ้นก่อน
// สิ่งที่ต้องล็อก:
//   1) ใบไม่มีวันติดตามอยู่ท้าย **ทั้งสองทิศ**
//   2) ใบที่ปิดแล้วไม่ลอยขึ้นมาเป็น "เลยกำหนด" เพราะการปิดไม่ได้ล้าง followUpAt
//   3) หัวคอลัมน์ "ติดตามต่อ / รับเมื่อ" ผูกคีย์ followup ไม่ใช่ created
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEAD_SORT_DEFAULT, leadSortDefaultDir, sortLeads } from './leads.js';

const pageSrc = readFileSync(new URL('../../app/sales-planning/leads/page.js', import.meta.url), 'utf8');
const ids = (rows) => rows.map((r) => r.id);

const leads = [
  { id: 'new-no-fu', status: 'new', createdAt: '2026-09-28T03:00:00Z' },
  { id: 'fu-ahead', status: 'contacted', followUpAt: '2026-10-05T00:00:00+00:00', createdAt: '2026-09-01T03:00:00Z' },
  { id: 'fu-late', status: 'contacted', followUpAt: '2026-09-20T00:00:00+00:00', createdAt: '2026-09-10T03:00:00Z' },
  { id: 'old-no-fu', status: 'assigned', createdAt: '2026-09-02T03:00:00Z' },
  { id: 'closed-stale-fu', status: 'disqualified', followUpAt: '2026-08-01T00:00:00+00:00', createdAt: '2026-09-15T03:00:00Z' },
  { id: 'fu-today', status: 'contacted', followUpAt: '2026-09-29T00:00:00+00:00', createdAt: '2026-09-05T03:00:00Z' },
];

test('ค่าตั้งต้นคือ followup เรียง asc', () => {
  assert.equal(LEAD_SORT_DEFAULT, 'followup');
  assert.equal(leadSortDefaultDir('followup'), 'asc');
  assert.equal(leadSortDefaultDir('created'), 'desc');
  assert.equal(leadSortDefaultDir('name'), 'asc');
  assert.equal(leadSortDefaultDir('status'), 'asc');
  assert.equal(leadSortDefaultDir('budget'), 'desc');
});

test('followup asc: เลยกำหนด → วันนี้ → ยังไม่ถึง แล้วใบไม่มีวันต่อท้ายรับล่าสุดก่อน', () => {
  assert.deepEqual(ids(sortLeads(leads, 'followup', 'asc')), [
    'fu-late', 'fu-today', 'fu-ahead',
    'new-no-fu', 'closed-stale-fu', 'old-no-fu',
  ]);
});

test('followup desc: กลับเฉพาะก้อนที่มีวัน ใบไม่มีวันยังอยู่ท้าย', () => {
  assert.deepEqual(ids(sortLeads(leads, 'followup', 'desc')), [
    'fu-ahead', 'fu-today', 'fu-late',
    'new-no-fu', 'closed-stale-fu', 'old-no-fu',
  ]);
});

test('ใบที่ปิดแล้วไม่นับวันติดตามที่ค้างอยู่', () => {
  const [first] = sortLeads(leads, 'followup', 'asc');
  assert.notEqual(first.id, 'closed-stale-fu');
  const closed = sortLeads([{ id: 'q', status: 'qualified', followUpAt: '2026-01-01T00:00:00Z', createdAt: '2026-09-01T00:00:00Z' },
    { id: 'o', status: 'contacted', createdAt: '2026-09-02T00:00:00Z' }], 'followup', 'asc');
  assert.deepEqual(ids(closed), ['o', 'q']);
});

test('created desc ยังเรียงรับล่าสุดก่อนเหมือนเดิม', () => {
  assert.deepEqual(ids(sortLeads(leads, 'created', 'desc')), [
    'new-no-fu', 'closed-stale-fu', 'fu-late', 'fu-today', 'old-no-fu', 'fu-ahead',
  ]);
});

test('status asc: รอคัดกรอง (index 0) อยู่หัว ไม่ตกท้าย', () => {
  assert.equal(sortLeads(leads, 'status', 'asc')[0].id, 'new-no-fu');
  assert.equal(sortLeads([{ id: 'x', status: 'weird' }, { id: 'n', status: 'new' }], 'status', 'asc')[0].id, 'n');
});

test('ไม่แตะอาร์เรย์เดิม', () => {
  const before = ids(leads);
  sortLeads(leads, 'followup', 'asc');
  assert.deepEqual(ids(leads), before);
});

test('หน้า /sa/leads: หัวคอลัมน์ติดตามต่อผูกคีย์ followup และใช้ sortLeads ตัวกลาง', () => {
  assert.match(pageSrc, /<SortTh label="ติดตามต่อ \/ รับเมื่อ" sortKey="followup"/);
  assert.match(pageSrc, /useStickyState\("sortKey", LEAD_SORT_DEFAULT\)/);
  assert.match(pageSrc, /sortLeads\(result, sortKey, sortDir\)/);
  assert.match(pageSrc, /key: "followup", label: "ติดตามต่อ"/);
});
