// ── ใบยืนยันหน้างาน (งวด S5 §2.2) — ตัวอ่าน/เขียนฐาน บน supabase ปลอม (ไม่แตะฐานจริง — dev DB = prod DB) ──────────
// ⭐ ทุกจุดอ่านพังทีละจุด (รวมตัวช่วยซอยก้อนที่ throw) ⇒ `{ error }` / `unknown: true` ไม่ throw และไม่ตอบ "ไม่มี" แทน "อ่านไม่ได้"
import { fakeDb } from './crew/routeTestKit.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SURVEY_CONFIRM_LINES_PER_ROW, appendSurveyConfirmLines, loadSurveyConfirmContext, loadSurveyConfirmDeal, loadSurveyConfirmLink,
  loadSurveyConfirmOriginal, loadSurveyConfirmSheetInfo, loadSurveyReportConfirms,
} from './surveyConfirmRepo.js';

const ORIG_DOC = 'RQ-AS-26100001';
const owner = { id: 'U-SALES', name: 'ฝ่ายขาย', role: 'ae', department: 'SA' };
const stranger = { id: 'U-OTHER', name: 'คนอื่น', role: 'ae', department: 'SA' };
const original = (over = {}) => ({
  id: 'DR-O', kind: 'site_survey', dept: 'TS', docNo: ORIG_DOC, title: 'ร้านกาแฟ', status: 'answered', requestedById: 'U-SALES',
  createdAt: '2026-10-01T03:00:00.000Z', answeredAt: '2026-10-05T03:00:00.000Z', surveyConfirm: 'needed', surveyConfirmOfId: null,
  committedDueDate: '2026-10-05', closedAt: null, ...over,
});
const part = (w, l) => ({ widthM: w, lengthM: l, heightM: 3 });
const zoneRow = (id, requestId, zoneId, over = {}) => ({
  id, requestId, zoneId, zoneName: zoneId === 'Z-A' ? 'ห้องนอน' : 'ห้องนั่งเล่น', sortOrder: 0, status: 'done', method: 'onsite',
  parts: [], packageSize: null, packageQty: null, surveyedAt: null, ...over,
});
const baseZones = () => [
  zoneRow('SV-OA', 'DR-O', 'Z-A', { sortOrder: 0, method: 'drawing', parts: [part(6, 8)], packageSize: 'SM', packageQty: 1, surveyedAt: '2026-10-04T03:00:00.000Z' }),
  zoneRow('SV-OB', 'DR-O', 'Z-B', { sortOrder: 1, method: 'drawing', parts: [part(5, 4)], packageSize: 'ST', packageQty: 2, surveyedAt: '2026-10-04T03:00:00.000Z' }),
];
const seed = (over = {}) => ({
  dept_requests: [original()],
  service_survey_zones: baseZones(),
  entity_updates: [],
  service_survey_reports: [],
  ...over,
});
const failOn = (pred, message = 'boom') => (q) => (pred(q) ? { data: null, error: { message } } : undefined);
const isChildrenRead = (q) => q.table === 'dept_requests' && q.filters.some(([op, col]) => op === 'eq' && col === 'surveyConfirmOfId');
const isZonesIn = (q) => q.table === 'service_survey_zones' && q.filters.some(([op, col]) => op === 'in' && col === 'zoneId');
const isOwnZones = (q) => q.table === 'service_survey_zones' && q.filters.some(([op, col]) => op === 'eq' && col === 'requestId');
const isParents = (q) => q.table === 'dept_requests' && q.filters.some(([op, col]) => op === 'in' && col === 'id');
const isById = (q) => q.table === 'dept_requests' && q.single === 'maybe';

/* ═══ loadSurveyConfirmContext ═══════════════════════════════════════════════════════════════ */

