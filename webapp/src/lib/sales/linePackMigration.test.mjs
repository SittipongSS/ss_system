// ── ยามตัวหนังสือของ mig 0407 (ใบเสนอราคา: ช่อง "แพ็ค/เดือน" · งวด PR-1 = ที่เก็บ + กฎเงิน + ทางก๊อป) ──────────────────────────
//
// ⭐ 0407 ทำสามอย่าง และยามนี้ล็อกรูปของทั้งสามที่ฮาร์เนสพิสูจน์ไว้ ไม่ให้ไหลเงียบใน CI:
//    1) "packQty" integer NULL + CHECK ช่วง 1–9999 บน quotation_lines และ sales_order_lines (ไม่ backfill · ไม่มีค่าตั้งต้น)
//    2) กฎเงินของบรรทัด (CHECK สองตาราง · NOT VALID แล้ว VALIDATE) — นิพจน์เดียวกับ `checkExpression` ของ quoteLinePackFixtures.json
//       ซึ่งฝั่ง JS (quoteLineNet) ใช้ชุดตัวอย่างเดียวกัน
//    3) **ปะตัวที่รันอยู่จริงสามตัว** ด้วย pg_get_functiondef (7 แถว · anchor ครั้งเดียวพอดี · ป้าย 0407/…) ให้ทุกทางก๊อปพกคอลัมน์ไป:
//       ตัวบันทึกเนื้อหาใบเสนอราคา · ตัวสร้างใบสั่งขายร่างจากใบเสนอราคา · ตัวออก Rev. ใบสั่งขาย
//       ⇒ ยามนี้ประกอบเนื้อที่รันอยู่จากตัวหนังสือ repo (0343 · 0363 · 0376 + แถว 0382 + 0385 + P2 ของ 0392) แล้วล็อกว่า
//         md5 เท่าค่าที่ฮาร์เนสพิสูจน์ (= ค่าในหัวไฟล์) · anchor ทั้งเจ็ดเจอครั้งเดียว · ถอดด้วย regex ของหัวไฟล์ได้เนื้อเดิมตรงตัว
// 🔴 ไฟล์ **ไม่สร้างฟังก์ชัน ไม่ GRANT ไม่เขียนแถวข้อมูล และไม่เอ่ยข้อความ FUNCTION ตามด้วย public.** — ยาม "นิยามล่าสุด" ของ
//    saveQuotationContentColumns · serviceRoundsCopyPaths · soServiceSetupCopyPaths · salesOrderRevisionCarry หาเจ้าของนิยามด้วย
//    ข้อความนั้น ⇒ เจ้าของต้องยังเป็น 0343 / 0363 / 0376 · migration หลังจากนี้ที่เขียนสามตัวนี้ทับทั้งก้อนต้องพก "packQty" ไปด้วย
// ⚠️ อ่าน **ตัวหนังสือ SQL + ไฟล์ตัวอย่าง JSON อย่างเดียว** — ห้าม import โมดูลของแอป ⇒ ยามนี้เขียวได้ด้วยตัวเองแม้ฝั่ง JS ยังไม่มา
// ⚠️ พฤติกรรมจริงพิสูจน์บนฮาร์เนส PGlite นอก repo (mockups/so-service-lines/pglite-harness/harness-0407.mjs — รันไฟล์สองรอบ
//    + รอบสามบนฐานที่มีข้อมูล · เทียบผลกับฐานที่ไม่มี 0407 · ทุกทางก๊อปพก NULL / 1 / 2 · บล็อกถอยกลับของหัวไฟล์ ·
//    mutate-0407.mjs = ไฟล์ที่ทำผิดทีละข้อต้องถูกจับทุกตัว)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE = '0407_quotation_line_pack_qty.sql';
const FIXTURES_URL = new URL('./quoteLinePackFixtures.json', import.meta.url);
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
/* คอมเมนต์สองแบบ — ใช้กับไฟล์ที่ต้องดู "คำสั่งจริง" (ป้าย 0407/… เป็นคอมเมนต์บล็อก จึงห้ามใช้กับข้อความที่ต้องเห็นป้าย) */
const stripLineComments = (sql) => sql.replace(/--[^\n]*/g, '');
const stripAllComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const RAW = read(FILE);
const SPLIT = RAW.indexOf('\nBEGIN;');
const HEADER = RAW.slice(0, SPLIT);
const BODY = RAW.slice(SPLIT);
const CODE = stripLineComments(BODY);
const FIXTURES = JSON.parse(readFileSync(FIXTURES_URL, 'utf8'));
const md5 = (s) => createHash('md5').update(s).digest('hex');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const occurrences = (text, needle) => text.split(needle).length - 1;
const order = (text, needles, label) => {
  const at = needles.map((n) => text.indexOf(n));
  at.forEach((i, k) => assert.ok(i >= 0, `${label}: ไม่พบ ${needles[k]}`));
  for (let k = 1; k < at.length; k += 1) assert.ok(at[k - 1] < at[k], `${label}: ${needles[k - 1]} ต้องมาก่อน ${needles[k]}`);
};
const doBlock = (tag, text = BODY) => {
  const m = new RegExp(`DO \\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$;`).exec(text);
  assert.ok(m, `ไม่พบบล็อก DO $${tag}$`);
  return m[1];
};

const SAVE = 'save_quotation_content';
const DRAFT = 'create_sales_order_draft';
const REVISE = 'revise_approved_sales_order_atomic';
const FNS = Object.freeze([SAVE, DRAFT, REVISE]);
/* นิพจน์กฎเงินตัวเดียวของทั้งงาน — ไฟล์ · ไฟล์ตัวอย่าง · ฝั่ง JS (quoteLineNet) ต้องพูดสูตรนี้ */
const CANON = 'abs("lineTotal" - (round(COALESCE("packQty", 1) * qty * "unitPrice", 2) - COALESCE("discountAmount", 0))) <= 0.01';
const TABLES = Object.freeze(['quotation_lines', 'sales_order_lines']);
/* regex ถอดแพตช์ — ตัวเดียวกันสามที่: SELECT ตรวจก่อนรัน · บล็อกถอยกลับ · ตรวจท้ายของไฟล์ */
const UNDO_ARE = String.raw`, (x\.|ql\.|line\.)?"packQty"( integer)? /\* 0407/[QDR][1-3] \*/`;
const UNDO_RE = /, (x\.|ql\.|line\.)?"packQty"( integer)? \/\* 0407\/[QDR][1-3] \*\//g;
/* md5 ของเนื้อที่รันอยู่ (หลังลบ space/tab/CR/LF) = บรรทัด INFO ของฮาร์เนส = แผน IMPL_PLAN_PR1 §2.3 = หัวไฟล์ (bodies = ttt)
   ค่านี้เปลี่ยน = เนื้อที่ฮาร์เนสพิสูจน์ไม่ใช่เนื้อนี้แล้ว ⇒ รันฮาร์เนสใหม่ก่อนแก้เลข */
const LIVE_MD5 = Object.freeze({
  [SAVE]: 'afa38a9b677f60d168c196827009b767',
  [DRAFT]: 'e11eb0a9c90d24fa9716aaae66bae377',
  [REVISE]: '2729aac0d5fbf838a3750ca5b38e25dc',
});
const LAST_DEFINER = Object.freeze({
  [SAVE]: '0343_document_customer_en.sql',
  [DRAFT]: '0363_sales_order_delivery_due_date.sql',
  [REVISE]: '0376_so_revision_moves_installments.sql',
});
/* จำนวน "packQty" ที่แต่ละตัวต้องมีหลังปะ: รายการคอลัมน์ INSERT + รายการค่า (+ ชนิดของ jsonb_to_recordset ในตัวบันทึก) */
const PACK_HITS = Object.freeze({ [SAVE]: 3, [DRAFT]: 2, [REVISE]: 2 });
const SIGNATURES = Object.freeze([
  'public.save_quotation_content(text,jsonb,jsonb)',
  'public.create_sales_order_draft(text,text,text,text,jsonb)',
  'public.revise_approved_sales_order_atomic(text,text,timestamptz,text,text,text,text)',
]);

/* แถวปะ (VALUES ของ DO $patch$): [ชื่อฟังก์ชัน, anchor, ข้อความใหม่, ป้าย] — อ่านจากตัวดิบ (ข้อความใหม่มีคอมเมนต์เป็นป้าย) */
const PATCH_ROW_RE = /\('([a-z_0-9]+)',\s*\$re\$([\s\S]*?)\$re\$,\s*\$rp\$([\s\S]*?)\$rp\$,\s*'([^']+)'\)/g;
const patchRows = (sql) => [...sql.matchAll(PATCH_ROW_RE)].map((m) => ({ fn: m[1], anchor: m[2], replacement: m[3], marker: m[4] }));
const ROWS = patchRows(doBlock('patch'));
/* ARE ของ Postgres → RegExp ของ JS (anchor ใช้แค่ \s \( \) \. \| \{ \} ซึ่งความหมายตรงกัน) · \1 ของ regexp_replace → $1 */
const toJsRegExp = (are, flags = 'g') => new RegExp(are, flags);
const toJsReplacement = (rp) => rp.replace(/\$/g, '$$$$').replace(/\\([1-9])/g, '$$$1');

