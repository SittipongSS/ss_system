import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTALLMENT_MOVE_SCHEMA_MISSING, ensureInstallments, freezeInstallments, installmentMoveColumnError, replanInstallments,
  updateInstallment, carryInstallments, loadMovedOut, loadCarrySources, INSTALLMENT_REFUND_SCHEMA_MISSING,
  loadMovedOutOfOrders,
  installmentRefundSchemaError,
} from './salesOrderInstallmentsStore.js';
import { INSTALLMENT_REPLAN_SCHEMA_MISSING } from './installmentReplan.js';
import { INSTALLMENT_CARRY_SCHEMA_MISSING } from './installmentCarry.js';

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
  const calls = { deleted: [], insertCount: 0, updates: [] };
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
        /* `eq` ต้องเป็นได้ทั้ง **await ตรง ๆ** (ของเดิม) และ **ต่อ .select().maybeSingle()**
           (ทางที่ freeze ใช้ตอนเขียนค่าที่อุ้มไว้กลับ) ⇒ คืน thenable ที่มี select ด้วย */
        update: (patch) => ({
          eq: (_col, id) => {
            const apply = () => {
              calls.updates.push({ id, patch });
              store.set(id, { ...store.get(id), ...patch });
              return store.get(id);
            };
            return {
              then: (resolve) => resolve({ data: apply(), error: null }),
              select: () => ({ maybeSingle: async () => ({ data: apply(), error: null }) }),
            };
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

/* ── 🐞 อนุมัติใบแล้วจำนวนงวดไม่ตรงแผน: ของที่คนกรอกเองต้องรอด (แก้ 07/09/2026) ──
   เดิมลบงวดร่างทั้งชุดแล้วสร้างจากแผนเปล่า ⇒ `coversFrom`/`coversTo` หายไปด้วย
   ⇒ `paidThrough` คืน null ⇒ ด่านเงินของ visitGate บล็อกนัดช่างทุกโซนของไซต์
     ทั้งที่ลูกค้าจ่ายแล้ว — อาการเดียวกับบั๊กออก Rev. (mig 0346) แต่คนละเส้น
   ⚠️ ตอนเขียนกติกาลบครั้งแรก คอลัมน์ช่วงครอบยังไม่เกิด (มาที่ mig 0320) ⇒ เหตุผลเดิม
     ที่ว่า "แลกกับ dueDate ที่จอเตือนไว้แล้ว" หมดอายุไปตั้งแต่วันนั้น */
test('🐞 ตั้งงวดใหม่แล้ว ช่วงครอบบริการ/วันกำหนด/หมายเหตุ ต้องไม่หายตาม seq', async () => {
  const db = fakeDb([
    draftRow({ id: 'SOI-1', seq: 1, coversFrom: '2026-09-01', coversTo: '2027-02-28', dueDate: '2026-08-15', note: 'ครึ่งปีแรก' }),
    draftRow({ id: 'SOI-2', seq: 2, coversFrom: '2027-03-01', coversTo: '2027-08-31', dueDate: '2027-02-15' }),
    draftRow({ id: 'SOI-3', seq: 3, coversFrom: '2027-09-01', coversTo: '2028-02-29' }),
  ]);
  // แผนของ QT เหลือ 2 งวด แต่ของเดิมมี 3 ⇒ เข้าเส้น "ลบแล้วตั้งใหม่"
  await freezeInstallments(db, { order: order(), user, now: '2026-08-19T03:00:00.000Z' });

  const rows = db.rows();
  assert.deepEqual(db.calls.deleted, ['SOI-1', 'SOI-2', 'SOI-3'], 'ยังตั้งใหม่ทั้งชุดเหมือนเดิม');
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.frozenAt === '2026-08-19T03:00:00.000Z'));

  // 🔑 ของที่คนกรอกเองต้องตามมาตาม seq
  assert.equal(rows[0].coversFrom, '2026-09-01');
  assert.equal(rows[0].coversTo, '2027-02-28', 'ช่วงครอบหาย = ด่านเงินบล็อกนัดทั้งไซต์');
  assert.equal(rows[0].dueDate, '2026-08-15');
  assert.equal(rows[0].note, 'ครึ่งปีแรก');
  assert.equal(rows[1].coversTo, '2027-08-31');

  // ยอด/ป้ายยังมาจากแผนล่าสุด ไม่ใช่ของเก่า
  assert.deepEqual(rows.map((r) => r.amount), [500, 500]);
});

/* ⚠️ งวดที่แผนใหม่ไม่มีคู่ ต้องได้ค่าว่าง ไม่ใช่ยืมของงวดอื่นมาแปะ —
   ด่านยังกันอยู่ (งวดที่ confirmed แต่ไม่มี coversTo ไม่ขยับ "จ่ายถึง") */
test('⚠️ งวดที่เกินมาจากแผนใหม่ ต้องได้ค่าว่าง ไม่ใช่ยืมของงวดอื่น', async () => {
  const db = fakeDb([
    draftRow({ id: 'SOI-1', seq: 1, coversFrom: '2026-09-01', coversTo: '2027-02-28' }),
  ]);
  const threePlan = order({
    quotation: {
      paymentPlan: {
        type: 'installment',
        installments: [
          { label: 'มัดจำ', percent: 30 },
          { label: 'ระหว่างทาง', percent: 30 },
          { label: 'ก่อนส่งของ', percent: 40 },
        ],
      },
    },
  });
  await freezeInstallments(db, { order: threePlan, user, now: '2026-08-19T03:00:00.000Z' });

  const rows = db.rows();
  assert.equal(rows.length, 3);
  assert.equal(rows[0].coversTo, '2027-02-28', 'งวดที่มีคู่ต้องได้ของเดิม');
  assert.equal(rows[1].coversTo ?? null, null, 'งวดใหม่ต้องว่าง ให้คนไปเติมเอง');
  assert.equal(rows[2].coversTo ?? null, null);
});

/* 🪤 คำร้องขอใบวางบิลผูกกับ *ยอด* ของงวดนั้น — แผนเปลี่ยนแปลว่ายอดเปลี่ยน
   ⇒ ยกมาแปะงวดใหม่คือชี้คำร้องไปที่ยอดคนละตัว · ปล่อยให้หลุดแล้วให้คนแนบใหม่ */
test('🪤 billingRequestId ต้องไม่ถูกอุ้มข้ามการตั้งใหม่', async () => {
  const db = fakeDb([
    draftRow({ id: 'SOI-1', seq: 1, billingRequestId: 'RQ-1', coversTo: '2027-02-28' }),
    draftRow({ id: 'SOI-2', seq: 2, billingRequestId: 'RQ-2' }),
    draftRow({ id: 'SOI-3', seq: 3 }),
  ]);
  await freezeInstallments(db, { order: order(), user, now: '2026-08-19T03:00:00.000Z' });

  const rows = db.rows();
  assert.ok(rows.every((r) => !r.billingRequestId), 'ห้ามแปะคำร้องเดิมลงงวดที่ยอดเปลี่ยนแล้ว');
  assert.equal(rows[0].coversTo, '2027-02-28', 'แต่ช่วงครอบยังต้องตามมา');
});

/* 🔴 ใบกำกับภาษี (mig 0348) — งวดร่างที่ออกใบไปแล้ว **ห้ามถูกลบทิ้งตอนอนุมัติใบ**
   ของจริงที่กันไว้: ลูกค้าขอใบกำกับก่อนจ่าย ⇒ FN ออกใบและบันทึกไว้ตั้งแต่งวดยังเป็นร่าง
   ⇒ ถ้าแผนของ QT เปลี่ยนจำนวนงวดพอดี เส้น "ลบแล้วตั้งใหม่" จะกลืนเลข/วัน/ไฟล์ไปทั้งชุด
   โดยไม่มี error และ store ไม่เขียน audit ⇒ **กู้ไม่ได้เลย** (ไม่มีถังขยะในระบบนี้)
   ⚠️ ต่างจาก billingRequestId ที่จงใจปล่อยให้หลุด — นั่นคือ *ลิงก์* ที่แนบใหม่ได้
   ส่วนนี่คือ *เอกสารกฎหมายที่ออกไปหาลูกค้าแล้ว* */
test('🔴 งวดร่างที่มีใบกำกับภาษีแล้ว ต้องไม่ถูกตั้งใหม่ทับ', async () => {
  const db = fakeDb([
    draftRow({ id: 'SOI-1', seq: 1, taxInvoiceNo: 'IV-6809001', taxInvoiceDate: '2026-09-01' }),
    draftRow({ id: 'SOI-2', seq: 2 }),
    draftRow({ id: 'SOI-3', seq: 3 }),
  ]);
  await freezeInstallments(db, { order: order(), user, now: '2026-08-19T03:00:00.000Z' });

  assert.deepEqual(db.calls.deleted, [], 'ห้ามลบงวดที่ออกใบกำกับไปแล้ว');
  const rows = db.rows();
  assert.equal(rows.length, 3, 'จำนวนงวดต้องคงเดิม ให้คนไปแก้เอง');
  assert.equal(rows[0].taxInvoiceNo, 'IV-6809001');
});

/* ══ PR0 · ชุดที่มีแถวตรึงยอดแล้ว = แผนจริงของใบ (แผน so-payment-unlock-replan · มติเจ้าของ 23/09) ══════
   หลักการ "เงินหนึ่งก้อน = งวดหนึ่งแถว": งวดที่ยกมากับใบ Rev. (PR1) และแผนที่ปรับหลังอนุมัติ (PR2) ตรึงยอดแล้วทั้งแถว
   ⇒ ตอนอนุมัติใบ (freeze) ห้ามตั้งใหม่ · ห้ามทับยอดจาก QT · ห้ามยืมสลิปของตอนยืนยันคำสั่งซื้อซ้ำ
   (สลิปนั้นอยู่ในงวดที่ยกมาแล้ว — ยืมอีกรอบ = เงินก้อนเดียวถูกแจ้งสองแถว) */
const slipOrder = (over = {}) => order({
  quotation: {
    ...order().quotation,
    wonDocType: 'payment_slip',
    wonDocDate: '2026-08-01',
    wonAttachments: [{ name: 'slip-ตอนปิด-Won.pdf' }],
  },
  ...over,
});
const FROZE = '2026-08-10T03:00:00.000Z';

test('🔴 ใบ Rev. ที่ทุกแถวตรึงยอดแล้ว + ยืนยันคำสั่งซื้อด้วยสลิป: freeze ไม่เขียนอะไรเลย และไม่ยืมสลิปซ้ำ', async () => {
  const db = fakeDb([
    draftRow({ id: 'SOI-1', seq: 1, amount: 500, status: 'confirmed', frozenAt: FROZE, evidence: [{ name: 'slip-เดิม.pdf' }] }),
    draftRow({ id: 'SOI-2', seq: 2, amount: 500, status: 'pending', frozenAt: FROZE, label: 'ก่อนส่งของ' }),
  ]);
  const result = await freezeInstallments(db, { order: slipOrder(), user, now: '2026-09-23T03:00:00.000Z' });

  assert.equal(result.frozen, false);
  assert.deepEqual(db.calls.updates, [], 'ห้ามเขียนแถวใดเลย');
  assert.deepEqual(db.calls.deleted, []);
  assert.equal(db.calls.insertCount, 0);
  assert.equal(db.rows()[1].status, 'pending', 'สลิปตอนปิด Won ต้องไม่ถูกยืมมาแปะงวดที่ยกมา');
  assert.ok(db.rows().every((r) => r.frozenAt === FROZE), 'ยอดที่ตรึงไว้ห้ามถูกประทับใหม่');
});

test('🔴 ชุดที่ปนแถวตรึงแล้วกับแถวร่าง (จำนวนตรงแผน): ห้ามทับยอด/ป้ายจาก QT · ห้ามยืมสลิป · ประทับ frozenAt อย่างเดียว', async () => {
  const db = fakeDb([
    draftRow({ id: 'SOI-1', seq: 1, label: 'มัดจำ (ปรับ)', percent: 30, amount: 300, status: 'confirmed', frozenAt: FROZE }),
    draftRow({ id: 'SOI-2', seq: 2, label: 'งวดกลาง', percent: 20, amount: 200 }),
    draftRow({ id: 'SOI-3', seq: 3, label: 'งวดท้าย', percent: 50, amount: 500 }),
  ]); // แผนของ QT = 2 งวด 50/50 · แถวร่าง 2 แถว ⇒ ทางเดิมจะทับงวด 2 เป็น 500 (Σ = 1,300)
  const result = await freezeInstallments(db, { order: slipOrder(), user, now: '2026-09-23T03:00:00.000Z' });

  const rows = db.rows();
  assert.equal(result.frozen, true);
  assert.deepEqual(db.calls.deleted, []);
  assert.deepEqual(rows.map((r) => r.amount), [300, 200, 500], 'ยอดทุกแถวคงเดิม');
  assert.deepEqual(rows.map((r) => r.label), ['มัดจำ (ปรับ)', 'งวดกลาง', 'งวดท้าย']);
  assert.deepEqual(rows.map((r) => r.percent), [30, 20, 50]);
  assert.deepEqual(rows.map((r) => r.status), ['confirmed', 'pending', 'pending'], 'ห้ามยืมสลิปตอนปิด Won มาแปะ');
  assert.equal(rows[0].frozenAt, FROZE, 'แถวที่ตรึงแล้วห้ามถูกประทับใหม่');
  assert.equal(rows[1].frozenAt, '2026-09-23T03:00:00.000Z');
  assert.equal(rows[2].frozenAt, '2026-09-23T03:00:00.000Z');
  assert.ok(db.calls.updates.every((u) => u.id !== 'SOI-1'), 'ไม่แตะแถวที่ตรึงแล้ว');
  for (const { patch } of db.calls.updates) {
    assert.deepEqual(Object.keys(patch).sort(), ['frozenAt', 'updatedAt'], 'ประทับ frozenAt อย่างเดียว');
  }
});

test('🔴 ชุดที่ปนแถวตรึงแล้ว (จำนวนไม่ตรงแผน): ห้ามเข้าเส้น "ลบแล้วตั้งใหม่"', async () => {
  const db = fakeDb([
    draftRow({ id: 'SOI-1', seq: 1, amount: 300, status: 'confirmed', frozenAt: FROZE }),
    draftRow({ id: 'SOI-2', seq: 2, amount: 700 }),
  ]); // แผน 3 งวด vs แถวร่าง 1 แถว ⇒ ทางเดิมลบงวด 2 แล้วสร้าง 3 งวดใหม่ต่อท้ายงวดที่มีเงิน
  const threePlan = slipOrder({
    quotation: { paymentPlan: { type: 'installment', installments: [{ percent: 30 }, { percent: 30 }, { percent: 40 }] } },
  });
  await freezeInstallments(db, { order: threePlan, user, now: '2026-09-23T03:00:00.000Z' });

  assert.deepEqual(db.calls.deleted, []);
  assert.equal(db.calls.insertCount, 0);
  assert.deepEqual(db.rows().map((r) => r.amount), [300, 700]);
  assert.ok(db.rows().every((r) => r.frozenAt));
});

test('ชุดที่ปนแถวตรึงแล้ว: งวดร่างที่บันทึกเงินไว้เองยังเข้าคิวบัญชีตามเดิม (เงินของแถวนั้นเอง ไม่ใช่การยืม)', async () => {
  const db = fakeDb([
    draftRow({ id: 'SOI-1', seq: 1, amount: 500, status: 'confirmed', frozenAt: FROZE }),
    draftRow({ id: 'SOI-2', seq: 2, amount: 500, paidOn: '2026-09-20', evidence: [{ name: 'slip-งวด2.pdf' }] }),
  ]);
  await freezeInstallments(db, { order: order(), user, now: '2026-09-23T03:00:00.000Z' });
  const second = db.rows()[1];
  assert.equal(second.status, 'reported');
  assert.equal(second.reportedAt, '2026-09-23T03:00:00.000Z', 'reported ต้องมี reportedAt (CHECK ของ 0245)');
  assert.equal(second.amount, 500);
});

test('ชุดที่ปนแถวตรึงแล้ว: ยอดรวมไม่เท่ายอดใบ = console.error ดัง ๆ (ไม่แก้เอง) · เท่ากัน = เงียบ', async (t) => {
  const errors = [];
  t.mock.method(console, 'error', (...args) => { errors.push(args.join(' ')); });

  const off = fakeDb([
    draftRow({ id: 'SOI-1', seq: 1, amount: 300, status: 'confirmed', frozenAt: FROZE }),
    draftRow({ id: 'SOI-2', seq: 2, amount: 200 }),
  ]); // Σ 500 vs ยอดใบ 1,000
  await freezeInstallments(off, { order: order(), user, now: '2026-09-23T03:00:00.000Z' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /SOR-1/);
  assert.deepEqual(off.rows().map((r) => r.amount), [300, 200], 'ห้ามแก้ยอดเอง');

  errors.length = 0;
  const even = fakeDb([
    draftRow({ id: 'SOI-1', seq: 1, amount: 300, status: 'confirmed', frozenAt: FROZE }),
    draftRow({ id: 'SOI-2', seq: 2, amount: 700 }),
  ]);
  await freezeInstallments(even, { order: order(), user, now: '2026-09-23T03:00:00.000Z' });
  assert.equal(errors.length, 0);
});

/* ── updateInstallment: optimistic lock (PR0) ───────────────────────────────────────────
   🐞 เดิมอัปเดตโดยไม่มีเงื่อนไข ⇒ สองหน้าต่างเขียนแถวเดียวกันพร้อมกัน ตัวที่มาทีหลังชนะเงียบ ๆ */
const lockDb = (row) => {
  const state = { row: { ...row }, filters: [] };
  return {
    state,
    from(table) {
      assert.equal(table, TABLE);
      return {
        update(patch) {
          const filters = [];
          const chain = {
            eq(col, value) { filters.push([col, value]); return chain; },
            select() {
              return {
                maybeSingle: async () => {
                  state.filters = filters;
                  const hit = filters.every(([col, value]) => state.row[col] === value);
                  if (!hit) return { data: null, error: null };
                  state.row = { ...state.row, ...patch };
                  return { data: state.row, error: null };
                },
              };
            },
          };
          return chain;
        },
      };
    },
  };
};

test('updateInstallment: expectedUpdatedAt ไม่ตรง = คืน null และไม่เขียน · ตรง = เขียน · ไม่ส่ง = เขียนแบบเดิม', async () => {
  const base = { id: 'SOI-1', status: 'reported', updatedAt: '2026-09-23T03:00:00.123456+00:00' };

  const stale = lockDb(base);
  const none = await updateInstallment(stale, 'SOI-1', { status: 'confirmed' }, { expectedUpdatedAt: '2026-09-22T00:00:00+00:00' });
  assert.equal(none, null);
  assert.equal(stale.state.row.status, 'reported', 'แถวต้องไม่ถูกแตะ');
  assert.deepEqual(stale.state.filters, [['id', 'SOI-1'], ['updatedAt', '2026-09-22T00:00:00+00:00']]);

  const fresh = lockDb(base);
  const done = await updateInstallment(fresh, 'SOI-1', { status: 'confirmed' }, { expectedUpdatedAt: base.updatedAt });
  assert.equal(done.status, 'confirmed');
  assert.notEqual(done.updatedAt, base.updatedAt, 'เขียนแล้วต้องได้ updatedAt ใหม่ (ตัวล็อกของรอบถัดไป)');

  const legacy = lockDb(base);
  assert.equal((await updateInstallment(legacy, 'SOI-1', { dueDate: '2026-10-01' })).dueDate, '2026-10-01');
  assert.deepEqual(legacy.state.filters, [['id', 'SOI-1']], 'ผู้เรียกเดิม (ออกใบ) ไม่ถูกบังคับล็อก');
});

/* ── ด่านลำดับ deploy ของ PR1 (mig 0376) ──────────────────────────────────────────────────────
   🛑 โค้ด PR1 ปลดด่าน "มีเงินรับแล้ว" ออกจากการย้อนการอนุมัติ — ถ้าฐานยังเป็น RPC ออก Rev. ตัวก๊อป (ก่อน 0376)
     เงินที่รับแล้วจะถูกก๊อปเป็นงวดค้างรับบนใบ Rev. ⇒ route ย้อนการอนุมัติถามคอลัมน์ movedFrom ก่อน (limit 0 · ไม่ดึงแถว) */
const probeSupabase = (result) => {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
          return { limit: async (n) => { calls.push(['limit', n]); return result; } };
        },
      };
    },
  };
};

