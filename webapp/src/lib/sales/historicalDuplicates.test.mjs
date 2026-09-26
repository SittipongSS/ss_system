// ใบที่อาจซ้ำของใบสั่งขายย้อนหลัง + บันทึกการยืนยันของผู้คีย์ (มติเจ้าของ 26/09 — "บันทึกใบซ้ำที่ผู้คีย์ยืนยัน")
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HISTORICAL_DUPLICATE_NOTE_MAX, historicalDuplicateAckByline, historicalDuplicateAckIssue, historicalDuplicateAckOf,
  historicalDuplicateCardCopy, historicalDuplicateNoteClamp,
  historicalDuplicateApprovalRows, historicalDuplicateMatches, historicalDuplicateReviewOf, historicalDuplicateReviewRecord,
  historicalDuplicateReviewView, historicalDuplicatesAcknowledged, historicalMatchedOnText,
} from './historicalDuplicates.js';

const ROWS = [
  { id: 'SOR-A', orderNumber: 'SO-26090001-0', orderDate: '2026-01-01', status: 'pending_approval' },
  { id: 'SOR-B', orderNumber: 'SO-26090002-0', orderDate: '2025-01-01', status: 'approved', historicalInvoiceRef: 'IV-2601-0412' },
  { id: 'SOR-C', orderNumber: 'SO-26090003-0', orderDate: '2026-01-01', status: 'cancelled' },
  { id: 'SOR-SELF', orderNumber: 'SO-26090004-0', orderDate: '2026-01-01', status: 'draft' },
  { id: 'SOR-X', orderNumber: 'SO-26090005-0', orderDate: '2026-03-01', status: 'approved' },
];
const USER = { id: 'U-PIM', name: 'พิมพ์ชนก รัตนา', role: 'ae' };
const NOW = new Date('2026-09-26T07:32:00Z');
const statusLabel = (s) => ({ draft: 'ฉบับร่าง', pending_approval: 'รออนุมัติ', approved: 'อนุมัติแล้ว', cancelled: 'ยกเลิก' }[s] || s);

test('ตัวจับคู่ตัวเดียว (แผนตอนคีย์ = หน้าใบตอนเปิด): วันเริ่มสัญญา หรือเลขเอกสารเดิม · ไม่นับใบนี้เอง/ใบที่ยกเลิก', () => {
  const matches = historicalDuplicateMatches({ rows: ROWS, selfOrderId: 'SOR-SELF', startDate: '2026-01-01', refs: { invoice: ' iv-2601-0412 ' } });
  assert.deepEqual(matches.map((m) => [m.id, m.matchedOn]), [
    ['SOR-A', [{ kind: 'startDate', value: '2026-01-01' }]],
    ['SOR-B', [{ kind: 'ref', value: 'IV-2601-0412' }]],
  ]);
  assert.deepEqual(historicalDuplicateMatches({ rows: ROWS, startDate: null, refs: ['IV-2601-0412'] }).map((m) => m.id), ['SOR-B']);
  assert.deepEqual(historicalDuplicateMatches({ rows: ROWS }), []);
  assert.equal(historicalMatchedOnText([{ kind: 'startDate', value: 'x' }, { kind: 'ref', value: 'PO-1' }]), 'วันเริ่มสัญญา · เลขเอกสารเดิม PO-1');
  assert.equal(historicalMatchedOnText([]), '—');
});