const migrationNames = () => readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort();
const definesFn = (sql, fn) => new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fn}\\s*\\(`, 'i').test(stripAllComments(sql));
/* เนื้อ (prosrc) ของนิยามในไฟล์ repo — ข้อความระหว่าง AS $$ กับ $$ ปิด เหมือนที่ Postgres เก็บ */
function repoBody(file, fn) {
  const sql = read(file);
  const at = sql.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  assert.ok(at >= 0, `${file}: ไม่พบนิยาม ${fn}`);
  const from = sql.indexOf('AS $$', at) + 5;
  const to = sql.indexOf('\n$$;', from);
  assert.ok(from > at && to > from, `${file}: หาเนื้อของ ${fn} ไม่เจอ`);
  return sql.slice(from, to + 1);
}
const replaceOnce = (text, oldExpr, newExpr, label) => {
  assert.equal(occurrences(text, oldExpr), 1, `${label}: ข้อความเดิมต้องเจอครั้งเดียวพอดี`);
  return text.replace(oldExpr, () => newExpr);
};
/* เนื้อที่รันอยู่จริงก่อน 0407 = นิยามล่าสุดใน repo + แพตช์ที่ไฟล์หลังจากนั้นปะไว้ ตามลำดับไฟล์
   · ตัวบันทึกใบเสนอราคา = 0343 ล้วน · ตัวสร้างใบสั่งขายร่าง = 0363 ล้วน
   · ตัวออก Rev. = 0376 + แถวตำแหน่งของ 0382 + เจ้าของดีลของ 0385 + จุดปะ P2 ของ 0392 (เรียกตัวยกงานบริการ) */
function liveBodies() {
  const names = migrationNames().filter((n) => n < FILE);
  const out = {};
  for (const fn of FNS) {
    const definers = names.filter((n) => definesFn(read(n), fn));
    assert.equal(definers[definers.length - 1], LAST_DEFINER[fn], `นิยามเต็มล่าสุดของ ${fn} ก่อน 0407 ต้องเป็น ${LAST_DEFINER[fn]}`);
    out[fn] = repoBody(LAST_DEFINER[fn], fn);
  }
  const r382 = new RegExp(`\\('${REVISE}',\\s*\\$o\\$([\\s\\S]*?)\\$o\\$,\\s*\\$n\\$([\\s\\S]*?)\\$n\\$\\)`).exec(stripLineComments(read('0382_sales_role_hierarchy.sql')));
  assert.ok(r382, '0382 ต้องมีแถวของตัวออก Rev.');
  out[REVISE] = replaceOnce(out[REVISE], r382[1], r382[2], '0382');
  const s385 = read('0385_so_revise_by_deal_owner.sql');
  out[REVISE] = replaceOnce(out[REVISE], /\$o\$([\s\S]*?)\$o\$/.exec(s385)[1], /\$n\$([\s\S]*?)\$n\$/.exec(s385)[1], '0385');
  const p2 = patchRows(read('0392_so_service_setup.sql')).filter((r) => r.fn === REVISE);
  assert.equal(p2.length, 1, '0392 ต้องมีแถวปะของตัวออก Rev. แถวเดียว (P2)');
  assert.equal([...out[REVISE].matchAll(toJsRegExp(p2[0].anchor))].length, 1, '0392/P2: anchor ต้องเจอครั้งเดียว');
  out[REVISE] = out[REVISE].replace(toJsRegExp(p2[0].anchor, ''), toJsReplacement(p2[0].replacement));
  return out;
}
function patched(bodies) {
  const out = { ...bodies };
  for (const row of ROWS) out[row.fn] = out[row.fn].replace(toJsRegExp(row.anchor, ''), toJsReplacement(row.replacement));
  return out;
}

/* ── ทศนิยมแท้ (BigInt) — เลียนแบบ numeric ของ Postgres: คูณตรงตัว · round(x, 2) ปัดครึ่งออกจากศูนย์ ── */
function dec(value) {
  const text = String(value ?? 0);
  assert.match(text, /^-?\d+(\.\d+)?$/, `ค่าตัวอย่างต้องเป็นทศนิยมธรรมดา: ${text}`);
  const [whole, frac = ''] = text.replace('-', '').split('.');
  const n = BigInt(whole + frac);
  return { n: text.startsWith('-') ? -n : n, s: frac.length };
}
const dMul = (a, b) => ({ n: a.n * b.n, s: a.s + b.s });
const dScale = (a, s) => ({ n: a.n * 10n ** BigInt(s - a.s), s });
const dSub = (a, b) => { const s = Math.max(a.s, b.s); return { n: dScale(a, s).n - dScale(b, s).n, s }; };
function dRound2(a) {
  if (a.s <= 2) return dScale(a, 2);
  const unit = 10n ** BigInt(a.s - 2);
  const neg = a.n < 0n;
  const abs = neg ? -a.n : a.n;
  const q = abs / unit + ((abs % unit) * 2n >= unit ? 1n : 0n);
  return { n: neg ? -q : q, s: 2 };
}
/** ผลของนิพจน์กฎเงินกับหนึ่งแถว — true = CHECK ยอม */
function checkAccepts({ packQty, qty, unitPrice, discountAmount, lineTotal }) {
  const gross = dRound2(dMul(dMul(dec(packQty ?? 1), dec(qty)), dec(unitPrice)));
  const diff = dSub(dec(lineTotal), dSub(gross, dec(discountAmount ?? 0)));
  const abs = diff.n < 0n ? -diff.n : diff.n;
  return dSub({ n: abs, s: diff.s }, dec('0.01')).n <= 0n;
}

/* ── SELECT สองก้อนของหัวไฟล์ (เจ้าของแปะรันตามตัวอักษร · ฮาร์เนสรันสองก้อนนี้ตามตัวอักษรเช่นกัน) ── */
function headerSelect(title, lastAlias) {
  const at = HEADER.indexOf(title);
  assert.ok(at >= 0, `หัวไฟล์ต้องมีหัวข้อ ${title}`);
  const from = HEADER.indexOf('\n--   SELECT\n', at);
  const end = `AS ${lastAlias};`;
  const to = HEADER.indexOf(end, from);
  assert.ok(from > at && to > from, `${title}: ไม่พบ SELECT … ${end}`);
  return HEADER.slice(from, to + end.length).split('\n').map((l) => l.replace(/^--\s?/, '')).join('\n');
}
const PREFLIGHT = headerSelect('── ตรวจก่อนรัน', 'packed');
const VERIFY = headerSelect('── ตรวจหลังรัน', 'packed');
const aliases = (sql) => [...sql.matchAll(/\bAS ([a-z0-9_]+)[,;]\s*$/gm)].map((m) => m[1]);
/* ช่องที่สอง SELECT ใช้ร่วมกัน — นับของชิ้นที่ถูกต้องจากสามฟังก์ชันครบทุกตัว (ค่าที่คาดจะจริงก็ต่อเมื่อนิพจน์ถูก) */
const IN_THREE = `p.proname IN ('${SAVE}', '${DRAFT}', '${REVISE}')`;
const MARKS_EXPR = `(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace, regexp_matches(p.prosrc, $re$/\\* 0407/[QDR][1-3] \\*/$re$, 'g') AS m WHERE n.nspname = 'public' AND ${IN_THREE}) AS marks`;
const CHAIN_EXPR = `(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = '${REVISE}' AND strpos(p.prosrc, 'public.is_sales_manager_role(p_actor_role)') > 0 AND strpos(p.prosrc, 'd."ownerId" = p_actor_id') > 0 AND strpos(p.prosrc, 'sales_order_copy_service_setup(') > 0) AS chain`;

test('ทรานแซกชันเดียว · NOTIFY หลัง COMMIT · ไม่มีตารางชั่วคราว · ไม่สร้างฟังก์ชัน · ไม่ GRANT/REVOKE · ไม่เขียนแถวข้อมูล · ไม่ลบอะไรนอกจาก CHECK ของตัวเอง', () => {
  assert.equal(occurrences(RAW, '\nBEGIN;\n'), 1, 'BEGIN; ชั้นนอกครั้งเดียว');
  assert.equal(occurrences(RAW, '\nCOMMIT;\n'), 1, 'COMMIT; ครั้งเดียว');
  const commitAt = CODE.indexOf('\nCOMMIT;');
  assert.equal(occurrences(CODE, "NOTIFY pgrst, 'reload schema';"), 1);
  assert.ok(CODE.indexOf("NOTIFY pgrst, 'reload schema';") > commitAt, 'NOTIFY หลัง COMMIT');
  assert.equal(CODE.slice(commitAt).replace("NOTIFY pgrst, 'reload schema';", '').replace('COMMIT;', '').trim(), '', 'หลัง COMMIT มีแค่ NOTIFY');
  /* SQL Editor เตือนเมื่อเห็นตารางชั่วคราว — ลายนิ้วมือเก็บด้วย set_config (ตัวแปรของทรานแซกชัน: อาร์กิวเมนต์ที่สาม = true) */
  assert.doesNotMatch(CODE, /\b(TEMP|TEMPORARY)\b/i);
  assert.equal(occurrences(CODE, 'PERFORM set_config('), 2);
  assert.match(flat(CODE), /PERFORM set_config\('mig_0407\.others', \( SELECT md5\(/);
  assert.match(flat(CODE), /PERFORM set_config\('mig_0407\.meta', \( SELECT jsonb_object_agg\(/);
  assert.equal(occurrences(flat(doBlock('pre')), '), true);'), 2, 'ตัวแปรสองตัวต้องเป็นของทรานแซกชัน (is_local = true) — ไม่ค้างในเซสชันของ SQL Editor');
  assert.doesNotMatch(CODE, /SECURITY\s+DEFINER/i);
  /* 🔴 ไม่มี CREATE ใด ๆ — ฟังก์ชันสามตัวถูกปะผ่าน EXECUTE ของข้อความจาก pg_get_functiondef เท่านั้น */
  assert.doesNotMatch(CODE, /\bCREATE\b/i, 'ไฟล์นี้ไม่สร้างฟังก์ชัน/ตาราง/trigger/index');
  assert.doesNotMatch(CODE, /\b(GRANT|REVOKE)\b/, 'สิทธิ์เดินไปกับ CREATE OR REPLACE ของ pg_get_functiondef — ไฟล์ไม่แตะสิทธิ์');
  assert.equal(occurrences(CODE, 'EXECUTE '), 1, 'EXECUTE เดียวของไฟล์ = นิยามที่ปะแล้ว');
  assert.equal(occurrences(CODE, 'EXECUTE regexp_replace(v_def, r.anchor, r.replacement);'), 1, 'แทนครั้งเดียว (ไม่มีแฟล็ก g) จากข้อความของ pg_get_functiondef');
  /* ไม่ backfill: ตัดสตริง (anchor · ข้อความใหม่ · needle ของตรวจท้าย · คอมเมนต์ของคอลัมน์) ออกก่อน แล้วต้องไม่เหลือคำสั่งเขียนแถว */
  const statements = CODE.replace(/\$(re|rp|u)\$[\s\S]*?\$\1\$/g, '').replace(/'(?:[^']|'')*'/g, "''");
  assert.doesNotMatch(statements, /\b(UPDATE|INSERT|DELETE|TRUNCATE|MERGE|COPY)\b/, 'ต้องไม่มีคำสั่งเขียน/ลบแถวข้อมูล');
  assert.deepEqual([...statements.matchAll(/\bDROP\s+(\w+)(\s+IF EXISTS)?\s+(\w+)/g)].map((m) => `${m[1]}${m[2] || ''} ${m[3]}`), [
    'CONSTRAINT IF EXISTS quotation_lines_pack_qty_range', 'CONSTRAINT IF EXISTS sales_order_lines_pack_qty_range',
    'CONSTRAINT IF EXISTS quotation_lines_line_money_rule', 'CONSTRAINT IF EXISTS sales_order_lines_line_money_rule',
  ], 'DROP ได้เฉพาะ CHECK สี่ตัวของไฟล์นี้เอง (ลบแล้วสร้างใหม่ = รันซ้ำได้)');
  assert.deepEqual([...new Set([...statements.matchAll(/ALTER TABLE (?:ONLY )?public\.(\w+)/g)].map((m) => m[1]))].sort(), [...TABLES].sort(),
    'ALTER ได้เฉพาะตารางบรรทัดสองตัว');
});

test('คอลัมน์: "packQty" integer ว่างได้ ไม่มีค่าตั้งต้น บนสองตาราง (ADD COLUMN IF NOT EXISTS · คำสั่งชั้นนอก) · CHECK ช่วง 1–9999 ลบแล้วสร้างใหม่', () => {
  for (const m of CODE.matchAll(/ADD COLUMN(?! IF NOT EXISTS)/g)) assert.fail(`ADD COLUMN ต้องมี IF NOT EXISTS (ตำแหน่ง ${m.index})`);
  assert.equal(occurrences(CODE, 'ADD COLUMN'), 2, 'เพิ่มคอลัมน์สองครั้งพอดี — ตารางละหนึ่ง');
  for (const table of TABLES) {
    assert.equal(occurrences(CODE, `ALTER TABLE public.${table}\n  ADD COLUMN IF NOT EXISTS "packQty" integer;`), 1,
      `${table}: คอลัมน์ต้องเป็น integer ล้วน — ไม่มี DEFAULT / NOT NULL (แถวเดิมทุกแถวเป็น NULL = คูณ 1 · ไม่มีแถวไหนถูกเขียน)`);
    const dropAt = CODE.indexOf(`ALTER TABLE public.${table} DROP CONSTRAINT IF EXISTS ${table}_pack_qty_range;`);
    const add = `ALTER TABLE public.${table}\n  ADD CONSTRAINT ${table}_pack_qty_range CHECK ("packQty" IS NULL OR "packQty" BETWEEN 1 AND 9999);`;
    assert.ok(dropAt > 0 && CODE.indexOf(add) > dropAt, `${table}: CHECK ช่วง — DROP IF EXISTS ก่อน ADD · ช่วง 1–9999 (= sales_order_line_zones."packsPerRound")`);
    assert.ok(CODE.includes(`COMMENT ON COLUMN public.${table}."packQty" IS`), `คอมเมนต์ของ ${table}."packQty"`);
  }
  assert.doesNotMatch(CODE, /"packQty"\s+integer\s+(NOT NULL|DEFAULT)/i);
  assert.doesNotMatch(CODE, /EXECUTE\s+format\(|EXECUTE\s+'ALTER/, 'DDL ของตารางเป็นคำสั่งชั้นนอก ไม่ใช่ DO/EXECUTE');
  assert.equal(occurrences(CODE, 'BETWEEN 1 AND 9999'), 2);
});

test('🔴 กฎเงินของบรรทัด: นิพจน์เดียว 5 ที่พอดี (CHECK ×2 · นับก่อนสร้าง ×2 · ตรวจชุดตัวอย่าง ×1) · นับก่อน → NOT VALID → VALIDATE ทั้งสองตาราง', () => {
  assert.equal(FIXTURES.checkExpression, CANON, 'ไฟล์ตัวอย่างต้องถือนิพจน์เดียวกับยามนี้ (ฝั่ง JS อ่านจากไฟล์ตัวอย่าง)');
  assert.equal(occurrences(CODE, CANON), 5, 'นิพจน์กฎเงินต้องปรากฏ 5 ที่พอดีในตัวไฟล์');
  assert.equal(occurrences(CODE, 'COALESCE("packQty", 1)'), 5, 'ไม่มีสำเนาของสูตรที่เขียนต่างออกไป');
  assert.equal(occurrences(CODE, '<= 0.01'), 5, 'ค่าคลาด ±0.01 ที่เดียวกับนิพจน์ — ไม่มีค่าคลาดอื่น');
  assert.doesNotMatch(CODE, /<=\s*0\.0*[2-9]|<=\s*[1-9]|<\s*0\.01/, 'ห้ามค่าคลาดอื่น');
  const pre = doBlock('precheck', CODE);
  for (const table of TABLES) {
    assert.ok(pre.includes(`FROM public.${table}\n   WHERE NOT (${CANON});`), `นับแถวที่ผิดกฎของ ${table} ด้วยนิพจน์เดียวกัน`);
    const drop = `ALTER TABLE public.${table} DROP CONSTRAINT IF EXISTS ${table}_line_money_rule;`;
    const add = `ALTER TABLE public.${table}\n  ADD CONSTRAINT ${table}_line_money_rule CHECK (\n    ${CANON}\n  ) NOT VALID;`;
    const validate = `ALTER TABLE public.${table} VALIDATE CONSTRAINT ${table}_line_money_rule;`;
    order(CODE, ['DO $precheck$', '$precheck$;', drop, add, validate], `กฎเงินของ ${table}`);
    assert.equal(occurrences(CODE, validate), 1);
    assert.ok(CODE.includes(`COMMENT ON CONSTRAINT ${table}_line_money_rule ON public.${table} IS`));
  }
  assert.match(pre, /IF v_qt <> 0 OR v_so <> 0 THEN\s+RAISE EXCEPTION 'mig_0407_line_money_violations quotation_lines=% sales_order_lines=%[^']*', v_qt, v_so;/,
    'มีแถวผิดกฎแม้แถวเดียว = RAISE บอกจำนวนของแต่ละตาราง (VALIDATE บอกแค่ว่า "มีแถวผิด")');
  assert.equal(occurrences(CODE, 'NOT VALID'), 2);
  assert.equal(occurrences(CODE, 'VALIDATE CONSTRAINT'), 2);
  /* คอลัมน์ต้องมาก่อนกฎเงิน · กฎเงินก่อนตรวจชุดตัวอย่าง · ปะหลังสุด · ตรวจท้ายปิด */
  order(CODE, ['DO $pre$', 'ADD COLUMN IF NOT EXISTS "packQty" integer;', 'DO $precheck$', 'ADD CONSTRAINT quotation_lines_line_money_rule',
    'DO $fixture$', 'DO $patch$', 'DO $verify$', '\nCOMMIT;'], 'ลำดับของไฟล์');
});

test('ชุดตัวอย่าง: VALUES ของ §3 = quoteLinePackFixtures.json ทุกแถวทุกค่า (rule ก่อน แล้ว stored) · คิดซ้ำด้วยทศนิยมแท้ได้ผลตาม ok ทุกแถว', () => {
  const block = doBlock('fixture', CODE);
  const tuples = [...block.matchAll(/\('([A-Za-z0-9-]+)',\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*(true|false)\)/g)].map((m) => {
    const num = (s) => { const t = s.trim().replace(/::(numeric|integer)$/, ''); return t === 'NULL' ? null : Number(t); };
    return { id: m[1], packQty: num(m[2]), qty: num(m[3]), unitPrice: num(m[4]), discountAmount: num(m[5]), lineTotal: num(m[6]), ok: m[7] === 'true' };
  });
  const money = ({ id, packQty, qty, unitPrice, discountAmount, lineTotal }) => ({ id, packQty, qty, unitPrice, discountAmount, lineTotal });
  const expected = [...FIXTURES.rule.map((r) => ({ ...money(r), ok: true })), ...FIXTURES.stored.map((r) => ({ ...money(r), ok: r.ok }))];
  assert.equal(expected.length, 29, 'rule 20 + stored 9');
  assert.deepEqual(tuples, expected, 'VALUES ของไฟล์ต้องเท่าไฟล์ตัวอย่างทุกแถวทุกค่า ตามลำดับ');
  assert.equal(new Set(expected.map((r) => r.id)).size, expected.length, 'รหัสตัวอย่างไม่ซ้ำ');
  for (const row of expected) {
    assert.equal(checkAccepts(row), row.ok, `${row.id}: นิพจน์กฎเงิน (ทศนิยมแท้) ต้อง${row.ok ? 'ยอม' : 'ปฏิเสธ'}`);
  }
  /* ชุดตัวอย่างต้องมีทั้งสองฝั่งของกฎ: แถวที่ลืมตัวคูณ (ปฏิเสธ) · จุดบอดที่รู้อยู่ (แพ็ค 1 หาย = ยอม) · ครึ่งสตางค์ที่ JS กับฐานปัดคนละทาง */
  const byId = Object.fromEntries(expected.map((r) => [r.id, r]));
  assert.equal(byId['X-forgot-multiplier'].ok, false);
  assert.equal(byId['X-multiplied-no-pack'].ok, false);
  assert.equal(byId['X-pack1-lost'].ok, true, 'จุดบอดของ CHECK ต้องถูกเขียนไว้ให้เห็น — ยามทางก๊อป + สคริปต์ parity เป็นคนจับ');
  assert.equal(byId['X-two-satang-off'].ok, false);
  const half = FIXTURES.rule.find((r) => r.id === 'I-half-satang-pack');
  assert.equal(half.sqlGross, 149.99, 'ฐานปัด 149.985 ขึ้น');
  assert.equal(half.gross, 149.98, 'JS ได้ 149.98 — ต่าง 1 สตางค์ = เหตุที่ต้องมีค่าคลาด');
  assert.ok(FIXTURES.rule.some((r) => r.discountType === 'percent') && FIXTURES.rule.some((r) => r.discountType === 'amount')
    && FIXTURES.rule.some((r) => r.lineTotal === 0) && FIXTURES.rule.some((r) => r.packQty === 9999) && FIXTURES.rule.some((r) => r.packQty === null),
  'ชุดตัวอย่างครอบส่วนลด % · บาท · ยอดศูนย์ · แพ็คสูงสุด · ไม่แยกแพ็ค');
  /* ตัวตรวจในไฟล์: เทียบผลของนิพจน์กับ ok ทีละแถว — ไม่ตรง = RAISE บอกรหัสตัวอย่าง */
  assert.ok(block.includes(`WHERE (${CANON}) IS DISTINCT FROM f.ok;`));
  assert.match(block, /AS f\(id, "packQty", qty, "unitPrice", "discountAmount", "lineTotal", ok\)/);
  assert.match(block, /IF v_bad IS NOT NULL THEN\s+RAISE EXCEPTION 'mig_0407_fixture %', v_bad;/);
});

test('แถวปะ: 7 แถวพอดี (Q1 Q2 Q3 · D1 D2 · R1 R2) · ข้อความใหม่ = \\1 + ", <ค่าที่มี "packQty"> /* ป้าย */" + \\2 — ไม่ลบอะไร · anchor ไม่กว้าง', () => {
  assert.deepEqual(ROWS.map((r) => `${r.fn}|${r.marker}`), [
    `${SAVE}|0407/Q1`, `${SAVE}|0407/Q2`, `${SAVE}|0407/Q3`, `${DRAFT}|0407/D1`, `${DRAFT}|0407/D2`, `${REVISE}|0407/R1`, `${REVISE}|0407/R2`,
  ]);
  assert.equal(patchRows(BODY).length, 7, 'ไม่มีแถวปะนอกบล็อก DO $patch$');
  const VALUE = { '0407/Q1': '"packQty"', '0407/Q2': 'x."packQty"', '0407/Q3': '"packQty" integer', '0407/D1': '"packQty"',
    '0407/D2': 'ql."packQty"', '0407/R1': '"packQty"', '0407/R2': 'line."packQty"' };
  for (const row of ROWS) {
    assert.equal(row.replacement, `\\1, ${VALUE[row.marker]} /* ${row.marker} */\\2`, `${row.marker}: ข้อความใหม่ต้องเป็น \\1 + ของที่แทรก + \\2`);
    /* ของที่แทรกทั้งก้อนต้องเป็นสิ่งที่ regex ถอดแพตช์จับได้พอดี — ถอดแล้วเหลือ \1\2 = เนื้อเดิม */
    assert.equal(row.replacement.replace(UNDO_RE, ''), '\\1\\2', `${row.marker}: regex ถอดแพตช์ต้องลบของที่แทรกได้หมดพอดี`);
    assert.equal(new RegExp(`${row.anchor}|`).exec('').length - 1, 2, `${row.marker}: anchor ต้องมีสองกลุ่ม (\\1 ก่อนจุดแทรก · \\2 หลังจุดแทรก)`);
    assert.ok(row.anchor.startsWith('(') && row.anchor.endsWith(')') && row.anchor.includes(')('), `${row.marker}: สองกลุ่มต้องติดกัน — ไม่มีอะไรถูกกลืนระหว่างกลุ่ม`);
    /* anchor ห้ามมีตัวกวาด (จุด · [^…] · ตัวนับไม่จำกัดของอักขระทั่วไป) — ช่องว่างเท่านั้นที่ยืดได้ */
    assert.doesNotMatch(row.anchor.replace(/\\[.()|{}]/g, ''), /\.|\[|\{\d/, `${row.marker}: anchor ต้องเป็นข้อความตรงตัว (ยืดได้เฉพาะ \\s)`);
  }
  const patch = stripLineComments(doBlock('patch'));
  order(patch, [
    "WHERE n.nspname = 'public' AND p.proname = r.fn;\n    IF v_n <> 1 THEN\n      RAISE EXCEPTION 'mig_0407_patch_overload % count=%', r.fn, v_n;",
    'IF strpos(v_src, r.marker) > 0 THEN',
    "RAISE NOTICE '0407: % % — ปะไว้แล้ว', r.marker, r.fn;\n      CONTINUE;",
    'v_def := pg_get_functiondef(v_oid);',
    "SELECT count(*) INTO v_hits_src FROM regexp_matches(v_src, r.anchor, 'g');",
    "SELECT count(*) INTO v_hits_def FROM regexp_matches(v_def, r.anchor, 'g');",
    "IF v_hits_src <> 1 OR v_hits_def <> 1 THEN\n      RAISE EXCEPTION 'mig_0407_patch_anchor % % hits=%/%', r.marker, r.fn, v_hits_src, v_hits_def;",
    'EXECUTE regexp_replace(v_def, r.anchor, r.replacement);',
    "RAISE NOTICE '0407: % % — ปะแล้ว', r.marker, r.fn;",
  ], 'บล็อกปะ');
});

test('🔴 เนื้อที่รันอยู่ของสามฟังก์ชัน (จากตัวหนังสือ repo + แพตช์เดิม): md5 เท่าที่ฮาร์เนสพิสูจน์และเท่าหัวไฟล์ · anchor เจ็ดตัวเจอครั้งเดียว · หลังปะ 3/2/2 · ถอดแล้วได้เนื้อเดิมตรงตัว', () => {
  const live = liveBodies();
  for (const fn of FNS) {
    assert.equal(md5(live[fn].replace(/[ \t\n\r]/g, '')), LIVE_MD5[fn],
      `เนื้อของ ${fn} ใน repo ไม่ใช่เนื้อที่ฮาร์เนส 0407 พิสูจน์แล้ว — รันฮาร์เนสใหม่ก่อนแก้เลข`);
    assert.ok(HEADER.includes(`'${fn}', '${LIVE_MD5[fn]}')`), `หัวไฟล์ (bodies) ต้องถือ md5 ของ ${fn} ค่าเดียวกัน`);
    assert.equal(occurrences(live[fn], '"packQty"'), 0, `ก่อน 0407 ${fn} ยังไม่รู้จักคอลัมน์นี้`);
    assert.equal(occurrences(live[fn], '0407/'), 0);
  }
  for (const row of ROWS) {
    assert.equal([...live[row.fn].matchAll(toJsRegExp(row.anchor))].length, 1, `${row.marker}: anchor ต้องเจอครั้งเดียวพอดีในเนื้อที่รันอยู่ของ ${row.fn}`);
  }
  const after = patched(live);
  for (const fn of FNS) {
    assert.notEqual(after[fn], live[fn]);
    assert.equal(occurrences(after[fn], '"packQty"'), PACK_HITS[fn], `${fn}: "packQty" หลังปะ (ตรวจท้ายของไฟล์นับแบบเดียวกัน)`);
    assert.equal(after[fn].replace(UNDO_RE, ''), live[fn], `${fn}: ถอดด้วย regex ของหัวไฟล์แล้วต้องได้เนื้อเดิมทุกไบต์`);
    assert.equal(after[fn].length - live[fn].length, ROWS.filter((r) => r.fn === fn)
      .reduce((n, r) => n + r.replacement.length - 4, 0), `${fn}: เนื้อใหม่ยาวขึ้นเท่าของที่แทรกพอดี — ไม่มีอะไรหาย`);
  }
  for (const row of ROWS) assert.equal(occurrences(after[row.fn], `/* ${row.marker} */`), 1, `${row.marker}: ป้ายครั้งเดียว`);
  /* ของที่แทรกลงถูกที่: ท้ายรายการคอลัมน์ INSERT · ท้ายรายการค่า · ท้ายชนิดของ recordset — ไม่ใช่ที่อื่นของฟังก์ชัน */
  const f = (s) => flat(s);
  assert.ok(f(after[SAVE]).includes('"sortOrder", metadata, "serviceRounds", "packQty" /* 0407/Q1 */ ) SELECT x.id, p_quote_id,'));
  assert.ok(f(after[SAVE]).includes(`COALESCE(x.metadata, '{}'::jsonb), x."serviceRounds", x."packQty" /* 0407/Q2 */ FROM jsonb_to_recordset(p_lines) AS x(`));
  assert.ok(f(after[SAVE]).includes('"sortOrder" integer, metadata jsonb, "serviceRounds" integer, "packQty" integer /* 0407/Q3 */ ); END IF;'));
  assert.ok(f(after[DRAFT]).includes(`"lineTotal", "sortOrder", metadata, "packQty" /* 0407/D1 */ ) SELECT 'SOL-' || md5(p_order_id || ':' || ql.id),`));
  assert.ok(f(after[DRAFT]).includes('ql."lineTotal", ql."sortOrder", ql.metadata, ql."packQty" /* 0407/D2 */ FROM public.quotation_lines ql WHERE ql."quotationId" = v_quote.id;'));
  assert.ok(f(after[REVISE]).includes(`metadata, "createdAt", "serviceRounds", "packQty" /* 0407/R1 */ ) SELECT 'SOL-' || md5(p_revision_id || ':' || line.id),`));
  assert.ok(f(after[REVISE]).includes('line.metadata, v_now, line."serviceRounds", line."packQty" /* 0407/R2 */ FROM public.sales_order_lines line WHERE line."salesOrderId" = v_source.id;'));
  /* แพตช์เดิมของตัวออก Rev. ยังอยู่ครบครั้งเดียว (ด่านก่อนรัน + ตรวจท้ายของไฟล์ดูข้อความชุดเดียวกัน) */
  for (const needle of ['public.is_sales_manager_role(p_actor_role)', 'd."ownerId" = p_actor_id', 'sales_order_copy_service_setup(',
    '"movedFrom" = "movedFrom" || jsonb_build_array(']) {
    assert.equal(occurrences(after[REVISE], needle), 1, `ตัวออก Rev. หลังปะ: "${needle}" ต้องมีครั้งเดียว`);
  }
  assert.equal(occurrences(after[SAVE], 'DELETE FROM public.quotation_lines WHERE "quotationId" = p_quote_id;'), 1);
  /* INSERT ของบรรทัด: จำนวนคอลัมน์ = จำนวนค่า หลังปะ (ใส่ข้างเดียว SQL พังตอนเรียก ไม่ใช่ตอนรันไฟล์) */
  const top = (list) => { let depth = 0; let n = 1; for (const ch of list) { if (ch === '(') depth += 1; else if (ch === ')') depth -= 1; else if (ch === ',' && depth === 0) n += 1; } return n; };
  for (const [fn, table, stop] of [[SAVE, 'quotation_lines', 'FROM jsonb_to_recordset'], [DRAFT, 'sales_order_lines', 'FROM public.quotation_lines ql'],
    [REVISE, 'sales_order_lines', 'FROM public.sales_order_lines line']]) {
    const text = stripAllComments(after[fn]);
    const at = text.indexOf(`INSERT INTO public.${table} (`);
    assert.ok(at > 0 && text.indexOf(`INSERT INTO public.${table} (`, at + 1) < 0, `${fn}: INSERT ของบรรทัดมีที่เดียว`);
    const cols = text.slice(text.indexOf('(', at) + 1, text.indexOf(')', at));
    const selAt = text.indexOf('SELECT', at);
    const values = text.slice(selAt + 6, text.indexOf(stop, selAt));
    assert.equal(top(cols), top(values), `${fn}: จำนวนคอลัมน์ของ INSERT ต้องเท่าจำนวนค่าที่ SELECT`);
    assert.ok(cols.trim().endsWith('"packQty"'), `${fn}: "packQty" อยู่ท้ายรายการคอลัมน์`);
    assert.match(values.trim(), /(x|ql|line)\."packQty"$/, `${fn}: ค่าของ "packQty" อยู่ท้ายรายการค่า`);
  }
});

test('🔴 ไฟล์ไม่เอ่ยข้อความ FUNCTION ตามด้วย public. เลย (แม้ในคอมเมนต์) — เจ้าของ "นิยามล่าสุด" ของสามตัวยังเป็น 0343 / 0363 / 0376', () => {
  assert.doesNotMatch(RAW, /FUNCTION\s+public\./, 'ยาม "นิยามล่าสุด" ของเทสต์อื่นหาเจ้าของนิยามด้วยข้อความนี้');
  /* ท่าเดียวกับ saveQuotationContentColumns / serviceRoundsCopyPaths / soServiceSetupCopyPaths: ไฟล์เลขสูงสุดที่มีข้อความนี้ = เจ้าของ */
  const names = migrationNames().filter((n) => n <= FILE);
  for (const fn of FNS) {
    const owning = names.filter((n) => read(n).includes(`FUNCTION public.${fn}`));
    assert.equal(owning[owning.length - 1], LAST_DEFINER[fn], `เจ้าของนิยามล่าสุดของ ${fn} (ถึง 0407) ต้องเป็น ${LAST_DEFINER[fn]}`);
  }
  /* ชื่อฟังก์ชันอยู่ในไฟล์เป็นสตริงเท่านั้น: 'ชื่อ' หรือลายเซ็นเต็มของ has_function_privilege */
  for (const fn of FNS) {
    const bare = [...CODE.matchAll(new RegExp(`(.)(?:public\\.)?${fn}(.)`, 'g'))];
    assert.ok(bare.length > 0);
    for (const m of bare) assert.ok(m[1] === "'" && (m[2] === "'" || m[2] === '('), `${fn}: ต้องอ้างเป็นสตริงเท่านั้น (เจอ ${m[0]})`);
  }
  /* ก่อน 0407 ไม่มี migration ไหนรู้จักคอลัมน์นี้ ⇒ ตัวเขียนบรรทัดของใบสั่งขายย้อนหลัง (0379 + แพตช์ 0394) เขียน NULL ต่อไป */
  const mentions = migrationNames().filter((n) => n < FILE && read(n).includes('packQty'));
  assert.deepEqual(mentions, [], 'ก่อน 0407 ต้องไม่มีไฟล์ไหนเอ่ยถึง packQty');
});

/* นิยามเต็มของฟังก์ชันในข้อความ SQL หนึ่งไฟล์ (ตัดคอมเมนต์ทั้งสองแบบก่อน) — คืนข้อความของแต่ละนิยามตั้งแต่ CREATE ถึงปลายเนื้อ */
function definitionsOf(sql, fn) {
  const code = stripAllComments(sql);
  const out = [];
  for (const m of code.matchAll(new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fn}\\s*\\(`, 'gi'))) {
    const tail = code.slice(m.index);
    const open = /\bAS\s+(\$[A-Za-z_0-9]*\$)/.exec(tail);
    if (!open) { out.push(tail.slice(0, tail.indexOf(';') + 1 || tail.length)); continue; }
    const from = open.index + open[0].length;
    const to = tail.indexOf(open[1], from);
    out.push(to < 0 ? tail : tail.slice(0, to));
  }
  return out;
}
const redefinitionProblems = (name, sql) => FNS.flatMap((fn) => definitionsOf(sql, fn)
  .filter((def) => occurrences(def, '"packQty"') < PACK_HITS[fn])
  .map((def) => `${name} นิยาม ${fn} ทับทั้งก้อน แต่มี "packQty" ${occurrences(def, '"packQty"')} ที่ (ต้อง ≥ ${PACK_HITS[fn]}) — เลขแพ็คจะหายจากทางก๊อปเงียบ ๆ`));

