// ── ยาม SQL ของ 0412 · ใบสั่งขาย "นับ Actual ทั้งใบ / รายงวด" (มติเจ้าของ 26/10 · docs/so-installment-actual.md) ──────────
// ⭐ พฤติกรรมจริงพิสูจน์ด้วย PGlite นอก repo (โหลด schema + 0001–0411 จากไฟล์จริง → รัน 0412 สองรอบ · เทียบคู่ sync เก่า/ใหม่
//    ของใบทั้งใบทุกตัวอักษร · ตัวห่อ · start · ยื่น/อนุมัติ/ตีกลับ/ดึงกลับ · ส่วนแบ่งรวม = actualAmount · ย้อนอนุมัติ/ออก Rev./ยกเงิน ·
//    นับที่เหลือ · ตัวล็อกปรับแผน · enforce) — ไฟล์นี้ตรึง "รูป" ที่ห้ามไหลกลับ เพราะ npm test ไม่มีฐาน
// ⚠️ อ่าน source เป็นสตริง (ตัดคอมเมนต์ก่อน) ⇒ พิสูจน์แค่ "รูปนี้ยังอยู่" — ของจริงอยู่ที่ฮาร์เนส
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { WORKFLOW_ERROR_CODES } from './documentWorkflowErrors.js';
import { INSTALLMENT_ACTUAL_AUTO_NOTE } from './salesOrderActualMode.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE = '0412_so_installment_actual.sql';
const sqlFiles = () => readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const squeeze = (text) => stripComments(text).replace(/\s+/g, ' ').trim();

const RAW = read(FILE);
const CODE = stripComments(RAW);
const HEADER = RAW.slice(0, RAW.indexOf('\nBEGIN;'));

/* นิยามในไฟล์นี้ (ตัวหลังสุดถ้ามีหลายตัว) — ตัดคอมเมนต์แล้ว */
function fnBody(name) {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const from = CODE.lastIndexOf(marker);
  assert.ok(from >= 0, `${FILE} ไม่มีนิยาม ${name}`);
  const to = CODE.indexOf('\n$$;', from);
  assert.ok(to > from, `หาปลายนิยาม ${name} ไม่เจอ`);
  return CODE.slice(from, to);
}

/* นิยามล่าสุดข้ามทุก migration (ไฟล์ใหม่กว่าทับ) */
function latestDefinitionOf(name) {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const owner = sqlFiles().filter((n) => read(n).includes(marker)).at(-1);
  assert.ok(owner, `ไม่มี migration ที่นิยาม ${name}`);
  const text = read(owner);
  const from = text.lastIndexOf(marker);
  return { file: owner, body: stripComments(text.slice(from, text.indexOf('\n$$;', from))) };
}

const SYNC = fnBody('sync_sales_order_actual');
const ENFORCE = fnBody('enforce_sales_order_actual_on_deal');
const EXTRAS = fnBody('_deal_so_actual_extras');
const SHARE = fnBody('_so_installment_actual_share');
const ESTIMATES = fnBody('_so_installment_actual_estimates');
const REFRESH = fnBody('_so_installment_actual_refresh');
const AFTER = fnBody('so_installment_actual_after');
const GUARD = fnBody('so_installment_actual_confirm_guard');
const MODE = fnBody('sales_order_actual_mode_guard');
const WRAP = fnBody('approve_sales_order_with_actual_mode');
const START = fnBody('start_sales_order_installment_actual');
const ACTION = fnBody('sales_order_installment_actual_action');
const REST = fnBody('count_rest_sales_order_installment_actual');
const LOCK8 = fnBody('_so_installment_replan_locked');
const DELETE_GUARD = fnBody('so_installment_actual_delete_guard');
const AUTOCOUNT = fnBody('so_installment_actual_autocount');
const RPCS = [WRAP, START, ACTION, REST];

// ═══ 1) ตัวไฟล์: ลำดับรัน · ลองก่อนรัน · ตรวจหลังรัน · รันซ้ำได้ · ไม่ backfill ═══════════════════════════════════

test('0412: หัวไฟล์บอกลำดับรัน · DDL มือ · บล็อกลองแบบ ROLLBACK · คำสั่งตรวจหลังรัน (ทุกดีลไม่ขยับ) · วิธีถอย', () => {
  assert.match(HEADER, /รันไฟล์นี้ก่อน deploy โค้ด JS/);
  assert.match(HEADER, /DDL — รันมือบน Supabase SQL Editor/);
  assert.match(HEADER, /--\s+BEGIN;[\s\S]*start_sales_order_installment_actual[\s\S]*--\s+ROLLBACK;/);
  assert.match(HEADER, /ตรวจหลังรัน/);
  assert.match(HEADER, /has_function_privilege/);
  // ③ เทียบ wonValue / wonMonth / ยอดรออนุมัติที่เก็บไว้กับค่าที่คู่ sync ตัวใหม่คิดได้ — คาด 0 ต่าง
  assert.match(HEADER, /won_value_diff = 0 · won_month_diff = 0 · pending_diff = 0/);
  assert.match(HEADER, /ถอยกลับ/);
  assert.match(RAW, /^BEGIN;$/m);
  assert.match(RAW, /^COMMIT;\s*NOTIFY pgrst, 'reload schema';\s*$/m);
});

test('0412: รันซ้ำได้ — ADD COLUMN IF NOT EXISTS · DROP … IF EXISTS ก่อน ADD/CREATE · CREATE OR REPLACE เท่านั้น', () => {
  for (const m of CODE.matchAll(/ADD COLUMN(?! IF NOT EXISTS)/g)) assert.fail(`ADD COLUMN ไม่มี IF NOT EXISTS ที่ ${m.index}`);
  for (const m of CODE.matchAll(/ADD CONSTRAINT ([a-z0-9_]+)/g)) {
    const drop = CODE.indexOf(`DROP CONSTRAINT IF EXISTS ${m[1]};`);
    assert.ok(drop >= 0 && drop < m.index, `${m[1]}: ต้อง DROP CONSTRAINT IF EXISTS ก่อน ADD`);
  }
  for (const m of CODE.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER ([a-z0-9_]+)/g)) {
    const drop = CODE.indexOf(`DROP TRIGGER IF EXISTS ${m[1]} `);
    assert.ok(drop >= 0 && drop < m.index, `${m[1]}: ต้อง DROP TRIGGER IF EXISTS ก่อน CREATE`);
  }
  assert.doesNotMatch(CODE, /CREATE FUNCTION/, 'ฟังก์ชันต้อง CREATE OR REPLACE');
  assert.doesNotMatch(CODE, /CREATE (UNIQUE )?INDEX/, 'ไม่มีดัชนีใหม่');
  // แพตช์มีป้าย/นับซ้ำ ⇒ รอบสองข้าม "ปะไว้แล้ว"
  assert.match(CODE, /RAISE NOTICE '0412: % — ปะไว้แล้ว'/);
});

test('0412: ไม่ backfill — นอกตัวฟังก์ชัน/บล็อก DO ไม่มี INSERT/UPDATE/DELETE (ห้ามวนคิดทุกดีลใหม่ · บทเรียน 0353)', () => {
  const outside = CODE.replace(/(\$[A-Za-z_]*\$)[\s\S]*?\1/g, ' ');
  assert.doesNotMatch(outside, /\b(INSERT INTO|UPDATE|DELETE FROM)\s+public\./);
  // บล็อก DO ไม่เขียนข้อมูล (§0 อ่านแค็ตตาล็อก · แพตช์ EXECUTE นิยามฟังก์ชัน · §8 ตรวจ)
  for (const m of CODE.matchAll(/DO (\$[a-z]+\$)([\s\S]*?)\1/g)) {
    assert.doesNotMatch(m[2], /\b(INSERT INTO|UPDATE|DELETE FROM)\s+public\./, `DO ${m[1]} เขียนข้อมูล`);
  }
});

