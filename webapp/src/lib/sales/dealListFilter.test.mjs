// ── H5 (ตรวจตัวเลข 2026-10-08): "รอเติมข้อมูล (n)" บน /sales-planning/deals ไม่ตรงกับแถวที่ติ๊กแล้วได้ ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEAL_REVIEW_LIST_URL, dealDueKey, dealPassesListFilters, isNeedsReviewDeal, reviewOptionCount, wantsReviewOnly,
} from './dealListFilter.js';

const deal = (over = {}) => ({
  id: 'D', stage: 'timeline_proposed', ownerId: 'me', team: 'SV', title: 'ดีล',
  forecastMonth: null, expectedCloseDate: null, metadata: {}, ...over,
});
const review = (over = {}) => deal({ metadata: { needsReview: true, source: 'pm-backfill' }, ...over });

/* ชุดทุกงวด (ชุดที่ตารางได้ตอนติ๊ก) — ดีลรอเติมข้อมูลส่วนใหญ่ไม่มีเดือน FC จึงไม่อยู่ในงวดไหนเลย */
const ALL = [
  review({ id: 'r-mine-no-month' }),
  review({ id: 'r-mine-2025', forecastMonth: '2025-03' }),
  review({ id: 'r-other-owner', ownerId: 'someone' }),
  review({ id: 'r-mine-won', stage: 'won', forecastMonth: '2026-10' }),
  deal({ id: 'normal-2026', forecastMonth: '2026-10' }),
];
// ชุดที่โหลดตามงวด (ปีนี้) — สิ่งที่ตัวนับเดิมนับ
const PERIOD_2026 = ALL.filter((d) => String(d.forecastMonth || '').startsWith('2026'));
const ctxMine = { inScope: (d) => d.ownerId === 'me', matchesSearch: () => true, currentMonth: '2026-10' };

test('H5: เลขท้ายตัวเลือก = แถวที่ตารางเหลือเมื่อติ๊ก (ทุกงวด · ตามขอบเขต)', () => {
  const ticked = { review: true };
  const shownWhenTicked = ALL.filter((d) => dealPassesListFilters(d, ticked, ctxMine));
  assert.deepEqual(shownWhenTicked.map((d) => d.id), ['r-mine-no-month', 'r-mine-2025', 'r-mine-won']);
  // ตัวเลือกยังไม่ติ๊ก: นับจากชุดรอเติมข้อมูลทุกงวด (DEAL_REVIEW_LIST_URL) ไม่ใช่ชุดของงวด
  const reviewSet = ALL.filter(isNeedsReviewDeal);
  assert.equal(reviewOptionCount(reviewSet, { review: false }, ctxMine), shownWhenTicked.length);
  // 🐞 ตัวนับเดิม: ชุดของงวด ไม่สนขอบเขต ⇒ 1 ทั้งที่ติ๊กแล้วได้ 3
  assert.equal(PERIOD_2026.filter((d) => d.metadata?.needsReview).length, 1);
});

test('H5: นับแยกมิติ — ตัวกรองอื่นที่ติดอยู่ (สถานะ · คำค้น) ลดเลขตามที่ตารางจะลดจริง', () => {
  const reviewSet = ALL.filter(isNeedsReviewDeal);
  const wonOnly = { stage: ['won'] };
  assert.equal(reviewOptionCount(reviewSet, wonOnly, ctxMine), 1);
  assert.equal(
    ALL.filter((d) => dealPassesListFilters(d, { ...wonOnly, review: true }, ctxMine)).length,
    1,
  );
  const searching = { ...ctxMine, matchesSearch: (d) => d.id.includes('2025') };
  assert.equal(reviewOptionCount(reviewSet, {}, searching), 1);
  // ยังไม่รู้ชุด (โหลดพัง/กำลังโหลด) = ไม่โชว์เลข ไม่ใช่ 0
  assert.equal(reviewOptionCount(null, {}, ctxMine), null);
});

test('ตัวตัดสินของตาราง: ทุกมิติเท่าเดิม (ขอบเขต · เดือน FC · วันรับของ · สถานะ · ประเภท · คำค้น)', () => {
  const d = deal({ forecastMonth: '2026-08', stage: 'proposal', dealType: 'SCENT' });
  assert.equal(dealDueKey(d, '2026-10'), 'overdue');
  assert.equal(dealPassesListFilters(d, { due: ['overdue'] }, ctxMine), true);
  assert.equal(dealPassesListFilters(d, { due: ['ontime'] }, ctxMine), false);
  assert.equal(dealPassesListFilters(d, { stage: ['won'] }, ctxMine), false);
  assert.equal(dealPassesListFilters(d, { type: ['SCENT'] }, ctxMine), true);
  assert.equal(dealPassesListFilters(d, { type: ['NPD'] }, ctxMine), false);
  assert.equal(dealPassesListFilters(d, { review: true }, ctxMine), false);
  assert.equal(dealPassesListFilters(deal({ ownerId: 'x' }), {}, ctxMine), false);
  assert.equal(dealPassesListFilters(d, {}, { ...ctxMine, matchesSearch: () => false }), false);
});

test('ลิงก์ชุดรอเติมข้อมูล: API อ่าน `review=1` แล้วคัดด้วยธงเดียวกัน · หน้าโหลดชุดนี้มานับ', () => {
  const url = new URL(DEAL_REVIEW_LIST_URL, 'http://x');
  assert.equal(url.pathname, '/api/sales-planning/deals');
  assert.equal(wantsReviewOnly(url.searchParams), true);
  assert.equal(wantsReviewOnly(new URLSearchParams('mode=month&month=2026-10')), false);
  // ไม่ส่งงวดไปด้วย — ดีลรอเติมข้อมูลไม่มีเดือน FC ส่งงวดไปเมื่อไรก็หายหมด
  assert.equal(url.searchParams.has('month') || url.searchParams.has('mode'), false);

  const route = readFileSync(new URL('../../app/api/sales-planning/deals/route.js', import.meta.url), 'utf8');
  assert.match(route, /const reviewOnly = wantsReviewOnly\(params\);/);
  assert.match(route, /if \(reviewOnly\) q = q\.eq\('metadata->>needsReview', 'true'\);/);

  const page = readFileSync(new URL('../../app/sales-planning/deals/page.js', import.meta.url), 'utf8');
  assert.match(page, /reviewOnly \? null : apiFetch\(DEAL_REVIEW_LIST_URL\)/);
  assert.match(page, /reviewOptionCount\(reviewOnly \? deals : reviewDeals, listFilters, listCtx\)/);
  assert.match(page, /deals\.filter\(\(deal\) => dealPassesListFilters\(deal, listFilters, listCtx\)\)/);
  // 🐞 ตัวนับเดิมต้องไม่กลับมา
  assert.doesNotMatch(page, /deals\.filter\(\(d\) => d\.metadata\?\.needsReview\)\.length/);
});