test('🔴 migration หลัง 0407 ที่นิยามสามตัวนี้ทับทั้งก้อนต้องพก "packQty" ไปด้วย (≥ 3 / 2 / 2) · ห้ามลบคอลัมน์ · ลบกฎเงินต้องสร้างคืนในไฟล์เดียวกัน', () => {
  /* ตัวสแกนเองต้องจับได้จริง — ลองกับข้อความจำลองก่อนเชื่อผลของโฟลเดอร์ */
  const def = (fn, body) => `CREATE OR REPLACE FUNCTION public.${fn}(p text)\nRETURNS jsonb LANGUAGE plpgsql AS $$\nBEGIN\n${body}\nEND;\n$$;\n`;
  const good = { [SAVE]: 'INSERT (a, "packQty") SELECT x.a, x."packQty" FROM r AS x(a text, "packQty" integer);',
    [DRAFT]: 'INSERT (a, "packQty") SELECT ql.a, ql."packQty" FROM q ql;', [REVISE]: 'INSERT (a, "packQty") SELECT line.a, line."packQty" FROM l line;' };
  for (const fn of FNS) {
    assert.deepEqual(redefinitionProblems('x.sql', def(fn, good[fn])), [], `${fn}: นิยามที่พกคอลัมน์ครบต้องผ่าน`);
    assert.equal(redefinitionProblems('x.sql', def(fn, 'INSERT (a) SELECT a FROM t;')).length, 1, `${fn}: นิยามที่ไม่มีคอลัมน์ต้องถูกจับ`);
    assert.equal(redefinitionProblems('x.sql', def(fn, good[fn].replace('"packQty")', '"packQtyX")').replace(', "packQty" integer', ''))).length, 1,
      `${fn}: ใส่ข้างเดียว (ขาดหนึ่งที่) ต้องถูกจับ`);
    assert.equal(redefinitionProblems('x.sql', def(fn, `-- "packQty" "packQty" "packQty"\n/* "packQty" */ INSERT (a) SELECT a FROM t;`)).length, 1,
      `${fn}: คอลัมน์ที่อยู่แต่ในคอมเมนต์ไม่นับ`);
    assert.equal(redefinitionProblems('x.sql', `${def(fn, good[fn])}\n${def(fn, 'INSERT (a) SELECT a FROM t;')}`).length, 1, `${fn}: นิยามสองก้อนในไฟล์เดียว ก้อนที่ขาดต้องถูกจับ`);
    assert.equal(redefinitionProblems('x.sql', def(fn, good[fn]).replace('CREATE OR REPLACE FUNCTION', 'create function')).length, 0, 'ตัวพิมพ์เล็กก็คือคำสั่งเดียวกัน');
    assert.equal(redefinitionProblems('x.sql', def(fn, 'x').replace('CREATE OR REPLACE FUNCTION', 'create function')).length, 1);
    /* ไม่ใช่นิยาม: COMMENT / GRANT / คอมเมนต์ / ชื่อที่ยาวกว่า */
    assert.deepEqual(redefinitionProblems('x.sql', `COMMENT ON FUNCTION public.${fn}(text) IS 'x';\nGRANT EXECUTE ON FUNCTION public.${fn}(text) TO service_role;\n`
      + `-- CREATE OR REPLACE FUNCTION public.${fn}(\n${def(`${fn}_v2`, 'x')}`), []);
  }
  const later = migrationNames().filter((n) => n > FILE);
  for (const name of later) {
    const sql = read(name);
    assert.deepEqual(redefinitionProblems(name, sql), []);
    const code = stripAllComments(sql);
    assert.doesNotMatch(code, /DROP COLUMN (IF EXISTS )?"packQty"/, `${name} ลบ "packQty" — หลังมีบรรทัดที่มีเลขแพ็คแล้ว ยอด 84,000 จะเหลือสูตร 42,000 โดยไม่มีอะไรฟ้อง`);
    for (const table of TABLES) {
      for (const suffix of ['line_money_rule', 'pack_qty_range']) {
        if (new RegExp(`DROP CONSTRAINT (IF EXISTS )?${table}_${suffix}\\b`).test(code)) {
          assert.match(code, new RegExp(`ADD CONSTRAINT ${table}_${suffix}\\b`), `${name} ลบ ${table}_${suffix} แล้วไม่สร้างคืน — ด่านสุดท้ายของตัวคูณแพ็คหาย`);
        }
      }
    }
  }
});

