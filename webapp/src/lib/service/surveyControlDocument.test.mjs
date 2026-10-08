// ── การ์ดจัดการผล × เอกสารประเมิน (PR-3 · สเปก §3.4 · §8) — แถวด่าน · เหตุที่ส่งไม่ได้ · กล่องแจ้ง · ดึงผลกลับ ─────────
//
// ⭐ ตัวตรวจเอกสารอยู่ฝั่ง server (`document.send` / `document.issue` ของ GET ใบประเมิน) — ไฟล์นี้ล็อกว่าการ์ด **จัดผลนั้น**
//   ถูก: จำนวนข้อคงที่ทุกสถานะ · ประโยคเดียวกับ route · ลำดับเดียวกับ route · และ `seenWarnings` กลับไปหา server ดิบ ๆ
// 🔴 ไม่ส่ง `document` = คีย์เดิมทุกตัวได้ค่าเดิม (หน้าคำร้องเรียกแบบนี้) — เทสต์ชุดเดิมใน surveyControl.test.mjs คือยามตัวที่สอง
import test from 'node:test';
import assert from 'node:assert/strict';
import { surveyControlView as controlView } from './surveyControl.js';
import { surveyDocumentView, surveyFilesSignature } from './surveyDocumentView.js';
import { surveySendDocumentRefusal, surveySendDocumentRefusalList, surveySendUnseenWarnings } from './surveySendClose.js';

// ── ของตั้งต้น (ชุดเดียวกับ surveyControl.test.mjs) ─────────────────────────
const SIZES = [
  { code: 'XS', nameEn: 'Extra Small', maxCbm: null, autoSuggest: false },
  { code: 'SM', nameEn: 'Small', maxCbm: 300, autoSuggest: true },
  { code: 'ST', nameEn: 'Standard', maxCbm: 2400, autoSuggest: true },
  { code: 'XL', nameEn: 'Extra Large', maxCbm: null, autoSuggest: true },
];
const TODAY = '2026-10-01';
const part = (w, l, h) => ({ widthM: w, lengthM: l, heightM: h, label: null });
const WIDE = { id: 'F-wide', docType: 'survey_wide' };
const PLAN = { id: 'F-plan', docType: 'survey_plan' };
const SPOT = { id: 'F-spot', docType: 'survey_spot', fileName: 'spot.jpg', metadata: { spotId: 's1' } };
const LOOSE = { id: 'F-loose', docType: 'survey_spot', fileName: 'loose.jpg', metadata: {} };
const readyZone = (id, name, extra = {}) => ({
  id, zoneId: `SZN-${id}`, zoneName: name, floor: '02', status: 'ok',
  parts: [part(4, 5, 3)], spots: [{ id: 's1', label: 'มุมโซฟา', selected: true }],
  packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM', packageNote: '', note: '', ...extra,
});
const measuredZone = (id, name) => readyZone(id, name, {
  spots: [{ id: 's1', label: 'มุมโซฟา', selected: false }], packageQty: null, packageSize: null, packageSizeSuggested: null,
});
const READY_FILES = [WIDE, PLAN, SPOT];

const ANSWERED = '2026-10-01T03:04:00.000Z';
const request = (extra = {}) => ({
  id: 'DR-1', docNo: 'RQ-AS-26090106', title: 'S&S ประเมินพื้นที่', kind: 'site_survey', dept: 'TS',
  status: 'acknowledged', siteId: 'SS-1', customerId: 'CU-1', committedDueDate: '2026-10-05', ...extra,
});
const sentRequest = (extra = {}) => request({ status: 'answered', answeredAt: ANSWERED, answeredByName: 'หัวหน้า ก', ...extra });

const HEAD = { canWrite: true, canDecide: true };
const HEAD_NO_WRITE = { canWrite: false, canDecide: true }; // CD / CM — ส่งผลได้ แต่เขียนผลวัดไม่ได้
const CREW = { canWrite: true, canDecide: false };

const ACCESS = { customer: true, internal: true, issue: true, draft: true, history: true };
const headDoc = (extra = {}) => ({
  access: ACCESS, issueAtSend: true, storeAllowed: true, state: 'not_sent', current: null,
  history: [], nextDocNo: null, send: null, issue: null, ...extra,
});
const OK = { blockers: [], warnings: [], unknown: false };
const currentRow = (extra = {}) => ({
  docNo: 'SU-26100001-0', rev: 0, issuedAt: ANSWERED, issuedByName: 'หัวหน้า ก', approvedByName: 'หัวหน้า ก',
  approvedAt: ANSWERED, frozenAt: null, ready: { customer: false, internal: false }, ...extra,
});
const HISTORY = [{ docNo: 'SU-26100001-0', rev: 0, issuedAt: ANSWERED, supersededAt: ANSWERED, supersededReason: 'recall' }];

/** ใบที่ผ่านด่านครบ พร้อมส่ง (ไม่มีนัดค้าง) — เปลี่ยนเฉพาะสิ่งที่เทสต์สนใจ */
const view = (args = {}) => controlView({
  request: request(), zones: [readyZone('z1', 'Studio 01')], filesByZone: { z1: READY_FILES },
  viewer: HEAD, today: TODAY, packageSizes: SIZES, ...args,
});
const docGate = (v) => v.gates.find((g) => g.key === 'document') || null;
const notice = (v, key) => v.notices.find((n) => n.key === key) || null;

const RECALL_HINT = 'ต้องใส่เหตุผล · ฝ่ายขายได้แจ้งเตือนว่าตัวเลขเดิมใช้ไม่ได้';
const RECALL_DETAIL = 'ฝ่ายขายได้รับแจ้งทันทีพร้อมตัวเลขเดิม · ตอนส่งรอบใหม่ ระบบจะบอกส่วนต่างให้เขาเห็น';

// ══ ไม่ส่ง `document` ═════════════════════════════════════════════════════

test('🔴 ไม่ส่ง `document` = คีย์เดิมได้ค่าเดิม · ไม่มีแถวเอกสาร · คีย์ใหม่เป็นค่าว่าง (หน้าคำร้องเรียกแบบนี้)', () => {
  const scenes = [
    {},
    { zones: [measuredZone('z1', 'Studio 01')], filesByZone: { z1: [WIDE, SPOT] } },
    { filesByZone: { z1: [...READY_FILES, LOOSE] } },
    { request: sentRequest() },
    { request: sentRequest({ closedAt: ANSWERED, status: 'closed' }) },
    { request: request({ cancelledAt: ANSWERED, status: 'cancelled' }) },
    { recall: { reason: 'แก้ตัวเลข', byName: 'หัวหน้า ก', at: ANSWERED, totals: null } },
    { viewer: CREW },
    { visit: { id: 'SVV-1', code: 'SV-1', status: 'draft', scheduledDate: '2026-10-02' } },
  ];
  for (const scene of scenes) {
    const bare = view(scene);
    // ส่งมาแต่ไม่มีสิทธิ์ (รูปที่ช่างได้) ต้องเท่ากับไม่ส่งทุกคีย์ — รวมคีย์ใหม่
    assert.deepEqual(view({ ...scene, document: { access: 'none' }, documentLocal: null }), bare, JSON.stringify(scene));
    assert.deepEqual(view({ ...scene, document: null, documentLocal: { round: ANSWERED, printed: ['x'] } }), bare);
    assert.equal(docGate(bare), null);
    assert.equal(bare.gatesSentFailed, 0);
    assert.equal(bare.document.show, false);
    assert.deepEqual(
      [bare.send.issuesDocument, bare.send.replacesDocNo, bare.send.seenWarnings, bare.send.documentUnknown],
      [false, null, [], false],
    );
    assert.equal(bare.recallAction.hint, RECALL_HINT);
    assert.equal(bare.recallAction.detail, RECALL_DETAIL, 'ประโยคเดิมของกล่องยืนยันดึงผลกลับ');
    assert.equal(bare.recallAction.voidsDocNo, null);
    assert.ok(bare.notices.every((n) => !['document-warnings', 'send-refused'].includes(n.key)));
    assert.equal(bare.gatesFailed, bare.gates.filter((g) => !g.ok).length);
    /* การ์ดที่ไม่มีส่วนเอกสาร = ผังเดิมทุก px: จอ >1050 ไม่พับ (ทั้งที่รางและที่ 1051–1199) · ปุ่มคลี่ของจอ ≤1050 ไม่เอ่ยถึงเอกสารประเมิน
       (มติเจ้าของ 08/10 ชุดสุดท้าย) · บล็อกด่านไม่มีแถวของด่านเอกสาร */
    assert.equal(bare.fold.wide, false);
    assert.equal(bare.fold.belowRail, false);
    assert.equal(bare.fold.labels.document, null);
    assert.deepEqual(bare.gateNotes, []);
  }
  // ใบพร้อมส่ง: ค่าที่จอใช้ตัดสินปุ่มยังเหมือนเดิม
  const ready = view();
  assert.equal(ready.status.key, 'ready');
  assert.equal(ready.send.allowed, true);
  assert.equal(ready.send.reason, null);
  assert.deepEqual(Object.keys(ready.recallAction), ['show', 'allowed', 'hint', 'voidsDocNo', 'detail']);
});