test('loadSurveyConfirmContext: แถวของใบ · แถวทุกใบของพื้นที่จากแบบ · ใบแม่ · ลูก', async () => {
  const child = { id: 'DR-C1', status: 'pending', docNo: 'RQ-AS-26100005', surveyConfirmOfId: 'DR-O', createdAt: '2026-10-06T03:00:00.000Z' };
  const db = fakeDb(seed({
    dept_requests: [original(), child, { id: 'DR-NOISE', status: 'pending', surveyConfirmOfId: 'DR-ZZ' }],
    service_survey_zones: [...baseZones(), zoneRow('SV-C1A', 'DR-C1', 'Z-A'), zoneRow('SV-ELSE', 'DR-ELSE', 'Z-Q')],
  }));
  const ctx = await loadSurveyConfirmContext(db, original());
  assert.equal(ctx.error, null);
  assert.deepEqual(ctx.rows.map((r) => r.id), ['SV-OA', 'SV-OB']);
  assert.deepEqual([...ctx.rowsByZone.keys()].sort(), ['Z-A', 'Z-B']);
  assert.deepEqual(ctx.rowsByZone.get('Z-A').map((r) => r.id).sort(), ['SV-C1A', 'SV-OA']);
  assert.deepEqual([...ctx.requestsById.keys()].sort(), ['DR-C1', 'DR-O']);
  assert.deepEqual(ctx.children.map((c) => c.id), ['DR-C1']);
});

test('loadSurveyConfirmContext: แต่ละจุดอ่านพัง (รวมตัวซอยก้อนที่ throw) ⇒ error · ไม่ throw · ไม่คืนลิสต์ว่างแบบ "ไม่มี"', async () => {
  for (const [name, pred] of [['own zones', isOwnZones], ['zones in (fetchAllInChunks throws)', isZonesIn], ['parents (throws)', isParents], ['children', isChildrenRead]]) {
    const db = fakeDb(seed(), { hook: failOn(pred) });
    const ctx = await loadSurveyConfirmContext(db, original());
    assert.equal(ctx.error, 'boom', name);
  }
  // supabase ที่ throw เองก็ไม่หลุด
  const exploding = { from() { throw new Error('client gone'); } };
  assert.equal((await loadSurveyConfirmContext(exploding, original())).error, 'client gone');
});

test('loadSurveyConfirmContext: ไม่มีพื้นที่จากแบบ ⇒ ไม่ยิงคำสั่ง .in() ของแถวพื้นที่', async () => {
  const db = fakeDb(seed({ service_survey_zones: [zoneRow('SV-1', 'DR-O', 'Z-A')] }));
  const ctx = await loadSurveyConfirmContext(db, original());
  assert.equal(ctx.error, null);
  assert.equal(db.calls.filter(isZonesIn).length, 0);
});

/* ═══ loadSurveyConfirmOriginal ═══════════════════════════════════════════════════════════════ */

test('loadSurveyConfirmOriginal: เจอ / ไม่เจอ (null) / พัง (error) / ไม่ส่ง id (ไม่ยิงคำสั่ง)', async () => {
  const db = fakeDb(seed());
  assert.equal((await loadSurveyConfirmOriginal(db, 'DR-O')).original.docNo, ORIG_DOC);
  assert.deepEqual(await loadSurveyConfirmOriginal(db, 'DR-NONE'), { original: null, error: null });
  const before = db.calls.length;
  assert.deepEqual(await loadSurveyConfirmOriginal(db, ''), { original: null, error: null });
  assert.equal(db.calls.length, before);
  const broken = fakeDb(seed(), { hook: failOn(isById) });
  assert.deepEqual(await loadSurveyConfirmOriginal(broken, 'DR-O'), { original: null, error: 'boom' });
});

test('loadSurveyConfirmDeal (Integrate · route confirm-plan): เจอ / ไม่เจอ (null) / พัง (error) / ไม่ส่ง id (ไม่ยิงคำสั่ง)', async () => {
  const deal = { id: 'DL-1', code: 'DL-26100001', title: 'ร้านกาแฟ', customerId: 'CUS-1', customerName: 'ลูกค้า', team: 'T1' };
  const db = fakeDb(seed({ sales_deals: [deal] }));
  const got = await loadSurveyConfirmDeal(db, 'DL-1');
  assert.equal(got.error, null);
  assert.equal(got.deal.customerId, 'CUS-1');
  assert.deepEqual(await loadSurveyConfirmDeal(db, 'DL-NONE'), { deal: null, error: null });
  const before = db.calls.length;
  assert.deepEqual(await loadSurveyConfirmDeal(db, null), { deal: null, error: null });
  assert.equal(db.calls.length, before);
  const broken = fakeDb(seed({ sales_deals: [deal] }), { hook: failOn((q) => q.table === 'sales_deals') });
  assert.deepEqual(await loadSurveyConfirmDeal(broken, 'DL-1'), { deal: null, error: 'boom' });
});

