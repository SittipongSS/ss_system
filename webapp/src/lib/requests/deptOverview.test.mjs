// ── ภาพรวมฝ่าย: งานอยู่ที่ใคร (แบบ ก) + สายพานนับเป็นกลิ่น (แบบ ค) ───────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  DEPT_PIPELINE_STAGES, DEPT_STAGE_QUEUE, DEPT_TURN_TAB, UNASSIGNED, deptCalendarMarks, deptCountByTurn, deptOverdueByTurn,
  deptPipeline, deptStageQueueHref, deptTurnCountHref, isMonthKey, matchesTurnCount, ownerWorkload, requestClosedInMonth,
  requestLineCount, requestStageKey, requestTurn, stageNote, stageValue,
} from './deptOverview.js';
import { FACET_NONE } from './queueList.js';
import {
  deptQueueRows, matchesQueueCount, requestClosureStarted, requestNextStep, requestSettled,
} from './queueBoard.js';
import { dueCalendar, weekStart } from './dueCalendar.js';

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

/* ══ การ์ด/ป้ายบนหน้าภาพรวม ↔ คิวที่มันเปิด (ตรวจตัวกรองทั้งระบบ 08/10 · H9 H10 H11) ══════════════
   🔴 เลขบนการ์ดต้องเท่ากับแถวที่ปลายทางโชว์ — ปลายทางถูกจำลองด้วยตัวเดียวกับที่ `/rd/requests` ใช้จริง:
      แท็บ = `deptQueueRows` · `?count=` = `matchesQueueCount` · `?closed=` = `requestClosedInMonth` */
const ready = { id: 'LR', ackAt: '2026-08-06', readyAt: '2026-08-07', answerStatus: 'pending' };
const mix = [
  req({ id: 'P1', status: 'pending', acknowledgedAt: null, items: lines(2) }),
  req({ id: 'P2', status: 'pending', acknowledgedAt: null, items: [] }),
  // ใบ pending ที่มีตราตอบแล้ว ⇒ ตาผู้ขอ — ของเดิมนับ "รอรับเรื่อง" แต่ใบอยู่แท็บรอผู้ขอ
  req({ id: 'P3', status: 'pending', acknowledgedAt: null, answeredAt: '2026-08-10T03:00:00Z', items: [] }),
  req({ id: 'W1', items: lines(3) }),
  req({ id: 'W2', items: lines(1), committedDueDate: '2026-08-01' }),
  req({ id: 'R1', items: [ready] }),
  req({ id: 'R2', items: [ready], committedDueDate: '2026-08-02' }),
  req({ id: 'C1', status: 'closed', answeredAt: '2026-08-02T03:00:00Z', closedAt: '2026-08-03T09:00:00Z' }),
  // ผู้ขอปิด ก.ค. ฝ่ายปิดตาม ส.ค. (เวลาไทย) = ปิดเดือน ส.ค.
  req({ id: 'C2', status: 'closed', closedAt: '2026-07-30T09:00:00Z', answeredAt: '2026-07-31T18:30:00Z' }),
  req({ id: 'C3', status: 'closed', closedAt: '2026-07-28T09:00:00Z' }),
  req({ id: 'X1', status: 'cancelled', cancelledAt: '2026-08-04T09:00:00Z' }),
  req({ id: 'D1', status: 'draft' }),
  req({ id: 'FN', dept: 'FN', status: 'pending', acknowledgedAt: null }),
];

/** แถวที่ `/rd/requests` โชว์เมื่อเปิดลิงก์นี้ */
function queueRowsFor(href, rows, todayIso) {
  const url = new URL(href, 'http://localhost');
  const tab = url.searchParams.get('tab') || 'todo';
  const count = url.searchParams.get('count');
  const closed = url.searchParams.get('closed');
  return deptQueueRows(rows, { dept: 'RD', tab })
    .filter((r) => !count || matchesQueueCount(r, count, { todayIso }))
    .filter((r) => !(tab === 'history' && isMonthKey(closed)) || requestClosedInMonth(r, closed));
}

