// ── ใบยืนยันหน้างาน (ประเมินจากแบบ งวด S5 §2.1) — ตัวจัดสภาพ · ตัวตัดสินปุ่ม · ประโยคทุกประโยคของงวด ──────────
// ฟังก์ชันล้วน ไม่แตะฐาน — ทุกกรณีเป็นตาราง (สเปก S5 §2.1 "Tests")
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as link from './surveyConfirmLink.js';
import {
  SURVEY_CONFIRM_ACTION_LABEL, SURVEY_CONFIRM_CHILD_LABEL, SURVEY_CONFIRM_CLOSED_UNASSESSED,
  SURVEY_CONFIRM_FORM_HINT, SURVEY_CONFIRM_FROM_ORIGINAL, SURVEY_CONFIRM_ID_PATTERN, SURVEY_CONFIRM_KIND_ERROR,
  SURVEY_CONFIRM_NO_ORIGINAL, SURVEY_CONFIRM_OF_LABEL, SURVEY_CONFIRM_OPEN_STATUSES, SURVEY_CONFIRM_ORIGINAL_MISSING,
  SURVEY_CONFIRM_VARIANT_ERROR,
  surveyConfirmAuditSuffix, surveyConfirmAwaitingRows, surveyConfirmBackLinkText, surveyConfirmBannerParts,
  surveyConfirmChildLine, surveyConfirmCreateBody, surveyConfirmDealHint, surveyConfirmEndedText,
  surveyConfirmForbiddenText, surveyConfirmHref, surveyConfirmLinkView, surveyConfirmOfLine, surveyConfirmOpenLinkText,
  surveyConfirmOpenedText, surveyConfirmPlan, surveyConfirmPreviousRoundKeep, surveyConfirmPreviousRoundText, surveyConfirmSentLines,
  surveyConfirmSentSummary, surveyConfirmSubmitMismatch, surveyConfirmSubtitle, surveyConfirmTitle,
  surveyConfirmZoneStates, surveyConfirmZonesLockText,
} from './surveyConfirmLink.js';

/* ── โลกจำลอง ────────────────────────────────────────────────────────────────────────────────
   ใบต้นทาง DR-O (ส่งผลแล้ว · ต้องยืนยันหน้างาน) มีพื้นที่จากแบบสองพื้นที่: Z-A ห้องนอน (48 ตร.ม. · SM 1) · Z-B ห้องนั่งเล่น */
const ORIG_DOC = 'RQ-AS-26100001';
const original = (over = {}) => ({
  id: 'DR-O', kind: 'site_survey', dept: 'TS', docNo: ORIG_DOC, title: 'ร้านกาแฟสาขาหนึ่ง', status: 'answered',
  createdAt: '2026-10-01T03:00:00.000Z', answeredAt: '2026-10-05T03:00:00.000Z', surveyConfirm: 'needed',
  committedDueDate: '2026-10-05', closedAt: null, dealId: 'DL-1', siteId: 'ST-1', ...over,
});
const part = (w, l, h = 3) => ({ widthM: w, lengthM: l, heightM: h });
const row = (id, requestId, zoneId, over = {}) => ({
  id, requestId, zoneId, zoneName: { 'Z-A': 'ห้องนอน', 'Z-B': 'ห้องนั่งเล่น', 'Z-C': 'โถง' }[zoneId] || 'พื้นที่ใหม่',
  sortOrder: 0, status: 'done', method: 'onsite', parts: [], packageSize: null, packageQty: null, surveyedAt: null, ...over,
});
const origRows = () => [
  row('SV-OA', 'DR-O', 'Z-A', { sortOrder: 0, method: 'drawing', parts: [part(6, 8)], packageSize: 'SM', packageQty: 1, surveyedAt: '2026-10-04T03:00:00.000Z' }),
  row('SV-OB', 'DR-O', 'Z-B', { sortOrder: 1, method: 'drawing', parts: [part(5, 4)], packageSize: 'ST', packageQty: 2, surveyedAt: '2026-10-04T03:00:00.000Z' }),
];
/* ใบลูก (ใบยืนยัน หรือใบอื่น) — `sent` = ส่งผลแล้ว (answeredAt) */
const req = (id, over = {}) => ({
  id, docNo: null, status: 'draft', answeredAt: null, createdAt: '2026-10-06T03:00:00.000Z', committedDueDate: null,
  closedAt: null, surveyConfirm: null, ...over,
});
/* แถวของใบลูกบนพื้นที่ที่กำหนด */
const kidRows = (requestId, zones, over = {}) => zones.map((zoneId, i) => row(`SV-${requestId}-${zoneId}`, requestId, zoneId, {
  sortOrder: i, surveyedAt: '2026-10-08T03:00:00.000Z', parts: [part(6, 8)], packageSize: 'SM', packageQty: 1, ...(over[zoneId] || over.all || {}),
}));

function world({ orig = original(), extraRows = [], requests = [], children = [], rows = origRows() } = {}) {
  const all = [...rows, ...extraRows];
  const rowsByZone = new Map();
  for (const r of all) {
    if (!r.zoneId) continue;
    if (!rowsByZone.has(r.zoneId)) rowsByZone.set(r.zoneId, []);
    rowsByZone.get(r.zoneId).push(r);
  }
  const requestsById = new Map([[orig.id, orig], ...requests.map((r) => [r.id, r])]);
  return { original: orig, request: orig, rows, rowsByZone, requestsById, children };
}
const states = (w) => surveyConfirmZoneStates(w);
const ids = (list) => list.map((x) => (x.row || x).zoneId);

/* ═══ 1) ตัวจัดสภาพ + ตัวตัดสิน ข้ามทุกสถานการณ์ของสเปก ═══════════════════════════════════════════ */

test('ใบต้นทางอย่างเดียว: ทั้งสองพื้นที่รอยืนยัน · แผนผ่าน · carry ตามลำดับพื้นที่ พร้อมตัวเลขรอบจากแบบ', () => {
  const w = world();
  const s = states(w);
  assert.deepEqual(ids(s.awaiting), ['Z-A', 'Z-B']);
  assert.deepEqual([s.confirmed.length, s.moved.length], [0, 0]);
  assert.deepEqual(ids(surveyConfirmAwaitingRows(w)), ['Z-A', 'Z-B']);
  const plan = surveyConfirmPlan(w);
  assert.equal(plan.ok, true);
  assert.equal(plan.title, 'ยืนยันหน้างาน — ร้านกาแฟสาขาหนึ่ง');
  assert.deepEqual(plan.carry, [
    { zoneId: 'Z-A', zoneName: 'ห้องนอน', sortOrder: 0, previous: { areaSqm: 48, packageSize: 'SM', packageQty: 1 } },
    { zoneId: 'Z-B', zoneName: 'ห้องนั่งเล่น', sortOrder: 1, previous: { areaSqm: 20, packageSize: 'ST', packageQty: 2 } },
  ]);
});

test('ลำดับภายในลิสต์: sortOrder ก่อน แล้วค่อย id — ไม่ขึ้นกับลำดับที่ส่งมา', () => {
  const rows = origRows().reverse().map((r) => ({ ...r }));
  rows[0].sortOrder = 1; rows[1].sortOrder = 1; // เท่ากัน ⇒ เรียงด้วย id (SV-OA < SV-OB)
  assert.deepEqual(ids(states(world({ rows })).awaiting), ['Z-A', 'Z-B']);
});

test('มีใบยืนยันเปิดอยู่ (ร่าง · รอรับเรื่อง · กำลังดำเนินการ): พื้นที่ยังรอ · ปุ่มติดด่าน confirm_open พร้อมใบนั้น', () => {
  const cases = [
    ['ร่าง (ไม่มีเลข)', req('DR-C1', { status: 'draft' }),
      'มีร่างใบยืนยันหน้างานที่ยังไม่ส่งอยู่แล้ว — เปิดร่างนั้นเพื่อส่ง หรือลบร่างก่อน'],
    ['รอรับเรื่อง', req('DR-C1', { status: 'pending', docNo: 'RQ-AS-26100005' }),
      'มีใบยืนยันหน้างานเปิดอยู่แล้ว — RQ-AS-26100005 (รอรับเรื่อง)'],
    ['รับเรื่องแล้ว ยังไม่แจ้งวัน', req('DR-C1', { status: 'acknowledged', docNo: 'RQ-AS-26100005' }),
      'มีใบยืนยันหน้างานเปิดอยู่แล้ว — RQ-AS-26100005 (รอกำหนดส่ง)'],
    ['รับเรื่อง + แจ้งวันแล้ว', req('DR-C1', { status: 'acknowledged', docNo: 'RQ-AS-26100005', committedDueDate: '2026-10-20' }),
      'มีใบยืนยันหน้างานเปิดอยู่แล้ว — RQ-AS-26100005 (กำลังดำเนินการ)'],
  ];
  for (const [name, child, error] of cases) {
    const w = world({ requests: [child], children: [child], extraRows: kidRows(child.id, ['Z-A', 'Z-B'], { all: { surveyedAt: null } }) });
    assert.deepEqual(ids(states(w).awaiting), ['Z-A', 'Z-B'], name);
    const plan = surveyConfirmPlan(w);
    assert.deepEqual(plan, {
      ok: false, status: 409, code: 'confirm_open', error, open: { id: 'DR-C1', docNo: child.docNo, status: child.status },
    }, name);
  }
});

