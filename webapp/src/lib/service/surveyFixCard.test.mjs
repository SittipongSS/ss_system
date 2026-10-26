// ── S2b แก้หลังตรวจจอ · กลุ่ม F — view-model ของการ์ดจัดการผล · หน้าคำร้อง · ตารางผล (แผน review-s2b/FIX-PLAN.md §2 กลุ่ม F) ──
//
// ⭐ ไฟล์นี้ล็อกข้อที่กลุ่ม F แก้ ทีละข้อตามรหัสของแผน — แต่ละเทสต์ตกเมื่อถอยโค้ดของข้อนั้น
//   crew-q3 + head-rc-q2 (ประโยคพื้นที่ที่กลับเป็นลงหน้างาน) · head-r3-21 (วันรูป "พฤ. 8 ต.ค.") · head-r3-2 (รอลงคิวเข้าพื้นที่)
//   · head-r3-53 (รอช่าง / หัวหน้าต้องทำ · แถวผังของใบผสม) · sales-q8 · head-rc-q11 · sales-q2 · sales-minor-3 · head-rc-r2-22
//   · S2b-O9 (จุดติดตั้งโดยประมาณ) · sales-q10b · sales-q10c · head-r3-20 · head-r3-12 (ส่วนตาราง) · C-1 (TIFF ในช่องภาพกว้าง)
// 🔴 ใบลงหน้างานล้วนต้องได้ค่าเดิม — ทุกข้อมีเคสคู่ของใบลงหน้างาน (ยามใหญ่อีกชั้น = `surveyMethodGolden.test.mjs` ที่ไม่ถูกแก้)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SURVEY_RESAVE_HEADLINE, surveyControlView as controlView, surveyPlanGateShown, surveyResultMethodCell, surveyResultZoneCell,
} from './surveyControl.js';
import { SURVEY_DRAWING_SPOTS_NOTE, SURVEY_ZONE_RESAVE_TEXT, surveyJobView, surveyRequestDeskReady } from './surveyJob.js';
import { SURVEY_GATES, surveyGateChecklist } from './survey.js';
import { surveyZoneNeedsResave, surveyZoneSwitchedToOnsite } from './surveyMethod.js';
import { requestRailSteps } from '../requests/requestRail.js';
import { committedVsRequested } from '../requests/headerFacts.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

// ── ของตั้งต้น (ทรงเดียวกับ `surveyMethodCard.test.mjs`) ───────────────────────────────
const SIZES = [
  { code: 'XS', nameEn: 'Extra Small', maxCbm: null, autoSuggest: false },
  { code: 'SM', nameEn: 'Small', maxCbm: 300, autoSuggest: true },
  { code: 'ST', nameEn: 'Standard', maxCbm: 2400, autoSuggest: true },
  { code: 'XL', nameEn: 'Extra Large', maxCbm: null, autoSuggest: true },
];
const TODAY = '2026-10-09';
const part = (w, l, h) => ({ widthM: w, lengthM: l, heightM: h, label: null });
const WIDE = { id: 'F-wide', docType: 'survey_wide', fileName: 'wide.jpg', mimeType: 'image/jpeg' };
const PLAN = { id: 'F-plan', docType: 'survey_plan', fileName: 'plan.jpg', mimeType: 'image/jpeg' };
const SPOT = { id: 'F-spot', docType: 'survey_spot', fileName: 'spot.jpg', mimeType: 'image/jpeg', metadata: { spotId: 's1' } };

const onsiteReady = (id, name, extra = {}) => ({
  id, zoneId: `SZN-${id}`, zoneName: name, floor: '02', status: 'ok',
  parts: [part(4, 5, 3)], spots: [{ id: 's1', label: 'มุมโซฟา', selected: true }],
  packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM', packageNote: '', note: '', ...extra,
});
const drawingEmpty = (id, name, extra = {}) => ({
  id, zoneId: `SZN-${id}`, zoneName: name, floor: '02', status: 'ok', method: 'drawing',
  parts: [], spots: [], packageQty: null, packageNote: '', note: '', ...extra,
});
const drawingReady = (id, name, extra = {}) => drawingEmpty(id, name, {
  parts: [part(4, 5, 3)], packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM', ...extra,
});
/* พื้นที่ที่หัวหน้าสลับกลับเป็นลงหน้างาน แล้วยังไม่มีใครบันทึกใหม่ (ด่านขนาดขอ "บันทึกอีกครั้ง") */
const switchedBack = (id, name, extra = {}) => onsiteReady(id, name, {
  methodChangedAt: '2026-10-09T03:00:00.000Z', surveyedAt: '2026-10-08T03:00:00.000Z', ...extra,
});

const request = (extra = {}) => ({
  id: 'DR-1', docNo: 'RQ-AS-26100312', kind: 'site_survey', dept: 'TS', status: 'acknowledged',
  acknowledgedAt: '2026-10-06T08:12:00.000Z', committedDueDate: '2026-10-12', committedResultDate: '2026-10-12',
  requestedByName: 'Admin S&S', ...extra,
});
const HEAD = { canWrite: true, canDecide: true };
const filesFor = (zones) => Object.fromEntries(zones.map((z) => [
  z.id, z.method === 'drawing' ? (z.parts.length ? [PLAN] : []) : [WIDE, PLAN, SPOT],
]));
const card = (zones, extra = {}) => controlView({
  packageSizes: SIZES, request: request(), zones, filesByZone: filesFor(zones), viewer: HEAD, today: TODAY, ...extra,
});
const visitOf = (status, extra = {}) => ({
  id: 'SVV-1', code: 'SV-26100011', status, scheduledDate: '2026-10-08', actualDate: '2026-10-08',
  assigneeId: 'U-9', assigneeName: 'ช่าง ก', assistantIds: [], ...extra,
});
const METHOD_ON = { drawingMethodEnabled: true };

/* คำร้องของหน้าคำร้อง (`surveyJobView`) — ทรงเดียวกับ `surveyMethodJob.test.mjs` */
const ask = (over = {}) => ({
  id: 'r1', kind: 'site_survey', dept: 'TS', requesterDept: 'SA', status: 'acknowledged', docNo: 'RQ-AS-26100312', team: 'SV',
  requestedByName: 'Lalida Chaiwanna', submittedAt: '2026-10-08T07:50:00Z',
  acknowledgedAt: '2026-10-08T08:12:00Z', acknowledgedByName: 'Arnon Aunsapwilai',
  assigneeId: 'u-head', assigneeName: 'Arnon Aunsapwilai',
  requestedDueDate: '2026-10-13', requestedDueTime: '10:00:00', requestedResultDate: '2026-10-15',
  committedDueDate: null, committedResultDate: null,
  surveyVisit: null, surveyZones: [], surveyFilesByZone: {},
  ...over,
});
const withZones = (zones, over = {}) => ask({ surveyZones: zones, surveyFilesByZone: filesFor(zones), ...over });
const job = (req, viewer = {}, today = TODAY) => surveyJobView({ request: req, today, viewer });

// ══ crew-q3 + head-rc-q2 — ประโยคเดียวทุกบทบาท (แผน §0.1) ══════════════════════════════════

test('crew-q3 + head-rc-q2: ด่านขนาด · คำของตารางหน้าคำร้อง · พาดหัวการ์ด = "ตรวจขนาดและภาพกว้าง" ไม่มี "กับของจริง"', () => {
  const size = SURVEY_GATES.find((g) => g.key === 'size');
  assert.equal(size.missing(switchedBack('z1', 'Studio 01')), 'พื้นที่นี้เพิ่งกลับมาเป็นลงหน้างาน — ตรวจขนาดและภาพกว้างแล้วกดบันทึกอีกครั้ง');
  assert.equal(SURVEY_ZONE_RESAVE_TEXT, 'กลับมาเป็นลงหน้างาน — รอตรวจขนาดและภาพกว้างแล้วบันทึกอีกครั้ง');
  assert.equal(SURVEY_RESAVE_HEADLINE, 'รอหัวหน้าตรวจขนาดและภาพกว้างแล้วบันทึกอีกครั้ง');
  // กฎของด่านไม่เปลี่ยน — บันทึกหลังสลับแล้วผ่าน · แถวที่ไม่เคยสลับไม่มีประโยคนี้
  assert.equal(size.missing(switchedBack('z1', 'Studio 01', { surveyedAt: '2026-10-09T03:05:00.000Z' })), null);
  assert.equal(size.missing(onsiteReady('z1', 'Studio 01')), null);
  // บรรทัด "ต่อไป" ของหน้าคำร้องคงคำเดิม (แผน §0.1)
  assert.match(read('lib/service/surveyJob.js'), /ตรวจขนาดแล้วกด “บันทึกพื้นที่นี้” → เคาะแล้วกด “ส่งผลให้ฝ่ายขาย”/);
});

// ══ head-r3-21 (ส่วน a) — วันรูปเดียวกับหัวใบ ═════════════════════════════════════════════

test('head-r3-21: บรรทัดที่มาของแถวจากแบบใช้วันรูป "พฤ. 8 ต.ค." (วันไทย) ไม่ใช่ "08/10/2026"', () => {
  const born = drawingReady('z1', 'Lobby', { surveyedAt: '2026-10-08T18:30:00.000Z', surveyedByName: 'หัวหน้า ก' });
  assert.equal(surveyResultMethodCell(born, null).source, 'จากแบบ · หัวหน้า ก ศ. 9 ต.ค.', 'ตีหนึ่งครึ่งของวันที่ 9 เวลาไทย');
  assert.doesNotMatch(surveyResultMethodCell(born, null).source, /\d{2}\/\d{2}\/\d{4}/);
});

// ══ head-r3-2 — ยังไม่มีนัดที่เข้าพื้นที่ = "รอลงคิวเข้าพื้นที่" ═════════════════════════════