test('⭐ ยืนยันเป็นรายใบ: ครบ = ทุกใบที่อาจซ้ำตอนนี้อยู่ในชุด · ใบใหม่ที่ไม่เคยเห็น = ไม่ครบ · ธงรุ่นก่อน = ครบ', () => {
  const dupes = [{ id: 'SOR-A' }, { id: 'SOR-B' }];
  const ack = historicalDuplicateAckOf({ acknowledgedDuplicateIds: [' SOR-A ', 'SOR-B', 'SOR-A', '', 42, 'x'.repeat(65)], duplicateNote: '  คนละอาคาร ' });
  assert.deepEqual(ack, { ids: ['SOR-A', 'SOR-B', '42'], flag: false, note: 'คนละอาคาร' });
  assert.equal(historicalDuplicatesAcknowledged(dupes, ack), true);
  assert.equal(historicalDuplicatesAcknowledged([...dupes, { id: 'SOR-NEW' }], ack), false);
  assert.equal(historicalDuplicatesAcknowledged(dupes, { ids: [], flag: true }), true);
  assert.equal(historicalDuplicatesAcknowledged([], {}), true, 'ไม่มีใบที่อาจซ้ำ = ไม่มีอะไรต้องยืนยัน');
  assert.deepEqual(historicalDuplicateAckOf(null), { ids: [], flag: false, note: '' });
});

test('เหตุผลไม่บังคับ ≤500 (นับแบบ Postgres) — ยาวเกิน = error ช่อง duplicateNote', () => {
  assert.equal(historicalDuplicateAckIssue({ note: '' }), null);
  assert.equal(historicalDuplicateAckIssue({ note: 'ก'.repeat(HISTORICAL_DUPLICATE_NOTE_MAX) }), null);
  assert.equal(historicalDuplicateAckIssue({ note: 'ก'.repeat(HISTORICAL_DUPLICATE_NOTE_MAX + 1) }).field, 'duplicateNote');
  /* อีโมจิ 1 ตัว = 1 ตัวอักษร (length() ของ Postgres) ไม่ใช่ 2 หน่วย UTF-16 */
  assert.equal(historicalDuplicateAckIssue({ note: '😀'.repeat(HISTORICAL_DUPLICATE_NOTE_MAX) }), null);
});

test('⭐ บันทึกที่เขียนลงใบ: ใบไหน (ภาพนิ่งตอนยืนยัน) · ใคร · เมื่อไร · เหตุผล · ไม่มีใบที่อาจซ้ำก็เขียน (orders: [])', () => {
  const dupes = historicalDuplicateMatches({ rows: ROWS, selfOrderId: 'SOR-SELF', startDate: '2026-01-01' });
  const record = historicalDuplicateReviewRecord({ duplicates: dupes, ack: { ids: ['SOR-A'], note: 'คนละอาคาร' }, user: USER, now: NOW });
  assert.deepEqual(record, {
    v: 1, checkedAt: '2026-09-26T07:32:00.000Z', byId: 'U-PIM', byName: 'พิมพ์ชนก รัตนา', byRole: 'ae', basis: 'ids',
    orders: [{ id: 'SOR-A', orderNumber: 'SO-26090001-0', orderDate: '2026-01-01', status: 'pending_approval', refs: [], matchedOn: [{ kind: 'startDate', value: '2026-01-01' }] }],
    note: 'คนละอาคาร',
  });
  assert.equal(historicalDuplicateReviewRecord({ duplicates: dupes, ack: { flag: true }, user: USER, now: NOW }).basis, 'flag');
  const none = historicalDuplicateReviewRecord({ duplicates: [], ack: { note: 'ไม่ควรเก็บ' }, user: USER, now: NOW });
  assert.deepEqual([none.basis, none.orders, 'note' in none], ['none', [], false], 'ไม่มีใบที่อาจซ้ำ = ไม่เก็บเหตุผล');
  assert.equal(historicalDuplicateReviewRecord({ user: { id: 'U', email: 'a@b.c' }, now: NOW }).byName, 'a@b.c');
});

test('อ่านบันทึกจากใบ — รูปไม่ถูก/ไม่มี = null (ใบก่อนมีระบบนี้)', () => {
  const review = { orders: [], byName: 'x' };
  assert.equal(historicalDuplicateReviewOf({ metadata: { historicalIntake: { duplicateReview: review } } }), review);
  assert.equal(historicalDuplicateReviewOf({ metadata: { historicalIntake: {} } }), null);
  assert.equal(historicalDuplicateReviewOf({ metadata: { historicalIntake: { duplicateReview: { orders: 'x' } } } }), null);
  assert.equal(historicalDuplicateReviewOf(null), null);
});

