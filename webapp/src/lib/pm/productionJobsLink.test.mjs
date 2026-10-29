// ── การ์ดภาพรวมวางแผนผลิต ↔ คิวงานผลิต: เลขบนการ์ด = แถวที่คิวโชว์ (ตรวจตัวกรองทั้งระบบ 08/10 · H8) ──
//
// 🐞 การ์ด "งานร่างรอวางคิว N" / "กำลังผลิต N" พาไป `/production/jobs` เปล่า ⇒ คิวโชว์งานเปิดทั้งโรงงาน
// ⚠️ ห้ามเปิด `/production/jobs` ในเบราว์เซอร์ตอนตรวจ — GET ของหน้านั้น (`autoDraft=1`) สร้างงานร่างลงฐานจริง
//    ⇒ พิสูจน์ด้วยเทสต์นี้: ลิงก์ที่การ์ดส่ง → ตัวอ่านของหน้าคิว → ตัวกรองของหน้าคิว ต้องได้เลขเดียวกับการ์ด
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PRODUCTION_JOB_FILTERS, filterProductionJobs, productionJobsClearedHref, productionJobsFilterFrom, productionJobsHref,
} from './productionJobsLink.js';
import { productionCounts } from './productionOverview.js';

// สถานะที่ทั้งภาพรวมและหน้าคิวโหลด (`OPEN_STATUSES` ของสองหน้า · ค่าตั้งต้นของคิว)
const OPEN = ['draft', 'planned', 'in_progress'];
const job = (id, status) => ({ id, status, productName: id });
const jobs = [
  job('D1', 'draft'), job('D2', 'draft'), job('D3', 'draft'),
  job('P1', 'planned'),
  job('R1', 'in_progress'), job('R2', 'in_progress'),
  job('X1', 'done'), job('C1', 'cancelled'),
];
const loaded = jobs.filter((j) => OPEN.includes(j.status));

// ลิงก์ → query ที่หน้าคิวเห็น (หน้าคิวอ่านผ่าน useSearchParams = URLSearchParams ของ URL นั้น)
const queueRowsFor = (href, rows) => {
  const url = new URL(href, 'http://localhost');
  assert.equal(url.pathname, '/production/jobs');
  return filterProductionJobs(rows, productionJobsFilterFrom(url.searchParams));
};

test('🔴 การ์ด "งานร่างรอวางคิว" และ "กำลังผลิต" — เลขบนการ์ด = แถวที่หน้าคิวโชว์', () => {
  const counts = productionCounts(loaded);
  assert.equal(queueRowsFor(productionJobsHref('draft'), loaded).length, counts.draft);
  assert.equal(queueRowsFor(productionJobsHref('running'), loaded).length, counts.running);
  assert.deepEqual(queueRowsFor(productionJobsHref('running'), loaded).map((j) => j.id), ['R1', 'R2']);
  // "แสดงงานที่จบแล้ว" เปิดอยู่ (คิวโหลดทุกสถานะ) — ตัวกรองยังเหลือชุดเดียวกับการ์ด
  assert.equal(queueRowsFor(productionJobsHref('draft'), jobs).length, counts.draft);
  assert.equal(queueRowsFor(productionJobsHref('running'), jobs).length, counts.running);
});

test('ลิงก์ร่างเป็นลิงก์เดียวกับป้ายเมนู (ม-118) — สองทางเข้า ตัวกรองเดียว', () => {
  assert.equal(productionJobsHref('draft'), '/production/jobs?count=productionJobs');
  const menu = readFileSync(new URL('../../config/menuRegistry.js', import.meta.url), 'utf8');
  assert.ok(menu.includes(`countHref: '${productionJobsHref('draft')}'`), 'ป้ายเมนูคิวงานผลิตต้องใช้ลิงก์เดียวกัน');
});

test('ตัวอ่าน query: ไม่มี/ไม่รู้จัก = ไม่กรอง · รับทั้งสตริงและ URLSearchParams', () => {
  assert.equal(productionJobsFilterFrom(''), null);
  assert.equal(productionJobsFilterFrom(null), null);
  assert.equal(productionJobsFilterFrom('count=productionJobs'), 'draft');
  assert.equal(productionJobsFilterFrom(new URLSearchParams('filter=running')), 'running');
  assert.equal(productionJobsFilterFrom('filter=nope'), null);
  assert.equal(productionJobsFilterFrom('filter=__proto__'), null, 'คีย์ของ prototype ไม่ใช่ตัวกรอง');
  assert.equal(productionJobsHref('nope'), '/production/jobs');
  assert.deepEqual(filterProductionJobs(loaded, null), loaded);
  for (const key of Object.keys(PRODUCTION_JOB_FILTERS)) {
    assert.equal(productionJobsFilterFrom(new URL(productionJobsHref(key), 'http://x').search), key, `${key} ไปกลับต้องได้ตัวเดิม`);
  }
});

/* 🐞 (รอบตรวจ 19/10) ปุ่ม × เคยล้างแค่ state ⇒ URL ค้าง `?count=productionJobs` · กดป้ายเมนูซ้ำ = URL เดิม ⇒ ตัวกรองไม่กลับมา
   จำลองทางเดินของผู้ใช้ด้วย URL ล้วน (หน้าคิวไม่มีสำเนาตัวกรองใน state แล้ว — ยามซอร์สข้างล่าง) */
