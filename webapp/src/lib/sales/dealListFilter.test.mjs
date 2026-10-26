// ── H5 (ตรวจตัวเลข 2026-10-08): "รอเติมข้อมูล (n)" บน /sales-planning/deals ไม่ตรงกับแถวที่ติ๊กแล้วได้ ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEAL_REVIEW_LIST_URL, EMPTY_DEAL_FILTERS, dealDueKey, dealFacetCounts, dealListPick, dealPassesListFilters,
  dealPickRows, isNeedsReviewDeal, reviewOptionCount, wantsReviewOnly,
} from './dealListFilter.js';
import { dealMissingDelivery } from './dealPeriod.js';

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


// ── M11 · M12 (ตรวจตัวเลข 2026-10-20): แถบเตือน/เลขท้ายตัวเลือก = แถวที่กดแล้วได้ ─────────────────────
const MONTH = '2026-10';
/* ชุดคละทุกมิติ: เลยกำหนด/ไม่ระบุเดือน/ตรงกำหนด × มี/ไม่มีวันรับของ × Won/Lost/เปิด × ประเภท × เจ้าของ × รอเติมข้อมูล */
const MIX = [
  deal({ id: 'od-open-scent', forecastMonth: '2026-08', stage: 'proposal', dealType: 'SCENT' }),
  deal({ id: 'od-open-npd-deliv', forecastMonth: '2026-07', stage: 'proposal', dealType: 'NPD', endDate: '2026-11-30' }),
  deal({ id: 'od-other-owner', forecastMonth: '2026-08', ownerId: 'x' }),
  deal({ id: 'won-old-month', forecastMonth: '2026-08', stage: 'won', dealType: 'SCENT' }),
  deal({ id: 'won-deliv', forecastMonth: '2026-10', stage: 'won', endDate: '2026-12-01' }),
  deal({ id: 'lost-no-deliv', forecastMonth: '2026-09', stage: 'lost' }),
  deal({ id: 'lost-deliv', stage: 'lost', endDate: '2026-12-31' }),
  deal({ id: 'missing-month', stage: 'proposal', dealType: 'NPD' }),
  deal({ id: 'ontime-alpha', title: 'alpha', forecastMonth: '2026-11', stage: 'proposal', metadata: { demandMonth: '2026-12' } }),
  review({ id: 'rv-overdue', forecastMonth: '2026-06' }),
  review({ id: 'rv-won', stage: 'won' }),
];
const scopeMine = (d) => d.ownerId === 'me';
const pickCtx = { inScope: scopeMine, currentMonth: MONTH };
const searchCtx = (q) => ({ ...pickCtx, matchesSearch: (d) => !q || `${d.id} ${d.title}`.includes(q) });
/* แถวที่ตารางโชว์ = ตัวตัดสินเดียวกับหน้า */
const tableRows = (filters, ctx) => MIX.filter((d) => dealPassesListFilters(d, filters, ctx));