test('⭐ ภาพของผู้อนุมัติ: สถานะตอนยืนยันเทียบตอนนี้ · ลบไปแล้ว · ที่พบเพิ่มหลังยืนยัน', () => {
  const review = {
    byName: 'พิมพ์ชนก', checkedAt: NOW.toISOString(), basis: 'ids', note: 'คนละอาคาร',
    orders: [
      { id: 'SOR-A', orderNumber: 'SO-A', orderDate: '2026-01-01', status: 'pending_approval', matchedOn: [{ kind: 'startDate' }] },
      { id: 'SOR-GONE', orderNumber: 'SO-G', orderDate: '2026-01-01', status: 'draft', matchedOn: [{ kind: 'startDate' }] },
    ],
  };
  const check = {
    candidates: [{ id: 'SOR-A', status: 'approved' }, { id: 'SOR-NEW', orderNumber: 'SO-N', orderDate: '2026-01-01', status: 'draft', matchedOn: [{ kind: 'startDate' }] }],
    statusById: { 'SOR-A': 'approved', 'SOR-NEW': 'draft' },
  };
  const view = historicalDuplicateReviewView(review, check, { statusLabel });
  assert.deepEqual(view.rows.map((r) => [r.id, r.statusAtAck, r.statusNow, r.isNew, r.gone]), [
    ['SOR-A', 'รออนุมัติ', 'อนุมัติแล้ว', false, false],
    ['SOR-GONE', 'ฉบับร่าง', 'ลบแล้ว', false, true],
    ['SOR-NEW', null, 'ฉบับร่าง', true, false],
  ]);
  assert.deepEqual([view.show, view.count, view.newCount], [true, 3, 1]);
  /* ยังไม่รู้ผลตรวจใหม่ (ของเสริมโหลดไม่ขึ้น) = ไม่เดาสถานะตอนนี้ */
  assert.equal(historicalDuplicateReviewView(review, null, { statusLabel }).rows[0].statusNow, null);
  assert.equal(historicalDuplicateReviewView(null, { candidates: [], statusById: {} }).show, false);
  assert.equal(historicalDuplicateReviewView({ orders: [] }, { candidates: [], statusById: {} }).show, false);
  /* เวลาไทยจริง (07:32Z = 14:32 น.) — ไม่ใช่ ISO ดิบ/UTC */
  assert.equal(historicalDuplicateAckByline(review), 'พิมพ์ชนก · 26/09/2026 14:32');
  assert.match(historicalDuplicateAckByline({ byName: '', checkedAt: '' }), /^ผู้คีย์ · —$/);
});