test('🔴 การ์ดสายพานทุกขั้น — เลขบนการ์ด = แถวที่ลิงก์ของการ์ดเปิดให้เห็น (H10 H11)', () => {
  const month = t.todayIso.slice(0, 7);
  const stages = deptPipeline(mix.filter((r) => r.dept === 'RD' && r.status !== 'draft'), t);
  assert.deepEqual(Object.keys(DEPT_STAGE_QUEUE), stages.map((s) => s.key), 'ทุกขั้นต้องมีลิงก์');
  for (const stage of stages) {
    const href = deptStageQueueHref(stage.key, { month });
    const shown = queueRowsFor(href, mix, t.todayIso);
    assert.equal(stage.requests, shown.length, `${stage.label} ${stage.requests} แต่ ${href} โชว์ ${shown.length}`);
  }
  const byKey = Object.fromEntries(stages.map((s) => [s.key, s.requests]));
  assert.deepEqual(byKey, { unacked: 2, working: 2, waiting: 3, closed: 2 });
});

test('🔴 ใบ pending ที่ตกเป็นตาผู้ขอ อยู่ขั้น "ส่งแล้ว รอผู้ขอ" — ขั้นเดียวกับแท็บที่ใบอยู่', () => {
  const p3 = mix.find((r) => r.id === 'P3');
  assert.equal(requestStageKey(p3), 'waiting');
  assert.ok(deptQueueRows([p3], { dept: 'RD', tab: 'waiting' }).length === 1);
});

test('🔴 "ปิดเดือนนี้" ลิงก์พร้อมเดือน · ประวัติกรองด้วยตัวตัดสินเดียวกัน (ไม่รวมใบยกเลิก/เดือนก่อน)', () => {
  assert.equal(deptStageQueueHref('closed', { month: '2026-08' }), '/rd/requests?tab=history&closed=2026-08');
  assert.equal(deptStageQueueHref('unacked'), '/rd/requests?tab=todo&count=unacked');
  assert.equal(deptStageQueueHref('working', { queueHref: '/x' }), '/x?tab=todo&count=working');
  assert.equal(deptStageQueueHref('waiting'), '/rd/requests?tab=waiting');
  assert.equal(deptStageQueueHref('closed', { month: 'oops' }), '/rd/requests?tab=history', 'เดือนผิดรูป = ไม่ส่งตัวกรอง');
  const august = mix.filter((r) => requestClosedInMonth(r, '2026-08')).map((r) => r.id);
  assert.deepEqual(august, ['C1', 'C2']);
  assert.equal(requestClosedInMonth(mix.find((r) => r.id === 'X1'), '2026-08'), false, 'ยกเลิก ≠ ปิด');
  assert.equal(requestClosedInMonth(mix.find((r) => r.id === 'C1'), null), false);
  assert.equal(isMonthKey('2026-13'), false);
  assert.equal(isMonthKey('2026-08'), true);
});

test('🔴 ป้าย "เลยวันที่รับปากไว้" แยกตามตาใคร — แต่ละเลข = แถบ "เลยกำหนด" ของแท็บที่ปุ่มพาไป (H9)', () => {
  const split = deptOverdueByTurn(mix, { dept: 'RD', todayIso: t.todayIso });
  // ⭐ มติเจ้าของ 19/10: ไม่มี `total` — ผลรวมสองตาคือเลขที่ไม่มีลิงก์ไหนเปิดเจอ · หัวป้าย = `dept`
  assert.deepEqual(split, { dept: 1, requester: 1 });
  assert.equal(split.dept, queueRowsFor('/rd/requests?tab=todo&count=overdue', mix, t.todayIso).length);
  assert.equal(split.requester, queueRowsFor('/rd/requests?tab=waiting&count=overdue', mix, t.todayIso).length);
  assert.deepEqual(split, deptCountByTurn(mix, 'overdue', { dept: 'RD', todayIso: t.todayIso }));
});

/* ══ ตัวเลขแยกตามตาใคร (มติเจ้าของ 19/10 · H9 M6) — ตัวเลขหลักนับเฉพาะตา RD · ตาผู้ขอเป็นปุ่มรอง ══════════
   🔴 ทุกคู่ (ตา × คีย์) = แถวที่ลิงก์ของมันเปิดให้เห็นบน `/rd/requests` · ไม่มีใบไหนหายจากผลรวมเดิมของปฏิทิน */
const openRdRows = mix.filter((r) => r.dept === 'RD' && r.status !== 'draft' && !requestSettled(r) && !requestClosureStarted(r));

