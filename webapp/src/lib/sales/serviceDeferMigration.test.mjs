// ── ยามตัวหนังสือของ mig 0404 (SO บริการ: "ยื่นโดยยังไม่ตั้งงานบริการ" — ข้ามการตั้งงานบริการตอนยื่น · มติเจ้าของ 01/10) ─────────
//
// ⭐ 0404 ทำสามอย่าง และยามนี้ล็อกรูปของทั้งสามที่ฮาร์เนสพิสูจน์ไว้ ไม่ให้ไหลเงียบใน CI:
//    1) ของใหม่ล้วน — 3 ช่อง + CHECK + trigger ล้างตรา + RPC ตัวห่อของการยื่น (`submit_sales_order_deferring_service_setup`)
//    2) **ปะตัวที่รันอยู่จริงหนึ่งตัว** (ตัวเปิดรอบขาย — มีแพตช์ P8 ของ 0394 อยู่แล้ว) ด้วย pg_get_functiondef: บล็อก D1
//       ⇒ ยามนี้ประกอบเนื้อที่รันอยู่จากตัวหนังสือ repo (0392 + แถว P8 ของ 0394) แล้วล็อกว่า anchor ของ D1 เจอ **ครั้งเดียวพอดี**
//       · md5 ของเนื้อนั้นเท่าค่าที่ฮาร์เนสพิมพ์ · ถอดบล็อกด้วย regex ของหัวไฟล์แล้วได้เนื้อเดิมตรงตัว
//    3) **ไม่แตะตัวอนุมัติใบ (ฟังก์ชันเงิน)** และอีก 16 ตัว — ไฟล์จด md5 ต้นทรานแซกชันแล้วเทียบท้ายไฟล์
// ⚠️ อ่าน **ตัวหนังสือ SQL อย่างเดียว** — ห้าม import serviceSetup.js (ข้อความไทย/สถานะของรหัส RAISE ใหม่สี่ตัวอยู่ที่
//    serviceSetupSqlParity.test.mjs) ⇒ ยามนี้เขียวได้ด้วยตัวเองแม้ฝั่ง JS ยังไม่มา
// ⚠️ พฤติกรรมจริงพิสูจน์บนฮาร์เนส PGlite นอก repo (mockups/so-service-lines/pglite-harness/harness-0404.mjs — รันไฟล์สองรอบ
//    + รอบสามบนฐานที่มีข้อมูล · เส้นเงินเทียบผลกับฐานที่ไม่มี 0404 · ข้าม → อนุมัติ → ตั้งย้อนหลังทั้งเส้น · บล็อกถอยกลับของหัวไฟล์
//    · mutate-0404.mjs = ไฟล์ที่ทำผิดทีละข้อต้องถูกจับทุกตัว)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE = '0404_so_service_setup_defer.sql';
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const RAW = read(FILE);
const SPLIT = RAW.indexOf('\nBEGIN;');
const HEADER = RAW.slice(0, SPLIT);
const BODY = RAW.slice(SPLIT);
const CODE = stripComments(BODY);
const md5 = (s) => createHash('md5').update(s).digest('hex');
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const occurrences = (text, needle) => text.split(needle).length - 1;
const order = (text, needles, label) => {
  const at = needles.map((n) => text.indexOf(n));
  at.forEach((i, k) => assert.ok(i >= 0, `${label}: ไม่พบ ${needles[k]}`));
  for (let k = 1; k < at.length; k += 1) assert.ok(at[k - 1] < at[k], `${label}: ${needles[k - 1]} ต้องมาก่อน ${needles[k]}`);
};

const MEDIATOR = 'sales_order_open_service_terms';
const WRAPPER = 'submit_sales_order_deferring_service_setup';
const CLEAR = 'sales_order_service_defer_clear';
const WRAPPER_SIG = `public.${WRAPPER}(text, text, timestamptz, text, text, text, text, text)`;
const DEFER_3 = ['serviceSetupDeferredAt', 'serviceSetupDeferredById', 'serviceSetupDeferredByName'];
/* 17 ฟังก์ชันที่รันอยู่ที่ไฟล์นี้ต้องไม่แตะ (จด md5 ต้นไฟล์ เทียบท้ายไฟล์) — ตัวแรกคือฟังก์ชันเงิน */
const UNTOUCHED_17 = Object.freeze([
  'approve_sales_order_with_signature_evidence_atomic', 'submit_sales_order_with_signature_evidence_atomic',
  'withdraw_sales_order_submission_atomic', 'revise_approved_sales_order_atomic', 'approve_historical_sales_order',
  'approve_sales_order_service_setup', 'submit_sales_order_service_setup', 'reject_sales_order_service_setup',
  'save_sales_order_service_setup', 'sales_order_service_setup_editable', 'sales_order_service_setup_errors',
  'sales_order_service_setup_guard', 'sales_order_copy_service_setup', 'sales_order_line_service_role',
  'sales_order_business_line', 'reopen_sales_order_service_setup', 'sales_order_service_reopen_blockers',
]);
/* ด่านก่อนรันนับ 19 = 17 ตัวข้างบน + ตัวเปิดรอบขาย (ตัวที่ถูกปะ) + ตัวตัดสินสิทธิ์ผู้คีย์ (ตัวห่อเรียก) */
const REQUIRED_19 = Object.freeze([...UNTOUCHED_17, MEDIATOR, 'is_sales_keyer_role']);
/* md5 ของเนื้อตัวเปิดรอบขายที่รันอยู่ (0392 + P8 ของ 0394) หลังลบ space/tab/CR/LF — ค่าเดียวกับบรรทัด INFO ของฮาร์เนส
   และแผน IMPL_PLAN_DEFER §2.2 · ค่านี้เปลี่ยน = เนื้อที่ฮาร์เนสพิสูจน์ไม่ใช่เนื้อนี้แล้ว ⇒ รันฮาร์เนสใหม่ก่อนแก้เลข */
const LIVE_MEDIATOR_MD5 = '30ac2ca0699aff340e8d91e778925a72';