test('0412: คอลัมน์ใหม่ตามสัญญา — ALTER TABLE ชั้นนอกคำสั่งเดียวต่อตาราง (ยามคอลัมน์ Rev./ใบร่างมองเห็น)', () => {
  const cols = (table) => {
    const blocks = [...CODE.matchAll(new RegExp(`ALTER TABLE public\\.${table}\\s+ADD COLUMN([\\s\\S]*?);`, 'g'))];
    assert.equal(blocks.length, 1, `${table}: ADD COLUMN คำสั่งเดียว`);
    return [...blocks[0][0].matchAll(/ADD COLUMN IF NOT EXISTS "([A-Za-z]+)" ([a-z]+)([^,;]*)/g)]
      .map((m) => `${m[1]} ${m[2]}${m[3].trim() ? ` ${m[3].trim()}` : ''}`);
  };
  assert.deepEqual(cols('sales_orders'), [
    "actualMode text NOT NULL DEFAULT 'order'",
    'actualCountedAmount numeric NOT NULL DEFAULT 0',
    'actualSubmittedAmount numeric NOT NULL DEFAULT 0',
  ]);
  assert.deepEqual(cols('sales_order_installments'), [
    'actualStatus text', 'actualSubmittedAt timestamptz', 'actualSubmittedById text', 'actualSubmittedByName text',
    'actualApprovedAt timestamptz', 'actualApprovedById text', 'actualApprovedByName text', 'actualApprovedVia text',
    'actualRejectedAt timestamptz', 'actualRejectedById text', 'actualRejectedByName text', 'actualRejectedReason text',
    'actualAmount numeric', 'actualNote text',
  ]);
  assert.doesNotMatch(CODE, /EXECUTE\s+format/i, 'DDL ผ่าน EXECUTE format = ยามอ่านไม่เห็น');
});

test('0412: CHECK — แบบ (รายงวดเฉพาะใบ pipeline ที่ผ่านการอนุมัติ) · รูปของงวด · cache ไม่ติดลบ', () => {
  const chk = (name) => squeeze(CODE.slice(CODE.indexOf(`ADD CONSTRAINT ${name}`), CODE.indexOf(';', CODE.indexOf(`ADD CONSTRAINT ${name}`))));
  const mode = chk('sales_orders_actual_mode_valid');
  assert.match(mode, /"actualMode" IN \('order', 'installment'\)/);
  assert.match(mode, /"actualMode" = 'order' OR \(origin = 'pipeline' AND status NOT IN \('draft', 'pending_approval', 'rejected'\)\)/);
  assert.match(chk('sales_orders_actual_cache_sane'), /"actualCountedAmount" >= 0 AND "actualSubmittedAmount" >= 0/);
  const shape = chk('sales_order_installments_actual_shape');
  for (const piece of [
    `"actualStatus" IN ('submitted', 'approved', 'rejected')`,
    `"actualApprovedVia" IN ('so_approval', 'review', 'count_rest')`,
    `("actualStatus" IS NULL AND "actualApprovedAt" IS NULL AND "actualAmount" IS NULL AND "actualApprovedVia" IS NULL)`,
    `("actualStatus" = 'submitted' AND "actualSubmittedAt" IS NOT NULL AND "actualApprovedAt" IS NULL AND "actualAmount" IS NULL`,
    `("actualStatus" = 'approved' AND "actualApprovedAt" IS NOT NULL AND "actualAmount" IS NOT NULL AND "actualAmount" >= 0 AND "actualApprovedVia" IS NOT NULL`,
    `("actualApprovedVia" <> 'count_rest' OR length(btrim(COALESCE("actualNote", ''))) >= 10)`,
    `("actualStatus" = 'rejected' AND "actualRejectedAt" IS NOT NULL AND length(btrim(COALESCE("actualRejectedReason", ''))) >= 10`,
    `("actualNote" IS NULL OR length("actualNote") <= 500)`,
  ]) assert.ok(shape.includes(piece), `actual_shape ขาด: ${piece}`);
});

// ═══ 2) คู่ sync / enforce — ใบทั้งใบค่าเดิมทุกตัวอักษร + คีย์ใหม่ ═══════════════════════════════════════════════

test('คู่ sync/enforce: นิยามล่าสุดอยู่ใน 0412 ทั้งคู่ (แก้ข้างเดียวไม่ได้)', () => {
  assert.equal(latestDefinitionOf('sync_sales_order_actual').file, FILE);
  assert.equal(latestDefinitionOf('enforce_sales_order_actual_on_deal').file, FILE);
  for (const fn of ['sync_sales_order_actual', 'enforce_sales_order_actual_on_deal']) {
    assert.equal(RAW.split(`CREATE OR REPLACE FUNCTION public.${fn}(`).length - 1, 1, `${fn} ต้องมีนิยามเดียว`);
  }
});

test('คู่ sync/enforce คิดเหมือนกันทุกตัวอักษร (ตัด alias so. / NEW.id / ปลายทางที่เขียน)', () => {
  const calc = (body, { endAt, alias }) => squeeze(body.slice(body.indexOf('DECLARE'), body.indexOf(endAt)))
    .replaceAll(`${alias}.`, '').replaceAll(` ${alias} `, ' ').replaceAll('NEW.id', 'p_deal_id');
  assert.equal(calc(SYNC, { endAt: 'UPDATE public.sales_deals', alias: 'so' }),
    calc(ENFORCE, { endAt: 'NEW."wonValue" :=', alias: 'so' }));
  const stripped = (body) => [...squeeze(body).matchAll(/- '([A-Za-z]+)'/g)].map((m) => m[1]);
  const keys = ['soPendingAmount', 'soPendingCount', 'actualByMonth', 'soInstPendingAmount', 'soInstPendingCount', 'soInstRemainingByDue'];
  assert.deepEqual(stripped(SYNC), keys, 'sync ถอดคีย์ระบบทุกตัวก่อนเขียนใหม่');
  assert.deepEqual(stripped(ENFORCE), keys, 'enforce ถอดคีย์ระบบทุกตัวก่อนเขียนใหม่');
  for (const body of [SYNC, ENFORCE]) assert.match(body, /\|\| COALESCE\(v_keys, '\{\}'::jsonb\)/);
});

test('คู่ sync/enforce: ใบทั้งใบ = สูตรเดิม · เดือน = อนุมัติใบล่าสุด (ทุกแบบ) · ยอดงวดบวกเฉพาะเมื่อมี', () => {
  for (const [name, body] of [['sync', SYNC], ['enforce', ENFORCE]]) {
    // Σ ใบทั้งใบ (FILTER) · max(approvedAt เวลาไทย) ของทุกใบที่อนุมัติ — ความหมายเดิมของ wonMonth
    assert.match(body, /COALESCE\(sum\((so\.)?"actualAmount"\) FILTER \(WHERE (so\.)?"actualMode" <> 'installment'\), 0\),\s*to_char\(max\(COALESCE\((so\.)?"approvedAt" AT TIME ZONE 'Asia\/Bangkok', (so\.)?"orderDate"::timestamp\)\), 'YYYY-MM'\)/, name);
    assert.match(body, /SELECT x\.counted, x\.keys INTO v_counted, v_keys FROM public\._deal_so_actual_extras\((p_deal_id|NEW\.id)\) x;/, name);
    // NULL = ไม่มีงวดที่นับ ⇒ ไม่บวกอะไร (ค่าและจำนวนทศนิยมของใบทั้งใบเท่าเดิม)
    assert.match(body, /IF v_counted IS NOT NULL THEN\s+v_actual := v_actual \+ v_counted;\s+END IF;/, name);
    assert.doesNotMatch(body, /"actualCountedAmount"|"actualSubmittedAmount"/, `${name}: คิดจากแถวงวดตรง ไม่อ่าน cache`);
  }
});

