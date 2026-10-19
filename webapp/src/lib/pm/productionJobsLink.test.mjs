// ── การ์ดภาพรวมวางแผนผลิต ↔ คิวงานผลิต: เลขบนการ์ด = แถวที่คิวโชว์ (ตรวจตัวกรองทั้งระบบ 08/10 · H8) ──
//
// 🐞 การ์ด "งานร่างรอวางคิว N" / "กำลังผลิต N" พาไป `/production/jobs` เปล่า ⇒ คิวโชว์งานเปิดทั้งโรงงาน
// ⚠️ ห้ามเปิด `/production/jobs` ในเบราว์เซอร์ตอนตรวจ — GET ของหน้านั้น (`autoDraft=1`) สร้างงานร่างลงฐานจริง
//    ⇒ พิสูจน์ด้วยเทสต์นี้: ลิงก์ที่การ์ดส่ง → ตัวอ่านของหน้าคิว → ตัวกรองของหน้าคิว ต้องได้เลขเดียวกับการ์ด
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PRODUCTION_JOB_FILTERS, filterProductionJobs, productionJobsFilterFrom, productionJobsHref,
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

/* ── ยามอ่านซอร์ส (จอเป็น JSX) — การ์ดต้องส่งลิงก์ที่กรองแล้ว · หน้าคิวต้องอ่านลิงก์ด้วย useSearchParams ── */
const live = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const overview = live(readFileSync(new URL('../../app/production/page.js', import.meta.url), 'utf8'));
const queue = live(readFileSync(new URL('../../app/production/jobs/page.js', import.meta.url), 'utf8'));

test('🔴 การ์ดภาพรวมส่งลิงก์ที่กรองแล้ว ไม่ใช่คิวเปล่า', () => {
  // ภายในแท็ก KpiCard ใบนั้น (ไม่ข้าม `/>` ไปการ์ดถัดไป)
  const card = (label, filter) => new RegExp(`label="${label}"(?:(?!/>)[\\s\\S])*?onClick=\\{\\(\\) => router\\.push\\(productionJobsHref\\("${filter}"\\)\\)\\}`);
  assert.match(overview, card('งานร่างรอวางคิว', 'draft'));
  assert.match(overview, card('กำลังผลิต', 'running'));
});

test('🔴 หน้าคิวอ่านตัวกรองจาก useSearchParams — ไม่ใช่ window.location ตอนเมานต์ (กดป้ายเมนูขณะอยู่บนหน้าแล้วตัวกรองไม่ติด)', () => {
  assert.match(queue, /const linkFilter = productionJobsFilterFrom\(searchParams\);/);
  assert.match(queue, /filterProductionJobs\(jobs, queueFilter\)/);
  assert.doesNotMatch(queue, /window\.location\.search/);
});
