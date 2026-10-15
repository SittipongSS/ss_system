// ── ยามตัวหนังสือของ mig 0409 (ใบสั่งขายย้อนหลัง: "แพ็ค/เดือน" ของบรรทัด · งวด PR-5 ของช่องแพ็ค/เดือน) ─────────────────────────
//
// ⭐ 0409 **ไม่สร้างฟังก์ชัน** — ปะสี่ตัวที่รันอยู่จริงด้วย pg_get_functiondef (7 แถว · เติมอย่างเดียว · ป้าย 0409/…):
//      historical_so_check_lines       = 0379 + 0394/P4                    H1 ช่วงของเลขแพ็ค (หลวม: ไม่มีคีย์/null = คูณ 1) · H2 gross คูณแพ็ค
//      historical_so_write_children    = 0379 + 0394/P5 P6 P7c P7a P7b     W0 ทุกบรรทัดต้องพกเลขแพ็ค **ก่อน DELETE** · W1/W2 เก็บ "packQty"
//      submit_historical_sales_order   = 0374 + แถว 0382                   S1 แถวที่เก็บแล้วพกเลขแพ็คไปให้ตัวตรวจ
//      approve_historical_sales_order  = 0374 + แถว 0382 + 0394/P3         A1 เช่นเดียวกัน
//    ⇒ ยามนี้ประกอบเนื้อที่รันอยู่จากตัวหนังสือ repo แล้วล็อกว่า md5 เท่าค่าที่ฮาร์เนสพิสูจน์ (= หัวไฟล์ = ด่านเนื้อของ $verify$)
//      · anchor เจ็ดตัวเจอครั้งเดียวพอดีตามลำดับแถว · ปะแบบ JS แล้วได้เนื้อตัวเดียวกับที่ Postgres เก็บ · ถอดด้วยรูปถอยของหัวไฟล์ได้เนื้อเดิมทุกไบต์
// 🏭 ฐานจริง — แถวที่เจ้าของแปะจาก SQL Editor 12/10/2026 (mockups/qt-pack-column/PREFLIGHT-0409-A.result.md): md5 และความยาวของ
//    สี่ตัวบนฐานจริงเท่าค่าที่ยามนี้ประกอบได้ทุกตัว · ใบย้อนหลัง 4 ใบ ยกเลิกทั้งหมด · ยังไม่มีบรรทัดใบสั่งขายไหนมีเลขแพ็ค
// 🔴 ไฟล์ **ไม่เอ่ยข้อความ FUNCTION ตามด้วย public.** (แม้ในคอมเมนต์) ⇒ เจ้าของ "นิยามล่าสุด" ของสี่ตัวยังเป็น 0379 / 0379 / 0374 / 0374
//    · ไฟล์หลังจากนี้ที่นิยามตัวไหนทับทั้งก้อน = ยามนี้แดง (หมุดเจ้าของนิยาม — เนื้อที่ยามนี้ประกอบไม่ใช่เนื้อที่รันแล้ว)
//      และตัวสะดุดใน linePackMigration.test.mjs (T27) บังคับว่านิยามใหม่ต้องพกชิ้นของ 0409 ไปด้วย
// ⚠️ อ่าน **ตัวหนังสือ SQL** + ค่าคงที่สองชุดของ lib (ช่วง 1–9999 · ตารางข้อความไทยของรหัส) — ไม่ต่อฐานข้อมูล
// ⚠️ พฤติกรรมจริงพิสูจน์บนฮาร์เนส PGlite นอก repo (mockups/so-service-lines/pglite-harness/harness-0409.mjs — 55 กรณี รันสองรอบผลเหมือนกัน
//    · mutate-0409.mjs = ไฟล์ที่ทำผิดทีละข้อ 97 ตัว · TEXT_GUARD=1 = ทุกตัวต้องถูกจับด้วยเทสต์ในไฟล์นี้ที่ **ไม่ใช่** หมุด 🔒 sha256)
// ⚠️ ข้อ "ทุกรหัสที่ 0409 โยนมีข้อความไทย" แดงจนกว่า documentWorkflowErrors.js จะมีรหัสของ 0409 (จงใจ — กันรหัสใหม่หลุดไปเป็น 500 กลาง
//    · ท่าเดียวกับยาม 0394)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { WORKFLOW_ERROR_CODES } from './documentWorkflowErrors.js';
import { PACK_QTY_MAX, PACK_QTY_MIN } from './linePacks.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE = '0409_historical_so_line_pack_qty.sql';
const FILE_0407 = '0407_quotation_line_pack_qty.sql';
const cache = new Map();
const read = (name) => {
  if (!cache.has(name)) cache.set(name, readFileSync(new URL(name, MIGRATIONS), 'utf8'));
  return cache.get(name);
};
const migrationNames = () => readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort();
const md5 = (s) => createHash('md5').update(s).digest('hex');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const occurrences = (text, needle) => text.split(needle).length - 1;
const order = (text, needles, label) => {
  const at = needles.map((n) => text.indexOf(n));
  at.forEach((i, k) => assert.ok(i >= 0, `${label}: ไม่พบ ${needles[k]}`));
  for (let k = 1; k < at.length; k += 1) assert.ok(at[k - 1] < at[k], `${label}: ${needles[k - 1]} ต้องมาก่อน ${needles[k]}`);
};
const memo = (make) => { let value; let done = false; return () => { if (!done) { value = make(); done = true; } return value; }; };
/* คอมเมนต์แบบง่าย — ใช้ได้กับไฟล์ที่ "--" ไม่อยู่ในสตริง (0374 · 0379 · 0382 และการหาคำสั่ง CREATE ของทั้งโฟลเดอร์)
   🪤 ห้ามใช้กับตัวไฟล์ 0409: anchor ของ H1 คือบรรทัดคอมเมนต์ · ข้อความที่ปะและ needle ของตรวจท้ายขึ้นต้นด้วย "--" ⇒ ใช้ sqlText ข้างล่าง */
const stripLineComments = (sql) => sql.replace(/--[^\n]*/g, '');
const stripAllComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

/* ตัวหนังสือ SQL → คำสั่ง: ตัดคอมเมนต์ทั้งสองแบบ **นอกสตริง** · สตริง ('…' และ $re$ $rp$ $u$ $n$) คงไว้ทั้งก้อน หรือเหลือ '' (blank)
   · ป้ายของบล็อก DO ($pre$ $patch$ $verify$ $undo$) โปร่ง — ของข้างในคือคำสั่ง (ตัวเดียวกับ sqlCode ของฮาร์เนส) */
const DO_TAGS = Object.freeze(['pre', 'patch', 'verify', 'undo']);
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
const CODE = sqlText(BODY);                  // คอมเมนต์ออก · สตริงอยู่ครบ
const BARE = sqlText(BODY, { blank: true }); // คอมเมนต์ออก · สตริงทุกแบบเหลือ ''
const doBlock = (tag, text = CODE) => {
  const m = new RegExp(`DO \\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$;`).exec(text);
  assert.ok(m, `ไม่พบบล็อก DO $${tag}$`);
  return m[1];
};

const CHECK = 'historical_so_check_lines';
const WRITE = 'historical_so_write_children';
const SUBMIT = 'submit_historical_sales_order';
const APPROVE = 'approve_historical_sales_order';
const FNS = Object.freeze([CHECK, WRITE, SUBMIT, APPROVE]);
const TAG = Object.freeze({ [CHECK]: 'check', [WRITE]: 'write', [SUBMIT]: 'submit', [APPROVE]: 'approve' });
const LAST_DEFINER = Object.freeze({
  [CHECK]: '0379_historical_so_quote_lines.sql',
  [WRITE]: '0379_historical_so_quote_lines.sql',
  [SUBMIT]: '0374_historical_so_approval_flow.sql',
  [APPROVE]: '0374_historical_so_approval_flow.sql',
});
/* ไฟล์ก่อน 0409 ที่เอ่ยชื่อสี่ตัวนี้ในคำสั่ง (นอกคอมเมนต์) และทำอะไรกับมัน — มีไฟล์อื่นโผล่ = มีคนปะสี่ตัวนี้โดยยามนี้ไม่ได้ประกอบตาม */
const NAMERS = Object.freeze({
  '0374_historical_so_approval_flow.sql': 'นิยามทั้งสี่ตัว',
  '0379_historical_so_quote_lines.sql': 'นิยามตัวตรวจ + ตัวเขียนใหม่ทั้งก้อน',
  '0382_sales_role_hierarchy.sql': 'แถวตำแหน่งของขั้นส่ง / ขั้นอนุมัติ',
  '0394_historical_so_service_alignment.sql': 'P4 (ตัวตรวจ) · P5 P6 P7a P7b P7c (ตัวเขียน) · P3 (อนุมัติ)',
  '0404_so_service_setup_defer.sql': 'เอ่ยชื่อขั้นอนุมัติในรายการ "ไม่แตะ" ของตัวเองเท่านั้น',
});
/* md5 ของ prosrc — สามชุดที่ฮาร์เนส 0409 พิสูจน์ (README-0409.md · แผน IMPL_PLAN_PR5 §4.4) · ชุดแรก = md5_expected ของหัวไฟล์
   = ด่านเนื้อของ $verify$ = แถวที่เจ้าของแปะจากฐานจริง 12/10 · ค่าเปลี่ยน = เนื้อที่ฮาร์เนสพิสูจน์ไม่ใช่เนื้อนี้แล้ว ⇒ รันฮาร์เนสใหม่ก่อนแก้เลข */
const LIVE_MD5 = Object.freeze({
  [CHECK]: 'b86894c10dbecca2fcf496d4610c78e8',
  [WRITE]: 'b4c70bf11bf3d271e8338db65764a8b1',
  [SUBMIT]: '200d31946e8bad9bfd9ac11b5cb61359',
  [APPROVE]: 'aaf8001cfa106c20e5660376456ec7b2',
});
/* หลังลบ space/tab/CR/LF — ช่อง bodies_ws ของ SELECT ตรวจก่อนรัน (บอกได้ว่าต่างกันแค่ช่องว่างหรือเปล่า) */
const LIVE_MD5_WS = Object.freeze({
  [CHECK]: 'd4cfa48d9b4376adddd94d3c51a40215',
  [WRITE]: '673100c3fa3aa657cfcc6101b1ee1d3a',
  [SUBMIT]: 'ed54d6b36147ad84330f13a36bdd620d',
  [APPROVE]: 'd5f9ba4198aad421543cb4bb56820ff9',
});
/* หลัง 0409 — บรรทัด INFO ของฮาร์เนส (md5 ที่ Postgres คิดจากเนื้อที่มันเก็บหลังรันไฟล์จริง) */
const AFTER_MD5 = Object.freeze({
  [CHECK]: '6efb26f49587469af5359b48b05ee512',
  [WRITE]: 'd144d66427d33aeee740c6f2da5c737c',
  [SUBMIT]: 'fd8f2b58be0affaeec6343d4896abc8f',
  [APPROVE]: '1586d6a9fe43083dfe85e8a1e562a768',
});
/* จำนวนคำว่า packQty ในเนื้อหลังปะ — ตรวจท้ายของไฟล์และช่อง packs ของ SELECT ตรวจหลังรันนับแบบเดียวกัน */
const PACK_HITS = Object.freeze({ [CHECK]: 8, [WRITE]: 5, [SUBMIT]: 2, [APPROVE]: 2 });
const SIGNATURES = Object.freeze({
  [CHECK]: 'public.historical_so_check_lines(jsonb,text)',
  [WRITE]: 'public.historical_so_write_children(text,jsonb,jsonb,numeric,text,text)',
  [SUBMIT]: 'public.submit_historical_sales_order(text,timestamptz,text,text,text,jsonb)',
  [APPROVE]: 'public.approve_historical_sales_order(text,timestamptz,text,text,text,text,text,uuid,text,text,integer)',
});
/* service_role: เรียก RPC ส่ง/อนุมัติได้ · ตัวช่วยสองตัวไม่ได้ (0374/0379 ถอนไว้ — ผู้เรียกคือ RPC แบบ SECURITY DEFINER) */
const SERVICE_ROLE = Object.freeze({ [CHECK]: false, [WRITE]: false, [SUBMIT]: true, [APPROVE]: true });
const ROW_ORDER = Object.freeze([['H1', CHECK], ['H2', CHECK], ['W0', WRITE], ['W1', WRITE], ['W2', WRITE], ['S1', SUBMIT], ['A1', APPROVE]]);
const BLOCK_ROWS = new Set(['H1', 'W0']); // ปะเป็นบล็อก "-- 0409/xx ▶ … ◀" · ที่เหลือปะในบรรทัด "/* 0409/xx */"
/* ของที่แถวในบรรทัดเติม (ข้อความใหม่ = \1 + ของนี้ + \2) */
const INSERTED = Object.freeze({
  H2: `COALESCE((v_item->>'packQty')::numeric, 1) * /* 0409/H2 */ `,
  W1: `, "packQty" /* 0409/W1 */`,
  W2: `, (e.l->>'packQty')::numeric::integer /* 0409/W2 */`,
  S1: `, 'packQty', l."packQty" /* 0409/S1 */`,
  A1: `, 'packQty', l."packQty" /* 0409/A1 */`,
});
const needleOf = (label) => (BLOCK_ROWS.has(label) ? `-- 0409/${label} ▶` : `/* 0409/${label} */`);
const DELETE_INSTALLMENTS = 'DELETE FROM public.sales_order_installments WHERE "salesOrderId" = p_order_id;';
const IN_FLIGHT = `o.origin = 'historical' AND o.status IN ('draft', 'pending_approval', 'rejected')`;
/* "แพตช์เดิมครบ" — เงื่อนไขเดียวกันสามที่: ด่านก่อนรัน · SELECT ตรวจก่อนรัน · SELECT ตรวจหลังรัน */
const CHAIN_NEEDLES = Object.freeze({
  [CHECK]: ['0394/P4'],
  [WRITE]: ['0394/P5', '0394/P6', '0394/P7a', '0394/P7b', '0394/P7c'],
  [SUBMIT]: ['NOT public.is_sales_keyer_role(p_actor_role)'],
  [APPROVE]: ['NOT public.is_sales_manager_role(p_actor_role)', '0394/P3'],
});
const CHAIN_COND = `(${FNS.map((fn) => `(p.proname = '${fn}' AND ${CHAIN_NEEDLES[fn].map((n) => `strpos(p.prosrc, '${n}') > 0`).join(' AND ')})`).join(' OR ')})`;
const FNS_ARRAY = `v_fns constant text[] := ARRAY['${FNS.join("', '")}'];`;

