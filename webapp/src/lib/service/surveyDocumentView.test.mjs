// ── เอกสารประเมินพื้นที่บนจอ — ตัวตัดสินล้วนของ PR-3 (สเปก PR-3 §3 · §4.1 · §5.1 · §8) ─────────────────
//
// ⭐ ครอบ **ทุกแถวของตารางสถานะ** ทั้งสองจอ (ส่วนบนการ์ดจัดการผล · บล็อกบนหน้าคำร้อง) × รูป payload ตามสิทธิ์ ×
//   สวิตช์ออกเอกสารตอนส่งผล × เครื่อง production × วัดครบ/ไม่ครบ × ของที่จอจำไว้เอง × ใบจบแล้ว
// 🔴 กติกากันรั่วมีเทสต์ของตัวเอง: ไม่มี `version=internal` โดยไม่มีสิทธิ์ · Rev เก่าไม่มีลิงก์ · สถานะที่ไม่มีฉบับที่ใช้อยู่
//   ไม่มี href นอกจากลิงก์ฉบับร่าง
// ⚠️ ประโยคที่ซ้ำกับค่าคงที่ฝั่ง server (ไฟล์จอ import ไม่ได้) เทียบที่นี่ — เพี้ยนฝั่งไหน เทสต์แดง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { surveyReportSendWarnings } from './surveyReportView.js';
import { SURVEY_REPORT_NOT_PRODUCTION } from './surveyReportRows.js';
import { SURVEY_REPORT_REASONS, SURVEY_REPORT_STATES } from './surveyReportState.js';
import { surveySendConfirm } from './surveySendClose.js';
import { SPOT_TRAY_LABEL } from './surveySpotPhotos.js';
import {
  SURVEY_DOC_STALE_TEXT,
  SURVEY_DOC_VERSIONS,
  SURVEY_ISSUE_STICKY_CODES,
  surveyDocumentHref,
  surveyDocumentView,
  surveyDraftReadiness,
  surveyFilesSignature,
  surveyIssueDoneToast,
  surveyIssueErrorSticky,
  surveyRecallDoneText,
  surveyRecheckToast,
  surveyReopenDocumentLine,
  surveyRequestDocumentView,
  surveyRequestEnded,
  surveyWarningKinds,
} from './surveyDocumentView.js';

// ── ของตั้งต้น ───────────────────────────────────────────────────────────
const ANSWERED = '2026-10-01T03:04:00.000Z';
const ISSUED = '2026-10-01T03:05:00.000Z';
const request = (extra = {}) => ({
  id: 'DR-1', docNo: 'RQ-AS-26090106', kind: 'site_survey', dept: 'TS', status: 'acknowledged', ...extra,
});
const sentRequest = (extra = {}) => request({
  status: 'answered', answeredAt: ANSWERED, answeredByName: 'หัวหน้า ก', ...extra,
});

/* รูป `access` ตาม `surveyDocAccess` — หัวหน้าที่ตอบใบนี้ได้ · หัวหน้าที่ตอบใบนี้ไม่ได้ · ผู้บริหาร · ผู้ขอ (ฝ่ายขาย) */
const HEAD = { customer: true, internal: true, issue: true, draft: true, history: true };
const HEAD_NO_ISSUE = { customer: true, internal: true, issue: false, draft: false, history: true };
const EXEC = { customer: true, internal: true, issue: false, draft: false, history: false };
const SALES = { customer: true, internal: false, issue: false, draft: false, history: false };

const part = (w, l, h) => ({ widthM: w, lengthM: l, heightM: h, label: null });
const MEASURED = [
  { id: 'z1', status: 'ok', parts: [part(4, 5, 3)] },
  { id: 'z2', status: 'ok', parts: [part(6, 5, 3), part(2, 2, 3)] },
  { id: 'z3', status: 'cut', parts: [] },
];
const UNMEASURED = [MEASURED[0], { id: 'z2', status: 'ok', parts: [part(6, 5, '')] }, MEASURED[2]];

const currentRow = (extra = {}) => ({
  docNo: 'SU-26100001-1', rev: 1, issuedAt: ISSUED, issuedByName: 'หัวหน้า ก',
  approvedByName: 'หัวหน้า ก', approvedAt: ANSWERED, frozenAt: null,
  ready: { customer: false, internal: false }, ...extra,
});
const HISTORY = [
  { docNo: 'SU-26100001-0', rev: 0, issuedAt: '2026-09-28T02:00:00.000Z', supersededAt: '2026-09-30T18:30:00.000Z', supersededReason: 'recall' },
];
const HISTORY_2 = [
  { docNo: 'SU-26100001-1', rev: 1, issuedAt: '2026-09-29T02:00:00.000Z', supersededAt: '2026-09-30T02:00:00.000Z', supersededReason: 'reopen' },
  { docNo: 'SU-26100001-0', rev: 0, issuedAt: '2026-09-28T02:00:00.000Z', supersededAt: null, supersededReason: null },
];

/** payload ของหัวหน้าจาก GET ใบประเมิน — ทุกคีย์ตาม `surveyDocumentSummary` */
const headDoc = (extra = {}) => ({
  access: HEAD, issueAtSend: true, storeAllowed: true, state: 'not_sent', current: null,
  history: [], nextDocNo: null, send: null, issue: null, ...extra,
});
/** payload ของคนที่ไม่ได้คีย์ `history` · `nextDocNo` · `send` · `issue` (ไม่มีคีย์เลย ไม่ใช่ null) */
const bareDoc = (access, extra = {}) => ({
  access, issueAtSend: true, storeAllowed: true, state: 'not_sent', current: null, ...extra,
});
const OK_SEND = { blockers: [], warnings: [], unknown: false };
const OK_ISSUE = { blockers: [], warnings: [], unknown: false };

const sheet = (args = {}) => surveyDocumentView({
  request: request(), zones: MEASURED, canDecide: true, canWrite: true, failedGates: [], spotsUnlinked: false, ...args,
});
const SHEET_KEYS = [
  'show', 'placement', 'state', 'badge', 'versions', 'rows', 'status', 'printed', 'issue', 'hint', 'history',
  'relinkNote', 'poll', 'recheckOnFiles',
];
const hrefsIn = (value) => [...JSON.stringify(value).matchAll(/"href":"([^"]+)"/g)].map((m) => m[1]);
/* ปุ่มหนึ่งปุ่มเป็นคำเดียว — `none` ไม่วาด · `blocked` วาดแต่จาง (ไม่มี href) · นอกนั้นชนิดของลิงก์ */
const buttonOf = (link) => {
  if (!link) return 'none';
  if (link.blocked) {
    assert.equal(link.href, null, 'ปุ่มที่จางต้องไม่มี href');
    return link.label === 'ดูตัวอย่าง (ฉบับร่าง)' ? 'draft-blocked' : 'blocked';
  }
  assert.equal(typeof link.href, 'string');
  if (link.href.includes('draft=1')) return 'draft';
  return link.href.includes('download=1') ? 'download' : 'view';
};
const issueOf = (view) => (!view.issue ? 'none' : view.issue.allowed ? 'enabled' : 'blocked');
const buttons = (view, key = 'customer') => {
  const v = view.versions.find((x) => x.key === key);
  return [buttonOf(v?.preview), buttonOf(v?.download), issueOf(view)].join(' | ');
};

// ══ ตัวช่วย ═══════════════════════════════════════════════════════════════

test('ที่อยู่เอกสาร: สามโหมด · ฉบับที่ไม่รู้จัก = ฉบับลูกค้า · id ถูกเข้ารหัส · ไม่มี id = null', () => {
  assert.deepEqual(SURVEY_DOC_VERSIONS, ['customer', 'internal']);
  assert.ok(Object.isFrozen(SURVEY_DOC_VERSIONS));
  assert.equal(surveyDocumentHref('DR-1', 'customer', 'view'), '/api/service/surveys/DR-1/document?version=customer');
  assert.equal(surveyDocumentHref('DR-1', 'internal', 'download'), '/api/service/surveys/DR-1/document?version=internal&download=1');
  assert.equal(surveyDocumentHref('DR-1', 'customer', 'draft'), '/api/service/surveys/DR-1/document?version=customer&draft=1&format=html');
  assert.equal(surveyDocumentHref('DR-1', 'internal'), '/api/service/surveys/DR-1/document?version=internal', 'ไม่ส่งโหมด = เปิดดู');
  // 🔴 server นับเฉพาะสตริง `internal` ตรงตัว — ค่าอื่นทุกค่าต้องได้ลิงก์ของฉบับลูกค้า
  for (const bad of ['Internal', 'INTERNAL', ' internal', '', null, undefined, ['internal'], 'x&version=internal']) {
    assert.equal(surveyDocumentHref('DR-1', bad, 'download'), '/api/service/surveys/DR-1/document?version=customer&download=1', String(bad));
  }
  assert.equal(surveyDocumentHref('DR 1/ก?x=1', 'customer', 'view'),
    `/api/service/surveys/${encodeURIComponent('DR 1/ก?x=1')}/document?version=customer`);
  for (const none of [null, undefined, '', '  ']) assert.equal(surveyDocumentHref(none, 'customer', 'view'), null);
});

test('ดูร่างได้เมื่อทุกพื้นที่ที่ไม่ถูกตัดวัดครบทุกส่วน — กติกาเดียวกับ route ฉบับร่าง', () => {
  assert.deepEqual(surveyDraftReadiness(MEASURED), { done: 2, total: 2, ready: true });
  assert.deepEqual(surveyDraftReadiness(UNMEASURED), { done: 1, total: 2, ready: false });
  assert.deepEqual(surveyDraftReadiness([MEASURED[2]]), { done: 0, total: 0, ready: false }, 'ถูกตัดหมด = ไม่มีอะไรให้ดู');
  for (const none of [[], null, undefined, 'x']) assert.deepEqual(surveyDraftReadiness(none), { done: 0, total: 0, ready: false });
  assert.deepEqual(surveyDraftReadiness([null, { id: 'z', parts: [] }]), { done: 0, total: 1, ready: false });
});

test('ใบจบแล้ว = ยกเลิก หรือปิดโดยไม่เคยส่งผล · ส่งผลแล้วฝ่ายขายปิดเรื่อง ไม่นับ', () => {
  assert.equal(surveyRequestEnded(request()), false);
  assert.equal(surveyRequestEnded(sentRequest()), false);
  assert.equal(surveyRequestEnded(sentRequest({ closedAt: ANSWERED, status: 'closed' })), false, 'จบครบตามปกติ — เอกสารยังใช้อยู่');
  assert.equal(surveyRequestEnded(request({ cancelledAt: ANSWERED })), true);
  assert.equal(surveyRequestEnded(sentRequest({ cancelledAt: ANSWERED })), true);
  assert.equal(surveyRequestEnded(request({ closedAt: ANSWERED })), true, 'ฝ่ายขายปิดฝั่งตัวเองไปก่อนได้ผล');
  assert.equal(surveyRequestEnded(request({ status: 'closed' })), true);
  assert.equal(surveyRequestEnded(null), false);
  assert.equal(surveyRequestEnded(undefined), false);
});

test('ชนิดของคำเตือน — เทียบกับบรรทัดจริงของตัวตรวจ: หมายเหตุพื้นที่หนึ่งบรรทัด · ช่องอื่นหนึ่งบรรทัด', () => {
  const lines = surveyReportSendWarnings({
    zones: [{ no: 1, name: 'Studio 01', note: 'ตั้งเครื่องไว้มุมนี้' }],
    party: { customerName: 'บริษัท เอสล่า 😀 จำกัด' },
  });
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.deepEqual(surveyWarningKinds([lines[0]]), { note: true, other: false });
  assert.deepEqual(surveyWarningKinds([lines[1]]), { note: false, other: true });
  assert.deepEqual(surveyWarningKinds(lines), { note: true, other: true });
  // หมายเหตุพื้นที่ที่มีอักขระพิมพ์ไม่ได้ก็ขึ้นต้นด้วยคำเดียวกัน (ตัวสร้างตัวที่สอง)
  const emojiNote = surveyReportSendWarnings({ zones: [{ no: 2, note: 'ดีมาก 😀' }] });
  assert.deepEqual(surveyWarningKinds(emojiNote), { note: true, other: false }, emojiNote.join('\n'));
  for (const none of [[], null, undefined, ['', '  ', 7, null]]) assert.deepEqual(surveyWarningKinds(none), { note: false, other: false });
});

test('ข้อผิดพลาดที่ปุ่มออกเอกสารต้องจางต่อ: undecodable · paper_blocked · rpc_failed ที่กดซ้ำไม่ได้ — นอกนั้นกดซ้ำได้ · `retry: true` ของ server ชนะรหัส', () => {
  assert.deepEqual(SURVEY_ISSUE_STICKY_CODES, ['undecodable', 'paper_blocked']);
  assert.equal(surveyIssueErrorSticky({ code: 'undecodable', retry: false }), true);
  assert.equal(surveyIssueErrorSticky({ code: 'paper_blocked', retry: false }), true, 'กระดาษล้น · ด่านกันรั่ว — ต้องดึงผลกลับ');
  // 🐞 ตัวพิมพ์เอกสารเปิดไม่ได้ · วัดกระดาษไม่ทัน = `paper_blocked` + `retry: true` ("กดออกเอกสารอีกครั้ง") — ล็อกปุ่มจากรหัส = ทางตัน
  assert.equal(surveyIssueErrorSticky({ code: 'paper_blocked', retry: true }), false);
  assert.equal(surveyIssueErrorSticky({ code: 'undecodable', retry: true }), false, 'server บอกว่ากดซ้ำได้ = ไม่ล็อกจากรหัส');
  // รหัสในลิสต์ที่ไม่ได้บอกว่ากดซ้ำได้ไหม = ยังล็อก (เฉพาะ `true` ตรงตัวที่ปลดล็อก)
  for (const retry of [undefined, null, 'true', 1]) assert.equal(surveyIssueErrorSticky({ code: 'paper_blocked', retry }), true, String(retry));
  assert.equal(surveyIssueErrorSticky({ code: 'rpc_failed', retry: false }), true);
  assert.equal(surveyIssueErrorSticky({ code: 'rpc_failed', retry: true }), false);
  assert.equal(surveyIssueErrorSticky({ code: 'rpc_failed', retry: null }), false, 'ไม่รู้ว่ากดซ้ำได้ไหม = ไม่ล็อกปุ่ม');
  // 🔴 `blocked` + `retry: false` ไม่ได้แปลว่าต้องดึงผลกลับ (รูปจุดผูกได้เลย) ⇒ ให้เหตุสดของ server ตัดสิน ไม่ล็อกจากรหัส
  for (const code of ['blocked', 'images_failed', 'timeout', 'read_failed', 'internal', 'not_answered', 'answer_changed', 'stale_current', null]) {
    assert.equal(surveyIssueErrorSticky({ code, retry: false }), false, String(code));
  }
  for (const none of [null, undefined, 'undecodable', []]) assert.equal(surveyIssueErrorSticky(none), false);
});

test('ลายเซ็นของชุดไฟล์: ชุดเดิมคนละลำดับ = เท่ากัน · ผูกจุดใหม่ / เปลี่ยนหัวข้อ / ไฟล์เพิ่ม = ต่าง', () => {
  const a = { id: 'F1', docType: 'survey_wide', metadata: null };
  const b = { id: 'F2', docType: 'survey_spot', metadata: { spotId: 's1' } };
  const c = { id: 'F3', docType: 'survey_plan' };
  const base = surveyFilesSignature({ z1: [a, b], z2: [c] });
  assert.equal(typeof base, 'string');
  assert.equal(surveyFilesSignature({ z2: [c], z1: [b, a] }), base);
  assert.notEqual(surveyFilesSignature({ z1: [a, { ...b, metadata: { spotId: 's2' } }], z2: [c] }), base, 'ย้ายรูปไปอีกจุด');
  assert.notEqual(surveyFilesSignature({ z1: [a, { ...b, metadata: {} }], z2: [c] }), base, 'ถอดรูปออกจากจุด');
  assert.notEqual(surveyFilesSignature({ z1: [a, { ...b, docType: 'survey_wide' }], z2: [c] }), base);
  assert.notEqual(surveyFilesSignature({ z1: [a, b], z2: [c, { id: 'F4', docType: 'survey_plan' }] }), base);
  assert.notEqual(surveyFilesSignature({ z1: [a, b, c], z2: [] }), base, 'ไฟล์เดิมย้ายพื้นที่');
  assert.equal(surveyFilesSignature({ z1: [a, null, b], z2: [c], z3: null }), base, 'ช่องว่างในลิสต์ไม่นับ');
  for (const none of [null, undefined, {}, [], 'x']) assert.equal(surveyFilesSignature(none), '');
});

