import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEDGER_COLUMNS, LEDGER_GROUP_OPTIONS, LEDGER_HISTORICAL_TAG, LEDGER_SORT_OPTIONS, filterLedger, groupAsOrder,
  groupLedgerBuckets, groupLedgerByOrder, groupNote, ledgerReport, ledgerRow, ledgerSortDir, ledgerVoidInstallment,
  ledgerSummary, orderStateIndex, pendingConfirmations, pendingTaxInvoices, sortLedger,
  sortLedgerGroups, stampConfirmOutlook, stampOrderPaidThrough, stampOrderReplanned, undatedHiddenBy,
  pendingStranded, LEDGER_STRANDED_TITLE, LEDGER_ORDER_STATES, LEDGER_CANCELLED_TAG, ledgerRowLock,
} from './paymentLedger.js';
import { installmentVoid } from '@/lib/sales/salesOrderPayments';

const TODAY = '2026-08-13';

const make = (extra = {}, orderExtra = {}) => ledgerRow({
  installment: {
    id: `SOI-${extra.seq || 1}`, seq: 1, label: 'มัดจำ', percent: 50, amount: 15000,
    status: 'pending', evidence: [], ...extra,
  },
  order: {
    id: 'SOR-1', orderNumber: 'SO-26080008-0', quotationId: 'QT-1', team: 'SV',
    // เอกสารอ้างอิง = PO ของลูกค้า — เลขคนละระบบกับเลขของเรา จึงต้องมีในฟิกซ์เจอร์
    referenceDoc: 'PO-2026-8811', ...orderExtra,
  },
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
  // เอกสารอ้างอิง (PO ลูกค้า) — `ledgerRow` เป็น whitelist ⇒ ลืมเติมแล้วหายเงียบ
  assert.equal(r.referenceDoc, 'PO-2026-8811');
  assert.equal(ledgerRow({
    installment: { id: 'i', seq: 1 }, order: { id: 'SOR-9', orderNumber: 'SO-9' },
  }).referenceDoc, ''); // ใบที่ลูกค้าไม่ได้ออก PO ต้องได้ค่าว่าง ไม่ใช่ undefined
  assert.equal(r.amount, 15000);
  // id ติดมาด้วยเพื่อทำลิงก์ได้ ไม่ต้องค้นจากเลขที่
  assert.equal(r.orderId, 'SOR-1');
  assert.equal(r.quotationId, 'QT-1');
});