test('ส่วนเอกสารของการ์ด = ผลของ `surveyDocumentView` ตัวเดียวกัน · ช่างไม่ได้อะไรเลย', () => {
  const document = headDoc({ send: OK });
  const v = view({ document });
  assert.deepEqual(v.document, surveyDocumentView({
    document, request: request(), zones: [readyZone('z1', 'Studio 01')], local: null,
    canDecide: true, canWrite: true, failedGates: [], spotsUnlinked: false,
  }));
  assert.equal(v.document.show, true);
  assert.equal(v.document.status.text, 'พร้อมแล้ว — กดส่งผลเพื่อออกเลขที่เอกสาร');
  // ช่าง: server ให้ `{ access: 'none' }` — ไม่มีส่วน ไม่มีแถว ไม่มีกล่อง
  const crew = view({ document: { access: 'none' }, viewer: CREW });
  assert.equal(crew.document.show, false);
  assert.equal(docGate(crew), null);
  // ถึงจะได้ payload ของหัวหน้ามาผิด ๆ คนที่ส่งผลไม่ได้ก็ไม่มีแถวและไม่มีส่วน
  const leaked = view({ document: headDoc({ send: { ...OK, blockers: ['x'], warnings: ['y'] } }), viewer: CREW });
  assert.equal(leaked.document.show, false);
  assert.equal(docGate(leaked), null);
  assert.deepEqual(leaked.send.seenWarnings, []);
  assert.equal(notice(leaked, 'document-warnings'), null);
});

// ══ ผังของส่วนรอง + คำบนปุ่มคลี่ (มติเจ้าของ 08/10 ชุดสุดท้าย) ═══════════════════════════════
//   ราง (≥1200) ก่อนส่งผล: ไม่มีปุ่มคลี่ ด่านกางที่เดิมเหมือนก่อน PR-3 ส่วนเอกสารต่อใต้ด่าน · ส่งผลแล้ว (ทุกความกว้าง): ส่วนเอกสารอยู่บน
//   ด่าน · ขั้นตอน · เอกสารที่เกี่ยวข้อง พับหลังปุ่มคลี่ · ไม่มีราง (<1200) ก่อนส่งผล: พับเหมือนแท็บเล็ต (ส่วนเอกสารพับไปด้วย) ·
//   จอ ≤1050 พับเสมอ · การ์ดที่ไม่มีส่วนเอกสารเหมือนเดิม
//   `wide` = พับทุกความกว้าง · `belowRail` = พับทุกที่ที่การ์ดไม่ได้อยู่ในราง (การ์ดอ่านคู่กับ `SURVEY_RAIL_QUERY`)