/* ── ทะเบียนคอลัมน์ของตารางบรรทัด (ฉบับบรรทัดของ quotationReviseColumns.test.mjs) ───────────────────────────────────
   เก็บทุกคอลัมน์ที่ migration เคยให้ quotation_lines / sales_order_lines แล้วบังคับว่า **ทุกทางก๊อปใน SQL ต้องตัดสินทุกคอลัมน์**:
   พกไป หรือ ยกเว้นด้วยชื่อ + เหตุผล ⇒ เพิ่มคอลัมน์บรรทัดวันหน้าแล้วไม่ตัดสิน = แดงทันที ไม่ใช่รู้ตัวตอนค่าหายบนใบ Rev. */
function lineTableColumns(table) {
  const cols = new Set();
  for (const name of migrationNames()) {
    const sql = stripLineComments(read(name));
    for (const m of sql.matchAll(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`, 'gi'))) {
      for (const line of m[1].split('\n')) {
        const c = /^\s*"?([A-Za-z_][A-Za-z0-9_]*)"?\s+[a-z]/.exec(line);
        if (c && !/^(CONSTRAINT|CHECK|PRIMARY|UNIQUE|FOREIGN)$/i.test(c[1])) cols.add(c[1]);
      }
    }
    for (const m of sql.matchAll(new RegExp(`ALTER TABLE (?:ONLY )?public\\.${table}\\b([\\s\\S]*?);`, 'gi'))) {
      for (const c of m[1].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)) cols.add(c[1]);
    }
  }
  return cols;
}
/* รายการค่าของ INSERT … SELECT ของบรรทัด (ระหว่าง SELECT กับ FROM ของมัน) — "พกไป" นับจากตรงนี้เท่านั้น ไม่นับ WHERE */
function insertValues(body, table, stop) {
  const at = body.indexOf(`INSERT INTO public.${table} (`);
  const selAt = body.indexOf('SELECT', at);
  const to = body.indexOf(stop, selAt);
  assert.ok(at >= 0 && selAt > at && to > selAt, `หา INSERT … SELECT ของ ${table} ไม่เจอ`);
  return body.slice(selAt + 6, to);
}
const SITE_FLAGS = ['siteNotFoundAt', 'siteNotFoundById', 'siteNotFoundByName', 'siteNotFoundReason', 'siteNotFoundNote',
  'siteClosedAt', 'siteClosedById', 'siteClosedByName', 'siteClosedNote'];
const HOPS = Object.freeze([
  { fn: SAVE, table: 'quotation_lines', label: 'บันทึกเนื้อหาใบเสนอราคา',
    /* พกไป = อยู่ในชนิดของ jsonb_to_recordset (whitelist: คีย์ที่ไม่มีชื่อในนี้ถูกทิ้งเงียบ) */
    carried: (body) => new Set([...body.slice(body.indexOf('AS x(') + 5, body.indexOf(');', body.indexOf('AS x('))).matchAll(/"?([A-Za-z_][A-Za-z0-9_]*)"?\s+(?:text|numeric|integer|jsonb)\b/g)].map((m) => m[1])),
    waived: { quotationId: 'มาจากพารามิเตอร์ p_quote_id', createdAt: 'ค่าตั้งต้นของตาราง (บรรทัดถูกลบแล้วเขียนใหม่ทั้งชุด)' } },
  { fn: DRAFT, table: 'quotation_lines', label: 'ใบเสนอราคา → ใบสั่งขายร่าง',
    carried: (body) => new Set([...insertValues(body, 'sales_order_lines', 'FROM public.quotation_lines ql').matchAll(/\bql\."?([A-Za-z_][A-Za-z0-9_]*)"?/g)].map((m) => m[1])),
    waived: { quotationId: 'ใบสั่งขายถือ quotationLineId (ql.id) แทน', source: 'ที่มาของบรรทัดเป็นเรื่องของใบเสนอราคา',
      createdAt: 'บรรทัดใบสั่งขายเกิดใหม่', serviceRounds: 'จำนวนรอบกรอกที่ใบสั่งขาย (0326 · serviceRoundsCopyPaths)' } },
  { fn: REVISE, table: 'sales_order_lines', label: 'ใบสั่งขาย → ใบ Rev.',
    carried: (body) => new Set([...insertValues(body, 'sales_order_lines', 'FROM public.sales_order_lines line').matchAll(/\bline\."?([A-Za-z_][A-Za-z0-9_]*)"?/g)].map((m) => m[1])),
    waived: { salesOrderId: 'ใบ Rev. เป็นใบใหม่ (v_revision.id)', createdAt: 'ฟังก์ชันตั้งเอง (v_now)',
      installationPoint: 'ของใบสั่งขายย้อนหลัง — ใบย้อนหลังออก Rev. ไม่ได้ (CHECK ของ 0360/0374)',
      serviceZoneId: 'ของใบสั่งขายย้อนหลัง — ใบย้อนหลังออก Rev. ไม่ได้',
      ...Object.fromEntries(SITE_FLAGS.map((c) => [c, 'ธงจุดติดตั้งของ TS ห้ามก๊อป (siteNotFoundMigration)'])),
      serviceKind: 'ตัวยกงานบริการยกให้ (0392/P2 · soServiceSetupCopyPaths)', serviceProductId: 'ตัวยกงานบริการยกให้',
      serviceFgCode: 'ตัวยกงานบริการยกให้', servicePeriodFrom: 'ตัวยกงานบริการยกให้ (0400)', servicePeriodTo: 'ตัวยกงานบริการยกให้ (0400)' } },
]);

test('🪤 ทะเบียนคอลัมน์ของตารางบรรทัด: ทุกทางก๊อปใน SQL ตัดสินทุกคอลัมน์ (พกไป หรือ ยกเว้นด้วยชื่อ) · "packQty" ถูกพกทุกทอด ไม่อยู่ในรายการยกเว้น', () => {
  const columns = Object.fromEntries(TABLES.map((t) => [t, lineTableColumns(t)]));
  for (const table of TABLES) assert.ok(columns[table].has('packQty'));
  /* ทะเบียนนี้อ่านเนื้อ "0343 / 0363 / 0376 + แพตช์เดิม + 0407" = เนื้อที่รันอยู่ ตราบที่ยังไม่มีไฟล์ไหนนิยามสามตัวนี้ทับ
     ⇒ มีไฟล์หลังจากนี้นิยามทับเมื่อไร ทะเบียนต้องย้ายไปอ่านนิยามนั้น (ไม่งั้นมันจะตรวจเนื้อที่ไม่ได้รันแล้วและเขียวตลอด) */
  for (const name of migrationNames().filter((n) => n > FILE)) {
    for (const fn of FNS) {
      assert.equal(definitionsOf(read(name), fn).length, 0,
        `${name} นิยาม ${fn} ทับทั้งก้อน — ย้ายทะเบียนคอลัมน์ของยามนี้ (HOPS) ไปอ่านนิยามนั้น และพก "packQty" ไปด้วย (ยามข้างบน)`);
    }
  }
  const after = patched(liveBodies());
  for (const hop of HOPS) {
    const body = stripAllComments(after[hop.fn]);
    const carried = hop.carried(body);
    const waived = Object.keys(hop.waived);
    for (const col of columns[hop.table]) {
      const decided = carried.has(col) || waived.includes(col);
      assert.ok(decided, `${hop.label}: คอลัมน์ "${col}" ของ ${hop.table} ยังไม่ถูกตัดสิน — พกไปในฟังก์ชัน หรือเติมเหตุผลใน HOPS.waived`);
    }
    for (const col of waived) {
      assert.ok(columns[hop.table].has(col), `${hop.label}: รายการยกเว้นมีชื่อ "${col}" ที่ไม่ใช่คอลัมน์ของ ${hop.table}`);
      assert.ok(!carried.has(col), `${hop.label}: "${col}" ถูกพกไปแล้ว — ลบออกจากรายการยกเว้น`);
    }
    assert.ok(carried.has('packQty') && !waived.includes('packQty'), `${hop.label}: "packQty" ต้องถูกพกไป ไม่ใช่ยกเว้น`);
    /* เงินของบรรทัดเดินไปครบชุดกับตัวคูณ — ขาดตัวใดตัวหนึ่ง กฎเงินของปลายทางจะตีกลับ หรือแย่กว่านั้นคือผ่านด้วยยอดผิด */
    for (const col of ['qty', 'unitPrice', 'discountAmount', 'lineTotal']) assert.ok(carried.has(col), `${hop.label}: ต้องพก ${col} ไปกับ packQty`);
  }
  /* ตัวบันทึก (whitelist สามชั้น): รายการคอลัมน์ INSERT = ชนิดของ recordset + quotationId · ทุกคีย์ของ recordset ถูกอ่านเป็น x.<คีย์> ในรายการค่า
     ⇒ คีย์ที่อยู่ในชนิดแต่ไม่ถูก INSERT (หรือกลับกัน) = ค่าหายเงียบแบบ 0124/0244 */
  {
    const body = stripAllComments(after[SAVE]);
    const at = body.indexOf('INSERT INTO public.quotation_lines (');
    const cols = body.slice(body.indexOf('(', at) + 1, body.indexOf(')', at)).split(',').map((c) => c.trim().replace(/"/g, ''));
    const recordset = [...HOPS[0].carried(body)];
    assert.equal(recordset.length, 16, 'ชนิดของ recordset: 15 คีย์เดิม + packQty');
    assert.deepEqual([...cols].sort(), [...recordset, 'quotationId'].sort(), 'รายการคอลัมน์ INSERT ของตัวบันทึก = คีย์ของ recordset + quotationId');
    const values = insertValues(body, 'quotation_lines', 'FROM jsonb_to_recordset');
    for (const col of recordset) assert.match(values, new RegExp(`\\bx\\."?${col}"?(?![A-Za-z0-9_])`), `ตัวบันทึก: รายการค่าต้องอ่าน x.${col}`);
  }
  /* ตัวสแกนต้องเห็นคอลัมน์ครบ (ฐานจริง ณ วันเขียน: 17 + 33 · บวก packQty) — เลขนี้ขยับ = มีคอลัมน์บรรทัดใหม่: ตัดสินในทุกทอดข้างบนก่อน แล้วค่อยขยับเลข */
  assert.equal(columns.quotation_lines.size, 18, 'quotation_lines: 17 คอลัมน์เดิม + packQty');
  assert.equal(columns.sales_order_lines.size, 34, 'sales_order_lines: 33 คอลัมน์เดิม + packQty');
  /* ก่อนปะ: ทะเบียนเดียวกันต้องฟ้องว่า "packQty" ยังไม่ถูกตัดสินในทุกทอด — พิสูจน์ว่ายามนี้จับการลืมได้จริง */
  const before = liveBodies();
  for (const hop of HOPS) assert.ok(!hop.carried(stripAllComments(before[hop.fn])).has('packQty'), `${hop.label}: เนื้อก่อน 0407 ต้องยังไม่พก packQty`);
  /* ปลายทางของสองทอดหลังคือ sales_order_lines: ทุกคอลัมน์ที่ INSERT ต้องเป็นคอลัมน์จริงของตาราง */
  for (const fn of [DRAFT, REVISE]) {
    const text = stripAllComments(after[fn]);
    const at = text.indexOf('INSERT INTO public.sales_order_lines (');
    const cols = text.slice(text.indexOf('(', at) + 1, text.indexOf(')', at)).split(',').map((c) => c.trim().replace(/"/g, ''));
    for (const col of cols) assert.ok(columns.sales_order_lines.has(col), `${fn}: INSERT ลงคอลัมน์ "${col}" ที่ไม่มีในทะเบียน`);
    assert.equal(new Set(cols).size, cols.length);
  }
});

test('ด่านก่อนรัน + ลายนิ้วมือ: สามฟังก์ชันตัวละหนึ่ง · ตัวออก Rev. มีแพตช์ 0382/0385/0392 ครบ · ฟังก์ชันอื่นทุกตัวใน public ถูกจดทั้งเนื้อและสิทธิ์ · ตรวจท้ายเทียบด้วยนิพจน์เดียวกัน', () => {
  const pre = stripLineComments(doBlock('pre'));
  const verify = stripLineComments(doBlock('verify'));
  const fnsLine = `v_fns constant text[] := ARRAY['${SAVE}', '${DRAFT}', '${REVISE}'];`;
  assert.ok(pre.includes(fnsLine) && verify.includes(fnsLine), 'รายชื่อสามฟังก์ชันเดียวกันทั้งด่านก่อนรันและตรวจท้าย');
  order(pre, [
    "WHERE n.nspname = 'public' AND p.proname = ANY (v_fns);\n  IF v_n <> 3 THEN\n    RAISE EXCEPTION 'mig_0407_needs_functions",
    `p.proname = '${REVISE}'`,
    "strpos(p.prosrc, 'public.is_sales_manager_role(p_actor_role)') > 0",
    `strpos(p.prosrc, 'd."ownerId" = p_actor_id') > 0`,
    "strpos(p.prosrc, 'sales_order_copy_service_setup(') > 0) THEN\n    RAISE EXCEPTION 'mig_0407_needs_chain",
    "PERFORM set_config('mig_0407.others'",
    "PERFORM set_config('mig_0407.meta'",
  ], 'ด่านก่อนรัน');
  /* ฟังก์ชันอื่นทุกตัว: ลายเซ็น · md5 ของเนื้อ · volatility · SECURITY · proconfig (search_path) · สิทธิ์ — นิพจน์เดียวกันสองที่ */
  const others = `SELECT md5(COALESCE(string_agg(
             p.oid::regprocedure::text || '|' || md5(p.prosrc) || '|' || p.provolatile::text || '|' || p.prosecdef::text
               || '|' || COALESCE(p.proconfig::text, '') || '|' || COALESCE(p.proacl::text, ''),
             E'\\n' ORDER BY p.oid::regprocedure::text), ''))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND NOT (p.proname = ANY (v_fns))`;
  assert.ok(flat(pre).includes(flat(others)), 'ด่านก่อนรันต้องจดฟังก์ชันอื่นทุกตัวใน public');
  assert.ok(flat(verify).includes(flat(others)), 'ตรวจท้ายต้องคิดลายนิ้วมือด้วยนิพจน์เดียวกันทุกตัวอักษร');
  assert.match(flat(verify), /IF v_others IS NULL OR v_others IS DISTINCT FROM \( SELECT md5\(/);
  assert.match(verify, /RAISE EXCEPTION 'mig_0407_verify others';/);
  /* สามตัวที่ปะ: ทุกอย่างยกเว้นเนื้อ — ลายเซ็น · ชนิดที่คืน · ภาษา · เจ้าของ · volatility · SECURITY · proretset · proconfig · สิทธิ์ */
  const meta = `md5(
             p.oid::regprocedure::text || '|' || p.prorettype::regtype::text || '|' || p.prolang::text || '|' || p.proowner::text
               || '|' || p.provolatile::text || '|' || p.prosecdef::text || '|' || p.proretset::text
               || '|' || COALESCE(p.proconfig::text, '') || '|' || COALESCE(p.proacl::text, ''))`;
  assert.ok(flat(pre).includes(flat(meta)) && flat(verify).includes(flat(meta)), 'ลายนิ้วมือ "ทุกอย่างยกเว้นเนื้อ" ของสามตัวต้องเป็นนิพจน์เดียวกันสองที่');
  assert.match(verify, /IF v_meta IS NULL OR \(SELECT count\(\*\) FROM jsonb_object_keys\(v_meta\)\) <> 3 THEN\s+RAISE EXCEPTION 'mig_0407_verify meta';/);
  assert.match(verify, /WHERE now_fn\.h IS DISTINCT FROM b\.h;\s+IF v_n > 0 THEN RAISE EXCEPTION 'mig_0407_verify meta changed=%', v_n; END IF;/);
});

test('ตรวจท้าย: ป้ายเจ็ดตัวครั้งเดียว · "packQty" 3/2/2 · แพตช์เดิมยังอยู่ · สิทธิ์สามลายเซ็น · คอลัมน์ 2 · CHECK 4 ตัว validated · กฎเงินสองตารางเป็นข้อความเดียวกัน · รหัสครบ', () => {
  const verify = stripLineComments(doBlock('verify'));
  const needles = [...verify.matchAll(/\('([a-z_]+)', '((?:[^']|'')*)', (\d)\)/g)].map((m) => `${m[1]}|${m[2].replace(/''/g, "'")}|${m[3]}`);
  assert.deepEqual(needles, [
    `${SAVE}|/* 0407/Q1 */|1`, `${SAVE}|/* 0407/Q2 */|1`, `${SAVE}|/* 0407/Q3 */|1`, `${SAVE}|"packQty"|3`,
    `${SAVE}|x."packQty"|1`, `${SAVE}|"packQty" integer|1`, `${SAVE}|DELETE FROM public.quotation_lines WHERE "quotationId" = p_quote_id;|1`,
    `${DRAFT}|/* 0407/D1 */|1`, `${DRAFT}|/* 0407/D2 */|1`, `${DRAFT}|"packQty"|2`, `${DRAFT}|ql."packQty"|1`,
    `${REVISE}|/* 0407/R1 */|1`, `${REVISE}|/* 0407/R2 */|1`, `${REVISE}|"packQty"|2`, `${REVISE}|line."packQty"|1`,
    `${REVISE}|public.is_sales_manager_role(p_actor_role)|1`, `${REVISE}|d."ownerId" = p_actor_id|1`,
    `${REVISE}|sales_order_copy_service_setup(|1`, `${REVISE}|"movedFrom" = "movedFrom" || jsonb_build_array(|1`,
  ]);
  for (const fn of FNS) assert.ok(needles.includes(`${fn}|"packQty"|${PACK_HITS[fn]}`));
  assert.match(verify, /v_n := \(length\(v_src\) - length\(replace\(v_src, r\.needle, ''\)\)\) \/ length\(r\.needle\);\s+IF v_n IS DISTINCT FROM r\.expected THEN\s+RAISE EXCEPTION 'mig_0407_verify marker % in % = % \(คาด %\)', r\.needle, r\.fn, v_n, r\.expected;/);
  /* สิทธิ์: anon/authenticated ไม่มี · service_role เรียกได้ — ลายเซ็นเต็มสามตัว */
  for (const sig of SIGNATURES) assert.equal(occurrences(verify, `'${sig}'`), 1, `ตรวจท้ายต้องตรวจสิทธิ์ของ ${sig}`);
  assert.match(flat(verify), /IF has_function_privilege\('anon', v_fn, 'EXECUTE'\) OR has_function_privilege\('authenticated', v_fn, 'EXECUTE'\) OR NOT has_function_privilege\('service_role', v_fn, 'EXECUTE'\) THEN RAISE EXCEPTION 'mig_0407_verify grant %', v_fn;/);
  assert.match(verify, /column_name = 'packQty'\s+AND data_type = 'integer' AND is_nullable = 'YES' AND column_default IS NULL;\s+IF v_n <> 2 THEN RAISE EXCEPTION 'mig_0407_verify columns=%', v_n; END IF;/);
  assert.match(verify, /WHERE c\.contype = 'c' AND c\.convalidated/);
  for (const table of TABLES) {
    for (const suffix of ['pack_qty_range', 'line_money_rule']) assert.ok(verify.includes(`('public.${table}'::regclass, '${table}_${suffix}')`), `ตรวจท้ายต้องนับ ${table}_${suffix}`);
  }
  assert.match(verify, /IF v_n <> 4 THEN RAISE EXCEPTION 'mig_0407_verify constraints=%', v_n; END IF;/);
  assert.match(verify, /RAISE EXCEPTION 'mig_0407_verify money rule differs';/);
  assert.ok(doBlock('verify').includes(`$u$${UNDO_ARE}$u$`), 'ตรวจท้ายพิมพ์ md5 ของเนื้อเดิม (ถอดป้ายด้วย regex ตัวเดียวกับหัวไฟล์)');
  /* รหัสของบล็อก DO ทั้งห้า — เป็นของคนรัน migration ล้วน (ตัด $re$/$rp$/$u$ ออกก่อน) */
  const doCode = ['pre', 'precheck', 'fixture', 'patch', 'verify'].map((tag) => stripLineComments(doBlock(tag))).join('\n').replace(/\$(re|rp|u)\$[\s\S]*?\$\1\$/g, '');
  const codes = [...doCode.matchAll(/RAISE EXCEPTION '([a-z_0-9]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(codes)].sort(), ['mig_0407_fixture', 'mig_0407_line_money_violations', 'mig_0407_needs_chain', 'mig_0407_needs_functions',
    'mig_0407_patch_anchor', 'mig_0407_patch_overload', 'mig_0407_verify']);
  assert.equal(codes.length, 14, 'needs ×2 · violations ×1 · fixture ×1 · patch ×2 (overload · anchor) · verify ×8');
  assert.equal(codes.filter((c) => c === 'mig_0407_verify').length, 8,
    'ตรวจท้าย 8 จุด: others · meta · meta changed · marker · grant · columns · constraints · money rule differs');
});

test('หัวไฟล์ — SELECT ตรวจก่อนรัน: อ่านอย่างเดียว · anchor ตัวเดียวกับแถวปะตามตัวอักษร · กฎเงินแบบ to_jsonb (รันได้ทั้งก่อนและหลังมีคอลัมน์) · สิทธิ์ผ่าน oid', () => {
  assert.deepEqual(aliases(PREFLIGHT), ['fns', 'chain', 'anchors', 'marks', 'bodies', 'cols', 'bad_qt', 'bad_so', 'rows_qt', 'rows_so', 'anon', 'svc', 'packed']);
  /* ตัดสตริงออกก่อน ('EXECUTE' ของ has_function_privilege · anchor) แล้วต้องเหลือแต่การอ่าน · แต่ละก้อนเป็นคำสั่งเดียว */
  for (const sql of [PREFLIGHT, VERIFY]) {
    const bare = sql.replace(/\$re\$[\s\S]*?\$re\$/g, '').replace(/'(?:[^']|'')*'/g, "''");
    assert.doesNotMatch(bare, /\b(UPDATE|INSERT|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE|TRUNCATE|EXECUTE|PERFORM|DO|SET|CALL|COPY|LOCK)\b/, 'SELECT ของหัวไฟล์ต้องอ่านอย่างเดียว');
    assert.equal(occurrences(bare, ';'), 1, 'หนึ่งก้อน = หนึ่งคำสั่ง SELECT');
    assert.match(bare.trim(), /^SELECT\b/);
  }
  /* anchor: แถวของหัวไฟล์ = แถวปะ ทุกตัวอักษร (เจ้าของเห็นผลเดียวกับที่ §4 ของไฟล์จะเห็น) */
  const headerRows = [...PREFLIGHT.matchAll(/\('([a-z_]+)', '([QDR][1-3])', \$re\$([\s\S]*?)\$re\$\)/g)].map((m) => `${m[1]}|0407/${m[2]}|${m[3]}`);
  assert.deepEqual(headerRows, ROWS.map((r) => `${r.fn}|${r.marker}|${r.anchor}`), 'anchor ใน SELECT ตรวจก่อนรันต้องเท่า anchor ของแถวปะตามตัวอักษร');
  assert.ok(PREFLIGHT.includes("(SELECT count(*) FROM regexp_matches(p.prosrc, a.anchor, 'g'))"), 'นับ anchor ใน prosrc แบบเดียวกับ §4');
  assert.ok(flat(PREFLIGHT).includes("(SELECT string_agg(a.marker || '=' || (SELECT count(*) FROM regexp_matches(p.prosrc, a.anchor, 'g')), ' ' ORDER BY a.marker) FROM (VALUES"));
  assert.ok(flat(PREFLIGHT).includes(") AS a(fn, marker, anchor) JOIN pg_proc p ON p.proname = a.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public') AS anchors"));
  for (const expr of [
    `(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND ${IN_THREE}) AS fns`,
    CHAIN_EXPR, MARKS_EXPR,
    `(SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('quotation_lines', 'sales_order_lines') AND column_name = 'packQty') AS cols`,
    '(SELECT count(*) FROM public.quotation_lines) AS rows_qt', '(SELECT count(*) FROM public.sales_order_lines) AS rows_so',
    `(SELECT count(*) FROM public.quotation_lines l WHERE to_jsonb(l)->>'packQty' IS NOT NULL) + (SELECT count(*) FROM public.sales_order_lines l WHERE to_jsonb(l)->>'packQty' IS NOT NULL) AS packed;`,
    `WHERE n.nspname = 'public' AND ${IN_THREE}) AS anon`, `WHERE n.nspname = 'public' AND ${IN_THREE}) AS svc`,
  ]) assert.ok(flat(PREFLIGHT).includes(expr), `SELECT ตรวจก่อนรัน: ${expr}`);
  /* กฎเงิน: นิพจน์เดียวกับ CHECK เปลี่ยนแค่ที่มาของ "packQty" (to_jsonb — ไม่พังเมื่อยังไม่มีคอลัมน์) และคำนำหน้า l. */
  const jsonForm = CANON.replace('"lineTotal"', 'l."lineTotal"').replace('COALESCE("packQty", 1) * qty * "unitPrice"',
    `COALESCE((to_jsonb(l)->>'packQty')::integer, 1) * l.qty * l."unitPrice"`).replace('COALESCE("discountAmount", 0)', 'COALESCE(l."discountAmount", 0)');
  assert.ok(jsonForm.includes(`COALESCE((to_jsonb(l)->>'packQty')::integer, 1) * l.qty * l."unitPrice"`));
  for (const [table, alias] of [['quotation_lines', 'bad_qt'], ['sales_order_lines', 'bad_so']]) {
    assert.ok(flat(PREFLIGHT).includes(flat(`(SELECT count(*) FROM public.${table} l WHERE NOT (${jsonForm})) AS ${alias}`)), `${alias}: นับแถวผิดกฎด้วยนิพจน์ของ CHECK`);
  }
  assert.equal(occurrences(PREFLIGHT, `COALESCE((to_jsonb(l)->>'packQty')::integer, 1) * l.qty * l."unitPrice"`), 2);
  assert.doesNotMatch(PREFLIGHT, /l\."packQty"|WHERE "packQty"/, 'SELECT ตรวจก่อนรันต้องไม่เอ่ยคอลัมน์ตรง ๆ (ก่อนรันยังไม่มี)');
  /* สิทธิ์: ผ่าน p.oid — ไม่ใช้ลายเซ็นในสตริง (ฟังก์ชันหายตัวหนึ่ง SELECT ต้องยังตอบหนึ่งแถว ไม่ใช่ error) */
  assert.ok(flat(PREFLIGHT).includes("(SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))"));
  assert.ok(flat(PREFLIGHT).includes("(SELECT bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))"));
  for (const sig of SIGNATURES) assert.ok(!PREFLIGHT.includes(sig), 'SELECT ตรวจก่อนรันต้องไม่มีลายเซ็นในสตริง');
  /* bodies: md5 ของเนื้อหลังถอดป้าย + ตัดช่องว่าง เทียบสามค่า เรียงตาม ตัวบันทึก QT · ตัวสร้าง SO ร่าง · ตัวออก Rev. */
  assert.ok(PREFLIGHT.includes(`$re$${UNDO_ARE}$re$, '', 'g'), '[ \\t\\n\\r]', '', 'g')) = e.h)::text::char(1), '' ORDER BY e.ord)`));
  assert.ok(flat(PREFLIGHT).includes(flat(`FROM (VALUES (1, '${SAVE}', '${LIVE_MD5[SAVE]}'), (2, '${DRAFT}', '${LIVE_MD5[DRAFT]}'), (3, '${REVISE}', '${LIVE_MD5[REVISE]}')) AS e(ord, fn, h)`)));
  assert.ok(PREFLIGHT.includes('$re$/\\* 0407/[QDR][1-3] \\*/$re$'), 'marks นับป้ายของไฟล์นี้');
  /* ค่าที่คาด + เงื่อนไข "อย่ารัน" */
  assert.match(HEADER, /คาด \(ก่อนรัน\): fns = 3 · chain = 1 · anchors = D1=1 D2=1 Q1=1 Q2=1 Q3=1 R1=1 R2=1 · marks = 0 · bodies = ttt · cols = 0/);
  assert.match(HEADER, /· bad_qt = 0 · bad_so = 0 · rows_qt ≥ 1202 · rows_so ≥ 445 [^\n]* · packed = 0/);
  assert.match(HEADER, /· anon = f · svc = t \(สิทธิ์ของสามฟังก์ชัน — เท่ากันทั้งก่อนและหลังรัน\)/);
  order(HEADER, ['⛔ อย่ารัน แล้วแจ้งผู้พัฒนา เมื่อ: fns ≠ 3 · chain ≠ 1 · anchors มีตัวไหนไม่ใช่ 1 ขณะ marks = 0 · bad_qt/bad_so ≠ 0',
    'anon ไม่ใช่ f หรือ svc ไม่ใช่ t', 'mig_0407_verify grant', 'bodies ไม่ใช่ ttt', 'ยกเว้น bodies ซึ่งไฟล์แค่พิมพ์ NOTICE'], 'เงื่อนไขอย่ารัน');
});

test('หัวไฟล์ — SELECT ตรวจหลังรัน + ค่าที่คาด · ลำดับ deploy (รันก่อน merge · ขั้น 4 ผ่านตัวโหลด) · บล็อกถอยกลับมีด่านในตัว · ห้ามรัน 0343 · 0363 · 0376 ซ้ำ · รหัสด่านห้าตัว', () => {
  assert.deepEqual(aliases(VERIFY), ['cols', 'range', 'money', 'valid', 'marks', 'packs', 'chain', 'anon', 'svc', 'packed']);
  assert.match(HEADER, /คาด: cols = 2 · range = 2 · money = 2 · valid = 4 · marks = 7 · packs = 3\/2\/2 · chain = 1 · anon = f · svc = t · packed = 0/);
  assert.match(HEADER, /SELECT ตรวจก่อนรันข้างบนต้องได้ anchors เป็น 0 ทุกตัว · marks = 7 · bodies = ttt · anon = f · svc = t/);
  for (const expr of [
    `column_name = 'packQty' AND data_type = 'integer' AND is_nullable = 'YES' AND column_default IS NULL) AS cols`,
    `conname IN ('quotation_lines_pack_qty_range', 'sales_order_lines_pack_qty_range')) AS range`,
    `conname IN ('quotation_lines_line_money_rule', 'sales_order_lines_line_money_rule')) AS money`,
    `WHERE contype = 'c' AND convalidated AND conname IN ('quotation_lines_pack_qty_range', 'sales_order_lines_pack_qty_range', 'quotation_lines_line_money_rule', 'sales_order_lines_line_money_rule')) AS valid`,
    `(length(p.prosrc) - length(replace(p.prosrc, '"packQty"', ''))) / length('"packQty"'))::text, '/' ORDER BY e.ord)`,
    `FROM (VALUES (1, '${SAVE}'), (2, '${DRAFT}'), (3, '${REVISE}')) AS e(ord, fn)`,
    `(SELECT count(*) FROM public.quotation_lines WHERE "packQty" IS NOT NULL) + (SELECT count(*) FROM public.sales_order_lines WHERE "packQty" IS NOT NULL) AS packed;`,
    MARKS_EXPR, CHAIN_EXPR,
    `JOIN pg_proc p ON p.proname = e.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public') AS packs`,
  ]) assert.ok(flat(VERIFY).includes(expr), `SELECT ตรวจหลังรัน: ${expr}`);
  /* สิทธิ์ในตรวจหลังรัน: anon = OR ของหกคู่ (anon/authenticated × สามลายเซ็น) · svc = AND ของสามลายเซ็น */
  assert.equal(occurrences(VERIFY, "has_function_privilege('anon', "), 3);
  assert.equal(occurrences(VERIFY, "has_function_privilege('authenticated', "), 3);
  assert.equal(occurrences(VERIFY, "has_function_privilege('service_role', "), 3);
  assert.equal(occurrences(flat(VERIFY), "'EXECUTE') OR has_function_privilege("), 5);
  assert.equal(occurrences(flat(VERIFY), "'EXECUTE') AND has_function_privilege("), 2);
  for (const sig of SIGNATURES) {
    for (const role of ['anon', 'authenticated', 'service_role']) assert.ok(VERIFY.includes(`has_function_privilege('${role}', '${sig}', 'EXECUTE')`), `ตรวจหลังรัน: สิทธิ์ของ ${role} บน ${sig}`);
  }
  /* ลำดับ deploy */
  order(HEADER, ['── ตรวจก่อนรัน', '── ลำดับ deploy', 'ฮาร์เนส PGlite harness-0407 ผ่านสองรอบผลเหมือนกัน', 'ตรวจเลข migration อีกครั้ง',
    'รันไฟล์นี้ที่ SQL Editor **ก่อน** merge', 'ไม่ต้อง freeze', 'CI rerun (check:columns เขียวแล้ว) → merge → Deploy to production',
    'node --import ./scripts/test-loader.mjs scripts/check-line-pack-parity.mjs', '── ตรวจหลังรัน', '── ถอยกลับ'], 'หัวไฟล์');
  assert.match(HEADER, /quotation_lines\."packQty" · sales_order_lines\."packQty"/, 'หัวไฟล์บอกคอลัมน์ใหม่ที่ check:columns จะแดงจนกว่าจะรัน');
  /* ถอยกลับ: ด่าน "มีเลขแพ็คแล้วห้ามถอย" → ถอดแพตช์ (นับ 3/2/2) → ลบ CHECK + คอลัมน์ */
  order(HEADER, ['ถอยได้เฉพาะตอนที่ **ยังไม่มีแถวไหนมีเลขแพ็ค**', 'ถอยโค้ดก่อนเสมอ', 'DO $undo$',
    `IF (SELECT count(*) FROM public.quotation_lines WHERE "packQty" IS NOT NULL)`,
    "RAISE EXCEPTION 'undo_0407 มีบรรทัดที่มีเลขแพ็คแล้ว — ห้ามถอย';",
    `(VALUES ('${SAVE}', 3), ('${DRAFT}', 2),`, `('${REVISE}', 2)) AS t(fn, n)`,
    "IF v_hits <> r.n THEN RAISE EXCEPTION 'undo_0407 % hits=% (คาด %)', r.proname, v_hits, r.n; END IF;",
    'END $undo$;',
    'ALTER TABLE public.quotation_lines DROP CONSTRAINT quotation_lines_line_money_rule,',
    'DROP CONSTRAINT quotation_lines_pack_qty_range, DROP COLUMN "packQty";',
    'ALTER TABLE public.sales_order_lines DROP CONSTRAINT sales_order_lines_line_money_rule,',
    'DROP CONSTRAINT sales_order_lines_pack_qty_range, DROP COLUMN "packQty";',
    "NOTIFY pgrst, 'reload schema';"], 'บล็อกถอยกลับ');
  assert.equal(occurrences(HEADER, `$u$${UNDO_ARE}$u$`), 2, 'บล็อกถอยกลับนับ hits และ regexp_replace ด้วย regex ตัวเดียวกัน');
  assert.equal(occurrences(RAW, UNDO_ARE), 4, 'regex ถอดแพตช์ตัวเดียวกันสี่ที่: ตรวจก่อนรัน ×1 · ถอยกลับ ×2 · ตรวจท้าย ×1');
  assert.match(HEADER, /ห้ามรัน 0343 · 0363 · 0376 ซ้ำหลังไฟล์นี้/);
  for (const code of ['mig_0407_needs_functions', 'mig_0407_needs_chain', 'mig_0407_line_money_violations', 'mig_0407_fixture', 'mig_0407_patch_anchor']) {
    assert.match(HEADER, new RegExp(`--   ${code}\\s`), `หัวไฟล์ต้องอธิบายรหัส ${code}`);
    assert.ok(BODY.includes(`RAISE EXCEPTION '${code}`), `ตัวไฟล์ต้อง RAISE ${code}`);
  }
  assert.match(HEADER, /⚠️ DDL — เจ้าของรันมือบน Supabase SQL Editor/);
  assert.match(HEADER, /✅ รันซ้ำได้/);
});