/* ═══ loadSurveyConfirmLink ═══════════════════════════════════════════════════════════════════ */

test('loadSurveyConfirmLink: ไม่ใช่คำร้องประเมินพื้นที่ ⇒ null ไม่ยิงคำสั่งเลย · ใบธรรมดาไม่มีลูก ⇒ null หนึ่งคำสั่ง', async () => {
  const db = fakeDb(seed());
  assert.equal(await loadSurveyConfirmLink(db, { id: 'DR-Q', kind: 'inquiry' }, owner), null);
  assert.equal(db.calls.length, 0);
  assert.equal(await loadSurveyConfirmLink(db, original({ answeredAt: null, surveyConfirm: null }), owner), null);
  assert.equal(db.calls.length, 1, 'คำสั่งอ่านลูกคำสั่งเดียว');
  assert.equal(await loadSurveyConfirmLink(db, original({ surveyConfirm: 'not_needed' }), owner), null);
});

test('loadSurveyConfirmLink: ใบต้นทาง needed ⇒ ก้อนครบ · ปุ่มพร้อมสำหรับเจ้าของ · ไม่มีปุ่มสำหรับคนอื่น', async () => {
  const db = fakeDb(seed());
  const mine = await loadSurveyConfirmLink(db, original(), owner);
  assert.equal(mine.unknown, false);
  assert.equal(mine.awaiting, 2);
  assert.deepEqual(mine.action, { state: 'ready', reason: null, href: '/requests/new?confirms=DR-O' });
  assert.equal(db.calls.filter(isChildrenRead).length, 1, 'ลูกอ่านครั้งเดียว — ตัวโหลดส่งต่อให้ context');
  const theirs = await loadSurveyConfirmLink(fakeDb(seed()), original(), stranger);
  assert.equal(theirs.action, null);
});

test('loadSurveyConfirmLink: อ่านพังทุกจุด ⇒ { unknown: true } อย่างเดียว · ไม่ throw', async () => {
  for (const [name, pred] of [['children', isChildrenRead], ['own zones', isOwnZones], ['zones in', isZonesIn], ['parents', isParents]]) {
    const db = fakeDb(seed(), { hook: failOn(pred) });
    assert.deepEqual(await loadSurveyConfirmLink(db, original(), owner), { unknown: true }, name);
  }
  const conf = original({ id: 'DR-C1', docNo: 'RQ-AS-26100005', surveyConfirmOfId: 'DR-O', answeredAt: null, surveyConfirm: null });
  const broken = fakeDb(seed(), { hook: failOn(isById) });
  // ใบยืนยัน: รู้อยู่แล้วว่าผูกกับใบไหน (คอลัมน์อยู่บนแถวของใบเอง) ⇒ `confirmOf` ไม่หายไปกับการอ่านที่พัง — ฟอร์มยังล็อก
  assert.deepEqual(await loadSurveyConfirmLink(broken, conf, owner),
    { unknown: true, confirmOf: { id: 'DR-O', docNo: null, href: '/requests/DR-O', missing: false } }, 'อ่านใบต้นทางพัง');
  assert.deepEqual(await loadSurveyConfirmLink({ from() { throw new Error('x'); } }, original(), owner), { unknown: true });
});

