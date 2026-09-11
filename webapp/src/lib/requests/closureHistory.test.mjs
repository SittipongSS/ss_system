// ── ม-145 · ปิดแล้วกี่ฝั่ง + ใบที่จบแล้วย้ายไปประวัติทุกขอบเขต ─────────────────
//
// ผู้ใช้ (2026-09-11): *"การปิดเรื่อง มีการแจ้งเตือนที่ตารางว่ายังไม่ปิด แต่กดเข้ารายละเอียด
// มีการกดแล้ว … มันน่าจะมีอะไรบอกว่า ปิดยัง ปิดฝ่ายไหนไปแล้ว ปิดครบยัง และพอเรื่องไหนปิดแล้ว
// อยากให้โยกออกไปในส่วนของประวัติ เพื่อลดความรกของตารางคิว"*
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  closureClearedUpdate, closureWaitLabel, requestClosure, requestClosureLine,
} from './closure.js';
import {
  deptQueueRows, groupQueueRows, matchesQueueCount, queueTabRows, requestDueText, requestGroupKey,
  requestNextStep,
  requestQueueStatus, requestSettled, startHereRequest, visibleQueueRows, waitingOnMeRows,
} from './queueBoard.js';
import { requestAwaitingDue, requestStatusView } from './statuses.js';
import { requestRailSteps } from './requestRail.js';
import { requestColumns } from './queueColumns.js';
import { isKnownUpdateKind, isQuietUpdateKind } from '../master/updateTypes.js';

const ANS = '2026-09-07T03:00:00Z';   // 07/09/26 เวลาไทย
const CLS = '2026-09-08T03:00:00Z';   // 08/09/26 เวลาไทย
const ask = (over = {}) => ({
  id: 'DR-1', kind: 'info', dept: 'RD', requesterDept: 'SA', status: 'acknowledged',
  acknowledgedAt: '2026-09-01T03:00:00Z', committedDueDate: '2026-09-05', items: [], ...over,
});

// ── บรรทัด "ปิดแล้วกี่ฝั่ง" ────────────────────────────────────────────────

test('⭐ บรรทัดปิด: ขึ้นเฉพาะใบที่มีตรา · บอกฝั่งไหนปิดวันไหน · ปิดครบยัง', () => {
  // ยังไม่มีใครกด = ช่วงทำงานปกติ ไม่มีบรรทัด (ตารางไม่รก)
  assert.equal(requestClosureLine(ask()), null);
  assert.equal(requestClosureLine(ask({ status: 'pending' })), null);
  assert.equal(requestClosureLine(ask({ status: 'draft' })), null);

  const dept = requestClosureLine(ask({ status: 'answered', answeredAt: ANS }));
  assert.equal(dept.text, 'ปิดแล้ว 1/2 · RD ✓ 07/09/26');
  assert.equal(dept.full, 'ปิดแล้ว 1/2 · RD ✓ 07/09/26 · SA ยังไม่ปิด — รอ SA ปิด');
  assert.equal(dept.complete, false);

  const requester = requestClosureLine(ask({ closedAt: CLS }));
  assert.equal(requester.text, 'ปิดแล้ว 1/2 · SA ✓ 08/09/26');
  assert.equal(requester.full, 'ปิดแล้ว 1/2 · RD ยังไม่ปิด · SA ✓ 08/09/26 — รอ RD ปิด');

  const both = requestClosureLine(ask({ status: 'closed', answeredAt: ANS, closedAt: CLS }));
  assert.equal(both.complete, true);
  assert.equal(both.done, 2);
  // วันที่ของบรรทัดสั้น = วันที่ใบจบจริง (ตราหลังสุด) ไม่ใช่วันของฝั่งผู้ขอเสมอ
  assert.equal(both.text, 'ปิดครบ 2/2 · 08/09/26');
  assert.equal(both.full, 'ปิดครบ 2/2 · RD ✓ 07/09/26 · SA ✓ 08/09/26');
  const deptLast = requestClosureLine(ask({ status: 'closed', answeredAt: CLS, closedAt: ANS }));
  assert.equal(deptLast.text, 'ปิดครบ 2/2 · 08/09/26');
});