/* ── "ห้ามรัน 0343 · 0363 · 0376 ซ้ำ" + ทางกลับ ────────────────────────────────────────────────────────────────────────
   🐞 รีวิว 08/10 (sql-2): หัวไฟล์รุ่นแรกบอกว่ามีแต่ 0376 ที่ล้างแพตช์ และทางกลับคือ "ไฟล์นั้น → 0382 → 0385 → 0392 → ไฟล์นี้"
      ของจริง: 0343 นิยามทั้งสามตัว · 0363 นิยามตัวสร้างใบสั่งขายร่าง **และ** ตัวออก Rev. ⇒ เดินตามทางนั้นหลังรัน 0343/0363 พลาด
      จบที่ 0407 ปฏิเสธ (ฟังก์ชันยังเป็นรุ่นเก่า) · และ 0382 ทั้งไฟล์เขียนตัวกลางตำแหน่งกลับเป็น 'cco' — ไม่ตาม 0383 = เงียบ
   ⭐ ยามนี้คิด "ใครนิยามอะไร" และ "ไฟล์ไหนต้องอยู่ในทางกลับ" **จากโฟลเดอร์ migration** แล้วเทียบกับที่หัวไฟล์เขียน — ไม่ใช่เทียบคำกับคำ
      (พฤติกรรมจริงของทั้งลำดับ: ฮาร์เนส R-7 … R-11 รันทั้งไฟล์บนฐานที่มีเอกสาร) */
