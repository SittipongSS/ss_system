// ── ยามของ mig 0360 ใบสั่งขายย้อนหลัง (SO ย้อนหลัง) ─────────────────────────────
//
// ⭐ ใบย้อนหลังเก็บยอดจริงไว้ในใบ แล้ว **กรองที่ตัวคำนวณ** (มติข้อ 2) ⇒ ตัวคำนวณในฐานที่ลืมกรอง
//    = ยอดที่ออกบิลนอกระบบไปแล้วกลับมาเป็น Actual ของเดือนที่คีย์ (approvedAt = เวลาคีย์)
//    เทสต์นี้อ่าน **นิยามล่าสุดในโฟลเดอร์ migrations** ไม่ตรึงชื่อไฟล์ (ยกเว้นตัวไฟล์ 0360 เอง)
//
// 🔑 คำตอบคำถามเปิดของแผน P1 (15/09/2026) ที่ตรึงไว้ที่นี่:
//    ข้อ 1 AE บังคับ — ดีลภาชนะ ownerId ห้ามว่าง · UNIQUE (ลูกค้า, AE) ไม่มี COALESCE
//    ข้อ 4 ย้ายเจ้าของรายใบชนดีลภาชนะของ AE ปลายทาง = 23505 ของ index ชื่อนี้ (route แปลเป็น 409)
//
// ⚠️ ค่าคงที่ฝั่ง JS (`lib/sales/historicalOrders.js` — มากับคอมมิตโค้ด) ต้องเทียบกับตัวเลขที่ตรึงใน
//    SQL_LIMITS ข้างล่าง · ไฟล์นี้เทียบ SQL กับ CHECK ของตารางเดิมก่อน (ตัวตรวจงวดต้องไม่หลวมกว่า/ไม่แน่นกว่าตาราง)
//
// ⭐ mig 0374 (มติ 22/09) แทนโมเดล "เกิดเป็นอนุมัติแล้ว" — ใบเกิดเป็นร่าง · AE Sup อนุมัติ · โซนจากทะเบียน · งวดยกมา
//    ยามที่อ่าน **นิยามล่าสุด** (rpc / latestConstraintBody) จึงตรึงโมเดลใหม่ ส่วนยามที่อ่านตัวไฟล์ 0360 (SQL /
//    constraintBody) ตรึงประวัติของไฟล์นั้นต่อ · ยามรายละเอียดของ 0374 อยู่ที่ historicalApprovalMigration.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE_0360 = '0360_sales_order_historical_origin.sql';
const sqlFiles = () => readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const squeeze = (sql) => stripComments(sql).replace(/\s+/g, ' ').trim();

const RAW = read(FILE_0360);
const SQL = stripComments(RAW);

/* ตัวเลขที่ JS ต้องตรงกับ SQL — คอมมิตโค้ดเทียบ HISTORICAL_REF_MAX / INSTALLATION_POINT_MAX /
   INSTALLMENT_LABEL_MAX / EXEMPT_REASON_MIN / EXEMPT_REASON_MAX / DOC_DATE_MIN / DOC_DATE_MAX กับชุดนี้ */
const SQL_LIMITS = Object.freeze({
  refMax: 200, installationPointMax: 200, installmentLabelMax: 120,
  exemptReasonMin: 10, exemptReasonMax: 500, docDateMin: '2000-01-01', docDateMax: '2100-12-31',
  installmentNoteMax: 1000,
});

function latestDefinitionOf(fnName) {
  const marker = `CREATE OR REPLACE FUNCTION public.${fnName}(`;
  const owning = sqlFiles().filter((name) => read(name).includes(marker));
  assert.ok(owning.length, `ต้องมี migration ที่นิยาม ${fnName}`);
  const file = owning[owning.length - 1];
  const sql = read(file);
  const from = sql.lastIndexOf(marker);
  const to = sql.indexOf('\n$$;', from);
  assert.ok(to > from, `หาปลายนิยาม ${fnName} ใน ${file} ไม่เจอ`);
  return { file, body: sql.slice(from, to) };
}

/* นิยามล่าสุดของ **ทุกฟังก์ชัน** (ไฟล์ใหม่กว่าทับไฟล์เก่า · ในไฟล์เดียวกันตัวหลังทับตัวหน้า) */
function allLatestDefinitions() {
  const latest = new Map();
  for (const file of sqlFiles()) {
    const sql = stripComments(read(file));
    for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z0-9_]+)\s*\(/gi)) {
      const tag = /AS\s+(\$[A-Za-z_]*\$)/.exec(sql.slice(m.index));
      if (!tag) continue;
      const open = m.index + tag.index + tag[0].length;
      const close = sql.indexOf(tag[1], open);
      if (close < 0) continue;
      latest.set(m[1], { file, body: sql.slice(m.index, close) });
    }
  }
  return latest;
}