test('`fold`: พับทุกความกว้างเฉพาะการ์ดที่มีส่วนเอกสารของใบที่ส่งผลแล้ว/จบแล้ว · ก่อนส่งผลพับเฉพาะที่ที่ไม่มีราง · ปุ่มเอ่ยเฉพาะก้อนที่อยู่ข้างในจริง', () => {
  /* ก่อนส่งผล (หัวหน้า · มีส่วนเอกสาร): ที่รางไม่พับ · ไม่มีราง (1051–1199) พับ · ส่วนเอกสารอยู่ในส่วนรอง ⇒ ปุ่มเอ่ยถึง และเรียกชื่อเต็มทั้งสองก้อนเอกสาร */
  const ready = view({ document: headDoc({ send: OK }) });
  assert.equal(ready.document.placement, 'fold');
  assert.deepEqual(ready.fold, {
    wide: false,
    belowRail: true,
    labels: { gates: 'ด่านก่อนส่งผล (ผ่านครบ)', document: 'เอกสารประเมิน', steps: 'ขั้นตอน', refs: 'เอกสารที่เกี่ยวข้อง' },
  });
  const stuck = view({ document: headDoc({ send: { ...OK, blockers: ['ลูกค้ายังไม่มีที่อยู่'] } }) });
  assert.equal(stuck.fold.labels.gates, `ด่านก่อนส่งผล (ติด ${stuck.gatesFailed})`, 'จำนวนเดียวกับป้ายของบล็อกด่าน');
  assert.equal(stuck.gatesFailed, 1);
  assert.deepEqual([stuck.fold.wide, stuck.fold.belowRail], [false, true]);
  /* ดึงผลกลับแล้ว = ยังไม่ส่ง ⇒ ผังก่อนส่งผล */
  const recalled = view({ document: headDoc({ state: 'recalled', history: HISTORY, nextDocNo: 'SU-26100001-1', send: OK }) });
  assert.equal(recalled.document.placement, 'fold');
  assert.deepEqual([recalled.fold.wide, recalled.fold.belowRail], [false, true]);
  assert.equal(recalled.fold.labels.document, 'เอกสารประเมิน');

  /* ส่งผลแล้ว: พับทุกความกว้าง · ส่วนเอกสารอยู่นอกส่วนที่พับ ⇒ ปุ่มไม่เอ่ยถึง · "เอกสาร" คำสั้น = เอกสารที่เกี่ยวข้อง (ป้ายเดิมทุกตัวอักษร) */
  for (const state of ['issuing', 'missing', 'issued', 'frozen', 'ready']) {
    const sent = view({ request: sentRequest(), document: headDoc({ state, issue: OK, current: state === 'issuing' || state === 'missing' ? null : currentRow() }) });
    assert.equal(sent.document.placement, 'pinned', state);
    assert.deepEqual(sent.fold, {
      wide: true,
      belowRail: false,
      labels: { gates: 'ด่านก่อนส่งผล (ผ่านครบ)', document: null, steps: 'ขั้นตอน', refs: 'เอกสาร' },
    }, state);
  }
  /* ส่งผลแล้วแต่แถวเอกสารติด = `gatesSentFailed` (ไม่ใช่จำนวนด่านก่อนส่ง) */
  const stale = view({ request: sentRequest(), document: headDoc({ state: 'stale', current: currentRow({ approvedAt: '2026-09-01T00:00:00.000Z' }) }) });
  assert.equal(stale.gatesSentFailed, 1);
  assert.equal(stale.fold.labels.gates, 'ด่านก่อนส่งผล (ติด 1)');
  assert.deepEqual([stale.fold.wide, stale.fold.belowRail], [true, false]);

  /* ส่วนเอกสารปักไว้ด้วยเหตุอื่น **หลังพ้นช่วงก่อนส่งผล** (อ่านสถานะไม่สำเร็จบนใบที่ส่งแล้ว · ใบจบแล้วที่เคยมีเอกสาร) ⇒ พับทุกความกว้างเหมือนกัน */
  for (const [name, pinned] of [
    ['อ่านสถานะไม่สำเร็จ · ส่งแล้ว', view({ request: sentRequest(), document: { access: 'none', unknown: true } })],
    ['ปิดโดยไม่ได้ส่งผล · เคยมีเอกสาร', view({ request: request({ closedAt: ANSWERED, status: 'closed' }), document: headDoc({ state: 'recalled', history: HISTORY }) })],
    ['ยกเลิกหลังส่งผล · มีเอกสาร', view({ request: sentRequest({ cancelledAt: ANSWERED, status: 'cancelled' }), document: headDoc({ state: 'ready', current: currentRow() }) })],
  ]) {
    assert.equal(pinned.document.show, true, name);
    assert.equal(pinned.document.placement, 'pinned', name);
    assert.deepEqual([pinned.fold.wide, pinned.fold.belowRail], [true, false], name);
    assert.equal(pinned.fold.labels.document, null, name);
  }
  /* 🐞 **ใบที่ยังไม่ส่ง แต่อ่านสถานะเอกสารไม่สำเร็จ** — ส่วนเอกสารปักไว้ให้เห็น "โหลดใหม่" (สเปก §3.3) แต่ปุ่มส่งผลยังกดได้
     ⇒ ที่รางด่านต้องกาง ไม่มีปุ่มคลี่บัง (มติ: ก่อนส่งผล ด่านกางเหมือนก่อน PR-3) · เดิมผังอ่าน `placement` ค่าเดียวแล้วพับด่านเหมือนใบที่ส่งแล้ว
     ⇒ `wide` ดูว่าพ้นช่วงก่อนส่งผลหรือยังด้วย · ไม่มีราง = พับเหมือนใบก่อนส่งผลใบอื่น (ส่วนเอกสารยังเห็นอยู่เหนือปุ่มคลี่) */
  const unknownUnsent = view({ document: { access: 'none', unknown: true } });
  assert.equal(unknownUnsent.document.show, true);
  assert.equal(unknownUnsent.document.placement, 'pinned');
  assert.equal(unknownUnsent.send.show, true);
  assert.equal(unknownUnsent.send.allowed, true, 'ปุ่มส่งผลยังกดได้ — ด่านต้องไม่ถูกพับที่ราง');
  assert.deepEqual([unknownUnsent.fold.wide, unknownUnsent.fold.belowRail], [false, true]);
  assert.equal(unknownUnsent.fold.labels.document, null, 'ส่วนเอกสารอยู่เหนือปุ่มคลี่ — ปุ่มไม่เอ่ยถึง');

  /* 🔑 สองธงไม่มีวันจริงพร้อมกัน และจริงได้เฉพาะการ์ดที่มีส่วนเอกสาร */
  for (const v of [ready, stuck, recalled, stale, unknownUnsent]) {
    assert.equal(v.fold.wide && v.fold.belowRail, false);
    assert.equal(v.fold.wide || v.fold.belowRail, v.document.show);
  }

  /* 🔴 การ์ดที่ไม่มีส่วนเอกสาร — จอ >1050 ไม่พับ (ทั้งสองธง false) · ป้ายเดิมทุกตัวอักษร · ชื่อก้อนด่าน = หัวข้อของบล็อกข้างใน (ช่างกับหัวหน้าคนละคำ) */
  const crew = view({ viewer: CREW, document: { access: 'none' }, zones: [measuredZone('z1', 'Studio 01')], filesByZone: { z1: [] } });
  assert.equal(crew.document.show, false);
  assert.equal(crew.gatesTitle, 'ของที่ช่างต้องเก็บ');
  assert.deepEqual(crew.fold, {
    wide: false,
    belowRail: false,
    labels: { gates: `ของที่ช่างต้องเก็บ (ติด ${crew.gatesFailed})`, document: null, steps: 'ขั้นตอน', refs: 'เอกสาร' },
  });
  assert.ok(crew.gatesFailed > 0);
  const viewer = view({ viewer: { canWrite: false, canDecide: false }, request: sentRequest(), document: headDoc({ state: 'ready', current: currentRow() }) });
  assert.equal(viewer.document.show, false, 'คนดูที่ไม่ได้ส่งผลไม่มีส่วนเอกสาร');
  assert.deepEqual(viewer.fold, { wide: false, belowRail: false, labels: { gates: `${viewer.gatesTitle} (ผ่านครบ)`, document: null, steps: 'ขั้นตอน', refs: 'เอกสาร' } });
  /* หัวหน้าที่ไม่มีส่วนเอกสาร (สวิตช์/สิทธิ์ไม่ให้ · ใบจบแล้วที่ไม่เคยมีเอกสาร) ก็เหมือนเดิม */
  const headBare = view({ document: { access: 'none' } });
  assert.equal(headBare.document.show, false);
  assert.deepEqual([headBare.fold.wide, headBare.fold.belowRail], [false, false]);
  const endedBare = view({ request: request({ closedAt: ANSWERED, status: 'closed' }), document: headDoc({ state: 'not_sent' }) });
  assert.equal(endedBare.document.show, false);
  assert.deepEqual([endedBare.fold.wide, endedBare.fold.belowRail], [false, false]);

  /* ใบที่ยกเลิก: ไม่มีก้อนด่าน ⇒ ปุ่มไม่เอ่ยถึง · ป้ายสั้น จึงใช้ชื่อเต็มของก้อนเอกสารที่เกี่ยวข้อง (เหมือนเดิม) */
  const cancelled = view({ request: request({ cancelledAt: ANSWERED, status: 'cancelled' }) });
  assert.equal(cancelled.flags.cancelled, true);
  assert.deepEqual(cancelled.fold, { wide: false, belowRail: false, labels: { gates: null, document: null, steps: 'ขั้นตอน', refs: 'เอกสารที่เกี่ยวข้อง' } });
});

/* 🐞 UAT PR-3 (S03 · S25 · S26 ที่ราง · S09 · S15 เมื่อคลี่): ป้ายบล็อกด่าน "ติด 1 / 8 ข้อ" ไม่มีแถวไหนบอกว่าข้อไหน ยืนอยู่ระหว่าง "ติด 2 ข้อ"
   ของกล่องเหตุกับของส่วนเอกสาร — ตัวเลขสามตัวของเรื่องเดียว */
