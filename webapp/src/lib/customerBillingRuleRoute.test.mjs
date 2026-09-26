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
  assert.match(src, /normalizeBillingRule\(body\.billingRule\)/, 'ตรวจรูปด้วยตัวเดียวกับโมดัล');
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

test('ป้ายยืนยันการล้างรอบสัญญาว่ารอบเดิมอยู่ใน "ความเคลื่อนไหว" · ไม่อ้างประวัติที่แอดมินเท่านั้นเปิดได้', () => {
  const src = fs.readFileSync(path.join(WEBAPP, 'src/components/database/CustomerBillingRuleModal.js'), 'utf8');
  const detail = src.match(/detail: "([^"\\]*(?:\\.[^"\\]*)*)"/)?.[1] || '';
  assert.match(detail, /ความเคลื่อนไหว/);
  assert.equal(/บันทึกการแก้ไขของระบบ|ประวัติการแก้ไข/.test(detail), false);
  // route บอกว่าลงเธรดไม่สำเร็จ ⇒ โมดัลต้องไม่ขึ้น "ลงความเคลื่อนไหวแล้ว"
  assert.match(src, /activityLogged === false/);
});

test('ลงเธรดไม่สำเร็จ ⇒ ทักพิมพ์รอบเดิมให้เห็นเลย · ไม่ชี้ไปบันทึกของระบบที่ฝ่ายขาย/บัญชีเปิดไม่ได้', () => {
  const src = code('src/components/database/CustomerBillingRuleModal.js');
  const branch = src.slice(src.indexOf('activityLogged === false'), src.indexOf('} else {', src.indexOf('activityLogged === false')));
  assert.match(branch, /describeBillingRule\(customer\?\.billingRule\)/, 'รอบเดิม = แถวก่อนบันทึก (หน้าแม่เติมค่าใหม่ทีหลัง)');
  assert.match(branch, /RESPONSE_WARNING_TOAST/, 'ค้างนานพอให้จดทัน — ทักปกติหาย 3.6 วิ');
  assert.equal(/บันทึกการแก้ไขของระบบ|ประวัติการแก้ไข|audit/.test(src), false, 'ห้ามสัญญาที่ที่คนกดเปิดไม่ได้');
  // สำเร็จ = พูดแบบเดียวกับป้ายยืนยัน ("รอบเดิมยังดูย้อนได้ในความเคลื่อนไหว")
  assert.match(src, /"ล้างเครดิตและรอบวางบิลแล้ว · ค่าเดิมยังดูย้อนได้ในความเคลื่อนไหว"/);
});

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

test('ฐานยังไม่รัน 0390 (ตัวตรวจรุ่นแรก) = บอกทางแก้ ไม่ใช่ "กรอกผิด" · 23514 ตัวอื่นไม่ส่งคนไปรอ migration', () => {
  const src = code(ROUTE);
  const start = src.indexOf("updateError.code === '23514'");
  const other = src.indexOf("updateError.code === '23514'", start + 1);
  assert.ok(start > 0 && other > start, 'ต้องมีสองทาง: CHECK ของรอบวางบิล · 23514 ตัวอื่น');
  const shape = src.slice(start, other);
  assert.match(shape, /customers_billing_rule_shape/, '"รอรัน 0390" ต้องผูกกับ CHECK ของรอบวางบิลเท่านั้น');
  assert.match(shape, /0390/);
  assert.match(shape, /status: 503/);
  // หลังรัน 0390 แล้ว 23514 ที่เหลือ (CHECK อื่นของแถว · โค้ดกับฐานเดินไม่ตรงกัน) ต้องไม่พูดถึง 0390
  const rest = src.slice(other, src.indexOf("updateError.code === 'PGRST204'"));
  assert.match(rest, /updateError\.message/);
  assert.equal(/0390|503/.test(rest), false);
});

/* ── route ตัวจริง (ไม่ใช่อ่านซอร์ส): รอบรูปรุ่นแรกในฐาน + บันทึกซ้ำเป็นรุ่นสอง = ไม่มีอะไรเปลี่ยน ──────────────
   ⭐ ด่าน unchanged ของ route เทียบ `billingRuleOf(ค่าในฐาน)` กับค่าที่ส่งมาหลัง normalize — ถ้าสองตัวนี้เดินไม่ตรงกัน
      ลูกค้า 0389 ทุกรายที่ถูกเปิดโมดัลแล้วกดบันทึกเฉย ๆ จะได้ "แก้ล่าสุดโดย" คนที่แค่เปิดดู + แถวปลอมในเธรด
   ไม่มีฐานจริง: fetch ปลอมตอบแถวลูกค้า · ผู้ใช้ = devBypass (ไม่ตั้ง NEXT_PUBLIC_SUPABASE_*) · next/headers ต่อเป็นโมดูลว่าง
   (raw Node แกะ subpath ของ next ไม่ได้ และทาง devBypass ไม่เรียก cookies()) */
test('⭐ route: รอบรูปรุ่นแรก (0389) ในฐาน + บันทึกเป็นรุ่นสองตัวเดียวกัน = unchanged:true · ไม่เขียนอะไรเลย', async (t) => {
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

  const row = {
    id: 'CUS-1', arCode: 'AR-001', name: 'ลูกค้าทดสอบ', teams: ['KA'],
    billingRule: { billing: { mode: 'monthly', day: 5 }, payment: { mode: 'monthly', day: 25, monthOffset: 0 }, note: 'แนบสำเนา PO' },
    billingRuleUpdatedAt: '2026-09-25T03:00:00.000Z', billingRuleUpdatedById: 'u-old', billingRuleUpdatedByName: 'คนตั้งเดิม',
  };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    calls.push(`${method} ${new URL(url).pathname}`);
    if (method === 'GET' && url.includes('/rest/v1/customers')) {
      return new Response(JSON.stringify([row]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ message: `ไม่ควรถูกเรียก: ${method} ${url}` }), { status: 500, headers: { 'content-type': 'application/json' } });
  });

  const { PATCH } = await import('../app/api/customers/[id]/billing-rule/route.js');
  const v2 = { billing: { mode: 'monthly', days: [5] }, payment: { mode: 'monthly', rounds: [{ day: 25, monthOffset: 0 }] }, note: 'แนบสำเนา PO' };
  const res = await PATCH(
    new Request('http://localhost/api/customers/CUS-1/billing-rule', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ billingRule: v2 }),
    }),
    { params: Promise.resolve({ id: 'CUS-1' }) },
  );
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.unchanged, true);
  assert.equal(body.billingRuleUpdatedByName, 'คนตั้งเดิม', '"แก้ล่าสุดโดย" ต้องยังเป็นคนเดิม');
  assert.deepEqual(calls, ['GET /rest/v1/customers'], 'อ่านแถวเดียว — ห้าม PATCH ลูกค้า · ห้ามลง audit_logs / entity_updates');
});

test('⭐ ตารางวันที่ไม่ใช่ปฏิทินรายสัปดาห์ — จอกว้าง 8 คอลัมน์ · มือถือ 6 · ห้าม 7', () => {
  const css = fs.readFileSync(path.join(WEBAPP, 'src/components/database/CustomerBillingRule.module.css'), 'utf8');
  const cols = [...css.matchAll(/--cols:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(cols, [8, 6]);
  const grid = code('src/components/database/CustomerBillingRuleDayGrid.js');
  assert.equal(/อา\.|จ\.|weekday|getUTCDay|getDay/.test(grid), false, 'ตารางวันที่ต้องไม่มีความหมายวันในสัปดาห์');
});