const quotedMention = (sql, fn) => stripAllComments(sql).includes(`'${fn}'`);
const definedFns = (sql) => [...new Set([...stripAllComments(sql).matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z_0-9]+)\s*\(/gi)].map((m) => m[1]))];
const headerWalk = () => {
  const m = /^--\s+(0343(?: → \d{4})+) → ไฟล์นี้ \(ป้ายหาย = ไฟล์นี้ปะใหม่ให้เอง\)$/m.exec(HEADER);
  assert.ok(m, 'หัวไฟล์ต้องเขียนลำดับทางกลับเป็นบรรทัดเดียว "0343 → … → ไฟล์นี้"');
  return m[1].split(' → ');
};

test('หัวไฟล์ — ห้ามรัน 0343 · 0363 · 0376 ซ้ำ: "ใครนิยามตัวไหน" ตรงกับไฟล์จริง · ผลของการรันซ้ำ · ด่านที่จะดัง', () => {
  const before = migrationNames().filter((n) => n < FILE);
  const fileOf = (number) => before.find((n) => n.startsWith(`${number}_`));
  const defines = (number) => FNS.filter((fn) => definesFn(read(fileOf(number)), fn));
  assert.deepEqual(defines('0343'), [SAVE, DRAFT, REVISE], '0343 นิยามทั้งสามตัว');
  assert.deepEqual(defines('0363'), [DRAFT, REVISE], '0363 นิยามตัวสร้างใบสั่งขายร่าง + ตัวออก Rev.');
  assert.deepEqual(defines('0376'), [REVISE], '0376 นิยามตัวออก Rev.');
  assert.match(HEADER, /0343 = ทั้งสามตัว · 0363 = ตัวสร้างใบสั่งขายร่าง \+ ตัวออก Rev\. · 0376 = ตัวออก Rev\./);
  /* สามไฟล์นั้นคือเจ้าของนิยามล่าสุดของแต่ละตัว และไม่มีไฟล์หลัง 0376 (ก่อน 0407) นิยามตัวไหนทับอีก */
  for (const fn of FNS) {
    assert.equal(before.filter((n) => definesFn(read(n), fn)).pop(), LAST_DEFINER[fn], `เจ้าของนิยามล่าสุดของ ${fn}`);
  }
  /* สิ่งที่หาย — เนื้อของ 0343/0363 ไม่มีของที่มาทีหลังจริง (อ่านจากไฟล์ ไม่ใช่เชื่อคำ) */
  const body0343 = { draft: repoBody(fileOf('0343'), DRAFT), revise: repoBody(fileOf('0343'), REVISE) };
  const body0363 = { draft: repoBody(fileOf('0363'), DRAFT), revise: repoBody(fileOf('0363'), REVISE) };
  const body0376 = repoBody(fileOf('0376'), REVISE);
  const MOVE = '"movedFrom" = "movedFrom" || jsonb_build_array(';
  assert.ok(!body0343.draft.includes('"deliveryDueDate"') && body0363.draft.includes('"deliveryDueDate"'), '0343 ทำให้ตัวสร้างใบสั่งขายร่างเสีย deliveryDueDate ของ 0363');
  assert.ok(!body0343.revise.includes(MOVE) && !body0363.revise.includes(MOVE) && body0376.includes(MOVE), 'การย้ายงวดมาจาก 0376 — เนื้อของ 0343/0363 ไม่มี');
  for (const [name, body] of [['0343', body0343.revise], ['0363', body0363.revise], ['0376', body0376]]) {
    for (const lost of ['public.is_sales_manager_role(p_actor_role)', 'd."ownerId" = p_actor_id', 'sales_order_copy_service_setup(', '"packQty"']) {
      assert.ok(!body.includes(lost), `เนื้อของตัวออก Rev. ใน ${name} ไม่มี ${lost} — รันซ้ำ = หาย`);
    }
  }
  order(HEADER, ['ห้ามรัน 0343 · 0363 · 0376 ซ้ำหลังไฟล์นี้', 'เขียนฟังก์ชันทับ **ทั้งก้อน** จากเนื้อเก่า โดยไม่มี error',
    '"packQty" หายจากทางก๊อปของทุกตัวที่ถูกเขียนทับ', 'การย้ายงวดของ 0376 · แพตช์ 0382 · 0385 ·',
    '0343 ยังทำให้ตัวสร้างใบสั่งขายร่างเสีย deliveryDueDate ของ 0363',
    'หยุดเองด้วย mig_0407_needs_chain ไม่เขียนอะไร', 'พลาดไปแล้ว = แจ้งผู้พัฒนา', 'ครบในคราวเดียว',
    'ข้าม 0376 ไม่ได้', 'mig_0407_verify marker "movedFrom"', 'ข้าม 0383 ไม่ได้ และ **ไม่มีด่านไหนฟ้อง**', "กลับเป็น 'cco'",
    '0394 → 0396 → 0400 → 0404 ต้องตาม 0392', 'พิสูจน์บนฮาร์เนส R-7 … R-11', 'ไฟล์เก่ากว่า 0343 ที่นิยามสามตัวนี้ก็ห้ามเช่นกัน'], 'ห้ามรันซ้ำ');
  assert.match(HEADER, /การย้ายงวดของ 0376 · แพตช์ 0382 · 0385 ·\n--\s+0392\/P2\)/, 'ตัวออก Rev. เสียแพตช์ครบสามไฟล์');
  /* ด่านที่หัวไฟล์อ้างมีอยู่จริงในตัวไฟล์ */
  assert.ok(BODY.includes("RAISE EXCEPTION 'mig_0407_needs_chain"));
  assert.ok(BODY.includes("RAISE EXCEPTION 'mig_0407_verify marker % in % = % (คาด %)'"));
  assert.ok(doBlock('verify').includes(`('${REVISE}', '${MOVE}', 1)`), 'ตรวจท้ายต้องนับการย้ายงวดของ 0376 ในตัวออก Rev.');
  /* รุ่นแรกของหัวไฟล์ (ทางกลับสั้นที่ใช้ไม่ได้) ต้องไม่กลับมา */
  assert.doesNotMatch(HEADER, /แพตช์ของมัน \(0382 → 0385 → 0392\)/);
});