test('`gateNotes`: ด่านเอกสารที่ติดถูกเอ่ยชื่อในบล็อกด่าน แล้วชี้ไปส่วนเอกสาร — ไม่พิมพ์เหตุหรือจำนวนซ้ำ · ไม่มีส่วนเอกสาร = ไม่มีแถว', () => {
  const NOTE = { key: 'document', label: 'เอกสารประเมินออกได้', note: 'ดูเหตุที่ส่วน “เอกสารประเมินพื้นที่”' };
  /* ก่อนส่งผล · ติดเฉพาะเอกสารสองข้อ: ป้ายบอก 1 ข้อ (ด่านเดียว) · แถวนี้บอกว่าเป็นด่านไหน · เหตุสองข้ออยู่ที่กล่องเหตุกับส่วนเอกสาร */
  const blockers = ['Studio 01: ภาพผังเปิดไม่ได้', 'นัดประเมินไม่มีวันที่ประเมิน'];
  const stuck = view({ document: headDoc({ send: { ...OK, blockers } }) });
  assert.equal(stuck.gatesFailed, 1);
  assert.deepEqual(stuck.gateNotes, [NOTE]);
  assert.equal(stuck.gateNotes[0].label, docGate(stuck).label, 'ชื่อเดียวกับแถวในรายการด่านเต็ม');
  assert.deepEqual(stuck.zoneGaps.rows, [], 'ไม่มีแถวรายพื้นที่ของเอกสาร — แถวนี้คือแถวเดียวที่บอกว่าข้อไหนติด');
  assert.equal(stuck.document.show, true);
  assert.deepEqual(stuck.document.status.items, blockers, 'เหตุอยู่ที่ส่วนที่แถวชี้ไป');
  assert.doesNotMatch(JSON.stringify(stuck.gateNotes), /\d|ภาพผัง|นัดประเมิน/, 'ไม่มีตัวเลขตัวที่สี่ ไม่กางเหตุรอบที่สาม');
  /* ด่านอื่นติดด้วย: แถวรายพื้นที่ของด่านนั้น + แถวนี้ของด่านเอกสาร */
  const both = view({
    zones: [measuredZone('z1', 'Studio 01')], filesByZone: { z1: [WIDE, SPOT] },
    document: headDoc({ send: { ...OK, blockers: ['x'] } }),
  });
  assert.ok(both.zoneGaps.rows.length > 0);
  assert.deepEqual(both.gateNotes, [NOTE]);
  /* ส่งผลแล้ว: ด่านที่ติดได้มีแถวเอกสารแถวเดียว (stale · missing ที่มีเหตุขวาง) */
  const stale = view({ request: sentRequest(), document: headDoc({ state: 'stale', current: currentRow({ approvedAt: '2026-09-01T00:00:00.000Z' }) }) });
  assert.equal(stale.gatesSentFailed, 1);
  assert.deepEqual(stale.gateNotes, [NOTE]);
  const missing = view({
    request: sentRequest(),
    document: headDoc({ state: 'missing', issue: { blockers: [{ kind: 'content', text: 'x' }], warnings: [], unknown: false } }),
  });
  assert.deepEqual(missing.gateNotes, [NOTE]);

  /* ด่านเอกสารผ่าน · ไม่มีด่านเอกสาร (สวิตช์ปิด · ช่าง · อ่านสถานะไม่สำเร็จ) = ไม่มีแถว */
  for (const [name, v] of [
    ['ผ่าน', view({ document: headDoc({ send: OK }) })],
    ['สวิตช์ปิด', view({ document: headDoc({ issueAtSend: false }) })],
    ['ช่าง', view({ viewer: CREW, document: { access: 'none' } })],
    ['อ่านสถานะไม่สำเร็จ', view({ document: { access: 'none', unknown: true } })],
    ['ส่งแล้ว · เอกสารพร้อม', view({ request: sentRequest(), document: headDoc({ state: 'ready', current: currentRow() }) })],
  ]) assert.deepEqual(v.gateNotes, [], name);
  /* ทุกแถวมีด่านที่ติดจริงอยู่ในรายการด่านเต็ม และส่วนเอกสารถูกวาด (ไม่ชี้ไปที่ที่ไม่มีอยู่) */
  for (const v of [stuck, both, stale, missing]) {
    for (const row of v.gateNotes) {
      assert.equal(v.gates.find((g) => g.key === row.key)?.ok, false);
      assert.equal(v.document.show, true);
    }
  }
});

// ══ แถวด่าน "เอกสารประเมินออกได้" ═════════════════════════════════════════

test('สวิตช์ปิด = ไม่มีแถวเอกสารทั้งก่อนและหลังส่ง · สวิตช์เปิด = มีแถวทั้งก่อนและหลังส่ง ⇒ จำนวนข้อคงที่', () => {
  const offBefore = view({ document: headDoc({ issueAtSend: false }) });
  const offAfter = view({ document: headDoc({ issueAtSend: false, state: 'missing', issue: OK }), request: sentRequest() });
  assert.equal(docGate(offBefore), null);
  assert.equal(docGate(offAfter), null);
  assert.equal(offAfter.gates.length, offBefore.gates.length);
  assert.equal(offBefore.send.issuesDocument, false);
  assert.equal(offBefore.send.allowed, true);

  const onBefore = view({ document: headDoc({ send: OK }) });
  assert.deepEqual(docGate(onBefore), {
    key: 'document', owner: 'head', short: 'เอกสาร', label: 'เอกสารประเมินออกได้',
    ok: true, done: 1, total: 1, zones: [], zoneIds: [], count: 0, reasons: [], reason: null,
  });
  assert.equal(onBefore.gates.at(-1).key, 'document', 'ต่อท้ายแถวรูปจุด');
  assert.equal(onBefore.gates.length, offBefore.gates.length + 1);
  assert.equal(onBefore.gatesFailed, 0);
  assert.equal(onBefore.send.allowed, true);
  assert.equal(onBefore.send.issuesDocument, true);
  assert.equal(onBefore.status.key, 'ready');
});

test('สวิตช์เปิด · ส่งแล้ว: แถวอยู่ครบทุกสถานะ · ติดเฉพาะ stale กับ missing ที่มีเหตุขวาง · `gatesSentFailed` เป็น 1 ตอนนั้นเท่านั้น', () => {
  const before = view({ document: headDoc({ send: OK }) }).gates.length;
  const blocked = { blockers: [{ kind: 'content', text: 'มีรูปจุดที่ยังไม่ได้ผูก 2 รูป' }, { kind: 'system', text: 'ยังไม่มีข้อมูลบริษัท' }], warnings: [], unknown: false };
  const cases = [
    ['issued', { current: currentRow() }, true],
    ['frozen', { current: currentRow({ frozenAt: ANSWERED, ready: { customer: true, internal: false } }) }, true],
    ['ready', { current: currentRow({ frozenAt: ANSWERED, ready: { customer: true, internal: true } }) }, true],
    ['issuing', {}, true],
    ['missing', { issue: OK }, true],
    ['missing', { issue: { ...OK, unknown: true } }, true],
    ['missing', { issue: blocked }, false],
    ['stale', { current: currentRow({ approvedAt: '2026-09-01T00:00:00.000Z' }) }, false],
  ];
  for (const [state, extra, ok] of cases) {
    const v = view({ document: headDoc({ state, ...extra }), request: sentRequest() });
    const row = docGate(v);
    assert.ok(row, `${state}: แถวต้องอยู่`);
    assert.equal(row.ok, ok, state);
    assert.equal(v.gates.length, before, `${state}: จำนวนข้อเท่าก่อนส่ง`);
    assert.equal(v.gatesSentFailed, ok ? 0 : 1, state);
    assert.equal(v.flags.sent, true);
  }
  const missing = docGate(view({ document: headDoc({ state: 'missing', issue: blocked }), request: sentRequest() }));
  assert.equal(missing.reason, 'มีรูปจุดที่ยังไม่ได้ผูก 2 รูป | ยังไม่มีข้อมูลบริษัท');
  /* 🐞 UAT PR-3 (S09 · S15): " | " ดิบใต้แถวอ่านเป็นประโยคเดียว ⇒ การ์ดวาดจาก `reasons` ข้อละบรรทัด (ชุดเดียวกับ `reason` ลำดับเดิม) */
  assert.deepEqual(missing.reasons, ['มีรูปจุดที่ยังไม่ได้ผูก 2 รูป', 'ยังไม่มีข้อมูลบริษัท']);
  assert.equal(missing.reasons.join(' | '), missing.reason);
  assert.equal(missing.count, 2);
  assert.deepEqual([missing.done, missing.total], [0, 1]);
  const stale = docGate(view({ document: headDoc({ state: 'stale', current: currentRow() }), request: sentRequest() }));
  assert.equal(stale.reason, 'เอกสารฉบับที่ใช้อยู่ไม่ตรงกับผลที่ส่งรอบล่าสุด — แจ้งผู้ดูแลระบบ');
  assert.deepEqual(stale.reasons, [stale.reason]);
  assert.equal(stale.count, 1);
  // ก่อนส่ง `gatesSentFailed` เป็น 0 เสมอ แม้แถวเอกสารจะติด
  assert.equal(view({ document: headDoc({ send: { ...OK, blockers: ['x'] } }) }).gatesSentFailed, 0);
  // ใบที่ยกเลิกหลังส่ง — ไม่มีแถว (ออกเอกสารไม่ได้แล้ว)
  assert.equal(docGate(view({ document: headDoc({ state: 'missing', issue: blocked }), request: sentRequest({ cancelledAt: ANSWERED }) })), null);
  // อ่านสถานะเอกสารไม่สำเร็จหลังส่ง — ไม่มีแถว (ไม่รู้ว่าสวิตช์เปิดไหม) และไม่นับเป็นด่านที่ติด
  const unknown = view({ document: { access: 'none', unknown: true }, request: sentRequest() });
  assert.equal(docGate(unknown), null);
  assert.equal(unknown.gatesSentFailed, 0);
  assert.equal(unknown.document.state, 'unknown');
});