test('installmentMoveColumnError: มีคอลัมน์ = null · ไม่มีคอลัมน์ (42703) = บอกให้รัน 0376 · อ่านพลาดอย่างอื่น = บอกตามจริง', async () => {
  const ok = probeSupabase({ data: [], error: null });
  assert.equal(await installmentMoveColumnError(ok), null);
  assert.deepEqual(ok.calls, [['from', TABLE], ['select', '"movedFrom"'], ['limit', 0]]);

  const missing = probeSupabase({ data: null, error: { code: '42703', message: 'column sales_order_installments.movedFrom does not exist' } });
  assert.equal(await installmentMoveColumnError(missing), INSTALLMENT_MOVE_SCHEMA_MISSING);
  assert.match(INSTALLMENT_MOVE_SCHEMA_MISSING, /0376/);
  assert.match(INSTALLMENT_MOVE_SCHEMA_MISSING, /ย้อนการอนุมัติไม่ได้/);

  const down = probeSupabase({ data: null, error: { code: '08006', message: 'connection reset' } });
  const why = await installmentMoveColumnError(down);
  assert.match(why, /connection reset/);
  assert.doesNotMatch(why, /0376/, 'เน็ตสะดุดห้ามโทษ migration — คนจะไปรันซ้ำผิดเรื่อง');
});