test('_deal_so_actual_extras: ทุก SELECT จากใบกรองใบอนุมัติสาย pipeline · เดือนตามสัญญา · คีย์มีเมื่อมีของ', () => {
  const clauses = [...EXTRAS.matchAll(/FROM public\.sales_orders o[\s\S]*?(?:;|\) e|\) r|\) m)/g)].map((m) => m[0]);
  assert.ok(clauses.length >= 5, `เจอ ${clauses.length} ก้อน`);
  for (const c of clauses) assert.match(c, /o\.status = 'approved' AND o\.origin = 'pipeline'/, c.slice(0, 120));
  // ใบทั้งใบ = นิพจน์เดียวกับ wonMonth · งวด = GREATEST(อนุมัติงวด, อนุมัติใบ) เวลาไทย
  assert.match(EXTRAS, /to_char\(COALESCE\(o\."approvedAt" AT TIME ZONE 'Asia\/Bangkok', o\."orderDate"::timestamp\), 'YYYY-MM'\)/);
  assert.match(EXTRAS, /to_char\(GREATEST\(i\."actualApprovedAt", o\."approvedAt"\) AT TIME ZONE 'Asia\/Bangkok', 'YYYY-MM'\)/);
  assert.match(EXTRAS, /keys := jsonb_build_object\('actualByMonth', v_by_month\);/);
  assert.match(EXTRAS, /IF v_pending_count > 0 THEN\s+keys := keys \|\| jsonb_build_object\('soInstPendingAmount', v_pending, 'soInstPendingCount', v_pending_count\);/);
  assert.match(EXTRAS, /COALESCE\(to_char\(x\.due_date, 'YYYY-MM'\), 'none'\)/);
  assert.match(EXTRAS, /x\.actual_status IS NULL OR x\.actual_status = 'rejected'/);
  assert.match(EXTRAS, /IF v_remaining IS NOT NULL THEN/);
  /* 🐞 review 26/10: ใบรายงวดที่อนุมัติแล้วแต่ยังไม่มีงวด (ตัวหยุดยอดล้ม) = ยอดทั้งใบลง none — รวมกับ none ของใบอื่นเป็นคีย์เดียว
     (ฮาร์เนส PGlite ข้อ 15 พิสูจน์ค่าจริง: {none: 100000} · มีงวดแล้วย้ายตามงวด ไม่นับซ้ำ) */
  assert.match(EXTRAS, /UNION ALL\s+SELECT 'none', o\."actualAmount"\s+FROM public\.sales_orders o\s+WHERE o\."dealId" = p_deal_id AND o\.status = 'approved' AND o\.origin = 'pipeline'\s+AND o\."actualMode" = 'installment' AND COALESCE\(o\."actualAmount", 0\) > 0\s+AND NOT EXISTS \(SELECT 1 FROM public\.sales_order_installments i WHERE i\."salesOrderId" = o\.id\)/);
  assert.match(EXTRAS, /SELECT r\.due_month, sum\(r\.amount\) AS amount[\s\S]*GROUP BY r\.due_month/, 'รวมคีย์ซ้ำ (none ของสองทาง) ก่อน jsonb_object_agg');
  // ไม่มีใบอนุมัติ = ไม่มีคีย์ (keys ว่าง)
  assert.match(EXTRAS, /keys := '\{\}'::jsonb;\s+IF NOT EXISTS \([\s\S]*?\) THEN\s+RETURN;/);
});

test('ส่วนแบ่ง/ยอดประมาณ: round(amount × actual / total, 2) ไม่เกินคงเหลือ · งวดท้ายรับเศษ (คู่กับ salesOrderActualMode.js)', () => {
  const portion = /round\(GREATEST\(COALESCE\((v_row|r)\.amount, 0\), 0\) \* v_actual \/ v_total, 2\)/;
  assert.match(SHARE, portion);
  assert.match(ESTIMATES, portion);
  assert.match(SHARE, /i\.id <> v_row\.id AND i\."actualStatus" = 'approved'/);
  assert.match(SHARE, /i\."actualStatus" IS DISTINCT FROM 'approved'\s+\) THEN\s+RETURN v_left;/, 'งวดสุดท้ายที่ยังไม่นับ = คงเหลือทั้งหมด');
  assert.match(SHARE, /RETURN LEAST\(/);
  assert.match(ESTIMATES, /WHEN v_k = v_open THEN v_left/);
  assert.match(ESTIMATES, /ORDER BY i\.seq, i\.id/);
  assert.match(SHARE, /CASE WHEN v_total > 0 THEN/, 'ยอดใบ 0 = ส่วนแบ่ง 0 (ไม่หารศูนย์)');
});

// ═══ 3) trigger ═════════════════════════════════════════════════════════════════════════════════════════════

const ddl = (name) => squeeze(CODE.slice(CODE.indexOf(`CREATE TRIGGER ${name}`), CODE.indexOf(';', CODE.indexOf(`CREATE TRIGGER ${name}`))));

