// แถว "ความเคลื่อนไหว" ของลูกค้าเมื่อเครดิต/รอบวางบิลเปลี่ยน (มติเจ้าของ 26/09 ข้อ 7 · รุ่นสอง mig 0390)
// ⭐ สิ่งที่ต้องไม่หลุด: เดิม → ใหม่ ต้องอ่านออกทุกทาง (ตั้ง · แก้ · ล้าง · แก้แค่หมายเหตุ · ไม่มีเครดิต · หลายรอบ)
//    และชนิดนี้ **ไม่เด้งกระดิ่ง** · ค่าเดิมรูปรุ่นแรก (0389) เทียบกับรุ่นสองได้ ไม่ขึ้นแถวปลอม
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  billingRuleChangeUpdate, calendarChangeLines, calendarFileIdsToCheck, checkCalendarFiles, logBillingRuleActivity,
} from './customerBillingRuleUpdate.js';
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

test('⭐ สวิตช์เครดิต: ไม่มีเครดิต ↔ มีเครดิต อ่านออกในเธรด (ไม่มีเครดิต = "ไม่มีเครดิต · ชำระวันวางบิล" · มติ 28/09)', () => {
  assert.equal(billingRuleChangeUpdate(null, NO_CREDIT).body, 'ตั้งเครดิตและรอบวางบิล: — → ไม่มีเครดิต · ชำระวันวางบิล');
  assert.equal(billingRuleChangeUpdate(NO_CREDIT, CREDIT).body, 'แก้เครดิตและรอบวางบิล: ไม่มีเครดิต · ชำระวันวางบิล → วางบิลสิ้นเดือน · เครดิต 30 วัน');
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
    new: 'ไม่มีเครดิต · ชำระวันวางบิล',
  });
  const cleared = oldNew(billingRuleChangeUpdate(TWO_ROUNDS, null).body);
  assert.deepEqual(cleared, {
    head: 'ล้างเครดิตและรอบวางบิล',
    old: 'วางบิล 10 → เงินเข้า 25 · วางบิล 25 → เงินเข้า 10 เดือนถัดไป',
    new: '—',
  });
});

