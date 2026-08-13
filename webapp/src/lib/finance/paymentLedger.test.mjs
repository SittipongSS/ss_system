import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEDGER_COLUMNS, filterLedger, ledgerReport, ledgerRow, ledgerSummary, sortLedger,
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