/* ── PR2 · ปรับแผนงวดหลังอนุมัติ (mig 0377) ──────────────────────────────────────────────────────────────
   ⭐ ทางเขียนทางเดียวคือ RPC replan_sales_order_installments — store ห้ามถอยไปเขียนงวดทีละแถวเอง
     (ข้ามด่าน Σ = ยอดใบ · แถวล็อก · ข้อมูลเก่า ที่ RPC ตรวจในทรานแซกชันเดียว)
   ⚠️ supabase ไม่ throw — ตัวนี้ต้องอ่าน `error` เอง แล้วคืนข้อความไทย+สถานะให้ route ตอบ */
const rpcSupabase = (result) => {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => { calls.push([fn, args]); return result; },
    from: () => { throw new Error('ห้ามเขียนตารางงวดตรง — ต้องผ่าน RPC'); },
  };
};
const REPLAN_ARGS = {
  orderId: 'SOR-1',
  rows: [{ id: 'A', seq: 1, label: 'งวดที่ 1', percent: 100, amount: 1000, dueDate: null, coversFrom: null, coversTo: null, note: null }],
  expected: [{ id: 'A', updatedAt: '2026-09-23T03:00:00.123456+00:00' }],
  reason: 'ลูกค้าขอรวมเป็นงวดเดียว',
  user: { id: 'U-SUP', name: 'หัวหน้า', role: 'ae_supervisor' },
};