test('คอลัมน์ที่ส่งออกมีทั้ง SO และ QT และยอดเป็นคอลัมน์เงิน', () => {
  const keys = LEDGER_COLUMNS.map((c) => c.key);
  assert.ok(keys.includes('orderNumber') && keys.includes('quoteNumber'));
  // ไฟล์ที่บัญชีเอาไปกระทบยอดต้องมีเลข PO ของลูกค้าด้วย ไม่ใช่มีแต่เลขของเรา
  assert.ok(keys.includes('referenceDoc'));
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
/* 🔴 เลข PO ของลูกค้าอยู่ในชุดค้นด้วย — คำถามที่เข้าฝ่ายบัญชีจริงคือ "PO เลขนี้
   เก็บเงินถึงไหนแล้ว" ไม่ใช่ "SO เลขนี้" · ตารางรายการ SO ค้นได้ตั้งแต่ IS-26080017
   แล้วทะเบียนนี้ยังค้นไม่ได้ = ฝ่ายบัญชีเป็นฝ่ายเดียวที่ตอบลูกค้าไม่ได้ */
test('ค้นหาเจอทั้งจากเลข SO เลข QT เอกสารอ้างอิง ชื่อลูกค้า และรหัสลูกค้า', () => {
  const rows = [make()];
  for (const q of ['SO-26080008', 'qt-26080042', 'po-2026-8811', 'อลูมิเนียม', 'ar-0001']) {
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

// ── งวดที่ยังไม่มีกำหนดชำระ vs ตัวกรองช่วงวัน (แก้ 2026-08-16) ───────────────
test('undatedHiddenBy: ไม่ได้กรองช่วงวัน = ไม่มีอะไรถูกซ่อน', () => {
  const rows = [
    { orderId: 'SO-1', status: 'pending', amount: 100, dueDate: null },
    { orderId: 'SO-1', status: 'pending', amount: 200, dueDate: '2026-08-20' },
  ];
  assert.deepEqual(undatedHiddenBy(rows, {}), { count: 0, amount: 0 });
});

test('undatedHiddenBy: กรองช่วงวันแล้ว งวดไม่มีกำหนดถูกนับแยกไว้ให้บอกผู้ใช้', () => {
  const rows = [
    { orderId: 'SO-1', status: 'pending', amount: 100, dueDate: null },
    { orderId: 'SO-1', status: 'pending', amount: 50.5, dueDate: null },
    { orderId: 'SO-1', status: 'pending', amount: 200, dueDate: '2026-08-20' },
  ];
  const filters = { from: '2026-08-01', to: '2026-08-31' };
  // ตารางเห็นเฉพาะงวดที่มีวันกำหนดในช่วง
  assert.equal(filterLedger(rows, filters).length, 1);
  // และส่วนที่หายไปถูกรายงานครบ
  assert.deepEqual(undatedHiddenBy(rows, filters), { count: 2, amount: 150.5 });
});

test('undatedHiddenBy: นับเฉพาะแถวที่ผ่านตัวกรองอื่น — ไม่ลากของที่ถูกกรองด้วยเหตุอื่นมารวม', () => {
  const rows = [
    { orderId: 'SO-1', status: 'pending', amount: 100, dueDate: null, customerName: 'ก' },
    { orderId: 'SO-2', status: 'pending', amount: 900, dueDate: null, customerName: 'ข' },
  ];
  // กรองด้วยคำค้น "ก" → งวดของลูกค้า ข ต้องไม่ถูกนับเป็นของที่ถูกซ่อนโดยช่วงวัน
  assert.deepEqual(
    undatedHiddenBy(rows, { from: '2026-08-01', q: 'ก' }),
    { count: 1, amount: 100 },
  );
});

/* ── ช่วงครอบบริการ + "จ่ายถึง" (mig 0320 · มติผู้ใช้ 2026-08-30) ──────────────
   🔴 สองชั้นที่ค่าหายเงียบได้: `ledgerRow` เป็น whitelist (ไม่ spread แถวดิบ) และ
   `groupLedgerByOrder` ประกอบก้อนด้วยรายชื่อฟิลด์ตายตัว — ลืมชั้นไหนก็ไม่มี error
   ให้เห็น มีแต่คอลัมน์ว่างบนจอ ⇒ ปักไว้ทั้งสองชั้น */
const svc = (extra = {}) => ledgerRow({
  installment: {
    id: `SOI-${extra.seq || 1}`, seq: extra.seq || 1, label: 'งวด', percent: 25, amount: 1000,
    status: 'pending', evidence: [], ...extra,
  },
  order: { id: 'SOR-SVC', orderNumber: 'SO-26090012-0', quotationId: 'QT-9' },
  quotation: { id: 'QT-9', quoteNumber: 'QT-26090005-0' },
  customer: { name: 'เคพี อาร์ท เซ็นเตอร์', arCode: 'AR-233' },
  todayIso: TODAY,
  serviceRounds: true,
});

test('แถวพกช่วงครอบบริการและธง "ใบมีรอบบริการ" ไปถึงจอ', () => {
  const row = svc({ coversFrom: '2026-09-01', coversTo: '2026-11-30' });
  assert.equal(row.coversFrom, '2026-09-01');
  assert.equal(row.coversTo, '2026-11-30');
  assert.equal(row.serviceRounds, true);
  // ใบที่ไม่ได้ส่งธงมา ต้องเป็น false ไม่ใช่ undefined (ตัวกรองเทียบค่าตรง ๆ)
  assert.equal(make().serviceRounds, false);
});

test('⭐ "จ่ายถึง" ของใบ = coversTo ไกลสุดของงวดที่บัญชีรับรองแล้ว', () => {
  const [group] = groupLedgerByOrder(stampOrderPaidThrough([
    svc({ seq: 1, status: 'confirmed', coversFrom: '2026-09-01', coversTo: '2026-11-30' }),
    svc({ seq: 2, status: 'reported', coversFrom: '2026-12-01', coversTo: '2027-02-28' }),
  ]));
  assert.equal(group.paidThrough, '2026-11-30'); // งวดที่ "แจ้งแล้ว" ไม่ขยับ
  assert.equal(group.serviceRounds, true);
});

test('ใบที่ไม่มีงวดรับรอง หรือไม่ใช่ใบบริการ = ไม่มีจ่ายถึง', () => {
  const [svcGroup] = groupLedgerByOrder(stampOrderPaidThrough([
    svc({ status: 'reported', coversTo: '2026-11-30' }),
  ]));
  assert.equal(svcGroup.paidThrough, null);
  const [plain] = groupLedgerByOrder(stampOrderPaidThrough([make({ status: 'confirmed' })]));
  assert.equal(plain.paidThrough, null);
  assert.equal(plain.serviceRounds, false);
});

test('ตัวกรองสายของงานแยกใบมีรอบบริการออกจากใบอื่น', () => {
  const rows = [svc({ seq: 1 }), make({ seq: 2 })];
  assert.deepEqual(filterLedger(rows, { line: ['service'] }).map((r) => r.orderNumber), ['SO-26090012-0']);
  assert.deepEqual(filterLedger(rows, { line: ['other'] }).map((r) => r.orderNumber), ['SO-26080008-0']);
  // ไม่เลือกอะไร = ไม่กรอง (เหมือนตัวกรองอื่นของทะเบียนนี้)
  assert.equal(filterLedger(rows, { line: [] }).length, 2);
  assert.equal(filterLedger(rows, {}).length, 2);
});

/* 🔴 "จ่ายถึง" เป็นค่าระดับ **ใบ** — ต้องคิดก่อนกรองเสมอ (บทเรียนเดียวกับ orderStateIndex)
   เคยเขียนให้ groupLedgerByOrder คำนวณจากแถวที่ผ่านตัวกรองมาแล้ว ⇒ บัญชีกดกรอง
   "สถานะงวด = รอชำระ" ทีเดียว งวด confirmed หลุดหมด ค่าเลยกลายเป็น "ยังไม่ครอบ"
   ทั้งที่เงินครอบอยู่ — และค่าเดียวกันนี้คือด่านที่ห้าม TS ลงคิว */
test('⭐ จ่ายถึงไม่เปลี่ยนตามตัวกรอง — ประทับจากงวดทั้งใบก่อนกรอง', () => {
  const all = [
    svc({ seq: 1, status: 'confirmed', dueDate: '2026-08-01', coversTo: '2026-11-30' }),
    svc({ seq: 2, status: 'pending', dueDate: '2026-11-01' }),
  ];
  stampOrderPaidThrough(all);

  const [full] = groupLedgerByOrder(all);
  assert.equal(full.paidThrough, '2026-11-30');

  // กรองสถานะจนงวด confirmed หลุด — ค่าระดับใบต้องไม่ขยับ
  const onlyPending = filterLedger(all, { status: ['pending'] });
  assert.equal(onlyPending.length, 1);
  assert.equal(groupLedgerByOrder(onlyPending)[0].paidThrough, '2026-11-30');

  // กรองช่วงวันจนงวด confirmed หลุด — เช่นกัน
  const laterOnly = filterLedger(all, { from: '2026-10-01' });
  assert.equal(groupLedgerByOrder(laterOnly)[0].paidThrough, '2026-11-30');
});

test('ใบที่ไม่มีงวดรับรองเลย ประทับแล้วยังเป็น null', () => {
  const all = [svc({ seq: 1, status: 'reported', coversTo: '2026-11-30' })];
  stampOrderPaidThrough(all);
  assert.equal(groupLedgerByOrder(all)[0].paidThrough, null);
});

/* ก้อนของใบก็เป็น whitelist เหมือน `ledgerRow` — ลืมเติมแล้วค้นเจอแต่มองไม่เห็น
   ว่าแถวไหนคือเลขที่ค้น ซึ่งแย่กว่าค้นไม่เจอ เพราะดูเหมือนระบบตอบผิด */
test('ก้อนของใบพกเอกสารอ้างอิงไปถึงจอด้วย', () => {
  const groups = groupLedgerByOrder([make({ seq: 1 }), make({ seq: 2 })]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].referenceDoc, 'PO-2026-8811');
});

test('ไฟล์ที่บัญชีดาวน์โหลดมีช่วงครอบบริการด้วย ไม่ใช่เห็นแต่บนจอ', () => {
  const keys = LEDGER_COLUMNS.map((c) => c.key);
  assert.ok(keys.includes('coversFrom') && keys.includes('coversTo'));
});

/* ── ใบกำกับภาษีรายงวด (mig 0348 · มติผู้ใช้ 2026-09-07) ──────────────────
 *
 * ⚠️ ค่าใหม่ต้องผ่าน **สี่ด่าน** กว่าจะถึงคนใช้: `ledgerRow` → ตาราง/สรุป → ชุดค้น →
 * `LEDGER_COLUMNS` (ไฟล์ Excel) · ตกด่านไหนก็หายเงียบโดยไม่มี error สักตัว
 * เพราะทุกด่านเป็น literal ไม่ได้ spread แถวดิบ
 */
const INVOICED = {
  status: 'confirmed', paidOn: '2026-08-10',
  taxInvoiceNo: 'IV-6809001', taxInvoiceDate: '2026-09-01',
  taxInvoiceFile: { storagePath: 'sales-orders/SOR-1/tax-invoices/a.pdf', fileName: 'iv.pdf' },
};

test('🔴 ledgerRow พกเลข/วัน/ไฟล์ใบกำกับมาถึงจอ (whitelist ตกแล้วหายเงียบ)', () => {
  const r = make(INVOICED);
  assert.equal(r.taxInvoiceNo, 'IV-6809001');
  assert.equal(r.taxInvoiceDate, '2026-09-01');
  assert.equal(r.taxInvoiceFileName, 'iv.pdf');
  assert.equal(r.hasTaxInvoiceFile, true);
  // ⚠️ ไม่ส่ง path ออกไปหน้าเว็บ — ทางเปิดไฟล์คือ route ที่ตรวจสิทธิ์เอง
  assert.equal(r.taxInvoiceFile, undefined);
  // งวดที่ยังไม่ออกใบต้องได้ค่าว่าง ไม่ใช่ undefined (ตาราง/Excel อ่านตรง ๆ)
  const blank = make({ status: 'confirmed' });
  assert.equal(blank.taxInvoiceNo, '');
  assert.equal(blank.taxInvoiceDate, null);
  assert.equal(blank.hasTaxInvoiceFile, false);
});

test('🔴 ไฟล์ Excel ต้องมีคอลัมน์ใบกำกับ และเลขต้องไม่ถูกจัดรูปเป็นวันที่', () => {
  const col = Object.fromEntries(LEDGER_COLUMNS.map((c) => [c.key, c]));
  assert.ok(col.taxInvoiceNo, 'ไฟล์ต้องมีเลขที่ใบกำกับ');
  assert.ok(col.taxInvoiceDate?.date, 'วันที่ใบกำกับต้องถูกจัดรูปเป็นวัน');
  assert.ok(!col.taxInvoiceNo.date && !col.taxInvoiceNo.num,
    'เลขที่เป็นข้อความ — ใส่ flag แล้ว numFmt จะทับค่าจริง');
  // ⚠️ ค่าต้องออกมาจริงในรายงาน ไม่ใช่แค่หัวคอลัมน์สวย (exportExcel อ่าน r[c.key])
  const report = ledgerReport([make(INVOICED)]);
  assert.equal(report.rows[0].taxInvoiceNo, 'IV-6809001');
});

test('🔴 ค้นด้วยเลขใบกำกับต้องเจอ (ตาเห็นบนแถว = ต้องค้นเจอ)', () => {
  const rows = [make(INVOICED), make({ seq: 2, status: 'confirmed' })];
  assert.equal(filterLedger(rows, { q: 'IV-6809001' }).length, 1);
});

test('ตัวกรองใบกำกับ: missing / issued / ว่าง', () => {
  const rows = [make(INVOICED), make({ seq: 2, status: 'confirmed' }), make({ seq: 3 })];
  assert.equal(filterLedger(rows, { taxInvoice: 'issued' }).length, 1);
  // งวด `pending` (ยังไม่ถึงกำหนดจ่าย) ไม่ใช่ของค้าง — ยังไม่มีเงินให้ออกใบ
  assert.equal(filterLedger(rows, { taxInvoice: 'missing' }).length, 1);
  assert.equal(filterLedger(rows, { taxInvoice: '' }).length, 3);
  // ค่าที่ไม่รู้จักต้องไม่กรอง ไม่ใช่ทำให้ทะเบียนว่างเปล่าโดยไม่มีคำอธิบาย
  assert.equal(filterLedger(rows, { taxInvoice: 'zzz' }).length, 3);
});

test('สรุปยอดมีของค้าง "ยังไม่ออกใบกำกับ" แยกจากคิวรับรอง', () => {
  const summary = ledgerSummary([make(INVOICED), make({ seq: 2, status: 'confirmed' })]);
  assert.equal(summary.missingInvoiceCount, 1);
  assert.equal(summary.missingInvoiceAmount, 15000);
});

test('คิวที่สองเรียงของค้างที่นานที่สุดขึ้นก่อน', () => {
  const queue = pendingTaxInvoices([
    make({ seq: 2, status: 'confirmed', paidOn: '2026-08-12' }),
    make({ seq: 3, status: 'confirmed', paidOn: '2026-07-01' }),
    make(INVOICED),
  ]);
  assert.equal(queue.length, 2);
  assert.equal(queue[0].paidOn, '2026-07-01');
});

test('ก้อนของใบบอกว่าออกใบกำกับไปกี่งวดแล้ว', () => {
  const [group] = groupLedgerByOrder([make(INVOICED), make({ seq: 2, status: 'confirmed' })]);
  assert.equal(group.invoiced, 1);
  assert.equal(group.invoicePending, 1);
});

/* ── ใบสั่งขายย้อนหลัง (mig 0360) — ไม่มีใบเสนอราคาในระบบ แต่บัญชีค้นด้วยเลขเอกสารเดิม ─────────── */
test('ใบย้อนหลัง: แถวพก origin + เลขเดิม · ค้นด้วยเลขใบกำกับเดิมเจอ · "อ้างอิง QT" ถอยไปเลขใบเสนอราคาเดิม', () => {
  const row = ledgerRow({
    installment: { id: 'SOI-H1', seq: 1, label: 'งวด 3/3', amount: 30160, status: 'pending', evidence: [] },
    order: {
      id: 'SOR-H1', orderNumber: 'SO-26090191-0', quotationId: null, origin: 'historical',
      historicalQuoteRef: 'Q#250313-0004-D', historicalExpressRef: null, historicalInvoiceRef: 'IV6801041',
    },
    quotation: null,
    customer: { name: 'บริษัท ทดสอบ จำกัด', arCode: 'AR-0002' },
    todayIso: TODAY,
  });
  assert.equal(row.origin, 'historical');
  assert.equal(row.quotationId, null);
  assert.equal(row.quoteNumber, 'Q#250313-0004-D');
  assert.equal(row.historicalRefs, 'Q#250313-0004-D IV6801041');
  assert.deepEqual(filterLedger([row, make()], { q: 'iv6801041' }).map((r) => r.id), ['SOI-H1']);
  // ใบ pipeline: origin ตั้งต้น pipeline · ไม่มีเลขเดิม · เลข QT จริงชนะเสมอ
  assert.equal(make().origin, 'pipeline');
  assert.equal(make().historicalRefs, '');
  assert.equal(make({}, { historicalQuoteRef: 'Q#OLD' }).quoteNumber, 'QT-26080042-0');
});

/* ── ใบย้อนหลังแบบ AE Sup อนุมัติ (มติ 22/09 · mig 0374) — งวดยกมาในคิวบัญชี ─────────────────────────
 *
 * ⭐ ตัวเลขของ mock FnConfirm: ยกมา 196,452 ครอบ 1 ม.ค.–30 ก.ย. · งวด ต.ค.–ธ.ค. 65,484 · ยอดใบ 261,936
 * ⚠️ ledgerRow เป็น whitelist — ค่าที่โมดัลรับรองต้องใช้ (kind · note · ยอดใบ · ผู้อนุมัติ) ลืมเติม = หายเงียบ
 *   และ `kind` หายเมื่อไร งวดยกมาโผล่ในคิว "ยังไม่ออกใบกำกับ" ตลอดกาล (ใบกำกับออกใน Express แล้ว)
 */
const HIST_ORDER = {
  id: 'SOR-H51', orderNumber: 'SO-26090051-0', quotationId: null, origin: 'historical', status: 'approved',
  totalAmount: 261936, approvedByName: 'วรเชษฐ์ ทองดี', approvedAt: '2026-09-22T03:00:00.000Z',
  historicalQuoteRef: null, historicalExpressRef: null, historicalInvoiceRef: 'IV-2601-0412',
};
const hist = (installment) => ledgerRow({
  installment: { evidence: [], ...installment },
  order: HIST_ORDER,
  quotation: null,
  customer: { name: 'บจก. สยามพิวรรธน์', arCode: 'AR-1207' },
  todayIso: '2026-09-23',
});
const H_OPENING = hist({
  id: 'SOI-H51-1', seq: 1, kind: 'opening', label: 'งวดยกมา', amount: 196452, status: 'reported',
  coversFrom: '2026-01-01', coversTo: '2026-09-30', paidOn: '2026-09-15', note: 'เก็บผ่าน Express แล้ว ม.ค.–ก.ย.',
});
const H_NEXT = hist({
  id: 'SOI-H51-2', seq: 2, kind: 'regular', label: 'งวด ต.ค.–ธ.ค.', amount: 65484, status: 'pending',
  dueDate: '2026-10-01', coversFrom: '2026-10-01', coversTo: '2026-12-31',
});

test('🔴 ledgerRow พกค่าที่โมดัลรับรองของใบย้อนหลังใช้ (kind · note · ยอดใบ · ผู้อนุมัติ · เลขใบกำกับเดิม)', () => {
  assert.equal(H_OPENING.kind, 'opening');
  assert.equal(H_OPENING.note, 'เก็บผ่าน Express แล้ว ม.ค.–ก.ย.');
  assert.equal(H_OPENING.orderTotal, 261936);
  assert.equal(H_OPENING.orderApprovedByName, 'วรเชษฐ์ ทองดี');
  assert.equal(H_OPENING.orderApprovedAt, '2026-09-22T03:00:00.000Z');
  assert.equal(H_OPENING.historicalInvoiceRef, 'IV-2601-0412');
  // แถวปกติ/ใบ pipeline: kind ตั้งต้น regular · ค่าว่างเป็นค่าว่าง ไม่ใช่ undefined · ยอดใบไม่รู้ = null ไม่ใช่ 0
  const plain = make();
  assert.equal(plain.kind, 'regular');
  assert.equal(plain.note, '');
  assert.equal(plain.orderTotal, null);
  assert.equal(plain.orderApprovedByName, '');
  assert.equal(plain.orderApprovedAt, null);
  assert.equal(plain.historicalInvoiceRef, '');
  assert.equal(make({}, { totalAmount: 0 }).orderTotal, 0);
});

test('🔴 งวดยกมาไม่อยู่ในของค้างใบกำกับ — ทั้งคิว ทั้งตัวเลขสรุป ทั้งตัวกรอง (ใบกำกับออกในระบบเดิมแล้ว)', () => {
  const confirmedOpening = { ...H_OPENING, status: 'confirmed' };
  const paidRegular = { ...H_NEXT, status: 'confirmed', paidOn: '2026-10-01' };
  assert.deepEqual(pendingTaxInvoices([confirmedOpening, paidRegular]).map((r) => r.id), ['SOI-H51-2']);
  const summary = ledgerSummary([confirmedOpening, paidRegular]);
  assert.equal(summary.missingInvoiceCount, 1);
  assert.equal(summary.missingInvoiceAmount, 65484);
  assert.deepEqual(filterLedger([confirmedOpening, paidRegular], { taxInvoice: 'missing' }).map((r) => r.id), ['SOI-H51-2']);
  // ก้อนของใบ: งวดยกมาไม่อยู่ทั้งตัวตั้งและตัวหาร · จอบอกแยกด้วย openingCount + เลขใบกำกับเดิม
  const [group] = groupLedgerByOrder([confirmedOpening, { ...paidRegular, taxInvoiceNo: 'IV-6810001' }]);
  assert.equal(group.openingCount, 1);
  assert.equal(group.invoiced, 1);
  assert.equal(group.count - group.openingCount, 1);
  assert.equal(group.invoicePending, 0);
  assert.equal(group.historicalInvoiceRef, 'IV-2601-0412');
  // ใบ pipeline ไม่เปลี่ยน
  const [plain] = groupLedgerByOrder([make(INVOICED), make({ seq: 2, status: 'confirmed' })]);
  assert.equal(plain.openingCount, 0);
  assert.equal(plain.invoiced, 1);
});

test('🔴 ค้นด้วยป้ายที่ตาเห็นบนแถวคิวต้องเจอ — "ใบย้อนหลัง" · "งวดยกมา"/"ยกมา"', () => {
  const rows = [H_OPENING, H_NEXT, make()];
  assert.deepEqual(filterLedger(rows, { q: LEDGER_HISTORICAL_TAG }).map((r) => r.id), ['SOI-H51-1', 'SOI-H51-2']);
  assert.deepEqual(filterLedger(rows, { q: 'ยกมา' }).map((r) => r.id), ['SOI-H51-1']);
  assert.deepEqual(filterLedger(rows, { q: 'งวดยกมา' }).map((r) => r.id), ['SOI-H51-1']);
  // ใบ pipeline ไม่ติดป้ายใบย้อนหลังในชุดค้น
  assert.equal(filterLedger([make()], { q: LEDGER_HISTORICAL_TAG }).length, 0);
});

test('คิวรับรองเรียงเหมือนเดิม — งวดยกมาไม่ได้ลัดคิว (เลยกำหนดก่อน แล้วยอดมากก่อน)', () => {
  const late = make({ id: 'late', status: 'reported', amount: 1000, dueDate: '2026-08-01' });
  const big = make({ id: 'big', status: 'reported', amount: 500000 });
  const queue = pendingConfirmations([H_OPENING, late, big]);
  assert.deepEqual(queue.map((r) => r.id), ['late', 'big', 'SOI-H51-1']);
});

test('⭐ ภาพหลังรับรองประทับจากงวดทั้งใบก่อนกรอง — กรองเหลือ "รอบัญชีตรวจ" แล้วงวดถัดไปยังอยู่', () => {
  const all = [{ ...H_OPENING }, { ...H_NEXT }, make({ status: 'reported' })];
  stampConfirmOutlook(all);
  const [opening] = filterLedger(all, { status: ['reported'] }).filter((r) => r.id === 'SOI-H51-1');
  assert.deepEqual(opening.confirmOutlook, {
    paidThrough: '2026-09-30',
    collected: 196452,
    next: { label: 'งวด ต.ค.–ธ.ค.', amount: 65484, dueDate: '2026-10-01' },
  });
  // ประทับเฉพาะงวดที่กดรับรองได้ (reported) · ใบอื่นไม่ปนเข้าก้อนของใบนี้
  assert.equal(all[1].confirmOutlook, undefined);
  assert.equal(all[2].confirmOutlook.collected, 15000);
  assert.equal(all[2].confirmOutlook.next, null);
});

/* ══ PR0 · งวดที่ยังไม่มีเงินของใบที่ตายแล้ว = โมฆะ ไม่ใช่ยอดค้างรับ (แผน so-payment-unlock-replan) ══════
   🐞 ทะเบียนเคยไม่ดูสถานะใบเลย ⇒ วันที่ตรวจ (23/09) นับยอดค้างรับเทียม ฿577,667.32 บนใบที่ยกเลิกแล้ว
   ⭐ ตัดเฉพาะ pending/rejected ของใบ cancelled/revised — reported ยังอยู่ในคิวบัญชี (บัญชีรับรอง/ตีกลับได้ ·
     pipelineInstallmentLock) · confirmed ยังนับเป็นเงินที่เก็บได้ (PR3 จะแยกเป็น "เงินค้างจากใบที่ยกเลิก") */
test('ledgerVoidInstallment: pending/rejected ของใบยกเลิก/ถูกออก Rev. = โมฆะ · สถานะอื่นหรือใบที่ยังเดินไม่ตัด', () => {
  for (const status of ['cancelled', 'revised']) {
    for (const row of ['pending', 'rejected', undefined]) {
      assert.equal(ledgerVoidInstallment({ status: row }, { status }), true, `${status}/${row}`);
    }
    for (const row of ['reported', 'confirmed']) {
      assert.equal(ledgerVoidInstallment({ status: row }, { status }), false, `${status}/${row}`);
    }
  }
  for (const status of ['approved', 'approval_revoked', 'draft', 'pending_approval', 'rejected']) {
    for (const row of ['pending', 'rejected', 'reported', 'confirmed']) {
      assert.equal(ledgerVoidInstallment({ status: row }, { status }), false, `${status}/${row}`);
    }
  }
  assert.equal(ledgerVoidInstallment(null, { status: 'cancelled' }), false);
  assert.equal(ledgerVoidInstallment({ status: 'pending' }, null), false);
});

test('แถว pending/rejected ของใบยกเลิก/ถูกออก Rev. ไม่นับในยอดค้างรับและเลยกำหนด · แถวที่มีเงินยังอยู่', () => {
  const PAST = '2026-08-01';
  const raw = [
    [{ id: 'd1', seq: 1, amount: 100, status: 'pending', dueDate: PAST }, { id: 'SOR-D', status: 'cancelled' }],
    [{ id: 'd2', seq: 2, amount: 200, status: 'rejected', dueDate: PAST }, { id: 'SOR-D', status: 'cancelled' }],
    [{ id: 'd3', seq: 1, amount: 300, status: 'pending', dueDate: PAST }, { id: 'SOR-R', status: 'revised' }],
    [{ id: 'd4', seq: 3, amount: 400, status: 'reported', dueDate: PAST }, { id: 'SOR-D', status: 'cancelled' }],
    [{ id: 'live', seq: 1, amount: 1000, status: 'pending', dueDate: PAST }, { id: 'SOR-A', status: 'approved' }],
  ];
  const rows = raw
    .filter(([installment, order]) => !ledgerVoidInstallment(installment, order))
    .map(([installment, order]) => ledgerRow({ installment, order, todayIso: TODAY }));
  assert.deepEqual(rows.map((r) => r.id), ['d4', 'live']);
  const summary = ledgerSummary(rows);
  assert.equal(summary.outstandingAmount, 1400, 'เหลือแค่เงินที่รอบัญชีตรวจของใบยกเลิก + งวดของใบที่ยังเดิน');
  assert.equal(summary.overdueAmount, 1400);
  assert.equal(summary.awaitingAmount, 400, 'สลิปรอบัญชีตรวจของใบยกเลิกยังอยู่ในคิว');
  // ธงระดับใบบนแถว — จอ/Excel แยกใบที่ตายแล้วออกได้โดยไม่ต้องเดา literal ของสถานะ
  assert.equal(rows[0].orderDead, true);
  assert.equal(rows[1].orderDead, false);
  assert.equal(ledgerRow({ installment: { id: 'x' }, order: { id: 'o', status: 'revised' } }).orderDead, true);
  assert.equal(ledgerRow({ installment: { id: 'x' }, order: { id: 'o', status: 'approval_revoked' } }).orderDead, false);
});

/* ⭐ PATCH งวดเป็น optimistic lock แล้ว (PR0) — คิวบนทะเบียนต้องส่ง updatedAt ของแถวที่ตาเห็นกลับไป
   ⚠️ ledgerRow เป็น whitelist — ลืมเติมที่นี่ = ทุกคำสั่งจากทะเบียนไม่มีตัวล็อก (หรือ 409 ตลอดถ้าบังคับ) */
test('ledgerRow พก updatedAt ของงวดมาด้วย (ตัวล็อกของ PATCH จากคิวบัญชี)', () => {
  const r = ledgerRow({ installment: { id: 'i', updatedAt: '2026-09-23T03:00:00.123456+00:00' }, order: { id: 'o' } });
  assert.equal(r.updatedAt, '2026-09-23T03:00:00.123456+00:00');
  assert.equal(ledgerRow({ installment: { id: 'i' }, order: { id: 'o' } }).updatedAt, null);
});

/* ── ป้าย "ปรับแผนหลังอนุมัติ" บนทะเบียนบัญชี (PR2 · mig 0377 · มติ D5) ────────────────────────────────────
   ⭐ ไม่เก็บข้อมูลเพิ่ม — เทียบงวดของใบกับแผนของ QT (installmentsReplanned) · ค่าระดับใบ ⇒ ประทับจากชุดก่อนกรอง
     (กรองสถานะงวดแล้วงวดหลุด จำนวนงวดจะไม่ตรงแผน = ป้ายขึ้นผิด) — แพตเทิร์นเดียวกับ stampOrderPaidThrough
   ⚠️ ใบย้อนหลังไม่มี QT · ใบยกเลิก/ถูกออก Rev. ทับเหลือแต่แถวที่มีเงิน (แถวโมฆะถูกตัดตั้งแต่ PR0) ⇒ ไม่ประทับ */
test('stampOrderReplanned: งวดต่างจากแผน QT = replanned ทุกแถวของใบ · ตรงแผน/ใบย้อนหลัง/ใบตายแล้ว = ไม่ขึ้น', () => {
  const plan = { type: 'installment', installments: [{ label: 'มัดจำ', percent: 50 }, { label: '', percent: 50 }] };
  const row = (orderId, seq, amount, orderExtra = {}, label = seq === 1 ? 'มัดจำ' : `งวดที่ ${seq}`) => ledgerRow({
    installment: { id: `${orderId}-${seq}`, seq, label, percent: 50, amount, status: 'pending', evidence: [] },
    order: { id: orderId, orderNumber: orderId, quotationId: `QT-${orderId}`, totalAmount: 30000, status: 'approved', ...orderExtra },
    quotation: null, customer: null, todayIso: TODAY,
  });
  const rows = [
    row('A', 1, 15000), row('A', 2, 15000),                       // ตรงแผน
    row('B', 1, 15000), row('B', 2, 10000), row('B', 3, 5000),    // ปรับเป็น 3 งวด
    row('C', 1, 15000, { origin: 'historical', quotationId: null }), row('C', 2, 15000, { origin: 'historical', quotationId: null }),
    row('D', 1, 15000, { status: 'cancelled' }),                  // ใบยกเลิก — แถวโมฆะถูกตัดแล้ว เหลือไม่ครบ
  ];
  const plans = new Map([['QT-A', plan], ['QT-B', plan], ['QT-D', plan]]);
  const stamped = stampOrderReplanned(rows, plans);
  assert.equal(stamped, rows, 'ประทับลงแถวเดิม (แพตเทิร์น stampOrderPaidThrough)');
  const byOrder = (id) => [...new Set(rows.filter((r) => r.orderId === id).map((r) => r.orderReplanned))];
  assert.deepEqual(byOrder('A'), [false]);
  assert.deepEqual(byOrder('B'), [true]);
  assert.deepEqual(byOrder('C'), [false]);
  assert.deepEqual(byOrder('D'), [false]);
  const groups = groupLedgerByOrder(rows);
  assert.equal(groups.find((g) => g.orderId === 'B').replanned, true);
  assert.equal(groups.find((g) => g.orderId === 'A').replanned, false);
});


/* ══ PR3 · เงินค้างจากใบที่ยกเลิก + บันทึกคืนเงิน (mig 0378 · มติเจ้าของ 23/09 D4) ═══════════════════════════════════ */
const DEAD = { status: 'cancelled' };
const refundOf = (over = {}) => ({
  refundedAt: '2026-09-21T03:00:00Z', refundedOn: '2026-09-20', refundedByName: 'บัญชี',
  refundReason: 'ลูกค้ายกเลิกงาน ขอคืนมัดจำทั้งหมด', refundCreditNoteNo: 'CN-0001', ...over,
});

test('ledgerRow: แถวเงินของใบที่ยกเลิก = stranded · คืนเงินแล้ว = refunded (ไม่ค้าง) · ป้ายสถานะ "คืนเงินแล้ว" · ช่องคืนเงินถึงจอ/Excel', () => {
  const confirmed = make({ status: 'confirmed', amount: 20000 }, DEAD);
  assert.equal(confirmed.stranded, true);
  assert.equal(confirmed.refunded, false);
  assert.equal(make({ status: 'reported' }, DEAD).stranded, true, 'รอบัญชีตรวจก็ค้างอยู่กับใบที่ยกเลิก');
  assert.equal(make({ status: 'confirmed' }).stranded, false, 'ใบที่ยังเดิน = ไม่ใช่เงินค้าง');
  const refunded = make({ status: 'confirmed', amount: 20000, taxInvoiceNo: 'IV-7', ...refundOf() }, DEAD);
  assert.equal(refunded.stranded, false);
  assert.equal(refunded.refunded, true);
  assert.equal(refunded.statusLabel, 'คืนเงินแล้ว');
  assert.equal(refunded.refundedOn, '2026-09-20');
  assert.equal(refunded.refundCreditNoteNo, 'CN-0001');
  assert.equal(refunded.refundReason, 'ลูกค้ายกเลิกงาน ขอคืนมัดจำทั้งหมด');
  // ก่อนรัน 0378 ไม่มีคอลัมน์ (undefined) = ยังไม่คืน · ไม่พัง
  assert.equal(make({ status: 'confirmed' }, DEAD).refundedOn, null);
  const keys = LEDGER_COLUMNS.map((c) => c.key);
  assert.ok(keys.includes('refundedOn') && keys.includes('refundCreditNoteNo'), 'ไฟล์ Excel ต้องมีวันคืนเงิน/เลขใบลดหนี้');
  assert.equal(LEDGER_COLUMNS.find((c) => c.key === 'refundedOn').date, true);
  assert.notEqual(LEDGER_COLUMNS.find((c) => c.key === 'refundCreditNoteNo').date, true, 'เลขที่ห้ามยัดรูปวันที่');
});

test('ledgerSummary: เก็บได้ = confirmed ที่ยังไม่คืน · เงินค้างนับแยก · คืนเงินแล้วออกจากทั้งเก็บได้และเงินค้าง', () => {
  const rows = [
    make({ seq: 1, status: 'confirmed', amount: 20000 }, DEAD),
    make({ seq: 2, status: 'reported', amount: 10000 }, DEAD),
    make({ seq: 3, status: 'confirmed', amount: 5000, ...refundOf({ refundCreditNoteNo: null }) }, DEAD),
    make({ seq: 1, status: 'confirmed', amount: 40000 }, { id: 'SOR-A', status: 'approved' }),
  ];
  const s = ledgerSummary(rows);
  assert.equal(s.collectedAmount, 60000, 'confirmed ที่ยังไม่คืน (รวมเงินค้างที่รับรองแล้ว) — คืนแล้วไม่นับ');
  assert.equal(s.strandedCount, 2);
  assert.equal(s.strandedAmount, 30000);
  assert.equal(s.refundedCount, 1);
  assert.equal(s.refundedAmount, 5000);
  assert.equal(s.awaitingAmount, 10000, 'สลิปรอตรวจของใบยกเลิกยังอยู่ในคิวบัญชี');
  assert.equal(s.outstandingAmount, 10000, 'ค้างรับคงกติกาเดิม (ยังไม่ confirmed) — PR0 ตรึงไว้');
});

test('pendingStranded: คิว "เงินค้างจากใบที่ยกเลิก" — แถวที่ค้างเท่านั้น เรียงตามใบแล้วเลขงวด', () => {
  const rows = [
    make({ id: 'b2', seq: 2, status: 'reported' }, { id: 'SOR-B', orderNumber: 'SO-B', status: 'cancelled' }),
    make({ id: 'a1', seq: 1, status: 'confirmed' }, { id: 'SOR-A', orderNumber: 'SO-A', status: 'cancelled' }),
    make({ id: 'b1', seq: 1, status: 'confirmed' }, { id: 'SOR-B', orderNumber: 'SO-B', status: 'cancelled' }),
    make({ id: 'r', seq: 3, status: 'confirmed', ...refundOf() }, { id: 'SOR-B', orderNumber: 'SO-B', status: 'cancelled' }),
    make({ id: 'live', seq: 1, status: 'confirmed' }),
  ];
  assert.deepEqual(pendingStranded(rows).map((r) => r.id), ['a1', 'b1', 'b2']);
  assert.deepEqual(pendingStranded(null), []);
  assert.equal(LEDGER_STRANDED_TITLE, 'เงินค้างจากใบที่ยกเลิก');
});

test('ใบกำกับค้าง: งวดที่คืนเงินแล้วไม่ใช่ของค้างเอกสาร · เงินค้างที่ยังไม่มีใบยังค้างตามเดิม', () => {
  const refunded = make({ seq: 1, status: 'confirmed', amount: 5000, ...refundOf({ refundCreditNoteNo: null }) }, DEAD);
  const stranded = make({ seq: 2, status: 'confirmed', amount: 7000 }, DEAD);
  assert.deepEqual(pendingTaxInvoices([refunded, stranded]).map((r) => r.seq), [2]);
  const s = ledgerSummary([refunded, stranded]);
  assert.equal(s.missingInvoiceCount, 1);
  assert.equal(s.missingInvoiceAmount, 7000);
});

test('ก้อนของใบที่ยกเลิก: นับเงินค้าง/คืนแล้ว · ป้ายสรุปบอก "เงินค้างจากใบที่ยกเลิก" ก่อนเรื่องอื่น', () => {
  const rows = [
    make({ id: 'x1', seq: 1, status: 'confirmed', amount: 20000 }, { id: 'SOR-X', orderNumber: 'SO-X', status: 'cancelled' }),
    make({ id: 'x2', seq: 2, status: 'confirmed', amount: 5000, ...refundOf() }, { id: 'SOR-X', orderNumber: 'SO-X', status: 'cancelled' }),
  ];
  const [group] = groupLedgerByOrder(rows);
  assert.equal(group.stranded, 1);
  assert.equal(group.strandedAmount, 20000);
  assert.equal(group.refunded, 1);
  assert.deepEqual(groupNote(group), { label: 'เงินค้าง 1 งวด', tone: 'warning' });
  const [allRefunded] = groupLedgerByOrder([rows[1]]);
  assert.deepEqual(groupNote(allRefunded), { label: 'คืนเงินแล้ว', tone: 'neutral' });
});


/* ══ review รอบ PR0–PR3 (แผน so-payment-unlock-replan) ══════════════════════════════════════════════════════════ */

/* 🐞 F1 (tests): ตัวนับ "ยังไม่ออกใบกำกับ" (ledgerSummary · คิว) ตัดงวดที่คืนเงินแล้ว แต่ตัวกรอง taxInvoice=missing ยังใช้
   taxInvoicePending ตัวเดิม ⇒ การ์ดบอก 0 งวด กดเข้าไปเจอแถว "คืนเงินแล้ว" + ไฟล์ Excel ก็ติดไปด้วย */
test('🔴 ตัวกรอง "ยังไม่ออกใบกำกับ" ใช้เกณฑ์เดียวกับตัวนับ — งวดที่คืนเงินแล้วไม่อยู่ในรายการ', () => {
  const refunded = make({ id: 'r1', seq: 1, status: 'confirmed', amount: 30000, ...refundOf({ refundCreditNoteNo: null }) }, DEAD);
  const stranded = make({ id: 's2', seq: 2, status: 'confirmed', amount: 7000 }, DEAD);
  const listed = filterLedger([refunded, stranded], { taxInvoice: 'missing' });
  assert.deepEqual(listed.map((r) => r.id), ['s2']);
  assert.equal(ledgerSummary([refunded, stranded]).missingInvoiceCount, listed.length, 'ตัวเลขบนการ์ด = จำนวนแถวที่กรองได้');
});

/* 🐞 F2 (tests): ใบที่ยกเลิกที่เหลือแต่เงินค้าง/คืนเงินแล้ว (งวดโมฆะถูกตัดตั้งแต่ PR0) ถูกจัดเป็น "เก็บครบแล้ว" */
test('🔴 สถานะระดับใบ: ใบที่ยกเลิก/ถูกแทน = สถานะของตัวเอง (ไม่ใช่ "เก็บครบแล้ว") · งวดที่คืนเงินแล้วไม่นับว่าเก็บได้', () => {
  const cancelled = { id: 'SOR-C', orderNumber: 'SO-C', status: 'cancelled' };
  const strandedOnly = [make({ id: 'c1', seq: 1, status: 'confirmed', amount: 30000 }, cancelled)];
  const refundedOnly = [make({ id: 'c2', seq: 1, status: 'confirmed', amount: 30000, ...refundOf() }, cancelled)];
  const dead = Object.keys(LEDGER_ORDER_STATES).find((k) => !['open', 'done'].includes(k));
  assert.ok(dead, 'ต้องมีสถานะของใบที่ยกเลิก/ถูกแทนแยกจาก เก็บครบ/ยังไม่ครบ');
  assert.equal(orderStateIndex(strandedOnly).get('SOR-C'), dead);
  assert.equal(orderStateIndex(refundedOnly).get('SOR-C'), dead);
  assert.deepEqual(filterLedger(strandedOnly, { orderState: ['done'], orderStates: orderStateIndex(strandedOnly) }), [],
    'ตัวกรอง "เก็บครบแล้ว" ต้องไม่มีใบที่ยกเลิก');
  assert.equal(filterLedger(strandedOnly, { orderState: [dead], orderStates: orderStateIndex(strandedOnly) }).length, 1);
  // ใบที่ยังเดิน: เดิมทุกข้อ
  assert.equal(orderStateIndex([make({ seq: 1, status: 'confirmed' })]).get('SOR-1'), 'done');
  // จัดกลุ่ม "สถานะการเก็บ" ใช้ถังเดียวกับตัวกรอง — ใบยกเลิกไม่ตกถัง "เก็บครบแล้ว"/"รอลูกค้าชำระ"
  const [bucket] = groupLedgerBuckets(groupLedgerByOrder(refundedOnly), 'state');
  assert.equal(bucket.label, LEDGER_ORDER_STATES[dead]);
});

/* 🐞 UI-2: งวดที่คืนเงินแล้วยังเป็น confirmed ในฐาน — ก้อนของใบนับเป็น "เก็บครบ" ทั้งที่ยอดเก็บได้เป็น 0 */
test('🔴 ก้อนของใบ: งวดที่คืนเงินแล้วไม่นับ "เก็บแล้ว x/y" และใบที่คืนครบไม่ใช่ "เก็บครบ"', () => {
  const cancelled = { id: 'SOR-X', orderNumber: 'SO-X', status: 'cancelled' };
  const rows = [
    make({ id: 'x1', seq: 1, status: 'confirmed', amount: 500, ...refundOf() }, cancelled),
    make({ id: 'x2', seq: 2, status: 'confirmed', amount: 500, ...refundOf() }, cancelled),
  ];
  const [group] = groupLedgerByOrder(rows);
  assert.equal(group.paidCount, 0);
  assert.equal(group.complete, false);
  assert.equal(group.summary.collectedAmount, 0);
  assert.deepEqual(groupNote(group), { label: 'คืนเงินแล้ว', tone: 'neutral' });
  assert.equal(groupAsOrder(group).payment.complete, false);
});

/* ⭐ UI-1: แถวคิวรับรองของใบที่ยกเลิกต้องบอกว่า "ใบยกเลิกแล้ว" — ตาเห็นบนแถว = ต้องค้นเจอ (กติกา search haystack) */
test('ป้าย "ใบยกเลิกแล้ว" ของแถวคิว ค้นเจอ · ทะเบียนตัดงวดโมฆะด้วยตัวตัดสินเดียวกับแผงงวด (installmentVoid)', () => {
  const cancelled = { id: 'SOR-Z', orderNumber: 'SO-Z', status: 'cancelled' };
  const rows = [make({ id: 'z1', seq: 1, status: 'reported' }, cancelled), make({ id: 'live', seq: 1, status: 'reported' })];
  assert.equal(LEDGER_CANCELLED_TAG, 'ใบยกเลิกแล้ว');
  assert.deepEqual(filterLedger(rows, { q: LEDGER_CANCELLED_TAG }).map((r) => r.id), ['z1']);
  const pending = { id: 'p', status: 'pending' };
  for (const status of ['cancelled', 'revised', 'approved', 'approval_revoked']) {
    assert.equal(ledgerVoidInstallment(pending, { status }), installmentVoid(pending, { status }), status);
  }
});

// ── ร่างที่ QT ไม่ใช่ Won แล้ว (SO-26080039-0 · review G1) ─────────────────────────────────────
/* ทะเบียนเคยโชว์ปุ่ม "ยืนยันว่าเงินเข้า" / "บันทึกใบกำกับ" ให้งวดของร่างที่ QT ถูกถอด Won แล้ว ทั้งที่ API ปฏิเสธ
   (บันทึกใบกำกับยังอัปไฟล์ก่อนแล้วโดนปฏิเสธ = ไฟล์กำพร้า) ⇒ แถวต้องพกสถานะ QT และถามล็อกตัวเดียวกับ API */
test('ledgerRow พกสถานะ QT · ledgerRowLock ถามล็อกตัวเดียวกับ route งวด (ร่างที่ QT ตาย = รับรอง/ใบกำกับไม่ได้ · ตีกลับได้)', () => {
  const dead = ledgerRow({
    installment: { id: 'SOI-39', seq: 1, amount: 7639.8, status: 'reported', evidence: [] },
    order: { id: 'SOR-39', orderNumber: 'SO-26080039-0', quotationId: 'QT-4', status: 'draft', origin: 'pipeline' },
    quotation: { id: 'QT-4', quoteNumber: 'QT-26080037-4', status: 'revised' },
    customer: { name: 'ซารางแฮร์' }, todayIso: TODAY,
  });
  assert.equal(dead.quotationStatus, 'revised');
  assert.match(ledgerRowLock(dead, 'confirm') || '', /^QT-26080037-4 ไม่ได้เป็น Won แล้ว/);
  assert.match(ledgerRowLock(dead, 'tax-invoice') || '', /ไม่ได้เป็น Won แล้ว/);
  assert.equal(ledgerRowLock(dead, 'reject'), null);
  // ใบปกติ (QT ยัง Won) · ใบยกเลิก (กติกาของใบยกเลิกปล่อยรับรอง) · ใบย้อนหลัง = ไม่ล็อก
  const live = { ...dead, orderStatus: 'approved', quotationStatus: 'accepted' };
  assert.equal(ledgerRowLock(live, 'confirm'), null);
  assert.equal(ledgerRowLock({ ...dead, orderStatus: 'cancelled' }, 'confirm'), null);
  assert.equal(ledgerRowLock({ ...dead, origin: 'historical' }, 'confirm'), null);
  // แถวเก่าที่ไม่มีสถานะ QT = ไม่ตัดสิน (route ต้องโหลดมาเสมอ — ยามต้นทาง)
  assert.equal(ledgerRowLock({ ...dead, quotationStatus: null }, 'confirm'), null);
});