/* 🔴 ทำไมเหตุถาวรอื่นไม่ต้องมีบรรทัดทางออกของจอ: ประโยคของ server บอกเองอยู่แล้ว — ล็อกกับซอร์ส/ค่าคงที่ฝั่ง server
   (ประโยคของฝั่งไหนเลิกบอกทางออกเมื่อไร เทสต์นี้ฟ้อง แล้วต้องมาเติมบรรทัดทางออกให้รหัสนั้นใน `surveyDocumentView`) */
test('🔴 เหตุที่กดออกเอกสารซ้ำไม่ผ่าน: ประโยคของ server ต้องบอกทางออกเอง เว้นกระดาษล้นซึ่งจอต่อบรรทัดทางออกให้', () => {
  // `rpc_failed` ที่ `retry: false` — เลขชนกัน · เลขของปีเต็ม · ฐานไม่พร้อม
  for (const key of ['conflict', 'sequence_exhausted', 'db_not_ready']) {
    assert.match(SURVEY_REPORT_REASONS[key], /แจ้งผู้ดูแลระบบ$/, key);
  }
  const issue = readFileSync(new URL('./surveyReportIssue.js', import.meta.url), 'utf8');
  // `undecodable` — รูปเปิดไม่ได้: ดึงผลกลับ อัปรูปใหม่ แล้วส่งผลอีกครั้ง
  assert.match(issue, /return failed\('undecodable',[\s\S]{0,400}ดึงผลกลับ อัปรูปใหม่เป็น JPG แล้วส่งผลอีกครั้ง',\s*retry: false,/);
  // `paper_blocked` ของยามกันรั่ว (ความผิดของระบบ) — แจ้งผู้ดูแลระบบ
  assert.match(issue, /ฉบับลูกค้ายังออกไม่ได้ — \$\{leaks\.join\(' \| '\)\} · ยังไม่ได้ออกเลขเอกสาร แจ้งผู้ดูแลระบบ`,\s*retry: false,/);
  // `paper_blocked` ของกระดาษล้น — ประโยคจบที่ "ยังไม่ได้ออกเลขเอกสาร" ไม่มีทางออก ⇒ จอต่อ `PAPER_BLOCKED_WAY_OUT`
  assert.match(issue, /reason: `กระดาษของเอกสารยังพิมพ์ไม่ได้ — \$\{[^`]*\} · ยังไม่ได้ออกเลขเอกสาร`,\s*retry: false,/);
});

test('🐞 toast ของ "ตรวจอีกครั้ง" / "โหลดใหม่": ใช้คำของปุ่มที่กด · อ่านสถานะเอกสารยังไม่สำเร็จ = บอกตรง ๆ ไม่ใช่ "ผลยังเหมือนเดิม"', () => {
  const blocked = sheet({ document: headDoc({ issueAtSend: true, send: { blockers: ['Studio 01: ภาพผังเปิดไม่ได้', 'ลูกค้ายังไม่มีที่อยู่'], warnings: [], unknown: false } }) });
  assert.deepEqual(blocked.status.action, { kind: 'reload', label: 'ตรวจอีกครั้ง' });
  assert.deepEqual(surveyRecheckToast(blocked, 'failed'), { kind: 'error', msg: 'ตรวจอีกครั้งไม่สำเร็จ — ลองใหม่' });
  assert.deepEqual(surveyRecheckToast(blocked, 'same'), { kind: 'info', msg: 'ตรวจแล้ว — ยังติด 2 ข้อ' });

  /* อ่านสถานะเอกสารไม่สำเร็จ (S29): ปุ่มชื่อ "โหลดใหม่" · server ตอบได้แต่ยังอ่านสถานะไม่สำเร็จเหมือนเดิม */
  const unknown = sheet({ document: { access: 'none', unknown: true }, request: sentRequest() });
  assert.equal(unknown.state, 'unknown');
  assert.deepEqual(unknown.status.action, { kind: 'reload', label: 'โหลดใหม่' });
  assert.deepEqual(surveyRecheckToast(unknown, 'failed'), { kind: 'error', msg: 'โหลดใหม่ไม่สำเร็จ — ลองใหม่' });
  const again = surveyRecheckToast(unknown, 'same');
  assert.deepEqual(again, { kind: 'warning', msg: 'โหลดใหม่แล้ว — ยังอ่านสถานะเอกสารไม่สำเร็จ' });
  assert.doesNotMatch(again.msg, /ตรวจแล้ว|เหมือนเดิม/, 'กล่องยังบอกว่าอ่านไม่สำเร็จ — toast ต้องไม่อ่านเหมือนตรวจผ่านแล้ว');

  /* กล่องที่ไม่มีรายการข้อและไม่ใช่ "ไม่ทราบ" (ปุ่มในบรรทัดเหตุใต้ปุ่มส่งผลใช้ตัวจัดการเดียวกัน) = คำกลาง · ไม่มีกล่องเลย = คำของปุ่มตั้งต้น */
  const ready = sheet({ document: headDoc({ issueAtSend: true, send: { blockers: [], warnings: [], unknown: false } }) });
  assert.deepEqual(surveyRecheckToast(ready, 'same'), { kind: 'info', msg: 'ตรวจแล้ว — ผลยังเหมือนเดิม' });
  for (const none of [null, undefined, {}, { status: null }]) {
    assert.deepEqual(surveyRecheckToast(none, 'failed'), { kind: 'error', msg: 'ตรวจอีกครั้งไม่สำเร็จ — ลองใหม่' });
    assert.deepEqual(surveyRecheckToast(none, 'same'), { kind: 'info', msg: 'ตรวจแล้ว — ผลยังเหมือนเดิม' });
  }
  /* ⚠️ ค่าตั้งต้นของเวลา = ไม่มีคีย์ (normalizeToast แปลง null เป็น 0 มิลลิวินาที) */
  for (const toast of [again, surveyRecheckToast(blocked, 'same'), surveyRecheckToast(blocked, 'failed')]) assert.equal('duration' in toast, false);
});

test('toast หลังออกเอกสาร: เลขใหม่ · ฉบับเดิม · พบตอนโหลดใหม่ · ออกเลขแล้วไฟล์ยังไม่เสร็จ', () => {
  assert.deepEqual(surveyIssueDoneToast({ state: 'ready', docNo: 'SU-26100001-0', rev: 0, reused: false, warnings: [] }), {
    kind: 'success', duration: 6000, msg: 'ออกเอกสาร SU-26100001-0 แล้ว — ผู้ขอได้รับแจ้งในเธรดของคำร้อง',
  });
  const reused = surveyIssueDoneToast({ docNo: 'SU-26100001-0', reused: true });
  assert.deepEqual(reused, { kind: 'info', msg: 'เอกสาร SU-26100001-0 ออกไว้แล้ว — ไม่ได้ออกเลขใหม่' });
  // พบตอนโหลดใหม่หลังคำตอบหาย — จอบอกไม่ได้ว่าใครออกเลข ⇒ ไม่อ้างว่าแจ้งผู้ขอ ไม่อ้างว่าไม่ได้ออกเลขใหม่
  const found = surveyIssueDoneToast({ docNo: 'SU-26100001-0' });
  assert.deepEqual(found, { kind: 'info', msg: 'ออกเอกสาร SU-26100001-0 แล้ว' });
  // ⚠️ ค่าตั้งต้นของเวลา = ไม่มีคีย์ (normalizeToast แปลง null เป็น 0 มิลลิวินาที)
  assert.equal('duration' in reused, false);
  assert.equal('duration' in found, false);
  for (const report of [
    { docNo: 'SU-26100001-0', reason: 'เวลาไม่พอจัดทำกระดาษของเอกสาร — ลองใหม่อีกครั้ง' },
    { docNo: 'SU-26100001-0', reused: true, reason: 'จัดทำกระดาษของเอกสารไม่สำเร็จ — แจ้งผู้ดูแลระบบ' },
    { docNo: 'SU-26100001-0', reused: false, reason: 'x' },
  ]) {
    assert.deepEqual(surveyIssueDoneToast(report), {
      kind: 'warning', duration: 9000,
      msg: 'ออกเลข SU-26100001-0 แล้ว แต่ไฟล์ PDF ยังไม่เสร็จ — ดูเหตุที่ส่วน “เอกสารประเมินพื้นที่”',
    });
  }
  assert.equal(surveyIssueDoneToast(null).msg, 'ออกเอกสาร แล้ว');
});

test('toast หลังดึงผลกลับ: ประโยคเดิม + เลขเอกสารที่เพิ่งใช้ไม่ได้ เมื่อ route คืนเลขมา', () => {
  assert.equal(surveyRecallDoneText('SU-26100001-0'),
    'ดึงผลกลับมาแก้แล้ว — ฝ่ายขายได้รับแจ้งพร้อมตัวเลขเดิม · เอกสาร SU-26100001-0 ใช้ไม่ได้แล้ว');
  for (const none of [null, undefined, '', '  ', { docNo: 'SU-1' }]) {
    assert.equal(surveyRecallDoneText(none), 'ดึงผลกลับมาแก้แล้ว — ฝ่ายขายได้รับแจ้งพร้อมตัวเลขเดิม');
  }
});

test('บรรทัดเอกสารในโมดัล "ยังไม่จบ": มีเลข · ไม่ทราบบนใบที่ตอบแล้ว · ไม่ทราบบนใบที่ยังไม่ตอบ = ไม่มีบรรทัด', () => {
  const named = 'เอกสาร SU-26100001-1 จะถูกแทนที่ — ใช้ไม่ได้ทันทีที่กด ห้ามใช้ฉบับที่ส่งลูกค้าไปแล้ว · ฉบับใหม่ (Rev ถัดไป) ออกหลังฝ่ายบริการส่งผลอีกครั้ง';
  // Planner ได้แค่ `{ access: 'none', voids }` — ยังได้บรรทัดนี้ (#1223)
  assert.equal(surveyReopenDocumentLine({ access: 'none', voids: 'SU-26100001-1' }, sentRequest()), named);
  assert.equal(surveyReopenDocumentLine(bareDoc(SALES, { state: 'ready', voids: 'SU-26100001-1' }), sentRequest()), named);
  const unknown = 'อ่านสถานะเอกสารประเมินไม่สำเร็จ — ถ้าใบนี้มีเอกสาร SU เอกสารนั้นจะใช้ไม่ได้เมื่อกด';
  assert.equal(surveyReopenDocumentLine({ access: 'none', voids: null, unknown: true }, sentRequest()), unknown);
  assert.equal(surveyReopenDocumentLine({ access: 'none', unknown: true }, sentRequest()), unknown);
  // ใบที่ยังไม่ตอบ การเปิดกลับไม่แทนที่อะไร (ทริกเกอร์ยิงเฉพาะตอน answeredAt จากมีค่าเป็นว่าง)
  assert.equal(surveyReopenDocumentLine({ access: 'none', voids: null, unknown: true }, request()), null);
  for (const doc of [null, undefined, { access: 'none' }, { access: 'none', voids: null }, headDoc({ state: 'missing' }), 'x']) {
    assert.equal(surveyReopenDocumentLine(doc, sentRequest()), null);
  }
});

// ══ ส่วนบนการ์ดจัดการผล — รูป payload ═════════════════════════════════════

test('payload ทุกรูปไม่ทำให้ล้ม และทุกคีย์มีเสมอ — ไม่มี · ไม่มีสิทธิ์ · ไม่ทราบ · ผู้บริหาร · หัวหน้าที่ยังไม่ตรวจ', () => {
  const payloads = [
    null, undefined, 'none', 7, [], {},
    { access: 'none' }, { access: 'none', unknown: true }, { access: 'none', voids: 'SU-26100001-1' },
    { access: 'none', voids: null, unknown: true },
    bareDoc(EXEC, { state: 'ready', current: currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: true } }) }),
    bareDoc(SALES, { state: 'missing' }),
    headDoc({ send: null, issue: null }),
    headDoc({ state: null, unknown: true }),
    headDoc({ state: 'some_new_state' }),
    headDoc({ state: 'ready', current: null }),
    { access: HEAD },
  ];
  for (const document of payloads) {
    for (const req of [request(), sentRequest(), request({ cancelledAt: ANSWERED }), null]) {
      for (const canDecide of [true, false]) {
        const view = surveyDocumentView({ document, request: req, zones: MEASURED, canDecide });
        assert.deepEqual(Object.keys(view), SHEET_KEYS, JSON.stringify(document));
        assert.equal(typeof view.badge.label, 'string');
        assert.ok(Array.isArray(view.versions) && Array.isArray(view.rows));
        if (!canDecide) assert.equal(view.show, false, 'การ์ดวาดให้คนที่ส่งผลได้เท่านั้น');
      }
    }
  }
  assert.deepEqual(Object.keys(surveyDocumentView()), SHEET_KEYS);
  assert.equal(surveyDocumentView().show, false);
});

test('🔴 ไม่มีสิทธิ์ = ไม่แสดงส่วนนี้ · ช่างไม่ได้อะไรเลย (ไม่มีส่วน ไม่มีหมายเหตุผูกรูป ไม่มีการถามซ้ำ)', () => {
  for (const document of [null, { access: 'none' }, { access: 'none', voids: 'SU-26100001-1' }]) {
    const view = sheet({ document, request: sentRequest() });
    assert.equal(view.show, false);
    assert.equal(view.state, null);
    assert.deepEqual(view.versions, []);
    assert.equal(view.relinkNote, null);
    assert.equal(view.poll, false);
    assert.equal(view.recheckOnFiles, false);
    assert.deepEqual(hrefsIn(view), []);
  }
  // มีสิทธิ์ครบแต่ไม่ใช่คนส่งผล (การ์ดไม่วาดให้) — ไม่มีลิงก์หลุดออกมาในผล
  const crew = sheet({
    document: headDoc({ state: 'ready', current: currentRow({ ready: { customer: true, internal: true } }) }),
    request: sentRequest(), canDecide: false,
  });
  assert.equal(crew.show, false);
  assert.deepEqual(hrefsIn(crew), []);
  assert.equal(crew.relinkNote, null);
});

test('payload ที่ GET ล็อกรูปไว้: Planner ได้แค่ access+voids · ผู้ขอไม่มี history/nextDocNo/send/issue · หัวหน้าบน GET คำร้องไม่มีผลตรวจ', () => {
  const ready = currentRow({ docNo: 'SU-26100001-1', frozenAt: ISSUED, ready: { customer: true, internal: true } });
  // Planner — ไม่มีบล็อก ไม่มีส่วน แต่โมดัล "ยังไม่จบ" ได้เลข
  const planner = { access: 'none', voids: 'SU-26100001-1' };
  assert.equal(sheet({ document: planner, request: sentRequest() }).show, false);
  assert.equal(surveyRequestDocumentView({ surveyDocument: planner, request: sentRequest(), viewer: {} }), null);
  // ผู้ขอ — ปุ่มเดียว ฉบับลูกค้า
  const requester = bareDoc(SALES, { state: 'ready', current: ready, voids: 'SU-26100001-1' });
  const block = surveyRequestDocumentView({ surveyDocument: requester, request: sentRequest(), viewer: { isRequesterSide: true } });
  assert.deepEqual(block.buttons.map((b) => b.id), ['customer']);
  assert.doesNotMatch(JSON.stringify(block), /internal|ภายใน/);
  // หัวหน้าบน GET คำร้อง — `send: null` · `issue: null` (เส้นนี้ไม่ตรวจเนื้อเอกสาร) แม้สถานะ missing
  const head = headDoc({ state: 'missing', voids: null });
  const headBlock = surveyRequestDocumentView({ surveyDocument: head, request: sentRequest(), viewer: { canDecide: true, canOpenSheet: true } });
  assert.equal(headBlock.state, 'missing');
  assert.equal(headBlock.sheetLink, true);
});

// ══ ส่วนบนการ์ดจัดการผล — ตารางสถานะ §4.1 ═════════════════════════════════

const HINT = 'ตัวอย่างก่อนส่งผลมีลายน้ำ “ฉบับร่าง” และยังไม่มีเลขที่ · หมายเหตุพื้นที่พิมพ์ลงฉบับลูกค้าตามที่เขียน — ตรวจก่อนส่งผล';

test('ไม่ทราบ: ป้าย "ไม่ทราบ" · ปุ่มโหลดใหม่ · ไม่มีปุ่มเอกสาร · ปักไว้เหนือปุ่มคลี่เสมอ', () => {
  for (const [document, req] of [
    [{ access: 'none', unknown: true }, sentRequest()],
    [{ access: 'none', unknown: true }, request()],
    [headDoc({ state: null, unknown: true }), sentRequest()],
    [headDoc({ state: 'something_else' }), sentRequest()],
  ]) {
    const view = sheet({ document, request: req });
    assert.equal(view.show, true);
    assert.equal(view.state, 'unknown');
    assert.equal(view.placement, 'pinned');
    assert.deepEqual(view.badge, { label: 'ไม่ทราบ', tone: 'neutral' });
    assert.deepEqual(view.status, {
      tone: 'warning', text: 'อ่านสถานะเอกสารไม่สำเร็จ — ยังไม่ทราบว่ามีเอกสารหรือไม่',
      items: [], foot: null, action: { kind: 'reload', label: 'โหลดใหม่' },
    });
    assert.deepEqual(view.versions, []);
    assert.deepEqual(view.rows, []);
    assert.equal(view.issue, null);
    assert.equal(view.hint, null);
    assert.equal(view.poll, false);
  }
});

test('ยังไม่ส่งผล · วัดยังไม่ครบ: บอก n/m · ปุ่มร่างขึ้นแต่จาง · ดาวน์โหลดจาง · อยู่หลังปุ่มคลี่', () => {
  const view = sheet({ document: headDoc({ send: OK_SEND }), zones: UNMEASURED });
  assert.equal(view.show, true);
  assert.equal(view.placement, 'fold');
  assert.deepEqual(view.badge, { label: 'ยังไม่ออก', tone: 'neutral' });
  assert.deepEqual(view.status, { tone: 'info', text: 'ดูตัวอย่างได้เมื่อวัดครบทุกพื้นที่ (1/2)', items: [], foot: null, action: null });
  assert.equal(buttons(view), 'draft-blocked | blocked | none');
  assert.equal(buttons(view, 'internal'), 'draft-blocked | blocked | none');
  assert.equal(view.hint, HINT);
  assert.deepEqual(view.rows, []);
  assert.deepEqual(hrefsIn(view), []);
  // วัดไม่ครบพูดก่อนเหตุของเอกสาร — ยังไม่มีอะไรให้ดูเลย
  const blocked = sheet({ document: headDoc({ send: { ...OK_SEND, blockers: ['พื้นที่ 1 ไม่มีภาพผัง'] } }), zones: UNMEASURED });
  assert.equal(blocked.status.text, 'ดูตัวอย่างได้เมื่อวัดครบทุกพื้นที่ (1/2)');
});

test('ยังไม่ส่งผล · วัดครบ · เอกสารออกไม่ได้ (สวิตช์เปิด): รายการเหตุครบทุกข้อ + ตรวจอีกครั้ง · ไม่อ้างตัวเองเป็นด่านที่ติด', () => {
  const blockers = ['พื้นที่ Studio 01 ภาพผังเป็น PDF — อัปเป็นรูป', 'นัด SV-2609001 ไม่มีวันเข้าพื้นที่', 'พื้นที่ Studio 01 ภาพผังเป็น PDF — อัปเป็นรูป'];
  const view = sheet({ document: headDoc({ send: { blockers, warnings: [], unknown: false } }) });
  assert.deepEqual(view.status, {
    tone: 'warning', text: 'เอกสารยังออกไม่ได้ — ติด 2 ข้อ',
    items: [blockers[0], blockers[1]],
    foot: 'แก้ตามรายการแล้วกด “ตรวจอีกครั้ง”',
    action: { kind: 'reload', label: 'ตรวจอีกครั้ง' },
  });
  assert.equal(buttons(view), 'draft | blocked | none');
  assert.equal(view.versions[0].preview.label, 'ดูตัวอย่าง (ฉบับร่าง)');
  assert.equal(view.versions[0].preview.href, '/api/service/surveys/DR-1/document?version=customer&draft=1&format=html');
  assert.equal(view.versions[1].preview.href, '/api/service/surveys/DR-1/document?version=internal&draft=1&format=html');
  assert.equal(view.recheckOnFiles, true);
  // ด่านอื่นยังติดด้วย — ต่อท้ายบรรทัดทางออก ด้วยชื่อย่อของด่าน
  const withGates = sheet({ document: headDoc({ send: { blockers, warnings: [], unknown: false } }), failedGates: ['เลือกจุด', 'แพ็คเกจ'] });
  assert.equal(withGates.status.foot, 'แก้ตามรายการแล้วกด “ตรวจอีกครั้ง” · ด่านอื่นยังติด 2 ด่าน: เลือกจุด · แพ็คเกจ');
});

test('ยังไม่ส่งผล · วัดครบ · ด่านอื่นติด: สวิตช์เปิดพูดเรื่องดาวน์โหลด · สวิตช์ปิดพูดเรื่องออกเอกสาร', () => {
  const on = sheet({ document: headDoc({ send: OK_SEND }), failedGates: ['เลือกจุด', 'แพ็คเกจ'] });
  assert.deepEqual(on.status, {
    tone: 'warning', text: 'ดาวน์โหลด PDF ได้หลังส่งผลให้ฝ่ายขาย — ยังติด 2 ด่าน: เลือกจุด · แพ็คเกจ', items: [], foot: null, action: null,
  });
  assert.equal(buttons(on), 'draft | blocked | none');
  const off = sheet({ document: headDoc({ issueAtSend: false }), failedGates: ['ผูกรูปจุด'] });
  assert.equal(off.status.tone, 'warning');
  assert.equal(off.status.text, 'ออกเอกสารได้หลังส่งผลให้ฝ่ายขาย — ยังติด 1 ด่าน: ผูกรูปจุด');
  assert.equal(off.recheckOnFiles, false, 'สวิตช์ปิด = ไม่มีผลตรวจให้ถามซ้ำ');
});

test('ยังไม่ส่งผล · ผ่านทุกด่าน: สวิตช์เปิด "พร้อมแล้ว" · ตรวจล่วงหน้าไม่สำเร็จบอกตรง ๆ · สวิตช์ปิดห้ามบอกว่าพร้อม', () => {
  const ready = sheet({ document: headDoc({ send: OK_SEND }) });
  assert.deepEqual(ready.status, { tone: 'info', text: 'พร้อมแล้ว — กดส่งผลเพื่อออกเลขที่เอกสาร', items: [], foot: null, action: null });
  assert.equal(buttons(ready), 'draft | blocked | none');
  const unknown = sheet({ document: headDoc({ send: { blockers: [], warnings: [], unknown: true } }) });
  assert.deepEqual(unknown.status, { tone: 'info', text: 'ตรวจเอกสารล่วงหน้าไม่สำเร็จ — ส่งผลได้ ระบบตรวจอีกครั้งตอนส่ง', items: [], foot: null, action: null });
  const off = sheet({ document: headDoc({ issueAtSend: false }) });
  assert.deepEqual(off.status, {
    tone: 'info',
    text: 'ส่งผลก่อน แล้วกด “ออกเอกสาร” ที่นี่ — ระบบตรวจเอกสารตอนกดออก (ถ้าติดเรื่องภาพผัง นัด หรือหน้าล้น ต้องดึงผลกลับมาแก้)',
    items: [], foot: null, action: null,
  });
  assert.doesNotMatch(off.status.text, /พร้อมแล้ว/);
  assert.equal(buttons(off), 'draft | blocked | none');
  assert.equal(off.hint, HINT);
});

test('ดึงผลกลับแล้ว: บอกเลขเดิมกับเลขถัดไป (สวิตช์เปิด/ปิด · ไม่รู้เลขถัดไป) · แถวเลขที่ = ฉบับที่ถูกแทนที่ · มีรายการ Rev', () => {
  const doc = (extra = {}) => headDoc({ state: 'recalled', history: HISTORY, nextDocNo: 'SU-26100001-1', send: OK_SEND, ...extra });
  const on = sheet({ document: doc() });
  assert.equal(on.placement, 'fold');
  assert.deepEqual(on.badge, { label: 'ถูกแทนที่', tone: 'warning' });
  assert.deepEqual(on.status, {
    tone: 'warning', text: 'SU-26100001-0 ถูกแทนที่แล้ว — ส่งผลอีกครั้งเพื่อออก SU-26100001-1', items: [], foot: null, action: null,
  });
  assert.deepEqual(on.rows, [{ key: 'docNo', label: 'เลขที่', value: 'SU-26100001-0' }]);
  assert.equal(buttons(on), 'draft | blocked | none');
  assert.equal(on.hint, HINT);
  assert.equal(sheet({ document: doc({ issueAtSend: false, send: null }) }).status.text,
    'SU-26100001-0 ถูกแทนที่แล้ว — ส่งผลอีกครั้ง แล้วกด “ออกเอกสาร” เพื่อออก SU-26100001-1');
  assert.equal(sheet({ document: doc({ nextDocNo: null }) }).status.text,
    'SU-26100001-0 ถูกแทนที่แล้ว — ส่งผลอีกครั้งเพื่อออก Rev ถัดไป');
  // ปุ่มร่างเดินตามกติกาวัดครบ — กล่องสถานะพูดเรื่องอื่นอยู่ จึงบอกเหตุของปุ่มที่ท้ายกล่อง
  const unmeasured = sheet({ document: doc(), zones: UNMEASURED });
  assert.equal(buttons(unmeasured), 'draft-blocked | blocked | none');
  assert.equal(unmeasured.status.foot, 'ดูตัวอย่างได้เมื่อวัดครบทุกพื้นที่ (1/2)');
});

test('🐞 ดึงผลกลับแล้วแก้จนเอกสารออกไม่ได้: กางเหตุทุกข้อ + ตรวจอีกครั้ง เหมือนใบที่ยังไม่ส่ง — ไม่ใช่สั่ง "ส่งผลอีกครั้ง" เฉย ๆ', () => {
  const blockers = ['Studio 01: ยังไม่มีภาพผังที่ลงเอกสารได้ (ต้องเป็นรูป JPG/PNG)', 'นัด SV-2609001 ไม่มีวันเข้าพื้นที่', 'นัด SV-2609001 ไม่มีวันเข้าพื้นที่'];
  const doc = (extra = {}) => headDoc({
    state: 'recalled', history: HISTORY, nextDocNo: 'SU-26100001-1', send: { blockers, warnings: [], unknown: false }, ...extra,
  });
  const view = sheet({ document: doc() });
  assert.deepEqual(view.status, {
    tone: 'warning', text: 'SU-26100001-0 ถูกแทนที่แล้ว — ส่งผลอีกครั้งเพื่อออก SU-26100001-1',
    items: [blockers[0], blockers[1]],
    foot: 'แก้ตามรายการแล้วกด “ตรวจอีกครั้ง”',
    action: { kind: 'reload', label: 'ตรวจอีกครั้ง' },
  });
  // ส่วนที่เหลือของสถานะนี้ไม่เปลี่ยน — ป้าย · แถวเลขที่ · ปุ่มร่าง · คำใบ้ · ถามซ้ำเมื่อไฟล์เปลี่ยน
  assert.deepEqual(view.badge, { label: 'ถูกแทนที่', tone: 'warning' });
  assert.deepEqual(view.rows, [{ key: 'docNo', label: 'เลขที่', value: 'SU-26100001-0' }]);
  assert.equal(buttons(view), 'draft | blocked | none');
  assert.equal(view.hint, HINT);
  assert.equal(view.recheckOnFiles, true);
  // ไม่มีเหตุ (รวมเหตุที่เป็นช่องว่างล้วน · ไม่มีผลตรวจ) = กล่องเดิมทุกตัวอักษร
  const plain = { tone: 'warning', text: 'SU-26100001-0 ถูกแทนที่แล้ว — ส่งผลอีกครั้งเพื่อออก SU-26100001-1', items: [], foot: null, action: null };
  for (const send of [OK_SEND, { blockers: ['', '  ', null], warnings: [], unknown: false }, { blockers: [], warnings: [], unknown: true }, null]) {
    assert.deepEqual(sheet({ document: doc({ send }) }).status, plain, JSON.stringify(send));
  }
  // วัดไม่ครบพูดก่อนเหตุของเอกสาร (เหมือนใบที่ยังไม่ส่ง) — ยังไม่มีอะไรให้ตรวจ
  const unmeasured = sheet({ document: doc(), zones: UNMEASURED });
  assert.deepEqual(unmeasured.status, { ...plain, foot: 'ดูตัวอย่างได้เมื่อวัดครบทุกพื้นที่ (1/2)' });
  // ใบจบแล้ว = ไม่มีฉบับใหม่ ไม่มีรายการให้แก้
  const ended = sheet({ document: doc(), request: request({ closedAt: ANSWERED, status: 'closed' }) });
  assert.deepEqual(ended.status.items, []);
  assert.equal(ended.status.action, null);
});

test('รายการ Rev ก่อนหน้า: เลข + ออก/ถูกแทนที่/เหตุ · วันเวลาเป็นเวลาไทย · ค่าว่างพิมพ์ขีด · 🔴 ไม่มีแถวไหนมีลิงก์', () => {
  const view = sheet({ document: headDoc({ state: 'recalled', history: HISTORY_2 }) });
  assert.deepEqual(view.history, {
    label: 'Rev ก่อนหน้า (2)',
    hideLabel: 'ซ่อน Rev ก่อนหน้า',
    foot: 'Rev ก่อนหน้าใช้ไม่ได้แล้ว และเปิดไฟล์ไม่ได้',
    rows: [
      { docNo: 'SU-26100001-1', line: 'ออก 29/09/2026 09:00 · ถูกแทนที่ 30/09/2026 09:00 · เปิดเรื่องกลับ (ยังไม่จบ)' },
      { docNo: 'SU-26100001-0', line: 'ออก 28/09/2026 09:00 · ถูกแทนที่ —' },
    ],
  });
  // เที่ยงคืนถึงเจ็ดโมงเช้าเวลาไทย = วันถัดไปของ UTC — ต้องขึ้นวันไทย (เทสต์นี้ต้องผ่านใต้ TZ=UTC ด้วย)
  const recall = sheet({ document: headDoc({ state: 'recalled', history: HISTORY }) });
  assert.equal(recall.history.rows[0].line, 'ออก 28/09/2026 09:00 · ถูกแทนที่ 01/10/2026 01:30 · ดึงผลกลับมาแก้');
  assert.deepEqual(Object.keys(recall.history.rows[0]), ['docNo', 'line']);
  assert.doesNotMatch(JSON.stringify(view.history), /href|\/api\//);
  // รายการขึ้นทุกสถานะที่มีประวัติ — รวมตอนมีฉบับที่ใช้อยู่
  const ready = sheet({
    document: headDoc({ state: 'ready', history: HISTORY, current: currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: true } }) }),
    request: sentRequest(),
  });
  assert.equal(ready.history.label, 'Rev ก่อนหน้า (1)');
  assert.doesNotMatch(JSON.stringify(ready.history), /href|\/api\//);
  // ไม่มีประวัติ / ไม่มีสิทธิ์เห็นรายการ = ไม่มีส่วนนี้
  assert.equal(sheet({ document: headDoc() }).history, null);
  assert.equal(sheet({ document: headDoc({ access: { ...HEAD, history: false }, state: 'recalled', history: HISTORY }) }).history, null);
});

