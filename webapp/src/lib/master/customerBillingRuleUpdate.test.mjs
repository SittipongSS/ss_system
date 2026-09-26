// แถว "ความเคลื่อนไหว" ของลูกค้าเมื่อเครดิต/รอบวางบิลเปลี่ยน (มติเจ้าของ 26/09 ข้อ 7 · รุ่นสอง mig 0390)
// ⭐ สิ่งที่ต้องไม่หลุด: เดิม → ใหม่ ต้องอ่านออกทุกทาง (ตั้ง · แก้ · ล้าง · แก้แค่หมายเหตุ · ไม่มีเครดิต · หลายรอบ)
//    และชนิดนี้ **ไม่เด้งกระดิ่ง** · ค่าเดิมรูปรุ่นแรก (0389) เทียบกับรุ่นสองได้ ไม่ขึ้นแถวปลอม
import test from 'node:test';
import assert from 'node:assert/strict';
import { billingRuleChangeUpdate, logBillingRuleActivity } from './customerBillingRuleUpdate.js';
import {
  isAuthorableKind, isKnownUpdateKind, isNarrativeUpdateItem, isQuietUpdateKind, isSystemUpdateItem, updateKindMeta,
} from './updateTypes.js';
import { notifyThreadUpdate } from '../notifications.js';

const MONTHLY = { billing: { mode: 'monthly', days: [5] }, payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }] } };
const CREDIT = { billing: { mode: 'monthly', days: [31] }, payment: { mode: 'credit', days: 30 } };
const NO_CREDIT = { credit: false };
const TWO_ROUNDS = {
  billing: { mode: 'monthly', days: [10, 25] },
  payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }, { day: 10, monthOffset: 1 }] },
};

test('ตั้งครั้งแรก = ขีด → ประโยคของรอบ · meta เก็บรูปรุ่นสอง', () => {
  const got = billingRuleChangeUpdate(null, MONTHLY);
  assert.equal(got.body, 'ตั้งเครดิตและรอบวางบิล: — → วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25');
  assert.equal(got.meta.action, 'set');
  assert.equal(got.meta.billingRuleBefore, null);
  assert.deepEqual(got.meta.billingRuleAfter.billing, { mode: 'monthly', days: [5] });
});

test('แก้ = ประโยคเดิม → ประโยคใหม่ (ประโยคเดียวกับการ์ด/ใบสั่งขาย)', () => {
  const got = billingRuleChangeUpdate(MONTHLY, CREDIT);
  assert.equal(got.body, 'แก้เครดิตและรอบวางบิล: วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25 → วางบิลสิ้นเดือน · เครดิต 30 วัน');
  assert.equal(got.meta.action, 'change');
});

test('⭐ สวิตช์เครดิต: ไม่มีเครดิต ↔ มีเครดิต อ่านออกในเธรด', () => {
  assert.equal(billingRuleChangeUpdate(null, NO_CREDIT).body, 'ตั้งเครดิตและรอบวางบิล: — → ไม่มีเครดิต');
  assert.equal(billingRuleChangeUpdate(NO_CREDIT, CREDIT).body, 'แก้เครดิตและรอบวางบิล: ไม่มีเครดิต → วางบิลสิ้นเดือน · เครดิต 30 วัน');
  assert.deepEqual(billingRuleChangeUpdate(null, NO_CREDIT).meta.billingRuleAfter, { credit: false });
});

/* ⭐ ประโยคหลายรอบมี → ในตัวเอง — ต่อด้วย "เดิม → ใหม่" บรรทัดเดียว = ลูกศรห้าตัว แยกไม่ออกว่าเดิมจบตรงไหน
      ⇒ ฝั่งไหนมีลูกศรในประโยค เขียนเป็นหัว / เดิม: / ใหม่: (บรรทัดละค่า) */
