// ── ภาพรวมฝ่าย: งานอยู่ที่ใคร (แบบ ก) + สายพานนับเป็นกลิ่น (แบบ ค) ───────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEPT_PIPELINE_STAGES, UNASSIGNED, deptPipeline, ownerWorkload, requestLineCount,
  requestStageKey, stageNote, stageValue,
} from './deptOverview.js';
import { FACET_NONE } from './queueList.js';

const t = { todayIso: '2026-08-12' };
const lines = (n) => Array.from({ length: n }, (_, i) => ({ id: `L${i}`, answerStatus: 'pending' }));
const req = (over = {}) => ({
  id: 'DR-1', dept: 'RD', status: 'acknowledged', kind: 'scent_dev',
  acknowledgedAt: '2026-08-05', acknowledgedById: 'U1', acknowledgedByName: 'ปกิตา',
  submittedAt: '2026-08-05', items: lines(3), ...over,
});

test('จำนวนบรรทัด — ใบที่ไม่มีบรรทัดคืน 0 ไม่ใช่ null', () => {
  assert.equal(requestLineCount(req()), 3);
  assert.equal(requestLineCount(req({ items: [] })), 0);
  assert.equal(requestLineCount({}), 0);
  assert.equal(requestLineCount(null), 0);
});

test('⭐ งานค้างรายคน — รวมใบ/กลิ่น/เลยกำหนด · คนถือเยอะขึ้นก่อน', () => {
  const rows = [
    req({ id: 'A', acknowledgedById: 'U1', acknowledgedByName: 'ปกิตา', items: lines(5) }),
    req({ id: 'B', acknowledgedById: 'U1', acknowledgedByName: 'ปกิตา', items: lines(2), committedDueDate: '2026-08-01' }),
    req({ id: 'C', acknowledgedById: 'U2', acknowledgedByName: 'ธนพล', items: lines(1) }),
  ];
  const out = ownerWorkload(rows, t);
  assert.deepEqual(out.map((r) => r.name), ['ปกิตา', 'ธนพล']);
  assert.equal(out[0].requests, 2);
  assert.equal(out[0].lines, 7);
  assert.equal(out[0].overdue, 1, 'ใบที่เลยวันที่รับปากไว้ต้องถูกนับ');
  assert.equal(out[1].overdue, 0);
});

test('⭐ กอง "ยังไม่มีคนรับ" เป็นแถวหนึ่งในตารางเดียวกัน และอยู่ท้ายเสมอ', () => {
  const rows = [
    req({ id: 'A', status: 'pending', acknowledgedById: null, acknowledgedByName: null, acknowledgedAt: null, items: lines(4), submittedAt: '2026-08-09' }),
    req({ id: 'B', status: 'pending', acknowledgedById: null, acknowledgedByName: null, acknowledgedAt: null, items: lines(2), submittedAt: '2026-08-10' }),
    req({ id: 'C', items: lines(1) }),
  ];
  const out = ownerWorkload(rows, t);
  // ถึงกองที่ไม่มีคนรับจะมี 2 ใบ (มากกว่าปกิตา 1 ใบ) ก็ยังต้องอยู่ท้าย
  assert.equal(out.at(-1).key, UNASSIGNED);
  // 🔴 คีย์ต้องตรงกับตัวกรอง "ผู้รับเรื่อง" ของคิว — ไม่งั้นกดแล้วได้ตารางว่าง
  assert.equal(UNASSIGNED, FACET_NONE);
  assert.equal(out.at(-1).unassigned, true);
  assert.equal(out.at(-1).requests, 2);
  assert.equal(out.at(-1).lines, 6);
  // รอนานสุดในกอง = ใบที่ส่งมาก่อน (9 ส.ค. → 3 วัน)
  assert.equal(out.at(-1).waitingDays, 3);
});

test('คนเดียวกันแต่ไม่มี id — รวมด้วยชื่อที่ normalize แล้ว ไม่แตกเป็นสองแถว', () => {
  const rows = [
    req({ id: 'A', acknowledgedById: null, acknowledgedByName: 'ปกิตา' }),
    req({ id: 'B', acknowledgedById: null, acknowledgedByName: 'ปกิตา ' }),
  ];
  assert.equal(ownerWorkload(rows, t).length, 1);
});