test('ใบยืนยันเปิดหลายใบ: open = ใบที่เปิดล่าสุด (createdAt) · selfId ไม่ติดด่านตัวเอง', () => {
  const a = req('DR-C1', { status: 'draft', createdAt: '2026-10-06T03:00:00.000Z' });
  const b = req('DR-C2', { status: 'pending', docNo: 'RQ-AS-26100007', createdAt: '2026-10-07T03:00:00.000Z' });
  const w = world({ requests: [a, b], children: [a, b] });
  assert.equal(surveyConfirmPlan(w).open.id, 'DR-C2');
  // ตัวเองไม่นับ — เหลือใบอื่นอีกใบที่ยังเปิด
  assert.equal(surveyConfirmPlan({ ...w, selfId: 'DR-C2' }).open.id, 'DR-C1');
  assert.equal(surveyConfirmPlan({ ...w, children: [a], selfId: 'DR-C1' }).ok, true, 'ร่างของตัวเองไม่ติดด่าน');
});

test('ใบยืนยันส่งผลลงหน้างานครบ: ยืนยันแล้วทั้งสอง · ไม่เหลือพื้นที่รอ ⇒ confirm_none_left', () => {
  const child = req('DR-C1', { status: 'answered', docNo: 'RQ-AS-26100005', answeredAt: '2026-10-09T03:00:00.000Z' });
  const w = world({ requests: [child], children: [child], extraRows: kidRows('DR-C1', ['Z-A', 'Z-B']) });
  const s = states(w);
  assert.deepEqual([s.awaiting.length, s.moved.length], [0, 0]);
  assert.deepEqual(ids(s.confirmed), ['Z-A', 'Z-B']);
  assert.equal(s.confirmed[0].by.id, 'DR-C1');
  assert.deepEqual(surveyConfirmPlan(w), {
    ok: false, status: 409, code: 'confirm_none_left', error: `ใบนี้ไม่มีพื้นที่ที่รอยืนยันหน้างานของ ${ORIG_DOC}`, open: null,
  });
});

test('ใบยืนยันถูกยกเลิก / ปิดโดยไม่ได้ประเมิน: พื้นที่กลับมารอ · ปุ่มกดได้อีก', () => {
  for (const child of [
    req('DR-C1', { status: 'cancelled', docNo: 'RQ-AS-26100005' }),
    req('DR-C1', { status: 'closed', docNo: 'RQ-AS-26100005', closedAt: '2026-10-09T03:00:00.000Z' }),
  ]) {
    const w = world({ requests: [child], children: [child], extraRows: kidRows('DR-C1', ['Z-A', 'Z-B'], { all: { surveyedAt: '2026-10-08T03:00:00.000Z' } }) });
    assert.deepEqual(ids(states(w).awaiting), ['Z-A', 'Z-B'], child.status);
    assert.equal(surveyConfirmPlan(w).ok, true, child.status);
  }
});

test('พื้นที่ถูกตัดออกในใบยืนยันที่ส่งแล้ว: พื้นที่นั้นยังรอ อีกพื้นที่ยืนยันแล้ว', () => {
  const child = req('DR-C1', { status: 'answered', docNo: 'RQ-AS-26100005', answeredAt: '2026-10-09T03:00:00.000Z' });
  const w = world({ requests: [child], children: [child], extraRows: kidRows('DR-C1', ['Z-A', 'Z-B'], { 'Z-B': { status: 'cut' } }) });
  const s = states(w);
  assert.deepEqual([ids(s.awaiting), ids(s.confirmed), s.moved.length], [['Z-B'], ['Z-A'], 0]);
  const plan = surveyConfirmPlan(w);
  assert.deepEqual(plan.carry.map((c) => c.zoneId), ['Z-B']);
});

test('ใบยืนยันถูกเปลี่ยนเป็นจากแบบแล้วส่ง: ทั้งสองพื้นที่ = moved (ไม่ใช่ยืนยันแล้ว) · 0 รอ · 0 ยืนยัน', () => {
  const child = req('DR-C1', { status: 'answered', docNo: 'RQ-AS-26100005', answeredAt: '2026-10-09T03:00:00.000Z', surveyConfirm: 'needed' });
  const w = world({ requests: [child], children: [child], extraRows: kidRows('DR-C1', ['Z-A', 'Z-B'], { all: { method: 'drawing' } }) });
  const s = states(w);
  assert.deepEqual([s.awaiting.length, s.confirmed.length], [0, 0]);
  assert.deepEqual(ids(s.moved), ['Z-A', 'Z-B']);
  assert.equal(s.moved[0].to.id, 'DR-C1');
});

test('ส่งผสม: Z-A วัดแล้ว Z-B ประเมินจากแบบอีกครั้ง ⇒ confirmed 1 · moved 1', () => {
  const child = req('DR-C1', { status: 'answered', docNo: 'RQ-AS-26100005', answeredAt: '2026-10-09T03:00:00.000Z' });
  const w = world({ requests: [child], children: [child], extraRows: kidRows('DR-C1', ['Z-A', 'Z-B'], { 'Z-B': { method: 'drawing' } }) });
  const s = states(w);
  assert.deepEqual([s.awaiting.length, ids(s.confirmed), ids(s.moved)], [0, ['Z-A'], ['Z-B']]);
});

test('ใบต้นทางถูกดึงผลกลับ (ไม่มี answeredAt): ทั้งสามลิสต์ว่าง · แผน confirm_not_sent', () => {
  const w = world({ orig: original({ answeredAt: null, surveyConfirm: null, status: 'acknowledged' }) });
  assert.deepEqual(states(w), { awaiting: [], confirmed: [], moved: [] });
  const plan = surveyConfirmPlan(w);
  assert.equal(plan.code, 'confirm_not_sent');
  assert.equal(plan.status, 409);
  assert.equal(plan.error, `ใบ ${ORIG_DOC} ยังไม่มีผลที่ส่งแล้ว (อาจถูกดึงผลกลับมาแก้) — รอ TS ส่งผลก่อนจึงขอยืนยันหน้างานได้`);
});

test('ใบต้นทางถูกดึงกลับแล้วส่งใหม่หลังใบยืนยันส่งผล: แถวจากแบบถูกตัด (ใบยืนยันเปิดทีหลัง) ⇒ ยืนยันแล้วครบ', () => {
  const child = req('DR-C1', { status: 'answered', docNo: 'RQ-AS-26100005', answeredAt: '2026-10-09T03:00:00.000Z' });
  const rows = origRows().map((r) => ({ ...r, surveyedAt: '2026-10-12T03:00:00.000Z' })); // วัดทับทีหลัง
  const w = world({ orig: original({ answeredAt: '2026-10-12T03:00:00.000Z' }), rows, requests: [child], children: [child], extraRows: kidRows('DR-C1', ['Z-A', 'Z-B']) });
  const s = states(w);
  assert.deepEqual([s.awaiting.length, ids(s.confirmed), s.moved.length], [0, ['Z-A', 'Z-B'], 0]);
});

test('ใบลงหน้างานธรรมดา (ไม่ผูก) ส่งผลทีหลัง ⇒ confirmed · by เป็นใบนั้น ไม่ใช่ลูก', () => {
  const other = req('DR-X', { status: 'answered', docNo: 'RQ-AS-26100009', answeredAt: '2026-10-09T03:00:00.000Z', surveyConfirmOfId: 'DR-O' });
  const w = world({ requests: [other], children: [], extraRows: kidRows('DR-X', ['Z-A']) });
  const s = states(w);
  assert.deepEqual([ids(s.awaiting), ids(s.confirmed)], [['Z-B'], ['Z-A']]);
  assert.equal(s.confirmed[0].by.id, 'DR-X');
  // ผูกหรือไม่ ตัดสินจาก id ของ children เท่านั้น (F7) — คีย์บนแถว fixture ไม่มีผล
  const view = surveyConfirmLinkView({ request: w.original, plan: surveyConfirmPlan(w), states: s, children: [], confirmOf: null, canManage: true });
  assert.deepEqual(view.confirmedBy, [{ id: 'DR-X', docNo: 'RQ-AS-26100009', href: '/requests/DR-X', linked: false }]);
});

