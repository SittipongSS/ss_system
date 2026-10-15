// ── ยามตัวหนังสือของ mig 0410 (ใบเสนอราคา: ยามในฐานของ "แพ็ค/เดือน" · งวด PR-G ของช่องแพ็ค/เดือน · ปิดประตูทางเดียวที่ต้นทาง) ──────────
//
// ⭐ 0410 สร้าง trigger แถวสามตัวบน public.quotation_lines + ฟังก์ชันของมันสามตัว (มติผู้นำงาน G1–G11 · แผน IMPL_PLAN_PRG §4.1 + §9):
//      T1 quotation_lines_pack_held_trg     BEFORE DELETE … WHEN (OLD."packQty" IS NOT NULL)  — จดใบลงตัวแปรของทรานแซกชัน · ไม่ปฏิเสธอะไรเลย
//      T2 quotation_lines_pack_keep_trg     BEFORE INSERT … WHEN (NEW."packQty" IS NULL)      — บรรทัดหมวด 02-001 ที่เลขแพ็คหาย = P0001
//      T3 quotation_lines_pack_no_clear_trg BEFORE UPDATE OF "packQty" … (ไม่ว่าง → ว่าง)      — P0001
//    ⇒ ยามนี้ล็อกรูปที่ฮาร์เนสพิสูจน์ไว้ ไม่ให้ไหลเงียบใน CI: ชื่อ · จังหวะ · เงื่อนไข WHEN · ลำดับขั้นของ T2 · กฎหมวด (คู่แฝดของ
//      lineTakesPacks(line, null) — quoteLinePackGuardCases.json) · กฎ "สินค้าเดียวกัน" ของข้อ (ข) · ข้อความไทย/รหัส P0001 · สิทธิ์ ·
//      ด่าน $pre$ / ตรวจท้าย $verify$ · สองก้อน SELECT + บล็อกถอย/ทางออกของหัวไฟล์ (เจ้าของแปะตามตัวอักษร)
// 🔴 G1: ไฟล์ **ไม่แตะเนื้อของ save_quotation_content แม้ตัวอักษรเดียว** (รัน 0407 ซ้ำแล้วตรวจท้ายของมันยังนับได้เท่าเดิม) —
//    md5 ที่หัวไฟล์ใช้ตัดสิน = md5 ของเนื้อที่ประกอบจากตัวหนังสือ repo (0343 + แถวปะ Q1–Q3 ของ 0407) ซึ่งยามนี้คิดเอง
// 🔴 ข้อ (ก) ของ T2 อาศัยรูป "DELETE บรรทัดของใบ แล้ว INSERT ใหม่" ของ save_quotation_content — ยามนี้สะดุดเมื่อไฟล์หลัง 0343 (นอกจาก 0407 · 0410)
//    เอ่ยชื่อตัวบันทึกในคำสั่ง: เนื้อที่รันอยู่อาจไม่ใช่เนื้อที่ฮาร์เนสพิสูจน์ ⇒ ไล่ดูว่ายังเป็น DELETE → INSERT ในการเรียกเดียว แล้วจึงย้ายยามนี้
// ⚠️ อ่าน **ตัวหนังสือ SQL + ไฟล์ตัวอย่าง JSON + รายชื่อไฟล์ใต้ src/** เท่านั้น — ไม่ import โมดูลของแอป ไม่ต่อฐานข้อมูล (ท่าเดียวกับยาม 0407)
//    ⇒ ประโยค "route โชว์ข้อความนี้ตรงตัว" ยึดที่ linePackRoutes.test.mjs + linePacks.test.mjs (อ่านข้อความจากไฟล์นี้เอง)
// ⚠️ พฤติกรรมจริงพิสูจน์บนฮาร์เนส PGlite นอก repo (mockups/so-service-lines/pglite-harness/harness-0410.mjs — 57 กรณี รันสองรอบผลเหมือนกัน
//    · mutate-0410.mjs = ไฟล์ที่ทำผิดทีละข้อ 83 ตัว · TEXT_GUARD=1 GUARD_TEST=src/lib/sales/quotationPackGuardMigration.test.mjs = ทุกตัวต้องถูกจับ
//    ด้วยเทสต์ในไฟล์นี้ที่ **ไม่ใช่** หมุด 🔒 sha256) · เอกสารของงวดนี้มียามแยก: quotationPackGuardDocs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const SRC_DIR = fileURLToPath(new URL('../../', import.meta.url));
const FILE = '0410_quotation_line_pack_guard.sql';
const FILE_0343 = '0343_document_customer_en.sql';
const FILE_0407 = '0407_quotation_line_pack_qty.sql';
const cache = new Map();
const read = (name) => {
  if (!cache.has(name)) cache.set(name, readFileSync(new URL(name, MIGRATIONS), 'utf8'));
  return cache.get(name);
};
const migrationNames = () => readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort();
const CASES = JSON.parse(readFileSync(new URL('./quoteLinePackGuardCases.json', import.meta.url), 'utf8'));
const md5 = (s) => createHash('md5').update(s).digest('hex');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const occurrences = (text, needle) => text.split(needle).length - 1;
const order = (text, needles, label) => {
  const at = needles.map((n) => text.indexOf(n));
  at.forEach((i, k) => assert.ok(i >= 0, `${label}: ไม่พบ ${needles[k]}`));
  for (let k = 1; k < at.length; k += 1) assert.ok(at[k - 1] < at[k], `${label}: ${needles[k - 1]} ต้องมาก่อน ${needles[k]}`);
};
const stripAllComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
/* คอมเมนต์ในเนื้อฟังก์ชัน — สตริงในเนื้อสามตัวไม่มี "--" (ข้อความไทยใช้ขีดยาว —) จึงตัดตรง ๆ ได้ */
const stripLineComments = (sql) => sql.replace(/--[^\n]*/g, '');
const definesFn = (sql, fn) => new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fn}\\s*\\(`, 'i').test(stripAllComments(sql));

/* ตัวหนังสือ SQL → คำสั่ง: ตัดคอมเมนต์ทั้งสองแบบ **นอกสตริง** · สตริง ('…' และเนื้อฟังก์ชัน $$…$$) คงไว้ทั้งก้อน หรือเหลือ '' (blank)
   · ป้ายของบล็อก DO ($pre$ $verify$) โปร่ง — ของข้างในคือคำสั่ง (ท่าเดียวกับ sqlText ของยาม 0409 · sqlCode ของฮาร์เนส) */
const DO_TAGS = Object.freeze(['pre', 'verify']);
function sqlText(text, { blank = false } = {}) {
  let out = '';
  for (let i = 0; i < text.length;) {
    if (text.startsWith('--', i)) { const e = text.indexOf('\n', i); i = e < 0 ? text.length : e; continue; }
    if (text.startsWith('/*', i)) { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 2; continue; }
    if (text[i] === "'") {
      let j = i + 1;
      while (j < text.length) { if (text[j] === "'" && text[j + 1] === "'") { j += 2; continue; } if (text[j] === "'") break; j += 1; }
      out += blank ? "''" : text.slice(i, j + 1); i = j + 1; continue;
    }
    const tag = /^\$([a-z]*)\$/.exec(text.slice(i, i + 12));
    if (tag) {
      if (DO_TAGS.includes(tag[1])) { out += tag[0]; i += tag[0].length; continue; }
      const e = text.indexOf(tag[0], i + tag[0].length);
      const end = e < 0 ? text.length : e + tag[0].length;
      out += blank ? "''" : text.slice(i, end); i = end; continue;
    }
    out += text[i]; i += 1;
  }
  return out;
}

const RAW = read(FILE);
const SPLIT = RAW.indexOf('\nBEGIN;');
const HEADER = RAW.slice(0, SPLIT);
const BODY = RAW.slice(SPLIT);
const CODE = sqlText(BODY);                  // คอมเมนต์นอกสตริงออก · สตริงและเนื้อฟังก์ชันอยู่ครบ
const BARE = sqlText(BODY, { blank: true }); // คอมเมนต์ออก · สตริงทุกแบบ (รวมเนื้อฟังก์ชัน) เหลือ ''
const doBlock = (tag) => {
  const m = new RegExp(`DO \\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$;`).exec(CODE);
  assert.ok(m, `ไม่พบบล็อก DO $${tag}$`);
  return m[1];
};

const FN = Object.freeze({ held: 'quotation_line_pack_held', keep: 'quotation_line_pack_keep', clear: 'quotation_line_pack_no_clear' });
const TRG = Object.freeze({ held: 'quotation_lines_pack_held_trg', keep: 'quotation_lines_pack_keep_trg', clear: 'quotation_lines_pack_no_clear_trg' });
const KEYS = Object.freeze(['held', 'keep', 'clear']);
const SAVE = 'save_quotation_content';
/* md5 ของ prosrc ของตัวบันทึก = ค่าที่ฮาร์เนส 0410 พิสูจน์ (SAVE_MD5 / SAVE_MD5_WS) — ยามนี้ประกอบเนื้อจาก repo แล้วคิดเอง (เทสต์ "G1") */
const SAVE_MD5 = '5e52e4e0c29a5cb8866b320d614903ba';
const SAVE_MD5_WS = 'd6d4d1b03ef071c0e7612a90582137ff';
/* กฎหมวด (= lineCategoryCode(line, null) === '02-001') · กฎ "สินค้าเดียวกัน" ของข้อ (ข) — ข้อความเดียวกับฮาร์เนส (PRED · SAME) ทุกตัวอักษร */
const PRED = (a) => `COALESCE(CASE WHEN COALESCE(${a}"productId", '') <> '' OR COALESCE(${a}"fgCode", '') <> '' THEN substring(${a}"fgCode" from '[0-9]{2}-[0-9]{3}') = '02-001' ELSE jsonb_typeof(${a}metadata -> 'categoryCode') = 'string' AND ${a}metadata ->> 'categoryCode' = '02-001' END, false)`;
const SAME = (n, p) => `((COALESCE(${n}"productId", '') = '' AND COALESCE(${n}"fgCode", '') = '') OR (COALESCE(${n}"productId", '') <> '' AND ${p}"productId" = ${n}"productId") OR (COALESCE(${n}"fgCode", '') <> '' AND ${p}"fgCode" = ${n}"fgCode"))`;
const UNLOCK = "COALESCE(current_setting('app.quotation_pack_unlock', true), '') = 'on'";
const ROLES = "('public'), ('anon'), ('authenticated'), ('service_role')";
const GATES = Object.freeze(['mig_0410_needs_0407', 'mig_0410_needs_columns', 'mig_0410_needs_save_shape', 'mig_0410_foreign_trigger',
  'mig_0410_mixed_lines', 'mig_0410_revision_bare_lines', 'mig_0410_verify']);

/* trigger สามตัวตามตัวอักษร (เหตุการณ์ · WHEN · คอลัมน์ของ UPDATE OF) — ตัวเดียวที่ยามนี้ยอมรับ */
const TRIGGERS = Object.freeze({
  held: { event: 'DELETE', when: 'OLD."packQty" IS NOT NULL', whenShown: 'old."packQty" IS NOT NULL', whenShown2: '-', col: '' },
  keep: { event: 'INSERT', when: 'NEW."packQty" IS NULL', whenShown: 'new."packQty" IS NULL', whenShown2: '-', col: '' },
  clear: { event: 'UPDATE OF "packQty"', when: 'OLD."packQty" IS NOT NULL AND NEW."packQty" IS NULL', whenShown: 'old."packQty" IS NOT NULL', whenShown2: 'new."packQty" IS NULL', col: 'packQty' },
});
const triggerSql = (key) => `DROP TRIGGER IF EXISTS ${TRG[key]} ON public.quotation_lines;\nCREATE TRIGGER ${TRG[key]}\n  BEFORE ${TRIGGERS[key].event} ON public.quotation_lines\n`
  + `  FOR EACH ROW\n  WHEN (${TRIGGERS[key].when})\n  EXECUTE FUNCTION public.${FN[key]}();\n`;
/* pg_trigger.tgtype = ROW 1 + BEFORE 2 + INSERT 4 / DELETE 8 / UPDATE 16 — คิดจากคำสั่งข้างบน ไม่ใช่พิมพ์ตาม */
const tgtypeOf = (key) => {
  const sql = triggerSql(key);
  return (/FOR EACH ROW/.test(sql) ? 1 : 0) + (/\n {2}BEFORE /.test(sql) ? 2 : 0)
    + (/BEFORE INSERT /.test(sql) ? 4 : 0) + (/BEFORE DELETE /.test(sql) ? 8 : 0) + (/BEFORE UPDATE /.test(sql) ? 16 : 0);
};

/* เนื้อฟังก์ชัน (prosrc) ของตัวใหม่ — หัวของ CREATE ต้องเป็นรูปนี้ทุกตัวอักษร: CREATE OR REPLACE · คืน trigger · plpgsql · search_path = public
   · ไม่มี SECURITY DEFINER (หัวที่ต่างไปแม้บรรทัดเดียว = หาไม่เจอ = แดง) */
function fnBody(key) {
  const head = `CREATE OR REPLACE FUNCTION public.${FN[key]}()\nRETURNS trigger\nLANGUAGE plpgsql\nSET search_path = public\nAS $$\n`;
  assert.equal(occurrences(BODY, head), 1, `${FN[key]}: หัวของ CREATE ต้องเป็น CREATE OR REPLACE … RETURNS trigger · LANGUAGE plpgsql · SET search_path = public · AS $$ (ไม่มี SECURITY DEFINER)`);
  const from = BODY.indexOf(head) + head.length;
  const to = BODY.indexOf('\n$$;\n', from);
  assert.ok(to > from, `${FN[key]}: หาเนื้อไม่เจอ`);
  return BODY.slice(from, to + 1);
}
const body = (key) => flat(stripLineComments(fnBody(key)));

/* ── หัวไฟล์: SELECT สองก้อน · บล็อกถอยกลับ · บล็อกทางออก · บรรทัดเกณฑ์ (เจ้าของแปะรันตามตัวอักษร · ฮาร์เนสรันตามตัวอักษรเช่นกัน) ── */
function headerSelect(title) {
  const at = HEADER.indexOf(title);
  assert.ok(at >= 0, `หัวไฟล์ต้องมีหัวข้อ ${title}`);
  const from = HEADER.indexOf('--   SELECT\n', at);
  assert.ok(from > at, `${title}: ไม่พบ SELECT`);
  const lines = [];
  for (const line of HEADER.slice(from).split('\n')) {
    lines.push(line.replace(/^--\s?/, ''));
    if (line.trimEnd().endsWith(';')) break;
  }
  return lines.join('\n');
}
/* บล็อกคำสั่งในคอมเมนต์ที่ขึ้นต้นด้วย "--      BEGIN;" หลังหัวข้อ title จนถึงบรรทัดสุดท้าย last (ตัด "--      " นำหน้าออก) */
function headerBlock(title, last) {
  const at = HEADER.indexOf(title);
  assert.ok(at >= 0, `หัวไฟล์ต้องมีหัวข้อ ${title}`);
  const from = HEADER.indexOf('--      BEGIN;\n', at);
  const to = HEADER.indexOf(`--      ${last}\n`, from);
  assert.ok(from > at && to > from, `${title}: ไม่พบบล็อก BEGIN; … ${last}`);
  return HEADER.slice(from, to + `--      ${last}`.length).split('\n').map((l) => l.replace(/^-- {6}/, ''));
}
/* บรรทัดเกณฑ์ "--   <ป้าย>: k = v · k = v" + บรรทัดต่อที่ขึ้นต้นด้วย "·" → ["k=v", …] */
function headerCriteria(label) {
  const lines = HEADER.split('\n');
  const at = lines.findIndex((l) => l.startsWith(`--   ${label}: `));
  assert.ok(at >= 0, `หัวไฟล์ต้องมีบรรทัด "${label}:"`);
  let text = lines[at].slice(`--   ${label}: `.length);
  for (let i = at + 1; /^--\s+· /.test(lines[i] || ''); i += 1) text += ` ${lines[i].replace(/^--\s+/, '')}`;
  return text.split(' · ').map((x) => x.trim()).filter(Boolean).map((pair) => pair.replace(' = ', '='));
}
const aliasesAtLineEnd = (sql) => [...sql.matchAll(/\bAS ([a-z0-9_]+)[,;]?[ \t]*$/gm)].map((m) => m[1]);
const PREFLIGHT = headerSelect('── ตรวจก่อนรัน');
const VERIFY = headerSelect('── ตรวจหลังรัน');

/* เนื้อของ save_quotation_content ที่รันอยู่ = นิยามล่าสุด (0343) + แถวปะ Q1–Q3 ของ 0407 — ข้อความเดียวกับที่ Postgres เก็บเป็น prosrc */
function liveSaveBody() {
  const sql = read(FILE_0343);
  const at = sql.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${SAVE}(`);
  assert.ok(at >= 0, `${FILE_0343}: ไม่พบนิยาม ${SAVE}`);
  const from = sql.indexOf('AS $$', at) + 5;
  const to = sql.indexOf('\n$$;', from);
  let text = sql.slice(from, to + 1);
  const s0407 = read(FILE_0407);
  const patch = /DO \$patch\$([\s\S]*?)\$patch\$;/.exec(s0407.slice(s0407.indexOf('\nBEGIN;')));
  assert.ok(patch, '0407 ต้องมีบล็อก DO $patch$');
  const rows = [...patch[1].matchAll(/\('([a-z_0-9]+)',\s*\$re\$([\s\S]*?)\$re\$,\s*\$rp\$([\s\S]*?)\$rp\$,\s*'([^']+)'\)/g)].filter((m) => m[1] === SAVE);
  assert.deepEqual(rows.map((m) => m[4]), ['0407/Q1', '0407/Q2', '0407/Q3'], '0407 ปะตัวบันทึกสามแถว Q1–Q3');
  for (const [, , anchor, replacement, marker] of rows) {
    assert.equal([...text.matchAll(new RegExp(anchor, 'g'))].length, 1, `${marker}: anchor ต้องเจอครั้งเดียว`);
    text = text.replace(new RegExp(anchor), replacement.replace(/\$/g, '$$$$').replace(/\\([1-9])/g, '$$$1'));
  }
  return text;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

test('0410: ทรานแซกชันเดียว · รูปไฟล์ BEGIN → lock_timeout → $pre$ → ฟังก์ชันสามตัว → REVOKE สามบรรทัด → คำอธิบาย → trigger สามตัว (DROP IF EXISTS ก่อน CREATE) → $verify$ → COMMIT → NOTIFY · ไม่เขียนแถวข้อมูล · ไม่ GRANT', () => {
  assert.equal(occurrences(RAW, '\nBEGIN;\n'), 1, 'BEGIN; ชั้นนอกครั้งเดียว');
  assert.equal(occurrences(RAW, '\nCOMMIT;\n'), 1, 'COMMIT; ครั้งเดียว');
  /* นอกบล็อก DO และเนื้อฟังก์ชันเหลือแค่โครงนี้ ตามลำดับนี้ — ไม่มีคำสั่งชั้นนอกตัวอื่น · NOTIFY อยู่หลัง COMMIT */
  const outsideDo = BARE.replace(/\$([a-z]+)\$[\s\S]*?\$\1\$/g, '');
  const fnHead = (k) => `CREATE OR REPLACE FUNCTION public\\.${FN[k]}\\(\\)\\s*RETURNS trigger\\s*LANGUAGE plpgsql\\s*SET search_path = public\\s*AS '';\\s*`;
  const revoke = (k) => `REVOKE ALL ON FUNCTION public\\.${FN[k]}\\(\\) FROM PUBLIC, anon, authenticated, service_role;\\s*`;
  const fnNote = (k) => `COMMENT ON FUNCTION public\\.${FN[k]}\\(\\) IS\\s*'';\\s*`;
  const trg = (k) => `DROP TRIGGER IF EXISTS ${TRG[k]} ON public\\.quotation_lines;\\s*CREATE TRIGGER ${TRG[k]}\\s[^;]*;\\s*`;
  const trgNote = (k) => `COMMENT ON TRIGGER ${TRG[k]} ON public\\.quotation_lines IS\\s*'';\\s*`;
  const shape = new RegExp(`^\\s*BEGIN;\\s*SET LOCAL lock_timeout = '';\\s*DO ;\\s*${KEYS.map(fnHead).join('')}${KEYS.map(revoke).join('')}`
    + `${KEYS.map(fnNote).join('')}${KEYS.map(trg).join('')}${KEYS.map(trgNote).join('')}DO ;\\s*COMMIT;\\s*NOTIFY pgrst, '';\\s*$`);
  assert.match(outsideDo, shape, 'รูปไฟล์: BEGIN → SET LOCAL lock_timeout → DO $pre$ → 3 × CREATE OR REPLACE FUNCTION → 3 × REVOKE → 3 × COMMENT ON FUNCTION → 3 × (DROP TRIGGER IF EXISTS → CREATE TRIGGER) → 3 × COMMENT ON TRIGGER → DO $verify$ → COMMIT → NOTIFY');
  /* ⏱ §0: รอล็อกได้ไม่เกิน 5 วินาที — คำสั่งแรกหลัง BEGIN · SET LOCAL (ตายพร้อม COMMIT ไม่ค้างในเซสชันของ SQL Editor) */
  assert.match(CODE, /^\s*BEGIN;\s*SET LOCAL lock_timeout = '5s';\s*DO \$pre\$/, 'SET LOCAL lock_timeout = \'5s\' ต้องเป็นคำสั่งแรกหลัง BEGIN');
  assert.equal(occurrences(CODE, 'lock_timeout'), 1);
  /* ไม่ backfill · ไม่แตะคอลัมน์/CHECK/ตารางอื่น — นอกคำสั่ง CREATE TRIGGER (คำว่า DELETE/INSERT/UPDATE เป็นเหตุการณ์ของมัน) ไม่มีคำสั่งเขียน */
  const noTriggers = BARE.replace(/CREATE TRIGGER [^;]*;/g, '');
  assert.doesNotMatch(noTriggers, /\b(UPDATE|INSERT|DELETE|MERGE|TRUNCATE|COPY)\b/, 'ไม่มีคำสั่งเขียน/ลบแถวข้อมูล (นอกเนื้อฟังก์ชัน)');
  assert.doesNotMatch(BARE, /\b(ALTER|GRANT)\b/, 'ไม่ ALTER · ไม่ GRANT');
  assert.doesNotMatch(BARE, /\b(TEMP|TEMPORARY)\b/i, 'ลายนิ้วมือเก็บด้วย set_config ของทรานแซกชัน ไม่ใช่ตารางชั่วคราว');
  assert.deepEqual([...BARE.matchAll(/\bDROP\s+(\w+)/g)].map((m) => m[1]), ['TRIGGER', 'TRIGGER', 'TRIGGER'], 'DROP มีแค่ DROP TRIGGER IF EXISTS สามบรรทัด');
  assert.doesNotMatch(CODE, /SECURITY\s+DEFINER/i, 'SECURITY INVOKER ทั้งสามตัว');
  assert.equal(occurrences(BARE, 'EXECUTE '), 3, 'EXECUTE มีแค่ EXECUTE FUNCTION ของ trigger สามตัว — ไม่มี SQL ประกอบสด');
  /* ลายนิ้วมือสองค่าของ $pre$ เป็นของทรานแซกชัน (อาร์กิวเมนต์ที่สาม = true) — ไม่ค้างในเซสชัน */
  assert.equal(occurrences(doBlock('pre'), 'PERFORM set_config('), 2);
  assert.equal(occurrences(flat(doBlock('pre')), '), true);'), 2, "mig_0410.others · mig_0410.tables ต้องเป็น is_local = true");
});

test('trigger สามตัวตามตัวอักษร: BEFORE · FOR EACH ROW · เหตุการณ์ · WHEN (T1 OLD ไม่ว่าง · T2 NEW ว่าง · T3 ไม่ว่าง → ว่าง) · UPDATE OF "packQty" · แต่ละตัวเรียกฟังก์ชันของมันเอง · DROP IF EXISTS ก่อน CREATE (รันซ้ำได้)', () => {
  for (const key of KEYS) {
    assert.equal(occurrences(CODE, triggerSql(key)), 1, `${TRG[key]}: คำสั่งต้องเป็นรูปนี้ทุกตัวอักษร —\n${triggerSql(key)}`);
  }
  assert.equal(occurrences(CODE, 'CREATE TRIGGER '), 3);
  assert.equal(occurrences(CODE, 'DROP TRIGGER IF EXISTS '), 3);
  assert.deepEqual(KEYS.map(tgtypeOf), [11, 7, 19], 'tgtype ที่คิดจากคำสั่ง: T1 = ROW+BEFORE+DELETE · T2 = ROW+BEFORE+INSERT · T3 = ROW+BEFORE+UPDATE');
  /* ตรวจท้ายของไฟล์และ SELECT ตรวจหลังรันเทียบ tgtype / ฟังก์ชัน / คอลัมน์ ชุดเดียวกับคำสั่งจริง */
  const verify = flat(doBlock('verify'));
  for (const key of KEYS) {
    assert.ok(verify.includes(`('${TRG[key]}', ${tgtypeOf(key)}, '${FN[key]}', '${TRIGGERS[key].col}')`), `$verify$ ต้องเทียบ ${TRG[key]} ด้วย tgtype ${tgtypeOf(key)}`);
    const t = TRIGGERS[key];
    assert.ok(flat(VERIFY).includes(`('${TRG[key]}', ${tgtypeOf(key)}, '${FN[key]}', '${t.col}', '${t.whenShown}', '${t.whenShown2}')`), `SELECT ตรวจหลังรันต้องเทียบ ${TRG[key]} (tgtype · ฟังก์ชัน · คอลัมน์ · WHEN ตามที่ pg_get_triggerdef พิมพ์)`);
  }
  assert.ok(verify.includes("t.tgtype = e.typ AND p.proname = e.fn AND t.tgenabled = 'O' AND t.tgqual IS NOT NULL"), '$verify$: เปิดใช้อยู่ + มี WHEN');
  assert.ok(verify.includes("(SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = 'public.quotation_lines'::regclass AND NOT t.tgisinternal) <> 3"), '$verify$: บนตารางบรรทัดมีแค่สามตัวนี้');
});

test('🔴 G1 — ไม่แตะเนื้อของ save_quotation_content: ไม่มีข้อความ FUNCTION public.save_quotation_content (แม้ในคอมเมนต์) · ชื่ออยู่ในสตริงเท่านั้น · CREATE FUNCTION มีแค่สามตัวใหม่ · md5 ของหัวไฟล์ = เนื้อที่ประกอบจาก repo (0343 + 0407/Q1–Q3) · รูป DELETE → INSERT ที่ด่านตรวจผ่านบนเนื้อนั้น', () => {
  assert.doesNotMatch(RAW, /FUNCTION\s+public\.save_quotation_content/, 'ยาม "นิยามล่าสุด" ของหลายเทสต์หาเจ้าของนิยามด้วยข้อความนี้ — เจ้าของต้องยังเป็น 0343');
  assert.doesNotMatch(RAW, /pg_get_functiondef/, 'ไฟล์นี้ไม่ปะฟังก์ชันเดิม (แบบ 0407/0409) — แตะเฉพาะของใหม่สามตัว');
  assert.equal(occurrences(BARE, SAVE), 0, `${SAVE}: ต้องอยู่ในสตริงเท่านั้น (proname = '…' ของด่าน/ตรวจท้าย และข้อความ NOTICE)`);
  assert.ok(occurrences(CODE, `p.proname = '${SAVE}'`) >= 3, 'ด่านก่อนรันและตรวจท้ายอ่านตัวบันทึกด้วยชื่อ');
  const created = [...BARE.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_.]+)/gi)].map((m) => m[1]);
  assert.deepEqual(created, KEYS.map((k) => `public.${FN[k]}`), 'สร้างฟังก์ชันแค่สามตัวของ trigger');
  for (const name of [...RAW.matchAll(/FUNCTION\s+public\.([a-z_0-9]+)/g)].map((m) => m[1])) {
    assert.ok(Object.values(FN).includes(name), `ข้อความ "FUNCTION public." ตามด้วยชื่อใหม่สามตัวเท่านั้น — เจอ ${name}`);
  }
  /* เจ้าของนิยามล่าสุดของตัวบันทึกทั้งโฟลเดอร์ยังเป็น 0343 · ไฟล์ระหว่าง 0343 กับ 0410 ที่เอ่ยชื่อในคำสั่งมีแค่ 0407 (แถวปะ Q1–Q3)
     ⇒ เนื้อที่รันอยู่ = 0343 + Q1–Q3 — ไฟล์ใหม่ที่แตะตัวบันทึก = ตัวสะดุดนี้แดง (ข้อ (ก) ของ T2 อาศัยรูปของมัน) */
  const names = migrationNames();
  assert.equal(names.filter((n) => read(n).includes(`CREATE OR REPLACE FUNCTION public.${SAVE}(`)).at(-1), FILE_0343, `ไฟล์สุดท้ายที่มีข้อความนิยาม ${SAVE} ต้องเป็น ${FILE_0343}`);
  assert.equal(names.filter((n) => definesFn(read(n), SAVE)).at(-1), FILE_0343, `นิยามเต็มล่าสุดของ ${SAVE} ต้องเป็น ${FILE_0343}`);
  const touchers = names.filter((n) => n > FILE_0343 && n !== FILE && stripAllComments(read(n)).includes(SAVE));
  assert.deepEqual(touchers, [FILE_0407], `ไฟล์หลัง 0343 ที่เอ่ย ${SAVE} ในคำสั่ง — มีตัวใหม่ = เนื้อที่รันอยู่อาจไม่ใช่เนื้อที่ฮาร์เนสพิสูจน์ (ข้อ (ก) ของ T2 อาศัย DELETE → INSERT) ⇒ ไล่ดูแล้วย้ายยามนี้`);
  const live = liveSaveBody();
  assert.equal(md5(live), SAVE_MD5, 'md5 ของเนื้อที่ประกอบจาก repo = ค่าที่ฮาร์เนส 0410 พิสูจน์');
  assert.equal(md5(live.replace(/[ \t\n\r]/g, '')), SAVE_MD5_WS, 'md5 หลังลบช่องว่าง = save_body_ws ของ SELECT ตรวจก่อนรัน');
  /* ค่าเดียวกันทุกที่ที่ไฟล์ใช้ตัดสิน: SELECT ตรวจก่อนรัน (save_body · md5_expected · save_body_ws) · SELECT ตรวจหลังรัน (save_body) · NOTICE ของ $verify$ */
  assert.equal(occurrences(PREFLIGHT, `'${SAVE_MD5}'`), 2, 'ตรวจก่อนรัน: save_body + md5_expected');
  assert.ok(PREFLIGHT.includes(`md5(regexp_replace(p.prosrc, '[ \\t\\n\\r]', '', 'g')) = '${SAVE_MD5_WS}'`), 'ตรวจก่อนรัน: save_body_ws');
  assert.equal(occurrences(VERIFY, `'${SAVE_MD5}'`), 1, 'ตรวจหลังรัน: save_body');
  assert.equal(occurrences(doBlock('verify'), SAVE_MD5), 1, '$verify$ พิมพ์ md5 ที่พิสูจน์ไว้คู่กับของฐาน');
  /* ด่าน mig_0410_needs_save_shape (และช่อง save_shape ของตรวจก่อนรัน) ตรวจสี่ข้อ — ทั้งสี่จริงบนเนื้อที่พิสูจน์ */
  const DEL = 'DELETE FROM public.quotation_lines WHERE "quotationId" = p_quote_id;';
  const INS = 'INSERT INTO public.quotation_lines (';
  assert.equal(occurrences(live, 'DELETE FROM public.quotation_lines'), 1);
  assert.equal(occurrences(live, 'INSERT INTO public.quotation_lines'), 1);
  assert.ok(live.indexOf(DEL) >= 0 && live.indexOf(INS) > live.indexOf(DEL), 'เนื้อที่พิสูจน์: ลบบรรทัดของใบก่อน แล้วแทรกใหม่');
  const pre = flat(doBlock('pre'));
  for (const text of [pre, flat(PREFLIGHT)]) {
    for (const needle of [`'DELETE FROM public.quotation_lines'`, `'INSERT INTO public.quotation_lines'`, `'${DEL.replaceAll("'", "''")}'`, `'${INS}'`]) {
      assert.ok(text.includes(needle), `ด่านรูปของตัวบันทึกต้องอ่าน ${needle}`);
    }
  }
  /* ลายนิ้วมือ "ฟังก์ชันอื่นทุกตัวใน public" (รวมเนื้อตัวบันทึก) — $pre$ จด · $verify$ เทียบ ด้วยนิพจน์เดียวกันทุกตัวอักษร */
  const others = (text) => flat(text.slice(text.indexOf('SELECT md5(COALESCE(string_agg('), text.indexOf('NOT (p.proname = ANY (v_fns))')));
  assert.ok(others(doBlock('pre')).includes("md5(p.prosrc)"), 'ลายนิ้วมือรวมเนื้อของทุกฟังก์ชัน');
  assert.equal(others(doBlock('pre')), others(doBlock('verify')), 'ลายนิ้วมือ others: $pre$ กับ $verify$ ต้องเป็นนิพจน์เดียวกัน');
  const tables = (text) => flat(text.slice(text.indexOf("COALESCE((SELECT string_agg(t.tgrelid::regclass::text"), text.indexOf("i.tablename = 'quotation_lines'")));
  assert.equal(tables(doBlock('pre')), tables(doBlock('verify')), 'ลายนิ้วมือ tables: $pre$ กับ $verify$ ต้องเป็นนิพจน์เดียวกัน');
});

