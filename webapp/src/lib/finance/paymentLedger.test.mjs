import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEDGER_COLUMNS, LEDGER_GROUP_OPTIONS, LEDGER_SORT_OPTIONS, filterLedger, groupAsOrder,
  groupLedgerBuckets, groupLedgerByOrder, groupNote, ledgerReport, ledgerRow, ledgerSortDir,
  ledgerSummary, orderStateIndex, pendingConfirmations, sortLedger, sortLedgerGroups,
} from './paymentLedger.js';

const TODAY = '2026-08-13';

const make = (extra = {}, orderExtra = {}) => ledgerRow({
  installment: {
    id: `SOI-${extra.seq || 1}`, seq: 1, label: 'มัดจำ', percent: 50, amount: 15000,
    status: 'pending', evidence: [], ...extra,
  },
  order: { id: 'SOR-1', orderNumber: 'SO-26080008-0', quotationId: 'QT-1', team: 'SV', ...orderExtra },
  quotation: { id: 'QT-1', quoteNumber: 'QT-26080042-0' },
  customer: { name: 'บริษัท วี.เอ็น.อลูมิเนียม จำกัด', arCode: 'AR-0001' },
  todayIso: TODAY,
});

// ── การอ้างอิงเอกสาร ─────────────────────────────────────────────────────
/* 🔴 คำสั่งผู้ใช้ระบุตรง ๆ ว่า "ราคาต้องมีการอ้างอิง QT SO" — แถวที่มียอดแต่ไม่มี
   เลขเอกสารกำกับคือแถวที่บัญชีเอาไปกระทบยอดไม่ได้ ต้องเดินไปถามฝ่ายขายทีละงวด */
test('ทุกแถวมีเลขที่ SO และเลข QT กำกับยอด', () => {
  const r = make();
  assert.equal(r.orderNumber, 'SO-26080008-0');
  assert.equal(r.quoteNumber, 'QT-26080042-0');
  assert.equal(r.amount, 15000);
  // id ติดมาด้วยเพื่อทำลิงก์ได้ ไม่ต้องค้นจากเลขที่
  assert.equal(r.orderId, 'SOR-1');
  assert.equal(r.quotationId, 'QT-1');
});

test('คอลัมน์ที่ส่งออกมีทั้ง SO และ QT และยอดเป็นคอลัมน์เงิน', () => {
  const keys = LEDGER_COLUMNS.map((c) => c.key);
  assert.ok(keys.includes('orderNumber') && keys.includes('quoteNumber'));
  assert.equal(LEDGER_COLUMNS.find((c) => c.key === 'amount').money, true);
});

// ── เลยกำหนด ─────────────────────────────────────────────────────────────
test('งวดที่รอบัญชีตรวจแต่เลยกำหนดแล้ว ยังต้องขึ้นธงเลยกำหนด', () => {
  // เงินอาจเข้าแล้วแต่ยังไม่มีใครรับรอง = ภาระของบัญชี ไม่ใช่ของลูกค้า
  assert.equal(make({ status: 'reported', dueDate: '2026-08-01' }).overdue, true);
  assert.equal(make({ status: 'confirmed', dueDate: '2026-08-01' }).overdue, false);
  assert.equal(make({ status: 'pending', dueDate: '2026-08-20' }).overdue, false);
  // ไม่มีกำหนด = ยังไม่ถูกนัด ไม่ใช่เลยกำหนด
  assert.equal(make({ status: 'pending', dueDate: null }).overdue, false);
});

// ── ยอดรวม ───────────────────────────────────────────────────────────────
/* 🔴 กติกาจาก mig 0245: `reported` คือ SA แจ้งเอง ยังไม่มีใครรับรอง — นับเป็น
   "เก็บได้" เมื่อไรเท่ากับไม่มีด่าน เพราะฝ่ายขายกดเองแล้วตัวเลขขึ้นเอง */
test('เงินที่ SA แจ้งแล้วแต่บัญชียังไม่รับรอง ไม่นับเป็นเก็บได้', () => {
  const s = ledgerSummary([
    make({ seq: 1, status: 'confirmed', amount: 10000 }),
    make({ seq: 2, status: 'reported', amount: 5000 }),
    make({ seq: 3, status: 'pending', amount: 3000 }),
  ]);
  assert.equal(s.collectedAmount, 10000);
  assert.equal(s.awaitingAmount, 5000);
  assert.equal(s.awaitingCount, 1);
  assert.equal(s.outstandingAmount, 8000); // ทุกอย่างที่ยังไม่ confirmed
  assert.equal(s.totalAmount, 18000);
});