test('🔴 ทุกตัวเลขแยกตา — เลขบนปุ่ม = แถวที่ลิงก์ (แท็บของตานั้น + ?count=) เปิดเจอ', () => {
  const opts = { dept: 'RD', todayIso: t.todayIso };
  for (const key of ['overdue', 'undated', 'unacked', 'working']) {
    const split = deptCountByTurn(mix, key, opts);
    for (const turn of Object.keys(DEPT_TURN_TAB)) {
      const href = deptTurnCountHref(turn, key);
      const shown = queueRowsFor(href, mix, t.todayIso);
      assert.equal(split[turn], shown.length, `${key}/${turn} = ${split[turn]} แต่ ${href} โชว์ ${shown.length}`);
      // ใบที่ถูกนับอยู่ในตานั้นจริง (owner ของ requestNextStep) — ไม่ใช่แค่จำนวนบังเอิญเท่ากัน
      for (const r of shown) assert.equal(requestNextStep(r)?.owner, turn, `${r.id} อยู่ผิดตา`);
    }
  }
  // ตัวเลขของ fixture — P1 P2 W1 ยังไม่มีวัน (ตา RD) · R1 ส่งแล้วไม่มีวัน (ตาผู้ขอ) · P3 มีตราตอบแล้ว = ไม่นับเรื่องวัน
  assert.deepEqual(deptCountByTurn(mix, 'undated', opts), { dept: 3, requester: 1 });
  assert.equal(deptCountByTurn(mix, 'nope', opts).dept, 0, 'คีย์ที่แถบไม่รู้จัก = 0 ไม่ใช่ undefined');
});

test('🔴 แยกตาแล้วไม่มีใบหาย — สองตารวมกัน = ผลรวมเดิมของปฏิทิน (ยังไม่ได้ให้วัน · เลยกำหนดแล้ว)', () => {
  /* ปฏิทินเคยโชว์ผลรวมนี้ตรง ๆ (`dueCalendar(...).undated/overdue`) — หลังมติ ตัวเลขหลักเหลือตา RD แต่ตาผู้ขอ
     ต้องยังมีปุ่มของมัน ⇒ ผลรวมสองตาต้องเท่าของเดิม ไม่งั้นมีใบหลุดจากทั้งสองปุ่มเงียบ ๆ */
  const opts = { dept: 'RD', todayIso: t.todayIso };
  const calendar = dueCalendar(openRdRows, { todayIso: t.todayIso });
  const undated = deptCountByTurn(mix, 'undated', opts);
  const overdue = deptCountByTurn(mix, 'overdue', opts);
  assert.equal(undated.dept + undated.requester, calendar.undated);
  assert.equal(overdue.dept + overdue.requester, calendar.overdue);
  // ตัวนับจากใบทั้งหมด (แถบเตือน) = ตัวนับจากใบที่ยังไม่จบ (ปฏิทิน) — ใบที่ถูกตัดทิ้งไม่เคยเข้าเงื่อนไขอยู่แล้ว
  assert.deepEqual(deptCountByTurn(openRdRows, 'undated', opts), undated);
  assert.deepEqual(deptCountByTurn(openRdRows, 'overdue', opts), overdue);
});

/** ใบที่ช่องรายวันของปฏิทินทาแดง ทุกสัปดาห์ที่มีใบ — ทำตาม DueWeekPanel (dueCalendar วางวัน · marks ตัดสินสี) */
function redChipIds(rows, todayIso, weeks = [-4, -3, -2, -1, 0, 1, 2]) {
  const marks = deptCalendarMarks(rows, { todayIso });
  const red = new Set();
  for (const offset of weeks) {
    const cal = dueCalendar(rows, { startIso: weekStart(todayIso, offset), todayIso });
    for (const day of cal.days) for (const item of day.items) if (marks.deptOverdue.has(item.id)) red.add(item.id);
  }
  return red;
}