/* แถวปะ (VALUES ของ DO $patch$): [ชื่อฟังก์ชัน, anchor, ข้อความใหม่, ป้าย] — อ่านจากตัวดิบ (ข้อความใหม่มีคอมเมนต์เป็นเนื้อของฟังก์ชัน) */
const PATCH_ROW_RE = /\('([a-z_0-9]+)',\s*\$re\$([\s\S]*?)\$re\$,\s*\$rp\$([\s\S]*?)\$rp\$,\s*'([^']+)'\)/g;
const patchRows = (sql) => [...sql.matchAll(PATCH_ROW_RE)]
  .map((m) => ({ fn: m[1], anchor: m[2], replacement: m[3], marker: m[4], label: m[4].replace(/^\d{4}\//, '') }));
const rows = memo(() => patchRows(doBlock('patch', BODY)));
/* ARE ของ Postgres → RegExp ของ JS (anchor ใช้แค่ \s \( \) \. \* \| \{ \} ซึ่งความหมายตรงกัน) · \1 \2 ของ regexp_replace → $1 $2
   · regexp_replace ไม่มีแฟล็ก g = แทนตัวแรก ⇒ new RegExp(anchor) ไม่มี g */
const hits = (text, are, flags = 'g') => [...text.matchAll(new RegExp(are, flags))].length;
const toJsReplacement = (rp) => rp.replace(/\$/g, '$$$$').replace(/\\([1-9])/g, '$$$1');
const replaceOnce = (text, oldExpr, newExpr, label) => {
  assert.equal(occurrences(text, oldExpr), 1, `${label}: ข้อความเดิมต้องเจอครั้งเดียวพอดี`);
  return text.replace(oldExpr, () => newExpr);
};
/* ปะหนึ่งแถวลงทั้งเนื้อ (prosrc) และทั้งบล็อก CREATE (≈ pg_get_functiondef) — คืนจำนวนที่ anchor เจอ "ก่อน" ปะ */
function applyRow(texts, row) {
  const t = texts[row.fn];
  const seen = { label: row.label, body: hits(t.body, row.anchor), full: hits(t.full, row.anchor), markerBefore: occurrences(t.body, row.marker) };
  t.body = t.body.replace(new RegExp(row.anchor), toJsReplacement(row.replacement));
  t.full = t.full.replace(new RegExp(row.anchor), toJsReplacement(row.replacement));
  return seen;
}

/* นิยามในไฟล์ repo: full = ตั้งแต่ CREATE ถึง $$; · body = ข้อความระหว่าง AS $$ กับ $$ ปิด เหมือนที่ Postgres เก็บเป็น prosrc */
function functionBlock(file, fn) {
  const sql = read(file);
  const from = sql.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  assert.ok(from >= 0, `${file}: ไม่พบนิยาม ${fn}`);
  const open = sql.indexOf('AS $$', from);
  const to = sql.indexOf('\n$$;', open);
  assert.ok(open > from && to > open, `${file}: หาเนื้อของ ${fn} ไม่เจอ`);
  return { full: sql.slice(from, to + 4), body: sql.slice(open + 5, to + 1) };
}
/* เนื้อที่รันอยู่จริงก่อน 0409 = นิยามล่าสุดใน repo + แพตช์ที่ไฟล์หลังจากนั้นปะไว้ ตามลำดับไฟล์
   · ตัวตรวจ / ตัวเขียน = 0379 + แถวของ 0394 (P4 · P5 P6 P7c P7a P7b) · ขั้นส่ง = 0374 + แถวตำแหน่งของ 0382
   · ขั้นอนุมัติ = 0374 + แถวตำแหน่งของ 0382 + 0394/P3 (0395 ปะแค่ RPC สร้าง/แก้ — ไม่ใช่สี่ตัวนี้) */
function buildLive() {
  const out = {};
  for (const fn of FNS) out[fn] = functionBlock(LAST_DEFINER[fn], fn);
  const code0382 = stripLineComments(read('0382_sales_role_hierarchy.sql'));
  for (const fn of [SUBMIT, APPROVE]) {
    const m = new RegExp(`\\('${fn}',\\s*\\$o\\$([\\s\\S]*?)\\$o\\$,\\s*\\$n\\$([\\s\\S]*?)\\$n\\$\\)`).exec(code0382);
    assert.ok(m, `0382 ต้องมีแถวของ ${fn}`);
    out[fn] = { full: replaceOnce(out[fn].full, m[1], m[2], `0382 ${fn}`), body: replaceOnce(out[fn].body, m[1], m[2], `0382 ${fn}`) };
  }
  const rows0394 = patchRows(doBlock('patch', read('0394_historical_so_service_alignment.sql'))).filter((r) => FNS.includes(r.fn));
  assert.deepEqual(rows0394.map((r) => `${r.label}|${r.fn}`), [`P4|${CHECK}`, `P5|${WRITE}`, `P6|${WRITE}`, `P7c|${WRITE}`, `P7a|${WRITE}`, `P7b|${WRITE}`, `P3|${APPROVE}`],
    '0394 ต้องมีแถวปะของสามตัวนี้เจ็ดแถว ตามลำดับเดิม');
  for (const row of rows0394) {
    const seen = applyRow(out, row);
    assert.deepEqual([seen.body, seen.full], [1, 1], `0394/${row.label}: anchor ต้องเจอครั้งเดียวพอดีในเนื้อของ ${row.fn}`);
  }
  return out;
}
const clone = (texts) => Object.fromEntries(Object.entries(texts).map(([fn, t]) => [fn, { ...t }]));
const live = memo(buildLive);
/* ปะเจ็ดแถวของ 0409 ตามลำดับของไฟล์ บนข้อความที่โตทีละแถว (เหมือนวงของไฟล์ — แถวถัดไปอ่านนิยามที่แถวก่อนเพิ่งเขียน) */
const applied = memo(() => {
  const texts = clone(live());
  const seen = rows().map((row) => applyRow(texts, row));
  return { texts, seen };
});
const anchorCounts = (texts) => [...rows()].sort((a, b) => a.label.localeCompare(b.label)).map((r) => `${r.label}=${hits(texts[r.fn].body, r.anchor)}`).join(' ');

/* ── SELECT สองก้อน + บล็อกถอยกลับ + บรรทัดเกณฑ์ของหัวไฟล์ (เจ้าของแปะรันตามตัวอักษร · ฮาร์เนสรันสามก้อนนี้ตามตัวอักษรเช่นกัน) ── */
function headerSelect(title) {
  const at = HEADER.indexOf(title);
  assert.ok(at >= 0, `หัวไฟล์ต้องมีหัวข้อ ${title}`);
  const from = HEADER.indexOf('--   SELECT', at);
  assert.ok(from > at, `${title}: ไม่พบ SELECT`);
  const lines = [];
  for (const line of HEADER.slice(from).split('\n')) {
    lines.push(line.replace(/^--\s?/, ''));
    if (line.trimEnd().endsWith(';')) break;
  }
  return lines.join('\n');
}
const preflight = memo(() => headerSelect('── ตรวจก่อนรัน'));
const verifySelect = memo(() => headerSelect('── ตรวจหลังรัน'));
const undoBlock = memo(() => {
  const from = HEADER.indexOf('BEGIN;\n--      DO $undo$');
  const end = "NOTIFY pgrst, 'reload schema';";
  const to = HEADER.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'หัวไฟล์ต้องมีบล็อกถอยกลับ BEGIN; DO $undo$ … NOTIFY');
  return HEADER.slice(from, to + end.length).split('\n').map((l) => l.replace(/^--\s{0,6}/, '')).join('\n');
});
/* บรรทัดเกณฑ์ "--   <ป้าย>: k = v · k = v" + บรรทัดต่อที่ขึ้นต้นด้วย "·" → [[k, v], …] — เกณฑ์คือสิ่งที่ใช้ตัดสินว่ารันได้/รันผ่าน
   ช่องอื่นของ SELECT เป็น "ข้อมูลประกอบ" (รีวิว 12/10: in_flight · packed_hist เป็น 0 เฉพาะรันครั้งแรกสุด) */
function headerCriteria(label) {
  const lines = HEADER.split('\n');
  const at = lines.findIndex((l) => l.startsWith(`--   ${label}: `));
  assert.ok(at >= 0, `หัวไฟล์ต้องมีบรรทัด "${label}:"`);
  let text = lines[at].slice(`--   ${label}: `.length);
  for (let i = at + 1; /^--\s+· /.test(lines[i] || ''); i += 1) text += ` ${lines[i].replace(/^--\s+/, '')}`;
  return text.split(' · ').map((x) => x.trim()).filter(Boolean).map((pair) => pair.replace(' = ', '='));
}
/* ชื่อช่องของ SELECT ชั้นนอก — "AS ชื่อ" ที่ต้นทางอยู่ต้นบรรทัดระดับช่อง (เว้น 3–4 ช่อง) หรือปิดวงเล็บของช่องนั้น */
const aliasesAtLineEnd = (sql) => [...sql.matchAll(/\bAS ([a-z0-9_]+)[,;]?[ \t]*$/gm)].map((m) => m[1]);
/* สองรูปที่ถอด "ของที่ 0409 เติม" ออกจาก prosrc — ตัวเดียวกันสองที่: SELECT ตรวจก่อนรัน (md5_live) · ด่านเนื้อของ $verify$
   รูปแรกไม่มีแฟล็ก (บล็อก H1 / W0 — จุดของ ARE กินขึ้นบรรทัดใหม่ ⇒ แฟล็ก s ของ JS) · รูปที่สองแฟล็ก g (ของที่ปะในบรรทัด) */
const stripPatterns = (sql) => [...sql.matchAll(/\$u\$([\s\S]*?)\$u\$/g)].map((m) => m[1]);
const stripOwn = (src, [blocks, inline]) => src.replace(new RegExp(blocks, 's'), '').replace(new RegExp(inline, 'g'), '');
/* จำนวนรายการระดับบนสุดของรายการที่คั่นด้วยจุลภาค (วงเล็บ/เครื่องหมายคำพูดซ้อน) */
function topLevelCount(list) {
  let depth = 0; let quote = null; let n = 1;
  for (const ch of list) {
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '(') depth += 1; else if (ch === ')') depth -= 1; else if (ch === ',' && depth === 0) n += 1;
  }
  return n;
}
const definesFn = (sql, fn) => new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fn}\\s*\\(`, 'i').test(stripAllComments(sql));

/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

test('0409: ทรานแซกชันเดียว · รูปไฟล์ BEGIN → DO (ด่าน) → DO (ปะ) → COMMENT ON COLUMN → DO (ตรวจท้าย) → COMMIT → NOTIFY · ไม่สร้าง/ไม่ลบ/ไม่ให้สิทธิ์/ไม่เขียนแถวข้อมูล · EXECUTE เดียว', () => {
  assert.equal(occurrences(RAW, '\nBEGIN;\n'), 1, 'BEGIN; ชั้นนอกครั้งเดียว');
  assert.equal(occurrences(RAW, '\nCOMMIT;\n'), 1, 'COMMIT; ครั้งเดียว');
  /* นอกบล็อก DO เหลือแค่โครงนี้ — ไม่มีคำสั่งชั้นนอกตัวอื่น (GRANT · ALTER · UPDATE …) และ NOTIFY อยู่หลัง COMMIT */
  const outsideDo = BARE.replace(/\$([a-z]+)\$[\s\S]*?\$\1\$/g, '');
  assert.match(outsideDo, /^\s*BEGIN;\s*DO ;\s*DO ;\s*COMMENT ON COLUMN public\.sales_order_lines\."packQty" IS\s*'';\s*DO ;\s*COMMIT;\s*NOTIFY pgrst, '';\s*$/,
    'รูปไฟล์: BEGIN → DO $pre$ → DO $patch$ → COMMENT ON COLUMN → DO $verify$ → COMMIT → NOTIFY pgrst');
  order(CODE, ['DO $pre$', '$pre$;', 'DO $patch$', '$patch$;', 'COMMENT ON COLUMN public.sales_order_lines."packQty" IS', 'DO $verify$', '$verify$;',
    '\nCOMMIT;', "NOTIFY pgrst, 'reload schema';"], 'ลำดับของไฟล์');
  /* 🔴 ไม่มี CREATE ใด ๆ — สี่ฟังก์ชันถูกปะผ่าน EXECUTE ของข้อความจาก pg_get_functiondef เท่านั้น (เก็บเจ้าของ · สิทธิ์ · SECURITY · search_path) */
  assert.doesNotMatch(BARE, /\bCREATE\b/i, 'ไฟล์นี้ไม่สร้างฟังก์ชัน/ตาราง/trigger/index');
  assert.doesNotMatch(BARE, /\b(ALTER|DROP|TRUNCATE)\b/i, 'ไม่มีคอลัมน์/CHECK ใหม่ ไม่ลบอะไร — check:columns ไม่แดง');
  assert.doesNotMatch(BARE, /\b(GRANT|REVOKE)\b/i, 'สิทธิ์เดินไปกับ CREATE OR REPLACE ของ pg_get_functiondef — ไฟล์ไม่แตะสิทธิ์');
  assert.doesNotMatch(BARE, /\b(UPDATE|INSERT|DELETE|MERGE|COPY)\b/, 'ไม่ backfill: ไม่มีคำสั่งเขียน/ลบแถวข้อมูล (บรรทัดใบย้อนหลังเดิมเป็น NULL เท่าเดิม)');
  assert.doesNotMatch(BARE, /\b(TEMP|TEMPORARY)\b/i, 'ไม่มีตารางชั่วคราว — ลายนิ้วมือเก็บด้วย set_config');
  assert.doesNotMatch(BARE, /SECURITY\s+DEFINER/i);
  assert.equal(occurrences(BARE, 'EXECUTE '), 1, 'EXECUTE เดียวของไฟล์ = นิยามที่ปะแล้ว');
  assert.equal(occurrences(CODE, 'EXECUTE regexp_replace(v_def, r.anchor, r.replacement);'), 1, 'แทนครั้งเดียว (ไม่มีแฟล็ก g) จากข้อความของ pg_get_functiondef');
  /* ตัวแปรสามตัวเป็นของทรานแซกชัน (อาร์กิวเมนต์ที่สาม = true) — ไม่ค้างในเซสชันของ SQL Editor */
  assert.equal(occurrences(CODE, 'PERFORM set_config('), 3);
  assert.equal(occurrences(flat(doBlock('pre')), '), true);'), 3, 'mig_0409.others · mig_0409.meta · mig_0409.todo ต้องเป็น is_local = true');
  /* คำอธิบายคอลัมน์: ของ 0407 บอกว่า "ใบสั่งขายย้อนหลังเป็น NULL เสมอ" — ไม่จริงอีกแล้ว (0407 ถูกตรึง sha จึงเขียนทับจากไฟล์นี้) */
  const note = /COMMENT ON COLUMN public\.sales_order_lines\."packQty" IS\n {2}'([^']*)';\n/.exec(CODE);
  assert.ok(note, 'COMMENT ON COLUMN ของ sales_order_lines."packQty" หนึ่งคำสั่ง ข้อความเดียว');
  assert.equal(occurrences(CODE, 'COMMENT ON'), 1);
  for (const part of ['ใบจากใบเสนอราคา: สำเนาจากบรรทัดใบเสนอราคาที่รับแล้ว', 'ใบสั่งขายย้อนหลัง: เลขที่คีย์ในฟอร์ม ตัวเขียนบรรทัดบังคับทุกบรรทัด (จำนวนเต็ม 1–9999) ตั้งแต่ 0409',
    'บรรทัดที่บันทึกก่อนนั้นเป็น NULL', 'NULL = คูณ 1', '(0407 · 0409)']) {
    assert.ok(note[1].includes(part), `คำอธิบายคอลัมน์ต้องบอก: ${part}`);
  }
  assert.doesNotMatch(note[1], /ใบสั่งขายย้อนหลังเป็น NULL เสมอ/, 'ข้อความของ 0407 ต้องไม่กลับมา');
});

test('🔴 ไฟล์ไม่เอ่ยข้อความ FUNCTION ตามด้วย public. เลย (แม้ในคอมเมนต์) — เจ้าของ "นิยามล่าสุด" ของสี่ตัวทั้งโฟลเดอร์ยังเป็น 0379 / 0379 / 0374 / 0374', () => {
  assert.doesNotMatch(RAW, /FUNCTION\s+public\./, 'ยาม "นิยามล่าสุด" ของเทสต์อื่นหาเจ้าของนิยามด้วยข้อความนี้');
  /* 🪤 หมุดเจ้าของนิยาม — นับ **ทั้งโฟลเดอร์** (ไฟล์หลัง 0409 ด้วย): ไฟล์ใหม่นิยามตัวไหนทับทั้งก้อน = แดงที่นี่ทันที
     ไม่ปล่อยให้ยามนี้อ่านเนื้อที่ไม่ได้รันแล้วและเขียวตลอด · ยาม 0394 ตรึงอนุมัติ/ตัวตรวจ/ตัวเขียน แต่ **ไม่ได้ตรึงขั้นส่ง** (รีวิว 12/10 · F2)
     สองท่า: (ก) ข้อความตรงตัวแม้ในคอมเมนต์ — ท่าของยาม 0374 / 0379 / 0394  (ข) คำสั่งจริง ตัดคอมเมนต์ ไม่สนตัวพิมพ์ */
  const names = migrationNames();
  for (const fn of FNS) {
    const literal = names.filter((n) => read(n).includes(`CREATE OR REPLACE FUNCTION public.${fn}(`));
    assert.equal(literal.at(-1), LAST_DEFINER[fn], `${fn}: ไฟล์สุดท้ายที่มีข้อความนิยามต้องเป็น ${LAST_DEFINER[fn]} — ไฟล์ใหม่ที่นิยามทับต้องพกชิ้นของ 0409 (T27) และย้ายยามนี้ไปอ่านนิยามนั้น`);
    const defining = names.filter((n) => definesFn(read(n), fn));
    assert.equal(defining.at(-1), LAST_DEFINER[fn], `${fn}: นิยามเต็มล่าสุดต้องเป็น ${LAST_DEFINER[fn]}`);
  }
  /* ก่อน 0409: ไฟล์ที่เอ่ยชื่อสี่ตัวนี้ในคำสั่งมีแค่ห้าไฟล์ที่ยามนี้ประกอบตาม (หรือรู้ว่าไม่แตะเนื้อ) */
  const namers = names.filter((n) => n < FILE && FNS.some((fn) => stripAllComments(read(n)).includes(fn)));
  assert.deepEqual(namers, Object.keys(NAMERS), 'มีไฟล์อื่นเอ่ยชื่อฟังก์ชันใบย้อนหลังสี่ตัวนี้ — เนื้อที่รันอยู่อาจไม่ใช่เนื้อที่ยามนี้ประกอบ');
  /* ชื่อฟังก์ชันอยู่ในตัวไฟล์เป็นสตริงเท่านั้น: 'ชื่อ' หรือลายเซ็นเต็มของ has_function_privilege */
  for (const fn of FNS) {
    const bare = [...CODE.matchAll(new RegExp(`(.)(?:public\\.)?${fn}(.)`, 'g'))];
    assert.ok(bare.length > 0);
    for (const m of bare) assert.ok(m[1] === "'" && (m[2] === "'" || m[2] === '('), `${fn}: ต้องอ้างเป็นสตริงเท่านั้น (เจอ ${m[0]})`);
  }
  /* ก่อน 0409 มีแค่ 0407 ที่รู้จักคำว่า packQty (คอลัมน์ + กฎเงิน + ทางก๊อปสามตัว — ตั้งใจไม่แตะสี่ตัวของใบย้อนหลัง) */
  assert.deepEqual(names.filter((n) => n < FILE && read(n).includes('packQty')), [FILE_0407]);
});

test('แถวปะ: 7 แถวพอดีตามลำดับ H1 H2 W0 W1 W2 S1 A1 · ทุกแถว "เติม" (\\1 / \\2 คือข้อความเดิม) · ป้ายไม่ทับกัน · anchor เป็นข้อความตรงตัว · วงปะ = วงของ 0394/0407', () => {
  assert.deepEqual(rows().map((r) => [r.label, r.fn, r.marker]), ROW_ORDER.map(([label, fn]) => [label, fn, `0409/${label}`]));
  assert.equal(patchRows(BODY).length, 7, 'ไม่มีแถวปะนอกบล็อก DO $patch$');
  for (const row of rows()) {
    /* replacement ของ Postgres: อักขระพิเศษมีแค่ \1 \2 — backslash ตัวอื่นถูกกินเงียบ */
    assert.ok(!row.replacement.replace(/\\[12]/g, '').includes('\\'), `${row.label}: ข้อความใหม่มี backslash แปลก`);
    if (BLOCK_ROWS.has(row.label)) {
      /* บล็อก: เติม "ก่อน" anchor — ขึ้นต้นด้วยป้ายเปิด จบด้วยป้ายปิด + ขึ้นบรรทัด + \1 ⇒ ตีกลับก่อนถึงคำสั่งที่ anchor ชี้ */
      assert.ok(row.replacement.startsWith(`-- ${row.marker} ▶`), `${row.label}: บล็อกขึ้นต้นด้วยป้ายเปิด`);
      assert.match(row.replacement, new RegExp(`\\n\\s*-- ${row.marker} ◀\\n\\s*\\\\1$`), `${row.label}: ป้ายปิด แล้วตามด้วย \\1 เป็นของสุดท้าย`);
      assert.equal(occurrences(row.replacement, `-- ${row.marker} ▶`), 1);
      assert.equal(occurrences(row.replacement, `-- ${row.marker} ◀`), 1);
      assert.equal(occurrences(row.replacement, '\\1'), 1);
      assert.equal(occurrences(row.replacement, '\\2'), 0);
      assert.equal(new RegExp(`${row.anchor}|`).exec('').length - 1, 1, `${row.label}: anchor กลุ่มเดียว = ข้อความทั้งก้อนที่ถูกคืน`);
    } else {
      assert.equal(row.replacement, `\\1${INSERTED[row.label]}\\2`, `${row.label}: ข้อความใหม่ต้องเป็น \\1 + ของที่เติม + \\2`);
      assert.equal(new RegExp(`${row.anchor}|`).exec('').length - 1, 2, `${row.label}: anchor ต้องมีสองกลุ่ม (\\1 ก่อนจุดเติม · \\2 หลังจุดเติม)`);
      assert.ok(row.anchor.includes(')('), `${row.label}: สองกลุ่มต้องติดกัน — ไม่มีอะไรถูกกลืนระหว่างกลุ่ม`);
      assert.equal(occurrences(row.replacement, `/* ${row.marker} */`), 1);
    }
    assert.ok(row.anchor.startsWith('(') && row.anchor.endsWith(')'), `${row.label}: anchor ทั้งก้อนอยู่ในกลุ่ม (ไม่มีอะไรถูกลบ)`);
    /* anchor ห้ามมีตัวกวาด (จุด · [^…] · ตัวนับของอักขระทั่วไป) — ช่องว่างเท่านั้นที่ยืดได้ */
    assert.doesNotMatch(row.anchor.replace(/\\[.()|{}*]/g, ''), /\.|\[|\{\d/, `${row.label}: anchor ต้องเป็นข้อความตรงตัว (ยืดได้เฉพาะ \\s)`);
  }
  /* 🪤 ป้ายของแถวหนึ่งห้ามโผล่ในข้อความของแถวอื่น — ไม่งั้นวงเห็น "ปะไว้แล้ว" แล้วข้ามแถวนั้นเงียบ ๆ (คอลัมน์ที่ไม่มีค่า) */
  for (const a of rows()) {
    for (const b of rows()) if (a !== b) assert.ok(!b.replacement.includes(a.marker), `${b.label} พูดถึงป้าย ${a.marker}`);
  }
  /* S1 กับ A1 ใช้ anchor ตัวเดียวกัน (คนละฟังก์ชัน) — วงหาแถวด้วยชื่อฟังก์ชัน จึงไม่ปนกัน */
  assert.equal(rows().find((r) => r.label === 'S1').anchor, rows().find((r) => r.label === 'A1').anchor);
  const loop = flat(doBlock('patch'));
  order(loop, [
    ") AS t(fn, anchor, replacement, marker) LOOP SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = r.fn; IF v_n <> 1 THEN RAISE EXCEPTION 'mig_0409_patch_overload % count=%",
    "SELECT p.oid, p.prosrc INTO v_oid, v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = r.fn;",
    "IF strpos(v_src, r.marker) > 0 THEN RAISE NOTICE '0409: % % — ปะไว้แล้ว', r.marker, r.fn; CONTINUE; END IF;",
    'v_def := pg_get_functiondef(v_oid);',
    "SELECT count(*) INTO v_hits_src FROM regexp_matches(v_src, r.anchor, 'g');",
    "SELECT count(*) INTO v_hits_def FROM regexp_matches(v_def, r.anchor, 'g');",
    "IF v_hits_src <> 1 OR v_hits_def <> 1 THEN RAISE EXCEPTION 'mig_0409_patch_anchor % % hits=%/%",
    "', r.marker, r.fn, v_hits_src, v_hits_def; END IF; EXECUTE regexp_replace(v_def, r.anchor, r.replacement); RAISE NOTICE '0409: % % — ปะแล้ว', r.marker, r.fn; END LOOP; END",
  ], 'วงปะ');
});

test('H1 · W0: ช่วงของเลขแพ็ค 1–9999 = PACK_QTY_MIN/PACK_QTY_MAX = CHECK ของ 0407 · ต้องเป็นตัวเลข JSON จำนวนเต็ม · ตัวตรวจหลวม (ไม่มีคีย์/null = คูณ 1) · ตัวเขียนเข้มทุกบรรทัด · อ่านคีย์ด้วย ->> ทั้งสองตัว', () => {
  const h1 = flat(sqlText(rows().find((r) => r.label === 'H1').replacement));
  const w0 = flat(sqlText(rows().find((r) => r.label === 'W0').replacement));
  /* ตัวตรวจ (หลวม): มีคีย์และไม่ใช่ null ⇒ ต้องเป็น number · จำนวนเต็ม · ในช่วง — สตริง "2" / true / [2] ไม่ใช่ number จึงตีกลับ (ELSE true)
     ไม่มีคีย์ หรือเป็น null = ผ่าน (คูณ 1): ขั้นส่ง/อนุมัติประกอบแถวที่เก็บแล้ว และแถวที่บันทึกก่อน 0409 มาถึงเป็น "packQty": null */
  assert.equal(h1, "IF v_item ? 'packQty' AND jsonb_typeof(v_item->'packQty') <> 'null' AND ( CASE WHEN jsonb_typeof(v_item->'packQty') = 'number'"
    + " THEN (v_item->>'packQty')::numeric NOT BETWEEN 1 AND 9999 OR (v_item->>'packQty')::numeric <> trunc((v_item->>'packQty')::numeric) ELSE true END) THEN"
    + " RAISE EXCEPTION 'historical_so_line_pack_qty_invalid'; END IF; \\1", 'H1: ด่านช่วงของตัวตรวจ');
  /* ตัวเขียน (เข้ม · รูปเดียวกับ 0394/P5): ทุกบรรทัดของ p_lines — ไม่พกคีย์ · null · ไม่ใช่ number (v เป็น NULL) · เศษ · นอกช่วง = ตีกลับ
     ⇒ ฟอร์มรุ่นก่อนงวด PR-5 (ไม่ส่งคีย์) บันทึกใบย้อนหลังไม่ได้เลย: ดัง ไม่ใช่เขียนทับใบที่มีแพ็คด้วยยอดคูณ 1 เงียบ ๆ */
  assert.equal(w0, "IF EXISTS ( SELECT 1 FROM (SELECT CASE WHEN jsonb_typeof(e.l->'packQty') = 'number' THEN (e.l->>'packQty')::numeric END AS v"
    + ' FROM jsonb_array_elements(p_lines) AS e(l)) x WHERE x.v IS NULL OR x.v <> trunc(x.v) OR x.v < 1 OR x.v > 9999 ) THEN'
    + " RAISE EXCEPTION 'historical_so_line_pack_qty_invalid'; END IF; \\1", 'W0: ด่านเข้มของตัวเขียน');
  /* ตัวเลขเดียวกันสี่ที่: H1 · W0 · ค่าคงที่ฝั่ง JS (packQtyValue ของ linePacks.js) · CHECK ช่วงของ 0407 บน sales_order_lines */
  const [, lo1, hi1] = /NOT BETWEEN (\d+) AND (\d+)/.exec(h1);
  const [, lo0, hi0] = /x\.v < (\d+) OR x\.v > (\d+)/.exec(w0);
  const [, loChk, hiChk] = /ADD CONSTRAINT sales_order_lines_pack_qty_range CHECK \("packQty" IS NULL OR "packQty" BETWEEN (\d+) AND (\d+)\);/.exec(read(FILE_0407));
  assert.deepEqual([lo1, hi1], [String(PACK_QTY_MIN), String(PACK_QTY_MAX)], 'H1 = PACK_QTY_MIN / PACK_QTY_MAX');
  assert.deepEqual([lo0, hi0], [lo1, hi1], 'W0 = H1');
  assert.deepEqual([loChk, hiChk], [lo1, hi1], 'CHECK sales_order_lines_pack_qty_range ของ 0407 = ช่วงเดียวกัน');
  assert.deepEqual([PACK_QTY_MIN, PACK_QTY_MAX], [1, 9999]);
  /* สองรูปที่ยามคีย์ของ payload ฝั่ง JS (historicalOrderPlan.test.mjs) มองเห็น: v_item->>'packQty' · e.l->>'packQty' */
  const text = (fn) => rows().filter((r) => r.fn === fn).map((r) => r.replacement).join('\n');
  assert.ok(text(CHECK).includes("v_item->>'packQty'"), "ตัวตรวจอ่านคีย์ด้วย v_item->>'packQty'");
  assert.ok(text(WRITE).includes("e.l->>'packQty'"), "ตัวเขียนอ่านคีย์ด้วย e.l->>'packQty'");
  /* 🪤 "packsPerRound" (รอบละกี่แพ็ค · 0394) เป็นอีกตัวเลขหนึ่งของงานบริการ — ไม่คูณเงิน ไม่ถูกเก็บลง "packQty" · รหัสของมันก็คนละรหัส */
  for (const row of rows()) {
    assert.ok(!row.replacement.includes('packsPerRound'), `${row.label}: ห้ามอ่าน packsPerRound`);
    assert.ok(!row.replacement.includes('historical_so_line_packs_invalid'), `${row.label}: รหัสของ "รอบละกี่แพ็ค" ชี้ผู้คีย์ไปผิดช่อง`);
  }
});

test('🔴 เนื้อที่รันอยู่ของสี่ฟังก์ชัน (ตัวหนังสือ repo + แถว 0382 + แพตช์ 0394): md5 สามชุดเท่าที่ฮาร์เนสพิสูจน์ = หัวไฟล์ = ด่านเนื้อ · anchor เจ็ดตัวเจอครั้งเดียวทีละแถว · ปะแบบ JS ได้เนื้อที่ Postgres เก็บ · "packQty" 8/5/2/2', () => {
  const before = live();
  const verify = doBlock('verify');
  for (const fn of FNS) {
    assert.equal(md5(before[fn].body), LIVE_MD5[fn], `เนื้อของ ${fn} ใน repo ไม่ใช่เนื้อที่ฮาร์เนส 0409 พิสูจน์แล้ว — รันฮาร์เนสใหม่ก่อนแก้เลข`);
    assert.equal(md5(before[fn].body.replace(/[ \t\n\r]/g, '')), LIVE_MD5_WS[fn], `${fn}: md5 หลังลบช่องว่าง`);
    assert.equal(occurrences(preflight(), `'${TAG[fn]}', '${fn}', '${LIVE_MD5[fn]}', '${LIVE_MD5_WS[fn]}')`), 1, `หัวไฟล์ (bodies · bodies_ws) ต้องถือ md5 ของ ${fn} สองค่าเดียวกัน`);
    assert.equal(occurrences(verify, `('${fn}', '${LIVE_MD5[fn]}')`), 1, `ด่านเนื้อของ $verify$ ต้องถือ md5 ของ ${fn} ค่าเดียวกัน`);
    assert.equal(occurrences(before[fn].body, 'packQty'), 0, `ก่อน 0409 ${fn} ยังไม่รู้จัก packQty`);
    assert.equal(occurrences(before[fn].body, '0409/'), 0);
  }
  assert.ok(preflight().includes(`'${FNS.map((fn) => `${TAG[fn]}=${LIVE_MD5[fn]}`).join(' ')}'::text AS md5_expected,`), 'md5_expected ของหัวไฟล์ = สี่ค่าเดียวกัน เรียง ตัวตรวจ · ตัวเขียน · ส่ง · อนุมัติ');
  assert.equal(anchorCounts(before), 'A1=1 H1=1 H2=1 S1=1 W0=1 W1=1 W2=1', 'ช่อง anchors ของ SELECT ตรวจก่อนรัน — ก่อนรัน');

  const { texts: after, seen } = applied();
  assert.equal(seen.length, 7);
  for (const s of seen) {
    assert.equal(s.body, 1, `${s.label}: anchor ต้องเจอครั้งเดียวพอดีใน prosrc (หลังแถวก่อนหน้าปะแล้ว)`);
    assert.equal(s.full, 1, `${s.label}: anchor ต้องเจอครั้งเดียวพอดีทั้งบล็อก (≈ pg_get_functiondef)`);
    assert.equal(s.markerBefore, 0, `${s.label}: ป้ายต้องยังไม่มีก่อนปะ`);
  }
  for (const fn of FNS) {
    assert.equal(md5(after[fn].body), AFTER_MD5[fn], `${fn}: ปะแบบ JS แล้วต้องได้เนื้อตัวเดียวกับที่ Postgres เก็บหลังรันไฟล์ (บรรทัด INFO ของฮาร์เนส)`);
    assert.equal(occurrences(after[fn].body, 'packQty'), PACK_HITS[fn], `${fn}: จำนวน packQty หลังปะ`);
    const mine = rows().filter((r) => r.fn === fn);
    assert.equal(after[fn].body.length - before[fn].body.length, mine.reduce((n, r) => n + r.replacement.length - 2 * occurrences(r.replacement, '\\'), 0),
      `${fn}: เนื้อใหม่ยาวขึ้นเท่าของที่เติมพอดี — ไม่มีอะไรหาย`);
    assert.equal(after[fn].full.length - before[fn].full.length, after[fn].body.length - before[fn].body.length, `${fn}: นอกเนื้อไม่มีอะไรเปลี่ยน`);
  }
  for (const row of rows()) {
    const body = after[row.fn].body;
    if (BLOCK_ROWS.has(row.label)) {
      assert.equal(occurrences(body, `-- ${row.marker} ▶`), 1, `${row.label} ▶`);
      assert.equal(occurrences(body, `-- ${row.marker} ◀`), 1, `${row.label} ◀`);
    } else assert.equal(occurrences(body, `/* ${row.marker} */`), 1, `${row.label}: ป้ายครั้งเดียว`);
  }
  /* หลังปะ: anchor ของบล็อก (H1 · W0) ยังเจอ 1 (บล็อกอยู่หน้า anchor) · ของแถวในบรรทัดเหลือ 0 — ค่าที่หัวไฟล์สัญญาไว้ */
  assert.equal(anchorCounts(after), 'A1=0 H1=1 H2=0 S1=0 W0=1 W1=0 W2=0', 'ช่อง anchors ของ SELECT ตรวจก่อนรัน — หลังรัน');
  assert.ok(HEADER.includes(`anchors = ${anchorCounts(before)} · marks = 0`), 'เกณฑ์ก่อนรันของหัวไฟล์ = ค่าที่นับได้จากเนื้อก่อนปะ');
  assert.ok(HEADER.includes(`หลังรัน: SELECT เดียวกันต้องได้ anchors = ${anchorCounts(after)} · marks = 7`), 'ค่าหลังรันของหัวไฟล์ = ค่าที่นับได้จากเนื้อหลังปะ');
});

test('ของที่เติมลงถูกที่: ตัวตรวจ — ช่วงของเลขแพ็คก่อนสูตรเงิน · gross = round(COALESCE(แพ็ค, 1) × จำนวน × ราคา, 2) ปัดครั้งเดียว · ตัวเขียน — ด่านเข้มก่อน DELETE ตัวแรก · INSERT 19 คอลัมน์ = 19 ค่า · ขั้นส่ง/อนุมัติ — คีย์ที่เจ็ดของแถวที่เก็บแล้ว', () => {
  const { texts: after } = applied();
  const check = after[CHECK].body;
  /* ตัวตรวจ: ด่านรูปทรง → 0394/P4 → ด่านส่วนลด → บล็อก H1 → บรรทัด gross ที่คูณแพ็ค → ทางหลวม/ทางเข้ม → หมวด 02-001 */
  order(check, ['-- 0394/P4 ▶', '-- 0394/P4 ◀', "IF (v_dtype IS NOT NULL AND v_dtype NOT IN ('percent', 'amount'))", '-- 0409/H1 ▶', '-- 0409/H1 ◀',
    '-- สูตรเงินของใบเสนอราคา (quoteLineNet)',
    "v_line_gross := round(COALESCE((v_item->>'packQty')::numeric, 1) * /* 0409/H2 */ v_qty * v_unit_price, 2);",
    'IF v_damount IS NULL THEN', "IF v_line_total > v_line_gross + 0.01 THEN RAISE EXCEPTION 'historical_so_line_money_mismatch'; END IF;",
    "WHEN 'percent' THEN v_line_gross * v_dvalue / 100", "RAISE EXCEPTION 'historical_so_line_not_package';"], 'ตัวตรวจหลังปะ');
  /* ปัดครั้งเดียวหลังคูณสามตัว (= quoteLineNet ฝั่ง JS = CHECK sales_order_lines_line_money_rule ของ 0407) — ไม่มี round ซ้อนในบรรทัด gross
     · ส่วนลด % คิดจาก v_line_gross ที่คูณแพ็คแล้ว · ส่วนลดบาทไม่ถูกคูณ (บรรทัดของ 0379 ที่ไม่ถูกแตะ) */
  assert.equal(occurrences(check, 'v_line_gross := '), 1);
  assert.match(check, /v_line_gross := round\(COALESCE\(\(v_item->>'packQty'\)::numeric, 1\) \* \/\* 0409\/H2 \*\/ v_qty \* v_unit_price, 2\);\n/);
  assert.ok(read(FILE_0407).includes('round(COALESCE("packQty", 1) * qty * "unitPrice", 2)'), 'กฎเงินของ 0407 ปัดครั้งเดียวแบบเดียวกัน');
  /* ตัวเขียน: ด่านสถานะ → ด่านของ 0379 → 0394/P5 → 0394/P7c → บล็อก W0 → DELETE งวด → DELETE บรรทัด → INSERT บรรทัด (W1 · W2)
     ⇒ ตีกลับแล้วของเดิมอยู่ครบ (ฮาร์เนส W-3: 0 NOTICE ของ BEFORE DELETE ในแปดครั้งที่ถูกตีกลับ) */
  const write = after[WRITE].body;
  order(write, ["RAISE EXCEPTION 'historical_so_edit_state_invalid';", '-- 0394/P5 ▶', '-- 0394/P5 ◀', '-- 0394/P7c ▶', '-- 0394/P7c ◀', '-- 0409/W0 ▶', '-- 0409/W0 ◀',
    DELETE_INSTALLMENTS, 'DELETE FROM public.sales_order_lines', 'INSERT INTO public.sales_order_lines (', '/* 0409/W1 */', '/* 0409/W2 */',
    "IF v_inserted <> jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'historical_so_line_invalid'; END IF;", '-- 0394/P6 ▶'], 'ตัวเขียนหลังปะ');
  assert.ok(write.indexOf('-- 0409/W0 ◀') < write.search(/DELETE\s+FROM/), 'ด่านเข้มมาก่อน DELETE ตัวแรกของฟังก์ชัน');
  assert.match(write, /"serviceRounds", "sortOrder", metadata, "packQty" \/\* 0409\/W1 \*\/\n {2}\)\n {2}SELECT/);
  assert.match(write, /'\{\}'::jsonb, \(e\.l->>'packQty'\)::numeric::integer \/\* 0409\/W2 \*\/\n {2}FROM jsonb_array_elements\(p_lines\) WITH ORDINALITY AS e\(l, ord\)\n {2}JOIN public\.products p/);
  /* INSERT ของบรรทัด: จำนวนคอลัมน์ = จำนวนค่า หลังปะ (ใส่ข้างเดียว SQL พังตอนเรียก ไม่ใช่ตอนรันไฟล์) · "packQty" อยู่ท้ายทั้งสองรายการ */
  const plain = stripAllComments(write);
  const at = plain.indexOf('INSERT INTO public.sales_order_lines (');
  assert.ok(at > 0 && plain.indexOf('INSERT INTO public.sales_order_lines (', at + 1) < 0, 'INSERT ของบรรทัดมีที่เดียว');
  const cols = plain.slice(plain.indexOf('(', at) + 1, plain.indexOf(')', at));
  const selAt = plain.indexOf('SELECT', at);
  const values = plain.slice(selAt + 6, plain.indexOf('FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS e(l, ord)', selAt));
  assert.equal(topLevelCount(cols), 19, '18 คอลัมน์เดิมของ 0379 + "packQty"');
  assert.equal(topLevelCount(values), topLevelCount(cols), 'จำนวนคอลัมน์ของ INSERT ต้องเท่าจำนวนค่าที่ SELECT');
  assert.ok(cols.trim().endsWith('"packQty"'), '"packQty" อยู่ท้ายรายการคอลัมน์');
  assert.ok(values.trim().endsWith("(e.l->>'packQty')::numeric::integer"), 'ค่าของ "packQty" อยู่ท้ายรายการค่า — ผ่าน numeric ก่อน (2.0 / 2e0 เป็นจำนวนเต็มได้ ไม่ใช่ 22P02 ดิบ)');
  /* หน่วย: ตัวเขียนของ 0379 ใช้หน่วยจาก payload ก่อนหน่วยขายในทะเบียน — JS งวด PR-5 ส่ง "เดือน" (0409 ไม่แตะบรรทัดนี้) */
  assert.ok(write.includes("COALESCE(NULLIF(btrim(COALESCE(e.l->>'unit', '')), ''), NULLIF(btrim(p.\"saleUnit\"), ''), 'ชิ้น'),"));
  /* ขั้นส่ง / อนุมัติ: jsonb ของแถวที่เก็บแล้ว 6 คีย์เดิม + 'packQty' → ตัวตรวจได้เลขแพ็คของแถวจริง (คอลัมน์ว่าง = null = คูณ 1) */
  for (const [fn, label] of [[SUBMIT, 'S1'], [APPROVE, 'A1']]) {
    const body = flat(after[fn].body);
    assert.ok(body.includes(`'unitPrice', l."unitPrice", 'lineTotal', l."lineTotal", 'serviceRounds', l."serviceRounds", 'packQty', l."packQty" /* 0409/${label} */ ) ORDER BY l."sortOrder")`),
      `${fn}: 'packQty', l."packQty" ต่อท้ายคีย์ของแถวที่เก็บแล้ว`);
    assert.equal(occurrences(after[fn].body, 'jsonb_build_object('), occurrences(live()[fn].body, 'jsonb_build_object('));
    assert.equal(occurrences(after[fn].body, 'public.historical_so_check_lines('), 1, `${fn}: ยังเรียกตัวตรวจบรรทัดครั้งเดียว`);
  }
});

test('ด่านก่อนรัน ($pre$): สี่ฟังก์ชันตัวละหนึ่ง · 0407 ต้องรันแล้ว (คอลัมน์ + CHECK สองตัว validated) · แพตช์เดิมครบ · ใบย้อนหลังค้าง = หยุดเฉพาะรันครั้งแรก พร้อมเลขที่ใบ · รายการ "รอบนี้ปะ" = แถวปะ', () => {
  const pre = flat(doBlock('pre'));
  assert.ok(pre.includes(FNS_ARRAY) && flat(doBlock('verify')).includes(FNS_ARRAY), 'รายชื่อสี่ฟังก์ชันเดียวกันทั้งด่านก่อนรันและตรวจท้าย');
  order(pre, [
    "WHERE n.nspname = 'public' AND p.proname = ANY (v_fns); IF v_n <> 4 THEN RAISE EXCEPTION 'mig_0409_needs_functions",
    /* 0407: คอลัมน์ integer + CHECK ช่วง + กฎเงินของบรรทัดใบสั่งขาย — ต้อง validated ทั้งคู่ (ตัวเขียนที่ปะแล้วเขียนคอลัมน์นี้ · กฎเงินเป็นด่านสุดท้าย) */
    "IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_order_lines' AND column_name = 'packQty' AND data_type = 'integer')"
      + " OR (SELECT count(*) FROM pg_constraint c WHERE c.conrelid = 'public.sales_order_lines'::regclass AND c.contype = 'c' AND c.convalidated"
      + " AND c.conname IN ('sales_order_lines_pack_qty_range', 'sales_order_lines_line_money_rule')) <> 2 THEN RAISE EXCEPTION 'mig_0409_needs_0407",
    `SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND ${CHAIN_COND}; IF v_n <> 4 THEN RAISE EXCEPTION 'mig_0409_needs_chain`,
    /* รันครั้งแรก = ยังไม่มีป้ายของไฟล์นี้ในสี่ตัวนี้ **เลย** (หลังรัน 0379 พลาด S1/A1 ยังอยู่ ⇒ รอบกู้ไม่ถูกใบร่างรายวันขวาง · หลังบล็อกถอยกลับ = รันแรกอีกรอบ)
       ⇒ ห้ามมีใบย้อนหลังร่าง/รออนุมัติ/ตีกลับ: บรรทัดของมันไม่มีเลขแพ็ค · จำนวนมากกว่า 0 = เจ้าของตัดสินทีละใบ ไม่มีสวิตช์ข้าม */
    "IF NOT EXISTS ( SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = ANY (v_fns) AND p.prosrc ~ '0409/(H1|H2|W0|W1|W2|S1|A1)' ) THEN"
      + ` SELECT count(*) INTO v_n FROM public.sales_orders o WHERE ${IN_FLIGHT}; IF v_n > 0 THEN`
      + " SELECT string_agg(x.label, ' · ' ORDER BY x.label) INTO v_list FROM (SELECT o.\"orderNumber\" || ' ' || CASE o.status WHEN 'draft' THEN 'ร่าง' WHEN 'pending_approval' THEN 'รออนุมัติ' ELSE 'ตีกลับ' END AS label"
      + ` FROM public.sales_orders o WHERE ${IN_FLIGHT} ORDER BY 1 LIMIT 10) x; RAISE EXCEPTION 'mig_0409_historical_in_flight — ใบย้อนหลังที่ยังไม่อนุมัติ % ใบ (%)`,
    "บันทึกใบร่างซ้ำไม่ทำให้ผ่าน', v_n, v_list || CASE WHEN v_n > 10 THEN ' …' ELSE '' END; END IF; END IF;",
    "PERFORM set_config('mig_0409.others', (", "PERFORM set_config('mig_0409.meta', (", "PERFORM set_config('mig_0409.todo', (",
  ], 'ด่านก่อนรัน');
  /* ป้ายเจ็ดตัวของนิพจน์ "รันครั้งแรก" = ป้ายของแถวปะ */
  assert.equal(/p\.prosrc ~ '0409\/\(([A-Z0-9|]+)\)'/.exec(pre)[1], rows().map((r) => r.label).join('|'));
  /* เงื่อนไข "แพตช์เดิมครบ" เป็นจริงบนเนื้อที่ยามนี้ประกอบ (chain = 4) — ไม่ใช่แค่ข้อความตรงกัน */
  for (const fn of FNS) for (const needle of CHAIN_NEEDLES[fn]) assert.ok(live()[fn].body.includes(needle), `${fn}: เนื้อที่รันอยู่ต้องมี ${needle}`);
  /* รายการฟังก์ชันที่ "รอบนี้ปะ" (mig_0409.todo): คู่ (ฟังก์ชัน, ป้าย) ชุดเดียวกับแถวปะ · เข้ารายการเมื่อป้าย **ยังไม่มี** ในเนื้อ */
  const todo = /PERFORM set_config\('mig_0409\.todo', \(([\s\S]*?)\), true\);/.exec(pre);
  assert.ok(todo, "ต้องมี set_config('mig_0409.todo', …)");
  assert.deepEqual([...todo[1].matchAll(/\('([a-z_]+)', '(0409\/[A-Z][0-9])'\)/g)].map((m) => `${m[1]}|${m[2]}`), rows().map((r) => `${r.fn}|${r.marker}`));
  assert.ok(todo[1].includes("SELECT COALESCE(string_agg(DISTINCT m.fn, ',' ORDER BY m.fn), '') FROM (VALUES"));
  assert.ok(todo[1].includes(") AS m(fn, marker) JOIN pg_proc p ON p.proname = m.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public' WHERE strpos(p.prosrc, m.marker) = 0"));
});