// ── ตัวกรอง ──────────────────────────────────────────────────────────────
test('ค้นหาเจอทั้งจากเลข SO เลข QT ชื่อลูกค้า และรหัสลูกค้า', () => {
  const rows = [make()];
  for (const q of ['SO-26080008', 'qt-26080042', 'อลูมิเนียม', 'ar-0001']) {
    assert.equal(filterLedger(rows, { q }).length, 1, `หาไม่เจอด้วย "${q}"`);
  }
  assert.equal(filterLedger(rows, { q: 'ไม่มีจริง' }).length, 0);
});

/* ⚠️ ช่วงวันกรองที่ "กำหนดชำระ" — งวดที่ยังไม่มีกำหนดต้องหลุดช่วง ไม่ใช่ติดมาด้วย
   ไม่งั้นรายงานรอบเดือนจะมีงวดที่ไม่มีใครนัดว่าจะเก็บเมื่อไรปนอยู่ */
test('กรองช่วงวันแล้วงวดที่ยังไม่มีกำหนดต้องไม่ติดมา', () => {
  const rows = [
    make({ seq: 1, dueDate: '2026-08-05' }),
    make({ seq: 2, dueDate: '2026-09-05' }),
    make({ seq: 3, dueDate: null }),
  ];
  const got = filterLedger(rows, { from: '2026-08-01', to: '2026-08-31' });
  assert.deepEqual(got.map((r) => r.dueDate), ['2026-08-05']);
});

test('กรองสถานะและเฉพาะที่เลยกำหนด', () => {
  const rows = [
    make({ seq: 1, status: 'confirmed', dueDate: '2026-08-01' }),
    make({ seq: 2, status: 'reported', dueDate: '2026-08-01' }),
  ];
  assert.equal(filterLedger(rows, { status: ['reported'] }).length, 1);
  assert.equal(filterLedger(rows, { overdueOnly: true }).length, 1);
  assert.equal(filterLedger(rows, {}).length, 2); // ตัวกรองว่าง = ไม่กรอง
});

// ── การเรียง ─────────────────────────────────────────────────────────────
test('ของที่ต้องทำก่อนอยู่บนสุด และงวดที่ยังไม่มีกำหนดไปท้ายสุด', () => {
  const rows = [
    make({ seq: 4, status: 'pending', dueDate: null }),
    make({ seq: 3, status: 'pending', dueDate: '2026-08-20' }),
    make({ seq: 2, status: 'reported', dueDate: '2026-08-25' }),
    make({ seq: 1, status: 'pending', dueDate: '2026-08-01' }), // เลยกำหนด
  ];
  assert.deepEqual(sortLedger(rows).map((r) => r.seq), [1, 2, 3, 4]);
});

test('ไฟล์ที่ดาวน์โหลดใช้คอลัมน์ชุดเดียวกับตารางบนจอ', () => {
  const report = ledgerReport([make({ status: 'confirmed', amount: 15000 })]);
  assert.equal(report.columns, LEDGER_COLUMNS);
  assert.equal(report.summary.amount, 15000);
  assert.match(report.summary._label, /รวม 1 งวด/);
});

test('ข้อมูลขาด ๆ ไม่ทำให้ทั้งทะเบียนพัง', () => {
  assert.equal(ledgerRow({ installment: null, order: { id: 'x' } }), null);
  assert.equal(ledgerRow({ installment: { id: 'i' }, order: null }), null);
  const bare = ledgerRow({ installment: { id: 'i', seq: 1 }, order: { id: 'o' } });
  assert.equal(bare.quoteNumber, '');
  assert.equal(bare.amount, 0);
  assert.equal(ledgerSummary().count, 0);
});

// ── จับกลุ่มตามใบ (มติผู้ใช้ 2026-08-13) ─────────────────────────────────
const rowFor = (order, seq, extra = {}) => ledgerRow({
  installment: { id: `SOI-${order}-${seq}`, seq, label: `งวด ${seq}`, percent: 50, amount: 1000, status: 'pending', evidence: [], ...extra },
  order: { id: `SOR-${order}`, orderNumber: `SO-${order}`, quotationId: `QT-${order}` },
  quotation: { id: `QT-${order}`, quoteNumber: `QT-${order}-0` },
  customer: { name: `ลูกค้า ${order}`, arCode: `AR-${order}` },
  todayIso: TODAY,
});