test('🔴 ปฏิทิน: ใบแดงบนช่องรายวัน ⊆ ใบที่นับเข้า "เลยกำหนดแล้ว" (ตา RD) — ใบตาผู้ขอไม่แดงแม้เลยวัน', () => {
  /* 🐞 รีวิว 19/10: วันนี้ 12/08 · ใบตาผู้ขอสองใบกำหนด 10/08 กับ 11/08 ⇒ ของเดิมทาแดงทั้งสอง (`dueCalendar.overdue`)
     แต่ตา RD = 0 ⇒ ไม่มีแถบแดง ไม่มีโน้ต "เลยกำหนดแล้ว" · กล่องเทาบอก "ไม่มีงานของ RD ที่เลยวัน" เหนือใบแดงสองใบ */
  const today = t.todayIso;
  const requesterLate = [
    req({ id: 'RQ-A', items: [ready], committedDueDate: '2026-08-10' }),
    req({ id: 'RQ-B', items: [ready], committedDueDate: '2026-08-11' }),
  ];
  const opts = { dept: 'RD', todayIso: today };
  assert.deepEqual(deptOverdueByTurn(requesterLate, opts), { dept: 0, requester: 2 });
  const week = dueCalendar(requesterLate, { todayIso: today });
  assert.equal(week.inWeek, 2, 'ใบยังอยู่ในวันของมัน — ไม่หายจากปฏิทิน');
  assert.equal(redChipIds(requesterLate, today).size, 0, 'ตา RD = 0 ⇒ ไม่มีใบแดงบนปฏิทิน');
  const marks = deptCalendarMarks(requesterLate, { todayIso: today });
  assert.deepEqual([...marks.requesterTurn].sort(), ['RQ-A', 'RQ-B'], 'ใบตาผู้ขอถูกวาดเป็นเส้นประ');

  // fixture รวม: ใบแดง = ใบที่ปุ่ม "รอ RD" (แท็บรอ RD ตอบ + ?count=overdue) เปิดเจอ · จำนวนใบแดงทั้งหมด = หัวป้าย
  const opened = new Set(queueRowsFor(deptTurnCountHref('dept', 'overdue'), mix, today).map((r) => r.id));
  const red = redChipIds(openRdRows, today);
  for (const id of red) assert.ok(opened.has(id), `${id} แดงบนปฏิทินแต่ไม่อยู่ในตัวเลข "เลยกำหนดแล้ว"`);
  const all = deptCalendarMarks(openRdRows, { todayIso: today });
  assert.equal(all.deptOverdue.size, deptOverdueByTurn(mix, opts).dept);
  assert.deepEqual([...all.deptOverdue].sort(), [...opened].sort());
  // R2 = ตาผู้ขอ เลยวัน 02/08 → เส้นประ ไม่แดง · W2 = ตา RD เลยวัน 01/08 → แดง
  assert.ok(all.requesterTurn.has('R2') && !all.deptOverdue.has('R2'));
  assert.ok(all.deptOverdue.has('W2') && !all.requesterTurn.has('W2'));
});

test('ตัวตัดสินรายใบ matchesTurnCount = ตาของ requestNextStep + ตัวกรองแถบของคิว · ตาที่ไม่รู้จัก = false', () => {
  const today = { todayIso: t.todayIso };
  for (const r of mix) {
    for (const key of ['overdue', 'undated', 'unacked', 'working']) {
      for (const turn of Object.keys(DEPT_TURN_TAB)) {
        assert.equal(
          matchesTurnCount(r, key, turn, today),
          requestNextStep(r)?.owner === turn && matchesQueueCount(r, key, today),
          `${r.id} ${key}/${turn}`,
        );
      }
      assert.equal(matchesTurnCount(r, key, 'somebody', today), false);
    }
    assert.equal(requestTurn(r), requestNextStep(r)?.owner || null);
  }
});

test('🔴 "เลยกำหนด" ของตารางงานค้างรายคน (ใบตา RD) รวมกัน = หัวป้ายเลยวันที่รับปากไว้', () => {
  // ตารางคนบนหน้าเดียวกันนับเฉพาะใบที่เป็นตาฝ่าย — ผลรวมคอลัมน์ต้องเท่าหัวป้าย ไม่ใช่ผลรวมสองตา
  const deptTurn = mix.filter((r) => r.dept === 'RD' && r.status !== 'draft' && requestNextStep(r)?.owner === 'dept');
  const columnSum = ownerWorkload(deptTurn, t).reduce((n, row) => n + row.overdue, 0);
  assert.equal(columnSum, deptOverdueByTurn(mix, { dept: 'RD', todayIso: t.todayIso }).dept);
});