test('ตรวจท้าย ($verify$): ทุกข้อความที่นับเจอตามจำนวนในเนื้อหลังปะจริง ("packQty" 8/5/2/2) · ลำดับด่าน · ฟังก์ชันอื่น/เมตาเทียบด้วยนิพจน์เดียวกับด่านก่อนรัน · สิทธิ์สี่ลายเซ็น · คำอธิบายคอลัมน์ · รหัสด่านของไฟล์เจ็ดตัว', () => {
  const verify = doBlock('verify');
  const v = flat(verify);
  const pre = flat(doBlock('pre'));
  const { texts: after } = applied();
  /* รายการ (ฟังก์ชัน, ข้อความ, จำนวน) ของตรวจท้าย — นับบนเนื้อที่ยามนี้ปะเอง: ตรงทุกแถว = ไฟล์ไม่ตีกลับตัวเองบนฐานที่ถูกต้อง
     และไม่ปล่อยของที่ปะผิดรูป (ข้อความที่นับคือรูปสุดท้ายของแต่ละจุดปะ) */
  const list = verify.slice(verify.indexOf('FOR r IN'), verify.indexOf(') AS t(fn, needle, expected)'));
  const needles = [...list.matchAll(/\('([a-z_]+)', (?:'((?:[^']|'')*)'|\$n\$([\s\S]*?)\$n\$), (\d+)\)/g)]
    .map((m) => ({ fn: m[1], needle: m[3] ?? m[2].replace(/''/g, "'"), expected: Number(m[4]) }));
  assert.equal(needles.length, 31, 'ตรวจท้ายนับ 31 ข้อความ');
  for (const n of needles) assert.equal(occurrences(after[n.fn].body, n.needle), n.expected, `ตรวจท้าย: "${n.needle}" ใน ${n.fn} ต้องเจอ ${n.expected} ครั้งในเนื้อหลังปะ`);
  const has = (fn, needle, expected = 1) => needles.some((n) => n.fn === fn && n.needle === needle && n.expected === expected);
  for (const fn of FNS) assert.ok(has(fn, 'packQty', PACK_HITS[fn]), `ตรวจท้ายต้องนับ packQty ของ ${fn} = ${PACK_HITS[fn]}`);
  for (const row of rows()) {
    if (BLOCK_ROWS.has(row.label)) assert.ok(has(row.fn, `-- ${row.marker} ▶`) && has(row.fn, `-- ${row.marker} ◀`), `ตรวจท้ายต้องนับป้ายเปิด/ปิดของ ${row.label}`);
    else assert.ok(has(row.fn, `/* ${row.marker} */`), `ตรวจท้ายต้องนับป้ายของ ${row.label}`);
  }
  /* รูปสุดท้ายของจุดปะ + ด่านของสองตัวช่วย + แพตช์เดิมยังอยู่ครบ (0382 · 0394) */
  for (const [fn, needle] of [
    [CHECK, "v_line_gross := round(COALESCE((v_item->>'packQty')::numeric, 1) * /* 0409/H2 */ v_qty * v_unit_price, 2);"],
    [CHECK, "IF v_item ? 'packQty' AND jsonb_typeof(v_item->'packQty') <> 'null' AND ("],
    [CHECK, "RAISE EXCEPTION 'historical_so_line_pack_qty_invalid';"], [CHECK, '-- 0394/P4 ▶'],
    [WRITE, 'metadata, "packQty" /* 0409/W1 */'], [WRITE, "'{}'::jsonb, (e.l->>'packQty')::numeric::integer /* 0409/W2 */"],
    [WRITE, "RAISE EXCEPTION 'historical_so_line_pack_qty_invalid';"], [WRITE, DELETE_INSTALLMENTS],
    [WRITE, '-- 0394/P5 ▶'], [WRITE, '-- 0394/P6 ▶'], [WRITE, '-- 0394/P7c ▶'], [WRITE, '0394/P7a'], [WRITE, '0394/P7b'],
    [SUBMIT, `l."serviceRounds", 'packQty', l."packQty" /* 0409/S1 */`], [SUBMIT, 'NOT public.is_sales_keyer_role(p_actor_role)'],
    [APPROVE, `l."serviceRounds", 'packQty', l."packQty" /* 0409/A1 */`], [APPROVE, 'NOT public.is_sales_manager_role(p_actor_role)'], [APPROVE, '-- 0394/P3 ▶'],
  ]) assert.ok(has(fn, needle), `ตรวจท้ายต้องนับ "${needle}" ใน ${fn}`);
  assert.ok(v.includes(") AS t(fn, needle, expected) LOOP SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = r.fn;"
    + " v_n := (length(v_src) - length(replace(v_src, r.needle, ''))) / length(r.needle); IF v_n IS DISTINCT FROM r.expected THEN RAISE EXCEPTION 'mig_0409_verify marker % in % = % (คาด %)', r.needle, r.fn, v_n, r.expected; END IF; END LOOP;"));
  /* ลำดับ: ด่านเข้มของตัวเขียนก่อน DELETE และ DELETE ก่อน INSERT ที่มี W1 · ช่วงของตัวตรวจก่อนสูตรเงิน */
  assert.ok(v.includes(`AND p.proname = '${WRITE}'; IF NOT (strpos(v_src, '-- 0409/W0 ◀') > 0 AND strpos(v_src, '-- 0409/W0 ◀') < strpos(v_src, '${DELETE_INSTALLMENTS}')`
    + ` AND strpos(v_src, '${DELETE_INSTALLMENTS}') < strpos(v_src, '/* 0409/W1 */')) THEN RAISE EXCEPTION 'mig_0409_verify order`));
  assert.ok(v.includes(`AND p.proname = '${CHECK}'; IF NOT (strpos(v_src, '-- 0409/H1 ◀') > 0 AND strpos(v_src, '-- 0409/H1 ◀') < strpos(v_src, '/* 0409/H2 */')) THEN RAISE EXCEPTION 'mig_0409_verify order`));
  /* ฟังก์ชันอื่นทุกตัวใน public: ลายเซ็น · md5 ของเนื้อ · volatility · SECURITY · proconfig (search_path) · สิทธิ์ — นิพจน์เดียวกันสองที่ */
  const others = "SELECT md5(COALESCE(string_agg( p.oid::regprocedure::text || '|' || md5(p.prosrc) || '|' || p.provolatile::text || '|' || p.prosecdef::text"
    + " || '|' || COALESCE(p.proconfig::text, '') || '|' || COALESCE(p.proacl::text, ''), E'\\n' ORDER BY p.oid::regprocedure::text), ''))"
    + " FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND NOT (p.proname = ANY (v_fns))";
  assert.ok(pre.includes(`PERFORM set_config('mig_0409.others', ( ${others} ), true);`), 'ด่านก่อนรันต้องจดฟังก์ชันอื่นทุกตัวใน public');
  assert.ok(v.includes(`IF v_others IS NULL OR v_others IS DISTINCT FROM ( ${others}) THEN RAISE EXCEPTION 'mig_0409_verify others`), 'ตรวจท้ายต้องคิดลายนิ้วมือด้วยนิพจน์เดียวกันทุกตัวอักษร แล้ว RAISE เมื่อไม่ตรง');
  /* สี่ตัวที่ปะ: ทุกอย่างยกเว้นเนื้อ — ลายเซ็น · ชนิดที่คืน · ภาษา · เจ้าของ · volatility · SECURITY · proretset · proconfig · สิทธิ์ */
  const meta = "md5( p.oid::regprocedure::text || '|' || p.prorettype::regtype::text || '|' || p.prolang::text || '|' || p.proowner::text"
    + " || '|' || p.provolatile::text || '|' || p.prosecdef::text || '|' || p.proretset::text || '|' || COALESCE(p.proconfig::text, '') || '|' || COALESCE(p.proacl::text, ''))";
  assert.ok(pre.includes(`PERFORM set_config('mig_0409.meta', ( SELECT jsonb_object_agg(p.proname, ${meta})::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = ANY (v_fns) ), true);`));
  assert.ok(v.includes("IF v_meta IS NULL OR (SELECT count(*) FROM jsonb_object_keys(v_meta)) <> 4 THEN RAISE EXCEPTION 'mig_0409_verify meta"));
  assert.ok(v.includes(`LEFT JOIN (SELECT p.proname, ${meta} AS h FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public') now_fn ON now_fn.proname = b.fn`
    + " WHERE now_fn.h IS DISTINCT FROM b.h; IF v_n > 0 THEN RAISE EXCEPTION 'mig_0409_verify meta changed=%"), 'ลายนิ้วมือ "ทุกอย่างยกเว้นเนื้อ" ของสี่ตัวต้องเป็นนิพจน์เดียวกันสองที่');
  /* สิทธิ์คงเดิม: anon/authenticated ไม่มีทุกตัว · service_role ตามตาราง (ตัวช่วยสองตัวไม่ได้ · RPC ส่ง/อนุมัติได้) */
  assert.ok(v.includes(`FOR r IN SELECT * FROM (VALUES ${FNS.map((fn) => `('${SIGNATURES[fn]}', ${SERVICE_ROLE[fn]})`).join(', ')} ) AS t(sig, service_role) LOOP v_fn := r.sig;`
    + " IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') OR has_function_privilege('service_role', v_fn, 'EXECUTE') IS DISTINCT FROM r.service_role THEN"
    + " RAISE EXCEPTION 'mig_0409_verify grant %"), 'ตรวจท้ายต้องตรวจสิทธิ์ของสี่ลายเซ็น');
  assert.ok(v.includes("FROM pg_attribute a WHERE a.attrelid = 'public.sales_order_lines'::regclass AND a.attname = 'packQty' AND strpos(COALESCE(col_description(a.attrelid, a.attnum), ''), '0409') > 0;"
    + " IF v_n <> 1 THEN RAISE EXCEPTION 'mig_0409_verify comment"), 'คำอธิบายคอลัมน์ต้องเป็นของไฟล์นี้');
  /* รหัสด่านของไฟล์เจ็ดตัว — เป็นของคนรัน migration ล้วน (ตัด $re$/$rp$/$u$/$n$ ออกก่อน: รหัสตัวที่แปด historical_so_line_pack_qty_invalid
     อยู่ในข้อความที่ปะลงสองตัวช่วย — เทสต์ "ทุกรหัสมีข้อความไทย" ข้างล่างนับรวม) */
  const codes = [...CODE.replace(/\$(re|rp|u|n)\$[\s\S]*?\$\1\$/g, '').matchAll(/RAISE EXCEPTION '([a-z_0-9]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(codes)].sort(), ['mig_0409_historical_in_flight', 'mig_0409_needs_0407', 'mig_0409_needs_chain', 'mig_0409_needs_functions',
    'mig_0409_patch_anchor', 'mig_0409_patch_overload', 'mig_0409_verify']);
  assert.equal(codes.filter((c) => c === 'mig_0409_verify').length, 10,
    'ตรวจท้าย 10 จุด: others · meta · meta changed · marker · order ×2 · grant · comment · body (ไม่มีรายการ) · body');
  assert.equal(codes.length, 16, 'needs ×3 · in_flight ×1 · patch ×2 (overload · anchor) · verify ×10');
});

test('🔴 ด่านเนื้อ (mig_0409_verify body): ถอดของที่ไฟล์เติมแล้วต้องได้เนื้อที่พิสูจน์ไว้ทุกไบต์ — บังคับเฉพาะฟังก์ชันที่รอบนั้นปะ · ตัวที่ปะครบแล้วไม่ถูกตีกลับแม้ถูกแก้ต่อ (รันซ้ำได้)', () => {
  const verify = doBlock('verify');
  const v = flat(verify);
  const gate = stripPatterns(verify);
  assert.equal(gate.length, 2, 'ด่านเนื้อใช้สองรูป: บล็อก (H1 · W0) · ของที่ปะในบรรทัด');
  assert.deepEqual(stripPatterns(preflight()), gate, 'md5_live ของ SELECT ตรวจก่อนรันถอดด้วยสองรูปเดียวกับด่านเนื้อ ทุกตัวอักษร');
  assert.ok(v.includes("md5(regexp_replace(regexp_replace(p.prosrc, $u$" + gate[0] + "$u$, ''), $u$" + gate[1] + "$u$, '', 'g')) AS h FROM (VALUES "
    + FNS.map((fn) => `('${fn}', '${LIVE_MD5[fn]}')`).join(', ') + ' ) AS e(fn, h)'), 'ด่านเนื้อ: ถอดสองชั้นแล้ว md5 เทียบกับสี่ค่าที่พิสูจน์ไว้');
  assert.ok(flat(preflight()).includes("CROSS JOIN LATERAL (SELECT regexp_replace(regexp_replace(p.prosrc, $u$" + gate[0] + "$u$, ''), $u$" + gate[1] + "$u$, '', 'g') AS src) s) b;"));
  /* ถอดแล้วได้เนื้อเดิมจริง — ทั้งหลังปะ (md5_live เท่าเดิมก่อนและหลังรัน) และก่อนปะ (ไม่มีอะไรให้ถอด) */
  const before = live();
  const { texts: after } = applied();
  for (const fn of FNS) {
    assert.equal(stripOwn(after[fn].body, gate), before[fn].body, `${fn}: ถอดของที่ 0409 เติมออกแล้วต้องได้เนื้อเดิมทุกไบต์`);
    assert.equal(stripOwn(before[fn].body, gate), before[fn].body, `${fn}: เนื้อก่อนปะไม่มีอะไรให้ถอด`);
    assert.equal(md5(stripOwn(after[fn].body, gate)), LIVE_MD5[fn]);
  }
  /* เงื่อนไขของด่าน: พิมพ์ md5 ทุกตัว (NOTICE) · RAISE เฉพาะตัวที่อยู่ในรายการ "รอบนี้ปะ" และ md5 ไม่ตรง · ไม่มีรายการจากต้นไฟล์ = RAISE */
  order(v, ["v_todo text := current_setting('mig_0409.todo', true);", "IF v_todo IS NULL THEN RAISE EXCEPTION 'mig_0409_verify body",
    "ORDER BY e.fn LOOP RAISE NOTICE '0409: เนื้อเดิมของ % = %', r.fn, r.h;"
      + " IF r.fn = ANY (string_to_array(v_todo, ',')) AND r.h IS DISTINCT FROM r.expected THEN v_bad := v_bad || ' ' || r.fn || '=' || r.h || ' (คาด ' || r.expected || ')'; END IF; END LOOP;"
      + " IF v_bad <> '' THEN RAISE EXCEPTION 'mig_0409_verify body%"], 'ด่านเนื้อ');
  /* แบบจำลองของด่าน (รายการจาก $pre$ = ตัวที่ป้ายยังไม่ครบ · ตีกลับ = อยู่ในรายการ และ md5 หลังถอดไม่ตรง) บนสถานการณ์ที่ฮาร์เนสรันจริง:
     G-6 เนื้อถูกแก้นอกจุดปะ / CRLF · G-11 รันซ้ำหลัง migration อื่นแก้ต่อ · A-1 ทางกลับหลังรัน 0379 พลาด */
  const todoOf = (texts) => [...new Set(rows().filter((r) => !texts[r.fn].body.includes(r.marker)).map((r) => r.fn))].sort();
  const refused = (texts) => todoOf(texts).filter((fn) => md5(stripOwn(texts[fn].body, gate)) !== LIVE_MD5[fn]);
  const withBody = (texts, fn, change) => ({ ...texts, [fn]: { ...texts[fn], body: change(texts[fn].body) } });
  assert.deepEqual(todoOf(before), [...FNS].sort(), 'รันครั้งแรก: ทั้งสี่ตัวอยู่ในรายการ');
  assert.deepEqual(refused(before), [], 'รันครั้งแรกบนเนื้อที่พิสูจน์ไว้: ไม่มีตัวไหนถูกตีกลับ');
  assert.deepEqual(todoOf(after), [], 'รันซ้ำ: ไม่มีตัวไหนอยู่ในรายการ');
  const foreign = (body) => {
    const out = body.replace('\nBEGIN\n', '\n-- แก้นอกจุดปะ\nBEGIN\n');
    assert.notEqual(out, body, 'เนื้อจำลองต้องต่างจากของจริง');
    return out;
  };
  assert.equal(anchorCounts(withBody(before, SUBMIT, foreign)), 'A1=1 H1=1 H2=1 S1=1 W0=1 W1=1 W2=1', 'คอมเมนต์หนึ่งบรรทัดนอกจุดปะ: anchor ยังเจอครบทุกตัว — มีแต่ด่านเนื้อที่เห็น');
  assert.deepEqual(refused(withBody(before, SUBMIT, foreign)), [SUBMIT], 'รันครั้งแรกบนเนื้อที่ถูกแก้นอกจุดปะ: ตีกลับ');
  assert.deepEqual(refused(withBody(before, CHECK, (body) => body.replace(/\n/g, '\r\n'))), [CHECK], 'ต่างกันแค่การขึ้นบรรทัด (CRLF) ก็ตีกลับ — ไม่ปะลงเนื้อที่ไม่เคยพิสูจน์');
  assert.deepEqual(refused(withBody(after, APPROVE, foreign)), [], 'รันซ้ำหลัง migration อื่นแก้ขั้นอนุมัติต่อ: ไม่ถูกตีกลับ');
  const accident = { ...after, [CHECK]: before[CHECK], [WRITE]: before[WRITE] }; // รัน 0379 ซ้ำแล้วกลับด้วย 0394: S1/A1 ยังอยู่
  assert.deepEqual(todoOf(accident), [CHECK, WRITE], 'ทางกลับหลังรัน 0379 พลาด: รอบนั้นปะแค่ตัวตรวจ + ตัวเขียน');
  assert.deepEqual(refused(withBody(accident, APPROVE, foreign)), [], 'ตัวที่รอบนั้นไม่ปะ (อนุมัติ) ถูกแก้ต่อไปแล้วก็ไม่ขวางทางกลับ');
  assert.deepEqual(refused(withBody(accident, WRITE, foreign)), [WRITE], 'ตัวที่รอบนั้นต้องปะยังถูกบังคับ');
});

test('หัวไฟล์ — SELECT ตรวจก่อนรัน: อ่านอย่างเดียว คำสั่งเดียว 16 ช่อง · anchor ตัวเดียวกับแถวปะตามตัวอักษร · ใบย้อนหลังค้างนับสามสถานะพร้อมเลขที่ใบ · บรรทัดเกณฑ์ก่อนรันครั้งแรก (ไม่มี packed_hist) · ผลมีอายุ', () => {
  const sql = preflight();
  const f = flat(sql);
  const bare = sqlText(sql, { blank: true });
  assert.doesNotMatch(bare, /\b(UPDATE|INSERT|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE|TRUNCATE|EXECUTE|PERFORM|DO|SET|CALL|COPY|LOCK|COMMENT)\b/, 'SELECT ของหัวไฟล์ต้องอ่านอย่างเดียว');
  assert.equal(occurrences(bare, ';'), 1, 'หนึ่งก้อน = หนึ่งคำสั่ง SELECT');
  assert.match(bare.trim(), /^SELECT\b[\s\S]*;$/);
  assert.deepEqual(aliasesAtLineEnd(sql), ['fns', 'chain', 'anchors', 'marks', 'md5_expected', 'hist', 'in_flight', 'in_flight_orders', 'packed_so', 'packed_hist', 'm0407',
    'anon', 'svc', 'bodies', 'bodies_ws', 'md5_live'], 'ช่องของ SELECT (สามตัวท้ายมาจาก b.bodies, b.bodies_ws, b.md5_live)');
  assert.ok(sql.includes('\n   b.bodies, b.bodies_ws, b.md5_live,\n'));
  /* anchor: แถวของหัวไฟล์ = แถวปะ ทุกตัวอักษร (เจ้าของเห็นผลเดียวกับที่วงปะของไฟล์จะเห็น) · นับใน prosrc แบบเดียวกับวงปะ */
  const headerRows = [...sql.matchAll(/\('([a-z_]+)', '([A-Z][0-9])', \$re\$([\s\S]*?)\$re\$\)/g)].map((m) => `${m[1]}|0409/${m[2]}|${m[3]}`);
  assert.deepEqual(headerRows, rows().map((r) => `${r.fn}|${r.marker}|${r.anchor}`), 'anchor ใน SELECT ตรวจก่อนรันต้องเท่า anchor ของแถวปะตามตัวอักษร');
  assert.ok(f.includes("(SELECT string_agg(a.marker || '=' || (SELECT count(*) FROM regexp_matches(p.prosrc, a.anchor, 'g')), ' ' ORDER BY a.marker) FROM (VALUES"));
  assert.ok(f.includes(") AS a(fn, marker, anchor) JOIN pg_proc p ON p.proname = a.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public') AS anchors,"));
  /* fns · chain · marks — นิพจน์เดียวกับด่านก่อนรันของไฟล์ */
  assert.ok(f.includes(`(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('${FNS.join("', '")}')) AS fns,`));
  assert.ok(f.includes(`(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND ${CHAIN_COND}) AS chain,`), 'chain = เงื่อนไขของ mig_0409_needs_chain');
  assert.ok(f.includes(`(SELECT count(*) FROM (VALUES ${rows().map((r) => `('${r.fn}', '${r.marker}')`).join(', ')}) AS m(fn, marker)`
    + " JOIN pg_proc p ON p.proname = m.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public' WHERE strpos(p.prosrc, m.marker) > 0) AS marks,"), 'marks นับป้ายของแถวปะเจ็ดตัว');
  /* bodies · bodies_ws · md5_live — เรียง ตัวตรวจ · ตัวเขียน · ส่ง · อนุมัติ */
  assert.ok(f.includes("FROM (SELECT string_agg((md5(s.src) = e.h)::text::char(1), '' ORDER BY e.ord) AS bodies,"
    + " string_agg((md5(regexp_replace(s.src, '[ \\t\\n\\r]', '', 'g')) = e.w)::text::char(1), '' ORDER BY e.ord) AS bodies_ws,"
    + " string_agg(e.tag || '=' || md5(s.src), ' ' ORDER BY e.ord) AS md5_live FROM (VALUES "
    + FNS.map((fn, i) => `(${i + 1}, '${TAG[fn]}', '${fn}', '${LIVE_MD5[fn]}', '${LIVE_MD5_WS[fn]}')`).join(', ') + ' ) AS e(ord, tag, fn, h, w)'));
  /* ใบย้อนหลังค้าง: ร่าง · รออนุมัติ · ตีกลับ ทั้งตัวนับและรายการเลขที่ใบ (เจ้าของตัดสินทีละใบจากรายการนี้) */
  assert.ok(f.includes(`(SELECT count(*) FROM public.sales_orders o WHERE ${IN_FLIGHT}) AS in_flight,`));
  assert.ok(f.includes(`(SELECT COALESCE(string_agg(o."orderNumber" || '=' || o.status, ' ' ORDER BY o."orderNumber"), 'none') FROM public.sales_orders o WHERE ${IN_FLIGHT}) AS in_flight_orders,`));
  assert.ok(f.includes("(SELECT COALESCE(string_agg(s.status || '=' || s.n, ' ' ORDER BY s.status), 'none') FROM (SELECT o.status, count(*) AS n FROM public.sales_orders o WHERE o.origin = 'historical' GROUP BY o.status) s) AS hist,"));
  /* เลขแพ็คที่มีอยู่: to_jsonb — SELECT นี้ต้องรันได้แม้บนฐานที่ยังไม่มีคอลัมน์ (ไม่เอ่ย l."packQty" ตรง ๆ) */
  assert.ok(f.includes(`(SELECT count(*) FROM public.sales_order_lines l WHERE to_jsonb(l)->>'packQty' IS NOT NULL) AS packed_so,`));
  assert.ok(f.includes(`(SELECT count(*) FROM public.sales_order_lines l JOIN public.sales_orders o ON o.id = l."salesOrderId" WHERE o.origin = 'historical' AND to_jsonb(l)->>'packQty' IS NOT NULL) AS packed_hist,`));
  assert.doesNotMatch(sql, /l\."packQty"/);
  assert.ok(f.includes("AND column_name = 'packQty' AND data_type = 'integer') + (SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace"
    + " WHERE n.nspname = 'public' AND t.relname = 'sales_order_lines' AND c.contype = 'c' AND c.convalidated AND c.conname IN ('sales_order_lines_pack_qty_range', 'sales_order_lines_line_money_rule'))) AS m0407,"));
  /* สิทธิ์: ผ่าน p.oid — ฟังก์ชันหายตัวหนึ่ง SELECT ต้องยังตอบหนึ่งแถว ไม่ใช่ error · svc เรียงสี่ตัว (คาด fftt) */
  assert.ok(f.includes("(SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))"));
  assert.ok(f.includes(`(SELECT string_agg(has_function_privilege('service_role', p.oid, 'EXECUTE')::text::char(1), '' ORDER BY e.ord) FROM (VALUES ${FNS.map((fn, i) => `(${i + 1}, '${fn}')`).join(', ')}) AS e(ord, fn)`));
  for (const fn of FNS) assert.ok(!sql.includes(SIGNATURES[fn]), 'SELECT ตรวจก่อนรันต้องไม่มีลายเซ็นในสตริง');
  assert.equal(FNS.map((fn) => (SERVICE_ROLE[fn] ? 't' : 'f')).join(''), 'fftt');
  /* 🐞 รีวิว 12/10 (deploy-ops): ค่า "ต้องได้" ของรุ่นก่อนจริงเฉพาะรันครั้งแรกสุด — เกณฑ์ก่อนรันจึงไม่มี packed_hist (หลังรันแล้วถอย ใบที่อนุมัติ
     ยังเก็บเลขแพ็ค = ปกติ) · ทุกชื่อในบรรทัดเกณฑ์เป็นช่องของ SELECT นี้ */
  assert.deepEqual(headerCriteria('เกณฑ์ก่อนรันครั้งแรก'), ['fns=4', 'chain=4', 'anchors=A1=1 H1=1 H2=1 S1=1 W0=1 W1=1 W2=1', 'marks=0', 'bodies=tttt', 'bodies_ws=tttt',
    'md5_live=md5_expected', 'in_flight=0', 'm0407=3', 'anon=f', 'svc=fftt']);
  order(HEADER, ['ข้อมูลประกอบ (ไม่ใช่เกณฑ์): hist', 'in_flight_orders = เลขที่ใบที่นับใน in_flight พร้อมสถานะ', 'packed_hist เป็น 0 เฉพาะบนฐานที่ **ไม่เคยรันไฟล์นี้เลย**',
    '⛔ อย่ารัน แล้วแจ้งผู้พัฒนา เมื่อ:', 'bodies ไม่ใช่ tttt ขณะ marks = 0', 'ไฟล์หยุดเองด้วย mig_0409_verify body', 'in_flight ≠ 0 **ขณะ marks = 0**', '**เจ้าของตัดสิน** ทีละใบ (in_flight_orders)',
    'ขณะ marks = 7 ใบร่างรายวันเป็นเรื่องปกติ', 'anon ไม่ใช่ f หรือ svc ไม่ใช่ fftt', '⏱ ผลแถวนี้มีอายุ: ใช้ตัดสินได้เฉพาะรอบนั่งเดียวกับที่รันไฟล์'], 'เงื่อนไขอย่ารัน');
});

test('หัวไฟล์ — SELECT ตรวจหลังรัน: ป้ายเจ็ดตัว · packs 8/5/2/2 · gate · chain · สิทธิ์สี่ลายเซ็น · บรรทัดเกณฑ์หลังรันทุกรอบเป็นจริงบนเนื้อที่ปะแล้ว (ไม่มี in_flight / packed_hist)', () => {
  const sql = verifySelect();
  const f = flat(sql);
  const bare = sqlText(sql, { blank: true });
  assert.doesNotMatch(bare, /\b(UPDATE|INSERT|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE|TRUNCATE|EXECUTE|PERFORM|DO|SET|CALL|COPY|LOCK|COMMENT)\b/, 'SELECT ของหัวไฟล์ต้องอ่านอย่างเดียว');
  assert.equal(occurrences(bare, ';'), 1, 'หนึ่งก้อน = หนึ่งคำสั่ง SELECT');
  assert.match(bare.trim(), /^SELECT\b[\s\S]*;$/);
  assert.deepEqual(aliasesAtLineEnd(sql), ['marks', 'packs', 'gate', 'chain', 'anon', 'svc', 'note', 'in_flight', 'packed_hist']);
  /* marks: ข้อความป้ายเต็ม (บล็อก = ป้ายเปิด · ในบรรทัด = คอมเมนต์บล็อก) ของแถวปะเจ็ดตัว แต่ละตัวต้องเจอ **ครั้งเดียวพอดี** */
  const marks = [...sql.matchAll(/\('([a-z_]+)', '((?:-- 0409\/[A-Z][0-9] ▶)|(?:\/\* 0409\/[A-Z][0-9] \*\/))'\)/g)].map((m) => `${m[1]}|${m[2]}`);
  assert.deepEqual(marks, rows().map((r) => `${r.fn}|${needleOf(r.label)}`), 'SELECT ตรวจหลังรันนับป้ายของแถวปะครบเจ็ดตัว');
  assert.ok(f.includes(") AS m(fn, needle) JOIN pg_proc p ON p.proname = m.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'"
    + " WHERE (length(p.prosrc) - length(replace(p.prosrc, m.needle, ''))) / length(m.needle) = 1) AS marks,"));
  assert.ok(f.includes("(SELECT string_agg(((length(p.prosrc) - length(replace(p.prosrc, 'packQty', ''))) / length('packQty'))::text, '/' ORDER BY e.ord)"
    + ` FROM (VALUES ${FNS.map((fn, i) => `(${i + 1}, '${fn}')`).join(', ')}) AS e(ord, fn)`
    + " JOIN pg_proc p ON p.proname = e.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public') AS packs,"));
  assert.ok(f.includes(`(SELECT strpos(p.prosrc, '-- 0409/W0 ◀') > 0 AND strpos(p.prosrc, '-- 0409/W0 ◀') < strpos(p.prosrc, '${DELETE_INSTALLMENTS}')`
    + ` FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = '${WRITE}') AS gate,`));
  assert.ok(f.includes(`(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND ${CHAIN_COND}) AS chain,`));
  /* สิทธิ์: anon = OR ของแปดคู่ (anon/authenticated × สี่ลายเซ็น) · svc = ต่อสตริงสี่ตัวตามลำดับ */
  for (const fn of FNS) {
    for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(occurrences(sql, `has_function_privilege('${role}', '${SIGNATURES[fn]}', 'EXECUTE')`), 1, `ตรวจหลังรัน: สิทธิ์ของ ${role} บน ${fn}`);
  }
  assert.equal(occurrences(f, "'EXECUTE') OR has_function_privilege("), 7);
  assert.ok(f.includes(FNS.map((fn) => `has_function_privilege('service_role', '${SIGNATURES[fn]}', 'EXECUTE')::text::char(1)`).join(' || ') + ') AS svc,'));
  assert.ok(f.includes("(SELECT strpos(COALESCE(col_description(a.attrelid, a.attnum), ''), '0409') > 0 FROM pg_attribute a WHERE a.attrelid = 'public.sales_order_lines'::regclass AND a.attname = 'packQty') AS note,"));
  assert.ok(f.includes(`(SELECT count(*) FROM public.sales_orders o WHERE ${IN_FLIGHT}) AS in_flight,`));
  assert.ok(f.includes(`(SELECT count(*) FROM public.sales_order_lines l JOIN public.sales_orders o ON o.id = l."salesOrderId" WHERE o.origin = 'historical' AND l."packQty" IS NOT NULL) AS packed_hist;`));
  /* 🐞 รีวิว 12/10: in_flight / packed_hist เป็นข้อมูลประกอบ (รันซ้ำหลังมีคนคีย์ใบด้วยฟอร์มใหม่ = มากกว่า 0 ได้) — ไม่อยู่ในเกณฑ์
     และเกณฑ์ทุกข้อที่คิดจากเนื้อฟังก์ชันได้ ต้องเป็นจริงบนเนื้อที่ยามนี้ปะเอง */
  const criteria = headerCriteria('เกณฑ์หลังรันทุกรอบ');
  assert.deepEqual(criteria, ['marks=7', `packs=${FNS.map((fn) => PACK_HITS[fn]).join('/')}`, 'gate=t', 'chain=4', 'anon=f', 'svc=fftt', 'note=t']);
  const { texts: after } = applied();
  const row = {
    marks: marks.filter((pair) => { const [fn, needle] = pair.split('|'); return occurrences(after[fn].body, needle) === 1; }).length,
    packs: FNS.map((fn) => occurrences(after[fn].body, 'packQty')).join('/'),
    gate: after[WRITE].body.indexOf('-- 0409/W0 ◀') > 0 && after[WRITE].body.indexOf('-- 0409/W0 ◀') < after[WRITE].body.indexOf(DELETE_INSTALLMENTS) ? 't' : 'f',
    chain: FNS.filter((fn) => CHAIN_NEEDLES[fn].every((needle) => after[fn].body.includes(needle))).length,
  };
  for (const key of Object.keys(row)) assert.ok(criteria.includes(`${key}=${row[key]}`), `เกณฑ์ ${key} ต้องเป็นจริงบนเนื้อหลังปะ (ได้ ${row[key]})`);
  order(HEADER, ['── ตรวจหลังรัน (อ่านอย่างเดียว)', 'เกณฑ์หลังรันทุกรอบ:', 'ข้อมูลประกอบ (ไม่ใช่เกณฑ์): in_flight · packed_hist — รันครั้งแรกสุดได้ 0 ทั้งคู่',
    'หรือรันใหม่หลังถอยด้วยบล็อกถอยกลับ = มากกว่า 0 ได้ ไม่ใช่ความผิดพลาด', '── ถอยกลับ'], 'ตรวจหลังรัน');
});

test('หัวไฟล์ — บล็อกถอยกลับ: ทรานแซกชันเดียว มีด่านในตัว · รูปถอยเจ็ดตัว (แถวละตัว) เจอครั้งเดียวพอดี · ถอดแล้วได้เนื้อเดิมทุกไบต์ทั้ง prosrc และทั้งบล็อก · คืนคำอธิบายคอลัมน์ของ 0407 ตรงตัว', () => {
  const undo = undoBlock();
  const code = flat(sqlText(undo));
  const bare = sqlText(undo, { blank: true });
  assert.match(bare.trim(), /^BEGIN;\s*DO \$undo\$[\s\S]*END \$undo\$;\s*COMMENT ON COLUMN public\.sales_order_lines\."packQty" IS\s*'';\s*COMMIT;\s*NOTIFY pgrst, '';$/);
  assert.equal(occurrences(bare, 'EXECUTE '), 1);
  assert.doesNotMatch(bare, /\b(CREATE|GRANT|REVOKE|ALTER|DROP|UPDATE|INSERT|DELETE|TRUNCATE)\b/, 'บล็อกถอยกลับไม่สร้าง ไม่ให้สิทธิ์ ไม่แตะแถวข้อมูล');
  /* 🔴 ด่าน: มีใบย้อนหลังร่าง/รออนุมัติ/ตีกลับที่บรรทัดมีเลขแพ็ค = ห้ามถอย (ตัวตรวจรุ่นเดิมคิดคูณ 1 ⇒ ใบพวกนั้นส่ง/อนุมัติไม่ได้อีก) */
  assert.ok(code.includes(`IF EXISTS (SELECT 1 FROM public.sales_order_lines l JOIN public.sales_orders o ON o.id = l."salesOrderId" WHERE ${IN_FLIGHT} AND l."packQty" IS NOT NULL) THEN`
    + " RAISE EXCEPTION 'undo_0409 มีใบย้อนหลังที่ยังไม่อนุมัติซึ่งบรรทัดมีเลขแพ็ค — ห้ามถอย (อนุมัติ/ยกเลิกให้จบก่อน)'; END IF;"));
  order(code, ['IF EXISTS (SELECT 1 FROM public.sales_order_lines l', 'FOR r IN SELECT * FROM (VALUES', ') AS t(fn, pattern) LOOP', 'v_def := pg_get_functiondef(v_oid);',
    "SELECT count(*) INTO v_hits FROM regexp_matches(v_def, r.pattern, 'g');", "IF v_hits <> 1 THEN RAISE EXCEPTION 'undo_0409 % hits=% (%)', r.fn, v_hits, left(r.pattern, 30); END IF;",
    "EXECUTE regexp_replace(v_def, r.pattern, '');", 'END LOOP;', 'END $undo$;', 'COMMENT ON COLUMN public.sales_order_lines."packQty" IS', 'COMMIT;', "NOTIFY pgrst, 'reload schema';"], 'บล็อกถอยกลับ');
  /* รูปถอย: แถวละตัว ลำดับกลับหลัง (A1 → H1) · ถอดจากเนื้อที่ยามนี้ปะ ทีละรูป ครั้งเดียวพอดี → เนื้อก่อน 0409 ทุกไบต์ */
  const patterns = [...undo.matchAll(/\('([a-z_]+)', \$u\$([\s\S]*?)\$u\$\)/g)].map((m) => ({ fn: m[1], pattern: m[2] }));
  assert.deepEqual(patterns.map((p) => p.fn), [APPROVE, SUBMIT, WRITE, WRITE, WRITE, CHECK, CHECK], 'ถอยครบเจ็ดแถว');
  const labels = patterns.map((p) => /0409\/([A-Z][0-9])/.exec(p.pattern)[1]);
  assert.deepEqual(labels, ['A1', 'S1', 'W2', 'W1', 'W0', 'H2', 'H1'], 'รูปถอยหนึ่งตัวต่อหนึ่งแถวปะ');
  const texts = clone(applied().texts);
  for (const { fn, pattern } of patterns) {
    for (const key of ['body', 'full']) {
      assert.equal(hits(texts[fn][key], pattern, 'gs'), 1, `${fn}: รูปถอย ${pattern.slice(0, 40)} ต้องเจอครั้งเดียวพอดี (${key})`);
      texts[fn][key] = texts[fn][key].replace(new RegExp(pattern, 's'), '');
    }
  }
  for (const fn of FNS) {
    assert.equal(texts[fn].body, live()[fn].body, `${fn}: ถอยกลับแล้ว prosrc ต้องเท่าก่อน 0409 ทุกไบต์`);
    assert.equal(texts[fn].full, live()[fn].full, `${fn}: ถอยกลับแล้วทั้งบล็อกต้องเท่าก่อน 0409 ทุกไบต์`);
    assert.equal(md5(texts[fn].body), LIVE_MD5[fn]);
  }
  /* คำอธิบายคอลัมน์กลับเป็นข้อความของ 0407 ตรงตัว (อ่านจากไฟล์ 0407 — ไม่ใช่เชื่อสำเนา) */
  const note0407 = /COMMENT ON COLUMN public\.sales_order_lines\."packQty" IS\n\s+'([^']*)';/.exec(read(FILE_0407));
  assert.ok(note0407 && note0407[1].endsWith('ใบสั่งขายย้อนหลังเป็น NULL เสมอ (0407)'));
  assert.equal(/COMMENT ON COLUMN public\.sales_order_lines\."packQty" IS\s+'([^']*)';/.exec(undo)[1], note0407[1], 'บล็อกถอยกลับคืนข้อความของ 0407');
  order(HEADER, ['── ถอยกลับ', 'ถอยได้เฉพาะตอนที่ **ไม่มีใบย้อนหลังร่าง/รออนุมัติ/ตีกลับที่บรรทัดมีเลขแพ็ค**', 'ถอยโค้ด JS ของงวด PR-5 ก่อนเสมอ', 'DO $undo$', 'END $undo$;',
    'กลับเท่าก่อน 0409 ทุกไบต์', 'หลังถอย: marks = 0'], 'หัวข้อถอยกลับ');
});