test('G2 — T1 (จด) ทั้งตัว: ต่อ chr(31) + quotationId + chr(31) ลง app.quotation_pack_held ด้วย set_config(…, true) · ไม่โยน error · ไม่อ่านตาราง · ไม่ cast · ไม่ดูทางออก · คืน OLD', () => {
  const t1 = body('held');
  assert.equal(t1, flat(`DECLARE
    v_held text := COALESCE(current_setting('app.quotation_pack_held', true), '');
  BEGIN
    IF strpos(v_held, chr(31) || OLD."quotationId" || chr(31)) = 0 THEN
      PERFORM set_config('app.quotation_pack_held',
        CASE WHEN v_held = '' THEN chr(31) ELSE v_held END || OLD."quotationId" || chr(31), true);
    END IF;
    RETURN OLD;
  END;`), 'T1 ต้องเป็นเก้าบรรทัดนี้ — การลบทุกชนิด (cascade · บังคับลบ · ลบดีล · ทางถอยของ Rev./สร้างใบ) ผ่านตัวนี้');
  assert.doesNotMatch(t1, /RAISE/, 'T1 ไม่ปฏิเสธอะไรเลย (G2)');
  assert.doesNotMatch(t1, /\bFROM\b|::/, 'ไม่อ่านตาราง ไม่ cast — ไม่มีทางพัง');
  assert.doesNotMatch(t1, /quotation_pack_unlock/, 'การจดไม่มีพิษ — ไม่ต้องมีทางออก');
  assert.doesNotMatch(t1, /OLD\.id\b/, 'จดรหัสใบ ไม่ใช่รหัสบรรทัด');
});

