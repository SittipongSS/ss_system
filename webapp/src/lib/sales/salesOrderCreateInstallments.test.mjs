// ── วันของงวดจากหน้าสร้างใบสั่งขาย (กำหนดชำระ + วันวางบิล + ติ๊กไม่ต้องวางบิล · mig 0389 · 0393) — logic ล้วน ──
//
// สิ่งที่ชุดนี้ล็อกไว้: งวดที่ไม่ตั้งไม่ถูกส่ง (ไม่บังคับ · มติ 26/09 ข้อ 2) · server ตีกลับค่าผิดก่อนออกเลขใบ ไม่ข้ามเงียบ ·
// ไม่มีวันวางบิลคู่เหตุการณ์ · ไม่รู้กติกา = กำหนดชำระอย่างเดียว (ค่าที่มองไม่เห็นไม่หลุดไปกับใบ)
// ⭐ รุ่นสี่ (มติเจ้าของ 29/09 แบบ A): หน้าสร้างถอด BillingRoundPicker ใช้ตัวแก้วันงวดตัวเดียวกับใบ SO ⇒ ค่าต่องวดคือร่าง
//   `{ billingDate, billingEvent, dueDate, billingSkip }` (ไม่มีสถานะเลือกครึ่งทาง) · ด่านเขียนตัวเดียวกับ schedule
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CREATE_NO_BILLING_ERROR,
  createFormDateCheck,
  createFormInstallmentItems,
  createFormPlanNote,
  createFormTermsKind,
  createFormTermsState,
  loadCreateFormBillingTerms,
  parseCreateFormInstallments,
} from './salesOrderCreateInstallments.js';
import { EMPTY_DATES, pickBillingDate } from './installmentDateDrafts.js';

/* AR-267 เจอร์นัล แล็บ: วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25 เดือนเดียวกัน (ม็อก จอ B) — รูปรุ่นสอง (mig 0390)
   `AR267_V1` = รูปเดียวกันแบบรุ่นแรก (0389) ที่ยังอยู่ในฐานก่อนรัน 0390 */
const AR267 = { billing: { mode: 'monthly', days: [5] }, payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }] } };
const AR267_V1 = { billing: { mode: 'monthly', day: 5 }, payment: { mode: 'monthly', day: 25, monthOffset: 0 } };
const NONE = { v: 4, need: 'none' };
const PLAN = [
  { seq: 1, label: 'มัดจำ', percent: 50, amount: 51385.68 },
  { seq: 2, label: 'งวดสุดท้าย', percent: 50, amount: 51385.68 },
];
/* ค่าของร่างที่ตัวแก้ลง (installmentDateDrafts) */
const draft = (patch) => ({ ...EMPTY_DATES, ...patch });

/* ── createFormInstallmentItems (หน้า → POST) ─────────────────────────── */

test('ไม่ตั้งอะไรเลย = ไม่ส่งสักงวด (ไม่บังคับ)', () => {
  assert.deepEqual(createFormInstallmentItems(PLAN, {}), []);
  assert.deepEqual(createFormInstallmentItems(PLAN, { 1: draft({}) }), []);
});

test('แตะรอบ = ส่งทั้งวันวางบิลและกำหนดชำระ · รอเหตุการณ์ = ส่งชื่อ ไม่มีวัน', () => {
  const items = createFormInstallmentItems(PLAN, {
    1: pickBillingDate(AR267, '2026-10-05'),
    2: draft({ billingEvent: 'ก่อนส่งสินค้า' }),
  });
  assert.deepEqual(items, [
    { seq: 1, billingDate: '2026-10-05', billingEvent: null, dueDate: '2026-10-25' },
    { seq: 2, billingDate: null, billingEvent: 'ก่อนส่งสินค้า', dueDate: null },
  ]);
});

test('กำหนดชำระอย่างเดียว (ไม่ต้องวางบิล · ยังไม่ระบุ) ส่ง dueDate อย่างเดียว · งวดที่ไม่อยู่ในแผนไม่ถูกส่ง', () => {
  assert.deepEqual(createFormInstallmentItems(PLAN, { 2: draft({ dueDate: '2026-09-25' }) }),
    [{ seq: 2, billingDate: null, billingEvent: null, dueDate: '2026-09-25' }]);
  assert.deepEqual(createFormInstallmentItems([PLAN[0]], { 2: pickBillingDate(AR267, '2026-10-05') }), []);
});