test('replanInstallments: เรียก RPC 0377 ครั้งเดียวด้วยชุดสุดท้ายทั้งใบ + expected + ผู้กด · คืน before/after', async () => {
  const before = [{ id: 'A', amount: 500 }, { id: 'B', amount: 500 }];
  const after = [{ id: 'A', amount: 1000 }];
  const supabase = rpcSupabase({ data: { before, after, reason: REPLAN_ARGS.reason }, error: null });
  const out = await replanInstallments(supabase, REPLAN_ARGS);
  assert.deepEqual(out, { before, after });
  assert.deepEqual(supabase.calls, [['replan_sales_order_installments', {
    p_order_id: 'SOR-1', p_rows: REPLAN_ARGS.rows, p_expected: REPLAN_ARGS.expected, p_reason: REPLAN_ARGS.reason,
    p_actor_id: 'U-SUP', p_actor_name: 'หัวหน้า', p_actor_role: 'ae_supervisor',
  }]]);
});

test('replanInstallments: ฐานยังไม่มี RPC (PGRST202) = 503 "ยังไม่ได้รัน 0377" · รหัสของ RPC แปลเป็นไทยผ่านตารางกลาง', async () => {
  const missing = await replanInstallments(rpcSupabase({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.replan_sales_order_installments' } }), REPLAN_ARGS);
  assert.deepEqual(missing, { error: INSTALLMENT_REPLAN_SCHEMA_MISSING, status: 503 });
  assert.match(INSTALLMENT_REPLAN_SCHEMA_MISSING, /0377/);

  const stale = await replanInstallments(rpcSupabase({ data: null, error: { code: 'P0001', message: 'workflow_stale' } }), REPLAN_ARGS);
  assert.equal(stale.status, 409);
  assert.match(stale.error, /โหลดใหม่/);
  const locked = await replanInstallments(rpcSupabase({ data: null, error: { code: 'P0001', message: 'installment_replan_locked_changed' } }), REPLAN_ARGS);
  assert.equal(locked.status, 409);
  const closed = await replanInstallments(rpcSupabase({ data: null, error: { code: 'P0001', message: 'installment_replan_finance_closed' } }), REPLAN_ARGS);
  assert.deepEqual(closed, { error: 'บัญชีปิดใบนี้แล้ว — ปรับแผนงวดไม่ได้', status: 409 });
  const sum = await replanInstallments(rpcSupabase({ data: null, error: { code: 'P0001', message: 'installment_replan_sum_mismatch' } }), REPLAN_ARGS);
  assert.equal(sum.status, 400);
});

test('replanInstallments: error ที่ไม่รู้จัก = ข้อความกลาง 500 (ไม่ส่งข้อความดิบของ Postgres ออกหน้าเว็บ)', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const out = await replanInstallments(rpcSupabase({ data: null, error: { code: 'XX000', message: 'relation "x" does not exist' } }), REPLAN_ARGS);
    assert.equal(out.status, 500);
    assert.doesNotMatch(out.error, /relation/);
  } finally {
    console.error = original;
  }
});


/* ══ PR3 · เงินค้างจากใบที่ยกเลิก (mig 0378) ══════════════════════════════════════════════════════════════ */
const CARRY_ARGS = {
  sourceId: 'SOR-C', targetId: 'SOR-N', ids: ['S1', 'S2'],
  rows: [{ id: 'S1', seq: 1, label: 'มัดจำ', percent: 20, amount: 20000, dueDate: null, coversFrom: null, coversTo: null, note: null }],
  expected: [{ id: 'S1', updatedAt: '2026-09-23T03:00:00.123456+00:00' }],
  reason: 'ลูกค้าออกใบใหม่แทนใบที่ยกเลิก',
  user: { id: 'U-FN', name: 'บัญชี', role: 'finance' },
};

test('carryInstallments: เรียก RPC 0378 ครั้งเดียวด้วยใบต้นทาง/ปลายทาง/แถวที่ยก/แผนทั้งใบ/expected/ผู้กด · คืน before/after/carried', async () => {
  const carried = { count: 2, amount: 30000, confirmedCount: 1, reportedCount: 1 };
  const supabase = rpcSupabase({ data: { before: [{ id: 'T1' }], after: [{ id: 'S1' }], carried, reason: CARRY_ARGS.reason }, error: null });
  const out = await carryInstallments(supabase, CARRY_ARGS);
  assert.deepEqual(out, { before: [{ id: 'T1' }], after: [{ id: 'S1' }], carried });
  assert.deepEqual(supabase.calls, [['carry_sales_order_installments', {
    p_source_order_id: 'SOR-C', p_target_order_id: 'SOR-N', p_installment_ids: ['S1', 'S2'],
    p_target_rows: CARRY_ARGS.rows, p_expected: CARRY_ARGS.expected, p_reason: CARRY_ARGS.reason,
    p_actor_id: 'U-FN', p_actor_name: 'บัญชี', p_actor_role: 'finance',
  }]]);
});

test('carryInstallments: ฐานยังไม่มี RPC (PGRST202) = 503 "ยังไม่ได้รัน 0378" · รหัสของ RPC แปลเป็นไทย · error แปลกหน้า = 500 ไม่รั่วข้อความดิบ', async () => {
  assert.deepEqual(await carryInstallments(rpcSupabase({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }), CARRY_ARGS),
    { error: INSTALLMENT_CARRY_SCHEMA_MISSING, status: 503 });
  const cross = await carryInstallments(rpcSupabase({ data: null, error: { code: 'P0001', message: 'installment_carry_cross_deal' } }), CARRY_ARGS);
  assert.deepEqual(cross, { error: 'ยกเงินได้เฉพาะใบของดีลเดียวกัน', status: 409 });
  const over = await carryInstallments(rpcSupabase({ data: null, error: { code: 'P0001', message: 'installment_carry_overpaid' } }), CARRY_ARGS);
  assert.equal(over.status, 400);
  const original = console.error;
  console.error = () => {};
  try {
    const odd = await carryInstallments(rpcSupabase({ data: null, error: { code: 'XX000', message: 'relation "x" does not exist' } }), CARRY_ARGS);
    assert.equal(odd.status, 500);
    assert.doesNotMatch(odd.error, /relation/);
  } finally {
    console.error = original;
  }
});

/* ตัวปลอมของ query builder — จำทุกคำสั่งที่ถูกเรียก แล้วคืนผลตามตาราง (range = หน้าเดียว) */
const queryFake = (resultByTable) => {
  const calls = [];
  const from = (table) => {
    const chain = {
      select: (v) => { calls.push([table, 'select', v]); return chain; },
      filter: (col, op, v) => { calls.push([table, 'filter', col, op, v]); return chain; },
      eq: (col, v) => { calls.push([table, 'eq', col, v]); return chain; },
      neq: (col, v) => { calls.push([table, 'neq', col, v]); return chain; },
      in: (col, v) => { calls.push([table, 'in', col, v]); return chain; },
      order: (col) => { calls.push([table, 'order', col]); return chain; },
      range: async () => resultByTable[table],
      then: (resolve, reject) => Promise.resolve(resultByTable[table]).then(resolve, reject),
    };
    return chain;
  };
  return { calls, from };
};

test('loadMovedOut: ถามด้วย @> ของ movedFrom เป็นสตริง JSON (ไม่ใช่ JS array — supabase-js ต่อเป็นรูป {a,b} ของ Postgres) · แนบเลขใบที่ถืองวดอยู่', async () => {
  const supabase = queryFake({
    sales_order_installments: { data: [
      { id: 'S1', salesOrderId: 'SOR-N', seq: 1, label: 'มัดจำ', amount: '20000', status: 'confirmed',
        movedFrom: [{ salesOrderId: 'SOR-C', reason: 'carry', movedAt: '2026-09-23T03:00:00Z' }] },
    ], error: null },
    sales_orders: { data: [{ id: 'SOR-N', orderNumber: 'SO-26090002-0' }], error: null },
  });
  const out = await loadMovedOut(supabase, 'SOR-C', { reason: 'carry' });
  assert.deepEqual(out, [{
    id: 'S1', salesOrderId: 'SOR-N', orderNumber: 'SO-26090002-0', seq: 1, label: 'มัดจำ', amount: 20000,
    status: 'confirmed', reason: 'carry', movedAt: '2026-09-23T03:00:00Z',
  }]);
  const filter = supabase.calls.find((c) => c[1] === 'filter');
  assert.deepEqual(filter, ['sales_order_installments', 'filter', 'movedFrom', 'cs', '[{"salesOrderId":"SOR-C","reason":"carry"}]']);
  assert.ok(supabase.calls.some((c) => c[0] === 'sales_order_installments' && c[1] === 'order'), 'fetchAll ต้องมีลำดับที่นิ่ง');
  // ไม่ส่ง reason = ทุกการย้าย (ด่านลบถาวร)
  const any = queryFake({ sales_order_installments: { data: [], error: null } });
  assert.deepEqual(await loadMovedOut(any, 'SOR-C'), []);
  assert.equal(any.calls.find((c) => c[1] === 'filter')[4], '[{"salesOrderId":"SOR-C"}]');
  // อ่านพลาด = โยน (ด่านกู้คืน/ลบถาวรต้องหยุด ไม่ใช่ถือว่าไม่มี)
  const down = queryFake({ sales_order_installments: { data: null, error: { message: 'boom' } } });
  await assert.rejects(() => loadMovedOut(down, 'SOR-C'), { message: 'boom' });
});

test('loadCarrySources: ใบยกเลิก pipeline ของดีลเดียวกัน (ไม่รวมใบนี้) + งวดที่มีเงินของใบเหล่านั้น → ต้นทางที่มีเงินค้าง', async () => {
  const supabase = queryFake({
    sales_orders: { data: [{ id: 'SOR-C', orderNumber: 'SO-C', status: 'cancelled', origin: 'pipeline', dealId: 'D1', totalAmount: 80000 }], error: null },
    sales_order_installments: { data: [
      { id: 'S1', salesOrderId: 'SOR-C', seq: 1, status: 'confirmed', amount: 20000 },
      { id: 'S3', salesOrderId: 'SOR-C', seq: 3, status: 'confirmed', amount: 5000, refundedAt: '2026-09-21T00:00:00Z' },
    ], error: null },
  });
  const sources = await loadCarrySources(supabase, { id: 'SOR-N', dealId: 'D1' });
  assert.equal(sources.length, 1);
  assert.deepEqual(sources[0].rows.map((r) => r.id), ['S1'], 'คืนเงินแล้วไม่ใช่เงินค้าง');
  const orderQuery = supabase.calls.filter((c) => c[0] === 'sales_orders');
  assert.ok(orderQuery.some((c) => c[1] === 'eq' && c[2] === 'dealId' && c[3] === 'D1'));
  assert.ok(orderQuery.some((c) => c[1] === 'eq' && c[2] === 'status' && c[3] === 'cancelled'));
  assert.ok(orderQuery.some((c) => c[1] === 'eq' && c[2] === 'origin' && c[3] === 'pipeline'));
  assert.ok(orderQuery.some((c) => c[1] === 'neq' && c[2] === 'id' && c[3] === 'SOR-N'));
  // งวดอ่านด้วย select('*') — ก่อนรัน 0378 ไม่มีคอลัมน์คืนเงิน ห้ามเอ่ยชื่อ (อ่านพัง = ปุ่มหายทั้งระบบ)
  const rowSelect = supabase.calls.find((c) => c[0] === 'sales_order_installments' && c[1] === 'select');
  assert.equal(rowSelect[2], '*');
  assert.ok(!supabase.calls.some((c) => String(c[2]).includes('refund')));
  assert.deepEqual(await loadCarrySources(queryFake({}), { id: 'X', dealId: null }), [], 'ใบไม่มีดีล = ไม่มีต้นทาง (ไม่ยิง query)');
});

test('installmentRefundSchemaError: ฐานยังไม่มีคอลัมน์คืนเงิน (PGRST204/42703) = 503 ให้รัน 0378 · อย่างอื่นไม่โทษ migration', () => {
  assert.equal(installmentRefundSchemaError({ code: 'PGRST204', message: "Could not find the 'refundedAt' column" }), INSTALLMENT_REFUND_SCHEMA_MISSING);
  assert.equal(installmentRefundSchemaError({ code: '42703', message: 'column "refundedAt" does not exist' }), INSTALLMENT_REFUND_SCHEMA_MISSING);
  assert.equal(installmentRefundSchemaError({ code: '08006', message: 'connection reset' }), null);
  assert.equal(installmentRefundSchemaError(null), null);
  assert.match(INSTALLMENT_REFUND_SCHEMA_MISSING, /0378/);
});


/* 🐞 review MONEY-1: ดีลมีเงินค้างจากใบที่ยกเลิก — สลิปของเอกสารยืนยันคำสั่งซื้อมักเป็นมัดจำก้อนเดียวกับเงินค้าง
   ⇒ อนุมัติแล้วยืมมาตั้งงวดแรก (reported) + ยกเงินค้างเข้ามาอีกแถว = เงินก้อนเดียวนับสองครั้ง
   ⭐ `borrowConfirmation: false` (route ส่งเมื่อดีลมีเงินค้าง/อ่านไม่ขึ้น) — งวดแรกคง pending ให้คนตัดสินเอง (แจ้งเงินใหม่ หรือยกเงินค้าง)
   ⚠️ เงินที่ฝ่ายขายบันทึกไว้เองตอนร่าง (prepaid) ยังเข้าคิวบัญชีตามเดิม — ไม่ใช่การยืม (ด่านยกซ้ำกันอีกชั้น) */
test('🔴 อนุมัติใบ (จำนวนตรงแผน) + borrowConfirmation:false: ไม่ยืมสลิปจากเอกสารยืนยันคำสั่งซื้อ — งวดแรกคง pending', async () => {
  const db = fakeDb([draftRow(), draftRow({ id: 'SOI-2', seq: 2, label: 'ก่อนส่งของ' })]);
  await freezeInstallments(db, { order: slipOrder(), user, now: '2026-09-23T03:00:00.000Z', borrowConfirmation: false });
  const [first, second] = db.rows();
  assert.equal(first.status, 'pending');
  assert.equal(first.paidOn ?? null, null);
  assert.deepEqual(first.evidence, []);
  assert.ok([first, second].every((r) => r.frozenAt === '2026-09-23T03:00:00.000Z'), 'ยังตรึงยอดตามปกติ');
  // ค่าตั้งต้น = ยืมตามเดิม (มติผู้ใช้ 2026-08-13)
  const plain = fakeDb([draftRow(), draftRow({ id: 'SOI-2', seq: 2, label: 'ก่อนส่งของ' })]);
  await freezeInstallments(plain, { order: slipOrder(), user, now: '2026-09-23T03:00:00.000Z' });
  assert.equal(plain.rows()[0].status, 'reported');
});

test('🔴 อนุมัติใบที่ยังไม่มีงวด + borrowConfirmation:false: สร้างงวดแรกเป็น pending (ไม่ยืมสลิป)', async () => {
  const supabase = fakeSupabase([]);
  await freezeInstallments(supabase, { order: slipOrder(), user, now: '2026-09-23T03:00:00.000Z', borrowConfirmation: false });
  assert.ok(supabase.calls.inserted?.length, 'ต้องสร้างงวดตามแผน');
  assert.ok(supabase.calls.inserted.every((r) => r.status === 'pending' && !r.paidOn && !(r.evidence || []).length));
  assert.ok(supabase.calls.inserted.every((r) => r.frozenAt === '2026-09-23T03:00:00.000Z'));
});

test('อนุมัติใบ + borrowConfirmation:false: เงินที่ฝ่ายขายบันทึกไว้เองตอนร่าง ยังเข้าคิวบัญชีตามเดิม (ไม่ใช่การยืม)', async () => {
  const db = fakeDb([
    draftRow({ paidOn: '2026-08-18', evidence: [{ name: 'slip.pdf' }], reportedAt: '2026-08-18T04:00:00.000Z' }),
    draftRow({ id: 'SOI-2', seq: 2, label: 'ก่อนส่งของ' }),
  ]);
  await freezeInstallments(db, { order: slipOrder(), user, now: '2026-09-23T03:00:00.000Z', borrowConfirmation: false });
  assert.equal(db.rows()[0].status, 'reported');
  assert.deepEqual(db.rows()[0].evidence, [{ name: 'slip.pdf' }]);
});


/* review qt-force-delete-bypasses-movedout: ลบใบเสนอราคา = ลบใบสั่งขายลูกทุกใบ ⇒ ถามงวดที่ย้ายออกของทุกใบลูก
   ⭐ งวดที่ใบลูกอีกใบถืออยู่ (สายโซ่ Rev. ของใบเสนอราคาเดียวกัน) หายไปพร้อมกันอยู่แล้ว — ไม่นับ (ไม่งั้นลบใบที่มี Rev. ไม่ได้ตลอดกาล) */
test('loadMovedOutOfOrders: งวดที่ย้ายไปจากใบชุดนี้ และยังอยู่กับใบนอกชุด (ไม่ซ้ำแถว) · อ่านพลาด = โยน', async () => {
  const supabase = queryFake({
    sales_order_installments: { data: [
      { id: 'R1', salesOrderId: 'SOR-A1', seq: 1, amount: 1, status: 'confirmed', movedFrom: [{ salesOrderId: 'SOR-A', reason: 'revision' }] },
      { id: 'C1', salesOrderId: 'SOR-B', seq: 1, amount: 2, status: 'confirmed', movedFrom: [{ salesOrderId: 'SOR-A1', reason: 'carry' }] },
    ], error: null },
    sales_orders: { data: [{ id: 'SOR-B', orderNumber: 'SO-B' }, { id: 'SOR-A1', orderNumber: 'SO-A-1' }], error: null },
  });
  const out = await loadMovedOutOfOrders(supabase, ['SOR-A', 'SOR-A1']);
  assert.deepEqual(out.map((m) => [m.id, m.salesOrderId, m.orderNumber]), [['C1', 'SOR-B', 'SO-B']]);
  assert.deepEqual(await loadMovedOutOfOrders(queryFake({}), []), [], 'ไม่มีใบลูก = ไม่ยิง query');
  const down = queryFake({ sales_order_installments: { data: null, error: { message: 'boom' } } });
  await assert.rejects(() => loadMovedOutOfOrders(down, ['SOR-A']), { message: 'boom' });
});