test('G3 — T2 (ปฏิเสธ) ตามลำดับ: ทางออก → หมวด (กฎเดียวกับ JS บนคอลัมน์ของแถว) → (ก) ใบเพิ่งเสียบรรทัดที่มีเลขแพ็คในทรานแซกชันนี้ (ตัวคั่น chr(31) ทั้งสองข้าง) → (ข) ฉบับต้นทาง (revisedFromId) ถือเลขแพ็คของสินค้าเดียวกัน → เลขใบ → RAISE · ไม่คืน NULL', () => {
  const t2 = body('keep');
  order(t2, [
    `IF ${UNLOCK} THEN RETURN NEW; END IF;`,
    `IF NOT ${PRED('NEW.')} THEN RETURN NEW; END IF;`,
    `IF strpos(COALESCE(current_setting('app.quotation_pack_held', true), ''), chr(31) || NEW."quotationId" || chr(31)) > 0 THEN v_why := 'rewrite'; ELSE`,
    `SELECT s."quoteNumber" INTO v_source FROM public.quotations q JOIN public.quotations s ON s.id = q."revisedFromId" WHERE q.id = NEW."quotationId" AND EXISTS (SELECT 1 FROM public.quotation_lines l WHERE l."quotationId" = s.id AND l."packQty" IS NOT NULL AND ${SAME('NEW.', 'l.')});`,
    `IF NOT FOUND THEN RETURN NEW; END IF; v_why := 'revision'; END IF;`,
    `SELECT q."quoteNumber" INTO v_number FROM public.quotations q WHERE q.id = NEW."quotationId";`,
    "RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = CASE v_why WHEN 'rewrite' THEN format(",
  ], 'T2');
  assert.equal(occurrences(t2, 'RETURN NEW;'), 3, 'T2 ปล่อยผ่านสามทาง (ทางออก · ไม่ใช่หมวด 02-001 · ไม่เข้าข้อ (ก)/(ข)) — ทุกทางคืน NEW');
  assert.doesNotMatch(t2, /RETURN NULL|RETURN OLD/, 'คืน NULL = แถวหายเงียบ (บรรทัดของใบที่ไม่เคยมีเลขแพ็คต้องถูกเก็บ — มติ A4)');
  assert.equal(occurrences(t2, 'RAISE'), 1);
  /* อ่านตารางได้แค่ใบเสนอราคา/บรรทัด — ไม่ join ทะเบียนสินค้า ไม่เรียกฟังก์ชันของผู้ใช้ (ตัวช่วยที่ถอนสิทธิ์ = INSERT ทุกแถวพัง 42501 · G7) */
  for (const key of KEYS) {
    const text = body(key);
    assert.doesNotMatch(text, /\bproducts\b|fg_category_of/, `${FN[key]}: ไม่ดูทะเบียนสินค้า — หมวดมาจากคอลัมน์ของแถวเท่านั้น (ด่าน JS ไม่ส่งสินค้าให้เหมือนกัน)`);
    for (const ref of [...text.matchAll(/public\.([a-z_0-9]+)/g)].map((m) => m[1])) {
      assert.ok(['quotations', 'quotation_lines'].includes(ref), `${FN[key]}: อ้างได้แค่ public.quotations / public.quotation_lines — เจอ public.${ref}`);
    }
  }
});