test('ใบจบแล้ว: ไม่เคยมีเอกสาร = ไม่แสดง · เคยมี = ป้ายถูกแทนที่ + รายการ Rev + "ไม่มีฉบับใหม่" · ไม่มีปุ่ม', () => {
  const ended = [
    request({ cancelledAt: ANSWERED, status: 'cancelled' }),
    request({ closedAt: ANSWERED, status: 'closed' }),
    request({ closedAt: ANSWERED }),
  ];
  for (const req of ended) {
    assert.equal(sheet({ document: headDoc(), request: req }).show, false, 'ไม่เคยออกเอกสาร');
    assert.equal(sheet({ document: headDoc({ send: OK_SEND }), request: req }).show, false);
    assert.equal(sheet({ document: { access: 'none', unknown: true }, request: req }).show, false);

    const view = sheet({ document: headDoc({ state: 'recalled', history: HISTORY, nextDocNo: 'SU-26100001-1', send: OK_SEND }), request: req });
    assert.equal(view.show, true);
    assert.equal(view.placement, 'pinned');
    assert.deepEqual(view.badge, { label: 'ถูกแทนที่', tone: 'warning' });
    assert.deepEqual(view.status, {
      tone: 'neutral', text: 'SU-26100001-0 ถูกแทนที่แล้ว · ใบนี้ปิดแล้ว — ไม่มีฉบับใหม่', items: [], foot: null, action: null,
    });
    assert.deepEqual(view.versions, []);
    assert.equal(view.issue, null);
    assert.equal(view.hint, null);
    assert.equal(view.history.rows.length, 1);
    assert.deepEqual(view.rows, [{ key: 'docNo', label: 'เลขที่', value: 'SU-26100001-0' }]);
    assert.deepEqual(hrefsIn(view), []);
    assert.doesNotMatch(JSON.stringify(view), /ส่งผลอีกครั้ง|SU-26100001-1/, 'ไม่สัญญาฉบับใหม่บนใบที่จบแล้ว');
  }
  // ยกเลิกหลังส่งผล ไม่มีฉบับที่ใช้อยู่ ไม่มีประวัติ (สถานะ missing) — ออกเอกสารไม่ได้แล้ว ไม่มีอะไรให้แสดง
  assert.equal(sheet({ document: headDoc({ state: 'missing', issue: OK_ISSUE }), request: sentRequest({ cancelledAt: ISSUED }) }).show, false);
  // ยกเลิกหลังออกเอกสาร — ฉบับที่ใช้อยู่ยังเปิดได้ตามปกติ
  const kept = sheet({
    document: headDoc({ state: 'ready', current: currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: true } }) }),
    request: sentRequest({ cancelledAt: ISSUED }),
  });
  assert.equal(kept.show, true);
  assert.equal(buttons(kept), 'view | download | none');
});