test('🔴 loadSurveyConfirmLink: ใบยืนยันที่อ่านลูก/สภาพพัง ⇒ `unknown` แต่ยังพก confirmOf (ฟอร์มแก้ไขไม่หลุดล็อก · บรรทัดลิงก์ไม่หาย)', async () => {
  const conf = original({ id: 'DR-C1', docNo: 'RQ-AS-26100005', status: 'pending', surveyConfirmOfId: 'DR-O', answeredAt: null, surveyConfirm: null });
  const of = { id: 'DR-O', docNo: ORIG_DOC, href: '/requests/DR-O', missing: false };
  const kids = fakeDb(seed({ dept_requests: [original(), conf] }), { hook: failOn(isChildrenRead) });
  assert.deepEqual(await loadSurveyConfirmLink(kids, conf, owner), { unknown: true, confirmOf: of }, 'อ่านลูกพัง');
  // ใบยืนยันที่ถูกส่งผลแบบ needed อีกรอบ (เป็นใบต้นทางด้วย) — อ่านสภาพพังก็ยังพก confirmOf
  const both = original({ id: 'DR-C1', docNo: 'RQ-AS-26100005', surveyConfirmOfId: 'DR-O' });
  const ctx = fakeDb(seed({ dept_requests: [original(), both] }), { hook: failOn(isOwnZones) });
  assert.deepEqual(await loadSurveyConfirmLink(ctx, both, owner), { unknown: true, confirmOf: of }, 'อ่านสภาพพัง');
  // ใบต้นทางถูกลบ + อ่านลูกพัง = ยังบอกว่าใบต้นทางหาย
  const gone = fakeDb(seed({ dept_requests: [conf] }), { hook: failOn(isChildrenRead) });
  assert.deepEqual(await loadSurveyConfirmLink(gone, conf, owner),
    { unknown: true, confirmOf: { id: 'DR-O', docNo: null, href: null, missing: true } });
  // ใบที่ไม่ผูก = รูปเดิม `{ unknown: true }` ล้วน (ข้อข้างบน)
});

test('loadSurveyConfirmLink: บนใบยืนยัน ⇒ confirmOf (มี / ใบต้นทางถูกลบ) · ไม่มีปุ่ม', async () => {
  const conf = original({ id: 'DR-C1', docNo: 'RQ-AS-26100005', status: 'pending', surveyConfirmOfId: 'DR-O', answeredAt: null, surveyConfirm: null });
  const db = fakeDb(seed({ dept_requests: [original(), conf] }));
  const v = await loadSurveyConfirmLink(db, conf, owner);
  assert.deepEqual(v.confirmOf, { id: 'DR-O', docNo: ORIG_DOC, href: '/requests/DR-O', missing: false });
  assert.equal(v.action, null);
  const gone = await loadSurveyConfirmLink(fakeDb(seed({ dept_requests: [conf] })), conf, owner);
  assert.deepEqual(gone.confirmOf, { id: 'DR-O', docNo: null, href: null, missing: true });
});

/* ═══ appendSurveyConfirmLines ════════════════════════════════════════════════════════════════ */

const CHILD = { id: 'DR-C1', docNo: 'RQ-AS-26100005' };
const lines31 = Array.from({ length: 31 }, (_, i) => `บรรทัดที่ ${i + 1}`);
/* ตัวเขียนจำลอง — เขียนลง fakeDb ตรง ๆ (ไม่ผ่าน appendUpdate ตัวจริง) · `failAt` = ก้อนที่ตอบพัง (ครั้งเดียว) */
function writer(db, { failAt = null } = {}) {
  const sent = [];
  let failed = false;
  const append = async (supabase, row) => {
    sent.push(row);
    if (failAt !== null && !failed && sent.filter((r) => r.meta.key).length - 1 === failAt) {
      failed = true;
      return { row: null, error: 'write failed' };
    }
    await supabase.from('entity_updates').insert({ id: `EUP-${db.tables.entity_updates?.length || 0}`, entityType: row.entityType, entityId: row.entityId, kind: row.kind, body: row.body, meta: row.meta });
    return { row: {}, error: null };
  };
  return { append, sent };
}
const rowsOf = (db) => (db.tables.entity_updates || []).filter((r) => r.entityId === 'DR-O');