test('head-r3-2 (ก): ใบผสมข้อมูลครบแต่ไม่มีนัดที่เข้าพื้นที่ — พาดหัว "รอลงคิวเข้าพื้นที่" · แถบไม่เขียวเต็ม · เหตุใต้ปุ่มคงเดิม', () => {
  const zones = [onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby')];
  const SITE_VISIT = 'ใบนี้มีพื้นที่ลงหน้างาน (Studio 01) แต่ยังไม่มีนัดที่เข้าพื้นที่ — ลงคิวก่อน หรือเปลี่ยนพื้นที่นั้นเป็นประเมินจากแบบ';
  for (const [name, extra] of [
    ['ไม่มีนัด · GET บอกว่ายังไม่เคยเข้า', { siteVisitReached: false }],
    ['ไม่มีนัดเลย · GET ไม่ได้อ่าน', { siteVisitReached: null }],
    ['นัดล่าสุดเข้าไม่ได้', { siteVisitReached: false, visit: visitOf('unable') }],
    ['นัดล่าสุดถูกยกเลิก', { siteVisitReached: false, visit: visitOf('cancelled') }],
  ]) {
    const v = card(zones, { ...METHOD_ON, ...extra });
    assert.deepEqual(v.status, {
      key: 'queue', tone: 'warning', headline: 'รอลงคิวเข้าพื้นที่', sub: 'วัดแล้ว 1 / 1 พื้นที่ · จากแบบ 1 (หัวหน้ากรอกเอง)',
    }, name);
    assert.equal(v.progress.complete, false, `${name}: แถบไม่ขึ้นเขียวเต็ม`);
    assert.equal(v.progress.done, 1, name);
    /* เหตุใต้ปุ่มคือแถว 17a ตัวเดิม — มีเฉพาะเมื่อ GET ตอบ true/false (`null` = ไม่ขึ้นบรรทัดนี้ route ตัดสินตอนกด · กติกาเดิม) */
    if (typeof extra.siteVisitReached === 'boolean') {
      assert.deepEqual([v.send.allowed, v.send.reason.key, v.send.reason.text], [false, 'site-visit', SITE_VISIT], name);
    }
  }
});

test('head-r3-2 (ข): พื้นที่ที่สลับกลับเป็นลงหน้างาน ยังไม่มีนัดเลย — ไม่ใช่ "กำลังวัดหน้างาน"', () => {
  const zones = [switchedBack('z1', 'Studio 01'), drawingReady('z2', 'Lobby')];
  const v = card(zones, { ...METHOD_ON, siteVisitReached: false });
  assert.equal(v.status.key, 'queue');
  assert.equal(v.status.headline, 'รอลงคิวเข้าพื้นที่');
  assert.equal(v.status.sub, 'วัดแล้ว 0 / 1 พื้นที่ · จากแบบ 1 (หัวหน้ากรอกเอง) · เหลือ Studio 01');
  // ใบจากแบบทั้งใบที่พื้นที่ทั้งหมดถูกสลับกลับ (ไม่เหลือพื้นที่จากแบบ) ก็เป็นใบที่วิธีประเมินแตะแล้ว
  const allBack = card([switchedBack('z1', 'Studio 01'), switchedBack('z2', 'Studio 02')], { ...METHOD_ON, siteVisitReached: false });
  assert.equal(allBack.status.headline, 'รอลงคิวเข้าพื้นที่');
});

test('head-r3-2 (รีวิวรอบสอง): สลับกลับทุกพื้นที่แล้วหัวหน้ากดบันทึกใหม่ครบ ยังไม่มีนัด — ยังเป็น "รอลงคิวเข้าพื้นที่" ไม่ใช่ "พร้อมส่งผล" หรือ "กำลังวัด"', () => {
  /* ด่านขนาดสั่งให้หัวหน้ากดบันทึก (S06 desk-back-to-onsite) — บันทึกแล้วแถวไม่ "รอบันทึกใหม่" อีก แต่ยังเคยสลับวิธี (`methodChangedAt`) */
  const resaved = { surveyedAt: '2026-10-09T03:05:00.000Z' };
  const zones = [switchedBack('z1', 'Studio 01', resaved), switchedBack('z2', 'Studio 02', resaved)];
  const v = card(zones, { ...METHOD_ON, siteVisitReached: false });
  assert.deepEqual([v.status.key, v.status.headline], ['queue', 'รอลงคิวเข้าพื้นที่'], 'แบบ ก — ด่านผ่านครบ');
  assert.equal(v.progress.complete, false, 'แถบไม่ขึ้นเขียวเต็ม');
  assert.equal(v.send.allowed, false, 'ด่าน 17a ยังขวางตามเดิม');
  // แบบ ข — ภาพกว้างยังขาดหนึ่งพื้นที่
  const missingWide = card(zones, { ...METHOD_ON, siteVisitReached: false, filesByZone: { ...filesFor(zones), z2: [PLAN, SPOT] } });
  assert.deepEqual([missingWide.status.key, missingWide.status.headline], ['queue', 'รอลงคิวเข้าพื้นที่'], 'แบบ ข');
  assert.equal(missingWide.progress.complete, false);
  // ใบที่ฝ่ายขายยื่นเป็นประเมินจากแบบ — ไม่เหลือพื้นที่จากแบบและไม่มีแถวที่เคยสลับ (เช่น พื้นที่ลงหน้างานที่เพิ่มทีหลัง) ก็นับว่าแตะแล้ว
  const filed = card([onsiteReady('z1', 'Studio 01')], {
    ...METHOD_ON, siteVisitReached: false, request: request({ variant: 'drawing' }),
  });
  assert.equal(filed.status.key, 'queue');
  // ทางเดิม: มีนัดที่เข้าพื้นที่แล้ว = พร้อมส่ง · สวิตช์ปิด = พร้อมส่ง
  assert.equal(card(zones, { ...METHOD_ON, siteVisitReached: true }).status.key, 'ready');
  assert.equal(card(zones, { siteVisitReached: false }).status.key, 'ready');
});

test('head-r3-2 (รีวิวรอบสาม): ใบลงหน้างานล้วนที่ไม่เคยสลับ ข้อมูลครบแต่ติดแถว 17a อย่างเดียว — "รอลงคิวเข้าพื้นที่" ไม่ใช่ "พร้อมส่งผล" + แถบเขียวเต็ม', () => {
  /* ใบเดียวกับ `surveyMethodCard.test.mjs` ("ใบลงหน้างานล้วนก็อยู่ใต้ด่านนี้เมื่อเปิดสวิตช์") — หัวหน้ากรอกขนาดที่โต๊ะ ยังไม่มีใครเข้าพื้นที่ */
  const zones = [onsiteReady('z1', 'Studio 01')];
  const SITE_VISIT = 'ใบนี้มีพื้นที่ลงหน้างาน (Studio 01) แต่ยังไม่มีนัดที่เข้าพื้นที่ — ลงคิวก่อน หรือเปลี่ยนพื้นที่นั้นเป็นประเมินจากแบบ';
  for (const [name, extra] of [
    ['ไม่มีนัดเลย', {}],
    ['นัดล่าสุดถูกยกเลิก', { visit: visitOf('cancelled') }],
    ['นัดล่าสุดเข้าไม่ได้', { visit: visitOf('unable') }],
  ]) {
    const v = card(zones, { ...METHOD_ON, siteVisitReached: false, ...extra });
    assert.deepEqual(v.status, {
      key: 'queue', tone: 'warning', headline: 'รอลงคิวเข้าพื้นที่', sub: 'วัดแล้ว 1 / 1 พื้นที่',
    }, name);
    assert.equal(v.progress.complete, false, `${name}: แถบไม่ขึ้นเขียวเต็ม`);
    // พาดหัวกับเหตุใต้ปุ่มพูดเรื่องเดียวกัน (แถว 17a — คีย์และประโยคเดิม)
    assert.deepEqual([v.send.allowed, v.send.reason.key, v.send.reason.text], [false, 'site-visit', SITE_VISIT], name);
  }
  /* ไม่ผูกกับคนดู — ผู้วางคิว (GET ไม่ถามเรื่องนัดให้ = `null`) เปิดใบที่ไม่มีนัดเลยก็เห็นพาดหัวเดียวกับหัวหน้า (เขาคือคนที่ต้องลงคิว)
     · ไม่มีนัดเลยสักนัด = ไม่มีนัดที่เข้าพื้นที่แน่นอน (กติกาเดียวกับใบที่วิธีประเมินแตะแล้ว) */
  const planner = card(zones, { ...METHOD_ON, viewer: { canWrite: false, canDecide: false } });
  assert.deepEqual([planner.status.key, planner.progress.complete], ['queue', false], 'ผู้วางคิว');
  assert.equal(card(zones, { ...METHOD_ON, siteVisitReached: null }).status.key, 'queue', 'หัวหน้า · GET อ่านไม่ได้แต่ไม่มีนัดเลย');
  // ทางเดิม: สวิตช์ปิด · ไม่ทราบ (มีนัดแต่ GET ไม่ได้อ่าน) · มีนัดที่เข้าพื้นที่แล้ว · นัดยังเปิด (ส่งผลปิดนัดให้)
  assert.equal(card(zones, { siteVisitReached: false }).status.key, 'ready', 'สวิตช์ปิด');
  assert.equal(card(zones, { viewer: { canWrite: false, canDecide: false } }).status.key, 'ready', 'สวิตช์ปิด · ผู้วางคิว');
  assert.equal(card(zones, { ...METHOD_ON, siteVisitReached: null, visit: visitOf('unable') }).status.key, 'ready', 'ไม่ทราบ ≠ ไม่มีนัด');
  assert.equal(card(zones, { ...METHOD_ON, siteVisitReached: true }).status.key, 'ready');
  assert.equal(card(zones, { ...METHOD_ON, siteVisitReached: false, visit: visitOf('scheduled') }).status.key, 'ready');
  // ด่านของพื้นที่ยังติด = ด่านพูดก่อน และพาดหัวเป็นของวันนี้ (ใบที่ไม่เคยแตะวิธีประเมินเข้าทางนี้เฉพาะแบบ ก)
  const gaps = card([onsiteReady('z1', 'Studio 01', { packageQty: null })], { ...METHOD_ON, siteVisitReached: false });
  assert.equal(gaps.send.reason.key, 'head-gaps');
  assert.notEqual(gaps.status.key, 'queue');
});

test('head-r3-2 (รีวิวรอบสี่): นัดร่าง + ข้อมูลครบ + ไม่มีนัดที่เข้าพื้นที่ — "นัดยังไม่ขึ้นตาราง" ไม่ใช่ "พร้อมส่งผล" + แถบเขียวเต็ม · คำเดียวกับหน้าคำร้อง', () => {
  /* นัดร่างยังถือคิว แต่ส่งผลไม่ปิดนัดร่าง (`surveySendVisitStep` = block) ⇒ route ตีกลับด้วยแถว 17a — เดิมการ์ดกันนัดที่ถือคิวทุกแบบออกจากทาง "รอลงคิว"
     แล้วนัดร่างตกถึง "พร้อมส่งผลให้ฝ่ายขาย" (สาขา "ยังไม่เริ่มงานหน้างาน" ถามแค่นัดไว้) */
  const SITE_VISIT = 'ใบนี้มีพื้นที่ลงหน้างาน (Studio 01) แต่ยังไม่มีนัดที่เข้าพื้นที่ — ลงคิวก่อน หรือเปลี่ยนพื้นที่นั้นเป็นประเมินจากแบบ';
  const draft = visitOf('draft', { actualDate: null });
  for (const [name, zones, sub] of [
    ['ใบลงหน้างานล้วนที่ไม่เคยสลับ', [onsiteReady('z1', 'Studio 01')], 'วัดแล้ว 1 / 1 พื้นที่'],
    ['ใบผสม', [onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby')], 'วัดแล้ว 1 / 1 พื้นที่ · จากแบบ 1 (หัวหน้ากรอกเอง)'],
  ]) {
    const v = card(zones, { ...METHOD_ON, siteVisitReached: false, visit: draft });
    assert.deepEqual(v.status, { key: 'visit-draft', tone: 'warning', headline: 'นัดยังไม่ขึ้นตาราง', sub }, name);
    assert.equal(v.progress.complete, false, `${name}: แถบไม่ขึ้นเขียวเต็ม`);
    assert.equal(v.progress.percent, 100, `${name}: ตัวเลขของแถบเท่าเดิม`);
    // เหตุใต้ปุ่มคงเดิม — แถว 17a (route ถามก่อนเรื่องนัดร่าง)
    assert.deepEqual([v.send.allowed, v.send.reason.key, v.send.reason.text], [false, 'site-visit', SITE_VISIT], name);
    // หน้าคำร้องของใบเดียวกัน: แถบตอนนี้คำเดียวกัน · รางสองจออยู่ขั้นเดียวกัน (ขั้นเข้าพื้นที่)
    const page = job(withZones(zones, {
      committedDueDate: '2026-10-12', committedResultDate: '2026-10-15', dueCommittedAt: '2026-10-08T09:00:00Z', surveyVisit: draft,
    }));
    assert.deepEqual([page.stage, page.now.headline], ['visit-draft', v.status.headline], name);
    assert.equal(page.index, v.step.index, `${name}: ขั้นเดียวกัน`);
  }
  // ผู้วางคิวเห็นพาดหัวเดียวกัน (GET ถามเรื่องนัดให้เขาแล้ว)
  const planner = card([onsiteReady('z1', 'Studio 01')], {
    ...METHOD_ON, siteVisitReached: false, visit: draft, viewer: { canWrite: true, canDecide: false },
  });
  assert.deepEqual([planner.status.key, planner.progress.complete], ['visit-draft', false]);
  // ทางเดิม: สวิตช์ปิด = route ไม่ถามแถว 17a ⇒ การ์ดเท่าเดิมทุกคีย์ของสถานะ/แถบ (เหตุใต้ปุ่มคือนัดร่าง) ·
  //          มีนัดที่เข้าพื้นที่แล้ว (รอบสอง) = ไม่ใช่เรื่องลงคิว
  const zones = [onsiteReady('z1', 'Studio 01')];
  const off = card(zones, { siteVisitReached: false, visit: draft });
  assert.deepEqual([off.status.key, off.progress.complete, off.send.reason.key], ['ready', true, 'visit-draft']);
  assert.equal(card(zones, { ...METHOD_ON, siteVisitReached: true, visit: draft }).status.key, 'ready');
  // ใบลงหน้างานล้วนที่ไม่เคยสลับและยังวัดไม่ครบ + นัดร่าง = คำของวันนี้ (สวิตช์เปิด = สวิตช์ปิด · ยามทองของ S2a)
  const measuring = [onsiteReady('z1', 'Studio 01'), onsiteReady('z2', 'Studio 02', { parts: [] })];
  const { method: a, ...on } = card(measuring, { ...METHOD_ON, siteVisitReached: false, visit: draft });
  const { method: b, ...was } = card(measuring, { visit: draft });
  assert.deepEqual([on.status, on.progress], [was.status, was.progress]);
});

test('head-r3-2 (รีวิวรอบสี่): ผู้วางคิวที่ได้ `siteVisitReached` จาก GET — นัดล่าสุดยกเลิก/เข้าไม่ได้ = "รอลงคิวเข้าพื้นที่" เหมือนหัวหน้า', () => {
  /* 🐞 เดิม GET ถามเรื่องนี้ให้หัวหน้าคนเดียว ⇒ ผู้วางคิวได้ `null` = "ไม่ทราบ" ⇒ "พร้อมส่งผลให้ฝ่ายขาย" + แถบเขียวเต็ม ข้างบรรทัดขั้น
     "SV-… ยกเลิก — รอ TS ลงคิวใหม่" · ยามฝั่ง GET อยู่ที่ `surveyMethodRegistry.test.mjs` (ผู้วางคิวได้ค่าเดียวกับหัวหน้า) */
  const PLANNER = { canWrite: true, canDecide: false };
  for (const zones of [[onsiteReady('z1', 'Studio 01')], [onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby')]]) {
    for (const status of ['cancelled', 'unable']) {
      const args = { ...METHOD_ON, siteVisitReached: false, visit: visitOf(status) };
      const mine = card(zones, { ...args, viewer: PLANNER });
      const heads = card(zones, args);
      assert.deepEqual([mine.status.key, mine.status.headline, mine.progress.complete], ['queue', 'รอลงคิวเข้าพื้นที่', false], status);
      assert.deepEqual([mine.status.headline, mine.step.index], [heads.status.headline, heads.step.index], status);
      // บรรทัดเตือนแถว 17a ยังเป็นของคนที่ส่งผลได้ — ผู้วางคิวได้เหตุเรื่องสิทธิ์ตามเดิม
      assert.equal(mine.send.reason.key, 'no-permission', status);
    }
  }
  // GET อ่านไม่สำเร็จ (null) + มีนัด = ยังไม่ทราบ ⇒ ทางเดิม (ไม่เดาว่าไม่มีนัด)
  assert.equal(card([onsiteReady('z1', 'Studio 01')], { ...METHOD_ON, siteVisitReached: null, visit: visitOf('cancelled'), viewer: PLANNER }).status.key, 'ready');
});

test('head-r3-2 (รีวิวรอบห้า): ใบที่ถูกดึงกลับ + ยังไม่มีนัดที่เข้าพื้นที่ — กติกาเดียวกับใบที่ไม่เคยส่ง · คำเดียวกับหน้าคำร้อง', () => {
  /* route ดึงกลับเขียน `status='acknowledged'` + ล้าง `answeredAt` (`api/service/surveys/[id]/recall/route.js`) ⇒ ใบที่ส่งไปก่อนมีนัดที่เข้าพื้นที่
     (ส่งตอนสวิตช์ปิด · ส่งตอนยังเป็นจากแบบ) แล้วถูกดึงกลับ ติดแถว 17a เท่ากับใบที่ไม่เคยส่ง
     🐞 เดิมสาขา "ดึงผลกลับมาแก้" มาก่อน ⇒ "วัดครบแล้ว · รอหัวหน้าส่งผลอีกครั้ง" + แถบเขียวเต็ม ข้างเหตุ "ยังไม่มีนัดที่เข้าพื้นที่ — ลงคิวก่อน"
        ขณะที่หน้าคำร้องของใบเดียวกันขึ้น "รอลงคิวเข้าพื้นที่" (ยามที่ผู้ตรวจเขียนไว้ · skeptic1/recalled-fail) */
  const SITE_VISIT = 'ใบนี้มีพื้นที่ลงหน้างาน (Studio 01) แต่ยังไม่มีนัดที่เข้าพื้นที่ — ลงคิวก่อน หรือเปลี่ยนพื้นที่นั้นเป็นประเมินจากแบบ';
  const RECALL = { at: '2026-10-09T02:00:00.000Z', byName: 'หัวหน้า ก', reason: 'แก้ตัวเลข', totals: null };
  const recalledReq = request({ answeredAt: null });
  const draft = visitOf('draft', { actualDate: null });
  for (const [name, zones, visit, key, headline, sub] of [
    ['ใบลงหน้างานล้วนที่ไม่เคยสลับ · ไม่มีนัด', [onsiteReady('z1', 'Studio 01')], null, 'queue', 'รอลงคิวเข้าพื้นที่', 'วัดแล้ว 1 / 1 พื้นที่'],
    ['ใบลงหน้างานล้วน · นัดล่าสุดยกเลิก', [onsiteReady('z1', 'Studio 01')], visitOf('cancelled'), 'queue', 'รอลงคิวเข้าพื้นที่', 'วัดแล้ว 1 / 1 พื้นที่'],
    ['ใบผสม · ไม่มีนัด', [onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby')], null, 'queue', 'รอลงคิวเข้าพื้นที่',
      'วัดแล้ว 1 / 1 พื้นที่ · จากแบบ 1 (หัวหน้ากรอกเอง)'],
    ['ใบลงหน้างานล้วน · นัดร่าง', [onsiteReady('z1', 'Studio 01')], draft, 'visit-draft', 'นัดยังไม่ขึ้นตาราง', 'วัดแล้ว 1 / 1 พื้นที่'],
  ]) {
    const v = card(zones, { ...METHOD_ON, request: recalledReq, recall: RECALL, visit, siteVisitReached: false });
    assert.deepEqual(v.status, { key, tone: 'warning', headline, sub }, name);
    assert.equal(v.progress.complete, false, `${name}: แถบไม่ขึ้นเขียวเต็ม`);
    assert.equal(v.progress.percent, 100, `${name}: ตัวเลขของแถบเท่าเดิม`);
    // เหตุใต้ปุ่มคงเดิม (แถว 17a) · ปุ่มยังเป็นปุ่มส่งรอบใหม่
    assert.deepEqual([v.send.allowed, v.send.reason.key, v.send.reason.text], [false, 'site-visit', SITE_VISIT], name);
    assert.equal(v.send.label, 'ส่งผลให้ฝ่ายขายอีกครั้ง', name);
    // เรื่องดึงกลับยังอยู่บนการ์ด — กล่อง "ดึงกลับเพราะ" · ธง · แต่บรรทัดใต้ขั้น "ลงคิว / นัด" ไม่บอก "รอส่งอีกครั้ง"
    assert.ok(v.notices.some((n) => n.key === 'recall'), name);
    assert.equal(v.flags.recallPending, true, name);
    assert.doesNotMatch(String(v.step.hint), /รอส่งอีกครั้ง/, name);
    // หน้าคำร้องของใบเดียวกัน: พาดหัวคำเดียวกัน · รางสองจออยู่ขั้นเดียวกัน
    const page = job(withZones(zones, {
      committedDueDate: '2026-10-12', committedResultDate: '2026-10-12', dueCommittedAt: '2026-10-06T09:00:00Z',
      surveyVisit: visit, surveyRecall: RECALL,
    }));
    if (visit?.status !== 'cancelled') assert.equal(page.now.headline, headline, `${name}: หน้าคำร้อง`);
    assert.equal(page.index, v.step.index, `${name}: ขั้นเดียวกัน`);
  }
  // ทางเดิม: สวิตช์ปิด (route ไม่ถามแถว 17a) = "ดึงผลกลับมาแก้" ทุกตัวอักษร · มีนัดที่เข้าพื้นที่แล้ว = ดึงกลับตามเดิม ·
  //          ใบลงหน้างานล้วนที่ไม่เคยสลับและยังวัดไม่ครบ = ดึงกลับ (เหมือนใบที่ไม่เคยส่ง — ทางนี้เฉพาะแบบ ก)
  const zones = [onsiteReady('z1', 'Studio 01')];
  const off = card(zones, { request: recalledReq, recall: RECALL, siteVisitReached: false });
  assert.deepEqual([off.status.key, off.status.sub, off.progress.complete], ['recalled', 'วัดครบแล้ว · รอหัวหน้าส่งผลอีกครั้ง', true]);
  assert.match(off.step.hint, /รอส่งอีกครั้ง$/, 'สวิตช์ปิด = บรรทัดใต้ขั้นเดิม');
  const reached = card(zones, { ...METHOD_ON, request: recalledReq, recall: RECALL, siteVisitReached: true, visit: visitOf('done') });
  assert.deepEqual([reached.status.key, reached.progress.complete], ['recalled', true]);
  const gaps = card([onsiteReady('z1', 'Studio 01', { packageQty: null })], { ...METHOD_ON, request: recalledReq, recall: RECALL, siteVisitReached: false });
  assert.equal(gaps.status.key, 'recalled');
  // ส่งรอบสองไปแล้ว (มี `answeredAt`) = ไม่ใช่ใบที่ค้างดึงกลับ
  const resent = card(zones, {
    ...METHOD_ON, request: request({ status: 'answered', answeredAt: '2026-10-10T03:00:00Z' }), recall: RECALL, siteVisitReached: false,
  });
  assert.equal(resent.status.key, 'sent');
});

test('head-r3-2 · สัญญาของ "เคยสลับ": แถวลงหน้างานที่มีเวลาสลับและลบเวลาบันทึก = ค้างเสมอ ไม่ว่าแถวจะมีขนาด/ผัง/แพ็คเกจหรือไม่', () => {
  /* การ์ดถาม "แถวนี้เคยสลับวิธีไหม" ผ่าน `surveyZoneSwitchedToOnsite` ของโมดูลใบ (surveyControl.js เอ่ยชื่อคอลัมน์ไม่ได้ — ด่าน ⑤)
     ⇒ ตัวอ่านนั้นเพิ่มเงื่อนไขเมื่อไร (เช่น ข้ามแถวที่ยังไม่มีขนาด) ยามนี้แดงก่อน — ไม่งั้น S06 desk-back-to-onsite ถอยกลับเป็น "พร้อมส่งผล" เงียบ ๆ
     · `surveyZoneSwitchedToOnsite` = `surveyZoneNeedsResave` บนแถวที่ลบเวลาบันทึก ทุกแถวของยามนี้ (ตัวช่วยเดิมของการ์ด) */
  const switched = (extra) => switchedBack('z1', 'Studio 01', { surveyedAt: null, ...extra });
  for (const [name, row] of [
    ['ครบทุกช่อง', switched({})],
    ['ยังไม่มีขนาด', switched({ parts: [] })],
    ['ยังไม่เคาะแพ็คเกจ', switched({ packageQty: null, packageSize: null })],
    ['ไม่มีจุด', switched({ spots: [] })],
  ]) {
    assert.equal(surveyZoneNeedsResave(row), true, name);
    // บันทึกใหม่หลังสลับแล้วก็ยัง "เคยสลับ" — ใบไม่หลุดจากทาง "รอลงคิว" เพราะหัวหน้ากดบันทึก (ผลรีวิวรอบสอง)
    for (const r of [row, { ...row, surveyedAt: '2026-10-10T03:00:00.000Z' }]) assert.equal(surveyZoneSwitchedToOnsite(r), true, name);
    const v = card([row, drawingReady('z2', 'Lobby')], { ...METHOD_ON, siteVisitReached: false });
    assert.equal(v.status.key, 'queue', name);
  }
  // ไม่เคยสลับ / พื้นที่จากแบบ = ไม่ใช่
  assert.equal(surveyZoneNeedsResave({ ...onsiteReady('z1', 'Studio 01'), surveyedAt: null }), false);
  assert.equal(surveyZoneNeedsResave({ ...drawingReady('z1', 'Lobby'), methodChangedAt: '2026-10-09T03:00:00.000Z', surveyedAt: null }), false);
  assert.equal(surveyZoneSwitchedToOnsite(onsiteReady('z1', 'Studio 01')), false);
  assert.equal(surveyZoneSwitchedToOnsite({ ...drawingReady('z1', 'Lobby'), methodChangedAt: '2026-10-09T03:00:00.000Z' }), false);
  assert.equal(surveyZoneSwitchedToOnsite(null), false);
  assert.match(read('lib/service/surveyControl.js'), /\|\| active\.some\(surveyZoneSwitchedToOnsite\)/, 'การ์ดถามตัวอ่านที่มีชื่อ');
});

test('head-r3-2 · ทางเดิม: สวิตช์ปิด · มีนัดที่เข้าพื้นที่แล้ว · นัดยังถือคิว · ไม่ทราบ · รอรับเรื่อง · ใบลงหน้างานล้วนที่ไม่เคยสลับ', () => {
  const zones = [onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby')];
  const ready = { key: 'ready', tone: 'info', headline: 'พร้อมส่งผลให้ฝ่ายขาย', sub: '2 พื้นที่ · 40 ตร.ม. · 2 แพ็คเกจ (SM 2)' };
  assert.deepEqual(card(zones, { siteVisitReached: false }).status, ready, 'สวิตช์ปิด — route ไม่ถามด่าน 17a ใบนี้ส่งได้จริง');
  assert.deepEqual(card(zones, { ...METHOD_ON, siteVisitReached: true }).status, ready, 'มีนัดที่เข้าพื้นที่แล้ว');
  assert.deepEqual(card(zones, { ...METHOD_ON, siteVisitReached: false, visit: visitOf('done') }).status, ready, 'นัดของการ์ดปิดแบบเข้าแล้ว');
  assert.deepEqual(card(zones, { ...METHOD_ON, siteVisitReached: null, visit: visitOf('unable') }).status, ready, 'ไม่ทราบ ≠ ไม่มีนัด');
  assert.equal(card(zones, { ...METHOD_ON, siteVisitReached: false, visit: visitOf('scheduled') }).status.key, 'ready', 'นัดไว้ = ส่งผลปิดนัดให้');
  assert.equal(card(zones, { ...METHOD_ON, siteVisitReached: false, visit: visitOf('in_progress') }).status.key, 'ready');
  const pending = card(zones, { ...METHOD_ON, siteVisitReached: false, request: request({ status: 'pending', acknowledgedAt: null }) });
  assert.notEqual(pending.status.key, 'queue', 'ใบรอรับเรื่องยังไม่มีคิวให้ลง');
  assert.equal(card(zones, { ...METHOD_ON, siteVisitReached: false }).progress.percent, 100, 'ตัวเลขของแถบเท่าเดิม');

  /* 🔴 ใบลงหน้างานล้วนที่ไม่เคยสลับวิธีและ **ยังวัดไม่ครบ** — สวิตช์เปิดต้องได้คำตอบเดียวกับสวิตช์ปิด (ยามทองของงวด S2a)
     · ใบแบบนี้ที่ครบแล้วแต่ติดแถว 17a อย่างเดียวเป็น "รอลงคิวเข้าพื้นที่" (เทสต์รีวิวรอบสามข้างบน) */
  const onsite = [onsiteReady('z1', 'Studio 01'), onsiteReady('z2', 'Studio 02', { parts: [] })];
  for (const siteVisitReached of [false, null]) {
    const { method: a, ...on } = card(onsite, { ...METHOD_ON, siteVisitReached });
    const { method: b, ...off } = card(onsite);
    assert.deepEqual(on.status, off.status, String(siteVisitReached));
    assert.deepEqual(on.progress, off.progress, String(siteVisitReached));
  }
});

// ══ head-r3-53 — เหตุใต้ปุ่มของใบผสมแยก "รอช่าง:" / "หัวหน้าต้องทำ:" + แถวผังนับพื้นที่ลงหน้างาน ═══════════════

test('head-r3-53: ใบผสม — สองฝั่งขาด / ฝั่งช่างอย่างเดียว / ฝั่งหัวหน้าอย่างเดียว · ใบลงหน้างานล้วนประโยคเดิม', () => {
  const done = visitOf('done');
  const both = card([onsiteReady('z1', 'Studio 01', { parts: [] }), onsiteReady('z2', 'Studio 02'), drawingReady('z3', 'Lobby', { parts: [] })], { visit: done });
  assert.equal(both.send.reason.text, 'ยังส่งไม่ได้ — ติด 2 ข้อ · รอช่าง: Studio 01 · หัวหน้าต้องทำ: Lobby', 'ขนาด + ภาพแบบ');
  assert.equal(both.send.reason.key, 'crew-gaps', 'key เท่าเดิม');

  const crewOnly = card([onsiteReady('z1', 'Studio 01', { parts: [] }), drawingReady('z2', 'Lobby')], { visit: done });
  assert.equal(crewOnly.send.reason.text, 'ยังส่งไม่ได้ — ติด 1 ข้อ · รอช่าง: Studio 01');

  // พื้นที่ลงหน้างานที่เหลือแต่ของหัวหน้า (แพ็คเกจ) อยู่ท่อนของหัวหน้าด้วย · พื้นที่หนึ่งขึ้นท่อนเดียว
  const headOnly = card([onsiteReady('z1', 'Studio 01', { packageQty: null }), drawingReady('z2', 'Lobby', { parts: [] })], { visit: done });
  assert.equal(headOnly.send.reason.text, 'ยังส่งไม่ได้ — ติด 3 ข้อ · หัวหน้าต้องทำ: Studio 01 · Lobby', 'แพ็คเกจ + ขนาด + ภาพแบบ');
  assert.equal(headOnly.send.reason.key, 'head-gaps');

  // 🔴 ใบลงหน้างานล้วน — "… ที่ {ชื่อ} · รอช่างเก็บงาน" ตัวเดิม
  const onsite = card([onsiteReady('z1', 'Studio 01', { parts: [] }), onsiteReady('z2', 'Studio 02', { packageQty: null })], { visit: done });
  assert.equal(onsite.send.reason.text, 'ยังส่งไม่ได้ — ติด 2 ข้อ ที่ Studio 01 · Studio 02 · รอช่างเก็บงาน');
  // ใบจากแบบทั้งใบ — "ที่ …" ตัวเดิม
  const desk = card([drawingReady('z1', 'Lobby', { parts: [] }), drawingReady('z2', 'Lounge')]);
  assert.equal(desk.send.reason.text, 'ยังส่งไม่ได้ — ติด 2 ข้อ ที่ Lobby', 'ขนาด + ภาพแบบ');
});

test('head-r3-53: แถว "ภาพผังที่มาร์กจุดแล้ว" ของใบผสมไม่นับพื้นที่จากแบบที่มีภาพแบบแล้ว — ผ่าน/ไม่ผ่านของด่านเท่าเดิม', () => {
  const zones = [onsiteReady('z1', 'Studio 01'), onsiteReady('z2', 'Studio 02'), drawingReady('z3', 'Lobby')];
  const files = { ...filesFor(zones), z2: [WIDE, SPOT] };
  const raw = surveyGateChecklist(zones, files).find((g) => g.key === 'plan');
  assert.deepEqual([raw.ok, raw.done, raw.total, raw.zones], [false, 2, 3, ['Studio 02']], 'ตัวตรวจของ server ไม่เปลี่ยน');
  const shown = card(zones, { filesByZone: files, visit: visitOf('done') }).gates.find((g) => g.key === 'plan');
  assert.deepEqual([shown.ok, shown.done, shown.total, shown.zones], [false, 1, 2, ['Studio 02']]);
  // พื้นที่จากแบบที่ยังขาดภาพแบบยังอยู่ในแถว (ไม่ปล่อยแถวเขียวทั้งที่ปุ่มส่งติด) — total − done = จำนวนชื่อที่ขาด
  const lacking = { ...filesFor(zones), z3: [] };
  const row = surveyPlanGateShown(surveyGateChecklist(zones, lacking).find((g) => g.key === 'plan'), zones, lacking);
  assert.deepEqual([row.ok, row.done, row.total, row.zones], [false, 2, 3, ['Lobby']]);
  // ใบลงหน้างานล้วน / ใบจากแบบทั้งใบ / ข้ออื่น = ออบเจ็กต์ตัวเดิม
  const onsite = [onsiteReady('z1', 'Studio 01')];
  const plain = surveyGateChecklist(onsite, filesFor(onsite)).find((g) => g.key === 'plan');
  assert.equal(surveyPlanGateShown(plain, onsite, filesFor(onsite)), plain);
  const size = surveyGateChecklist(zones, files).find((g) => g.key === 'size');
  assert.equal(surveyPlanGateShown(size, zones, files), size);
});

// ══ sales-q8 · head-rc-q11 · sales-q2 — หน้าคำร้อง ═══════════════════════════════════════

test('sales-q8: ขั้นเข้าพื้นที่ของใบผสมหลังช่างส่งงาน = "วัดครบ a / b พื้นที่ · จากแบบ k" · ใบลงหน้างานบรรทัดเดิม', () => {
  const reached = visitOf('done', { actualStartTime: '10:12:00', actualEndTime: '11:40:00' });
  const mixed = job(withZones([onsiteReady('z1', 'Studio 01'), onsiteReady('z2', 'Studio 02'), drawingReady('z3', 'Lobby')], { surveyVisit: reached }));
  const visitStep = mixed.steps.find((s) => s.id === 'acknowledged');
  assert.deepEqual(visitStep.lines.map((l) => l.text), ['ส่งงาน 11:40 · วัดครบ 2 / 2 พื้นที่ · จากแบบ 1']);
  const onsite = job(withZones([onsiteReady('z1', 'Studio 01'), onsiteReady('z2', 'Studio 02')], { surveyVisit: reached }));
  assert.deepEqual(onsite.steps.find((s) => s.id === 'acknowledged').lines.map((l) => l.text), ['ส่งงาน 11:40 · วัดครบ 2 / 2 พื้นที่']);
});

test('head-rc-q11: การ์ดด่านฝั่งหัวหน้าของใบผสมเปิดตั้งแต่ก่อนช่างส่งงาน · ใบลงหน้างานล้วนรอช่างตามเดิม', () => {
  const scheduled = visitOf('scheduled');
  const mixed = job(withZones([onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby')], { surveyVisit: scheduled }));
  assert.deepEqual(mixed.zones.headGate.badge, { label: 'ครบ', tone: 'success' }, 'ข้อของหัวหน้าครบทุกพื้นที่');
  assert.equal(mixed.zones.headGate.text, 'กรอกขนาดจากแบบแล้ว 1 / 1 พื้นที่ · ภาพแบบ 1/1 · ภาพผัง 1/1 · เลือกจุด 1/1 · แพ็คเกจ 2/2');
  const working = job(withZones([onsiteReady('z1', 'Studio 01'), drawingEmpty('z2', 'Lobby')], { surveyVisit: scheduled }));
  assert.deepEqual(working.zones.headGate.badge, { label: 'รอเคาะ', tone: 'info' });
  assert.match(working.zones.headGate.text, /^กรอกขนาดจากแบบแล้ว 0 \/ 1 พื้นที่ · /);
  assert.doesNotMatch(JSON.stringify([mixed.zones.headGate, working.zones.headGate]), /ยังไม่เริ่ม|เริ่มได้เมื่อช่างส่งงาน/);
  // 🔴 ใบลงหน้างานล้วน: ยังรอช่างส่งงาน
  const onsite = job(withZones([onsiteReady('z1', 'Studio 01', { packageQty: null })], { surveyVisit: scheduled }));
  assert.deepEqual([onsite.zones.headGate.badge.label, onsite.zones.headGate.text], ['ยังไม่เริ่ม', 'เริ่มได้เมื่อช่างส่งงาน']);
});

test('head-rc-q11 (รีวิวรอบสอง): ใบผสมที่พื้นที่จากแบบมีภาพแบบ + แพ็คเกจแล้วแต่ยังไม่มีขนาด — ป้ายไม่ขึ้น "ครบ" ข้าง "0 / 1"', () => {
  const zones = [onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby', { parts: [] })];
  const view = job(ask({ surveyZones: zones, surveyFilesByZone: { ...filesFor(zones), z2: [PLAN] }, surveyVisit: visitOf('scheduled') }));
  assert.equal(view.zones.headGate.text, 'กรอกขนาดจากแบบแล้ว 0 / 1 พื้นที่ · ภาพแบบ 1/1 · ภาพผัง 1/1 · เลือกจุด 1/1 · แพ็คเกจ 2/2');
  assert.deepEqual(view.zones.headGate.badge, { label: 'รอเคาะ', tone: 'info' });
  assert.equal(view.zones.headGate.ok, false, 'แถวรวมของตารางอ่าน `ok` ตัวนี้ ("หัวหน้ายังไม่เคาะ")');
  // ภาพแบบของพื้นที่จากแบบมีที่ของตัวเอง — ขาดแล้วขึ้นที่ "ภาพแบบ" ไม่ใช่นับเป็น "ภาพผัง 1/2" (ผลรีวิวรอบสาม)
  const noDrawing = job(ask({ surveyZones: [onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby')],
    surveyFilesByZone: { ...filesFor(zones), z2: [] }, surveyVisit: visitOf('scheduled') }));
  assert.equal(noDrawing.zones.headGate.text, 'กรอกขนาดจากแบบแล้ว 1 / 1 พื้นที่ · ภาพแบบ 0/1 · ภาพผัง 1/1 · เลือกจุด 1/1 · แพ็คเกจ 2/2');
  assert.deepEqual([noDrawing.zones.headGate.ok, noDrawing.zones.headGate.badge.label], [false, 'รอเคาะ']);
  assert.deepEqual(noDrawing.zones.headGate.items.find((i) => i.key === 'plan'), {
    key: 'plan', label: 'ภาพผัง', ok: true, done: 1, total: 1, zones: [],
  }, 'แถวผังของการ์ดนี้นับพื้นที่ลงหน้างานล้วน');
  // ใบจากแบบทั้งใบ / ใบลงหน้างานล้วน — `ok` ตัวเดิมของการ์ด
  const desk = job(withZones([drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge')]));
  assert.deepEqual([desk.zones.headGate.ok, desk.zones.headGate.badge.label], [true, 'ครบ']);
  const onsite = job(withZones([onsiteReady('z1', 'Studio 01')], { surveyVisit: visitOf('done') }));
  assert.deepEqual([onsite.zones.headGate.ok, onsite.zones.headGate.badge.label], [true, 'ครบ']);
});

test('sales-q2: กล่องขั้นของงานจากแบบ — รับปากวันส่งผล = หัวหน้า + "จะส่งผล {วัน}" · ประเมินจากแบบ = "กรอกขนาดจากแบบแล้ว a / k พื้นที่"', () => {
  const desk = [drawingReady('z1', 'Lobby'), drawingEmpty('z2', 'Lounge')];
  const view = job(withZones(desk, { committedDueDate: '2026-10-15', committedResultDate: '2026-10-15', dueCommittedAt: '2026-10-08T09:00:00Z' }));
  const [promise, assess] = [view.steps[2], view.steps[3]];
  assert.equal(assess.state, 'current');
  assert.deepEqual(promise.people, [{ name: 'Arnon Aunsapwilai', note: null }]);
  assert.deepEqual(promise.lines, [{ text: 'จะส่งผล พฤ. 15 ต.ค.', tone: null }]);
  assert.deepEqual(assess.lines, [{ text: 'กรอกขนาดจากแบบแล้ว 1 / 2 พื้นที่', tone: null }]);
  // คำเดียวกับแถบตอนนี้ (ไม่มีคำใหม่)
  assert.ok(view.now.sub.includes(assess.lines[0].text));
  assert.ok(view.now.headline.endsWith(promise.lines[0].text));
  // ยังไม่รับปากวัน — ขั้นยังไม่เกิด ไม่มีของ
  const queue = job(withZones(desk));
  assert.deepEqual([queue.steps[2].people, queue.steps[2].lines, queue.steps[3].lines], [[], [], []]);
});

// ══ sales-minor-3 — เลยวันส่งผลแล้วไม่ขึ้น "เร็วกว่าที่ขอ" ═══════════════════════════════════

test('sales-minor-3: committedVsRequested + today — วันที่รับปากผ่านไปแล้ว = ไม่มีบรรทัดเทียบ · ไม่ส่ง today = เดิม', () => {
  assert.deepEqual(committedVsRequested('2026-10-12', '2026-10-15'), { text: 'เร็วกว่าที่ขอ 3 วัน', tone: 'ok' });
  assert.deepEqual(committedVsRequested('2026-10-12', '2026-10-15', { today: '2026-10-12' }), { text: 'เร็วกว่าที่ขอ 3 วัน', tone: 'ok' }, 'วันนี้ยังไม่เลย');
  assert.equal(committedVsRequested('2026-10-12', '2026-10-15', { today: '2026-10-13' }), null);
  assert.equal(committedVsRequested('2026-10-12', '2026-10-10', { today: '2026-10-13' }), null, 'ช้ากว่าที่ขอก็ไม่พูด — กติกาเดียวกับขั้นลงคิว');
});

test('sales-minor-3: หน้าคำร้องที่เลยวันส่งผล — กล่องวันที่และช่อง "TS: วันส่งผล" ไม่มี "เร็วกว่าที่ขอ" (งานจากแบบและใบลงหน้างาน)', () => {
  const promised = { committedDueDate: '2026-10-10', committedResultDate: '2026-10-10', dueCommittedAt: '2026-10-08T09:00:00Z' };
  const desk = [drawingReady('z1', 'Lobby'), drawingEmpty('z2', 'Lounge')];
  const late = job(withZones(desk, promised), {}, '2026-10-12');
  assert.equal(late.stage, 'desk-overdue');
  assert.equal(late.now.due.note, '');
  assert.equal(late.facts.find((f) => f.key === 'committedResultDue').sub, null);
  assert.doesNotMatch(JSON.stringify([late.now, late.facts]), /เร็วกว่าที่ขอ/);
  // ยังไม่เลย = บรรทัดเดิม
  const onTime = job(withZones(desk, promised), {}, '2026-10-09');
  assert.equal(onTime.now.due.note, 'เร็วกว่าที่ขอ 5 วัน');
  assert.equal(onTime.facts.find((f) => f.key === 'committedResultDue').sub, 'เร็วกว่าที่ขอ 5 วัน');
  // ใบลงหน้างานใช้กติกาเดียวกัน
  const onsite = job(withZones([onsiteReady('z1', 'Studio 01', { parts: [] })], { ...promised, surveyVisit: visitOf('done') }), {}, '2026-10-12');
  assert.equal(onsite.facts.find((f) => f.key === 'committedResultDue').sub, null);
  assert.equal(onsite.now.due.note, '');
});

// ══ head-rc-r2-22 — ใบจากแบบที่พร้อมส่งอยู่ขั้นส่งผล ══════════════════════════════════════

test('head-rc-r2-22: ราง — งานโต๊ะที่รับปากแล้ว + deskReady = ขั้น 5/6 ส่งผล · ไม่ส่ง = ขั้น 4 ตามเดิม · ใบลงหน้างานไม่สนธงนี้', () => {
  const desk = request();
  assert.equal(requestRailSteps(desk, { visit: null, needsVisit: false }).index, 3);
  assert.equal(requestRailSteps(desk, { visit: null, needsVisit: false, deskReady: true }).index, 4);
  assert.equal(requestRailSteps(request({ committedResultDate: null }), { visit: null, needsVisit: false, deskReady: true }).index, 2, 'ยังไม่รับปาก');
  assert.equal(requestRailSteps(desk, { visit: null, needsVisit: true, deskReady: true }).index, 2, 'ใบที่ต้องมีนัดเดินตามนัดเหมือนเดิม');
});

test('head-rc-r2-22: การ์ด — ใบจากแบบทั้งใบที่ด่านผ่านครบชี้ "ส่งผล" (5/6) เหมือนใบผสมที่พร้อมส่ง · หน้าคำร้องชี้ขั้นเดียวกันและไม่ติ๊กขั้นประเมิน "ข้าม"', () => {
  const ready = card([drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge')]);
  assert.deepEqual([ready.step.index + 1, ready.step.total, ready.step.label], [5, 6, 'ส่งผล']);
  const mixed = card([onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby')], { visit: visitOf('done') });
  assert.deepEqual([mixed.step.index, mixed.step.label], [ready.step.index, ready.step.label]);
  const working = card([drawingReady('z1', 'Lobby'), drawingEmpty('z2', 'Lounge')]);
  assert.deepEqual([working.step.index + 1, working.step.label], [4, 'ประเมินจากแบบ']);

  const page = job(withZones([drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge')], {
    committedDueDate: '2026-10-15', committedResultDate: '2026-10-15', dueCommittedAt: '2026-10-08T09:00:00Z',
  }));
  assert.equal(page.current.id, 'answered');
  assert.deepEqual(page.steps.map((s) => s.state), ['done', 'done', 'done', 'done', 'current', 'pending']);
});

test('head-rc-r2-22 (รีวิวรอบสี่): การ์ดใบจากแบบทั้งใบ — รางที่ขั้น "ส่งผล" ไม่อยู่ข้างพาดหัว "กำลังประเมินจากแบบ" · รางที่ขั้นประเมินไม่อยู่ข้าง "พร้อมส่งผล"', () => {
  /* 🐞 รอบสาม: ติดเฉพาะเอกสาร (เช่นผู้ส่งยังไม่มีลายเซ็น) = รางของการ์ดขึ้น "ขั้น 5/6 · ส่งผล" (`deskReady` ไม่นับเหตุของเอกสาร) ขณะที่พาดหัว
     ยังเป็น "กำลังประเมินจากแบบ — 2/2 พื้นที่" ⇒ ยามนี้ไล่ทุกสภาพของงานโต๊ะ ทั้งสวิตช์เปิดและปิด */
  const doc = (blockers) => ({
    access: { customer: true, internal: true, issue: true, draft: true, history: true },
    issueAtSend: true, storeAllowed: true, state: 'not_sent', current: null, history: [], nextDocNo: null,
    send: { blockers, warnings: [], unknown: false }, issue: null,
  });
  const SIGN = 'ยังไม่มีลายเซ็นของ หัวหน้า ก — บันทึกลายเซ็นที่หน้าโปรไฟล์ก่อนส่งผล';
  const all = [drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge')];
  const half = [drawingReady('z1', 'Lobby'), drawingEmpty('z2', 'Lounge', { parts: [part(4, 5, 3)] })];
  const seen = new Set();
  for (const [name, zones, extra] of [
    ['พร้อมส่ง', all, {}],
    ['เอกสารผ่าน', all, { document: doc([]) }],
    ['ติดเฉพาะเอกสาร', all, { document: doc([SIGN]) }],
    ['ทะเบียนขนาดอ่านไม่ขึ้น', all, { packageSizes: null }],
    ['ทะเบียนอ่านไม่ขึ้น + เอกสาร', all, { packageSizes: null, document: doc([SIGN]) }],
    ['ยังกรอกไม่ครบ', half, {}],
    ['ยังกรอกไม่ครบ + เอกสาร', half, { document: doc([SIGN]) }],
  ]) {
    for (const flag of [{}, METHOD_ON]) {
      const v = card(zones, { ...flag, ...extra });
      seen.add(v.step.id);
      if (v.step.id === 'answered') assert.doesNotMatch(v.status.headline, /^กำลังประเมินจากแบบ/, name);
      else assert.notEqual(v.status.key, 'ready', name);
    }
  }
  assert.deepEqual([...seen].sort(), ['acknowledged', 'answered'], 'ยามเดินผ่านทั้งสองขั้น');
});

test('head-rc-r2-22 (รีวิวรอบห้า): ทะเบียนขนาด — การ์ด · แถบตอนนี้ · ไทม์ไลน์ · รางของเปลือก ชี้ขั้นเดียวกันทั้งทะเบียนปกติ ขนาดถูกลบ และทะเบียนอ่านไม่ขึ้น', () => {
  /* 🐞 ผู้ตรวจ: ใบจากแบบทั้งใบที่เคาะ SM สองพื้นที่ แล้ว SM ถูกลบจากทะเบียน (หรือทะเบียนอ่านไม่ขึ้นบนจอใบประเมิน) — การ์ด "กำลังประเมินจากแบบ — 2/2" ขั้น 4/6
     ขณะที่หน้าคำร้อง (ไม่มีทะเบียน · `skipPackageRegistry`) ขึ้นขั้น "ส่งผล" + "พร้อมส่งผลให้ฝ่ายขาย" + รางของเปลือกขั้น 5
     ⇒ กติกา: ขั้นของงานโต๊ะถามเฉพาะด่านที่สองจอเห็นตรงกัน (`deskGatesPass`) · ด่านทะเบียนเป็นเหตุของขั้นส่งผล (เหมือนเหตุของเอกสาร) */
  const promised = { committedDueDate: '2026-10-15', committedResultDate: '2026-10-15', dueCommittedAt: '2026-10-08T09:00:00Z' };
  const shellRail = (req) => requestRailSteps(req, { hasItems: false, deskReady: surveyRequestDeskReady(req, { today: TODAY }) }).index;
  const NO_SM = SIZES.filter((s) => s.code !== 'SM');
  const all = [drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge')];
  const page = job(withZones(all, promised));
  const shell = shellRail(withZones(all, { ...promised, surveyNeedsVisit: false }));
  // หน้าคำร้องตอบเหมือนกันทุกกรณี (ไม่มีทะเบียนให้ถาม) — ขั้นส่งผล
  assert.deepEqual([page.stage, page.current.id, page.index, shell], ['ready', 'answered', 4, 4]);
  assert.equal(page.now.headline, 'พร้อมส่งผลให้ฝ่ายขาย');

  for (const [name, sizes, status] of [
    ['ทะเบียนปกติ', SIZES, { key: 'ready', tone: 'info', headline: 'พร้อมส่งผลให้ฝ่ายขาย', sub: '2 พื้นที่ · 40 ตร.ม. · 2 แพ็คเกจ (SM 2)' }],
    ['SM ถูกลบจากทะเบียน', NO_SM, {
      key: 'desk-working', tone: 'warning', headline: 'ประเมินจากแบบครบแล้ว — ขนาดแพ็คเกจต้องเลือกใหม่', sub: 'เหลือ Lobby · Lounge',
    }],
    ['ทะเบียนอ่านไม่ขึ้น', null, {
      key: 'desk-working', tone: 'warning', headline: 'ประเมินจากแบบครบแล้ว — อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ', sub: '',
    }],
  ]) {
    for (const flag of [{}, METHOD_ON]) {
      const v = card(all, { ...flag, packageSizes: sizes });
      assert.deepEqual(v.status, status, name);
      // รางของการ์ด = ไทม์ไลน์ของหน้าคำร้อง = รางของเปลือก (ขั้น 5/6 ส่งผล)
      assert.deepEqual([v.step.id, v.step.index, v.step.label], ['answered', page.index, 'ส่งผล'], name);
      assert.equal(v.step.index, shell, name);
      // ปุ่มส่งยังเชื่อทะเบียน (fail-closed ตามเดิม) — ด่านย้ายแค่ขั้นของราง ไม่ได้เปิดทางส่ง
      assert.equal(v.send.allowed, sizes === SIZES, name);
    }
  }
  // ขนาดถูกลบ + เอกสารติด = ขนาดพูดก่อน (ลำดับเดียวกับ route ส่งผล) · เอกสารอย่างเดียว = คำเดิมของรอบสี่
  const doc = (blockers) => ({
    access: { customer: true, internal: true, issue: true, draft: true, history: true },
    issueAtSend: true, storeAllowed: true, state: 'not_sent', current: null, history: [], nextDocNo: null,
    send: { blockers, warnings: [], unknown: false }, issue: null,
  });
  const SIGN = 'ยังไม่มีลายเซ็นของ หัวหน้า ก — บันทึกลายเซ็นที่หน้าโปรไฟล์ก่อนส่งผล';
  const both = card(all, { packageSizes: NO_SM, document: doc([SIGN]) });
  assert.equal(both.status.headline, 'ประเมินจากแบบครบแล้ว — ขนาดแพ็คเกจต้องเลือกใหม่');
  assert.equal(both.step.id, 'answered');
  assert.deepEqual(card(all, { document: doc([SIGN]) }).status, {
    key: 'desk-working', tone: 'warning', headline: 'ประเมินจากแบบครบแล้ว — เอกสารประเมินยังออกไม่ได้', sub: 'เหลือแก้ข้อที่ทำให้เอกสารประเมินออกไม่ได้',
  });
  // ยังกรอกไม่ครบ + ขนาดถูกลบ = ขั้นประเมินทั้งสองจอ · พาดหัวของงานที่ยังเดิน
  const half = [drawingReady('z1', 'Lobby'), drawingEmpty('z2', 'Lounge')];
  const halfCard = card(half, { packageSizes: NO_SM });
  assert.deepEqual([halfCard.step.id, halfCard.status.headline, halfCard.status.sub], ['acknowledged', 'กำลังประเมินจากแบบ — 1/2 พื้นที่', 'เหลือ Lounge']);
  assert.deepEqual([job(withZones(half, promised)).index, shellRail(withZones(half, { ...promised, surveyNeedsVisit: false }))], [halfCard.step.index, halfCard.step.index]);
});

test('head-rc-r2-22 (รีวิวรอบสาม): หน้าคำร้องของใบจากแบบ — แถบ "ตอนนี้" กับขั้นปัจจุบันของไทม์ไลน์พูดเรื่องเดียวกัน', () => {
  const promised = { committedDueDate: '2026-10-15', committedResultDate: '2026-10-15', dueCommittedAt: '2026-10-08T09:00:00Z' };
  // พร้อมส่ง: ขั้นส่งผล + "พร้อมส่งผลให้ฝ่ายขาย" (คำเดียวกับใบผสมที่พร้อมส่ง) — ไม่ใช่ "กำลังประเมินจากแบบ"
  const ready = job(withZones([drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge')], promised));
  assert.deepEqual([ready.stage, ready.current.id, ready.now.headline], ['ready', 'answered', 'พร้อมส่งผลให้ฝ่ายขาย']);
  assert.match(ready.now.next, /กด “ส่งผลให้ฝ่ายขาย” ที่ใบประเมิน$/);
  /* นัดค้างบนงานโต๊ะที่ครบ (UAT S2b รอบสอง S09): การ์ดพาดหัว "ประเมินจากแบบครบแล้ว — นัด … ยังเปิดอยู่" (`desk-visit-open`)
     ⇒ หน้าคำร้องยังอยู่ขั้นส่งผล ไม่ถอยไป "กำลังประเมินจากแบบ" ข้างรางที่ชี้ขั้นส่งผล */
  const stray = job(withZones([drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge')], { ...promised, surveyVisit: visitOf('scheduled') }));
  assert.deepEqual([stray.stage, stray.current.id, stray.now.headline], ['ready', 'answered', 'พร้อมส่งผลให้ฝ่ายขาย']);
  assert.equal(ready.now.headlineKeep, undefined, 'พาดหัวไม่มีวันที่ให้ห่อ');
  assert.equal(ready.now.progress, null, 'ไม่มีมาตรวัดของช่าง (พื้นที่จากแบบไม่นับ)');
  assert.doesNotMatch(`${ready.now.sub} ${ready.now.next}`, /นัด|ช่าง|เข้าพื้นที่|ลงคิว/, 'ไม่มีคำของงานหน้างาน');
  const mixed = job(withZones([onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby')], { ...promised, surveyVisit: visitOf('done') }));
  assert.deepEqual([mixed.stage, mixed.current.id, mixed.now.headline], [ready.stage, ready.current.id, ready.now.headline]);
  // ยังกรอกไม่ครบ: ขั้นประเมินจากแบบ + "กำลังประเมินจากแบบ — จะส่งผล …" (ตามเดิม)
  const working = job(withZones([drawingReady('z1', 'Lobby'), drawingEmpty('z2', 'Lounge')], promised));
  assert.deepEqual([working.stage, working.current.id], ['desk-working', 'acknowledged']);
  assert.match(working.now.headline, /^กำลังประเมินจากแบบ — จะส่งผล /);
  // "ตาใคร" ของงานโต๊ะเป็นคนถือใบคนเดิมทุกขั้น (ไม่สลับเป็น "หัวหน้า TS" ตอนพร้อมส่ง) · ใบผสมคำเดิม
  assert.deepEqual([working.now.turn.who, ready.now.turn.who], ['Arnon Aunsapwilai', 'Arnon Aunsapwilai']);
  assert.equal(mixed.now.turn.who, 'หัวหน้า TS');
  // เลยวันส่งผลแล้ว: "เลยวันส่งผล" ยังพูดก่อน (โทนแดง) — บรรทัดรองชี้การส่งผล ตรงกับขั้นปัจจุบัน
  const late = job(withZones([drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge')], promised), {}, '2026-10-17');
  assert.deepEqual([late.stage, late.current.id, late.now.headline], ['desk-overdue', 'answered', 'เลยวันที่จะส่งผลมา 2 วัน']);
  assert.equal(late.now.turn.who, ready.now.turn.who);
  assert.match(late.now.sub, /ส่งผล หรือเลื่อนวันส่งผล$/);
  // ดึงผลกลับยังพูดก่อนทุกอย่าง (ทางเดิม)
  const recalled = job(withZones([drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge')], {
    ...promised, surveyRecall: { at: '2026-10-09T03:00:00Z', byName: 'หัวหน้า ก' },
  }));
  assert.equal(recalled.stage, 'recalled');
});

test('head-rc-r2-22 (รีวิวรอบสอง): สัญญาของ `surveyRequestDeskReady` — รางที่ได้ค่านี้ชี้ขั้นเดียวกับไทม์ไลน์ของหน้าคำร้อง', () => {
  /* `shellRail` ข้างล่าง = รูปการเรียกของเปลือก `app/requests/[id]/page.js` (การ์ด "จัดการคำร้อง" โหมดแก้ · อ่าน `surveyNeedsVisit` /
     `surveyVisit` จากแถวคำร้องของตัวโหลด) — ยามซอร์สท้ายเทสต์ยืนยันว่าเปลือกเรียกแบบนี้จริง (ต่อสายตอน Integrate) */
  const promised = { committedDueDate: '2026-10-15', committedResultDate: '2026-10-15', dueCommittedAt: '2026-10-08T09:00:00Z' };
  const shellRail = (req) => requestRailSteps(req, { hasItems: false, deskReady: surveyRequestDeskReady(req, { today: TODAY }) }).index;
  const ready = withZones([drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge')], { ...promised, surveyNeedsVisit: false });
  assert.equal(surveyRequestDeskReady(ready, { today: TODAY }), true);
  assert.deepEqual([shellRail(ready), job(ready).index], [4, 4], 'พร้อมส่ง = ขั้น 5 ทั้งสองราง');
  const working = withZones([drawingReady('z1', 'Lobby'), drawingEmpty('z2', 'Lounge')], { ...promised, surveyNeedsVisit: false });
  assert.equal(surveyRequestDeskReady(working, { today: TODAY }), false);
  assert.deepEqual([shellRail(working), job(working).index], [3, 3], 'ยังกรอกไม่ครบ = ขั้น 4 ทั้งสองราง');
  // ใบที่ต้องมีนัด / ไม่มีแถวพื้นที่ / ไม่มีใบ = false (รางเดิมทุกค่า)
  const mixed = withZones([onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby')], { ...promised, surveyVisit: visitOf('done') });
  assert.equal(surveyRequestDeskReady(mixed, { today: TODAY }), false);
  assert.equal(shellRail(mixed), job(mixed).index);
  assert.equal(surveyRequestDeskReady(ask({ surveyZones: undefined })), false);
  assert.equal(surveyRequestDeskReady(null), false);
  // เปลือกส่ง `deskReady` จริง — เฉพาะงานโต๊ะ (`deskJob`) · วันเดียวกับที่ไทม์ไลน์ของหน้าได้ (`today` ตัวเดียวกับ KindView)
  const shell = read('app/requests/[id]/page.js');
  assert.match(shell, /requestRailSteps\(req, \{\s*hasItems, deskReady: deskJob && surveyRequestDeskReady\(req, \{ today \}\),\s*\}\)/);
  assert.match(shell, /import \{ surveyIntakeSwitchNotes, surveyRequestDeskReady, surveyRequestDrawingSummary \} from "@\/lib\/service\/surveyJob";/);
  assert.equal((shell.match(/requestRailSteps\(/g) || []).length, 1, 'รางของเปลือกคิดที่เดียว');
});

// ══ S2b-O9 — ผลที่ฝ่ายขายเห็นบนใบจากแบบทั้งใบ ══════════════════════════════════════════════

const SENT = {
  status: 'answered', answeredAt: '2026-10-14T03:00:00Z', answeredByName: 'Arnon Aunsapwilai',
  committedDueDate: '2026-10-15', committedResultDate: '2026-10-15',
};

test('S2b-O9: view-model บอก `zones.drawingOnly` เฉพาะใบที่ส่งผลแล้วและทุกพื้นที่ที่ใช้อยู่เป็นจากแบบ', () => {
  const spots = [{ id: 's1', label: 'มุมซ้าย', selected: false }, { id: 's2', label: 'หน้าลิฟต์', selected: false }];
  const desk = job(withZones([drawingReady('z1', 'Lobby', { spots }), drawingReady('z2', 'Lounge')], SENT));
  assert.equal(desk.zones.drawingOnly, true);
  assert.equal(desk.zones.totals.spotsTotal, 2);
  const zero = job(withZones([drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge')], SENT));
  assert.deepEqual([zero.zones.drawingOnly, zero.zones.totals.spotsTotal], [true, 0]);
  // ใบผสม · ใบลงหน้างาน · ยังไม่ส่งผล = ไม่มีคีย์นี้เลย (รูปของผลลัพธ์เท่าเดิม)
  for (const [name, view] of [
    ['ใบผสม', job(withZones([onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby')], SENT))],
    ['ใบลงหน้างาน', job(withZones([onsiteReady('z1', 'Studio 01')], SENT))],
    ['ยังไม่ส่งผล', job(withZones([drawingReady('z1', 'Lobby')]))],
  ]) assert.equal(Object.hasOwn(view.zones, 'drawingOnly'), false, name);
  assert.equal(SURVEY_DRAWING_SPOTS_NOTE, 'จุดโดยประมาณจากแบบ');
});

test('S2b-O9: จอหน้าคำร้อง — หัวคอลัมน์ · ป้ายบนจอแคบ · ช่องรายแถว · แถวรวม · ช่องตัวเลข ใช้คำของใบจากแบบเมื่อ `drawingOnly` เท่านั้น', () => {
  const view = read('components/requests/details/SurveyRequestView.js');
  assert.match(view, /import \{ DRAWING_SPOT_LABEL \} from "@\/components\/service\/SurveyResultTable";/, 'คำเดียวกับตารางสรุปส่งผล ไม่พิมพ์ซ้ำ');
  const code = view.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal((code.match(/จุดติดตั้งโดยประมาณ/g) || []).length, 0, 'ไม่มีสตริงของคำนี้ในจอ (คอมเมนต์ไม่นับ)');
  assert.match(view, /const drawingOnly = sent && zones\.drawingOnly === true;/);
  assert.match(view, /const spotLabel = drawingOnly \? DRAWING_SPOT_LABEL : "จุดติดตั้ง";/);
  assert.match(view, /<th className="num">\{drawingOnly \? DRAWING_SPOT_LABEL : sent \? "จุดติดตั้ง \(เลือก \/ ทั้งหมด\)" : "จุดติดตั้งได้"\}<\/th>/);
  assert.equal((view.match(/<Cell label=\{spotLabel\} num longLabel=\{drawingOnly\}>\{spotText\(/g) || []).length, 2, 'ช่องรายแถว + แถวรวม');
  assert.match(view, /\? naText\(total \? `\$\{selected\} \/ \$\{total\}` : null\)\s*: naText\(total \? `\$\{total\} จุด` : null\)\);/);
  assert.match(view, /value=\{zones\.drawingOnly\s*\? naText\(zones\.totals\.spotsTotal \? `\$\{zones\.totals\.spotsTotal\} จุด` : null\)\s*: `\$\{zones\.totals\.spotsSelected\} \/ \$\{zones\.totals\.spotsTotal\}`\}/);
  assert.match(view, /note=\{zones\.drawingOnly \? SURVEY_DRAWING_SPOTS_NOTE : "เลือก \/ ที่ติดตั้งได้"\}/);
  assert.match(read('components/service/SurveyResultTable.js'), /\nexport const DRAWING_SPOT_LABEL = "จุดติดตั้งโดยประมาณ";\n/);
});

// ══ sales-q10b · sales-q10c — กล่องข้อมูลคำร้อง · พาดหัวบนมือถือ ═══════════════════════════════

test('sales-q10b: กล่องข้อมูลที่มีสี่ช่อง (งานจากแบบ) วาง 2 × 2 — ใบลงหน้างาน (หกช่อง) ไม่โดน · ไม่มีจุดตัดจอใหม่', () => {
  const css = read('components/requests/details/surveyRequest.module.css');
  const FOUR = '.facts:has(> div:nth-child(4):last-child)';
  assert.ok(css.includes(`${FOUR} {\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n}`));
  assert.ok(css.includes(`${FOUR} > div:nth-child(2n) {\n  border-right: 0;\n}`));
  assert.ok(css.includes(`${FOUR} > div:nth-last-child(-n + 2) {\n  border-bottom: 0;\n}`));
  assert.ok(css.includes(`\n${FOUR} {\n`), 'กฎอยู่นอกมีเดีย (ไม่เยื้อง) — ทุกความกว้าง');
  const desk = job(withZones([drawingReady('z1', 'Lobby')]));
  const onsite = job(withZones([onsiteReady('z1', 'Studio 01')]));
  assert.deepEqual([desk.facts.length, onsite.facts.length], [4, 6]);
});

test('sales-q10c: พาดหัว "กำลังประเมินจากแบบ — จะส่งผล {วัน}" ส่งท่อนวันที่ที่ห้ามขาด (`headlineKeep`) · จอห่อด้วย keepPhrases', () => {
  /* ใบที่ยังกรอกไม่ครบ — ใบที่ด่านผ่านครบเป็น "พร้อมส่งผลให้ฝ่ายขาย" แล้ว (head-rc-r2-22 · ผลรีวิวรอบสาม) */
  const working = job(withZones([drawingReady('z1', 'Lobby'), drawingEmpty('z2', 'Lounge')], {
    committedResultDate: '2026-10-12', committedDueDate: '2026-10-12',
  }));
  assert.equal(working.now.headline, 'กำลังประเมินจากแบบ — จะส่งผล จ. 12 ต.ค.');
  assert.deepEqual(working.now.headlineKeep, ['จ. 12 ต.ค.']);
  // ขั้นอื่นไม่มีคีย์นี้ (รูปของ `now` เท่าเดิม)
  assert.equal(Object.hasOwn(job(withZones([drawingReady('z1', 'Lobby')])).now, 'headlineKeep'), false);
  assert.equal(Object.hasOwn(job(withZones([onsiteReady('z1', 'Studio 01')])).now, 'headlineKeep'), false);
  const view = read('components/requests/details/SurveyRequestView.js');
  assert.match(view, /<p className=\{styles\.nowHeadline\}>\{keepPhrases\(job\.now\.headline, job\.now\.headlineKeep\)\}<\/p>/);
  assert.match(view, /import thaiText, \{ keepPhrases \} from "@\/components\/ThaiText";/);
});

// ══ head-r3-20 · head-r3-12 (ตาราง) — CSS ของตารางสรุปส่งผลบนมือถือ ═══════════════════════════

test('head-r3-20: แถวประโยคเตือนบนมือถือ — เยื้องเท่าเซลล์อื่น · ไม่มีเส้นซ้อน · แถวแม่ของแถวบันทึกชนไม่มีเส้นคั่น', () => {
  const css = read('components/service/SurveyResultTable.module.css');
  const mobile = css.slice(css.lastIndexOf('@media (max-width: 680px)'));
  // `min-height: 0` — กฎกลางของตารางบนจอแคบตั้งเซลล์ไว้ ≥ 52px ⇒ ประโยคบรรทัดเดียวเป็นแถบสูง (S04b 375 วัดได้ 65px)
  assert.match(mobile, /\.body tr\[data-miss-row\] > td \{ display: block; min-height: 0; padding-block: 0 var\(--space-2\); border-bottom: 0; \}/);
  assert.match(read('components/ui/Table.module.css'), /min-height: 52px;/, 'เหตุของ min-height: 0 ยังอยู่ที่กฎกลาง');
  assert.doesNotMatch(mobile, /\.body tr\[data-miss-row\] > td \{[^}]*padding: 0 0/, 'ห้ามล้างระยะข้าง (ประโยคชิดขอบการ์ด)');
  assert.match(mobile, /\.body tr:has\(\+ tr\[data-miss-row\]\) \{ border-bottom: 0; padding-bottom: var\(--space-1\); \}/);
  assert.match(mobile, /\.body tr:has\(\+ tr\[data-miss-row\]\) > td \{ border-bottom: 0; \}/);
});

test('head-r3-12 (ตาราง): ป้าย "จุดติดตั้งโดยประมาณ" บนจอแคบขึ้นบรรทัดของตัวเองไม่ตัดกลางคำ — ตารางสรุปส่งผลและตารางหน้าคำร้อง', () => {
  const table = read('components/service/SurveyResultTable.js');
  assert.match(table, /data-label=\{m\.source \? DRAWING_SPOT_LABEL : "เลือกจุด"\} data-long-label=\{m\.source \? "1" : undefined\}/);
  const css = read('components/service/SurveyResultTable.module.css');
  const mobile = css.slice(css.lastIndexOf('@media (max-width: 680px)'));
  assert.match(mobile, /\.body td\[data-long-label\]::before \{\s*grid-column: 1 \/ -1;\s*white-space: nowrap;\s*\}/);
  const req = read('components/requests/details/surveyRequest.module.css');
  assert.match(req, /\.zoneTable td\[data-long-label\]::before \{\s*grid-column: 1 \/ -1;\s*white-space: nowrap;\s*\}/);
  assert.match(req, /\.zoneTable td\[data-long-label\] > \.cellValue \{\s*grid-column: 2;\s*\}/);
  assert.match(read('components/requests/details/SurveyRequestView.js'),
    /<td data-label=\{label\} data-long-label=\{longLabel \? "1" : undefined\} className=\{isNum \? "num" : undefined\}>/);
});

// ══ C-1 ในตารางผล — TIFF ไม่ขึ้นเป็นภาพย่อที่เปิดไม่ได้ ════════════════════════════════════

test('C-1 (ตารางผล): ภาพกว้างที่เป็น TIFF ไม่มีภาพย่อ แต่ยังนับในตัวนับ "ภาพกว้าง n"', () => {
  const tiff = { id: 'F-tif', docType: 'survey_wide', fileName: 'scan.tif', mimeType: 'image/tiff', driveFileId: 'd-tif' };
  const jpg = { ...WIDE, driveFileId: 'd-jpg' };
  const cell = surveyResultZoneCell(onsiteReady('z1', 'Studio 01'), [tiff, jpg]);
  assert.equal(cell.photos.wide, 2);
  assert.deepEqual(cell.thumbs.map((t) => t.file.id), ['F-wide']);
  assert.equal(cell.moreThumbs, 0);
});

// ══ head-r3-53 ที่หน้าคำร้อง — เหตุ "ยังส่งไม่ได้" ของใบผสมไม่ตัดกลางป้ายท่อน ═══════════════════════════════

test('head-r3-53 (หน้าคำร้อง): บรรทัดเหตุใต้ "ไปส่งผลที่ใบประเมิน" ห่อป้าย "รอช่าง:" · "หัวหน้าต้องทำ:" และชื่อพื้นที่ด้วยชิ้นชุดเดียวกับการ์ด', async () => {
  /* 🐞 UAT 26/10 (S18 request-mixed-in-work ที่ 1440): "… ห้องอาหาร · หัวหน้าต้อง" / "ทำ: ห้องประชุมชั้น 3" — การ์ดของใบประเมินแก้แล้ว
     แต่หน้าคำร้องวาดประโยคเดียวกัน (`surveyControlView.send.reason.text`) เป็นสตริงดิบ */
  const { surveyCardUnits } = await import('../../components/service/surveyControlCardUnits.js');
  const text = 'ยังส่งไม่ได้ — ติด 6 ข้อ · รอช่าง: ล็อบบี้ · ห้องอาหาร · หัวหน้าต้องทำ: ห้องประชุมชั้น 3';
  const units = surveyCardUnits(text, ['ล็อบบี้', 'ห้องอาหาร', 'ห้องประชุมชั้น 3']);
  for (const unit of ['รอช่าง:', 'หัวหน้าต้องทำ:', 'ห้องประชุมชั้น 3']) assert.ok(units.includes(unit), `ขาดชิ้น ${unit}`);
  const view = read('components/requests/details/SurveyRequestView.js');
  assert.match(view, /<p className=\{styles\.blocked\} role="status"><Lock size=\{13\} aria-hidden="true" \/><span>\{keepPhrases\(sendBlocker, surveyCardUnits\(sendBlocker, surveyCardUnitNames\(job\.control\)\)\)\}<\/span><\/p>/,
    'เหตุของปุ่มส่งผลผ่าน keepPhrases + ชิ้นของการ์ด · ห่อ span ตัวเดียว (`.blocked` เป็น flex)');
  assert.doesNotMatch(view, /aria-hidden="true" \/>\{sendBlocker\}<\/p>/, 'ไม่วาดเหตุเป็นสตริงดิบอีก');
});

// ══ S2b-O3-sub ต่อ (มติเจ้าของ 26/10) — ใครบันทึกขนาดอีกครั้ง เมื่อใบเคยเข้าพื้นที่แล้วแต่นัดล่าสุดไม่ได้เข้า ═══════════════
//   นัดก่อนหน้าเข้าพื้นที่แล้ว · นัดล่าสุดยกเลิก/ทำไม่ได้ · หัวหน้าสลับพื้นที่กลับเป็นลงหน้างาน — ใบยัง "ต้องลงคิวใหม่" (มติที่รับไว้ก่อน)
//   แต่ **หัวหน้า** บันทึกขนาดจากรอบที่เข้าพื้นที่แล้วได้ (คำของกล่องผลลัพธ์ "… ใช้ผลจากรอบที่เข้าพื้นที่แล้วได้ …" + แถบของพื้นที่)
//   ⇒ การ์ดเอ่ยหัวหน้า คำเดียวกับเคสที่นัดล่าสุดเข้าพื้นที่แล้ว (`o3-desk-back-after-visit`) ไม่ใช่ "รอช่าง:" / "ช่างต้องเก็บ: ขนาด"
//   🐞 UAT S2b S06 o3-sub-latest-cancelled / -unable (26/10): "ยังส่งไม่ได้ — ติด 2 ข้อ · รอช่าง: ล็อบบี้" ทั้งที่ไม่มีนัดเปิดให้ช่างคนไหน

const RESAVED = { surveyedAt: '2026-10-09T03:05:00.000Z' };
const LATEST = (status) => visitOf(status, { id: 'SVV-2', code: 'SV-26100012', scheduledDate: '2026-10-13', actualDate: null });
const REACHED_FIRST = visitOf('done', { id: 'SVV-1', code: 'SV-26100011' });

test('S2b-O3-sub (มติ 26/10): นัดล่าสุดยกเลิก/ทำไม่ได้หลังมีนัดที่เข้าพื้นที่แล้ว — การ์ดเอ่ย "หัวหน้าต้องทำ" เหมือนเคสนัดล่าสุดเข้าแล้ว · พาดหัวยัง "ต้องลงคิวใหม่" · บันทึกแล้วด่านขนาดผ่าน', () => {
  const zones = [switchedBack('z1', 'Studio 01'), drawingReady('z2', 'Lobby')];
  const reached = card(zones, { ...METHOD_ON, siteVisitReached: true, visit: REACHED_FIRST });
  for (const status of ['cancelled', 'unable', 'rescheduled']) {
    const v = card(zones, { ...METHOD_ON, siteVisitReached: true, visit: LATEST(status) });
    assert.deepEqual([v.status.key, v.status.headline], ['requeue', 'ต้องลงคิวใหม่'], `${status}: ผู้วางคิวยังลงนัดใหม่ได้ ถ้าอยากวัดจริง`);
    assert.equal(v.send.reason.text, 'ยังส่งไม่ได้ — ติด 1 ข้อ · หัวหน้าต้องทำ: Studio 01', status);
    assert.equal(v.send.reason.key, 'head-gaps', status);
    assert.deepEqual(v.send.reason.target, { kind: 'zone', zoneId: 'z1', label: 'เปิด Studio 01' }, status);
    assert.deepEqual(v.zoneGaps.rows.map((r) => [r.zoneId, r.crewText, r.headText, r.targets]), [
      ['z1', null, 'หัวหน้าต้องทำ: ขนาด', [{ kind: 'zone', zoneId: 'z1', label: 'เปิด Studio 01' }]],
    ], status);
    assert.equal(v.zoneGaps.crewPending, false, `${status}: ไม่มีของช่างค้าง`);
    assert.doesNotMatch(`${v.send.reason.text} ${v.zoneGaps.rows.map((r) => r.crewText).join(' ')}`, /รอช่าง|ช่างต้องเก็บ/, status);
    // คำเดียวกับเคสที่นัดล่าสุดเข้าพื้นที่แล้ว (แถวด่าน · เหตุใต้ปุ่ม)
    assert.deepEqual([v.send.reason.text, v.zoneGaps.rows], [reached.send.reason.text, reached.zoneGaps.rows], status);

    // หัวหน้ากดบันทึกพื้นที่หลังสลับ = ด่านขนาดผ่านเหมือนเคสนัดล่าสุดเข้าแล้ว · การ์ดไม่เอ่ยพื้นที่นี้อีก
    const after = card([switchedBack('z1', 'Studio 01', RESAVED), drawingReady('z2', 'Lobby')],
      { ...METHOD_ON, siteVisitReached: true, visit: LATEST(status) });
    assert.equal(after.gates.find((g) => g.key === 'size').ok, true, status);
    assert.deepEqual(after.zoneGaps.rows, [], status);
    assert.notEqual(after.status.key, 'requeue', `${status}: ไม่มีพื้นที่ไหนรอบันทึกแล้ว`);
  }
});

test('S2b-O3-sub (มติ 26/10) · ทางเดิม: ไม่มีนัดไหนเข้าพื้นที่ · ไม่ทราบ (ช่าง / สวิตช์ปิด — GET ไม่อ่าน) · นัดล่าสุดยังเปิด = ช่างเป็นคนเก็บ', () => {
  const zones = [switchedBack('z1', 'Studio 01'), drawingReady('z2', 'Lobby')];
  const crewPath = (v, why) => {
    assert.deepEqual(v.zoneGaps.rows.map((r) => [r.crewText, r.headText]), [['ช่างต้องเก็บ: ขนาด', null]], why);
    assert.equal(v.send.reason.text, 'ยังส่งไม่ได้ — ติด 1 ข้อ · รอช่าง: Studio 01', why);
    assert.equal(v.send.reason.key, 'crew-gaps', why);
  };
  for (const status of ['cancelled', 'unable']) {
    crewPath(card(zones, { ...METHOD_ON, siteVisitReached: false, visit: LATEST(status) }), `${status} · ไม่เคยเข้าพื้นที่`);
    crewPath(card(zones, { ...METHOD_ON, siteVisitReached: null, visit: LATEST(status) }), `${status} · ไม่ทราบ`);
    crewPath(card(zones, { siteVisitReached: null, visit: LATEST(status) }), `${status} · สวิตช์ปิด (GET ไม่อ่าน)`);
    assert.equal(card(zones, { siteVisitReached: null, visit: LATEST(status) }).status.headline, 'กำลังวัดหน้างาน', `${status} · สวิตช์ปิด พาดหัวเดิม`);
  }
  // นัดล่าสุดยังเปิด (ร่าง · นัดไว้ · กำลังทำ) — ช่างของนัดนั้นเป็นคนเก็บ แม้ใบเคยเข้าพื้นที่แล้ว
  for (const status of ['draft', 'scheduled', 'in_progress']) {
    crewPath(card(zones, { ...METHOD_ON, siteVisitReached: true, visit: LATEST(status) }), `${status} · นัดเปิด`);
  }
  // ช่างที่ดูใบ: GET ไม่ส่ง `siteVisitReached` ให้ (null) — ไม่มีแถวของหัวหน้าให้เขาเห็นอยู่แล้ว
  const crew = card(zones, { ...METHOD_ON, siteVisitReached: null, visit: LATEST('cancelled'), viewer: { canWrite: true, canDecide: false } });
  assert.deepEqual(crew.zoneGaps.rows.map((r) => [r.crewText, r.headText]), [['ช่างต้องเก็บ: ขนาด', null]]);
});

test('S2b-O3-sub (มติ 26/10) · หน้าคำร้อง: การ์ดฝั่งช่าง · เหตุใต้ "ไปส่งผลที่ใบประเมิน" เอ่ยหัวหน้า — ขั้นยัง "ต้องลงคิวใหม่" ตาผู้วางคิว · สวิตช์ปิด/ไม่เคยเข้า = เดิม', () => {
  const zones = [switchedBack('z1', 'Studio 01'), drawingReady('z2', 'Lobby')];
  const latest = LATEST('cancelled');
  const req = (over = {}) => withZones(zones, {
    committedDueDate: '2026-10-13', committedResultDate: '2026-10-14',
    surveyVisit: latest, surveyVisits: [latest, REACHED_FIRST], drawingMethodEnabled: true, ...over,
  });
  const v = job(req(), { canDecide: true, canWork: true });
  assert.deepEqual([v.stage, v.now.headline], ['requeue', 'ต้องลงคิวใหม่'], 'ขั้นของใบไม่เปลี่ยน');
  assert.equal(v.now.turn.who, 'Arnon Aunsapwilai', 'ตาของคนลงคิว (ผู้รับผิดชอบ) เหมือนเดิม');
  assert.deepEqual(v.zones.crewGate.badge, { label: 'รอหัวหน้า', tone: 'warning' });
  assert.equal(v.zones.crewGate.text, SURVEY_RESAVE_HEADLINE);
  assert.equal(v.control.send.reason.text, 'ยังส่งไม่ได้ — ติด 1 ข้อ · หัวหน้าต้องทำ: Studio 01');
  assert.equal(v.zones.rows.find((r) => r.id === 'z1').missingText, SURVEY_ZONE_RESAVE_TEXT);
  // ฝ่ายขายเห็นการ์ดฝั่งช่างคำเดียวกัน (ไม่ผูกกับคนดู — ข้อเท็จจริงของใบ)
  assert.deepEqual(job(req(), { isRequesterSide: true }).zones.crewGate.badge, { label: 'รอหัวหน้า', tone: 'warning' });

  // ทางเดิม: สวิตช์ปิด (GET ใบประเมินก็ไม่อ่านนัดที่เข้าพื้นที่) · ไม่มีนัดไหนเข้าพื้นที่ · ใบที่ส่งผลแล้วไม่ถาม
  for (const [why, over] of [
    ['สวิตช์ปิด', { drawingMethodEnabled: false }],
    ['ไม่ส่งสวิตช์', { drawingMethodEnabled: undefined }],
    ['ไม่เคยเข้าพื้นที่', { surveyVisits: [latest] }],
  ]) {
    const old = job(req(over), { canDecide: true, canWork: true });
    assert.deepEqual(old.zones.crewGate.badge, { label: 'ยังไม่เริ่ม', tone: 'neutral' }, why);
    assert.equal(old.control.send.reason.text, 'ยังส่งไม่ได้ — ติด 1 ข้อ · รอช่าง: Studio 01', why);
    assert.equal(old.stage, 'requeue', why);
  }
});