test('กำลังออก: ปุ่มออกเอกสาร **วาดแต่จาง** (ไม่ซ่อน) · ลิงก์จางทั้งคู่ · หน้านี้ถามซ้ำเอง', () => {
  const view = sheet({ document: headDoc({ state: 'issuing' }), request: sentRequest() });
  assert.equal(view.placement, 'pinned');
  assert.deepEqual(view.badge, { label: 'กำลังออก', tone: 'info' });
  assert.deepEqual(view.status, {
    tone: 'info', text: 'กำลังออกเอกสารของใบนี้ — หน้านี้ตรวจให้เองทุก 15 วินาที', items: [], foot: null, action: null,
  });
  assert.equal(buttons(view), 'blocked | blocked | blocked');
  assert.equal(view.versions[0].preview.label, 'ดูตัวอย่าง');
  assert.deepEqual(view.issue, { allowed: false, confirm: null });
  assert.equal(view.poll, true);
  assert.equal(view.hint, null);
  assert.deepEqual(hrefsIn(view), []);
  // หัวหน้าที่ออกเอกสารของใบนี้ไม่ได้ = ไม่มีปุ่ม (ไม่มีสิทธิ์ = ไม่โชว์)
  const noIssue = sheet({ document: headDoc({ access: HEAD_NO_ISSUE, state: 'issuing' }), request: sentRequest() });
  assert.equal(buttons(noIssue), 'blocked | blocked | none');
});

test('`poll` จริงเฉพาะสถานะกำลังออก', () => {
  const cur = currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: true } });
  for (const [state, extra, req] of [
    ['not_sent', {}, request()], ['recalled', { history: HISTORY }, request()], ['missing', { issue: OK_ISSUE }, sentRequest()],
    ['issued', { current: currentRow() }, sentRequest()], ['frozen', { current: cur }, sentRequest()],
    ['ready', { current: cur }, sentRequest()], ['stale', { current: cur }, sentRequest()],
  ]) {
    assert.equal(sheet({ document: headDoc({ state, ...extra }), request: req }).poll, false, state);
  }
  assert.equal(sheet({ document: headDoc({ state: 'issuing' }), request: sentRequest() }).poll, true);
  assert.equal(sheet({ document: { access: 'none', unknown: true }, request: sentRequest() }).poll, false);
});

const MISSING_BADGE = { label: 'ยังไม่ออก', tone: 'warning' };
const missingDoc = (extra = {}) => headDoc({ state: 'missing', issue: OK_ISSUE, ...extra });

test('ส่งผลแล้วยังไม่มีเอกสาร: บรรทัดปกติ + ปุ่มออกเอกสารกดได้ · บอกเลขถัดไปเมื่อรู้ · หมายเหตุผูกรูป', () => {
  const view = sheet({ document: missingDoc(), request: sentRequest() });
  assert.equal(view.placement, 'pinned');
  assert.deepEqual(view.badge, MISSING_BADGE);
  assert.deepEqual(view.status, {
    tone: 'info', text: 'ส่งผลแล้ว แต่ยังไม่มีเอกสาร — กด “ออกเอกสาร” เพื่อออกเลขที่ SU', items: [], foot: null, action: null,
  });
  assert.equal(buttons(view), 'draft | blocked | enabled');
  assert.equal(view.hint, null, 'คำใบ้ของร่างเป็นของใบที่ยังไม่ส่งผล');
  assert.equal(view.relinkNote, 'ผูกรูปให้ครบก่อนกด “ออกเอกสาร” — ฉบับภายในพิมพ์รูปตามจุดที่ผูกไว้ตอนออก');
  assert.equal(view.recheckOnFiles, true);
  assert.deepEqual(hrefsIn(view), [
    '/api/service/surveys/DR-1/document?version=customer&draft=1&format=html',
    '/api/service/surveys/DR-1/document?version=internal&draft=1&format=html',
  ]);
  const next = sheet({ document: missingDoc({ history: HISTORY, nextDocNo: 'SU-26100001-1' }), request: sentRequest() });
  assert.equal(next.status.text, 'ส่งผลแล้ว แต่ยังไม่มีเอกสาร — กด “ออกเอกสาร” เพื่อออก SU-26100001-1');
  // ตรวจล่วงหน้าไม่สำเร็จ — ยังกดได้ ระบบตรวจอีกครั้งตอนกด
  const unknown = sheet({ document: missingDoc({ issue: { blockers: [], warnings: [], unknown: true } }), request: sentRequest() });
  assert.deepEqual(unknown.status, {
    tone: 'info', text: 'ส่งผลแล้ว แต่ยังไม่มีเอกสาร — ตรวจล่วงหน้าไม่สำเร็จ กดออกเอกสารได้ ระบบตรวจอีกครั้งตอนกด',
    items: [], foot: null, action: null,
  });
  assert.equal(buttons(unknown), 'draft | blocked | enabled');
});

test('ส่งผลแล้วยังไม่มีเอกสาร · เครื่องไม่ใช่ production: ปุ่มออกเอกสารจางพร้อมเหตุ · ร่างยังดูได้', () => {
  const view = sheet({ document: missingDoc({ storeAllowed: false }), request: sentRequest() });
  assert.deepEqual(view.badge, MISSING_BADGE);
  assert.equal(view.status.tone, 'warning');
  assert.equal(view.status.text, 'เครื่องนี้ไม่ใช่ระบบจริง (production) — ออกหรือตรึงเอกสารจากเครื่องทดสอบไม่ได้');
  assert.equal(view.status.text, SURVEY_REPORT_NOT_PRODUCTION, 'คำเดียวกับที่ server ตอบ');
  assert.equal(buttons(view), 'draft | blocked | blocked');
  // production guard พูดก่อนเหตุสดและข้อผิดพลาดที่จำไว้
  const both = sheet({
    document: missingDoc({ storeAllowed: false, issue: { blockers: [{ kind: 'content', text: 'x' }], warnings: [], unknown: false } }),
    request: sentRequest(), local: { round: ANSWERED, issueError: { code: 'timeout', message: 'y', retry: true } },
  });
  assert.equal(both.status.text, SURVEY_REPORT_NOT_PRODUCTION);
  assert.equal(both.status.items.length, 0);
});

test('ส่งผลแล้วยังไม่มีเอกสาร · มีเหตุขวาง: รายการ + ทางออกตามชนิด (ผูกรูปได้เลย · ดึงผลกลับ · ไม่ต้องดึงผลกลับ) · ปุ่มจาง', () => {
  const content = { kind: 'content', text: 'มีรูปจุดที่ยังไม่ได้ผูก 2 รูป — ผูกก่อนส่งผล (Studio 01)' };
  const system = { kind: 'system', text: 'ยังไม่มีข้อมูลบริษัทสำหรับหัวกระดาษ' };
  const doc = (blockers) => missingDoc({ issue: { blockers, warnings: [], unknown: false } });

  const linked = sheet({ document: doc([content, system, { ...content }]), request: sentRequest(), spotsUnlinked: true });
  assert.deepEqual(linked.status, {
    tone: 'warning', text: 'ส่งผลแล้ว แต่ยังออกเอกสารไม่ได้ — ติด 2 ข้อ',
    items: [content.text, system.text],
    foot: 'รูปจุดผูกได้เลยที่ถาด “ยังไม่ได้ผูกจุด” ของพื้นที่นั้น (ไม่ต้องดึงผลกลับ) แล้วกด “ตรวจอีกครั้ง” · เรื่องอื่นต้องดึงผลกลับมาแก้แล้วส่งใหม่',
    action: { kind: 'reload', label: 'ตรวจอีกครั้ง' },
  });
  assert.equal(buttons(linked), 'draft | blocked | blocked');
  assert.ok(linked.issue.confirm, 'กล่องยืนยันยังมีเนื้อ — จอเปิดได้แล้วเห็นปุ่ม "ปิด"');

  const recall = sheet({ document: doc([content, system]), request: sentRequest(), spotsUnlinked: false });
  assert.equal(recall.status.foot, 'ดึงผลกลับมาแก้แล้วส่งใหม่');

  const onlySystem = sheet({ document: doc([system, { kind: 'whatever', text: 'อ่านมาตรฐานเอกสารไม่สำเร็จ' }]), request: sentRequest(), spotsUnlinked: true });
  assert.equal(onlySystem.status.foot, 'แก้ตามรายการแล้วกด “ตรวจอีกครั้ง” — ไม่ต้องดึงผลกลับ', 'ชนิดที่ไม่รู้จัก = เรื่องของระบบ');
  assert.equal(onlySystem.status.text, 'ส่งผลแล้ว แต่ยังออกเอกสารไม่ได้ — ติด 2 ข้อ');
  assert.equal(buttons(onlySystem), 'draft | blocked | blocked');
  // คำของถาดต้องตรงกับที่จอหน้างานเขียน
  assert.ok(linked.status.foot.includes(`“${SPOT_TRAY_LABEL}”`));
});

