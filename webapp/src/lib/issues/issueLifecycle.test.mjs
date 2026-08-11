// วงจรชีวิตของเรื่องแจ้งปัญหา — ลำดับขั้นบังคับที่ชั้นนี้ ไม่มี trigger ใน DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_CLOSE_DAYS, autoCloseDueAt, autoClosePatch, isDueForAutoClose,
  issueAction, normalizeIssueInput, sortIssueQueue, titleFromDetail,
} from './model.js';

const reporter = { id: 'u-1', role: 'ae', name: 'สมชาย', department: 'SA', team: 'ODM' };
const admin = { id: 'u-9', role: 'admin', name: 'ปิยะ' };
const other = { id: 'u-2', role: 'senior_ae', name: 'อีกคน' };

const pending = { id: 'ISS-1', code: 'IS-26080014', reportedById: 'u-1', status: 'pending', impact: 'blocked' };
const acknowledged = { ...pending, status: 'acknowledged', assigneeId: 'u-9', acknowledgedAt: '2026-08-05T03:00:00.000Z' };
const resolved = { ...acknowledged, status: 'resolved', resolvedAt: '2026-08-06T09:00:00.000Z' };

// ── สร้างเรื่อง ──────────────────────────────────────────────────────────
test('รายละเอียดว่าง = เปิดเรื่องไม่ได้ แต่ช่องอื่นว่างได้หมด', () => {
  assert.ok(normalizeIssueInput({ detail: '   ' }, reporter).error);
  assert.ok(normalizeIssueInput({}, reporter).error);
  const { value, error } = normalizeIssueInput({ detail: 'กดแล้วไม่ขึ้น' }, reporter);
  assert.equal(error, undefined);
  assert.equal(value.status, 'pending');
  assert.equal(value.kind, 'bug');
  assert.equal(value.impact, 'workaround');
});

test('ผู้แจ้งมาจาก user เสมอ — ส่ง reportedById มาใน body ไม่มีผล', () => {
  const { value } = normalizeIssueInput({ detail: 'x', reportedById: 'u-999' }, reporter);
  assert.equal(value.reportedById, 'u-1');
  assert.equal(value.reporterRole, 'ae');
  assert.equal(value.reporterDepartment, 'SA');
  assert.equal(value.reporterTeam, 'ODM');
});

test('หัวข้อว่าง = ตัดจากบรรทัดแรก ไม่ใช่ตัดกลางประโยค', () => {
  const { value } = normalizeIssueInput({ detail: 'บันทึกดีลแล้วหมุนค้าง\nลองใหม่ 3 รอบ' }, reporter);
  assert.equal(value.title, 'บันทึกดีลแล้วหมุนค้าง');
  assert.equal(titleFromDetail('\n\n  อันแรกว่าง  \nอันสอง'), 'อันแรกว่าง');
  assert.equal(titleFromDetail('   '), null);
  assert.equal(titleFromDetail('ก'.repeat(300)).length, 200);
});

// ── ลำดับขั้น ────────────────────────────────────────────────────────────
test('ข้ามขั้นไม่ได้', () => {
  assert.ok(issueAction('resolve', pending, { user: admin }).error, 'pending → resolved ต้องไม่ผ่าน');
  assert.ok(issueAction('confirm', acknowledged, { user: reporter }).error, 'acknowledged → closed ต้องไม่ผ่าน');
  assert.ok(issueAction('acknowledge', acknowledged, { user: admin }).error, 'รับเรื่องซ้ำต้องไม่ผ่าน');
  assert.ok(issueAction('reject', resolved, { user: admin }).error, 'resolved แล้วปฏิเสธไม่ได้');
});

test('รับเรื่อง = self-assign + ขยับสถานะในก้าวเดียว', () => {
  const { patch, error } = issueAction('acknowledge', pending, { user: admin });
  assert.equal(error, undefined);
  assert.equal(patch.status, 'acknowledged');
  assert.equal(patch.assigneeId, 'u-9');
  assert.equal(patch.assigneeName, 'ปิยะ');
  assert.ok(patch.acknowledgedAt);
});