test('หลังส่ง: ข้อผิดพลาดที่จอจำไว้เปลี่ยนสถานะของแถวตามส่วนเอกสาร (กำลังออก + การส่งรอบนี้ออกเอกสารล้ม = missing)', () => {
  const documentLocal = { round: ANSWERED, sendFailed: { code: 'images_failed', reason: 'ดึงรูปไม่สำเร็จ', retry: true } };
  const v = view({ document: headDoc({ state: 'issuing' }), request: sentRequest(), documentLocal });
  assert.equal(v.document.state, 'missing');
  assert.equal(docGate(v).ok, true, 'missing ที่ไม่มีเหตุขวางจาก server = แถวไม่ติด');
  assert.equal(v.document.issue.allowed, true);
});

// ══ ส่งผลไม่ได้เพราะเอกสาร ════════════════════════════════════════════════

test('สวิตช์เปิด · เอกสารออกไม่ได้อย่างเดียว: ส่งไม่ได้ · ประโยคเต็มของ route · บรรทัดรองใหม่ · ปุ่ม "ตรวจอีกครั้ง"', () => {
  const blockers = ['พื้นที่ Studio 01 ภาพผังเป็น PDF — อัปเป็นรูป', 'นัด SV-2609001 ไม่มีวันเข้าพื้นที่'];
  const v = view({ document: headDoc({ send: { blockers, warnings: [], unknown: false } }) });
  const row = docGate(v);
  assert.equal(row.ok, false);
  assert.equal(row.reason, blockers.join(' | '));
  assert.deepEqual(row.reasons, blockers, 'ข้อละบรรทัดสำหรับการ์ด — ลำดับเดียวกับเหตุของ server');
  assert.equal(row.count, 2);
  assert.equal(v.gatesFailed, 1);
  assert.equal(v.send.show, true);
  assert.equal(v.send.allowed, false);
  const sentence = 'ออกเอกสารไม่ได้ — พื้นที่ Studio 01 ภาพผังเป็น PDF — อัปเป็นรูป | นัด SV-2609001 ไม่มีวันเข้าพื้นที่ · ยังไม่ได้ส่งผล';
  assert.equal(sentence, surveySendDocumentRefusal(blockers.map((text) => ({ kind: 'content', text }))), 'ประโยคของ route เอง');
  assert.equal(v.send.reason.text, sentence, 'ไม่ย่อเป็น "ติด 1 ข้อ ที่ …" — บอกไม่ได้ว่าต้องทำอะไร');
  assert.equal(v.send.reason.detail, sentence);
  assert.deepEqual(v.send.reason.target, { kind: 'reload', label: 'ตรวจอีกครั้ง' });
  /* 🐞 UAT PR-3 (S03): ประโยคเต็มต่อเหตุด้วย " | " — การ์ดและโมดัลวาด "บรรทัดนำ + รายการ" ของประโยคเดียวกันแทน (`text`/`detail` ไม่เปลี่ยน) */
  assert.equal(v.send.reason.lead, 'ออกเอกสารไม่ได้ — ติด 2 ข้อ · ยังไม่ได้ส่งผล');
  assert.deepEqual(v.send.reason.items, blockers);
  assert.deepEqual(surveySendDocumentRefusalList(blockers.map((text) => ({ kind: 'content', text }))), { lead: v.send.reason.lead, items: blockers });
  /* รายการกางในกล่องเหตุใต้ปุ่มส่งผล **ทุกขนาดจอ** (เหตุต้องอยู่ติดปุ่มที่กดไม่ได้ ในจอแรก) และกางอีกที่ในกล่องสถานะของส่วนเอกสาร
     ⇒ สองที่ต้องถือรายการเดียวกันเสมอ: มีรายการในกล่องเหตุเมื่อไร ส่วนเอกสารต้องขึ้น และกล่องสถานะของมันต้องถือชุดเดียวกัน */
  assert.equal(v.document.show, true);
  assert.equal(v.document.placement, 'fold');
  assert.deepEqual(v.document.status.items, v.send.reason.items);
  assert.equal(v.status.key, 'awaiting-decision');
  /* 🐞 UAT PR-3 (S03): หัวหน้าเคาะครบแล้ว — พาดหัว "รอหัวหน้าเคาะ" บอกให้ทำสิ่งที่ทำไปแล้ว ⇒ พาดหัวเอ่ยเรื่องที่ค้างจริง โทนอำพัน */
  assert.equal(v.status.headline, 'วัดและเคาะครบแล้ว — เอกสารประเมินยังออกไม่ได้');
  assert.equal(v.status.tone, 'warning');
  assert.doesNotMatch(v.status.headline, /รอหัวหน้าเคาะ/);
  assert.equal(v.status.sub, 'วัดแล้ว 1 / 1 พื้นที่ · เหลือแก้ข้อที่ทำให้เอกสารประเมินออกไม่ได้');
  // ส่วนเอกสารกางเหตุครบ และไม่อ้างตัวเองเป็นด่านที่ติด
  assert.equal(v.document.status.text, 'เอกสารยังออกไม่ได้ — ติด 2 ข้อ');
  assert.deepEqual(v.document.status.items, blockers);
  assert.equal(v.document.status.foot, 'แก้ตามรายการแล้วกด “ตรวจอีกครั้ง”');
  assert.doesNotMatch(JSON.stringify(v.document), /ด่านอื่น|: เอกสาร/);
  // ไม่มีแถวรายพื้นที่ของเอกสาร — ไม่มีพื้นที่ไหนให้พาไป
  assert.deepEqual(v.zoneGaps.rows, []);
});