test('trigger Actual ของใบ (0279) สร้างใหม่ = คอลัมน์เดิมทุกตัว + "actualMode" · ฟังก์ชันของ 0108 คงเดิม', () => {
  assert.equal(ddl('sales_orders_sync_actual_trg'),
    'CREATE TRIGGER sales_orders_sync_actual_trg AFTER INSERT OR UPDATE OF status, "actualAmount", "orderDate", "approvedAt", "dealId", "actualMode" OR DELETE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.sales_order_actual_trigger()');
  assert.ok(!RAW.includes('CREATE OR REPLACE FUNCTION public.sales_order_actual_trigger('), 'ห้ามนิยาม sales_order_actual_trigger ใหม่');
  assert.doesNotMatch(CODE, /(DISABLE|ENABLE)(\s+REPLICA|\s+ALWAYS)?\s+TRIGGER/i);
  /* ไม่ลบฟังก์ชันใด (ตัวล็อก 6 พารามิเตอร์คงไว้) — ยกเว้นตัวเดียว: start รุ่น 4 พารามิเตอร์ของร่างก่อนหน้าไฟล์นี้เอง (review รอบสอง 26/10
     เพิ่ม p_counted_at · ไม่ DROP = สองตัวซ้อน ⇒ PostgREST เลือกไม่ได้ตอนเรียกด้วยสี่ชื่อ) */
  const drops = [...CODE.matchAll(/DROP\s+FUNCTION[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, ' '));
  assert.deepEqual(drops, ['DROP FUNCTION IF EXISTS public.start_sales_order_installment_actual(text, text, text, text);']);
});

test('trigger แบบของใบ: ร่าง/รออนุมัติ/ตีกลับ = order · cache คิดด้วยยอดของแถวที่กำลังเขียน · แก้เฉพาะช่องของตัวเอง', () => {
  assert.equal(ddl('sales_orders_actual_mode_trg'),
    'CREATE TRIGGER sales_orders_actual_mode_trg BEFORE INSERT OR UPDATE OF status, "actualAmount", "totalAmount" ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.sales_order_actual_mode_guard()');
  assert.match(MODE, /NEW\.status IN \('draft', 'pending_approval', 'rejected'\) AND NEW\."actualMode" IS DISTINCT FROM 'order' THEN\s+NEW\."actualMode" := 'order';/);
  assert.match(MODE, /_so_installment_actual_cache\(NEW\.id, NEW\."actualAmount", NEW\."totalAmount"\)/);
  const assigned = [...MODE.matchAll(/NEW\.("?[A-Za-z]+"?) :=/g)].map((m) => m[1]).sort();
  assert.deepEqual(assigned, ['"actualCountedAmount"', '"actualMode"', '"actualSubmittedAmount"']);
});

test('trigger งวด (ข้อยกเว้นของ installmentReplanMigration): ด่านรับรอง/ด่านลบปฏิเสธอย่างเดียว · AFTER ไม่แตะแถวงวด', () => {
  assert.equal(ddl('sales_order_installments_actual_guard'),
    `CREATE TRIGGER sales_order_installments_actual_guard BEFORE INSERT OR UPDATE OF status ON public.sales_order_installments FOR EACH ROW WHEN (NEW.status = 'confirmed') EXECUTE FUNCTION public.so_installment_actual_confirm_guard()`);
  assert.doesNotMatch(GUARD, /NEW\.[A-Za-z"]+ :=/, 'ด่านไม่เขียนทับแถว');
  assert.doesNotMatch(GUARD, /FOR (UPDATE|SHARE)/, 'ไม่ล็อกใบ (ลำดับล็อก ใบ → งวด)');
  assert.match(GUARD, /TG_OP = 'UPDATE' AND OLD\.status IS NOT DISTINCT FROM NEW\.status THEN\s+RETURN NEW;/, 'เฉพาะการเปลี่ยนเข้า confirmed');
  assert.match(GUARD, /v_mode = 'installment' AND NEW\."actualStatus" IS DISTINCT FROM 'approved' THEN\s+RAISE EXCEPTION 'installment_actual_not_approved';/);
  /* 🐞 review 26/10: ใบยกเลิกไม่ติดด่าน — รับรองแล้วคืนเงินได้ (ฮาร์เนสข้อ 16) · ใบย้อนอนุมัติยังกัน */
  assert.match(GUARD, /WHERE o\.id = NEW\."salesOrderId" AND o\.origin = 'pipeline' AND o\.status IS DISTINCT FROM 'cancelled';/);

  assert.equal(ddl('sales_order_installments_actual_sync'),
    'CREATE TRIGGER sales_order_installments_actual_sync AFTER INSERT OR UPDATE OF "actualStatus", "actualAmount", "actualApprovedAt", "salesOrderId", amount, "dueDate", seq OR DELETE ON public.sales_order_installments FOR EACH ROW EXECUTE FUNCTION public.so_installment_actual_after()');
  assert.doesNotMatch(AFTER + REFRESH, /UPDATE public\.sales_order_installments/, 'ไม่เขียนแถวงวด');
  assert.match(AFTER, /PERFORM public\._so_installment_actual_refresh\(NEW\."salesOrderId"\);/);
  assert.match(AFTER, /TG_OP = 'DELETE' OR \(TG_OP = 'UPDATE' AND OLD\."salesOrderId" IS DISTINCT FROM NEW\."salesOrderId"\)/, 'ใบเดิมเมื่อย้ายใบ/ลบ');
  // ใบถูกลบไปแล้ว (cascade) = ข้าม · cache เขียนเมื่อค่าเปลี่ยน ไม่แตะ updatedAt ของใบ · sync เฉพาะใบรายงวดที่อนุมัติ
  assert.match(REFRESH, /SELECT \* INTO v_order FROM public\.sales_orders WHERE id = p_order_id;\s+IF NOT FOUND THEN RETURN; END IF;/);
  assert.match(REFRESH, /IS DISTINCT FROM v_counted\s+OR v_order\."actualSubmittedAmount" IS DISTINCT FROM v_submitted THEN/);
  const write = REFRESH.slice(REFRESH.indexOf('UPDATE public.sales_orders'), REFRESH.indexOf(';', REFRESH.indexOf('UPDATE public.sales_orders')));
  assert.doesNotMatch(write, /"updatedAt"|status|"actualMode"/, 'cache อย่างเดียว');
  assert.match(REFRESH, /v_order\.status = 'approved' AND v_order\.origin = 'pipeline' AND v_order\."actualMode" = 'installment'\s+AND v_order\."dealId" IS NOT NULL THEN\s+PERFORM public\.sync_sales_order_actual\(v_order\."dealId"\);/);

  /* มติเจ้าของข้อ 9 (26/10): งวดที่นับแล้วปรับยอด/วันได้ ลบไม่ได้ — ด่านลบปฏิเสธอย่างเดียว · เฉพาะใบรายงวด pipeline ที่อนุมัติอยู่
     · ลบทั้งใบ (cascade) อ่านใบไม่เจอ = ผ่าน (ฮาร์เนสข้อ 11b/19d) · ไม่ล็อกใบ (ลำดับล็อก ใบ → งวด) */
  assert.equal(ddl('sales_order_installments_actual_delete_guard'),
    `CREATE TRIGGER sales_order_installments_actual_delete_guard BEFORE DELETE ON public.sales_order_installments FOR EACH ROW WHEN (OLD."actualStatus" = 'approved') EXECUTE FUNCTION public.so_installment_actual_delete_guard()`);
  assert.match(DELETE_GUARD, /WHERE o\.id = OLD\."salesOrderId" AND o\.origin = 'pipeline' AND o\.status = 'approved'\s+AND o\."actualMode" = 'installment'\s+\) THEN\s+RAISE EXCEPTION 'installment_actual_counted_row_delete';/);
  assert.match(DELETE_GUARD, /RETURN OLD;/);
  assert.doesNotMatch(DELETE_GUARD, /OLD\.[A-Za-z"]+ :=|FOR (UPDATE|SHARE)|UPDATE public\.|DELETE FROM/, 'ปฏิเสธอย่างเดียว · ไม่ล็อกใบ · ไม่เขียน');
});

/* มติเจ้าของข้อ 10 (26/10 "นับให้เอง ไม่ต้องยื่น") — ใบที่เคยกด "นับที่เหลือทั้งหมด" = นับทั้งก้อนถาวร: งวดที่โผล่ทีหลังนับให้ตอน COMMIT
   ⭐ ฮาร์เนส PGlite ข้อ 19c (ปรับแผน · ภายในทรานแซกชันยังไม่นับ) · 21 (ยกเงิน — รวมยกสองแถวที่แถวแรกรับ C2b) · 22 (Rev. → start) ·
     23 (ใบที่ไม่เข้าเงื่อนไขไม่ถูกแตะ) · 13 (deferrable/initially deferred ตัวเดียว) · probe: ตัวเดียวกันแบบ NOT DEFERRABLE ทำให้ยกเงินล้ม */
test('§5f มติข้อ 10: constraint trigger DEFERRABLE INITIALLY DEFERRED · อ่านแถวสดตอน COMMIT · เฉพาะใบรายงวดที่อนุมัติอยู่และมีงวด via count_rest · ข้อความเดียวกับ lib · ไม่วน', () => {
  const at = CODE.indexOf('CREATE CONSTRAINT TRIGGER sales_order_installments_actual_autocount');
  assert.ok(at >= 0, 'ต้องเป็น constraint trigger');
  assert.equal(squeeze(CODE.slice(at, CODE.indexOf(';', at))),
    `CREATE CONSTRAINT TRIGGER sales_order_installments_actual_autocount AFTER INSERT OR UPDATE OF "salesOrderId", "actualStatus" ON public.sales_order_installments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."actualStatus" IS DISTINCT FROM 'approved') EXECUTE FUNCTION public.so_installment_actual_autocount()`);
  assert.equal([...CODE.matchAll(/CREATE CONSTRAINT TRIGGER/g)].length, 1, 'constraint trigger ตัวเดียวของไฟล์');
  // อ่านแถวสดด้วย id (NEW = ภาพตอนเกิดเหตุ) · แถวหาย/นับแล้ว = ข้าม
  assert.match(AUTOCOUNT, /SELECT \* INTO v_row FROM public\.sales_order_installments WHERE id = NEW\.id;\s+IF NOT FOUND OR v_row\."actualStatus" = 'approved' THEN\s+RETURN NULL;/);
  // เงื่อนไขใบ = ร่วมของ RPC (pipeline · approved · installment · ไม่ถูกแทน)
  assert.match(AUTOCOUNT, /o\.id = v_row\."salesOrderId" AND o\.origin = 'pipeline' AND o\.status = 'approved'\s+AND o\."actualMode" = 'installment' AND o\."supersededById" IS NULL/);
  // สัญญาณ = งวดที่นับแล้ว via count_rest (ไม่มีคอลัมน์ใหม่ — ตัวเดียวกับ v_rest ของ start และ installmentActualCountRestDone ของ lib)
  assert.match(AUTOCOUNT, /c\."actualStatus" = 'approved' AND c\."actualApprovedVia" = 'count_rest'/);
  assert.match(AUTOCOUNT, /v_share := public\._so_installment_actual_share\(v_row\.id\);/, 'ส่วนแบ่งตัวเดียวกับทุกทางที่นับ');
  assert.match(AUTOCOUNT, /"actualApprovedVia" = 'count_rest',/);
  assert.ok(AUTOCOUNT.includes(`"actualNote" = '${INSTALLMENT_ACTUAL_AUTO_NOTE}',`), 'ข้อความ = INSTALLMENT_ACTUAL_AUTO_NOTE ของ lib');
  assert.match(AUTOCOUNT, /WHERE id = v_row\.id AND "actualStatus" IS DISTINCT FROM 'approved';/, 'รันซ้ำ = ไม่มีอะไรให้นับ');
  // เขียนเฉพาะแถวนั้น · ไม่ล็อกใบ · ไม่แตะ status (ด่านรับรอง §5b ไม่ยิง) · ไม่ลบ/แทรก
  assert.equal([...AUTOCOUNT.matchAll(/UPDATE public\.sales_order_installments/g)].length, 1);
  assert.doesNotMatch(AUTOCOUNT, /FOR (UPDATE|SHARE)|DELETE FROM|INSERT INTO|UPDATE public\.sales_orders/);
  const write = AUTOCOUNT.slice(AUTOCOUNT.indexOf('UPDATE public.sales_order_installments'));
  const set = [...write.slice(0, write.indexOf('WHERE')).matchAll(/("?[A-Za-z]+"?) = /g)].map((m) => m[1]);
  assert.deepEqual(set, ['"actualStatus"', '"actualAmount"', '"actualApprovedAt"', '"actualApprovedById"', '"actualApprovedByName"',
    '"actualApprovedVia"', '"actualNote"', '"updatedAt"'], 'เขียนเฉพาะช่อง Actual ของแถว (+ updatedAt) — ไม่แตะ status/ยอด/แผน');
  assert.match(AUTOCOUNT, /RETURN NULL;\s*END;?\s*$/);
});

// ═══ 4) RPC ═════════════════════════════════════════════════════════════════════════════════════════════════

test('ตัวห่อการอนุมัติ: พารามิเตอร์ 10 ตัวแรก = ตัวอนุมัติใบเดิม · เรียกตัวเดิมทั้งตัว · ไม่นิยามตัวเดิมใหม่', () => {
  const params = (body) => [...body.slice(body.indexOf('('), body.indexOf('RETURNS')).matchAll(/(p_[a-z_]+) ([a-z]+)( DEFAULT NULL)?/g)]
    .map((m) => `${m[1]} ${m[2]}${m[3] || ''}`);
  const original = latestDefinitionOf('approve_sales_order_with_signature_evidence_atomic');
  assert.notEqual(original.file, FILE);
  assert.deepEqual(params(WRAP), [...params(original.body), 'p_actual_mode text DEFAULT NULL']);
  assert.match(WRAP, /v_result := public\.approve_sales_order_with_signature_evidence_atomic\(\s*p_order_id, p_evidence_id, p_expected_updated_at, p_document_fingerprint, p_approval_note,\s*p_actor_id, p_actor_name, p_actor_role, p_actor_team, p_separation_override_reason\);/);
  // ตรวจแบบก่อนแตะอะไร · installment ต้องเป็นใบ pipeline ยอด > 0 · ตั้งแบบหลังตัวเดิมสำเร็จ (ทรานแซกชันเดียวกัน)
  assert.ok(WRAP.indexOf("RAISE EXCEPTION 'sales_order_actual_mode_invalid'") < WRAP.indexOf('FOR UPDATE'));
  assert.match(WRAP, /NOT COALESCE\(v_order\.origin = 'pipeline', false\) OR COALESCE\(v_order\."totalAmount", 0\) <= 0\) THEN\s+RAISE EXCEPTION 'sales_order_actual_mode_ineligible';/);
  assert.ok(WRAP.indexOf('v_result := public.approve_sales_order') < WRAP.indexOf('SET "actualMode" = v_mode'));
  assert.match(WRAP, /jsonb_set\(v_result, '\{document\}', to_jsonb\(v_order\)\)/, 'คืน document + evidence เหมือนตัวเดิม (approveWithEvidence ตรวจสองคีย์นี้)');
  // ทั้งใบ: ล้างช่อง Actual รายงวดที่งวดพามาจาก Rev. ของใบรายงวด (งวดที่ยื่นค้าง = ล็อกปรับแผนถาวร ถ้าไม่ล้าง) — ครบ 14 ช่อง
  const clear = WRAP.slice(WRAP.indexOf("IF v_mode = 'order' THEN"), WRAP.indexOf('END IF;', WRAP.indexOf("IF v_mode = 'order' THEN")));
  assert.match(clear, /UPDATE public\.sales_order_installments/);
  assert.match(clear, /WHERE "salesOrderId" = p_order_id/);
  assert.equal(new Set([...clear.matchAll(/"(actual[A-Za-z]+)" = NULL/g)].map((m) => m[1])).size, 14);
  // 🪤 ข้อความ "FUNCTION public.<ชื่อ>" ของฟังก์ชันที่รันอยู่ = ยามหลายตัวถือว่าไฟล์นี้เป็นเจ้าของนิยาม
  for (const fn of ['approve_sales_order_with_signature_evidence_atomic', '_so_installments_write_plan', 'carry_sales_order_installments',
    'revise_approved_sales_order_atomic', 'revoke_sales_order_approval_atomic', 'replan_sales_order_installments',
    'create_sales_order_draft', 'snapshot_sales_order_owner']) {
    assert.ok(!RAW.includes(`FUNCTION public.${fn}`), `0412 ห้ามมีข้อความ FUNCTION public.${fn}`);
  }
});

test('RPC: ลายเซ็นตามสัญญา · คืน jsonb · ไม่ใช่ SECURITY DEFINER · REVOKE PUBLIC/anon/authenticated · GRANT service_role', () => {
  const SIGS = {
    approve_sales_order_with_actual_mode: 'text, text, timestamptz, text, text, text, text, text, text, text, text',
    start_sales_order_installment_actual: 'text, text, text, text, timestamptz',
    sales_order_installment_actual_action: 'text, text, text, timestamptz, text, text, text',
    count_rest_sales_order_installment_actual: 'text, text, text, text, text',
    _so_installment_actual_share: 'text',
    _so_installment_actual_estimates: 'text, numeric, numeric',
    _so_installment_actual_cache: 'text, numeric, numeric',
    _deal_so_actual_extras: 'text',
    _so_installment_actual_refresh: 'text',
    _so_installment_replan_locked: 'text, text, text, text, jsonb, date, text, numeric',
  };
  for (const [fn, sig] of Object.entries(SIGS)) {
    const esc = `public.${fn}(${sig})`.replace(/[().]/g, '\\$&');
    assert.match(CODE, new RegExp(`REVOKE ALL ON FUNCTION ${esc} FROM PUBLIC, anon, authenticated;`), fn);
    assert.match(CODE, new RegExp(`GRANT EXECUTE ON FUNCTION ${esc} TO service_role;`), fn);
  }
  assert.match(ACTION, /\(\s*p_installment_id text,\s*p_action text,\s*p_reason text,\s*p_expected_updated_at timestamptz,\s*p_actor_id text,\s*p_actor_name text,\s*p_actor_role text\s*\)\s*RETURNS jsonb/);
  assert.match(START, /\(\s*p_order_id text,\s*p_actor_id text,\s*p_actor_name text,\s*p_actor_role text,\s*p_counted_at timestamptz DEFAULT NULL\s*\)\s*RETURNS jsonb/);
  /* review รอบสอง 26/10 (เส้นเดือน): เวลาที่นับของ start หนีบใน [approvedAt ของใบ, now()] · ไม่ส่ง = now() (ปุ่มกู้ = เดือนที่กด) */
  assert.match(START, /v_at := GREATEST\(v_order\."approvedAt", LEAST\(COALESCE\(p_counted_at, v_now\), v_now\)\);/);
  assert.match(START, /"actualApprovedAt" = v_at,/);
  assert.doesNotMatch(START, /"actualApprovedAt" = v_now/);
  assert.match(REST, /\(\s*p_order_id text,\s*p_reason text,\s*p_actor_id text,\s*p_actor_name text,\s*p_actor_role text\s*\)\s*RETURNS jsonb/);
  for (const body of [...RPCS, SHARE, ESTIMATES, EXTRAS, REFRESH, LOCK8]) assert.doesNotMatch(body, /SECURITY DEFINER/);
  // ตัว trigger: เรียกจาก trigger เท่านั้น (แพตเทิร์น 0387)
  for (const fn of ['sales_order_actual_mode_guard', 'so_installment_actual_confirm_guard', 'so_installment_actual_after',
    'so_installment_actual_delete_guard', 'so_installment_actual_autocount']) {
    assert.match(CODE, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated, service_role;`), fn);
  }
});

test('RPC: ผู้อนุมัติ = is_sales_manager_role (ไม่เขียนรายชื่อตำแหน่งเอง) · ใบ pipeline approved ไม่ถูกแทน · ใบรายงวด', () => {
  assert.doesNotMatch(CODE, /'(ae_supervisor|commercial_manager|commercial_director|senior_ae|ac_supervisor)'/);
  for (const body of [START, REST]) {
    assert.ok(body.indexOf('is_sales_manager_role(p_actor_role)') < body.indexOf('FOR UPDATE'), 'สิทธิ์ก่อนล็อกใบ');
  }
  for (const body of [START, ACTION, REST]) {
    assert.match(body, /NOT COALESCE\(v_order\.origin = 'pipeline', false\)\s+OR v_order\.status IS DISTINCT FROM 'approved'\s+OR v_order\."supersededById" IS NOT NULL THEN\s+RAISE EXCEPTION 'installment_actual_order_not_approved';/);
    assert.match(body, /v_order\."actualMode" IS DISTINCT FROM 'installment' THEN\s+RAISE EXCEPTION 'installment_actual_order_not_installment';/);
    assert.match(body, /RAISE EXCEPTION 'workflow_identity_required'/);
  }
  // ลำดับล็อก ใบ → งวด (เหมือนปรับแผน/ยกเงิน)
  assert.ok(ACTION.indexOf('FROM public.sales_orders WHERE id = v_order_id FOR UPDATE')
    < ACTION.indexOf('FROM public.sales_order_installments WHERE id = p_installment_id FOR UPDATE'));
  assert.match(ACTION, /p_expected_updated_at IS NOT NULL AND v_row\."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN\s+RAISE EXCEPTION 'installment_actual_stale';/);
});

test('RPC: กติกาของงวดตามสัญญา (submit · withdraw · approve · reject · start · count_rest)', () => {
  const branch = (name) => ACTION.slice(ACTION.indexOf(`v_action = '${name}'`), ACTION.indexOf('ELSIF', ACTION.indexOf(`v_action = '${name}'`) + 10));
  const submit = branch('submit');
  assert.match(submit, /public\.is_sales_manager_role\(p_actor_role\) OR \(v_owner IS NOT NULL AND v_owner = p_actor_id\)/, 'เจ้าของดีลปัจจุบัน หรือผู้จัดการ');
  assert.match(ACTION, /SELECT d\."ownerId" INTO v_owner FROM public\.sales_deals d WHERE d\.id = v_order\."dealId";/);
  assert.match(submit, /v_row\."actualStatus" IS NOT NULL AND v_row\."actualStatus" <> 'rejected'/);
  const prev = /i\.seq < v_row\.seq AND i\.status IS DISTINCT FROM 'confirmed'\) THEN\s+RAISE EXCEPTION 'installment_actual_previous_unconfirmed';/;
  assert.match(submit, prev);
  const withdraw = branch('withdraw');
  assert.match(withdraw, /v_row\."actualSubmittedById" IS NOT DISTINCT FROM p_actor_id OR COALESCE\(p_actor_role, ''\) = 'admin'/);
  assert.match(withdraw, /"actualStatus" = NULL,\s*"actualSubmittedAt" = NULL,\s*"actualSubmittedById" = NULL,\s*"actualSubmittedByName" = NULL/);
  const approve = branch('approve');
  assert.match(approve, /v_row\."actualSubmittedById" = p_actor_id AND COALESCE\(p_actor_role, ''\) <> 'admin' THEN\s+RAISE EXCEPTION 'installment_actual_self_approval';/);
  assert.match(approve, prev);
  assert.match(approve, /v_share := public\._so_installment_actual_share\(v_row\.id\);/);
  assert.match(approve, /"actualApprovedVia" = 'review'/);
  const reject = ACTION.slice(ACTION.lastIndexOf('ELSE'));
  assert.match(reject, /is_sales_manager_role\(p_actor_role\)[\s\S]*'installment_actual_bad_state'[\s\S]*length\(v_reason\) NOT BETWEEN 10 AND 500 THEN\s+RAISE EXCEPTION 'installment_actual_reason_required';[\s\S]*"actualStatus" = 'rejected'/);
  // start: งวดเลขน้อยสุด + งวด 0 บาท + งวดที่รับรองแล้ว · < 2 งวด = ทุกงวด · รันซ้ำข้ามงวดที่นับแล้ว
  // · มติข้อ 10: ใบที่มีงวด via count_rest (Rev. ของใบที่กดนับที่เหลือทั้งหมด) = ทุกงวดที่ยังไม่นับ via count_rest + ข้อความอัตโนมัติ
  assert.match(START, /i\."actualStatus" IS DISTINCT FROM 'approved'\s+AND \(v_rest OR v_rows < 2 OR i\.seq = v_min_seq OR i\.amount = 0 OR i\.status = 'confirmed'\)/);
  assert.match(START, /v_rest := EXISTS \(SELECT 1 FROM public\.sales_order_installments i\s+WHERE i\."salesOrderId" = v_order\.id AND i\."actualStatus" = 'approved' AND i\."actualApprovedVia" = 'count_rest'\);/);
  assert.match(START, /"actualApprovedVia" = CASE WHEN v_rest THEN 'count_rest' ELSE 'so_approval' END,/);
  assert.ok(START.includes(`"actualNote" = CASE WHEN v_rest THEN '${INSTALLMENT_ACTUAL_AUTO_NOTE}' ELSE "actualNote" END,`),
    'ข้อความอัตโนมัติ = INSTALLMENT_ACTUAL_AUTO_NOTE ของ lib · ใบที่ยังเดินรายงวดไม่แตะ actualNote');
  assert.doesNotMatch(START, /RAISE EXCEPTION 'installment_actual_bad_state'/, 'รันซ้ำได้ — ไม่มีอะไรให้นับไม่ใช่ error');
  // count_rest: ทุกงวดที่ยังไม่นับตามลำดับ · เหตุผลเก็บที่ actualNote · ไม่มีอะไรเหลือ = bad_state
  assert.match(REST, /i\."actualStatus" IS DISTINCT FROM 'approved'\s+ORDER BY i\.seq/);
  assert.match(REST, /"actualApprovedVia" = 'count_rest',\s*"actualNote" = v_reason/);
  assert.match(REST, /IF v_count = 0 THEN\s+RAISE EXCEPTION 'installment_actual_bad_state';/);
  /* review รอบสี่ 26/10: ยื่น/อนุมัติงวด/นับที่เหลือทั้งหมดบนใบที่มีงวดยังไม่ตรึง = installment_actual_unfrozen (ก่อนด่านงวดก่อนหน้า ·
     ก่อนนับงวดแรก) — start ไม่มีด่านนี้ (route ตรึงก่อนเรียกเสมอ · ใบที่ไม่มีงวดยังรันได้) */
  const unfrozen = /i\."salesOrderId" = v_order\.id AND i\."frozenAt" IS NULL\) THEN\s+RAISE EXCEPTION 'installment_actual_unfrozen';/;
  for (const body of [submit, approve, REST]) assert.match(body, unfrozen);
  assert.ok(submit.search(unfrozen) < submit.search(prev), 'submit: ตรึงก่อนด่านงวดก่อนหน้า');
  assert.ok(approve.search(unfrozen) < approve.search(prev), 'approve: ตรึงก่อนด่านงวดก่อนหน้า');
  assert.ok(REST.search(unfrozen) < REST.indexOf('FOR v_id IN'), 'count_rest: ตรึงก่อนนับงวดแรก');
  assert.doesNotMatch(START, /installment_actual_unfrozen/);
  assert.doesNotMatch(withdraw, /installment_actual_unfrozen/, 'ดึงกลับ (ถอย) ไม่ติดด่านนี้');
  // ทุกทางที่นับใช้ส่วนแบ่งตัวเดียว
  for (const body of [START, REST]) assert.match(body, /v_share := public\._so_installment_actual_share\(v_id\);/);
});

test('รหัส RAISE ของ 0412 = ชุดในสัญญา (+ รหัสเดิม) และมีข้อความไทยในตารางกลางครบ', () => {
  const raised = new Set([...CODE.matchAll(/RAISE EXCEPTION '([a-z0-9_]+)/g)].map((m) => m[1]));
  const runtime = [...raised].filter((c) => !c.startsWith('mig_0412_')).sort();
  assert.deepEqual(runtime, [
    'installment_actual_bad_state', 'installment_actual_counted_row_delete', 'installment_actual_forbidden', 'installment_actual_not_approved',
    'installment_actual_not_found', 'installment_actual_order_not_approved', 'installment_actual_order_not_installment',
    'installment_actual_previous_unconfirmed', 'installment_actual_reason_required', 'installment_actual_remainder_orphaned',
    'installment_actual_self_approval',
    'installment_actual_stale', 'installment_actual_unfrozen', 'installment_carry_counted_locked',
    'installment_replan_sum_mismatch', // anchor ของ W1 (รหัสเดิมของ 0377 ในข้อความ regex — ไม่ใช่ RAISE ใหม่)
    'sales_order_actual_mode_ineligible', 'sales_order_actual_mode_invalid',
    'sales_order_not_found', 'workflow_identity_required',
  ]);
  for (const code of runtime) assert.ok(WORKFLOW_ERROR_CODES.includes(code), `ไม่มีข้อความไทยของ ${code}`);
});

// ═══ 5) ตัวล็อกปรับแผน + แพตช์ผู้เรียก ════════════════════════════════════════════════════════════════════════

const LOCK_CALL6 = /_so_installment_replan_locked\(\s*([a-z]+)\.status,\s*\1\."taxInvoiceNo",\s*\1\."billingRequestId",\s*\1\.kind,\s*\1\.evidence,\s*\1\."paidOn"\)/g;
function bodyIn(file, name) {
  const text = stripComments(read(file));
  const from = text.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(from >= 0, `${file} ไม่มี ${name}`);
  return text.slice(from, text.indexOf('\n$$;', from));
}

test('แพตช์: จำนวนจุดที่ปะ = จำนวนผู้เรียกตัวล็อก 6 พารามิเตอร์ในนิยามล่าสุดของไฟล์ต้นทาง (0377 · 0378) · C1 anchor ครั้งเดียว', () => {
  const patch = CODE.slice(CODE.indexOf('DO $patch$'), CODE.indexOf('$patch$;', CODE.indexOf('DO $patch$') + 10));
  const want = Object.fromEntries([...patch.matchAll(/\('([a-z_]+)', (\d+), (true|false), (true|false)\)/g)].map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(want, { _so_installments_write_plan: 5, carry_sales_order_installments: 3 });
  const owner = (fn) => sqlFiles().filter((n) => n !== FILE && read(n).includes(`CREATE OR REPLACE FUNCTION public.${fn}(`)).at(-1);
  for (const [fn, n] of Object.entries(want)) {
    const file = owner(fn);
    assert.equal([...bodyIn(file, fn).matchAll(LOCK_CALL6)].length, n, `${fn} (${file}): จำนวนผู้เรียกตัวล็อกเปลี่ยน — แก้ expected ของแพตช์`);
  }
  assert.equal(bodyIn(owner('carry_sales_order_installments'), 'carry_sales_order_installments')
    .split('SET "salesOrderId" = v_target.id,').length - 1, 1, 'C1 anchor ต้องเจอครั้งเดียว');
  // C1 ล้างทุกช่อง Actual รายงวดของแถวที่ยก (14 ช่อง = คอลัมน์ใหม่ทั้งหมดของงวด)
  const c1 = RAW.slice(RAW.indexOf("v_c1_replacement constant text := $rp$"), RAW.indexOf('0412/C1 ◀$rp$'));
  const cleared = [...c1.matchAll(/"(actual[A-Za-z]+)" = NULL/g)].map((m) => m[1]).sort();
  assert.equal(cleared.length, 14);
  assert.deepEqual(cleared, [...new Set(cleared)]);
  /* C2 (review รอบสอง 26/10 · finding 14/15): สี่ anchor ในนิยามล่าสุดของตัวยกเงินเจอจุดละหนึ่งพอดี · ข้อความแทนที่ไม่เรียกตัวล็อกแบบมีคอลัมน์
     "actualStatus" (ไม่งั้นนับ carry7 เพี้ยน) และไม่เรียกแบบ 6 พารามิเตอร์ (ด่าน §8) · ล็อกเฉพาะงวดที่นับตอนอนุมัติใบ (so_approval) ยอด > 0 */
  const carryBody = bodyIn(owner('carry_sales_order_installments'), 'carry_sales_order_installments');
  for (const anchor of ['v_summary jsonb;', 'SELECT COALESCE(sum(i.amount), 0) INTO v_locked',
    'IF v_locked + v_carried - v_target."totalAmount" >= 0.005 THEN',
    'PERFORM public._so_installments_write_plan(v_target.id, p_target_rows, v_now, p_actor_id, p_actor_name);']) {
    assert.equal(carryBody.split(anchor).length - 1, 1, `C2 anchor ต้องเจอครั้งเดียว: ${anchor}`);
  }
  const c2 = RAW.slice(RAW.indexOf('v_c2_decl_anchor constant text'), RAW.indexOf('0412/C2b ◀$rp$'));
  assert.doesNotMatch(c2, /_so_installment_replan_locked\([^;]*?"paidOn", [a-z]+\."actualStatus", [a-z]+\.amount\)/);
  assert.doesNotMatch(c2, /_so_installment_replan_locked\([^()]*"paidOn"\)/);
  assert.equal([...c2.matchAll(/i\."paidOn", NULL, NULL\)/g)].length, 3,
    'C2a + ด่าน counted_locked (ยอดเงินจริง · จำนวนงวดที่นับแล้ว) เรียกตัวล็อกด้วย NULL, NULL (= ล็อกเพราะเงิน/เอกสาร)');
  /* มติข้อ 9: งวดที่นับแล้ว (ยอด > 0) ลดยอดได้แต่ลบไม่ได้ ⇒ ด่านยกเกินแยกรหัสนับ 0.01 ต่องวดที่ต้องเหลือ (กติกาเดียวกับ lib applyCarryIn) */
  assert.match(c2, /\+ 0\.01 \* \(SELECT count\(\*\) FROM public\.sales_order_installments i\s+\\2\s+WHERE i\."salesOrderId" = v_target\.id AND i\."actualStatus" = 'approved' AND i\.amount > 0/);
  // แพตช์เติม "actualStatus", amount ให้ทุกจุดที่เรียกตัวล็อก 6 พารามิเตอร์
  assert.ok(RAW.includes(`v_def := regexp_replace(v_def, v_lock_anchor, '\\1, \\2."actualStatus", \\2.amount)', 'g');`));
  assert.match(c2, /i\."actualStatus" = 'approved' AND i\."actualApprovedVia" = 'so_approval' AND i\.amount > 0/);
  assert.match(c2, /RAISE EXCEPTION 'installment_carry_counted_locked'/);
  assert.match(c2, /"actualApprovedAt" = \(v_c2->0->>'actualApprovedAt'\)::timestamptz/, 'เวลาเดิม ⇒ เดือน Actual เดิม');
  assert.match(c2, /INTO v_before/, 'คืนภาพ "ก่อน" ของ audit');
  assert.doesNotMatch(c2, /UPDATE public\./, 'บล็อก DO ห้ามมีข้อความ UPDATE public. (ยามไม่ backfill)');
  // ตรวจท้าย: ไม่เหลือผู้เรียกแบบ 6 พารามิเตอร์ · ฟังก์ชันเงินที่ต้องไม่แตะ md5 เท่าเดิม
  assert.match(CODE, /RAISE EXCEPTION 'mig_0412_six_arg_callers_left %'/);
  assert.match(CODE, /RAISE EXCEPTION 'mig_0412_untouched_changed/);
  const fp = CODE.slice(CODE.indexOf("set_config('mig_0412.untouched'"), CODE.indexOf('$pre$;'));
  for (const fn of ['approve_sales_order_with_signature_evidence_atomic', 'revise_approved_sales_order_atomic',
    'revoke_sales_order_approval_atomic', 'replan_sales_order_installments', 'sales_order_actual_trigger']) {
    assert.ok(fp.includes(`'${fn}'`), `ลายนิ้วมือต้องครอบ ${fn}`);
  }
});

/* review รอบสาม 26/10: แผนที่ไม่เหลืองวดที่ยังไม่นับ Actual ทั้งที่ Σ ที่นับแล้ว < actualAmount = ยอดที่เหลือหายจากทุกกองถาวร
   ⇒ W1 ท้ายแกนเขียนแผน (ปรับแผน) + C2o ท้าย C2b (ยกเงิน — W1 ไม่ยิงเพราะแถวที่ยกยังไม่นับตอนแกนจบ) · ตัวปรับแผน (replan RPC)
   อยู่ในลายนิ้วมือที่ห้ามแตะ ⇒ ด่านต้องอยู่ในแกนเขียนแผน ไม่ใช่ในตัว RPC */
test('W1 + C2o: anchor ของแกนเขียนแผนเจอครั้งเดียว · เงื่อนไขเดียวกันทั้งสองจุด · ป้ายใหม่อยู่ในด่าน "ปะไว้แล้ว"', () => {
  const owner = (fn) => sqlFiles().filter((n) => n !== FILE && read(n).includes(`CREATE OR REPLACE FUNCTION public.${fn}(`)).at(-1);
  const plan = bodyIn(owner('_so_installments_write_plan'), '_so_installments_write_plan');
  assert.equal([...plan.matchAll(/\n[ \t]*RAISE EXCEPTION 'installment_replan_sum_mismatch';\n[ \t]*END IF;/g)].length, 1,
    'W1 anchor ต้องเจอครั้งเดียวในนิยามล่าสุดของแกนเขียนแผน');
  const w1 = RAW.slice(RAW.indexOf('v_w1_replacement constant text'), RAW.indexOf('0412/W1 ◀$rp$'));
  const c2o = RAW.slice(RAW.indexOf('\\2-- 0412/C2o ▶'), RAW.indexOf('\\2-- 0412/C2o ◀'));
  for (const [name, body] of [['W1', w1], ['C2o', c2o]]) {
    assert.ok(body.length > 0, `${name} ต้องมีอยู่`);
    assert.match(body, /"actualStatus" IS DISTINCT FROM 'approved'/, `${name}: ไม่เหลืองวดที่ยังไม่นับ`);
    assert.match(body, /sum\(c\."actualAmount"\)[\s\S]*"actualStatus" = 'approved'\), 0\)\s+(\\2\s+)?< COALESCE\([a-z_]+\."actualAmount", 0\) - 0\.005/,
      `${name}: Σ ที่นับแล้วยังไม่ถึง actualAmount`);
    assert.match(body, /RAISE EXCEPTION 'installment_actual_remainder_orphaned'/);
    assert.doesNotMatch(body, /_so_installment_replan_locked|UPDATE public\./, `${name}: ไม่ชน anchor อื่น/ยามไม่ backfill`);
  }
  assert.match(w1, /o\.origin = 'pipeline' AND o\.status = 'approved' AND o\."actualMode" = 'installment'/, 'W1: เฉพาะใบรายงวดที่อนุมัติอยู่');
  assert.match(c2o, /v_target\."actualMode" = 'installment'/);
  const patch = CODE.slice(CODE.indexOf('DO $patch$'));
  assert.match(patch, /strpos\(v_src, '0412\/C2o ▶'\) > 0/, 'ร่างเดิมที่ไม่มี C2o ต้องไม่ถูกข้ามเป็น "ปะไว้แล้ว"');
  assert.match(patch, /r\.with_w1 OR strpos\(v_src, '0412\/W1 ▶'\) > 0/);
  assert.match(patch, /v_def := regexp_replace\(v_def, v_w1_anchor, v_w1_replacement\);/);
});
