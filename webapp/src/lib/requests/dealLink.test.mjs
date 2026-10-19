// ── ลิงก์คำร้องของดีล/หมุด ↔ ตัวกรองของ /requests (ตรวจตัวเลข H1 · H16 · 2026-10-19) ──
//
// เทสต์หลักของไฟล์นี้คือ "เลขบนป้าย = แถวที่ลิงก์เปิด" — ประกอบลิงก์จากหมุดจริง แล้วอ่านกลับด้วย
// ตัวอ่านของหน้าคิว กรองด้วยกติกาเดียวกับหน้าคิว (`visibleQueueRows`) แล้วนับ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dealRequestsHref, dealRequestsLinkLabel, filterByDealRequestsLink, matchesDealRequestsLink,
  readDealRequestsLink, requestsQueueHref, stepPinHref,
} from './dealLink.js';
import { requestsByStepKey, stepPinSummary } from './pins.js';
import { visibleQueueRows } from './queueBoard.js';

const req = (over = {}) => ({
  id: 'R', kind: 'formula_dev', dept: 'RD', status: 'acknowledged', stepKey: 'npd-15',
  projectId: 'PRJ-1', dealId: 'D-1', requestedById: 'u1', _mine: false,
  createdAt: '2026-10-01T00:00:00Z', items: [], ...over,
});

/* ชุดตัวอย่างที่มีของทุกแบบที่ทำให้เลขหลุดกันได้: ดีลอื่น · ขั้นอื่นของดีลเดียวกัน · ใบปิดแล้ว ·
   ร่าง · ใบของกลาง (ไม่มีดีล) ของโครงการเดียวกัน และของโครงการอื่น */
const ROWS = [
  req({ id: 'step-open-1' }),
  req({ id: 'step-open-2', status: 'pending' }),
  req({ id: 'step-closed', status: 'closed', closedAt: '2026-10-05', answeredAt: '2026-10-04' }),
  req({ id: 'step-draft', status: 'draft' }),
  req({ id: 'other-step', stepKey: 'scent-06' }),
  req({ id: 'no-step', stepKey: null, kind: 'info' }),
  req({ id: 'other-deal', dealId: 'D-2' }),
  req({ id: 'other-deal-2', dealId: 'D-2', stepKey: null, kind: 'info' }),
];

const open = (u) => {
  const url = new URL(u, 'http://x');
  return { link: readDealRequestsLink(url.searchParams), tab: url.searchParams.get('tab') };
};
// หน้าคิวภายใต้ขอบเขตทีม/ทั้งหมด (ขอบเขตที่ `?dealId=` บังคับ) — "ในคิว" หรือ "ประวัติ" ตาม `?tab=`
const shownAt = (u, rows = ROWS) => {
  const { link, tab } = open(u);
  return visibleQueueRows(filterByDealRequestsLink(rows, link), { scope: 'all', tab: tab === 'history' ? 'history' : 'todo' });
};

test('H1: ปุ่ม "เปิดหน้าคำร้อง" ของดีล = ทุกใบของดีลนั้น ไม่ใช่คิวทั้งบริษัท (ทุกขอบเขต)', () => {
  const href = dealRequestsHref('D-1');
  assert.equal(href, '/requests?dealId=D-1');
  const ids = shownAt(href).map((r) => r.id).sort();
  // ใบที่ยังไม่จบของ D-1 ทุกขั้น (รวมร่าง — ร่างของตัวเองเป็นงานค้างในคิวเหมือนเดิม) · ไม่มีใบของ D-2
  assert.deepEqual(ids, ['no-step', 'other-step', 'step-draft', 'step-open-1', 'step-open-2']);
  // ไม่มีดีล = ลิงก์คิวเปล่า (ไม่ใช่ `?dealId=` ว่าง ที่เคยพาไปทั้งคิว)
  assert.equal(dealRequestsHref(null), '/requests');
  assert.equal(readDealRequestsLink(new URLSearchParams('dealId=')), null);
});