test('บรรทัดปิด: ใบที่ปิดก่อนกฎสองฝั่งไม่ได้ "2/2" · ใบยกเลิกไม่มีบรรทัด · คำถอยไม่มีช่องไฟ', () => {
  // ปิดก่อน 2026-08-20 — มีแต่ตราผู้ขอ แต่สถานะปิดแล้ว ⇒ ห้ามอ้างว่าครบสองฝั่ง
  const legacy = requestClosureLine(ask({ status: 'closed', closedAt: CLS }));
  assert.equal(legacy.complete, true);
  assert.equal(legacy.done, 1);
  assert.equal(legacy.text, 'ปิดเรื่องแล้ว · 08/09/26');
  // ยกเลิกไม่ใช่การปิด — ป้าย "ยกเลิก" พูดจบแล้ว
  assert.equal(requestClosureLine(ask({ status: 'cancelled', closedAt: CLS })), null);
  // ใบเก่าที่ไม่มี requesterDept — "ผู้ขอยังไม่ปิด" ไม่ใช่ "ผู้ขอ ยังไม่ปิด"
  const old = requestClosureLine(ask({ requesterDept: null, status: 'answered', answeredAt: ANS }));
  assert.match(old.full, /ผู้ขอยังไม่ปิด — รอผู้ขอปิด$/);
});

test('⭐ ผู้ขอปิดแล้ว = "รอ RD ปิด" ทุกจอ ไม่ใช่ "รอ RD ตอบ" หรือ "รอกำหนดส่ง"', () => {
  // ใบไม่มีวันกำหนดส่ง — ของเดิม "รอกำหนดส่ง" ทับจนมองไม่เห็นว่าผู้ขอปิดแล้ว (RQ-26080095)
  const noDue = ask({ committedDueDate: null, closedAt: CLS, lastReplySide: 'dept' });
  assert.equal(requestAwaitingDue(noDue), false);
  assert.deepEqual(requestNextStep(noDue), { owner: 'dept', label: 'รอ RD ปิด' });
  assert.equal(requestQueueStatus(noDue).label, 'รอ RD ปิด');
  assert.notEqual(requestStatusView(noDue).label, 'รอกำหนดส่ง');
  assert.equal(closureWaitLabel(noDue, 'dept'), 'รอ RD ปิด');

  // รางบนหน้าใบ — ขั้นกลางเคยพูด "รอ SA ตอบ" (ตามคนโพสต์ล่าสุด) ขัดกับตาราง
  const { steps, index } = requestRailSteps(noDue);
  assert.equal(steps[index].label, 'รอ RD ปิดเรื่อง');
  assert.equal(steps[index].hint, 'SA ปิดแล้ว · 08/09/2026');
  assert.equal(steps.find((s) => s.id === 'closed').hint, 'SA ปิดแล้ว — รอ RD ปิดเรื่อง');

  // ยังไม่มีใครปิด — ตาตอบในเธรดยังเป็นของเดิม (ไม่แตะกติกา replyTurn)
  assert.equal(requestNextStep(ask({ lastReplySide: 'dept' })).label, 'รอ SA ตอบ');
});

// ── ใบยกเลิกที่มีตราปิดค้าง ────────────────────────────────────────────────

test('🐞 ใบยกเลิกที่ผู้ขอเคยกดปิดฝั่งตัวเอง — จบแล้ว ไม่ค้างในคิว RD (RQ-26080058)', () => {
  const cancelled = ask({ status: 'cancelled', closedAt: CLS, cancelledAt: '2026-09-10T03:00:00Z' });
  assert.equal(requestClosure(cancelled).waitingSide, null);
  assert.equal(requestClosure(cancelled).complete, false);
  assert.equal(requestNextStep(cancelled), null);
  assert.equal(requestSettled(cancelled), true);
  // ไม่อยู่ในแท็บ "รอ RD ตอบ" ⇒ ไม่ถูกนับในป้ายเมนูของ RD
  assert.deepEqual(deptQueueRows([cancelled], { dept: 'RD', tab: 'todo' }), []);
  assert.deepEqual(deptQueueRows([cancelled], { dept: 'RD', tab: 'history' }), [cancelled]);
  // คำใต้ขั้นสุดท้ายของราง = คำอธิบายของการ์ด — เคยเป็น "ต้องปิดทั้งสองฝั่งถึงจะจบ"
  const { steps, index } = requestRailSteps(cancelled);
  assert.equal(steps[index].hint, 'ยกเลิกเมื่อ 10/09/2026');
});