const quotedNames = (text) => [...text.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);
function fnDef(name) {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  assert.equal(occurrences(CODE, marker), 1, `${name} ต้องนิยามครั้งเดียวพอดี`);
  const from = CODE.indexOf(marker);
  const bodyFrom = CODE.indexOf('AS $$', from);
  const bodyTo = CODE.indexOf('\n$$;', bodyFrom);
  assert.ok(bodyFrom > from && bodyTo > bodyFrom, `${name}: หาเนื้อไม่เจอ`);
  return { header: CODE.slice(from, bodyFrom), body: CODE.slice(bodyFrom + 5, bodyTo) };
}
const WRAP = fnDef(WRAPPER);
const CLEAR_FN = fnDef(CLEAR);
const doBlock = (tag, text = BODY) => {
  const m = new RegExp(`DO \\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$;`).exec(text);
  assert.ok(m, `ไม่พบบล็อก DO $${tag}$`);
  return m[1];
};
/* แถวปะ (VALUES ของ DO $patch$): [ชื่อฟังก์ชัน, anchor, ข้อความใหม่, ป้าย] — อ่านจากตัวดิบ (ข้อความใหม่มีคอมเมนต์เป็นป้าย) */
const PATCH_ROW_RE = /\('([a-z_0-9]+)',\s*\$re\$([\s\S]*?)\$re\$,\s*\$rp\$([\s\S]*?)\$rp\$,\s*'([^']+)'\)/g;
const patchRows = (sql) => [...sql.matchAll(PATCH_ROW_RE)].map((m) => ({ fn: m[1], anchor: m[2], replacement: m[3], marker: m[4] }));
/* ARE ของ Postgres → RegExp ของ JS (anchor ที่ใช้มีแค่ \s \( \) \. [^\n] ซึ่งความหมายตรงกัน) · \1 ของ regexp_replace → $1 */
const toJsRegExp = (are, flags = 'g') => new RegExp(are, flags);
const toJsReplacement = (rp) => rp.replace(/\$/g, '$$$$').replace(/\\([1-9])/g, '$$$1');
const D1_ROWS = patchRows(BODY);
const D1 = D1_ROWS[0];
/* บล็อกที่ D1 แทรก (ระหว่างป้าย ▶ ◀) — ตัดคอมเมนต์แล้วยุบช่องว่าง */
const d1Block = () => {
  const m = /-- 0404\/D1 ▶[\s\S]*-- 0404\/D1 ◀/.exec(D1.replacement);
  assert.ok(m, 'ข้อความใหม่ของ D1 ต้องมีป้าย ▶ … ◀');
  return m[0];
};

