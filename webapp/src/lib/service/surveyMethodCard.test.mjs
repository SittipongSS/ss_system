// ── การ์ดจัดการผล × วิธีประเมินรายพื้นที่ (ประเมินจากแบบ · งวด S2a กลุ่ม D) — ตัวตัดสินล้วน ─────────────────
//
// ⭐ ของที่ไฟล์นี้ล็อก (สเปก S2a §3 กลุ่ม D): การ์ดของ **ใบจากแบบทั้งใบ** กับ **ใบผสม** พูดถูกคน ถูกที่
//   · สถานะของใบจากแบบ (ยังไม่กรอกขนาด → กำลังประเมิน → พร้อมส่ง) ไม่ใช่ "กำลังวัดหน้างาน 0 / 0"
//   · พื้นที่จากแบบที่ยังขาดขนาดเป็นงานของหัวหน้า — ไม่ถูกโยนให้ช่าง ไม่ขึ้น "รอช่างเก็บงาน"
//   · แถว 17 (นัดค้างบนใบงานโต๊ะ) · แถว 17a (พื้นที่ลงหน้างานยังไม่มีนัดที่เข้าพื้นที่) เป็นเหตุใต้ปุ่มส่งผลพร้อมทางออก
//   · ข้อกันเอกสาร (`hold`) บนส่วนเอกสาร: ประโยคเดียว ไม่ชวนกดซ้ำ ไม่ชวนดึงผลกลับ
// 🔴 **ใบลงหน้างานล้วนต้องได้ค่าเดิมทุกคีย์** — ข้อสุดท้ายของหมวดการ์ดเทียบทั้งก้อนหลังตัดคีย์ใหม่ออก
//   (ยามอีกชั้น = เทสต์ชุดเดิมใน `surveyControl.test.mjs` · `surveyControlDocument.test.mjs` ที่ไม่ถูกแก้สักข้อ)
// ⚠️ การ์ดไม่อ่านสวิตช์ `SURVEY_DRAWING_METHOD` เอง — route ส่ง `drawingMethodEnabled` มา · ไฟล์นี้จำลองทั้งสองค่า
import test from 'node:test';
import assert from 'node:assert/strict';
import { surveyControlView as controlView, surveyResultMethodCell } from './surveyControl.js';
import { surveyDocumentView } from './surveyDocumentView.js';
import { SEND_BACK_KIND, surveySendBackState } from './survey.js';
import { surveyNeedsVisit } from './surveyMethod.js';
import {
  SURVEY_METHOD_BUTTON, SURVEY_METHOD_ERRORS, surveyMethodSwitchGate,
} from './surveyMethodSwitch.js';
import { surveySendSiteVisitError, surveySendVisitStep } from './surveySendClose.js';
import { SURVEY_REPORT_DRAWING_HOLD } from './surveyReportSnapshot.js';

// ── ของตั้งต้น ───────────────────────────────────────────────────────────
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
const ONSITE_FILES = [WIDE, PLAN, SPOT];
/* พื้นที่จากแบบมีรูปเดียว: ภาพแบบ (ต้องเป็น JPG/PNG จึงปลดด่าน) */
const DRAWING_FILES = [PLAN];

/** พื้นที่ลงหน้างานที่ครบทั้งหกข้อ — 4×5×3 = 60 ลบ.ม. ⇒ ระบบเสนอ SM */
const onsiteReady = (id, name, extra = {}) => ({
  id, zoneId: `SZN-${id}`, zoneName: name, floor: '02', status: 'ok',
  parts: [part(4, 5, 3)], spots: [{ id: 's1', label: 'มุมโซฟา', selected: true }],
  packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM', packageNote: '', note: '', ...extra,
});
/** พื้นที่จากแบบที่หัวหน้ายังไม่ได้แตะ */
const drawingEmpty = (id, name, extra = {}) => ({
  id, zoneId: `SZN-${id}`, zoneName: name, floor: '02', status: 'ok', method: 'drawing',
  parts: [], spots: [], packageQty: null, packageNote: '', note: '', ...extra,
});
/** พื้นที่จากแบบที่ครบสามข้อของมัน (ขนาด · ภาพแบบ · แพ็คเกจ) — ไม่มีจุดติดตั้ง ไม่มีภาพกว้าง */
const drawingReady = (id, name, extra = {}) => drawingEmpty(id, name, {
  parts: [part(4, 5, 3)], packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM', ...extra,
});

const ACK = '2026-10-06T08:12:00.000Z';
const request = (extra = {}) => ({
  id: 'DR-1', docNo: 'RQ-AS-26100312', title: 'S&S ประเมินพื้นที่', kind: 'site_survey', dept: 'TS',
  status: 'acknowledged', acknowledgedAt: ACK, siteId: 'SS-1', customerId: 'CU-1',
  committedDueDate: '2026-10-12', committedResultDate: '2026-10-12', requestedByName: 'Admin S&S', ...extra,
});

/* คนดูสี่แบบของสเปก — หัวหน้า · หัวหน้าที่อยู่บนนัดเอง · ผู้วางคิว (อ่านอย่างเดียว) · ช่าง */
const HEAD = { canWrite: true, canDecide: true };
const HEAD_ON_VISIT = { canWrite: true, canDecide: true, onVisit: true };
const PLANNER = { canWrite: false, canDecide: false };
const CREW = { canWrite: true, canDecide: false };
const VIEWERS = [['หัวหน้า', HEAD], ['หัวหน้าบนนัด', HEAD_ON_VISIT], ['ผู้วางคิว', PLANNER], ['ช่าง', CREW]];

const filesFor = (zones) => Object.fromEntries(zones.map((z) => [
  z.id, z.method === 'drawing' ? (z.parts.length ? DRAWING_FILES : []) : ONSITE_FILES,
]));
const card = (zones, extra = {}) => controlView({
  packageSizes: SIZES, request: request(), zones, filesByZone: filesFor(zones),
  viewer: HEAD, today: TODAY, ...extra,
});
const notice = (v, key) => v.notices.find((n) => n.key === key) || null;
const scheduled = (extra = {}) => ({
  id: 'SVV-1', code: 'SV-26100011', status: 'scheduled', scheduledDate: '2026-10-10',
  assigneeId: 'U-9', assigneeName: 'ช่าง ก', assistantIds: [], ...extra,
});

/* คีย์ที่งวด S2a เพิ่มบนผลของการ์ด — ตัดออกแล้วที่เหลือต้องเท่าก่อนงวดนี้ */
const withoutNewKeys = (view) => {
  const { method, mix, needsVisit, fieldTabLabel, ...rest } = view;
  const { drawing, text, ...progress } = rest.progress;
  const { confirm, ...send } = rest.send;
  return { ...rest, progress, send };
};

// ══ 1. ใบจากแบบทั้งใบ ════════════════════════════════════════════════════

