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
        /* `eq` ต้องเป็นได้ทั้ง **await ตรง ๆ** (ของเดิม) และ **ต่อ .select().maybeSingle()**
           (ทางที่ freeze ใช้ตอนเขียนค่าที่อุ้มไว้กลับ) ⇒ คืน thenable ที่มี select ด้วย */
        update: (patch) => ({
          eq: (_col, id) => {
            const apply = () => {
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