test('appendSurveyConfirmLines: 31 บรรทัด ⇒ 3 แถว · แถว 0 survey_confirm (กระดิ่ง) · แถว 1–2 survey_confirm_more (เงียบ)', async () => {
  const db = fakeDb(seed());
  const w = writer(db);
  const res = await appendSurveyConfirmLines(db, {
    originalId: 'DR-O', key: 'sent:DR-C1:2026-10-09T03:00:00.000Z', event: 'sent', child: CHILD, lines: lines31,
    outcomes: [{ zoneId: 'Z-A', outcome: 'confirmed_same' }], user: owner,
  }, { append: w.append });
  assert.deepEqual(res, { written: 3, skipped: 0, error: null });
  const rows = rowsOf(db);
  assert.deepEqual(rows.map((r) => r.kind), ['survey_confirm', 'survey_confirm_more', 'survey_confirm_more']);
  assert.deepEqual(rows.map((r) => r.body.split('\n').length), [SURVEY_CONFIRM_LINES_PER_ROW, 15, 1]);
  assert.deepEqual(rows.map((r) => r.meta.key), [0, 1, 2].map((i) => `sent:DR-C1:2026-10-09T03:00:00.000Z:${i}`));
  assert.deepEqual(rows[0].meta, {
    key: 'sent:DR-C1:2026-10-09T03:00:00.000Z:0', childId: 'DR-C1', childDocNo: 'RQ-AS-26100005', event: 'sent',
    outcomes: [{ zoneId: 'Z-A', outcome: 'confirmed_same' }],
  });
  assert.equal('outcomes' in rows[1].meta, false);
  assert.ok(rows.every((r) => r.body.length < 4000));
  // เรียกซ้ำด้วยกุญแจเดิม = ไม่เขียนอะไร
  const again = await appendSurveyConfirmLines(db, { originalId: 'DR-O', key: 'sent:DR-C1:2026-10-09T03:00:00.000Z', event: 'sent', child: CHILD, lines: lines31 }, { append: w.append });
  assert.deepEqual(again, { written: 0, skipped: 3, error: null });
  assert.equal(rowsOf(db).length, 3);
});

test('appendSurveyConfirmLines: พังที่ก้อน 1 / 2 / 3 แล้วลองใหม่ด้วยกุญแจเดิม ⇒ เขียนเฉพาะก้อนที่ขาด · ครบสามแถวไม่ซ้ำ', async () => {
  for (const failAt of [0, 1, 2]) {
    const db = fakeDb(seed());
    const args = { originalId: 'DR-O', key: 'sent:DR-C1:T', event: 'sent', child: CHILD, lines: lines31 };
    const first = await appendSurveyConfirmLines(db, args, { append: writer(db, { failAt }).append });
    assert.equal(first.error, 'write failed', `ก้อน ${failAt + 1}`);
    assert.equal(first.written, failAt);
    const retry = await appendSurveyConfirmLines(db, args, { append: writer(db).append });
    assert.deepEqual(retry, { written: 3 - failAt, skipped: failAt, error: null }, `ก้อน ${failAt + 1}`);
    const rows = rowsOf(db);
    assert.deepEqual(rows.map((r) => r.meta.key).sort(), ['sent:DR-C1:T:0', 'sent:DR-C1:T:1', 'sent:DR-C1:T:2']);
    assert.equal(rows.filter((r) => r.kind === 'survey_confirm').length, 1, 'กระดิ่งเดียว');
  }
});

test('appendSurveyConfirmLines: อ่านแถวเดิมพัง ⇒ ไม่เขียน คืน error (กันบรรทัดซ้ำ) · onlyIfKeyPrefix ไม่ตรง ⇒ ไม่เขียน', async () => {
  const db = fakeDb(seed(), { hook: failOn((q) => q.table === 'entity_updates' && !q.write) });
  const w = writer(db);
  const res = await appendSurveyConfirmLines(db, { originalId: 'DR-O', key: 'opened:DR-C1', event: 'opened', child: CHILD, lines: ['เปิดใบ'] }, { append: w.append });
  assert.deepEqual(res, { written: 0, skipped: 0, error: 'boom' });
  assert.equal(w.sent.length, 0);

  const db2 = fakeDb(seed({ entity_updates: [{ id: 'E1', entityType: 'dept_request', entityId: 'DR-O', kind: 'survey_confirm', meta: { key: 'opened:DR-C1' } }] }));
  const w2 = writer(db2);
  const none = await appendSurveyConfirmLines(db2, {
    originalId: 'DR-O', key: 'ended:DR-C1:reopened:T', event: 'reopened', child: CHILD, lines: ['เปิดกลับ'], onlyIfKeyPrefix: 'sent:DR-C1:',
  }, { append: w2.append });
  assert.deepEqual(none, { written: 0, skipped: 1, error: null });
  assert.equal(w2.sent.length, 0);
  // มีบรรทัดส่งผลของใบนี้แล้ว ⇒ เขียน · เหตุการณ์อื่นใช้กุญแจตรงตัว
  db2.tables.entity_updates.push({ id: 'E2', entityType: 'dept_request', entityId: 'DR-O', kind: 'survey_confirm', meta: { key: 'sent:DR-C1:T:0' } });
  const yes = await appendSurveyConfirmLines(db2, {
    originalId: 'DR-O', key: 'ended:DR-C1:reopened:T', event: 'reopened', child: CHILD, lines: ['เปิดกลับ'], onlyIfKeyPrefix: 'sent:DR-C1:',
  }, { append: w2.append });
  assert.deepEqual(yes, { written: 1, skipped: 0, error: null });
  assert.equal(w2.sent[0].meta.key, 'ended:DR-C1:reopened:T');
  assert.equal(w2.sent[0].kind, 'survey_confirm');
});