test('G3 — กฎหมวด: สำเนาเก้าที่เป็นข้อความเดียวกันทุกตัวอักษร (T2 ×1 ด้วย NEW. · ด่าน $pre$ ×2 · ตรวจก่อนรัน ×4 · ตรวจหลังรัน ×2 ด้วย l.) = categoryExpression ของ quoteLinePackGuardCases.json · [0-9] ไม่ใช่ \\d · กฎ "สินค้าเดียวกัน" ห้าที่ (T2 NEW./l. · ที่เหลือ l./s.)', () => {
  assert.equal(CASES.categoryExpression, PRED('NEW.'), 'ไฟล์ตัวอย่างถือนิพจน์ของ T2 ตามตัวอักษร (ฝั่ง JS รันกรณีในไฟล์นั้นด้วย lineTakesPacks)');
  assert.ok(CASES.cases.length >= 20 && CASES.cases.some((c) => c.takesPacks) && CASES.cases.some((c) => !c.takesPacks), 'ไฟล์ตัวอย่างมีทั้งสองคำตอบ');
  const preds = [...RAW.matchAll(/COALESCE\(CASE WHEN [^\n]*?END, false\)/g)].map((m) => m[0]);
  assert.equal(preds.length, 9, 'กฎหมวดมีเก้าสำเนา');
  assert.deepEqual(preds.filter((p) => p !== PRED('l.') && p !== PRED('NEW.')), [], 'ทุกสำเนาเป็นข้อความเดียวกันทุกตัวอักษร');
  assert.equal(preds.filter((p) => p === PRED('NEW.')).length, 1, 'T2 ใช้ NEW. หนึ่งที่');
  assert.equal(occurrences(fnBody('keep'), PRED('NEW.')), 1);
  const pre = doBlock('pre');
  assert.equal(occurrences(pre, PRED('l.')), 2, '$pre$: ด่าน mixed + ด่าน Rev.');
  assert.equal(occurrences(PREFLIGHT, PRED('l.')), 4, 'ตรวจก่อนรัน: mixed · rev_bare · mixed_list · rev_bare_list');
  assert.equal(occurrences(VERIFY, PRED('l.')), 2, 'ตรวจหลังรัน: mixed · rev_bare');
  assert.doesNotMatch(stripAllComments(RAW), /\\d/, 'ใช้ [0-9] — \\d ของ Postgres ขึ้นกับ locale (เลขไทย) ส่วน \\d ของ JS คือเลขอารบิกเท่านั้น');
  const sames = [...RAW.matchAll(/\(\(COALESCE\([a-zA-Z]+\."productId", ''\) = ''[^\n]*?"fgCode"\)\)/g)].map((m) => m[0]);
  assert.equal(sames.length, 5, 'กฎ "สินค้าเดียวกัน" มีห้าสำเนา');
  assert.equal(sames.filter((s) => s === SAME('NEW.', 'l.')).length, 1, 'T2: บรรทัดใหม่ (NEW.) ↔ บรรทัดที่มีเลขแพ็คของต้นทาง (l.)');
  assert.equal(sames.filter((s) => s === SAME('l.', 's.')).length, 4, '$pre$ ×1 · ตรวจก่อนรัน ×2 · ตรวจหลังรัน ×1: บรรทัด Rev. (l.) ↔ ต้นทาง (s.)');
  assert.equal(occurrences(pre, SAME('l.', 's.')), 1);
  assert.equal(occurrences(PREFLIGHT, SAME('l.', 's.')), 2);
  assert.equal(occurrences(VERIFY, SAME('l.', 's.')), 1);
  /* หัวไฟล์บอกจำนวนสำเนาเดียวกับที่นับได้ (เก้า · ห้า) */
  assert.match(HEADER, /ตรรกะหมวดมีสำเนาเก้าที่ \(T2 · ด่าน §0 สองที่ · SELECT ตรวจก่อนรันสี่ที่ · SELECT ตรวจหลังรันสองที่\)/);
  assert.match(HEADER, /กฎ "สินค้าเดียวกัน" ของข้อ \(ข\) ห้าที่ \(T2 · ด่าน §0 · SELECT ตรวจก่อนรันสองที่ · SELECT ตรวจหลังรัน\)/);
});

