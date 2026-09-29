// ── ยามตัวหนังสือของ mig 0392 (SO บริการ: ตั้งงานบริการรายบรรทัด + ตั้งย้อนหลัง) ─────────────────────
//
// ⭐ 0392 ปะฟังก์ชันอนุมัติ/ออก Rev. จากนิยามที่รันอยู่จริง (pg_get_functiondef แบบ 0382/0385) ⇒ ไม่มี CREATE ของสองตัวนั้น
//    ในไฟล์ให้ยาม "นิยามล่าสุด" เห็น — เทสต์นี้ล็อกจุดปะ (anchor) กับตัวหนังสือของนิยามที่ฐานใช้อยู่จริง
//    (0197 + 0382 · 0376 + 0382 + 0385) ว่าเจอ **ครั้งเดียวพอดี** และล็อกกติกาของไฟล์ที่ยามตัวอื่นพึ่งพา
// ⚠️ อ่าน **ตัวหนังสือ SQL** · พฤติกรรมจริงลองบนฮาร์เนส PGlite นอก repo แล้ว
//    (mockups/so-service-lines/pglite-harness — 35 เคสของแผน §3.4 + รันไฟล์ซ้ำสองรอบ + ถอยกลับตามหัวไฟล์)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE = '0392_so_service_setup.sql';
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const RAW = read(FILE);
const CODE = stripComments(RAW);
const HEADER = RAW.slice(0, RAW.indexOf('\nBEGIN;'));

/* ลายเซ็นตามแผน §3.2 — ชื่อ → ชนิดอาร์กิวเมนต์ */
const NEW_FUNCTIONS = Object.freeze({
  fg_category_of: 'text',
  sales_order_business_line: 'text',
  sales_order_line_service_role: 'text,text,text,jsonb',
  sales_order_service_setup_editable: 'text,text,timestamptz,text,text',
  sales_order_service_setup_errors: 'text',
  save_sales_order_service_setup: 'text,timestamptz,jsonb,text,text,text',
  sales_order_open_service_terms: 'text,text,text',
  sales_order_copy_service_setup: 'text,text',
  submit_sales_order_service_setup: 'text,timestamptz,text,text,text',
  approve_sales_order_service_setup: 'text,timestamptz,text,text,text,text',
  reject_sales_order_service_setup: 'text,timestamptz,text,text,text,text',
  sales_order_service_setup_guard: '',
});
const TRIGGER_FN = 'sales_order_service_setup_guard';

/* นิยามในไฟล์นี้: ชื่อ → { args (ชนิดล้วน), header, body } */
function definitions() {
  const out = new Map();
  for (const m of CODE.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(([\s\S]*?)\)\s*RETURNS/g)) {
    const args = m[2].split(',').map((a) => a.trim()).filter(Boolean)
      .map((a) => a.replace(/\s+DEFAULT[\s\S]*$/i, '').split(/\s+/).pop()).join(',');
    const from = m.index;
    const bodyFrom = CODE.indexOf('AS $$', from);
    const bodyTo = CODE.indexOf('\n$$;', bodyFrom);
    out.set(m[1], { args, header: CODE.slice(from, bodyFrom), body: CODE.slice(bodyFrom + 5, bodyTo) });
  }
  return out;
}
const DEFS = definitions();
const body = (fn) => {
  const def = DEFS.get(fn);
  assert.ok(def, `0392 ต้องนิยาม ${fn}`);
  return def.body;
};

