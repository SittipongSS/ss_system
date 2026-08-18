import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureInstallments, freezeInstallments } from './salesOrderInstallmentsStore.js';

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

/* ── freeze: เงินที่บันทึกไว้ตอนร่างต้องรอดและเข้าคิวบัญชี (มติผู้ใช้ 2026-08-19) ──
   งวดร่างจอดที่ `pending` เพราะยอดยังลอย ⇒ ถ้า freeze ไม่เลื่อนให้เป็น `reported`
   สลิปที่ SA แนบไว้จะไม่มีวันโผล่ในคิวของบัญชี = บันทึกแล้วหายเข้ากลีบเมฆ */

// stub supabase แบบมีสถานะ — รองรับ select / update / delete / insert ที่ freeze ใช้
const fakeDb = (seed = []) => {
  const store = new Map(seed.map((r) => [r.id, { ...r }]));
  const calls = { deleted: [], insertCount: 0 };
  return {
    store,
    calls,
    rows: () => [...store.values()].sort((a, b) => a.seq - b.seq),
    from(table) {
      assert.equal(table, TABLE);
      const self = this;
      return {
        select: () => ({
          eq: () => ({ order: async () => ({ data: self.rows(), error: null }) }),
        }),
        insert(payload) {
          calls.insertCount += 1;
          payload.forEach((r) => store.set(r.id, { ...r }));
          return { select: async () => ({ data: payload, error: null }) };
        },
        update: (patch) => ({
          eq: async (_col, id) => {
            store.set(id, { ...store.get(id), ...patch });
            return { error: null };
          },
        }),
        delete: () => ({
          in: async (_col, ids) => {
            ids.forEach((id) => { calls.deleted.push(id); store.delete(id); });
            return { error: null };
          },
        }),
      };
    },
  };
};

const draftRow = (over = {}) => ({
  id: 'SOI-1', salesOrderId: 'SOR-1', seq: 1, label: 'มัดจำ', percent: 50, amount: 500,
  status: 'pending', frozenAt: null, evidence: [], ...over,
});

test('อนุมัติใบ: งวดร่างที่บันทึกเงินไว้ถูกเลื่อนเป็น reported พร้อม frozenAt', async () => {
  const db = fakeDb([
    draftRow({ paidOn: '2026-08-18', evidence: [{ name: 'slip.pdf' }], reportedAt: '2026-08-18T04:00:00.000Z', reportedById: 'U1' }),
    draftRow({ id: 'SOI-2', seq: 2, label: 'ก่อนส่งของ' }),
  ]);

  await freezeInstallments(db, { order: order(), user, now: '2026-08-19T03:00:00.000Z' });

  const [first, second] = db.rows();
  assert.equal(first.status, 'reported');
  assert.equal(first.paidOn, '2026-08-18');       // ของ SA ไม่ถูกทับ
  assert.equal(first.reportedById, 'U1');
  assert.equal(first.frozenAt, '2026-08-19T03:00:00.000Z');
  // งวดที่ไม่มีใครแตะยังเป็น pending ตามเดิม
  assert.equal(second.status, 'pending');
  assert.equal(second.frozenAt, '2026-08-19T03:00:00.000Z');
});

test('อนุมัติใบ: หลักฐานตอนปิด Won ไม่ทับงวดที่ SA บันทึกเงินไว้เอง', async () => {
  const db = fakeDb([
    draftRow({ paidOn: '2026-08-18', evidence: [{ name: 'slip-ของ-SA.pdf' }] }),
    draftRow({ id: 'SOI-2', seq: 2, label: 'ก่อนส่งของ' }),
  ]);
  const withWonSlip = order({
    quotation: {
      ...order().quotation,
      wonDocType: 'payment_slip',
      wonDocDate: '2026-08-01',
      wonAttachments: [{ name: 'slip-ตอนปิด-Won.pdf' }],
    },
  });

  await freezeInstallments(db, { order: withWonSlip, user, now: '2026-08-19T03:00:00.000Z' });

  const [first] = db.rows();
  assert.equal(first.paidOn, '2026-08-18');
  assert.deepEqual(first.evidence, [{ name: 'slip-ของ-SA.pdf' }]);
});

test('อนุมัติใบ: แผนเปลี่ยนจำนวนงวด ห้ามลบแถวที่มีเงินบันทึกไว้ทิ้ง', async () => {
  const db = fakeDb([
    draftRow({ paidOn: '2026-08-18', evidence: [{ name: 'slip.pdf' }] }),
    draftRow({ id: 'SOI-2', seq: 2, label: 'ก่อนส่งของ' }),
    draftRow({ id: 'SOI-3', seq: 3, label: 'หลังติดตั้ง' }),
  ]); // 3 งวดในใบ แต่แผนของ QT เหลือ 2

  await freezeInstallments(db, { order: order(), user, now: '2026-08-19T03:00:00.000Z' });

  assert.deepEqual(db.calls.deleted, []);
  assert.equal(db.rows().length, 3);
  assert.equal(db.rows()[0].status, 'reported');
  assert.ok(db.rows().every((r) => r.frozenAt));
});

test('อนุมัติใบ: แผนเปลี่ยนจำนวนงวด และไม่มีเงินบันทึกไว้ ⇒ ตั้งใหม่ทั้งชุดตามเดิม', async () => {
  const db = fakeDb([
    draftRow(),
    draftRow({ id: 'SOI-2', seq: 2, label: 'ก่อนส่งของ' }),
    draftRow({ id: 'SOI-3', seq: 3, label: 'หลังติดตั้ง' }),
  ]);

  await freezeInstallments(db, { order: order(), user, now: '2026-08-19T03:00:00.000Z' });

  assert.deepEqual(db.calls.deleted, ['SOI-1', 'SOI-2', 'SOI-3']);
  assert.equal(db.rows().length, 2);
  assert.ok(db.rows().every((r) => r.frozenAt === '2026-08-19T03:00:00.000Z'));
});