test('งวดของใบเดียวกันรวมเป็นก้อนเดียว และในก้อนเรียงตามงวดที่', () => {
  const groups = groupLedgerByOrder([
    rowFor('A', 2, { dueDate: '2026-09-01' }),
    rowFor('B', 1),
    rowFor('A', 1, { dueDate: '2026-08-30' }),
  ]);
  assert.equal(groups.length, 2);
  const a = groups.find((g) => g.orderNumber === 'SO-A');
  assert.deepEqual(a.rows.map((r) => r.seq), [1, 2], 'ในก้อนต้องเรียง 1 → 2 ตามที่คนคาด');
  assert.equal(a.count, 2);
  assert.equal(a.quoteNumber, 'QT-A-0');
});

/* 🔴 หัวใจของการจัดกลุ่ม: ทะเบียนเรียงตามความด่วนของ **งวด** ⇒ งวดของใบเดียวกัน
   กระจายคนละที่ของตาราง · ก้อนจึงต้องเอาความด่วนของงวดที่ด่วนที่สุดมาเป็นของก้อน
   ไม่งั้นใบที่มีงวดเลยกำหนดจะจมอยู่กลางตาราง */
test('ใบที่มีงวดเลยกำหนดแม้งวดเดียว ต้องอยู่บนสุด', () => {
  const groups = groupLedgerByOrder([
    rowFor('CLEAN', 1, { status: 'confirmed' }),
    rowFor('WAIT', 1, { status: 'reported' }),
    rowFor('LATE', 1, { dueDate: '2026-08-01' }),   // เลยกำหนด
    rowFor('LATE', 2, { status: 'confirmed' }),      // งวดอื่นเรียบร้อย
  ]);
  assert.deepEqual(groups.map((g) => g.orderNumber), ['SO-LATE', 'SO-WAIT', 'SO-CLEAN']);
  assert.equal(groups[0].overdue, true);
});

test('ก้อนสรุปยอดและจำนวนงวดที่เก็บได้ถูกต้อง', () => {
  const [g] = groupLedgerByOrder([
    rowFor('X', 1, { status: 'confirmed', amount: 600 }),
    rowFor('X', 2, { status: 'reported', amount: 400 }),
  ]);
  assert.equal(g.paidCount, 1);
  assert.equal(g.count, 2);
  assert.equal(g.awaiting, 1);
  assert.equal(g.complete, false);
  assert.equal(g.summary.totalAmount, 1000);
  assert.equal(g.summary.collectedAmount, 600);   // reported ไม่นับ
});

test('ป้ายของใบที่ยุบอยู่บอกเรื่องด่วนที่สุดเรื่องเดียว', () => {
  const of = (rows) => groupNote(groupLedgerByOrder(rows)[0]);
  assert.equal(of([rowFor('A', 1, { dueDate: '2026-08-01' })]).label, 'เลยกำหนด');
  assert.equal(of([rowFor('A', 1, { status: 'rejected' })]).label, 'ตีกลับ 1 งวด');
  assert.equal(of([rowFor('A', 1, { status: 'reported' })]).label, 'รอรับรอง 1 งวด');
  assert.equal(of([rowFor('A', 1, { status: 'confirmed' })]).label, 'เก็บครบแล้ว');
  assert.equal(of([rowFor('A', 1)]).label, 'รอลูกค้าชำระ');
  assert.equal(groupNote(null), null);
});

/* ⚠️ เลขที่ซ้ำกันได้ข้ามฉบับแก้ (Rev.) และแถวของใบที่ถูกลบจะไม่มีเลขที่เลย
   ⇒ ต้องจัดกลุ่มด้วย orderId ไม่ใช่เลขที่ */
