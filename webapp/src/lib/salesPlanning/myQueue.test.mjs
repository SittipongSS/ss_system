// ── คิวของฉัน: ของค้างทุกชนิดในตารางเดียว (แบบ ก) ────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MY_QUEUE_GROUPS, MY_QUEUE_KINDS, buildMyQueue, groupMyQueue, myQueueCounts,
  myQueueGroupKey, sortMyQueue,
} from './myQueue.js';

const todayIso = '2026-08-12';
const build = (over) => buildMyQueue({ todayIso, ...over });

test('⭐ ห้าแหล่งกลายเป็นแถวรูปเดียวกัน — คอลัมน์แรกเป็น "ต้องทำอะไร" ไม่ใช่ป้ายสถานะ', () => {
  const rows = build({
    requests: [{ id: 'R1', docNo: 'RQ-1', kind: 'scent_dev', status: 'acknowledged', committedDueDate: '2026-08-14' }],
    leads: [{ id: 'L1', company: 'บจก. เอ', status: 'assigned', assignedAt: '2026-08-10' }],
    tasks: [{ id: 'T1', title: 'ส่งตัวอย่าง', dueDate: '2026-08-12', status: 'todo' }],
    awaitingSalesOrder: [{ id: 'Q1', quoteNumber: 'QT-1', customerName: 'ลูกค้า', acceptedAt: '2026-08-09' }],
    awaitingFiling: [{ id: 'S1', orderNumber: 'SO-1', customerName: 'ลูกค้า', approvedAt: '2026-08-11' }],
  });
  assert.equal(rows.length, 5);
  assert.deepEqual([...new Set(rows.map((r) => r.kind))].sort(),
    ['document', 'lead', 'request', 'task']);
  for (const r of rows) {
    assert.ok(r.step, `${r.key} ต้องมีก้าวถัดไป`);
    assert.ok(r.title, `${r.key} ต้องมีหัวเรื่อง`);
    assert.ok(r.href.startsWith('/'), `${r.key} ต้องกดไปที่ไหนสักที่ได้`);
    assert.ok(r.key.includes(':'), 'คีย์ต้องไม่ชนกันข้ามชนิด');
  }
  // คีย์ไม่ซ้ำแม้ id จะบังเอิญเหมือนกันข้ามตาราง
  const dup = build({ tasks: [{ id: 'X', title: 'งาน' }], leads: [{ id: 'X', company: 'ลีด' }] });
  assert.equal(new Set(dup.map((r) => r.key)).size, 2);
});

test('⭐ ใบตีกลับใช้วันที่ถูกตีกลับเป็นวันเริ่มค้าง — ไม่งั้นจมท้ายคิวตลอดกาล', () => {
  const rows = build({
    requests: [
      { id: 'B', status: 'draft', bouncedAt: '2026-08-08T03:00:00Z', docNo: 'RQ-9', kind: 'scent_dev' },
      { id: 'N', status: 'acknowledged', committedDueDate: '2026-08-20', docNo: 'RQ-8', kind: 'scent_dev' },
    ],
  });
  const bounced = rows.find((r) => r.id === 'B');
  assert.equal(bounced.step, 'แก้แล้วส่งใหม่');
  assert.equal(bounced.days, -4);
  assert.equal(bounced.dueText, 'ค้างมา 4 วัน');
  assert.equal(bounced.urgent, true, 'ใบตีกลับคือของค้างที่ไม่มีใครทำอยู่ ⇒ ด่วนเสมอ');
  // ⚠️ ไม่ใช่ "เลยกำหนด" — ไม่มีใครเคยรับปากวันไหนไว้กับใบที่ถูกตีกลับ
  assert.equal(bounced.overdue, false);
  assert.equal(myQueueGroupKey(bounced), 'today', 'ค้างที่เรา = ทำได้แล้ววันนี้');
  assert.equal(rows[0].id, 'B', 'ต้องขึ้นก่อนใบที่ยังมีเวลา');
});