test('⭐ รุ่นสี่: ติ๊ก "งวดนี้ไม่ต้องวางบิล" ส่งเฉพาะฐานที่รัน 0393 · ไม่รู้กติกา (billingOn เท็จ) = กำหนดชำระอย่างเดียว', () => {
  const values = { 1: draft({ dueDate: '2026-10-05', billingSkip: true }), 2: draft({ billingDate: '2026-10-01', dueDate: '2026-10-30' }) };
  assert.deepEqual(createFormInstallmentItems(PLAN, values, { skipReady: true }), [
    { seq: 1, billingDate: null, billingEvent: null, dueDate: '2026-10-05', billingSkip: true },
    { seq: 2, billingDate: '2026-10-01', billingEvent: null, dueDate: '2026-10-30' },
  ]);
  assert.equal(createFormInstallmentItems(PLAN, values).find((i) => i.seq === 1).billingSkip, undefined,
    'ฐานยังไม่รัน 0393 = คีย์นี้ไม่ไปกับคำขอ');
  /* ไม่รู้กติกา/ฐานยังไม่รัน 0389 — ตารางมีแต่กำหนดชำระ ⇒ วันวางบิล/เหตุการณ์/ติ๊กที่ค้างในร่างต้องไม่หลุด */
  assert.deepEqual(createFormInstallmentItems(PLAN, { ...values, 2: draft({ billingEvent: 'ก่อนผลิต' }) }, { skipReady: true, billingOn: false }), [
    { seq: 1, billingDate: null, billingEvent: null, dueDate: '2026-10-05' },
  ]);
});

/* ── parseCreateFormInstallments (POST ก่อนออกเลขใบ) ─────────────────── */

test('ไม่ส่ง / ว่าง = ไม่มีอะไรต้องเขียน', () => {
  assert.deepEqual(parseCreateFormInstallments(undefined), { rows: [], error: null });
  assert.deepEqual(parseCreateFormInstallments([]), { rows: [], error: null });
});

test('ฟอร์มเดิม { seq, dueDate } ยังใช้ได้ — patch มีแค่ dueDate (ฐานก่อน 0389 ไม่เจอคีย์ใหม่)', () => {
  assert.deepEqual(parseCreateFormInstallments([{ seq: 1, dueDate: '2026-09-25' }]), {
    rows: [{ seq: 1, patch: { dueDate: '2026-09-25' } }], error: null,
  });
});

test('ค่าจากตัวแก้ ผ่านทั้งชุด · แถวว่างถูกข้าม', () => {
  const items = createFormInstallmentItems(PLAN, {
    1: pickBillingDate(AR267, '2026-10-05'),
    2: draft({ billingEvent: ' ก่อนส่งสินค้า ' }),
  });
  assert.deepEqual(parseCreateFormInstallments([...items, { seq: 3, dueDate: '', billingDate: null }]), {
    rows: [
      { seq: 1, patch: { dueDate: '2026-10-25', billingDate: '2026-10-05' } },
      { seq: 2, patch: { billingEvent: 'ก่อนส่งสินค้า' } },
    ],
    error: null,
  });
});

test('ค่าผิดตีกลับชัด ๆ พร้อมเลขงวด — ไม่ข้ามเงียบแบบเดิม', () => {
  assert.match(parseCreateFormInstallments({ seq: 1 }).error, /รูปแบบ/);
  assert.match(parseCreateFormInstallments([{ seq: 0, dueDate: '2026-09-25' }]).error, /ลำดับงวด/);
  assert.match(parseCreateFormInstallments([{ seq: 1 }, { seq: 1 }]).error, /งวด 1 ถูกส่งมาซ้ำ/);
  assert.match(parseCreateFormInstallments([{ seq: 2, dueDate: '25/09/2026' }]).error, /กำหนดชำระของงวด 2/);
  // วันที่ไม่มีจริง — regex ผ่านแต่ฐานตอบ 22008 (ใบออกแล้วงวดไม่ได้วัน)
  assert.match(parseCreateFormInstallments([{ seq: 2, dueDate: '2026-02-31' }]).error, /กำหนดชำระของงวด 2/);
  assert.match(parseCreateFormInstallments([{ seq: 1, billingDate: '2026-02-30' }]).error, /วันวางบิลของงวด 1/);
  // ปีพิมพ์พลาด — ข้อความต้องชี้ที่ปี ไม่ใช่ "ไม่ใช่วันที่" กว้าง ๆ (review S4 26/09)
  assert.equal(parseCreateFormInstallments([{ seq: 1, dueDate: '2202-08-06' }]).error, 'ปีของกำหนดชำระงวด 1 ผิด (2202) — ตรวจปี ค.ศ. อีกครั้ง');
  assert.match(parseCreateFormInstallments([{ seq: 3, billingDate: '2569-10-05' }]).error, /^ปีของวันวางบิลงวด 3 ผิด \(2569\)/);
  assert.match(
    parseCreateFormInstallments([{ seq: 1, billingDate: '2026-10-05', billingEvent: 'ก่อนผลิต' }]).error,
    /งวด 1: เลือกวันวางบิล หรือ รอเหตุการณ์ อย่างใดอย่างหนึ่ง/,
  );
  assert.match(parseCreateFormInstallments([{ seq: 1, billingEvent: 'ก'.repeat(121) }]).error, /งวด 1: ชื่อเหตุการณ์ยาวเกิน/);
});

