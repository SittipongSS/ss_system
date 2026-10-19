// ── ภาพรวมฝ่าย: งานอยู่ที่ใคร (แบบ ก) + สายพานนับเป็นกลิ่น (แบบ ค) ───────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEPT_PIPELINE_STAGES, DEPT_STAGE_QUEUE, UNASSIGNED, deptOverdueByTurn, deptPipeline, deptStageQueueHref,
  isMonthKey, ownerWorkload, requestClosedInMonth, requestLineCount, requestStageKey, stageNote, stageValue,
} from './deptOverview.js';
import { FACET_NONE } from './queueList.js';
import { deptQueueRows, matchesQueueCount, queueCounts } from './queueBoard.js';

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
  assert.deepEqual(split, { dept: 1, requester: 1, total: 2 });
  assert.equal(split.dept, queueRowsFor('/rd/requests?tab=todo&count=overdue', mix, t.todayIso).length);
  assert.equal(split.requester, queueRowsFor('/rd/requests?tab=waiting&count=overdue', mix, t.todayIso).length);
  // ผลรวม = เลยกำหนดของทุกใบของฝ่าย (ตัวเลขเดียวกับ "เลยกำหนดแล้ว N ใบ" ของปฏิทิน)
  const deptRows = mix.filter((r) => r.dept === 'RD' && r.status !== 'draft');
  assert.equal(split.total, queueCounts(deptRows, t).overdue);
});

/* ── ยามอ่านซอร์ส (จอเป็น JSX) ── */
const live = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
const overviewPage = live(readFileSync(new URL('../../app/rd/page.js', import.meta.url), 'utf8'));
const queuePage = live(readFileSync(new URL('../../app/rd/requests/page.js', import.meta.url), 'utf8'));

test('🔴 หน้า /rd: การ์ดสายพานใช้ลิงก์จากทะเบียน · ป้ายเลยกำหนดพาไปแท็บพร้อมตัวกรอง', () => {
  assert.match(overviewPage, /router\.push\(deptStageQueueHref\(stage\.key, \{ queueHref: "\/rd\/requests", month: today\.slice\(0, 7\) \}\)\)/);
  assert.match(overviewPage, /deptPipeline\(deptRows, \{ todayIso: today \}\)/, 'เดือนของการ์ดกับลิงก์มาจากวันเดียวกัน');
  assert.match(overviewPage, /router\.push\("\/rd\/requests\?tab=todo&count=overdue"\)/);
  assert.match(overviewPage, /router\.push\("\/rd\/requests\?tab=waiting&count=overdue"\)/);
  assert.doesNotMatch(overviewPage, /router\.push\("\/rd\/requests\?tab=(todo|history)"\)/, 'ห้ามพาไปแท็บเปล่า');
});

test('🔴 หน้า /rd/requests: ประวัติกรองเดือนด้วยตัวตัดสินเดียวกับการ์ด', () => {
  assert.match(queuePage, /const closedMonth = tab === "history" && isMonthKey\(closedParam\) \? closedParam : null;/);
  assert.match(queuePage, /\.filter\(\(r\) => !closedMonth \|\| requestClosedInMonth\(r, closedMonth\)\)/);
});