test('G4 · G5 — T3 (ห้ามล้าง) ทั้งตัว · ทางออก app.quotation_pack_unlock อ่านในรูปเดียว ที่ T2 กับ T3 เท่านั้น (T1 ไม่อ่าน) · ไม่มีไฟล์ใต้ src/ (นอกเทสต์) รู้จักชื่อทางออก · app.mig_0410_accept อ่านใน $pre$ เท่านั้น · บล็อกทางออกของหัวไฟล์ = BEGIN → SET LOCAL → COMMIT', () => {
  const t3 = body('clear');
  order(t3, [
    'DECLARE v_number text; BEGIN',
    `IF ${UNLOCK} THEN RETURN NEW; END IF;`,
    `SELECT q."quoteNumber" INTO v_number FROM public.quotations q WHERE q.id = OLD."quotationId";`,
    "RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format(",
  ], 'T3');
  assert.equal(occurrences(t3, 'RETURN'), 1, 'T3 ปล่อยผ่านทางเดียว (ทางออก) — นอกนั้นปฏิเสธเสมอ');
  /* ทางออกมีรูปเดียว: ค่า 'on' เป๊ะ (ค่าอื่นทุกค่า = ยามทำงาน) · อ่านแบบไม่โยน (missing_ok = true) */
  assert.equal(occurrences(fnBody('keep'), UNLOCK), 1, 'T2 อ่านทางออกครั้งเดียว');
  assert.equal(occurrences(fnBody('clear'), UNLOCK), 1, 'T3 อ่านทางออกครั้งเดียว');
  assert.equal(occurrences(CODE, "current_setting('app.quotation_pack_unlock'"), 2, 'อ่านทางออกได้แค่ T2 กับ T3');
  assert.doesNotMatch(fnBody('held'), /quotation_pack_unlock/);
  assert.doesNotMatch(doBlock('pre') + doBlock('verify'), /quotation_pack_unlock/);
  /* ค่ายอมรับของด่านรันครั้งแรก: อ่านใน $pre$ ครั้งเดียว · ยามสามตัวไม่อ่าน (เปิดได้แค่สองด่าน ไม่เปิดยาม) */
  assert.equal(occurrences(CODE, "current_setting('app.mig_0410_accept', true)"), 1);
  assert.ok(doBlock('pre').includes("current_setting('app.mig_0410_accept', true)"));
  for (const key of KEYS) assert.doesNotMatch(fnBody(key), /mig_0410_accept/, `${FN[key]} ต้องไม่อ่านค่ายอมรับของด่าน`);
  /* แอปทุกรุ่นเปิดทางออกไม่ได้: PostgREST ตั้งตัวแปรชื่อนี้ไม่ได้ และโค้ดแอปต้องไม่เอ่ยชื่อเลย (เทสต์/เอกสารเอ่ยได้) */
  const offenders = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) { if (entry !== 'node_modules') walk(path); continue; }
      if (entry.endsWith('.test.mjs')) continue;
      const text = readFileSync(path, 'utf8');
      if (/quotation_pack_unlock|mig_0410_accept|quotation_pack_held/.test(text)) offenders.push(path.slice(SRC_DIR.length));
    }
  })(SRC_DIR);
  assert.deepEqual(offenders, [], 'ไฟล์ของแอปต้องไม่รู้จักชื่อตัวแปรของยาม (ทางออก · ค่ายอมรับ · ตัวจด)');
  /* บล็อกทางออกของหัวไฟล์ — SET LOCAL ภายใน BEGIN … COMMIT (SET เฉย ๆ = ค้างทั้งเซสชันของ SQL Editor) */
  const unlock = headerBlock('── ทางออก', 'COMMIT;');
  assert.deepEqual(unlock.filter((l) => !l.startsWith('--')), ['BEGIN;', "SET LOCAL app.quotation_pack_unlock = 'on';", 'COMMIT;'], 'บล็อกทางออก: BEGIN → SET LOCAL → (คำสั่งแก้ข้อมูล) → COMMIT');
  order(HEADER, ['── ทางออก', 'ห้ามใช้ SET แบบไม่มี LOCAL', 'PostgREST ตั้งตัวแปรชื่อนี้ต่อคำขอไม่ได้', 'INSERT แถวเดี่ยวไม่ถูกปฏิเสธ',
    'DELETE ไม่ต้องใช้ทางออกนี้ (T1 ไม่เคยปฏิเสธ)', 'scripts/check-line-pack-parity.mjs (อ่านอย่างเดียว) — ยามไม่ใช่ตัวตรวจ'], 'หัวข้อทางออก');
});

