// ── วันของงวดจากหน้าสร้างใบสั่งขาย (กำหนดชำระ + วันวางบิล · mig 0389) — logic ล้วน ──
//
// สิ่งที่ชุดนี้ล็อกไว้: งวดที่ไม่เลือกไม่ถูกส่ง (ไม่บังคับ · มติ 26/09 ข้อ 2) · เลือกครึ่ง ๆ กลาง ๆ ถูกกันพร้อมบอกทุกงวด ·
// ลูกค้าไม่มีรอบยังส่งกำหนดชำระแบบเดิม · server ตีกลับค่าผิดก่อนออกเลขใบ ไม่ข้ามเงียบ · ไม่มีวันวางบิลคู่เหตุการณ์
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createFormBillingBlocker,
  createFormDateCheck,
  createFormInstallmentItems,
  createFormTermsState,
  createFormVisibleValues,
  loadCreateFormBillingTerms,
  parseCreateFormInstallments,
} from './salesOrderCreateInstallments.js';
import { EMPTY_PICKER_VALUE, applyPick } from './billingPicker.js';

/* AR-267 เจอร์นัล แล็บ: วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25 เดือนเดียวกัน (ม็อก จอ B) */
const AR267 = { billing: { mode: 'monthly', day: 5 }, payment: { mode: 'monthly', day: 25, monthOffset: 0 } };
const PLAN = [
  { seq: 1, label: 'มัดจำ', percent: 50, amount: 51385.68 },
  { seq: 2, label: 'งวดสุดท้าย', percent: 50, amount: 51385.68 },
];
const pick = (p, from = EMPTY_PICKER_VALUE) => applyPick(from, p, AR267);

/* ── createFormInstallmentItems (หน้า → POST) ─────────────────────────── */

test('ไม่เลือกอะไรเลย = ไม่ส่งสักงวด (ไม่บังคับเลือกรอบ)', () => {
  assert.deepEqual(createFormInstallmentItems(PLAN, {}), []);
  assert.deepEqual(createFormInstallmentItems(PLAN, { 1: { ...EMPTY_PICKER_VALUE } }), []);
});

test('แตะรอบ = ส่งทั้งวันวางบิลและกำหนดชำระ · รอเหตุการณ์ = ส่งชื่อ ไม่มีวัน', () => {
  const items = createFormInstallmentItems(PLAN, {
    1: pick({ mode: 'round', billingDate: '2026-10-05' }),
    2: pick({ mode: 'event', billingEvent: 'ก่อนส่งสินค้า' }),
  });
  assert.deepEqual(items, [
    { seq: 1, billingDate: '2026-10-05', billingEvent: null, dueDate: '2026-10-25' },
    { seq: 2, billingDate: null, billingEvent: 'ก่อนส่งสินค้า', dueDate: null },
  ]);
});

test('ลูกค้าไม่มีรอบ: ช่องกำหนดชำระแบบเดิม (mode null) ส่ง dueDate อย่างเดียว', () => {
  const items = createFormInstallmentItems(PLAN, { 2: { ...EMPTY_PICKER_VALUE, dueDate: '2026-09-25' } });
  assert.deepEqual(items, [{ seq: 2, billingDate: null, billingEvent: null, dueDate: '2026-09-25' }]);
});

test('ชื่อเหตุการณ์ที่ค้างจากตอนสลับไปแตะรอบ ไม่หลุดไปคู่กับวันวางบิล (CHECK 0389)', () => {
  const typed = pick({ mode: 'event', billingEvent: 'หลังติดตั้ง' });
  const [item] = createFormInstallmentItems(PLAN, { 1: pick({ mode: 'round', billingDate: '2026-11-05' }, typed) });
  assert.equal(item.billingEvent, null);
  assert.equal(item.billingDate, '2026-11-05');
});

test('งวดที่ไม่อยู่ในแผนไม่ถูกส่ง', () => {
  assert.deepEqual(createFormInstallmentItems([PLAN[0]], { 2: pick({ mode: 'round', billingDate: '2026-10-05' }) }), []);
});