test('⭐ ใบจากแบบทั้งใบ: สถานะเดินสามขั้น — ยังไม่ได้กรอกขนาด → กำลังประเมินจากแบบ x/N → พร้อมส่งผล (ทุกคนดู)', () => {
  const empty = [drawingEmpty('z1', 'Lobby'), drawingEmpty('z2', 'Lounge'), drawingEmpty('z3', 'Spa')];
  const oneOfThree = [drawingReady('z1', 'Lobby'), drawingEmpty('z2', 'Lounge'), drawingEmpty('z3', 'Spa')];
  const all = [drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge'), drawingReady('z3', 'Spa')];

  for (const [who, viewer] of VIEWERS) {
    assert.deepEqual(card(empty, { viewer }).status, {
      key: 'desk-empty', tone: 'neutral', headline: 'ยังไม่ได้กรอกขนาด', sub: '',
    }, who);
    assert.deepEqual(card(oneOfThree, { viewer }).status, {
      key: 'desk-working', tone: 'warning', headline: 'กำลังประเมินจากแบบ — 1/3 พื้นที่', sub: 'เหลือ Lounge · Spa',
    }, who);
    assert.deepEqual(card(all, { viewer }).status, {
      key: 'ready', tone: 'info', headline: 'พร้อมส่งผลให้ฝ่ายขาย', sub: '3 พื้นที่ · 60 ตร.ม. · 3 แพ็คเกจ (SM 3)',
    }, who);
  }
  // บรรทัดรองของ "พร้อมส่ง" คือประโยคเดียวกับใบลงหน้างาน (ยอดเท่ากัน = ตัวอักษรเท่ากัน)
  const twin = card([onsiteReady('z1', 'Lobby'), onsiteReady('z2', 'Lounge'), onsiteReady('z3', 'Spa')]);
  assert.equal(twin.status.key, 'ready');
  assert.equal(card(all).status.sub, twin.status.sub);
  assert.equal(card(all).send.allowed, true);

  // ไม่มีสถานะไหนของใบจากแบบเอ่ยคำของงานหน้างาน
  for (const zones of [empty, oneOfThree, all]) {
    for (const [who, viewer] of VIEWERS) {
      const { status } = card(zones, { viewer });
      assert.doesNotMatch(`${status.headline} ${status.sub}`, /วัดแล้ว|หน้างาน|ช่าง/, who);
    }
  }
});

test('ใบจากแบบทั้งใบ: ขนาดกรอกไม่ครบสามช่อง = ยังไม่ได้กรอกขนาด · ครบทุกพื้นที่แต่ด่านอื่นของการส่งยังติด = ยังไม่ "พร้อมส่ง"', () => {
  const partial = [drawingEmpty('z1', 'Lobby', { parts: [part(4, 5, '')] }), drawingEmpty('z2', 'Lounge')];
  assert.equal(card(partial).status.key, 'desk-empty');

  // เกินสามชื่อยุบเป็น "อีก n" ตัวเดียวกับบรรทัดอื่นของการ์ด
  const five = [
    drawingReady('z1', 'A'), drawingEmpty('z2', 'B'), drawingEmpty('z3', 'C'), drawingEmpty('z4', 'D'), drawingEmpty('z5', 'E'),
  ];
  assert.deepEqual(card(five).status, {
    key: 'desk-working', tone: 'warning', headline: 'กำลังประเมินจากแบบ — 1/5 พื้นที่', sub: 'เหลือ B · C · D อีก 1',
  });

  // ทุกพื้นที่ครบ แต่อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ (ด่านส่งผลอีกข้อ) — ไม่มีชื่อพื้นที่ให้เอ่ย
  const all = [drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge')];
  const unread = card(all, { packageSizes: null });
  assert.deepEqual(unread.status, {
    key: 'desk-working', tone: 'warning', headline: 'กำลังประเมินจากแบบ — 2/2 พื้นที่', sub: '',
  });
  assert.equal(unread.send.allowed, false);

  // พื้นที่ที่ตัดไม่นับทั้งตัวตั้งและตัวหาร · ใบที่ดึงผลกลับยังเป็นสถานะ "ดึงผลกลับมาแก้" (อยู่ก่อนสาขานี้)
  const withCut = [drawingReady('z1', 'Lobby'), drawingEmpty('z2', 'Lounge'), drawingEmpty('z3', 'Spa', { status: 'cut' })];
  assert.equal(card(withCut).status.headline, 'กำลังประเมินจากแบบ — 1/2 พื้นที่');
  const recalled = card(all, { recall: { reason: 'แก้ตัวเลข', byName: 'หัวหน้า ก', at: ACK, totals: null } });
  assert.equal(recalled.status.key, 'recalled');
  assert.equal(recalled.status.sub, 'จากแบบ 2 พื้นที่', 'ไม่ใช่ "วัดแล้ว 0 / 0 พื้นที่"');
});

test('ใบจากแบบทั้งใบ: ไม่มีของฝั่งช่างที่ไหนเลย · ไม่มีปุ่มส่งกลับให้ช่าง · โมดัลส่งผลต้องถามเรื่องยืนยันหน้างาน · แท็บชื่อ "ข้อมูลพื้นที่"', () => {
  const zones = [drawingReady('z1', 'Lobby'), drawingEmpty('z2', 'Lounge'), drawingEmpty('z3', 'Spa')];
  /* นัดกำลังทำที่ยังติดใบ (ช่างกดเริ่มไปแล้วตอนใบยังต้องลงหน้างาน) — มีช่างบนนัด ⇒ ใบลงหน้างานจะมีปุ่มส่งกลับ */
  const visit = scheduled({ status: 'in_progress', actualDate: '2026-10-09', actualStartTime: '09:10:00' });
  assert.equal(surveyNeedsVisit(zones), false);

  for (const [who, viewer] of VIEWERS) {
    const v = card(zones, { viewer, visit });
    assert.doesNotMatch(JSON.stringify(v.zoneGaps), /ช่างต้องเก็บ/, who);
    assert.ok(v.zoneGaps.rows.every((row) => row.crew.length === 0 && row.crewText === null), who);
    assert.equal(v.zoneGaps.crewPending, false, who);
    assert.equal(v.sendBackAction.show, false, who);
    assert.deepEqual(v.send.confirm, { required: true, mix: { onsite: 0, drawing: 3 }, mode: 'drawing' }, who);
    assert.equal(v.fieldTabLabel, 'ข้อมูลพื้นที่', who);
    assert.equal(v.needsVisit, false, who);
    assert.deepEqual(v.mix, { onsite: 0, drawing: 3, mode: 'drawing' }, who);
    assert.equal(v.progress.drawing, 3, who);
    assert.equal(v.progress.text, 'จากแบบ 3 พื้นที่', who);
    assert.deepEqual([v.progress.done, v.progress.total, v.progress.complete], [0, 0, false], who);
  }

  // หัวหน้า: สองพื้นที่ที่ยังไม่เสร็จขึ้นเป็นของหัวหน้า · ขนาดกับภาพแบบกรอกที่หน้าพื้นที่ แพ็คเกจเคาะที่แท็บสรุป
  const head = card(zones, { visit });
  assert.deepEqual(head.zoneGaps.rows.map((row) => [row.zoneName, row.head, row.headText]), [
    ['Lounge', ['ขนาด', 'ภาพแบบ', 'แพ็คเกจ'], 'หัวหน้าต้องทำ: ขนาด · ภาพแบบ · แพ็คเกจ'],
    ['Spa', ['ขนาด', 'ภาพแบบ', 'แพ็คเกจ'], 'หัวหน้าต้องทำ: ขนาด · ภาพแบบ · แพ็คเกจ'],
  ]);
  assert.deepEqual(head.zoneGaps.rows[0].targets, [
    { kind: 'zone', zoneId: 'z2', label: 'เปิด Lounge' },
    { kind: 'tab', tab: 'result', label: 'เคาะที่สรุปส่งผล' },
  ]);
  assert.equal(head.send.reason.key, 'head-gaps');
  assert.deepEqual(head.send.reason.target, { kind: 'zone', zoneId: 'z2', label: 'เปิด Lounge' });
  assert.doesNotMatch(head.send.reason.text, /รอช่างเก็บงาน/);

  // คนที่ส่งผลไม่ได้: ไม่มีแถวของพื้นที่จากแบบในกลุ่ม "ของที่ช่างต้องเก็บ" และไม่มีข้อ 0 / 0 ของด่านหกข้อ
  for (const viewer of [CREW, PLANNER]) {
    const v = card(zones, { viewer, visit });
    assert.deepEqual(v.zoneGaps.rows, []);
    assert.deepEqual(v.gates.filter((g) => ['size', 'wide', 'spots', 'plan', 'picked', 'package'].includes(g.key)), []);
    assert.ok(v.gates.every((g) => g.zones.length === 0));
  }
});

test('จุดที่พาไปของพื้นที่จากแบบ: ขนาด/ภาพแบบ = หน้าพื้นที่ · เหลือแต่แพ็คเกจ = แท็บสรุป · อยู่แท็บสรุปแล้วก็ยังพาไปหน้าพื้นที่', () => {
  const onlyPackage = [drawingReady('z1', 'Lobby', { packageQty: null, packageSize: null })];
  const pkg = card(onlyPackage);
  assert.deepEqual(pkg.zoneGaps.rows[0].head, ['แพ็คเกจ']);
  assert.deepEqual(pkg.zoneGaps.rows[0].targets, [{ kind: 'tab', tab: 'result', label: 'เคาะที่สรุปส่งผล' }]);
  assert.deepEqual(pkg.send.reason.target, { kind: 'tab', tab: 'result', label: 'ไปเคาะที่แท็บสรุปส่งผล' });
  assert.deepEqual(card(onlyPackage, { tab: 'result' }).zoneGaps.rows[0].targets, [], 'ของที่ต้องทำอยู่ในตารางตรงหน้า');

  // ขาดแต่ภาพแบบ (มีไฟล์ผังแต่เป็น PDF — ลงเอกสารไม่ได้) = หน้าพื้นที่ ไม่ใช่แท็บสรุป
  const noPlan = [drawingReady('z1', 'Lobby')];
  const planPdf = { z1: [{ id: 'F-pdf', docType: 'survey_plan', fileName: 'plan.pdf', mimeType: 'application/pdf' }] };
  for (const tab of ['field', 'result']) {
    const v = card(noPlan, { filesByZone: planPdf, tab });
    assert.deepEqual(v.zoneGaps.rows[0].head, ['ภาพแบบ'], tab);
    assert.deepEqual(v.zoneGaps.rows[0].targets, [{ kind: 'zone', zoneId: 'z1', label: 'เปิด Lobby' }], tab);
    assert.deepEqual(v.send.reason.target, { kind: 'zone', zoneId: 'z1', label: 'เปิด Lobby' }, tab);
  }

  // 🔴 พื้นที่ลงหน้างานยังกติกาเดิม: ผัง · เลือกจุด · แพ็คเกจ ของหัวหน้าไปแท็บสรุปทางเดียว
  const onsite = [onsiteReady('z1', 'Studio 01', { packageQty: null })];
  assert.deepEqual(card(onsite, { filesByZone: { z1: [WIDE, SPOT] } }).zoneGaps.rows[0].targets, [
    { kind: 'tab', tab: 'result', label: 'เคาะที่สรุปส่งผล' },
  ]);
});

// ══ 2. ใบผสม ═════════════════════════════════════════════════════════════

test('🔴 ใบผสม · พื้นที่จากแบบขาดขนาดอยู่พื้นที่เดียว: หัวหน้าได้ head-gaps พาไปหน้าพื้นที่นั้น — ไม่ใช่ "รอช่างเก็บงาน"', () => {
  const zones = [onsiteReady('z1', 'Studio 01'), onsiteReady('z2', 'Studio 02'), drawingReady('z3', 'Lobby', { parts: [] })];
  const filesByZone = { z1: ONSITE_FILES, z2: ONSITE_FILES, z3: DRAWING_FILES };

  for (const [who, viewer] of [['หัวหน้า', HEAD], ['หัวหน้าบนนัด', HEAD_ON_VISIT]]) {
    const v = card(zones, { viewer, filesByZone });
    assert.equal(v.send.reason.key, 'head-gaps', who);
    assert.notEqual(v.send.reason.key, 'crew-gaps', who);
    assert.equal(v.send.reason.text, 'ยังส่งไม่ได้ — ติด 1 ข้อ ที่ Lobby', who);
    assert.doesNotMatch(JSON.stringify(v.send.reason), /รอช่างเก็บงาน/, who);
    assert.deepEqual(v.send.reason.target, { kind: 'zone', zoneId: 'z3', label: 'เปิด Lobby' }, who);
    assert.deepEqual(v.zoneGaps.rows, [{
      zoneId: 'z3', zoneName: 'Lobby', zoneCode: null, zoneCodeUnknown: false,
      crew: [], head: ['ขนาด'], crewText: null, headText: 'หัวหน้าต้องทำ: ขนาด',
      targets: [{ kind: 'zone', zoneId: 'z3', label: 'เปิด Lobby' }],
    }], who);
    assert.equal(v.zoneGaps.crewPending, false, who);
    // มิเตอร์: ช่างวัดครบสองพื้นที่ · อีกหนึ่งพื้นที่หัวหน้ากรอกเอง
    assert.equal(v.progress.text, 'วัดแล้ว 2 / 2 พื้นที่ · จากแบบ 1 (หัวหน้ากรอกเอง)', who);
    assert.equal(v.status.key, 'awaiting-decision', who);
    assert.equal(v.status.sub, 'วัดแล้ว 2 / 2 พื้นที่ · จากแบบ 1 (หัวหน้ากรอกเอง) · เหลือ Lobby', who);
    assert.equal(v.fieldTabLabel, 'ข้อมูลพื้นที่', who);
    assert.deepEqual(v.send.confirm, { required: true, mix: { onsite: 2, drawing: 1 }, mode: 'mixed' }, who);
  }

  // ช่าง / ผู้วางคิว: พื้นที่จากแบบไม่อยู่ในแถวด่านไหนเลย — ข้อ "ขนาด" นับเฉพาะสองพื้นที่ที่ช่างวัด
  for (const [who, viewer] of [['ช่าง', CREW], ['ผู้วางคิว', PLANNER]]) {
    const v = card(zones, { viewer, filesByZone });
    for (const gate of v.gates) assert.ok(!gate.zones.includes('Lobby'), `${who} · ${gate.key}`);
    const size = v.gates.find((g) => g.key === 'size');
    assert.deepEqual([size.ok, size.done, size.total, size.owner], [true, 2, 2, 'crew'], who);
    assert.deepEqual(v.gates.map((g) => g.key), ['size', 'wide', 'spots', 'spotPhotos', 'spotLinked'], who);
    assert.equal(v.gatesFailed, 0, who);
    assert.deepEqual(v.zoneGaps.rows, [], who);
    assert.equal(v.progress.text, 'วัดแล้ว 2 / 2 พื้นที่ · จากแบบ 1', who);
    assert.match(v.status.sub, /^วัดแล้ว 2 \/ 2 พื้นที่ · จากแบบ 1 · /, who);
    assert.doesNotMatch(v.status.sub, /หัวหน้ากรอกเอง/, who);
  }
});

test('ใบผสม: ของฝั่งช่างที่ขาดจริง (พื้นที่ลงหน้างาน) ยังเป็น crew-gaps · ปุ่มส่งกลับให้ช่างยังอยู่', () => {
  const zones = [
    onsiteReady('z1', 'Studio 01'),
    onsiteReady('z2', 'Studio 02', { parts: [] }),
    drawingReady('z3', 'Lobby', { parts: [] }),
  ];
  const filesByZone = { z1: ONSITE_FILES, z2: ONSITE_FILES, z3: DRAWING_FILES };
  const visit = scheduled({ status: 'done', actualDate: '2026-10-08' });
  const v = card(zones, { filesByZone, visit });
  assert.equal(v.send.reason.key, 'crew-gaps');
  assert.match(v.send.reason.text, / · รอช่างเก็บงาน$/);
  assert.deepEqual(v.send.reason.target, { kind: 'zone', zoneId: 'z2', label: 'เปิด Studio 02' }, 'พื้นที่ที่ช่างยังค้างก่อน');
  assert.deepEqual(v.zoneGaps.rows.map((row) => [row.zoneName, row.crew, row.head]), [
    ['Studio 02', ['ขนาด'], []],
    ['Lobby', [], ['ขนาด']],
  ]);
  assert.equal(v.zoneGaps.crewPending, true);
  assert.equal(v.sendBackAction.show, true);
  assert.equal(v.sendBackAction.message, 'ข้อที่ติด: Studio 02 (ขนาด)', 'พื้นที่จากแบบไม่ถูกส่งกลับให้ช่าง');
  assert.equal(v.needsVisit, true);
  assert.equal(v.progress.text, 'วัดแล้ว 1 / 2 พื้นที่ · จากแบบ 1 (หัวหน้ากรอกเอง)');
  assert.equal(v.status.sub, 'วัดแล้ว 1 / 2 พื้นที่ · จากแบบ 1 (หัวหน้ากรอกเอง) · เหลือ Studio 02');

  // ช่างเห็นเฉพาะพื้นที่ของตัวเอง
  const crew = card(zones, { filesByZone, visit, viewer: CREW });
  assert.deepEqual(crew.gates.find((g) => g.key === 'size').zones, ['Studio 02']);
  assert.deepEqual(crew.zoneGaps.rows.map((row) => row.zoneName), ['Studio 02']);
});

// ══ 3. แถว 17 — นัดค้างบนใบงานโต๊ะ ═══════════════════════════════════════

test('🔴 แถว 17: ใบจากแบบทั้งใบ + นัดยังนัดไว้/ร่าง = visit-open-desk ประโยคเดียวกับ route · ปุ่มทางออกมีเฉพาะตอนเปิดสวิตช์', () => {
  const zones = [drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge')];
  const text = 'ใบนี้ประเมินจากแบบทั้งใบ แต่นัด SV-26100011 ยังเปิดอยู่ — กด “เปลี่ยนวิธีประเมิน” แล้วยืนยันยกเลิกนัดก่อนส่งผล'
    + ' (ระบบจะไม่ปิดนัดที่ยังไม่มีใครไปเป็น “เข้าแล้ว” ให้)';
  for (const status of ['scheduled', 'draft']) {
    const visit = scheduled({ status });
    assert.equal(surveySendVisitStep(visit, { today: TODAY, needsVisit: false }).error, text, 'ประโยคของงวด S1 ตรงตัว');

    const on = card(zones, { visit, drawingMethodEnabled: true });
    assert.deepEqual(on.send.reason, {
      key: 'visit-open-desk', text, detail: text, target: { kind: 'method', label: 'เปลี่ยนวิธีประเมิน' },
    }, status);
    assert.equal(on.send.reason.target.label, SURVEY_METHOD_BUTTON);
    assert.equal(on.send.allowed, false);
    assert.equal(on.send.show, true);
    assert.equal(on.send.closesVisit, null);
    assert.equal(on.status.key, 'ready', 'ด่านครบ — ที่ขวางคือนัด');

    // สวิตช์ปิด: ประโยคเดิม ไม่มีปุ่ม (นัดยกเลิกที่หน้าจัดคิว)
    for (const off of [card(zones, { visit }), card(zones, { visit, drawingMethodEnabled: false })]) {
      assert.deepEqual(off.send.reason, { key: 'visit-open-desk', text, detail: text, target: null }, status);
      assert.equal(off.send.allowed, false);
    }
  }
  // ด่านของพื้นที่ยังพูดก่อนเรื่องนัด (ลำดับเดียวกับ route)
  const gaps = card([drawingReady('z1', 'Lobby'), drawingEmpty('z2', 'Lounge')], { visit: scheduled(), drawingMethodEnabled: true });
  assert.equal(gaps.send.reason.key, 'head-gaps');
  // ใบที่ยังต้องมีนัด: นัดร่างยังเป็นคีย์และประโยคเดิมของร่าง
  const draft = card([onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby')], {
    visit: scheduled({ status: 'draft' }), drawingMethodEnabled: true, siteVisitReached: true,
  });
  assert.equal(draft.send.reason.key, 'visit-draft');
  assert.equal(draft.send.reason.target, null);
  assert.match(draft.send.reason.text, /ยังเป็นร่าง/);
});

// ══ 4. แถว 17a — พื้นที่ลงหน้างานยังไม่มีนัดที่เข้าพื้นที่ ══════════════════

test('🔴 แถว 17a: ใบผสม ไม่มีนัด · route บอกว่ายังไม่มีนัดที่เข้าพื้นที่ = site-visit เอ่ยเฉพาะพื้นที่ลงหน้างาน + ปุ่มเปลี่ยนวิธี', () => {
  const zones = [onsiteReady('z1', 'Studio 01'), onsiteReady('z2', 'Studio 02'), drawingReady('z3', 'Lobby')];
  const text = 'ใบนี้มีพื้นที่ลงหน้างาน (Studio 01 · Studio 02) แต่ยังไม่มีนัดที่เข้าพื้นที่ — ลงคิวก่อน หรือเปลี่ยนพื้นที่นั้นเป็นประเมินจากแบบ';
  assert.equal(surveySendSiteVisitError(zones, { reachedSite: false, closesVisit: false }), text);

  const blocked = card(zones, { drawingMethodEnabled: true, siteVisitReached: false });
  assert.deepEqual(blocked.send.reason, {
    key: 'site-visit', text, detail: text, target: { kind: 'method', label: 'เปลี่ยนวิธีประเมิน' },
  });
  assert.equal(blocked.send.allowed, false);
  assert.equal(blocked.send.show, true);
  assert.doesNotMatch(text, /Lobby/);

  // มีนัดที่เข้าพื้นที่แล้ว · route ยังไม่ได้อ่าน/อ่านไม่สำเร็จ (null — route เป็นคนตัดสินตอนกด) · สวิตช์ปิด = ไม่มีบรรทัดนี้
  for (const [why, extra] of [
    ['เข้าพื้นที่แล้ว', { drawingMethodEnabled: true, siteVisitReached: true }],
    ['ไม่ทราบ', { drawingMethodEnabled: true, siteVisitReached: null }],
    ['ไม่ส่งมา', { drawingMethodEnabled: true }],
    ['สวิตช์ปิด', { drawingMethodEnabled: false, siteVisitReached: false }],
    ['ไม่ส่งสวิตช์', { siteVisitReached: false }],
  ]) {
    const v = card(zones, extra);
    assert.equal(v.send.reason, null, why);
    assert.equal(v.send.allowed, true, why);
  }
  // 🔴 ค่าที่หลุดรูปไม่ถูกเดา: สวิตช์ต้องเป็น true ตรงตัว · "มีนัดไหม" ต้องเป็น true/false ตรงตัว (ไม่ทราบ ≠ ไม่มีนัด)
  for (const [why, extra] of [
    ['สวิตช์เป็นสตริง', { drawingMethodEnabled: 'true', siteVisitReached: false }],
    ['สวิตช์เป็น 1', { drawingMethodEnabled: 1, siteVisitReached: false }],
    ['นัดเป็น undefined', { drawingMethodEnabled: true, siteVisitReached: undefined }],
    ['นัดเป็น 0', { drawingMethodEnabled: true, siteVisitReached: 0 }],
    ['นัดเป็นสตริงว่าง', { drawingMethodEnabled: true, siteVisitReached: '' }],
  ]) {
    assert.equal(card(zones, extra).send.reason, null, why);
  }
  assert.deepEqual(card(zones, { drawingMethodEnabled: 'true' }).method, { show: false, allowed: false, reason: null });
  // คนที่ส่งผลไม่ได้ไม่เห็นบรรทัดนี้ — เหตุเดียวของเขาคือไม่มีสิทธิ์
  for (const viewer of [PLANNER, CREW]) {
    const v = card(zones, { viewer, drawingMethodEnabled: true, siteVisitReached: false });
    assert.equal(v.send.reason.key, 'no-permission');
    assert.equal(v.send.show, false);
  }
  // ใบที่ส่งผลไปแล้ว / ยกเลิก ไม่มีบรรทัดนี้ (ไม่มีปุ่มส่งผลให้ขวาง)
  for (const row of [
    request({ status: 'answered', answeredAt: '2026-10-08T04:00:00.000Z', answeredByName: 'หัวหน้า ก' }),
    request({ status: 'cancelled', cancelledAt: '2026-10-08T04:00:00.000Z' }),
  ]) {
    assert.equal(card(zones, { request: row, drawingMethodEnabled: true, siteVisitReached: false }).send.reason, null);
  }
  // ส่งผลนี้ปิดนัดที่ยังเปิดให้ = มีคนไปแล้ว (ตัวตัดสินตัวเดียวกับ route)
  const closing = card(zones, { drawingMethodEnabled: true, siteVisitReached: false, visit: scheduled() });
  assert.equal(closing.send.reason, null);
  assert.equal(closing.send.closesVisit.id, 'SVV-1');
});

test('แถว 17a อยู่หลังด่านหกข้อ · ก่อนเหตุของเอกสาร · ก่อนเรื่องนัดร่าง — ลำดับเดียวกับ route ส่งผล', () => {
  const ready = [onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby')];
  const flags = { drawingMethodEnabled: true, siteVisitReached: false };

  // ด่านหกข้อยังติด = ด่านพูดก่อน
  const gaps = card([onsiteReady('z1', 'Studio 01', { packageQty: null }), drawingReady('z2', 'Lobby')], flags);
  assert.equal(gaps.send.reason.key, 'head-gaps');
  assert.equal(gaps.send.allowed, false);

  // เอกสารก็ติด = แถว 17a พูดก่อนเหตุของเอกสาร
  const document = {
    access: { customer: true, internal: true, issue: true, draft: true, history: true },
    issueAtSend: true, storeAllowed: true, state: 'not_sent', current: null, history: [], nextDocNo: null,
    send: { blockers: ['Studio 01 ยังไม่มีภาพผัง'], warnings: [], unknown: false }, issue: null,
  };
  const withDoc = card(ready, { ...flags, document });
  assert.equal(withDoc.send.reason.key, 'site-visit');
  assert.equal(card(ready, { document, drawingMethodEnabled: true, siteVisitReached: true }).send.reason.key, 'head-gaps');

  // นัดร่างค้าง + ไม่มีนัดที่เข้าพื้นที่ = แถว 17a ก่อน (route ถามด่านนี้ก่อนลำดับการเขียน)
  const draft = card(ready, { ...flags, visit: scheduled({ status: 'draft' }) });
  assert.equal(draft.send.reason.key, 'site-visit');

  // ใบลงหน้างานล้วนก็อยู่ใต้ด่านนี้เมื่อเปิดสวิตช์ (รูเดิมที่ด่านนี้ปิด) · ใบจากแบบทั้งใบไม่เคยติด
  const onsite = card([onsiteReady('z1', 'Studio 01')], flags);
  assert.equal(onsite.send.reason.key, 'site-visit');
  assert.equal(card([drawingReady('z1', 'Lobby')], flags).send.reason, null);
});

// ══ 5. ส่งกลับให้ช่างที่ค้างจากตอนยังลงหน้างาน ═════════════════════════════

test('🐞 ใบงานโต๊ะที่มี "ส่งกลับให้ช่างแก้" ค้างดิบ ๆ: การ์ดไม่บอกว่ารอช่าง · โมดัลส่งผลไม่เตือนเรื่องที่ไม่ค้างแล้ว', () => {
  /* หน้าคำร้องส่งสภาพดิบเข้ามา (`sa/requests/[id]` GET) — การ์ดเป็นคนปิดเรื่องให้ทั้งสองหน้า */
  const raw = surveySendBackState([{
    id: 'EUP-1', kind: SEND_BACK_KIND, createdAt: '2026-10-07T03:00:00.000Z', authorId: 'U-1', authorName: 'หัวหน้า ก',
    body: 'ส่งกลับให้ช่างแก้', meta: { note: 'ถ่ายภาพกว้างใหม่', items: ['ถ่ายภาพกว้างใหม่'] },
  }]);
  assert.equal(raw.pending, true, 'fixture ต้องเป็นเรื่องที่ยังค้างจริง');

  const desk = [drawingReady('z1', 'Lobby'), drawingReady('z2', 'Lounge')];
  for (const [who, viewer] of [['หัวหน้า', HEAD], ['หัวหน้าบนนัด', HEAD_ON_VISIT]]) {
    const v = card(desk, { viewer, sendBack: raw });
    assert.equal(notice(v, 'send-back-pending'), null, who);
    assert.equal(notice(v, 'send-back-done'), null, who);
    assert.equal(v.send.sendBackPending, null, who);
    assert.equal(v.send.allowed, true, who);
  }
  assert.equal(raw.pending, true, 'สภาพที่ส่งเข้ามาไม่ถูกแก้');

  // ใบที่ยังต้องมีนัด (ผสม) เรื่องยังค้างตามจริง — ข้อความเดิม
  const mixed = card([onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lobby')], { sendBack: raw });
  assert.match(notice(mixed, 'send-back-pending').text, /^ส่งกลับให้ช่างแก้ .* — ถ่ายภาพกว้างใหม่ · รอช่างแจ้งว่าแก้แล้ว$/);
  assert.deepEqual(mixed.send.sendBackPending, { itemCount: 1 });

  /* ส่งกลับ → ช่างแจ้งว่าแก้แล้ว → ส่งกลับอีกรอบ (ค้าง) แล้วใบกลายเป็นงานโต๊ะ: "ช่างแจ้งว่าแก้แล้ว" ที่เหลืออยู่เป็นของรอบแรก
     ⇒ ห้ามขึ้นเป็นคำตอบของการส่งกลับรอบล่าสุด · GET ของใบประเมินปิดเรื่องมาให้แล้ว (`closedByMethod`) ก็ได้ผลเดียวกัน */
  const again = surveySendBackState([
    { id: 'EUP-1', kind: SEND_BACK_KIND, createdAt: '2026-10-07T03:00:00.000Z', authorName: 'หัวหน้า ก', body: 'x', meta: { note: 'ถ่ายใหม่' } },
    { id: 'EUP-2', kind: 'send_back_done', createdAt: '2026-10-07T05:00:00.000Z', authorName: 'ช่าง ก', body: 'y', meta: { note: 'แก้แล้ว' } },
    { id: 'EUP-3', kind: SEND_BACK_KIND, createdAt: '2026-10-07T06:00:00.000Z', authorName: 'หัวหน้า ก', body: 'x', meta: { note: 'ยังไม่ชัด' } },
  ]);
  assert.equal(again.pending, true);
  assert.ok(again.done, 'fixture ต้องมีแถวแจ้งแก้แล้วของรอบแรก');
  for (const sendBack of [again, { ...again, pending: false, closedByMethod: true }]) {
    const v = card(desk, { sendBack });
    assert.deepEqual(v.notices.filter((n) => n.key.startsWith('send-back')), []);
    assert.equal(v.send.sendBackPending, null);
  }
  // ช่างแจ้งว่าแก้แล้วจริง (ไม่มีเรื่องค้าง) แล้วใบค่อยกลายเป็นงานโต๊ะ = ประวัติจริง ยังบอกได้
  const settled = surveySendBackState([
    { id: 'EUP-1', kind: SEND_BACK_KIND, createdAt: '2026-10-07T03:00:00.000Z', authorName: 'หัวหน้า ก', body: 'x', meta: { note: 'ถ่ายใหม่' } },
    { id: 'EUP-2', kind: 'send_back_done', createdAt: '2026-10-07T05:00:00.000Z', authorName: 'ช่าง ก', body: 'y', meta: { note: 'แก้แล้ว' } },
  ]);
  assert.match(notice(card(desk, { sendBack: settled }), 'send-back-done').text, /^ช่างแจ้งว่าแก้แล้ว /);
});

test('อ่านไฟล์ในเธรดไม่สำเร็จ (แผง "แบบจากฝ่ายขาย"): กล่องแจ้งใช้ป้ายไทย และไม่อ้างว่าแสดงเป็น "ไม่ทราบ"', () => {
  const zones = [drawingReady('z1', 'Lobby')];
  const only = notice(card(zones, { unknown: { threadFiles: true } }), 'unknown');
  assert.equal(only.text, 'อ่านข้อมูลบางส่วนไม่สำเร็จ — ไฟล์แนบในเธรดของคำร้อง · ลองโหลดหน้าใหม่');
  assert.deepEqual(only.keys, ['threadFiles']);
  const both = notice(card(zones, { unknown: { site: true, requestFiles: true, threadFiles: true } }), 'unknown');
  assert.equal(
    both.text,
    'อ่านข้อมูลบางส่วนไม่สำเร็จ — ข้อมูลไซต์ แสดงเป็น "ไม่ทราบ" · ไฟล์แนบของคำร้อง · ไฟล์แนบในเธรดของคำร้อง · ลองโหลดหน้าใหม่',
  );
});

// ══ 6. ปุ่ม "เปลี่ยนวิธีประเมิน" ══════════════════════════════════════════

test('`method`: ปุ่มเปลี่ยนวิธีของหัวหน้า — รอรับเรื่อง · รับเรื่องแล้ว · ส่งผลแล้ว · ยกเลิก · คนอื่นไม่เห็นปุ่มเลย', () => {
  const zones = [onsiteReady('z1', 'Studio 01')];
  const HIDDEN = { show: false, allowed: false, reason: null };
  const REQUESTS = {
    pending: request({ status: 'pending', acknowledgedAt: null }),
    acknowledged: request(),
    sent: request({ status: 'answered', answeredAt: '2026-10-08T04:00:00.000Z', answeredByName: 'หัวหน้า ก' }),
    cancelled: request({ status: 'cancelled', cancelledAt: '2026-10-08T04:00:00.000Z' }),
  };
  const HEAD_GATE = {
    pending: { show: true, allowed: false, reason: SURVEY_METHOD_ERRORS.notAcknowledged },
    acknowledged: { show: true, allowed: true, reason: null },
    sent: { show: true, allowed: false, reason: SURVEY_METHOD_ERRORS.sentButton },
    cancelled: HIDDEN,
  };
  for (const [name, row] of Object.entries(REQUESTS)) {
    for (const viewer of [HEAD, HEAD_ON_VISIT]) {
      const v = card(zones, { request: row, viewer, drawingMethodEnabled: true });
      assert.deepEqual(v.method, HEAD_GATE[name], `หัวหน้า · ${name}`);
      assert.deepEqual(v.method, surveyMethodSwitchGate(row, { canSwitch: true, enabled: true }), 'ตัวตัดสินตัวเดียวกับ route');
      // สวิตช์ปิด / ไม่ส่งสวิตช์มา = ไม่มีปุ่ม
      assert.deepEqual(card(zones, { request: row, viewer, drawingMethodEnabled: false }).method, HIDDEN, name);
      assert.deepEqual(card(zones, { request: row, viewer }).method, HIDDEN, name);
    }
    // ผู้วางคิวและช่างไม่เห็นปุ่มเลย (ไม่ใช่ปุ่มจาง)
    for (const viewer of [PLANNER, CREW]) {
      assert.deepEqual(card(zones, { request: row, viewer, drawingMethodEnabled: true }).method, HIDDEN, name);
    }
  }
  // ใบลงหน้างานล้วน: โมดัลส่งผลไม่ต้องถามเรื่องยืนยันหน้างาน · ชื่อแท็บเดิม
  const onsite = card(zones, { drawingMethodEnabled: true });
  assert.deepEqual(onsite.send.confirm, { required: false, mix: { onsite: 1, drawing: 0 }, mode: 'onsite' });
  assert.equal(onsite.fieldTabLabel, 'หน้างาน');
  assert.equal(onsite.needsVisit, true);
  assert.deepEqual(onsite.mix, { onsite: 1, drawing: 0, mode: 'onsite' });
  assert.equal(onsite.progress.drawing, 0);
  assert.equal(onsite.progress.text, 'วัดแล้ว 1 / 1 พื้นที่');
});

// ══ 7. แถวของตารางสรุปส่งผล ══════════════════════════════════════════════

test('surveyResultMethodCell: ลงหน้างาน = ป้ายอย่างเดียว · จากแบบ = ที่มาของผล (ผู้ประเมิน + วัน) + ชื่อช่องภาพแบบ + จุด "ไม่บังคับ"', () => {
  const ONSITE = { method: 'onsite', chip: 'ลงหน้างาน', source: null, planTitle: null, spotNote: null, addedLabel: null };
  for (const zone of [
    onsiteReady('z1', 'Studio 01'),
    onsiteReady('z1', 'Studio 01', { method: 'onsite' }),
    onsiteReady('z1', 'Studio 01', { method: null, methodChangedAt: null, methodChangedByName: null }),
    // ช่างวัดไว้แล้วถูกสลับกลับมาเป็นลงหน้างาน — ชื่อคนสลับไม่ขึ้นเป็นที่มาของผล
    onsiteReady('z1', 'Studio 01', { methodChangedAt: '2026-10-08T03:00:00.000Z', methodChangedByName: 'หัวหน้า ก' }),
    {}, undefined, null,
  ]) {
    assert.deepEqual(surveyResultMethodCell(zone ?? undefined, null), ONSITE);
  }
  const drawing = (source) => ({
    method: 'drawing', chip: 'จากแบบ', source, planTitle: 'ภาพแบบของพื้นที่', spotNote: 'ไม่บังคับ', addedLabel: null,
  });

  // เกิดมาเป็นจากแบบ (ฝ่ายขายขอประเมินจากแบบ) แล้วหัวหน้าบันทึก — 01:30 UTC = 08:30 เวลาไทย วันเดียวกัน
  const born = drawingReady('z1', 'Lobby', { surveyedAt: '2026-10-08T01:30:00.000Z', surveyedByName: 'หัวหน้า ก' });
  assert.deepEqual(surveyResultMethodCell(born, null), drawing('จากแบบ · หัวหน้า ก 08/10/2026'));
  // วันเป็นวันไทย: 18:30 UTC ของวันที่ 8 = ตีหนึ่งครึ่งของวันที่ 9
  assert.equal(
    surveyResultMethodCell({ ...born, surveyedAt: '2026-10-08T18:30:00.000Z' }, null).source,
    'จากแบบ · หัวหน้า ก 09/10/2026',
  );

  // สลับมาแล้วยังไม่ได้บันทึกใหม่ — ชื่อช่างที่วัดไว้ก่อนสลับห้ามขึ้น ต้องเป็นชื่อคนสลับ
  const switched = drawingReady('z1', 'Lobby', {
    surveyedAt: '2026-10-07T03:00:00.000Z', surveyedByName: 'ช่าง ก',
    methodChangedAt: '2026-10-08T04:00:00.000Z', methodChangedByName: 'หัวหน้า ข',
  });
  assert.deepEqual(surveyResultMethodCell(switched, null), drawing('จากแบบ · หัวหน้า ข 08/10/2026'));
  // มีชื่อแต่ไม่มีเวลา = ชื่ออย่างเดียว
  assert.equal(
    surveyResultMethodCell({ ...switched, methodChangedAt: null, surveyedAt: null, surveyedByName: null }, null).source,
    'จากแบบ · หัวหน้า ข',
  );
  // ไม่มีใครบันทึก ไม่มีคนสลับ — ถอยไปคนที่ส่งผลของใบ
  const bare = drawingReady('z1', 'Lobby');
  assert.equal(
    surveyResultMethodCell(bare, { answeredByName: 'หัวหน้า ค', answeredAt: '2026-10-09T02:00:00.000Z' }).source,
    'จากแบบ · หัวหน้า ค 09/10/2026',
  );
  // ไม่มีชื่อเลย = "จากแบบ" เฉย ๆ (ไม่มีจุดคั่นลอย ไม่มีขีด)
  assert.deepEqual(surveyResultMethodCell(bare, null), drawing('จากแบบ'));
  assert.deepEqual(surveyResultMethodCell(bare), drawing('จากแบบ'));
  assert.deepEqual(surveyResultMethodCell(bare, { answeredByName: '  ' }), drawing('จากแบบ'));
});

// ══ 8. ใบลงหน้างานล้วน — ค่าเดิมทุกคีย์ ═══════════════════════════════════

test('🔴 ใบลงหน้างานล้วน: ทั้งก้อน (ตัดคีย์ใหม่) เท่ากัน ไม่ว่าแถวมี method: onsite ไหม · สวิตช์เปิดหรือปิดเมื่อมีนัดที่เข้าพื้นที่แล้ว', () => {
  const bare = [
    onsiteReady('z1', 'Studio 01'),
    onsiteReady('z2', 'Studio 02', { spots: [{ id: 's1', label: 'มุมโซฟา', selected: false }], packageQty: null }),
    onsiteReady('z3', 'Studio 03', { parts: [] }),
    onsiteReady('z4', 'ห้องเก็บของ', { status: 'cut', cutReason: 'ลูกค้ายกเลิก' }),
  ];
  const WAYS = {
    'method: onsite': (z) => ({ ...z, method: 'onsite' }),
    'คอลัมน์ใหม่เป็น null': (z) => ({ ...z, method: null, methodReason: null, methodChangedAt: null, methodChangedByName: null }),
  };
  const filesByZone = { z1: ONSITE_FILES, z2: ONSITE_FILES, z3: [WIDE], z4: [] };
  const raw = surveySendBackState([{
    id: 'EUP-1', kind: SEND_BACK_KIND, createdAt: '2026-10-07T03:00:00.000Z', authorName: 'หัวหน้า ก',
    body: 'ส่งกลับให้ช่างแก้', meta: { note: 'ถ่ายภาพกว้างใหม่', items: ['ถ่ายภาพกว้างใหม่'] },
  }]);
  const visits = [
    null,
    ...['draft', 'scheduled', 'in_progress', 'done', 'partial', 'unable', 'cancelled', 'rescheduled'].map((status) => scheduled({
      status, actualDate: null, actualStartTime: null,
    })),
  ];
  const scenes = [
    {},
    { zones: [bare[0]] },
    { zones: [bare[0]], tab: 'result' },
    { sendBack: raw },
    { sendBack: null },
    { recall: { reason: 'แก้ตัวเลข', byName: 'หัวหน้า ก', at: ACK, totals: null } },
    { request: request({ status: 'answered', answeredAt: '2026-10-08T04:00:00.000Z', answeredByName: 'หัวหน้า ก' }) },
    { request: request({ status: 'cancelled', cancelledAt: '2026-10-08T04:00:00.000Z' }) },
    { dirtyZoneIds: ['z3'] },
    { pendingDecisionZoneIds: ['z2'] },
    { packageSizes: null },
    { zones: [] },
  ];
  let compared = 0;
  for (const scene of scenes) {
    for (const visit of visits) {
      for (const [who, viewer] of VIEWERS) {
        const zones = scene.zones || bare;
        const args = { filesByZone, ...scene, zones, visit, viewer };
        const base = card(zones, args);
        const label = `${JSON.stringify(Object.keys(scene))} · ${visit?.status} · ${who}`;
        // คีย์ใหม่ของใบลงหน้างานเป็นค่าของ "ไม่มีพื้นที่จากแบบ" เสมอ
        assert.equal(base.send.confirm.required, false, label);
        assert.equal(base.fieldTabLabel, 'หน้างาน', label);
        assert.equal(base.needsVisit, true, label);
        assert.equal(base.progress.drawing, 0, label);
        assert.equal(base.progress.text, `วัดแล้ว ${base.progress.done} / ${base.progress.total} พื้นที่`, label);
        assert.deepEqual(base.method, { show: false, allowed: false, reason: null }, label);
        for (const [name, way] of Object.entries(WAYS)) {
          assert.deepEqual(card(zones, { ...args, zones: zones.map(way) }), base, `${name} · ${label}`);
        }
        // สวิตช์เปิด + มีนัดที่เข้าพื้นที่แล้ว = ต่างได้แค่คีย์ใหม่ (ปุ่มเปลี่ยนวิธี)
        const on = card(zones, { ...args, drawingMethodEnabled: true, siteVisitReached: true });
        const off = card(zones, { ...args, drawingMethodEnabled: false, siteVisitReached: true });
        assert.deepEqual(withoutNewKeys(on), withoutNewKeys(base), `เปิด · ${label}`);
        assert.deepEqual(off, base, `ปิด · ${label}`);
        compared += 1;
      }
    }
  }
  assert.equal(compared, scenes.length * visits.length * VIEWERS.length);
});

test('🔴 ใบลงหน้างานล้วน: ถ้อยคำของมิเตอร์และเหตุใต้ปุ่มส่งยังเป็นตัวเดิม — ค่าตรงตัว ไม่ใช่เทียบกันเอง', () => {
  const zones = [
    onsiteReady('z1', 'Studio 01'),
    onsiteReady('z2', 'Studio 02', { parts: [] }),
    onsiteReady('z3', 'Studio 03', { packageQty: null }),
  ];
  const filesByZone = { z1: ONSITE_FILES, z2: ONSITE_FILES, z3: ONSITE_FILES };
  const v = card(zones, { filesByZone, visit: scheduled({ status: 'done', actualDate: '2026-10-08' }) });
  assert.deepEqual(v.status, {
    key: 'measuring', tone: 'warning', headline: 'กำลังวัดหน้างาน', sub: 'วัดแล้ว 2 / 3 พื้นที่ · เหลือ Studio 02',
  });
  assert.equal(v.send.reason.key, 'crew-gaps');
  assert.equal(v.send.reason.text, 'ยังส่งไม่ได้ — ติด 2 ข้อ ที่ Studio 02 · Studio 03 · รอช่างเก็บงาน');
  assert.deepEqual(v.send.reason.target, { kind: 'zone', zoneId: 'z2', label: 'เปิด Studio 02' });
  assert.equal(v.zoneGaps.crewPending, true);
  assert.equal(v.sendBackAction.show, true);

  const decided = card([zones[0], zones[2]], { filesByZone });
  assert.deepEqual(decided.status, {
    key: 'awaiting-decision', tone: 'info', headline: 'วัดครบแล้ว — รอหัวหน้าเคาะ',
    sub: 'วัดแล้ว 2 / 2 พื้นที่ · เหลือเคาะจุดและแพ็คเกจ',
  });
  assert.equal(decided.send.reason.key, 'head-gaps');
  assert.equal(decided.send.reason.text, 'ยังส่งไม่ได้ — ติด 1 ข้อ ที่ Studio 03');

  // ช่าง: สามข้อของตัวเอง + ด่านรูปจุด — ลำดับและตัวหารเดิม
  const crew = card(zones, { filesByZone, viewer: CREW, visit: scheduled({ status: 'in_progress' }) });
  assert.deepEqual(crew.gates.map((g) => [g.key, g.done, g.total]), [
    ['size', 2, 3], ['wide', 3, 3], ['spots', 3, 3], ['spotPhotos', 3, 3], ['spotLinked', 3, 3],
  ]);
  // ใบที่ไม่เหลือพื้นที่: ช่างยังได้สามข้อตัวหาร 0 เหมือนเดิม
  const none = card([onsiteReady('z1', 'Studio 01', { status: 'cut' })], { viewer: CREW });
  assert.deepEqual(none.gates.map((g) => [g.key, g.total]), [['size', 0], ['wide', 0], ['spots', 0], ['spotPhotos', 0], ['spotLinked', 0]]);
});

// ══ 9. ส่วนเอกสาร — ข้อกันของใบที่มีพื้นที่จากแบบ ═══════════════════════════

const ANSWERED = '2026-10-08T04:00:00.000Z';
const sentRequest = () => request({ status: 'answered', answeredAt: ANSWERED, answeredByName: 'หัวหน้า ก' });
const ACCESS = { customer: true, internal: true, issue: true, draft: true, history: true };
const missingDoc = (blockers, extra = {}) => ({
  access: ACCESS, issueAtSend: true, storeAllowed: true, state: 'missing', current: null, history: [], nextDocNo: null,
  send: null, issue: { blockers, warnings: [], unknown: false }, ...extra,
});
const HOLD = { kind: 'system', text: SURVEY_REPORT_DRAWING_HOLD, hold: true };
const MEASURED = [{ id: 'z1', status: 'ok', method: 'drawing', parts: [part(4, 5, 3)] }];
const sheet = (document, extra = {}) => surveyDocumentView({
  document, request: sentRequest(), zones: MEASURED, canDecide: true, failedGates: [], spotsUnlinked: false, ...extra,
});

test('⭐ ส่วนเอกสาร · ติดแค่ข้อกันเอกสาร: ประโยคของข้อกันอย่างเดียว — ไม่ชวนกดซ้ำ ไม่ชวนดึงผลกลับ · ปุ่มออกเอกสารจาง', () => {
  const view = sheet(missingDoc([HOLD]));
  assert.deepEqual(view.status, {
    tone: 'warning', text: SURVEY_REPORT_DRAWING_HOLD, items: [], foot: null, action: null,
  });
  assert.equal(view.status.text, 'เอกสารประเมินของใบที่ประเมินจากแบบยังออกไม่ได้ — ระบบกำลังปรับแบบเอกสาร');
  assert.equal(view.issue.allowed, false, 'กดซ้ำไม่ช่วย — ปุ่มไม่ถูกเสนอเป็นทางออก');
  assert.doesNotMatch(JSON.stringify(view.status), /ตรวจอีกครั้ง|กดออกเอกสาร|ดึงผลกลับ|ติด \d+ ข้อ/);
  assert.deepEqual(view.badge, { label: 'ยังไม่ออก', tone: 'warning' });

  // แถวซ้ำที่ไม่มีธงไม่ทำให้ข้อกันกลายเป็นเหตุที่ "แก้แล้วกดซ้ำได้" (กติกาเดียวกับ route ออกเอกสาร)
  const dup = sheet(missingDoc([{ kind: 'system', text: SURVEY_REPORT_DRAWING_HOLD }, HOLD]));
  assert.deepEqual(dup.status, view.status);
  assert.equal(dup.issue.allowed, false);

  // ข้อผิดพลาดที่จอจำไว้ ("กดออกเอกสารอีกครั้ง") ไม่ชนะข้อกันสดของ server
  const remembered = sheet(missingDoc([HOLD]), {
    local: { round: ANSWERED, issueError: { code: 'internal', message: 'ออกเอกสารไม่สำเร็จ — กดออกเอกสารอีกครั้ง', retry: true } },
  });
  assert.deepEqual(remembered.status, view.status);
  assert.equal(remembered.issue.allowed, false);

  // ค่าที่ไม่ใช่ `true` ตรงตัวไม่นับเป็นข้อกัน — ได้กล่องเดิมของเหตุระบบ
  const notHold = sheet(missingDoc([{ kind: 'system', text: SURVEY_REPORT_DRAWING_HOLD, hold: 'yes' }]));
  assert.equal(notHold.status.text, 'ส่งผลแล้ว แต่ยังออกเอกสารไม่ได้ — ติด 1 ข้อ');
  assert.equal(notHold.status.foot, 'แก้ตามรายการแล้วกด “ตรวจอีกครั้ง” — ไม่ต้องดึงผลกลับ');
});

test('ส่วนเอกสาร · ข้อกัน + เหตุอื่น: คำแนะนำเดิมของเหตุอื่นนั้น (ดึงผลกลับ / ตรวจอีกครั้ง) · ข้อกันอยู่ในรายการด้วย', () => {
  const content = { kind: 'content', text: 'Lobby ยังไม่มีภาพแบบของพื้นที่' };
  const withContent = sheet(missingDoc([HOLD, content]));
  assert.deepEqual(withContent.status, {
    tone: 'warning', text: 'ส่งผลแล้ว แต่ยังออกเอกสารไม่ได้ — ติด 2 ข้อ',
    items: [SURVEY_REPORT_DRAWING_HOLD, content.text],
    foot: 'ดึงผลกลับมาแก้แล้วส่งใหม่',
    action: { kind: 'reload', label: 'ตรวจอีกครั้ง' },
  });
  assert.equal(withContent.issue.allowed, false);

  const system = { kind: 'system', text: 'ยังไม่มีข้อมูลบริษัทสำหรับหัวกระดาษ' };
  const withSystem = sheet(missingDoc([system, HOLD]));
  assert.equal(withSystem.status.text, 'ส่งผลแล้ว แต่ยังออกเอกสารไม่ได้ — ติด 2 ข้อ');
  assert.equal(withSystem.status.foot, 'แก้ตามรายการแล้วกด “ตรวจอีกครั้ง” — ไม่ต้องดึงผลกลับ');
  assert.deepEqual(withSystem.status.action, { kind: 'reload', label: 'ตรวจอีกครั้ง' });

  // 🔴 ใบที่ไม่มีข้อกัน: กล่องเดิมทุกตัวอักษร
  assert.deepEqual(sheet(missingDoc([system])).status, {
    tone: 'warning', text: 'ส่งผลแล้ว แต่ยังออกเอกสารไม่ได้ — ติด 1 ข้อ', items: [system.text],
    foot: 'แก้ตามรายการแล้วกด “ตรวจอีกครั้ง” — ไม่ต้องดึงผลกลับ', action: { kind: 'reload', label: 'ตรวจอีกครั้ง' },
  });
  assert.equal(sheet(missingDoc([])).issue.allowed, true);
});

test('การ์ดของใบจากแบบที่ส่งผลแล้ว: ส่วนเอกสารพูดประโยคของข้อกันอย่างเดียว · แถวด่านเอกสารยังบอกว่าติด', () => {
  const zones = [drawingReady('z1', 'Lobby')];
  const v = card(zones, { request: sentRequest(), document: missingDoc([HOLD]) });
  assert.equal(v.document.show, true);
  assert.deepEqual(v.document.status, {
    tone: 'warning', text: SURVEY_REPORT_DRAWING_HOLD, items: [], foot: null, action: null,
  });
  assert.equal(v.document.issue.allowed, false);
  const gate = v.gates.find((g) => g.key === 'document');
  assert.equal(gate.ok, false);
  assert.deepEqual(gate.reasons, [SURVEY_REPORT_DRAWING_HOLD]);
  assert.equal(v.status.key, 'sent', 'ผลถึงฝ่ายขายตามปกติ — ข้อกันไม่เปลี่ยนสถานะของใบ');
});

// ══ 10. รอบแก้หลังรีวิว S2a — รางของงานโต๊ะ · หัวข้อด่านของคนที่ไม่ได้เคาะ · ส่วนเอกสารก่อนส่ง ═══════════

test('🔴 รางบนการ์ดของใบจากแบบทั้งใบ: ชื่อขั้นของงานโต๊ะ — ไม่มี "ลงคิว" / "เข้าพื้นที่" ทั้งชื่อและบรรทัดใต้ขั้น · ใบลงหน้างานได้ชื่อเดิม', () => {
  const desk = [drawingReady('z1', 'Lobby'), drawingEmpty('z2', 'Lounge'), drawingEmpty('z3', 'Spa')];
  const LABELS = ['ส่งคำร้อง', 'รับเรื่อง', 'รับปากวันส่งผล', 'ประเมินจากแบบ', 'ส่งผล', 'ปิดเรื่อง'];
  for (const [who, viewer] of VIEWERS) {
    // รับปากวันส่งผลแล้ว = ขั้น "ประเมินจากแบบ" · บรรทัดใต้ขั้นคือมิเตอร์ตัวเดียวกับการ์ด
    const promised = card(desk, { viewer });
    assert.deepEqual(promised.step.steps.map((s) => s.label), LABELS, who);
    assert.equal(promised.step.label, 'ประเมินจากแบบ', who);
    assert.equal(promised.step.hint, promised.progress.text, who);
    assert.equal(promised.step.hint, 'จากแบบ 3 พื้นที่', who);
    // ยังไม่รับปาก = ค้างที่ "รับปากวันส่งผล" · ไม่มีบรรทัด "รอ … ลงคิว"
    const waiting = card(desk, { viewer, request: request({ committedDueDate: null, committedResultDate: null }) });
    assert.equal(waiting.step.label, 'รับปากวันส่งผล', who);
    assert.equal(waiting.step.hint, null, who);
    // นัดเก่าที่ติดใบ (จากตอนยังเป็นงานหน้างาน) ไม่โผล่ใต้ขั้นของงานโต๊ะ
    const stray = card(desk, { viewer, visit: scheduled({ status: 'cancelled' }) });
    for (const view of [promised, waiting, stray]) {
      for (const step of view.step.steps.slice(2, 4)) {
        assert.doesNotMatch(`${step.label} ${step.hint ?? ''}`, /ลงคิว|เข้าพื้นที่|SV-/, `${who} · ${step.id}`);
      }
      assert.doesNotMatch(`${view.step.label} ${view.step.hint ?? ''}`, /ลงคิว|เข้าพื้นที่|วัดแล้ว/, who);
    }
  }

  // ใบผสม: ชื่อขั้นของรางหน้างานตัวเดิม · บรรทัดใต้ขั้น "เข้าพื้นที่" ไม่เรียกพื้นที่จากแบบว่าวัดแล้ว
  const mixed = card([onsiteReady('z1', 'Studio 01'), drawingEmpty('z2', 'Lounge')], { visit: scheduled({ status: 'in_progress' }) });
  assert.equal(mixed.step.label, 'เข้าพื้นที่');
  assert.equal(mixed.step.hint, 'วัดแล้ว 1 / 1 พื้นที่ · จากแบบ 1 (หัวหน้ากรอกเอง)');
  // 🔴 ใบลงหน้างานล้วน: ทุกตัวอักษรเดิม (ไม่มีช่องว่างรอบเครื่องหมายทับของบรรทัดนี้)
  const onsite = card([onsiteReady('z1', 'Studio 01'), onsiteReady('z2', 'Studio 02')], { visit: scheduled({ status: 'in_progress' }) });
  assert.deepEqual(onsite.step.steps.map((s) => s.label).slice(2, 4), ['ลงคิว / นัด', 'เข้าพื้นที่']);
  assert.equal(onsite.step.hint, 'วัดแล้ว 2/2 พื้นที่');
});

test('ใบจากแบบทั้งใบ · คนที่ไม่ได้เคาะ (ผู้วางคิว · ช่างของนัดเก่า): `gatesHidden` — ไม่มีบล็อก "ของที่ช่างต้องเก็บ" และปุ่มคลี่ไม่เอ่ยถึง', () => {
  const desk = [drawingReady('z1', 'Lobby'), drawingEmpty('z2', 'Lounge')];
  for (const [who, viewer] of [['ผู้วางคิว', PLANNER], ['ช่าง', CREW]]) {
    const v = card(desk, { viewer });
    assert.equal(v.gatesHidden, true, who);
    // แถวที่เหลือในลิสต์เป็นด่านรูปจุด 0 / 0 (ไม่มีจุดให้ถ่าย) — ไม่มีของให้เก็บจริงสักข้อ จอจึงไม่วาดทั้งบล็อก
    assert.deepEqual(v.gates.map((g) => g.total), v.gates.map(() => 0), who);
    assert.equal(v.fold.labels.gates, null, who);
  }
  // หัวหน้ายังเห็นด่านของตัวเอง
  for (const viewer of [HEAD, HEAD_ON_VISIT]) {
    const v = card(desk, { viewer });
    assert.equal(v.gatesHidden, false);
    assert.equal(v.gatesTitle, 'ด่านก่อนส่งผล');
    assert.ok(v.fold.labels.gates.startsWith('ด่านก่อนส่งผล'));
  }
  // ใบผสมและใบลงหน้างาน: ช่างยังมีของให้เก็บ — บล็อกอยู่ตามเดิม
  for (const zones of [
    [onsiteReady('z1', 'Studio 01'), drawingEmpty('z2', 'Lounge')],
    [onsiteReady('z1', 'Studio 01')],
  ]) {
    for (const [who, viewer] of VIEWERS) assert.equal(card(zones, { viewer }).gatesHidden, false, who);
    assert.equal(card(zones, { viewer: CREW }).fold.labels.gates, 'ของที่ช่างต้องเก็บ (ผ่านครบ)');
  }
});

test('🔴 ส่วนเอกสารก่อนส่งผลของใบที่มีพื้นที่จากแบบ: ประโยคเดียวกับโมดัลยืนยันส่งผล — ไม่สัญญาเลขที่เอกสาร · ใบลงหน้างานได้ประโยคเดิม', () => {
  const HOLD_EFFECT = 'เอกสารประเมิน (เลข SU) ของใบที่ประเมินจากแบบยังออกไม่ได้ — ระบบกำลังปรับแบบเอกสาร · ผลถึงฝ่ายขายตามปกติ';
  const notSent = (extra = {}) => ({
    access: ACCESS, issueAtSend: true, storeAllowed: true, state: 'not_sent', current: null, history: [], nextDocNo: null,
    send: { blockers: [], warnings: [], unknown: false }, issue: null, ...extra,
  });
  const desk = [drawingReady('z1', 'Lobby')];
  const mixed = [onsiteReady('z1', 'Studio 01'), drawingReady('z2', 'Lounge')];
  for (const zones of [desk, mixed]) {
    for (const document of [notSent(), notSent({ issueAtSend: false, send: null }), notSent({ send: { blockers: [SURVEY_REPORT_DRAWING_HOLD], warnings: [], unknown: false } })]) {
      const v = card(zones, { document, visit: zones === mixed ? scheduled({ status: 'done' }) : null });
      assert.equal(v.document.show, true);
      assert.deepEqual(v.document.status, { tone: 'info', text: HOLD_EFFECT, items: [], foot: null, action: null });
      assert.doesNotMatch(JSON.stringify(v.document.status), /ออกเลขที่เอกสาร|กด “ออกเอกสาร”|ตรวจอีกครั้ง/);
    }
  }
  // คำของโมดัลยืนยันกับของส่วนเอกสารเป็นตัวเดียวกัน
  assert.ok(card(desk, { document: notSent() }).send.allowed);

  // ดึงผลกลับมาแก้: ไม่สัญญา Rev ถัดไป
  const recalled = surveyDocumentView({
    document: { ...notSent(), state: 'recalled', history: [{ docNo: 'SU-26100001-R00', state: 'recalled' }], nextDocNo: 'SU-26100001-R01' },
    request: request(), zones: MEASURED, canDecide: true, drawingHold: HOLD_EFFECT,
  });
  assert.equal(recalled.status.text, `SU-26100001-R00 ถูกแทนที่แล้ว — ${HOLD_EFFECT}`);
  assert.doesNotMatch(recalled.status.text, /R01|ส่งผลอีกครั้ง/);

  // 🔴 ใบลงหน้างานล้วน: ประโยคเดิมทุกตัวอักษร · ไม่ส่ง `drawingHold` = เหมือนเดิม
  const onsite = card([onsiteReady('z1', 'Studio 01')], { document: notSent(), visit: scheduled({ status: 'done' }) });
  assert.equal(onsite.document.status.text, 'พร้อมแล้ว — กดส่งผลเพื่อออกเลขที่เอกสาร');
  const plain = surveyDocumentView({ document: notSent(), request: request(), zones: MEASURED, canDecide: true });
  assert.equal(plain.status.text, 'พร้อมแล้ว — กดส่งผลเพื่อออกเลขที่เอกสาร');
});

test('surveyResultMethodCell · `addedLabel`: พื้นที่จากแบบที่หัวหน้าเพิ่ม = "เพิ่มโดย {ฝ่าย}" · ลงหน้างานที่ช่างเพิ่ม = "เพิ่มหน้างาน" · ไม่ได้ถูกเพิ่ม = null', () => {
  assert.equal(surveyResultMethodCell(drawingReady('z1', 'Lobby', { status: 'added' }), request()).addedLabel, 'เพิ่มโดย TS');
  assert.equal(surveyResultMethodCell(drawingEmpty('z1', 'Lobby', { status: 'added' }), null).addedLabel, 'เพิ่มโดย TS', 'ไม่รู้ฝ่าย = TS');
  assert.equal(surveyResultMethodCell(onsiteReady('z1', 'Studio 01', { status: 'added' }), request()).addedLabel, 'เพิ่มหน้างาน');
  assert.equal(surveyResultMethodCell(drawingReady('z1', 'Lobby'), request()).addedLabel, null);
  assert.equal(surveyResultMethodCell(drawingReady('z1', 'Lobby', { status: 'cut' }), request()).addedLabel, null);
});