test('appendSurveyConfirmLines: ไม่มีบรรทัด / ไม่มีกุญแจ ⇒ ไม่ยิงคำสั่ง · ตัวเขียนที่ throw ไม่หลุด', async () => {
  const db = fakeDb(seed());
  assert.deepEqual(await appendSurveyConfirmLines(db, { originalId: 'DR-O', key: 'opened:DR-C1', lines: ['', null] }), { written: 0, skipped: 0, error: null });
  assert.deepEqual(await appendSurveyConfirmLines(db, { originalId: 'DR-O', lines: ['x'] }), { written: 0, skipped: 0, error: null });
  assert.equal(db.calls.length, 0);
  const res = await appendSurveyConfirmLines(db, { originalId: 'DR-O', key: 'opened:DR-C1', event: 'opened', child: CHILD, lines: ['x'] },
    { append: async () => { throw new Error('thrown'); } });
  assert.deepEqual(res, { written: 0, skipped: 0, error: 'thrown' });
});

test('appendSurveyConfirmLines: ตัวเขียนตั้งต้น = appendUpdate จริง บน supabase ปลอม — เขียนแถวชนิดที่ลงทะเบียนแล้ว', async () => {
  const db = fakeDb(seed());
  const res = await appendSurveyConfirmLines(db, { originalId: 'DR-O', key: 'opened:DR-C1', event: 'opened', child: CHILD, lines: ['ฝ่ายขายขอยืนยันหน้างาน — เปิดใบ RQ-AS-26100005'], user: owner });
  assert.deepEqual(res, { written: 1, skipped: 0, error: null });
  const rows = rowsOf(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'survey_confirm');
  assert.equal(rows[0].meta.key, 'opened:DR-C1');
});

/* ═══ loadSurveyReportConfirms (กระดาษ) ═══════════════════════════════════════════════════════ */

const report = (over = {}) => ({ id: 'SR-1', requestId: 'DR-O', docNo: 'SU-26100001', rev: 0, status: 'current', approvedAt: '2026-10-05T03:00:00.000Z', ...over });
const conf = { id: 'DR-C1', surveyConfirmOfId: 'DR-O' };

test('loadSurveyReportConfirms: ฉบับปัจจุบัน ⇒ เลข SU · มีแต่ฉบับที่ถูกแทน / ค้างรุ่น ⇒ null · ไม่ผูก / ใบต้นทางหาย ⇒ null', async () => {
  assert.deepEqual(await loadSurveyReportConfirms(fakeDb(seed({ service_survey_reports: [report()] })), conf),
    { requestDocNo: ORIG_DOC, reportDocNo: 'SU-26100001' });
  assert.deepEqual(await loadSurveyReportConfirms(fakeDb(seed({ service_survey_reports: [report({ status: 'superseded' })] })), conf),
    { requestDocNo: ORIG_DOC, reportDocNo: null });
  assert.deepEqual(await loadSurveyReportConfirms(fakeDb(seed({ service_survey_reports: [report({ approvedAt: '2026-10-02T03:00:00.000Z' })] })), conf),
    { requestDocNo: ORIG_DOC, reportDocNo: null }, 'ค้างรุ่น');
  const db = fakeDb(seed());
  assert.equal(await loadSurveyReportConfirms(db, { id: 'DR-X', surveyConfirmOfId: null }), null);
  assert.equal(db.calls.length, 0, 'ไม่ผูก = ไม่ยิงคำสั่ง');
  assert.equal(await loadSurveyReportConfirms(fakeDb(seed({ dept_requests: [] })), conf), null);
});