test('M11: ปุ่มบนแถบ = ตัวกรองทั้งชุด (แทนที่ ไม่ใช่เติม) · ตัวกรองค้าง (Won · ประเภท · คำค้น) ไม่ทำเลขเพี้ยน', () => {
  assert.deepEqual(dealListPick({ due: 'overdue' }), { ...EMPTY_DEAL_FILTERS, due: ['overdue'] });
  assert.deepEqual(dealListPick({ delivery: 'missing' }), { ...EMPTY_DEAL_FILTERS, delivery: ['missing'] });
  assert.deepEqual(dealListPick(), { ...EMPTY_DEAL_FILTERS });
  assert.equal(Object.isFrozen(EMPTY_DEAL_FILTERS), true);

  const STALE = [
    { stage: ['won'] }, { type: ['NPD'] }, { due: ['ontime'] }, { delivery: ['known'] },
    { stage: ['won'], type: ['SCENT'], due: ['missing'], delivery: ['missing'] },
  ];
  for (const pickArgs of [{ due: 'overdue' }, { delivery: 'missing' }]) {
    const pick = dealListPick(pickArgs);
    const bannerRows = dealPickRows(MIX, pick, pickCtx);
    assert.ok(bannerRows.length > 0, `${JSON.stringify(pickArgs)}: ชุดทดสอบต้องมีแถว`);
    for (const stale of STALE) {
      // กดแถบตอนมีตัวกรองค้าง: `pick` ระบุครบทุกมิติ ⇒ ทับของค้างได้หมด · หน้าล้างคำค้นด้วย (applyDealPick)
      const after = tableRows({ ...stale, ...pick }, searchCtx(''));
      assert.deepEqual(after.map((d) => d.id), bannerRows.map((d) => d.id), `${JSON.stringify(pickArgs)} หลัง ${JSON.stringify(stale)}`);
    }
    // ทุกมิติของตัวตัดสินอยู่ในชุด (เพิ่มมิติใหม่แล้วลืมใส่ = ของค้างหลุดรอด)
    assert.deepEqual(Object.keys(pick).sort(), ['delivery', 'due', 'review', 'stage', 'type']);
    // 🐞 ของเดิม: ตั้งแค่มิติเดียวแล้วคงสถานะ Won ที่ค้างไว้ ⇒ ตารางเหลือน้อยกว่าเลขบนแถบ
    const merged = tableRows({ stage: ['won'], ...('due' in pickArgs ? { due: ['overdue'] } : { delivery: ['missing'] }) }, searchCtx(''));
    assert.ok(merged.length < bannerRows.length, 'แบบเติม (ของเดิม) ต้องไม่เท่า — ยืนยันว่าเทสต์จับบั๊กได้');
  }
});

test('M11/M12b: แถบวันรับของนับด้วยตัวเดียวกับ dealMissingDelivery (ไม่นับดีลแพ้) · มูลค่ารวมจากชุดเดียวกัน', () => {
  const rows = dealPickRows(MIX, dealListPick({ delivery: 'missing' }), pickCtx);
  const legacy = MIX.filter((d) => scopeMine(d) && dealMissingDelivery(d));
  assert.deepEqual(rows.map((d) => d.id), legacy.map((d) => d.id));
  assert.ok(!rows.some((d) => d.stage === 'lost'));
  // ขอบเขต: ดีลของคนอื่นไม่เข้า
  assert.ok(!dealPickRows(MIX, dealListPick({ due: 'overdue' }), pickCtx).some((d) => d.ownerId !== 'me'));
});

test('M12a/M12b: เลขท้ายตัวเลือกเดือน FC / วันรับของ = แถวหลังติ๊กเพิ่มตัวนั้น (ทุกชุดตัวกรองที่ติดอยู่)', () => {
  const DUE = ['overdue', 'missing', 'ontime'];
  const DELIVERY = ['missing', 'known'];
  const subsets = (values) => values.reduce((acc, v) => acc.concat(acc.map((s) => [...s, v])), [[]]);
  const combos = [];
  for (const stage of [[], ['won'], ['proposal'], ['won', 'lost']]) {
    for (const type of [[], ['NPD']]) {
      for (const review of [false, true]) {
        for (const due of subsets(['overdue', 'ontime'])) {
          for (const delivery of [[], ['missing'], ['known']]) {
            for (const q of ['', 'alp', 'rv-']) combos.push({ filters: { stage, type, review, due, delivery }, q });
          }
        }
      }
    }
  }
  for (const { filters, q } of combos) {
    const ctx = searchCtx(q);
    const facets = dealFacetCounts(MIX, filters, ctx);
    for (const value of DUE) {
      // ติ๊ก "ค่านั้นค่าเดียว" ในมิติเดือน FC (มิติอื่นคงเดิม) ⇒ แถวที่ได้ = เลขท้ายตัวเลือก
      const rows = tableRows({ ...filters, due: [value] }, ctx);
      assert.equal(facets.due[value], rows.length, `due=${value} ${JSON.stringify(filters)} q=${q}`);
    }
    for (const value of DELIVERY) {
      const rows = tableRows({ ...filters, delivery: [value] }, ctx);
      assert.equal(facets.delivery[value], rows.length, `delivery=${value} ${JSON.stringify(filters)} q=${q}`);
    }
  }
  // 🐞 ตัวอย่างในรายงาน: ติ๊ก Won อยู่ — "เลยกำหนด" ต้องเป็น 0 (ดีลปิดแล้วไม่มีวันเลยกำหนด) ไม่ใช่ยอดตามขอบเขต
  const won = dealFacetCounts(MIX, { stage: ['won'] }, searchCtx(''));
  assert.equal(won.due.overdue, 0);
  // L10 (26/10): ดีลปิดแล้วไม่อยู่กลุ่มไหนของเดือน FC ⇒ ติ๊ก Won อยู่ "ตรงกำหนด" = 0 (เดิมนับ Won ทั้งสามใบ)
  assert.equal(won.due.ontime, 0, 'Won ไม่ใช่ "ตรงกำหนด" — ไม่มีเดือน FC ให้ตามแล้ว');
  assert.equal(won.due.missing, 0);
  // โหมดรอเติมข้อมูล: ไม่นับดีลที่ไม่ได้รอเติมข้อมูล · rv-won ปิดแล้ว ⇒ ไม่อยู่กลุ่มไหน
  const rv = dealFacetCounts(MIX, { review: true }, searchCtx(''));
  assert.equal(rv.due.overdue + rv.due.missing + rv.due.ontime, 1);
  assert.equal(rv.delivery.missing, 2);
});

