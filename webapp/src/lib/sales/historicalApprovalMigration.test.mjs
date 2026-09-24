// ── ยามของ mig 0374 ใบสั่งขายย้อนหลังแบบ AE Sup อนุมัติ (มติเจ้าของ 22/09/2026) ─────────────
//
// ⭐ โมเดลใหม่แทน "เกิดเป็นอนุมัติแล้ว" ของ 0360:
//    ฝ่ายขายคีย์ใบเป็นร่าง (โซนจากทะเบียน · งวดยกมา · เอกสารแทนสัญญาในใบ) → ส่ง → AE Sup อนุมัติครั้งเดียว
//    (ออกเลข CT + ใบอนุมัติ + หยุดยอดงวด + รอบขายของโซน ในทรานแซกชันเดียว) → บัญชีรับรองงวดยกมา → TS ตั้งรอบ
//
// ⚠️ เทสต์นี้อ่าน **ตัวหนังสือ SQL** — พฤติกรรมจริงทดสอบด้วยฮาร์เนส PGlite (scratch · โหลด migration จริง
//    ทุกไฟล์ 0001–0372 แล้วรัน 0374 สามรอบ + ทุกเคสในแผน) และบล็อก "ลองก่อนรันจริง" บนหัวไฟล์ที่ผู้ดูแลรันใน
//    BEGIN…ROLLBACK · ยามที่นี่กันคนแก้ไฟล์ทีหลังแล้วลบด่านที่ฮาร์เนสพิสูจน์ไว้ทิ้งเงียบ ๆ
// ⚠️ ตัวเลข/รายการที่ JS ต้องตรงกับ SQL (role ผู้คีย์ · หมวดแพ็คเกจ) เทียบกับค่าคงที่ฝั่ง JS ตรง ๆ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as historicalOrders from './historicalOrders.js';
import { SERVICE_ROUND_CATEGORY } from './serviceOrders.js';
import { isSalesOrderReviewer } from './salesOrderWorkflow.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE_0374 = '0374_historical_so_approval_flow.sql';
const sqlFiles = () => readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const squeeze = (sql) => stripComments(sql).replace(/\s+/g, ' ').trim();

const RAW = read(FILE_0374);
const SQL = stripComments(RAW);
const HEADER = RAW.slice(0, RAW.indexOf('\nBEGIN;'));

/* ── ตัวช่วยอ่าน SQL (ลอกแพตเทิร์นจาก historicalSalesOrderMigration.test.mjs) ─────────────── */

/* นิยามในไฟล์ 0374 — ไฟล์นี้เป็นเจ้าของ ⇒ อ่านจากตัวไฟล์ตรง ๆ ไม่ใช่ "ล่าสุด" */
function fn(name) {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const from = SQL.indexOf(marker);
  assert.ok(from >= 0, `0374 ไม่มีนิยาม ${name}`);
  const to = SQL.indexOf('\n$$;', from);
  assert.ok(to > from, `หาปลายนิยาม ${name} ไม่เจอ`);
  return SQL.slice(from, to);
}

/* นิยามล่าสุดข้ามทุก migration (ไฟล์ใหม่กว่าทับ) — กันไฟล์ถัดไปแก้แล้วลืมด่าน */
function latestDefinitionOf(fnName) {
  const marker = `CREATE OR REPLACE FUNCTION public.${fnName}(`;
  const owning = sqlFiles().filter((name) => read(name).includes(marker));
  assert.ok(owning.length, `ต้องมี migration ที่นิยาม ${fnName}`);
  const file = owning[owning.length - 1];
  const sql = read(file);
  const from = sql.lastIndexOf(marker);
  const to = sql.indexOf('\n$$;', from);
  assert.ok(to > from, `หาปลายนิยาม ${fnName} ใน ${file} ไม่เจอ`);
  return { file, body: stripComments(sql.slice(from, to)) };
}

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

/* คอลัมน์ → ค่า ของ INSERT ตัวแรกเข้าตารางนั้น · ฝั่งค่า VALUES (…) หรือ SELECT … FROM (ตัดที่ FROM ชั้นนอกสุด)
   ชื่อกับค่าต้องนับได้เท่ากันเสมอ — เติมชื่อแล้วลืมค่า = migration พังตอนผู้ใช้รันมือ */