/* ── รุ่นสี่ (mig 0393 · system-design §7.4): ด่านเดียวกับ schedule กับกติกาลูกค้าที่ server อ่านเอง ──────── */
test('POST รุ่นสี่: ลูกค้าไม่ต้องวางบิล — วันวางบิลต้องยืนยัน "งวดนี้ต้องวางบิล…" · กำหนดชำระอย่างเดียวผ่าน · ธงยืนยันไม่ลงฐาน', () => {
  const none = { rule: { v: 4, need: 'none' } };
  assert.match(parseCreateFormInstallments([{ seq: 1, billingDate: '2026-10-05', dueDate: '2026-10-05' }], none).error,
    /^งวด 1: ลูกค้ารายนี้ไม่ต้องวางบิล/);
  assert.deepEqual(parseCreateFormInstallments([{ seq: 1, dueDate: '2026-10-05' }], none),
    { rows: [{ seq: 1, patch: { dueDate: '2026-10-05' } }], error: null });
  const confirmed = parseCreateFormInstallments([{ seq: 1, billingDate: '2026-10-05', dueDate: '2026-10-05', billingException: true }], none);
  assert.equal(confirmed.error, null);
  assert.deepEqual(confirmed.rows[0].patch, { dueDate: '2026-10-05', billingDate: '2026-10-05' },
    'ยืนยันแล้วเขียนวันวางบิล · billingException ไม่อยู่ใน patch (route ลงประวัติเอง — scheduleExceptionsOf)');
});

test('POST รุ่นสี่: ติ๊ก "งวดนี้ไม่ต้องวางบิล" · รอเหตุการณ์ไม่มีกำหนดชำระ · อ่านกติกาไม่ขึ้นปิดแค่วันวางบิล/ติ๊ก', () => {
  const required = { rule: { v: 4, need: 'required', billing: null } };
  assert.deepEqual(parseCreateFormInstallments([{ seq: 1, dueDate: '2026-10-05', billingSkip: true }], required).rows[0].patch,
    { dueDate: '2026-10-05', billingSkip: true });
  assert.match(parseCreateFormInstallments([{ seq: 1, billingDate: '2026-10-05', billingSkip: true }], required).error,
    /^งวด 1: ติ๊ก "งวดนี้ไม่ต้องวางบิล" แล้วมีวันวางบิลไม่ได้/);
  assert.match(parseCreateFormInstallments([{ seq: 1, dueDate: '2026-10-05', billingSkip: true }], { rule: { v: 4, need: 'none' } }).error,
    /ลูกค้าไม่ต้องวางบิลอยู่แล้ว/);
  assert.match(parseCreateFormInstallments([{ seq: 2, billingEvent: 'ก่อนส่งสินค้า', dueDate: '2026-10-05' }], { rule: null }).error,
    /^งวด 2: งวดที่รอเหตุการณ์ยังไม่มีกำหนดชำระ/, 'ข้อทั่วไปตรวจแม้กติกายังไม่ระบุ');
  const down = { rule: null, ruleUnavailable: true };
  assert.deepEqual(parseCreateFormInstallments([{ seq: 1, dueDate: '2026-10-05' }], down).rows, [{ seq: 1, patch: { dueDate: '2026-10-05' } }]);
  assert.match(parseCreateFormInstallments([{ seq: 1, billingDate: '2026-10-05' }], down).error, /อ่านกำหนดวางบิลของลูกค้าไม่ได้ชั่วคราว/);
});

/* ── createFormDateCheck (ด่านบนจอ = ตัวตรวจเดียวกับ POST) ──────────────── */