test('จัดกลุ่มด้วย id ไม่ใช่เลขที่ — ใบคนละใบที่เลขซ้ำกันต้องไม่ถูกยุบรวม', () => {
  const a = ledgerRow({ installment: { id: 'i1', seq: 1, amount: 100, status: 'pending' }, order: { id: 'SOR-1', orderNumber: 'SO-DUP' }, todayIso: TODAY });
  const b = ledgerRow({ installment: { id: 'i2', seq: 1, amount: 100, status: 'pending' }, order: { id: 'SOR-2', orderNumber: 'SO-DUP' }, todayIso: TODAY });
  assert.equal(groupLedgerByOrder([a, b]).length, 2);
  assert.equal(groupLedgerByOrder([]).length, 0);
});

/* ⭐ "ให้พูดภาษาเดียวกับตาราง SO" (มติผู้ใช้ 2026-08-13) — ทะเบียนกับตารางรายการ SO
   ตอบคำถามเดียวกัน จึงต้องใช้ `salesOrderListTrack` ตัวเดียวกัน ไม่ใช่วาดรางอีกชุด */
test('ก้อนแปลงเป็นรูปที่รางสามขั้นกินได้ และขั้นเก็บเงินนับจากงวดในก้อนเอง', () => {
  const [g] = groupLedgerByOrder([
    rowFor('Z', 1, { status: 'confirmed' }),
    rowFor('Z', 2, { status: 'reported' }),
  ]);
  g.orderStatus = 'approved';
  g.financeStatus = 'pending';
  const shaped = groupAsOrder(g);
  assert.equal(shaped.status, 'approved');
  assert.equal(shaped.financeStatus, 'pending');
  assert.deepEqual(
    { paid: shaped.payment.paid, count: shaped.payment.count, reviewing: shaped.payment.reviewing },
    { paid: 1, count: 2, reviewing: 1 },
  );
  assert.equal(groupAsOrder(null), null);
});

test('งวดที่เลยกำหนดในก้อน ส่งต่อเป็นธงแดงให้ราง', () => {
  const [g] = groupLedgerByOrder([rowFor('Y', 1, { dueDate: '2026-08-01' })]);
  assert.equal(groupAsOrder(g).payment.overdue, 1);
});

/* แถวที่ยุบอยู่เคยปล่อยคอลัมน์กำหนดชำระว่างทั้งคอลัมน์ — ใบหนึ่งมีหลายวัน
   สิ่งที่ตอบคำถาม "ต้องตามใบนี้เมื่อไร" คือวันของงวดที่ **ยังเก็บไม่ได้** ที่ใกล้ที่สุด */
test('กำหนดชำระของก้อนคือวันที่ใกล้ที่สุดของงวดที่ยังเก็บไม่ได้', () => {
  const [g] = groupLedgerByOrder([
    rowFor('D', 1, { status: 'confirmed', dueDate: '2026-08-01' }), // จบแล้ว ไม่นับ
    rowFor('D', 2, { dueDate: '2026-09-10' }),
    rowFor('D', 3, { dueDate: '2026-08-25' }),
  ]);
  assert.equal(g.nextDue, '2026-08-25');
});

test('เก็บครบแล้ว หรือยังไม่มีใครกำหนดวัน ⇒ ไม่มีกำหนดให้ตาม', () => {
  const [done] = groupLedgerByOrder([rowFor('E', 1, { status: 'confirmed', dueDate: '2026-08-01' })]);
  assert.equal(done.nextDue, null);
  const [undated] = groupLedgerByOrder([rowFor('F', 1, { dueDate: null })]);
  assert.equal(undated.nextDue, null);
});

// ── คิวงานของบัญชี (มติผู้ใช้ 2026-08-13 · แบบ ข บน + ก ล่าง) ─────────────
/* ⭐ คิวตอบ "ทำอันไหนก่อน" ไม่ใช่ "ใบไหนเป็นยังไง" ⇒ เรียงคนละแบบกับทะเบียนข้างล่าง */
test('คิวเอาเฉพาะงวดที่รอบัญชีรับรอง เรียงเลยกำหนดก่อน แล้วยอดมากก่อน', () => {
  const rows = [
    make({ seq: 1, status: 'reported', amount: 5000 }),
    make({ seq: 2, status: 'confirmed', amount: 99999 }),   // จบแล้ว ไม่เข้าคิว
    make({ seq: 3, status: 'pending', amount: 88888 }),     // ลูกค้ายังไม่จ่าย ไม่ใช่งานบัญชี
    make({ seq: 4, status: 'reported', amount: 200 , dueDate: '2026-08-01' }), // เลยกำหนด
    make({ seq: 5, status: 'reported', amount: 90000 }),
    make({ seq: 6, status: 'rejected', amount: 1 }),        // ตีกลับแล้ว รอฝ่ายขายแก้
  ];
  assert.deepEqual(
    pendingConfirmations(rows).map((r) => r.amount),
    [200, 90000, 5000],
    'เลยกำหนดขึ้นก่อนแม้ยอดน้อยสุด',
  );
});