test('เฉพาะแอดมินที่รับเรื่อง/แก้/ปฏิเสธได้', () => {
  assert.ok(issueAction('acknowledge', pending, { user: reporter }).error);
  assert.ok(issueAction('acknowledge', pending, { user: other }).error);
  assert.ok(issueAction('resolve', acknowledged, { user: reporter }).error);
  assert.ok(issueAction('reject', pending, { user: reporter, payload: { reason: 'ไม่ทำ' } }).error);
});

test('ยืนยัน/ดีดกลับเป็นของผู้แจ้ง (แอดมินกดแทนได้) คนนอกกดไม่ได้', () => {
  assert.equal(issueAction('confirm', resolved, { user: reporter }).error, undefined);
  assert.equal(issueAction('confirm', resolved, { user: admin }).error, undefined);
  assert.ok(issueAction('confirm', resolved, { user: other }).error);
  assert.ok(issueAction('reopen', resolved, { user: other }).error);
});

test('ปฏิเสธต้องมีเหตุผล', () => {
  assert.ok(issueAction('reject', pending, { user: admin }).error);
  assert.ok(issueAction('reject', pending, { user: admin, payload: { reason: '   ' } }).error);
  const { patch } = issueAction('reject', pending, { user: admin, payload: { reason: 'ตั้งใจให้เป็นแบบนี้' } });
  assert.equal(patch.status, 'rejected');
  assert.equal(patch.rejectReason, 'ตั้งใจให้เป็นแบบนี้');
  assert.ok(patch.closedAt, 'rejected ต้องมี closedAt (CHECK ของ DB บังคับ)');
});

test('ยืนยันแล้วปิด และไม่ถูกนับว่าปิดอัตโนมัติ', () => {
  const { patch } = issueAction('confirm', resolved, { user: reporter });
  assert.equal(patch.status, 'closed');
  assert.equal(patch.autoClosed, false);
  assert.ok(patch.closedAt);
});

// 🐞 กับดัก: ถ้าไม่ล้าง resolvedAt ตอนดีดกลับ cron จะยังนับ 7 วันจากรอบก่อน
// แล้วปิดเรื่องที่ผู้แจ้งเพิ่งบอกว่ายังไม่หาย
test('ยังไม่หาย = กลับไป acknowledged และล้าง resolvedAt', () => {
  const { patch } = issueAction('reopen', resolved, { user: reporter });
  assert.equal(patch.status, 'acknowledged');
  assert.equal(patch.resolvedAt, null);
  assert.equal(isDueForAutoClose({ ...resolved, ...patch }), false);
});

test('มอบหมายต้องระบุคน · ปรับผลกระทบเป็นค่าเดิมไม่ได้', () => {
  assert.ok(issueAction('assign', pending, { user: admin, payload: {} }).error);
  assert.equal(
    issueAction('assign', pending, { user: admin, payload: { assigneeId: 'u-9', assigneeName: 'ปิยะ' } }).patch.assigneeId,
    'u-9',
  );
  assert.ok(issueAction('impact', pending, { user: admin, payload: { impact: 'blocked' } }).error);
  assert.equal(issueAction('impact', pending, { user: admin, payload: { impact: 'minor' } }).patch.impact, 'minor');
});

test('คำสั่งที่ไม่รู้จัก / เรื่องที่ไม่มี = ตีกลับ ไม่ throw', () => {
  assert.ok(issueAction('drop_table', pending, { user: admin }).error);
  assert.ok(issueAction('confirm', null, { user: reporter }).error);
});

// ── ปิดอัตโนมัติ ─────────────────────────────────────────────────────────
// ⚠️ นับจาก resolvedAt ไม่ใช่ createdAt — เรื่องที่ใช้เวลาแก้ 3 สัปดาห์ต้องได้
// 7 วันเต็มให้ผู้แจ้งยืนยันเหมือนกันทุกใบ
test('ปิดอัตโนมัตินับ 7 วันจาก resolvedAt', () => {
  assert.equal(AUTO_CLOSE_DAYS, 7);
  const due = autoCloseDueAt(resolved);
  assert.equal(due, '2026-08-13T09:00:00.000Z');

  assert.equal(isDueForAutoClose(resolved, new Date('2026-08-13T08:59:00.000Z')), false);
  assert.equal(isDueForAutoClose(resolved, new Date('2026-08-13T09:00:00.000Z')), true);

  // เรื่องเก่าแก่ที่เพิ่งถูกแก้ ต้องได้ 7 วันเต็มเหมือนกัน
  const old = { ...resolved, createdAt: '2026-01-01T00:00:00.000Z' };
  assert.equal(isDueForAutoClose(old, new Date('2026-08-12T00:00:00.000Z')), false);
});