test('ใบลงหน้างานธรรมดาที่ยังเปิดถือพื้นที่หนึ่งไว้ ⇒ แถว 6 confirm_zone_busy · open = ใบนั้น · ไม่มีคำ "เอารายการนี้ออก"', () => {
  const other = req('DR-X', { status: 'pending', docNo: 'RQ-AS-26100009' });
  const w = world({ requests: [other], extraRows: kidRows('DR-X', ['Z-B'], { all: { surveyedAt: null } }) });
  assert.deepEqual(ids(states(w).awaiting), ['Z-A', 'Z-B']);
  const plan = surveyConfirmPlan(w);
  assert.deepEqual(plan, {
    ok: false, status: 409, code: 'confirm_zone_busy',
    error: 'พื้นที่ ห้องนั่งเล่น: มีใบสั่งวัดค้างอยู่แล้ว RQ-AS-26100009 — รอใบนั้นจบก่อน',
    open: { id: 'DR-X', docNo: 'RQ-AS-26100009', status: 'pending' },
  });
  assert.doesNotMatch(plan.error, /เอารายการนี้ออก/);
});

test('ตอนยื่น (stage submit): แถว 4 ข้าม · ใบพี่น้องที่เปิดอยู่ถือพื้นที่ ⇒ แถว 6 · ร่างพี่น้องไม่ติดด่าน', () => {
  const self = req('DR-C1', { status: 'draft' });
  const sibling = req('DR-C2', { status: 'acknowledged', docNo: 'RQ-AS-26100007', committedDueDate: '2026-10-20' });
  const extraRows = [...kidRows('DR-C1', ['Z-A', 'Z-B'], { all: { surveyedAt: null } }), ...kidRows('DR-C2', ['Z-A'], { all: { surveyedAt: null } })];
  const w = world({ requests: [self, sibling], children: [self, sibling], extraRows });
  const plan = surveyConfirmPlan({ ...w, selfId: 'DR-C1', stage: 'submit' });
  assert.equal(plan.code, 'confirm_zone_busy');
  assert.equal(plan.open.id, 'DR-C2');
  // พี่น้องเป็นร่าง = ไม่เปิด ⇒ ไม่ติด
  const draftSibling = { ...sibling, status: 'draft', docNo: null };
  const w2 = world({ requests: [self, draftSibling], children: [self, draftSibling], extraRows });
  assert.equal(surveyConfirmPlan({ ...w2, selfId: 'DR-C1', stage: 'submit' }).ok, true);
  // แถวของตัวเองไม่ติดด่านตัวเอง แม้ตัวเองถูกส่งแล้ว (pending)
  const pendingSelf = { ...self, status: 'pending', docNo: 'RQ-AS-26100005' };
  const w3 = world({ requests: [pendingSelf], children: [pendingSelf], extraRows: kidRows('DR-C1', ['Z-A', 'Z-B'], { all: { surveyedAt: null } }) });
  assert.equal(surveyConfirmPlan({ ...w3, selfId: 'DR-C1', stage: 'submit' }).ok, true);
  // ตอนเปิด (stage open) ใบเดียวกันติดแถว 4 ก่อน
  assert.equal(surveyConfirmPlan(w3).code, 'confirm_open');
});

test('ใบต้นทางตอบว่าไม่ต้องยืนยัน: ลิสต์ว่าง · แผน confirm_not_needed (ชนะใบเปิดที่ค้าง — ลำดับด่าน)', () => {
  const child = req('DR-C1', { status: 'pending', docNo: 'RQ-AS-26100005' });
  const w = world({ orig: original({ surveyConfirm: 'not_needed' }), requests: [child], children: [child] });
  assert.deepEqual(states(w), { awaiting: [], confirmed: [], moved: [] });
  assert.deepEqual(surveyConfirmPlan(w), {
    ok: false, status: 409, code: 'confirm_not_needed', open: null,
    error: `TS แจ้งว่าใบ ${ORIG_DOC} ไม่ต้องยืนยันหน้างาน — ถ้ายังต้องการให้เข้าวัด เปิดคำร้องประเมินพื้นที่แบบลงหน้างานตามปกติ`,
  });
  // เทียบตรงตัว — ค่าแปลกไม่ถูกเดาว่า needed
  assert.equal(surveyConfirmPlan(world({ orig: original({ surveyConfirm: 'Needed' }) })).code, 'confirm_not_needed');
});

test('ใบต้นทางถูกยกเลิก ⇒ confirm_not_sent (ชนะ not_needed) · ฝ่ายในประโยคมาจากใบ', () => {
  const plan = surveyConfirmPlan(world({ orig: original({ status: 'cancelled', surveyConfirm: 'not_needed', dept: 'XX' }) }));
  assert.equal(plan.code, 'confirm_not_sent');
  assert.match(plan.error, /รอ XX ส่งผลก่อน/);
});

test('ไม่มีใบต้นทาง / ไม่ใช่คำร้องประเมินพื้นที่ ⇒ 404 confirm_no_original (N4)', () => {
  for (const orig of [null, undefined, original({ kind: 'inquiry' })]) {
    const plan = surveyConfirmPlan({ original: orig, rows: [], rowsByZone: new Map(), requestsById: new Map() });
    assert.deepEqual(plan, { ok: false, status: 404, code: 'confirm_no_original', error: SURVEY_CONFIRM_NO_ORIGINAL, open: null });
  }
});

test('ใบจากแบบธรรมดา (ไม่ผูก) เปิดทีหลังบนพื้นที่เดียวกันและส่งแล้ว ⇒ moved · needed ของใบนั้นติดมากับ movedTo', () => {
  const other = req('DR-Y', { status: 'answered', docNo: 'RQ-AS-26100010', answeredAt: '2026-10-09T03:00:00.000Z', surveyConfirm: 'needed' });
  const w = world({ requests: [other], extraRows: kidRows('DR-Y', ['Z-A'], { all: { method: 'drawing' } }) });
  const s = states(w);
  assert.deepEqual([ids(s.awaiting), ids(s.moved)], [['Z-B'], ['Z-A']]);
  const view = surveyConfirmLinkView({ request: w.original, plan: surveyConfirmPlan(w), states: s, children: [], confirmOf: null, canManage: true });
  assert.deepEqual(view.movedTo, [{ id: 'DR-Y', docNo: 'RQ-AS-26100010', href: '/requests/DR-Y', linked: false, needed: true }]);
});

test('แถวไม่มี zoneId · แถวลงหน้างาน · แถวที่ถูกตัด ของใบต้นทาง ไม่ถูกจัดสภาพ', () => {
  const rows = [
    row('SV-1', 'DR-O', null, { method: 'drawing', surveyedAt: '2026-10-04T03:00:00.000Z' }),
    row('SV-2', 'DR-O', 'Z-C', { method: 'onsite', surveyedAt: '2026-10-04T03:00:00.000Z' }),
    row('SV-3', 'DR-O', 'Z-A', { method: 'drawing', status: 'cut' }),
  ];
  const w = world({ rows });
  assert.deepEqual(states(w), { awaiting: [], confirmed: [], moved: [] });
  assert.equal(surveyConfirmPlan(w).code, 'confirm_none_left');
});

test('แผนไม่ถูกแตะด้วยลูกที่ส่งมาในรูปอาร์เรย์ว่าง/ไม่ส่ง · ตัวจัดสภาพไม่พังกับ Map ว่าง', () => {
  const w = world();
  assert.equal(surveyConfirmPlan({ original: w.original, rows: w.rows, rowsByZone: new Map(), requestsById: new Map() }).ok, true);
  assert.deepEqual(surveyConfirmZoneStates({ request: null, rows: null }), { awaiting: [], confirmed: [], moved: [] });
});

/* ═══ 2) ตัวสร้าง body ของ POST · ด่านตอนยื่น ═══════════════════════════════════════════════════ */