test('⭐ แถวหน้าต่างอนุมัติ (เตือน ไม่บล็อก): ใคร/เมื่อไร/เหตุผล · สถานะเปลี่ยน · พบเพิ่ม · ไม่มีบันทึก · ไม่มีอะไร = ไม่มีแถว', () => {
  const review = {
    byName: 'พิมพ์ชนก', checkedAt: NOW.toISOString(), basis: 'ids', note: 'คนละอาคาร',
    orders: [{ id: 'SOR-A', orderNumber: 'SO-A', status: 'pending_approval', matchedOn: [{ kind: 'startDate' }] }],
  };
  const check = { candidates: [{ id: 'SOR-A' }, { id: 'SOR-N', orderNumber: 'SO-N', status: 'draft', matchedOn: [{ kind: 'ref', value: 'PO-1' }] }], statusById: { 'SOR-A': 'approved', 'SOR-N': 'draft' } };
  const rows = historicalDuplicateApprovalRows(review, check, { statusLabel });
  assert.equal(rows.length, 3);
  assert.equal(rows[0], '⚠️ ใบที่อาจซ้ำ 1 ใบ — ผู้คีย์ยืนยันว่าไม่ซ้ำ (พิมพ์ชนก · 26/09/2026 14:32) · เหตุผล: “คนละอาคาร”');
  assert.equal(rows[1], '⚠️ SO-A (ตอนยืนยัน: รออนุมัติ · ตอนนี้: อนุมัติแล้ว) — ตรงกันที่ วันเริ่มสัญญา');
  assert.equal(rows[2], '⚠️ พบใบที่อาจซ้ำเพิ่มหลังผู้คีย์ยืนยัน: SO-N (ฉบับร่าง) — ตรงกันที่ เลขเอกสารเดิม PO-1');
  /* สถานะไม่เปลี่ยน = พูดสถานะเดียว */
  assert.equal(historicalDuplicateApprovalRows(review, { candidates: [{ id: 'SOR-A' }], statusById: { 'SOR-A': 'pending_approval' } }, { statusLabel })[1],
    '⚠️ SO-A (รออนุมัติ) — ตรงกันที่ วันเริ่มสัญญา');
  /* ตอนบันทึกไม่มีใบที่อาจซ้ำ (orders: []) แล้วพบทีหลัง — ไม่อ้างว่าผู้คีย์ "ยืนยัน" อะไร */
  assert.match(historicalDuplicateApprovalRows({ ...review, orders: [] }, check, { statusLabel })[0],
    /^⚠️ พบใบที่อาจซ้ำหลังผู้คีย์บันทึก \(ตอนบันทึก พิมพ์ชนก · 26\/09\/2026 14:32 ไม่มีใบที่อาจซ้ำ\): /);
  /* ใบก่อนมีระบบนี้ + พบใบที่อาจซ้ำ */
  assert.match(historicalDuplicateApprovalRows(null, check, { statusLabel })[0], /^⚠️ ใบที่อาจซ้ำ — ไม่มีบันทึกการยืนยันของผู้คีย์/);
  /* ธงรุ่นก่อน */
  assert.match(historicalDuplicateApprovalRows({ ...review, basis: 'flag' }, null, { statusLabel })[0], /ยืนยันจากฟอร์มรุ่นก่อน/);
  /* ไม่มีอะไรจะพูด = ไม่มีแถว (ตารางตรวจทั้งใบของหน้าต่างอนุมัติไม่ขยับ) */
  assert.deepEqual(historicalDuplicateApprovalRows({ orders: [] }, { candidates: [], statusById: {} }, { statusLabel }), []);
  assert.deepEqual(historicalDuplicateApprovalRows(null, { candidates: [], statusById: {} }, { statusLabel }), []);
  /* ของเสริมโหลดไม่ขึ้น: บันทึกยังพูดได้ (มากับแถวใบ) · ไม่มีบันทึก = บอกว่าโหลดไม่ขึ้น */
  assert.equal(historicalDuplicateApprovalRows(review, check, { statusLabel, loadError: true }).length, 2);
  assert.match(historicalDuplicateApprovalRows(null, null, { statusLabel, loadError: true })[0], /^ใบที่อาจซ้ำ: โหลดไม่ขึ้น/);
  /* เกิน 3 ใบ = สรุปที่เหลือ ชี้การ์ดหน้าใบ */
  const many = { ...review, orders: Array.from({ length: 5 }, (_, i) => ({ id: `S${i}`, orderNumber: `SO-${i}`, status: 'draft', matchedOn: [] })) };
  const manyRows = historicalDuplicateApprovalRows(many, null, { statusLabel });
  assert.equal(manyRows.length, 5);
  assert.match(manyRows[4], /และอีก 2 ใบ — ดูการ์ด “ใบที่อาจซ้ำ” ในหน้าใบ/);
});

