// ── ยามตัวหนังสือของ mig 0394 (ใบสั่งขายย้อนหลัง: แพ็คต่อรอบ + รอบบริการบังคับ + วันวางบิลขั้น ③ ·
//    เปิดรอบขายผ่านตัวกลางของ 0392 — PR-D) ─────────────────────────────────────────────────────────────
//
// ⭐ 0394 **ไม่สร้างฟังก์ชัน** — ปะ 5 ตัวที่รันอยู่จริงด้วย pg_get_functiondef (แพตเทิร์น 0382/0392) ⇒ ไม่มี CREATE
//    ของตัวไหนในไฟล์ให้ยาม "นิยามล่าสุด" เห็น · เทสต์นี้ล็อกจุดปะ (anchor) กับตัวหนังสือของนิยามที่ฐานใช้อยู่จริง:
//      approve_historical_sales_order   = 0374 + แถว 0382 (ตำแหน่งผู้อนุมัติ)
//      historical_so_check_lines · historical_so_write_children = 0379
//      sales_order_open_service_terms · sales_order_service_setup_errors = 0392
//    ว่าเจอ **ครั้งเดียวพอดี** ตามลำดับแถวของไฟล์ (ข้อความโตทีละแถว) และล็อกกติกาที่ยามไฟล์อื่นพึ่งพา
// ⚠️ อ่านตัวหนังสือ SQL · พฤติกรรมจริงพิสูจน์บนฮาร์เนส PGlite นอก repo (H1–H21 · รันไฟล์สองรอบ · บล็อกถอยกลับ)
// ⚠️ ข้อ "รหัสทุกตัวมีข้อความไทย" กับ "ตัวเลขตรงกับ JS" อ่านค่าคงที่จาก lib (D2a/D2b ของแผน) ผ่าน namespace import
//    ⇒ ไฟล์นี้โหลดได้เสมอ · สองข้อนั้นแดงจนกว่า lib จะมีค่า (จงใจ — กันรหัสใหม่หลุดไปเป็น 500 กลาง)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { WORKFLOW_ERROR_CODES } from './documentWorkflowErrors.js';
import * as historicalCopy from './historicalOrderCopy.js';
import * as historicalPlan from './historicalOrderPlan.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE = '0394_historical_so_service_alignment.sql';
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const sqlFiles = () => readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();

const EXISTS = existsSync(new URL(FILE, MIGRATIONS));
const RAW = EXISTS ? read(FILE) : '';
const SPLIT = RAW.indexOf('\nBEGIN;');
const HEADER = SPLIT >= 0 ? RAW.slice(0, SPLIT) : RAW;
const BODY = SPLIT >= 0 ? RAW.slice(SPLIT + 1) : '';
const CODE = stripComments(BODY);