test('🔑 ลำดับในสถานะ missing: เหตุสดชนะข้อผิดพลาดที่จำไว้ · `blocked` ที่ไม่มีเหตุสดเหลือ = ปุ่มกลับมา · รหัสติดถาวรล็อกปุ่ม', () => {
  const local = (issueError, extra = {}) => ({ round: ANSWERED, issueError, ...extra });
  const blockers = [{ kind: 'system', text: 'ยังไม่มีข้อมูลบริษัทสำหรับหัวกระดาษ' }];

  // เหตุสดจาก server ชนะเสมอ
  const fresh = sheet({
    document: missingDoc({ issue: { blockers, warnings: [], unknown: false } }), request: sentRequest(),
    local: local({ code: 'undecodable', message: 'รูป 1 รูปเปิดไม่ได้', retry: false }),
  });
  assert.equal(fresh.status.text, 'ส่งผลแล้ว แต่ยังออกเอกสารไม่ได้ — ติด 1 ข้อ');

  // 🔴 `blocked` + `retry: false` แล้วหัวหน้าผูกรูปครบ (เหตุสดว่าง) = ปุ่มต้องกดได้ ไม่ค้างล็อก
  const cleared = sheet({
    document: missingDoc(), request: sentRequest(),
    local: local({ code: 'blocked', message: 'ออกเอกสารไม่ได้ — มีรูปจุดที่ยังไม่ได้ผูก 2 รูป', retry: false }),
  });
  assert.deepEqual(cleared.status, {
    tone: 'warning', text: 'ออกเอกสารไม่ได้ — มีรูปจุดที่ยังไม่ได้ผูก 2 รูป', items: [], foot: null, action: null,
  });
  assert.equal(buttons(cleared), 'draft | blocked | enabled');

  for (const error of [
    { code: 'undecodable', message: 'รูป 1 รูปเปิดไม่ได้ — ดึงผลกลับมาอัปใหม่', retry: false },
    { code: 'paper_blocked', message: 'กระดาษล้นหน้า — ดึงผลกลับมาแก้', retry: false },
    { code: 'rpc_failed', message: 'ออกเลขเอกสารไม่สำเร็จ (เลขชนกัน) — แจ้งผู้ดูแลระบบ', retry: false },
  ]) {
    const view = sheet({ document: missingDoc(), request: sentRequest(), local: local(error) });
    assert.equal(view.status.tone, 'warning');
    assert.equal(view.status.text, error.message, 'ประโยคของ server ตามที่ได้มา');
    assert.equal(buttons(view), 'draft | blocked | blocked', error.code);
    /* 🐞 UAT PR-3 (S23 · S33 · S37): ปุ่มที่จางต้องบอกว่าต้องทำอะไรต่อ — กระดาษพิมพ์ไม่ได้แบบถาวรได้บรรทัดทางออกท้ายกล่อง
       · เหตุถาวรอื่นประโยคของ server บอกทางออกในตัวแล้ว (เทสต์ถัดไปล็อกกับค่าคงที่ฝั่ง server) ไม่ต่อซ้ำ */
    assert.equal(view.status.foot, error.code === 'paper_blocked'
      ? 'ดึงผลกลับมาแก้แล้วส่งใหม่ — ถ้าไม่มีอะไรให้แก้ หรือแก้แล้วยังออกไม่ได้ ให้แจ้งผู้ดูแลระบบ' : null, error.code);
    assert.deepEqual(view.status.items, []);
    assert.equal(view.status.action, null, 'ไม่มีปุ่มตรวจซ้ำ — ไม่มี GET ไหนล้างเหตุนี้ให้');
  }
  const retry = sheet({
    document: missingDoc(), request: sentRequest(),
    local: local({ code: 'rpc_failed', message: 'ออกเลขเอกสารไม่สำเร็จ — กดออกเอกสารอีกครั้ง', retry: true }),
  });
  assert.equal(buttons(retry), 'draft | blocked | enabled');
  // 🐞 `paper_blocked` ที่ server บอกว่ากดซ้ำได้ (ตัวพิมพ์เอกสารเปิดไม่ได้ · วัดกระดาษไม่ทัน) — กล่องบอก "กดออกเอกสารอีกครั้ง"
  //    ปุ่มต้องกดได้จริง · ไม่มี GET ไหนล้างข้อผิดพลาดนี้ให้ ⇒ ล็อกไว้ = ทางตันจนกว่าจะโหลดหน้าใหม่
  const paperRetry = 'ตรวจกระดาษของเอกสารไม่สำเร็จ (ตัวพิมพ์เอกสารเปิดไม่ได้) — ยังไม่ได้ออกเลขเอกสาร กดออกเอกสารอีกครั้ง';
  const chromium = sheet({
    document: missingDoc(), request: sentRequest(),
    local: local({ code: 'paper_blocked', message: paperRetry, retry: true }),
  });
  assert.equal(chromium.status.text, paperRetry);
  assert.equal(buttons(chromium), 'draft | blocked | enabled');
  assert.equal(chromium.issue.allowed, true);
  assert.equal(chromium.status.foot, null, 'กดซ้ำได้ = ประโยคของ server บอกทางออกเอง ("กดออกเอกสารอีกครั้ง") ไม่มีบรรทัด "ดึงผลกลับ"');
  // การส่งผลที่ออกเอกสารล้มด้วยเหตุเดียวกัน (จำไว้ใน `sendFailed`) ก็กดออกเอกสารต่อได้
  const chromiumAtSend = sheet({
    document: missingDoc(), request: sentRequest(),
    local: { round: ANSWERED, sendFailed: { code: 'paper_blocked', reason: paperRetry, retry: true } },
  });
  assert.equal(buttons(chromiumAtSend), 'draft | blocked | enabled');
  // เหตุสดจาก server ยังชนะ — กดซ้ำได้ไม่ได้แปลว่าข้ามเหตุที่ขวางอยู่
  const chromiumBlocked = sheet({
    document: missingDoc({ issue: { blockers, warnings: [], unknown: false } }), request: sentRequest(),
    local: local({ code: 'paper_blocked', message: paperRetry, retry: true }),
  });
  assert.equal(buttons(chromiumBlocked), 'draft | blocked | blocked');

  // กดออกเอกสารล้มพูดก่อนการส่งที่ออกเอกสารล้ม · การส่งที่ล้มใช้ `reason`
  const two = sheet({
    document: missingDoc(), request: sentRequest(),
    local: local({ code: 'timeout', message: 'เวลาไม่พอ — กดอีกครั้ง', retry: true }, { sendFailed: { code: 'undecodable', reason: 'รูปเสีย', retry: false } }),
  });
  assert.equal(two.status.text, 'เวลาไม่พอ — กดอีกครั้ง');
  assert.equal(buttons(two), 'draft | blocked | enabled');
  const sendOnly = sheet({
    document: missingDoc(), request: sentRequest(),
    local: { round: ANSWERED, sendFailed: { code: 'undecodable', reason: 'รูป 1 รูปเปิดไม่ได้ — ดึงผลกลับมาอัปใหม่', retry: false } },
  });
  assert.equal(sendOnly.status.text, 'รูป 1 รูปเปิดไม่ได้ — ดึงผลกลับมาอัปใหม่');
  assert.equal(buttons(sendOnly), 'draft | blocked | blocked');
  /* การส่งผลที่ออกเอกสารล้มเพราะกระดาษพิมพ์ไม่ได้ (จำไว้ใน `sendFailed` · S33) ได้บรรทัดทางออกเดียวกับการกดออกเอกสารเอง
     · ใบที่ยังวัดไม่ครบ (ตอบผ่านปุ่มทั่วไปก่อน 24/09) บรรทัดของปุ่มร่างต่อท้ายทางออกเหมือนสาขาอื่น */
  const paperAtSend = { round: ANSWERED, sendFailed: { code: 'paper_blocked', reason: 'กระดาษของเอกสารยังพิมพ์ไม่ได้ — ฉบับลูกค้า: หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ · ยังไม่ได้ออกเลขเอกสาร', retry: false } };
  const stuckAtSend = sheet({ document: missingDoc(), request: sentRequest(), local: paperAtSend });
  assert.equal(stuckAtSend.status.foot, 'ดึงผลกลับมาแก้แล้วส่งใหม่ — ถ้าไม่มีอะไรให้แก้ หรือแก้แล้วยังออกไม่ได้ ให้แจ้งผู้ดูแลระบบ');
  assert.equal(buttons(stuckAtSend), 'draft | blocked | blocked');
  const stuckUnmeasured = sheet({ document: missingDoc(), request: sentRequest(), zones: UNMEASURED, local: paperAtSend });
  assert.equal(stuckUnmeasured.status.foot,
    'ดึงผลกลับมาแก้แล้วส่งใหม่ — ถ้าไม่มีอะไรให้แก้ หรือแก้แล้วยังออกไม่ได้ ให้แจ้งผู้ดูแลระบบ · ดูตัวอย่างได้เมื่อวัดครบทุกพื้นที่ (1/2)');
  // ข้อผิดพลาดที่จำไว้ชนะ "ตรวจล่วงหน้าไม่สำเร็จ" และบรรทัดปกติ
  const overUnknown = sheet({
    document: missingDoc({ issue: { blockers: [], warnings: [], unknown: true } }), request: sentRequest(),
    local: local({ code: 'internal', message: 'ออกเอกสารไม่สำเร็จ — กดออกเอกสารอีกครั้ง', retry: true }),
  });
  assert.equal(overUnknown.status.text, 'ออกเอกสารไม่สำเร็จ — กดออกเอกสารอีกครั้ง');
  // ไม่มีข้อความมากับข้อผิดพลาด = ยังบอกว่าไม่สำเร็จ ไม่ขึ้นกล่องเปล่า
  assert.equal(sheet({ document: missingDoc(), request: sentRequest(), local: local({ code: 'internal', retry: true }) }).status.text, 'ออกเอกสารไม่สำเร็จ');
});

test('กำลังออก + การส่งรอบนี้ออกเอกสารล้ม = missing ทันที (ไม่รอนาฬิกา 180 วิ) · ของรอบอื่นไม่นับ — เทียบเป็นจุดเวลา ไม่ใช่สตริง', () => {
  const sendFailed = { code: 'images_failed', reason: 'ดึงรูปจาก Drive ไม่สำเร็จ — กดออกเอกสารอีกครั้ง', retry: true };
  const doc = headDoc({ state: 'issuing' });
  // `+00:00` ของ PostgREST กับ `Z` ของแอป = จุดเวลาเดียวกัน
  for (const round of [ANSWERED, '2026-10-01T03:04:00+00:00', '2026-10-01T10:04:00.000+07:00']) {
    const view = sheet({ document: doc, request: sentRequest(), local: { round, sendFailed } });
    assert.equal(view.state, 'missing', round);
    assert.deepEqual(view.badge, MISSING_BADGE);
    assert.equal(view.status.text, sendFailed.reason);
    assert.equal(view.poll, false);
    assert.equal(buttons(view), 'draft | blocked | enabled');
    assert.ok(view.issue.confirm);
  }
  for (const round of ['2026-10-01T03:04:01.000Z', '2026-09-30T03:04:00.000Z', null, undefined, '', 'ไม่ใช่วันที่']) {
    const view = sheet({ document: doc, request: sentRequest(), local: { round, sendFailed } });
    assert.equal(view.state, 'issuing', String(round));
    assert.equal(view.poll, true);
  }
  // ของรอบอื่นถูกทิ้งทั้งชุดในสถานะ missing ด้วย (ข้อผิดพลาด · กระดาษ · รายการที่พิมพ์)
  const stale = sheet({
    document: missingDoc(), request: sentRequest(),
    local: { round: '2026-09-30T03:04:00.000Z', sendFailed, issueError: { code: 'undecodable', message: 'เก่า', retry: false } },
  });
  assert.equal(stale.status.text, 'ส่งผลแล้ว แต่ยังไม่มีเอกสาร — กด “ออกเอกสาร” เพื่อออกเลขที่ SU');
  assert.equal(buttons(stale), 'draft | blocked | enabled');
  // ใบที่ยังไม่ตอบไม่มีรอบให้เทียบ
  assert.equal(sheet({ document: doc, request: request(), local: { round: ANSWERED, sendFailed } }).state, 'issuing');
});

test('ส่งผลแล้วยังไม่มีเอกสาร · วัดไม่ครบ: ปุ่มร่างจาง และบรรทัด (n/m) ต่อท้ายกล่องสถานะทุกแบบ', () => {
  const line = 'ดูตัวอย่างได้เมื่อวัดครบทุกพื้นที่ (1/2)';
  const plain = sheet({ document: missingDoc(), request: sentRequest(), zones: UNMEASURED });
  assert.equal(buttons(plain), 'draft-blocked | blocked | enabled');
  assert.equal(plain.status.foot, line);
  assert.deepEqual(hrefsIn(plain), []);
  const blocked = sheet({
    document: missingDoc({ issue: { blockers: [{ kind: 'content', text: 'พื้นที่ Studio 02 ยังไม่มีขนาด' }], warnings: [], unknown: false } }),
    request: sentRequest(), zones: UNMEASURED,
  });
  assert.equal(blocked.status.foot, `ดึงผลกลับมาแก้แล้วส่งใหม่ · ${line}`);
  const failed = sheet({
    document: missingDoc(), request: sentRequest(), zones: UNMEASURED,
    local: { round: ANSWERED, issueError: { code: 'timeout', message: 'เวลาไม่พอ', retry: true } },
  });
  assert.equal(failed.status.foot, line);
  assert.equal(sheet({ document: missingDoc({ storeAllowed: false }), request: sentRequest(), zones: UNMEASURED }).status.foot, line);
  assert.equal(sheet({ document: missingDoc({ issue: { blockers: [], warnings: [], unknown: true } }), request: sentRequest(), zones: UNMEASURED }).status.foot, line);
});

test('ส่งผลแล้วยังไม่มีเอกสาร · หัวหน้าที่ออกเอกสารของใบนี้ไม่ได้: ไม่มีปุ่มร่าง ไม่มีปุ่มออกเอกสาร บอกว่าใครกดได้', () => {
  const view = sheet({ document: headDoc({ access: HEAD_NO_ISSUE, state: 'missing' }), request: sentRequest() });
  assert.deepEqual(view.badge, MISSING_BADGE);
  assert.deepEqual(view.status, { tone: 'info', text: 'หัวหน้าฝ่ายบริการที่ตอบใบนี้ได้เป็นผู้กดออกเอกสาร', items: [], foot: null, action: null });
  assert.equal(buttons(view), 'none | blocked | none');
  assert.equal(view.issue, null);
  assert.deepEqual(hrefsIn(view), []);
});

test('กล่องยืนยันออกเอกสาร: ผลทุกข้อก่อนกด · บอกเลขถัดไป · ผู้อนุมัติ · คำเตือนทีละข้อ + ที่แก้ตามชนิด', () => {
  const plain = sheet({ document: missingDoc(), request: sentRequest() }).issue.confirm;
  assert.deepEqual(plain, {
    title: 'ออกเอกสารประเมินพื้นที่',
    message: 'ออกเอกสารจากผลที่ส่งให้ฝ่ายขายไปแล้ว — ไม่ส่งผลซ้ำ ตัวเลขไม่เปลี่ยน',
    detail: 'ใช้เวลาประมาณ 10–60 วินาที (ดึงรูปและจัดหน้ากระดาษ) — อย่าปิดหน้านี้ระหว่างรอ',
    effects: [
      'ออกเลขเอกสาร SU ใหม่ — เลขถาวร เอกสารที่ออกแล้วแก้ไม่ได้',
      'ตรึงฉบับลูกค้าและฉบับภายในจากข้อมูลในใบตอนนี้ · ผู้ตรวจสอบและอนุมัติบนเอกสาร = หัวหน้า ก (ผู้ส่งผล)',
      'ผู้ขอ (ฝ่ายขาย) ได้รับแจ้งในกระดิ่งและเธรดของคำร้อง — ดาวน์โหลดฉบับลูกค้าได้ที่หน้าคำร้อง',
      'แก้เอกสารหลังออก = ดึงผลกลับแล้วส่งใหม่ (ออกเป็น Rev ถัดไป)',
    ],
    confirmLabel: 'ออกเอกสาร',
    busyLabel: 'กำลังออกเอกสาร…',
  });
  const noteLine = 'หมายเหตุพื้นที่ 1 มีคำว่า "เครื่อง" — เอกสารฉบับลูกค้าไม่ระบุเครื่อง รุ่น หรือราคา ตรวจข้อความก่อนส่ง';
  const nameLine = 'ชื่อลูกค้า มีอักขระที่เอกสารพิมพ์ไม่ได้ (😀 U+1F600) — จะขึ้นเป็นกล่องสี่เหลี่ยม';
  const full = sheet({
    document: missingDoc({ nextDocNo: 'SU-26100001-1', issue: { blockers: [], warnings: [noteLine, nameLine, noteLine], unknown: false } }),
    request: sentRequest({ answeredByName: '  ' }),
  }).issue.confirm;
  assert.deepEqual(full.effects, [
    'ออกเอกสาร SU-26100001-1 (Rev ถัดไปของเลขเดิม) — เลขถาวร เอกสารที่ออกแล้วแก้ไม่ได้',
    'ตรึงฉบับลูกค้าและฉบับภายในจากข้อมูลในใบตอนนี้',
    'ผู้ขอ (ฝ่ายขาย) ได้รับแจ้งในกระดิ่งและเธรดของคำร้อง — ดาวน์โหลดฉบับลูกค้าได้ที่หน้าคำร้อง',
    `ฉบับลูกค้าจะพิมพ์ตามที่กรอกไว้ — ${noteLine}`,
    `ฉบับลูกค้าจะพิมพ์ตามที่กรอกไว้ — ${nameLine}`,
    'หมายเหตุพื้นที่แก้ไม่ได้ขณะผลล็อกอยู่ — ถ้าต้องแก้ ปิดกล่องนี้แล้วดึงผลกลับมาแก้ก่อน',
    'ช่องอื่นแก้ที่ต้นทางของช่องนั้น (ทะเบียนลูกค้า · ไซต์ · บริษัท ไม่ต้องดึงผลกลับ · ชื่อพื้นที่ต้องดึงผลกลับ) แล้วเปิดกล่องนี้ใหม่',
    'แก้เอกสารหลังออก = ดึงผลกลับแล้วส่งใหม่ (ออกเป็น Rev ถัดไป)',
  ]);
  assert.equal(new Set(full.effects).size, full.effects.length, 'จอใช้ข้อความเป็น key ของข้อ — ต้องไม่ซ้ำ');
  // คำนำของบรรทัดคำเตือนคำเดียวกับโมดัลส่งผล
  const sendLine = surveySendConfirm({ issuesDocument: true, warnings: [noteLine] }).effects.find((line) => line.endsWith(noteLine));
  assert.equal(full.effects[3], sendLine);
  // มีแต่บรรทัดของช่องอื่น = ไม่มีข้อของหมายเหตุพื้นที่
  const other = sheet({ document: missingDoc({ issue: { blockers: [], warnings: [nameLine], unknown: false } }), request: sentRequest() }).issue.confirm;
  assert.ok(other.effects.every((line) => !line.startsWith('หมายเหตุพื้นที่แก้ไม่ได้')));
  assert.ok(other.effects.some((line) => line.startsWith('ช่องอื่นแก้ที่ต้นทาง')));
});

const ISSUED_BADGE = { label: 'ออกแล้ว', tone: 'success' };