/* แยกรายการคั่นคอมมาชั้นนอกสุด (แพตเทิร์น serviceRoundsCopyPaths.test.mjs) */
function topLevelItems(block) {
  const inner = block.trim().replace(/^\(/, '').replace(/\)$/, '');
  const out = [];
  let depth = 0; let quote = null; let cur = '';
  for (const ch of inner) {
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

function matchingParen(text, open) {
  let depth = 0; let quote = null;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '(') depth += 1;
    if (ch === ')') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

/* คอลัมน์ → ค่า ของ INSERT ตัวแรกเข้าตารางนั้น · ชื่อกับค่าต้องนับได้เท่ากันเสมอ
   (เติมชื่อแล้วลืมค่า = migration พังตอนผู้ใช้รันมือ ซึ่งแพงที่สุด) */
function insertPairs(body, table) {
  const start = body.indexOf(`INSERT INTO public.${table} (`);
  assert.ok(start >= 0, `หา INSERT INTO public.${table} ไม่เจอ`);
  const block = body.slice(start);
  const open = block.indexOf('(');
  const close = matchingParen(block, open);
  const cols = topLevelItems(block.slice(open, close + 1)).map((c) => c.replace(/"/g, ''));
  let rest = block.slice(close + 1).trimStart();
  let vals;
  if (/^VALUES/i.test(rest)) {
    rest = rest.replace(/^VALUES\s*/i, '');
    const o = rest.indexOf('(');
    vals = topLevelItems(rest.slice(o, matchingParen(rest, o) + 1));
  } else {
    assert.match(rest, /^SELECT\b/i, `${table}: ฝั่งค่าต้องเป็น VALUES หรือ SELECT`);
    rest = rest.replace(/^SELECT\s*/i, '').replace(/\bFROM\s+jsonb_array_elements[\s\S]*$/i, '');
    vals = topLevelItems(`(${rest})`);
  }
  assert.equal(vals.length, cols.length, `${table}: INSERT มีชื่อคอลัมน์ ${cols.length} ตัว แต่ค่า ${vals.length} ตัว`);
  return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
}

/* เหมือน insertPairs แต่ฝั่งค่าเป็น SELECT ที่ FROM ซับคิวรี/JOIN — ตัดที่ FROM ชั้นนอกสุดตัวแรก */
function insertPairsFrom(body, table) {
  const start = body.indexOf(`INSERT INTO public.${table} (`);
  assert.ok(start >= 0, `หา INSERT INTO public.${table} ไม่เจอ`);
  const block = body.slice(start);
  const open = block.indexOf('(');
  const close = matchingParen(block, open);
  const cols = topLevelItems(block.slice(open, close + 1)).map((c) => c.replace(/"/g, ''));
  const rest = block.slice(close + 1).trimStart();
  assert.match(rest, /^SELECT\b/i, `${table}: ฝั่งค่าต้องเป็น SELECT`);
  const select = rest.replace(/^SELECT\s*/i, '');
  let depth = 0; let quote = null; let end = -1;
  for (let i = 0; i < select.length; i += 1) {
    const ch = select[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth === 0 && /^\bFROM\b/i.test(select.slice(i, i + 5)) && /\s/.test(select[i - 1] || ' ')) { end = i; break; }
  }
  assert.ok(end > 0, `${table}: หา FROM ของ SELECT ไม่เจอ`);
  const vals = topLevelItems(`(${select.slice(0, end)})`);
  assert.equal(vals.length, cols.length, `${table}: INSERT มีชื่อคอลัมน์ ${cols.length} ตัว แต่ค่า ${vals.length} ตัว`);
  return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
}

const constraintBody = (name) => {
  const from = SQL.indexOf(`ADD CONSTRAINT ${name}`);
  assert.ok(from >= 0, `ไม่มี ADD CONSTRAINT ${name}`);
  return squeeze(SQL.slice(from, SQL.indexOf(';', from)));
};

/* นิยามล่าสุดของ CHECK ชื่อนี้ข้ามทุก migration (ไฟล์ใหม่กว่าทับ · ในไฟล์เดียวกันตัวหลังทับ) — CHECK ที่ 0374 แทนแล้ว
   ต้องตรึงของที่ฐานใช้อยู่จริง ไม่ใช่ของ 0360 */
function latestConstraintBody(name) {
  let latest = null;
  for (const file of sqlFiles()) {
    const sql = stripComments(read(file));
    const from = sql.lastIndexOf(`ADD CONSTRAINT ${name}`);
    if (from >= 0) latest = { file, body: squeeze(sql.slice(from, sql.indexOf(';', from))) };
  }
  assert.ok(latest, `ไม่มี ADD CONSTRAINT ${name} ในโฟลเดอร์ migrations`);
  return latest;
}

const rpc = (name) => stripComments(latestDefinitionOf(name).body);

/* สองสายของ CHECK รูปทรง — แยกที่ OR ชั้นนอกสุดก่อนสาย historical (สายนั้นมี `) OR (` ข้างในเองแล้วตั้งแต่ 0374) */
function originBranches(shape) {
  const at = shape.indexOf(") OR ( origin = 'historical'");
  assert.ok(at > 0, 'หาจุดแยกสาย pipeline/historical ไม่เจอ');
  return [shape.slice(0, at), shape.slice(at)];
}

// ═══ 1) cache Actual / ยอดรออนุมัติของดีล ═══════════════════════════════════════

for (const name of ['sync_sales_order_actual', 'enforce_sales_order_actual_on_deal']) {
  test(`${name}: ทุก SELECT จาก sales_orders กรอง origin = 'pipeline' (สองก้อนพอดี)`, () => {
    const { file, body } = latestDefinitionOf(name);
    const clauses = [...stripComments(body).matchAll(/FROM public\.sales_orders[\s\S]*?;/g)].map((m) => m[0]);
    assert.equal(clauses.length, 2, `${file}: คาด SELECT จาก sales_orders 2 ก้อน (Actual + รออนุมัติ)`);
    for (const clause of clauses) assert.match(clause, /(so\.)?origin = 'pipeline'/, `${file}: ${clause}`);
  });

  /* 🪤 ยามรายก้อนข้างบนดูแค่ "มีตัวกรอง" — `... AND origin = 'pipeline' OR origin = 'historical';` ก็ผ่าน
     (AND ผูกก่อน OR ⇒ ใบย้อนหลังทั้งฐานเข้า wonValue ทุกดีล) · ตัด COALESCE / updatedAt / actualSource ก็ผ่าน
     ⇒ ตรึงคำสัญญาของหัวไฟล์: ตัดตัวกรองสองจุดออกแล้วต้องเท่ากับ 0353 ทั้งก้อน */
  test(`${name}: นิยามใน 0360 = 0353 ทุกตัวอักษร + origin = 'pipeline' สองจุดเท่านั้น`, () => {
    const { file, body } = latestDefinitionOf(name);
    if (file !== FILE_0360) return; // ไฟล์ใหม่กว่าเป็นเจ้าของ = ยามรายก้อนด้านบนเฝ้าต่อ
    const filter = /\s+AND (so\.)?origin = 'pipeline'/g;
    assert.equal((stripComments(body).match(filter) || []).length, 2, `${name}: ตัวกรองต้องมีสองจุดพอดี`);
    const src = read('0353_so_pending_approval_amount.sql');
    const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
    const from = src.lastIndexOf(marker);
    assert.ok(from >= 0, `0353 ไม่มีนิยาม ${name}`);
    assert.equal(
      squeeze(stripComments(body).replace(filter, '')),
      squeeze(src.slice(from, src.indexOf('\n$$;', from))),
      `${name}: 0360 ต่างจาก 0353 นอกเหนือจากตัวกรอง origin`,
    );
  });
}

test('sales_order_actual_trigger ไม่ถูกคัดไปแก้หลัง 0108 — sync ที่กรองแล้วคือทางเดียว', () => {
  assert.equal(latestDefinitionOf('sales_order_actual_trigger').file, '0108_sales_order_manual_approval_correction.sql');
});

/* 🪤 ยามข้างบนตรึงแค่ **ตัวฟังก์ชัน** ของ trigger ไม่ใช่ CREATE TRIGGER ที่ทำให้มันยิง · ยามรันซ้ำได้ของ 0360
   บังคับแค่ "DROP ก่อน CREATE" ไม่ห้าม DROP ลอย ๆ ⇒ เติม `DROP TRIGGER IF EXISTS sales_orders_sync_actual_trg`
   ในไฟล์นี้ = อนุมัติ/ยกเลิก/ย้อนใบ pipeline ไม่ขยับ wonValue/wonMonth/soPending* ของดีลอีกเลย โดยเทสต์เขียวหมด */
test('🪤 trigger Actual/เจ้าของใบยังยิง — คำสั่งสุดท้ายของแต่ละตัวคือ CREATE เดิม (ไม่มี DROP/ALTER/DISABLE ตามหลัง)', () => {
  const EXPECT = {
    sales_orders_sync_actual_trg: ['0279_won_month_from_so_approval.sql',
      'CREATE TRIGGER sales_orders_sync_actual_trg AFTER INSERT OR UPDATE OF status, "actualAmount", "orderDate", "approvedAt", "dealId" OR DELETE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.sales_order_actual_trigger()'],
    sales_deals_enforce_so_actual_trg: ['0110_enforce_approved_so_actual.sql',
      'CREATE TRIGGER sales_deals_enforce_so_actual_trg BEFORE INSERT OR UPDATE OF stage, "wonValue", metadata ON public.sales_deals FOR EACH ROW EXECUTE FUNCTION public.enforce_sales_order_actual_on_deal()'],
    sales_orders_snapshot_owner_trg: ['0294_sales_order_owner_snapshot.sql',
      'CREATE TRIGGER sales_orders_snapshot_owner_trg BEFORE INSERT OR UPDATE OF status ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.snapshot_sales_order_owner()'],
  };
  for (const [trg, [wantFile, wantDdl]] of Object.entries(EXPECT)) {
    const touch = new RegExp(
      `(?:CREATE\\s+(?:OR\\s+REPLACE\\s+)?|DROP\\s+|ALTER\\s+)TRIGGER\\s+(?:IF\\s+EXISTS\\s+)?${trg}\\b`
      + `|(?:DISABLE|ENABLE)(?:\\s+REPLICA|\\s+ALWAYS)?\\s+TRIGGER\\s+${trg}\\b`, 'gi');
    let last = null;
    for (const file of sqlFiles()) {
      const sql = stripComments(read(file));
      for (const m of sql.matchAll(touch)) {
        last = { file, ddl: squeeze(sql.slice(m.index, sql.indexOf(';', m.index))) };
      }
    }
    assert.deepEqual(last, { file: wantFile, ddl: wantDdl }, `${trg}: คำสั่งล่าสุดที่แตะ trigger นี้ต้องเป็น CREATE เดิม`);
  }
  // ปิดทั้งตาราง / ลบฟังก์ชัน trigger แบบ CASCADE = trigger หายโดยไม่เอ่ยชื่อ
  assert.doesNotMatch(SQL, /DISABLE\s+TRIGGER\s+(?:ALL|USER)\b/i);
  assert.doesNotMatch(SQL,
    /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?public\.(?:sales_order_actual_trigger|enforce_sales_order_actual_on_deal|snapshot_sales_order_owner|sync_sales_order_actual)\b/i);
});

/* 🪤 ตัวคำนวณในฐานที่อ่านใบอนุมัติ = ต้องกรอง origin หรือประกาศว่า "ตรวจสถานะรายใบ ไม่รวมยอด" */
const SQL_STATE_CHECK_ONLY = new Map([
  ['approve_sales_order_with_signature_evidence_atomic', 'ขั้นอนุมัติใบร่าง/รออนุมัติ — ใบย้อนหลังเกิดเป็น approved ไม่เคยผ่าน (0197)'],
  ['cancel_sales_order_with_reversal_atomic', 'ย้อน Won ตอนยกเลิก — ดีลภาชนะติด CHECK stage = won ⇒ ทรานแซกชันล้ม (0170)'],
  ['capture_issued_sales_order_snapshot_atomic', 'ฉบับตรึงตอนอนุมัติ — ตรวจสถานะรายใบ ไม่รวมยอด (0148)'],
  ['finance_approve_sales_order_with_signature_evidence_atomic', "ขั้นบัญชีปิดใบต้อง financeStatus 'pending' — ใบย้อนหลังว่างเสมอ (0251)"],
  ['revoke_sales_order_approval_atomic', 'ย้อนอนุมัติ — ใบย้อนหลังตายที่ CHECK sales_orders_origin_shape (0166)'],
  ['create_historical_sales_order', "ตัวเขียนของใบย้อนหลังเอง — 'approved' คือสถานะอนุมัติของลูกค้า ไม่รวมยอดใบ (0360 → 0374)"],
  ['approve_historical_sales_order',
    'ขั้นอนุมัติใบย้อนหลัง — ตรวจ/เปลี่ยนสถานะใบเดียวที่ส่งเข้ามา ไม่รวมยอด · ไม่แตะ actualAmount (0374)'],
  /* 🪤 allLatestDefinitions ไม่เห็น DROP FUNCTION ⇒ นิยามเก่ายังนับเป็น "ล่าสุด" · คงไว้พร้อมเหตุผลตามจริง */
  ['append_historical_installments', 'ถูก DROP ใน 0374 — นิยามเก่ายังอยู่ในไฟล์ 0360 (ตรวจสถานะใบก่อนเพิ่มงวด ไม่รวมยอด)'],
  ['remove_historical_sales_order_line', 'ถูก DROP ใน 0374 — นิยามเก่ายังอยู่ในไฟล์ 0366 (แตะใบเดียว ไม่รวมยอด)'],
  ['guard_product_spec_document_revision',
    'ยามของ Rev เอกสาร FM-SA-04 — ตรวจว่า SO ของเอกสารยัง approved ตอนเดินหน้า ไม่รวมยอด · ใบย้อนหลังออกเอกสารไม่ได้อยู่แล้ว (0370)'],
]);

test('🪤 ทุกฟังก์ชันในฐานที่อ่านใบสั่งขายอนุมัติแล้ว กรอง origin หรืออยู่ในรายการตรวจสถานะล้วน', () => {
  const candidates = [...allLatestDefinitions()]
    .filter(([, { body }]) => body.includes('public.sales_orders') && body.includes("'approved'"));
  assert.ok(candidates.length >= 7, `เจอฟังก์ชันแค่ ${candidates.length} ตัว — ตัวไล่น่าจะพัง`);
  const leaks = candidates
    .filter(([name, { body }]) => !/origin = 'pipeline'/.test(body) && !SQL_STATE_CHECK_ONLY.has(name))
    .map(([name, { file }]) => `${name} (${file})`);
  assert.deepEqual(leaks, [],
    'ฟังก์ชันเหล่านี้อ่านใบอนุมัติแต่ไม่กรอง origin = \'pipeline\' → ใบย้อนหลังรั่วเข้ายอด\n'
    + '  → ถ้ารวมยอด: เติมตัวกรอง · ถ้าแค่ตรวจสถานะรายใบ: เติมเข้า SQL_STATE_CHECK_ONLY พร้อมเหตุผล');
  const names = new Set(candidates.map(([name]) => name));
  const ghosts = [...SQL_STATE_CHECK_ONLY.keys()].filter((name) => !names.has(name));
  assert.deepEqual(ghosts, [], 'รายการตรวจสถานะล้วนมีชื่อที่ไม่อ่านใบอนุมัติแล้ว — ลบออก');
});

// ═══ 2) ตัวไฟล์ 0360 ═══════════════════════════════════════════════════════════

test('0360: CHECK รูปทรงมาก่อนปลด NOT NULL ของ quotationId', () => {
  const shape = SQL.indexOf('ADD CONSTRAINT sales_orders_origin_shape');
  const relax = SQL.indexOf('ALTER COLUMN "quotationId" DROP NOT NULL');
  assert.ok(shape > 0 && relax > 0, 'ต้องมีทั้งสองคำสั่ง');
  assert.ok(shape < relax, 'ปลด NOT NULL ก่อนมี CHECK = ช่วงที่ใบ pipeline ไม่มีใบเสนอราคาหลุดเข้าได้');
});

test('0360: ไม่มีข้อความที่ทำให้ยามตัวอื่นอ่านนิยามผิดไฟล์', () => {
  // serviceRoundsCopyPaths.test.mjs ถือว่าไฟล์ที่มีข้อความนี้ (แม้ในคอมเมนต์) เป็นเจ้าของนิยามล่าสุด
  assert.ok(!RAW.includes('FUNCTION public.create_sales_order_draft'));
  assert.ok(!RAW.includes('FUNCTION public.revise_approved_sales_order_atomic'));
  for (const fn of ['sync_sales_order_actual', 'enforce_sales_order_actual_on_deal']) {
    assert.equal(RAW.split(`CREATE OR REPLACE FUNCTION public.${fn}(`).length - 1, 1, `${fn} ต้องมีนิยามเดียว`);
  }
});

test('0360: คอลัมน์ของ sales_orders เพิ่มในคำสั่ง ALTER TABLE ชั้นนอก — ยามคอลัมน์ Rev./ใบร่างมองเห็น', () => {
  const seen = new Set();
  for (const m of SQL.matchAll(/ALTER TABLE (?:ONLY )?public\.sales_orders([\s\S]*?);/g)) {
    for (const c of m[1].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?([A-Za-z_][A-Za-z0-9_]*)"?/g)) seen.add(c[1]);
  }
  assert.deepEqual([...seen].sort(), [
    'historicalExpressRef', 'historicalIntakeHash', 'historicalInvoiceRef', 'historicalQuoteRef', 'origin',
    'paymentGateExemptAt', 'paymentGateExemptById', 'paymentGateExemptByName', 'paymentGateExemptReason',
  ]);
  assert.doesNotMatch(SQL, /EXECUTE\s+format/i, 'DDL ผ่าน EXECUTE = ยามอ่านไม่เห็น');
  for (const m of SQL.matchAll(/DO \$\$([\s\S]*?)\$\$;/g)) {
    assert.doesNotMatch(m[1], /ADD COLUMN/i, 'ADD COLUMN ใน DO block = ยามอ่านไม่เห็น');
  }
});

test('0360: รันซ้ำได้ และนิยามบนฐานตรงกับไฟล์เสมอ (ไม่ข้ามเงียบเพราะชื่อซ้ำ)', () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^COMMIT;/m);
  for (const m of SQL.matchAll(/ADD COLUMN(?! IF NOT EXISTS)/g)) assert.fail(`ADD COLUMN ไม่มี IF NOT EXISTS ที่ ${m.index}`);
  for (const m of SQL.matchAll(/ADD CONSTRAINT ([a-z0-9_]+)/g)) {
    const drop = SQL.indexOf(`DROP CONSTRAINT IF EXISTS ${m[1]};`);
    assert.ok(drop >= 0 && drop < m.index, `${m[1]}: ต้อง DROP CONSTRAINT IF EXISTS ก่อน ADD`);
  }
  for (const m of SQL.matchAll(/CREATE TRIGGER ([a-z0-9_]+)/g)) {
    const drop = SQL.indexOf(`DROP TRIGGER IF EXISTS ${m[1]} `);
    assert.ok(drop >= 0 && drop < m.index, `${m[1]}: ต้อง DROP TRIGGER IF EXISTS ก่อน CREATE`);
  }
  for (const m of SQL.matchAll(/CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?([a-z0-9_]+)/g)) {
    const drop = SQL.indexOf(`DROP INDEX IF EXISTS public.${m[1]};`);
    assert.ok(drop >= 0 && drop < m.index, `${m[1]}: ต้อง DROP INDEX IF EXISTS ก่อน CREATE`);
  }
  assert.doesNotMatch(SQL, /CREATE FUNCTION/, 'ฟังก์ชันต้อง CREATE OR REPLACE');
});

test('0360: ไม่ backfill — นอกตัวฟังก์ชันไม่มี INSERT/UPDATE/DELETE (ห้ามวนคิดทุกดีลใหม่ · บทเรียน 0353)', () => {
  const outsideBodies = SQL.replace(/\$\$[\s\S]*?\$\$/g, ' ');
  assert.doesNotMatch(outsideBodies, /\b(INSERT INTO|UPDATE|DELETE FROM)\s+public\./);
});

test('0360: หัวไฟล์บอกลำดับรัน · วิธีลองแบบ ROLLBACK · คำสั่งตรวจหลังรัน', () => {
  const header = RAW.slice(0, RAW.indexOf('\nBEGIN;'));
  assert.match(header, /รันก่อน merge โค้ด JS/);
  assert.match(header, /ลองก่อนรันจริง/);
  assert.match(header, /--\s+ROLLBACK;/);
  assert.match(header, /ตรวจหลังรัน/);
  assert.match(header, /has_function_privilege/);
});

// ═══ 3) รูปทรงดีลภาชนะ + AE บังคับ (คำตอบข้อ 1 · ข้อ 4) ════════════════════════

test('ดีลภาชนะ: CHECK ตรึงทุกช่องที่ตัวอ่าน KPI ใช้ + ownerId ห้ามว่าง', () => {
  const shape = constraintBody('sales_deals_historical_shape');
  for (const piece of [
    "origin = 'pipeline' OR (",
    "stage = 'won'", "line = 'SERVICE'", `"dealType" = 'RE-ORDER'`, '"projectId" IS NULL',
    '"customerId" IS NOT NULL', '"ownerId" IS NOT NULL', 'team IS NOT NULL',
    '"projectValue" = 0', '"forecastManualValue" = 0', `"forecastSource" = 'manual'`,
    '"confirmedAt" IS NULL', '"forecastMonth" IS NULL', '"leadId" IS NULL', '"parentDealId" IS NULL',
    "(metadata->>'legacy') IS DISTINCT FROM 'true'",
  ]) {
    assert.ok(shape.includes(piece), `CHECK ดีลภาชนะขาด ${piece}`);
  }
});

test('ดีลภาชนะ: UNIQUE (ลูกค้า, AE) เฉพาะ historical — ไม่มี COALESCE เพราะ AE ห้ามว่าง', () => {
  assert.ok(squeeze(SQL).includes(
    'CREATE UNIQUE INDEX sales_deals_historical_container_uk ON public.sales_deals ("customerId", "ownerId") WHERE origin = \'historical\';',
  ));
  assert.doesNotMatch(SQL, /COALESCE\("ownerId"/);
});

test('RPC สร้างใบ: AE บังคับก่อนแตะอะไร · ล็อก/หาดีลด้วย AE ตรง ๆ · ดีลใหม่ต้องมีชื่อ AE จาก server', () => {
  const body = rpc('create_historical_sales_order');
  const ownerRequired = body.indexOf("RAISE EXCEPTION 'historical_so_owner_required'");
  assert.ok(ownerRequired > 0 && ownerRequired < body.indexOf('pg_advisory_xact_lock('), 'ตรวจ AE ก่อนล็อก/อ่าน/เขียน');
  assert.match(body, /pg_advisory_xact_lock\(hashtext\('historical_so:' \|\| v_customer_id \|\| ':' \|\| v_owner_id\)\)/);
  assert.match(body, /AND "ownerId" = v_owner_id\s+FOR UPDATE/);
  assert.match(body, /p_new_deal->>'ownerName'/);
  assert.match(body, /'ownerId', v_owner_id/);
  assert.match(body, /'origin', 'historical'/);
  // ตัวออกรหัสทิ้งคีย์ที่ไม่มีคอลัมน์เงียบ ๆ ⇒ ต้องตรวจ origin หลังสร้างดีล
  assert.ok(body.indexOf("v_deal.origin IS DISTINCT FROM 'historical'") > body.indexOf('create_entity_rows_with_code('));
});

/* 🪤 ย้ายเจ้าของรายใบ (PATCH ธรรมดา ไม่ถือล็อก historical_so:) ย้ายดีลภาชนะมาหา AE คนเดียวกันขณะคีย์
   ⇒ SELECT ข้อ ⑩ ไม่เจอ แต่ insert ชน sales_deals_historical_container_uk หลังอีกฝั่ง commit
   ⇒ ถ้าปล่อย 23505 ออกไป route แปลเป็น 409 "มีดีลของ AE คนนั้นอยู่แล้ว" (ข้อความของการย้ายเจ้าของ) ทั้งที่กดใหม่ก็ผ่าน */
test('🪤 RPC สร้างใบ: ชนดีลภาชนะที่เพิ่งถูกย้ายมา = หาใหม่แล้วผูก · ไม่ปล่อย 23505 ของ container_uk ออกไป', () => {
  const body = rpc('create_historical_sales_order');
  const create = body.indexOf('create_entity_rows_with_code(');
  const handler = body.indexOf('EXCEPTION WHEN unique_violation THEN', create);
  const race = body.indexOf("RAISE EXCEPTION 'historical_so_container_deal_race'");
  assert.ok(create > 0 && handler > create && race > handler, 'ต้องจับ unique_violation รอบตัวสร้างดีลภาชนะ');
  // บล็อกที่จับต้องหุ้มแค่ตัวสร้างดีล — หุ้มกว้างกว่านั้น = ถอยของที่ไม่ควรถอย/กลืน error ของขั้นอื่น
  const guarded = body.slice(body.lastIndexOf('BEGIN', create), handler);
  assert.doesNotMatch(guarded, /INSERT INTO|UPDATE public\.|pg_advisory/, 'บล็อก EXCEPTION ต้องหุ้มแค่ create_entity_rows_with_code');
  const recover = body.slice(handler, race);
  assert.match(recover, /GET STACKED DIAGNOSTICS v_conflict = CONSTRAINT_NAME;/);
  assert.match(recover, /IF v_conflict IS DISTINCT FROM 'sales_deals_historical_container_uk' THEN RAISE; END IF;/,
    'unique_violation ตัวอื่น (id/รหัสชน) ต้องโยนต่อ ไม่ใช่กลืน');
  assert.match(recover, /WHERE origin = 'historical'\s+AND "customerId" = v_customer_id\s+AND "ownerId" = v_owner_id\s+FOR UPDATE;/,
    'หาดีลของคู่ใหม่ด้วยเงื่อนไขเดียวกับข้อ ⑩');
  // ดีลที่ย้ายมาแข่งต้องผ่านด่านสภาพดีลเหมือนดีลที่เจอตั้งแต่แรก · ดีลนั้นไม่ใช่ของใหม่ ⇒ ไม่ลงประวัติขั้น
  assert.ok(body.indexOf("RAISE EXCEPTION 'historical_so_deal_invalid'") > race, 'ด่านสภาพดีลต้องอยู่หลังทุกทางที่ได้ดีลมา');
  assert.ok(body.indexOf('INSERT INTO public.sales_deal_stage_history') > race, 'ประวัติขั้นลงเฉพาะทางที่สร้างดีลจริง');
  assert.match(body.slice(race, body.indexOf('INSERT INTO public.sales_deal_stage_history')), /ELSE/);
});

// ═══ 4) รูปทรงใบสั่งขาย ══════════════════════════════════════════════════════

/* นิยามล่าสุด (0374): ใบย้อนหลังเป็นร่าง/รออนุมัติ/ตีกลับได้แล้ว — approvedAt ผูกกับ approved เท่านั้น
   · ย้อนอนุมัติ/ออก Rev./ขั้นบัญชี/หลักฐานลายเซ็น/ยกเว้นด่านเงิน ยังตายที่ CHECK · คืนเป็นร่างหลังอนุมัติ = trigger ของ 0374 */
test('ใบสั่งขาย: CHECK สองสาย — pipeline ต้องมีใบเสนอราคา · historical ย้อนอนุมัติ/Rev./ขั้นบัญชีไม่ได้', () => {
  const { file, body: shape } = latestConstraintBody('sales_orders_origin_shape');
  assert.equal(file, '0374_historical_so_approval_flow.sql');
  const [pipeline, historical] = originBranches(shape);
  for (const piece of [`origin = 'pipeline'`, '"quotationId" IS NOT NULL', '"historicalIntakeHash" IS NULL', '"paymentGateExemptAt" IS NULL']) {
    assert.ok(pipeline.includes(piece), `สาย pipeline ขาด ${piece}`);
  }
  for (const piece of [
    `origin = 'historical'`, '"quotationId" IS NULL', '"projectId" IS NULL',
    "status IN ('draft', 'pending_approval', 'rejected', 'approved', 'cancelled')",
    `(status <> 'approved' OR ("approvedAt" IS NOT NULL AND "approvedBy" IS NOT NULL))`,
    `(status NOT IN ('draft', 'pending_approval', 'rejected') OR ("approvedAt" IS NULL AND "approvedBy" IS NULL))`,
    `(status <> 'pending_approval' OR "submittedAt" IS NOT NULL)`,
    `"approvalMode" IN ('standard', 'admin_override')`, '"revisionNo" = 0', '"revisedFromId" IS NULL',
    '"supersededById" IS NULL', '"financeStatus" IS NULL', '"signatureEvidenceId" IS NULL',
    '"proposerSignatureEvidenceId" IS NULL', '"historicalIntakeHash" IS NOT NULL', '"paymentGateExemptAt" IS NULL',
  ]) {
    assert.ok(historical.includes(piece), `สาย historical ขาด ${piece}`);
  }
  assert.ok(!historical.includes('approval_revoked') && !historical.includes("'revised'"), 'ย้อนอนุมัติ/Rev. ต้องยังตาย');
});

test('🪤 สาย pipeline ของ CHECK ใหม่เหมือน 0360 ทุกตัวอักษร — ADD CONSTRAINT ตรวจแถวเดิมทั้งหมดใหม่ (ห้ามแน่นขึ้น)', () => {
  assert.equal(
    originBranches(latestConstraintBody('sales_orders_origin_shape').body)[0],
    originBranches(constraintBody('sales_orders_origin_shape'))[0],
  );
});

test('origin แก้ไม่ได้หลังเกิด — trigger ทั้งสองตาราง', () => {
  assert.match(SQL, /RAISE EXCEPTION 'origin_immutable: % %'/);
  assert.match(SQL, /BEFORE UPDATE OF origin ON public\.sales_orders\s+FOR EACH ROW EXECUTE FUNCTION public\.guard_record_origin_immutable\(\)/);
  assert.match(SQL, /BEFORE UPDATE OF origin ON public\.sales_deals\s+FOR EACH ROW EXECUTE FUNCTION public\.guard_record_origin_immutable\(\)/);
});

test('🪤 Rev./ใบร่างไม่ก๊อป origin — ใบที่ก๊อปจากใบย้อนหลังตายที่ CHECK (quotationId ห้ามว่างในสาย pipeline)', () => {
  for (const [fn, end] of [['revise_approved_sales_order_atomic', 'RETURNING * INTO v_revision'], ['create_sales_order_draft', 'RETURNING * INTO v_order']]) {
    const body = rpc(fn);
    const insert = body.slice(body.indexOf('INSERT INTO public.sales_orders'), body.indexOf(end));
    assert.ok(insert.length > 50, `${fn}: หา INSERT ไม่เจอ`);
    assert.doesNotMatch(insert, /[(,]\s*"?origin"?[\s,)]/, `${fn} ห้ามก๊อป origin`);
  }
  assert.ok(latestConstraintBody('sales_orders_origin_shape').body.includes(`origin = 'pipeline' AND "quotationId" IS NOT NULL`));
});

// ═══ 5) ตัวเขียน (RPC) ════════════════════════════════════════════════════════

test('🔐 ฟังก์ชันใหม่ทุกตัว REVOKE จาก PUBLIC/anon/authenticated และให้ service_role เท่านั้น', () => {
  // ประวัติของ 0360 เอง (ฟังก์ชันเพิ่มงวด/ตัวรวมงวดถูก DROP ใน 0374 — สิทธิ์ของ 0374 ตรึงที่ historicalApprovalMigration.test.mjs)
  for (const fn of ['create_historical_sales_order', 'append_historical_installments', 'historical_so_installments_total']) {
    assert.match(SQL, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated;`), fn);
    assert.match(SQL, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+TO service_role;`), fn);
  }
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.guard_record_origin_immutable\(\) FROM PUBLIC, anon, authenticated;/);
  // ตัวเขียนที่ยังมีชีวิต (นิยามล่าสุด) ต้อง SECURITY DEFINER + ตรึง search_path
  for (const fn of ['create_historical_sales_order', 'update_historical_sales_order', 'submit_historical_sales_order', 'approve_historical_sales_order']) {
    assert.match(rpc(fn), /SECURITY DEFINER\s+SET search_path = public/, `${fn}: SECURITY DEFINER ต้องตรึง search_path`);
  }
});

/* ตัวเขียนตอนคีย์/แก้/ส่ง ไม่แตะรอบขายของโซน — รอบขายเกิดที่ขั้นอนุมัติ (approve_historical_sales_order) ที่เดียว
   · ตัวเขียนบรรทัดอ่านรอบขายเพื่อ **กัน** การลบ ไม่ได้เขียน ⇒ ไม่อยู่ในรายการนี้ (ยามของมันอยู่ที่เทสต์ 0374) */
test('RPC ไม่แตะของที่เป็นของขั้นอื่น (โซน · สถานะที่บัญชียืนยัน · ฉบับตรึง · ตัวช่วยที่ทิ้งคีย์เงียบ)', () => {
  for (const fn of [
    'create_historical_sales_order', 'update_historical_sales_order', 'submit_historical_sales_order',
    'historical_so_check_contract', 'historical_so_check_lines', 'historical_so_check_installments',
  ]) {
    const body = rpc(fn);
    for (const banned of ['master_row_', 'service_zone_terms', "'confirmed'", 'capture_issued_sales_order_snapshot']) {
      assert.ok(!body.includes(banned), `${fn} ห้ามมี ${banned}`);
    }
  }
});

test('RPC สร้างใบ: หัวใบเกิดเป็นร่างสายย้อนหลัง (0374) · ไม่เข้าขั้นบัญชี · ไม่มีใบเสนอราคา/โครงการ · ผูกเอกสารแทนสัญญา', () => {
  const order = insertPairs(rpc('create_historical_sales_order'), 'sales_orders');
  assert.equal(order.origin, "'historical'");
  assert.equal(order.status, "'draft'");
  assert.equal(order.quotationId, 'NULL');
  assert.equal(order.projectId, 'NULL');
  assert.equal(order.financeStatus, 'NULL');
  assert.equal(order.approvalMode, "'standard'");
  assert.equal(order.approvedAt, 'NULL', 'ร่องรอยอนุมัติเกิดที่ขั้น AE Sup อนุมัติเท่านั้น');
  assert.equal(order.approvedBy, 'NULL');
  assert.equal(order.serviceContractId, 'v_contract.id', 'ใบเกิดพร้อมเอกสารแทนสัญญา (ร่าง)');
  assert.ok(!Object.keys(order).some((col) => col.startsWith('paymentGateExempt')), 'สวิตช์ยกเว้นด่านเงินเลิกใช้');
  assert.equal(order.historicalIntakeHash, 'p_intake_hash');
  assert.equal(order.customerName, 'v_customer_name', 'ชื่อสำเนาอ่านจากทะเบียน ไม่รับจาก payload');
  assert.ok(!('ownerId' in order), 'ownerId มาจาก trigger snapshot_sales_order_owner (0294) ไม่ใช่ payload');
  assert.ok(!('signatureEvidenceId' in order));
});

/* 0374: บรรทัด = โซนจากทะเบียน (แทนมติข้อ 17) · งวดยังไม่หยุดยอดจนกว่า AE Sup อนุมัติ (บัญชียังไม่เห็น)
   ตัวเขียนบรรทัด+งวดตัวเดียวทั้งตอนสร้างและตอนแก้ (historical_so_write_children) */
test('RPC: บรรทัดชี้โซน · งวดเป็น pending ยังไม่หยุดยอด · มีชนิดงวด — ตัวเขียนเดียวทั้งสร้างและแก้', () => {
  const create = rpc('create_historical_sales_order');
  const children = rpc('historical_so_write_children');
  for (const [fn, body] of [['create', create], ['update', rpc('update_historical_sales_order')]]) {
    assert.match(body, /PERFORM public\.historical_so_write_children\(/, `${fn}: บรรทัด/งวดต้องผ่านตัวเขียนกลาง`);
    assert.ok(!body.includes('INSERT INTO public.sales_order_lines'), `${fn}: ห้ามเขียนบรรทัดเอง`);
    assert.ok(!body.includes('INSERT INTO public.sales_order_installments'), `${fn}: ห้ามเขียนงวดเอง`);
    assert.match(body, /public\.historical_so_check_installments\(/, `${fn}: ต้องผ่านตัวตรวจงวดกลาง`);
    assert.match(body, /public\.historical_so_check_lines\(/, `${fn}: ต้องผ่านตัวตรวจบรรทัดกลาง`);
  }
  const lines = insertPairsFrom(children, 'sales_order_lines');
  assert.equal(lines.serviceZoneId, 'z.id');
  assert.equal(lines.quotationLineId, 'NULL');
  assert.equal(lines.fgCode, 'p."fgCode"', 'รหัส FG อ่านจากทะเบียนสินค้า ไม่รับจาก payload');
  assert.match(lines.installationPoint, /left\(/, 'ภาพนิ่งชื่อไซต์·โซนต้องตัดให้ไม่เกิน CHECK');
  const inst = insertPairsFrom(children, 'sales_order_installments');
  assert.equal(inst.status, "'pending'");
  assert.equal(inst.frozenAt, 'NULL', 'หยุดยอดตอน AE Sup อนุมัติ ไม่ใช่ตอนคีย์');
  assert.equal(inst.kind, 'x.kind');
  assert.ok(!('confirmedAt' in inst) && !('reportedAt' in inst) && !('taxInvoiceNo' in inst));
});

test('RPC สร้างใบ: ส่งซ้ำได้ใบเดิมเฉพาะคำขอเดิมทุกตัวอักษร · ล็อกรหัสการคีย์ก่อนล็อกคู่ลูกค้า×AE', () => {
  const body = rpc('create_historical_sales_order');
  const keyLock = body.indexOf("pg_advisory_xact_lock(hashtext('historical_so_key:'");
  const pairLock = body.indexOf("pg_advisory_xact_lock(hashtext('historical_so:'");
  assert.ok(keyLock > 0 && pairLock > keyLock);
  const replay = body.slice(body.indexOf('IF FOUND THEN'), pairLock);
  assert.match(replay, /v_existing\."historicalIntakeHash" IS DISTINCT FROM p_intake_hash/);
  // 0374: ใบเกิดเป็นร่าง ⇒ ส่งซ้ำได้ใบเดิมทุกสถานะที่ยังไม่ยกเลิก (ฟอร์มกดซ้ำหลังเน็ตหลุด) · ใบที่ยกเลิกแล้วห้ามตอบว่าสำเร็จ
  assert.match(replay, /v_existing\.status = 'cancelled'/, 'ใบที่ยกเลิกแล้วห้ามตอบว่าสำเร็จ');
  assert.match(replay, /RAISE EXCEPTION 'historical_so_intake_key_conflict'/);
  assert.match(body, /v_order_id := 'SOR-H' \|\| substr\(md5\(p_intake_key\), 1, 16\);/,
    'รูปแบบ id ต้องตรงกับ historicalOrderIdOf ฝั่ง JS');
});

test('⭐ บล็อกออกเลขใบคัดจาก RPC สร้างใบร่างทุกตัวอักษร', () => {
  const block = (fn) => {
    const body = rpc(fn);
    const from = body.indexOf("v_now := timezone('Asia/Bangkok', now());");
    const endMarker = "'{REVISION}', '0');";
    const to = body.indexOf(endMarker, from);
    assert.ok(from > 0 && to > from, `${fn}: หาบล็อกออกเลขไม่เจอ`);
    return body.slice(from, to + endMarker.length).replace(/\s+/g, ' ');
  };
  assert.equal(block('create_historical_sales_order'), block('create_sales_order_draft'));
});

// ═══ 6) ตัวเลขต้องตรงกับ CHECK ของตาราง ════════════════════════════════════════

/* 0374: ตัวตรวจงวดตัวใหม่ (historical_so_check_installments) แทนตัวรวมงวดของ 0360 — ต้องไม่หลวมกว่า CHECK ของตาราง */
test('ตัวตรวจงวดเท่ากับ CHECK ของตาราง (0245 ชื่องวด/ยอด/วันที่/หมายเหตุ · 0320 ช่วงครอบ)', () => {
  const t0245 = squeeze(read('0245_sales_order_installments.sql'));
  const t0320 = squeeze(read('0320_installment_service_coverage.sql'));
  const v = squeeze(latestDefinitionOf('historical_so_check_installments').body);
  const { installmentLabelMax: labelMax, docDateMin: dMin, docDateMax: dMax, installmentNoteMax: noteMax } = SQL_LIMITS;
  assert.ok(t0245.includes(`CHECK (length(btrim(label)) BETWEEN 1 AND ${labelMax})`), '0245 ชื่องวด');
  assert.ok(v.includes(`length(btrim(COALESCE(v_item->>'label', ''))) NOT BETWEEN 1 AND ${labelMax}`));
  assert.ok(t0245.includes('CHECK (amount >= 0)'));
  assert.ok(v.includes('v_amount < 0'));
  assert.ok(t0245.includes(`"dueDate" BETWEEN '${dMin}' AND '${dMax}'`));
  assert.ok(t0320.includes(`"coversFrom" BETWEEN '${dMin}' AND '${dMax}'`) && t0320.includes('"coversFrom" <= "coversTo"'));
  for (const col of ['v_due', 'v_from', 'v_to']) {
    assert.ok(v.includes(`${col} NOT BETWEEN DATE '${dMin}' AND DATE '${dMax}'`), col);
  }
  assert.ok(v.includes('v_from > v_to'));
  assert.ok(t0245.includes(`length(note) <= ${noteMax}`), '0245 หมายเหตุงวด');
  assert.ok(v.split(`length(btrim(COALESCE(v_item->>'note', ''))) > ${noteMax}`).length - 1 === 2, 'หมายเหตุ ≤ 1000 ทั้งงวดยกมาและงวดปกติ');
});

test('ความยาว/ช่วงของใบย้อนหลังเท่ากันทั้ง CHECK และ RPC', () => {
  const { refMax, installationPointMax, exemptReasonMin, exemptReasonMax } = SQL_LIMITS;
  assert.match(read('0235_sales_order_reference_doc.sql'), new RegExp(`length\\("referenceDoc"\\) <= ${refMax}`), 'เลขเดิมยาวเท่า referenceDoc');
  const refs = constraintBody('sales_orders_historical_refs_len');
  for (const col of ['historicalQuoteRef', 'historicalExpressRef', 'historicalInvoiceRef']) {
    assert.ok(refs.includes(`length(btrim("${col}")) BETWEEN 1 AND ${refMax}`), col);
  }
  assert.ok(constraintBody('sales_order_lines_installation_point_len')
    .includes(`length(btrim("installationPoint")) BETWEEN 1 AND ${installationPointMax}`));
  // 0374: จุดติดตั้งเป็นภาพนิ่งชื่อไซต์·โซนที่ตัวเขียนประกอบเอง — ตัดไม่ให้เกิน CHECK
  assert.ok(squeeze(rpc('historical_so_write_children')).includes(`, ${installationPointMax}))`), 'ภาพนิ่งต้องตัดที่ความยาว CHECK');
  // CHECK ยกเว้นด่านเงินอยู่ต่อ (คอลัมน์ยังอยู่ ใบย้อนหลังต้องว่าง) — ไม่มี RPC ไหนเขียนแล้ว
  assert.ok(constraintBody('sales_orders_payment_gate_exempt_sane')
    .includes(`length(btrim("paymentGateExemptReason")) BETWEEN ${exemptReasonMin} AND ${exemptReasonMax}`));
  assert.ok(!squeeze(rpc('create_historical_sales_order')).includes('paymentGateExempt'), 'สวิตช์ยกเว้นด่านเงินเลิกใช้ (0374)');
  // วันที่ใบ = วันเริ่มสัญญา — ช่วงปีเดียวกับ CHECK วันที่ของงวด
  assert.ok(squeeze(rpc('historical_so_check_contract')).includes(`v_start NOT BETWEEN DATE '${SQL_LIMITS.docDateMin}' AND DATE '${SQL_LIMITS.docDateMax}'`));
});
