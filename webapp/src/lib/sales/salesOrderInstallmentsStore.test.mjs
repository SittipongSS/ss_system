import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureInstallments } from './salesOrderInstallmentsStore.js';

/* สัญญาที่ "งวดเกิดพร้อมใบ" (มติผู้ใช้ 2026-08-19) พิงอยู่ — POST ของการออกใบสั่งขาย
   เรียก `ensureInstallments` โดย **ไม่ส่ง `frozenAt`** ⇒ ต้องได้งวดร่างล้วนเสมอ
   ถ้าวันหนึ่งมีใครทำให้มันคืนแถว `reported` ตอนไม่ freeze แถวนั้นจะชน CHECK
   `sales_order_installments_draft_pending` ของ 0259 แล้วการออกใบจะพังทั้งเส้น */

const TABLE = 'sales_order_installments';

// stub supabase: จำ payload ที่ insert ไว้ให้ตรวจ · loadInstallments อ่านจากของที่มีอยู่
const fakeSupabase = (existing = []) => {
  const calls = { inserted: null, insertCount: 0 };
  return {
    calls,
    from(table) {
      assert.equal(table, TABLE);
      return {
        select: () => ({
          eq: () => ({ order: async () => ({ data: calls.inserted || existing, error: null }) }),
        }),
        insert(payload) {
          calls.inserted = payload;
          calls.insertCount += 1;
          return { select: async () => ({ data: payload, error: null }) };
        },
      };
    },
  };
};

const order = (over = {}) => ({
  id: 'SOR-1',
  totalAmount: 1000,
  quotation: {
    paymentPlan: {
      type: 'installment',
      installments: [
        { label: 'มัดจำ', percent: 50 },
        { label: 'ก่อนส่งของ', percent: 50 },
      ],
    },
  },
  ...over,
});

const user = { id: 'U1', name: 'สมชาย' };

test('ออกใบแล้วได้งวดร่างตามแผนของ QT — ยังไม่ freeze', async () => {
  const supabase = fakeSupabase();
  const { rows, created } = await ensureInstallments(supabase, { order: order(), user });

  assert.equal(created, true);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.seq), [1, 2]);
  assert.deepEqual(rows.map((r) => r.amount), [500, 500]);
  // frozenAt ต้องไม่ถูกเขียนเลย — ยอดยังต้องเดินตามแผนจนกว่าใบจะอนุมัติ
  assert.ok(rows.every((r) => r.frozenAt === undefined));
  assert.ok(rows.every((r) => r.status === 'pending'));
});

test('งวดร่างเป็น pending ล้วน แม้ QT ปิดด้วยสลิปโอนเงิน', async () => {
  const supabase = fakeSupabase();
  const { rows } = await ensureInstallments(supabase, {
    order: order({
      quotation: {
        ...order().quotation,
        wonDocType: 'payment_slip',
        wonDocDate: '2026-08-19',
        wonAttachments: [{ name: 'slip.pdf' }],
      },
    }),
    user,
  });

  // หลักฐาน Won ยืมมาได้เฉพาะตอน freeze (ตอนอนุมัติ) — ที่นี่ต้องไม่ติดมาด้วย
  assert.ok(rows.every((r) => r.status === 'pending'));
  assert.ok(rows.every((r) => !r.evidence.length));
});

test('เรียกซ้ำบนใบที่มีงวดแล้วไม่สร้างซ้ำ', async () => {
  const supabase = fakeSupabase([{ id: 'SOI-1', seq: 1, status: 'pending' }]);
  const { rows, created } = await ensureInstallments(supabase, { order: order(), user });

  assert.equal(created, false);
  assert.equal(rows.length, 1);
  assert.equal(supabase.calls.insertCount, 0);
});

test('QT ที่ไม่ได้ระบุแผนชำระ = งวดเดียวเต็มจำนวน ไม่ใช่ศูนย์งวด', async () => {
  const supabase = fakeSupabase();
  const { rows, created } = await ensureInstallments(supabase, {
    order: order({ quotation: null }),
    user,
  });

  // ⚠️ ไม่มีแผน = แผน "เต็มจำนวน" 1 งวด ไม่ใช่ศูนย์งวด (paymentScheduleRows)
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 1000);
  assert.equal(created, true);
});

test('ใบยอด 0 ไม่มีงวดให้สร้าง', async () => {
  const supabase = fakeSupabase();
  const { rows, created } = await ensureInstallments(supabase, {
    order: order({ totalAmount: 0 }),
    user,
  });

  assert.equal(rows.length, 0);
  assert.equal(created, false);
  assert.equal(supabase.calls.insertCount, 0);
});
