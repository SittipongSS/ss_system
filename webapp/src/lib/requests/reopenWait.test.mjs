// ── "ยังไม่จบ" แล้วรอใคร (มติผู้ใช้ 2026-09-29 · mig 0391) ─────────────────
//
// *"คำร้อง ถ้ากดยังไม่จบ จะเด้งคิวยังไง เหมือนมันจะไม่ขึ้นเตือนว่ายังไม่จบ"*
// 🐞 ของเดิมถอนตราแล้วให้คิวเดาจากตัวงาน ⇒ RQ-26080083: SA กดให้ RD แก้กลิ่น แต่ใบขึ้น
// "รอ SA ตอบ" ในคิว SA เอง (RD ตอบในเธรดล่าสุด · เหตุผลของปุ่มไม่นับเป็นข้อความ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reopenWaitClearPatch, reopenWaitSideError } from './closure.js';
import { requestActorSide } from './replyTurn.js';
import { requestRowsClosurePatch } from './stages.js';
import { requestNextStep, requestQueueStatus } from './queueBoard.js';
import { askActionUpdate } from '../costingUpdates.js';

const ask = (over = {}) => ({
  kind: 'info', dept: 'RD', requesterDept: 'SA', status: 'acknowledged',
  committedDueDate: '2026-08-25', items: [], ...over,
});
const NOW = '2026-09-29T03:00:00Z';
const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('🐞 RQ-26080083 — SA กดยังไม่จบให้ RD แก้ ⇒ ใบไปคิว RD พร้อมคำว่า "ยังไม่จบ"', () => {
  // สภาพจริงหลังกด: ตราหายหมด · RD โพสต์ล่าสุด
  const before = ask({ lastReplySide: 'dept' });
  assert.equal(requestNextStep(before).owner, 'requester', 'ของเดิม: เดาจากคนโพสต์ล่าสุด = ผิดคิว');

  const reopened = ask({ lastReplySide: 'dept', reopenWaitSide: 'dept', reopenedAt: NOW });
  const next = requestNextStep(reopened);
  assert.equal(next.owner, 'dept');
  assert.equal(next.label, 'ยังไม่จบ · รอ RD');
  assert.equal(requestQueueStatus(reopened).tone, 'warning');
});

test('คนกดเลือกฝั่งตัวเองได้ (RD ถอนคำตอบเพราะรอผลทดสอบ · SA รอลูกค้าฟีดแบค)', () => {
  assert.equal(requestNextStep(ask({ reopenWaitSide: 'requester' })).label, 'ยังไม่จบ · รอ SA');
  assert.equal(requestNextStep(ask({ reopenWaitSide: 'requester' })).owner, 'requester');
  // ใบเก่าไม่มีฝ่ายผู้ขอ — คำถอยไทยไม่เว้นวรรค
  assert.equal(
    requestNextStep(ask({ requesterDept: null, reopenWaitSide: 'requester' })).label,
    'ยังไม่จบ · รอผู้ขอ',
  );
});

test('ใบที่มีแถวและแถวจบครบ — ไม่ตก "รอปิดเรื่อง" ตาผู้ขออีก', () => {
  const rows = [{ id: 'L-1', answerStatus: 'done', receivedAt: NOW }];
  const base = ask({ kind: 'doc_request', items: rows });
  assert.equal(requestNextStep(base).owner, 'requester');
  assert.equal(requestNextStep({ ...base, reopenWaitSide: 'dept' }).owner, 'dept');
});

test('ป้าย "ยังไม่จบ" ไม่ถูก "รอกำหนดส่ง" ทับ', () => {
  const next = requestNextStep(ask({ committedDueDate: null, reopenWaitSide: 'dept' }));
  assert.equal(next.label, 'ยังไม่จบ · รอ RD');
});

test('ตราปิดมาก่อนป้าย — ใบที่ปิด/ยกเลิก/มีตราใหม่ ไม่ขึ้น "ยังไม่จบ" แม้ค่าค้าง', () => {
  assert.equal(requestNextStep(ask({ status: 'closed', reopenWaitSide: 'dept' })), null);
  assert.equal(requestNextStep(ask({ status: 'cancelled', reopenWaitSide: 'dept' })), null);
  assert.equal(
    requestNextStep(ask({ status: 'answered', answeredAt: NOW, reopenWaitSide: 'dept' })).label,
    'รอ SA ปิด',
  );
});