test('ด่านวันที่บนจอ: ปีพิมพ์พลาดถูกกันก่อนอัปไฟล์ · บอกงวดที่ผิด · ค่าที่ถูก/ว่างผ่าน', () => {
  assert.deepEqual(createFormDateCheck(PLAN, {}), { error: '', invalidSeqs: new Set() });
  const ok = createFormDateCheck(PLAN, { 1: pickBillingDate(AR267, '2026-10-05') });
  assert.equal(ok.error, '');
  const typo = createFormDateCheck(PLAN, {
    1: draft({ dueDate: '2202-08-06' }),
    2: draft({ dueDate: '2026-02-31' }),
  });
  /* 2026-02-31 ไม่ใช่วันที่ (ร่างตัดทิ้งตั้งแต่ datesOf) — เหลือปีพิมพ์พลาดงวด 1 */
  assert.equal(typo.error, 'ปีของกำหนดชำระงวด 1 ผิด (2202) — ตรวจปี ค.ศ. อีกครั้ง', 'ข้อความแรกที่เจอ');
  assert.deepEqual([...typo.invalidSeqs], [1]);
  // ข้อความเดียวกับที่ POST จะตอบ — ปุ่มกับ API พูดเรื่องเดียวกัน
  assert.equal(typo.error, parseCreateFormInstallments(createFormInstallmentItems(PLAN, {
    1: draft({ dueDate: '2202-08-06' }),
  })).error);
});

test('⭐ รุ่นสี่: ด่านบนจอรู้กติกา = ด่านเขียนตัวเดียวกับ POST (ไม่ต้องวางบิลห้ามวันวางบิล · รอเหตุการณ์ไม่มีกำหนดชำระ) · ไม่รู้กติกา = ตรวจรูปอย่างเดียว', () => {
  const billed = { 1: draft({ billingDate: '2026-10-05', dueDate: '2026-10-05' }) };
  assert.match(createFormDateCheck(PLAN, billed, { rule: NONE }).error, /^งวด 1: ลูกค้ารายนี้ไม่ต้องวางบิล/);
  /* 🐞 review 29/09: หน้าสร้างไม่มีเมนู "งวดนี้ต้องวางบิล…" — ข้อความต้องบอกทางที่ทำได้บนหน้านี้ ไม่ใช่ชี้ไปเมนูที่ไม่มี */
  assert.equal(createFormDateCheck(PLAN, billed, { rule: NONE }).error, `งวด 1: ${CREATE_NO_BILLING_ERROR}`);
  assert.equal(createFormDateCheck(PLAN, billed, { rule: NONE }).error,
    parseCreateFormInstallments(createFormInstallmentItems(PLAN, billed), { rule: NONE }).error, 'จอกับ POST ตอบคำเดียวกัน');
  assert.equal(createFormDateCheck(PLAN, billed, { rule: null }).error, '', 'ยังไม่ระบุ = วันวางบิลไม่บังคับ ใส่ได้');
  assert.equal(createFormDateCheck(PLAN, billed).error, '', 'ไม่รู้กติกา = ไม่ตรวจกติกา (POST ตรวจด้วยกติกาที่ server อ่าน)');
  assert.equal(createFormDateCheck(PLAN, { 1: draft({ dueDate: '2026-10-05', billingSkip: true }) }, { rule: NONE, skipReady: true }).error,
    'งวด 1: ลูกค้าไม่ต้องวางบิลอยู่แล้ว — ไม่ต้องติ๊กรายงวด');
});

/* ── กติกาของลูกค้าจาก GET ใบเสนอราคา (loadCreateFormBillingTerms → createFormTermsState) ── */

/* supabase ปลอม: `responses` = คำตอบของ select ลูกค้าตามลำดับที่ถูกเรียก · เก็บ select ที่ถูกขอไว้ตรวจ ·
   `probe` = คำตอบของ probe คอลัมน์ billingSkip (mig 0393 — billingPolicySchema) */
function fakeCustomers(responses, probe = { data: [], error: null }) {
  const selects = [];
  let call = 0;
  return {
    selects,
    from(table) {
      if (table === 'sales_order_installments') {
        return { select: (columns) => { assert.equal(columns, 'billingSkip'); return { limit: async () => probe }; } };
      }
      assert.equal(table, 'customers');
      const builder = {
        select: (columns) => { selects.push(columns); return builder; },
        eq: (column, value) => { assert.deepEqual([column, value], ['id', 'CUS-267']); return builder; },
        maybeSingle: async () => responses[call++],
      };
      return builder;
    },
  };
}

const COLS = 'id, "arCode", team, teams, "creditTerms", "billingRule", "billingRuleUpdatedAt"';

