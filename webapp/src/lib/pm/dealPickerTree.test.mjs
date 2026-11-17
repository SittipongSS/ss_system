// ตัวเลือกดีลสองชั้น — ถังซ้าย = ลูกค้า (ยุบดีล/โครงการ P2d · มติเจ้าของ 13/11/2026 · เดิมเป็นโครงการ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALL_DEALS_BUCKET, buildDealBuckets, dealSearchText, filterBuckets, filterDeals,
  initialBucketKey, NO_CUSTOMER_BUCKET,
} from './dealPickerTree.js';

const deals = [
  { id: 'D1', code: 'DL-1', title: 'Rinvala Sachet', customerId: 'C1', customerName: 'บจก.รินวาลา', customer: { arCode: 'AR-101' }, forecastMonth: '2026-08', projectId: 'P1' },
  { id: 'D2', code: 'DL-2', title: 'Rinvala Sachet', customerId: 'C1', customerName: 'บจก.รินวาลา', forecastMonth: '2026-11', projectId: 'P1' },
  { id: 'D3', code: 'DL-3', title: 'Diffuser 100ml', customerId: 'C2', customerName: 'สมชายโฮม', forecastMonth: '2026-09', projectId: null },
  { id: 'D4', code: 'DL-4', title: 'กลิ่นใหม่ Q4', customerName: '', forecastMonth: null, projectId: null },
  { id: 'D5', code: 'DL-5', title: 'ดีลเก่าชื่ออย่างเดียว', customerName: 'ร้านเก่า', forecastMonth: '2026-07' },
];

test('buildDealBuckets: ดีลทั้งหมดมาก่อน → ลูกค้าเรียงตามชื่อ → ยังไม่มีลูกค้าท้ายสุด · ไม่ดูโครงการ', () => {
  const buckets = buildDealBuckets(deals);
  assert.deepEqual(buckets.map((b) => b.label), ['ดีลทั้งหมด', 'บจก.รินวาลา', 'ร้านเก่า', 'สมชายโฮม', 'ยังไม่มีลูกค้า']);
  assert.deepEqual(buckets.map((b) => b.deals.length), [5, 2, 1, 1, 1]);
  assert.equal(buckets[1].code, 'AR-101', 'รหัส AR จากดีลใบไหนในกลุ่มก็ได้');
  assert.equal(buckets.at(-1).key, NO_CUSTOMER_BUCKET);
});

test('buildDealBuckets: ดีลชื่อลูกค้าอย่างเดียว (ผูกก่อนมีทะเบียน) รวมกลุ่มด้วยชื่อ · ไม่มีดีลไร้ลูกค้า = ไม่มีถังนั้น', () => {
  const buckets = buildDealBuckets([
    { id: 'A', title: 'a', customerName: 'ร้านเก่า' },
    { id: 'B', title: 'b', customerName: ' ร้านเก่า ' },
  ]);
  assert.deepEqual(buckets.map((b) => b.deals.length), [2, 2]);
  assert.equal(buckets.some((b) => b.key === NO_CUSTOMER_BUCKET), false, 'ถังว่างคือคำโกหก');
});

test('filterBuckets: ค้นลูกค้าด้วยชื่อหรือรหัส AR · ถัง "ดีลทั้งหมด" ไม่เคยถูกกรองทิ้ง', () => {
  const buckets = buildDealBuckets(deals);
  assert.deepEqual(filterBuckets(buckets, 'รินวาลา').map((b) => b.key), [ALL_DEALS_BUCKET, 'c:C1']);
  assert.deepEqual(filterBuckets(buckets, 'AR-101').map((b) => b.key), [ALL_DEALS_BUCKET, 'c:C1']);
  assert.deepEqual(filterBuckets(buckets, 'ไม่มีจริง').map((b) => b.key), [ALL_DEALS_BUCKET]);
});

test('filterDeals: ค้นได้ทั้งรหัส ชื่อดีล ลูกค้า AR เดือน FC · หลายคำต้องเจอทุกคำ', () => {
  assert.deepEqual(filterDeals(deals, 'diffuser').map((d) => d.id), ['D3']);
  assert.deepEqual(filterDeals(deals, 'รินวาลา').map((d) => d.id), ['D1', 'D2']);
  assert.deepEqual(filterDeals(deals, 'rinvala 2026-11').map((d) => d.id), ['D2']);
  assert.deepEqual(filterDeals(deals, 'AR-101').map((d) => d.id), ['D1']);
  assert.deepEqual(filterDeals(deals, 'DL-3').map((d) => d.id), ['D3']);
  assert.deepEqual(filterDeals(deals, '  diffuser   สมชาย ').map((d) => d.id), ['D3']);
  assert.equal(filterDeals(deals, '').length, 5);
});

test('initialBucketKey: กางแผงแล้วเปิดค้างที่ถังลูกค้าของดีลที่เลือกอยู่', () => {
  assert.equal(initialBucketKey(deals[0]), 'c:C1');
  assert.equal(initialBucketKey(deals[3]), NO_CUSTOMER_BUCKET);
  assert.equal(initialBucketKey(deals[4]), 'n:ร้านเก่า');
  assert.equal(initialBucketKey(null), ALL_DEALS_BUCKET);
});

test('dealSearchText: ไม่มีคำว่า undefined/null หลุดเข้าไปในคำค้น', () => {
  assert.equal(dealSearchText(deals[3]), 'DL-4 กลิ่นใหม่ Q4');
});

test('DealPicker ไม่รับ/ไม่อ่านรายชื่อโครงการแล้ว · ถังลูกค้าใช้ไอคอนลูกค้า', () => {
  const src = readFileSync(new URL('../../components/pm/DealPicker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /projects\s*=\s*\[|projects\.|buildDealBuckets\(deals, /);
  assert.match(src, /bucket\.key === ALL_DEALS_BUCKET \? Handshake : Building2/);
});
