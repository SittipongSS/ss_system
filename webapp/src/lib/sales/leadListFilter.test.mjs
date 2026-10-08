// ── ตัวกรองตารางคิวลีด (ตรวจ 2026-10-08 "การกรอง การนับ ตาราง ไม่สอดคล้องกัน") ─────────
//
// สิ่งที่ต้องล็อก: เลขที่ผู้ใช้เห็นก่อนกด = จำนวนแถวที่ได้หลังกด
//   · เลขบนการ์ดค้างคิว → กดแล้วตารางต้องได้เท่านั้น (ไม่ใช่ทุกใบของคนนั้น ไม่ใช่ปนตัวกรองเก่า)
//   · เลขท้ายตัวเลือกในแผงกรอง → ติ๊กแล้วตารางต้องได้เท่านั้น
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EMPTY_LEAD_FILTERS, LEAD_FOLLOW_FILTERS, NO_ASSIGNEE, NO_TEAM,
  filterLeadRows, leadFacetCounts, leadFollowKey, leadQueuePick,
} from './leadListFilter.js';
import { summarizeLeadQueue } from './leadDigest.js';

const TODAY = '2026-10-08';
const lead = (id, over = {}) => ({ id, status: 'contacted', team: 'ODM', assigneeId: 'u1', channel: 'line', ...over });
const LEADS = [
  lead('L1', { followUpAt: '2026-10-01T00:00:00Z' }), // เลย
  lead('L2', { followUpAt: '2026-10-08T00:00:00Z' }), // วันนี้
  lead('L3', { followUpAt: '2026-10-20T00:00:00Z', assigneeId: 'u2' }), // ยังไม่ถึง
  lead('L4', { followUpAt: null, assigneeId: 'u2' }), // ไม่มีวัน
  lead('A1', { status: 'assigned', assigneeId: 'u1' }),
  lead('A2', { status: 'assigned', assigneeId: 'u2', team: 'SV' }),
  lead('N1', { status: 'new', team: null, assigneeId: null, channel: 'meta' }),
  // ใบปิด/นัดแล้วที่ค้าง followUpAt เก่า — ต้องไม่ถูกนับเป็น "เลยวันติดตาม"
  lead('D1', { status: 'disqualified', followUpAt: '2026-09-01T00:00:00Z' }),
  lead('M1', { status: 'meeting', followUpAt: '2026-09-01T00:00:00Z' }),
  // ปิดแล้วของ u1 อีกหลายใบ — ตัวการของ "การ์ดบอก 1 ตารางขึ้น 72"
  ...Array.from({ length: 5 }, (_, i) => lead(`Q${i}`, { status: 'qualified' })),
];
const rows = (filters) => filterLeadRows(LEADS, { ...EMPTY_LEAD_FILTERS, ...filters }, TODAY).map((l) => l.id).sort();

test('มิติวันติดตาม: แบ่งเฉพาะใบติดต่อแล้ว ครบสี่ช่องไม่ซ้อน', () => {
  assert.equal(leadFollowKey(LEADS[0], TODAY), 'late');
  assert.equal(leadFollowKey(LEADS[1], TODAY), 'today');
  assert.equal(leadFollowKey(LEADS[2], TODAY), 'ahead');
  assert.equal(leadFollowKey(LEADS[3], TODAY), 'none');
  for (const id of ['D1', 'M1', 'A1', 'N1']) {
    assert.equal(leadFollowKey(LEADS.find((l) => l.id === id), TODAY), null, `${id} ไม่อยู่ในมิตินี้`);
  }
  const counts = leadFacetCounts(LEADS, EMPTY_LEAD_FILTERS, TODAY);
  const sum = LEAD_FOLLOW_FILTERS.reduce((n, f) => n + (counts.follow[f] || 0), 0);
  assert.equal(sum, counts.status.contacted, 'สี่ค่ารวมกันต้องเท่าจำนวนติดต่อแล้ว');
});

/* 🐞 กด "รอติดต่อกลับ · u1 1" แล้วได้ทุกใบของ u1 รวมใบปิด */
test('การ์ด → กดคนในขั้นรอติดต่อกลับ ได้เฉพาะใบรอติดต่อกลับของคนนั้น', () => {
  const pick = leadQueuePick({ status: 'assigned', assigneeId: 'u1' });
  assert.deepEqual(rows(pick), ['A1']);
});

test('การ์ด → แถบเตือน/ป้ายเลยวันติดตาม ได้เฉพาะใบที่เลย (ไม่ใช่ทุกใบติดต่อแล้ว)', () => {
  assert.deepEqual(rows(leadQueuePick({ status: 'contacted', follow: 'late' })), ['L1']);
  assert.deepEqual(rows(leadQueuePick({ status: 'contacted', follow: 'today' })), ['L2']);
  assert.deepEqual(rows(leadQueuePick({ status: 'contacted', follow: 'none' })), ['L4']);
  assert.deepEqual(rows(leadQueuePick({ status: 'contacted', follow: 'late', assigneeId: 'u1' })), ['L1']);
});