test('surveyConfirmCreateBody: ทิ้งพื้นที่/ดีล/ไซต์/วิธีที่โพสต์มา · variant = standard · ลำดับตาม carry · ไม่มี sortOrder', () => {
  const plan = surveyConfirmPlan(world());
  const posted = {
    kind: 'inquiry', variant: 'drawing', dealId: 'DL-OTHER', siteId: 'ST-OTHER', confirmsRequestId: 'DR-O',
    zones: [{ zoneId: 'Z-X', sortOrder: 9 }, { zoneId: 'Z-B' }], title: '  ', dueDate: '2026-10-20', visitDate: '2026-10-18',
    visitTime: '10:00', body: 'ขอเข้าวัด', urgent: true, team: 'T1',
  };
  const out = surveyConfirmCreateBody(posted, original(), plan);
  assert.deepEqual(out, {
    ...posted, kind: 'site_survey', variant: 'standard', dealId: 'DL-1', siteId: 'ST-1',
    zones: [{ zoneId: 'Z-A' }, { zoneId: 'Z-B' }], title: 'ยืนยันหน้างาน — ร้านกาแฟสาขาหนึ่ง',
  });
  assert.equal(posted.variant, 'drawing', 'ไม่แก้ body ตัวเดิม');
  assert.equal(surveyConfirmCreateBody({}, original(), plan).variant, 'standard', 'ไม่ส่ง variant มาก็ได้ standard');
  assert.equal(surveyConfirmCreateBody({ title: ' ชื่อเอง ' }, original(), plan).title, 'ชื่อเอง');
  for (const z of out.zones) assert.deepEqual(Object.keys(z), ['zoneId']);
});

test('surveyConfirmSubmitMismatch: วิธีไม่ใช่ standard ⇒ N25 (ค่าคงที่ตัวเดียวกัน) · พื้นที่ไม่ตรง ⇒ N6a / N6b', () => {
  const plan = surveyConfirmPlan(world());
  const zonesOf = (list) => list.map((zoneId, i) => ({ id: `SV-${i}`, zoneId, status: 'pending', method: 'onsite' }));
  const draft = (over = {}) => ({ id: 'DR-C1', variant: 'standard', submittedAt: null, surveyZones: zonesOf(['Z-B', 'Z-A']), ...over });
  assert.equal(surveyConfirmSubmitMismatch(plan, draft(), original()), null, 'ลำดับไม่สำคัญ');
  assert.equal(surveyConfirmSubmitMismatch(plan, draft({ variant: 'drawing' }), original()), SURVEY_CONFIRM_VARIANT_ERROR);
  assert.equal(surveyConfirmSubmitMismatch(plan, draft({ variant: null }), original()), SURVEY_CONFIRM_VARIANT_ERROR);
  const n6a = `พื้นที่ของร่างนี้ไม่ตรงกับพื้นที่ที่ยังรอยืนยันหน้างานของ ${ORIG_DOC} แล้ว — ลบร่างนี้ แล้วกด “ขอยืนยันหน้างาน” ที่ใบ ${ORIG_DOC} ใหม่`;
  const n6b = `พื้นที่ของใบนี้ไม่ตรงกับพื้นที่ที่ยังรอยืนยันหน้างานของ ${ORIG_DOC} แล้ว — ยกเลิกใบนี้ แล้วกด “ขอยืนยันหน้างาน” ที่ใบ ${ORIG_DOC} ใหม่`;
  assert.equal(surveyConfirmSubmitMismatch(plan, draft({ surveyZones: zonesOf(['Z-A']) }), original()), n6a);
  assert.equal(surveyConfirmSubmitMismatch(plan, draft({ surveyZones: zonesOf(['Z-A', 'Z-B', 'Z-C']) }), original()), n6a);
  assert.equal(surveyConfirmSubmitMismatch(plan, draft({ surveyZones: [...zonesOf(['Z-A', 'Z-B']), { id: 'SV-N', zoneId: null }] }), original()), n6a, 'พื้นที่ใหม่ไม่มี zoneId = ไม่ตรง');
  assert.equal(surveyConfirmSubmitMismatch(plan, draft({ submittedAt: '2026-10-07T03:00:00.000Z', surveyZones: zonesOf(['Z-A']) }), original()), n6b);
  // แถวที่ถูกตัดไม่นับ
  assert.equal(surveyConfirmSubmitMismatch(plan, draft({ surveyZones: [...zonesOf(['Z-A', 'Z-B']), { id: 'SV-9', zoneId: 'Z-C', status: 'cut' }] }), original()), null);
  // ⚠️ ตั้งใจป้อนแถวจากแบบที่เส้นทางจริงสร้างไม่ได้ (F9) — ด่านไม่ดูวิธีรายแถว ⇒ null
  const seeded = draft({ surveyZones: zonesOf(['Z-A', 'Z-B']).map((z) => ({ ...z, method: 'drawing' })) });
  assert.equal(surveyConfirmSubmitMismatch(plan, seeded, original()), null);
});

/* ═══ 3) ก้อนของหน้าคำร้อง ═══════════════════════════════════════════════════════════════════ */

test('surveyConfirmLinkView: ปุ่มพร้อม / ติดด่าน (confirm_open · confirm_zone_busy) / ไม่มีปุ่ม · ร่างเห็นเฉพาะคนจัดการได้', () => {
  const w = world();
  const ready = surveyConfirmLinkView({ request: w.original, plan: surveyConfirmPlan(w), states: states(w), children: [], confirmOf: null, canManage: true });
  assert.deepEqual(ready, {
    unknown: false, awaiting: 2, confirmed: 0, moved: 0, confirmedBy: [], movedTo: [],
    action: { state: 'ready', reason: null, href: '/requests/new?confirms=DR-O' }, children: [], confirmOf: null,
  });
  assert.equal(surveyConfirmLinkView({ request: w.original, plan: surveyConfirmPlan(w), states: states(w), children: [], confirmOf: null, canManage: false }).action, null);

  const draft = req('DR-C1', { status: 'draft', createdAt: '2026-10-06T03:00:00.000Z' });
  const ack = req('DR-C0', { status: 'acknowledged', docNo: 'RQ-AS-26100004', committedDueDate: '2026-10-20', createdAt: '2026-10-05T03:00:00.000Z' });
  const ackNoDate = req('DR-C9', { status: 'acknowledged', docNo: 'RQ-AS-26100003', createdAt: '2026-10-04T03:00:00.000Z' });
  const kids = [ackNoDate, draft, ack];
  const w2 = world({ requests: kids, children: kids });
  const blocked = surveyConfirmLinkView({ request: w2.original, plan: surveyConfirmPlan(w2), states: states(w2), children: kids, confirmOf: null, canManage: true });
  assert.deepEqual(blocked.action, { state: 'blocked', reason: 'มีร่างใบยืนยันหน้างานที่ยังไม่ส่งอยู่แล้ว — เปิดร่างนั้นเพื่อส่ง หรือลบร่างก่อน', href: '/requests/new?confirms=DR-O' });
  assert.deepEqual(blocked.children, [
    { id: 'DR-C1', docNo: null, statusLabel: 'ร่าง', href: '/requests/DR-C1' },
    { id: 'DR-C0', docNo: 'RQ-AS-26100004', statusLabel: 'กำลังดำเนินการ', href: '/requests/DR-C0' },
    { id: 'DR-C9', docNo: 'RQ-AS-26100003', statusLabel: 'รอกำหนดส่ง', href: '/requests/DR-C9' },
  ], 'ใหม่ก่อน · รับเรื่อง+มีวัน = กำลังดำเนินการ · ไม่มีวัน = รอกำหนดส่ง');
  // ใบยืนยันที่ TS ปิดโดยไม่ได้ส่งผล = คำเดียวกับหน้าใบนั้น ไม่ใช่ "ปิดเรื่อง" ของ requestStatusView · ปิดหลังส่งผลแล้ว = "ปิดเรื่อง" ตามเดิม
  const shut = req('DR-C7', { status: 'closed', docNo: 'RQ-AS-26100007', answeredAt: null, closedAt: '2026-10-08T03:00:00.000Z', createdAt: '2026-10-03T03:00:00.000Z' });
  const done = req('DR-C6', { status: 'closed', docNo: 'RQ-AS-26100006', answeredAt: '2026-10-07T03:00:00.000Z', closedAt: '2026-10-08T03:00:00.000Z', createdAt: '2026-10-02T03:00:00.000Z' });
  const ended = surveyConfirmLinkView({ request: w2.original, plan: null, states: null, children: [shut, done], confirmOf: null, canManage: true });
  assert.deepEqual(ended.children.map((c) => c.statusLabel), [SURVEY_CONFIRM_CLOSED_UNASSESSED, 'ปิดเรื่อง']);
  assert.equal(SURVEY_CONFIRM_CLOSED_UNASSESSED, 'ปิดโดยไม่ได้ประเมิน');
  const viewer = surveyConfirmLinkView({ request: w2.original, plan: surveyConfirmPlan(w2), states: states(w2), children: kids, confirmOf: null, canManage: false });
  assert.deepEqual(viewer.children.map((c) => c.id), ['DR-C0', 'DR-C9'], 'คนที่จัดการไม่ได้ไม่เห็นร่าง');
  assert.equal(viewer.action, null);

  const other = req('DR-X', { status: 'pending', docNo: 'RQ-AS-26100009' });
  const w3 = world({ requests: [other], extraRows: kidRows('DR-X', ['Z-A'], { all: { surveyedAt: null } }) });
  const busy = surveyConfirmLinkView({ request: w3.original, plan: surveyConfirmPlan(w3), states: states(w3), children: [], confirmOf: null, canManage: true });
  assert.equal(busy.action.state, 'blocked');
  assert.match(busy.action.reason, /^พื้นที่ ห้องนอน: มีใบสั่งวัดค้างอยู่แล้ว RQ-AS-26100009/);

  // ด่านอื่น (none_left · not_needed · not_sent) ⇒ ไม่มีปุ่ม
  const w4 = world({ orig: original({ surveyConfirm: 'not_needed' }) });
  assert.equal(surveyConfirmLinkView({ request: w4.original, plan: surveyConfirmPlan(w4), states: states(w4), children: [], confirmOf: null, canManage: true }).action, null);
});