test('ออกแล้ว · ไฟล์ยังไม่ถูกจัดทำ: จัดทำตอนเปิดครั้งแรก + ทางสำรอง · ลิงก์เปิดได้ทั้งคู่ · แถวเลขที่/ออกเมื่อ/ออกโดย', () => {
  const view = sheet({ document: headDoc({ state: 'issued', current: currentRow() }), request: sentRequest() });
  assert.equal(view.placement, 'pinned');
  assert.deepEqual(view.badge, ISSUED_BADGE);
  assert.deepEqual(view.rows, [
    { key: 'docNo', label: 'เลขที่', value: 'SU-26100001-1' },
    { key: 'issuedAt', label: 'ออกเมื่อ', value: '01/10/2026 10:05' },
    { key: 'issuedBy', label: 'ออกโดย', value: 'หัวหน้า ก' },
  ]);
  const waiting = {
    tone: 'info', text: 'ไฟล์ฉบับนี้จัดทำตอนเปิดครั้งแรก — รอประมาณ 10 วินาที', items: [],
    foot: 'ถ้าเปิดไม่ได้ซ้ำด้วยเหตุเดิม: ดึงผลกลับมาแก้แล้วส่งใหม่ หรือแจ้งผู้ดูแลระบบ', action: null,
  };
  assert.deepEqual(view.status, waiting);
  assert.deepEqual(view.versions.map((v) => v.status), [waiting, waiting]);
  assert.equal(buttons(view), 'view | download | none');
  assert.equal(buttons(view, 'internal'), 'view | download | none');
  assert.deepEqual(view.versions.map((v) => [v.key, v.label, v.note]), [
    ['customer', 'ฉบับลูกค้า', 'ไม่มีจุดติดตั้งและข้อมูลภายใน · ฝ่ายขายผู้ขอดาวน์โหลดได้ที่หน้าคำร้อง'],
    ['internal', 'ฉบับภายใน', 'มีแถบ “ฉบับภายใน — ห้ามส่งลูกค้า” ทุกหน้า · เฉพาะหัวหน้าฝ่ายบริการและผู้บริหาร'],
  ]);
  assert.deepEqual(view.versions[0].preview, { label: 'ดูตัวอย่าง', href: '/api/service/surveys/DR-1/document?version=customer', blocked: false });
  assert.deepEqual(view.versions[1].download, { label: 'ดาวน์โหลด PDF', href: '/api/service/surveys/DR-1/document?version=internal&download=1', blocked: false });
  assert.equal(view.issue, null);
  assert.equal(view.hint, null);
  assert.equal(view.relinkNote,
    'เอกสาร SU-26100001-1 ออกแล้ว — ผูกหรือย้ายรูปจุดตอนนี้ไม่เปลี่ยนเอกสารฉบับนั้น · ถ้าต้องให้เอกสารเปลี่ยน ให้ดึงผลกลับมาแก้แล้วส่งใหม่ (ออกเป็น Rev ถัดไป)');
  // ค่าว่างพิมพ์ขีด
  const blank = sheet({ document: headDoc({ state: 'issued', current: currentRow({ issuedAt: null, issuedByName: null }) }), request: sentRequest() });
  assert.deepEqual(blank.rows.map((r) => r.value), ['SU-26100001-1', '—', '—']);
});

test('ออกแล้ว · ระหว่าง/หลัง POST ตามหลัง: กำลังจัดทำ = ลิงก์จาง · มีเหตุ = พิมพ์เหตุตามที่ได้มา ไม่ต่อท้าย + ทางสำรองคนละบรรทัด', () => {
  const doc = headDoc({ state: 'issued', current: currentRow() });
  const busy = sheet({ document: doc, request: sentRequest(), local: { round: ANSWERED, paper: { busy: true } } });
  assert.deepEqual(busy.status, { tone: 'info', text: 'กำลังจัดทำไฟล์ PDF…', items: [], foot: null, action: null });
  assert.equal(buttons(busy), 'blocked | blocked | none');
  assert.equal(buttons(busy, 'internal'), 'blocked | blocked | none');
  assert.deepEqual(hrefsIn(busy), []);

  const reason = 'จัดทำกระดาษของเอกสารไม่สำเร็จ — แจ้งผู้ดูแลระบบ';
  const failed = sheet({ document: doc, request: sentRequest(), local: { round: ANSWERED, paper: { busy: false, reason } } });
  assert.deepEqual(failed.status, {
    tone: 'warning', text: reason, items: [],
    foot: 'ถ้ากด “ดาวน์โหลด PDF” แล้วขึ้นเหตุเดิม: ดึงผลกลับมาแก้แล้วส่งใหม่ (ออกเป็น Rev ถัดไป) หรือแจ้งผู้ดูแลระบบ',
    action: null,
  });
  assert.equal(buttons(failed), 'view | download | none', 'ดาวน์โหลด = ลองใหม่');
  // ของรอบอื่นไม่นับ
  const other = sheet({ document: doc, request: sentRequest(), local: { round: '2026-09-01T00:00:00.000Z', paper: { busy: true, reason } } });
  assert.equal(other.status.text, 'ไฟล์ฉบับนี้จัดทำตอนเปิดครั้งแรก — รอประมาณ 10 วินาที');
  assert.equal(buttons(other), 'view | download | none');
});

test('ออกแล้ว · เครื่องไม่ใช่ production และไฟล์ยังไม่มี: ลิงก์จางพร้อมเหตุ — แม้จอจะจำเหตุของกระดาษไว้', () => {
  const doc = headDoc({ state: 'issued', storeAllowed: false, current: currentRow() });
  for (const local of [null, { round: ANSWERED, paper: { busy: true } }, { round: ANSWERED, paper: { busy: false, reason: SURVEY_REPORT_NOT_PRODUCTION } }]) {
    const view = sheet({ document: doc, request: sentRequest(), local });
    assert.deepEqual(view.badge, ISSUED_BADGE);
    assert.deepEqual(view.status, {
      tone: 'warning', text: 'ไฟล์ฉบับนี้ยังไม่ถูกจัดทำ — จัดทำได้บนระบบจริง (production) เท่านั้น', items: [], foot: null, action: null,
    });
    assert.equal(buttons(view), 'blocked | blocked | none');
    assert.deepEqual(hrefsIn(view), []);
  }
  // ไฟล์ที่จัดทำไว้แล้วเสิร์ฟได้ทุกเครื่อง
  const ready = sheet({
    document: headDoc({ state: 'ready', storeAllowed: false, current: currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: true } }) }),
    request: sentRequest(),
  });
  assert.equal(ready.status, null);
  assert.equal(buttons(ready), 'view | download | none');
});

test('⭐ ตรึงแล้ว มีไฟล์ฉบับลูกค้าอย่างเดียว: กล่องสถานะเปลี่ยนตามฉบับที่เลือก · ครบสองฉบับ = ไม่มีกล่อง', () => {
  const frozen = sheet({
    document: headDoc({ state: 'frozen', current: currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: false } }) }),
    request: sentRequest(), local: { round: ANSWERED, paper: { busy: true } },
  });
  assert.deepEqual(frozen.badge, ISSUED_BADGE);
  const [customer, internal] = frozen.versions;
  assert.equal(customer.status, null, 'ไฟล์ฉบับลูกค้ามีแล้ว — ไม่มีอะไรต้องบอก');
  assert.equal(frozen.status, null, 'กล่องชั้นนอก = ของฉบับแรก (ที่เลือกไว้ตั้งต้น)');
  assert.equal(buttons(frozen, 'customer'), 'view | download | none');
  assert.equal(internal.status.text, 'กำลังจัดทำไฟล์ PDF…');
  assert.equal(buttons(frozen, 'internal'), 'blocked | blocked | none');

  const ready = sheet({
    document: headDoc({ state: 'ready', current: currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: true } }) }),
    request: sentRequest(), local: { round: ANSWERED, paper: { busy: true, reason: 'เก่า' } },
  });
  assert.equal(ready.status, null);
  assert.deepEqual(ready.versions.map((v) => v.status), [null, null]);
  assert.equal(buttons(ready, 'internal'), 'view | download | none');
  assert.equal(ready.recheckOnFiles, false);
});

test('รายการ "เอกสารฉบับนี้พิมพ์ตามนี้": เฉพาะตอนมีฉบับที่ใช้อยู่ และเป็นบรรทัดของคำตอบรอบนี้', () => {
  const lines = ['พื้นที่ Studio 01: มีภาพผัง 3 รูป — เอกสารพิมพ์รูปล่าสุดรูปเดียว', 'จุด A: มีรูป 4 รูป — พิมพ์ 2 รูปแรก'];
  const ready = headDoc({ state: 'ready', current: currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: true } }) });
  assert.deepEqual(sheet({ document: ready, request: sentRequest(), local: { round: ANSWERED, printed: [...lines, lines[0], '', 7] } }).printed, {
    title: 'เอกสารฉบับนี้พิมพ์ตามนี้', items: lines,
  });
  assert.equal(sheet({ document: ready, request: sentRequest(), local: { round: ANSWERED, printed: [] } }).printed, null);
  assert.equal(sheet({ document: ready, request: sentRequest(), local: { round: '2026-09-01T00:00:00.000Z', printed: lines } }).printed, null, 'ของรอบอื่น');
  assert.equal(sheet({ document: ready, request: sentRequest() }).printed, null);
  // ไม่มีฉบับที่ใช้อยู่ = ไม่มีรายการ แม้จอจะจำบรรทัดไว้
  for (const [state, extra] of [['missing', { issue: OK_ISSUE }], ['issuing', {}], ['stale', { current: currentRow() }]]) {
    assert.equal(sheet({ document: headDoc({ state, ...extra }), request: sentRequest(), local: { round: ANSWERED, printed: lines } }).printed, null, state);
  }
});

test('ค้างผิดรอบ (stale): ป้ายแดง "ใช้ไม่ได้" · ประโยคเดียวกับ server · ลิงก์จางทั้งคู่ · ไม่มีปุ่มออกเอกสาร', () => {
  const view = sheet({
    document: headDoc({ state: 'stale', current: currentRow({ frozenAt: ISSUED, ready: { customer: false, internal: false } }) }),
    request: sentRequest(),
  });
  assert.deepEqual(view.badge, { label: 'ใช้ไม่ได้', tone: 'danger' });
  assert.deepEqual(view.status, {
    tone: 'danger', text: 'เอกสารฉบับที่ใช้อยู่ไม่ตรงกับผลที่ส่งรอบล่าสุด — แจ้งผู้ดูแลระบบ', items: [], foot: null, action: null,
  });
  assert.equal(buttons(view), 'blocked | blocked | none');
  assert.equal(buttons(view, 'internal'), 'blocked | blocked | none');
  assert.equal(view.rows[0].value, 'SU-26100001-1');
  assert.equal(view.relinkNote, null);
  assert.deepEqual(hrefsIn(view), []);
});

// ══ กติกากันรั่ว ══════════════════════════════════════════════════════════

/* ทุกสถานะ × ทุกรูปสิทธิ์ × เครื่อง × วัดครบ/ไม่ครบ — ใช้ร่วมกันทั้งสองจอ */
const SWEEP_STATES = [
  ['not_sent', {}, request()],
  ['not_sent', { send: { blockers: ['x'], warnings: ['y'], unknown: false } }, request()],
  ['recalled', { history: HISTORY, nextDocNo: 'SU-26100001-1' }, request()],
  ['recalled', { history: HISTORY }, request({ closedAt: ANSWERED, status: 'closed' })],
  ['issuing', {}, sentRequest()],
  ['missing', { issue: OK_ISSUE }, sentRequest()],
  ['missing', { issue: { blockers: [{ kind: 'content', text: 'x' }], warnings: [], unknown: false } }, sentRequest()],
  ['issued', { current: currentRow() }, sentRequest()],
  ['frozen', { current: currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: false } }) }, sentRequest()],
  ['ready', { current: currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: true } }) }, sentRequest()],
  ['ready', { current: currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: true } }), history: HISTORY }, sentRequest({ closedAt: ISSUED, status: 'closed' })],
  ['stale', { current: currentRow() }, sentRequest()],
  [null, { unknown: true }, sentRequest()],
];
const SWEEP_ACCESS = [HEAD, HEAD_NO_ISSUE, EXEC, SALES, { customer: false, internal: false, issue: false, draft: false, history: true }];

test('🔴 ไม่มี `version=internal` ที่ไหนในผลถ้าไม่มี `access.internal` — ทุกสถานะ ทุกรูปสิทธิ์ ทั้งสองจอ', () => {
  let checked = 0;
  for (const [state, extra, req] of SWEEP_STATES) {
    for (const access of SWEEP_ACCESS) {
      for (const storeAllowed of [true, false]) {
        const document = { ...headDoc({ state, ...extra }), access, storeAllowed };
        const views = [
          sheet({ document, request: req, local: { round: ANSWERED, paper: { busy: false, reason: 'x' }, printed: ['y'] } }),
          sheet({ document, request: req, zones: UNMEASURED }),
          surveyRequestDocumentView({ surveyDocument: document, request: req, viewer: { isRequesterSide: true, canDecide: true, canOpenSheet: true } }),
        ];
        for (const view of views) {
          const text = JSON.stringify(view);
          if (access.internal !== true) {
            assert.doesNotMatch(text, /version=internal/, `${state} ${JSON.stringify(access)}`);
            assert.doesNotMatch(text, /ฉบับภายในห้ามส่งลูกค้า/);
          }
          if (access.customer !== true) assert.doesNotMatch(text, /version=customer/);
          checked += 1;
        }
      }
    }
  }
  assert.equal(checked, SWEEP_STATES.length * SWEEP_ACCESS.length * 2 * 3);
});

test('🔴 สถานะที่ไม่มีฉบับที่ใช้อยู่ไม่มี href นอกจากลิงก์ฉบับร่าง · ลิงก์ร่างมีเฉพาะ `access.draft` และวัดครบ', () => {
  const noFile = ['not_sent', 'recalled', 'issuing', 'missing', 'stale'];
  for (const [state, extra, req] of SWEEP_STATES.filter(([s]) => noFile.includes(s))) {
    for (const access of SWEEP_ACCESS) {
      for (const zones of [MEASURED, UNMEASURED]) {
        const view = sheet({ document: { ...headDoc({ state, ...extra }), access }, request: req, zones });
        const hrefs = hrefsIn(view);
        const mayDraft = access.draft === true && zones === MEASURED && ['not_sent', 'recalled', 'missing'].includes(state);
        for (const href of hrefs) {
          assert.match(href, /&draft=1&format=html$/, `${state}: ${href}`);
          assert.equal(mayDraft, true, `${state} ${JSON.stringify(access)}: ${href}`);
        }
        if (!mayDraft) assert.deepEqual(hrefs, [], state);
      }
    }
  }
  // ร่างของใบที่จบแล้วไม่มี (ไม่มีปุ่มเลย)
  const ended = sheet({ document: headDoc({ state: 'recalled', history: HISTORY }), request: request({ cancelledAt: ANSWERED }) });
  assert.deepEqual(hrefsIn(ended), []);
  // สิทธิ์ร่างแต่ไม่มีสิทธิ์ฉบับภายใน (รูปที่ server ไม่ให้วันนี้) — ยังไม่มีทางได้ร่างของฉบับภายใน
  const odd = sheet({ document: headDoc({ access: { ...HEAD, internal: false } }) });
  assert.deepEqual(hrefsIn(odd), ['/api/service/surveys/DR-1/document?version=customer&draft=1&format=html']);
});

// ══ บล็อกบนหน้าคำร้อง — ตาราง §5.1 ═══════════════════════════════════════

const REQUESTER = { isRequesterSide: true, canDecide: false, canOpenSheet: false };
const HEAD_VIEWER = { isRequesterSide: false, canDecide: true, canOpenSheet: true };
const EXEC_VIEWER = { isRequesterSide: false, canDecide: false, canOpenSheet: false };
const PLANNER = { isRequesterSide: false, canDecide: false, canOpenSheet: true };
const block = (surveyDocument, req = sentRequest(), viewer = REQUESTER) => surveyRequestDocumentView({ surveyDocument, request: req, viewer });
const BLOCK_KEYS = ['state', 'badge', 'docNo', 'issuedText', 'issuedByName', 'text', 'foot', 'waitText', 'buttons', 'sheetLink'];
const READY_CURRENT = currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: true } });

test('หน้าคำร้อง: ไม่มีบล็อก — ไม่มีคีย์ · ไม่มีสิทธิ์ · ยังไม่ส่งผล · จบแล้วไม่เคยมีเอกสาร · ไม่ล้มกับ payload แปลก', () => {
  for (const doc of [null, undefined, 'none', {}, [], { access: 'none' }, { access: 'none', voids: 'SU-1' }, bareDoc(SALES), headDoc()]) {
    for (const viewer of [REQUESTER, HEAD_VIEWER, EXEC_VIEWER, PLANNER, {}, undefined]) {
      assert.equal(surveyRequestDocumentView({ surveyDocument: doc, request: sentRequest(), viewer }), null, JSON.stringify(doc));
    }
  }
  assert.equal(surveyRequestDocumentView(), null);
  // จบแล้วไม่เคยมีเอกสาร — ยกเลิกหลังส่งผลโดยไม่มีเอกสาร (ออกเอกสารไม่ได้แล้ว บอกให้ไปขอ = ชี้ทางตัน)
  assert.equal(block(bareDoc(SALES, { state: 'missing' }), sentRequest({ cancelledAt: ISSUED, status: 'cancelled' })), null);
  assert.equal(block(headDoc({ state: 'missing' }), sentRequest({ cancelledAt: ISSUED, status: 'cancelled' }), HEAD_VIEWER), null);
});