/* 🔴 คนกดคอนเฟิร์มต้องเห็นสิ่งที่กำลังรับรอง — คิวจึงต้องพกชื่อไฟล์หลักฐานมาด้วย
   ⚠️ ส่งแค่ชื่อ ไม่ส่ง path — ทางเปิดไฟล์คือ route ที่ตรวจสิทธิ์เอง */
test('แถวพกชื่อไฟล์หลักฐานมาให้โมดัลโชว์ก่อนกด', () => {
  const r = make({ status: 'reported', evidence: [{ fileName: 'slip.pdf', storagePath: 'ห้ามหลุด' }, {}] });
  assert.equal(r.evidenceCount, 2);
  assert.deepEqual(r.evidence, [
    { index: 0, fileName: 'slip.pdf' },
    { index: 1, fileName: 'ไฟล์ 2' },
  ]);
  assert.ok(!JSON.stringify(r.evidence).includes('ห้ามหลุด'), 'ต้องไม่ส่ง path ออกไป');
});

test('ไม่มีงวดรอรับรอง = คิวว่าง ไม่ใช่พัง', () => {
  assert.deepEqual(pendingConfirmations([]), []);
  assert.deepEqual(pendingConfirmations(), []);
  assert.deepEqual(pendingConfirmations([make({ status: 'confirmed' })]), []);
});

// ── ตัวกรองระดับ "ใบ" · การเรียง · การจัดกลุ่ม (มติผู้ใช้ 2026-08-15) ────────

/* ใบสามใบ: SOR-A เก็บครบ · SOR-B ค้างครึ่ง · SOR-C ยังไม่เก็บเลย */
const ledgerFixture = () => [
  ledgerRow({
    installment: { id: 'A1', seq: 1, label: 'เต็มจำนวน', percent: 100, amount: 10000, status: 'confirmed', evidence: [] },
    order: { id: 'SOR-A', orderNumber: 'SO-26080001-0', quotationId: 'QT-A' },
    quotation: { id: 'QT-A', quoteNumber: 'QT-26080001-0' },
    customer: { name: 'ลูกค้า ก', arCode: 'AR-001' },
    todayIso: TODAY,
  }),
  ledgerRow({
    installment: { id: 'B1', seq: 1, label: 'มัดจำ', percent: 50, amount: 5000, status: 'confirmed', dueDate: '2026-08-01', evidence: [] },
    order: { id: 'SOR-B', orderNumber: 'SO-26080002-0', quotationId: 'QT-B' },
    quotation: { id: 'QT-B', quoteNumber: 'QT-26080002-0' },
    customer: { name: 'ลูกค้า ข', arCode: 'AR-002' },
    todayIso: TODAY,
  }),
  ledgerRow({
    installment: { id: 'B2', seq: 2, label: 'งวดท้าย', percent: 50, amount: 5000, status: 'pending', dueDate: '2026-09-30', evidence: [] },
    order: { id: 'SOR-B', orderNumber: 'SO-26080002-0', quotationId: 'QT-B' },
    quotation: { id: 'QT-B', quoteNumber: 'QT-26080002-0' },
    customer: { name: 'ลูกค้า ข', arCode: 'AR-002' },
    todayIso: TODAY,
  }),
  ledgerRow({
    installment: { id: 'C1', seq: 1, label: 'เต็มจำนวน', percent: 100, amount: 90000, status: 'pending', dueDate: null, evidence: [] },
    order: { id: 'SOR-C', orderNumber: 'SO-26080003-0', quotationId: 'QT-C' },
    quotation: { id: 'QT-C', quoteNumber: 'QT-26080003-0' },
    customer: { name: 'ลูกค้า ค', arCode: 'AR-003' },
    todayIso: TODAY,
  }),
];