test('อ่านกติกาของลูกค้าแถวเดียว (ไม่ใช่ทะเบียนลูกค้าทั้งก้อน) → สถานะของหน้า · ค่าดิบ (ไม่ผ่านตัวอ่านรุ่นสอง) + ตัวล็อก + ธง 0393', async () => {
  const supabase = fakeCustomers([{ data: {
    id: 'CUS-267', arCode: 'AR-267', team: 'ODM', teams: ['ODM'], creditTerms: ' เครดิต 30 วัน ', billingRule: AR267_V1,
    billingRuleUpdatedAt: '2026-09-28T10:50:00.123456+00:00',
  }, error: null }]);
  const payload = await loadCreateFormBillingTerms(supabase, 'CUS-267');
  assert.deepEqual(supabase.selects, [COLS]);
  assert.deepEqual(payload, {
    supported: true, billingRule: AR267_V1, billingSkipReady: true, billingRuleUpdatedAt: '2026-09-28T10:50:00.123456+00:00',
    canEditBillingRule: false, creditTerms: 'เครดิต 30 วัน', arCode: 'AR-267',
  }, 'ไม่ส่ง user = ไม่มีสิทธิ์ตอบ (แถบอ่านอย่างเดียว) · ตัวล็อกดิบไม่ผ่าน Date');
  assert.deepEqual(createFormTermsState(payload), {
    status: 'ready', supported: true, rule: AR267_V1, billingSkipReady: true, billingRuleUpdatedAt: '2026-09-28T10:50:00.123456+00:00',
    canEditBillingRule: false, creditTerms: 'เครดิต 30 วัน', arCode: 'AR-267',
  });
  /* ฝ่ายบัญชีตอบได้ (canEditCustomerBillingRule ตัวเดียวกับ API) */
  const fn = await loadCreateFormBillingTerms(fakeCustomers([{ data: { id: 'CUS-267', team: 'ODM', billingRule: null }, error: null }]), 'CUS-267',
    { user: { id: 'u-fn', role: 'fn', department: 'FN' } });
  assert.equal(typeof fn.canEditBillingRule, 'boolean');
  /* ⭐ รุ่นสี่ถึงหน้าตรงตัว (เดิม billingRuleOf คืน null = "ยังไม่ระบุ" เงียบ ๆ) */
  const v4 = createFormTermsState({ supported: true, billingRule: NONE, arCode: 'AR-638' });
  assert.deepEqual(v4.rule, NONE);
  assert.equal(createFormTermsKind(v4), 'rule');
});

test('ฐานยังไม่รัน 0389 (42703) = อ่านชุดเดิม + supported:false ⇒ หน้าเหมือนเดิม ไม่ชวนตอบ · ฐานยังไม่รัน 0393 = ไม่มีติ๊ก', async () => {
  const supabase = fakeCustomers([
    { data: null, error: { code: '42703', message: 'column customers.billingRule does not exist' } },
    { data: { id: 'CUS-267', arCode: 'AR-267', creditTerms: null }, error: null },
  ]);
  const payload = await loadCreateFormBillingTerms(supabase, 'CUS-267');
  assert.deepEqual(supabase.selects, [COLS, 'id, "arCode", "creditTerms"']);
  assert.deepEqual(payload, {
    supported: false, billingRule: null, billingSkipReady: false, billingRuleUpdatedAt: null, canEditBillingRule: false,
    creditTerms: '', arCode: 'AR-267',
  });
  assert.equal(createFormTermsState(payload).supported, false);
  const pre0393 = await loadCreateFormBillingTerms(fakeCustomers([{ data: { id: 'CUS-267', billingRule: null }, error: null }],
    { error: { code: '42703', message: 'column sales_order_installments.billingSkip does not exist' } }), 'CUS-267');
  assert.equal(pre0393.billingSkipReady, false);
  assert.equal(pre0393.supported, true);
});

test('อ่านไม่ขึ้น = { error } ข้อความดิบ (ไม่โยน · ใบยังเปิดได้) · ไม่เจอลูกค้า = ไม่รองรับ · ใบไม่ผูกลูกค้า = ไม่มีแถบ', async () => {
  const broken = await loadCreateFormBillingTerms(fakeCustomers([{ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }]), 'CUS-267');
  assert.deepEqual(broken, { error: 'canceling statement due to statement timeout' });
  assert.deepEqual(createFormTermsState(broken), { status: 'error', detail: 'canceling statement due to statement timeout' });

  const missing = await loadCreateFormBillingTerms(fakeCustomers([{ data: null, error: null }]), 'CUS-267');
  assert.equal(missing.supported, false);

  assert.equal(await loadCreateFormBillingTerms(fakeCustomers([]), ''), null);
  assert.equal(createFormTermsState(null), null);
  assert.equal(createFormTermsState(undefined), null, 'server เก่าที่ยังไม่รู้จัก include = หน้าเหมือนเดิม');
  // กติการูปเพี้ยนจากฐาน อ่านแบบทน (ruleOf) ไม่ล้มจอ = ยังไม่ระบุ
  assert.equal(createFormTermsState({ supported: true, billingRule: { billing: 'x' } }).rule, null);
});