test('🔴 หัวไฟล์ — ลำดับทางกลับครบตามที่โฟลเดอร์ migration บอก: ทุกฟังก์ชันที่ไฟล์ในลำดับนิยาม ต้องมีเจ้าของนิยามล่าสุด + ทุกไฟล์ที่เอ่ยชื่อมันหลังจากนั้น อยู่ในลำดับ', () => {
  const before = migrationNames().filter((n) => n < FILE);
  const walk = headerWalk();
  assert.deepEqual(walk, ['0343', '0363', '0376', '0382', '0383', '0385', '0392', '0394', '0396', '0400', '0404'],
    'ลำดับที่ฮาร์เนส R-7 … R-11 พิสูจน์ — เปลี่ยนลำดับ = รันฮาร์เนสใหม่');
  assert.deepEqual([...walk].sort(), walk, 'เรียงจากเลขน้อยไปมาก');
  const files = walk.map((number) => {
    const file = before.find((n) => n.startsWith(`${number}_`));
    assert.ok(file, `ไม่มีไฟล์ ${number} ในโฟลเดอร์`);
    return file;
  });
  const missing = [];
  let checked = 0;
  for (const file of files) {
    for (const fn of definedFns(read(file))) {
      checked += 1;
      /* (ก) นิยามสุดท้ายของมันต้องถูกรันในลำดับ — ไม่งั้นจบลำดับแล้วฟังก์ชันค้างเป็นรุ่นกลางทาง (กรณี 0382 → ต้องมี 0383) */
      const last = before.filter((n) => definesFn(read(n), fn)).pop();
      if (!files.includes(last)) missing.push(`${fn}: นิยามล่าสุดอยู่ที่ ${last} ซึ่งไม่อยู่ในลำดับ (ไฟล์ ${file.slice(0, 4)} เขียนมันทับ)`);
      /* (ข) ทุกไฟล์หลังนิยามสุดท้ายที่เอ่ยชื่อมันในสตริง (= แถวปะ / รายการที่ไฟล์นั้นตรวจ) ต้องถูกรันตามด้วย */
      for (const later of before.filter((n) => n > last && quotedMention(read(n), fn))) {
        if (!files.includes(later)) missing.push(`${fn}: ${later} เอ่ยชื่อมันหลัง ${last} แต่ไม่อยู่ในลำดับ`);
      }
    }
  }
  assert.ok(checked >= 20, `อ่านฟังก์ชันที่ไฟล์ในลำดับนิยามได้แค่ ${checked} ตัว — ตัวอ่านน่าจะพัง`);
  assert.deepEqual(missing, [], 'ลำดับทางกลับในหัวไฟล์ขาดไฟล์');
  /* ตัวตรวจจับของจริง: ลำดับรุ่นแรกของหัวไฟล์ (ไม่มี 0383) และลำดับของรีวิว (ไม่มี 0383 เช่นกัน) ต้องถูกฟ้อง */
  const lacks = (numbers) => {
    const set = numbers.map((number) => before.find((n) => n.startsWith(`${number}_`)));
    return set.some((file) => definedFns(read(file)).some((fn) => !set.includes(before.filter((n) => definesFn(read(n), fn)).pop())));
  };
  assert.equal(lacks(['0343', '0363', '0376', '0382', '0385', '0392', '0394', '0396', '0400', '0404']), true, 'ลำดับที่ไม่มี 0383 ต้องถูกจับ');
  assert.equal(lacks(['0376', '0382', '0383', '0385', '0392']), true, 'ลำดับที่ไม่มี 0400 (เจ้าของนิยามล่าสุดของสามตัวที่ 0392 เขียน) ต้องถูกจับ');
  assert.equal(lacks(walk), false);
});

