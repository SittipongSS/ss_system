import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agedAtLeast,
  bangkokDate,
  businessDaysWaiting,
  isLiveSalesOrder,
  quotesAwaitingSalesOrder,
  salesOrdersAwaitingFiling,
} from './handoffQueue.js';

const quote = (id, status = 'accepted', extra = {}) => ({ id, quoteNumber: `QT-${id}`, status, ...extra });
const order = (id, quotationId, status = 'draft', extra = {}) => ({ id, orderNumber: `SO-${id}`, quotationId, status, supersededById: null, ...extra });

test('คิว Won→SO: ใบที่มี SO ที่ยังมีชีวิตอยู่แล้วต้องหลุดออกจากคิว', () => {
  const quotations = [quote('A'), quote('B'), quote('C')];
  const salesOrders = [order('1', 'A', 'draft'), order('2', 'B', 'approved')];
  assert.deepEqual(quotesAwaitingSalesOrder({ quotations, salesOrders }).map((q) => q.id), ['C']);
});

test('คิว Won→SO: นับเฉพาะใบที่ Won — ร่าง/ส่งแล้ว/ถูกปฏิเสธ/ยกเลิก ไม่ใช่งานค้างของรอยต่อนี้', () => {
  const quotations = ['draft', 'sent', 'rejected', 'cancelled', 'revised', 'closed']
    .map((status, i) => quote(`Q${i}`, status));
  assert.deepEqual(quotesAwaitingSalesOrder({ quotations, salesOrders: [] }), []);
  assert.equal(quotesAwaitingSalesOrder({ quotations: [...quotations, quote('WON')], salesOrders: [] }).length, 1);
});

// ── ด่านเดียวกับ migration 0169 ──────────────────────────────────────────
// ถ้าเทสต์คู่นี้แดง แปลว่าคิวกับ DB เริ่มเพี้ยนกัน: คิวจะชวนให้กดปุ่มที่ DB จะปฏิเสธ
// (หรือซ่อนใบที่ DB ยอมให้ออกใหม่) — ต้องไปไล่ดู create_sales_order_draft ก่อนแก้ตรงนี้
test('SO ที่ยกเลิกแล้วไม่กันคิว — ตรงกับด่าน 0169 ที่ปลดทางตันให้ออกใบใหม่ได้', () => {
  const quotations = [quote('A')];
  const salesOrders = [order('1', 'A', 'cancelled')];
  assert.equal(isLiveSalesOrder(salesOrders[0]), false);
  assert.deepEqual(quotesAwaitingSalesOrder({ quotations, salesOrders }).map((q) => q.id), ['A']);
});

test('SO ที่ถูกแทนที่ด้วย Rev. ไม่กันคิวเอง แต่ฉบับ Rev. ที่มีชีวิตกันแทน', () => {
  const quotations = [quote('A')];
  const base = order('1', 'A', 'revised', { supersededById: '2' });
  assert.equal(isLiveSalesOrder(base), false);
  // มีแต่ฉบับที่ถูกแทนที่ (chain ปลายทางโดนยกเลิก) → ต้องกลับเข้าคิวให้ออกใบใหม่ได้
  assert.deepEqual(
    quotesAwaitingSalesOrder({ quotations, salesOrders: [base, order('2', 'A', 'cancelled')] }).map((q) => q.id),
    ['A'],
  );
  // ฉบับ Rev. ยังมีชีวิต → ไม่ใช่งานค้าง
  assert.deepEqual(
    quotesAwaitingSalesOrder({ quotations, salesOrders: [base, order('2', 'A', 'approved')] }),
    [],
  );
});

test('SO สถานะที่ยังมีชีวิตทุกตัวกันคิวได้หมด (รวม rejected/approval_revoked ที่ยังแก้ต่อได้)', () => {
  for (const status of ['draft', 'pending_approval', 'approved', 'rejected', 'approval_revoked']) {
    assert.equal(isLiveSalesOrder(order('1', 'A', status)), true, status);
  }
});