test('ลีดที่ไม่มีวันนัด ใช้วันที่รับมาแทน — ลีดที่ดองไว้ต้องไต่ขึ้นมาเอง', () => {
  const rows = build({
    leads: [
      { id: 'OLD', company: 'ดองไว้', status: 'assigned', assignedAt: '2026-08-01' },
      { id: 'NEW', company: 'เพิ่งมา', status: 'assigned', assignedAt: '2026-08-11' },
      { id: 'MEET', company: 'นัดแล้ว', status: 'meeting', meetingAt: '2026-08-13T09:00:00Z' },
    ],
  });
  assert.equal(rows[0].id, 'OLD', 'ลีดที่ดองนานสุดขึ้นก่อน');
  assert.equal(rows.find((r) => r.id === 'MEET').step, 'นัดหมายลูกค้า');
  assert.equal(rows.find((r) => r.id === 'OLD').step, 'โทรกลับลูกค้า');
});

test('⭐ เรียง: เลยกำหนดก่อน · ใกล้กำหนดก่อน · ไม่มีวันไปท้ายเสมอ', () => {
  const rows = sortMyQueue([
    { key: 'a', days: null, urgent: true },
    { key: 'b', days: 3, urgent: false },
    { key: 'c', days: -2, urgent: false },
    { key: 'd', days: 0, urgent: false },
  ]);
  assert.deepEqual(rows.map((r) => r.key), ['c', 'd', 'b', 'a']);
  // ด่วนชนะเมื่อวันเท่ากันเท่านั้น — ไม่ใช่ข้ามหน้าของที่เลยกำหนดไปแล้ว
  const tie = sortMyQueue([
    { key: 'ปกติ', days: 2, urgent: false },
    { key: 'ด่วน', days: 2, urgent: true },
  ]);
  assert.deepEqual(tie.map((r) => r.key), ['ด่วน', 'ปกติ']);
});

test('จัดกลุ่มตามความเร่ง — กลุ่มว่างถูกตัดทิ้ง', () => {
  assert.equal(myQueueGroupKey({ overdue: true, days: -1 }), 'overdue');
  assert.equal(myQueueGroupKey({ days: 0 }), 'today');
  assert.equal(myQueueGroupKey({ days: 5 }), 'week');
  assert.equal(myQueueGroupKey({ days: 30 }), 'later');
  assert.equal(myQueueGroupKey({ days: null }), 'later', 'ไม่มีกำหนด = ยังไม่ต้องทำวันนี้');

  const groups = groupMyQueue([{ days: -1, overdue: true }, { days: 0 }, { days: 0 }]);
  assert.deepEqual(groups.map((g) => g.key), ['overdue', 'today']);
  assert.equal(groups[1].items.length, 2);
  // ผลรวมของทุกกลุ่มต้องเท่าจำนวนแถว — ไม่มีของหายระหว่างจัดกลุ่ม
  const items = [{ days: -1, overdue: true }, { days: 0 }, { days: 4 }, { days: null }];
  assert.equal(groupMyQueue(items).reduce((n, g) => n + g.items.length, 0), items.length);
});

test('🔴 "ค้าง" ไม่ใช่ "สาย" — ของที่ไม่มีใครรับปากวันไว้ ห้ามขึ้นกลุ่มเลยกำหนด', () => {
  /* 🐞 เวอร์ชันแรกให้ทุกแถวใช้กฎเดียวกัน ⇒ ใบเสนอราคาที่เพิ่ง Won เมื่อวานขึ้นกลุ่ม
     "เลยกำหนดแล้ว" ทันที ทั้งที่ไม่มีใครเคยให้วันไว้เลย */
  const rows = build({
    awaitingSalesOrder: [{ id: 'Q', quoteNumber: 'QT-1', acceptedAt: '2026-08-11' }],
    tasks: [{ id: 'T', title: 'งานสาย', dueDate: '2026-08-10' }],
  });
  const quote = rows.find((r) => r.id === 'Q');
  assert.equal(quote.overdue, false);
  assert.equal(quote.dueText, 'ค้างมา 1 วัน');
  assert.equal(myQueueGroupKey(quote), 'today');
  // ส่วนงานที่มีวันกำหนดจริงและเลยไปแล้ว = สายจริง
  const task = rows.find((r) => r.id === 'T');
  assert.equal(task.overdue, true);
  assert.equal(task.dueText, 'เลย 2 วัน');
  assert.equal(myQueueGroupKey(task), 'overdue');
});