// ── ย้ายไปประวัติ ────────────────────────────────────────────────────────────

const rows = [
  ask({ id: 'OPEN', _mine: true }),
  ask({ id: 'DEPT-ONLY', _mine: true, status: 'answered', answeredAt: ANS }),
  ask({ id: 'REQ-ONLY', _mine: true, closedAt: CLS }),
  ask({ id: 'CLOSED', _mine: true, status: 'closed', answeredAt: ANS, closedAt: CLS }),
  ask({ id: 'CANCEL', _mine: true, status: 'cancelled', cancelledAt: CLS }),
  ask({ id: 'TEAM-CLOSED', _mine: false, status: 'closed', answeredAt: ANS, closedAt: CLS }),
  ask({ id: 'TEAM-OPEN', _mine: false }),
];
const ids = (list) => list.map((r) => r.id);

test('⭐ "ที่ฉันเปิด" = ใบของฉันที่ยังไม่จบ · ใบที่จบแล้วอยู่ประวัติที่เดียว', () => {
  assert.deepEqual(ids(queueTabRows(rows, { tab: 'mine' })), ['OPEN', 'DEPT-ONLY', 'REQ-ONLY']);
  assert.deepEqual(
    ids(queueTabRows(rows, { tab: 'history' })),
    ['CLOSED', 'CANCEL', 'TEAM-CLOSED'],
  );
  // ⚠️ ตราเดียวยังไม่จบ (มติ 2026-08-20) — ไม่ย้ายไปประวัติ
  assert.equal(requestSettled(rows[1]), false);
  assert.equal(requestSettled(rows[2]), false);
});

test('⭐ ขอบเขตทีม/ทั้งหมด: แบ่ง "ในคิว / ประวัติ" · ไม่กรองด้วย "ฉัน" (ม-106 ยังอยู่)', () => {
  for (const scope of ['team', 'all']) {
    const open = visibleQueueRows(rows, { scope, tab: 'todo', myDepts: [] });
    assert.deepEqual(ids(open), ['OPEN', 'DEPT-ONLY', 'REQ-ONLY', 'TEAM-OPEN'], scope);
    // แท็บบทบาทที่ค้างใน URL (`mine`) ไม่กรองด้วย `_mine` ในขอบเขตกว้าง
    assert.deepEqual(ids(visibleQueueRows(rows, { scope, tab: 'mine' })), ids(open), scope);
    const history = visibleQueueRows(rows, { scope, tab: 'history' });
    assert.deepEqual(ids(history), ['CLOSED', 'CANCEL', 'TEAM-CLOSED'], scope);
    // สองชุดต่อกันได้ครบทุกใบ ไม่มีใบหาย ไม่มีใบซ้ำ
    assert.equal(open.length + history.length, rows.length, scope);
  }
});

test('ป้ายตัวเลขบนเมนูไม่ขยับ — ใบที่ปิดฝั่งเดียวยังเป็นงานค้าง', () => {
  // waitingOnMeRows = ชุดของป้ายเมนู · ใบ "รอ SA ปิด" ของฉันยังต้องนับ
  assert.deepEqual(ids(waitingOnMeRows(rows, { myDepts: [] })), ['DEPT-ONLY']);
  assert.deepEqual(ids(waitingOnMeRows(rows, { myDepts: ['RD'] })), ['OPEN', 'DEPT-ONLY', 'REQ-ONLY', 'TEAM-OPEN']);
});

// ── กลุ่ม "จบแล้ว" / เริ่มที่นี่ / กำหนดส่ง ───────────────────────────────────