test('หัวไฟล์ — ลำดับ deploy (รันก่อน merge · สองจังหวะ · ไม่มีด่าน CI ⇒ PR เป็น draft) · สลับลำดับ = ใบร่างที่ขวางไฟล์ ทางออกสองทาง ไม่มี "บันทึกใหม่หลังรัน" · ห้ามรัน 0374 · 0379 ซ้ำ ตรงกับไฟล์จริง', () => {
  order(HEADER, ['── ด่านก่อนรัน', '── ตรวจก่อนรัน', '── ลำดับ deploy (รัน **ก่อน** merge · สองจังหวะ)', 'ฮาร์เนส PGlite harness-0409 ผ่านสองรอบผลเหมือนกัน', 'ตรวจเลข migration อีกครั้ง',
    /* ไม่มีคอลัมน์ใหม่ ⇒ check:columns เขียวทั้งที่ยังไม่รัน และ production ตาม main เองวันละ 3 รอบ ⇒ กันด้วยมือ */
    '🔒 **ไม่มีด่าน CI ไหนกัน merge ก่อนรันไฟล์นี้**', 'เปิด PR เป็น **draft** + หัวเรื่อง "⚠️ รัน 0409 ก่อน merge"', 'ห้ามบันทึกใบย้อนหลังจาก dev server ของแบรนช์งวด PR-5 ก่อนรันไฟล์นี้',
    'เจ้าของรัน SELECT ตรวจก่อนรันข้างบนที่ SQL Editor แล้วส่งผลแถวนั้นกลับมาให้ผู้พัฒนาดูก่อน (จังหวะที่หนึ่ง)',
    '**หลังผู้พัฒนาตอบ "ไปได้" กับแถวนั้น และในรอบนั่งเดียวกัน**', 'เจ้าของประกาศ freeze สั้น ๆ: ห้ามคีย์/แก้ใบสั่งขายย้อนหลัง', 'merge → Deploy to production',
    'JS รุ่นเดิม (ก่อนงวด PR-5) บันทึกใบย้อนหลังไม่ได้', 'ตัวเขียนตอบ historical_so_line_pack_qty_invalid', 'ดัง ไม่เงียบ ไม่มีข้อมูลเปลี่ยน',
    'สลับลำดับ (โค้ดงวด PR-5 ถึงฐานก่อนไฟล์นี้', 'แพ็ค 1 ถูกเก็บเป็น NULL เงียบ ๆ',
    '🔴 ใบร่างที่เก็บแบบนั้น **ขวางการรันครั้งแรกของไฟล์นี้** (mig_0409_historical_in_flight) · บันทึกซ้ำกี่ครั้งก็ยังเป็น NULL และยังขวาง',
    '① ยกเลิกใบนั้น → รันไฟล์นี้ → คีย์ใบใหม่ตั้งแต่ต้น', '② อนุมัติใบนั้นตามที่เก็บ → รันไฟล์นี้',
    '"เปิดใบร่างมาบันทึกใหม่หลังรัน" **ไม่มีอยู่จริง**', 'ลำดับที่ถูกมีทางเดียว: รันไฟล์นี้ก่อน',
    '🚪 ประตูทางเดียว: หลังไฟล์นี้ โค้ดรุ่นก่อนงวด PR-5 บันทึกใบย้อนหลังไม่ได้อีก', '── ตรวจหลังรัน', '── ถอยกลับ'], 'หัวไฟล์');
  /* 🐞 รีวิว 12/10 (F1 / F8): คำแนะนำ "รันแล้วเปิดใบร่างมาบันทึกใหม่" ทำไม่ได้จริง — ใบร่างนั้นคือสิ่งที่ขวางการรัน */
  assert.doesNotMatch(HEADER, /หลังรันไฟล์นี้แล้วเปิดใบร่าง|บันทึกขั้น ② ใหม่/);
  for (const code of ['mig_0409_needs_functions', 'mig_0409_needs_0407', 'mig_0409_needs_chain', 'mig_0409_historical_in_flight', 'mig_0409_verify']) {
    assert.match(HEADER, new RegExp(`--   ${code}\\s`), `หัวไฟล์ต้องอธิบายรหัส ${code}`);
  }
  assert.ok(HEADER.includes('mig_0409_patch_overload / mig_0409_patch_anchor') && HEADER.includes('mig_0409_verify body ='));
  assert.match(HEADER, /⚠️ DDL — เจ้าของรันมือบน Supabase SQL Editor/);
  assert.match(HEADER, /✅ รันซ้ำได้/);
  assert.match(HEADER, /ไม่มีคอลัมน์ใหม่ — check:columns ไม่แดง/);
  assert.match(HEADER, /⛔ ไม่ backfill/);
  /* "ห้ามรัน 0374 · 0379 ซ้ำ" — ใครนิยามตัวไหนอ่านจากโฟลเดอร์ ไม่ใช่เชื่อคำ: 0379 = ตัวตรวจ + ตัวเขียน · 0374 = ทั้งหกตัวของใบย้อนหลัง */
  const six = [...FNS, 'create_historical_sales_order', 'update_historical_sales_order'];
  assert.deepEqual(six.filter((fn) => definesFn(read('0379_historical_so_quote_lines.sql'), fn)), [CHECK, WRITE]);
  assert.deepEqual(six.filter((fn) => definesFn(read('0374_historical_so_approval_flow.sql'), fn)), six);
  order(HEADER, ['⛔ ห้ามรัน 0374 · 0379 ซ้ำหลังไฟล์นี้ — เขียนฟังก์ชันทับ **ทั้งก้อน** จากเนื้อเก่า', '0379 = ตัวตรวจ + ตัวเขียนบรรทัด (แพตช์ 0394/P4–P7 และ H1 · H2 · W0 · W1 · W2 ของไฟล์นี้หาย · S1/A1 ยังอยู่)',
    'SELECT ตรวจก่อนรันข้างบนฟ้อง: chain = 2 · marks = 2', '0374 = ทั้งหกตัวของใบย้อนหลัง (สร้าง · แก้ · ส่ง · อนุมัติ · ตัวตรวจ · ตัวเขียน)', 'chain = 0 · marks = 0 · bodies = ffff',
    'ทางกลับหลังรัน 0379 พลาด (พิสูจน์บนฮาร์เนส', '0394 → ไฟล์นี้', 'รันไฟล์นี้ก่อน 0394 = หยุดเองด้วย mig_0409_needs_chain ไม่เขียนอะไร',
    'หลังรัน 0374 พลาด **ไม่มีทางกลับแบบรันไฟล์เรียงกัน**', 'รัน 0407 ซ้ำหลังไฟล์นี้ = คำอธิบายคอลัมน์กลับเป็นข้อความของ 0407'], 'ห้ามรันซ้ำ');
  /* เนื้อเก่าไม่มีชิ้นของ 0409 จริง (รันซ้ำ = หาย) · "chain = 2 · marks = 2" หลังรัน 0379 ซ้ำ = ขั้นส่ง/อนุมัติยังครบ ตัวตรวจ/ตัวเขียนหายทั้งแพตช์เดิมและป้าย */
  for (const fn of FNS) assert.equal(occurrences(functionBlock(LAST_DEFINER[fn], fn).body, 'packQty'), 0, `เนื้อของ ${fn} ใน ${LAST_DEFINER[fn]} ไม่มี packQty`);
  const { texts: after } = applied();
  const rerun0379 = { ...after, [CHECK]: functionBlock(LAST_DEFINER[CHECK], CHECK), [WRITE]: functionBlock(LAST_DEFINER[WRITE], WRITE) };
  assert.equal(FNS.filter((fn) => CHAIN_NEEDLES[fn].every((needle) => rerun0379[fn].body.includes(needle))).length, 2, 'หลังรัน 0379 ซ้ำ: chain = 2');
  assert.equal(rows().filter((r) => rerun0379[r.fn].body.includes(r.marker)).length, 2, 'หลังรัน 0379 ซ้ำ: marks = 2 (S1 · A1)');
});