/* 🔴 คำถามแรกของบัญชีคือ "ใบไหนยังเก็บไม่ครบ" ซึ่งเป็นคุณสมบัติของใบ ไม่ใช่ของงวด */
test('สถานะระดับใบ: เก็บครบเมื่อทุกงวด confirmed เท่านั้น', () => {
  const states = orderStateIndex(ledgerFixture());
  assert.equal(states.get('SOR-A'), 'done');
  assert.equal(states.get('SOR-B'), 'open');   // มีงวดที่ยังไม่ confirmed
  assert.equal(states.get('SOR-C'), 'open');
});

test('reported ยังไม่นับว่าเก็บครบ (กติกา mig 0245)', () => {
  const rows = [make({ seq: 1, status: 'reported' })];
  assert.equal(orderStateIndex(rows).get('SOR-1'), 'open');
});

/* ⚠️ ดัชนีต้องคิดจากงวดทั้งหมด **ก่อนกรอง** — ถ้าคิดจากงวดที่เหลือหลังกรองสถานะ
   ใบที่เก็บครบแล้วจะกลายเป็น "ยังเก็บไม่ครบ" ทันทีที่กรองดูเฉพาะงวดรอชำระ */
test('กรองใบที่ยังเก็บไม่ครบ ใช้ดัชนีจากก่อนกรอง ไม่ใช่จากงวดที่เหลือ', () => {
  const all = ledgerFixture();
  const states = orderStateIndex(all);
  const open = filterLedger(all, { orderState: ['open'], orderStates: states });
  assert.deepEqual([...new Set(open.map((r) => r.orderNumber))], ['SO-26080002-0', 'SO-26080003-0']);

  const done = filterLedger(all, { orderState: ['done'], orderStates: states });
  assert.deepEqual(done.map((r) => r.orderNumber), ['SO-26080001-0']);

  // กรองสถานะงวดพร้อมกัน: ใบที่เก็บครบต้องยังถูกนับว่า done อยู่
  const doneConfirmedOnly = filterLedger(all, { orderState: ['done'], orderStates: states, status: ['confirmed'] });
  assert.equal(doneConfirmedOnly.length, 1);
});

test('ไม่เลือกสถานะใบ = ไม่กรอง', () => {
  const all = ledgerFixture();
  assert.equal(filterLedger(all, { orderState: [], orderStates: orderStateIndex(all) }).length, all.length);
});

// ── การเรียงระดับใบ ──────────────────────────────────────────────────────
test('เรียงตั้งต้นคือความด่วน — ใช้ลำดับที่ groupLedgerByOrder จัดมาแล้ว', () => {
  const groups = groupLedgerByOrder(ledgerFixture());
  assert.deepEqual(
    sortLedgerGroups(groups, 'urgent').map((g) => g.orderNumber),
    groups.map((g) => g.orderNumber),
  );
  // สลับทิศ = กลับลำดับเดิม ไม่ใช่คิดความด่วนใหม่
  assert.deepEqual(
    sortLedgerGroups(groups, 'urgent', 'desc').map((g) => g.orderNumber),
    [...groups].reverse().map((g) => g.orderNumber),
  );
});

test('เรียงตามยอดค้างรับ มากไปน้อยเป็นค่าตั้งต้นของแบบนี้', () => {
  const groups = groupLedgerByOrder(ledgerFixture());
  assert.equal(ledgerSortDir('outstanding'), 'desc');
  assert.deepEqual(
    sortLedgerGroups(groups, 'outstanding', 'desc').map((g) => g.orderNumber),
    ['SO-26080003-0', 'SO-26080002-0', 'SO-26080001-0'],
  );
});

/* 🔴 ใบที่ยังไม่มีกำหนดต้องอยู่ท้ายเสมอ ไม่ว่าเรียงขึ้นหรือลง — โผล่ขึ้นหัวตาราง
   เมื่อไร คนอ่านว่า "ด่วนที่สุด" ซึ่งตรงข้ามกับความจริง (กติกาเดียวกับ sortLedger) */
test('เรียงตามกำหนดถัดไป: ใบที่ยังไม่มีกำหนดอยู่ท้ายทั้งสองทิศ', () => {
  const groups = groupLedgerByOrder(ledgerFixture());
  assert.equal(sortLedgerGroups(groups, 'due', 'asc').at(-1).orderNumber, 'SO-26080003-0');
  assert.equal(sortLedgerGroups(groups, 'due', 'desc').at(-1).orderNumber, 'SO-26080003-0');
});