test('🐞 ใบที่รอผู้ขอปิด ไม่อยู่กลุ่ม "จบแล้ว" · ไม่ใช่ "เลยกำหนด" · การ์ดเริ่มที่นี่ชี้ได้', () => {
  const today = '2026-09-11';
  const deptOnly = ask({ id: 'D', _mine: true, status: 'answered', answeredAt: ANS });
  assert.equal(requestGroupKey(deptOnly, { todayIso: today }), 'open');
  // ผู้ขอปิดแล้ว (RD ยังไม่ได้กด) — งานจบในสายตาผู้ขอแล้ว ไม่ใช่ "เลยกำหนด"
  assert.equal(requestGroupKey(ask({ closedAt: CLS }), { todayIso: today }), 'open');
  // ใบที่ยังไม่มีใครปิดยังเป็น "เลยกำหนด" ตามเดิม
  assert.equal(requestGroupKey(ask(), { todayIso: today }), 'overdue');
  // ของเดิมยังเหมือนเดิม: ร่างที่ไม่เคยส่ง/ปิดแล้ว = จบแล้ว · ตีกลับ = บนสุด
  assert.equal(requestGroupKey(ask({ status: 'draft' })), 'settled');
  assert.equal(requestGroupKey(ask({ status: 'draft', bouncedAt: CLS })), 'bounced');
  assert.equal(requestGroupKey(ask({ status: 'closed', answeredAt: ANS, closedAt: CLS })), 'settled');
  assert.equal(requestGroupKey(ask({ status: 'cancelled', closedAt: CLS })), 'settled');

  const pick = startHereRequest([deptOnly], { todayIso: today });
  assert.equal(pick?.request.id, 'D');
  assert.equal(pick.next.label, 'รอ SA ปิด');
  assert.deepEqual(groupQueueRows([deptOnly], { todayIso: today }).map((g) => g.group), ['open']);
});

test('🐞 ใบที่จบแล้ว/มีฝั่งปิดแล้วไม่ขึ้น "เลย N วัน" สีแดง · แถบตัวเลขไม่นับ', () => {
  const today = '2026-09-11';
  const closed = ask({ status: 'closed', answeredAt: ANS, closedAt: CLS });
  assert.deepEqual(requestDueText(closed, { todayIso: today }), { date: '2026-09-05', note: null, overdue: false });
  const deptOnly = ask({ status: 'answered', answeredAt: ANS });
  assert.equal(requestDueText(deptOnly, { todayIso: today }).overdue, false);
  // 16 ใบจริงที่ผู้ขอปิดแล้วเคยขึ้น "เลย N วัน" สีแดง — แถวเดียวบอก "SA ✓" คู่กับ "ค้างเลยกำหนด"
  const requesterOnly = ask({ closedAt: CLS });
  assert.equal(requestDueText(requesterOnly, { todayIso: today }).overdue, false);
  // ใบที่ยังค้างที่ฝ่ายยังนับถอยหลังตามเดิม
  assert.deepEqual(requestDueText(ask(), { todayIso: today }), { date: '2026-09-05', note: 'เลย 6 วัน', overdue: true });

  // ⚠️ ตัวกรอง "เลยกำหนด" / "ยังไม่ได้ให้วัน" ต้องตัดสินตรงกับช่องกำหนดส่ง — กดแล้วต้องเจอแถวแดง
  for (const r of [deptOnly, requesterOnly]) {
    assert.equal(matchesQueueCount(r, 'overdue', { todayIso: today }), false);
    assert.equal(matchesQueueCount({ ...r, committedDueDate: null }, 'undated', { todayIso: today }), false);
  }
  assert.equal(matchesQueueCount(ask(), 'overdue', { todayIso: today }), true);
  assert.equal(matchesQueueCount(ask({ committedDueDate: null }), 'undated', { todayIso: today }), true);
  // "รอ SA ปิด" ยังนับในช่องรอผู้ขอทำต่อ · "รอ RD ปิด" ยังเป็นงานของฝ่าย
  assert.equal(matchesQueueCount(deptOnly, 'waitingRequester'), true);
  assert.equal(matchesQueueCount(requesterOnly, 'working'), true);
});

test('แท็บประวัติโชว์ "วันที่ปิดเรื่อง" แทน "กำหนดส่ง"', () => {
  const history = requestColumns('history');
  assert.ok(history.includes('closed'));
  assert.ok(!history.includes('due'));
  assert.deepEqual(requestColumns('queue').filter((k) => k !== 'due'), history.filter((k) => k !== 'closed'));
});

// ── ตราหลุดตามข้อความต้องมีบรรทัดในเธรด ────────────────────────────────────