test('surveyConfirmLinkView: บนใบยืนยัน — confirmOf (มี / ใบต้นทางหาย) · ไม่มีแผน/สภาพ = นับ 0', () => {
  const child = req('DR-C1', { status: 'pending', docNo: 'RQ-AS-26100005' });
  const v = surveyConfirmLinkView({ request: child, plan: null, states: null, children: [], confirmOf: { id: 'DR-O', docNo: ORIG_DOC }, canManage: true });
  assert.deepEqual(v, {
    unknown: false, awaiting: 0, confirmed: 0, moved: 0, confirmedBy: [], movedTo: [], action: null, children: [],
    confirmOf: { id: 'DR-O', docNo: ORIG_DOC, href: '/requests/DR-O', missing: false },
  });
  const gone = surveyConfirmLinkView({ request: child, plan: null, states: null, children: [], confirmOf: { id: 'DR-O', missing: true }, canManage: true });
  assert.deepEqual(gone.confirmOf, { id: 'DR-O', docNo: null, href: null, missing: true });
});

test('surveyConfirmLinkView: confirmedBy ไม่ซ้ำ ใหม่ก่อน · linked มาจาก children', () => {
  const c1 = req('DR-C1', { status: 'answered', docNo: 'RQ-AS-26100005', answeredAt: '2026-10-09T03:00:00.000Z', createdAt: '2026-10-06T03:00:00.000Z' });
  const x = req('DR-X', { status: 'answered', docNo: 'RQ-AS-26100009', answeredAt: '2026-10-10T03:00:00.000Z', createdAt: '2026-10-07T03:00:00.000Z' });
  const extraRows = [...kidRows('DR-C1', ['Z-A']), ...kidRows('DR-X', ['Z-B'])];
  const w = world({ requests: [c1, x], children: [c1], extraRows });
  const v = surveyConfirmLinkView({ request: w.original, plan: surveyConfirmPlan(w), states: states(w), children: [c1], confirmOf: null, canManage: true });
  assert.deepEqual(v.confirmedBy, [
    { id: 'DR-X', docNo: 'RQ-AS-26100009', href: '/requests/DR-X', linked: false },
    { id: 'DR-C1', docNo: 'RQ-AS-26100005', href: '/requests/DR-C1', linked: true },
  ]);
  const both = world({ requests: [c1], children: [c1], extraRows: kidRows('DR-C1', ['Z-A', 'Z-B']) });
  assert.equal(surveyConfirmLinkView({ request: both.original, plan: surveyConfirmPlan(both), states: states(both), children: [c1], confirmOf: null, canManage: true }).confirmedBy.length, 1, 'ใบเดียววัดสองพื้นที่ = หนึ่งรายการ');
});

/* ═══ 4) แบนเนอร์ของใบต้นทาง (ตาราง D-1 แถว 1–7) ═══════════════════════════════════════════════ */

test('surveyConfirmBannerParts: ทุกแถวของตาราง D-1 · keep ของแถว 4–7 เป็นของตัวเอง · ไม่มี “ขอยืนยันหน้างาน” บนแถว 4–7', () => {
  const by = (id, docNo, extra = {}) => ({ id, docNo, href: `/requests/${id}`, linked: false, ...extra });
  const L = (over) => ({ unknown: false, awaiting: 0, confirmed: 0, moved: 0, confirmedBy: [], movedTo: [], action: null, children: [], confirmOf: null, ...over });
  const opts = { n: 2, dept: 'TS' };
  const cases = [
    ['แถว 0: ไม่มีก้อน', null, { text: null, keep: undefined, note: undefined, refs: [] }],
    ['แถว 1: อ่านไม่สำเร็จ', { unknown: true }, { text: null, keep: undefined, note: 'อ่านสถานะใบยืนยันหน้างานไม่สำเร็จ — โหลดหน้าใหม่', refs: [] }],
    ['แถว 2: ยังรอทั้งหมด', L({ awaiting: 2 }), { text: null, keep: undefined, note: undefined, refs: [] }],
    ['แถว 3: ยืนยันแล้วบางส่วน', L({ awaiting: 1, confirmed: 1 }),
      { text: null, keep: undefined, note: 'ยืนยันหน้างานแล้ว 1 พื้นที่ · ยังรอยืนยัน 1 พื้นที่', refs: [] }],
    ['แถว 3: จากแบบอีกครั้งบางส่วน', L({ awaiting: 1, moved: 1 }),
      { text: null, keep: undefined, note: 'ประเมินจากแบบอีกครั้ง 1 พื้นที่ · ยังรอยืนยัน 1 พื้นที่', refs: [] }],
    ['แถว 3: สามส่วน', L({ awaiting: 1, confirmed: 2, moved: 3 }),
      { text: null, keep: undefined, note: 'ยืนยันหน้างานแล้ว 2 พื้นที่ · ประเมินจากแบบอีกครั้ง 3 พื้นที่ · ยังรอยืนยัน 1 พื้นที่', refs: [] }],
    ['แถว 4: วัดครบ', L({ confirmed: 2, confirmedBy: [by('DR-X', 'RQ-AS-26100009'), by('DR-C1', 'RQ-AS-26100005', { linked: true })] }),
      { text: 'มี 2 พื้นที่ที่ประเมินจากแบบ — วัดหน้างานแล้วครบ ใช้ตัวเลขของใบ', keep: ['วัดหน้างานแล้วครบ'], note: null,
        refs: [{ docNo: 'RQ-AS-26100009', href: '/requests/DR-X' }, { docNo: 'RQ-AS-26100005', href: '/requests/DR-C1' }] }],
    ['แถว 5: วัดบาง จากแบบอีกครั้งบาง (ใบนั้นต้องยืนยัน)', L({ confirmed: 1, moved: 1, movedTo: [by('DR-C1', 'RQ-AS-26100005', { linked: true, needed: true })] }),
      { text: 'มี 2 พื้นที่ที่ประเมินจากแบบ — ยืนยันหน้างานแล้ว 1 พื้นที่ · อีก 1 พื้นที่ประเมินจากแบบอีกครั้งในใบ',
        keep: ['ยืนยันหน้างานแล้ว 1 พื้นที่', 'ประเมินจากแบบอีกครั้ง'], note: 'ขอยืนยันหน้างานของพื้นที่ที่เหลือได้ที่ใบนั้น',
        refs: [{ docNo: 'RQ-AS-26100005', href: '/requests/DR-C1' }] }],
    ['แถว 5: ใบนั้นไม่ต้องยืนยัน', L({ confirmed: 1, moved: 1, movedTo: [by('DR-C1', 'RQ-AS-26100005', { needed: false })] }),
      { text: 'มี 2 พื้นที่ที่ประเมินจากแบบ — ยืนยันหน้างานแล้ว 1 พื้นที่ · อีก 1 พื้นที่ประเมินจากแบบอีกครั้งในใบ',
        keep: ['ยืนยันหน้างานแล้ว 1 พื้นที่', 'ประเมินจากแบบอีกครั้ง'], note: null, refs: [{ docNo: 'RQ-AS-26100005', href: '/requests/DR-C1' }] }],
    ['แถว 6: จากแบบอีกครั้งทั้งหมด', L({ moved: 2, movedTo: [by('DR-Y', 'RQ-AS-26100010', { needed: true })] }),
      { text: 'มี 2 พื้นที่ที่ประเมินจากแบบ — ประเมินจากแบบอีกครั้งในใบ', keep: ['ประเมินจากแบบอีกครั้ง'],
        note: 'ขอยืนยันหน้างานของพื้นที่ที่เหลือได้ที่ใบนั้น', refs: [{ docNo: 'RQ-AS-26100010', href: '/requests/DR-Y' }] }],
    ['แถว 7: จัดสภาพไม่ได้', L({}),
      { text: 'มี 2 พื้นที่ที่ประเมินจากแบบ — ใช้ตัวเลขเสนอราคาได้เลย', keep: ['ใช้ตัวเลขเสนอราคาได้เลย'], note: null, refs: [] }],
  ];
  for (const [name, input, want] of cases) {
    const got = surveyConfirmBannerParts(input, opts);
    assert.deepEqual(got, want, name);
    for (const s of [got.text, got.note, ...(got.keep || [])].filter(Boolean)) {
      assert.doesNotMatch(s, /ยืนยันหน้างานแล้ว 0/, name);
      assert.doesNotMatch(s, /ไม่ได้เข้าพื้นที่/, name);
    }
    if (got.text) {
      assert.doesNotMatch(got.text, /“ขอยืนยันหน้างาน”/, name);
      for (const k of got.keep) assert.ok(got.text.includes(k), `${name}: keep ต้องอยู่ในประโยค — ${k}`);
    } else {
      assert.equal(got.keep, undefined, `${name}: แถว 0–3 คง keep ของวันนี้`);
    }
  }
});