/* เนื้อที่รันอยู่จริงของตัวเปิดรอบขาย = นิยามล่าสุดใน repo (0392) + แถวปะของไฟล์ที่มาก่อน 0404 ตามลำดับไฟล์ */
function liveMediatorBody() {
  const names = readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql') && n < FILE).sort();
  const definers = names.filter((n) => read(n).includes(`CREATE OR REPLACE FUNCTION public.${MEDIATOR}(`));
  assert.deepEqual(definers, ['0392_so_service_setup.sql'], 'นิยามเต็มของตัวเปิดรอบขายก่อน 0404 ต้องมีไฟล์เดียวคือ 0392');
  const raw = read(definers[0]);
  const at = raw.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${MEDIATOR}(`);
  const from = raw.indexOf('AS $$', at) + 5;
  let body = raw.slice(from, raw.indexOf('\n$$;', from) + 1);
  const patchers = [];
  for (const name of names.filter((n) => n > definers[0])) {
    for (const row of patchRows(read(name)).filter((r) => r.fn === MEDIATOR)) {
      assert.equal([...body.matchAll(toJsRegExp(row.anchor))].length, 1, `${name} ${row.marker}: anchor ต้องเจอครั้งเดียวในเนื้อของ 0392`);
      body = body.replace(toJsRegExp(row.anchor, ''), toJsReplacement(row.replacement));
      patchers.push(`${name.slice(0, 4)}:${row.marker}`);
    }
  }
  return { body, patchers };
}

test('ทรานแซกชันเดียว · NOTIFY หลัง COMMIT · ไม่มีตารางชั่วคราว · ไม่มี SECURITY DEFINER · ฟังก์ชันสร้างด้วย CREATE OR REPLACE เท่านั้น', () => {
  assert.equal(occurrences(CODE, '\nBEGIN;\n'), 1, 'BEGIN; ชั้นนอกครั้งเดียว');
  assert.equal(occurrences(CODE, '\nCOMMIT;'), 1, 'COMMIT; ครั้งเดียว');
  const commitAt = CODE.indexOf('\nCOMMIT;');
  assert.ok(CODE.indexOf("NOTIFY pgrst, 'reload schema';") > commitAt, 'NOTIFY หลัง COMMIT');
  assert.equal(occurrences(CODE, "NOTIFY pgrst, 'reload schema';"), 1);
  /* SQL Editor เตือนเมื่อเห็นตารางชั่วคราว — ลายนิ้วมือเก็บด้วย set_config (ตัวแปรของทรานแซกชัน) */
  assert.doesNotMatch(CODE, /CREATE\s+(GLOBAL\s+|LOCAL\s+)?(TEMP|TEMPORARY)\b/i);
  assert.doesNotMatch(CODE, /SECURITY\s+DEFINER/i);
  assert.doesNotMatch(CODE, /CREATE\s+FUNCTION/i, 'ฟังก์ชันต้อง CREATE OR REPLACE (รันซ้ำได้)');
  assert.doesNotMatch(CODE, /DROP\s+FUNCTION|DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE/i, 'ตัวไฟล์ไม่ลบอะไร (บล็อกถอยกลับอยู่ในคอมเมนต์หัวไฟล์เท่านั้น)');
  /* ไม่ backfill · ไม่เขียนแถวข้อมูลนอกฟังก์ชัน: UPDATE/INSERT/DELETE มีได้เฉพาะในตัวห่อ (UPDATE สามช่องหนึ่งคำสั่ง) */
  const outside = CODE.replace(WRAP.body, '').replace(CLEAR_FN.body, '');
  assert.doesNotMatch(outside, /\b(UPDATE|INSERT INTO|DELETE FROM)\s+public\./, 'นอกฟังก์ชันใหม่ต้องไม่มีคำสั่งเขียนแถว');
});

test('ด่านก่อนรัน: ต้องมี 19 ฟังก์ชัน + ป้าย P1 ในตัวอนุมัติใบ + ป้าย 0394/P8 ในตัวเปิดรอบขาย + ป้าย 0400/L1 ในตัวตรวจ → mig_0404_needs_0400', () => {
  const pre = stripComments(doBlock('pre'));
  const countList = pre.slice(pre.indexOf('p.proname = ANY (ARRAY['), pre.indexOf('IF v_n <> 19'));
  assert.deepEqual(quotedNames(countList).filter((n) => n !== 'public').sort(), [...REQUIRED_19].sort());
  assert.match(pre, /IF v_n <> 19\s/);
  order(pre, [
    "p.proname = 'approve_sales_order_with_signature_evidence_atomic'\n          AND strpos(p.prosrc, 'sales_order_open_service_terms(') > 0",
    "p.proname = 'sales_order_open_service_terms'\n          AND strpos(p.prosrc, '0394/P8') > 0",
    "p.proname = 'sales_order_service_setup_errors'\n          AND strpos(p.prosrc, '0400/L1') > 0",
    "RAISE EXCEPTION 'mig_0404_needs_0400",
    "PERFORM set_config('mig_0404.untouched'",
  ], 'ด่านก่อนรัน');
  assert.equal(occurrences(pre, 'OR NOT EXISTS ('), 3, 'สามป้ายที่ต้องมีก่อนรัน');
});

test('🔴 ลายนิ้วมือของ 17 ฟังก์ชันที่ต้องไม่แตะ — รวมตัวอนุมัติใบ (ฟังก์ชันเงิน) และตัวยื่นเดิม · ไม่มีตัวเปิดรอบขาย · ตรวจท้ายเทียบครบ 17', () => {
  const pre = stripComments(doBlock('pre'));
  const from = pre.indexOf("PERFORM set_config('mig_0404.untouched'");
  const snap = pre.slice(from, pre.indexOf('), true);', from));
  assert.match(snap, /jsonb_object_agg\(p\.proname, md5\(p\.prosrc\)\)::text/);
  const names = quotedNames(snap).filter((n) => n !== 'public');
  assert.deepEqual([...names].sort(), [...UNTOUCHED_17].sort());
  assert.equal(new Set(names).size, 17);
  assert.ok(names.includes('approve_sales_order_with_signature_evidence_atomic'), 'ตัวอนุมัติใบต้องอยู่ในรายการที่ห้ามแตะ');
  assert.ok(names.includes('submit_sales_order_with_signature_evidence_atomic'), 'ตัวยื่นเดิม (ตัวที่ตัวห่อเรียก) ต้องอยู่ในรายการที่ห้ามแตะ');
  assert.ok(!names.includes(MEDIATOR), 'ตัวเปิดรอบขายคือตัวที่ถูกปะ — ไม่อยู่ในรายการ');
  /* ตัวแปรของทรานแซกชัน (อาร์กิวเมนต์ที่สาม is_local = true) — ตายตอน COMMIT/ROLLBACK ไม่ค้างในเซสชันของ SQL Editor */
  assert.match(flat(pre.slice(from)), /^PERFORM set_config\('mig_0404\.untouched', \( SELECT jsonb_object_agg\(p\.proname, md5\(p\.prosrc\)\)::text FROM pg_proc p JOIN pg_namespace n ON n\.oid = p\.pronamespace WHERE n\.nspname = 'public' AND p\.proname = ANY \(ARRAY\[[^\]]+\]\) \), true\);/);
  const verify = stripComments(doBlock('verify'));
  assert.match(verify, /v_before jsonb := current_setting\('mig_0404\.untouched', true\)::jsonb;/);
  assert.match(verify, /IF v_before IS NULL OR \(SELECT count\(\*\) FROM jsonb_object_keys\(v_before\)\) <> 17 THEN\s+RAISE EXCEPTION 'mig_0404_verify bodies';/);
  assert.match(verify, /WHERE now_fn\.h IS DISTINCT FROM b\.h;\s+IF v_n > 0 THEN RAISE EXCEPTION 'mig_0404_verify touched=%', v_n; END IF;/);
});

test('3 ช่องใหม่ในคำสั่ง ALTER เดียวชั้นนอก (ADD COLUMN IF NOT EXISTS · ไม่มี DEFAULT/NOT NULL) · CHECK ลบแล้วสร้างใหม่ · pipeline + ไม่ใช่ร่าง/ตีกลับ', () => {
  const head = 'ALTER TABLE public.sales_orders\n  ADD COLUMN';
  assert.equal(occurrences(CODE, head), 1, 'ALTER … ADD COLUMN ครั้งเดียว (serviceRoundsCopyPaths เก็บคอลัมน์จากรูปประโยคนี้)');
  const alter = CODE.slice(CODE.indexOf(head), CODE.indexOf(';', CODE.indexOf(head)));
  assert.deepEqual([...alter.matchAll(/ADD COLUMN IF NOT EXISTS "([A-Za-z]+)" (\w+)/g)].map((m) => [m[1], m[2]]),
    [['serviceSetupDeferredAt', 'timestamptz'], ['serviceSetupDeferredById', 'text'], ['serviceSetupDeferredByName', 'text']]);
  assert.doesNotMatch(alter, /DEFAULT|NOT NULL/, 'ไม่มีค่าตั้งต้น — ใบที่มีอยู่ทุกใบสามช่องว่าง (ไม่ backfill)');
  const dropAt = CODE.indexOf('ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_service_setup_defer_shape;');
  const addAt = CODE.indexOf('ADD CONSTRAINT sales_orders_service_setup_defer_shape CHECK (');
  assert.ok(dropAt > 0 && addAt > dropAt, 'CHECK: DROP IF EXISTS ก่อน ADD (รันซ้ำได้)');
  assert.equal(flat(CODE.slice(addAt, CODE.indexOf(';', addAt))), flat(`ADD CONSTRAINT sales_orders_service_setup_defer_shape CHECK (
    ("serviceSetupDeferredAt" IS NULL AND "serviceSetupDeferredById" IS NULL AND "serviceSetupDeferredByName" IS NULL)
    OR ("serviceSetupDeferredAt" IS NOT NULL AND origin = 'pipeline' AND status NOT IN ('draft', 'rejected'))
  )`));
  assert.doesNotMatch(CODE, /EXECUTE\s+format\(|EXECUTE\s+'ALTER/, 'DDL ของตารางเป็นคำสั่งชั้นนอก ไม่ใช่ DO/EXECUTE');
  for (const col of DEFER_3) assert.ok(CODE.includes(`COMMENT ON COLUMN public.sales_orders."${col}" IS`), `คอมเมนต์ของ ${col}`);
});

test('trigger ล้างตรา: BEFORE UPDATE OF status · WHEN (ร่าง/ตีกลับ) · ฟังก์ชันล้างสามช่องของตัวเองพอดี ไม่แตะอย่างอื่น ไม่อ่านตาราง', () => {
  const dropAt = CODE.indexOf('DROP TRIGGER IF EXISTS sales_orders_service_defer_clear_trg ON public.sales_orders;');
  const createAt = CODE.indexOf('CREATE TRIGGER sales_orders_service_defer_clear_trg');
  assert.ok(dropAt > 0 && createAt > dropAt, 'DROP TRIGGER IF EXISTS ก่อน CREATE (รันซ้ำได้)');
  assert.equal(flat(CODE.slice(createAt, CODE.indexOf(';', createAt))), flat(`CREATE TRIGGER sales_orders_service_defer_clear_trg
    BEFORE UPDATE OF status ON public.sales_orders
    FOR EACH ROW
    WHEN (NEW.status IN ('draft', 'rejected'))
    EXECUTE FUNCTION public.sales_order_service_defer_clear()`));
  assert.equal(occurrences(CODE, 'CREATE TRIGGER'), 1, 'ไฟล์นี้สร้าง trigger ตัวเดียว');
  assert.match(CLEAR_FN.header, /\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SET search_path = public\s+$/);
  assert.equal(flat(CLEAR_FN.body), flat(`BEGIN
    IF NEW.status IN ('draft', 'rejected') THEN
      NEW."serviceSetupDeferredAt" := NULL;
      NEW."serviceSetupDeferredById" := NULL;
      NEW."serviceSetupDeferredByName" := NULL;
    END IF;
    RETURN NEW;
  END;`));
  assert.deepEqual([...CLEAR_FN.body.matchAll(/NEW\."([A-Za-z]+)" :=/g)].map((m) => m[1]), DEFER_3);
});

test('ตัวห่อของการยื่น: ลายเซ็น 8 ตัวเท่าตัวยื่นเดิม · ลำดับด่าน · รหัส RAISE ครบแปดพอดี · เรียกตัวยื่นเดิมด้วย 8 พารามิเตอร์ตามลำดับ', () => {
  assert.equal(flat(WRAP.header), flat(`CREATE OR REPLACE FUNCTION public.submit_sales_order_deferring_service_setup(
    p_order_id text, p_evidence_id text, p_expected_updated_at timestamptz, p_document_fingerprint text,
    p_actor_id text, p_actor_name text, p_actor_role text, p_actor_team text
  ) RETURNS jsonb LANGUAGE plpgsql SET search_path = public`));
  const b = WRAP.body;
  order(b, [
    'IF NOT public.is_sales_keyer_role(p_actor_role) THEN',
    "RAISE EXCEPTION 'service_setup_forbidden'",
    'SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;',
    "IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;",
    "v_order.origin = 'pipeline'",
    "AND v_order.status IN ('draft', 'rejected')",
    "AND public.sales_order_business_line(v_order.id) IS NOT DISTINCT FROM 'SERVICE'",
    "RAISE EXCEPTION 'service_setup_defer_state_invalid'",
    'IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN',
    "RAISE EXCEPTION 'workflow_stale'",
    'v_errors := public.sales_order_service_setup_errors(v_order.id);',
    'IF cardinality(v_errors) = 0',
    "RAISE EXCEPTION 'service_setup_defer_nothing'",
    'IF EXISTS (SELECT 1 FROM public.service_zone_terms t WHERE t."salesOrderId" = v_order.id) THEN',
    "RAISE EXCEPTION 'service_setup_defer_terms_exist'",
    'IF v_order."revisedFromId" IS NOT NULL',
    "RAISE EXCEPTION 'service_setup_defer_plans_running'",
    'AND EXISTS (SELECT 1 FROM public.service_zone_terms pt',
    "RAISE EXCEPTION 'service_setup_defer_ml_set'",
    'v_result := public.submit_sales_order_with_signature_evidence_atomic(',
    'UPDATE public.sales_orders SET',
    "RETURN jsonb_set(v_result, '{document}', to_jsonb(v_order));",
  ], 'ตัวห่อ');
  /* รหัสใหม่ห้าตัว + ที่ใช้ซ้ำสามตัว — ไม่มากไม่น้อย (สัญญากับ SERVICE_SETUP_SQL_MESSAGES ฝั่ง JS) */
  assert.deepEqual([...b.matchAll(/RAISE EXCEPTION '([a-z_]+)'/g)].map((m) => m[1]), [
    'service_setup_forbidden', 'sales_order_not_found', 'service_setup_defer_state_invalid', 'workflow_stale',
    'service_setup_defer_nothing', 'service_setup_defer_terms_exist', 'service_setup_defer_plans_running', 'service_setup_defer_ml_set',
  ]);
  /* หัวไฟล์บอกสถานะ HTTP ของรหัสใหม่ครบห้าตัว (409) */
  for (const code of ['service_setup_defer_state_invalid', 'service_setup_defer_nothing', 'service_setup_defer_terms_exist', 'service_setup_defer_plans_running', 'service_setup_defer_ml_set']) {
    assert.match(HEADER, new RegExp(`--\\s+${code} \\(409\\)`), `หัวไฟล์ต้องบอกรหัส ${code} (409)`);
  }
  /* "ไม่มีอะไรให้ข้าม" = งานบริการครบ หรือ ไม่มีรายการที่ต้องตั้ง (ตัวเดียวกับ serviceLineNeedsBackfill ฝั่ง JS) */
  assert.match(flat(b), /IF cardinality\(v_errors\) = 0 OR NOT EXISTS \( SELECT 1 FROM public\.sales_order_lines l WHERE l\."salesOrderId" = v_order\.id AND \(public\.sales_order_line_service_role\(NULL, l\."fgCode", l\."productId", l\.metadata\) IS DISTINCT FROM 'not_service' OR l\."serviceKind" = 'package'\) \) THEN RAISE EXCEPTION 'service_setup_defer_nothing';/);
  /* ใบ Rev. ที่ใบเดิมยังมีรอบบริการเดินอยู่ — เงื่อนไขเดียวกับตัวย้ายรอบของตัวเปิดรอบขาย */
  assert.match(flat(b), /IF v_order\."revisedFromId" IS NOT NULL AND EXISTS \(SELECT 1 FROM public\.service_plans sp WHERE sp\."salesOrderId" = v_order\."revisedFromId" AND sp\."isActive"\) THEN RAISE EXCEPTION 'service_setup_defer_plans_running';/);
  /* ใบ Rev. ที่รอบขายของใบเดิมมีมาตรฐาน มล./เดือนที่ TS ตั้งไว้ — ตัวเปิดรอบขายยกค่านี้จากรอบขายของ "revisedFromId" ทอดเดียว (0392 §7)
     ⇒ ใบที่อนุมัติแบบข้าม (ไม่มีรอบขาย) คั่นกลางโซ่ = ค่าหายเงียบ (ตรวจทานรอบสุดท้าย sql-rev-chain-ml-lost) */
  assert.match(flat(stripComments(b)), /IF v_order\."revisedFromId" IS NOT NULL AND EXISTS \(SELECT 1 FROM public\.service_zone_terms pt WHERE pt\."salesOrderId" = v_order\."revisedFromId" AND pt\."standardMlPerMonth" IS NOT NULL\) THEN RAISE EXCEPTION 'service_setup_defer_ml_set';/);
  /* ตัวห่ออ่านค่ามาตรฐานจากรอบขายของใบเดิมเท่านั้น — เงื่อนไขเดียวกับที่ตัวเปิดรอบขายใช้ยกค่า (pt."salesOrderId" = v_order."revisedFromId") */
  const carry = read('0392_so_service_setup.sql');
  assert.match(carry, /AND pt\."salesOrderId" = v_order\."revisedFromId"\s+AND pt\."zoneId" = a\."zoneId"/, 'ตัวเปิดรอบขายของ 0392 ยกค่ามาตรฐานจากรอบขายของ revisedFromId (ทอดเดียว)');
  /* ตัวยื่นเดิมถูกเรียกครั้งเดียว ด้วยพารามิเตอร์ของตัวห่อทั้งแปดตามลำดับ (ลายเซ็นผู้จัดทำ = ของการยื่นปกติทุกตัวอักษร) */
  assert.equal(occurrences(b, 'public.submit_sales_order_with_signature_evidence_atomic('), 1);
  assert.match(flat(b), /v_result := public\.submit_sales_order_with_signature_evidence_atomic\( p_order_id, p_evidence_id, p_expected_updated_at, p_document_fingerprint, p_actor_id, p_actor_name, p_actor_role, p_actor_team\);/);
});

test('🔴 ตัวห่อ: literal บวก origin = pipeline · เขียนตราหลังยื่น คำสั่งเดียว สามช่องพอดี · ไม่ขยับ "updatedAt" · ไม่แตะสถานะ/เงิน · ไม่เขียนตารางอื่น', () => {
  const b = WRAP.body;
  /* historicalSalesOrderMigration: ฟังก์ชันที่อ่าน sales_orders ต้องกรอง pipeline ด้วย literal บวก */
  assert.match(b, /v_order\.origin = 'pipeline'/);
  assert.doesNotMatch(b, /origin\s*(<>|!=)\s*'historical'|IS DISTINCT FROM 'historical'/);
  assert.equal(occurrences(b, 'UPDATE public.'), 1, 'ตัวห่อเขียนแถวคำสั่งเดียว');
  assert.doesNotMatch(b, /INSERT INTO|DELETE FROM/, 'ตัวห่อไม่เขียน audit/หลักฐานเอง — เป็นงานของตัวยื่นเดิมและ route');
  const updateAt = b.indexOf('UPDATE public.sales_orders SET');
  assert.ok(updateAt > b.indexOf('public.submit_sales_order_with_signature_evidence_atomic('), 'ตราเขียนหลังยื่น (CHECK ห้ามตราบนร่าง)');
  const stmt = b.slice(updateAt, b.indexOf(';', updateAt));
  assert.equal(flat(stmt), flat(`UPDATE public.sales_orders SET
    "serviceSetupDeferredAt" = now(),
    "serviceSetupDeferredById" = p_actor_id,
    "serviceSetupDeferredByName" = NULLIF(btrim(COALESCE(p_actor_name, '')), '')
    WHERE id = v_order.id
    RETURNING * INTO v_order`));
  assert.deepEqual([...stmt.matchAll(/"([A-Za-z]+)" =/g)].map((m) => m[1]), DEFER_3);
  assert.doesNotMatch(stmt, /"updatedAt"|\bstatus\b|"submittedAt"|"actualAmount"|"totalAmount"|"approvalFingerprint"|"serviceTermsOpenedAt"|"serviceSetupState"/);
  /* ตัวห่อไม่ตัดสินเรื่องเงิน/เอกสารเอง และไม่เปิดรอบขาย */
  assert.doesNotMatch(b, /service_zone_terms\s+SET|sales_order_open_service_terms|sales_order_installments|document_signature_evidence/);
});

test('แถวปะ D1: ตัวเดียว · ชื่อฟังก์ชันเป็นสตริงใน VALUES · anchor/ป้ายตามสัญญา · anchor ต้องเจอครั้งเดียวพอดีทั้ง prosrc และ functiondef · รันซ้ำ = ข้าม', () => {
  assert.equal(D1_ROWS.length, 1, 'ไฟล์นี้ปะฟังก์ชันที่รันอยู่ตัวเดียว');
  assert.equal(D1.fn, MEDIATOR);
  assert.equal(D1.marker, '0404/D1');
  assert.equal(D1.anchor, String.raw`(IF cardinality\(v_errors\) > 0 THEN)(\s*RAISE EXCEPTION 'sales_order_service_setup_incomplete')`);
  assert.match(D1.replacement, /^\\1\n {4}-- 0404\/D1 ▶ /, 'ข้อความใหม่ขึ้นต้นด้วยกลุ่มที่ 1 แล้วป้ายเปิด');
  assert.match(D1.replacement, /-- 0404\/D1 ◀\\2$/, 'ข้อความใหม่จบด้วยป้ายปิดแล้วกลุ่มที่ 2 (RAISE เดิมอยู่ครบ)');
  const patch = doBlock('patch');
  order(patch, [
    "IF v_n <> 1 THEN\n      RAISE EXCEPTION 'mig_0404_patch_overload % count=%', r.fn, v_n;",
    'IF strpos(v_src, r.marker) > 0 THEN',
    "RAISE NOTICE '0404: % % — ปะไว้แล้ว', r.marker, r.fn;\n      CONTINUE;",
    'v_def := pg_get_functiondef(v_oid);',
    "SELECT count(*) INTO v_hits_src FROM regexp_matches(v_src, r.anchor, 'g');",
    "SELECT count(*) INTO v_hits_def FROM regexp_matches(v_def, r.anchor, 'g');",
    "IF v_hits_src <> 1 OR v_hits_def <> 1 THEN\n      RAISE EXCEPTION 'mig_0404_patch_anchor % % hits=%/%', r.marker, r.fn, v_hits_src, v_hits_def;",
    'EXECUTE regexp_replace(v_def, r.anchor, r.replacement);',
    "RAISE NOTICE '0404: % % — ปะแล้ว', r.marker, r.fn;",
  ], 'บล็อกปะ');
  assert.equal(occurrences(patch, 'EXECUTE '), 1, 'EXECUTE เดียวของไฟล์ = นิยามที่ปะแล้ว');
  assert.equal(occurrences(CODE, 'EXECUTE regexp_replace('), 1);
});

test('🔴 บล็อก D1: หกเงื่อนไขพอดี → RETURN 0 · อ่านอย่างเดียว (ไม่มี UPDATE/INSERT/DELETE/PERFORM — ไม่เปิดรอบขาย ไม่ประทับตรา)', () => {
  const block = d1Block();
  assert.equal(flat(stripComments(block)), flat(`IF v_order.origin = 'pipeline'
       AND v_order."serviceSetupDeferredAt" IS NOT NULL
       AND v_order."serviceSetupState" IS DISTINCT FROM 'submitted'
       AND NOT EXISTS (SELECT 1 FROM public.service_zone_terms dt WHERE dt."salesOrderId" = v_order.id)
       AND NOT (v_order."revisedFromId" IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.service_plans dp
                             WHERE dp."salesOrderId" = v_order."revisedFromId" AND dp."isActive"))
       AND NOT (v_order."revisedFromId" IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.service_zone_terms dm
                             WHERE dm."salesOrderId" = v_order."revisedFromId" AND dm."standardMlPerMonth" IS NOT NULL)) THEN
      RETURN 0;
    END IF;`));
  const code = stripComments(block);
  assert.doesNotMatch(code, /\b(UPDATE|INSERT|DELETE|PERFORM|EXECUTE|RAISE)\b/, 'D1 ต้องอ่านอย่างเดียว');
  assert.doesNotMatch(code, /serviceTermsOpenedAt/, 'D1 ไม่ประทับตรา');
  assert.equal(occurrences(code, 'RETURN 0;'), 1);
  assert.equal(occurrences(D1.replacement, '0404/D1 ▶'), 1);
  assert.equal(occurrences(D1.replacement, '0404/D1 ◀'), 1);
  /* เงื่อนไขรอบบริการของใบเดิม = ตัวเดียวกับของตัวห่อ (ตาข่ายคู่กัน) */
  assert.match(flat(WRAP.body), /sp\."salesOrderId" = v_order\."revisedFromId" AND sp\."isActive"/);
  assert.match(flat(code), /dp\."salesOrderId" = v_order\."revisedFromId" AND dp\."isActive"/);
  /* เงื่อนไขมาตรฐาน มล./เดือนของใบเดิม = ตัวเดียวกับของตัวห่อ (ตาข่ายคู่กัน) */
  assert.match(flat(WRAP.body), /pt\."salesOrderId" = v_order\."revisedFromId" AND pt\."standardMlPerMonth" IS NOT NULL/);
  assert.match(flat(code), /dm\."salesOrderId" = v_order\."revisedFromId" AND dm\."standardMlPerMonth" IS NOT NULL/);
});

test('🔴 เนื้อที่รันอยู่ของตัวเปิดรอบขาย (0392 + P8 ของ 0394 จากตัวหนังสือ repo): md5 เท่าที่ฮาร์เนสพิสูจน์ · anchor ของ D1 เจอครั้งเดียว · ถอดด้วย regex ของหัวไฟล์ได้เนื้อเดิมตรงตัว', () => {
  const { body, patchers } = liveMediatorBody();
  assert.deepEqual(patchers, ['0394:0394/P8'], 'ก่อน 0404 มีแพตช์ของตัวเปิดรอบขายตัวเดียวคือ P8 ของ 0394');
  assert.equal(md5(body.replace(/[ \t\n\r]/g, '')), LIVE_MEDIATOR_MD5,
    'เนื้อของตัวเปิดรอบขายใน repo ไม่ใช่เนื้อที่ฮาร์เนส 0404 พิสูจน์แล้ว — รันฮาร์เนสใหม่ก่อน');
  assert.equal([...body.matchAll(toJsRegExp(D1.anchor))].length, 1, 'anchor ของ D1 ต้องเจอครั้งเดียวพอดีในเนื้อที่รันอยู่');
  const patched = body.replace(toJsRegExp(D1.anchor, ''), toJsReplacement(D1.replacement));
  assert.notEqual(patched, body);
  for (const needle of ['0404/D1 ▶', '0404/D1 ◀', '0394/P8 ▶', '0394/P8 ◀',
    "RAISE EXCEPTION 'sales_order_service_setup_incomplete'", 'SET "serviceTermsOpenedAt" = now()']) {
    assert.equal(occurrences(patched, needle), 1, `หลังปะ: "${needle}" ต้องมีครั้งเดียว (ตรวจท้ายของไฟล์นับแบบเดียวกัน)`);
  }
  /* D1 อยู่ใน IF ของ "ยังไม่ครบ" และอยู่ก่อน RAISE เดิม · อยู่หลังทางออกของใบที่ไม่ใช่สายบริการ (P8) · อยู่ก่อนตราเปิดงาน */
  order(patched, ['-- 0394/P8 ◀', 'v_errors := public.sales_order_service_setup_errors(v_order.id);', 'IF cardinality(v_errors) > 0 THEN',
    '-- 0404/D1 ▶', 'RETURN 0;\n    END IF;\n    -- 0404/D1 ◀', "RAISE EXCEPTION 'sales_order_service_setup_incomplete' USING DETAIL = array_to_string(v_errors, ',');",
    'SET "serviceTermsOpenedAt" = now()'], 'เนื้อหลังปะ');
  /* บล็อกถอยกลับของหัวไฟล์: regex ตัวเดียวกันนับหนึ่งครั้ง แล้วถอดออกได้เนื้อก่อน 0404 ทุกไบต์ */
  const undo = /\$u\$([^\n]*?)\$u\$/.exec(HEADER);
  assert.ok(undo, 'หัวไฟล์ต้องมี regex ถอดแพตช์ ($u$…$u$)');
  assert.equal(undo[1], String.raw`\n[ \t]*-- 0404/D1 ▶.*-- 0404/D1 ◀`);
  assert.equal(occurrences(HEADER, `$u$${undo[1]}$u$`), 2, 'นับ hits และ regexp_replace ใช้ regex ตัวเดียวกัน');
  const undoRe = /\n[ \t]*-- 0404\/D1 ▶[\s\S]*-- 0404\/D1 ◀/;
  assert.equal(patched.replace(undoRe, ''), body, 'ถอด D1 แล้วต้องได้เนื้อเดิมตรงตัว');
});

test('🔴 ไฟล์เอ่ย "FUNCTION public.<ชื่อ>" ได้เฉพาะสองฟังก์ชันใหม่ (แม้ในคอมเมนต์) · ไฟล์หลังจากนี้ที่นิยามตัวเปิดรอบขายทับต้องพาบล็อก D1 ไปด้วย', () => {
  const named = new Set([...RAW.matchAll(/FUNCTION\s+public\.([a-z0-9_]+)/g)].map((m) => m[1]));
  assert.deepEqual([...named].sort(), [CLEAR, WRAPPER].sort(), 'ยาม "นิยามล่าสุด" ของเทสต์อื่นหาเจ้าของนิยามด้วยข้อความนี้');
  for (const fn of REQUIRED_19) assert.ok(!RAW.includes(`FUNCTION public.${fn}`), `0404 ต้องไม่เอ่ย FUNCTION public.${fn}`);
  const later = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql') && name > FILE).sort();
  for (const name of later) {
    const sql = read(name);
    if (sql.includes(`FUNCTION public.${MEDIATOR}`)) {
      /* เขียนทับตัวเปิดรอบขายทั้งตัวโดยไม่มี D1 = การข้ามหายเงียบ: ใบที่ยื่นแบบข้ามจะอนุมัติไม่ผ่านทุกใบ */
      const block = /-- 0404\/D1 ▶[\s\S]*?-- 0404\/D1 ◀/.exec(sql)?.[0] || '';
      assert.ok(block, `${name} นิยาม ${MEDIATOR} ทับ แต่ไม่มีบล็อก 0404/D1 ▶ … ◀ — การ "ยื่นโดยยังไม่ตั้งงานบริการ" จะหายเงียบ`);
      assert.equal(flat(stripComments(block)), flat(stripComments(d1Block())), `${name}: บล็อก D1 ต้องเท่าของ 0404 (หกเงื่อนไข → RETURN 0)`);
    }
    for (const fn of [WRAPPER, CLEAR]) {
      assert.ok(!sql.includes(`FUNCTION public.${fn}`), `${name} นิยาม ${fn} ทับ 0404 — ย้ายยามนี้ไปอ่านไฟล์นั้น`);
    }
    for (const col of DEFER_3) {
      assert.doesNotMatch(sql, new RegExp(`DROP COLUMN (IF EXISTS )?"${col}"`), `${name} ลบ ${col} — ยามนี้ต้องตามไปด้วย`);
    }
  }
});

test('สิทธิ์: ตัวห่อ REVOKE PUBLIC/anon/authenticated + GRANT service_role ด้วยลายเซ็นเต็ม · ฟังก์ชัน trigger ไม่มีใครเรียกตรงได้ (รวม service_role)', () => {
  assert.ok(CODE.includes(`REVOKE ALL ON FUNCTION ${WRAPPER_SIG} FROM PUBLIC, anon, authenticated;`));
  assert.ok(CODE.includes(`GRANT EXECUTE ON FUNCTION ${WRAPPER_SIG} TO service_role;`));
  assert.ok(CODE.includes(`REVOKE ALL ON FUNCTION public.${CLEAR}() FROM PUBLIC, anon, authenticated, service_role;`));
  assert.equal(occurrences(CODE, 'GRANT '), 1, 'GRANT เดียวของไฟล์ = ตัวห่อให้ service_role');
  assert.doesNotMatch(CODE, /GRANT[^;]*\b(anon|authenticated|PUBLIC)\b/);
  /* ตรวจท้ายยืนยันสิทธิ์สามตัว: ตัวห่อ + ตัวเปิดรอบขาย (service_role เรียกได้) · ฟังก์ชัน trigger (ไม่มีใคร) */
  const verify = stripComments(doBlock('verify'));
  assert.match(flat(verify), /\('public\.submit_sales_order_deferring_service_setup\(text,text,timestamptz,text,text,text,text,text\)', true\), \('public\.sales_order_open_service_terms\(text,text,text\)', true\), \('public\.sales_order_service_defer_clear\(\)', false\)/);
  assert.match(flat(verify), /IF has_function_privilege\('anon', v_fn, 'EXECUTE'\) OR has_function_privilege\('authenticated', v_fn, 'EXECUTE'\) OR has_function_privilege\('service_role', v_fn, 'EXECUTE'\) IS DISTINCT FROM r\.service_role THEN RAISE EXCEPTION 'mig_0404_verify grant %', v_fn;/);
});

test('ตรวจท้าย: ป้าย D1/P8 ครั้งเดียว · RAISE ไม่ครบ + ตราเปิดงานยังอยู่ที่เดิมครั้งเดียว · คอลัมน์ 3 · CHECK · trigger BEFORE UPDATE OF status · รหัสครบ', () => {
  const verify = stripComments(doBlock('verify'));
  for (const needle of ["'0404/D1 ▶'", "'0404/D1 ◀'", "'0394/P8 ▶'", "'0394/P8 ◀'",
    "'RAISE EXCEPTION ''sales_order_service_setup_incomplete'''", "'SET \"serviceTermsOpenedAt\" = now()'"]) {
    assert.ok(verify.includes(`('${MEDIATOR}', ${needle})`), `ตรวจท้ายต้องนับ ${needle} ในตัวเปิดรอบขาย`);
  }
  assert.match(verify, /IF v_n IS DISTINCT FROM 1 THEN\s+RAISE EXCEPTION 'mig_0404_verify marker % in % = %', r\.needle, r\.fn, v_n;/);
  assert.match(verify, /column_name LIKE 'serviceSetupDeferred%';\s+IF v_n <> 3 THEN RAISE EXCEPTION 'mig_0404_verify columns=%', v_n; END IF;/);
  assert.match(verify, /conname = 'sales_orders_service_setup_defer_shape'\) THEN\s+RAISE EXCEPTION 'mig_0404_verify check';/);
  assert.match(verify, /t\.tgname = 'sales_orders_service_defer_clear_trg'\s+AND strpos\(pg_get_triggerdef\(t\.oid\), 'BEFORE UPDATE OF status'\) > 0;\s+IF v_n <> 1 THEN RAISE EXCEPTION 'mig_0404_verify trigger=%', v_n; END IF;/);
  /* รหัสของบล็อก DO ทั้งสาม (ด่านก่อนรัน · ปะ · ตรวจท้าย) เป็นของคนรัน migration ล้วน — รหัสของผู้ใช้อยู่ในตัวห่อเท่านั้น
     (ตัด $re$…$re$ / $rp$…$rp$ ออกก่อน: anchor ของ D1 มีข้อความ RAISE ของตัวเปิดรอบขายอยู่ข้างใน) */
  const doCode = ['pre', 'patch', 'verify'].map((tag) => stripComments(doBlock(tag))).join('\n').replace(/\$(re|rp)\$[\s\S]*?\$\1\$/g, '');
  const doCodes = [...doCode.matchAll(/RAISE EXCEPTION '([a-z_0-9]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(doCodes)].sort(), ['mig_0404_needs_0400', 'mig_0404_patch_anchor', 'mig_0404_patch_overload', 'mig_0404_verify'].sort());
  assert.equal(doCodes.length, 10, 'needs ×1 · patch ×2 (overload · anchor) · verify ×7 (bodies · touched · marker · grant · columns · check · trigger)');
  assert.doesNotMatch(CLEAR_FN.body, /RAISE/, 'ฟังก์ชัน trigger ไม่ RAISE');
});

test('หัวไฟล์: SELECT ตรวจก่อนรัน (anchor เดียวกับแถวปะ · 19 ชื่อเดียวกับด่าน) · SELECT ตรวจหลังรัน + ค่าที่คาด · ลำดับ deploy · บล็อกถอยกลับ · ห้ามรัน 0392 ซ้ำ', () => {
  const selects = [...HEADER.matchAll(/\n--\s+SELECT\s*\n/g)].map((m) => m.index);
  assert.equal(selects.length, 2, 'SELECT ตรวจก่อนรัน + SELECT ตรวจหลังรัน (ฮาร์เนสรันสองก้อนนี้ตามตัวอักษร)');
  const upTo = (from, end) => { const to = HEADER.indexOf(end, from); assert.ok(to > from, `ไม่พบ ${end}`); return HEADER.slice(from, to + end.length); };
  const preflight = upTo(selects[0], 'AS pending_service;');
  const verifySel = upTo(selects[1], 'AS deferred;');
  assert.ok(selects[0] < selects[1] && preflight.length < selects[1] - selects[0], 'ตรวจก่อนรันจบก่อนตรวจหลังรัน');
  const aliases = (sql) => [...sql.matchAll(/\bAS ([a-z0-9_]+)[,;]?\s*$/gm)].map((m) => m[1]).filter((a) => a !== 'm');
  /* ตรวจก่อนรัน — อ่านอย่างเดียว · anchor ตัวเดียวกับแถวปะ (เจ้าของเห็นผลเดียวกับที่ด่าน §4 จะเห็น) */
  assert.deepEqual(aliases(preflight), ['fns', 'p1', 'p8', 'd1_anchor', 'd1', 'cols', 'pending_service']);
  assert.ok(preflight.includes(`$re$${D1.anchor}$re$`), 'anchor ใน SELECT ตรวจก่อนรันต้องเท่า anchor ของแถวปะตามตัวอักษร');
  assert.deepEqual(quotedNames(preflight.slice(0, preflight.indexOf('AS fns'))).filter((n) => n !== 'public').sort(), [...REQUIRED_19].sort());
  assert.match(HEADER, /คาด \(ก่อนรัน\): fns = 19 · p1 = 1 · p8 = 1 · d1_anchor = 1 · d1 = 0 · cols = 0 · pending_service ≥ 0/);
  assert.doesNotMatch(`${preflight}${verifySel}`, /\b(UPDATE|INSERT|DELETE|ALTER|DROP|CREATE)\b/, 'SELECT ของหัวไฟล์ต้องอ่านอย่างเดียว');
  /* ตรวจหลังรัน */
  assert.deepEqual(aliases(verifySel), ['cols', 'chk', 'trg', 'fns', 'd1', 'p1', 'anon_submit', 'svc_submit', 'deferred']);
  assert.match(HEADER, /คาด: cols = 3 · chk = 1 · trg = 1 · fns = 2 · d1 = 1 · p1 = 1 · anon_submit = f · svc_submit = t · deferred = 0/);
  assert.ok(verifySel.includes("strpos(p.prosrc, '0404') = 0) AS p1"), 'ตรวจหลังรันยืนยันว่าตัวอนุมัติใบไม่มีร่องรอยของ 0404');
  /* แต่ละช่องของ SELECT ตรวจหลังรันนับของชิ้นที่ถูกต้อง (ค่าที่คาดข้างบนจะจริงก็ต่อเมื่อนิพจน์ถูก) */
  for (const expr of [
    "column_name LIKE 'serviceSetupDeferred%') AS cols",
    "conname = 'sales_orders_service_setup_defer_shape') AS chk",
    "NOT tgisinternal AND tgname = 'sales_orders_service_defer_clear_trg') AS trg",
    `p.proname IN ('${WRAPPER}', '${CLEAR}')) AS fns`,
    `p.proname = '${MEDIATOR}' AND strpos(p.prosrc, '0404/D1 ▶') > 0) AS d1`,
    `has_function_privilege('anon', 'public.${WRAPPER}(text,text,timestamptz,text,text,text,text,text)', 'EXECUTE') AS anon_submit`,
    `has_function_privilege('service_role', 'public.${WRAPPER}(text,text,timestamptz,text,text,text,text,text)', 'EXECUTE') AS svc_submit`,
    '(SELECT count(*) FROM public.sales_orders WHERE "serviceSetupDeferredAt" IS NOT NULL) AS deferred;',
  ]) assert.ok(flat(verifySel.replace(/^--/gm, '')).includes(expr), `SELECT ตรวจหลังรัน: ${expr}`);
  for (const expr of [
    `p.proname = '${MEDIATOR}' AND strpos(p.prosrc, '0394/P8') > 0) AS p8`,
    `p.proname = '${MEDIATOR}' AND strpos(p.prosrc, '0404/D1 ▶') > 0) AS d1`,
    "column_name LIKE 'serviceSetupDeferred%') AS cols",
    "o.origin = 'pipeline' AND o.status = 'pending_approval' AND public.sales_order_business_line(o.id) = 'SERVICE') AS pending_service;",
  ]) assert.ok(flat(preflight.replace(/^--/gm, '')).includes(expr), `SELECT ตรวจก่อนรัน: ${expr}`);
  /* ลำดับ deploy: รันไฟล์ก่อน merge/deploy · ห้าม deploy ก่อนรัน */
  order(HEADER, ['── ลำดับ deploy', 'รันไฟล์นี้ที่ SQL Editor **ก่อน** merge/deploy', 'ห้าม deploy ก่อนรัน', '── ตรวจหลังรัน', '── ถอยกลับ'], 'หัวไฟล์');
  /* ถอยกลับ: ถอดแพตช์ก่อน แล้วค่อยลบของใหม่ครบทุกชิ้น */
  order(HEADER, ['DO $undo$', "IF v_hits <> 1 THEN RAISE EXCEPTION 'undo_0404 hits=%', v_hits; END IF;", 'END $undo$;',
    `DROP FUNCTION public.${WRAPPER}(text, text, timestamptz, text, text, text, text, text);`,
    'DROP TRIGGER sales_orders_service_defer_clear_trg ON public.sales_orders;',
    `DROP FUNCTION public.${CLEAR}();`,
    'DROP CONSTRAINT sales_orders_service_setup_defer_shape,',
    "NOTIFY pgrst, 'reload schema';"], 'บล็อกถอยกลับ');
  for (const col of DEFER_3) assert.ok(HEADER.includes(`DROP COLUMN "${col}"`), `ถอยกลับต้องลบ ${col}`);
  assert.match(HEADER, /ถอยโค้ดก่อนเสมอ/);
  assert.match(HEADER, /ห้ามรัน 0392 ซ้ำหลังไฟล์นี้/);
  assert.match(HEADER, /0392 → 0394 → 0400 → ไฟล์นี้/);
  assert.match(HEADER, /SELECT "orderNumber" FROM public\.sales_orders WHERE "serviceSetupDeferredAt" IS NOT NULL AND status = 'pending_approval'/,
    'หัวไฟล์ต้องบอกวิธีจดใบที่รออนุมัติด้วยตราการข้ามก่อนถอย');
  assert.match(HEADER, /⚠️ DDL — เจ้าของรันมือบน Supabase SQL Editor/);
});

/* 🔒 ไฟล์นี้อยู่บนฐานจริงแล้ว — ตรวจสคีมาแบบอ่านอย่างเดียว 08/10/2026 16:04 น. (สามช่อง + RPC ตัวห่อครบ · `check:columns` เขียว ·
     docs/so-service-setup.md หัวข้อ "ยื่นโดยยังไม่ตั้งงานบริการ") · เจ้าของรันฉบับนี้ที่ SQL Editor และแปะผล SELECT ตรวจหลังรันแล้ว 08/10/2026
     (ตรงตามที่คาดทุกค่า — ที่ฐานไม่เหลืออะไรต้องทำก่อน merge/deploy) ⇒ ตัวหนังสือของไฟล์ต้องเท่าฉบับที่ส่งให้เจ้าของรัน **ทุกไบต์**
     · แก้ไฟล์หลังรัน = repo กับฐานพูดไม่ตรงกันเงียบ ๆ (ไฟล์รันซ้ำได้ แต่แถวปะ D1 ที่มีป้ายแล้วถูกข้าม ⇒ เนื้อ D1 ใหม่ไม่มีวันถึงฐาน)
     · ต้องเปลี่ยน SQL ของงานนี้ = เขียน migration ใหม่เลขถัดไป (และพก D1 ถ้าเขียนทับตัวเปิดรอบขาย — ยามข้างบน) ไม่ใช่แก้ไฟล์นี้
     · ยามนี้แดงเพราะแก้คอมเมนต์ก็ตาม = ตั้งใจ (หัวไฟล์คือ SELECT/บล็อกถอยที่เจ้าของถือไว้ใช้) */
test('🔒 0404 อยู่บนฐานจริงแล้ว (ตรวจสคีมา 08/10/2026): ไฟล์ต้องเท่าฉบับที่ส่งให้เจ้าของรันทุกไบต์ — sha256', () => {
  const bytes = readFileSync(new URL(FILE, MIGRATIONS));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'b538e23d8a0e1bfc30f17d33dead6db604c920f4a1cfb93d5ce81d6b6307e482',
    'ห้ามแก้ 0404_so_service_setup_defer.sql — ไฟล์รันบนฐานจริงแล้ว · SQL ที่ต้องเปลี่ยน = migration ใหม่');
});