test('เรียงตามลูกค้าและเลขที่ใบ', () => {
  const groups = groupLedgerByOrder(ledgerFixture());
  assert.deepEqual(sortLedgerGroups(groups, 'customer', 'asc').map((g) => g.customerName), ['ลูกค้า ก', 'ลูกค้า ข', 'ลูกค้า ค']);
  assert.deepEqual(sortLedgerGroups(groups, 'order', 'desc').map((g) => g.orderNumber), ['SO-26080003-0', 'SO-26080002-0', 'SO-26080001-0']);
});

test('ทุกตัวเลือกการเรียงมีทิศทางตั้งต้นประกาศไว้', () => {
  for (const option of LEDGER_SORT_OPTIONS) {
    assert.ok(['asc', 'desc'].includes(option.dir), `${option.value} ไม่มีทิศทางตั้งต้น`);
    assert.equal(ledgerSortDir(option.value), option.dir);
  }
  assert.equal(ledgerSortDir('ไม่มีแบบนี้'), 'asc');   // ค่าที่ไม่รู้จัก = ไม่พัง
});

// ── การจัดกลุ่ม ──────────────────────────────────────────────────────────
test('ไม่จัดกลุ่ม = คืน null ไม่ใช่ถังเดียวที่มีทุกใบ', () => {
  const groups = groupLedgerByOrder(ledgerFixture());
  assert.equal(groupLedgerBuckets(groups, 'none'), null);
  assert.equal(groupLedgerBuckets(groups), null);
});

test('จัดกลุ่มตามลูกค้า: หนึ่งถังต่อหนึ่งลูกค้า พร้อมรหัสและยอดค้างรับรวม', () => {
  const buckets = groupLedgerBuckets(groupLedgerByOrder(ledgerFixture()), 'customer');
  assert.equal(buckets.length, 3);
  const b = buckets.find((bucket) => bucket.label === 'ลูกค้า ข');
  assert.equal(b.sub, 'AR-002');
  assert.equal(b.count, 1);
  assert.equal(b.total, 5000);
});

test('จัดกลุ่มตามเดือนที่ต้องเก็บ: ใบที่ยังไม่มีกำหนดไปถังท้ายสุด', () => {
  const buckets = groupLedgerBuckets(groupLedgerByOrder(ledgerFixture()), 'dueMonth');
  assert.equal(buckets.at(-1).label, 'ยังไม่มีกำหนด');
  assert.ok(buckets.at(-1).missing);
  assert.ok(buckets.some((bucket) => bucket.label === 'ก.ย. 26'));
});

test('จัดกลุ่มตามสถานะการเก็บ: ใบเก็บครบแยกออกจากใบที่ยังค้าง', () => {
  const buckets = groupLedgerBuckets(groupLedgerByOrder(ledgerFixture()), 'state');
  const labels = buckets.map((bucket) => bucket.label);
  assert.ok(labels.includes('เก็บครบแล้ว'));
  assert.equal(buckets.find((bucket) => bucket.label === 'เก็บครบแล้ว').count, 1);
  // ทุกใบต้องอยู่ถังใดถังหนึ่งเสมอ ไม่มีใบตกหล่น
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.count, 0), 3);
});

/* 🔴 ผู้ใช้เพิ่งเลือกวิธีเรียงไป — ถ้าจัดกลุ่มแล้วลำดับพลิกเป็นอย่างอื่น
   เท่ากับปุ่ม "เรียง" ถูกยกเลิกเงียบ ๆ */
test('ลำดับถังตามลำดับที่ใบแรกของถังโผล่ในรายการที่เรียงไว้', () => {
  const sorted = sortLedgerGroups(groupLedgerByOrder(ledgerFixture()), 'outstanding', 'desc');
  const buckets = groupLedgerBuckets(sorted, 'customer');
  assert.deepEqual(buckets.map((bucket) => bucket.label), ['ลูกค้า ค', 'ลูกค้า ข', 'ลูกค้า ก']);
});

test('ตัวเลือกจัดกลุ่มมี "ไม่จัดกลุ่ม" เป็นตัวแรกเสมอ', () => {
  assert.equal(LEDGER_GROUP_OPTIONS[0].value, 'none');
});