const dollar = (tag, text = CODE) => [...text.matchAll(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`, 'g'))].map((m) => m[1]);
/* ARE ของ Postgres → RegExp ของ JS: anchor ใช้แค่ \s \( \) \. \* \| \{ \} [^\n] [^;] ซึ่งความหมายตรงกัน
   · regexp_replace ไม่มี 'g' = แทนตัวแรก ⇒ new RegExp(anchor) (ไม่มี g) · \1 ของ PG → $1 ของ JS · $ ตัวอื่นเป็นตัวหนังสือ */
const toJsRegExp = (are, flags = 'g') => new RegExp(are, flags);
const toJsReplacement = (rp) => rp.replace(/\$/g, '$$$$').replace(/\\([1-9])/g, '$$$1');
const count = (text, re) => (text.match(re) || []).length;
const occurrences = (text, needle) => text.split(needle).length - 1;
const squeeze = (sql) => sql.replace(/\s+/g, ' ').trim();

/* ── นิยามที่ฐานใช้อยู่จริง (ตัวหนังสือ repo) ───────────────────────────────────────────────────── */
const OWNER_FILE = Object.freeze({
  approve_historical_sales_order: '0374_historical_so_approval_flow.sql',
  historical_so_check_lines: '0379_historical_so_quote_lines.sql',
  historical_so_write_children: '0379_historical_so_quote_lines.sql',
  sales_order_open_service_terms: '0392_so_service_setup.sql',
  sales_order_service_setup_errors: '0392_so_service_setup.sql',
});

function functionBlock(sql, fnName) {
  const marker = `CREATE OR REPLACE FUNCTION public.${fnName}(`;
  const from = sql.lastIndexOf(marker);
  assert.ok(from >= 0, `ไม่พบนิยาม ${fnName}`);
  const to = sql.indexOf('\n$$;', from);
  assert.ok(to > from, `หาปลายนิยาม ${fnName} ไม่เจอ`);
  return { full: sql.slice(from, to + 4), body: sql.slice(sql.indexOf('AS $$', from) + 5, to) };
}
function replaceOnce(text, oldExpr, newExpr, label) {
  assert.equal(occurrences(text, oldExpr), 1, `${label}: ข้อความที่ปะต้องเจอครั้งเดียว`);
  return text.replace(oldExpr, () => newExpr);
}
/* แถวปะของ 0382 (ชื่อ → [เดิม, ใหม่]) */
function patch0382(fn) {
  const code = stripComments(read('0382_sales_role_hierarchy.sql'));
  const m = new RegExp(`\\('${fn}',\\s*\\$o\\$([\\s\\S]*?)\\$o\\$,\\s*\\$n\\$([\\s\\S]*?)\\$n\\$\\)`).exec(code);
  assert.ok(m, `0382 ต้องมีแถวของ ${fn}`);
  return [m[1], m[2]];
}
function liveTexts() {
  const out = {};
  for (const [fn, file] of Object.entries(OWNER_FILE)) out[fn] = functionBlock(read(file), fn);
  const [o, n] = patch0382('approve_historical_sales_order');
  const a = out.approve_historical_sales_order;
  out.approve_historical_sales_order = {
    full: replaceOnce(a.full, o, n, '0382 approve'),
    body: replaceOnce(a.body, o, n, '0382 approve'),
  };
  return out;
}

/* ── แถว VALUES ของ DO $patch$ (อ่านจากตัวหนังสือดิบ — anchor/replacement มีคอมเมนต์ที่เป็นส่วนของเนื้อฟังก์ชัน) ── */
function patchRows() {
  const [block] = dollar('patch', BODY);
  assert.ok(block, 'ต้องมี DO $patch$');
  const values = block.slice(block.indexOf('FROM (VALUES'), block.indexOf(') AS t(fn, anchor, replacement, marker)'));
  return [...values.matchAll(/\('([a-z_]+)',\s*\$re\$([\s\S]*?)\$re\$,\s*\$rp\$([\s\S]*?)\$rp\$,\s*'([^']+)'\)/g)]
    .map((m) => ({ fn: m[1], anchor: m[2], replacement: m[3], marker: m[4], label: m[4].replace('0394/', '') }));
}

/* ลำดับตามแผน §5.3 (Rev. 2): ตัวกลางก่อน → ตัวตรวจ → ตัวเขียน → ตัวอนุมัติ */
const EXPECTED_ROWS = Object.freeze([
  ['P8', 'sales_order_open_service_terms'],
  ['P9a', 'sales_order_service_setup_errors'],
  ['P9b', 'sales_order_service_setup_errors'],
  ['P9c', 'sales_order_service_setup_errors'],
  ['P4', 'historical_so_check_lines'],
  ['P5', 'historical_so_write_children'],
  ['P6', 'historical_so_write_children'],
  ['P7c', 'historical_so_write_children'],
  ['P7a', 'historical_so_write_children'],
  ['P7b', 'historical_so_write_children'],
  ['P3', 'approve_historical_sales_order'],
]);
/* แถวที่ปะเป็น "บล็อก" มีป้าย ▶ … ◀ · P7a/P7b ปะในบรรทัด (ป้ายเดียว) */
const INLINE = new Set(['P7a', 'P7b']);
/* แถวที่ "แทน" ข้อความเดิม (ไม่ใช่เติม) — ถอยกลับต้องคืนข้อความเดิมตรงตัว */
const REPLACING = new Set(['P3', 'P8', 'P9a', 'P9b']);

const EXPECTED_ANCHORS = Object.freeze({
  P8: String.raw`-- ใบย้อนหลังมีเส้นเปิดรอบของตัวเอง \(0374\)[^\n]*\n\s*IF NOT \(v_order\.origin = 'pipeline'\) THEN RETURN 0; END IF;\s*IF public\.sales_order_business_line\(v_order\.id\) IS DISTINCT FROM 'SERVICE' THEN RETURN 0; END IF;`,
  P9a: String.raw`IF NOT \(v_order\.origin = 'pipeline'\)\s*OR public\.sales_order_business_line\(v_order\.id\) IS DISTINCT FROM 'SERVICE' THEN\s*RETURN '\{\}';\s*END IF;`,
  P9b: String.raw`IF v_has_package AND \(v_order\."servicePeriodFrom" IS NULL OR v_order\."servicePeriodTo" IS NULL\) THEN`,
  P9c: String.raw`(v_errors := v_errors \|\| \('zones_missing:' \|\| v_line\.id\);\s*END IF;)`,
  P4: String.raw`(-- ส่วนลดรายการ — [^\n]*\n\s*IF \(v_dtype IS NOT NULL AND v_dtype NOT IN \('percent', 'amount'\)\))`,
  P5: String.raw`(DELETE FROM public\.sales_order_installments WHERE "salesOrderId" = p_order_id;)`,
  P6: String.raw`(IF v_inserted <> jsonb_array_length\(p_lines\) THEN RAISE EXCEPTION 'historical_so_line_invalid'; END IF;)`,
  P7c: String.raw`(DELETE FROM public\.sales_order_installments WHERE "salesOrderId" = p_order_id;)`,
  P7a: String.raw`"paidOn", note, status, evidence, "frozenAt"`,
  P7b: String.raw`(CASE WHEN x\.kind = 'opening' THEN NULLIF\(x\.i->>'paidOn', ''\)::date END,)`,
  P3: String.raw`INSERT INTO public\.service_zone_terms \([^;]*ORDER BY l\."sortOrder";`,
});

/* ปะทุกแถวตามลำดับบนข้อความที่โตทีละแถว (เหมือนวงของไฟล์) — ตรวจครั้งเดียวพอดีทั้ง prosrc และทั้งบล็อก */
function applyAll() {
  const texts = liveTexts();
  const hits = [];
  for (const row of patchRows()) {
    const t = texts[row.fn];
    hits.push({
      label: row.label,
      body: count(t.body, toJsRegExp(row.anchor)),
      full: count(t.full, toJsRegExp(row.anchor)),
      markerBefore: occurrences(t.body, row.marker),
    });
    t.body = t.body.replace(toJsRegExp(row.anchor, ''), toJsReplacement(row.replacement));
    t.full = t.full.replace(toJsRegExp(row.anchor, ''), toJsReplacement(row.replacement));
  }
  return { texts, hits };
}

/* ── บล็อกถอยกลับของหัวไฟล์ (DO $undo$ ในคอมเมนต์ — ลอก "--" + 6 ช่องว่างออก แบบเดียวกับฮาร์เนส) ── */
function undoBlock() {
  const from = HEADER.indexOf('--      DO $undo$');
  const to = HEADER.indexOf('END $undo$;', from);
  assert.ok(from >= 0 && to > from, 'หัวไฟล์ต้องมีบล็อก DO $undo$ … END $undo$;');
  return HEADER.slice(from, to + 'END $undo$;'.length).split('\n').map((l) => l.replace(/^--\s{6}/, '')).join('\n');
}
function undoRows() {
  const block = undoBlock();
  return [...block.matchAll(/\('([a-z_]+)',\s*\$u\$([\s\S]*?)\$u\$,\s*(?:\$o\$([\s\S]*?)\$o\$|'')\)/g)]
    .map((m) => ({ fn: m[1], pattern: m[2], original: m[3] ?? '' }));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */

test('0394: มีไฟล์ · ทรานแซกชันเดียว · NOTIFY หลัง COMMIT · ด่านก่อนรันสองข้อ', () => {
  assert.ok(EXISTS, `ต้องมี supabase/migrations/${FILE}`);
  assert.match(BODY, /^BEGIN;/);
  assert.match(CODE, /^COMMIT;\s*\n\s*NOTIFY pgrst, 'reload schema';\s*$/m);
  const [pre] = dollar('pre');
  assert.ok(pre, 'ต้องมี DO $pre$');
  // 0392 ต้องรันแล้ว — ทุกรอบ
  assert.match(pre, /to_regclass\('public\.sales_order_line_zones'\) IS NULL[\s\S]*?p\.proname = 'sales_order_open_service_terms'[\s\S]*?RAISE EXCEPTION 'mig_0394_needs_0392/);
  // ใบย้อนหลังที่ยังไม่อนุมัติ — เฉพาะรันครั้งแรก (ยังไม่มีป้าย P3)
  assert.match(pre, /IF NOT EXISTS \([\s\S]*?p\.proname = 'approve_historical_sales_order'[\s\S]*?strpos\(p\.prosrc, '0394\/P3'\) > 0[\s\S]*?\) THEN[\s\S]*?o\.origin = 'historical' AND o\.status IN \('draft', 'pending_approval', 'rejected'\)[\s\S]*?RAISE EXCEPTION 'mig_0394_historical_in_flight[\s\S]*?END IF;\s*END IF;/);
  assert.ok(CODE.indexOf('$pre$') < CODE.indexOf('$patch$') && CODE.indexOf('$patch$') < CODE.indexOf('$verify$'),
    'ลำดับ: ด่าน → ปะ → ตรวจท้าย');
});

test('🔴 0394 ไม่มีข้อความ "FUNCTION public." ที่ไหนเลย (แม้ในคอมเมนต์) — ยาม "นิยามล่าสุด" หลายตัวหาด้วยข้อความนี้', () => {
  assert.ok(!RAW.includes('FUNCTION public.'), 'ห้ามมี "FUNCTION public." ในไฟล์');
  assert.doesNotMatch(RAW, /FUNCTION\s+public\./);
  assert.doesNotMatch(CODE, /\bON FUNCTION\b/, 'ไม่มี REVOKE/GRANT — CREATE OR REPLACE คงสิทธิ์เดิม');
});

test('0394: ไม่มี DDL อื่นนอกจากเขียนฟังก์ชันเดิมใหม่ · ไม่ backfill (check:columns ไม่แดง)', () => {
  assert.doesNotMatch(CODE, /\b(CREATE|ALTER|DROP|TRUNCATE|COMMENT ON)\b/, 'ไม่มี CREATE/ALTER/DROP ในตัวไฟล์');
  assert.doesNotMatch(CODE, /ADD COLUMN/);
  const outsideDollar = CODE.replace(/\$([a-z]*)\$[\s\S]*?\$\1\$/g, '');
  assert.doesNotMatch(outsideDollar, /\b(INSERT INTO|UPDATE|DELETE FROM)\b/, 'ไม่มี DML นอกบล็อก DO');
  assert.doesNotMatch(CODE, /EXECUTE\s+format/i);
  // ทางเขียนเดียวคือ EXECUTE regexp_replace(pg_get_functiondef(...)) ของวงปะ
  assert.equal(count(CODE, /EXECUTE /g), 1);
});

test('0394: แถวปะ 11 แถวตามลำดับแผน · anchor ตรงตัวหนังสือ · ป้าย = 0394/Px', () => {
  const rows = patchRows();
  assert.deepEqual(rows.map((r) => [r.label, r.fn]), EXPECTED_ROWS.map(([l, f]) => [l, f]));
  for (const row of rows) {
    assert.equal(row.marker, `0394/${row.label}`);
    assert.equal(row.anchor, EXPECTED_ANCHORS[row.label], `${row.label}: anchor`);
    // replacement ของ PG: มีแค่ \1 เป็นอักขระพิเศษ — ห้ามมี backslash อื่น (ถูกกินเงียบ)
    assert.ok(!row.replacement.replace(/\\1/g, '').includes('\\'), `${row.label}: replacement มี backslash แปลก`);
    if (INLINE.has(row.label)) {
      assert.equal(occurrences(row.replacement, row.marker), 1, `${row.label}: ป้ายในบรรทัดครั้งเดียว`);
    } else {
      assert.equal(occurrences(row.replacement, `-- ${row.marker} ▶`), 1, `${row.label}: ป้ายเปิด`);
      assert.equal(occurrences(row.replacement, `-- ${row.marker} ◀`), 1, `${row.label}: ป้ายปิด`);
      assert.ok(row.replacement.replace(/^\\1\n\s*/, '').startsWith(`-- ${row.marker} ▶`), `${row.label}: บล็อกขึ้นต้นด้วยป้ายเปิด`);
    }
  }
  // ป้ายของแถวหนึ่งต้องไม่โผล่ในแถวอื่น — ไม่งั้นวงเห็น "ปะไว้แล้ว" แล้วข้ามแถวนั้นเงียบ ๆ
  for (const a of rows) {
    for (const b of rows) {
      if (a !== b) assert.ok(!b.replacement.includes(a.marker), `${b.label} พูดถึงป้าย ${a.marker}`);
    }
  }
  // แถวที่เติม "หลัง" anchor ขึ้นต้นด้วย \1 · แถวที่เติม "ก่อน" จบด้วย \1
  for (const label of ['P9c', 'P6', 'P7b']) assert.match(rows.find((r) => r.label === label).replacement, /^\\1\n/, label);
  for (const label of ['P4', 'P5', 'P7c']) assert.match(rows.find((r) => r.label === label).replacement, /\n\s*\\1$/, label);
  for (const label of REPLACING) assert.ok(!rows.find((r) => r.label === label).replacement.includes('\\1'), label);
});

test('0394: วงปะ = วงของ 0392 (overload = 1 · มีป้าย = ข้าม · นับ anchor สองที่ · regexp_replace บน pg_get_functiondef)', () => {
  const [loop] = dollar('patch');
  assert.match(loop, /IF v_n <> 1 THEN\s+RAISE EXCEPTION 'mig_0394_patch_overload/);
  assert.match(loop, /IF strpos\(v_src, r\.marker\) > 0 THEN\s+RAISE NOTICE '0394: % % — ปะไว้แล้ว', r\.marker, r\.fn;\s+CONTINUE;/);
  assert.match(loop, /regexp_matches\(v_src, r\.anchor, 'g'\)/);
  assert.match(loop, /regexp_matches\(v_def, r\.anchor, 'g'\)/);
  assert.match(loop, /IF v_hits_src <> 1 OR v_hits_def <> 1 THEN\s+RAISE EXCEPTION 'mig_0394_patch_anchor/);
  assert.match(loop, /EXECUTE regexp_replace\(v_def, r\.anchor, r\.replacement\);/);
  assert.match(loop, /RAISE NOTICE '0394: % % — ปะแล้ว', r\.marker, r\.fn;/);
});

test('🔴 ทุก anchor เจอครั้งเดียวพอดีในนิยามที่ใช้อยู่จริง (ตามลำดับแถว บนข้อความที่โตทีละแถว) · ป้ายยังไม่มีก่อนปะ', () => {
  // นิยามล่าสุดใน repo ยังเป็นไฟล์ที่เทสต์นี้อ่าน — ไฟล์ใหม่นิยามทับ = ต้องตรวจ anchor ของ 0394 ใหม่
  for (const [fn, file] of Object.entries(OWNER_FILE)) {
    const marker = `CREATE OR REPLACE FUNCTION public.${fn}(`;
    const owners = sqlFiles().filter((name) => read(name).includes(marker));
    assert.equal(owners.at(-1), file, `${fn}: นิยามล่าสุดต้องเป็น ${file}`);
  }
  const { texts, hits } = applyAll();
  for (const h of hits) {
    assert.equal(h.body, 1, `${h.label}: prosrc`);
    assert.equal(h.full, 1, `${h.label}: ทั้งบล็อก (≈ pg_get_functiondef)`);
    assert.equal(h.markerBefore, 0, `${h.label}: ป้ายต้องยังไม่มีก่อนปะ`);
  }
  // หลังปะ: ป้ายละครั้งเดียว (บล็อก = ▶ หนึ่ง ◀ หนึ่ง)
  for (const row of patchRows()) {
    const body = texts[row.fn].body;
    if (INLINE.has(row.label)) assert.equal(occurrences(body, row.marker), 1, row.label);
    else {
      assert.equal(occurrences(body, `-- ${row.marker} ▶`), 1, `${row.label} ▶`);
      assert.equal(occurrences(body, `-- ${row.marker} ◀`), 1, `${row.label} ◀`);
    }
  }
  // P3 · P8 · P9a · P9b · P7b ไม่มีข้อความ anchor ของตัวเองเหลือ (รันซ้ำไม่เจอซ้อน — และป้ายข้ามอยู่แล้ว)
  for (const row of patchRows().filter((r) => ['P3', 'P8', 'P9a', 'P9b', 'P7a', 'P7b'].includes(r.label))) {
    const left = count(texts[row.fn].body, toJsRegExp(row.anchor));
    assert.equal(left, row.label === 'P7b' ? 1 : 0, `${row.label}: anchor หลังปะ`);
  }
});

test('P3: ขั้น ④ ของการอนุมัติใบย้อนหลังเปิดรอบขายผ่าน sales_order_open_service_terms แล้วอ่านใบใหม่ · ไม่มี SZT-H', () => {
  const { texts } = applyAll();
  const body = texts.approve_historical_sales_order.body;
  const perform = body.indexOf('PERFORM public.sales_order_open_service_terms(v_order.id, p_actor_id, p_actor_name);');
  const reread = body.indexOf('SELECT * INTO v_order FROM public.sales_orders WHERE id = v_order.id;');
  assert.ok(perform > 0 && reread > perform, 'PERFORM ตัวกลาง → อ่านใบใหม่');
  assert.equal(occurrences(body, 'sales_order_open_service_terms('), 1);
  assert.ok(!body.includes('SZT-H'), 'ไม่มี id SZT-H แล้ว');
  assert.ok(!body.includes('INSERT INTO public.service_zone_terms'), 'ไม่เขียน term เอง');
  // ขั้น ①②③ อยู่ครบ ลำดับเดิม · RETURN สองจุด (กดซ้ำ + ปกติ)
  const contract = body.indexOf('PERFORM public.approve_external_sales_contract(');
  const approve = body.indexOf("status = 'approved',");
  const freeze = body.indexOf('"frozenAt" = now(),');
  const finalReturn = body.lastIndexOf('RETURN jsonb_build_object(');
  assert.ok(contract > 0 && contract < approve && approve < freeze && freeze < perform && reread < finalReturn,
    'ลำดับ: ① สัญญา → ② อนุมัติ → ③ หยุดยอดงวด → ④ ตัวกลาง → RETURN');
  assert.equal(occurrences(body, 'RETURN jsonb_build_object('), 2);
  // สิ่งที่คืนยังอ่าน term ของใบ (ที่ตัวกลางเพิ่งเขียน) + ใบที่มีตรา
  assert.match(body.slice(finalReturn), /'order', to_jsonb\(v_order\)/);
  assert.match(body.slice(finalReturn), /FROM public\.service_zone_terms t WHERE t\."salesOrderId" = v_order\.id/);
  // ตำแหน่งผู้อนุมัติของ 0382 ยังอยู่ (ปะทับนิยามที่ปะแล้ว ไม่ใช่นิยามของ 0374 ตรง ๆ)
  assert.match(body, /NOT public\.is_sales_manager_role\(p_actor_role\)/);
  assert.match(texts.approve_historical_sales_order.full, /SECURITY DEFINER/);
});

test('0374\'s step ④ is not what runs after 0394 (L5) — ยาม 0374 ยังอ่าน "นิยามล่าสุด" เป็นไฟล์ 0374 ซึ่งมี SZT-H', () => {
  const { texts } = applyAll();
  const live = texts.approve_historical_sales_order.body;
  assert.ok(!live.includes('SZT-H') && !live.includes('INSERT INTO public.service_zone_terms'), 'ตัวที่รันจริงหลัง 0394 ไม่มีขั้น ④ ของ 0374');
  // historicalApprovalMigration.test.mjs หา "นิยามล่าสุด" ด้วย CREATE OR REPLACE FUNCTION → ยังได้ 0374 (ตัวหนังสือก่อน 0394)
  const marker = 'CREATE OR REPLACE FUNCTION public.approve_historical_sales_order(';
  const owners = sqlFiles().filter((name) => read(name).includes(marker));
  assert.equal(owners.at(-1), '0374_historical_so_approval_flow.sql');
  assert.ok(functionBlock(read(owners.at(-1)), 'approve_historical_sales_order').body.includes("'SZT-H'"),
    'ตัวหนังสือที่ยาม 0374 อ่านยังมี SZT-H — ยามนั้นบรรยายของก่อน 0394 ไม่ใช่ของที่รันจริง');
  // และหัวไฟล์ของยามนั้นบอกไว้
  const guard = readFileSync(new URL('./historicalApprovalMigration.test.mjs', import.meta.url), 'utf8');
  assert.match(guard.slice(0, guard.indexOf('import ')), /0394\/P3/);
  assert.match(guard.slice(0, guard.indexOf('import ')), /historicalServiceAlignmentMigration\.test\.mjs/);
});

test('P4: ตัวตรวจบรรทัด — รอบบริการบังคับ · แพ็คต่อรอบ (มีคีย์) จำนวนเต็ม 1–9999 · หลังด่านรูปทรงใหญ่ ก่อนส่วนลด', () => {
  const { texts } = applyAll();
  const body = texts.historical_so_check_lines.body;
  const bigIf = body.indexOf("OR length(btrim(COALESCE(v_item->>'description', ''))) > 200 THEN");
  const rounds = body.indexOf("IF v_rounds IS NULL THEN RAISE EXCEPTION 'historical_so_line_rounds_required'; END IF;");
  const packs = body.indexOf("RAISE EXCEPTION 'historical_so_line_packs_invalid';");
  const discount = body.indexOf("IF (v_dtype IS NOT NULL AND v_dtype NOT IN ('percent', 'amount'))");
  assert.ok(bigIf > 0 && bigIf < rounds && rounds < packs && packs < discount, 'ลำดับ: รูปทรง → รอบ → แพ็ค → ส่วนลด');
  const p4 = body.slice(body.indexOf('-- 0394/P4 ▶'), body.indexOf('-- 0394/P4 ◀'));
  // คีย์ไม่มี = หลวม (ขั้นส่ง/อนุมัติประกอบแถวที่เก็บแล้วโดยไม่มีคีย์นี้) · มีคีย์ = ต้องเป็นตัวเลขจำนวนเต็ม 1–9999
  assert.match(squeeze(p4), /IF v_item \? 'packsPerRound' AND \( CASE WHEN jsonb_typeof\(v_item->'packsPerRound'\) = 'number' THEN \(v_item->>'packsPerRound'\)::numeric NOT BETWEEN 1 AND 9999 OR \(v_item->>'packsPerRound'\)::numeric <> trunc\(\(v_item->>'packsPerRound'\)::numeric\) ELSE true END\) THEN/);
  // ด่านรอบเดิมของ 0374 (≤ 0 = รูปทรงผิด) ยังอยู่
  assert.match(body, /OR COALESCE\(v_rounds, 1\) <= 0/);
});

test('P5/P6/P7: ตัวเขียน — แพ็คต่อรอบเข้ม · วันวางบิล ตรวจก่อนลบของเดิม · แถวโซน 1 แถวต่อบรรทัด · คอลัมน์ billingDate', () => {
  const { texts } = applyAll();
  const body = texts.historical_so_write_children.body;
  const state = body.indexOf("RAISE EXCEPTION 'historical_so_edit_state_invalid';");
  const price = body.indexOf("RAISE EXCEPTION 'historical_so_line_price_not_registry';");
  const p5 = body.indexOf("RAISE EXCEPTION 'historical_so_line_packs_invalid';");
  const p7c = body.indexOf("RAISE EXCEPTION 'historical_so_installment_invalid';");
  const del = body.indexOf('DELETE FROM public.sales_order_installments WHERE "salesOrderId" = p_order_id;');
  assert.ok(state > 0 && state < price && price < p5 && p5 < p7c && p7c < del, 'ด่านทุกตัวมาก่อน DELETE (ตีกลับแล้วของเดิมอยู่ครบ)');
  // P5 เข้ม: ทุกบรรทัดต้องพกคีย์เป็นตัวเลข (ไม่พก/สตริง/null = ฟอร์มรุ่นก่อน)
  const p5Block = squeeze(body.slice(body.indexOf('-- 0394/P5 ▶'), body.indexOf('-- 0394/P5 ◀')));
  assert.match(p5Block, /CASE WHEN jsonb_typeof\(e\.l->'packsPerRound'\) = 'number' THEN \(e\.l->>'packsPerRound'\)::numeric END AS v/);
  assert.match(p5Block, /WHERE x\.v IS NULL OR x\.v <> trunc\(x\.v\) OR x\.v < 1 OR x\.v > 9999/);
  // P6: หลังนับบรรทัดครบ ก่อนเขียนงวด · id/โซน/แพ็คตามแผน · นับแถวโซนครบด้วย
  const lineCount = body.indexOf("IF v_inserted <> jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'historical_so_line_invalid'; END IF;");
  const zones = body.indexOf('INSERT INTO public.sales_order_line_zones');
  const inst = body.indexOf('INSERT INTO public.sales_order_installments');
  assert.ok(lineCount > 0 && lineCount < zones && zones < inst, 'ลำดับ: บรรทัด → นับ → แถวโซน → งวด');
  const p6 = squeeze(body.slice(body.indexOf('-- 0394/P6 ▶'), body.indexOf('-- 0394/P6 ◀')));
  assert.match(p6, /INSERT INTO public\.sales_order_line_zones \( id, "salesOrderId", "salesOrderLineId", "zoneId", "packsPerRound", "sortOrder", "createdById", "createdByName", "createdAt", "updatedAt" \)/);
  assert.match(p6, /SELECT 'SLZ-' \|\| md5\(sol\.id \|\| ':' \|\| sol\."serviceZoneId"\), p_order_id, sol\.id, sol\."serviceZoneId", \(e\.l->>'packsPerRound'\)::numeric::integer, 0,/);
  assert.match(p6, /FROM jsonb_array_elements\(p_lines\) WITH ORDINALITY AS e\(l, ord\) JOIN public\.sales_order_lines sol ON sol\.id = 'SOL-' \|\| md5\(p_order_id \|\| ':' \|\| e\.ord\) AND sol\."salesOrderId" = p_order_id;/);
  assert.match(p6, /GET DIAGNOSTICS v_inserted = ROW_COUNT; IF v_inserted <> jsonb_array_length\(p_lines\) THEN RAISE EXCEPTION 'historical_so_line_invalid'; END IF;/);
  // สูตร id ของบรรทัดใน P6 = สูตรของ INSERT บรรทัดเดิม (0379)
  assert.match(body, /'SOL-' \|\| md5\(p_order_id \|\| ':' \|\| e\.ord\), p_order_id, NULL, z\.id,/);
  // P7c: งวดยกมาห้ามมีวันวางบิล · รูป YYYY-MM-DD · ปี 2000–2100 · วันที่ไม่มีจริงแปลเป็นรหัสเดียวกัน
  const p7cBlock = squeeze(body.slice(body.indexOf('-- 0394/P7c ▶'), body.indexOf('-- 0394/P7c ◀')));
  assert.match(p7cBlock, /COALESCE\(NULLIF\(e\.i->>'kind', ''\), 'regular'\) = 'opening'/);
  assert.match(p7cBlock, /\(e\.i->>'billingDate'\) !~ '\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$'/);
  assert.match(p7cBlock, /NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'/);
  assert.match(p7cBlock, /EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'historical_so_installment_invalid';/);
  // P7a/P7b: คอลัมน์ billingDate ต่อจาก paidOn ทั้งรายการคอลัมน์และรายการค่า · งวดยกมาได้ NULL เสมอ
  const insert = body.slice(inst, body.indexOf(') AS x;', inst));
  const plain = insert.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
  const cols = plain.slice(plain.indexOf('(') + 1, plain.indexOf(')\n')).split(',').map((c) => c.trim()).filter(Boolean);
  assert.equal(cols[cols.indexOf('"paidOn"') + 1], '"billingDate"');
  const select = plain.slice(plain.indexOf('SELECT') + 'SELECT'.length, plain.lastIndexOf('FROM ('));
  const values = topLevelItems(select);
  assert.equal(values.length, cols.length, 'จำนวนค่า = จำนวนคอลัมน์');
  assert.equal(squeeze(values[cols.indexOf('"paidOn"')]), "CASE WHEN x.kind = 'opening' THEN NULLIF(x.i->>'paidOn', '')::date END");
  assert.equal(squeeze(values[cols.indexOf('"billingDate"')]), "CASE WHEN x.kind = 'opening' THEN NULL ELSE NULLIF(x.i->>'billingDate', '')::date END");
});

test('P8/P9: ตัวกลางรับใบย้อนหลัง — ไม่ถามสายธุรกิจ · ไม่ถามช่วงบริการหัวใบ · โซนต้องตรงบรรทัด · ใบ pipeline เหมือนเดิม', () => {
  const { texts } = applyAll();
  const open = squeeze(texts.sales_order_open_service_terms.body);
  // กติกา 14: ตัวหนังสือ origin = 'pipeline' ยังอยู่ · pipeline ที่ไม่ใช่ SERVICE ยังคืน 0 ไม่ตีตรา
  assert.ok(open.includes("IF NOT (v_order.origin = 'pipeline' OR v_order.origin = 'historical') THEN RETURN 0; END IF;"));
  assert.ok(open.includes("IF v_order.origin = 'pipeline' AND public.sales_order_business_line(v_order.id) IS DISTINCT FROM 'SERVICE' THEN RETURN 0; END IF;"));
  assert.ok(open.indexOf("origin = 'historical'") < open.indexOf('v_errors := public.sales_order_service_setup_errors(v_order.id);'));
  const errors = squeeze(texts.sales_order_service_setup_errors.body);
  assert.ok(errors.includes("IF NOT (v_order.origin = 'pipeline' OR v_order.origin = 'historical') OR (v_order.origin = 'pipeline' AND public.sales_order_business_line(v_order.id) IS DISTINCT FROM 'SERVICE') THEN RETURN '{}'; END IF;"));
  // period_missing เฉพาะใบ pipeline
  assert.match(errors, /IF v_order\.origin = 'pipeline' AND v_has_package AND \(v_order\."servicePeriodFrom" IS NULL OR v_order\."servicePeriodTo" IS NULL\) THEN -- 0394\/P9b ◀ v_errors := v_errors \|\| 'period_missing'::text;/);
  // ใบย้อนหลัง: 1 บรรทัด = 1 โซน = serviceZoneId ของบรรทัด — หลัง zones_missing ของบรรทัดเดียวกัน
  const p9c = errors.slice(errors.indexOf('-- 0394/P9c ▶'), errors.indexOf('-- 0394/P9c ◀'));
  assert.match(p9c, /IF v_order\.origin = 'historical' AND EXISTS \(SELECT 1 FROM public\.sales_order_line_zones a WHERE a\."salesOrderLineId" = v_line\.id\)/);
  assert.match(p9c, /\(SELECT count\(\*\) FROM public\.sales_order_line_zones a WHERE a\."salesOrderLineId" = v_line\.id\) <> 1/);
  assert.match(p9c, /a\."zoneId" IS NOT DISTINCT FROM sol\."serviceZoneId"/);
  assert.match(p9c, /v_errors := v_errors \|\| \('historical_zone_mismatch:' \|\| v_line\.id\);/);
  assert.ok(errors.indexOf("('zones_missing:' || v_line.id)") < errors.indexOf('-- 0394/P9c ▶'));
  assert.ok(errors.indexOf('-- 0394/P9c ◀') < errors.indexOf('FOR v_alloc IN'), 'ก่อนวนแถวโซน (packs_missing / zone_invalid)');
});

test('0394: ตรวจท้าย — ป้ายละครั้ง · approve ไม่มี SZT-H + SECURITY DEFINER + ตัวกลางครั้งเดียว · สิทธิ์ห้าตัว', () => {
  const [verify] = dollar('verify');
  assert.ok(verify, 'ต้องมี DO $verify$');
  for (const [label, fn] of EXPECTED_ROWS) {
    const needles = INLINE.has(label) ? [`0394/${label}`] : [`0394/${label} ▶`, `0394/${label} ◀`];
    for (const needle of needles) assert.ok(verify.includes(`('${fn}', '${needle}')`), `$verify$ ต้องนับ ${needle} ใน ${fn}`);
  }
  assert.match(verify, /\(length\(v_src\) - length\(replace\(v_src, r\.needle, ''\)\)\) \/ length\(r\.needle\)/);
  assert.match(verify, /RAISE EXCEPTION 'mig_0394_verify marker/);
  assert.match(verify, /strpos\(p\.prosrc, 'SZT-H'\) = 0/);
  assert.match(verify, /p\.prosecdef/);
  assert.match(verify, /'sales_order_open_service_terms\('/);
  const sigs = {
    approve: 'public.approve_historical_sales_order(text,timestamptz,text,text,text,text,text,uuid,text,text,integer)',
    check: 'public.historical_so_check_lines(jsonb,text)',
    write: 'public.historical_so_write_children(text,jsonb,jsonb,numeric,text,text)',
    open: 'public.sales_order_open_service_terms(text,text,text)',
    errors: 'public.sales_order_service_setup_errors(text)',
  };
  for (const sig of Object.values(sigs)) assert.ok(verify.includes(`'${sig}'`), `$verify$ ต้องตรวจสิทธิ์ ${sig}`);
  assert.match(verify, /has_function_privilege\('anon', v_fn, 'EXECUTE'\)/);
  assert.match(verify, /has_function_privilege\('authenticated', v_fn, 'EXECUTE'\)/);
  // service_role: ห้ามเรียกตัวช่วยใบย้อนหลังตรง (0374/0379 ถอนไว้) · ต้องเรียก RPC อนุมัติ + ตัวกลางสองตัวของ 0392 ได้
  assert.match(verify, /has_function_privilege\('service_role', v_fn, 'EXECUTE'\) IS DISTINCT FROM r\.service_role/);
  for (const [sig, expected] of [[sigs.approve, true], [sigs.check, false], [sigs.write, false], [sigs.open, true], [sigs.errors, true]]) {
    assert.ok(squeeze(verify).includes(`('${sig}', ${expected})`), `${sig} service_role = ${expected}`);
  }
});

test('0394: หัวไฟล์ — ทำไม/ทำอะไร · SELECT ตรวจหลังรันพร้อมค่าที่คาด · ถอยกลับ · ลำดับ deploy · รันมือ · รันซ้ำได้ · ไม่มีคอลัมน์ใหม่', () => {
  for (const s of ['AS hist_in_flight', 'AS p3', 'AS p4', 'AS p5_p7', 'AS p8', 'AS p9', 'AS approve_definer', 'AS anon_approve', 'AS hist_terms_s',
    "has_function_privilege('anon',"]) {
    assert.ok(HEADER.includes(s), `หัวไฟล์ต้องมี ${s}`);
  }
  assert.match(HEADER, /hist_in_flight = 0 · p3 = 1 · p4 = 1 · p5_p7 = 1 · p8 = 1 · p9 = 1 · approve_definer = t · anon_approve = f · hist_terms_s = 0/);
  assert.match(HEADER, /DO \$undo\$/);
  assert.match(HEADER, /ลำดับ deploy/);
  assert.match(HEADER, /freeze/);
  assert.match(HEADER, /⚠️ DDL — รันมือบน Supabase SQL Editor/);
  assert.match(HEADER, /✅ รันซ้ำได้/);
  assert.match(HEADER, /ไม่มีคอลัมน์ใหม่ — check:columns ไม่แดง/);
  assert.match(HEADER, /mig_0394_historical_in_flight/);
  assert.match(HEADER, /mig_0394_needs_0392/);
  assert.match(HEADER, /PGlite/);
  for (const [label] of EXPECTED_ROWS) assert.ok(HEADER.includes(label), `หัวไฟล์ต้องอธิบาย ${label}`);
});

test('0394: บล็อกถอยกลับของหัวไฟล์คืนนิยามทั้งห้าตัวกลับเป็นของก่อน 0394 ตรงตัว', () => {
  const { texts } = applyAll();
  const before = liveTexts();
  const rows = undoRows();
  assert.equal(rows.length, 11, 'ถอยกลับครบ 11 แถว');
  for (const row of rows) {
    assert.ok(!row.original.includes('\\'), `${row.fn}: ข้อความเดิมมี backslash (replacement ของ PG จะกิน)`);
    const t = texts[row.fn];
    const re = new RegExp(row.pattern, 's');
    assert.equal(count(t.body, new RegExp(row.pattern, 'gs')), 1, `${row.fn}: รูปถอย ${row.pattern.slice(0, 40)} ต้องเจอครั้งเดียว`);
    t.body = t.body.replace(re, () => row.original);
  }
  for (const fn of Object.keys(OWNER_FILE)) assert.equal(texts[fn].body, before[fn].body, `${fn}: ถอยกลับแล้วต้องเท่าของเดิม`);
  // บล็อกถอยเช็คครั้งเดียวพอดีบน pg_get_functiondef ก่อน EXECUTE
  const block = undoBlock();
  assert.match(block, /regexp_matches\(v_def, r\.pattern, 'g'\)/);
  assert.match(block, /EXECUTE regexp_replace\(v_def, r\.pattern, r\.original\);/);
});

test('ทุกรหัสที่ 0394 โยนมีข้อความไทย · historical_zone_mismatch มีข้อความของรายการที่ยังขาด (D2b)', () => {
  const raised = new Set([...CODE.matchAll(/RAISE EXCEPTION '([a-z0-9_]+)/g)].map((m) => m[1]));
  assert.deepEqual([...raised].sort(), [
    'historical_so_installment_invalid', 'historical_so_line_invalid', 'historical_so_line_packs_invalid',
    'historical_so_line_rounds_required', 'mig_0394_historical_in_flight', 'mig_0394_needs_0392',
    'mig_0394_patch_anchor', 'mig_0394_patch_overload', 'mig_0394_verify',
  ]);
  const missing = [...raised].filter((code) => !WORKFLOW_ERROR_CODES.includes(code));
  assert.deepEqual(missing, [], 'รหัสที่ยังไม่มีข้อความไทย (documentWorkflowErrors.js)');
  // ขั้นอนุมัติใบย้อนหลังเรียกตัวกลางแล้ว — รหัสของตัวกลางที่ใบย้อนหลังเจอได้ต้องแปลได้ด้วย
  assert.ok(WORKFLOW_ERROR_CODES.includes('service_setup_legacy_terms_exist'), 'service_setup_legacy_terms_exist');
  assert.ok(historicalCopy.HISTORICAL_SETUP_ISSUE_TEXT?.historical_zone_mismatch, 'HISTORICAL_SETUP_ISSUE_TEXT.historical_zone_mismatch');
});

test('ตัวเลขตรงกับ JS และ CHECK: แพ็คต่อรอบ 1–9999 (P4/P5 = HISTORICAL_SERVICE_LIMITS = 0392) · วันวางบิล 2000–2100 (P7c = 0389)', () => {
  const rows = patchRows();
  const p4 = rows.find((r) => r.label === 'P4').replacement;
  const p5 = rows.find((r) => r.label === 'P5').replacement;
  const [, lo4, hi4] = /NOT BETWEEN (\d+) AND (\d+)/.exec(p4);
  const [, lo5, hi5] = /x\.v < (\d+) OR x\.v > (\d+)/.exec(p5);
  const [, loChk, hiChk] = /"packsPerRound" BETWEEN (\d+) AND (\d+)/.exec(stripComments(read('0392_so_service_setup.sql')));
  assert.deepEqual([lo4, hi4], [lo5, hi5]);
  assert.deepEqual([lo4, hi4], [loChk, hiChk]);
  const limits = historicalPlan.HISTORICAL_SERVICE_LIMITS;
  assert.ok(limits, 'historicalOrderPlan.js ต้อง export HISTORICAL_SERVICE_LIMITS');
  assert.deepEqual([String(limits.packsMin), String(limits.packsMax)], [lo4, hi4]);
  const p7c = rows.find((r) => r.label === 'P7c').replacement;
  const [, from, to] = /NOT BETWEEN DATE '([0-9-]+)' AND DATE '([0-9-]+)'/.exec(p7c);
  const check = /"billingDate" IS NULL OR "billingDate" BETWEEN '([0-9-]+)' AND '([0-9-]+)'/.exec(read('0389_customer_billing_rule.sql'));
  assert.deepEqual([from, to], [check[1], check[2]]);
});

/* ── ตัวช่วยแยกรายการระดับบนสุด (วงเล็บ/เครื่องหมายคำพูดซ้อน) ───────────────────────────────────── */
function topLevelItems(text) {
  const out = [];
  let depth = 0; let quote = null; let cur = '';
  for (const ch of text) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