test('คิว SO→ใบยื่น: อนุมัติแล้วและยังไม่มีใบยื่นเท่านั้น', () => {
  const salesOrders = [
    order('1', 'A', 'approved'),
    order('2', 'B', 'approved'),
    order('3', 'C', 'draft'),
    order('4', 'D', 'pending_approval'),
  ];
  const filings = [{ id: 'TAX-1', salesOrderId: '2' }, { id: 'TAX-2', salesOrderId: null }];
  assert.deepEqual(salesOrdersAwaitingFiling({ salesOrders, filings }).map((o) => o.id), ['1']);
});

test('คิว SO→ใบยื่น: ฉบับที่ถูกแทนที่ด้วย Rev. ไม่ต้องยื่น (ฉบับ Rev. รับช่วงไปแล้ว)', () => {
  const salesOrders = [order('1', 'A', 'approved', { supersededById: '2' }), order('2', 'A', 'approved')];
  assert.deepEqual(salesOrdersAwaitingFiling({ salesOrders, filings: [] }).map((o) => o.id), ['2']);
});

test('วันที่ยึดเวลาไทย — งานที่กดตอนค่ำไทยต้องไม่ถูกนับเป็นวันก่อนหน้าตาม UTC', () => {
  // 2026-07-27T18:00+07:00 = 2026-07-27T11:00Z — ทั้งสองรูปแบบต้องได้วันไทยวันเดียวกัน
  assert.equal(bangkokDate('2026-07-27T11:00:00.000Z'), '2026-07-27');
  assert.equal(bangkokDate('2026-07-27T23:30:00+07:00'), '2026-07-27');
  // 2026-07-27T22:00Z = 2026-07-28 05:00 ตามเวลาไทย → เป็นวันถัดไปแล้ว
  assert.equal(bangkokDate('2026-07-27T22:00:00.000Z'), '2026-07-28');
  assert.equal(bangkokDate(null), '');
  assert.equal(bangkokDate('ไม่ใช่วันที่'), '');
});

test('อายุงานค้างนับเป็นวันทำการ ไม่ใช่วันปฏิทิน', () => {
  const holidays = new Set(['2026-08-12']);
  // ศุกร์ 2026-08-07 → จันทร์ 2026-08-10 = 1 วันทำการ (เสาร์-อาทิตย์ไม่นับ)
  assert.equal(businessDaysWaiting('2026-08-07T09:00:00+07:00', '2026-08-10T08:30:00+07:00', holidays), 1);
  // อังคาร 2026-08-11 → พุธ 2026-08-12 ที่เป็นวันหยุด = ยังไม่ครบ 1 วันทำการ
  assert.equal(businessDaysWaiting('2026-08-11T09:00:00+07:00', '2026-08-12T08:30:00+07:00', holidays), 0);
  // วันเดียวกัน = 0 เสมอ แม้ต่างกันหลายชั่วโมง (กดตอนเช้า ตอนเย็นยังไม่ทวง)
  assert.equal(businessDaysWaiting('2026-08-10T01:00:00+07:00', '2026-08-10T23:00:00+07:00', holidays), 0);
});

test('เกณฑ์เตือน: ค้างวันเดียวกันยังไม่เตือน ข้ามไปวันทำการถัดไปจึงเตือน', () => {
  const holidays = new Set();
  const rows = [
    { id: 'สด', at: '2026-08-10T14:00:00+07:00' },
    { id: 'ค้างข้ามวัน', at: '2026-08-07T14:00:00+07:00' },
  ];
  const kept = agedAtLeast(rows, {
    sinceOf: (row) => row.at,
    asOf: '2026-08-10T08:30:00+07:00',
    holidays,
    minBusinessDays: 1,
  });
  assert.deepEqual(kept.map((row) => row.id), ['ค้างข้ามวัน']);
});

test('ไม่มีวันที่เข้าคิว = ไม่เตือน (ข้อมูลเก่าที่ไม่มี timestamp ต้องไม่สแปมทุกเช้า)', () => {
  const kept = agedAtLeast([{ id: 'ไม่มีวันที่', at: null }], {
    sinceOf: (row) => row.at,
    asOf: '2026-08-10T08:30:00+07:00',
    holidays: new Set(),
    minBusinessDays: 1,
  });
  assert.deepEqual(kept, []);
});