test('เรื่องที่ไม่ได้รอยืนยันอยู่ ไม่ถูกปิดอัตโนมัติ', () => {
  assert.equal(autoCloseDueAt(acknowledged), null);
  assert.equal(autoCloseDueAt({ ...resolved, status: 'closed' }), null);
  assert.equal(autoCloseDueAt({ ...resolved, resolvedAt: null }), null);
  assert.equal(isDueForAutoClose(pending, new Date('2030-01-01T00:00:00.000Z')), false);
  assert.equal(autoClosePatch(new Date('2026-08-13T09:00:00.000Z')).autoClosed, true);
});

// ── คิว ──────────────────────────────────────────────────────────────────
// ⚠️ ผลกระทบมาก่อนเวลา — เรียง "ใหม่สุดก่อน" ล้วน ๆ จะดันคนที่ทำงานไม่ได้ลงล่าง
// ทุกครั้งที่มีคนแจ้งเรื่องเล็ก
test('คิวเรียงตามผลกระทบก่อน แล้วค่อยใหม่สุดก่อน', () => {
  const queue = sortIssueQueue([
    { id: 'c', impact: 'minor', createdAt: '2026-08-07T09:00:00Z' },
    { id: 'a', impact: 'blocked', createdAt: '2026-08-05T09:00:00Z' },
    { id: 'd', impact: 'workaround', createdAt: '2026-08-01T09:00:00Z' },
    { id: 'b', impact: 'blocked', createdAt: '2026-08-06T09:00:00Z' },
  ]);
  assert.deepEqual(queue.map((r) => r.id), ['b', 'a', 'd', 'c']);
});

// ── เรียงคิว: เรื่องที่จบแล้วต้องไม่ลอยเหนือเรื่องที่ยังไม่มีใครรับ (2026-08-11) ──
//
// 🐞 ของจริงที่เห็นในระบบ: IS-26080002 ถูกปฏิเสธไปแล้วแต่ตั้งไว้เป็น `blocked`
// ⇒ ลอยอยู่บนสุดของแท็บ "ทั้งหมด" เหนือเรื่องที่ยังไม่มีใครรับ
test('เรื่องที่ปิด/ปฏิเสธแล้วไปท้ายเสมอ แม้ผลกระทบจะแรงกว่า', () => {
  const rows = [
    { code: 'ปิดแล้ว-blocked', status: 'closed', impact: 'blocked', createdAt: '2026-08-01T00:00:00Z' },
    { code: 'ปฏิเสธ-blocked', status: 'rejected', impact: 'blocked', createdAt: '2026-08-02T00:00:00Z' },
    { code: 'ค้าง-minor', status: 'pending', impact: 'minor', createdAt: '2026-08-03T00:00:00Z' },
    { code: 'ค้าง-blocked', status: 'pending', impact: 'blocked', createdAt: '2026-08-04T00:00:00Z' },
  ];
  assert.deepEqual(
    sortIssueQueue(rows).map((r) => r.code),
    ['ค้าง-blocked', 'ค้าง-minor', 'ปฏิเสธ-blocked', 'ปิดแล้ว-blocked'],
  );
});

test('ในกลุ่มที่ยังเดินอยู่ ผลกระทบยังมาก่อนเวลาเหมือนเดิม', () => {
  const rows = [
    { code: 'ใหม่-minor', status: 'pending', impact: 'minor', createdAt: '2026-08-10T00:00:00Z' },
    { code: 'เก่า-blocked', status: 'acknowledged', impact: 'blocked', createdAt: '2026-08-01T00:00:00Z' },
  ];
  assert.deepEqual(sortIssueQueue(rows).map((r) => r.code), ['เก่า-blocked', 'ใหม่-minor']);
});