const oldNew = (body) => {
  const [head, ...rest] = body.split('\n');
  const pick = (label) => rest.find((line) => line.startsWith(`${label}: `))?.slice(label.length + 2);
  return { head, old: pick('เดิม'), new: pick('ใหม่') };
};

test('⭐ หลายรอบต่อเดือน — เงินเข้าคนละวัน/เดือน บอกเป็นคู่ทีละรอบ · เดิม/ใหม่ อยู่คนละบรรทัด', () => {
  const got = billingRuleChangeUpdate(MONTHLY, TWO_ROUNDS);
  assert.equal(got.body, [
    'แก้เครดิตและรอบวางบิล',
    'เดิม: วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25',
    'ใหม่: วางบิล 10 → เงินเข้า 25 · วางบิล 25 → เงินเข้า 10 เดือนถัดไป',
  ].join('\n'));
});

test('⭐ หลายรอบ → หลายรอบ: ขอบเดิม/ใหม่ต้องเห็น แม้ทั้งสองฝั่งมีลูกศร (ข้อที่ reviewer จับได้)', () => {
  const after = {
    billing: { mode: 'monthly', days: [10, 25] },
    payment: { mode: 'monthly', rounds: [{ day: 31, monthOffset: 0 }, { day: 10, monthOffset: 1 }] },
  };
  const got = oldNew(billingRuleChangeUpdate(TWO_ROUNDS, after).body);
  assert.equal(got.head, 'แก้เครดิตและรอบวางบิล', 'หัวบรรทัดต้องไม่มีค่าใด ๆ ต่อท้าย');
  assert.equal(got.old, 'วางบิล 10 → เงินเข้า 25 · วางบิล 25 → เงินเข้า 10 เดือนถัดไป');
  assert.equal(got.new, 'วางบิล 10 → เงินเข้า สิ้นเดือน · วางบิล 25 → เงินเข้า 10 เดือนถัดไป');
});

test('⭐ หลายรอบ → ไม่มีเครดิต / ล้าง: ค่าเดิมยังอ่านได้ทั้งประโยค (ค่าเดียวที่ฝ่ายขายย้อนดูได้)', () => {
  const toNone = oldNew(billingRuleChangeUpdate(TWO_ROUNDS, NO_CREDIT).body);
  assert.deepEqual(toNone, {
    head: 'แก้เครดิตและรอบวางบิล',
    old: 'วางบิล 10 → เงินเข้า 25 · วางบิล 25 → เงินเข้า 10 เดือนถัดไป',
    new: 'ไม่มีเครดิต',
  });
  const cleared = oldNew(billingRuleChangeUpdate(TWO_ROUNDS, null).body);
  assert.deepEqual(cleared, {
    head: 'ล้างเครดิตและรอบวางบิล',
    old: 'วางบิล 10 → เงินเข้า 25 · วางบิล 25 → เงินเข้า 10 เดือนถัดไป',
    new: '—',
  });
});

test('รอบเดียวทั้งสองฝั่ง (ไม่มีลูกศรในประโยค) ยังเป็นบรรทัดเดียว "เดิม → ใหม่" แบบเดิม', () => {
  assert.equal(billingRuleChangeUpdate(MONTHLY, NO_CREDIT).body, 'แก้เครดิตและรอบวางบิล: วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25 → ไม่มีเครดิต');
});

test('⭐ ค่าเดิมรูปรุ่นแรก (0389) = รุ่นสองตัวเดียวกัน ⇒ ไม่มีอะไรเปลี่ยน (เปิดโมดัลแล้วกดบันทึกเฉย ๆ ต้องไม่ขึ้นแถว)', () => {
  const v1 = { billing: { mode: 'monthly', day: 5 }, payment: { mode: 'monthly', day: 25, monthOffset: 0 } };
  assert.equal(billingRuleChangeUpdate(v1, MONTHLY), null);
});