test('ข้อความใต้ตารางงวดถูกตามคำตอบของลูกค้า — มีรอบ · เครดิต N · ชำระวันวางบิล · ไม่ต้องวางบิล · รูปเดิม · ยังไม่ระบุ', () => {
  assert.match(createFormPlanNote(AR267, { termsKind: 'rule' }), /^ตัวแก้เสนอรอบถัดไปของลูกค้า/);
  assert.match(createFormPlanNote({ billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 30 } }, { termsKind: 'rule' }),
    /เครดิต 30 วัน — ใส่วันวางบิล ระบบคิดกำหนดชำระ \(\+30 วัน\) ให้/);
  assert.match(createFormPlanNote({ billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 0 } }, { termsKind: 'rule' }), /^ลูกค้าชำระวันวางบิล/);
  assert.match(createFormPlanNote(NONE, { termsKind: 'rule' }), /^ลูกค้าไม่ต้องวางบิล — ตั้งกำหนดชำระรายงวด/);
  assert.match(createFormPlanNote({ v: 4, need: 'required', billing: null }, { termsKind: 'rule' }), /^ต้องวางบิล · ยังไม่ตั้งรอบ — ใส่วันวางบิลเองรายงวด/);
  /* ⭐ รอบกรรมการ 29/09: รูปเดิม = กำหนดชำระนำ วันวางบิลไม่บังคับ (ไม่ใช่ "ใส่วันวางบิล กำหนดชำระวันเดียวกัน") */
  assert.match(createFormPlanNote({ credit: false }, { termsKind: 'rule' }), /รูปเดิม “ไม่มีเครดิต” .*วันวางบิลไม่บังคับ/);
  assert.match(createFormPlanNote(null), /^ยังไม่ระบุว่าต้องวางบิลไหม — แตะช่องกำหนดชำระเพื่อตั้งได้เลย วันวางบิลไม่บังคับ/);
  for (const rule of [AR267, null, { credit: false }, NONE]) assert.match(createFormPlanNote(rule), /ไม่ตั้งก็สร้างใบได้/);
  for (const rule of [AR267, null, { credit: false }, NONE]) assert.doesNotMatch(createFormPlanNote(rule), /เครดิต 0|\+0/);
});

test('🔴 review 28/09: คำ "ยังไม่ระบุ…" + ช่องวันวางบิล เฉพาะตอนรู้กติกา — โหลดไม่ขึ้น/ใบไม่ผูกลูกค้า = ไม่รู้ (กำหนดชำระอย่างเดียว)', () => {
  const ready = (billingRule, supported = true) => createFormTermsState({ supported, billingRule, creditTerms: '', arCode: 'AR-1' });
  assert.equal(createFormTermsKind(ready(null)), 'unset');
  assert.equal(createFormTermsKind(ready({ billing: 'x' })), 'unset', 'กติการูปเพี้ยนจากฐาน = อ่านเป็นยังไม่ระบุ');
  assert.equal(createFormTermsKind(ready(AR267)), 'rule');
  assert.equal(createFormTermsKind(ready({ credit: false })), 'rule', 'รูปเดิม = รู้กติกา (ตัวแก้แบบ free)');
  assert.equal(createFormTermsKind(ready(NONE)), 'rule');
  assert.equal(createFormTermsKind(createFormTermsState({ error: 'canceling statement due to statement timeout' })), 'error');
  assert.equal(createFormTermsKind(null), 'off', 'ใบไม่ผูกลูกค้า');
  assert.equal(createFormTermsKind(ready(null, false)), 'off', 'ฐานยังไม่รัน 0389 / ไม่เจอแถวลูกค้า');
  /* คำใต้ตาราง: โหลดไม่ขึ้น = ไม่มีบรรทัด · ไม่ผูกลูกค้า/ไม่รองรับ = ประโยคกลาง · ห้ามพูด "ยังไม่ระบุ…" หรือ "วันวางบิลไม่บังคับ" */
  assert.equal(createFormPlanNote(null, { termsKind: 'error' }), '');
  assert.equal(createFormPlanNote({ credit: false }, { termsKind: 'error' }), '', 'ไม่รู้กติกา = ไม่พูดตามค่าที่ค้าง');
  const off = createFormPlanNote(null, { termsKind: 'off' });
  assert.match(off, /^กรอกกำหนดชำระเองได้ · ไม่ตั้งก็สร้างใบได้/);
  for (const text of [off, createFormPlanNote(null, { termsKind: 'error' })]) {
    assert.doesNotMatch(text, /ยังไม่ระบุ|วันวางบิลไม่บังคับ/);
  }
});