test('🔴 ตัวเลขบนแถบนับจากคิวเดียวกับตารางข้างล่างเสมอ', () => {
  const rows = build({
    requests: [
      { id: 'B', status: 'draft', bouncedAt: '2026-08-09T03:00:00Z', kind: 'scent_dev' },
      { id: 'R', status: 'acknowledged', committedDueDate: '2026-08-12', kind: 'scent_dev' },
    ],
    tasks: [{ id: 'T', title: 'งาน', dueDate: '2026-08-01' }],
    awaitingSalesOrder: [{ id: 'Q', quoteNumber: 'QT-1', acceptedAt: '2026-08-11' }],
  });
  const counts = myQueueCounts(rows);
  assert.equal(counts.total, 4);
  // เลยกำหนด = เฉพาะของที่มีคนรับปากวันไว้แล้วเลย (งาน) — ใบตีกลับกับใบเสนอราคา
  // ที่รอออก SO เป็น "ค้าง" ไม่ใช่ "สาย"
  assert.equal(counts.overdue, 1);
  assert.equal(counts.today, 1);
  assert.equal(counts.bounced, 1);
  assert.equal(counts.document, 1);
  assert.equal(counts.byKind.request, 2);
  // ผลรวมรายชนิดต้องเท่ากับจำนวนแถวทั้งหมด — ชนิดที่ไม่มีชิปจะทำให้กรองแล้วของหาย
  assert.equal(Object.values(counts.byKind).reduce((a, b) => a + b, 0), counts.total);
});

test('ทะเบียนชนิด/กลุ่ม — ทุกชนิดที่แถวสร้างได้ต้องมีชิปให้กด', () => {
  const rows = build({
    requests: [{ id: 'R', kind: 'scent_dev', status: 'acknowledged' }],
    leads: [{ id: 'L', company: 'x' }],
    tasks: [{ id: 'T', title: 'x' }],
    awaitingFiling: [{ id: 'S', orderNumber: 'SO-1' }],
  });
  const kinds = new Set(rows.map((r) => r.kind));
  for (const kind of kinds) {
    assert.ok(MY_QUEUE_KINDS.some((k) => k.key === kind), `ชนิด ${kind} ไม่มีชิปในทะเบียน`);
  }
  for (const group of MY_QUEUE_GROUPS) {
    assert.ok(group.label && group.tone, `${group.key} ต้องมีป้ายและโทน`);
  }
});

test('ว่างเปล่าไม่พัง — คิวว่างต้องคืนอาร์เรย์ว่าง ไม่ใช่ throw', () => {
  assert.deepEqual(buildMyQueue({ todayIso }), []);
  assert.deepEqual(buildMyQueue(), []);
  assert.deepEqual(groupMyQueue([]), []);
  assert.equal(myQueueCounts([]).total, 0);
});

/* 🐞 **ใบเดียวสองวันบนจอเดียว** (ตรวจ 2026-08-21) — ปฏิทิน "กำหนดการของฉัน" วางคำร้อง
   ที่ฝ่ายยังไม่รับปากบน `requestedDueDate` แต่คิวนี้อ่านแต่ `committedDueDate` ⇒ ใบเดียวกัน
   โผล่บนปฏิทินวันที่ 25 แต่คิวข้างล่างบอก "ไม่มีกำหนด" · สองที่ต้องอ่านฟิลด์ชุดเดียวกัน */
test('คำร้องที่ฝ่ายยังไม่รับปาก ใช้วันที่ผู้ขอต้องการ — แต่เป็น "ค้าง" ไม่ใช่ "เลยกำหนด"', () => {
  const [row] = build({
    requests: [{
      id: 'R9', docNo: 'RQ-9', kind: 'scent_dev', status: 'pending', requestedDueDate: '2026-08-08',
    }],
  });
  assert.equal(row.due, '2026-08-08');
  assert.equal(row.basis, 'waiting');
  // วันผ่านไปแล้วก็ยังไม่ใช่ "สาย" — ยังไม่มีใครรับปากอะไรไว้
  assert.equal(row.overdue, false);
  assert.equal(row.step, 'รอฝ่ายแจ้งกำหนดส่ง');
});

test('คำร้องที่ฝ่ายรับปากแล้ว ใช้วันที่รับปาก และเลยกำหนดได้', () => {
  const [row] = build({
    requests: [{
      id: 'R8', docNo: 'RQ-8', kind: 'scent_dev', status: 'acknowledged',
      committedDueDate: '2026-08-10', requestedDueDate: '2026-08-01',
    }],
  });
  assert.equal(row.due, '2026-08-10');
  assert.equal(row.basis, 'deadline');
  assert.equal(row.overdue, true);
  assert.equal(row.step, 'รอฝ่ายตอบ');
});