test('⭐ ตราหลุดเพราะอีกฝั่งพิมพ์ — เธรดบอกว่าของใครหลุดเพราะใคร · ไม่เด้งซ้ำ', () => {
  const requesterCleared = closureClearedUpdate(ask({ closedAt: CLS }), 'requester');
  assert.equal(requesterCleared.kind, 'closure_cleared');
  assert.equal(
    requesterCleared.body,
    'ถอนการปิดฝั่ง SA อัตโนมัติ — มีข้อความใหม่ในเธรดหลัง SA ปิดแล้ว · ใบกลับมาเปิด รอปิดให้ครบสองฝั่ง',
  );
  // ⚠️ ไม่อ้างว่าฝ่ายไหนพิมพ์ — แอดมิน/ฝ่ายอื่นพิมพ์ก็นับเป็นฝั่งผู้ขอ (ชื่อคนพิมพ์อยู่บนแถว)
  const deptCleared = closureClearedUpdate(ask({ answeredAt: ANS }), 'dept');
  assert.equal(
    deptCleared.body,
    'ถอนการปิดฝั่ง RD อัตโนมัติ — มีข้อความใหม่ในเธรดหลัง RD ตอบแล้ว · ใบกลับมาเปิด รอปิดให้ครบสองฝั่ง',
  );
  assert.doesNotMatch(deptCleared.body, /SA พิมพ์/);
  // ใบเก่าไม่มี requesterDept — คำถอยไทยไม่มีช่องไฟ
  assert.match(
    closureClearedUpdate(ask({ requesterDept: null, closedAt: CLS }), 'requester').body,
    /^ถอนการปิดฝั่งผู้ขออัตโนมัติ — มีข้อความใหม่ในเธรดหลังผู้ขอปิดแล้ว/,
  );
  assert.equal(closureClearedUpdate(ask(), null), null);

  // ต้องอยู่ในทะเบียน (ไม่งั้นเธรดขึ้นป้าย "ข้อความ") · quiet เพราะมาคู่กับข้อความที่เด้งแล้ว
  assert.equal(isKnownUpdateKind('dept_request', 'closure_cleared'), true);
  assert.equal(isQuietUpdateKind('dept_request', 'closure_cleared'), true);
});

test('route ข้อความ: ตราหลุดแล้วเขียนเธรด + audit เฉพาะตอนอัปเดตใบสำเร็จ', () => {
  const route = readFileSync(new URL('../../app/api/updates/route.js', import.meta.url), 'utf8');
  assert.match(route, /if \(clears && !turnError\)/);
  assert.match(route, /closureClearedUpdate\(parent, clears\)/);
  assert.match(route, /entityType: 'dept_request',\s*entityId,/);
});

test('ประวัติเรียง "ปิดล่าสุดก่อน" — วันที่จบจริงคือตราหลังสุดของสองฝั่ง', async () => {
  const { REQUEST_SORT_OPTIONS, requestSortDefaultDir, sortRequestRows } = await import('./queueList.js');
  assert.equal(REQUEST_SORT_OPTIONS.find((o) => o.key === 'closed')?.label, 'วันที่ปิดเรื่อง');
  assert.equal(requestSortDefaultDir('closed'), 'desc');
  const list = [
    { id: 'cancel-old', status: 'cancelled', cancelledAt: '2026-08-20T00:00:00Z' },
    // ผู้ขอปิดก่อน ฝ่ายกดทีหลัง — วันจบคือวันของฝ่าย ไม่ใช่ closedAt
    { id: 'dept-last', status: 'closed', closedAt: '2026-09-01T00:00:00Z', answeredAt: '2026-09-09T00:00:00Z' },
    { id: 'closed-mid', status: 'closed', answeredAt: '2026-09-03T00:00:00Z', closedAt: '2026-09-04T00:00:00Z' },
  ];
  assert.deepEqual(
    sortRequestRows(list, { key: 'closed', dir: 'desc' }).map((r) => r.id),
    ['dept-last', 'closed-mid', 'cancel-old'],
  );
});