test('🐞 เอกสารออกไม่ได้อย่างเดียว · นัดยังเปิด (ทางปกติ — การส่งผลเป็นคนปิดนัด): บรรทัดรองไม่ชี้ไป "เคาะจุดและแพ็คเกจ" ที่เคาะครบแล้ว', () => {
  const blocked = headDoc({ send: { blockers: ['Studio 01: ยังไม่มีภาพผังที่ลงเอกสารได้ (ต้องเป็นรูป JPG/PNG)'], warnings: [], unknown: false } });
  const visit = (status) => ({ id: 'SVV-1', code: 'SV-2610001', status, scheduledDate: TODAY });
  const SENIOR_ON_VISIT = { ...HEAD, onVisit: true };
  const DOCUMENT_LEFT = 'วัดแล้ว 1 / 1 พื้นที่ · เหลือแก้ข้อที่ทำให้เอกสารประเมินออกไม่ได้';
  for (const status of ['scheduled', 'in_progress']) {
    const head = view({ document: blocked, visit: visit(status) });
    assert.equal(head.send.allowed, false, status);
    assert.equal(head.status.key, 'awaiting-submit', status);
    assert.equal(head.status.headline, 'วัดครบแล้ว — ช่างยังไม่กดส่งงาน');
    assert.equal(head.status.sub, DOCUMENT_LEFT, status);
    // Senior ที่ออกหน้างานเอง — พาดหัวยังเป็นของคนส่งงาน บรรทัดรองบอกงานที่เหลือจริง
    const senior = view({ document: blocked, visit: visit(status), viewer: SENIOR_ON_VISIT });
    assert.equal(senior.status.headline, 'วัดครบแล้ว — กด “ส่งงาน” เพื่อปิดงานหน้างาน');
    assert.equal(senior.status.sub, DOCUMENT_LEFT, status);
    // CD / CM (ส่งผลได้ เขียนผลวัดไม่ได้) ได้บรรทัดเดียวกับหัวหน้า
    assert.equal(view({ document: blocked, visit: visit(status), viewer: HEAD_NO_WRITE }).status.sub, DOCUMENT_LEFT, status);
    for (const viewer of [HEAD, SENIOR_ON_VISIT]) {
      assert.doesNotMatch(view({ document: blocked, visit: visit(status), viewer }).status.sub, /เคาะจุดและแพ็คเกจ/, status);
    }
    // ไม่มีเอกสาร · ไม่มีสิทธิ์ · เอกสารผ่าน · สวิตช์ปิด = ค่าเดิม (ใบนี้พร้อมส่ง — การส่งผลปิดนัดให้)
    const bare = view({ visit: visit(status) }).status;
    assert.equal(bare.key, 'ready', status);
    for (const document of [{ access: 'none' }, headDoc({ send: OK }), headDoc({ issueAtSend: false })]) {
      assert.deepEqual(view({ document, visit: visit(status) }).status, bare, JSON.stringify(document.access));
    }
    // ช่างไม่ได้อะไรจากเอกสาร — ถึงจะได้ payload ของหัวหน้ามาผิด ๆ ถ้อยคำก็ไม่เปลี่ยน
    assert.deepEqual(view({ document: blocked, visit: visit(status), viewer: CREW }).status, view({ visit: visit(status), viewer: CREW }).status);
  }
  // นัดปิดแล้ว = บรรทัดเดียวกัน (ของเดิม)
  const closed = view({ document: blocked, visit: visit('done') });
  assert.equal(closed.status.sub, DOCUMENT_LEFT);
  /* นัดปิดแล้ว = ขั้นของหัวหน้า — พาดหัวเอ่ยเรื่องเอกสาร ไม่ใช่ "รอหัวหน้าเคาะ" (เคาะครบแล้ว) · เหตุข้อเดียว = ประโยคเต็มของ route ไม่มีรายการ */
  assert.equal(closed.status.headline, 'วัดและเคาะครบแล้ว — เอกสารประเมินยังออกไม่ได้');
  assert.equal(closed.send.reason.text, 'ออกเอกสารไม่ได้ — Studio 01: ยังไม่มีภาพผังที่ลงเอกสารได้ (ต้องเป็นรูป JPG/PNG) · ยังไม่ได้ส่งผล');
  assert.equal(closed.send.reason.lead, null);
  assert.deepEqual(closed.send.reason.items, []);
  // หัวหน้ายังเคาะไม่ครบ · ขนาดถูกลบจากทะเบียน = ประโยคเดิมทุกตัวอักษร ทั้งมีและไม่มีเหตุของเอกสาร
  const undecided = { zones: [measuredZone('z1', 'Studio 01')], filesByZone: { z1: [WIDE, SPOT] } };
  const sizeGone = { zones: [readyZone('z1', 'Studio 01', { packageSize: 'GONE' })] };
  for (const scene of [undecided, sizeGone]) {
    for (const document of [null, blocked]) {
      const args = { ...scene, document, visit: visit('in_progress') };
      assert.equal(view(args).status.sub, 'วัดแล้ว 1 / 1 พื้นที่ · เคาะจุดและแพ็คเกจได้เลย ไม่ต้องรอ');
      assert.equal(view({ ...args, viewer: SENIOR_ON_VISIT }).status.sub, 'วัดแล้ว 1 / 1 พื้นที่ · ส่งงานแล้วเคาะจุดและแพ็คเกจต่อได้เลย');
    }
  }
});

test('ชื่อด่านที่ส่งให้ส่วนเอกสารไม่มี "เอกสาร" — เอกสารติดพร้อมด่านอื่น ส่วนนั้นเอ่ยเฉพาะด่านอื่น', () => {
  const v = view({
    zones: [measuredZone('z1', 'Studio 01')], filesByZone: { z1: [WIDE, SPOT] },
    document: headDoc({ send: { blockers: ['นัดไม่มีวันเข้าพื้นที่'], warnings: [], unknown: false } }),
  });
  const failed = v.gates.filter((g) => !g.ok);
  assert.ok(failed.some((g) => g.key === 'document'));
  assert.ok(failed.length >= 3, 'ผัง · เลือกจุด · แพ็คเกจ · เอกสาร');
  const others = failed.filter((g) => g.key !== 'document').map((g) => g.short);
  assert.equal(v.document.status.foot, `แก้ตามรายการแล้วกด “ตรวจอีกครั้ง” · ด่านอื่นยังติด ${others.length} ด่าน: ${others.join(' · ')}`);
  assert.ok(!others.includes('เอกสาร'));
  // บรรทัดใต้ปุ่มส่งนับแถวเอกสารด้วย ⇒ ตรงกับป้าย "ติด n / m ข้อ" · ปุ่มพาไปยังเป็นของด่านที่มีพื้นที่ให้ไป
  assert.equal(v.send.reason.text, `ยังส่งไม่ได้ — ติด ${failed.length} ข้อ ที่ Studio 01`);
  /* ด่านอื่นติดด้วย = บรรทัดย่อเดิม ไม่มีรายการของเอกสารในกล่องเหตุ · พาดหัวยังเป็นของขั้นเคาะ (หัวหน้ายังเคาะไม่ครบจริง) */
  assert.equal(v.send.reason.lead, null);
  assert.deepEqual(v.send.reason.items, []);
  assert.equal(v.status.headline, 'วัดครบแล้ว — รอหัวหน้าเคาะ');
  assert.equal(v.status.tone, 'info');
  assert.equal(v.gatesFailed, failed.length);
  assert.equal(v.send.reason.target.kind, 'tab');
  // ด่านอื่นติดอย่างเดียว (เอกสารผ่าน) — ส่วนเอกสารบอกว่าดาวน์โหลดได้หลังส่งผล
  const gatesOnly = view({ zones: [measuredZone('z1', 'Studio 01')], filesByZone: { z1: [WIDE, SPOT] }, document: headDoc({ send: OK }) });
  assert.equal(gatesOnly.document.status.text, `ดาวน์โหลด PDF ได้หลังส่งผลให้ฝ่ายขาย — ยังติด ${others.length} ด่าน: ${others.join(' · ')}`);
});

test('ลำดับเดียวกับ route: นัดยังเป็นร่างพูดก่อนเอกสาร · รูปจุดที่ยังไม่ผูกพูดก่อนเอกสาร', () => {
  const blocked = headDoc({ send: { blockers: ['นัดไม่มีวันเข้าพื้นที่'], warnings: [], unknown: false } });
  const draft = view({ document: blocked, visit: { id: 'SVV-1', code: 'SV-2610001', status: 'draft', scheduledDate: '2026-10-02' } });
  assert.equal(draft.send.allowed, false);
  assert.equal(draft.send.reason.key, 'visit-draft');
  assert.match(draft.send.reason.text, /^นัด SV-2610001 ยังเป็นร่าง/);
  assert.equal(docGate(draft).ok, false, 'แถวยังบอกว่าเอกสารติด — แค่ไม่ใช่เหตุแรกที่พูด');

  const spot = view({ document: blocked, filesByZone: { z1: [...READY_FILES, LOOSE] } });
  assert.equal(spot.send.allowed, false);
  assert.match(spot.send.reason.text, /^มีรูปจุดที่ยังไม่ได้ผูก 1 รูป — ผูกก่อนส่งผล/);
  assert.equal(spot.send.reason.detail, spot.send.reason.text);
  assert.deepEqual(spot.send.reason.target, { kind: 'zone', zoneId: 'z1', label: 'เปิด Studio 01' });
  assert.equal(spot.status.sub, 'วัดแล้ว 1 / 1 พื้นที่ · เหลือผูกรูปจุดที่ยังไม่ได้ผูก', 'ยังเป็นคำเดิมเมื่อรูปจุดติด');
  assert.equal(spot.document.status.foot, 'แก้ตามรายการแล้วกด “ตรวจอีกครั้ง” · ด่านอื่นยังติด 1 ด่าน: ผูกรูปจุด');
});