/* ═══ 5) บรรทัดเธรดตอนใบยืนยันส่งผล ═══════════════════════════════════════════════════════════ */

const CHILD = { id: 'DR-C1', docNo: 'RQ-AS-26100005' };
test('surveyConfirmSentLines: สี่ผลลัพธ์ · เรียง เปลี่ยน → จากแบบอีกครั้ง → ตัด → ตรง · ไม่มีคู่ = ไม่มีบรรทัด', () => {
  const originalRows = [
    row('SV-OA', 'DR-O', 'Z-A', { sortOrder: 0, method: 'drawing', parts: [part(6, 8)], packageSize: 'SM', packageQty: 1 }),
    row('SV-OB', 'DR-O', 'Z-B', { sortOrder: 1, method: 'drawing', parts: [part(5, 4)], packageSize: 'st', packageQty: 2 }),
    row('SV-OC', 'DR-O', 'Z-C', { sortOrder: 2, method: 'drawing', parts: [part(2, 2)], packageSize: 'SM', packageQty: 1 }),
    row('SV-OD', 'DR-O', 'Z-D', { sortOrder: 3, method: 'drawing', zoneName: 'ห้องเก็บของ', parts: [part(3, 3)], packageSize: 'SM', packageQty: 1 }),
    row('SV-OE', 'DR-O', 'Z-E', { sortOrder: 4, method: 'drawing', status: 'cut', zoneName: 'ห้องที่ตัด' }),
  ];
  const childRows = [
    row('SV-1', 'DR-C1', 'Z-B', { sortOrder: 0, parts: [part(5, 4)], packageSize: ' ST ', packageQty: '2' }),     // ตรง
    row('SV-2', 'DR-C1', 'Z-A', { sortOrder: 1, parts: [part(6, 9)], packageSize: 'SM', packageQty: 1 }),          // พื้นที่เปลี่ยน แพ็คเกจเดิม
    row('SV-3', 'DR-C1', 'Z-C', { sortOrder: 2, method: 'drawing', parts: [part(2, 2)] }),                          // จากแบบอีกครั้ง
    row('SV-4', 'DR-C1', 'Z-D', { sortOrder: 3, status: 'cut', zoneName: 'ห้องเก็บของ' }),                         // ตัด
    row('SV-5', 'DR-C1', 'Z-F', { sortOrder: 4, zoneName: 'ห้องที่หัวหน้าเพิ่ม' }),                                    // ไม่มีคู่
    row('SV-6', 'DR-C1', 'Z-E', { sortOrder: 5, zoneName: 'ห้องที่ตัด' }),                                           // คู่ถูกตัดในใบต้นทาง
    row('SV-7', 'DR-C1', null, { sortOrder: 6 }),                                                                 // ไม่มี zoneId
  ];
  const lines = surveyConfirmSentLines({ child: CHILD, childRows, originalRows });
  assert.deepEqual(lines, [
    { zoneId: 'Z-A', outcome: 'confirmed_changed', text: 'ยืนยันหน้างานแล้ว (RQ-AS-26100005) — ห้องนอน: 48 ตร.ม. · SM 1 → 54 ตร.ม. · SM 1' },
    { zoneId: 'Z-C', outcome: 'drawing_again', text: 'ยังไม่ได้ยืนยันหน้างาน — โถง ประเมินจากแบบอีกครั้ง (RQ-AS-26100005)' },
    { zoneId: 'Z-D', outcome: 'cut', text: 'ยังไม่ได้ยืนยันหน้างาน — ห้องเก็บของ ถูกตัดออกจากใบ RQ-AS-26100005' },
    { zoneId: 'Z-B', outcome: 'confirmed_same', text: 'ยืนยันหน้างานแล้ว (RQ-AS-26100005) — ห้องนั่งเล่น: ตัวเลขตรงกับผลจากแบบ' },
  ]);
  for (const l of lines.filter((x) => x.outcome === 'drawing_again' || x.outcome === 'cut')) {
    assert.doesNotMatch(l.text, /ยืนยันหน้างานแล้ว/, 'แถวจากแบบ/ถูกตัด ห้ามเอ่ยว่ายืนยันแล้ว');
  }
});

test('surveyConfirmSentLines: ส่วนที่ขาดพิมพ์ขีด · เปลี่ยนแค่แพ็คเกจก็นับว่าเปลี่ยน', () => {
  const originalRows = [row('SV-OA', 'DR-O', 'Z-A', { method: 'drawing', parts: [], packageSize: 'SM', packageQty: 1 })];
  const childRows = [row('SV-1', 'DR-C1', 'Z-A', { parts: [part(6, 8)], packageSize: null, packageQty: null })];
  assert.deepEqual(surveyConfirmSentLines({ child: CHILD, childRows, originalRows }), [
    { zoneId: 'Z-A', outcome: 'confirmed_changed', text: 'ยืนยันหน้างานแล้ว (RQ-AS-26100005) — ห้องนอน: — · SM 1 → 48 ตร.ม. · —' },
  ]);
  const pkg = surveyConfirmSentLines({
    child: CHILD,
    childRows: [row('SV-1', 'DR-C1', 'Z-A', { parts: [part(6, 8)], packageSize: 'SM', packageQty: 2 })],
    originalRows: [row('SV-OA', 'DR-O', 'Z-A', { method: 'drawing', parts: [part(6, 8)], packageSize: 'SM', packageQty: 1 })],
  });
  assert.equal(pkg[0].outcome, 'confirmed_changed');
  assert.deepEqual(surveyConfirmSentLines({ child: CHILD, childRows: null, originalRows: null }), []);
});

test('surveyConfirmSentSummary: นับสามส่วน ส่วนที่เป็นศูนย์ไม่พิมพ์ · ไม่มีบรรทัด = null', () => {
  const L = (outcome) => ({ zoneId: 'Z', outcome, text: '' });
  assert.equal(surveyConfirmSentSummary(CHILD, []), null);
  assert.equal(surveyConfirmSentSummary(CHILD, null), null);
  assert.equal(surveyConfirmSentSummary(CHILD, [L('confirmed_changed'), L('confirmed_same'), L('drawing_again'), L('cut')]),
    'ผลใบยืนยันหน้างาน RQ-AS-26100005: ตัวเลขเปลี่ยน 1 · ตรงกับผลจากแบบ 1 · ยังไม่ได้ยืนยัน 2');
  assert.equal(surveyConfirmSentSummary(CHILD, [L('confirmed_same')]), 'ผลใบยืนยันหน้างาน RQ-AS-26100005: ตรงกับผลจากแบบ 1');
  assert.equal(surveyConfirmSentSummary(CHILD, [L('confirmed_changed')]), 'ผลใบยืนยันหน้างาน RQ-AS-26100005: ตัวเลขเปลี่ยน 1');
  assert.equal(surveyConfirmSentSummary(CHILD, [L('cut')]), 'ผลใบยืนยันหน้างาน RQ-AS-26100005: ยังไม่ได้ยืนยัน 1');
});

test('ส่งผล 60 พื้นที่: 500 ตัวอักษรแรก (ที่กระดิ่งโชว์) มีสรุปครบ และมีบรรทัด → อย่างน้อยหนึ่ง', () => {
  const originalRows = [];
  const childRows = [];
  for (let i = 0; i < 60; i += 1) {
    const zoneId = `Z-${String(i).padStart(2, '0')}`;
    originalRows.push(row(`SV-O${i}`, 'DR-O', zoneId, { sortOrder: i, zoneName: `ห้องประชุมชั้นสิบสองฝั่งทิศเหนือหมายเลข ${i}`, method: 'drawing', parts: [part(6, 8)], packageSize: 'SM', packageQty: 1 }));
    // 50 พื้นที่แรกตรง · 10 พื้นที่ท้ายเปลี่ยน — บรรทัดที่เปลี่ยนต้องขึ้นมาก่อนแม้อยู่ท้ายใบ
    childRows.push(row(`SV-${i}`, 'DR-C1', zoneId, { sortOrder: i, zoneName: `ห้องประชุมชั้นสิบสองฝั่งทิศเหนือหมายเลข ${i}`, parts: [part(6, i < 50 ? 8 : 10)], packageSize: 'SM', packageQty: 1 }));
  }
  const lines = surveyConfirmSentLines({ child: CHILD, childRows, originalRows });
  const summary = surveyConfirmSentSummary(CHILD, lines);
  const head = [summary, ...lines.map((l) => l.text)].join('\n').slice(0, 500);
  assert.ok(head.startsWith(summary));
  assert.match(head, /→/);
  assert.equal(summary, 'ผลใบยืนยันหน้างาน RQ-AS-26100005: ตัวเลขเปลี่ยน 10 · ตรงกับผลจากแบบ 50');
});