/* ── ตรวจตัวเลข L10 (26/10): "ตรงกำหนด" ต้องเป็นคำจริง — ดีลที่ปิดแล้วไม่อยู่กลุ่มไหนของเดือน FC ── */
test('🔴 L10: Won · เข้าโครงการ · Lost = ไม่อยู่กลุ่มเดือน FC (null) · ไม่ขึ้นเมื่อติ๊กตัวเลือกใด · ไม่ถูกนับ', () => {
  const closed = [
    deal({ id: 'won-2025', stage: 'won', forecastMonth: '2025-01' }),
    deal({ id: 'lost-none', stage: 'lost', forecastMonth: null }),
    deal({ id: 'proj-future', stage: 'in_project', forecastMonth: '2026-12' }),
  ];
  const open = [
    deal({ id: 'open-future', stage: 'proposal', forecastMonth: '2026-12' }),
    deal({ id: 'open-this', stage: 'proposal', forecastMonth: MONTH }),
    deal({ id: 'open-past', stage: 'proposal', forecastMonth: '2026-01' }),
    deal({ id: 'open-none', stage: 'proposal', forecastMonth: null }),
  ];
  for (const d of closed) {
    assert.equal(dealDueKey(d, MONTH), null, d.id);
    for (const due of [['ontime'], ['overdue'], ['missing'], ['overdue', 'missing', 'ontime']]) {
      assert.equal(dealPassesListFilters(d, { due }, { currentMonth: MONTH }), false, `${d.id} due=${due}`);
    }
    // ไม่ติ๊กเดือน FC = ยังอยู่ในตาราง (มิตินี้ไม่ซ่อนดีลปิดเมื่อไม่ได้ใช้)
    assert.equal(dealPassesListFilters(d, {}, { currentMonth: MONTH }), true, d.id);
  }
  assert.deepEqual(open.map((d) => dealDueKey(d, MONTH)), ['ontime', 'ontime', 'overdue', 'missing']);
  const facets = dealFacetCounts([...closed, ...open], {}, { currentMonth: MONTH });
  assert.deepEqual(facets.due, { overdue: 1, missing: 1, ontime: 2 }, 'เดิม ontime = 5 (นับดีลปิดสามใบด้วย)');
  // ตัวเลือก = แถวหลังติ๊ก (ชุดผสม)
  for (const value of ['overdue', 'missing', 'ontime']) {
    const rows = [...closed, ...open].filter((d) => dealPassesListFilters(d, { due: [value] }, { currentMonth: MONTH }));
    assert.equal(rows.length, facets.due[value], value);
    assert.ok(rows.every((d) => !['won', 'in_project', 'lost'].includes(d.stage)), `${value}: ไม่มีดีลปิด`);
  }
});
