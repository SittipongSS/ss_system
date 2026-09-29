// ยามของเส้น PATCH /api/customers/[id]/billing-rule (mig 0389 · มติเจ้าของ 25/09 ข้อ 4)
// ⭐ แก้รอบวางบิล **ไม่ต้องอนุมัติใหม่** — วันไหนใครยุบเส้นนี้กลับเข้า PATCH ของลูกค้า หรือเติมด่านอนุมัติ
//    ลูกค้าที่อนุมัติแล้วจะตกกลับ "รออนุมัติ" และหลุดจาก picker ทุกหน้าทันทีที่ตั้งรอบ
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WEBAPP = process.cwd();
/* ตัดคอมเมนต์ก่อนตรวจ — หัวไฟล์ของ route เขียนคำเตือนที่เอ่ยชื่อสิ่งต้องห้ามไว้เอง */
const code = (p) => fs.readFileSync(path.join(WEBAPP, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const ROUTE = 'src/app/api/customers/[id]/billing-rule/route.js';
const ALIAS = 'src/app/api/master/customers/[id]/billing-rule/route.js';

test('⭐ เส้นรอบวางบิลไม่แตะด่านอนุมัติของลูกค้าเลย', () => {
  const src = code(ROUTE);
  for (const banned of ['approvalStatus', 'resetApprovalOnEdit', 'changedFieldsAgainst', 'masterReapprovalUpdate']) {
    assert.equal(src.includes(banned), false, `route ต้องไม่เอ่ย ${banned}`);
  }
});

test('ด่านสิทธิ์ + ตัวตรวจรูป = ตัวเดียวกับที่จอใช้ · ลงประวัติเต็มแถว before/after', () => {
  const src = code(ROUTE);
  assert.match(src, /canEditCustomerBillingRule\(user, customer\)/, 'ด่านสิทธิ์ต้องเป็นตัวเดียวกับปุ่มบนหน้าลูกค้า');
  /* รุ่นสี่ (system-design §7.1 · ระยะ 2a): ตัวตรวจรูปตัวเดียวกับโมดัล (`normalizeRule`) ในโหมดบันทึก — รูปเดิมไม่รับแล้ว */
  assert.match(src, /normalizeRule\(body\.billingRule, \{ allowLegacy: RULE_ALLOW_LEGACY \}\)/, 'ตรวจรูปด้วยตัวเดียวกับโมดัล');
  assert.match(src, /const RULE_ALLOW_LEGACY = false;/, 'ระยะ 2a: แท็บเก่าที่ส่งรูปเดิมได้ 400 — ไม่เขียนรูปที่ CHECK ของ 0393 ไม่รับ');
  assert.doesNotMatch(src, /normalizeBillingRule|billingRuleOf/, 'ตัวอ่านรุ่นเดิมเห็นรุ่นสี่เป็น null — ห้ามใช้ในเส้นนี้');
  assert.match(src, /recordAudit\(\{[\s\S]*?before: customer, after: updated/, 'ต้องลง audit_logs เต็มแถวแบบ PATCH ของลูกค้า');
  // เขียนเฉพาะช่องรอบวางบิล + updatedAt — ห้ามรับคีย์อื่นจาก body ไปเขียน
  const update = src.match(/\.update\(\{([\s\S]*?)\}\)/);
  assert.ok(update, 'ต้องเขียนด้วย object literal (ให้ check:columns ตรวจชื่อคอลัมน์ได้)');
  const keys = [...update[1].matchAll(/^\s*([A-Za-z]+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(keys, ['billingRule', 'billingRuleUpdatedAt', 'billingRuleUpdatedById', 'billingRuleUpdatedByName', 'updatedAt']);
  assert.equal(/\.\.\.body/.test(src), false, 'ห้าม spread body ลงแถวลูกค้า');
});

test('จอเรียกผ่าน /api/master/customers/* — ไฟล์ alias ต้อง re-export PATCH ตัวเดียวกัน', () => {
  const src = fs.readFileSync(path.join(WEBAPP, ALIAS), 'utf8');
  assert.match(src, /export \{ PATCH \} from ["']\.\.\/\.\.\/\.\.\/\.\.\/customers\/\[id\]\/billing-rule\/route["']/);
});

/* ── แถว "ความเคลื่อนไหว" ของลูกค้า (มติเจ้าของ 26/09 ข้อ 7) ─────────────────────────────── */
test('⭐ ตั้ง/แก้/ล้างรอบ = ลงเธรดลูกค้าหลัง audit_logs ผ่านตัวช่วยกลาง · ลงไม่สำเร็จต้องไม่ทำให้บันทึกพัง', () => {
  // ตัวสัญญาเอง (error/throw → false · kind quiet · ผูกผู้กด) เทสต์ด้วยพฤติกรรมที่ master/customerBillingRuleUpdate.test
  // ตรงนี้ตรวจแค่ว่า route ต่อสายถูก: ลำดับ · ค่าเดิม/ใหม่ · ผู้กด · ไม่มีทางออก error หลังเขียนสำเร็จ
  const src = code(ROUTE);
  const audit = src.indexOf('recordAudit({');
  const log = src.search(/logBillingRuleActivity\(supabase, \{/);
  assert.ok(audit > 0 && log > audit, 'ต้องลง audit_logs ก่อนเธรด — เธรดพังแล้ว audit ต้องยังอยู่');
  const call = src.slice(log, src.indexOf('});', log));
  assert.match(call, /customerId: id/);
  assert.match(call, /\bbefore\b/, 'ค่าเดิม = รอบก่อนบันทึก');
  assert.match(call, /after: rule/, 'ค่าใหม่ = รอบที่เพิ่งเขียน (null = ล้าง)');
  assert.match(call, /\buser\b/, 'ต้องผูกผู้กด — เธรดโชว์ว่าใครเปลี่ยน');
  assert.equal(/appendUpdate/.test(src), false, 'route ห้ามเขียนเธรดเอง — ทางเดียวคือตัวช่วยที่กลืน error ทุกทาง');
  const tail = src.slice(audit);
  assert.equal(/Response\.json\(\{ error/.test(tail), false, 'หลังเขียนสำเร็จห้ามตอบ error เพราะเธรด');
  assert.match(tail, /const activityLogged = await logBillingRuleActivity/, 'บอกโมดัลว่าลงเธรดสำเร็จไหม');
  assert.match(tail, /unchanged: false, activityLogged/);
});

/* ยามฝั่งจอ (โมดัล/การ์ดรุ่นสี่ · ลงเธรดไม่สำเร็จ · ล้างเป็นยังไม่ระบุ) ย้ายไปอยู่กับ component แล้ว:
   src/components/database/CustomerBillingRule.test.mjs — ไฟล์นี้เหลือยามของ route */

/* ── รุ่นสอง (มติเจ้าของ 26/09 · mig 0390): เครดิตเป็นสวิตช์ในโมดัลนี้ ทางเดียว ─────────────────────────── */
test('⭐ เครดิตแก้ได้ทางเดียว — ฟอร์มลูกค้า/ก้อนที่ส่ง/API ของลูกค้า ไม่เขียน creditTerms แล้ว (อ่านยังได้)', () => {
  const form = code('src/components/database/CustomerForm.js');
  assert.equal(/creditTerms/.test(form), false, 'ฟอร์มลูกค้าต้องไม่มีช่อง/คีย์ creditTerms (สองทางแก้ค่าเดียว = พูดไม่ตรงกัน)');
  for (const page of ['src/app/database/customers/page.js', 'src/app/database/customers/[id]/page.js']) {
    const src = code(page);
    const payload = src.slice(src.indexOf('const payload = {'), src.indexOf('\n    };', src.indexOf('const payload = {')));
    assert.ok(payload.length > 50, `${page}: หา payload ไม่เจอ`);
    assert.equal(/creditTerms/.test(payload), false, `${page}: payload ต้องไม่ส่ง creditTerms`);
  }
  const patch = code('src/app/api/customers/[id]/route.js');
  const allow = patch.match(/for \(const k of \[([\s\S]*?)\]\)/);
  assert.ok(allow, 'หา allowlist ของ PATCH ไม่เจอ');
  assert.equal(/creditTerms/.test(allow[1]), false, 'PATCH ของลูกค้าต้องไม่รับ creditTerms (ทางนี้ส่งลูกค้ากลับไปรออนุมัติ)');
  const post = code('src/app/api/customers/route.js');
  assert.equal(/creditTerms:\s*body\./.test(post), false, 'POST ต้องไม่รับ creditTerms จาก body');
  assert.match(post, /'creditTerms'/, 'ยังอ่านข้อความเดิมได้ (CUSTOMER_PICKER_COLUMNS)');
});

test('ฐานยังไม่รัน 0393 (ตัวตรวจรุ่นสอง) = บอกทางแก้ ไม่ใช่ "กรอกผิด" · 23514 ตัวอื่นไม่ส่งคนไปรอ migration', () => {
  const src = code(ROUTE);
  const write = src.slice(src.indexOf('if (updateError) {'), src.indexOf('const updated = '));
  const v4 = write.indexOf('billingV4SchemaError(updateError)');
  const other = write.indexOf("updateError.code === '23514'");
  assert.ok(v4 > 0 && other > v4, 'ตัวแปล 0393 (ผูกชื่อ constraint) ต้องมาก่อน 23514 ตัวอื่น');
  assert.match(write.slice(v4, other), /status: 503/);
  // 23514 ที่เหลือ (CHECK อื่นของแถว · โค้ดกับฐานเดินไม่ตรงกัน) ต้องไม่พูดถึง migration ของกติกา
  const rest = write.slice(other, write.indexOf("updateError.code === 'PGRST204'"));
  assert.match(rest, /updateError\.message/);
  assert.equal(/0390|0393|503/.test(rest), false);
  assert.equal(/รอรัน 0390|migration 0390/.test(src), false, 'ข้อความ "รอรัน 0390" ถูกถอด (contracts §9)');
});

test('⭐ ตัวล็อก (§7.1): เขียนเฉพาะเมื่อ billingRuleUpdatedAt ยังเป็นรุ่นที่จอเห็น — null ⇒ .is(null) · สตริงดิบ ⇒ .eq() · ไม่ส่ง = 400', () => {
  const src = code(ROUTE);
  assert.match(src, /write = base\.value === null \? write\.is\('billingRuleUpdatedAt', null\) : write\.eq\('billingRuleUpdatedAt', base\.value\);/);
  assert.doesNotMatch(src, /new Date\(base|Date\.parse\(base|toISOString\(\)\s*===/, 'ห้ามแปลงตัวล็อกผ่าน Date — ไมโครวินาทีหาย = 409 ปลอม');
  assert.match(src, /if \(!Object\.hasOwn\(body, 'baseUpdatedAt'\)\) return \{ error: RELOAD_MESSAGE \};/);
  // 0 แถว = 409 พร้อมค่าล่าสุด (จอคงค่าที่กรอก) · ก่อน audit/เธรด (ไม่มีอะไรถูกเขียน)
  const conflict = src.indexOf('status: 409');
  assert.ok(conflict > 0 && conflict < src.indexOf('await recordAudit({'));
  assert.match(src, /current: latest \? \{/);
});

/* ── route ตัวจริง (ไม่ใช่อ่านซอร์ส) ───────────────────────────────────────────────────────────────────────────
   ไม่มีฐานจริง: fetch ปลอมตอบตามตาราง · ผู้ใช้ = devBypass (ไม่ตั้ง NEXT_PUBLIC_SUPABASE_*) · next/headers ต่อเป็นโมดูลว่าง
   (raw Node แกะ subpath ของ next ไม่ได้ และทาง devBypass ไม่เรียก cookies()) */
async function routeHarness(t, { customer, onPatch = null, tables = {} }) {
  const { register } = await import('node:module');
  register('data:text/javascript,' + encodeURIComponent(`
    export async function resolve(spec, ctx, next) {
      if (spec === 'next/headers') {
        return { url: 'data:text/javascript,export function cookies(){throw new Error("ไม่ควรอ่าน cookie ในทาง devBypass")}export const headers=cookies;', shortCircuit: true };
      }
      return next(spec, ctx);
    }
  `));
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
    NEXT_PUBLIC_DEV_BYPASS_ROLE: 'admin',
  };
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  t.after(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });

  const calls = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input?.url || String(input));
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const table = url.pathname.replace('/rest/v1/', '');
    calls.push({ method, table, params: url.searchParams, body: init.body ? JSON.parse(init.body) : null });
    const wantsObject = String(new Headers(init.headers || {}).get('accept') || '').includes('vnd.pgrst.object');
    if (table === 'customers' && method === 'GET') return json(wantsObject ? customer() : [customer()]);
    if (table === 'customers' && method === 'PATCH') {
      const rows = onPatch ? onPatch(url.searchParams, JSON.parse(init.body)) : [];
      return json(rows);
    }
    if (method === 'POST') return json(wantsObject ? { id: 'X-1', ...(init.body ? JSON.parse(init.body) : {}) } : [], 201);
    if (method === 'GET' && tables[table]) return json(tables[table](url.searchParams));
    if (method === 'GET') return json([]);
    return json({ message: `ไม่ควรถูกเรียก: ${method} ${url}` }, 500);
  });
  const { PATCH } = await import('../app/api/customers/[id]/billing-rule/route.js');
  const call = async (payload) => {
    const res = await PATCH(
      new Request('http://localhost/api/customers/CUS-1/billing-rule', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({ id: 'CUS-1' }) },
    );
    return { status: res.status, body: await res.json() };
  };
  return { calls, call };
}

const STAMP = '2026-09-25T03:00:00.123456+00:00';
const V1_ROW = {
  id: 'CUS-1', arCode: 'AR-001', name: 'ลูกค้าทดสอบ', teams: ['KA'],
  billingRule: { billing: { mode: 'monthly', day: 5 }, payment: { mode: 'monthly', day: 25, monthOffset: 0 }, note: 'แนบสำเนา PO' },
  billingRuleUpdatedAt: STAMP, billingRuleUpdatedById: 'u-old', billingRuleUpdatedByName: 'คนตั้งเดิม',
};
/* รุ่นสี่ที่ความหมายเท่ากับรอบรุ่นแรกข้างบน (วางบิลวันที่ 5 · จ่ายทุกวันที่ 25 — รูปที่ toV4 อ่านรุ่นเดิมออกมา) */
const V4_SAME = {
  v: 4, need: 'required', billing: { mode: 'monthly', days: [5] }, creditDays: 0,
  runs: { kind: 'monthly', rounds: [{ cutoffDay: 25, payDay: 25, payMonthOffset: 0 }] }, note: 'แนบสำเนา PO',
};

test('⭐ route: รอบรูปรุ่นแรก (0389) ในฐาน + บันทึกเป็นรุ่นสี่ที่ความหมายเท่ากัน = unchanged:true · ไม่เขียนอะไรเลย', async (t) => {
  const { calls, call } = await routeHarness(t, { customer: () => V1_ROW });
  const { status, body } = await call({ billingRule: V4_SAME, baseUpdatedAt: STAMP });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.unchanged, true);
  assert.equal(body.billingRuleUpdatedByName, 'คนตั้งเดิม', '"แก้ล่าสุดโดย" ต้องยังเป็นคนเดิม');
  assert.deepEqual(body.ruleChange, { rows: [], kept: [], same: [], hiddenOrders: 0 });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.table}`), ['GET customers'], 'อ่านแถวเดียว — ห้าม PATCH ลูกค้า · ห้ามลง audit_logs / entity_updates');
});

test('⭐ route: ไม่ส่ง baseUpdatedAt (แท็บเก่า) = 400 โหลดหน้าใหม่ · รูปเดิม { credit:false } = 400 · ไม่แตะฐาน', async (t) => {
  const { calls, call } = await routeHarness(t, { customer: () => V1_ROW });
  const old = await call({ billingRule: { v: 4, need: 'none' } });
  assert.equal(old.status, 400);
  assert.match(old.body.error, /โหลดหน้าใหม่/);
  const legacy = await call({ billingRule: { credit: false }, baseUpdatedAt: STAMP });
  assert.equal(legacy.status, 400);
  assert.match(legacy.body.error, /เลือกว่าลูกค้าต้องวางบิลไหม/);
  const readLock = await call({ billingRule: { v: 4, need: 'none' }, baseUpdatedAt: 'เมื่อวาน' });
  assert.equal(readLock.status, 400, 'ตัวล็อกที่ไม่ใช่เวลา = 400 ไม่ใช่ 22007 → 500');
  assert.equal(calls.filter((c) => c.method !== 'GET').length, 0);
});

test('⭐ route: ตัวล็อก — มีคนแก้หลังเปิด (0 แถว) = 409 พร้อมค่าล่าสุด · ไม่ลง audit/เธรด · สตริงดิบถึงฐานไม่แปลงรูป', async (t) => {
  let current = V1_ROW;
  const seen = [];
  const { calls, call } = await routeHarness(t, {
    customer: () => current,
    onPatch: (params) => {
      seen.push(params.get('billingRuleUpdatedAt'));
      current = { ...V1_ROW, billingRuleUpdatedAt: '2026-09-29T02:00:00.000001+00:00', billingRuleUpdatedByName: 'บัญชี ก' };
      return [];
    },
  });
  const res = await call({ billingRule: { v: 4, need: 'none' }, baseUpdatedAt: STAMP });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.deepEqual(seen, [`eq.${STAMP}`], 'ไมโครวินาทีและรูปเขตเวลาเดิมทุกตัวอักษร');
  assert.match(res.body.error, /^มีคนแก้กำหนดวางบิลของลูกค้ารายนี้หลังคุณเปิด \(บัญชี ก\)/);
  assert.equal(res.body.current.billingRuleUpdatedByName, 'บัญชี ก');
  assert.equal(calls.some((c) => c.table === 'audit_logs' || c.table === 'entity_updates'), false);
});

test('⭐ route: ตั้งครั้งแรก (null) = .is(null) · สำเร็จแล้วตอบ ruleChange ของงวดเปิดทุกใบ (ระบบเสนอ ไม่ย้ายวันเอง)', async (t) => {
  const fresh = { ...V1_ROW, billingRule: null, billingRuleUpdatedAt: null, billingRuleUpdatedById: null, billingRuleUpdatedByName: null };
  const seen = [];
  const { calls, call } = await routeHarness(t, {
    customer: () => fresh,
    onPatch: (params, payload) => { seen.push(params.get('billingRuleUpdatedAt')); return [{ ...fresh, ...payload }]; },
    tables: {
      sales_orders: () => [
        { id: 'SOR-1', orderNumber: 'SO-26090001-0', customerId: 'CUS-1', dealId: 'D1', quotationId: 'Q1', status: 'approved', totalAmount: 1000 },
        { id: 'SOR-X', orderNumber: 'SO-26090002-0', customerId: 'CUS-1', dealId: 'D1', quotationId: 'Q1', status: 'cancelled', totalAmount: 1000 },
      ],
      sales_deals: () => [{ id: 'D1', team: 'KA', ownerId: 'u-1' }],
      quotations: () => [{ id: 'Q1', quoteNumber: 'QT-1', status: 'accepted', paymentPlan: null }],
      sales_order_installments: () => [
        { id: 'I1', salesOrderId: 'SOR-1', seq: 1, status: 'pending', amount: 500, billingDate: '2026-10-05', dueDate: '2026-11-04', updatedAt: 'u1' },
        { id: 'I2', salesOrderId: 'SOR-1', seq: 2, status: 'pending', amount: 500, billingDate: null, dueDate: '2026-12-01', updatedAt: 'u2' },
      ],
    },
  });
  const res = await call({ billingRule: { v: 4, need: 'none' }, baseUpdatedAt: null });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(seen, ['is.null'], 'ยังไม่เคยตั้ง ⇒ .is(null) (eq.null ไม่ตรงแถวไหนเลย)');
  assert.equal(res.body.unchanged, false);
  assert.deepEqual(res.body.ruleChange.rows.map((r) => [r.id, r.change, r.billingDate, r.dueDate, r.salesOrderCode, r.updatedAt]),
    [['I1', 'clearBilling', null, '2026-11-04', 'SO-26090001-0', 'u1']]);
  assert.deepEqual(res.body.ruleChange.same.map((r) => r.id), ['I2']);
  const orderQuery = calls.find((c) => c.table === 'sales_orders');
  assert.equal(orderQuery.params.get('customerId'), 'eq.CUS-1');
  assert.equal(calls.filter((c) => c.table === 'sales_order_installments' && c.method !== 'GET').length, 0,
    'บันทึกกติกาไม่แตะงวด — คนยืนยันที่จอ "งวดที่วันจะเปลี่ยน"');
  const audit = calls.find((c) => c.table === 'audit_logs');
  assert.match(audit.body.summary, /^ตั้งกำหนดวางบิลของลูกค้า AR-001 ลูกค้าทดสอบ: — → ไม่ต้องวางบิล$/);
});

test('⭐ ตารางวันที่ไม่ใช่ปฏิทินรายสัปดาห์ — จอกว้าง 8 คอลัมน์ · มือถือ 6 · ห้าม 7', () => {
  const css = fs.readFileSync(path.join(WEBAPP, 'src/components/database/CustomerBillingRule.module.css'), 'utf8');
  const cols = [...css.matchAll(/--cols:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(cols, [8, 6]);
  const grid = code('src/components/database/CustomerBillingRuleDayGrid.js');
  assert.equal(/อา\.|จ\.|weekday|getUTCDay|getDay/.test(grid), false, 'ตารางวันที่ต้องไม่มีความหมายวันในสัปดาห์');
});

/* มติ 28/09 ข้อ 17 ("ไม่มีเครดิต" = ชำระวันวางบิล) และ review 28/09 ("ห้ามพูด เครดิต 0 วัน") ของการ์ด/โมดัล —
   ย้ายไปเป็นยามรุ่นสี่ที่ src/components/database/CustomerBillingRule.test.mjs (โมดัลรุ่นสี่ไม่มีสวิตช์เครดิตแล้ว) */