const dollar = (tag, text = CODE) => [...text.matchAll(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`, 'g'))].map((m) => m[1]);
/* ARE ของ Postgres → RegExp ของ JS (anchor ใช้แค่ \s \* \( ซึ่งความหมายตรงกัน) · \1 \2 ของ regexp_replace → $1 $2 */
const toJsRegExp = (are) => new RegExp(are, 'g');
const toJsReplacement = (rp) => rp.replace(/\$/g, '$$$$').replace(/\\([1-9])/g, '$$$1');
const count = (text, re) => (text.match(re) || []).length;

function functionBlock(sql, fnName) {
  const marker = `CREATE OR REPLACE FUNCTION public.${fnName}(`;
  const from = sql.indexOf(marker);
  assert.ok(from >= 0, `ไม่พบนิยาม ${fnName}`);
  const to = sql.indexOf('\n$$;', from);
  return { full: sql.slice(from, to + 4), body: sql.slice(sql.indexOf('AS $$', from) + 5, to) };
}
function replaceOnce(text, oldExpr, newExpr, label) {
  assert.equal(text.split(oldExpr).length - 1, 1, `${label}: ข้อความที่ปะต้องเจอครั้งเดียว`);
  return text.replace(oldExpr, () => newExpr);
}
/* แถวปะของ 0382 (ชื่อ → [เดิม, ใหม่]) */
function patch0382(fn) {
  const code = stripComments(read('0382_sales_role_hierarchy.sql'));
  const m = new RegExp(`\\('${fn}',\\s*\\$o\\$([\\s\\S]*?)\\$o\\$,\\s*\\$n\\$([\\s\\S]*?)\\$n\\$\\)`).exec(code);
  assert.ok(m, `0382 ต้องมีแถวของ ${fn}`);
  return [m[1], m[2]];
}
/* นิยามที่ฐานใช้อยู่จริงของสองฟังก์ชันที่ 0392 ปะ */
function liveApprove() {
  const block = functionBlock(read('0197_sales_order_zero_actual.sql'), 'approve_sales_order_with_signature_evidence_atomic');
  const [o, n] = patch0382('approve_sales_order_with_signature_evidence_atomic');
  return { full: replaceOnce(block.full, o, n, '0382 approve'), body: replaceOnce(block.body, o, n, '0382 approve') };
}
function liveRevise() {
  const block = functionBlock(read('0376_so_revision_moves_installments.sql'), 'revise_approved_sales_order_atomic');
  const [o, n] = patch0382('revise_approved_sales_order_atomic');
  const c0385 = stripComments(read('0385_so_revise_by_deal_owner.sql'));
  const [o2] = dollar('o', c0385);
  const [n2] = dollar('n', c0385);
  const apply = (t) => replaceOnce(replaceOnce(t, o, n, '0382 revise'), o2, n2, '0385 revise');
  return { full: apply(block.full), body: apply(block.body) };
}
/* แถว VALUES ของ §12: [fn, anchor, replacement, marker] */
function patchRows() {
  const block = CODE.slice(CODE.indexOf('FROM (VALUES'), CODE.indexOf(') AS t(fn, anchor, replacement, marker)'));
  const rows = [...block.matchAll(/\('([a-z_]+)',\s*\$re\$([\s\S]*?)\$re\$,\s*\$rp\$([\s\S]*?)\$rp\$,\s*'([^']+)'\)/g)];
  return rows.map((m) => ({ fn: m[1], anchor: m[2], replacement: m[3], marker: m[4] }));
}

test('0392: ทรานแซกชันเดียว · ด่านก่อนรันสองข้อ · NOTIFY หลัง COMMIT', () => {
  assert.match(CODE, /^BEGIN;/m);
  assert.match(CODE, /^COMMIT;\s*\n\s*NOTIFY pgrst, 'reload schema';\s*$/m);
  const pre = dollar('pre')[0];
  assert.ok(pre, 'ต้องมี DO $pre$');
  assert.match(pre, /RAISE EXCEPTION 'mig_0392_orders_in_flight/);
  assert.match(pre, /RAISE EXCEPTION 'mig_0392_legacy_terms_exist/);
  // ข้อแรกเฉพาะรันครั้งแรก (ยังไม่มี P1) · ข้อสองทุกรอบ
  assert.match(pre, /IF NOT EXISTS \([\s\S]*?strpos\(p\.prosrc, 'sales_order_open_service_terms\('\) > 0[\s\S]*?mig_0392_orders_in_flight[\s\S]*?END IF;\s*END IF;/);
  assert.match(pre, /t\.id NOT LIKE 'SZT-S%'[\s\S]*?mig_0392_legacy_terms_exist/);
  assert.ok(CODE.indexOf('$pre$') < CODE.indexOf('ALTER TABLE'), 'ด่านต้องมาก่อน DDL ตัวแรก');
});

test('0392: หัวไฟล์มี SELECT ตรวจหลังรัน + ค่าที่คาด · ด่านก่อนรัน · ถอยกลับ · ลำดับ deploy · รายชื่อคอลัมน์ใหม่', () => {
  for (const s of ['AS fg_rows', 'AS alloc_rows', 'AS stamped', 'AS p1', 'AS p2', 'AS anon_save', 'AS triggers', 'AS backfill_candidates',
    "has_function_privilege('anon','public.save_sales_order_service_setup(text,timestamptz,jsonb,text,text,text)','EXECUTE')"]) {
    assert.ok(HEADER.includes(s), `หัวไฟล์ต้องมี ${s}`);
  }
  assert.match(HEADER, /fg_rows = 0 · alloc_rows = 0 · stamped = 0 · p1 = 1 · p2 = 1 · anon_save = f · triggers = 3/);
  assert.match(HEADER, /mig_0392_orders_in_flight/);
  assert.match(HEADER, /mig_0392_legacy_terms_exist/);
  assert.match(HEADER, /ถอยกลับ/);
  assert.match(HEADER, /DO \$undo\$/);
  assert.match(HEADER, /ลำดับ deploy/);
  assert.match(HEADER, /freeze/);
  assert.match(HEADER, /⚠️ DDL — รันมือบน Supabase SQL Editor/);
  assert.match(HEADER, /✅ รันซ้ำได้/);
  for (const col of ['serviceKind', 'serviceProductId', 'serviceFgCode', 'servicePeriodFrom', 'serviceTermsOpenedAt',
    'serviceSetupApprovedByName', 'sales_order_line_zones']) {
    assert.ok(HEADER.includes(col), `หัวไฟล์ต้องบอกชื่อใหม่ ${col} (check:columns)`);
  }
  // ถอยกลับ DROP ครบ 12 ฟังก์ชันด้วยลายเซ็นเต็ม
  for (const [fn, args] of Object.entries(NEW_FUNCTIONS)) {
    assert.ok(HEADER.replace(/\s+/g, '').includes(`public.${fn}(${args})`), `ถอยกลับต้องมี public.${fn}(${args})`);
  }
});

test('0392: ลายเซ็นของฟังก์ชันใหม่ตรงแผน §3.2 · SET search_path = public ทุกตัว', () => {
  assert.deepEqual([...DEFS.keys()].sort(), Object.keys(NEW_FUNCTIONS).sort());
  for (const [fn, args] of Object.entries(NEW_FUNCTIONS)) {
    const def = DEFS.get(fn);
    assert.equal(def.args, args, `${fn}: ชนิดอาร์กิวเมนต์`);
    assert.match(def.header, /SET search_path = public/, `${fn}: ต้อง SET search_path = public`);
  }
  assert.match(DEFS.get('approve_sales_order_service_setup').header, /p_override_reason text DEFAULT NULL/);
  assert.match(DEFS.get(TRIGGER_FN).header, /RETURNS trigger/);
  assert.match(DEFS.get('sales_order_service_setup_errors').header, /RETURNS text\[\]/);
  assert.match(DEFS.get('sales_order_open_service_terms').header, /RETURNS integer/);
  assert.match(DEFS.get('sales_order_copy_service_setup').header, /RETURNS integer/);
});

test('0392: สิทธิ์ — REVOKE จาก PUBLIC/anon/authenticated + GRANT service_role ทุกตัว (ฟังก์ชัน trigger: ถอน service_role ด้วย)', () => {
  const flat = CODE.replace(/\s+/g, ' ');
  for (const [fn, args] of Object.entries(NEW_FUNCTIONS)) {
    const sig = args.split(',').filter(Boolean).join(', ');
    if (fn === TRIGGER_FN) {
      assert.ok(flat.includes(`REVOKE ALL ON FUNCTION public.${fn}(${sig}) FROM PUBLIC, anon, authenticated, service_role;`), fn);
      assert.ok(!flat.includes(`GRANT EXECUTE ON FUNCTION public.${fn}(`), `${fn}: ห้าม GRANT`);
      continue;
    }
    assert.ok(flat.includes(`REVOKE ALL ON FUNCTION public.${fn}(${sig}) FROM PUBLIC, anon, authenticated;`), `${fn}: REVOKE`);
    assert.ok(flat.includes(`GRANT EXECUTE ON FUNCTION public.${fn}(${sig}) TO service_role;`), `${fn}: GRANT service_role`);
  }
  assert.match(CODE, /ALTER TABLE public\.sales_order_line_zones ENABLE ROW LEVEL SECURITY;/);
  assert.match(CODE, /REVOKE ALL ON TABLE public\.sales_order_line_zones FROM anon, authenticated;/);
  assert.match(CODE, /GRANT ALL ON TABLE public\.sales_order_line_zones TO service_role;/);
  // ตรวจท้ายไฟล์เช็คสิทธิ์ anon ของทุกตัวซ้ำ
  const verify = dollar('verify')[0];
  for (const [fn, args] of Object.entries(NEW_FUNCTIONS)) assert.ok(verify.includes(`'public.${fn}(${args})'`), `$verify$ ต้องเช็ค ${fn}`);
  assert.match(verify, /has_function_privilege\('anon', v_fn, 'EXECUTE'\)/);
  assert.match(verify, /relrowsecurity/);
});

test('🔴 0392 ไม่มีข้อความ "FUNCTION public.<ฟังก์ชันเดิม>" — ยาม "นิยามล่าสุด" ของไฟล์อื่นจะอ่านผิดไฟล์', () => {
  for (const s of ['FUNCTION public.revise_approved_sales_order_atomic', 'FUNCTION public.approve_sales_order_with_signature_evidence_atomic',
    'FUNCTION public.approve_historical_sales_order', 'FUNCTION public.create_sales_order_draft']) {
    assert.ok(!RAW.includes(s), `ห้ามมี "${s}" แม้ในคอมเมนต์`);
  }
  const named = new Set([...RAW.matchAll(/FUNCTION\s+public\.([a-z0-9_]+)/g)].map((m) => m[1]));
  assert.deepEqual([...named].filter((n) => !(n in NEW_FUNCTIONS)), [], 'เอ่ย FUNCTION public.<ชื่อ> ได้เฉพาะฟังก์ชันใหม่ของไฟล์นี้');
});

test('0392: ไม่ CREATE ฟังก์ชันที่มีอยู่แล้ว — ทุกตัวเป็นชื่อใหม่ที่ไม่เคยนิยามใน migration ก่อนหน้า', () => {
  const earlier = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && f < FILE).map((f) => stripComments(read(f)));
  for (const fn of DEFS.keys()) {
    const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fn}\\s*\\(`, 'i');
    assert.ok(!earlier.some((sql) => re.test(sql)), `${fn} มีอยู่แล้วใน migration ก่อน 0392`);
  }
  assert.doesNotMatch(CODE, /CREATE FUNCTION/, 'ฟังก์ชันต้อง CREATE OR REPLACE (รันซ้ำได้)');
});