test('server ตรวจเอกสารล่วงหน้าไม่สำเร็จ (`send.unknown`) ไม่ขวางการส่ง — เส้นส่งผลก็ข้ามด่านนี้เมื่ออ่านพลาด', () => {
  const v = view({ document: headDoc({ send: { blockers: [], warnings: [], unknown: true } }) });
  assert.equal(docGate(v).ok, true);
  assert.equal(v.send.allowed, true);
  assert.equal(v.send.reason, null);
  assert.equal(v.status.key, 'ready');
  assert.equal(v.document.status.text, 'ตรวจเอกสารล่วงหน้าไม่สำเร็จ — ส่งผลได้ ระบบตรวจอีกครั้งตอนส่ง');
  // เหตุที่เป็นช่องว่างล้วนไม่นับเป็นเหตุ (แถวกับปุ่มต้องพูดตรงกัน)
  const blank = view({ document: headDoc({ send: { blockers: ['', '   ', null, 7], warnings: [], unknown: false } }) });
  assert.equal(docGate(blank).ok, true);
  assert.equal(blank.send.allowed, true);
});

// ══ คีย์ของโมดัลยืนยันและคำขอส่งผล ════════════════════════════════════════

test('🔴 `seenWarnings` กลับไปหา server ดิบตามตัวอักษร — ช่องว่าง · บรรทัดซ้ำ · ลำดับ ไม่ถูกแตะ', () => {
  const warnings = [
    'หมายเหตุพื้นที่ 1 มีคำว่า "เครื่อง" — เอกสารฉบับลูกค้าไม่ระบุเครื่อง รุ่น หรือราคา ตรวจข้อความก่อนส่ง',
    '  ชื่อลูกค้า มีอักขระที่เอกสารพิมพ์ไม่ได้ (😀 U+1F600) — จะขึ้นเป็นกล่องสี่เหลี่ยม  ',
    'หมายเหตุพื้นที่ 1 มีคำว่า "เครื่อง" — เอกสารฉบับลูกค้าไม่ระบุเครื่อง รุ่น หรือราคา ตรวจข้อความก่อนส่ง',
  ];
  const v = view({ document: headDoc({ send: { blockers: [], warnings, unknown: false } }) });
  assert.deepEqual(v.send.seenWarnings, warnings);
  assert.equal(v.send.seenWarnings.length, 3, 'ไม่ตัดบรรทัดซ้ำ');
  assert.equal(v.send.seenWarnings[1], warnings[1], 'ไม่ตัดช่องว่าง');
  // ส่งกลับไปแล้ว route ต้องเห็นว่า "อ่านครบ" (เทียบตรงตัว)
  assert.deepEqual(surveySendUnseenWarnings(warnings, v.send.seenWarnings), []);
  assert.equal(v.send.allowed, true, 'คำเตือนไม่บล็อก (มติเจ้าของ 01/10 ข้อ 3)');
  assert.equal(docGate(v).ok, true);
  // ของที่ไม่ใช่สตริงถูกคัดออก (เหมือนฝั่ง server) · ไม่มีผลตรวจ = ลิสต์ว่าง
  assert.deepEqual(view({ document: headDoc({ send: { blockers: [], warnings: ['a', 7, null, { text: 'b' }], unknown: false } }) }).send.seenWarnings, ['a']);
  assert.deepEqual(view({ document: headDoc({ send: null }) }).send.seenWarnings, []);
  // ใบที่ล็อกแล้วไม่มีอะไรให้ส่ง
  assert.deepEqual(view({ document: headDoc({ state: 'missing', send: { blockers: [], warnings, unknown: false } }), request: sentRequest() }).send.seenWarnings, []);
});

test('`replacesDocNo` มีเฉพาะสถานะดึงผลกลับ · `documentUnknown` มีเฉพาะ `{ access: none, unknown: true }` ของคนที่ส่งผลได้', () => {
  const recalled = view({ document: headDoc({ state: 'recalled', history: HISTORY, nextDocNo: 'SU-26100001-1', send: OK }) });
  assert.equal(recalled.send.replacesDocNo, 'SU-26100001-0');
  assert.equal(recalled.send.issuesDocument, true);
  for (const [state, extra, req] of [
    ['not_sent', { history: HISTORY }, request()],
    ['missing', { history: HISTORY, issue: OK }, sentRequest()],
    ['ready', { history: HISTORY, current: currentRow({ docNo: 'SU-26100001-1' }) }, sentRequest()],
    ['recalled', { history: [] }, request()],
    ['recalled', {}, request()],
  ]) {
    assert.equal(view({ document: headDoc({ state, ...extra }), request: req }).send.replacesDocNo, null, state);
  }
  // คนที่ไม่ได้คีย์ history (ไม่มีคีย์เลย) ก็ไม่ล้ม
  const bare = { access: { ...ACCESS, history: false }, issueAtSend: true, storeAllowed: true, state: 'recalled', current: null };
  assert.equal(view({ document: bare }).send.replacesDocNo, null);

  const unknown = view({ document: { access: 'none', unknown: true } });
  assert.equal(unknown.send.documentUnknown, true);
  assert.equal(unknown.send.issuesDocument, false);
  assert.deepEqual(unknown.send.seenWarnings, []);
  assert.equal(unknown.send.allowed, true, 'อ่านเอกสารไม่สำเร็จไม่ขวางการส่งผล');
  for (const [document, args] of [
    [{ access: 'none' }, {}],
    [{ access: 'none', voids: null, unknown: false }, {}],
    [headDoc({ state: null, unknown: true }), {}],
    [null, {}],
    [{ access: 'none', unknown: true }, { viewer: CREW }],
    [{ access: 'none', unknown: true }, { request: sentRequest() }],
  ]) {
    assert.equal(view({ document, ...args }).send.documentUnknown, false, JSON.stringify(document));
  }
});

// ══ ดึงผลกลับ ═════════════════════════════════════════════════════════════

test('ดึงผลกลับ: บรรทัดใต้ปุ่มและกล่องยืนยันเอ่ยเลขเอกสารเมื่อเป็นฉบับของผลรอบนี้ — stale · missing · ยังไม่ส่ง ไม่เอ่ย', () => {
  for (const [state, ready] of [
    ['issued', { customer: false, internal: false }], ['frozen', { customer: true, internal: false }], ['ready', { customer: true, internal: true }],
  ]) {
    const v = view({ document: headDoc({ state, current: currentRow({ ready }) }), request: sentRequest() });
    assert.equal(v.recallAction.show, true);
    assert.equal(v.recallAction.voidsDocNo, 'SU-26100001-0', state);
    assert.equal(v.recallAction.hint, `${RECALL_HINT} · เอกสาร SU-26100001-0 จะถูกแทนที่`);
    assert.equal(v.recallAction.detail,
      `${RECALL_DETAIL} · เอกสาร SU-26100001-0 จะถูกแทนที่ — ใช้ไม่ได้ทันที ห้ามใช้ฉบับที่ส่งลูกค้าไปแล้ว · ฉบับใหม่เป็น Rev ถัดไป`);
  }
  for (const [state, extra, req] of [
    ['stale', { current: currentRow() }, sentRequest()],
    ['missing', { issue: OK }, sentRequest()],
    ['issuing', {}, sentRequest()],
    ['not_sent', {}, request()],
    ['recalled', { history: HISTORY }, request()],
  ]) {
    const v = view({ document: headDoc({ state, ...extra }), request: req });
    assert.equal(v.recallAction.voidsDocNo, null, state);
    assert.equal(v.recallAction.hint, RECALL_HINT, state);
    assert.equal(v.recallAction.detail, RECALL_DETAIL, state);
  }
  // อ่านสถานะเอกสารไม่สำเร็จ — บอกแบบมีเงื่อนไข ไม่เงียบ
  for (const document of [{ access: 'none', unknown: true }, headDoc({ state: null, unknown: true })]) {
    const v = view({ document, request: sentRequest() });
    assert.equal(v.recallAction.voidsDocNo, null);
    assert.equal(v.recallAction.hint, RECALL_HINT);
    assert.equal(v.recallAction.detail, `${RECALL_DETAIL} · อ่านสถานะเอกสารไม่สำเร็จ — ถ้าใบนี้มีเอกสาร SU เอกสารนั้นจะถูกแทนที่`);
  }
});