/* 🐞 ตัวกรองค้างจากการกดครั้งก่อน — การกดใหม่ต้องแทนที่ทั้งชุด */
test('การ์ดสั่งตัวกรองทั้งชุด: มิติที่ไม่ระบุว่างเสมอ', () => {
  const pick = leadQueuePick({ status: 'contacted' });
  assert.deepEqual(pick, { status: ['contacted'], team: [], assignee: [], channel: [], follow: [] });
});

test('ใบไร้ผู้รับผิดชอบบนการ์ด (__none__) แปลงเป็นค่าของตัวกรอง', () => {
  assert.deepEqual(leadQueuePick({ status: 'assigned', assigneeId: '__none__' }).assignee, [NO_ASSIGNEE]);
});

/* ⭐ เลขบนการ์ด = จำนวนแถวหลังกด — ใช้ตัวนับของการ์ดจริง (summarizeLeadQueue) มาเทียบ */
test('ทุกปุ่มบนการ์ดค้างคิว: เลขบนปุ่ม = จำนวนแถวที่ได้', () => {
  const s = summarizeLeadQueue(LEADS, { asOf: `${TODAY}T03:00:00Z`, holidays: new Set() });
  assert.equal(rows(leadQueuePick({ status: 'new' })).length, s.screen.count);
  assert.equal(rows(leadQueuePick({ status: 'assigned' })).length, s.contact.count);
  assert.equal(rows(leadQueuePick({ status: 'contacted' })).length, s.followUp.count);
  assert.equal(rows(leadQueuePick({ status: 'contacted', follow: 'late' })).length, s.followUp.late.count);
  assert.equal(rows(leadQueuePick({ status: 'contacted', follow: 'today' })).length, s.followUp.dueToday);
  assert.equal(rows(leadQueuePick({ status: 'contacted', follow: 'none' })).length, s.followUp.noPlan);
  for (const o of s.contact.owners) {
    assert.equal(rows(leadQueuePick({ status: 'assigned', assigneeId: o.key })).length, o.count, o.key);
  }
  for (const o of s.followUp.late.owners) {
    assert.equal(rows(leadQueuePick({ status: 'contacted', follow: 'late', assigneeId: o.key })).length, o.count, o.key);
  }
});

/* ⭐ เลขท้ายตัวเลือก = ติ๊กตัวนั้นเพิ่มแล้วตารางได้เท่านั้น — ทุกมิติ ทุกตัวเลือก ภายใต้ตัวกรองที่ติ๊กอยู่ */
test('เลขท้ายตัวเลือก (แยกมิติ) = จำนวนแถวเมื่อติ๊กตัวนั้น', () => {
  for (const active of [EMPTY_LEAD_FILTERS, { ...EMPTY_LEAD_FILTERS, status: ['contacted'] }, { ...EMPTY_LEAD_FILTERS, assignee: ['u2'] }]) {
    const counts = leadFacetCounts(LEADS, active, TODAY);
    for (const [dim, byValue] of Object.entries(counts)) {
      for (const [value, n] of Object.entries(byValue)) {
        const expected = rows({ ...active, [dim]: [value] }).length;
        assert.equal(n, expected, `${dim}=${value} ใต้ ${JSON.stringify(active)}`);
      }
    }
  }
});

test('ทีมว่าง/ผู้รับผิดชอบว่าง กรองได้ด้วยค่าแทน', () => {
  assert.deepEqual(rows({ team: [NO_TEAM] }), ['N1']);
  assert.deepEqual(rows({ assignee: [NO_ASSIGNEE] }), ['N1']);
});

/* ป้ายไหนบนการ์ดที่มีตัวเลข ต้องกดได้ — ป้ายที่กดไม่ได้คือทางตันของคนที่อยากเห็นใบชุดนั้น */
test('การ์ดค้างคิวส่งทุกการกดผ่าน onPick ตัวเดียว (ไม่มี onPickStatus/onPickOwner)', () => {
  const src = readFileSync(new URL('../../components/salesPlanning/LeadQueueSummary.js', import.meta.url), 'utf8');
  assert.equal(/onPickStatus|onPickOwner/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), false);
  for (const follow of ['late', 'today', 'none']) {
    assert.match(src, new RegExp(`follow: "${follow}"`), `ไม่มีปุ่มพาไป follow=${follow}`);
  }
  const page = readFileSync(new URL('../../app/sales-planning/leads/page.js', import.meta.url), 'utf8');
  assert.match(page, /onPick=\{pickFromQueue\}/);
  assert.match(page, /filterLeadRows\(/);
  assert.match(page, /leadFacetCounts\(/);
});
