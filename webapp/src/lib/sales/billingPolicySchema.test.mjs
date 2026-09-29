// ── เทสต์ด่านลำดับ deploy ของ "ต้องวางบิลไหม" (mig 0393) + รูปของไฟล์ migration ─────────────────────────────
// ⭐ ตัวแปล error ต้องบอก "รอรัน migration 0393" เฉพาะเรื่องของ 0393 — error อื่นคืน null (ห้ามส่งคนไปรันมิกผิดตัว)
// ⭐ ไฟล์ 0393 ต้องเป็น DDL ล้วน · กิ่งรุ่นสี่มาก่อนกิ่งรุ่นเดิม · ไม่มีของช่วง 2b/5 (ผลจริงบนฐานทดลองตรวจด้วย PGlite ตอนเขียน)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BILLING_V4_MIGRATION, BILLING_V4_SCHEMA_MISSING, billingSkipReadyOf, billingV4SchemaError, probeBillingSkip,
} from './billingPolicySchema.js';

const SQL = readFileSync(new URL('../../../supabase/migrations/0393_billing_rule_v4.sql', import.meta.url), 'utf8');
/* ตัดคอมเมนต์ (หัวไฟล์มี SELECT ตัวอย่าง/คำอธิบาย) — ตรวจเฉพาะคำสั่งที่รันจริง */
const CODE = SQL.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');

test('billingV4SchemaError — 23514 ของ CHECK กติกาลูกค้า · คอลัมน์ billingSkip หาย = "รอรัน migration 0393" · อย่างอื่น = null', () => {
  assert.equal(BILLING_V4_MIGRATION, '0393');
  assert.match(BILLING_V4_SCHEMA_MISSING, /รอรัน migration 0393/);
  const shape = { code: '23514', message: 'new row for relation "customers" violates check constraint "customers_billing_rule_shape"' };
  assert.equal(billingV4SchemaError(shape), BILLING_V4_SCHEMA_MISSING);
  assert.equal(billingV4SchemaError({ code: 'PGRST204', message: "Could not find the 'billingSkip' column of 'sales_order_installments' in the schema cache" }), BILLING_V4_SCHEMA_MISSING);
  assert.equal(billingV4SchemaError({ code: '42703', message: 'column sales_order_installments.billingSkip does not exist' }), BILLING_V4_SCHEMA_MISSING);
  assert.equal(billingV4SchemaError({ code: '23514', message: 'violates check constraint "sales_order_installments_billing_sane"' }), null, 'CHECK ตัวอื่นไม่ใช่เรื่องของ 0393');
  assert.equal(billingV4SchemaError({ code: 'PGRST204', message: "Could not find the 'refundedAt' column" }), null, 'คอลัมน์ของ 0378 ไม่ใช่เรื่องของ 0393');
  assert.equal(billingV4SchemaError({ code: '42703', message: 'column customers.billingRule does not exist' }), null, 'คอลัมน์ของ 0389 ไม่ใช่เรื่องของ 0393');
  assert.equal(billingV4SchemaError(null), null);
});

test('probeBillingSkip — ไม่มีคอลัมน์ (42703/PGRST204) = ยังไม่พร้อม · อ่านพลาดอย่างอื่นไม่โทษ migration', async () => {
  const fake = (error) => ({
    from(table) {
      assert.equal(table, 'sales_order_installments');
      return { select(cols) { assert.equal(cols, 'billingSkip'); return { limit: async () => ({ data: error ? null : [], error }) }; } };
    },
  });
  assert.deepEqual(await probeBillingSkip(fake(null)), { ready: true });
  assert.deepEqual(await probeBillingSkip(fake({ code: '42703', message: 'column does not exist' })), { ready: false });
  assert.deepEqual(await probeBillingSkip(fake({ code: 'PGRST204', message: 'x' })), { ready: false });
  assert.deepEqual(await probeBillingSkip(fake({ code: '08006', message: 'connection failure' })), { ready: true });
});

test('billingSkipReadyOf — อ่านจากแถวงวดที่ select(*) แล้ว · ไม่มีงวด = null (ให้ถาม probe)', () => {
  assert.equal(billingSkipReadyOf([{ id: 'a', billingSkip: null }]), true);
  assert.equal(billingSkipReadyOf([{ id: 'a', billingDate: null }]), false);
  assert.equal(billingSkipReadyOf([]), null);
  assert.equal(billingSkipReadyOf(null), null);
});

test('⭐ 0393 เป็น DDL ล้วน รันซ้ำได้ — ไม่มี UPDATE/INSERT/DELETE · CREATE OR REPLACE · ADD COLUMN IF NOT EXISTS · ในทรานแซกชันเดียว', () => {
  assert.doesNotMatch(CODE, /\b(UPDATE|INSERT|DELETE|TRUNCATE)\b/i, 'backfill เป็นสคริปต์แยก ต้องได้คำยินยอมของเจ้าของก่อน');
  assert.match(CODE, /^BEGIN;/m);
  assert.match(CODE, /^COMMIT;/m);
  assert.match(CODE, /ALTER TABLE public\.sales_order_installments\s+ADD COLUMN IF NOT EXISTS "billingSkip" boolean;/);
  for (const fn of ['jsonb_run_rounds_ok', 'jsonb_weekday_runs_ok', 'jsonb_time_ok', 'jsonb_billing_calendar_ok', 'customer_billing_rule_v4_ok', 'customer_billing_rule_ok']) {
    assert.match(CODE, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`), fn);
    assert.match(CODE, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(jsonb\\) FROM anon, authenticated;`), `REVOKE ${fn}`);
  }
  assert.doesNotMatch(CODE, /dueEstimatedAs/, 'รอยประมาณการเป็นช่วง 2b (รอมติ ข้อ 3)');
  assert.doesNotMatch(CODE, /ADD CONSTRAINT/, 'ไม่มี CHECK ใหม่ระดับแถว (billingSkip ไม่ผูกคอลัมน์อื่น · CHECK รอเหตุการณ์เป็นช่วง 5)');
});

test('⭐ 0393 กิ่งรุ่นสี่มาก่อนกิ่งรุ่นเดิม · กิ่งรุ่นหนึ่ง/สองคงไว้ · ตัวตรวจรุ่นสี่ไม่รับธง legacyNoCredit', () => {
  const main = CODE.slice(CODE.indexOf('CREATE OR REPLACE FUNCTION public.customer_billing_rule_ok('));
  const at = (needle) => main.indexOf(needle);
  assert.ok(at("WHEN r ? 'v' THEN public.customer_billing_rule_v4_ok(r)") > 0);
  assert.ok(at("WHEN r ? 'v'") < at("WHEN r ? 'credit'"), 'ก่อนกิ่งไม่มีเครดิต');
  assert.ok(at("WHEN r ? 'v'") < at("jsonb_typeof(r -> 'payment') IS DISTINCT FROM 'object'"), 'ก่อนกิ่ง billing/payment ต้องเป็น object');
  assert.ok(at('jsonb_pay_rounds_ok') > 0 && at("r #> '{billing,day}'") > 0, 'รุ่นหนึ่ง/สองยังรับ');
  const v4 = CODE.slice(CODE.indexOf('FUNCTION public.customer_billing_rule_v4_ok('), CODE.indexOf('FUNCTION public.customer_billing_rule_ok('));
  assert.match(v4, /NOT IN \('v', 'need', 'billing', 'creditDays', 'runs', 'note'\)/);
  assert.doesNotMatch(v4, /legacyNoCredit/);
});