// ── ผู้ดูแล (AE) มาจากดีล ไม่ใช่จากใบ ────────────────────────────────────
/* 🐞 `sales_orders` ไม่มีคอลัมน์ team/ownerName — เคย select แล้วได้ 500 ทั้งหน้า
   ⇒ ทะเบียนต้องรับผู้ดูแลผ่าน `deal` ที่ join มา */
test('ผู้ดูแลและทีมมาจากดีลที่ join มา', () => {
  const row = ledgerRow({
    installment: { id: 'i', seq: 1, amount: 100, status: 'pending', evidence: [] },
    order: { id: 'SOR-1', orderNumber: 'SO-1' },
    deal: { id: 'D-1', ownerId: 'U-9', ownerName: 'Patcharapit Jueajan', team: 'SV' },
    todayIso: TODAY,
  });
  assert.equal(row.ownerId, 'U-9');
  assert.equal(row.ownerName, 'Patcharapit Jueajan');
  assert.equal(row.team, 'SV');
});

test('ใบที่ไม่ได้มาจากดีล ต้องไม่พัง แค่ไม่มีผู้ดูแล', () => {
  const row = ledgerRow({
    installment: { id: 'i', seq: 1, amount: 100, status: 'pending', evidence: [] },
    order: { id: 'SOR-2', orderNumber: 'SO-2' },
    todayIso: TODAY,
  });
  assert.equal(row.ownerName, '');
  assert.equal(row.ownerId, null);
});

const rowWithOwner = (order, deal) => ledgerRow({
  installment: { id: `SOI-${order}`, seq: 1, label: 'เต็มจำนวน', percent: 100, amount: 1000, status: 'pending', evidence: [] },
  order: { id: `SOR-${order}`, orderNumber: `SO-${order}`, quotationId: `QT-${order}` },
  quotation: { id: `QT-${order}`, quoteNumber: `QT-${order}-0` },
  customer: { name: `ลูกค้า ${order}`, arCode: `AR-${order}` },
  deal,
  todayIso: TODAY,
});

test('ก้อนใบพกผู้ดูแลติดมาด้วย ⇒ จัดกลุ่มตาม AE ได้', () => {
  const [group] = groupLedgerByOrder([rowWithOwner('A', { ownerId: 'U-1', ownerName: 'Nida Promthep', team: 'SV' })]);
  assert.equal(group.ownerId, 'U-1');
  assert.equal(group.ownerName, 'Nida Promthep');
  assert.equal(group.team, 'SV');
});

test('จัดกลุ่มตามผู้ดูแล: ชื่อย่อบนหัวกลุ่ม ทีมเป็นบรรทัดรอง ไม่ระบุไปท้ายสุด', () => {
  const groups = groupLedgerByOrder([
    rowWithOwner('A', { ownerId: 'U-1', ownerName: 'Nida Promthep', team: 'SV' }),
    rowWithOwner('B', { ownerId: 'U-1', ownerName: 'Nida Promthep', team: 'SV' }),
    rowWithOwner('C', null),
    rowWithOwner('D', { ownerId: 'U-2', ownerName: 'Patcharapit Jueajan', team: 'AE' }),
  ]);
  const buckets = groupLedgerBuckets(groups, 'owner');
  const nida = buckets.find((b) => b.label === 'Nida P.');
  assert.equal(nida.count, 2, 'สองใบของ AE คนเดียวกันต้องอยู่ถังเดียว');
  assert.equal(nida.sub, 'SV');
  assert.equal(buckets.at(-1).label, 'ไม่ระบุผู้ดูแล');
  assert.ok(buckets.at(-1).missing);
  assert.equal(buckets.reduce((sum, b) => sum + b.count, 0), 4);
});

/* ⚠️ ชื่อซ้ำกันได้ — กุญแจต้องเป็น id ไม่ใช่ชื่อ ไม่งั้น AE สองคนชื่อเหมือนกันถูกยุบรวม */
test('AE ชื่อเดียวกันแต่คนละคน ต้องไม่ถูกยุบเป็นถังเดียว', () => {
  const groups = groupLedgerByOrder([
    rowWithOwner('A', { ownerId: 'U-1', ownerName: 'Somchai Sri', team: 'SV' }),
    rowWithOwner('B', { ownerId: 'U-2', ownerName: 'Somchai Sri', team: 'AE' }),
  ]);
  assert.equal(groupLedgerBuckets(groups, 'owner').length, 2);
});