test('G6 — ข้อความที่จอเห็น: P0001 ทุกที่ (ไม่มี 23514 ในไฟล์) · ภาษาไทย บอกใบ/รายการ อะไรถูกปฏิเสธ ไม่มีอะไรถูกบันทึก และต้องทำอะไร · ไม่มีชื่อ CHECK ของ 0407 · ข้อความของ T2 ไม่เอ่ยทางออก · รหัสเครื่องท้าย MESSAGE และต้น DETAIL', () => {
  const raises = (key) => flat(stripLineComments(fnBody(key)).slice(stripLineComments(fnBody(key)).indexOf('RAISE EXCEPTION USING')));
  assert.equal(occurrences(BODY, "ERRCODE = 'P0001'"), 2, 'T2 และ T3 ปฏิเสธด้วย P0001');
  assert.equal(occurrences(BODY, 'ERRCODE'), 2, 'ไม่มี SQLSTATE อื่น');
  assert.doesNotMatch(BODY, /23514/, 'ไม่มี SQLSTATE ของ CHECK ในไฟล์');
  for (const key of KEYS) {
    assert.doesNotMatch(fnBody(key), /_line_money_rule|_pack_qty_range/, `${FN[key]}: lineMoneyRuleMessage จับ 23514 + ชื่อ CHECK ของ 0407 — ข้อความของยามต้องไม่มีสองอย่างนั้น (route โชว์ error.message ตรง ๆ)`);
  }
  const literals = [...BODY.matchAll(/'(ไม่ได้บันทึก:(?:[^']|'')*)'/g)].map((m) => m[1].replaceAll("''", "'"));
  assert.equal(literals.length, 3, 'MESSAGE สามแบบ: rewrite · revision (T2) · ห้ามล้าง (T3)');
  const [rewrite, revision, cleared] = literals;
  for (const text of literals) {
    assert.match(text, /[฀-๿]/, 'ข้อความภาษาไทย');
    assert.match(text, /ไม่มีอะไรถูกบันทึก/, 'บอกว่าไม่มีอะไรถูกบันทึก');
    assert.match(text, /“แพ็ค\/เดือน”/, 'เรียกช่องด้วยชื่อบนจอ');
  }
  assert.ok(rewrite.startsWith('ไม่ได้บันทึก: ใบเสนอราคา %s รายการที่ %s (หมวด 02-001) ไม่มี “แพ็ค/เดือน” ทั้งที่ใบนี้มีเลขแพ็คอยู่แล้ว'), 'rewrite บอกเลขใบและรายการ');
  assert.ok(revision.startsWith('ไม่ได้บันทึก: ฉบับ Rev. %s รายการที่ %s (หมวด 02-001) ไม่มี “แพ็ค/เดือน” ทั้งที่ฉบับต้นทาง %s มีเลขแพ็คของรายการนี้'), 'revision บอกฉบับ Rev. รายการ และฉบับต้นทาง');
  assert.ok(cleared.startsWith('ไม่ได้บันทึก: ล้าง “แพ็ค/เดือน” ของรายการใบเสนอราคาที่มีเลขแพ็คแล้วไม่ได้ (ใบ %s รายการที่ %s · เลขแพ็คเดิม %s)'), 'T3 บอกใบ รายการ และเลขเดิม');
  for (const text of [rewrite, revision]) {
    assert.match(text, /เลขแพ็คจะหายและยอดจะผิด/, 'บอกว่าทำไม');
    assert.match(text, /รีเฟรชหน้าแล้วทำใหม่ \(เปิดจาก dev server ให้รวม main ก่อน\)/, 'บอกว่าต้องทำอะไร (หน้าจอรุ่นเก่า)');
    assert.match(text, /แจ้งผู้ดูแลระบบ \[quotation_line_pack_lost\]$/, 'ลงท้ายด้วยรหัสเครื่องในวงเล็บเหลี่ยม');
    assert.doesNotMatch(text, /quotation_pack_unlock|SET LOCAL/, 'คนขายเห็นข้อความนี้ — ห้ามเอ่ยทางออกของ SQL Editor');
  }
  /* §9.3: การทำหายที่แยกเป็นสองการบันทึกยามมองไม่เห็น — ข้อความบอกตรงข้ามกับสูตรนั้น (ไม่ใช่ "บันทึกการลบก่อน") */
  assert.ok(rewrite.includes('อย่าลบรายการนี้แล้วเพิ่มกลับในการบันทึกถัดไป — เลขแพ็คจะหายโดยไม่มีอะไรเตือน'), 'rewrite เตือนทางสองการบันทึก');
  assert.doesNotMatch(rewrite + revision, /บันทึกการลบก่อน/);
  assert.ok(cleared.includes("ทำใน SQL Editor ภายใน BEGIN … COMMIT พร้อม SET LOCAL app.quotation_pack_unlock = 'on' [quotation_line_pack_cleared]"), 'T3: ไม่มีทางแอปไปถึง — ผู้อ่านคือคนแก้ฐานตรง จึงบอกทางออกได้');
  /* อาร์กิวเมนต์ของ format: เลขใบ (ถอยไปรหัสใบ) · รายการที่ = sortOrder + 1 (เลขบนจอของรุ่นปัจจุบัน) */
  const t2 = raises('keep');
  assert.ok(t2.includes(`COALESCE(v_number, NEW."quotationId"), COALESCE(NEW."sortOrder", 0) + 1)`));
  assert.ok(t2.includes(`COALESCE(v_number, NEW."quotationId"), COALESCE(NEW."sortOrder", 0) + 1, COALESCE(v_source, '-'))`));
  assert.ok(raises('clear').includes(`COALESCE(v_number, OLD."quotationId"), COALESCE(OLD."sortOrder", 0) + 1, OLD."packQty")`));
  assert.ok(t2.includes("DETAIL = format('quotation_line_pack_lost reason=%s quotationId=%s lineId=%s sortOrder=%s fgCode=%s source=%s',"), 'DETAIL ของ T2 ขึ้นต้นด้วยรหัสเครื่อง + เหตุ');
  assert.ok(raises('clear').includes("DETAIL = format('quotation_line_pack_cleared quotationId=%s lineId=%s packQty=%s',"), 'DETAIL ของ T3 ขึ้นต้นด้วยรหัสเครื่อง');
  assert.equal(occurrences(BODY, 'HINT = '), 2);
});

test('G7 — สิทธิ์: ถอนจากทุก role สามบรรทัด (PUBLIC · anon · authenticated · service_role) · ไม่มี GRANT · SECURITY INVOKER + search_path = public ทุกตัว · ตรวจท้ายและ SELECT ตรวจหลังรันถามครบสี่ role', () => {
  for (const key of KEYS) {
    assert.equal(occurrences(CODE, `REVOKE ALL ON FUNCTION public.${FN[key]}() FROM PUBLIC, anon, authenticated, service_role;`), 1, `${FN[key]}: ถอนจากทุก role (trigger ยิงได้โดยไม่ต้องมีสิทธิ์ EXECUTE)`);
    fnBody(key);
  }
  assert.equal(occurrences(CODE, 'REVOKE '), 3);
  assert.doesNotMatch(BARE, /\bGRANT\b/, 'ไม่ GRANT ใคร — ต่างจากแบบอย่างของ RPC (0336) โดยตั้งใจ: ฟังก์ชันของ trigger ไม่มีใครเรียกตรง');
  assert.equal(occurrences(CODE, 'SET search_path = public'), 3);
  const verify = flat(doBlock('verify'));
  assert.ok(verify.includes(`CROSS JOIN (VALUES ${ROLES}) AS r(role) WHERE n.nspname = 'public' AND p.proname = ANY (v_fns) AND has_function_privilege(r.role, p.oid, 'EXECUTE')) THEN RAISE EXCEPTION 'mig_0410_verify grant';`), '$verify$: สี่ role เรียกไม่ได้');
  assert.ok(verify.includes("AND p.pronargs = 0 AND p.prorettype = 'trigger'::regtype AND p.prolang = (SELECT l.oid FROM pg_language l WHERE l.lanname = 'plpgsql') AND NOT p.prosecdef AND p.proconfig = ARRAY['search_path=public'];"), '$verify$: คืน trigger · plpgsql · INVOKER · search_path');
  assert.ok(flat(VERIFY).includes(`CROSS JOIN (VALUES ${ROLES}) AS r(role)`), 'SELECT ตรวจหลังรัน (exec) ถามสี่ role เดียวกัน');
  assert.ok(flat(VERIFY).includes("AND NOT p.prosecdef AND p.proconfig = ARRAY['search_path=public']) AS fns,"));
});