test('ลิงก์ตัวเลขแยกตา — แท็บของตา + ตัวกรองคีย์เดียวกัน · ตาที่ไม่รู้จัก = คิวเปล่า', () => {
  assert.equal(deptTurnCountHref('dept', 'undated'), '/rd/requests?tab=todo&count=undated');
  assert.equal(deptTurnCountHref('requester', 'undated'), '/rd/requests?tab=waiting&count=undated');
  assert.equal(deptTurnCountHref('dept', 'overdue', { queueHref: '/x' }), '/x?tab=todo&count=overdue');
  assert.equal(deptTurnCountHref('requester', 'overdue'), '/rd/requests?tab=waiting&count=overdue');
  assert.equal(deptTurnCountHref('somebody', 'overdue'), '/rd/requests');
  // แท็บของตาต้องเป็นแท็บที่ deptQueueRows รู้จัก (ตัวเดียวกับที่หน้าคิวใช้ validate)
  assert.deepEqual(Object.values(DEPT_TURN_TAB), ['todo', 'waiting']);
});

/* ── ยามอ่านซอร์ส (จอเป็น JSX) ── */
const live = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
const overviewPage = live(readFileSync(new URL('../../app/rd/page.js', import.meta.url), 'utf8'));
const queuePage = live(readFileSync(new URL('../../app/rd/requests/page.js', import.meta.url), 'utf8'));
const dueWeekPanel = live(readFileSync(new URL('../../components/requests/DueWeekPanel.js', import.meta.url), 'utf8'));

test('🔴 หน้า /rd: การ์ดสายพานใช้ลิงก์จากทะเบียน · ป้ายเลยกำหนดพาไปแท็บพร้อมตัวกรอง', () => {
  assert.match(overviewPage, /router\.push\(deptStageQueueHref\(stage\.key, \{ queueHref: "\/rd\/requests", month: today\.slice\(0, 7\) \}\)\)/);
  assert.match(overviewPage, /deptPipeline\(deptRows, \{ todayIso: today \}\)/, 'เดือนของการ์ดกับลิงก์มาจากวันเดียวกัน');
  assert.match(overviewPage, /router\.push\(deptTurnCountHref\("dept", "overdue", \{ queueHref: "\/rd\/requests" \}\)\)/);
  assert.match(overviewPage, /router\.push\(deptTurnCountHref\("requester", "overdue", \{ queueHref: "\/rd\/requests" \}\)\)/);
  assert.doesNotMatch(overviewPage, /router\.push\("\/rd\/requests\?tab=(todo|history)"\)/, 'ห้ามพาไปแท็บเปล่า');
});