test('⭐ ขั้นของใบมาจาก requestNextStep ตัวเดียวกับคิว — ไม่ใช่สถานะดิบ', () => {
  assert.equal(requestStageKey(req({ status: 'pending', acknowledgedAt: null })), 'unacked');
  assert.equal(requestStageKey(req({ status: 'acknowledged', items: lines(2) })), 'working');
  // ตอบครบแล้วรอผู้ขอมารับ — ยัง `acknowledged` อยู่แต่ไม่ใช่ตาฝ่ายแล้ว
  const answered = req({
    status: 'acknowledged',
    items: [{ id: 'L1', ackAt: '2026-08-06', readyAt: '2026-08-07', answerStatus: 'pending' }],
  });
  assert.equal(requestStageKey(answered), 'waiting');
  assert.equal(requestStageKey(req({ status: 'closed' })), 'closed');
  assert.equal(requestStageKey(req({ status: 'cancelled' })), null, 'ใบยกเลิกไม่อยู่ในสายพาน');
});

test('⭐ สายพานนับเป็นกลิ่น · ใบที่ไม่มีบรรทัดถูกนับแยกไม่ให้หายเงียบ', () => {
  const rows = [
    req({ id: 'A', status: 'pending', acknowledgedAt: null, items: lines(4) }),
    req({ id: 'B', status: 'pending', acknowledgedAt: null, items: [] }),
    req({ id: 'C', status: 'acknowledged', items: lines(3) }),
  ];
  const stages = deptPipeline(rows, t);
  const byKey = Object.fromEntries(stages.map((s) => [s.key, s]));
  assert.equal(byKey.unacked.requests, 2);
  assert.equal(byKey.unacked.lines, 4);
  assert.equal(byKey.unacked.noLines, 1, 'ใบที่ไม่มีบรรทัดต้องถูกนับแยก');
  assert.equal(byKey.working.lines, 3);
  assert.match(stageNote(byKey.unacked), /4 กลิ่น/);
  assert.equal(stageNote(byKey.closed), 'ไม่มีของค้างในขั้นนี้');
  // ผลรวมของทุกขั้นต้องเท่าจำนวนใบที่อยู่ในสายพาน — ไม่มีใบไหนหายระหว่างจัดขั้น
  assert.equal(stages.reduce((n, s) => n + s.requests, 0), 3);
});

test('🔴 ตัวเลขหลักเป็น "ใบ" เสมอ — กลิ่นเป็นตัวเลขหลักเมื่อไรมันโกหกทันที', () => {
  /* 🐞 ของจริงบนคิว RD วันที่ทำ: รอรับเรื่อง 9 ใบ แต่มีบรรทัดแค่ใบเดียว
     ⇒ เวอร์ชันแรกขึ้นหัวการ์ดว่า "1 กลิ่น" ทั้งที่มีเก้าใบรอคนรับอยู่ */
  const rows = [
    req({ id: 'A', status: 'pending', acknowledgedAt: null, items: lines(1) }),
    ...Array.from({ length: 8 }, (_, i) => req({ id: `N${i}`, status: 'pending', acknowledgedAt: null, items: [] })),
  ];
  const unacked = deptPipeline(rows, t).find((s) => s.key === 'unacked');
  assert.deepEqual(stageValue(unacked), { value: 9, unit: 'ใบ' });
  assert.match(stageNote(unacked), /1 กลิ่น/, 'กลิ่นยังต้องอยู่ แต่เป็นบรรทัดรอง');
  // ขั้นที่ไม่มีบรรทัดเลย — บรรทัดรองต้องไม่ว่างเปล่า
  const noLines = deptPipeline([req({ status: 'pending', acknowledgedAt: null, items: [] })], t)
    .find((s) => s.key === 'unacked');
  assert.deepEqual(stageValue(noLines), { value: 1, unit: 'ใบ' });
  assert.ok(stageNote(noLines).length > 0);
});

test('⭐ "ปิดเดือนนี้" นับเฉพาะใบที่ปิดในเดือนนั้น — เดือนก่อนต้องไม่พองเข้ามา', () => {
  const rows = [
    req({ id: 'A', status: 'closed', closedAt: '2026-08-03T09:00:00Z', items: lines(2) }),
    req({ id: 'B', status: 'closed', closedAt: '2026-07-28T09:00:00Z', items: lines(9) }),
    req({ id: 'C', status: 'closed', closedAt: null, items: lines(5) }),
  ];
  const closed = deptPipeline(rows, t).find((s) => s.key === 'closed');
  assert.equal(closed.requests, 1);
  assert.equal(closed.lines, 2);
});

test('ทะเบียนขั้น — สี่ขั้น เรียงตามทางเดินของงาน และมีโทนครบ', () => {
  assert.deepEqual(DEPT_PIPELINE_STAGES.map((s) => s.key), ['unacked', 'working', 'waiting', 'closed']);
  for (const stage of DEPT_PIPELINE_STAGES) {
    assert.ok(stage.label, `${stage.key} ต้องมีป้าย`);
    assert.ok(stage.tone, `${stage.key} ต้องมีโทน`);
  }
});