test('ด่านก่อนรัน ($pre$): เจ็ดรหัสของหัวไฟล์ = เจ็ดรหัสที่ไฟล์โยน · ทุกด่านเป็น EXCEPTION · คอลัมน์สิบตัวเดียวกับตรวจก่อนรัน · ด่านข้อมูลสองตัวทำเฉพาะรันครั้งแรก · ยอมรับรายการได้เฉพาะรายการเต็มที่ตรงทุกตัวอักษร (พร้อม NOTICE) · error ส่งบรรทัด SET ให้', () => {
  const raised = [...new Set([...CODE.matchAll(/RAISE EXCEPTION '([a-z0-9_]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(raised, [...GATES].sort(), 'รหัสที่ไฟล์โยน');
  assert.deepEqual([...HEADER.matchAll(/\n--   (mig_0410_[a-z0-9_]+) {2,}\S/g)].map((m) => m[1]).sort(), raised, 'หัวไฟล์อธิบายรหัสครบและไม่เกิน (แถวละรหัส)');
  const pre = doBlock('pre');
  for (const [code, n] of [['mig_0410_needs_0407', 1], ['mig_0410_needs_columns', 1], ['mig_0410_needs_save_shape', 2], ['mig_0410_foreign_trigger', 1],
    ['mig_0410_mixed_lines', 1], ['mig_0410_revision_bare_lines', 1]]) {
    assert.equal(occurrences(pre, `RAISE EXCEPTION '${code} — `), n, `${code}: ต้องหยุดทั้งไฟล์ (RAISE EXCEPTION) ${n} ที่`);
  }
  assert.equal(occurrences(pre, 'RAISE NOTICE'), 2, 'NOTICE มีแค่สองบรรทัดของรายการที่ยอมรับแล้ว');
  const f = flat(pre);
  /* 0407 ต้องรันแล้ว: คอลัมน์ + CHECK สองตัวที่ตรวจแถวเดิมครบแล้ว */
  assert.ok(f.includes("AND column_name = 'packQty' AND data_type = 'integer') <> 1"));
  assert.ok(f.includes("c.contype = 'c' AND c.convalidated AND c.conname IN ('quotation_lines_pack_qty_range', 'quotation_lines_line_money_rule')) <> 2 THEN"));
  /* คอลัมน์ที่ trigger อ่าน = รายการเดียวกับช่อง cols ของตรวจก่อนรัน (สิบตัว) */
  const values = (text) => flat(/\(VALUES \('quotation_lines', 'id', 'text'\)[\s\S]*?\) AS e\(tbl, col, typ\)/.exec(text)?.[0] || '');
  assert.ok(values(pre).length > 0 && values(pre) === values(PREFLIGHT), 'คอลัมน์สิบตัวของด่าน = ของ SELECT ตรวจก่อนรัน');
  assert.equal(occurrences(values(pre), "('quotation"), 10);
  assert.ok(f.includes('IF v_n <> 10 THEN'));
  /* trigger ที่ไม่รู้จัก — ทุกรอบ */
  assert.ok(f.includes("WHERE t.tgrelid = 'public.quotation_lines'::regclass AND NOT t.tgisinternal AND NOT (t.tgname = ANY (v_trgs));"));
  /* ด่านข้อมูลสองตัว: เฉพาะรันครั้งแรก (= ยังไม่มี trigger ของไฟล์นี้) */
  assert.equal(occurrences(f, "IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.quotation_lines'::regclass AND t.tgname = ANY (v_trgs)) THEN"), 1, 'ด่าน mixed / rev_bare ทำเฉพาะรันครั้งแรก');
  order(f, ["IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.quotation_lines'::regclass AND t.tgname = ANY (v_trgs)) THEN",
    "'mixed=' || string_agg(x.num, ',' ORDER BY x.num)", "RAISE EXCEPTION 'mig_0410_mixed_lines — ",
    "'rev_bare=' || string_agg(x.num, ',' ORDER BY x.num)", "RAISE EXCEPTION 'mig_0410_revision_bare_lines — ", "PERFORM set_config('mig_0410.others'"], '$pre$');
  assert.ok(f.includes(`WHERE q."revisedFromId" IS NOT NULL AND EXISTS (SELECT 1 FROM public.quotation_lines l WHERE l."quotationId" = q.id AND l."packQty" IS NULL AND ${PRED('l.')} AND EXISTS (SELECT 1 FROM public.quotation_lines s WHERE s."quotationId" = q."revisedFromId" AND s."packQty" IS NOT NULL AND ${SAME('l.', 's.')}))) x;`), 'ด่าน Rev. = สิ่งที่ข้อ (ข) ของ T2 ปฏิเสธ');
  assert.ok(f.includes(`WHERE EXISTS (SELECT 1 FROM public.quotation_lines l WHERE l."quotationId" = q.id AND l."packQty" IS NOT NULL) AND EXISTS (SELECT 1 FROM public.quotation_lines l WHERE l."quotationId" = q.id AND l."packQty" IS NULL AND ${PRED('l.')})) x;`), 'ด่าน mixed = ใบที่ถือทั้งบรรทัดที่มีเลขแพ็คและบรรทัดหมวด 02-001 ที่ไม่มี');
  /* ยอมรับรายการ: ทั้งคำ (เว้นวรรคหัวท้าย) ตรงกับรายการเต็มของรอบนี้ — ใบเพิ่ม/หาย = หยุดเหมือนเดิม · ผ่านแล้วต้องพิมพ์รายการ */
  assert.ok(f.includes("v_accept constant text := ' ' || COALESCE(current_setting('app.mig_0410_accept', true), '') || ' ';"));
  assert.equal(occurrences(f, "IF v_n > 0 AND strpos(v_accept, ' ' || v_key || ' ') > 0 THEN"), 2, 'สองด่านยอมรับด้วยการเทียบทั้งคำ');
  assert.ok(f.includes("RAISE NOTICE 'mig_0410_mixed_lines ยอมรับแล้วด้วย app.mig_0410_accept — % ใบ (%)'"));
  assert.ok(f.includes("RAISE NOTICE 'mig_0410_revision_bare_lines ยอมรับแล้วด้วย app.mig_0410_accept — % ใบ (%)'"));
  assert.equal(occurrences(f, "วางบรรทัดนี้บนสุดของ RUN-0410.sql แล้วรันใหม่: SET app.mig_0410_accept = ''%'';'"), 2, 'error ของสองด่านส่งบรรทัด SET ให้');
  assert.equal(occurrences(f, 'btrim(v_accept || v_key)'), 2, 'บรรทัดที่ส่งให้ = ที่ยอมรับแล้ว + รายการของด่านนี้');
  assert.equal(occurrences(f, "'mixed=' || string_agg("), 1);
  assert.equal(occurrences(f, "'rev_bare=' || string_agg("), 1);
});

test('หัวไฟล์ — SELECT ตรวจก่อนรัน: อ่านอย่างเดียว คำสั่งเดียว 17 ช่อง · อ่าน "packQty" ผ่าน to_jsonb เท่านั้น (รันได้ทั้งก่อนและหลัง 0407) · บรรทัดเกณฑ์ก่อนรันครั้งแรก 11 ช่อง + ข้อมูลประกอบ 6 ช่อง = ทุกช่อง · ผลมีอายุ', () => {
  const bare = sqlText(PREFLIGHT, { blank: true });
  assert.doesNotMatch(bare, /\b(UPDATE|INSERT|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE|TRUNCATE|EXECUTE|PERFORM|DO|SET|CALL|COPY|LOCK|COMMENT|set_config)\b/, 'SELECT ของหัวไฟล์ต้องอ่านอย่างเดียว');
  assert.equal(occurrences(bare, ';'), 1, 'หนึ่งก้อน = หนึ่งคำสั่ง SELECT');
  const aliases = aliasesAtLineEnd(PREFLIGHT);
  assert.deepEqual(aliases, ['trg', 'ours_trg', 'ours_fn', 'm0407', 'cols', 'save_fns', 'save_shape', 'save_body', 'save_body_ws', 'save_md5', 'md5_expected',
    'mixed', 'rev_bare', 'mixed_list', 'rev_bare_list', 'packed_qt', 'pgver'], 'ช่องของ SELECT ตรวจก่อนรัน');
  const criteria = headerCriteria('เกณฑ์ก่อนรันครั้งแรก');
  assert.deepEqual(criteria, ['trg=0', 'ours_trg=0', 'ours_fn=0', 'm0407=3', 'cols=10', 'save_fns=1', 'save_shape=t', 'save_body=t', 'save_body_ws=t', 'mixed=0', 'rev_bare=0']);
  const info = ['save_md5', 'md5_expected', 'mixed_list', 'rev_bare_list', 'packed_qt', 'pgver'];
  assert.deepEqual([...criteria.map((c) => c.split('=')[0]), ...info].sort(), [...aliases].sort(), 'ทุกช่องเป็นเกณฑ์หรือข้อมูลประกอบ อย่างใดอย่างหนึ่ง');
  const infoText = HEADER.slice(HEADER.indexOf('--   ข้อมูลประกอบ (ไม่ใช่เกณฑ์): save_md5 / md5_expected'), HEADER.indexOf('--   ⛔ อย่ารัน'));
  for (const name of info) assert.ok(infoText.includes(name), `บรรทัด "ข้อมูลประกอบ" ต้องอธิบาย ${name}`);
  /* ฐานที่ยังไม่มีคอลัมน์ (ก่อน 0407) ก็ต้องตอบได้ — m0407 บอกเหตุแทน error */
  assert.doesNotMatch(PREFLIGHT, /\b[a-z]\."packQty"/, 'ตรวจก่อนรันอ่านเลขแพ็คผ่าน to_jsonb(x) ->> \'packQty\' เท่านั้น');
  assert.ok(PREFLIGHT.includes(`(SELECT 1 FROM public.quotation_lines s WHERE s."quotationId" = q."revisedFromId" AND to_jsonb(s) ->> 'packQty' IS NOT NULL`), 'rev_bare นับเฉพาะต้นทางที่มีเลขแพ็ค');
  assert.ok(PREFLIGHT.includes(`JOIN public.quotation_lines s ON s."quotationId" = q."revisedFromId" AND to_jsonb(s) ->> 'packQty' IS NOT NULL`), 'rev_bare_list นับเฉพาะต้นทางที่มีเลขแพ็ค');
  assert.equal(occurrences(PREFLIGHT, "to_jsonb(l) ->> 'packQty' IS NULL"), 4);
  assert.ok(PREFLIGHT.includes(`'${SAVE_MD5}'::text AS md5_expected,`));
  assert.ok(PREFLIGHT.includes("current_setting('server_version') AS pgver;"));
  order(HEADER, ['── ตรวจก่อนรัน (อ่านอย่างเดียว', '⛔ อย่ารัน แล้วแจ้งผู้พัฒนา เมื่อ:', 'save_body ≠ t = เนื้อของ save_quotation_content บนฐานไม่ใช่เนื้อที่พิสูจน์บนฮาร์เนส (ไฟล์ **ไม่** หยุดเองข้อนี้',
    'mixed ≠ 0 หรือ rev_bare ≠ 0 ขณะ ours_trg = 0 (ไฟล์หยุดเอง', '⏱ ผลแถวนี้มีอายุ'], 'หัวข้อตรวจก่อนรัน');
});

test('หัวไฟล์ — SELECT ตรวจหลังรัน: อ่านอย่างเดียว 8 ช่อง (save_md5 เป็นข้อมูลประกอบ) · บรรทัดเกณฑ์หลังรันทุกรอบ 7 ช่อง · ข้อยกเว้นที่ผู้พัฒนาตอบรับไว้กับแถวก่อนรันเท่านั้น', () => {
  const bare = sqlText(VERIFY, { blank: true });
  assert.doesNotMatch(bare, /\b(UPDATE|INSERT|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE|TRUNCATE|EXECUTE|PERFORM|DO|SET|CALL|COPY|LOCK|COMMENT|set_config)\b/);
  assert.equal(occurrences(bare, ';'), 1);
  const aliases = aliasesAtLineEnd(VERIFY);
  assert.deepEqual(aliases, ['trg', 'trg_ok', 'fns', 'exec', 'save_body', 'save_md5', 'mixed', 'rev_bare'], 'ช่องของ SELECT ตรวจหลังรัน');
  const criteria = headerCriteria('เกณฑ์หลังรันทุกรอบ');
  assert.deepEqual(criteria, ['trg=3', 'trg_ok=3', 'fns=3', 'exec=f', 'save_body=t', 'mixed=0', 'rev_bare=0']);
  assert.deepEqual([...criteria.map((c) => c.split('=')[0]), 'save_md5'].sort(), [...aliases].sort());
  assert.match(HEADER, /--   ข้อมูลประกอบ \(ไม่ใช่เกณฑ์\): save_md5 = md5 ของเนื้อ save_quotation_content บนฐาน — ต้องเท่ากับ save_md5 ของแถวตรวจก่อนรันในรอบนั่งเดียวกัน/);
  assert.ok(HEADER.includes('save_body = f ยอมได้เมื่อแถวตรวจก่อนรันก็ f และ save_md5 สองแถวเท่ากัน'), 'ข้อยกเว้น save_body');
  assert.ok(HEADER.includes('mixed / rev_bare ≠ 0 ยอมได้เมื่อเท่ากับแถวตรวจก่อนรันของรอบนั่งเดียวกัน'), 'ข้อยกเว้น mixed / rev_bare');
  /* หลังรัน คอลัมน์มีแล้ว — นับด้วย "packQty" ตรง ๆ ได้ · rev_bare นับเฉพาะต้นทางที่มีเลขแพ็คของสินค้าเดียวกัน */
  assert.ok(VERIFY.includes(`(SELECT 1 FROM public.quotation_lines s WHERE s."quotationId" = q."revisedFromId" AND s."packQty" IS NOT NULL`));
  assert.ok(VERIFY.includes("AND strpos(pg_get_triggerdef(t.oid), ' WHEN ') > 0) AS trg_ok,"), 'trg_ok ต้องเห็น WHEN ของทั้งสามตัว');
});

test('หัวไฟล์ — บล็อกถอยกลับ: ทรานแซกชันเดียว · lock_timeout 5s · trigger ก่อน ฟังก์ชันทีหลัง (สามต่อสาม) · NOTIFY · ลำดับกับ 0407 (2BP01 · ถอย 0410 ก่อนเสมอ) · ไม่ใช่ปฏิกิริยาแรก', () => {
  const undo = headerBlock('── ถอยกลับ', "NOTIFY pgrst, 'reload schema';");
  assert.deepEqual(undo, [
    'BEGIN;',
    "SET LOCAL lock_timeout = '5s';",
    ...KEYS.map((k) => `DROP TRIGGER IF EXISTS ${TRG[k]} ON public.quotation_lines;`),
    ...KEYS.map((k) => `DROP FUNCTION IF EXISTS public.${FN[k]}();`),
    'COMMIT;',
    "NOTIFY pgrst, 'reload schema';",
  ], 'บล็อกถอยกลับต้องเป็นสิบบรรทัดนี้ — ถอดของไฟล์นี้ครบ ไม่แตะอย่างอื่น');
  order(HEADER, ['── ถอยกลับ', 'ไฟล์นี้ไม่เขียนแถวข้อมูล', 'DROP TRIGGER ถือ ACCESS EXCLUSIVE จน COMMIT', 'ERROR 55P03 = ไม่มีอะไรเปลี่ยน รันใหม่ได้',
    'การรันไฟล์นี้ครั้งถัดไปนับเป็น "รันครั้งแรก" อีกรอบ', '⛔ ไม่ต้องถอยเพื่อแก้ข้อมูล — ใช้ทางออกข้างบน',
    '⚠️ ลำดับกับ 0407: บล็อกถอยของ 0407 (ALTER TABLE … DROP COLUMN "packQty") ขณะ trigger ของไฟล์นี้ยังอยู่ = ERROR 2BP01', '**ถอย 0410 ก่อนเสมอ** แล้วจึงถอย 0407'], 'หัวข้อถอยกลับ');
});

test('หัวไฟล์ — สิ่งที่ยามอ้างได้และอ้างไม่ได้: "การบันทึก / การออก Rev. ครั้งเดียว" · ทางสองการบันทึกอยู่ในหัวข้อ "ไม่ได้กัน" · ล็อกสองระดับ + 55P03 · ลำดับ deploy (รันได้ทุกเวลา · merge หลังรัน) · พื้นของการถอยแอป (G11)', () => {
  assert.ok(HEADER.includes('ฐานไม่รับ **การบันทึก / การออก Rev. ครั้งเดียว** ที่ทำเลขแพ็คของบรรทัดหมวด 02-001 **หาย** ไม่ว่าคำขอมาจากโค้ดรุ่นไหน'), 'บรรทัดที่ 3 อ้างแค่ "ครั้งเดียว"');
  assert.doesNotMatch(HEADER, /ฐานไม่รับการเขียนที่ทำ/, 'ห้ามอ้างเกินว่าปิดการทำหายทุกทาง');
  order(HEADER, ['── ตารางความจริง', 'ปฏิเสธ (P0001 · ไม่มีอะไรถูกบันทึก):', 'ผ่าน (เท่าเดิมทุกอย่าง', 'ไม่ได้กัน (นอกขอบเขตของยามบรรทัด',
    '· ข้ามทรานแซกชัน: การบันทึกหนึ่งเอาบรรทัดที่มีเลขแพ็คออก แล้วการบันทึกถัดไปเพิ่มสินค้านั้นกลับโดยไม่มีเลขแพ็ค — ผ่านทั้งสองครั้ง',
    'INSERT บรรทัดที่ไม่มีเลขแพ็คก่อน แล้วค่อย DELETE บรรทัดที่มีเลขแพ็ค', 'UPDATE ที่ทำให้บรรทัดกลายเป็นหมวด 02-001 ที่ไม่มีเลขแพ็ค',
    'Rev. ที่เปลี่ยนสินค้าหมวด 02-001 ที่มีเลขแพ็คเป็นสินค้าหมวด 02-001 ตัวอื่นที่ไม่มีเลขแพ็ค', 'TRUNCATE · session_replication_role = replica',
    'ไม่มีโค้ดแอปรุ่นไหนเขียนตารางนี้ในรูปลำดับ / CTE / MERGE / UPDATE / revisedFromId-ทีหลัง'], 'ตารางความจริงของหัวไฟล์');
  order(HEADER, ['── ลำดับ deploy (ไม่มี freeze · มติ G10)', 'เจ้าของรัน PREFLIGHT-0410.sql', 'รัน RUN-0410.sql ทั้งก้อน', '**รันได้ทุกเวลา ไม่ต้องหยุดคีย์งาน**',
    '· รันครั้งแรก = SHARE ROW EXCLUSIVE ของ CREATE TRIGGER', '· รันซ้ำ / บล็อกถอยกลับ = ACCESS EXCLUSIVE ของ DROP TRIGGER', '**การอ่านบรรทัดใบเสนอราคาก็รอด้วย**',
    "ไฟล์ตั้ง SET LOCAL lock_timeout = '5s'", 'ERROR 55P03 ทั้งไฟล์ถอย ไม่มีอะไรเปลี่ยน', '3) **หลัง** เจ้าของรันแล้วเท่านั้น: merge ไฟล์นี้ + เทสต์ + เอกสาร',
    'พื้นของการถอยแอป (ใบเสนอราคา — แทนประโยคที่ขัดกันใน DEPLOY.md · มติ G11):', '· ใบเสนอราคา: พื้นคือรุ่นของงวด PR-2 — ไม่เปลี่ยน',
    '· รุ่นก่อนงวด PR-5: บันทึกใบสั่งขายย้อนหลังไม่ได้ (0409 — ดัง ไม่ใช่ยอดผิด)',
    '· หลังไฟล์นี้: รุ่นก่อนงวด PR-1 ทำเลขแพ็คของใบเสนอราคาหาย **ในการบันทึก / การออก Rev. ครั้งเดียว** ไม่ได้อีก — ฐานปฏิเสธ ไม่มีอะไรถูกบันทึก',
    'แต่ลบบรรทัดในการบันทึกหนึ่งแล้วเพิ่มกลับในการบันทึกถัดไปยังผ่านเงียบ', '⇒ ยังไม่ใช่รุ่นที่ถอยไปได้'], 'ลำดับ deploy + พื้นของการถอยแอป');
  /* ยอมรับรายการ: บรรทัดตัวอย่างวางก่อน BEGIN ด้วย SET (ไม่ใช่ SET LOCAL) · เปิดแค่สองด่าน ไม่เปิดยาม */
  order(HEADER, ['── ยอมรับรายการของด่านรันครั้งแรก', "--      SET app.mig_0410_accept = 'mixed=QT-…,QT-… rev_bare=QT-…';", 'ยอมเฉพาะรายการที่ตรงทุกใบ',
    'ค่านี้เปิดแค่สองด่านนี้ของไฟล์นี้ ไม่เปิดยาม'], 'หัวข้อยอมรับรายการ');
  assert.match(HEADER, /⚠️ DDL — เจ้าของรันมือบน Supabase SQL Editor/);
  assert.match(HEADER, /✅ รันซ้ำได้/);
  assert.match(HEADER, /⛔ ไม่ backfill/);
});

/* 🔒 ตัวหนังสือของไฟล์ = ไบต์ที่ฮาร์เนสพิสูจน์ (harness-0410 57/57 สองรอบผลเหมือนกัน · mutate-0410 83 ตัว) และ = ไบต์ที่
     PREFLIGHT-0410.sql / RUN-0410.sql ถูกสร้างจากมัน (handoff-0410.mjs — RUN-0410.sql 688 บรรทัด ขึ้นต้นด้วย 649 บรรทัดนี้ทุกไบต์)
     · แก้ไฟล์ (แม้คอมเมนต์ — หัวไฟล์คือ SELECT / บล็อกถอย / บล็อกทางออกที่เจ้าของถือไว้ใช้) = รันฮาร์เนสสองรอบ · mutate · handoff ใหม่บนไบต์ใหม่
       แล้วย้ายหมุดในคอมมิตเดียวกัน
     · หลังเจ้าของรันไฟล์บนฐานจริงแล้ว **ห้ามแก้อีก** — SQL ที่ต้องเปลี่ยน = migration ใหม่ (trigger อยู่บนตาราง: DROP + CREATE ของไฟล์ใหม่) */
test('🔒 sha256 + จำนวนบรรทัด: ไฟล์ migration ต้องเท่าฉบับที่ฮาร์เนสพิสูจน์ทุกไบต์', () => {
  const bytes = readFileSync(new URL(FILE, MIGRATIONS));
  assert.equal(sha256(bytes), 'b11e80a3b8a041d3d11537e20c541765208786f10f5cc420166091002d532918',
    'แก้ 0410_quotation_line_pack_guard.sql = รัน harness-0410 (สองรอบ) · mutate-0410 · handoff-0410 ใหม่บนไบต์ใหม่ แล้วย้ายหมุดนี้ในคอมมิตเดียวกัน');
  const text = bytes.toString('utf8');
  assert.ok(text.endsWith(';\n'), 'ไฟล์จบด้วยขึ้นบรรทัดใหม่หนึ่งตัว');
  assert.equal(text.split('\n').length - 1, 649, '649 บรรทัด — RUN-0410.sql ขึ้นต้นด้วย 649 บรรทัดนี้ทุกไบต์');
});
