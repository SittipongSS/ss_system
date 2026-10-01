// ── ยามตัวหนังสือของ mig 0400 (SO บริการ: ช่วงบริการ "ทั้งใบช่วงเดียว | แยกรายรายการ" — สวิตช์ · มติเจ้าของ 01/10) ─────────
//
// ⭐ 0400 ทำสองท่าในไฟล์เดียว และยามนี้ล็อกทั้งสองท่า:
//    1) **เขียนทับทั้งตัว** สามฟังก์ชันที่เกิดใน 0392 และไม่เคยถูกไฟล์ไหนปะ (save · copy · guard) — ด่านก่อนรันเทียบ md5 ของเนื้อที่
//       รันอยู่กับเนื้อใน 0392 ⇒ ค่าคงที่สามตัวในไฟล์ต้องเท่า md5 ที่คิดใหม่จากไฟล์ 0392 (แก้ 0392 แล้วลืมแก้ที่นี่ = เจ้าของรันไม่ผ่าน)
//       และเนื้อใหม่ต้องเป็น "เนื้อของ 0392 + ของที่เติม" (บรรทัดของ 0392 ที่หาย/ถูกแก้ ต้องอยู่ในรายการที่ประกาศไว้ข้างล่างเท่านั้น
//       ⇒ โหมด "ทั้งใบช่วงเดียว" ทำงานเหมือนเดิมตามตัวอักษร)
//    2) **ปะตัวที่รันอยู่จริง** หนึ่งตัว (ตัวตรวจรายการที่ยังขาด — มีแพตช์ P9a/P9b/P9c ของ 0394 อยู่แล้ว) ด้วย pg_get_functiondef
//       ⇒ ยามนี้ประกอบเนื้อที่รันอยู่จากตัวหนังสือ repo (0392 + แถวของ 0394) แล้วล็อกว่า anchor ของ L1/L2 เจอ **ครั้งเดียวพอดี**
// ⚠️ อ่าน **ตัวหนังสือ SQL** · พฤติกรรมจริงพิสูจน์บนฮาร์เนส PGlite นอก repo (mockups/so-service-lines/pglite-harness/harness-0400.mjs —
//    รันไฟล์สองรอบ + รอบสามบนฐานที่มีข้อมูล · โหมดทั้งใบเทียบผลกับฐานที่ไม่มี 0400 · โหมดแยกรายรายการทั้งเส้น · บล็อกถอยกลับของหัวไฟล์)
// ⚠️ รหัส RAISE ใหม่สี่ตัว + ข้อ line_period_missing ต้องมีข้อความไทยฝั่ง JS — อยู่ที่ serviceSetupSqlParity.test.mjs (ไม่ซ้ำที่นี่)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE = '0400_so_service_line_period.sql';
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const RAW = read(FILE);
const SPLIT = RAW.indexOf('\nBEGIN;');
const HEADER = RAW.slice(0, SPLIT);
const BODY = RAW.slice(SPLIT + 1);
const CODE = stripComments(BODY);
const RAW_0392 = read('0392_so_service_setup.sql');
const md5 = (s) => createHash('md5').update(s).digest('hex');
const flat = (s) => s.replace(/\s+/g, ' ');
const occurrences = (text, needle) => text.split(needle).length - 1;
const dollar = (tag, text = CODE) => [...text.matchAll(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`, 'g'))].map((m) => m[1]);

/* สามฟังก์ชันที่ไฟล์นี้เป็นเจ้าของนิยาม (เขียนทับตัวของ 0392) — ชื่อ → [ชนิดอาร์กิวเมนต์, ป้าย, md5 ของเนื้อใน 0392] */
const OWNED = Object.freeze({
  save_sales_order_service_setup: { args: 'text,timestamptz,jsonb,text,text,text', marker: '0400/F1', returns: 'jsonb' },
  sales_order_copy_service_setup: { args: 'text,text', marker: '0400/F2', returns: 'integer' },
  sales_order_service_setup_guard: { args: '', marker: '0400/F3', returns: 'trigger' },
});
const ERRORS_FN = 'sales_order_service_setup_errors';
/* 11 ตัวที่ไฟล์ต้องไม่แตะ (ตรวจท้ายเทียบ md5) */
const UNTOUCHED = Object.freeze(['approve_sales_order_with_signature_evidence_atomic', 'revise_approved_sales_order_atomic',
  'sales_order_open_service_terms', 'approve_sales_order_service_setup', 'submit_sales_order_service_setup',
  'reject_sales_order_service_setup', 'sales_order_service_setup_editable', 'sales_order_line_service_role',
  'sales_order_business_line', 'reopen_sales_order_service_setup', 'sales_order_service_reopen_blockers']);

/* นิยามในไฟล์: ชื่อ → { args, header, body (ตัดคอมเมนต์), raw (เนื้อดิบระหว่าง AS $$ กับ $$;) } */
function definitionsOf(rawSql) {
  const out = new Map();
  for (const m of rawSql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(([\s\S]*?)\)\s*RETURNS/g)) {
    const args = stripComments(m[2]).split(',').map((a) => a.trim()).filter(Boolean)
      .map((a) => a.replace(/\s+DEFAULT[\s\S]*$/i, '').split(/\s+/).pop()).join(',');
    const bodyFrom = rawSql.indexOf('AS $$', m.index) + 5;
    const bodyTo = rawSql.indexOf('\n$$;', bodyFrom);
    const raw = rawSql.slice(bodyFrom, bodyTo + 1);
    out.set(m[1], { args, header: rawSql.slice(m.index, bodyFrom), raw, body: stripComments(raw) });
  }
  return out;
}
const DEFS = definitionsOf(BODY);
const DEFS_0392 = definitionsOf(RAW_0392);
const body = (fn) => {
  const def = DEFS.get(fn);
  assert.ok(def, `0400 ต้องนิยาม ${fn}`);
  return def.body;
};
const order = (text, needles, label) => {
  const at = needles.map((n) => text.indexOf(n));
  at.forEach((i, k) => assert.ok(i >= 0, `${label}: ไม่พบ ${needles[k]}`));
  for (let k = 1; k < at.length; k += 1) assert.ok(at[k - 1] < at[k], `${label}: ${needles[k - 1]} ต้องมาก่อน ${needles[k]}`);
};

/* ── เนื้อที่รันอยู่จริงของตัวตรวจ = 0392 + แถว P9a/P9b/P9c ของ 0394 (ตามลำดับแถวของไฟล์) ───────────────────── */
/* ARE ของ Postgres → RegExp ของ JS (anchor ใช้แค่ \s \( \) \. \| \{ \} ซึ่งความหมายตรงกัน) · \1 ของ regexp_replace → $1 */
const toJsRegExp = (are, flags = 'g') => new RegExp(are, flags);
const toJsReplacement = (rp) => rp.replace(/\$/g, '$$$$').replace(/\\([1-9])/g, '$$$1');
function patchRowsOf(rawSql) {
  const start = rawSql.indexOf('DO $patch$');
  const block = rawSql.slice(start, rawSql.indexOf('$patch$;', start));
  const values = block.slice(block.indexOf('FROM (VALUES'), block.indexOf(') AS t(fn, anchor, replacement, marker)'));
  return [...values.matchAll(/\('([a-z_]+)',\s*\$re\$([\s\S]*?)\$re\$,\s*\$rp\$([\s\S]*?)\$rp\$,\s*'([^']+)'\)/g)]
    .map((m) => ({ fn: m[1], anchor: m[2], replacement: m[3], marker: m[4] }));
}
function liveErrors() {
  const from = RAW_0392.indexOf(`CREATE OR REPLACE FUNCTION public.${ERRORS_FN}(`);
  const to = RAW_0392.indexOf('\n$$;', from);
  const live = { full: RAW_0392.slice(from, to + 4), body: RAW_0392.slice(RAW_0392.indexOf('AS $$', from) + 5, to) };
  const rows = patchRowsOf(read('0394_historical_so_service_alignment.sql')).filter((r) => r.fn === ERRORS_FN);
  assert.deepEqual(rows.map((r) => r.marker), ['0394/P9a', '0394/P9b', '0394/P9c'], '0394 ปะตัวตรวจสามแถว');
  for (const row of rows) {
    for (const key of ['full', 'body']) {
      assert.equal((live[key].match(toJsRegExp(row.anchor)) || []).length, 1, `${row.marker}: anchor ของ 0394 ต้องเจอครั้งเดียว (${key})`);
      live[key] = live[key].replace(toJsRegExp(row.anchor, ''), toJsReplacement(row.replacement));
    }
  }
  return live;
}
const ROWS = patchRowsOf(BODY);
function patchedErrors() {
  const live = liveErrors();
  const out = { full: live.full, body: live.body };
  for (const row of ROWS) {
    for (const key of ['full', 'body']) out[key] = out[key].replace(toJsRegExp(row.anchor, ''), toJsReplacement(row.replacement));
  }
  return out;
}

test('0400: ทรานแซกชันเดียว · NOTIFY หลัง COMMIT · ไม่มีตารางชั่วคราว (ลายนิ้วมืออยู่ในตัวแปรของทรานแซกชัน) · ไม่ backfill', () => {
  assert.equal((BODY.match(/^BEGIN;/gm) || []).length, 1);
  assert.equal((BODY.match(/^COMMIT;/gm) || []).length, 1);
  assert.match(BODY, /\nCOMMIT;\n\nNOTIFY pgrst, 'reload schema';\n$/);
  /* SQL Editor เตือนตารางที่ไม่มี RLS — ไฟล์นี้ต้องไม่สร้างตารางใด ๆ (ชั่วคราวหรือถาวร) */
  assert.doesNotMatch(RAW, /CREATE\s+(GLOBAL\s+|LOCAL\s+)?(TEMP|TEMPORARY|UNLOGGED)\b/i);
  assert.doesNotMatch(CODE, /CREATE\s+TABLE/i);
  assert.doesNotMatch(RAW, /\bpg_temp\b/i);
  const pre = dollar('pre')[0];
  const verify = dollar('verify')[0];
  assert.ok(pre && verify, 'ต้องมี DO $pre$ และ DO $verify$');
  assert.match(pre, /PERFORM set_config\('mig_0400\.untouched', \(\s*SELECT jsonb_object_agg\(p\.proname, md5\(p\.prosrc\)\)::text/);
  assert.match(pre, /\), true\);\s*END\s*$/, 'set_config แบบ is_local = true (ตายตอนจบทรานแซกชัน)');
  assert.match(verify, /current_setting\('mig_0400\.untouched', true\)::jsonb/);
  assert.ok(CODE.indexOf('$pre$') < CODE.indexOf('ALTER TABLE'), 'ด่านก่อนรันต้องมาก่อน DDL ตัวแรก');
  /* ⛔ ไม่มี DML นอกตัวฟังก์ชัน/บล็อก DO — ใบที่มีอยู่ได้ 'whole' จากค่าตั้งต้นของคอลัมน์ */
  const outside = CODE.replace(/\$([a-z]*)\$[\s\S]*?\$\1\$/g, '');
  assert.doesNotMatch(outside, /\b(INSERT INTO|UPDATE|DELETE FROM) public\./);
  assert.doesNotMatch(CODE, /EXECUTE\s+format/i, 'DDL ผ่าน EXECUTE format = ยามคอลัมน์อ่านไม่เห็น');
});

test('0400: หัวไฟล์ — SELECT ตรวจหลังรัน + ค่าที่คาด · SELECT ตรวจก่อนรัน · รหัสด่านก่อนรัน · รหัสใหม่ · ลำดับ deploy · ถอยกลับสามขั้น · คำเตือน 0392', () => {
  for (const s of ['AS mode_col', 'AS line_cols', 'AS checks', 'AS line_mode', 'AS line_periods', 'AS f1', 'AS f2', 'AS f3', 'AS l1', 'AS l2',
    'AS trg_lines', 'AS trg_order', 'AS anon_save',
    "has_function_privilege('anon', 'public.save_sales_order_service_setup(text,timestamptz,jsonb,text,text,text)', 'EXECUTE')"]) {
    assert.ok(HEADER.includes(s), `หัวไฟล์ต้องมี ${s}`);
  }
  assert.match(flat(HEADER), /mode_col = 1 · line_cols = 2 · checks = 2 · line_mode = 0 · line_periods = 0 · f1 = 1 · f2 = 1 · f3 = 1 · l1 = 1 · l2 = 1 -- · trg_lines = t · trg_order = t · anon_save = f/);
  for (const s of ['mig_0400_needs_0396', 'mig_0400_live_body_differs', 'service_setup_period_mode_invalid (400)', 'service_setup_period_derived (409)',
    'service_setup_line_period_mode (400)', 'service_setup_line_period_invalid (400)', 'line_period_missing:<บรรทัด>', 'service_setup_not_package',
    'ลำดับ deploy', 'ห้าม deploy ก่อนรัน', 'ตรวจก่อนรัน', 'ตรวจหลังรัน', 'ถอยกลับ', 'DO $undo$', 'END $undo$;', 'ถอยโค้ดก่อนเสมอ',
    '⚠️ DDL — เจ้าของรันมือบน Supabase SQL Editor', '✅ รันซ้ำได้', 'ห้ามรัน 0392 ซ้ำหลังไฟล์นี้', '0399',
    'sales_orders."servicePeriodMode"', 'sales_order_lines."servicePeriodFrom"', '"periodMode"']) {
    assert.ok(HEADER.includes(s), `หัวไฟล์ต้องมี ${s}`);
  }
  /* ถอยกลับ: ถอดแพตช์ตัวตรวจก่อน (L2 อยู่ในช่วงป้าย P9b ของ 0394) → คืนสามฟังก์ชัน + trigger จาก 0392 → ลบคอลัมน์ */
  order(HEADER, ['1) ถอดแพตช์ L1/L2', '2) คืนเนื้อของ F1/F2/F3', '3) ALTER TABLE public.sales_order_lines DROP CONSTRAINT sales_order_lines_service_period_shape',
    'DROP COLUMN "servicePeriodFrom", DROP COLUMN "servicePeriodTo";',
    'ALTER TABLE public.sales_orders DROP CONSTRAINT sales_orders_service_period_mode_shape, DROP COLUMN "servicePeriodMode";',
    "NOTIFY pgrst, 'reload schema';"], 'ถอยกลับ');
  /* SELECT ตรวจก่อนรัน: md5 หกตัว (เนื้อใน 0392 · เนื้อของไฟล์นี้เอง) เดียวกับด่าน §0 */
  const pre = dollar('pre', BODY)[0];
  for (const [fn, { marker }] of Object.entries(OWNED)) {
    const row = new RegExp(`\\('${fn}', '${marker}', '([0-9a-f]{32})', '([0-9a-f]{32})'\\)`);
    const inHeader = row.exec(HEADER);
    const inGate = row.exec(pre);
    assert.ok(inHeader && inGate, `${fn}: ต้องมีแถว (ชื่อ, ป้าย, md5 ของ 0392, md5 ของไฟล์นี้) ทั้งในหัวไฟล์และในด่าน §0`);
    assert.equal(inHeader[1], inGate[1], `${fn}: md5 ของ 0392 ในหัวไฟล์ต้องเท่ากับในด่าน §0`);
    assert.equal(inHeader[2], inGate[2], `${fn}: md5 ของไฟล์นี้ในหัวไฟล์ต้องเท่ากับในด่าน §0`);
    assert.notEqual(inGate[1], inGate[2], `${fn}: เนื้อของ 0400 ต้องไม่เท่าเนื้อของ 0392`);
  }
  assert.ok(HEADER.includes("md5(translate(p.prosrc, E' \\t\\n\\r', '')) = x.body_md5 AS ok"));
  assert.ok(HEADER.includes('strpos(p.prosrc, x.marker) > 0 AS patched'));
  assert.ok(HEADER.includes("md5(translate(p.prosrc, E' \\t\\n\\r', '')) = x.own_md5 AS own"));
  assert.ok(HEADER.includes('AS x(fn, marker, body_md5, own_md5)'));
  /* คำเตือนรันซ้ำ (ตรวจทาน sql-rerun-reverts-later-patches): ไฟล์เขียนทับสามตัวทั้งตัว ⇒ ห้ามรันซ้ำหลังไฟล์ที่ใหม่กว่ามาปะ */
  assert.ok(HEADER.includes('⛔ ห้ามรันไฟล์นี้ซ้ำหลังมี migration ที่ใหม่กว่ามาปะ save / copy / guard'));
  assert.match(flat(HEADER), /patched = t แต่ own = f = มีไฟล์หลัง 0400 ปะฟังก์ชันนั้นไว้ ⇒ อย่ารันไฟล์นี้ซ้ำ/);
});

test('🔴 0400 §0: md5 สามตัวในไฟล์ = md5 ของเนื้อ save / copy / guard ใน 0392 (ตัดช่องว่าง/ขึ้นบรรทัด) — แก้ 0392 แล้วต้องคิดใหม่', () => {
  const pre = dollar('pre', BODY)[0];
  for (const [fn, { marker }] of Object.entries(OWNED)) {
    const def = DEFS_0392.get(fn);
    assert.ok(def, `0392 ต้องนิยาม ${fn}`);
    /* prosrc ของ Postgres = ข้อความระหว่าง $$ … $$ ตามตัวอักษร ⇒ md5(translate(prosrc, ' \t\n\r', '')) */
    const want = md5(def.raw.replace(/[ \t\n\r]/g, ''));
    assert.ok(pre.includes(`('${fn}', '${marker}', '${want}', '`), `${fn}: md5 ในด่าน §0 ต้องเป็น ${want} (คิดจากไฟล์ 0392)`);
  }
  /* กลไกของด่าน: md5 คิดก่อนเสมอ · มีป้ายแล้ว (รอบซ้ำ) = ต้องเท่าเนื้อของไฟล์นี้เอง แล้วข้าม · ไม่มีป้าย = ต้องเท่า 0392 · ไม่เท่า = หยุดทั้งไฟล์
     🐞 เดิม "มีป้าย = ข้าม" เฉย ๆ ⇒ ไฟล์หลัง 0400 ที่ปะ save/copy/guard (ป้าย 0400/Fx ยังอยู่ในเนื้อ) ถูก §3 เขียนทับเงียบ ๆ ตอนรันซ้ำ */
  assert.match(pre, /v_h := md5\(translate\(v_src, E' \\t\\n\\r', ''\)\);\s*IF strpos\(v_src, r\.marker\) > 0 THEN\s*IF v_h <> r\.own_md5 THEN\s*RAISE EXCEPTION 'mig_0400_live_body_differs % md5=%[^']*', r\.fn, v_h, r\.marker;\s*END IF;\s*CONTINUE;\s*END IF;\s*IF v_h <> r\.body_md5 THEN\s*RAISE EXCEPTION 'mig_0400_live_body_differs % md5=%/);
  assert.doesNotMatch(pre, /IF strpos\(v_src, r\.marker\) > 0 THEN CONTINUE;/, 'ห้ามข้ามโดยไม่เทียบเนื้อ');
  assert.ok(CODE.indexOf('$pre$') < CODE.indexOf('CREATE OR REPLACE FUNCTION'), 'ด่านเทียบเนื้อต้องมาก่อนการเขียนทับ');
  /* ต้องมีของ 0392/0394/0396 ครบ: 14 ฟังก์ชัน · ตารางโซนของบรรทัด · ป้าย P9b ของ 0394 ในตัวตรวจ */
  assert.match(pre, /IF v_n <> 14\s+OR to_regclass\('public\.sales_order_line_zones'\) IS NULL\s+OR NOT EXISTS \([\s\S]*?p\.proname = 'sales_order_service_setup_errors'\s+AND strpos\(p\.prosrc, '0394\/P9b'\) > 0\) THEN\s+RAISE EXCEPTION 'mig_0400_needs_0396/);
  const lists = [...pre.matchAll(/p\.proname = ANY \(ARRAY\[([\s\S]*?)\]\)/g)].map((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
  assert.equal(lists.length, 2, 'รายชื่อของด่าน (14) และของลายนิ้วมือ (11)');
  assert.equal(lists[0].length, 14);
  assert.deepEqual([...lists[1]].sort(), [...UNTOUCHED].sort(), 'ลายนิ้วมือ = 11 ตัวที่ต้องไม่แตะ');
  for (const fn of [...Object.keys(OWNED), ERRORS_FN]) {
    assert.ok(lists[0].includes(fn), `ด่านต้องนับ ${fn}`);
    assert.ok(!lists[1].includes(fn), `${fn} ถูกไฟล์นี้แก้ — ห้ามอยู่ในลายนิ้วมือของที่ไม่แตะ`);
  }
});

test('🔴 0400 §0: md5 ของเนื้อ save / copy / guard **ของไฟล์นี้เอง** (own_md5) = md5 ที่คิดใหม่จากไฟล์ — แก้เนื้อแล้วต้องคิดใหม่ (ไม่งั้นรันซ้ำไม่ผ่าน)', () => {
  const pre = dollar('pre', BODY)[0];
  for (const [fn, { marker }] of Object.entries(OWNED)) {
    const def = DEFS.get(fn);
    assert.ok(def, `0400 ต้องนิยาม ${fn}`);
    assert.ok(def.raw.includes(marker), `${fn}: เนื้อต้องมีป้าย ${marker}`);
    const own = md5(def.raw.replace(/[ \t\n\r]/g, ''));
    const row = new RegExp(`\\('${fn}', '${marker}', '[0-9a-f]{32}', '([0-9a-f]{32})'\\)`).exec(pre);
    assert.ok(row, `${fn}: ด่าน §0 ต้องมีแถวสี่ช่อง`);
    assert.equal(row[1], own, `${fn}: own_md5 ในด่าน §0 ต้องเป็น ${own} (คิดจากเนื้อในไฟล์นี้)`);
  }
});

test('0400: คอลัมน์ใหม่อยู่ในคำสั่ง ALTER TABLE ชั้นนอกคำสั่งเดียวต่อตาราง · CHECK ถอดก่อนสร้าง · trigger ถอดก่อนสร้าง (รันซ้ำได้)', () => {
  const collect = (table) => {
    const seen = [];
    for (const m of CODE.matchAll(new RegExp(`ALTER TABLE (?:ONLY )?public\\.${table}([\\s\\S]*?);`, 'g'))) {
      const cols = [...m[1].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?([A-Za-z_][A-Za-z0-9_]*)"?/g)].map((c) => c[1]);
      if (cols.length) seen.push(cols);
    }
    return seen;
  };
  assert.deepEqual(collect('sales_orders'), [['servicePeriodMode']]);
  assert.deepEqual(collect('sales_order_lines'), [['servicePeriodFrom', 'servicePeriodTo']]);
  for (const m of CODE.matchAll(/ADD COLUMN(?! IF NOT EXISTS)/g)) assert.fail(`ADD COLUMN ต้องมี IF NOT EXISTS (ตำแหน่ง ${m.index})`);
  const code = flat(CODE);
  /* ไม่เขียนตารางซ้ำ: NOT NULL + DEFAULT ค่าคงที่ ⇒ ใบที่มีอยู่ทุกใบได้ 'whole' */
  assert.ok(code.includes(`ADD COLUMN IF NOT EXISTS "servicePeriodMode" text NOT NULL DEFAULT 'whole';`));
  assert.ok(code.includes('ADD COLUMN IF NOT EXISTS "servicePeriodFrom" date, ADD COLUMN IF NOT EXISTS "servicePeriodTo" date;'));
  /* โหมด 'line' ได้เฉพาะใบ pipeline (ใบย้อนหลังช่วงเดียวเสมอ) — รูปบวก origin = 'pipeline' (กฎข้อ 14) */
  assert.ok(code.includes(`CONSTRAINT sales_orders_service_period_mode_shape CHECK ( "servicePeriodMode" IN ('whole', 'line') AND ("servicePeriodMode" = 'whole' OR origin = 'pipeline') );`));
  assert.doesNotMatch(CODE, /origin\s*<>\s*'pipeline'|origin\s+IS\s+DISTINCT\s+FROM\s+'pipeline'/i);
  /* ช่วงของรายการ: กติกาเดียวกับ sales_orders_service_period_shape ของ 0392 (ว่างคู่ หรือครบคู่ เริ่ม ≤ จบ ปี 2000–2100) */
  const lineCheck = /CONSTRAINT sales_order_lines_service_period_shape CHECK \(([\s\S]*?)\);/.exec(code)?.[1];
  const orderCheck = /CONSTRAINT sales_orders_service_period_shape CHECK \(([\s\S]*?)\);/.exec(flat(stripComments(RAW_0392)))?.[1];
  assert.ok(lineCheck && orderCheck, 'ต้องเจอ CHECK ของช่วงทั้งสองระดับ');
  assert.equal(lineCheck.trim(), orderCheck.trim(), 'CHECK ของช่วงรายรายการต้องเป็นนิพจน์เดียวกับของหัวใบ');
  for (const m of CODE.matchAll(/ADD CONSTRAINT (\w+)/g)) {
    const drop = CODE.indexOf(`DROP CONSTRAINT IF EXISTS ${m[1]};`);
    assert.ok(drop >= 0 && drop < m.index, `${m[1]}: ต้อง DROP CONSTRAINT IF EXISTS ก่อน`);
  }
  const triggers = [...CODE.matchAll(/CREATE TRIGGER (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(triggers, ['sales_order_lines_service_guard_trg', 'sales_orders_service_period_guard_trg'], 'trigger ของตารางโซนไม่เปลี่ยน — ไม่สร้างใหม่');
  for (const m of CODE.matchAll(/CREATE TRIGGER (\w+)/g)) {
    const drop = CODE.indexOf(`DROP TRIGGER IF EXISTS ${m[1]} `);
    assert.ok(drop >= 0 && drop < m.index, `${m[1]}: ต้อง DROP TRIGGER IF EXISTS ก่อน`);
  }
});

test('0400 §4: trigger สองตัวฟังคอลัมน์ใหม่ทั้งใน UPDATE OF และ WHEN', () => {
  const trg = (name) => {
    const from = CODE.indexOf(`CREATE TRIGGER ${name}`);
    return flat(CODE.slice(from, CODE.indexOf(';', from)));
  };
  const lines = trg('sales_order_lines_service_guard_trg');
  assert.match(lines, /BEFORE UPDATE OF "serviceKind", "serviceProductId", "serviceFgCode", "serviceRounds", "servicePeriodFrom", "servicePeriodTo" ON public\.sales_order_lines FOR EACH ROW WHEN/);
  for (const col of ['serviceKind', 'serviceProductId', 'serviceFgCode', 'serviceRounds', 'servicePeriodFrom', 'servicePeriodTo']) {
    assert.ok(lines.includes(`OLD."${col}" IS DISTINCT FROM NEW."${col}"`), `WHEN ของบรรทัดต้องมี ${col}`);
  }
  const head = trg('sales_orders_service_period_guard_trg');
  assert.match(head, /BEFORE UPDATE OF "servicePeriodFrom", "servicePeriodTo", "servicePeriodMode" ON public\.sales_orders FOR EACH ROW WHEN/);
  for (const col of ['servicePeriodFrom', 'servicePeriodTo', 'servicePeriodMode']) {
    assert.ok(head.includes(`OLD."${col}" IS DISTINCT FROM NEW."${col}"`), `WHEN ของหัวใบต้องมี ${col}`);
  }
  for (const t of [lines, head]) assert.match(t, /EXECUTE FUNCTION public\.sales_order_service_setup_guard\(\)$/);
});

test('🔴 0400 เอ่ย "FUNCTION public.<ชื่อ>" ได้เฉพาะสามฟังก์ชันที่มันเป็นเจ้าของ (แม้ในคอมเมนต์) · ลายเซ็นเดิม · ไม่มีไฟล์หลังจากนี้นิยามทับ', () => {
  const named = new Set([...RAW.matchAll(/FUNCTION\s+public\.([a-z0-9_]+)/g)].map((m) => m[1]));
  assert.deepEqual([...named].sort(), Object.keys(OWNED).sort(), 'ยาม "นิยามล่าสุด" ของเทสต์อื่นหาเจ้าของนิยามด้วยข้อความนี้');
  assert.deepEqual([...DEFS.keys()].sort(), Object.keys(OWNED).sort());
  assert.doesNotMatch(CODE, /CREATE FUNCTION/, 'ฟังก์ชันต้อง CREATE OR REPLACE (ลายเซ็นไม่เปลี่ยน ⇒ สิทธิ์คงเดิม · รันซ้ำได้)');
  assert.doesNotMatch(CODE, /DROP FUNCTION/);
  for (const [fn, { args, marker, returns }] of Object.entries(OWNED)) {
    const def = DEFS.get(fn);
    assert.equal(def.args, args, `${fn}: ชนิดอาร์กิวเมนต์`);
    assert.equal(def.args, DEFS_0392.get(fn).args, `${fn}: ลายเซ็นต้องเท่า 0392`);
    assert.equal(flat(def.header), flat(DEFS_0392.get(fn).header), `${fn}: หัวฟังก์ชัน (ชื่อ · อาร์กิวเมนต์ · RETURNS · LANGUAGE · SET) ต้องเท่า 0392 ตามตัวอักษร`);
    assert.match(def.header, new RegExp(`RETURNS ${returns}\\s`));
    assert.match(def.header, /SET search_path = public/);
    assert.doesNotMatch(def.header, /SECURITY DEFINER/);
    /* ป้ายอยู่ในบรรทัดแรกของเนื้อ — ตรวจท้าย + หัวไฟล์ + ด่าน §0 ใช้ยืนยันว่าตัวที่รันอยู่คือรุ่นนี้ */
    assert.equal(occurrences(def.raw, marker), 1, `${fn}: ป้าย ${marker} หนึ่งครั้งในเนื้อ`);
    assert.match(def.raw, new RegExp(`^\\n-- ${marker.replace('/', '\\/')} · `), `${fn}: ป้ายเป็นบรรทัดแรกของเนื้อ`);
  }
  /* ไฟล์หลัง 0400 ที่นิยามสามตัวนี้ (หรือปะตัวตรวจ) ต้องมาแก้ยามนี้ + ด่าน md5 ของตัวเอง */
  const later = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql') && name > FILE);
  for (const name of later) {
    const sql = read(name);
    for (const fn of Object.keys(OWNED)) {
      assert.ok(!sql.includes(`FUNCTION public.${fn}`), `${name} นิยาม ${fn} ทับ 0400 — ย้ายยามนี้ไปอ่านไฟล์นั้น`);
    }
  }
});

/* ── เนื้อใหม่ = เนื้อของ 0392 + ของที่เติม ───────────────────────────────────────────────────────────
   บรรทัดของ 0392 ที่ **ไม่อยู่** ในเนื้อของ 0400 (ตามลำดับ) ต้องเป็นรายการนี้เท่านั้น — แต่ละบรรทัดคือบรรทัดที่ถูกต่อท้าย/แก้คำ
   เพื่อเติมช่วงของรายการ ไม่มีบรรทัดไหนของ 0392 ถูกตัดทิ้ง ⇒ โหมด 'whole' เดินตามตัวหนังสือเดิมทุกบรรทัด */
const CHANGED_0392_LINES = Object.freeze({
  save_sales_order_service_setup: [
    '  -- ช่วงบริการ: ไม่มีคีย์ = ไม่เปลี่ยน · null = ล้างทั้งคู่ · วัตถุ = ต้องครบสองวัน from ≤ to ในปี 2000–2100',
    '      -- ไม่ใช่แพ็คเกจ (หรือยังไม่เลือก): ใส่ FG/รอบ/โซนไม่ได้ · สลับมาที่นี่ = ล้างของเดิมทั้งหมดของบรรทัด',
    `         OR (v_item ? 'zones' AND jsonb_array_length(v_item -> 'zones') > 0) THEN`,
    '      "serviceRounds" = v_rounds',
    '        OR "serviceRounds" IS DISTINCT FROM v_rounds);',
    `    'zones', (SELECT count(*) FROM public.sales_order_line_zones WHERE "salesOrderId" = v_order.id)`,
  ],
  sales_order_copy_service_setup: [
    '          AND (l."serviceKind" IS NOT NULL OR l."serviceProductId" IS NOT NULL OR l."serviceFgCode" IS NOT NULL)',
    '        WHERE o.id = p_from AND (o."servicePeriodFrom" IS NOT NULL OR o."servicePeriodTo" IS NOT NULL)',
    '    "serviceFgCode" = s."serviceFgCode"',
    '      OR t."serviceFgCode" IS DISTINCT FROM s."serviceFgCode");',
    '  -- ช่วงบริการ — "updatedAt" ของใบ Rev. ไม่ขยับ (route ใช้ค่าที่ฟังก์ชันออก Rev. คืนมา)',
    '    AND ("servicePeriodFrom" IS DISTINCT FROM v_source."servicePeriodFrom"',
  ],
  sales_order_service_setup_guard: [
    '       AND OLD."serviceFgCode" IS NOT DISTINCT FROM NEW."serviceFgCode" THEN',
    '    -- (c) ชนิด / แพ็คเกจ — ต้องอยู่ในสถานะที่แก้งานบริการได้',
    `      RAISE EXCEPTION 'sales_order_service_setup_locked' USING DETAIL = 'kind';`,
    '    -- ตัดสินจากสถานะ "ก่อนแก้" — คำสั่งที่เปลี่ยนสถานะพร้อมช่วงบริการต้องไม่หลุดด่าน',
  ],
});
/* บรรทัดของ a ที่ไม่อยู่ใน LCS(a, b) — ตัวเทียบแบบ diff (ไม่ใช่ไล่หาแบบโลภ ซึ่งบรรทัดซ้ำอย่าง END IF; ทำให้นับผิด) */
function removedLines(a, b) {
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const removed = [];
  let i = 0;
  let j = 0;
  while (i < n) {
    if (j < m && a[i] === b[j]) { i += 1; j += 1; } else if (j < m && lcs[i][j + 1] >= lcs[i + 1][j]) { j += 1; } else { removed.push(a[i]); i += 1; }
  }
  return removed;
}

test('🔴 0400 §3: เนื้อของ save / copy / guard = เนื้อของ 0392 + ของที่เติม — บรรทัดของ 0392 ที่หายไปต้องเป็นรายการที่ประกาศไว้เท่านั้น', () => {
  for (const fn of Object.keys(OWNED)) {
    const old = DEFS_0392.get(fn).raw.split('\n');
    const now = DEFS.get(fn).raw.split('\n');
    assert.deepEqual(removedLines(old, now), CHANGED_0392_LINES[fn],
      `${fn}: มีบรรทัดของ 0392 ที่หาย/ถูกแก้นอกรายการ — โหมด 'whole' ต้องเดินเหมือนเดิม (ถ้าตั้งใจ ให้เติมบรรทัดเข้า CHANGED_0392_LINES พร้อมเหตุผล)`);
    assert.ok(now.length > old.length, `${fn}: เนื้อใหม่ต้องยาวกว่าของ 0392`);
  }
});

test('0400 F1: ด่านของ RPC บันทึกตามลำดับ (สิทธิ์ → ล็อกแถว → สถานะ → stale → รูปก้อน → โหมด → ช่วงของใบคิดเอง → ช่วงของใบ → บรรทัด)', () => {
  const f1 = body('save_sales_order_service_setup');
  order(f1, ['is_sales_keyer_role(p_actor_role)', "'service_setup_forbidden'", 'FOR UPDATE', "'sales_order_not_found'", "'service_setup_state_invalid'",
    "'workflow_stale'", "'service_setup_payload_invalid'", "'service_setup_period_mode_invalid'", "'service_setup_period_derived'",
    "'service_setup_period_invalid'", "'service_setup_line_unknown'", "'service_setup_kind_on_fg_line'", "'service_setup_not_package'",
    "'service_setup_line_period_mode'", "'service_setup_line_period_invalid'"], 'F1');
  /* โหมด: ไม่มีคีย์ = ไม่เปลี่ยน · มีคีย์ = ต้องเป็นสตริง 'whole' | 'line' */
  assert.match(f1, /v_mode := v_order\."servicePeriodMode";\s*IF p_payload \? 'periodMode' THEN\s*IF jsonb_typeof\(p_payload -> 'periodMode'\) = 'string' AND \(p_payload ->> 'periodMode'\) IN \('whole', 'line'\) THEN\s*v_mode := p_payload ->> 'periodMode';\s*ELSE\s*RAISE EXCEPTION 'service_setup_period_mode_invalid';/);
  /* ส่งช่วงของใบมาขณะโหมด (ผลลัพธ์) เป็น 'line' = ตีกลับ **ก่อน** อ่านค่า (null ก็ตีกลับ — คีย์มีอยู่) */
  assert.match(f1, /IF p_payload \? 'period' THEN\s*IF v_mode = 'line' THEN\s*RAISE EXCEPTION 'service_setup_period_derived';\s*END IF;\s*v_set_period := true;\s*v_period := p_payload -> 'period';/);
  /* ยังเป็นสาย pipeline + SERVICE + แก้ได้ (ตัวตัดสินเดียวกับ 0392) */
  assert.match(f1, /IF NOT \(v_order\.origin = 'pipeline'\)\s*OR public\.sales_order_business_line\(v_order\.id\) IS DISTINCT FROM 'SERVICE'\s*OR NOT public\.sales_order_service_setup_editable\(/);
  assert.match(f1, /RETURN jsonb_build_object\(\s*'updatedAt', v_now,\s*'lines', v_lines,\s*'zones', \(SELECT count\(\*\) FROM public\.sales_order_line_zones WHERE "salesOrderId" = v_order\.id\),\s*'periodMode', v_mode\s*\);/);
});

test('🔴 0400 F1: ช่วงรวมของใบเขียนเฉพาะโหมด line และ **ว่างเมื่อรายการแพ็คเกจยังมีช่วงไม่ครบ** · สลับ line → whole ไม่ทำช่วงหาย', () => {
  const f1 = body('save_sales_order_service_setup');
  const loopStart = f1.indexOf('FOR v_item IN SELECT e.value FROM jsonb_array_elements(COALESCE(p_payload -> \'lines\'');
  const loopEnd = f1.lastIndexOf('END LOOP;');
  const orderUpdate = f1.indexOf('UPDATE public.sales_orders SET');
  assert.ok(loopStart > 0 && loopEnd > loopStart && orderUpdate > loopEnd);
  /* (1) สลับ line → whole โดยไม่ส่ง "period": คิดช่วงรวมจากรายการ **ก่อน** วงบรรทัด (วงนั้นล้างช่วงของรายการ) */
  const pre = f1.indexOf(`IF v_mode = 'whole' AND v_order."servicePeriodMode" = 'line' AND NOT v_set_period THEN`);
  assert.ok(pre > 0 && pre < loopStart, 'บล็อก line → whole ต้องอยู่ก่อนวงบรรทัด');
  assert.match(f1.slice(pre, loopStart), /SELECT min\(l\."servicePeriodFrom"\), max\(l\."servicePeriodTo"\) INTO v_from, v_to\s+FROM public\.sales_order_lines l\s+WHERE l\."salesOrderId" = v_order\.id AND l\."servicePeriodFrom" IS NOT NULL;\s*v_set_period := true;\s*END IF;/);
  /* (2) ท้ายฟังก์ชัน: สาขา line / สาขา whole */
  const tail = f1.slice(loopEnd, orderUpdate);
  const branchAt = tail.indexOf(`IF v_mode = 'line' THEN`);
  const elseAt = tail.indexOf('\n  ELSE', branchAt);
  assert.ok(branchAt > 0 && elseAt > branchAt, 'ต้องมีสาขา line / ELSE (whole) หลังวงบรรทัด');
  const lineBranch = tail.slice(branchAt, elseAt);
  const wholeBranch = tail.slice(elseAt);
  /* สาขา line: (ก) สลับจาก whole — เติมช่วงเดิมของใบให้รายการแพ็คเกจที่ก้อนนี้ไม่ได้ส่งคีย์ "period" (null ที่ส่งมาชัด ๆ ไม่ถูกทับ) */
  assert.match(lineBranch, /IF v_order\."servicePeriodMode" <> 'line'\s+AND v_order\."servicePeriodFrom" IS NOT NULL AND v_order\."servicePeriodTo" IS NOT NULL THEN/);
  assert.match(lineBranch, /AND l\."servicePeriodFrom" IS NULL\s+AND public\.sales_order_line_service_role\(l\."serviceKind", l\."fgCode", l\."productId", l\.metadata\) = 'package'\s+AND NOT EXISTS \(\s*SELECT 1 FROM jsonb_array_elements\(COALESCE\(p_payload -> 'lines', '\[\]'::jsonb\)\) AS e\(value\)\s+WHERE e\.value ->> 'lineId' = l\.id AND e\.value \? 'period'\s*\);/);
  /* (ข) รายการที่ไม่ใช่แพ็คเกจต้องไม่มีช่วง · (ค) ช่วงรวม = min/max · (ง) 🔴 ยังมีรายการแพ็คเกจที่ไม่มีช่วง ⇒ ว่างทั้งคู่ */
  order(lineBranch, [
    `public.sales_order_line_service_role(l."serviceKind", l."fgCode", l."productId", l.metadata) IS DISTINCT FROM 'package';`,
    'SELECT min(l."servicePeriodFrom"), max(l."servicePeriodTo") INTO v_from, v_to',
    'IF EXISTS (',
    'v_from := NULL;',
    'v_set_period := true;',
  ], 'สาขา line');
  assert.match(lineBranch, /IF EXISTS \(\s*SELECT 1 FROM public\.sales_order_lines l\s+WHERE l\."salesOrderId" = v_order\.id\s+AND l\."servicePeriodFrom" IS NULL\s+AND public\.sales_order_line_service_role\(l\."serviceKind", l\."fgCode", l\."productId", l\.metadata\) = 'package'\s*\) THEN\s*v_from := NULL;\s*v_to := NULL;\s*END IF;\s*v_set_period := true;/);
  /* สาขา whole: ล้างช่วงของรายการทั้งใบ · ไม่ตั้งช่วงของใบเอง (ค่าที่ส่งมา / ช่วงรวมที่คิดไว้ก่อนวง / คงเดิม) */
  assert.match(wholeBranch, /UPDATE public\.sales_order_lines l SET "servicePeriodFrom" = NULL, "servicePeriodTo" = NULL\s+WHERE l\."salesOrderId" = v_order\.id\s+AND \(l\."servicePeriodFrom" IS NOT NULL OR l\."servicePeriodTo" IS NOT NULL\);/);
  assert.doesNotMatch(wholeBranch, /v_from\s*:=|v_to\s*:=|v_set_period\s*:=/);
  /* ช่วงรวมคิดสองที่เท่านั้น (ก่อนวง + สาขา line) · หัวใบเขียนครั้งเดียว ท้ายฟังก์ชัน */
  assert.equal(occurrences(f1, 'SELECT min(l."servicePeriodFrom"), max(l."servicePeriodTo") INTO v_from, v_to'), 2);
  assert.equal(occurrences(f1, 'UPDATE public.sales_orders'), 1);
  assert.match(f1.slice(orderUpdate), /^UPDATE public\.sales_orders SET\s+"servicePeriodMode" = v_mode,\s+"servicePeriodFrom" = CASE WHEN v_set_period THEN v_from ELSE "servicePeriodFrom" END,\s+"servicePeriodTo" = CASE WHEN v_set_period THEN v_to ELSE "servicePeriodTo" END,\s+"updatedAt" = v_now\s+WHERE id = v_order\.id;/);
});

test('0400 F1: ช่วงของรายการ — null รับทุกโหมด · ค่าจริงรับเฉพาะโหมด line + รายการแพ็คเกจ · กติกาวันเดียวกับช่วงของใบ · โหมด whole / ไม่ใช่แพ็คเกจ = ว่าง', () => {
  const f1 = body('save_sales_order_service_setup');
  /* อ่านค่าเดิมของบรรทัดก่อน (ไม่มีคีย์ = ไม่เปลี่ยน) */
  assert.match(f1, /v_line_from := v_line\."servicePeriodFrom";\s*v_line_to := v_line\."servicePeriodTo";/);
  /* ไม่ใช่แพ็คเกจ: ส่งช่วง (ไม่ใช่ null) มา = service_setup_not_package ตัวเดิม · ล้างช่วงของบรรทัด */
  const notPkg = f1.slice(f1.indexOf(`IF v_role IS DISTINCT FROM 'package' THEN`), f1.indexOf('DELETE FROM public.sales_order_line_zones WHERE "salesOrderLineId" = v_line.id;'));
  assert.match(notPkg, /OR \(v_item \? 'period' AND jsonb_typeof\(v_item -> 'period'\) <> 'null'\) THEN\s*RAISE EXCEPTION 'service_setup_not_package';/);
  assert.match(notPkg, /v_rounds := NULL;\s*v_line_from := NULL;\s*v_line_to := NULL;/);
  /* แพ็คเกจ: null → ล้าง (ก่อนถามโหมด) · โหมดไม่ใช่ line → line_period_mode · รูป/วัน/ช่วงผิด → line_period_invalid */
  const parse = f1.slice(f1.indexOf(`IF v_item ? 'period' THEN`), f1.indexOf(`IF v_item ? 'zones' THEN`));
  order(parse, [`IF jsonb_typeof(v_line_period) = 'null' THEN`, `ELSIF v_mode <> 'line' THEN`, `RAISE EXCEPTION 'service_setup_line_period_mode';`,
    `ELSIF jsonb_typeof(v_line_period) = 'object'`, `RAISE EXCEPTION 'service_setup_line_period_invalid';`], 'ช่วงของรายการ');
  assert.equal(occurrences(parse, `RAISE EXCEPTION 'service_setup_line_period_invalid';`), 3, 'วันแปลงไม่ได้ · ช่วงผิด · รูปผิด');
  assert.ok(parse.includes(String.raw`AND (v_line_period ->> 'from') ~ '^\d{4}-\d{2}-\d{2}$'`) && parse.includes(String.raw`AND (v_line_period ->> 'to') ~ '^\d{4}-\d{2}-\d{2}$'`));
  assert.ok(parse.includes(`IF v_line_from > v_line_to OR v_line_from < DATE '2000-01-01' OR v_line_to > DATE '2100-12-31' THEN`));
  assert.ok(f1.includes(`IF v_from > v_to OR v_from < DATE '2000-01-01' OR v_to > DATE '2100-12-31' THEN`), 'กติกาเดียวกับช่วงของใบ');
  /* โหมด whole: บรรทัดที่ก้อนนี้แตะต้องไม่มีช่วง (บรรทัดที่เหลือล้างท้ายฟังก์ชัน) — อยู่ก่อนคำสั่งเขียนบรรทัด */
  const clearAt = f1.indexOf(`IF v_mode <> 'line' THEN\n      v_line_from := NULL;\n      v_line_to := NULL;\n    END IF;`);
  const lineUpdate = f1.indexOf('UPDATE public.sales_order_lines SET\n      "serviceKind" = v_kind,');
  assert.ok(clearAt > 0 && lineUpdate > clearAt, 'ล้างช่วงของบรรทัดในโหมด whole ก่อนเขียนบรรทัด');
  const stmt = f1.slice(lineUpdate, f1.indexOf(';', lineUpdate));
  for (const [col, v] of [['servicePeriodFrom', 'v_line_from'], ['servicePeriodTo', 'v_line_to']]) {
    assert.ok(stmt.includes(`"${col}" = ${v}`) && stmt.includes(`"${col}" IS DISTINCT FROM ${v}`), `บรรทัดเขียน ${col} เมื่อค่าต่าง`);
  }
});

test('0400: รหัส error เป็นคำแรกของข้อความเสมอ · สามฟังก์ชันยิงรหัสชุดเดิมของ 0392 + รหัสใหม่สี่ตัว (ทั้งหมดจากตัวบันทึก) · mig_0400_* อยู่ในบล็อก DO เท่านั้น', () => {
  const codesOf = (text) => [...new Set([...text.matchAll(/RAISE EXCEPTION '([^']*)'/g)].map((m) => m[1]))].sort();
  for (const [fn, def] of DEFS) {
    for (const m of def.body.matchAll(/RAISE EXCEPTION '([^']*)'/g)) {
      assert.match(m[1], /^[a-z_]+$/, `${fn}: RAISE EXCEPTION '${m[1]}' ต้องเป็นรหัสล้วน (รายละเอียดไปทาง DETAIL)`);
      assert.doesNotMatch(m[1], /^mig_/, `${fn}: รหัส mig_* เป็นของบล็อก DO`);
    }
  }
  const NEW = ['service_setup_line_period_invalid', 'service_setup_line_period_mode', 'service_setup_period_derived', 'service_setup_period_mode_invalid'];
  assert.deepEqual(codesOf(body('save_sales_order_service_setup')),
    [...codesOf(DEFS_0392.get('save_sales_order_service_setup').body), ...NEW].sort());
  for (const fn of ['sales_order_copy_service_setup', 'sales_order_service_setup_guard']) {
    assert.deepEqual(codesOf(body(fn)), codesOf(DEFS_0392.get(fn).body), `${fn}: ไม่มีรหัสใหม่`);
  }
  /* รหัสของคนรัน migration */
  const doBlocks = ['pre', 'patch', 'verify'].map((tag) => dollar(tag)[0]).join('\n');
  for (const code of ['mig_0400_needs_0396', 'mig_0400_live_body_differs', 'mig_0400_patch_overload', 'mig_0400_patch_anchor', 'mig_0400_verify']) {
    assert.ok(doBlocks.includes(`RAISE EXCEPTION '${code}`), `บล็อก DO ต้องยิง ${code}`);
  }
});

const MONEY_COLUMNS = ['status', 'actualAmount', 'totalAmount', 'orderDate', 'approvedAt', 'dealId', 'approvalFingerprint'];
const SETUP_STATE_COLUMNS = ['serviceTermsOpenedAt', 'serviceSetupState', 'serviceSetupSubmittedAt', 'serviceSetupSubmittedById',
  'serviceSetupSubmittedByName', 'serviceSetupRejectedAt', 'serviceSetupRejectedById', 'serviceSetupRejectedByName', 'serviceSetupRejectedReason',
  'serviceSetupApprovedAt', 'serviceSetupApprovedById', 'serviceSetupApprovedByName',
  'serviceSetupReopenedAt', 'serviceSetupReopenedById', 'serviceSetupReopenedByName', 'serviceSetupReopenedReason'];
const setLists = (text, table) => [...text.matchAll(new RegExp(`UPDATE public\\.${table}(?:\\s+\\w+)?\\s+SET([\\s\\S]*?)\\bWHERE\\b`, 'g'))].map((m) => m[1]);

test('🔴 0400: ไม่เขียนคอลัมน์เงินของใบ · ไม่แตะงวด · ไม่เขียนวันของรอบขาย (TS อ่านช่วงผ่านบรรทัด) · ยกงานไป Rev. ไม่ยกตรา/สถานะ และไม่ขยับ updatedAt', () => {
  for (const fn of Object.keys(OWNED)) {
    const b = body(fn);
    for (const list of setLists(b, 'sales_orders')) {
      for (const col of MONEY_COLUMNS) {
        assert.doesNotMatch(list, new RegExp(`(^|[\\s,(])"?${col}"?\\s*=`), `${fn}: UPDATE sales_orders SET ห้ามเขียน ${col}`);
      }
    }
    assert.doesNotMatch(b, /(UPDATE|INSERT INTO|DELETE FROM) public\.sales_order_installments/, `${fn}: ห้ามแตะงวด`);
    assert.doesNotMatch(b, /(UPDATE|INSERT INTO|DELETE FROM) public\.service_zone_terms/, `${fn}: ห้ามเขียนรอบขาย`);
  }
  /* ทั้งไฟล์: ไม่มีคอลัมน์วันของ term — สองช่องนั้นเป็นหน้าต่างของ termInWindow (ใส่แล้วรายการที่ยังไม่ถึงวันเริ่มหายจากคิว "รอตั้งรอบ") */
  assert.doesNotMatch(CODE, /"startDate"|"endDate"/);
  const copy = body('sales_order_copy_service_setup');
  for (const col of SETUP_STATE_COLUMNS) assert.ok(!copy.includes(col), `ตัวยกห้ามยก ${col}`);
  for (const list of setLists(copy, 'sales_orders')) assert.doesNotMatch(list, /"updatedAt"/, 'ตัวยก: ห้ามขยับ updatedAt ของใบ Rev.');
  const lists = setLists(copy, 'sales_orders');
  assert.equal(lists.length, 1);
  for (const col of ['servicePeriodMode', 'servicePeriodFrom', 'servicePeriodTo']) assert.ok(lists[0].includes(`"${col}" = v_source."${col}"`), `ตัวยก: ${col}`);
  /* ตัวบันทึกเขียนหัวใบสี่ช่องเท่านั้น */
  const saveLists = setLists(body('save_sales_order_service_setup'), 'sales_orders');
  assert.equal(saveLists.length, 1);
  assert.deepEqual([...saveLists[0].matchAll(/^\s*"(\w+)" =/gm)].map((m) => m[1]), ['servicePeriodMode', 'servicePeriodFrom', 'servicePeriodTo', 'updatedAt']);
});

test('0400 F3: ช่วงของรายการไม่ใช่ "แก้แค่จำนวนรอบ" — ล็อกเหมือนชนิด/แพ็คเกจ (DETAIL line_period) · รหัสยังเป็น sales_order_service_setup_locked', () => {
  const guard = body('sales_order_service_setup_guard');
  const a = guard.slice(guard.indexOf('IF OLD."serviceKind" IS NOT DISTINCT FROM NEW."serviceKind"'), guard.indexOf('OLD."serviceProductId" IS NOT NULL AND NEW."serviceProductId" IS NULL THEN'));
  const bFrom = guard.indexOf('IF OLD."serviceKind" IS NOT DISTINCT FROM NEW."serviceKind"', guard.indexOf('OLD."serviceProductId" IS NOT NULL AND NEW."serviceProductId" IS NULL THEN'));
  const b = guard.slice(bFrom, guard.indexOf(`IF v_parent.status IN ('pending_approval', 'approval_revoked')`));
  for (const [label, part] of [['(a) FK SET NULL ของสินค้า', a], ['(b) แก้แค่จำนวนรอบ', b]]) {
    for (const col of ['servicePeriodFrom', 'servicePeriodTo']) {
      assert.ok(part.includes(`AND OLD."${col}" IS NOT DISTINCT FROM NEW."${col}"`), `${label}: ต้องเทียบ ${col} (ช่วงเปลี่ยน = ไม่ใช่ทางนี้)`);
    }
  }
  /* (c): ชนิด/แพ็คเกจไม่เปลี่ยน (เหลือช่วง) = line_period · อย่างอื่น = kind (ของเดิม) */
  assert.match(guard, /RAISE EXCEPTION 'sales_order_service_setup_locked' USING DETAIL = CASE\s+WHEN OLD\."serviceKind" IS NOT DISTINCT FROM NEW\."serviceKind"\s+AND OLD\."serviceProductId" IS NOT DISTINCT FROM NEW\."serviceProductId"\s+AND OLD\."serviceFgCode" IS NOT DISTINCT FROM NEW\."serviceFgCode" THEN 'line_period'\s+ELSE 'kind' END;/);
  for (const d of ['zones', 'rounds', 'rounds_required', 'period']) {
    assert.ok(guard.includes(`RAISE EXCEPTION 'sales_order_service_setup_locked' USING DETAIL = '${d}'`), `DETAIL ${d} ของ 0392 ยังอยู่`);
  }
  /* หัวใบ (ช่วง/โหมด) ตัดสินจากสถานะก่อนแก้ · force delete ผ่านก่อนอ่านใบแม่ */
  assert.match(guard, /IF TG_TABLE_NAME = 'sales_orders' THEN[\s\S]*?sales_order_service_setup_editable\(\s*OLD\.status, OLD\.origin/);
  const force = guard.indexOf("current_setting('app.force_delete', true) = '1'");
  assert.ok(force > 0 && force < guard.indexOf('SELECT * INTO v_parent'));
  assert.equal([...new Set([...guard.matchAll(/RAISE EXCEPTION '([a-z_]+)'/g)].map((m) => m[1]))].join(), 'sales_order_service_setup_locked');
});

test('0400 §5 L1/L2: anchor + replacement + marker ตามแผน · กลไกของวงเหมือน 0392/0394', () => {
  assert.equal(ROWS.length, 2);
  const [l1, l2] = ROWS;
  for (const row of ROWS) assert.equal(row.fn, ERRORS_FN, 'ชื่อฟังก์ชันอยู่ในสตริงของ VALUES เท่านั้น');
  assert.equal(l1.anchor, '(v_has_package := true;)');
  assert.equal(l1.marker, '0400/L1');
  assert.match(l1.replacement, /^\\1\n {4}-- 0400\/L1 ▶ /);
  assert.match(l1.replacement, /\n {4}-- 0400\/L1 ◀$/);
  /* อ่านช่วงจากแถวของบรรทัด (ตัวแปรวง v_line ไม่ได้เลือกสองคอลัมน์นี้) · เฉพาะโหมด line */
  assert.match(l1.replacement, /IF v_order\."servicePeriodMode" = 'line'\s+AND EXISTS \(SELECT 1 FROM public\.sales_order_lines pl\s+WHERE pl\.id = v_line\.id\s+AND \(pl\."servicePeriodFrom" IS NULL OR pl\."servicePeriodTo" IS NULL\)\) THEN\s+v_errors := v_errors \|\| \('line_period_missing:' \|\| v_line\.id\);\s+END IF;/);
  assert.equal(l2.anchor, String.raw`IF v_order\.origin = 'pipeline' AND v_has_package AND \(`);
  assert.equal(l2.marker, '0400/L2');
  /* 🔴 fail-closed: period_missing เงียบเฉพาะตอนที่ยังมีข้อ line_period_missing — รายการครบแต่ช่วงของใบว่าง = ยังบล็อก */
  assert.equal(l2.replacement, `IF v_order.origin = 'pipeline' AND (v_order."servicePeriodMode" IS DISTINCT FROM 'line' OR position('line_period_missing:' in array_to_string(v_errors, ',')) = 0) /* 0400/L2 */ AND v_has_package AND (`);
  /* ป้ายของแถวหนึ่งห้ามโผล่ในข้อความของอีกแถว (แถวถัดไปอ่านนิยามใหม่ แล้วใช้ strpos(ป้าย) ตัดสินว่า "ปะไว้แล้ว") */
  assert.ok(!l1.replacement.includes(l2.marker) && !l2.replacement.includes(l1.marker));
  const loop = dollar('patch')[0];
  assert.match(loop, /IF v_n <> 1 THEN\s+RAISE EXCEPTION 'mig_0400_patch_overload % count=%', r\.fn, v_n;/);
  assert.match(loop, /IF strpos\(v_src, r\.marker\) > 0 THEN\s+RAISE NOTICE '0400: % % — ปะไว้แล้ว', r\.marker, r\.fn;\s+CONTINUE;/);
  assert.match(loop, /regexp_matches\(v_src, r\.anchor, 'g'\)/);
  assert.match(loop, /regexp_matches\(v_def, r\.anchor, 'g'\)/);
  assert.match(loop, /IF v_hits_src <> 1 OR v_hits_def <> 1 THEN\s+RAISE EXCEPTION 'mig_0400_patch_anchor % % hits=%\/%', r\.marker, r\.fn, v_hits_src, v_hits_def;/);
  assert.match(loop, /EXECUTE regexp_replace\(v_def, r\.anchor, r\.replacement\);/);
  /* อ่านนิยามใหม่ทุกแถว (สองแถวปะฟังก์ชันเดียวกัน) — SELECT prosrc / pg_get_functiondef อยู่ในวง */
  const inLoop = loop.slice(loop.indexOf('LOOP'), loop.lastIndexOf('END LOOP;'));
  assert.ok(inLoop.includes('SELECT p.oid, p.prosrc INTO v_oid, v_src') && inLoop.includes('v_def := pg_get_functiondef(v_oid);'));
});

test('🔴 L1/L2 anchor เจอครั้งเดียวพอดีในตัวตรวจที่รันอยู่จริง (0392 + P9a/P9b/P9c ของ 0394) · ปะแล้วป้ายของ 0394 อยู่ครบ', () => {
  const live = liveErrors();
  const text = { full: live.full, body: live.body };
  for (const row of ROWS) {
    for (const key of ['body', 'full']) {
      assert.equal((text[key].match(toJsRegExp(row.anchor)) || []).length, 1, `${row.marker}: anchor ต้องเจอครั้งเดียว (${key === 'body' ? 'prosrc' : '≈ pg_get_functiondef'})`);
      assert.equal(occurrences(text[key], row.marker), 0, `${row.marker}: นิยามก่อนปะต้องยังไม่มีป้าย`);
      text[key] = text[key].replace(toJsRegExp(row.anchor, ''), toJsReplacement(row.replacement));
    }
  }
  const patched = text.body;
  for (const m of ['0400/L1 ▶', '0400/L1 ◀', '0400/L2', '0394/P9a ▶', '0394/P9a ◀', '0394/P9b ▶', '0394/P9b ◀', '0394/P9c ▶', '0394/P9c ◀']) {
    assert.equal(occurrences(patched, m), 1, `ป้าย ${m} หนึ่งครั้งพอดีหลังปะ`);
  }
  /* L1 = ข้อแรกของรายการ (ก่อน fg_missing / rounds_missing / zones_missing) · อยู่หลังด่าน "ไม่ใช่แพ็คเกจ" (CONTINUE) */
  order(patched, [`IF v_role <> 'package' THEN`, 'v_has_package := true;', `'line_period_missing:'`, 'v_manual :=', `'fg_missing:'`, `'rounds_missing:'`, `'zones_missing:'`,
    'END LOOP;\n  END LOOP;', `'period_missing'`], 'ตัวตรวจหลังปะ');
  /* L2 อยู่ในช่วงป้าย P9b ของ 0394 ⇒ ถอย 0394 ต้องถอด L1/L2 ก่อน (หัวไฟล์บอกไว้) */
  const p9b = patched.slice(patched.indexOf('0394/P9b ▶'), patched.indexOf('0394/P9b ◀'));
  assert.ok(p9b.includes('/* 0400/L2 */'));
  assert.ok(flat(patched).includes(`IF v_order.origin = 'pipeline' AND (v_order."servicePeriodMode" IS DISTINCT FROM 'line' OR position('line_period_missing:' in array_to_string(v_errors, ',')) = 0) /* 0400/L2 */ AND v_has_package AND (v_order."servicePeriodFrom" IS NULL OR v_order."servicePeriodTo" IS NULL) THEN`));
  /* รันซ้ำ: anchor ของ L2 ไม่เหลือ · ของ L1 ยังอยู่ (\1) แต่ป้ายทำให้ข้าม */
  assert.equal((patched.match(toJsRegExp(ROWS[1].anchor)) || []).length, 0);
  /* ตัวปะเติมอย่างเดียว: ทุกบรรทัดของเนื้อเดิมยังอยู่ ยกเว้นบรรทัดเงื่อนไขของ period_missing ที่ L2 แทรกกลางบรรทัด
     (ถอดสองก้อนออก = เนื้อเดิมตรงตัว — เทสต์ถัดไป) */
  const before = live.body.split('\n');
  const after = new Set(patched.split('\n'));
  const gone = before.filter((line) => !after.has(line));
  assert.equal(gone.length, 1, 'L1 เติมบรรทัด · L2 แก้บรรทัดเดียว');
  assert.ok(gone[0].trim().startsWith(`IF v_order.origin = 'pipeline' AND v_has_package AND (v_order."servicePeriodFrom" IS NULL OR v_order."servicePeriodTo" IS NULL) THEN`));
});

test('0400: บล็อกถอด L1/L2 ในหัวไฟล์คืนตัวตรวจกลับเป็นเนื้อก่อน 0400 ตรงตัว (ทั้ง prosrc และทั้งบล็อก)', () => {
  const live = liveErrors();
  const patched = patchedErrors();
  const undo = HEADER.slice(HEADER.indexOf('DO $undo$'), HEADER.indexOf('END $undo$;'));
  const patterns = [...undo.matchAll(/\(\$u\$([\s\S]*?)\$u\$\)/g)].map((m) => m[1]);
  assert.equal(patterns.length, 2, 'ถอดสองก้อน: L1 แล้ว L2');
  assert.match(undo, /IF v_hits <> 1 THEN RAISE EXCEPTION 'undo_0400 hits=% \(%\)'/, 'ไม่เจอ/เจอซ้ำ = หยุด ไม่ถอดมั่ว');
  assert.match(undo, /EXECUTE regexp_replace\(v_def, r\.pattern, ''\);/);
  for (const key of ['body', 'full']) {
    let text = patched[key];
    for (const pattern of patterns) {
      /* ARE ของ Postgres: จุดจับขึ้นบรรทัดใหม่ด้วย ⇒ ธง s ของ JS */
      assert.equal((text.match(new RegExp(pattern, 'gs')) || []).length, 1, `บล็อกถอด: ${pattern.slice(0, 24)}… ต้องเจอครั้งเดียว (${key})`);
      text = text.replace(new RegExp(pattern, 's'), '');
    }
    assert.equal(text, live[key], `ถอดแล้วต้องได้เนื้อก่อน 0400 ตรงตัว (${key})`);
  }
});

test('0400 §6–§7: สิทธิ์ประกาศซ้ำด้วยลายเซ็นเต็ม (ฟังก์ชัน trigger: ถอน service_role ด้วย) · ตรวจท้ายเช็คป้าย/สิทธิ์/คอลัมน์/CHECK/trigger/ของที่ไม่แตะ', () => {
  const code = flat(CODE);
  for (const [fn, { args }] of Object.entries(OWNED)) {
    const sig = args.split(',').filter(Boolean).join(', ');
    if (fn === 'sales_order_service_setup_guard') {
      assert.ok(code.includes(`REVOKE ALL ON FUNCTION public.${fn}(${sig}) FROM PUBLIC, anon, authenticated, service_role;`), fn);
      assert.ok(!code.includes(`GRANT EXECUTE ON FUNCTION public.${fn}(`), `${fn}: ห้าม GRANT`);
      continue;
    }
    assert.ok(code.includes(`REVOKE ALL ON FUNCTION public.${fn}(${sig}) FROM PUBLIC, anon, authenticated;`), `${fn}: REVOKE`);
    assert.ok(code.includes(`GRANT EXECUTE ON FUNCTION public.${fn}(${sig}) TO service_role;`), `${fn}: GRANT service_role`);
  }
  const verify = dollar('verify', BODY)[0];
  /* 11 ตัวที่ไม่แตะ: ครบ + เนื้อเท่าต้นไฟล์ */
  assert.match(verify, /\(SELECT count\(\*\) FROM jsonb_object_keys\(v_before\)\) <> 11 THEN\s+RAISE EXCEPTION 'mig_0400_verify bodies';/);
  assert.match(verify, /WHERE now_fn\.h IS DISTINCT FROM b\.h;\s+IF v_n > 0 THEN RAISE EXCEPTION 'mig_0400_verify touched=%', v_n; END IF;/);
  /* ป้าย: สามตัวที่เขียนทับ + L1 สองหัว + L2 + ป้ายของ 0394 ในตัวตรวจ — ครั้งเดียวพอดี */
  for (const [fn, needle] of [['save_sales_order_service_setup', '0400/F1'], ['sales_order_copy_service_setup', '0400/F2'],
    ['sales_order_service_setup_guard', '0400/F3'], [ERRORS_FN, '0400/L1 ▶'], [ERRORS_FN, '0400/L1 ◀'], [ERRORS_FN, '0400/L2'],
    [ERRORS_FN, '0394/P9a ▶'], [ERRORS_FN, '0394/P9b ▶'], [ERRORS_FN, '0394/P9b ◀'], [ERRORS_FN, '0394/P9c ▶']]) {
    assert.ok(verify.includes(`('${fn}', '${needle}')`), `$verify$ ต้องนับป้าย ${needle} ใน ${fn}`);
  }
  assert.match(verify, /IF v_n IS DISTINCT FROM 1 THEN\s+RAISE EXCEPTION 'mig_0400_verify marker % in % = %'/);
  for (const [sig, svc] of [['public.save_sales_order_service_setup(text,timestamptz,jsonb,text,text,text)', 'true'], ['public.sales_order_copy_service_setup(text,text)', 'true'],
    ['public.sales_order_service_setup_errors(text)', 'true'], ['public.sales_order_service_setup_guard()', 'false']]) {
    assert.ok(verify.includes(`('${sig}', ${svc})`), `$verify$ ต้องเช็คสิทธิ์ ${sig}`);
  }
  assert.match(verify, /has_function_privilege\('anon', v_fn, 'EXECUTE'\)\s+OR has_function_privilege\('authenticated', v_fn, 'EXECUTE'\)\s+OR has_function_privilege\('service_role', v_fn, 'EXECUTE'\) IS DISTINCT FROM r\.service_role/);
  assert.match(verify, /IF v_n <> 3 THEN RAISE EXCEPTION 'mig_0400_verify columns=%'/);
  assert.match(verify, /IF v_n <> 2 THEN RAISE EXCEPTION 'mig_0400_verify checks=%'/);
  assert.match(verify, /IF v_n <> 3 THEN RAISE EXCEPTION 'mig_0400_verify triggers=%'/);
  /* ลำดับของไฟล์: ด่าน → คอลัมน์ → ฟังก์ชัน (ROWTYPE เห็นคอลัมน์ใหม่) → trigger → ปะตัวตรวจ → สิทธิ์ → ตรวจท้าย */
  order(BODY, ['DO $pre$', 'ALTER TABLE public.sales_orders', 'ALTER TABLE public.sales_order_lines', 'CREATE OR REPLACE FUNCTION public.save_sales_order_service_setup(',
    'CREATE OR REPLACE FUNCTION public.sales_order_copy_service_setup(', 'CREATE OR REPLACE FUNCTION public.sales_order_service_setup_guard(',
    'CREATE TRIGGER sales_order_lines_service_guard_trg', 'CREATE TRIGGER sales_orders_service_period_guard_trg', 'DO $patch$',
    'REVOKE ALL ON FUNCTION public.save_sales_order_service_setup(', 'DO $verify$', 'COMMIT;'], 'ลำดับของไฟล์');
});