/* ── ต่อสายจริงในหน้า + route (อ่านซอร์ส — ไม่มี DB ในเทสต์) ──────────── */

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('POST ตรวจวันของงวดก่อนออกเลขใบ · เขียนผ่าน patch ของตัวตรวจ · ข้ามงวดยกมา', () => {
  const route = read('app/api/sales-planning/sales-orders/route.js');
  const parse = route.indexOf('parseCreateFormInstallments(body.installments, billingRule)');
  const rpc = route.indexOf("rpc('create_sales_order_draft'");
  assert.ok(parse > 0 && parse < rpc, 'ค่าผิดต้องตอบ 400 ก่อนมีใบ — เลขใบใช้ซ้ำไม่ได้');
  assert.match(route, /if \(installmentDates\.error\) return badRequest\(installmentDates\.error\);/);
  /* รุ่นสี่: กติกาของลูกค้าอ่านสดที่ server (ลูกค้าของใบเสนอราคา = ของใบที่ RPC สร้าง) — ไม่เชื่อจอ · ติ๊กก่อน 0393 = 503 ก่อนออกเลข */
  const rule = route.indexOf('const billingRule = await loadScheduleRule(supabase, quote.customerId);');
  assert.ok(rule > 0 && rule < parse);
  assert.match(route, /\.select\('id, quoteNumber, status, paymentPlan, totalAmount, customerId, deal:sales_deals\(\*\)'\)/);
  const probe = route.indexOf('probeBillingSkip(supabase)');
  assert.ok(probe > parse && probe < rpc, 'ฐานยังไม่มีคอลัมน์ติ๊ก = บอกก่อนออกเลขใบ');
  /* ธงรุ่นสี่ต้องเป็น boolean ก่อนถึงตัวตรวจ (สตริง "true" = truthy) · ข้อยกเว้นคิดที่ route ด้วยตัวเดียวกับ schedule แล้วลงประวัติของการสร้างใบ */
  const flags = route.indexOf('billingFlagShapeError(item)');
  assert.ok(flags > 0 && flags < parse);
  assert.match(route, /scheduleExceptionsOf\(\{\}, \{/);
  assert.match(route, /\+ scheduleExceptionSummary\(createExceptions, user\.name \|\| user\.email \|\| ''\)/, 'ข้อยกเว้นลงประวัติของการสร้างใบ');
  assert.match(route, /import \{ applyCreateFormPayments \} from '@\/lib\/sales\/salesOrderCreatePayments';/);
  assert.match(route, /applyCreateFormPayments\(supabase, \{\s*orderId, dates: installmentDates\.rows,/);
  // พฤติกรรมจริง (ล้มงวดหนึ่งไม่ลากงวดอื่น) ไล่ด้วย supabase ปลอมที่ salesOrderCreatePayments.test.mjs
  const apply = read('lib/sales/salesOrderCreatePayments.js');
  assert.match(apply, /if \(!row \|\| isOpeningInstallment\(row\)\) continue;/, 'งวดยกมาไม่มีวันวางบิล/กำหนดชำระ (CHECK 0374 + 0389)');
  assert.match(apply, /updateInstallment\(supabase, row\.id, patch\)/);
  assert.doesNotMatch(apply, /status:/, 'งวดร่างต้อง pending เสมอ (CHECK 0259)');
});

test('หน้าสร้าง: ตัวแก้วันงวดตัวเดียวกับใบ SO (ถอด BillingRoundPicker) · ส่งแถวผ่านตัวช่วยเดียว · อ่านคำเตือนหลัง 201', () => {
  const page = read('app/sales-planning/sales-orders/new/page.js');
  // ⭐ AGENTS.md สร้าง/แก้ใช้ตัวเดียว — โหมดตั้งวันของใบ SO (create) + เซลล์ + ตัวแก้กางใต้แถว/แผ่นล่าง
  assert.doesNotMatch(page, /from "@\/components\/salesPlanning\/BillingRoundPicker"|<BillingRoundPicker|billingPicker"|pickerRuleOf\(|createFormManualValue|createFormVisibleValues/);
  assert.match(page, /const dateMode = useInstallmentDateMode\(\{/);
  assert.match(page, /create: true,/);
  assert.match(page, /billingOff: !billingOn,/, 'ไม่รู้กติกา = กำหนดชำระอย่างเดียว');
  assert.match(page, /<InstallmentDateCell mode=\{dateMode\} row=\{row\} field="bill" \/>/);
  assert.match(page, /<InstallmentDateCell mode=\{dateMode\} row=\{row\} field="due" billColumn=\{billingOn\} \/>/);
  assert.match(page, /<InstallmentDateExpandRow mode=\{dateMode\} row=\{row\}/);
  assert.match(page, /<InstallmentDateSheet mode=\{dateMode\}/);
  // ช่องวันวางบิล = เฉพาะตอนรู้กติกา ('rule' · 'unset') — โหลดไม่ขึ้น/ใบไม่ผูกลูกค้า = ไม่รู้ (review 28/09)
  assert.match(page, /const termsKind = createFormTermsKind\(terms\);/);
  assert.match(page, /const billingOn = termsKind === "rule" \|\| termsKind === "unset";/);
  assert.match(page, /\{billingOn \? <th className=\{styles\.colDue\}>\{billHead\}<\/th> : null\}/);
  assert.match(page, /const planNote = createFormPlanNote\(customerRule, \{ termsKind \}\);/);
  assert.match(page, /\{planNote \? <p className=\{`form-note \$\{styles\.planNote\}`\}>\{planNote\}<\/p> : null\}/);
  assert.doesNotMatch(page, /rule\.billing\.mode|rule\.payment\.|\.monthOffset|\.need\b/, 'ห้ามอ่านช่องในของกติกาตรง ๆ');
  assert.match(page, /installments: createFormInstallmentItems\(plannedInstallments, valuesBySeq, itemOptions\)/);
  assert.match(page, /createFormDateCheck\(plannedInstallments, valuesBySeq, \{ \.\.\.itemOptions, rule: billingOn \? customerRule : undefined \}\)/);
  assert.match(page, /paymentError \|\| dateCheck\.error/, 'วันที่ผิด/ด่านเขียนกันปุ่มก่อนอัปไฟล์');
  assert.match(page, /responseWarningText\(data\)/, 'คำเตือน "ออกใบแล้วแต่ตั้งงวดไม่สำเร็จ" ต้องถึงตาคน ไม่ใช่หายตอนเปลี่ยนหน้า');
  assert.doesNotMatch(page, /<input type="date"/);
});

test('หน้าสร้างอ่านกติกาของลูกค้ากับใบในคำขอเดียว · แถบนโยบายตัวเดียวกับแผงงวด · ทะเบียนลูกค้าเปิดแท็บใหม่แล้วกลับมาโหลดใหม่', () => {
  const page = read('app/sales-planning/sales-orders/new/page.js');
  const route = read('app/api/sales-planning/quotations/[id]/route.js');
  assert.match(page, /quotations\/\$\{encodeURIComponent\(quotationId\)\}\?include=billingTerms/);
  assert.doesNotMatch(page, /\/api\/customers\//, 'ไม่ลากทะเบียนลูกค้าทั้งก้อน (สินค้า · ออเดอร์สรรพสามิต) มาเพื่อ 3 ช่อง');
  assert.match(route, /searchParams\.get\('include'\) === 'billingTerms'/);
  assert.match(route, /loadCreateFormBillingTerms\(supabase, filledQuote\.customerId, \{ user \}\)/, "ขาด user = canEditBillingRule เท็จทุกคน แถบ ต้องวางบิลไหม ของหน้าสร้างตอบไม่ได้");
  // แถบนโยบาย (ถาม "ต้องวางบิลไหม" · ตอบแล้วโหลดกติกาใหม่) — ลิงก์ทะเบียนอยู่ในแถบ เปิดแท็บใหม่ (ฟอร์มนี้ไม่มีร่าง)
  assert.match(page, /<BillingPolicyStrip/);
  assert.match(page, /onRegistryOpened=\{markRegistryOpened\}\s*onSaved=\{refreshTerms\}/);
  assert.match(page, /addEventListener\("focus", onReturn\)/);
  assert.match(page, /addEventListener\("visibilitychange", onReturn\)/);
  // โหลดไม่ขึ้น: ไทยนำ + ข้อความดิบเป็นบรรทัดเล็ก (มติ 23/09)
  assert.match(page, /detail=\{terms\.detail \|\| undefined\}/);
});