test('🔴 หน้าคำร้อง · Planner ไม่มีบล็อกทุกกรณี — รวมตอนอ่านเอกสารไม่สำเร็จ', () => {
  for (const doc of [
    { access: 'none', voids: 'SU-26100001-1', unknown: true }, { access: 'none', voids: null, unknown: true },
    { access: 'none', unknown: true }, { access: 'none', voids: 'SU-26100001-1' },
  ]) {
    assert.equal(block(doc, sentRequest(), PLANNER), null, JSON.stringify(doc));
    assert.equal(block(doc, sentRequest(), EXEC_VIEWER), null, 'ผู้บริหารก็ไม่ได้บล็อกไม่ทราบ (ความเสี่ยงที่รับไว้ · โหลดใหม่คือทางออก)');
  }
});

test('หน้าคำร้อง · ไม่ทราบ: บอกเฉพาะใบที่ตอบแล้ว และเฉพาะฝั่งผู้ขอกับหัวหน้า · ไม่มีปุ่ม · ไม่เคยขึ้น "ยังไม่มีเอกสาร"', () => {
  const expected = {
    state: 'unknown', badge: { label: 'ไม่ทราบ', tone: 'neutral' }, docNo: null, issuedText: null, issuedByName: null,
    text: { tone: 'warning', text: 'อ่านสถานะเอกสารประเมินไม่สำเร็จ — ยังไม่ทราบว่ามีเอกสารหรือไม่ · ลองโหลดหน้าใหม่' },
    foot: null, waitText: null, buttons: [], sheetLink: false,
  };
  assert.deepEqual(block({ access: 'none', unknown: true }, sentRequest(), REQUESTER), expected);
  assert.deepEqual(block({ access: 'none', unknown: true }, sentRequest(), HEAD_VIEWER), expected);
  // มีสิทธิ์ (access เป็นออบเจ็กต์) แต่อ่านแถวไม่สำเร็จ — ทุกคนที่มีสิทธิ์ได้บล็อกนี้ รวมผู้บริหาร
  assert.deepEqual(block(bareDoc(EXEC, { state: null, unknown: true }), sentRequest(), EXEC_VIEWER), expected);
  assert.deepEqual(block(bareDoc(SALES, { state: 'อะไรใหม่' }), sentRequest(), REQUESTER), expected);
  assert.deepEqual(Object.keys(expected), BLOCK_KEYS);
  // ใบที่ยังไม่ตอบ = ไม่มีเอกสารให้ถามหา
  assert.equal(block({ access: 'none', unknown: true }, request(), REQUESTER), null);
  assert.equal(block(bareDoc(SALES, { state: null, unknown: true }), request(), REQUESTER), null);
});

test('หน้าคำร้อง · ออกแล้ว: ฝ่ายขายได้ปุ่มเดียว (ฉบับลูกค้า) · คนที่มีสิทธิ์ภายในได้ปุ่มละฉบับ · บรรทัดใต้ปุ่มตามสิทธิ์', () => {
  const sales = block(bareDoc(SALES, { state: 'ready', current: READY_CURRENT }));
  assert.deepEqual(sales, {
    state: 'ready', badge: { label: 'ออกแล้ว', tone: 'success' },
    docNo: 'SU-26100001-1', issuedText: '01/10/2026 10:05', issuedByName: 'หัวหน้า ก',
    text: null,
    foot: 'ดาวน์โหลดแล้วส่งให้ลูกค้าเอง — ระบบไม่ส่งอีเมลหรือลิงก์ให้ลูกค้า',
    waitText: null,
    buttons: [{ id: 'customer', label: 'ดาวน์โหลด PDF', href: '/api/service/surveys/DR-1/document?version=customer&download=1', ready: true, blocked: null }],
    sheetLink: false,
  });
  assert.deepEqual(Object.keys(sales), BLOCK_KEYS);
  const exec = block(bareDoc(EXEC, { state: 'ready', current: READY_CURRENT }), sentRequest(), EXEC_VIEWER);
  assert.deepEqual(exec.buttons, [
    { id: 'customer', label: 'ดาวน์โหลด PDF ฉบับลูกค้า', href: '/api/service/surveys/DR-1/document?version=customer&download=1', ready: true, blocked: null },
    { id: 'internal', label: 'ดาวน์โหลด PDF ฉบับภายใน', href: '/api/service/surveys/DR-1/document?version=internal&download=1', ready: true, blocked: null },
  ]);
  assert.equal(exec.foot, 'ดาวน์โหลดแล้วส่งให้ลูกค้าเอง — ระบบไม่ส่งอีเมลหรือลิงก์ให้ลูกค้า · ฉบับภายในห้ามส่งลูกค้า');
  // ใบที่จบครบ (ส่งผลแล้ว ฝ่ายขายปิดเรื่อง) ยังดาวน์โหลดได้ · ค่าว่างพิมพ์ขีด
  const closed = block(bareDoc(SALES, { state: 'ready', current: { ...READY_CURRENT, issuedAt: null, issuedByName: '' } }),
    sentRequest({ closedAt: ISSUED, status: 'closed' }));
  assert.equal(closed.buttons[0].blocked, null);
  assert.deepEqual([closed.issuedText, closed.issuedByName], ['—', '—']);
  // หน้านี้ไม่มีปุ่ม "ออกเอกสาร" (ป้ายนี้บนหน้าคำร้องหมายถึงเปิดกระดาษ PDR)
  for (const b of [...sales.buttons, ...exec.buttons]) assert.doesNotMatch(b.label, /ออกเอกสาร/);
});

test('หน้าคำร้อง · ออกแล้วไฟล์ยังไม่ถูกจัดทำ: ปุ่มยังกดได้พร้อม `ready: false` · บอกให้รอ + ช่องทางแจ้งที่ใช้ได้จริง', () => {
  const issued = currentRow();
  const open = block(bareDoc(SALES, { state: 'issued', current: issued }));
  assert.deepEqual(open.buttons, [
    { id: 'customer', label: 'ดาวน์โหลด PDF', href: '/api/service/surveys/DR-1/document?version=customer&download=1', ready: false, blocked: null },
  ]);
  assert.deepEqual(open.text, {
    tone: 'info', text: 'เปิดครั้งแรกรอประมาณ 10 วินาที (ระบบจัดทำไฟล์) · ถ้าเปิดไม่ได้ แจ้งหัวหน้าฝ่ายบริการในเธรดด้านล่าง',
  });
  assert.equal(open.foot, 'ดาวน์โหลดแล้วส่งให้ลูกค้าเอง — ระบบไม่ส่งอีเมลหรือลิงก์ให้ลูกค้า');
  // 🐞 UAT R02: บรรทัดรอหลังกด (จอพิมพ์ใต้ปุ่ม + เป็นเหตุของปุ่มที่ถูกล็อก) — บอกว่าไฟล์กำลังเปิดอยู่แล้ว กดซ้ำเฉพาะเมื่อไม่ขึ้น
  //    และใช้ **ตัวเลขเดียว** กับกล่องแจ้งที่พิมพ์อยู่เหนือปุ่ม (เดิม 10 วินาทีกับ 15 วินาทีข้างกัน)
  assert.equal(open.waitText, 'ไฟล์กำลังเปิดในแท็บใหม่ — รอประมาณ 10 วินาที · กดอีกครั้งเฉพาะเมื่อไฟล์ไม่ขึ้น');
  const seconds = (text) => [...text.matchAll(/(\d+) วินาที/g)].map((m) => m[1]);
  assert.deepEqual(seconds(open.text.text), ['10']);
  assert.deepEqual(seconds(open.waitText), seconds(open.text.text), 'กล่องแจ้งกับบรรทัดรอบอกเวลารอเดียวกัน');
  assert.doesNotMatch(open.waitText, /แล้วกดอีกครั้ง/, 'ไม่สั่งให้กดซ้ำ — การกดครั้งแรกเปิดไฟล์ไปแล้ว');
  // ใบปิดแล้ว เธรดไม่รับข้อความ · ผู้บริหารไม่ใช่สองฝ่ายของใบ ⇒ "โดยตรง"
  const closed = block(bareDoc(SALES, { state: 'issued', current: issued }), sentRequest({ closedAt: ISSUED, status: 'closed' }));
  assert.equal(closed.text.text, 'เปิดครั้งแรกรอประมาณ 10 วินาที (ระบบจัดทำไฟล์) · ถ้าเปิดไม่ได้ แจ้งหัวหน้าฝ่ายบริการโดยตรง');
  const exec = block(bareDoc(EXEC, { state: 'frozen', current: currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: false } }) }), sentRequest(), EXEC_VIEWER);
  assert.deepEqual(exec.buttons.map((b) => [b.id, b.ready, b.blocked]), [['customer', true, null], ['internal', false, null]]);
  assert.equal(exec.text.text, 'เปิดครั้งแรกรอประมาณ 10 วินาที (ระบบจัดทำไฟล์) · ถ้าเปิดไม่ได้ แจ้งหัวหน้าฝ่ายบริการโดยตรง');
  // ฝ่ายขายบนใบที่ไฟล์ฉบับลูกค้ามีแล้ว = ไม่มีอะไรต้องรอ (ฉบับภายในไม่เกี่ยวกับเขา)
  const sales = block(bareDoc(SALES, { state: 'frozen', current: currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: false } }) }));
  assert.equal(sales.text, null);
  assert.equal(sales.buttons[0].ready, true);
  // บรรทัดรอมีเมื่อมีปุ่มที่กดได้และไฟล์ยังไม่ถูกจัดทำเท่านั้น (ไฟล์พร้อมครบ = ไม่มีอะไรให้รอ)
  assert.deepEqual([closed.waitText, exec.waitText, sales.waitText], [open.waitText, open.waitText, null]);
  for (const view of [open, closed, exec, sales]) assert.equal(view.sheetLink, false, 'คนที่ออกเอกสารไม่ได้ไม่มีลิงก์ไปใบประเมิน');
});

test('🐞 หน้าคำร้อง · ออกแล้วไฟล์ยังไม่ถูกจัดทำ · หัวหน้าฝ่าย: ไม่ถูกบอกให้ "แจ้งหัวหน้าฝ่ายบริการ" — ได้ทางแก้ที่ใบประเมิน + ลิงก์', () => {
  const headText = 'เปิดครั้งแรกรอประมาณ 10 วินาที (ระบบจัดทำไฟล์) · ถ้าเปิดไม่ได้ซ้ำด้วยเหตุเดิม: ดึงผลกลับมาแก้แล้วส่งใหม่ที่ใบประเมิน หรือแจ้งผู้ดูแลระบบ';
  for (const state of ['issued', 'frozen']) {
    const head = block(headDoc({ state, current: currentRow(state === 'frozen' ? { frozenAt: ISSUED, ready: { customer: true, internal: false } } : {}) }),
      sentRequest(), HEAD_VIEWER);
    assert.deepEqual(head.text, { tone: 'info', text: headText }, state);
    assert.doesNotMatch(head.text.text, /แจ้งหัวหน้าฝ่ายบริการ/, 'หัวหน้าคือคนที่ประโยคของคนอื่นส่งไปหา');
    assert.equal(head.sheetLink, true, `${state}: ทางแก้ (ดึงผลกลับ · ส่งใหม่) อยู่ที่ใบประเมิน`);
    assert.equal(head.buttons.length, 2);
    assert.ok(head.buttons.every((b) => b.blocked === null && !!b.href), 'ปุ่มยังกดได้ — GET แรกเป็นคนจัดทำไฟล์');
    assert.deepEqual(Object.keys(head), BLOCK_KEYS);
  }
  // ทางออกเป็นชุดเดียวกับบรรทัดสำรองของส่วนเอกสารบนใบประเมิน (สองจอไม่บอกหัวหน้าคนละทาง)
  const sheet = surveyDocumentView({
    document: headDoc({ state: 'issued', current: currentRow() }), request: sentRequest(), zones: [], canDecide: true,
  });
  assert.equal(sheet.status.foot, 'ถ้าเปิดไม่ได้ซ้ำด้วยเหตุเดิม: ดึงผลกลับมาแก้แล้วส่งใหม่ หรือแจ้งผู้ดูแลระบบ');
  assert.ok(headText.includes('ดึงผลกลับมาแก้แล้วส่งใหม่') && headText.endsWith('หรือแจ้งผู้ดูแลระบบ'));
  // หัวหน้าที่เปิดใบประเมินไม่ได้: ประโยคเดิม ไม่มีลิงก์ · ผู้ขอที่บังเอิญเป็นหัวหน้า (CD/CM) ก็ได้ประโยคของหัวหน้า ไม่ใช่ "ในเธรดด้านล่าง"
  const noSheet = block(headDoc({ state: 'issued', current: currentRow() }), sentRequest(), { ...HEAD_VIEWER, canOpenSheet: false });
  assert.equal(noSheet.text.text, headText);
  assert.equal(noSheet.sheetLink, false);
  const headRequester = block(headDoc({ state: 'issued', current: currentRow() }), sentRequest(), { ...HEAD_VIEWER, isRequesterSide: true });
  assert.equal(headRequester.text.text, headText);
  // ไฟล์พร้อมครบ = ไม่มีอะไรต้องรอ ไม่มีลิงก์ · เครื่องที่จัดทำไฟล์ไม่ได้ = เหตุของเครื่อง ไม่มีลิงก์ (ไปใบประเมินก็จัดทำไม่ได้)
  const ready = block(headDoc({ state: 'ready', current: READY_CURRENT }), sentRequest(), HEAD_VIEWER);
  assert.deepEqual([ready.text, ready.sheetLink], [null, false]);
  const off = block(headDoc({ state: 'issued', storeAllowed: false, current: currentRow() }), sentRequest(), HEAD_VIEWER);
  assert.equal(off.text.text, 'ไฟล์ยังไม่ถูกจัดทำ — จัดทำได้บนระบบจริง (production) เท่านั้น');
  assert.equal(off.sheetLink, false);
});

test('หน้าคำร้อง · เครื่องไม่ใช่ production และไฟล์ยังไม่มี: ปุ่มของไฟล์นั้นจางพร้อมเหตุ · ไฟล์ที่มีแล้วยังเปิดได้', () => {
  const off = 'ไฟล์ยังไม่ถูกจัดทำ — จัดทำได้บนระบบจริง (production) เท่านั้น';
  const sales = block(bareDoc(SALES, { state: 'issued', storeAllowed: false, current: currentRow() }));
  assert.deepEqual(sales.text, { tone: 'warning', text: off });
  assert.deepEqual(sales.buttons, [{ id: 'customer', label: 'ดาวน์โหลด PDF', href: null, ready: false, blocked: off }]);
  assert.equal(sales.foot, null, 'ไม่มีปุ่มไหนกดได้ = ไม่มีบรรทัด "ดาวน์โหลดแล้วส่งให้ลูกค้าเอง"');
  assert.equal(sales.waitText, null, 'ปุ่มของไฟล์ที่ยังไม่มีกดไม่ได้บนเครื่องนี้ = ไม่มีการรอ');
  const exec = block(bareDoc(EXEC, { state: 'frozen', storeAllowed: false, current: currentRow({ frozenAt: ISSUED, ready: { customer: true, internal: false } }) }),
    sentRequest(), EXEC_VIEWER);
  assert.deepEqual(exec.buttons.map((b) => [b.id, b.ready, b.blocked, !!b.href]), [['customer', true, null, true], ['internal', false, off, false]]);
  assert.equal(exec.text.text, off);
  assert.equal(exec.waitText, null);
  assert.match(exec.foot, /ฉบับภายในห้ามส่งลูกค้า$/);
});