test('loadSurveyReportConfirms: อ่านใบต้นทาง / อ่านเอกสารพัง ⇒ { error } (ห้ามตีความว่าไม่ผูก)', async () => {
  const a = await loadSurveyReportConfirms(fakeDb(seed(), { hook: failOn(isById) }), conf);
  assert.ok(a?.error);
  assert.equal('requestDocNo' in a, false);
  const b = await loadSurveyReportConfirms(fakeDb(seed(), { hook: failOn((q) => q.table === 'service_survey_reports') }), conf);
  assert.ok(b?.error);
  assert.equal('requestDocNo' in b, false);
});

/* ═══ loadSurveyConfirmSheetInfo (ใบประเมินของใบยืนยัน) ════════════════════════════════════════ */

test('loadSurveyConfirmSheetInfo: ข้อความรอบจากแบบรายพื้นที่ · ใบต้นทางหาย ⇒ missing · ไม่ผูก ⇒ null · พัง ⇒ { error }', async () => {
  const rows = [...baseZones(), zoneRow('SV-OC', 'DR-O', 'Z-C', { method: 'drawing', status: 'cut', parts: [part(1, 1)] }), zoneRow('SV-OD', 'DR-O', 'Z-D', { method: 'onsite', parts: [part(1, 1)] })];
  const info = await loadSurveyConfirmSheetInfo(fakeDb(seed({ service_survey_zones: rows })), conf);
  assert.deepEqual(info, {
    id: 'DR-O', docNo: ORIG_DOC, missing: false,
    previousByZone: { 'Z-A': `รอบจากแบบ (${ORIG_DOC}): 48 ตร.ม. · SM 1`, 'Z-B': `รอบจากแบบ (${ORIG_DOC}): 20 ตร.ม. · ST 2` },
  });
  assert.deepEqual(await loadSurveyConfirmSheetInfo(fakeDb(seed({ dept_requests: [] })), conf),
    { id: 'DR-O', docNo: null, missing: true, previousByZone: {} });
  assert.equal(await loadSurveyConfirmSheetInfo(fakeDb(seed()), { id: 'DR-X' }), null);
  assert.ok((await loadSurveyConfirmSheetInfo(fakeDb(seed(), { hook: failOn(isById) }), conf)).error);
  assert.ok((await loadSurveyConfirmSheetInfo(fakeDb(seed(), { hook: failOn(isOwnZones) }), conf)).error);
});

/* ═══ ยามซอร์ส (R9) ═══════════════════════════════════════════════════════════════════════════ */

test('🔴 เพดานแถว + โมดูลกระดาษที่ดึงได้ (R9)', () => {
  const src = readFileSync(new URL('./surveyConfirmRepo.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  assert.match(code, /\.eq\('surveyConfirmOfId', originalId\)\s*\.order\('createdAt', \{ ascending: false \}\)\s*\.limit\(CHILDREN_LIMIT\)/);
  assert.match(code, /const CHILDREN_LIMIT = 50;/);
  assert.match(code, /\.limit\(EXISTING_LINES_LIMIT\)/);
  assert.match(code, /const EXISTING_LINES_LIMIT = 200;/);
  assert.match(code, /\.select\('\*'\)\.eq\('id', id\)\.maybeSingle\(\)/);
  const paper = [...code.matchAll(/from '@\/lib\/service\/(surveyReport\w*)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(paper, ['surveyReportRows', 'surveyReportState']);
  // ไม่มี .in() ที่ไม่ผ่านตัวซอยก้อน — ทุก .in( ของตาราง ยกเว้นลิสต์ชนิดเธรดที่มีสองค่าคงที่
  const ins = [...code.matchAll(/\.in\('(\w+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(ins, ['id', 'kind', 'zoneId']);
  assert.match(code, /fetchAllInChunks\(zoneIds, \(chunk\) => supabase/);
  assert.match(code, /fetchAllInChunks\(parentIds, \(chunk\) => supabase\.from\('dept_requests'\)/);
  // แถวพื้นที่อ่าน select('*') เท่านั้น — ลิสต์คอลัมน์ที่มี method ชนยามลิสต์ปิดของ mig 0408
  assert.doesNotMatch(code, /['"`][^'"`\n]*,\s*method\s*(?:,[^'"`\n]*)?['"`]/);
});