test('ไฟล์บริสุทธิ์ — ไม่อ่านนาฬิกา · ไม่ยิงฐาน · ไม่มี React', () => {
  const src = readFileSync(new URL('./historicalDuplicates.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /new Date\(|Date\.now|supabase|\.from\(|from ['"]react/);
});

/* 🐞 รีวิว 26/09: การ์ดขึ้นทุกสถานะ (ตรวจใหม่ทุกครั้งที่เปิดใบ) — "ก่อนอนุมัติ" เฉพาะใบที่รออนุมัติ · ไม่อ้างการยืนยันที่ไม่มี */
test('ถ้อยคำการ์ดหน้าใบ: สามสถานะของบันทึก × สถานะใบ', () => {
  const fresh = { candidates: [{ id: 'SOR-N', orderNumber: 'SO-N', status: 'draft', matchedOn: [] }], statusById: { 'SOR-N': 'draft' } };
  const confirmedReview = { byName: 'พิมพ์ชนก', checkedAt: NOW.toISOString(), orders: [{ id: 'SOR-A', status: 'draft', matchedOn: [] }] };
  const views = {
    none: historicalDuplicateReviewView(null, fresh, { statusLabel }),
    empty: historicalDuplicateReviewView({ ...confirmedReview, orders: [] }, fresh, { statusLabel }),
    confirmed: historicalDuplicateReviewView(confirmedReview, fresh, { statusLabel }),
  };
  assert.deepEqual(Object.values(views).map((v) => v.record), ['none', 'empty', 'confirmed']);
  const pendingCopy = Object.fromEntries(Object.entries(views).map(([k, v]) => [k, historicalDuplicateCardCopy(v, { status: 'pending_approval' })]));
  assert.match(pendingCopy.none.meta, /^ใบนี้บันทึกก่อนระบบเก็บการยืนยันของผู้คีย์/);
  assert.equal(pendingCopy.none.newTag, 'พบตอนเปิดใบ');
  assert.match(pendingCopy.none.notice.title, /ไม่มีบันทึกการยืนยันของผู้คีย์$/);
  assert.equal(pendingCopy.empty.meta, 'ตอนบันทึก (พิมพ์ชนก · 26/09/2026 14:32) ไม่พบใบที่อาจซ้ำ — ระบบพบเพิ่มตอนเปิดใบ');
  assert.equal(pendingCopy.empty.newTag, 'พบหลังผู้คีย์บันทึก');
  assert.equal(pendingCopy.confirmed.newTag, 'พบหลังผู้คีย์ยืนยัน');
  assert.match(pendingCopy.confirmed.notice.title, /หลังผู้คีย์ยืนยัน$/);
  for (const copy of Object.values(pendingCopy)) {
    assert.equal(copy.notice.tone, 'warning');
    assert.match(copy.notice.body, /เปิดดูก่อนอนุมัติ \(ไม่บล็อกการอนุมัติ\)$/);
  }
  for (const status of ['approved', 'cancelled', 'draft', 'rejected']) {
    const copy = historicalDuplicateCardCopy(views.confirmed, { status });
    assert.equal(copy.notice.tone, 'info', status);
    assert.doesNotMatch(copy.notice.body, /อนุมัติ/, `${status}: ไม่สั่งให้ตรวจก่อนอนุมัติ`);
  }
  /* ไม่มีใบที่พบเพิ่ม = ไม่มีกล่องแจ้ง */
  assert.equal(historicalDuplicateCardCopy(historicalDuplicateReviewView(confirmedReview, { candidates: [], statusById: {} }, { statusLabel }),
    { status: 'pending_approval' }).notice, null);
});

test('ตัดเหตุผลตามหน่วยเดียวกับ server (code point) — ไม่ใช่ UTF-16 ของเบราว์เซอร์', () => {
  assert.equal([...historicalDuplicateNoteClamp('😀'.repeat(600))].length, HISTORICAL_DUPLICATE_NOTE_MAX);
  assert.equal(historicalDuplicateNoteClamp('ก'.repeat(501)).length, HISTORICAL_DUPLICATE_NOTE_MAX);
  assert.equal(historicalDuplicateNoteClamp(null), '');
  assert.equal(historicalDuplicateAckIssue({ note: historicalDuplicateNoteClamp('😀'.repeat(600)) }), null);
});