test('H16: หมุด "คำร้องค้าง n" เปิดคิวที่มี n แถวพอดี — ไม่ใช่ทุกใบของดีล', () => {
  const pin = stepPinSummary(requestsByStepKey(ROWS), 'npd-15', 'D-1');
  assert.equal(pin.open, 2);
  assert.equal(pin.total, 3, 'ร่างไม่นับบนหมุด');
  const href = stepPinHref(pin);
  assert.equal(href, '/requests?dealId=D-1&step=npd-15');
  assert.deepEqual(shownAt(href).map((r) => r.id).sort(), ['step-open-1', 'step-open-2']);
  assert.equal(shownAt(href).length, pin.open);
});

test('H16: หมุดที่ปิดครบแล้ว ("คำร้อง n") เปิดแท็บประวัติ ซึ่งมี n แถวพอดี', () => {
  const rows = [
    req({ id: 'c1', status: 'closed', closedAt: '2026-10-05', answeredAt: '2026-10-04' }),
    req({ id: 'c2', status: 'cancelled', cancelledAt: '2026-10-06' }),
    req({ id: 'elsewhere', stepKey: 'scent-06' }),
  ];
  const pin = stepPinSummary(requestsByStepKey(rows), 'npd-15', 'D-1');
  assert.equal(pin.open, 0);
  const href = stepPinHref(pin);
  assert.equal(href, '/requests?dealId=D-1&step=npd-15&tab=history');
  assert.equal(shownAt(href, rows).length, pin.total);
  // 🐞 ของเดิมเปิด "ในคิว" ⇒ ไม่มีใบไหนในสามใบที่ป้ายนับเลย
  assert.deepEqual(shownAt('/requests?dealId=D-1&step=npd-15', rows), []);
});

test('หมุดบนหน้าโครงการ: ใบของกลาง (ไม่มีดีล) ที่หมุดนับ ต้องตามไปถึงปลายทางด้วย', () => {
  const rows = [
    req({ id: 'deal-row' }),
    req({ id: 'shared', dealId: null, kind: 'material_eta' }),
    req({ id: 'shared-other-project', dealId: null, projectId: 'PRJ-9', kind: 'material_eta' }),
  ];
  // ขั้นของดีล D-1 บนหน้าโครงการ PRJ-1 (หน้าโหลดเฉพาะใบของโครงการนี้)
  const projectRows = rows.filter((r) => r.projectId === 'PRJ-1');
  const pin = stepPinSummary(requestsByStepKey(projectRows), 'npd-15', 'D-1');
  assert.equal(pin.open, 2);
  const href = stepPinHref(pin);
  assert.equal(href, '/requests?dealId=D-1&project=PRJ-1&step=npd-15');
  // ปลายทางโหลดทั้งระบบ — ใบของกลางของโครงการอื่นต้องไม่ปนเข้ามา
  assert.deepEqual(shownAt(href, rows).map((r) => r.id).sort(), ['deal-row', 'shared']);

  // ขั้นกลางของโครงการ (task ไม่มีดีล) — รับเฉพาะใบของกลาง · เดิมลิงก์เป็น `?dealId=` ว่าง = ทั้งคิว
  const centre = stepPinSummary(requestsByStepKey(projectRows), 'npd-15', null);
  assert.equal(centre.total, 1);
  assert.equal(stepPinHref({ ...centre, total: 2 }), '/requests?project=PRJ-1&step=npd-15');
});

test('หน้าดีลไม่เคยโหลดใบของกลาง ⇒ ลิงก์หมุดไม่พาโครงการไปด้วย (ไม่ดึงใบที่หมุดไม่ได้นับ)', () => {
  const pin = stepPinSummary(requestsByStepKey([req({ id: 'a' }), req({ id: 'b' })]), 'npd-15', 'D-1');
  assert.equal(pin.projectId, null);
  assert.ok(!stepPinHref(pin).includes('project='));
});

test('ตัวกรองขั้น = กติกาเดียวกับหมุด: ร่างไม่นับ · ขั้นอื่นไม่นับ · ต้องมีตัวยึดเสมอ', () => {
  const link = { dealId: 'D-1', projectId: null, stepKey: 'npd-15' };
  assert.equal(matchesDealRequestsLink(req({ status: 'draft' }), link), false);
  assert.equal(matchesDealRequestsLink(req({ stepKey: 'scent-06' }), link), false);
  assert.equal(matchesDealRequestsLink(req(), link), true);
  // `?step=` ลอย ๆ ไม่ใช่ลิงก์ที่ใครส่ง — ไม่กรอง (ไม่เดาว่าดีลไหน)
  assert.equal(readDealRequestsLink(new URLSearchParams('step=npd-15')), null);
  assert.deepEqual(
    readDealRequestsLink(new URLSearchParams('dealId=D-1&step=npd-15&tab=history')),
    { dealId: 'D-1', projectId: null, stepKey: 'npd-15' },
  );
});