test('ทุกหน้าที่มีแท็บประวัติ: เรียงวันที่ปิด · ไม่มีแถบตัวเลข · คอลัมน์ชุด history', () => {
  for (const page of ['requests', 'rd/requests', 'finance/requests', 'service/requests']) {
    const src = readFileSync(new URL(`../../app/${page}/page.js`, import.meta.url), 'utf8');
    assert.match(src, /setSort\(inHistory \? "closed" : "(urgency|created)"\)/, page);
    assert.match(src, /tab !== "history" && \(\s*<QueueCountStrip/, page);
    assert.match(src, /columns=\{tab === "history" \? "history" : "queue"\}/, page);
    assert.match(src, /if \(next === "history"\) board\.setCountFilter\(null\);/, page);
  }
});

// ── รอบรีวิว (2026-09-11) — จออื่นต้องตัดสินตรงกับคิว ──────────────────────────

test('วันที่ใบจบจริง = ตราหลังสุด · คอลัมน์กับตัวเรียงใช้ตัวเดียวกัน', async () => {
  const { requestClosedOn } = await import('./closure.js');
  // ผู้ขอปิด 21/08 ฝ่ายกด 01/09 (RQ-26080061) — ใบจบ 01/09 ไม่ใช่ 21/08
  assert.equal(
    requestClosedOn(ask({ status: 'closed', closedAt: '2026-08-21T03:00:00Z', answeredAt: '2026-09-01T03:00:00Z' })),
    '2026-09-01T03:00:00Z',
  );
  assert.equal(requestClosedOn(ask({ status: 'cancelled', cancelledAt: CLS, closedAt: ANS })), CLS);
  const panel = readFileSync(new URL('../../components/requests/RequestQueuePanel.js', import.meta.url), 'utf8');
  assert.match(panel, /fmtDate\(requestClosedOn\(ask\)\)/);
  const list = readFileSync(new URL('./queueList.js', import.meta.url), 'utf8');
  assert.match(list, /key === 'closed'\) return String\(requestClosedOn\(row\)/);
});

test('ความเร่ง: ใบที่มีฝั่งปิดแล้วไม่ลอยเหนือใบที่เลยกำหนดจริง', async () => {
  const { compareRequestUrgency } = await import('./queue.js');
  const closedOld = ask({ id: 'SA-closed', committedDueDate: '2026-08-01', closedAt: CLS });
  const overdue = ask({ id: 'late', committedDueDate: '2026-09-05' });
  assert.deepEqual([closedOld, overdue].sort(compareRequestUrgency).map((r) => r.id), ['late', 'SA-closed']);
  // การ์ด "เริ่มที่นี่" ชี้ใบบนสุดของลำดับเดียวกัน
  const pick = startHereRequest([closedOld, overdue], { todayIso: '2026-09-11' });
  assert.equal(pick.request.id, 'late');
});

test('แดชบอร์ดขาย "คิวของฉัน": ปิดสองฝั่งพูดตรงกับคิว', async () => {
  const { buildMyQueue, myQueueGroupKey } = await import('../salesPlanning/myQueue.js');
  const today = '2026-09-11';
  const queue = buildMyQueue({
    todayIso: today,
    requests: [
      // เราปิดแล้ว รอ RD — ไม่ใช่ "รอฝ่ายตอบ · เลย N วัน"
      ask({ id: 'REQ-ONLY', committedDueDate: '2026-08-20', closedAt: CLS }),
      // RD ตอบแล้ว — ของค้างของเราคือกดปิด
      ask({ id: 'DEPT-ONLY', status: 'answered', answeredAt: ANS }),
      // ปิดครบ/ยกเลิกไม่ใช่ของค้าง
      ask({ id: 'CLOSED', status: 'closed', answeredAt: ANS, closedAt: CLS }),
      ask({ id: 'CANCEL', status: 'cancelled', closedAt: CLS }),
    ],
  });
  const byId = Object.fromEntries(queue.map((r) => [r.id, r]));
  // เราปิดแล้ว = ไม่มีอะไรให้เราทำ ⇒ ไม่อยู่ในคิว (ตรงกับกำหนดการของฉัน) — รอบแรกไปตก "ครบกำหนดวันนี้"
  assert.equal(byId['REQ-ONLY'], undefined);
  assert.equal(byId['DEPT-ONLY'].step, 'ปิดเรื่อง');
  assert.equal(byId['DEPT-ONLY'].overdue, false);
  // ของค้างของเรา = ทำได้วันนี้ · วันเริ่มค้างเป็นวันไทยของตราฝ่าย (ตอบตี 3 = วันเดียวกันในไทย)
  assert.equal(myQueueGroupKey(byId['DEPT-ONLY']), 'today');
  const early = buildMyQueue({
    todayIso: '2026-09-11',
    requests: [ask({ id: 'E', status: 'answered', answeredAt: '2026-09-10T20:00:00Z' })],
  })[0];
  assert.equal(early.due, '2026-09-11');
  assert.equal(early.dueText, 'วันนี้');
  assert.equal(byId.CLOSED, undefined);
  assert.equal(byId.CANCEL, undefined);
  // API ต้องโหลดใบที่รอเรากดปิดด้วย
  const route = readFileSync(new URL('../../app/api/sales-planning/my-dashboard/route.js', import.meta.url), 'utf8');
  assert.match(route, /\.in\('status', \['draft', 'pending', 'acknowledged', 'answered'\]\)/);
});

test('กำหนดการของฉัน: ใบที่เราปิดแล้วไม่ขึ้นปฏิทิน/ไม่ค้าง', async () => {
  const { buildScheduleDueItems } = await import('../salesPlanning/mySchedule.js');
  const items = buildScheduleDueItems({
    todayIso: '2026-09-11',
    requests: [
      ask({ id: 'REQ-ONLY', committedDueDate: '2026-08-20', closedAt: CLS }),
      ask({ id: 'OPEN', committedDueDate: '2026-08-20' }),
    ],
  });
  assert.deepEqual(items.filter((i) => i.kind === 'request').map((i) => i.id), ['OPEN']);
});

test('หมุดไทม์ไลน์: ใบที่ปิดฝั่งเดียวยังเป็นเรื่องค้าง', async () => {
  const { requestsByStepKey: groupRequestsByStep, stepPinSummary } = await import('./pins.js');
  const byStep = groupRequestsByStep([
    ask({ id: 'A', stepKey: 's1', status: 'answered', answeredAt: ANS }),
    ask({ id: 'B', stepKey: 's1', status: 'closed', answeredAt: ANS, closedAt: CLS }),
  ]);
  assert.equal(stepPinSummary(byStep, 's1').open, 1);
});

test('ตัวสลับ "ในคิว" ถอด ?tab= ออก — รีเฟรช/ย้อนกลับไม่บีบขอบเขตเป็น "ของฉัน"', () => {
  const page = readFileSync(new URL('../../app/requests/page.js', import.meta.url), 'utf8');
  assert.match(page, /onChange=\{\(v\) => setTab\(v === "history" \? "history" : null\)\}/);
  assert.match(page, /router\.replace\(next \? `\/requests\?tab=\$\{next\}` : "\/requests"/);
  // ช่องกำหนดส่งของใบที่มีฝั่งปิดแล้วเป็นขีด ไม่ใช่ "ยังไม่ให้วัน" (ตรงกับตัวกรอง)
  const panel = readFileSync(new URL('../../components/requests/RequestQueuePanel.js', import.meta.url), 'utf8');
  assert.match(panel, /if \(requestClosureStarted\(ask\) \|\| requestSettled\(ask\)\) return <span className=\{styles\.muted\}>\{NA\}<\/span>;/);
});

// ── รอบรีวิวสอง (2026-09-11) ─────────────────────────────────────────────────

test('หัวใบ: ใบที่จบ/มีฝั่งปิดแล้วไม่นับถอยหลัง · เหตุที่ไม่มีวันพูดตามสถานะจริง', async () => {
  const { requestHeaderFacts } = await import('./headerFacts.js');
  const now = new Date('2026-09-11T05:00:00Z');
  const facts = (over) => Object.fromEntries(
    requestHeaderFacts(ask({ requestedDueDate: '2026-08-20', committedDueDate: null, ...over }), { now })
      .map((f) => [f.key, f]),
  );
  const requesterClosed = facts({ closedAt: CLS });
  assert.equal(requesterClosed.requestedDue.sub, null);
  assert.equal(requesterClosed.committedDue.value, '—');
  assert.equal(requesterClosed.committedDue.sub, 'SA ปิดแล้ว — ไม่ต้องแจ้งกำหนดส่ง');
  // ใบยกเลิกที่มีตราค้าง (RQ-26080058) — ต้องบอกว่ายกเลิก ไม่ใช่ "ปิดเรื่องแล้ว"
  assert.equal(facts({ status: 'cancelled', closedAt: CLS }).committedDue.sub, 'ยกเลิกแล้ว — ไม่มีกำหนดส่ง');
  assert.equal(
    facts({ status: 'closed', answeredAt: ANS, closedAt: CLS }).committedDue.sub,
    'RD ไม่ได้แจ้งกำหนดส่ง — ปิดครบแล้ว',
  );
  // ใบที่ยังเดินอยู่ยังนับถอยหลังและทวงวันตามเดิม
  const open = facts({});
  assert.match(open.requestedDue.sub, /เลยกำหนด/);
  assert.equal(open.committedDue.value, 'ยังไม่ระบุ');
  assert.equal(open.committedDue.sub, 'RD ยังไม่ได้แจ้งกำหนดส่ง');
});

test('วันปิดตัวเดียวทุกที่: tooltip หมุด "ปิด" + สายพาน "ปิดเดือนนี้" ใช้ตราหลังสุด (เวลาไทย)', async () => {
  const { requestQueueTrack } = await import('./queueTrack.js');
  const { deptPipeline } = await import('./deptOverview.js');
  // ผู้ขอปิด 21/08 · ฝ่ายกด 01/09 (RQ-26080061)
  const late = ask({ status: 'closed', closedAt: '2026-08-21T03:00:00Z', answeredAt: '2026-09-01T03:00:00Z' });
  const note = requestQueueTrack(late).steps.find((st) => st.key === 'close').note;
  assert.match(note, /เมื่อ 01\/09\/2026/);
  const closedStage = (rows) => deptPipeline(rows, { todayIso: '2026-09-11' }).find((st) => st.key === 'closed');
  assert.equal(closedStage([late]).requests, 1);
  // ตี 2 ของวันที่ 1 ก.ย. เวลาไทย = 31 ส.ค. UTC — ต้องนับเป็นเดือน ก.ย.
  const thaiDawn = ask({ status: 'closed', closedAt: '2026-08-20T03:00:00Z', answeredAt: '2026-08-31T19:00:00Z' });
  assert.equal(closedStage([thaiDawn]).requests, 1);
});

test('ตารางแจกงานผู้ปรุง: ใบที่มีฝั่งปิดแล้วไม่ "เลยกำหนด"', async () => {
  const { isOverdue } = await import('../rd/perfumerBoard.js');
  assert.equal(isOverdue({ dueDate: '2026-08-20', sent: false, closureStarted: true }, '2026-09-11'), false);
  assert.equal(isOverdue({ dueDate: '2026-08-20', sent: false, closureStarted: false }, '2026-09-11'), true);
});

test('ตารางว่างเพราะคำค้น/ตัวกรอง ต้องไม่ใช้ข้อความ "ไม่มีใบ" ของผู้เรียก', () => {
  const panel = readFileSync(new URL('../../components/requests/RequestQueuePanel.js', import.meta.url), 'utf8');
  assert.match(panel, /rows\.length > 0 && \(String\(search \|\| ""\)\.trim\(\) \|\| filterCount > 0\)/);
  assert.match(panel, /if \(requestClosureStarted\(ask\) \|\| requestSettled\(ask\)\) return/);
});

test('แดชบอร์ดขายกับคิวคำร้องตอบตรงกันว่า "ตาใคร" — ตาผู้ขอไม่ใช่ "รอฝ่ายตอบ" (2026-09-11 · 25 ใบ)', async () => {
  const { buildMyQueue } = await import('../salesPlanning/myQueue.js');
  const today = '2026-09-11';
  const cases = [
    ask({ id: 'THREAD-SA', lastReplySide: 'dept', lastReplyAt: '2026-09-05T03:00:00Z' }),      // รอ SA ตอบ
    ask({ id: 'THREAD-RD', lastReplySide: 'requester', lastReplyAt: '2026-09-05T03:00:00Z' }), // รอ RD ตอบ
    ask({ id: 'ROWS-SA', kind: 'scent_dev', items: [{ id: 'x', ackAt: '2026-09-01', readyAt: '2026-09-03' }] }),
    ask({ id: 'ROWS-RD', kind: 'scent_dev', items: [{ id: 'y', ackAt: '2026-09-01' }] }),
  ];
  const queue = Object.fromEntries(buildMyQueue({ todayIso: today, requests: cases }).map((r) => [r.id, r]));
  for (const request of cases) {
    const owner = requestNextStep(request)?.owner;
    const row = queue[request.id];
    if (owner === 'requester') {
      assert.notEqual(row.step, 'รอฝ่ายตอบ', `${request.id}: คิวบอกตาผู้ขอ`);
      assert.equal(row.basis, 'waiting', request.id);
      assert.equal(row.overdue, false, `${request.id}: ของที่ค้างที่เราไม่ใช่ "เลยกำหนด" ของฝ่าย`);
    } else {
      assert.equal(row.step, 'รอฝ่ายตอบ', `${request.id}: คิวบอกตาฝ่าย`);
    }
  }
});