test('🔴 หน้า /rd: หัวป้ายเลยวันที่รับปากไว้ = ตา RD เท่านั้น · ตา RD เป็น 0 = ไม่มีแถบแดง (มติเจ้าของ 19/10 · H9)', () => {
  assert.match(overviewPage, /<strong>เลยวันที่รับปากไว้ \{overdue\.dept\} ใบ<\/strong>/);
  assert.doesNotMatch(overviewPage, /overdue\.total/, 'ผลรวมสองตาห้ามกลับมาเป็นหัวป้าย');
  assert.match(overviewPage, /overdue\.dept > 0 && \(\s*<AlertBanner\s+tone="danger"/, 'แถบแดงขึ้นเฉพาะเมื่อมีใบตา RD');
  // ตา RD เป็น 0 แต่ตาผู้ขอมี ⇒ กล่องเทา (ไม่ใช่แถบแดง) พร้อมปุ่มไปแท็บรอผู้ขอ
  assert.match(overviewPage, /overdue\.dept === 0 && overdue\.requester > 0 && \(\s*<StatusNotice\s+tone="neutral"/);
});

test('🔴 ปฏิทิน: "ยังไม่ได้ให้วัน" / "เลยกำหนดแล้ว" = ตา RD จากชุดเดียวกับแถบเตือน · ตาผู้ขอเป็นปุ่มรอง (M6)', () => {
  // หน้าส่งตัวเลขแยกตาชุดเดียวกับแถบเตือนให้ปฏิทิน — สองก้อนบนหน้าเดียวกันพูดเลขเดียวกัน
  assert.match(overviewPage, /const overdue = useMemo\(\s*\(\) => deptOverdueByTurn\(requests, \{ dept: DEPT, todayIso: today \}\),\s*\[requests, today\],?\s*\);/);
  assert.match(overviewPage, /const undated = useMemo\(\s*\(\) => deptCountByTurn\(requests, "undated", \{ dept: DEPT, todayIso: today \}\),\s*\[requests, today\],?\s*\);/);
  assert.match(overviewPage, /<DueWeekPanel[^>]*undated=\{undated\} overdue=\{overdue\}/);
  // ปฏิทินห้ามอ่านผลรวมสองตาของ dueCalendar มาโชว์อีก
  assert.doesNotMatch(dueWeekPanel, /calendar\.(undated|overdue)/);
  assert.match(dueWeekPanel, /router\.push\(deptTurnCountHref\("dept", "undated", \{ queueHref \}\)\)/);
  assert.match(dueWeekPanel, /ยังไม่ได้ให้วัน \{undated\.dept\}/);
  assert.match(dueWeekPanel, /router\.push\(deptTurnCountHref\("requester", "undated", \{ queueHref \}\)\)/);
  assert.match(dueWeekPanel, /ยังไม่ได้ให้วัน \{undated\.requester\}/);
  assert.match(dueWeekPanel, /เลยกำหนดแล้ว \{overdue\.dept\} ใบ/);
  assert.doesNotMatch(dueWeekPanel, /\?tab=todo&count=undated/, 'ลิงก์มาจาก deptTurnCountHref ไม่ประกอบเอง');
});

test('🔴 ปฏิทิน: สีแดงบนช่องรายวันมาจาก deptCalendarMarks ไม่ใช่ item.overdue ของ dueCalendar (ทุกตา)', () => {
  assert.match(dueWeekPanel, /const marks = useMemo\(\(\) => deptCalendarMarks\(rows, \{ todayIso \}\), \[rows, todayIso\]\);/);
  assert.match(dueWeekPanel, /data-overdue=\{marks\.deptOverdue\.has\(item\.id\) \? "" : undefined\}/);
  assert.match(dueWeekPanel, /data-turn=\{requesterTurn \? "requester" : undefined\}/);
  assert.doesNotMatch(dueWeekPanel, /item\.overdue/, 'item.overdue = เลยวันทุกตา — ทาแดงใบตาผู้ขอที่ตัวเลขไม่นับ');
});

test('🔴 ปฏิทินต้องได้ตัวเลขจากผู้เรียกเสมอ — ไม่มีค่าตั้งต้น 0 · ทุกที่ที่เรียกส่ง undated= และ overdue=', () => {
  /* ค่าตั้งต้น `{ dept: 0, requester: 0 }` ทำให้ผู้เรียกที่ลืมส่ง (เช่นหน้าภาพรวมฝ่ายถัดไป) ได้ปฏิทินที่ไม่มี
     "ยังไม่ได้ให้วัน" เงียบ ๆ — ตัวเลขที่หัวไฟล์บอกว่าต้องอยู่คู่ปฏิทินเสมอ (รีวิว 19/10) */
  assert.match(dueWeekPanel, /^\s*undated,\s*$/m, 'undated ต้องไม่มีค่าตั้งต้น');
  assert.match(dueWeekPanel, /^\s*overdue,\s*$/m, 'overdue ต้องไม่มีค่าตั้งต้น');
  const srcRoot = new URL('../../', import.meta.url);
  const files = readdirSync(srcRoot, { recursive: true })
    .filter((p) => /\.(js|jsx)$/.test(p) && !/node_modules|\.next/.test(p));
  const usages = [];
  for (const p of files) {
    const src = live(readFileSync(new URL(p, srcRoot), 'utf8'));
    for (const m of src.matchAll(/<DueWeekPanel\b[^>]*>/g)) usages.push([p, m[0]]);
  }
  assert.ok(usages.length >= 1, 'ต้องเจออย่างน้อยหน้า /rd');
  for (const [p, tag] of usages) {
    assert.match(tag, /\bundated=\{/, `${p} เรียก DueWeekPanel โดยไม่ส่ง undated`);
    assert.match(tag, /\boverdue=\{/, `${p} เรียก DueWeekPanel โดยไม่ส่ง overdue`);
  }
});

test('🔴 หน้า /rd/requests: ประวัติกรองเดือนด้วยตัวตัดสินเดียวกับการ์ด', () => {
  assert.match(queuePage, /const closedMonth = tab === "history" && isMonthKey\(closedParam\) \? closedParam : null;/);
  assert.match(queuePage, /\.filter\(\(r\) => !closedMonth \|\| requestClosedInMonth\(r, closedMonth\)\)/);
});