/* ═══ 6) บรรทัดจบ · รอบจากแบบ · ประโยคส่งออกทั้งหมด (F1) ════════════════════════════════════════ */

test('surveyConfirmEndedText: ยกเลิก / ปิดโดยไม่ได้ประเมิน / เปิดกลับ · หางมีเมื่อพื้นที่ยังรอเท่านั้น · เหตุผลตัดที่ 300', () => {
  assert.equal(surveyConfirmEndedText(CHILD, 'cancel'), 'ใบยืนยันหน้างาน RQ-AS-26100005 ถูกยกเลิก');
  assert.equal(surveyConfirmEndedText(CHILD, 'cancel', { stillAwaiting: true }), 'ใบยืนยันหน้างาน RQ-AS-26100005 ถูกยกเลิก — พื้นที่ยังรอยืนยันหน้างาน');
  assert.equal(surveyConfirmEndedText(CHILD, 'close-unassessed'), 'ใบยืนยันหน้างาน RQ-AS-26100005 ถูกปิดโดยไม่ได้ประเมิน');
  assert.equal(surveyConfirmEndedText(CHILD, 'close-unassessed', { stillAwaiting: true, reason: ' ร้านปิดปรับปรุง ' }),
    'ใบยืนยันหน้างาน RQ-AS-26100005 ถูกปิดโดยไม่ได้ประเมิน — พื้นที่ยังรอยืนยันหน้างาน · ร้านปิดปรับปรุง');
  const long = surveyConfirmEndedText(CHILD, 'close-unassessed', { reason: 'ก'.repeat(400) });
  assert.equal(long, `ใบยืนยันหน้างาน RQ-AS-26100005 ถูกปิดโดยไม่ได้ประเมิน · ${'ก'.repeat(300)}`);
  assert.equal(surveyConfirmEndedText(CHILD, 'reopened'),
    'ใบยืนยันหน้างาน RQ-AS-26100005 ถูกเปิดกลับมาแก้ — ผลยืนยันหน้างานที่แจ้งไว้ยังไม่นิ่ง รอ TS ส่งผลใหม่');
  assert.match(surveyConfirmEndedText({ ...CHILD, dept: 'XX' }, 'reopened'), /รอ XX ส่งผลใหม่$/);
  assert.match(surveyConfirmEndedText({ id: 'DR-C1' }, 'cancel'), /^ใบยืนยันหน้างาน DR-C1 ถูกยกเลิก$/);
});

test('surveyConfirmPreviousRoundText: ครบ / ขาดบางส่วน (ขีด) / ขาดทั้งสอง = null · รับก้อน previous ของ carry ได้', () => {
  const r = (over) => row('SV-OA', 'DR-O', 'Z-A', { method: 'drawing', ...over });
  assert.equal(surveyConfirmPreviousRoundText(r({ parts: [part(6, 8)], packageSize: 'sm', packageQty: 1 }), ORIG_DOC), `รอบจากแบบ (${ORIG_DOC}): 48 ตร.ม. · SM 1`);
  assert.equal(surveyConfirmPreviousRoundText(r({ parts: [part(6, 8)] }), ORIG_DOC), `รอบจากแบบ (${ORIG_DOC}): 48 ตร.ม. · —`);
  assert.equal(surveyConfirmPreviousRoundText(r({ packageQty: 2 }), ORIG_DOC), `รอบจากแบบ (${ORIG_DOC}): — · 2`);
  assert.equal(surveyConfirmPreviousRoundText(r({}), ORIG_DOC), null);
  assert.equal(surveyConfirmPreviousRoundText(null, ORIG_DOC), null);
  assert.equal(surveyConfirmPreviousRoundText({ areaSqm: 1234.5, packageSize: 'ST', packageQty: 3 }, ORIG_DOC), `รอบจากแบบ (${ORIG_DOC}): 1,234.5 ตร.ม. · ST 3`);
  assert.equal(surveyConfirmPreviousRoundText(r({ parts: [part(6, 8)] }), ''), 'รอบจากแบบ: 48 ตร.ม. · —');
});

test('surveyConfirmPreviousRoundKeep: เลขที่+วงเล็บ+โคลอนก้อนเดียว · ตัวเลข+หน่วย · ขนาด+จำนวน (UAT S5 head รอบ 1 K12)', () => {
  assert.deepEqual(surveyConfirmPreviousRoundKeep(`รอบจากแบบ (${ORIG_DOC}): 48 ตร.ม. · SM 1`), [`(${ORIG_DOC}):`, '48 ตร.ม.', 'SM 1']);
  assert.deepEqual(surveyConfirmPreviousRoundKeep(`รอบจากแบบ (${ORIG_DOC}): — · 2`), [`(${ORIG_DOC}):`]);
  assert.deepEqual(surveyConfirmPreviousRoundKeep('รอบจากแบบ: 1,234.5 ตร.ม. · —'), ['1,234.5 ตร.ม.']);
  assert.deepEqual(surveyConfirmPreviousRoundKeep(''), []);
  assert.deepEqual(surveyConfirmPreviousRoundKeep(null), []);
  // ทุกวลีอยู่ในข้อความจริง — ไม่มีวลีไหนที่ keepPhrases หาไม่เจอ
  const text = surveyConfirmPreviousRoundText({ areaSqm: 1234.5, packageSize: 'ST', packageQty: 3 }, ORIG_DOC);
  for (const phrase of surveyConfirmPreviousRoundKeep(text)) assert.ok(text.includes(phrase), phrase);
});