function insertPairs(body, table) {
  const start = body.indexOf(`INSERT INTO public.${table} (`);
  assert.ok(start >= 0, `หา INSERT INTO public.${table} ไม่เจอ`);
  const block = body.slice(start);
  const open = block.indexOf('(');
  const close = matchingParen(block, open);
  const cols = topLevelItems(block.slice(open, close + 1)).map((c) => c.replace(/"/g, ''));
  const rest = block.slice(close + 1).trimStart();
  let vals;
  if (/^VALUES/i.test(rest)) {
    const values = rest.replace(/^VALUES\s*/i, '');
    const o = values.indexOf('(');
    vals = topLevelItems(values.slice(o, matchingParen(values, o) + 1));
  } else {
    assert.match(rest, /^SELECT\b/i, `${table}: ฝั่งค่าต้องเป็น VALUES หรือ SELECT`);
    const select = rest.replace(/^SELECT\s*/i, '');
    let depth = 0; let quote = null; let end = -1;
    for (let i = 0; i < select.length; i += 1) {
      const ch = select[i];
      if (quote) { if (ch === quote) quote = null; continue; }
      if (ch === "'" || ch === '"') { quote = ch; continue; }
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (depth === 0 && /^FROM\b/i.test(select.slice(i, i + 5)) && /\s/.test(select[i - 1] || ' ')) { end = i; break; }
    }
    assert.ok(end > 0, `${table}: หา FROM ของ SELECT ไม่เจอ`);
    vals = topLevelItems(`(${select.slice(0, end)})`);
  }
  assert.equal(vals.length, cols.length, `${table}: INSERT มีชื่อคอลัมน์ ${cols.length} ตัว แต่ค่า ${vals.length} ตัว`);
  return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
}

const constraintBody = (name) => {
  const from = SQL.indexOf(`ADD CONSTRAINT ${name}`);
  assert.ok(from >= 0, `ไม่มี ADD CONSTRAINT ${name}`);
  return squeeze(SQL.slice(from, SQL.indexOf(';', from)));
};

const RPCS = {
  create_historical_sales_order: 'text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb',
  update_historical_sales_order: 'text, timestamptz, text, text, text, jsonb, jsonb, jsonb, jsonb',
  submit_historical_sales_order: 'text, timestamptz, text, text, text, jsonb',
  approve_historical_sales_order: 'text, timestamptz, text, text, text, text, text, uuid, text, text, integer',
};
const HELPERS = {
  historical_so_check_contract: 'jsonb',
  historical_so_check_lines: 'jsonb, text',
  historical_so_check_installments: 'jsonb, numeric, date, date',
  historical_so_write_children: 'text, jsonb, jsonb, numeric, text, text',
  historical_so_void_substitute_contract: '',
  historical_so_no_reopen: '',
};
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ── 1) ตัวไฟล์ ─────────────────────────────────────────────────────────────── */

test('0374: หัวไฟล์บอกเหตุผล · ลำดับรัน · วิธีลองแบบ ROLLBACK · คำสั่งตรวจหลังรัน · ทางถอย', () => {
  assert.match(HEADER, /มติเจ้าของ 22\/09/);
  assert.match(HEADER, /รันก่อน merge โค้ด JS/);
  assert.match(HEADER, /ห้ามคีย์ใบย้อนหลัง/, 'ต้องเตือนช่วงระหว่างรันถึง deploy');
  assert.match(HEADER, /ลองก่อนรันจริง/);
  assert.match(HEADER, /--\s+ROLLBACK;/);
  assert.match(HEADER, /ตรวจหลังรัน/);
  assert.match(HEADER, /has_function_privilege/);
  assert.match(HEADER, /to_regprocedure/, 'ต้องตรวจว่าฟังก์ชันเดิมถูก DROP จริง');
  // บล็อกลองจริงเดินครบสี่ขั้น + ลองยกเลิก/คืนร่างด้วย
  for (const step of ['create_historical_sales_order', 'update_historical_sales_order', 'submit_historical_sales_order',
    'approve_historical_sales_order', "status = 'cancelled'", "status = 'draft'"]) {
    assert.ok(HEADER.includes(step), `บล็อกลองจริงขาด ${step}`);
  }
  assert.match(RAW, /-- ── ถอยกลับ/);
});

test('0374: ทรานแซกชันเดียว แล้วสั่ง PostgREST โหลดสคีมาใหม่', () => {
  assert.match(SQL, /^BEGIN;/m);
  assert.match(SQL, /^COMMIT;/m);
  assert.ok(SQL.indexOf("NOTIFY pgrst, 'reload schema';") > SQL.indexOf('\nCOMMIT;'));
});

test('0374: รันซ้ำได้ — ทุกคำสั่งสร้างมี DROP … IF EXISTS นำหน้า', () => {
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
  assert.doesNotMatch(SQL, /DROP FUNCTION (?!IF EXISTS)/, 'DROP FUNCTION ต้อง IF EXISTS');
  assert.doesNotMatch(SQL, /\bCASCADE\b/, 'ห้าม DROP … CASCADE — ลากของที่ไม่ได้ตั้งใจหายไปด้วย');
  assert.doesNotMatch(SQL, /EXECUTE\s+format/i, 'DDL ผ่าน EXECUTE = ยามอ่านไม่เห็น');
});

test('0374: ไม่ backfill — นอกตัวฟังก์ชันไม่มี INSERT/UPDATE/DELETE · DO block เดียวคือด่านที่ SELECT อย่างเดียว', () => {
  const outsideBodies = SQL.replace(/\$\$[\s\S]*?\$\$/g, ' ');
  assert.doesNotMatch(outsideBodies, /\b(INSERT INTO|UPDATE|DELETE FROM)\s+public\./);
  const doBlocks = [...SQL.matchAll(/DO \$\$([\s\S]*?)\$\$;/g)].map((m) => m[1]);
  assert.equal(doBlocks.length, 1, 'DO block ต้องมีแค่ด่านข้อ 2');
  assert.doesNotMatch(doBlocks[0], /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/);
  assert.match(doBlocks[0], /RAISE EXCEPTION 'mig_0374_old_historical_rows_exist/);
  // ด่านอ่านคอลัมน์ที่ข้อ 1 เพิ่ม ⇒ ต้องมาหลังคอลัมน์เกิด
  assert.ok(SQL.indexOf('DO $$') > SQL.indexOf('ADD COLUMN IF NOT EXISTS "serviceZoneId"'));
  assert.match(squeeze(doBlocks[0]), /o\."paymentGateExemptAt" IS NOT NULL OR NOT EXISTS \( ?SELECT 1 FROM public\.sales_order_lines l WHERE l\."salesOrderId" = o\.id AND l\."serviceZoneId" IS NOT NULL ?\)/);
});

test('0374: ไม่มีข้อความที่ทำให้ยามตัวอื่นอ่านนิยามผิดไฟล์', () => {
  // serviceRoundsCopyPaths / soPendingApprovalMigration / historicalSalesOrderMigration ถือว่าไฟล์ที่มีข้อความนี้
  // (แม้ในคอมเมนต์) เป็นเจ้าของนิยามล่าสุด
  for (const name of ['create_sales_order_draft', 'revise_approved_sales_order_atomic', 'sync_sales_order_actual',
    'enforce_sales_order_actual_on_deal', 'sales_order_actual_trigger', 'approve_external_sales_contract',
    'guard_record_origin_immutable', 'snapshot_sales_order_owner']) {
    assert.ok(!RAW.includes(`FUNCTION public.${name}`), `0374 ห้ามมีข้อความ FUNCTION public.${name}`);
  }
});

test('⛔ 0374 ไม่นิยามตัวคำนวณ Actual ใหม่ และไม่แตะ trigger เดิมของ sales_orders/sales_deals', () => {
  for (const name of ['sync_sales_order_actual', 'enforce_sales_order_actual_on_deal', 'sales_order_actual_trigger',
    'snapshot_sales_order_owner', 'guard_record_origin_immutable', 'normalize_sales_order_revision_identity',
    'clear_inactive_sales_order_signature_evidence_pointer', 'approve_external_sales_contract']) {
    assert.ok(latestDefinitionOf(name).file !== FILE_0374, `${name} ต้องไม่ถูกนิยามใหม่ใน 0374`);
  }
  const touched = [...SQL.matchAll(/(?:CREATE|DROP|ALTER)\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?([a-z0-9_]+)/gi)].map((m) => m[1]);
  assert.deepEqual([...new Set(touched)].sort(), [
    'sales_orders_historical_no_reopen', 'sales_orders_historical_void_contract_del', 'sales_orders_historical_void_contract_upd',
  ]);
  assert.doesNotMatch(SQL, /(?:DISABLE|ENABLE)(?:\s+REPLICA|\s+ALWAYS)?\s+TRIGGER/i);
});

/* ── 2) สคีมา ──────────────────────────────────────────────────────────────── */

test('บรรทัด: serviceZoneId ชี้ทะเบียนโซนแบบ RESTRICT + index เฉพาะแถวที่มีค่า', () => {
  assert.ok(squeeze(SQL).includes(
    'ALTER TABLE public.sales_order_lines ADD COLUMN IF NOT EXISTS "serviceZoneId" text REFERENCES public.service_zones(id) ON DELETE RESTRICT;',
  ));
  assert.ok(squeeze(SQL).includes(
    'CREATE INDEX sales_order_lines_service_zone_idx ON public.sales_order_lines ("serviceZoneId") WHERE "serviceZoneId" IS NOT NULL;',
  ));
});

test('งวด: ชนิด regular|opening · งวดยกมามีช่วงครอบและไม่มีวันครบกำหนด · ใบละงวดยกมาเดียว', () => {
  assert.ok(squeeze(SQL).includes(`ALTER TABLE public.sales_order_installments ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'regular';`));
  assert.ok(constraintBody('sales_order_installments_kind_check').includes(`CHECK (kind IN ('regular', 'opening'))`));
  assert.ok(constraintBody('sales_order_installments_opening_shape').includes(
    `CHECK ( kind <> 'opening' OR ("coversFrom" IS NOT NULL AND "coversTo" IS NOT NULL AND "dueDate" IS NULL) )`,
  ));
  assert.ok(squeeze(SQL).includes(
    `CREATE UNIQUE INDEX sales_order_installments_opening_uk ON public.sales_order_installments ("salesOrderId") WHERE kind = 'opening';`,
  ));
});

test("เอกสารแทนสัญญา: เพิ่ม 'signed_quotation' โดยชนิดเดิมอยู่ครบ", () => {
  const body = constraintBody('sales_contracts_external_kind');
  assert.ok(body.includes(`"externalDocKind" IN ('customer_po', 'email', 'paper_contract', 'signed_quotation', 'other')`));
  assert.ok(body.includes(`(source = 'generated' AND "externalDocKind" IS NULL)`));
  // ตัวตรวจของ RPC ต้องรับชุดเดียวกับ CHECK — หลวมกว่า = 23514 ดิบ · แน่นกว่า = ชนิดที่หน้าสัญญารับแต่ใบย้อนหลังไม่รับ
  assert.ok(squeeze(fn('historical_so_check_contract'))
    .includes(`v_kind NOT IN ('customer_po', 'email', 'paper_contract', 'signed_quotation', 'other')`));
});

test('ใบสั่งขาย: CHECK ใหม่ — สายย้อนหลังยอมร่าง/รออนุมัติ/ตีกลับ · ร่องรอยอนุมัติผูกกับ approved · ยกเว้นด่านเงินต้องว่าง', () => {
  const body = constraintBody('sales_orders_origin_shape');
  const at = body.indexOf(") OR ( origin = 'historical'");
  assert.ok(at > 0);
  const historical = body.slice(at);
  for (const piece of [
    "status IN ('draft', 'pending_approval', 'rejected', 'approved', 'cancelled')",
    `(status <> 'approved' OR ("approvedAt" IS NOT NULL AND "approvedBy" IS NOT NULL))`,
    `(status NOT IN ('draft', 'pending_approval', 'rejected') OR ("approvedAt" IS NULL AND "approvedBy" IS NULL))`,
    `(status <> 'pending_approval' OR "submittedAt" IS NOT NULL)`,
    `"approvalMode" IN ('standard', 'admin_override')`,
    '"financeStatus" IS NULL', '"signatureEvidenceId" IS NULL', '"proposerSignatureEvidenceId" IS NULL',
    '"paymentGateExemptAt" IS NULL', '"historicalIntakeHash" IS NOT NULL', '"revisionNo" = 0',
  ]) {
    assert.ok(historical.includes(piece), `สายย้อนหลังขาด ${piece}`);
  }
  // CHECK ต้องถูกแทนก่อนมีฟังก์ชันไหนเขียนสถานะใหม่ (ลำดับในไฟล์ = ลำดับตอนรัน)
  assert.ok(SQL.indexOf('ADD CONSTRAINT sales_orders_origin_shape') < SQL.indexOf('CREATE OR REPLACE FUNCTION public.create_historical_sales_order('));
});

test('ฟังก์ชันของโมเดลเดิม 4 ตัวถูก DROP ด้วยลายเซ็นตรงตัว', () => {
  for (const sig of [
    'create_historical_sales_order(text, text, text, text, text, jsonb, jsonb, jsonb, jsonb)',
    'append_historical_installments(text, text, text, text, jsonb)',
    'historical_so_installments_total(jsonb)',
    'remove_historical_sales_order_line(text, text, text, text, text)',
  ]) {
    assert.ok(SQL.includes(`DROP FUNCTION IF EXISTS public.${sig};`), sig);
  }
  // ตัวสร้างใบตัวใหม่มี 10 อาร์กิวเมนต์ — ถ้าลายเซ็นเท่าตัวเดิม DROP จะลบตัวใหม่ทิ้งตอนรันซ้ำ
  assert.equal(topLevelItems(`(${RPCS.create_historical_sales_order})`).length, 10);
});

/* ── 3) สิทธิ์ ──────────────────────────────────────────────────────────────── */

test('🔐 RPC 4 ตัว: REVOKE จาก PUBLIC/anon/authenticated + GRANT service_role · SECURITY DEFINER ตรึง search_path', () => {
  for (const [name, args] of Object.entries(RPCS)) {
    const sig = `public.${name}(${args})`;
    assert.match(SQL, new RegExp(`REVOKE ALL ON FUNCTION ${escape(sig)}\\s+FROM PUBLIC, anon, authenticated;`), name);
    assert.match(SQL, new RegExp(`GRANT EXECUTE ON FUNCTION ${escape(sig)}\\s+TO service_role;`), name);
    assert.match(fn(name), /SECURITY DEFINER\s+SET search_path = public/, name);
  }
});

test('🔐 ตัวตรวจกลาง + ฟังก์ชัน trigger: REVOKE ทุกบทบาทรวม service_role · ไม่มี GRANT ใดเอ่ยชื่อ', () => {
  for (const [name, args] of Object.entries(HELPERS)) {
    const sig = `public.${name}(${args})`;
    assert.match(SQL, new RegExp(`REVOKE ALL ON FUNCTION ${escape(sig)}\\s+FROM PUBLIC, anon, authenticated, service_role;`), name);
    assert.doesNotMatch(SQL, new RegExp(`GRANT[^;]*${name}`), `${name} ห้ามมี GRANT`);
    assert.match(fn(name), /SET search_path = public/, `${name}: ต้องตรึง search_path`);
  }
  const grants = [...SQL.matchAll(/GRANT EXECUTE ON FUNCTION public\.([a-z0-9_]+)\(/g)].map((m) => m[1]).sort();
  assert.deepEqual(grants, Object.keys(RPCS).sort(), 'GRANT ได้เฉพาะ RPC 4 ตัว');
  // ฟังก์ชัน trigger ที่เขียนตารางอื่น (สัญญา) ต้องรันเป็นเจ้าของ — ไม่พึ่งสิทธิ์ของคนที่ยกเลิก/ลบใบ
  assert.match(fn('historical_so_void_substitute_contract'), /SECURITY DEFINER\s+SET search_path = public/);
  // ทุกฟังก์ชันที่ไฟล์นี้สร้างต้องอยู่ในสองกลุ่มนี้ (เพิ่มฟังก์ชันแล้วลืมตัดสินสิทธิ์ = แดง)
  const created = [...SQL.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(/g)].map((m) => m[1]).sort();
  assert.deepEqual(created, [...Object.keys(RPCS), ...Object.keys(HELPERS)].sort());
});

/* ── 4) role literal = ค่าคงที่ฝั่ง JS ──────────────────────────────────────────── */

/* ผู้คีย์ = ฝ่ายขายทุกตำแหน่ง + Admin (มติ 22/09) — ค่าคงที่ฝั่ง JS (HISTORICAL_KEYER_ROLES) ต้องเท่ากับ
   รายการที่ตรึงไว้ที่นี่ทุกตัวและทุกลำดับ แล้วฐานต้องใช้ชุดเดียวกัน */
const KEYER_ROLES_0374 = ['ae', 'ac', 'senior_ae', 'ae_supervisor', 'admin'];

test('role ผู้คีย์ใน RPC สร้าง/แก้/ส่ง: 0374 เขียน literal ไว้ · 0382 ปะเป็นฟังก์ชันกลาง (ผังตำแหน่ง 2026-09-24)', () => {
  const expected = historicalOrders.HISTORICAL_KEYER_ROLES;
  assert.ok(Array.isArray(expected), 'historicalOrders.js ต้อง export HISTORICAL_KEYER_ROLES');
  /* ⭐ 0374 เป็นประวัติ — ข้อความในไฟล์ต้องคงเดิมทุกตัวอักษร เพราะ 0382 หาเงื่อนไขนี้ด้วยการเทียบตัวอักษรแล้วแทนด้วย
     `public.is_sales_keyer_role(p_actor_role)` · ชุดผู้คีย์ปัจจุบันอยู่ที่ฟังก์ชันกลาง (เทียบกับ JS ที่
     salesRoleSqlParity.test.mjs) */
  const literal = `COALESCE(p_actor_role, '') NOT IN (${KEYER_ROLES_0374.map((r) => `'${r}'`).join(', ')})`;
  for (const name of ['create_historical_sales_order', 'update_historical_sales_order', 'submit_historical_sales_order']) {
    const body = fn(name);
    assert.ok(body.includes(literal), `${name}: ข้อความเงื่อนไขของ 0374 ต้องคงเดิม (0382 ปะด้วยการเทียบตัวอักษร)`);
    assert.ok(body.indexOf(literal) < body.indexOf('FOR UPDATE') || !body.includes('FOR UPDATE'), `${name}: ตรวจสิทธิ์ก่อนล็อก/อ่าน`);
  }
  // ผังตำแหน่งใหม่ขยายผู้คีย์ ไม่ได้ตัดใครออก — ทุกตำแหน่งที่คีย์ได้ตั้งแต่ 0374 ต้องยังคีย์ได้
  for (const role of KEYER_ROLES_0374) assert.ok(expected.includes(role), role);
});

test('role ผู้อนุมัติใน RPC อนุมัติ = isSalesOrderReviewer (AE Supervisor / Admin)', () => {
  const body = fn('approve_historical_sales_order');
  const m = /COALESCE\(p_actor_role, ''\) NOT IN \(([^)]*)\)/.exec(body);
  assert.ok(m, 'ต้องมีด่าน role ผู้อนุมัติ');
  const approvers = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  for (const role of ['ae', 'ac', 'senior_ae', 'ae_supervisor', 'admin', 'finance', 'ts']) {
    assert.equal(approvers.includes(role), isSalesOrderReviewer(role), role);
  }
  assert.ok(body.indexOf(m[0]) < body.indexOf('FOR UPDATE'), 'ตรวจ role ก่อนล็อกใบ');
});

test("หมวดแพ็คเกจใน check_lines = SERVICE_ROUND_CATEGORY ('02-001') · อ่านแบบ categoryOf (คู่ตัวเลข NN-NNN แรก)", () => {
  const body = fn('historical_so_check_lines');
  assert.equal(SERVICE_ROUND_CATEGORY, '02-001');
  assert.ok(body.includes(`substring(p."fgCode" from '(\\d{2}-\\d{3})') = '${SERVICE_ROUND_CATEGORY}'`));
  assert.match(body, /RAISE EXCEPTION 'historical_so_line_not_package'/);
});

/* ── 5) ตัวตรวจกลาง ────────────────────────────────────────────────────────── */

test('check_lines: โซนเท่าด่าน bindTargetError · โซนซ้ำ · จำนวนแพ็คเป็นจำนวนเต็ม', () => {
  const body = squeeze(fn('historical_so_check_lines'));
  for (const piece of [
    'z."isActive" AND s."isActive"', `s.kind = 'customer'`, 's."customerId" = p_customer_id',
    `RAISE EXCEPTION 'historical_so_zone_invalid'`, 'v_zone_id = ANY (v_seen)', `RAISE EXCEPTION 'historical_so_zone_duplicate'`,
    'v_qty <> trunc(v_qty)', `RAISE EXCEPTION 'historical_so_lines_required'`,
  ]) {
    assert.ok(body.includes(piece), `check_lines ขาด ${piece}`);
  }
});

test('check_installments: งวดยกมา ≤ 1 เริ่มที่วันเริ่มสัญญา มีวันรับเงิน · งวดปกติต้องมีวันครบกำหนด · ผลรวม · ช่วงครอบต่อกันพอดี', () => {
  const body = squeeze(fn('historical_so_check_installments'));
  for (const piece of [
    'v_openings > 1', 'v_from IS DISTINCT FROM p_start', 'v_to > p_end', 'v_due IS NOT NULL',
    'v_paid IS NULL', 'v_paid > v_today', 'v_due IS NULL OR v_from IS NULL OR v_to IS NULL',
    `p_total = 0 AND v_count > 0 THEN RAISE EXCEPTION 'historical_so_zero_value_has_installments'`,
    `p_total > 0 AND (v_count = 0 OR abs(v_sum - p_total) > 0.01) THEN RAISE EXCEPTION 'historical_so_installment_sum_mismatch'`,
    `IF v_span.f IS DISTINCT FROM v_expect THEN RAISE EXCEPTION 'historical_so_coverage_broken'`,
    'v_expect := v_span.t + 1', `IF v_expect - 1 IS DISTINCT FROM p_end THEN RAISE EXCEPTION 'historical_so_coverage_broken'`,
  ]) {
    assert.ok(body.includes(piece), `check_installments ขาด ${piece}`);
  }
  // "วันนี้" ของด่านต้องเป็นเวลาไทย (กติกาทั้งระบบ)
  assert.ok(body.includes(`timezone('Asia/Bangkok', now())::date`));
});

test('check_contract: วันเริ่มไม่เกินวันนี้ (เวลาไทย) · วันเริ่มไม่เกินวันสิ้นสุด · เลขอ้างอิง ≤ CHECK ของสัญญา', () => {
  const body = squeeze(fn('historical_so_check_contract'));
  assert.ok(body.includes(`v_start > timezone('Asia/Bangkok', now())::date`));
  assert.ok(body.includes('v_start > v_end'));
  assert.ok(body.includes('COALESCE(length(v_ref), 0) > 200'));
  assert.match(read('0322_contract_external_source.sql'), /length\("externalRef"\) <= 200/);
});

test('write_children: ด่านของตัวเองมาก่อน DELETE ตัวแรก · ไม่แตะรอบขาย · งวดยังไม่หยุดยอด', () => {
  const body = fn('historical_so_write_children');
  const guard = body.indexOf("RAISE EXCEPTION 'historical_so_edit_state_invalid'");
  const firstDelete = body.indexOf('DELETE FROM');
  assert.ok(guard > 0 && firstDelete > guard, 'ด่านต้องมาก่อนลบ');
  const guardBlock = squeeze(body.slice(0, guard));
  for (const piece of [
    'FOR UPDATE', `v_order.origin IS DISTINCT FROM 'historical'`, `v_order.status NOT IN ('draft', 'rejected')`,
    'FROM public.service_zone_terms t WHERE t."salesOrderId" = p_order_id', 'i."frozenAt" IS NOT NULL',
  ]) {
    assert.ok(guardBlock.includes(piece), `ด่าน write_children ขาด ${piece}`);
  }
  assert.ok(!/INSERT INTO public\.service_zone_terms|UPDATE public\.service_zone_terms/.test(body));
  const lines = insertPairs(body, 'sales_order_lines');
  assert.equal(lines.fgCode, 'p."fgCode"', 'รหัส FG จากทะเบียนสินค้า');
  assert.equal(lines.serviceZoneId, 'z.id');
  assert.match(lines.description, /p\."productDescription"/);
  assert.ok(!Object.keys(lines).some((c) => c.startsWith('site')), 'ห้ามเขียนธง "ไม่พบจุด" ของ 0362');
  const inst = insertPairs(body, 'sales_order_installments');
  assert.equal(inst.frozenAt, 'NULL');
  assert.equal(inst.status, "'pending'");
  assert.match(inst.label, /'งวดยกมา'/);
  assert.ok(!('reportedAt' in inst) && !('confirmedAt' in inst));
  // JOIN ทิ้งบรรทัดเงียบ ๆ ได้ ⇒ ต้องนับให้ครบ
  assert.match(body, /GET DIAGNOSTICS v_inserted = ROW_COUNT;\s+IF v_inserted <> jsonb_array_length\(p_lines\)/);
  assert.ok(!body.includes('master_row_'));
});

/* ── 6) RPC ─────────────────────────────────────────────────────────────────── */

test('create: ใบเกิดเป็นร่าง · ไม่แตะรอบขาย/สถานะบัญชี/ฉบับตรึง · FG จากทะเบียน (ผ่านตัวเขียนกลาง)', () => {
  const body = fn('create_historical_sales_order');
  const order = insertPairs(body, 'sales_orders');
  assert.equal(order.status, "'draft'");
  assert.equal(order.approvedAt, 'NULL');
  assert.equal(order.approvedBy, 'NULL');
  assert.equal(order.financeStatus, 'NULL');
  assert.equal(order.orderDate, 'v_start', 'วันที่ใบ = วันเริ่มสัญญา');
  assert.equal(order.serviceContractId, 'v_contract.id');
  for (const banned of ['service_zone_terms', "'confirmed'", 'capture_issued_sales_order_snapshot', 'master_row_', 'paymentGateExempt']) {
    assert.ok(!body.includes(banned), `create ห้ามมี ${banned}`);
  }
  assert.ok(!body.includes('p_lines->>') && !/e\.l->>'fgCode'/.test(body), 'FG ห้ามรับจาก payload');
  assert.match(body, /PERFORM public\.historical_so_write_children\(/);
  // สัญญาต้องเกิดก่อนหัวใบ (FK serviceContractId) และเกิดเป็นร่าง external ของดีลภาชนะ
  assert.ok(body.indexOf('INSERT INTO public.sales_contracts') < body.indexOf('INSERT INTO public.sales_orders'));
  const contract = insertPairs(body, 'sales_contracts');
  assert.equal(contract.status, "'draft'");
  assert.equal(contract.source, "'external'");
  assert.equal(contract.kind, "'service'");
  assert.equal(contract.team, 'v_deal.team');
  assert.equal(contract.ownerId, 'v_deal."ownerId"');
  assert.match(contract.metadata, /'historicalSalesOrderId', v_order_id/);
  assert.ok(!('contractNo' in contract), 'เลข CT ออกตอน AE Sup อนุมัติเท่านั้น');
});

test('update: ล็อก → สถานะ → updatedAt · ลูกค้า/AE ล็อก · สัญญาต้องเป็นร่างของใบนี้ · ตีกลับพลิกเป็นร่าง', () => {
  const body = fn('update_historical_sales_order');
  const lock = body.indexOf('FOR UPDATE');
  const state = body.indexOf("RAISE EXCEPTION 'historical_so_edit_state_invalid'");
  const stale = body.indexOf("RAISE EXCEPTION 'workflow_stale'");
  assert.ok(lock > 0 && state > lock && stale > state);
  assert.match(body, /RAISE EXCEPTION 'historical_so_owner_locked'/);
  assert.match(squeeze(body), /v_contract\.metadata->>'historicalSalesOrderId' IS DISTINCT FROM v_order\.id THEN RAISE EXCEPTION 'historical_so_contract_state_invalid'/);
  assert.match(squeeze(body), /UPDATE public\.sales_orders SET [\s\S]*status = 'draft'/);
  // ร่องรอยตีกลับอยู่จนกว่าจะส่งใหม่ (ฟอร์มโชว์เหตุผล) — ขั้นส่งเป็นคนล้าง
  assert.ok(!body.includes('"rejectionReason" = NULL'));
});

test('submit: ล้าง "rejectionReason" (คอลัมน์ของใบ) · ไม่เอ่ย "rejectedReason" (คอลัมน์ของงวด) · ไฟล์สัญญา + หลักฐานงวดยกมาบังคับ', () => {
  const body = fn('submit_historical_sales_order');
  for (const col of ['rejectedAt', 'rejectedBy', 'rejectedByName', 'rejectionReason']) {
    assert.ok(body.includes(`"${col}" = NULL`), `ต้องล้าง ${col}`);
  }
  assert.ok(!body.includes('rejectedReason'), '"rejectedReason" เป็นคอลัมน์ของงวด (0245) ไม่ใช่ของใบ (0107)');
  const replay = body.indexOf("'replayed', true");
  assert.ok(replay > 0 && replay < body.indexOf("RAISE EXCEPTION 'workflow_stale'"), 'ส่งซ้ำ (คนเดิม) ต้องมาก่อนด่าน updatedAt');
  assert.match(squeeze(body), /a\."entityType" = 'contract' AND a\."entityId" = v_contract\.id AND a\."docType" = 'external_doc'/);
  assert.match(body, /RAISE EXCEPTION 'historical_so_contract_file_missing'/);
  assert.match(body, /RAISE EXCEPTION 'historical_so_opening_evidence_missing'/);
  assert.match(body, /public\.historical_so_check_installments\(/);
  for (const banned of ['signatureEvidenceId', 'proposerSignatureEvidenceId', 'service_zone_terms']) {
    assert.ok(!body.includes(banned), `submit ห้ามมี ${banned}`);
  }
});

test('approve: กดซ้ำก่อนด่าน updatedAt · ด่านอนุมัติตัวเองก่อนเขียน · ไฟล์ที่ AE Sup เห็น · สัญญาก่อนใบ', () => {
  const body = fn('approve_historical_sales_order');
  const replay = body.indexOf(`IF v_order.status = 'approved' AND v_order."approvedBy" = p_actor_id THEN`);
  const stale = body.indexOf("RAISE EXCEPTION 'workflow_stale'");
  assert.ok(replay > 0 && replay < stale, 'กดซ้ำโดยผู้อนุมัติคนเดิมต้องมาก่อนด่าน updatedAt');
  const self = body.indexOf("RAISE EXCEPTION 'historical_so_self_approval'");
  const firstWrite = Math.min(...['UPDATE public.', 'INSERT INTO public.', 'PERFORM public.approve_external_sales_contract(']
    .map((w) => body.indexOf(w)).filter((i) => i >= 0));
  assert.ok(self > 0 && self < firstWrite, 'ด่านอนุมัติตัวเองต้องมาก่อนเขียนอะไรทั้งนั้น');
  assert.match(squeeze(body), /v_self AND p_actor_role <> 'admin' THEN RAISE EXCEPTION 'historical_so_self_approval'/);
  assert.match(body, /v_mode := CASE WHEN v_self THEN 'admin_override' ELSE 'standard' END;/);
  // ไฟล์ = ไฟล์แนบชนิด external_doc ของสัญญาใบนี้ (ด่านเดียวกับ route อนุมัติเอกสารแทนสัญญา)
  const file = body.indexOf("RAISE EXCEPTION 'historical_so_signed_file_invalid'");
  assert.ok(file > 0 && file < firstWrite);
  assert.match(squeeze(body), /a\.id = p_signed_file_id AND a\."entityType" = 'contract' AND a\."entityId" = v_contract\.id AND a\."docType" = 'external_doc'/);
  assert.match(squeeze(body), /'signedFileId', p_signed_file_id/);
  const external = body.indexOf('PERFORM public.approve_external_sales_contract(');
  const orderUpdate = body.indexOf('UPDATE public.sales_orders SET');
  assert.ok(external > 0 && orderUpdate > external, 'สัญญาลงนามก่อนใบอนุมัติ');
  // ตัวออกเลขทิ้งคีย์เงียบ ๆ ⇒ อ่านกลับมาตรวจ (สถานะ · เลข · ไฟล์)
  assert.match(squeeze(body.slice(external, orderUpdate)), /v_contract\.status IS DISTINCT FROM 'signed' OR v_contract\."contractNo" IS NULL OR v_contract\."signedFileId" IS DISTINCT FROM p_signed_file_id/);
  // ตรวจซ้ำจากแถวที่เก็บจริงก่อนเขียน
  for (const check of ['public.historical_so_check_lines(', 'public.historical_so_check_installments(']) {
    const at = body.indexOf(check);
    assert.ok(at > 0 && at < firstWrite, `${check} ต้องมาก่อนเขียน`);
  }
});

test('approve: หยุดยอดงวดดันเฉพาะ pending ที่มีวันรับเงิน + หลักฐาน เป็น reported · ไม่มี confirmed · รอบขายจากบรรทัด', () => {
  const body = fn('approve_historical_sales_order');
  const freeze = squeeze(body.slice(body.indexOf('UPDATE public.sales_order_installments i SET'), body.indexOf('INSERT INTO public.service_zone_terms')));
  assert.ok(freeze.includes('"frozenAt" = now()'));
  const promote = `CASE WHEN i.status = 'pending' AND i."paidOn" IS NOT NULL AND jsonb_array_length(i.evidence) > 0 THEN 'reported' ELSE i.status END`;
  assert.ok(freeze.includes(`status = ${promote}`), 'ต้องดันเฉพาะงวดที่มีวันรับเงิน + หลักฐาน');
  assert.ok(freeze.includes('i."frozenAt" IS NULL'), 'หยุดยอดเฉพาะแถวที่ยังไม่หยุด');
  for (const col of ['amount', 'label', 'percent']) assert.ok(!freeze.includes(`${col} =`), `ห้ามแตะ ${col}`);
  assert.ok(!body.includes("'confirmed'"), 'ขั้นอนุมัติห้ามข้ามบัญชีไปรับรองเอง');
  const terms = insertPairs(body, 'service_zone_terms');
  assert.equal(terms.zoneId, 'l."serviceZoneId"');
  assert.equal(terms.salesOrderLineId, 'l.id');
  assert.equal(terms.packageQty, 'l.qty');
  assert.match(body.slice(body.indexOf('INSERT INTO public.service_zone_terms')), /FROM public\.sales_order_lines l\s+WHERE l\."salesOrderId" = v_order\.id/);
});

test('⭐ approve ไม่นับ Actual: ไม่เขียน actualAmount / financeStatus / หลักฐานลายเซ็น / ฉบับตรึง / ตัวหยุดยอดของสาย pipeline', () => {
  const body = fn('approve_historical_sales_order');
  for (const banned of ['"actualAmount" =', '"financeStatus" =', '"signatureEvidenceId"', '"proposerSignatureEvidenceId"',
    'capture_issued_sales_order_snapshot', 'freeze', 'master_row_']) {
    assert.ok(!body.includes(banned), `approve ห้ามมี ${banned}`);
  }
});

test('create/approve: ด่าน role มาก่อนล็อก · ส่งซ้ำได้ใบเดิม (ไม่ออกเลขใหม่)', () => {
  const create = fn('create_historical_sales_order');
  assert.ok(create.indexOf("RAISE EXCEPTION 'historical_so_actor_forbidden'") < create.indexOf('pg_advisory_xact_lock('));
  assert.ok(create.indexOf("'replayed', true") < create.indexOf('sales_order_number_counters'), 'ส่งซ้ำต้องตอบก่อนออกเลข');
  assert.match(squeeze(create), /v_existing\.status = 'cancelled' THEN RAISE EXCEPTION 'historical_so_intake_key_conflict'/);
  // id สัญญาแน่นอนตามรหัสการคีย์ — ชนแถวที่ค้างจากใบที่ถูกลบ = ชื่อ error ของคำขอชนกัน ไม่ใช่ 23505
  assert.match(create, /v_contract_id := 'CTR-H' \|\| substr\(md5\(p_intake_key \|\| ':contract'\), 1, 16\);/);
});

/* ── 7) trigger ─────────────────────────────────────────────────────────────── */

test('trigger ยกเลิกเอกสารแทนสัญญา: ยิงเฉพาะใบย้อนหลัง (ยกเลิก/ลบ) · กันสัญญาที่ใบอื่นที่ยังไม่ยกเลิกผูกอยู่', () => {
  const sq = squeeze(SQL);
  assert.ok(sq.includes(
    'CREATE TRIGGER sales_orders_historical_void_contract_upd AFTER UPDATE OF status ON public.sales_orders FOR EACH ROW '
    + "WHEN (NEW.origin = 'historical' AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled') "
    + 'EXECUTE FUNCTION public.historical_so_void_substitute_contract();',
  ));
  assert.ok(sq.includes(
    'CREATE TRIGGER sales_orders_historical_void_contract_del BEFORE DELETE ON public.sales_orders FOR EACH ROW '
    + "WHEN (OLD.origin = 'historical') EXECUTE FUNCTION public.historical_so_void_substitute_contract();",
  ));
  const body = squeeze(fn('historical_so_void_substitute_contract'));
  for (const piece of [
    `c.source = 'external'`, `WHERE c.metadata->>'historicalSalesOrderId' = v_row.id`, `c.status IN ('draft', 'signed')`,
    `NOT EXISTS ( SELECT 1 FROM public.sales_orders o WHERE o."serviceContractId" = c.id AND o.id <> v_row.id AND o.status <> 'cancelled' )`,
  ]) {
    assert.ok(body.includes(piece), `trigger ยกเลิกสัญญาขาด ${piece}`);
  }
  /* 🔴 **ตามหาด้วยตัวชี้กลับเท่านั้น ห้ามผูกกับลิงก์ปัจจุบันของใบ** — ใครถอดสัญญาออกจากใบก่อนแล้วค่อยยกเลิก/ลบใบ
     trigger จะหาไม่เจอ แล้วทิ้งเอกสาร signed ที่ถือเลข CT ค้างเป็น "มีผล" โดยไม่มีใบเป็นเจ้าของ (R1) */
  assert.ok(!body.includes('c.id = v_row."serviceContractId"'),
    'เงื่อนไขหลักต้องเป็นตัวชี้กลับ ไม่ใช่ c.id = v_row."serviceContractId"');
  /* เหตุผลการยกเลิกต้องมีเลขใบ — ตัวอ่านผลฝั่ง JS (historicalContractVoided) ใช้ยืนยันว่าเอกสารถูกยกเลิก
     *ตามใบนี้* ในกรณีที่ใบไม่ได้ชี้เอกสารอยู่แล้ว (ไม่มีภาพก่อนหน้าให้เทียบ) */
  assert.ok(body.includes(`"cancelReason" = left('ใบสั่งขายย้อนหลัง ' || v_row."orderNumber"`),
    'เหตุผลการยกเลิกต้องมีเลขใบ');
  assert.ok(!body.includes('DELETE FROM'), 'ยกเลิก ไม่ใช่ลบ — เลข CT ที่ออกแล้วต้องอยู่ในทะเบียน');
});

test('trigger ห้ามคืนร่าง: ใบย้อนหลังที่อนุมัติ/ยกเลิกแล้ว กลับไปร่าง/รออนุมัติ/ตีกลับไม่ได้', () => {
  assert.ok(squeeze(SQL).includes(
    'CREATE TRIGGER sales_orders_historical_no_reopen BEFORE UPDATE OF status ON public.sales_orders FOR EACH ROW '
    + "WHEN (OLD.origin = 'historical' AND OLD.status IN ('approved', 'cancelled') AND NEW.status IN ('draft', 'pending_approval', 'rejected')) "
    + 'EXECUTE FUNCTION public.historical_so_no_reopen();',
  ));
  assert.match(fn('historical_so_no_reopen'), /RAISE EXCEPTION 'historical_so_reopen_forbidden/);
});