test('ป้ายหลุดเมื่อฝั่งที่ถูกรอขยับ หรือมีตราใหม่ — อีกฝั่งขยับไม่หลุด', () => {
  const r = ask({ reopenWaitSide: 'dept' });
  assert.deepEqual(reopenWaitClearPatch(r, { side: 'dept' }), { reopenWaitSide: null });
  assert.deepEqual(reopenWaitClearPatch(r, { side: 'requester' }), {});
  assert.deepEqual(reopenWaitClearPatch(r, { side: 'requester', stamps: true }), { reopenWaitSide: null });
  assert.deepEqual(reopenWaitClearPatch(ask(), { side: 'dept', stamps: true }), {}, 'ไม่มีป้าย = ไม่เขียนคอลัมน์');
});

test('ฝั่งของคนทำ = ฝ่ายของคนเทียบฝ่ายปลายทาง · ไม่มีฝ่ายนับเป็นผู้ขอ', () => {
  assert.equal(requestActorSide({ department: 'RD' }, ask()), 'dept');
  assert.equal(requestActorSide({ department: 'SA' }, ask()), 'requester');
  assert.equal(requestActorSide({ department: null }, ask()), 'requester');
  assert.equal(requestActorSide(null, ask()), 'requester');
});

test('เดินแถว: ฝั่งที่ถูกรอขยับ = หลุด · แถวครบจนได้ตราฝ่าย = หลุด · ไม่ส่งฝั่ง = ไม่แตะ', () => {
  const open = [{ id: 'L-1', answerStatus: 'working' }];
  const r = ask({ kind: 'doc_request', reopenWaitSide: 'dept', items: open });
  assert.equal(requestRowsClosurePatch(r, open, NOW, { actorSide: 'dept' }).reopenWaitSide, null);
  assert.equal('reopenWaitSide' in requestRowsClosurePatch(r, open, NOW, { actorSide: 'requester' }), false);
  assert.equal('reopenWaitSide' in requestRowsClosurePatch(r, open, NOW), false);
  const done = [{ id: 'L-1', answerStatus: 'done', receivedAt: NOW }];
  const patch = requestRowsClosurePatch({ ...r, reopenWaitSide: 'requester' }, done, NOW);
  assert.equal(patch.answeredAt, NOW);
  assert.equal(patch.reopenWaitSide, null);
});

test('ด่านฝั่ง: ต้องเลือก dept/requester เท่านั้น', () => {
  assert.equal(reopenWaitSideError('dept'), null);
  assert.equal(reopenWaitSideError('requester'), null);
  assert.match(reopenWaitSideError(undefined), /ต้องเลือกว่าใครทำต่อ/);
  assert.match(reopenWaitSideError('RD'), /ต้องเลือกว่าใครทำต่อ/);
});

test('เธรด/กระดิ่งบอกว่ารอใคร · ใบก่อน mig 0391 ได้ประโยคเดิม', () => {
  const withSide = askActionUpdate('reopen', ask({ reopenWaitSide: 'dept' }), { reason: 'ปรับลด LEMON' });
  assert.equal(withSide.body, 'ยังไม่จบ — เปิดเรื่องกลับมา · รอ RD ทำต่อ · ปรับลด LEMON');
  assert.equal(withSide.meta.waitSide, 'dept');
  const legacy = askActionUpdate('reopen', ask(), { reason: 'x' });
  assert.equal(legacy.body, 'ยังไม่จบ — เปิดเรื่องกลับมา · x');
});

test('ทุกทางที่คนขยับใบ ต้องบอกฝั่งของคนทำ — ไม่งั้นป้าย "ยังไม่จบ" ค้างถาวร', () => {
  const patchRoute = src('../../app/api/sa/requests/[id]/route.js');
  assert.match(patchRoute, /reopenWaitSideError\(waitSide\)/, 'ปุ่มยังไม่จบต้องบังคับเลือกฝั่ง');
  assert.match(patchRoute, /reopenWaitClearPatch\(before, \{\s*side: requestActorSide\(user, before\)/);
  assert.match(src('../../app/api/updates/route.js'), /reopenWaitClearPatch\(parent, \{ side \}\)/);
  for (const path of [
    '../../app/api/sa/requests/[id]/items/route.js',
    '../../app/api/sa/requests/[id]/items/[itemId]/route.js',
    '../../app/api/sa/requests/[id]/items/[itemId]/price/route.js',
  ]) {
    const code = src(path);
    const calls = code.match(/requestRowsClosurePatch\([^)]*\)[^;]*/g) || [];
    assert.ok(calls.length, path);
    for (const call of calls) assert.match(call, /actorSide: requestActorSide\(user,/, `${path}: ${call}`);
  }
  assert.match(src('../../app/requests/[id]/page.js'), /action: "reopen", reason: reopen\.reason, waitSide: reopen\.waitSide/);
});