/* 🔒 ตัวหนังสือของไฟล์ = ไบต์ที่ฮาร์เนสพิสูจน์ (planner-probe-0407 36/36 · critic-probe-0407 6/6 · harness-0407 · mutate-0407)
     · แก้ไฟล์ (แม้คอมเมนต์ — หัวไฟล์คือ SELECT/บล็อกถอยที่เจ้าของถือไว้ใช้) = รันสามตัวนั้นใหม่บนไบต์ใหม่ แล้วย้ายหมุดในคอมมิตเดียวกัน
     · หลังเจ้าของรันไฟล์บนฐานจริงแล้ว **ห้ามแก้อีก**: แถวปะที่มีป้ายแล้วถูกข้าม ⇒ ข้อความใหม่ไม่มีวันถึงฐาน · SQL ที่ต้องเปลี่ยน = migration ใหม่
       (และพก "packQty" ถ้าเขียนสามฟังก์ชันนี้ทับ — ยามข้างบน)
     · ไฟล์ตัวอย่างถูกหมุดแบบเดียวกัน: VALUES ของ §3 ในไฟล์ SQL คือสำเนาของมัน และฝั่ง JS คิดเงินเทียบกับไฟล์เดียวกัน */
test('🔒 sha256: ไฟล์ migration และไฟล์ตัวอย่างต้องเท่าฉบับที่ฮาร์เนสพิสูจน์ทุกไบต์', () => {
  assert.equal(sha256(readFileSync(new URL(FILE, MIGRATIONS))), '835c4625867fdf5698e41965409cc8e6ef749d2a28cb2dbc621982a13f67b509',
    'แก้ 0407_quotation_line_pack_qty.sql = รัน planner-probe-0407 · critic-probe-0407 · harness-0407 · mutate-0407 ใหม่บนไบต์ใหม่ แล้วย้ายหมุดนี้ในคอมมิตเดียวกัน');
  assert.equal(sha256(readFileSync(FIXTURES_URL)), '1892237e48a846aeb87bf8492ea404dc66264c88667d699584deabc27825b4d4',
    'แก้ quoteLinePackFixtures.json = แก้ VALUES ของ §3 ในไฟล์ SQL ให้ตรงกัน (และรันฮาร์เนสใหม่) แล้วย้ายหมุดนี้');
});