test('สลับแท็บพาตัวกรองไปด้วย · ปุ่ม × ถอดตัวกรองแต่คงแท็บ', () => {
  const link = { dealId: 'D-1', projectId: null, stepKey: 'npd-15' };
  assert.equal(requestsQueueHref({ tab: 'history', link }), '/requests?tab=history&dealId=D-1&step=npd-15');
  assert.equal(requestsQueueHref({ tab: null, link }), '/requests?dealId=D-1&step=npd-15');
  assert.equal(requestsQueueHref({ tab: 'mine' }), '/requests?tab=mine');
  assert.equal(requestsQueueHref({}), '/requests');
});

test('ป้ายตัวกรองบอกทั้งดีลและขั้น (ชื่อขั้นจากแม่แบบ ไม่ใช่รหัสดิบ)', () => {
  assert.equal(dealRequestsLinkLabel(null), null);
  assert.equal(dealRequestsLinkLabel({ dealId: 'D-1' }, { dealCode: 'DL-26080343' }), 'ดีล DL-26080343');
  assert.equal(dealRequestsLinkLabel({ dealId: 'D-1' }), 'ดีล D-1');
  assert.match(dealRequestsLinkLabel({ dealId: 'D-1', stepKey: 'scent-06' }, { dealCode: 'DL-1' }), /^ดีล DL-1 · ขั้น.+\(SCENT 6\)$/);
  // ชื่อขั้นจากแม่แบบเป็นคำกริยา ("ขึ้น Mock-up สินค้า") — เว้นวรรคหลัง "ขั้น" ให้อ่านแยกคำได้
  assert.equal(dealRequestsLinkLabel({ dealId: 'D-1', stepKey: 'npd-15' }), 'ดีล D-1 · ขั้น ขึ้น Mock-up สินค้า (NPD 15)');
  assert.equal(dealRequestsLinkLabel({ projectId: 'PRJ-1', stepKey: 'zzz' }), 'คำร้องกลางของโครงการ · ขั้น zzz');
});

/* ── ยามซอร์ส: จอใช้ตัวประกอบ/ตัวอ่านตัวเดียวกันนี้ ไม่สะกดลิงก์เอง ─────────────────── */
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('หมุดและปุ่มบนหน้าดีลประกอบลิงก์ผ่าน dealLink เท่านั้น', () => {
  const pinFile = src('../../components/salesPlanning/DealTimelineTable.js');
  assert.match(pinFile, /href=\{many \? stepPinHref\(pin\) : `\/requests\/\$\{pin\.first\.id\}`\}/);
  assert.doesNotMatch(pinFile, /\/requests\?dealId=/);
  const dealPage = src('../../app/sales-planning/deals/[id]/page.js');
  assert.doesNotMatch(dealPage, /\/requests\?dealId=/);
  assert.equal((dealPage.match(/href=\{dealRequestsHref\(deal\.id\)\}/g) || []).length, 2);
});

test('/requests กรองลิงก์ที่ชุดหลัก (ก่อนแท็บ/ฝ่าย/แถบตัวเลข) ไม่ใช่เฉพาะแท็บ "ที่ฉันเปิด"', () => {
  const page = src('../../app/requests/page.js');
  assert.match(page, /const dealLink = useMemo\(\(\) => readDealRequestsLink\(searchParams\), \[searchParams\]\);/);
  assert.match(page, /filterByDealRequestsLink\(scopedRequests, dealLink\)/);
  assert.match(page, /deptFilter === "all" \? linkedRequests : linkedRequests\.filter/);
  assert.match(page, /const rows = tabRows;/);
  // สาขาพิเศษเดิมที่กรองดีลเฉพาะ "ที่ฉันเปิด" ต้องไม่กลับมา
  assert.doesNotMatch(page, /visibleMine/);
  assert.match(page, /router\.replace\(requestsQueueHref\(\{ tab: next, link: dealLink \}\)/);
});