/* ── createFormBillingBlocker ─────────────────────────────────────────── */

test('ไม่เลือก / เลือกครบ = ไม่กัน', () => {
  assert.equal(createFormBillingBlocker(PLAN, {}), '');
  assert.equal(createFormBillingBlocker(PLAN, {
    1: pick({ mode: 'round', billingDate: '2026-10-05' }),
    2: pick({ mode: 'event', billingEvent: 'ก่อนส่งสินค้า' }),
  }), '');
});

test('เลือกครึ่งทาง = กัน และบอกทุกงวดที่ขาดในข้อความเดียว พร้อมทางออก', () => {
  const reason = createFormBillingBlocker(PLAN, {
    1: pick({ mode: 'other', billingDate: '' }),
    2: pick({ mode: 'event', billingEvent: '   ' }),
  });
  assert.match(reason, /ยังไม่ได้ใส่วันวางบิล งวด 1 มัดจำ/);
  assert.match(reason, /ยังไม่ได้ใส่เหตุการณ์ที่รอ งวด 2 งวดสุดท้าย/);
  assert.match(reason, /ล้างที่เลือก/);
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

test('ค่าจากตัวเลือกรอบ ผ่านทั้งชุด · แถวว่างถูกข้าม', () => {
  const items = createFormInstallmentItems(PLAN, {
    1: pick({ mode: 'round', billingDate: '2026-10-05' }),
    2: pick({ mode: 'event', billingEvent: ' ก่อนส่งสินค้า ' }),
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

/* ── createFormDateCheck (ด่านบนจอ = ตัวตรวจเดียวกับ POST) ──────────────── */

test('ด่านวันที่บนจอ: ปีพิมพ์พลาดถูกกันก่อนอัปไฟล์ · บอกงวดที่ต้องขึ้นขอบแดง · ค่าที่ถูก/ว่างผ่าน', () => {
  assert.deepEqual(createFormDateCheck(PLAN, {}), { error: '', invalidSeqs: new Set() });
  const ok = createFormDateCheck(PLAN, { 1: pick({ mode: 'round', billingDate: '2026-10-05' }) });
  assert.equal(ok.error, '');
  const typo = createFormDateCheck(PLAN, {
    1: { ...EMPTY_PICKER_VALUE, dueDate: '2202-08-06' },
    2: { ...EMPTY_PICKER_VALUE, dueDate: '2026-02-31' },
  });
  assert.equal(typo.error, 'ปีของกำหนดชำระงวด 1 ผิด (2202) — ตรวจปี ค.ศ. อีกครั้ง', 'ข้อความแรกที่เจอ');
  assert.deepEqual([...typo.invalidSeqs], [1, 2]);
  // ข้อความเดียวกับที่ POST จะตอบ — ปุ่มกับ API พูดเรื่องเดียวกัน
  assert.equal(typo.error, parseCreateFormInstallments(createFormInstallmentItems(PLAN, {
    1: { ...EMPTY_PICKER_VALUE, dueDate: '2202-08-06' },
  })).error);
});

/* ── createFormVisibleValues (ค่าตามที่ตาเห็น) ─────────────────────────── */

test('รอบหาย/โหลดไม่ขึ้น: วันวางบิล·เหตุการณ์ที่ค้างใน state ไม่ถูกส่งและไม่ถูกกัน — เหลือแค่กำหนดชำระ', () => {
  const values = {
    1: pick({ mode: 'round', billingDate: '2026-10-05' }),
    2: pick({ mode: 'other', billingDate: '' }),
  };
  assert.equal(createFormVisibleValues(values, { withRule: true }), values, 'มีรอบ = ค่าเดิมทั้งก้อน');
  const visible = createFormVisibleValues(values, { withRule: false });
  assert.deepEqual(createFormInstallmentItems(PLAN, visible), [
    { seq: 1, billingDate: null, billingEvent: null, dueDate: '2026-10-25' },
  ]);
  // 🐞 "วันอื่น…" ที่ยังไม่ใส่วัน + รอบถูกล้างจากอีกแท็บ = ปุ่มติดด่านที่ไม่มีตัวเลือกให้แก้ (ทางตัน)
  assert.match(createFormBillingBlocker(PLAN, values), /ยังไม่ได้ใส่วันวางบิล งวด 2/);
  assert.equal(createFormBillingBlocker(PLAN, visible), '');
  assert.deepEqual(values[1].mode, 'round', 'state เดิมไม่ถูกแตะ — รอบกลับมา ค่าที่เลือกก็กลับมา');
});

/* ── รอบวางบิลของลูกค้าจาก GET ใบเสนอราคา (loadCreateFormBillingTerms → createFormTermsState) ── */

/* supabase ปลอม: `responses` = คำตอบของ select ตามลำดับที่ถูกเรียก · เก็บ select ที่ถูกขอไว้ตรวจ */
function fakeCustomers(responses) {
  const selects = [];
  let call = 0;
  return {
    selects,
    from(table) {
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

test('อ่านรอบของลูกค้าแถวเดียว 4 คอลัมน์ (ไม่ใช่ทะเบียนลูกค้าทั้งก้อน) → สถานะของหน้า', async () => {
  const supabase = fakeCustomers([{ data: { id: 'CUS-267', arCode: 'AR-267', creditTerms: ' เครดิต 30 วัน ', billingRule: AR267 }, error: null }]);
  const payload = await loadCreateFormBillingTerms(supabase, 'CUS-267');
  assert.deepEqual(supabase.selects, ['id, "arCode", "creditTerms", "billingRule"']);
  assert.deepEqual(payload, { supported: true, billingRule: AR267, creditTerms: 'เครดิต 30 วัน', arCode: 'AR-267' });
  assert.deepEqual(createFormTermsState(payload), {
    status: 'ready', supported: true, rule: AR267, creditTerms: 'เครดิต 30 วัน', arCode: 'AR-267',
  });
});

test('ฐานยังไม่รัน 0389 (42703) = อ่านชุดเดิม + supported:false ⇒ หน้าเหมือนเดิม ไม่ชวนไปตั้งรอบ', async () => {
  const supabase = fakeCustomers([
    { data: null, error: { code: '42703', message: 'column customers.billingRule does not exist' } },
    { data: { id: 'CUS-267', arCode: 'AR-267', creditTerms: null }, error: null },
  ]);
  const payload = await loadCreateFormBillingTerms(supabase, 'CUS-267');
  assert.deepEqual(supabase.selects, ['id, "arCode", "creditTerms", "billingRule"', 'id, "arCode", "creditTerms"']);
  assert.deepEqual(payload, { supported: false, billingRule: null, creditTerms: '', arCode: 'AR-267' });
  assert.equal(createFormTermsState(payload).supported, false);
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
  // รอบที่รูปเพี้ยนจากฐาน อ่านแบบทน (billingRuleOf) ไม่ล้มจอ
  assert.equal(createFormTermsState({ supported: true, billingRule: { billing: 'x' } }).rule, null);
});

/* ── ต่อสายจริงในหน้า + route (อ่านซอร์ส — ไม่มี DB ในเทสต์) ──────────── */

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('POST ตรวจวันของงวดก่อนออกเลขใบ · เขียนผ่าน patch ของตัวตรวจ · ข้ามงวดยกมา', () => {
  const route = read('app/api/sales-planning/sales-orders/route.js');
  const parse = route.indexOf('parseCreateFormInstallments(body.installments)');
  const rpc = route.indexOf("rpc('create_sales_order_draft'");
  assert.ok(parse > 0 && parse < rpc, 'ค่าผิดต้องตอบ 400 ก่อนมีใบ — เลขใบใช้ซ้ำไม่ได้');
  assert.match(route, /if \(installmentDates\.error\) return badRequest\(installmentDates\.error\);/);
  assert.match(route, /import \{ applyCreateFormPayments \} from '@\/lib\/sales\/salesOrderCreatePayments';/);
  assert.match(route, /applyCreateFormPayments\(supabase, \{\s*orderId, dates: installmentDates\.rows,/);
  // พฤติกรรมจริง (ล้มงวดหนึ่งไม่ลากงวดอื่น) ไล่ด้วย supabase ปลอมที่ salesOrderCreatePayments.test.mjs
  const apply = read('lib/sales/salesOrderCreatePayments.js');
  assert.match(apply, /if \(!row \|\| isOpeningInstallment\(row\)\) continue;/, 'งวดยกมาไม่มีวันวางบิล/กำหนดชำระ (CHECK 0374 + 0389)');
  assert.match(apply, /updateInstallment\(supabase, row\.id, patch\)/);
  assert.doesNotMatch(apply, /status:/, 'งวดร่างต้อง pending เสมอ (CHECK 0259)');
});

test('หน้าสร้างส่งแถวผ่านตัวช่วยเดียว · กันเลือกครึ่งทาง · อ่านคำเตือนหลัง 201', () => {
  const page = read('app/sales-planning/sales-orders/new/page.js');
  // ส่ง/ตรวจค่าตามที่ตาเห็น (รอบหาย = เหลือกำหนดชำระ) — ไม่ใช่ state ดิบ
  assert.match(page, /createFormVisibleValues\(billing, \{ withRule: Boolean\(rule\) \}\)/);
  assert.match(page, /installments: createFormInstallmentItems\(plannedInstallments, billingValues\)/);
  assert.match(page, /createFormBillingBlocker\(plannedInstallments, billingValues\)/);
  assert.match(page, /createFormDateCheck\(plannedInstallments, billingValues\)/);
  assert.match(page, /paymentError \|\| billingBlocker \|\| dateCheck\.error/, 'วันที่ผิดกันปุ่มก่อนอัปไฟล์');
  assert.match(page, /responseWarningText\(data\)/, 'คำเตือน "ออกใบแล้วแต่ตั้งงวดไม่สำเร็จ" ต้องถึงตาคน ไม่ใช่หายตอนเปลี่ยนหน้า');
  assert.doesNotMatch(page, /<input type="date"/);
});

test('หน้าสร้างอ่านรอบของลูกค้ากับใบในคำขอเดียว · ปุ่มทะเบียนลูกค้าเปิดแท็บใหม่แล้วกลับมาโหลดรอบใหม่', () => {
  const page = read('app/sales-planning/sales-orders/new/page.js');
  const route = read('app/api/sales-planning/quotations/[id]/route.js');
  assert.match(page, /quotations\/\$\{encodeURIComponent\(quotationId\)\}\?include=billingTerms/);
  assert.doesNotMatch(page, /\/api\/customers\//, 'ไม่ลากทะเบียนลูกค้าทั้งก้อน (สินค้า · ออเดอร์สรรพสามิต) มาเพื่อ 3 ช่อง');
  assert.match(route, /searchParams\.get\('include'\) === 'billingTerms'/);
  assert.match(route, /loadCreateFormBillingTerms\(supabase, filledQuote\.customerId\)/);
  // ฟอร์มไม่มีร่าง/ตัวกันออกจากหน้า — เปลี่ยนหน้าในแท็บเดิม = ของที่กรอกหายหมด
  assert.match(page, /href=\{`\$\{customerHref\}#billing-rule`\}\s*target="_blank"\s*rel="noopener noreferrer"/);
  assert.match(page, /onClick=\{markRegistryOpened\}\s*onAuxClick=\{markRegistryOpened\}/);
  assert.match(page, /addEventListener\("focus", onReturn\)/);
  assert.match(page, /addEventListener\("visibilitychange", onReturn\)/);
  // โหลดไม่ขึ้น: ไทยนำ + ข้อความดิบเป็นบรรทัดเล็ก (มติ 23/09)
  assert.match(page, /detail=\{terms\.detail \|\| undefined\}/);
});