test('⭐ ล้างรอบ = รอบเดิมยังอ่านได้ในเธรด (ป้ายยืนยันการล้างสัญญาไว้แบบนั้น) — รวมหมายเหตุที่หายไปด้วย', () => {
  const got = billingRuleChangeUpdate({ ...MONTHLY, note: 'แนบสำเนา PO\nวางบิลชั้น 3' }, null);
  assert.equal(got.body, [
    'ล้างเครดิตและรอบวางบิล: วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25 → —',
    'หมายเหตุ: แนบสำเนา PO วางบิลชั้น 3 → —',
  ].join('\n'));
  assert.equal(got.meta.action, 'clear');
  assert.equal(got.meta.billingRuleAfter, null);
});

test('แก้แค่หมายเหตุ ไม่ขึ้น "X → X" ที่อ่านไม่ออกว่าอะไรเปลี่ยน', () => {
  const got = billingRuleChangeUpdate({ ...MONTHLY, note: 'เดิม' }, { ...MONTHLY, note: 'ใหม่' });
  assert.equal(got.body, [
    'แก้หมายเหตุการวางบิล · ค่าอื่นคงเดิม: วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25',
    'หมายเหตุ: เดิม → ใหม่',
  ].join('\n'));
});

test('ไม่มีอะไรเปลี่ยน = null (route ตอบ unchanged ก่อนถึงตรงนี้อยู่แล้ว — กันอีกชั้น) · ค่าดิบพังอ่านเป็น "ไม่ตั้ง"', () => {
  assert.equal(billingRuleChangeUpdate(MONTHLY, { ...MONTHLY }), null);
  assert.equal(billingRuleChangeUpdate(null, null), null);
  assert.equal(billingRuleChangeUpdate({ billing: 'garbage' }, null), null);
  assert.equal(billingRuleChangeUpdate({ billing: 'garbage' }, MONTHLY).meta.action, 'set');
});

test('ชนิด billing_rule: ลงทะเบียนเฉพาะลูกค้า · ระบบเขียนเท่านั้น · เป็น log ไม่ใช่บทสนทนา', () => {
  assert.equal(isKnownUpdateKind('customer', 'billing_rule'), true);
  assert.equal(updateKindMeta('customer', 'billing_rule').label, 'รอบวางบิล');
  assert.equal(isAuthorableKind('customer', 'billing_rule'), false, 'ปล่อยให้คนเลือกชนิดนี้เอง = ปลอมประวัติรอบได้');
  const item = { kind: 'own', row: { kind: 'billing_rule' } };
  assert.equal(isSystemUpdateItem('customer', item), true);
  assert.equal(isNarrativeUpdateItem('customer', item), false);
  // สินค้าไม่มีรอบวางบิล — ชุดที่ต้องเหมือนลูกค้าเป๊ะคือด่านอนุมัติเท่านั้น
  assert.equal(isKnownUpdateKind('product', 'billing_rule'), false);
});

test('⭐ quiet — ลงเธรดแต่ไม่แตะตาราง notifications (มติเจ้าของ: ไม่เด้งผู้ติดตามเธรด)', async () => {
  assert.equal(isQuietUpdateKind('customer', 'billing_rule'), true);
  let wrote = false;
  const supabase = {
    from: () => ({
      select: () => ({ eq: function () { return this; }, then: (r) => Promise.resolve({ data: [], error: null }).then(r) }),
      upsert: async () => { wrote = true; return { error: null }; },
      insert: async () => { wrote = true; return { error: null }; },
    }),
  };
  const got = await notifyThreadUpdate(supabase, {
    entityType: 'customer',
    entityId: 'CUS-1',
    parent: { id: 'CUS-1', teams: ['KA'] },
    update: { id: 'EUP-1', kind: 'billing_rule', body: 'แก้รอบวางบิล: … → …' },
    actor: { id: 'u-fn', name: 'บัญชี' },
  });
  assert.deepEqual(got, { sent: 0, quiet: true });
  assert.equal(wrote, false);
});