test('หน้าคำร้อง · ส่งผลแล้วยังไม่มีเอกสาร: สามประโยคตามคนดู — ผู้ขอบนใบเปิด · ผู้ขอบนใบปิด · ผู้บริหาร · และหัวหน้า', () => {
  const doc = bareDoc(SALES, { state: 'missing' });
  const open = block(doc);
  const openText = 'ยังไม่มีเอกสารของใบนี้ — แจ้งหัวหน้าฝ่ายบริการให้กดออกเอกสาร (เขียนในเธรดด้านล่างได้)';
  assert.deepEqual(open, {
    state: 'missing', badge: { label: 'ยังไม่ออก', tone: 'warning' }, docNo: null, issuedText: null, issuedByName: null,
    text: { tone: 'info', text: openText }, foot: null, waitText: null,
    buttons: [{ id: 'customer', label: 'ดาวน์โหลด PDF', href: null, ready: false, blocked: openText }],
    sheetLink: false,
  });
  const closed = block(doc, sentRequest({ closedAt: ISSUED, status: 'closed' }));
  assert.equal(closed.text.text, 'ยังไม่มีเอกสารของใบนี้ — แจ้งหัวหน้าฝ่ายบริการโดยตรงให้กดออกเอกสาร (ใบนี้ปิดแล้ว เขียนในเธรดไม่ได้)');
  // สถานะ `cancelled` ที่ไม่มีตราเวลายกเลิก (ข้อมูลไม่ครบ — ใบที่มีตราไม่ได้บล็อกนี้เลย) ก็ต้องพูดคำของสถานะจริง ไม่ใช่ "ปิดแล้ว"
  assert.equal(block(doc, sentRequest({ status: 'cancelled' })).text.text,
    'ยังไม่มีเอกสารของใบนี้ — แจ้งหัวหน้าฝ่ายบริการโดยตรงให้กดออกเอกสาร (ใบนี้ยกเลิกแล้ว เขียนในเธรดไม่ได้)');
  const exec = block(bareDoc(EXEC, { state: 'missing' }), sentRequest(), EXEC_VIEWER);
  assert.equal(exec.text.text, 'ยังไม่มีเอกสารของใบนี้ — แจ้งหัวหน้าฝ่ายบริการโดยตรงให้กดออกเอกสาร');
  assert.equal(new Set([open.text.text, closed.text.text, exec.text.text]).size, 3);
  assert.deepEqual(exec.buttons.map((b) => [b.label, b.href, b.blocked]), [
    ['ดาวน์โหลด PDF ฉบับลูกค้า', null, exec.text.text], ['ดาวน์โหลด PDF ฉบับภายใน', null, exec.text.text],
  ]);
  for (const view of [open, closed, exec]) assert.equal(view.sheetLink, false);

  // หัวหน้า — ไปกดที่ใบประเมิน (หน้านี้ไม่มีปุ่มออกเอกสาร) · ลิงก์ขึ้นเมื่อเปิดใบประเมินได้
  const head = block(headDoc({ state: 'missing' }), sentRequest(), HEAD_VIEWER);
  assert.equal(head.text.text, 'ยังไม่มีเอกสารของใบนี้ — กด “ออกเอกสาร” ที่ใบประเมิน');
  assert.equal(head.sheetLink, true);
  assert.equal(head.buttons.length, 2);
  assert.ok(head.buttons.every((b) => b.href === null && b.blocked === head.text.text));
  assert.equal(block(headDoc({ state: 'missing' }), sentRequest(), { ...HEAD_VIEWER, canOpenSheet: false }).sheetLink, false);
});

test('หน้าคำร้อง · กำลังออก / ค้างผิดรอบ: บรรทัดเดียวกับการ์ด · ปุ่มจางพร้อมเหตุ', () => {
  const issuing = block(bareDoc(SALES, { state: 'issuing' }));
  assert.deepEqual(issuing.badge, { label: 'กำลังออก', tone: 'info' });
  assert.deepEqual(issuing.text, { tone: 'info', text: 'กำลังออกเอกสารของใบนี้ — หน้านี้ตรวจให้เองทุก 15 วินาที' });
  assert.deepEqual(issuing.buttons, [{ id: 'customer', label: 'ดาวน์โหลด PDF', href: null, ready: false, blocked: issuing.text.text }]);
  assert.equal(issuing.waitText, null);
  const stale = block(bareDoc(SALES, { state: 'stale', current: currentRow() }));
  assert.deepEqual(stale.badge, { label: 'ใช้ไม่ได้', tone: 'danger' });
  assert.deepEqual(stale.text, { tone: 'danger', text: 'เอกสารฉบับที่ใช้อยู่ไม่ตรงกับผลที่ส่งรอบล่าสุด — แจ้งผู้ดูแลระบบ' });
  assert.equal(stale.buttons[0].blocked, stale.text.text);
  assert.equal(stale.docNo, null, 'ไม่โชว์เลขของฉบับที่ใช้ไม่ได้เป็นหัวบล็อก');
  assert.equal(stale.foot, null);
});

test('🐞 หน้าคำร้อง · กำลังออก แต่เปลือกเลิกตรวจซ้ำแล้ว (`pollStopped`): ไม่สัญญา "ตรวจให้เองทุก 15 วินาที" ต่อ — กลายเป็น "ไม่ทราบ … ลองโหลดหน้าใหม่"', () => {
  /* UAT (R04/R13 + ทุก GET เบื้องหลังพัง): อ่านใบพังติดกัน 8 รอบแล้วหน้าเลิกตรวจ แต่บล็อกยังพิมพ์ป้าย "กำลังออก" กับคำสัญญาเดิมค้างไว้
     ⇒ ไม่มีอะไรบอกคนดูว่าไม่มีใครตรวจให้แล้ว และไม่มีทางออกให้ทำ */
  const stopped = (doc, viewer = REQUESTER) => surveyRequestDocumentView({ surveyDocument: doc, request: sentRequest(), viewer, pollStopped: true });
  const unknown = {
    state: 'unknown', badge: { label: 'ไม่ทราบ', tone: 'neutral' }, docNo: null, issuedText: null, issuedByName: null,
    text: { tone: 'warning', text: 'อ่านสถานะเอกสารประเมินไม่สำเร็จ — ยังไม่ทราบว่ามีเอกสารหรือไม่ · ลองโหลดหน้าใหม่' },
    foot: null, waitText: null, buttons: [], sheetLink: false,
  };
  for (const [doc, viewer] of [
    [bareDoc(SALES, { state: 'issuing' }), REQUESTER], [bareDoc(EXEC, { state: 'issuing' }), EXEC_VIEWER], [headDoc({ state: 'issuing' }), HEAD_VIEWER],
  ]) {
    const view = stopped(doc, viewer);
    assert.deepEqual(view, unknown);
    assert.doesNotMatch(JSON.stringify(view), /กำลังออก|ตรวจให้เอง|15 วินาที/);
  }
  // ธงนี้มีผลเฉพาะสถานะที่จอสัญญาว่าจะตรวจให้ — สถานะอื่นวาดของที่รู้ล่าสุดตามเดิม (ไม่มีคำสัญญาให้ถอน)
  for (const doc of [
    bareDoc(SALES, { state: 'ready', current: READY_CURRENT }), bareDoc(SALES, { state: 'issued', current: currentRow() }),
    bareDoc(SALES, { state: 'missing' }), bareDoc(SALES, { state: 'stale', current: currentRow() }),
  ]) {
    assert.deepEqual(stopped(doc), block(doc), doc.state);
  }
  assert.deepEqual(surveyRequestDocumentView({ surveyDocument: bareDoc(SALES, { state: 'recalled' }), request: request(), viewer: REQUESTER, pollStopped: true }),
    block(bareDoc(SALES, { state: 'recalled' }), request()));
  // ค่าที่ไม่ใช่ `true` ตรงตัว = ยังตรวจอยู่ (ธงมาจาก state ของเปลือก — ไม่เดาจากค่า truthy)
  for (const flag of [false, undefined, null, 1, 'true']) {
    const view = surveyRequestDocumentView({ surveyDocument: bareDoc(SALES, { state: 'issuing' }), request: sentRequest(), viewer: REQUESTER, pollStopped: flag });
    assert.equal(view.text.text, 'กำลังออกเอกสารของใบนี้ — หน้านี้ตรวจให้เองทุก 15 วินาที', String(flag));
  }
});

test('หน้าคำร้อง · ดึงผลกลับแล้ว: หัวหน้าได้เลข คนอื่นได้คำกลาง · ใบยังเดิน = บอกฉบับใหม่ · ใบจบแล้ว = ไม่สัญญาฉบับใหม่ ไม่มีปุ่ม', () => {
  const tail = ' — ห้ามใช้ฉบับที่ส่งลูกค้าไปแล้ว · ฉบับใหม่ (Rev ถัดไป) ออกหลังฝ่ายบริการส่งผลอีกครั้ง';
  const head = block(headDoc({ state: 'recalled', history: HISTORY, nextDocNo: 'SU-26100001-1' }), request(), HEAD_VIEWER);
  assert.deepEqual(head.badge, { label: 'ถูกแทนที่', tone: 'warning' });
  assert.deepEqual(head.text, { tone: 'warning', text: `เอกสาร SU-26100001-0 ถูกแทนที่แล้ว${tail}` });
  assert.equal(head.buttons.length, 2);
  assert.ok(head.buttons.every((b) => b.href === null && b.blocked === head.text.text));
  const sales = block(bareDoc(SALES, { state: 'recalled' }), request());
  assert.equal(sales.text.text, `เอกสารฉบับก่อนถูกแทนที่แล้ว${tail}`);
  assert.equal(sales.buttons.length, 1);
  assert.equal(sales.docNo, null);
  // คำที่ใช้ได้ทั้งสวิตช์เปิดและปิด — ไม่อ้างว่าส่งผลแล้วเอกสารออกเอง
  assert.equal(block(bareDoc(SALES, { state: 'recalled', issueAtSend: false }), request()).text.text, sales.text.text);

  // 🐞 UAT R17: คำของสถานะตรงกับหัวใบ — ใบที่ถูกยกเลิกเคยได้ "ใบนี้ปิดแล้ว" ทั้งที่ป้ายหัวใบกับแถบงานบอกว่ายกเลิก
  for (const [req, word] of [
    [request({ closedAt: ANSWERED, status: 'closed' }), 'ปิด'],
    [request({ cancelledAt: ANSWERED, status: 'cancelled' }), 'ยกเลิก'],
    // ยกเลิกหลังปิดเรื่อง (มีตราทั้งสอง) = ยกเลิก — สถานะสุดท้ายของใบ
    [request({ closedAt: ANSWERED, cancelledAt: ANSWERED, status: 'cancelled' }), 'ยกเลิก'],
  ]) {
    const endTail = ` — ห้ามใช้ฉบับที่ส่งลูกค้าไปแล้ว · ใบนี้${word}แล้ว ไม่มีฉบับใหม่`;
    const endedHead = block(headDoc({ state: 'recalled', history: HISTORY }), req, HEAD_VIEWER);
    assert.deepEqual(endedHead.text, { tone: 'warning', text: `เอกสาร SU-26100001-0 ถูกแทนที่แล้ว${endTail}` });
    assert.deepEqual(endedHead.buttons, []);
    const endedSales = block(bareDoc(SALES, { state: 'recalled' }), req);
    assert.equal(endedSales.text.text, `เอกสารฉบับก่อนถูกแทนที่แล้ว${endTail}`);
    assert.deepEqual(endedSales.buttons, []);
    assert.doesNotMatch(JSON.stringify([endedHead, endedSales]), /ฉบับใหม่ \(Rev ถัดไป\)|ส่งผลอีกครั้ง/);
    if (word === 'ยกเลิก') assert.doesNotMatch(JSON.stringify([endedHead, endedSales]), /ปิดแล้ว/);
  }
});

// ══ ประโยคที่ซ้ำกับค่าคงที่ฝั่ง server ════════════════════════════════════

test('ค่าคงที่ที่ประกาศซ้ำตรงกับฝั่ง server: สถานะทั้งแปด · ค้างผิดรอบ · เครื่องไม่ใช่ production', () => {
  assert.equal(SURVEY_DOC_STALE_TEXT, SURVEY_REPORT_REASONS.stale_current);
  const badge = (state, extra = {}, req = sentRequest()) => sheet({ document: headDoc({ state, ...extra }), request: req });
  // ทุกสถานะของ server มีป้ายของตัวเอง (สถานะใหม่ที่ไฟล์นี้ไม่รู้จัก = "ไม่ทราบ" ซึ่งเทสต์นี้จะจับได้)
  for (const state of SURVEY_REPORT_STATES) {
    const view = badge(state, { current: currentRow(), history: HISTORY }, ['not_sent', 'recalled'].includes(state) ? request() : sentRequest());
    assert.equal(view.state, state);
    assert.notEqual(view.badge.label, 'ไม่ทราบ', state);
    assert.ok(view.badge.label, state);
  }
  assert.equal(SURVEY_REPORT_STATES.length, 8);
  assert.equal(badge('missing', { storeAllowed: false, issue: OK_ISSUE }).status.text, SURVEY_REPORT_NOT_PRODUCTION);
});

test('ประโยคของจอขึ้นต้นเหมือนประโยคของ route เอกสาร (อ่านซอร์สของ route — `TEXT` เป็นของในไฟล์)', () => {
  const route = readFileSync(new URL('../../app/api/service/surveys/[id]/document/route.js', import.meta.url), 'utf8');
  const textOf = (key) => new RegExp(`\\n  ${key}: '([^']+)',`).exec(route)?.[1];
  const none = textOf('none');
  const issuing = textOf('issuing');
  assert.ok(none && issuing, 'หา TEXT.none / TEXT.issuing ใน route ไม่เจอ');
  const missing = block(bareDoc(SALES, { state: 'missing' })).text.text;
  assert.ok(missing.startsWith(none), `${missing} ⊄ ${none}`);
  // ประโยคอื่นของสถานะเดียวกันขึ้นต้นด้วยท่อนก่อนขีดของ route
  const clause = (text) => text.split(' — ')[0];
  for (const view of [
    block(bareDoc(SALES, { state: 'missing' }), sentRequest({ status: 'closed', closedAt: ISSUED })),
    block(bareDoc(EXEC, { state: 'missing' }), sentRequest(), EXEC_VIEWER),
    block(headDoc({ state: 'missing' }), sentRequest(), HEAD_VIEWER),
  ]) assert.equal(clause(view.text.text), clause(none));
  assert.equal(clause(block(bareDoc(SALES, { state: 'issuing' })).text.text), clause(issuing));
  assert.equal(clause(sheet({ document: headDoc({ state: 'issuing' }), request: sentRequest() }).status.text), clause(issuing));
});

// ══ ซอร์ส ═════════════════════════════════════════════════════════════════

test('🔴 ไฟล์จอของเอกสารไม่ import ของฝั่ง server · ไม่มี `node:` · ไม่ import การ์ด (วน)', () => {
  const source = readFileSync(new URL('./surveyDocumentView.js', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const specs = [...code.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(specs.sort(), ['./survey', '@/lib/format'], 'สเปก §3.1: import ได้แค่สองไฟล์นี้');
  for (const banned of [
    'surveyReportState', 'surveyReportRows', 'surveyReportInputs', 'surveyReportIssue', 'surveyReportPaper',
    'pdfInspect', 'surveyControl', 'node:',
  ]) {
    assert.ok(!specs.some((spec) => spec.includes(banned)), banned);
  }
  // ตัวตัดสินล้วน: ไม่อ่านนาฬิกา ไม่ยิง I/O
  assert.doesNotMatch(code, /\bnew Date\(\)|Date\.now\(|\bfetch\(|apiFetch|apiJson|localStorage|sessionStorage/);
});

test('🔴 ตัวตัดสินของจออีกสามไฟล์ก็ไม่ import ของฝั่ง server ของเอกสาร', () => {
  for (const file of ['surveyControl.js', 'surveySendClose.js', 'surveyJob.js']) {
    const code = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const specs = [...code.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.ok(specs.length > 0, file);
    for (const banned of ['surveyReportState', 'surveyReportRows', 'surveyReportInputs', 'surveyReportIssue', 'surveyReportPaper', 'pdfInspect', 'node:']) {
      assert.ok(!specs.some((spec) => spec.includes(banned)), `${file} → ${banned}`);
    }
  }
});
