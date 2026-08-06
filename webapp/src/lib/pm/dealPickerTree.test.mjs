import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_DEALS_BUCKET, buildDealBuckets, dealSearchText, filterBuckets, filterDeals,
  initialBucketKey, NO_PROJECT_BUCKET, projectLabelOf,
} from './dealPickerTree.js';

const projects = [
  { id: 'P2', code: 'PJ-26080033', name: 'ODM_Somchai' },
  { id: 'P1', code: 'PJ-26080012', name: 'KA_Rinvala' },
];
const deals = [
  { id: 'D1', title: 'Rinvala Sachet', customerName: 'บจก.รินวาลา', forecastMonth: '2026-08', projectId: 'P1' },
  { id: 'D2', title: 'Rinvala Sachet', customerName: 'บจก.รินวาลา', forecastMonth: '2026-11', projectId: 'P1' },
  { id: 'D3', title: 'Diffuser 100ml', customerName: 'สมชายโฮม', forecastMonth: '2026-09', projectId: 'P2' },
  { id: 'D4', title: 'กลิ่นใหม่ Q4', customerName: '', forecastMonth: null, projectId: null },
];

test('buildDealBuckets: ดีลทั้งหมดมาก่อน → โครงการเรียงตามป้าย → ยังไม่ผูกโครงการท้ายสุด', () => {
  const buckets = buildDealBuckets(deals, projects);
  assert.deepEqual(buckets.map((b) => b.key), [ALL_DEALS_BUCKET, 'P1', 'P2', NO_PROJECT_BUCKET]);
  assert.deepEqual(buckets.map((b) => b.deals.length), [4, 2, 1, 1]);
  assert.equal(buckets[1].label, 'PJ-26080012 · KA_Rinvala');
});

test('buildDealBuckets: ไม่มีดีลลอย = ไม่มีถัง "ยังไม่ผูกโครงการ" (ถังว่างคือคำโกหก)', () => {
  const buckets = buildDealBuckets(deals.filter((d) => d.projectId), projects);
  assert.equal(buckets.some((b) => b.key === NO_PROJECT_BUCKET), false);
});

test('buildDealBuckets: ดีลที่โครงการอยู่นอกลิสต์ ยังต้องมีถังของตัวเอง', () => {
  const buckets = buildDealBuckets([{ id: 'DX', title: 'x', projectId: 'P-นอกทีม' }], projects);
  const bucket = buckets.find((b) => b.key === 'P-นอกทีม');
  assert.ok(bucket, 'ต้องมีถังให้ดีลใบนั้น ไม่ใช่หายไปเฉย ๆ');
  assert.equal(bucket.label, 'โครงการอื่น');
});

test('filterBuckets: ค้นโครงการได้ และถัง "ดีลทั้งหมด" ไม่เคยถูกกรองทิ้ง', () => {
  const buckets = buildDealBuckets(deals, projects);
  const found = filterBuckets(buckets, 'PJ-26080033');
  assert.deepEqual(found.map((b) => b.key), [ALL_DEALS_BUCKET, 'P2']);
  // คำค้นที่ไม่ตรงอะไรเลย ยังต้องเหลือทางออกให้ผู้ใช้กดดูดีลทั้งหมด
  assert.deepEqual(filterBuckets(buckets, 'ไม่มีจริง').map((b) => b.key), [ALL_DEALS_BUCKET]);
});

test('filterDeals: ค้นได้ทั้งชื่อดีล ลูกค้า เดือน FC และชื่อโครงการ', () => {
  const labelOf = (deal) => projectLabelOf(projects.find((p) => p.id === deal.projectId));
  assert.deepEqual(filterDeals(deals, 'diffuser', labelOf).map((d) => d.id), ['D3']);
  assert.deepEqual(filterDeals(deals, 'รินวาลา', labelOf).map((d) => d.id), ['D1', 'D2']);
  assert.deepEqual(filterDeals(deals, '2026-11', labelOf).map((d) => d.id), ['D2']);
  assert.deepEqual(filterDeals(deals, 'KA_Rinvala', labelOf).map((d) => d.id), ['D1', 'D2']);
  assert.equal(filterDeals(deals, '', labelOf).length, 4);
});

test('initialBucketKey: กางแผงแล้วเปิดค้างที่ถังของดีลที่เลือกอยู่', () => {
  assert.equal(initialBucketKey(deals[0]), 'P1');
  assert.equal(initialBucketKey(deals[3]), NO_PROJECT_BUCKET);
  assert.equal(initialBucketKey(null), ALL_DEALS_BUCKET);
});

test('dealSearchText: ไม่มีคำว่า undefined/null หลุดเข้าไปในคำค้น', () => {
  assert.equal(dealSearchText(deals[3], 'ยังไม่ผูกโครงการ'), 'กลิ่นใหม่ Q4 ยังไม่ผูกโครงการ');
});