// ══ กล่องแจ้ง ═════════════════════════════════════════════════════════════

test('กล่องคำเตือนของฉบับลูกค้า: ทุกบรรทัดอยู่ในรายการ · บรรทัดปิดท้ายตามชนิด (หมายเหตุแก้ได้/แก้ไม่ได้ · ช่องอื่น)', () => {
  const noteLine = 'หมายเหตุพื้นที่ 1 มีคำว่า "เครื่อง" — เอกสารฉบับลูกค้าไม่ระบุเครื่อง รุ่น หรือราคา ตรวจข้อความก่อนส่ง';
  const emojiNote = 'หมายเหตุพื้นที่ 2 มีอักขระที่เอกสารพิมพ์ไม่ได้ (😀 U+1F600) — จะขึ้นเป็นกล่องสี่เหลี่ยม';
  const nameLine = 'ชื่อลูกค้า มีอักขระที่เอกสารพิมพ์ไม่ได้ (😀 U+1F600) — จะขึ้นเป็นกล่องสี่เหลี่ยม';
  const withWarnings = (warnings, args = {}) => notice(view({ document: headDoc({ send: { blockers: [], warnings, unknown: false } }), ...args }), 'document-warnings');

  const all = withWarnings([noteLine, emojiNote, nameLine, noteLine]);
  assert.deepEqual(all, {
    key: 'document-warnings', tone: 'warning', title: 'ตรวจข้อความบนฉบับลูกค้าก่อนส่งผล',
    text: 'หมายเหตุพื้นที่แก้ได้ที่หน้าพื้นที่ (แท็บหน้างาน) · ช่องอื่นแก้ที่ต้นทางของช่องที่ระบุ (เช่น ทะเบียนลูกค้า ทะเบียนไซต์ ชื่อพื้นที่) · หรือส่งตามนี้ได้',
    items: [noteLine, emojiNote, nameLine],
  });
  assert.equal(withWarnings([noteLine]).text, 'หมายเหตุพื้นที่แก้ได้ที่หน้าพื้นที่ (แท็บหน้างาน) · หรือส่งตามนี้ได้');
  // CD / CM ส่งผลได้แต่เขียนผลวัดไม่ได้ — ห้ามบอกว่าแก้ได้ที่หน้าพื้นที่
  assert.equal(withWarnings([noteLine], { viewer: HEAD_NO_WRITE }).text,
    'หมายเหตุพื้นที่ คุณแก้เองไม่ได้ — ให้หัวหน้าฝ่ายบริการหรือช่างแก้ · หรือส่งตามนี้ได้');
  assert.equal(withWarnings([nameLine]).text,
    'ช่องอื่นแก้ที่ต้นทางของช่องที่ระบุ (เช่น ทะเบียนลูกค้า ทะเบียนไซต์ ชื่อพื้นที่) · หรือส่งตามนี้ได้');
  assert.equal(withWarnings([nameLine], { viewer: HEAD_NO_WRITE }).text, withWarnings([nameLine]).text);
  // 🐞 โมดัลเปิดได้เฉพาะตอนส่งได้ ⇒ กล่องนี้ต้องไม่ชี้ไปที่โมดัล และต้องขึ้นแม้ด่านอื่นยังติด
  const stuck = withWarnings([noteLine, nameLine], { zones: [measuredZone('z1', 'Studio 01')], filesByZone: { z1: [WIDE, SPOT] } });
  assert.deepEqual(stuck.items, [noteLine, nameLine]);
  for (const n of [all, stuck]) assert.doesNotMatch(JSON.stringify(n), /กล่องยืนยัน|โมดัล/);
  // ไม่มีคำเตือน / ใบส่งแล้ว = ไม่มีกล่อง
  assert.equal(withWarnings([]), null);
  assert.equal(withWarnings(['', '  ']), null);
  assert.equal(notice(view({ document: headDoc({ state: 'missing', issue: { ...OK, warnings: [noteLine] } }), request: sentRequest() }), 'document-warnings'), null);
  // อยู่ถัดจากกล่องตรวจขนาด ก่อนกล่องของคนดู/ส่งกลับ/อ่านไม่สำเร็จ
  const order = view({
    document: headDoc({ send: { blockers: [], warnings: [noteLine], unknown: false } }), unknown: { site: true },
    recall: { reason: 'แก้ตัวเลข', byName: 'หัวหน้า ก', at: ANSWERED, totals: null },
  }).notices.map((n) => n.key);
  assert.deepEqual(order, ['recall', 'document-warnings', 'unknown']);
});

test('กล่อง "ส่งผลรอบล่าสุดถูกตีกลับ": เฉพาะใบที่ยังไม่ส่ง + คนที่ส่งผลได้ + ชุดไฟล์ยังเป็นชุดเดิม', () => {
  const filesByZone = { z1: READY_FILES };
  const message = 'รูป 1 รูปเปิดไม่ได้ — อัปใหม่เป็น JPG แล้วส่งอีกครั้ง (ชื่อไฟล์ IMG_0001.jpg) · ยังไม่ได้ส่งผล';
  const local = { sendRefused: { message, sig: surveyFilesSignature(filesByZone) } };
  const shown = notice(view({ document: headDoc({ send: OK }), documentLocal: local }), 'send-refused');
  assert.deepEqual(shown, { key: 'send-refused', tone: 'warning', title: 'ส่งผลรอบล่าสุดถูกตีกลับ', text: message });
  // ไม่ผูกกับรอบของคำตอบ และไม่ต้องมี payload เอกสาร (การตีกลับเกิดก่อนเขียนอะไร)
  assert.ok(notice(view({ documentLocal: { round: ANSWERED, ...local } }), 'send-refused'));
  // ไฟล์ชุดเดิมคนละลำดับ = ยังขึ้น
  assert.ok(notice(view({ filesByZone: { z1: [SPOT, PLAN, WIDE] }, documentLocal: local }), 'send-refused'));
  // หัวหน้าแก้ไฟล์แล้ว (ลายเซ็นเปลี่ยน) = กล่องหายเอง
  assert.equal(notice(view({ filesByZone: { z1: [WIDE, PLAN, { ...SPOT, id: 'F-new' }] }, documentLocal: local }), 'send-refused'), null);
  assert.equal(notice(view({ filesByZone: { z1: [...READY_FILES, LOOSE] }, documentLocal: local }), 'send-refused'), null);
  // ส่งแล้ว · ยกเลิก · คนที่ส่งผลไม่ได้ · ไม่มีข้อความ · ลายเซ็นไม่มี = ไม่ขึ้น
  assert.equal(notice(view({ request: sentRequest(), documentLocal: local }), 'send-refused'), null);
  assert.equal(notice(view({ request: request({ cancelledAt: ANSWERED }), documentLocal: local }), 'send-refused'), null);
  assert.equal(notice(view({ viewer: CREW, documentLocal: local }), 'send-refused'), null);
  for (const sendRefused of [null, undefined, 'x', {}, { message, sig: null }, { message: '  ', sig: local.sendRefused.sig }, { sig: local.sendRefused.sig }]) {
    assert.equal(notice(view({ documentLocal: { sendRefused } }), 'send-refused'), null, JSON.stringify(sendRefused));
  }
});