test('0392 P1/P2: anchor + replacement + marker เป็นตัวหนังสือตามแผน', () => {
  const rows = patchRows();
  assert.equal(rows.length, 2);
  const [p1, p2] = rows;
  assert.equal(p1.fn, 'approve_sales_order_with_signature_evidence_atomic');
  assert.equal(p1.anchor, String.raw`(RETURNING \* INTO v_order;)(\s*RETURN jsonb_build_object\()`);
  assert.equal(p1.marker, 'sales_order_open_service_terms(');
  assert.match(p1.replacement, /^\\1\n/);
  assert.match(p1.replacement, /\\2$/);
  assert.ok(p1.replacement.includes('PERFORM public.sales_order_open_service_terms(v_order.id, p_actor_id, p_actor_name);'));
  assert.ok(p1.replacement.includes('SELECT * INTO v_order FROM public.sales_orders WHERE id = v_order.id;'));
  assert.equal(p2.fn, 'revise_approved_sales_order_atomic');
  assert.equal(p2.anchor, String.raw`(RAISE EXCEPTION 'sales_order_revision_lines_required';\s*END IF;)`);
  assert.equal(p2.marker, 'sales_order_copy_service_setup(');
  assert.ok(p2.replacement.includes('PERFORM public.sales_order_copy_service_setup(v_source.id, v_revision.id);'));
  // กลไกของวง: overload = 1 · มี marker = ข้าม · นับ anchor สองที่ · แทนด้วย regexp_replace บน pg_get_functiondef
  const loop = dollar('patch')[0];
  assert.match(loop, /IF v_n <> 1 THEN\s+RAISE EXCEPTION 'mig_0392_patch_overload/);
  assert.match(loop, /IF strpos\(v_src, r\.marker\) > 0 THEN\s+RAISE NOTICE '0392: % — ปะไว้แล้ว', r\.fn;\s+CONTINUE;/);
  assert.match(loop, /regexp_matches\(v_src, r\.anchor, 'g'\)/);
  assert.match(loop, /regexp_matches\(v_def, r\.anchor, 'g'\)/);
  assert.match(loop, /IF v_hits_src <> 1 OR v_hits_def <> 1 THEN\s+RAISE EXCEPTION 'mig_0392_patch_anchor/);
  assert.match(loop, /EXECUTE regexp_replace\(v_def, r\.anchor, r\.replacement\);/);
  // ตรวจท้าย: marker ละหนึ่งครั้งพอดี
  const verify = dollar('verify')[0];
  assert.match(verify, /'sales_order_open_service_terms\('[\s\S]*?= 1;[\s\S]*?mig_0392_verify p1/);
  assert.match(verify, /'sales_order_copy_service_setup\('[\s\S]*?= 1;[\s\S]*?mig_0392_verify p2/);
});

test('🔴 P1 anchor เจอครั้งเดียวพอดีในนิยามอนุมัติที่ใช้อยู่จริง (0197 + 0382) · ปะแล้วเปิดงานหลัง UPDATE อนุมัติ ก่อน RETURN', () => {
  const [p1] = patchRows();
  const live = liveApprove();
  assert.equal(count(live.body, toJsRegExp(p1.anchor)), 1, 'prosrc');
  assert.equal(count(live.full, toJsRegExp(p1.anchor)), 1, 'ทั้งบล็อก (≈ pg_get_functiondef)');
  assert.ok(!live.body.includes(p1.marker), 'นิยามเดิมต้องยังไม่มี marker');
  const patched = live.body.replace(new RegExp(p1.anchor), toJsReplacement(p1.replacement));
  assert.equal(patched.split(p1.marker).length - 1, 1);
  const approveAt = patched.indexOf("status = 'approved'");
  const openAt = patched.indexOf('PERFORM public.sales_order_open_service_terms(');
  const rereadAt = patched.indexOf('SELECT * INTO v_order FROM public.sales_orders WHERE id = v_order.id;');
  const returnAt = patched.indexOf('RETURN jsonb_build_object(');
  assert.ok(approveAt > 0 && approveAt < openAt && openAt < rereadAt && rereadAt < returnAt, 'ลำดับ: UPDATE อนุมัติ → เปิดงาน → อ่านใบใหม่ → RETURN');
  // ข้อความที่ปะไม่ใช่ anchor ⇒ รันซ้ำจะไม่เจอ anchor ซ้อน (และ marker ข้ามอยู่แล้ว)
  assert.equal(count(patched, toJsRegExp(p1.anchor)), 0);
});

test('🔴 P2 anchor เจอครั้งเดียวพอดีในนิยามออก Rev. ที่ใช้อยู่จริง (0376 + 0382 + 0385) · ปะหลังก๊อปบรรทัด ก่อนย้ายงวด', () => {
  const [, p2] = patchRows();
  const live = liveRevise();
  assert.equal(count(live.body, toJsRegExp(p2.anchor)), 1, 'prosrc');
  assert.equal(count(live.full, toJsRegExp(p2.anchor)), 1, 'ทั้งบล็อก (≈ pg_get_functiondef)');
  assert.ok(!live.body.includes(p2.marker));
  const patched = live.body.replace(new RegExp(p2.anchor), toJsReplacement(p2.replacement));
  const linesAt = patched.indexOf('INSERT INTO public.sales_order_lines');
  const copyAt = patched.indexOf('PERFORM public.sales_order_copy_service_setup(v_source.id, v_revision.id);');
  const installmentsAt = patched.indexOf('UPDATE public.sales_order_installments');
  assert.ok(linesAt > 0 && linesAt < copyAt && copyAt < installmentsAt, 'ลำดับ: ก๊อปบรรทัด → ยกงานบริการ → ย้ายงวด');
  // ด่านเจ้าของดีลของ 0385 ยังอยู่ในนิยามที่ถูกปะ
  assert.match(patched, /d\."ownerId" = p_actor_id/);
});

test('0392: คอลัมน์ใหม่อยู่ในคำสั่ง ALTER TABLE ชั้นนอกคำสั่งเดียวต่อตาราง (ยามคอลัมน์ Rev./ใบร่างมองเห็น)', () => {
  const collect = (table) => {
    const seen = [];
    for (const m of CODE.matchAll(new RegExp(`ALTER TABLE (?:ONLY )?public\\.${table}([\\s\\S]*?);`, 'g'))) {
      const cols = [...m[1].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?([A-Za-z_][A-Za-z0-9_]*)"?/g)].map((c) => c[1]);
      if (cols.length) seen.push(cols);
    }
    return seen;
  };
  assert.deepEqual(collect('sales_orders'), [[
    'servicePeriodFrom', 'servicePeriodTo', 'serviceTermsOpenedAt', 'serviceSetupState',
    'serviceSetupSubmittedAt', 'serviceSetupSubmittedById', 'serviceSetupSubmittedByName',
    'serviceSetupRejectedAt', 'serviceSetupRejectedById', 'serviceSetupRejectedByName', 'serviceSetupRejectedReason',
    'serviceSetupApprovedAt', 'serviceSetupApprovedById', 'serviceSetupApprovedByName',
  ]]);
  assert.deepEqual(collect('sales_order_lines'), [['serviceKind', 'serviceProductId', 'serviceFgCode']]);
  for (const m of CODE.matchAll(/ADD COLUMN(?! IF NOT EXISTS)/g)) assert.fail(`ADD COLUMN ต้องมี IF NOT EXISTS (ตำแหน่ง ${m.index})`);
  assert.doesNotMatch(CODE, /EXECUTE\s+format/i, 'DDL ผ่าน EXECUTE = ยามอ่านไม่เห็น');
});

test('0392: รันซ้ำได้ — CONSTRAINT/TRIGGER ถอดก่อนสร้าง · ตาราง/ดัชนี IF NOT EXISTS', () => {
  for (const m of CODE.matchAll(/ADD CONSTRAINT (\w+)/g)) {
    const drop = CODE.indexOf(`DROP CONSTRAINT IF EXISTS ${m[1]};`);
    assert.ok(drop >= 0 && drop < m.index, `${m[1]}: ต้อง DROP CONSTRAINT IF EXISTS ก่อน`);
  }
  for (const m of CODE.matchAll(/CREATE TRIGGER (\w+)/g)) {
    const drop = CODE.indexOf(`DROP TRIGGER IF EXISTS ${m[1]} `);
    assert.ok(drop >= 0 && drop < m.index, `${m[1]}: ต้อง DROP TRIGGER IF EXISTS ก่อน`);
  }
  for (const m of CODE.matchAll(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/g)) assert.fail(`CREATE INDEX ต้อง IF NOT EXISTS (${m.index})`);
  assert.match(CODE, /CREATE TABLE IF NOT EXISTS public\.sales_order_line_zones/);
  // ⛔ ไม่มี DML นอกตัวฟังก์ชัน/บล็อก DO — ไฟล์นี้ไม่ backfill
  const outside = CODE.replace(/\$([a-z]*)\$[\s\S]*?\$\1\$/g, '');
  assert.doesNotMatch(outside, /\b(INSERT INTO|UPDATE|DELETE FROM) public\./);
});

test('0392: ตาราง sales_order_line_zones — FK โซนชื่อตายตัว (route ลบโซนจับชื่อนี้) · FK คู่ของบรรทัด · UNIQUE (บรรทัด, โซน)', () => {
  const table = CODE.slice(CODE.indexOf('CREATE TABLE IF NOT EXISTS public.sales_order_line_zones'), CODE.indexOf(');', CODE.indexOf('CREATE TABLE IF NOT EXISTS public.sales_order_line_zones')));
  assert.match(table, /CONSTRAINT sales_order_line_zones_zone_fk\s+FOREIGN KEY \("zoneId"\) REFERENCES public\.service_zones\(id\) ON DELETE RESTRICT/);
  assert.match(table, /CONSTRAINT sales_order_line_zones_line_fk\s+FOREIGN KEY \("salesOrderLineId", "salesOrderId"\)\s+REFERENCES public\.sales_order_lines\(id, "salesOrderId"\) ON DELETE CASCADE/);
  assert.match(table, /CONSTRAINT sales_order_line_zones_line_zone_uk UNIQUE \("salesOrderLineId", "zoneId"\)/);
  assert.match(table, /"packsPerRound"\s+integer CHECK \("packsPerRound" IS NULL OR "packsPerRound" BETWEEN 1 AND 9999\)/);
  assert.match(table, /"salesOrderId"\s+text NOT NULL REFERENCES public\.sales_orders\(id\) ON DELETE CASCADE/);
  assert.match(CODE, /CREATE UNIQUE INDEX IF NOT EXISTS sales_order_lines_id_order_uk\s+ON public\.sales_order_lines \(id, "salesOrderId"\);/);
  assert.ok(CODE.indexOf('sales_order_lines_id_order_uk') < CODE.indexOf('CREATE TABLE IF NOT EXISTS public.sales_order_line_zones'),
    'UNIQUE (id, salesOrderId) ต้องมีก่อน FK คู่');
});

test('0392: CHECK รูปทรงของบรรทัดและหัวใบ ตามแผน §3.1', () => {
  const flat = CODE.replace(/\s+/g, ' ');
  assert.ok(flat.includes(`CHECK ("serviceKind" IS NULL OR "serviceKind" IN ('package', 'not_service'))`));
  /* สตริงว่าง = ไม่มี (NULLIF) — กติกาเดียวกับ sales_order_line_service_role · errors() · RPC บันทึก · isManualSalesLine
     🐞 เดิม IS NULL ล้วน ⇒ บรรทัด fgCode = '' ถูกทุกตัวอ่านว่า "พิมพ์เอง" แต่ CHECK อ่านว่ามี FG ⇒ บันทึกชนิด = 23514 ดิบ */
  assert.ok(flat.includes(`("serviceKind" IS NULL OR (NULLIF("fgCode", '') IS NULL AND NULLIF("productId", '') IS NULL)) AND ("serviceFgCode" IS NULL OR "serviceKind" = 'package') AND ("serviceProductId" IS NULL OR "serviceFgCode" IS NOT NULL)`));
  assert.ok(flat.includes(`FOREIGN KEY ("serviceProductId") REFERENCES public.products(id) ON DELETE SET NULL`));
  assert.ok(flat.includes(`(("servicePeriodFrom" IS NULL) = ("servicePeriodTo" IS NULL))`));
  assert.ok(flat.includes(`"servicePeriodFrom" >= DATE '2000-01-01' AND "servicePeriodTo" <= DATE '2100-12-31'`));
  assert.ok(flat.includes(`"serviceSetupState" IN ('submitted', 'rejected') AND origin = 'pipeline'`));
  assert.ok(flat.includes(`length(btrim(COALESCE("serviceSetupRejectedReason", ''))) BETWEEN 10 AND 500`));
});

test('0392: trigger ล็อก 3 ตัว — สองตัวที่ UPDATE OF มี WHEN IS DISTINCT FROM ครบทุกคอลัมน์ · force delete ผ่านก่อนด่านอื่น', () => {
  const trg = (name) => {
    const from = CODE.indexOf(`CREATE TRIGGER ${name}`);
    assert.ok(from >= 0, `ต้องมี ${name}`);
    return CODE.slice(from, CODE.indexOf(';', from)).replace(/\s+/g, ' ');
  };
  const zones = trg('sales_order_line_zones_guard_trg');
  assert.match(zones, /BEFORE INSERT OR UPDATE OR DELETE ON public\.sales_order_line_zones FOR EACH ROW EXECUTE FUNCTION public\.sales_order_service_setup_guard\(\)/);
  const lines = trg('sales_order_lines_service_guard_trg');
  assert.match(lines, /BEFORE UPDATE OF "serviceKind", "serviceProductId", "serviceFgCode", "serviceRounds" ON public\.sales_order_lines/);
  for (const col of ['serviceKind', 'serviceProductId', 'serviceFgCode', 'serviceRounds']) {
    assert.ok(lines.includes(`OLD."${col}" IS DISTINCT FROM NEW."${col}"`), `WHEN ต้องมี ${col}`);
  }
  const period = trg('sales_orders_service_period_guard_trg');
  assert.match(period, /BEFORE UPDATE OF "servicePeriodFrom", "servicePeriodTo" ON public\.sales_orders/);
  for (const col of ['servicePeriodFrom', 'servicePeriodTo']) {
    assert.ok(period.includes(`OLD."${col}" IS DISTINCT FROM NEW."${col}"`), `WHEN ต้องมี ${col}`);
  }
  const guard = body(TRIGGER_FN);
  const force = guard.indexOf("current_setting('app.force_delete', true) = '1'");
  assert.ok(force > 0 && force < guard.indexOf('SELECT * INTO v_parent'), 'force delete ต้องผ่านก่อนอ่านใบแม่');
  assert.match(guard, /IF NOT FOUND THEN\s+[\s\S]{0,120}IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;/, 'แม่ถูกลบแล้ว (cascade) = ผ่าน');
  // (a) FK SET NULL ของสินค้า · (b) รอบ: รออนุมัติ/ย้อน/รอตรวจ = ล็อก · ใบที่เปิดงานแล้วห้ามรอบว่าง · (c) ที่เหลือต้องแก้ได้
  assert.match(guard, /OLD\."serviceProductId" IS NOT NULL AND NEW\."serviceProductId" IS NULL THEN\s+RETURN NEW;/);
  assert.match(guard, /v_parent\.status IN \('pending_approval', 'approval_revoked'\)/);
  assert.match(guard, /USING DETAIL = 'rounds_required'/);
  // ช่วงบริการตัดสินจากสถานะก่อนแก้
  assert.match(guard, /sales_order_service_setup_editable\(\s*OLD\.status, OLD\.origin/);
  for (const d of ['zones', 'kind', 'rounds', 'rounds_required', 'period']) {
    assert.ok(guard.includes(`RAISE EXCEPTION 'sales_order_service_setup_locked' USING DETAIL = '${d}'`), `DETAIL ${d}`);
  }
});

const MONEY_COLUMNS = ['status', 'actualAmount', 'totalAmount', 'orderDate', 'approvedAt', 'dealId', 'approvalFingerprint'];
const setLists = (text, table) => [...text.matchAll(new RegExp(`UPDATE public\\.${table}(?:\\s+\\w+)?\\s+SET([\\s\\S]*?)\\bWHERE\\b`, 'g'))].map((m) => m[1]);

test('🔴 เส้นตั้งย้อนหลัง/เปิดงาน/ยกงาน ไม่เขียนคอลัมน์เงินของใบ (คอลัมน์ที่ trigger Actual 0279 ฟัง + fingerprint) และไม่แตะงวด', () => {
  const fns = ['submit_sales_order_service_setup', 'approve_sales_order_service_setup', 'reject_sales_order_service_setup',
    'sales_order_open_service_terms', 'sales_order_copy_service_setup', 'save_sales_order_service_setup'];
  for (const fn of fns) {
    const b = body(fn);
    for (const list of setLists(b, 'sales_orders')) {
      for (const col of MONEY_COLUMNS) {
        assert.doesNotMatch(list, new RegExp(`(^|[\\s,(])"?${col}"?\\s*=`), `${fn}: UPDATE sales_orders SET ห้ามเขียน ${col}`);
      }
    }
    assert.doesNotMatch(b, /(UPDATE|INSERT INTO|DELETE FROM) public\.sales_order_installments/, `${fn}: ห้ามแตะงวด`);
  }
  // ตราเปิดงานไม่ขยับ updatedAt · ยกงานไป Rev. ไม่ขยับ updatedAt ของใบ Rev.
  for (const fn of ['sales_order_open_service_terms', 'sales_order_copy_service_setup']) {
    for (const list of setLists(body(fn), 'sales_orders')) assert.doesNotMatch(list, /"updatedAt"/, `${fn}: ห้ามขยับ updatedAt`);
  }
  assert.ok(setLists(body('sales_order_open_service_terms'), 'sales_orders').some((l) => /"serviceTermsOpenedAt" = now\(\)/.test(l)));
  // อนุมัติย้อนหลัง: สถานะกลับเป็น NULL + หลักฐานผู้อนุมัติ
  const approve = setLists(body('approve_sales_order_service_setup'), 'sales_orders').join(' ');
  assert.match(approve, /"serviceSetupState" = NULL/);
  assert.match(approve, /"serviceSetupApprovedAt" = now\(\)/);
});

test('🔴 D29: เปิดงานลบ term ได้เฉพาะที่ไฟล์นี้สร้าง (SZT-S) · term แบบอื่นบนใบ = RAISE ก่อนเขียนอะไร', () => {
  const b = body('sales_order_open_service_terms');
  const deletes = [...b.matchAll(/DELETE FROM public\.service_zone_terms[\s\S]*?;/g)].map((m) => m[0]);
  assert.equal(deletes.length, 1);
  for (const d of deletes) assert.match(d, /t\.id LIKE 'SZT-S%'/);
  const legacy = b.indexOf("RAISE EXCEPTION 'service_setup_legacy_terms_exist'");
  assert.ok(legacy > 0 && legacy < b.indexOf('DELETE FROM public.service_zone_terms') && legacy < b.indexOf('INSERT INTO public.service_zone_terms'));
  assert.match(b, /t\.id NOT LIKE 'SZT-S%'/);
  assert.match(b, /'SZT-S' \|\| substr\(md5\(l\.id \|\| ':' \|\| a\."zoneId"\), 1, 20\)/);
  // ลบแล้วต้องมีบันทึก · ไม่เขียนช่วง/สัญญาของ term
  assert.ok(b.indexOf("'service_zone_term'") < b.indexOf('DELETE FROM public.service_zone_terms'), 'audit ก่อนลบ');
  const insert = b.slice(b.indexOf('INSERT INTO public.service_zone_terms'), b.indexOf('ON CONFLICT'));
  assert.doesNotMatch(insert, /"startDate"|"endDate"|"serviceContractId"/);
  assert.match(insert, /'แพ็ค'/);
  // ไม่มีฟังก์ชันอื่นในไฟล์ลบ term
  for (const [fn, def] of DEFS) {
    if (fn !== 'sales_order_open_service_terms') assert.doesNotMatch(def.body, /DELETE FROM public\.service_zone_terms/, fn);
  }
});

test('🔴 กฎข้อ 14: ทุกฟังก์ชันใหม่ที่อ่านใบอนุมัติ (public.sales_orders + \'approved\') มีตัวอักษร origin = \'pipeline\'', () => {
  let seen = 0;
  for (const [fn, def] of DEFS) {
    if (!(def.body.includes('public.sales_orders') && def.body.includes("'approved'"))) continue;
    seen += 1;
    assert.match(def.body, /origin = 'pipeline'/, fn);
  }
  assert.ok(seen >= 5, `เจอแค่ ${seen} ตัว — ตัวไล่น่าจะพัง`);
  assert.doesNotMatch(CODE, /origin\s*<>\s*'pipeline'|origin\s+IS\s+DISTINCT\s+FROM\s+'pipeline'/i, 'ใช้รูปบวก origin = \'pipeline\' เท่านั้น');
});

test('0392: รหัส error เป็นคำแรกของข้อความเสมอ (JS จับด้วย message.includes) · รายละเอียดไปทาง DETAIL', () => {
  for (const [fn, def] of DEFS) {
    for (const m of def.body.matchAll(/RAISE EXCEPTION '([^']*)'/g)) {
      assert.match(m[1], /^[a-z_]+$/, `${fn}: RAISE EXCEPTION '${m[1]}' ต้องเป็นรหัสล้วน`);
    }
  }
  assert.match(body('sales_order_open_service_terms'),
    /RAISE EXCEPTION 'sales_order_service_setup_incomplete' USING DETAIL = array_to_string\(v_errors, ','\);/);
  assert.match(body('submit_sales_order_service_setup'),
    /RAISE EXCEPTION 'sales_order_service_setup_incomplete' USING DETAIL = array_to_string\(v_errors, ','\);/);
});

test('0392: ด่านของ RPC ตามลำดับแผน §6/§9 (สิทธิ์ → ล็อกแถว → สถานะ → stale)', () => {
  const order = (fn, needles) => {
    const b = body(fn);
    const at = needles.map((n) => b.indexOf(n));
    at.forEach((i, k) => assert.ok(i >= 0, `${fn}: ไม่พบ ${needles[k]}`));
    for (let k = 1; k < at.length; k += 1) assert.ok(at[k - 1] < at[k], `${fn}: ${needles[k - 1]} ต้องมาก่อน ${needles[k]}`);
  };
  order('save_sales_order_service_setup', ['is_sales_keyer_role(p_actor_role)', 'FOR UPDATE', "'service_setup_state_invalid'",
    "'workflow_stale'", "'service_setup_payload_invalid'", "'service_setup_period_invalid'", "'service_setup_line_unknown'"]);
  order('submit_sales_order_service_setup', ['is_sales_keyer_role(p_actor_role)', 'FOR UPDATE', "'service_setup_state_invalid'",
    "'workflow_stale'", "'sales_order_service_setup_incomplete'"]);
  order('approve_sales_order_service_setup', ['is_sales_manager_role(p_actor_role)', 'FOR UPDATE', "'service_setup_review_state_invalid'",
    "'workflow_stale'", "'service_setup_separation_required'", "'service_setup_override_reason_required'",
    'sales_order_open_service_terms(']);
  order('reject_sales_order_service_setup', ['is_sales_manager_role(p_actor_role)', 'FOR UPDATE', "'service_setup_review_state_invalid'",
    "'workflow_stale'", "'workflow_reason_invalid'"]);
  // เหตุผลตีกลับตัดช่องว่างก่อนนับ (CHECK นับหลัง btrim)
  assert.match(body('reject_sales_order_service_setup'), /v_reason text := btrim\(COALESCE\(p_reason, ''\)\);/);
  assert.match(body('reject_sales_order_service_setup'), /"serviceSetupRejectedReason" = v_reason/);
  // D28: รอตรวจมีความหมายเฉพาะใบ approved ที่ยังไม่ถูกแทนและยังไม่มีตรา
  for (const fn of ['approve_sales_order_service_setup', 'reject_sales_order_service_setup']) {
    const b = body(fn);
    for (const s of [`v_order."serviceSetupState" = 'submitted'`, `v_order.status = 'approved'`, `v_order.origin = 'pipeline'`,
      `v_order."supersededById" IS NULL`, `v_order."serviceTermsOpenedAt" IS NULL`]) assert.ok(b.includes(s), `${fn}: ${s}`);
  }
});

test('F1: อนุมัติงานบริการย้อนหลังต้องยังเป็นสาย SERVICE · หลักฐานผู้อนุมัติเขียนคู่กับตราเท่านั้น · ตีกลับไม่ถามสาย (ทางออก)', () => {
  const approve = body('approve_sales_order_service_setup');
  const guard = approve.slice(approve.indexOf('IF NOT ('), approve.indexOf("RAISE EXCEPTION 'service_setup_review_state_invalid'"));
  assert.ok(guard.includes(`public.sales_order_business_line(v_order.id) IS NOT DISTINCT FROM 'SERVICE'`),
    'สายเปลี่ยนเป็น PRODUCT ระหว่างรอตรวจ = review_state_invalid (ไม่ใช่ "อนุมัติ" ที่เปิด 0 โซนและไม่ประทับ)');
  /* ตาข่ายชั้นสอง: เปิดรอบขายแล้วต้องมีตรา — ไม่มี = ห้ามเขียนคอลัมน์ผู้อนุมัติ */
  const openAt = approve.indexOf('sales_order_open_service_terms(');
  const netAt = approve.indexOf(`"serviceTermsOpenedAt" IS NOT NULL`, openAt);
  const updateAt = approve.indexOf('"serviceSetupApprovedAt" = now()');
  assert.ok(openAt >= 0 && netAt > openAt && netAt < updateAt, 'ตรวจตราหลังเปิดรอบขาย ก่อนเขียนหลักฐานผู้อนุมัติ');
  assert.match(approve.slice(netAt, updateAt), /RAISE EXCEPTION 'service_setup_review_state_invalid'/);
  const reject = body('reject_sales_order_service_setup');
  assert.doesNotMatch(reject, /sales_order_business_line/, 'ตีกลับคือทางล้างคำขอตรวจของใบที่สายเปลี่ยนไปแล้ว');
});

test('F2: คอมเมนต์ของตัวตัดสินชนิดพูดตรงกับ CHECK (สตริงว่าง = ไม่มี ทุกจุด)', () => {
  assert.doesNotMatch(RAW, /ตรงกับ CHECK ที่ดู IS NULL/);
});
