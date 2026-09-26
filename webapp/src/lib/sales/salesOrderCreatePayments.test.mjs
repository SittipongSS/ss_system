// ── เขียนวันของงวด + เงินงวดแรกจากหน้าสร้างใบสั่งขาย (applyCreateFormPayments) — supabase ปลอม ──
//
// สิ่งที่ชุดนี้ล็อกไว้ (เดิมมีแค่ยามอ่านซอร์ส · review S4 26/09):
//   · วันของงวดหนึ่งเขียนล้ม **ไม่ลาก** งวดถัดไปและเงินงวดแรกล้มตาม — เขียนต่อจนจบแล้วค่อยโยน error ตัวแรก
//     (ผู้เรียกแปลงเป็นคำเตือนหลัง 201 · หลักฐานเงินที่อัปแล้วต้องได้ผูกกับงวด ไม่ลอยค้าง)
//   · งวดยกมา + งวดที่ไม่อยู่ในแผนถูกข้าม · ไม่มีงวด = ไม่เขียนอะไร · ไม่เคยเขียน status (งวดร่างต้อง pending — CHECK 0259)
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCreateFormPayments } from './salesOrderCreatePayments.js';
import { OPENING_INSTALLMENT_KIND } from './historicalOrders.js';

/* supabase ปลอมเท่าที่ loadInstallments / updateInstallment ใช้ — `failWhen({ id, patch })` = คำสั่ง update ที่ฐานตอบ error */
function fakeSupabase(rows, { failWhen = () => false } = {}) {
  const writes = [];
  return {
    writes,
    from(table) {
      assert.equal(table, 'sales_order_installments');
      const state = { patch: null, filters: {} };
      const run = () => {
        if (!state.patch) {
          return { data: rows.filter((row) => row.salesOrderId === state.filters.salesOrderId), error: null };
        }
        const id = state.filters.id;
        if (failWhen({ id, patch: state.patch })) return { data: null, error: { code: '22008', message: 'date/time field value out of range' } };
        writes.push({ id, patch: state.patch });
        return { data: { id, ...state.patch }, error: null };
      };
      const builder = {
        select: () => builder,
        order: () => builder,
        eq: (column, value) => { state.filters[column] = value; return builder; },
        update: (patch) => { state.patch = patch; return builder; },
        maybeSingle: async () => run(),
        then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
      };
      return builder;
    },
  };
}

const ORDER = 'SOR-1';
const rowsOf = () => [
  { id: 'I1', salesOrderId: ORDER, seq: 1, status: 'pending', note: null },
  { id: 'I2', salesOrderId: ORDER, seq: 2, status: 'pending', note: null },
  { id: 'I3', salesOrderId: ORDER, seq: 3, status: 'pending', note: 'งวดสุดท้ายหลังติดตั้ง' },
];
const quiet = (t) => t.mock.method(console, 'error', () => {});
/* ตัด updatedAt ที่ updateInstallment เติมเอง — เทียบเฉพาะสิ่งที่ผู้เรียกส่ง */
const written = (supabase) => supabase.writes.map(({ id, patch }) => {
  const { updatedAt, ...rest } = patch;
  assert.ok(updatedAt, 'updateInstallment ต้องประทับเวลาแก้');
  return { id, patch: rest };
});

test('🔴 วันของงวด 1 เขียนล้ม: งวด 2 ยังถูกเขียน · เงินงวดแรกยังถูกผูก · แล้วค่อยโยน error ตัวแรก', async (t) => {
  quiet(t);
  // ล้มเฉพาะช่องวันที่ของงวด 1 (เช่น 22008) — การผูกเงินงวดแรกลงแถวเดียวกันต้องยังผ่าน
  const supabase = fakeSupabase(rowsOf(), { failWhen: ({ id, patch }) => id === 'I1' && 'dueDate' in patch });
  const evidence = [{ fileName: 'slip.jpg', storagePath: 'x/slip.jpg' }];
  await assert.rejects(
    applyCreateFormPayments(supabase, {
      orderId: ORDER,
      dates: [
        { seq: 1, patch: { dueDate: '2026-10-25', billingDate: '2026-10-05' } },
        { seq: 2, patch: { billingEvent: 'ก่อนส่งสินค้า' } },
      ],
      firstPaidOn: '2026-09-26',
      firstEvidence: evidence,
    }),
    (error) => error?.code === '22008',
  );
  assert.deepEqual(written(supabase), [
    { id: 'I2', patch: { billingEvent: 'ก่อนส่งสินค้า' } },
    { id: 'I1', patch: { paidOn: '2026-09-26', evidence, note: 'ลูกค้าจ่ายมาก่อนออกใบ — บันทึกจากฟอร์มสร้างใบสั่งขาย' } },
  ]);
});

test('ล้มหลายงวด = โยนตัวแรก · งวดที่เหลือยังเขียนครบ', async (t) => {
  quiet(t);
  const supabase = fakeSupabase(rowsOf(), { failWhen: ({ id }) => id === 'I1' || id === 'I2' });
  await assert.rejects(applyCreateFormPayments(supabase, {
    orderId: ORDER,
    dates: [
      { seq: 1, patch: { dueDate: '2026-10-25' } },
      { seq: 2, patch: { dueDate: '2026-11-25' } },
      { seq: 3, patch: { dueDate: '2026-12-25' } },
    ],
  }), (error) => /out of range/.test(error?.message));
  assert.deepEqual(written(supabase), [{ id: 'I3', patch: { dueDate: '2026-12-25' } }]);
});

test('ทางปกติ: เขียนตาม seq · ข้ามงวดยกมาและงวดที่ไม่อยู่ในแผน · โน้ตเดิมของงวดแรกไม่ถูกทับ · ไม่แตะ status', async () => {
  const rows = rowsOf();
  rows[1] = { ...rows[1], kind: OPENING_INSTALLMENT_KIND };
  rows[0] = { ...rows[0], note: 'มัดจำตาม PO' };
  const supabase = fakeSupabase(rows);
  await applyCreateFormPayments(supabase, {
    orderId: ORDER,
    dates: [
      { seq: 1, patch: { dueDate: '2026-10-25', billingDate: '2026-10-05' } },
      { seq: 2, patch: { dueDate: '2026-11-25' } },
      { seq: 9, patch: { dueDate: '2026-12-25' } },
    ],
    firstPaidOn: '2026-09-26',
    firstEvidence: [],
  });
  const out = written(supabase);
  assert.deepEqual(out, [
    { id: 'I1', patch: { dueDate: '2026-10-25', billingDate: '2026-10-05' } },
    { id: 'I1', patch: { paidOn: '2026-09-26', evidence: [], note: 'มัดจำตาม PO' } },
  ]);
  assert.ok(out.every(({ patch }) => !('status' in patch)), 'งวดร่างต้องเป็น pending เสมอ (CHECK 0259)');
});

test('ใบไม่มีงวด / ไม่มีอะไรให้เขียน = ไม่แตะฐาน', async () => {
  const empty = fakeSupabase([]);
  await applyCreateFormPayments(empty, { orderId: ORDER, dates: [{ seq: 1, patch: { dueDate: '2026-10-25' } }], firstPaidOn: '2026-09-26' });
  assert.deepEqual(empty.writes, []);
  const none = fakeSupabase(rowsOf());
  await applyCreateFormPayments(none, { orderId: ORDER, dates: [], firstPaidOn: '' });
  assert.deepEqual(none.writes, []);
});