/* ── logBillingRuleActivity: สัญญา "ลงเธรดไม่สำเร็จ ≠ บันทึกไม่สำเร็จ" ด้วยพฤติกรรม ─────────────────────────
   ⭐ ใช้ appendUpdate ตัวจริง + supabase ปลอม — ใครเติมทางออกเป็น error/throw ในตัวช่วยหรือใน appendUpdate แดงที่นี่
      (ยามในเทสต์ของ route อ่านซอร์สได้แค่รูปการสะกดเดียว) */
const USER = { id: 'u-fn', name: 'บัญชี ทดสอบ', department: 'FN' };

/* supabase ปลอม: จดทุกตารางที่ถูกแตะ · `insertResult` กำหนดผลของ insert ลง entity_updates */
function fakeSupabase({ insertResult, parent = { id: 'CUS-1', teams: ['KA'] } } = {}) {
  const touched = [];
  const inserted = [];
  const client = {
    touched,
    inserted,
    from(table) {
      touched.push(table);
      if (table === 'entity_updates') {
        return {
          insert: (row) => {
            inserted.push(row);
            return { select: () => ({ single: async () => insertResult ?? { data: row, error: null } }) };
          },
        };
      }
      if (table === 'customers') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: parent, error: null }) }) }) };
      }
      throw new Error(`ไม่ควรแตะตาราง ${table}`);
    },
  };
  return client;
}

test('⭐ ลงสำเร็จ = true · แถวเป็น customer.billing_rule ผูกผู้กด · ไม่แตะ notifications (quiet)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const supabase = fakeSupabase();
  const got = await logBillingRuleActivity(supabase, { customerId: 'CUS-1', before: MONTHLY, after: null, user: USER });
  assert.equal(got, true);
  assert.equal(supabase.inserted.length, 1);
  const row = supabase.inserted[0];
  assert.equal(row.entityType, 'customer');
  assert.equal(row.entityId, 'CUS-1');
  assert.equal(row.kind, 'billing_rule');
  assert.equal(row.body, 'ล้างเครดิตและรอบวางบิล: วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25 → —');
  assert.equal(row.meta.action, 'clear');
  assert.equal(row.authorId, 'u-fn');
  assert.equal(row.authorName, 'บัญชี ทดสอบ');
  assert.equal(supabase.touched.includes('notifications'), false, 'quiet ต้องไม่เขียน/อ่านกระดิ่ง');
  assert.equal(console.error.mock.callCount(), 0);
});

test('⭐ insert คืน error = false + log · ไม่ throw (route ตอบ 200 activityLogged:false)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const supabase = fakeSupabase({ insertResult: { data: null, error: { message: 'relation "entity_updates" does not exist' } } });
  const got = await logBillingRuleActivity(supabase, { customerId: 'CUS-1', before: null, after: MONTHLY, user: USER });
  assert.equal(got, false);
  assert.ok(console.error.mock.calls.some((c) => String(c.arguments[0]).includes('[billing-rule]')), 'ต้อง log ไว้ไล่ทีหลัง');
});

test('⭐ supabase throw (ก่อนถึง insert) = false + log · ไม่ throw ต่อ', async (t) => {
  t.mock.method(console, 'error', () => {});
  const supabase = { from() { throw new Error('client down'); } };
  const got = await logBillingRuleActivity(supabase, { customerId: 'CUS-1', before: MONTHLY, after: CREDIT, user: USER });
  assert.equal(got, false);
  assert.ok(console.error.mock.calls.some((c) => c.arguments.includes('client down')));
});

test('ไม่มีอะไรเปลี่ยน = false โดยไม่แตะฐาน (route ตอบ unchanged ก่อนถึงตรงนี้อยู่แล้ว)', async () => {
  const supabase = fakeSupabase();
  assert.equal(await logBillingRuleActivity(supabase, { customerId: 'CUS-1', before: MONTHLY, after: { ...MONTHLY }, user: USER }), false);
  assert.deepEqual(supabase.touched, []);
});