test('รอบเดียวทั้งสองฝั่ง (ไม่มีลูกศรในประโยค) ยังเป็นบรรทัดเดียว "เดิม → ใหม่" แบบเดิม', () => {
  assert.equal(billingRuleChangeUpdate(MONTHLY, NO_CREDIT).body, 'แก้เครดิตและรอบวางบิล: วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25 → ไม่มีเครดิต · ชำระวันวางบิล');
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

/* ── รุ่นสี่ "ต้องวางบิลไหม" (mig 0393) — ค่าใหม่เป็นรุ่นสี่เสมอ · ค่าเดิมเป็นรูปไหนก็ได้ ─────────────────────────────── */
const NONE = { v: 4, need: 'none' };
const NO_TIMING = { v: 4, need: 'required', billing: null };
test('⭐ รุ่นสี่: ตอบ "ต้องวางบิลไหม" อ่านออกในเธรด (หัว "กำหนดวางบิล") · ค่าเดิมรูปเก่าพูดแบบเดิม · meta เก็บรูปมาตรฐานของรุ่นตัวเอง', () => {
  const first = billingRuleChangeUpdate(null, NONE);
  assert.equal(first.body, 'ตั้งกำหนดวางบิล: — → ไม่ต้องวางบิล');
  assert.deepEqual(first.meta.billingRuleAfter, { v: 4, need: 'none' });
  assert.equal(billingRuleChangeUpdate(NO_CREDIT, NONE).body, 'แก้กำหนดวางบิล: ไม่มีเครดิต · ชำระวันวางบิล → ไม่ต้องวางบิล',
    'รูปเดิม { credit:false } ≠ รุ่นสี่ — ตอบคำถามแล้วต้องขึ้นแถวเสมอ');
  assert.equal(billingRuleChangeUpdate(NONE, NO_TIMING).body, 'แก้กำหนดวางบิล: ไม่ต้องวางบิล → ต้องวางบิล · ยังไม่ตั้งรอบ');
  assert.equal(billingRuleChangeUpdate(NONE, null).body, 'ล้างกำหนดวางบิล: ไม่ต้องวางบิล → —');
  assert.deepEqual(billingRuleChangeUpdate(MONTHLY, NONE).meta.billingRuleBefore.billing, { mode: 'monthly', days: [5] },
    'ค่าเดิมรุ่นสองเก็บรูปรุ่นสองตามเดิม (ย้อนอ่านด้วยเครื่องได้)');
});

test('⭐ รุ่นสี่: ความหมายเท่ากับค่าเดิมรุ่นสอง = ไม่ขึ้นแถว · แก้แค่หมายเหตุ = บรรทัดหมายเหตุ (ตัวอ่านรุ่นเดิมเห็นรุ่นสี่เป็น null — ห้ามกลับไปใช้)', () => {
  const credit30 = { v: 4, need: 'required', billing: { mode: 'monthly', days: [31] }, creditDays: 30, runs: null };
  assert.equal(billingRuleChangeUpdate(CREDIT, credit30), null);
  const got = billingRuleChangeUpdate({ ...NONE, note: 'โอนก่อนทุกงวด' }, { ...NONE, note: 'โอนก่อน · ส่งสลิปทางไลน์' });
  assert.equal(got.body, ['แก้หมายเหตุการวางบิล · ค่าอื่นคงเดิม: ไม่ต้องวางบิล', 'หมายเหตุ: โอนก่อนทุกงวด → โอนก่อน · ส่งสลิปทางไลน์'].join('\n'));
  assert.equal(got.meta.action, 'change');
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

/* ── รุ่นห้า: ปฏิทินรายปีของลูกค้า (มติ 29/09 · contracts v5 §6) ─────────────────────────────────────────────── */
const d26 = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const RUNS_2026 = Array.from({ length: 12 }, (_, i) => [{ cutoff: d26(i + 1, 8), pay: d26(i + 1, 15) }, { cutoff: d26(i + 1, 21), pay: d26(i + 1, i === 1 ? 27 : 30) }]).flat();
const FILE_A = '6f1c2d3e-4a5b-4c6d-8e7f-901234567890';
const FILE_B = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const cal = ({ credit = 0, runs = RUNS_2026, fileId = '', cutoffTime = '16:00', extra = {} } = {}) => ({
  v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: credit,
  runs: { kind: 'calendar', years: { 2026: { runs, ...(fileId ? { fileId } : {}) }, ...extra }, ...(cutoffTime ? { cutoffTime } : {}) },
});

test('⭐ ปฏิทิน: แก้วันเดียว = ประโยคกติกาเท่าเดิม ⇒ หัว "แก้ปฏิทินวางบิล" + บรรทัดสรุปการแก้ (ตัวเดียวกับ audit)', () => {
  const moved = RUNS_2026.map((r) => (r.cutoff === '2026-10-21' ? { ...r, cutoff: '2026-10-22' } : r));
  const got = billingRuleChangeUpdate(cal(), cal({ runs: moved }));
  const lines = got.body.split('\n');
  assert.match(lines[0], /^แก้ปฏิทินวางบิล · ตามปฏิทินลูกค้า ปี 2026 \(24 รอบ\)/);
  assert.equal(lines[1], 'ปฏิทิน 2026: แก้ 1 รอบ — ต.ค. รอบ 2: ตัด พ. 21 ต.ค. → พฤ. 22 ต.ค.');
  assert.deepEqual(calendarChangeLines(cal(), cal({ runs: moved })), [lines[1]]);
  assert.equal(got.meta.action, 'change');
  /* แก้วัน + หมายเหตุพร้อมกัน — หัวบรรทัดยังเป็น "แก้ปฏิทินวางบิล" ห้ามขึ้น "ค่าอื่นคงเดิม" */
  const both = billingRuleChangeUpdate(cal(), { ...cal({ runs: moved }), note: 'แนบ PO ทุกครั้ง' }).body.split('\n');
  assert.match(both[0], /^แก้ปฏิทินวางบิล · /);
  assert.doesNotMatch(both.join('\n'), /ค่าอื่นคงเดิม/);
  assert.deepEqual(both.slice(1), ['หมายเหตุ: — → แนบ PO ทุกครั้ง', 'ปฏิทิน 2026: แก้ 1 รอบ — ต.ค. รอบ 2: ตัด พ. 21 ต.ค. → พฤ. 22 ต.ค.']);
});

test('⭐ ปฏิทิน: แนบรูป · ใส่ปีหน้า · เวลาตัดรอบ — อ่านออกในเธรดทุกแบบ (ไม่ขึ้น "X → X")', () => {
  assert.deepEqual(calendarChangeLines(cal(), cal({ fileId: FILE_A })), ['แนบรูปปฏิทิน 2026']);
  const pic = billingRuleChangeUpdate(cal(), cal({ fileId: FILE_A })).body.split('\n');
  assert.deepEqual([pic[0].startsWith('แก้ปฏิทินวางบิล'), pic[1]], [true, 'แนบรูปปฏิทิน 2026']);
  const next = RUNS_2026.map((r) => ({ cutoff: r.cutoff.replace('2026', '2027'), pay: r.pay.replace('2026', '2027') }));
  const year = billingRuleChangeUpdate(cal(), cal({ extra: { 2027: { runs: next } } })).body;
  assert.match(year, /เพิ่มปฏิทิน 2027 \(24 รอบ\)$/);
  const time = billingRuleChangeUpdate(cal(), cal({ cutoffTime: null })).body;
  assert.match(time, /\nเวลาตัดรอบ 16:00 → —$/);
  assert.equal(billingRuleChangeUpdate(cal(), cal()), null, 'ไม่เปลี่ยน = ไม่มีแถว');
  assert.deepEqual(calendarChangeLines({ v: 4, need: 'none' }, cal()), [], 'ฝั่งเดียวเป็นปฏิทิน = ประโยคกติกาบอกอยู่แล้ว');
  assert.deepEqual(calendarChangeLines('พัง', { x: 1 }), []);
});

test('⭐ รูปปฏิทิน: ตรวจเฉพาะ fileId ที่เพิ่งผูก · ต้องเป็นไฟล์แนบของลูกค้ารายนี้ · อ่านพลาด = 503 ไม่ผ่านเงียบ', async () => {
  assert.deepEqual(calendarFileIdsToCheck(cal({ fileId: FILE_A }), cal({ fileId: FILE_A })), [], 'รูปเดิม (อาจถูกลบไปแล้ว) ไม่ขวางการแก้');
  assert.deepEqual(calendarFileIdsToCheck(cal(), cal({ fileId: FILE_B })), [{ year: '2026', fileId: FILE_B }]);
  assert.deepEqual(calendarFileIdsToCheck(null, { v: 4, need: 'none' }), []);

  const calls = [];
  const fake = (result) => ({
    from(table) {
      const q = {
        select: () => q,
        eq: (col, val) => { calls.push(['eq', table, col, val]); return q; },
        in: (col, vals) => { calls.push(['in', table, col, vals]); return q; },
        limit: (n) => { calls.push(['limit', table, n]); return Promise.resolve(result); },
      };
      return q;
    },
  });
  assert.equal(await checkCalendarFiles(fake({ data: [] }), 'CUS-1', []), null, 'ไม่มีอะไรต้องตรวจ = ไม่แตะฐาน');
  assert.equal(calls.length, 0);
  assert.equal(await checkCalendarFiles(fake({ data: [{ id: FILE_B }], error: null }), 'CUS-1', [{ year: '2026', fileId: FILE_B }]), null);
  assert.deepEqual(calls.map((c) => c.slice(0, 3)), [['eq', 'attachments', 'entityType'], ['eq', 'attachments', 'entityId'], ['in', 'attachments', 'id'], ['limit', 'attachments', 1]]);
  assert.equal(calls[1][3], 'CUS-1');
  const other = await checkCalendarFiles(fake({ data: [], error: null }), 'CUS-1', [{ year: '2026', fileId: FILE_B }]);
  assert.equal(other.status, 400);
  assert.match(other.error, /ไม่ใช่ไฟล์ของลูกค้ารายนี้/);
  const down = await checkCalendarFiles(fake({ data: null, error: { message: 'boom' } }), 'CUS-1', [{ year: '2026', fileId: FILE_B }]);
  assert.equal(down.status, 503);
  const junk = await checkCalendarFiles(fake({ data: [] }), 'CUS-1', [{ year: '2026', fileId: 'not-a-uuid' }]);
  assert.equal(junk.status, 400, 'id ที่ไม่ใช่ uuid ตีกลับก่อนถึงฐาน (ไม่ให้ฐานตอบ 22P02 เป็น 500)');
});