test('ทุกรหัสที่ 0409 โยนมีข้อความไทย (documentWorkflowErrors.js) — รหัสของสองตัวช่วย + ด่านของไฟล์เจ็ดตัว', () => {
  /* รวมรหัสที่อยู่ในข้อความที่ปะลงฟังก์ชัน (H1 · W0) — อ่านจากตัวไฟล์ทั้งก้อน ไม่ตัดสตริง */
  const raised = [...new Set([...BODY.matchAll(/RAISE EXCEPTION '([a-z0-9_]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(raised, ['historical_so_line_pack_qty_invalid', 'mig_0409_historical_in_flight', 'mig_0409_needs_0407', 'mig_0409_needs_chain', 'mig_0409_needs_functions',
    'mig_0409_patch_anchor', 'mig_0409_patch_overload', 'mig_0409_verify'], 'รหัสของ 0409 มีแปดตัว');
  for (const code of raised) assert.ok(HEADER.includes(code), `หัวไฟล์ต้องเอ่ยรหัส ${code}`);
  /* รหัสที่ไม่อยู่ในตาราง = จอได้ข้อความกลาง "ดำเนินการกับเอกสารไม่สำเร็จ" (500) — ผู้คีย์ไม่รู้ว่าต้องกลับไปใส่ "แพ็ค/เดือน" */
  const missing = raised.filter((code) => !WORKFLOW_ERROR_CODES.includes(code));
  assert.deepEqual(missing, [], 'รหัสที่ยังไม่มีข้อความไทย (documentWorkflowErrors.js)');
});

test('หัวของยามรุ่นก่อน (0374 · 0379 · 0394 · 0407) ชี้มาที่ 0409 และยามนี้ — ตัวหนังสือที่ยามพวกนั้นอ่านไม่ใช่เนื้อที่รันจริงทั้งหมดแล้ว', () => {
  const headOf = (file) => {
    const text = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    return text.slice(0, text.indexOf('\nimport '));
  };
  for (const file of ['historicalApprovalMigration.test.mjs', 'historicalQuoteLinesMigration.test.mjs', 'historicalServiceAlignmentMigration.test.mjs']) {
    const head = headOf(file);
    assert.match(head, /0409/, `${file}: หัวไฟล์ต้องบอกว่า 0409 ปะทับ`);
    assert.match(head, /historicalPackQtyMigration\.test\.mjs/, `${file}: หัวไฟล์ต้องชี้มาที่ยามนี้`);
  }
  /* ยาม 0407 ถือตัวสะดุดของไฟล์หลัง 0409 (T27) — นิยามทับทั้งก้อนต้องพกชิ้นของ 0409 */
  const guard0407 = readFileSync(new URL('./linePackMigration.test.mjs', import.meta.url), 'utf8');
  assert.match(guard0407, /historicalPackQtyMigration\.test\.mjs/);
  assert.ok(guard0407.includes(`'${FILE}'`), 'linePackMigration.test.mjs ต้องสแกนไฟล์หลัง 0409');
});

/* 🔒 ตัวหนังสือของไฟล์ = ไบต์ที่ฮาร์เนสพิสูจน์ (harness-0409 55/55 สองรอบผลเหมือนกัน · mutate-0409 97/97 · critic-probe-0409-money 21/21)
     และ = ไบต์ที่ PREFLIGHT-0409.sql / RUN-0409.sql ถูกสร้างจากมัน (handoff-0409.mjs — RUN ขึ้นต้นด้วยไฟล์นี้ทุกไบต์)
     · แก้ไฟล์ (แม้คอมเมนต์ — หัวไฟล์คือ SELECT/บล็อกถอยที่เจ้าของถือไว้ใช้) = รันฮาร์เนสทั้งชุดใหม่บนไบต์ใหม่ สร้างไฟล์ส่งมอบสองไฟล์ใหม่
       แล้วย้ายหมุดในคอมมิตเดียวกัน
     · หลังเจ้าของรันไฟล์บนฐานจริงแล้ว **ห้ามแก้อีก**: แถวปะที่มีป้ายแล้วถูกข้าม ⇒ ข้อความใหม่ไม่มีวันถึงฐาน · SQL ที่ต้องเปลี่ยน = migration ใหม่
       (และพกชิ้นของ 0409 ถ้าเขียนสี่ฟังก์ชันนี้ทับ — T27 ใน linePackMigration.test.mjs) */
test('🔒 sha256 + จำนวนบรรทัด: ไฟล์ migration ต้องเท่าฉบับที่ฮาร์เนสพิสูจน์ทุกไบต์', () => {
  const bytes = readFileSync(new URL(FILE, MIGRATIONS));
  assert.equal(sha256(bytes), 'c06e7df8c3153b8029f8a358339eb3237df5c7db2266fbf65802da1c2789bcac',
    'แก้ 0409_historical_so_line_pack_qty.sql = รัน harness-0409 · mutate-0409 ใหม่บนไบต์ใหม่ สร้าง PREFLIGHT-0409.sql / RUN-0409.sql ใหม่ แล้วย้ายหมุดนี้ในคอมมิตเดียวกัน');
  const text = bytes.toString('utf8');
  assert.ok(text.endsWith(";\n"), 'ไฟล์จบด้วยขึ้นบรรทัดใหม่หนึ่งตัว');
  assert.equal(text.split('\n').length - 1, 648, '648 บรรทัด — RUN-0409.sql ขึ้นต้นด้วย 648 บรรทัดนี้ทุกไบต์');
});