test('🔴 × ล้างตัวกรองที่ URL — กดป้ายเมนูซ้ำแล้วตัวกรองต้องกลับมา', () => {
  for (const key of Object.keys(PRODUCTION_JOB_FILTERS)) {
    const badge = productionJobsHref(key);
    const opened = new URL(badge, 'http://localhost');
    assert.equal(productionJobsFilterFrom(opened.searchParams), key);
    const cleared = productionJobsClearedHref(opened.searchParams);
    assert.equal(cleared, '/production/jobs');
    assert.equal(productionJobsFilterFrom(new URL(cleared, 'http://localhost').searchParams), null, `${key}: × แล้วต้องไม่เหลือตัวกรอง`);
    // ป้ายเป็นคนละ URL กับหลังล้าง ⇒ router พาไปจริง ตัวอ่านได้ค่าใหม่
    assert.notEqual(cleared, badge);
    assert.equal(queueRowsFor(badge, loaded).length, productionCounts(loaded)[key]);
  }
});

test('ล้างตัวกรองถอดเฉพาะพารามิเตอร์ของตัวกรอง — query อื่นคงไว้', () => {
  assert.equal(productionJobsClearedHref('count=productionJobs&x=1'), '/production/jobs?x=1');
  assert.equal(productionJobsClearedHref(new URLSearchParams('filter=running&x=1')), '/production/jobs?x=1');
  // `count=` ของคนอื่น (ไม่ใช่คีย์ของคิวนี้) ไม่ใช่ตัวกรองของหน้านี้ — ไม่ถอด
  assert.equal(productionJobsClearedHref('count=other'), '/production/jobs?count=other');
  assert.equal(productionJobsClearedHref(''), '/production/jobs');
  assert.equal(productionJobsClearedHref(null), '/production/jobs');
});

/* ── ยามอ่านซอร์ส (จอเป็น JSX) — การ์ดต้องส่งลิงก์ที่กรองแล้ว · หน้าคิวต้องอ่านลิงก์ด้วย useSearchParams ── */
const live = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const overview = live(readFileSync(new URL('../../app/production/page.js', import.meta.url), 'utf8'));
const queue = live(readFileSync(new URL('../../app/production/jobs/page.js', import.meta.url), 'utf8'));

test('🔴 การ์ดภาพรวมส่งลิงก์ที่กรองแล้ว ไม่ใช่คิวเปล่า', () => {
  // ภายในแท็ก KpiCard ใบนั้น (ไม่ข้าม `/>` ไปการ์ดถัดไป)
  const card = (label, filter) => new RegExp(`label="${label}"(?:(?!/>)[\\s\\S])*?onClick=\\{\\(\\) => router\\.push\\(productionJobsHref\\("${filter}"\\)\\)\\}`);
  assert.match(overview, card('งานร่างรอวางคิว', 'draft'));
  assert.match(overview, card('กำลังผลิต', 'running'));
  // M24f (ตรวจตัวเลข 20/10): "วางคิวแล้ว" เดิมพาไปกระดาน (งานสัปดาห์นี้ + กำลังผลิต) ไม่ใช่ N งานบนการ์ด
  assert.match(overview, card('วางคิวแล้ว', 'planned'));
  assert.doesNotMatch(overview, /label="วางคิวแล้ว"(?:(?!\/>)[\s\S])*?router\.push\("\/production\/board"\)/);
});

test('🔴 M24f: การ์ด "วางคิวแล้ว" — เลขบนการ์ด = แถวที่หน้าคิวโชว์ (งาน planned ทุกวันเริ่ม ไม่รวมงานที่กำลังเดิน)', () => {
  const counts = productionCounts(loaded);
  assert.equal(counts.planned, 1);
  assert.deepEqual(queueRowsFor(productionJobsHref('planned'), loaded).map((j) => j.id), ['P1']);
  assert.equal(queueRowsFor(productionJobsHref('planned'), jobs).length, counts.planned);
  assert.equal(productionJobsHref('planned'), '/production/jobs?filter=planned');
});

test('🔴 หน้าคิวอ่านตัวกรองจาก useSearchParams — ไม่ใช่ window.location ตอนเมานต์ (กดป้ายเมนูขณะอยู่บนหน้าแล้วตัวกรองไม่ติด)', () => {
  assert.match(queue, /const queueFilter = productionJobsFilterFrom\(searchParams\);/);
  assert.match(queue, /filterProductionJobs\(jobs, queueFilter\)/);
  assert.doesNotMatch(queue, /window\.location\.search/);
});

test('🔴 ตัวกรองอยู่ใน URL ที่เดียว — × เขียน URL ใหม่ ไม่มีสำเนาใน state ที่ล้างแยกได้', () => {
  assert.doesNotMatch(queue, /setQueueFilter|useState\(linkFilter\)/, 'สำเนาใน state = URL กับตัวกรองเพี้ยนกันได้');
  assert.match(queue, /const clearQueueFilter = \(\) => router\.replace\(productionJobsClearedHref\(searchParams\), \{ scroll: false \}\);/);
  assert.match(queue, /<Button size="sm" onClick=\{clearQueueFilter\}>/);
});