test('ประโยคส่งออก (F1): มีเลขที่ / มีแต่ id · ค่าคงที่ตรงตามตาราง §8.2', () => {
  const withDoc = { id: 'DR-O', docNo: ORIG_DOC, title: 'ร้านกาแฟสาขาหนึ่ง' };
  const idOnly = { id: 'DR-O' };
  assert.deepEqual(SURVEY_CONFIRM_OPEN_STATUSES, ['draft', 'pending', 'acknowledged']);
  assert.equal(SURVEY_CONFIRM_ACTION_LABEL, 'ขอยืนยันหน้างาน');
  assert.equal(SURVEY_CONFIRM_FORM_HINT, 'ใบยืนยันหน้างาน — ลงหน้างานเท่านั้น');
  assert.equal(SURVEY_CONFIRM_OF_LABEL, 'ยืนยันผลจากแบบของ');
  assert.equal(SURVEY_CONFIRM_CHILD_LABEL, 'ใบยืนยันหน้างาน');
  assert.equal(SURVEY_CONFIRM_FROM_ORIGINAL, 'จากใบต้นทาง');
  assert.equal(SURVEY_CONFIRM_ORIGINAL_MISSING, 'ใบต้นทางถูกลบไปแล้ว');
  assert.equal(SURVEY_CONFIRM_NO_ORIGINAL, 'ไม่พบใบต้นทางของใบยืนยันหน้างาน — อาจถูกลบไปแล้ว');
  assert.equal(SURVEY_CONFIRM_KIND_ERROR, 'ใบยืนยันหน้างานเปิดได้เฉพาะหัวข้อประเมินพื้นที่');
  assert.equal(SURVEY_CONFIRM_VARIANT_ERROR, 'ใบยืนยันหน้างานเปลี่ยนวิธีประเมินไม่ได้ — ลงหน้างานเท่านั้น');
  assert.equal(surveyConfirmHref('DR-O'), '/requests/new?confirms=DR-O');
  assert.equal(surveyConfirmHref('a b/c'), '/requests/new?confirms=a%20b%2Fc');
  assert.equal(surveyConfirmTitle(withDoc), 'ยืนยันหน้างาน — ร้านกาแฟสาขาหนึ่ง');
  assert.equal(surveyConfirmTitle({ docNo: ORIG_DOC }), `ยืนยันหน้างาน — ${ORIG_DOC}`);
  assert.equal(surveyConfirmTitle({ title: 'ก'.repeat(300) }).length, 200);
  const both = [
    [surveyConfirmForbiddenText, `ขอยืนยันหน้างานได้เฉพาะฝ่ายผู้ขอของใบ ${ORIG_DOC}`, 'ขอยืนยันหน้างานได้เฉพาะฝ่ายผู้ขอของใบ DR-O'],
    [surveyConfirmAuditSuffix, ` · ใบยืนยันหน้างานของ ${ORIG_DOC}`, ' · ใบยืนยันหน้างานของ DR-O'],
    [surveyConfirmSubtitle, `ใบยืนยันหน้างานของ ${ORIG_DOC} — บันทึกเป็นร่างก่อน เลขที่ออกตอนกดส่ง`, 'ใบยืนยันหน้างานของ DR-O — บันทึกเป็นร่างก่อน เลขที่ออกตอนกดส่ง'],
    [surveyConfirmDealHint, `ดีล ลูกค้า และสถานที่ยกมาจากใบ ${ORIG_DOC} — เปลี่ยนที่นี่ไม่ได้`, 'ดีล ลูกค้า และสถานที่ยกมาจากใบ DR-O — เปลี่ยนที่นี่ไม่ได้'],
    [surveyConfirmZonesLockText,
      `พื้นที่ชุดนี้ยกมาจากใบ ${ORIG_DOC} ทั้งหมด เอาออกหรือเพิ่มที่นี่ไม่ได้ — พื้นที่ที่ยังไม่พร้อม หัวหน้า TS ตัดออกหรือเปลี่ยนเป็นประเมินจากแบบในใบยืนยันหน้างานได้`,
      'พื้นที่ชุดนี้ยกมาจากใบ DR-O ทั้งหมด เอาออกหรือเพิ่มที่นี่ไม่ได้ — พื้นที่ที่ยังไม่พร้อม หัวหน้า TS ตัดออกหรือเปลี่ยนเป็นประเมินจากแบบในใบยืนยันหน้างานได้'],
    [surveyConfirmBackLinkText, `กลับไปที่ใบ ${ORIG_DOC}`, 'กลับไปที่ใบ DR-O'],
  ];
  for (const [fn, a, b] of both) {
    assert.equal(fn(withDoc), a, fn.name);
    assert.equal(fn(idOnly), b, fn.name);
  }
  assert.equal(surveyConfirmOpenLinkText({ docNo: 'RQ-AS-26100005' }), 'เปิดใบ RQ-AS-26100005');
  assert.equal(surveyConfirmOpenLinkText({ docNo: null }), 'เปิดใบ ร่าง');
  assert.equal(surveyConfirmOpenLinkText(null), 'เปิดใบ ร่าง');
  assert.equal(surveyConfirmChildLine({ docNo: 'RQ-AS-26100005', statusLabel: 'รอรับเรื่อง' }), 'ใบยืนยันหน้างาน: RQ-AS-26100005 · รอรับเรื่อง');
  assert.equal(surveyConfirmChildLine({ docNo: null, statusLabel: 'ร่าง' }), 'ใบยืนยันหน้างาน: ร่าง', 'ร่างไม่มีหาง "· ร่าง" ซ้ำ');
  assert.equal(surveyConfirmOfLine({ docNo: ORIG_DOC, missing: false }), `ยืนยันผลจากแบบของ: ${ORIG_DOC}`);
  assert.equal(surveyConfirmOfLine({ id: 'DR-O', missing: true }), 'ยืนยันผลจากแบบของ: ใบต้นทางถูกลบไปแล้ว');
  assert.equal(surveyConfirmOpenedText(CHILD), 'ฝ่ายขายขอยืนยันหน้างาน — เปิดใบ RQ-AS-26100005');
});

test('SURVEY_CONFIRM_ID_PATTERN: รับ DR-<uuid> · ปฏิเสธทุกอย่างที่ทำให้ path API เพี้ยน (F14)', () => {
  assert.equal(SURVEY_CONFIRM_ID_PATTERN.test('DR-3f1c2a9e-8b7d-4c6e-9a1b-2c3d4e5f6a7b'), true);
  for (const bad of ['../x', 'DR-a/b', 'DR-a%2F', 'DR-a.b', 'DR-a?x', 'DR-a#x', '', 'DR-', 'dr-abc', ' DR-abc', `DR-${'a'.repeat(101)}`]) {
    assert.equal(SURVEY_CONFIRM_ID_PATTERN.test(bad), false, JSON.stringify(bad));
  }
});

/* ═══ 7) ยามซอร์สของไฟล์นี้ ═══════════════════════════════════════════════════════════════════ */
const SRC = readFileSync(new URL('./surveyConfirmLink.js', import.meta.url), 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

test('🔴 import ได้เฉพาะโมดูลในลิสต์ของ §2.1 — ไฟล์นี้ไปถึงเบราว์เซอร์ผ่าน surveyJob.js', () => {
  const imports = [...CODE.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
  const allowed = ['@/lib/format', '@/lib/requests/statuses', '@/lib/service/survey', '@/lib/service/surveyMethod',
    '@/lib/service/zonePickState', '@/lib/service/zoneRegistry'];
  for (const m of imports) assert.ok(allowed.includes(m), m);
  assert.doesNotMatch(CODE, /\brequire\s*\(|import\s*\(/);
  // ชื่อที่หยิบจากสามโมดูลที่สเปกจำกัด
  assert.match(CODE, /import \{ latestSurveyRow \} from '@\/lib\/service\/zoneRegistry';/);
  assert.match(CODE, /import \{ busySurveyRequests \} from '@\/lib\/service\/zonePickState';/);
});

test('🔴 ไม่เอ่ยชื่อคอลัมน์ลิงก์ (F7) · “ยืนยันหน้างานแล้ว” อยู่ในสองฟังก์ชันเท่านั้น · ไม่มี “ไม่ได้เข้าพื้นที่”', () => {
  assert.doesNotMatch(SRC, /surveyConfirmOf[I]d/);
  assert.doesNotMatch(SRC, /ไม่ได้เข้าพื้นที่/);
  const fnBody = (name) => {
    const start = CODE.indexOf(`export function ${name}(`);
    assert.ok(start >= 0, name);
    const next = CODE.indexOf('\nexport ', start + 1);
    return CODE.slice(start, next < 0 ? undefined : next);
  };
  const inside = fnBody('surveyConfirmSentLines') + fnBody('surveyConfirmBannerParts');
  const count = (s) => s.split('ยืนยันหน้างานแล้ว').length - 1;
  assert.ok(count(inside) >= 2);
  assert.equal(count(CODE), count(inside), 'คำนี้ห้ามอยู่นอกสองฟังก์ชัน');
});

test('ชื่อที่ส่งออกครบตามสเปก S5 §2.1 — กลุ่ม A–F เขียนโค้ดชนชื่อพวกนี้', () => {
  const fns = [
    'surveyConfirmHref', 'surveyConfirmTitle', 'surveyConfirmForbiddenText', 'surveyConfirmAuditSuffix', 'surveyConfirmSubtitle',
    'surveyConfirmDealHint', 'surveyConfirmZonesLockText', 'surveyConfirmOpenLinkText', 'surveyConfirmBackLinkText',
    'surveyConfirmChildLine', 'surveyConfirmOfLine', 'surveyConfirmZoneStates', 'surveyConfirmAwaitingRows', 'surveyConfirmPlan',
    'surveyConfirmSubmitMismatch', 'surveyConfirmCreateBody', 'surveyConfirmLinkView', 'surveyConfirmBannerParts',
    'surveyConfirmOpenedText', 'surveyConfirmSentLines', 'surveyConfirmSentSummary', 'surveyConfirmEndedText',
    'surveyConfirmPreviousRoundText', 'surveyConfirmPreviousRoundKeep',
  ];
  for (const name of fns) assert.equal(typeof link[name], 'function', name);
  const strings = [
    'SURVEY_CONFIRM_ACTION_LABEL', 'SURVEY_CONFIRM_FORM_HINT', 'SURVEY_CONFIRM_OF_LABEL', 'SURVEY_CONFIRM_CHILD_LABEL',
    'SURVEY_CONFIRM_FROM_ORIGINAL', 'SURVEY_CONFIRM_ORIGINAL_MISSING', 'SURVEY_CONFIRM_NO_ORIGINAL', 'SURVEY_CONFIRM_KIND_ERROR',
    'SURVEY_CONFIRM_VARIANT_ERROR',
  ];
  for (const name of strings) assert.equal(typeof link[name], 'string', name);
  assert.ok(Array.isArray(link.SURVEY_CONFIRM_OPEN_STATUSES));
  assert.ok(link.SURVEY_CONFIRM_ID_PATTERN instanceof RegExp);
});
